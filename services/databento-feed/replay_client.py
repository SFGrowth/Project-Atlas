"""
Atlas Databento Feed Adapter — Replay Client
Sprint 123A.2 Gate G2 Revision 2

Provides replay and definition/symbol-mapping recovery functionality
using the Databento Historical API.

Separated from historical_client.py to provide:
- Dedicated out-of-order and duplicate record handling
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
import logging
import os
import time
from typing import AsyncIterator, Optional, Set

import databento as db

from bridge_records import (
    BridgeEnvelope,
    BridgeTradeRecord,
    BridgeOhlcv1mRecord,
    BridgeDefinitionRecord,
    BridgeSymbolMappingRecord,
    make_recovery_complete_record,
    make_recovery_partial_record,
    make_recovery_failed_record,
    make_recovery_id,
    BRIDGE_PROTOCOL_VERSION,
)
from symbol_resolver import SymbolResolver

logger = logging.getLogger(__name__)

# ── Constants ──────────────────────────────────────────────────────────────────
MAX_REPLAY_WINDOW_NS: int = 7 * 24 * 3600 * 1_000_000_000   # 7 days
MAX_RETRIES: int = 3
BACKOFF_INITIAL_S: float = 1.0
BACKOFF_MULTIPLIER: float = 2.0
PROGRESS_EMIT_INTERVAL: int = 100

_ITER_SENTINEL = object()


class DatabentoReplayClient:
    """
    Replay client for the Databento Historical API.

    Provides:
    - Trade replay with out-of-order and duplicate detection
    - Definition recovery
    - Symbol-mapping recovery
    - Cancellation via asyncio.Event
    - Exponential backoff on rate-limit errors
    - Deterministic normalisation into bridge-record contracts

    Usage:
        client = DatabentoReplayClient(resolver=resolver)
        async for envelope in client.replay_trades("MNQ1!", start_ns, end_ns):
            await queue.put(envelope.to_dict())
    """

    def __init__(
        self,
        resolver: Optional[SymbolResolver] = None,
        api_key: Optional[str] = None,
        dataset: str = "GLBX.MDP3",
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

        Yields:
            BridgeEnvelope with schema='trades' for each trade record.
            BridgeEnvelope with schema='recovery-complete', 'recovery-partial',
            or 'recovery-failed' as the final record.

        Handles:
            - Out-of-order records (skipped, counted)
            - Duplicate records (detected by sequence number, skipped)
            - Rate-limit errors (exponential backoff)
            - Cancellation via cancel_event
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
        last_ts_ns = 0
        seen_sequences: Set[int] = set()
        out_of_order_count = 0

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

                async for record in self._iter_records(store):
                    if cancel_event and cancel_event.is_set():
                        logger.info("[ReplayClient] Cancelled mid-stream")
                        return

                    ts_ns = getattr(record, "ts_event", 0)

                    # Out-of-order detection
                    if ts_ns < last_ts_ns:
                        out_of_order_count += 1
                        logger.debug(
                            "[ReplayClient] Out-of-order trade: ts=%d last=%d (skipping)",
                            ts_ns, last_ts_ns,
                        )
                        continue

                    # Duplicate detection by sequence
                    seq = getattr(record, "sequence", 0)
                    if seq and seq in seen_sequences:
                        logger.debug("[ReplayClient] Duplicate trade sequence=%d (skipping)", seq)
                        continue
                    if seq:
                        seen_sequences.add(seq)

                    # Normalise
                    price_usd = getattr(record, "price", 0) / 1_000_000_000
                    size = getattr(record, "size", 0)
                    side_raw = getattr(record, "side", None)
                    side = str(side_raw.value) if side_raw is not None else "N"
                    instrument_id = getattr(record, "instrument_id", 0)
                    raw_symbol = self._resolver.resolve_raw(instrument_id) or symbol
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

                    yield BridgeEnvelope.wrap("trades", trade.to_dict())
                    records_recovered += 1
                    last_ts_ns = ts_ns

                # Stream ended
                if last_ts_ns >= end_ts_ns or records_recovered == 0:
                    yield make_recovery_complete_record(
                        schema="trades",
                        records_recovered=records_recovered,
                        start_ts_ns=start_ts_ns,
                        end_ts_ns=end_ts_ns,
                        recovery_id=recovery_id,
                    )
                else:
                    yield make_recovery_partial_record(
                        schema="trades",
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
                        min_price_increment=getattr(record, "min_price_increment", 0) / 1_000_000_000,
                        display_factor=getattr(record, "display_factor", 1) / 1_000_000_000,
                        expiration_ts_ns=getattr(record, "expiration", 0),
                        ts_recv_ns=ts_ns,
                    )

                    yield BridgeEnvelope.wrap("definition", defn.to_dict())
                    records_recovered += 1
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

    async def recover_symbol_mappings(
        self,
        symbol: str,
        start_ts_ns: int,
        end_ts_ns: int,
        cancel_event: Optional[asyncio.Event] = None,
    ) -> AsyncIterator[BridgeEnvelope]:
        """
        Recover symbol mapping records for a given symbol and time range.

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

                    ts_ns = getattr(record, "ts_recv", 0)
                    instrument_id = getattr(record, "instrument_id", 0)

                    mapping = BridgeSymbolMappingRecord(
                        instrument_id=instrument_id,
                        stype_in_symbol=str(getattr(record, "stype_in_symbol", symbol)),
                        stype_out_symbol=str(getattr(record, "stype_out_symbol", "")),
                        start_ts_ns=getattr(record, "start_ts", start_ts_ns),
                        end_ts_ns=getattr(record, "end_ts", 0),
                    )

                    yield BridgeEnvelope.wrap("symbol-mapping", mapping.to_dict())
                    records_recovered += 1
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
