/**
 * DARWIN G6A Schema — Sprint 123A.6
 *
 * New tables for the DARWIN learning authority in shadow mode:
 *   - darwin_observations        — immutable per-bar feature records
 *   - darwin_outcome_labels      — forward outcome labels (delayed, separate)
 *   - darwin_experiment_manifests — reproducible experiment records
 *   - darwin_shadow_signals      — research-only signals (never transmitted)
 *   - darwin_g6a_candidates      — extended candidate registry with G6A lifecycle
 *
 * These tables are additive — they do not modify existing DARWIN tables.
 */

import {
  mysqlTable,
  int,
  varchar,
  text,
  boolean,
  timestamp,
  bigint,
  decimal,
  json,
  mysqlEnum,
} from 'drizzle-orm/mysql-core';

// ─── darwin_observations ──────────────────────────────────────────────────────
// Immutable per-bar feature records. No future data. No look-ahead.
// Created on every confirmed Databento bar when learning authority is active.

export const darwinObservations = mysqlTable('darwin_observations', {
  id: int('id').autoincrement().primaryKey(),
  observationId: varchar('observation_id', { length: 64 }).notNull().unique(),

  // Source metadata
  source: varchar('source', { length: 32 }).notNull().default('DATABENTO'),
  dataset: varchar('dataset', { length: 32 }).notNull(),
  rawSymbol: varchar('raw_symbol', { length: 32 }).notNull(),
  instrumentId: int('instrument_id'),
  interval: varchar('interval', { length: 8 }).notNull(), // '1m' | '5m'
  barTimestamp: bigint('bar_timestamp', { mode: 'number' }).notNull(),
  revision: int('revision').notNull().default(0),
  mappingVersion: varchar('mapping_version', { length: 32 }),
  session: varchar('session', { length: 16 }), // 'RTH' | 'ETH' | 'OVERNIGHT'
  codeVersion: varchar('code_version', { length: 40 }).notNull(), // git SHA

  // OHLCV
  open: decimal('open', { precision: 12, scale: 2 }).notNull(),
  high: decimal('high', { precision: 12, scale: 2 }).notNull(),
  low: decimal('low', { precision: 12, scale: 2 }).notNull(),
  close: decimal('close', { precision: 12, scale: 2 }).notNull(),
  volume: int('volume'),
  tradeCount: int('trade_count'),

  // Regime features
  volatilityRegime: varchar('volatility_regime', { length: 16 }), // 'LOW' | 'NORMAL' | 'HIGH' | 'EXTREME'
  trendRegime: varchar('trend_regime', { length: 16 }),            // 'TRENDING' | 'RANGING' | 'CHOPPY'
  adx: decimal('adx', { precision: 6, scale: 2 }),
  atr: decimal('atr', { precision: 10, scale: 4 }),
  atrPct: decimal('atr_pct', { precision: 8, scale: 4 }),

  // Structure features
  vwap: decimal('vwap', { precision: 12, scale: 2 }),
  distanceFromVwap: decimal('distance_from_vwap', { precision: 10, scale: 4 }),
  distanceFromVwapPct: decimal('distance_from_vwap_pct', { precision: 8, scale: 4 }),
  ema15: decimal('ema15', { precision: 12, scale: 2 }),
  ema50: decimal('ema50', { precision: 12, scale: 2 }),
  ema200: decimal('ema200', { precision: 12, scale: 2 }),
  distanceFromEma15: decimal('distance_from_ema15', { precision: 10, scale: 4 }),
  distanceFromEma15Pct: decimal('distance_from_ema15_pct', { precision: 8, scale: 4 }),
  distanceFromEma50: decimal('distance_from_ema50', { precision: 10, scale: 4 }),
  ema15CrossCount5: int('ema15_cross_count_5'),   // EMA15 crosses in prior 5 bars
  ema15CrossCount10: int('ema15_cross_count_10'),  // EMA15 crosses in prior 10 bars
  ema15CrossCount20: int('ema15_cross_count_20'),  // EMA15 crosses in prior 20 bars
  priceAboveEma15: boolean('price_above_ema15'),
  priceAboveEma50: boolean('price_above_ema50'),
  priceAboveEma200: boolean('price_above_ema200'),

  // Range and body statistics
  barRange: decimal('bar_range', { precision: 10, scale: 4 }),
  bodySize: decimal('body_size', { precision: 10, scale: 4 }),
  bodySizePct: decimal('body_size_pct', { precision: 8, scale: 4 }),
  upperWick: decimal('upper_wick', { precision: 10, scale: 4 }),
  lowerWick: decimal('lower_wick', { precision: 10, scale: 4 }),
  upperWickPct: decimal('upper_wick_pct', { precision: 8, scale: 4 }),
  lowerWickPct: decimal('lower_wick_pct', { precision: 8, scale: 4 }),
  isBullish: boolean('is_bullish'),
  isInsideBar: boolean('is_inside_bar'),
  isOutsideBar: boolean('is_outside_bar'),

  // Momentum features
  rsi14: decimal('rsi14', { precision: 6, scale: 2 }),
  momentum5: decimal('momentum5', { precision: 10, scale: 4 }),   // close - close[5]
  momentum10: decimal('momentum10', { precision: 10, scale: 4 }),
  priceChangePct: decimal('price_change_pct', { precision: 8, scale: 4 }),

  // Volume statistics
  volumeRatio5: decimal('volume_ratio_5', { precision: 8, scale: 4 }),  // vol / avg_vol_5
  volumeRatio20: decimal('volume_ratio_20', { precision: 8, scale: 4 }),
  isHighVolume: boolean('is_high_volume'),

  // Session context
  minutesIntoSession: int('minutes_into_session'),
  isOpeningRange: boolean('is_opening_range'),  // first 30 min RTH
  sessionHigh: decimal('session_high', { precision: 12, scale: 2 }),
  sessionLow: decimal('session_low', { precision: 12, scale: 2 }),
  priorDayHigh: decimal('prior_day_high', { precision: 12, scale: 2 }),
  priorDayLow: decimal('prior_day_low', { precision: 12, scale: 2 }),
  priorDayClose: decimal('prior_day_close', { precision: 12, scale: 2 }),
  gapFromPriorClose: decimal('gap_from_prior_close', { precision: 10, scale: 4 }),

  // Liquidity features
  distanceFromSessionHigh: decimal('distance_from_session_high', { precision: 10, scale: 4 }),
  distanceFromSessionLow: decimal('distance_from_session_low', { precision: 10, scale: 4 }),
  distanceFromPriorDayHigh: decimal('distance_from_prior_day_high', { precision: 10, scale: 4 }),
  distanceFromPriorDayLow: decimal('distance_from_prior_day_low', { precision: 10, scale: 4 }),
  isNearSessionHigh: boolean('is_near_session_high'),
  isNearSessionLow: boolean('is_near_session_low'),
  isNearPriorDayHigh: boolean('is_near_prior_day_high'),
  isNearPriorDayLow: boolean('is_near_prior_day_low'),

  // Prior bar context (no future data)
  priorClose: decimal('prior_close', { precision: 12, scale: 2 }),
  priorBodySize: decimal('prior_body_size', { precision: 10, scale: 4 }),
  priorVolume: int('prior_volume'),
  priorIsBullish: boolean('prior_is_bullish'),
  priorVolatilityRegime: varchar('prior_volatility_regime', { length: 16 }),

  // Feature version (for reproducibility)
  featureVersion: varchar('feature_version', { length: 16 }).notNull().default('1.0'),

  // Forward outcome labels stored separately (referenced by observationId)
  // DO NOT add future data here — labels are in darwin_outcome_labels

  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export type DarwinObservation = typeof darwinObservations.$inferSelect;
export type InsertDarwinObservation = typeof darwinObservations.$inferInsert;

// ─── darwin_outcome_labels ────────────────────────────────────────────────────
// Forward outcome labels. Created only after the full horizon has elapsed.
// References darwin_observations by observationId. Observation record is immutable.

export const darwinOutcomeLabels = mysqlTable('darwin_outcome_labels', {
  id: int('id').autoincrement().primaryKey(),
  labelId: varchar('label_id', { length: 64 }).notNull().unique(),
  observationId: varchar('observation_id', { length: 64 }).notNull(), // FK to darwin_observations

  // Horizon
  horizonMinutes: int('horizon_minutes').notNull(), // 1 | 3 | 5 | 10 | 15 | 30 | 60

  // Outcome metrics
  netPriceChange: decimal('net_price_change', { precision: 10, scale: 4 }),
  netPriceChangePct: decimal('net_price_change_pct', { precision: 8, scale: 4 }),
  direction: mysqlEnum('direction', ['LONG', 'SHORT', 'FLAT']),
  maxFavourableExcursion: decimal('max_favourable_excursion', { precision: 10, scale: 4 }),
  maxAdverseExcursion: decimal('max_adverse_excursion', { precision: 10, scale: 4 }),
  volatilityAdjustedReturn: decimal('volatility_adjusted_return', { precision: 10, scale: 4 }),

  // Simulated outcomes
  simulatedLongOutcome: decimal('simulated_long_outcome', { precision: 10, scale: 4 }),
  simulatedShortOutcome: decimal('simulated_short_outcome', { precision: 10, scale: 4 }),

  // Reward-to-risk
  longReached1R: boolean('long_reached_1r'),
  longReached2R: boolean('long_reached_2r'),
  longReached3R: boolean('long_reached_3r'),
  shortReached1R: boolean('short_reached_1r'),
  shortReached2R: boolean('short_reached_2r'),
  shortReached3R: boolean('short_reached_3r'),

  // Time metrics
  timeToLongTarget: int('time_to_long_target'),   // minutes
  timeToShortTarget: int('time_to_short_target'),
  timeToAdverseThreshold: int('time_to_adverse_threshold'),

  // Metadata
  labelVersion: varchar('label_version', { length: 16 }).notNull().default('1.0'),
  horizonCompleteAt: bigint('horizon_complete_at', { mode: 'number' }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export type DarwinOutcomeLabel = typeof darwinOutcomeLabels.$inferSelect;
export type InsertDarwinOutcomeLabel = typeof darwinOutcomeLabels.$inferInsert;

// ─── darwin_experiment_manifests ──────────────────────────────────────────────
// Reproducible experiment records. Every experiment must have a manifest.
// The same manifest must reproduce the same result.

export const darwinExperimentManifests = mysqlTable('darwin_experiment_manifests', {
  id: int('id').autoincrement().primaryKey(),
  experimentId: varchar('experiment_id', { length: 64 }).notNull().unique(),
  candidateId: varchar('candidate_id', { length: 64 }).notNull(),

  // Reproducibility fields
  codeSha: varchar('code_sha', { length: 40 }).notNull(),  // git SHA
  dataset: varchar('dataset', { length: 32 }).notNull(),
  symbol: varchar('symbol', { length: 32 }).notNull(),
  contractMapping: varchar('contract_mapping', { length: 64 }),

  // Date ranges
  dateRangeStart: bigint('date_range_start', { mode: 'number' }).notNull(),
  dateRangeEnd: bigint('date_range_end', { mode: 'number' }).notNull(),
  trainStart: bigint('train_start', { mode: 'number' }).notNull(),
  trainEnd: bigint('train_end', { mode: 'number' }).notNull(),
  validationStart: bigint('validation_start', { mode: 'number' }),
  validationEnd: bigint('validation_end', { mode: 'number' }),
  outOfSampleStart: bigint('out_of_sample_start', { mode: 'number' }),
  outOfSampleEnd: bigint('out_of_sample_end', { mode: 'number' }),
  embargoMinutes: int('embargo_minutes').notNull().default(0),

  // Versioning
  featureVersion: varchar('feature_version', { length: 16 }).notNull(),
  labelVersion: varchar('label_version', { length: 16 }).notNull(),

  // Parameters
  parameterSet: json('parameter_set').notNull(),
  transactionCostAssumptions: json('transaction_cost_assumptions').notNull(),
  slippageAssumptions: json('slippage_assumptions').notNull(),
  seed: int('seed').notNull(),

  // Results
  resultHashes: json('result_hashes'),
  outputFileLocations: json('output_file_locations'),
  executionTimestamp: bigint('execution_timestamp', { mode: 'number' }).notNull(),

  // Status
  status: mysqlEnum('status', ['PENDING', 'RUNNING', 'COMPLETE', 'FAILED', 'CANCELLED']).notNull().default('PENDING'),
  failureReason: text('failure_reason'),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
});

export type DarwinExperimentManifest = typeof darwinExperimentManifests.$inferSelect;
export type InsertDarwinExperimentManifest = typeof darwinExperimentManifests.$inferInsert;

// ─── darwin_shadow_signals ────────────────────────────────────────────────────
// Research-only signals. Never transmitted. Never affect live trading.
// Visible in the dashboard with "RESEARCH ONLY — NO LIVE EXECUTION" label.

export const darwinShadowSignals = mysqlTable('darwin_shadow_signals', {
  id: int('id').autoincrement().primaryKey(),
  signalId: varchar('signal_id', { length: 64 }).notNull().unique(),
  candidateId: varchar('candidate_id', { length: 64 }).notNull(),

  // Signal fields
  timestamp: bigint('timestamp', { mode: 'number' }).notNull(),
  symbol: varchar('symbol', { length: 32 }).notNull(),
  direction: mysqlEnum('direction', ['LONG', 'SHORT']).notNull(),
  theoreticalEntry: decimal('theoretical_entry', { precision: 12, scale: 2 }).notNull(),
  theoreticalStop: decimal('theoretical_stop', { precision: 12, scale: 2 }).notNull(),
  theoreticalTarget: decimal('theoretical_target', { precision: 12, scale: 2 }).notNull(),
  confidence: decimal('confidence', { precision: 5, scale: 2 }).notNull(),
  reasonCodes: json('reason_codes').notNull(),
  featureSnapshot: json('feature_snapshot').notNull(),
  regime: varchar('regime', { length: 32 }),
  expectedHoldingPeriodMinutes: int('expected_holding_period_minutes'),
  experimentVersion: varchar('experiment_version', { length: 16 }).notNull(),
  codeSha: varchar('code_sha', { length: 40 }).notNull(),

  // Authority guards — these must always be false
  processBarCalled: boolean('process_bar_called').notNull().default(false),
  postBarAutomationCalled: boolean('post_bar_automation_called').notNull().default(false),
  tradersPostSent: boolean('traders_post_sent').notNull().default(false),
  tradovateOrderSubmitted: boolean('tradovate_order_submitted').notNull().default(false),

  // Label: "RESEARCH ONLY — NO LIVE EXECUTION"
  researchOnlyLabel: varchar('research_only_label', { length: 64 })
    .notNull()
    .default('RESEARCH ONLY — NO LIVE EXECUTION'),

  // Outcome tracking (filled after horizon)
  actualOutcome: json('actual_outcome'),
  outcomeRecordedAt: bigint('outcome_recorded_at', { mode: 'number' }),

  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export type DarwinShadowSignal = typeof darwinShadowSignals.$inferSelect;
export type InsertDarwinShadowSignal = typeof darwinShadowSignals.$inferInsert;

// ─── darwin_g6a_candidates ────────────────────────────────────────────────────
// Extended candidate registry with the full G6A lifecycle.
// Supplements (does not replace) the existing darwin_candidates table.

export const darwinG6aCandidates = mysqlTable('darwin_g6a_candidates', {
  id: int('id').autoincrement().primaryKey(),
  candidateId: varchar('candidate_id', { length: 64 }).notNull().unique(),
  name: varchar('name', { length: 128 }).notNull(),
  version: int('version').notNull().default(1),

  // Hypothesis
  hypothesis: text('hypothesis').notNull(),
  conditions: json('conditions').notNull(),
  direction: mysqlEnum('direction', ['LONG', 'SHORT', 'BOTH']).notNull(),
  expectedForwardBehaviour: text('expected_forward_behaviour'),
  potentialEconomicExplanation: text('potential_economic_explanation'),
  competingExplanations: json('competing_explanations'),
  knownLimitations: json('known_limitations'),

  // Discovery
  sourceObservationId: varchar('source_observation_id', { length: 64 }),
  discoveryDataPeriods: json('discovery_data_periods'),
  discoverySampleSize: int('discovery_sample_size'),
  baselineComparison: json('baseline_comparison'),
  effectSize: decimal('effect_size', { precision: 8, scale: 4 }),
  initialConfidence: decimal('initial_confidence', { precision: 5, scale: 2 }),

  // Lifecycle status
  status: mysqlEnum('status', [
    'OBSERVED',
    'HYPOTHESIS',
    'BACKTESTING',
    'OUT_OF_SAMPLE',
    'SHADOW',
    'ELIGIBLE_FOR_REVIEW',
    'REJECTED',
    'RETIRED',
  ]).notNull().default('OBSERVED'),

  // Timestamps
  createdAt: timestamp('created_at').defaultNow().notNull(),
  lastEvaluatedAt: timestamp('last_evaluated_at').defaultNow().onUpdateNow().notNull(),

  // Versioning
  datasetVersion: varchar('dataset_version', { length: 32 }),
  experimentIds: json('experiment_ids'),

  // Metrics
  inSampleMetrics: json('in_sample_metrics'),
  outOfSampleMetrics: json('out_of_sample_metrics'),
  shadowMetrics: json('shadow_metrics'),

  // Rejection
  rejectionReason: text('rejection_reason'),
  rejectedAt: bigint('rejected_at', { mode: 'number' }),
  canAutoReactivate: boolean('can_auto_reactivate').notNull().default(false), // always false

  // Promotion
  promotionRequirements: json('promotion_requirements'),
  promotionRequiresPhilApproval: boolean('promotion_requires_phil_approval').notNull().default(true),

  // Portfolio analysis
  correlationWithExistingStrategies: json('correlation_with_existing_strategies'),
  overlapScore: decimal('overlap_score', { precision: 5, scale: 2 }),
  diversificationValue: decimal('diversification_value', { precision: 5, scale: 2 }),
  incrementalExpectancy: decimal('incremental_expectancy', { precision: 8, scale: 4 }),
  portfolioDrawdownEffect: decimal('portfolio_drawdown_effect', { precision: 8, scale: 4 }),
  regimeCoverage: json('regime_coverage'),

  // Related candidates
  relatedCandidateIds: json('related_candidate_ids'),
  duplicateScore: decimal('duplicate_score', { precision: 5, scale: 2 }),
  isMarkedDuplicate: boolean('is_marked_duplicate').notNull().default(false),
});

export type DarwinG6aCandidate = typeof darwinG6aCandidates.$inferSelect;
export type InsertDarwinG6aCandidate = typeof darwinG6aCandidates.$inferInsert;

// ─── darwin_g6a_resource_log ──────────────────────────────────────────────────
// Resource usage log for DARWIN jobs. Enforces bounded concurrency.

export const darwinG6aResourceLog = mysqlTable('darwin_g6a_resource_log', {
  id: int('id').autoincrement().primaryKey(),
  jobId: varchar('job_id', { length: 64 }).notNull(),
  jobType: varchar('job_type', { length: 64 }).notNull(),
  candidateId: varchar('candidate_id', { length: 64 }),
  experimentId: varchar('experiment_id', { length: 64 }),
  startedAt: bigint('started_at', { mode: 'number' }).notNull(),
  completedAt: bigint('completed_at', { mode: 'number' }),
  durationMs: int('duration_ms'),
  peakMemoryMb: decimal('peak_memory_mb', { precision: 8, scale: 2 }),
  cpuSeconds: decimal('cpu_seconds', { precision: 8, scale: 2 }),
  diskWrittenMb: decimal('disk_written_mb', { precision: 8, scale: 2 }),
  status: mysqlEnum('status', ['RUNNING', 'COMPLETE', 'FAILED', 'TIMEOUT', 'CANCELLED']).notNull().default('RUNNING'),
  failureReason: text('failure_reason'),
  liveChartAffected: boolean('live_chart_affected').notNull().default(false), // must always be false
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export type DarwinG6aResourceLog = typeof darwinG6aResourceLog.$inferSelect;
export type InsertDarwinG6aResourceLog = typeof darwinG6aResourceLog.$inferInsert;
