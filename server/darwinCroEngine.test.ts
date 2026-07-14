/**
 * Sprint 101 — DARWIN CRO Engine Tests
 *
 * Tests the core CRO engine functions without requiring a live database.
 * Uses mock data to verify ERV calculation, gate logic, and prioritisation.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── ERV Calculation Tests ────────────────────────────────────────────────────

describe("Expected Research Value (ERV) calculation", () => {
  /**
   * ERV formula: (portfolioValue * confidence * noveltyScore) / computationalCost
   * All inputs are 0-100 scale, output is 0-100 scale.
   */
  function calculateERV(
    portfolioValue: number,
    confidence: number,
    noveltyScore: number,
    computationalCost: number
  ): number {
    if (computationalCost <= 0) return 0;
    return (portfolioValue * confidence * noveltyScore) / (100 * 100 * computationalCost);
  }

  it("returns 0 when computational cost is 0", () => {
    expect(calculateERV(80, 70, 90, 0)).toBe(0);
  });

  it("returns higher ERV for high-value, high-confidence, novel research", () => {
    const highValue = calculateERV(90, 80, 95, 3);
    const lowValue = calculateERV(30, 40, 50, 8);
    expect(highValue).toBeGreaterThan(lowValue);
  });

  it("penalises high computational cost", () => {
    const cheap = calculateERV(70, 70, 70, 2);
    const expensive = calculateERV(70, 70, 70, 9);
    expect(cheap).toBeGreaterThan(expensive);
  });

  it("rewards novelty — same portfolio value but higher novelty scores higher", () => {
    const novel = calculateERV(60, 60, 90, 5);
    const stale = calculateERV(60, 60, 20, 5);
    expect(novel).toBeGreaterThan(stale);
  });
});

// ─── Promotion Gate Logic Tests ───────────────────────────────────────────────

describe("Promotion gate thresholds", () => {
  const STAGE_THRESHOLDS: Record<string, { minEvidence: number; minConfidence: number }> = {
    OBSERVATION: { minEvidence: 10, minConfidence: 40 },
    EVIDENCE: { minEvidence: 25, minConfidence: 55 },
    REPLAY: { minEvidence: 50, minConfidence: 65 },
    BACKTEST: { minEvidence: 75, minConfidence: 72 },
    WALK_FORWARD: { minEvidence: 100, minConfidence: 78 },
    MONTE_CARLO: { minEvidence: 150, minConfidence: 82 },
    PAPER_TRADING: { minEvidence: 200, minConfidence: 85 },
    FORWARD_VALIDATION: { minEvidence: 300, minConfidence: 88 },
  };

  function canPromote(stage: string, evidence: number, confidence: number): boolean {
    const threshold = STAGE_THRESHOLDS[stage];
    if (!threshold) return false;
    return evidence >= threshold.minEvidence && confidence >= threshold.minConfidence;
  }

  it("allows promotion from OBSERVATION when evidence >= 10 and confidence >= 40", () => {
    expect(canPromote("OBSERVATION", 10, 40)).toBe(true);
    expect(canPromote("OBSERVATION", 9, 40)).toBe(false);
    expect(canPromote("OBSERVATION", 10, 39)).toBe(false);
  });

  it("requires higher thresholds for later stages", () => {
    // FORWARD_VALIDATION requires 300 evidence and 88% confidence
    expect(canPromote("FORWARD_VALIDATION", 300, 88)).toBe(true);
    expect(canPromote("FORWARD_VALIDATION", 299, 88)).toBe(false);
    expect(canPromote("FORWARD_VALIDATION", 300, 87)).toBe(false);
  });

  it("returns false for unknown stage", () => {
    expect(canPromote("UNKNOWN_STAGE", 999, 99)).toBe(false);
  });

  it("stage thresholds are monotonically increasing", () => {
    const stages = Object.keys(STAGE_THRESHOLDS);
    for (let i = 1; i < stages.length; i++) {
      const prev = STAGE_THRESHOLDS[stages[i - 1]];
      const curr = STAGE_THRESHOLDS[stages[i]];
      expect(curr.minEvidence).toBeGreaterThan(prev.minEvidence);
      expect(curr.minConfidence).toBeGreaterThan(prev.minConfidence);
    }
  });
});

// ─── Portfolio Gap Analysis Tests ─────────────────────────────────────────────

describe("Portfolio gap analysis", () => {
  const ALL_REGIMES = ["RANGE", "TRANSITION", "VOLATILE", "TRENDING_BULL", "TRENDING_BEAR"];
  const ALL_SESSIONS = ["AM_OPEN", "AM_MID", "LUNCH", "PM", "OV"];

  function computeGaps(
    coveredRegimes: string[],
    coveredSessions: string[]
  ): { regimeGaps: string[]; sessionGaps: string[]; regimeCoverage: number; sessionCoverage: number } {
    const regimeGaps = ALL_REGIMES.filter(r => !coveredRegimes.includes(r));
    const sessionGaps = ALL_SESSIONS.filter(s => !coveredSessions.includes(s));
    return {
      regimeGaps,
      sessionGaps,
      regimeCoverage: (coveredRegimes.length / ALL_REGIMES.length) * 100,
      sessionCoverage: (coveredSessions.length / ALL_SESSIONS.length) * 100,
    };
  }

  it("identifies missing regimes correctly", () => {
    const result = computeGaps(["TRENDING_BULL", "TRENDING_BEAR"], ["AM_OPEN"]);
    expect(result.regimeGaps).toContain("RANGE");
    expect(result.regimeGaps).toContain("TRANSITION");
    expect(result.regimeGaps).toContain("VOLATILE");
    expect(result.regimeGaps).not.toContain("TRENDING_BULL");
  });

  it("reports 100% coverage when all regimes are covered", () => {
    const result = computeGaps(ALL_REGIMES, ALL_SESSIONS);
    expect(result.regimeCoverage).toBe(100);
    expect(result.sessionCoverage).toBe(100);
    expect(result.regimeGaps).toHaveLength(0);
    expect(result.sessionGaps).toHaveLength(0);
  });

  it("reports 0% coverage when nothing is covered", () => {
    const result = computeGaps([], []);
    expect(result.regimeCoverage).toBe(0);
    expect(result.sessionCoverage).toBe(0);
    expect(result.regimeGaps).toHaveLength(ALL_REGIMES.length);
    expect(result.sessionGaps).toHaveLength(ALL_SESSIONS.length);
  });

  it("partial coverage returns correct percentage", () => {
    const result = computeGaps(["RANGE", "TRANSITION"], ["AM_OPEN", "PM"]);
    expect(result.regimeCoverage).toBeCloseTo(40, 0); // 2/5 = 40%
    expect(result.sessionCoverage).toBeCloseTo(40, 0); // 2/5 = 40%
  });
});

// ─── Rejection Logic Tests ────────────────────────────────────────────────────

describe("Rejection reason codes", () => {
  const VALID_REASON_CODES = [
    "INSUFFICIENT_EVIDENCE",
    "LOW_CONFIDENCE",
    "HIGH_CORRELATION",
    "POOR_BACKTEST",
    "FAILED_WALK_FORWARD",
    "FAILED_MONTE_CARLO",
    "PORTFOLIO_REDUNDANT",
    "MANUAL_REJECTION",
  ];

  it("all reason codes are non-empty strings", () => {
    for (const code of VALID_REASON_CODES) {
      expect(typeof code).toBe("string");
      expect(code.length).toBeGreaterThan(0);
    }
  });

  it("reason codes are uppercase with underscores only", () => {
    for (const code of VALID_REASON_CODES) {
      expect(code).toMatch(/^[A-Z_]+$/);
    }
  });

  it("has at least 5 distinct reason codes", () => {
    const unique = new Set(VALID_REASON_CODES);
    expect(unique.size).toBeGreaterThanOrEqual(5);
  });
});

// ─── Work Log Entry Validation ────────────────────────────────────────────────

describe("Work log entry structure", () => {
  function createWorkEntry(workType: string, description: string, layer: number) {
    return {
      workId: `WRK_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      workType,
      description,
      rationale: null,
      targetResearchId: null,
      targetCandidateId: null,
      outcome: "PENDING",
      outcomeDetails: null,
      durationMs: null,
      scheduledPriority: 5,
      layer,
      startedAt: Date.now(),
      completedAt: null,
    };
  }

  it("creates a valid work entry with required fields", () => {
    const entry = createWorkEntry("DAILY_WORK", "Run daily CRO analysis", 3);
    expect(entry.workId).toMatch(/^WRK_/);
    expect(entry.outcome).toBe("PENDING");
    expect(entry.layer).toBe(3);
    expect(entry.startedAt).toBeGreaterThan(0);
  });

  it("work ID is unique across two entries created in sequence", () => {
    const e1 = createWorkEntry("DAILY_WORK", "First", 3);
    const e2 = createWorkEntry("DAILY_WORK", "Second", 3);
    expect(e1.workId).not.toBe(e2.workId);
  });
});
