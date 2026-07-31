/**
 * DARWIN Complete Edge-Search Universe — Drizzle Schema Extension
 * Sprint: darwin-complete-edge-search-universe
 * Created: 2026-07-31
 *
 * Adds 9 new tables to the Drizzle schema.
 * Import from this file in all edge-search service modules.
 */

import {
  mysqlTable,
  varchar,
  text,
  int,
  boolean,
  datetime,
  bigint,
  json,
  decimal,
  date,
  mysqlEnum,
  uniqueIndex,
  index,
} from 'drizzle-orm/mysql-core';

// ============================================================
// darwin_research_coverage_registry
// ============================================================
export const darwinResearchCoverageRegistry = mysqlTable(
  'darwin_research_coverage_registry',
  {
    familyId:                varchar('family_id', { length: 10 }).notNull().primaryKey(),
    familyName:              varchar('family_name', { length: 100 }).notNull(),
    familyDescription:       text('family_description'),
    totalDefinedRules:       int('total_defined_rules').notNull().default(0),
    activeRules:             int('active_rules').notNull().default(0),
    inactiveRules:           int('inactive_rules').notNull().default(0),
    blockedRules:            int('blocked_rules').notNull().default(0),
    testedHypotheses:        int('tested_hypotheses').notNull().default(0),
    rejectedHypotheses:      int('rejected_hypotheses').notNull().default(0),
    inconclusiveHypotheses:  int('inconclusive_hypotheses').notNull().default(0),
    promisingHypotheses:     int('promising_hypotheses').notNull().default(0),
    supportedHypotheses:     int('supported_hypotheses').notNull().default(0),
    lastResearchedAt:        datetime('last_researched_at', { fsp: 3 }),
    nextActivationPriority:  int('next_activation_priority').notNull().default(99),
    dataAvailable:           boolean('data_available').notNull().default(true),
    dataRequirements:        text('data_requirements'),
    blocker:                 text('blocker'),
    status:                  mysqlEnum('status', [
                               'DEFINED',
                               'QUEUED_FOR_ACTIVATION',
                               'ACTIVE',
                               'PAUSED',
                               'BLOCKED_DATA_UNAVAILABLE',
                               'RESEARCH_COMPLETE',
                               'REQUIRES_PHIL_APPROVAL',
                             ]).notNull().default('DEFINED'),
    createdAt:               datetime('created_at', { fsp: 3 }).notNull().default(new Date()),
    updatedAt:               datetime('updated_at', { fsp: 3 }).notNull().default(new Date()),
  }
);

// ============================================================
// darwin_rule_library
// ============================================================
export const darwinRuleLibrary = mysqlTable(
  'darwin_rule_library',
  {
    ruleId:               varchar('rule_id', { length: 30 }).notNull().primaryKey(),
    ruleVersion:          varchar('rule_version', { length: 10 }).notNull().default('1.0.0'),
    familyId:             varchar('family_id', { length: 10 }).notNull(),
    title:                varchar('title', { length: 200 }).notNull(),
    marketMechanism:      text('market_mechanism').notNull(),
    exactTrigger:         text('exact_trigger').notNull(),
    context:              text('context').notNull(),
    timeframe:            varchar('timeframe', { length: 20 }).notNull(),
    session:              varchar('session', { length: 50 }).notNull(),
    direction:            mysqlEnum('direction', ['LONG', 'SHORT', 'BOTH']).notNull().default('BOTH'),
    minimumSample:        int('minimum_sample').notNull().default(50),
    forwardHorizons:      json('forward_horizons').notNull(),
    outcomeMeasures:      json('outcome_measures').notNull(),
    conditionSignature:   varchar('condition_signature', { length: 64 }).notNull(),
    dataRequirements:     text('data_requirements'),
    knownLimitations:     text('known_limitations'),
    status:               mysqlEnum('status', ['ACTIVE', 'INACTIVE', 'BLOCKED', 'DEPRECATED']).notNull().default('INACTIVE'),
    createdAt:            datetime('created_at', { fsp: 3 }).notNull().default(new Date()),
  },
  (table) => ({
    idxFamilyStatus: index('idx_family_status').on(table.familyId, table.status),
  })
);

// ============================================================
// darwin_feature_snapshots
// ============================================================
export const darwinFeatureSnapshots = mysqlTable(
  'darwin_feature_snapshots',
  {
    featureSnapshotId:   bigint('feature_snapshot_id', { mode: 'number', unsigned: true }).notNull().autoincrement().primaryKey(),
    sourceEventId:       bigint('source_event_id', { mode: 'number', unsigned: true }),
    marketTimestamp:     datetime('market_timestamp', { fsp: 3 }).notNull(),
    instrument:          varchar('instrument', { length: 20 }).notNull().default('MNQ'),
    contract:            varchar('contract', { length: 20 }).notNull(),
    timeframe:           mysqlEnum('timeframe', ['1m', '5m', '15m', '30m', '60m']).notNull(),
    featureVersion:      varchar('feature_version', { length: 20 }).notNull().default('1.0.0'),
    featuresJson:        json('features_json').notNull(),
    dataQualityStatus:   mysqlEnum('data_quality_status', ['OK', 'STALE', 'MISSING', 'ROLL']).notNull().default('OK'),
    createdAt:           datetime('created_at', { fsp: 3 }).notNull().default(new Date()),
  },
  (table) => ({
    uqTsTfContract: uniqueIndex('uq_ts_tf_contract').on(table.marketTimestamp, table.timeframe, table.contract),
    idxTsTf:        index('idx_ts_tf').on(table.marketTimestamp, table.timeframe),
    idxContractTs:  index('idx_contract_ts').on(table.contract, table.marketTimestamp),
  })
);

// ============================================================
// darwin_hypotheses
// ============================================================
export const darwinHypotheses = mysqlTable(
  'darwin_hypotheses',
  {
    hypothesisId:              varchar('hypothesis_id', { length: 40 }).notNull().primaryKey(),
    hypothesisFamily:          varchar('hypothesis_family', { length: 10 }).notNull(),
    hypothesisFamilyK:         int('hypothesis_family_k').notNull().default(1),
    title:                     varchar('title', { length: 300 }).notNull(),
    mechanismRationale:        text('mechanism_rationale').notNull(),
    triggerCondition:          text('trigger_condition').notNull(),
    contextCondition:          text('context_condition').notNull(),
    outcomeDefinition:         text('outcome_definition').notNull(),
    forwardHorizons:           json('forward_horizons').notNull(),
    direction:                 mysqlEnum('direction', ['LONG', 'SHORT', 'BOTH']).notNull(),
    timeframe:                 varchar('timeframe', { length: 20 }).notNull(),
    session:                   varchar('session', { length: 50 }).notNull(),
    regime:                    varchar('regime', { length: 50 }),
    minimumSample:             int('minimum_sample').notNull().default(50),
    minimumIndependentSessions: int('minimum_independent_sessions').notNull().default(5),
    dataset:                   varchar('dataset', { length: 100 }),
    datasetSha:                varchar('dataset_sha', { length: 64 }),
    costModel:                 json('cost_model'),
    validationPlan:            text('validation_plan'),
    nullHypothesis:            text('null_hypothesis').notNull(),
    alternativeHypothesis:     text('alternative_hypothesis').notNull(),
    conditionSignature:        varchar('condition_signature', { length: 64 }).notNull(),
    parentHypothesisId:        varchar('parent_hypothesis_id', { length: 40 }),
    parentFindingId:           varchar('parent_finding_id', { length: 40 }),
    sourceObservationIds:      json('source_observation_ids'),
    priorMemoryMatchIds:       json('prior_memory_match_ids'),
    priorityScore:             decimal('priority_score', { precision: 5, scale: 2 }).notNull().default('0.00'),
    priorityLevel:             mysqlEnum('priority_level', ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL_REVIEW']).notNull().default('MEDIUM'),
    ruleId:                    varchar('rule_id', { length: 30 }),
    edgeDirection:             mysqlEnum('edge_direction', ['POSITIVE', 'NEGATIVE', 'NEUTRAL']).notNull().default('POSITIVE'),
    noTradeFilterCandidate:    boolean('no_trade_filter_candidate').notNull().default(false),
    status:                    mysqlEnum('status', [
                                 'OBSERVED', 'HYPOTHESIS_CREATED', 'QUEUED', 'TESTING',
                                 'REJECTED', 'INCONCLUSIVE', 'PROMISING',
                                 'INTERNAL_VALIDATION', 'PROSPECTIVE_VALIDATION',
                                 'SUPPORTED', 'DEGRADED', 'RETIRED', 'SUPERSEDED',
                               ]).notNull().default('HYPOTHESIS_CREATED'),
    rejectionReason:           varchar('rejection_reason', { length: 100 }),
    refinementDepth:           int('refinement_depth').notNull().default(0),
    createdAt:                 datetime('created_at', { fsp: 3 }).notNull().default(new Date()),
    updatedAt:                 datetime('updated_at', { fsp: 3 }).notNull().default(new Date()),
  },
  (table) => ({
    uqConditionSig:  uniqueIndex('uq_condition_sig').on(table.conditionSignature),
    idxFamilyStatus: index('idx_family_status').on(table.hypothesisFamily, table.status),
    idxPriority:     index('idx_priority').on(table.priorityLevel, table.priorityScore),
    idxRule:         index('idx_rule').on(table.ruleId),
  })
);

// ============================================================
// darwin_experiments
// ============================================================
export const darwinExperimentsEdge = mysqlTable(
  'darwin_experiments',
  {
    experimentId:        varchar('experiment_id', { length: 40 }).notNull().primaryKey(),
    hypothesisId:        varchar('hypothesis_id', { length: 40 }).notNull(),
    stage:               mysqlEnum('stage', [
                           'DISCOVERY',
                           'CHRONOLOGICAL_VALIDATION',
                           'WALK_FORWARD',
                           'ROBUSTNESS',
                           'PROSPECTIVE_SHADOW',
                         ]).notNull(),
    datasetPeriodStart:  date('dataset_period_start').notNull(),
    datasetPeriodEnd:    date('dataset_period_end').notNull(),
    datasetSha:          varchar('dataset_sha', { length: 64 }),
    parametersJson:      json('parameters_json').notNull(),
    resultsJson:         json('results_json'),
    sampleSize:          int('sample_size'),
    rawPValue:           decimal('raw_p_value', { precision: 10, scale: 6 }),
    bhAdjustedPValue:    decimal('bh_adjusted_p_value', { precision: 10, scale: 6 }),
    expectancy:          decimal('expectancy', { precision: 10, scale: 4 }),
    profitFactor:        decimal('profit_factor', { precision: 10, scale: 4 }),
    winRate:             decimal('win_rate', { precision: 5, scale: 4 }),
    bootstrapCiLower:    decimal('bootstrap_ci_lower', { precision: 10, scale: 4 }),
    bootstrapCiUpper:    decimal('bootstrap_ci_upper', { precision: 10, scale: 4 }),
    status:              mysqlEnum('status', ['QUEUED', 'RUNNING', 'COMPLETE', 'FAILED']).notNull().default('QUEUED'),
    classification:      mysqlEnum('classification', ['REJECTED', 'INCONCLUSIVE', 'PROMISING', 'SUPPORTED']),
    rejectionReason:     varchar('rejection_reason', { length: 100 }),
    createdAt:           datetime('created_at', { fsp: 3 }).notNull().default(new Date()),
    completedAt:         datetime('completed_at', { fsp: 3 }),
  },
  (table) => ({
    idxHypothesisStage: index('idx_hypothesis_stage').on(table.hypothesisId, table.stage),
    idxStatus:          index('idx_status').on(table.status),
  })
);

// ============================================================
// darwin_research_memory (new structured version)
// ============================================================
export const darwinResearchMemoryEdge = mysqlTable(
  'darwin_research_memory_edge',
  {
    memoryId:              varchar('memory_id', { length: 40 }).notNull().primaryKey(),
    hypothesisId:          varchar('hypothesis_id', { length: 40 }).notNull(),
    conditionSignature:    varchar('condition_signature', { length: 64 }).notNull(),
    hypothesisFamily:      varchar('hypothesis_family', { length: 10 }).notNull(),
    hypothesisFamilyK:     int('hypothesis_family_k').notNull(),
    timeframe:             varchar('timeframe', { length: 20 }).notNull(),
    session:               varchar('session', { length: 50 }).notNull(),
    direction:             mysqlEnum('direction', ['LONG', 'SHORT', 'BOTH']).notNull(),
    regime:                varchar('regime', { length: 50 }),
    forwardHorizons:       json('forward_horizons').notNull(),
    datasetPeriodStart:    date('dataset_period_start'),
    datasetPeriodEnd:      date('dataset_period_end'),
    outcomeDefinition:     text('outcome_definition'),
    parameterVersion:      varchar('parameter_version', { length: 20 }),
    classification:        varchar('classification', { length: 30 }),
    rejectionReason:       varchar('rejection_reason', { length: 100 }),
    refinementCount:       int('refinement_count').notNull().default(0),
    parentMemoryId:        varchar('parent_memory_id', { length: 40 }),
    keyFindingsSummary:    text('key_findings_summary'),
    createdAt:             datetime('created_at', { fsp: 3 }).notNull().default(new Date()),
    updatedAt:             datetime('updated_at', { fsp: 3 }).notNull().default(new Date()),
  },
  (table) => ({
    idxConditionSig: index('idx_condition_sig').on(table.conditionSignature),
    idxFamily:       index('idx_family').on(table.hypothesisFamily),
    idxHypothesis:   index('idx_hypothesis').on(table.hypothesisId),
  })
);

// ============================================================
// darwin_edge_decay_monitor
// ============================================================
export const darwinEdgeDecayMonitor = mysqlTable(
  'darwin_edge_decay_monitor',
  {
    monitorId:                  bigint('monitor_id', { mode: 'number', unsigned: true }).notNull().autoincrement().primaryKey(),
    hypothesisId:               varchar('hypothesis_id', { length: 40 }).notNull(),
    windowStart:                date('window_start').notNull(),
    windowEnd:                  date('window_end').notNull(),
    rollingExpectancy:          decimal('rolling_expectancy', { precision: 10, scale: 4 }),
    rollingWinRate:             decimal('rolling_win_rate', { precision: 5, scale: 4 }),
    rollingProfitFactor:        decimal('rolling_profit_factor', { precision: 10, scale: 4 }),
    signalFrequency:            decimal('signal_frequency', { precision: 10, scale: 4 }),
    mfeAvg:                     decimal('mfe_avg', { precision: 10, scale: 4 }),
    maeAvg:                     decimal('mae_avg', { precision: 10, scale: 4 }),
    regimeMix:                  json('regime_mix'),
    sessionMix:                 json('session_mix'),
    costDrift:                  decimal('cost_drift', { precision: 10, scale: 4 }),
    slippageDrift:              decimal('slippage_drift', { precision: 10, scale: 4 }),
    ciLower:                    decimal('ci_lower', { precision: 10, scale: 4 }),
    ciUpper:                    decimal('ci_upper', { precision: 10, scale: 4 }),
    predictionIntervalBreaches: int('prediction_interval_breaches').notNull().default(0),
    decayStatus:                mysqlEnum('decay_status', ['STABLE', 'WATCH', 'DEGRADED', 'RETIRED']).notNull().default('STABLE'),
    createdAt:                  datetime('created_at', { fsp: 3 }).notNull().default(new Date()),
  },
  (table) => ({
    idxHypothesisWindow: index('idx_hypothesis_window').on(table.hypothesisId, table.windowStart),
  })
);

// ============================================================
// darwin_daily_hypothesis_queue
// ============================================================
export const darwinDailyHypothesisQueue = mysqlTable(
  'darwin_daily_hypothesis_queue',
  {
    queueId:              bigint('queue_id', { mode: 'number', unsigned: true }).notNull().autoincrement().primaryKey(),
    queueDate:            date('queue_date').notNull(),
    queueJson:            json('queue_json').notNull(),
    reportMd:             text('report_md'),
    hypothesesCreated:    int('hypotheses_created').notNull().default(0),
    hypothesesRejected:   int('hypotheses_rejected').notNull().default(0),
    experimentsQueued:    int('experiments_queued').notNull().default(0),
    experimentsCompleted: int('experiments_completed').notNull().default(0),
    promisingFindings:    int('promising_findings').notNull().default(0),
    familiesResearched:   json('families_researched'),
    starvationRiskFamilies: json('starvation_risk_families'),
    dataBlockers:         json('data_blockers'),
    createdAt:            datetime('created_at', { fsp: 3 }).notNull().default(new Date()),
  },
  (table) => ({
    uqQueueDate: uniqueIndex('uq_queue_date').on(table.queueDate),
  })
);

// ============================================================
// darwin_experiment_budget_log
// ============================================================
export const darwinExperimentBudgetLog = mysqlTable(
  'darwin_experiment_budget_log',
  {
    logId:                  bigint('log_id', { mode: 'number', unsigned: true }).notNull().autoincrement().primaryKey(),
    logDate:                date('log_date').notNull(),
    hypothesesCreated:      int('hypotheses_created').notNull().default(0),
    hypothesesRejected:     int('hypotheses_rejected').notNull().default(0),
    experimentsStarted:     int('experiments_started').notNull().default(0),
    experimentsCompleted:   int('experiments_completed').notNull().default(0),
    budgetBreaches:         int('budget_breaches').notNull().default(0),
    postHocChanges:         int('post_hoc_changes').notNull().default(0),
    unregisteredExperiments: int('unregistered_experiments').notNull().default(0),
    runawayLoops:           int('runaway_loops').notNull().default(0),
    createdAt:              datetime('created_at', { fsp: 3 }).notNull().default(new Date()),
  },
  (table) => ({
    uqLogDate: uniqueIndex('uq_log_date').on(table.logDate),
  })
);

// ============================================================
// Type exports
// ============================================================
export type DarwinHypothesis = typeof darwinHypotheses.$inferSelect;
export type InsertDarwinHypothesis = typeof darwinHypotheses.$inferInsert;
export type DarwinExperimentEdge = typeof darwinExperimentsEdge.$inferSelect;
export type InsertDarwinExperimentEdge = typeof darwinExperimentsEdge.$inferInsert;
export type DarwinRuleLibrary = typeof darwinRuleLibrary.$inferSelect;
export type InsertDarwinRuleLibrary = typeof darwinRuleLibrary.$inferInsert;
export type DarwinFeatureSnapshot = typeof darwinFeatureSnapshots.$inferSelect;
export type InsertDarwinFeatureSnapshot = typeof darwinFeatureSnapshots.$inferInsert;
export type DarwinEdgeDecayMonitor = typeof darwinEdgeDecayMonitor.$inferSelect;
export type InsertDarwinEdgeDecayMonitor = typeof darwinEdgeDecayMonitor.$inferInsert;
export type DarwinResearchCoverageRegistry = typeof darwinResearchCoverageRegistry.$inferSelect;
