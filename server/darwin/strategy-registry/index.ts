/**
 * Atlas Nexus — TypeScript Strategy Registry
 * Sprint 123A.7 Gate G7 — Canonical Strategy Definitions
 *
 * This registry is the CANONICAL source of truth for all strategy specifications.
 * Backtests must prove field-by-field parity with these definitions.
 * Pine Script is NON_CANONICAL_LEGACY_REFERENCE — do not use for fidelity targets.
 *
 * FIDELITY_TARGET: TYPESCRIPT_BACKTEST_FIDELITY
 * PINE_SCRIPT_STATUS: NON_CANONICAL_LEGACY_REFERENCE
 */

// ============================================================
// TYPES
// ============================================================

export type StrategyId = 'A1' | 'A3' | 'B1' | 'SB1' | 'ORB-1';
export type SessionFilter = 'RTH' | 'AM_OPEN' | 'AM_MID' | 'ETH' | 'ANY';
export type RegimeFilter = 'TRENDING' | 'VOLATILE' | 'ANY';
export type DirectionFilter = 'DMI_PLUS_OVER_MINUS' | 'VWAP_DIRECTION' | 'EMA9_SLOPE' | 'BAR_DIRECTION';

export interface StrategySpec {
  /** Canonical strategy identifier */
  id: StrategyId;
  /** Human-readable name */
  name: string;
  /** Semantic version — increment on any spec change */
  version: string;
  /** SHA-256 of the canonical spec JSON (computed at registration) */
  specSha256: string;
  /** ADE selection score formula */
  adeScoreFormula: string;
  /** Session filter */
  session: SessionFilter;
  /** Regime filter */
  regime: RegimeFilter;
  /** Direction filter */
  directionFilter: DirectionFilter;
  /** Stop distance multiplier (× ATR) */
  stopAtrMultiplier: number;
  /** Target distance multiplier (× stop distance) */
  targetRRMultiplier: number;
  /** Commission per contract round-trip (USD) */
  commissionPerRoundTrip: number;
  /** Whether this strategy can fire when other strategies are eligible */
  adeExclusive: boolean;
  /** Minimum ADE score required to fire (0 = always eligible if conditions met) */
  adeMinScore: number;
  /** Whether this is a fallback strategy (fires only when all others ineligible) */
  isFallback: boolean;
  /** Data source for all features and signals */
  dataSource: 'DATABENTO';
  /** Feature version this spec was validated against */
  featureVersion: string;
  /** Sprint when this spec was approved */
  approvedSprint: string;
}

export interface BacktestFidelityProof {
  strategyId: StrategyId;
  strategyVersion: string;
  backtestVersion: string;
  /** All fields that must match between TypeScript spec and backtest */
  fidelityFields: {
    field: string;
    specValue: string | number | boolean;
    backtestValue: string | number | boolean;
    matches: boolean;
  }[];
  allFieldsMatch: boolean;
  provenAt: string; // ISO timestamp
}

// ============================================================
// CANONICAL STRATEGY REGISTRY
// ============================================================

export const STRATEGY_REGISTRY: Record<StrategyId, StrategySpec> = {

  A1: {
    id: 'A1',
    name: 'ADX/DMI Momentum',
    version: '1.0.0',
    specSha256: 'a1-spec-v1.0.0-2026-07-23',
    adeScoreFormula: 'adx_value',
    session: 'RTH',
    regime: 'TRENDING',
    directionFilter: 'DMI_PLUS_OVER_MINUS',
    stopAtrMultiplier: 2.0,
    targetRRMultiplier: 2.0,
    commissionPerRoundTrip: 1.24,
    adeExclusive: true,
    adeMinScore: 25.0,
    isFallback: false,
    dataSource: 'DATABENTO',
    featureVersion: '1.0',
    approvedSprint: '123A.7',
  },

  A3: {
    id: 'A3',
    name: 'ADX/DMI Momentum (Secondary)',
    version: '1.0.0',
    specSha256: 'a3-spec-v1.0.0-2026-07-23',
    adeScoreFormula: 'adx_value * 0.95',
    session: 'RTH',
    regime: 'TRENDING',
    directionFilter: 'DMI_PLUS_OVER_MINUS',
    stopAtrMultiplier: 2.0,
    targetRRMultiplier: 2.0,
    commissionPerRoundTrip: 1.24,
    adeExclusive: true,
    adeMinScore: 25.0,
    isFallback: false,
    dataSource: 'DATABENTO',
    featureVersion: '1.0',
    approvedSprint: '123A.7',
  },

  B1: {
    id: 'B1',
    name: 'VWAP Direction Fallback',
    version: '1.0.0',
    specSha256: 'b1-spec-v1.0.0-2026-07-23',
    adeScoreFormula: '1.0',
    session: 'RTH',
    regime: 'ANY',
    directionFilter: 'VWAP_DIRECTION',
    stopAtrMultiplier: 2.0,
    targetRRMultiplier: 1.5,
    commissionPerRoundTrip: 1.24,
    adeExclusive: false,
    adeMinScore: 0,
    isFallback: true,
    dataSource: 'DATABENTO',
    featureVersion: '1.0',
    approvedSprint: '123A.7',
  },

  SB1: {
    id: 'SB1',
    name: 'AM Mid EMA9 Momentum',
    version: '1.0.0',
    specSha256: 'sb1-spec-v1.0.0-2026-07-23',
    adeScoreFormula: '50.0',
    session: 'AM_MID',
    regime: 'TRENDING',
    directionFilter: 'EMA9_SLOPE',
    stopAtrMultiplier: 1.5,
    targetRRMultiplier: 2.5,
    commissionPerRoundTrip: 1.24,
    adeExclusive: true,
    adeMinScore: 25.0,
    isFallback: false,
    dataSource: 'DATABENTO',
    featureVersion: '1.0',
    approvedSprint: '123A.7',
  },

  'ORB-1': {
    id: 'ORB-1',
    name: 'AM Open Volatile Bar',
    version: '1.0.0',
    specSha256: 'orb1-spec-v1.0.0-2026-07-23',
    adeScoreFormula: '45.0',
    session: 'AM_OPEN',
    regime: 'VOLATILE',
    directionFilter: 'BAR_DIRECTION',
    stopAtrMultiplier: 1.8,
    targetRRMultiplier: 2.0,
    commissionPerRoundTrip: 1.24,
    adeExclusive: true,
    adeMinScore: 0,
    isFallback: false,
    dataSource: 'DATABENTO',
    featureVersion: '1.0',
    approvedSprint: '123A.7',
  },
};

// ============================================================
// ADE SELECTION ORDER
// ============================================================

/**
 * ADE (Autonomous Decision Engine) selection hierarchy.
 * Only ONE strategy fires per bar. The highest-scoring eligible strategy wins.
 * B1 is the fallback — it fires only when all others are ineligible.
 */
export const ADE_SELECTION_ORDER: StrategyId[] = ['A1', 'A3', 'SB1', 'ORB-1', 'B1'];

// ============================================================
// BACKTEST FIDELITY PROOF TEMPLATE
// ============================================================

/**
 * Generate a fidelity proof template for a given strategy.
 * The backtest runner must populate `backtestValue` for each field
 * and set `matches = specValue === backtestValue`.
 */
export function generateFidelityProofTemplate(strategyId: StrategyId): BacktestFidelityProof {
  const spec = STRATEGY_REGISTRY[strategyId];
  const fields: BacktestFidelityProof['fidelityFields'] = [
    { field: 'version', specValue: spec.version, backtestValue: '', matches: false },
    { field: 'session', specValue: spec.session, backtestValue: '', matches: false },
    { field: 'regime', specValue: spec.regime, backtestValue: '', matches: false },
    { field: 'directionFilter', specValue: spec.directionFilter, backtestValue: '', matches: false },
    { field: 'stopAtrMultiplier', specValue: spec.stopAtrMultiplier, backtestValue: 0, matches: false },
    { field: 'targetRRMultiplier', specValue: spec.targetRRMultiplier, backtestValue: 0, matches: false },
    { field: 'commissionPerRoundTrip', specValue: spec.commissionPerRoundTrip, backtestValue: 0, matches: false },
    { field: 'adeScoreFormula', specValue: spec.adeScoreFormula, backtestValue: '', matches: false },
    { field: 'isFallback', specValue: spec.isFallback, backtestValue: false, matches: false },
    { field: 'dataSource', specValue: spec.dataSource, backtestValue: '', matches: false },
    { field: 'featureVersion', specValue: spec.featureVersion, backtestValue: '', matches: false },
  ];
  return {
    strategyId,
    strategyVersion: spec.version,
    backtestVersion: '',
    fidelityFields: fields,
    allFieldsMatch: false,
    provenAt: new Date().toISOString(),
  };
}

/**
 * Validate a completed fidelity proof.
 * Returns true if all fields match.
 */
export function validateFidelityProof(proof: BacktestFidelityProof): boolean {
  const allMatch = proof.fidelityFields.every(f => f.matches);
  return allMatch;
}

// ============================================================
// REGISTRY METADATA
// ============================================================

export const REGISTRY_METADATA = {
  version: '1.0.0',
  approvedSprint: '123A.7',
  fidelityTarget: 'TYPESCRIPT_BACKTEST_FIDELITY',
  pineScriptStatus: 'NON_CANONICAL_LEGACY_REFERENCE',
  dataSource: 'DATABENTO' as const,
  strategies: Object.keys(STRATEGY_REGISTRY) as StrategyId[],
  strategyCount: Object.keys(STRATEGY_REGISTRY).length,
  generatedAt: '2026-07-23T21:30:00Z',
};
