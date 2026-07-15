/**
 * DARWIN Daily Research Report Generator — Sprint 116
 *
 * Autonomous daily market research cycle.
 * Runs after the trading/research cycle completes (scheduled ~17:00 ET).
 *
 * Produces a 10-section Markdown report:
 *   1. Executive Summary
 *   2. Market Behaviour Discoveries
 *   3. Strategy Health
 *   4. Gap Discovery Results
 *   5. DARWIN Explanations
 *   6. Hypotheses Generated
 *   7. Behaviour Promotions
 *   8. Failed Ideas
 *   9. Recommended Next Sprint
 *  10. DARWIN Commentary
 *
 * After generation, the report is:
 *   - Stored in darwin_daily_reports table
 *   - Committed to SFGrowth/Project-Atlas/research/daily/ via GitHub CLI
 */

import { desc, gte, and, eq, lt, sql } from "drizzle-orm";
import { getDb } from "./db.js";
import {
  paperTrades,
  monitorEvaluations,
  darwinCandidates,
  darwinRejectionRegistry,
  marketLaws,
  behaviourLibrary,
  portfolioStrategyControls,
  gapCandidates,
  gapDiscoveryReports,
  darwinDailyReports,
  InsertDarwinDailyReport,
} from "../drizzle/schema.js";
import { invokeLLM } from "./_core/llm.js";
import { runGapDiscoveryEngine, persistGapReport } from "./gapDiscoveryEngine.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StrategyHealthStat {
  model: string;
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  profitFactor: number;
  avgR: number;
  totalPnl: number;
  maxDrawdown: number;
  tradeFrequency: string; // "X trades/week"
  trend: "IMPROVING" | "STABLE" | "DECLINING";
}

export interface BehaviourDiscovery {
  name: string;
  description: string;
  evidence: string;
  sampleSize: number;
  confidencePct: number;
  statisticalSignificance: string;
  potentialImpact: string;
  relatedStrategies: string[];
  possibleExplanation: string;
  recommendedResearch: string;
}

export interface Hypothesis {
  id: string;
  description: string;
  reason: string;
  supportingEvidence: string;
  confidence: number;
  recommendedExperiment: string;
  expectedPortfolioValue: string;
}

export interface BehaviourPromotion {
  behaviourName: string;
  evidence: string;
  confidencePct: number;
  validationStatus: string;
  promotionRecommendation: string;
}

export interface FailedIdea {
  title: string;
  type: "HYPOTHESIS" | "BEHAVIOUR" | "EXPERIMENT";
  reason: string;
  lessonLearned: string;
  rejectedAt: string;
}

export interface DarwinReportData {
  reportDate: string; // YYYY-MM-DD
  // Section 1
  tradesAnalysed: number;
  strategiesEvaluated: number;
  newBehavioursFound: number;
  behavioursConfirmed: number;
  behavioursRejected: number;
  modelsImproving: number;
  modelsDegrading: number;
  // Section 2
  behaviourDiscoveries: BehaviourDiscovery[];
  // Section 3
  strategyHealth: StrategyHealthStat[];
  // Section 4 — from Gap Discovery Engine
  openGaps: number;
  resolvedGaps: number;
  highestImpactGap: string;
  engineeringImprovements: string[];
  dashboardImprovements: string[];
  researchOpportunities: string[];
  // Section 6
  hypotheses: Hypothesis[];
  // Section 7
  behaviourPromotions: BehaviourPromotion[];
  // Section 8
  failedIdeas: FailedIdea[];
  // Section 9
  recommendedSprintTitle: string;
  recommendedSprintProblem: string;
  recommendedSprintSolution: string;
  recommendedSprintImpact: string;
  recommendedSprintDifficulty: string;
  recommendedSprintTime: string;
  // Section 10 — LLM-generated commentary
  darwinCommentary: string;
}

// ─── Lookback window (last 24 hours) ─────────────────────────────────────────

function lookbackMs(): number {
  return Date.now() - 24 * 60 * 60 * 1000;
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

// ─── Data gathering ───────────────────────────────────────────────────────────

async function gatherPaperTradeStats(db: NonNullable<Awaited<ReturnType<typeof getDb>>>) {
  const since = lookbackMs();
  const sinceDate = new Date(since);

  // Trades closed in the last 24 hours
  const recentTrades = await db
    .select()
    .from(paperTrades)
    .where(
      and(
        eq(paperTrades.status, "CLOSED"),
        gte(paperTrades.openedAt, sinceDate)
      )
    )
    .limit(200);

  // All-time trades per model for health stats
  const allTrades = await db
    .select()
    .from(paperTrades)
    .where(eq(paperTrades.status, "CLOSED"))
    .orderBy(desc(paperTrades.openedAt))
    .limit(500);

  return { recentTrades, allTrades };
}

async function gatherMonitorStats(db: NonNullable<Awaited<ReturnType<typeof getDb>>>) {
  const since = lookbackMs();
  const sinceDate = new Date(since);

  const evals = await db
    .select()
    .from(monitorEvaluations)
    .where(gte(monitorEvaluations.evaluatedAt, sinceDate))
    .orderBy(desc(monitorEvaluations.evaluatedAt))
    .limit(200);

  return evals;
}

async function gatherBehaviourStats(db: NonNullable<Awaited<ReturnType<typeof getDb>>>) {
  const since = lookbackMs();

  // New candidates discovered in last 24 hours
  const newCandidates = await db
    .select()
    .from(darwinCandidates)
    .where(gte(darwinCandidates.createdAt, new Date(since)))
    .limit(50);

  // Recently confirmed (governanceStage progressed beyond HYPOTHESIS)
  const confirmed = await db
    .select()
    .from(darwinCandidates)
    .where(
      and(
        sql`${darwinCandidates.governanceStage} NOT IN ('HYPOTHESIS', 'REJECTED')`,
        gte(darwinCandidates.updatedAt, new Date(since))
      )
    )
    .limit(20);

  // Recently rejected
  const rejected = await db
    .select()
    .from(darwinRejectionRegistry)
    .where(gte(darwinRejectionRegistry.createdAt, new Date(since)))
    .limit(20);

  // Market laws needing promotion review
  const provisionalLaws = await db
    .select()
    .from(marketLaws)
    .where(eq(marketLaws.admissionStatus, "PROVISIONAL"))
    .orderBy(desc(marketLaws.confidenceScore))
    .limit(10);

  // Behaviour library entries updated recently
  const recentBehaviours = await db
    .select()
    .from(behaviourLibrary)
    .where(gte(behaviourLibrary.lastUpdatedAt, new Date(since)))
    .limit(20);

  return { newCandidates, confirmed, rejected, provisionalLaws, recentBehaviours };
}

async function gatherStrategyControls(db: NonNullable<Awaited<ReturnType<typeof getDb>>>) {
  return db.select().from(portfolioStrategyControls).limit(10);
}

async function gatherOpenGaps(db: NonNullable<Awaited<ReturnType<typeof getDb>>>) {
  const openGapRows = await db
    .select()
    .from(gapCandidates)
    .where(eq(gapCandidates.status, "OPEN"))
    .orderBy(desc(gapCandidates.impactScore))
    .limit(10);

  const resolvedCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(gapCandidates)
    .where(eq(gapCandidates.status, "RESOLVED"));

  return { openGapRows, resolvedCount: resolvedCount[0]?.count ?? 0 };
}

// ─── Strategy health computation ──────────────────────────────────────────────

function computeStrategyHealth(
  allTrades: (typeof paperTrades.$inferSelect)[],
  controls: (typeof portfolioStrategyControls.$inferSelect)[]
): StrategyHealthStat[] {
  const models = ["A1", "A3", "B1", "SB1", "ORB-1", "S109-001"];
  const stats: StrategyHealthStat[] = [];

  for (const model of models) {
    const trades = allTrades.filter((t) => t.model === model);
    if (trades.length === 0) {
      stats.push({
        model,
        totalTrades: 0,
        wins: 0,
        losses: 0,
        winRate: 0,
        profitFactor: 0,
        avgR: 0,
        totalPnl: 0,
        maxDrawdown: 0,
        tradeFrequency: "0 trades/week",
        trend: "STABLE",
      });
      continue;
    }

    const wins = trades.filter((t) => parseFloat(t.pnl ?? "0") > 0);
    const losses = trades.filter((t) => parseFloat(t.pnl ?? "0") < 0);
    const totalPnl = trades.reduce((s, t) => s + parseFloat(t.pnl ?? "0"), 0);
    const grossWin = wins.reduce((s, t) => s + parseFloat(t.pnl ?? "0"), 0);
    const grossLoss = Math.abs(losses.reduce((s, t) => s + parseFloat(t.pnl ?? "0"), 0));
    const profitFactor = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? 999 : 0;
    const avgR =
      trades.reduce((s, t) => s + parseFloat(t.currentR ?? "0"), 0) / trades.length;

    // Max drawdown: running peak-to-trough
    let peak = 0;
    let running = 0;
    let maxDD = 0;
    for (const t of trades) {
      running += parseFloat(t.pnl ?? "0");
      if (running > peak) peak = running;
      const dd = peak - running;
      if (dd > maxDD) maxDD = dd;
    }

    // Trend: compare last 10 vs prior 10
    const last10 = trades.slice(0, 10);
    const prior10 = trades.slice(10, 20);
    const last10Pf =
      prior10.length > 0
        ? last10.filter((t) => parseFloat(t.pnl ?? "0") > 0).length / Math.max(last10.length, 1)
        : null;
    const prior10Pf =
      prior10.length > 0
        ? prior10.filter((t) => parseFloat(t.pnl ?? "0") > 0).length / Math.max(prior10.length, 1)
        : null;

    let trend: "IMPROVING" | "STABLE" | "DECLINING" = "STABLE";
    if (last10Pf !== null && prior10Pf !== null) {
      if (last10Pf > prior10Pf + 0.1) trend = "IMPROVING";
      else if (last10Pf < prior10Pf - 0.1) trend = "DECLINING";
    }

    // Trade frequency (per week, based on date range)
    const oldest = trades[trades.length - 1]?.openedAt;
    const newest = trades[0]?.openedAt;
    let freq = "N/A";
    if (oldest && newest) {
      const weeks = Math.max(
        1,
        (new Date(newest).getTime() - new Date(oldest).getTime()) / (7 * 24 * 3600 * 1000)
      );
      freq = `${(trades.length / weeks).toFixed(1)} trades/week`;
    }

    stats.push({
      model,
      totalTrades: trades.length,
      wins: wins.length,
      losses: losses.length,
      winRate: wins.length / trades.length,
      profitFactor,
      avgR,
      totalPnl,
      maxDrawdown: maxDD,
      tradeFrequency: freq,
      trend,
    });
  }

  return stats;
}

// ─── LLM-powered sections ─────────────────────────────────────────────────────

async function generateDarwinCommentary(data: Omit<DarwinReportData, "darwinCommentary">): Promise<string> {
  const stratSummary = data.strategyHealth
    .filter((s) => s.totalTrades > 0)
    .map(
      (s) =>
        `${s.model}: ${s.totalTrades} trades, WR=${(s.winRate * 100).toFixed(1)}%, PF=${s.profitFactor.toFixed(2)}, AvgR=${s.avgR.toFixed(2)}, Trend=${s.trend}`
    )
    .join("\n");

  const gapSummary = data.engineeringImprovements.slice(0, 3).join("; ");
  const topHypothesis = data.hypotheses[0]
    ? `${data.hypotheses[0].description} (confidence: ${data.hypotheses[0].confidence}%)`
    : "No new hypotheses generated today.";

  const prompt = `You are DARWIN, the autonomous quantitative research engine for Atlas OS, a MNQ futures trading system.

Write a professional quantitative research commentary for today's daily report (${data.reportDate}).

Context:
- Trades analysed today: ${data.tradesAnalysed}
- Strategies evaluated: ${data.strategiesEvaluated}
- New behaviours discovered: ${data.newBehavioursFound}
- Behaviours confirmed: ${data.behavioursConfirmed}
- Behaviours rejected: ${data.behavioursRejected}
- Models improving: ${data.modelsImproving}
- Models degrading: ${data.modelsDegrading}
- Open portfolio gaps: ${data.openGaps}
- Highest impact gap: ${data.highestImpactGap}
- Top hypothesis: ${topHypothesis}

Strategy health:
${stratSummary || "No trades recorded yet."}

Top engineering improvements needed:
${gapSummary || "None identified today."}

Write 3-5 paragraphs in the style of a quantitative hedge fund research report. Be specific, analytical, and explain WHY behaviours are occurring — not just WHAT happened. Reference specific models by name. Identify patterns in the data. Make actionable observations. Do not use bullet points. Write in complete paragraphs.`;

  try {
    const result = await invokeLLM({
      messages: [{ role: "user", content: prompt }],
      maxTokens: 800,
      model: "claude-3-5-haiku",
    });
    const msg = result.choices?.[0]?.message?.content;
    return (typeof msg === "string" ? msg : null) ?? "DARWIN commentary unavailable — LLM call failed.";
  } catch {
    return `DARWIN commentary unavailable for ${data.reportDate}. Manual review recommended.`;
  }
}

async function generateHypotheses(
  behaviourDiscoveries: BehaviourDiscovery[],
  strategyHealth: StrategyHealthStat[],
  reportDate: string
): Promise<Hypothesis[]> {
  if (behaviourDiscoveries.length === 0 && strategyHealth.every((s) => s.totalTrades === 0)) {
    return [];
  }

  const decliningModels = strategyHealth.filter((s) => s.trend === "DECLINING");
  const discoveries = behaviourDiscoveries.slice(0, 3);

  const prompt = `You are DARWIN, the autonomous quantitative research engine for Atlas OS.

Based on today's observations (${reportDate}), generate 2-3 research hypotheses.

Declining models: ${decliningModels.map((m) => m.model).join(", ") || "None"}
Recent behaviour discoveries: ${discoveries.map((d) => d.name).join(", ") || "None"}

For each hypothesis, respond with a JSON array of objects with these exact fields:
- id: string (format: "H-YYYYMMDD-N" where N is 1,2,3)
- description: string (one sentence)
- reason: string (why this hypothesis is worth investigating)
- supportingEvidence: string (what data supports it)
- confidence: number (0-100)
- recommendedExperiment: string (how to test it)
- expectedPortfolioValue: string (e.g. "+5% win rate if confirmed")

Respond with ONLY the JSON array, no other text.`;

  try {
    const result = await invokeLLM({
      messages: [{ role: "user", content: prompt }],
      maxTokens: 600,
      model: "claude-3-5-haiku",
      responseFormat: { type: "json_object" },
    });

    const msgRaw = result.choices?.[0]?.message?.content;
    const raw = (typeof msgRaw === "string" ? msgRaw : null) ?? "[]";
    // Try to parse as array or object with array property
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return [];
    }

    const arr: unknown[] = Array.isArray(parsed)
      ? parsed
      : Array.isArray((parsed as Record<string, unknown>).hypotheses)
      ? ((parsed as Record<string, unknown>).hypotheses as unknown[])
      : [];

    return arr.slice(0, 3).map((h: unknown) => {
      const obj = h as Record<string, unknown>;
      const dateTag = reportDate.replace(/-/g, "");
      return {
        id: String(obj.id ?? `H-${dateTag}-1`),
        description: String(obj.description ?? ""),
        reason: String(obj.reason ?? ""),
        supportingEvidence: String(obj.supportingEvidence ?? ""),
        confidence: Number(obj.confidence ?? 50),
        recommendedExperiment: String(obj.recommendedExperiment ?? ""),
        expectedPortfolioValue: String(obj.expectedPortfolioValue ?? ""),
      };
    });
  } catch {
    return [];
  }
}

// ─── Behaviour discoveries from darwin_candidates ─────────────────────────────

function buildBehaviourDiscoveries(
  newCandidates: (typeof darwinCandidates.$inferSelect)[]
): BehaviourDiscovery[] {
  return newCandidates.slice(0, 5).map((c) => ({
    name: c.behaviourClass ?? c.candidateId,
    description: c.behaviourDescription ?? "",
    evidence: c.supportingRegimes ?? "",
    sampleSize: c.occurrenceCount ?? 0,
    confidencePct: parseFloat(c.confidence ?? "0"),
    statisticalSignificance: (c.occurrenceCount ?? 0) >= 30 ? "Sufficient (n≥30)" : "Insufficient (n<30)",
    potentialImpact: c.estimatedPcs
      ? `PCS: ${c.estimatedPcs}`
      : "Unknown",
    relatedStrategies: c.supportingSessions ? c.supportingSessions.split(",").map((s: string) => s.trim()) : [],
    possibleExplanation: c.humanExplanation ?? "No causal hypothesis generated yet.",
    recommendedResearch: `Increase sample size to ≥30 observations and run forward validation.`,
  }));
}

// ─── Behaviour promotions from market_laws ────────────────────────────────────

function buildBehaviourPromotions(
  provisionalLaws: (typeof marketLaws.$inferSelect)[]
): BehaviourPromotion[] {
  return provisionalLaws
    .filter((l) => parseFloat(l.confidenceScore ?? "0") >= 70)
    .slice(0, 5)
    .map((l) => ({
      behaviourName: l.title,
      evidence: `${l.liveObservationsConsistent ?? 0} live observations consistent, ${l.liveObservationsContradicting ?? 0} contradicting`,
      confidencePct: parseFloat(l.confidenceScore ?? "0"),
      validationStatus: l.admissionStatus,
      promotionRecommendation:
        parseFloat(l.confidenceScore ?? "0") >= 80
          ? `RECOMMEND PROMOTION to ADMITTED — confidence ${l.confidenceScore}% exceeds 80% threshold`
          : `Continue monitoring — confidence ${l.confidenceScore}% below 80% promotion threshold`,
    }));
}

// ─── Failed ideas from rejection registry ────────────────────────────────────

function buildFailedIdeas(
  rejected: (typeof darwinRejectionRegistry.$inferSelect)[]
): FailedIdea[] {
  return rejected.slice(0, 5).map((r) => ({
    title: r.hypothesisSummary?.slice(0, 80) ?? r.rejectionId,
    type: "HYPOTHESIS" as const,
    reason: r.rejectionReason ?? "",
    lessonLearned: r.lessonLearned ?? "No lesson recorded.",
    rejectedAt: r.rejectedAt ? new Date(r.rejectedAt).toISOString().slice(0, 10) : "Unknown",
  }));
}

// ─── Recommended next sprint from gap candidates ──────────────────────────────

function buildRecommendedSprint(
  openGapRows: (typeof gapCandidates.$inferSelect)[]
): Pick<
  DarwinReportData,
  | "recommendedSprintTitle"
  | "recommendedSprintProblem"
  | "recommendedSprintSolution"
  | "recommendedSprintImpact"
  | "recommendedSprintDifficulty"
  | "recommendedSprintTime"
> {
  const top = openGapRows[0];
  if (!top) {
    return {
      recommendedSprintTitle: "No high-priority gaps identified",
      recommendedSprintProblem: "All known gaps are resolved or deferred.",
      recommendedSprintSolution: "Continue monitoring and run next gap analysis cycle.",
      recommendedSprintImpact: "Maintenance",
      recommendedSprintDifficulty: "LOW",
      recommendedSprintTime: "1 day",
    };
  }

  return {
    recommendedSprintTitle: `Address ${top.dimension.replace(/_/g, " ")}: ${top.title}`,
    recommendedSprintProblem: top.description,
    recommendedSprintSolution: top.expectedBenefit ?? "Investigate and resolve the identified gap.",
    recommendedSprintImpact: top.expectedBenefit ?? "Portfolio improvement",
    recommendedSprintDifficulty: top.effortEstimate ?? "MEDIUM",
    recommendedSprintTime:
      top.effortEstimate === "LOW"
        ? "1–2 days"
        : top.effortEstimate === "MEDIUM"
        ? "3–5 days"
        : top.effortEstimate === "SPRINT"
        ? "1–2 weeks"
        : "5–7 days",
  };
}

// ─── Markdown report builder ──────────────────────────────────────────────────

function buildMarkdownReport(data: DarwinReportData): string {
  const fmtPct = (n: number) => `${(n * 100).toFixed(1)}%`;
  const fmtPf = (n: number) => (n >= 999 ? "∞" : n.toFixed(2));

  const sections: string[] = [];

  // Header
  sections.push(`# DARWIN Daily Research Report — ${data.reportDate}`);
  sections.push(`\n> *Generated autonomously by DARWIN at ${new Date().toISOString()} UTC*`);
  sections.push(`> *Atlas OS — MNQ Futures Quantitative Research Platform*`);

  // ── Section 1: Executive Summary ──────────────────────────────────────────
  sections.push(`\n---\n\n## 1. Executive Summary`);
  sections.push(`\n| Metric | Value |`);
  sections.push(`|--------|-------|`);
  sections.push(`| Trades Analysed | ${data.tradesAnalysed} |`);
  sections.push(`| Strategies Evaluated | ${data.strategiesEvaluated} |`);
  sections.push(`| New Behaviours Discovered | ${data.newBehavioursFound} |`);
  sections.push(`| Behaviours Confirmed | ${data.behavioursConfirmed} |`);
  sections.push(`| Behaviours Rejected | ${data.behavioursRejected} |`);
  sections.push(`| Models Improving | ${data.modelsImproving} |`);
  sections.push(`| Models Degrading | ${data.modelsDegrading} |`);

  // ── Section 2: Market Behaviour Discoveries ───────────────────────────────
  sections.push(`\n---\n\n## 2. Market Behaviour Discoveries`);
  if (data.behaviourDiscoveries.length === 0) {
    sections.push(`\n*No statistically significant new behaviours discovered in the last 24 hours.*`);
  } else {
    for (const b of data.behaviourDiscoveries) {
      sections.push(`\n### ${b.name}`);
      sections.push(`\n**Description:** ${b.description}`);
      sections.push(`\n**Supporting Evidence:** ${b.evidence}`);
      sections.push(`\n| Field | Value |`);
      sections.push(`|-------|-------|`);
      sections.push(`| Sample Size | ${b.sampleSize} |`);
      sections.push(`| Confidence | ${b.confidencePct.toFixed(1)}% |`);
      sections.push(`| Statistical Significance | ${b.statisticalSignificance} |`);
      sections.push(`| Potential Portfolio Impact | ${b.potentialImpact} |`);
      sections.push(`| Related Strategies | ${b.relatedStrategies.join(", ") || "None"} |`);
      sections.push(`\n**Possible Explanation:** ${b.possibleExplanation}`);
      sections.push(`\n**Recommended Research:** ${b.recommendedResearch}`);
    }
  }

  // ── Section 3: Strategy Health ────────────────────────────────────────────
  sections.push(`\n---\n\n## 3. Strategy Health`);
  sections.push(`\n| Strategy | Trades | Win Rate | Profit Factor | Avg R | Total P&L | Drawdown | Frequency | Trend |`);
  sections.push(`|----------|--------|----------|---------------|-------|-----------|----------|-----------|-------|`);
  for (const s of data.strategyHealth) {
    const trendEmoji = s.trend === "IMPROVING" ? "↑" : s.trend === "DECLINING" ? "↓" : "→";
    sections.push(
      `| ${s.model} | ${s.totalTrades} | ${fmtPct(s.winRate)} | ${fmtPf(s.profitFactor)} | ${s.avgR.toFixed(2)}R | $${s.totalPnl.toFixed(0)} | $${s.maxDrawdown.toFixed(0)} | ${s.tradeFrequency} | ${trendEmoji} ${s.trend} |`
    );
  }

  // ── Section 4: Gap Discovery Results ─────────────────────────────────────
  sections.push(`\n---\n\n## 4. Gap Discovery Results`);
  sections.push(`\n| Metric | Value |`);
  sections.push(`|--------|-------|`);
  sections.push(`| Open Gaps | ${data.openGaps} |`);
  sections.push(`| Resolved Gaps | ${data.resolvedGaps} |`);
  sections.push(`| Highest Impact Gap | ${data.highestImpactGap} |`);
  if (data.engineeringImprovements.length > 0) {
    sections.push(`\n**Top Engineering Improvements:**`);
    for (const e of data.engineeringImprovements.slice(0, 3)) {
      sections.push(`- ${e}`);
    }
  }
  if (data.dashboardImprovements.length > 0) {
    sections.push(`\n**Top Dashboard Improvements:**`);
    for (const d of data.dashboardImprovements.slice(0, 3)) {
      sections.push(`- ${d}`);
    }
  }
  if (data.researchOpportunities.length > 0) {
    sections.push(`\n**Top Research Opportunities:**`);
    for (const r of data.researchOpportunities.slice(0, 3)) {
      sections.push(`- ${r}`);
    }
  }

  // ── Section 5: DARWIN Explanations ───────────────────────────────────────
  sections.push(`\n---\n\n## 5. DARWIN Explanations`);
  sections.push(`\n*DARWIN explains why observed behaviours are occurring, not just what happened.*`);
  if (data.behaviourDiscoveries.length > 0) {
    for (const b of data.behaviourDiscoveries.slice(0, 3)) {
      sections.push(`\n**${b.name}:** ${b.possibleExplanation}`);
    }
  } else {
    sections.push(`\n*No new behaviours to explain today. Existing Market Laws remain stable.*`);
  }

  // ── Section 6: Hypotheses Generated ──────────────────────────────────────
  sections.push(`\n---\n\n## 6. Hypotheses Generated`);
  if (data.hypotheses.length === 0) {
    sections.push(`\n*No new hypotheses generated today. Insufficient new observations.*`);
  } else {
    for (const h of data.hypotheses) {
      sections.push(`\n### ${h.id}: ${h.description}`);
      sections.push(`\n| Field | Value |`);
      sections.push(`|-------|-------|`);
      sections.push(`| Reason | ${h.reason} |`);
      sections.push(`| Supporting Evidence | ${h.supportingEvidence} |`);
      sections.push(`| Confidence | ${h.confidence}% |`);
      sections.push(`| Recommended Experiment | ${h.recommendedExperiment} |`);
      sections.push(`| Expected Portfolio Value | ${h.expectedPortfolioValue} |`);
    }
  }

  // ── Section 7: Behaviour Promotions ──────────────────────────────────────
  sections.push(`\n---\n\n## 7. Behaviour Promotions`);
  if (data.behaviourPromotions.length === 0) {
    sections.push(`\n*No behaviours currently meet the 70% confidence threshold for promotion review.*`);
  } else {
    for (const p of data.behaviourPromotions) {
      sections.push(`\n### ${p.behaviourName}`);
      sections.push(`\n- **Evidence:** ${p.evidence}`);
      sections.push(`- **Confidence:** ${p.confidencePct.toFixed(1)}%`);
      sections.push(`- **Validation Status:** ${p.validationStatus}`);
      sections.push(`- **Recommendation:** ${p.promotionRecommendation}`);
    }
  }

  // ── Section 8: Failed Ideas ───────────────────────────────────────────────
  sections.push(`\n---\n\n## 8. Failed Ideas`);
  sections.push(`\n*Permanent record of rejected hypotheses and invalidated behaviours.*`);
  if (data.failedIdeas.length === 0) {
    sections.push(`\n*No ideas rejected in the last 24 hours.*`);
  } else {
    sections.push(`\n| Title | Type | Reason | Lesson Learned | Rejected |`);
    sections.push(`|-------|------|--------|----------------|----------|`);
    for (const f of data.failedIdeas) {
      sections.push(`| ${f.title} | ${f.type} | ${f.reason.slice(0, 80)} | ${f.lessonLearned.slice(0, 80)} | ${f.rejectedAt} |`);
    }
  }

  // ── Section 9: Recommended Next Sprint ───────────────────────────────────
  sections.push(`\n---\n\n## 9. Recommended Next Sprint`);
  sections.push(`\n**Sprint Title:** ${data.recommendedSprintTitle}`);
  sections.push(`\n| Field | Value |`);
  sections.push(`|-------|-------|`);
  sections.push(`| Problem | ${data.recommendedSprintProblem} |`);
  sections.push(`| Proposed Solution | ${data.recommendedSprintSolution} |`);
  sections.push(`| Expected Portfolio Improvement | ${data.recommendedSprintImpact} |`);
  sections.push(`| Difficulty | ${data.recommendedSprintDifficulty} |`);
  sections.push(`| Estimated Research Time | ${data.recommendedSprintTime} |`);

  // ── Section 10: DARWIN Commentary ────────────────────────────────────────
  sections.push(`\n---\n\n## 10. DARWIN Commentary`);
  sections.push(`\n${data.darwinCommentary}`);

  // Footer
  sections.push(`\n---\n\n*End of DARWIN Daily Research Report — ${data.reportDate}*`);
  sections.push(`*Atlas OS | DARWIN Autonomous Research Engine | Sprint 116*`);

  return sections.join("\n");
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export async function generateDarwinDailyReport(
  targetDate?: string
): Promise<{ reportDate: string; markdown: string; dbId: number }> {
  const start = Date.now();
  const reportDate = targetDate ?? todayStr();

  const db = await getDb();
  if (!db) throw new Error("Database unavailable — cannot generate DARWIN daily report");

  // ── Gather all data ────────────────────────────────────────────────────────
  const [
    { recentTrades, allTrades },
    monitorEvals,
    { newCandidates, confirmed, rejected, provisionalLaws, recentBehaviours },
    controls,
    { openGapRows, resolvedCount },
  ] = await Promise.all([
    gatherPaperTradeStats(db),
    gatherMonitorStats(db),
    gatherBehaviourStats(db),
    gatherStrategyControls(db),
    gatherOpenGaps(db),
  ]);

  // ── Run Gap Discovery Engine for today's gap data ─────────────────────────
  let gapResult;
  try {
    gapResult = await runGapDiscoveryEngine();
    await persistGapReport(gapResult);
  } catch {
    gapResult = null;
  }

  // ── Compute strategy health ────────────────────────────────────────────────
  const strategyHealth = computeStrategyHealth(allTrades, controls);
  const modelsImproving = strategyHealth.filter((s) => s.trend === "IMPROVING").length;
  const modelsDegrading = strategyHealth.filter((s) => s.trend === "DECLINING").length;

  // ── Build behaviour discoveries ────────────────────────────────────────────
  const behaviourDiscoveries = buildBehaviourDiscoveries(newCandidates);

  // ── Build behaviour promotions ─────────────────────────────────────────────
  const behaviourPromotions = buildBehaviourPromotions(provisionalLaws);

  // ── Build failed ideas ─────────────────────────────────────────────────────
  const failedIdeas = buildFailedIdeas(rejected);

  // ── Gap data ───────────────────────────────────────────────────────────────
  const highestImpactGap = openGapRows[0]?.title ?? "No open gaps";
  const engineeringImprovements =
    gapResult?.findings
      .filter((f) => f.dimension === "EXECUTION_BOTTLENECK" || f.dimension === "DATA_QUALITY")
      .slice(0, 5)
      .map((f) => f.title) ?? openGapRows.filter((g) => g.dimension === "EXECUTION_BOTTLENECK").map((g) => g.title).slice(0, 5);
  const dashboardImprovements =
    gapResult?.findings
      .filter((f) => f.dimension === "DASHBOARD_BLIND_SPOT")
      .slice(0, 5)
      .map((f) => f.title) ?? openGapRows.filter((g) => g.dimension === "DASHBOARD_BLIND_SPOT").map((g) => g.title).slice(0, 5);
  const researchOpportunities =
    gapResult?.findings
      .filter((f) => f.dimension === "RESEARCH_BOTTLENECK" || f.dimension === "LOW_CONFIDENCE_LAW")
      .slice(0, 5)
      .map((f) => f.title) ?? openGapRows.filter((g) => g.dimension === "RESEARCH_BOTTLENECK").map((g) => g.title).slice(0, 5);

  // ── Build recommended sprint ───────────────────────────────────────────────
  const sprintRec = buildRecommendedSprint(openGapRows);

  // ── Generate hypotheses (LLM) ──────────────────────────────────────────────
  const hypotheses = await generateHypotheses(behaviourDiscoveries, strategyHealth, reportDate);

  // ── Assemble partial data (without commentary) ─────────────────────────────
  const partialData: Omit<DarwinReportData, "darwinCommentary"> = {
    reportDate,
    tradesAnalysed: recentTrades.length,
    strategiesEvaluated: monitorEvals.length,
    newBehavioursFound: newCandidates.length,
    behavioursConfirmed: confirmed.length,
    behavioursRejected: rejected.length,
    modelsImproving,
    modelsDegrading,
    behaviourDiscoveries,
    strategyHealth,
    openGaps: openGapRows.length,
    resolvedGaps: resolvedCount,
    highestImpactGap,
    engineeringImprovements,
    dashboardImprovements,
    researchOpportunities,
    hypotheses,
    behaviourPromotions,
    failedIdeas,
    ...sprintRec,
  };

  // ── Generate LLM commentary ────────────────────────────────────────────────
  const darwinCommentary = await generateDarwinCommentary(partialData);

  const fullData: DarwinReportData = { ...partialData, darwinCommentary };

  // ── Build Markdown ─────────────────────────────────────────────────────────
  const markdown = buildMarkdownReport(fullData);

  // ── Persist to database ────────────────────────────────────────────────────
  const durationMs = Date.now() - start;
  const row: InsertDarwinDailyReport = {
    reportDate,
    tradesAnalysed: fullData.tradesAnalysed,
    strategiesEvaluated: fullData.strategiesEvaluated,
    newBehavioursFound: fullData.newBehavioursFound,
    behavioursConfirmed: fullData.behavioursConfirmed,
    behavioursRejected: fullData.behavioursRejected,
    modelsImproving: fullData.modelsImproving,
    modelsDegrading: fullData.modelsDegrading,
    reportMarkdown: markdown,
    githubCommitStatus: "PENDING",
    generatedBy: "DARWIN",
    generationDurationMs: durationMs,
    generatedAt: Date.now(),
  };

  // Upsert: if report for this date already exists, update it
  const existing = await db
    .select({ id: darwinDailyReports.id })
    .from(darwinDailyReports)
    .where(eq(darwinDailyReports.reportDate, reportDate))
    .limit(1);

  let dbId: number;
  if (existing.length > 0) {
    await db
      .update(darwinDailyReports)
      .set({ ...row, createdAt: undefined })
      .where(eq(darwinDailyReports.reportDate, reportDate));
    dbId = existing[0].id;
  } else {
    const result = await db.insert(darwinDailyReports).values(row);
    dbId = (result as unknown as { insertId: number }).insertId ?? 0;
  }

  console.log(
    `[DARWIN] Daily report generated for ${reportDate} in ${durationMs}ms (id=${dbId})`
  );

  return { reportDate, markdown, dbId };
}

export async function updateReportGithubStatus(
  dbId: number,
  sha: string,
  url: string,
  status: "SUCCESS" | "FAILED"
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db
    .update(darwinDailyReports)
    .set({
      githubCommitSha: sha,
      githubCommitUrl: url,
      githubCommitStatus: status,
    })
    .where(eq(darwinDailyReports.id, dbId));
}
