"""
Tests for replay_client.py — DatabentoReplayClient
Sprint 123A.2 Gate G2 Revision 2

Test IDs: TEST-123A2-R001 through TEST-123A2-R012

All tests use mocks — no live Databento API calls.
"""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from replay_client import DatabentoReplayClient, MAX_REPLAY_WINDOW_NS, MAX_RETRIES
from bridge_records import BRIDGE_PROTOCOL_VERSION


# ── Helpers ────────────────────────────────────────────────────────────────────

def _make_mock_trade(ts_event: int, price: int = 19_500_000_000_000, seq: int = 1) -> MagicMock:
    """Create a mock Databento TradeMsg."""
    r = MagicMock()
    r.ts_event = ts_event
    r.ts_recv = ts_event + 1_000
    r.price = price
    r.size = 1
    r.side = MagicMock()
    r.side.value = "B"
    r.sequence = seq
    r.flags = 0
    r.instrument_id = 100
    return r


def _make_mock_definition(ts_recv: int) -> MagicMock:
    r = MagicMock()
    r.ts_recv = ts_recv
    r.instrument_id = 100
    r.raw_symbol = "MNQM5"
    r.instrument_class = MagicMock()
    r.instrument_class.__str__ = lambda s: "FUT"
    r.asset = MagicMock()
    r.asset.__str__ = lambda s: "MNQ"
    r.currency = MagicMock()
    r.currency.__str__ = lambda s: "USD"
    r.min_price_increment = 2_500_000  # 0.0025 USD
    r.display_factor = 1_000_000_000
    r.expiration = 1_800_000_000_000_000_000
    return r


def _make_mock_symbol_mapping(ts_recv: int) -> MagicMock:
    r = MagicMock()
    r.ts_recv = ts_recv
    r.instrument_id = 100
    r.stype_in_symbol = "MNQ.v.0"
    r.stype_out_symbol = "MNQM5"
    r.start_ts = ts_recv
    r.end_ts = 0
    return r


START_NS = 1_700_000_000_000_000_000
END_NS   = 1_700_000_060_000_000_000   # 60 seconds later


def _make_client_with_records(records: list) -> DatabentoReplayClient:
    """Create a DatabentoReplayClient whose API calls return the given records."""
    client = DatabentoReplayClient(api_key="test-key")
    mock_store = MagicMock()
    mock_store.__iter__ = lambda s: iter(records)
    mock_hist = MagicMock()
    mock_hist.timeseries.get_range.return_value = mock_store
    client._make_client = lambda: mock_hist
    return client


# ── TEST-123A2-R001: out-of-order records are skipped ─────────────────────────

@pytest.mark.asyncio
async def test_out_of_order_records_skipped():
    """TEST-123A2-R001: Out-of-order trade records are skipped, not forwarded."""
    t1 = _make_mock_trade(ts_event=START_NS + 10_000, seq=1)
    t2 = _make_mock_trade(ts_event=START_NS + 5_000, seq=2)   # earlier timestamp
    t3 = _make_mock_trade(ts_event=END_NS, seq=3)

    client = _make_client_with_records([t1, t2, t3])
    envelopes = []
    async for env in client.replay_trades("MNQ1!", START_NS, END_NS):
        envelopes.append(env)

    schemas = [e.schema for e in envelopes]
    trade_envelopes = [e for e in envelopes if e.schema == "trades"]

    # t2 is out-of-order — only t1 and t3 should be forwarded
    assert len(trade_envelopes) == 2
    assert "recovery-complete" in schemas or "recovery-partial" in schemas


# ── TEST-123A2-R002: duplicate records are skipped ────────────────────────────

@pytest.mark.asyncio
async def test_duplicate_records_skipped():
    """TEST-123A2-R002: Duplicate trade records (same sequence) are skipped."""
    t1 = _make_mock_trade(ts_event=START_NS + 1_000, seq=42)
    t2 = _make_mock_trade(ts_event=START_NS + 2_000, seq=42)  # duplicate seq
    t3 = _make_mock_trade(ts_event=END_NS, seq=43)

    client = _make_client_with_records([t1, t2, t3])
    envelopes = []
    async for env in client.replay_trades("MNQ1!", START_NS, END_NS):
        envelopes.append(env)

    trade_envelopes = [e for e in envelopes if e.schema == "trades"]
    assert len(trade_envelopes) == 2   # t2 skipped


# ── TEST-123A2-R003: cancellation via cancel_event ────────────────────────────

@pytest.mark.asyncio
async def test_cancellation_via_event():
    """TEST-123A2-R003: Cancellation via asyncio.Event stops the stream."""
    cancel_event = asyncio.Event()
    cancel_event.set()   # pre-cancelled

    client = DatabentoReplayClient(api_key="test-key")
    envelopes = []
    async for env in client.replay_trades("MNQ1!", START_NS, END_NS, cancel_event=cancel_event):
        envelopes.append(env)

    assert len(envelopes) == 1
    assert envelopes[0].schema == "recovery-failed"
    assert envelopes[0].payload["error_code"] == "CANCELLED"


# ── TEST-123A2-R004: invalid range raises ValueError ─────────────────────────

@pytest.mark.asyncio
async def test_invalid_range_raises():
    """TEST-123A2-R004: end_ts_ns <= start_ts_ns raises ValueError."""
    client = DatabentoReplayClient(api_key="test-key")
    with pytest.raises(ValueError, match="Invalid time range"):
        async for _ in client.replay_trades("MNQ1!", START_NS, START_NS):
            pass


# ── TEST-123A2-R005: window too large raises ValueError ───────────────────────

@pytest.mark.asyncio
async def test_window_too_large_raises():
    """TEST-123A2-R005: Replay window > 7 days raises ValueError."""
    client = DatabentoReplayClient(api_key="test-key")
    end_ns = START_NS + MAX_REPLAY_WINDOW_NS + 1
    with pytest.raises(ValueError, match="too large"):
        async for _ in client.replay_trades("MNQ1!", START_NS, end_ns):
            pass


# ── TEST-123A2-R006: rate-limit triggers backoff and retry ───────────────────

@pytest.mark.asyncio
async def test_rate_limit_retry():
    """TEST-123A2-R006: 429 rate-limit error triggers exponential backoff and retry."""
    call_count = 0
    success_records = [_make_mock_trade(ts_event=END_NS, seq=1)]

    def make_client_side_effect():
        nonlocal call_count
        call_count += 1
        mock_hist = MagicMock()
        if call_count == 1:
            mock_hist.timeseries.get_range.side_effect = Exception("429 rate limit exceeded")
        else:
            mock_store = MagicMock()
            mock_store.__iter__ = lambda s: iter(success_records)
            mock_hist.timeseries.get_range.return_value = mock_store
        return mock_hist

    client = DatabentoReplayClient(api_key="test-key")
    client._make_client = make_client_side_effect

    envelopes = []
    with patch("replay_client.asyncio.sleep", new_callable=AsyncMock):
        async for env in client.replay_trades("MNQ1!", START_NS, END_NS):
            envelopes.append(env)

    assert call_count == 2
    schemas = [e.schema for e in envelopes]
    assert "recovery-complete" in schemas or "recovery-partial" in schemas


# ── TEST-123A2-R007: max retries exhausted → recovery-failed ─────────────────

@pytest.mark.asyncio
async def test_max_retries_exhausted():
    """TEST-123A2-R007: After MAX_RETRIES failures, recovery-failed is emitted."""
    client = DatabentoReplayClient(api_key="test-key")
    mock_hist = MagicMock()
    mock_hist.timeseries.get_range.side_effect = Exception("429 rate limit")
    client._make_client = lambda: mock_hist

    envelopes = []
    with patch("replay_client.asyncio.sleep", new_callable=AsyncMock):
        async for env in client.replay_trades("MNQ1!", START_NS, END_NS):
            envelopes.append(env)

    assert len(envelopes) == 1
    assert envelopes[0].schema == "recovery-failed"
    assert envelopes[0].payload["retry_count"] == MAX_RETRIES
    assert envelopes[0].payload["error_code"] == "MAX_RETRIES"


# ── TEST-123A2-R008: definition recovery yields definition records ────────────

@pytest.mark.asyncio
async def test_definition_recovery():
    """TEST-123A2-R008: recover_definitions yields definition envelopes."""
    defn = _make_mock_definition(ts_recv=END_NS)
    client = _make_client_with_records([defn])
    envelopes = []
    async for env in client.recover_definitions(START_NS, END_NS):
        envelopes.append(env)

    defn_envelopes = [e for e in envelopes if e.schema == "definition"]
    assert len(defn_envelopes) == 1
    assert defn_envelopes[0].payload["instrument_id"] == 100
    assert defn_envelopes[0].payload["raw_symbol"] == "MNQM5"

    schemas = [e.schema for e in envelopes]
    assert "recovery-complete" in schemas or "recovery-partial" in schemas


# ── TEST-123A2-R009: symbol-mapping recovery yields mapping records ───────────

@pytest.mark.asyncio
async def test_symbol_mapping_recovery():
    """TEST-123A2-R009: recover_symbol_mappings yields symbol-mapping envelopes."""
    mapping = _make_mock_symbol_mapping(ts_recv=END_NS)
    client = _make_client_with_records([mapping])
    envelopes = []
    async for env in client.recover_symbol_mappings("MNQ.v.0", START_NS, END_NS):
        envelopes.append(env)

    mapping_envelopes = [e for e in envelopes if e.schema == "symbol-mapping"]
    assert len(mapping_envelopes) == 1
    assert mapping_envelopes[0].payload["stype_in_symbol"] == "MNQ.v.0"
    assert mapping_envelopes[0].payload["stype_out_symbol"] == "MNQM5"


# ── TEST-123A2-R010: empty result → recovery-complete ────────────────────────

@pytest.mark.asyncio
async def test_empty_result_recovery_complete():
    """TEST-123A2-R010: Empty historical response yields recovery-complete."""
    client = _make_client_with_records([])
    envelopes = []
    async for env in client.replay_trades("MNQ1!", START_NS, END_NS):
        envelopes.append(env)

    assert len(envelopes) == 1
    assert envelopes[0].schema == "recovery-complete"
    assert envelopes[0].payload["records_recovered"] == 0


# ── TEST-123A2-R011: partial result → recovery-partial ───────────────────────

@pytest.mark.asyncio
async def test_partial_result_recovery_partial():
    """TEST-123A2-R011: Stream ending before end_ts_ns yields recovery-partial."""
    # Record with ts_event well before END_NS
    t1 = _make_mock_trade(ts_event=START_NS + 1_000, seq=1)
    client = _make_client_with_records([t1])

    envelopes = []
    async for env in client.replay_trades("MNQ1!", START_NS, END_NS):
        envelopes.append(env)

    schemas = [e.schema for e in envelopes]
    assert "recovery-partial" in schemas


# ── TEST-123A2-R012: secret safety — API key not in any envelope ──────────────

@pytest.mark.asyncio
async def test_secret_safety_api_key_not_in_envelope():
    """TEST-123A2-R012: DATABENTO_API_KEY never appears in any bridge envelope."""
    api_key = "db-test-secret-key-12345"
    t1 = _make_mock_trade(ts_event=END_NS, seq=1)
    client = _make_client_with_records([t1])
    client._api_key = api_key

    envelopes = []
    async for env in client.replay_trades("MNQ1!", START_NS, END_NS):
        envelopes.append(env)

    for env in envelopes:
        env_str = str(env.to_dict())
        assert api_key not in env_str, f"API key found in envelope: {env.schema}"
