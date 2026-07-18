# Sprint 123A Amendment Report
**Document type:** Architecture Reference  
**Sprint:** 123A  
**Status:** FINAL  
**Date:** 2026-07-18

---

## Overview

This report records all 15 amendments to the original Sprint 123A implementation plan. Each amendment includes the original claim, the finding that disproved or required correction of the claim, the resolution adopted, and the document that records the resolution.

---

## Amendment 1 — Python Service Owns Only Normalisation, Not Candle Construction

**Original claim:** Python service builds `bar_builder.py` and `five_min_aggregator.py` to construct OHLCV bars.

**Finding:** The existing TypeScript codebase has a complete, tested DBN binary parser, event normaliser, and event bus. The architecture design documents specify TypeScript as the canonical data layer. Moving candle construction to Python would split the canonical data layer across two languages, complicate the effective-once processing model, and require Python to perform session logic, reconciliation, and aggregation that are deeply integrated with TypeScript types.

**Resolution:** Python owns only raw record normalisation and publication to the bridge. TypeScript owns all candle construction, reconciliation, aggregation, and persistence. `bar_builder.py` and `five_min_aggregator.py` are removed from scope.

**Recorded in:** `SPRINT_123A_AMENDED_IMPLEMENTATION_PLAN.md` §6, `DATABENTO_DEPLOYMENT_TOPOLOGY.md`

---

## Amendment 2 — DATABENTO_SHADOW Does Not Disable TradingView processBar()

**Original claim:** In `DATABENTO_SHADOW` mode, TradingView stops calling `processBar()`.

**Finding:** This is incorrect and dangerous. `processBar()` is the production execution trigger for all paper trading strategies (A1, A3, B1, SB1, ORB-1). Disabling it in shadow mode would halt all paper trading while Databento is being validated. This is not the intent of shadow mode.

**Resolution:** In `DATABENTO_SHADOW` mode, TradingView continues calling `processBar()` unchanged. Databento records are normalised, persisted, and compared — but cannot trigger any production processing. The authority model is documented in the Authority Matrix.

**Recorded in:** `SPRINT_123A_AMENDED_IMPLEMENTATION_PLAN.md` §4, `ATLAS_DATA_SOURCE_AUTHORITY_MATRIX.md`

---

## Amendment 3 — Effectively-Once, Not Exactly-Once

**Original claim:** The system provides "exactly-once processing."

**Finding:** Exactly-once processing is not achievable with at-least-once delivery without distributed transactions. Atlas does not use distributed transactions. Claiming exactly-once is dishonest and creates false confidence.

**Resolution:** All claims are corrected to "effectively-once" with documented delivery guarantees, durable canonical event IDs, idempotent consumers, and a consumer-processing ledger. The distinction is explained in the dedicated document.

**Recorded in:** `ATLAS_EFFECTIVELY_ONCE_PROCESSING.md`

---

## Amendment 4 — Single postBarAutomation Service, Not setImmediate in liveLearnEngine

**Original claim:** G-001 fix is a single `setImmediate` call in `liveLearnEngine.ts`.

**Finding:** Adding `setImmediate` directly in `liveLearnEngine.ts` creates a risk of duplicate `onNewBarObservation()` calls when the authority transitions to Databento. `liveLearnEngine` would still call it from the TradingView path, and the canonical router would call it from the Databento path simultaneously.

**Resolution:** A dedicated `server/automation/postBarAutomation.ts` service owns all non-execution post-bar autonomous processing. It checks `MARKET_DATA_AUTHORITY` before calling `onNewBarObservation()`. The trigger source is controlled exclusively by the authority flag.

**Recorded in:** `SPRINT_123A_AMENDED_IMPLEMENTATION_PLAN.md` §11

---

## Amendment 5 — No Fake BDE Stub

**Original claim:** Create `server/bdeEngine.ts` as a stub with placeholder implementations.

**Finding:** Creating a stub that pretends to implement missing functionality is dishonest and misleading. It would cause the Observatory dashboard to display false capability status. It would also create technical debt that is harder to remove than to never create.

**Resolution:** No fake implementation. A `BDE_CAPABILITY_STATUS.md` document records the verified absence of each claimed function. A runtime capability registry endpoint is proposed (not required for 123A.1) that reports honest status.

**Recorded in:** `BDE_CAPABILITY_STATUS.md`

---

## Amendment 6 — trades Schema, Not mbp-1

**Original claim:** Use `mbp-1` schema because the existing normaliser was built for it.

**Finding:** The amendment directive explicitly requires `trades` schema for Sprint 123A. The `mbp-1` path is retained for future use but is not activated in Sprint 123A.

**Resolution:** The event normaliser is extended to support `trades` records. `DATABENTO_TRADES_SCHEMA=trades` is the default. `DATABENTO_BOOK_SCHEMA=mbp-1` is reserved with `DATABENTO_BOOK_ENABLED=false`.

**Recorded in:** `SPRINT_123A_AMENDED_IMPLEMENTATION_PLAN.md` §18

---

## Amendment 7 — Dual atlas_bar_confirmed Emitters Gated by Authority Flag

**Original claim:** Sprint 123A adds `atlas_bar_confirmed` emission from the canonical router without addressing the Sprint 123 emission from the TradingView webhook path.

**Finding:** Two separate emitters for `atlas_bar_confirmed` would cause the chart to receive duplicate events and display duplicate candles.

**Resolution:** The Sprint 123 webhook emission is gated by `MARKET_DATA_AUTHORITY === TRADINGVIEW_ONLY`. When authority advances to `DATABENTO_CHART_AUTHORITY`, the canonical router owns this event exclusively and the webhook emission is disabled.

**Recorded in:** `SPRINT_123A_AMENDED_IMPLEMENTATION_PLAN.md` §3 (Conflict 4)

---

## Amendment 8 — Databento Continuous Symbol as Primary Contract Resolution

**Original claim:** Contract resolution uses local volume crossover and expiry calculations as the primary roll rule.

**Finding:** Databento provides continuous-symbol mapping (`MNQ1!`) and `SymbolMappingMsg` records that are the authoritative source for which contract is the current front month. Local calculations are unreliable as a primary source.

**Resolution:** Databento symbol mapping is the primary contract-resolution source. Local volume crossover and expiry calculations are validation and anomaly detection only.

**Recorded in:** `DATABENTO_CONTRACT_MAPPING_AND_ROLL_POLICY.md`

---

## Amendment 9 — Three Distinct Gap Cases, Not One Policy

**Original claim:** A single "gap recovery" policy handles all missing bars.

**Finding:** Three fundamentally different cases exist (confirmed no-trade, scheduled close, feed uncertainty) with different causes, resolution paths, and persistence outcomes. Conflating them leads to incorrect bar synthesis.

**Resolution:** Three distinct cases are defined with explicit conditions, actions, and persistence outcomes. `UNRESOLVED` minutes are never silently aggregated.

**Recorded in:** `DATABENTO_NO_TRADE_AND_GAP_POLICY.md`

---

## Amendment 10 — Legacy Behaviour System Not Retired in Sprint 123A

**Original claim:** The legacy 7-behaviour system is replaced by the canonical 12-classifier system in Sprint 123A.

**Finding:** The legacy system uses 7 ad-hoc indicator-derived behaviour IDs that are not mappable to the 12 canonical `BehaviourId` values. 4 of 7 legacy behaviours are unmappable. A shadow comparison period of at least 20 trading days is required before certification.

**Resolution:** Both systems run in parallel throughout Sprint 123A. A migration adapter produces shadow comparison records. The legacy system is never disabled without Phil's explicit approval after certification criteria are met.

**Recorded in:** `BEHAVIOUR_SYSTEM_MIGRATION_PLAN.md`

---

## Amendment 11 — Five Sub-Sprints, Not One Sprint

**Original claim:** Sprint 123A is a single sprint.

**Finding:** The original plan covered infrastructure, Python service, bar building, canonical router, live chart, autonomy remediation, parity service, and documentation. This is too large to implement safely as a single sprint without intermediate validation gates.

**Resolution:** Split into five independently releasable sub-sprints (123A.1 through 123A.5). Each sub-sprint has a gate that requires Phil's approval before the next begins.

**Recorded in:** `SPRINT_123A_AMENDED_IMPLEMENTATION_PLAN.md` §15

---

## Amendment 12 — BDE G-006 Claim Disproved

**Original claim:** `computeMarketIntent()`, `runBehaviourClustering()`, `buildPortfolioCoverageMap()`, and `runStrategyInteractionAnalysis()` are imported from `bdeEngine.ts` in `scheduledJobs.ts` lines 55–57.

**Finding:** Source-code search found no import of any of these functions anywhere in the codebase. `server/bdeEngine.ts` does not exist. The verification document's claim was based on an earlier version of the codebase.

**Resolution:** The claim is disproved and documented. No fake implementation is created. `BDE_CAPABILITY_STATUS.md` records the honest status.

**Recorded in:** `BDE_CAPABILITY_STATUS.md`, `SPRINT_123A_AMENDED_IMPLEMENTATION_PLAN.md` §2.6

---

## Amendment 13 — Canonical Event ID Specification Added

**Original claim:** The plan did not specify a durable canonical event ID format.

**Finding:** Without a durable canonical event ID, consumer idempotency keys cannot be constructed, the consumer processing ledger cannot function, and replay cannot be implemented correctly.

**Resolution:** `CanonicalEventId` interface specified with 8 fields. Serialised form defined. Consumer idempotency key pattern defined. All consumers must use this pattern.

**Recorded in:** `ATLAS_CANONICAL_MARKET_EVENT_CONTRACTS.md`

---

## Amendment 14 — AtlasLiveChart.tsx Does Not Replace LiveChart.tsx

**Original claim:** `AtlasLiveChart.tsx` replaces `LiveChart.tsx`.

**Finding:** `LiveChart.tsx` is the current production chart component driven by TradingView SSE events. Replacing it before Databento chart authority is certified would break the live chart for all users.

**Resolution:** `AtlasLiveChart.tsx` is built alongside `LiveChart.tsx`. `LiveChart.tsx` remains as the active chart until `DATABENTO_CHART_AUTHORITY` gate is passed. After the gate, `AtlasLiveChart.tsx` becomes the active chart and `LiveChart.tsx` is retained as a fallback.

**Recorded in:** `SPRINT_123A_AMENDED_IMPLEMENTATION_PLAN.md` §3 (Conflict 2)

---

## Amendment 15 — Documentation-First, No Production Code Before Plan Approval

**Original claim (implicit):** Implementation can begin immediately after the plan is written.

**Finding:** The amendment directive explicitly states: "Do not begin by writing code. First inspect the complete current repository." The plan must be reviewed and approved by Phil before any implementation begins.

**Resolution:** This entire document set is the documentation-first deliverable. No production code, no migrations, no Databento connection. Implementation begins only after Phil approves Gate G0.

**Recorded in:** `SPRINT_123A_AMENDED_IMPLEMENTATION_PLAN.md` §24, `SPRINT_123A_GATE_MATRIX.md` Gate G0
