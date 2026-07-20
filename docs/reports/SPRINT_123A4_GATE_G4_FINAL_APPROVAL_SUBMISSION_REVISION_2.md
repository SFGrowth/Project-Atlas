# Sprint 123A.4 — Gate G4 Final Approval Submission (Revision 2)

**Date:** 2026-07-21  
**Branch:** `sprint/123a-2-databento-adapter`  
**Implementation commit:** `0f770762654c067998cf7e8adc984eb5a06e4b8b`  
**Evidence commit:** pending (this document)  
**Gate G3 baseline:** `f77993b1d37241ade7717e4af93c22cde753c1bb`  
**Gate G2 baseline:** `1b73c5d2e087b5a5228446df1bf8bd8298a69a4b`

---

## Requirement Checklist

| # | Requirement | Status |
|---|---|---|
| 1 | Gate G3 baseline diff — corrected | **COMPLETE** |
| 2 | Canonical env vars + 8 new invariant tests | **COMPLETE** |
| 3 | Databento staging session (live) | **AWAITING PHIL** |
| 4 | Latency and continuity metrics (live) | **AWAITING PHIL** |
| 5 | Playwright browser suite (live) | **AWAITING PHIL** |
| 6 | SSE Option B reconnect proof (live) | **AWAITING PHIL** |
| 7 | Chart-authority readiness test (live) | **AWAITING PHIL** |
| 8 | Parity results with classification mapping (live) | **AWAITING PHIL** |
| 9 | Complete regression + build + secret scan | **COMPLETE** |
| 10 | This document | **COMPLETE** |

---

## Section 1 — SHA Lock

| Role | Full 40-Character SHA |
|---|---|
| Gate G4 Revision 3 implementation | `0f770762654c067998cf7e8adc984eb5a06e4b8b` |
| Gate G4 Final Approval Submission (Rev 1) | `2d41a311fab82c29f40dab7897f7ce2c6a6419f5` |
| Gate G4 Revision 2 implementation | `937448dc46358ea5a9c9662bebaf1c4a4d37af6a` |
| Gate G4 Revision 1 implementation | `45ac6d6342f564cffd04b14a6300b4046a10a868` |
| **Gate G3 baseline** | `f77993b1d37241ade7717e4af93c22cde753c1bb` |
| **Gate G2 baseline** | `1b73c5d2e087b5a5228446df1bf8bd8298a69a4b` |

> **Note:** The implementation commit SHA above is the value at the time of writing. The final locked SHA will be updated when this document is committed.

---

## Section 2 — Gate G3 Baseline Diff (Corrected)

**Command run:** `git diff --stat f77993b1d37241ade7717e4af93c22cde753c1bb HEAD`

**Result:** 30 files changed, 8,656 insertions(+), 31 deletions(-)

### File Classification

| File | Status | Classification |
|---|---|---|
| `server/market-data/config.ts` | Modified | Config: env var rename (`DATABENTO_CHART_AUTHORITY_ENABLED` → `ATLAS_GATE_G4_CHART_AUTHORITY_ENABLED`), G4 feature flag, authority matrix functions |
| `server/sprint-123a1.test.ts` | Modified | Gate G3 state transition: TEST-123A1-006 updated to reflect `DATABENTO_SHADOW` now permitted (Gate G3 approved 2026-07-20) |
| `client/src/pages/Home.tsx` | Modified | `DatabentoLiveChart` mounted in dashboard |
| `server/market-data/runtime-orchestrator.ts` | Added | Market-data runtime orchestrator |
| `server/market-data/chart-stream-service.ts` | Added | SSE chart stream service with Option B query cursor |
| `server/market-data/chart-history-service.ts` | Added | Confirmed-only bar history query service |
| `server/market-data/parity-service.ts` | Added | TradingView/Databento parity with 6 terminal classifications |
| `server/market-data/market-data-router.ts` | Added | Express REST+SSE router |
| `server/market-data/health-state-machine.ts` | Added | 9-state health state machine with `isReadyForChartAuthority()` |
| `server/market-data/chart-state-reducer.ts` | Added | Pure chart state reducer (extracted from frontend for testing) |
| `client/src/components/DatabentoLiveChart.tsx` | Added | Frontend live chart with SSE Option B reconnect |
| `server/market-data/tests/sprint-123a4.test.ts` | Added | 70 Gate G4 tests |
| `server/market-data/tests/sprint-123a4-frontend.test.ts` | Added | 14 frontend reducer tests |
| `server/market-data/tests/sprint-123a4-security.test.ts` | Added | 16 security tests |
| `server/market-data/tests/chart-history-mysql.test.ts` | Added | 21 MySQL integration tests |
| `server/market-data/tests/chart-stream-sse.test.ts` | Added | 31 SSE integration tests |
| `server/market-data/tests/health-state-machine.test.ts` | Added | 28 health state machine tests |
| `server/market-data/tests/parity-service.test.ts` | Added | 19 parity service tests |
| `scripts/staging_session_protocol.sh` | Added | Live staging session runbook |
| `scripts/browser_tests/chart_behaviours.spec.ts` | Added | 20 Playwright browser tests |
| `scripts/chart_authority_activation_readiness.sh` | Added | 7-gate chart authority activation readiness script |

**No strategy, risk, ADE, execution, processBar, or postBarAutomation files were modified.**

### Correction from Revision 1

The previous submission incorrectly stated "zero diff on all three approved baseline files." The correct statement is:

- `server/sprint-123a1.test.ts` — **modified** (6 lines changed). This is the approved Gate G3 state transition: TEST-123A1-006 was updated to reflect that `DATABENTO_SHADOW` is now permitted following Gate G3 approval on 2026-07-20. This is not a regression — it is the correct update to reflect the approved gate state.
- `server/sprint-123a1-integration.test.ts` — **unchanged** (zero diff confirmed)
- `server/market-data/tests/sprint-123a2.test.ts` — **unchanged** (zero diff confirmed)

---

## Section 3 — Canonical Environment Variables

All aliases eliminated. Two canonical names used throughout the entire codebase:

| Variable | Purpose | Permitted values |
|---|---|---|
| `MARKET_DATA_AUTHORITY` | Authority mode selector | `TRADINGVIEW_ONLY` (default), `DATABENTO_SHADOW`, `DATABENTO_CHART_AUTHORITY`, `DATABENTO_LEARNING_AUTHORITY`, `DATABENTO_DECISION_AUTHORITY` |
| `ATLAS_GATE_G4_CHART_AUTHORITY_ENABLED` | G4 feature flag | `true` (any other value or absent = false) |

**Verification:** `grep -rn "DATABENTO_CHART_AUTHORITY_ENABLED\|SPRINT_123A_AUTHORITY_MODE" server/ scripts/ services/` returns **zero results**.

### Authority Matrix

| Mode | `isDatabentoConnected` | `isDatabentoShadow` | `isDatabentoChartAuthorityActive` | `getChartSource` | `isDatabentoProcessBarTrigger` | `isDatabentoDecisionAuthority` |
|---|---|---|---|---|---|---|
| `TRADINGVIEW_ONLY` | false | false | false | TRADINGVIEW | false | false |
| `DATABENTO_SHADOW` | true | true | false | TRADINGVIEW_PRIMARY_DATABENTO_SHADOW | false | false |
| `DATABENTO_CHART_AUTHORITY` + flag=true | true | false | **true** | DATABENTO | false | false |
| `DATABENTO_CHART_AUTHORITY` + flag=absent | true | false | **false** (fails closed) | DATABENTO | false | false |
| `DATABENTO_LEARNING_AUTHORITY` | true | false | false | DATABENTO | false | false |
| `DATABENTO_DECISION_AUTHORITY` | true | false | false | DATABENTO | false | **always false** |

**processBar and postBarAutomation are permanently owned by TradingView in Sprint 123A regardless of authority mode.**

---

## Section 4 — New Invariant Tests (TEST-123A4-063 to 070)

| ID | Description | Result |
|---|---|---|
| TEST-123A4-063 | Missing `ATLAS_GATE_G4_CHART_AUTHORITY_ENABLED` fails closed (returns false) | PASS |
| TEST-123A4-064 | `ATLAS_GATE_G4_CHART_AUTHORITY_ENABLED=false` fails closed | PASS |
| TEST-123A4-065 | Flag=true permits chart authority only — learning remains prohibited | PASS |
| TEST-123A4-066 | Malformed `MARKET_DATA_AUTHORITY` fails closed (throws) | PASS |
| TEST-123A4-067 | `DATABENTO_LEARNING_AUTHORITY` remains prohibited regardless of G4 flag — `assertSprint123A4Invariants` throws Gate G6A | PASS |
| TEST-123A4-068 | `DATABENTO_DECISION_AUTHORITY` remains prohibited regardless of G4 flag | PASS |
| TEST-123A4-069 | Databento processBar trigger remains false in `DATABENTO_CHART_AUTHORITY` mode | PASS |
| TEST-123A4-070 | Databento postBarAutomation trigger remains rejected in `DATABENTO_CHART_AUTHORITY` mode | PASS |

---

## Section 5 — Complete Gate Regression

**Command:** `pnpm vitest run <18 files>`  
**Date/time:** 2026-07-21

| File | Gate | Tests |
|---|---|---|
| `server/sprint-123a1.test.ts` | G1 | 35 |
| `server/sprint-123a1-integration.test.ts` | G1 | 7 |
| `server/market-data/tests/sprint-123a2.test.ts` | G2 | 31 |
| `server/market-data/tests/sprint-123a3.test.ts` | G3 | 62 |
| `server/market-data/tests/trade-bar-builder.test.ts` | G3 | 12 |
| `server/market-data/tests/gap-recovery-orchestrator.test.ts` | G3 | 9 |
| `server/market-data/tests/blocked-window.test.ts` | G3 | 5 |
| `server/market-data/tests/mysql-bar-persistence.test.ts` | G3 | 61 |
| `server/market-data/tests/contract-roll-integration.test.ts` | G3 | 7 |
| `server/market-data/tests/price-units.test.ts` | G3 | 8 |
| `server/market-data/tests/recovery-reconciliation-enforcement.test.ts` | G3 | 11 |
| `server/market-data/tests/sprint-123a4.test.ts` | G4 | **70** |
| `server/market-data/tests/sprint-123a4-frontend.test.ts` | G4 | 14 |
| `server/market-data/tests/sprint-123a4-security.test.ts` | G4 | 16 |
| `server/market-data/tests/chart-history-mysql.test.ts` | G4 | 21 |
| `server/market-data/tests/chart-stream-sse.test.ts` | G4 | 31 |
| `server/market-data/tests/health-state-machine.test.ts` | G4 | 28 |
| `server/market-data/tests/parity-service.test.ts` | G4 | 19 |
| **TOTAL** | | **447 / 447** |

**Python (databento-feed):** 143 / 143  
**TypeScript compilation:** clean (0 errors)  
**Frontend production build:** ✓ built in 22.80s

### Gate Subtotals

| Gate | Tests |
|---|---|
| G1 (sprint-123a1 + integration) | 42 |
| G2 (sprint-123a2) | 31 |
| G3 (sprint-123a3 + 7 support files) | 175 |
| G4 (sprint-123a4 + 6 new files) | **199** |
| **Total** | **447** |

---

## Section 6 — SSE Option B Reconnect Design

The SSE reconnect design uses **Option B: query cursor** (`?afterEventId=<cursor>`).

### Design

1. Client connects: `GET /api/market-data/stream?symbol=MNQ&interval=1m`
2. Server sends `id: <seq>` with each event
3. Client stores `lastEventId` from each received event
4. On disconnect: client reconnects with `GET /api/market-data/stream?symbol=MNQ&interval=1m&afterEventId=<lastEventId>`
5. Server reads `afterEventId` query param (or `Last-Event-ID` header) and replays ring buffer from that cursor
6. If cursor is expired (older than oldest buffered event): server sends `event: cursor-expired\ndata: {}\n\n` and client calls `loadHistory()` to resynchronise

### Ring Buffer

- Capacity: 500 events
- Confirmed bars only (developing bars are not buffered — they are ephemeral)
- Oldest buffered seq is tracked; cursor < oldest triggers `cursor-expired`

### Proven Scenarios (SSE-020 to SSE-031)

| ID | Scenario | Result |
|---|---|---|
| SSE-020 | Initial connection — no cursor | PASS |
| SSE-021 | Event ID is included in each SSE frame | PASS |
| SSE-022 | Reconnect with valid cursor replays missed events | PASS |
| SSE-023 | Reconnect with cursor=oldest replays nothing (no gap) | PASS |
| SSE-024 | Developing bars are not replayed on reconnect | PASS |
| SSE-025 | Expired cursor triggers cursor-expired event | PASS |
| SSE-026 | cursor-expired triggers history reload (no missing candles) | PASS |
| SSE-027 | No duplicate candles after reconnect | PASS |
| SSE-028 | No missing confirmed candles after reconnect within buffer | PASS |
| SSE-029 | Malformed cursor (non-numeric) is rejected | PASS |
| SSE-030 | Negative cursor is rejected | PASS |
| SSE-031 | Credentials never appear in stream URL or response body | PASS |

---

## Section 7 — Health State Machine: LIVE/READY Guard Conditions

### State Name Mapping

| Implementation state | Semantic meaning | "READY" in requirement |
|---|---|---|
| `LIVE` | Databento connected, bars flowing, parity within tolerance | **Yes — this is READY** |
| `DEGRADED` | Bars flowing but parity mismatch rate elevated | Not ready for chart authority |
| `STALE` | No bar received in last 5 minutes | Not ready |
| `OFFLINE` | Bridge disconnected | Not ready |
| `RECONNECTING` | Bridge reconnect in progress | Not ready |
| `GAP_RECOVERY` | Gap recovery in progress | Not ready |
| `CONTRACT_ROLL` | Contract roll in progress | Not ready |
| `INITIALISING` | System starting up | Not ready |
| `SHUTDOWN` | System shutting down | Not ready |

### `isReadyForChartAuthority()` Guard

Returns `true` only when state is `LIVE`. This is the gate condition for `DATABENTO_CHART_AUTHORITY` activation.

Proven by HSM-025 through HSM-028:

| ID | Scenario | Result |
|---|---|---|
| HSM-025 | `LIVE` state → `isReadyForChartAuthority()` returns true | PASS |
| HSM-026 | `DEGRADED` state → `isReadyForChartAuthority()` returns false | PASS |
| HSM-027 | `STALE` state → `isReadyForChartAuthority()` returns false | PASS |
| HSM-028 | `OFFLINE` state → `isReadyForChartAuthority()` returns false | PASS |

---

## Section 8 — Parity Service: 6 Terminal Classifications

| Classification | Condition | Action |
|---|---|---|
| `MATCHED` | Close delta ≤ tolerance (0.25 pts), volume within 5% | No action — normal operation |
| `CLOSE_MISMATCH` | Close delta > tolerance | Log warning; increment mismatch counter |
| `VOLUME_MISMATCH` | Volume delta > 5% | Log warning; increment mismatch counter |
| `OHLC_MISMATCH` | High or low delta > tolerance | Log warning; increment mismatch counter |
| `DB_ONLY` | Databento bar received, no TradingView bar registered | Log; may indicate TV webhook delay |
| `TV_ONLY` | TradingView bar registered, no Databento bar received | Log; may indicate Databento gap |

### Gate G4 Activation Thresholds

| Metric | Threshold | Meaning |
|---|---|---|
| Rolling mismatch rate (100 bars) | ≤ 2% | ≤ 2 mismatches in last 100 confirmed bars |
| Consecutive mismatches | ≤ 3 | No more than 3 consecutive mismatches |
| `DB_ONLY` rate | ≤ 5% | Databento receiving data TV is also receiving |
| `TV_ONLY` rate | ≤ 1% | Databento not missing bars TV receives |

---

## Section 9 — Live Staging Evidence (Awaiting Phil)

The following evidence items require a live Databento connection and a running Atlas Nexus server. This sandbox has no live Databento API key. Phil must run these scripts on the production server and attach the output.

### 9.1 Staging Session Protocol

**Script:** `bash scripts/staging_session_protocol.sh`  
**Prerequisites:** Atlas Nexus server running with `MARKET_DATA_AUTHORITY=DATABENTO_SHADOW`  
**Expected output:** 35 metrics including:
- Bars received per minute
- Reconciliation rate
- Parity classification breakdown
- Gap recovery events
- Bridge reconnect events
- `atlas_bars_1m` row count delta

**Required result for Gate G4 approval:** ≥ 30 minutes of shadow data with ≥ 95% reconciliation rate and ≤ 2% parity mismatch rate.

### 9.2 Browser Test Suite

**Script:** `npx playwright test scripts/browser_tests/chart_behaviours.spec.ts`  
**Prerequisites:** Atlas Nexus server running, browser pointed at dashboard  
**Tests:** CB-001 through CB-020 (20 chart behaviour tests)  
**Required result:** 20/20 PASS

### 9.3 SSE Option B Reconnect Proof (Live)

**Procedure:**
1. Open dashboard, observe chart loading history
2. Note `lastEventId` in browser DevTools → Network → EventStream
3. Kill and restart the browser tab
4. Confirm reconnect URL contains `?afterEventId=<cursor>`
5. Confirm no duplicate candles, no missing candles

### 9.4 Chart Authority Activation Readiness

**Script:** `bash scripts/chart_authority_activation_readiness.sh`  
**Required result:** All 7 gates PASS

### 9.5 Parity Results

**Command:** `curl -s http://localhost:3000/api/market-data/parity | jq .`  
**Required result:** `mismatchRate` ≤ 0.02 over ≥ 100 bars

---

## Section 10 — Production Deployment Note

**Gate G4 is NOT yet approved. `DATABENTO_CHART_AUTHORITY` is NOT yet activated.**

When Gate G4 is approved by Phil in writing, the activation procedure is:

1. Run `bash scripts/chart_authority_activation_readiness.sh` — must return ALL PASS
2. Set `MARKET_DATA_AUTHORITY=DATABENTO_CHART_AUTHORITY` in the production `.env`
3. Set `ATLAS_GATE_G4_CHART_AUTHORITY_ENABLED=true` in the production `.env`
4. Restart the Atlas Nexus server
5. Verify the dashboard shows the "DATABENTO CHART AUTHORITY" status indicator
6. Monitor parity metrics for 30 minutes before considering the activation stable

**Sprint 123A.5 will not begin until Phil explicitly approves Gate G4 in writing.**

---

*Document prepared by Atlas Nexus autonomous research engine. Gate G4 approval authority: Phil (human).*
