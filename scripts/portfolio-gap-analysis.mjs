/**
 * Sprint 105 — Portfolio Gap Analysis
 * Analyses live atlas_memory observations for behavioural edges
 * covering portfolio gaps: RANGE, TRANSITION, VOLATILE, Lunch, Mean Reversion, VWAP, Liquidity
 */
import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// ── 1. Load all live bars ──────────────────────────────────────────────────
const [bars] = await conn.execute(`
  SELECT bar_time, bar_time_et, open, high, low, close, volume,
         session, regime_classification as regime, adx, atr, vwap, ema9, ema21, rsi as rsi14,
         prev_day_high as daily_high, prev_day_low as daily_low, prev_day_close as prev_close,
         overnight_gap as gap_points, (overnight_gap / NULLIF(prev_day_close, 0)) as gap_pct,
         a1_eligible, a3_eligible, b1_eligible, sb1_eligible, volatility_state, compression_state
  FROM atlas_memory
  WHERE bar_time > 1000000000000
  ORDER BY bar_time ASC
`);

console.log(`Loaded ${bars.length} live bars for gap analysis`);

// ── 2. Regime distribution ─────────────────────────────────────────────────
const regimeCounts = {};
const sessionCounts = {};
for (const b of bars) {
  regimeCounts[b.regime || 'NULL'] = (regimeCounts[b.regime || 'NULL'] || 0) + 1;
  sessionCounts[b.session || 'NULL'] = (sessionCounts[b.session || 'NULL'] || 0) + 1;
}
console.log('\n=== REGIME DISTRIBUTION ===');
for (const [r, c] of Object.entries(regimeCounts).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${r}: ${c} bars (${(c/bars.length*100).toFixed(1)}%)`);
}
console.log('\n=== SESSION DISTRIBUTION ===');
for (const [s, c] of Object.entries(sessionCounts).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${s}: ${c} bars (${(c/bars.length*100).toFixed(1)}%)`);
}

// ── 3. RANGE regime analysis ───────────────────────────────────────────────
const rangeBars = bars.filter(b => b.regime === 'RANGE' || b.regime === 'CHOPPY' || b.regime === 'COMPRESSED');
console.log(`\n=== RANGE/CHOPPY/COMPRESSED ANALYSIS (${rangeBars.length} bars) ===`);

// Mean reversion: price distance from VWAP
const vwapDeviation = rangeBars
  .filter(b => b.vwap && b.close && b.atr)
  .map(b => {
    const dev = Math.abs(parseFloat(b.close) - parseFloat(b.vwap)) / parseFloat(b.atr);
    const nextBar = bars[bars.indexOf(b) + 1];
    const reverted = nextBar && parseFloat(b.vwap) > 0 &&
      ((parseFloat(b.close) > parseFloat(b.vwap) && parseFloat(nextBar.close) < parseFloat(b.vwap)) ||
       (parseFloat(b.close) < parseFloat(b.vwap) && parseFloat(nextBar.close) > parseFloat(b.vwap)));
    return { dev, reverted };
  })
  .filter(x => x.dev > 0);

const highDevBars = vwapDeviation.filter(x => x.dev > 1.5);
const highDevReverted = highDevBars.filter(x => x.reverted);
console.log(`  VWAP deviation >1.5 ATR: ${highDevBars.length} bars`);
console.log(`  Reverted next bar: ${highDevReverted.length} (${highDevBars.length > 0 ? (highDevReverted.length/highDevBars.length*100).toFixed(1) : 'N/A'}%)`);

// ADX in range regime
const rangeAdx = rangeBars.filter(b => b.adx).map(b => parseFloat(b.adx));
const avgRangeAdx = rangeAdx.length > 0 ? rangeAdx.reduce((a,b) => a+b, 0) / rangeAdx.length : 0;
console.log(`  Avg ADX in RANGE/CHOPPY: ${avgRangeAdx.toFixed(1)}`);

// ── 4. TRANSITION regime analysis ─────────────────────────────────────────
const transitionBars = bars.filter(b => b.regime === 'TRANSITION' || b.regime === 'TRANSITIONAL');
console.log(`\n=== TRANSITION ANALYSIS (${transitionBars.length} bars) ===`);

// Momentum continuation after TRANSITION
let transitionContinuation = 0;
let transitionTotal = 0;
for (let i = 0; i < transitionBars.length; i++) {
  const b = transitionBars[i];
  const idx = bars.indexOf(b);
  const nextBar = bars[idx + 1];
  if (!nextBar) continue;
  transitionTotal++;
  const bullish = parseFloat(b.close) > parseFloat(b.open);
  const continued = bullish
    ? parseFloat(nextBar.close) > parseFloat(b.close)
    : parseFloat(nextBar.close) < parseFloat(b.close);
  if (continued) transitionContinuation++;
}
console.log(`  Momentum continuation rate: ${transitionTotal > 0 ? (transitionContinuation/transitionTotal*100).toFixed(1) : 'N/A'}% (${transitionContinuation}/${transitionTotal})`);

// EMA cross in TRANSITION
const emaCrossInTransition = transitionBars.filter(b => {
  if (!b.ema9 || !b.ema21) return false;
  const idx = bars.indexOf(b);
  const prev = bars[idx - 1];
  if (!prev || !prev.ema9 || !prev.ema21) return false;
  const crossUp = parseFloat(prev.ema9) < parseFloat(prev.ema21) && parseFloat(b.ema9) > parseFloat(b.ema21);
  const crossDown = parseFloat(prev.ema9) > parseFloat(prev.ema21) && parseFloat(b.ema9) < parseFloat(b.ema21);
  return crossUp || crossDown;
});
console.log(`  EMA 9/21 crosses in TRANSITION: ${emaCrossInTransition.length}`);

// ── 5. VOLATILE regime analysis ────────────────────────────────────────────
const volatileBars = bars.filter(b => b.regime === 'VOLATILE');
console.log(`\n=== VOLATILE ANALYSIS (${volatileBars.length} bars) ===`);

// ATR expansion in VOLATILE
const volatileAtrs = volatileBars.filter(b => b.atr).map(b => parseFloat(b.atr));
const allAtrs = bars.filter(b => b.atr).map(b => parseFloat(b.atr));
const avgAtr = allAtrs.length > 0 ? allAtrs.reduce((a,b) => a+b, 0) / allAtrs.length : 0;
const avgVolatileAtr = volatileAtrs.length > 0 ? volatileAtrs.reduce((a,b) => a+b, 0) / volatileAtrs.length : 0;
console.log(`  Avg ATR overall: ${avgAtr.toFixed(2)}, in VOLATILE: ${avgVolatileAtr.toFixed(2)} (${avgAtr > 0 ? (avgVolatileAtr/avgAtr).toFixed(2) : 'N/A'}x)`);

// ORB-1 coverage check: how many VOLATILE AM_OPEN bars exist
const orbCandidateBars = bars.filter(b =>
  (b.regime === 'VOLATILE') &&
  (b.session === 'AM_OPEN' || b.session === 'AM' || b.session === 'PRE')
);
console.log(`  VOLATILE AM_OPEN bars (ORB-1 territory): ${orbCandidateBars.length}`);

// ── 6. Lunch session analysis (11:30–13:00 ET) ────────────────────────────
const lunchBars = bars.filter(b => b.session === 'LUNCH' || b.session === 'MID' || b.session === 'AM_MID');
console.log(`\n=== LUNCH/MID SESSION ANALYSIS (${lunchBars.length} bars) ===`);

// Lunch regime breakdown
const lunchRegimes = {};
for (const b of lunchBars) {
  lunchRegimes[b.regime || 'NULL'] = (lunchRegimes[b.regime || 'NULL'] || 0) + 1;
}
console.log('  Lunch regime breakdown:', JSON.stringify(lunchRegimes));

// Lunch mean reversion
const lunchVwapDev = lunchBars
  .filter(b => b.vwap && b.close && b.atr)
  .map(b => Math.abs(parseFloat(b.close) - parseFloat(b.vwap)) / parseFloat(b.atr));
const avgLunchDev = lunchVwapDev.length > 0 ? lunchVwapDev.reduce((a,b) => a+b, 0) / lunchVwapDev.length : 0;
console.log(`  Avg VWAP deviation in Lunch: ${avgLunchDev.toFixed(2)} ATR`);

// ── 7. VWAP behaviour analysis ─────────────────────────────────────────────
console.log('\n=== VWAP BEHAVIOUR ANALYSIS ===');
let vwapCrossCount = 0;
let vwapCrossContCount = 0;
let vwapBounceCount = 0;
let vwapBounceContCount = 0;

for (let i = 1; i < bars.length; i++) {
  const prev = bars[i-1];
  const curr = bars[i];
  const next = bars[i+1];
  if (!prev.vwap || !curr.vwap || !next) continue;

  const prevClose = parseFloat(prev.close);
  const currClose = parseFloat(curr.close);
  const nextClose = parseFloat(next.close);
  const vwap = parseFloat(curr.vwap);

  // VWAP cross (price crosses VWAP)
  if ((prevClose < parseFloat(prev.vwap) && currClose > vwap) ||
      (prevClose > parseFloat(prev.vwap) && currClose < vwap)) {
    vwapCrossCount++;
    const bullCross = currClose > vwap;
    if ((bullCross && nextClose > currClose) || (!bullCross && nextClose < currClose)) {
      vwapCrossContCount++;
    }
  }

  // VWAP bounce (touches VWAP within 0.5 ATR, then continues away)
  if (curr.atr) {
    const atr = parseFloat(curr.atr);
    const distToVwap = Math.abs(currClose - vwap);
    if (distToVwap < atr * 0.5) {
      vwapBounceCount++;
      const aboveVwap = currClose > vwap;
      if ((aboveVwap && nextClose > currClose) || (!aboveVwap && nextClose < currClose)) {
        vwapBounceContCount++;
      }
    }
  }
}
console.log(`  VWAP crosses: ${vwapCrossCount}, continuation: ${vwapCrossCount > 0 ? (vwapCrossContCount/vwapCrossCount*100).toFixed(1) : 'N/A'}%`);
console.log(`  VWAP bounces (<0.5 ATR): ${vwapBounceCount}, continuation: ${vwapBounceCount > 0 ? (vwapBounceContCount/vwapBounceCount*100).toFixed(1) : 'N/A'}%`);

// ── 8. Gap fill analysis ───────────────────────────────────────────────────
console.log('\n=== GAP FILL ANALYSIS ===');
const gapBars = bars.filter(b => b.gap_pct && Math.abs(parseFloat(b.gap_pct)) > 0.001);
console.log(`  Bars with gap > 0.1%: ${gapBars.length}`);

const smallGaps = gapBars.filter(b => Math.abs(parseFloat(b.gap_pct)) < 0.003);
const medGaps = gapBars.filter(b => Math.abs(parseFloat(b.gap_pct)) >= 0.003 && Math.abs(parseFloat(b.gap_pct)) < 0.005);
const largeGaps = gapBars.filter(b => Math.abs(parseFloat(b.gap_pct)) >= 0.005);
console.log(`  Small gaps (0.1-0.3%): ${smallGaps.length}`);
console.log(`  Medium gaps (0.3-0.5%): ${medGaps.length}`);
console.log(`  Large gaps (>0.5%): ${largeGaps.length}`);

// ── 9. Liquidity sweep detection ──────────────────────────────────────────
console.log('\n=== LIQUIDITY SWEEP ANALYSIS ===');
let sweepCount = 0;
let sweepReverseCount = 0;
for (let i = 1; i < bars.length - 1; i++) {
  const prev = bars[i-1];
  const curr = bars[i];
  const next = bars[i+1];
  if (!prev.high || !curr.high || !curr.low) continue;

  const prevHigh = parseFloat(prev.high);
  const prevLow = parseFloat(prev.low);
  const currHigh = parseFloat(curr.high);
  const currLow = parseFloat(curr.low);
  const currClose = parseFloat(curr.close);
  const nextClose = parseFloat(next.close);

  // Sweep above previous high then close below it
  if (currHigh > prevHigh && currClose < prevHigh) {
    sweepCount++;
    if (nextClose < currClose) sweepReverseCount++; // continued lower
  }
  // Sweep below previous low then close above it
  if (currLow < prevLow && currClose > prevLow) {
    sweepCount++;
    if (nextClose > currClose) sweepReverseCount++; // continued higher
  }
}
console.log(`  Liquidity sweeps detected: ${sweepCount}`);
console.log(`  Reversal continuation: ${sweepCount > 0 ? (sweepReverseCount/sweepCount*100).toFixed(1) : 'N/A'}%`);

// ── 10. Portfolio coverage summary ────────────────────────────────────────
console.log('\n=== PORTFOLIO COVERAGE SUMMARY ===');
const totalBars = bars.length;
const trendingBars = bars.filter(b => b.regime === 'TRENDING_BULL' || b.regime === 'TRENDING_BEAR' || b.regime === 'TRENDING').length;
const choppyBars = bars.filter(b => b.regime === 'CHOPPY' || b.regime === 'RANGE' || b.regime === 'COMPRESSED').length;
const transitionCount = transitionBars.length;
const volatileCount = volatileBars.length;
const lunchCount = lunchBars.length;

console.log(`  TRENDING (A1/A3/B1/SB1 coverage): ${trendingBars} bars (${(trendingBars/totalBars*100).toFixed(1)}%)`);
console.log(`  CHOPPY/RANGE (NO coverage): ${choppyBars} bars (${(choppyBars/totalBars*100).toFixed(1)}%)`);
console.log(`  TRANSITION (NO coverage): ${transitionCount} bars (${(transitionCount/totalBars*100).toFixed(1)}%)`);
console.log(`  VOLATILE (ORB-1 coverage): ${volatileCount} bars (${(volatileCount/totalBars*100).toFixed(1)}%)`);
console.log(`  LUNCH/MID (NO coverage): ${lunchCount} bars (${(lunchCount/totalBars*100).toFixed(1)}%)`);

const uncoveredBars = choppyBars + transitionCount + lunchCount;
console.log(`\n  TOTAL UNCOVERED BARS: ${uncoveredBars} (${(uncoveredBars/totalBars*100).toFixed(1)}%)`);
console.log(`  TOTAL COVERED BARS: ${totalBars - uncoveredBars} (${((totalBars - uncoveredBars)/totalBars*100).toFixed(1)}%)`);

await conn.end();
console.log('\nGap analysis complete.');
