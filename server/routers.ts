import { COOKIE_NAME } from "@shared/const";
import { z } from "zod";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import {
  getLatestPipelineReport,
  getPipelineReportCount,
  getRecentPipelineReports,
  getPipelineReportById,
  getOpenPaperTrade,
  getRecentPaperTrades,
  getPaperTradeById,
  updatePaperTrade,
  getJournalDays,
  getJournalDayByDate,
  getRecentHealthEvents,
  getLastWebhookEvent,
  getRecentNotifications,
  getAnalyticsData,
  getAdeGovernanceLog,
  getAdeTradeStats,
} from "./db";
import {
  createSb1Trade,
  updateSb1Trade,
  getSb1OpenTrades,
  getSb1RecentTrades,
  getSb1TradeById,
  getSb1Stats,
  getSb1CertificationStatus,
  logSb1RejectedSignal,
  getSb1RecentRejections,
  getLatestSb1RasSnapshot,
  getRecentSb1RasSnapshots,
  upsertSb1RasSnapshot,
  getLatestDailyReview,
  listDailyReviews,
  getDailyReviewByDate,
  getLatestRollingPerformance,
  listScheduledJobs,
  generateDailyReviewReport,
  saveDailyReview,
} from "./sb1Db";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // ─── Pipeline Reports ────────────────────────────────────────────────────────
  nexus: router({
    latestReport: publicProcedure.query(async () => {
      const report = await getLatestPipelineReport();
      if (!report) return null;
      return {
        id: report.id,
        receivedAt: report.receivedAt.toISOString(),
        payload: report.payload,
      };
    }),

    recentReports: publicProcedure
      .input(z.object({ limit: z.number().min(1).max(200).default(50) }))
      .query(async ({ input }) => {
        const reports = await getRecentPipelineReports(input.limit);
        return reports.map((r) => ({
          id: r.id,
          receivedAt: r.receivedAt.toISOString(),
          barTime: r.barTime,
          symbol: r.symbol,
          masterState: r.masterState,
          pipelineRunId: r.pipelineRunId,
          payload: r.payload,
        }));
      }),

    reportById: publicProcedure
      .input(z.object({ id: z.string() }))
      .query(async ({ input }) => {
        const r = await getPipelineReportById(input.id);
        if (!r) return null;
        return {
          id: r.id,
          receivedAt: r.receivedAt.toISOString(),
          barTime: r.barTime,
          symbol: r.symbol,
          masterState: r.masterState,
          pipelineRunId: r.pipelineRunId,
          ingestionLatencyMs: r.ingestionLatencyMs,
          payload: r.payload,
        };
      }),

    stats: publicProcedure.query(async () => {
      const count = await getPipelineReportCount();
      const latest = await getLatestPipelineReport();
      return {
        totalReports: count,
        lastReceivedAt: latest?.receivedAt?.toISOString() ?? null,
        lastMasterState: latest?.masterState ?? null,
        lastSymbol: latest?.symbol ?? null,
      };
    }),
  }),

  // ─── Paper Trading ───────────────────────────────────────────────────────────
  paper: router({
    openTrade: publicProcedure
      .input(z.object({ account: z.string().default("ATLAS_MNQ_PAPER") }))
      .query(async ({ input }) => {
        const trade = await getOpenPaperTrade(input.account);
        if (!trade) return null;
        return {
          ...trade,
          entry: trade.entry ? String(trade.entry) : null,
          stop: trade.stop ? String(trade.stop) : null,
          target: trade.target ? String(trade.target) : null,
          exitPrice: trade.exitPrice ? String(trade.exitPrice) : null,
          riskDollars: trade.riskDollars ? String(trade.riskDollars) : null,
          pnl: trade.pnl ? String(trade.pnl) : null,
          currentR: trade.currentR ? String(trade.currentR) : null,
          mfe: trade.mfe ? String(trade.mfe) : null,
          mae: trade.mae ? String(trade.mae) : null,
          edgeScore: trade.edgeScore ? String(trade.edgeScore) : null,
          openedAt: trade.openedAt.toISOString(),
          closedAt: trade.closedAt?.toISOString() ?? null,
        };
      }),

    recentTrades: publicProcedure
      .input(z.object({ limit: z.number().min(1).max(200).default(50), account: z.string().default("ATLAS_MNQ_PAPER") }))
      .query(async ({ input }) => {
        const trades = await getRecentPaperTrades(input.limit, input.account);
        return trades.map((t) => ({
          ...t,
          entry: t.entry ? String(t.entry) : null,
          stop: t.stop ? String(t.stop) : null,
          target: t.target ? String(t.target) : null,
          exitPrice: t.exitPrice ? String(t.exitPrice) : null,
          riskDollars: t.riskDollars ? String(t.riskDollars) : null,
          pnl: t.pnl ? String(t.pnl) : null,
          currentR: t.currentR ? String(t.currentR) : null,
          mfe: t.mfe ? String(t.mfe) : null,
          mae: t.mae ? String(t.mae) : null,
          edgeScore: t.edgeScore ? String(t.edgeScore) : null,
          openedAt: t.openedAt.toISOString(),
          closedAt: t.closedAt?.toISOString() ?? null,
        }));
      }),

    tradeById: publicProcedure
      .input(z.object({ id: z.string() }))
      .query(async ({ input }) => {
        const t = await getPaperTradeById(input.id);
        if (!t) return null;
        return {
          ...t,
          entry: t.entry ? String(t.entry) : null,
          stop: t.stop ? String(t.stop) : null,
          target: t.target ? String(t.target) : null,
          exitPrice: t.exitPrice ? String(t.exitPrice) : null,
          riskDollars: t.riskDollars ? String(t.riskDollars) : null,
          pnl: t.pnl ? String(t.pnl) : null,
          currentR: t.currentR ? String(t.currentR) : null,
          mfe: t.mfe ? String(t.mfe) : null,
          mae: t.mae ? String(t.mae) : null,
          edgeScore: t.edgeScore ? String(t.edgeScore) : null,
          openedAt: t.openedAt.toISOString(),
          closedAt: t.closedAt?.toISOString() ?? null,
        };
      }),

    addNotes: publicProcedure
      .input(z.object({ id: z.string(), notes: z.string() }))
      .mutation(async ({ input }) => {
        await updatePaperTrade(input.id, { notes: input.notes });
        return { success: true };
      }),
  }),

  // ─── Trading Journal ─────────────────────────────────────────────────────────
  journal: router({
    days: publicProcedure
      .input(z.object({ account: z.string().default("ATLAS_MNQ_PAPER"), limit: z.number().min(1).max(365).default(90) }))
      .query(async ({ input }) => {
        const days = await getJournalDays(input.account, input.limit);
        return days.map((d) => ({
          ...d,
          dailyPnl: d.dailyPnl ? String(d.dailyPnl) : "0",
          dailyR: d.dailyR ? String(d.dailyR) : "0",
          profitFactor: d.profitFactor ? String(d.profitFactor) : null,
          winRate: d.winRate ? String(d.winRate) : null,
          largestWinner: d.largestWinner ? String(d.largestWinner) : null,
          largestLoser: d.largestLoser ? String(d.largestLoser) : null,
          tradeDate: d.tradeDate instanceof Date ? d.tradeDate.toISOString().slice(0, 10) : String(d.tradeDate),
          updatedAt: d.updatedAt.toISOString(),
        }));
      }),

    dayDetail: publicProcedure
      .input(z.object({ date: z.string(), account: z.string().default("ATLAS_MNQ_PAPER") }))
      .query(async ({ input }) => {
        const d = await getJournalDayByDate(input.date, input.account);
        if (!d) return null;
        return {
          ...d,
          dailyPnl: d.dailyPnl ? String(d.dailyPnl) : "0",
          dailyR: d.dailyR ? String(d.dailyR) : "0",
          profitFactor: d.profitFactor ? String(d.profitFactor) : null,
          winRate: d.winRate ? String(d.winRate) : null,
          largestWinner: d.largestWinner ? String(d.largestWinner) : null,
          largestLoser: d.largestLoser ? String(d.largestLoser) : null,
          tradeDate: d.tradeDate instanceof Date ? d.tradeDate.toISOString().slice(0, 10) : String(d.tradeDate),
          updatedAt: d.updatedAt.toISOString(),
        };
      }),
  }),

  // ─── System Health ───────────────────────────────────────────────────────────
  health: router({
    events: publicProcedure
      .input(z.object({ limit: z.number().min(1).max(500).default(100) }))
      .query(async ({ input }) => {
        const events = await getRecentHealthEvents(input.limit);
        return events.map((e) => ({
          ...e,
          ts: e.ts.toISOString(),
        }));
      }),

    lastWebhook: publicProcedure.query(async () => {
      const e = await getLastWebhookEvent();
      if (!e) return null;
      return { ...e, ts: e.ts.toISOString() };
    }),
  }),

  // ─── Notifications ───────────────────────────────────────────────────────────
  notifications: router({
    recent: publicProcedure
      .input(z.object({ limit: z.number().min(1).max(100).default(50) }))
      .query(async ({ input }) => {
        const notes = await getRecentNotifications(input.limit);
        return notes.map((n) => ({
          ...n,
          sentAt: n.sentAt.toISOString(),
        }));
      }),
  }),

  // ─── Performance Analytics ───────────────────────────────────────────────────
  analytics: router({
    summary: publicProcedure
      .input(z.object({ account: z.string().default("ATLAS_MNQ_PAPER") }))
      .query(async ({ input }) => {
        return await getAnalyticsData(input.account);
      }),
  }),

  // ─── Certification Framework ─────────────────────────────────────────────────
  certification: router({
    governance: publicProcedure.query(async () => {
      const records = await getAdeGovernanceLog();
      return records.map(r => ({
        ...r,
        createdAt: r.createdAt.toISOString(),
      }));
    }),
    tradeStats: publicProcedure.query(async () => {
      return await getAdeTradeStats();
    }),
  }),

  // ─── SB1 Regime Intelligence ─────────────────────────────────────────────────
  sb1: router({
    // Latest RAS snapshot
    latestRas: publicProcedure.query(async () => {
      const snap = await getLatestSb1RasSnapshot();
      if (!snap) return null;
      return {
        ...snap,
        ras: snap.ras ? String(snap.ras) : null,
        createdAt: snap.createdAt.toISOString(),
      };
    }),

    recentRasHistory: publicProcedure
      .input(z.object({ limit: z.number().min(1).max(200).default(50) }))
      .query(async ({ input }) => {
        const snaps = await getRecentSb1RasSnapshots(input.limit);
        return snaps.map((s) => ({
          ...s,
          ras: s.ras ? String(s.ras) : null,
          createdAt: s.createdAt.toISOString(),
        }));
      }),

    // Paper trades
    openTrades: publicProcedure.query(async () => {
      const trades = await getSb1OpenTrades();
      return trades.map((t) => ({
        ...t,
        entry: t.entry ? String(t.entry) : null,
        stop: t.stop ? String(t.stop) : null,
        target: t.target ? String(t.target) : null,
        ras: t.ras ? String(t.ras) : null,
        openedAt: t.openedAt.toISOString(),
        closedAt: t.closedAt ? t.closedAt.toISOString() : null,
        createdAt: t.createdAt.toISOString(),
      }));
    }),

    recentTrades: publicProcedure
      .input(z.object({ limit: z.number().min(1).max(200).default(50) }))
      .query(async ({ input }) => {
        const trades = await getSb1RecentTrades(input.limit);
        return trades.map((t) => ({
          ...t,
          entry: t.entry ? String(t.entry) : null,
          stop: t.stop ? String(t.stop) : null,
          target: t.target ? String(t.target) : null,
          exitPrice: t.exitPrice ? String(t.exitPrice) : null,
          pnl: t.pnl ? String(t.pnl) : null,
          rMultiple: t.rMultiple ? String(t.rMultiple) : null,
          ras: t.ras ? String(t.ras) : null,
          openedAt: t.openedAt.toISOString(),
          closedAt: t.closedAt ? t.closedAt.toISOString() : null,
          createdAt: t.createdAt.toISOString(),
        }));
      }),

    logTrade: publicProcedure
      .input(z.object({
        id: z.string(),
        symbol: z.string().default("MNQ1!"),
        direction: z.enum(["LONG", "SHORT"]),
        entry: z.number().optional(),
        stop: z.number().optional(),
        target: z.number().optional(),
        contracts: z.number().default(1),
        riskDollars: z.number().optional(),
        ras: z.number().optional(),
        rasActivated: z.boolean().default(false),
        regimeCluster: z.number().optional(),
        session: z.string().optional(),
        notes: z.string().optional(),
        pipelineRunId: z.string().optional(),
        featurePdRangeAtr: z.number().optional(),
        featurePdPosition: z.number().optional(),
        featureOvernightGap: z.number().optional(),
        featureChop: z.number().optional(),
        featureAtrExpansion: z.number().optional(),
        featureVwapDist: z.number().optional(),
        featureEmaSlope: z.number().optional(),
        featureEmaDist: z.number().optional(),
        featureTrendPers: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        await createSb1Trade({
          ...input,
          entry: input.entry !== undefined ? String(input.entry) : null,
          stop: input.stop !== undefined ? String(input.stop) : null,
          target: input.target !== undefined ? String(input.target) : null,
          riskDollars: input.riskDollars !== undefined ? String(input.riskDollars) : null,
          ras: input.ras !== undefined ? String(input.ras) : null,
          featurePdRangeAtr: input.featurePdRangeAtr !== undefined ? String(input.featurePdRangeAtr) : null,
          featurePdPosition: input.featurePdPosition !== undefined ? String(input.featurePdPosition) : null,
          featureOvernightGap: input.featureOvernightGap !== undefined ? String(input.featureOvernightGap) : null,
          featureChop: input.featureChop !== undefined ? String(input.featureChop) : null,
          featureAtrExpansion: input.featureAtrExpansion !== undefined ? String(input.featureAtrExpansion) : null,
          featureVwapDist: input.featureVwapDist !== undefined ? String(input.featureVwapDist) : null,
          featureEmaSlope: input.featureEmaSlope !== undefined ? String(input.featureEmaSlope) : null,
          featureEmaDist: input.featureEmaDist !== undefined ? String(input.featureEmaDist) : null,
          featureTrendPers: input.featureTrendPers !== undefined ? String(input.featureTrendPers) : null,
        });
        return { success: true };
      }),

    closeTrade: publicProcedure
      .input(z.object({
        id: z.string(),
        exitPrice: z.number(),
        exitReason: z.string(),
        pnl: z.number(),
        rMultiple: z.number().optional(),
        mfe: z.number().optional(),
        mae: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        const now = new Date();
        const trade = await getSb1TradeById(input.id);
        const holdingTimeMs = trade ? now.getTime() - new Date(trade.openedAt).getTime() : null;
        await updateSb1Trade(input.id, {
          status: "CLOSED",
          exitPrice: String(input.exitPrice),
          exitReason: input.exitReason,
          pnl: String(input.pnl),
          rMultiple: input.rMultiple !== undefined ? String(input.rMultiple) : null,
          mfe: input.mfe !== undefined ? String(input.mfe) : null,
          mae: input.mae !== undefined ? String(input.mae) : null,
          closedAt: now,
          holdingTimeMs,
        });
        return { success: true };
      }),

    // Stats & certification
    stats: publicProcedure.query(async () => {
      return await getSb1Stats();
    }),

    certificationStatus: publicProcedure.query(async () => {
      return await getSb1CertificationStatus();
    }),

    // Rejected signals
    recentRejections: publicProcedure
      .input(z.object({ limit: z.number().min(1).max(100).default(20) }))
      .query(async ({ input }) => {
        const rejs = await getSb1RecentRejections(input.limit);
        return rejs.map((r) => ({
          ...r,
          ras: r.ras ? String(r.ras) : null,
          createdAt: r.createdAt.toISOString(),
        }));
      }),

    logRejection: publicProcedure
      .input(z.object({
        barTime: z.string(),
        direction: z.enum(["LONG", "SHORT"]),
        ras: z.number(),
        rejectionReason: z.string(),
        featurePdRangeAtr: z.number().optional(),
        featureChop: z.number().optional(),
        featureAtrExpansion: z.number().optional(),
        featureVwapDist: z.number().optional(),
        pipelineRunId: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        await logSb1RejectedSignal({
          ...input,
          ras: String(input.ras),
          featurePdRangeAtr: input.featurePdRangeAtr !== undefined ? String(input.featurePdRangeAtr) : null,
          featureChop: input.featureChop !== undefined ? String(input.featureChop) : null,
          featureAtrExpansion: input.featureAtrExpansion !== undefined ? String(input.featureAtrExpansion) : null,
          featureVwapDist: input.featureVwapDist !== undefined ? String(input.featureVwapDist) : null,
        });
        return { success: true };
      }),

    // Ingest RAS snapshot from webhook
    ingestRasSnapshot: publicProcedure
      .input(z.object({
        barTime: z.string(),
        symbol: z.string().default("MNQ1!"),
        ras: z.number(),
        rasActivated: z.boolean(),
        activationReason: z.string().optional(),
        featurePdRangeAtr: z.number().optional(),
        featurePdPosition: z.number().optional(),
        featureOvernightGap: z.number().optional(),
        featureChop: z.number().optional(),
        featureAtrExpansion: z.number().optional(),
        featureVwapDist: z.number().optional(),
        featureEmaSlope: z.number().optional(),
        featureEmaDist: z.number().optional(),
        featureTrendPers: z.number().optional(),
        pipelineRunId: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        await upsertSb1RasSnapshot({
          ...input,
          ras: String(input.ras),
          featurePdRangeAtr: input.featurePdRangeAtr !== undefined ? String(input.featurePdRangeAtr) : null,
          featurePdPosition: input.featurePdPosition !== undefined ? String(input.featurePdPosition) : null,
          featureOvernightGap: input.featureOvernightGap !== undefined ? String(input.featureOvernightGap) : null,
          featureChop: input.featureChop !== undefined ? String(input.featureChop) : null,
          featureAtrExpansion: input.featureAtrExpansion !== undefined ? String(input.featureAtrExpansion) : null,
          featureVwapDist: input.featureVwapDist !== undefined ? String(input.featureVwapDist) : null,
          featureEmaSlope: input.featureEmaSlope !== undefined ? String(input.featureEmaSlope) : null,
          featureEmaDist: input.featureEmaDist !== undefined ? String(input.featureEmaDist) : null,
          featureTrendPers: input.featureTrendPers !== undefined ? String(input.featureTrendPers) : null,
        });
        return { success: true };
      }),
  }),

  // ─── Daily Reviews ────────────────────────────────────────────────────────────
  dailyReview: router({
    latest: publicProcedure.query(async () => {
      const review = await getLatestDailyReview();
      if (!review) return null;
      return {
        ...review,
        reviewDate: review.reviewDate instanceof Date
          ? review.reviewDate.toISOString().slice(0, 10)
          : String(review.reviewDate),
        generatedAt: review.generatedAt.toISOString(),
        netPnl: review.netPnl ? String(review.netPnl) : null,
        grossProfit: review.grossProfit ? String(review.grossProfit) : null,
        grossLoss: review.grossLoss ? String(review.grossLoss) : null,
        winRate: review.winRate ? String(review.winRate) : null,
        expectancy: review.expectancy ? String(review.expectancy) : null,
        largestWinner: review.largestWinner ? String(review.largestWinner) : null,
        largestLoser: review.largestLoser ? String(review.largestLoser) : null,
      };
    }),

    list: publicProcedure
      .input(z.object({ limit: z.number().min(1).max(100).default(30), offset: z.number().default(0) }))
      .query(async ({ input }) => {
        const reviews = await listDailyReviews(input.limit, input.offset);
        return reviews.map((r) => ({
          id: r.id,
          reviewDate: r.reviewDate instanceof Date
            ? r.reviewDate.toISOString().slice(0, 10)
            : String(r.reviewDate),
          generatedAt: r.generatedAt.toISOString(),
          generationStatus: r.generationStatus,
          totalTrades: r.totalTrades,
          netPnl: r.netPnl ? String(r.netPnl) : null,
          winRate: r.winRate ? String(r.winRate) : null,
        }));
      }),

    byDate: publicProcedure
      .input(z.object({ date: z.string() }))
      .query(async ({ input }) => {
        const review = await getDailyReviewByDate(input.date);
        if (!review) return null;
        return {
          ...review,
          reviewDate: review.reviewDate instanceof Date
            ? review.reviewDate.toISOString().slice(0, 10)
            : String(review.reviewDate),
          generatedAt: review.generatedAt.toISOString(),
          netPnl: review.netPnl ? String(review.netPnl) : null,
          grossProfit: review.grossProfit ? String(review.grossProfit) : null,
          grossLoss: review.grossLoss ? String(review.grossLoss) : null,
          winRate: review.winRate ? String(review.winRate) : null,
          expectancy: review.expectancy ? String(review.expectancy) : null,
          largestWinner: review.largestWinner ? String(review.largestWinner) : null,
          largestLoser: review.largestLoser ? String(review.largestLoser) : null,
        };
      }),

    // Manual trigger — generate today's review on demand
    generateNow: publicProcedure
      .input(z.object({ date: z.string().optional() }))
      .mutation(async ({ input }) => {
        const reviewDate = input.date ?? new Date().toISOString().slice(0, 10);
        const report = await generateDailyReviewReport(reviewDate);
        await saveDailyReview({
          reviewDate: reviewDate as unknown as Date,
          generatedBy: "MANUAL",
          generationStatus: "SUCCESS",
          totalTrades: report.tradingSummary.totalTrades,
          winningTrades: report.tradingSummary.winningTrades,
          losingTrades: report.tradingSummary.losingTrades,
          netPnl: String(report.tradingSummary.netPnl),
          grossProfit: String(report.tradingSummary.grossProfit),
          grossLoss: String(report.tradingSummary.grossLoss),
          winRate: String(report.tradingSummary.winRate),
          expectancy: String(report.tradingSummary.expectancy),
          largestWinner: String(report.tradingSummary.largestWinner),
          largestLoser: String(report.tradingSummary.largestLoser),
          reportJson: report,
          notificationSent: false,
        });
        return { success: true, reviewDate, report };
      }),

    // Rolling performance
    rollingPerformance: publicProcedure.query(async () => {
      return await getLatestRollingPerformance();
    }),
  }),

  // ─── Scheduled Jobs ───────────────────────────────────────────────────────────
  scheduler: router({
    list: publicProcedure.query(async () => {
      const jobs = await listScheduledJobs();
      return jobs.map((j) => ({
        ...j,
        lastRunAt: j.lastRunAt ? j.lastRunAt.toISOString() : null,
        createdAt: j.createdAt.toISOString(),
        updatedAt: j.updatedAt.toISOString(),
      }));
    }),
  }),
});

export type AppRouter = typeof appRouter;
