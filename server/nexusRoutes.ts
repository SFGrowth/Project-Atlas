/**
 * Atlas Nexus — Raw Express routes for webhook ingestion, SSE streaming,
 * paper trading engine, and system health monitoring.
 *
 * Authentication strategy (TradingView cannot send custom headers):
 *   Layer 1 — Secret path segment: POST /api/webhook/observe/:token
 *   Layer 2 — Payload field: body must contain { "webhook_secret": "<token>" }
 *
 * Endpoints:
 *   POST /api/webhook/observe/:token  — Authenticated webhook receiver + paper trading
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
  getOpenPaperTrade,
  insertPaperTrade,
  updatePaperTrade,
  recomputeJournalDay,
  insertHealthEvent,
  insertNotificationLog,
} from "./db";
import { notifyOwner } from "./_core/notification";

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
  "schema_version", "payload_type", "event_id", "idempotency_key",
  "pipeline_run_id", "timestamp_utc", "bar_time", "bar_index",
  "chart_id", "symbol", "timeframe", "master_state",
] as const;

function validatePayload(body: Record<string, unknown>): string | null {
  for (const field of REQUIRED_FIELDS) {
    if (body[field] === undefined || body[field] === null) {
      return `Missing required field: ${field}`;
    }
  }
  if (body.schema_version !== "1.0.0") return `Invalid schema_version: expected "1.0.0", got "${body.schema_version}"`;
  if (body.payload_type !== "OBSERVABILITY") return `Invalid payload_type: expected "OBSERVABILITY", got "${body.payload_type}"`;
  if (body.symbol !== "MNQ1!") return `Invalid symbol: expected "MNQ1!", got "${body.symbol}"`;
  return null;
}

// ─── Constant-time string comparison ─────────────────────────────────────────

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ─── Notification helper ──────────────────────────────────────────────────────

async function sendNotification(type: string, title: string, body: string, metadata?: unknown) {
  try {
    await notifyOwner({ title, content: body });
    await insertNotificationLog({ type, title, body, delivered: true, metadata: metadata as Record<string, unknown> });
  } catch (err) {
    console.warn(`[Nexus] Notification failed (${type}):`, err);
    await insertNotificationLog({ type, title, body, delivered: false, metadata: metadata as Record<string, unknown> }).catch(() => {});
  }
}

// ─── Paper Trading Engine ─────────────────────────────────────────────────────
// Processes each accepted PipelineReport and manages simulated positions.
// No broker connection. Paper mode only.

async function processPaperTrading(payload: Record<string, unknown>): Promise<void> {
  try {
    const ade = payload.ade as Record<string, unknown> | undefined;
    const ari = payload.ari as Record<string, unknown> | undefined;
    const tvl = payload.tvl as Record<string, unknown> | undefined;
    const mkt = payload.market_structure as Record<string, unknown> | undefined;
    const pos = payload.position_state as Record<string, unknown> | undefined;

    const adeDecision = String(ade?.decision ?? "NO_TRADE");
    const ariApproval = String(ari?.approval ?? "REJECTED");
    const tvlStatus = String(tvl?.status ?? "FAIL");
    const masterState = String(payload.master_state ?? "");
    const pipelineRunId = String(payload.pipeline_run_id ?? "");
    const brainView = String(payload.atlas_brain_view ?? "");

    // Check for existing open trade
    const openTrade = await getOpenPaperTrade("ATLAS_MNQ_PAPER");

    // ── Update open trade P&L from current market price ──────────────────────
    if (openTrade) {
      const currentPrice = Number(mkt?.vwap ?? 0);
      if (currentPrice > 0 && openTrade.entry) {
        const entry = Number(openTrade.entry);
        const riskDollars = Number(openTrade.riskDollars ?? 100);
        const direction = openTrade.direction;
        const tickValue = 2; // MNQ: $2 per tick (0.25 points)
        const contracts = openTrade.contracts ?? 1;

        const priceDiff = direction === "LONG" ? currentPrice - entry : entry - currentPrice;
        const pnl = priceDiff * 4 * tickValue * contracts; // 4 ticks per point
        const currentR = riskDollars > 0 ? pnl / riskDollars : 0;
        const mfe = Math.max(Number(openTrade.mfe ?? 0), pnl);
        const mae = Math.min(Number(openTrade.mae ?? 0), pnl);

        // Check for stop hit
        const stop = openTrade.stop ? Number(openTrade.stop) : null;
        const target = openTrade.target ? Number(openTrade.target) : null;

        let shouldClose = false;
        let exitReason = "";
        let exitPrice = currentPrice;

        if (stop !== null) {
          if (direction === "LONG" && currentPrice <= stop) { shouldClose = true; exitReason = "STOP_HIT"; exitPrice = stop; }
          if (direction === "SHORT" && currentPrice >= stop) { shouldClose = true; exitReason = "STOP_HIT"; exitPrice = stop; }
        }
        if (target !== null && !shouldClose) {
          if (direction === "LONG" && currentPrice >= target) { shouldClose = true; exitReason = "TARGET_HIT"; exitPrice = target; }
          if (direction === "SHORT" && currentPrice <= target) { shouldClose = true; exitReason = "TARGET_HIT"; exitPrice = target; }
        }

        if (shouldClose) {
          const finalPriceDiff = direction === "LONG" ? exitPrice - entry : entry - exitPrice;
          const finalPnl = finalPriceDiff * 4 * tickValue * contracts;
          const finalR = riskDollars > 0 ? finalPnl / riskDollars : 0;
          const closedAt = new Date();
          const durationMs = closedAt.getTime() - openTrade.openedAt.getTime();

          await updatePaperTrade(openTrade.id, {
            status: "CLOSED",
            exitPrice: String(exitPrice),
            exitReason,
            pnl: String(finalPnl.toFixed(2)),
            currentR: String(finalR.toFixed(4)),
            mfe: String(Math.max(Number(openTrade.mfe ?? 0), finalPnl).toFixed(2)),
            mae: String(Math.min(Number(openTrade.mae ?? 0), finalPnl).toFixed(2)),
            closedAt,
            tradeDurationMs: durationMs,
          });

          // Recompute journal day
          const tradeDate = closedAt.toISOString().slice(0, 10);
          await recomputeJournalDay(tradeDate, "ATLAS_MNQ_PAPER");

          // Broadcast trade closed
          broadcastSSE("trade_closed", { tradeId: openTrade.id, exitReason, pnl: finalPnl, currentR: finalR });

          // Notifications
          if (exitReason === "TARGET_HIT") {
            await sendNotification("TARGET_HIT", "🎯 Target Hit", `${openTrade.model} ${openTrade.direction} trade closed at target. P&L: $${finalPnl.toFixed(2)} (${finalR.toFixed(2)}R)`, { tradeId: openTrade.id });
          } else if (exitReason === "STOP_HIT") {
            await sendNotification("STOP_HIT", "🛑 Stop Hit", `${openTrade.model} ${openTrade.direction} trade stopped out. P&L: $${finalPnl.toFixed(2)} (${finalR.toFixed(2)}R)`, { tradeId: openTrade.id });
          }
          await sendNotification("TRADE_CLOSED", "Trade Closed", `${openTrade.model} ${openTrade.direction} | ${exitReason} | P&L: $${finalPnl.toFixed(2)}`, { tradeId: openTrade.id });

          await insertHealthEvent({ eventType: "TRADE_CLOSED", severity: "INFO", message: `${openTrade.model} ${openTrade.direction} closed: ${exitReason} P&L=$${finalPnl.toFixed(2)}` });
        } else {
          // Update live P&L
          await updatePaperTrade(openTrade.id, {
            pnl: String(pnl.toFixed(2)),
            currentR: String(currentR.toFixed(4)),
            mfe: String(mfe.toFixed(2)),
            mae: String(mae.toFixed(2)),
          });
        }
      }
      return; // Only one open trade at a time
    }

    // ── Open new trade if pipeline approves ───────────────────────────────────
    if (adeDecision !== "NO_TRADE" && ariApproval === "APPROVED" && tvlStatus === "PASS") {
      const candidateModel = String(ade?.candidate_model ?? "A1");
      const direction = adeDecision as "LONG" | "SHORT";
      const edgeScore = Number(ade?.edge_score ?? 0);
      const approvedRisk = Number(ari?.approved_risk ?? 100);

      // Extract entry/stop/target from position_state or ARI
      const entry = Number(pos?.entry ?? mkt?.vwap ?? 0);
      const stop = Number(pos?.stop ?? ari?.stop_price ?? 0);
      const target = Number(pos?.target ?? ari?.target_price ?? 0);

      if (entry > 0) {
        const tradeId = nanoid();
        await insertPaperTrade({
          id: tradeId,
          account: "ATLAS_MNQ_PAPER",
          symbol: "MNQ1!",
          direction,
          model: candidateModel,
          status: "OPEN",
          entry: String(entry),
          stop: stop > 0 ? String(stop) : undefined,
          target: target > 0 ? String(target) : undefined,
          contracts: 1,
          riskDollars: String(approvedRisk),
          pnl: "0",
          currentR: "0",
          mfe: "0",
          mae: "0",
          pipelineRunId,
          edgeScore: String(edgeScore),
          adeDecision,
          ariDecision: ariApproval,
          tvlDecision: tvlStatus,
          brainView,
        });

        broadcastSSE("trade_opened", { tradeId, direction, model: candidateModel, entry, stop, target, risk: approvedRisk });
        await sendNotification("TRADE_OPENED", "📈 Trade Opened", `${candidateModel} ${direction} @ ${entry.toFixed(2)} | Risk: $${approvedRisk} | Edge: ${(edgeScore * 100).toFixed(0)}%`, { tradeId });
        await insertHealthEvent({ eventType: "TRADE_OPENED", severity: "INFO", message: `${candidateModel} ${direction} opened @ ${entry}` });
      }
    }

    // ── ARI Rejection notification (rate-limited: only when state changes) ────
    if (adeDecision !== "NO_TRADE" && ariApproval === "REJECTED") {
      const ariReason = String(ari?.rejection_reason ?? "Risk limit");
      await insertHealthEvent({ eventType: "ARI_REJECTION", severity: "WARN", message: `ARI rejected ${adeDecision}: ${ariReason}` });
      await sendNotification("ARI_REJECTION", "⚠️ ARI Rejection", `${adeDecision} signal rejected by ARI: ${ariReason}`, { masterState });
    }

    // ── Circuit breaker notification ──────────────────────────────────────────
    const circuitBreaker = String(ari?.circuit_breaker ?? "CLOSED");
    if (circuitBreaker === "OPEN") {
      await insertHealthEvent({ eventType: "CIRCUIT_BREAKER", severity: "ERROR", message: "ARI circuit breaker OPEN — trading halted" });
      await sendNotification("CIRCUIT_BREAKER", "🚨 Circuit Breaker OPEN", "ARI has activated the circuit breaker. All trading halted for the session.", { masterState });
    }

  } catch (err) {
    console.error("[Nexus] Paper trading engine error:", err);
  }
}

// ─── Webhook last-received tracker (for health monitoring) ───────────────────

let lastWebhookAt: number | null = null;
let webhookFailureNotified = false;

// Check every 10 minutes if we haven't received a webhook during market hours
setInterval(async () => {
  const now = new Date();
  const hour = now.getUTCHours();
  const day = now.getUTCDay();
  const isMarketHours = day >= 1 && day <= 5 && hour >= 14 && hour < 21; // 14:00-21:00 UTC = 9:30-16:00 ET

  if (isMarketHours && lastWebhookAt !== null) {
    const minutesSinceLast = (Date.now() - lastWebhookAt) / 60000;
    if (minutesSinceLast > 15 && !webhookFailureNotified) {
      webhookFailureNotified = true;
      await sendNotification("WEBHOOK_FAILURE", "⚠️ Webhook Silence", `No webhook received for ${Math.round(minutesSinceLast)} minutes during market hours. Check TradingView alert.`, {});
      await insertHealthEvent({ eventType: "WEBHOOK_FAILURE", severity: "WARN", message: `No webhook for ${Math.round(minutesSinceLast)} minutes during market hours` });
    }
  } else {
    webhookFailureNotified = false;
  }
}, 10 * 60 * 1000);

// ─── Startup notification: Atlas Online ─────────────────────────────────────
let startupNotified = false;
setTimeout(async () => {
  if (!startupNotified) {
    startupNotified = true;
    await sendNotification("ATLAS_ONLINE", "✅ Atlas Nexus Online", "ORION Quantitative Trading OS is running and ready to receive pipeline reports.", {});
    await insertHealthEvent({ eventType: "ATLAS_ONLINE", severity: "INFO", message: "Atlas Nexus server started successfully" });
  }
}, 8000); // 8s delay to ensure DB and all modules are ready

// ─── Shutdown notification: System Offline ─────────────────────────────────
let shutdownNotified = false;
async function handleShutdown(signal: string) {
  if (!shutdownNotified) {
    shutdownNotified = true;
    try {
      await sendNotification("SYSTEM_OFFLINE", "🔴 Atlas Nexus Offline", `ORION server is shutting down (${signal}). Pipeline monitoring paused.`, { signal });
      await insertHealthEvent({ eventType: "SYSTEM_OFFLINE", severity: "ERROR", message: `Server shutting down: ${signal}` });
    } catch { /* best-effort — DB may be unavailable */ }
  }
  process.exit(0);
}
process.on("SIGTERM", () => void handleShutdown("SIGTERM"));
process.on("SIGINT", () => void handleShutdown("SIGINT"));

// ─── TradingView Disconnected: escalation after 45 min silence ──────────────
let tvDisconnectNotified = false;
setInterval(async () => {
  const now = new Date();
  const hour = now.getUTCHours();
  const day = now.getUTCDay();
  const isMarketHours = day >= 1 && day <= 5 && hour >= 14 && hour < 21;
  if (isMarketHours && lastWebhookAt !== null) {
    const minutesSinceLast = (Date.now() - lastWebhookAt) / 60000;
    if (minutesSinceLast > 45 && !tvDisconnectNotified) {
      tvDisconnectNotified = true;
      await sendNotification("TV_DISCONNECTED", "🔌 TradingView Disconnected", `No pipeline data for ${Math.round(minutesSinceLast)} minutes. TradingView alert may be inactive or the chart has been closed.`, {});
      await insertHealthEvent({ eventType: "TV_DISCONNECTED", severity: "ERROR", message: `TradingView silent for ${Math.round(minutesSinceLast)} minutes` });
    }
  } else if (!isMarketHours) {
    tvDisconnectNotified = false; // reset outside market hours
  }
}, 15 * 60 * 1000);

// ─── Router ───────────────────────────────────────────────────────────────────

export function registerNexusRoutes(router: Router) {

  // ── POST /api/webhook/observe/:token ──────────────────────────────────────
  router.post("/webhook/observe/:token", async (req: Request, res: Response) => {
    const expectedToken = process.env.ATLAS_WEBHOOK_TOKEN;

    if (!expectedToken) {
      console.error("[Nexus] ATLAS_WEBHOOK_TOKEN not set");
      res.status(500).json({ error: "Server misconfiguration: webhook token not configured" });
      return;
    }

    const pathToken = (req.params as { token: string }).token ?? "";
    if (!safeEqual(pathToken, expectedToken)) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const ct = req.headers["content-type"] ?? "";
    if (!ct.includes("application/json")) {
      res.status(415).json({ error: "Content-Type must be application/json" });
      return;
    }

    const body = req.body as Record<string, unknown>;

    const payloadSecret = (body.webhook_secret as string) ?? "";
    if (!safeEqual(payloadSecret, expectedToken)) {
      res.status(403).json({ error: "Invalid or missing webhook_secret in payload" });
      return;
    }

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
        res.status(200).json({ status: "DUPLICATE_IGNORED", id: existing.id, idempotency_key: idempotencyKey });
        return;
      }
    } catch (err) {
      console.error("[Nexus] Idempotency check failed:", err);
      res.status(500).json({ error: "Internal server error during idempotency check" });
      return;
    }

    // Ingestion latency
    let ingestionLatencyMs: number | null = null;
    try {
      ingestionLatencyMs = Date.now() - new Date(timestampUtc).getTime();
    } catch { /* non-fatal */ }

    // Persist
    const id = nanoid();
    try {
      await insertPipelineReport({ id, idempotencyKey, barTime, symbol, masterState, pipelineRunId, ingestionLatencyMs, payload: body });
    } catch (err) {
      console.error("[Nexus] Failed to persist report:", err);
      res.status(500).json({ error: "Failed to persist pipeline report" });
      return;
    }

    // Update health tracker
    lastWebhookAt = Date.now();
    webhookFailureNotified = false;
    await insertHealthEvent({ eventType: "WEBHOOK_RECEIVED", severity: "INFO", message: `${symbol} ${masterState} bar=${barTime}`, metadata: { id, pipelineRunId } });

    // Broadcast to SSE clients
    const broadcastData = { type: "pipeline_report", id, receivedAt: new Date().toISOString(), payload: body };
    const clientsReached = broadcastSSE("pipeline_report", broadcastData);
    console.log(`[Nexus] Webhook accepted: id=${id} symbol=${symbol} state=${masterState} latency=${ingestionLatencyMs}ms sse_clients=${clientsReached}`);

    // Paper trading engine (async, non-blocking)
    processPaperTrading(body).catch((err) => console.error("[Nexus] Paper trading error:", err));

    res.status(201).json({ status: "accepted", id, idempotency_key: idempotencyKey, ingestion_latency_ms: ingestionLatencyMs, sse_clients_reached: clientsReached });
  });

  // Catch-all for /webhook/observe (no token)
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

    res.write(`event: connected\ndata: ${JSON.stringify({ type: "connected", client_id: clientId, ts: Date.now() })}\n\n`);

    // Catch-up: send latest stored report
    try {
      const latest = await getLatestPipelineReport();
      if (latest) {
        res.write(`event: catchup\ndata: ${JSON.stringify({ type: "pipeline_report", id: latest.id, receivedAt: latest.receivedAt.toISOString(), payload: latest.payload })}\n\n`);
      }
    } catch (err) {
      console.warn("[Nexus] Failed to send catch-up:", err);
    }

    // Heartbeat every 15s
    const heartbeatInterval = setInterval(() => {
      try {
        res.write(`event: heartbeat\ndata: ${JSON.stringify({ type: "heartbeat", client_id: clientId, ts: Date.now(), sse_clients: sseClients.size })}\n\n`);
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
    // DB connectivity check: lightweight query to verify database is reachable
    let dbStatus: "ok" | "error" = "ok";
    try {
      await getPipelineReportCount();
    } catch {
      dbStatus = "error";
    }
    const overallStatus = dbStatus === "ok" ? "ok" : "degraded";
    res.status(overallStatus === "ok" ? 200 : 503).json({
      status: overallStatus,
      ts: new Date().toISOString(),
      sse_clients: sseClients.size,
      last_webhook_at: lastWebhookAt,
      db: dbStatus,
    });
  });

  // ── GET /api/v1/stats ─────────────────────────────────────────────────────
  router.get("/v1/stats", async (_req: Request, res: Response) => {
    try {
      const count = await getPipelineReportCount();
      const latest = await getLatestPipelineReport();
      res.json({ total_reports: count, last_received_at: latest?.receivedAt?.toISOString() ?? null, last_master_state: latest?.masterState ?? null, last_symbol: latest?.symbol ?? null, sse_clients: sseClients.size, last_webhook_at: lastWebhookAt });
    } catch {
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });

  // ── GET /api/v1/reports ───────────────────────────────────────────────────
  router.get("/v1/reports", async (req: Request, res: Response) => {
    try {
      const limit = Math.min(parseInt((req.query.limit as string) ?? "50", 10), 200);
      const reports = await getRecentPipelineReports(limit);
      res.json(reports.map((r) => ({ id: r.id, received_at: r.receivedAt.toISOString(), bar_time: r.barTime, symbol: r.symbol, master_state: r.masterState, pipeline_run_id: r.pipelineRunId, payload: r.payload })));
    } catch {
      res.status(500).json({ error: "Failed to fetch reports" });
    }
  });
}
