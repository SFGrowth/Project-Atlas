/**
 * sprint108-validation.mjs
 * Sprint 108 — Institutional Validation of DARWIN-S107-002
 * (VWAP Continuation Trend Rider)
 *
 * DARWIN-S107-002 Entry Rules (from Sprint 107 discovery):
 *   - Detect VWAP deviation episode onset: bar where |close - vwap| > 0.5×ATR
 *     AND the prior bar was within 0.25×ATR of VWAP (episode start)
 *   - Entry: next bar open after episode onset confirmation
 *   - Direction: with the deviation (above VWAP = LONG, below = SHORT)
 *   - Stop: 2.5×ATR from entry (against deviation)
 *   - Target: 2×ATR from entry (with deviation) = 2R target
 *   - Hold limit: 10 bars max
 *
 * NOTE: atlas_memory does not have VWAP for historical bars.
 * We compute a rolling VWAP proxy using mnq_candles:
 *   VWAP = sum(typical_price × volume) / sum(volume) per session day
 *   ATR = 14-period ATR
 *
 * Parts tested:
 *   Part 1 — Full 2-year replay (13 metrics)
 *   Part 2 — Robustness: segment by regime proxy, session, year
 *   Part 3 — Stability: split into 4 independent periods
 *   Part 4 — Monte Carlo: 10,000 simulations
 *   Part 5 — Portfolio contribution
 */
import mysql from 'mysql2/promise';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
require('dotenv').config();

const DB_URL = process.env.DATABASE_URL;

// ─── Helpers ────────────────────────────────────────────────────────────────

function atr14(bars, idx) {
  if (idx < 14) return null;
  let sum = 0;
  for (let i = idx - 13; i <= idx; i++) {
    const h = parseFloat(bars[i].high);
    const l = parseFloat(bars[i].low);
    const pc = parseFloat(bars[i - 1].close);
    const tr = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
    sum += tr;
  }
  return sum / 14;
}

function computeSessionVwap(bars) {
  // Group bars by session_end_date, compute cumulative VWAP per session
  const vwapMap = new Map(); // window_start → vwap
  const sessions = {};
  for (const b of bars) {
    const d = b.session_end_date_str;
    if (!sessions[d]) sessions[d] = { cumTpv: 0, cumVol: 0 };
    const tp = (parseFloat(b.high) + parseFloat(b.low) + parseFloat(b.close)) / 3;
    const vol = b.volume || 1;
    sessions[d].cumTpv += tp * vol;
    sessions[d].cumVol += vol;
    vwapMap.set(b.window_start, sessions[d].cumTpv / sessions[d].cumVol);
  }
  return vwapMap;
}

function classifySession(windowStartNs) {
  const ms = Number(windowStartNs) / 1_000_000;
  const d = new Date(ms);
  const utcHour = d.getUTCHours();
  const utcMin = d.getUTCMinutes();
  const etHour = utcHour - 4;
  const etDecimal = etHour + utcMin / 60;
  if (etDecimal >= 9.5 && etDecimal < 11) return 'AM_OPEN';
  if (etDecimal >= 11 && etDecimal < 12) return 'AM_MID';
  if (etDecimal >= 12 && etDecimal < 13) return 'LUNCH';
  if (etDecimal >= 13 && etDecimal < 15) return 'PM';
  if (etDecimal >= 15 && etDecimal < 16) return 'PM_CLOSE';
  return 'OV';
}

function isRTH(windowStartNs) {
  const ms = Number(windowStartNs) / 1_000_000;
  const d = new Date(ms);
  const etHour = d.getUTCHours() - 4;
  return etHour >= 9.5 && etHour < 16;
}

// ─── Main Validation ─────────────────────────────────────────────────────────

async function main() {
  console.log('=== Sprint 108 — DARWIN-S107-002 Institutional Validation ===\n');

  const db = await mysql.createConnection(DB_URL);

  // Load all candles ordered by time
  console.log('Loading mnq_candles from database...');
  const [rows] = await db.execute(
    `SELECT ticker, window_start, session_end_date, open, high, low, close, volume, transactions
     FROM mnq_candles
     ORDER BY window_start ASC`
  );
  console.log(`Loaded ${rows.length} bars\n`);

  // Add session_end_date as string for VWAP grouping
  for (const r of rows) {
    if (r.session_end_date instanceof Date) {
      r.session_end_date_str = r.session_end_date.toISOString().substring(0, 10);
    } else {
      r.session_end_date_str = String(r.session_end_date).substring(0, 10);
    }
  }

  // Compute session VWAP for all bars
  console.log('Computing session VWAP...');
  const vwapMap = computeSessionVwap(rows);

  // ─── Part 1: Full Replay ──────────────────────────────────────────────────
  console.log('Running full 2-year replay...\n');

  const trades = [];
  let inTrade = null;

  for (let i = 15; i < rows.length - 1; i++) {
    const bar = rows[i];
    const prevBar = rows[i - 1];
    const close = parseFloat(bar.close);
    const prevClose = parseFloat(prevBar.close);
    const vwap = vwapMap.get(bar.window_start);
    const prevVwap = vwapMap.get(prevBar.window_start);
    const atr = atr14(rows, i);

    if (!vwap || !prevVwap || !atr || atr === 0) continue;

    const distVwap = close - vwap;
    const prevDistVwap = prevClose - prevVwap;

    // ── Manage open trade ──
    if (inTrade) {
      const currentHigh = parseFloat(bar.high);
      const currentLow = parseFloat(bar.low);
      inTrade.barsHeld++;

      // Track MFE/MAE
      if (inTrade.direction === 'LONG') {
        inTrade.mfe = Math.max(inTrade.mfe, currentHigh - inTrade.entry);
        inTrade.mae = Math.min(inTrade.mae, currentLow - inTrade.entry);
      } else {
        inTrade.mfe = Math.max(inTrade.mfe, inTrade.entry - currentLow);
        inTrade.mae = Math.min(inTrade.mae, inTrade.entry - currentHigh);
      }

      let exitPrice = null;
      let exitReason = null;

      if (inTrade.direction === 'LONG') {
        if (currentLow <= inTrade.stop) {
          exitPrice = inTrade.stop;
          exitReason = 'STOP';
        } else if (currentHigh >= inTrade.target) {
          exitPrice = inTrade.target;
          exitReason = 'TARGET';
        }
      } else {
        if (currentHigh >= inTrade.stop) {
          exitPrice = inTrade.stop;
          exitReason = 'STOP';
        } else if (currentLow <= inTrade.target) {
          exitPrice = inTrade.target;
          exitReason = 'TARGET';
        }
      }

      // Time exit
      if (!exitPrice && inTrade.barsHeld >= 10) {
        exitPrice = close;
        exitReason = 'TIME';
      }

      if (exitPrice) {
        const pnlPoints = inTrade.direction === 'LONG'
          ? exitPrice - inTrade.entry
          : inTrade.entry - exitPrice;
        const pnlDollar = pnlPoints * 2; // MNQ = $2/point
        const pnlR = pnlPoints / (inTrade.entry - inTrade.stop) *
          (inTrade.direction === 'LONG' ? 1 : -1);

        trades.push({
          ...inTrade,
          exitPrice,
          exitReason,
          pnlPoints,
          pnlDollar,
          pnlR: inTrade.direction === 'LONG'
            ? (exitPrice - inTrade.entry) / Math.abs(inTrade.entry - inTrade.stop)
            : (inTrade.entry - exitPrice) / Math.abs(inTrade.stop - inTrade.entry),
          mfe: inTrade.mfe,
          mae: inTrade.mae,
        });
        inTrade = null;
      }
      continue;
    }

    // ── Episode onset detection ──
    // Prior bar within 0.25×ATR of VWAP (near VWAP)
    const prevNearVwap = Math.abs(prevDistVwap) <= 0.25 * atr;
    // Current bar deviates > 0.5×ATR from VWAP
    const curDeviated = Math.abs(distVwap) > 0.5 * atr;

    if (!prevNearVwap || !curDeviated) continue;

    // Only trade RTH sessions
    if (!isRTH(bar.window_start)) continue;

    // Entry on next bar open
    const nextBar = rows[i + 1];
    if (!nextBar) continue;

    const direction = distVwap > 0 ? 'LONG' : 'SHORT';
    const entryPrice = parseFloat(nextBar.open);
    const stopDist = 2.5 * atr;
    const targetDist = 2.0 * atr;

    const stop = direction === 'LONG' ? entryPrice - stopDist : entryPrice + stopDist;
    const target = direction === 'LONG' ? entryPrice + targetDist : entryPrice - targetDist;

    const session = classifySession(bar.window_start);

    inTrade = {
      entryBar: i + 1,
      ticker: bar.ticker,
      windowStart: nextBar.window_start,
      sessionEndDate: bar.session_end_date_str,
      session,
      direction,
      entry: entryPrice,
      stop,
      target,
      atr,
      vwap,
      distVwap,
      barsHeld: 0,
      mfe: 0,
      mae: 0,
    };
    i++; // skip the entry bar
  }

  // Close any open trade at last bar
  if (inTrade) {
    const lastBar = rows[rows.length - 1];
    const exitPrice = parseFloat(lastBar.close);
    const pnlPoints = inTrade.direction === 'LONG'
      ? exitPrice - inTrade.entry
      : inTrade.entry - exitPrice;
    trades.push({
      ...inTrade,
      exitPrice,
      exitReason: 'END_OF_DATA',
      pnlPoints,
      pnlDollar: pnlPoints * 2,
      pnlR: pnlPoints / Math.abs(inTrade.entry - inTrade.stop),
      mfe: inTrade.mfe,
      mae: inTrade.mae,
    });
  }

  // ─── Part 1 Metrics ──────────────────────────────────────────────────────
  const n = trades.length;
  const wins = trades.filter(t => t.pnlDollar > 0);
  const losses = trades.filter(t => t.pnlDollar <= 0);
  const winRate = n > 0 ? wins.length / n : 0;
  const totalPnl = trades.reduce((s, t) => s + t.pnlDollar, 0);
  const avgWin = wins.length > 0 ? wins.reduce((s, t) => s + t.pnlDollar, 0) / wins.length : 0;
  const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((s, t) => s + t.pnlDollar, 0) / losses.length) : 0;
  const pf = avgLoss > 0 ? (wins.reduce((s, t) => s + t.pnlDollar, 0)) / Math.abs(losses.reduce((s, t) => s + t.pnlDollar, 0)) : 0;
  const avgR = n > 0 ? trades.reduce((s, t) => s + t.pnlR, 0) / n : 0;

  // Max drawdown
  let peak = 0, equity = 0, maxDD = 0;
  for (const t of trades) {
    equity += t.pnlDollar;
    if (equity > peak) peak = equity;
    const dd = peak - equity;
    if (dd > maxDD) maxDD = dd;
  }

  // Avg hold time
  const avgHold = n > 0 ? trades.reduce((s, t) => s + t.barsHeld, 0) / n : 0;

  // Exit breakdown
  const exitBreakdown = {};
  for (const t of trades) {
    exitBreakdown[t.exitReason] = (exitBreakdown[t.exitReason] || 0) + 1;
  }

  // Consecutive losses
  let maxConsecLoss = 0, consecLoss = 0;
  for (const t of trades) {
    if (t.pnlDollar <= 0) {
      consecLoss++;
      maxConsecLoss = Math.max(maxConsecLoss, consecLoss);
    } else {
      consecLoss = 0;
    }
  }

  console.log('=== PART 1: FULL 2-YEAR REPLAY ===');
  console.log(`Total trades:        ${n}`);
  console.log(`Win rate:            ${(winRate * 100).toFixed(1)}%`);
  console.log(`Profit factor:       ${pf.toFixed(3)}`);
  console.log(`Total P&L:           $${totalPnl.toFixed(2)}`);
  console.log(`Avg win:             $${avgWin.toFixed(2)}`);
  console.log(`Avg loss:            $${avgLoss.toFixed(2)}`);
  console.log(`Avg R per trade:     ${avgR.toFixed(3)}R`);
  console.log(`Max drawdown:        $${maxDD.toFixed(2)}`);
  console.log(`Avg hold (bars):     ${avgHold.toFixed(1)}`);
  console.log(`Max consec losses:   ${maxConsecLoss}`);
  console.log(`Exit breakdown:      ${JSON.stringify(exitBreakdown)}`);
  console.log(`Sharpe (approx):     ${(totalPnl / (maxDD || 1)).toFixed(3)}`);

  // ─── Part 2: Robustness ───────────────────────────────────────────────────
  console.log('\n=== PART 2: ROBUSTNESS SEGMENTATION ===');

  // By session
  const sessions = ['AM_OPEN', 'AM_MID', 'LUNCH', 'PM', 'PM_CLOSE', 'OV'];
  for (const sess of sessions) {
    const st = trades.filter(t => t.session === sess);
    if (st.length === 0) continue;
    const sw = st.filter(t => t.pnlDollar > 0);
    const sPnl = st.reduce((s, t) => s + t.pnlDollar, 0);
    const sWr = (sw.length / st.length * 100).toFixed(1);
    console.log(`  ${sess.padEnd(12)}: ${st.length} trades, WR ${sWr}%, P&L $${sPnl.toFixed(0)}`);
  }

  // By year
  const years = ['2024', '2025', '2026'];
  for (const yr of years) {
    const yt = trades.filter(t => t.sessionEndDate && t.sessionEndDate.startsWith(yr));
    if (yt.length === 0) continue;
    const yw = yt.filter(t => t.pnlDollar > 0);
    const yPnl = yt.reduce((s, t) => s + t.pnlDollar, 0);
    const yWr = (yw.length / yt.length * 100).toFixed(1);
    console.log(`  ${yr}:          ${yt.length} trades, WR ${yWr}%, P&L $${yPnl.toFixed(0)}`);
  }

  // By direction
  for (const dir of ['LONG', 'SHORT']) {
    const dt = trades.filter(t => t.direction === dir);
    if (dt.length === 0) continue;
    const dw = dt.filter(t => t.pnlDollar > 0);
    const dPnl = dt.reduce((s, t) => s + t.pnlDollar, 0);
    const dWr = (dw.length / dt.length * 100).toFixed(1);
    console.log(`  ${dir.padEnd(12)}: ${dt.length} trades, WR ${dWr}%, P&L $${dPnl.toFixed(0)}`);
  }

  // ─── Part 3: Stability ────────────────────────────────────────────────────
  console.log('\n=== PART 3: STABILITY (4 INDEPENDENT PERIODS) ===');
  const periods = [
    { name: 'Q3-Q4 2024', start: '2024-07', end: '2024-12' },
    { name: 'Q1-Q2 2025', start: '2025-01', end: '2025-06' },
    { name: 'Q3-Q4 2025', start: '2025-07', end: '2025-12' },
    { name: 'Q1-Q2 2026', start: '2026-01', end: '2026-07' },
  ];
  for (const p of periods) {
    const pt = trades.filter(t =>
      t.sessionEndDate >= p.start && t.sessionEndDate <= p.end
    );
    if (pt.length === 0) { console.log(`  ${p.name}: 0 trades`); continue; }
    const pw = pt.filter(t => t.pnlDollar > 0);
    const pPnl = pt.reduce((s, t) => s + t.pnlDollar, 0);
    const pWr = (pw.length / pt.length * 100).toFixed(1);
    const pWins = pw.reduce((s, t) => s + t.pnlDollar, 0);
    const pLosses = Math.abs(pt.filter(t => t.pnlDollar <= 0).reduce((s, t) => s + t.pnlDollar, 0));
    const pPf = pLosses > 0 ? (pWins / pLosses).toFixed(3) : 'INF';
    console.log(`  ${p.name}: ${pt.length} trades, WR ${pWr}%, PF ${pPf}, P&L $${pPnl.toFixed(0)}`);
  }

  // ─── Part 4: Monte Carlo ──────────────────────────────────────────────────
  console.log('\n=== PART 4: MONTE CARLO (10,000 SIMULATIONS) ===');
  const SIMS = 10000;
  const pnls = trades.map(t => t.pnlDollar);
  const simResults = [];

  for (let s = 0; s < SIMS; s++) {
    let eq = 0, pk = 0, dd = 0;
    for (let i = 0; i < pnls.length; i++) {
      const idx = Math.floor(Math.random() * pnls.length);
      eq += pnls[idx];
      if (eq > pk) pk = eq;
      const d = pk - eq;
      if (d > dd) dd = d;
    }
    simResults.push({ finalEq: eq, maxDD: dd });
  }

  simResults.sort((a, b) => a.finalEq - b.finalEq);
  const p5 = simResults[Math.floor(SIMS * 0.05)].finalEq;
  const p25 = simResults[Math.floor(SIMS * 0.25)].finalEq;
  const p50 = simResults[Math.floor(SIMS * 0.50)].finalEq;
  const p75 = simResults[Math.floor(SIMS * 0.75)].finalEq;
  const p95 = simResults[Math.floor(SIMS * 0.95)].finalEq;
  const pctPositive = simResults.filter(r => r.finalEq > 0).length / SIMS;

  simResults.sort((a, b) => b.maxDD - a.maxDD);
  const ddP95 = simResults[Math.floor(SIMS * 0.05)].maxDD;
  const ddP50 = simResults[Math.floor(SIMS * 0.50)].maxDD;

  // Prop firm pass: max DD < $2,500 (5% of $50K Apex account)
  const propPass = simResults.filter(r => r.maxDD < 2500).length / SIMS;

  console.log(`  P5  final equity:  $${p5.toFixed(0)}`);
  console.log(`  P25 final equity:  $${p25.toFixed(0)}`);
  console.log(`  P50 final equity:  $${p50.toFixed(0)}`);
  console.log(`  P75 final equity:  $${p75.toFixed(0)}`);
  console.log(`  P95 final equity:  $${p95.toFixed(0)}`);
  console.log(`  % positive sims:   ${(pctPositive * 100).toFixed(1)}%`);
  console.log(`  P50 max drawdown:  $${ddP50.toFixed(0)}`);
  console.log(`  P95 max drawdown:  $${ddP95.toFixed(0)}`);
  console.log(`  Prop firm pass:    ${(propPass * 100).toFixed(1)}%`);

  // ─── Part 5: Portfolio Contribution ──────────────────────────────────────
  console.log('\n=== PART 5: PORTFOLIO CONTRIBUTION ===');
  const totalBars = rows.filter(r => isRTH(r.window_start)).length;
  const tradeBars = trades.reduce((s, t) => s + t.barsHeld, 0);
  const coverage = totalBars > 0 ? tradeBars / totalBars : 0;
  console.log(`  RTH bars total:    ${totalBars}`);
  console.log(`  Bars in trades:    ${tradeBars}`);
  console.log(`  Coverage:          ${(coverage * 100).toFixed(1)}%`);
  console.log(`  Net P&L:           $${totalPnl.toFixed(2)}`);
  console.log(`  Max drawdown:      $${maxDD.toFixed(2)}`);
  console.log(`  Calmar ratio:      ${maxDD > 0 ? (totalPnl / maxDD).toFixed(3) : 'N/A'}`);

  // Save results to file for Sprint 108 closure report
  const results = {
    part1: { n, winRate, pf, totalPnl, avgWin, avgLoss, avgR, maxDD, avgHold, maxConsecLoss, exitBreakdown },
    part2: { sessions: {}, years: {}, directions: {} },
    part3: {},
    part4: { p5, p25, p50, p75, p95, pctPositive, ddP50, ddP95, propPass },
    part5: { totalBars, tradeBars, coverage, totalPnl, maxDD },
    trades: trades.slice(0, 20), // first 20 for sample
  };

  // Fill part2
  for (const sess of sessions) {
    const st = trades.filter(t => t.session === sess);
    if (st.length > 0) {
      const sw = st.filter(t => t.pnlDollar > 0);
      results.part2.sessions[sess] = {
        n: st.length,
        wr: sw.length / st.length,
        pnl: st.reduce((s, t) => s + t.pnlDollar, 0),
      };
    }
  }
  for (const yr of years) {
    const yt = trades.filter(t => t.sessionEndDate && t.sessionEndDate.startsWith(yr));
    if (yt.length > 0) {
      const yw = yt.filter(t => t.pnlDollar > 0);
      results.part2.years[yr] = {
        n: yt.length,
        wr: yw.length / yt.length,
        pnl: yt.reduce((s, t) => s + t.pnlDollar, 0),
      };
    }
  }
  for (const dir of ['LONG', 'SHORT']) {
    const dt = trades.filter(t => t.direction === dir);
    if (dt.length > 0) {
      const dw = dt.filter(t => t.pnlDollar > 0);
      results.part2.directions[dir] = {
        n: dt.length,
        wr: dw.length / dt.length,
        pnl: dt.reduce((s, t) => s + t.pnlDollar, 0),
      };
    }
  }
  for (const p of periods) {
    const pt = trades.filter(t => t.sessionEndDate >= p.start && t.sessionEndDate <= p.end);
    if (pt.length > 0) {
      const pw = pt.filter(t => t.pnlDollar > 0);
      const pWins = pw.reduce((s, t) => s + t.pnlDollar, 0);
      const pLosses = Math.abs(pt.filter(t => t.pnlDollar <= 0).reduce((s, t) => s + t.pnlDollar, 0));
      results.part3[p.name] = {
        n: pt.length,
        wr: pw.length / pt.length,
        pf: pLosses > 0 ? pWins / pLosses : null,
        pnl: pt.reduce((s, t) => s + t.pnlDollar, 0),
      };
    }
  }

  const fs = await import('fs');
  fs.writeFileSync('/tmp/sprint108-results.json', JSON.stringify(results, null, 2));
  console.log('\nResults saved to /tmp/sprint108-results.json');

  await db.end();
}

main().catch(e => {
  console.error('FATAL:', e.message);
  console.error(e.stack);
  process.exit(1);
});
