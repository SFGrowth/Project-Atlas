# Sprint 123A.1 — Gate G1 Evidence Submission
## Revision 2

**Status:** Awaiting Gate G1 approval  
**Branch:** `sprint/123a-1-foundation`  
**Implementation SHA:** `4ebd5a0`  
**Gate G0 approval:** Phil, 2026-07-18  
**Prepared:** 2026-07-19

---

## 1. Gate G1 Round 2 Corrections (5 items)

| Ref | File | Correction |
|---|---|---|
| R2-1 | `shared/types/canonical-events.ts` | Split `EventId` into 5 typed IDs; 5 lifecycle types; removed `CONTAINS_UNRESOLVED` from all types; fixed timestamp naming (`barOpenTimestampMs`/`barCloseTimestampMs`); added `AtlasBarUnresolved` type |
| R2-2 | `server/market-data/config.ts` | Removed `DATABENTO_DECISION_AUTHORITY` from `Sprint123AAuthorityMode` type (Sprint 123B only); `getMarketDataAuthority()` throws on `DATABENTO_DECISION_AUTHORITY` (fail closed); added `validatePostBarTrigger()` enforcing complete authority matrix; `isDatabentoDecisionAuthority` returns `false` literal type |
| R2-3 | `server/automation/postBarAutomation.ts` | Added `PostBarAutomationDeps` interface for dependency injection; `runPostBarAutomationWithDeps()` accepts injected deps (testable); `runPostBarAutomation()` resolves real modules and delegates; authority guard validates `authorityMode` payload matches live env AND `triggerSource` matches authority matrix; aborts before any subsystem on violation |
| R2-4 | `drizzle/0026_sprint_123a1_foundation.sql` | No `CONTAINS_UNRESOLVED` in any ENUM; effective-once unique constraints on all source bar tables; `DECIMAL(20,0)` for nanosecond timestamps; `reconciliation_status` ENUM replaces `reconciledAgainstOhlcv` boolean; separated rollback tiers (operational preserves evidence tables; destructive drops all) |
| R2-5 | `server/sprint-123a1.test.ts` | All source-text tests replaced with behavioural tests; 28 tests total; authority matrix covers all 4 valid combos + all invalid combos; subsystem isolation uses `runPostBarAutomationWithDeps` with injected mocks; failure isolation verified; `TEST-123A1-027/028` verify `DATABENTO_DECISION_AUTHORITY` removed from Sprint 123A |

---

## 2. Authorised Deliverables Implemented

| Deliverable | File | Status |
|---|---|---|
| Feature-flag configuration | `server/market-data/config.ts` | Complete |
| Canonical TypeScript event contracts | `shared/types/canonical-events.ts` | Complete |
| postBarAutomation | `server/automation/postBarAutomation.ts` | Complete |
| nexusRoutes.ts wiring | `server/nexusRoutes.ts` | Complete |
| Monthly review fix (G-002) | `server/scheduledJobs.ts` | Complete |
| Database migration (schema only) | `drizzle/0026_sprint_123a1_foundation.sql` | Complete — not run against production |
| Sprint 123A.1 test suite | `server/sprint-123a1.test.ts` | **28 tests, 28 passed** |

---

## 3. Test Results

```
 ✓ server/sprint-123a1.test.ts (28 tests) 74ms
 Test Files  1 passed (1)
      Tests  28 passed (28)
   Start at  21:12:18
   Duration  386ms
```

### Test Coverage by Group

| Group | Tests | Result |
|---|---|---|
| Feature Flag Configuration | TEST-123A1-001 to 006 | 6/6 passed |
| DATABENTO_DECISION_AUTHORITY removed | TEST-123A1-027, 028 | 2/2 passed |
| Authority Matrix (behavioural) | TEST-123A1-007 to 013 | 7/7 passed |
| Subsystem Isolation (behavioural) | TEST-123A1-014 to 020 | 7/7 passed |
| Monthly Review Handler | TEST-123A1-021 | 1/1 passed |
| Migration 0026 Structure | TEST-123A1-022 to 026 | 5/5 passed |

---

## 4. TypeScript Compilation

```
pnpm tsc --noEmit
(exit code 0 — zero errors)
```

---

## 5. Git Audit Trail

### Branch: `sprint/123a-1-foundation`

| Metric | Value |
|---|---|
| Base branch | `main` |
| Commits on branch | 3 |
| HEAD SHA | `4ebd5a0` |

### Changed Files (main → HEAD)

```
git diff --name-status main..HEAD
```

| Status | File |
|---|---|
| A | `docs/architecture/SPRINT_123A1_GATE_G1_EVIDENCE_SUBMISSION.md` |
| A | `drizzle/0026_sprint_123a1_foundation.sql` |
| M | `drizzle/meta/_journal.json` |
| M | `drizzle/schema.ts` |
| A | `server/automation/postBarAutomation.ts` |
| A | `server/market-data/config.ts` |
| M | `server/nexusRoutes.ts` |
| M | `server/scheduledJobs.ts` |
| A | `server/sprint-123a1.test.ts` |
| A | `shared/types/canonical-events.ts` |

### Non-Sprint-123A files changed

```
git diff --name-only main..HEAD | grep -v "^docs/\|^drizzle/\|^shared/\|^server/" | wc -l
0
```

All changed files are within the authorised Sprint 123A.1 scope.

---

## 6. Six Mandatory Confirmations

| Confirmation | Result |
|---|---|
| No Databento connection made | **Confirmed** — `DATABENTO_LIVE_ENABLED` not set; no Databento client instantiated |
| No migration run against production | **Confirmed** — `0026_sprint_123a1_foundation.sql` exists for review only |
| No strategy, ADE, risk, or execution logic changed | **Confirmed** — zero changes to strategy files |
| TradingView production authority unchanged | **Confirmed** — `processBar()` remains in `nexusRoutes.ts`; `isDatabentoProcessBarTrigger()` always returns `false` |
| `DATABENTO_DECISION_AUTHORITY` excluded from Sprint 123A | **Confirmed** — removed from `Sprint123AAuthorityMode` type; `getMarketDataAuthority()` throws on it |
| Authority matrix enforced before any subsystem | **Confirmed** — `validatePostBarTrigger()` called first; TEST-123A1-007/019 prove no subsystem runs after violation |

---

## 7. Rollback Verification

**Rollback command (to restore pre-Sprint-123A.1 state):**

```bash
git checkout main
```

**What rollback restores:**
- `nexusRoutes.ts` — direct `processLiveBar()` call restored (pre-G-001-fix state)
- `scheduledJobs.ts` — `not_implemented` monthly review stub restored
- All new files removed (`postBarAutomation.ts`, `config.ts`, `canonical-events.ts`, `sprint-123a1.test.ts`)
- Migration `0026` removed (schema never applied to production)

**Rollback does NOT affect:**
- Any existing `atlas_memory` data
- Any existing strategy, ADE, risk, or execution logic
- TradingView webhook — continues to fire `processBar()` unchanged

---

## 8. Migration Approval Request

`drizzle/0026_sprint_123a1_foundation.sql` creates 9 new tables. It has not been run against the production database.

**Before running this migration, the following must be confirmed:**
1. A full database backup has been taken
2. The migration has been reviewed against the production schema
3. Phil has given explicit written approval to run it

**To defer the migration:** The system continues to operate normally on `TRADINGVIEW_ONLY` authority with no schema changes. The migration is only required before Sprint 123A.3 (DATABENTO_SHADOW mode).

---

## 9. Gate G1 Approval Request

Sprint 123A.1 implementation is complete, all 28 tests pass, TypeScript compiles cleanly, and all six mandatory confirmations are satisfied.

To approve Gate G1 and allow Sprint 123A.2 to begin, please confirm:

1. **Code review:** Implementation is acceptable
2. **Migration decision:** Approve running `0026_sprint_123a1_foundation.sql` against production, or defer to Sprint 123A.3
3. **Sprint 123A.2 authorisation:** Explicit written approval for Sprint 123A.2 scope

> **Sprint 123A.2 will not begin until explicit written approval is received.**
