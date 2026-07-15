/**
 * arp1Router.ts — ARP-1 Atlas Autonomous Research Program 1
 * tRPC procedures for all 7 programs (A–G).
 */

import { z } from "zod";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import {
  getLiveOpsStatus,
  getRecentDiscoveryEvents,
  getDiscoveryStats,
  getAllModelLifecycles,
  getModelLifecycle,
  transitionModelState,
  getLifecycleStats,
  getLatestPortfolioIntelligence,
  getPortfolioIntelligenceHistory,
  getLatestWeeklyReview,
  getWeeklyReviewHistory,
  getLatestDailyBrief,
  getDailyBriefHistory,
} from "./arp1Db";

export const arp1Router = router({
  // ─── Program A: Live Operations ─────────────────────────────────────────────
  getLiveOpsStatus: publicProcedure.query(async () => {
    return getLiveOpsStatus();
  }),

  // ─── Program B: Continuous Discovery ────────────────────────────────────────
  getDiscoveryEvents: publicProcedure
    .input(z.object({ limit: z.number().min(1).max(200).default(50) }))
    .query(async ({ input }) => {
      return getRecentDiscoveryEvents(input.limit);
    }),

  getDiscoveryStats: publicProcedure.query(async () => {
    return getDiscoveryStats();
  }),

  // ─── Program D: Model Lifecycle ──────────────────────────────────────────────
  getAllModels: publicProcedure.query(async () => {
    return getAllModelLifecycles();
  }),

  getModel: publicProcedure
    .input(z.object({ modelId: z.string() }))
    .query(async ({ input }) => {
      return getModelLifecycle(input.modelId);
    }),

  getLifecycleStats: publicProcedure.query(async () => {
    return getLifecycleStats();
  }),

  transitionModel: protectedProcedure
    .input(
      z.object({
        modelId: z.string(),
        newState: z.enum([
          "DISCOVERY",
          "RESEARCH",
          "HISTORICAL_VALIDATION",
          "OUT_OF_SAMPLE",
          "WALK_FORWARD",
          "PAPER_TRADING",
          "PRODUCTION",
          "REVIEW",
          "RETIREMENT",
        ]),
        evidence: z.record(z.string(), z.unknown()).optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      return transitionModelState(input.modelId, input.newState, input.evidence);
    }),

  // ─── Program E: Portfolio Intelligence ──────────────────────────────────────
  getLatestPortfolioIntelligence: publicProcedure.query(async () => {
    return getLatestPortfolioIntelligence();
  }),

  getPortfolioIntelligenceHistory: publicProcedure
    .input(z.object({ limit: z.number().min(1).max(90).default(30) }))
    .query(async ({ input }) => {
      return getPortfolioIntelligenceHistory(input.limit);
    }),

  // ─── Program F: Weekly Reviews ───────────────────────────────────────────────
  getLatestWeeklyReview: publicProcedure.query(async () => {
    return getLatestWeeklyReview();
  }),

  getWeeklyReviewHistory: publicProcedure
    .input(z.object({ limit: z.number().min(1).max(52).default(12) }))
    .query(async ({ input }) => {
      return getWeeklyReviewHistory(input.limit);
    }),

  // ─── Program G: Daily Briefs ─────────────────────────────────────────────────
  getLatestDailyBrief: publicProcedure.query(async () => {
    return getLatestDailyBrief();
  }),

  getDailyBriefHistory: publicProcedure
    .input(z.object({ limit: z.number().min(1).max(30).default(14) }))
    .query(async ({ input }) => {
      return getDailyBriefHistory(input.limit);
    }),
});
