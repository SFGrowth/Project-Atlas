/**
 * tpRouter.ts — Sprint 114A: Unified Portfolio Execution tRPC Router
 *
 * Procedures:
 *   tp.getPortfolioConfig       — get master execution state + webhook config
 *   tp.setWebhookUrl            — set the single portfolio TradersPost webhook URL
 *   tp.activateApex             — transition PAPER_ONLY → APEX_EVAL_ACTIVE (owner approval)
 *   tp.haltPortfolio            — transition any state → HALTED
 *   tp.resumePaper              — transition HALTED → PAPER_ONLY
 *   tp.getStrategyControls      — get all 6 strategy ENABLED/PAUSED/RETIRED/FAULTED states
 *   tp.setStrategyStatus        — pause/enable/retire a strategy
 *   tp.getDispatchLog           — get recent dispatch log entries
 *   tp.getDispatchStats         — get dispatch stats per strategy
 *
 * Legacy per-strategy arm/disarm procedures are REMOVED.
 * The old tp_config rows are preserved for historical audit only.
 */

import { z } from "zod";
import { router, protectedProcedure } from "./_core/trpc.js";
import {
  getPortfolioExecConfig,
  setExecutionState,
  setPortfolioWebhookUrl,
  getAllStrategyControls,
  setStrategyStatus,
  type ExecutionState,
  type StrategyStatus,
} from "./portfolioExecDb.js";
import {
  getRecentTpDispatches,
  getTpDispatchStats,
} from "./tpDb.js";

const VALID_STRATEGY_IDS = ["A1", "A3", "B1", "SB1", "ORB-1", "S109-001"] as const;
const strategyIdSchema = z.enum(VALID_STRATEGY_IDS);
const strategyStatusSchema = z.enum(["ENABLED", "PAUSED", "RETIRED", "FAULTED"]);

export const tpRouter = router({
  /**
   * Get the master portfolio execution config (singleton).
   */
  getPortfolioConfig: protectedProcedure.query(async () => {
    return getPortfolioExecConfig();
  }),

  /**
   * Set the single TradersPost webhook URL for the entire portfolio.
   * URL must be a valid HTTPS URL from traderspost.io.
   */
  setWebhookUrl: protectedProcedure
    .input(z.object({
      webhookUrl: z.string().url().refine(
        (url) => url.startsWith("https://traderspost.io/") || url.startsWith("https://app.traderspost.io/"),
        { message: "URL must be a TradersPost webhook URL (https://traderspost.io/ or https://app.traderspost.io/)" }
      ),
    }))
    .mutation(async ({ input }) => {
      await setPortfolioWebhookUrl(input.webhookUrl);
      return { success: true, message: "Portfolio webhook URL updated" };
    }),

  /**
   * Activate Apex evaluation — transition PAPER_ONLY → APEX_EVAL_ACTIVE.
   * Requires owner approval. Blocked if webhook URL is not set.
   * This is a one-time activation; no daily re-arming required.
   */
  activateApex: protectedProcedure
    .input(z.object({
      ownerConfirmed: z.literal(true, { message: "Owner confirmation required" }),
    }))
    .mutation(async ({ input: _ }) => {
      const config = await getPortfolioExecConfig();
      if (!config) throw new Error("Portfolio execution config not found");
      if (!config.webhookUrl) throw new Error("Set the TradersPost webhook URL before activating Apex");
      if (config.executionState === "APEX_EVAL_ACTIVE") {
        return { success: true, message: "Already APEX_EVAL_ACTIVE" };
      }
      const result = await setExecutionState("APEX_EVAL_ACTIVE", { activatedByOwner: true });
      if (!result.success) throw new Error(result.reason);
      return { success: true, message: "Portfolio activated: APEX_EVAL_ACTIVE. Live dispatch enabled." };
    }),

  /**
   * Halt the portfolio — transition any state → HALTED.
   * Blocks all TradersPost dispatch immediately.
   */
  haltPortfolio: protectedProcedure
    .input(z.object({ reason: z.string().min(1).max(256) }))
    .mutation(async ({ input }) => {
      const result = await setExecutionState("HALTED", { haltReason: input.reason });
      if (!result.success) throw new Error(result.reason);
      return { success: true, message: `Portfolio HALTED: ${input.reason}` };
    }),

  /**
   * Resume paper trading — transition HALTED → PAPER_ONLY.
   * Clears halt reason. Does NOT re-activate Apex.
   */
  resumePaper: protectedProcedure.mutation(async () => {
    const result = await setExecutionState("PAPER_ONLY");
    if (!result.success) throw new Error(result.reason);
    return { success: true, message: "Portfolio resumed: PAPER_ONLY" };
  }),

  /**
   * Get all 6 strategy ENABLED/PAUSED/RETIRED/FAULTED controls.
   */
  getStrategyControls: protectedProcedure.query(async () => {
    return getAllStrategyControls();
  }),

  /**
   * Set a strategy's status (ENABLED/PAUSED/RETIRED/FAULTED).
   * PAUSED = excluded from ADE proposals until re-enabled.
   * RETIRED = permanently excluded (kept for historical reporting).
   * FAULTED = auto-set by safety engine on invalid signals.
   */
  setStrategyStatus: protectedProcedure
    .input(z.object({
      strategyId: strategyIdSchema,
      status: strategyStatusSchema,
      reason: z.string().max(256).optional(),
    }))
    .mutation(async ({ input }) => {
      const result = await setStrategyStatus(input.strategyId, input.status as StrategyStatus, input.reason);
      if (!result.success) throw new Error(result.reason);
      return { success: true, message: result.reason };
    }),

  /**
   * Get recent dispatch log entries (newest first).
   * All dispatches are tagged with selected_strategy_id for per-model reporting.
   */
  getDispatchLog: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(200).default(50) }))
    .query(async ({ input }) => {
      return getRecentTpDispatches(input.limit);
    }),

  /**
   * Get dispatch stats per strategy (from tp_dispatch_log.strategy_id).
   */
  getDispatchStats: protectedProcedure.query(async () => {
    return getTpDispatchStats();
  }),
});
