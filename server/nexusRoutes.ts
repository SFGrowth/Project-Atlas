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
import { adeTradeRecords } from "../drizzle/schema";
import { getDb } from "./db";
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

// ─── Payload Normalisation ───────────────────────────────────────────────────
// The M-15 Pine Script sends a NESTED JSON structure. This function normalises
// it into a flat structure that the rest of the system expects.
// It handles both the nested Pine Script format AND legacy flat test payloads.

function normalisePayload(body: Record<string, unknown>): Record<string, unknown> {
  const meta = body.metadata as Record<string, unknown> | undefined;
  const ms   = body.market_state as Record<string, unknown> | undefined;
  const ade  = body.ade_decision as Record<string, unknown> | undefined;
  const ari  = body.ari_decision as Record<string, unknown> | undefined;
  const tvl  = body.tvl_decision as Record<string, unknown> | undefined;
  const pos  = body.position_state as Record<string, unknown> | undefined;
  const rsn  = body.reasoning as Record<string, unknown> | undefined;
  const models = body.model_evaluations as Record<string, unknown> | undefined;

  // If the payload is already flat (legacy test payloads), return as-is
  const isNested = !!(meta || ms || ade || ari || tvl);
  if (!isNested) return body;

  // Derive flat required fields from nested structure
  const symbol       = String(meta?.ticker ?? body.symbol ?? "MNQ1!");
  const timeframe    = String(meta?.timeframe ?? body.timeframe ?? "5");
  const event_id     = String(meta?.event_id ?? body.event_id ?? "");
  const timestamp_utc = String(meta?.timestamp_utc ?? body.timestamp_utc ?? "");
  const bar_time     = String(meta?.timestamp_utc ?? body.bar_time ?? timestamp_utc);
  const bar_index    = Number(meta?.bar_index ?? body.bar_index ?? 0);
  const chart_id     = String(meta?.chart_id ?? body.chart_id ?? "");
  // master_state: use market_state.session (the Pine Script's session name)
  const master_state = String(ms?.session ?? body.master_state ?? "UNKNOWN");

  // Flatten ADE fields (supports ADE v1 and v2 payload structures)
  const ade_decision        = ade?.has_candidate ? String(ade?.candidate_model ?? "NO_TRADE") : "NO_TRADE";
  const ade_candidate_model = String(ade?.candidate_model ?? null);
  const ade_version         = String(ade?.ade_version ?? "1.0.0");
  // ADE v2 uses norm_score (0-100); v1 used winning_edge_score (0-1)
  const ade_norm_score      = Number(ade?.norm_score ?? (Number(ade?.winning_edge_score ?? 0) * 100));
  const ade_raw_score       = Number(ade?.raw_score ?? 0);
  const ade_raw_max         = Number(ade?.raw_max ?? 0);
  const ade_edge_score      = ade_norm_score / 100; // keep legacy 0-1 scale for backward compat
  const ade_confidence      = String(ade?.confidence_level ?? null);
  const ade_rank_order      = String(ade?.ranking_order ?? ade?.tie_break_result ?? null);
  const ade_candidate_status    = String(ade?.candidate_status ?? (ade?.has_candidate ? "SELECTED" : "NO_TRADE"));
  const ade_candidate_direction = Number(ade?.candidate_direction ?? 0);
  const ade_tie_break_result    = String(ade?.tie_break_result ?? "NONE");
  // Extract model_ranking EAR data from ade_decision.model_ranking (ADE v2)
  const ade_model_ranking = ade?.model_ranking as Record<string, unknown> | undefined;
  // Build ade_v2 EAR for the winning model
  const winnerKey = ade_candidate_model?.toLowerCase() as string | undefined;
  const winnerEAR = (winnerKey && ade_model_ranking) ? ade_model_ranking[winnerKey] as Record<string, unknown> | undefined : undefined;
  const ade_v2 = winnerEAR ? {
    version:         ade_version,
    model:           ade_candidate_model,
    direction:       ade_candidate_direction === 1 ? "LONG" : ade_candidate_direction === -1 ? "SHORT" : "FLAT",
    raw_score:       Number(winnerEAR.raw ?? ade_raw_score),
    raw_max:         Number(winnerEAR.max ?? ade_raw_max),
    norm_score:      Number(winnerEAR.norm ?? ade_norm_score),
    confidence_tier: ade_confidence,
    d_ms01: Number(winnerEAR.ms01 ?? 0),
    d_ms02: Number(winnerEAR.ms02 ?? 0),
    d_ms03: Number(winnerEAR.ms03 ?? 0),
    d_ms04: Number(winnerEAR.ms04 ?? 0),
    d_ms05: Number(winnerEAR.ms05 ?? 0),
    d_eq01: Number(winnerEAR.eq01 ?? 0),
    d_eq02: Number(winnerEAR.eq02 ?? 0),
    d_eq03: Number(winnerEAR.eq03 ?? 0),
    d_tc01: Number(winnerEAR.tc01 ?? 0),
    d_tc02: Number(winnerEAR.tc02 ?? 0),
    d_si01: Number(winnerEAR.si01 ?? 0),
    d_si02: typeof winnerEAR.si02 === "number" ? winnerEAR.si02 : 0,
    d_si03: Number(winnerEAR.si03 ?? 0),
    d_cr01: Number(winnerEAR.cr01 ?? 0),
    d_cr02: Number(winnerEAR.cr02 ?? 0),
  } : null;
  // Build per-model v2 ranking from model_ranking EAR
  const buildModelRankV2 = (key: string, rank: number) => {
    const m = ade_model_ranking?.[key] as Record<string, unknown> | undefined;
    if (!m) return null;
    const norm = Number(m.norm ?? 0);
    return {
      rank,
      signal_direction: Number(m.dir ?? 0) === 1 ? "LONG" : Number(m.dir ?? 0) === -1 ? "SHORT" : "NEUTRAL",
      edge_score: norm / 100,
      norm_score: norm,
      raw_score: Number(m.raw ?? 0),
      raw_max: Number(m.max ?? 0),
      confidence: norm >= 80 ? "HIGH" : norm >= 65 ? "MEDIUM" : "LOW",
    };
  };
  const model_a1_v2 = buildModelRankV2("a1", 1);
  const model_a3_v2 = buildModelRankV2("a3", 2);
  const model_b1_v2 = buildModelRankV2("b1", 3);

  // Flatten ARI fields
  const ari_approved       = ari?.approved === true ? "APPROVED" : "REJECTED";
  const ari_approved_risk  = Number(ari?.approved_risk ?? ari?.estimated_risk_dollars ?? 0);
  const ari_daily_pnl      = Number(ari?.daily_pnl ?? 0);
  const ari_drawdown       = Number(ari?.current_drawdown ?? 0);
  const ari_consecutive_losses = Number(ari?.consecutive_losses ?? 0);
  const ari_consecutive_wins   = Number(ari?.consecutive_wins ?? 0);
  const ari_circuit_breaker    = ari?.circuit_breaker === true ? "OPEN" : "CLOSED";
  // Sprint 083: Profile and dollar-risk fields from ari_decision
  const ari_profile_id             = String(ari?.profile_id ?? body.profile_id ?? "ATLAS_PAPER_MNQ");
  const ari_profile_name           = String(ari?.profile_name ?? body.profile_name ?? "ATLAS PAPER — MNQ");
  const ari_execution_mode         = String(ari?.execution_mode ?? body.execution_mode ?? "PAPER");
  const ari_account_type           = String(ari?.account_type ?? body.account_type ?? "PAPER");
  const ari_execution_armed        = ari?.execution_armed === true || body.execution_armed === true;
  const ari_configured_risk        = Number(ari?.configured_risk_dollars ?? body.configured_risk_dollars ?? 100);
  const ari_estimated_risk         = Number(ari?.estimated_risk_dollars ?? ari?.approved_risk ?? 0);
  const ari_risk_difference        = Number(ari?.risk_difference_dollars ?? (ari_configured_risk - ari_estimated_risk));
  const ari_stop_distance_points   = Number(ari?.stop_distance_points ?? 0);
  const ari_risk_per_contract      = Number(ari?.risk_per_contract ?? 0);
  const ari_point_value            = Number(ari?.point_value ?? 2.0);
  const ari_maximum_contracts      = Number(ari?.maximum_contracts ?? 5);
  const ari_contracts              = Number(ari?.contracts ?? 0);

  // Flatten TVL fields
  const tvl_status             = String(tvl?.status ?? "FAIL");
  const tvl_execution_permitted = tvl?.execution_permission === true || tvl?.verified === true;
  const tvl_blocking_rule      = tvl?.blocking_rule ?? null;

  // Flatten market structure fields
  const adx   = Number(ms?.adx14 ?? 0) || null;
  const atr   = Number(ms?.atr14 ?? ms?.atr5 ?? 0) || null;
  const ema9  = Number(ms?.ema9 ?? 0) || null;
  const ema21 = Number(ms?.ema21 ?? 0) || null;
  const ema50 = Number(ms?.ema50 ?? 0) || null;
  const vwap  = Number(ms?.vwap ?? ms?.bar_close ?? 0) || null;
  const rsi   = Number(ms?.rsi14 ?? ms?.rsi ?? 0) || null;
  const volume_ratio = Number(ms?.rel_vol ?? ms?.volume_ratio ?? 0) || null;
  const trend = String(ms?.ema_structure ?? ms?.trend ?? "NEUTRAL");

  // Flatten position state
  const trade_id      = String(pos?.trade_id ?? null);
  const entry_price   = Number(pos?.entry_price ?? 0) || null;
  const stop_price    = Number(pos?.stop_price ?? 0) || null;
  const target_price  = Number(pos?.target_price ?? 0) || null;
  const unrealized_pnl = Number(pos?.current_pnl ?? 0) || null;
  const bars_in_trade = Number(pos?.bars_in_trade ?? 0) || null;

  // Flatten model evaluations
  const a1 = models?.a1 as Record<string, unknown> | undefined;
  const a3 = models?.a3 as Record<string, unknown> | undefined;
  const b1 = models?.b1 as Record<string, unknown> | undefined;
  const model_a1 = a1 ? { signal_direction: a1.direction === 1 ? "LONG" : a1.direction === -1 ? "SHORT" : "NEUTRAL", edge_score: Number(a1.reward_to_risk ?? 0), signal_basis: String(a1.signal_basis ?? ""), confidence: null } : null;
  const model_a3 = a3 ? { signal_direction: a3.direction === 1 ? "LONG" : a3.direction === -1 ? "SHORT" : "NEUTRAL", edge_score: Number(a3.reward_to_risk ?? 0), signal_basis: String(a3.signal_basis ?? ""), confidence: null } : null;
  const model_b1 = b1 ? { signal_direction: b1.direction === 1 ? "LONG" : b1.direction === -1 ? "SHORT" : "NEUTRAL", edge_score: Number(b1.reward_to_risk ?? 0), signal_basis: String(b1.signal_basis ?? ""), confidence: null } : null;

  // Brain view from reasoning.action_summary
  const brain_view = String(rsn?.action_summary ?? rsn?.market_state_summary ?? "");

  return {
    // Preserve original nested payload for storage
    ...body,
    // Flat required fields (override any existing)
    schema_version:  String(body.schema_version ?? "1.0.0"),
    payload_type:    String(body.payload_type ?? "OBSERVABILITY"),
    idempotency_key: String(body.idempotency_key ?? ""),
    pipeline_run_id: String(body.pipeline_run_id ?? ""),
    event_id,
    timestamp_utc,
    bar_time,
    bar_index,
    chart_id,
    symbol,
    timeframe,
    master_state,
    // Flat display fields
    trend,
    adx,
    atr,
    ema9,
    ema21,
    ema50,
    vwap,
    rsi,
    volume_ratio,
    trade_id,
    entry_price,
    stop_price,
    target_price,
    unrealized_pnl,
    bars_in_trade,
    model_a1,
    model_a3,
    model_b1,
    ade_decision,
    ade_candidate_model,
    ade_edge_score,
    ade_norm_score,
    ade_raw_score,
    ade_raw_max,
    ade_confidence,
    ade_rank_order,
    ade_candidate_status,
    ade_candidate_direction,
    ade_tie_break_result,
    ade_version,
    ade_v2,
    model_a1_v2,
    model_a3_v2,
    model_b1_v2,
    ari_approved,
    ari_approved_risk,
    ari_daily_pnl,
    ari_drawdown,
    ari_consecutive_losses,
    ari_consecutive_wins,
    ari_circuit_breaker,
    // Sprint 083: Profile and dollar-risk fields
    ari_profile_id,
    ari_profile_name,
    ari_execution_mode,
    ari_account_type,
    ari_execution_armed,
    ari_configured_risk,
    ari_estimated_risk,
    ari_risk_difference,
    ari_stop_distance_points,
    ari_risk_per_contract,
    ari_point_value,
    ari_maximum_contracts,
    ari_contracts,
    tvl_status,
    tvl_execution_permitted,
    tvl_blocking_rule,
    brain_view,
    // Nested originals kept for paper trading engine
    ade: { decision: ade_decision, candidate_model: ade_candidate_model, edge_score: ade_edge_score },
    ari: { approval: ari_approved, approved_risk: ari_approved_risk, circuit_breaker: ari_circuit_breaker, rejection_reason: String(ari?.rejection_reason ?? null) },
    tvl: { status: tvl_status },
    market_structure: { vwap, ema9, ema21, ema50, adx, atr, rsi },
    position_state: pos,
    atlas_brain_view: brain_view,
  };
}

// ─── Schema Validation ────────────────────────────────────────────────────────

const REQUIRED_FIELDS = [
  "schema_version", "payload_type", "event_id", "idempotency_key",
  "pipeline_run_id", "timestamp_utc", "bar_time", "bar_index",
  "chart_id", "symbol", "timeframe", "master_state",
] as const;

function validatePayload(body: Record<string, unknown>): string | null {
  for (const field of REQUIRED_FIELDS) {
    if (body[field] === undefined || body[field] === null || body[field] === "") {
      return `Missing required field: ${field}`;
    }
  }
  if (body.schema_version !== "1.0.0") return `Invalid schema_version: expected "1.0.0", got "${body.schema_version}"`;
  if (body.payload_type !== "OBSERVABILITY") return `Invalid payload_type: expected "OBSERVABILITY", got "${body.payload_type}"`;
  if (body.symbol !== "MNQ1!") return `Invalid symbol: expected "MNQ1!", got "${body.symbol}"`;
  // Timeframe validation: M-15 Pine Script sends timeframe as "5" (5-minute bars)
  if (String(body.timeframe) !== "5") return `Invalid timeframe: expected "5" (5-minute), got "${body.timeframe}"`;
  return null;
}

// ─── Constant-time string comparison ─────────────────────────────────────────

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ─── Notification Deduplication ───────────────────────────────────────────────
// Prevents the same notification type from firing multiple times in a short window.
// Each entry stores the last time (ms) that notification type was sent.

const notifLastSent = new Map<string, number>();

// Cooldown windows per notification type (milliseconds)
const NOTIF_COOLDOWN_MS: Record<string, number> = {
  ARI_REJECTION:   5 * 60 * 1000,   //  5 minutes
  CIRCUIT_BREAKER: 30 * 60 * 1000,  // 30 minutes
  TRADE_OPENED:    0,                // always send (unique per trade)
  TRADE_CLOSED:    0,                // always send (unique per trade)
  TARGET_HIT:      0,                // always send
  STOP_HIT:        0,                // always send
  WEBHOOK_FAILURE: 60 * 60 * 1000,  // 1 hour
  TV_DISCONNECTED: 2 * 60 * 60 * 1000, // 2 hours
  ATLAS_ONLINE:    0,                // always send (startup)
  SYSTEM_OFFLINE:  0,                // always send (shutdown)
};

function shouldSendNotification(type: string): boolean {
  const cooldown = NOTIF_COOLDOWN_MS[type] ?? 10 * 60 * 1000; // default 10 min
  if (cooldown === 0) return true;
  const last = notifLastSent.get(type);
  if (last === undefined) return true;
  return (Date.now() - last) >= cooldown;
}

function markNotificationSent(type: string): void {
  notifLastSent.set(type, Date.now());
}

// ─── Notification helper ──────────────────────────────────────────────────────

async function sendNotification(type: string, title: string, body: string, metadata?: unknown) {
  if (!shouldSendNotification(type)) {
    console.log(`[Nexus] Notification suppressed (cooldown active): ${type}`);
    return;
  }
  markNotificationSent(type);
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

        // ── Primary close detection: M-15 Pine Script sends status="ARCHIVED" on close
        // This is the authoritative close signal from TradingView.
        const posStatus = String(pos?.status ?? "");
        const posExitReason = String(pos?.exit_reason ?? "");
        const posCurrentPnl = Number(pos?.current_pnl ?? null);
        const posCurrentR = Number(pos?.current_r ?? null);

        let shouldClose = false;
        let exitReason = "";
        let exitPrice = currentPrice;
        let finalPnlOverride: number | null = null;
        let finalROverride: number | null = null;

        // Primary: Pine Script reports position as ARCHIVED with an exit reason
        if (posStatus === "ARCHIVED" && posExitReason && posExitReason !== "NONE" && posExitReason !== "null") {
          shouldClose = true;
          exitReason = posExitReason; // "TARGET_HIT" or "STOP_HIT"
          // Use Pine Script's authoritative P&L if available
          if (!isNaN(posCurrentPnl) && posCurrentPnl !== 0) finalPnlOverride = posCurrentPnl;
          if (!isNaN(posCurrentR) && posCurrentR !== 0) finalROverride = posCurrentR;
          // Estimate exit price from stop/target
          const stop = openTrade.stop ? Number(openTrade.stop) : null;
          const target = openTrade.target ? Number(openTrade.target) : null;
          if (exitReason === "TARGET_HIT" && target !== null) exitPrice = target;
          else if (exitReason === "STOP_HIT" && stop !== null) exitPrice = stop;
        }

        // Fallback: price-based detection (for test webhooks and edge cases)
        if (!shouldClose) {
          const stop = openTrade.stop ? Number(openTrade.stop) : null;
          const target = openTrade.target ? Number(openTrade.target) : null;

          if (stop !== null) {
            if (direction === "LONG" && currentPrice <= stop) { shouldClose = true; exitReason = "STOP_HIT"; exitPrice = stop; }
            if (direction === "SHORT" && currentPrice >= stop) { shouldClose = true; exitReason = "STOP_HIT"; exitPrice = stop; }
          }
          if (target !== null && !shouldClose) {
            if (direction === "LONG" && currentPrice >= target) { shouldClose = true; exitReason = "TARGET_HIT"; exitPrice = target; }
            if (direction === "SHORT" && currentPrice <= target) { shouldClose = true; exitReason = "TARGET_HIT"; exitPrice = target; }
          }
        }

        if (shouldClose) {
          const finalPriceDiff = direction === "LONG" ? exitPrice - entry : entry - exitPrice;
          const calcPnl = finalPriceDiff * 4 * tickValue * contracts;
          // Use Pine Script's authoritative P&L if available, otherwise use calculated
          const finalPnl = finalPnlOverride !== null ? finalPnlOverride : calcPnl;
          const calcR = riskDollars > 0 ? calcPnl / riskDollars : 0;
          const finalR = finalROverride !== null ? finalROverride : calcR;
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

          // Notifications (TARGET_HIT and STOP_HIT always fire — unique per trade)
          if (exitReason === "TARGET_HIT") {
            await sendNotification("TARGET_HIT", "🎯 Target Hit", `${openTrade.model} ${openTrade.direction} trade closed at target. P&L: $${finalPnl.toFixed(2)} (${finalR.toFixed(2)}R)`, { tradeId: openTrade.id });
          } else if (exitReason === "STOP_HIT") {
            await sendNotification("STOP_HIT", "🛑 Stop Hit", `${openTrade.model} ${openTrade.direction} trade stopped out. P&L: $${finalPnl.toFixed(2)} (${finalR.toFixed(2)}R)`, { tradeId: openTrade.id });
          }
          await sendNotification("TRADE_CLOSED", "Trade Closed", `${openTrade.model} ${openTrade.direction} | ${exitReason} | P&L: $${finalPnl.toFixed(2)}`, { tradeId: openTrade.id });

          await insertHealthEvent({ eventType: "TRADE_CLOSED", severity: "INFO", message: `${openTrade.model} ${openTrade.direction} closed: ${exitReason} P&L=$${finalPnl.toFixed(2)}` });

          // ── Self-Learning Framework: insert ADE trade record ──────────────
          try {
            const db2 = await getDb();
            if (db2) {
              const outcome = finalPnl > 0 ? "WIN" : finalPnl < 0 ? "LOSS" : "BREAKEVEN";
              const ear = (payload as any)?.ade_v2 ?? null;
              await db2.insert(adeTradeRecords).values({
                tradeId: openTrade.id,
                model: openTrade.model,
                adeVersion: ear?.version ?? "2.0.0",
                outcome,
                rMultiple: String(finalR.toFixed(4)),
                pnl: String(finalPnl.toFixed(2)),
                normScore: ear ? String(ear.norm_score.toFixed(2)) : null,
                confidence: ear?.confidence_tier ?? null,
                dMs01: ear ? String(ear.d_ms01 ?? 0) : null,
                dMs02: ear ? String(ear.d_ms02 ?? 0) : null,
                dMs03: ear ? String(ear.d_ms03 ?? 0) : null,
                dMs04: ear ? String(ear.d_ms04 ?? 0) : null,
                dMs05: ear ? String(ear.d_ms05 ?? 0) : null,
                dEq01: ear ? String(ear.d_eq01 ?? 0) : null,
                dEq02: ear ? String(ear.d_eq02 ?? 0) : null,
                dEq03: ear ? String(ear.d_eq03 ?? 0) : null,
                dTc01: ear ? String(ear.d_tc01 ?? 0) : null,
                dTc02: ear ? String(ear.d_tc02 ?? 0) : null,
                dSi01: ear ? String(ear.d_si01 ?? 0) : null,
                dSi02: ear ? String(ear.d_si02 ?? 0) : null,
                dSi03: ear ? String(ear.d_si03 ?? 0) : null,
                dCr01: ear ? String(ear.d_cr01 ?? 0) : null,
                dCr02: ear ? String(ear.d_cr02 ?? 0) : null,
                rawScore: ear ? String(ear.raw_score ?? 0) : null,
                rawMax: ear ? String(ear.raw_max ?? 0) : null,
                session: String(payload?.master_state ?? "UNKNOWN"),
                adx14: String(Number(payload?.adx ?? 0).toFixed(4)),
                atr14: String(Number(payload?.atr ?? 0).toFixed(4)),
                openedAt: openTrade.openedAt,
                closedAt,
              });
            }
          } catch (slfErr) {
            console.error("[SLF] Failed to insert ade_trade_record:", slfErr);
          }
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
      // Direction: from ade_candidate_direction (integer 1=LONG/-1=SHORT) or position_state.direction
      const dirInt = Number(payload.ade_candidate_direction ?? pos?.direction ?? 0);
      const direction: "LONG" | "SHORT" = dirInt === -1 ? "SHORT" : "LONG";
      const edgeScore = Number(ade?.edge_score ?? 0);
      const approvedRisk = Number(ari?.approved_risk ?? 100);

      // Extract entry/stop/target from position_state (M-15 uses entry_price/stop_price/target_price)
      // Fall back to VWAP for entry if position_state fields are not yet populated
      const entry = Number(pos?.entry_price ?? pos?.entry ?? mkt?.vwap ?? 0);
      const stop = Number(pos?.stop_price ?? pos?.stop ?? ari?.stop_price ?? 0);
      const target = Number(pos?.target_price ?? pos?.target ?? ari?.target_price ?? 0);

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

    // ── ARI Rejection notification (deduplicated: 5-min cooldown) ─────────────
    if (adeDecision !== "NO_TRADE" && ariApproval === "REJECTED") {
      const ariReason = String(ari?.rejection_reason ?? "Risk limit");
      await insertHealthEvent({ eventType: "ARI_REJECTION", severity: "WARN", message: `ARI rejected ${adeDecision}: ${ariReason}` });
      await sendNotification("ARI_REJECTION", "⚠️ ARI Rejection", `${adeDecision} signal rejected by ARI: ${ariReason}`, { masterState });
    }

    // ── Circuit breaker notification (deduplicated: 30-min cooldown) ──────────
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
let serverStartedAt: number = Date.now();
let webhookFailureNotified = false;

// Grace period: do not fire WEBHOOK_FAILURE in the first 10 minutes after startup
// (server may be starting fresh before the first TradingView bar close)
const STARTUP_GRACE_PERIOD_MS = 10 * 60 * 1000;

// Check every 10 minutes if we haven't received a webhook during market hours
setInterval(async () => {
  const now = new Date();
  const hour = now.getUTCHours();
  const day = now.getUTCDay();
  const isMarketHours = day >= 1 && day <= 5 && hour >= 14 && hour < 21; // 14:00-21:00 UTC = 9:30-16:00 ET

  // Apply startup grace period: skip WEBHOOK_FAILURE check for first 10 min
  const uptimeMs = Date.now() - serverStartedAt;
  if (uptimeMs < STARTUP_GRACE_PERIOD_MS) return;

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

  // Apply startup grace period: skip TV_DISCONNECTED check for first 10 min
  const uptimeMs = Date.now() - serverStartedAt;
  if (uptimeMs < STARTUP_GRACE_PERIOD_MS) return;

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

    const rawBody = req.body as Record<string, unknown>;

    const payloadSecret = (rawBody.webhook_secret as string) ?? "";
    if (!safeEqual(payloadSecret, expectedToken)) {
      res.status(403).json({ error: "Invalid or missing webhook_secret in payload" });
      return;
    }

    // Normalise nested Pine Script payload to flat structure
    const body = normalisePayload(rawBody);

    const validationError = validatePayload(body);
    if (validationError) {
      console.warn(`[Nexus] Payload validation failed: ${validationError}`, JSON.stringify(rawBody).slice(0, 200));
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
    tvDisconnectNotified = false; // reset on successful receipt
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
