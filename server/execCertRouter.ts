/**
 * execCertRouter.ts — Sprint 112 Parts 8–9
 * tRPC procedures for Execution Certification and Apex Safety Lockout.
 */

import { z } from "zod";
import { router, protectedProcedure, publicProcedure } from "./_core/trpc";
import {
  STAGE_DEFINITIONS,
  createCertRun,
  recordStageResult,
  getLatestCertRun,
  getCertRunHistory,
  getCertRunById,
  abortCertRun,
  getSafetyState,
  triggerHalt,
  acknowledgeHalt,
  clearHalt,
  resetDailyCounters,
  getSafetyLog,
  SAFETY_CONFIG,
} from "./execCertDb";

export const execCertRouter = router({
  getStageDefinitions: publicProcedure.query(() => {
    return STAGE_DEFINITIONS;
  }),

  startRun: protectedProcedure
    .input(z.object({
      runType: z.enum(["DRY_RUN", "PRE_LIVE_GATE"]),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const runId = await createCertRun(input.runType, input.notes);
      return { runId };
    }),

  recordStage: protectedProcedure
    .input(z.object({
      runId: z.number().int(),
      stageNumber: z.number().int().min(1).max(15),
      status: z.enum(["PASS", "FAIL", "SKIP"]),
      latencyMs: z.number().int().optional(),
      retryCount: z.number().int().optional(),
      errorMessage: z.string().optional(),
      details: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      await recordStageResult(input.runId, input.stageNumber, input.status, {
        latencyMs: input.latencyMs,
        retryCount: input.retryCount,
        errorMessage: input.errorMessage,
        details: input.details,
      });
      return { ok: true };
    }),

  getLatestRun: publicProcedure.query(async () => {
    return getLatestCertRun();
  }),

  getRunHistory: publicProcedure
    .input(z.object({ limit: z.number().int().min(1).max(100).default(20) }))
    .query(async ({ input }) => {
      return getCertRunHistory(input.limit);
    }),

  getRunById: publicProcedure
    .input(z.object({ runId: z.number().int() }))
    .query(async ({ input }) => {
      return getCertRunById(input.runId);
    }),

  abortRun: protectedProcedure
    .input(z.object({ runId: z.number().int() }))
    .mutation(async ({ input }) => {
      await abortCertRun(input.runId);
      return { ok: true };
    }),

  getSafetyState: publicProcedure.query(async () => {
    const state = await getSafetyState();
    return { state, config: SAFETY_CONFIG };
  }),

  triggerHalt: protectedProcedure
    .input(z.object({
      reason: z.enum(["DAILY_LOSS_LOCKOUT", "CONSECUTIVE_LOSS_PROTECTION", "EXECUTION_ANOMALY", "WEBHOOK_FAILURE", "DATA_INTEGRITY_FAILURE", "DRIFT_SUSPENSION"]),
      details: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      await triggerHalt(input.reason, input.details, ctx.user.name ?? "operator");
      return { ok: true };
    }),

  acknowledgeHalt: protectedProcedure
    .input(z.object({ note: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      await acknowledgeHalt(ctx.user.name ?? "operator", input.note);
      return { ok: true };
    }),

  clearHalt: protectedProcedure
    .input(z.object({ note: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      await clearHalt(ctx.user.name ?? "operator", input.note);
      return { ok: true };
    }),

  resetDailyCounters: protectedProcedure
    .mutation(async () => {
      await resetDailyCounters();
      return { ok: true };
    }),

  getSafetyLog: publicProcedure
    .input(z.object({ limit: z.number().int().min(1).max(200).default(50) }))
    .query(async ({ input }) => {
      return getSafetyLog(input.limit);
    }),
});
