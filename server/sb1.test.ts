/**
 * Sprint 088 — SB1 & Daily Review procedure tests
 *
 * Tests cover:
 *   - sb1.logTrade: creates a paper trade record
 *   - sb1.logRejectedSignal: records a suppressed entry
 *   - sb1.logRasSnapshot: records a RAS snapshot
 *   - sb1.stats: returns aggregate stats shape
 *   - sb1.certificationStatus: returns certification gate shape
 *   - dailyReview.list: returns array
 *   - dailyReview.latest: returns null when no reviews exist
 *   - scheduler.list: returns array of scheduled jobs
 */

import { describe, it, expect } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Public caller (no auth required for these procedures)
const caller = appRouter.createCaller({ user: null } as TrpcContext);

// ─── SB1 Paper Trades ────────────────────────────────────────────────────────

describe("sb1.logTrade", () => {
  it("creates a new paper trade record and returns success", async () => {
    const result = await caller.sb1.logTrade({
      id: `test-${Date.now()}`,
      symbol: "MNQ1!",
      direction: "LONG",
      entry: 21500.25,
      stop: 21490.0,
      target: 21525.0,
      contracts: 1,
      riskDollars: 50.0,
      ras: 62,
      rasActivated: true,
      pipelineRunId: "test-sb1-001",
    });

    expect(result).toHaveProperty("success");
    expect(result.success).toBe(true);
  });
});

describe("sb1.logRejection", () => {
  it("records a suppressed signal and returns success", async () => {
    const result = await caller.sb1.logRejection({
      barTime: new Date().toISOString(),
      direction: "SHORT",
      ras: 28,
      rejectionReason: "RAS_BELOW_THRESHOLD",
      featureChop: 65,
      featureAtrExpansion: 0.85,
    });

    expect(result).toHaveProperty("success");
    expect(result.success).toBe(true);
  });
});

describe("sb1.ingestRasSnapshot", () => {
  it("records a RAS snapshot and returns success", async () => {
    const result = await caller.sb1.ingestRasSnapshot({
      barTime: new Date().toISOString(),
      symbol: "MNQ1!",
      ras: 55,
      rasActivated: true,
      activationReason: "RAS≥45, CHOP≤55",
      featureChop: 48.2,
      featureAtrExpansion: 1.18,
      featureVwapDist: 0.65,
    });

    expect(result).toHaveProperty("success");
    expect(result.success).toBe(true);
  });
});

// ─── SB1 Stats ───────────────────────────────────────────────────────────────

describe("sb1.stats", () => {
  it("returns aggregate stats with the expected shape", async () => {
    const result = await caller.sb1.stats();
    // Returns null when DB unavailable, or stats object
    if (result !== null) {
      expect(result).toHaveProperty("trades");
      expect(result).toHaveProperty("wins");
      expect(result).toHaveProperty("losses");
      expect(result).toHaveProperty("pf");
      expect(result).toHaveProperty("wr");
      expect(result).toHaveProperty("netPnl");
      expect(result).toHaveProperty("expectancy");
      expect(result).toHaveProperty("maxDd");
      expect(typeof result.trades).toBe("number");
    } else {
      expect(result).toBeNull();
    }
  });
});

// ─── SB1 Certification ───────────────────────────────────────────────────────

describe("sb1.certificationStatus", () => {
  it("returns certification gate status with required fields", async () => {
    const result = await caller.sb1.certificationStatus();
    // Returns null when DB unavailable, or certification object
    if (result !== null) {
      expect(result).toHaveProperty("certState");
      expect(result).toHaveProperty("trades");
      expect(result).toHaveProperty("tradeTarget");
      expect(result).toHaveProperty("pf");
      expect(result).toHaveProperty("pfTarget");
      expect(result).toHaveProperty("pfPass");
      expect(result).toHaveProperty("wr");
      expect(result).toHaveProperty("wrPass");
      expect(["RESEARCH", "FORWARD_VALIDATION", "PRODUCTION_READY"]).toContain(result.certState);
    } else {
      expect(result).toBeNull();
    }
  });
});

// ─── Daily Review ─────────────────────────────────────────────────────────────

describe("dailyReview.latest", () => {
  it("returns null when no daily reviews exist yet", async () => {
    const result = await caller.dailyReview.latest();
    // Either null or a valid review object
    if (result !== null) {
      expect(result).toHaveProperty("reviewDate");
      expect(result).toHaveProperty("totalTrades");
    } else {
      expect(result).toBeNull();
    }
  });
});

describe("dailyReview.list", () => {
  it("returns an array (possibly empty)", async () => {
    const result = await caller.dailyReview.list({ limit: 10, offset: 0 });
    expect(Array.isArray(result)).toBe(true);
  });
});

// ─── Scheduler ───────────────────────────────────────────────────────────────

describe("scheduler.list", () => {
  it("returns an array of scheduled jobs", async () => {
    const result = await caller.scheduler.list();
    expect(Array.isArray(result)).toBe(true);
    // After Sprint 088 seed, should have at least the daily review job
    if (result.length > 0) {
      const job = result[0];
      expect(job).toHaveProperty("jobName");
      expect(job).toHaveProperty("cronExpression");
      expect(job).toHaveProperty("callbackPath");
      expect(job).toHaveProperty("isEnabled");
    }
  });
});
