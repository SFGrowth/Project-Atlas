# Sprint 123A.4 — Gate G4 Live Validation Results

> **Instructions for the Atlas operator:**
> Fill in every section below during and after the live staging session.
> Do not pre-fill results. Do not commit secrets, API keys, tokens, passwords, or session cookies.
> Attach the completed document to the Gate G4 approval submission.
> Gate G4 requires explicit written approval from Phil before DATABENTO_CHART_AUTHORITY is activated.

---

## 1. Staging Environment

| Field | Value |
|---|---|
| Staging host | |
| Operating system | |
| Node.js version | |
| Python version | |
| MySQL version | |
| pnpm version | |
| Staging database name | |
| Staging date (UTC) | |
| Staging start time (UTC) | |
| Staging end time (UTC) | |
| Total session duration | |
| Operator name | |

---

## 2. Implementation SHA

| Field | Value |
|---|---|
| Implementation SHA | |
| Branch | `sprint/123a-2-databento-adapter` |
| Expected SHA | `0f770762654c067998cf7e8adc984eb5a06e4b8b` |
| SHA matches expected | |

---

## 3. Evidence SHA

| Field | Value |
|---|---|
| Evidence directory | `evidence/<TIMESTAMP>/` |
| Evidence directory SHA (sha256 of tarball) | |
| Evidence tarball filename | |

---

## 4. Dataset

| Field | Value |
|---|---|
| Databento dataset | |
| Schema | |
| Feed type (live / historical) | |
| Subscription symbols | |
| Active contract | |
| Session type (RTH / ETH / full) | |

---

## 5. Requested and Resolved Symbols

| Requested symbol | Resolved instrument ID | Resolution status | Notes |
|---|---|---|---|
| | | | |
| | | | |

---

## 6. Session Duration and Record Counts

| Metric | Count |
|---|---|
| Trade records received | |
| OHLCV-1m records received | |
| Definition records received | |
| Symbol-mapping records received | |
| Accepted bridge records | |
| Rejected bridge records | |
| Developing bars emitted | |
| Provisional bars emitted | |
| Confirmed 1m bars | |
| Unresolved bars | |
| Recovery requests | |
| Recovery completions | |
| Recovery partials | |
| Recovery failures | |
| Confirmed 5m bars | |
| Persisted 1m rows | |
| Persisted 5m rows | |
| SSE events published | |
| Browser events received | |
| Bridge reconnects | |
| Persistence errors | |
| Runtime errors | |

---

## 7. Reconciliation Results

| Metric | Value |
|---|---|
| Total bars reconciled | |
| EXACT_MATCH count | |
| WITHIN_0.25 count | |
| MISMATCH count | |
| UNRESOLVED count | |
| Reconciliation coverage (%) | |
| Reconciliation pass/fail | |

---

## 8. Latency Percentiles

> Source: `evidence/<TIMESTAMP>/step3_latency.json`

| Percentile | Latency (ms) |
|---|---|
| p50 | |
| p90 | |
| p95 | |
| p99 | |
| p99.9 | |
| Max observed | |
| Latency threshold (p99 <= 500ms) | |
| Latency pass/fail | |

---

## 9. Continuity Metrics

> Source: `evidence/<TIMESTAMP>/step3_continuity.json`

| Metric | Value |
|---|---|
| Expected bars (session window) | |
| Received bars | |
| Missing bars | |
| Gap events | |
| Gap recovery successes | |
| Gap recovery failures | |
| Continuity rate (%) | |
| Continuity threshold (>= 99%) | |
| Continuity pass/fail | |

---

## 10. Parity Metrics

> Source: `evidence/<TIMESTAMP>/step6_parity.json`

| Metric | Value |
|---|---|
| Bars compared (last 100) | |
| EXACT_MATCH count | |
| WITHIN_0.25 count | |
| MISMATCH count (>0.25pt) | |
| Mismatch rate (%) | |
| Mismatch threshold (<= 2.0%) | |
| Parity pass/fail | |
| Max close delta observed (pts) | |
| Mean close delta (pts) | |

---

## 11. Playwright Browser Test Results

> Source: `evidence/<TIMESTAMP>/step4_playwright.log`

| Test ID | Test name | Result | Notes |
|---|---|---|---|
| CB-001 | | | |
| CB-002 | | | |
| CB-003 | | | |
| CB-004 | | | |
| CB-005 | | | |
| CB-006 | | | |
| CB-007 | | | |
| CB-008 | | | |
| CB-009 | | | |
| CB-010 | | | |
| CB-011 | | | |
| CB-012 | | | |
| CB-013 | | | |
| CB-014 | | | |
| CB-015 | | | |
| CB-016 | | | |
| CB-017 | | | |
| CB-018 | | | |
| CB-019 | | | |
| CB-020 | | | |

| Summary | Value |
|---|---|
| Total tests | 20 |
| Passed | |
| Failed | |
| Skipped | |
| Playwright pass/fail | |

---

## 12. Screenshots

> Attach screenshots from `evidence/<TIMESTAMP>/playwright-results/`.
> Do not include screenshots that contain API keys, tokens, or session cookies.

| Screenshot | Description | Attached? |
|---|---|---|
| Chart initial load | | |
| First bar rendered | | |
| Developing bar update | | |
| Bar confirmation | | |
| SSE reconnect | | |
| Parity overlay (if applicable) | | |

---

## 13. SSE Reconnect Proof

> Source: `evidence/<TIMESTAMP>/step5_sse_events.txt`

| Field | Value |
|---|---|
| SSE endpoint tested | `/api/market-data/stream` |
| Events received before disconnect | |
| Reconnect triggered at (UTC) | |
| Events received after reconnect | |
| Reconnect latency (ms) | |
| SSE reconnect pass/fail | |

---

## 14. Chart Authority Readiness Result

> Source: `evidence/<TIMESTAMP>/step7_chart_authority_readiness.log`

| Gate | Description | Result |
|---|---|---|
| Gate 1 | MARKET_DATA_AUTHORITY=DATABENTO_SHADOW | |
| Gate 2 | ATLAS_GATE_G4_CHART_AUTHORITY_ENABLED not true | |
| Gate 3 | Minimum bar count (>= 100 MATCHED bars) | |
| Gate 4 | Parity mismatch rate < 2% | |
| Gate 5 | No unresolved gaps in last 24 hours | |
| Gate 6 | Health state is LIVE | |
| Gate 7 | Staging duration >= 6.5 hours | |

| Summary | Value |
|---|---|
| Gates passed | / 7 |
| Overall readiness | |

---

## 15. Regression Test Results

> Source: `evidence/<TIMESTAMP>/step8_vitest.log`

| Suite | Tests | Passed | Failed | Duration |
|---|---|---|---|---|
| TypeScript (Vitest) | 447 | | | |

| Field | Value |
|---|---|
| Vitest pass/fail | |
| TypeScript test count matches expected (447) | |

---

## 16. Python Test Results

> Source: `evidence/<TIMESTAMP>/step9_pytest.log`

| Suite | Tests | Passed | Failed | Duration |
|---|---|---|---|---|
| Python (pytest) | 143 | | | |

| Field | Value |
|---|---|
| pytest pass/fail | |
| Python test count matches expected (143) | |

---

## 17. TypeScript Compilation Result

> Source: `evidence/<TIMESTAMP>/step10_tsc.log`

| Field | Value |
|---|---|
| TypeScript errors | |
| TypeScript warnings | |
| Compilation pass/fail | |

---

## 18. Frontend Production Build Result

> Source: `evidence/<TIMESTAMP>/step11_frontend_build.log`

| Field | Value |
|---|---|
| Build errors | |
| Build warnings | |
| Bundle size (kB) | |
| Build pass/fail | |

---

## 19. Secret Scan Result

> Source: `evidence/<TIMESTAMP>/gate_g4_validation.log` (Step 12)

| Field | Value |
|---|---|
| Secret scan hits | |
| Secret scan pass/fail | |
| Credentials found in evidence | None (must be None to pass) |

---

## 20. Unresolved Issues

> List any issues, anomalies, or open questions discovered during the staging session.
> If none, write "None".

| # | Issue | Severity | Status | Notes |
|---|---|---|---|---|
| | | | | |

---

## 21. Gate G4 Recommendation

| Field | Value |
|---|---|
| All 12 validation steps passed | |
| All 7 readiness gates passed | |
| No unresolved blocking issues | |
| Secret scan clean | |
| Operator recommendation | |
| Operator signature | |
| Date of recommendation (UTC) | |

> **Gate G4 approval requires explicit written approval from Phil.**
> Do not activate `DATABENTO_CHART_AUTHORITY` until approval is received in writing.
> Sprint 123A.5 must not begin until Gate G4 is approved.

---

*This template contains no credentials, no pre-filled results, and no fabricated data.*  
*All sections must be completed by the Atlas operator during the live staging session.*
