"""
Atlas Databento Feed Adapter — Bridge Record Types
Sprint 123A.2 — Databento Adapter and Private Bridge

Defines the versioned, normalised bridge record types that the Python adapter
sends to the TypeScript bridge server. These are the ONLY types that cross
the Python→TypeScript boundary.

AUTHORITY BOUNDARY
------------------
Python is a transport and normalisation adapter ONLY.
- Python normalises raw Databento records into bridge records.
- Python sends bridge records to the TypeScript bridge server.
- TypeScript Atlas is responsible for:
    - candle construction
    - reconciliation
    - canonical bar persistence
    - downstream processing (processBar, postBarAutomation, strategies)

Python MUST NOT:
- construct OHLCV candles
- trigger processBar
- trigger postBarAutomation
- access the Atlas database
- expose DATABENTO_API_KEY in any log, payload, or error message
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Literal, Optional

# ── Bridge protocol version ────────────────────────────────────────────────────
BRIDGE_PROTOCOL_VERSION = "123A.2"

# ── Record schema identifiers ──────────────────────────────────────────────────
BridgeSchema = Literal["trades", "ohlcv-1m", "definition", "symbol-mapping", "feed-health"]


@dataclass
class BridgeEnvelope:
    """
    Outer wrapper for every message sent over the Python→TypeScript bridge.

    Fields:
        version:    Bridge protocol version (must match TypeScript expectation).
        schema:     Record schema identifier.
        ts_sent_ms: Wall-clock milliseconds when the Python adapter sent this record.
        payload:    The normalised record (one of the dataclasses below).
    """
    version: str
    schema: BridgeSchema
    ts_sent_ms: int
    payload: dict

    @staticmethod
    def wrap(schema: BridgeSchema, payload: dict) -> "BridgeEnvelope":
        return BridgeEnvelope(
            version=BRIDGE_PROTOCOL_VERSION,
            schema=schema,
            ts_sent_ms=int(time.time() * 1000),
            payload=payload,
        )

    def to_dict(self) -> dict:
        return {
            "version": self.version,
            "schema": self.schema,
            "ts_sent_ms": self.ts_sent_ms,
            "payload": self.payload,
        }


# ── trades schema ──────────────────────────────────────────────────────────────

@dataclass
class BridgeTradeRecord:
    """
    Normalised trade record from Databento trades schema.

    All prices are in USD (float). Timestamps are in nanoseconds (int)
    to preserve full Databento precision. The TypeScript bridge converts
    to milliseconds for internal use.

    IMPORTANT: This record is raw trade data only.
    TypeScript Atlas constructs OHLCV bars from these records.
    """
    instrument_id: int
    raw_symbol: str
    canonical_symbol: str          # resolved by SymbolResolver before sending
    ts_event_ns: int               # exchange timestamp, nanoseconds UTC
    ts_recv_ns: int                # Databento receive timestamp, nanoseconds UTC
    price_usd: float               # trade price in USD
    size: int                      # number of contracts
    side: Literal["B", "S", "N"]  # B=buy aggressor, S=sell aggressor, N=unknown
    sequence: int
    flags: int

    def to_dict(self) -> dict:
        return {
            "instrument_id": self.instrument_id,
            "raw_symbol": self.raw_symbol,
            "canonical_symbol": self.canonical_symbol,
            "ts_event_ns": self.ts_event_ns,
            "ts_recv_ns": self.ts_recv_ns,
            "price_usd": self.price_usd,
            "size": self.size,
            "side": self.side,
            "sequence": self.sequence,
            "flags": self.flags,
        }


# ── ohlcv-1m schema ────────────────────────────────────────────────────────────

@dataclass
class BridgeOhlcv1mRecord:
    """
    Normalised 1-minute OHLCV bar from Databento ohlcv-1m schema.

    IMPORTANT: This is a RAW Databento bar record, not an Atlas canonical bar.
    TypeScript Atlas performs reconciliation and canonical bar construction.
    Python MUST NOT modify, filter, or aggregate these records.
    """
    instrument_id: int
    raw_symbol: str
    canonical_symbol: str
    ts_event_ns: int    # bar open timestamp, nanoseconds UTC
    open_usd: float
    high_usd: float
    low_usd: float
    close_usd: float
    volume: int
    vwap_usd: Optional[float]   # volume-weighted average price if available

    def to_dict(self) -> dict:
        return {
            "instrument_id": self.instrument_id,
            "raw_symbol": self.raw_symbol,
            "canonical_symbol": self.canonical_symbol,
            "ts_event_ns": self.ts_event_ns,
            "open_usd": self.open_usd,
            "high_usd": self.high_usd,
            "low_usd": self.low_usd,
            "close_usd": self.close_usd,
            "volume": self.volume,
            "vwap_usd": self.vwap_usd,
        }


# ── definition schema ──────────────────────────────────────────────────────────

@dataclass
class BridgeDefinitionRecord:
    """
    Normalised instrument definition from Databento definition schema.
    Used to resolve instrument_id → symbol mappings.
    """
    instrument_id: int
    raw_symbol: str
    instrument_class: str   # e.g. "FUT" for futures
    asset: str              # e.g. "MNQ"
    currency: str           # e.g. "USD"
    min_price_increment: float
    display_factor: float
    expiration_ts_ns: int
    ts_recv_ns: int

    def to_dict(self) -> dict:
        return {
            "instrument_id": self.instrument_id,
            "raw_symbol": self.raw_symbol,
            "instrument_class": self.instrument_class,
            "asset": self.asset,
            "currency": self.currency,
            "min_price_increment": self.min_price_increment,
            "display_factor": self.display_factor,
            "expiration_ts_ns": self.expiration_ts_ns,
            "ts_recv_ns": self.ts_recv_ns,
        }


# ── symbol-mapping schema ──────────────────────────────────────────────────────

@dataclass
class BridgeSymbolMappingRecord:
    """
    Normalised symbol mapping record from Databento symbol-mapping schema.
    Maps raw contract symbols (e.g. "MNQM5") to continuous symbols (e.g. "MNQ.v.0").
    """
    instrument_id: int
    stype_in_symbol: str    # input symbol type (e.g. "MNQ.v.0")
    stype_out_symbol: str   # output symbol type (e.g. "MNQM5")
    start_ts_ns: int
    end_ts_ns: int          # 0 = no expiry

    def to_dict(self) -> dict:
        return {
            "instrument_id": self.instrument_id,
            "stype_in_symbol": self.stype_in_symbol,
            "stype_out_symbol": self.stype_out_symbol,
            "start_ts_ns": self.start_ts_ns,
            "end_ts_ns": self.end_ts_ns,
        }


# ── feed-health schema ─────────────────────────────────────────────────────────

FeedHealthStatus = Literal[
    "UNKNOWN",
    "CONNECTED",
    "DEGRADED",
    "RECONNECTING",
    "FALLBACK_ACTIVE",
    "OFFLINE",
]


@dataclass
class BridgeFeedHealthRecord:
    """
    Feed health status update from the Python adapter.
    Sent whenever the adapter's connection state changes.
    """
    status: FeedHealthStatus
    reason: Optional[str]
    reconnect_attempt: int
    last_record_ts_ms: Optional[int]   # wall-clock ms of last received record
    ts_ms: int = field(default_factory=lambda: int(time.time() * 1000))

    def to_dict(self) -> dict:
        return {
            "status": self.status,
            "reason": self.reason,
            "reconnect_attempt": self.reconnect_attempt,
            "last_record_ts_ms": self.last_record_ts_ms,
            "ts_ms": self.ts_ms,
        }
