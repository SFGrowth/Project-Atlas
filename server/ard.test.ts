/**
 * Sprint 089 — ARD & ORACLE tRPC procedure tests
 * Tests the ARD observation stats, candidate CRUD, and ORACLE prediction procedures.
 * Uses the same caller pattern as auth.logout.test.ts.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { appRouter } from "./routers";

// Build a public caller (no auth required for these procedures)
const caller = appRouter.createCaller({ user: null } as any);

describe("ARD — observation stats", () => {
  it("returns a valid stats object with numeric fields", async () => {
    const stats = await caller.ard.stats();
    expect(stats).toBeDefined();
    expect(typeof stats.total).toBe("number");
    expect(typeof stats.today).toBe("number");
    expect(typeof stats.thisWeek).toBe("number");
    expect(stats.total).toBeGreaterThanOrEqual(0);
    expect(stats.today).toBeGreaterThanOrEqual(0);
    expect(stats.thisWeek).toBeGreaterThanOrEqual(0);
  });
});

describe("ARD — recent observations", () => {
  it("returns an array (may be empty before M-16 is live)", async () => {
    const obs = await caller.ard.recentObservations({ limit: 10 });
    expect(Array.isArray(obs)).toBe(true);
  });

  it("respects the limit parameter", async () => {
    const obs = await caller.ard.recentObservations({ limit: 5 });
    expect(obs.length).toBeLessThanOrEqual(5);
  });
});

describe("ARD — missing bars", () => {
  it("returns an array of gap objects", async () => {
    const gaps = await caller.ard.missingBars({});
    expect(Array.isArray(gaps)).toBe(true);
  });
});

describe("ARD — research candidates", () => {
  it("returns an array of candidates", async () => {
    const candidates = await caller.ard.candidates({});
    expect(Array.isArray(candidates)).toBe(true);
  });

  it("creates a new candidate and retrieves it", async () => {
    const id = `ARD-TEST-${Date.now()}`;
    await caller.ard.createCandidate({
      candidateId: id,
      title: "Test Candidate",
      hypothesis: "This is a test hypothesis for vitest validation.",
      direction: "LONG",
      horizon: "5-10 bars",
    });

    const candidates = await caller.ard.candidates({});
    const found = candidates.find((c: any) => c.candidateId === id);
    expect(found).toBeDefined();
    expect(found?.title).toBe("Test Candidate");
    expect(found?.status).toBe("Observed");
  });

  it("updates candidate status from Observed to Investigating", async () => {
    const id = `ARD-STATUS-${Date.now()}`;
    await caller.ard.createCandidate({
      candidateId: id,
      title: "Status Test",
      hypothesis: "Testing status transitions.",
    });

    await caller.ard.updateCandidateStatus({ candidateId: id, status: "Investigating" });

    const candidates = await caller.ard.candidates({ status: "Investigating" });
    const found = candidates.find((c: any) => c.candidateId === id);
    expect(found).toBeDefined();
    expect(found?.status).toBe("Investigating");
  });

  it("filters candidates by status", async () => {
    const candidates = await caller.ard.candidates({ status: "Observed" });
    expect(Array.isArray(candidates)).toBe(true);
    candidates.forEach((c: any) => {
      expect(c.status).toBe("Observed");
    });
  });
});

describe("ORACLE — predictions", () => {
  it("returns an array of predictions", async () => {
    const predictions = await caller.oracle.predictions({ limit: 10 });
    expect(Array.isArray(predictions)).toBe(true);
  });
});

describe("ORACLE — pairs (prediction + reality)", () => {
  it("returns an array of pairs", async () => {
    const pairs = await caller.oracle.pairs({ limit: 10 });
    expect(Array.isArray(pairs)).toBe(true);
  });
});

describe("ORACLE — scores history", () => {
  it("returns an object with latest and history fields", async () => {
    const scores = await caller.oracle.scores({});
    expect(scores).toBeDefined();
    expect(typeof scores).toBe("object");
    expect("history" in scores).toBe(true);
    expect(Array.isArray(scores.history)).toBe(true);
  });
});
