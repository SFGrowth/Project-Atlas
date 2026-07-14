/**
 * daily-ops-report-data.mjs
 * Pulls all live production data needed for the Atlas Daily Operations Report.
 */

import mysql from "mysql2/promise";
import { writeFileSync } from "fs";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error("DATABASE_URL not set"); process.exit(1); }

const conn = await mysql.createConnection(DATABASE_URL);

// ── Date boundaries ───────────────────────────────────────────────────────────
const NOW_UTC = new Date();
const ET_OFFSET_MS = 4 * 60 * 60 * 1000; // EDT = UTC-4
const NOW_ET = new Date(NOW_UTC.getTime() - ET_OFFSET_MS);
const TODAY_ET_STR = NOW_ET.toISOString().split("T")[0];

const TODAY_START_ET = new Date(TODAY_ET_STR + "T00:00:00-04:00").getTime();
const TODAY_END_ET   = new Date(TODAY_ET_STR + "T23:59:59-04:00").getTime();

// ── 1. Atlas Memory — all bars today ─────────────────────────────────────────
const [allBarsToday] = await conn.execute(
  `SELECT id, bar_time, bar_time_et, session, is_rth, open, high, low, close, volume,
          adx, regime_classification, a1_eligible, a3_eligible, b1_eligible, sb1_eligible,
          active_models, atr, pipeline_run_id, received_at
   FROM atlas_memory
   WHERE bar_time >= ? AND bar_time <= ?
   ORDER BY bar_time ASC`,
  [TODAY_START_ET, TODAY_END_ET]
);

// ── 2. Atlas Memory — last 48h health ────────────────────────────────────────
const [last48h] = await conn.execute(
  `SELECT COUNT(*) as cnt, MAX(bar_time) as last_bar, MIN(bar_time) as first_bar
   FROM atlas_memory
   WHERE bar_time >= ?`,
  [NOW_UTC.getTime() - 48 * 60 * 60 * 1000]
);

// ── 3. Monitor Evaluations — today ───────────────────────────────────────────
const [evalToday] = await conn.execute(
  `SELECT me.id, me.atlas_memory_id, me.bar_time_et, me.session, me.is_rth,
          me.regime_classification, me.adx, me.integrity_ok, me.gap_detected,
          me.gap_minutes, me.duplicate_detected, me.integrity_notes,
          me.a1_eligible, me.a1_reason,
          me.a3_eligible, me.a3_reason,
          me.b1_eligible, me.b1_reason,
          me.sb1_eligible, me.sb1_reason,
          me.orb1_eligible, me.orb1_reason,
          me.active_models, me.signal_model, me.signal_direction,
          me.evaluated_at
   FROM monitor_evaluations me
   JOIN atlas_memory am ON me.atlas_memory_id = am.id
   WHERE am.bar_time >= ? AND am.bar_time <= ?
   ORDER BY am.bar_time ASC`,
  [TODAY_START_ET, TODAY_END_ET]
);

// ── 4. Integrity issues today ─────────────────────────────────────────────────
const [gapRows] = await conn.execute(
  `SELECT me.bar_time_et, me.gap_minutes, me.integrity_notes
   FROM monitor_evaluations me
   JOIN atlas_memory am ON me.atlas_memory_id = am.id
   WHERE me.gap_detected = 1 AND am.bar_time >= ? AND am.bar_time <= ?`,
  [TODAY_START_ET, TODAY_END_ET]
);
const [dupRows] = await conn.execute(
  `SELECT me.bar_time_et, me.integrity_notes
   FROM monitor_evaluations me
   JOIN atlas_memory am ON me.atlas_memory_id = am.id
   WHERE me.duplicate_detected = 1 AND am.bar_time >= ? AND am.bar_time <= ?`,
  [TODAY_START_ET, TODAY_END_ET]
);
const [invalidRows] = await conn.execute(
  `SELECT me.bar_time_et, me.integrity_notes
   FROM monitor_evaluations me
   JOIN atlas_memory am ON me.atlas_memory_id = am.id
   WHERE me.integrity_ok = 0 AND am.bar_time >= ? AND am.bar_time <= ?`,
  [TODAY_START_ET, TODAY_END_ET]
);

// ── 5. Regime distribution and ADX today ─────────────────────────────────────
const [regimeDist] = await conn.execute(
  `SELECT me.regime_classification, COUNT(*) as cnt
   FROM monitor_evaluations me
   JOIN atlas_memory am ON me.atlas_memory_id = am.id
   WHERE am.bar_time >= ? AND am.bar_time <= ?
   GROUP BY me.regime_classification`,
  [TODAY_START_ET, TODAY_END_ET]
);
const [adxRange] = await conn.execute(
  `SELECT MIN(CAST(me.adx AS DECIMAL(10,2))) as adx_min,
          MAX(CAST(me.adx AS DECIMAL(10,2))) as adx_max,
          AVG(CAST(me.adx AS DECIMAL(10,2))) as adx_avg
   FROM monitor_evaluations me
   JOIN atlas_memory am ON me.atlas_memory_id = am.id
   WHERE am.bar_time >= ? AND am.bar_time <= ? AND me.adx IS NOT NULL`,
  [TODAY_START_ET, TODAY_END_ET]
);

// ── 6. Eligible counts and signals today ─────────────────────────────────────
const [eligibleCounts] = await conn.execute(
  `SELECT
     SUM(me.a1_eligible)   as a1_eligible,
     SUM(me.a3_eligible)   as a3_eligible,
     SUM(me.b1_eligible)   as b1_eligible,
     SUM(me.sb1_eligible)  as sb1_eligible,
     SUM(me.orb1_eligible) as orb1_eligible,
     SUM(CASE WHEN me.signal_model IS NOT NULL THEN 1 ELSE 0 END) as signals_total
   FROM monitor_evaluations me
   JOIN atlas_memory am ON me.atlas_memory_id = am.id
   WHERE am.bar_time >= ? AND am.bar_time <= ?`,
  [TODAY_START_ET, TODAY_END_ET]
);

// ── 7. Ineligibility reasons today ───────────────────────────────────────────
async function getReasons(col) {
  const [rows] = await conn.execute(
    `SELECT me.${col}_reason as reason, COUNT(*) as cnt
     FROM monitor_evaluations me
     JOIN atlas_memory am ON me.atlas_memory_id = am.id
     WHERE am.bar_time >= ? AND am.bar_time <= ? AND me.${col}_eligible = 0
     GROUP BY me.${col}_reason ORDER BY cnt DESC`,
    [TODAY_START_ET, TODAY_END_ET]
  );
  return rows;
}
const [a1R, a3R, b1R, sb1R, orb1R] = await Promise.all([
  getReasons("a1"), getReasons("a3"), getReasons("b1"), getReasons("sb1"), getReasons("orb1")
]);

// ── 8. Regime timeline today ──────────────────────────────────────────────────
const [regimeTimeline] = await conn.execute(
  `SELECT me.bar_time_et, me.regime_classification, me.session
   FROM monitor_evaluations me
   JOIN atlas_memory am ON me.atlas_memory_id = am.id
   WHERE am.bar_time >= ? AND am.bar_time <= ?
   ORDER BY am.bar_time ASC`,
  [TODAY_START_ET, TODAY_END_ET]
);

// ── 9. Paper trades today ─────────────────────────────────────────────────────
const [paperTradesToday] = await conn.execute(
  `SELECT id, account, symbol, direction, model, status,
          entry, stop, target, exit_price, exit_reason,
          contracts, risk_dollars, pnl, current_r,
          mfe, mae, opened_at, closed_at, trade_duration_ms
   FROM paper_trades
   WHERE account = 'ATLAS_MONITOR_PAPER'
     AND opened_at >= ? AND opened_at <= ?
   ORDER BY opened_at ASC`,
  [new Date(TODAY_START_ET), new Date(TODAY_END_ET)]
);
const [sb1TradesToday] = await conn.execute(
  `SELECT id, symbol, direction, status,
          entry, stop, target, exit_price, exit_reason,
          contracts, risk_dollars, pnl, r_multiple,
          mfe, mae, opened_at, closed_at, holding_time_ms
   FROM sb1_paper_trades
   WHERE opened_at >= ? AND opened_at <= ?
   ORDER BY opened_at ASC`,
  [new Date(TODAY_START_ET), new Date(TODAY_END_ET)]
);

// ── 10. All-time closed trades for performance ────────────────────────────────
const [allClosed] = await conn.execute(
  `SELECT pnl, current_r as r_multiple, opened_at, closed_at, model, direction
   FROM paper_trades
   WHERE account = 'ATLAS_MONITOR_PAPER' AND status = 'CLOSED'
   ORDER BY closed_at DESC`
);
const [allSb1Closed] = await conn.execute(
  `SELECT pnl, r_multiple, opened_at, closed_at, direction
   FROM sb1_paper_trades WHERE status = 'CLOSED'
   ORDER BY closed_at DESC`
);

// ── 11. LLC progress ──────────────────────────────────────────────────────────
const [llcRows] = await conn.execute(
  `SELECT * FROM live_learning_sessions_monitor ORDER BY session_date DESC LIMIT 10`
);

// ── 12. Session reports today ─────────────────────────────────────────────────
const [sessionReports] = await conn.execute(
  `SELECT id, session_date, report_type, status, bars_expected, bars_received,
          bars_missing, signals_generated, trades_opened, trades_closed,
          session_pnl, certification_status, owner_action_required,
          github_commit_sha, generated_at
   FROM session_reports
   WHERE session_date >= ? AND session_date <= ?
   ORDER BY session_date DESC`,
  [new Date(TODAY_START_ET), new Date(TODAY_END_ET)]
);

// ── 13. Open positions right now ──────────────────────────────────────────────
const [openStandard] = await conn.execute(
  `SELECT id, model, direction, entry, stop, target, risk_dollars, mfe, mae, opened_at
   FROM paper_trades WHERE account = 'ATLAS_MONITOR_PAPER' AND status = 'OPEN'`
);
const [openSb1] = await conn.execute(
  `SELECT id, direction, entry, stop, target, risk_dollars, mfe, mae, opened_at
   FROM sb1_paper_trades WHERE status = 'OPEN'`
);

await conn.end();

// ── Compute performance stats ─────────────────────────────────────────────────
function computeStats(trades) {
  const closed = trades.filter(t => t.pnl !== null);
  if (!closed.length) return { trades: 0, wins: 0, losses: 0, winRate: 0, profitFactor: 0, netPnl: 0, grossProfit: 0, grossLoss: 0, avgR: 0 };
  const wins = closed.filter(t => parseFloat(t.pnl) > 0);
  const losses = closed.filter(t => parseFloat(t.pnl) <= 0);
  const grossProfit = wins.reduce((s, t) => s + parseFloat(t.pnl), 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + parseFloat(t.pnl), 0));
  const netPnl = grossProfit - grossLoss;
  const avgR = closed.reduce((s, t) => s + parseFloat(t.r_multiple ?? 0), 0) / closed.length;
  return {
    trades: closed.length,
    wins: wins.length,
    losses: losses.length,
    winRate: closed.length > 0 ? (wins.length / closed.length * 100).toFixed(1) : 0,
    profitFactor: grossLoss > 0 ? (grossProfit / grossLoss).toFixed(2) : grossProfit > 0 ? "∞" : 0,
    netPnl: netPnl.toFixed(2),
    grossProfit: grossProfit.toFixed(2),
    grossLoss: grossLoss.toFixed(2),
    avgR: avgR.toFixed(2),
  };
}

const NOW_MS = NOW_UTC.getTime();
const allTrades = [
  ...allClosed.map(t => ({ ...t, r_multiple: t.r_multiple })),
  ...allSb1Closed.map(t => ({ ...t, model: "SB1" }))
];

const todayTrades = allTrades.filter(t => new Date(t.closed_at).getTime() >= TODAY_START_ET);
const day7Trades  = allTrades.filter(t => new Date(t.closed_at).getTime() >= NOW_MS - 7*86400000);
const day30Trades = allTrades.filter(t => new Date(t.closed_at).getTime() >= NOW_MS - 30*86400000);

const data = {
  reportDate: TODAY_ET_STR,
  reportGeneratedAt: NOW_UTC.toISOString(),
  nowEt: NOW_ET.toISOString(),
  atlasMemory: {
    barsToday: allBarsToday.length,
    last48h: last48h[0],
    firstBarToday: allBarsToday[0]?.bar_time_et ?? null,
    lastBarToday: allBarsToday[allBarsToday.length - 1]?.bar_time_et ?? null,
    sessions: [...new Set(allBarsToday.map(b => b.session))],
    rthBars: allBarsToday.filter(b => b.is_rth).length,
  },
  evaluations: {
    count: evalToday.length,
    gaps: gapRows,
    duplicates: dupRows,
    invalid: invalidRows,
    regimeDistribution: regimeDist,
    adxRange: adxRange[0],
    eligibleCounts: eligibleCounts[0],
    ineligibilityReasons: { A1: a1R, A3: a3R, B1: b1R, SB1: sb1R, "ORB-1": orb1R },
    regimeTimeline,
  },
  paperTrades: {
    todayStandard: paperTradesToday,
    todaySb1: sb1TradesToday,
    openStandard,
    openSb1,
  },
  performance: {
    today: computeStats(todayTrades),
    last7d: computeStats(day7Trades),
    last30d: computeStats(day30Trades),
    allTime: computeStats(allTrades),
  },
  llc: llcRows,
  sessionReports,
};

writeFileSync("/tmp/atlas-daily-ops-data.json", JSON.stringify(data, null, 2));
console.log("✓ Data written to /tmp/atlas-daily-ops-data.json");
console.log(`  Bars today: ${data.atlasMemory.barsToday}`);
console.log(`  Evaluations today: ${data.evaluations.count}`);
console.log(`  Gaps today: ${gapRows.length}, Duplicates: ${dupRows.length}, Invalid: ${invalidRows.length}`);
console.log(`  Eligible counts:`, JSON.stringify(eligibleCounts[0]));
console.log(`  Paper trades today: ${paperTradesToday.length + sb1TradesToday.length}`);
console.log(`  Open positions: ${openStandard.length + openSb1.length}`);
console.log(`  LLC rows: ${llcRows.length}`);
console.log(`  Session reports today: ${sessionReports.length}`);
console.log(`  Performance today:`, JSON.stringify(data.performance.today));
console.log(`  Performance 7d:`, JSON.stringify(data.performance.last7d));
console.log(`  Performance 30d:`, JSON.stringify(data.performance.last30d));
console.log(`  Performance all-time:`, JSON.stringify(data.performance.allTime));
