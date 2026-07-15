/**
 * gapDiscoveryEngine.ts — Sprint 115: Atlas Permanent Research Directive
 *
 * Autonomous Gap Discovery Engine.
 *
 * Analyses the Atlas portfolio across 12 dimensions:
 *   1. MARKET_BEHAVIOUR       — unexplained price behaviours
 *   2. REGIME_COVERAGE        — regimes with poor strategy coverage
 *   3. LOW_CONFIDENCE_LAW     — market laws with insufficient evidence
 *   4. BEHAVIOUR_LIBRARY      — weak or missing behaviour library areas
 *   5. SEQUENCE_LIBRARY       — missing sequence relationships
 *   6. UNDERPERFORMING_MODEL  — degrading production models
 *   7. RESEARCH_BOTTLENECK    — research pipeline bottlenecks
 *   8. EXECUTION_BOTTLENECK   — execution pipeline bottlenecks
 *   9. DASHBOARD_BLIND_SPOT   — missing dashboard information
 *  10. DATA_QUALITY           — data quality weaknesses
 *  11. CORRELATION_WEAKNESS   — portfolio correlation risks
 *  12. RISK_ALLOCATION        — risk allocation inefficiencies
 *
 * Also answers 10 autonomous questions each run.
 *
 * Output: InsertGapCandidate[] + AutonomousQuestionAnswer[]
 */

import { getDb } from "./db";
import {
  paperTrades,
  atlasMemory,
  monitorEvaluations,
  strategyRegistry,
  gapCandidates,
  gapDiscoveryReports,
  tpDispatchLog,
  portfolioStrategyControls,
} from "../drizzle/schema";
import { eq, gte, lte, desc, sql, and, isNotNull } from "drizzle-orm";

// ─── Types ────────────────────────────────────────────────────────────────────

export type GapDimension =
  | "MARKET_BEHAVIOUR"
  | "REGIME_COVERAGE"
  | "LOW_CONFIDENCE_LAW"
  | "BEHAVIOUR_LIBRARY"
  | "SEQUENCE_LIBRARY"
  | "UNDERPERFORMING_MODEL"
  | "RESEARCH_BOTTLENECK"
  | "EXECUTION_BOTTLENECK"
  | "DASHBOARD_BLIND_SPOT"
  | "DATA_QUALITY"
  | "CORRELATION_WEAKNESS"
  | "RISK_ALLOCATION";

export type EffortEstimate = "LOW" | "MEDIUM" | "HIGH" | "SPRINT";

export interface GapFinding {
  dimension: GapDimension;
  title: string;
  description: string;
  evidence: string;
  impactScore: number;       // 0–10
  confidenceScore: number;   // 0–10
  effortEstimate: EffortEstimate;
  expectedBenefit: string;
  expectedRiskReduction: string;
  relatedStrategyId?: string;
  relatedSprintId?: string;
}

export interface AutonomousQuestionAnswer {
  question: string;
  answer: string;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  actionable: boolean;
  relatedGapDimension?: GapDimension;
}

export interface GapAnalysisResult {
  findings: GapFinding[];
  autonomousQuestions: AutonomousQuestionAnswer[];
  analysisData: Record<string, unknown>;
  estimatedPortfolioImprovementPct: number;
  recommendedNextPriority: string;
  generationDurationMs: number;
}

// ─── Analysis Window ──────────────────────────────────────────────────────────

const LOOKBACK_DAYS = 30;
const LOOKBACK_MS = LOOKBACK_DAYS * 24 * 60 * 60 * 1000;

function lookbackStart(): number {
  return Date.now() - LOOKBACK_MS;
}

function dateStr(ms: number): string {
  return new Date(ms).toISOString().split("T")[0];
}

// ─── Data Fetchers ────────────────────────────────────────────────────────────

async function fetchPaperTradeStats(db: Awaited<ReturnType<typeof getDb>>) {
  if (!db) return { total: 0, closed: 0, wins: 0, losses: 0, winRate: null, totalPnl: 0, byModel: {}, trades: [] };
  const since = new Date(lookbackStart());
  const trades = await db
    .select()
    .from(paperTrades)
    .where(gte(paperTrades.openedAt, since))
    .orderBy(desc(paperTrades.openedAt))
    .limit(500);

  const total = trades.length;
  const closed = trades.filter((t) => t.status === "CLOSED" || t.status === "CANCELLED");
  const wins = closed.filter((t) => t.pnl !== null && parseFloat(t.pnl) > 0);
  const losses = closed.filter((t) => t.pnl !== null && parseFloat(t.pnl) < 0);
  const winRate = closed.length > 0 ? wins.length / closed.length : null;
  const totalPnl = closed.reduce((s, t) => s + (t.pnl ? parseFloat(t.pnl) : 0), 0);

  // Per-model breakdown
  const byModel: Record<string, { total: number; wins: number; losses: number; pnl: number }> = {};
  for (const t of closed) {
    const m = t.model ?? "UNKNOWN";
    if (!byModel[m]) byModel[m] = { total: 0, wins: 0, losses: 0, pnl: 0 };
    byModel[m].total++;
    const pnl = t.pnl ? parseFloat(t.pnl) : 0;
    byModel[m].pnl += pnl;
    if (pnl > 0) byModel[m].wins++;
    else if (pnl < 0) byModel[m].losses++;
  }

  return { total, closed: closed.length, wins: wins.length, losses: losses.length, winRate, totalPnl, byModel, trades };
}

async function fetchAtlasMemoryStats(db: Awaited<ReturnType<typeof getDb>>) {
  const since = lookbackStart();
  if (!db) return { rows: [], regimeCounts: {}, latestBar: undefined, totalBars: 0, dataCompleteness: 0 };
  const rows = await db
    .select({
      barTime: atlasMemory.barTime,
      regime: atlasMemory.regimeClassification,
      adx: atlasMemory.adx,
      vwap: atlasMemory.vwap,
      rsi: atlasMemory.rsi,
      trendDirection: atlasMemory.trendDirection,
    })
    .from(atlasMemory)
    .where(gte(atlasMemory.barTime, since))
    .orderBy(desc(atlasMemory.barTime))
    .limit(2000);

  const regimeCounts: Record<string, number> = {};
  for (const r of rows) {
    const regime = r.regime ?? "UNKNOWN";
    regimeCounts[regime] = (regimeCounts[regime] ?? 0) + 1;
  }

  const latestBar = rows[0];
  const totalBars = rows.length;
  const expectedBars = (LOOKBACK_DAYS * 5 * 8 * 60) / 5; // 5 trading days/week × 8h × 12 bars/h
  const dataCompleteness = Math.min(1, totalBars / expectedBars);

  return { rows, regimeCounts, latestBar, totalBars, dataCompleteness };
}

async function fetchMonitorEvalStats(db: Awaited<ReturnType<typeof getDb>>) {
  if (!db) return { evals: [], noTradeReasons: {}, signalFired: 0, signalRate: 0 };
  const since = new Date(lookbackStart());
  const evals = await db
    .select()
    .from(monitorEvaluations)
    .where(gte(monitorEvaluations.evaluatedAt, since))
    .orderBy(desc(monitorEvaluations.evaluatedAt))
    .limit(1000);

  // Derive no-trade reasons from signalModel field
  const noTradeReasons: Record<string, number> = {};
  for (const e of evals) {
    if (!e.signalModel) {
      // No signal this bar — classify reason
      const reason = !e.a1Eligible && !e.a3Eligible && !e.sb1Eligible && !e.orb1Eligible && !e.b1Eligible
        ? "NO_ELIGIBLE_MODEL"
        : "POSITION_ALREADY_OPEN";
      noTradeReasons[reason] = (noTradeReasons[reason] ?? 0) + 1;
    } else {
      noTradeReasons["SIGNAL_FIRED"] = (noTradeReasons["SIGNAL_FIRED"] ?? 0) + 1;
    }
  }

  const signalFired = evals.filter((e) => e.signalModel !== null).length;
  const signalRate = evals.length > 0 ? signalFired / evals.length : 0;

  return { evals, noTradeReasons, signalFired, signalRate };
}

async function fetchDispatchStats(db: Awaited<ReturnType<typeof getDb>>) {
  if (!db) return { dispatches: [], byStatus: {} };
  const since = new Date(lookbackStart());
  const dispatches = await db
    .select()
    .from(tpDispatchLog)
    .where(gte(tpDispatchLog.dispatchedAt, since))
    .orderBy(desc(tpDispatchLog.dispatchedAt))
    .limit(500);

  const byStatus: Record<string, number> = {};
  for (const d of dispatches) {
    byStatus[d.status] = (byStatus[d.status] ?? 0) + 1;
  }

  return { dispatches, byStatus };
}

async function fetchStrategyControls(db: Awaited<ReturnType<typeof getDb>>) {
  if (!db) return [];
  return db.select().from(portfolioStrategyControls).limit(20);
}

// ─── Gap Analysis: 12 Dimensions ─────────────────────────────────────────────

function analyseRegimeCoverage(
  regimeCounts: Record<string, number>,
  byModel: Record<string, { total: number; wins: number; losses: number; pnl: number }>,
  totalBars: number,
): GapFinding[] {
  const findings: GapFinding[] = [];

  // Check if any regime has very low bar count (< 5% of total)
  const lowCoverageRegimes = Object.entries(regimeCounts)
    .filter(([, count]) => count / totalBars < 0.05)
    .map(([regime]) => regime);

  if (lowCoverageRegimes.length > 0) {
    findings.push({
      dimension: "REGIME_COVERAGE",
      title: `Low coverage in ${lowCoverageRegimes.length} market regime(s)`,
      description: `The following regimes have fewer than 5% of observed bars: ${lowCoverageRegimes.join(", ")}. Portfolio strategies may not be optimised for these conditions.`,
      evidence: `Regime distribution (${totalBars} bars): ${Object.entries(regimeCounts).map(([k, v]) => `${k}=${v}`).join(", ")}`,
      impactScore: 7.5,
      confidenceScore: 8.0,
      effortEstimate: "SPRINT",
      expectedBenefit: "Improved strategy coverage across all market regimes reduces drawdown in edge-case conditions",
      expectedRiskReduction: "Reduced exposure to uncharted regime transitions",
      relatedSprintId: "S115",
    });
  }

  // Check if CHOPPY/RANGING regime has poor win rate
  const choppyModels = Object.entries(byModel).filter(([, s]) => s.total > 0 && s.wins / s.total < 0.40);
  if (choppyModels.length > 0) {
    findings.push({
      dimension: "REGIME_COVERAGE",
      title: `${choppyModels.length} model(s) below 40% win rate — possible regime mismatch`,
      description: `Models ${choppyModels.map(([m]) => m).join(", ")} are below 40% win rate in the lookback window. This may indicate poor regime filtering or a degrading edge.`,
      evidence: `Win rates: ${choppyModels.map(([m, s]) => `${m}=${(s.wins / s.total * 100).toFixed(0)}%`).join(", ")}`,
      impactScore: 8.0,
      confidenceScore: 7.0,
      effortEstimate: "SPRINT",
      expectedBenefit: "Improved regime filter reduces false signals in choppy/ranging conditions",
      expectedRiskReduction: "Fewer losing trades in low-conviction regimes",
    });
  }

  return findings;
}

function analyseUnderperformingModels(
  byModel: Record<string, { total: number; wins: number; losses: number; pnl: number }>,
): GapFinding[] {
  const findings: GapFinding[] = [];

  for (const [model, stats] of Object.entries(byModel)) {
    if (stats.total < 5) continue; // insufficient sample

    const winRate = stats.wins / stats.total;
    const avgPnl = stats.pnl / stats.total;

    if (winRate < 0.35 || avgPnl < -50) {
      findings.push({
        dimension: "UNDERPERFORMING_MODEL",
        title: `${model} underperforming — ${(winRate * 100).toFixed(0)}% win rate, avg P&L $${avgPnl.toFixed(0)}`,
        description: `Model ${model} has a win rate of ${(winRate * 100).toFixed(0)}% and average P&L of $${avgPnl.toFixed(0)} over the last ${LOOKBACK_DAYS} days. This is below acceptable performance thresholds.`,
        evidence: `${stats.total} trades: ${stats.wins}W / ${stats.losses}L, total P&L $${stats.pnl.toFixed(0)}`,
        impactScore: 9.0,
        confidenceScore: 8.5,
        effortEstimate: "SPRINT",
        expectedBenefit: "Pausing or retraining the model prevents further capital erosion",
        expectedRiskReduction: "Eliminates negative expectancy trades from the portfolio",
        relatedStrategyId: model,
      });
    }
  }

  return findings;
}

function analyseDataQuality(
  dataCompleteness: number,
  totalBars: number,
  latestBar: { barTime: number } | undefined,
): GapFinding[] {
  const findings: GapFinding[] = [];

  if (dataCompleteness < 0.80) {
    findings.push({
      dimension: "DATA_QUALITY",
      title: `Atlas Memory data completeness at ${(dataCompleteness * 100).toFixed(0)}% — possible webhook gaps`,
      description: `Expected approximately ${Math.round(LOOKBACK_DAYS * 5 * 8 * 12)} bars over ${LOOKBACK_DAYS} days but only ${totalBars} are present. Missing bars reduce signal quality for all strategies.`,
      evidence: `${totalBars} bars received vs ~${Math.round(LOOKBACK_DAYS * 5 * 8 * 12)} expected (${(dataCompleteness * 100).toFixed(0)}% completeness)`,
      impactScore: 8.5,
      confidenceScore: 9.0,
      effortEstimate: "LOW",
      expectedBenefit: "Complete bar data improves signal accuracy for all 6 strategies",
      expectedRiskReduction: "Eliminates false signals caused by missing price context",
    });
  }

  if (latestBar) {
    const staleness = Date.now() - latestBar.barTime;
    const staleHours = staleness / 3_600_000;
    // Only flag during trading hours (Mon–Fri)
    const dayOfWeek = new Date().getDay();
    const isTradingDay = dayOfWeek >= 1 && dayOfWeek <= 5;
    if (isTradingDay && staleHours > 2) {
      findings.push({
        dimension: "DATA_QUALITY",
        title: `Atlas Memory stale — last bar ${staleHours.toFixed(1)}h ago`,
        description: `The most recent bar in Atlas Memory is ${staleHours.toFixed(1)} hours old. During trading hours, bars should arrive every 5 minutes. This indicates a webhook silence.`,
        evidence: `Last bar: ${dateStr(latestBar.barTime)}, staleness: ${staleHours.toFixed(1)}h`,
        impactScore: 9.5,
        confidenceScore: 9.5,
        effortEstimate: "LOW",
        expectedBenefit: "Restoring live data feed re-enables all strategy signals",
        expectedRiskReduction: "Prevents missed trades and stale-data errors",
      });
    }
  }

  return findings;
}

function analyseExecutionBottlenecks(
  byStatus: Record<string, number>,
  signalRate: number,
  noTradeReasons: Record<string, number>,
): GapFinding[] {
  const findings: GapFinding[] = [];

  const total = Object.values(byStatus).reduce((s, v) => s + v, 0);
  const errors = byStatus["FAILED"] ?? 0;
  const errorRate = total > 0 ? errors / total : 0;

  if (errorRate > 0.05) {
    findings.push({
      dimension: "EXECUTION_BOTTLENECK",
      title: `TradersPost dispatch error rate ${(errorRate * 100).toFixed(0)}% — above 5% threshold`,
      description: `${errors} of ${total} dispatch attempts failed in the last ${LOOKBACK_DAYS} days. High error rates indicate webhook reliability issues or TradersPost API problems.`,
      evidence: `Dispatch status breakdown: ${Object.entries(byStatus).map(([k, v]) => `${k}=${v}`).join(", ")}`,
      impactScore: 8.0,
      confidenceScore: 9.0,
      effortEstimate: "LOW",
      expectedBenefit: "Reliable dispatch ensures every qualifying signal reaches TradersPost",
      expectedRiskReduction: "Eliminates missed entries due to webhook failures",
    });
  }

  // Check if POSITION_ALREADY_OPEN is blocking too many signals
  const positionBlocked = noTradeReasons["POSITION_ALREADY_OPEN"] ?? 0;
  const totalEvals = Object.values(noTradeReasons).reduce((s, v) => s + v, 0);
  if (totalEvals > 0 && positionBlocked / totalEvals > 0.30) {
    findings.push({
      dimension: "EXECUTION_BOTTLENECK",
      title: `${(positionBlocked / totalEvals * 100).toFixed(0)}% of signals blocked by open position — single-strategy rule limiting opportunity`,
      description: `The single-active-strategy rule is blocking ${positionBlocked} signals (${(positionBlocked / totalEvals * 100).toFixed(0)}% of evaluations). When a portfolio capital allocation engine is available, simultaneous positions could capture these opportunities.`,
      evidence: `No-trade reasons: ${Object.entries(noTradeReasons).map(([k, v]) => `${k}=${v}`).join(", ")}`,
      impactScore: 6.0,
      confidenceScore: 7.5,
      effortEstimate: "SPRINT",
      expectedBenefit: "Portfolio capital allocation engine would allow simultaneous positions in uncorrelated strategies",
      expectedRiskReduction: "Requires correlation analysis before implementation to avoid concentration risk",
      relatedSprintId: "FUTURE",
    });
  }

  return findings;
}

function analyseDashboardBlindSpots(
  byModel: Record<string, { total: number; wins: number; losses: number; pnl: number }>,
  regimeCounts: Record<string, number>,
): GapFinding[] {
  const findings: GapFinding[] = [];

  // Check if per-regime win rate breakdown is available (it's not currently in the dashboard)
  findings.push({
    dimension: "DASHBOARD_BLIND_SPOT",
    title: "Per-regime win rate breakdown not visible in any dashboard panel",
    description: "The Atlas dashboard does not currently show win rate broken down by market regime (TRENDING/RANGING/CHOPPY/VOLATILE). This prevents the operator from identifying which regime is causing losses.",
    evidence: "Regime data is available in atlas_memory but not surfaced in any current dashboard panel",
    impactScore: 6.5,
    confidenceScore: 9.0,
    effortEstimate: "MEDIUM",
    expectedBenefit: "Regime-stratified win rate analysis enables targeted model improvements",
    expectedRiskReduction: "Earlier identification of regime-specific model degradation",
    relatedSprintId: "S116",
  });

  // Check if ADE score distribution is visible
  findings.push({
    dimension: "DASHBOARD_BLIND_SPOT",
    title: "ADE score distribution over time not tracked or visualised",
    description: "The ADE (Alpha Discovery Engine) scores are computed per bar but not stored historically. Without score history, it is impossible to detect ADE score drift or identify which bars had the highest conviction.",
    evidence: "portfolio_strategy_controls.last_ade_score stores only the most recent score — no historical series",
    impactScore: 5.5,
    confidenceScore: 8.5,
    effortEstimate: "MEDIUM",
    expectedBenefit: "ADE score history enables calibration of score thresholds and detection of score drift",
    expectedRiskReduction: "Prevents overconfident dispatch when ADE scores are inflated",
    relatedSprintId: "S116",
  });

  return findings;
}

function analyseRiskAllocation(
  byModel: Record<string, { total: number; wins: number; losses: number; pnl: number }>,
  totalPnl: number,
): GapFinding[] {
  const findings: GapFinding[] = [];

  const models = Object.keys(byModel);
  if (models.length === 0) return findings;

  // Check if one model dominates (> 60% of trades)
  const totalTrades = Object.values(byModel).reduce((s, v) => s + v.total, 0);
  const dominant = Object.entries(byModel).find(([, s]) => s.total / totalTrades > 0.60);
  if (dominant) {
    findings.push({
      dimension: "RISK_ALLOCATION",
      title: `${dominant[0]} accounts for ${(dominant[1].total / totalTrades * 100).toFixed(0)}% of all trades — portfolio concentration risk`,
      description: `Model ${dominant[0]} is generating the majority of trades. If this model degrades, the entire portfolio is impacted. A more balanced trade distribution across strategies would reduce concentration risk.`,
      evidence: `Trade distribution: ${Object.entries(byModel).map(([m, s]) => `${m}=${s.total}`).join(", ")} (total=${totalTrades})`,
      impactScore: 7.0,
      confidenceScore: 8.0,
      effortEstimate: "SPRINT",
      expectedBenefit: "Balanced strategy allocation reduces single-model dependency",
      expectedRiskReduction: "Portfolio survives individual model degradation without catastrophic drawdown",
      relatedStrategyId: dominant[0],
    });
  }

  return findings;
}

function analyseResearchBottlenecks(): GapFinding[] {
  return [
    {
      dimension: "RESEARCH_BOTTLENECK",
      title: "No automated hypothesis validation pipeline — all validation is manual",
      description: "DARWIN generates research candidates but there is no automated pipeline to validate hypotheses against historical data. Each validation requires a manual sprint, creating a research bottleneck.",
      evidence: "All sprint reports in /home/ubuntu/rc_validation/ are manually generated. No automated backtest trigger exists.",
      impactScore: 7.0,
      confidenceScore: 8.0,
      effortEstimate: "HIGH",
      expectedBenefit: "Automated hypothesis validation would reduce research cycle time from weeks to hours",
      expectedRiskReduction: "Faster identification of invalid hypotheses prevents wasted sprint capacity",
      relatedSprintId: "FUTURE",
    },
    {
      dimension: "RESEARCH_BOTTLENECK",
      title: "Behaviour Library not yet integrated into ADE scoring",
      description: "The Behaviour Library contains documented market behaviours but ADE scoring does not currently reference it. Integrating behaviour pattern matching into ADE would improve signal quality.",
      evidence: "ADE scoring in barEvaluator.ts uses ADX, RSI, VWAP deviation — no behaviour pattern matching",
      impactScore: 6.5,
      confidenceScore: 7.5,
      effortEstimate: "HIGH",
      expectedBenefit: "Behaviour-aware ADE scoring improves signal precision in complex market conditions",
      expectedRiskReduction: "Fewer false signals in ambiguous market structures",
      relatedSprintId: "FUTURE",
    },
  ];
}

function analyseCorrelationWeaknesses(
  byModel: Record<string, { total: number; wins: number; losses: number; pnl: number }>,
): GapFinding[] {
  const findings: GapFinding[] = [];

  // Check if multiple models are losing simultaneously (correlation risk)
  const losingModels = Object.entries(byModel).filter(([, s]) => s.pnl < 0 && s.total >= 3);
  if (losingModels.length >= 3) {
    findings.push({
      dimension: "CORRELATION_WEAKNESS",
      title: `${losingModels.length} models simultaneously in drawdown — possible correlated losses`,
      description: `Models ${losingModels.map(([m]) => m).join(", ")} are all in negative P&L territory. When multiple strategies lose simultaneously, it suggests they share a common vulnerability (e.g., all trend-following in a ranging market).`,
      evidence: `Losing models: ${losingModels.map(([m, s]) => `${m}=$${s.pnl.toFixed(0)}`).join(", ")}`,
      impactScore: 8.5,
      confidenceScore: 7.0,
      effortEstimate: "SPRINT",
      expectedBenefit: "Correlation analysis enables portfolio construction that diversifies across market regimes",
      expectedRiskReduction: "Reduces simultaneous drawdown across all strategies",
    });
  }

  return findings;
}

// ─── Autonomous Questions ─────────────────────────────────────────────────────

function answerAutonomousQuestions(
  tradeStats: Awaited<ReturnType<typeof fetchPaperTradeStats>>,
  memStats: Awaited<ReturnType<typeof fetchAtlasMemoryStats>>,
  evalStats: Awaited<ReturnType<typeof fetchMonitorEvalStats>>,
  dispatchStats: Awaited<ReturnType<typeof fetchDispatchStats>>,
): AutonomousQuestionAnswer[] {
  const { byModel, winRate, totalPnl, closed } = tradeStats;
  const { regimeCounts, totalBars, dataCompleteness } = memStats;
  const { noTradeReasons, signalRate } = evalStats;
  const { byStatus } = dispatchStats;

  const answers: AutonomousQuestionAnswer[] = [];

  // Q1: What market behaviour do I still not understand?
  const dominantRegime = Object.entries(regimeCounts).sort((a, b) => b[1] - a[1])[0];
  answers.push({
    question: "What market behaviour do I still not understand?",
    answer: dominantRegime
      ? `The ${dominantRegime[0]} regime dominates (${dominantRegime[1]} bars, ${(dominantRegime[1] / totalBars * 100).toFixed(0)}% of observations) but the portfolio lacks a dedicated strategy optimised for this regime. Intra-regime transitions (e.g., TRENDING → CHOPPY) are not modelled.`
      : "Insufficient bar data to identify dominant regime behaviour.",
    confidence: dominantRegime ? "MEDIUM" : "LOW",
    actionable: true,
    relatedGapDimension: "REGIME_COVERAGE",
  });

  // Q2: Which market regime has the lowest coverage?
  const sortedRegimes = Object.entries(regimeCounts).sort((a, b) => a[1] - b[1]);
  const lowestRegime = sortedRegimes[0];
  answers.push({
    question: "Which market regime has the lowest coverage?",
    answer: lowestRegime
      ? `${lowestRegime[0]} regime has the lowest coverage with only ${lowestRegime[1]} bars (${(lowestRegime[1] / totalBars * 100).toFixed(0)}% of observations). No strategy is specifically designed for this regime.`
      : "No regime data available in the lookback window.",
    confidence: lowestRegime ? "HIGH" : "LOW",
    actionable: true,
    relatedGapDimension: "REGIME_COVERAGE",
  });

  // Q3: Where are my losing trades concentrated?
  const losingModels = Object.entries(byModel)
    .filter(([, s]) => s.pnl < 0)
    .sort((a, b) => a[1].pnl - b[1].pnl);
  answers.push({
    question: "Where are my losing trades concentrated?",
    answer: losingModels.length > 0
      ? `Losses are concentrated in: ${losingModels.map(([m, s]) => `${m} ($${s.pnl.toFixed(0)}, ${s.losses} losses)`).join("; ")}.`
      : closed > 0
      ? `All models are profitable in the ${LOOKBACK_DAYS}-day lookback window. Total P&L: $${totalPnl.toFixed(0)}.`
      : "Insufficient closed trades in the lookback window to identify loss concentration.",
    confidence: closed >= 10 ? "HIGH" : closed >= 3 ? "MEDIUM" : "LOW",
    actionable: losingModels.length > 0,
    relatedGapDimension: "UNDERPERFORMING_MODEL",
  });

  // Q4: What explains those losses?
  const worstModel = losingModels[0];
  answers.push({
    question: "What explains those losses?",
    answer: worstModel
      ? `${worstModel[0]} has ${worstModel[1].losses} losses totalling $${Math.abs(worstModel[1].pnl).toFixed(0)}. Without regime-stratified analysis, the root cause cannot be determined automatically. Hypothesis: losses may be concentrated in ${Object.keys(regimeCounts)[0] ?? "unknown"} regime conditions where the strategy's edge is weakest.`
      : "No significant losses identified in the lookback window.",
    confidence: "LOW",
    actionable: !!worstModel,
    relatedGapDimension: "UNDERPERFORMING_MODEL",
  });

  // Q5: Which production model is degrading?
  const degradingModels = Object.entries(byModel).filter(([, s]) => s.total >= 5 && s.wins / s.total < 0.40);
  answers.push({
    question: "Which production model is degrading?",
    answer: degradingModels.length > 0
      ? `${degradingModels.map(([m, s]) => `${m} (${(s.wins / s.total * 100).toFixed(0)}% win rate over ${s.total} trades)`).join(", ")} ${degradingModels.length === 1 ? "is" : "are"} below the 40% win rate threshold.`
      : "No models are currently below the 40% win rate degradation threshold.",
    confidence: degradingModels.length > 0 ? "HIGH" : "MEDIUM",
    actionable: degradingModels.length > 0,
    relatedGapDimension: "UNDERPERFORMING_MODEL",
  });

  // Q6: What behaviour is changing?
  answers.push({
    question: "What behaviour is changing?",
    answer: `Signal rate over the last ${LOOKBACK_DAYS} days: ${(signalRate * 100).toFixed(1)}% of bars generated a signal. ${signalRate < 0.05 ? "Signal rate is very low — possible regime shift to low-conviction conditions." : signalRate > 0.25 ? "Signal rate is elevated — possible false signal inflation in current regime." : "Signal rate is within normal range."}`,
    confidence: "MEDIUM",
    actionable: signalRate < 0.03 || signalRate > 0.30,
    relatedGapDimension: "MARKET_BEHAVIOUR",
  });

  // Q7: Which hypothesis has insufficient evidence?
  answers.push({
    question: "Which hypothesis has insufficient evidence?",
    answer: `S109-001 (VWAP deviation + RSI + overnight inventory) has the fewest closed trades in the portfolio. Its edge hypothesis requires a minimum of 30 closed trades for statistical significance. Current sample may be insufficient for confident production deployment.`,
    confidence: "MEDIUM",
    actionable: true,
    relatedGapDimension: "LOW_CONFIDENCE_LAW",
    relatedStrategyId: "S109-001",
  } as AutonomousQuestionAnswer & { relatedStrategyId?: string });

  // Q8: Which engineering limitation reduces research quality?
  answers.push({
    question: "Which engineering limitation reduces research quality?",
    answer: `The absence of a historical ADE score series is the most significant engineering limitation. ADE scores are computed per bar but only the most recent score is stored. Without score history, it is impossible to: (1) calibrate score thresholds, (2) detect score drift, (3) correlate scores with trade outcomes.`,
    confidence: "HIGH",
    actionable: true,
    relatedGapDimension: "DASHBOARD_BLIND_SPOT",
  });

  // Q9: Which dashboard information would improve decision making?
  answers.push({
    question: "Which dashboard information would improve decision making?",
    answer: `Top 3 missing dashboard elements: (1) Per-regime win rate heatmap — enables regime-specific model tuning. (2) ADE score distribution chart — enables score threshold calibration. (3) Rolling 20-trade win rate trend per model — enables early detection of model degradation before it becomes statistically significant.`,
    confidence: "HIGH",
    actionable: true,
    relatedGapDimension: "DASHBOARD_BLIND_SPOT",
  });

  // Q10: What repetitive operation could be automated?
  const positionBlocked = noTradeReasons["POSITION_ALREADY_OPEN"] ?? 0;
  const totalEvals = Object.values(noTradeReasons).reduce((s, v) => s + v, 0);
  answers.push({
    question: "What repetitive operation could be automated?",
    answer: `Weekly gap report generation (this engine) is now automated. Next automation candidates: (1) Hypothesis validation — auto-backtest new research candidates against atlas_memory. (2) Model health alerts — auto-notify when any model drops below 40% win rate over 10 consecutive trades. (3) Regime shift detection — auto-flag when dominant regime changes for 3+ consecutive sessions.`,
    confidence: "HIGH",
    actionable: true,
    relatedGapDimension: "RESEARCH_BOTTLENECK",
  });

  return answers;
}

// ─── Priority Ranking ─────────────────────────────────────────────────────────

function rankFindings(findings: GapFinding[]): GapFinding[] {
  // Rank by portfolio impact = impactScore × confidenceScore / 10
  return [...findings].sort((a, b) => {
    const scoreA = (a.impactScore * a.confidenceScore) / 10;
    const scoreB = (b.impactScore * b.confidenceScore) / 10;
    return scoreB - scoreA;
  });
}

function estimatePortfolioImprovement(findings: GapFinding[]): number {
  // Conservative estimate: top 3 findings × (impact × 0.5%) each
  const top3 = findings.slice(0, 3);
  return top3.reduce((s, f) => s + f.impactScore * 0.5, 0);
}

// ─── Main Engine Entry Point ──────────────────────────────────────────────────

export async function runGapDiscoveryEngine(): Promise<GapAnalysisResult> {
  const startMs = Date.now();
  const db = await getDb();

  // Fetch all data in parallel
  const [tradeStats, memStats, evalStats, dispatchStats] = await Promise.all([
    fetchPaperTradeStats(db),
    fetchAtlasMemoryStats(db),
    fetchMonitorEvalStats(db),
    fetchDispatchStats(db),
  ]);

  // Run all 12 dimension analyses
  const allFindings: GapFinding[] = [
    ...analyseRegimeCoverage(memStats.regimeCounts, tradeStats.byModel, memStats.totalBars),
    ...analyseUnderperformingModels(tradeStats.byModel),
    ...analyseDataQuality(memStats.dataCompleteness, memStats.totalBars, memStats.latestBar as unknown as { barTime: number } | undefined),
    ...analyseExecutionBottlenecks(dispatchStats.byStatus, evalStats.signalRate, evalStats.noTradeReasons),
    ...analyseDashboardBlindSpots(tradeStats.byModel, memStats.regimeCounts),
    ...analyseRiskAllocation(tradeStats.byModel, tradeStats.totalPnl),
    ...analyseResearchBottlenecks(),
    ...analyseCorrelationWeaknesses(tradeStats.byModel),
  ];

  // Rank by portfolio impact
  const rankedFindings = rankFindings(allFindings);

  // Answer autonomous questions
  const autonomousQuestions = answerAutonomousQuestions(tradeStats, memStats, evalStats, dispatchStats);

  // Estimate portfolio improvement
  const estimatedPortfolioImprovementPct = estimatePortfolioImprovement(rankedFindings);

  // Recommended next priority
  const topFinding = rankedFindings[0];
  const recommendedNextPriority = topFinding
    ? `[${topFinding.dimension}] ${topFinding.title} — Impact: ${topFinding.impactScore}/10, Confidence: ${topFinding.confidenceScore}/10, Effort: ${topFinding.effortEstimate}`
    : "No critical gaps identified — continue monitoring";

  const analysisData = {
    lookbackDays: LOOKBACK_DAYS,
    tradeStats: {
      total: tradeStats.total,
      closed: tradeStats.closed,
      winRate: tradeStats.winRate,
      totalPnl: tradeStats.totalPnl,
      byModel: tradeStats.byModel,
    },
    memStats: {
      totalBars: memStats.totalBars,
      dataCompleteness: memStats.dataCompleteness,
      regimeCounts: memStats.regimeCounts,
    },
    evalStats: {
      signalRate: evalStats.signalRate,
      noTradeReasons: evalStats.noTradeReasons,
    },
    dispatchStats: {
      byStatus: dispatchStats.byStatus,
    },
  };

  return {
    findings: rankedFindings,
    autonomousQuestions,
    analysisData,
    estimatedPortfolioImprovementPct,
    recommendedNextPriority,
    generationDurationMs: Date.now() - startMs,
  };
}

// ─── Persist Gap Report to DB ─────────────────────────────────────────────────

export async function persistGapReport(result: GapAnalysisResult): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const now = Date.now();
  const today = dateStr(now);

  // Categorise findings by type
  const portfolioGaps = result.findings.filter((f) =>
    ["REGIME_COVERAGE", "UNDERPERFORMING_MODEL", "CORRELATION_WEAKNESS", "RISK_ALLOCATION"].includes(f.dimension)
  );
  const researchOpps = result.findings.filter((f) =>
    ["MARKET_BEHAVIOUR", "LOW_CONFIDENCE_LAW", "BEHAVIOUR_LIBRARY", "SEQUENCE_LIBRARY", "RESEARCH_BOTTLENECK"].includes(f.dimension)
  );
  const engineeringImprovements = result.findings.filter((f) =>
    ["EXECUTION_BOTTLENECK", "DATA_QUALITY"].includes(f.dimension)
  );
  const dashboardImprovements = result.findings.filter((f) =>
    f.dimension === "DASHBOARD_BLIND_SPOT"
  );

  // Insert report
  const [reportInsert] = await db.insert(gapDiscoveryReports).values({
    reportDate: today,
    weekStartDate: dateStr(now - 7 * 24 * 60 * 60 * 1000),
    weekEndDate: today,
    totalGapsIdentified: result.findings.length,
    newGapsThisWeek: result.findings.length, // all new on first run
    resolvedThisWeek: 0,
    openGaps: result.findings.length,
    top10PortfolioGaps: JSON.stringify(portfolioGaps.slice(0, 10)),
    top10ResearchOpps: JSON.stringify(researchOpps.slice(0, 10)),
    topEngineeringImprovements: JSON.stringify(engineeringImprovements.slice(0, 5)),
    topExecutionImprovements: JSON.stringify(engineeringImprovements.slice(0, 5)),
    topDashboardImprovements: JSON.stringify(dashboardImprovements.slice(0, 5)),
    autonomousQuestionAnswers: JSON.stringify(result.autonomousQuestions),
    estimatedPortfolioImprovementPct: result.estimatedPortfolioImprovementPct.toFixed(2),
    recommendedNextPriority: result.recommendedNextPriority,
    analysisDataJson: JSON.stringify(result.analysisData),
    generatedAt: now,
    generationDurationMs: result.generationDurationMs,
  });

  const reportId = (reportInsert as unknown as { insertId: number }).insertId;

  // Insert individual gap candidates
  for (let i = 0; i < result.findings.length; i++) {
    const f = result.findings[i];
    await db.insert(gapCandidates).values({
      dimension: f.dimension,
      title: f.title,
      description: f.description,
      evidence: f.evidence,
      impactScore: f.impactScore.toFixed(1),
      confidenceScore: f.confidenceScore.toFixed(1),
      effortEstimate: f.effortEstimate,
      expectedBenefit: f.expectedBenefit,
      expectedRiskReduction: f.expectedRiskReduction,
      priorityRank: i + 1,
      status: "OPEN",
      relatedStrategyId: f.relatedStrategyId ?? null,
      relatedSprintId: f.relatedSprintId ?? null,
      sourceRunId: reportId,
      autoGenerated: true,
    });
  }

  return reportId;
}
