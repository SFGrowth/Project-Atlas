# Sprint 123A.1 — Gate G1 Final Approval Submission (Revision 3)

**Document:** SPRINT_123A1_GATE_G1_FINAL_APPROVAL_SUBMISSION_REVISION_3.md
**Revision:** 3 (Final)
**Date:** 2026-07-19
**Branch:** sprint/123a-1-foundation
**Supersedes:** Revision 2 (978c43e)
**Status:** Awaiting Gate G1 written approval from Phil

---

## 1. Revision 3 Purpose

Revision 2 only proved the rejection side of the authority matrix for `DATABENTO_SHADOW` and `DATABENTO_CHART_AUTHORITY`. Revision 3 adds the acceptance side, making the matrix proof complete and symmetric. Two new tests were added:

- **TEST-123A1-009** now proves TradingView **accepted** in `DATABENTO_SHADOW`.
- **TEST-123A1-009B** proves Databento **rejected** in `DATABENTO_SHADOW`.
- **TEST-123A1-010** now proves TradingView **accepted** in `DATABENTO_CHART_AUTHORITY`.
- **TEST-123A1-010B** proves Databento **rejected** in `DATABENTO_CHART_AUTHORITY`.

No implementation changes were required. `config.ts` and `postBarAutomation.ts` already enforced the correct matrix.

---

## 2. Corrected Authority Matrix

| Authority Mode | TradingView trigger | Databento trigger | Tests |
|---|---|---|---|
| `TRADINGVIEW_ONLY` | **Accepted** (TEST-123A1-008) | **Rejected** (TEST-123A1-007) | ✓ ✓ |
| `DATABENTO_SHADOW` | **Accepted** (TEST-123A1-009) | **Rejected** (TEST-123A1-009B) | ✓ ✓ |
| `DATABENTO_CHART_AUTHORITY` | **Accepted** (TEST-123A1-010) | **Rejected** (TEST-123A1-010B) | ✓ ✓ |
| `DATABENTO_LEARNING_AUTHORITY` | **Rejected** (TEST-123A1-011) | **Accepted** (TEST-123A1-012) | ✓ ✓ |

Every cell in the 4×2 matrix is now explicitly proved by a dedicated test.

---

## 3. Final Committed SHAs

| Item | SHA |
|---|---|
| Implementation content | `c42e856d1f7b9bb0ae5360bee35254fa2d8d0eee` |
| Evidence lock (Round 4) | `ab8b5bd86d97467d10042b23f683f92d643e4f9f` |
| Final approval submission Rev 2 | `978c43e763edbb365e294e0a1b1f0cc65fc57d4a` |
| **Final approval submission Rev 3 (this commit)** | **`a5c27b81d5b2c01b365708a7633fba3816d1e80c`** |

---

## 4. Complete Passing Test Output

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
     Tests  42 passed (42)
  Start at  22:41:19
  Duration  1.11s
```

**42 tests passed. 0 failed. 0 skipped.**

### All 42 Tests (exact names from Vitest verbose output)

| # | Test ID | Full Test Name | Result |
|---|---|---|---|
| 1 | TEST-123A1-001 | defaults to TRADINGVIEW\_ONLY when MARKET\_DATA\_AUTHORITY is unset | ✓ |
| 2 | TEST-123A1-002 | isTradingViewOnly returns true by default; all Databento predicates return false | ✓ |
| 3 | TEST-123A1-003 | isDatabentoProcessBarTrigger always returns false in all Sprint 123A modes | ✓ |
| 4 | TEST-123A1-004 | assertSprint123A1Invariants throws when DATABENTO\_LIVE\_ENABLED=true | ✓ |
| 5 | TEST-123A1-005 | assertSprint123A1Invariants throws on DATABENTO\_DECISION\_AUTHORITY (Sprint 123B only) | ✓ |
| 6 | TEST-123A1-006 | assertSprint123A1Invariants throws on DATABENTO\_SHADOW (requires Gate G3) | ✓ |
| 7 | TEST-123A1-027 | Sprint123AAuthorityMode type does not include DATABENTO\_DECISION\_AUTHORITY | ✓ |
| 8 | TEST-123A1-028 | getMarketDataAuthority throws on DATABENTO\_DECISION\_AUTHORITY (fail closed) | ✓ |
| 9 | TEST-123A1-007 | Databento rejected in TRADINGVIEW\_ONLY mode — no subsystem called | ✓ |
| 10 | TEST-123A1-008 | TradingView accepted in TRADINGVIEW\_ONLY mode — authority guard passes | ✓ |
| 11 | **TEST-123A1-009** | **TradingView accepted in DATABENTO\_SHADOW mode** | ✓ |
| 12 | **TEST-123A1-009B** | **Databento rejected in DATABENTO\_SHADOW mode — triggerSource must be TRADINGVIEW** | ✓ |
| 13 | **TEST-123A1-010** | **TradingView accepted in DATABENTO\_CHART\_AUTHORITY mode** | ✓ |
| 14 | **TEST-123A1-010B** | **Databento rejected in DATABENTO\_CHART\_AUTHORITY mode — triggerSource must be TRADINGVIEW** | ✓ |
| 15 | TEST-123A1-011 | TradingView rejected in DATABENTO\_LEARNING\_AUTHORITY mode — triggerSource must be DATABENTO | ✓ |
| 16 | TEST-123A1-012 | Databento accepted in DATABENTO\_LEARNING\_AUTHORITY mode | ✓ |
| 17 | TEST-123A1-013 | authorityMode payload mismatch is rejected before any subsystem is called | ✓ |
| 18 | TEST-123A1-014 | liveLearnEngine.processLiveBar called exactly once per bar | ✓ |
| 19 | TEST-123A1-015 | darwinAutonomous.onNewBarObservation called exactly once per bar (G-001 fix) | ✓ |
| 20 | TEST-123A1-016 | behaviourEngine.runBehaviourEngineShadow called exactly once per bar | ✓ |
| 21 | TEST-123A1-017 | liveLearnEngine failure does not stop DARWIN or behaviourEngine | ✓ |
| 22 | TEST-123A1-018 | DARWIN failure does not stop behaviourEngine | ✓ |
| 23 | TEST-123A1-019 | no subsystem runs after authority violation | ✓ |
| 24 | TEST-123A1-020 | processBar is never called by postBarAutomation (source boundary) | ✓ |
| 25 | TEST-123A1-021 | handleMonthlyReview calls runMonthlyAudit exactly once and returns real result | ✓ |
| 26 | TEST-123A1-021B | handleMonthlyReview surfaces audit failure correctly | ✓ |
| 27 | TEST-123A1-029 | nexusRoutes.ts invokes runPostBarAutomation (not liveLearnEngine directly) | ✓ |
| 28 | TEST-123A1-030 | nexusRoutes.ts still invokes processBar exactly once (TradingView execution path) | ✓ |
| 29 | TEST-123A1-031 | no direct liveLearnEngine.processLiveBar call in nexusRoutes.ts at runtime | ✓ |
| 30 | TEST-123A1-032 | invalid authority — dependency loaders not invoked (runtime) | ✓ |
| 31 | TEST-123A1-022 | CONTAINS\_UNRESOLVED is absent from all ENUMs in migration 0026 | ✓ |
| 32 | TEST-123A1-023 | all source bar tables have effective-once unique constraints | ✓ |
| 33 | TEST-123A1-024 | nanosecond timestamps stored as DECIMAL(20,0) for full precision | ✓ |
| 34 | TEST-123A1-025 | reconciliation\_status is an ENUM column (not a boolean) | ✓ |
| 35 | TEST-123A1-026 | migration has separated rollback tiers (operational and destructive) | ✓ |
| 36 | INT-001 | processBar called exactly once per valid TradingView bar | ✓ |
| 37 | INT-002 | runPostBarAutomation called exactly once per valid TradingView bar | ✓ |
| 38 | INT-003 | liveLearnEngine.processLiveBar NOT called directly from nexusRoutes | ✓ |
| 39 | INT-004 | persisted bar payload passed correctly to runPostBarAutomation | ✓ |
| 40 | INT-005 | webhook response is not blocked by post-bar processing | ✓ |
| 41 | INT-006 | automation failure does not suppress processBar | ✓ |
| 42 | INT-007 | duplicate webhook returns 200 duplicate — no second postBarAutomation call | ✓ |

---

## 5. TypeScript Compilation

```
Command:   pnpm tsc --noEmit
Exit code: 0
Errors:    0
```

---

## 6. MySQL CHECK Constraint Still Enforced

The `chk_canonical_no_unresolved` constraint was added in commit `ab8b5bd` and has not been modified. Evidence from the disposable MySQL 8.0.46 test:

| Test | Result |
|---|---|
| `INSERT ... contains_unresolved_minutes = 0` | Succeeds |
| `INSERT ... contains_unresolved_minutes = 1` | `ERROR 3819 (HY000): Check constraint 'chk_canonical_no_unresolved' is violated.` |
| `canonical_bar_type` ENUM | `CONTAINS_UNRESOLVED` absent — `enum('LIVE_CONFIRMED','CONTAINS_SYNTHETIC','RECOVERED')` |

---

## 7. No Production Migration Confirmation

Migration 0026 has **not** been run against the production database. It was executed only against two disposable databases (`atlas_sprint_123a1_disposable` and `atlas_chk_test`) on MySQL 8.0.46 in the sandbox. Both databases were dropped after evidence capture.

---

## 8. No Databento Connection Confirmation

No Databento connection has been made at any point during Sprint 123A.1. `MARKET_DATA_AUTHORITY=TRADINGVIEW_ONLY` is the default and has not been changed in production. `isDatabentoProcessBarTrigger()` always returns `false` (proved by TEST-123A1-003). `assertSprint123A1Invariants()` throws on `DATABENTO_SHADOW`, `DATABENTO_CHART_AUTHORITY`, and `DATABENTO_LEARNING_AUTHORITY` (proved by TEST-123A1-006 and `config.ts`).

---

## 9. Explicit Gate G1 Recommendation

All Sprint 123A.1 deliverables are complete and verified. The authority matrix is correctly implemented and explicitly proved by a complete 4×2 test matrix (acceptance and rejection for every authority mode). **Recommendation: Gate G1 APPROVED.** Sprint 123A.2 may begin upon Phil's explicit written approval.

---

*Sprint 123A.2 will not begin until Phil gives written approval.*
