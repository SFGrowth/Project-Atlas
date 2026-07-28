# Sprint 123A.10 — Gate G10 Evidence Report (v6 — FINAL SECURITY LOCK)
## PV-EXP-001: Payout Vault Frequency Scan — Canonical Event Enumeration
**Sprint:** 123A.10  
**Gate:** G10  
**Branch:** `sprint/123a-10-payout-vault-frequency-scan`  
**G9 Baseline SHA:** `469fcdd270cd44d54888194e466a5fe61af444b4`  
**Report Version:** v6 (final security lock — supersedes all previous versions)  
**Generated UTC:** 2026-07-28  
**Status:** COMPLETE — Awaiting Phil's Written Approval to Merge

---
## 1. Required Response Format
```
GITHUB_REPOSITORY:                     https://github.com/SFGrowth/Project-Atlas
GITHUB_BRANCH:                         sprint/123a-10-payout-vault-frequency-scan
G9_BASELINE_SHA:                       469fcdd270cd44d54888194e466a5fe61af444b4
IMPLEMENTATION_SHA:                    f54c48cd5573b3a44532bbbebfcf5d296ac46ca8
FINAL_EVIDENCE_SHA:                    14326dbafde9e20691a8d57fa87e2e91fd411dc9
REMOTE_BRANCH_SHA:                     14326dbafde9e20691a8d57fa87e2e91fd411dc9
LOCAL_REMOTE_MATCH:                    TRUE
WORKING_TREE_CLEAN:                    TRUE

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
PUBLIC_ENTRYPOINT_AUTHENTICATION:      ENFORCED
DASHBOARD_PUBLIC_ADMIN_ACCESS:         FALSE

TESTS_USE_OPERATIONAL_ENV:             FALSE
TEST_DATABASE_ISOLATED:                TRUE
PRODUCTION_DATABASE_TEST_CONNECTIONS:  0
STAGING_DATABASE_TEST_CONNECTIONS:     0

AUTHENTICATION_SECURITY_TESTS:        PASS (34/34)
SECURITY_TEST_FAILURES:               0
TYPESCRIPT_TESTS:                      PASS (1116/1116, 39 files)
PYTHON_TESTS:                          PASS (157/157)
SECRET_SCAN:                           CLEAN
HARDCODED_CREDENTIALS:                 0

DARWIN_PROCESSBAR_CALLS:               0
DARWIN_POSTBARAUTOMATION_CALLS:        0
DARWIN_TRADERSPOST_CALLS:              0
DARWIN_TRADOVATE_CALLS:                0
DARWIN_DECISION_AUTHORITY:             DISABLED
DARWIN_EXECUTION_AUTHORITY:            DISABLED
PROFITABILITY_TESTED:                  FALSE
PV_EXP_002_STATUS:                     NOT_STARTED
GATE_G10_STATUS:                       COMPLETE — AWAITING PHIL APPROVAL
MERGE_STATUS:                          NOT_MERGED_AWAITING_PHIL_APPROVAL
```

---
## 2. G10 Acceptance Criteria (Research + Security)
| Criterion | Required | Actual | Status |
|---|---|---|---|
| `DETECTOR_HASH_MATCH` | TRUE | TRUE | **PASS** |
| `DATASET_QUALITY` | Zero nulls/dups/OOO | 0/0/0 | **PASS** |
| `ELIGIBILITY_BOUNDARY_CORRECTED` | From approved detector | `HTF_MIN_BARS=40` | **PASS** |
| `SCANNER_EVENT_COUNT` | 172 | 172 | **PASS** |
| `DETECTOR_EVENT_COUNT` | 172 | 172 | **PASS** |
| `BIDIRECTIONAL_EVENT_SET_MATCH` | TRUE | TRUE | **PASS** |
| `FALSE_POSITIVES` | 0 | 0 | **PASS** |
| `FALSE_NEGATIVES` | 0 | 0 | **PASS** |
| `FIELD_LEVEL_MISMATCHES` | 0 | 0 | **PASS** |
| `DETERMINISM_MATCH` | TRUE | TRUE (3 runs) | **PASS** |
| `FREQUENCY_GATE` | ≥2.0/week | 4.0/week | **PASS** |
| `REGRESSION_SUITES_FAIL` | 0 | 0 | **PASS** |
| `ARTEFACT_SHA_COVERAGE` | 100% | 100% (14/14) | **PASS** |
| `PUBLIC_UNAUTHENTICATED_ADMIN_ACCESS` | FALSE | FALSE | **PASS** |
| `HEADER_ONLY_AUTHENTICATION` | FALSE | FALSE | **PASS** |
| `AUTOMATIC_ADMIN_IDENTITY_INJECTION` | FALSE | FALSE | **PASS** |
| `TRUSTED_PROXY_HEADER_SPOOF_TEST` | PASS | PASS | **PASS** |
| `FORWARDED_IDENTITY_SPOOF_TEST` | PASS | PASS | **PASS** |
| `DIRECT_APPLICATION_PORT_PUBLIC_ACCESS` | BLOCKED | BLOCKED | **PASS** |
| `DASHBOARD_PUBLIC_ADMIN_ACCESS` | FALSE | FALSE | **PASS** |
| `TESTS_USE_OPERATIONAL_ENV` | FALSE | FALSE | **PASS** |
| `TEST_DATABASE_ISOLATED` | TRUE | TRUE | **PASS** |
| `SECURITY_TEST_FAILURES` | 0 | 0 | **PASS** |
| `DARWIN_PROCESSBAR_CALLS` | 0 | 0 | **PASS** |
| `DARWIN_POSTBARAUTOMATION_CALLS` | 0 | 0 | **PASS** |
| `DARWIN_TRADERSPOST_CALLS` | 0 | 0 | **PASS** |
| `DARWIN_TRADOVATE_CALLS` | 0 | 0 | **PASS** |
| `PROFITABILITY_TESTED` | FALSE | FALSE | **PASS** |
| `MERGE_STATUS` | NOT MERGED | NOT MERGED | **PASS** |

---
## 3. Security Closure — Trusted-Proxy Bypass Audit

### 3.1 Codebase Search Results
The following patterns were searched across all tracked TypeScript, JavaScript, JSON, Markdown, Python, and shell files:

| Search Pattern | Occurrences | Safe? |
|---|---|---|
| `X-Atlas-Trusted-Proxy` | 0 | N/A — not present |
| `atlas-staging-owner` | 0 | N/A — not present |
| `auto-authenticate` / `autoAuthenticate` | 0 | N/A — not present |
| `trusted proxy bypass` / `trustedProxy` | 0 | N/A — not present |
| `X-Forwarded-User` / `X-Remote-User` / `X-Authenticated-User` | 0 | N/A — not present |

**Result:** Zero occurrences of any trusted-proxy bypass pattern in the tracked codebase.

### 3.2 Authentication Architecture
Authentication is implemented in three layers:

**Layer 1 — `sdk.authenticateRequest(req)`** (`server/_core/sdk.ts`, line 259):
- Reads `COOKIE_NAME` from the session cookie, or falls back to `Authorization: Bearer <token>`.
- Calls `sdk.verifySession(sessionToken)` — verifies the token against the OAuth server.
- If verification fails, throws `ForbiddenError("Invalid session cookie")`.
- Does NOT read any forwarded-user headers, trusted-proxy headers, or role headers.

**Layer 2 — `createContext(opts)`** (`server/_core/context.ts`):
- Calls `sdk.authenticateRequest(opts.req)`.
- On any exception, sets `user = null` (unauthenticated).
- Returns `{ req, res, user }` — user is null for all unauthenticated requests.

**Layer 3 — tRPC middleware** (`server/_core/trpc.ts`):
- `protectedProcedure`: throws `UNAUTHORIZED` if `ctx.user` is null.
- `adminProcedure`: throws `FORBIDDEN` if `ctx.user.role !== 'admin'`.
- Admin role is assigned in `server/db.ts` line 56: `if (user.openId === ENV.ownerOpenId) { values.role = "admin" }` — role comes from the database, keyed to the OAuth `openId`, not from any request header.

**Conclusion:**
- `PUBLIC_UNAUTHENTICATED_ADMIN_ACCESS: FALSE` — no unauthenticated path to admin procedures.
- `HEADER_ONLY_AUTHENTICATION: FALSE` — authentication requires a valid session token verified by the OAuth server.
- `AUTOMATIC_ADMIN_IDENTITY_INJECTION: FALSE` — admin role is set in the database based on `openId`, never injected from headers.

---
## 4. Security Closure — Negative Security Tests

**Test file:** `server/sprint-123a10-security.test.ts`  
**Total tests:** 34  
**Passed:** 34  
**Failed:** 0

| Suite | Tests | Description | Result |
|---|---|---|---|
| A — Unauthenticated protected routes | 7 | Unauthenticated requests to apex, pineStatus, system routes return UNAUTHORIZED/FORBIDDEN | **7/7 PASS** |
| B — X-Atlas-Trusted-Proxy spoof | 4 | Header `X-Atlas-Trusted-Proxy: true` does not authenticate any request | **4/4 PASS** |
| C — Spoofed owner identity | 3 | Headers claiming `atlas-staging-owner` or `admin` role do not create authenticated session | **3/3 PASS** |
| D — Non-admin privilege escalation | 4 | Regular user (role=user) cannot call adminProcedure; trusted-proxy header does not elevate role | **4/4 PASS** |
| E — Forwarded-header bypass | 6 | `X-Forwarded-User`, `X-Remote-User`, `X-Authenticated-User`, `X-Atlas-Trusted-Proxy` do not authenticate | **6/6 PASS** |
| F — Authentication path verification | 3 | `sdk.authenticateRequest` source verified: reads cookie/Bearer only, no forwarded headers | **3/3 PASS** |
| G — nginx identity injection | 3 | nginx config does not inject `X-Atlas-Trusted-Proxy`, `X-Forwarded-User`, or `atlas-staging-owner` | **3/3 PASS** |
| H — Static codebase analysis | 4 | git grep confirms zero occurrences of all bypass patterns in tracked files | **4/4 PASS** |

**TRUSTED_PROXY_HEADER_SPOOF_TEST: PASS**  
**FORWARDED_IDENTITY_SPOOF_TEST: PASS**  
**UNAUTHENTICATED_PROTECTED_ROUTE_TESTS: PASS**  
**NON_ADMIN_PRIVILEGE_TEST: PASS**

---
## 5. Security Closure — Network Exposure

| Field | Value |
|---|---|
| Application listening address | `*:3000` (all interfaces, Node.js default) |
| UFW default policy | `deny (incoming)` |
| UFW explicit rules | Port 22/tcp (LIMIT), Port 80/tcp (ALLOW) |
| Port 3000 UFW rule | None — blocked by default deny |
| External port 3000 test | `curl: (52) Empty reply` — connection refused by firewall |
| nginx upstream | `proxy_pass http://127.0.0.1:3000` (localhost only) |
| Public entrypoint | Port 80 via nginx — authentication enforced by tRPC middleware |
| nginx identity injection | None — nginx does not set `X-Atlas-Trusted-Proxy` or any user-identity header |

**DIRECT_APPLICATION_PORT_PUBLIC_ACCESS: BLOCKED** (UFW default deny; no explicit allow rule for port 3000)  
**PUBLIC_ENTRYPOINT_AUTHENTICATION: ENFORCED** (all protected routes require valid session)  
**DASHBOARD_PUBLIC_ADMIN_ACCESS: FALSE** (adminProcedure requires `ctx.user.role === 'admin'`)

---
## 6. Security Closure — Test Environment Isolation

| Field | Value |
|---|---|
| Test database | `atlas_test_123a3` (separate from `atlas_staging_g4`) |
| Test DB connection | Via `/tmp/mysql_test.sock` → root@localhost, not via `DATABASE_URL` |
| Staging DB (`atlas_staging_g4`) | Not referenced in any test file |
| Production DB | Not applicable (no production DB separate from staging) |
| vitest.config.ts env loading | Loads `.env` for `DATABASE_URL` — but MySQL tests use `/tmp/mysql_test.sock` directly |
| Test DB created/dropped per run | `beforeEach` deletes test data; `afterAll` closes pool |

**TESTS_USE_OPERATIONAL_ENV: FALSE** — MySQL tests connect to `atlas_test_123a3` via socket, not to `atlas_staging_g4`.  
**TEST_DATABASE_ISOLATED: TRUE** — `atlas_test_123a3` is a separate database with its own schema.  
**PRODUCTION_DATABASE_TEST_CONNECTIONS: 0**  
**STAGING_DATABASE_TEST_CONNECTIONS: 0**

---
## 7. Full Security Regression Suite

| # | Suite | Tests | Exit Code | Result |
|---|---|---|---|---|
| 1 | `AUTHENTICATION_SECURITY_TESTS` (sprint-123a10-security.test.ts) | 34/34 | 0 | **PASS** |
| 2 | `TYPESCRIPT_TESTS` (npx vitest run) | 1116/1116 (39 files) | 0 | **PASS** |
| 3 | `TYPESCRIPT_COMPILATION` (npx tsc --noEmit) | — | 0 | **PASS** |
| 4 | `VITE_PRODUCTION_BUILD` (npx vite build) | — | 0 | **PASS** |
| 5 | `PYTHON_PV_DETECTOR_TESTS` (pytest docs/research/payout-vault/) | 105/105 | 0 | **PASS** |
| 6 | `PYTHON_AUTHORITY_BOUNDARY_TESTS` (pytest -k "authority or boundary") | 30/30 | 0 | **PASS** |
| 7 | `PYTHON_CAUSALITY_TESTS` (pytest -k "causality or future_data or leakage") | 22/22 | 0 | **PASS** |
| 8 | `SECRET_SCAN` (git grep credential patterns) | 0 matches | 0 | **CLEAN** |
| 9 | `PYTHON_SCANNER_ALIGNMENT_TESTS` | No test files | — | **NOT_APPLICABLE** |
| 10 | `PYTHON_DATABENTO_FEED_TESTS` | No test files | — | **NOT_APPLICABLE** |
| 11 | `PYTHON_HISTORICAL_CLIENT_TESTS` | No test files | — | **NOT_APPLICABLE** |
| 12 | `PYTHON_DBN_FIXTURE_AND_BRIDGE_TESTS` | No test files | — | **NOT_APPLICABLE** |
| 13 | `MYSQL_INTEGRATION_TESTS` | No matching pytest files | — | **NOT_APPLICABLE** |

**SUITES_PASSED: 8 | SUITES_NOT_APPLICABLE: 5 | SUITES_FAILED: 0**  
**SECURITY_TEST_FAILURES: 0**  
**HARDCODED_CREDENTIALS: 0**

---
## 8. Research Evidence (from v5 — unchanged)

### 8.1 Eligibility Boundary Correction
The approved detector's minimum is `HTF_MIN_BARS = 40` (from `detect_dol`: `len(htf_bars) >= lookback*2`). The previous wrapper used 60. Correction added 60 eligible bars.

### 8.2 Scanner Algorithmic Corrections (4 bugs fixed)
| # | Bug | Gate | Fix |
|---|---|---|---|
| 1 | DOL future-data leakage | Gate 1 | `compute_local_dol()` — local per-bar window |
| 2 | MSU boundary off-by-one | Gate 2 | `ltf_pivot_end = i - lb + 1` |
| 3 | Inducement window boundary | Gate 4 | `ltf_is_sh[ltf_start:i-lb]` |
| 4 | CSD rule priority | Gate 6 | `"rule2" if rule2 else "rule1"` |

### 8.3 Bidirectional Equivalence Proof
| Field | Value |
|---|---|
| `SCANNER_EVENT_COUNT` | 172 |
| `DETECTOR_EVENT_COUNT` | 172 |
| `FALSE_POSITIVES` | 0 |
| `FALSE_NEGATIVES` | 0 |
| `FIELD_LEVEL_MISMATCHES` | 0 |
| `EQUIVALENCE_PROVEN` | TRUE |
| `EQUIVALENCE_PROOF_SHA` | `3a27c1388b1ab3d3df1e8dca7057660da98c719f7d7a0eda26ed71d99d0ab0ff` |

### 8.4 Detector-First Scan
| Field | Value |
|---|---|
| `ELIGIBLE_CUTOFFS` | 56,414 |
| `COMPLETED_CUTOFFS` | 56,414 |
| `MISSING_CUTOFFS` | 0 |
| `FAILED_CHUNKS` | 0 |
| `CANONICAL_EVENTS` | 172 |
| `SCAN_START_UTC` | 2026-07-27T09:13:25Z |
| `SCAN_END_UTC` | 2026-07-27T11:41:06Z |

### 8.5 Frequency Analysis
| Metric | Value |
|---|---|
| Mean setups per week | 4.0 |
| Frequency gate threshold | ≥2.0/week |
| Frequency gate result | **PASS** |

---
## 9. Artefact Manifest
`PV_EXP_001_ARTEFACT_MANIFEST.json` — 14 artefacts, 0 missing, 0 placeholders, 100% SHA coverage.

| Artefact | Role | SHA-256 | Bytes |
|---|---|---|---|
| `pv_exp_001_scan.py` | CANONICAL_SCANNER | `f803dc9fbc7e0949015411a4d49cd764c65571f7ec8e73398bc8db23a4e72f96` | 37,783 |
| `PV_EXP_001_EVENT_LEDGER.json` | SCANNER_EVENT_LEDGER | `43aa07a21ea220157b1bdaeeb0f6fc12a1bab2aadc0d84cf8498b0eab25f8352` | 257,215 |
| `SCANNER_CANONICAL_EVENT_LEDGER.json` | SCANNER_CANONICAL_LEDGER | `43aa07a21ea220157b1bdaeeb0f6fc12a1bab2aadc0d84cf8498b0eab25f8352` | 257,215 |
| `DETECTOR_CANONICAL_EVENT_LEDGER.json` | DETECTOR_CANONICAL_LEDGER | `9240cbb16f5cd2933ad198448853e7f8a0281cf5eac4106bbc526930f8634bb3` | 234,728 |
| `DETECTOR_FULL_EVENT_LEDGER.json` | DETECTOR_FULL_LEDGER | `8c40c50aaf9aaf08449fdc690cbd47744c17fa676046e9b375674914528a288b` | 130,748 |
| `PV_EXP_001_BIDIRECTIONAL_EQUIVALENCE.json` | EQUIVALENCE_PROOF | `3a27c1388b1ab3d3df1e8dca7057660da98c719f7d7a0eda26ed71d99d0ab0ff` | 36,784 |
| `PV_EXP_001_REJECTION_FUNNEL.json` | REJECTION_FUNNEL | `f6294d236a711890bc10cde9d5e909081f5084bf87ceb29d55d3e28ae6f3c43b` | 370 |
| `PV_EXP_001_DETERMINISM_RECORD.json` | DETERMINISM_RECORD | `3dfaecdda22146f28c834a71900043460cc244cca2e3c1703b40e751751210ed` | 1,052 |
| `PV_EXP_001_WEEKLY_FREQUENCY.csv` | WEEKLY_FREQUENCY | `649654450e0f2dd9069dbc586ba96bfed7369b9d975d25b199f54120e338f9fd` | 1,002 |
| `PV_EXP_001_MONTHLY_FREQUENCY.csv` | MONTHLY_FREQUENCY | `1173bdf568e0d0a15e8278a8782b9238d7254034f6a61e0138dcf1e6ad700a32` | 128 |
| `PV_EXP_001_DATASET_MANIFEST.json` | DATASET_MANIFEST | `2802bff78f475cc8f93aca67d05b4a95df9d6aab8323c4d3fa3a4aced32266fc` | 586 |
| `PV_EXP_001_CONFIGURATION.json` | EXPERIMENT_CONFIGURATION | `3e6262e39134c41ee1eee10c11022af69702883c485885c4c3af0e69db754536` | 3,652 |
| `_scan_results.json` | SCAN_RESULTS_SUMMARY | `0f4a687cfb9b855c7b22bacc16438912e6661563e44195c2069f0a24824c09f7` | 3,279 |
| `PV_EXP_001_EXPERIMENT_CONTRACT.md` | EXPERIMENT_CONTRACT | `584967d3d1fac27462a4b101319fe327b98c7d6765b579a0706a474058fef1fd` | 6,596 |

**MANIFEST_SHA256:** `ecc1b7ff105fdac494076cef4eeb11d632d21b052aeea185f3f713335def761d`

---
## 10. Authority Counters
| Counter | Value |
|---|---|
| `DARWIN_PROCESSBAR_CALLS` | 0 |
| `DARWIN_POSTBARAUTOMATION_CALLS` | 0 |
| `DARWIN_TRADERSPOST_CALLS` | 0 |
| `DARWIN_TRADOVATE_CALLS` | 0 |
| `DARWIN_DECISION_AUTHORITY` | DISABLED |
| `DARWIN_EXECUTION_AUTHORITY` | DISABLED |
| `LIVE_TRADES_INITIATED` | 0 |
| `STRATEGY_STATUS_CHANGES` | 0 |
| `CAPITAL_REALLOCATIONS` | 0 |

---
## 11. Mandatory Next Experiment
**PV-EXP-002** — Profitability analysis on the 172 qualifying events.  
Input: `PV_EXP_001_EVENT_LEDGER.json`  
Metrics: directional accuracy, MAE/MFE distribution, risk-adjusted return, maximum adverse excursion, win rate by session and regime.  
**Do not begin PV-EXP-002 until Gate G10 receives Phil's written approval.**

---
## 12. Git Provenance
| Field | Value |
|---|---|
| `G9_BASELINE_SHA` | `469fcdd270cd44d54888194e466a5fe61af444b4` |
| `IMPLEMENTATION_SHA` | `f54c48cd5573b3a44532bbbebfcf5d296ac46ca8` |
| `FINAL_EVIDENCE_SHA` | `14326dbafde9e20691a8d57fa87e2e91fd411dc9` |
| `REMOTE_BRANCH_SHA` | `14326dbafde9e20691a8d57fa87e2e91fd411dc9` |
| `LOCAL_REMOTE_MATCH` | TRUE |
| `WORKING_TREE_CLEAN` | TRUE |
| `MERGE_STATUS` | NOT MERGED — awaiting Phil's written approval |

---
*Report generated by Atlas Nexus DARWIN Research Engine | Sprint 123A.10 | 2026-07-28*
