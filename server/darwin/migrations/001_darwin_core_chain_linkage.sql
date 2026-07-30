-- DARWIN Core Chain Linkage Migration v1.0.0
-- Sprint: darwin-core-observation-to-finding-chain
-- Date: 2026-07-30
-- Idempotent: each ADD COLUMN uses IF NOT EXISTS

-- darwin_candidates linkage columns
ALTER TABLE darwin_candidates ADD COLUMN IF NOT EXISTS source_observation_id VARCHAR(64) NULL;
ALTER TABLE darwin_candidates ADD COLUMN IF NOT EXISTS source_event_id BIGINT NULL;
ALTER TABLE darwin_candidates ADD COLUMN IF NOT EXISTS rule_id VARCHAR(32) NOT NULL DEFAULT 'RULE-J4-001';
ALTER TABLE darwin_candidates ADD COLUMN IF NOT EXISTS rule_version VARCHAR(16) NOT NULL DEFAULT '1.0.0';
ALTER TABLE darwin_candidates ADD COLUMN IF NOT EXISTS condition_signature VARCHAR(255) NULL;
ALTER TABLE darwin_candidates ADD COLUMN IF NOT EXISTS candidate_version INT NOT NULL DEFAULT 1;
ALTER TABLE darwin_candidates ADD COLUMN IF NOT EXISTS prior_candidate_id VARCHAR(64) NULL;
ALTER TABLE darwin_candidates ADD COLUMN IF NOT EXISTS experiment_id VARCHAR(64) NULL;
ALTER TABLE darwin_candidates ADD COLUMN IF NOT EXISTS finding_id VARCHAR(64) NULL;
ALTER TABLE darwin_candidates ADD COLUMN IF NOT EXISTS notification_id INT NULL;

-- darwin_experiment_records linkage columns
ALTER TABLE darwin_experiment_records ADD COLUMN IF NOT EXISTS candidate_id VARCHAR(64) NULL;
ALTER TABLE darwin_experiment_records ADD COLUMN IF NOT EXISTS source_observation_id VARCHAR(64) NULL;
ALTER TABLE darwin_experiment_records ADD COLUMN IF NOT EXISTS source_event_id BIGINT NULL;
ALTER TABLE darwin_experiment_records ADD COLUMN IF NOT EXISTS rule_id VARCHAR(32) NULL;
ALTER TABLE darwin_experiment_records ADD COLUMN IF NOT EXISTS rule_version VARCHAR(16) NULL;
ALTER TABLE darwin_experiment_records ADD COLUMN IF NOT EXISTS bullish_sample_size INT NULL;
ALTER TABLE darwin_experiment_records ADD COLUMN IF NOT EXISTS bearish_sample_size INT NULL;
ALTER TABLE darwin_experiment_records ADD COLUMN IF NOT EXISTS h1_mean_return DECIMAL(10,4) NULL;
ALTER TABLE darwin_experiment_records ADD COLUMN IF NOT EXISTS h2_mean_return DECIMAL(10,4) NULL;
ALTER TABLE darwin_experiment_records ADD COLUMN IF NOT EXISTS h3_mean_return DECIMAL(10,4) NULL;
ALTER TABLE darwin_experiment_records ADD COLUMN IF NOT EXISTS h1_win_rate DECIMAL(6,4) NULL;
ALTER TABLE darwin_experiment_records ADD COLUMN IF NOT EXISTS h2_win_rate DECIMAL(6,4) NULL;
ALTER TABLE darwin_experiment_records ADD COLUMN IF NOT EXISTS ci_lower DECIMAL(10,4) NULL;
ALTER TABLE darwin_experiment_records ADD COLUMN IF NOT EXISTS ci_upper DECIMAL(10,4) NULL;
ALTER TABLE darwin_experiment_records ADD COLUMN IF NOT EXISTS finding_id VARCHAR(64) NULL;

-- darwin_research_memory linkage columns
ALTER TABLE darwin_research_memory ADD COLUMN IF NOT EXISTS experiment_id VARCHAR(64) NULL;
ALTER TABLE darwin_research_memory ADD COLUMN IF NOT EXISTS source_observation_id VARCHAR(64) NULL;
ALTER TABLE darwin_research_memory ADD COLUMN IF NOT EXISTS source_event_id BIGINT NULL;
ALTER TABLE darwin_research_memory ADD COLUMN IF NOT EXISTS rule_id VARCHAR(32) NULL;
ALTER TABLE darwin_research_memory ADD COLUMN IF NOT EXISTS rule_version VARCHAR(16) NULL;
ALTER TABLE darwin_research_memory ADD COLUMN IF NOT EXISTS notification_id INT NULL;
ALTER TABLE darwin_research_memory ADD COLUMN IF NOT EXISTS telegram_message_id BIGINT NULL;
ALTER TABLE darwin_research_memory ADD COLUMN IF NOT EXISTS daily_report_path VARCHAR(255) NULL;
ALTER TABLE darwin_research_memory ADD COLUMN IF NOT EXISTS github_commit_sha VARCHAR(40) NULL;

-- darwin_candidate_observations junction table
CREATE TABLE IF NOT EXISTS darwin_candidate_observations (
  id INT NOT NULL AUTO_INCREMENT,
  candidate_id VARCHAR(64) NOT NULL,
  observation_id VARCHAR(64) NOT NULL,
  source_event_id BIGINT NULL,
  bar_timestamp BIGINT NOT NULL,
  bar_direction VARCHAR(8) NULL,
  bar_range DECIMAL(10,4) NULL,
  atr DECIMAL(10,4) NULL,
  session VARCHAR(16) NULL,
  volatility_regime VARCHAR(16) NULL,
  linked_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_candidate_observation (candidate_id, observation_id),
  KEY idx_candidate_id (candidate_id),
  KEY idx_observation_id (observation_id),
  KEY idx_bar_timestamp (bar_timestamp)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
