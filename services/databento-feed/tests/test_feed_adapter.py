"""
Atlas Databento Feed Adapter — Feed Adapter Tests
Sprint 123A.2 — Fixture-based unit tests

Tests the DatabentoFeedAdapter using mocks and fixtures only.
No live Databento connection. No live bridge connection.
"""

import asyncio
import json
import os
import pytest
import pytest_asyncio
from unittest.mock import AsyncMock, MagicMock, patch, call

# Set required environment variables before importing the adapter
os.environ.setdefault("DATABENTO_API_KEY", "db-test-fixture-key-not-real")
os.environ.setdefault("BRIDGE_AUTH_TOKEN", "test-bridge-token-not-real")

from feed_adapter import (
    DatabentoFeedAdapter,
    AdapterConfig,
    BRIDGE_QUEUE_MAX,
    RECONNECT_MAX_DELAY_S,
)
from bridge_records import BRIDGE_PROTOCOL_VERSION


# ── Fixtures ───────────────────────────────────────────────────────────────────

@pytest.fixture
def config():
    return AdapterConfig()


@pytest.fixture
def adapter(config):
    return DatabentoFeedAdapter(config)


# ── AdapterConfig tests ────────────────────────────────────────────────────────

class TestAdapterConfig:
    def test_api_key_is_accessible(self, config):
        assert config.api_key == "db-test-fixture-key-not-real"

    def test_api_key_not_in_repr(self, config):
        """SECURITY: API key must not appear in repr or str."""
        assert "db-test-fixture-key-not-real" not in repr(config)
        assert "db-test-fixture-key-not-real" not in str(config)

    def test_bridge_token_is_accessible(self, config):
        assert config.bridge_token == "test-bridge-token-not-real"

    def test_bridge_token_not_in_repr(self, config):
        """SECURITY: Bridge token must not appear in repr or str."""
        assert "test-bridge-token-not-real" not in repr(config)

    def test_missing_api_key_raises(self):
        original = os.environ.pop("DATABENTO_API_KEY", None)
        try:
            with pytest.raises(EnvironmentError, match="DATABENTO_API_KEY"):
                AdapterConfig()
        finally:
            if original:
                os.environ["DATABENTO_API_KEY"] = original

    def test_missing_bridge_token_raises(self):
        original = os.environ.pop("BRIDGE_AUTH_TOKEN", None)
        try:
            with pytest.raises(EnvironmentError, match="BRIDGE_AUTH_TOKEN"):
                AdapterConfig()
        finally:
            if original:
                os.environ["BRIDGE_AUTH_TOKEN"] = original

    def test_bridge_port_defaults_to_9876(self, config):
        assert config.bridge_port == 9876


# ── Backpressure tests ─────────────────────────────────────────────────────────

class TestBackpressure:
    @pytest.mark.asyncio
    async def test_queue_drops_oldest_when_full(self, adapter):
        """
        When queue is full and an authoritative (trades) record arrives,
        the adapter enters DEGRADED state, drops the oldest record to make
        room for a gap-detected event, and logs a warning.

        NOTE: The schema-aware overflow policy (WS1) changed the backpressure
        behaviour. Authoritative overflow now emits a gap-detected record and
        triggers recovery, rather than simply dropping the oldest with a
        'Backpressure' log. The test has been updated to match.
        """
        import time
        from feed_adapter import FeedState

        # Fill the queue to capacity with trades records
        for i in range(BRIDGE_QUEUE_MAX):
            await adapter._queue.put({"schema": "trades", "seq": i})

        assert adapter._queue.full()

        # Enqueue one more authoritative record via _enqueue_authoritative
        # (which is what _enqueue delegates to for authoritative schemas)
        ts_ns = int(time.time() * 1_000_000_000)
        with patch.object(adapter, "_request_recovery", new_callable=AsyncMock):
            await adapter._enqueue_authoritative(
                "trades",
                {"schema": "trades", "seq": BRIDGE_QUEUE_MAX},
                ts_ns,
            )

        # Adapter should now be in DEGRADED state
        assert adapter._feed_state == FeedState.DEGRADED

        # Queue should still be at max capacity (oldest dropped, gap-detected added)
        assert adapter._queue.qsize() == BRIDGE_QUEUE_MAX

    @pytest.mark.asyncio
    async def test_queue_accepts_records_when_not_full(self, adapter):
        """Records are enqueued normally when queue is not full."""
        await adapter._enqueue({"schema": "trades", "seq": 1})
        assert adapter._queue.qsize() == 1

    @pytest.mark.asyncio
    async def test_queue_max_size_is_1000(self, adapter):
        assert BRIDGE_QUEUE_MAX == 1000


# ── Reconnect policy tests ─────────────────────────────────────────────────────

class TestReconnectPolicy:
    @pytest.mark.asyncio
    async def test_reconnect_max_delay_is_60s(self):
        assert RECONNECT_MAX_DELAY_S == 60.0

    @pytest.mark.asyncio
    async def test_stops_after_max_reconnect_attempts(self, adapter):
        """Adapter stops and emits OFFLINE health after MAX_RECONNECT_ATTEMPTS failures."""
        from feed_adapter import MAX_RECONNECT_ATTEMPTS

        call_count = 0

        async def failing_connect():
            nonlocal call_count
            call_count += 1
            raise ConnectionError("Simulated connection failure")

        enqueued_health = []

        async def mock_enqueue_health(status, reason):
            enqueued_health.append({"status": status, "reason": reason})

        adapter._connect_and_receive = failing_connect
        # NOTE: The OFFLINE health is enqueued via _enqueue_low_priority (not
        # _enqueue_feed_health directly). Mock _enqueue_low_priority to capture it.
        enqueued_low_priority = []

        async def mock_enqueue_low_priority(record):
            enqueued_low_priority.append(record)

        adapter._enqueue_low_priority = mock_enqueue_low_priority

        # Patch asyncio.sleep to avoid actual waiting
        with patch("asyncio.sleep", new_callable=AsyncMock):
            await adapter._databento_receive_loop()

        # The loop calls _connect_and_receive once initially (attempt 0), then
        # MAX_RECONNECT_ATTEMPTS times on retry before stopping (stops when
        # _reconnect_attempts > MAX_RECONNECT_ATTEMPTS, i.e. at attempt 21).
        assert call_count == MAX_RECONNECT_ATTEMPTS + 1

        # Find the OFFLINE feed-health record in the enqueued low-priority records
        offline_events = [
            r for r in enqueued_low_priority
            if r.get("payload", {}).get("status") == "OFFLINE"
        ]
        assert len(offline_events) == 1

    @pytest.mark.asyncio
    async def test_reconnect_attempt_counter_resets_on_success(self, adapter):
        """Reconnect attempt counter resets when connection succeeds."""
        adapter._reconnect_attempts = 5

        async def successful_connect():
            adapter._reconnect_attempts = 0  # simulates what _connect_and_receive does
            adapter._stopped = True  # stop after first success

        adapter._connect_and_receive = successful_connect

        with patch("asyncio.sleep", new_callable=AsyncMock):
            await adapter._databento_receive_loop()

        assert adapter._reconnect_attempts == 0


# ── Secret safety tests ────────────────────────────────────────────────────────

class TestSecretSafety:
    @pytest.mark.asyncio
    async def test_api_key_not_in_any_bridge_record(self, adapter):
        """SECURITY: API key must never appear in any enqueued bridge record."""
        import logging

        # Simulate a trade record being enqueued
        await adapter._enqueue({
            "version": BRIDGE_PROTOCOL_VERSION,
            "schema": "trades",
            "ts_sent_ms": 1700000000000,
            "payload": {
                "instrument_id": 12345,
                "price_usd": 18500.25,
                "canonical_symbol": "MNQ1!",
            }
        })

        record = await adapter._queue.get()
        record_str = json.dumps(record)
        assert "db-test-fixture-key-not-real" not in record_str
        assert "api_key" not in record_str.lower()

    @pytest.mark.asyncio
    async def test_bridge_token_not_in_any_bridge_record(self, adapter):
        """SECURITY: Bridge token must never appear in any bridge record payload."""
        await adapter._enqueue({
            "version": BRIDGE_PROTOCOL_VERSION,
            "schema": "feed-health",
            "ts_sent_ms": 1700000000000,
            "payload": {"status": "CONNECTED"},
        })
        record = await adapter._queue.get()
        record_str = json.dumps(record)
        assert "test-bridge-token-not-real" not in record_str

    def test_api_key_not_logged_on_startup(self, config):
        """SECURITY: API key must be redacted in log output."""
        from feed_adapter import _redact_key
        redacted = _redact_key(config.api_key)
        assert config.api_key not in redacted
        assert "****" in redacted
        # First 4 chars are shown as a hint
        assert redacted.startswith(config.api_key[:4])


# ── Authority boundary tests ───────────────────────────────────────────────────

class TestAuthorityBoundary:
    @pytest.mark.asyncio
    async def test_feed_adapter_does_not_construct_canonical_bars(self, adapter):
        """
        AUTHORITY: Python adapter must not construct canonical bars.
        ohlcv-1m records are forwarded as-is to the bridge.
        TypeScript Atlas constructs canonical bars.
        """
        enqueued = []

        async def capture_enqueue(record):
            enqueued.append(record)

        # NOTE: _handle_ohlcv calls _enqueue_authoritative, not _enqueue.
        # Mock _enqueue_authoritative to capture the record.
        enqueued_auth = []

        async def capture_enqueue_auth(schema, record, ts_ns):
            enqueued_auth.append(record)

        adapter._enqueue_authoritative = capture_enqueue_auth

        # Simulate an ohlcv-1m record
        mock_record = MagicMock()
        mock_record.instrument_id = 12345
        mock_record.ts_event = 1_700_000_000_000_000_000
        mock_record.open = 18_490_000_000_000  # DBN fixed-point
        mock_record.high = 18_510_000_000_000
        mock_record.low = 18_485_000_000_000
        mock_record.close = 18_500_250_000_000
        mock_record.volume = 150

        adapter._resolver._entries = {
            12345: MagicMock(
                canonical_symbol="MNQ1!",
                raw_symbol="MNQM5",
            )
        }
        adapter._resolver.resolve_canonical = MagicMock(return_value="MNQ1!")
        adapter._resolver.resolve_raw = MagicMock(return_value="MNQM5")

        await adapter._handle_ohlcv(mock_record)

        assert len(enqueued_auth) == 1
        payload = enqueued_auth[0]["payload"]

        # Must not contain canonical bar construction fields
        assert "canonical_bar_type" not in payload
        assert "bar_confirmed" not in payload
        assert "contains_unresolved_minutes" not in payload
        assert "processBar" not in str(payload)
        assert "postBarAutomation" not in str(payload)

    @pytest.mark.asyncio
    async def test_feed_adapter_does_not_trigger_processbar(self, adapter):
        """
        AUTHORITY: Python adapter must not trigger processBar.
        processBar is TradingView-owned in Sprint 123A.2.
        """
        # The adapter has no reference to processBar — verify
        import inspect
        source = inspect.getsource(DatabentoFeedAdapter)
        assert "processBar" not in source
        assert "process_bar" not in source

    @pytest.mark.asyncio
    async def test_feed_adapter_does_not_trigger_postbarautomation(self, adapter):
        """
        AUTHORITY: Python adapter must not trigger postBarAutomation.
        """
        import inspect
        source = inspect.getsource(DatabentoFeedAdapter)
        assert "postBarAutomation" not in source
        assert "post_bar_automation" not in source
