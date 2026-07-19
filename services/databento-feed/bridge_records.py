"""
Atlas Databento Feed Adapter — Bridge Record Types
Sprint 123A.2 Gate G2 Revision 2

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

RECOVERY EVENT CONTRACTS
------------------------
All recovery events carry a recovery_id (deterministic UUID-like identifier
derived from schema + start_ts_ns + end_ts_ns). No event may contain:
- Databento API key
- Bridge authentication token
- Full environment dumps
- Raw secrets

HEALTH STATES (Section 7)
--------------------------
DISABLED       — bridge not started (TRADINGVIEW_ONLY mode)
STARTING       — adapter initialising
AUTHENTICATING — waiting for first authenticated connection
LIVE           — data flowing normally
DEGRADED       — authoritative overflow detected, recovery pending
BACKPRESSURED  — queue depth >= warning threshold (not yet overflowing)
RECOVERING     — historical recovery in progress
STALE          — no records received within staleness window
OFFLINE        — max reconnects reached or fatal error
ERROR          — unrecoverable error
STOPPED        — adapter stopped cleanly
"""

from __future__ import annotations

import hashlib
import time
from dataclasses import dataclass, field
from typing import Literal, Optional

# ── Bridge protocol version ────────────────────────────────────────────────────
BRIDGE_PROTOCOL_VERSION = "123A.2"

# ── Record schema identifiers ──────────────────────────────────────────────────
BridgeSchema = Literal[
    "trades",
    "ohlcv-1m",
    "definition",
    "symbol-mapping",
    "feed-health",
    "gap-detected",
    "recovery-requested",
    "recovery-started",
    "recovery-progress",
    "recovery-complete",
    "recovery-partial",
    "recovery-failed",
    "backpressure-state",
    "bridge-health",
]

# ── Authoritative schemas — must never be silently dropped ────────────────────
AUTHORITATIVE_SCHEMAS = frozenset({"trades", "ohlcv-1m", "definition", "symbol-mapping"})

# ── Low-priority schemas — may be coalesced or dropped under backpressure ─────
# Feed-health telemetry is informational only. Dropping a feed-health record
# does NOT cause data loss or gap in market data. Under queue pressure,
# these records may be silently discarded to protect authoritative data flow.
# This exception is explicitly documented and tested (see test_overflow_policy.py).
LOW_PRIORITY_SCHEMAS = frozenset({"feed-health", "bridge-health"})

# ── Health states (Section 7) ──────────────────────────────────────────────────
FeedState = Literal[
    "DISABLED",
    "STARTING",
    "AUTHENTICATING",
    "LIVE",
    "DEGRADED",
    "BACKPRESSURED",
    "RECOVERING",
    "STALE",
    "OFFLINE",
    "ERROR",
    "STOPPED",
]

# ── Exceptions ─────────────────────────────────────────────────────────────────

class RecoveryFailedError(Exception):
    """
    Raised when historical recovery for a gap cannot be completed.
    Callers should emit a recovery-failed bridge record and mark the
    feed as DEGRADED with manual intervention required.
    """
    def __init__(self, schema: str, reason: str) -> None:
        self.schema = schema
        self.reason = reason
        super().__init__(f"Recovery failed for schema={schema}: {reason}")


# ── Recovery ID generation ─────────────────────────────────────────────────────

def make_recovery_id(schema: str, start_ts_ns: int, end_ts_ns: int) -> str:
    """
    Generate a deterministic recovery ID from schema + time range.

    The ID is a 16-character hex string derived from SHA-256 of the
    concatenated inputs. It is deterministic (same inputs → same ID),
    safe to log (no secrets), and unique enough for operational tracking.

    Format: "rcv-{16 hex chars}"
    Example: "rcv-a3f2b1c4d5e6f7a8"
    """
    raw = f"{schema}:{start_ts_ns}:{end_ts_ns}"
    digest = hashlib.sha256(raw.encode()).hexdigest()[:16]
    return f"rcv-{digest}"


# ── Gap tracking ───────────────────────────────────────────────────────────────

@dataclass
class GapRecord:
    """
    Records a data gap caused by queue overflow on an authoritative schema.

    Fields:
        schema:                 The authoritative schema that experienced the gap.
        detected_at_ms:         Wall-clock milliseconds when the gap was detected.
        first_missing_ts_ns:    Nanosecond timestamp of the first record that was lost.
        last_missing_ts_ns:     Nanosecond timestamp of the last record that was lost.
        records_lost:           Number of records dropped due to overflow.
        recovery_id:            Deterministic recovery ID for this gap.
        recovery_requested:     True after _request_recovery() has been called.
        recovery_confirmed:     True after confirm_recovery() has been called.
        dataset:                Databento dataset (e.g. "GLBX.MDP3").
        raw_symbol:             Raw contract symbol if available.
        instrument_id:          Instrument ID if available.
    """
    schema: str
    detected_at_ms: int
    first_missing_ts_ns: int
    last_missing_ts_ns: int
    records_lost: int
    recovery_id: str = field(default="")
    recovery_requested: bool = False
    recovery_confirmed: bool = False
    dataset: str = "GLBX.MDP3"
    raw_symbol: str = ""
    instrument_id: int = 0

    def __post_init__(self) -> None:
        if not self.recovery_id:
            self.recovery_id = make_recovery_id(
                self.schema, self.first_missing_ts_ns, self.last_missing_ts_ns
            )


# ── Gap/recovery factory functions ─────────────────────────────────────────────

def make_gap_detected_record(gap: GapRecord) -> "BridgeEnvelope":
    """
    Create a gap-detected bridge envelope from a GapRecord.
    Emitted immediately when an authoritative schema overflows.

    Required fields per Section 4:
    - protocol version (in envelope)
    - recovery_id
    - affected schema
    - dataset
    - raw_symbol (if available)
    - instrument_id (if available)
    - start/end timestamps
    - records_lost
    - atlas_processing_ts_ms
    """
    return BridgeEnvelope.wrap(
        "gap-detected",
        {
            "recovery_id": gap.recovery_id,
            "schema": gap.schema,
            "dataset": gap.dataset,
            "raw_symbol": gap.raw_symbol,
            "instrument_id": gap.instrument_id,
            "detected_at_ms": gap.detected_at_ms,
            "first_missing_ts_ns": gap.first_missing_ts_ns,
            "last_missing_ts_ns": gap.last_missing_ts_ns,
            "records_lost": gap.records_lost,
            "atlas_processing_ts_ms": int(time.time() * 1000),
        },
    )


def make_recovery_requested_record(
    gap: GapRecord,
    retry_count: int = 0,
) -> "BridgeEnvelope":
    """
    Create a recovery-requested bridge envelope.
    Emitted when the adapter requests historical recovery for a gap.
    """
    return BridgeEnvelope.wrap(
        "recovery-requested",
        {
            "recovery_id": gap.recovery_id,
            "schema": gap.schema,
            "dataset": gap.dataset,
            "raw_symbol": gap.raw_symbol,
            "instrument_id": gap.instrument_id,
            "start_ts_ns": gap.first_missing_ts_ns,
            "end_ts_ns": gap.last_missing_ts_ns,
            "retry_count": retry_count,
            "atlas_processing_ts_ms": int(time.time() * 1000),
        },
    )


def make_recovery_started_record(
    recovery_id: str,
    schema: str,
    start_ts_ns: int,
    end_ts_ns: int,
    dataset: str = "GLBX.MDP3",
    raw_symbol: str = "",
    instrument_id: int = 0,
) -> "BridgeEnvelope":
    """
    Create a recovery-started bridge envelope.
    Emitted when the historical client begins fetching records.
    """
    return BridgeEnvelope.wrap(
        "recovery-started",
        {
            "recovery_id": recovery_id,
            "schema": schema,
            "dataset": dataset,
            "raw_symbol": raw_symbol,
            "instrument_id": instrument_id,
            "start_ts_ns": start_ts_ns,
            "end_ts_ns": end_ts_ns,
            "atlas_processing_ts_ms": int(time.time() * 1000),
        },
    )


def make_recovery_progress_record(
    recovery_id: str,
    schema: str,
    records_received: int,
    last_ts_ns: int,
    end_ts_ns: int,
) -> "BridgeEnvelope":
    """
    Create a recovery-progress bridge envelope.
    Emitted periodically during long recoveries to indicate progress.
    """
    return BridgeEnvelope.wrap(
        "recovery-progress",
        {
            "recovery_id": recovery_id,
            "schema": schema,
            "records_received": records_received,
            "last_ts_ns": last_ts_ns,
            "end_ts_ns": end_ts_ns,
            "atlas_processing_ts_ms": int(time.time() * 1000),
        },
    )


def make_recovery_complete_record(
    schema: str,
    records_recovered: int,
    start_ts_ns: int,
    end_ts_ns: int,
    recovery_id: str = "",
    dataset: str = "GLBX.MDP3",
    raw_symbol: str = "",
    instrument_id: int = 0,
) -> "BridgeEnvelope":
    """
    Create a recovery-complete bridge envelope.
    Emitted after historical backfill successfully covers the gap.
    """
    if not recovery_id:
        recovery_id = make_recovery_id(schema, start_ts_ns, end_ts_ns)
    return BridgeEnvelope.wrap(
        "recovery-complete",
        {
            "recovery_id": recovery_id,
            "schema": schema,
            "dataset": dataset,
            "raw_symbol": raw_symbol,
            "instrument_id": instrument_id,
            "records_recovered": records_recovered,
            "start_ts_ns": start_ts_ns,
            "end_ts_ns": end_ts_ns,
            "completion_status": "complete",
            "atlas_processing_ts_ms": int(time.time() * 1000),
        },
    )


def make_recovery_partial_record(
    schema: str,
    records_recovered: int,
    start_ts_ns: int,
    end_ts_ns: int,
    actual_end_ts_ns: int,
    recovery_id: str = "",
    dataset: str = "GLBX.MDP3",
    raw_symbol: str = "",
    instrument_id: int = 0,
) -> "BridgeEnvelope":
    """
    Create a recovery-partial bridge envelope.
    Emitted when the historical stream ends before the requested end_ts_ns.
    """
    if not recovery_id:
        recovery_id = make_recovery_id(schema, start_ts_ns, end_ts_ns)
    return BridgeEnvelope.wrap(
        "recovery-partial",
        {
            "recovery_id": recovery_id,
            "schema": schema,
            "dataset": dataset,
            "raw_symbol": raw_symbol,
            "instrument_id": instrument_id,
            "records_recovered": records_recovered,
            "start_ts_ns": start_ts_ns,
            "end_ts_ns": end_ts_ns,
            "actual_end_ts_ns": actual_end_ts_ns,
            "completion_status": "partial",
            "atlas_processing_ts_ms": int(time.time() * 1000),
        },
    )


def make_recovery_failed_record(
    schema: str,
    reason: str,
    start_ts_ns: int,
    end_ts_ns: int,
    recovery_id: str = "",
    retry_count: int = 0,
    error_code: str = "",
    dataset: str = "GLBX.MDP3",
    raw_symbol: str = "",
    instrument_id: int = 0,
) -> "BridgeEnvelope":
    """
    Create a recovery-failed bridge envelope.
    Emitted after max retries are exhausted or an unrecoverable error occurs.
    """
    if not recovery_id:
        recovery_id = make_recovery_id(schema, start_ts_ns, end_ts_ns)
    return BridgeEnvelope.wrap(
        "recovery-failed",
        {
            "recovery_id": recovery_id,
            "schema": schema,
            "dataset": dataset,
            "raw_symbol": raw_symbol,
            "instrument_id": instrument_id,
            "reason": reason,
            "retry_count": retry_count,
            "error_code": error_code,
            "start_ts_ns": start_ts_ns,
            "end_ts_ns": end_ts_ns,
            "completion_status": "failed",
            "atlas_processing_ts_ms": int(time.time() * 1000),
        },
    )


def make_backpressure_state_record(
    schema: str,
    queue_depth: int,
    queue_capacity: int,
    backpressure_count: int,
    state: str,
) -> "BridgeEnvelope":
    """
    Create a backpressure-state bridge envelope.
    Emitted when the queue depth crosses a threshold (BACKPRESSURED or DEGRADED).
    """
    return BridgeEnvelope.wrap(
        "backpressure-state",
        {
            "schema": schema,
            "queue_depth": queue_depth,
            "queue_capacity": queue_capacity,
            "backpressure_count": backpressure_count,
            "state": state,
            "atlas_processing_ts_ms": int(time.time() * 1000),
        },
    )


def make_bridge_health_record(
    state: str,
    adapter_instance_id: str,
    bridge_session_id: str,
    queue_depth: int,
    queue_capacity: int,
    records_received: int,
    records_rejected: int,
    recovery_count: int,
    recovery_failures: int,
    reconnect_attempts: int,
    last_error: Optional[str] = None,
    active_schemas: Optional[list] = None,
    current_raw_contract: str = "",
) -> "BridgeEnvelope":
    """
    Create a bridge-health bridge envelope.
    Emitted periodically and on state transitions.
    """
    return BridgeEnvelope.wrap(
        "bridge-health",
        {
            "state": state,
            "adapter_instance_id": adapter_instance_id,
            "bridge_session_id": bridge_session_id,
            "queue_depth": queue_depth,
            "queue_capacity": queue_capacity,
            "records_received": records_received,
            "records_rejected": records_rejected,
            "recovery_count": recovery_count,
            "recovery_failures": recovery_failures,
            "reconnect_attempts": reconnect_attempts,
            "last_error": last_error,
            "active_schemas": active_schemas or list(AUTHORITATIVE_SCHEMAS),
            "current_raw_contract": current_raw_contract,
            "atlas_processing_ts_ms": int(time.time() * 1000),
        },
    )


# ── Envelope ───────────────────────────────────────────────────────────────────

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
    "DISABLED",
    "STARTING",
    "AUTHENTICATING",
    "CONNECTED",
    "LIVE",
    "DEGRADED",
    "BACKPRESSURED",
    "RECOVERING",
    "STALE",
    "RECONNECTING",
    "FALLBACK_ACTIVE",
    "OFFLINE",
    "ERROR",
    "STOPPED",
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
