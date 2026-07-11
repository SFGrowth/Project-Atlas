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

  // ─── Performance Analytics ──────────────────────────────────────────────────────────────────────────────────
  analytics: router({
    summary: publicProcedure
      .input(z.object({ account: z.string().default("ATLAS_MNQ_PAPER") }))
      .query(async ({ input }) => {
        return await getAnalyticsData(input.account);
      }),
  }),

  // ─── Certification Framework ──────────────────────────────────────────────────────────────────────────────────
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
});

export type AppRouter = typeof appRouter;
