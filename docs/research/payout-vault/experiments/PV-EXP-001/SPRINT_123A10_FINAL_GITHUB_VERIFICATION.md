# Sprint 123A.10 — Final GitHub Verification Record

## Repository Provenance

| Field | Value |
|---|---|
| Repository | https://github.com/SFGrowth/Project-Atlas |
| Branch | sprint/123a-10-payout-vault-frequency-scan |
| G9 Baseline SHA | `469fcdd270cd44d54888194e466a5fe61af444b4` |
| Implementation SHA | `f54c48cd5573b3a44532bbbebfcf5d296ac46ca8` |
| Security Lock SHA | `70d1dece699a9ad3e0df83a575f0fe04c89f0225` |
| Final Evidence SHA | `d8f130a56c5b17a06fe8b09d949cd69c75f37ee4` |
| SHA-Update Commit | `2f8122a5fc4e5f09d5bc3ac665fc9fd42c131d98` |
| Local HEAD SHA | `2f8122a5fc4e5f09d5bc3ac665fc9fd42c131d98` |
| Remote HEAD SHA | `2f8122a5fc4e5f09d5bc3ac665fc9fd42c131d98` |
| Local/Remote Match | TRUE |
| Working Tree Status | CLEAN |
| Remote Commit Count from G9 | 17 |

### Note on HEAD vs FINAL_EVIDENCE_SHA

The approval document specifies `FINAL_EVIDENCE_SHA=d8f130a`. The current HEAD is
`2f8122a`, which is a single-line addendum that replaced the placeholder
`PENDING_COMMIT` with the actual SHA `d8f130a` in the G10 report. This commit
touches only the report document and does not modify any canonical artefact,
detector, scanner, test, or configuration file. The SHA `d8f130a` is present at
the correct position in the branch history.

---

## Canonical Event Counts

| Field | Value |
|---|---|
| Detector Event Count | 172 |
| Scanner Event Count | 172 |
| False Positives | 0 |
| False Negatives | 0 |
| Field-Level Mismatches | 0 |
| Bidirectional Equivalence | TRUE |
| Setups Per Week | 4.0 |
| Frequency Gate | PASS |

---

## Artefact Manifest (Remote)

All required artefacts are present on the remote branch:

| Artefact | Remote Status |
|---|---|
| `SCANNER_CANONICAL_EVENT_LEDGER.json` | PRESENT |
| `DETECTOR_CANONICAL_EVENT_LEDGER.json` | PRESENT |
| `PV_EXP_001_BIDIRECTIONAL_EQUIVALENCE.json` | PRESENT |
| `PV_EXP_001_ARTEFACT_MANIFEST.json` | PRESENT |
| `vitest.config.ts` | PRESENT |
| `server/test-env-guard.ts` | PRESENT |
| `.env.test.example` | PRESENT |
| `server/sprint-123a10-test-env-isolation.test.ts` | PRESENT |
| `server/sprint-123a10-security.test.ts` | PRESENT |
| `server/market-data/tests/darwin-g7-bar-accounting.test.ts` | PRESENT |
| `SPRINT_123A10_GATE_G10_REPORT.md` | PRESENT |

**UNTRACKED_REQUIRED_ARTEFACTS: 0**
**UNCOMMITTED_REQUIRED_ARTEFACTS: 0**
**ENV_TEST_COMMITTED: FALSE** (`.env.test` is gitignored, not committed)
**COMMITTED_SECRET_FILES: 0**

---

## Security Evidence

| Field | Value |
|---|---|
| Public Unauthenticated Admin Access | FALSE |
| Header-Only Authentication | FALSE |
| Automatic Admin Identity Injection | FALSE |
| Trusted-Proxy Header Spoof Test | PASS |
| Forwarded-Identity Spoof Test | PASS |
| Unauthenticated Protected Route Tests | PASS |
| Non-Admin Privilege Test | PASS |
| Direct Application Port Public Access | BLOCKED (UFW deny, port 3000) |
| Authentication Security Tests | 34/34 PASS |
| Secret Scan Result | CLEAN |
| Hardcoded Credentials | 0 |

---

## Test Environment Isolation

| Field | Value |
|---|---|
| Tests Use Operational Env | FALSE |
| Vitest Env File | `.env.test` (gitignored, isolated) |
| Fail-Closed Guard | ENABLED |
| Staging Database Clients in Tests | 0 |
| Production Database Clients in Tests | 0 |
| Test Database | `atlas_test_123a3` |
| Test Isolation Tests | 37/37 PASS |
| TypeScript Tests | 1153/1153 PASS (40 files) |
| Python Tests | 157/157 PASS |
| Regression Suites Fail | 0 |

---

## Authority Boundary

| Field | Value |
|---|---|
| DARWIN_PROCESSBAR_CALLS | 0 (DARWIN does not call processBar) |
| DARWIN_POSTBARAUTOMATION_CALLS | 0 |
| DARWIN_TRADERSPOST_CALLS | 0 (guarded with explicit throw) |
| DARWIN_TRADOVATE_CALLS | 0 |
| Live Trades Initiated | 0 |
| Strategy Status Changes | 0 |
| Capital Reallocations | 0 |
| DARWIN_DECISION_AUTHORITY | DISABLED |
| DARWIN_EXECUTION_AUTHORITY | DISABLED |

---

## Gate Status

| Field | Value |
|---|---|
| GATE_G10_STATUS | PASS |
| PV_EXP_001_STATUS | CLOSED |
| PV_EXP_002_STATUS | NOT_STARTED (awaiting Phil approval) |
| Merge Status | NOT_MERGED_AWAITING_PHIL_APPROVAL |

---

*This record was generated after the final push verification on 2026-07-29.*
*No credentials, database passwords, or secret values are included in this document.*

---

## Record Integrity

| Field | Value |
|---|---|
| Verification Record Commit SHA | `e5c5232985281b71f43468df9d848dd7db5e8c43` |
| Verification Record File SHA256 (pre-commit) | `2557811c8cfad95a0e1b21a6017ab9fb3f249c6c6524386bacb3f04f1ac0d1fb` |
| Final Push Commit SHA | `67e518d3f35a78a523491448beb68699473e4aee` |
| Final Remote SHA | `67e518d3f35a78a523491448beb68699473e4aee` (pending push) |
