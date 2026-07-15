/**
 * execCertDb.ts — Sprint 112 Parts 8–9
 * Execution Certification Engine (15 stages) and Apex Safety Lockout helpers.
 */

import { getDb } from "./db";
import {
  execCertRuns,
  execStageResults,
  apexSafetyState,
  apexSafetyLog,
  type ExecCertRun,
  type ExecStageResult,
  type ApexSafetyState,
} from "../drizzle/schema.ts";
import { eq, desc, and } from "drizzle-orm";

// ─────────────────────────────────────────────────────────────────────────────
// STAGE DEFINITIONS
// ─────────────────────────────────────────────────────────────────────────────

export interface StageDefinition {
  number: number;
  name: string;
  type: "AUTO" | "MANUAL";
  maxLatencyMs: number;
  description: string;
  successCriteria: string;
}

export const STAGE_DEFINITIONS: StageDefinition[] = [
  { number: 1,  name: "TradingView Alert Generation",  type: "MANUAL", maxLatencyMs: 5000,  description: "Alert fires within 5s of bar close",       successCriteria: "Alert visible in TradingView alert log" },
  { number: 2,  name: "Webhook Delivery",              type: "AUTO",   maxLatencyMs: 3000,  description: "Atlas receives POST within 3s",             successCriteria: "HTTP 201 response from Atlas webhook" },
  { number: 3,  name: "Atlas Signal Validation",       type: "AUTO",   maxLatencyMs: 500,   description: "All 3 S109-001 filters evaluated",          successCriteria: "Signal accepted or rejected with reason" },
  { number: 4,  name: "Risk Engine Approval",          type: "AUTO",   maxLatencyMs: 200,   description: "$450 risk approved, no safety halt",         successCriteria: "Safety state: NOT HALTED, risk approved" },
  { number: 5,  name: "Tradovate API Submission",      type: "MANUAL", maxLatencyMs: 2000,  description: "Order submitted within 2s",                  successCriteria: "Order ID returned by Tradovate" },
  { number: 6,  name: "Apex Account Acceptance",       type: "MANUAL", maxLatencyMs: 5000,  description: "Order accepted by Apex",                     successCriteria: "Order status: ACCEPTED in Tradovate" },
  { number: 7,  name: "Order Acknowledgement",         type: "MANUAL", maxLatencyMs: 3000,  description: "Order ID confirmed",                         successCriteria: "Order ID matches submission" },
  { number: 8,  name: "Fill Confirmation",             type: "MANUAL", maxLatencyMs: 10000, description: "Fill price within 2 ticks of signal",        successCriteria: "Fill price within 2 ticks of signal price" },
  { number: 9,  name: "Position Synchronisation",      type: "AUTO",   maxLatencyMs: 1000,  description: "Atlas position matches Tradovate",           successCriteria: "wf_live_trades open record exists" },
  { number: 10, name: "Stop-Loss Placement",           type: "MANUAL", maxLatencyMs: 5000,  description: "Stop placed at exact signal stop price",     successCriteria: "Stop order visible in Tradovate" },
  { number: 11, name: "Target Placement",              type: "MANUAL", maxLatencyMs: 5000,  description: "Target placed at exact signal target price", successCriteria: "Target order visible in Tradovate" },
  { number: 12, name: "Position Monitoring",           type: "AUTO",   maxLatencyMs: 5000,  description: "Atlas monitoring loop active",               successCriteria: "wf_live_trades.status = OPEN" },
  { number: 13, name: "Exit Execution",                type: "MANUAL", maxLatencyMs: 10000, description: "Exit fills at stop or target",               successCriteria: "Fill confirmed at stop or target price" },
  { number: 14, name: "Trade Logging",                 type: "AUTO",   maxLatencyMs: 500,   description: "Trade recorded in wf_live_trades",           successCriteria: "wf_live_trades row has exit price and outcome" },
  { number: 15, name: "Dashboard Update",              type: "AUTO",   maxLatencyMs: 2000,  description: "Walk-Forward dashboard reflects trade",      successCriteria: "WF stats updated, trade visible in log" },
];

// ─────────────────────────────────────────────────────────────────────────────
// CERTIFICATION RUN MANAGEMENT
// ─────────────────────────────────────────────────────────────────────────────

export async function createCertRun(runType: "DRY_RUN" | "PRE_LIVE_GATE", notes?: string): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [result] = await db.insert(execCertRuns).values({
    runType,
    startedAt: Date.now(),
    overallStatus: "IN_PROGRESS",
    stagesPassed: 0,
    stagesFailed: 0,
    stagesSkipped: 0,
    notes: notes ?? null,
  });
  const runId = (result as unknown as { insertId: number }).insertId;
  const stageRows = STAGE_DEFINITIONS.map(s => ({
    runId,
    stageNumber: s.number,
    stageName: s.name,
    stageType: s.type,
    status: "PENDING" as const,
    retryCount: 0,
  }));
  await db.insert(execStageResults).values(stageRows);
  return runId;
}

export async function recordStageResult(
  runId: number,
  stageNumber: number,
  status: "PASS" | "FAIL" | "SKIP",
  opts: { latencyMs?: number; retryCount?: number; errorMessage?: string; details?: string } = {}
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(execStageResults)
    .set({
      status,
      timestampMs: Date.now(),
      latencyMs: opts.latencyMs ?? null,
      retryCount: opts.retryCount ?? 0,
      errorMessage: opts.errorMessage ?? null,
      details: opts.details ?? null,
    })
    .where(and(eq(execStageResults.runId, runId), eq(execStageResults.stageNumber, stageNumber)));

  const stages = await db.select().from(execStageResults).where(eq(execStageResults.runId, runId));
  const passed = stages.filter((s: ExecStageResult) => s.status === "PASS").length;
  const failed = stages.filter((s: ExecStageResult) => s.status === "FAIL").length;
  const skipped = stages.filter((s: ExecStageResult) => s.status === "SKIP").length;
  const allDone = stages.every((s: ExecStageResult) => s.status !== "PENDING");
  const overallStatus = allDone ? (failed === 0 ? "PASS" : "FAIL") : "IN_PROGRESS";

  await db.update(execCertRuns)
    .set({
      stagesPassed: passed,
      stagesFailed: failed,
      stagesSkipped: skipped,
      overallStatus,
      completedAt: allDone ? Date.now() : null,
    })
    .where(eq(execCertRuns.id, runId));
}

export async function getLatestCertRun(): Promise<{ run: ExecCertRun; stages: ExecStageResult[] } | null> {
  const db = await getDb();
  if (!db) return null;
  const runs = await db.select().from(execCertRuns).orderBy(desc(execCertRuns.startedAt)).limit(1);
  if (runs.length === 0) return null;
  const run = runs[0];
  const stages = await db.select().from(execStageResults)
    .where(eq(execStageResults.runId, run.id))
    .orderBy(execStageResults.stageNumber);
  return { run, stages };
}

export async function getCertRunHistory(limit: number): Promise<ExecCertRun[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(execCertRuns).orderBy(desc(execCertRuns.startedAt)).limit(limit);
}

export async function getCertRunById(runId: number): Promise<{ run: ExecCertRun; stages: ExecStageResult[] } | null> {
  const db = await getDb();
  if (!db) return null;
  const runs = await db.select().from(execCertRuns).where(eq(execCertRuns.id, runId));
  if (runs.length === 0) return null;
  const stages = await db.select().from(execStageResults)
    .where(eq(execStageResults.runId, runId))
    .orderBy(execStageResults.stageNumber);
  return { run: runs[0], stages };
}

export async function abortCertRun(runId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(execCertRuns)
    .set({ overallStatus: "ABORTED", completedAt: Date.now() })
    .where(eq(execCertRuns.id, runId));
}

// ─────────────────────────────────────────────────────────────────────────────
// APEX SAFETY LOCKOUT ENGINE
// ─────────────────────────────────────────────────────────────────────────────

export const SAFETY_CONFIG = {
  dailyLossLockoutAmount: 1350,  // 3× $450
  consecutiveLossLimit: 3,
};

export async function getSafetyState(): Promise<ApexSafetyState | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(apexSafetyState).limit(1);
  return rows[0] ?? null;
}

export async function triggerHalt(
  reason: "DAILY_LOSS_LOCKOUT" | "CONSECUTIVE_LOSS_PROTECTION" | "EXECUTION_ANOMALY" | "WEBHOOK_FAILURE" | "DATA_INTEGRITY_FAILURE" | "DRIFT_SUSPENSION",
  details: string,
  triggeredBy: string
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const now = Date.now();
  await db.update(apexSafetyState)
    .set({ isHalted: true, haltReason: reason, haltDetails: details, haltedAt: now })
    .where(eq(apexSafetyState.id, 1));
  await db.insert(apexSafetyLog).values({ timestampMs: now, eventType: "HALT_TRIGGERED", haltReason: reason, triggeredBy, details });
}

export async function acknowledgeHalt(acknowledgedBy: string, note?: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const now = Date.now();
  await db.update(apexSafetyState)
    .set({ acknowledgedBy, acknowledgedAt: now })
    .where(eq(apexSafetyState.id, 1));
  await db.insert(apexSafetyLog).values({ timestampMs: now, eventType: "HALT_ACKNOWLEDGED", triggeredBy: acknowledgedBy, details: note ?? null });
}

export async function clearHalt(clearedBy: string, note?: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const now = Date.now();
  await db.update(apexSafetyState)
    .set({ isHalted: false, haltReason: null, haltDetails: null, haltedAt: null, acknowledgedBy: null, acknowledgedAt: null, clearedAt: now })
    .where(eq(apexSafetyState.id, 1));
  await db.insert(apexSafetyLog).values({ timestampMs: now, eventType: "HALT_CLEARED", triggeredBy: clearedBy, details: note ?? null });
}

export async function resetDailyCounters(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const now = Date.now();
  await db.update(apexSafetyState)
    .set({ dailyLosses: 0, dailyLossAmount: "0.00", consecutiveLosses: 0 })
    .where(eq(apexSafetyState.id, 1));
  await db.insert(apexSafetyLog).values({ timestampMs: now, eventType: "COUNTER_RESET", triggeredBy: "AM_OPEN_BAR", details: "Daily counters reset at RTH open" });
}

export async function recordLoss(lossAmount: number): Promise<{ halted: boolean; reason?: string }> {
  const db = await getDb();
  if (!db) return { halted: false };
  const state = await getSafetyState();
  if (!state) return { halted: false };

  const newDailyLosses = state.dailyLosses + 1;
  const newDailyLossAmount = parseFloat(state.dailyLossAmount) + lossAmount;
  const newConsecutiveLosses = state.consecutiveLosses + 1;
  const now = Date.now();

  await db.update(apexSafetyState)
    .set({ dailyLosses: newDailyLosses, dailyLossAmount: String(newDailyLossAmount.toFixed(2)), consecutiveLosses: newConsecutiveLosses })
    .where(eq(apexSafetyState.id, 1));

  await db.insert(apexSafetyLog).values({
    timestampMs: now, eventType: "LOSS_RECORDED", triggeredBy: "TRADE_CLOSE",
    details: `Loss: $${lossAmount.toFixed(2)} | Daily: $${newDailyLossAmount.toFixed(2)} | Consecutive: ${newConsecutiveLosses}`,
  });

  if (newDailyLossAmount >= SAFETY_CONFIG.dailyLossLockoutAmount) {
    await triggerHalt("DAILY_LOSS_LOCKOUT", `Daily loss $${newDailyLossAmount.toFixed(2)} reached lockout $${SAFETY_CONFIG.dailyLossLockoutAmount}`, "AUTO_SAFETY_ENGINE");
    return { halted: true, reason: "DAILY_LOSS_LOCKOUT" };
  }
  if (newConsecutiveLosses >= SAFETY_CONFIG.consecutiveLossLimit) {
    await triggerHalt("CONSECUTIVE_LOSS_PROTECTION", `${newConsecutiveLosses} consecutive losses reached limit ${SAFETY_CONFIG.consecutiveLossLimit}`, "AUTO_SAFETY_ENGINE");
    return { halted: true, reason: "CONSECUTIVE_LOSS_PROTECTION" };
  }
  return { halted: false };
}

export async function recordWin(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(apexSafetyState).set({ consecutiveLosses: 0 }).where(eq(apexSafetyState.id, 1));
}

export async function getSafetyLog(limit: number = 50) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(apexSafetyLog).orderBy(desc(apexSafetyLog.timestampMs)).limit(limit);
}
