/**
 * wfRouter.ts — tRPC procedures for Sprint 111 Walk-Forward Validation.
 * DARWIN-S109-001 (VWAP_ALIGNED_CONTINUATION) — frozen hypothesis.
 */
import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "./_core/trpc";
import {
  createWfLiveTrade,
  getOpenWfTrade,
  closeWfTrade,
  getRecentWfTrades,
  getAllClosedWfTrades,
  computeWfStats,
  checkAndFireDriftAlerts,
  upsertWfSession,
  getRecentWfSessions,
  getWfSessionCount,
  getActiveDriftAlerts,
  getRecentDriftAlerts,
  upsertWfDailyReport,
  getRecentWfDailyReports,
  getLatestWfDailyReport,
  evaluateS109001Signal,
  evaluateOpenTradeExit,
  S109_BENCHMARK,
  BarData,
} from "./wfDb";

export const wfRouter = router({
  // ── Read procedures ─────────────────────────────────────────────────────────

  getStats: publicProcedure.query(async () => {
    return computeWfStats();
  }),

  getOpenTrade: publicProcedure.query(async () => {
    return getOpenWfTrade();
  }),

  getRecentTrades: publicProcedure
    .input(z.object({ limit: z.number().min(1).max(200).default(50) }))
    .query(async ({ input }) => {
      return getRecentWfTrades(input.limit);
    }),

  getAllTrades: publicProcedure.query(async () => {
    return getAllClosedWfTrades();
  }),

  getRecentSessions: publicProcedure
    .input(z.object({ limit: z.number().min(1).max(90).default(30) }))
    .query(async ({ input }) => {
      return getRecentWfSessions(input.limit);
    }),

  getActiveDriftAlerts: publicProcedure.query(async () => {
    return getActiveDriftAlerts();
  }),

  getRecentDriftAlerts: publicProcedure
    .input(z.object({ limit: z.number().min(1).max(50).default(20) }))
    .query(async ({ input }) => {
      return getRecentDriftAlerts(input.limit);
    }),

  getRecentDailyReports: publicProcedure
    .input(z.object({ limit: z.number().min(1).max(90).default(30) }))
    .query(async ({ input }) => {
      return getRecentWfDailyReports(input.limit);
    }),

  getLatestDailyReport: publicProcedure.query(async () => {
    return getLatestWfDailyReport();
  }),

  getBenchmark: publicProcedure.query(() => {
    return S109_BENCHMARK;
  }),

  // ── Signal evaluation (called by the pipeline on each bar) ──────────────────

  evaluateBar: publicProcedure
    .input(z.object({
      barTimeEt: z.string(),
      tradeDate: z.string(),
      session: z.string(),
      regime: z.string().default("UNKNOWN"),
      close: z.number(),
      vwap: z.number(),
      atr14: z.number(),
      vwapSlope3Bar: z.number(),
      rsi14: z.number(),
      ovInventory: z.enum(["LONG", "SHORT", "NEUTRAL"]),
      pipelineRunId: z.string().optional(),
      atlasMemoryBarId: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const bar: BarData = input;

      // 1. Check for open trade — evaluate exit first
      const openTrade = await getOpenWfTrade();
      let tradeClosedId: string | null = null;

      if (openTrade) {
        const openedAt = new Date(openTrade.openedAt).getTime();
        const barMs = Date.now();
        const barsSinceEntry = Math.floor((barMs - openedAt) / (5 * 60 * 1000));

        const exitEval = evaluateOpenTradeExit(openTrade, bar, barsSinceEntry);
        if (exitEval?.shouldClose) {
          const entry = Number(openTrade.entryPrice ?? 0);
          const exitP = exitEval.exitPrice;
          const direction = openTrade.direction;
          const riskDollars = Number(openTrade.riskDollars ?? 450);
          const stopDist = Math.abs(entry - Number(openTrade.stopPrice ?? entry));
          const pnlPoints = direction === "LONG" ? exitP - entry : entry - exitP;
          const pnlDollar = stopDist > 0 ? (pnlPoints / stopDist) * riskDollars : 0;
          const pnlR = stopDist > 0 ? pnlPoints / stopDist : 0;
          const mfe = Math.max(0, direction === "LONG" ? bar.close - entry : entry - bar.close);
          const mae = Math.max(0, direction === "LONG" ? entry - bar.close : bar.close - entry);

          await closeWfTrade(openTrade.id, {
            exitPrice: String(exitP.toFixed(4)),
            exitReason: exitEval.exitReason as "TARGET_HIT" | "STOP_HIT" | "TIME_STOP" | "MANUAL",
            outcome: exitEval.outcome,
            pnlDollar: String(pnlDollar.toFixed(2)),
            pnlR: String(pnlR.toFixed(4)),
            mfe: String(mfe.toFixed(2)),
            mae: String(mae.toFixed(2)),
            holdingBars: barsSinceEntry,
            holdingMs: barMs - openedAt,
          });
          tradeClosedId = openTrade.id;
        }

        // Don't open a new trade while one is open (single-strategy rule)
        if (!exitEval?.shouldClose) {
          return { action: "MONITORING_OPEN_TRADE", openTradeId: openTrade.id, signal: null, tradeClosedId: null };
        }
      }

      // 2. Evaluate signal for new entry
      const signal = evaluateS109001Signal(bar);

      if (!signal.hasSignal) {
        return { action: "NO_SIGNAL", signal, tradeClosedId };
      }

      // 3. Open new paper trade
      const tradeId = await createWfLiveTrade({
        tradeDate: input.tradeDate as unknown as Date,
        barTimeEt: input.barTimeEt,
        session: input.session,
        regime: input.regime,
        ovInventory: input.ovInventory,
        vwapSlope: String(input.vwapSlope3Bar.toFixed(6)),
        rsi14: String(input.rsi14.toFixed(4)),
        atr14: String(input.atr14.toFixed(4)),
        vwapDeviation: String(signal.vwapDeviation.toFixed(4)),
        filterOvInventory: signal.filterOvInventory,
        filterVwapSlope: signal.filterVwapSlope,
        filterRsi: signal.filterRsi,
        direction: signal.direction!,
        entryPrice: String(signal.entryPrice!.toFixed(4)),
        stopPrice: String(signal.stopPrice!.toFixed(4)),
        targetPrice: String(signal.targetPrice!.toFixed(4)),
        status: "OPEN",
        riskDollars: "450",
        pipelineRunId: input.pipelineRunId,
        atlasMemoryBarId: input.atlasMemoryBarId,
        provenance: "PAPER",
        hypothesisId: "DARWIN-S109-001",
        hypothesisVersion: "1.0",
      });

      return { action: "TRADE_OPENED", tradeId, signal, tradeClosedId };
    }),

  // ── Manual trade entry (for testing / manual paper trades) ──────────────────

  manualTrade: protectedProcedure
    .input(z.object({
      tradeDate: z.string(),
      barTimeEt: z.string(),
      session: z.string().default("RTH"),
      regime: z.string().default("UNKNOWN"),
      direction: z.enum(["LONG", "SHORT"]),
      entryPrice: z.number(),
      stopPrice: z.number(),
      targetPrice: z.number(),
      ovInventory: z.enum(["LONG", "SHORT", "NEUTRAL"]),
      vwapSlope: z.number(),
      rsi14: z.number(),
      atr14: z.number(),
      vwapDeviation: z.number(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const tradeId = await createWfLiveTrade({
        tradeDate: input.tradeDate as unknown as Date,
        barTimeEt: input.barTimeEt,
        session: input.session,
        regime: input.regime,
        direction: input.direction,
        entryPrice: String(input.entryPrice.toFixed(4)),
        stopPrice: String(input.stopPrice.toFixed(4)),
        targetPrice: String(input.targetPrice.toFixed(4)),
        ovInventory: input.ovInventory,
        vwapSlope: String(input.vwapSlope.toFixed(6)),
        rsi14: String(input.rsi14.toFixed(4)),
        atr14: String(input.atr14.toFixed(4)),
        vwapDeviation: String(input.vwapDeviation.toFixed(4)),
        filterOvInventory: true,
        filterVwapSlope: true,
        filterRsi: true,
        status: "OPEN",
        riskDollars: "450",
        notes: input.notes,
        provenance: "PAPER",
        hypothesisId: "DARWIN-S109-001",
        hypothesisVersion: "1.0",
      });
      return { tradeId };
    }),

  // ── Close trade manually ─────────────────────────────────────────────────────

  closeTrade: protectedProcedure
    .input(z.object({
      id: z.string(),
      exitPrice: z.number(),
      exitReason: z.enum(["TARGET_HIT", "STOP_HIT", "TIME_STOP", "MANUAL"]),
      outcome: z.enum(["WIN", "LOSS", "BREAKEVEN"]),
      pnlDollar: z.number(),
      pnlR: z.number(),
      mfe: z.number().default(0),
      mae: z.number().default(0),
      holdingBars: z.number().default(0),
      holdingMs: z.number().default(0),
    }))
    .mutation(async ({ input }) => {
      await closeWfTrade(input.id, {
        exitPrice: String(input.exitPrice.toFixed(4)),
        exitReason: input.exitReason,
        outcome: input.outcome,
        pnlDollar: String(input.pnlDollar.toFixed(2)),
        pnlR: String(input.pnlR.toFixed(4)),
        mfe: String(input.mfe.toFixed(2)),
        mae: String(input.mae.toFixed(2)),
        holdingBars: input.holdingBars,
        holdingMs: input.holdingMs,
      });
      return { success: true };
    }),

  // ── Session close (called by heartbeat after RTH) ────────────────────────────

  closeSession: publicProcedure
    .input(z.object({
      sessionDate: z.string(),
      barsReceived: z.number().default(0),
    }))
    .mutation(async ({ input }) => {
      const stats = await computeWfStats();
      const sessionCount = await getWfSessionCount();

      // Fire drift alerts
      const newAlerts = await checkAndFireDriftAlerts(stats, input.sessionDate);

      // Build session record
      const sessionData = {
        sessionDate: input.sessionDate as unknown as Date,
        sessionNumber: sessionCount + 1,
        barsExpected: 78,
        barsReceived: input.barsReceived,
        signalsEvaluated: 0,
        signalsFiltered: 0,
        tradesOpened: 0,
        tradesClosed: 0,
        wins: 0,
        losses: 0,
        sessionPnl: "0",
        cumTrades: stats.totalTrades,
        cumWins: stats.wins,
        cumWinRate: stats.winRate > 0 ? String(stats.winRate.toFixed(4)) : null,
        cumPf: stats.pf > 0 ? String(stats.pf.toFixed(4)) : null,
        cumPnl: String(stats.totalPnl.toFixed(2)),
        cumMaxDd: String(stats.maxDd.toFixed(2)),
        driftDetected: newAlerts.length > 0,
        driftAlertIds: newAlerts.map(a => String(a.id)).join(",") || null,
        promotionGateStatus: stats.promotionGateStatus,
      };

      await upsertWfSession(sessionData);

      // Generate daily report
      const reportData = {
        reportDate: input.sessionDate as unknown as Date,
        sessionNumber: sessionCount + 1,
        pipelineHealth: "OK" as const,
        dashboardHealth: "OK" as const,
        dataIntegrity: "OK" as const,
        barsReceived: input.barsReceived,
        barsExpected: 78,
        signalsGenerated: 0,
        tradesOpened: 0,
        tradesClosed: 0,
        sessionWins: 0,
        sessionLosses: 0,
        sessionPnl: "0",
        sessionDrawdown: "0",
        liveWinRate: stats.winRate > 0 ? String(stats.winRate.toFixed(4)) : null,
        livePf: stats.pf > 0 ? String(stats.pf.toFixed(4)) : null,
        liveExpectancy: stats.totalTrades > 0 ? String((stats.totalPnl / stats.totalTrades).toFixed(2)) : null,
        liveMaxDd: String(stats.maxDd.toFixed(2)),
        driftDetected: newAlerts.length > 0,
        driftAlertCount: newAlerts.length,
        cumTradeCount: stats.totalTrades,
        calendarDaysElapsed: stats.calendarDaysElapsed,
        promotionGateStatus: stats.promotionGateStatus,
        reportJson: JSON.stringify({ stats, newAlerts, sessionDate: input.sessionDate }),
      };

      await upsertWfDailyReport(reportData);

      return { stats, newAlerts: newAlerts.length, sessionNumber: sessionCount + 1 };
    }),
});
