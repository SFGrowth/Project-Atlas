/**
 * DARWIN Daily Report Router — Sprint 116
 *
 * tRPC procedures for the DARWIN Daily Research Report dashboard.
 *
 * Procedures:
 *   - getReports: list all reports (paginated, newest first)
 *   - getReport: get a single report by date or id
 *   - runReport: trigger immediate report generation (owner only)
 *   - getStats: aggregate stats across all reports
 */

import { z } from "zod";
import { desc, eq, asc, sql } from "drizzle-orm";
import { router, protectedProcedure } from "./_core/trpc.js";
import { getDb } from "./db.js";
import { darwinDailyReports } from "../drizzle/schema.js";

export const darwinDailyReportRouter = router({
  // ── List all reports (newest first, paginated) ──────────────────────────────
  getReports: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(30),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { reports: [], total: 0 };

      const [rows, countResult] = await Promise.all([
        db
          .select({
            id: darwinDailyReports.id,
            reportDate: darwinDailyReports.reportDate,
            tradesAnalysed: darwinDailyReports.tradesAnalysed,
            strategiesEvaluated: darwinDailyReports.strategiesEvaluated,
            newBehavioursFound: darwinDailyReports.newBehavioursFound,
            behavioursConfirmed: darwinDailyReports.behavioursConfirmed,
            behavioursRejected: darwinDailyReports.behavioursRejected,
            modelsImproving: darwinDailyReports.modelsImproving,
            modelsDegrading: darwinDailyReports.modelsDegrading,
            githubCommitSha: darwinDailyReports.githubCommitSha,
            githubCommitUrl: darwinDailyReports.githubCommitUrl,
            githubCommitStatus: darwinDailyReports.githubCommitStatus,
            generatedBy: darwinDailyReports.generatedBy,
            generationDurationMs: darwinDailyReports.generationDurationMs,
            generatedAt: darwinDailyReports.generatedAt,
            createdAt: darwinDailyReports.createdAt,
          })
          .from(darwinDailyReports)
          .orderBy(desc(darwinDailyReports.reportDate))
          .limit(input.limit)
          .offset(input.offset),
        db
          .select({ count: sql<number>`count(*)` })
          .from(darwinDailyReports),
      ]);

      return {
        reports: rows,
        total: countResult[0]?.count ?? 0,
      };
    }),

  // ── Get a single report (full markdown) ────────────────────────────────────
  getReport: protectedProcedure
    .input(
      z.object({
        reportDate: z.string().optional(), // YYYY-MM-DD
        id: z.number().optional(),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;

      let rows;
      if (input.id) {
        rows = await db
          .select()
          .from(darwinDailyReports)
          .where(eq(darwinDailyReports.id, input.id))
          .limit(1);
      } else if (input.reportDate) {
        rows = await db
          .select()
          .from(darwinDailyReports)
          .where(eq(darwinDailyReports.reportDate, input.reportDate))
          .limit(1);
      } else {
        // Latest report
        rows = await db
          .select()
          .from(darwinDailyReports)
          .orderBy(desc(darwinDailyReports.reportDate))
          .limit(1);
      }

      return rows[0] ?? null;
    }),

  // ── Trigger immediate report generation ────────────────────────────────────
  runReport: protectedProcedure
    .input(
      z.object({
        targetDate: z.string().optional(), // YYYY-MM-DD, defaults to today
      })
    )
    .mutation(async ({ input }) => {
      const { generateDarwinDailyReport, updateReportGithubStatus } = await import(
        "./darwinDailyReport.js"
      );
      const { archiveReportToGitHub, ensureResearchDirectoryExists } = await import(
        "./darwinGitArchive.js"
      );

      // Ensure research/daily/ directory exists
      await ensureResearchDirectoryExists();

      // Generate report
      const { reportDate, markdown, dbId } = await generateDarwinDailyReport(
        input.targetDate
      );

      // Archive to GitHub
      const archiveResult = await archiveReportToGitHub(reportDate, markdown);

      if (archiveResult.success && archiveResult.sha && archiveResult.url) {
        await updateReportGithubStatus(dbId, archiveResult.sha, archiveResult.url, "SUCCESS");
      }

      return {
        reportDate,
        dbId,
        githubSuccess: archiveResult.success,
        githubCommitSha: archiveResult.sha ?? null,
        githubCommitUrl: archiveResult.url ?? null,
        githubError: archiveResult.error ?? null,
      };
    }),

  // ── Aggregate stats across all reports ─────────────────────────────────────
  getStats: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) {
      return {
        totalReports: 0,
        totalTradesAnalysed: 0,
        totalBehavioursFound: 0,
        totalBehavioursConfirmed: 0,
        totalBehavioursRejected: 0,
        githubSuccessCount: 0,
        githubFailedCount: 0,
        avgGenerationMs: 0,
        latestReportDate: null as string | null,
        oldestReportDate: null as string | null,
      };
    }

    const [statsRow, latestRow, oldestRow] = await Promise.all([
      db
        .select({
          totalReports: sql<number>`count(*)`,
          totalTradesAnalysed: sql<number>`sum(${darwinDailyReports.tradesAnalysed})`,
          totalBehavioursFound: sql<number>`sum(${darwinDailyReports.newBehavioursFound})`,
          totalBehavioursConfirmed: sql<number>`sum(${darwinDailyReports.behavioursConfirmed})`,
          totalBehavioursRejected: sql<number>`sum(${darwinDailyReports.behavioursRejected})`,
          githubSuccessCount: sql<number>`sum(case when ${darwinDailyReports.githubCommitStatus} = 'SUCCESS' then 1 else 0 end)`,
          githubFailedCount: sql<number>`sum(case when ${darwinDailyReports.githubCommitStatus} = 'FAILED' then 1 else 0 end)`,
          avgGenerationMs: sql<number>`avg(${darwinDailyReports.generationDurationMs})`,
        })
        .from(darwinDailyReports),
      db
        .select({ reportDate: darwinDailyReports.reportDate })
        .from(darwinDailyReports)
        .orderBy(desc(darwinDailyReports.reportDate))
        .limit(1),
      db
        .select({ reportDate: darwinDailyReports.reportDate })
        .from(darwinDailyReports)
        .orderBy(asc(darwinDailyReports.reportDate))
        .limit(1),
    ]);

    const s = statsRow[0];
    return {
      totalReports: s?.totalReports ?? 0,
      totalTradesAnalysed: s?.totalTradesAnalysed ?? 0,
      totalBehavioursFound: s?.totalBehavioursFound ?? 0,
      totalBehavioursConfirmed: s?.totalBehavioursConfirmed ?? 0,
      totalBehavioursRejected: s?.totalBehavioursRejected ?? 0,
      githubSuccessCount: s?.githubSuccessCount ?? 0,
      githubFailedCount: s?.githubFailedCount ?? 0,
      avgGenerationMs: Math.round(s?.avgGenerationMs ?? 0),
      latestReportDate: latestRow[0]?.reportDate ?? null,
      oldestReportDate: oldestRow[0]?.reportDate ?? null,
    };
  }),
});
