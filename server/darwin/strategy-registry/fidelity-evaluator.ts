/**
 * Cross-Language Fidelity Evaluator (TypeScript side)
 * Sprint 123A.7 Gate G7 — Seventh Withhold
 *
 * Reads shared fidelity-fixtures.json and evaluates each fixture using the same
 * logic as the TypeScript strategy registry. Results are written to
 * fidelity-ts-results.json for comparison with the Python evaluator output.
 *
 * Usage:
 *   npx tsx fidelity-evaluator.ts [--fixtures path/to/fidelity-fixtures.json]
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================================
// CONSTANTS (must match strategy-registry/index.ts exactly)
// ============================================================

const COMMISSION_PER_CONTRACT = 0.62;
const TICK_VALUE = 0.50;
const TICK_SIZE = 0.25;
const MAX_RISK_PER_TRADE = 450.0;
const ADX_THRESHOLD = 25.0;
const ATR_VOLATILE_MULT = 1.2;

const STOP_MULT: Record<string, number> = { A1: 2.0, A3: 2.0, SB1: 1.5, 'ORB-1': 1.8, B1: 2.0 };
const TARGET_RR: Record<string, number> = { A1: 2.0, A3: 2.0, SB1: 2.5, 'ORB-1': 2.0, B1: 1.5 };
const ADE_SCORE_SB1 = 50.0;
const ADE_SCORE_ORB1 = 45.0;
const ADE_SCORE_B1 = 1.0;

// ============================================================
// TYPES
// ============================================================

interface Indicators {
  atr: number;
  atr_sma20: number;
  is_volatile: boolean;
  adx: number;
  di_plus: number;
  di_minus: number;
  is_trending: boolean;
  vwap: number;
  vwap_dev: number;
  ema9: number;
  ema9_slope: number;
  is_rth: boolean;
  is_am_open: boolean;
  is_am_mid: boolean;
}

interface OHLCV {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface EvalResult {
  fixture_id: string;
  eligible: boolean;
  strategy_id: string | null;
  direction: string | null;
  ade_score: number;
  entry_price: number | null;
  quantity: number;
  stop_price: number | null;
  target_price: number | null;
  stop_dist_pts: number | null;
  target_dist_pts: number | null;
  gross_pnl_pts: number | null;
  commission_dollars: number | null;
  net_pnl_dollars: number | null;
  evaluator: 'typescript';
  evaluated_at: string;
}

// ============================================================
// ADE EVALUATION
// ============================================================

function evaluateAde(
  ind: Indicators,
  ohlcv: OHLCV
): { strategyId: string | null; direction: string | null; adeScore: number } {
  let winModel: string | null = null;
  let winLong: boolean = false;
  let winScore = 0.0;

  // A1
  const a1Long = ind.is_trending && ind.is_rth && ind.di_plus > ind.di_minus;
  const a1Short = ind.is_trending && ind.is_rth && ind.di_minus > ind.di_plus;
  const a1Elig = a1Long || a1Short;
  const a1Score = ind.adx;
  if (a1Elig && a1Score > winScore) {
    winModel = 'A1';
    winLong = a1Long;
    winScore = a1Score;
  }

  // A3 (5% haircut — can never beat A1 when both eligible)
  const a3Long = ind.is_trending && ind.is_rth && ind.di_plus > ind.di_minus;
  const a3Short = ind.is_trending && ind.is_rth && ind.di_minus > ind.di_plus;
  const a3Elig = a3Long || a3Short;
  const a3Score = ind.adx * 0.95;
  if (a3Elig && a3Score > winScore) {
    winModel = 'A3';
    winLong = a3Long;
    winScore = a3Score;
  }

  // SB1
  const sb1Long = ind.is_trending && ind.is_am_mid && ind.ema9_slope > 0;
  const sb1Short = ind.is_trending && ind.is_am_mid && ind.ema9_slope < 0;
  const sb1Elig = sb1Long || sb1Short;
  if (sb1Elig && ADE_SCORE_SB1 > winScore) {
    winModel = 'SB1';
    winLong = sb1Long;
    winScore = ADE_SCORE_SB1;
  }

  // ORB-1
  const orb1Long = ind.is_volatile && ind.is_am_open && ind.is_rth && ohlcv.close > ohlcv.open;
  const orb1Short = ind.is_volatile && ind.is_am_open && ind.is_rth && ohlcv.close < ohlcv.open;
  const orb1Elig = orb1Long || orb1Short;
  if (orb1Elig && ADE_SCORE_ORB1 > winScore) {
    winModel = 'ORB-1';
    winLong = orb1Long;
    winScore = ADE_SCORE_ORB1;
  }

  // B1 (fallback)
  const b1Long = ind.is_rth && ohlcv.close > ind.vwap;
  const b1Short = ind.is_rth && ohlcv.close < ind.vwap;
  const b1Elig = b1Long || b1Short;
  if (b1Elig && ADE_SCORE_B1 > winScore) {
    winModel = 'B1';
    winLong = b1Long;
    winScore = ADE_SCORE_B1;
  }

  if (winModel === null) {
    return { strategyId: null, direction: null, adeScore: 0.0 };
  }

  return {
    strategyId: winModel,
    direction: winLong ? 'LONG' : 'SHORT',
    adeScore: Math.round(winScore * 10000) / 10000,
  };
}

function computeTrade(
  strategyId: string,
  direction: string,
  entryPrice: number,
  atr: number
): {
  quantity: number;
  stopPrice: number;
  targetPrice: number;
  stopDistPts: number;
  targetDistPts: number;
  grossPnlPts: number;
  commissionDollars: number;
  netPnlDollars: number;
} {
  const stopMult = STOP_MULT[strategyId];
  const targetRr = TARGET_RR[strategyId];
  const stopDist = atr * stopMult;
  const targetDist = stopDist * targetRr;

  const stopPrice = direction === 'LONG' ? entryPrice - stopDist : entryPrice + stopDist;
  const targetPrice = direction === 'LONG' ? entryPrice + targetDist : entryPrice - targetDist;

  const ticksRisk = stopDist / TICK_SIZE;
  const riskPerCon = ticksRisk * TICK_VALUE;
  const contracts = Math.max(1, Math.floor(MAX_RISK_PER_TRADE / riskPerCon));

  const grossPnl = targetDist * (1 / TICK_SIZE) * TICK_VALUE * contracts;
  const commission = COMMISSION_PER_CONTRACT * 2 * contracts;
  const netPnl = grossPnl - commission;

  return {
    quantity: contracts,
    stopPrice: Math.round(stopPrice * 100) / 100,
    targetPrice: Math.round(targetPrice * 100) / 100,
    stopDistPts: Math.round(stopDist * 10000) / 10000,
    targetDistPts: Math.round(targetDist * 10000) / 10000,
    grossPnlPts: Math.round(targetDist * 10000) / 10000,
    commissionDollars: Math.round(commission * 100) / 100,
    netPnlDollars: Math.round(netPnl * 100) / 100,
  };
}

function evaluateFixture(fixture: any): EvalResult {
  const ind: Indicators = fixture.precomputed_indicators;
  const ohlcv: OHLCV = fixture.ohlcv;
  const now = new Date().toISOString();

  const { strategyId, direction, adeScore } = evaluateAde(ind, ohlcv);

  if (strategyId === null) {
    return {
      fixture_id: fixture.fixture_id,
      eligible: false,
      strategy_id: null,
      direction: null,
      ade_score: 0.0,
      entry_price: null,
      quantity: 0,
      stop_price: null,
      target_price: null,
      stop_dist_pts: null,
      target_dist_pts: null,
      gross_pnl_pts: null,
      commission_dollars: null,
      net_pnl_dollars: null,
      evaluator: 'typescript',
      evaluated_at: now,
    };
  }

  const entryPrice = ohlcv.close;
  const trade = computeTrade(strategyId, direction!, entryPrice, ind.atr);

  return {
    fixture_id: fixture.fixture_id,
    eligible: true,
    strategy_id: strategyId,
    direction: direction,
    ade_score: adeScore,
    entry_price: entryPrice,
    quantity: trade.quantity,
    stop_price: trade.stopPrice,
    target_price: trade.targetPrice,
    stop_dist_pts: trade.stopDistPts,
    target_dist_pts: trade.targetDistPts,
    gross_pnl_pts: trade.grossPnlPts,
    commission_dollars: trade.commissionDollars,
    net_pnl_dollars: trade.netPnlDollars,
    evaluator: 'typescript',
    evaluated_at: now,
  };
}

function compareWithExpected(
  result: EvalResult,
  fixture: any,
  tolerances: any
): { fixture_id: string; all_pass: boolean; fields: any[] } {
  const expected = fixture.expected;
  const priceTol = tolerances.price_pts ?? 0.0;
  const pnlTol = tolerances.pnl_dollars ?? 0.01;
  const fields: any[] = [];
  let allPass = true;

  function check(field: string, actual: any, exp: any, tolerance = 0.0) {
    let pass: boolean;
    if (exp === null && actual === null) {
      pass = true;
    } else if (exp === null || actual === null) {
      pass = false;
    } else if (typeof exp === 'number' || typeof actual === 'number') {
      pass = Math.abs(Number(actual) - Number(exp)) <= tolerance;
    } else {
      pass = actual === exp;
    }
    if (!pass) allPass = false;
    fields.push({ field, expected: exp, actual, tolerance, pass });
  }

  check('eligible', result.eligible, expected.eligible);
  check('strategy_id', result.strategy_id, (fixture as any).strategy_expected);
  check('direction', result.direction, expected.direction);
  check('ade_score', result.ade_score, expected.ade_score, 0.001);
  check('entry_price', result.entry_price, expected.entry_price, priceTol);
  check('quantity', result.quantity, expected.quantity);
  check('stop_price', result.stop_price, expected.stop_price, priceTol);
  check('target_price', result.target_price, expected.target_price, priceTol);
  check('stop_dist_pts', result.stop_dist_pts, expected.stop_dist_pts, priceTol);
  check('target_dist_pts', result.target_dist_pts, expected.target_dist_pts, priceTol);
  check('commission_dollars', result.commission_dollars, expected.commission_dollars, pnlTol);
  check('net_pnl_dollars', result.net_pnl_dollars, expected.net_pnl_dollars, pnlTol);

  return { fixture_id: result.fixture_id, all_pass: allPass, fields };
}

// ============================================================
// MAIN
// ============================================================

function main() {
  const args = process.argv.slice(2);
  const fixturesIdx = args.indexOf('--fixtures');
  const fixturesPath =
    fixturesIdx >= 0
      ? args[fixturesIdx + 1]
      : path.join(__dirname, 'fidelity-fixtures.json');
  const outputIdx = args.indexOf('--output');
  const outputPath =
    outputIdx >= 0
      ? args[outputIdx + 1]
      : path.join(__dirname, 'fidelity-ts-results.json');

  const fixturesDoc = JSON.parse(fs.readFileSync(fixturesPath, 'utf-8'));
  const tolerances = fixturesDoc.tolerances ?? {};
  const fixtures = fixturesDoc.fixtures as any[];

  const results: EvalResult[] = [];
  const comparisons: any[] = [];
  let allPass = true;

  for (const fixture of fixtures) {
    const result = evaluateFixture(fixture);
    const comparison = compareWithExpected(result, fixture, tolerances);
    results.push(result);
    comparisons.push(comparison);
    if (!comparison.all_pass) allPass = false;
  }

  const output = {
    evaluator: 'typescript',
    fixture_version: fixturesDoc.fixture_version,
    evaluated_at: new Date().toISOString(),
    total_fixtures: fixtures.length,
    all_pass: allPass,
    results,
    comparisons,
  };

  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

  const passed = comparisons.filter(c => c.all_pass).length;
  const failed = comparisons.length - passed;
  console.log(`TypeScript fidelity evaluator: ${passed}/${comparisons.length} fixtures PASS`);
  if (failed > 0) {
    console.log('FAILURES:');
    for (const c of comparisons) {
      if (!c.all_pass) {
        console.log(`  ${c.fixture_id}:`);
        for (const f of c.fields) {
          if (!f.pass) {
            console.log(`    ${f.field}: expected=${f.expected}, actual=${f.actual}`);
          }
        }
      }
    }
  }
  console.log(`Results written to: ${outputPath}`);
  process.exit(allPass ? 0 : 1);
}

main();
