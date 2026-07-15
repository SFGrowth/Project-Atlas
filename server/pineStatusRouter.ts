/**
 * Pine Status Router — Sprint 117
 * tRPC procedures for Atlas Unified Portfolio Pine Script status,
 * parity tracking, drift detection, and webhook signal logging.
 */

import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { strategyRegistry } from "../drizzle/schema";
import { eq, and, isNotNull } from "drizzle-orm";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PineStrategyStatus {
  strategyId: string;
  name: string;
  pineEnabled: boolean;
  pineStrategyKey: string | null;
  pineVersion: string | null;
  pineRuleHash: string | null;
  pineParityStatus: string;
  pineLastVerifiedAt: number | null;
  pineChartColour: string | null;
  pineWebhookEnabled: boolean;
  pineLastWebhookAt: number | null;
  pineLastSignalAt: number | null;
  pineLastSignalDirection: string | null;
  pineLastSignalScore: string | null;
  pineKnownGaps: string | null;
  stage: string;
}

export interface PinePortfolioStatus {
  scriptVersion: string;
  ruleHash: string;
  portfolioParityStatus: "VALIDATED" | "PENDING_VALIDATION" | "DRIFT_DETECTED" | "NOT_CONFIGURED";
  strategiesEnabled: number;
  strategiesValidated: number;
  strategiesPendingValidation: number;
  strategiesDriftDetected: number;
  lastWebhookAt: number | null;
  lastSignalAt: number | null;
  strategies: PineStrategyStatus[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const CURRENT_RULE_HASH = "ATLAS-PORT-117-2026-07-15";
const CURRENT_SCRIPT_VERSION = "1.0.0";

function derivePortfolioParityStatus(
  strategies: PineStrategyStatus[]
): PinePortfolioStatus["portfolioParityStatus"] {
  const enabled = strategies.filter((s) => s.pineEnabled);
  if (enabled.length === 0) return "NOT_CONFIGURED";
  if (enabled.some((s) => s.pineParityStatus === "DRIFT_DETECTED")) return "DRIFT_DETECTED";
  if (enabled.some((s) => s.pineParityStatus === "PENDING_VALIDATION")) return "PENDING_VALIDATION";
  if (enabled.every((s) => s.pineParityStatus === "VALIDATED")) return "VALIDATED";
  return "PENDING_VALIDATION";
}

// ── Router ────────────────────────────────────────────────────────────────────

export const pineStatusRouter = router({
  /**
   * Get full portfolio Pine status — all 6 strategies + aggregate
   */
  getPortfolioStatus: protectedProcedure.query(async (): Promise<PinePortfolioStatus> => {
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");

    const rows = await db
      .select()
      .from(strategyRegistry)
      .where(isNotNull(strategyRegistry.pineStrategyKey));

    const strategies: PineStrategyStatus[] = rows.map((r) => ({
      strategyId: r.strategyId,
      name: r.name,
      pineEnabled: r.pineEnabled ?? false,
      pineStrategyKey: r.pineStrategyKey ?? null,
      pineVersion: r.pineVersion ?? null,
      pineRuleHash: r.pineRuleHash ?? null,
      pineParityStatus: r.pineParityStatus ?? "NOT_CONFIGURED",
      pineLastVerifiedAt: r.pineLastVerifiedAt ?? null,
      pineChartColour: r.pineChartColour ?? null,
      pineWebhookEnabled: r.pineWebhookEnabled ?? false,
      pineLastWebhookAt: r.pineLastWebhookAt ?? null,
      pineLastSignalAt: r.pineLastSignalAt ?? null,
      pineLastSignalDirection: r.pineLastSignalDirection ?? null,
      pineLastSignalScore: r.pineLastSignalScore ?? null,
      pineKnownGaps: r.pineKnownGaps ?? null,
      stage: r.stage,
    }));

    // Check for drift — if rule hash doesn't match current, flag it
    for (const s of strategies) {
      if (s.pineEnabled && s.pineRuleHash && s.pineRuleHash !== CURRENT_RULE_HASH) {
        s.pineParityStatus = "DRIFT_DETECTED";
      }
    }

    const enabled = strategies.filter((s) => s.pineEnabled);
    const lastWebhookAt = enabled
      .map((s) => s.pineLastWebhookAt)
      .filter(Boolean)
      .sort((a, b) => (b ?? 0) - (a ?? 0))[0] ?? null;
    const lastSignalAt = enabled
      .map((s) => s.pineLastSignalAt)
      .filter(Boolean)
      .sort((a, b) => (b ?? 0) - (a ?? 0))[0] ?? null;

    return {
      scriptVersion: CURRENT_SCRIPT_VERSION,
      ruleHash: CURRENT_RULE_HASH,
      portfolioParityStatus: derivePortfolioParityStatus(strategies),
      strategiesEnabled: enabled.length,
      strategiesValidated: enabled.filter((s) => s.pineParityStatus === "VALIDATED").length,
      strategiesPendingValidation: enabled.filter((s) => s.pineParityStatus === "PENDING_VALIDATION").length,
      strategiesDriftDetected: enabled.filter((s) => s.pineParityStatus === "DRIFT_DETECTED").length,
      lastWebhookAt,
      lastSignalAt,
      strategies,
    };
  }),

  /**
   * Update parity status for a strategy (owner only)
   */
  updateParityStatus: protectedProcedure
    .input(
      z.object({
        strategyId: z.string(),
        parityStatus: z.enum(["VALIDATED", "PENDING_VALIDATION", "DRIFT_DETECTED", "NOT_CONFIGURED", "SUSPENDED"]),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      await db
        .update(strategyRegistry)
        .set({
          pineParityStatus: input.parityStatus,
          pineLastVerifiedAt: input.parityStatus === "VALIDATED" ? Date.now() : undefined,
          updatedAt: new Date(),
        })
        .where(eq(strategyRegistry.strategyId, input.strategyId));

      return { success: true, strategyId: input.strategyId, parityStatus: input.parityStatus };
    }),

  /**
   * Toggle Pine webhook enabled for a strategy
   */
  toggleWebhook: protectedProcedure
    .input(
      z.object({
        strategyId: z.string(),
        enabled: z.boolean(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      await db
        .update(strategyRegistry)
        .set({
          pineWebhookEnabled: input.enabled,
          updatedAt: new Date(),
        })
        .where(eq(strategyRegistry.strategyId, input.strategyId));

      return { success: true, strategyId: input.strategyId, webhookEnabled: input.enabled };
    }),

  /**
   * Record a Pine webhook signal (called by the webhook receiver when a Pine payload arrives)
   */
  recordSignal: protectedProcedure
    .input(
      z.object({
        strategyId: z.string(),
        direction: z.string(),
        score: z.number(),
        webhookAt: z.number(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      await db
        .update(strategyRegistry)
        .set({
          pineLastWebhookAt: input.webhookAt,
          pineLastSignalAt: input.webhookAt,
          pineLastSignalDirection: input.direction,
          pineLastSignalScore: String(input.score),
          updatedAt: new Date(),
        })
        .where(eq(strategyRegistry.strategyId, input.strategyId));

      return { success: true };
    }),

  /**
   * Get Pine script manifest info (version, hash, parity spec)
   */
  getManifest: protectedProcedure.query(async () => {
    return {
      scriptVersion: CURRENT_SCRIPT_VERSION,
      ruleHash: CURRENT_RULE_HASH,
      scriptName: "atlas_portfolio_v1.pine",
      sprint: 117,
      buildDate: "2026-07-15",
      adeVersion: "ADE-v2.0",
      portfolioVersion: "PORT-v1.0",
      strategiesIncluded: ["A1", "A3", "SB1", "ORB-1", "S109-001", "B1"],
      paritySpecUrl: "tradingview/atlas-unified-portfolio/ADE_PARITY_SPEC.md",
      webhookSchemaUrl: "tradingview/atlas-unified-portfolio/WEBHOOK_SCHEMA.md",
      changelogUrl: "tradingview/atlas-unified-portfolio/CHANGELOG.md",
      invariants: {
        singleActiveStrategy: true,
        confirmedBarOnly: true,
        noRepainting: true,
        serverIsAuthoritative: true,
        frozenS109Parameters: true,
      },
    };
  }),
});
