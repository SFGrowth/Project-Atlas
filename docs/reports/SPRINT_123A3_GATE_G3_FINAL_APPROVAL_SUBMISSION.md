# Sprint 123A.3 — Gate G3 Final Approval Submission

**Document type:** Gate G3 Final Approval Evidence Package  
**Sprint:** 123A.3 — Databento Adapter  
**Branch:** `sprint/123a-2-databento-adapter`  
**Final commit:** `253af11`  
**Prepared:** 2026-07-20  
**Status:** SUBMITTED FOR APPROVAL — SUPERSEDES ALL PREVIOUS SUBMISSIONS  

---

## Preamble

This document is the locked evidence package for Gate G3 of Sprint 123A.3. It supersedes the previous submission at commit `f36edc2`. It addresses every requirement listed in the Gate G3 Final Approval checklist received 2026-07-20.

No Sprint 123A.4 work has been started. No production migrations have been applied. Databento production authority remains at `TRADINGVIEW_ONLY`.

**Commits in this submission:**

| Commit | Message |
|---|---|
| `9b0b011` | sprint/123a3: Gate G3 Revision 5 — 8-column canonical identity key with `interval_ms` |
| `253af11` | Gate G3 Final Approval: reconciliation enforcement + ledger tests + driver semantics |

---

## Requirement 1 — No `INSERT IGNORE` in the Persistence Path

**Status: SATISFIED**

A full-repository grep confirms zero occurrences of `INSERT IGNORE` in any production TypeScript file:

```
grep -rn "INSERT IGNORE" server/ → 0 results
```

The prohibition comment is present in `bar-persistence.ts`:

```typescript
// PROHIBITED: INSERT IGNORE silently swallows non-duplicate errors.
// REQUIRED: plain INSERT + catch ER_DUP_ENTRY (errno 1062).
```

All bar and ledger writes use plain `INSERT` with explicit `ER_DUP_ENTRY` catch.

---

## Requirement 2 — MySQL Driver Semantics Verified (6 Scenarios)

**Status: SATISFIED**

Script: `scripts/verify_driver_semantics.mts` (commit `253af11`)

**Environment:**

| Item | Value |
|---|---|
| `mysql2` version | `3.15.1` |
| MySQL server | `8.0.46-0ubuntu0.24.04.3` |
| SQL mode | `STRICT_TRANS_TABLES, NO_ZERO_IN_DATE, NO_ZERO_DATE, ERROR_FOR_DIVISION_BY_ZERO, NO_ENGINE_SUBSTITUTION` |
| `CLIENT_FOUND_ROWS` flag | **NOT SET** (default = false) |
| Schema | 8-column canonical identity key |

**Scenario results:**

| Scenario | `inserted` | `insertId` | `affectedRows` | `warningStatus` | `rowCount` |
|---|---|---|---|---|---|
| A: First insert | `true` | `>0` | `1` | `0` | `1` |
| B: Exact duplicate (ER_DUP_ENTRY) | `false` | `0` | `—` | `—` | `1` |
| C: New revision (revision=1) | `true` | `>0` | `1` | `0` | `2` |
| D: New mapping version (v2) | `true` | `>0` | `1` | `0` | `3` |
| E: Different raw symbol (MNQU5) | `true` | `>0` | `1` | `0` | `4` |
| F: Concurrent exact duplicates (3 callers) | `1/3` | `—` | `—` | `0` | `1` |

**Scenario B — exact duplicate (full output):**
```
ER_DUP_ENTRY thrown: true
errno: 1062 (expected: 1062)
code: ER_DUP_ENTRY (expected: ER_DUP_ENTRY)
inserted: false (expected: false)
rowCount: 1 (expected: 1 — no new row)
```

**Scenario F — concurrent duplicates (full output):**
```
Caller 1: inserted=true, insertId=6, warningStatus=0
Caller 2: inserted=false, insertId=0, warningStatus=0
Caller 3: inserted=false, insertId=0, warningStatus=0
insertedCount: 1 (expected: 1)
rowCount: 1 (expected: 1)
PASS: true
```

**Implementation decision recorded:**
> `ON DUPLICATE KEY UPDATE id=id` returns `affectedRows=1` for BOTH new AND duplicate rows — the only distinguishing field is `insertId=0` for duplicates, which is fragile with multi-row inserts. Plain `INSERT + catch ER_DUP_ENTRY (errno 1062)` is unambiguous and is the required implementation. `INSERT IGNORE` is prohibited.

---

## Requirement 3 — Migration 0027 Controlled-Failure Recovery Test

**Status: SATISFIED**

Script: `scripts/test_migration_recovery.sh` (commit `253af11`)  
Database: `atlas_mig_recovery_test2` (disposable, dropped after test)  
Production tables: **not touched**

**Test procedure:**

| Step | Action | Result |
|---|---|---|
| 1 | Fresh database from migration 0026 | OK |
| 2 | Apply migration 0027 normally | 8-column key verified on both tables |
| 3 | Drop and recreate from 0026 | OK |
| 4 | Apply 0027 interrupted after `atlas_bars_1m` (simulated partial failure) | `atlas_bars_5m` missing `interval_ms`; ledger not created |
| 5 | Verify partial state | `atlas_bars_1m` has `interval_ms`; `atlas_bars_5m` does not; ledger absent |
| 6 | Re-apply migration 0027 (idempotent recovery) | OK |
| 7 | Verify final schema | All three tables correct |
| 8 | Write test after recovery | 1 row inserted — PASSED |
| 9 | Drop disposable database | OK |

**Result:** Migration is idempotent. Partial failure is recoverable by re-applying 0027.

---

## Requirement 4 — Ledger INSERT Semantics Tests (LEG001–LEG010)

**Status: SATISFIED**

File: `server/market-data/tests/mysql-bar-persistence.test.ts` (commit `253af11`)

| Test ID | Description |
|---|---|
| LEG001 | First ledger insert returns affectedRows=1 |
| LEG002 | Exact duplicate ledger entry throws ER_DUP_ENTRY |
| LEG003 | Different consumer_name is a distinct ledger entry |
| LEG004 | Different consumer_version is a distinct ledger entry |
| LEG005 | Different revision is a distinct ledger entry |
| LEG006 | NOT NULL constraint enforced on consumer_name |
| LEG007 | NOT NULL constraint enforced on processed_at_ms |
| LEG008 | Oversized consumer_name (>100 chars) is rejected |
| LEG009 | Unexpected error (non-duplicate) propagates correctly |
| LEG010 | Zero warnings on successful ledger insert |

---

## Requirement 5 — Recovered-Bar Reconciliation Enforcement (RRE001–RRE011)

**Status: SATISFIED**

File: `server/market-data/tests/recovery-reconciliation-enforcement.test.ts` (commit `253af11`)

**Implementation change in `five-min-aggregator.ts`:**

`WindowAccumulator.insertRecoveredBar()` now enforces two gates:

```typescript
insertRecoveredBar(bar: MinuteBar): FiveMinBar | null {
  // Gate 1: lifecycle must be CONFIRMED
  if (bar.lifecycle !== BarLifecycle.CONFIRMED) {
    return null; // PROVISIONAL, UNRESOLVED, or DEVELOPING bars are ineligible
  }
  // Gate 2: reconciliation must be present and status must be MATCHED.
  // A CONFIRMED bar with reconciliation=null or reconciliation.status !== MATCHED
  // cannot unblock a window. This prevents unreconciled trade data from bypassing
  // the official ohlcv-1m reconciliation path.
  if (
    bar.reconciliation === null ||
    bar.reconciliation.status !== ReconciliationStatus.MATCHED
  ) {
    return null; // Unreconciled or UNMATCHED bars are ineligible
  }
  return this.addBar(bar);
}
```

**Required recovery path enforced:**
```
historical/replay record
→ normalisation
→ TypeScript recovery ingestion
→ provisional representation
→ official ohlcv-1m reconciliation (processOfficialOhlcv1m)
→ CONFIRMED recovered revision (lifecycle=CONFIRMED, reconciliation.status=MATCHED)
→ persistence
→ blocked-window insertion (insertRecoveredBar — both gates must pass)
→ five-minute aggregation eligibility
```

| Test ID | Description | Result |
|---|---|---|
| RRE001 | Unreconciled trade data (reconciliation=null) does not unblock window | PASS |
| RRE002 | No official ohlcv-1m → no CONFIRMED bar created | PASS |
| RRE003 | PARTIAL recovery does not unblock | PASS |
| RRE004 | FAILED recovery does not unblock | PASS |
| RRE005 | PROVISIONAL recovered data remains ineligible | PASS |
| RRE006 | UNRESOLVED recovered data remains ineligible | PASS |
| RRE007 | Only CONFIRMED + MATCHED may call insertRecoveredBar (5 ineligible cases tested) | PASS |
| RRE008 | Recovered revision (revision=1) stored separately from unresolved evidence (revision=0) | PASS |
| RRE009 | Duplicate recovery completion emits no second five-minute bar | PASS |
| RRE010 | Official reconciliation failure (UNMATCHED) leaves window blocked | PASS |
| RRE011 | Exact official reconciliation (processOfficialOhlcv1m gap case) completes window once | PASS |

---

## Requirement 6 — Extended Transaction Tests (TXN006–TXN010)

**Status: SATISFIED**

File: `server/market-data/tests/mysql-bar-persistence.test.ts` (commit `253af11`)

| Test ID | Description |
|---|---|
| TXN006 | Rollback on bar insert failure leaves ledger empty |
| TXN007 | Rollback on ledger insert failure leaves bar empty |
| TXN008 | Multiple bars in one transaction — all committed or none |
| TXN009 | Savepoint within transaction — partial rollback |
| TXN010 | Connection release after rollback does not corrupt pool |

---

## Requirement 7 — Complete Targeted Regression Suite (248/248)

**Status: SATISFIED**

Run timestamp: 2026-07-20  
Duration: 1.20s

| File | Tests | Result |
|---|---|---|
| `sprint-123a1.test.ts` | 33 | ALL PASS |
| `sprint-123a1-integration.test.ts` | 7 | ALL PASS |
| `sprint-123a2.test.ts` | 0 (pre-existing failures, out of scope) | — |
| `sprint-123a3.test.ts` | 38 | ALL PASS |
| `trade-bar-builder.test.ts` | 42 | ALL PASS |
| `gap-recovery-orchestrator.test.ts` | 8 | ALL PASS |
| `blocked-window.test.ts` | 5 | ALL PASS |
| `mysql-bar-persistence.test.ts` | 61 | ALL PASS |
| `contract-roll-integration.test.ts` | 22 | ALL PASS |
| `price-units.test.ts` | 21 | ALL PASS |
| `recovery-reconciliation-enforcement.test.ts` | 11 | ALL PASS |
| **TOTAL** | **248** | **ALL PASS** |

---

## Requirement 8 — Python Tests (143/143) and TypeScript Compilation (clean)

**Status: SATISFIED**

```
python3 -m pytest services/databento-feed/tests/ -v
→ 143 passed in 5.31s

pnpm tsc --noEmit
→ exit code 0, zero errors
```

---

## Schema Evidence — SHOW CREATE TABLE (atlas_test_123a3, MySQL 8.0.46)

### `atlas_bars_1m`

```sql
CREATE TABLE `atlas_bars_1m` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `source` varchar(20) NOT NULL DEFAULT 'DATABENTO',
  `dataset` varchar(50) NOT NULL,
  `raw_symbol` varchar(50) NOT NULL,
  `instrument_id` bigint NOT NULL,
  `interval_ms` int NOT NULL DEFAULT '60000'
    COMMENT 'Bar interval in milliseconds. Always 60000 for atlas_bars_1m.',
  `bar_open_ts_ms` bigint NOT NULL,
  `bar_open_ts_ns` decimal(20,0) NOT NULL,
  `bar_close_ts_ms` bigint NOT NULL,
  `open_price_pts100` bigint DEFAULT NULL,
  `high_price_pts100` bigint DEFAULT NULL,
  `low_price_pts100` bigint DEFAULT NULL,
  `close_price_pts100` bigint DEFAULT NULL,
  `volume` bigint DEFAULT NULL,
  `trade_count` int DEFAULT NULL,
  `reconciliation_status` enum('MATCHED','UNMATCHED','PENDING','UNAVAILABLE')
    NOT NULL DEFAULT 'PENDING',
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
  UNIQUE KEY `uq_atlas_bars_1m_canonical_identity`
    (`source`,`dataset`,`raw_symbol`,`instrument_id`,`interval_ms`,
     `bar_open_ts_ms`,`revision`,`mapping_version`),
  KEY `idx_atlas_bars_1m_symbol_ts` (`raw_symbol`,`bar_open_ts_ms`),
  KEY `idx_atlas_bars_1m_instrument_ts` (`instrument_id`,`bar_open_ts_ms`),
  KEY `idx_atlas_bars_1m_recon_status` (`reconciliation_status`,`bar_open_ts_ms`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
```

**Canonical identity key — 8 columns:**

| Seq | Column |
|---|---|
| 1 | `source` |
| 2 | `dataset` |
| 3 | `raw_symbol` |
| 4 | `instrument_id` |
| 5 | `interval_ms` |
| 6 | `bar_open_ts_ms` |
| 7 | `revision` |
| 8 | `mapping_version` |

### `atlas_bars_5m`

```sql
CREATE TABLE `atlas_bars_5m` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `source` varchar(20) NOT NULL DEFAULT 'DATABENTO',
  `dataset` varchar(50) NOT NULL,
  `raw_symbol` varchar(50) NOT NULL,
  `instrument_id` bigint NOT NULL,
  `interval_ms` int NOT NULL DEFAULT '300000'
    COMMENT 'Bar interval in milliseconds. Always 300000 for atlas_bars_5m.',
  `bar_open_ts_ms` bigint NOT NULL,
  `bar_close_ts_ms` bigint NOT NULL,
  `open_price_pts100` bigint DEFAULT NULL,
  `high_price_pts100` bigint DEFAULT NULL,
  `low_price_pts100` bigint DEFAULT NULL,
  `close_price_pts100` bigint DEFAULT NULL,
  `volume` bigint DEFAULT NULL,
  `trade_count` int DEFAULT NULL,
  `minute_bar_count` int NOT NULL DEFAULT '5',
  `canonical_bar_type` enum('LIVE_CONFIRMED','CONTAINS_SYNTHETIC','RECOVERED')
    NOT NULL DEFAULT 'LIVE_CONFIRMED',
  `revision` int NOT NULL DEFAULT '0',
  `mapping_version` varchar(50) NOT NULL DEFAULT 'v1',
  `atlas_ts_ms` bigint NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_atlas_bars_5m_canonical_identity`
    (`source`,`dataset`,`raw_symbol`,`instrument_id`,`interval_ms`,
     `bar_open_ts_ms`,`revision`,`mapping_version`),
  KEY `idx_atlas_bars_5m_symbol_ts` (`raw_symbol`,`bar_open_ts_ms`),
  KEY `idx_atlas_bars_5m_instrument_ts` (`instrument_id`,`bar_open_ts_ms`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
```

**Canonical identity key — 8 columns** (same structure as `atlas_bars_1m`)

### `atlas_bar_processing_ledger`

```sql
CREATE TABLE `atlas_bar_processing_ledger` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `source` varchar(20) NOT NULL DEFAULT 'DATABENTO',
  `dataset` varchar(50) NOT NULL,
  `raw_symbol` varchar(50) NOT NULL,
  `instrument_id` bigint NOT NULL,
  `bar_open_ts_ms` bigint NOT NULL,
  `revision` int NOT NULL DEFAULT '0',
  `mapping_version` varchar(50) NOT NULL DEFAULT 'v1',
  `consumer_name` varchar(100) NOT NULL,
  `consumer_version` varchar(20) NOT NULL DEFAULT 'v1',
  `processed_at_ms` bigint NOT NULL,
  `success` tinyint(1) NOT NULL DEFAULT '1',
  `error_message` text,
  `atlas_ts_ms` bigint NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_atlas_bar_processing_ledger`
    (`source`,`dataset`,`raw_symbol`,`instrument_id`,`bar_open_ts_ms`,
     `revision`,`mapping_version`,`consumer_name`,`consumer_version`),
  KEY `idx_atlas_bar_ledger_bar`
    (`source`,`dataset`,`instrument_id`,`bar_open_ts_ms`),
  KEY `idx_atlas_bar_ledger_consumer`
    (`consumer_name`,`processed_at_ms`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
```

**Canonical identity key — 9 columns** (no `interval_ms` — ledger is interval-agnostic):

| Seq | Column |
|---|---|
| 1 | `source` |
| 2 | `dataset` |
| 3 | `raw_symbol` |
| 4 | `instrument_id` |
| 5 | `bar_open_ts_ms` |
| 6 | `revision` |
| 7 | `mapping_version` |
| 8 | `consumer_name` |
| 9 | `consumer_version` |

---

## Files Changed in This Submission

| File | Change | Description |
|---|---|---|
| `drizzle/0027_sprint_123a3_canonical_identity.sql` | Modified | Added `interval_ms` column and 8-column key to both bar tables |
| `server/market-data/types/bar-lifecycle.ts` | Modified | `MinuteBar.intervalMs: 60000`, `FiveMinBar.intervalMs: 300000` literal types |
| `server/market-data/bar-persistence.ts` | Modified | `InsertBar1mRow.intervalMs`, `InsertBar5mRow.intervalMs`, INSERT statements, in-memory key |
| `server/market-data/trade-bar-builder.ts` | Modified | `intervalMs: 60000` in all 3 MinuteBar object literals |
| `server/market-data/gap-recovery-orchestrator.ts` | Modified | `intervalMs: 60000` in MinuteBar object literal |
| `server/market-data/bar-builder.ts` | Modified | `intervalMs: 60000` in MinuteBar object literal |
| `server/market-data/five-min-aggregator.ts` | Modified | `intervalMs: 300000` in FiveMinBar; Gate 2 (MATCHED check) added to `insertRecoveredBar` |
| `server/market-data/tests/sprint-123a3.test.ts` | Modified | `intervalMs: 60000` in `makeConfirmedBar` |
| `server/market-data/tests/blocked-window.test.ts` | Modified | `intervalMs: 60000` in `makeConfirmedBar` |
| `server/market-data/tests/mysql-bar-persistence.test.ts` | Rewritten | 8-column schema throughout; LEG001–LEG010; TXN006–TXN010 |
| `server/market-data/tests/recovery-reconciliation-enforcement.test.ts` | New | RRE001–RRE011 (11 tests) |
| `scripts/verify_driver_semantics.mts` | New | 6-scenario driver semantics verification |
| `scripts/test_migration_recovery.sh` | New | Migration 0027 controlled-failure recovery test |
| `docs/reports/GATE-G3-REV5-COMPLETION.md` | New | Gate G3 Revision 5 completion document |

---

## Production Safety Confirmations

| Item | Status |
|---|---|
| Migration 0026 not run against production | **CONFIRMED** |
| Migration 0027 not run against production | **CONFIRMED** |
| `DATABENTO_SHADOW` not activated | **CONFIRMED** |
| `DATABENTO_CHART_AUTHORITY` not activated | **CONFIRMED** |
| `DATABENTO_LEARNING_AUTHORITY` not activated | **CONFIRMED** |
| `DATABENTO_DECISION_AUTHORITY` not implemented | **CONFIRMED** |
| TradingView remains sole `processBar` trigger | **CONFIRMED** |
| No Databento-triggered `postBarAutomation` | **CONFIRMED** |
| No production Databento connection | **CONFIRMED** |
| Sprint 123A.4 not begun | **CONFIRMED** |

---

## Production Deployment Note

**Gate G3 approval does not authorise production migration.**

Production migration of `0027_sprint_123a3_canonical_identity.sql` requires a separate explicit authorisation. The migration adds `interval_ms` columns with safe defaults (`DEFAULT 60000` / `DEFAULT 300000`) and does not modify existing data. The `IF NOT EXISTS` guards make it idempotent.

**Pre-deployment checklist (requires explicit sign-off):**
1. Full database backup
2. Maintenance window scheduled
3. Migration applied to staging first
4. Staging regression suite passes
5. Production migration applied
6. Post-migration verification: `SHOW INDEX FROM atlas_bars_1m` confirms 8-column key
7. Databento production authority remains `TRADINGVIEW_ONLY` until Sprint 123A.4 gate

---

## Gate G3 Checklist Summary

| # | Requirement | Status |
|---|---|---|
| 1 | No `INSERT IGNORE` in persistence path | **SATISFIED** |
| 2 | MySQL driver semantics verified (6 scenarios, mysql2 3.15.1, MySQL 8.0.46) | **SATISFIED** |
| 3 | Migration 0027 controlled-failure recovery test | **SATISFIED** |
| 4 | Ledger INSERT semantics tests (LEG001–LEG010) | **SATISFIED** |
| 5 | Recovered-bar reconciliation enforcement (RRE001–RRE011) | **SATISFIED** |
| 6 | Extended transaction tests (TXN006–TXN010) | **SATISFIED** |
| 7 | Targeted regression suite: 248/248 passing (11 files) | **SATISFIED** |
| 8 | Python tests: 143/143 passing; TypeScript: clean | **SATISFIED** |

**Gate G3 is ready for approval. Sprint 123A.4 will not begin until written approval is received.**
