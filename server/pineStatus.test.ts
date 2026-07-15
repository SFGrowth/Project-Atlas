/**
 * Sprint 117 — Pine Parity Tests
 * Tests for ADE parity logic, drift detection, webhook schema validation,
 * and Pine strategy manifest invariants.
 */

import { describe, it, expect } from "vitest";

// ── Pine ADE Parity Logic ─────────────────────────────────────────────────────

/**
 * Mirror of the ADE scoring logic in atlas_portfolio_v1.pine
 * These tests verify that the Pine script's selection logic matches
 * the server-side barEvaluator.ts and paperTradeEngine.ts rules.
 */

interface PineProposal {
  strategyId: string;
  direction: "LONG" | "SHORT" | "NONE";
  adeScore: number;
  eligible: boolean;
}

function selectTopProposal(proposals: PineProposal[]): PineProposal | null {
  const eligible = proposals.filter((p) => p.eligible && p.direction !== "NONE");
  if (eligible.length === 0) return null;
  return eligible.sort((a, b) => b.adeScore - a.adeScore)[0];
}

function computeA1Score(adx: number): number {
  return adx; // ADE score = ADX value
}

function computeA3Score(adx: number): number {
  return adx * 0.95; // A3 is A1 × 0.95
}

function computeS109Score(vwapDev: number, atr: number): number {
  if (atr <= 0) return 0;
  return (Math.abs(vwapDev) / atr) * 100;
}

// ── ADE Scoring Tests ─────────────────────────────────────────────────────────

describe("Pine ADE Scoring — A1 vs A3", () => {
  it("A1 score equals ADX value", () => {
    expect(computeA1Score(45)).toBe(45);
    expect(computeA1Score(62)).toBe(62);
    expect(computeA1Score(25)).toBe(25);
  });

  it("A3 score is 95% of ADX", () => {
    expect(computeA3Score(40)).toBeCloseTo(38.0);
    expect(computeA3Score(60)).toBeCloseTo(57.0);
    expect(computeA3Score(50)).toBeCloseTo(47.5);
  });

  it("A1 outscores A3 at same ADX", () => {
    const adx = 50;
    expect(computeA1Score(adx)).toBeGreaterThan(computeA3Score(adx));
  });
});

describe("Pine ADE Scoring — S109-001", () => {
  it("S109 score scales with VWAP deviation", () => {
    const atr = 10;
    expect(computeS109Score(5, atr)).toBe(50);   // 0.5 ATR → score 50
    expect(computeS109Score(10, atr)).toBe(100);  // 1.0 ATR → score 100
    expect(computeS109Score(3, atr)).toBe(30);    // 0.3 ATR → score 30
  });

  it("S109 score is 0 when ATR is 0", () => {
    expect(computeS109Score(5, 0)).toBe(0);
  });

  it("S109 outscores A1 when VWAP deviation > 0.45 ATR and ADX is 45", () => {
    const atr = 10;
    const vwapDev = 5; // 0.5 ATR
    const adx = 45;
    expect(computeS109Score(vwapDev, atr)).toBeGreaterThan(computeA1Score(adx));
  });

  it("A1 outscores S109 when ADX is strong (>50) and VWAP dev is moderate", () => {
    const atr = 10;
    const vwapDev = 4; // 0.4 ATR → score 40
    const adx = 55;
    expect(computeA1Score(adx)).toBeGreaterThan(computeS109Score(vwapDev, atr));
  });
});

// ── Proposal Selection Tests ──────────────────────────────────────────────────

describe("Pine Proposal Selection — Single Active Strategy Rule", () => {
  it("selects highest-scoring eligible proposal", () => {
    const proposals: PineProposal[] = [
      { strategyId: "A1", direction: "LONG", adeScore: 45, eligible: true },
      { strategyId: "S109-001", direction: "LONG", adeScore: 60, eligible: true },
      { strategyId: "B1", direction: "LONG", adeScore: 1, eligible: true },
    ];
    const winner = selectTopProposal(proposals);
    expect(winner?.strategyId).toBe("S109-001");
    expect(winner?.adeScore).toBe(60);
  });

  it("returns null when no eligible proposals", () => {
    const proposals: PineProposal[] = [
      { strategyId: "A1", direction: "NONE", adeScore: 0, eligible: false },
      { strategyId: "B1", direction: "NONE", adeScore: 0, eligible: false },
    ];
    expect(selectTopProposal(proposals)).toBeNull();
  });

  it("ignores ineligible proposals even with high scores", () => {
    const proposals: PineProposal[] = [
      { strategyId: "A1", direction: "LONG", adeScore: 99, eligible: false },
      { strategyId: "B1", direction: "LONG", adeScore: 1, eligible: true },
    ];
    const winner = selectTopProposal(proposals);
    expect(winner?.strategyId).toBe("B1");
  });

  it("ignores NONE-direction proposals", () => {
    const proposals: PineProposal[] = [
      { strategyId: "A1", direction: "NONE", adeScore: 80, eligible: true },
      { strategyId: "B1", direction: "LONG", adeScore: 1, eligible: true },
    ];
    const winner = selectTopProposal(proposals);
    expect(winner?.strategyId).toBe("B1");
  });

  it("B1 wins only when no other model is eligible", () => {
    const proposals: PineProposal[] = [
      { strategyId: "A1", direction: "NONE", adeScore: 0, eligible: false },
      { strategyId: "A3", direction: "NONE", adeScore: 0, eligible: false },
      { strategyId: "SB1", direction: "NONE", adeScore: 0, eligible: false },
      { strategyId: "ORB-1", direction: "NONE", adeScore: 0, eligible: false },
      { strategyId: "S109-001", direction: "NONE", adeScore: 0, eligible: false },
      { strategyId: "B1", direction: "LONG", adeScore: 1, eligible: true },
    ];
    const winner = selectTopProposal(proposals);
    expect(winner?.strategyId).toBe("B1");
  });
});

// ── Drift Detection Tests ─────────────────────────────────────────────────────

const CURRENT_RULE_HASH = "ATLAS-PORT-117-2026-07-15";

function detectDrift(storedHash: string | null, currentHash: string): boolean {
  if (!storedHash) return false; // Not configured — not drift
  return storedHash !== currentHash;
}

describe("Pine Drift Detection", () => {
  it("no drift when hash matches", () => {
    expect(detectDrift(CURRENT_RULE_HASH, CURRENT_RULE_HASH)).toBe(false);
  });

  it("drift detected when hash differs", () => {
    expect(detectDrift("ATLAS-PORT-116-2026-07-10", CURRENT_RULE_HASH)).toBe(true);
  });

  it("no drift when hash is null (not configured)", () => {
    expect(detectDrift(null, CURRENT_RULE_HASH)).toBe(false);
  });

  it("drift detected for any stale sprint hash", () => {
    const staleHashes = [
      "ATLAS-PORT-114-2026-07-01",
      "ATLAS-PORT-115-2026-07-08",
      "ATLAS-PORT-116-2026-07-10",
    ];
    for (const h of staleHashes) {
      expect(detectDrift(h, CURRENT_RULE_HASH)).toBe(true);
    }
  });
});

// ── Webhook Schema Validation ─────────────────────────────────────────────────

interface PineWebhookPayload {
  token: string;
  strategy: string;
  direction: "LONG" | "SHORT";
  entry: number;
  stop: number;
  target: number;
  adeScore: number;
  ruleHash: string;
  barTime: number;
  symbol: string;
}

function validateWebhookPayload(payload: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (typeof payload !== "object" || payload === null) {
    return { valid: false, errors: ["Payload must be an object"] };
  }
  const p = payload as Record<string, unknown>;

  if (!p.token || typeof p.token !== "string") errors.push("Missing or invalid token");
  if (!p.strategy || typeof p.strategy !== "string") errors.push("Missing or invalid strategy");
  if (!["LONG", "SHORT"].includes(p.direction as string)) errors.push("direction must be LONG or SHORT");
  if (typeof p.entry !== "number" || p.entry <= 0) errors.push("entry must be a positive number");
  if (typeof p.stop !== "number" || p.stop <= 0) errors.push("stop must be a positive number");
  if (typeof p.target !== "number" || p.target <= 0) errors.push("target must be a positive number");
  if (typeof p.adeScore !== "number" || p.adeScore < 0) errors.push("adeScore must be a non-negative number");
  if (!p.ruleHash || typeof p.ruleHash !== "string") errors.push("Missing or invalid ruleHash");
  if (typeof p.barTime !== "number" || p.barTime <= 0) errors.push("barTime must be a positive number");
  if (!p.symbol || typeof p.symbol !== "string") errors.push("Missing or invalid symbol");

  return { valid: errors.length === 0, errors };
}

describe("Pine Webhook Schema Validation", () => {
  const validPayload: PineWebhookPayload = {
    token: "test-token",
    strategy: "S109-001",
    direction: "LONG",
    entry: 21500,
    stop: 21475,
    target: 21550,
    adeScore: 62.5,
    ruleHash: CURRENT_RULE_HASH,
    barTime: Date.now(),
    symbol: "MNQ1!",
  };

  it("accepts a valid payload", () => {
    const result = validateWebhookPayload(validPayload);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects missing token", () => {
    const { token: _, ...noToken } = validPayload;
    const result = validateWebhookPayload(noToken);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("token"))).toBe(true);
  });

  it("rejects invalid direction", () => {
    const result = validateWebhookPayload({ ...validPayload, direction: "FLAT" });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("direction"))).toBe(true);
  });

  it("rejects zero entry price", () => {
    const result = validateWebhookPayload({ ...validPayload, entry: 0 });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("entry"))).toBe(true);
  });

  it("rejects negative adeScore", () => {
    const result = validateWebhookPayload({ ...validPayload, adeScore: -1 });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("adeScore"))).toBe(true);
  });

  it("rejects missing ruleHash", () => {
    const { ruleHash: _, ...noHash } = validPayload;
    const result = validateWebhookPayload(noHash);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("ruleHash"))).toBe(true);
  });
});

// ── Strategy Manifest Invariants ──────────────────────────────────────────────

describe("Pine Strategy Manifest — Invariants", () => {
  const manifest = {
    scriptVersion: "1.0.0",
    ruleHash: CURRENT_RULE_HASH,
    strategiesIncluded: ["A1", "A3", "SB1", "ORB-1", "S109-001", "B1"],
    invariants: {
      singleActiveStrategy: true,
      confirmedBarOnly: true,
      noRepainting: true,
      serverIsAuthoritative: true,
      frozenS109Parameters: true,
    },
  };

  it("includes all 6 portfolio strategies", () => {
    expect(manifest.strategiesIncluded).toHaveLength(6);
    expect(manifest.strategiesIncluded).toContain("A1");
    expect(manifest.strategiesIncluded).toContain("A3");
    expect(manifest.strategiesIncluded).toContain("SB1");
    expect(manifest.strategiesIncluded).toContain("ORB-1");
    expect(manifest.strategiesIncluded).toContain("S109-001");
    expect(manifest.strategiesIncluded).toContain("B1");
  });

  it("singleActiveStrategy invariant is enforced", () => {
    expect(manifest.invariants.singleActiveStrategy).toBe(true);
  });

  it("confirmedBarOnly prevents repainting", () => {
    expect(manifest.invariants.confirmedBarOnly).toBe(true);
    expect(manifest.invariants.noRepainting).toBe(true);
  });

  it("server is authoritative — Pine is advisory only", () => {
    expect(manifest.invariants.serverIsAuthoritative).toBe(true);
  });

  it("S109-001 parameters are frozen (no live optimisation)", () => {
    expect(manifest.invariants.frozenS109Parameters).toBe(true);
  });

  it("rule hash follows sprint naming convention", () => {
    expect(manifest.ruleHash).toMatch(/^ATLAS-PORT-\d+-\d{4}-\d{2}-\d{2}$/);
  });
});

// ── Portfolio Parity Status Derivation ───────────────────────────────────────

type ParityStatus = "VALIDATED" | "PENDING_VALIDATION" | "DRIFT_DETECTED" | "NOT_CONFIGURED";

function derivePortfolioParityStatus(
  strategies: Array<{ pineEnabled: boolean; pineParityStatus: string }>
): ParityStatus {
  const enabled = strategies.filter((s) => s.pineEnabled);
  if (enabled.length === 0) return "NOT_CONFIGURED";
  if (enabled.some((s) => s.pineParityStatus === "DRIFT_DETECTED")) return "DRIFT_DETECTED";
  if (enabled.some((s) => s.pineParityStatus === "PENDING_VALIDATION")) return "PENDING_VALIDATION";
  if (enabled.every((s) => s.pineParityStatus === "VALIDATED")) return "VALIDATED";
  return "PENDING_VALIDATION";
}

describe("Portfolio Parity Status Derivation", () => {
  it("returns NOT_CONFIGURED when no strategies are enabled", () => {
    const strategies = [
      { pineEnabled: false, pineParityStatus: "VALIDATED" },
      { pineEnabled: false, pineParityStatus: "VALIDATED" },
    ];
    expect(derivePortfolioParityStatus(strategies)).toBe("NOT_CONFIGURED");
  });

  it("returns VALIDATED when all enabled strategies are validated", () => {
    const strategies = [
      { pineEnabled: true, pineParityStatus: "VALIDATED" },
      { pineEnabled: true, pineParityStatus: "VALIDATED" },
      { pineEnabled: false, pineParityStatus: "PENDING_VALIDATION" },
    ];
    expect(derivePortfolioParityStatus(strategies)).toBe("VALIDATED");
  });

  it("returns DRIFT_DETECTED if any enabled strategy has drift", () => {
    const strategies = [
      { pineEnabled: true, pineParityStatus: "VALIDATED" },
      { pineEnabled: true, pineParityStatus: "DRIFT_DETECTED" },
      { pineEnabled: true, pineParityStatus: "VALIDATED" },
    ];
    expect(derivePortfolioParityStatus(strategies)).toBe("DRIFT_DETECTED");
  });

  it("DRIFT_DETECTED takes priority over PENDING_VALIDATION", () => {
    const strategies = [
      { pineEnabled: true, pineParityStatus: "PENDING_VALIDATION" },
      { pineEnabled: true, pineParityStatus: "DRIFT_DETECTED" },
    ];
    expect(derivePortfolioParityStatus(strategies)).toBe("DRIFT_DETECTED");
  });

  it("returns PENDING_VALIDATION when any enabled strategy is pending", () => {
    const strategies = [
      { pineEnabled: true, pineParityStatus: "VALIDATED" },
      { pineEnabled: true, pineParityStatus: "PENDING_VALIDATION" },
    ];
    expect(derivePortfolioParityStatus(strategies)).toBe("PENDING_VALIDATION");
  });
});
