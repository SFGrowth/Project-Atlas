/**
 * apexDb.ts — Sprint 112 Apex Evaluation database helpers
 * DARWIN-S109-001 | Apex 50K Evaluation | Manual execution tracking
 */

import { getDb } from "./db";
import { apexTrades, apexAccountSnapshots } from "../drizzle/schema";
import type { ApexTrade } from "../drizzle/schema";
import { desc, eq } from "drizzle-orm";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CreateApexTradeInput {
  wfTradeId?: number;
  tradeDate: string;                  // YYYY-MM-DD
  direction: "LONG" | "SHORT";
  instrument?: string;
  contracts?: number;
  atlasSignalBarTime?: number;
  atlasEntryPrice?: number;
  atlasStopPrice?: number;
  atlasTargetPrice?: number;
  atlasAtr14?: number;
  apexEntryPrice: number;
  apexEntryTime?: number;
  apexStopPrice: number;
  apexTargetPrice: number;
}

export interface CloseApexTradeInput {
  id: number;
  apexExitPrice: number;
  apexExitTime?: number;
  apexExitReason: "TARGET" | "STOP" | "TIME_STOP" | "MANUAL";
  apexPnl: number;
  apexHoldingBars?: number;
  divergenceNotes?: string;
}

export interface CreateSnapshotInput {
  snapshotDate: string;               // YYYY-MM-DD
  currentBalance: number;
  currentEquity: number;
  unrealisedPnl?: number;
  dailyPnl: number;
  peakBalance: number;
  trailingThreshold: number;
  remainingTrailingDd: number;
  currentDrawdown: number;
  totalProfit: number;
  passProgress: number;
  tradesToday?: number;
  totalTrades?: number;
  evaluationStatus?: "ACTIVE" | "PASSED" | "FAILED" | "SUSPENDED";
  notes?: string;
}

// ── Trade Helpers ─────────────────────────────────────────────────────────────

export async function createApexTrade(input: CreateApexTradeInput) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [result] = await db.insert(apexTrades).values({
    wfTradeId: input.wfTradeId ?? null,
    tradeDate: input.tradeDate as unknown as Date,
    direction: input.direction,
    instrument: input.instrument ?? "MNQ",
    contracts: input.contracts ?? 1,
    atlasSignalBarTime: input.atlasSignalBarTime ?? null,
    atlasEntryPrice: input.atlasEntryPrice?.toString() ?? null,
    atlasStopPrice: input.atlasStopPrice?.toString() ?? null,
    atlasTargetPrice: input.atlasTargetPrice?.toString() ?? null,
    atlasAtr14: input.atlasAtr14?.toString() ?? null,
    apexEntryPrice: input.apexEntryPrice.toString(),
    apexEntryTime: input.apexEntryTime ?? null,
    apexStopPrice: input.apexStopPrice.toString(),
    apexTargetPrice: input.apexTargetPrice.toString(),
    status: "OPEN",
  });
  return result;
}

export async function closeApexTrade(input: CloseApexTradeInput) {
  // Fetch the trade to compute comparison metrics
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [trade] = await db
    .select()
    .from(apexTrades)
    .where(eq(apexTrades.id, input.id))
    .limit(1);

  if (!trade) throw new Error(`Apex trade ${input.id} not found`);

  // Compute slippage and comparison metrics
  const entrySlippage = trade.atlasEntryPrice
    ? Math.abs(input.apexExitPrice - parseFloat(trade.atlasEntryPrice.toString()))
    : null;

  const exitSlippage = trade.atlasEntryPrice && trade.atlasStopPrice && trade.atlasTargetPrice
    ? (() => {
        const atlasExit = input.apexExitReason === "TARGET"
          ? parseFloat(trade.atlasTargetPrice!.toString())
          : input.apexExitReason === "STOP"
          ? parseFloat(trade.atlasStopPrice!.toString())
          : null;
        return atlasExit ? Math.abs(input.apexExitPrice - atlasExit) : null;
      })()
    : null;

  // Compute atlas theoretical P&L
  const atlasTheoreticalPnl = trade.atlasEntryPrice && trade.atlasStopPrice && trade.atlasTargetPrice
    ? (() => {
        const entry = parseFloat(trade.atlasEntryPrice!.toString());
        const target = parseFloat(trade.atlasTargetPrice!.toString());
        const stop = parseFloat(trade.atlasStopPrice!.toString());
        const contracts = trade.contracts ?? 1;
        const pointValue = 2.0; // MNQ $2/point
        if (input.apexExitReason === "TARGET") {
          return Math.abs(target - entry) * contracts * pointValue;
        } else if (input.apexExitReason === "STOP") {
          return -Math.abs(entry - stop) * contracts * pointValue;
        }
        return null;
      })()
    : null;

  const pnlDifference = atlasTheoreticalPnl !== null
    ? input.apexPnl - atlasTheoreticalPnl
    : null;

  // Determine outcome match
  const isWin = input.apexPnl > 0;
  const atlasIsWin = atlasTheoreticalPnl !== null ? atlasTheoreticalPnl > 0 : null;
  const outcomeMatch = atlasIsWin !== null ? isWin === atlasIsWin : null;

  // Classify divergence
  let divergenceFlag: "NONE" | "EXPECTED_SLIPPAGE" | "ELEVATED_SLIPPAGE" | "EXECUTION_ERROR" | "OUTCOME_DIVERGENCE" | "MISSING_TRADE" | "EXTRA_TRADE" = "NONE";
  if (outcomeMatch === false) {
    divergenceFlag = "OUTCOME_DIVERGENCE";
  } else if (exitSlippage !== null && exitSlippage > 1.25) {
    divergenceFlag = "ELEVATED_SLIPPAGE";
  } else if (exitSlippage !== null && exitSlippage > 0) {
    divergenceFlag = "EXPECTED_SLIPPAGE";
  }

  const db2 = await getDb();
  if (!db2) throw new Error("DB unavailable");
  await db2
    .update(apexTrades)
    .set({
      apexExitPrice: input.apexExitPrice.toString(),
      apexExitTime: input.apexExitTime ?? null,
      apexExitReason: input.apexExitReason,
      apexPnl: input.apexPnl.toString(),
      apexHoldingBars: input.apexHoldingBars ?? null,
      entrySlippagePts: entrySlippage?.toString() ?? null,
      exitSlippagePts: exitSlippage?.toString() ?? null,
      pnlDifference: pnlDifference?.toString() ?? null,
      outcomeMatch: outcomeMatch ?? null,
      divergenceFlag,
      divergenceNotes: input.divergenceNotes ?? null,
      status: "CLOSED",
      isWin,
    })
    .where(eq(apexTrades.id, input.id));

  return { divergenceFlag, isWin, pnlDifference };
}

export async function getApexTrades(limit = 50) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  return db
    .select()
    .from(apexTrades)
    .orderBy(desc(apexTrades.createdAt))
    .limit(limit);
}

export async function getOpenApexTrade() {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [trade] = await db
    .select()
    .from(apexTrades)
    .where(eq(apexTrades.status, "OPEN"))
    .limit(1);
  return trade ?? null;
}

export async function getApexStats() {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const trades: ApexTrade[] = await db
    .select()
    .from(apexTrades)
    .where(eq(apexTrades.status, "CLOSED"));

  if (trades.length === 0) {
    return {
      totalTrades: 0,
      wins: 0,
      losses: 0,
      winRate: 0,
      totalPnl: 0,
      grossWins: 0,
      grossLosses: 0,
      profitFactor: 0,
      avgWin: 0,
      avgLoss: 0,
      avgSlippage: 0,
      outcomeMatchRate: 0,
      divergenceCount: 0,
    };
  }

  const wins = trades.filter((t: ApexTrade) => t.isWin === true);
  const losses = trades.filter((t: ApexTrade) => t.isWin === false);
  const totalPnl = trades.reduce((s: number, t: ApexTrade) => s + parseFloat(t.apexPnl?.toString() ?? "0"), 0);
  const grossWins = wins.reduce((s: number, t: ApexTrade) => s + parseFloat(t.apexPnl?.toString() ?? "0"), 0);
  const grossLosses = Math.abs(losses.reduce((s: number, t: ApexTrade) => s + parseFloat(t.apexPnl?.toString() ?? "0"), 0));
  const slippages = trades
    .filter((t: ApexTrade) => t.exitSlippagePts !== null)
    .map((t: ApexTrade) => parseFloat(t.exitSlippagePts!.toString()));
  const matched = trades.filter((t: ApexTrade) => t.outcomeMatch !== null);
  const matchCount = matched.filter((t: ApexTrade) => t.outcomeMatch === true).length;
  const divergenceCount = trades.filter((t: ApexTrade) => t.divergenceFlag !== "NONE" && t.divergenceFlag !== "EXPECTED_SLIPPAGE").length;

  return {
    totalTrades: trades.length,
    wins: wins.length,
    losses: losses.length,
    winRate: trades.length > 0 ? (wins.length / trades.length) * 100 : 0,
    totalPnl,
    grossWins,
    grossLosses,
    profitFactor: grossLosses > 0 ? grossWins / grossLosses : grossWins > 0 ? 999 : 0,
    avgWin: wins.length > 0 ? grossWins / wins.length : 0,
    avgLoss: losses.length > 0 ? grossLosses / losses.length : 0,
    avgSlippage: slippages.length > 0 ? slippages.reduce((a: number, b: number) => a + b, 0) / slippages.length : 0,
    outcomeMatchRate: matched.length > 0 ? (matchCount / matched.length) * 100 : 100,
    divergenceCount,
  };
}

// ── Snapshot Helpers ──────────────────────────────────────────────────────────

export async function upsertApexSnapshot(input: CreateSnapshotInput) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const existing = await db
    .select({ id: apexAccountSnapshots.id })
    .from(apexAccountSnapshots)
    .where(eq(apexAccountSnapshots.snapshotDate, input.snapshotDate as unknown as Date))
    .limit(1);

  const values = {
    snapshotDate: input.snapshotDate as unknown as Date,
    currentBalance: input.currentBalance.toString(),
    currentEquity: input.currentEquity.toString(),
    unrealisedPnl: (input.unrealisedPnl ?? 0).toString(),
    dailyPnl: input.dailyPnl.toString(),
    peakBalance: input.peakBalance.toString(),
    trailingThreshold: input.trailingThreshold.toString(),
    remainingTrailingDd: input.remainingTrailingDd.toString(),
    currentDrawdown: input.currentDrawdown.toString(),
    totalProfit: input.totalProfit.toString(),
    passProgress: input.passProgress.toString(),
    tradesToday: input.tradesToday ?? 0,
    totalTrades: input.totalTrades ?? 0,
    evaluationStatus: input.evaluationStatus ?? "ACTIVE",
    notes: input.notes ?? null,
  };

  if (existing.length > 0) {
    const db2 = await getDb();
  if (!db2) throw new Error("DB unavailable");
    await db2
      .update(apexAccountSnapshots)
      .set(values)
      .where(eq(apexAccountSnapshots.id, existing[0].id));
  } else {
    const db3 = await getDb();
  if (!db3) throw new Error("DB unavailable");
    await db3.insert(apexAccountSnapshots).values(values);
  }
}

export async function getLatestApexSnapshot() {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [snap] = await db
    .select()
    .from(apexAccountSnapshots)
    .orderBy(desc(apexAccountSnapshots.snapshotDate))
    .limit(1);
  return snap ?? null;
}

export async function getApexSnapshotHistory(days = 30) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  return db
    .select()
    .from(apexAccountSnapshots)
    .orderBy(desc(apexAccountSnapshots.snapshotDate))
    .limit(days);
}
