-- Sprint 123A.1 Foundation Tables Migration
-- Authorised by Gate G0 approval (Phil, 2026-07-18)
-- Branch: sprint/123a-1-foundation
-- Gate G1 Revision 2 corrections applied.
--
-- IMPORTANT: This migration creates schema only.
-- No data is written until Sprint 123A.3 (DATABENTO_SHADOW mode).
-- MARKET_DATA_AUTHORITY = TRADINGVIEW_ONLY remains the default.
--
-- DO NOT run this migration against the live production database
-- without Phil's explicit written approval at Gate G1.
-- A full database backup must be taken before running.
--
-- Tables created:
--   atlas_ticks                      (Raw tick data — Sprint 123A.3+)
--   atlas_bars_1m                    (Bar Builder — Sprint 123A.3)
--   atlas_bars_5m                    (Five-Min Aggregator — Sprint 123A.3)
--   atlas_canonical_bars             (Canonical Router — Sprint 123A.1+)
--   atlas_contract_rolls             (Contract Roll Manager — Sprint 123A.3)
--   atlas_parity_reports             (Parity Monitor — Sprint 123A.4)
--   atlas_chart_annotations          (AtlasLiveChart — Sprint 123A.4)
--   atlas_consumer_processing_ledger (Canonical Router — effective-once)
--   atlas_feed_health_log            (Feed Health Monitor — Sprint 123A.3)
--
-- Design invariants enforced by this schema:
--   1. Unresolved minutes can NEVER be represented as a completed 5-minute aggregate.
--      atlas_bars_5m has no CONTAINS_UNRESOLVED canonical bar type.
--      The canonical_bar_type ENUM does not include CONTAINS_UNRESOLVED.
--   2. All source bar tables have effective-once unique constraints using
--      source, dataset, instrument_id, bar_open_ts_ms, revision, mapping_version.
--   3. atlas_canonical_bars has authority-safe uniqueness:
--      unique on (authority_source, raw_symbol, bar_open_ts_ms, revision).
--   4. Raw tick nanosecond timestamps stored as DECIMAL(20,0) for full precision.
--   5. Reconciliation status and discrepancy details stored explicitly.
--   6. Every table uses ENGINE=InnoDB DEFAULT CHARSET=utf8mb4.
--
-- Rollback: see ROLLBACK PROCEDURES at the bottom of this file.

-- ─── atlas_ticks ─────────────────────────────────────────────────────────────
-- Raw tick data from Databento (Sprint 123A.3+).
-- In TRADINGVIEW_ONLY mode this table remains empty.
--
-- Unique constraint: one tick per (source, dataset, instrument_id, ts_event_ns)
-- ts_event_ns stored as DECIMAL(20,0) to preserve full nanosecond precision.
-- JavaScript must treat ts_event_ns as a string, not a number.
CREATE TABLE `atlas_ticks` (
  `id`                BIGINT          AUTO_INCREMENT PRIMARY KEY,
  `source`            VARCHAR(20)     NOT NULL DEFAULT 'DATABENTO',
  `dataset`           VARCHAR(50)     NOT NULL,
  `raw_symbol`        VARCHAR(50)     NOT NULL,
  `instrument_id`     BIGINT          NOT NULL,
  -- Nanosecond timestamp from Databento (ts_event in DBN records).
  -- Stored as DECIMAL(20,0) to preserve full nanosecond precision without loss.
  `ts_event_ns`       DECIMAL(20,0)   NOT NULL,
  -- Derived millisecond timestamp for Atlas processing (ts_event_ns / 1_000_000)
  `ts_event_ms`       BIGINT          NOT NULL,
  `price_pts100`      BIGINT,
  `size`              INT,
  `side`              CHAR(1),
  `atlas_ts_ms`       BIGINT          NOT NULL,
  -- Effective-once: one tick per source/dataset/instrument/nanosecond
  UNIQUE KEY `uq_atlas_ticks_source_ns` (`source`, `dataset`, `instrument_id`, `ts_event_ns`),
  INDEX `idx_atlas_ticks_symbol_ts`     (`raw_symbol`, `ts_event_ms`),
  INDEX `idx_atlas_ticks_instrument_ts` (`instrument_id`, `ts_event_ms`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── atlas_bars_1m ───────────────────────────────────────────────────────────
-- 1-minute bars from Databento (Sprint 123A.3+).
-- In TRADINGVIEW_ONLY mode this table remains empty.
--
-- Unique constraint: one bar per (source, dataset, instrument_id,
--   bar_open_ts_ms, revision, mapping_version).
-- bar_open_ts_ns preserves the raw Databento nanosecond precision.
--
-- reconciliation_status values:
--   MATCHED:     Bar matches ohlcv-1m reference feed within tolerance.
--   UNMATCHED:   Bar does not match reference feed. Must NOT be aggregated.
--   PENDING:     Reconciliation not yet attempted.
--   UNAVAILABLE: Reference feed data not available.
--
-- INVARIANT: Only MATCHED bars may be forwarded to the Five-Min Aggregator.
-- reconciledAgainstOhlcv boolean is replaced by reconciliation_status ENUM.
CREATE TABLE `atlas_bars_1m` (
  `id`                          BIGINT          AUTO_INCREMENT PRIMARY KEY,
  `source`                      VARCHAR(20)     NOT NULL DEFAULT 'DATABENTO',
  `dataset`                     VARCHAR(50)     NOT NULL,
  `raw_symbol`                  VARCHAR(50)     NOT NULL,
  `instrument_id`               BIGINT          NOT NULL,
  -- Bar open timestamp (UTC ms) — derived for Atlas processing
  `bar_open_ts_ms`              BIGINT          NOT NULL,
  -- Raw Databento bar open timestamp (nanoseconds since epoch)
  -- Stored as DECIMAL(20,0) to preserve full nanosecond precision
  `bar_open_ts_ns`              DECIMAL(20,0)   NOT NULL,
  `bar_close_ts_ms`             BIGINT          NOT NULL,
  -- OHLCV stored as integer points * 100 to avoid floating-point precision loss
  `open_price_pts100`           BIGINT,
  `high_price_pts100`           BIGINT,
  `low_price_pts100`            BIGINT,
  `close_price_pts100`          BIGINT,
  `volume`                      BIGINT,
  `trade_count`                 INT,
  -- Reconciliation status (replaces reconciledAgainstOhlcv boolean)
  `reconciliation_status`       ENUM('MATCHED','UNMATCHED','PENDING','UNAVAILABLE')
                                NOT NULL DEFAULT 'PENDING',
  -- Discrepancy details (stored even when within tolerance, for audit)
  `recon_close_delta_pts100`    BIGINT,
  `recon_high_delta_pts100`     BIGINT,
  `recon_low_delta_pts100`      BIGINT,
  `recon_volume_delta`          BIGINT,
  `recon_within_tolerance`      TINYINT(1),
  `recon_tolerance_pts100`      BIGINT,
  -- Revision and mapping version for effective-once constraint
  `revision`                    INT             NOT NULL DEFAULT 0,
  `mapping_version`             VARCHAR(50)     NOT NULL DEFAULT 'v1',
  `atlas_ts_ms`                 BIGINT          NOT NULL,
  -- Effective-once: one bar per source/dataset/instrument/open-time/revision/mapping
  UNIQUE KEY `uq_atlas_bars_1m_source_bar` (
    `source`, `dataset`, `instrument_id`, `bar_open_ts_ms`, `revision`, `mapping_version`
  ),
  INDEX `idx_atlas_bars_1m_symbol_ts`     (`raw_symbol`, `bar_open_ts_ms`),
  INDEX `idx_atlas_bars_1m_instrument_ts` (`instrument_id`, `bar_open_ts_ms`),
  INDEX `idx_atlas_bars_1m_recon_status`  (`reconciliation_status`, `bar_open_ts_ms`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── atlas_bars_5m ───────────────────────────────────────────────────────────
-- 5-minute aggregated bars produced by the Five-Min Aggregator.
-- In TRADINGVIEW_ONLY mode this table remains empty.
--
-- INVARIANT: This table must NEVER contain a bar produced from a window
-- that included an unresolved minute. The canonical_bar_type ENUM does
-- NOT include CONTAINS_UNRESOLVED — this is intentional and enforced.
-- contains_unresolved column is also absent.
--
-- canonical_bar_type values:
--   LIVE_CONFIRMED:      All 5 minutes confirmed from live feed (MATCHED).
--   CONTAINS_SYNTHETIC:  One or more minutes are synthetic (no-trade bars).
--   RECOVERED:           Bar was recovered from a gap.
--
-- CONTAINS_UNRESOLVED is intentionally absent from this ENUM.
-- A 5-minute window containing an unresolved minute must not produce a row.
CREATE TABLE `atlas_bars_5m` (
  `id`                          BIGINT          AUTO_INCREMENT PRIMARY KEY,
  `source`                      VARCHAR(20)     NOT NULL DEFAULT 'DATABENTO',
  `dataset`                     VARCHAR(50)     NOT NULL,
  `raw_symbol`                  VARCHAR(50)     NOT NULL,
  `instrument_id`               BIGINT          NOT NULL,
  `bar_open_ts_ms`              BIGINT          NOT NULL,
  `bar_close_ts_ms`             BIGINT          NOT NULL,
  `open_price_pts100`           BIGINT,
  `high_price_pts100`           BIGINT,
  `low_price_pts100`            BIGINT,
  `close_price_pts100`          BIGINT,
  `volume`                      BIGINT,
  `trade_count`                 INT,
  -- Number of 1-minute bars aggregated (must be 5 for a complete window)
  `minute_bar_count`            INT             NOT NULL DEFAULT 5,
  -- CONTAINS_UNRESOLVED is intentionally absent from this ENUM
  `canonical_bar_type`          ENUM('LIVE_CONFIRMED','CONTAINS_SYNTHETIC','RECOVERED')
                                NOT NULL DEFAULT 'LIVE_CONFIRMED',
  `revision`                    INT             NOT NULL DEFAULT 0,
  `mapping_version`             VARCHAR(50)     NOT NULL DEFAULT 'v1',
  `atlas_ts_ms`                 BIGINT          NOT NULL,
  -- Effective-once: one 5m bar per source/dataset/instrument/open-time/revision/mapping
  UNIQUE KEY `uq_atlas_bars_5m_source_bar` (
    `source`, `dataset`, `instrument_id`, `bar_open_ts_ms`, `revision`, `mapping_version`
  ),
  INDEX `idx_atlas_bars_5m_symbol_ts`     (`raw_symbol`, `bar_open_ts_ms`),
  INDEX `idx_atlas_bars_5m_instrument_ts` (`instrument_id`, `bar_open_ts_ms`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── atlas_canonical_bars ────────────────────────────────────────────────────
-- The authoritative canonical bar store. One row per confirmed canonical bar.
-- Written by the Canonical Router after a CanonicalBarConfirmed event.
--
-- Authority-safe uniqueness: unique on (authority_source, raw_symbol,
--   bar_open_ts_ms, revision). Prevents duplicate canonical bars from
--   different authority sources at the same timestamp.
--
-- INVARIANT: contains_unresolved_minutes must always be 0 (FALSE).
-- A canonical bar can never contain unresolved minutes.
-- CONTAINS_UNRESOLVED is intentionally absent from canonical_bar_type ENUM.
CREATE TABLE `atlas_canonical_bars` (
  `id`                          BIGINT          AUTO_INCREMENT PRIMARY KEY,
  `authority_source`            ENUM('TRADINGVIEW','DATABENTO') NOT NULL,
  `authority_mode`              VARCHAR(50)     NOT NULL,
  `raw_symbol`                  VARCHAR(50)     NOT NULL,
  `bar_open_ts_ms`              BIGINT          NOT NULL,
  `bar_close_ts_ms`             BIGINT          NOT NULL,
  `open_price`                  DECIMAL(18,6),
  `high_price`                  DECIMAL(18,6),
  `low_price`                   DECIMAL(18,6),
  `close_price`                 DECIMAL(18,6),
  `volume`                      BIGINT,
  -- INVARIANT: always 0 (FALSE). Stored explicitly for auditability.
  `contains_unresolved_minutes` TINYINT(1)      NOT NULL DEFAULT 0,
  -- CONTAINS_UNRESOLVED is intentionally absent from this ENUM
  `canonical_bar_type`          ENUM('LIVE_CONFIRMED','CONTAINS_SYNTHETIC','RECOVERED')
                                NOT NULL DEFAULT 'LIVE_CONFIRMED',
  `dispatched_to_process_bar`   TINYINT(1)      NOT NULL DEFAULT 0,
  `dispatched_to_post_bar_auto` TINYINT(1)      NOT NULL DEFAULT 0,
  `dispatch_ts_ms`              BIGINT,
  `revision`                    INT             NOT NULL DEFAULT 0,
  `atlas_ts_ms`                 BIGINT          NOT NULL,
  -- Authority-safe uniqueness: one canonical bar per authority/symbol/open-time/revision
  UNIQUE KEY `uq_atlas_canonical_bars_authority` (
    `authority_source`, `raw_symbol`, `bar_open_ts_ms`, `revision`
  ),
  INDEX `idx_atlas_canonical_bars_symbol_ts`    (`raw_symbol`, `bar_open_ts_ms`),
  INDEX `idx_atlas_canonical_bars_authority_ts` (`authority_source`, `bar_open_ts_ms`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── atlas_contract_rolls ────────────────────────────────────────────────────
-- Contract roll events from the Contract Roll Manager (Sprint 123A.3+).
CREATE TABLE `atlas_contract_rolls` (
  `id`                BIGINT          AUTO_INCREMENT PRIMARY KEY,
  `dataset`           VARCHAR(50)     NOT NULL,
  `from_symbol`       VARCHAR(50)     NOT NULL,
  `to_symbol`         VARCHAR(50)     NOT NULL,
  `instrument_id`     BIGINT          NOT NULL,
  `roll_ts_ms`        BIGINT          NOT NULL,
  `mapping_version`   VARCHAR(50)     NOT NULL,
  `detected_by`       VARCHAR(100)    NOT NULL,
  `atlas_ts_ms`       BIGINT          NOT NULL,
  -- Effective-once: one roll record per dataset/instrument/roll-time/mapping
  UNIQUE KEY `uq_atlas_contract_rolls` (
    `dataset`, `instrument_id`, `roll_ts_ms`, `mapping_version`
  ),
  INDEX `idx_atlas_contract_rolls_ts` (`roll_ts_ms`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── atlas_parity_reports ────────────────────────────────────────────────────
-- Daily parity reports from the Parity Monitor (Sprint 123A.4+).
-- Evidence table — preserved in operational rollback.
CREATE TABLE `atlas_parity_reports` (
  `id`                BIGINT          AUTO_INCREMENT PRIMARY KEY,
  `report_date`       DATE            NOT NULL,
  `section_a_pass`    TINYINT(1)      NOT NULL DEFAULT 0,
  `section_b_pass`    TINYINT(1)      NOT NULL DEFAULT 0,
  `gate_g4_pass`      TINYINT(1)      NOT NULL DEFAULT 0,
  `section_a_score`   DECIMAL(5,2),
  `section_b_score`   DECIMAL(5,2),
  `total_bars`        INT,
  `matched_bars`      INT,
  `unmatched_bars`    INT,
  `unresolved_bars`   INT,
  `report_json`       MEDIUMTEXT,
  `atlas_ts_ms`       BIGINT          NOT NULL,
  -- One report per date
  UNIQUE KEY `uq_atlas_parity_reports_date` (`report_date`),
  INDEX `idx_atlas_parity_reports_ts` (`atlas_ts_ms`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── atlas_chart_annotations ─────────────────────────────────────────────────
-- Chart annotations for AtlasLiveChart (Sprint 123A.4+).
CREATE TABLE `atlas_chart_annotations` (
  `id`                BIGINT          AUTO_INCREMENT PRIMARY KEY,
  `symbol`            VARCHAR(50)     NOT NULL,
  `bar_open_ts_ms`    BIGINT          NOT NULL,
  `annotation_type`   VARCHAR(50)     NOT NULL,
  `annotation_data`   TEXT,
  `source`            VARCHAR(20)     NOT NULL DEFAULT 'ATLAS',
  `atlas_ts_ms`       BIGINT          NOT NULL,
  INDEX `idx_atlas_chart_annotations_symbol_ts` (`symbol`, `bar_open_ts_ms`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── atlas_consumer_processing_ledger ────────────────────────────────────────
-- Effective-once processing ledger for the Canonical Router.
-- Records which consumers have processed each canonical bar.
-- Prevents double-processing on restart or replay.
-- Evidence table — preserved in operational rollback.
CREATE TABLE `atlas_consumer_processing_ledger` (
  `id`                BIGINT          AUTO_INCREMENT PRIMARY KEY,
  `canonical_bar_id`  BIGINT          NOT NULL,
  `consumer_name`     VARCHAR(100)    NOT NULL,
  `processed_at_ms`   BIGINT          NOT NULL,
  `success`           TINYINT(1)      NOT NULL DEFAULT 1,
  `error_message`     TEXT,
  `atlas_ts_ms`       BIGINT          NOT NULL,
  -- Effective-once: one processing record per canonical bar per consumer
  UNIQUE KEY `uq_atlas_consumer_ledger` (`canonical_bar_id`, `consumer_name`),
  INDEX `idx_atlas_consumer_ledger_bar`      (`canonical_bar_id`),
  INDEX `idx_atlas_consumer_ledger_consumer` (`consumer_name`, `processed_at_ms`),
  CONSTRAINT `fk_consumer_ledger_canonical_bar`
    FOREIGN KEY (`canonical_bar_id`)
    REFERENCES `atlas_canonical_bars` (`id`)
    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── atlas_feed_health_log ───────────────────────────────────────────────────
-- Feed health state transitions from the Feed Health Monitor (Sprint 123A.3+).
-- Evidence table — preserved in operational rollback.
CREATE TABLE `atlas_feed_health_log` (
  `id`                          BIGINT          AUTO_INCREMENT PRIMARY KEY,
  `feed_source`                 VARCHAR(20)     NOT NULL,
  `state`                       VARCHAR(30)     NOT NULL,
  `previous_state`              VARCHAR(30),
  `message`                     TEXT,
  `consecutive_failures`        INT             NOT NULL DEFAULT 0,
  `last_success_bar_ts_ms`      BIGINT,
  `atlas_ts_ms`                 BIGINT          NOT NULL,
  INDEX `idx_atlas_feed_health_source_ts` (`feed_source`, `atlas_ts_ms`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─────────────────────────────────────────────────────────────────────────────
-- ROLLBACK PROCEDURES
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Two rollback tiers are provided. Neither may be executed without approval.
--
-- a) OPERATIONAL ROLLBACK
--    Drops only the data-collection tables that have no evidence value.
--    Preserves: atlas_parity_reports, atlas_canonical_bars,
--               atlas_consumer_processing_ledger, atlas_feed_health_log.
--    Use when rolling back a failed Sprint 123A.3 activation while
--    preserving audit evidence.
--    Requires: Gate G1 approval to execute.
--
--    -- BEGIN OPERATIONAL ROLLBACK
--    DROP TABLE IF EXISTS `atlas_chart_annotations`;
--    DROP TABLE IF EXISTS `atlas_contract_rolls`;
--    DROP TABLE IF EXISTS `atlas_bars_5m`;
--    DROP TABLE IF EXISTS `atlas_bars_1m`;
--    DROP TABLE IF EXISTS `atlas_ticks`;
--    -- END OPERATIONAL ROLLBACK
--
-- b) DESTRUCTIVE DEVELOPMENT RESET
--    Drops ALL Sprint 123A.1 tables including evidence tables.
--    ONLY use on a development or staging database.
--    NEVER use on production without explicit written approval from Phil.
--
--    -- BEGIN DESTRUCTIVE RESET (requires explicit written approval)
--    DROP TABLE IF EXISTS `atlas_consumer_processing_ledger`;
--    DROP TABLE IF EXISTS `atlas_chart_annotations`;
--    DROP TABLE IF EXISTS `atlas_parity_reports`;
--    DROP TABLE IF EXISTS `atlas_contract_rolls`;
--    DROP TABLE IF EXISTS `atlas_canonical_bars`;
--    DROP TABLE IF EXISTS `atlas_bars_5m`;
--    DROP TABLE IF EXISTS `atlas_bars_1m`;
--    DROP TABLE IF EXISTS `atlas_feed_health_log`;
--    DROP TABLE IF EXISTS `atlas_ticks`;
--    -- END DESTRUCTIVE RESET
