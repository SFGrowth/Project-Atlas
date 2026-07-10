/**
 * Atlas Nexus — Raw Express routes for webhook ingestion and SSE streaming.
 *
 * Authentication strategy (TradingView cannot send custom headers):
 *   Layer 1 — Secret path segment: POST /api/webhook/observe/:token
 *             The URL itself contains the secret. TradingView must use the full secret URL.
 *             Requests to /api/webhook/observe (no token) are rejected with 404.
 *   Layer 2 — Payload field: body must contain { "webhook_secret": "<token>" }
 *             Validates the JSON body independently of the URL, so a leaked URL alone
 *             is not sufficient to inject data.
 *
 * Endpoints:
 *   POST /api/webhook/observe/:token  — Authenticated webhook receiver
 *   GET  /api/events                  — SSE stream for live dashboard updates
 *   GET  /api/v1/health               — Health check
 *   GET  /api/v1/stats                — Quick stats
 *   GET  /api/v1/reports              — Recent reports list
 */

import { Request, Response, Router } from "express";
import { nanoid } from "nanoid";
import {
  getPipelineReportByIdempotencyKey,
  getPipelineReportCount,
  getLatestPipelineReport,
  getRecentPipelineReports,
  insertPipelineReport,
} from "./db";

// ─── SSE Client Registry ──────────────────────────────────────────────────────

interface SSEClient {
  id: string;
  res: Response;
  connectedAt: number;
}

const sseClients = new Map<string, SSEClient>();

function broadcastSSE(eventType: string, data: unknown): number {
  const message = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
  let reached = 0;
  for (const [id, client] of Array.from(sseClients)) {
    try {
      client.res.write(message);
      reached++;
    } catch {
      sseClients.delete(id);
    }
  }
  return reached;
}

// ─── Schema Validation ────────────────────────────────────────────────────────

const REQUIRED_FIELDS = [
  "schema_version",
  "payload_type",
  "event_id",
  "idempotency_key",
  "pipeline_run_id",
  "timestamp_utc",
  "bar_time",
  "bar_index",
  "chart_id",
  "symbol",
  "timeframe",
  "master_state",
] as const;

function validatePayload(body: Record<string, unknown>): string | null {
  for (const field of REQUIRED_FIELDS) {
    if (body[field] === undefined || body[field] === null) {
      return `Missing required field: ${field}`;
    }
  }
  if (body.schema_version !== "1.0.0") {
    return `Invalid schema_version: expected "1.0.0", got "${body.schema_version}"`;
  }
  if (body.payload_type !== "OBSERVABILITY") {
    return `Invalid payload_type: expected "OBSERVABILITY", got "${body.payload_type}"`;
  }
  if (body.symbol !== "MNQ1!") {
    return `Invalid symbol: expected "MNQ1!", got "${body.symbol}"`;
  }
  return null;
}

// ─── Constant-time string comparison (prevents timing attacks) ────────────────

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

// ─── Router ───────────────────────────────────────────────────────────────────

export function registerNexusRoutes(router: Router) {

  // ── POST /api/webhook/observe/:token ──────────────────────────────────────
  //
  // Layer 1: The :token path segment must match ATLAS_WEBHOOK_TOKEN.
  // Layer 2: body.webhook_secret must also match ATLAS_WEBHOOK_TOKEN.
  // Both checks must pass. Requests missing either are rejected.
  //
  router.post("/webhook/observe/:token", async (req: Request, res: Response) => {
    const expectedToken = process.env.ATLAS_WEBHOOK_TOKEN;

    // Guard: misconfigured server
    if (!expectedToken) {
      console.error("[Nexus] ATLAS_WEBHOOK_TOKEN not set — rejecting all webhook requests");
      res.status(500).json({ error: "Server misconfiguration: webhook token not configured" });
      return;
    }

    // Layer 1: path token
    const pathToken = (req.params as { token: string }).token ?? "";
    if (!safeEqual(pathToken, expectedToken)) {
      // Return 404 to avoid leaking that the endpoint exists
      res.status(404).json({ error: "Not found" });
      return;
    }

    // Content-Type check
    const ct = req.headers["content-type"] ?? "";
    if (!ct.includes("application/json")) {
      res.status(415).json({ error: "Content-Type must be application/json" });
      return;
    }

    const body = req.body as Record<string, unknown>;

    // Layer 2: payload field
    const payloadSecret = (body.webhook_secret as string) ?? "";
    if (!safeEqual(payloadSecret, expectedToken)) {
      res.status(403).json({ error: "Invalid or missing webhook_secret in payload" });
      return;
    }

    // Schema validation
    const validationError = validatePayload(body);
    if (validationError) {
      res.status(422).json({ error: validationError });
      return;
    }

    const idempotencyKey = body.idempotency_key as string;
    const timestampUtc = body.timestamp_utc as string;
    const barTime = body.bar_time as string;
    const symbol = body.symbol as string;
    const masterState = body.master_state as string;
    const pipelineRunId = body.pipeline_run_id as string;

    // Idempotency check
    try {
      const existing = await getPipelineReportByIdempotencyKey(idempotencyKey);
      if (existing) {
        res.status(200).json({
          status: "DUPLICATE_IGNORED",
          id: existing.id,
          idempotency_key: idempotencyKey,
        });
        return;
      }
    } catch (err) {
      console.error("[Nexus] Idempotency check failed:", err);
      res.status(500).json({ error: "Internal server error during idempotency check" });
      return;
    }

    // Compute ingestion latency
    let ingestionLatencyMs: number | null = null;
    try {
      const barMs = new Date(timestampUtc).getTime();
      ingestionLatencyMs = Date.now() - barMs;
    } catch {
      // non-fatal
    }

    // Persist
    const id = nanoid();
    try {
      await insertPipelineReport({
        id,
        idempotencyKey,
        barTime,
        symbol,
        masterState,
        pipelineRunId,
        ingestionLatencyMs,
        payload: body,
      });
    } catch (err) {
      console.error("[Nexus] Failed to persist report:", err);
      res.status(500).json({ error: "Failed to persist pipeline report" });
      return;
    }

    // Broadcast to SSE clients
    const broadcastData = {
      type: "pipeline_report",
      id,
      receivedAt: new Date().toISOString(),
      payload: body,
    };
    const clientsReached = broadcastSSE("pipeline_report", broadcastData);
    console.log(
      `[Nexus] Webhook accepted: id=${id} symbol=${symbol} state=${masterState} latency=${ingestionLatencyMs}ms sse_clients=${clientsReached}`
    );

    res.status(201).json({
      status: "accepted",
      id,
      idempotency_key: idempotencyKey,
      ingestion_latency_ms: ingestionLatencyMs,
      sse_clients_reached: clientsReached,
    });
  });

  // Catch-all for /webhook/observe (no token) — return 404 to avoid leaking endpoint existence
  router.post("/webhook/observe", (_req: Request, res: Response) => {
    res.status(404).json({ error: "Not found" });
  });

  // ── GET /api/events (SSE) ─────────────────────────────────────────────────
  router.get("/events", async (req: Request, res: Response) => {
    const clientId = nanoid(8);

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    sseClients.set(clientId, { id: clientId, res, connectedAt: Date.now() });
    console.log(`[Nexus] SSE client connected: ${clientId} (total: ${sseClients.size})`);

    // Connection confirmation
    res.write(
      `event: connected\ndata: ${JSON.stringify({
        type: "connected",
        client_id: clientId,
        ts: Date.now(),
      })}\n\n`
    );

    // Catch-up: send latest stored report
    try {
      const latest = await getLatestPipelineReport();
      if (latest) {
        res.write(
          `event: catchup\ndata: ${JSON.stringify({
            type: "pipeline_report",
            id: latest.id,
            receivedAt: latest.receivedAt.toISOString(),
            payload: latest.payload,
          })}\n\n`
        );
      }
    } catch (err) {
      console.warn("[Nexus] Failed to send catch-up:", err);
    }

    // Heartbeat every 15s
    const heartbeatInterval = setInterval(() => {
      try {
        res.write(
          `event: heartbeat\ndata: ${JSON.stringify({
            type: "heartbeat",
            client_id: clientId,
            ts: Date.now(),
            sse_clients: sseClients.size,
          })}\n\n`
        );
      } catch {
        clearInterval(heartbeatInterval);
        sseClients.delete(clientId);
      }
    }, 15000);

    req.on("close", () => {
      clearInterval(heartbeatInterval);
      sseClients.delete(clientId);
      console.log(`[Nexus] SSE client disconnected: ${clientId} (total: ${sseClients.size})`);
    });
  });

  // ── GET /api/v1/health ────────────────────────────────────────────────────
  router.get("/v1/health", async (_req: Request, res: Response) => {
    res.json({
      status: "ok",
      ts: new Date().toISOString(),
      sse_clients: sseClients.size,
    });
  });

  // ── GET /api/v1/stats ─────────────────────────────────────────────────────
  router.get("/v1/stats", async (_req: Request, res: Response) => {
    try {
      const count = await getPipelineReportCount();
      const latest = await getLatestPipelineReport();
      res.json({
        total_reports: count,
        last_received_at: latest?.receivedAt?.toISOString() ?? null,
        last_master_state: latest?.masterState ?? null,
        last_symbol: latest?.symbol ?? null,
        sse_clients: sseClients.size,
      });
    } catch {
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });

  // ── GET /api/v1/reports ───────────────────────────────────────────────────
  router.get("/v1/reports", async (req: Request, res: Response) => {
    try {
      const limit = Math.min(parseInt((req.query.limit as string) ?? "50", 10), 200);
      const reports = await getRecentPipelineReports(limit);
      res.json(
        reports.map((r) => ({
          id: r.id,
          received_at: r.receivedAt.toISOString(),
          bar_time: r.barTime,
          symbol: r.symbol,
          master_state: r.masterState,
          pipeline_run_id: r.pipelineRunId,
          payload: r.payload,
        }))
      );
    } catch {
      res.status(500).json({ error: "Failed to fetch reports" });
    }
  });
}
