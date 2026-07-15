/**
 * tpDb.ts — TradersPost Integration Database Helpers
 *
 * Sprint 113: Server-side TradersPost dispatch engine.
 *
 * Architecture:
 *   Pipeline A (M-16 → Atlas) is UNCHANGED.
 *   Pipeline B (Atlas → TradersPost) fires AFTER the paper trade engine selects a model.
 *   This module provides DB helpers for tp_config and tp_dispatch_log.
 *
 * Governance:
 *   - All strategies start DISARMED (armed = false)
 *   - S109-001 has frozenUntilOwnerApproval = true — cannot be armed via API
 *   - Every dispatch attempt is logged with an idempotency key
 *   - Safety lockout and PRE_LIVE_GATE are checked before every dispatch
 */

import { getDb } from "./db.js";
import { tpConfig, tpDispatchLog } from "../drizzle/schema.js";
import { eq, desc } from "drizzle-orm";

// ─── Config Helpers ───────────────────────────────────────────────────────────

export type TpStrategyId = "A1" | "A3" | "B1" | "S109-001";

/**
 * Get the TradersPost config for a specific strategy.
 */
export async function getTpConfig(strategyId: TpStrategyId) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(tpConfig).where(eq(tpConfig.strategyId, strategyId)).limit(1);
  return rows[0] ?? null;
}

/**
 * Get all TradersPost configs.
 */
export async function getAllTpConfigs() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(tpConfig).orderBy(tpConfig.strategyId);
}

/**
 * Update the webhook URL for a strategy.
 * The URL is the TradersPost webhook URL for the strategy.
 */
export async function setTpWebhookUrl(strategyId: TpStrategyId, webhookUrl: string) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(tpConfig)
    .set({ webhookUrl, updatedAt: new Date() })
    .where(eq(tpConfig.strategyId, strategyId));
}

/**
 * Arm a strategy (set armed = true).
 * BLOCKED if frozenUntilOwnerApproval === true.
 * Returns { success, reason }.
 */
export async function armTpStrategy(strategyId: TpStrategyId): Promise<{ success: boolean; reason: string }> {
  const db = await getDb();
  if (!db) return { success: false, reason: "DB unavailable" };
  const config = await getTpConfig(strategyId);
  if (!config) return { success: false, reason: "Strategy not found" };
  if (config.frozenUntilOwnerApproval) {
    return { success: false, reason: `${strategyId} is FROZEN until owner approval. Update frozenUntilOwnerApproval in the database to unlock.` };
  }
  if (!config.webhookUrl) {
    return { success: false, reason: "Webhook URL not configured. Set the TradersPost webhook URL before arming." };
  }
  await db.update(tpConfig)
    .set({ armed: true, updatedAt: new Date() })
    .where(eq(tpConfig.strategyId, strategyId));
  return { success: true, reason: `${strategyId} ARMED` };
}

/**
 * Disarm a strategy (set armed = false).
 */
export async function disarmTpStrategy(strategyId: TpStrategyId): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(tpConfig)
    .set({ armed: false, updatedAt: new Date() })
    .where(eq(tpConfig.strategyId, strategyId));
}

/**
 * Update notes for a strategy.
 */
export async function setTpNotes(strategyId: TpStrategyId, notes: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(tpConfig)
    .set({ notes, updatedAt: new Date() })
    .where(eq(tpConfig.strategyId, strategyId));
}

// ─── Dispatch Log Helpers ─────────────────────────────────────────────────────

export interface DispatchLogEntry {
  idempotencyKey: string;
  strategyId: string;
  barTimeMs: number;
  direction: "LONG" | "SHORT";
  entryPrice?: number | null;
  stopPrice?: number | null;
  targetPrice?: number | null;
  status: string;
  httpStatus?: number | null;
  responseBody?: string | null;
  errorMessage?: string | null;
  atlasMemoryBarId?: number | null;
  pipelineRunId?: string | null;
}

/**
 * Log a dispatch attempt to tp_dispatch_log.
 */
export async function logTpDispatch(entry: DispatchLogEntry): Promise<void> {
  const db = await getDb();
  if (!db) {
    console.error("[TP-DB] Cannot log dispatch — DB unavailable");
    return;
  }
  try {
    await db.insert(tpDispatchLog).values({
      idempotencyKey: entry.idempotencyKey,
      strategyId: entry.strategyId,
      barTimeMs: entry.barTimeMs,
      direction: entry.direction,
      entryPrice: entry.entryPrice != null ? String(entry.entryPrice) : null,
      stopPrice: entry.stopPrice != null ? String(entry.stopPrice) : null,
      targetPrice: entry.targetPrice != null ? String(entry.targetPrice) : null,
      status: entry.status,
      httpStatus: entry.httpStatus ?? null,
      responseBody: entry.responseBody ?? null,
      errorMessage: entry.errorMessage ?? null,
      atlasMemoryBarId: entry.atlasMemoryBarId ?? null,
      pipelineRunId: entry.pipelineRunId ?? null,
    });
  } catch (err) {
    // Idempotency key collision — already logged
    if (String(err).includes("Duplicate entry")) {
      console.warn(`[TP-DB] Duplicate dispatch log key: ${entry.idempotencyKey}`);
    } else {
      console.error("[TP-DB] Failed to log dispatch:", err);
    }
  }
}

/**
 * Check if a dispatch with this idempotency key already exists.
 */
export async function getTpDispatchByKey(idempotencyKey: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(tpDispatchLog).where(eq(tpDispatchLog.idempotencyKey, idempotencyKey)).limit(1);
  return rows[0] ?? null;
}

/**
 * Get recent dispatch log entries (newest first).
 */
export async function getRecentTpDispatches(limit = 50) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(tpDispatchLog).orderBy(desc(tpDispatchLog.dispatchedAt)).limit(limit);
}

/**
 * Get dispatch stats per strategy.
 */
export async function getTpDispatchStats() {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(tpDispatchLog).orderBy(desc(tpDispatchLog.dispatchedAt));
  // Aggregate per strategy
  const stats: Record<string, {
    strategyId: string;
    total: number;
    dispatched: number;
    safetyHalted: number;
    preLiveGateBlocked: number;
    disarmed: number;
    frozen: number;
    duplicateSkipped: number;
    errors: number;
    lastDispatchedAt: string | null;
    lastStatus: string | null;
  }> = {};
  for (const row of rows) {
    const sid = row.strategyId;
    if (!stats[sid]) {
      stats[sid] = { strategyId: sid, total: 0, dispatched: 0, safetyHalted: 0, preLiveGateBlocked: 0, disarmed: 0, frozen: 0, duplicateSkipped: 0, errors: 0, lastDispatchedAt: null, lastStatus: null };
    }
    stats[sid].total++;
    if (row.status === "DISPATCHED") stats[sid].dispatched++;
    else if (row.status === "SAFETY_HALTED") stats[sid].safetyHalted++;
    else if (row.status === "PRE_LIVE_GATE_BLOCKED") stats[sid].preLiveGateBlocked++;
    else if (row.status === "DISARMED") stats[sid].disarmed++;
    else if (row.status === "FROZEN") stats[sid].frozen++;
    else if (row.status === "DUPLICATE_SKIPPED") stats[sid].duplicateSkipped++;
    else if (row.status === "ERROR") stats[sid].errors++;
    if (!stats[sid].lastDispatchedAt) {
      stats[sid].lastDispatchedAt = row.dispatchedAt?.toISOString() ?? null;
      stats[sid].lastStatus = row.status;
    }
  }
  return Object.values(stats);
}
