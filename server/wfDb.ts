/**
 * wfDb.ts — Database helpers for Sprint 111 Walk-Forward Validation.
 *
 * DARWIN-S109-001 (VWAP_ALIGNED_CONTINUATION) — FROZEN hypothesis.
 * No optimisation. No parameter changes. Observation only.
 *
 * Frozen parameters (Sprint 109/110):
 *   Entry: VWAP deviation >0.5×ATR + OV inventory aligned + VWAP slope aligned + RSI confirms
 *   Stop: 2.5×ATR | Target: 2.0×ATR | Time stop: 10 bars | Session: RTH only
 *   Benchmark: WR 75.3%, PF 4.985 (Sprint 110 OOS)
 */
import { getDb } from "./db";
import {
  wfLiveTrades,
  wfSessions,
  wfDriftAlerts,
  wfDailyReports,
  InsertWfLiveTrade,
  InsertWfSession,
  InsertWfDriftAlert,
  InsertWfDailyReport,
  WfLiveTrade,
  WfSession,
  WfDriftAlert,
  WfDailyReport,
} from "../drizzle/schema";
import { desc, eq, sql, and, gte, lte, isNull } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

// ── Benchmark constants (frozen from Sprint 110) ──────────────────────────────
export const S109_BENCHMARK = {
  winRate: 0.753,
  pf: 4.985,
  expectancy: 97.1, // $ per trade at $450 risk
  maxDd: 685,       // $ worst observed in OOS
  // Drift thresholds — alert if live deviates by this much
  winRateWarnDelta: 0.10,    // 10pp below benchmark
  winRateCriticalDelta: 0.15,
  pfWarnDelta: 1.5,          // PF drops 1.5 below benchmark
  pfCriticalDelta: 2.5,
  ddWarnMultiplier: 2.0,     // 2× benchmark max DD
  ddCriticalMultiplier: 3.0,
  // Promotion gate (Sprint 111 brief)
  minTrades: 20,
  minCalendarDays: 30,
  minLiveWinRate: 0.65,
  minLivePf: 2.0,
};

// ── Live Trade helpers ────────────────────────────────────────────────────────

export async function createWfLiveTrade(data: Omit<InsertWfLiveTrade, "id" | "createdAt">): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const id = `wf-${Date.now()}-${uuidv4().slice(0, 8)}`;
  await db.insert(wfLiveTrades).values({ ...data, id });
  return id;
}

export async function getOpenWfTrade(): Promise<WfLiveTrade | null> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const rows = await db
    .select()
    .from(wfLiveTrades)
    .where(eq(wfLiveTrades.status, "OPEN"))
    .orderBy(desc(wfLiveTrades.openedAt))
    .limit(1);
  return rows[0] ?? null;
}

export async function closeWfTrade(
  id: string,
  data: {
    exitPrice: string;
    exitReason: "TARGET_HIT" | "STOP_HIT" | "TIME_STOP" | "MANUAL";
    outcome: "WIN" | "LOSS" | "BREAKEVEN";
    pnlDollar: string;
    pnlR: string;
    mfe: string;
    mae: string;
    holdingBars: number;
    holdingMs: number;
  }
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db
    .update(wfLiveTrades)
    .set({
      ...data,
      status: "CLOSED",
      closedAt: new Date(),
      immutable: true,
    })
    .where(and(eq(wfLiveTrades.id, id), eq(wfLiveTrades.immutable, false)));
}

export async function getRecentWfTrades(limit = 50): Promise<WfLiveTrade[]> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  return db
    .select()
    .from(wfLiveTrades)
    .orderBy(desc(wfLiveTrades.openedAt))
    .limit(limit);
}

export async function getAllClosedWfTrades(): Promise<WfLiveTrade[]> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  return db
    .select()
    .from(wfLiveTrades)
    .where(eq(wfLiveTrades.status, "CLOSED"))
    .orderBy(wfLiveTrades.openedAt);
}

// ── Cumulative statistics ─────────────────────────────────────────────────────

export interface WfStats {
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  grossWin: number;
  grossLoss: number;
  pf: number;
  totalPnl: number;
  maxDd: number;
  calmar: number;
  avgWin: number;
  avgLoss: number;
  avgR: number;
  avgMfe: number;
  avgMae: number;
  avgHoldingBars: number;
  startDate: string | null;
  calendarDaysElapsed: number;
  promotionGateStatus: "PENDING" | "IN_PROGRESS" | "PASSED" | "FAILED" | "SUSPENDED";
  promotionChecks: {
    minTrades: boolean;
    minDays: boolean;
    minWinRate: boolean;
    minPf: boolean;
    noDrift: boolean;
    pipelineIntegrity: boolean;
  };
}

export async function computeWfStats(): Promise<WfStats> {
  const trades = await getAllClosedWfTrades();
  const n = trades.length;

  if (n === 0) {
    return {
      totalTrades: 0, wins: 0, losses: 0, winRate: 0,
      grossWin: 0, grossLoss: 0, pf: 0, totalPnl: 0,
      maxDd: 0, calmar: 0, avgWin: 0, avgLoss: 0, avgR: 0,
      avgMfe: 0, avgMae: 0, avgHoldingBars: 0,
      startDate: null, calendarDaysElapsed: 0,
      promotionGateStatus: "PENDING",
      promotionChecks: {
        minTrades: false, minDays: false, minWinRate: false,
        minPf: false, noDrift: false, pipelineIntegrity: true,
      },
    };
  }

  const wins = trades.filter(t => t.outcome === "WIN");
  const losses = trades.filter(t => t.outcome === "LOSS");
  const grossWin = wins.reduce((s, t) => s + Number(t.pnlDollar ?? 0), 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + Number(t.pnlDollar ?? 0), 0));
  const pf = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? 999 : 0;
  const totalPnl = trades.reduce((s, t) => s + Number(t.pnlDollar ?? 0), 0);
  const winRate = n > 0 ? wins.length / n : 0;

  // Max drawdown
  let equity = 0, peak = 0, maxDd = 0;
  for (const t of trades) {
    equity += Number(t.pnlDollar ?? 0);
    if (equity > peak) peak = equity;
    if (peak - equity > maxDd) maxDd = peak - equity;
  }
  const calmar = maxDd > 0 ? totalPnl / maxDd : totalPnl > 0 ? 999 : 0;

  const avgWin = wins.length > 0 ? grossWin / wins.length : 0;
  const avgLoss = losses.length > 0 ? grossLoss / losses.length : 0;
  const avgR = n > 0 ? trades.reduce((s, t) => s + Number(t.pnlR ?? 0), 0) / n : 0;
  const avgMfe = n > 0 ? trades.reduce((s, t) => s + Number(t.mfe ?? 0), 0) / n : 0;
  const avgMae = n > 0 ? trades.reduce((s, t) => s + Number(t.mae ?? 0), 0) / n : 0;
  const avgHoldingBars = n > 0 ? trades.reduce((s, t) => s + (t.holdingBars ?? 0), 0) / n : 0;

  // Calendar days
  const startDate = trades[0]?.tradeDate?.toString() ?? null;
  const wfStartMs = startDate ? new Date(startDate).getTime() : Date.now();
  const calendarDaysElapsed = Math.floor((Date.now() - wfStartMs) / (1000 * 60 * 60 * 24));

  // Check for active drift alerts
  const db = await getDb();
  const activeDrifts = db ? await db
    .select({ id: wfDriftAlerts.id })
    .from(wfDriftAlerts)
    .where(and(eq(wfDriftAlerts.resolved, false), eq(wfDriftAlerts.severity, "CRITICAL")))
    .limit(1) : [];

  const promotionChecks = {
    minTrades: n >= S109_BENCHMARK.minTrades,
    minDays: calendarDaysElapsed >= S109_BENCHMARK.minCalendarDays,
    minWinRate: winRate >= S109_BENCHMARK.minLiveWinRate,
    minPf: pf >= S109_BENCHMARK.minLivePf,
    noDrift: activeDrifts.length === 0,
    pipelineIntegrity: true, // set by pipeline health check
  };

  let promotionGateStatus: WfStats["promotionGateStatus"] = "PENDING";
  if (activeDrifts.length > 0) {
    promotionGateStatus = "SUSPENDED";
  } else if (n >= 5) {
    if (Object.values(promotionChecks).every(Boolean)) {
      promotionGateStatus = "PASSED";
    } else {
      promotionGateStatus = "IN_PROGRESS";
    }
  }

  return {
    totalTrades: n, wins: wins.length, losses: losses.length, winRate,
    grossWin, grossLoss, pf, totalPnl, maxDd, calmar,
    avgWin, avgLoss, avgR, avgMfe, avgMae, avgHoldingBars,
    startDate, calendarDaysElapsed, promotionGateStatus, promotionChecks,
  };
}

// ── Drift detection ───────────────────────────────────────────────────────────

export async function checkAndFireDriftAlerts(stats: WfStats, sessionDate: string): Promise<WfDriftAlert[]> {
  // sessionDate is a YYYY-MM-DD string — Drizzle date columns accept strings
  const sd = sessionDate as unknown as Date; // Drizzle MySQL date columns use Date type in TS but accept strings at runtime
  const db = await getDb();
  if (!db || stats.totalTrades < 5) return []; // Need minimum trades for meaningful comparison

  const alerts: InsertWfDriftAlert[] = [];

  // Win rate drift
  const wrDelta = S109_BENCHMARK.winRate - stats.winRate;
  if (wrDelta >= S109_BENCHMARK.winRateCriticalDelta) {
    alerts.push({
      alertType: "WIN_RATE_DEVIATION",
      severity: "CRITICAL",
      benchmarkValue: String(S109_BENCHMARK.winRate),
      liveValue: String(stats.winRate.toFixed(4)),
      deviationPct: String((-wrDelta * 100).toFixed(2)),
      tradeCount: stats.totalTrades,
      sessionDate: sd,
      description: `Live WR ${(stats.winRate * 100).toFixed(1)}% is ${(wrDelta * 100).toFixed(1)}pp below benchmark ${(S109_BENCHMARK.winRate * 100).toFixed(1)}%. CRITICAL threshold exceeded.`,
    });
  } else if (wrDelta >= S109_BENCHMARK.winRateWarnDelta) {
    alerts.push({
      alertType: "WIN_RATE_DEVIATION",
      severity: "WARN",
      benchmarkValue: String(S109_BENCHMARK.winRate),
      liveValue: String(stats.winRate.toFixed(4)),
      deviationPct: String((-wrDelta * 100).toFixed(2)),
      tradeCount: stats.totalTrades,
      sessionDate: sd,
      description: `Live WR ${(stats.winRate * 100).toFixed(1)}% is ${(wrDelta * 100).toFixed(1)}pp below benchmark. WARN threshold exceeded.`,
    });
  }

  // PF drift
  const pfDelta = S109_BENCHMARK.pf - stats.pf;
  if (pfDelta >= S109_BENCHMARK.pfCriticalDelta) {
    alerts.push({
      alertType: "PF_DETERIORATION",
      severity: "CRITICAL",
      benchmarkValue: String(S109_BENCHMARK.pf),
      liveValue: String(stats.pf.toFixed(4)),
      deviationPct: String((-(pfDelta / S109_BENCHMARK.pf) * 100).toFixed(2)),
      tradeCount: stats.totalTrades,
      sessionDate: sd,
      description: `Live PF ${stats.pf.toFixed(3)} is ${pfDelta.toFixed(3)} below benchmark ${S109_BENCHMARK.pf}. CRITICAL threshold exceeded.`,
    });
  } else if (pfDelta >= S109_BENCHMARK.pfWarnDelta) {
    alerts.push({
      alertType: "PF_DETERIORATION",
      severity: "WARN",
      benchmarkValue: String(S109_BENCHMARK.pf),
      liveValue: String(stats.pf.toFixed(4)),
      deviationPct: String((-(pfDelta / S109_BENCHMARK.pf) * 100).toFixed(2)),
      tradeCount: stats.totalTrades,
      sessionDate: sd,
      description: `Live PF ${stats.pf.toFixed(3)} is ${pfDelta.toFixed(3)} below benchmark. WARN threshold exceeded.`,
    });
  }

  // Drawdown drift
  if (stats.maxDd > S109_BENCHMARK.maxDd * S109_BENCHMARK.ddCriticalMultiplier) {
    alerts.push({
      alertType: "DRAWDOWN_EXCEEDED",
      severity: "CRITICAL",
      benchmarkValue: String(S109_BENCHMARK.maxDd),
      liveValue: String(stats.maxDd.toFixed(2)),
      deviationPct: String(((stats.maxDd / S109_BENCHMARK.maxDd - 1) * 100).toFixed(2)),
      tradeCount: stats.totalTrades,
      sessionDate: sd,
      description: `Live max DD $${stats.maxDd.toFixed(0)} exceeds ${S109_BENCHMARK.ddCriticalMultiplier}× benchmark ($${S109_BENCHMARK.maxDd}). CRITICAL.`,
    });
  } else if (stats.maxDd > S109_BENCHMARK.maxDd * S109_BENCHMARK.ddWarnMultiplier) {
    alerts.push({
      alertType: "DRAWDOWN_EXCEEDED",
      severity: "WARN",
      benchmarkValue: String(S109_BENCHMARK.maxDd),
      liveValue: String(stats.maxDd.toFixed(2)),
      deviationPct: String(((stats.maxDd / S109_BENCHMARK.maxDd - 1) * 100).toFixed(2)),
      tradeCount: stats.totalTrades,
      sessionDate: sd,
      description: `Live max DD $${stats.maxDd.toFixed(0)} exceeds ${S109_BENCHMARK.ddWarnMultiplier}× benchmark. WARN.`,
    });
  }

  if (alerts.length === 0) return [];

    const inserted: WfDriftAlert[] = [];
  for (const alert of alerts) {
    const result = await db.insert(wfDriftAlerts).values(alert);
    const id = Number(result[0].insertId);
    const rows = await db.select().from(wfDriftAlerts).where(eq(wfDriftAlerts.id, id)).limit(1);
    if (rows[0]) inserted.push(rows[0]);
  }
  return inserted;
}

// ── Session helpers ───────────────────────────────────────────────────────────

export async function upsertWfSession(data: Omit<InsertWfSession, "id">): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const existing = await db
    .select({ id: wfSessions.id })
    .from(wfSessions)
    .where(eq(wfSessions.sessionDate, data.sessionDate))
    .limit(1);
  if (existing.length > 0) {
    await db.update(wfSessions).set(data).where(eq(wfSessions.sessionDate, data.sessionDate));
  } else {
    await db.insert(wfSessions).values(data);
  }
}

export async function getRecentWfSessions(limit = 30): Promise<WfSession[]> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  return db
    .select()
    .from(wfSessions)
    .orderBy(desc(wfSessions.sessionDate))
    .limit(limit);
}

export async function getWfSessionCount(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const result = await db.select({ count: sql<number>`count(*)` }).from(wfSessions);
  return Number(result[0]?.count ?? 0);
}

// ── Drift alert helpers ───────────────────────────────────────────────────────

export async function getActiveDriftAlerts(): Promise<WfDriftAlert[]> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  return db
    .select()
    .from(wfDriftAlerts)
    .where(eq(wfDriftAlerts.resolved, false))
    .orderBy(desc(wfDriftAlerts.createdAt));
}

export async function getRecentDriftAlerts(limit = 20): Promise<WfDriftAlert[]> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  return db
    .select()
    .from(wfDriftAlerts)
    .orderBy(desc(wfDriftAlerts.createdAt))
    .limit(limit);
}

// ── Daily report helpers ──────────────────────────────────────────────────────

export async function upsertWfDailyReport(data: Omit<InsertWfDailyReport, "id">): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const existing = await db
    .select({ id: wfDailyReports.id })
    .from(wfDailyReports)
    .where(eq(wfDailyReports.reportDate, data.reportDate))
    .limit(1);
  if (existing.length > 0) {
    await db.update(wfDailyReports).set(data).where(eq(wfDailyReports.reportDate, data.reportDate));
  } else {
    await db.insert(wfDailyReports).values(data);
  }
}

export async function getRecentWfDailyReports(limit = 30): Promise<WfDailyReport[]> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  return db
    .select()
    .from(wfDailyReports)
    .orderBy(desc(wfDailyReports.reportDate))
    .limit(limit);
}

export async function getLatestWfDailyReport(): Promise<WfDailyReport | null> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const rows = await db
    .select()
    .from(wfDailyReports)
    .orderBy(desc(wfDailyReports.reportDate))
    .limit(1);
  return rows[0] ?? null;
}

// ── Signal evaluation (frozen S109-001 logic) ─────────────────────────────────

export interface BarData {
  barTimeEt: string;
  tradeDate: string;
  session: string;
  regime: string;
  close: number;
  vwap: number;
  atr14: number;
  vwapSlope3Bar: number;
  rsi14: number;
  ovInventory: "LONG" | "SHORT" | "NEUTRAL";
  pipelineRunId?: string;
  atlasMemoryBarId?: number;
}

export interface SignalEvaluation {
  hasSignal: boolean;
  direction: "LONG" | "SHORT" | null;
  filterOvInventory: boolean;
  filterVwapSlope: boolean;
  filterRsi: boolean;
  vwapDeviation: number;
  entryPrice: number | null;
  stopPrice: number | null;
  targetPrice: number | null;
  reason: string;
}

/**
 * evaluateS109001Signal — apply frozen DARWIN-S109-001 filters to a bar.
 * NO OPTIMISATION. Parameters are immutable.
 */
export function evaluateS109001Signal(bar: BarData): SignalEvaluation {
  const { close, vwap, atr14, vwapSlope3Bar, rsi14, ovInventory, session } = bar;

  // Session gate: RTH only
  if (session !== "RTH") {
    return { hasSignal: false, direction: null, filterOvInventory: false, filterVwapSlope: false, filterRsi: false, vwapDeviation: 0, entryPrice: null, stopPrice: null, targetPrice: null, reason: "NOT_RTH" };
  }

  // Base signal: VWAP deviation > 0.5×ATR
  const vwapDeviation = close - vwap;
  const absDeviation = Math.abs(vwapDeviation);
  if (absDeviation < 0.5 * atr14) {
    return { hasSignal: false, direction: null, filterOvInventory: false, filterVwapSlope: false, filterRsi: false, vwapDeviation, entryPrice: null, stopPrice: null, targetPrice: null, reason: "DEVIATION_BELOW_THRESHOLD" };
  }

  // Determine signal direction from deviation
  const direction: "LONG" | "SHORT" = vwapDeviation > 0 ? "LONG" : "SHORT";

  // Filter 1: Overnight inventory alignment
  const filterOvInventory =
    (direction === "LONG" && ovInventory === "LONG") ||
    (direction === "SHORT" && ovInventory === "SHORT");

  // Filter 2: VWAP slope alignment
  const filterVwapSlope =
    (direction === "LONG" && vwapSlope3Bar > 0) ||
    (direction === "SHORT" && vwapSlope3Bar < 0);

  // Filter 3: RSI confirmation
  const filterRsi =
    (direction === "LONG" && rsi14 > 50) ||
    (direction === "SHORT" && rsi14 < 50);

  // All three filters must pass
  if (!filterOvInventory || !filterVwapSlope || !filterRsi) {
    const failedFilters = [
      !filterOvInventory ? "OV_INVENTORY" : null,
      !filterVwapSlope ? "VWAP_SLOPE" : null,
      !filterRsi ? "RSI" : null,
    ].filter(Boolean).join(",");
    return { hasSignal: false, direction, filterOvInventory, filterVwapSlope, filterRsi, vwapDeviation, entryPrice: null, stopPrice: null, targetPrice: null, reason: `FILTER_FAILED:${failedFilters}` };
  }

  // Compute entry, stop, target (frozen parameters)
  const entryPrice = close; // next bar open — approximated as current close for paper trading
  const stopDistance = 2.5 * atr14;
  const targetDistance = 2.0 * atr14;
  const stopPrice = direction === "LONG" ? entryPrice - stopDistance : entryPrice + stopDistance;
  const targetPrice = direction === "LONG" ? entryPrice + targetDistance : entryPrice - targetDistance;

  return {
    hasSignal: true,
    direction,
    filterOvInventory: true,
    filterVwapSlope: true,
    filterRsi: true,
    vwapDeviation,
    entryPrice,
    stopPrice,
    targetPrice,
    reason: "SIGNAL_FIRED",
  };
}

/**
 * evaluateOpenTradeExit — check if an open WF trade should be closed on this bar.
 * Applies stop, target, and time-stop rules (frozen).
 */
export function evaluateOpenTradeExit(
  trade: WfLiveTrade,
  bar: BarData,
  barsSinceEntry: number
): { shouldClose: boolean; exitReason: string; exitPrice: number; outcome: "WIN" | "LOSS" | "BREAKEVEN" } | null {
  if (trade.status !== "OPEN") return null;

  const high = bar.close; // We only have close from atlas_memory; use close as proxy
  const low = bar.close;
  const close = bar.close;
  const entry = Number(trade.entryPrice ?? 0);
  const stop = Number(trade.stopPrice ?? 0);
  const target = Number(trade.targetPrice ?? 0);
  const direction = trade.direction;

  // Time stop: 10 bars maximum
  if (barsSinceEntry >= 10) {
    const pnlPoints = direction === "LONG" ? close - entry : entry - close;
    const outcome: "WIN" | "LOSS" | "BREAKEVEN" = pnlPoints > 0 ? "WIN" : pnlPoints < 0 ? "LOSS" : "BREAKEVEN";
    return { shouldClose: true, exitReason: "TIME_STOP", exitPrice: close, outcome };
  }

  // Target hit
  if (direction === "LONG" && close >= target) {
    return { shouldClose: true, exitReason: "TARGET_HIT", exitPrice: target, outcome: "WIN" };
  }
  if (direction === "SHORT" && close <= target) {
    return { shouldClose: true, exitReason: "TARGET_HIT", exitPrice: target, outcome: "WIN" };
  }

  // Stop hit
  if (direction === "LONG" && close <= stop) {
    return { shouldClose: true, exitReason: "STOP_HIT", exitPrice: stop, outcome: "LOSS" };
  }
  if (direction === "SHORT" && close >= stop) {
    return { shouldClose: true, exitReason: "STOP_HIT", exitPrice: stop, outcome: "LOSS" };
  }

  return null;
}
