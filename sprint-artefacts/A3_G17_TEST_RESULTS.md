# Artefact A3 — G17 Test Suite Results
## Sprint: darwin-core-observation-to-finding-chain
## Date: 2026-07-30 | Generated: 2026-07-30T22:51:00Z

---

## Final Test Run

```
Test File:   server/sprint-darwin-core-chain-gate-g17.test.ts
Run At:      2026-07-30T22:47:24Z
Duration:    1.70s
Result:      54 passed / 0 failed / 0 skipped
```

## Test Suite Breakdown

| Suite | Tests | Pass | Fail |
|-------|-------|------|------|
| G17-RULE: Discovery rule is frozen | 4 | 4 | 0 |
| G17-OBS: Observation record is immutable | 5 | 5 | 0 |
| G17-CHAIN: Full observation-to-finding chain | 8 | 8 | 0 |
| G17-DEDUP: Duplicate candidate prevention | 3 | 3 | 0 |
| G17-FINDING: Research memory is populated | 4 | 4 | 0 |
| G17-NOTIF: Notification is externally delivered | 4 | 4 | 0 |
| G17-STAT: Statistical classification | 8 | 8 | 0 |
| G17-SECURITY: Authority boundary | 6 | 6 | 0 |
| G17-BHFDR: BH-FDR correction | 4 | 4 | 0 |
| G17-LIFECYCLE: Research lifecycle | 4 | 4 | 0 |
| G17-PERF: Performance | 4 | 4 | 0 |
| **TOTAL** | **54** | **54** | **0** |

## Issues Fixed During This Session

### Issue 1: G17-CHAIN-06 — Research memory row not found by findingId

**Root Cause:** After adding the `darwin_findings` table, `persistFinding()` was returning `darwin_findings.finding_id` (the new formal finding ID) instead of `darwin_research_memory.memory_id`. The G17 tests query `darwin_research_memory` by `memory_id = chainResult.chain.findingId`.

**Fix:** Changed `persistFinding()` to return `memoryId` as the canonical finding ID for backward compatibility. The `darwin_findings` record is linked via `darwin_research_memory.finding_id = darwin_findings.finding_id`.

**File:** `server/darwin/darwin-j4-pattern-discovery.ts` line 671

### Issue 2: G17-FINDING-04 — notification_id NULL in research memory

**Root Cause:** Same as Issue 1. The `sendFindingNotification()` UPDATE used `WHERE memory_id = params.findingId`. When `findingId` was the `darwin_findings.finding_id` (a different UUID), the UPDATE matched zero rows.

**Fix:** Same fix as Issue 1 — `persistFinding()` now returns `memoryId`, so `params.findingId` in `sendFindingNotification()` correctly targets the `darwin_research_memory` row.

## Test Guard Output

```
[Atlas Test Guard] All checks passed. Proceeding with test run.
NODE_ENV: test
DATABASE_URL: (not set)
OAUTH_SERVER_URL: (not set)
OWNER_OPEN_ID: (not set)
DATABENTO_API_KEY: (not set)
BRIDGE_AUTH_TOKEN: (not set)

[Atlas Test Guard] Database Client Registry:
  TOTAL_TEST_DATABASE_CLIENTS:     0
  ISOLATED_TEST_DATABASE_CLIENTS:  0
  STAGING_DATABASE_CLIENTS:        0
  PRODUCTION_DATABASE_CLIENTS:     0
  UNKNOWN_DATABASE_CLIENTS:        0
```

**G17_STATUS: 54/54 PASS**
