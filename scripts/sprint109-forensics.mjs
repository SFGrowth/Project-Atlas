/**
 * sprint109-forensics.mjs
 * Sprint 109 — Behavioural Discriminator Discovery
 * Part 1: Trade Forensics — extract 27 features for all 579 DARWIN-S107-002 trades
 *
 * Dataset: ATLAS-MNQ-5M-V1 v1.0
 * Checksum: 663893c56e6e6001f937f7e11ed76bd4238e21f387fd7a9de9dcf8ea44df06ff
 */
import mysql from 'mysql2/promise';
import { createRequire } from 'module';
import { writeFileSync } from 'fs';
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

function adx14(bars, idx) {
  // Simplified ADX: average directional movement over 14 bars
  if (idx < 28) return null;
  let dmPlus = 0, dmMinus = 0, tr = 0;
  for (let i = idx - 13; i <= idx; i++) {
    const h = parseFloat(bars[i].high);
    const l = parseFloat(bars[i].low);
    const ph = parseFloat(bars[i - 1].high);
    const pl = parseFloat(bars[i - 1].low);
    const pc = parseFloat(bars[i - 1].close);
    const curTr = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
    tr += curTr;
    const upMove = h - ph;
    const downMove = pl - l;
    if (upMove > downMove && upMove > 0) dmPlus += upMove;
    if (downMove > upMove && downMove > 0) dmMinus += downMove;
  }
  if (tr === 0) return 0;
  const diPlus = (dmPlus / tr) * 100;
  const diMinus = (dmMinus / tr) * 100;
  const dx = diPlus + diMinus > 0 ? Math.abs(diPlus - diMinus) / (diPlus + diMinus) * 100 : 0;
  return dx;
}

function rsi14(bars, idx) {
  if (idx < 14) return null;
  let gains = 0, losses = 0;
  for (let i = idx - 13; i <= idx; i++) {
    const diff = parseFloat(bars[i].close) - parseFloat(bars[i - 1].close);
    if (diff > 0) gains += diff;
    else losses += Math.abs(diff);
  }
  if (losses === 0) return 100;
  const rs = gains / losses;
  return 100 - 100 / (1 + rs);
}

function ema(bars, idx, period) {
  if (idx < period) return null;
  const k = 2 / (period + 1);
  let e = parseFloat(bars[idx - period].close);
  for (let i = idx - period + 1; i <= idx; i++) {
    e = parseFloat(bars[i].close) * k + e * (1 - k);
  }
  return e;
}

function computeSessionVwap(bars) {
  const vwapMap = new Map();
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

function vwapSlope(vwapMap, bars, idx) {
  // Slope over last 3 bars
  if (idx < 3) return 0;
  const v1 = vwapMap.get(bars[idx - 2].window_start);
  const v2 = vwapMap.get(bars[idx].window_start);
  if (!v1 || !v2) return 0;
  return (v2 - v1) / 2; // per-bar slope
}

function isRTH(windowStartNs) {
  const ms = Number(windowStartNs) / 1_000_000;
  const d = new Date(ms);
  // Approximate ET (UTC-4 in summer, UTC-5 in winter — use UTC-4 for simplicity)
  const etHour = d.getUTCHours() - 4;
  return etHour >= 9.5 && etHour < 16;
}

function classifySession(windowStartNs) {
  const ms = Number(windowStartNs) / 1_000_000;
  const d = new Date(ms);
  const utcH = d.getUTCHours();
  const utcM = d.getUTCMinutes();
  const etH = utcH - 4;
  const etDec = etH + utcM / 60;
  if (etDec >= 9.5 && etDec < 11) return 'AM_OPEN';
  if (etDec >= 11 && etDec < 12) return 'AM_MID';
  if (etDec >= 12 && etDec < 13) return 'LUNCH';
  if (etDec >= 13 && etDec < 15.5) return 'PM';
  if (etDec >= 15.5 && etDec < 16) return 'PM_CLOSE';
  return 'OV';
}

function classifyRegime(adx, atrRatio, ema20, ema50) {
  // Regime classification based on ADX + ATR ratio + EMA alignment
  if (adx === null) return 'UNKNOWN';
  if (adx > 25 && atrRatio > 1.2) {
    if (ema20 !== null && ema50 !== null) {
      return ema20 > ema50 ? 'TRENDING_BULL' : 'TRENDING_BEAR';
    }
    return 'TRENDING';
  }
  if (adx < 15 && atrRatio < 0.8) return 'COMPRESSED';
  if (adx < 20) return 'CHOPPY';
  return 'TRANSITIONAL';
}

function minutesSinceSessionOpen(windowStartNs) {
  const ms = Number(windowStartNs) / 1_000_000;
  const d = new Date(ms);
  const etH = d.getUTCHours() - 4;
  const etM = d.getUTCMinutes();
  const etDec = etH + etM / 60;
  if (etDec < 9.5) return null; // pre-market
  return Math.round((etDec - 9.5) * 60);
}

function minutesUntilSessionClose(windowStartNs) {
  const ms = Number(windowStartNs) / 1_000_000;
  const d = new Date(ms);
  const etH = d.getUTCHours() - 4;
  const etM = d.getUTCMinutes();
  const etDec = etH + etM / 60;
  if (etDec > 16) return null;
  return Math.round((16 - etDec) * 60);
}

function volumeRatio(bars, idx, lookback = 20) {
  // Current bar volume vs average of last N bars
  if (idx < lookback) return 1;
  let sum = 0;
  for (let i = idx - lookback; i < idx; i++) {
    sum += bars[i].volume || 0;
  }
  const avg = sum / lookback;
  return avg > 0 ? (bars[idx].volume || 0) / avg : 1;
}

function overnightRange(bars, idx) {
  // Find the overnight session bars for the current trading day
  const ms = Number(bars[idx].window_start) / 1_000_000;
  const d = new Date(ms);
  const etH = d.getUTCHours() - 4;
  // Overnight = 18:00 ET yesterday to 09:30 ET today
  const sessionDate = bars[idx].session_end_date_str;
  let ovHigh = null, ovLow = null;
  for (let i = Math.max(0, idx - 200); i < idx; i++) {
    if (bars[i].session_end_date_str !== sessionDate) continue;
    const bMs = Number(bars[i].window_start) / 1_000_000;
    const bD = new Date(bMs);
    const bEtH = bD.getUTCHours() - 4;
    if (bEtH < 9.5) {
      const h = parseFloat(bars[i].high);
      const l = parseFloat(bars[i].low);
      if (ovHigh === null || h > ovHigh) ovHigh = h;
      if (ovLow === null || l < ovLow) ovLow = l;
    }
  }
  return { ovHigh, ovLow };
}

function openingRange(bars, idx) {
  // Opening range = first 30 min of RTH (09:30–10:00 ET)
  const sessionDate = bars[idx].session_end_date_str;
  let orHigh = null, orLow = null;
  for (let i = Math.max(0, idx - 200); i < idx; i++) {
    if (bars[i].session_end_date_str !== sessionDate) continue;
    const bMs = Number(bars[i].window_start) / 1_000_000;
    const bD = new Date(bMs);
    const bEtH = bD.getUTCHours() - 4;
    const bEtM = bD.getUTCMinutes();
    const bEtDec = bEtH + bEtM / 60;
    if (bEtDec >= 9.5 && bEtDec < 10) {
      const h = parseFloat(bars[i].high);
      const l = parseFloat(bars[i].low);
      if (orHigh === null || h > orHigh) orHigh = h;
      if (orLow === null || l < orLow) orLow = l;
    }
  }
  return { orHigh, orLow };
}

function prevDayRange(bars, idx) {
  // Previous day's high/low
  const sessionDate = bars[idx].session_end_date_str;
  let prevDate = null;
  let pdHigh = null, pdLow = null;
  // Find previous session date
  for (let i = idx - 1; i >= Math.max(0, idx - 500); i--) {
    if (bars[i].session_end_date_str !== sessionDate) {
      if (!prevDate) prevDate = bars[i].session_end_date_str;
      if (bars[i].session_end_date_str === prevDate) {
        const h = parseFloat(bars[i].high);
        const l = parseFloat(bars[i].low);
        if (pdHigh === null || h > pdHigh) pdHigh = h;
        if (pdLow === null || l < pdLow) pdLow = l;
      } else if (prevDate) {
        break;
      }
    }
  }
  return { pdHigh, pdLow };
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Sprint 109 — Part 1: Trade Forensics ===');
  console.log('Dataset: ATLAS-MNQ-5M-V1 v1.0\n');

  const db = await mysql.createConnection(DB_URL);

  console.log('Loading mnq_candles...');
  const [rows] = await db.execute(
    `SELECT ticker, window_start, session_end_date, open, high, low, close, volume, transactions
     FROM mnq_candles ORDER BY window_start ASC`
  );
  console.log(`Loaded ${rows.length} bars\n`);

  // Annotate session dates
  for (const r of rows) {
    if (r.session_end_date instanceof Date) {
      r.session_end_date_str = r.session_end_date.toISOString().substring(0, 10);
    } else {
      r.session_end_date_str = String(r.session_end_date).substring(0, 10);
    }
  }

  // Compute VWAP
  console.log('Computing session VWAP...');
  const vwapMap = computeSessionVwap(rows);

  // ─── Replay DARWIN-S107-002 and capture features ──────────────────────────
  console.log('Replaying DARWIN-S107-002 with 27-feature capture...\n');

  const trades = [];
  let inTrade = null;

  for (let i = 28; i < rows.length - 1; i++) {
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

      if (inTrade.direction === 'LONG') {
        inTrade.mfe = Math.max(inTrade.mfe, currentHigh - inTrade.entry);
        inTrade.mae = Math.min(inTrade.mae, currentLow - inTrade.entry);
      } else {
        inTrade.mfe = Math.max(inTrade.mfe, inTrade.entry - currentLow);
        inTrade.mae = Math.min(inTrade.mae, inTrade.entry - currentHigh);
      }

      let exitPrice = null, exitReason = null;
      if (inTrade.direction === 'LONG') {
        if (currentLow <= inTrade.stop) { exitPrice = inTrade.stop; exitReason = 'STOP'; }
        else if (currentHigh >= inTrade.target) { exitPrice = inTrade.target; exitReason = 'TARGET'; }
      } else {
        if (currentHigh >= inTrade.stop) { exitPrice = inTrade.stop; exitReason = 'STOP'; }
        else if (currentLow <= inTrade.target) { exitPrice = inTrade.target; exitReason = 'TARGET'; }
      }
      if (!exitPrice && inTrade.barsHeld >= 10) { exitPrice = close; exitReason = 'TIME'; }

      if (exitPrice) {
        const pnlPoints = inTrade.direction === 'LONG' ? exitPrice - inTrade.entry : inTrade.entry - exitPrice;
        const pnlDollar = pnlPoints * 2;
        const pnlR = pnlPoints / Math.abs(inTrade.entry - inTrade.stop);
        trades.push({
          ...inTrade,
          exitPrice, exitReason, pnlPoints, pnlDollar, pnlR,
          mfe: inTrade.mfe, mae: inTrade.mae,
          outcome: pnlDollar > 0 ? 'WIN' : 'LOSS',
        });
        inTrade = null;
      }
      continue;
    }

    // ── Episode onset ──
    const prevNearVwap = Math.abs(prevDistVwap) <= 0.25 * atr;
    const curDeviated = Math.abs(distVwap) > 0.5 * atr;
    if (!prevNearVwap || !curDeviated) continue;
    if (!isRTH(bar.window_start)) continue;

    const nextBar = rows[i + 1];
    if (!nextBar) continue;

    const direction = distVwap > 0 ? 'LONG' : 'SHORT';
    const entryPrice = parseFloat(nextBar.open);
    const stopDist = 2.5 * atr;
    const targetDist = 2.0 * atr;
    const stop = direction === 'LONG' ? entryPrice - stopDist : entryPrice + stopDist;
    const target = direction === 'LONG' ? entryPrice + targetDist : entryPrice - targetDist;

    // ── Extract all 27 features at signal bar (bar i) ──
    const session = classifySession(bar.window_start);
    const adx = adx14(rows, i);
    const atrRatio = atr / (atr14(rows, Math.max(0, i - 20)) || atr); // current ATR vs 20-bar-ago ATR
    const rsi = rsi14(rows, i);
    const ema20 = ema(rows, i, 20);
    const ema50 = ema(rows, i, 50);
    const regime = classifyRegime(adx, atrRatio, ema20, ema50);
    const vwapDist = Math.abs(distVwap) / atr; // normalised VWAP distance in ATR units
    const vwapSlopeVal = vwapSlope(vwapMap, rows, i);
    const emaAlign = ema20 !== null && ema50 !== null ? (ema20 > ema50 ? 1 : -1) : 0;
    const trendStrength = adx !== null ? adx : 0;
    const volRatio = volumeRatio(rows, i);
    const minSinceOpen = minutesSinceSessionOpen(bar.window_start);
    const minUntilClose = minutesUntilSessionClose(bar.window_start);

    // Previous day bias (close vs open)
    const { pdHigh, pdLow } = prevDayRange(rows, i);
    const prevDayBias = pdHigh && pdLow ? (close > (pdHigh + pdLow) / 2 ? 'BULLISH' : 'BEARISH') : 'UNKNOWN';
    const distFromPdHigh = pdHigh ? Math.abs(close - pdHigh) / atr : null;
    const distFromPdLow = pdLow ? Math.abs(close - pdLow) / atr : null;

    // Overnight range
    const { ovHigh, ovLow } = overnightRange(rows, i);
    const overnightInventory = ovHigh && ovLow ? (close > (ovHigh + ovLow) / 2 ? 'LONG' : 'SHORT') : 'UNKNOWN';
    const distFromOvHigh = ovHigh ? Math.abs(close - ovHigh) / atr : null;
    const distFromOvLow = ovLow ? Math.abs(close - ovLow) / atr : null;

    // Opening range
    const { orHigh, orLow } = openingRange(rows, i);
    const orPosition = orHigh && orLow
      ? (close > orHigh ? 'ABOVE_OR' : close < orLow ? 'BELOW_OR' : 'INSIDE_OR')
      : 'UNKNOWN';
    const distFromOR = orHigh && orLow
      ? (close > orHigh ? (close - orHigh) / atr : close < orLow ? (orLow - close) / atr : 0)
      : null;

    // Body ratio (impulse bar quality)
    const barBody = Math.abs(parseFloat(bar.close) - parseFloat(bar.open));
    const barRange = parseFloat(bar.high) - parseFloat(bar.low);
    const bodyRatio = barRange > 0 ? barBody / barRange : 0;

    // Sequence / behaviour classification (simplified)
    const seqClass = bodyRatio > 0.7 ? 'IMPULSE_BAR' : bodyRatio > 0.4 ? 'NORMAL_BAR' : 'DOJI_WICK';
    const behavClass = regime.startsWith('TRENDING') ? 'TREND_CONTINUATION' : 'COUNTER_TREND';

    inTrade = {
      entryBar: i + 1,
      ticker: bar.ticker,
      windowStart: nextBar.window_start,
      sessionEndDate: bar.session_end_date_str,
      // 27 features
      f01_session: session,
      f02_regime: regime,
      f03_adx: adx !== null ? parseFloat(adx.toFixed(2)) : null,
      f04_atr: parseFloat(atr.toFixed(4)),
      f05_atr_ratio: parseFloat(atrRatio.toFixed(3)),
      f06_rsi: rsi !== null ? parseFloat(rsi.toFixed(2)) : null,
      f07_vwap_dist_atr: parseFloat(vwapDist.toFixed(3)),
      f08_vwap_slope: parseFloat(vwapSlopeVal.toFixed(4)),
      f09_ema_align: emaAlign,
      f10_trend_strength: parseFloat(trendStrength.toFixed(2)),
      f11_vol_ratio: parseFloat(volRatio.toFixed(3)),
      f12_vol_delta: null, // not available in OHLCV
      f13_min_since_open: minSinceOpen,
      f14_min_until_close: minUntilClose,
      f15_prev_day_bias: prevDayBias,
      f16_overnight_inventory: overnightInventory,
      f17_or_position: orPosition,
      f18_dist_from_or_atr: distFromOR !== null ? parseFloat(distFromOR.toFixed(3)) : null,
      f19_dist_from_pd_high_atr: distFromPdHigh !== null ? parseFloat(distFromPdHigh.toFixed(3)) : null,
      f20_dist_from_pd_low_atr: distFromPdLow !== null ? parseFloat(distFromPdLow.toFixed(3)) : null,
      f21_dist_from_ov_high_atr: distFromOvHigh !== null ? parseFloat(distFromOvHigh.toFixed(3)) : null,
      f22_dist_from_ov_low_atr: distFromOvLow !== null ? parseFloat(distFromOvLow.toFixed(3)) : null,
      f23_seq_class: seqClass,
      f24_behav_class: behavClass,
      f25_body_ratio: parseFloat(bodyRatio.toFixed(3)),
      f26_direction: direction,
      f27_ema20_vs_ema50: ema20 !== null && ema50 !== null ? parseFloat(((ema20 - ema50) / atr).toFixed(3)) : null,
      // Trade mechanics
      entry: entryPrice,
      stop, target, atr, vwap, distVwap,
      barsHeld: 0, mfe: 0, mae: 0,
    };
    i++;
  }

  // Close any open trade
  if (inTrade) {
    const lastBar = rows[rows.length - 1];
    const exitPrice = parseFloat(lastBar.close);
    const pnlPoints = inTrade.direction === 'LONG' ? exitPrice - inTrade.entry : inTrade.entry - exitPrice;
    trades.push({
      ...inTrade, exitPrice, exitReason: 'END_OF_DATA',
      pnlPoints, pnlDollar: pnlPoints * 2,
      pnlR: pnlPoints / Math.abs(inTrade.entry - inTrade.stop),
      mfe: inTrade.mfe, mae: inTrade.mae,
      outcome: pnlPoints * 2 > 0 ? 'WIN' : 'LOSS',
    });
  }

  console.log(`Total trades captured: ${trades.length}`);
  console.log(`Winners: ${trades.filter(t => t.outcome === 'WIN').length}`);
  console.log(`Losers: ${trades.filter(t => t.outcome === 'LOSS').length}\n`);

  // Save full trade forensics
  writeFileSync('/tmp/sprint109-trades.json', JSON.stringify(trades, null, 2));
  console.log('Full trade forensics saved to /tmp/sprint109-trades.json');

  await db.end();
  return trades;
}

main().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
