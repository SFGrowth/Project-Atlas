/**
 * gapDiscoveryRouter.ts — Sprint 115: Atlas Permanent Research Directive
 *
 * tRPC procedures for the Gap Discovery Engine:
 *   - getLatestReport: latest gap discovery report
 *   - getGapCandidates: all open/investigating gaps
 *   - runGapAnalysis: trigger manual gap analysis run
 *   - updateGapStatus: update gap candidate status
 *   - getAutonomousQuestions: latest autonomous question answers
 */

import { z } from "zod";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import {
  gapCandidates,
  gapDiscoveryReports,
} from "../drizzle/schema";
import { desc, eq, inArray } from "drizzle-orm";
import { runGapDiscoveryEngine, persistGapReport } from "./gapDiscoveryEngine";

export const gapDiscoveryRouter = router({
  // ── Latest gap discovery report ──────────────────────────────────────────
  getLatestReport: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return null;
    const rows = await db
      .select()
      .from(gapDiscoveryReports)
      .orderBy(desc(gapDiscoveryReports.id))
      .limit(1);
    const report = rows[0] ?? null;
    if (!report) return null;
    return {
      ...report,
      top10PortfolioGaps: report.top10PortfolioGaps ? JSON.parse(report.top10PortfolioGaps) : [],
      top10ResearchOpps: report.top10ResearchOpps ? JSON.parse(report.top10ResearchOpps) : [],
      topEngineeringImprovements: report.topEngineeringImprovements ? JSON.parse(report.topEngineeringImprovements) : [],
      topExecutionImprovements: report.topExecutionImprovements ? JSON.parse(report.topExecutionImprovements) : [],
      topDashboardImprovements: report.topDashboardImprovements ? JSON.parse(report.topDashboardImprovements) : [],
      autonomousQuestionAnswers: report.autonomousQuestionAnswers ? JSON.parse(report.autonomousQuestionAnswers) : [],
    };
  }),

  // ── All gap reports (summary list) ───────────────────────────────────────
  getReportHistory: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db
      .select({
        id: gapDiscoveryReports.id,
        reportDate: gapDiscoveryReports.reportDate,
        totalGapsIdentified: gapDiscoveryReports.totalGapsIdentified,
        newGapsThisWeek: gapDiscoveryReports.newGapsThisWeek,
        resolvedThisWeek: gapDiscoveryReports.resolvedThisWeek,
        openGaps: gapDiscoveryReports.openGaps,
        estimatedPortfolioImprovementPct: gapDiscoveryReports.estimatedPortfolioImprovementPct,
        recommendedNextPriority: gapDiscoveryReports.recommendedNextPriority,
        generatedAt: gapDiscoveryReports.generatedAt,
        generationDurationMs: gapDiscoveryReports.generationDurationMs,
      })
      .from(gapDiscoveryReports)
      .orderBy(desc(gapDiscoveryReports.id))
      .limit(52); // 1 year of weekly reports
  }),

  // ── Open gap candidates ───────────────────────────────────────────────────
  getGapCandidates: publicProcedure
    .input(z.object({
      status: z.enum(["OPEN", "INVESTIGATING", "RESOLVED", "DEFERRED", "REJECTED", "ALL"]).optional().default("OPEN"),
      dimension: z.string().optional(),
      limit: z.number().min(1).max(100).optional().default(50),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      let query = db.select().from(gapCandidates).$dynamic();
      if (input.status !== "ALL") {
        query = query.where(eq(gapCandidates.status, input.status as "OPEN" | "INVESTIGATING" | "RESOLVED" | "DEFERRED" | "REJECTED"));
      }
      return query
        .orderBy(gapCandidates.priorityRank)
        .limit(input.limit);
    }),

  // ── Update gap candidate status ───────────────────────────────────────────
  updateGapStatus: protectedProcedure
    .input(z.object({
      id: z.number(),
      status: z.enum(["OPEN", "INVESTIGATING", "RESOLVED", "DEFERRED", "REJECTED"]),
      resolvedNotes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      await db
        .update(gapCandidates)
        .set({
          status: input.status,
          resolvedNotes: input.resolvedNotes ?? null,
          resolvedAt: input.status === "RESOLVED" ? Date.now() : null,
          updatedAt: new Date(),
        })
        .where(eq(gapCandidates.id, input.id));
      return { ok: true, message: `Gap #${input.id} status updated to ${input.status}` };
    }),

  // ── Trigger manual gap analysis run ──────────────────────────────────────
  runAnalysis: protectedProcedure.mutation(async () => {
    const result = await runGapDiscoveryEngine();
    const reportId = await persistGapReport(result);
    return {
      ok: true,
      reportId,
      findingsCount: result.findings.length,
      estimatedPortfolioImprovementPct: result.estimatedPortfolioImprovementPct,
      recommendedNextPriority: result.recommendedNextPriority,
      generationDurationMs: result.generationDurationMs,
      message: `Gap analysis complete: ${result.findings.length} gaps identified, report #${reportId} saved`,
    };
  }),

  // ── Latest autonomous question answers ───────────────────────────────────
  getAutonomousQuestions: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    const rows = await db
      .select({ autonomousQuestionAnswers: gapDiscoveryReports.autonomousQuestionAnswers })
      .from(gapDiscoveryReports)
      .orderBy(desc(gapDiscoveryReports.id))
      .limit(1);
    const row = rows[0];
    if (!row?.autonomousQuestionAnswers) return [];
    return JSON.parse(row.autonomousQuestionAnswers) as Array<{
      question: string;
      answer: string;
      confidence: string;
      actionable: boolean;
      relatedGapDimension?: string;
    }>;
  }),

  // ── Gap stats summary ─────────────────────────────────────────────────────
  getGapStats: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { open: 0, investigating: 0, resolved: 0, deferred: 0, total: 0 };
    const all = await db.select({ status: gapCandidates.status }).from(gapCandidates);
    const stats = { open: 0, investigating: 0, resolved: 0, deferred: 0, rejected: 0, total: all.length };
    for (const row of all) {
      if (row.status === "OPEN") stats.open++;
      else if (row.status === "INVESTIGATING") stats.investigating++;
      else if (row.status === "RESOLVED") stats.resolved++;
      else if (row.status === "DEFERRED") stats.deferred++;
      else if (row.status === "REJECTED") stats.rejected++;
    }
    return stats;
  }),
});
