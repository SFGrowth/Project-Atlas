# Sprint 123A.4 — Gate G4 Final Approval Submission

**Date:** 2026-07-21  
**Branch:** `sprint/123a-2-databento-adapter`  
**Final implementation commit:** `937448d`  
**Evidence document commit:** (this document, committed below)  
**Gate G3 approval:** Received from Phil — confirmed in `pasted_content_13.txt`  
**Gate G4 approval status:** **PENDING — awaiting Phil's explicit written approval**

---

## Gate G4 Scope

Sprint 123A.4 delivers the live chart integration layer for the Databento feed. It does **not** activate `DATABENTO_CHART_AUTHORITY`. That authority mode remains prohibited until Gate G4 is explicitly approved.

---

## Section 1 — Baseline Diff Evidence (Corrected)

### Exact `git diff --stat` from Gate G2 SHA `1b73c5d2e087b5a5228446df1bf8bd8298a69a4b`

```
server/sprint-123a1.test.ts                     | 6 ++++--   (MODIFIED — Gate G3 state transition)
server/sprint-123a1-integration.test.ts         | 0           (UNCHANGED)
server/market-data/tests/sprint-123a2.test.ts   | 0           (UNCHANGED)
```

### Classification

| File | Status | Reason |
|---|---|---|
| `server/sprint-123a1.test.ts` | **Modified** (4 ins, 2 del) | TEST-123A1-006 updated to reflect Gate G3 approval: `DATABENTO_SHADOW` no longer throws in `assertSprint123A1Invariants()`. This is a **gate-state transition update**, not a weakening. The test now asserts the correct approved behaviour. |
| `server/sprint-123a1-integration.test.ts` | **Unchanged** | Zero diff from Gate G2 SHA |
| `server/market-data/tests/sprint-123a2.test.ts` | **Unchanged** | Zero diff from Gate G2 SHA |

**Correction from Revision 2:** The previous submission incorrectly stated "zero diff on all three files." `sprint-123a1.test.ts` has a 6-line modification. This is documented and justified above.

---

## Section 2 — SSE Reconnect Design: Option B (Query Cursor)

### Design

The `DatabentoLiveChart` frontend component implements **Option B** — reconnect with `?afterEventId=<cursor>` in the URL, not relying on the browser's native `Last-Event-ID` header injection.

**Reconnect flow:**
1. On connection loss, the component reads `lastEventIdRef.current` (the last received event ID).
2. On reconnect, it constructs: `/api/market-data/stream?symbol=MNQM5&interval=1m&afterEventId=<cursor>`
3. The server reads `afterEventId` from the query parameter (fallback from `Last-Event-ID` header).
4. If the cursor is within the ring buffer, events after the cursor are replayed.
5. If the cursor is expired (older than the oldest buffered event), the server sends a `cursor-expired` event.
6. On `cursor-expired`, the client calls `loadHistory()` to reload from the REST endpoint and re-seeds the chart.

**Server-side change:** `market-data-router.ts` `/stream` endpoint reads:
```typescript
const afterEventId = req.query.afterEventId ?? req.headers['last-event-id'];
```

### 12 Option B Reconnect Scenario Tests (SSE-020 through SSE-031)

All 31 SSE tests pass: 19 original + 12 new Option B scenarios.

| Test ID | Scenario | Result |
|---|---|---|
| SSE-020 | Initial connection (no cursor) — full ring buffer replay | PASS |
| SSE-021 | Cursor within ring buffer — partial replay from cursor | PASS |
| SSE-022 | Cursor at oldest buffered event — no replay | PASS |
| SSE-023 | Cursor expired — `cursor-expired` event sent | PASS |
| SSE-024 | Reconnect after developing bar — confirmed bar replayed, developing not | PASS |
| SSE-025 | `afterEventId` query param takes precedence over header | PASS |
| SSE-026 | Malformed cursor (non-numeric) — treated as no cursor | PASS |
| SSE-027 | Cursor = -1 (impossible) — treated as expired | PASS |
| SSE-028 | Ring buffer full (100 events) — oldest evicted, cursor-expired for old clients | PASS |
| SSE-029 | Reconnect after gap — only confirmed bars in replay | PASS |
| SSE-030 | No duplicate candles on reconnect within buffer range | PASS |
| SSE-031 | Graceful shutdown — all clients receive `shutdown` event | PASS |

---

## Section 3 — Health State Name Reconciliation

### Canonical Name Mapping

The Gate G4 requirement uses the term "READY". The implementation uses `HealthState.LIVE`. The mapping is:

| Gate G4 Term | Implementation | Meaning |
|---|---|---|
| `READY` | `HealthState.LIVE` | Databento feed is receiving bars, reconciliation is active, no gaps |
| `DEGRADED` | `HealthState.DEGRADED` | Feed is active but parity mismatch rate is elevated |
| `OFFLINE` | `HealthState.OFFLINE` | Feed has been silent for > offline threshold |
| `STALE` | `HealthState.STALE` | Feed was live but no bar received for > stale threshold |
| `RECONNECTING` | `HealthState.RECONNECTING` | Bridge WebSocket is reconnecting |
| `GAP_RECOVERY` | `HealthState.GAP_RECOVERY` | Gap recovery orchestrator is active |
| `CONTRACT_ROLL` | `HealthState.CONTRACT_ROLL` | Contract roll detected and in progress |
| `INITIALISING` | `HealthState.INITIALISING` | Orchestrator started, waiting for first bar |
| `SHUTDOWN` | `HealthState.SHUTDOWN` | Orchestrator has been stopped |

### LIVE/READY Guard Conditions (HSM-025 through HSM-028)

`isReadyForChartAuthority()` returns `true` only when state is `LIVE`. All other states return `false`.

| Test ID | State | `isReadyForChartAuthority()` | Result |
|---|---|---|---|
| HSM-025 | `LIVE` | `true` | PASS |
| HSM-026 | `DEGRADED` | `false` | PASS |
| HSM-027 | `STALE` | `false` | PASS |
| HSM-028 | `OFFLINE` | `false` | PASS |

---

## Section 4 — Frontend Production Build

### DatabentoLiveChart mounted in Home.tsx

```tsx
// client/src/pages/Home.tsx — Row 4: Live Candlestick Chart
<DatabentoLiveChart symbol="MNQM5" />
<LiveChart />
```

`DatabentoLiveChart` is rendered above `LiveChart`. In `TRADINGVIEW_ONLY` mode, the Databento chart shows an "offline" state and the TradingView chart is the primary display. In `DATABENTO_SHADOW` and `DATABENTO_CHART_AUTHORITY` modes, both charts are visible for comparison.

### Build Evidence

```
✓ built in 22.80s
dist/index.js  870.6kb
⚡ Done in 60ms
```

TypeScript compilation: **clean** (0 errors, 0 warnings)

---

## Section 5 — Staging Session Protocol

A runnable staging session protocol script is committed at:
`scripts/staging_session_protocol.sh`

**This script must be run by Phil on the live server** after enabling `DATABENTO_SHADOW` mode. It collects:
- S1: Authority mode verification
- S2: G4 feature flag state
- S3: Last 10 bars in `atlas_bars_1m` (DATABENTO source)
- S4: Parity check — last 20 bars where both sources exist
- S5: Gap recovery ledger — last 10 entries
- S6: Bar count summary by source and reconciliation status
- S7: Health endpoint response

**Sandbox limitation:** The sandbox has no live Databento connection. Staging session results cannot be fabricated. The script is the evidence — Phil runs it and attaches the output to this document.

---

## Section 6 — Browser Tests: 20 Chart Behaviour Proofs

A Playwright test suite is committed at:
`scripts/browser_tests/chart_behaviours.spec.ts`

**This suite must be run by Phil against the live server.** It proves:

| Test ID | Behaviour |
|---|---|
| CB-001 | Chart container renders on dashboard |
| CB-002 | History loads and candles are visible |
| CB-003 | Status indicator shows SHADOW mode |
| CB-004 | 1m/5m interval toggle renders |
| CB-005 | 1m is selected by default |
| CB-006 | Clicking 5m loads 5m bars |
| CB-007 | SSE connection established (LIVE status) |
| CB-008 | No error state on initial load |
| CB-009 | Chart title displays symbol name |
| CB-010 | VWAP overlay renders |
| CB-011 | EMA-9 overlay renders |
| CB-012 | EMA-21 overlay renders |
| CB-013 | Reconnect button appears when SSE offline |
| CB-014 | `/api/market-data/bars` returns 401 without auth |
| CB-015 | `/api/market-data/stream` returns 401 without auth |
| CB-016 | `/api/market-data/health` returns JSON with state field |
| CB-017 | `/api/market-data/bars` returns array of bar objects |
| CB-018 | Bars API rejects range > 7 days with 400 |
| CB-019 | `/api/market-data/parity` returns parity metrics |
| CB-020 | Chart-authority badge absent in SHADOW mode |

**Run command:**
```bash
ATLAS_BASE_URL=https://your-server.com \
ATLAS_SESSION_COOKIE=<your-session-cookie> \
npx playwright test scripts/browser_tests/chart_behaviours.spec.ts
```

---

## Section 7 — Chart Authority Activation Readiness

A runnable activation readiness script is committed at:
`scripts/chart_authority_activation_readiness.sh`

**This script must be run by Phil** after a successful staging session. It checks 7 gates:

| Gate | Check | Threshold |
|---|---|---|
| G1 | Current authority mode is `DATABENTO_SHADOW` | Required |
| G2 | G4 feature flag not yet set | Informational |
| G3 | Minimum MATCHED bar count | ≥ 100 bars |
| G4 | Close parity mismatch rate | < 2% |
| G5 | No unresolved bars in last 24h | 0 unresolved |
| G6 | Health state is `LIVE` | Required |
| G7 | Staging duration | ≥ 1 full trading session (6.5h) |

**Activation procedure** (only after PASS verdict):
1. Set `SPRINT_123A_AUTHORITY_MODE=DATABENTO_CHART_AUTHORITY`
2. Set `ATLAS_GATE_G4_CHART_AUTHORITY_ENABLED=true`
3. Restart the Atlas Nexus server
4. Verify health state transitions to `LIVE`

---

## Section 8 — Complete Regression Results

### Per-file test counts

| Gate | File | Tests |
|---|---|---|
| G1 | `server/sprint-123a1.test.ts` | 35 |
| G1 | `server/sprint-123a1-integration.test.ts` | 7 |
| G2 | `server/market-data/tests/sprint-123a2.test.ts` | 31 |
| G3 | `server/market-data/tests/sprint-123a3.test.ts` | 62 |
| G3 | `server/market-data/tests/trade-bar-builder.test.ts` | 12 |
| G3 | `server/market-data/tests/gap-recovery-orchestrator.test.ts` | 9 |
| G3 | `server/market-data/tests/blocked-window.test.ts` | 5 |
| G3 | `server/market-data/tests/mysql-bar-persistence.test.ts` | 61 |
| G3 | `server/market-data/tests/contract-roll-integration.test.ts` | 7 |
| G3 | `server/market-data/tests/price-units.test.ts` | 8 |
| G3 | `server/market-data/tests/recovery-reconciliation-enforcement.test.ts` | 11 |
| G4 | `server/market-data/tests/sprint-123a4.test.ts` | 62 |
| G4 | `server/market-data/tests/sprint-123a4-frontend.test.ts` | 14 |
| G4 | `server/market-data/tests/sprint-123a4-security.test.ts` | 16 |
| G4 | `server/market-data/tests/chart-history-mysql.test.ts` | 21 |
| G4 | `server/market-data/tests/chart-stream-sse.test.ts` | 31 |
| G4 | `server/market-data/tests/parity-service.test.ts` | 19 |
| G4 | `server/market-data/tests/health-state-machine.test.ts` | 28 |
| **TOTAL** | **18 files** | **439 / 439** |

### Other checks

| Check | Result |
|---|---|
| Python (databento-feed) | **143 / 143** |
| TypeScript compilation | **clean** (0 errors) |
| Frontend production build | **✓ built in 22.80s** |

---

## Section 9 — Authority Boundary

`DATABENTO_CHART_AUTHORITY` is currently **prohibited** by `assertSprint123A4Invariants()`.

```typescript
// server/market-data/config.ts
export function assertSprint123A4Invariants(mode: Sprint123AAuthorityMode): void {
  if (mode === 'DATABENTO_CHART_AUTHORITY' && !isGate4FeatureFlagEnabled()) {
    throw new Error(
      'DATABENTO_CHART_AUTHORITY requires Gate G4 approval. ' +
      'Set ATLAS_GATE_G4_CHART_AUTHORITY_ENABLED=true after receiving written Gate G4 approval.'
    );
  }
  if (mode === 'DATABENTO_LEARNING_AUTHORITY' || mode === 'DATABENTO_DECISION_AUTHORITY') {
    throw new Error(`${mode} is not permitted in Sprint 123A.4. Future sprint required.`);
  }
}
```

`DATABENTO_LEARNING_AUTHORITY` and `DATABENTO_DECISION_AUTHORITY` remain permanently prohibited.

---

## Section 10 — Files Changed in Sprint 123A.4

### New production files

| File | Purpose |
|---|---|
| `server/market-data/runtime-orchestrator.ts` | Wires bridge → pipeline; enabled in SHADOW and CHART_AUTHORITY modes |
| `server/market-data/chart-history-service.ts` | Confirmed-only bar query with 7-day range limit and 10k cap |
| `server/market-data/chart-stream-service.ts` | SSE publisher with ring buffer, Option B cursor, heartbeat, graceful shutdown |
| `server/market-data/parity-service.ts` | 6-class parity comparison with Gate G4 thresholds |
| `server/market-data/health-state-machine.ts` | 9-state health machine with `isReadyForChartAuthority()` |
| `server/market-data/market-data-router.ts` | REST+SSE: `/bars`, `/stream`, `/health`, `/parity` |
| `server/market-data/chart-state-reducer.ts` | Pure chart state reducer (extracted for server-side testing) |
| `client/src/components/DatabentoLiveChart.tsx` | Frontend live chart with history, SSE, 1m/5m, status indicators |

### New test files

| File | Tests |
|---|---|
| `server/market-data/tests/sprint-123a4.test.ts` | 62 |
| `server/market-data/tests/sprint-123a4-frontend.test.ts` | 14 |
| `server/market-data/tests/sprint-123a4-security.test.ts` | 16 |
| `server/market-data/tests/chart-history-mysql.test.ts` | 21 |
| `server/market-data/tests/chart-stream-sse.test.ts` | 31 |
| `server/market-data/tests/parity-service.test.ts` | 19 |
| `server/market-data/tests/health-state-machine.test.ts` | 28 |

### New operational scripts

| File | Purpose |
|---|---|
| `scripts/staging_session_protocol.sh` | Live staging session data collection |
| `scripts/chart_authority_activation_readiness.sh` | 7-gate activation readiness check |
| `scripts/browser_tests/chart_behaviours.spec.ts` | 20 Playwright browser behaviour tests |

### Modified files

| File | Change |
|---|---|
| `server/market-data/config.ts` | G4 feature flag, `assertSprint123A4Invariants()`, `isDatabentoChartAuthorityActive()`, `getChartSource()` |
| `server/sprint-123a1.test.ts` | TEST-123A1-006 updated for Gate G3 approval state transition |
| `client/src/pages/Home.tsx` | `DatabentoLiveChart` mounted in Row 4 |

---

## Section 11 — SHA Lock

| Role | SHA |
|---|---|
| Final implementation | `937448d` (full: see `git log`) |
| Gate G3 baseline | `1b73c5d2e087b5a5228446df1bf8bd8298a69a4b` |
| Gate G2 baseline | `1b73c5d2e087b5a5228446df1bf8bd8298a69a4b` |

---

## Gate G4 Approval Request

**Gate G4 approval is requested.**

**Sprint 123A.5 will not begin until Phil explicitly approves Gate G4 in writing.**

**`DATABENTO_CHART_AUTHORITY` will not be activated until:**
1. Phil approves Gate G4 in writing
2. Phil runs `scripts/staging_session_protocol.sh` on the live server and reviews the output
3. Phil runs `scripts/chart_authority_activation_readiness.sh` and receives a PASS verdict
4. Phil explicitly sets `ATLAS_GATE_G4_CHART_AUTHORITY_ENABLED=true` in the server environment
