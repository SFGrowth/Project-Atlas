-- Sprint 123A.1 Foundation Tables Migration
-- Authorised by Gate G0 approval (Phil, 2026-07-18)
-- Branch: sprint/123a-1-foundation
--
-- IMPORTANT: This migration creates schema only.
-- No data is written until Sprint 123A.3 (DATABENTO_SHADOW mode).
-- MARKET_DATA_AUTHORITY = TRADINGVIEW_ONLY remains the default.
-- Do NOT run this migration against the live production database
-- without Phil's explicit written approval at Gate G1.
--
-- Tables created:
--   atlas_bars_1m                    (Bar Builder — Sprint 123A.3)
--   atlas_bars_5m                    (Five-Min Aggregator — Sprint 123A.3)
--   atlas_canonical_bars             (Canonical Router — Sprint 123A.1+)
--   atlas_contract_rolls             (Contract Roll Manager — Sprint 123A.3)
--   atlas_parity_reports             (Parity Monitor — Sprint 123A.4)
--   atlas_chart_annotations          (AtlasLiveChart — Sprint 123A.4)
--   atlas_consumer_processing_ledger (Canonical Router — effective-once)

CREATE TABLE `atlas_bars_1m` (
  `id`                          BIGINT AUTO_INCREMENT PRIMARY KEY,
  `source`                      VARCHAR(20) NOT NULL DEFAULT 'DATABENTO',
  `dataset`                     VARCHAR(50) NOT NULL,
  `raw_symbol`                  VARCHAR(50) NOT NULL,
  `instrument_id`               BIGINT NOT NULL,
  `bar_open_ts_ms`              BIGINT NOT NULL,
  `bar_close_ts_ms`             BIGINT NOT NULL,
  `open_price_pts100`           BIGINT,
  `high_price_pts100`           BIGINT,
  `low_price_pts100`            BIGINT,
  `close_price_pts100`          BIGINT,
  `volume_contracts`            BIGINT NOT NULL DEFAULT 0,
  `trade_count`                 INT NOT NULL DEFAULT 0,
  `bar_type`                    VARCHAR(30) NOT NULL COMMENT 'LIVE_CONFIRMED|SYNTHETIC_NO_TRADE_BAR|UNRESOLVED|RECOVERED',
  `reconciled_against_ohlcv`    BOOLEAN NOT NULL DEFAULT FALSE,
  `reconciliation_delta_pts100` BIGINT,
  `revision`                    INT NOT NULL DEFAULT 0,
  `mapping_version`             VARCHAR(50),
  `atlas_ts_ms`                 BIGINT NOT NULL,
  `created_at`                  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_bars_1m_symbol_open` (`raw_symbol`, `bar_open_ts_ms`),
  INDEX `idx_bars_1m_open_ts` (`bar_open_ts_ms`)
);

CREATE TABLE `atlas_bars_5m` (
  `id`                   BIGINT AUTO_INCREMENT PRIMARY KEY,
  `source`               VARCHAR(20) NOT NULL DEFAULT 'DATABENTO',
  `dataset`              VARCHAR(50) NOT NULL,
  `raw_symbol`           VARCHAR(50) NOT NULL,
  `instrument_id`        BIGINT NOT NULL,
  `bar_open_ts_ms`       BIGINT NOT NULL,
  `bar_close_ts_ms`      BIGINT NOT NULL,
  `open_price_pts100`    BIGINT,
  `high_price_pts100`    BIGINT,
  `low_price_pts100`     BIGINT,
  `close_price_pts100`   BIGINT,
  `volume_contracts`     BIGINT NOT NULL DEFAULT 0,
  `bar_type`             VARCHAR(30) NOT NULL COMMENT 'CANONICAL_CONFIRMED|CONTAINS_SYNTHETIC|CONTAINS_UNRESOLVED|RECOVERED',
  `minute_bars_included` INT NOT NULL DEFAULT 0,
  `contains_synthetic`   BOOLEAN NOT NULL DEFAULT FALSE,
  `contains_unresolved`  BOOLEAN NOT NULL DEFAULT FALSE,
  `revision`             INT NOT NULL DEFAULT 0,
  `mapping_version`      VARCHAR(50),
  `atlas_ts_ms`          BIGINT NOT NULL,
  `created_at`           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_bars_5m_symbol_open` (`raw_symbol`, `bar_open_ts_ms`),
  INDEX `idx_bars_5m_open_ts` (`bar_open_ts_ms`)
);

CREATE TABLE `atlas_canonical_bars` (
  `id`                        BIGINT AUTO_INCREMENT PRIMARY KEY,
  `authority_source`          VARCHAR(30) NOT NULL COMMENT 'TRADINGVIEW|DATABENTO',
  `authority_mode`            VARCHAR(40) NOT NULL COMMENT 'TRADINGVIEW_ONLY|DATABENTO_SHADOW|DATABENTO_CHART_AUTHORITY|DATABENTO_LEARNING_AUTHORITY',
  `source`                    VARCHAR(20) NOT NULL,
  `dataset`                   VARCHAR(50),
  `raw_symbol`                VARCHAR(50) NOT NULL,
  `instrument_id`             BIGINT,
  `bar_open_ts_ms`            BIGINT NOT NULL,
  `bar_close_ts_ms`           BIGINT NOT NULL,
  `open`                      DECIMAL(12,4) NOT NULL,
  `high`                      DECIMAL(12,4) NOT NULL,
  `low`                       DECIMAL(12,4) NOT NULL,
  `close`                     DECIMAL(12,4) NOT NULL,
  `volume`                    BIGINT NOT NULL DEFAULT 0,
  `bar_type`                  VARCHAR(30) NOT NULL DEFAULT 'LIVE_CONFIRMED',
  `dispatched_to_process_bar` BOOLEAN NOT NULL DEFAULT FALSE,
  `dispatched_to_post_bar_auto` BOOLEAN NOT NULL DEFAULT FALSE,
  `dispatch_ts_ms`            BIGINT,
  `revision`                  INT NOT NULL DEFAULT 0,
  `atlas_ts_ms`               BIGINT NOT NULL,
  `created_at`                TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE INDEX `idx_canonical_bars_symbol_open` (`raw_symbol`, `bar_open_ts_ms`),
  INDEX `idx_canonical_bars_open_ts` (`bar_open_ts_ms`)
);

CREATE TABLE `atlas_contract_rolls` (
  `id`              BIGINT AUTO_INCREMENT PRIMARY KEY,
  `dataset`         VARCHAR(50) NOT NULL,
  `from_symbol`     VARCHAR(50) NOT NULL,
  `to_symbol`       VARCHAR(50) NOT NULL,
  `instrument_id`   BIGINT NOT NULL,
  `roll_ts_ms`      BIGINT NOT NULL,
  `mapping_version` VARCHAR(50),
  `detected_by`     VARCHAR(30) NOT NULL DEFAULT 'CONTRACT_ROLL_MANAGER',
  `atlas_ts_ms`     BIGINT NOT NULL,
  `created_at`      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_contract_rolls_ts` (`roll_ts_ms`)
);

CREATE TABLE `atlas_parity_reports` (
  `id`                       BIGINT AUTO_INCREMENT PRIMARY KEY,
  `report_date`              VARCHAR(10) NOT NULL COMMENT 'YYYY-MM-DD',
  `section_a_composite_score` DECIMAL(6,4),
  `section_a_pass`           BOOLEAN,
  `section_b_parity_score`   DECIMAL(6,4),
  `section_b_pass`           BOOLEAN,
  `gate_g4_pass`             BOOLEAN NOT NULL DEFAULT FALSE,
  `bars_evaluated`           INT NOT NULL DEFAULT 0,
  `bars_excluded`            INT NOT NULL DEFAULT 0,
  `bars_matched`             INT NOT NULL DEFAULT 0,
  `report_json`              JSON,
  `authority_mode`           VARCHAR(40) NOT NULL,
  `generated_at`             BIGINT NOT NULL,
  `created_at`               TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE INDEX `idx_parity_reports_date` (`report_date`)
);

CREATE TABLE `atlas_chart_annotations` (
  `id`              BIGINT AUTO_INCREMENT PRIMARY KEY,
  `annotation_type` VARCHAR(30) NOT NULL COMMENT 'CONTRACT_ROLL|AUTHORITY_CHANGE|FEED_HEALTH|PARITY_ALERT',
  `bar_open_ts_ms`  BIGINT NOT NULL,
  `label`           VARCHAR(100) NOT NULL,
  `detail`          TEXT,
  `severity`        VARCHAR(10) NOT NULL DEFAULT 'INFO' COMMENT 'INFO|WARN|ERROR',
  `created_at`      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_chart_annotations_ts` (`bar_open_ts_ms`)
);

CREATE TABLE `atlas_consumer_processing_ledger` (
  `id`                    BIGINT AUTO_INCREMENT PRIMARY KEY,
  `consumer_name`         VARCHAR(50) NOT NULL,
  `consumer_version`      INT NOT NULL DEFAULT 1,
  `canonical_event_id`    VARCHAR(200) NOT NULL,
  `processed_at`          BIGINT NOT NULL,
  `processing_duration_ms` INT,
  `outcome`               VARCHAR(10) NOT NULL DEFAULT 'OK' COMMENT 'OK|ERROR|SKIPPED',
  `error_detail`          TEXT,
  `created_at`            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE INDEX `idx_ledger_consumer_event` (`consumer_name`, `consumer_version`, `canonical_event_id`),
  INDEX `idx_ledger_processed_at` (`processed_at`)
);

-- ─── atlas_ticks ─────────────────────────────────────────────────────────────
-- Raw tick data from Databento (Sprint 123A.3+)
-- In TRADINGVIEW_ONLY mode this table is empty.
CREATE TABLE `atlas_ticks` (
  `id`                BIGINT AUTO_INCREMENT PRIMARY KEY,
  `source`            VARCHAR(20) NOT NULL DEFAULT 'DATABENTO',
  `dataset`           VARCHAR(50) NOT NULL,
  `raw_symbol`        VARCHAR(50) NOT NULL,
  `instrument_id`     BIGINT NOT NULL,
  `ts_event_ms`       BIGINT NOT NULL,
  `price_pts100`      BIGINT,
  `size`              INT,
  `side`              CHAR(1),
  `atlas_ts_ms`       BIGINT NOT NULL,
  INDEX `idx_atlas_ticks_symbol_ts` (`raw_symbol`, `ts_event_ms`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── atlas_feed_health_log ───────────────────────────────────────────────────
-- Feed health state transitions from the Feed Health Monitor
CREATE TABLE `atlas_feed_health_log` (
  `id`                BIGINT AUTO_INCREMENT PRIMARY KEY,
  `feed_source`       VARCHAR(20) NOT NULL,
  `state`             VARCHAR(30) NOT NULL,
  `previous_state`    VARCHAR(30),
  `message`           TEXT,
  `consecutive_failures` INT NOT NULL DEFAULT 0,
  `last_success_bar_ts_ms` BIGINT,
  `atlas_ts_ms`       BIGINT NOT NULL,
  INDEX `idx_atlas_feed_health_source_ts` (`feed_source`, `atlas_ts_ms`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
