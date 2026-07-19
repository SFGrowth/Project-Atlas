"""
Atlas Databento Feed Adapter — Replay Client Tests
Sprint 123A.2 Gate G2 Revision 3

Tests the bounded reorder buffer, duplicate handling, anomaly detection,
recovery terminal events, and secret safety.

All tests use mocks only — no live Databento API calls.

Test IDs:
  TEST-123A2-R001  Late record inside tolerance is buffered and emitted
  TEST-123A2-R002  Several records arriving out of order are emitted in sequence order
  TEST-123A2-R003  Exact duplicate (same ts, seq, price, size) is silently dropped
  TEST-123A2-R004  Conflicting duplicate (same ts, seq, different payload) emits anomaly
  TEST-123A2-R005  Record outside reorder tolerance emits gap-detected
  TEST-123A2-R006  Buffer overflow emits gap-detected and recovery-partial
  TEST-123A2-R007  Output is in deterministic (ts_event_ns, sequence) order
  TEST-123A2-R008  Recovery request after unrecoverable ordering gap
  TEST-123A2-R009  No silent record loss — every input record is accounted for
  TEST-123A2-R010  Cancellation via asyncio.Event stops the stream
  TEST-123A2-R011  Invalid range (end <= start) raises ValueError
  TEST-123A2-R012  Replay window > 7 days raises ValueError
  TEST-123A2-R013  Rate-limit triggers exponential backoff and retry
  TEST-123A2-R014  After MAX_RETRIES failures, recovery-failed is emitted
  TEST-123A2-R015  Definition recovery yields definition envelopes
  TEST-123A2-R016  Symbol-mapping recovery yields symbol-mapping envelopes
  TEST-123A2-R017  Empty historical response yields recovery-complete
  TEST-123A2-R018  Stream ending before end_ts_ns yields recovery-partial
  TEST-123A2-R019  DATABENTO_API_KEY never appears in any bridge envelope
"""
from __future__ import annotations

import asyncio
import os
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from replay_client import (
    DatabentoReplayClient,
    ReorderBuffer,
    BufferOverflowError,
    MAX_REPLAY_WINDOW_NS,
    MAX_RETRIES,
    _ITER_SENTINEL,
)
from bridge_records import BRIDGE_PROTOCOL_VERSION

# ── Constants ──────────────────────────────────────────────────────────────────

START_NS = 1_700_000_000_000_000_000
END_NS   = 1_700_000_060_000_000_000   # 60 seconds later

pytestmark = pytest.mark.asyncio


# ── Helpers ────────────────────────────────────────────────────────────────────

def _make_mock_trade(
    ts_event: int,
    seq: int = 1,
    price: int = 19_500_000_000_000,
    size: int = 1,
) -> MagicMock:
    r = MagicMock()
    r.ts_event = ts_event
    r.ts_recv = ts_event + 1_000
    r.price = price
    r.size = size
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
    r.min_price_increment = 2_500_000
    r.display_factor = 1_000_000_000
    r.expiration = 1_800_000_000_000_000_000
    return r


def _make_mock_symbol_mapping(ts_recv: int) -> MagicMock:
    r = MagicMock()
    r.ts_recv = ts_recv
    r.ts_event = ts_recv
    r.instrument_id = 100
    r.stype_in_symbol = "MNQ.v.0"
    r.stype_out_symbol = "MNQM5"
    r.start_ts = ts_recv
    r.end_ts = 0
    return r


def _make_client_with_records(records: list) -> DatabentoReplayClient:
    client = DatabentoReplayClient(api_key="test-key")
    mock_store = MagicMock()
    mock_store.__iter__ = lambda s: iter(records)
    mock_hist = MagicMock()
    mock_hist.timeseries.get_range.return_value = mock_store
    client._make_client = lambda: mock_hist
    return client


async def _collect(gen) -> list:
    result = []
    async for env in gen:
        result.append(env)
    return result


# ── ReorderBuffer unit tests ───────────────────────────────────────────────────

class TestReorderBuffer:
    def test_late_record_inside_tolerance_is_buffered(self):
        """TEST-123A2-R001: Record within tolerance is buffered, not rejected."""
        buf = ReorderBuffer(tolerance_ns=1_000_000_000)  # 1 second
        t1 = _make_mock_trade(ts_event=START_NS + 1_000_000_000, seq=1)
        t2 = _make_mock_trade(ts_event=START_NS + 200_000_000, seq=2)  # 800ms behind
        buf.push(t1)
        buf.push(t2)
        # delta = 800ms < 1000ms tolerance → buffered
        assert len(buf.outside_tolerance) == 0
        assert buf.size == 2

    def test_several_ooo_records_emitted_in_order(self):
        """TEST-123A2-R002: Several out-of-order records are emitted in sequence order."""
        buf = ReorderBuffer(tolerance_ns=2_000_000_000)  # 2 seconds
        records = [
            _make_mock_trade(ts_event=START_NS + 3_000_000_000, seq=3),
            _make_mock_trade(ts_event=START_NS + 1_000_000_000, seq=1),
            _make_mock_trade(ts_event=START_NS + 2_000_000_000, seq=2),
        ]
        for r in records:
            buf.push(r)
        drained = buf.drain_all()
        ts_list = [r.ts_event for r in drained]
        assert ts_list == sorted(ts_list), f"Not sorted: {ts_list}"

    def test_exact_duplicate_silently_dropped(self):
        """TEST-123A2-R003: Exact duplicate (same ts, seq, price, size) is silently dropped."""
        buf = ReorderBuffer(tolerance_ns=2_000_000_000)
        t1 = _make_mock_trade(ts_event=START_NS, seq=1, price=19_500_000_000_000, size=1)
        t2 = _make_mock_trade(ts_event=START_NS, seq=1, price=19_500_000_000_000, size=1)
        buf.push(t1)
        buf.push(t2)
        assert buf.size == 1  # t2 dropped
        assert len(buf.anomalies) == 0

    def test_conflicting_duplicate_emits_anomaly(self):
        """TEST-123A2-R004: Conflicting duplicate (same ts, seq, different price) emits anomaly."""
        buf = ReorderBuffer(tolerance_ns=2_000_000_000)
        t1 = _make_mock_trade(ts_event=START_NS, seq=1, price=19_500_000_000_000, size=1)
        t2 = _make_mock_trade(ts_event=START_NS, seq=1, price=19_600_000_000_000, size=1)
        buf.push(t1)
        buf.push(t2)
        assert len(buf.anomalies) == 1
        assert buf.anomalies[0]["sequence"] == 1
        assert buf.anomalies[0]["original_price_raw"] == 19_500_000_000_000
        assert buf.anomalies[0]["conflicting_price_raw"] == 19_600_000_000_000
        # Both records retained in buffer (conflicting dup not discarded)
        assert buf.size == 2

    def test_record_outside_tolerance_not_buffered(self):
        """TEST-123A2-R005: Record outside reorder tolerance is not added to buffer."""
        buf = ReorderBuffer(tolerance_ns=500_000_000)  # 500ms
        t1 = _make_mock_trade(ts_event=START_NS + 2_000_000_000, seq=1)
        t2 = _make_mock_trade(ts_event=START_NS, seq=2)  # 2 seconds behind watermark
        buf.push(t1)
        buf.push(t2)
        assert len(buf.outside_tolerance) == 1
        assert buf.size == 1  # only t1 in buffer

    def test_buffer_overflow_raises(self):
        """TEST-123A2-R006: Buffer overflow raises BufferOverflowError."""
        buf = ReorderBuffer(tolerance_ns=100_000_000_000, max_size=3)
        for i in range(3):
            buf.push(_make_mock_trade(ts_event=START_NS + i * 1_000_000, seq=i + 1))
        with pytest.raises(BufferOverflowError):
            buf.push(_make_mock_trade(ts_event=START_NS + 100_000_000, seq=10))

    def test_deterministic_output_order(self):
        """TEST-123A2-R007: drain_all returns records in (ts_event_ns, sequence) order."""
        buf = ReorderBuffer(tolerance_ns=10_000_000_000)
        for i in range(10, 0, -1):
            buf.push(_make_mock_trade(ts_event=START_NS + i * 1_000_000, seq=i))
        drained = buf.drain_all()
        seqs = [r.sequence for r in drained]
        assert seqs == list(range(1, 11)), f"Expected 1..10, got {seqs}"

    def test_no_silent_record_loss(self):
        """TEST-123A2-R009: Every pushed record is accounted for (emitted, OOT, or anomaly)."""
        buf = ReorderBuffer(tolerance_ns=500_000_000)
        records = [
            _make_mock_trade(ts_event=START_NS + 1_000_000_000, seq=1),  # normal
            _make_mock_trade(ts_event=START_NS + 200_000_000, seq=2),    # OOT (800ms behind)
            _make_mock_trade(ts_event=START_NS + 1_000_000_000, seq=1, price=99_000_000_000_000),  # conflicting dup
        ]
        buf.push(records[0])
        buf.push(records[1])  # OOT
        buf.push(records[2])  # conflicting dup

        in_buffer = buf.size
        in_oot = len(buf.outside_tolerance)
        in_anomaly = len(buf.anomalies)
        total_accounted = in_buffer + in_oot + in_anomaly
        # 3 records pushed: normal(1) + OOT(1) + conflicting_dup(1)
        # normal → buffer (1)
        # OOT → outside_tolerance (1)
        # conflicting dup → buffer (1) + anomaly (1)
        # total accounted = 2 (buffer) + 1 (OOT) + 1 (anomaly) = 4
        assert total_accounted == 4


# ── Integration tests via DatabentoReplayClient ────────────────────────────────

async def test_ooo_records_buffered_and_emitted_in_order():
    """TEST-123A2-R002 (integration): OOO records within tolerance are buffered and emitted in order."""
    # Use a large tolerance so all records are buffered (patch the module-level constant)
    with patch("replay_client.REORDER_TOLERANCE_NS", 10_000_000_000):  # 10 seconds
        t1 = _make_mock_trade(ts_event=START_NS + 3_000_000_000, seq=3)
        t2 = _make_mock_trade(ts_event=START_NS + 1_000_000_000, seq=1)
        t3 = _make_mock_trade(ts_event=START_NS + 2_000_000_000, seq=2)
        client = _make_client_with_records([t1, t2, t3])
        envelopes = await _collect(client.replay_trades("MNQ1!", START_NS, END_NS))
        trade_envs = [e for e in envelopes if e.schema == "trades"]
        seqs = [e.payload["sequence"] for e in trade_envs]
        assert seqs == sorted(seqs), f"Not in order: {seqs}"
        assert len(trade_envs) == 3


async def test_exact_duplicate_dropped_no_gap():
    """TEST-123A2-R003 (integration): Exact duplicate is dropped, no gap record emitted."""
    t1 = _make_mock_trade(ts_event=START_NS + 1_000_000_000, seq=1, price=19_500_000_000_000, size=1)
    t2 = _make_mock_trade(ts_event=START_NS + 1_000_000_000, seq=1, price=19_500_000_000_000, size=1)
    client = _make_client_with_records([t1, t2])
    envelopes = await _collect(client.replay_trades("MNQ1!", START_NS, END_NS))
    trade_envs = [e for e in envelopes if e.schema == "trades"]
    gap_envs = [e for e in envelopes if e.schema == "gap-detected"]
    assert len(trade_envs) == 1
    assert len(gap_envs) == 0


async def test_conflicting_duplicate_emits_anomaly_envelope():
    """TEST-123A2-R004 (integration): Conflicting duplicate emits gap-detected CONFLICTING_DUPLICATE."""
    t1 = _make_mock_trade(ts_event=START_NS + 1_000_000_000, seq=1, price=19_500_000_000_000)
    t2 = _make_mock_trade(ts_event=START_NS + 1_000_000_000, seq=1, price=19_600_000_000_000)
    client = _make_client_with_records([t1, t2])
    envelopes = await _collect(client.replay_trades("MNQ1!", START_NS, END_NS))
    gap_envs = [e for e in envelopes if e.schema == "gap-detected"]
    assert any(e.payload.get("reason") == "CONFLICTING_DUPLICATE" for e in gap_envs), \
        f"No CONFLICTING_DUPLICATE in gap envelopes: {[e.payload for e in gap_envs]}"


async def test_record_outside_tolerance_emits_gap_detected():
    """TEST-123A2-R005 (integration): Record outside tolerance emits gap-detected OUTSIDE_REORDER_TOLERANCE."""
    # t1 sets watermark at +10s, t2 is at START_NS (10s behind, outside default 500ms tolerance)
    t1 = _make_mock_trade(ts_event=START_NS + 10_000_000_000, seq=1)
    t2 = _make_mock_trade(ts_event=START_NS, seq=2)
    client = _make_client_with_records([t1, t2])
    envelopes = await _collect(client.replay_trades("MNQ1!", START_NS, END_NS))
    gap_envs = [e for e in envelopes if e.schema == "gap-detected"]
    assert any(e.payload.get("reason") == "OUTSIDE_REORDER_TOLERANCE" for e in gap_envs), \
        f"No OUTSIDE_REORDER_TOLERANCE: {[e.payload for e in gap_envs]}"


async def test_buffer_overflow_emits_gap_and_partial():
    """TEST-123A2-R006 (integration): Buffer overflow emits gap-detected and recovery-partial."""
    with patch("replay_client.REORDER_BUFFER_MAX", 2), \
         patch("replay_client.REORDER_TOLERANCE_NS", 100_000_000_000):
        records = [
            _make_mock_trade(ts_event=START_NS + i * 1_000_000, seq=i + 1)
            for i in range(4)  # 4 records, buffer max=2
        ]
        client = _make_client_with_records(records)
        envelopes = await _collect(client.replay_trades("MNQ1!", START_NS, END_NS))
        schemas = [e.schema for e in envelopes]
        assert "gap-detected" in schemas, f"No gap-detected: {schemas}"
        assert "recovery-partial" in schemas, f"No recovery-partial: {schemas}"


async def test_recovery_request_after_unrecoverable_gap():
    """TEST-123A2-R008: Record outside tolerance triggers gap-detected (recovery request signal)."""
    t1 = _make_mock_trade(ts_event=START_NS + 10_000_000_000, seq=1)
    t2 = _make_mock_trade(ts_event=START_NS, seq=2)  # 10s behind — outside any reasonable tolerance
    client = _make_client_with_records([t1, t2])
    envelopes = await _collect(client.replay_trades("MNQ1!", START_NS, END_NS))
    gap_envs = [e for e in envelopes if e.schema == "gap-detected"]
    assert len(gap_envs) >= 1
    # Gap envelope identifies the affected timestamp and sequence range
    gap = gap_envs[0].payload
    assert "ts_event_ns" in gap or "first_missing_ts_ns" in gap
    assert "sequence" in gap or "recovery_id" in gap


async def test_cancellation_via_event():
    """TEST-123A2-R010: Cancellation via asyncio.Event stops the stream."""
    cancel_event = asyncio.Event()
    cancel_event.set()
    client = DatabentoReplayClient(api_key="test-key")
    envelopes = await _collect(
        client.replay_trades("MNQ1!", START_NS, END_NS, cancel_event=cancel_event)
    )
    assert len(envelopes) == 1
    assert envelopes[0].schema == "recovery-failed"
    assert envelopes[0].payload["error_code"] == "CANCELLED"


async def test_invalid_range_raises():
    """TEST-123A2-R011: end_ts_ns <= start_ts_ns raises ValueError."""
    client = DatabentoReplayClient(api_key="test-key")
    with pytest.raises(ValueError, match="Invalid time range"):
        async for _ in client.replay_trades("MNQ1!", START_NS, START_NS):
            pass


async def test_window_too_large_raises():
    """TEST-123A2-R012: Replay window > 7 days raises ValueError."""
    client = DatabentoReplayClient(api_key="test-key")
    end_ns = START_NS + MAX_REPLAY_WINDOW_NS + 1
    with pytest.raises(ValueError, match="too large"):
        async for _ in client.replay_trades("MNQ1!", START_NS, end_ns):
            pass


async def test_rate_limit_retry():
    """TEST-123A2-R013: 429 rate-limit error triggers exponential backoff and retry."""
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

    with patch("replay_client.asyncio.sleep", new_callable=AsyncMock):
        envelopes = await _collect(client.replay_trades("MNQ1!", START_NS, END_NS))

    assert call_count == 2
    schemas = [e.schema for e in envelopes]
    assert "recovery-complete" in schemas or "recovery-partial" in schemas


async def test_max_retries_exhausted():
    """TEST-123A2-R014: After MAX_RETRIES failures, recovery-failed is emitted."""
    client = DatabentoReplayClient(api_key="test-key")
    mock_hist = MagicMock()
    mock_hist.timeseries.get_range.side_effect = Exception("429 rate limit")
    client._make_client = lambda: mock_hist

    with patch("replay_client.asyncio.sleep", new_callable=AsyncMock):
        envelopes = await _collect(client.replay_trades("MNQ1!", START_NS, END_NS))

    assert len(envelopes) == 1
    assert envelopes[0].schema == "recovery-failed"
    assert envelopes[0].payload["retry_count"] == MAX_RETRIES
    assert envelopes[0].payload["error_code"] == "MAX_RETRIES"


async def test_definition_recovery():
    """TEST-123A2-R015: recover_definitions yields definition envelopes."""
    defn = _make_mock_definition(ts_recv=END_NS)
    client = _make_client_with_records([defn])
    envelopes = await _collect(client.recover_definitions(START_NS, END_NS))
    defn_envs = [e for e in envelopes if e.schema == "definition"]
    assert len(defn_envs) == 1
    assert defn_envs[0].payload["instrument_id"] == 100
    schemas = [e.schema for e in envelopes]
    assert "recovery-complete" in schemas or "recovery-partial" in schemas


async def test_symbol_mapping_recovery():
    """TEST-123A2-R016: recover_symbol_mappings yields symbol-mapping envelopes."""
    mapping = _make_mock_symbol_mapping(ts_recv=END_NS)
    client = _make_client_with_records([mapping])
    envelopes = await _collect(client.recover_symbol_mappings("MNQ.v.0", START_NS, END_NS))
    mapping_envs = [e for e in envelopes if e.schema == "symbol-mapping"]
    assert len(mapping_envs) == 1
    assert mapping_envs[0].payload["stype_in_symbol"] == "MNQ.v.0"


async def test_empty_result_recovery_complete():
    """TEST-123A2-R017: Empty historical response yields recovery-complete."""
    client = _make_client_with_records([])
    envelopes = await _collect(client.replay_trades("MNQ1!", START_NS, END_NS))
    assert len(envelopes) == 1
    assert envelopes[0].schema == "recovery-complete"
    assert envelopes[0].payload["records_recovered"] == 0


async def test_partial_result_recovery_partial():
    """TEST-123A2-R018: Stream ending before end_ts_ns yields recovery-partial."""
    t1 = _make_mock_trade(ts_event=START_NS + 1_000, seq=1)
    client = _make_client_with_records([t1])
    envelopes = await _collect(client.replay_trades("MNQ1!", START_NS, END_NS))
    schemas = [e.schema for e in envelopes]
    assert "recovery-partial" in schemas


async def test_secret_safety_api_key_not_in_envelope():
    """TEST-123A2-R019: DATABENTO_API_KEY never appears in any bridge envelope."""
    api_key = "db-test-secret-key-12345"
    t1 = _make_mock_trade(ts_event=END_NS, seq=1)
    client = _make_client_with_records([t1])
    client._api_key = api_key
    envelopes = await _collect(client.replay_trades("MNQ1!", START_NS, END_NS))
    for env in envelopes:
        env_str = str(env.to_dict())
        assert api_key not in env_str, f"API key found in envelope: {env.schema}"
