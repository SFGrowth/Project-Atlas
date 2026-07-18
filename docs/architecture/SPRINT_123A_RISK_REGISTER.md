# Sprint 123A Risk Register
**Document type:** Architecture Reference  
**Sprint:** 123A  
**Status:** ACTIVE — update after each sub-sprint  
**Date:** 2026-07-18

---

## Overview

This register records every identified risk for Sprint 123A. Each risk is assessed for likelihood, impact, and mitigation. The register is updated after each sub-sprint gate review. Risks that materialise are promoted to incidents and tracked separately.

**Risk scoring:** Likelihood and Impact are scored 1–5. Risk Score = Likelihood × Impact.

---

## Active Risks

### R-001 — Databento API Key Exposure

| Field | Value |
|---|---|
| **Risk** | `DATABENTO_API_KEY` leaks into logs, SSE payloads, database rows, error responses, or browser bundles |
| **Likelihood** | 3 (Possible — requires careful implementation) |
| **Impact** | 5 (Critical — API key compromise, account suspension, financial data exposure) |
| **Risk Score** | 15 |
| **Category** | Security |
| **Mitigation** | Secret scanning tests required in Sprint 123A.2. Key stored only in environment variables. Bridge authentication uses a separate `BRIDGE_AUTH_TOKEN`. Python service never logs the key. TypeScript server never forwards the key to any client-facing endpoint. |
| **Residual Likelihood** | 1 |
| **Residual Score** | 5 |
| **Owner** | Sprint 123A.2 |
| **Status** | OPEN |

---

### R-002 — Production processBar() Triggered from Databento Path

| Field | Value |
|---|---|
| **Risk** | A Databento canonical bar accidentally triggers `processBar()`, causing a duplicate trade signal in paper trading |
| **Likelihood** | 3 (Possible — requires explicit gate in canonical router) |
| **Impact** | 5 (Critical — duplicate trades, incorrect P&L, prop-firm rule violation) |
| **Risk Score** | 15 |
| **Category** | Execution Safety |
| **Mitigation** | `MARKET_DATA_AUTHORITY` flag gates every dispatch path. `DATABENTO_SHADOW` mode explicitly prohibits calling `processBar()`. Canonical router checks authority flag before every consumer dispatch. Integration test verifies no `processBar()` call from Databento path in shadow mode. |
| **Residual Likelihood** | 1 |
| **Residual Score** | 5 |
| **Owner** | Sprint 123A.3 |
| **Status** | OPEN |

---

### R-003 — Duplicate onNewBarObservation() Calls

| Field | Value |
|---|---|
| **Risk** | `onNewBarObservation()` is called from both `postBarAutomation` (TradingView path) and `CanonicalBarConfirmed` (Databento path) simultaneously, corrupting DARWIN research state |
| **Likelihood** | 3 (Possible during authority transition) |
| **Impact** | 4 (High — DARWIN research contaminated with duplicate observations) |
| **Risk Score** | 12 |
| **Category** | Data Integrity |
| **Mitigation** | `postBarAutomation.ts` checks `MARKET_DATA_AUTHORITY` before calling `onNewBarObservation()`. In `DATABENTO_LEARNING_AUTHORITY` mode, TradingView trigger is disabled. Consumer processing ledger prevents duplicate processing. |
| **Residual Likelihood** | 1 |
| **Residual Score** | 4 |
| **Owner** | Sprint 123A.5 |
| **Status** | OPEN |

---

### R-004 — Unresolved Minute Silently Aggregated into 5-Min Bar

| Field | Value |
|---|---|
| **Risk** | A 5-minute bar containing an `UNRESOLVED` minute is confirmed and dispatched to production consumers |
| **Likelihood** | 2 (Unlikely — requires explicit check to be missing) |
| **Impact** | 4 (High — incorrect bar data drives strategy decisions) |
| **Risk Score** | 8 |
| **Category** | Data Quality |
| **Mitigation** | 5-min aggregator checks all 5 constituent minutes before confirming. `containsUnresolvedMinutes = true` blocks production dispatch. Hard error if dispatch attempted. |
| **Residual Likelihood** | 1 |
| **Residual Score** | 4 |
| **Owner** | Sprint 123A.3 |
| **Status** | OPEN |

---

### R-005 — Contract Roll Missed

| Field | Value |
|---|---|
| **Risk** | A contract roll occurs but is not detected, causing bars from the new contract to be attributed to the old contract |
| **Likelihood** | 2 (Unlikely — Databento `SymbolMappingMsg` is reliable) |
| **Impact** | 4 (High — incorrect price continuity, incorrect strategy signals) |
| **Risk Score** | 8 |
| **Category** | Data Quality |
| **Mitigation** | Contract Roll Manager monitors `SymbolMappingMsg`, `InstrumentDefMsg`, and instrument_id changes in `trades` records. Three independent detection mechanisms. Alert on any anomaly. |
| **Residual Likelihood** | 1 |
| **Residual Score** | 4 |
| **Owner** | Sprint 123A.3 |
| **Status** | OPEN |

---

### R-006 — Bridge Port Exposed Externally

| Field | Value |
|---|---|
| **Risk** | The bridge WebSocket port `7890` is exposed in a firewall rule or reverse proxy, allowing unauthenticated external access |
| **Likelihood** | 2 (Unlikely in Manus webdev — but must be verified) |
| **Impact** | 4 (High — market data injection, denial of service) |
| **Risk Score** | 8 |
| **Category** | Security |
| **Mitigation** | Bridge binds to `127.0.0.1` only. Bridge authentication required. Deployment topology documentation explicitly prohibits external exposure. Security review required before Sprint 123A.2 deployment. |
| **Residual Likelihood** | 1 |
| **Residual Score** | 4 |
| **Owner** | Sprint 123A.2 |
| **Status** | OPEN |

---

### R-007 — Legacy Behaviour System Retired Prematurely

| Field | Value |
|---|---|
| **Risk** | The legacy 7-behaviour system is disabled before the canonical system is certified, causing a gap in DARWIN's behaviour tracking |
| **Likelihood** | 2 (Unlikely — requires explicit Phil approval) |
| **Impact** | 3 (Medium — DARWIN research quality degraded temporarily) |
| **Risk Score** | 6 |
| **Category** | Research Continuity |
| **Mitigation** | Legacy system is never disabled without Phil's explicit approval. `LEGACY_BEHAVIOUR_ENABLED` flag defaults to `true`. Certification criteria require 20 trading days of shadow data and 95% agreement rate. |
| **Residual Likelihood** | 1 |
| **Residual Score** | 3 |
| **Owner** | Post-123A.5 |
| **Status** | OPEN |

---

### R-008 — Python Service Memory Leak

| Field | Value |
|---|---|
| **Risk** | The Python Databento feed service accumulates memory over time and is killed by the container OOM killer |
| **Likelihood** | 2 (Possible — Python processes with long-running connections can accumulate) |
| **Impact** | 3 (Medium — feed goes offline; recoverable but causes data gaps) |
| **Risk Score** | 6 |
| **Category** | Reliability |
| **Mitigation** | Memory profiling in Sprint 123A.2. Bounded queues. Periodic health checks. Auto-restart on OOM. |
| **Residual Likelihood** | 2 |
| **Residual Score** | 6 |
| **Owner** | Sprint 123A.2 |
| **Status** | OPEN |

---

### R-009 — Parity Below 99.9% at Chart Authority Gate

| Field | Value |
|---|---|
| **Risk** | TradingView/Databento bar parity falls below 99.9% over the 5-day certification window, blocking the Chart Authority gate |
| **Likelihood** | 3 (Possible — TradingView bars may differ due to webhook timing or Pine Script calculation differences) |
| **Impact** | 2 (Low — gate delayed; no production impact) |
| **Risk Score** | 6 |
| **Category** | Certification |
| **Mitigation** | Parity monitor identifies specific discrepancy types. Known acceptable differences (e.g. VWAP calculation method) are documented and excluded from parity scoring. Gate criteria are reviewed if systematic differences are found. |
| **Residual Likelihood** | 2 |
| **Residual Score** | 4 |
| **Owner** | Sprint 123A.4 |
| **Status** | OPEN |

---

### R-010 — Sprint 123A Too Large to Complete in One Sprint

| Field | Value |
|---|---|
| **Risk** | The five sub-sprints collectively take longer than expected, blocking other Atlas work |
| **Likelihood** | 4 (Likely — this is a large infrastructure sprint) |
| **Impact** | 2 (Low — sub-sprints are independently releasable; each delivers value) |
| **Risk Score** | 8 |
| **Category** | Delivery |
| **Mitigation** | Sub-sprints are independently releasable. 123A.1 (Foundation) is the only blocker for all other work. Each sub-sprint can be paused and resumed. DARWIN and other Atlas work continues during sub-sprint gaps. |
| **Residual Likelihood** | 4 |
| **Residual Score** | 8 |
| **Owner** | Phil (scope management) |
| **Status** | OPEN |

---

## Closed Risks

| Risk ID | Description | Closed Date | Resolution |
|---|---|---|---|
| — | No risks closed yet | — | — |

---

## Risk Summary

| Score Range | Count | Risks |
|---|---|---|
| 12–25 (Critical) | 2 | R-001, R-002 |
| 8–11 (High) | 3 | R-003, R-004, R-010 |
| 5–7 (Medium) | 4 | R-005, R-006, R-007, R-008 |
| 1–4 (Low) | 1 | R-009 |
