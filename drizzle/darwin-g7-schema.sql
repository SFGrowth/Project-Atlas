-- ============================================================================
-- DARWIN G7 Schema Migration — Sprint 123A.7 / Gate G7
-- Autonomous Operations Persistence
--
-- Creates 7 new tables for autonomous research operations:
--   1. darwin_job_definitions       — canonical job type registry (J1-J7)
--   2. darwin_job_run_history       — per-run execution records with metrics
--   3. darwin_feature_validation_log — feature extraction quality log
--   4. darwin_strategy_monitoring_snapshots — rolling metrics snapshots
--   5. darwin_experiment_records    — DARWIN experiment lifecycle records
--   6. darwin_daily_reports         — DARWIN daily research reports
--   7. darwin_failed_job_retry_queue — failed jobs awaiting retry
--
-- Authority: DATABENTO_LEARNING_AUTHORITY (shadow mode)
-- liveChartAffected: false — permanent
-- ============================================================================

-- ─── 1. darwin_job_definitions ───────────────────────────────────────────────
-- Canonical registry of the 7 DARWIN job types (J1-J7).
-- Seeded on first run. Not modified at runtime.

CREATE TABLE IF NOT EXISTS darwin_job_definitions (
  id                      INT AUTO_INCREMENT PRIMARY KEY,
  job_type                VARCHAR(8)   NOT NULL UNIQUE,  -- J1 | J2 | J3 | J4 | J5 | J6 | J7
  description             VARCHAR(255) NOT NULL,
  schedule_expression     VARCHAR(128) NOT NULL,         -- human-readable schedule
  max_duration_ms         INT          NOT NULL,         -- timeout ceiling
  max_concurrent          INT          NOT NULL DEFAULT 1,
  live_chart_affected     TINYINT(1)   NOT NULL DEFAULT 0,  -- ALWAYS 0
  enabled                 TINYINT(1)   NOT NULL DEFAULT 1,
  created_at              TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at              TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT chk_live_chart_affected CHECK (live_chart_affected = 0)
);

-- Seed the 7 job definitions
INSERT IGNORE INTO darwin_job_definitions
  (job_type, description, schedule_expression, max_duration_ms, max_concurrent, live_chart_affected)
VALUES
  ('J1', 'Observation recording — process unrecorded live bars from atlas_bars_1m',
   'every 5 minutes (triggered by bar arrival)', 120000, 2, 0),
  ('J2', 'Outcome labelling — compute forward returns for observations 20+ bars old',
   'every 15 minutes', 60000, 1, 0),
  ('J3', 'Strategy monitoring — compute rolling metrics and lifecycle recommendations',
   'daily at 21:00 UTC (after RTH close)', 300000, 1, 0),
  ('J4', 'Pattern discovery experiment — run next bounded experiment from priority queue',
   'weekly, Monday 22:00 UTC', 600000, 1, 0),
  ('J5', 'Portfolio gap review — update gap registry and identify new research priorities',
   'weekly, Friday 22:00 UTC', 300000, 1, 0),
  ('J6', 'DARWIN daily report — summarise observations, experiments, and recommendations',
   'daily at 22:00 UTC', 120000, 1, 0),
  ('J7', 'Roll-window policy refresh — update quarterly roll dates for next 12 months',
   'monthly, first Sunday 23:00 UTC', 60000, 1, 0);

-- ─── 2. darwin_job_run_history ───────────────────────────────────────────────
-- Per-run execution records. One row per job execution.
-- Provides full audit trail of all autonomous research activity.

CREATE TABLE IF NOT EXISTS darwin_job_run_history (
  id                      INT AUTO_INCREMENT PRIMARY KEY,
  run_id                  VARCHAR(64)  NOT NULL UNIQUE,
  job_type                VARCHAR(8)   NOT NULL,         -- J1-J7
  status                  ENUM('PENDING','RUNNING','COMPLETED','FAILED','SKIPPED','TIMEOUT')
                          NOT NULL DEFAULT 'PENDING',
  started_at              BIGINT,                        -- epoch ms
  completed_at            BIGINT,                        -- epoch ms
  duration_ms             INT,
  triggered_by            VARCHAR(32)  NOT NULL DEFAULT 'SCHEDULER',  -- SCHEDULER | MANUAL | TIMER
  result_summary          TEXT,                          -- JSON summary of result
  error_message           TEXT,
  rows_processed          INT,
  bars_observed           INT,
  live_chart_affected     TINYINT(1)   NOT NULL DEFAULT 0,
  service_pid             INT,                           -- PID of the service that ran the job
  node_version            VARCHAR(32),
  code_sha                VARCHAR(40),                   -- git SHA at time of run
  created_at              TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_job_type (job_type),
  INDEX idx_status (status),
  INDEX idx_started_at (started_at),
  CONSTRAINT chk_run_live_chart_affected CHECK (live_chart_affected = 0)
);

-- ─── 3. darwin_feature_validation_log ────────────────────────────────────────
-- Feature extraction quality log. Records validation results for each
-- observation batch to ensure feature integrity.

CREATE TABLE IF NOT EXISTS darwin_feature_validation_log (
  id                      INT AUTO_INCREMENT PRIMARY KEY,
  validation_id           VARCHAR(64)  NOT NULL UNIQUE,
  bar_timestamp           BIGINT       NOT NULL,         -- epoch ms of the bar
  interval_type           VARCHAR(8)   NOT NULL,         -- '1m' | '5m'
  observation_id          VARCHAR(64),                   -- FK to darwin_observations
  feature_version         VARCHAR(16)  NOT NULL DEFAULT '1.0',

  -- Validation results
  passed                  TINYINT(1)   NOT NULL,
  failure_reason          VARCHAR(255),
  warnings                JSON,                          -- array of warning strings

  -- Feature completeness
  total_features          INT          NOT NULL,
  null_features           INT          NOT NULL DEFAULT 0,
  null_feature_names      JSON,                          -- array of null feature names
  completeness_pct        DECIMAL(5,2) NOT NULL,         -- 0.00-100.00

  -- Data quality
  ohlcv_valid             TINYINT(1)   NOT NULL,
  regime_valid            TINYINT(1)   NOT NULL,
  session_valid           TINYINT(1)   NOT NULL,
  history_sufficient      TINYINT(1)   NOT NULL,
  bars_available          INT,
  bars_required           INT,

  live_chart_affected     TINYINT(1)   NOT NULL DEFAULT 0,
  created_at              TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_bar_timestamp (bar_timestamp),
  INDEX idx_passed (passed),
  CONSTRAINT chk_fvl_live_chart_affected CHECK (live_chart_affected = 0)
);

-- ─── 4. darwin_strategy_monitoring_snapshots ─────────────────────────────────
-- Rolling metrics snapshots for each strategy. One row per strategy per run.
-- Provides historical record of strategy health over time.

CREATE TABLE IF NOT EXISTS darwin_strategy_monitoring_snapshots (
  id                      INT AUTO_INCREMENT PRIMARY KEY,
  snapshot_id             VARCHAR(64)  NOT NULL UNIQUE,
  strategy_id             VARCHAR(16)  NOT NULL,         -- A1 | A3 | B1 | SB1 | ORB-1
  run_id                  VARCHAR(64)  NOT NULL,         -- FK to darwin_job_run_history
  window_days             INT          NOT NULL,         -- 30 | 60 | 90

  -- Lifecycle
  lifecycle_status        VARCHAR(32)  NOT NULL,         -- PAPER_TRADING | CANDIDATE | etc.
  recommendation          VARCHAR(32)  NOT NULL,         -- NO_ACTION | WATCH_CLOSELY | etc.
  requires_human_approval TINYINT(1)   NOT NULL DEFAULT 0,
  triggered_rules         JSON,                          -- array of triggered rule strings
  reason                  TEXT,

  -- Rolling metrics
  n_trades                INT          NOT NULL DEFAULT 0,
  win_rate                DECIMAL(6,4) NOT NULL DEFAULT 0,
  expectancy_pts          DECIMAL(10,4) NOT NULL DEFAULT 0,
  net_pnl_dollars         DECIMAL(12,2) NOT NULL DEFAULT 0,
  profit_factor           DECIMAL(8,4) NOT NULL DEFAULT 0,
  sharpe_annualised       DECIMAL(8,4) NOT NULL DEFAULT 0,
  max_drawdown_dollars    DECIMAL(12,2) NOT NULL DEFAULT 0,
  max_loss_streak         INT          NOT NULL DEFAULT 0,
  roll_window_trades      INT          NOT NULL DEFAULT 0,
  roll_excluded_trades    INT          NOT NULL DEFAULT 0,
  roll_excluded_expectancy DECIMAL(10,4) NOT NULL DEFAULT 0,

  live_chart_affected     TINYINT(1)   NOT NULL DEFAULT 0,
  computed_at             BIGINT       NOT NULL,         -- epoch ms
  created_at              TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_strategy_id (strategy_id),
  INDEX idx_computed_at (computed_at),
  INDEX idx_recommendation (recommendation),
  CONSTRAINT chk_sms_live_chart_affected CHECK (live_chart_affected = 0)
);

-- ─── 5. darwin_experiment_records ────────────────────────────────────────────
-- DARWIN experiment lifecycle records. Tracks each experiment from
-- hypothesis through to pass/fail decision.

CREATE TABLE IF NOT EXISTS darwin_experiment_records (
  id                      INT AUTO_INCREMENT PRIMARY KEY,
  experiment_id           VARCHAR(64)  NOT NULL UNIQUE,
  experiment_label        VARCHAR(16)  NOT NULL,         -- EXP-A, EXP-B, ... EXP-M, etc.
  hypothesis              TEXT         NOT NULL,
  behaviour_observed      TEXT         NOT NULL,
  regime                  VARCHAR(64),
  session                 VARCHAR(32),

  -- Statistical gates
  sample_size             INT,
  win_rate                DECIMAL(6,4),
  expectancy_pts          DECIMAL(10,4),
  p_value                 DECIMAL(8,6),
  statistical_gate_passed TINYINT(1)   NOT NULL DEFAULT 0,
  stability_gate_passed   TINYINT(1)   NOT NULL DEFAULT 0,
  novelty_gate_passed     TINYINT(1)   NOT NULL DEFAULT 0,
  all_gates_passed        TINYINT(1)   NOT NULL DEFAULT 0,

  -- Outcome
  outcome                 ENUM('PENDING','FAIL_STATISTICAL','FAIL_STABILITY','FAIL_NOVELTY',
                               'FAIL_SAMPLE_SIZE','PASS_ALL_GATES','ARCHIVED')
                          NOT NULL DEFAULT 'PENDING',
  failure_reason          TEXT,
  conclusion              TEXT,

  -- Metadata
  code_sha                VARCHAR(40)  NOT NULL,
  run_id                  VARCHAR(64),                   -- FK to darwin_job_run_history
  date_range_start        BIGINT,
  date_range_end          BIGINT,
  live_chart_affected     TINYINT(1)   NOT NULL DEFAULT 0,
  created_at              TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at              TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_outcome (outcome),
  INDEX idx_experiment_label (experiment_label),
  CONSTRAINT chk_er_live_chart_affected CHECK (live_chart_affected = 0)
);

-- ─── 6. darwin_daily_reports ─────────────────────────────────────────────────
-- DARWIN daily research reports. One row per trading day.
-- Summarises observations, experiments, and recommendations.

CREATE TABLE IF NOT EXISTS darwin_daily_reports (
  id                      INT AUTO_INCREMENT PRIMARY KEY,
  report_id               VARCHAR(64)  NOT NULL UNIQUE,
  report_date             DATE         NOT NULL UNIQUE,  -- one report per day
  report_type             ENUM('DAILY','WEEKLY','MONTHLY') NOT NULL DEFAULT 'DAILY',

  -- Observation summary
  bars_observed           INT          NOT NULL DEFAULT 0,
  observations_recorded   INT          NOT NULL DEFAULT 0,
  exclusions              INT          NOT NULL DEFAULT 0,
  observation_health      VARCHAR(32)  NOT NULL DEFAULT 'UNKNOWN',

  -- Experiment summary
  experiments_run         INT          NOT NULL DEFAULT 0,
  experiments_passed      INT          NOT NULL DEFAULT 0,
  experiments_failed      INT          NOT NULL DEFAULT 0,
  active_experiments      JSON,                          -- array of experiment IDs

  -- Strategy summary
  strategies_monitored    INT          NOT NULL DEFAULT 0,
  strategies_no_action    INT          NOT NULL DEFAULT 0,
  strategies_watch        INT          NOT NULL DEFAULT 0,
  strategies_demotion     INT          NOT NULL DEFAULT 0,
  strategy_snapshots      JSON,                          -- array of snapshot IDs

  -- Portfolio gaps
  open_gaps               INT          NOT NULL DEFAULT 0,
  high_priority_gaps      INT          NOT NULL DEFAULT 0,

  -- Job execution summary
  jobs_run                INT          NOT NULL DEFAULT 0,
  jobs_failed             INT          NOT NULL DEFAULT 0,
  total_duration_ms       INT          NOT NULL DEFAULT 0,

  -- Recommendations
  top_recommendation      TEXT,
  next_experiment         TEXT,
  notes                   TEXT,

  -- Metadata
  generated_by            VARCHAR(32)  NOT NULL DEFAULT 'DARWIN-SCHEDULER',
  run_id                  VARCHAR(64),
  live_chart_affected     TINYINT(1)   NOT NULL DEFAULT 0,
  created_at              TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at              TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_report_date (report_date),
  CONSTRAINT chk_dr_live_chart_affected CHECK (live_chart_affected = 0)
);

-- ─── 7. darwin_failed_job_retry_queue ────────────────────────────────────────
-- Failed jobs awaiting retry. Bounded queue with max 500 entries.
-- Jobs are retried with exponential backoff.

CREATE TABLE IF NOT EXISTS darwin_failed_job_retry_queue (
  id                      INT AUTO_INCREMENT PRIMARY KEY,
  retry_id                VARCHAR(64)  NOT NULL UNIQUE,
  original_run_id         VARCHAR(64)  NOT NULL,         -- FK to darwin_job_run_history
  job_type                VARCHAR(8)   NOT NULL,         -- J1-J7
  failure_reason          TEXT         NOT NULL,
  retry_count             INT          NOT NULL DEFAULT 0,
  max_retries             INT          NOT NULL DEFAULT 3,
  next_retry_at           BIGINT       NOT NULL,         -- epoch ms
  backoff_ms              INT          NOT NULL DEFAULT 30000,  -- 30s initial
  status                  ENUM('PENDING','RETRYING','RESOLVED','ABANDONED')
                          NOT NULL DEFAULT 'PENDING',
  resolved_run_id         VARCHAR(64),                   -- FK to darwin_job_run_history if resolved
  live_chart_affected     TINYINT(1)   NOT NULL DEFAULT 0,
  created_at              TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at              TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_status (status),
  INDEX idx_next_retry_at (next_retry_at),
  INDEX idx_job_type (job_type),
  CONSTRAINT chk_fjrq_live_chart_affected CHECK (live_chart_affected = 0)
);

-- ─── Verify all 7 tables created ─────────────────────────────────────────────
SELECT table_name, table_rows
FROM information_schema.tables
WHERE table_schema = DATABASE()
  AND table_name IN (
    'darwin_job_definitions',
    'darwin_job_run_history',
    'darwin_feature_validation_log',
    'darwin_strategy_monitoring_snapshots',
    'darwin_experiment_records',
    'darwin_daily_reports',
    'darwin_failed_job_retry_queue'
  )
ORDER BY table_name;
