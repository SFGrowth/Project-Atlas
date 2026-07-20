-- Sprint 123A.3 Canonical Identity Migration
-- Authorised by Gate G3 Revision 5 (Phil, 2026-07-20)
-- Branch: sprint/123a-2-databento-adapter
--
-- IMPORTANT: This migration must be applied AFTER 0026_sprint_123a1_foundation.sql.
-- Do NOT run against the production database without Phil's explicit written
-- approval at Gate G3.
--
-- Changes:
--   1. atlas_bars_1m: Add interval_ms column (INT NOT NULL DEFAULT 60000).
--      Replace uq_atlas_bars_1m_source_bar with an 8-column unique key that
--      includes interval_ms and raw_symbol, so a contract roll cannot overwrite
--      the previous contract's bar at the same timestamp, and future multi-
--      interval tables cannot collide.
--   2. atlas_bars_5m: Add interval_ms column (INT NOT NULL DEFAULT 300000).
--      Same 8-column key correction.
--   3. atlas_bar_processing_ledger: New table for Sprint 123A.3 effectively-once
--      processing. Separate from atlas_consumer_processing_ledger (Canonical Router).
--      Tracks which bar-level consumers (BarBuilder, FiveMinAggregator) have
--      processed each source bar event.
--
-- 8-column canonical identity key rationale:
--   source          — always 'DATABENTO' for Sprint 123A.3 bars; prevents
--                     future source collision if TradingView bars are added.
--   dataset         — GLBX.MDP3 vs other datasets must not collide.
--   raw_symbol      — MNQM5 vs MNQU5 (contract roll) must not collide at the
--                     same bar_open_ts_ms. Without raw_symbol in the key, a
--                     roll could silently overwrite the previous contract's bar.
--   instrument_id   — Databento instrument_id is dataset-scoped; included for
--                     fast index lookups.
--   interval_ms     — Interval in milliseconds (60000 for 1m, 300000 for 5m).
--                     Although the table name encodes the interval, including
--                     interval_ms in the key makes the identity self-describing
--                     and prevents any future cross-interval collision if tables
--                     are ever merged or queried via a union view.
--   bar_open_ts_ms  — The canonical bar timestamp (milliseconds).
--   revision        — Allows a corrected bar to be stored alongside the original.
--   mapping_version — Allows re-mapping under a new symbol mapping version.
--
-- Rollback: see ROLLBACK PROCEDURES at the bottom of this file.
-- ─── Add interval_ms to atlas_bars_1m ────────────────────────────────────────
-- MySQL 8.0 does not support ADD COLUMN IF NOT EXISTS in ALTER TABLE.
-- Use a stored procedure to conditionally add the column.
DROP PROCEDURE IF EXISTS atlas_migrate_0027_add_interval_1m;
DELIMITER //
CREATE PROCEDURE atlas_migrate_0027_add_interval_1m()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'atlas_bars_1m'
      AND column_name = 'interval_ms'
  ) THEN
    ALTER TABLE `atlas_bars_1m`
      ADD COLUMN `interval_ms` INT NOT NULL DEFAULT 60000
        COMMENT 'Bar interval in milliseconds. Always 60000 for atlas_bars_1m.'
        AFTER `instrument_id`;
  END IF;
END //
DELIMITER ;
CALL atlas_migrate_0027_add_interval_1m();
DROP PROCEDURE IF EXISTS atlas_migrate_0027_add_interval_1m;
-- ─── Widen atlas_bars_1m unique key to 8 columns ─────────────────────────────
-- MySQL 8.0 does not support DROP INDEX IF EXISTS in ALTER TABLE.
-- Use a stored procedure to conditionally drop old keys before adding the new one.
-- This makes the migration idempotent (safe to re-run).
DROP PROCEDURE IF EXISTS atlas_migrate_0027_bars_1m;
DELIMITER //
CREATE PROCEDURE atlas_migrate_0027_bars_1m()
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'atlas_bars_1m'
      AND index_name = 'uq_atlas_bars_1m_source_bar'
  ) THEN
    ALTER TABLE `atlas_bars_1m` DROP INDEX `uq_atlas_bars_1m_source_bar`;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'atlas_bars_1m'
      AND index_name = 'uq_atlas_bars_1m_canonical_identity'
  ) THEN
    ALTER TABLE `atlas_bars_1m` DROP INDEX `uq_atlas_bars_1m_canonical_identity`;
  END IF;
  ALTER TABLE `atlas_bars_1m`
    ADD UNIQUE KEY `uq_atlas_bars_1m_canonical_identity` (
      `source`, `dataset`, `raw_symbol`, `instrument_id`,
      `interval_ms`, `bar_open_ts_ms`, `revision`, `mapping_version`
    );
END //
DELIMITER ;
CALL atlas_migrate_0027_bars_1m();
DROP PROCEDURE IF EXISTS atlas_migrate_0027_bars_1m;
-- ─── Add interval_ms to atlas_bars_5m ────────────────────────────────────────
DROP PROCEDURE IF EXISTS atlas_migrate_0027_add_interval_5m;
DELIMITER //
CREATE PROCEDURE atlas_migrate_0027_add_interval_5m()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'atlas_bars_5m'
      AND column_name = 'interval_ms'
  ) THEN
    ALTER TABLE `atlas_bars_5m`
      ADD COLUMN `interval_ms` INT NOT NULL DEFAULT 300000
        COMMENT 'Bar interval in milliseconds. Always 300000 for atlas_bars_5m.'
        AFTER `instrument_id`;
  END IF;
END //
DELIMITER ;
CALL atlas_migrate_0027_add_interval_5m();
DROP PROCEDURE IF EXISTS atlas_migrate_0027_add_interval_5m;
-- ─── Widen atlas_bars_5m unique key to 8 columns ─────────────────────────────
DROP PROCEDURE IF EXISTS atlas_migrate_0027_bars_5m;
DELIMITER //
CREATE PROCEDURE atlas_migrate_0027_bars_5m()
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'atlas_bars_5m'
      AND index_name = 'uq_atlas_bars_5m_source_bar'
  ) THEN
    ALTER TABLE `atlas_bars_5m` DROP INDEX `uq_atlas_bars_5m_source_bar`;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'atlas_bars_5m'
      AND index_name = 'uq_atlas_bars_5m_canonical_identity'
  ) THEN
    ALTER TABLE `atlas_bars_5m` DROP INDEX `uq_atlas_bars_5m_canonical_identity`;
  END IF;
  ALTER TABLE `atlas_bars_5m`
    ADD UNIQUE KEY `uq_atlas_bars_5m_canonical_identity` (
      `source`, `dataset`, `raw_symbol`, `instrument_id`,
      `interval_ms`, `bar_open_ts_ms`, `revision`, `mapping_version`
    );
END //
DELIMITER ;
CALL atlas_migrate_0027_bars_5m();
DROP PROCEDURE IF EXISTS atlas_migrate_0027_bars_5m;
-- ─── atlas_bar_processing_ledger ─────────────────────────────────────────────
-- Sprint 123A.3 effectively-once processing ledger for bar-level consumers.
-- Separate from atlas_consumer_processing_ledger (Canonical Router).
-- Tracks which bar-level consumers (BarBuilder, FiveMinAggregator) have
-- processed each source bar event.
--
-- Identity: one record per (source, dataset, raw_symbol, instrument_id,
--           bar_open_ts_ms, revision, mapping_version, consumer_name, consumer_version).
CREATE TABLE IF NOT EXISTS `atlas_bar_processing_ledger` (
  `id`                BIGINT          AUTO_INCREMENT PRIMARY KEY,
  -- Source bar identity (matches atlas_bars_1m canonical identity)
  `source`            VARCHAR(20)     NOT NULL DEFAULT 'DATABENTO',
  `dataset`           VARCHAR(50)     NOT NULL,
  `raw_symbol`        VARCHAR(50)     NOT NULL,
  `instrument_id`     BIGINT          NOT NULL,
  `bar_open_ts_ms`    BIGINT          NOT NULL,
  `revision`          INT             NOT NULL DEFAULT 0,
  `mapping_version`   VARCHAR(50)     NOT NULL DEFAULT 'v1',
  -- Consumer identity
  `consumer_name`     VARCHAR(100)    NOT NULL,
  `consumer_version`  VARCHAR(20)     NOT NULL DEFAULT 'v1',
  -- Processing outcome
  `processed_at_ms`   BIGINT          NOT NULL,
  `success`           TINYINT(1)      NOT NULL DEFAULT 1,
  `error_message`     TEXT,
  `atlas_ts_ms`       BIGINT          NOT NULL,
  -- Effective-once: one record per source bar per consumer/version
  UNIQUE KEY `uq_atlas_bar_processing_ledger` (
    `source`, `dataset`, `raw_symbol`, `instrument_id`,
    `bar_open_ts_ms`, `revision`, `mapping_version`,
    `consumer_name`, `consumer_version`
  ),
  INDEX `idx_atlas_bar_ledger_bar`      (`source`, `dataset`, `instrument_id`, `bar_open_ts_ms`),
  INDEX `idx_atlas_bar_ledger_consumer` (`consumer_name`, `processed_at_ms`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
-- ─── ROLLBACK PROCEDURES ─────────────────────────────────────────────────────
-- To roll back this migration:
--
--   DROP TABLE IF EXISTS `atlas_bar_processing_ledger`;
--
--   ALTER TABLE `atlas_bars_1m`
--     DROP INDEX `uq_atlas_bars_1m_canonical_identity`,
--     DROP COLUMN `interval_ms`,
--     ADD UNIQUE KEY `uq_atlas_bars_1m_source_bar` (
--       `source`, `dataset`, `instrument_id`, `bar_open_ts_ms`, `revision`, `mapping_version`
--     );
--
--   ALTER TABLE `atlas_bars_5m`
--     DROP INDEX `uq_atlas_bars_5m_canonical_identity`,
--     DROP COLUMN `interval_ms`,
--     ADD UNIQUE KEY `uq_atlas_bars_5m_source_bar` (
--       `source`, `dataset`, `instrument_id`, `bar_open_ts_ms`, `revision`, `mapping_version`
--     );
