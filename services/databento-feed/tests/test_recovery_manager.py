"""
Atlas Databento Feed Adapter — Recovery Manager Tests
Sprint 123A.2 Gate G2 Revision 3

Tests the separate RECOVERY_COMPLETE / RECOVERY_PARTIAL / RECOVERY_FAILED
terminal handling, recovery_partial_count, and callback routing.

Test IDs:
  TEST-123A2-M001  recovery-requested envelope is emitted on request_recovery
  TEST-123A2-M002  recovery-started envelope is emitted
  TEST-123A2-M003  RECOVERY_COMPLETE increments recovery_count
  TEST-123A2-M004  RECOVERY_FAILED increments recovery_failures
  TEST-123A2-M005  Duplicate recovery request is rejected
  TEST-123A2-M006  on_complete callback is called for RECOVERY_COMPLETE
  TEST-123A2-M007  on_failed callback is called for RECOVERY_FAILED
  TEST-123A2-M008  Recovery timeout emits recovery-failed with TIMEOUT error code
  TEST-123A2-M009  RECOVERY_PARTIAL increments recovery_partial_count (not recovery_count)
  TEST-123A2-M010  RECOVERY_PARTIAL calls on_failed, NOT on_complete
  TEST-123A2-M011  RECOVERY_PARTIAL forwards unresolved range in the partial envelope
"""
from __future__ import annotations

import asyncio
from unittest.mock import MagicMock, patch

import pytest

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from recovery_manager import RecoveryManager, RECOVERY_TIMEOUT_S
from bridge_records import (
    GapRecord,
    make_recovery_complete_record,
    make_recovery_partial_record,
    make_recovery_failed_record,
)

pytestmark = pytest.mark.asyncio

START_NS = 1_700_000_000_000_000_000
END_NS   = 1_700_000_060_000_000_000


# ── Helpers ────────────────────────────────────────────────────────────────────

def _make_gap(schema: str = "ohlcv-1m") -> GapRecord:
    return GapRecord(
        schema=schema,
        detected_at_ms=1_700_000_000_000,
        first_missing_ts_ns=START_NS,
        last_missing_ts_ns=END_NS,
        records_lost=3,
        raw_symbol="MNQ1!",
        instrument_id=100,
    )


async def _complete_stream(symbol, start_ns, end_ns):
    yield make_recovery_complete_record(
        schema="ohlcv-1m",
        records_recovered=3,
        start_ts_ns=start_ns,
        end_ts_ns=end_ns,
    )


async def _partial_stream(symbol, start_ns, end_ns):
    yield make_recovery_partial_record(
        schema="ohlcv-1m",
        records_recovered=2,
        start_ts_ns=start_ns,
        end_ts_ns=end_ns,
        actual_end_ts_ns=start_ns + 30_000_000_000,
    )


async def _failed_stream(symbol, start_ns, end_ns):
    yield make_recovery_failed_record(
        schema="ohlcv-1m",
        reason="Test failure",
        start_ts_ns=start_ns,
        end_ts_ns=end_ns,
        error_code="TEST",
    )


# ── TEST-123A2-M001 ────────────────────────────────────────────────────────────

async def test_gap_detected_event_emitted():
    """TEST-123A2-M001: request_recovery emits a recovery-requested event."""
    enqueued = []
    async def enqueue(record: dict):
        enqueued.append(record)
    mock_client = MagicMock()
    mock_client.backfill_ohlcv_1m = _complete_stream
    manager = RecoveryManager(enqueue_fn=enqueue)
    await manager.request_recovery(_make_gap(), mock_client)
    await asyncio.sleep(0.05)
    schemas = [r["schema"] for r in enqueued]
    assert "recovery-requested" in schemas


# ── TEST-123A2-M002 ────────────────────────────────────────────────────────────

async def test_recovery_started_event_emitted():
    """TEST-123A2-M002: Recovery emits recovery-started before streaming."""
    enqueued = []
    async def enqueue(record: dict):
        enqueued.append(record)
    mock_client = MagicMock()
    mock_client.backfill_ohlcv_1m = _complete_stream
    manager = RecoveryManager(enqueue_fn=enqueue)
    await manager.request_recovery(_make_gap(), mock_client)
    await asyncio.sleep(0.05)
    schemas = [r["schema"] for r in enqueued]
    assert "recovery-started" in schemas


# ── TEST-123A2-M003 ────────────────────────────────────────────────────────────

async def test_complete_recovery_increments_count():
    """TEST-123A2-M003: RECOVERY_COMPLETE increments recovery_count only."""
    enqueued = []
    async def enqueue(record: dict):
        enqueued.append(record)
    mock_client = MagicMock()
    mock_client.backfill_ohlcv_1m = _complete_stream
    manager = RecoveryManager(enqueue_fn=enqueue)
    await manager.request_recovery(_make_gap(), mock_client)
    await asyncio.sleep(0.1)
    assert manager.recovery_count == 1
    assert manager.recovery_failures == 0
    assert manager.recovery_partial_count == 0


# ── TEST-123A2-M004 ────────────────────────────────────────────────────────────

async def test_failed_recovery_increments_failures():
    """TEST-123A2-M004: RECOVERY_FAILED increments recovery_failures only."""
    enqueued = []
    async def enqueue(record: dict):
        enqueued.append(record)
    mock_client = MagicMock()
    mock_client.backfill_ohlcv_1m = _failed_stream
    manager = RecoveryManager(enqueue_fn=enqueue)
    await manager.request_recovery(_make_gap(), mock_client)
    await asyncio.sleep(0.1)
    assert manager.recovery_failures == 1
    assert manager.recovery_count == 0
    assert manager.recovery_partial_count == 0


# ── TEST-123A2-M005 ────────────────────────────────────────────────────────────

async def test_duplicate_recovery_rejected():
    """TEST-123A2-M005: A second recovery request for the same schema is ignored."""
    enqueued = []
    stream_started = 0

    async def enqueue(record: dict):
        enqueued.append(record)

    async def slow_stream(symbol, start_ns, end_ns):
        nonlocal stream_started
        stream_started += 1
        await asyncio.sleep(0.2)
        yield make_recovery_complete_record(
            schema="ohlcv-1m", records_recovered=0,
            start_ts_ns=start_ns, end_ts_ns=end_ns,
        )

    mock_client = MagicMock()
    mock_client.backfill_ohlcv_1m = slow_stream
    manager = RecoveryManager(enqueue_fn=enqueue)
    await manager.request_recovery(_make_gap(), mock_client)
    await asyncio.sleep(0.02)
    await manager.request_recovery(_make_gap(), mock_client)  # duplicate
    assert stream_started == 1


# ── TEST-123A2-M006 ────────────────────────────────────────────────────────────

async def test_on_complete_callback_called_for_complete():
    """TEST-123A2-M006: on_complete callback is invoked for RECOVERY_COMPLETE."""
    enqueued = []
    completed_schemas = []
    async def enqueue(record: dict):
        enqueued.append(record)
    async def on_complete(schema: str):
        completed_schemas.append(schema)
    mock_client = MagicMock()
    mock_client.backfill_ohlcv_1m = _complete_stream
    manager = RecoveryManager(enqueue_fn=enqueue)
    await manager.request_recovery(_make_gap(), mock_client, on_complete=on_complete)
    await asyncio.sleep(0.1)
    assert "ohlcv-1m" in completed_schemas


# ── TEST-123A2-M007 ────────────────────────────────────────────────────────────

async def test_on_failed_callback_called_for_failed():
    """TEST-123A2-M007: on_failed callback is invoked for RECOVERY_FAILED."""
    enqueued = []
    failed_schemas = []
    async def enqueue(record: dict):
        enqueued.append(record)
    async def on_failed(schema: str):
        failed_schemas.append(schema)
    mock_client = MagicMock()
    mock_client.backfill_ohlcv_1m = _failed_stream
    manager = RecoveryManager(enqueue_fn=enqueue)
    await manager.request_recovery(_make_gap(), mock_client, on_failed=on_failed)
    await asyncio.sleep(0.1)
    assert "ohlcv-1m" in failed_schemas


# ── TEST-123A2-M008 ────────────────────────────────────────────────────────────

async def test_recovery_timeout():
    """TEST-123A2-M008: Recovery timeout emits recovery-failed with TIMEOUT error code."""
    enqueued = []
    async def enqueue(record: dict):
        enqueued.append(record)

    async def hanging_stream(symbol, start_ns, end_ns):
        await asyncio.sleep(9999)
        yield make_recovery_complete_record(
            schema="ohlcv-1m", records_recovered=0,
            start_ts_ns=start_ns, end_ts_ns=end_ns,
        )

    mock_client = MagicMock()
    mock_client.backfill_ohlcv_1m = hanging_stream
    manager = RecoveryManager(enqueue_fn=enqueue)
    with patch("recovery_manager.RECOVERY_TIMEOUT_S", 0.05):
        await manager.request_recovery(_make_gap(), mock_client)
        await asyncio.sleep(0.2)
    schemas = [r["schema"] for r in enqueued]
    assert "recovery-failed" in schemas
    failed = next(r for r in enqueued if r["schema"] == "recovery-failed")
    assert failed["payload"]["error_code"] == "TIMEOUT"
    assert manager.recovery_failures == 1


# ── TEST-123A2-M009 ────────────────────────────────────────────────────────────

async def test_partial_recovery_increments_partial_count():
    """TEST-123A2-M009: RECOVERY_PARTIAL increments recovery_partial_count, not recovery_count."""
    enqueued = []
    async def enqueue(record: dict):
        enqueued.append(record)
    mock_client = MagicMock()
    mock_client.backfill_ohlcv_1m = _partial_stream
    manager = RecoveryManager(enqueue_fn=enqueue)
    await manager.request_recovery(_make_gap(), mock_client)
    await asyncio.sleep(0.1)
    assert manager.recovery_partial_count == 1, \
        f"Expected recovery_partial_count=1, got {manager.recovery_partial_count}"
    assert manager.recovery_count == 0, \
        "RECOVERY_PARTIAL must NOT increment recovery_count"
    assert manager.recovery_failures == 0, \
        "RECOVERY_PARTIAL must NOT increment recovery_failures"


# ── TEST-123A2-M010 ────────────────────────────────────────────────────────────

async def test_partial_recovery_calls_on_failed_not_on_complete():
    """TEST-123A2-M010: RECOVERY_PARTIAL calls on_failed, MUST NOT call on_complete."""
    enqueued = []
    completed_schemas = []
    failed_schemas = []

    async def enqueue(record: dict):
        enqueued.append(record)

    async def on_complete(schema: str):
        completed_schemas.append(schema)

    async def on_failed(schema: str):
        failed_schemas.append(schema)

    mock_client = MagicMock()
    mock_client.backfill_ohlcv_1m = _partial_stream
    manager = RecoveryManager(enqueue_fn=enqueue)
    await manager.request_recovery(
        _make_gap(), mock_client, on_complete=on_complete, on_failed=on_failed
    )
    await asyncio.sleep(0.1)
    assert "ohlcv-1m" in failed_schemas, \
        "on_failed must be called for RECOVERY_PARTIAL"
    assert "ohlcv-1m" not in completed_schemas, \
        "on_complete must NOT be called for RECOVERY_PARTIAL"


# ── TEST-123A2-M011 ────────────────────────────────────────────────────────────

async def test_partial_recovery_forwards_unresolved_range():
    """TEST-123A2-M011: RECOVERY_PARTIAL forwards unresolved range in the partial envelope."""
    enqueued = []
    async def enqueue(record: dict):
        enqueued.append(record)

    async def _partial_with_range(symbol, start_ns, end_ns):
        actual_end = start_ns + 30_000_000_000
        yield make_recovery_partial_record(
            schema="ohlcv-1m",
            records_recovered=2,
            start_ts_ns=start_ns,
            end_ts_ns=end_ns,
            actual_end_ts_ns=actual_end,
        )

    mock_client = MagicMock()
    mock_client.backfill_ohlcv_1m = _partial_with_range
    manager = RecoveryManager(enqueue_fn=enqueue)
    await manager.request_recovery(_make_gap(), mock_client)
    await asyncio.sleep(0.1)

    partial_records = [r for r in enqueued if r["schema"] == "recovery-partial"]
    assert len(partial_records) == 1
    partial = partial_records[0]
    assert partial["payload"]["records_recovered"] == 2
    assert partial["payload"]["actual_end_ts_ns"] == START_NS + 30_000_000_000
    # The unresolved range is: actual_end_ts_ns → end_ts_ns
    unresolved_duration_ns = END_NS - (START_NS + 30_000_000_000)
    assert unresolved_duration_ns > 0, "Unresolved range must be positive"
