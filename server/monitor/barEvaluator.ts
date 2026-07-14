/**
 * barEvaluator.ts — Sprint 104C Autonomous Pipeline Monitor
 *
 * Called on every successful atlas_memory insert.
 * Responsibilities:
 *   1. Validate OHLCV integrity (no nulls, price > 0, realistic range)
 *   2. Detect gaps (missing 5-min bars) and duplicates
 *   3. Evaluate model eligibility for A1, A3, B1, SB1, ORB-1
 *   4. Write result to monitor_evaluations table
 *
 * IMPORTANT: This module is read-only with respect to strategy rules.
 * It never modifies entry/exit logic — it only observes and records.
 */

import { getDb } from "../db.js";
import { monitorEvaluations, atlasMemory } from "../../drizzle/schema.js";
import { desc, eq, lt, and, gt } from "drizzle-orm";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BarRow {
  id: number;
  barTime: number | null;
  barTimeEt: string | null;
  session: string | null;
  isRth: boolean | null;
  open: string | null;
  high: string | null;
  low: string | null;
  close: string | null;
  volume: number | null;
  adx: string | null;
  regimeClassification: string | null;
  a1Eligible: boolean | null;
  a3Eligible: boolean | null;
  b1Eligible: boolean | null;
  sb1Eligible: boolean | null;
  activeModels: string | null;
  atr: string | null;
  atr5: string | null;
}

export interface EvaluationResult {
  barTime: number;
  barTimeEt: string | null;
  session: string | null;
  isRth: boolean;
  adx: number | null;
  regimeClassification: string | null;
  // Integrity
  integrityOk: boolean;
  gapDetected: boolean;
  gapMinutes: number | null;
  duplicateDetected: boolean;
  integrityNotes: string | null;
  // Model eligibility
  a1Eligible: boolean;
  a1Reason: string;
  a3Eligible: boolean;
  a3Reason: string;
  sb1Eligible: boolean;
  sb1Reason: string;
  orb1Eligible: boolean;
  orb1Reason: string;
  b1Eligible: boolean;
  b1Reason: string;
  activeModels: string;
  // Signal (populated by paperTradeEngine if a signal fires)
  signalModel: string | null;
  signalDirection: string | null;
  atlasMemoryId: number;
}

// ─── Eligibility Rules ────────────────────────────────────────────────────────
// NOTE: These rules are derived from the existing Pine Script M-16 logic.
// They are observation-only — never modify strategy entry/exit rules here.

/**
 * Normalise regime string from M-16 values to canonical form.
 * M-16 sends: TRENDING_BULL, TRENDING_BEAR, CHOPPY, VOLATILE, RANGING
 */
function normaliseRegime(raw: string | null): string {
  if (!raw) return "UNKNOWN";
  const r = raw.toUpperCase();
  if (r.includes("TRENDING")) return "TRENDING";
  if (r.includes("VOLATILE")) return "VOLATILE";
  if (r.includes("CHOP")) return "CHOPPY";
  if (r.includes("RANG")) return "RANGING";
  return r;
}

/**
 * Normalise session string from M-16 values.
 * M-16 sends: AM_OPEN, AM_MID, PM, OV, PRE, POST, etc.
 */
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

/**
 * Evaluate A1 eligibility.
 * Rule: TRENDING regime (TRENDING_BULL or TRENDING_BEAR) + RTH session.
 * Source: atlas_memory.a1_eligible (from Pine Script M-16).
 * We cross-check with our own regime evaluation for transparency.
 */
function evaluateA1(bar: BarRow): { eligible: boolean; reason: string } {
  const regime = normaliseRegime(bar.regimeClassification);
  const session = normaliseSession(bar.session);

  // Use Pine Script's own flag as primary source of truth
  if (bar.a1Eligible === true) {
    return { eligible: true, reason: `TRENDING regime (${bar.regimeClassification}), session ${session}` };
  }

  // Explain why not eligible
  if (regime !== "TRENDING") {
    return { eligible: false, reason: `Regime ${regime} — A1 requires TRENDING` };
  }
  if (!bar.isRth) {
    return { eligible: false, reason: `Outside RTH — A1 is RTH-only` };
  }
  return { eligible: false, reason: `Not eligible per Pine Script M-16 evaluation` };
}

/**
 * Evaluate A3 eligibility.
 * Rule: TRENDING regime + RTH session.
 * Source: atlas_memory.a3_eligible.
 */
function evaluateA3(bar: BarRow): { eligible: boolean; reason: string } {
  const regime = normaliseRegime(bar.regimeClassification);
  const session = normaliseSession(bar.session);

  if (bar.a3Eligible === true) {
    return { eligible: true, reason: `TRENDING regime (${bar.regimeClassification}), session ${session}` };
  }

  if (regime !== "TRENDING") {
    return { eligible: false, reason: `Regime ${regime} — A3 requires TRENDING` };
  }
  if (!bar.isRth) {
    return { eligible: false, reason: `Outside RTH — A3 is RTH-only` };
  }
  return { eligible: false, reason: `Not eligible per Pine Script M-16 evaluation` };
}

/**
 * Evaluate B1 eligibility.
 * Source: atlas_memory.b1_eligible.
 */
function evaluateB1(bar: BarRow): { eligible: boolean; reason: string } {
  const session = normaliseSession(bar.session);

  if (bar.b1Eligible === true) {
    return { eligible: true, reason: `B1 eligible per M-16, session ${session}` };
  }
  return { eligible: false, reason: `Not eligible per Pine Script M-16 evaluation` };
}

/**
 * Evaluate SB1 eligibility.
 * Rule: TRENDING regime + AM_MID session (10:00–11:00 ET) + sb1_ras_activated.
 * Pending filters (not yet in production): AM Mid exclusion, max 2/day, no VOLATILE.
 * Source: atlas_memory.sb1_eligible.
 */
function evaluateSB1(bar: BarRow): { eligible: boolean; reason: string } {
  const regime = normaliseRegime(bar.regimeClassification);
  const session = normaliseSession(bar.session);

  if (bar.sb1Eligible === true) {
    return { eligible: true, reason: `TRENDING + AM_MID + RAS activated, session ${session}` };
  }

  if (regime !== "TRENDING") {
    return { eligible: false, reason: `Regime ${regime} — SB1 requires TRENDING` };
  }
  if (session !== "AM_MID") {
    return { eligible: false, reason: `Session ${session} — SB1 requires AM_MID (10:00–11:00 ET)` };
  }
  return { eligible: false, reason: `Not eligible per Pine Script M-16 evaluation (RAS or other filter)` };
}

/**
 * Evaluate ORB-1 eligibility.
 * Rule: VOLATILE regime + AM_OPEN session (09:30–10:00 ET).
 * NOTE: atlas_memory has NO orb1_eligible column — computed here from regime + session.
 */
function evaluateORB1(bar: BarRow): { eligible: boolean; reason: string } {
  const regime = normaliseRegime(bar.regimeClassification);
  const session = normaliseSession(bar.session);

  if (regime === "VOLATILE" && session === "AM_OPEN" && bar.isRth) {
    return { eligible: true, reason: `VOLATILE regime + AM_OPEN session — ORB-1 conditions met` };
  }

  if (regime !== "VOLATILE") {
    return { eligible: false, reason: `Regime ${regime} — ORB-1 requires VOLATILE` };
  }
  if (session !== "AM_OPEN") {
    return { eligible: false, reason: `Session ${session} — ORB-1 requires AM_OPEN (09:30–10:00 ET)` };
  }
  if (!bar.isRth) {
    return { eligible: false, reason: `Outside RTH — ORB-1 is RTH AM_OPEN only` };
  }
  return { eligible: false, reason: `ORB-1 conditions not met` };
}

// ─── Integrity Checks ─────────────────────────────────────────────────────────

interface IntegrityResult {
  ok: boolean;
  gapDetected: boolean;
  gapMinutes: number | null;
  duplicateDetected: boolean;
  notes: string | null;
}

async function checkIntegrity(bar: BarRow): Promise<IntegrityResult> {
  const db = await getDb();
  if (!db) return { ok: true, gapDetected: false, gapMinutes: null, duplicateDetected: false, notes: null };
  const issues: string[] = [];
  let gapDetected = false;
  let gapMinutes: number | null = null;
  let duplicateDetected = false;

  // 1. OHLCV sanity
  const o = parseFloat(bar.open ?? "0");
  const h = parseFloat(bar.high ?? "0");
  const l = parseFloat(bar.low ?? "0");
  const c = parseFloat(bar.close ?? "0");

  if (o <= 0 || h <= 0 || l <= 0 || c <= 0) {
    issues.push("OHLCV contains zero or negative price");
  }
  if (h < l) {
    issues.push(`High (${h}) < Low (${l}) — invalid bar`);
  }
  if (h < o || h < c) {
    issues.push(`High (${h}) below Open (${o}) or Close (${c})`);
  }
  if (l > o || l > c) {
    issues.push(`Low (${l}) above Open (${o}) or Close (${c})`);
  }

  // 2. Gap detection — find previous bar
  if (bar.barTime) {
    const prevBars = await db
      .select({ barTime: atlasMemory.barTime })
      .from(atlasMemory)
      .where(lt(atlasMemory.barTime, bar.barTime))
      .orderBy(desc(atlasMemory.barTime))
      .limit(1);

    if (prevBars.length > 0 && prevBars[0].barTime) {
      const prevTime = Number(prevBars[0].barTime);
      const expectedDiff = 5 * 60 * 1000; // 5 minutes in ms
      const actualDiff = bar.barTime - prevTime;
      const diffMinutes = Math.round(actualDiff / 60000);

      if (actualDiff > expectedDiff * 1.5) {
        // More than 7.5 minutes since last bar — gap detected
        gapDetected = true;
        gapMinutes = diffMinutes;
        issues.push(`Gap: ${diffMinutes} min since last bar (expected 5 min)`);
      }
    }

    // 3. Duplicate detection — same bar_time already exists
    const dupes = await db
      .select({ id: atlasMemory.id })
      .from(atlasMemory)
      .where(and(eq(atlasMemory.barTime, bar.barTime), gt(atlasMemory.id, bar.id)))
      .limit(1);

    if (dupes.length > 0) {
      duplicateDetected = true;
      issues.push(`Duplicate bar_time detected (id ${dupes[0].id})`);
    }
  }

  return {
    ok: issues.length === 0,
    gapDetected,
    gapMinutes,
    duplicateDetected,
    notes: issues.length > 0 ? issues.join("; ") : null,
  };
}

// ─── Main Evaluate Function ───────────────────────────────────────────────────

export async function evaluate(bar: BarRow): Promise<EvaluationResult> {
  const db = await getDb();
  if (!db) throw new Error("[barEvaluator] DB unavailable");

  // Run integrity checks
  const integrity = await checkIntegrity(bar);

  // Evaluate each model
  const a1 = evaluateA1(bar);
  const a3 = evaluateA3(bar);
  const b1 = evaluateB1(bar);
  const sb1 = evaluateSB1(bar);
  const orb1 = evaluateORB1(bar);

  // Build active models list
  const activeList: string[] = [];
  if (a1.eligible) activeList.push("A1");
  if (a3.eligible) activeList.push("A3");
  if (b1.eligible) activeList.push("B1");
  if (sb1.eligible) activeList.push("SB1");
  if (orb1.eligible) activeList.push("ORB-1");

  const result: EvaluationResult = {
    barTime: bar.barTime ?? 0,
    barTimeEt: bar.barTimeEt,
    session: bar.session,
    isRth: bar.isRth ?? false,
    adx: bar.adx ? parseFloat(bar.adx) : null,
    regimeClassification: bar.regimeClassification,
    integrityOk: integrity.ok,
    gapDetected: integrity.gapDetected,
    gapMinutes: integrity.gapMinutes,
    duplicateDetected: integrity.duplicateDetected,
    integrityNotes: integrity.notes,
    a1Eligible: a1.eligible,
    a1Reason: a1.reason,
    a3Eligible: a3.eligible,
    a3Reason: a3.reason,
    sb1Eligible: sb1.eligible,
    sb1Reason: sb1.reason,
    orb1Eligible: orb1.eligible,
    orb1Reason: orb1.reason,
    b1Eligible: b1.eligible,
    b1Reason: b1.reason,
    activeModels: activeList.join(","),
    signalModel: null,
    signalDirection: null,
    atlasMemoryId: bar.id,
  };

  // Persist to monitor_evaluations
  const db2 = await getDb();
  if (!db2) throw new Error("[barEvaluator] DB unavailable for insert");
  await db2.insert(monitorEvaluations).values({
    barTime: result.barTime,
    barTimeEt: result.barTimeEt,
    session: result.session,
    isRth: result.isRth,
    adx: result.adx !== null ? String(result.adx) : null,
    regimeClassification: result.regimeClassification,
    integrityOk: result.integrityOk,
    gapDetected: result.gapDetected,
    gapMinutes: result.gapMinutes,
    duplicateDetected: result.duplicateDetected,
    integrityNotes: result.integrityNotes,
    a1Eligible: result.a1Eligible,
    a1Reason: result.a1Reason,
    a3Eligible: result.a3Eligible,
    a3Reason: result.a3Reason,
    sb1Eligible: result.sb1Eligible,
    sb1Reason: result.sb1Reason,
    orb1Eligible: result.orb1Eligible,
    orb1Reason: result.orb1Reason,
    b1Eligible: result.b1Eligible,
    b1Reason: result.b1Reason,
    activeModels: result.activeModels || null,
    signalModel: null,
    signalDirection: null,
    atlasMemoryId: result.atlasMemoryId,
  });

  return result;
}

/**
 * Update the signal fields on the most recent evaluation for a given bar.
 * Called by paperTradeEngine after a signal is generated.
 */
export async function recordSignal(
  atlasMemoryId: number,
  signalModel: string,
  signalDirection: string
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(monitorEvaluations)
    .set({ signalModel, signalDirection })
    .where(eq(monitorEvaluations.atlasMemoryId, atlasMemoryId));
}

/**
 * Get the latest N evaluations for dashboard display.
 */
export async function getRecentEvaluations(limit = 20) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(monitorEvaluations)
    .orderBy(desc(monitorEvaluations.barTime))
    .limit(limit);
}
