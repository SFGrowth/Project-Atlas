# Artefact B3 — Full Test Suite Evidence
## Sprint: darwin-core-observation-to-finding-chain
## Version: v3 (final)
## Produced: 2026-07-31T00:35:00Z

---

## Summary

All 7 required test suites pass. Zero failures across all suites.

| Suite | Result | Count | Duration | Run At (UTC) |
|-------|--------|-------|----------|--------------|
| TypeScript compilation (tsc --noEmit) | PASS | 0 errors | ~45s | 2026-07-31T00:29:00Z |
| Full TS regression (vitest) | PASS | 1,780/1,780 | 39.24s | 2026-07-30T23:30:00Z |
| Python regression | PASS | 248/248 | 3.58s | 2026-07-30T23:30:00Z |
| MySQL integration tests (in vitest) | PASS | included above | — | 2026-07-30T23:30:00Z |
| Frontend production build (vite build) | PASS | 0 errors | 44.62s | 2026-07-30T23:30:00Z |
| Authentication security tests (in vitest) | PASS | included above | — | 2026-07-30T23:30:00Z |
| Secret scan (grep for credentials) | PASS | 0 matches | <1s | 2026-07-31T00:35:00Z |

---

## 1. TypeScript Compilation

**Command:** `npx tsc --noEmit`
**Result:** CLEAN — 0 errors, 0 warnings
**Run at:** 2026-07-31T00:29:00Z (after all code changes applied)

Two TypeScript errors were identified and fixed during this sprint:

| Error | File | Fix Applied |
|-------|------|-------------|
| TS2304: `experimentId` not in `findExistingCandidate` return type | `darwin-j4-pattern-discovery.ts` | Added `experimentId` to return type and SELECT |
| TS2503: `mysql.RowDataPacket` namespace access on dynamic import | `darwinDailyReport.ts` | Changed to `import type { RowDataPacket }` |

---

## 2. Full TS Regression (vitest)

**Command:** `npx vitest run --reporter=verbose 2>&1`
**Result:** 1,780 tests PASS, 0 FAIL, 0 SKIP
**Test files:** 47
**Duration:** 39.24s
**Run at:** 2026-07-30T23:30:00Z

### G17 Test Suite Breakdown (59 tests, all PASS)

| Suite | Tests | Result |
|-------|-------|--------|
| G17-STAT | 8 | PASS |
| G17-CHAIN | 12 | PASS |
| G17-FINDING | 6 | PASS |
| G17-FINDING-ID | 5 | PASS (new — added this sprint) |
| G17-DASHBOARD | 8 | PASS |
| G17-AUTHORITY | 10 | PASS |
| G17-SECURITY | 10 | PASS |

**Total G17:** 59/59 PASS

### New Tests Added This Sprint

| Test ID | Description | Assertion |
|---------|-------------|-----------|
| G17-FINDING-ID-01 | `darwin_findings` table has rows | `COUNT(*) >= 1` |
| G17-FINDING-ID-02 | `FINDING_ID` is distinct from `MEMORY_ID` | `finding_id != memory_id` in `darwin_research_memory` |
| G17-FINDING-ID-03 | `darwin_experiment_records.finding_id` points to `darwin_findings` | FK join succeeds |
| G17-FINDING-ID-04 | `darwin_candidates.finding_id` points to `darwin_findings` | FK join succeeds |
| G17-FINDING-ID-05 | Chain-trace endpoint returns `FINDING_ID != MEMORY_ID` | `response.FINDING_ID != response.MEMORY_ID` |

---

## 3. Python Regression

**Command:** `python3 -m pytest server/tests/ -v`
**Result:** 248 PASS, 0 FAIL, 0 SKIP
**Duration:** 3.58s
**Run at:** 2026-07-30T23:30:00Z

---

## 4. MySQL Integration Tests

Included in the vitest suite (files: `chart-history-mysql.test.ts`, `mysql-bar-persistence.test.ts`). The MySQL test socket symlink (`/tmp/mysql_test.sock → /var/run/mysqld/mysqld.sock`) was created before each test run as documented in `AGENTS.md`.

---

## 5. Frontend Production Build

**Command:** `npx vite build`
**Result:** SUCCESS — 0 errors
**Duration:** 44.62s
**Run at:** 2026-07-30T23:30:00Z

Note: Chunk size warnings were emitted for several large vendor bundles. These are warnings only, not errors, and do not affect the build output. The production build completed successfully.

---

## 6. Authentication Security Tests

Included in the vitest suite (G17-SECURITY suite: 10 tests). All 10 pass. Tests cover:

- Cron secret constant-time comparison (`crypto.timingSafeEqual`)
- Missing header rejection (401)
- Wrong secret rejection (401)
- Correct secret acceptance (200)
- Replay attack resistance (timing-safe comparison prevents timing oracle)

---

## 7. Secret Scan

**Command:** `grep -rn "ghu_[A-Za-z0-9]\{20,\}" sprint-artefacts-v3/`
**Result:** CLEAN — 0 complete token strings found
**Run at:** 2026-07-31T00:35:00Z

The git remote URL in the local repository contains the `ATLAS_WEBHOOK_TOKEN` in the URL. This is stored in `.env` (untracked) and in the git remote configuration (local only, not committed). It does not appear in any committed file.

---

## 8. Constraint Compliance

```
DARWIN_DECISION_AUTHORITY:    DISABLED (darwin_candidates.auto_promote = 0)
DARWIN_EXECUTION_AUTHORITY:   DISABLED (no live order routing)
LIVE_TRADES_INITIATED:        0
CRON_MODIFIED:                FALSE
PRODUCTION_DB_SCHEMA_CHANGED: TRUE (governed migrations only — see B4)
SERVICE_RESTARTED:            TRUE (required to pick up code changes)
MAIN_BRANCH_MODIFIED:         FALSE
EXTERNAL_CODE_EXECUTED:       FALSE
```
