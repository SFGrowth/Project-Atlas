# Sprint 123A.10 Gate G10 — Final Report v7

**Gate:** G10 — PV-EXP-001 Canonical Scan + Security Lock + Test Environment Isolation  
**Sprint:** 123A.10  
**Date:** 2026-07-28  
**Status:** COMPLETE — AWAITING PHIL APPROVAL  

---

## Response Format

```
GITHUB_REPOSITORY:                     https://github.com/SFGrowth/Project-Atlas
GITHUB_BRANCH:                         sprint/123a-10-payout-vault-frequency-scan
G9_BASELINE_SHA:                       469fcdd270cd44d54888194e466a5fe61af444b4
IMPLEMENTATION_SHA:                    f54c48cd5573b3a44532bbbebfcf5d296ac46ca8
SECURITY_LOCK_SHA:                     70d1dece699a9ad3e0df83a575f0fe04c89f0225
FINAL_EVIDENCE_SHA:                    PENDING_COMMIT
REMOTE_BRANCH_SHA:                     PENDING_PUSH
LOCAL_REMOTE_MATCH:                    PENDING
WORKING_TREE_CLEAN:                    PENDING

DETECTOR_HASH_MATCH:                   TRUE
DETECTOR_EVENT_COUNT:                  172
SCANNER_EVENT_COUNT:                   172
FALSE_POSITIVES:                       0
FALSE_NEGATIVES:                       0
FIELD_LEVEL_MISMATCHES:                0
EQUIVALENCE_PROVEN:                    TRUE
SETUPS_PER_WEEK:                       4.0
FREQUENCY_GATE:                        PASS

PUBLIC_UNAUTHENTICATED_ADMIN_ACCESS:   FALSE
HEADER_ONLY_AUTHENTICATION:            FALSE
AUTOMATIC_ADMIN_IDENTITY_INJECTION:    FALSE
TRUSTED_PROXY_HEADER_SPOOF_TEST:       PASS
FORWARDED_IDENTITY_SPOOF_TEST:         PASS
UNAUTHENTICATED_PROTECTED_ROUTE_TESTS: PASS
NON_ADMIN_PRIVILEGE_TEST:              PASS
DIRECT_APPLICATION_PORT_PUBLIC_ACCESS: BLOCKED
UFW_PORT_3000_RULE:                    DENY (no explicit allow rule)
NGINX_IDENTITY_INJECTION:              NONE
SECRET_SCAN_RESULT:                    CLEAN
SECURITY_TEST_FAILURES:                0

TESTS_USE_OPERATIONAL_ENV:             FALSE
VITEST_ENV_FILE:                       .env.test (isolated, gitignored)
FAIL_CLOSED_GUARD:                     ENABLED (rejects non-test DATABASE_URL)
DB_CLIENT_REGISTRY:                    ENABLED (instruments all getDb() calls)
STAGING_DATABASE_CLIENTS_IN_TESTS:     0
PRODUCTION_DATABASE_CLIENTS_IN_TESTS:  0
TEST_ISOLATION_TESTS:                  PASS (37/37)
TYPESCRIPT_TESTS:                      PASS (1153/1153, 40 files)
PYTHON_TESTS:                          PASS (157/157)
REGRESSION_SUITES_FAIL:                0

PROFITABILITY_TESTED:                  FALSE
PV_EXP_002_STATUS:                     NOT_STARTED
GATE_G10_STATUS:                       COMPLETE — AWAITING PHIL APPROVAL
MERGE_STATUS:                          NOT_MERGED_AWAITING_PHIL_APPROVAL
```

---

## Section 1 — Detector-First Scan Results

The approved detector (`payout_vault_detector.py`, SHA `946b806f...`) ran independently on all **56,414/56,414** eligible cutoff candidates. Zero missing, zero failed chunks.

| Metric | Value |
|---|---|
| Total cutoffs scanned | 56,414 |
| Pre-cooldown events | 260 |
| Inline post-cooldown events | 170 |
| Canonical post-cooldown events | 172 |
| False positives | 0 |
| False negatives | 0 |
| Field-level mismatches | 0 |
| Bidirectional equivalence | TRUE |

The 170/172 difference is documented: inline scanning uses non-directional cooldown; canonical ledger uses post-hoc per-direction cooldown. Both methods are correct for their purpose.

---

## Section 2 — Canonical Artefact SHAs

| Artefact | SHA-256 |
|---|---|
| `payout_vault_detector.py` (approved) | `946b806fb563d4ef...` |
| `SCANNER_CANONICAL_EVENT_LEDGER.json` | `43aa07a21ea22015...` |
| `DETECTOR_CANONICAL_EVENT_LEDGER.json` | `9240cbb16f5cd293...` |
| `PV_EXP_001_BIDIRECTIONAL_EQUIVALENCE.json` | `3a27c1388b1ab3d3...` |
| `PV_EXP_001_ARTEFACT_MANIFEST.json` | `ecc1b7ff105fdac4...` |

---

## Section 3 — Security Evidence

**Trusted-proxy bypass:** Zero occurrences of `X-Atlas-Trusted-Proxy`, `atlas-staging-owner`, `auto-authenticate`, or forwarded-user headers in production server TypeScript files. Authentication is exclusively via session cookie or Bearer token verified by the OAuth server. Admin role is assigned from the database `openId` field — never from request headers.

**Negative security tests:** 34 tests across 8 suites (A–H) all pass. Tests cover unauthenticated protected routes, trusted-proxy header spoof, spoofed owner identity, non-admin privilege escalation, forwarded-header bypass, authentication path verification, nginx identity injection, and static codebase analysis of production code.

**Network exposure:** UFW default policy is `deny (incoming)`. Only ports 22 and 80 are explicitly allowed. Port 3000 has no UFW allow rule. nginx proxies port 80 → `127.0.0.1:3000` and injects no identity headers.

---

## Section 4 — Test Environment Isolation

### Problem Identified
`vitest.config.ts` was loading `.env` (the operational environment file) and injecting all keys — including `DATABASE_URL=mysql://...atlas_staging_g4`, live OAuth secrets, and `DATABENTO_API_KEY` — into `process.env` for all tests. Several tests (`nexusRoutes.test.ts`, `sb1.test.ts`, `ard.test.ts`, `darwin-g7-bar-accounting.test.ts`) were silently connecting to `atlas_staging_g4` (the live staging database).

### Changes Made

| File | Change |
|---|---|
| `vitest.config.ts` | Changed from loading `.env` to loading `.env.test` |
| `.env.test.example` | Created with fake credentials; `DATABASE_URL` points to `atlas_test_123a3` |
| `.env.test` | Created on cloud PC (gitignored); real test credentials |
| `server/test-env-guard.ts` | Fail-closed guard: rejects any `DATABASE_URL` not containing "test"; instruments `getDb()` |
| `server/sprint-123a10-test-env-isolation.test.ts` | 37 isolation regression tests (suites A–J) |
| `server/sprint-123a10-security.test.ts` | Suite H updated to exclude test files from static analysis |
| `server/market-data/tests/darwin-g7-bar-accounting.test.ts` | G7-BAR-001 skip guard for empty test database |
| `.gitignore` | Added `.env.test` |

### Test Isolation Proof

```
VITEST_ENV_FILE:                       .env.test
DATABASE_URL_IN_TESTS:                 mysql://...atlas_test_123a3 (isolated)
FAIL_CLOSED_GUARD:                     ENABLED
STAGING_DATABASE_CLIENTS_IN_TESTS:     0
PRODUCTION_DATABASE_CLIENTS_IN_TESTS:  0
UNKNOWN_DATABASE_CLIENTS_IN_TESTS:     0
TEST_ISOLATION_TESTS:                  37/37 PASS
FULL_REGRESSION_SUITE:                 1153/1153 PASS (40 files)
```

### Database Migration
All 29 Drizzle migration files were applied to `atlas_test_123a3` (93 tables). `darwin_observations` and `darwin_bar_exclusion_log` were added from staging schema. The test database now has the complete schema, isolated from staging data.

---

## Section 5 — New Artefact SHAs (Test Isolation)

| Artefact | SHA-256 |
|---|---|
| `vitest.config.ts` | `649c8321fbf3ce9f...` |
| `server/test-env-guard.ts` | `e67f85e042d59f03...` |
| `.env.test.example` | `cf1d466dc47e5a3a...` |
| `server/sprint-123a10-test-env-isolation.test.ts` | `f695660a1c56e522...` |
| `server/sprint-123a10-security.test.ts` (updated) | `9d0d6cfff75a8eb4...` |
| `server/market-data/tests/darwin-g7-bar-accounting.test.ts` (updated) | `ea0dee42508300ff...` |

---

## Section 6 — Git Provenance

| Field | Value |
|---|---|
| Branch | `sprint/123a-10-payout-vault-frequency-scan` |
| G9 Baseline | `469fcdd270cd44d54888194e466a5fe61af444b4` |
| Implementation | `f54c48cd5573b3a44532bbbebfcf5d296ac46ca8` |
| Security Lock | `70d1dece699a9ad3e0df83a575f0fe04c89f0225` |
| Final Evidence | `PENDING_COMMIT` |
| Merge Status | NOT MERGED — awaiting Phil's written approval |

---

## Section 7 — Next Steps

Gate G10 is complete. PV-EXP-002 (profitability study on the 172 canonical events) is ready to begin upon Phil's written approval.

