import { COOKIE_NAME } from "@shared/const";
import { z } from "zod";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import {
  getLatestPipelineReport,
  getPipelineReportCount,
  getRecentPipelineReports,
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

  nexus: router({
    // Returns the latest pipeline report for catch-up on page load
    latestReport: publicProcedure.query(async () => {
      const report = await getLatestPipelineReport();
      if (!report) return null;
      return {
        id: report.id,
        receivedAt: report.receivedAt.toISOString(),
        payload: report.payload,
      };
    }),

    // Returns paginated recent reports for the Decision Timeline
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

    // Returns stats for the Overview Strip
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
});

export type AppRouter = typeof appRouter;
