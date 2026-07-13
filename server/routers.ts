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

  // ─── ARD (Autonomous Research Division) ──────────────────────────────────────
  ard: router({
    recentObservations: publicProcedure
      .input(z.object({ limit: z.number().min(1).max(200).default(50) }))
      .query(async ({ input }) => {
        const { getRecentObservations } = await import("./ardDb");
        const rows = await getRecentObservations(input.limit);
        return rows.map((r) => ({
          ...r,
          barTime: r.barTime.toISOString(),
          receivedAt: r.receivedAt.toISOString(),
        }));
      }),
    stats: publicProcedure.query(async () => {
      const { getObservationStats } = await import("./ardDb");
      return await getObservationStats();
    }),
    missingBars: publicProcedure
      .input(z.object({ since: z.string().optional() }))
      .query(async ({ input }) => {
        const { detectMissingBars } = await import("./ardDb");
        const since = input.since ? new Date(input.since) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        return await detectMissingBars(since);
      }),
    candidates: publicProcedure
      .input(z.object({ status: z.string().optional() }))
      .query(async ({ input }) => {
        const { listCandidates } = await import("./ardDb");
        const rows = await listCandidates(input.status);
        return rows.map((r) => ({
          ...r,
          discoveryDate: r.discoveryDate instanceof Date ? r.discoveryDate.toISOString().slice(0, 10) : String(r.discoveryDate),
          createdAt: r.createdAt.toISOString(),
          updatedAt: r.updatedAt.toISOString(),
        }));
      }),
    createCandidate: publicProcedure
      .input(z.object({
        candidateId: z.string(),
        title: z.string(),
        hypothesis: z.string(),
        direction: z.string().optional(),
        horizon: z.string().optional(),
        priorityScore: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        const { insertCandidate } = await import("./ardDb");
        return await insertCandidate({
          candidateId: input.candidateId,
          title: input.title,
          hypothesis: input.hypothesis,
          direction: input.direction ?? null,
          horizon: input.horizon ?? null,
          priorityScore: input.priorityScore !== undefined ? String(input.priorityScore) : null,
          discoveryDate: new Date(),
          status: "Observed",
        });
      }),
    updateCandidateStatus: publicProcedure
      .input(z.object({
        candidateId: z.string(),
        status: z.string(),
        rejectionReason: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const { updateCandidateStatus } = await import("./ardDb");
        return await updateCandidateStatus(input.candidateId, input.status, input.rejectionReason);
      }),
  }),

  // ─── ORACLE (Prediction vs Reality) ──────────────────────────────────────────
  oracle: router({
    predictions: publicProcedure
      .input(z.object({ modelId: z.string().optional(), limit: z.number().min(1).max(200).default(50) }))
      .query(async ({ input }) => {
        const { listOraclePredictions } = await import("./ardDb");
        const rows = await listOraclePredictions(input.modelId, input.limit);
        return rows.map((r) => ({
          ...r,
          timestamp: r.timestamp.toISOString(),
          createdAt: r.createdAt.toISOString(),
        }));
      }),
    createPrediction: publicProcedure
      .input(z.object({
        predictionId: z.string(),
        modelId: z.string().optional(),
        direction: z.string().optional(),
        expectedWinProb: z.number().min(0).max(1).optional(),
        expectedR: z.number().optional(),
        expectedRegime: z.string().optional(),
        reasoningSummary: z.string().optional(),
        timestamp: z.string(),
      }))
      .mutation(async ({ input }) => {
        const { createOraclePrediction } = await import("./ardDb");
        return await createOraclePrediction({
          predictionId: input.predictionId,
          modelId: input.modelId ?? null,
          direction: input.direction ?? null,
          expectedWinProb: input.expectedWinProb !== undefined ? String(input.expectedWinProb) : null,
          expectedR: input.expectedR !== undefined ? String(input.expectedR) : null,
          expectedRegime: input.expectedRegime ?? null,
          reasoningSummary: input.reasoningSummary ?? null,
          timestamp: new Date(input.timestamp),
        });
      }),
    recordReality: publicProcedure
      .input(z.object({
        predictionId: z.string(),
        actualResult: z.string().optional(),
        actualR: z.number().optional(),
        actualPnl: z.number().optional(),
        regimeMatchCorrect: z.boolean().optional(),
        winProbCalibrationBin: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        const { createOracleReality } = await import("./ardDb");
        return await createOracleReality({
          predictionId: input.predictionId,
          actualResult: input.actualResult ?? null,
          actualR: input.actualR !== undefined ? String(input.actualR) : null,
          actualPnl: input.actualPnl !== undefined ? String(input.actualPnl) : null,
          regimeMatchCorrect: input.regimeMatchCorrect ?? null,
          winProbCalibrationBin: input.winProbCalibrationBin !== undefined ? String(input.winProbCalibrationBin) : null,
        });
      }),
    scores: publicProcedure
      .input(z.object({ modelId: z.string().optional() }))
      .query(async ({ input }) => {
        const { getLatestOracleScore, getOracleScoreHistory } = await import("./ardDb");
        if (input.modelId) {
          const latest = await getLatestOracleScore(input.modelId);
          const history = await getOracleScoreHistory(input.modelId, 30);
          return {
            latest: latest ? { ...latest, scoreDate: latest.scoreDate instanceof Date ? latest.scoreDate.toISOString().slice(0, 10) : String(latest.scoreDate), createdAt: latest.createdAt.toISOString() } : null,
            history: history.map((h) => ({ ...h, scoreDate: h.scoreDate instanceof Date ? h.scoreDate.toISOString().slice(0, 10) : String(h.scoreDate), createdAt: h.createdAt.toISOString() })),
          };
        }
        return { latest: null, history: [] };
      }),
    pairs: publicProcedure
      .input(z.object({ modelId: z.string().optional(), limit: z.number().min(1).max(200).default(100) }))
      .query(async ({ input }) => {
        const { getOraclePairs } = await import("./ardDb");
        const rows = await getOraclePairs(input.modelId, input.limit);
        return rows.map((r) => ({
          predictionId: r.prediction.predictionId,
          modelId: r.prediction.modelId,
          predictionTime: r.prediction.timestamp.toISOString(),
          direction: r.prediction.direction,
          expectedWinProb: r.prediction.expectedWinProb ? String(r.prediction.expectedWinProb) : null,
          expectedR: r.prediction.expectedR ? String(r.prediction.expectedR) : null,
          actualResult: r.reality?.actualResult ?? null,
          actualR: r.reality?.actualR ? String(r.reality.actualR) : null,
          outcomeTime: r.reality?.createdAt ? r.reality.createdAt.toISOString() : null,
          winProbCalibrationBin: r.reality?.winProbCalibrationBin ? String(r.reality.winProbCalibrationBin) : null,
        }));
      }),
  }),

  // ── Atlas Memory (Sprint 089A) ────────────────────────────────────────────────
  atlasMemory: router({
    stats: publicProcedure.query(async () => {
      const { getAtlasMemoryStats } = await import("./atlasMemoryDb");
      return getAtlasMemoryStats();
    }),
    recent: publicProcedure
      .input(z.object({ limit: z.number().min(1).max(200).default(50) }))
      .query(async ({ input }) => {
        const { getRecentMemory } = await import("./atlasMemoryDb");
        const rows = await getRecentMemory(input.limit);
        return rows.map((r) => ({
          id: r.id,
          memoryId: r.memoryId,
          barTime: r.barTime,
          session: r.session,
          close: r.close,
          atr: r.atr,
          adx: r.adx,
          chop: r.chop,
          regimeClassification: r.regimeClassification,
          emaAlignment: r.emaAlignment,
          trendDirection: r.trendDirection,
          activeModels: r.activeModels,
          sb1Eligible: r.sb1Eligible,
          a1Eligible: r.a1Eligible,
          pipelineHealth: r.pipelineHealth,
          atlasVersion: r.atlasVersion,
          schemaVersion: r.schemaVersion,
          receivedAt: r.receivedAt.toISOString(),
        }));
      }),
    regimeDistribution: publicProcedure
      .input(z.object({ limit: z.number().min(1).max(1000).default(288) }))
      .query(async ({ input }) => {
        const { getRegimeDistribution } = await import("./atlasMemoryDb");
        return getRegimeDistribution(input.limit);
      }),
    sessionDistribution: publicProcedure
      .input(z.object({ limit: z.number().min(1).max(1000).default(288) }))
      .query(async ({ input }) => {
        const { getSessionDistribution } = await import("./atlasMemoryDb");
        return getSessionDistribution(input.limit);
      }),
  }),

  // ── Temporal Intelligence Engine (Sprint 090) ─────────────────────────────
  tie: router({
    activeSequences: publicProcedure
      .input(z.object({ limit: z.number().min(1).max(50).default(10) }))
      .query(async ({ input }) => {
        const { getDb } = await import("./db");
        const { tieSequences } = await import("../drizzle/schema");
        const { desc, eq } = await import("drizzle-orm");
        const db = await getDb();
        if (!db) return [];
        const rows = await db.select().from(tieSequences).where(eq(tieSequences.completionStatus, "active")).orderBy(desc(tieSequences.createdAt)).limit(input.limit);
        return rows.map(r => ({ id: r.id, sequenceId: r.sequenceId, sequenceType: r.sequenceType, label: r.label, startTime: r.startTime, durationBars: r.durationBars, session: r.session, dominantTrend: r.dominantTrend, volatilityProfile: r.volatilityProfile, regime: r.regime, marketStructure: r.marketStructure, completionStatus: r.completionStatus, confidence: r.confidence ? String(r.confidence) : null, experienceScore: r.experienceScore ? String(r.experienceScore) : null, expectedOutcome: r.expectedOutcome, expectedDurationBars: r.expectedDurationBars, expectedR: r.expectedR ? String(r.expectedR) : null, behaviourStory: r.behaviourStory, createdAt: r.createdAt.toISOString() }));
      }),
    recentSequences: publicProcedure
      .input(z.object({ limit: z.number().min(1).max(100).default(20) }))
      .query(async ({ input }) => {
        const { getDb } = await import("./db");
        const { tieSequences } = await import("../drizzle/schema");
        const { desc } = await import("drizzle-orm");
        const db = await getDb();
        if (!db) return [];
        const rows = await db.select().from(tieSequences).orderBy(desc(tieSequences.createdAt)).limit(input.limit);
        return rows.map(r => ({ id: r.id, sequenceId: r.sequenceId, sequenceType: r.sequenceType, label: r.label, startTime: r.startTime, durationBars: r.durationBars, session: r.session, dominantTrend: r.dominantTrend, volatilityProfile: r.volatilityProfile, regime: r.regime, marketStructure: r.marketStructure, completionStatus: r.completionStatus, confidence: r.confidence ? String(r.confidence) : null, experienceScore: r.experienceScore ? String(r.experienceScore) : null, expectedOutcome: r.expectedOutcome, expectedDurationBars: r.expectedDurationBars, expectedR: r.expectedR ? String(r.expectedR) : null, behaviourStory: r.behaviourStory, createdAt: r.createdAt.toISOString() }));
      }),
    library: publicProcedure.query(async () => {
      const { getDb } = await import("./db");
      const { tieSequenceLibrary } = await import("../drizzle/schema");
      const { desc } = await import("drizzle-orm");
      const db = await getDb();
      if (!db) return [];
      const rows = await db.select().from(tieSequenceLibrary).orderBy(desc(tieSequenceLibrary.occurrences));
      return rows.map(r => ({ id: r.id, sequenceType: r.sequenceType, displayName: r.displayName, description: r.description, firstObserved: r.firstObserved, lastObserved: r.lastObserved, occurrences: r.occurrences, winRate: r.winRate ? String(r.winRate) : null, avgR: r.avgR ? String(r.avgR) : null, avgDurationBars: r.avgDurationBars ? String(r.avgDurationBars) : null, bestModels: r.bestModels, oraclePredictionAccuracy: r.oraclePredictionAccuracy ? String(r.oraclePredictionAccuracy) : null, researchStatus: r.researchStatus, constitutionalNote: r.constitutionalNote, updatedAt: r.updatedAt.toISOString() }));
    }),
    clusters: publicProcedure.query(async () => {
      const { getDb } = await import("./db");
      const { tieClusters } = await import("../drizzle/schema");
      const { desc } = await import("drizzle-orm");
      const db = await getDb();
      if (!db) return [];
      const rows = await db.select().from(tieClusters).orderBy(desc(tieClusters.occurrences));
      return rows.map(r => ({ id: r.id, clusterId: r.clusterId, clusterName: r.clusterName, description: r.description, sequenceTypes: r.sequenceTypes, occurrences: r.occurrences, avgPf: r.avgPf ? String(r.avgPf) : null, avgDurationBars: r.avgDurationBars ? String(r.avgDurationBars) : null, confidence: r.confidence ? String(r.confidence) : null, dominantRegime: r.dominantRegime, dominantSession: r.dominantSession, lastUpdated: r.lastUpdated.toISOString() }));
    }),
    oraclePredictions: publicProcedure
      .input(z.object({ status: z.enum(["pending", "resolved", "expired", "all"]).default("pending"), limit: z.number().min(1).max(50).default(10) }))
      .query(async ({ input }) => {
        const { getDb } = await import("./db");
        const { tieOraclePredictions } = await import("../drizzle/schema");
        const { desc, eq } = await import("drizzle-orm");
        const db = await getDb();
        if (!db) return [];
        const rows = input.status === "all"
          ? await db.select().from(tieOraclePredictions).orderBy(desc(tieOraclePredictions.createdAt)).limit(input.limit)
          : await db.select().from(tieOraclePredictions).where(eq(tieOraclePredictions.status, input.status as "pending" | "resolved" | "expired")).orderBy(desc(tieOraclePredictions.createdAt)).limit(input.limit);
        return rows.map(r => ({ id: r.id, predictionId: r.predictionId, sequenceId: r.sequenceId, predictedOutcome: r.predictedOutcome, predictedR: r.predictedR ? String(r.predictedR) : null, predictedDurationBars: r.predictedDurationBars, predictedConfidence: r.predictedConfidence ? String(r.predictedConfidence) : null, actualOutcome: r.actualOutcome, actualR: r.actualR ? String(r.actualR) : null, predictionError: r.predictionError ? String(r.predictionError) : null, status: r.status, predictedAt: r.predictedAt, resolvedAt: r.resolvedAt, createdAt: r.createdAt.toISOString() }));
      }),
    researchCandidates: publicProcedure
      .input(z.object({ status: z.enum(["candidate", "under_review", "certified", "rejected", "all"]).default("all"), limit: z.number().min(1).max(50).default(20) }))
      .query(async ({ input }) => {
        const { getDb } = await import("./db");
        const { tieResearchCandidates } = await import("../drizzle/schema");
        const { desc, eq } = await import("drizzle-orm");
        const db = await getDb();
        if (!db) return [];
        const rows = input.status === "all"
          ? await db.select().from(tieResearchCandidates).orderBy(desc(tieResearchCandidates.createdAt)).limit(input.limit)
          : await db.select().from(tieResearchCandidates).where(eq(tieResearchCandidates.certificationStatus, input.status as "candidate" | "under_review" | "certified" | "rejected")).orderBy(desc(tieResearchCandidates.createdAt)).limit(input.limit);
        return rows.map(r => ({ id: r.id, candidateId: r.candidateId, sequenceId: r.sequenceId, evidenceScore: r.evidenceScore ? String(r.evidenceScore) : null, occurrenceCount: r.occurrenceCount, statisticalConfidence: r.statisticalConfidence ? String(r.statisticalConfidence) : null, researchPriority: r.researchPriority, certificationStatus: r.certificationStatus, firstSeen: r.firstSeen, lastSeen: r.lastSeen, behaviouralSignature: r.behaviouralSignature, notes: r.notes, discoveredBy: r.discoveredBy, createdAt: r.createdAt.toISOString() }));
      }),
    experienceScore: publicProcedure.query(async () => {
      const { computeExperienceScore } = await import("./tieEngine");
      return computeExperienceScore(13);
    }),
    stats: publicProcedure.query(async () => {
      const { getDb } = await import("./db");
      const { tieSequences, tieSequenceLibrary, tieClusters, tieResearchCandidates } = await import("../drizzle/schema");
      const { count, eq } = await import("drizzle-orm");
      const db = await getDb();
      if (!db) return { totalSequences: 0, activeSequences: 0, librarySize: 0, clusterCount: 0, candidateCount: 0 };
      const [totalSeq] = await db.select({ count: count() }).from(tieSequences);
      const [activeSeq] = await db.select({ count: count() }).from(tieSequences).where(eq(tieSequences.completionStatus, "active"));
      const [libSize] = await db.select({ count: count() }).from(tieSequenceLibrary);
      const [clusterCount] = await db.select({ count: count() }).from(tieClusters);
      const [candidateCount] = await db.select({ count: count() }).from(tieResearchCandidates);
      return { totalSequences: totalSeq.count, activeSequences: activeSeq.count, librarySize: libSize.count, clusterCount: clusterCount.count, candidateCount: candidateCount.count };
    }),
    process: publicProcedure.mutation(async () => {
      const { processTIE } = await import("./tieEngine");
      await processTIE(50);
      return { ok: true, timestamp: Date.now() };
    }),
  }),

  // ─── DARWIN Autonomous Research Engine ──────────────────────────────────────
  darwin: router({
    stats: publicProcedure.query(async () => {
      const { getDarwinStats } = await import("./darwinEngine");
      return getDarwinStats();
    }),
    candidates: publicProcedure.query(async () => {
      const { getDarwinCandidates } = await import("./darwinEngine");
      const rows = await getDarwinCandidates();
      return rows.map(r => ({
        ...r,
        statisticalSignificance: r.statisticalSignificance ? String(r.statisticalSignificance) : null,
        confidence: r.confidence ? String(r.confidence) : null,
        estimatedWinRate: r.estimatedWinRate ? String(r.estimatedWinRate) : null,
        estimatedPf: r.estimatedPf ? String(r.estimatedPf) : null,
        estimatedPcs: r.estimatedPcs ? String(r.estimatedPcs) : null,
        estimatedCorrelation: r.estimatedCorrelation ? String(r.estimatedCorrelation) : null,
        evidenceScore: r.evidenceScore ? String(r.evidenceScore) : null,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      }));
    }),
    backtests: publicProcedure
      .input(z.object({ candidateId: z.string().optional() }))
      .query(async ({ input }) => {
        const { getDarwinBacktests } = await import("./darwinEngine");
        const rows = await getDarwinBacktests(input.candidateId);
        return rows.map(r => ({
          ...r,
          winRate: r.winRate ? String(r.winRate) : null,
          profitFactor: r.profitFactor ? String(r.profitFactor) : null,
          netProfit: r.netProfit ? String(r.netProfit) : null,
          maxDrawdown: r.maxDrawdown ? String(r.maxDrawdown) : null,
          expectancy: r.expectancy ? String(r.expectancy) : null,
          sharpeRatio: r.sharpeRatio ? String(r.sharpeRatio) : null,
          mcProfitProbability: r.mcProfitProbability ? String(r.mcProfitProbability) : null,
          ddViolationRisk: r.ddViolationRisk ? String(r.ddViolationRisk) : null,
          parameterStabilityScore: r.parameterStabilityScore ? String(r.parameterStabilityScore) : null,
          robustnessScore: r.robustnessScore ? String(r.robustnessScore) : null,
          createdAt: r.createdAt.toISOString(),
        }));
      }),
    weeklyReports: publicProcedure.query(async () => {
      const { getDarwinWeeklyReports } = await import("./darwinEngine");
      const rows = await getDarwinWeeklyReports(10);
      return rows.map(r => ({
        ...r,
        portfolioHealthScore: r.portfolioHealthScore ? String(r.portfolioHealthScore) : null,
        coverageScore: r.coverageScore ? String(r.coverageScore) : null,
        oracleAccuracy: r.oracleAccuracy ? String(r.oracleAccuracy) : null,
        researchVelocity: r.researchVelocity ? String(r.researchVelocity) : null,
        createdAt: r.createdAt.toISOString(),
      }));
    }),
    selfEval: publicProcedure.query(async () => {
      const { getDarwinSelfEval } = await import("./darwinEngine");
      const rows = await getDarwinSelfEval(10);
      return rows.map(r => ({
        ...r,
        predictionAccuracy: r.predictionAccuracy ? String(r.predictionAccuracy) : null,
        researchEfficiency: r.researchEfficiency ? String(r.researchEfficiency) : null,
        avgTimeToCertificationDays: r.avgTimeToCertificationDays ? String(r.avgTimeToCertificationDays) : null,
        discoveryRate: r.discoveryRate ? String(r.discoveryRate) : null,
        qualityScore: r.qualityScore ? String(r.qualityScore) : null,
        createdAt: r.createdAt.toISOString(),
      }));
    }),
    triggerAnalysis: publicProcedure.mutation(async () => {
      const { runDarwinAnalysis } = await import("./darwinEngine");
      const result = await runDarwinAnalysis();
      return result;
    }),
    generateWeeklyReport: publicProcedure.mutation(async () => {
      const { generateWeeklyReport } = await import("./darwinEngine");
      const reportId = await generateWeeklyReport();
      return { reportId, timestamp: Date.now() };
    }),
  }),
});

export type AppRouter = typeof appRouter;
