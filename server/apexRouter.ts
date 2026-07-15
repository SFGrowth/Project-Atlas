/**
 * apexRouter.ts — Sprint 112 Apex Evaluation tRPC router
 * DARWIN-S109-001 | Apex 50K Evaluation | Manual execution tracking
 */

import { z } from "zod";
import { router, protectedProcedure } from "./_core/trpc";
import {
  createApexTrade,
  closeApexTrade,
  getApexTrades,
  getOpenApexTrade,
  getApexStats,
  upsertApexSnapshot,
  getLatestApexSnapshot,
  getApexSnapshotHistory,
} from "./apexDb";

export const apexRouter = router({
  // ── Trade procedures ───────────────────────────────────────────────────────

  /** Record a new Apex trade (manual entry after Tradovate execution) */
  recordTrade: protectedProcedure
    .input(
      z.object({
        wfTradeId: z.number().optional(),
        tradeDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        direction: z.enum(["LONG", "SHORT"]),
        instrument: z.string().default("MNQ"),
        contracts: z.number().int().min(1).max(6).default(1),
        atlasSignalBarTime: z.number().optional(),
        atlasEntryPrice: z.number().optional(),
        atlasStopPrice: z.number().optional(),
        atlasTargetPrice: z.number().optional(),
        atlasAtr14: z.number().optional(),
        apexEntryPrice: z.number(),
        apexEntryTime: z.number().optional(),
        apexStopPrice: z.number(),
        apexTargetPrice: z.number(),
      })
    )
    .mutation(async ({ input }) => {
      await createApexTrade(input);
      return { success: true };
    }),

  /** Close an existing Apex trade with actual exit data */
  closeTrade: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        apexExitPrice: z.number(),
        apexExitTime: z.number().optional(),
        apexExitReason: z.enum(["TARGET", "STOP", "TIME_STOP", "MANUAL"]),
        apexPnl: z.number(),
        apexHoldingBars: z.number().optional(),
        divergenceNotes: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const result = await closeApexTrade(input);
      return { success: true, ...result };
    }),

  /** Get all Apex trades (paginated) */
  getTrades: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(200).default(50) }))
    .query(async ({ input }) => {
      return getApexTrades(input.limit);
    }),

  /** Get the currently open Apex trade (if any) */
  getOpenTrade: protectedProcedure
    .query(async () => {
      return getOpenApexTrade();
    }),

  /** Get aggregate Apex performance statistics */
  getStats: protectedProcedure
    .query(async () => {
      return getApexStats();
    }),

  // ── Snapshot procedures ────────────────────────────────────────────────────

  /** Upsert a daily account snapshot (manual entry from Tradovate dashboard) */
  upsertSnapshot: protectedProcedure
    .input(
      z.object({
        snapshotDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        currentBalance: z.number(),
        currentEquity: z.number(),
        unrealisedPnl: z.number().default(0),
        dailyPnl: z.number(),
        peakBalance: z.number(),
        trailingThreshold: z.number(),
        remainingTrailingDd: z.number(),
        currentDrawdown: z.number(),
        totalProfit: z.number(),
        passProgress: z.number().min(0).max(100),
        tradesToday: z.number().int().default(0),
        totalTrades: z.number().int().default(0),
        evaluationStatus: z.enum(["ACTIVE", "PASSED", "FAILED", "SUSPENDED"]).default("ACTIVE"),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      await upsertApexSnapshot(input);
      return { success: true };
    }),

  /** Get the latest account snapshot */
  getLatestSnapshot: protectedProcedure
    .query(async () => {
      return getLatestApexSnapshot();
    }),

  /** Get snapshot history (last N days) */
  getSnapshotHistory: protectedProcedure
    .input(z.object({ days: z.number().int().min(1).max(90).default(30) }))
    .query(async ({ input }) => {
      return getApexSnapshotHistory(input.days);
    }),

  // ── Combined dashboard data ────────────────────────────────────────────────

  /** Get all data needed for the Apex dashboard in one call */
  getDashboardData: protectedProcedure
    .query(async () => {
      const [stats, openTrade, latestSnapshot, recentTrades, snapshotHistory] =
        await Promise.all([
          getApexStats(),
          getOpenApexTrade(),
          getLatestApexSnapshot(),
          getApexTrades(20),
          getApexSnapshotHistory(30),
        ]);

      // Benchmark from Sprint 110 OOS (frozen)
      const benchmark = {
        winRate: 75.5,
        profitFactor: 4.609,
        maxDrawdown: 685,
        calmar: 49.8,
        totalTrades: 351,
        riskPerTrade: 450,
        apexPassRate: 99.5,
        apexRuinRate: 0.46,
        apexMedianTradesToPass: 5,
        apexTrailingDdLimit: 2000,
        apexProfitTarget: 3000,
      };

      // Apex rules
      const apexRules = {
        accountSize: 50000,
        profitTarget: 3000,
        trailingDdLimit: 2000,
        maxContracts: 6,
        dailyLossLimit: null,
        accessPeriodDays: 30,
      };

      // Promotion gates
      const gates = {
        minTrades: { required: 20, current: stats.totalTrades, passed: stats.totalTrades >= 20 },
        minDays: { required: 0, current: 0, passed: true },  // No minimum for Apex Intraday
        winRate: { required: 65, current: stats.winRate, passed: stats.winRate >= 65 },
        profitFactor: { required: 2.0, current: stats.profitFactor, passed: stats.profitFactor >= 2.0 },
        noCriticalDrift: { required: 0, current: stats.divergenceCount, passed: stats.divergenceCount === 0 },
        outcomeMatch: { required: 90, current: stats.outcomeMatchRate, passed: stats.outcomeMatchRate >= 90 },
      };

      const allGatesPassed = Object.values(gates).every(g => g.passed);
      const promotionStatus = stats.totalTrades === 0
        ? "AWAITING_TRADES"
        : stats.totalTrades < 20
        ? "IN_PROGRESS"
        : allGatesPassed
        ? "PROMOTION_ELIGIBLE"
        : stats.winRate < 50 || stats.profitFactor < 1.0
        ? "FAILED"
        : "IN_PROGRESS";

      return {
        stats,
        openTrade,
        latestSnapshot,
        recentTrades,
        snapshotHistory,
        benchmark,
        apexRules,
        gates,
        promotionStatus,
      };
    }),
});
