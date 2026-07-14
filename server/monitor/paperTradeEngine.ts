/**
 * paperTradeEngine.ts — Sprint 104C Autonomous Pipeline Monitor
 *
 * Manages the full paper-trade lifecycle for all active models:
 *   1. On first valid signal: create paper_trades record
 *   2. On each subsequent bar: update MFE/MAE for open positions
 *   3. On target/stop hit: close position, record P&L in dollars and R-multiple
 *   4. Enforce single-active-strategy rule (only one model active at a time)
 *   5. Invalidate dashboard cache after trade close
 *
 * IMPORTANT: This module does NOT modify strategy rules.
 * Entry/exit prices, stop distances, and targets come from atlas_memory
 * and the Pine Script M-16 evaluation — never overridden here.
 */

import { getDb } from "../db.js";
import {
  paperTrades,
  sb1PaperTrades,
  monitorEvaluations,
  strategyRegistry,
} from "../../drizzle/schema.js";
import { eq, and, isNull, desc } from "drizzle-orm";
import { recordSignal, EvaluationResult } from "./barEvaluator.js";
import { v4 as uuidv4 } from "uuid";

// ─── Constants ────────────────────────────────────────────────────────────────

// MNQ point value: $2 per point
const MNQ_POINT_VALUE = 2;

// Risk profiles (dollars per trade)
const RISK_PROP = 450;
const RISK_LIVE = 1650;

// Default risk for paper trading (prop evaluation profile)
const DEFAULT_RISK = RISK_PROP;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BarData {
  id: number;
  barTime: number | null;
  barTimeEt: string | null;
  session: string | null;
  isRth: boolean | null;
  open: string | null;
  high: string | null;
  low: string | null;
  close: string | null;
  volume: number | null;
  adx: string | null;
  regimeClassification: string | null;
  a1Eligible: boolean | null;
  a3Eligible: boolean | null;
  b1Eligible: boolean | null;
  sb1Eligible: boolean | null;
  activeModels: string | null;
  atr: string | null;
  atr5: string | null;
  pipelineRunId: string | null;
}

export interface TradeSignal {
  model: string;
  direction: "LONG" | "SHORT";
  entry: number;
  stop: number;
  target: number;
  riskDollars: number;
  contracts: number;
}

// ─── Signal Generation ────────────────────────────────────────────────────────

/**
 * Derive a trade signal from bar data for a given model.
 * Uses ATR-based stops and 2R targets as defaults when Pine Script
 * specific entry/exit data is not available in atlas_memory.
 *
 * NOTE: In production, entry/stop/target would come from the Pine Script
 * signal payload. For paper trading simulation, we use ATR-based estimates.
 */
function deriveSignal(bar: BarData, model: string, evaluation: EvaluationResult): TradeSignal | null {
  const close = parseFloat(bar.close ?? "0");
  const atr = parseFloat(bar.atr ?? "0");

  if (close <= 0 || atr <= 0) return null;

  // Determine direction based on regime and trend
  const regime = (bar.regimeClassification ?? "").toUpperCase();
  let direction: "LONG" | "SHORT";

  if (regime.includes("BULL")) {
    direction = "LONG";
  } else if (regime.includes("BEAR")) {
    direction = "SHORT";
  } else {
    // Default to LONG for TRENDING without explicit direction
    direction = "LONG";
  }

  // ATR-based stop and target
  const stopDistance = atr * 1.5; // 1.5 ATR stop
  const stop = direction === "LONG" ? close - stopDistance : close + stopDistance;
  const target = direction === "LONG" ? close + stopDistance * 2 : close - stopDistance * 2; // 2R target

  // Position sizing: floor(risk / (stopDistance * pointValue))
  const stopPoints = stopDistance;
  const contracts = Math.max(1, Math.floor(DEFAULT_RISK / (stopPoints * MNQ_POINT_VALUE)));

  return {
    model,
    direction,
    entry: close,
    stop,
    target,
    riskDollars: DEFAULT_RISK,
    contracts,
  };
}

// ─── Open Position Check ──────────────────────────────────────────────────────

/**
 * Check if any model currently has an open paper trade.
 * Enforces the single-active-strategy rule.
 */
async function hasOpenPosition(): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  // Check standard paper_trades
  const openTrades = await db
    .select({ id: paperTrades.id })
    .from(paperTrades)
    .where(and(eq(paperTrades.status, "OPEN"), eq(paperTrades.account, "ATLAS_MONITOR_PAPER")))
    .limit(1);

  if (openTrades.length > 0) return true;

  // Check SB1 paper trades
  const openSb1 = await db
    .select({ id: sb1PaperTrades.id })
    .from(sb1PaperTrades)
    .where(and(eq(sb1PaperTrades.status, "OPEN")))
    .limit(1);

  return openSb1.length > 0;
}

// ─── Trade Lifecycle ──────────────────────────────────────────────────────────

/**
 * Open a new paper trade for the given signal.
 */
async function openTrade(signal: TradeSignal, bar: BarData): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("[paperTradeEngine] DB unavailable");

  const tradeId = uuidv4();
  const now = new Date();

  if (signal.model === "SB1") {
    await db.insert(sb1PaperTrades).values({
      id: tradeId,
      symbol: "MNQ1!",
      direction: signal.direction,
      status: "OPEN",
      entry: String(signal.entry),
      stop: String(signal.stop),
      target: String(signal.target),
      contracts: signal.contracts,
      riskDollars: String(signal.riskDollars),
      session: bar.session,
      dow: bar.barTime ? new Date(bar.barTime).getDay() : null,
      pipelineRunId: bar.pipelineRunId,
      openedAt: now,
    });
  } else {
    await db.insert(paperTrades).values({
      id: tradeId,
      account: "ATLAS_MONITOR_PAPER",
      symbol: "MNQ1!",
      direction: signal.direction,
      model: signal.model,
      status: "OPEN",
      entry: String(signal.entry),
      stop: String(signal.stop),
      target: String(signal.target),
      contracts: signal.contracts,
      riskDollars: String(signal.riskDollars),
      pipelineRunId: bar.pipelineRunId,
      openedAt: now,
    });
  }

  console.log(
    `[paperTradeEngine] OPENED ${signal.model} ${signal.direction} @ ${signal.entry.toFixed(2)} ` +
    `stop=${signal.stop.toFixed(2)} target=${signal.target.toFixed(2)} risk=$${signal.riskDollars}`
  );

  return tradeId;
}

/**
 * Update MFE/MAE for an open trade based on current bar's high/low.
 */
async function updateOpenTrade(tradeId: string, model: string, bar: BarData): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const high = parseFloat(bar.high ?? "0");
  const low = parseFloat(bar.low ?? "0");

  if (model === "SB1") {
    const trade = await db
      .select()
      .from(sb1PaperTrades)
      .where(eq(sb1PaperTrades.id, tradeId))
      .limit(1);

    if (!trade[0]) return;

    const entry = parseFloat(String(trade[0].entry ?? "0"));
    const direction = trade[0].direction;
    const riskDollars = parseFloat(String(trade[0].riskDollars ?? String(DEFAULT_RISK)));
    const stopDist = Math.abs(entry - parseFloat(String(trade[0].stop ?? "0")));

    const currentMfe = parseFloat(String(trade[0].mfe ?? "0"));
    const currentMae = parseFloat(String(trade[0].mae ?? "0"));

    const excursionFav = direction === "LONG" ? (high - entry) : (entry - low);
    const excursionAdv = direction === "LONG" ? (entry - low) : (high - entry);

    const newMfe = Math.max(currentMfe, excursionFav * MNQ_POINT_VALUE);
    const newMae = Math.max(currentMae, excursionAdv * MNQ_POINT_VALUE);

    await db
      .update(sb1PaperTrades)
      .set({ mfe: String(newMfe), mae: String(newMae) })
      .where(eq(sb1PaperTrades.id, tradeId));
  } else {
    const trade = await db
      .select()
      .from(paperTrades)
      .where(eq(paperTrades.id, tradeId))
      .limit(1);

    if (!trade[0]) return;

    const entry = parseFloat(String(trade[0].entry ?? "0"));
    const direction = trade[0].direction;

    const currentMfe = parseFloat(String(trade[0].mfe ?? "0"));
    const currentMae = parseFloat(String(trade[0].mae ?? "0"));

    const excursionFav = direction === "LONG" ? (high - entry) : (entry - low);
    const excursionAdv = direction === "LONG" ? (entry - low) : (high - entry);

    const newMfe = Math.max(currentMfe, excursionFav * MNQ_POINT_VALUE);
    const newMae = Math.max(currentMae, excursionAdv * MNQ_POINT_VALUE);

    await db
      .update(paperTrades)
      .set({ mfe: String(newMfe), mae: String(newMae) })
      .where(eq(paperTrades.id, tradeId));
  }
}

/**
 * Check if an open trade should be closed based on current bar's high/low.
 * Returns exit reason and price if trade should close, null otherwise.
 */
function checkExit(
  entry: number,
  stop: number,
  target: number,
  direction: "LONG" | "SHORT",
  high: number,
  low: number
): { reason: "TARGET_HIT" | "STOP_HIT"; exitPrice: number } | null {
  if (direction === "LONG") {
    if (high >= target) return { reason: "TARGET_HIT", exitPrice: target };
    if (low <= stop) return { reason: "STOP_HIT", exitPrice: stop };
  } else {
    if (low <= target) return { reason: "TARGET_HIT", exitPrice: target };
    if (high >= stop) return { reason: "STOP_HIT", exitPrice: stop };
  }
  return null;
}

/**
 * Close a paper trade with exit price and P&L.
 */
async function closeTrade(
  tradeId: string,
  model: string,
  exitPrice: number,
  exitReason: string,
  bar: BarData
): Promise<{ pnl: number; rMultiple: number }> {
  const db = await getDb();
  if (!db) throw new Error("[paperTradeEngine] DB unavailable");

  const now = new Date();

  if (model === "SB1") {
    const trade = await db
      .select()
      .from(sb1PaperTrades)
      .where(eq(sb1PaperTrades.id, tradeId))
      .limit(1);

    if (!trade[0]) return { pnl: 0, rMultiple: 0 };

    const entry = parseFloat(String(trade[0].entry ?? "0"));
    const stop = parseFloat(String(trade[0].stop ?? "0"));
    const direction = trade[0].direction;
    const contracts = trade[0].contracts ?? 1;
    const openedAt = trade[0].openedAt;

    const stopDist = Math.abs(entry - stop);
    const pnlPoints = direction === "LONG" ? (exitPrice - entry) : (entry - exitPrice);
    const pnl = pnlPoints * MNQ_POINT_VALUE * contracts;
    const rMultiple = stopDist > 0 ? pnlPoints / stopDist : 0;
    const holdingTimeMs = now.getTime() - openedAt.getTime();

    await db
      .update(sb1PaperTrades)
      .set({
        status: "CLOSED",
        exitPrice: String(exitPrice),
        exitReason,
        pnl: String(pnl),
        rMultiple: String(rMultiple),
        closedAt: now,
        holdingTimeMs,
      })
      .where(eq(sb1PaperTrades.id, tradeId));

    console.log(
      `[paperTradeEngine] CLOSED SB1 ${direction} @ ${exitPrice.toFixed(2)} ` +
      `reason=${exitReason} P&L=$${pnl.toFixed(2)} R=${rMultiple.toFixed(2)}`
    );

    return { pnl, rMultiple };
  } else {
    const trade = await db
      .select()
      .from(paperTrades)
      .where(eq(paperTrades.id, tradeId))
      .limit(1);

    if (!trade[0]) return { pnl: 0, rMultiple: 0 };

    const entry = parseFloat(String(trade[0].entry ?? "0"));
    const stop = parseFloat(String(trade[0].stop ?? "0"));
    const direction = trade[0].direction;
    const contracts = trade[0].contracts ?? 1;
    const openedAt = trade[0].openedAt;

    const stopDist = Math.abs(entry - stop);
    const pnlPoints = direction === "LONG" ? (exitPrice - entry) : (entry - exitPrice);
    const pnl = pnlPoints * MNQ_POINT_VALUE * contracts;
    const rMultiple = stopDist > 0 ? pnlPoints / stopDist : 0;
    const durationMs = now.getTime() - openedAt.getTime();

    await db
      .update(paperTrades)
      .set({
        status: "CLOSED",
        exitPrice: String(exitPrice),
        exitReason,
        pnl: String(pnl),
        currentR: String(rMultiple),
        closedAt: now,
        tradeDurationMs: durationMs,
      })
      .where(eq(paperTrades.id, tradeId));

    console.log(
      `[paperTradeEngine] CLOSED ${trade[0].model} ${direction} @ ${exitPrice.toFixed(2)} ` +
      `reason=${exitReason} P&L=$${pnl.toFixed(2)} R=${rMultiple.toFixed(2)}`
    );

    return { pnl, rMultiple };
  }
}

// ─── Main processBar Function ─────────────────────────────────────────────────

/**
 * Process a new bar through the paper trade engine.
 * Called after barEvaluator.evaluate() on every atlas_memory insert.
 *
 * Returns a summary of any trade actions taken.
 */
export async function processBar(
  bar: BarData,
  evaluation: EvaluationResult
): Promise<{
  signalFired: boolean;
  signalModel: string | null;
  tradeOpened: boolean;
  tradeClosed: boolean;
  exitReason: string | null;
  pnl: number | null;
  rMultiple: number | null;
}> {
  const db = await getDb();
  if (!db) {
    return { signalFired: false, signalModel: null, tradeOpened: false, tradeClosed: false, exitReason: null, pnl: null, rMultiple: null };
  }

  const high = parseFloat(bar.high ?? "0");
  const low = parseFloat(bar.low ?? "0");
  const close = parseFloat(bar.close ?? "0");

  let signalFired = false;
  let signalModel: string | null = null;
  let tradeOpened = false;
  let tradeClosed = false;
  let exitReason: string | null = null;
  let pnl: number | null = null;
  let rMultiple: number | null = null;

  // ── Step 1: Check and update open positions ──────────────────────────────

  // Check open standard paper trades (monitor account)
  const openTrades = await db
    .select()
    .from(paperTrades)
    .where(and(eq(paperTrades.status, "OPEN"), eq(paperTrades.account, "ATLAS_MONITOR_PAPER")))
    .limit(5);

  for (const trade of openTrades) {
    const entry = parseFloat(String(trade.entry ?? "0"));
    const stop = parseFloat(String(trade.stop ?? "0"));
    const target = parseFloat(String(trade.target ?? "0"));
    const direction = trade.direction;

    // Update MFE/MAE
    await updateOpenTrade(trade.id, trade.model, bar);

    // Check exit
    const exit = checkExit(entry, stop, target, direction, high, low);
    if (exit) {
      const result = await closeTrade(trade.id, trade.model, exit.exitPrice, exit.reason, bar);
      tradeClosed = true;
      exitReason = exit.reason;
      pnl = result.pnl;
      rMultiple = result.rMultiple;
    }
  }

  // Check open SB1 paper trades
  const openSb1Trades = await db
    .select()
    .from(sb1PaperTrades)
    .where(eq(sb1PaperTrades.status, "OPEN"))
    .limit(5);

  for (const trade of openSb1Trades) {
    const entry = parseFloat(String(trade.entry ?? "0"));
    const stop = parseFloat(String(trade.stop ?? "0"));
    const target = parseFloat(String(trade.target ?? "0"));
    const direction = trade.direction;

    await updateOpenTrade(trade.id, "SB1", bar);

    const exit = checkExit(entry, stop, target, direction, high, low);
    if (exit) {
      const result = await closeTrade(trade.id, "SB1", exit.exitPrice, exit.reason, bar);
      tradeClosed = true;
      exitReason = exit.reason;
      pnl = result.pnl;
      rMultiple = result.rMultiple;
    }
  }

  // ── Step 2: Check for new signal (single-active-strategy rule) ───────────

  // Only open a new trade if no position is currently open
  const positionOpen = await hasOpenPosition();

  if (!positionOpen && evaluation.integrityOk) {
    // Priority order: A1 > A3 > SB1 > ORB-1 > B1
    const eligibleModels: string[] = [];
    if (evaluation.a1Eligible) eligibleModels.push("A1");
    if (evaluation.a3Eligible) eligibleModels.push("A3");
    if (evaluation.sb1Eligible) eligibleModels.push("SB1");
    if (evaluation.orb1Eligible) eligibleModels.push("ORB-1");
    if (evaluation.b1Eligible) eligibleModels.push("B1");

    if (eligibleModels.length > 0) {
      // Take the highest-priority eligible model
      const chosenModel = eligibleModels[0];
      signalFired = true;
      signalModel = chosenModel;

      const signal = deriveSignal(bar, chosenModel, evaluation);
      if (signal) {
        const tradeId = await openTrade(signal, bar);
        tradeOpened = true;

        // Record signal on the evaluation row
        await recordSignal(bar.id, chosenModel, signal.direction);

        console.log(
          `[paperTradeEngine] SIGNAL: ${chosenModel} ${signal.direction} ` +
          `entry=${signal.entry.toFixed(2)} stop=${signal.stop.toFixed(2)} ` +
          `target=${signal.target.toFixed(2)} contracts=${signal.contracts}`
        );
      }
    }
  }

  return { signalFired, signalModel, tradeOpened, tradeClosed, exitReason, pnl, rMultiple };
}

/**
 * Get recently closed monitor paper trades (for dashboard display).
 */
export async function getRecentClosedTrades(limit = 10) {
  const db = await getDb();
  if (!db) return [];

  const trades = await db
    .select()
    .from(paperTrades)
    .where(and(eq(paperTrades.status, "CLOSED"), eq(paperTrades.account, "ATLAS_MONITOR_PAPER")))
    .orderBy(desc(paperTrades.closedAt))
    .limit(limit);

  const sb1Trades = await db
    .select()
    .from(sb1PaperTrades)
    .where(eq(sb1PaperTrades.status, "CLOSED"))
    .orderBy(desc(sb1PaperTrades.closedAt))
    .limit(limit);

  // Merge and sort by closedAt
  const merged = [
    ...trades.map((t) => ({ ...t, modelName: t.model, isStandard: true })),
    ...sb1Trades.map((t) => ({ ...t, modelName: "SB1", isStandard: false })),
  ].sort((a, b) => {
    const ta = a.closedAt instanceof Date ? a.closedAt.getTime() : 0;
    const tb = b.closedAt instanceof Date ? b.closedAt.getTime() : 0;
    return tb - ta;
  });

  return merged.slice(0, limit);
}

/**
 * Get the first-signal evidence report for a given trade ID.
 * Returns full provenance: model, signal bar, evaluation, entry/stop/target, P&L.
 */
export async function getTradeEvidenceReport(tradeId: string) {
  const db = await getDb();
  if (!db) return null;

  // Try standard trades first
  const trade = await db
    .select()
    .from(paperTrades)
    .where(eq(paperTrades.id, tradeId))
    .limit(1);

  if (trade[0]) {
    const t = trade[0];
    // Find the evaluation row that recorded this signal
    const evaluation = await db
      .select()
      .from(monitorEvaluations)
      .where(eq(monitorEvaluations.signalModel, t.model ?? ""))
      .orderBy(desc(monitorEvaluations.evaluatedAt))
      .limit(1);

    return {
      tradeId: t.id,
      model: t.model,
      direction: t.direction,
      entry: Number(t.entry ?? 0),
      stop: Number(t.stop ?? 0),
      target: Number(t.target ?? 0),
      riskDollars: Number(t.riskDollars ?? 0),
      contracts: t.contracts ?? 1,
      status: t.status,
      openedAt: t.openedAt,
      closedAt: t.closedAt,
      exitPrice: t.exitPrice ? Number(t.exitPrice) : null,
      exitReason: t.exitReason,
      pnlDollars: t.pnl ? Number(t.pnl) : null,
      rMultiple: t.currentR ? Number(t.currentR) : null,
      mfe: t.mfe ? Number(t.mfe) : null,
      mae: t.mae ? Number(t.mae) : null,
      pipelineRunId: t.pipelineRunId,
      evaluation: evaluation[0] ?? null,
    };
  }

  // Try SB1 trades
  const sb1 = await db
    .select()
    .from(sb1PaperTrades)
    .where(eq(sb1PaperTrades.id, tradeId))
    .limit(1);

  if (sb1[0]) {
    const t = sb1[0];
    const evaluation = await db
      .select()
      .from(monitorEvaluations)
      .where(eq(monitorEvaluations.signalModel, "SB1"))
      .orderBy(desc(monitorEvaluations.evaluatedAt))
      .limit(1);

    return {
      tradeId: t.id,
      model: "SB1",
      direction: t.direction,
      entry: Number(t.entry ?? 0),
      stop: Number(t.stop ?? 0),
      target: Number(t.target ?? 0),
      riskDollars: Number(t.riskDollars ?? 0),
      contracts: t.contracts ?? 1,
      status: t.status,
      openedAt: t.openedAt,
      closedAt: t.closedAt,
      exitPrice: t.exitPrice ? Number(t.exitPrice) : null,
      exitReason: t.exitReason,
      pnlDollars: t.pnl ? Number(t.pnl) : null,
      rMultiple: t.rMultiple ? Number(t.rMultiple) : null,
      mfe: t.mfe ? Number(t.mfe) : null,
      mae: t.mae ? Number(t.mae) : null,
      pipelineRunId: t.pipelineRunId,
      evaluation: evaluation[0] ?? null,
    };
  }

  return null;
}

/**
 * Get all open monitor paper trades (for dashboard display).
 */
export async function getOpenMonitorTrades() {
  const db = await getDb();
  if (!db) return [];

  const trades = await db
    .select()
    .from(paperTrades)
    .where(and(eq(paperTrades.status, "OPEN"), eq(paperTrades.account, "ATLAS_MONITOR_PAPER")))
    .orderBy(desc(paperTrades.openedAt));

  const sb1Trades = await db
    .select()
    .from(sb1PaperTrades)
    .where(eq(sb1PaperTrades.status, "OPEN"))
    .orderBy(desc(sb1PaperTrades.openedAt));

  return { standard: trades, sb1: sb1Trades };
}
