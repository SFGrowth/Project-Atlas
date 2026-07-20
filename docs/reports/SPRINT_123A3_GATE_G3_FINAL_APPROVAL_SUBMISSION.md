# Sprint 123A.3 — Gate G3 Final Approval Submission

**Implementation SHA:** `f36edc220d46c11479fcff7b205e604ba48f0fe4`
**Branch:** `sprint/123a-2-databento-adapter`
**Gate G2 approved SHA:** `1b73c5d2e087b5a5228446df1bf8bd8298a69a4b`
**Date:** 2026-07-20

---

## 1. Regression Results

| Suite | Tests | Warnings | Result |
|-------|-------|----------|--------|
| Sprint 123A.1 unit (`sprint-123a1.test.ts`) | 35 | 0 | ALL PASS |
| Sprint 123A.1 integration (`sprint-123a1-integration.test.ts`) | 7 | 0 | ALL PASS |
| Sprint 123A.2 TypeScript (`sprint-123a2.test.ts`) | 31 | 0 | ALL PASS |
| Sprint 123A.3 — `sprint-123a3.test.ts` | 62 | 0 | ALL PASS |
| Sprint 123A.3 — `trade-bar-builder.test.ts` | 12 | 0 | ALL PASS |
| Sprint 123A.3 — `gap-recovery-orchestrator.test.ts` | 9 | 0 | ALL PASS |
| Sprint 123A.3 — `blocked-window.test.ts` | 5 | 0 | ALL PASS |
| Sprint 123A.3 — `mysql-bar-persistence.test.ts` | 46 | 0 | ALL PASS |
| Sprint 123A.3 — `contract-roll-integration.test.ts` | 7 | 0 | ALL PASS |
| Sprint 123A.3 — `price-units.test.ts` | 8 | 0 | ALL PASS |
| Sprint 123A.2 Python (all 10 files) | 143 | 0 | ALL PASS |
| `pnpm tsc --noEmit` | — | — | Exit 0 |
| **Total** | **365** | **0** | **ALL PASS** |

Expected stderr: 9 lines (INT-006 automation failure log, topology rejection warnings). Unexpected stderr: none.

---

## 2. Sprint 123A.3 Implementation Evidence

### 2.1 One-Minute Bar Lifecycle

**File:** `server/market-data/trade-bar-builder.ts`

`TradeBarBuilder` implements the full two-source lifecycle:

| State | Trigger | Description |
|-------|---------|-------------|
| `DEVELOPING` | Individual `databento:trade` event | Accumulates open/high/low/close/volume from real trades |
| `PROVISIONAL` | Minute boundary closes | Bar is complete but not yet reconciled |
| `CONFIRMED` | Official `ohlcv-1m` record arrives and reconciliation passes | Canonical bar |
| `UNRESOLVED` | Official record arrives but reconciliation fails, or timeout | Evidence row |

**Tests:** TEST-123A3-TRD001 through TRD012 (12 tests)

Key invariants proven:
- `CONFIRMED` is only reachable via official ohlcv-1m reconciliation — never from internal consistency alone
- `UNRESOLVED` bars are stored as evidence rows, not in `atlas_canonical_bars`
- Duplicate trade events are deduplicated by sequence number
- Nanosecond timestamps are preserved via BigInt throughout

### 2.2 Official-Bar Reconciliation

**File:** `server/market-data/bar-reconciler.ts`

`BarReconciler` validates OHLCV consistency (high ≥ open/close/low, low ≤ open/close/high, all fields positive), computes deltas, and applies tolerance-based CONFIRMED/UNRESOLVED transitions.

**Tests:** TEST-123A3-REC001 through REC008 (8 tests in sprint-123a3.test.ts)

### 2.3 Five-Minute Aggregation

**File:** `server/market-data/five-min-aggregator.ts`

`FiveMinAggregator` + `WindowAccumulator` with `BLOCKED_UNRESOLVED` state:

| State | Condition | Behaviour |
|-------|-----------|-----------|
| `ACCUMULATING` | < 5 bars, all CONFIRMED | Accepts more bars |
| `BLOCKED_UNRESOLVED` | Any UNRESOLVED bar in window | Holds window open for recovery |
| `COMPLETE` | 5 CONFIRMED bars | Emits exactly once |

Six invariants enforced at runtime: exactly 5 bars, all CONFIRMED, no UNRESOLVED, contiguous, 5-min boundary aligned, same instrument.

**Tests:** TEST-123A3-AGG001 through AGG011, TEST-123A3-BLK001 through BLK005 (16 tests)

### 2.4 Gap Recovery Integration

**File:** `server/market-data/gap-recovery-orchestrator.ts`

`GapRecoveryOrchestrator` connects `bar:gap-detected` events from `TradeBarBuilder` to the Python `RecoveryManager` via the bridge server:

- `recovery:complete` → unblocks BLOCKED_UNRESOLVED windows
- `recovery:partial` → logs, does NOT call `on_complete`, does NOT unblock
- `recovery:failed` → emits `recovery:exhausted`
- Deduplicates concurrent requests for the same gap

**Tests:** TEST-123A3-GRO001 through GRO009 (9 tests)

### 2.5 Contract Definition and Symbol Mapping

**File:** `server/market-data/contract-manager.ts`

`ContractManager` stores definitions, processes symbol mappings, detects rolls via active-symbol change, and provides `isNearExpiry()` with configurable warning window.

**Tests:** TEST-123A3-CRL001 through CRL007 (7 tests using approved DBN-decoded fixture)

### 2.6 Effectively-Once Persistence

**File:** `server/market-data/bar-persistence.ts`

`BarPersistence` with `MySQLBarDatabaseAdapter`:

- Plain `INSERT` followed by `ER_DUP_ENTRY` (errno 1062) catch — unambiguous semantics
- Returns `{ inserted: boolean, insertId: number, warningStatus: number }`
- Writes only to `atlas_bars_1m`, `atlas_bars_5m`, `atlas_bar_processing_ledger`
- Does NOT write to `atlas_canonical_bars`
- Explicit transactions for multi-row writes
- `warningStatus === 0` asserted after every clean insert

**Tests:** TEST-123A3-PER001 through PER031, MYS001-006, TXN001-005, SCH001-003, MIG001 (46 tests)

---

## 3. Database Schema Evidence

### 3.1 Migration History

| Migration | File | Status |
|-----------|------|--------|
| 0026 | `0026_sprint_123a1_foundation.sql` | Existing (Gate G1 approved) |
| 0027 | `0027_sprint_123a3_canonical_identity.sql` | New (Sprint 123A.3) |

Migration 0027 uses a stored procedure for conditional `DROP INDEX` (MySQL 8.0 does not support `DROP INDEX IF EXISTS` in `ALTER TABLE`). The migration is idempotent.

### 3.2 Canonical Identity Keys

**`atlas_bars_1m`:**
```sql
UNIQUE KEY `uq_atlas_bars_1m_canonical_identity`
  (`source`, `dataset`, `raw_symbol`, `instrument_id`,
   `bar_open_ts_ms`, `revision`, `mapping_version`)
```

**`atlas_bars_5m`:**
```sql
UNIQUE KEY `uq_atlas_bars_5m_canonical_identity`
  (`source`, `dataset`, `raw_symbol`, `instrument_id`,
   `bar_open_ts_ms`, `revision`, `mapping_version`)
```

**`atlas_bar_processing_ledger`:**
```sql
UNIQUE KEY `uq_atlas_bar_processing_ledger`
  (`source`, `dataset`, `raw_symbol`, `instrument_id`,
   `bar_open_ts_ms`, `revision`, `mapping_version`,
   `consumer_name`, `consumer_version`)
```

Note: `interval_ms` is **not** a column in `atlas_bars_1m` or `atlas_bars_5m`. The Revision 3 evidence document incorrectly listed it as part of the key. The actual key is 7 columns (1m/5m) or 9 columns (ledger).

### 3.3 ER_DUP_ENTRY Empirical Verification

Verified against disposable MySQL 8.0 (`/tmp/mysql_test.sock`):

| Scenario | `inserted` | `insertId` | `warningStatus` |
|----------|-----------|-----------|----------------|
| First insert | `true` | `> 0` | `0` |
| Exact duplicate | `false` (caught) | `0` | `0` |
| `SHOW WARNINGS` after duplicate | — | — | Level='Error' (not Level='Warning') |

`SHOW WARNINGS` after a caught `ER_DUP_ENTRY` returns one entry with `Level='Error'` (the duplicate key error). This is MySQL's per-connection warning buffer retaining the last error. The `warningStatus` field in `PersistenceResult` reflects `OkPacket.warningStatus` from clean inserts only. PER025 asserts zero `Level='Warning'` entries (data truncation, implicit conversion) — not zero total entries.

---

## 4. Price Unit Standardisation Evidence

| Field | Raw value | Scale | Human value |
|-------|-----------|-------|-------------|
| `min_price_increment` | `250_000_000` | ÷ 1e9 | 0.25 pts = 25 pts100 |
| OHLCV prices | e.g. `19_250_000_000_000` | ÷ 1e9 | 19,250.00 pts |
| Storage (`pts100`) | e.g. `1_925_000` | ÷ 100 | 19,250.00 pts |

Previous fixture had `min_price_increment = 2_500_000` (100× too small, representing 0.0025 pts). Corrected to `250_000_000`.

`mnq_definition_record.dbn` regenerated. SHA-256: `9eb60ddd5394f961ee4c3df5cefff7c84132800b1d47a964394ec2166f270a9d`

---

## 5. UNRESOLVED Bar Persistence Policy

| Bar state | Destination | `reconciliation_status` | `atlas_canonical_bars` |
|-----------|-------------|------------------------|----------------------|
| CONFIRMED | `atlas_bars_1m` | `MATCHED` | Not written |
| UNRESOLVED | `atlas_bars_1m` | `UNMATCHED` | Not written |
| Recovered bar | `atlas_bars_1m` | `MATCHED`, `revision = 1` | Not written |

Recovery creates a new row with `revision = 1` — no collision with the UNRESOLVED evidence row at `revision = 0`. The canonical identity key includes `revision`, so both rows coexist.

---

## 6. Production Safety Confirmations

| Item | Status |
|------|--------|
| Migration 0026 not run against production | **CONFIRMED** |
| Migration 0027 not run against production | **CONFIRMED** |
| DATABENTO_SHADOW not activated | **CONFIRMED** |
| DATABENTO_CHART_AUTHORITY not activated | **CONFIRMED** |
| DATABENTO_LEARNING_AUTHORITY not activated | **CONFIRMED** |
| DATABENTO_DECISION_AUTHORITY not implemented | **CONFIRMED** |
| TradingView remains sole `processBar` trigger | **CONFIRMED** |
| No Databento-triggered `postBarAutomation` | **CONFIRMED** |
| No production Databento connection | **CONFIRMED** |
| No production chart cutover | **CONFIRMED** |
| Sprint 123A.4 not begun | **CONFIRMED** |

---

## 7. Gate G3 Recommendation

All Sprint 123A.3 Gate G3 requirements are satisfied:

- One-minute lifecycle tests: **TEST-123A3-TRD001–TRD012** (12 tests)
- Official-bar reconciliation evidence: **TEST-123A3-REC001–REC008** (8 tests)
- Unresolved-bar blocking evidence: **TEST-123A3-BLK001–BLK005** (5 tests)
- Five-minute aggregation evidence: **TEST-123A3-AGG001–AGG011** (11 tests)
- Gap recovery evidence: **TEST-123A3-GRO001–GRO009** (9 tests)
- Contract mapping and rollover evidence: **TEST-123A3-CRL001–CRL007** (7 tests)
- Effectively-once and duplicate handling evidence: **TEST-123A3-PER001–PER031, MYS001–006, TXN001–005** (42 tests)
- Migration compatibility evidence: **TEST-123A3-MIG001, SCH001–003** (4 tests)
- Rollback evidence: `InMemoryBarDatabaseAdapter` provides clean rollback path; MySQL transactions tested in TXN001–005
- No production authority changed: **CONFIRMED**

**Gate G3 approval is requested. Sprint 123A.4 will not begin until written approval is received.**
