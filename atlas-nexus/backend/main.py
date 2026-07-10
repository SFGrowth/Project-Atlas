"""
Atlas Nexus — FastAPI Backend
Sprint 074 | M-15 Observability Webhook Consumer

Endpoints:
  POST /webhook          — Receive PipelineReport payloads from TradingView M-15
  GET  /events           — SSE stream for live dashboard updates
  GET  /reports          — Paginated report history
  GET  /reports/{id}     — Single report by ID
  GET  /health           — Health check
  GET  /stats            — Aggregate statistics
"""

import asyncio
import json
import logging
import sqlite3
import time
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import AsyncGenerator, Optional

from fastapi import FastAPI, HTTPException, Request, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

# ─────────────────────────────────────────────────────────────────────────────
# Logging
# ─────────────────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
)
logger = logging.getLogger("atlas.nexus")

# ─────────────────────────────────────────────────────────────────────────────
# Database
# ─────────────────────────────────────────────────────────────────────────────
DB_PATH = "atlas_nexus.db"


def get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    conn = get_db()
    cursor = conn.cursor()
    cursor.executescript("""
        CREATE TABLE IF NOT EXISTS pipeline_reports (
            id          TEXT PRIMARY KEY,
            received_at TEXT NOT NULL,
            bar_time    TEXT,
            symbol      TEXT,
            timeframe   TEXT,
            schema_ver  TEXT,
            master_state TEXT,
            session     TEXT,
            payload     TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_received_at ON pipeline_reports(received_at DESC);
        CREATE INDEX IF NOT EXISTS idx_bar_time    ON pipeline_reports(bar_time DESC);
        CREATE INDEX IF NOT EXISTS idx_master_state ON pipeline_reports(master_state);

        CREATE TABLE IF NOT EXISTS sse_clients (
            id          TEXT PRIMARY KEY,
            connected_at TEXT NOT NULL
        );
    """)
    conn.commit()
    conn.close()
    logger.info("Database initialised at %s", DB_PATH)


# ─────────────────────────────────────────────────────────────────────────────
# SSE broadcast queue
# ─────────────────────────────────────────────────────────────────────────────
_sse_queues: list[asyncio.Queue] = []


async def broadcast(event_type: str, data: dict) -> None:
    """Push an event to all connected SSE clients."""
    message = json.dumps({"type": event_type, "data": data, "ts": time.time()})
    dead = []
    for q in _sse_queues:
        try:
            q.put_nowait(message)
        except asyncio.QueueFull:
            dead.append(q)
    for q in dead:
        _sse_queues.remove(q)


# ─────────────────────────────────────────────────────────────────────────────
# Pydantic models (loosely typed to accept any valid payload)
# ─────────────────────────────────────────────────────────────────────────────
class WebhookPayload(BaseModel):
    """Accepts the full Atlas Observability Schema v1 payload."""
    schema_version: Optional[str] = None
    pipeline_run_id: Optional[str] = None
    bar_time: Optional[str] = None
    symbol: Optional[str] = None
    timeframe: Optional[str] = None
    master_state: Optional[str] = None
    session: Optional[dict] = None
    market_structure: Optional[dict] = None
    model_evaluations: Optional[dict] = None
    ade_decision: Optional[dict] = None
    ari_decision: Optional[dict] = None
    tvl_decision: Optional[dict] = None
    position_state: Optional[dict] = None
    reasoning: Optional[dict] = None

    class Config:
        extra = "allow"


# ─────────────────────────────────────────────────────────────────────────────
# App lifecycle
# ─────────────────────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    logger.info("Atlas Nexus backend started")
    yield
    logger.info("Atlas Nexus backend shutting down")


app = FastAPI(
    title="Atlas Nexus",
    description="Real-time observability dashboard for Project Atlas trading pipeline",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─────────────────────────────────────────────────────────────────────────────
# Routes
# ─────────────────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    """Health check endpoint."""
    conn = get_db()
    try:
        count = conn.execute("SELECT COUNT(*) FROM pipeline_reports").fetchone()[0]
    finally:
        conn.close()
    return {
        "status": "ok",
        "service": "atlas-nexus",
        "version": "1.0.0",
        "report_count": count,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "sse_clients": len(_sse_queues),
    }


@app.post("/webhook", status_code=201)
async def receive_webhook(request: Request):
    """
    Receive a PipelineReport JSON payload from TradingView M-15.
    Stores in SQLite and broadcasts to all SSE clients.
    """
    try:
        raw_body = await request.body()
        payload_dict = json.loads(raw_body)
    except Exception as exc:
        logger.warning("Webhook parse error: %s", exc)
        raise HTTPException(status_code=400, detail=f"Invalid JSON: {exc}")

    # Validate with Pydantic (loose — extra fields allowed)
    try:
        payload = WebhookPayload(**payload_dict)
    except Exception as exc:
        logger.warning("Webhook validation error: %s", exc)
        raise HTTPException(status_code=422, detail=str(exc))

    report_id = str(uuid.uuid4())
    received_at = datetime.now(timezone.utc).isoformat()

    # Persist to SQLite
    conn = get_db()
    try:
        conn.execute(
            """
            INSERT INTO pipeline_reports
                (id, received_at, bar_time, symbol, timeframe, schema_ver,
                 master_state, session, payload)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                report_id,
                received_at,
                payload.bar_time,
                payload.symbol,
                payload.timeframe,
                payload.schema_version,
                payload.master_state,
                json.dumps(payload.session) if payload.session else None,
                raw_body.decode("utf-8"),
            ),
        )
        conn.commit()
    finally:
        conn.close()

    logger.info(
        "Webhook received: id=%s symbol=%s state=%s bar=%s",
        report_id, payload.symbol, payload.master_state, payload.bar_time,
    )

    # Broadcast to SSE clients
    broadcast_data = {
        "id": report_id,
        "received_at": received_at,
        **payload_dict,
    }
    await broadcast("pipeline_report", broadcast_data)

    return {"id": report_id, "received_at": received_at, "status": "accepted"}


@app.get("/events")
async def sse_stream(request: Request):
    """
    Server-Sent Events stream. Dashboard connects here for live updates.
    Each event is a JSON-encoded PipelineReport with type='pipeline_report'.
    """
    queue: asyncio.Queue = asyncio.Queue(maxsize=100)
    _sse_queues.append(queue)
    logger.info("SSE client connected. Total clients: %d", len(_sse_queues))

    async def event_generator() -> AsyncGenerator[str, None]:
        # Send initial connection confirmation
        yield f"data: {json.dumps({'type': 'connected', 'ts': time.time()})}\n\n"
        try:
            while True:
                if await request.is_disconnected():
                    break
                try:
                    message = await asyncio.wait_for(queue.get(), timeout=15.0)
                    yield f"data: {message}\n\n"
                except asyncio.TimeoutError:
                    # Heartbeat to keep connection alive
                    yield f"data: {json.dumps({'type': 'heartbeat', 'ts': time.time()})}\n\n"
        except asyncio.CancelledError:
            pass
        finally:
            if queue in _sse_queues:
                _sse_queues.remove(queue)
            logger.info("SSE client disconnected. Total clients: %d", len(_sse_queues))

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


@app.get("/reports")
async def list_reports(
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    master_state: Optional[str] = Query(default=None),
    symbol: Optional[str] = Query(default=None),
):
    """Return paginated pipeline report history."""
    conn = get_db()
    try:
        where_clauses = []
        params = []
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
                   master_state, payload
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
            "payload": payload,
        })

    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "reports": reports,
    }


@app.get("/reports/{report_id}")
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
        "received_at": row["received_at"],
        "bar_time": row["bar_time"],
        "symbol": row["symbol"],
        "timeframe": row["timeframe"],
        "schema_ver": row["schema_ver"],
        "master_state": row["master_state"],
        "payload": payload,
    }


@app.get("/stats")
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
            SELECT received_at, bar_time, symbol, master_state, payload
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
    finally:
        conn.close()

    latest_data = None
    if latest:
        try:
            payload = json.loads(latest["payload"])
        except Exception:
            payload = {}
        latest_data = {
            "received_at": latest["received_at"],
            "bar_time": latest["bar_time"],
            "symbol": latest["symbol"],
            "master_state": latest["master_state"],
            "payload": payload,
        }

    return {
        "total_reports": total,
        "reports_last_24h": recent_24h,
        "by_master_state": [
            {"state": row["master_state"], "count": row["count"]}
            for row in by_state
        ],
        "latest": latest_data,
        "sse_clients": len(_sse_queues),
    }


# ─────────────────────────────────────────────────────────────────────────────
# Dev entrypoint
# ─────────────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8765, reload=True, log_level="info")
