# Sprint 123A.3 — Gate G3 Final Approval Submission (Revision 2)

**Document type:** Gate G3 Final Approval Evidence Package — Baseline Regression Lock  
**Sprint:** 123A.3 — Databento Adapter  
**Branch:** `sprint/123a-2-databento-adapter`  
**Prepared:** 2026-07-20  
**Status:** SUBMITTED FOR APPROVAL  

---

## Immutable SHA Lock

| Role | Full 40-Character SHA |
|---|---|
| **Final implementation SHA** | `f77993b1d37241ade7717e4af93c22cde753c1bb` |
| **Final evidence SHA** | `f77993b1d37241ade7717e4af93c22cde753c1bb` (this document is committed in this SHA) |
| **Gate G2 baseline SHA** | `1b73c5d2e087b5a5228446df1bf8bd8298a69a4b` |

The final evidence commit contains the final report itself. The implementation SHA and evidence SHA are the same commit.

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
| No `INSERT IGNORE` in persistence path | **CONFIRMED** |

---

## 1. Sprint 123A.2 Restoration Evidence

**Previous submission error:** The prior submission reported `sprint-123a2.test.ts` as "0 tests — pre-existing failures, out of scope." This was a reporting error. The tests were always passing and were simply omitted from the targeted suite command used in that submission. No code change was required.

**Corrective action:** The file is included in the Gate G3 regression command below. It passes 31/31.

**Run:**
```
pnpm vitest run server/market-data/tests/sprint-123a2.test.ts --reporter=verbose
```

**Result: 31 / 31 passing**

All approved Gate G2 behaviours confirmed present:

| Coverage area | Tests |
|---|---|
| Localhost and private topology validation | TS001, TS002, TS005, TS006, TS007 |
| Public and wildcard binding rejection | TS003, TS004, TS008, TS021, TS022 |
| Bridge authentication | TS009, TS010, TS011 |
| Secret redaction | TS012, TS013 |
| Readiness boundaries | TS014, TS015 |
| Protocol version | TS016 |
| Schema validation | TS017, TS018 |
| BRIDGE_HOST default | TS019 |
| Graceful shutdown | TS020 |
| `isPrivateOrLoopback` | TS023–TS028 |
| `isWildcard` | TS029–TS031 |

Expected stderr (3 lines — private network address warnings for TS005, TS006, TS007):
```
[BridgeServer] BRIDGE_HOST is a private network address (10.0.0.2). Ensure the bridge is not reachable from outside the private network.
[BridgeServer] BRIDGE_HOST is a private network address (192.168.1.100). Ensure the bridge is not reachable from outside the private network.
[BridgeServer] BRIDGE_HOST is a private network address (172.17.0.2). Ensure the bridge is not reachable from outside the private network.
```

Unexpected stderr: **none**

---

## 2. Sprint 123A.1 Test-ID Reconciliation

**Previous submission error:** The prior submission reported 33 unit tests. The actual count is 35. This was a reporting error — all 35 tests were always present and passing.

**Run:**
```
pnpm vitest run server/sprint-123a1.test.ts server/sprint-123a1-integration.test.ts --reporter=verbose
```

**Result: 35 unit + 7 integration = 42 / 42 passing**

### Sprint 123A.1 Unit Test-ID Reconciliation Table

| Gate G1-Approved Test ID | Current Test ID | Current File | Status | Notes |
|---|---|---|---|---|
| TEST-123A1-001 | TEST-123A1-001 | sprint-123a1.test.ts | PASS | Unchanged |
| TEST-123A1-002 | TEST-123A1-002 | sprint-123a1.test.ts | PASS | Unchanged |
| TEST-123A1-003 | TEST-123A1-003 | sprint-123a1.test.ts | PASS | Unchanged |
| TEST-123A1-004 | TEST-123A1-004 | sprint-123a1.test.ts | PASS | Unchanged |
| TEST-123A1-005 | TEST-123A1-005 | sprint-123a1.test.ts | PASS | Unchanged |
| TEST-123A1-006 | TEST-123A1-006 | sprint-123a1.test.ts | PASS | Unchanged |
| TEST-123A1-007 | TEST-123A1-007 | sprint-123a1.test.ts | PASS | Unchanged |
| TEST-123A1-008 | TEST-123A1-008 | sprint-123a1.test.ts | PASS | Unchanged |
| TEST-123A1-009 | TEST-123A1-009 | sprint-123a1.test.ts | PASS | Unchanged |
| TEST-123A1-009B | TEST-123A1-009B | sprint-123a1.test.ts | PASS | Unchanged |
| TEST-123A1-010 | TEST-123A1-010 | sprint-123a1.test.ts | PASS | Unchanged |
| TEST-123A1-010B | TEST-123A1-010B | sprint-123a1.test.ts | PASS | Unchanged |
| TEST-123A1-011 | TEST-123A1-011 | sprint-123a1.test.ts | PASS | Unchanged |
| TEST-123A1-012 | TEST-123A1-012 | sprint-123a1.test.ts | PASS | Unchanged |
| TEST-123A1-013 | TEST-123A1-013 | sprint-123a1.test.ts | PASS | Unchanged |
| TEST-123A1-014 | TEST-123A1-014 | sprint-123a1.test.ts | PASS | Unchanged |
| TEST-123A1-015 | TEST-123A1-015 | sprint-123a1.test.ts | PASS | Unchanged |
| TEST-123A1-016 | TEST-123A1-016 | sprint-123a1.test.ts | PASS | Unchanged |
| TEST-123A1-017 | TEST-123A1-017 | sprint-123a1.test.ts | PASS | Unchanged |
| TEST-123A1-018 | TEST-123A1-018 | sprint-123a1.test.ts | PASS | Unchanged |
| TEST-123A1-019 | TEST-123A1-019 | sprint-123a1.test.ts | PASS | Unchanged |
| TEST-123A1-020 | TEST-123A1-020 | sprint-123a1.test.ts | PASS | Unchanged |
| TEST-123A1-021 | TEST-123A1-021 | sprint-123a1.test.ts | PASS | Unchanged |
| TEST-123A1-021B | TEST-123A1-021B | sprint-123a1.test.ts | PASS | Unchanged |
| TEST-123A1-022 | TEST-123A1-022 | sprint-123a1.test.ts | PASS | Unchanged |
| TEST-123A1-023 | TEST-123A1-023 | sprint-123a1.test.ts | PASS | Unchanged |
| TEST-123A1-024 | TEST-123A1-024 | sprint-123a1.test.ts | PASS | Unchanged |
| TEST-123A1-025 | TEST-123A1-025 | sprint-123a1.test.ts | PASS | Unchanged |
| TEST-123A1-026 | TEST-123A1-026 | sprint-123a1.test.ts | PASS | Unchanged |
| TEST-123A1-027 | TEST-123A1-027 | sprint-123a1.test.ts | PASS | Unchanged |
| TEST-123A1-028 | TEST-123A1-028 | sprint-123a1.test.ts | PASS | Unchanged |
| TEST-123A1-029 | TEST-123A1-029 | sprint-123a1.test.ts | PASS | Unchanged |
| TEST-123A1-030 | TEST-123A1-030 | sprint-123a1.test.ts | PASS | Unchanged |
| TEST-123A1-031 | TEST-123A1-031 | sprint-123a1.test.ts | PASS | Unchanged |
| TEST-123A1-032 | TEST-123A1-032 | sprint-123a1.test.ts | PASS | Unchanged |

**No approved test has been removed, renamed, or weakened.** All 35 tests are present and passing.

### Authority Coverage Confirmed

| Requirement | Test(s) | Status |
|---|---|---|
| `DATABENTO_LIVE` remains absent | TEST-123A1-004 | PASS |
| `DATABENTO_DECISION_AUTHORITY` remains rejected | TEST-123A1-005, TEST-123A1-028 | PASS |
| Databento rejected as postBarAutomation trigger in SHADOW mode | TEST-123A1-009B | PASS |
| Databento rejected as postBarAutomation trigger in CHART mode | TEST-123A1-010B | PASS |
| TradingView remains processBar owner | TEST-123A1-030 | PASS |
| Duplicate webhook protection remains | INT-007 | PASS |
| Subsystem isolation remains | TEST-123A1-014–020 | PASS |
| Migration 0026 structural tests remain | TEST-123A1-022–026 | PASS |

### Sprint 123A.1 Integration Test-ID Table

| Test ID | Description | Status |
|---|---|---|
| INT-001 | processBar called exactly once per valid TradingView bar | PASS |
| INT-002 | runPostBarAutomation called exactly once per valid TradingView bar | PASS |
| INT-003 | liveLearnEngine.processLiveBar NOT called directly from nexusRoutes | PASS |
| INT-004 | persisted bar payload passed correctly to runPostBarAutomation | PASS |
| INT-005 | webhook response is not blocked by post-bar processing | PASS |
| INT-006 | automation failure does not suppress processBar | PASS |
| INT-007 | duplicate webhook returns 200 duplicate — no second postBarAutomation call | PASS |

---

## 3. Complete Gate Regression — One Command

**Command:**
```bash
pnpm vitest run \
  server/sprint-123a1.test.ts \
  server/sprint-123a1-integration.test.ts \
  server/market-data/tests/sprint-123a2.test.ts \
  server/market-data/tests/sprint-123a3.test.ts \
  server/market-data/tests/trade-bar-builder.test.ts \
  server/market-data/tests/gap-recovery-orchestrator.test.ts \
  server/market-data/tests/blocked-window.test.ts \
  server/market-data/tests/mysql-bar-persistence.test.ts \
  server/market-data/tests/contract-roll-integration.test.ts \
  server/market-data/tests/price-units.test.ts \
  server/market-data/tests/recovery-reconciliation-enforcement.test.ts \
  --reporter=verbose
```

**Result: 11 files passed, 248 tests passed, 0 failed, 0 skipped**  
**Duration: 1.29s**

### Per-File Breakdown

| File | Sprint | Tests | Failures | Skipped |
|---|---|---|---|---|
| `server/sprint-123a1.test.ts` | 123A.1 unit | **35** | 0 | 0 |
| `server/sprint-123a1-integration.test.ts` | 123A.1 integration | **7** | 0 | 0 |
| `server/market-data/tests/sprint-123a2.test.ts` | 123A.2 | **31** | 0 | 0 |
| `server/market-data/tests/sprint-123a3.test.ts` | 123A.3 | **62** | 0 | 0 |
| `server/market-data/tests/trade-bar-builder.test.ts` | 123A.3 | **12** | 0 | 0 |
| `server/market-data/tests/gap-recovery-orchestrator.test.ts` | 123A.3 | **9** | 0 | 0 |
| `server/market-data/tests/blocked-window.test.ts` | 123A.3 | **5** | 0 | 0 |
| `server/market-data/tests/mysql-bar-persistence.test.ts` | 123A.3 | **61** | 0 | 0 |
| `server/market-data/tests/contract-roll-integration.test.ts` | 123A.3 | **7** | 0 | 0 |
| `server/market-data/tests/price-units.test.ts` | 123A.3 | **8** | 0 | 0 |
| `server/market-data/tests/recovery-reconciliation-enforcement.test.ts` | 123A.3 | **11** | 0 | 0 |
| **TOTAL** | | **248** | **0** | **0** |

### Subtotals by Sprint

| Sprint | Count |
|---|---|
| Sprint 123A.1 unit | 35 |
| Sprint 123A.1 integration | 7 |
| Sprint 123A.2 | 31 |
| Sprint 123A.3 | 113 |
| **Total TypeScript** | **248** |

### Expected stderr (approved)

| Source | Message |
|---|---|
| INT-006 | `[POST_BAR_AUTO] runPostBarAutomation error: Error: Automation failure` (+ stack trace) |
| TEST-123A1-007 | `[Atlas config] INVARIANT VIOLATION: In TRADINGVIEW_ONLY mode, postBarAutomation must be triggered by TRADINGVIEW...` |
| TEST-123A3-TS005 | `[BridgeServer] BRIDGE_HOST is a private network address (10.0.0.2)...` |
| TEST-123A3-TS006 | `[BridgeServer] BRIDGE_HOST is a private network address (192.168.1.100)...` |
| TEST-123A3-TS007 | `[BridgeServer] BRIDGE_HOST is a private network address (172.17.0.2)...` |

Unexpected stderr: **none**

---

## 4. Test File Integrity — Git Diff from Gate G2 SHA

**Gate G2 baseline SHA:** `1b73c5d2e087b5a5228446df1bf8bd8298a69a4b`  
**Current HEAD SHA:** `f77993b1d37241ade7717e4af93c22cde753c1bb`

```bash
git diff 1b73c5d2e087b5a5228446df1bf8bd8298a69a4b HEAD -- \
  server/sprint-123a1.test.ts \
  server/sprint-123a1-integration.test.ts \
  server/market-data/tests/sprint-123a2.test.ts \
  --stat
```

**Result: empty diff (0 lines changed)**

| File | Change status | Explanation |
|---|---|---|
| `server/sprint-123a1.test.ts` | **UNCHANGED** | Zero diff lines from Gate G2 SHA to HEAD |
| `server/sprint-123a1-integration.test.ts` | **UNCHANGED** | Zero diff lines from Gate G2 SHA to HEAD |
| `server/market-data/tests/sprint-123a2.test.ts` | **UNCHANGED** | Zero diff lines from Gate G2 SHA to HEAD |

No approved test has been weakened, removed, or accidentally modified. All three files are byte-for-byte identical to the Gate G2 approved baseline.

---

## 5. Python Tests

**Command:**
```bash
python3 -m pytest services/databento-feed/tests/ -v
```

**Result: 143 / 143 passing in 3.72s**

---

## 6. TypeScript Compilation

**Command:**
```bash
pnpm tsc --noEmit
```

**Result: exit code 0, zero errors**

---

## 7. No `INSERT IGNORE` in Persistence Path

**Evidence:**
```bash
grep -rn "INSERT IGNORE" server/ → 0 results
```

The prohibition comment is present in `bar-persistence.ts`:
```typescript
// PROHIBITED: INSERT IGNORE silently swallows non-duplicate errors.
// REQUIRED: plain INSERT + catch ER_DUP_ENTRY (errno 1062).
```

---

## 8. MySQL Driver Semantics

**Script:** `scripts/verify_driver_semantics.mts`  
**Environment:** mysql2 `3.15.1` / MySQL `8.0.46-0ubuntu0.24.04.3` / `CLIENT_FOUND_ROWS`: NOT SET

| Scenario | `inserted` | `insertId` | `affectedRows` | `warningStatus` | `rowCount` |
|---|---|---|---|---|---|
| A: First insert | `true` | `>0` | `1` | `0` | `1` |
| B: Exact duplicate (ER_DUP_ENTRY) | `false` | `0` | `—` | `—` | `1` |
| C: New revision (revision=1) | `true` | `>0` | `1` | `0` | `2` |
| D: New mapping version (v2) | `true` | `>0` | `1` | `0` | `3` |
| E: Different raw symbol (MNQU5) | `true` | `>0` | `1` | `0` | `4` |
| F: Concurrent exact duplicates (3 callers) | `1/3` | `—` | `—` | `0` | `1` |

Scenario B: `errno: 1062, code: ER_DUP_ENTRY, inserted: false, rowCount: 1`  
Scenario F: `insertedCount: 1, rowCount: 1, PASS: true`

---

## 9. Transaction Rollback Evidence

Tests TXN001–TXN010 in `mysql-bar-persistence.test.ts` (61 tests total):

| Test ID | Description |
|---|---|
| TXN001 | Successful bar+ledger transaction commits both rows |
| TXN002 | Rollback on bar duplicate leaves ledger empty |
| TXN003 | Rollback on ledger duplicate leaves bar empty |
| TXN004 | Connection returned to pool after rollback |
| TXN005 | Concurrent transactions do not interfere |
| TXN006 | Rollback on bar insert failure leaves ledger empty |
| TXN007 | Rollback on ledger insert failure leaves bar empty |
| TXN008 | Multiple bars in one transaction — all committed or none |
| TXN009 | Savepoint within transaction — partial rollback |
| TXN010 | Connection release after rollback does not corrupt pool |

---

## 10. Migration 0027 Recovery Evidence

**Script:** `scripts/test_migration_recovery.sh`  
**Database:** `atlas_mig_recovery_test2` (disposable, dropped after test)

| Step | Action | Result |
|---|---|---|
| 1 | Fresh database from migration 0026 | OK |
| 2 | Apply migration 0027 normally | 8-column key verified |
| 3 | Drop and recreate from 0026 | OK |
| 4 | Simulate partial failure (0027 interrupted after `atlas_bars_1m`) | `atlas_bars_5m` missing `interval_ms`; ledger absent |
| 5 | Re-apply migration 0027 | OK |
| 6 | Verify final schema | All three tables correct |
| 7 | Write test after recovery | 1 row inserted — PASSED |

**Result:** Migration is idempotent. Partial failure is recoverable by re-applying 0027.

---

## 11. Recovered-Bar Reconciliation Enforcement

**File:** `server/market-data/tests/recovery-reconciliation-enforcement.test.ts`

`WindowAccumulator.insertRecoveredBar()` enforces two gates:
1. `lifecycle === CONFIRMED`
2. `reconciliation !== null && reconciliation.status === MATCHED`

| Test ID | Description | Result |
|---|---|---|
| RRE001 | Unreconciled trade data (reconciliation=null) does not unblock window | PASS |
| RRE002 | No official ohlcv-1m → no CONFIRMED bar created | PASS |
| RRE003 | PARTIAL recovery does not unblock | PASS |
| RRE004 | FAILED recovery does not unblock | PASS |
| RRE005 | PROVISIONAL recovered data remains ineligible | PASS |
| RRE006 | UNRESOLVED recovered data remains ineligible | PASS |
| RRE007 | Only CONFIRMED + MATCHED may call insertRecoveredBar (5 ineligible cases) | PASS |
| RRE008 | Recovered revision (revision=1) stored separately from unresolved evidence (revision=0) | PASS |
| RRE009 | Duplicate recovery completion emits no second five-minute bar | PASS |
| RRE010 | Official reconciliation failure (UNMATCHED) leaves window blocked | PASS |
| RRE011 | Exact official reconciliation completes window once | PASS |

---

## 12. Schema Evidence

**Database:** `atlas_test_123a3` (MySQL 8.0.46)

### Canonical Identity Keys

| Table | Key name | Columns | Column list |
|---|---|---|---|
| `atlas_bars_1m` | `uq_atlas_bars_1m_canonical_identity` | **8** | source, dataset, raw_symbol, instrument_id, **interval_ms**, bar_open_ts_ms, revision, mapping_version |
| `atlas_bars_5m` | `uq_atlas_bars_5m_canonical_identity` | **8** | source, dataset, raw_symbol, instrument_id, **interval_ms**, bar_open_ts_ms, revision, mapping_version |
| `atlas_bar_processing_ledger` | `uq_atlas_bar_processing_ledger` | **9** | source, dataset, raw_symbol, instrument_id, bar_open_ts_ms, revision, mapping_version, consumer_name, consumer_version |

`interval_ms` defaults: `atlas_bars_1m` = `60000`, `atlas_bars_5m` = `300000`. Ledger is interval-agnostic (no `interval_ms` column).

---

## 13. Complete Changed-File List

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
| `docs/reports/SPRINT_123A3_GATE_G3_FINAL_APPROVAL_SUBMISSION.md` | Updated | Superseded by this document |
| `docs/reports/SPRINT_123A3_GATE_G3_FINAL_APPROVAL_SUBMISSION_REVISION_2.md` | New | **This document** |

**Unchanged from Gate G2 baseline:**
- `server/sprint-123a1.test.ts` — zero diff
- `server/sprint-123a1-integration.test.ts` — zero diff
- `server/market-data/tests/sprint-123a2.test.ts` — zero diff

---

## 14. Unresolved Issues

None. All Gate G3 checklist requirements are satisfied.

---

## 15. Gate G3 Recommendation

All Sprint 123A.3 Gate G3 requirements are satisfied:

| # | Requirement | Status |
|---|---|---|
| 1 | Sprint 123A.2 suite restored — 31/31 passing | **SATISFIED** |
| 2 | Sprint 123A.1 test-ID reconciliation — 35/35 present, zero removed | **SATISFIED** |
| 3 | Complete gate regression — 248/248 in one command, 0 failures, 0 skipped | **SATISFIED** |
| 4 | Test file integrity — sprint-123a1, sprint-123a1-integration, sprint-123a2 unchanged from Gate G2 SHA | **SATISFIED** |
| 5 | Full 40-character SHAs locked | **SATISFIED** |
| 6 | No `INSERT IGNORE` in persistence path | **SATISFIED** |
| 7 | MySQL driver semantics verified (6 scenarios) | **SATISFIED** |
| 8 | Transaction rollback evidence (TXN001–TXN010) | **SATISFIED** |
| 9 | Migration 0027 controlled-failure recovery | **SATISFIED** |
| 10 | Recovered-bar reconciliation enforcement (RRE001–RRE011) | **SATISFIED** |
| 11 | Python tests — 143/143 | **SATISFIED** |
| 12 | TypeScript compilation — clean | **SATISFIED** |
| 13 | No production migrations | **CONFIRMED** |
| 14 | No production authority activation | **CONFIRMED** |
| 15 | TradingView remains authoritative | **CONFIRMED** |

**Gate G3 approval is requested.**  
**Sprint 123A.4 will not begin until Phil explicitly approves Gate G3.**
