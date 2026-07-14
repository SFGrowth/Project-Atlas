/**
 * backfill-monitor.mjs
 * Evaluates all atlas_memory bars that have no monitor_evaluations row.
 * Run once after Sprint 104C deployment to catch up on pre-deployment bars.
 *
 * Usage: node scripts/backfill-monitor.mjs
 */

import mysql from "mysql2/promise";

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

// ─── Eligibility logic (mirrors barEvaluator.ts) ─────────────────────────────

function normaliseRegime(raw) {
  if (!raw) return "UNKNOWN";
  const r = raw.toUpperCase();
  if (r.includes("TRENDING")) return "TRENDING";
  if (r.includes("VOLATILE")) return "VOLATILE";
  if (r.includes("CHOP")) return "CHOPPY";
  if (r.includes("RANG")) return "RANGING";
  return r;
}

function normaliseSession(raw) {
  if (!raw) return "UNKNOWN";
  const s = raw.toUpperCase();
  if (s === "OV" || s.includes("OVERNIGHT")) return "OV";
  if (s.includes("PRE")) return "PRE";
  if (s.includes("POST")) return "POST";
  if (s.includes("AM_OPEN") || s.includes("AMOPEN")) return "AM_OPEN";
  if (s.includes("AM_MID") || s.includes("AMMID")) return "AM_MID";
  if (s.includes("PM")) return "PM";
  return s;
}

function evaluateA1(bar) {
  const regime = normaliseRegime(bar.regime_classification);
  const session = normaliseSession(bar.session);
  if (bar.a1_eligible) return { eligible: true, reason: `TRENDING regime (${bar.regime_classification}), session ${session}` };
  if (regime !== "TRENDING") return { eligible: false, reason: `Regime ${regime} — A1 requires TRENDING` };
  if (!bar.is_rth) return { eligible: false, reason: `Outside RTH — A1 is RTH-only` };
  return { eligible: false, reason: `Not eligible per Pine Script M-16 evaluation` };
}

function evaluateA3(bar) {
  const regime = normaliseRegime(bar.regime_classification);
  const session = normaliseSession(bar.session);
  if (bar.a3_eligible) return { eligible: true, reason: `TRENDING regime (${bar.regime_classification}), session ${session}` };
  if (regime !== "TRENDING") return { eligible: false, reason: `Regime ${regime} — A3 requires TRENDING` };
  if (!bar.is_rth) return { eligible: false, reason: `Outside RTH — A3 is RTH-only` };
  return { eligible: false, reason: `Not eligible per Pine Script M-16 evaluation` };
}

function evaluateSB1(bar) {
  const regime = normaliseRegime(bar.regime_classification);
  const session = normaliseSession(bar.session);
  if (bar.sb1_eligible) return { eligible: true, reason: `TRENDING + AM_MID + RAS activated, session ${session}` };
  if (regime !== "TRENDING") return { eligible: false, reason: `Regime ${regime} — SB1 requires TRENDING` };
  if (session !== "AM_MID") return { eligible: false, reason: `Session ${session} — SB1 requires AM_MID (10:00–11:00 ET)` };
  return { eligible: false, reason: `Not eligible per Pine Script M-16 evaluation (RAS or other filter)` };
}

function evaluateORB1(bar) {
  const regime = normaliseRegime(bar.regime_classification);
  const session = normaliseSession(bar.session);
  if (regime === "VOLATILE" && session === "AM_OPEN" && bar.is_rth) {
    return { eligible: true, reason: `VOLATILE regime + AM_OPEN session — ORB-1 conditions met` };
  }
  if (regime !== "VOLATILE") return { eligible: false, reason: `Regime ${regime} — ORB-1 requires VOLATILE` };
  if (session !== "AM_OPEN") return { eligible: false, reason: `Session ${session} — ORB-1 requires AM_OPEN (09:30–10:00 ET)` };
  if (!bar.is_rth) return { eligible: false, reason: `Outside RTH — ORB-1 is RTH AM_OPEN only` };
  return { eligible: false, reason: `ORB-1 conditions not met` };
}

function evaluateB1(bar) {
  if (bar.b1_eligible) {
    const session = normaliseSession(bar.session);
    return { eligible: true, reason: `B1 eligible per Pine Script M-16, session ${session}` };
  }
  return { eligible: false, reason: `Not eligible per Pine Script M-16 evaluation` };
}

function validateIntegrity(bar, prevBar) {
  const notes = [];
  let integrityOk = true;
  let gapDetected = false;
  let gapMinutes = null;

  // OHLCV nulls
  if (!bar.open || !bar.high || !bar.low || !bar.close) {
    notes.push("NULL OHLCV");
    integrityOk = false;
  }

  // Price sanity
  const o = parseFloat(bar.open || "0");
  const h = parseFloat(bar.high || "0");
  const l = parseFloat(bar.low || "0");
  const c = parseFloat(bar.close || "0");

  if (h < l) { notes.push("HIGH < LOW"); integrityOk = false; }
  if (o <= 0 || c <= 0) { notes.push("ZERO PRICE"); integrityOk = false; }

  // Gap detection
  if (prevBar && bar.bar_time && prevBar.bar_time) {
    const expectedGap = 5 * 60 * 1000; // 5 minutes
    const actualGap = bar.bar_time - prevBar.bar_time;
    if (actualGap > expectedGap * 1.5) {
      gapDetected = true;
      gapMinutes = Math.round(actualGap / 60000);
      notes.push(`GAP: ${gapMinutes}min`);
    }
  }

  return {
    integrityOk,
    gapDetected,
    gapMinutes,
    duplicateDetected: false,
    integrityNotes: notes.length > 0 ? notes.join("; ") : null,
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const conn = await mysql.createConnection(DB_URL);

  // Get all atlas_memory bars without a monitor_evaluations row
  const [bars] = await conn.execute(`
    SELECT am.*
    FROM atlas_memory am
    LEFT JOIN monitor_evaluations me ON me.atlas_memory_id = am.id
    WHERE me.id IS NULL
    ORDER BY am.bar_time ASC
  `);

  console.log(`[backfill] Found ${bars.length} unevaluated bars`);

  if (bars.length === 0) {
    console.log("[backfill] Nothing to do.");
    await conn.end();
    return;
  }

  let inserted = 0;
  let prevBar = null;

  for (const bar of bars) {
    const a1 = evaluateA1(bar);
    const a3 = evaluateA3(bar);
    const b1 = evaluateB1(bar);
    const sb1 = evaluateSB1(bar);
    const orb1 = evaluateORB1(bar);
    const integrity = validateIntegrity(bar, prevBar);

    const activeModels = [
      a1.eligible ? "A1" : null,
      a3.eligible ? "A3" : null,
      b1.eligible ? "B1" : null,
      sb1.eligible ? "SB1" : null,
      orb1.eligible ? "ORB-1" : null,
    ].filter(Boolean).join(",") || "NONE";

    try {
      await conn.execute(`
        INSERT INTO monitor_evaluations (
          bar_time, bar_time_et, session, is_rth, adx, regime_classification,
          integrity_ok, gap_detected, gap_minutes, duplicate_detected, integrity_notes,
          a1_eligible, a1_reason, a3_eligible, a3_reason,
          sb1_eligible, sb1_reason, orb1_eligible, orb1_reason,
          b1_eligible, b1_reason,
          active_models, signal_model, signal_direction,
          atlas_memory_id, evaluated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, NOW())
      `, [
        bar.bar_time,
        bar.bar_time_et,
        bar.session,
        bar.is_rth ? 1 : 0,
        bar.adx,
        bar.regime_classification,
        integrity.integrityOk ? 1 : 0,
        integrity.gapDetected ? 1 : 0,
        integrity.gapMinutes,
        integrity.duplicateDetected ? 1 : 0,
        integrity.integrityNotes,
        a1.eligible ? 1 : 0, a1.reason,
        a3.eligible ? 1 : 0, a3.reason,
        sb1.eligible ? 1 : 0, sb1.reason,
        orb1.eligible ? 1 : 0, orb1.reason,
        b1.eligible ? 1 : 0, b1.reason,
        activeModels,
        bar.id,
      ]);
      inserted++;
    } catch (err) {
      // Skip duplicates (race condition with live monitor)
      if (err.code !== "ER_DUP_ENTRY") {
        console.error(`[backfill] Error on bar ${bar.id}:`, err.message);
      }
    }

    prevBar = bar;
  }

  console.log(`[backfill] Inserted ${inserted} evaluation rows`);

  // Summary
  const [summary] = await conn.execute(`
    SELECT 
      COUNT(*) as total,
      SUM(a1_eligible) as a1_eligible,
      SUM(a3_eligible) as a3_eligible,
      SUM(b1_eligible) as b1_eligible,
      SUM(sb1_eligible) as sb1_eligible,
      SUM(orb1_eligible) as orb1_eligible,
      SUM(gap_detected) as gaps,
      SUM(duplicate_detected) as duplicates,
      SUM(CASE WHEN integrity_ok = 0 THEN 1 ELSE 0 END) as integrity_failures
    FROM monitor_evaluations
  `);
  console.log("[backfill] Full evaluation summary:", JSON.stringify(summary[0]));

  // Regime distribution
  const [regimes] = await conn.execute(`
    SELECT regime_classification, COUNT(*) as cnt
    FROM monitor_evaluations
    GROUP BY regime_classification
    ORDER BY cnt DESC
  `);
  console.log("[backfill] Regime distribution:", regimes.map(r => `${r.regime_classification}:${r.cnt}`).join(", "));

  await conn.end();
}

main().catch(e => { console.error(e); process.exit(1); });
