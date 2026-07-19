"""
Sprint 123A.2 — Historical/Replay Client Tests
Gate G2 Round 2 — Workstream 2

Tests for DatabentoHistoricalClient. All tests use mocks — no live Databento
API calls are made. Tests verify normalisation, validation, backoff, empty/
partial results, and the no-candle-construction invariant.

RECOVERY SEMANTICS
------------------
- recovery-complete: yielded when last_ts_ns >= end_ts_ns OR records_recovered == 0.
  To get recovery-complete with records, the record's ts_event must be >= end_ts_ns.
  Pattern: record_ts = START + 60s, end_ts_ns = START + 60s → last_ts_ns == end_ts_ns
           → NOT (last_ts_ns < end_ts_ns) → recovery-complete.
- recovery-partial: yielded when last_ts_ns < end_ts_ns AND records_recovered > 0.
  Pattern: record_ts = START, end_ts_ns = START + 60s → last_ts_ns < end_ts_ns → partial.
"""

from __future__ import annotations

import asyncio
import inspect
import sys
import os
from unittest.mock import MagicMock, patch, AsyncMock

import pytest

# Ensure the services/databento-feed directory is on sys.path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import databento as db

from bridge_records import (
    BRIDGE_PROTOCOL_VERSION,
    BridgeEnvelope,
)
from historical_client import (
    DatabentoHistoricalClient,
    MAX_REPLAY_WINDOW_NS,
    MAX_RETRIES,
    BACKOFF_INITIAL_S,
)
from symbol_resolver import SymbolResolver


# ── Constants ──────────────────────────────────────────────────────────────────
START_TS_NS = 1_700_000_000_000_000_000
# For recovery-complete: record ts_event == end_ts_ns → last_ts_ns NOT < end_ts_ns
END_TS_NS_COMPLETE = START_TS_NS + 60 * 1_000_000_000   # +60s
RECORD_TS_AT_END = END_TS_NS_COMPLETE                     # record ts_event == end_ts_ns

# For recovery-partial: record ts_event < end_ts_ns
END_TS_NS_PARTIAL = START_TS_NS + 120 * 1_000_000_000    # +120s
RECORD_TS_EARLY = START_TS_NS                             # record ts_event << end_ts_ns

MNQ_INSTRUMENT_ID = 12345
MNQ_CANONICAL = "MNQ1!"
MNQ_RAW = "MNQM5"


# ── Fixture helpers ────────────────────────────────────────────────────────────

def _make_ohlcv(ts_event_ns: int) -> db.OHLCVMsg:
    """Create a real OHLCVMsg for testing."""
    return db.OHLCVMsg(
        rtype=34,
        publisher_id=1,
        instrument_id=MNQ_INSTRUMENT_ID,
        ts_event=ts_event_ns,
        open=18_500_000_000_000,
        high=18_510_000_000_000,
        low=18_490_000_000_000,
        close=18_505_000_000_000,
        volume=100,
    )


def _make_trade(ts_event_ns: int) -> db.TradeMsg:
    """Create a real TradeMsg for testing."""
    return db.TradeMsg(
        publisher_id=1,
        instrument_id=MNQ_INSTRUMENT_ID,
        ts_event=ts_event_ns,
        price=18_500_250_000_000,
        size=2,
        action=db.Action.TRADE,
        side=db.Side.BID,
        depth=0,
        ts_recv=ts_event_ns + 1000,
    )


def _make_mock_client(records: list) -> MagicMock:
    """Create a mock Databento Historical client."""
    mock_client = MagicMock()
    mock_client.timeseries.get_range.return_value = iter(records)
    return mock_client


def _make_historical_client(records: list, resolver: SymbolResolver = None) -> DatabentoHistoricalClient:
    """Create a DatabentoHistoricalClient with a mock backend."""
    if resolver is None:
        resolver = SymbolResolver()
        resolver.process_symbol_mapping(
            instrument_id=MNQ_INSTRUMENT_ID,
            stype_in_symbol="MNQ.v.0",
            stype_out_symbol=MNQ_RAW,
        )
    mock_client = _make_mock_client(records)
    return DatabentoHistoricalClient(
        api_key="test-key",
        resolver=resolver,
        mock_client=mock_client,
    )


async def _collect(gen) -> list:
    """Collect all items from an async generator."""
    results = []
    async for item in gen:
        results.append(item)
    return results


# ── Tests ──────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_backfill_ohlcv_1m_normalises_records():
    """
    Mock Historical client returns OHLCVMsg fixture; verify BridgeEnvelope output.
    Record ts_event == end_ts_ns → last_ts_ns NOT < end_ts_ns → recovery-complete.
    """
    # Record ts_event == END_TS_NS_COMPLETE → last_ts_ns == end_ts_ns → complete
    ohlcv = _make_ohlcv(RECORD_TS_AT_END)
    client = _make_historical_client([ohlcv])

    results = await _collect(
        client.backfill_ohlcv_1m("MNQ1!", START_TS_NS, END_TS_NS_COMPLETE)
    )

    # Should have 1 ohlcv-1m record + 1 recovery-complete
    assert len(results) == 2
    bar = results[0]
    assert isinstance(bar, BridgeEnvelope)
    assert bar.schema == "ohlcv-1m"
    assert bar.payload["ts_event_ns"] == RECORD_TS_AT_END
    assert bar.payload["open_usd"] == pytest.approx(18500.0)
    assert bar.payload["volume"] == 100
    assert bar.version == BRIDGE_PROTOCOL_VERSION

    recovery = results[1]
    assert recovery.schema == "recovery-complete"
    assert recovery.payload["records_recovered"] == 1


@pytest.mark.asyncio
async def test_replay_trades_normalises_records():
    """
    Mock client returns TradeMsg fixture; verify BridgeEnvelope output.
    Record ts_event == end_ts_ns → recovery-complete.
    """
    trade = _make_trade(RECORD_TS_AT_END)
    client = _make_historical_client([trade])

    results = await _collect(
        client.replay_trades("MNQ1!", START_TS_NS, END_TS_NS_COMPLETE)
    )

    assert len(results) == 2
    trade_env = results[0]
    assert isinstance(trade_env, BridgeEnvelope)
    assert trade_env.schema == "trades"
    assert trade_env.payload["ts_event_ns"] == RECORD_TS_AT_END
    assert trade_env.payload["price_usd"] == pytest.approx(18500.25)
    assert trade_env.payload["size"] == 2

    recovery = results[1]
    assert recovery.schema == "recovery-complete"


@pytest.mark.asyncio
async def test_request_validation_rejects_invalid_range():
    """end_ts_ns <= start_ts_ns raises ValueError."""
    client = DatabentoHistoricalClient(api_key="test-key")

    with pytest.raises(ValueError, match="Invalid time range"):
        async for _ in client.backfill_ohlcv_1m("MNQ1!", START_TS_NS, START_TS_NS):
            pass

    with pytest.raises(ValueError, match="Invalid time range"):
        async for _ in client.backfill_ohlcv_1m("MNQ1!", START_TS_NS, START_TS_NS - 1):
            pass


@pytest.mark.asyncio
async def test_request_validation_rejects_span_too_large():
    """Span > 7 days raises ValueError."""
    client = DatabentoHistoricalClient(api_key="test-key")
    too_large_end = START_TS_NS + MAX_REPLAY_WINDOW_NS + 1

    with pytest.raises(ValueError, match="Replay window too large"):
        async for _ in client.backfill_ohlcv_1m("MNQ1!", START_TS_NS, too_large_end):
            pass


@pytest.mark.asyncio
async def test_rate_limit_backoff_retries():
    """429 error triggers retry with backoff; succeeds on second attempt."""
    # Record ts_event == end_ts_ns → recovery-complete on success
    ohlcv = _make_ohlcv(RECORD_TS_AT_END)

    error_429 = db.BentoError("rate limited")
    error_429.http_status = 429

    call_count = 0

    def get_range_side_effect(**kwargs):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            raise error_429
        return iter([ohlcv])

    mock_client = MagicMock()
    mock_client.timeseries.get_range.side_effect = get_range_side_effect

    client = DatabentoHistoricalClient(
        api_key="test-key",
        mock_client=mock_client,
    )

    with patch("historical_client.asyncio.sleep", new_callable=AsyncMock) as mock_sleep:
        results = await _collect(
            client.backfill_ohlcv_1m("MNQ1!", START_TS_NS, END_TS_NS_COMPLETE)
        )

    # Should have retried and succeeded
    assert call_count == 2
    mock_sleep.assert_called_once()
    assert mock_sleep.call_args[0][0] == pytest.approx(BACKOFF_INITIAL_S)

    # Final result should be recovery-complete
    schemas = [r.schema for r in results]
    assert "recovery-complete" in schemas


@pytest.mark.asyncio
async def test_empty_result_yields_recovery_complete():
    """No records returned yields recovery-complete with records_recovered=0."""
    client = _make_historical_client([])  # empty result

    results = await _collect(
        client.backfill_ohlcv_1m("MNQ1!", START_TS_NS, END_TS_NS_PARTIAL)
    )

    assert len(results) == 1
    assert results[0].schema == "recovery-complete"
    assert results[0].payload["records_recovered"] == 0
    assert results[0].payload["schema"] == "ohlcv-1m"


@pytest.mark.asyncio
async def test_partial_result_yields_recovery_partial():
    """
    Stream ends before end_ts_ns yields recovery-partial.
    Record ts_event = START_TS_NS (early), end_ts_ns = END_TS_NS_PARTIAL (+120s).
    last_ts_ns < end_ts_ns → partial.
    """
    ohlcv = _make_ohlcv(RECORD_TS_EARLY)  # ts_event << end_ts_ns
    client = _make_historical_client([ohlcv])

    results = await _collect(
        client.backfill_ohlcv_1m("MNQ1!", START_TS_NS, END_TS_NS_PARTIAL)
    )

    schemas = [r.schema for r in results]
    assert "recovery-partial" in schemas

    partial = next(r for r in results if r.schema == "recovery-partial")
    assert partial.payload["records_recovered"] == 1
    assert partial.payload["actual_end_ts_ns"] == RECORD_TS_EARLY


@pytest.mark.asyncio
async def test_recovery_complete_event_fields():
    """recovery-complete envelope has correct schema, count, and range fields."""
    # Record ts_event == end_ts_ns → last_ts_ns NOT < end_ts_ns → complete
    ohlcv = _make_ohlcv(RECORD_TS_AT_END)
    client = _make_historical_client([ohlcv])

    results = await _collect(
        client.backfill_ohlcv_1m("MNQ1!", START_TS_NS, END_TS_NS_COMPLETE)
    )

    recovery = next(r for r in results if r.schema == "recovery-complete")
    assert recovery.payload["schema"] == "ohlcv-1m"
    assert recovery.payload["records_recovered"] == 1
    assert recovery.payload["start_ts_ns"] == START_TS_NS
    assert recovery.payload["end_ts_ns"] == END_TS_NS_COMPLETE
    assert recovery.version == BRIDGE_PROTOCOL_VERSION


def test_no_canonical_candle_construction():
    """No candle-building code exists in historical_client.py."""
    import historical_client
    source = inspect.getsource(historical_client)

    # These patterns would indicate candle construction
    forbidden_patterns = [
        "construct_candle",
        "build_candle",
        "make_candle",
        "ohlcv_from_trades",
        "aggregate_trades",
        "resample",
        "groupby",
        "rolling(",
    ]
    for pattern in forbidden_patterns:
        assert pattern not in source, (
            f"Forbidden candle-construction pattern '{pattern}' found in historical_client.py. "
            "Python is transport and normalisation ONLY."
        )


@pytest.mark.asyncio
async def test_max_retries_yields_recovery_failed():
    """After MAX_RETRIES retries, yields recovery-failed envelope."""
    error_429 = db.BentoError("rate limited")
    error_429.http_status = 429

    mock_client = MagicMock()
    mock_client.timeseries.get_range.side_effect = error_429

    client = DatabentoHistoricalClient(
        api_key="test-key",
        mock_client=mock_client,
    )

    with patch("historical_client.asyncio.sleep", new_callable=AsyncMock):
        results = await _collect(
            client.backfill_ohlcv_1m("MNQ1!", START_TS_NS, END_TS_NS_PARTIAL)
        )

    # Should have called get_range MAX_RETRIES + 1 times (initial + retries)
    assert mock_client.timeseries.get_range.call_count == MAX_RETRIES + 1

    assert len(results) == 1
    assert results[0].schema == "recovery-failed"
    assert results[0].payload["schema"] == "ohlcv-1m"
    assert (
        "retries" in results[0].payload["reason"].lower()
        or "BentoError" in results[0].payload["reason"]
    )
