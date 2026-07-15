/**
 * tpDispatch.ts — TradersPost Dispatch Engine
 *
 * Sprint 113: Server-side TradersPost dispatch.
 *
 * This module fires AFTER the paper trade engine selects a model.
 * It is purely additive — it does not modify, interrupt, or replace
 * any existing pipeline logic.
 *
 * Governance gates (in order):
 *   1. Idempotency check — skip if already dispatched for this bar+model+direction
 *   2. Config check — skip if strategy not found or DISARMED
 *   3. Frozen check — skip if frozenUntilOwnerApproval === true
 *   4. Safety lockout — skip if apex_safety_state.isHalted === true
 *   5. PRE_LIVE_GATE — skip if preLiveGateRequired and gate not passed
 *   6. Dispatch — POST to TradersPost webhook URL
 *   7. Log — write result to tp_dispatch_log
 */

import {
  getTpConfig,
  getTpDispatchByKey,
  logTpDispatch,
  type TpStrategyId,
} from "./tpDb.js";

export interface TpDispatchParams {
  model: TpStrategyId;
  direction: "LONG" | "SHORT";
  entryPrice: number;
  stopPrice: number;
  targetPrice: number;
  barTimeMs: number;
  atlasMemoryBarId: number;
  pipelineRunId: string;
}

/**
 * Build the TradersPost webhook payload.
 * Follows the TradersPost JSON format for bracket orders.
 */
function buildTpPayload(params: TpDispatchParams, quantity: number, idempotencyKey: string): Record<string, unknown> {
  const isBuy = params.direction === "LONG";
  return {
    ticker: "MNQ1!",
    action: isBuy ? "buy" : "sell",
    sentiment: isBuy ? "bullish" : "bearish",
    quantity,
    stopLoss: {
      type: "stop",
      value: params.stopPrice,
    },
    takeProfit: {
      type: "limit",
      value: params.targetPrice,
    },
    passthrough: {
      atlas_strategy_id: params.model,
      atlas_idempotency_key: idempotencyKey,
      atlas_bar_time_ms: params.barTimeMs,
      atlas_bar_time_utc: new Date(params.barTimeMs).toISOString(),
      atlas_pipeline_run_id: params.pipelineRunId,
      atlas_entry_price: params.entryPrice,
      atlas_stop_price: params.stopPrice,
      atlas_target_price: params.targetPrice,
      atlas_version: "1.0.0",
    },
  };
}

/**
 * Check if the PRE_LIVE_GATE certification has passed.
 * Reads from exec_cert_runs — looks for a completed PRE_LIVE_GATE run where all stages passed.
 */
async function isPreLiveGatePassed(): Promise<boolean> {
  try {
    const { getDb } = await import("./db.js");
    const { execCertRuns } = await import("../drizzle/schema.js");
    const { eq, and } = await import("drizzle-orm");
    const db = await getDb();
    if (!db) return false;
    const runs = await db.select().from(execCertRuns)
      .where(and(
        eq(execCertRuns.runType, "PRE_LIVE_GATE"),
        eq(execCertRuns.overallStatus, "PASS"),
      ))
      .limit(1);
    return runs.length > 0;
  } catch {
    return false;
  }
}

/**
 * Main dispatch function.
 * Called from nexusRoutes.ts after paperTradeEngine.processBar() returns signalFired=true.
 */
export async function dispatchTradersPost(params: TpDispatchParams): Promise<void> {
  const idempotencyKey = `TP_${params.model}_${params.barTimeMs}_${params.direction}`;

  // ── Gate 1: Idempotency check ──────────────────────────────────────────────
  try {
    const existing = await getTpDispatchByKey(idempotencyKey);
    if (existing) {
      console.log(`[TP-DISPATCH] DUPLICATE_SKIPPED: ${idempotencyKey}`);
      return; // Already dispatched — no log needed (already exists)
    }
  } catch (err) {
    console.error("[TP-DISPATCH] Idempotency check failed:", err);
    // Continue — better to risk a duplicate than miss a dispatch
  }

  // ── Gate 2: Config check ───────────────────────────────────────────────────
  const config = await getTpConfig(params.model);
  if (!config) {
    await logTpDispatch({ idempotencyKey, strategyId: params.model, barTimeMs: params.barTimeMs, direction: params.direction, entryPrice: params.entryPrice, stopPrice: params.stopPrice, targetPrice: params.targetPrice, status: "DISARMED", errorMessage: "Strategy config not found in tp_config", atlasMemoryBarId: params.atlasMemoryBarId, pipelineRunId: params.pipelineRunId });
    return;
  }

  // ── Gate 3: Frozen check ───────────────────────────────────────────────────
  if (config.frozenUntilOwnerApproval) {
    await logTpDispatch({ idempotencyKey, strategyId: params.model, barTimeMs: params.barTimeMs, direction: params.direction, entryPrice: params.entryPrice, stopPrice: params.stopPrice, targetPrice: params.targetPrice, status: "FROZEN", errorMessage: "Strategy frozen until owner approval", atlasMemoryBarId: params.atlasMemoryBarId, pipelineRunId: params.pipelineRunId });
    return;
  }

  // ── Gate 4: Armed check ────────────────────────────────────────────────────
  if (!config.armed) {
    await logTpDispatch({ idempotencyKey, strategyId: params.model, barTimeMs: params.barTimeMs, direction: params.direction, entryPrice: params.entryPrice, stopPrice: params.stopPrice, targetPrice: params.targetPrice, status: "DISARMED", atlasMemoryBarId: params.atlasMemoryBarId, pipelineRunId: params.pipelineRunId });
    return;
  }

  // ── Gate 5: Webhook URL check ──────────────────────────────────────────────
  if (!config.webhookUrl) {
    await logTpDispatch({ idempotencyKey, strategyId: params.model, barTimeMs: params.barTimeMs, direction: params.direction, entryPrice: params.entryPrice, stopPrice: params.stopPrice, targetPrice: params.targetPrice, status: "DISARMED", errorMessage: "Webhook URL not configured", atlasMemoryBarId: params.atlasMemoryBarId, pipelineRunId: params.pipelineRunId });
    return;
  }

  // ── Gate 6: Safety lockout ─────────────────────────────────────────────────
  try {
    const { getSafetyState } = await import("./execCertDb.js");
    const safety = await getSafetyState();
    if (safety?.isHalted) {
      await logTpDispatch({ idempotencyKey, strategyId: params.model, barTimeMs: params.barTimeMs, direction: params.direction, entryPrice: params.entryPrice, stopPrice: params.stopPrice, targetPrice: params.targetPrice, status: "SAFETY_HALTED", errorMessage: `Safety halt: ${safety.haltReason}`, atlasMemoryBarId: params.atlasMemoryBarId, pipelineRunId: params.pipelineRunId });
      return;
    }
  } catch (err) {
    console.error("[TP-DISPATCH] Safety check failed:", err);
    // Fail-safe: block dispatch if safety check errors
    await logTpDispatch({ idempotencyKey, strategyId: params.model, barTimeMs: params.barTimeMs, direction: params.direction, entryPrice: params.entryPrice, stopPrice: params.stopPrice, targetPrice: params.targetPrice, status: "ERROR", errorMessage: `Safety check error: ${String(err)}`, atlasMemoryBarId: params.atlasMemoryBarId, pipelineRunId: params.pipelineRunId });
    return;
  }

  // ── Gate 7: PRE_LIVE_GATE check ────────────────────────────────────────────
  if (config.preLiveGateRequired) {
    const gatePassed = await isPreLiveGatePassed();
    if (!gatePassed) {
      await logTpDispatch({ idempotencyKey, strategyId: params.model, barTimeMs: params.barTimeMs, direction: params.direction, entryPrice: params.entryPrice, stopPrice: params.stopPrice, targetPrice: params.targetPrice, status: "PRE_LIVE_GATE_BLOCKED", errorMessage: "PRE_LIVE_GATE certification not passed", atlasMemoryBarId: params.atlasMemoryBarId, pipelineRunId: params.pipelineRunId });
      return;
    }
  }

  // ── Dispatch ───────────────────────────────────────────────────────────────
  const payload = buildTpPayload(params, config.quantity ?? 1, idempotencyKey);
  try {
    console.log(`[TP-DISPATCH] Dispatching ${params.model} ${params.direction} @ ${params.entryPrice} → TradersPost`);
    const response = await fetch(config.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const responseBody = await response.text();
    const httpStatus = response.status;
    const status = response.ok ? "DISPATCHED" : "ERROR";
    await logTpDispatch({
      idempotencyKey,
      strategyId: params.model,
      barTimeMs: params.barTimeMs,
      direction: params.direction,
      entryPrice: params.entryPrice,
      stopPrice: params.stopPrice,
      targetPrice: params.targetPrice,
      status,
      httpStatus,
      responseBody,
      errorMessage: response.ok ? null : `HTTP ${httpStatus}: ${responseBody}`,
      atlasMemoryBarId: params.atlasMemoryBarId,
      pipelineRunId: params.pipelineRunId,
    });
    if (response.ok) {
      console.log(`[TP-DISPATCH] SUCCESS: ${params.model} ${params.direction} | HTTP ${httpStatus}`);
    } else {
      console.error(`[TP-DISPATCH] HTTP ERROR: ${params.model} ${params.direction} | HTTP ${httpStatus} | ${responseBody}`);
    }
  } catch (err) {
    console.error(`[TP-DISPATCH] FETCH ERROR: ${params.model} ${params.direction}:`, err);
    await logTpDispatch({
      idempotencyKey,
      strategyId: params.model,
      barTimeMs: params.barTimeMs,
      direction: params.direction,
      entryPrice: params.entryPrice,
      stopPrice: params.stopPrice,
      targetPrice: params.targetPrice,
      status: "ERROR",
      errorMessage: String(err),
      atlasMemoryBarId: params.atlasMemoryBarId,
      pipelineRunId: params.pipelineRunId,
    });
  }
}
