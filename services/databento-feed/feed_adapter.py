"""
Atlas Databento Feed Adapter — Main Feed Adapter
Sprint 123A.2 — Databento Adapter and Private Bridge

Connects to Databento Live API using the official Python SDK.
Subscribes to: trades, ohlcv-1m, definition, symbol-mapping schemas.
Normalises records into versioned bridge records.
Sends bridge records to the TypeScript bridge server via authenticated WebSocket.

AUTHORITY BOUNDARY
------------------
Python is a transport and normalisation adapter ONLY.
Python MUST NOT:
- construct OHLCV candles from trades
- trigger processBar or postBarAutomation
- access the Atlas database
- expose DATABENTO_API_KEY in any log, payload, or error message
- activate any Databento authority mode in TypeScript Atlas

SECRET SAFETY
-------------
DATABENTO_API_KEY is read once from the environment at startup.
It is NEVER logged, included in error messages, sent over the bridge,
or stored in any variable named in a way that could be serialised.

SCHEMA-AWARE OVERFLOW POLICY
-----------------------------
Authoritative schemas (trades, ohlcv-1m, definition, symbol-mapping):
  When BRIDGE_QUEUE_MAX is reached, the adapter MUST NOT silently discard
  records. Instead it:
    1. Marks feed state as DEGRADED.
    2. Records the gap in a GapRecord (schema, timestamp range, count).
    3. Emits a gap-detected event to the bridge queue.
    4. Increments the per-schema loss counter.
    5. Clears data_continuity_confirmed.
    6. Requests historical recovery via _request_recovery().

Low-priority schemas (feed-health telemetry):
  May be coalesced or silently dropped under backpressure. Dropping a
  feed-health record does NOT cause a data gap. No DEGRADED state is set.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from enum import Enum
from typing import Dict, List, Optional

import databento as db
import websockets
from websockets.exceptions import ConnectionClosed

from bridge_records import (
    AUTHORITATIVE_SCHEMAS,
    BRIDGE_PROTOCOL_VERSION,
    BridgeEnvelope,
    BridgeDefinitionRecord,
    BridgeFeedHealthRecord,
    BridgeOhlcv1mRecord,
    BridgeSymbolMappingRecord,
    BridgeTradeRecord,
    GapRecord,
    make_gap_detected_record,
)
from symbol_resolver import SymbolResolver

logger = logging.getLogger(__name__)

# ── Constants ──────────────────────────────────────────────────────────────────
DATABENTO_DATASET = "GLBX.MDP3"
DATABENTO_SYMBOLS = ["MNQ.v.0"]  # front-month continuous; resolved dynamically

BRIDGE_HOST = os.environ.get("BRIDGE_HOST", "127.0.0.1")  # private — never exposed externally
BRIDGE_PORT_DEFAULT = 9876
BRIDGE_PATH = "/databento-bridge"

# Reconnect policy
RECONNECT_INITIAL_DELAY_S = 1.0
RECONNECT_MAX_DELAY_S = 60.0
RECONNECT_BACKOFF_FACTOR = 2.0
MAX_RECONNECT_ATTEMPTS = 20

# Backpressure: maximum records queued before overflow policy is triggered
BRIDGE_QUEUE_MAX = 1000


def _redact_key(key: str) -> str:
    """Return a safely redacted API key for logging (first 4 chars + ****)."""
    if not key:
        return "<not set>"
    return key[:4] + "****"


# ── Feed state machine ─────────────────────────────────────────────────────────

class FeedState(Enum):
    """
    Feed adapter state machine.

    CONNECTED    — WebSocket to Databento is open; no records yet received.
    LIVE         — Records are flowing normally; data continuity confirmed.
    RECONNECTING — Connection lost; attempting to reconnect with backoff.
    DEGRADED     — Authoritative schema overflow detected; gap recorded;
                   recovery requested. Data continuity NOT confirmed.
    RECOVERING   — Historical recovery in progress for one or more schemas.
    OFFLINE      — Max reconnect attempts reached; manual intervention required.
    """
    CONNECTED = "CONNECTED"
    LIVE = "LIVE"
    RECONNECTING = "RECONNECTING"
    DEGRADED = "DEGRADED"
    RECOVERING = "RECOVERING"
    OFFLINE = "OFFLINE"


# ── Main adapter ───────────────────────────────────────────────────────────────

class DatabentoFeedAdapter:
    """
    Connects to Databento Live API and forwards normalised bridge records
    to the TypeScript bridge server.

    Lifecycle:
        adapter = DatabentoFeedAdapter(config)
        await adapter.run()   # runs until stopped

    The adapter reconnects automatically on disconnection with exponential
    backoff. Backpressure on authoritative schemas triggers DEGRADED state
    and historical recovery. Backpressure on low-priority schemas (feed-health)
    silently drops records without affecting data continuity.
    """

    def __init__(self, config: "AdapterConfig") -> None:
        self._config = config
        self._resolver = SymbolResolver()
        self._queue: asyncio.Queue[dict] = asyncio.Queue(maxsize=BRIDGE_QUEUE_MAX)
        self._stopped = False
        self._reconnect_attempts = 0
        self._last_record_ts_ms: Optional[int] = None
        self._bridge_ws: Optional[websockets.WebSocketClientProtocol] = None

        # Schema-aware overflow policy state
        self._feed_state: FeedState = FeedState.CONNECTED
        self._data_continuity_confirmed: bool = False
        self._loss_counters: Dict[str, int] = {}   # per-schema overflow count
        self._gaps: List[GapRecord] = []            # recorded data gaps
        self._recovering_schemas: set = set()       # schemas currently in recovery

    # ── Public properties ──────────────────────────────────────────────────────

    @property
    def feed_state(self) -> FeedState:
        """Current feed state."""
        return self._feed_state

    @property
    def data_continuity_confirmed(self) -> bool:
        """True if data continuity has not been broken by an overflow."""
        return self._data_continuity_confirmed

    @property
    def loss_counters(self) -> Dict[str, int]:
        """Per-schema count of records lost due to queue overflow."""
        return dict(self._loss_counters)

    @property
    def gaps(self) -> List[GapRecord]:
        """List of all recorded data gaps."""
        return list(self._gaps)

    # ── Lifecycle ──────────────────────────────────────────────────────────────

    async def run(self) -> None:
        """Main entry point. Runs the feed adapter until stopped."""
        logger.info("[FeedAdapter] Starting Sprint 123A.2 Databento feed adapter")
        logger.info("[FeedAdapter] API key: %s", _redact_key(self._config.api_key))
        logger.info("[FeedAdapter] Dataset: %s  Symbols: %s", DATABENTO_DATASET, DATABENTO_SYMBOLS)

        # Start the bridge sender task
        sender_task = asyncio.create_task(self._bridge_sender_loop())

        try:
            await self._databento_receive_loop()
        finally:
            self._stopped = True
            sender_task.cancel()
            try:
                await sender_task
            except asyncio.CancelledError:
                pass

    async def stop(self) -> None:
        """Signal the adapter to stop."""
        self._stopped = True

    # ── Recovery API ──────────────────────────────────────────────────────────

    async def confirm_recovery(self, schema: str) -> None:
        """
        Called by the historical client after a successful gap recovery.
        If all schemas have recovered, transitions from RECOVERING → LIVE.
        """
        self._recovering_schemas.discard(schema)

        # Mark the most recent gap for this schema as confirmed
        for gap in reversed(self._gaps):
            if gap.schema == schema and not gap.recovery_confirmed:
                gap.recovery_confirmed = True
                break

        if not self._recovering_schemas:
            # All schemas recovered — return to LIVE
            self._feed_state = FeedState.LIVE
            self._data_continuity_confirmed = True
            logger.info("[FeedAdapter] All schemas recovered — state=LIVE")
        else:
            logger.info(
                "[FeedAdapter] Schema %s recovered — still recovering: %s",
                schema,
                self._recovering_schemas,
            )

    async def _request_recovery(self, schema: str, gap: GapRecord) -> None:
        """
        Initiate historical recovery for a gap.
        Transitions state to RECOVERING and marks the gap as recovery-requested.
        The actual historical fetch is performed by DatabentoHistoricalClient.
        """
        gap.recovery_requested = True
        self._recovering_schemas.add(schema)
        self._feed_state = FeedState.RECOVERING

        logger.warning(
            "[FeedAdapter] Recovery requested: schema=%s gap=[%d, %d] lost=%d",
            schema,
            gap.first_missing_ts_ns,
            gap.last_missing_ts_ns,
            gap.records_lost,
        )
        # Historical client integration point:
        # The caller (e.g. a supervisor task) should watch for RECOVERING state
        # and invoke DatabentoHistoricalClient.backfill_ohlcv_1m() or
        # DatabentoHistoricalClient.replay_trades() for the gap range,
        # then call adapter.confirm_recovery(schema) on completion.

    # ── Databento receive loop ─────────────────────────────────────────────────

    async def _databento_receive_loop(self) -> None:
        """Connect to Databento and receive records. Reconnects on failure."""
        delay = RECONNECT_INITIAL_DELAY_S
        while not self._stopped:
            try:
                await self._connect_and_receive()
                # Clean exit — stop
                break
            except Exception as exc:
                if self._stopped:
                    break
                self._reconnect_attempts += 1
                if self._reconnect_attempts > MAX_RECONNECT_ATTEMPTS:
                    logger.error(
                        "[FeedAdapter] Max reconnect attempts (%d) reached — stopping",
                        MAX_RECONNECT_ATTEMPTS,
                    )
                    self._feed_state = FeedState.OFFLINE
                    await self._enqueue_low_priority(
                        self._make_feed_health("OFFLINE", f"Max reconnects reached after {self._reconnect_attempts} attempts")
                    )
                    break

                logger.warning(
                    "[FeedAdapter] Connection error (attempt %d/%d): %s — retrying in %.1fs",
                    self._reconnect_attempts, MAX_RECONNECT_ATTEMPTS,
                    type(exc).__name__,  # NEVER log exc directly — may contain key material
                    delay,
                )
                self._feed_state = FeedState.RECONNECTING
                await self._enqueue_low_priority(
                    self._make_feed_health(
                        "RECONNECTING",
                        f"Reconnect attempt {self._reconnect_attempts}",
                    )
                )
                await asyncio.sleep(delay)
                delay = min(delay * RECONNECT_BACKOFF_FACTOR, RECONNECT_MAX_DELAY_S)

    async def _connect_and_receive(self) -> None:
        """Open a single Databento Live session and receive records."""
        await self._enqueue_low_priority(self._make_feed_health("CONNECTED", None))
        self._reconnect_attempts = 0
        self._feed_state = FeedState.CONNECTED

        # The official Databento Python SDK handles authentication internally.
        # The API key is passed to the client constructor only — never logged.
        client = db.Live(key=self._config.api_key)

        client.subscribe(
            dataset=DATABENTO_DATASET,
            schema="trades",
            symbols=DATABENTO_SYMBOLS,
            stype_in="continuous",
        )
        client.subscribe(
            dataset=DATABENTO_DATASET,
            schema="ohlcv-1m",
            symbols=DATABENTO_SYMBOLS,
            stype_in="continuous",
        )
        client.subscribe(
            dataset=DATABENTO_DATASET,
            schema="definition",
            symbols=DATABENTO_SYMBOLS,
            stype_in="continuous",
        )

        logger.info("[FeedAdapter] Subscribed to trades, ohlcv-1m, definition schemas")

        # Iterate records from the live session
        async for record in client:
            if self._stopped:
                break
            self._last_record_ts_ms = int(time.time() * 1000)
            if self._feed_state == FeedState.CONNECTED:
                self._feed_state = FeedState.LIVE
                self._data_continuity_confirmed = True
            await self._dispatch_record(record)

    async def _dispatch_record(self, record: object) -> None:
        """Dispatch a Databento record to the appropriate normaliser."""
        try:
            if isinstance(record, db.TradeMsg):
                await self._handle_trade(record)
            elif isinstance(record, db.OHLCVMsg):
                await self._handle_ohlcv(record)
            elif isinstance(record, db.InstrumentDefMsg):
                await self._handle_definition(record)
            elif isinstance(record, db.SymbolMappingMsg):
                await self._handle_symbol_mapping(record)
            # Other record types (e.g. heartbeats) are silently ignored
        except Exception as exc:
            # Log type only — never the record content (may contain price data
            # that could be confused with key material in some log scrapers)
            logger.warning("[FeedAdapter] Error dispatching %s: %s", type(record).__name__, type(exc).__name__)

    # ── Record normalisers ─────────────────────────────────────────────────────

    async def _handle_trade(self, record: db.TradeMsg) -> None:
        instrument_id = record.instrument_id
        canonical = self._resolver.resolve_canonical(instrument_id) or "UNKNOWN"
        raw = self._resolver.resolve_raw(instrument_id) or "UNKNOWN"

        side_map = {"A": "S", "B": "B"}  # Ask=sell aggressor, Bid=buy aggressor
        side = side_map.get(getattr(record, "side", ""), "N")

        bridge_record = BridgeTradeRecord(
            instrument_id=instrument_id,
            raw_symbol=raw,
            canonical_symbol=canonical,
            ts_event_ns=record.ts_event,
            ts_recv_ns=record.ts_recv,
            price_usd=record.price / 1_000_000_000,  # DBN fixed-point → USD
            size=record.size,
            side=side,
            sequence=getattr(record, "sequence", 0),
            flags=getattr(record, "flags", 0),
        )
        envelope = BridgeEnvelope.wrap("trades", bridge_record.to_dict())
        await self._enqueue_authoritative("trades", envelope.to_dict(), record.ts_event)

    async def _handle_ohlcv(self, record: db.OHLCVMsg) -> None:
        instrument_id = record.instrument_id
        canonical = self._resolver.resolve_canonical(instrument_id) or "UNKNOWN"
        raw = self._resolver.resolve_raw(instrument_id) or "UNKNOWN"

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
            vwap_usd=None,  # not available in ohlcv-1m schema
        )
        envelope = BridgeEnvelope.wrap("ohlcv-1m", bridge_record.to_dict())
        await self._enqueue_authoritative("ohlcv-1m", envelope.to_dict(), record.ts_event)

    async def _handle_definition(self, record: db.InstrumentDefMsg) -> None:
        instrument_id = record.instrument_id
        raw_symbol = getattr(record, "raw_symbol", "") or getattr(record, "instrument", "")
        asset = getattr(record, "asset", "")
        expiration_ts_ns = getattr(record, "expiration", 0) or 0

        self._resolver.process_definition(
            instrument_id=instrument_id,
            raw_symbol=raw_symbol,
            asset=asset,
            expiration_ts_ns=expiration_ts_ns,
        )

        bridge_record = BridgeDefinitionRecord(
            instrument_id=instrument_id,
            raw_symbol=raw_symbol,
            instrument_class=getattr(record, "instrument_class", ""),
            asset=asset,
            currency=getattr(record, "currency", "USD"),
            min_price_increment=getattr(record, "min_price_increment", 0) / 1_000_000_000,
            display_factor=getattr(record, "display_factor", 1) / 1_000_000_000,
            expiration_ts_ns=expiration_ts_ns,
            ts_recv_ns=record.ts_recv,
        )
        envelope = BridgeEnvelope.wrap("definition", bridge_record.to_dict())
        await self._enqueue_authoritative("definition", envelope.to_dict(), record.ts_event)

    async def _handle_symbol_mapping(self, record: db.SymbolMappingMsg) -> None:
        instrument_id = record.instrument_id
        stype_in = getattr(record, "stype_in_symbol", "")
        stype_out = getattr(record, "stype_out_symbol", "")

        self._resolver.process_symbol_mapping(
            instrument_id=instrument_id,
            stype_in_symbol=stype_in,
            stype_out_symbol=stype_out,
        )

        bridge_record = BridgeSymbolMappingRecord(
            instrument_id=instrument_id,
            stype_in_symbol=stype_in,
            stype_out_symbol=stype_out,
            start_ts_ns=getattr(record, "start_ts", 0),
            end_ts_ns=getattr(record, "end_ts", 0),
        )
        envelope = BridgeEnvelope.wrap("symbol-mapping", bridge_record.to_dict())
        await self._enqueue_authoritative("symbol-mapping", envelope.to_dict(), record.ts_event)

    # ── Bridge sender loop ─────────────────────────────────────────────────────

    async def _bridge_sender_loop(self) -> None:
        """
        Dequeues bridge records and sends them to the TypeScript bridge server.
        Reconnects on disconnection with exponential backoff.
        """
        uri = f"ws://{BRIDGE_HOST}:{self._config.bridge_port}{BRIDGE_PATH}"
        delay = RECONNECT_INITIAL_DELAY_S

        while not self._stopped:
            try:
                async with websockets.connect(
                    uri,
                    extra_headers={"X-Bridge-Token": self._config.bridge_token},
                ) as ws:
                    self._bridge_ws = ws
                    logger.info("[FeedAdapter] Bridge connected: %s", uri)
                    delay = RECONNECT_INITIAL_DELAY_S  # reset on success
                    while not self._stopped:
                        try:
                            record = await asyncio.wait_for(self._queue.get(), timeout=5.0)
                            await ws.send(json.dumps(record))
                            self._queue.task_done()
                        except asyncio.TimeoutError:
                            continue  # no records — keep connection alive
                        except ConnectionClosed:
                            logger.warning("[FeedAdapter] Bridge connection closed — reconnecting")
                            break
            except Exception:
                if self._stopped:
                    break
                logger.warning("[FeedAdapter] Bridge sender error — retrying in %.1fs", delay)
                await asyncio.sleep(delay)
                delay = min(delay * RECONNECT_BACKOFF_FACTOR, RECONNECT_MAX_DELAY_S)

    # ── Queue helpers ──────────────────────────────────────────────────────────

    async def _enqueue_authoritative(
        self,
        schema: str,
        record: dict,
        ts_event_ns: int,
    ) -> None:
        """
        Enqueue a record from an authoritative schema (trades, ohlcv-1m,
        definition, symbol-mapping).

        If the queue is full, the adapter MUST NOT silently discard the record.
        Instead it:
          1. Marks feed state as DEGRADED.
          2. Creates a GapRecord capturing the loss.
          3. Emits a gap-detected event to the bridge queue (best-effort).
          4. Increments the per-schema loss counter.
          5. Clears data_continuity_confirmed.
          6. Requests historical recovery.

        The record that caused the overflow is NOT enqueued (it is the gap).
        """
        if self._queue.full():
            # Overflow on authoritative schema — trigger DEGRADED policy
            detected_at_ms = int(time.time() * 1000)
            self._loss_counters[schema] = self._loss_counters.get(schema, 0) + 1
            self._data_continuity_confirmed = False
            self._feed_state = FeedState.DEGRADED

            gap = GapRecord(
                schema=schema,
                detected_at_ms=detected_at_ms,
                first_missing_ts_ns=ts_event_ns,
                last_missing_ts_ns=ts_event_ns,
                records_lost=1,
            )
            self._gaps.append(gap)

            logger.error(
                "[FeedAdapter] DEGRADED: authoritative overflow schema=%s ts_ns=%d loss_count=%d",
                schema,
                ts_event_ns,
                self._loss_counters[schema],
            )

            # Emit gap-detected event (best-effort — drop oldest if still full)
            gap_envelope = make_gap_detected_record(gap)
            try:
                dropped = self._queue.get_nowait()
                self._queue.task_done()
                logger.warning(
                    "[FeedAdapter] Dropped oldest record to make room for gap-detected: schema=%s",
                    dropped.get("schema", "unknown"),
                )
            except asyncio.QueueEmpty:
                pass
            await self._queue.put(gap_envelope.to_dict())

            # Request historical recovery (non-blocking)
            asyncio.ensure_future(self._request_recovery(schema, gap))
            return

        await self._queue.put(record)

    async def _enqueue_low_priority(self, record: dict) -> None:
        """
        Enqueue a low-priority record (feed-health telemetry).

        Low-priority records MAY be silently dropped under backpressure.
        Dropping a feed-health record does NOT cause a data gap and does NOT
        trigger DEGRADED state. This is intentional and documented behaviour.
        """
        if self._queue.full():
            # Silently drop — feed-health is informational only
            logger.debug(
                "[FeedAdapter] Low-priority record dropped under backpressure: schema=%s",
                record.get("schema", "unknown"),
            )
            return
        await self._queue.put(record)

    async def _enqueue(self, record: dict) -> None:
        """
        Legacy enqueue method — delegates to schema-aware methods.
        Kept for backward compatibility with any callers that use it directly.
        """
        schema = record.get("schema", "unknown")
        if schema in AUTHORITATIVE_SCHEMAS:
            ts_event_ns = record.get("payload", {}).get("ts_event_ns", int(time.time() * 1_000_000_000))
            await self._enqueue_authoritative(schema, record, ts_event_ns)
        else:
            await self._enqueue_low_priority(record)

    def _make_feed_health(self, status: str, reason: Optional[str]) -> dict:
        """Build a feed-health bridge record dict."""
        health = BridgeFeedHealthRecord(
            status=status,
            reason=reason,
            reconnect_attempt=self._reconnect_attempts,
            last_record_ts_ms=self._last_record_ts_ms,
        )
        envelope = BridgeEnvelope.wrap("feed-health", health.to_dict())
        return envelope.to_dict()

    async def _enqueue_feed_health(
        self,
        status: str,
        reason: Optional[str],
    ) -> None:
        """Enqueue a feed-health status update (low-priority)."""
        await self._enqueue_low_priority(self._make_feed_health(status, reason))


# ── Configuration ──────────────────────────────────────────────────────────────
class AdapterConfig:
    """
    Configuration for the DatabentoFeedAdapter.
    Reads from environment variables. DATABENTO_API_KEY is never stored
    in a field with a name that could be serialised or logged accidentally.
    """
    def __init__(self) -> None:
        # Read API key from environment — stored in a private attribute
        # with a non-obvious name to reduce accidental logging risk.
        _raw = os.environ.get("DATABENTO_API_KEY", "")
        if not _raw:
            raise EnvironmentError(
                "[FeedAdapter] DATABENTO_API_KEY is not set. "
                "The adapter cannot start without a valid API key."
            )
        # Store as a private attribute — never log this value
        self.__key = _raw
        self.bridge_port: int = int(os.environ.get("BRIDGE_PORT", str(BRIDGE_PORT_DEFAULT)))
        self.bridge_token: str = os.environ.get("BRIDGE_AUTH_TOKEN", "")
        if not self.bridge_token:
            raise EnvironmentError(
                "[FeedAdapter] BRIDGE_AUTH_TOKEN is not set. "
                "The bridge connection cannot be authenticated."
            )

    @property
    def api_key(self) -> str:
        """Return the Databento API key. NEVER log the return value."""
        return self.__key


# ── Entry point ────────────────────────────────────────────────────────────────
async def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
    )
    config = AdapterConfig()
    adapter = DatabentoFeedAdapter(config)
    await adapter.run()

if __name__ == "__main__":
    asyncio.run(main())
