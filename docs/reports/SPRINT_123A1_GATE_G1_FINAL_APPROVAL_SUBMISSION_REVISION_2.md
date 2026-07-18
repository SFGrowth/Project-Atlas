# Sprint 123A.1 — Gate G1 Final Approval Submission (Revision 2)

**Document:** SPRINT_123A1_GATE_G1_FINAL_APPROVAL_SUBMISSION_REVISION_2.md
**Revision:** 2 (Final)
**Date:** 2026-07-19
**Branch:** sprint/123a-1-foundation
**Supersedes:** SPRINT_123A1_GATE_G1_FINAL_APPROVAL_SUBMISSION.md (Revision 1)
**Status:** Awaiting Gate G1 written approval from Phil

---

## 1. Revision 2 Purpose

Revision 1 contained incorrect descriptions for tests 009-012 in the test table (rows 9-12 described the old wrong matrix). This revision corrects the record. The implementation (`config.ts`, `postBarAutomation.ts`) and the tests themselves were already correct in Revision 1 — no code changes were required for this revision.

---

## 2. Corrected Authority Matrix

The approved `postBarAutomation` trigger matrix, as implemented in `server/market-data/config.ts` and enforced by `server/automation/postBarAutomation.ts`:

| Authority Mode | TradingView trigger | Databento trigger |
|---|---|---|
| `TRADINGVIEW_ONLY` | **Accepted** | **Rejected** — INVARIANT VIOLATION |
| `DATABENTO_SHADOW` | **Accepted** | **Rejected** — INVARIANT VIOLATION |
| `DATABENTO_CHART_AUTHORITY` | **Accepted** | **Rejected** — INVARIANT VIOLATION |
| `DATABENTO_LEARNING_AUTHORITY` | **Rejected** — INVARIANT VIOLATION | **Accepted** |

**Key facts:**
- Databento cannot trigger `postBarAutomation` in `DATABENTO_SHADOW` mode.
- Databento cannot trigger `postBarAutomation` in `DATABENTO_CHART_AUTHORITY` mode.
- TradingView remains the trigger in both `DATABENTO_SHADOW` and `DATABENTO_CHART_AUTHORITY` modes.
- Databento becomes the trigger **only** in `DATABENTO_LEARNING_AUTHORITY` mode.
- `DATABENTO_DECISION_AUTHORITY` is absent from the `Sprint123AAuthorityMode` type and throws if set.
- `isDatabentoProcessBarTrigger()` always returns `false` (hardcoded).

---

## 3. Final Committed SHAs

| Item | SHA |
|---|---|
| Implementation content | `c42e856d1f7b9bb0ae5360bee35254fa2d8d0eee` |
| Evidence lock (Round 4) | `ab8b5bd86d97467d10042b23f683f92d643e4f9f` |
| Final approval submission (Revision 2) | TBD — this commit |

---

## 4. Complete Changed-File List (baseline `0906a80` → HEAD)

### Sprint 123A Architecture Documents (docs/architecture/)

All 25 Sprint 123A architecture documents added. Key files:

| File | Status |
|---|---|
| `ATLAS_CANONICAL_MARKET_EVENT_CONTRACTS.md` (Rev 6) | Added |
| `SPRINT_123A_TEST_MANIFEST.md` (Rev 6, 76 tests) | Added |
| `SPRINT_123A_GATE_G0_FINAL_APPROVAL_SUBMISSION.md` | Added |
| `SPRINT_123A1_GATE_G1_EVIDENCE_SUBMISSION.md` | Added |
| All other Sprint 123A architecture documents | Added |

### Evidence Reports (docs/reports/)

| File | Status |
|---|---|
| `SPRINT_123A1_GATE_G1_EVIDENCE_REVISION_4.md` | Added |
| `SPRINT_123A1_GATE_G1_EVIDENCE_REVISION_5.md` | Added |
| `SPRINT_123A1_GATE_G1_FINAL_APPROVAL_SUBMISSION.md` (Rev 1) | Added |
| `SPRINT_123A1_GATE_G1_FINAL_APPROVAL_SUBMISSION_REVISION_2.md` | Added (this file) |

### Implementation Files

| File | Status | Description |
|---|---|---|
| `drizzle/0026_sprint_123a1_foundation.sql` | Added | 9-table migration with `chk_canonical_no_unresolved` CHECK constraint |
| `drizzle/meta/_journal.json` | Modified | Migration 0026 journal entry |
| `drizzle/schema.ts` | Modified | 9 Sprint 123A.1 tables + `chkCanonicalNoUnresolved` |
| `server/automation/postBarAutomation.ts` | Added | Post-bar automation with DI and authority guard |
| `server/market-data/config.ts` | Added | Feature flag configuration and authority matrix |
| `server/nexusRoutes.ts` | Modified | Direct `processLiveBar` replaced with `runPostBarAutomation` |
| `server/scheduledJobs.ts` | Modified | Monthly review G-002 fix |
| `server/sprint-123a1.test.ts` | Added | 33 unit/runtime/structural tests |
| `server/sprint-123a1-integration.test.ts` | Added | 7 integration tests |
| `shared/types/canonical-events.ts` | Added | Canonical TypeScript event contracts |
| `package.json` | Modified | `supertest` dev dependency |
| `pnpm-lock.yaml` | Modified | Lock file |

---

## 5. Complete Passing Test Output

### Test Command

```
pnpm vitest run \
  server/sprint-123a1.test.ts \
  server/sprint-123a1-integration.test.ts \
  --reporter=verbose
```

### Final Result

```
Test Files  2 passed (2)
     Tests  40 passed (40)
  Start at  22:23:28
  Duration  1.05s
```

**40 tests passed. 0 failed. 0 skipped.**

### All 40 Tests (exact names from Vitest verbose output)

| # | Test ID | Full Test Name | Result |
|---|---|---|---|
| 1 | TEST-123A1-001 | Feature flag defaults to TRADINGVIEW\_ONLY | ✓ PASS |
| 2 | TEST-123A1-002 | All Databento predicates return false by default | ✓ PASS |
| 3 | TEST-123A1-003 | isDatabentoProcessBarTrigger always returns false | ✓ PASS |
| 4 | TEST-123A1-004 | assertSprint123A1Invariants throws when DATABENTO\_LIVE\_ENABLED=true | ✓ PASS |
| 5 | TEST-123A1-005 | assertSprint123A1Invariants throws on DATABENTO\_DECISION\_AUTHORITY (Sprint 123B only) | ✓ PASS |
| 6 | TEST-123A1-006 | assertSprint123A1Invariants throws on DATABENTO\_SHADOW (requires Gate G3) | ✓ PASS |
| 7 | TEST-123A1-027 | DATABENTO\_DECISION\_AUTHORITY is absent from the Sprint123AAuthorityMode type | ✓ PASS |
| 8 | TEST-123A1-028 | getMarketDataAuthority throws on DATABENTO\_DECISION\_AUTHORITY | ✓ PASS |
| 9 | TEST-123A1-007 | Databento rejected in TRADINGVIEW\_ONLY mode — no subsystem called | ✓ PASS |
| 10 | TEST-123A1-008 | TradingView accepted in TRADINGVIEW\_ONLY mode — all three subsystems called | ✓ PASS |
| 11 | **TEST-123A1-009** | **Databento rejected in DATABENTO\_SHADOW mode — triggerSource must be TRADINGVIEW** | ✓ PASS |
| 12 | **TEST-123A1-010** | **Databento rejected in DATABENTO\_CHART\_AUTHORITY mode — triggerSource must be TRADINGVIEW** | ✓ PASS |
| 13 | **TEST-123A1-011** | **TradingView rejected in DATABENTO\_LEARNING\_AUTHORITY mode — triggerSource must be DATABENTO** | ✓ PASS |
| 14 | **TEST-123A1-012** | **Databento accepted in DATABENTO\_LEARNING\_AUTHORITY mode** | ✓ PASS |
| 15 | TEST-123A1-013 | authorityMode payload mismatch is rejected before any subsystem is called | ✓ PASS |
| 16 | TEST-123A1-014 | liveLearnEngine.processLiveBar called exactly once per bar | ✓ PASS |
| 17 | TEST-123A1-015 | darwinAutonomous.onNewBarObservation called exactly once per bar (G-001 fix) | ✓ PASS |
| 18 | TEST-123A1-016 | behaviourEngine.runBehaviourEngineShadow called exactly once per bar | ✓ PASS |
| 19 | TEST-123A1-017 | liveLearnEngine failure does not stop DARWIN or behaviourEngine | ✓ PASS |
| 20 | TEST-123A1-018 | DARWIN failure does not stop behaviourEngine | ✓ PASS |
| 21 | TEST-123A1-019 | no subsystem runs after authority violation | ✓ PASS |
| 22 | TEST-123A1-020 | processBar is never called by postBarAutomation (source boundary) | ✓ PASS |
| 23 | TEST-123A1-021 | handleMonthlyReview calls runMonthlyAudit exactly once and returns real result | ✓ PASS |
| 24 | TEST-123A1-021B | handleMonthlyReview surfaces audit failure correctly | ✓ PASS |
| 25 | TEST-123A1-029 | nexusRoutes.ts invokes runPostBarAutomation (not liveLearnEngine directly) | ✓ PASS |
| 26 | TEST-123A1-030 | nexusRoutes.ts still invokes processBar exactly once (TradingView execution path) | ✓ PASS |
| 27 | TEST-123A1-031 | no direct liveLearnEngine.processLiveBar call in nexusRoutes.ts at runtime | ✓ PASS |
| 28 | TEST-123A1-032 | invalid authority — dependency loaders not invoked (runtime) | ✓ PASS |
| 29 | TEST-123A1-022 | CONTAINS\_UNRESOLVED is absent from all ENUMs in migration 0026 | ✓ PASS |
| 30 | TEST-123A1-023 | all source bar tables have effective-once unique constraints | ✓ PASS |
| 31 | TEST-123A1-024 | nanosecond timestamps stored as DECIMAL(20,0) for full precision | ✓ PASS |
| 32 | TEST-123A1-025 | reconciliation\_status is an ENUM column (not a boolean) | ✓ PASS |
| 33 | TEST-123A1-026 | migration has separated rollback tiers (operational and destructive) | ✓ PASS |
| 34 | INT-001 | processBar called exactly once per valid TradingView bar | ✓ PASS |
| 35 | INT-002 | runPostBarAutomation called exactly once per valid TradingView bar | ✓ PASS |
| 36 | INT-003 | liveLearnEngine.processLiveBar NOT called directly from nexusRoutes | ✓ PASS |
| 37 | INT-004 | persisted bar payload passed correctly to runPostBarAutomation | ✓ PASS |
| 38 | INT-005 | webhook response is not blocked by post-bar processing | ✓ PASS |
| 39 | INT-006 | automation failure does not suppress processBar | ✓ PASS |
| 40 | INT-007 | duplicate webhook returns 200 duplicate — no second postBarAutomation call | ✓ PASS |

Tests 009-012 (rows 11-14 above, **bold**) explicitly prove the corrected authority matrix:

- TEST-123A1-009 proves Databento is **rejected** in `DATABENTO_SHADOW` (not accepted).
- TEST-123A1-010 proves Databento is **rejected** in `DATABENTO_CHART_AUTHORITY` (not accepted).
- TEST-123A1-011 proves TradingView is **rejected** in `DATABENTO_LEARNING_AUTHORITY`.
- TEST-123A1-012 proves Databento is **accepted** in `DATABENTO_LEARNING_AUTHORITY`.

### Expected stderr (Intentional Error-Path Tests)

| Source | stderr content | Reason expected |
|---|---|---|
| TEST-123A1-007 | `[Atlas config] INVARIANT VIOLATION: In TRADINGVIEW_ONLY mode...` | Deliberate Databento trigger in TRADINGVIEW\_ONLY to prove guard fires |
| TEST-123A1-009 | `[Atlas config] INVARIANT VIOLATION: In DATABENTO_SHADOW mode...` | Deliberate Databento trigger in DATABENTO\_SHADOW to prove guard fires |
| TEST-123A1-010 | `[Atlas config] INVARIANT VIOLATION: In DATABENTO_CHART_AUTHORITY mode...` | Deliberate Databento trigger in DATABENTO\_CHART\_AUTHORITY to prove guard fires |
| TEST-123A1-017 | `[postBarAutomation] liveLearnEngine error: ...` | Deliberate liveLearnEngine throw to prove DARWIN continues |
| TEST-123A1-018 | `[postBarAutomation] DARWIN error: ...` | Deliberate DARWIN throw to prove behaviourEngine continues |
| TEST-123A1-019 | `[Atlas config] INVARIANT VIOLATION: ...` | Deliberate invalid authority to prove all subsystems blocked |
| TEST-123A1-032 | `[Atlas config] INVARIANT VIOLATION: ...` | Deliberate invalid authority to prove no dynamic imports fire |
| INT-006 | `[POST_BAR_AUTO] runPostBarAutomation error: Error: Automation failure` | Deliberate postBarAutomation throw to prove processBar not suppressed |

**No unexpected stderr lines are present.**

---

## 6. TypeScript Compilation

```
Command:   pnpm tsc --noEmit
Exit code: 0
Errors:    0
Warnings:  0
```

---

## 7. MySQL CHECK Constraint Evidence

### Constraint Definition

```sql
CONSTRAINT `chk_canonical_no_unresolved`
  CHECK ((`contains_unresolved_minutes` = 0))
```

### Three-Test Proof (MySQL 8.0.46, disposable database `atlas_chk_test`)

| Test | Condition | Expected | Actual |
|---|---|---|---|
| TEST-CHK-001 | `INSERT ... contains_unresolved_minutes = 0` | Row inserted | `INSERT_0_SUCCEEDED` ✓ |
| TEST-CHK-002 | `INSERT ... contains_unresolved_minutes = 1` | Constraint violation | `ERROR 3819 (HY000): Check constraint 'chk_canonical_no_unresolved' is violated.` ✓ |
| TEST-CHK-003 | `SELECT COLUMN_TYPE WHERE COLUMN_NAME='canonical_bar_type'` | `CONTAINS_UNRESOLVED` absent | `enum('LIVE_CONFIRMED','CONTAINS_SYNTHETIC','RECOVERED')` ✓ |

Disposable database `atlas_chk_test` was dropped immediately after evidence capture.

---

## 8. No Production Migration Confirmation

**Migration 0026 has NOT been run against the production database.**

The migration was executed only against two disposable databases (`atlas_sprint_123a1_disposable` and `atlas_chk_test`) on MySQL 8.0.46 in the sandbox environment. Both databases were dropped after evidence capture. No connection was made to the Atlas Nexus production TiDB/MySQL instance at any point during Sprint 123A.1.

---

## 9. No Databento Connection Confirmation

No Databento connection has been made at any point during Sprint 123A.1:

- `MARKET_DATA_AUTHORITY=TRADINGVIEW_ONLY` is the default and has not been changed.
- `DATABENTO_LIVE_ENABLED` has not been set to `true`.
- No Databento Python feed process has been started.
- No Databento API key has been used.
- `isDatabentoProcessBarTrigger()` always returns `false` (hardcoded — proved by TEST-123A1-003).
- `DATABENTO_DECISION_AUTHORITY` throws if set (proved by TEST-123A1-028).
- `assertSprint123A1Invariants()` throws on `DATABENTO_SHADOW`, `DATABENTO_CHART_AUTHORITY`, and `DATABENTO_LEARNING_AUTHORITY` (proved by TEST-123A1-006 and config.ts).

---

## 10. Operational Rollback Procedure

The Tier 1 Operational Rollback in `drizzle/0026_sprint_123a1_foundation.sql` does **not** drop any tables. It sets `MARKET_DATA_AUTHORITY = TRADINGVIEW_ONLY`, disables all Databento services, stops Databento consumers, preserves all Sprint 123A tables and evidence, and stops new Databento writes. The Tier 2 Destructive Reset (development-only) drops all 9 tables and is explicitly labelled `-- DEVELOPMENT ONLY`.

---

## 11. Explicit Gate G1 Recommendation

All Sprint 123A.1 deliverables are complete and verified. The authority matrix is correctly implemented and explicitly proved by tests 009-012:

- Databento is **rejected** in `DATABENTO_SHADOW` and `DATABENTO_CHART_AUTHORITY`.
- TradingView remains the trigger in both modes.
- Databento becomes the trigger **only** in `DATABENTO_LEARNING_AUTHORITY`.

Summary of evidence:

| Metric | Value |
|---|---|
| Tests | **40 passed, 0 failed** |
| TypeScript errors | **0** |
| Unexpected stderr | **0** |
| MySQL CHECK constraint | Enforced at storage engine level — ERROR 3819 on violation |
| No production migration | **Confirmed** |
| No Databento connection | **Confirmed** |
| No strategy/ADE/execution changes | **Confirmed** |
| TradingView production authority | **Unchanged** |

**Recommendation: Gate G1 APPROVED.** Sprint 123A.2 may begin upon Phil's explicit written approval.

---

*Sprint 123A.2 will not begin until Phil gives written approval.*
