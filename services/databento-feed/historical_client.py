"""
Atlas Databento Feed Adapter — Historical/Replay Client
Sprint 123A.2 — Databento Adapter and Private Bridge

Provides historical data backfill and trade replay for gap recovery.
Used by the DatabentoFeedAdapter when DEGRADED state is triggered by
queue overflow on an authoritative schema.

AUTHORITY BOUNDARY
------------------
Python is a transport and normalisation adapter ONLY.
- This client fetches raw Databento records and normalises them into
  bridge envelopes using the SAME factory functions as the live adapter.
- It MUST NOT construct OHLCV candles, aggregate trades, or perform
  any canonical bar construction.
- TypeScript Atlas is responsible for all bar construction and reconciliation.

CRITICAL: No canonical candle construction in this module.
          Python is transport and normalisation ONLY.

SECRET SAFETY
-------------
DATABENTO_API_KEY is passed to the client constructor only.
It is NEVER logged, included in error messages, or sent over the bridge.

RATE LIMIT POLICY
-----------------
HTTP 429 (rate limit) and 5xx errors trigger exponential backoff:
  - Initial delay: 5 seconds
  - Backoff factor: 2.0
  - Maximum delay: 300 seconds
  - Maximum retries: 5
After max retries, a recovery-failed bridge record is yielded.
"""

from __future__ import annotations

import asyncio
import datetime
import logging
from typing import AsyncIterator, Optional

import databento as db

from bridge_records import (
    BridgeEnvelope,
    BridgeOhlcv1mRecord,
    BridgeTradeRecord,
    make_recovery_complete_record,
    make_recovery_failed_record,
    make_recovery_partial_record,
)
from symbol_resolver import SymbolResolver

logger = logging.getLogger(__name__)

# ── Constants ──────────────────────────────────────────────────────────────────
DATABENTO_DATASET = "GLBX.MDP3"

# Maximum replay window: 7 days in nanoseconds
MAX_REPLAY_WINDOW_NS = 7 * 24 * 3600 * 1_000_000_000

# Rate-limit / 5xx backoff policy
BACKOFF_INITIAL_S = 5.0
BACKOFF_MAX_S = 300.0
BACKOFF_FACTOR = 2.0
MAX_RETRIES = 5

# HTTP status codes that trigger retry
_RETRYABLE_STATUS_CODES = frozenset({429, 500, 502, 503, 504})


def _is_retryable(exc: Exception) -> bool:
    """Return True if the exception should trigger a retry."""
    if isinstance(exc, db.BentoError):
        status = getattr(exc, "http_status", None) or getattr(exc, "status_code", None)
        if status is not None:
            return int(status) in _RETRYABLE_STATUS_CODES
        return True
    return False


def _ns_to_iso(ts_ns: int) -> str:
    """Convert nanosecond UTC timestamp to ISO 8601 string for Databento API."""
    ts_s = ts_ns / 1_000_000_000
    dt = datetime.datetime.fromtimestamp(ts_s, tz=datetime.timezone.utc)
    return dt.strftime("%Y-%m-%dT%H:%M:%S.") + f"{dt.microsecond:06d}" + "000Z"


_ITER_SENTINEL = object()


async def _iter_records(data: object) -> AsyncIterator:
    """
    Iterate over Databento records from a timeseries result.

    The Databento Historical API returns a DBNStore object that supports
    synchronous iteration. We wrap it in an async generator to allow
    yielding from async methods without blocking the event loop.

    NOTE: StopIteration cannot be raised into a Future in Python 3.7+
    (PEP 479). We use a sentinel value to detect end-of-iteration instead.
    """
    loop = asyncio.get_event_loop()
    iterator = iter(data)
    while True:
        record = await loop.run_in_executor(None, next, iterator, _ITER_SENTINEL)
        if record is _ITER_SENTINEL:
            break
        yield record


class DatabentoHistoricalClient:
    """
    Fetches historical Databento records for gap recovery.

    Accepts an optional mock_client for testing — when provided, the
    mock_client is used instead of creating a real databento.Historical
    instance. This ensures no live API calls are made in tests.

    Usage:
        client = DatabentoHistoricalClient(api_key="...", resolver=resolver)
        async for envelope in client.backfill_ohlcv_1m("MNQ1!", start_ns, end_ns):
            await bridge_queue.put(envelope.to_dict())
    """

    def __init__(
        self,
        api_key: str,
        resolver: Optional[SymbolResolver] = None,
        mock_client: Optional[object] = None,
    ) -> None:
        # API key is stored privately — never log or serialise
        self.__api_key = api_key
        self._resolver = resolver or SymbolResolver()
        self._mock_client = mock_client  # injected for testing

    def _get_historical_client(self) -> object:
        """Return the historical client (mock or real)."""
        if self._mock_client is not None:
            return self._mock_client
        # Real client — API key passed to constructor only, never logged
        return db.Historical(key=self.__api_key)

    def _validate_request(self, symbol: str, start_ts_ns: int, end_ts_ns: int) -> None:
        """
        Validate a historical request.

        Raises:
            ValueError: If end_ts_ns <= start_ts_ns (invalid range).
            ValueError: If span > MAX_REPLAY_WINDOW_NS (> 7 days).
        """
        if end_ts_ns <= start_ts_ns:
            raise ValueError(
                f"Invalid time range: end_ts_ns ({end_ts_ns}) must be "
                f"greater than start_ts_ns ({start_ts_ns})"
            )
        span_ns = end_ts_ns - start_ts_ns
        if span_ns > MAX_REPLAY_WINDOW_NS:
            raise ValueError(
                f"Replay window too large: {span_ns} ns "
                f"(max {MAX_REPLAY_WINDOW_NS} ns = 7 days)"
            )

    async def backfill_ohlcv_1m(
        self,
        symbol: str,
        start_ts_ns: int,
        end_ts_ns: int,
    ) -> AsyncIterator[BridgeEnvelope]:
        """
        Fetch historical 1-minute OHLCV bars for a symbol and time range.

        Yields normalised BridgeEnvelope records (schema='ohlcv-1m') for
        each bar, followed by a recovery-complete or recovery-partial envelope.

        CRITICAL: This method does NOT construct candles. It passes raw
        Databento OHLCVMsg records through the same normalisation pipeline
        as the live adapter. TypeScript Atlas handles all reconciliation.

        Args:
            symbol:       Canonical symbol (e.g. 'MNQ1!') or raw symbol.
            start_ts_ns:  Start of the gap, nanoseconds UTC.
            end_ts_ns:    End of the gap, nanoseconds UTC.

        Yields:
            BridgeEnvelope with schema='ohlcv-1m' for each bar.
            BridgeEnvelope with schema='recovery-complete' or 'recovery-partial' at end.
            BridgeEnvelope with schema='recovery-failed' if max retries exhausted.
        """
        self._validate_request(symbol, start_ts_ns, end_ts_ns)

        records_recovered = 0
        last_ts_ns = start_ts_ns
        retries = 0
        delay = BACKOFF_INITIAL_S

        while retries <= MAX_RETRIES:
            try:
                client = self._get_historical_client()
                start_dt = _ns_to_iso(start_ts_ns)
                end_dt = _ns_to_iso(end_ts_ns)

                data = client.timeseries.get_range(
                    dataset=DATABENTO_DATASET,
                    schema="ohlcv-1m",
                    symbols=[symbol],
                    stype_in="continuous",
                    start=start_dt,
                    end=end_dt,
                )

                async for record in _iter_records(data):
                    if not isinstance(record, db.OHLCVMsg):
                        continue

                    last_ts_ns = record.ts_event
                    records_recovered += 1

                    # Normalise — transport only, no candle construction
                    instrument_id = record.instrument_id
                    canonical = self._resolver.resolve_canonical(instrument_id) or symbol
                    raw = self._resolver.resolve_raw(instrument_id) or symbol

                    bridge_record = BridgeOhlcv1mRecord(
                        instrument_id=instrument_id,
                        raw_symbol=raw,
                        canonical_symbol=canonical,
                        ts_event_ns=record.ts_event,
                        open_usd=record.open / 1_000_000_000,
                        high_usd=record.high / 1_000_000_000,
                        low_usd=record.low / 1_000_000_000,
                        close_usd=record.close / 1_000_000_000,
                        volume=record.volume,
                        vwap_usd=None,
                    )
                    yield BridgeEnvelope.wrap("ohlcv-1m", bridge_record.to_dict())

                # Stream completed — check if we covered the full range
                if last_ts_ns < end_ts_ns and records_recovered > 0:
                    logger.warning(
                        "[HistoricalClient] Partial backfill: schema=ohlcv-1m "
                        "recovered=%d last_ts_ns=%d end_ts_ns=%d",
                        records_recovered, last_ts_ns, end_ts_ns,
                    )
                    yield make_recovery_partial_record(
                        schema="ohlcv-1m",
                        records_recovered=records_recovered,
                        start_ts_ns=start_ts_ns,
                        end_ts_ns=end_ts_ns,
                        actual_end_ts_ns=last_ts_ns,
                    )
                else:
                    logger.info(
                        "[HistoricalClient] Backfill complete: schema=ohlcv-1m "
                        "recovered=%d",
                        records_recovered,
                    )
                    yield make_recovery_complete_record(
                        schema="ohlcv-1m",
                        records_recovered=records_recovered,
                        start_ts_ns=start_ts_ns,
                        end_ts_ns=end_ts_ns,
                    )
                return  # success — exit retry loop

            except Exception as exc:
                if _is_retryable(exc) and retries < MAX_RETRIES:
                    retries += 1
                    logger.warning(
                        "[HistoricalClient] Retryable error (attempt %d/%d): %s — "
                        "retrying in %.1fs",
                        retries, MAX_RETRIES, type(exc).__name__, delay,
                    )
                    await asyncio.sleep(delay)
                    delay = min(delay * BACKOFF_FACTOR, BACKOFF_MAX_S)
                else:
                    reason = f"{type(exc).__name__} after {retries} retries"
                    logger.error(
                        "[HistoricalClient] Recovery failed: schema=ohlcv-1m reason=%s",
                        reason,
                    )
                    yield make_recovery_failed_record(
                        schema="ohlcv-1m",
                        reason=reason,
                        start_ts_ns=start_ts_ns,
                        end_ts_ns=end_ts_ns,
                    )
                    return

        # Max retries exhausted (should not reach here due to loop logic, but safety net)
        yield make_recovery_failed_record(
            schema="ohlcv-1m",
            reason=f"Max retries ({MAX_RETRIES}) exhausted",
            start_ts_ns=start_ts_ns,
            end_ts_ns=end_ts_ns,
        )

    async def replay_trades(
        self,
        symbol: str,
        start_ts_ns: int,
        end_ts_ns: int,
    ) -> AsyncIterator[BridgeEnvelope]:
        """
        Replay historical trades for a symbol and time range.

        Yields normalised BridgeEnvelope records (schema='trades') for
        each trade, followed by a recovery-complete or recovery-partial envelope.

        CRITICAL: This method does NOT construct candles or aggregate trades.
                  It passes raw TradeMsg records through normalisation only.

        Args:
            symbol:       Canonical symbol (e.g. 'MNQ1!') or raw symbol.
            start_ts_ns:  Start of the gap, nanoseconds UTC.
            end_ts_ns:    End of the gap, nanoseconds UTC.

        Yields:
            BridgeEnvelope with schema='trades' for each trade.
            BridgeEnvelope with schema='recovery-complete' or 'recovery-partial' at end.
            BridgeEnvelope with schema='recovery-failed' if max retries exhausted.
        """
        self._validate_request(symbol, start_ts_ns, end_ts_ns)

        records_recovered = 0
        last_ts_ns = start_ts_ns
        retries = 0
        delay = BACKOFF_INITIAL_S

        while retries <= MAX_RETRIES:
            try:
                client = self._get_historical_client()
                start_dt = _ns_to_iso(start_ts_ns)
                end_dt = _ns_to_iso(end_ts_ns)

                data = client.timeseries.get_range(
                    dataset=DATABENTO_DATASET,
                    schema="trades",
                    symbols=[symbol],
                    stype_in="continuous",
                    start=start_dt,
                    end=end_dt,
                )

                async for record in _iter_records(data):
                    if not isinstance(record, db.TradeMsg):
                        continue

                    last_ts_ns = record.ts_event
                    records_recovered += 1

                    instrument_id = record.instrument_id
                    canonical = self._resolver.resolve_canonical(instrument_id) or symbol
                    raw = self._resolver.resolve_raw(instrument_id) or symbol

                    side_map = {"A": "S", "B": "B"}
                    side = side_map.get(getattr(record, "side", ""), "N")

                    bridge_record = BridgeTradeRecord(
                        instrument_id=instrument_id,
                        raw_symbol=raw,
                        canonical_symbol=canonical,
                        ts_event_ns=record.ts_event,
                        ts_recv_ns=record.ts_recv,
                        price_usd=record.price / 1_000_000_000,
                        size=record.size,
                        side=side,
                        sequence=getattr(record, "sequence", 0),
                        flags=getattr(record, "flags", 0),
                    )
                    yield BridgeEnvelope.wrap("trades", bridge_record.to_dict())

                # Stream completed
                if last_ts_ns < end_ts_ns and records_recovered > 0:
                    logger.warning(
                        "[HistoricalClient] Partial replay: schema=trades "
                        "recovered=%d last_ts_ns=%d end_ts_ns=%d",
                        records_recovered, last_ts_ns, end_ts_ns,
                    )
                    yield make_recovery_partial_record(
                        schema="trades",
                        records_recovered=records_recovered,
                        start_ts_ns=start_ts_ns,
                        end_ts_ns=end_ts_ns,
                        actual_end_ts_ns=last_ts_ns,
                    )
                else:
                    logger.info(
                        "[HistoricalClient] Replay complete: schema=trades "
                        "recovered=%d",
                        records_recovered,
                    )
                    yield make_recovery_complete_record(
                        schema="trades",
                        records_recovered=records_recovered,
                        start_ts_ns=start_ts_ns,
                        end_ts_ns=end_ts_ns,
                    )
                return

            except Exception as exc:
                if _is_retryable(exc) and retries < MAX_RETRIES:
                    retries += 1
                    logger.warning(
                        "[HistoricalClient] Retryable error (attempt %d/%d): %s — "
                        "retrying in %.1fs",
                        retries, MAX_RETRIES, type(exc).__name__, delay,
                    )
                    await asyncio.sleep(delay)
                    delay = min(delay * BACKOFF_FACTOR, BACKOFF_MAX_S)
                else:
                    reason = f"{type(exc).__name__} after {retries} retries"
                    logger.error(
                        "[HistoricalClient] Recovery failed: schema=trades reason=%s",
                        reason,
                    )
                    yield make_recovery_failed_record(
                        schema="trades",
                        reason=reason,
                        start_ts_ns=start_ts_ns,
                        end_ts_ns=end_ts_ns,
                    )
                    return

        yield make_recovery_failed_record(
            schema="trades",
            reason=f"Max retries ({MAX_RETRIES}) exhausted",
            start_ts_ns=start_ts_ns,
            end_ts_ns=end_ts_ns,
        )
