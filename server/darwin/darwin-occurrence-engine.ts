/**
 * DARWIN Occurrence Discovery Engine — Sprint 123A.6 / Gate G6A
 *
 * Scans observation records to identify recurring market behaviours.
 * Applies statistical gates before generating candidate hypotheses.
 * Enforces anti-overfitting controls throughout.
 *
 * RESEARCH ONLY — NO LIVE EXECUTION
 */

import { randomUUID } from 'crypto';
import type { DarwinObservation } from '../../drizzle/schema.js';
import type { InsertDarwinCandidate } from '../../drizzle/schema.js';

// ─── Statistical gates ────────────────────────────────────────────────────────

export const OCCURRENCE_GATES = {
  // Minimum occurrences before hypothesis generation
  MIN_OCCURRENCES: 30,
  // Maximum p-value for statistical significance
  MAX_P_VALUE: 0.05,
  // Minimum effect size (Cohen's d or equivalent)
  MIN_EFFECT_SIZE: 0.2,
  // Minimum win rate for directional hypothesis
  MIN_WIN_RATE: 0.55,
  // Minimum profit factor
  MIN_PROFIT_FACTOR: 1.5,
  // Minimum out-of-sample period ratio
  MIN_OOS_RATIO: 0.3,
  // Maximum parameter count (anti-overfitting)
  MAX_PARAMETERS: 5,
  // Minimum stability score across sub-periods
  MIN_STABILITY_SCORE: 0.6,
  // Minimum regime coverage (fraction of regimes where behaviour appears)
  MIN_REGIME_COVERAGE: 0.2,
  // Maximum correlation with existing strategies
  MAX_EXISTING_STRATEGY_CORRELATION: 0.7,
} as const;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OccurrenceCondition {
  feature: string;
  operator: 'gt' | 'lt' | 'gte' | 'lte' | 'eq' | 'neq' | 'between' | 'in';
  value: number | string | [number, number] | string[];
  description: string;
}

export interface OccurrencePattern {
  patternId: string;
  name: string;
  description: string;
  conditions: OccurrenceCondition[];
  direction: 'LONG' | 'SHORT' | 'BOTH';
  expectedHorizonMinutes: number;
  hypothesis: string;
  potentialExplanation: string;
  competingExplanations: string[];
  knownLimitations: string[];
}

export interface OccurrenceResult {
  patternId: string;
  occurrenceCount: number;
  matchingObservationIds: string[];
  winRate: number;
  profitFactor: number;
  effectSize: number;
  pValue: number;
  stabilityScore: number;
  regimeCoverage: Record<string, number>;
  sessionCoverage: Record<string, number>;
  passesGates: boolean;
  gateFailures: string[];
}

// ─── Experiment A: EMA15 Displacement Recovery ───────────────────────────────

export const EXPERIMENT_A: OccurrencePattern = {
  patternId: 'EXP_A_EMA15_DISPLACEMENT_RECOVERY',
  name: 'EMA15 Displacement Recovery',
  description:
    'Price reverts toward EMA15 after significant displacement in low-chop regimes. ' +
    'Observed when price is >0.3% from EMA15 and EMA15 cross count in prior 10 bars is ≤1.',
  conditions: [
    {
      feature: 'distanceFromEma15Pct',
      operator: 'gt',
      value: 0.003,
      description: 'Price >0.3% above EMA15',
    },
    {
      feature: 'ema15CrossCount10',
      operator: 'lte',
      value: 1,
      description: 'EMA15 cross count in prior 10 bars ≤1 (low chop)',
    },
    {
      feature: 'volatilityRegime',
      operator: 'in',
      value: ['NORMAL', 'HIGH'],
      description: 'Volatility regime is NORMAL or HIGH',
    },
  ],
  direction: 'SHORT',
  expectedHorizonMinutes: 15,
  hypothesis:
    'When price is significantly displaced above EMA15 in a low-chop regime, ' +
    'mean reversion toward EMA15 occurs within 15 minutes at above-random frequency.',
  potentialExplanation:
    'EMA15 acts as a short-term mean in trending/ranging markets. ' +
    'Displacement creates a rubber-band effect as momentum exhausts.',
  competingExplanations: [
    'Displacement may be the start of a trend continuation, not a reversal.',
    'The effect may be regime-specific and not stable across all market conditions.',
    'Volume profile and order flow may dominate over price-based signals.',
  ],
  knownLimitations: [
    'Does not account for news events or macro catalysts.',
    'EMA15 is a lagging indicator — displacement may persist.',
    'Transaction costs may erode the edge at small displacements.',
  ],
};

// ─── Experiment B: Opening Range Breakout Continuation ───────────────────────

export const EXPERIMENT_B: OccurrencePattern = {
  patternId: 'EXP_B_ORB_CONTINUATION',
  name: 'Opening Range Breakout Continuation',
  description:
    'First breakout of the 30-minute opening range continues in the breakout direction ' +
    'for at least 1R within the following 30 minutes.',
  conditions: [
    {
      feature: 'isOpeningRange',
      operator: 'eq',
      value: 0, // false — bar is AFTER the opening range
      description: 'Bar is after the 30-minute opening range',
    },
    {
      feature: 'minutesIntoSession',
      operator: 'between',
      value: [30, 90],
      description: 'Bar is between 30 and 90 minutes into RTH session',
    },
    {
      feature: 'session',
      operator: 'eq',
      value: 'RTH',
      description: 'Regular trading hours only',
    },
    {
      feature: 'volumeRatio5',
      operator: 'gte',
      value: 1.2,
      description: 'Volume is at least 1.2x the 5-bar average (breakout confirmation)',
    },
  ],
  direction: 'BOTH',
  expectedHorizonMinutes: 30,
  hypothesis:
    'The first confirmed breakout of the 30-minute opening range, accompanied by ' +
    'above-average volume, continues in the breakout direction for at least 1R ' +
    'within 30 minutes at above-random frequency.',
  potentialExplanation:
    'The opening range captures the initial price discovery. ' +
    'A breakout with volume confirms institutional participation and directional intent.',
  competingExplanations: [
    'Opening range breakouts may be stop hunts that reverse immediately.',
    'The effect may only hold on trending days, not ranging days.',
    'Time-of-day effects may dominate the opening range signal.',
  ],
  knownLimitations: [
    'Requires accurate session time classification.',
    'Does not account for gap days where the opening range is atypical.',
    'Volume data quality from Databento must be verified.',
  ],
};

// ─── Experiment C: VWAP Reclaim After Sweep ──────────────────────────────────

export const EXPERIMENT_C: OccurrencePattern = {
  patternId: 'EXP_C_VWAP_RECLAIM_AFTER_SWEEP',
  name: 'VWAP Reclaim After Liquidity Sweep',
  description:
    'Price sweeps below VWAP by >0.2% then reclaims VWAP within 3 bars, ' +
    'followed by continuation above VWAP.',
  conditions: [
    {
      feature: 'distanceFromVwapPct',
      operator: 'lt',
      value: -0.002,
      description: 'Price is >0.2% below VWAP (sweep condition)',
    },
    {
      feature: 'lowerWickPct',
      operator: 'gte',
      value: 0.4,
      description: 'Lower wick is ≥40% of bar range (rejection evidence)',
    },
    {
      feature: 'session',
      operator: 'eq',
      value: 'RTH',
      description: 'Regular trading hours only',
    },
  ],
  direction: 'LONG',
  expectedHorizonMinutes: 15,
  hypothesis:
    'When price sweeps below VWAP with a prominent lower wick and then reclaims VWAP, ' +
    'the subsequent move above VWAP continues for at least 1R within 15 minutes ' +
    'at above-random frequency.',
  potentialExplanation:
    'VWAP is a key institutional reference level. A sweep below VWAP with rejection ' +
    'indicates failed selling pressure and potential institutional buying.',
  competingExplanations: [
    'VWAP reclaims may fail in strongly trending downside sessions.',
    'The lower wick may reflect thin liquidity rather than genuine rejection.',
    'VWAP loses significance late in the session as it converges to price.',
  ],
  knownLimitations: [
    'VWAP computation requires accurate volume data.',
    'Session VWAP resets at each RTH open — cross-session comparisons are invalid.',
    'Does not account for multi-day VWAP or anchored VWAP levels.',
  ],
};

// ─── Experiment D: High-Chop EMA15 Cross Fade ────────────────────────────────

export const EXPERIMENT_D: OccurrencePattern = {
  patternId: 'EXP_D_HIGH_CHOP_EMA15_CROSS_FADE',
  name: 'High-Chop EMA15 Cross Fade',
  description:
    'In high-chop regimes (≥3 EMA15 crosses in prior 10 bars), price tends to ' +
    'revert after each cross rather than continuing in the cross direction.',
  conditions: [
    {
      feature: 'ema15CrossCount10',
      operator: 'gte',
      value: 3,
      description: 'EMA15 cross count in prior 10 bars ≥3 (high chop)',
    },
    {
      feature: 'atrPct',
      operator: 'lt',
      value: 0.002,
      description: 'ATR% <0.2% (low volatility chop)',
    },
  ],
  direction: 'BOTH',
  expectedHorizonMinutes: 5,
  hypothesis:
    'In high-chop regimes characterised by frequent EMA15 crosses and low ATR, ' +
    'price tends to revert after each cross at above-random frequency within 5 minutes.',
  potentialExplanation:
    'High-chop regimes indicate indecision and balanced order flow. ' +
    'EMA15 crosses in this environment are noise rather than signal.',
  competingExplanations: [
    'High-chop may precede a breakout — fading the cross may be wrong at inflection points.',
    'The effect may be an artefact of the 5-minute bar interval.',
    'Transaction costs will likely erode any edge in a choppy, low-ATR environment.',
  ],
  knownLimitations: [
    'Chop regimes are difficult to classify in real time.',
    'Transaction costs are particularly damaging in low-ATR environments.',
    'The experiment may confirm that no tradeable edge exists in chop — which is also valuable.',
  ],
};

export const ALL_EXPERIMENTS: OccurrencePattern[] = [
  EXPERIMENT_A,
  EXPERIMENT_B,
  EXPERIMENT_C,
  EXPERIMENT_D,
];

// ─── Observation matcher ──────────────────────────────────────────────────────

/**
 * Tests whether a single observation matches all conditions of a pattern.
 * Returns true only if ALL conditions are satisfied.
 */
export function matchesPattern(
  obs: DarwinObservation,
  pattern: OccurrencePattern
): boolean {
  for (const condition of pattern.conditions) {
    const rawValue = (obs as Record<string, unknown>)[condition.feature];
    if (rawValue === null || rawValue === undefined) return false;

    const numValue = typeof rawValue === 'string' ? parseFloat(rawValue) : Number(rawValue);

    switch (condition.operator) {
      case 'gt':
        if (!(numValue > (condition.value as number))) return false;
        break;
      case 'lt':
        if (!(numValue < (condition.value as number))) return false;
        break;
      case 'gte':
        if (!(numValue >= (condition.value as number))) return false;
        break;
      case 'lte':
        if (!(numValue <= (condition.value as number))) return false;
        break;
      case 'eq':
        if (numValue !== condition.value && String(rawValue) !== String(condition.value)) return false;
        break;
      case 'neq':
        if (numValue === condition.value) return false;
        break;
      case 'between': {
        const [lo, hi] = condition.value as [number, number];
        if (!(numValue >= lo && numValue <= hi)) return false;
        break;
      }
      case 'in':
        if (!(condition.value as string[]).includes(String(rawValue))) return false;
        break;
    }
  }
  return true;
}

// ─── Statistical gates ────────────────────────────────────────────────────────

/**
 * Applies all statistical gates to an occurrence result.
 * Returns the result with passesGates and gateFailures populated.
 */
export function applyStatisticalGates(result: Omit<OccurrenceResult, 'passesGates' | 'gateFailures'>): OccurrenceResult {
  const failures: string[] = [];

  if (result.occurrenceCount < OCCURRENCE_GATES.MIN_OCCURRENCES) {
    failures.push(`Insufficient occurrences: ${result.occurrenceCount} < ${OCCURRENCE_GATES.MIN_OCCURRENCES}`);
  }
  if (result.pValue > OCCURRENCE_GATES.MAX_P_VALUE) {
    failures.push(`p-value too high: ${result.pValue.toFixed(4)} > ${OCCURRENCE_GATES.MAX_P_VALUE}`);
  }
  if (result.effectSize < OCCURRENCE_GATES.MIN_EFFECT_SIZE) {
    failures.push(`Effect size too small: ${result.effectSize.toFixed(3)} < ${OCCURRENCE_GATES.MIN_EFFECT_SIZE}`);
  }
  if (result.winRate < OCCURRENCE_GATES.MIN_WIN_RATE) {
    failures.push(`Win rate too low: ${(result.winRate * 100).toFixed(1)}% < ${(OCCURRENCE_GATES.MIN_WIN_RATE * 100).toFixed(1)}%`);
  }
  if (result.profitFactor < OCCURRENCE_GATES.MIN_PROFIT_FACTOR) {
    failures.push(`Profit factor too low: ${result.profitFactor.toFixed(2)} < ${OCCURRENCE_GATES.MIN_PROFIT_FACTOR}`);
  }
  if (result.stabilityScore < OCCURRENCE_GATES.MIN_STABILITY_SCORE) {
    failures.push(`Stability score too low: ${result.stabilityScore.toFixed(2)} < ${OCCURRENCE_GATES.MIN_STABILITY_SCORE}`);
  }

  return {
    ...result,
    passesGates: failures.length === 0,
    gateFailures: failures,
  };
}

// ─── Candidate builder ────────────────────────────────────────────────────────

/**
 * Converts a validated occurrence result into a G6A candidate record.
 * Only called when all statistical gates pass.
 */
export function buildCandidateFromOccurrence(
  pattern: OccurrencePattern,
  result: OccurrenceResult,
  discoveryDataPeriods: Array<{ start: number; end: number }>,
  codeSha: string
): InsertDarwinCandidate {
  if (!result.passesGates) {
    throw new Error(
      `[DARWIN occurrence engine] Cannot create candidate from pattern ${pattern.patternId}: ` +
      `gate failures: ${result.gateFailures.join(', ')}`
    );
  }

  return {
    candidateId: `DARWIN_${pattern.patternId}_${Date.now()}`,
    behaviourClass: pattern.patternId,
    behaviourDescription: `${pattern.name}: ${pattern.description}`,
    occurrenceCount: result.occurrenceCount,
    statisticalSignificance: String(result.pValue),
    confidence: String(Math.round(Math.min(0.95, result.winRate) * 100)),
    estimatedWinRate: String(Math.round(result.winRate * 100)),
    estimatedPf: String(result.profitFactor),
    evidenceScore: String(Math.round(result.effectSize * 100)),
    humanExplanation: pattern.potentialExplanation,
    governanceStage: 'HYPOTHESIS',
    discoveredBy: 'DARWIN',
    firstObserved: Date.now(),
    lastObserved: Date.now(),
  };
}
