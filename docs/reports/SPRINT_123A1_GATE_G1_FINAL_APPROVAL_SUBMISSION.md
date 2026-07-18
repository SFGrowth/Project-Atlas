# Sprint 123A.1 — Gate G1 Final Approval Submission

**Document:** SPRINT_123A1_GATE_G1_FINAL_APPROVAL_SUBMISSION.md
**Revision:** 1 (Final)
**Date:** 2026-07-19
**Branch:** sprint/123a-1-foundation
**Status:** Awaiting Gate G1 written approval from Phil

---

## 1. Final Implementation SHA

| Item | SHA |
|---|---|
| Implementation content | `c42e856d1f7b9bb0ae5360bee35254fa2d8d0eee` |
| Rev 5 evidence commit | `16ecba21b5def53b05be3dc5e88e698bfd1a8ab5` |
| Final approval submission commit | TBD (this document) |

---

## 2. Complete Changed-File List

All files changed from baseline `0906a80` to current HEAD on branch `sprint/123a-1-foundation`.

### Sprint 123A Architecture Documents (docs/architecture/)

| File | Status |
|---|---|
| `ATLAS_CANONICAL_MARKET_EVENT_CONTRACTS.md` (Rev 6) | Added |
| `ATLAS_DATA_SOURCE_AUTHORITY_MATRIX.md` | Added |
| `ATLAS_EFFECTIVELY_ONCE_PROCESSING.md` | Added |
| `BDE_CAPABILITY_STATUS.md` | Added |
| `BEHAVIOUR_SYSTEM_MIGRATION_PLAN.md` | Added |
| `DATABENTO_CONTRACT_MAPPING_AND_ROLL_POLICY.md` | Added |
| `DATABENTO_DEPLOYMENT_TOPOLOGY.md` | Added |
| `DATABENTO_NO_TRADE_AND_GAP_POLICY.md` | Added |
| `DATABENTO_PARITY_CERTIFICATION_SPEC.md` | Added |
| `DATABENTO_PYTHON_FEED_SERVICE_SPEC.md` | Added |
| `SPRINT-123A-IMPLEMENTATION-PLAN.md` | Added |
| `SPRINT_123A1_GATE_G1_EVIDENCE_SUBMISSION.md` | Added |
| `SPRINT_123A_AMENDED_IMPLEMENTATION_PLAN.md` | Added |
| `SPRINT_123A_AMENDMENT_REPORT.md` | Added |
| `SPRINT_123A_DEPENDENCY_DIAGRAM.md` | Added |
| `SPRINT_123A_GATE_G0_CONTRACT_RECONCILIATION.md` | Added |
| `SPRINT_123A_GATE_G0_CORRECTION_REPORT.md` | Added |
| `SPRINT_123A_GATE_G0_FINAL_APPROVAL_SUBMISSION.md` | Added |
| `SPRINT_123A_GATE_G0_FINAL_RECONCILIATION.md` | Added |
| `SPRINT_123A_GATE_G0_FINAL_VERIFICATION.md` | Added |
| `SPRINT_123A_GATE_MATRIX.md` | Added |
| `SPRINT_123A_REV4_CONTEXT.md` | Added |
| `SPRINT_123A_REV5_CONTEXT.md` | Added |
| `SPRINT_123A_RISK_REGISTER.md` | Added |
| `SPRINT_123A_TEST_MANIFEST.md` (Rev 6, 76 tests) | Added |

### Evidence Reports (docs/reports/)

| File | Status |
|---|---|
| `SPRINT_123A1_GATE_G1_EVIDENCE_REVISION_4.md` | Added |
| `SPRINT_123A1_GATE_G1_EVIDENCE_REVISION_5.md` | Added |
| `SPRINT_123A1_GATE_G1_FINAL_APPROVAL_SUBMISSION.md` | Added (this file) |

### Implementation Files

| File | Status | Description |
|---|---|---|
| `drizzle/0026_sprint_123a1_foundation.sql` | Added | 9-table migration with CHECK constraint |
| `drizzle/meta/_journal.json` | Modified | Migration journal entry added |
| `drizzle/schema.ts` | Modified | 9 Sprint 123A.1 tables + `chk_canonical_no_unresolved` |
| `server/automation/postBarAutomation.ts` | Added | Post-bar automation with DI and authority guard |
| `server/market-data/config.ts` | Added | Feature flag configuration |
| `server/nexusRoutes.ts` | Modified | Direct `processLiveBar` replaced with `runPostBarAutomation` |
| `server/scheduledJobs.ts` | Modified | Monthly review G-002 fix |
| `server/sprint-123a1.test.ts` | Added | 33 unit/runtime/structural tests |
| `server/sprint-123a1-integration.test.ts` | Added | 7 integration tests |
| `shared/types/canonical-events.ts` | Added | Canonical TypeScript event contracts |
| `package.json` | Modified | `supertest` dev dependency added |
| `pnpm-lock.yaml` | Modified | Lock file updated |

---

## 3. Complete Test Evidence

### Test Command

```
pnpm vitest run server/sprint-123a1.test.ts server/sprint-123a1-integration.test.ts --reporter=verbose
```

### Final Result

```
Test Files  2 passed (2)
     Tests  40 passed (40)
  Start at  22:03:43
  Duration  1.07s (transform 351ms, setup 0ms, collect 353ms, tests 627ms, environment 0ms, prepare 139ms)
```

**40 tests passed. 0 failed. 0 skipped.**

### All 40 Tests

| # | Test ID | Suite | Type | Result |
|---|---|---|---|---|
| 1 | TEST-123A1-001 | Feature Flag — `TRADINGVIEW_ONLY` default | unit | ✓ PASS |
| 2 | TEST-123A1-002 | Feature Flag — `DATABENTO_SHADOW` disabled | unit | ✓ PASS |
| 3 | TEST-123A1-003 | Feature Flag — `isDatabentoProcessBarTrigger` always false | unit | ✓ PASS |
| 4 | TEST-123A1-004 | Feature Flag — `DATABENTO_CHART_AUTHORITY` disabled | unit | ✓ PASS |
| 5 | TEST-123A1-005 | Feature Flag — `DATABENTO_LEARNING_AUTHORITY` disabled | unit | ✓ PASS |
| 6 | TEST-123A1-006 | Feature Flag — `assertSprint123A1Invariants` passes | unit | ✓ PASS |
| 7 | TEST-123A1-027 | `DATABENTO_DECISION_AUTHORITY` absent from Sprint 123A type | unit | ✓ PASS |
| 8 | TEST-123A1-028 | `getMarketDataAuthority` throws on `DATABENTO_DECISION_AUTHORITY` | unit | ✓ PASS |
| 9 | TEST-123A1-007 | Authority Matrix — Databento rejected in `TRADINGVIEW_ONLY` | unit | ✓ PASS |
| 10 | TEST-123A1-008 | Authority Matrix — TradingView accepted in `TRADINGVIEW_ONLY` | unit | ✓ PASS |
| 11 | TEST-123A1-009 | Authority Matrix — Databento accepted in `DATABENTO_SHADOW` | unit | ✓ PASS |
| 12 | TEST-123A1-010 | Authority Matrix — TradingView accepted in `DATABENTO_SHADOW` | unit | ✓ PASS |
| 13 | TEST-123A1-011 | Authority Matrix — Databento accepted in `DATABENTO_CHART_AUTHORITY` | unit | ✓ PASS |
| 14 | TEST-123A1-012 | Authority Matrix — TradingView accepted in `DATABENTO_CHART_AUTHORITY` | unit | ✓ PASS |
| 15 | TEST-123A1-013 | Authority Matrix — invalid combo rejected | unit | ✓ PASS |
| 16 | TEST-123A1-014 | Subsystem Isolation — `liveLearnEngine` called in valid TradingView flow | unit | ✓ PASS |
| 17 | TEST-123A1-015 | Subsystem Isolation — DARWIN called in valid TradingView flow | unit | ✓ PASS |
| 18 | TEST-123A1-016 | Subsystem Isolation — `behaviourEngine` called in valid TradingView flow | unit | ✓ PASS |
| 19 | TEST-123A1-017 | Subsystem Isolation — `liveLearnEngine` failure does not stop DARWIN | unit | ✓ PASS |
| 20 | TEST-123A1-018 | Subsystem Isolation — DARWIN failure does not stop `behaviourEngine` | unit | ✓ PASS |
| 21 | TEST-123A1-019 | Subsystem Isolation — no subsystem runs after authority violation | unit | ✓ PASS |
| 22 | TEST-123A1-020 | Subsystem Isolation — `processBar` never called by `postBarAutomation` (source boundary) | unit | ✓ PASS |
| 23 | TEST-123A1-021 | Monthly Review — `handleMonthlyReview` calls `runMonthlyAudit` exactly once | runtime | ✓ PASS |
| 24 | TEST-123A1-021B | Monthly Review — audit failure surfaced correctly | runtime | ✓ PASS |
| 25 | TEST-123A1-029 | Nexus Flow — `nexusRoutes.ts` invokes `runPostBarAutomation` | runtime | ✓ PASS |
| 26 | TEST-123A1-030 | Nexus Flow — `nexusRoutes.ts` still invokes `processBar` exactly once | runtime | ✓ PASS |
| 27 | TEST-123A1-031 | Nexus Flow — no direct `liveLearnEngine.processLiveBar` in `nexusRoutes.ts` | runtime | ✓ PASS |
| 28 | TEST-123A1-032 | Nexus Flow — invalid authority loads no dependencies | runtime | ✓ PASS |
| 29 | TEST-123A1-022 | Migration 0026 — `CONTAINS_UNRESOLVED` absent from all ENUMs | structural | ✓ PASS |
| 30 | TEST-123A1-023 | Migration 0026 — effective-once unique constraints present | structural | ✓ PASS |
| 31 | TEST-123A1-024 | Migration 0026 — `DECIMAL(20,0)` for nanosecond timestamps | structural | ✓ PASS |
| 32 | TEST-123A1-025 | Migration 0026 — `reconciliation_status` is an ENUM column | structural | ✓ PASS |
| 33 | TEST-123A1-026 | Migration 0026 — separated rollback tiers present | structural | ✓ PASS |
| 34 | INT-001 | Integration — `processBar` called exactly once per valid TradingView bar | integration | ✓ PASS |
| 35 | INT-002 | Integration — `runPostBarAutomation` called exactly once per valid TradingView bar | integration | ✓ PASS |
| 36 | INT-003 | Integration — `liveLearnEngine.processLiveBar` NOT called directly from `nexusRoutes` | integration | ✓ PASS |
| 37 | INT-004 | Integration — persisted bar payload passed correctly to `runPostBarAutomation` | integration | ✓ PASS |
| 38 | INT-005 | Integration — webhook response not blocked by post-bar processing | integration | ✓ PASS |
| 39 | INT-006 | Integration — automation failure does not suppress `processBar` | integration | ✓ PASS |
| 40 | INT-007 | Integration — duplicate webhook returns 200 duplicate; no second `postBarAutomation` | integration | ✓ PASS |

### Expected stderr (Intentional Error-Path Tests)

The following stderr lines are expected and correct. They are produced by tests that deliberately inject error conditions to prove isolation and guard behaviour:

| Source | stderr content | Reason expected |
|---|---|---|
| TEST-123A1-007 | `[Atlas config] INVARIANT VIOLATION: In TRADINGVIEW_ONLY mode...` | Test deliberately sends Databento trigger to prove guard fires |
| TEST-123A1-017 | `[postBarAutomation] liveLearnEngine error: ...` | Test deliberately makes `liveLearnEngine` throw to prove DARWIN continues |
| TEST-123A1-018 | `[postBarAutomation] DARWIN error: ...` | Test deliberately makes DARWIN throw to prove `behaviourEngine` continues |
| TEST-123A1-019 | `[Atlas config] INVARIANT VIOLATION: ...` | Test deliberately sends invalid authority to prove all subsystems are blocked |
| TEST-123A1-032 | `[Atlas config] INVARIANT VIOLATION: ...` | Test deliberately sends invalid authority to prove no dynamic imports fire |
| INT-006 | `[POST_BAR_AUTO] runPostBarAutomation error: Error: Automation failure` | Test deliberately makes `postBarAutomation` throw to prove `processBar` is not suppressed |

**No unexpected stderr lines remain.** The `[MONITOR] Bar evaluation error: TypeError: Cannot read properties of undefined (reading 'signalFired')` lines that appeared in Rev 5 have been eliminated by restoring `mockProcessBar` default resolved values in `beforeEach`.

---

## 4. TypeScript Compilation

```
Command:   pnpm tsc --noEmit
Exit code: 0
Errors:    0
Warnings:  0
```

---

## 5. MySQL CHECK Constraint Evidence

### Constraint Definition (from `SHOW CREATE TABLE atlas_canonical_bars`)

```sql
CONSTRAINT `chk_canonical_no_unresolved`
  CHECK ((`contains_unresolved_minutes` = 0))
```

### Three-Test Proof (MySQL 8.0.46, disposable database `atlas_chk_test`)

| Test | SQL | Expected | Result |
|---|---|---|---|
| TEST-CHK-001 | `INSERT ... contains_unresolved_minutes = 0 ...` | Row inserted | `INSERT_0_SUCCEEDED` ✓ |
| TEST-CHK-002 | `INSERT ... contains_unresolved_minutes = 1 ...` | Constraint violation | `ERROR 3819 (HY000): Check constraint 'chk_canonical_no_unresolved' is violated.` ✓ |
| TEST-CHK-003 | `SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE COLUMN_NAME='canonical_bar_type'` | `CONTAINS_UNRESOLVED` absent | `enum('LIVE_CONFIRMED','CONTAINS_SYNTHETIC','RECOVERED')` ✓ |

### `SHOW CREATE TABLE atlas_canonical_bars` (abridged)

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
  KEY `idx_atlas_canonical_bars_authority_ts` (`authority_source`,`bar_open_ts_ms`),
  CONSTRAINT `chk_canonical_no_unresolved` CHECK ((`contains_unresolved_minutes` = 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
```

---

## 6. Disposable Migration Evidence

Full migration evidence is recorded in `docs/reports/SPRINT_123A1_GATE_G1_EVIDENCE_REVISION_4.md` (Section 2). Summary:

| Field | Value |
|---|---|
| Engine | MySQL 8.0.46-0ubuntu0.24.04.3 |
| Database | `atlas_sprint_123a1_disposable` (created and destroyed) |
| Migration command | `sudo mysql -u root atlas_sprint_123a1_disposable < drizzle/0026_sprint_123a1_foundation.sql` |
| Exit code | 0 |
| Tables created | 9 |
| `CONTAINS_UNRESOLVED` in any ENUM | 0 (absent) |
| `chk_canonical_no_unresolved` CHECK constraint | Present and enforced |
| Destructive reset executed | Yes (all 9 tables dropped) |
| Disposable database removed | Yes (`DROP DATABASE` confirmed) |

The CHECK constraint proof above used a second disposable database `atlas_chk_test`, also created and dropped in the same session.

---

## 7. No Production Migration Confirmation

**Migration 0026 has NOT been run against the production database.**

The migration was executed only against two disposable databases (`atlas_sprint_123a1_disposable` and `atlas_chk_test`), both on MySQL 8.0.46 in the sandbox environment. Both databases were dropped immediately after evidence capture. No connection was made to the Atlas Nexus production TiDB/MySQL instance.

---

## 8. No Databento Connection Confirmation

No Databento connection has been made at any point during Sprint 123A.1.

- `MARKET_DATA_AUTHORITY=TRADINGVIEW_ONLY` is the default and has not been changed.
- `DATABENTO_LIVE_ENABLED` has not been set to `true`.
- No Databento Python feed process has been started.
- No Databento API key has been used.
- `isDatabentoProcessBarTrigger()` always returns `false` (hardcoded — tested by TEST-123A1-003).
- `DATABENTO_DECISION_AUTHORITY` is absent from the `Sprint123AAuthorityMode` type and throws if called (tested by TEST-123A1-028).

---

## 9. Operational Rollback Procedure

The Tier 1 Operational Rollback in `drizzle/0026_sprint_123a1_foundation.sql` does **not** drop any tables. It:

1. Sets `MARKET_DATA_AUTHORITY = TRADINGVIEW_ONLY` in `atlas_feature_flags`
2. Disables all Databento services (`databento_live_enabled = FALSE`, `databento_shadow_enabled = FALSE`, `databento_chart_authority = FALSE`, `databento_learning_authority = FALSE`)
3. Stops Databento consumers by setting `databento_consumer_active = FALSE`
4. Preserves all Sprint 123A tables and all evidence
5. Stops new writes to Databento-specific tables by setting `databento_writes_enabled = FALSE`

The Tier 2 Destructive Reset (development-only) drops all 9 Sprint 123A.1 tables. It is explicitly labelled `-- DEVELOPMENT ONLY` and must never be run in production.

---

## 10. Unresolved Issues

There are no unresolved issues. The `contains_unresolved_minutes` column design question raised in Rev 4 has been resolved: the column is retained as a boolean audit field, and the invariant is now enforced at the MySQL storage engine level by `CONSTRAINT chk_canonical_no_unresolved CHECK (contains_unresolved_minutes = 0)`. This is confirmed by TEST-CHK-001 and TEST-CHK-002 above.

---

## 11. Explicit Gate G1 Recommendation

All Sprint 123A.1 deliverables are complete and verified across six rounds of review:

- **12 implementation files** created or modified (all within authorised scope)
- **40 tests pass** across 2 test files (33 unit/runtime/structural + 7 integration)
- **7 integration tests** prove runtime behaviour via real Express route invocation with mocked dependencies
- **TypeScript: 0 errors**
- **MySQL CHECK constraint** `chk_canonical_no_unresolved` enforced at storage engine level — INSERT with `contains_unresolved_minutes = 1` returns `ERROR 3819 (HY000)` in MySQL 8.0.46
- **Migration 0026** executed successfully in two disposable MySQL 8.0.46 databases; both dropped
- **Operational rollback** preserves all tables — no DROP TABLE in Tier 1
- **No unexpected stderr** in test output
- **No production migration** executed
- **No Databento connection** made
- **No strategy, ADE, risk, or execution logic** changed
- **TradingView production authority** unchanged

**Recommendation: Gate G1 APPROVED.** Sprint 123A.2 may begin upon Phil's explicit written approval.

---

*Sprint 123A.2 will not begin until Phil gives written approval.*
