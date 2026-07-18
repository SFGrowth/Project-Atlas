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
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from typing import Optional

import databento as db
import websockets
from websockets.exceptions import ConnectionClosed

from bridge_records import (
    BRIDGE_PROTOCOL_VERSION,
    BridgeEnvelope,
    BridgeFeedHealthRecord,
    BridgeOhlcv1mRecord,
    BridgeSymbolMappingRecord,
    BridgeTradeRecord,
)
from symbol_resolver import SymbolResolver

logger = logging.getLogger(__name__)

# ── Constants ──────────────────────────────────────────────────────────────────
DATABENTO_DATASET = "GLBX.MDP3"
DATABENTO_SYMBOLS = ["MNQ.v.0"]  # front-month continuous; resolved dynamically

BRIDGE_HOST = "127.0.0.1"  # private — never exposed externally
BRIDGE_PORT_DEFAULT = 9876
BRIDGE_PATH = "/databento-bridge"

# Reconnect policy
RECONNECT_INITIAL_DELAY_S = 1.0
RECONNECT_MAX_DELAY_S = 60.0
RECONNECT_BACKOFF_FACTOR = 2.0
MAX_RECONNECT_ATTEMPTS = 20

# Backpressure: maximum records queued before dropping (oldest dropped first)
BRIDGE_QUEUE_MAX = 1000


def _redact_key(key: str) -> str:
    """Return a safely redacted API key for logging (first 4 chars + ****)."""
    if not key:
        return "<not set>"
    return key[:4] + "****"


class DatabentoFeedAdapter:
    """
    Connects to Databento Live API and forwards normalised bridge records
    to the TypeScript bridge server.

    Lifecycle:
        adapter = DatabentoFeedAdapter(config)
        await adapter.run()   # runs until stopped

    The adapter reconnects automatically on disconnection with exponential
    backoff. Backpressure is handled by a bounded asyncio.Queue.
    """

    def __init__(self, config: "AdapterConfig") -> None:
        self._config = config
        self._resolver = SymbolResolver()
        self._queue: asyncio.Queue[dict] = asyncio.Queue(maxsize=BRIDGE_QUEUE_MAX)
        self._stopped = False
        self._reconnect_attempts = 0
        self._last_record_ts_ms: Optional[int] = None
        self._bridge_ws: Optional[websockets.WebSocketClientProtocol] = None

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
                    await self._enqueue_feed_health("OFFLINE", f"Max reconnects reached after {self._reconnect_attempts} attempts")
                    break

                logger.warning(
                    "[FeedAdapter] Connection error (attempt %d/%d): %s — retrying in %.1fs",
                    self._reconnect_attempts, MAX_RECONNECT_ATTEMPTS,
                    type(exc).__name__,  # NEVER log exc directly — may contain key material
                    delay,
                )
                await self._enqueue_feed_health(
                    "RECONNECTING",
                    f"Reconnect attempt {self._reconnect_attempts}",
                )
                await asyncio.sleep(delay)
                delay = min(delay * RECONNECT_BACKOFF_FACTOR, RECONNECT_MAX_DELAY_S)

    async def _connect_and_receive(self) -> None:
        """Open a single Databento Live session and receive records."""
        await self._enqueue_feed_health("CONNECTED", None)
        self._reconnect_attempts = 0

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
        await self._enqueue(envelope.to_dict())

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
        await self._enqueue(envelope.to_dict())

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

        from bridge_records import BridgeDefinitionRecord
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
        await self._enqueue(envelope.to_dict())

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
        await self._enqueue(envelope.to_dict())

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

    async def _enqueue(self, record: dict) -> None:
        """
        Enqueue a bridge record. If the queue is full (backpressure),
        drop the oldest record and log a warning.
        """
        if self._queue.full():
            try:
                dropped = self._queue.get_nowait()
                self._queue.task_done()
                logger.warning(
                    "[FeedAdapter] Backpressure: dropped oldest record schema=%s",
                    dropped.get("schema", "unknown"),
                )
            except asyncio.QueueEmpty:
                pass
        await self._queue.put(record)

    async def _enqueue_feed_health(
        self,
        status: str,
        reason: Optional[str],
    ) -> None:
        """Enqueue a feed-health status update."""
        health = BridgeFeedHealthRecord(
            status=status,
            reason=reason,
            reconnect_attempt=self._reconnect_attempts,
            last_record_ts_ms=self._last_record_ts_ms,
        )
        envelope = BridgeEnvelope.wrap("feed-health", health.to_dict())
        await self._enqueue(envelope.to_dict())


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
