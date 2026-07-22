/**
 * DARWIN Observation Service — Sprint 123A.6 / Gate G6A
 *
 * Processes confirmed Databento bars and generates immutable observation records.
 * Runs as an isolated service — failures do not affect the live chart pipeline.
 *
 * Authority: DATABENTO_LEARNING_AUTHORITY (shadow mode)
 * processBar: TradingView only — this service never calls processBar
 * postBarAutomation: TradingView only — this service never calls postBarAutomation
 *
 * RESEARCH ONLY — NO LIVE EXECUTION
 */

import { randomUUID } from 'crypto';
import { execSync } from 'child_process';
import { isDarwinObservationPermitted, assertShadowSignalStorageOnly } from '../market-data/darwin-authority.js';
import type { InsertDarwinObservation } from '../../drizzle/schema.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const FEATURE_VERSION = '1.0';
const LABEL_VERSION = '1.0';
const OBSERVATION_SERVICE_VERSION = '1.0.0';

// Resource limits
const MAX_CONCURRENT_OBSERVATION_JOBS = 2;
const OBSERVATION_JOB_TIMEOUT_MS = 30_000;
const MAX_QUEUE_DEPTH = 500;

// EMA displacement thresholds
const EMA15_HIGH_DISPLACEMENT_PCT = 0.003;  // 0.3% displacement = notable
const EMA15_CHOP_CROSS_THRESHOLD = 3;        // 3+ crosses in 10 bars = chop

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ConfirmedBar {
  symbol: string;
  rawSymbol: string;
  instrumentId?: number;
  interval: '1m' | '5m';
  barTimestamp: number;
  revision: number;
  mappingVersion?: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
  tradeCount?: number;
}

export interface BarContext {
  // Prior bars (no future data)
  priorBars: ConfirmedBar[];
  // Session context
  session: 'RTH' | 'ETH' | 'OVERNIGHT' | 'PRE_MARKET' | 'UNKNOWN';
  sessionHigh?: number;
  sessionLow?: number;
  priorDayHigh?: number;
  priorDayLow?: number;
  priorDayClose?: number;
  minutesIntoSession?: number;
  // EMA values (computed from prior bars)
  ema15?: number;
  ema50?: number;
  ema200?: number;
  vwap?: number;
  // Regime
  volatilityRegime?: 'LOW' | 'NORMAL' | 'HIGH' | 'EXTREME';
  trendRegime?: 'TRENDING' | 'RANGING' | 'CHOPPY';
  adx?: number;
  atr?: number;
}

// ─── EMA computation ──────────────────────────────────────────────────────────

function computeEma(prices: number[], period: number): number | undefined {
  if (prices.length < period) return undefined;
  const k = 2 / (period + 1);
  let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < prices.length; i++) {
    ema = prices[i] * k + ema * (1 - k);
  }
  return ema;
}

function computeRsi(closes: number[], period = 14): number | undefined {
  if (closes.length < period + 1) return undefined;
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff;
    else losses -= diff;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function countEmaCrosses(closes: number[], emas: number[]): number {
  let crosses = 0;
  for (let i = 1; i < Math.min(closes.length, emas.length); i++) {
    const prevAbove = closes[i - 1] > emas[i - 1];
    const currAbove = closes[i] > emas[i];
    if (prevAbove !== currAbove) crosses++;
  }
  return crosses;
}

function computeAtr(bars: ConfirmedBar[], period = 14): number | undefined {
  if (bars.length < period + 1) return undefined;
  const trs: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const tr = Math.max(
      bars[i].high - bars[i].low,
      Math.abs(bars[i].high - bars[i - 1].close),
      Math.abs(bars[i].low - bars[i - 1].close)
    );
    trs.push(tr);
  }
  if (trs.length < period) return undefined;
  return trs.slice(-period).reduce((a, b) => a + b, 0) / period;
}

// ─── Observation builder ──────────────────────────────────────────────────────

/**
 * Builds an immutable observation record from a confirmed bar and its context.
 * No future data is included. Forward outcomes are computed separately.
 */
export function buildObservationRecord(
  bar: ConfirmedBar,
  context: BarContext,
  codeSha: string
): InsertDarwinObservation {
  const priorCloses = context.priorBars.map(b => b.close);
  const allCloses = [...priorCloses, bar.close];

  // EMA computations
  const ema15 = context.ema15 ?? computeEma(allCloses, 15);
  const ema50 = context.ema50 ?? computeEma(allCloses, 50);
  const ema200 = context.ema200 ?? computeEma(allCloses, 200);
  const atr = context.atr ?? computeAtr([...context.priorBars, bar]);
  const rsi14 = computeRsi(allCloses);

  // EMA cross counts (prior bars only — no future)
  const prior10Closes = priorCloses.slice(-10);
  const prior10Ema15 = prior10Closes.map((_, i) =>
    computeEma(priorCloses.slice(0, priorCloses.length - 10 + i + 1), 15) ?? bar.close
  );
  const prior5Closes = priorCloses.slice(-5);
  const prior5Ema15 = prior5Closes.map((_, i) =>
    computeEma(priorCloses.slice(0, priorCloses.length - 5 + i + 1), 15) ?? bar.close
  );
  const prior20Closes = priorCloses.slice(-20);
  const prior20Ema15 = prior20Closes.map((_, i) =>
    computeEma(priorCloses.slice(0, priorCloses.length - 20 + i + 1), 15) ?? bar.close
  );

  const ema15CrossCount5 = countEmaCrosses(prior5Closes, prior5Ema15);
  const ema15CrossCount10 = countEmaCrosses(prior10Closes, prior10Ema15);
  const ema15CrossCount20 = countEmaCrosses(prior20Closes, prior20Ema15);

  // Bar statistics
  const barRange = bar.high - bar.low;
  const bodySize = Math.abs(bar.close - bar.open);
  const bodySizePct = barRange > 0 ? bodySize / barRange : 0;
  const upperWick = bar.high - Math.max(bar.open, bar.close);
  const lowerWick = Math.min(bar.open, bar.close) - bar.low;
  const upperWickPct = barRange > 0 ? upperWick / barRange : 0;
  const lowerWickPct = barRange > 0 ? lowerWick / barRange : 0;
  const isBullish = bar.close > bar.open;

  // Prior bar context
  const priorBar = context.priorBars[context.priorBars.length - 1];
  const priorBodySize = priorBar ? Math.abs(priorBar.close - priorBar.open) : undefined;

  // Volume ratios
  const priorVolumes = context.priorBars.map(b => b.volume ?? 0).filter(v => v > 0);
  const avgVol5 = priorVolumes.slice(-5).length > 0
    ? priorVolumes.slice(-5).reduce((a, b) => a + b, 0) / priorVolumes.slice(-5).length
    : undefined;
  const avgVol20 = priorVolumes.slice(-20).length > 0
    ? priorVolumes.slice(-20).reduce((a, b) => a + b, 0) / priorVolumes.slice(-20).length
    : undefined;
  const volumeRatio5 = avgVol5 && bar.volume ? bar.volume / avgVol5 : undefined;
  const volumeRatio20 = avgVol20 && bar.volume ? bar.volume / avgVol20 : undefined;

  // Distance calculations
  const distanceFromEma15 = ema15 ? bar.close - ema15 : undefined;
  const distanceFromEma15Pct = ema15 && bar.close ? distanceFromEma15! / bar.close : undefined;
  const distanceFromEma50 = ema50 ? bar.close - ema50 : undefined;
  const distanceFromVwap = context.vwap ? bar.close - context.vwap : undefined;
  const distanceFromVwapPct = context.vwap && bar.close ? distanceFromVwap! / bar.close : undefined;

  // Momentum
  const momentum5 = priorCloses.length >= 5 ? bar.close - priorCloses[priorCloses.length - 5] : undefined;
  const momentum10 = priorCloses.length >= 10 ? bar.close - priorCloses[priorCloses.length - 10] : undefined;
  const priceChangePct = priorBar ? (bar.close - priorBar.close) / priorBar.close : undefined;

  // ATR percentage
  const atrPct = atr && bar.close ? atr / bar.close : undefined;

  // Session proximity
  const isNearSessionHigh = context.sessionHigh
    ? Math.abs(bar.high - context.sessionHigh) / context.sessionHigh < 0.001
    : undefined;
  const isNearSessionLow = context.sessionLow
    ? Math.abs(bar.low - context.sessionLow) / context.sessionLow < 0.001
    : undefined;
  const isNearPriorDayHigh = context.priorDayHigh
    ? Math.abs(bar.high - context.priorDayHigh) / context.priorDayHigh < 0.001
    : undefined;
  const isNearPriorDayLow = context.priorDayLow
    ? Math.abs(bar.low - context.priorDayLow) / context.priorDayLow < 0.001
    : undefined;

  // Inside/outside bar
  const isInsideBar = priorBar
    ? bar.high < priorBar.high && bar.low > priorBar.low
    : undefined;
  const isOutsideBar = priorBar
    ? bar.high > priorBar.high && bar.low < priorBar.low
    : undefined;

  // Opening range (first 30 min of RTH = 6 bars of 5m)
  const isOpeningRange = context.session === 'RTH' && (context.minutesIntoSession ?? 999) <= 30;

  // Gap from prior close
  const gapFromPriorClose = context.priorDayClose
    ? bar.open - context.priorDayClose
    : undefined;

  return {
    observationId: randomUUID(),
    symbol: bar.symbol,
    barTimestamp: bar.barTimestamp,
    codeSha: codeSha,
    featureVersion: FEATURE_VERSION,
    open: String(bar.open),
    high: String(bar.high),
    low: String(bar.low),
    close: String(bar.close),
    volume: bar.volume ?? 0,
    atr14: atr !== undefined ? String(atr) : undefined,
    ema15: ema15 !== undefined ? String(ema15) : undefined,
    ema50: ema50 !== undefined ? String(ema50) : undefined,
    distanceFromEma15Pct: distanceFromEma15Pct !== undefined ? String(distanceFromEma15Pct) : undefined,
    ema15CrossCount10: ema15CrossCount10 ?? undefined,
    volatilityRegime: context.volatilityRegime,
    trendRegime: context.trendRegime,
    sessionType: context.session,
    researchOnly: true,
    processBarCalled: false,
    postBarAutomationCalled: false,
  };
}

// ─── Resource guard ───────────────────────────────────────────────────────────

let activeObservationJobs = 0;
let queueDepth = 0;

/**
 * Returns true if a new observation job can be started.
 * Enforces bounded concurrency and queue depth limits.
 */
export function canStartObservationJob(): boolean {
  return (
    activeObservationJobs < MAX_CONCURRENT_OBSERVATION_JOBS &&
    queueDepth < MAX_QUEUE_DEPTH
  );
}

export function incrementObservationJobs(): void {
  activeObservationJobs++;
  queueDepth++;
}

export function decrementObservationJobs(): void {
  activeObservationJobs = Math.max(0, activeObservationJobs - 1);
  queueDepth = Math.max(0, queueDepth - 1);
}

export function getObservationServiceStatus(): {
  activeJobs: number;
  queueDepth: number;
  maxConcurrent: number;
  maxQueueDepth: number;
  healthy: boolean;
} {
  return {
    activeJobs: activeObservationJobs,
    queueDepth,
    maxConcurrent: MAX_CONCURRENT_OBSERVATION_JOBS,
    maxQueueDepth: MAX_QUEUE_DEPTH,
    healthy: activeObservationJobs < MAX_CONCURRENT_OBSERVATION_JOBS,
  };
}

// ─── Authority guard ──────────────────────────────────────────────────────────

/**
 * Validates that observation processing is permitted.
 * Throws if Databento data authority is not active.
 */
export function assertObservationPermitted(): void {
  if (!isDarwinObservationPermitted()) {
    throw new Error(
      '[DARWIN] Observation processing requires DATABENTO_CHART_AUTHORITY or ' +
      'DATABENTO_LEARNING_AUTHORITY. Current mode does not permit observation.'
    );
  }
}

export { FEATURE_VERSION, LABEL_VERSION, OBSERVATION_SERVICE_VERSION };
