# Sprint 123A.4 — Gate G4 Automated Validation Results (Interim)

**Document version:** 1.0  
**Date:** 2026-07-21  
**Branch:** `sprint/123a-2-databento-adapter`  
**Implementation SHA:** `0f770762654c067998cf7e8adc984eb5a06e4b8b`  
**Preparation SHA:** `bde4aacbfd390b60b57efd78543fcbec2c9fd361`  
**Staging database:** `atlas_staging_g4` (MySQL 8, all 28 migrations applied)  
**Prepared by:** Atlas Nexus automated session

---

> **Gate G4 is not ready for approval.**
> This document records only the automated validation steps that can be executed without a live Databento connection. All live-session validations are marked **OPERATIONAL VALIDATION PENDING**. Gate G4 approval requires all pending live validations to pass and written approval from Phil.

---

## 1. Overall Status

| Category | Result |
|---|---|
| Gate G1–G4 targeted Vitest suite (447 tests) | **PASS** |
| Python Databento feed suite (143 tests) | **PASS** |
| TypeScript compilation | **PASS** |
| Frontend production build | **PASS** |
| Environment preflight — variable presence | **PASS** (sandbox only — see Section 4) |
| Environment preflight — live credentials | **UNVERIFIED** (no real credentials in sandbox) |
| Live Databento shadow session | **OPERATIONAL VALIDATION PENDING** |
| Latency and continuity metrics | **OPERATIONAL VALIDATION PENDING** |
| Playwright browser tests (CB-001 to CB-020) | **OPERATIONAL VALIDATION PENDING** |
| Live SSE reconnect proof | **OPERATIONAL VALIDATION PENDING** |
| Parity threshold evaluation (>= 500 bars) | **OPERATIONAL VALIDATION PENDING** |
| Chart-authority readiness check (7 gates) | **OPERATIONAL VALIDATION PENDING** |
| Final evidence-directory secret scan | **OPERATIONAL VALIDATION PENDING** |
| **Gate G4 approval** | **PENDING — not approved** |

---

## 2. Automated Test Results

### 2.1 Gate G1–G4 Targeted Vitest Suite

**Command:**
```
pnpm vitest run <18 files listed in Section 2.1.1>
```

**Environment:**
- `DATABASE_URL`: `atlas_staging_g4` via MySQL 8 Unix socket
- `MARKET_DATA_AUTHORITY`: `DATABENTO_SHADOW`
- `ATLAS_GATE_G4_CHART_AUTHORITY_ENABLED`: `false`
- `NODE_ENV`: `test`

**Result: 447 / 447 PASS**

| Gate | File | Tests | Result |
|---|---|---|---|
| G1 | `server/sprint-123a1.test.ts` | 35 | PASS |
| G1 | `server/sprint-123a1-integration.test.ts` | 7 | PASS |
| G2 | `server/market-data/tests/sprint-123a2.test.ts` | 31 | PASS |
| G3 | `server/market-data/tests/sprint-123a3.test.ts` | 62 | PASS |
| G3 | `server/market-data/tests/trade-bar-builder.test.ts` | 12 | PASS |
| G3 | `server/market-data/tests/gap-recovery-orchestrator.test.ts` | 9 | PASS |
| G3 | `server/market-data/tests/blocked-window.test.ts` | 5 | PASS |
| G3 | `server/market-data/tests/mysql-bar-persistence.test.ts` | 61 | PASS |
| G3 | `server/market-data/tests/contract-roll-integration.test.ts` | 7 | PASS |
| G3 | `server/market-data/tests/price-units.test.ts` | 8 | PASS |
| G3 | `server/market-data/tests/recovery-reconciliation-enforcement.test.ts` | 11 | PASS |
| G4 | `server/market-data/tests/sprint-123a4.test.ts` | 70 | PASS |
| G4 | `server/market-data/tests/sprint-123a4-frontend.test.ts` | 14 | PASS |
| G4 | `server/market-data/tests/sprint-123a4-security.test.ts` | 16 | PASS |
| G4 | `server/market-data/tests/chart-history-mysql.test.ts` | 21 | PASS |
| G4 | `server/market-data/tests/chart-stream-sse.test.ts` | 31 | PASS |
| G4 | `server/market-data/tests/health-state-machine.test.ts` | 28 | PASS |
| G4 | `server/market-data/tests/parity-service.test.ts` | 19 | PASS |
| **TOTAL** | | **447** | **447 / 447 PASS** |

**Verdict: Approved Gate regression: PASS.**

### 2.2 Python Databento Feed Suite

**Command:**
```
python3 -m pytest services/databento-feed/tests/ -v
```

**Result: 143 / 143 PASS** (3.94s)

**Verdict: PASS.**

### 2.3 TypeScript Compilation

**Command:**
```
pnpm tsc --noEmit
```

**Result: 0 errors, 0 warnings. Exit code 0.**

**Verdict: PASS.**

### 2.4 Frontend Production Build

**Command:**
```
pnpm build
```

**Result: PASS**

| Metric | Value |
|---|---|
| Build duration | 31.15 seconds |
| Bundle size | 870.6 kB (`dist/index.js`) |
| Exit code | 0 |
| Errors | 0 |
| Warnings | Chunk size advisory only (not a failure) |

**Verdict: PASS.**

---

## 3. Full Repository Test Suite — Non-Gate Failures

The full repository test suite (`pnpm vitest run` without file arguments) reports **696 tests, 38 failed** across 5 test files. Two of these files are outside the Gate G4 scope. They are documented here in full.

**Verdict: Full repository regression: NOT CLEAN, with two documented non-Gate failures.**

### 3.1 `server/sprint-123a2.test.ts` — 15 failures

**Nature:** This file is an **obsolete root-level duplicate** of the approved Gate G2 test file `server/market-data/tests/sprint-123a2.test.ts`. The two files test the same `DatabentoBridgeServer` class but the root-level file was not updated when `handleMessage` gained a second parameter.

**Exact failure cause:** `DatabentoBridgeServer.handleMessage` has the signature:
```typescript
private handleMessage(data: Buffer, connState: ConnectionState): void
```
The root-level test file defines:
```typescript
type HandleMessageFn = { handleMessage: (d: Buffer) => void };
```
and calls `handleMessage` with only one argument. When the second argument (`connState`) is `undefined`, any access to `connState.recordsReceived` or `connState.recordsRejected` throws `TypeError: Cannot read properties of undefined`.

**When the signature changed:** `handleMessage` gained the `connState` parameter at commit `39db508` (Gate G2 Revision 3 — hardened topology). The root-level test file was last modified at commit `b9f3386` (Sprint 123A.2 foundation) and has never been updated since.

**Failing tests (15):**

| Test ID | Test name |
|---|---|
| TEST-123A2-004 | Message validation — invalid JSON: Rejects invalid JSON without throwing |
| TEST-123A2-005 | Message validation — wrong protocol version: Rejects records with wrong protocol version |
| TEST-123A2-006 | Message validation — unknown schema: Rejects records with unknown schema |
| TEST-123A2-007 | Valid trade record accepted: Accepts valid trades record and emits to event bus |
| TEST-123A2-008 | Valid ohlcv-1m record accepted: Accepts valid ohlcv-1m record and emits to event bus |
| TEST-123A2-009 | ohlcv-1m record does not trigger processBar: Bridge server emits to databento:ohlcv-1m only |
| TEST-123A2-011 | Bridge server stats: recordsReceived increments on valid record |
| TEST-123A2-011 | Bridge server stats: lastRecordSchema is updated on valid record |
| TEST-123A2-015 | All valid schemas are accepted: Accepts schema: trades |
| TEST-123A2-015 | All valid schemas are accepted: Accepts schema: ohlcv-1m |
| TEST-123A2-015 | All valid schemas are accepted: Accepts schema: definition |
| TEST-123A2-015 | All valid schemas are accepted: Accepts schema: symbol-mapping |
| TEST-123A2-015 | All valid schemas are accepted: Accepts schema: feed-health |
| TEST-123A2-016 | Multiple records increment counter correctly: recordsReceived increments for each valid record |
| TEST-123A2-017 | Mixed valid and invalid records: Counts valid and rejected records independently |

**Recommendation:** This file should be **archived or removed** in a future sprint. The canonical Gate G2 test coverage is provided by `server/market-data/tests/sprint-123a2.test.ts` (31 tests, all passing). The root-level file adds no unique coverage. It must not be modified as part of this evidence-only step.

**Gate G4 impact:** None. This file is not part of the approved 447-test Gate G1–G4 suite.

### 3.2 `server/massive-api.test.ts` — 1 failure

**Nature:** This is an **optional credential-dependent integration test** that requires a `MASSIVE_API_KEY` environment variable to be set. It is not part of the Atlas Nexus core trading system and is not referenced in any Gate G1–G4 requirement.

**Exact failure cause:**
```
AssertionError: MASSIVE_API_KEY must be set: expected undefined to be truthy
```

The test unconditionally asserts that `MASSIVE_API_KEY` is present. It does not use `vi.skipIf` or any conditional skip mechanism.

**Expected CI policy:** This test should be skipped in CI environments where `MASSIVE_API_KEY` is not available, using `vi.skipIf(!process.env.MASSIVE_API_KEY, ...)` or by moving it to a separate integration test suite that is only run when the credential is explicitly provided. It must not be modified as part of this evidence-only step.

**Gate G4 impact:** None. This file is not part of the approved 447-test Gate G1–G4 suite.

### 3.3 Other failing test files

The remaining 3 failing test files (`server/ard.test.ts`, `server/nexusRoutes.test.ts`, `server/sb1.test.ts`) fail when `DATABASE_URL` points to a database that does not have the full application schema (i.e., when `atlas_test_123a3` is used instead of a fully-migrated database). These failures are resolved when `DATABASE_URL` points to `atlas_staging_g4` (all 28 migrations applied). They are not relevant to Gate G4.

---

## 4. Environment Preflight — Credential Quality Assessment

The preflight was run in the Manus sandbox, which does not hold real Databento or bridge credentials. The following table records the accurate credential quality assessment.

| Check | Status | Notes |
|---|---|---|
| `DATABENTO_API_KEY` SECRET_VARIABLE_PRESENT | false | Not set in sandbox |
| `DATABENTO_API_KEY` SECRET_VALUE_NON_PLACEHOLDER | N/A | Variable not set |
| `BRIDGE_AUTH_TOKEN` SECRET_VARIABLE_PRESENT | false | Not set in sandbox |
| `BRIDGE_AUTH_TOKEN` SECRET_VALUE_NON_PLACEHOLDER | N/A | Variable not set |
| `DATABASE_URL` SECRET_VARIABLE_PRESENT | true | Staging DB socket URL |
| `DATABASE_URL` SECRET_VALUE_NON_PLACEHOLDER | true | Not a placeholder |
| DATABASE_CONNECTION_VERIFIED | true | MySQL socket connection succeeded |
| DATABENTO_AUTHENTICATION_VERIFIED | UNVERIFIED | No real API key in sandbox |
| BRIDGE_AUTHENTICATION_VERIFIED | UNVERIFIED | No real bridge token in sandbox |
| **LIVE_CREDENTIALS_READY** | **UNVERIFIED** | Real credentials must be loaded on the staging host |

The preflight script has been updated to distinguish all five credential quality levels. It will not report `LIVE_CREDENTIALS_READY=true` unless an authenticated Databento API request succeeds, the bridge completes an authenticated handshake, and the database connection is verified. Common placeholders are rejected at the `SECRET_VALUE_NON_PLACEHOLDER` check.

---

## 5. Authority Boundary Confirmations

| Boundary | Status |
|---|---|
| `MARKET_DATA_AUTHORITY` during all tests | `DATABENTO_SHADOW` |
| `ATLAS_GATE_G4_CHART_AUTHORITY_ENABLED` during all tests | `false` |
| `DATABENTO_CHART_AUTHORITY` activated | **No** |
| `processBar` owner | TradingView (unchanged) |
| `postBarAutomation` owner | TradingView (unchanged) |
| Production migrations run | **No** |
| Sprint 123A.5 begun | **No** |

---

## 6. Pending Live Validations

The following validations require a live Databento connection on the staging host and cannot be completed in the Manus sandbox. All are **OPERATIONAL VALIDATION PENDING**.

| Validation | Minimum requirement |
|---|---|
| Authenticated Databento API connection | HTTP 200 from `metadata.list_datasets` |
| Authenticated bridge handshake | HTTP 200 from `/api/market-data/bridge/health` |
| Live shadow session duration | One full RTH session or >= 500 eligible 1m comparisons |
| Latency metrics | p50, p90, p95, p99, p99.9, max for all 8 pipeline stages |
| Continuity metrics | >= 99% bar continuity rate, 0 unresolved gaps at session end |
| Playwright browser tests | CB-001 to CB-020 all pass, 0 skipped blocking tests |
| SSE reconnect proof | All 12 reconnect properties proven (see Section 7 of template) |
| Parity threshold | >= 500 comparisons, mismatch rate <= 2%, DB_ONLY <= 5%, TV_ONLY <= 1% |
| Chart-authority readiness | All 7 gates pass |
| Final evidence secret scan | 0 credential exposures in evidence directory |

---

## 7. Next Action

The operator must follow `docs/runbooks/SPRINT_123A4_GATE_G4_LIVE_VALIDATION_HANDOFF.md` to complete the live staging session. Upon completion, the operator must fill in `docs/reports/SPRINT_123A4_GATE_G4_LIVE_VALIDATION_RESULTS_TEMPLATE.md` and commit the completed evidence report.

Gate G4 approval requires written approval from Phil. Sprint 123A.5 must not begin until Gate G4 is approved.

---

*This document contains no credentials. No results have been fabricated. No pending sections have been pre-filled as passing.*
