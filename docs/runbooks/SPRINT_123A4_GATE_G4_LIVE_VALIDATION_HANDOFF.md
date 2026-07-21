# Sprint 123A.4 — Gate G4 Live Validation Operator Handoff

**Document version:** 2.0  
**Date:** 2026-07-21  
**Branch:** `sprint/123a-2-databento-adapter`  
**Status:** PENDING — awaiting live Databento entitlement and operator-controlled staging host

---

> **GATE G4: OPERATIONAL VALIDATION BLOCKED BY EXTERNAL INFRASTRUCTURE**
>
> Gate G4 is not approved. Sprint 123A.5 is not authorised. `DATABENTO_CHART_AUTHORITY` remains inactive. TradingView remains the sole `processBar` and `postBarAutomation` authority. Do not activate any production authority change. Do not run migrations against production. Do not fabricate live-session results.

---

## Reference SHAs

| Artefact | SHA |
|---|---|
| Gate G4 implementation (Gate G4 Revision 3) | `0f770762654c067998cf7e8adc984eb5a06e4b8b` |
| **Operator checkout target** (staging tooling + evidence) | **`f86d82495b3004c90b359a22c010d3821ceb18c8`** |
| Approved Gate G3 baseline | `f77993b1d37241ade7717e4af93c22cde753c1bb` |
| Branch | `sprint/123a-2-databento-adapter` |

---

## Stop Conditions

Stop immediately and report Gate G4 blocked if any of the following occurs at any step:

- Live entitlement is unavailable or returns HTTP 422
- `live.databento.com` is unreachable
- Preflight fails on any check
- Fewer than 500 eligible comparisons are collected
- Bar continuity is below 99%
- Unresolved gaps remain at session end
- Any parity threshold fails
- Any CB-001 to CB-020 test fails
- SSE reconnect proof fails
- Cursor resynchronisation fails
- Chart-authority readiness check fails
- Staging failover leaves unsafe state
- Targeted regression fails
- Secret scan finds credentials in any artefact

---

## Step 1 — Use an Operator-Controlled Staging Host

The host must have:

- DNS resolution for `live.databento.com`
- Outbound TLS/WebSocket access to `live.databento.com` on port 443
- Node.js and Python dependencies installed
- MySQL 8 staging database with all Atlas migrations applied to staging only
- Authenticated Atlas dashboard access
- Playwright installed
- Sufficient uptime to run one full regular trading session where practical

Do not use the Manus sandbox — it does not resolve `live.databento.com` and does not have live GLBX.MDP3 entitlement.

---

## Step 2 — Verify Databento Entitlement

The Databento account must have active access to:

- GLBX.MDP3 live CME Globex data
- MNQ futures
- `trades` schema
- `ohlcv-1m` schema
- `definition` schema
- `symbol-mapping` schema
- Applicable CME exchange licence

Historical access alone is insufficient. Before starting Atlas, verify that current-date symbol resolution for `MNQ.c.0` succeeds:

```bash
python3 -c "
import os, urllib.request, base64, json
from datetime import date, timedelta
key = os.environ['DATABENTO_API_KEY']
creds = base64.b64encode(f'{key}:'.encode()).decode()
today = date.today().isoformat()
tomorrow = (date.today() + timedelta(days=1)).isoformat()
url = (f'https://hist.databento.com/v0/symbology.resolve'
       f'?dataset=GLBX.MDP3&symbols=MNQ.c.0&stype_in=continuous'
       f'&stype_out=instrument_id&start_date={today}&end_date={tomorrow}')
req = urllib.request.Request(url)
req.add_header('Authorization', f'Basic {creds}')
with urllib.request.urlopen(req, timeout=15) as r:
    print('ENTITLEMENT OK:', r.status)
"
```

A `dataset_unavailable_range` response or HTTP 422 is a blocking failure. Do not continue if entitlement is missing.

---

## Step 3 — Check Out the Approved Staging Tooling

```bash
git fetch origin
git checkout f86d82495b3004c90b359a22c010d3821ceb18c8
```

Verify these files exist:

```
scripts/run_gate_g4_staging_validation.sh
scripts/staging_session_protocol.sh
scripts/chart_authority_activation_readiness.sh
docs/runbooks/SPRINT_123A4_GATE_G4_LIVE_VALIDATION_HANDOFF.md
docs/reports/SPRINT_123A4_GATE_G4_LIVE_VALIDATION_RESULTS_TEMPLATE.md
```

Record and verify:

```bash
git status --short   # must be clean
git rev-parse HEAD   # must be f86d82495b3004c90b359a22c010d3821ceb18c8
git branch --show-current
```

The working tree must be clean before validation begins.

---

## Step 4 — Load Secrets Safely

Load secrets only through the approved runtime secret mechanism. Required variables:

| Variable | Required value |
|---|---|
| `DATABENTO_API_KEY` | Real key — not a placeholder |
| `BRIDGE_AUTH_TOKEN` | Real token — not a placeholder |
| `DATABASE_URL` | Staging MySQL connection string |
| `MARKET_DATA_AUTHORITY` | `DATABENTO_SHADOW` |
| `ATLAS_GATE_G4_CHART_AUTHORITY_ENABLED` | `false` |
| `LIVE_CREDENTIALS_READY` | `true` |

Do not paste secrets into chat, commit secrets, write secrets into Markdown evidence, pass secrets in command-line arguments, or echo secrets into logs. Run a source and evidence-directory secret scan before and after the session.

---

## Step 5 — Run Preflight

```bash
bash scripts/run_gate_g4_staging_validation.sh --preflight-only
```

All of the following must be confirmed before proceeding:

| Check | Required result |
|---|---|
| `DATABENTO_API_KEY` present and non-placeholder | PASS |
| Databento historical authentication | HTTP 200 |
| Current GLBX.MDP3 entitlement active | Symbol resolution succeeds |
| `live.databento.com` DNS resolution | Resolves |
| `live.databento.com:443` TCP reachable | Reachable |
| `BRIDGE_AUTH_TOKEN` present and non-placeholder | PASS |
| Bridge authentication | HTTP 200 |
| `DATABASE_URL` connects to staging MySQL | PASS |
| `MARKET_DATA_AUTHORITY` | `DATABENTO_SHADOW` |
| `ATLAS_GATE_G4_CHART_AUTHORITY_ENABLED` | `false` or absent |
| Production authority unchanged | CONFIRMED |
| `LIVE_CREDENTIALS_READY` | `true` |

Stop immediately if any preflight item fails. Do not manually bypass or weaken preflight checks.

---

## Step 6 — Run the Live Shadow Session

After preflight passes:

```bash
bash scripts/run_gate_g4_staging_validation.sh
```

Run for at least 500 eligible one-minute comparisons and one full regular trading session where practical. The session must ingest and record:

- Live trades, official ohlcv-1m records, definition records, symbol-mapping records
- Developing bars, provisional bars, confirmed one-minute bars, confirmed five-minute bars
- Unresolved bars, recovery events
- One-minute persistence rows, five-minute persistence rows, processing-ledger rows

Do not activate chart authority during the live shadow collection period.

---

## Step 7 — Capture All Latency Metrics

Measure p50, p90, p95, p99, p99.9, and maximum for every required pipeline stage:

| Stage | Description |
|---|---|
| 1 | Databento receive timestamp → Python normalisation |
| 2 | Python normalisation → bridge transmission |
| 3 | Bridge receipt → TypeScript ingestion |
| 4 | Trade ingestion → developing-bar update |
| 5 | Minute close → provisional bar |
| 6 | Official ohlcv-1m receipt → reconciliation |
| 7 | Reconciliation → persistence |
| 8 | Confirmed bar → dashboard SSE delivery |

Include sample count, clock source, clock synchronisation method, units, missing samples, and outlier explanation. Do not fabricate unavailable percentiles.

**Required thresholds:**

| Stage | p50 | p95 | p99 | Max |
|---|---|---|---|---|
| Bridge receive → event bus emit | < 5 ms | < 20 ms | < 50 ms | < 200 ms |
| Event bus emit → bar builder | < 2 ms | < 10 ms | < 30 ms | < 100 ms |
| Bar builder → MySQL write | < 10 ms | < 50 ms | < 100 ms | < 500 ms |
| End-to-end (bridge receive → MySQL write) | < 20 ms | < 80 ms | < 150 ms | < 750 ms |

---

## Step 8 — Verify Continuity and Recovery

**Required thresholds:**

| Metric | Required |
|---|---|
| Bar continuity | ≥ 99% |
| Unresolved gap count at session end | 0 |
| Gap recovery rate | ≥ 95% |

Capture: expected one-minute windows, received trade-built windows, official ohlcv-1m windows, confirmed windows, missing windows, recovered windows, unresolved windows, duplicate windows, out-of-order records, recovery attempts, recovery successes, partial recoveries, failed recoveries.

Any unresolved gap at session end blocks Gate G4.

---

## Step 9 — Run Parity Validation

Compare Databento shadow bars with the current TradingView-authoritative bars. Report:

- Total eligible comparisons, MATCHED, MISMATCH, DB_ONLY, TV_ONLY counts and rates
- OHLC delta distribution, volume delta distribution
- Timestamp alignment, contract mapping differences, session-boundary differences

**Required thresholds:**

| Metric | Required threshold |
|---|---|
| Total comparisons | ≥ 500 |
| Overall mismatch rate | ≤ 2.0% |
| DB_ONLY rate | ≤ 5.0% |
| TV_ONLY rate | ≤ 1.0% |
| OHLCV field mismatch rate (matched bars only) | ≤ 0.5% |

Do not change thresholds after observing results. Any failed threshold blocks Gate G4.

---

## Step 10 — Run Playwright Tests CB-001 to CB-020

Run all approved browser tests against the authenticated staging dashboard. All CB-001 to CB-020 tests must pass.

| Range | Areas |
|---|---|
| CB-001 to CB-005 | Initial chart load, historical candle rendering, live candle updates, developing candle updates, provisional-to-confirmed transition |
| CB-006 to CB-010 | Unresolved state rendering, five-minute aggregation display, symbol and contract metadata, reconnect behaviour, cursor replay |
| CB-011 to CB-015 | Cursor expiry, full resynchronisation, stale-feed indication, authority-state display, TradingView authority preservation |
| CB-016 to CB-020 | No duplicate chart candles, no chart rollback, no console errors, no secret exposure, session completion |

Provide screenshots, traces, console logs, and Playwright HTML report.

---

## Step 11 — Prove SSE Reconnect and Resynchronisation

Execute the complete approved 14-step SSE reconnect procedure. Prove:

1. Disconnect detection
2. Retained cursor
3. Reconnect attempt
4. Authenticated reconnection
5. Replay from valid cursor
6. No missing events
7. No duplicate candles
8. Cursor-expiry response
9. Full snapshot request
10. Snapshot application
11. Live stream resumption
12. Chart continuity
13. Authority unchanged
14. Final clean state

Do not mark reconnect as passed from unit tests alone. It must be demonstrated in the live staging environment.

---

## Step 12 — Run Chart-Authority Readiness Check

```bash
bash scripts/chart_authority_activation_readiness.sh
```

All seven readiness gates must be evaluated using the live-session evidence:

1. `MARKET_DATA_AUTHORITY=DATABENTO_SHADOW` confirmed
2. `ATLAS_GATE_G4_CHART_AUTHORITY_ENABLED=false` confirmed
3. Parity threshold met (≥ 500 comparisons, mismatch ≤ 2%)
4. Latency threshold met (p99 end-to-end ≤ 150 ms)
5. Continuity threshold met (≥ 99% rate, 0 unresolved gaps)
6. All 447 Gate G1–G4 Vitest tests pass
7. No production chart-authority activation detected

Do not activate chart authority merely because readiness passes. `DATABENTO_CHART_AUTHORITY` must remain inactive until Phil gives separate written approval.

---

## Step 13 — Run Staging-Only Failover Test

Perform the approved staging-only chart-authority failover test. Requirements:

- Staging environment only — no production traffic, no execution or automation authority
- TradingView remains recoverable
- Databento chart path can be enabled and disabled safely
- Stale or disconnected Databento feed causes safe fallback
- `processBar` remains TradingView-owned; `postBarAutomation` remains TradingView-owned
- No duplicate candles, no mixed-authority state, no persistent state corruption

Return the environment to `MARKET_DATA_AUTHORITY=DATABENTO_SHADOW` and `ATLAS_GATE_G4_CHART_AUTHORITY_ENABLED=false` before completing the evidence package.

---

## Step 14 — Run Final Regression

```bash
# Gate G1-G4 targeted Vitest suite — required: 447/447
pnpm vitest run server/market-data/tests/

# Python Databento feed suite — required: 143/143
python3 -m pytest services/databento-feed/tests/ -v

# TypeScript compilation — required: exit code 0
pnpm tsc --noEmit

# Frontend production build — required: exit code 0
pnpm build
```

Report any repository-wide unrelated failures separately with full accounting. Do not classify a Gate-targeted failure as pre-existing or out of scope.

---

## Step 15 — Run Final Secret Scan

Scan all of the following:

```
server/  client/  shared/  services/  scripts/  docs/
All Gate G4 evidence directories
Playwright traces and screenshots
Shell logs, environment dumps
Generated JSON and CSV files
```

Confirm no `DATABENTO_API_KEY`, `BRIDGE_AUTH_TOKEN`, `DATABASE_URL` credentials, session cookies, authentication headers, or private connection strings are present. Redact evidence before committing.

---

## Step 16 — Create the Final Gate G4 Evidence Package

Complete `docs/reports/SPRINT_123A4_GATE_G4_LIVE_VALIDATION_RESULTS.md` including all of:

- Full 40-character implementation SHA and evidence SHA
- Staging host description, validation date and session times
- Databento entitlement confirmation, dataset and schemas used
- Active MNQ contract and symbol-mapping evidence
- Trade and ohlcv-1m counts, lifecycle counts, persistence counts
- Latency percentiles for all eight pipeline stages
- Continuity and recovery results
- Parity results with full metrics
- Playwright CB-001 to CB-020 results
- SSE reconnect 14-step evidence
- Cursor-expiry resynchronisation evidence
- Chart-authority readiness check results (all 7 gates)
- Staging-only failover results
- Complete targeted regression results (447/447, 143/143, 0 TSC errors, build pass)
- Final secret-scan result
- Confirmation no production migration was run
- Confirmation chart authority remains inactive
- Confirmation TradingView remains `processBar` and `postBarAutomation` authority
- Unresolved issues
- Explicit Gate G4 recommendation

Attach or reference: raw session metrics, sanitised logs, screenshots, Playwright report, traces, database verification output, parity CSV, latency CSV, continuity CSV, recovery event report.

Do not commit raw secrets.

---

## Step 17 — Gate Decision

Gate G4 may only be approved in writing by Phil after the complete evidence package is reviewed. No automated test result, readiness check, or parity threshold alone constitutes Gate G4 approval.

The evidence package must conclude with this exact statement:

> Sprint 123A.4 implementation and automated validation are accepted for continued operational validation.
>
> Gate G4 is not approved until Phil provides written approval after reviewing the complete live evidence package.
>
> Sprint 123A.5 is not authorised.
>
> DATABENTO_CHART_AUTHORITY remains inactive.
>
> TradingView remains the sole processBar and postBarAutomation authority.

---

## Confirmed Automated Results (Pre-Validated in Sandbox)

These steps do not need to be re-run on the staging host unless the implementation has changed since commit `0f770762654c067998cf7e8adc984eb5a06e4b8b`.

| Validation | Result | SHA |
|---|---|---|
| Gate G1–G4 Vitest (447 tests) | **PASS — 447/447** | `0f770762` |
| Python pytest (143 tests) | **PASS — 143/143** | `0f770762` |
| TypeScript compilation | **PASS — 0 errors** | `0f770762` |
| Frontend production build | **PASS — 31.15s, 870.6 kB** | `0f770762` |
| Databento REST authentication | **PASS — HTTP 200** | Session |
| Source-file secret scan | **PASS — 0 exposures** | Session |

---

## What Must Not Happen

| Prohibited action |
|---|
| Activating `DATABENTO_CHART_AUTHORITY` |
| Setting `ATLAS_GATE_G4_CHART_AUTHORITY_ENABLED=true` in any environment |
| Beginning Sprint 123A.5 work |
| Merging the sprint branch to `main` |
| Running the validation against a production database |
| Providing credentials through chat, email, or any logged channel |
| Pre-filling pending sections of the evidence template as passing |
| Fabricating any metric or test result |

---

*This document contains no credentials. It is safe to commit to the repository.*
