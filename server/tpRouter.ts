/**
 * tpRouter.ts — TradersPost Management tRPC Router
 *
 * Sprint 113: Exposes TradersPost config and dispatch log to the dashboard.
 *
 * Procedures:
 *   tp.getConfigs          — get all 4 strategy configs
 *   tp.setWebhookUrl       — set the TradersPost webhook URL for a strategy
 *   tp.armStrategy         — arm a strategy (blocked if frozen)
 *   tp.disarmStrategy      — disarm a strategy
 *   tp.setNotes            — update operator notes
 *   tp.getDispatchLog      — get recent dispatch log entries
 *   tp.getDispatchStats    — get dispatch stats per strategy
 */

import { z } from "zod";
import { router, protectedProcedure } from "./_core/trpc.js";
import {
  getAllTpConfigs,
  getTpConfig,
  setTpWebhookUrl,
  armTpStrategy,
  disarmTpStrategy,
  setTpNotes,
  getRecentTpDispatches,
  getTpDispatchStats,
  type TpStrategyId,
} from "./tpDb.js";

const VALID_STRATEGY_IDS = ["A1", "A3", "B1", "S109-001"] as const;
const strategyIdSchema = z.enum(VALID_STRATEGY_IDS);

export const tpRouter = router({
  /**
   * Get all 4 TradersPost strategy configs.
   */
  getConfigs: protectedProcedure.query(async () => {
    return getAllTpConfigs();
  }),

  /**
   * Get a single strategy config.
   */
  getConfig: protectedProcedure
    .input(z.object({ strategyId: strategyIdSchema }))
    .query(async ({ input }) => {
      return getTpConfig(input.strategyId as TpStrategyId);
    }),

  /**
   * Set the TradersPost webhook URL for a strategy.
   * URL must be a valid HTTPS URL from traderspost.io.
   */
  setWebhookUrl: protectedProcedure
    .input(z.object({
      strategyId: strategyIdSchema,
      webhookUrl: z.string().url().refine(
        (url) => url.startsWith("https://traderspost.io/") || url.startsWith("https://app.traderspost.io/"),
        { message: "URL must be a TradersPost webhook URL (https://traderspost.io/ or https://app.traderspost.io/)" }
      ),
    }))
    .mutation(async ({ input }) => {
      await setTpWebhookUrl(input.strategyId as TpStrategyId, input.webhookUrl);
      return { success: true, message: `Webhook URL set for ${input.strategyId}` };
    }),

  /**
   * Arm a strategy.
   * Blocked if frozenUntilOwnerApproval === true (S109-001).
   * Blocked if webhookUrl is not set.
   */
  armStrategy: protectedProcedure
    .input(z.object({ strategyId: strategyIdSchema }))
    .mutation(async ({ input }) => {
      const result = await armTpStrategy(input.strategyId as TpStrategyId);
      if (!result.success) {
        throw new Error(result.reason);
      }
      return { success: true, message: result.reason };
    }),

  /**
   * Disarm a strategy.
   */
  disarmStrategy: protectedProcedure
    .input(z.object({ strategyId: strategyIdSchema }))
    .mutation(async ({ input }) => {
      await disarmTpStrategy(input.strategyId as TpStrategyId);
      return { success: true, message: `${input.strategyId} DISARMED` };
    }),

  /**
   * Update operator notes for a strategy.
   */
  setNotes: protectedProcedure
    .input(z.object({ strategyId: strategyIdSchema, notes: z.string().max(2000) }))
    .mutation(async ({ input }) => {
      await setTpNotes(input.strategyId as TpStrategyId, input.notes);
      return { success: true };
    }),

  /**
   * Get recent dispatch log entries (newest first).
   */
  getDispatchLog: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(200).default(50) }))
    .query(async ({ input }) => {
      return getRecentTpDispatches(input.limit);
    }),

  /**
   * Get dispatch stats per strategy.
   */
  getDispatchStats: protectedProcedure.query(async () => {
    return getTpDispatchStats();
  }),
});
