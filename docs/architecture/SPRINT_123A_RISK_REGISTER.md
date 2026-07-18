# Sprint 123A Risk Register (Revision 2)
**Document type:** Architecture Reference  
**Sprint:** 123A  
**Status:** ACTIVE — update after each sub-sprint gate review  
**Date:** 2026-07-18 (Revision 2: Correction 6 applied — all risk categories recalculated from numeric L × I composite scores; categories no longer assigned by judgment)  
**Parent document:** `SPRINT_123A_AMENDED_IMPLEMENTATION_PLAN.md`

---

## Scoring Methodology

Each risk is scored on two independent dimensions, each rated 1–5. The composite risk score is the product of the two dimensions. Category thresholds are applied to the composite score only. Category labels are never assigned by judgment — they are derived mechanically from the composite score.

**Likelihood (L):** 1 = Very unlikely, 2 = Unlikely, 3 = Possible, 4 = Likely, 5 = Near-certain  
**Impact (I):** 1 = Negligible, 2 = Minor, 3 = Moderate, 4 = Major, 5 = Critical  
**Composite Score (C):** L × I

| Score Range | Category |
|---|---|
| 1–4 | LOW |
| 5–9 | MEDIUM |
| 10–14 | HIGH |
| 15–25 | CRITICAL |

---

## Active Risks

### R-001 — Databento API Key Exposure

**Description:** `DATABENTO_API_KEY` leaks into logs, SSE payloads, database rows, error responses, or browser bundles.

| Dimension | Value | Rationale |
|---|---|---|
| Likelihood (L) | 3 | Possible — requires careful implementation; a common mistake in error logging |
| Impact (I) | 5 | API key compromise gives full Databento account access; account suspension; financial data exposure |
| **Composite (C)** | **15** | |
| **Category** | **CRITICAL** | 15 ÷ 25 = 60% of maximum |

**Mitigation:** Secret scanning tests are a blocking gate criterion at G2. Python service never logs the key. TypeScript server never forwards the key to any client-facing endpoint. Bridge uses a separate `BRIDGE_AUTH_TOKEN`. Frontend never connects to Databento directly.

**Residual L:** 1 | **Residual C:** 5 | **Residual Category:** MEDIUM  
**Owner:** Sprint 123A.2 | **Status:** OPEN

---

### R-002 — Production processBar() Triggered from Databento Path

**Description:** A Databento canonical bar accidentally triggers `processBar()`, causing a duplicate trade signal in paper trading.

| Dimension | Value | Rationale |
|---|---|---|
| Likelihood (L) | 3 | Possible — requires explicit authority gate in canonical router |
| Impact (I) | 5 | Duplicate trades, incorrect P&L, potential prop-firm rule violation |
| **Composite (C)** | **15** | |
| **Category** | **CRITICAL** | 15 ÷ 25 = 60% of maximum |

**Mitigation:** `MARKET_DATA_AUTHORITY` flag gates every dispatch path. `DATABENTO_SHADOW` mode explicitly prohibits calling `processBar()`. Canonical router checks authority flag before every consumer dispatch. Integration test `TEST-123A3-008` verifies no `processBar()` call from Databento path in shadow mode.

**Residual L:** 1 | **Residual C:** 5 | **Residual Category:** MEDIUM  
**Owner:** Sprint 123A.3 | **Status:** OPEN

---

### R-003 — Databento Continuous Symbol Resolution Failure

**Description:** The continuous symbol for MNQ front-month on Databento does not match any assumed naming convention. Sprint 123A.2 cannot begin until `TEST-INT-001` passes.

| Dimension | Value | Rationale |
|---|---|---|
| Likelihood (L) | 3 | Databento naming conventions are not publicly documented to match TradingView or CME conventions |
| Impact (I) | 4 | Blocks Sprint 123A.2 entirely; requires research and code changes |
| **Composite (C)** | **12** | |
| **Category** | **HIGH** | |

**Mitigation:** `TEST-INT-001` is a mandatory pre-requisite for Gate G2. Contract Roll Manager uses dynamic resolution from Databento metadata API. No hardcoded symbol strings in production code.

**Residual L:** 1 | **Residual C:** 4 | **Residual Category:** LOW  
**Owner:** Sprint 123A.2 | **Status:** OPEN

---

### R-004 — Duplicate postBarAutomation Trigger

**Description:** A code path outside `postBarAutomation.ts` calls `liveLearnEngine` or `onNewBarObservation()` directly, causing duplicate DARWIN observations, duplicate behaviour instances, or duplicate market-law updates.

| Dimension | Value | Rationale |
|---|---|---|
| Likelihood (L) | 3 | The direct `nexusRoutes.ts → liveLearnEngine` call must be removed in 123A.1; if missed, it creates a duplicate trigger |
| Impact (I) | 4 | Duplicate DARWIN observations corrupt research data; duplicate behaviour instances corrupt the canonical system |
| **Composite (C)** | **12** | |
| **Category** | **HIGH** | |

**Mitigation:** Gate G1 requires a source search confirming no direct `liveLearnEngine` call remains in `nexusRoutes.ts`. Test `TEST-123A1-003` verifies `postBarAutomation` is the sole caller. Consumer processing ledger detects duplicate processing.

**Residual L:** 1 | **Residual C:** 4 | **Residual Category:** LOW  
**Owner:** Sprint 123A.1 | **Status:** OPEN

---

### R-005 — Duplicate onNewBarObservation() Calls During Authority Transition

**Description:** `onNewBarObservation()` is called from both the TradingView path and the Databento canonical bar path simultaneously during authority transition, corrupting DARWIN research state.

| Dimension | Value | Rationale |
|---|---|---|
| Likelihood (L) | 3 | Possible during authority transition if `postBarAutomation` authority check is incorrect |
| Impact (I) | 4 | DARWIN research contaminated with duplicate observations |
| **Composite (C)** | **12** | |
| **Category** | **HIGH** | |

**Mitigation:** `postBarAutomation.ts` checks `MARKET_DATA_AUTHORITY` before calling `onNewBarObservation()`. In `DATABENTO_LEARNING_AUTHORITY` mode, TradingView trigger is disabled. Consumer processing ledger prevents duplicate processing. Test `TEST-123A5-005` verifies zero duplicates.

**Residual L:** 1 | **Residual C:** 4 | **Residual Category:** LOW  
**Owner:** Sprint 123A.5 | **Status:** OPEN

---

### R-006 — Unresolved Minute Silently Aggregated into 5-Min Bar

**Description:** A 5-minute bar containing an `UNRESOLVED` 1-minute bar is confirmed and dispatched to production consumers.

| Dimension | Value | Rationale |
|---|---|---|
| Likelihood (L) | 2 | Unlikely — requires the aggregator's `containsUnresolvedMinutes` check to be missing or bypassed |
| Impact (I) | 4 | Incorrect bar data drives strategy decisions |
| **Composite (C)** | **8** | |
| **Category** | **MEDIUM** | |

**Mitigation:** Five-minute aggregator enforces `containsUnresolvedMinutes` flag. Gate G3 requires test `TEST-123A3-006` to verify that `containsUnresolvedMinutes=true` bars are blocked from production dispatch. Hard error if dispatch is attempted.

**Residual L:** 1 | **Residual C:** 4 | **Residual Category:** LOW  
**Owner:** Sprint 123A.3 | **Status:** OPEN

---

### R-007 — Contract Roll Missed or Delayed

**Description:** A contract roll occurs but is not detected by the Contract Roll Manager, causing the bar builder to continue using the expired contract's trades.

| Dimension | Value | Rationale |
|---|---|---|
| Likelihood (L) | 2 | Unlikely — Databento sends `SymbolMappingMsg` on roll; missed only if handler is incorrect |
| Impact (I) | 4 | Bars built from expired contract trades are incorrect; parity comparison fails |
| **Composite (C)** | **8** | |
| **Category** | **MEDIUM** | |

**Mitigation:** Three independent roll detection mechanisms (symbol mapping, definition record, instrument_id change). Anomaly handling raises alerts for disagreement. `atlas_contract_rolls` table provides audit trail.

**Residual L:** 1 | **Residual C:** 4 | **Residual Category:** LOW  
**Owner:** Sprint 123A.3 | **Status:** OPEN

---

### R-008 — Bridge Port 7890 Exposed Externally

**Description:** The Python-to-TypeScript bridge WebSocket server is accessible from outside the container.

| Dimension | Value | Rationale |
|---|---|---|
| Likelihood (L) | 2 | Unlikely in Manus webdev — bridge binds to 127.0.0.1; exposure requires misconfiguration |
| Impact (I) | 4 | Internal market data stream exposed; bridge auth token potentially compromised |
| **Composite (C)** | **8** | |
| **Category** | **MEDIUM** | |

**Mitigation:** Bridge binds to `127.0.0.1:7890` only. Gate G2 requires security verification that port 7890 is not externally accessible. `BRIDGE_AUTH_TOKEN` required for all bridge connections.

**Residual L:** 1 | **Residual C:** 4 | **Residual Category:** LOW  
**Owner:** Sprint 123A.2 | **Status:** OPEN

---

### R-009 — AtlasLiveChart Publishing to Event Bus

**Description:** `AtlasLiveChart.tsx` publishes an event to the Atlas Event Bus, causing canonical event contamination.

| Dimension | Value | Rationale |
|---|---|---|
| Likelihood (L) | 2 | Unlikely if architecture is followed; a common mistake when adding chart interactivity |
| Impact (I) | 3 | Downstream consumers receive chart-generated events as authoritative market data |
| **Composite (C)** | **6** | |
| **Category** | **MEDIUM** | |

**Mitigation:** Canonical direction rule documented in §5 of amended plan. Test `TEST-123A4-005` verifies `AtlasLiveChart.tsx` never publishes to event bus. Gate G4 and G7 both require this test to pass.

**Residual L:** 1 | **Residual C:** 3 | **Residual Category:** LOW  
**Owner:** Sprint 123A.4 | **Status:** OPEN

---

### R-010 — Parity Certification Threshold Not Met

**Description:** After 5 consecutive trading days of shadow operation, the composite parity score is below the threshold defined in `DATABENTO_PARITY_CERTIFICATION_SPEC.md`, blocking Gate G4.

| Dimension | Value | Rationale |
|---|---|---|
| Likelihood (L) | 3 | Possible — TradingView and Databento use different timestamps and rounding; achieving the threshold requires careful tolerance calibration |
| Impact (I) | 2 | Gate G4 is blocked; Sprint 123A.4 deliverables are complete but cannot be activated; no production impact |
| **Composite (C)** | **6** | |
| **Category** | **MEDIUM** | |

**Mitigation:** Parity tolerances are defined in `DATABENTO_PARITY_CERTIFICATION_SPEC.md` before implementation begins. Parity monitor produces daily reports so issues are visible before the 5-day window closes. Excluded periods (rolls, gaps, synthetic bars) are clearly defined.

**Residual L:** 2 | **Residual C:** 4 | **Residual Category:** LOW  
**Owner:** Sprint 123A.4 | **Status:** OPEN

---

## Risk Summary

| ID | Risk | L | I | C | Category |
|---|---|---|---|---|---|
| R-001 | Databento API key exposure | 3 | 5 | **15** | CRITICAL |
| R-002 | Production processBar() triggered from Databento path | 3 | 5 | **15** | CRITICAL |
| R-003 | Databento continuous symbol resolution failure | 3 | 4 | **12** | HIGH |
| R-004 | Duplicate postBarAutomation trigger | 3 | 4 | **12** | HIGH |
| R-005 | Duplicate onNewBarObservation() calls | 3 | 4 | **12** | HIGH |
| R-006 | Unresolved minute silently aggregated | 2 | 4 | **8** | MEDIUM |
| R-007 | Contract roll missed or delayed | 2 | 4 | **8** | MEDIUM |
| R-008 | Bridge port 7890 exposed externally | 2 | 4 | **8** | MEDIUM |
| R-009 | AtlasLiveChart publishing to event bus | 2 | 3 | **6** | MEDIUM |
| R-010 | Parity certification threshold not met | 3 | 2 | **6** | MEDIUM |

**CRITICAL risks:** 2 (R-001, R-002)  
**HIGH risks:** 3 (R-003, R-004, R-005)  
**MEDIUM risks:** 5 (R-006, R-007, R-008, R-009, R-010)  
**LOW risks:** 0

---

## Closed Risks

| Risk ID | Description | Closed Date | Resolution |
|---|---|---|---|
| — | No risks closed yet | — | — |

---

# Revision 2 Additions — Correction 9 (Applied 2026-07-18)

The following 12 risks were added in response to Phil's Gate G0 Revision 2 review.

---

### R-011 — API Entitlement or Quota Exhaustion

**Description:** The Databento account's entitlement for `GLBX.MDP3` trades data is insufficient, or the monthly data quota is exhausted mid-session.

| Dimension | Value | Rationale |
|---|---|---|
| Likelihood (L) | 2 | Unlikely if account tier is confirmed in TEST-INT-001 |
| Impact (I) | 4 | Feed terminates mid-session; atlas_feed_health transitions to OFFLINE; bars become UNRESOLVED |
| **Composite (C)** | **8** | |
| **Category** | **MEDIUM** | |

**Mitigation:** Entitlement confirmed in TEST-INT-001. Quota monitoring added to feed health service. `atlas_feed_health` transitions to `OFFLINE` on quota exhaustion. Alert emitted.

**Residual L:** 1 | **Residual C:** 4 | **Residual Category:** LOW  
**Owner:** Sprint 123A.2 | **Status:** OPEN

---

### R-012 — Licensing or Retention Breach

**Description:** Raw tick data stored in `atlas_ticks` or `atlas_bars_1m` exceeds the retention period permitted under the Databento data licence.

| Dimension | Value | Rationale |
|---|---|---|
| Likelihood (L) | 2 | Possible if retention enforcement job fails silently |
| Impact (I) | 5 | Compliance breach; potential licence termination; financial and reputational risk |
| **Composite (C)** | **10** | |
| **Category** | **HIGH** | |

**Mitigation:** TEST-123A3-019 is blocking for Gate G3. Retention enforcement job runs daily. `TICK_RETENTION_DAYS` configurable. Retention policy documented in `DATABENTO_NO_TRADE_AND_GAP_POLICY.md`.

**Residual L:** 1 | **Residual C:** 5 | **Residual Category:** MEDIUM  
**Owner:** Sprint 123A.3 | **Status:** OPEN

---

### R-013 — Raw Tick Storage Growth

**Description:** `atlas_ticks` grows unboundedly, consuming excessive database storage and degrading query performance.

| Dimension | Value | Rationale |
|---|---|---|
| Likelihood (L) | 4 | Likely without retention enforcement — MNQ generates thousands of ticks per session |
| Impact (I) | 2 | Storage cost increase; query degradation; no production data loss |
| **Composite (C)** | **8** | |
| **Category** | **MEDIUM** | |

**Mitigation:** Retention enforcement job (TEST-123A3-019). Storage monitoring added to feed health service. `TICK_RETENTION_DAYS` defaults to 7 days.

**Residual L:** 1 | **Residual C:** 2 | **Residual Category:** LOW  
**Owner:** Sprint 123A.3 | **Status:** OPEN

---

### R-014 — Clock or Timestamp Error

**Description:** The server clock drifts or is misconfigured, causing `barOpenTs` comparisons to fail systematically and parity certification to be impossible.

| Dimension | Value | Rationale |
|---|---|---|
| Likelihood (L) | 2 | Unlikely on Manus infrastructure; NTP is standard |
| Impact (I) | 4 | Systematic timestamp disagreements block Gate G4 |
| **Composite (C)** | **8** | |
| **Category** | **MEDIUM** | |

**Mitigation:** NTP synchronisation required. Timestamp agreement metric in parity spec detects systematic offsets. Anomaly flag for disagreements > 5 seconds.

**Residual L:** 1 | **Residual C:** 4 | **Residual Category:** LOW  
**Owner:** Sprint 123A.2 | **Status:** OPEN

---

### R-015 — Historical API Failure

**Description:** The Databento Historical API is unavailable when a gap recovery is attempted, leaving `UNRESOLVED` bars that block 5-minute bar dispatch.

| Dimension | Value | Rationale |
|---|---|---|
| Likelihood (L) | 2 | Unlikely — Databento Historical API has high availability |
| Impact (I) | 3 | UNRESOLVED bars block dispatch; strategies miss bars; parity window may need to restart |
| **Composite (C)** | **6** | |
| **Category** | **MEDIUM** | |

**Mitigation:** TEST-123A3-013 covers gap recovery. `UNRESOLVED` bars block dispatch (not silently aggregated). Historical API failure is logged and escalated. Gap recovery retried with exponential backoff.

**Residual L:** 1 | **Residual C:** 3 | **Residual Category:** LOW  
**Owner:** Sprint 123A.3 | **Status:** OPEN

---

### R-016 — Python Restart Loop

**Description:** The Python feed service enters a restart loop due to a normalisation error on a specific record type, causing repeated disconnections.

| Dimension | Value | Rationale |
|---|---|---|
| Likelihood (L) | 2 | Possible if an unexpected Databento record type is received |
| Impact (I) | 3 | Feed degraded; bars become UNRESOLVED; parity window may restart |
| **Composite (C)** | **6** | |
| **Category** | **MEDIUM** | |

**Mitigation:** TEST-123A2-010 covers Python process failure. Exponential backoff on reconnection. Circuit breaker after 5 consecutive failures. `atlas_feed_health` transitions to `OFFLINE` after circuit break. Unknown record types are logged and skipped, not fatal.

**Residual L:** 1 | **Residual C:** 3 | **Residual Category:** LOW  
**Owner:** Sprint 123A.2 | **Status:** OPEN

---

### R-017 — Bridge Queue Overflow

**Description:** The bridge WebSocket queue overflows during a high-volume period, causing records to be dropped silently.

| Dimension | Value | Rationale |
|---|---|---|
| Likelihood (L) | 2 | Possible during economic data releases (e.g., NFP, FOMC) |
| Impact (I) | 3 | Dropped records cause incorrect bar OHLCV; parity failures |
| **Composite (C)** | **6** | |
| **Category** | **MEDIUM** | |

**Mitigation:** TEST-123A2-009 covers backpressure (blocking for Gate G2). Bridge applies flow control to Python service. Queue depth metric on health endpoint. No silent drops — backpressure is applied before overflow.

**Residual L:** 1 | **Residual C:** 3 | **Residual Category:** LOW  
**Owner:** Sprint 123A.2 | **Status:** OPEN

---

### R-018 — Synthetic Bar Feature Contamination

**Description:** A synthetic no-trade bar's flat OHLCV values contaminate EMA, ATR, or RSI computations for subsequent bars.

| Dimension | Value | Rationale |
|---|---|---|
| Likelihood (L) | 2 | Possible during low-liquidity periods (overnight, pre-market) |
| Impact (I) | 3 | Incorrect feature values; parity failures; potential strategy signal contamination |
| **Composite (C)** | **6** | |
| **Category** | **MEDIUM** | |

**Mitigation:** Parity spec Section 9 defines synthetic bar feature contamination exclusion rules. Feature values for bars immediately following synthetic bars are excluded from feature agreement calculation.

**Residual L:** 1 | **Residual C:** 3 | **Residual Category:** LOW  
**Owner:** Sprint 123A.3 | **Status:** OPEN

---

### R-019 — Chart/Broker Fill Disagreement

**Description:** A broker fill price falls outside the Databento bar OHLCV for the same interval, indicating a data quality issue or anomalous execution.

| Dimension | Value | Rationale |
|---|---|---|
| Likelihood (L) | 2 | Possible — slippage or latency may cause fills outside the bar range |
| Impact (I) | 3 | Indicates potential data quality issue; requires investigation |
| **Composite (C)** | **6** | |
| **Category** | **MEDIUM** | |

**Mitigation:** TEST-123A4-010 covers broker fill reconciliation. Disagreements logged in `atlas_parity_records` with `type = BROKER_FILL_DISAGREEMENT`. Alert emitted for investigation.

**Residual L:** 1 | **Residual C:** 3 | **Residual Category:** LOW  
**Owner:** Sprint 123A.4 | **Status:** OPEN

---

### R-020 — Stale Contract Mapping

**Description:** The Contract Roll Manager's symbol mapping becomes stale after a reconnection, causing bars to be attributed to the wrong contract.

| Dimension | Value | Rationale |
|---|---|---|
| Likelihood (L) | 2 | Possible if reconnection occurs during a roll event |
| Impact (I) | 4 | Bars attributed to wrong contract; incorrect OHLCV; parity failures |
| **Composite (C)** | **8** | |
| **Category** | **MEDIUM** | |

**Mitigation:** TEST-123A3-018 covers contract overlap and resubscription. `mappingVersion` incremented on every roll. Stale mapping detected by comparing `instrument_id` against the current mapping. On reconnection, mapping is re-fetched from Databento metadata API.

**Residual L:** 1 | **Residual C:** 4 | **Residual Category:** LOW  
**Owner:** Sprint 123A.3 | **Status:** OPEN

---

### R-021 — Ledger or Database Outage

**Description:** The consumer processing ledger or database is unavailable, preventing idempotency checks and potentially causing duplicate processing.

| Dimension | Value | Rationale |
|---|---|---|
| Likelihood (L) | 2 | Unlikely — Manus database infrastructure is highly available |
| Impact (I) | 4 | Without ledger, duplicate processing is possible; DARWIN research contaminated |
| **Composite (C)** | **8** | |
| **Category** | **MEDIUM** | |

**Mitigation:** Consumer ledger write failures cause the bar to be held in memory and retried. If the database is unavailable for > 30 seconds, `postBarAutomation` is suspended and `atlas_feed_health` transitions to `DEGRADED`. TradingView path continues unaffected.

**Residual L:** 1 | **Residual C:** 4 | **Residual Category:** LOW  
**Owner:** Sprint 123A.3 | **Status:** OPEN

---

### R-022 — Excessive Parity Exclusions

**Description:** The exclusion rate exceeds 2.0%, inflating the parity composite score by removing problematic intervals from the denominator.

| Dimension | Value | Rationale |
|---|---|---|
| Likelihood (L) | 2 | Possible if feed is unstable during the evaluation window |
| Impact (I) | 3 | Gate G4 fails; parity certification is impossible without a stable feed period |
| **Composite (C)** | **6** | |
| **Category** | **MEDIUM** | |

**Mitigation:** Parity spec Section 7 defines the maximum exclusion rate as a blocking availability gate (≤ 2.0%). Exclusion rate > 2.0% blocks Gate G4 regardless of composite score. Exclusion rate is reported daily.

**Residual L:** 1 | **Residual C:** 3 | **Residual Category:** LOW  
**Owner:** Sprint 123A.4 | **Status:** OPEN

---

## Updated Risk Summary (Revision 2)

| ID | Risk | L | I | C | Category |
|---|---|---|---|---|---|
| R-001 | Databento API key exposure | 3 | 5 | **15** | CRITICAL |
| R-002 | Production processBar() from Databento path | 3 | 5 | **15** | CRITICAL |
| R-003 | Databento symbol resolution failure | 3 | 4 | **12** | HIGH |
| R-004 | Duplicate postBarAutomation trigger | 3 | 4 | **12** | HIGH |
| R-005 | Duplicate onNewBarObservation() calls | 3 | 4 | **12** | HIGH |
| R-012 | Licensing/retention breach | 2 | 5 | **10** | HIGH |
| R-006 | Unresolved minute silently aggregated | 2 | 4 | **8** | MEDIUM |
| R-007 | Contract roll missed or delayed | 2 | 4 | **8** | MEDIUM |
| R-008 | Bridge port exposed externally | 2 | 4 | **8** | MEDIUM |
| R-011 | API entitlement/quota exhaustion | 2 | 4 | **8** | MEDIUM |
| R-013 | Raw tick storage growth | 4 | 2 | **8** | MEDIUM |
| R-014 | Clock/timestamp error | 2 | 4 | **8** | MEDIUM |
| R-020 | Stale contract mapping | 2 | 4 | **8** | MEDIUM |
| R-021 | Ledger/database outage | 2 | 4 | **8** | MEDIUM |
| R-009 | AtlasLiveChart publishing to event bus | 2 | 3 | **6** | MEDIUM |
| R-010 | Parity threshold not met | 3 | 2 | **6** | MEDIUM |
| R-015 | Historical API failure | 2 | 3 | **6** | MEDIUM |
| R-016 | Python restart loop | 2 | 3 | **6** | MEDIUM |
| R-017 | Bridge queue overflow | 2 | 3 | **6** | MEDIUM |
| R-018 | Synthetic bar feature contamination | 2 | 3 | **6** | MEDIUM |
| R-019 | Chart/broker fill disagreement | 2 | 3 | **6** | MEDIUM |
| R-022 | Excessive parity exclusions | 2 | 3 | **6** | MEDIUM |

**Total risks:** 22  
**CRITICAL:** 2 (R-001, R-002)  
**HIGH:** 4 (R-003, R-004, R-005, R-012)  
**MEDIUM:** 16 (R-006 through R-022 excluding CRITICAL and HIGH)  
**LOW:** 0

All categories derived mechanically from L × I composite score. No category assigned by judgment.
