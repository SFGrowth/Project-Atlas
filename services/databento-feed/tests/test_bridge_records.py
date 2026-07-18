"""
Atlas Databento Feed Adapter — Bridge Records Tests
Sprint 123A.2 — Fixture-based unit tests

Tests the bridge record types and BridgeEnvelope serialisation.
All tests use fixtures only — no live Databento connection.
"""

import time
import pytest
from bridge_records import (
    BRIDGE_PROTOCOL_VERSION,
    BridgeEnvelope,
    BridgeTradeRecord,
    BridgeOhlcv1mRecord,
    BridgeDefinitionRecord,
    BridgeSymbolMappingRecord,
    BridgeFeedHealthRecord,
)


# ── Fixtures ───────────────────────────────────────────────────────────────────

@pytest.fixture
def trade_record():
    return BridgeTradeRecord(
        instrument_id=12345,
        raw_symbol="MNQM5",
        canonical_symbol="MNQ1!",
        ts_event_ns=1_700_000_000_000_000_000,
        ts_recv_ns=1_700_000_000_001_000_000,
        price_usd=18_500.25,
        size=2,
        side="B",
        sequence=100001,
        flags=0,
    )


@pytest.fixture
def ohlcv_record():
    return BridgeOhlcv1mRecord(
        instrument_id=12345,
        raw_symbol="MNQM5",
        canonical_symbol="MNQ1!",
        ts_event_ns=1_700_000_000_000_000_000,
        open_usd=18_490.00,
        high_usd=18_510.00,
        low_usd=18_485.00,
        close_usd=18_500.25,
        volume=150,
        vwap_usd=None,
    )


@pytest.fixture
def definition_record():
    return BridgeDefinitionRecord(
        instrument_id=12345,
        raw_symbol="MNQM5",
        instrument_class="FUT",
        asset="MNQ",
        currency="USD",
        min_price_increment=0.25,
        display_factor=1.0,
        expiration_ts_ns=1_750_000_000_000_000_000,
        ts_recv_ns=1_700_000_000_000_000_000,
    )


@pytest.fixture
def symbol_mapping_record():
    return BridgeSymbolMappingRecord(
        instrument_id=12345,
        stype_in_symbol="MNQ.v.0",
        stype_out_symbol="MNQM5",
        start_ts_ns=1_700_000_000_000_000_000,
        end_ts_ns=0,
    )


@pytest.fixture
def feed_health_record():
    return BridgeFeedHealthRecord(
        status="CONNECTED",
        reason=None,
        reconnect_attempt=0,
        last_record_ts_ms=None,
    )


# ── BridgeEnvelope tests ───────────────────────────────────────────────────────

class TestBridgeEnvelope:
    def test_wrap_sets_correct_version(self, trade_record):
        envelope = BridgeEnvelope.wrap("trades", trade_record.to_dict())
        assert envelope.version == BRIDGE_PROTOCOL_VERSION

    def test_wrap_sets_correct_schema(self, trade_record):
        envelope = BridgeEnvelope.wrap("trades", trade_record.to_dict())
        assert envelope.schema == "trades"

    def test_wrap_sets_ts_sent_ms_approximately_now(self, trade_record):
        before = int(time.time() * 1000)
        envelope = BridgeEnvelope.wrap("trades", trade_record.to_dict())
        after = int(time.time() * 1000)
        assert before <= envelope.ts_sent_ms <= after + 10

    def test_to_dict_contains_all_fields(self, trade_record):
        envelope = BridgeEnvelope.wrap("trades", trade_record.to_dict())
        d = envelope.to_dict()
        assert "version" in d
        assert "schema" in d
        assert "ts_sent_ms" in d
        assert "payload" in d

    def test_to_dict_version_is_string(self, trade_record):
        envelope = BridgeEnvelope.wrap("trades", trade_record.to_dict())
        assert isinstance(envelope.to_dict()["version"], str)

    def test_all_schemas_accepted(self):
        schemas = ["trades", "ohlcv-1m", "definition", "symbol-mapping", "feed-health"]
        for schema in schemas:
            envelope = BridgeEnvelope.wrap(schema, {"test": True})
            assert envelope.schema == schema


# ── BridgeTradeRecord tests ────────────────────────────────────────────────────

class TestBridgeTradeRecord:
    def test_to_dict_contains_required_fields(self, trade_record):
        d = trade_record.to_dict()
        required = [
            "instrument_id", "raw_symbol", "canonical_symbol",
            "ts_event_ns", "ts_recv_ns", "price_usd", "size", "side",
            "sequence", "flags",
        ]
        for field in required:
            assert field in d, f"Missing field: {field}"

    def test_price_is_float(self, trade_record):
        assert isinstance(trade_record.to_dict()["price_usd"], float)

    def test_side_is_valid(self, trade_record):
        assert trade_record.to_dict()["side"] in ("B", "S", "N")

    def test_canonical_symbol_is_atlas_alias(self, trade_record):
        # MNQ1! is the Atlas canonical alias — not a Databento symbol
        assert trade_record.to_dict()["canonical_symbol"] == "MNQ1!"

    def test_raw_symbol_is_contract_symbol(self, trade_record):
        # MNQM5 is the raw exchange contract symbol
        assert trade_record.to_dict()["raw_symbol"] == "MNQM5"

    def test_api_key_not_in_dict(self, trade_record):
        """SECURITY: API key must never appear in any bridge record."""
        d = str(trade_record.to_dict())
        # Simulate a key-like string — should not appear
        assert "db-" not in d.lower()
        assert "api_key" not in d.lower()


# ── BridgeOhlcv1mRecord tests ──────────────────────────────────────────────────

class TestBridgeOhlcv1mRecord:
    def test_to_dict_contains_ohlcv_fields(self, ohlcv_record):
        d = ohlcv_record.to_dict()
        for field in ["open_usd", "high_usd", "low_usd", "close_usd", "volume"]:
            assert field in d

    def test_vwap_can_be_none(self, ohlcv_record):
        assert ohlcv_record.to_dict()["vwap_usd"] is None

    def test_high_gte_low(self, ohlcv_record):
        d = ohlcv_record.to_dict()
        assert d["high_usd"] >= d["low_usd"]

    def test_raw_ohlcv_not_an_atlas_canonical_bar(self, ohlcv_record):
        """
        AUTHORITY: ohlcv-1m records are RAW Databento data.
        TypeScript Atlas constructs canonical bars from these.
        The Python adapter must not modify or aggregate them.
        """
        d = ohlcv_record.to_dict()
        # There must be no 'canonical_bar_type' or 'bar_confirmed' field
        assert "canonical_bar_type" not in d
        assert "bar_confirmed" not in d
        assert "contains_unresolved_minutes" not in d


# ── BridgeDefinitionRecord tests ───────────────────────────────────────────────

class TestBridgeDefinitionRecord:
    def test_to_dict_contains_required_fields(self, definition_record):
        d = definition_record.to_dict()
        for field in ["instrument_id", "raw_symbol", "asset", "currency",
                      "min_price_increment", "expiration_ts_ns"]:
            assert field in d

    def test_asset_is_base_symbol(self, definition_record):
        assert definition_record.to_dict()["asset"] == "MNQ"


# ── BridgeSymbolMappingRecord tests ────────────────────────────────────────────

class TestBridgeSymbolMappingRecord:
    def test_to_dict_contains_required_fields(self, symbol_mapping_record):
        d = symbol_mapping_record.to_dict()
        for field in ["instrument_id", "stype_in_symbol", "stype_out_symbol",
                      "start_ts_ns", "end_ts_ns"]:
            assert field in d

    def test_continuous_symbol_format(self, symbol_mapping_record):
        # Databento continuous symbols use "ASSET.v.0" format
        assert symbol_mapping_record.to_dict()["stype_in_symbol"] == "MNQ.v.0"

    def test_raw_symbol_is_contract(self, symbol_mapping_record):
        assert symbol_mapping_record.to_dict()["stype_out_symbol"] == "MNQM5"


# ── BridgeFeedHealthRecord tests ───────────────────────────────────────────────

class TestBridgeFeedHealthRecord:
    def test_to_dict_contains_required_fields(self, feed_health_record):
        d = feed_health_record.to_dict()
        for field in ["status", "reason", "reconnect_attempt",
                      "last_record_ts_ms", "ts_ms"]:
            assert field in d

    def test_valid_statuses(self):
        valid = ["UNKNOWN", "CONNECTED", "DEGRADED", "RECONNECTING",
                 "FALLBACK_ACTIVE", "OFFLINE"]
        for status in valid:
            record = BridgeFeedHealthRecord(
                status=status,
                reason=None,
                reconnect_attempt=0,
                last_record_ts_ms=None,
            )
            assert record.to_dict()["status"] == status

    def test_ts_ms_is_approximately_now(self, feed_health_record):
        before = int(time.time() * 1000)
        d = feed_health_record.to_dict()
        after = int(time.time() * 1000)
        assert before <= d["ts_ms"] <= after + 10
