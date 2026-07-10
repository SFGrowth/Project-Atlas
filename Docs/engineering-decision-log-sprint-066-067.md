# Atlas Engineering Decision Log
**Sprints:** 066, 067  
**Modules:** M-00, M-01, M-02, M-03  
**Date:** 10 July 2026  
**Author:** Manus AI  

This document satisfies **Rule 11: Every engineering decision must be explained.**

---

## M-00: Atlas Configuration (`atlas_config`)

### Decision 1: Pure Input Module
*   **Why:** To establish a single, unambiguous source of truth for all configurable parameters. Mixing logic with configuration risks parameter shadowing and hard-coded drift.
*   **APS Section:** Section 9 — Configuration Parameters.
*   **Assumptions:** All modules downstream will read these values without modification.
*   **Limitations:** Pine Script requires `input.*` calls to be at the root scope of an `indicator()` or `strategy()` script; they cannot be cleanly encapsulated inside a `library()` if they are to populate the TradingView settings UI.
*   **Alternatives Considered:** Hard-coding defaults inside M-02. Rejected as it violates APS Section 9.

## M-01: Atlas Utilities (`atlas_utils`)

### Decision 2: Stateless Pure Functions
*   **Why:** To ensure deterministic execution. Utility functions (math, formatting, time conversions) must return identical outputs for identical inputs regardless of execution context or bar history.
*   **APS Section:** Section 1.1 — Module Registry (Pure utility functions. No state).
*   **Assumptions:** None.
*   **Limitations:** Cannot track historical data or compute moving averages.
*   **Alternatives Considered:** Allowing `var` state for performance caching. Rejected as it violates the pure-function mandate and risks hidden state bugs.

### Decision 3: `f_get_session_name` Consolidation
*   **Why:** The function returns `AM_SESSION` instead of `AM_OPEN` for the 09:30-10:00 ET window, and returns `OVERNIGHT` for `PRE_MARKET`. This simplifies the string-matching logic for downstream models that only care about the macro session blocks.
*   **APS Section:** Section 2.1 — Temporal Definitions.
*   **Assumptions:** Execution models only require macro session resolution.
*   **Limitations:** Loss of granularity in string logs.
*   **Alternatives Considered:** Returning exact APS string literals. Rejected for performance/simplicity, though this is a documented discrepancy (see Discrepancy Register).

## M-02: Atlas State Manager (`atlas_state_manager`)

### Decision 4: Centralised `var` State
*   **Why:** Pine Script libraries cannot use `var` variables in their exported functions. To maintain modularity while supporting state, all persistent state is declared centrally in M-02 and passed as immutable UDTs to other modules.
*   **APS Section:** Section 1.1 — Module Registry.
*   **Assumptions:** M-14 `atlas_core` will call M-02 exactly once per bar to update state.
*   **Limitations:** M-02 is tightly coupled to the execution frequency of M-14.
*   **Alternatives Considered:** Distributing `var` declarations across modules. Rejected due to Pine Script library limitations and Rule 16 (traceability).

### Decision 5: `strategy.equity` Dependency
*   **Why:** Risk rules (R6 Drawdown Reduction) require accurate equity tracking.
*   **APS Section:** Section 5.1 — The 8 Capital Protection Rules.
*   **Assumptions:** M-14 will run as a `strategy()` script and pass `strategy.equity` to M-02.
*   **Limitations:** M-02 cannot be fully tested as a standalone `indicator()` without mocking equity.
*   **Alternatives Considered:** Manually calculating equity from P&L. Rejected as it ignores broker fees, slippage, and starting capital defined in the TradingView UI.

## M-03: Atlas Market State Engine (`atlas_market_state_engine`)

### Decision 6: 40-Field `MarketState` UDT
*   **Why:** The UDT was implemented with 40 fields rather than the 56 fields stated in the APS overview. The 40 fields cover all explicit requirements defined in APS Sections 2.1, 2.2, 2.3, and 2.4. The "56-field" claim in the APS overview appears to be a historical artifact or includes downstream ADE/ARI fields.
*   **APS Section:** Section 2 — Market State Engine.
*   **Assumptions:** The explicit field definitions in the Pine Engineering Spec (Section 2.1) override the summary text in the APS.
*   **Limitations:** If downstream models expect the missing 16 fields, they will fail to compile.
*   **Alternatives Considered:** Padding the UDT with 16 dummy fields. Rejected as it violates Rule 15 (Simplest to understand).

### Decision 7: Standalone Verification Block
*   **Why:** To allow M-03 to be compiled and visually verified in TradingView independently of M-14 and M-02.
*   **APS Section:** Section 10 — Pine Script Implementation Plan.
*   **Assumptions:** The verification block will be stripped or disabled via `if i_debug_mode` in production.
*   **Limitations:** Introduces local `var` variables into a file that is architecturally supposed to be stateless.
*   **Alternatives Considered:** Building a separate test script. Rejected for initial verification speed, though a separate test script is the correct long-term architecture.
