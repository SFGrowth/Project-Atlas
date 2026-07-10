# Atlas APS Discrepancy Register
**Sprints:** 066, 067  
**Date:** 10 July 2026  
**Author:** Manus AI  

This document satisfies **Rule 12: Never silently fix or change behaviour. Document the discrepancy. Explain why. Request approval.**

---

## Discrepancy 1: `MarketState` UDT Field Count
*   **Module:** M-03 (`atlas_market_state_engine`)
*   **APS Reference:** Section 2 Overview ("computes a 56-field immutable snapshot") vs Pine Engineering Spec Section 2.1 (defines exactly 40 fields).
*   **Implementation:** The UDT is implemented with exactly 40 fields.
*   **Reason:** The detailed field-by-field specification in the Pine Engineering Spec only defines 40 fields across 8 categories. The "56-field" claim in the APS overview is a discrepancy.
*   **Impact:** Downstream modules expecting 56 fields will fail.
*   **Approval Request:** Requesting formal approval to ratify the 40-field UDT as the source of truth, or requesting the definitions for the missing 16 fields.

## Discrepancy 2: Session Name Consolidation
*   **Module:** M-01 (`atlas_utils`)
*   **APS Reference:** Section 2.1 defines 7 session classifications including `PRE_MARKET` and `AM_OPEN`.
*   **Implementation:** `f_get_session_name()` returns `OVERNIGHT` for the `PRE_MARKET` period, and `AM_SESSION` for the `AM_OPEN` period.
*   **Reason:** Simplification of string matching for execution models that only evaluate macro sessions.
*   **Impact:** String-based session logs in the Observatory will lack `PRE_MARKET` and `AM_OPEN` granularity.
*   **Approval Request:** Requesting approval to maintain consolidated session strings, or instruction to revert to strict 7-state APS compliance.

## Discrepancy 3: M-01 Verification Table State
*   **Module:** M-01 (`atlas_utils`)
*   **APS Reference:** Pine Engineering Spec Section 1.1 ("Pure utility functions. No state.")
*   **Implementation:** Lines 411-428 declare a `var table` and execute side-effects to render a verification UI.
*   **Reason:** Included to facilitate visual verification of module compilation in TradingView.
*   **Impact:** Violates the strict "no state" architectural rule for M-01.
*   **Approval Request:** Requesting approval to retain the table for Sprint 066 verification, with the commitment to strip it prior to Sprint 074 integration.

## Discrepancy 4: M-02 Initial Capital Default
*   **Module:** M-02 (`atlas_state_manager`)
*   **APS Reference:** Pine Engineering Spec Section 9 (No hard-coded production values).
*   **Implementation:** Line 168: `var float v_equity_peak = 100000.0`.
*   **Reason:** Pine Script requires initialisation of `var` floats.
*   **Impact:** If the live account starting capital is not exactly $100,000, the drawdown calculation (R6) will be incorrect until explicitly overridden.
*   **Approval Request:** Requesting approval for the default, pending dynamic initialisation from `strategy.initial_capital` in M-14.
