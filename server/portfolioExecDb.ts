/**
 * portfolioExecDb.ts — Sprint 114A
 *
 * DB helpers for the unified portfolio execution layer.
 *
 * Architecture:
 *   - portfolioExecutionConfig (singleton id=1): master execution state
 *     PAPER_ONLY | APEX_EVAL_ACTIVE | HALTED
 *   - portfolioStrategyControls (one row per strategy): ENABLED/PAUSED/RETIRED/FAULTED
 *
 * The old tp_config per-strategy webhook/arm model is REPLACED by this module.
 * tp_config rows are preserved for historical audit only.
 */

import { getDb } from "./db.js";
import {
  portfolioExecutionConfig,
  portfolioStrategyControls,
} from "../drizzle/schema.js";
import { eq } from "drizzle-orm";

export type ExecutionState = "PAPER_ONLY" | "APEX_EVAL_ACTIVE" | "HALTED";
export type StrategyStatus = "ENABLED" | "PAUSED" | "RETIRED" | "FAULTED";

// ─── Portfolio Execution Config ───────────────────────────────────────────────

export async function getPortfolioExecConfig() {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(portfolioExecutionConfig).where(eq(portfolioExecutionConfig.id, 1)).limit(1);
  return rows[0] ?? null;
}

export async function setExecutionState(
  state: ExecutionState,
  opts?: { haltReason?: string; activatedByOwner?: boolean }
): Promise<{ success: boolean; reason: string }> {
  const db = await getDb();
  if (!db) return { success: false, reason: "DB unavailable" };

  const now = Date.now();
  const updates: Record<string, unknown> = {
    executionState: state,
    updatedAt: new Date(),
  };

  if (state === "APEX_EVAL_ACTIVE") {
    updates.activatedAt = now;
    updates.activatedByOwner = opts?.activatedByOwner ?? true;
    updates.haltReason = null;
    updates.haltedAt = null;
  } else if (state === "HALTED") {
    updates.haltReason = opts?.haltReason ?? "Manual halt";
    updates.haltedAt = now;
  } else if (state === "PAPER_ONLY") {
    updates.haltReason = null;
    updates.haltedAt = null;
  }

  await db.update(portfolioExecutionConfig).set(updates).where(eq(portfolioExecutionConfig.id, 1));
  return { success: true, reason: `Execution state set to ${state}` };
}

export async function setPortfolioWebhookUrl(webhookUrl: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(portfolioExecutionConfig)
    .set({ webhookUrl, updatedAt: new Date() })
    .where(eq(portfolioExecutionConfig.id, 1));
}

export async function updateLastDispatch(opts: {
  model: string;
  status: string;
  tpResponse?: string;
}): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(portfolioExecutionConfig)
    .set({
      lastApprovedModel: opts.model,
      lastDispatchAt: Date.now(),
      lastDispatchStatus: opts.status,
      lastTpResponse: opts.tpResponse ?? null,
      updatedAt: new Date(),
    })
    .where(eq(portfolioExecutionConfig.id, 1));
}

// ─── Strategy Controls ────────────────────────────────────────────────────────

export async function getAllStrategyControls() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(portfolioStrategyControls).orderBy(portfolioStrategyControls.strategyId);
}

export async function getStrategyControl(strategyId: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(portfolioStrategyControls)
    .where(eq(portfolioStrategyControls.strategyId, strategyId)).limit(1);
  return rows[0] ?? null;
}

export async function setStrategyStatus(
  strategyId: string,
  status: StrategyStatus,
  pauseReason?: string
): Promise<{ success: boolean; reason: string }> {
  const db = await getDb();
  if (!db) return { success: false, reason: "DB unavailable" };

  const existing = await getStrategyControl(strategyId);
  if (!existing) return { success: false, reason: `Strategy ${strategyId} not found` };

  await db.update(portfolioStrategyControls)
    .set({
      strategyStatus: status,
      pauseReason: pauseReason ?? null,
      updatedAt: new Date(),
    })
    .where(eq(portfolioStrategyControls.strategyId, strategyId));

  return { success: true, reason: `${strategyId} status set to ${status}` };
}

export async function recordStrategyProposal(opts: {
  strategyId: string;
  adeScore: number;
  direction: string;
  selected: boolean;
  noTradeReason?: string;
}): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const now = Date.now();
  const updates: Record<string, unknown> = {
    lastProposalAt: now,
    lastAdeScore: String(opts.adeScore.toFixed(4)),
    lastDirection: opts.direction,
    updatedAt: new Date(),
  };
  if (opts.selected) {
    updates.lastSelectedAt = now;
    updates.lastNoTradeReason = null;
  } else if (opts.noTradeReason) {
    updates.lastNoTradeReason = opts.noTradeReason;
  }
  await db.update(portfolioStrategyControls)
    .set(updates)
    .where(eq(portfolioStrategyControls.strategyId, opts.strategyId));
}
