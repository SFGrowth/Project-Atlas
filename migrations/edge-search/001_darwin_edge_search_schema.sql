-- DARWIN Complete Edge-Search Universe — Database Migration
-- Migration: 001_darwin_edge_search_schema.sql
-- Sprint: darwin-complete-edge-search-universe
-- Created: 2026-07-31T01:18:00Z
-- Status: PREPARED — NOT DEPLOYED (deploy only after soak completion and evidence lock)
--
-- DEPLOYMENT ORDER:
--   1. Confirm CURRENT_SOAK_COMPLETED=TRUE
--   2. Confirm CURRENT_SOAK_EVIDENCE_LOCKED=TRUE
--   3. Deploy to staging only (atlas_staging_g4)
--   4. Validate all tables created correctly
--   5. Run integration tests
--   6. Do NOT deploy to production trading authority

USE atlas_staging_g4;

-- ============================================================
-- TABLE: darwin_research_coverage_registry
-- One row per research family (A–X)
-- ============================================================
CREATE TABLE IF NOT EXISTS darwin_research_coverage_registry (
  family_id                   VARCHAR(10) NOT NULL,
  family_name                 VARCHAR(100) NOT NULL,
  family_description          TEXT,
  total_defined_rules         INT NOT NULL DEFAULT 0,
  active_rules                INT NOT NULL DEFAULT 0,
  inactive_rules              INT NOT NULL DEFAULT 0,
  blocked_rules               INT NOT NULL DEFAULT 0,
  tested_hypotheses           INT NOT NULL DEFAULT 0,
  rejected_hypotheses         INT NOT NULL DEFAULT 0,
  inconclusive_hypotheses     INT NOT NULL DEFAULT 0,
  promising_hypotheses        INT NOT NULL DEFAULT 0,
  supported_hypotheses        INT NOT NULL DEFAULT 0,
  last_researched_at          DATETIME(3),
  next_activation_priority    INT NOT NULL DEFAULT 99,
  data_available              BOOLEAN NOT NULL DEFAULT TRUE,
  data_requirements           TEXT,
  blocker                     TEXT,
  status                      ENUM(
                                'DEFINED',
                                'QUEUED_FOR_ACTIVATION',
                                'ACTIVE',
                                'PAUSED',
                                'BLOCKED_DATA_UNAVAILABLE',
                                'RESEARCH_COMPLETE',
                                'REQUIRES_PHIL_APPROVAL'
                              ) NOT NULL DEFAULT 'DEFINED',
  created_at                  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at                  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                                ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (family_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TABLE: darwin_rule_library
-- Frozen causal rule definitions
-- ============================================================
CREATE TABLE IF NOT EXISTS darwin_rule_library (
  rule_id                     VARCHAR(30) NOT NULL,
  rule_version                VARCHAR(10) NOT NULL DEFAULT '1.0.0',
  family_id                   VARCHAR(10) NOT NULL,
  title                       VARCHAR(200) NOT NULL,
  market_mechanism            TEXT NOT NULL,
  exact_trigger               TEXT NOT NULL,
  context                     TEXT NOT NULL,
  timeframe                   VARCHAR(20) NOT NULL,
  session                     VARCHAR(50) NOT NULL,
  direction                   ENUM('LONG','SHORT','BOTH') NOT NULL DEFAULT 'BOTH',
  minimum_sample              INT NOT NULL DEFAULT 50,
  forward_horizons            JSON NOT NULL,
  outcome_measures            JSON NOT NULL,
  condition_signature         VARCHAR(64) NOT NULL,
  data_requirements           TEXT,
  known_limitations           TEXT,
  status                      ENUM('ACTIVE','INACTIVE','BLOCKED','DEPRECATED') NOT NULL DEFAULT 'INACTIVE',
  created_at                  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (rule_id),
  INDEX idx_family_status (family_id, status),
  FOREIGN KEY (family_id) REFERENCES darwin_research_coverage_registry(family_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TABLE: darwin_feature_snapshots
-- Canonical causal feature store — one row per bar per timeframe
-- ============================================================
CREATE TABLE IF NOT EXISTS darwin_feature_snapshots (
  feature_snapshot_id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  source_event_id             BIGINT UNSIGNED,
  market_timestamp            DATETIME(3) NOT NULL,
  instrument                  VARCHAR(20) NOT NULL DEFAULT 'MNQ',
  contract                    VARCHAR(20) NOT NULL,
  timeframe                   ENUM('1m','5m','15m','30m','60m') NOT NULL,
  feature_version             VARCHAR(20) NOT NULL DEFAULT '1.0.0',
  features_json               JSON NOT NULL,
  data_quality_status         ENUM('OK','STALE','MISSING','ROLL') NOT NULL DEFAULT 'OK',
  created_at                  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (feature_snapshot_id),
  UNIQUE KEY uq_ts_tf_contract (market_timestamp, timeframe, contract),
  INDEX idx_ts_tf (market_timestamp, timeframe),
  INDEX idx_contract_ts (contract, market_timestamp)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TABLE: darwin_hypotheses
-- Full hypothesis records with pre-registration fields
-- ============================================================
CREATE TABLE IF NOT EXISTS darwin_hypotheses (
  hypothesis_id               VARCHAR(40) NOT NULL,
  hypothesis_family           VARCHAR(10) NOT NULL,
  hypothesis_family_k         INT NOT NULL DEFAULT 1,
  title                       VARCHAR(300) NOT NULL,
  mechanism_rationale         TEXT NOT NULL,
  trigger_condition           TEXT NOT NULL,
  context_condition           TEXT NOT NULL,
  outcome_definition          TEXT NOT NULL,
  forward_horizons            JSON NOT NULL,
  direction                   ENUM('LONG','SHORT','BOTH') NOT NULL,
  timeframe                   VARCHAR(20) NOT NULL,
  session                     VARCHAR(50) NOT NULL,
  regime                      VARCHAR(50),
  minimum_sample              INT NOT NULL DEFAULT 50,
  minimum_independent_sessions INT NOT NULL DEFAULT 5,
  dataset                     VARCHAR(100),
  dataset_sha                 VARCHAR(64),
  cost_model                  JSON,
  validation_plan             TEXT,
  null_hypothesis             TEXT NOT NULL,
  alternative_hypothesis      TEXT NOT NULL,
  condition_signature         VARCHAR(64) NOT NULL,
  parent_hypothesis_id        VARCHAR(40),
  parent_finding_id           VARCHAR(40),
  source_observation_ids      JSON,
  prior_memory_match_ids      JSON,
  priority_score              DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  priority_level              ENUM('LOW','MEDIUM','HIGH','CRITICAL_REVIEW') NOT NULL DEFAULT 'MEDIUM',
  rule_id                     VARCHAR(30),
  edge_direction              ENUM('POSITIVE','NEGATIVE','NEUTRAL') NOT NULL DEFAULT 'POSITIVE',
  no_trade_filter_candidate   BOOLEAN NOT NULL DEFAULT FALSE,
  status                      ENUM(
                                'OBSERVED','HYPOTHESIS_CREATED','QUEUED','TESTING',
                                'REJECTED','INCONCLUSIVE','PROMISING',
                                'INTERNAL_VALIDATION','PROSPECTIVE_VALIDATION',
                                'SUPPORTED','DEGRADED','RETIRED','SUPERSEDED'
                              ) NOT NULL DEFAULT 'HYPOTHESIS_CREATED',
  rejection_reason            VARCHAR(100),
  refinement_depth            INT NOT NULL DEFAULT 0,
  created_at                  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at                  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                                ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (hypothesis_id),
  UNIQUE KEY uq_condition_sig (condition_signature),
  INDEX idx_family_status (hypothesis_family, status),
  INDEX idx_priority (priority_level, priority_score),
  INDEX idx_rule (rule_id),
  FOREIGN KEY (hypothesis_family) REFERENCES darwin_research_coverage_registry(family_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TABLE: darwin_experiments
-- Experiment records linked to hypotheses
-- ============================================================
CREATE TABLE IF NOT EXISTS darwin_experiments (
  experiment_id               VARCHAR(40) NOT NULL,
  hypothesis_id               VARCHAR(40) NOT NULL,
  stage                       ENUM(
                                'DISCOVERY',
                                'CHRONOLOGICAL_VALIDATION',
                                'WALK_FORWARD',
                                'ROBUSTNESS',
                                'PROSPECTIVE_SHADOW'
                              ) NOT NULL,
  dataset_period_start        DATE NOT NULL,
  dataset_period_end          DATE NOT NULL,
  dataset_sha                 VARCHAR(64),
  parameters_json             JSON NOT NULL,
  results_json                JSON,
  sample_size                 INT,
  raw_p_value                 DECIMAL(10,6),
  bh_adjusted_p_value         DECIMAL(10,6),
  expectancy                  DECIMAL(10,4),
  profit_factor               DECIMAL(10,4),
  win_rate                    DECIMAL(5,4),
  bootstrap_ci_lower          DECIMAL(10,4),
  bootstrap_ci_upper          DECIMAL(10,4),
  status                      ENUM('QUEUED','RUNNING','COMPLETE','FAILED') NOT NULL DEFAULT 'QUEUED',
  classification              ENUM('REJECTED','INCONCLUSIVE','PROMISING','SUPPORTED'),
  rejection_reason            VARCHAR(100),
  created_at                  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  completed_at                DATETIME(3),
  PRIMARY KEY (experiment_id),
  INDEX idx_hypothesis_stage (hypothesis_id, stage),
  INDEX idx_status (status),
  FOREIGN KEY (hypothesis_id) REFERENCES darwin_hypotheses(hypothesis_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TABLE: darwin_research_memory
-- Immutable memory records for all tested hypotheses
-- ============================================================
CREATE TABLE IF NOT EXISTS darwin_research_memory (
  memory_id                   VARCHAR(40) NOT NULL,
  hypothesis_id               VARCHAR(40) NOT NULL,
  condition_signature         VARCHAR(64) NOT NULL,
  hypothesis_family           VARCHAR(10) NOT NULL,
  hypothesis_family_k         INT NOT NULL,
  timeframe                   VARCHAR(20) NOT NULL,
  session                     VARCHAR(50) NOT NULL,
  direction                   ENUM('LONG','SHORT','BOTH') NOT NULL,
  regime                      VARCHAR(50),
  forward_horizons            JSON NOT NULL,
  dataset_period_start        DATE,
  dataset_period_end          DATE,
  outcome_definition          TEXT,
  parameter_version           VARCHAR(20),
  classification              VARCHAR(30),
  rejection_reason            VARCHAR(100),
  refinement_count            INT NOT NULL DEFAULT 0,
  parent_memory_id            VARCHAR(40),
  key_findings_summary        TEXT,
  created_at                  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at                  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                                ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (memory_id),
  INDEX idx_condition_sig (condition_signature),
  INDEX idx_family (hypothesis_family),
  INDEX idx_hypothesis (hypothesis_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TABLE: darwin_edge_decay_monitor
-- Rolling performance tracking for PROMISING+ findings
-- ============================================================
CREATE TABLE IF NOT EXISTS darwin_edge_decay_monitor (
  monitor_id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  hypothesis_id               VARCHAR(40) NOT NULL,
  window_start                DATE NOT NULL,
  window_end                  DATE NOT NULL,
  rolling_expectancy          DECIMAL(10,4),
  rolling_win_rate            DECIMAL(5,4),
  rolling_profit_factor       DECIMAL(10,4),
  signal_frequency            DECIMAL(10,4),
  mfe_avg                     DECIMAL(10,4),
  mae_avg                     DECIMAL(10,4),
  regime_mix                  JSON,
  session_mix                 JSON,
  cost_drift                  DECIMAL(10,4),
  slippage_drift              DECIMAL(10,4),
  ci_lower                    DECIMAL(10,4),
  ci_upper                    DECIMAL(10,4),
  prediction_interval_breaches INT NOT NULL DEFAULT 0,
  decay_status                ENUM('STABLE','WATCH','DEGRADED','RETIRED') NOT NULL DEFAULT 'STABLE',
  created_at                  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (monitor_id),
  INDEX idx_hypothesis_window (hypothesis_id, window_start),
  FOREIGN KEY (hypothesis_id) REFERENCES darwin_hypotheses(hypothesis_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TABLE: darwin_daily_hypothesis_queue
-- Daily research queue records
-- ============================================================
CREATE TABLE IF NOT EXISTS darwin_daily_hypothesis_queue (
  queue_id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  queue_date                  DATE NOT NULL,
  queue_json                  JSON NOT NULL,
  report_md                   LONGTEXT,
  hypotheses_created          INT NOT NULL DEFAULT 0,
  hypotheses_rejected         INT NOT NULL DEFAULT 0,
  experiments_queued          INT NOT NULL DEFAULT 0,
  experiments_completed       INT NOT NULL DEFAULT 0,
  promising_findings          INT NOT NULL DEFAULT 0,
  families_researched         JSON,
  starvation_risk_families    JSON,
  data_blockers               JSON,
  created_at                  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (queue_id),
  UNIQUE KEY uq_queue_date (queue_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TABLE: darwin_experiment_budget_log
-- Daily budget tracking
-- ============================================================
CREATE TABLE IF NOT EXISTS darwin_experiment_budget_log (
  log_id                      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  log_date                    DATE NOT NULL,
  hypotheses_created          INT NOT NULL DEFAULT 0,
  hypotheses_rejected         INT NOT NULL DEFAULT 0,
  experiments_started         INT NOT NULL DEFAULT 0,
  experiments_completed       INT NOT NULL DEFAULT 0,
  budget_breaches             INT NOT NULL DEFAULT 0,
  post_hoc_changes            INT NOT NULL DEFAULT 0,
  unregistered_experiments    INT NOT NULL DEFAULT 0,
  runaway_loops               INT NOT NULL DEFAULT 0,
  created_at                  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (log_id),
  UNIQUE KEY uq_log_date (log_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- SEED: darwin_research_coverage_registry (24 families)
-- ============================================================
INSERT IGNORE INTO darwin_research_coverage_registry
  (family_id, family_name, total_defined_rules, inactive_rules, status, next_activation_priority, data_available)
VALUES
  ('A', 'Price Action', 0, 0, 'QUEUED_FOR_ACTIVATION', 3, TRUE),
  ('B', 'Market Structure', 8, 8, 'QUEUED_FOR_ACTIVATION', 1, TRUE),
  ('C', 'Trend', 3, 3, 'QUEUED_FOR_ACTIVATION', 2, TRUE),
  ('D', 'Mean Reversion', 0, 0, 'DEFINED', 8, TRUE),
  ('E', 'Momentum', 3, 3, 'QUEUED_FOR_ACTIVATION', 4, TRUE),
  ('F', 'Volatility', 4, 4, 'QUEUED_FOR_ACTIVATION', 1, TRUE),
  ('G', 'Volume and Participation', 3, 3, 'QUEUED_FOR_ACTIVATION', 3, TRUE),
  ('H', 'VWAP and Fair Value', 4, 4, 'QUEUED_FOR_ACTIVATION', 2, TRUE),
  ('I', 'Liquidity and Microstructure', 0, 0, 'BLOCKED_DATA_UNAVAILABLE', 99, FALSE),
  ('J', 'Session and Time', 5, 5, 'QUEUED_FOR_ACTIVATION', 2, TRUE),
  ('K', 'Cross-Session Relationships', 0, 0, 'DEFINED', 6, TRUE),
  ('L', 'Regimes', 0, 0, 'DEFINED', 7, TRUE),
  ('M', 'Multi-Timeframe Relationships', 0, 0, 'DEFINED', 7, TRUE),
  ('N', 'Breakouts', 0, 0, 'QUEUED_FOR_ACTIVATION', 3, TRUE),
  ('O', 'Reversals', 3, 3, 'QUEUED_FOR_ACTIVATION', 3, TRUE),
  ('P', 'Entry Quality', 5, 5, 'QUEUED_FOR_ACTIVATION', 2, TRUE),
  ('Q', 'Exit Quality', 0, 0, 'DEFINED', 10, TRUE),
  ('R', 'Asymmetries', 0, 0, 'DEFINED', 9, TRUE),
  ('S', 'Market Cycles', 0, 0, 'DEFINED', 15, TRUE),
  ('T', 'Event Sequences', 0, 0, 'DEFINED', 8, TRUE),
  ('U', 'Cross-Feature Interactions', 0, 0, 'DEFINED', 9, TRUE),
  ('V', 'Negative Edges and No-Trade Conditions', 0, 0, 'QUEUED_FOR_ACTIVATION', 4, TRUE),
  ('W', 'Portfolio and Complementarity', 0, 0, 'DEFINED', 20, FALSE),
  ('X', 'Edge Decay and Edge Emergence', 0, 0, 'DEFINED', 11, TRUE);
