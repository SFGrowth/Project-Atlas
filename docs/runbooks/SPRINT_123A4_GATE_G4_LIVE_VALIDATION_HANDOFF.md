# Sprint 123A.4 — Gate G4 Live Validation Operator Handoff

**Document version:** 1.0  
**Date:** 2026-07-21  
**Status:** AWAITING OPERATOR EXECUTION

---

> **This document is the single authoritative handoff for the Gate G4 live staging session.**
> The operator must follow every section in order. No step may be skipped. Gate G4 is not approved until all live validations pass and Phil provides written approval.

---

## 1. Reference SHAs

| Artefact | SHA |
|---|---|
| Gate G4 implementation (Gate G4 Revision 3) | `0f770762654c067998cf7e8adc984eb5a06e4b8b` |
| Staging tooling and interim evidence | `f86d82495b3004c90b359a22c010d3821ceb18c8` |
| Branch | `sprint/123a-2-databento-adapter` |

The staging host must be checked out to the **staging tooling SHA** (`f86d82495b3004c90b359a22c010d3821ceb18c8`). This commit contains the Gate G4 implementation plus all hardened staging scripts, the preflight, the interim evidence report, and this handoff document. The implementation-only SHA (`0f770762654c067998cf7e8adc984eb5a06e4b8b`) predates the staging tooling and must not be used as the operator checkout target.

```bash
git fetch origin
git checkout f86d82495b3004c90b359a22c010d3821ceb18c8
```

After checkout, verify the following files are present before proceeding:

```
scripts/run_gate_g4_staging_validation.sh
scripts/staging_session_protocol.sh
scripts/chart_authority_activation_readiness.sh
docs/runbooks/SPRINT_123A4_GATE_G4_LIVE_VALIDATION_HANDOFF.md
docs/reports/SPRINT_123A4_GATE_G4_AUTOMATED_VALIDATION_RESULTS.md
```

---

## 2. Staging Prerequisites

All prerequisites must be confirmed before the validation session begins.

| Prerequisite | How to verify |
|---|---|
| Atlas server NOT running in production mode | Confirm `NODE_ENV=staging` or `NODE_ENV=test` |
| `MARKET_DATA_AUTHORITY=DATABENTO_SHADOW` | Confirmed by preflight Step 1 |
| `ATLAS_GATE_G4_CHART_AUTHORITY_ENABLED` absent or `false` | Confirmed by preflight Step 1 |
| MySQL 8 running with all 28 migrations applied | `mysql -e "SHOW TABLES;" <staging_db> \| wc -l` — expect >= 76 |
| Databento Python feed service running | `systemctl status databento-feed` or equivalent |
| Databento bridge WebSocket connected | `/api/market-data/bridge/health` returns HTTP 200 |
| Playwright installed | `pnpm exec playwright install chromium` |
| Atlas server accessible at `ATLAS_BASE_URL` | `curl -s ${ATLAS_BASE_URL}/api/health` returns HTTP 200 |
| Evidence directory writable | `mkdir -p evidence/` in repo root |
| Secrets loaded via approved mechanism | See Section 3 |

---

## 3. Secure Secret Loading

**Secrets must never be passed through chat, email, or any logged channel.**

The following environment variables must be set on the staging host before running the validation. Use the approved secret-loading mechanism for your infrastructure (e.g., HashiCorp Vault, AWS Secrets Manager, a `.env` file with restricted permissions that is never committed).

| Variable | Purpose |
|---|---|
| `DATABENTO_API_KEY` | Authenticates the Databento Python feed service |
| `BRIDGE_AUTH_TOKEN` | Authenticates the private bridge WebSocket connection |
| `DATABASE_URL` | MySQL connection string for the staging database |
| `MARKET_DATA_AUTHORITY` | Must be set to `DATABENTO_SHADOW` |
| `ATLAS_GATE_G4_CHART_AUTHORITY_ENABLED` | Must be absent or `false` |
| `ATLAS_BASE_URL` | Base URL of the running Atlas server (e.g., `http://localhost:3000`) |
| `NODE_ENV` | Must be `staging` or `test` — never `production` |

The preflight script will reject any value that matches a known placeholder pattern (including `changeme`, `placeholder`, `test`, `dummy`, `example`, `your_key_here`, bracket-wrapped values such as `[REDACTED]` or `<secret>`, and empty or whitespace-only values). It will not report `LIVE_CREDENTIALS_READY=true` until an authenticated Databento API request and an authenticated bridge handshake both succeed.

---

## 4. Preflight Command

Run the preflight check before starting the live session. This confirms all secrets are present, non-placeholder, and authenticated.

```bash
cd /path/to/atlas-nexus
bash scripts/run_gate_g4_staging_validation.sh --preflight-only
```

**Expected output (all lines must appear):**

```
DATABENTO_API_KEY: SECRET_VARIABLE_PRESENT=true
DATABENTO_API_KEY: SECRET_VALUE_NON_PLACEHOLDER=true
BRIDGE_AUTH_TOKEN: SECRET_VARIABLE_PRESENT=true
BRIDGE_AUTH_TOKEN: SECRET_VALUE_NON_PLACEHOLDER=true
DATABASE_URL: SECRET_VARIABLE_PRESENT=true
DATABASE_URL: SECRET_VALUE_NON_PLACEHOLDER=true
MARKET_DATA_AUTHORITY: [CORRECT] DATABENTO_SHADOW
ATLAS_GATE_G4_CHART_AUTHORITY_ENABLED: [CORRECT] not true
DATABASE_CONNECTION_VERIFIED=true
DATABENTO_AUTHENTICATION_VERIFIED=true
BRIDGE_AUTHENTICATION_VERIFIED=true
LIVE_CREDENTIALS_READY=true
[PASS] Step 1: Environment preflight passed
```

**Do not proceed to the full validation if any line shows `false`, `UNVERIFIED`, or `BLOCKING`.**

---

## 5. Full Validation Command

Once the preflight passes and the live Databento session is active:

```bash
cd /path/to/atlas-nexus
bash scripts/run_gate_g4_staging_validation.sh
```

The script runs all 12 steps in order and stops immediately on any blocking failure. All output is written to `evidence/<TIMESTAMP>/gate_g4_validation.log`.

---

## 6. Expected Evidence Directory

After the validation run, the following files must be present in `evidence/<TIMESTAMP>/`:

| File | Contents |
|---|---|
| `gate_g4_validation.log` | Full validation output (redacted) |
| `step1_preflight.log` | Preflight environment summary (no secrets) |
| `step2_staging_session.log` | Staging session protocol output |
| `step3_latency.json` | Latency API response |
| `step3_continuity.json` | Continuity API response |
| `step4_playwright.log` | Playwright test output |
| `playwright-results/` | Playwright HTML report and screenshots |
| `step5_sse_events.txt` | SSE event capture (redacted) |
| `step6_parity.json` | Parity API response |
| `step7_chart_authority_readiness.log` | Chart-authority readiness check output |
| `step8_vitest.log` | Vitest 447-test output |
| `step9_pytest.log` | pytest 143-test output |
| `step10_tsc.log` | TypeScript compilation output |
| `step11_frontend_build.log` | Frontend build output |

The evidence directory is excluded from Git by `.gitignore`. The operator must submit the evidence files separately as described in Section 9.

---

## 7. Required Session Duration

The live shadow session must run for a minimum duration sufficient to collect:

- **>= 500 eligible 1-minute bar comparisons** between Databento and TradingView for the parity evaluation.
- **One complete RTH session** (09:30–16:00 ET) is the preferred minimum.
- The session must include at least one period of normal market activity (not pre-market only).

If the session is interrupted before 500 comparisons are collected, the parity evaluation cannot be completed and Gate G4 cannot be approved.

---

## 8. Required Thresholds

All thresholds must be met. A single threshold failure is a blocking Gate G4 failure.

### 8.1 Parity Thresholds

| Metric | Required threshold |
|---|---|
| Total comparisons | >= 500 |
| Overall mismatch rate | <= 2.0% |
| `DB_ONLY` bars (present in Databento, absent in TradingView) | <= 5.0% |
| `TV_ONLY` bars (present in TradingView, absent in Databento) | <= 1.0% |
| OHLCV field mismatch rate (matched bars only) | <= 0.5% |

### 8.2 Latency Thresholds

| Stage | p50 | p95 | p99 | Max |
|---|---|---|---|---|
| Bridge receive → event bus emit | < 5ms | < 20ms | < 50ms | < 200ms |
| Event bus emit → bar builder | < 2ms | < 10ms | < 30ms | < 100ms |
| Bar builder → MySQL write | < 10ms | < 50ms | < 100ms | < 500ms |
| End-to-end (bridge receive → MySQL write) | < 20ms | < 80ms | < 150ms | < 750ms |

### 8.3 Continuity Thresholds

| Metric | Required threshold |
|---|---|
| Bar continuity rate | >= 99.0% |
| Unresolved gaps at session end | 0 |
| Gap recovery rate (gaps that were resolved) | >= 95.0% |

### 8.4 Playwright Browser Test Requirement

All 20 chart-behaviour tests (CB-001 to CB-020) must pass. Zero blocking tests may be skipped. The Playwright HTML report must be attached to the evidence submission.

### 8.5 SSE Reconnect Requirement

The SSE reconnect proof must demonstrate all 12 required properties:

1. Client connects and receives initial state event within 5 seconds.
2. Client receives bar events within 10 seconds of bar completion.
3. Connection drops are detected within 30 seconds.
4. Client reconnects automatically without manual intervention.
5. Reconnect uses `?afterEventId=<cursor>` query parameter.
6. No duplicate events are delivered after reconnect.
7. No events are missed during a reconnect window of <= 60 seconds.
8. Server sends heartbeat events at the configured interval.
9. Multiple simultaneous SSE clients receive identical event streams.
10. SSE stream does not expose any credential values.
11. SSE stream does not expose internal database IDs beyond the event cursor.
12. SSE stream is correctly terminated when the server shuts down.

### 8.6 Chart-Authority Readiness Requirement

All 7 gates in `scripts/chart_authority_activation_readiness.sh` must pass:

1. `MARKET_DATA_AUTHORITY=DATABENTO_SHADOW` confirmed.
2. `ATLAS_GATE_G4_CHART_AUTHORITY_ENABLED=false` confirmed.
3. Parity threshold met (>= 500 comparisons, mismatch <= 2%).
4. Latency threshold met (p99 end-to-end <= 150ms).
5. Continuity threshold met (>= 99% rate, 0 unresolved gaps).
6. All 447 Gate G1–G4 Vitest tests pass.
7. No production chart-authority activation detected.

### 8.7 Secret Scan Requirement

The final secret scan of the evidence directory must return:

```
Secret scan: [PASS] No credentials found in evidence directory
```

Zero credential exposures are permitted. Any finding is a blocking failure.

---

## 9. Files the Operator Must Return

Upon completion of the live validation session, the operator must provide the following files for the Gate G4 evidence record.

| File | Description |
|---|---|
| `SPRINT_123A4_GATE_G4_LIVE_VALIDATION_RESULTS.md` | Completed evidence template (all sections filled) |
| `gate_g4_validation.log` | Full redacted validation log |
| `step4_playwright.log` | Playwright test output |
| `playwright-results/` | Playwright HTML report directory |
| Screenshots (PNG) | At minimum: chart view, parity dashboard, latency dashboard |
| `step5_sse_events.txt` | SSE event capture |
| `step6_parity.json` | Parity API response |
| `step3_latency.json` | Latency API response |
| `step3_continuity.json` | Continuity API response |
| `step7_chart_authority_readiness.log` | Readiness script output |
| Secret scan output | Final secret scan result (from Step 12 or `--secret-scan-only`) |

The completed evidence template is `docs/reports/SPRINT_123A4_GATE_G4_LIVE_VALIDATION_RESULTS_TEMPLATE.md`. All 21 sections must be completed. No section may be left blank or marked "N/A" unless the template explicitly permits it.

---

## 10. Gate G4 Approval Process

Gate G4 is approved only when:

1. All 12 validation steps pass with no blocking failures.
2. All thresholds in Section 8 are met.
3. The completed evidence template is submitted.
4. All files listed in Section 9 are attached.
5. **Phil provides written approval.**

Written approval must explicitly state that Gate G4 is approved and that `DATABENTO_CHART_AUTHORITY` activation may proceed. An automated test result does not constitute approval.

---

## 11. What Must Not Happen

The following actions are prohibited until Gate G4 is approved in writing.

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

## 12. Contacts and Escalation

If any validation step fails and cannot be resolved by the operator, escalate to Phil before proceeding. Do not attempt to work around a blocking failure by re-running the validation with modified thresholds or a different environment.

---

*This document contains no credentials. It is safe to commit to the repository.*
