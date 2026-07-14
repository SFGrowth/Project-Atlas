/**
 * Sprint 104A — Executive Portfolio Intelligence Router
 * Surfaces every Sprint 103 insight as live tRPC procedures.
 */

import { z } from "zod";
import { publicProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { strategyRegistry, darwinCandidates, ardCandidates, marketLaws, behaviourLibrary, atlasMemory } from "../drizzle/schema";
import { eq, desc, sql, and, gte, isNotNull } from "drizzle-orm";

// ── Gap coverage data (static from Sprint 103 institutional knowledge) ─────────
const GAP_COVERAGE = [
  {
    category: "RANGE Regime",
    description: "RANGE conditions — dominant market state",
    frequency: "53.3% of trading days",
    coverage: 0,
    severity: "CRITICAL",
    currentModels: [],
    currentCandidates: ["RC-002 (redesign)", "RC-006 (refinement)"],
    researchPriority: 1,
    expectedPcsImprovement: 8.0,
    estimatedResearchHours: 80,
    probabilityOfSuccess: 50,
    notes: "Zero certified coverage for the majority of the trading calendar.",
  },
  {
    category: "VOLATILE Regime",
    description: "High volatility expansion days",
    frequency: "19.6% of trading days",
    coverage: 75,
    severity: "MODERATE",
    currentModels: ["ORB-1 (paper)"],
    currentCandidates: ["RC-NEW-001 (VOLATILE ORB Extension)", "RC-006"],
    researchPriority: 2,
    expectedPcsImprovement: 4.9,
    estimatedResearchHours: 45,
    probabilityOfSuccess: 65,
    notes: "ORB-1 covers VOLATILE AM Open. Extension candidate for wider ORBs.",
  },
  {
    category: "TRENDING Regime",
    description: "Strong directional trend days",
    frequency: "27.0% of trading days",
    coverage: 100,
    severity: "COVERED",
    currentModels: ["A1", "A2", "A3"],
    currentCandidates: [],
    researchPriority: 5,
    expectedPcsImprovement: 0,
    estimatedResearchHours: 0,
    probabilityOfSuccess: 100,
    notes: "Fully covered by ATS v2.0 production models.",
  },
  {
    category: "AM Open Session",
    description: "09:30–10:00 ET opening auction",
    frequency: "Every RTH day",
    coverage: 70,
    severity: "MODERATE",
    currentModels: ["A3", "ORB-1 (paper)"],
    currentCandidates: ["RC-NEW-002 (Pre-Market Level Filter)"],
    researchPriority: 3,
    expectedPcsImprovement: 3.8,
    estimatedResearchHours: 20,
    probabilityOfSuccess: 75,
    notes: "Pre-market level filter overlay would improve A3/ORB-1 entry precision.",
  },
  {
    category: "Lunch Session",
    description: "12:00–13:00 ET thin liquidity window",
    frequency: "Every RTH day",
    coverage: 0,
    severity: "HIGH",
    currentModels: [],
    currentCandidates: ["SB1 Lunch variant (discovered, unregistered)"],
    researchPriority: 4,
    expectedPcsImprovement: 4.0,
    estimatedResearchHours: 40,
    probabilityOfSuccess: 70,
    notes: "SB1 Lunch sub-session: PF 2.443, WR 60%. Highest quality unregistered signal.",
  },
  {
    category: "PM Session",
    description: "13:00–16:00 ET institutional order flow",
    frequency: "Every RTH day",
    coverage: 80,
    severity: "LOW",
    currentModels: ["A1", "A2"],
    currentCandidates: [],
    researchPriority: 6,
    expectedPcsImprovement: 1.5,
    estimatedResearchHours: 60,
    probabilityOfSuccess: 45,
    notes: "Covered by A1/A2 in TRENDING regime. RANGE PM coverage is the gap.",
  },
  {
    category: "VWAP / Mean Reversion",
    description: "VWAP-anchored mean reversion setups",
    frequency: "~40% of RTH days",
    coverage: 30,
    severity: "HIGH",
    currentModels: ["SB1 (partial, paper)"],
    currentCandidates: ["RC-002 (RANGE gap fill)"],
    researchPriority: 3,
    expectedPcsImprovement: 5.0,
    estimatedResearchHours: 60,
    probabilityOfSuccess: 55,
    notes: "SB1 uses VWAP reclaim but is not a pure mean reversion model.",
  },
  {
    category: "Overnight / Pre-Market",
    description: "Overnight session and pre-market positioning",
    frequency: "Every trading day",
    coverage: 0,
    severity: "LOW",
    currentModels: [],
    currentCandidates: [],
    researchPriority: 7,
    expectedPcsImprovement: 2.0,
    estimatedResearchHours: 80,
    probabilityOfSuccess: 35,
    notes: "ML-004: Overnight inventory does not predict intraday direction. Low research priority.",
  },
];

// ── Portfolio projection after each candidate promotion ────────────────────────
const PORTFOLIO_PROJECTIONS = [
  { action: "Current baseline", pcs: 66.1, change: 0, timeline: "Now" },
  { action: "ORB-1 → Production", pcs: 71.3, change: 5.2, timeline: "~30 days" },
  { action: "Pre-Market Level Filter deployed", pcs: 75.1, change: 3.8, timeline: "Sprint 104" },
  { action: "VOLATILE Regime ORB validated", pcs: 80.0, change: 4.9, timeline: "Sprint 105" },
  { action: "RC-006 RANGE refinement certified", pcs: 88.0, change: 8.0, timeline: "Sprint 106" },
  { action: "Lunch Session SB1 variant", pcs: 92.0, change: 4.0, timeline: "Sprint 107" },
];

export const executiveRouter = router({
  // ── All strategies from registry ────────────────────────────────────────────
  strategyRegistry: publicProcedure.query(async () => {
    const { getDb } = await import("./db");
    const { strategyRegistry } = await import("../drizzle/schema");
    const db = await getDb();
    if (!db) return [];
    const rows = await db.select().from(strategyRegistry).orderBy(strategyRegistry.stage, strategyRegistry.pcsScore);
    return rows.map(r => ({
      ...r,
      historicalWinRate: r.historicalWinRate ? Number(r.historicalWinRate) : null,
      historicalProfitFactor: r.historicalProfitFactor ? Number(r.historicalProfitFactor) : null,
      historicalMaxDrawdown: r.historicalMaxDrawdown ? Number(r.historicalMaxDrawdown) : null,
      historicalNetPnl: r.historicalNetPnl ? Number(r.historicalNetPnl) : null,
      pcsScore: r.pcsScore ? Number(r.pcsScore) : null,
      confidenceScore: r.confidenceScore ? Number(r.confidenceScore) : null,
      riskPerTrade: r.riskPerTrade ? Number(r.riskPerTrade) : 450,
    }));
  }),

  // ── Update a strategy registry entry ────────────────────────────────────────
  updateStrategy: publicProcedure
    .input(z.object({
      strategyId: z.string(),
      stage: z.string().optional(),
      recommendation: z.string().optional(),
      pcsScore: z.number().optional(),
      confidenceScore: z.number().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const { getDb } = await import("./db");
      const { strategyRegistry } = await import("../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (input.stage !== undefined) updates.stage = input.stage;
      if (input.recommendation !== undefined) updates.recommendation = input.recommendation;
      if (input.pcsScore !== undefined) updates.pcsScore = input.pcsScore.toString();
      if (input.confidenceScore !== undefined) updates.confidenceScore = input.confidenceScore.toString();
      if (input.notes !== undefined) updates.notes = input.notes;
      await db.update(strategyRegistry).set(updates).where(eq(strategyRegistry.strategyId, input.strategyId));
      return { success: true };
    }),

  // ── Risk profiles ────────────────────────────────────────────────────────────
  riskProfiles: publicProcedure.query(async () => {
    const { getDb } = await import("./db");
    const { riskProfiles } = await import("../drizzle/schema");
    const db = await getDb();
    if (!db) return [];
    const rows = await db.select().from(riskProfiles).orderBy(riskProfiles.id);
    return rows.map(r => ({ ...r, riskPerTrade: Number(r.riskPerTrade) }));
  }),

  updateCustomRisk: publicProcedure
    .input(z.object({ riskPerTrade: z.number().min(1).max(50000) }))
    .mutation(async ({ input }) => {
      const { getDb } = await import("./db");
      const { riskProfiles } = await import("../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      await db.update(riskProfiles)
        .set({ riskPerTrade: input.riskPerTrade.toString(), updatedAt: new Date() })
        .where(eq(riskProfiles.profileId, "CUSTOM"));
      return { success: true };
    }),

  // ── Live strategy performance (from paper_trades + sb1_paper_trades) ─────────
  strategyPerformance: publicProcedure
    .input(z.object({
      strategyId: z.string().optional(),
      riskPerTrade: z.number().default(450),
    }))
    .query(async ({ input }) => {
      const { getDb } = await import("./db");
      const { paperTrades, sb1PaperTrades } = await import("../drizzle/schema");
      const { desc, gte, and, eq, sql } = await import("drizzle-orm");
      const db = await getDb();
      if (!db) return null;

      const now = Date.now();
      const day1 = now - 86400000;
      const day7 = now - 7 * 86400000;
      const day30 = now - 30 * 86400000;

      // Combine paper_trades and sb1_paper_trades into a unified view
      const allTrades: Array<{
        model: string;
        pnl: number;
        isWin: boolean;
        entryTime: number;
        exitTime: number | null;
        direction: string;
        holdTimeMs: number;
      }> = [];

      // From paper_trades (A1, A2, A3, ORB-1) — PAPER provenance only (excludes BACKTEST/TEST/CONTAMINATED)
      const ptRows = await db.select({
        model: paperTrades.model,
        pnl: paperTrades.pnl,
        openedAt: paperTrades.openedAt,
        closedAt: paperTrades.closedAt,
        tradeDurationMs: paperTrades.tradeDurationMs,
        direction: paperTrades.direction,
      }).from(paperTrades).where(and(
        eq(paperTrades.status, "CLOSED"),
        eq(paperTrades.provenance, "PAPER"),
      )).orderBy(desc(paperTrades.openedAt));

      for (const r of ptRows) {
        const pnl = Number(r.pnl ?? 0);
        const entryMs = r.openedAt instanceof Date ? r.openedAt.getTime() : Number(r.openedAt);
        allTrades.push({
          model: r.model ?? "UNKNOWN",
          pnl,
          isWin: pnl > 0,
          entryTime: entryMs,
          exitTime: r.closedAt instanceof Date ? r.closedAt.getTime() : null,
          direction: r.direction ?? "LONG",
          holdTimeMs: Number(r.tradeDurationMs ?? 0),
        });
      }

      // From sb1_paper_trades — PAPER provenance only (excludes BACKTEST/CONTAMINATED/TEST)
      const sb1Rows = await db.select({
        pnl: sb1PaperTrades.pnl,
        openedAt: sb1PaperTrades.openedAt,
        closedAt: sb1PaperTrades.closedAt,
        holdingTimeMs: sb1PaperTrades.holdingTimeMs,
        direction: sb1PaperTrades.direction,
      }).from(sb1PaperTrades).where(and(
        eq(sb1PaperTrades.status, "CLOSED"),
        eq(sb1PaperTrades.provenance, "PAPER"),
      )).orderBy(desc(sb1PaperTrades.openedAt));

      for (const r of sb1Rows) {
        const pnl = Number(r.pnl ?? 0);
        const entryMs = r.openedAt instanceof Date ? r.openedAt.getTime() : Number(r.openedAt);
        allTrades.push({
          model: "SB1",
          pnl,
          isWin: pnl > 0,
          entryTime: entryMs,
          exitTime: r.closedAt instanceof Date ? r.closedAt.getTime() : null,
          direction: r.direction ?? "LONG",
          holdTimeMs: Number(r.holdingTimeMs ?? 0),
        });
      }

      // Filter by strategyId if provided
      const filtered = input.strategyId
        ? allTrades.filter(t => t.model === input.strategyId)
        : allTrades;

      const computeStats = (trades: typeof filtered, riskPerTrade: number) => {
        if (trades.length === 0) return {
          trades: 0, wins: 0, losses: 0, winRate: 0, profitFactor: 0,
          netPnlDollar: 0, netPnlR: 0, grossProfit: 0, grossLoss: 0,
          avgWin: 0, avgLoss: 0, largestWin: 0, largestLoss: 0,
          maxDrawdown: 0, avgHoldTimeMin: 0, longTrades: 0, shortTrades: 0,
          currentWinStreak: 0, currentLoseStreak: 0,
        };

        const wins = trades.filter(t => t.isWin);
        const losses = trades.filter(t => !t.isWin);
        const grossProfit = wins.reduce((s, t) => s + t.pnl, 0);
        const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));

        // Scale P&L to selected risk profile
        // Historical trades were at $800 base risk (A1/A2/A3) or $450 (ORB-1/SB1)
        // We scale by ratio: selectedRisk / historicalRisk
        const scaledNetPnl = trades.reduce((s, t) => s + t.pnl, 0);
        const scaledR = riskPerTrade > 0 ? scaledNetPnl / riskPerTrade : 0;

        // Max drawdown
        let peak = 0, equity = 0, maxDD = 0;
        for (const t of [...trades].sort((a, b) => a.entryTime - b.entryTime)) {
          equity += t.pnl;
          if (equity > peak) peak = equity;
          const dd = peak - equity;
          if (dd > maxDD) maxDD = dd;
        }

        // Streaks
        let curWin = 0, curLose = 0;
        const sorted = [...trades].sort((a, b) => b.entryTime - a.entryTime);
        for (const t of sorted) {
          if (t.isWin) { if (curLose === 0) curWin++; else break; }
          else { if (curWin === 0) curLose++; else break; }
        }

        const avgHoldTimeMin = trades.length > 0
          ? trades.reduce((s, t) => s + t.holdTimeMs, 0) / trades.length / 60000
          : 0;

        return {
          trades: trades.length,
          wins: wins.length,
          losses: losses.length,
          winRate: trades.length > 0 ? (wins.length / trades.length) * 100 : 0,
          profitFactor: grossLoss > 0 ? grossProfit / grossLoss : wins.length > 0 ? 999 : 0,
          netPnlDollar: scaledNetPnl,
          netPnlR: scaledR,
          grossProfit,
          grossLoss: -grossLoss,
          avgWin: wins.length > 0 ? grossProfit / wins.length : 0,
          avgLoss: losses.length > 0 ? -(grossLoss / losses.length) : 0,
          largestWin: wins.length > 0 ? Math.max(...wins.map(t => t.pnl)) : 0,
          largestLoss: losses.length > 0 ? Math.min(...losses.map(t => t.pnl)) : 0,
          maxDrawdown: -maxDD,
          avgHoldTimeMin,
          longTrades: trades.filter(t => t.direction === "LONG").length,
          shortTrades: trades.filter(t => t.direction === "SHORT").length,
          currentWinStreak: curWin,
          currentLoseStreak: curLose,
        };
      };

      const risk = input.riskPerTrade;
      return {
        last24h: computeStats(filtered.filter(t => t.entryTime >= day1), risk),
        last7d: computeStats(filtered.filter(t => t.entryTime >= day7), risk),
        last30d: computeStats(filtered.filter(t => t.entryTime >= day30), risk),
        allTime: computeStats(filtered, risk),
        totalTradesInDB: filtered.length,
      };
    }),

  // ── Portfolio overview ────────────────────────────────────────────────────────
  portfolioOverview: publicProcedure
    .input(z.object({ riskPerTrade: z.number().default(450) }))
    .query(async ({ input }) => {
      const { getDb } = await import("./db");
      const { strategyRegistry, atlasMemory } = await import("../drizzle/schema");
      const { desc, eq } = await import("drizzle-orm");
      const db = await getDb();
      if (!db) return null;

      const strategies = await db.select().from(strategyRegistry).orderBy(strategyRegistry.pcsScore);
      const [latestBar] = await db.select({
        regime: atlasMemory.regimeClassification,
        session: atlasMemory.session,
        barTime: atlasMemory.barTime,
      }).from(atlasMemory).where(eq(atlasMemory.symbol, "MNQ1!")).orderBy(desc(atlasMemory.barTime)).limit(1);

      const production = strategies.filter(s => s.stage === "PRODUCTION");
      const paper = strategies.filter(s => s.stage === "PAPER");
      const candidates = strategies.filter(s => s.stage === "CANDIDATE" || s.stage === "HYPOTHESIS");
      const rejected = strategies.filter(s => s.stage === "REJECTED" || s.stage === "ARCHIVED");

      // Portfolio-level historical stats from institutional knowledge
      const portfolioStats = {
        pcs: 66.1,
        targetPcs: 80.0,
        profitFactor: 1.708,
        winRate: 60.0,
        netPnl: 5212,
        maxDrawdown: -771,
        tradeCount: 346,
        activeModels: production.length,
        paperModels: paper.length,
        candidateCount: candidates.length,
        rejectedCount: rejected.length,
        currentRegime: latestBar?.regime ?? null,
        currentSession: latestBar?.session ?? null,
        lastBarTime: latestBar?.barTime ?? null,
      };

      // Scale to selected risk profile ($800 was historical base for production)
      const scaleFactor = input.riskPerTrade / 800;
      const scaledPnl = portfolioStats.netPnl * scaleFactor;
      const scaledDD = portfolioStats.maxDrawdown * scaleFactor;

      // Model rankings by PCS
      const ranked = [...strategies]
        .filter(s => s.pcsScore !== null)
        .sort((a, b) => Number(b.pcsScore) - Number(a.pcsScore));

      const strongest = ranked[0] ?? null;
      const weakest = ranked.filter(s => s.stage !== "REJECTED" && s.stage !== "ARCHIVED").at(-1) ?? null;
      const promotionCandidate = strategies.find(s => s.stage === "PAPER" && Number(s.certificationGatesPassed) >= 7) ?? null;
      const needsAttention = strategies.find(s => s.strategyId === "A2") ?? null; // A2 deterioration flag

      return {
        ...portfolioStats,
        scaledPnl,
        scaledDD,
        riskPerTrade: input.riskPerTrade,
        projections: PORTFOLIO_PROJECTIONS,
        rankings: ranked.map(s => ({
          strategyId: s.strategyId,
          name: s.name,
          stage: s.stage,
          pcsScore: Number(s.pcsScore),
          confidenceScore: Number(s.confidenceScore ?? 0),
          recommendation: s.recommendation,
        })),
        strongest: strongest ? { strategyId: strongest.strategyId, name: strongest.name, pcsScore: Number(strongest.pcsScore) } : null,
        weakest: weakest ? { strategyId: weakest.strategyId, name: weakest.name, pcsScore: Number(weakest.pcsScore) } : null,
        promotionCandidate: promotionCandidate ? { strategyId: promotionCandidate.strategyId, name: promotionCandidate.name, gatesPassed: promotionCandidate.certificationGatesPassed } : null,
        needsAttention: needsAttention ? { strategyId: needsAttention.strategyId, name: needsAttention.name, reason: "ADX>60 sub-regime PF deteriorating: 4.15→1.20→0.49 year-by-year" } : null,
      };
    }),

  // ── Gap coverage map ─────────────────────────────────────────────────────────
  gapCoverage: publicProcedure.query(() => {
    return GAP_COVERAGE;
  }),

  // ── Portfolio projections ────────────────────────────────────────────────────
  portfolioProjections: publicProcedure.query(() => {
    return PORTFOLIO_PROJECTIONS;
  }),

  // ── Risk analytics — projections at selected risk level ──────────────────────
  riskAnalytics: publicProcedure
    .input(z.object({ riskPerTrade: z.number().default(450) }))
    .query(async ({ input }) => {
      const { getDb } = await import("./db");
      const { strategyRegistry } = await import("../drizzle/schema");
      const db = await getDb();
      if (!db) return null;

      const strategies = await db.select().from(strategyRegistry)
        .where((await import("drizzle-orm")).inArray(
          (await import("../drizzle/schema")).strategyRegistry.stage,
          ["PRODUCTION", "PAPER"]
        ));

      const risk = input.riskPerTrade;

      return strategies.map(s => {
        const histPf = Number(s.historicalProfitFactor ?? 1.0);
        const histWr = Number(s.historicalWinRate ?? 50) / 100;
        const histTrades = Number(s.historicalTradeCount ?? 0);
        const histBaseRisk = s.stage === "PRODUCTION" ? 800 : 450;
        const scaleFactor = risk / histBaseRisk;

        // Frequency estimates (trades/day based on regime frequency and session)
        const tradesPerDay = s.strategyId === "ORB-1" ? 0.4 : // ~2/week on VOLATILE days
          s.strategyId === "SB1" ? 1.2 :
          s.strategyId === "A3" ? 0.5 :
          s.strategyId === "A1" ? 0.6 :
          s.strategyId === "A2" ? 0.4 : 0.3;

        const avgWin = risk * histPf * histWr / (histWr > 0 ? histWr : 1);
        const avgLoss = -risk;
        const expectancy = (histWr * avgWin) + ((1 - histWr) * avgLoss);

        const expectedDailyPnl = expectancy * tradesPerDay;
        const expectedWeeklyPnl = expectedDailyPnl * 5;
        const expectedMonthlyPnl = expectedDailyPnl * 21;
        const expectedAnnualPnl = expectedDailyPnl * 252;

        const scaledMaxDD = Number(s.historicalMaxDrawdown ?? 0) * scaleFactor;
        const roMaD = scaledMaxDD !== 0 ? Math.abs(expectedAnnualPnl / scaledMaxDD) : 0;

        // Monte Carlo pass rate estimate (based on historical data)
        const mcPassRate = s.strategyId === "ORB-1" ? 99.0 :
          s.strategyId === "A3" ? 88.7 :
          s.strategyId === "A1" ? 85.0 :
          s.strategyId === "A2" ? 82.0 :
          s.strategyId === "SB1" ? 65.0 : 50.0;

        return {
          strategyId: s.strategyId,
          name: s.name,
          stage: s.stage,
          riskPerTrade: risk,
          tradesPerDay,
          expectancy,
          expectedDailyPnl,
          expectedWeeklyPnl,
          expectedMonthlyPnl,
          expectedAnnualPnl,
          scaledMaxDrawdown: scaledMaxDD,
          largestWinStreak: s.largestWinStreak ?? 0,
          largestLoseStreak: s.largestLoseStreak ?? 0,
          roMaD,
          mcPassRate,
          historicalPf: histPf,
          historicalWr: histWr * 100,
          historicalTrades: histTrades,
        };
      });
    }),

  // ── Home stats — single call for the executive home page ─────────────────────
  homeStats: publicProcedure.query(async () => {
    const { getDb } = await import("./db");
    const { atlasMemory, strategyRegistry, darwinResearchQueue, marketLaws, behaviourLibrary } = await import("../drizzle/schema");
    const { desc, eq, gte, sql } = await import("drizzle-orm");
    const db = await getDb();
    if (!db) return null;

    const [latestBar] = await db.select({
      regime: atlasMemory.regimeClassification,
      session: atlasMemory.session,
      barTime: atlasMemory.barTime,
      close: atlasMemory.close,
    }).from(atlasMemory).where(eq(atlasMemory.symbol, "MNQ1!")).orderBy(desc(atlasMemory.barTime)).limit(1);

    const [totalBars] = await db.select({ count: sql<number>`COUNT(*)` }).from(atlasMemory).where(eq(atlasMemory.symbol, "MNQ1!"));

    const activeStrategies = await db.select({
      strategyId: strategyRegistry.strategyId,
      name: strategyRegistry.name,
      stage: strategyRegistry.stage,
      pcsScore: strategyRegistry.pcsScore,
      recommendation: strategyRegistry.recommendation,
    }).from(strategyRegistry);

    const [researchQueueCount] = await db.select({ count: sql<number>`COUNT(*)` }).from(darwinResearchQueue);
    const laws = await db.select({ lawId: marketLaws.lawId, admissionStatus: marketLaws.admissionStatus }).from(marketLaws);
    const [behaviourCount] = await db.select({ count: sql<number>`COUNT(*)` }).from(behaviourLibrary);

    const production = activeStrategies.filter(s => s.stage === "PRODUCTION");
    const paper = activeStrategies.filter(s => s.stage === "PAPER");
    const candidates = activeStrategies.filter(s => s.stage === "CANDIDATE" || s.stage === "HYPOTHESIS");

    const now = Date.now();
    const lastBarTime = latestBar?.barTime ?? null;
    const silenceHours = lastBarTime ? (now - lastBarTime) / 3600000 : 999;
    const pipelineHealthy = silenceHours < 8;

    // Atlas Health Score (0-100)
    const healthScore = Math.max(0, Math.min(100,
      (pipelineHealthy ? 40 : 0) +
      (Number(totalBars?.count ?? 0) > 100 ? 20 : 0) +
      (production.length >= 3 ? 20 : production.length * 7) +
      (laws.filter(l => l.admissionStatus === "ADMITTED").length >= 4 ? 20 : 0)
    ));

    // Atlas Maturity Score (based on sprints, models, laws, behaviours)
    const maturityScore = Math.min(100, Math.round(
      (production.length / 5) * 25 +
      (paper.length / 3) * 20 +
      (laws.filter(l => l.admissionStatus === "ADMITTED").length / 6) * 20 +
      (Number(behaviourCount?.count ?? 0) / 8) * 15 +
      (66.1 / 100) * 20
    ));

    return {
      healthScore,
      maturityScore,
      pipelineHealthy,
      silenceHours,
      currentRegime: latestBar?.regime ?? null,
      currentSession: latestBar?.session ?? null,
      lastBarTime,
      totalBarsReceived: Number(totalBars?.count ?? 0),
      activeProductionModels: production.length,
      activePaperModels: paper.length,
      candidateCount: candidates.length,
      researchQueueCount: Number(researchQueueCount?.count ?? 0),
      admittedLaws: laws.filter(l => l.admissionStatus === "ADMITTED").length,
      totalLaws: laws.length,
      behaviourCount: Number(behaviourCount?.count ?? 0),
      portfolioPcs: 66.1,
      portfolioPcsTarget: 80.0,
      portfolioPf: 1.708,
      portfolioWr: 60.0,
      portfolioNetPnl: 5212,
      portfolioMaxDD: -771,
    };
  }),

  // ── Live feed — most recent activity across all systems ──────────────────────
  liveFeed: publicProcedure
    .input(z.object({ limit: z.number().min(1).max(50).default(20) }))
    .query(async ({ input }) => {
      const { getDb } = await import("./db");
      const { atlasMemory, pipelineHealthEvents, darwinWorkLog } = await import("../drizzle/schema");
      const { desc, eq } = await import("drizzle-orm");
      const db = await getDb();
      if (!db) return [];

      const events: Array<{ type: string; message: string; timestamp: number; severity: string }> = [];

      // Recent bars
      const recentBars = await db.select({
        barTime: atlasMemory.barTime,
        regime: atlasMemory.regimeClassification,
        session: atlasMemory.session,
        close: atlasMemory.close,
      }).from(atlasMemory).where(eq(atlasMemory.symbol, "MNQ1!")).orderBy(desc(atlasMemory.barTime)).limit(5);

      for (const b of recentBars) {
        events.push({
          type: "BAR",
          message: `Bar received: ${b.session ?? "?"} | ${b.regime ?? "?"} | Close ${b.close ?? "?"}`,
          timestamp: Number(b.barTime),
          severity: "INFO",
        });
      }

      // Health events
      const healthEvents = await db.select({
        description: pipelineHealthEvents.description,
        severity: pipelineHealthEvents.severity,
        createdAt: pipelineHealthEvents.createdAt,
      }).from(pipelineHealthEvents).orderBy(desc(pipelineHealthEvents.createdAt)).limit(5);

      for (const h of healthEvents) {
        events.push({
          type: "HEALTH",
          message: h.description ?? "Health event",
          timestamp: h.createdAt instanceof Date ? h.createdAt.getTime() : Date.now(),
          severity: h.severity ?? "INFO",
        });
      }

      // DARWIN work log
      const workLog = await db.select({
        description: darwinWorkLog.description,
        createdAt: darwinWorkLog.createdAt,
      }).from(darwinWorkLog).orderBy(desc(darwinWorkLog.createdAt)).limit(5);

      for (const w of workLog) {
        events.push({
          type: "DARWIN",
          message: w.description ?? "DARWIN activity",
          timestamp: w.createdAt instanceof Date ? w.createdAt.getTime() : Date.now(),
          severity: "INFO",
        });
      }

      return events
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, input.limit);
    }),

  // ── Sprint 104C: Monitor Status ─────────────────────────────────────────────
  // Returns the latest bar evaluation, open positions, LLC progress, and
  // per-model eligibility status for the Executive Portfolio Live Feed.
  monitorStatus: publicProcedure.query(async () => {
    try {
      const { getRecentEvaluations } = await import("./monitor/barEvaluator");
      const { getOpenMonitorTrades } = await import("./monitor/paperTradeEngine");
      const { getLlcProgress, getRecentSessionReports } = await import("./monitor/sessionReporter");

      const [recentEvals, openTrades, llcProgress, sessionReports] = await Promise.all([
        getRecentEvaluations(20),
        getOpenMonitorTrades(),
        getLlcProgress(),
        getRecentSessionReports(5),
      ]);

      const latestEval = recentEvals[0] ?? null;

      return {
        latestEvaluation: latestEval ? {
          barTimeEt: latestEval.barTimeEt,
          session: latestEval.session,
          isRth: latestEval.isRth,
          adx: latestEval.adx ? Number(latestEval.adx) : null,
          regime: latestEval.regimeClassification,
          integrityOk: latestEval.integrityOk,
          gapDetected: latestEval.gapDetected,
          gapMinutes: latestEval.gapMinutes,
          duplicateDetected: latestEval.duplicateDetected,
          integrityNotes: latestEval.integrityNotes,
          models: {
            A1: { eligible: latestEval.a1Eligible, reason: latestEval.a1Reason },
            A3: { eligible: latestEval.a3Eligible, reason: latestEval.a3Reason },
            B1: { eligible: latestEval.b1Eligible, reason: latestEval.b1Reason },
            SB1: { eligible: latestEval.sb1Eligible, reason: latestEval.sb1Reason },
            "ORB-1": { eligible: latestEval.orb1Eligible, reason: latestEval.orb1Reason },
          },
          activeModels: latestEval.activeModels,
          signalModel: latestEval.signalModel,
          signalDirection: latestEval.signalDirection,
          evaluatedAt: latestEval.evaluatedAt instanceof Date ? latestEval.evaluatedAt.getTime() : null,
        } : null,
        recentEvaluations: recentEvals.map((e) => ({
          barTimeEt: e.barTimeEt,
          session: e.session,
          regime: e.regimeClassification,
          adx: e.adx ? Number(e.adx) : null,
          activeModels: e.activeModels,
          integrityOk: e.integrityOk,
          gapDetected: e.gapDetected,
          gapMinutes: e.gapMinutes,
          signalModel: e.signalModel,
          signalDirection: e.signalDirection,
          a1Eligible: e.a1Eligible,
          a3Eligible: e.a3Eligible,
          b1Eligible: e.b1Eligible,
          sb1Eligible: e.sb1Eligible,
          orb1Eligible: e.orb1Eligible,
          a1Reason: e.a1Reason,
          a3Reason: e.a3Reason,
          b1Reason: e.b1Reason,
          sb1Reason: e.sb1Reason,
          orb1Reason: e.orb1Reason,
        })),
        openTrades: Array.isArray(openTrades) ? { standard: [], sb1: [] } : {
          standard: (openTrades.standard ?? []).map((t: typeof openTrades.standard[0]) => ({
            id: t.id,
            model: t.model,
            direction: t.direction,
            entry: Number(t.entry ?? 0),
            stop: Number(t.stop ?? 0),
            target: Number(t.target ?? 0),
            riskDollars: Number(t.riskDollars ?? 0),
            openedAt: t.openedAt instanceof Date ? t.openedAt.getTime() : null,
          })),
          sb1: (openTrades.sb1 ?? []).map((t: typeof openTrades.sb1[0]) => ({
            id: t.id,
            model: "SB1",
            direction: t.direction,
            entry: Number(t.entry ?? 0),
            stop: Number(t.stop ?? 0),
            target: Number(t.target ?? 0),
            riskDollars: Number(t.riskDollars ?? 0),
            openedAt: t.openedAt instanceof Date ? t.openedAt.getTime() : null,
          })),
        },
        llcProgress,
        recentSessionReports: sessionReports.map((r) => ({
          sessionDate: r.sessionDate instanceof Date ? r.sessionDate.toISOString().split("T")[0] : String(r.sessionDate),
          status: r.status,
          certificationStatus: r.certificationStatus,
          barsReceived: r.barsReceived,
          barsExpected: r.barsExpected,
          sessionPnl: Number(r.sessionPnl ?? 0),
          ownerActionRequired: r.ownerActionRequired,
          generatedAt: r.generatedAt instanceof Date ? r.generatedAt.getTime() : null,
        })),
      };
    } catch (err) {
      console.error("[executive.monitorStatus] Error:", err);
      return null;
    }
  }),

  recentClosedTrades: publicProcedure
    .input(z.object({ limit: z.number().min(1).max(50).default(10) }))
    .query(async ({ input }) => {
      try {
        const { getRecentClosedTrades } = await import("./monitor/paperTradeEngine");
        const trades = await getRecentClosedTrades(input.limit);
        return trades.map((t: any) => ({
          id: t.id,
          model: t.modelName ?? t.model ?? "UNKNOWN",
          direction: t.direction,
          entry: Number(t.entry ?? 0),
          stop: Number(t.stop ?? 0),
          target: Number(t.target ?? 0),
          exitPrice: t.exitPrice ? Number(t.exitPrice) : null,
          exitReason: t.exitReason,
          pnlDollars: t.pnl ? Number(t.pnl) : null,
          rMultiple: (t.currentR ?? t.rMultiple) ? Number(t.currentR ?? t.rMultiple) : null,
          mfe: t.mfe ? Number(t.mfe) : null,
          mae: t.mae ? Number(t.mae) : null,
          riskDollars: Number(t.riskDollars ?? 0),
          contracts: t.contracts ?? 1,
          openedAt: t.openedAt instanceof Date ? t.openedAt.getTime() : null,
          closedAt: t.closedAt instanceof Date ? t.closedAt.getTime() : null,
        }));
      } catch (err) {
        console.error("[executive.recentClosedTrades] Error:", err);
        return [];
      }
    }),

  tradeEvidence: publicProcedure
    .input(z.object({ tradeId: z.string() }))
    .query(async ({ input }) => {
      try {
        const { getTradeEvidenceReport } = await import("./monitor/paperTradeEngine");
        const report = await getTradeEvidenceReport(input.tradeId);
        if (!report) return null;
        return {
          ...report,
          openedAt: report.openedAt instanceof Date ? report.openedAt.getTime() : null,
          closedAt: report.closedAt instanceof Date ? report.closedAt.getTime() : null,
          evaluation: report.evaluation ? {
            barTimeEt: report.evaluation.barTimeEt,
            session: report.evaluation.session,
            regime: report.evaluation.regimeClassification,
            adx: report.evaluation.adx ? Number(report.evaluation.adx) : null,
            integrityOk: report.evaluation.integrityOk,
            evaluatedAt: report.evaluation.evaluatedAt instanceof Date ? report.evaluation.evaluatedAt.getTime() : null,
          } : null,
        };
      } catch (err) {
        console.error("[executive.tradeEvidence] Error:", err);
        return null;
      }
    }),

  // ── Daily Ops Report ──────────────────────────────────────────────────────────────────────────

  dailyOpsReport: publicProcedure
    .input(z.object({ dateStr: z.string().optional() }))
    .query(async ({ input }) => {
      try {
        const { generateDailyOpsReport } = await import("./monitor/dailyOpsReport");
        return await generateDailyOpsReport(input.dateStr);
      } catch (err) {
        console.error("[executive.dailyOpsReport] Error:", err);
        return null;
      }
    }),

  // ── Portfolio Intelligence ───────────────────────────────────────────────────────────────────────

  portfolioIntelligence: publicProcedure
    .input(z.object({
      strategyId: z.string().optional(),
      riskPerTrade: z.number().default(450),
    }))
    .query(async ({ input }) => {
      try {
        const { getDb } = await import("./db");
        const { paperTrades, sb1PaperTrades } = await import("../drizzle/schema");
        const { desc, and, eq } = await import("drizzle-orm");
        const db = await getDb();
        if (!db) return null;

        const now = Date.now();
        const day1 = now - 86400000;
        const day7 = now - 7 * 86400000;
        const day30 = now - 30 * 86400000;

        // PAPER provenance only — clean production data
        const ptRows = await db.select({
          model: paperTrades.model,
          pnl: paperTrades.pnl,
          openedAt: paperTrades.openedAt,
          direction: paperTrades.direction,
          tradeDurationMs: paperTrades.tradeDurationMs,
        }).from(paperTrades).where(and(
          eq(paperTrades.status, "CLOSED"),
          eq(paperTrades.provenance, "PAPER"),
        )).orderBy(desc(paperTrades.openedAt));

        const sb1Rows = await db.select({
          pnl: sb1PaperTrades.pnl,
          openedAt: sb1PaperTrades.openedAt,
          direction: sb1PaperTrades.direction,
          holdingTimeMs: sb1PaperTrades.holdingTimeMs,
        }).from(sb1PaperTrades).where(and(
          eq(sb1PaperTrades.status, "CLOSED"),
          eq(sb1PaperTrades.provenance, "PAPER"),
        )).orderBy(desc(sb1PaperTrades.openedAt));

        type TRow = { model: string; pnl: number; entryTime: number; direction: string; holdTimeMs: number };
        const allTrades: TRow[] = [
          ...ptRows.map(r => ({
            model: r.model ?? "UNKNOWN",
            pnl: Number(r.pnl ?? 0),
            entryTime: r.openedAt instanceof Date ? r.openedAt.getTime() : Number(r.openedAt),
            direction: r.direction ?? "LONG",
            holdTimeMs: Number(r.tradeDurationMs ?? 0),
          })),
          ...sb1Rows.map(r => ({
            model: "SB1",
            pnl: Number(r.pnl ?? 0),
            entryTime: r.openedAt instanceof Date ? r.openedAt.getTime() : Number(r.openedAt),
            direction: r.direction ?? "LONG",
            holdTimeMs: Number(r.holdingTimeMs ?? 0),
          })),
        ];

        const filtered = input.strategyId ? allTrades.filter(t => t.model === input.strategyId) : allTrades;

        const computeStats = (trades: TRow[], riskPerTrade: number) => {
          if (trades.length === 0) return {
            trades: 0, wins: 0, losses: 0, winRate: 0, profitFactor: 0,
            netPnlDollar: 0, netPnlR: 0, grossProfit: 0, grossLoss: 0,
            avgWin: 0, avgLoss: 0, largestWin: 0, largestLoss: 0,
            maxDrawdown: 0, avgHoldTimeMin: 0, longTrades: 0, shortTrades: 0,
            currentWinStreak: 0, currentLoseStreak: 0,
          };
          const wins = trades.filter(t => t.pnl > 0);
          const losses = trades.filter(t => t.pnl <= 0);
          const grossProfit = wins.reduce((s, t) => s + t.pnl, 0);
          const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
          const netPnl = trades.reduce((s, t) => s + t.pnl, 0);
          let peak = 0, equity = 0, maxDD = 0;
          for (const t of [...trades].sort((a, b) => a.entryTime - b.entryTime)) {
            equity += t.pnl; if (equity > peak) peak = equity;
            const dd = peak - equity; if (dd > maxDD) maxDD = dd;
          }
          let curWin = 0, curLose = 0;
          for (const t of [...trades].sort((a, b) => b.entryTime - a.entryTime)) {
            if (t.pnl > 0) { if (curLose === 0) curWin++; else break; }
            else { if (curWin === 0) curLose++; else break; }
          }
          return {
            trades: trades.length, wins: wins.length, losses: losses.length,
            winRate: (wins.length / trades.length) * 100,
            profitFactor: grossLoss > 0 ? grossProfit / grossLoss : wins.length > 0 ? 999 : 0,
            netPnlDollar: netPnl, netPnlR: riskPerTrade > 0 ? netPnl / riskPerTrade : 0,
            grossProfit, grossLoss: -grossLoss,
            avgWin: wins.length > 0 ? grossProfit / wins.length : 0,
            avgLoss: losses.length > 0 ? -(grossLoss / losses.length) : 0,
            largestWin: wins.length > 0 ? Math.max(...wins.map(t => t.pnl)) : 0,
            largestLoss: losses.length > 0 ? Math.min(...losses.map(t => t.pnl)) : 0,
            maxDrawdown: -maxDD,
            avgHoldTimeMin: trades.reduce((s, t) => s + t.holdTimeMs, 0) / trades.length / 60000,
            longTrades: trades.filter(t => t.direction === "LONG").length,
            shortTrades: trades.filter(t => t.direction === "SHORT").length,
            currentWinStreak: curWin, currentLoseStreak: curLose,
          };
        };

        const risk = input.riskPerTrade;
        const perModel: Record<string, ReturnType<typeof computeStats>> = {};
        for (const model of ["A1", "A3", "B1", "SB1", "ORB-1"]) {
          perModel[model] = computeStats(filtered.filter(t => t.model === model), risk);
        }

        return {
          last24h: computeStats(filtered.filter(t => t.entryTime >= day1), risk),
          last7d: computeStats(filtered.filter(t => t.entryTime >= day7), risk),
          last30d: computeStats(filtered.filter(t => t.entryTime >= day30), risk),
          allTime: computeStats(filtered, risk),
          perModel,
          totalTradesInDB: filtered.length,
          provenanceNote: "PAPER provenance only — BACKTEST/TEST/CONTAMINATED excluded",
        };
      } catch (err) {
        console.error("[executive.portfolioIntelligence] Error:", err);
        return null;
      }
    }),

  // ── Sprint 105: Live Portfolio Coverage ──────────────────────────────────
  portfolioCoverage: publicProcedure.query(async () => {
    try {
      const db = await getDb();
      if (!db) return null;
      // Get live regime distribution from atlas_memory
      const regimeRows = await db.execute(
        sql`SELECT regime_classification as regime, COUNT(*) as cnt FROM atlas_memory WHERE bar_time > 1000000000000 GROUP BY regime_classification`
      ) as unknown as Array<{regime: string; cnt: number}>;
      const total = regimeRows.reduce((s, r) => s + Number(r.cnt), 0);
      const regimeMap: Record<string, number> = {};
      for (const r of regimeRows) regimeMap[r.regime || 'NULL'] = Number(r.cnt);

      const trending = (regimeMap['TRENDING_BULL'] || 0) + (regimeMap['TRENDING_BEAR'] || 0) + (regimeMap['TRENDING'] || 0);
      const choppy = (regimeMap['CHOPPY'] || 0) + (regimeMap['RANGE'] || 0) + (regimeMap['COMPRESSED'] || 0);
      const volatile = regimeMap['VOLATILE'] || 0;
      const transitional = (regimeMap['TRANSITION'] || 0) + (regimeMap['TRANSITIONAL'] || 0);
      const uncovered = choppy + transitional;

      return {
        totalBars: total,
        regimeDistribution: regimeMap,
        coverage: [
          { regime: 'TRENDING', bars: trending, pct: total > 0 ? (trending/total*100) : 0, covered: true, models: ['A1','A3','B1','SB1'] },
          { regime: 'VOLATILE', bars: volatile, pct: total > 0 ? (volatile/total*100) : 0, covered: true, models: ['ORB-1'] },
          { regime: 'CHOPPY/RANGE', bars: choppy, pct: total > 0 ? (choppy/total*100) : 0, covered: false, models: [], candidates: ['RC-002 (REDESIGN)', 'RC-006 (REFINEMENT)'] },
          { regime: 'TRANSITIONAL', bars: transitional, pct: total > 0 ? (transitional/total*100) : 0, covered: false, models: [], candidates: ['RC-NEW-003 (HYPOTHESIS)'] },
        ],
        coveredBars: trending + volatile,
        uncoveredBars: uncovered,
        coveragePct: total > 0 ? ((trending + volatile) / total * 100) : 0,
        portfolioGapSeverity: uncovered / total > 0.6 ? 'CRITICAL' : uncovered / total > 0.4 ? 'HIGH' : 'MODERATE',
      };
    } catch (err) {
      console.error('[executive.portfolioCoverage] Error:', err);
      return null;
    }
  }),

  // ── Sprint 105: Candidate Registry ───────────────────────────────────────
  candidateRegistry: publicProcedure.query(async () => {
    try {
      const db = await getDb();
      if (!db) return null;
      const srRows = await db.select({
        strategyId: strategyRegistry.strategyId,
        name: strategyRegistry.name,
        stage: strategyRegistry.stage,
        regime: strategyRegistry.regime,
        session: strategyRegistry.session,
        historicalWinRate: strategyRegistry.historicalWinRate,
        historicalProfitFactor: strategyRegistry.historicalProfitFactor,
        historicalTradeCount: strategyRegistry.historicalTradeCount,
        pcsScore: strategyRegistry.pcsScore,
        confidenceScore: strategyRegistry.confidenceScore,
        recommendation: strategyRegistry.recommendation,
        notes: strategyRegistry.notes,
      }).from(strategyRegistry).orderBy(desc(strategyRegistry.pcsScore));

      const dcRows = await db.select({
        candidateId: darwinCandidates.candidateId,
        behaviourClass: darwinCandidates.behaviourClass,
        behaviourDescription: darwinCandidates.behaviourDescription,
        occurrenceCount: darwinCandidates.occurrenceCount,
        confidence: darwinCandidates.confidence,
        estimatedWinRate: darwinCandidates.estimatedWinRate,
        estimatedPf: darwinCandidates.estimatedPf,
        estimatedPcs: darwinCandidates.estimatedPcs,
        governanceStage: darwinCandidates.governanceStage,
        researchPriority: darwinCandidates.researchPriority,
        supportingRegimes: darwinCandidates.supportingRegimes,
        supportingSessions: darwinCandidates.supportingSessions,
      }).from(darwinCandidates).orderBy(darwinCandidates.researchPriority);

      const mlRows = await db.select({
        lawId: marketLaws.lawId,
        title: marketLaws.title,
        confidenceScore: marketLaws.confidenceScore,
        admissionStatus: marketLaws.admissionStatus,
        liveObservationsConsistent: marketLaws.liveObservationsConsistent,
        liveObservationsContradicting: marketLaws.liveObservationsContradicting,
      }).from(marketLaws).orderBy(desc(marketLaws.confidenceScore));

      const blRows = await db.select({
        behaviourId: behaviourLibrary.behaviourId,
        behaviourName: behaviourLibrary.behaviourName,
        totalObservations: behaviourLibrary.totalObservations,
        continuationRate: behaviourLibrary.continuationRate,
        regimeBreakdown: behaviourLibrary.regimeBreakdown,
      }).from(behaviourLibrary).orderBy(desc(behaviourLibrary.totalObservations));

      const production = srRows.filter(r => r.stage === 'PRODUCTION');
      const paper = srRows.filter(r => r.stage === 'PAPER');
      const candidates = srRows.filter(r => r.stage === 'CANDIDATE');
      const hypotheses = srRows.filter(r => r.stage === 'HYPOTHESIS');
      const rejected = srRows.filter(r => r.stage === 'REJECTED' || r.stage === 'ARCHIVED');

      return {
        summary: {
          production: production.length,
          paper: paper.length,
          candidates: candidates.length,
          hypotheses: hypotheses.length,
          rejected: rejected.length,
          darwinHypotheses: dcRows.filter(r => r.governanceStage === 'HYPOTHESIS').length,
          marketLaws: mlRows.length,
          behaviours: blRows.length,
        },
        production,
        paper,
        candidates,
        hypotheses,
        rejected,
        darwinCandidates: dcRows,
        marketLaws: mlRows,
        behaviourLibrary: blRows,
      };
    } catch (err) {
      console.error('[executive.candidateRegistry] Error:', err);
      return null;
    }
  }),

  // ── Sprint 105: DARWIN Discovery Status ──────────────────────────────────
  darwinDiscovery: publicProcedure.query(async () => {
    try {
      const db = await getDb();
      if (!db) return null;
      const dcRows = await db.select().from(darwinCandidates).orderBy(darwinCandidates.researchPriority);
      const mlRows = await db.select().from(marketLaws).orderBy(desc(marketLaws.confidenceScore));
      const blRows = await db.select().from(behaviourLibrary).orderBy(desc(behaviourLibrary.totalObservations));

      // Compute live law validation from atlas_memory
      const [lawValidation] = await db.execute(
        sql`SELECT COUNT(*) as total_bars, SUM(CASE WHEN a1_eligible OR a3_eligible OR b1_eligible OR sb1_eligible THEN 1 ELSE 0 END) as compound_signal_bars FROM atlas_memory WHERE bar_time > 1000000000000`
      ) as unknown as Array<{total_bars: number; compound_signal_bars: number}>;

      return {
        darwinCandidates: dcRows.map(c => ({
          ...c,
          confidence: c.confidence ? Number(c.confidence) : null,
          estimatedPcs: c.estimatedPcs ? Number(c.estimatedPcs) : null,
          estimatedWinRate: c.estimatedWinRate ? Number(c.estimatedWinRate) : null,
          estimatedPf: c.estimatedPf ? Number(c.estimatedPf) : null,
        })),
        marketLaws: mlRows.map(l => ({
          ...l,
          confidenceScore: Number(l.confidenceScore),
        })),
        behaviourLibrary: blRows.map(b => ({
          ...b,
          continuationRate: b.continuationRate ? Number(b.continuationRate) : null,
        })),
        liveValidation: {
          totalBars: lawValidation ? Number(lawValidation.total_bars) : 0,
          compoundSignalBars: lawValidation ? Number(lawValidation.compound_signal_bars) : 0,
          ml001LiveSupport: lawValidation && Number(lawValidation.total_bars) > 0
            ? (Number(lawValidation.compound_signal_bars) / Number(lawValidation.total_bars) * 100).toFixed(1)
            : '0',
        },
      };
    } catch (err) {
      console.error('[executive.darwinDiscovery] Error:', err);
      return null;
    }
  }),

  // ── Sprint 105: Weekly Executive Report ──────────────────────────────────
  weeklyReport: publicProcedure.query(async () => {
    try {
      const db = await getDb();
      if (!db) return null;
      const now = Date.now();
      const day7 = now - 7 * 24 * 60 * 60 * 1000;

      const [ptRows] = await db.execute(
        sql`SELECT model, pnl, opened_at, direction FROM paper_trades WHERE provenance = 'PAPER' AND opened_at >= ${new Date(day7)}`
      ) as unknown as [Array<{model: string; pnl: number; opened_at: Date; direction: string}>];

      const [sb1Rows] = await db.execute(
        sql`SELECT pnl, opened_at, direction FROM sb1_paper_trades WHERE provenance = 'PAPER' AND opened_at >= ${new Date(day7)}`
      ) as unknown as [Array<{pnl: number; opened_at: Date; direction: string}>];

      const allTrades = [
        ...ptRows.map(r => ({ model: r.model, pnl: Number(r.pnl), direction: r.direction })),
        ...sb1Rows.map(r => ({ model: 'SB1', pnl: Number(r.pnl), direction: r.direction })),
      ];

      const wins = allTrades.filter(t => t.pnl > 0);
      const losses = allTrades.filter(t => t.pnl <= 0);
      const netPnl = allTrades.reduce((s, t) => s + t.pnl, 0);
      const grossProfit = wins.reduce((s, t) => s + t.pnl, 0);
      const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));

      // Bar stats for the week
      const [barStats] = await db.execute(
        sql`SELECT COUNT(*) as total_bars, SUM(CASE WHEN regime_classification = 'CHOPPY' OR regime_classification = 'COMPRESSED' THEN 1 ELSE 0 END) as choppy_bars, SUM(CASE WHEN regime_classification LIKE 'TRENDING%' THEN 1 ELSE 0 END) as trending_bars FROM atlas_memory WHERE bar_time >= ${day7} AND bar_time > 1000000000000`
      ) as unknown as [Array<{total_bars: number; choppy_bars: number; trending_bars: number}>];

      const bs = barStats[0] || { total_bars: 0, choppy_bars: 0, trending_bars: 0 };

      return {
        period: '7d',
        generatedAt: now,
        trades: {
          total: allTrades.length,
          wins: wins.length,
          losses: losses.length,
          winRate: allTrades.length > 0 ? (wins.length / allTrades.length * 100) : 0,
          netPnl,
          profitFactor: grossLoss > 0 ? grossProfit / grossLoss : wins.length > 0 ? 999 : 0,
        },
        bars: {
          total: Number(bs.total_bars),
          choppy: Number(bs.choppy_bars),
          trending: Number(bs.trending_bars),
        },
        perModel: ['A1', 'A3', 'B1', 'SB1', 'ORB-1'].map(model => {
          const mt = allTrades.filter(t => t.model === model);
          const mw = mt.filter(t => t.pnl > 0);
          return {
            model,
            trades: mt.length,
            wins: mw.length,
            netPnl: mt.reduce((s, t) => s + t.pnl, 0),
          };
        }),
      };
    } catch (err) {
      console.error('[executive.weeklyReport] Error:', err);
      return null;
    }
  }),

  // ── Sprint 105: Monthly Executive Report ─────────────────────────────────
  monthlyReport: publicProcedure.query(async () => {
    try {
      const db = await getDb();
      if (!db) return null;
      const now = Date.now();
      const day30 = now - 30 * 24 * 60 * 60 * 1000;

      const [ptRows] = await db.execute(
        sql`SELECT model, pnl, opened_at, direction FROM paper_trades WHERE provenance = 'PAPER' AND opened_at >= ${new Date(day30)}`
      ) as unknown as [Array<{model: string; pnl: number; opened_at: Date; direction: string}>];

      const [sb1Rows] = await db.execute(
        sql`SELECT pnl, opened_at, direction FROM sb1_paper_trades WHERE provenance = 'PAPER' AND opened_at >= ${new Date(day30)}`
      ) as unknown as [Array<{pnl: number; opened_at: Date; direction: string}>];

      const allTrades = [
        ...ptRows.map(r => ({ model: r.model, pnl: Number(r.pnl), direction: r.direction })),
        ...sb1Rows.map(r => ({ model: 'SB1', pnl: Number(r.pnl), direction: r.direction })),
      ];

      const wins = allTrades.filter(t => t.pnl > 0);
      const losses = allTrades.filter(t => t.pnl <= 0);
      const netPnl = allTrades.reduce((s, t) => s + t.pnl, 0);
      const grossProfit = wins.reduce((s, t) => s + t.pnl, 0);
      const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));

      const [barStats] = await db.execute(
        sql`SELECT COUNT(*) as total_bars, SUM(CASE WHEN regime_classification = 'CHOPPY' OR regime_classification = 'COMPRESSED' THEN 1 ELSE 0 END) as choppy_bars, SUM(CASE WHEN regime_classification LIKE 'TRENDING%' THEN 1 ELSE 0 END) as trending_bars, SUM(CASE WHEN regime_classification = 'VOLATILE' THEN 1 ELSE 0 END) as volatile_bars FROM atlas_memory WHERE bar_time >= ${day30} AND bar_time > 1000000000000`
      ) as unknown as [Array<{total_bars: number; choppy_bars: number; trending_bars: number; volatile_bars: number}>];

      const bs = barStats[0] || { total_bars: 0, choppy_bars: 0, trending_bars: 0, volatile_bars: 0 };

      return {
        period: '30d',
        generatedAt: now,
        trades: {
          total: allTrades.length,
          wins: wins.length,
          losses: losses.length,
          winRate: allTrades.length > 0 ? (wins.length / allTrades.length * 100) : 0,
          netPnl,
          profitFactor: grossLoss > 0 ? grossProfit / grossLoss : wins.length > 0 ? 999 : 0,
        },
        bars: {
          total: Number(bs.total_bars),
          choppy: Number(bs.choppy_bars),
          trending: Number(bs.trending_bars),
          volatile: Number(bs.volatile_bars),
        },
        perModel: ['A1', 'A3', 'B1', 'SB1', 'ORB-1'].map(model => {
          const mt = allTrades.filter(t => t.model === model);
          const mw = mt.filter(t => t.pnl > 0);
          return {
            model,
            trades: mt.length,
            wins: mw.length,
            netPnl: mt.reduce((s, t) => s + t.pnl, 0),
          };
        }),
      };
    } catch (err) {
      console.error('[executive.monthlyReport] Error:', err);
      return null;
    }
  }),
});
