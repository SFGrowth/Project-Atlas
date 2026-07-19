"""
Sprint 123A.2 — Schema-Aware Overflow Policy Tests
Gate G2 Round 2 — Workstream 1

Tests that authoritative schema overflow triggers DEGRADED state, creates
GapRecords, emits gap-detected events, and that recovery transitions back
to LIVE. Also tests that low-priority (feed-health) records may be dropped
without triggering DEGRADED.
"""

from __future__ import annotations

import asyncio
import sys
import os

import pytest

# Ensure the services/databento-feed directory is on sys.path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from bridge_records import (
    BRIDGE_PROTOCOL_VERSION,
    BridgeEnvelope,
    GapRecord,
    make_gap_detected_record,
    make_recovery_complete_record,
    make_recovery_failed_record,
    RecoveryFailedError,
)
from feed_adapter import DatabentoFeedAdapter, FeedState, BRIDGE_QUEUE_MAX


# ── Helpers ────────────────────────────────────────────────────────────────────

class _MockConfig:
    """Minimal AdapterConfig substitute for testing."""
    api_key = "test-key-1234"
    bridge_port = 9876
    bridge_token = "test-bridge-token"


def _make_adapter(queue_max: int = 2) -> DatabentoFeedAdapter:
    """Create a DatabentoFeedAdapter with a small queue for overflow testing."""
    adapter = DatabentoFeedAdapter(_MockConfig())
    # Replace the queue with a smaller one to trigger overflow easily
    adapter._queue = asyncio.Queue(maxsize=queue_max)
    return adapter


def _make_trade_envelope(ts_event_ns: int = 1_700_000_000_000_000_000) -> dict:
    """Build a minimal trades bridge envelope dict."""
    return {
        "version": BRIDGE_PROTOCOL_VERSION,
        "schema": "trades",
        "ts_sent_ms": 1700000000000,
        "payload": {
            "instrument_id": 12345,
            "raw_symbol": "MNQM5",
            "canonical_symbol": "MNQ1!",
            "ts_event_ns": ts_event_ns,
            "ts_recv_ns": ts_event_ns + 1000,
            "price_usd": 18500.25,
            "size": 1,
            "side": "B",
            "sequence": 1,
            "flags": 0,
        },
    }


# ── Tests ──────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_authoritative_overflow_marks_degraded():
    """Queue overflow for an authoritative schema (trades) marks feed state DEGRADED."""
    adapter = _make_adapter(queue_max=1)

    # Fill the queue to capacity
    await adapter._queue.put({"schema": "trades", "payload": {}})
    assert adapter._queue.full()

    # Attempt to enqueue another authoritative record — should trigger DEGRADED
    ts_ns = 1_700_000_000_000_000_001
    await adapter._enqueue_authoritative("trades", _make_trade_envelope(ts_ns), ts_ns)

    assert adapter.feed_state == FeedState.DEGRADED


@pytest.mark.asyncio
async def test_gap_record_created_on_overflow():
    """A GapRecord is created with the correct schema and timestamp on overflow."""
    adapter = _make_adapter(queue_max=1)

    # Fill the queue
    await adapter._queue.put({"schema": "trades", "payload": {}})

    ts_ns = 1_700_000_000_000_000_999
    await adapter._enqueue_authoritative("trades", _make_trade_envelope(ts_ns), ts_ns)

    assert len(adapter.gaps) == 1
    gap = adapter.gaps[0]
    assert gap.schema == "trades"
    assert gap.first_missing_ts_ns == ts_ns
    assert gap.records_lost == 1
    assert gap.detected_at_ms > 0


@pytest.mark.asyncio
async def test_no_dropped_record_treated_as_delivered():
    """data_continuity_confirmed is False after an authoritative overflow."""
    adapter = _make_adapter(queue_max=1)
    adapter._data_continuity_confirmed = True

    await adapter._queue.put({"schema": "trades", "payload": {}})

    ts_ns = 1_700_000_000_000_000_002
    await adapter._enqueue_authoritative("trades", _make_trade_envelope(ts_ns), ts_ns)

    assert adapter.data_continuity_confirmed is False


@pytest.mark.asyncio
async def test_recovery_requested_on_overflow():
    """_request_recovery is called (gap.recovery_requested is True) after overflow."""
    adapter = _make_adapter(queue_max=1)

    await adapter._queue.put({"schema": "trades", "payload": {}})

    ts_ns = 1_700_000_000_000_000_003
    await adapter._enqueue_authoritative("trades", _make_trade_envelope(ts_ns), ts_ns)

    # Allow the asyncio.ensure_future task to run
    await asyncio.sleep(0)

    assert len(adapter.gaps) == 1
    assert adapter.gaps[0].recovery_requested is True


@pytest.mark.asyncio
async def test_health_returns_live_after_recovery():
    """confirm_recovery() transitions state back to LIVE when all schemas recover."""
    adapter = _make_adapter(queue_max=1)

    # Trigger overflow to enter DEGRADED/RECOVERING
    await adapter._queue.put({"schema": "trades", "payload": {}})
    ts_ns = 1_700_000_000_000_000_004
    await adapter._enqueue_authoritative("trades", _make_trade_envelope(ts_ns), ts_ns)
    await asyncio.sleep(0)  # let _request_recovery run

    assert adapter.feed_state in (FeedState.DEGRADED, FeedState.RECOVERING)

    # Manually add to recovering schemas to simulate recovery in progress
    adapter._recovering_schemas.add("trades")
    adapter._feed_state = FeedState.RECOVERING

    # Confirm recovery
    await adapter.confirm_recovery("trades")

    assert adapter.feed_state == FeedState.LIVE
    assert adapter.data_continuity_confirmed is True


@pytest.mark.asyncio
async def test_low_priority_may_be_dropped():
    """Feed-health records may be dropped under backpressure without triggering DEGRADED."""
    adapter = _make_adapter(queue_max=1)

    # Fill the queue with a non-feed-health record
    await adapter._queue.put({"schema": "trades", "payload": {}})
    assert adapter._queue.full()

    # Enqueue a low-priority feed-health record — should be silently dropped
    health_record = adapter._make_feed_health("CONNECTED", None)
    await adapter._enqueue_low_priority(health_record)

    # State must NOT be DEGRADED — low-priority drop is not a data gap
    assert adapter.feed_state != FeedState.DEGRADED
    # No gaps recorded
    assert len(adapter.gaps) == 0
    # Queue still has the original record (feed-health was dropped)
    assert adapter._queue.qsize() == 1


@pytest.mark.asyncio
async def test_gap_event_emitted_to_queue():
    """A gap-detected event is placed in the queue after an authoritative overflow."""
    adapter = _make_adapter(queue_max=2)

    # Fill the queue to capacity (2 slots)
    await adapter._queue.put({"schema": "trades", "payload": {}, "ts_sent_ms": 1})
    await adapter._queue.put({"schema": "trades", "payload": {}, "ts_sent_ms": 2})
    assert adapter._queue.full()

    ts_ns = 1_700_000_000_000_000_005
    await adapter._enqueue_authoritative("trades", _make_trade_envelope(ts_ns), ts_ns)

    # Drain the queue and find the gap-detected event
    items = []
    while not adapter._queue.empty():
        items.append(adapter._queue.get_nowait())

    schemas = [item.get("schema") for item in items]
    assert "gap-detected" in schemas, f"Expected gap-detected in queue, got: {schemas}"

    gap_item = next(i for i in items if i.get("schema") == "gap-detected")
    assert gap_item["payload"]["schema"] == "trades"
    assert gap_item["payload"]["records_lost"] == 1
    assert gap_item["payload"]["first_missing_ts_ns"] == ts_ns
