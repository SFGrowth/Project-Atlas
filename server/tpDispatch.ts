/**
 * tpDispatch.ts — Sprint 114A: Unified Portfolio Execution Dispatch
 *
 * Architecture:
 *   - ONE TradersPost webhook for the entire Atlas portfolio
 *   - ONE master execution state: PAPER_ONLY | APEX_EVAL_ACTIVE | HALTED
 *   - Per-strategy ENABLED/PAUSED/RETIRED/FAULTED controls (proposal gate only)
 *   - selected_strategy_id in payload preserves per-model reporting
 *
 * Gate order (fail-fast):
 *   1. Idempotency — skip if already dispatched for this bar+model+direction
 *   2. Execution state — PAPER_ONLY = no dispatch; HALTED = blocked
 *   3. Webhook URL — must be configured
 *   4. Safety lockout — apex_safety_state.isHalted
 *   5. Dispatch → log result
 */

import { logTpDispatch, getTpDispatchByKey } from "./tpDb.js";
import { getPortfolioExecConfig, updateLastDispatch } from "./portfolioExecDb.js";

export interface TpDispatchParams {
  model: string;                    // ADE-selected strategy ID
  direction: "LONG" | "SHORT";
  entryPrice: number;
  stopPrice: number;
  targetPrice: number;
  barTimeMs: number;
  atlasMemoryBarId?: number;
  pipelineRunId?: string;
  riskDollars?: number;
  contracts?: number;
  atlasDecisionId?: string;         // optional pipeline run ID as decision ID
}

function buildUnifiedPayload(params: TpDispatchParams, config: {
  ticker: string;
  quantity: number;
  accountLabel: string | null;
}, idempotencyKey: string) {
  const action = params.direction === "LONG" ? "buy" : "sell";
  return {
    ticker: config.ticker,
    action,
    price: params.entryPrice,
    quantity: config.quantity,
    // Atlas metadata — preserved in TradersPost logs
    atlas: {
      selected_strategy_id: params.model,
      strategy_version: "1.0.0",
      direction: params.direction,
      entry_price: params.entryPrice,
      stop_price: params.stopPrice,
      target_price: params.targetPrice,
      risk_dollars: params.riskDollars ?? 450,
      contracts: params.contracts ?? config.quantity,
      entry_type: "MARKET",
      account_routing_label: config.accountLabel ?? "APEX_50K_EVAL",
      signal_timestamp_utc: new Date(params.barTimeMs).toISOString(),
      atlas_decision_id: params.atlasDecisionId ?? params.pipelineRunId ?? "",
      idempotency_key: idempotencyKey,
      atlas_bar_time_utc: new Date(params.barTimeMs).toISOString(),
      atlas_pipeline_run_id: params.pipelineRunId,
      atlas_version: "1.0.0",
    },
  };
}

/**
 * Main unified dispatch function.
 * Called from nexusRoutes.ts after paperTradeEngine.processBar() returns signalFired=true.
 */
export async function dispatchTradersPost(params: TpDispatchParams): Promise<void> {
  const idempotencyKey = `TP_${params.model}_${params.barTimeMs}_${params.direction}`;

  // ── Gate 1: Idempotency check ──────────────────────────────────────────────
  try {
    const existing = await getTpDispatchByKey(idempotencyKey);
    if (existing) {
      console.log(`[TP-DISPATCH] DUPLICATE_SKIPPED: ${idempotencyKey}`);
      return;
    }
  } catch (err) {
    console.error("[TP-DISPATCH] Idempotency check failed:", err);
    // Continue — better to risk a duplicate than miss a dispatch
  }

  // ── Gate 2: Portfolio execution state ──────────────────────────────────────
  const execConfig = await getPortfolioExecConfig();
  if (!execConfig) {
    await logTpDispatch({ idempotencyKey, strategyId: params.model, barTimeMs: params.barTimeMs, direction: params.direction, entryPrice: params.entryPrice, stopPrice: params.stopPrice, targetPrice: params.targetPrice, status: "DISARMED", errorMessage: "Portfolio execution config not found", atlasMemoryBarId: params.atlasMemoryBarId, pipelineRunId: params.pipelineRunId });
    return;
  }

  if (execConfig.executionState === "PAPER_ONLY") {
    // Paper mode — paper trade was already opened by processBar(); no TradersPost dispatch
    await logTpDispatch({ idempotencyKey, strategyId: params.model, barTimeMs: params.barTimeMs, direction: params.direction, entryPrice: params.entryPrice, stopPrice: params.stopPrice, targetPrice: params.targetPrice, status: "DISARMED", errorMessage: "PAPER_ONLY mode — no live dispatch", atlasMemoryBarId: params.atlasMemoryBarId, pipelineRunId: params.pipelineRunId });
    return;
  }

  if (execConfig.executionState === "HALTED") {
    await logTpDispatch({ idempotencyKey, strategyId: params.model, barTimeMs: params.barTimeMs, direction: params.direction, entryPrice: params.entryPrice, stopPrice: params.stopPrice, targetPrice: params.targetPrice, status: "SAFETY_HALTED", errorMessage: `Portfolio HALTED: ${execConfig.haltReason ?? "manual halt"}`, atlasMemoryBarId: params.atlasMemoryBarId, pipelineRunId: params.pipelineRunId });
    return;
  }

  // ── Gate 3: Webhook URL check ──────────────────────────────────────────────
  if (!execConfig.webhookUrl) {
    await logTpDispatch({ idempotencyKey, strategyId: params.model, barTimeMs: params.barTimeMs, direction: params.direction, entryPrice: params.entryPrice, stopPrice: params.stopPrice, targetPrice: params.targetPrice, status: "DISARMED", errorMessage: "Portfolio webhook URL not configured", atlasMemoryBarId: params.atlasMemoryBarId, pipelineRunId: params.pipelineRunId });
    return;
  }

  // ── Gate 4: Safety lockout ─────────────────────────────────────────────────
  try {
    const { getSafetyState } = await import("./execCertDb.js");
    const safety = await getSafetyState();
    if (safety?.isHalted) {
      // Auto-halt the portfolio execution state
      const { setExecutionState } = await import("./portfolioExecDb.js");
      await setExecutionState("HALTED", { haltReason: `Safety engine halt: ${safety.haltReason}` });
      await logTpDispatch({ idempotencyKey, strategyId: params.model, barTimeMs: params.barTimeMs, direction: params.direction, entryPrice: params.entryPrice, stopPrice: params.stopPrice, targetPrice: params.targetPrice, status: "SAFETY_HALTED", errorMessage: `Safety halt: ${safety.haltReason}`, atlasMemoryBarId: params.atlasMemoryBarId, pipelineRunId: params.pipelineRunId });
      return;
    }
  } catch (err) {
    console.error("[TP-DISPATCH] Safety check failed:", err);
    await logTpDispatch({ idempotencyKey, strategyId: params.model, barTimeMs: params.barTimeMs, direction: params.direction, entryPrice: params.entryPrice, stopPrice: params.stopPrice, targetPrice: params.targetPrice, status: "ERROR", errorMessage: `Safety check error: ${String(err)}`, atlasMemoryBarId: params.atlasMemoryBarId, pipelineRunId: params.pipelineRunId });
    return;
  }

  // ── Dispatch ───────────────────────────────────────────────────────────────
  const payload = buildUnifiedPayload(params, {
    ticker: execConfig.ticker ?? "MNQ1!",
    quantity: execConfig.quantity ?? 1,
    accountLabel: execConfig.accountLabel,
  }, idempotencyKey);

  try {
    console.log(`[TP-DISPATCH] Dispatching ${params.model} ${params.direction} @ ${params.entryPrice} → TradersPost (APEX_EVAL_ACTIVE)`);
    const response = await fetch(execConfig.webhookUrl, {
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
      atlasMemoryBarId: params.atlasMemoryBarId,
      pipelineRunId: params.pipelineRunId,
    });

    // Update denormalised last-dispatch fields on the singleton config
    await updateLastDispatch({
      model: params.model,
      status,
      tpResponse: responseBody,
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
