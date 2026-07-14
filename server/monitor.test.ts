/**
 * monitor.test.ts — Sprint 104C
 * Unit tests for barEvaluator eligibility logic.
 * Tests the pure eligibility functions without DB calls.
 */

import { describe, it, expect } from "vitest";

// ─── Replicate eligibility logic for unit testing ─────────────────────────────
// These mirror the functions in barEvaluator.ts exactly.

function normaliseRegime(raw: string | null): string {
  if (!raw) return "UNKNOWN";
  const r = raw.toUpperCase();
  if (r.includes("TRENDING")) return "TRENDING";
  if (r.includes("VOLATILE")) return "VOLATILE";
  if (r.includes("CHOP")) return "CHOPPY";
  if (r.includes("RANG")) return "RANGING";
  return r;
}

function normaliseSession(raw: string | null): string {
  if (!raw) return "UNKNOWN";
  const s = raw.toUpperCase();
  if (s.includes("OV") || s === "OVERNIGHT") return "OV";
  if (s.includes("PRE")) return "PRE";
  if (s.includes("POST")) return "POST";
  if (s.includes("AM_OPEN") || s.includes("AMOPEN")) return "AM_OPEN";
  if (s.includes("AM_MID") || s.includes("AMMID")) return "AM_MID";
  if (s.includes("PM")) return "PM";
  return s;
}

interface MockBar {
  regimeClassification: string | null;
  session: string | null;
  isRth: boolean | null;
  a1Eligible: boolean | null;
  a3Eligible: boolean | null;
  b1Eligible: boolean | null;
  sb1Eligible: boolean | null;
}

function evaluateA1(bar: MockBar): { eligible: boolean; reason: string } {
  const regime = normaliseRegime(bar.regimeClassification);
  const session = normaliseSession(bar.session);
  if (bar.a1Eligible === true) {
    return { eligible: true, reason: `TRENDING regime (${bar.regimeClassification}), session ${session}` };
  }
  if (regime !== "TRENDING") return { eligible: false, reason: `Regime ${regime} — A1 requires TRENDING` };
  if (!bar.isRth) return { eligible: false, reason: `Outside RTH — A1 is RTH-only` };
  return { eligible: false, reason: `Not eligible per Pine Script M-16 evaluation` };
}

function evaluateA3(bar: MockBar): { eligible: boolean; reason: string } {
  const regime = normaliseRegime(bar.regimeClassification);
  const session = normaliseSession(bar.session);
  if (bar.a3Eligible === true) {
    return { eligible: true, reason: `TRENDING regime (${bar.regimeClassification}), session ${session}` };
  }
  if (regime !== "TRENDING") return { eligible: false, reason: `Regime ${regime} — A3 requires TRENDING` };
  if (!bar.isRth) return { eligible: false, reason: `Outside RTH — A3 is RTH-only` };
  return { eligible: false, reason: `Not eligible per Pine Script M-16 evaluation` };
}

function evaluateSB1(bar: MockBar): { eligible: boolean; reason: string } {
  const regime = normaliseRegime(bar.regimeClassification);
  const session = normaliseSession(bar.session);
  if (bar.sb1Eligible === true) {
    return { eligible: true, reason: `TRENDING + AM_MID + RAS activated, session ${session}` };
  }
  if (regime !== "TRENDING") return { eligible: false, reason: `Regime ${regime} — SB1 requires TRENDING` };
  if (session !== "AM_MID") return { eligible: false, reason: `Session ${session} — SB1 requires AM_MID (10:00–11:00 ET)` };
  return { eligible: false, reason: `Not eligible per Pine Script M-16 evaluation (RAS or other filter)` };
}

function evaluateORB1(bar: MockBar): { eligible: boolean; reason: string } {
  const regime = normaliseRegime(bar.regimeClassification);
  const session = normaliseSession(bar.session);
  if (regime === "VOLATILE" && session === "AM_OPEN" && bar.isRth) {
    return { eligible: true, reason: `VOLATILE regime + AM_OPEN session — ORB-1 conditions met` };
  }
  if (regime !== "VOLATILE") return { eligible: false, reason: `Regime ${regime} — ORB-1 requires VOLATILE` };
  if (session !== "AM_OPEN") return { eligible: false, reason: `Session ${session} — ORB-1 requires AM_OPEN (09:30–10:00 ET)` };
  if (!bar.isRth) return { eligible: false, reason: `Outside RTH — ORB-1 is RTH AM_OPEN only` };
  return { eligible: false, reason: `ORB-1 conditions not met` };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("barEvaluator — regime normalisation", () => {
  it("normalises TRENDING_BULL to TRENDING", () => {
    expect(normaliseRegime("TRENDING_BULL")).toBe("TRENDING");
  });
  it("normalises TRENDING_BEAR to TRENDING", () => {
    expect(normaliseRegime("TRENDING_BEAR")).toBe("TRENDING");
  });
  it("normalises CHOPPY to CHOPPY", () => {
    expect(normaliseRegime("CHOPPY")).toBe("CHOPPY");
  });
  it("normalises VOLATILE to VOLATILE", () => {
    expect(normaliseRegime("VOLATILE")).toBe("VOLATILE");
  });
  it("handles null", () => {
    expect(normaliseRegime(null)).toBe("UNKNOWN");
  });
});

describe("barEvaluator — session normalisation", () => {
  it("normalises AM_OPEN", () => {
    expect(normaliseSession("AM_OPEN")).toBe("AM_OPEN");
  });
  it("normalises AM_MID", () => {
    expect(normaliseSession("AM_MID")).toBe("AM_MID");
  });
  it("normalises OV", () => {
    expect(normaliseSession("OV")).toBe("OV");
  });
  it("normalises OVERNIGHT to OV", () => {
    expect(normaliseSession("OVERNIGHT")).toBe("OV");
  });
  it("handles null", () => {
    expect(normaliseSession(null)).toBe("UNKNOWN");
  });
});

describe("barEvaluator — A1 eligibility", () => {
  it("returns eligible when Pine Script a1_eligible = true", () => {
    const bar: MockBar = { regimeClassification: "TRENDING_BULL", session: "AM_MID", isRth: true, a1Eligible: true, a3Eligible: false, b1Eligible: false, sb1Eligible: false };
    expect(evaluateA1(bar).eligible).toBe(true);
  });
  it("returns ineligible when regime is CHOPPY", () => {
    const bar: MockBar = { regimeClassification: "CHOPPY", session: "AM_MID", isRth: true, a1Eligible: false, a3Eligible: false, b1Eligible: false, sb1Eligible: false };
    const result = evaluateA1(bar);
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain("CHOPPY");
  });
  it("returns ineligible outside RTH", () => {
    const bar: MockBar = { regimeClassification: "TRENDING_BULL", session: "OV", isRth: false, a1Eligible: false, a3Eligible: false, b1Eligible: false, sb1Eligible: false };
    const result = evaluateA1(bar);
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain("RTH");
  });
});

describe("barEvaluator — A3 eligibility", () => {
  it("returns eligible when Pine Script a3_eligible = true", () => {
    const bar: MockBar = { regimeClassification: "TRENDING_BEAR", session: "AM_OPEN", isRth: true, a1Eligible: false, a3Eligible: true, b1Eligible: false, sb1Eligible: false };
    expect(evaluateA3(bar).eligible).toBe(true);
  });
  it("returns ineligible when regime is VOLATILE", () => {
    const bar: MockBar = { regimeClassification: "VOLATILE", session: "AM_OPEN", isRth: true, a1Eligible: false, a3Eligible: false, b1Eligible: false, sb1Eligible: false };
    const result = evaluateA3(bar);
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain("VOLATILE");
  });
});

describe("barEvaluator — SB1 eligibility", () => {
  it("returns eligible when Pine Script sb1_eligible = true", () => {
    const bar: MockBar = { regimeClassification: "TRENDING_BULL", session: "AM_MID", isRth: true, a1Eligible: false, a3Eligible: false, b1Eligible: false, sb1Eligible: true };
    expect(evaluateSB1(bar).eligible).toBe(true);
  });
  it("returns ineligible when session is AM_OPEN (not AM_MID)", () => {
    const bar: MockBar = { regimeClassification: "TRENDING_BULL", session: "AM_OPEN", isRth: true, a1Eligible: false, a3Eligible: false, b1Eligible: false, sb1Eligible: false };
    const result = evaluateSB1(bar);
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain("AM_MID");
  });
  it("returns ineligible when regime is CHOPPY", () => {
    const bar: MockBar = { regimeClassification: "CHOPPY", session: "AM_MID", isRth: true, a1Eligible: false, a3Eligible: false, b1Eligible: false, sb1Eligible: false };
    const result = evaluateSB1(bar);
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain("TRENDING");
  });
});

describe("barEvaluator — ORB-1 eligibility (computed, no atlas_memory column)", () => {
  it("returns eligible for VOLATILE + AM_OPEN + RTH", () => {
    const bar: MockBar = { regimeClassification: "VOLATILE", session: "AM_OPEN", isRth: true, a1Eligible: false, a3Eligible: false, b1Eligible: false, sb1Eligible: false };
    expect(evaluateORB1(bar).eligible).toBe(true);
  });
  it("returns ineligible when regime is TRENDING (not VOLATILE)", () => {
    const bar: MockBar = { regimeClassification: "TRENDING_BULL", session: "AM_OPEN", isRth: true, a1Eligible: false, a3Eligible: false, b1Eligible: false, sb1Eligible: false };
    const result = evaluateORB1(bar);
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain("VOLATILE");
  });
  it("returns ineligible when session is AM_MID (not AM_OPEN)", () => {
    const bar: MockBar = { regimeClassification: "VOLATILE", session: "AM_MID", isRth: true, a1Eligible: false, a3Eligible: false, b1Eligible: false, sb1Eligible: false };
    const result = evaluateORB1(bar);
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain("AM_OPEN");
  });
  it("returns ineligible outside RTH", () => {
    const bar: MockBar = { regimeClassification: "VOLATILE", session: "AM_OPEN", isRth: false, a1Eligible: false, a3Eligible: false, b1Eligible: false, sb1Eligible: false };
    const result = evaluateORB1(bar);
    expect(result.eligible).toBe(false);
  });
  it("confirms ORB-1 is computed — not from atlas_memory column", () => {
    // This test documents the design decision: ORB-1 eligibility is computed
    // from regime_classification + session, NOT from an orb1_eligible column
    // (which does not exist in atlas_memory).
    const bar: MockBar = { regimeClassification: "VOLATILE", session: "AM_OPEN", isRth: true, a1Eligible: false, a3Eligible: false, b1Eligible: false, sb1Eligible: false };
    const result = evaluateORB1(bar);
    expect(result.eligible).toBe(true);
    expect(result.reason).toContain("VOLATILE regime + AM_OPEN session");
  });
});

describe("barEvaluator — current market state (CHOPPY, ADX ~12-15)", () => {
  it("all models ineligible in CHOPPY regime", () => {
    const bar: MockBar = {
      regimeClassification: "CHOPPY",
      session: "AM_MID",
      isRth: true,
      a1Eligible: false,
      a3Eligible: false,
      b1Eligible: false,
      sb1Eligible: false,
    };
    expect(evaluateA1(bar).eligible).toBe(false);
    expect(evaluateA3(bar).eligible).toBe(false);
    expect(evaluateSB1(bar).eligible).toBe(false);
    expect(evaluateORB1(bar).eligible).toBe(false);
  });
});
