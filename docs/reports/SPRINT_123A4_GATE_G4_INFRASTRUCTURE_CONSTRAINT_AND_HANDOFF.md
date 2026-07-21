# Sprint 123A.4 — Gate G4 Infrastructure Constraint and Operator Handoff

**Document version:** 1.0  
**Date:** 2026-07-21  
**Branch:** `sprint/123a-2-databento-adapter`  
**Prepared by:** Atlas Nexus automated session

---

> **GATE G4: OPERATIONAL VALIDATION BLOCKED BY EXTERNAL INFRASTRUCTURE**
>
> Sprint 123A.4 implementation and automated validation are accepted for continued operational validation. Gate G4 is not approved. Gate G4 remains blocked until a real GLBX.MDP3 live staging session is completed on infrastructure with the required Databento entitlement and network access. Sprint 123A.5 is not authorised. DATABENTO_CHART_AUTHORITY remains inactive. TradingView remains the sole processBar and postBarAutomation authority.

---

## 1. Reference SHAs

| Artefact | SHA |
|---|---|
| Gate G4 implementation (Gate G4 Revision 3) | `0f770762654c067998cf7e8adc984eb5a06e4b8b` |
| Staging tooling and interim evidence | `f86d82495b3004c90b359a22c010d3821ceb18c8` |
| Approved Gate G3 baseline | `f77993b1d37241ade7717e4af93c22cde753c1bb` |
| Branch | `sprint/123a-2-databento-adapter` |

---

## 2. Validation Status Summary

| Validation | Status |
|---|---|
| **AUTOMATED VALIDATION** | |
| Gate G1–G4 targeted Vitest suite (447 tests, 18 files) | **PASS — 447/447** |
| Python Databento feed suite (143 tests) | **PASS — 143/143** |
| TypeScript compilation | **PASS — 0 errors** |
| Frontend production build | **PASS — 31.15s, 870.6 kB** |
| Database connection verification | **PASS** |
| Databento REST API authentication | **PASS — HTTP 200** |
| Dataset discovery | **PASS — 29 datasets returned** |
| Source-file secret scan | **PASS — 0 credential exposures** |
| Production chart authority activation | **CONFIRMED INACTIVE** |
| Production migrations | **CONFIRMED NOT RUN** |
| Sprint 123A.5 | **CONFIRMED NOT BEGUN** |
| **LIVE OPERATIONAL VALIDATION** | |
| Live GLBX.MDP3 streaming entitlement | **BLOCKED — subscription required** |
| live.databento.com DNS resolution | **BLOCKED — not resolvable in sandbox** |
| Live Databento shadow session | **NOT EXECUTED** |
| Latency and continuity metrics | **NOT EXECUTED** |
| Parity threshold evaluation | **NOT EXECUTED** |
| Playwright browser tests (CB-001 to CB-020) | **NOT EXECUTED** |
| Live SSE reconnect proof | **NOT EXECUTED** |
| Chart-authority readiness check (7 gates) | **NOT EXECUTED** |
| Staging-only chart-authority failover test | **NOT EXECUTED** |
| Final evidence-directory secret scan | **NOT EXECUTED** |
| **Gate G4 approval** | **WITHHELD — live validation not executed** |

---

## 3. Automated Validation Results (Confirmed)

### 3.1 Gate G1–G4 Targeted Vitest Suite

**Result: 447 / 447 PASS**

All 18 Gate G1–G4 test files passed. The suite was run against the `atlas_staging_g4` database (MySQL 8, all 28 migrations applied) with `MARKET_DATA_AUTHORITY=DATABENTO_SHADOW` and `ATLAS_GATE_G4_CHART_AUTHORITY_ENABLED=false`.

**Verdict: Approved Gate regression: PASS — 447/447.**

### 3.2 Python Databento Feed Suite

**Result: 143 / 143 PASS** (3.94 s).

### 3.3 TypeScript Compilation

**Result: 0 errors, 0 warnings. Exit code 0.**

### 3.4 Frontend Production Build

| Metric | Value |
|---|---|
| Build duration | 31.15 seconds |
| Bundle size | 870.6 kB (`dist/index.js`) |
| Exit code | 0 |
| Errors | 0 |

### 3.5 Databento REST API Authentication

The Databento historical API (`hist.databento.com`) was reached and authenticated successfully using HTTP Basic authentication (key as username, empty password). The response returned HTTP 200 and listed 29 available datasets.

**Result: PASS — REST authentication verified.**

### 3.6 Source-File Secret Scan

A grep scan was run across all tracked source files (`server/`, `client/`, `shared/`, `services/`, `scripts/`, `docs/`) for the Databento API key provided during this session.

**Result: 0 occurrences found. PASS.**

The API key does not appear in any committed source file, script, Markdown document, or JSON configuration file.

### 3.7 Full Repository Test Suite

The full repository suite (`pnpm vitest run`) reports 4 failing files and 27 failed tests. These are all pre-existing, non-Gate failures documented in full in `docs/reports/SPRINT_123A4_GATE_G4_AUTOMATED_VALIDATION_RESULTS.md` (Revision 2). No failure is a Sprint 123A.4 regression.

**Verdict: Full repository regression: NOT CLEAN — 4 failing files, 27 failures. Complete accounting in the Revision 2 interim report. No Gate G4 blocker identified.**

---

## 4. Live Entitlement Failure — GLBX.MDP3

### 4.1 What Succeeded

Databento REST API authentication succeeded. The account returned HTTP 200 from `https://hist.databento.com/v0/metadata.list_datasets` and listed 29 datasets, confirming the API key is valid and the account is active.

### 4.2 What Failed

A symbol resolution request for the MNQ continuous front-month contract (`MNQ.c.0`) against the GLBX.MDP3 dataset for the current trading date returned HTTP 422 with the following sanitised response:

```json
{
  "case": "dataset_unavailable_range",
  "message": "Part or all of your request for dataset 'GLBX.MDP3' requires a subscription and/or license to access.",
  "status_code": 422,
  "docs": "https://databento.com/pricing#cme",
  "payload": {
    "dataset": "GLBX.MDP3",
    "available_end": "2026-07-20T17:43:14.545811000Z"
  }
}
```

Historical GLBX.MDP3 data is available only up to the `available_end` timestamp. Access to data beyond that point — which includes the current trading session — requires an active live subscription and applicable CME exchange licensing.

### 4.3 What This Means

This failure occurred before any Atlas live-feed validation could begin. The Atlas runtime pipeline was not tested. This result does not prove or disprove the correctness of the Atlas implementation. It is an account entitlement issue, not an Atlas code failure.

### 4.4 Entitlement Required

To complete the live shadow session, the Databento account must hold:

| Entitlement | Purpose |
|---|---|
| Live CME Globex / GLBX.MDP3 access | Real-time MNQ futures data |
| CME exchange licence (applicable tier) | Required by CME for live data distribution |
| `trades` schema permission | Individual trade records for developing bar construction |
| `ohlcv-1m` schema permission | Official one-minute OHLCV records for bar confirmation |
| `definition` schema permission | Contract definition records for symbol resolution |
| `symbol-mapping` schema permission | Continuous contract roll mapping |

Historical access is not equivalent to live entitlement. The account must have an active live subscription at the time the shadow session runs.

---

## 5. Network Failure — live.databento.com

### 5.1 Diagnostic Commands and Results

The following diagnostics were run in the Manus sandbox. All credentials have been removed from the output.

**DNS resolution:**
```
python3 -c "import socket; print(socket.gethostbyname('live.databento.com'))"
# Result: socket.gaierror: [Errno -2] Name or service not known

python3 -c "import socket; print(socket.gethostbyname('hist.databento.com'))"
# Result: 209.127.152.24  (resolved successfully)
```

**TCP connectivity:**
```
# hist.databento.com:443 — REACHABLE (HTTP 401 without credentials)
curl -s -o /dev/null -w "HTTP %{http_code}" --max-time 10 https://hist.databento.com/v0/metadata.list_datasets
# Result: HTTP 401

# live.databento.com:443 — UNREACHABLE (DNS failure)
curl --max-time 10 https://live.databento.com/
# Result: curl: (6) Could not resolve host: live.databento.com
```

### 5.2 Interpretation

`hist.databento.com` (the historical REST API) resolves and is reachable from the sandbox. `live.databento.com` (the live streaming WebSocket gateway) does not resolve. This is an environmental DNS restriction in the Manus sandbox — the live streaming gateway is not accessible from this environment.

The Atlas bridge server connects to `live.databento.com` over a persistent WebSocket (TLS). Without DNS resolution of this host, the bridge cannot establish an upstream session, and no live bar data can flow into the Atlas pipeline.

### 5.3 Why the Sandbox Cannot Execute the Live Shadow Session

The combination of two independent constraints makes the live shadow session impossible in this environment:

1. The Databento account does not have live GLBX.MDP3 streaming entitlement.
2. The sandbox cannot resolve or reach `live.databento.com`.

Either constraint alone would be sufficient to block the live session. Both are present simultaneously.

---

## 6. Pending Gate G4 Validations

The following validations have not been executed and remain pending. No item in this list may be pre-filled as passing.

| Validation | Status |
|---|---|
| Live Databento shadow session | PENDING |
| At least 500 eligible one-minute comparisons | PENDING |
| One full regular trading session (where practical) | PENDING |
| Live trade count | PENDING |
| Live ohlcv-1m record count | PENDING |
| Definition records received | PENDING |
| Symbol-mapping records received | PENDING |
| Developing bars constructed | PENDING |
| Provisional bars constructed | PENDING |
| Confirmed one-minute bars | PENDING |
| Confirmed five-minute bars | PENDING |
| Live persistence (1m rows, 5m rows) | PENDING |
| Latency percentiles (p50, p90, p95, p99, p99.9, max — all 8 pipeline stages) | PENDING |
| Bar continuity percentage (required: >= 99%) | PENDING |
| Unresolved gap count at session end (required: 0) | PENDING |
| Live parity metrics (mismatch rate, DB_ONLY rate, TV_ONLY rate) | PENDING |
| Playwright browser tests CB-001 to CB-020 | PENDING |
| Live SSE reconnect proof (all 14 steps) | PENDING |
| Cursor-expiry resynchronisation proof | PENDING |
| Chart-authority readiness check (all 7 gates) | PENDING |
| Staging-only chart-authority failover test | PENDING |
| Final evidence-directory secret scan after live execution | PENDING |

---

## 7. Required External Environment

The live validation must continue on an operator-controlled staging host that satisfies all of the following conditions. The Manus sandbox satisfies none of the live-specific conditions.

| Requirement | Status in sandbox |
|---|---|
| Staging-tooling commit checked out (`f86d82495b3004c90b359a22c010d3821ceb18c8`) | Satisfiable |
| Node.js and Python dependencies installed | Satisfiable |
| MySQL 8 staging database with all 28 migrations applied | Satisfiable |
| Real `DATABENTO_API_KEY` with live GLBX.MDP3 entitlement | **NOT AVAILABLE** |
| Real `BRIDGE_AUTH_TOKEN` | **NOT AVAILABLE** |
| Live CME Globex / GLBX.MDP3 subscription | **NOT AVAILABLE** |
| DNS resolution of `live.databento.com` | **BLOCKED** |
| Outbound TLS/WebSocket access to `live.databento.com` | **BLOCKED** |
| Atlas server running and accessible | Not running |
| Python Databento adapter running | Not running |
| Private bridge running and connected | Not running |
| Authenticated dashboard available for Playwright | Not available |
| Playwright installed | Satisfiable |

The preflight script (`scripts/run_gate_g4_staging_validation.sh --preflight-only`) is not complete until all of the following are confirmed:

- `DATABENTO_API_KEY` is present and non-placeholder.
- `DATABENTO_API_KEY` authenticates against `hist.databento.com` (HTTP 200).
- The account has live GLBX.MDP3 streaming entitlement (symbol resolution for current date succeeds).
- `live.databento.com` is DNS-resolvable and TCP-reachable on port 443.
- `BRIDGE_AUTH_TOKEN` is present and non-placeholder.
- Bridge authentication is verified (bridge health endpoint returns HTTP 200).
- `DATABASE_URL` is present and database connection is verified.
- `MARKET_DATA_AUTHORITY=DATABENTO_SHADOW`.
- `ATLAS_GATE_G4_CHART_AUTHORITY_ENABLED=false` or absent.
- `LIVE_CREDENTIALS_READY=true`.

---

## 8. Operator Commands

The operator must check out the staging tooling commit on the staging host:

```bash
git fetch origin
git checkout f86d82495b3004c90b359a22c010d3821ceb18c8
```

Verify these files are present:

```
scripts/run_gate_g4_staging_validation.sh
scripts/staging_session_protocol.sh
scripts/chart_authority_activation_readiness.sh
docs/runbooks/SPRINT_123A4_GATE_G4_LIVE_VALIDATION_HANDOFF.md
docs/reports/SPRINT_123A4_GATE_G4_LIVE_VALIDATION_RESULTS_TEMPLATE.md
```

Load secrets through the approved runtime secret mechanism (not through chat, Git, or command-line arguments):

```bash
# Load via approved mechanism — example only, adapt to your infrastructure
export DATABENTO_API_KEY="<loaded from vault>"
export BRIDGE_AUTH_TOKEN="<loaded from vault>"
export DATABASE_URL="<staging database connection string>"
export MARKET_DATA_AUTHORITY=DATABENTO_SHADOW
export ATLAS_GATE_G4_CHART_AUTHORITY_ENABLED=false
```

Run the preflight and confirm `LIVE_CREDENTIALS_READY=true` before proceeding:

```bash
bash scripts/run_gate_g4_staging_validation.sh --preflight-only
```

Run the full validation only after the preflight passes completely:

```bash
bash scripts/run_gate_g4_staging_validation.sh
```

Full operator instructions, staging prerequisites, required thresholds, and evidence return requirements are in:

```
docs/runbooks/SPRINT_123A4_GATE_G4_LIVE_VALIDATION_HANDOFF.md
```

---

## 9. Gate Decision

> Sprint 123A.4 implementation and automated validation are accepted for continued operational validation.
>
> Gate G4 is not approved.
>
> Gate G4 remains blocked until a real GLBX.MDP3 live staging session is completed on infrastructure with the required Databento entitlement and network access.
>
> Sprint 123A.5 is not authorised.
>
> DATABENTO_CHART_AUTHORITY remains inactive.
>
> TradingView remains the sole processBar and postBarAutomation authority.

---

*This document contains no credentials. No live-session results have been fabricated. No pending validations have been pre-filled as passing.*
