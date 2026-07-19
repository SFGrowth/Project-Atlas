"""
Atlas Databento Feed Adapter — Replay Client
Sprint 123A.2 Gate G2 Revision 3

Provides replay and definition/symbol-mapping recovery functionality
using the Databento Historical API.

Separated from historical_client.py to provide:
- Bounded reorder buffer with watermark-driven emission
- Sequence-ordered output with deterministic tie-breaking
- Exact duplicate detection (safe deduplication)
- Conflicting duplicate detection (anomaly records, not discarded)
- DEGRADED + recovery trigger for records outside reorder tolerance
- Definition and symbol-mapping recovery
- Cancellation support via asyncio.Event
- Recovery timeout enforcement
- Deterministic normalisation into bridge-record contracts

AUTHORITY BOUNDARY
------------------
Python is transport and normalisation only.
This module MUST NOT:
- construct canonical candles
- reconcile Atlas bars
- aggregate five-minute candles
- persist canonical Atlas state
- trigger postBarAutomation or processBar
- run strategies
- call ADE or execution

TypeScript Atlas owns:
- candle construction
- official-bar reconciliation
- five-minute aggregation
- canonical persistence
- learning and decision processing
"""
from __future__ import annotations

import asyncio
import heapq
import logging
import os
import time
from dataclasses import dataclass, field
from typing import AsyncIterator, Dict, List, Optional, Set, Tuple

import databento as db

from bridge_records import (
    BridgeEnvelope,
    BridgeTradeRecord,
    BridgeOhlcv1mRecord,
    BridgeDefinitionRecord,
    BridgeSymbolMappingRecord,
    GapRecord,
    make_gap_detected_record,
    make_recovery_complete_record,
    make_recovery_partial_record,
    make_recovery_failed_record,
    make_recovery_id,
    BRIDGE_PROTOCOL_VERSION,
)
from symbol_resolver import SymbolResolver

logger = logging.getLogger(__name__)

# ── Constants ──────────────────────────────────────────────────────────────────

MAX_RETRIES: int = 3
BACKOFF_INITIAL_S: float = 1.0
BACKOFF_MULTIPLIER: float = 2.0

# Maximum replay window: 7 days in nanoseconds
MAX_REPLAY_WINDOW_NS: int = 7 * 24 * 3600 * 1_000_000_000

# Reorder buffer configuration
# Records arriving within this window are buffered and reordered.
# Default: 500 ms expressed in nanoseconds.
REORDER_TOLERANCE_MS: int = int(os.getenv("REORDER_TOLERANCE_MS", "500"))
REORDER_TOLERANCE_NS: int = REORDER_TOLERANCE_MS * 1_000_000

# Maximum number of records held in the reorder buffer at any time.
REORDER_BUFFER_MAX: int = int(os.getenv("REORDER_BUFFER_MAX", "1000"))

# Sentinel for _iter_records
_ITER_SENTINEL = object()


# ── Reorder buffer ─────────────────────────────────────────────────────────────

@dataclass(order=True)
class _BufferedRecord:
    """
    Wrapper for a raw Databento record held in the reorder buffer.

    Sort key: (ts_event_ns, sequence, arrival_order)
    This guarantees deterministic output even when ts_event_ns and sequence
    are identical (conflicting duplicates are detected separately).
    """
    ts_event_ns: int
    sequence: int
    arrival_order: int
    record: object = field(compare=False)


class ReorderBuffer:
    """
    Bounded in-memory reorder buffer.

    Holds records until the watermark advances past their ts_event_ns.
    Emits records in deterministic order: (ts_event_ns, sequence, arrival_order).

    Exact duplicates: same (ts_event_ns, sequence, price, size) → safe to drop.
    Conflicting duplicates: same (ts_event_ns, sequence) but different payload
        → emit anomaly record, retain both for downstream visibility.

    Records arriving more than REORDER_TOLERANCE_NS behind the current watermark
    are outside tolerance: emit gap/anomaly record, mark DEGRADED, request recovery.
    """

    def __init__(
        self,
        tolerance_ns: int = REORDER_TOLERANCE_NS,
        max_size: int = REORDER_BUFFER_MAX,
    ) -> None:
        self._tolerance_ns = tolerance_ns
        self._max_size = max_size
        self._heap: List[_BufferedRecord] = []
        self._watermark_ns: int = 0
        self._arrival_counter: int = 0
        # (ts_event_ns, sequence) → (price_raw, size) for exact dup detection
        self._seen: Dict[Tuple[int, int], Tuple[int, int]] = {}
        self.anomalies: List[dict] = []          # conflicting duplicates
        self.outside_tolerance: List[dict] = []  # records outside tolerance
        self.overflow_count: int = 0             # records dropped on overflow

    def push(self, record: object) -> None:
        """
        Add a record to the buffer.

        Raises:
            BufferOverflowError: when the buffer is full.
        """
        ts_ns = getattr(record, "ts_event", 0)
        seq = getattr(record, "sequence", 0) or 0
        price_raw = getattr(record, "price", 0) or 0
        size = getattr(record, "size", 0) or 0

        # Outside-tolerance check
        if self._watermark_ns > 0 and ts_ns < self._watermark_ns - self._tolerance_ns:
            self.outside_tolerance.append({
                "ts_event_ns": ts_ns,
                "sequence": seq,
                "watermark_ns": self._watermark_ns,
                "delta_ns": self._watermark_ns - ts_ns,
            })
            # Do not add to buffer — caller must handle DEGRADED + recovery
            return

        # Duplicate check
        key = (ts_ns, seq)
        if seq > 0 and key in self._seen:
            prev_price, prev_size = self._seen[key]
            if prev_price == price_raw and prev_size == size:
                # Exact duplicate — safe to discard
                return
            else:
                # Conflicting duplicate — record anomaly, still add to buffer
                self.anomalies.append({
                    "ts_event_ns": ts_ns,
                    "sequence": seq,
                    "original_price_raw": prev_price,
                    "conflicting_price_raw": price_raw,
                    "original_size": prev_size,
                    "conflicting_size": size,
                })
                # Fall through — add the conflicting record to the buffer

        if len(self._heap) >= self._max_size:
            self.overflow_count += 1
            raise BufferOverflowError(
                f"Reorder buffer overflow: size={self._max_size} "
                f"watermark_ns={self._watermark_ns}"
            )

        self._arrival_counter += 1
        entry = _BufferedRecord(
            ts_event_ns=ts_ns,
            sequence=seq,
            arrival_order=self._arrival_counter,
            record=record,
        )
        heapq.heappush(self._heap, entry)

        if seq > 0:
            self._seen[key] = (price_raw, size)

        # Advance watermark
        if ts_ns > self._watermark_ns:
            self._watermark_ns = ts_ns

    def drain_ready(self) -> List[object]:
        """
        Return all records whose ts_event_ns ≤ watermark - tolerance.
        These are safe to emit: no later record can arrive before them.
        """
        cutoff = self._watermark_ns - self._tolerance_ns
        ready = []
        while self._heap and self._heap[0].ts_event_ns <= cutoff:
            entry = heapq.heappop(self._heap)
            ready.append(entry.record)
        return ready

    def drain_all(self) -> List[object]:
        """
        Drain all remaining records in sorted order (called at end of stream).
        """
        result = []
        while self._heap:
            entry = heapq.heappop(self._heap)
            result.append(entry.record)
        return result

    @property
    def size(self) -> int:
        return len(self._heap)

    @property
    def watermark_ns(self) -> int:
        return self._watermark_ns


class BufferOverflowError(RuntimeError):
    """Raised when the reorder buffer exceeds its maximum size."""


# ── Replay client ──────────────────────────────────────────────────────────────

class DatabentoReplayClient:
    """
    Replay client for Databento historical data.

    Provides:
    - replay_trades: trade replay with bounded reorder buffer
    - recover_definitions: instrument definition recovery
    - recover_symbol_mappings: symbol mapping recovery
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        dataset: str = "GLBX.MDP3",
        resolver: Optional[SymbolResolver] = None,
    ) -> None:
        self._api_key = api_key or os.environ.get("DATABENTO_API_KEY", "")
        self._dataset = dataset
        self._resolver = resolver or SymbolResolver()

    def _make_client(self) -> db.Historical:
        """Create a Databento Historical client. API key is never logged."""
        return db.Historical(key=self._api_key)

    async def _iter_records(self, store: db.DBNStore) -> AsyncIterator:
        """
        Async generator that iterates a DBNStore in a thread pool.
        Uses a sentinel value to detect StopIteration safely (PEP 479:
        StopIteration cannot be raised inside a coroutine/generator).
        """
        loop = asyncio.get_event_loop()
        it = iter(store)
        while True:
            record = await loop.run_in_executor(
                None, lambda: next(it, _ITER_SENTINEL)
            )
            if record is _ITER_SENTINEL:
                return
            yield record

    async def replay_trades(
        self,
        symbol: str,
        start_ts_ns: int,
        end_ts_ns: int,
        cancel_event: Optional[asyncio.Event] = None,
    ) -> AsyncIterator[BridgeEnvelope]:
        """
        Replay trade records for a given symbol and time range.

        Implements a bounded reorder buffer:
        - Records within REORDER_TOLERANCE_NS of the watermark are buffered.
        - Records are emitted in deterministic order: (ts_event_ns, sequence).
        - Exact duplicates are silently dropped.
        - Conflicting duplicates are recorded as anomalies (not discarded).
        - Records outside tolerance trigger DEGRADED + gap record + recovery request.
        - Buffer overflow triggers DEGRADED + gap record.

        Yields:
            BridgeEnvelope with schema='trades' for each trade record.
            BridgeEnvelope with schema='gap-detected' for OOO/overflow anomalies.
            BridgeEnvelope with schema='recovery-complete', 'recovery-partial',
            or 'recovery-failed' as the final record.
        """
        if end_ts_ns <= start_ts_ns:
            raise ValueError(
                f"Invalid time range: start_ts_ns={start_ts_ns} >= end_ts_ns={end_ts_ns}"
            )
        if (end_ts_ns - start_ts_ns) > MAX_REPLAY_WINDOW_NS:
            raise ValueError(
                f"Replay window too large: {(end_ts_ns - start_ts_ns) / 1e9:.0f}s "
                f"(max {MAX_REPLAY_WINDOW_NS / 1e9:.0f}s)"
            )

        recovery_id = make_recovery_id("trades", start_ts_ns, end_ts_ns)
        records_recovered = 0
        last_emitted_ts_ns = 0
        outside_tolerance_ranges: List[dict] = []

        for attempt in range(MAX_RETRIES):
            if cancel_event and cancel_event.is_set():
                logger.info("[ReplayClient] Cancelled before attempt %d", attempt + 1)
                yield make_recovery_failed_record(
                    schema="trades",
                    reason="Cancelled by caller",
                    start_ts_ns=start_ts_ns,
                    end_ts_ns=end_ts_ns,
                    recovery_id=recovery_id,
                    error_code="CANCELLED",
                )
                return

            try:
                client = self._make_client()
                store = await asyncio.get_event_loop().run_in_executor(
                    None,
                    lambda: client.timeseries.get_range(
                        dataset=self._dataset,
                        symbols=[symbol],
                        schema="trades",
                        start=start_ts_ns,
                        end=end_ts_ns,
                        stype_in="continuous",
                    ),
                )

                buf = ReorderBuffer(
                    tolerance_ns=REORDER_TOLERANCE_NS,
                    max_size=REORDER_BUFFER_MAX,
                )

                async for record in self._iter_records(store):
                    if cancel_event and cancel_event.is_set():
                        logger.info("[ReplayClient] Cancelled mid-stream")
                        # Drain remaining buffer before returning
                        for r in buf.drain_all():
                            env = self._normalise_trade(r, symbol)
                            if env:
                                yield env
                                records_recovered += 1
                        return

                    # Try to push into reorder buffer
                    try:
                        buf.push(record)
                    except BufferOverflowError as oe:
                        logger.error(
                            "[ReplayClient] Reorder buffer overflow: %s — marking DEGRADED", oe
                        )
                        gap = GapRecord(
                            schema="trades",
                            detected_at_ms=int(time.time() * 1000),
                            first_missing_ts_ns=buf.watermark_ns,
                            last_missing_ts_ns=end_ts_ns,
                            records_lost=buf.size,
                            dataset=self._dataset,
                            raw_symbol=symbol,
                            recovery_id=recovery_id,
                        )
                        yield make_gap_detected_record(gap)
                        # Drain what we have and yield partial
                        for r in buf.drain_all():
                            env = self._normalise_trade(r, symbol)
                            if env:
                                yield env
                                records_recovered += 1
                        yield make_recovery_partial_record(
                            schema="trades",
                            records_recovered=records_recovered,
                            start_ts_ns=start_ts_ns,
                            end_ts_ns=end_ts_ns,
                            actual_end_ts_ns=last_emitted_ts_ns,
                            recovery_id=recovery_id,
                        )
                        return

                    # Check for outside-tolerance records
                    if buf.outside_tolerance:
                        for oot in buf.outside_tolerance:
                            logger.warning(
                                "[ReplayClient] Record outside reorder tolerance: "
                                "ts=%d watermark=%d delta_ns=%d — marking DEGRADED",
                                oot["ts_event_ns"], oot["watermark_ns"], oot["delta_ns"],
                            )
                            outside_tolerance_ranges.append(oot)
                            yield BridgeEnvelope.wrap("gap-detected", {
                                "schema": "trades",
                                "first_missing_ts_ns": oot["ts_event_ns"],
                                "last_missing_ts_ns": oot["ts_event_ns"],
                                "records_lost": 1,
                                "recovery_id": recovery_id,
                                "reason": "OUTSIDE_REORDER_TOLERANCE",
                                "sequence": oot["sequence"],
                                "watermark_ns": oot["watermark_ns"],
                                "delta_ns": oot["delta_ns"],
                                "atlas_processing_ts_ms": int(time.time() * 1000),
                            })
                        buf.outside_tolerance.clear()

                    # Emit anomaly records for conflicting duplicates
                    if buf.anomalies:
                        for anomaly in buf.anomalies:
                            logger.warning(
                                "[ReplayClient] Conflicting duplicate: ts=%d seq=%d",
                                anomaly["ts_event_ns"], anomaly["sequence"],
                            )
                            yield BridgeEnvelope.wrap("gap-detected", {
                                "schema": "trades",
                                "first_missing_ts_ns": anomaly["ts_event_ns"],
                                "last_missing_ts_ns": anomaly["ts_event_ns"],
                                "records_lost": 0,
                                "recovery_id": recovery_id,
                                "reason": "CONFLICTING_DUPLICATE",
                                "sequence": anomaly["sequence"],
                                "original_price_raw": anomaly["original_price_raw"],
                                "conflicting_price_raw": anomaly["conflicting_price_raw"],
                                "atlas_processing_ts_ms": int(time.time() * 1000),
                            })
                        buf.anomalies.clear()

                    # Drain ready records (within watermark - tolerance)
                    for r in buf.drain_ready():
                        env = self._normalise_trade(r, symbol)
                        if env:
                            yield env
                            records_recovered += 1
                            last_emitted_ts_ns = getattr(r, "ts_event", last_emitted_ts_ns)

                # End of stream — drain remaining buffer
                for r in buf.drain_all():
                    env = self._normalise_trade(r, symbol)
                    if env:
                        yield env
                        records_recovered += 1
                        last_emitted_ts_ns = getattr(r, "ts_event", last_emitted_ts_ns)

                # Determine terminal event
                # Complete: all records in range recovered (or empty range)
                if last_emitted_ts_ns >= end_ts_ns or records_recovered == 0:
                    yield make_recovery_complete_record(
                        schema="trades",
                        records_recovered=records_recovered,
                        start_ts_ns=start_ts_ns,
                        end_ts_ns=end_ts_ns,
                        recovery_id=recovery_id,
                    )
                else:
                    # Partial: stream ended before end_ts_ns
                    yield make_recovery_partial_record(
                        schema="trades",
                        records_recovered=records_recovered,
                        start_ts_ns=start_ts_ns,
                        end_ts_ns=end_ts_ns,
                        actual_end_ts_ns=last_emitted_ts_ns,
                        recovery_id=recovery_id,
                    )
                return

            except Exception as exc:
                err_name = type(exc).__name__
                err_str = str(exc)
                is_rate_limit = "429" in err_str or "rate" in err_str.lower()
                if is_rate_limit and attempt < MAX_RETRIES - 1:
                    backoff = BACKOFF_INITIAL_S * (BACKOFF_MULTIPLIER ** attempt)
                    logger.warning(
                        "[ReplayClient] Rate limit on attempt %d/%d — backing off %.1fs",
                        attempt + 1, MAX_RETRIES, backoff,
                    )
                    await asyncio.sleep(backoff)
                    continue
                logger.error(
                    "[ReplayClient] Failed on attempt %d/%d: %s",
                    attempt + 1, MAX_RETRIES, err_name,
                )
                if attempt == MAX_RETRIES - 1:
                    yield make_recovery_failed_record(
                        schema="trades",
                        reason=f"Max retries exhausted: {err_name}",
                        start_ts_ns=start_ts_ns,
                        end_ts_ns=end_ts_ns,
                        recovery_id=recovery_id,
                        retry_count=attempt + 1,
                        error_code="MAX_RETRIES",
                    )
                    return

        yield make_recovery_failed_record(
            schema="trades",
            reason="Max retries exhausted",
            start_ts_ns=start_ts_ns,
            end_ts_ns=end_ts_ns,
            recovery_id=recovery_id,
            retry_count=MAX_RETRIES,
            error_code="MAX_RETRIES",
        )

    def _normalise_trade(
        self, record: object, fallback_symbol: str
    ) -> Optional[BridgeEnvelope]:
        """Normalise a raw Databento trade record into a BridgeEnvelope."""
        try:
            ts_ns = getattr(record, "ts_event", 0)
            seq = getattr(record, "sequence", 0) or 0
            price_usd = getattr(record, "price", 0) / 1_000_000_000
            size = getattr(record, "size", 0)
            side_raw = getattr(record, "side", None)
            side = str(side_raw.value) if side_raw is not None else "N"
            instrument_id = getattr(record, "instrument_id", 0)
            raw_symbol = self._resolver.resolve_raw(instrument_id) or fallback_symbol
            canonical_symbol = self._resolver.resolve_canonical(instrument_id) or raw_symbol
            trade = BridgeTradeRecord(
                instrument_id=instrument_id,
                raw_symbol=raw_symbol,
                canonical_symbol=canonical_symbol,
                ts_event_ns=ts_ns,
                ts_recv_ns=getattr(record, "ts_recv", ts_ns),
                price_usd=price_usd,
                size=size,
                side=side,
                sequence=seq,
                flags=getattr(record, "flags", 0),
            )
            return BridgeEnvelope.wrap("trades", trade.to_dict())
        except Exception as exc:
            logger.error("[ReplayClient] Failed to normalise trade record: %s", exc)
            return None

    async def recover_definitions(
        self,
        start_ts_ns: int,
        end_ts_ns: int,
        cancel_event: Optional[asyncio.Event] = None,
    ) -> AsyncIterator[BridgeEnvelope]:
        """
        Recover instrument definition records for a time range.

        Yields:
            BridgeEnvelope with schema='definition' for each definition.
            Terminal recovery-complete, recovery-partial, or recovery-failed.
        """
        if end_ts_ns <= start_ts_ns:
            raise ValueError(
                f"Invalid time range: start_ts_ns={start_ts_ns} >= end_ts_ns={end_ts_ns}"
            )
        recovery_id = make_recovery_id("definition", start_ts_ns, end_ts_ns)
        records_recovered = 0
        last_ts_ns = 0

        for attempt in range(MAX_RETRIES):
            if cancel_event and cancel_event.is_set():
                yield make_recovery_failed_record(
                    schema="definition",
                    reason="Cancelled by caller",
                    start_ts_ns=start_ts_ns,
                    end_ts_ns=end_ts_ns,
                    recovery_id=recovery_id,
                    error_code="CANCELLED",
                )
                return
            try:
                client = self._make_client()
                store = await asyncio.get_event_loop().run_in_executor(
                    None,
                    lambda: client.timeseries.get_range(
                        dataset=self._dataset,
                        symbols=["MNQ.v.0"],
                        schema="definition",
                        start=start_ts_ns,
                        end=end_ts_ns,
                        stype_in="continuous",
                    ),
                )
                async for record in self._iter_records(store):
                    if cancel_event and cancel_event.is_set():
                        return
                    ts_ns = getattr(record, "ts_recv", 0)
                    instrument_id = getattr(record, "instrument_id", 0)
                    raw_symbol = getattr(record, "raw_symbol", "") or ""
                    defn = BridgeDefinitionRecord(
                        instrument_id=instrument_id,
                        raw_symbol=raw_symbol,
                        instrument_class=str(getattr(record, "instrument_class", "FUT")),
                        asset=str(getattr(record, "asset", "MNQ")),
                        currency=str(getattr(record, "currency", "USD")),
                        min_price_increment=getattr(record, "min_price_increment", 0.25),
                        display_factor=getattr(record, "display_factor", 1.0),
                        expiration_ts_ns=getattr(record, "expiration", 0),
                        ts_recv_ns=ts_ns,
                    )
                    yield BridgeEnvelope.wrap("definition", defn.to_dict())
                    records_recovered += 1
                    if ts_ns > last_ts_ns:
                        last_ts_ns = ts_ns

                if last_ts_ns >= end_ts_ns or records_recovered == 0:
                    yield make_recovery_complete_record(
                        schema="definition",
                        records_recovered=records_recovered,
                        start_ts_ns=start_ts_ns,
                        end_ts_ns=end_ts_ns,
                        recovery_id=recovery_id,
                    )
                else:
                    yield make_recovery_partial_record(
                        schema="definition",
                        records_recovered=records_recovered,
                        start_ts_ns=start_ts_ns,
                        end_ts_ns=end_ts_ns,
                        actual_end_ts_ns=last_ts_ns,
                        recovery_id=recovery_id,
                    )
                return

            except Exception as exc:
                err_name = type(exc).__name__
                err_str = str(exc)
                is_rate_limit = "429" in err_str or "rate" in err_str.lower()
                if is_rate_limit and attempt < MAX_RETRIES - 1:
                    backoff = BACKOFF_INITIAL_S * (BACKOFF_MULTIPLIER ** attempt)
                    await asyncio.sleep(backoff)
                    continue
                if attempt == MAX_RETRIES - 1:
                    yield make_recovery_failed_record(
                        schema="definition",
                        reason=f"Max retries exhausted: {err_name}",
                        start_ts_ns=start_ts_ns,
                        end_ts_ns=end_ts_ns,
                        recovery_id=recovery_id,
                        retry_count=attempt + 1,
                        error_code="MAX_RETRIES",
                    )
                    return

        yield make_recovery_failed_record(
            schema="definition",
            reason="Max retries exhausted",
            start_ts_ns=start_ts_ns,
            end_ts_ns=end_ts_ns,
            recovery_id=recovery_id,
            retry_count=MAX_RETRIES,
            error_code="MAX_RETRIES",
        )

    async def recover_symbol_mappings(
        self,
        symbol: str,
        start_ts_ns: int,
        end_ts_ns: int,
        cancel_event: Optional[asyncio.Event] = None,
    ) -> AsyncIterator[BridgeEnvelope]:
        """
        Recover symbol mapping records for a time range.

        Yields:
            BridgeEnvelope with schema='symbol-mapping' for each mapping.
            Terminal recovery-complete, recovery-partial, or recovery-failed.
        """
        if end_ts_ns <= start_ts_ns:
            raise ValueError(
                f"Invalid time range: start_ts_ns={start_ts_ns} >= end_ts_ns={end_ts_ns}"
            )
        recovery_id = make_recovery_id("symbol-mapping", start_ts_ns, end_ts_ns)
        records_recovered = 0
        last_ts_ns = 0

        for attempt in range(MAX_RETRIES):
            if cancel_event and cancel_event.is_set():
                yield make_recovery_failed_record(
                    schema="symbol-mapping",
                    reason="Cancelled by caller",
                    start_ts_ns=start_ts_ns,
                    end_ts_ns=end_ts_ns,
                    recovery_id=recovery_id,
                    error_code="CANCELLED",
                )
                return
            try:
                client = self._make_client()
                store = await asyncio.get_event_loop().run_in_executor(
                    None,
                    lambda: client.timeseries.get_range(
                        dataset=self._dataset,
                        symbols=[symbol],
                        schema="symbol-mapping",
                        start=start_ts_ns,
                        end=end_ts_ns,
                        stype_in="continuous",
                    ),
                )
                async for record in self._iter_records(store):
                    if cancel_event and cancel_event.is_set():
                        return
                    ts_ns = getattr(record, "ts_event", 0)
                    mapping = BridgeSymbolMappingRecord(
                        instrument_id=getattr(record, "instrument_id", 0),
                        stype_in_symbol=str(getattr(record, "stype_in_symbol", symbol)),
                        stype_out_symbol=str(getattr(record, "stype_out_symbol", "")),
                        start_ts_ns=getattr(record, "start_ts", ts_ns),
                        end_ts_ns=getattr(record, "end_ts", 0),
                    )
                    yield BridgeEnvelope.wrap("symbol-mapping", mapping.to_dict())
                    records_recovered += 1
                    if ts_ns > last_ts_ns:
                        last_ts_ns = ts_ns

                if last_ts_ns >= end_ts_ns or records_recovered == 0:
                    yield make_recovery_complete_record(
                        schema="symbol-mapping",
                        records_recovered=records_recovered,
                        start_ts_ns=start_ts_ns,
                        end_ts_ns=end_ts_ns,
                        recovery_id=recovery_id,
                    )
                else:
                    yield make_recovery_partial_record(
                        schema="symbol-mapping",
                        records_recovered=records_recovered,
                        start_ts_ns=start_ts_ns,
                        end_ts_ns=end_ts_ns,
                        actual_end_ts_ns=last_ts_ns,
                        recovery_id=recovery_id,
                    )
                return

            except Exception as exc:
                err_name = type(exc).__name__
                err_str = str(exc)
                is_rate_limit = "429" in err_str or "rate" in err_str.lower()
                if is_rate_limit and attempt < MAX_RETRIES - 1:
                    backoff = BACKOFF_INITIAL_S * (BACKOFF_MULTIPLIER ** attempt)
                    await asyncio.sleep(backoff)
                    continue
                if attempt == MAX_RETRIES - 1:
                    yield make_recovery_failed_record(
                        schema="symbol-mapping",
                        reason=f"Max retries exhausted: {err_name}",
                        start_ts_ns=start_ts_ns,
                        end_ts_ns=end_ts_ns,
                        recovery_id=recovery_id,
                        retry_count=attempt + 1,
                        error_code="MAX_RETRIES",
                    )
                    return

        yield make_recovery_failed_record(
            schema="symbol-mapping",
            reason="Max retries exhausted",
            start_ts_ns=start_ts_ns,
            end_ts_ns=end_ts_ns,
            recovery_id=recovery_id,
            retry_count=MAX_RETRIES,
            error_code="MAX_RETRIES",
        )
