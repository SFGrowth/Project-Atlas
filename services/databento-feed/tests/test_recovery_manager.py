"""
Tests for recovery_manager.py — RecoveryManager
Sprint 123A.2 Gate G2 Revision 2

Test IDs: TEST-123A2-M001 through TEST-123A2-M008

All tests use mocks — no live Databento API calls.
"""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from recovery_manager import RecoveryManager, RECOVERY_TIMEOUT_S
from bridge_records import (
    GapRecord,
    BridgeEnvelope,
    make_recovery_complete_record,
    make_recovery_failed_record,
)


START_NS = 1_700_000_000_000_000_000
END_NS   = 1_700_000_060_000_000_000


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
    """Mock historical client that yields a recovery-complete immediately."""
    yield make_recovery_complete_record(
        schema="ohlcv-1m",
        records_recovered=0,
        start_ts_ns=start_ns,
        end_ts_ns=end_ns,
    )


async def _failed_stream(symbol, start_ns, end_ns):
    """Mock historical client that yields a recovery-failed immediately."""
    yield make_recovery_failed_record(
        schema="ohlcv-1m",
        reason="Test failure",
        start_ts_ns=start_ns,
        end_ts_ns=end_ns,
        error_code="TEST",
    )


# ── TEST-123A2-M001: gap-detected event is emitted ────────────────────────────

@pytest.mark.asyncio
async def test_gap_detected_event_emitted():
    """TEST-123A2-M001: request_recovery emits a recovery-requested event."""
    enqueued = []

    async def enqueue(record: dict):
        enqueued.append(record)

    mock_client = MagicMock()
    mock_client.backfill_ohlcv_1m = _complete_stream

    manager = RecoveryManager(enqueue_fn=enqueue)
    gap = _make_gap("ohlcv-1m")
    await manager.request_recovery(gap, mock_client)
    await asyncio.sleep(0.05)  # let the task run

    schemas = [r["schema"] for r in enqueued]
    assert "recovery-requested" in schemas


# ── TEST-123A2-M002: recovery-started event is emitted ───────────────────────

@pytest.mark.asyncio
async def test_recovery_started_event_emitted():
    """TEST-123A2-M002: Recovery emits recovery-started before streaming."""
    enqueued = []

    async def enqueue(record: dict):
        enqueued.append(record)

    mock_client = MagicMock()
    mock_client.backfill_ohlcv_1m = _complete_stream

    manager = RecoveryManager(enqueue_fn=enqueue)
    gap = _make_gap("ohlcv-1m")
    await manager.request_recovery(gap, mock_client)
    await asyncio.sleep(0.05)

    schemas = [r["schema"] for r in enqueued]
    assert "recovery-started" in schemas


# ── TEST-123A2-M003: recovery-complete increments recovery_count ─────────────

@pytest.mark.asyncio
async def test_recovery_complete_increments_count():
    """TEST-123A2-M003: Successful recovery increments recovery_count."""
    enqueued = []

    async def enqueue(record: dict):
        enqueued.append(record)

    mock_client = MagicMock()
    mock_client.backfill_ohlcv_1m = _complete_stream

    manager = RecoveryManager(enqueue_fn=enqueue)
    gap = _make_gap("ohlcv-1m")
    await manager.request_recovery(gap, mock_client)
    await asyncio.sleep(0.1)

    assert manager.recovery_count == 1
    assert manager.recovery_failures == 0


# ── TEST-123A2-M004: recovery failure increments failure count ────────────────

@pytest.mark.asyncio
async def test_recovery_failure_increments_failure_count():
    """TEST-123A2-M004: Failed recovery increments recovery_failures."""
    enqueued = []

    async def enqueue(record: dict):
        enqueued.append(record)

    mock_client = MagicMock()
    mock_client.backfill_ohlcv_1m = _failed_stream

    manager = RecoveryManager(enqueue_fn=enqueue)
    gap = _make_gap("ohlcv-1m")
    await manager.request_recovery(gap, mock_client)
    await asyncio.sleep(0.1)

    assert manager.recovery_failures == 1
    assert manager.recovery_count == 0


# ── TEST-123A2-M005: duplicate recovery request is rejected ───────────────────

@pytest.mark.asyncio
async def test_duplicate_recovery_rejected():
    """TEST-123A2-M005: A second recovery request for the same schema is ignored."""
    enqueued = []
    stream_started = 0

    async def enqueue(record: dict):
        enqueued.append(record)

    async def slow_stream(symbol, start_ns, end_ns):
        nonlocal stream_started
        stream_started += 1
        await asyncio.sleep(0.2)   # hold the recovery open
        yield make_recovery_complete_record(
            schema="ohlcv-1m",
            records_recovered=0,
            start_ts_ns=start_ns,
            end_ts_ns=end_ns,
        )

    mock_client = MagicMock()
    mock_client.backfill_ohlcv_1m = slow_stream

    manager = RecoveryManager(enqueue_fn=enqueue)
    gap = _make_gap("ohlcv-1m")

    await manager.request_recovery(gap, mock_client)
    await asyncio.sleep(0.02)   # let first recovery start
    await manager.request_recovery(gap, mock_client)   # duplicate

    assert stream_started == 1   # only one stream was started


# ── TEST-123A2-M006: on_complete callback is called ──────────────────────────

@pytest.mark.asyncio
async def test_on_complete_callback():
    """TEST-123A2-M006: on_complete callback is invoked after successful recovery."""
    enqueued = []
    completed_schemas = []

    async def enqueue(record: dict):
        enqueued.append(record)

    async def on_complete(schema: str):
        completed_schemas.append(schema)

    mock_client = MagicMock()
    mock_client.backfill_ohlcv_1m = _complete_stream

    manager = RecoveryManager(enqueue_fn=enqueue)
    gap = _make_gap("ohlcv-1m")
    await manager.request_recovery(gap, mock_client, on_complete=on_complete)
    await asyncio.sleep(0.1)

    assert "ohlcv-1m" in completed_schemas


# ── TEST-123A2-M007: on_failed callback is called ────────────────────────────

@pytest.mark.asyncio
async def test_on_failed_callback():
    """TEST-123A2-M007: on_failed callback is invoked after failed recovery."""
    enqueued = []
    failed_schemas = []

    async def enqueue(record: dict):
        enqueued.append(record)

    async def on_failed(schema: str):
        failed_schemas.append(schema)

    mock_client = MagicMock()
    mock_client.backfill_ohlcv_1m = _failed_stream

    manager = RecoveryManager(enqueue_fn=enqueue)
    gap = _make_gap("ohlcv-1m")
    await manager.request_recovery(gap, mock_client, on_failed=on_failed)
    await asyncio.sleep(0.1)

    assert "ohlcv-1m" in failed_schemas


# ── TEST-123A2-M008: recovery timeout emits recovery-failed ──────────────────

@pytest.mark.asyncio
async def test_recovery_timeout():
    """TEST-123A2-M008: Recovery timeout emits recovery-failed with TIMEOUT error code."""
    enqueued = []

    async def enqueue(record: dict):
        enqueued.append(record)

    async def hanging_stream(symbol, start_ns, end_ns):
        await asyncio.sleep(9999)  # never completes
        yield make_recovery_complete_record(
            schema="ohlcv-1m",
            records_recovered=0,
            start_ts_ns=start_ns,
            end_ts_ns=end_ns,
        )

    mock_client = MagicMock()
    mock_client.backfill_ohlcv_1m = hanging_stream

    manager = RecoveryManager(enqueue_fn=enqueue)
    gap = _make_gap("ohlcv-1m")

    with patch("recovery_manager.RECOVERY_TIMEOUT_S", 0.05):
        await manager.request_recovery(gap, mock_client)
        await asyncio.sleep(0.2)

    schemas = [r["schema"] for r in enqueued]
    assert "recovery-failed" in schemas
    failed = next(r for r in enqueued if r["schema"] == "recovery-failed")
    assert failed["payload"]["error_code"] == "TIMEOUT"
    assert manager.recovery_failures == 1
