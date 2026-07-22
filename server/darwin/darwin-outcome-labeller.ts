/**
 * DARWIN Outcome Labeller — Sprint 123A.6 / Gate G6A
 *
 * Computes forward outcome labels for observations after the horizon has elapsed.
 * Labels are always created AFTER the horizon — never with look-ahead.
 *
 * RESEARCH ONLY — NO LIVE EXECUTION
 */

import { randomUUID } from 'crypto';
import type { InsertDarwinOutcomeLabel } from '../../drizzle/schema.js';

// ─── Constants ────────────────────────────────────────────────────────────────

export const LABEL_HORIZONS_MINUTES = [1, 3, 5, 10, 15, 30, 60] as const;
export type LabelHorizon = typeof LABEL_HORIZONS_MINUTES[number];

const LABEL_VERSION = '1.0';

// Simulated R-multiple thresholds (in ATR multiples)
const R1_ATR_MULTIPLE = 1.0;
const R2_ATR_MULTIPLE = 2.0;
const R3_ATR_MULTIPLE = 3.0;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LabelInput {
  observationId: string;
  entryPrice: number;
  entryTimestamp: number;
  atr: number;
  horizonMinutes: LabelHorizon;
  // Future bars (only available after horizon has elapsed)
  futureBars: Array<{
    timestamp: number;
    open: number;
    high: number;
    low: number;
    close: number;
  }>;
}

// ─── Label computation ────────────────────────────────────────────────────────

/**
 * Computes a forward outcome label for a single observation and horizon.
 * futureBars must only contain bars AFTER the observation bar.
 * This function must never be called with bars from the same timestamp as the observation.
 */
export function computeOutcomeLabel(input: LabelInput): InsertDarwinOutcomeLabel {
  const { observationId, entryPrice, entryTimestamp, atr, horizonMinutes, futureBars } = input;

  if (futureBars.length === 0) {
    throw new Error(
      `[DARWIN labeller] No future bars for observation ${observationId} ` +
      `at horizon ${horizonMinutes}m. Cannot compute label.`
    );
  }

  // Verify all future bars are strictly after the entry timestamp
  for (const bar of futureBars) {
    if (bar.timestamp <= entryTimestamp) {
      throw new Error(
        `[DARWIN labeller] Look-ahead violation: future bar timestamp ${bar.timestamp} ` +
        `<= entry timestamp ${entryTimestamp} for observation ${observationId}. ` +
        'This is a data integrity error.'
      );
    }
  }

  // Horizon close price (last bar in the horizon window)
  const horizonBar = futureBars[futureBars.length - 1];
  const horizonClose = horizonBar.close;

  // Net price change
  const netPriceChange = horizonClose - entryPrice;
  const netPriceChangePct = netPriceChange / entryPrice;

  // Direction
  const direction = netPriceChange > 0 ? 'LONG' : netPriceChange < 0 ? 'SHORT' : 'FLAT';

  // MFE / MAE
  let maxFavourableExcursion = 0;
  let maxAdverseExcursion = 0;
  for (const bar of futureBars) {
    const longMfe = bar.high - entryPrice;
    const longMae = entryPrice - bar.low;
    const shortMfe = entryPrice - bar.low;
    const shortMae = bar.high - entryPrice;
    maxFavourableExcursion = Math.max(maxFavourableExcursion, Math.max(longMfe, shortMfe));
    maxAdverseExcursion = Math.max(maxAdverseExcursion, Math.max(longMae, shortMae));
  }

  // Simulated long/short outcomes (entry at open of first future bar)
  const simulatedEntry = futureBars[0].open;
  const simulatedLongOutcome = horizonClose - simulatedEntry;
  const simulatedShortOutcome = simulatedEntry - horizonClose;

  // R-multiple targets (based on ATR)
  const r1 = atr * R1_ATR_MULTIPLE;
  const r2 = atr * R2_ATR_MULTIPLE;
  const r3 = atr * R3_ATR_MULTIPLE;

  let longReached1R = false, longReached2R = false, longReached3R = false;
  let shortReached1R = false, shortReached2R = false, shortReached3R = false;
  let timeToLongTarget: number | undefined;
  let timeToShortTarget: number | undefined;
  let timeToAdverseThreshold: number | undefined;

  for (let i = 0; i < futureBars.length; i++) {
    const bar = futureBars[i];
    const minutesElapsed = (i + 1);

    if (!longReached1R && bar.high - entryPrice >= r1) {
      longReached1R = true;
      timeToLongTarget = minutesElapsed;
    }
    if (!longReached2R && bar.high - entryPrice >= r2) longReached2R = true;
    if (!longReached3R && bar.high - entryPrice >= r3) longReached3R = true;

    if (!shortReached1R && entryPrice - bar.low >= r1) {
      timeToShortTarget = minutesElapsed;
    }
    if (!shortReached2R && entryPrice - bar.low >= r2) shortReached2R = true;
    if (!shortReached3R && entryPrice - bar.low >= r3) shortReached3R = true;

    // Adverse threshold: 1R against the dominant direction
    if (!timeToAdverseThreshold) {
      const adverseLong = entryPrice - bar.low >= r1;
      const adverseShort = bar.high - entryPrice >= r1;
      if ((direction === 'LONG' && adverseLong) || (direction === 'SHORT' && adverseShort)) {
        timeToAdverseThreshold = minutesElapsed;
      }
    }
  }

  // Volatility-adjusted return (net change / ATR)
  const volatilityAdjustedReturn = atr > 0 ? netPriceChange / atr : 0;

  const horizonCompleteAt = horizonBar.timestamp;

  return {
    observationId,
    horizonMinutes,
    netPriceChange: String(netPriceChange),
    maxFavourableExcursion: String(maxFavourableExcursion),
    maxAdverseExcursion: String(maxAdverseExcursion),
    labelVersion: LABEL_VERSION,
    horizonCompleteAt,
  };
}

/**
 * Computes outcome labels for all configured horizons.
 * Returns only labels where sufficient future bars exist.
 */
export function computeAllOutcomeLabels(
  observationId: string,
  entryPrice: number,
  entryTimestamp: number,
  atr: number,
  allFutureBars: Array<{ timestamp: number; open: number; high: number; low: number; close: number }>
): InsertDarwinOutcomeLabel[] {
  const labels: InsertDarwinOutcomeLabel[] = [];

  for (const horizon of LABEL_HORIZONS_MINUTES) {
    // Get bars within the horizon window
    const horizonEnd = entryTimestamp + horizon * 60 * 1000;
    const horizonBars = allFutureBars.filter(
      b => b.timestamp > entryTimestamp && b.timestamp <= horizonEnd
    );

    if (horizonBars.length === 0) continue;

    try {
      const label = computeOutcomeLabel({
        observationId,
        entryPrice,
        entryTimestamp,
        atr,
        horizonMinutes: horizon,
        futureBars: horizonBars,
      });
      labels.push(label);
    } catch (err) {
      console.error(`[DARWIN labeller] Failed to compute label for horizon ${horizon}m:`, err);
    }
  }

  return labels;
}
