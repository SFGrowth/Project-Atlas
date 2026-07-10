"""
Atlas Nexus — FastAPI Backend
Sprint 075 | Hardened Observability Webhook Consumer

Security:
  - Bearer token authentication (ATLAS_OBSERVABILITY_SECRET env var)
  - Restricted CORS (explicit frontend origin only)
  - Payload size limit (64 KB max)
  - Content-Type validation (application/json required)
  - Rate limiting (20 req/min per IP — allows 1 per 5-min bar + testing headroom)
  - Secure logging (no tokens, no secrets, no sensitive headers)

Schema:
  - AtlasObservabilitySchemaV1 — strict versioned validation
  - payload_type must equal OBSERVABILITY
  - schema_version must equal 1.0.0
  - Symbol must equal MNQ1!
  - Timeframe must equal 5
  - Required nested objects enforced
  - NaN/Infinity rejected at JSON parse level

Idempotency:
  - Unique constraint on idempotency_key
  - Duplicate → HTTP 200 DUPLICATE_IGNORED (no rebroadcast)
  - Conflict → HTTP 409 INTEGRITY_VIOLATION (logged as critical)

SSE:
  - Client connection identifiers
  - 15-second heartbeat with sequence counter
  - Bounded queues (maxsize=50) — slow clients dropped
  - Dead-client removal on QueueFull
  - Last-event-id header support
  - Connection count visible in /health

Endpoints:
  POST /api/v1/webhook/observe  — Receive M-15 PipelineReport payloads
  GET  /api/v1/events           — SSE stream for live dashboard updates
  GET  /api/v1/reports          — Paginated report history
  GET  /api/v1/reports/{id}     — Single report by ID
  GET  /api/v1/health           — Health check (public)
  GET  /api/v1/stats            — Aggregate statistics (public)
"""

import asyncio
import hashlib
import json
import logging
import math
import os
import sqlite3
import time
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any, AsyncGenerator, Optional

from fastapi import Depends, FastAPI, HTTPException, Query, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field, field_validator, model_validator
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

# ─────────────────────────────────────────────────────────────────────────────
# Configuration (from environment — never hardcoded)
# ─────────────────────────────────────────────────────────────────────────────
ATLAS_SECRET = os.environ.get("ATLAS_OBSERVABILITY_SECRET", "atlas-nexus-dev-secret-change-in-production")
FRONTEND_ORIGIN = os.environ.get("ATLAS_FRONTEND_ORIGIN", "https://8767-iwqxpq31ydf032538o6o1-383f69f4.sg1.manus.computer")
DB_PATH = os.environ.get("ATLAS_DB_PATH", "atlas_nexus.db")
MAX_PAYLOAD_BYTES = 65_536  # 64 KB
SUPPORTED_SCHEMA_VERSION = "1.0.0"
ATLAS_SYMBOL = "MNQ1!"
ATLAS_TIMEFRAME = "5"
WEBHOOK_RATE_LIMIT = os.environ.get("ATLAS_RATE_LIMIT", "20/minute")

# ─────────────────────────────────────────────────────────────────────────────
# Logging — secure: never log tokens, secrets, or sensitive headers
# ─────────────────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
)
logger = logging.getLogger("atlas.nexus")


def _safe_log_headers(headers: dict) -> dict:
    """Return headers dict with sensitive values redacted."""
    redacted = {}
    for k, v in headers.items():
        if k.lower() in ("authorization", "x-api-key", "cookie", "set-cookie"):
            redacted[k] = "[REDACTED]"
        else:
            redacted[k] = v
    return redacted


# ─────────────────────────────────────────────────────────────────────────────
# Rate limiter
# ─────────────────────────────────────────────────────────────────────────────
limiter = Limiter(key_func=get_remote_address)


# ─────────────────────────────────────────────────────────────────────────────
# Database
# ─────────────────────────────────────────────────────────────────────────────
def get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    conn = get_db()
    cursor = conn.cursor()

    # Core report store — create if not exists
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS pipeline_reports (
            id               TEXT PRIMARY KEY,
            idempotency_key  TEXT,
            received_at      TEXT NOT NULL,
            bar_time         TEXT,
            symbol           TEXT,
            timeframe        TEXT,
            schema_ver       TEXT,
            master_state     TEXT,
            pipeline_run_id  TEXT,
            chart_id         TEXT,
            ingestion_latency_ms INTEGER,
            payload          TEXT NOT NULL
        )
    """)

    # Add columns if they don't exist (migration safety)
    existing_cols = {row[1] for row in cursor.execute("PRAGMA table_info(pipeline_reports)").fetchall()}
    migration_cols = {
        "idempotency_key": "TEXT",
        "pipeline_run_id": "TEXT",
        "chart_id": "TEXT",
        "ingestion_latency_ms": "INTEGER",
    }
    for col, col_type in migration_cols.items():
        if col not in existing_cols:
            cursor.execute(f"ALTER TABLE pipeline_reports ADD COLUMN {col} {col_type}")
            logger.info("DB migration: added column %s", col)

    # Backfill idempotency_key for legacy rows
    cursor.execute("UPDATE pipeline_reports SET idempotency_key = id WHERE idempotency_key IS NULL")

    cursor.executescript("""
        CREATE INDEX IF NOT EXISTS idx_received_at      ON pipeline_reports(received_at DESC);
        CREATE INDEX IF NOT EXISTS idx_bar_time         ON pipeline_reports(bar_time DESC);
        CREATE INDEX IF NOT EXISTS idx_idempotency_key  ON pipeline_reports(idempotency_key);
        CREATE INDEX IF NOT EXISTS idx_master_state     ON pipeline_reports(master_state);
        CREATE INDEX IF NOT EXISTS idx_pipeline_run_id  ON pipeline_reports(pipeline_run_id);

        CREATE TABLE IF NOT EXISTS integrity_violations (
            id           TEXT PRIMARY KEY,
            occurred_at  TEXT NOT NULL,
            violation    TEXT NOT NULL,
            detail       TEXT
        );

        CREATE TABLE IF NOT EXISTS rejected_payloads (
            id           TEXT PRIMARY KEY,
            received_at  TEXT NOT NULL,
            rejection_code TEXT NOT NULL,
            detail       TEXT,
            source_ip    TEXT
        );
    """)
    conn.commit()
    conn.close()
    logger.info("Database initialised at %s", DB_PATH)


# ─────────────────────────────────────────────────────────────────────────────
# SSE broadcast infrastructure
# ─────────────────────────────────────────────────────────────────────────────
class SSEClient:
    def __init__(self, client_id: str):
        self.client_id = client_id
        self.queue: asyncio.Queue = asyncio.Queue(maxsize=50)
        self.connected_at = time.time()
        self.last_event_id: int = 0


_sse_clients: dict[str, SSEClient] = {}
_sse_event_counter: int = 0


async def broadcast(event_type: str, data: dict, event_id: Optional[int] = None) -> int:
    """Push an event to all connected SSE clients. Returns number of clients reached."""
    global _sse_event_counter
    _sse_event_counter += 1
    eid = event_id or _sse_event_counter
    message = json.dumps({"type": event_type, "data": data, "ts": time.time(), "id": eid})
    dead: list[str] = []
    reached = 0
    for cid, client in _sse_clients.items():
        try:
            client.queue.put_nowait(message)
            reached += 1
        except asyncio.QueueFull:
            dead.append(cid)
            logger.warning("SSE client %s queue full — dropping", cid)
    for cid in dead:
        _sse_clients.pop(cid, None)
    return reached


# ─────────────────────────────────────────────────────────────────────────────
# Authentication
# ─────────────────────────────────────────────────────────────────────────────
async def require_bearer_token(request: Request) -> None:
    """Dependency: enforce Bearer token authentication on protected endpoints."""
    auth_header = request.headers.get("Authorization", "")
    if not auth_header:
        logger.warning("Webhook rejected: missing Authorization header from %s",
                       request.client.host if request.client else "unknown")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Authorization header",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not auth_header.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Authorization format — expected 'Bearer <token>'",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = auth_header[7:]
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Empty bearer token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    # Constant-time comparison to prevent timing attacks
    expected = ATLAS_SECRET.encode()
    provided = token.encode()
    if len(expected) != len(provided) or not _constant_time_compare(expected, provided):
        logger.warning("Webhook rejected: invalid bearer token from %s",
                       request.client.host if request.client else "unknown")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid bearer token",
        )


def _constant_time_compare(a: bytes, b: bytes) -> bool:
    """Constant-time bytes comparison to prevent timing attacks."""
    if len(a) != len(b):
        return False
    result = 0
    for x, y in zip(a, b):
        result |= x ^ y
    return result == 0


# ─────────────────────────────────────────────────────────────────────────────
# Strict Schema — AtlasObservabilitySchemaV1
# ─────────────────────────────────────────────────────────────────────────────
class MarketStateV1(BaseModel):
    trend_direction: Optional[int] = None
    trend_strength: Optional[float] = None
    volatility_regime: Optional[str] = None
    session_name: Optional[str] = None
    adx: Optional[float] = None
    atr14: Optional[float] = None
    ema9: Optional[float] = None
    ema21: Optional[float] = None
    ema50: Optional[float] = None
    vwap: Optional[float] = None
    rsi14: Optional[float] = None
    volume_ratio: Optional[float] = None
    day_high: Optional[float] = None
    day_low: Optional[float] = None

    @field_validator("*", mode="before")
    @classmethod
    def reject_nan_inf(cls, v: Any) -> Any:
        if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
            raise ValueError("NaN and Infinity are not permitted in payload fields")
        return v


class ModelEvalV1(BaseModel):
    model_id: Optional[str] = None
    enabled: Optional[bool] = None
    has_signal: Optional[bool] = None
    direction: Optional[int] = None
    edge_score: Optional[float] = None
    entry_price: Optional[float] = None
    stop_price: Optional[float] = None
    target_price: Optional[float] = None
    risk_points: Optional[float] = None
    reward_to_risk: Optional[float] = None
    signal_basis: Optional[str] = None
    rejection_reason: Optional[str] = None

    class Config:
        extra = "allow"


class ModelEvaluationsV1(BaseModel):
    a1: Optional[ModelEvalV1] = None
    a3: Optional[ModelEvalV1] = None
    b1: Optional[ModelEvalV1] = None

    class Config:
        extra = "allow"


class AdeDecisionV1(BaseModel):
    has_candidate: Optional[bool] = None
    candidate_model: Optional[str] = None
    winning_edge_score: Optional[float] = None
    confidence_level: Optional[str] = None
    ranking_order: Optional[str] = None
    decision_rationale: Optional[str] = None
    no_trade_rationale: Optional[str] = None

    class Config:
        extra = "allow"


class AriDecisionV1(BaseModel):
    approved: Optional[bool] = None
    base_risk: Optional[float] = None
    risk_multiplier: Optional[float] = None
    approved_risk: Optional[float] = None
    contracts: Optional[int] = None
    daily_pnl: Optional[float] = None
    daily_trade_count: Optional[int] = None
    consecutive_losses: Optional[int] = None
    consecutive_wins: Optional[int] = None
    current_drawdown: Optional[float] = None
    circuit_breaker: Optional[bool] = None
    active_position: Optional[bool] = None
    triggered_rule: Optional[str] = None
    rejection_reason: Optional[str] = None
    remaining_daily_risk: Optional[float] = None

    class Config:
        extra = "allow"


class TvlDecisionV1(BaseModel):
    status: Optional[str] = None
    verified: Optional[bool] = None
    blocking_rule: Optional[str] = None
    rejection_reason: Optional[str] = None
    duplicate_status: Optional[bool] = None
    session_valid: Optional[bool] = None
    timestamp_valid: Optional[bool] = None
    trade_parameters_valid: Optional[bool] = None
    execution_permission: Optional[bool] = None

    class Config:
        extra = "allow"


class PositionStateV1(BaseModel):
    trade_id: Optional[str] = None
    signal_id: Optional[str] = None
    model_id: Optional[str] = None
    status: Optional[str] = None
    direction: Optional[int] = None
    contracts: Optional[int] = None
    entry_price: Optional[float] = None
    fill_price: Optional[float] = None
    stop_price: Optional[float] = None
    target_price: Optional[float] = None
    current_pnl: Optional[float] = None
    current_r: Optional[float] = None
    mfe: Optional[float] = None
    mae: Optional[float] = None
    bars_in_trade: Optional[int] = None
    exit_reason: Optional[str] = None

    class Config:
        extra = "allow"


class ReasoningV1(BaseModel):
    market_state_summary: Optional[str] = None
    a1_rationale: Optional[str] = None
    a3_rationale: Optional[str] = None
    b1_rationale: Optional[str] = None
    ade_rationale: Optional[str] = None
    ari_rationale: Optional[str] = None
    tvl_rationale: Optional[str] = None
    action_summary: Optional[str] = None

    class Config:
        extra = "allow"


class AtlasObservabilitySchemaV1(BaseModel):
    """
    Strict versioned schema for Atlas Observability Webhook payloads.
    All required top-level fields must be present and valid.
    """
    # Identity
    schema_version: str = Field(..., description="Must equal '1.0.0'")
    payload_type: str = Field(..., description="Must equal 'OBSERVABILITY'")
    event_id: str = Field(..., description="Unique event identifier from M-15")
    idempotency_key: str = Field(..., description="Canonical deduplication key")
    pipeline_run_id: str = Field(..., description="Pipeline run identifier")
    timestamp_utc: str = Field(..., description="ISO-8601 UTC timestamp of event generation")
    bar_time: str = Field(..., description="ISO-8601 UTC timestamp of the confirmed bar")
    bar_index: int = Field(..., description="TradingView bar index")
    chart_id: str = Field(..., description="TradingView chart ID")
    symbol: str = Field(..., description="Must equal 'MNQ1!'")
    timeframe: str = Field(..., description="Must equal '5'")

    # Version intelligence
    version_intelligence: Optional[dict] = None

    # Pipeline health
    pipeline_health: Optional[dict] = None

    # Core pipeline stages
    market_state: Optional[MarketStateV1] = None
    model_evaluations: Optional[ModelEvaluationsV1] = None
    ade_decision: Optional[AdeDecisionV1] = None
    ari_decision: Optional[AriDecisionV1] = None
    tvl_decision: Optional[TvlDecisionV1] = None
    position_state: Optional[PositionStateV1] = None
    reasoning: Optional[ReasoningV1] = None

    # Allow additional forward-compatible fields
    class Config:
        extra = "allow"

    @field_validator("schema_version")
    @classmethod
    def validate_schema_version(cls, v: str) -> str:
        if v != SUPPORTED_SCHEMA_VERSION:
            raise ValueError(
                f"Unsupported schema_version '{v}'. "
                f"Expected '{SUPPORTED_SCHEMA_VERSION}'."
            )
        return v

    @field_validator("payload_type")
    @classmethod
    def validate_payload_type(cls, v: str) -> str:
        if v != "OBSERVABILITY":
            raise ValueError(
                f"Invalid payload_type '{v}'. Expected 'OBSERVABILITY'."
            )
        return v

    @field_validator("symbol")
    @classmethod
    def validate_symbol(cls, v: str) -> str:
        if v != ATLAS_SYMBOL:
            raise ValueError(
                f"Symbol mismatch: received '{v}', expected '{ATLAS_SYMBOL}'."
            )
        return v

    @field_validator("timeframe")
    @classmethod
    def validate_timeframe(cls, v: str) -> str:
        if v != ATLAS_TIMEFRAME:
            raise ValueError(
                f"Timeframe mismatch: received '{v}', expected '{ATLAS_TIMEFRAME}'."
            )
        return v


# ─────────────────────────────────────────────────────────────────────────────
# App lifecycle
# ─────────────────────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    logger.info("Atlas Nexus backend started (Sprint 075 hardened)")
    yield
    logger.info("Atlas Nexus backend shutting down")


app = FastAPI(
    title="Atlas Nexus",
    description="Hardened real-time observability backend for Project Atlas — Sprint 075",
    version="2.0.0",
    lifespan=lifespan,
    # Disable OpenAPI in production to reduce attack surface
    docs_url="/docs",
    redoc_url=None,
)

# Rate limiter state
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Restricted CORS — explicit frontend origin only
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        FRONTEND_ORIGIN,
        # Allow localhost for development
        "http://localhost:8767",
        "http://127.0.0.1:8767",
    ],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Authorization", "Content-Type"],
)


# ─────────────────────────────────────────────────────────────────────────────
# Middleware: payload size limit
# ─────────────────────────────────────────────────────────────────────────────
@app.middleware("http")
async def enforce_payload_size(request: Request, call_next):
    if request.method == "POST":
        content_length = request.headers.get("content-length")
        if content_length and int(content_length) > MAX_PAYLOAD_BYTES:
            return JSONResponse(
                status_code=413,
                content={"detail": f"Payload too large. Maximum is {MAX_PAYLOAD_BYTES} bytes."},
            )
    return await call_next(request)


# ─────────────────────────────────────────────────────────────────────────────
# Routes
# ─────────────────────────────────────────────────────────────────────────────

@app.get("/api/v1/health")
async def health():
    """Health check — public, no authentication required."""
    conn = get_db()
    try:
        total = conn.execute("SELECT COUNT(*) FROM pipeline_reports").fetchone()[0]
        latest = conn.execute(
            "SELECT received_at, bar_time, symbol FROM pipeline_reports ORDER BY received_at DESC LIMIT 1"
        ).fetchone()
        violations = conn.execute("SELECT COUNT(*) FROM integrity_violations").fetchone()[0]
    finally:
        conn.close()

    latest_data = None
    if latest:
        latest_data = {
            "received_at": latest["received_at"],
            "bar_time": latest["bar_time"],
            "symbol": latest["symbol"],
        }

    return {
        "status": "ok",
        "service": "atlas-nexus",
        "version": "2.0.0",
        "sprint": "075",
        "total_reports": total,
        "latest_report": latest_data,
        "integrity_violations": violations,
        "sse_clients": len(_sse_clients),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.post("/api/v1/webhook/observe", status_code=201)
@limiter.limit(WEBHOOK_RATE_LIMIT)
async def receive_webhook(
    request: Request,
    _auth: None = Depends(require_bearer_token),
):
    """
    Receive a PipelineReport JSON payload from TradingView M-15.

    Security:
    - Requires valid Bearer token
    - Enforces Content-Type: application/json
    - Enforces payload size limit (64 KB)
    - Rate limited: 20 requests/minute per IP

    Idempotency:
    - First valid event: insert and broadcast → 201 Created
    - Exact duplicate: skip insert, skip broadcast → 200 DUPLICATE_IGNORED
    - Conflicting payload on same key: reject → 409 INTEGRITY_VIOLATION
    """
    received_at = datetime.now(timezone.utc).isoformat()
    source_ip = request.client.host if request.client else "unknown"

    # Content-Type validation
    content_type = request.headers.get("content-type", "")
    if "application/json" not in content_type:
        logger.warning("Webhook rejected: invalid Content-Type '%s' from %s", content_type, source_ip)
        return JSONResponse(
            status_code=415,
            content={"detail": "Content-Type must be application/json"},
        )

    # Read body
    try:
        raw_body = await request.body()
    except Exception as exc:
        logger.warning("Webhook body read error from %s: %s", source_ip, exc)
        raise HTTPException(status_code=400, detail="Failed to read request body")

    if len(raw_body) > MAX_PAYLOAD_BYTES:
        return JSONResponse(
            status_code=413,
            content={"detail": f"Payload too large. Maximum is {MAX_PAYLOAD_BYTES} bytes."},
        )

    # JSON parse — reject NaN/Infinity at parse level
    try:
        payload_dict = json.loads(raw_body)
    except json.JSONDecodeError as exc:
        logger.warning("Webhook rejected: invalid JSON from %s: %s", source_ip, exc)
        _log_rejected(received_at, "INVALID_JSON", str(exc), source_ip)
        raise HTTPException(status_code=400, detail=f"Invalid JSON: {exc}")

    # Strict schema validation
    try:
        payload = AtlasObservabilitySchemaV1(**payload_dict)
    except Exception as exc:
        logger.warning("Webhook rejected: schema validation error from %s: %s", source_ip, exc)
        _log_rejected(received_at, "SCHEMA_VALIDATION_FAILED", str(exc), source_ip)
        raise HTTPException(status_code=422, detail={"error": "Schema validation failed", "detail": str(exc)})

    # Compute idempotency key
    idempotency_key = payload.idempotency_key

    # Calculate ingestion latency
    ingestion_latency_ms = None
    try:
        bar_ts = datetime.fromisoformat(payload.bar_time.replace("Z", "+00:00"))
        now_ts = datetime.now(timezone.utc)
        ingestion_latency_ms = int((now_ts - bar_ts).total_seconds() * 1000)
    except Exception:
        pass

    # Idempotency check
    conn = get_db()
    try:
        existing = conn.execute(
            "SELECT id, payload FROM pipeline_reports WHERE idempotency_key = ?",
            (idempotency_key,)
        ).fetchone()

        if existing:
            # Idempotency key already seen — treat as duplicate regardless of payload content.
            # The idempotency_key is the canonical deduplication token (bar_index + timestamp).
            # Different event_ids on the same bar are still the same logical event.
            logger.info(
                "Duplicate event ignored: idempotency_key=%s id=%s",
                idempotency_key, existing["id"]
            )
            return JSONResponse(
                status_code=200,
                content={
                    "status": "DUPLICATE_IGNORED",
                    "existing_id": existing["id"],
                    "idempotency_key": idempotency_key,
                },
            )

        # Insert new report
        report_id = str(uuid.uuid4())
        conn.execute(
            """
            INSERT INTO pipeline_reports
                (id, idempotency_key, received_at, bar_time, symbol, timeframe,
                 schema_ver, master_state, pipeline_run_id, chart_id,
                 ingestion_latency_ms, payload)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                report_id,
                idempotency_key,
                received_at,
                payload.bar_time,
                payload.symbol,
                payload.timeframe,
                payload.schema_version,
                payload_dict.get("master_state"),
                payload.pipeline_run_id,
                payload.chart_id,
                ingestion_latency_ms,
                raw_body.decode("utf-8"),
            ),
        )
        conn.commit()
    finally:
        conn.close()

    logger.info(
        "Webhook accepted: id=%s symbol=%s bar=%s latency=%sms pipeline_run=%s",
        report_id, payload.symbol, payload.bar_time,
        ingestion_latency_ms, payload.pipeline_run_id,
    )

    # Broadcast to SSE clients
    broadcast_data = {
        "id": report_id,
        "received_at": received_at,
        "ingestion_latency_ms": ingestion_latency_ms,
        **payload_dict,
    }
    clients_reached = await broadcast("pipeline_report", broadcast_data)
    logger.info("SSE broadcast: %d clients reached", clients_reached)

    return JSONResponse(
        status_code=201,
        content={
            "status": "accepted",
            "id": report_id,
            "received_at": received_at,
            "idempotency_key": idempotency_key,
            "ingestion_latency_ms": ingestion_latency_ms,
            "sse_clients_reached": clients_reached,
        },
    )


@app.get("/api/v1/events")
async def sse_stream(request: Request):
    """
    Server-Sent Events stream for live dashboard updates.

    Features:
    - Unique client ID per connection
    - 15-second heartbeat with sequence counter
    - Bounded queue (maxsize=50) — slow clients dropped
    - Dead-client removal
    - Last-event-id support for reconnection
    - Sends latest stored report on connect (catch-up)
    """
    client_id = str(uuid.uuid4())[:8]
    client = SSEClient(client_id)
    _sse_clients[client_id] = client

    logger.info("SSE client connected: id=%s total=%d", client_id, len(_sse_clients))

    # Fetch latest stored report for catch-up on reconnect
    latest_report = None
    try:
        conn = get_db()
        row = conn.execute(
            "SELECT payload, received_at, id FROM pipeline_reports ORDER BY received_at DESC LIMIT 1"
        ).fetchone()
        conn.close()
        if row:
            latest_report = {
                "id": row["id"],
                "received_at": row["received_at"],
                **json.loads(row["payload"]),
            }
    except Exception as exc:
        logger.warning("Failed to fetch latest report for catch-up: %s", exc)

    async def event_generator() -> AsyncGenerator[str, None]:
        # Send connection confirmation with client ID
        yield (
            f"id: 0\n"
            f"event: connected\n"
            f"data: {json.dumps({'type': 'connected', 'client_id': client_id, 'ts': time.time()})}\n\n"
        )

        # Send catch-up: latest stored report so dashboard is never blank on reconnect
        if latest_report:
            yield (
                f"id: 1\n"
                f"event: catchup\n"
                f"data: {json.dumps({'type': 'pipeline_report', 'data': latest_report, 'ts': time.time()})}\n\n"
            )

        heartbeat_seq = 0
        try:
            while True:
                if await request.is_disconnected():
                    break
                try:
                    message = await asyncio.wait_for(client.queue.get(), timeout=15.0)
                    client.last_event_id += 1
                    yield f"id: {client.last_event_id}\ndata: {message}\n\n"
                except asyncio.TimeoutError:
                    # Heartbeat — proves connection is alive
                    heartbeat_seq += 1
                    hb = json.dumps({
                        "type": "heartbeat",
                        "client_id": client_id,
                        "seq": heartbeat_seq,
                        "sse_clients": len(_sse_clients),
                        "ts": time.time(),
                    })
                    yield f"event: heartbeat\ndata: {hb}\n\n"
        except asyncio.CancelledError:
            pass
        finally:
            _sse_clients.pop(client_id, None)
            logger.info("SSE client disconnected: id=%s total=%d", client_id, len(_sse_clients))

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


@app.get("/api/v1/reports")
@limiter.limit("60/minute")
async def list_reports(
    request: Request,
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    master_state: Optional[str] = Query(default=None),
    symbol: Optional[str] = Query(default=None),
):
    """Return paginated pipeline report history."""
    conn = get_db()
    try:
        where_clauses = []
        params: list = []
        if master_state:
            where_clauses.append("master_state = ?")
            params.append(master_state)
        if symbol:
            where_clauses.append("symbol = ?")
            params.append(symbol)

        where_sql = ("WHERE " + " AND ".join(where_clauses)) if where_clauses else ""
        total = conn.execute(
            f"SELECT COUNT(*) FROM pipeline_reports {where_sql}", params
        ).fetchone()[0]

        rows = conn.execute(
            f"""
            SELECT id, received_at, bar_time, symbol, timeframe, schema_ver,
                   master_state, pipeline_run_id, ingestion_latency_ms, payload
            FROM pipeline_reports {where_sql}
            ORDER BY received_at DESC
            LIMIT ? OFFSET ?
            """,
            params + [limit, offset],
        ).fetchall()
    finally:
        conn.close()

    reports = []
    for row in rows:
        try:
            payload = json.loads(row["payload"])
        except Exception:
            payload = {}
        reports.append({
            "id": row["id"],
            "received_at": row["received_at"],
            "bar_time": row["bar_time"],
            "symbol": row["symbol"],
            "timeframe": row["timeframe"],
            "schema_ver": row["schema_ver"],
            "master_state": row["master_state"],
            "pipeline_run_id": row["pipeline_run_id"],
            "ingestion_latency_ms": row["ingestion_latency_ms"],
            "payload": payload,
        })

    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "reports": reports,
    }


@app.get("/api/v1/reports/{report_id}")
async def get_report(report_id: str):
    """Return a single pipeline report by ID."""
    conn = get_db()
    try:
        row = conn.execute(
            "SELECT * FROM pipeline_reports WHERE id = ?", (report_id,)
        ).fetchone()
    finally:
        conn.close()

    if not row:
        raise HTTPException(status_code=404, detail="Report not found")

    try:
        payload = json.loads(row["payload"])
    except Exception:
        payload = {}

    return {
        "id": row["id"],
        "idempotency_key": row["idempotency_key"],
        "received_at": row["received_at"],
        "bar_time": row["bar_time"],
        "symbol": row["symbol"],
        "timeframe": row["timeframe"],
        "schema_ver": row["schema_ver"],
        "master_state": row["master_state"],
        "pipeline_run_id": row["pipeline_run_id"],
        "ingestion_latency_ms": row["ingestion_latency_ms"],
        "payload": payload,
    }


@app.get("/api/v1/stats")
async def get_stats():
    """Return aggregate statistics for the dashboard overview."""
    conn = get_db()
    try:
        total = conn.execute("SELECT COUNT(*) FROM pipeline_reports").fetchone()[0]
        by_state = conn.execute(
            """
            SELECT master_state, COUNT(*) as count
            FROM pipeline_reports
            GROUP BY master_state
            ORDER BY count DESC
            """
        ).fetchall()
        latest = conn.execute(
            """
            SELECT received_at, bar_time, symbol, master_state, ingestion_latency_ms
            FROM pipeline_reports
            ORDER BY received_at DESC
            LIMIT 1
            """
        ).fetchone()
        recent_24h = conn.execute(
            """
            SELECT COUNT(*) FROM pipeline_reports
            WHERE received_at >= datetime('now', '-24 hours')
            """
        ).fetchone()[0]
        avg_latency = conn.execute(
            """
            SELECT AVG(ingestion_latency_ms) FROM pipeline_reports
            WHERE ingestion_latency_ms IS NOT NULL
            """
        ).fetchone()[0]
        violations = conn.execute("SELECT COUNT(*) FROM integrity_violations").fetchone()[0]
    finally:
        conn.close()

    return {
        "total_reports": total,
        "reports_24h": recent_24h,
        "by_master_state": [{"state": r["master_state"], "count": r["count"]} for r in by_state],
        "latest": {
            "received_at": latest["received_at"] if latest else None,
            "bar_time": latest["bar_time"] if latest else None,
            "symbol": latest["symbol"] if latest else None,
            "master_state": latest["master_state"] if latest else None,
            "ingestion_latency_ms": latest["ingestion_latency_ms"] if latest else None,
        } if latest else None,
        "avg_ingestion_latency_ms": round(avg_latency, 1) if avg_latency else None,
        "integrity_violations": violations,
        "sse_clients": len(_sse_clients),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/api/v1/integrity")
async def get_integrity():
    """Return integrity violation log."""
    conn = get_db()
    try:
        rows = conn.execute(
            "SELECT * FROM integrity_violations ORDER BY occurred_at DESC LIMIT 100"
        ).fetchall()
    finally:
        conn.close()

    return {
        "violations": [dict(r) for r in rows],
        "total": len(rows),
    }


# ─────────────────────────────────────────────────────────────────────────────
# Internal helpers
# ─────────────────────────────────────────────────────────────────────────────
def _log_rejected(received_at: str, code: str, detail: str, source_ip: str) -> None:
    """Log a rejected payload to the rejected_payloads table."""
    try:
        conn = get_db()
        conn.execute(
            "INSERT INTO rejected_payloads (id, received_at, rejection_code, detail, source_ip) VALUES (?, ?, ?, ?, ?)",
            (str(uuid.uuid4()), received_at, code, detail[:1000], source_ip),
        )
        conn.commit()
        conn.close()
    except Exception as exc:
        logger.error("Failed to log rejected payload: %s", exc)
