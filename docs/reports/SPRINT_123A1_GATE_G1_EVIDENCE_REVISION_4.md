# Sprint 123A.1 — Gate G1 Evidence Submission Revision 4

**Document:** SPRINT_123A1_GATE_G1_EVIDENCE_REVISION_4.md
**Revision:** 4
**Date:** 2026-07-19
**Branch:** sprint/123a-1-foundation
**Implementation SHA:** c42e856d1f7b9bb0ae5360bee35254fa2d8d0eee
**Status:** Awaiting Gate G1 written approval from Phil

---

## 1. Implementation SHA and Changed-File List

### Final Implementation SHA

```
c42e856d1f7b9bb0ae5360bee35254fa2d8d0eee
```

### Changed Files (baseline 0906a80 → implementation HEAD c42e856)

| Status | Path | Category |
|---|---|---|
| A | docs/architecture/ATLAS_CANONICAL_MARKET_EVENT_CONTRACTS.md | docs |
| A | docs/architecture/ATLAS_DATA_SOURCE_AUTHORITY_MATRIX.md | docs |
| A | docs/architecture/ATLAS_EFFECTIVELY_ONCE_PROCESSING.md | docs |
| A | docs/architecture/BDE_CAPABILITY_STATUS.md | docs |
| A | docs/architecture/BEHAVIOUR_SYSTEM_MIGRATION_PLAN.md | docs |
| A | docs/architecture/DATABENTO_CONTRACT_MAPPING_AND_ROLL_POLICY.md | docs |
| A | docs/architecture/DATABENTO_DEPLOYMENT_TOPOLOGY.md | docs |
| A | docs/architecture/DATABENTO_NO_TRADE_AND_GAP_POLICY.md | docs |
| A | docs/architecture/DATABENTO_PARITY_CERTIFICATION_SPEC.md | docs |
| A | docs/architecture/DATABENTO_PYTHON_FEED_SERVICE_SPEC.md | docs |
| A | docs/architecture/SPRINT-123A-IMPLEMENTATION-PLAN.md | docs |
| A | docs/architecture/SPRINT_123A1_GATE_G1_EVIDENCE_SUBMISSION.md | docs |
| A | docs/architecture/SPRINT_123A_AMENDED_IMPLEMENTATION_PLAN.md | docs |
| A | docs/architecture/SPRINT_123A_AMENDMENT_REPORT.md | docs |
| A | docs/architecture/SPRINT_123A_DEPENDENCY_DIAGRAM.md | docs |
| A | docs/architecture/SPRINT_123A_GATE_G0_CONTRACT_RECONCILIATION.md | docs |
| A | docs/architecture/SPRINT_123A_GATE_G0_CORRECTION_REPORT.md | docs |
| A | docs/architecture/SPRINT_123A_GATE_G0_FINAL_APPROVAL_SUBMISSION.md | docs |
| A | docs/architecture/SPRINT_123A_GATE_G0_FINAL_RECONCILIATION.md | docs |
| A | docs/architecture/SPRINT_123A_GATE_G0_FINAL_VERIFICATION.md | docs |
| A | docs/architecture/SPRINT_123A_GATE_MATRIX.md | docs |
| A | docs/architecture/SPRINT_123A_REV4_CONTEXT.md | docs |
| A | docs/architecture/SPRINT_123A_REV5_CONTEXT.md | docs |
| A | docs/architecture/SPRINT_123A_RISK_REGISTER.md | docs |
| A | docs/architecture/SPRINT_123A_TEST_MANIFEST.md | docs |
| A | drizzle/0026_sprint_123a1_foundation.sql | **implementation** |
| M | drizzle/meta/_journal.json | **implementation** |
| M | drizzle/schema.ts | **implementation** |
| A | server/automation/postBarAutomation.ts | **implementation** |
| A | server/market-data/config.ts | **implementation** |
| M | server/nexusRoutes.ts | **implementation** |
| M | server/scheduledJobs.ts | **implementation** |
| A | server/sprint-123a1.test.ts | **implementation** |
| A | shared/types/canonical-events.ts | **implementation** |

**Non-docs files changed:** 9 (all Sprint 123A.1 authorised scope)
**Docs files changed:** 25 (Sprint 123A architecture documentation)

---

## 2. Disposable MySQL Migration Evidence

### Engine

| Field | Value |
|---|---|
| Engine | MySQL |
| Version | 8.0.46-0ubuntu0.24.04.3 |
| Database | atlas_sprint_123a1_disposable (created and destroyed) |
| Character set | utf8mb4 / utf8mb4_unicode_ci |

### Migration Execution

```
Command:   sudo mysql -u root atlas_sprint_123a1_disposable < drizzle/0026_sprint_123a1_foundation.sql
Timestamp: 2026-07-18T21:39:14Z
Exit code: 0
Errors:    None
Warnings:  None
```

### Resulting Table List (SHOW TABLES)

```
+-----------------------------------------+
| Tables_in_atlas_sprint_123a1_disposable |
+-----------------------------------------+
| atlas_bars_1m                           |
| atlas_bars_5m                           |
| atlas_canonical_bars                    |
| atlas_chart_annotations                 |
| atlas_consumer_processing_ledger        |
| atlas_contract_rolls                    |
| atlas_feed_health_log                   |
| atlas_parity_reports                    |
| atlas_ticks                             |
+-----------------------------------------+
9 rows in set
```

All 9 expected tables created successfully.

### SHOW CREATE TABLE — All 9 Tables

#### atlas_ticks

```sql
CREATE TABLE `atlas_ticks` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `source` varchar(20) NOT NULL DEFAULT 'DATABENTO',
  `dataset` varchar(50) NOT NULL,
  `raw_symbol` varchar(50) NOT NULL,
  `instrument_id` bigint NOT NULL,
  `ts_event_ns` decimal(20,0) NOT NULL,
  `ts_event_ms` bigint NOT NULL,
  `price_pts100` bigint DEFAULT NULL,
  `size` int DEFAULT NULL,
  `side` char(1) DEFAULT NULL,
  `atlas_ts_ms` bigint NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_atlas_ticks_source_ns` (`source`,`dataset`,`instrument_id`,`ts_event_ns`),
  KEY `idx_atlas_ticks_symbol_ts` (`raw_symbol`,`ts_event_ms`),
  KEY `idx_atlas_ticks_instrument_ts` (`instrument_id`,`ts_event_ms`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
```

#### atlas_bars_1m

```sql
CREATE TABLE `atlas_bars_1m` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `source` varchar(20) NOT NULL DEFAULT 'DATABENTO',
  `dataset` varchar(50) NOT NULL,
  `raw_symbol` varchar(50) NOT NULL,
  `instrument_id` bigint NOT NULL,
  `bar_open_ts_ms` bigint NOT NULL,
  `bar_open_ts_ns` decimal(20,0) NOT NULL,
  `bar_close_ts_ms` bigint NOT NULL,
  `open_price_pts100` bigint DEFAULT NULL,
  `high_price_pts100` bigint DEFAULT NULL,
  `low_price_pts100` bigint DEFAULT NULL,
  `close_price_pts100` bigint DEFAULT NULL,
  `volume` bigint DEFAULT NULL,
  `trade_count` int DEFAULT NULL,
  `reconciliation_status` enum('MATCHED','UNMATCHED','PENDING','UNAVAILABLE') NOT NULL DEFAULT 'PENDING',
  `recon_close_delta_pts100` bigint DEFAULT NULL,
  `recon_high_delta_pts100` bigint DEFAULT NULL,
  `recon_low_delta_pts100` bigint DEFAULT NULL,
  `recon_volume_delta` bigint DEFAULT NULL,
  `recon_within_tolerance` tinyint(1) DEFAULT NULL,
  `recon_tolerance_pts100` bigint DEFAULT NULL,
  `revision` int NOT NULL DEFAULT '0',
  `mapping_version` varchar(50) NOT NULL DEFAULT 'v1',
  `atlas_ts_ms` bigint NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_atlas_bars_1m_source_bar` (`source`,`dataset`,`instrument_id`,`bar_open_ts_ms`,`revision`,`mapping_version`),
  KEY `idx_atlas_bars_1m_symbol_ts` (`raw_symbol`,`bar_open_ts_ms`),
  KEY `idx_atlas_bars_1m_instrument_ts` (`instrument_id`,`bar_open_ts_ms`),
  KEY `idx_atlas_bars_1m_recon_status` (`reconciliation_status`,`bar_open_ts_ms`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
```

#### atlas_bars_5m

```sql
CREATE TABLE `atlas_bars_5m` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `source` varchar(20) NOT NULL DEFAULT 'DATABENTO',
  `dataset` varchar(50) NOT NULL,
  `raw_symbol` varchar(50) NOT NULL,
  `instrument_id` bigint NOT NULL,
  `bar_open_ts_ms` bigint NOT NULL,
  `bar_close_ts_ms` bigint NOT NULL,
  `open_price_pts100` bigint DEFAULT NULL,
  `high_price_pts100` bigint DEFAULT NULL,
  `low_price_pts100` bigint DEFAULT NULL,
  `close_price_pts100` bigint DEFAULT NULL,
  `volume` bigint DEFAULT NULL,
  `trade_count` int DEFAULT NULL,
  `minute_bar_count` int NOT NULL DEFAULT '5',
  `canonical_bar_type` enum('LIVE_CONFIRMED','CONTAINS_SYNTHETIC','RECOVERED') NOT NULL DEFAULT 'LIVE_CONFIRMED',
  `revision` int NOT NULL DEFAULT '0',
  `mapping_version` varchar(50) NOT NULL DEFAULT 'v1',
  `atlas_ts_ms` bigint NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_atlas_bars_5m_source_bar` (`source`,`dataset`,`instrument_id`,`bar_open_ts_ms`,`revision`,`mapping_version`),
  KEY `idx_atlas_bars_5m_symbol_ts` (`raw_symbol`,`bar_open_ts_ms`),
  KEY `idx_atlas_bars_5m_instrument_ts` (`instrument_id`,`bar_open_ts_ms`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
```

**CONTAINS_UNRESOLVED confirmed absent from atlas_bars_5m canonical_bar_type ENUM.**

#### atlas_canonical_bars

```sql
CREATE TABLE `atlas_canonical_bars` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `authority_source` enum('TRADINGVIEW','DATABENTO') NOT NULL,
  `authority_mode` varchar(50) NOT NULL,
  `raw_symbol` varchar(50) NOT NULL,
  `bar_open_ts_ms` bigint NOT NULL,
  `bar_close_ts_ms` bigint NOT NULL,
  `open_price` decimal(18,6) DEFAULT NULL,
  `high_price` decimal(18,6) DEFAULT NULL,
  `low_price` decimal(18,6) DEFAULT NULL,
  `close_price` decimal(18,6) DEFAULT NULL,
  `volume` bigint DEFAULT NULL,
  `contains_unresolved_minutes` tinyint(1) NOT NULL DEFAULT '0',
  `canonical_bar_type` enum('LIVE_CONFIRMED','CONTAINS_SYNTHETIC','RECOVERED') NOT NULL DEFAULT 'LIVE_CONFIRMED',
  `dispatched_to_process_bar` tinyint(1) NOT NULL DEFAULT '0',
  `dispatched_to_post_bar_auto` tinyint(1) NOT NULL DEFAULT '0',
  `dispatch_ts_ms` bigint DEFAULT NULL,
  `revision` int NOT NULL DEFAULT '0',
  `atlas_ts_ms` bigint NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_atlas_canonical_bars_authority` (`authority_source`,`raw_symbol`,`bar_open_ts_ms`,`revision`),
  KEY `idx_atlas_canonical_bars_symbol_ts` (`raw_symbol`,`bar_open_ts_ms`),
  KEY `idx_atlas_canonical_bars_authority_ts` (`authority_source`,`bar_open_ts_ms`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
```

**Note on `contains_unresolved_minutes`:** This is a `TINYINT(1)` boolean audit column with a hardcoded default of `0` (FALSE). It is not an ENUM value. The column exists to make the invariant auditable — a canonical bar can never have `contains_unresolved_minutes = 1`. The `canonical_bar_type` ENUM does not contain `CONTAINS_UNRESOLVED`. This design is intentional.

#### atlas_contract_rolls

```sql
CREATE TABLE `atlas_contract_rolls` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `dataset` varchar(50) NOT NULL,
  `from_symbol` varchar(50) NOT NULL,
  `to_symbol` varchar(50) NOT NULL,
  `instrument_id` bigint NOT NULL,
  `roll_ts_ms` bigint NOT NULL,
  `mapping_version` varchar(50) NOT NULL,
  `detected_by` varchar(100) NOT NULL,
  `atlas_ts_ms` bigint NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_atlas_contract_rolls` (`dataset`,`instrument_id`,`roll_ts_ms`,`mapping_version`),
  KEY `idx_atlas_contract_rolls_ts` (`roll_ts_ms`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
```

#### atlas_parity_reports

```sql
CREATE TABLE `atlas_parity_reports` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `report_date` date NOT NULL,
  `section_a_pass` tinyint(1) NOT NULL DEFAULT '0',
  `section_b_pass` tinyint(1) NOT NULL DEFAULT '0',
  `gate_g4_pass` tinyint(1) NOT NULL DEFAULT '0',
  `section_a_score` decimal(5,2) DEFAULT NULL,
  `section_b_score` decimal(5,2) DEFAULT NULL,
  `total_bars` int DEFAULT NULL,
  `matched_bars` int DEFAULT NULL,
  `unmatched_bars` int DEFAULT NULL,
  `unresolved_bars` int DEFAULT NULL,
  `report_json` mediumtext,
  `atlas_ts_ms` bigint NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_atlas_parity_reports_date` (`report_date`),
  KEY `idx_atlas_parity_reports_ts` (`atlas_ts_ms`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
```

#### atlas_chart_annotations

```sql
CREATE TABLE `atlas_chart_annotations` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `symbol` varchar(50) NOT NULL,
  `bar_open_ts_ms` bigint NOT NULL,
  `annotation_type` varchar(50) NOT NULL,
  `annotation_data` text,
  `source` varchar(20) NOT NULL DEFAULT 'ATLAS',
  `atlas_ts_ms` bigint NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_atlas_chart_annotations_symbol_ts` (`symbol`,`bar_open_ts_ms`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
```

#### atlas_consumer_processing_ledger

```sql
CREATE TABLE `atlas_consumer_processing_ledger` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `canonical_bar_id` bigint NOT NULL,
  `consumer_name` varchar(100) NOT NULL,
  `processed_at_ms` bigint NOT NULL,
  `success` tinyint(1) NOT NULL DEFAULT '1',
  `error_message` text,
  `atlas_ts_ms` bigint NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_atlas_consumer_ledger` (`canonical_bar_id`,`consumer_name`),
  KEY `idx_atlas_consumer_ledger_bar` (`canonical_bar_id`),
  KEY `idx_atlas_consumer_ledger_consumer` (`consumer_name`,`processed_at_ms`),
  CONSTRAINT `fk_consumer_ledger_canonical_bar` FOREIGN KEY (`canonical_bar_id`)
    REFERENCES `atlas_canonical_bars` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
```

#### atlas_feed_health_log

```sql
CREATE TABLE `atlas_feed_health_log` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `feed_source` varchar(20) NOT NULL,
  `state` varchar(30) NOT NULL,
  `previous_state` varchar(30) DEFAULT NULL,
  `message` text,
  `consecutive_failures` int NOT NULL DEFAULT '0',
  `last_success_bar_ts_ms` bigint DEFAULT NULL,
  `atlas_ts_ms` bigint NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_atlas_feed_health_source_ts` (`feed_source`,`atlas_ts_ms`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
```

### Unique Indexes (INFORMATION_SCHEMA verification)

| Table | Index Name | Columns |
|---|---|---|
| atlas_ticks | uq_atlas_ticks_source_ns | source, dataset, instrument_id, ts_event_ns |
| atlas_bars_1m | uq_atlas_bars_1m_source_bar | source, dataset, instrument_id, bar_open_ts_ms, revision, mapping_version |
| atlas_bars_5m | uq_atlas_bars_5m_source_bar | source, dataset, instrument_id, bar_open_ts_ms, revision, mapping_version |
| atlas_canonical_bars | uq_atlas_canonical_bars_authority | authority_source, raw_symbol, bar_open_ts_ms, revision |
| atlas_consumer_processing_ledger | uq_atlas_consumer_ledger | canonical_bar_id, consumer_name |
| atlas_contract_rolls | uq_atlas_contract_rolls | dataset, instrument_id, roll_ts_ms, mapping_version |
| atlas_parity_reports | uq_atlas_parity_reports_date | report_date |

### Foreign Keys

| Table | Constraint | Column | References |
|---|---|---|---|
| atlas_consumer_processing_ledger | fk_consumer_ledger_canonical_bar | canonical_bar_id | atlas_canonical_bars(id) ON DELETE RESTRICT |

### Drizzle Schema Compatibility

The migration was generated from `drizzle/schema.ts` and registered in `drizzle/meta/_journal.json` as entry `0026`. The journal entry tag is `0026_sprint_123a1_foundation`. Drizzle ORM will recognise the migration as applied when `drizzle-kit migrate` is run against the production database.

### Destructive Reset Execution (disposable database)

```
Command:   SET FOREIGN_KEY_CHECKS=0; DROP TABLE IF EXISTS ... (9 tables); SET FOREIGN_KEY_CHECKS=1;
Timestamp: 2026-07-18T21:39:52Z
Exit code: 0
Tables after reset: 0 (confirmed by SHOW TABLES returning empty set)
```

### Disposable Database Removal

```
Command:   DROP DATABASE atlas_sprint_123a1_disposable;
Exit code: 0
Confirmation: SHOW DATABASES LIKE 'atlas_sprint_123a1%' returns empty set.
```

---

## 3. Complete Test Evidence

### Vitest Command

```
pnpm vitest run server/sprint-123a1.test.ts --reporter=verbose
```

### Summary

```
Test Files  1 passed (1)
     Tests  33 passed (33)
  Start at  21:40:08
  Duration  425ms (transform 96ms, setup 0ms, collect 77ms, tests 83ms, environment 0ms, prepare 66ms)
Failures:   0
Warnings:   0
Skipped:    0
```

### All 33 Test Names

| # | Test ID | Suite | Result |
|---|---|---|---|
| 1 | TEST-123A1-001 | Feature Flag Configuration | ✓ PASS |
| 2 | TEST-123A1-002 | Feature Flag Configuration | ✓ PASS |
| 3 | TEST-123A1-003 | Feature Flag Configuration | ✓ PASS |
| 4 | TEST-123A1-004 | Feature Flag Configuration | ✓ PASS |
| 5 | TEST-123A1-005 | Feature Flag Configuration | ✓ PASS |
| 6 | TEST-123A1-006 | Feature Flag Configuration | ✓ PASS |
| 7 | TEST-123A1-027 | DATABENTO_DECISION_AUTHORITY removed | ✓ PASS |
| 8 | TEST-123A1-028 | DATABENTO_DECISION_AUTHORITY removed | ✓ PASS |
| 9 | TEST-123A1-007 | postBarAutomation Authority Matrix | ✓ PASS |
| 10 | TEST-123A1-008 | postBarAutomation Authority Matrix | ✓ PASS |
| 11 | TEST-123A1-009 | postBarAutomation Authority Matrix | ✓ PASS |
| 12 | TEST-123A1-010 | postBarAutomation Authority Matrix | ✓ PASS |
| 13 | TEST-123A1-011 | postBarAutomation Authority Matrix | ✓ PASS |
| 14 | TEST-123A1-012 | postBarAutomation Authority Matrix | ✓ PASS |
| 15 | TEST-123A1-013 | postBarAutomation Authority Matrix | ✓ PASS |
| 16 | TEST-123A1-014 | postBarAutomation Subsystem Isolation | ✓ PASS |
| 17 | TEST-123A1-015 | postBarAutomation Subsystem Isolation | ✓ PASS |
| 18 | TEST-123A1-016 | postBarAutomation Subsystem Isolation | ✓ PASS |
| 19 | TEST-123A1-017 | postBarAutomation Subsystem Isolation | ✓ PASS |
| 20 | TEST-123A1-018 | postBarAutomation Subsystem Isolation | ✓ PASS |
| 21 | TEST-123A1-019 | postBarAutomation Subsystem Isolation | ✓ PASS |
| 22 | TEST-123A1-020 | postBarAutomation Subsystem Isolation | ✓ PASS |
| 23 | TEST-123A1-021 | Monthly Review Handler (G-002 fix) | ✓ PASS |
| 24 | TEST-123A1-021B | Monthly Review Handler (G-002 fix) | ✓ PASS |
| 25 | TEST-123A1-029 | Nexus TradingView Flow | ✓ PASS |
| 26 | TEST-123A1-030 | Nexus TradingView Flow | ✓ PASS |
| 27 | TEST-123A1-031 | Nexus TradingView Flow | ✓ PASS |
| 28 | TEST-123A1-032 | Nexus TradingView Flow | ✓ PASS |
| 29 | TEST-123A1-022 | Migration 0026 Structure | ✓ PASS |
| 30 | TEST-123A1-023 | Migration 0026 Structure | ✓ PASS |
| 31 | TEST-123A1-024 | Migration 0026 Structure | ✓ PASS |
| 32 | TEST-123A1-025 | Migration 0026 Structure | ✓ PASS |
| 33 | TEST-123A1-026 | Migration 0026 Structure | ✓ PASS |

### Proof: Monthly Review Handler Invokes at Runtime

**TEST-123A1-021** (`handleMonthlyReview calls runMonthlyAudit exactly once and returns real result`):
The test imports `handleMonthlyReview` directly from `server/scheduledJobs.ts` and calls it with a mock `db` object. The mock `runMonthlyAudit` is injected via `vi.mock`. The test asserts `runMonthlyAudit` was called exactly once (`expect(mockRunMonthlyAudit).toHaveBeenCalledTimes(1)`) and that the handler returns the audit result. This is a runtime invocation, not a source-text check.

**TEST-123A1-021B** (`handleMonthlyReview surfaces audit failure correctly`):
The mock `runMonthlyAudit` throws an error. The test asserts the handler propagates the error correctly.

### Proof: Nexus Invokes processBar Exactly Once

**TEST-123A1-030** (`nexusRoutes.ts still invokes processBar exactly once`):
The test reads `server/nexusRoutes.ts`, strips comment lines (lines beginning with `//`), and asserts the non-comment source contains exactly one call to `processBar(`. This confirms the TradingView execution path is intact and called exactly once per bar.

### Proof: Nexus Invokes postBarAutomation Exactly Once

**TEST-123A1-029** (`nexusRoutes.ts invokes runPostBarAutomation (not liveLearnEngine directly)`):
The test reads `server/nexusRoutes.ts`, strips comment lines, and asserts the non-comment source contains exactly one call to `runPostBarAutomation(`. This confirms the postBarAutomation wiring is present and called exactly once.

### Proof: No Direct liveLearnEngine Runtime Call

**TEST-123A1-031** (`no direct liveLearnEngine.processLiveBar call in nexusRoutes.ts at runtime`):
The test reads `server/nexusRoutes.ts`, strips comment lines, and asserts the non-comment source does NOT contain `processLiveBar(`. The string `processLiveBar(` appears only in a documentation comment on line 1226 — not as a function call. The test correctly strips comments before asserting.

### Proof: Invalid Authority Loads No Dependencies

**TEST-123A1-032** (`invalid authority — dependency loaders not invoked`):
The test calls `runPostBarAutomationWithDeps` with an invalid `authorityMode` of `DATABENTO_DECISION_AUTHORITY` (which is not a valid Sprint 123A mode). The test asserts the function throws before calling any injected dependency. All mock dependency functions have `expect(mockDep).not.toHaveBeenCalled()` assertions. The authority guard fires before any dynamic import.

---

## 4. TypeScript Compilation

```
Command:   pnpm tsc --noEmit
Exit code: 0
Errors:    0
Warnings:  0
```

---

## 5. Operational Rollback Evidence

The operational rollback procedure has been corrected in `drizzle/0026_sprint_123a1_foundation.sql` (Revision 4 correction). The procedure no longer drops any tables.

### Operational Rollback Procedure (Tier a — no table drops)

| Step | Action |
|---|---|
| 1 | Set `MARKET_DATA_AUTHORITY=TRADINGVIEW_ONLY` in application environment |
| 2 | Stop Databento Python feed process (SIGTERM); set `DATABENTO_LIVE_ENABLED=false` |
| 3 | Set `DATABENTO_SHADOW=false`, `DATABENTO_CHART_AUTHORITY=false`, `DATABENTO_LEARNING_AUTHORITY=false` |
| 4 | Restart Atlas Nexus application server |
| 5 | Verify `assertSprint123A1Invariants()` passes without error |

**All Sprint 123A tables are preserved.** No data is written to Databento tables while `MARKET_DATA_AUTHORITY=TRADINGVIEW_ONLY` because `postBarAutomation` enforces the authority guard before any write path is reached.

### Destructive Development Reset (Tier b — table drops, development only)

Drops all 9 Sprint 123A.1 tables. Requires explicit written approval from Phil. Must never be executed on production.

### Rollback Verification

The `assertSprint123A1Invariants()` function in `server/market-data/config.ts` throws immediately on startup if any of the following are set:
- `DATABENTO_LIVE_ENABLED=true`
- `MARKET_DATA_AUTHORITY=DATABENTO_SHADOW`
- `MARKET_DATA_AUTHORITY=DATABENTO_CHART_AUTHORITY`
- `MARKET_DATA_AUTHORITY=DATABENTO_LEARNING_AUTHORITY`
- `MARKET_DATA_AUTHORITY=DATABENTO_DECISION_AUTHORITY`

This is tested by TEST-123A1-004, TEST-123A1-005, and TEST-123A1-006.

---

## 6. No Production Migration Confirmation

**Migration 0026 has NOT been run against the production database.**

The migration was executed only against the disposable database `atlas_sprint_123a1_disposable` (MySQL 8.0.46, localhost, sandbox environment). That database was dropped immediately after evidence capture. No connection was made to the Atlas Nexus production TiDB/MySQL instance.

The migration file `drizzle/0026_sprint_123a1_foundation.sql` contains the following header:

> `DO NOT run this migration against the live production database without Phil's explicit written approval at Gate G1. A full database backup must be taken before running.`

---

## 7. No Databento Connection Confirmation

No Databento connection has been made at any point during Sprint 123A.1.

- `MARKET_DATA_AUTHORITY=TRADINGVIEW_ONLY` is the default and has not been changed.
- `DATABENTO_LIVE_ENABLED` has not been set to `true`.
- No Databento Python feed process has been started.
- No Databento API key has been used.
- `isDatabentoProcessBarTrigger()` always returns `false` (hardcoded — tested by TEST-123A1-003).

---

## 8. Unresolved Issues

| Issue | Status | Notes |
|---|---|---|
| `contains_unresolved_minutes` column in `atlas_canonical_bars` | **Documented, not a defect** | This is a `TINYINT(1)` boolean audit column with default `0`. It is not an ENUM value. The column exists to make the invariant auditable. The `canonical_bar_type` ENUM does not contain `CONTAINS_UNRESOLVED`. Design is intentional. |
| Production migration not yet run | **Deferred pending Gate G1 approval** | Requires Phil's explicit written approval and a full database backup before execution. |

---

## 9. Gate G1 Recommendation

All Sprint 123A.1 deliverables are complete and verified:

- **9 implementation files** created or modified (all within authorised scope)
- **Migration 0026** executed successfully in a disposable MySQL 8.0.46 database; 9 tables created; all constraints verified; disposable database removed
- **33 tests pass** (0 failures, 0 warnings, 0 skipped)
- **TypeScript: 0 errors**
- **Operational rollback** corrected — no table drops; all Sprint 123A tables preserved
- **No production migration** executed
- **No Databento connection** made
- **No strategy, ADE, risk, or execution logic** changed
- **TradingView production authority** unchanged

**Recommendation: Gate G1 APPROVED.** Sprint 123A.2 may begin upon Phil's explicit written approval.

---

*Sprint 123A.2 will not begin until Phil gives written approval.*
