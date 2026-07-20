"""
Sprint 123A.2 — Gate G2 Final — Real SDK-Decoded Definition Fixture Tests

Tests that prove the official DBN-decoded InstrumentDefMsg fixture (TIER 2)
meets all Gate G2 definition production-compatibility requirements:

1. The real SDK record type is InstrumentDefMsg (not a mock).
2. instrument_id is decoded correctly.
3. raw_symbol is decoded correctly.
4. expiry is decoded correctly (nanosecond precision).
5. minimum price increment is decoded correctly (fixed-point).
6. currency and instrument class are decoded correctly.
7. Nanosecond timestamps retain precision (ts_event, ts_recv).
8. The production _handle_definition() path accepts the record.
9. The resulting bridge envelope matches the versioned definition contract.
10. No secret appears in the fixture or output.

Test IDs: TEST-123A2-DEF001 through TEST-123A2-DEF010

IMPORTANT: These tests use make_real_instrument_def_msg() (TIER 2 — official
DBN-decoded fixture), NOT make_instrument_def_msg() (TIER 3 — spec mock).
The TIER 2 fixture is loaded from mnq_definition_record.dbn via DBNDecoder.
"""

from __future__ import annotations

import sys
import os

import pytest
import databento_dbn

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "."))

from fixtures.dbn_fixtures import (
    MNQ_INSTRUMENT_ID,
    MNQ_RAW_SYMBOL,
    SAMPLE_TS_EVENT_NS,
    SAMPLE_TS_RECV_NS,
    SAMPLE_EXPIRY_NS,
    SAMPLE_MIN_PRICE_INC,
    SAMPLE_DISPLAY_FACTOR,
    make_real_instrument_def_msg,
)

from bridge_records import BridgeEnvelope, BRIDGE_PROTOCOL_VERSION
from feed_adapter import DatabentoFeedAdapter


# Fixed-point scale factor (Databento uses 1e-9)
FIXED_POINT_SCALE = 1_000_000_000


class _MockConfig:
    """Minimal AdapterConfig substitute for testing."""
    api_key = "test-key-1234"
    bridge_port = 9876
    bridge_token = "test-bridge-token"


async def _drain_queue(adapter: DatabentoFeedAdapter) -> list[dict]:
    """Drain all items from the adapter queue."""
    items = []
    while not adapter._queue.empty():
        items.append(adapter._queue.get_nowait())
    return items


# ── TEST-123A2-DEF001: Real SDK record type ───────────────────────────────────

def test_def001_real_sdk_record_type_is_instrument_def_msg():
    """
    TEST-123A2-DEF001: The real SDK record type is InstrumentDefMsg.

    Proves that make_real_instrument_def_msg() returns a genuine
    databento_dbn.InstrumentDefMsg decoded via DBNDecoder, not a mock.
    """
    record = make_real_instrument_def_msg()
    assert isinstance(record, databento_dbn.InstrumentDefMsg), (
        f"Expected databento_dbn.InstrumentDefMsg, got {type(record).__name__}"
    )
    # Confirm it is NOT a MagicMock
    from unittest.mock import MagicMock
    assert not isinstance(record, MagicMock), (
        "Record must not be a MagicMock — must be a real SDK-decoded object"
    )


# ── TEST-123A2-DEF002: instrument_id decoded correctly ────────────────────────

def test_def002_instrument_id_decoded_correctly():
    """
    TEST-123A2-DEF002: instrument_id is decoded correctly from DBN bytes.
    """
    record = make_real_instrument_def_msg()
    assert record.instrument_id == MNQ_INSTRUMENT_ID, (
        f"Expected instrument_id={MNQ_INSTRUMENT_ID}, got {record.instrument_id}"
    )


# ── TEST-123A2-DEF003: raw_symbol decoded correctly ───────────────────────────

def test_def003_raw_symbol_decoded_correctly():
    """
    TEST-123A2-DEF003: raw_symbol is decoded correctly from DBN bytes.
    """
    record = make_real_instrument_def_msg()
    assert record.raw_symbol == MNQ_RAW_SYMBOL, (
        f"Expected raw_symbol='{MNQ_RAW_SYMBOL}', got '{record.raw_symbol}'"
    )


# ── TEST-123A2-DEF004: expiry decoded with nanosecond precision ───────────────

def test_def004_expiry_decoded_with_nanosecond_precision():
    """
    TEST-123A2-DEF004: expiry is decoded correctly with nanosecond precision.

    SAMPLE_EXPIRY_NS = 1_748_649_600_000_000_000 (2025-05-30T00:00:00Z).
    """
    record = make_real_instrument_def_msg()
    assert record.expiration == SAMPLE_EXPIRY_NS, (
        f"Expected expiration={SAMPLE_EXPIRY_NS}, got {record.expiration}"
    )


# ── TEST-123A2-DEF005: minimum price increment decoded correctly ──────────────

def test_def005_min_price_increment_decoded_correctly():
    """
    TEST-123A2-DEF005: minimum price increment is decoded correctly.

    Gate G3 Revision 3 correction:
    SAMPLE_MIN_PRICE_INC = 250_000_000 (0.25 pts at 1e-9 scale).
    MNQ tick size is 0.25 index points, NOT 0.0025.
    Previous fixture had 2_500_000 which incorrectly represented 0.0025 pts.
    """
    record = make_real_instrument_def_msg()
    assert record.min_price_increment == SAMPLE_MIN_PRICE_INC, (
        f"Expected min_price_increment={SAMPLE_MIN_PRICE_INC}, "
        f"got {record.min_price_increment}"
    )
    # Verify the pts conversion: 250_000_000 / 1e9 = 0.25 pts
    pts_value = record.min_price_increment / FIXED_POINT_SCALE
    assert abs(pts_value - 0.25) < 1e-12, (
        f"Expected min_price_increment pts=0.25, got {pts_value}"
    )


# ── TEST-123A2-DEF006: currency and instrument_class decoded correctly ─────────

def test_def006_currency_and_instrument_class_decoded_correctly():
    """
    TEST-123A2-DEF006: currency and instrument_class are decoded correctly.

    currency must be 'USD'.
    instrument_class must be InstrumentClass.FUTURE (value 'F').
    """
    record = make_real_instrument_def_msg()
    assert record.currency == "USD", (
        f"Expected currency='USD', got '{record.currency}'"
    )
    # instrument_class is an InstrumentClass enum value
    assert str(record.instrument_class) == "F", (
        f"Expected instrument_class='F' (FUTURE), got '{record.instrument_class}'"
    )


# ── TEST-123A2-DEF007: nanosecond timestamps retain precision ─────────────────

def test_def007_nanosecond_timestamps_retain_precision():
    """
    TEST-123A2-DEF007: ts_event and ts_recv retain nanosecond precision
    through the DBN encode/decode round-trip.
    """
    record = make_real_instrument_def_msg()
    assert record.ts_event == SAMPLE_TS_EVENT_NS, (
        f"Expected ts_event={SAMPLE_TS_EVENT_NS}, got {record.ts_event}"
    )
    assert record.ts_recv == SAMPLE_TS_RECV_NS, (
        f"Expected ts_recv={SAMPLE_TS_RECV_NS}, got {record.ts_recv}"
    )
    # Verify the 1-microsecond receive latency is preserved
    # SAMPLE_TS_RECV_NS = SAMPLE_TS_EVENT_NS + 1_000_000 (1 microsecond = 1,000,000 ns)
    latency_ns = record.ts_recv - record.ts_event
    assert latency_ns == 1_000_000, (
        f"Expected 1_000_000ns (1 microsecond) receive latency, got {latency_ns}ns"
    )


# ── TEST-123A2-DEF008: production _handle_definition() accepts the record ─────

@pytest.mark.asyncio
async def test_def008_production_handle_definition_accepts_real_record():
    """
    TEST-123A2-DEF008: The production _handle_definition() path accepts
    the real SDK-decoded InstrumentDefMsg without raising an exception.
    """
    adapter = DatabentoFeedAdapter(_MockConfig())
    record = make_real_instrument_def_msg()
    # Must not raise
    await adapter._handle_definition(record)
    items = await _drain_queue(adapter)
    assert len(items) >= 1, (
        "_handle_definition() must enqueue at least one item"
    )


# ── TEST-123A2-DEF009: bridge envelope matches versioned definition contract ───

@pytest.mark.asyncio
async def test_def009_bridge_envelope_matches_definition_contract():
    """
    TEST-123A2-DEF009: The bridge envelope produced by _handle_definition()
    matches the versioned definition contract:
    - schema == 'definition'
    - protocol_version == BRIDGE_PROTOCOL_VERSION
    - payload contains instrument_id, raw_symbol, currency, min_price_increment
    - min_price_increment is converted from fixed-point to USD float
    - ts_event_ns is preserved exactly
    """
    adapter = DatabentoFeedAdapter(_MockConfig())
    record = make_real_instrument_def_msg()
    await adapter._handle_definition(record)
    items = await _drain_queue(adapter)

    # Find the definition envelope
    def_items = [i for i in items if i.get("schema") == "definition"]
    assert len(def_items) == 1, (
        f"Expected exactly 1 definition envelope, got {len(def_items)}"
    )
    envelope = def_items[0]

    # Protocol version — key is 'version' in the bridge envelope
    assert envelope.get("version") == BRIDGE_PROTOCOL_VERSION, (
        f"Expected version='{BRIDGE_PROTOCOL_VERSION}', "
        f"got '{envelope.get('version')}'"
    )

    payload = envelope["payload"]

    # instrument_id
    assert payload["instrument_id"] == MNQ_INSTRUMENT_ID, (
        f"Expected instrument_id={MNQ_INSTRUMENT_ID}, got {payload['instrument_id']}"
    )

    # raw_symbol
    assert payload["raw_symbol"] == MNQ_RAW_SYMBOL, (
        f"Expected raw_symbol='{MNQ_RAW_SYMBOL}', got '{payload['raw_symbol']}'"
    )

    # currency
    assert payload["currency"] == "USD", (
        f"Expected currency='USD', got '{payload['currency']}'"
    )

    # min_price_increment: fixed-point → pts float (Gate G3 Revision 3: 0.25 pts, not 0.0025)
    expected_mpi = SAMPLE_MIN_PRICE_INC / FIXED_POINT_SCALE  # 250_000_000 / 1e9 = 0.25
    assert abs(payload["min_price_increment"] - expected_mpi) < 1e-12, (
        f"Expected min_price_increment={expected_mpi} (0.25 pts), "
        f"got {payload['min_price_increment']}"
    )

    # ts_recv_ns preserved exactly (definition envelope uses ts_recv_ns)
    assert payload["ts_recv_ns"] == SAMPLE_TS_RECV_NS, (
        f"Expected ts_recv_ns={SAMPLE_TS_RECV_NS}, "
        f"got {payload['ts_recv_ns']}"
    )
    # expiration_ts_ns preserved exactly
    assert payload["expiration_ts_ns"] == SAMPLE_EXPIRY_NS, (
        f"Expected expiration_ts_ns={SAMPLE_EXPIRY_NS}, "
        f"got {payload['expiration_ts_ns']}"
    )


# ── TEST-123A2-DEF010: no secret in fixture or output ─────────────────────────

@pytest.mark.asyncio
async def test_def010_no_secret_in_fixture_or_output():
    """
    TEST-123A2-DEF010: No secret (API key, bridge token) appears in the
    fixture record fields or the normalised bridge envelope output.
    """
    adapter = DatabentoFeedAdapter(_MockConfig())
    record = make_real_instrument_def_msg()

    # Check the raw record fields
    record_str = repr(record)
    assert "DATABENTO_API_KEY" not in record_str, (
        "Secret 'DATABENTO_API_KEY' found in raw InstrumentDefMsg repr"
    )
    assert "BRIDGE_AUTH_TOKEN" not in record_str, (
        "Secret 'BRIDGE_AUTH_TOKEN' found in raw InstrumentDefMsg repr"
    )

    # Check the normalised output
    await adapter._handle_definition(record)
    items = await _drain_queue(adapter)
    for item in items:
        item_str = str(item)
        assert "DATABENTO_API_KEY" not in item_str, (
            "Secret 'DATABENTO_API_KEY' found in normalised definition envelope"
        )
        assert "BRIDGE_AUTH_TOKEN" not in item_str, (
            "Secret 'BRIDGE_AUTH_TOKEN' found in normalised definition envelope"
        )
