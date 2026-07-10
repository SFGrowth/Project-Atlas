# Atlas APS Discrepancy Resolution Report
**Sprint:** 078  
**Date:** 10 July 2026  
**Author:** Manus AI  
**Status:** Formal Recommendations — Awaiting Approval

This report resolves all discrepancies identified in the Sprint 066/067 APS Discrepancy Register, plus two additional discrepancies discovered during the Sprint 078 deep audit. Each resolution includes a formal recommendation and a specific action required.

---

## Discrepancy 1: `MarketState` UDT Field Count (40 vs 56)

**Source of Conflict.** The Atlas Production Specification v1.0 states in two places that the Market State Object (MSO) contains "56 specific fields." The Pine Engineering Specification (Sprint 065) defines exactly 41 fields across 8 categories. The M-03 implementation contains 43 fields (the Pine Spec's 41, plus `ov_high` and `ov_low` which were added during implementation for completeness).

**Root Cause Analysis.** The "56-field" claim in the APS appears to be an aspirational count written during the high-level architecture phase, before the field-by-field Pine Engineering Spec was produced. No document in the Atlas corpus enumerates 56 distinct MSO fields. The most likely explanation is that the original count included fields that were later moved into downstream UDTs (`TradeProposal`, `CandidateModel`, `ApprovedTrade`, `VerifiedSignal`).

**Formal Recommendation.** The Pine Engineering Specification field list is the canonical source of truth for the MSO structure, as it is the most detailed and most recently produced document. The APS should be updated to reflect the actual field count. The M-03 implementation adds `ov_high` and `ov_low` beyond the Pine Spec — these are legitimate additions that improve downstream model accuracy and should be ratified.

**Proposed Canonical Field Count:** 43 fields (41 Pine Spec fields + `ov_high` + `ov_low`).

**Required Action:** Update APS Section 2 to read "43-field immutable snapshot." Update Pine Engineering Spec Section 2.1 to include `ov_high` and `ov_low`. No changes to M-03 code are required.

---

## Discrepancy 2: Session Naming Convention

**Source of Conflict.** The APS defines 7 session classifications: `PRE_MARKET`, `AM_OPEN`, `AM_SESSION`, `MID_SESSION`, `PM_SESSION`, `AFTER_HOURS`, and `OVERNIGHT`. The M-01 utility function `f_get_session_name()` returns only 5 classifications: `PRE_MARKET` is mapped to `OVERNIGHT`, and `AM_OPEN` is merged into `AM_SESSION`.

**Root Cause Analysis.** The consolidation was a deliberate simplification made during M-01 implementation to reduce string-matching complexity in execution models. However, this creates a silent discrepancy: the Observatory will log `OVERNIGHT` for bars that are actually in the `PRE_MARKET` window (04:00–09:29 ET), and `AM_SESSION` for bars in the `AM_OPEN` window (09:30–10:00 ET).

**Formal Recommendation.** The APS 7-session classification is the correct canonical standard. The `AM_OPEN` window is architecturally significant — it is the first 30 minutes of RTH and has distinct liquidity characteristics. Merging it with `AM_SESSION` loses this granularity in Observatory logs. M-01 and M-03 must both return all 7 APS session strings.

**Required Action:** Update `f_get_session_name()` in M-01 to return `PRE_MARKET` for 04:00–09:29 ET and `AM_OPEN` for 09:30–10:00 ET. Update M-03 `f_classify_session()` to match. This is a breaking change to M-01 and M-03 that must be implemented before M-04 through M-06 are written.

---

## Discrepancy 3: M-01 Verification Table State

**Source of Conflict.** The Pine Engineering Spec classifies M-01 as "Pure utility functions. No state." However, lines 411–428 of the current M-01 implementation declare a `var table` and render a verification UI panel.

**Root Cause Analysis.** The verification table was added to facilitate visual confirmation of module compilation in TradingView during Sprint 066. It was always intended as a temporary scaffold.

**Formal Recommendation.** The verification table should be retained for Sprint 066/067 verification purposes, then removed before M-01 is integrated into M-14. The table should be wrapped in a `DEBUG_MODE` constant so it can be cleanly disabled without code deletion.

**Required Action:** Wrap the verification table block in `if DEBUG_MODE` where `DEBUG_MODE = false` in production. Schedule removal for Sprint 074 integration sprint.

---

## Discrepancy 4: `v_equity_peak` Hard-Coded Initialisation

**Source of Conflict.** M-02 initialises `var float v_equity_peak = 100000.0`. The APS does not specify a default starting capital value; it specifies that ARI Rule R6 triggers when drawdown from peak exceeds $5,000.

**Root Cause Analysis.** Pine Script requires `var` float declarations to have an initial value. The value `100000.0` was chosen as a reasonable default for a $100k funded account. However, if the live account has a different starting capital, the drawdown calculation will be incorrect until the first profitable trade establishes a new peak.

**Formal Recommendation.** This is an acceptable Pine Script initialisation constraint. The value `100000.0` should be replaced with `input.float(100000.0, "Starting Capital", group="Account")` so the operator can configure it via the TradingView settings UI. M-14 will additionally override `v_equity_peak` with `strategy.initial_capital` on the first bar.

**Required Action:** Update M-02 to use `input.float` for starting capital. Add this as a configuration parameter to M-00 for consistency.

---

## Discrepancy 5 (New): `MarketState` Field Naming Inconsistency

**Source of Conflict.** The Pine Engineering Spec uses field names `close`, `high`, `low`, `open`, `volume` for the Price category. The M-03 implementation uses `bar_close`, `bar_high`, `bar_low`, `bar_open`, `bar_volume`.

**Root Cause Analysis.** The `bar_*` prefix was added during implementation to avoid shadowing Pine Script's built-in variables (`close`, `high`, `low`, `open`, `volume`). This was a sound engineering decision that was not reflected back into the Pine Engineering Spec.

**Formal Recommendation.** The `bar_*` prefix convention is superior because it avoids ambiguity when reading downstream model code. A field named `ms.close` could be confused with the built-in `close`; `ms.bar_close` is unambiguous. The Pine Engineering Spec should be updated to use `bar_*` names.

**Required Action:** Update Pine Engineering Spec Section 2.1 to use `bar_close`, `bar_high`, `bar_low`, `bar_open`, `bar_volume`. No changes to M-03 code are required.

---

## Discrepancy 6 (New): Overnight Fields Incomplete in Pine Spec

**Source of Conflict.** The Pine Engineering Spec defines 5 overnight fields: `ov_range_pts`, `ov_range_vs_atr14`, `ov_direction`, `ov_close`, `ov_open`. The M-03 implementation correctly adds `ov_high` and `ov_low`, which are necessary for Model A3's compression zone stop calculation.

**Root Cause Analysis.** The Pine Spec was written before Model A3's stop methodology was fully specified. A3 requires the overnight session high and low to define the compression zone boundary.

**Formal Recommendation.** `ov_high` and `ov_low` are required fields. They must be added to the Pine Engineering Spec.

**Required Action:** Update Pine Engineering Spec Section 2.1 to include `ov_high` and `ov_low` in the Overnight category. No changes to M-03 code are required.

---

## Summary Table

| # | Module | Discrepancy | Recommendation | Action Required |
| :--- | :--- | :--- | :--- | :--- |
| 1 | M-03 / APS | 40 vs 56 field count | Ratify 43 fields as canonical | Update APS + Pine Spec |
| 2 | M-01 / M-03 | Session naming (5 vs 7 sessions) | Enforce all 7 APS sessions | Update M-01 + M-03 code |
| 3 | M-01 | `var table` in stateless module | Wrap in `DEBUG_MODE` flag | Update M-01 code |
| 4 | M-02 | Hard-coded `v_equity_peak` | Use `input.float` | Update M-02 + M-00 |
| 5 | M-03 / Pine Spec | `bar_*` vs bare field names | Ratify `bar_*` prefix | Update Pine Spec only |
| 6 | M-03 / Pine Spec | Missing `ov_high`, `ov_low` | Add to Pine Spec | Update Pine Spec only |
