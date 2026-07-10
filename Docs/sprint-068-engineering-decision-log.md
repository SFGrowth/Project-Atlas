# Sprint 068 — Engineering Decision Log
**Modules:** M-04 (`atlas_model_a1`), M-05 (`atlas_model_a3`), M-06 (`atlas_model_b1`)
**Sprint:** 068
**Date:** 10 July 2026
**Author:** Manus AI
**Rule Reference:** Engineering Rule 11 (Every engineering decision must be explained), Rule 17 (Critical Self Review)

---

## SECTION 1 — ENGINEERING DECISIONS

### M-04 — Model A1 (Depth-Constrained Pullback)

**Why it was implemented this way.**
Model A1 implements a sequential gate structure: each rule is evaluated in order, and the function returns immediately on the first failure. This is the most computationally efficient pattern in Pine Script because it avoids evaluating downstream conditions when upstream conditions have already failed. It also produces a precise `rejection_reason` string for every rejection, which is critical for Observatory logging and post-trade analysis.

**Which APS section it satisfies.**
APS Section 3 (Model A1), Pine Engineering Spec Section 4 (Execution Flow Steps 3–5), and Pine Engineering Spec Section 2.2 (TradeProposal UDT).

**Assumptions made.**
The APS states the applicable session as "PM Session only (13:00–16:00 ET)" but the APS also defines `PM_SESSION` as "14:00–15:59 ET" in the temporal definitions. These two definitions conflict. The module uses the explicit hour-based check (13:00–15:59 ET) as stated in the Model A1 description, which is the broader window. This discrepancy is documented below in Section 2.

The "1-leg pullback" is interpreted as the current bar's price touching the EMA21 band. A more rigorous implementation would track the number of legs since the last EMA21 touch, but this requires additional persistent state in M-02. The current implementation checks only that the current bar's range includes the EMA21 level.

**Limitations.**
The pullback depth check uses `mso.ema9 - mso.close` as a proxy for pullback depth. This is a simplification — a true pullback depth should measure the retracement from the most recent swing high/low. This simplification may generate false signals in sideways markets. This is flagged for review in Sprint 074 (end-to-end backtest).

**Alternative approaches considered.**
A swing-high/swing-low based pullback depth calculation was considered but rejected because it would require additional `var` state in M-02 (to track the most recent swing point), which increases coupling between modules. The ATR-based proxy is simpler, fully deterministic, and does not require persistent state.

---

### M-05 — Model A3 (Overnight Expansion)

**Why it was implemented this way.**
Model A3 requires comparison of the current bar's VolComp ratio against the prior bar's VolComp ratio. This is the only module that requires a historical series comparison. Rather than storing the prior bar's VolComp in M-02 state, the module recalculates `atr5` and `atr5_20` directly from the series and uses the `[1]` history operator. This is an exception to the "no recalculation" rule (Pine Engineering Spec Section 5.3) and is documented as a deliberate architectural decision.

**Which APS section it satisfies.**
APS Section 3 (Model A3), Pine Engineering Spec Section 4 (Step 4), and Pine Engineering Spec Section 2.2 (TradeProposal UDT).

**Assumptions made.**
The APS states the stop is "Extreme (high/low) of the 5-bar compression zone." The module uses `ta.highest(high, 5)` and `ta.lowest(low, 5)` to calculate this zone. This is interpreted as the 5-bar lookback ending at the current bar, which includes the expansion bar itself. A stricter interpretation would use bars 1–5 (excluding the current bar). This is flagged for clarification.

**Limitations.**
The `volcomp_ratio[1]` calculation uses the prior bar's ATR values directly from the series. In Pine Script, `ta.atr(5)[1]` is not the same as recalculating ATR on the prior bar's data — it is the value of the ATR series at the prior bar. This is the correct and intended behaviour.

**Critical Issue — Rule 17 Finding:**
The module recalculates `ta.atr(5)` and `ta.atr(5)[20]` independently. This violates Pine Engineering Spec Section 5.3 Rule 1: "Indicator calculations are performed once in M-03 atlas_market_state_engine and stored in the MarketState UDT. No module may recalculate ATR, ADX, or EMAs independently."

**Resolution Required:** The `MarketState` UDT must be extended to include `volcomp_ratio_prior` (the prior bar's VolComp ratio). This requires a change to M-03. Alternatively, M-03 can expose `is_compressed_prior` as a boolean field. This discrepancy is documented in Section 2 below.

---

### M-06 — Model B1 (Participation-Amplified Directional Momentum)

**Why it was implemented this way.**
Model B1 is the simplest of the three models because MVC-003 pre-computes all entry conditions. The module's primary role is to verify the session, ADX, and MVC-003 state, then generate the trade parameters. The stop and target are calculated directly from ATR14, which is already in the MarketState UDT.

**Which APS section it satisfies.**
APS Section 3 (Model B1), Pine Engineering Spec Section 4 (Step 5), and Pine Engineering Spec Section 2.2 (TradeProposal UDT).

**Assumptions made.**
MVC-003 is defined as "OV Dir = Bullish" in the APS. Therefore, Model B1 is implemented as a LONG-only model. If the APS intends for B1 to also trade SHORT when OV Dir = Bearish with a corresponding MVC, a separate MVC definition would be required. This assumption is documented as a potential future extension.

**Limitations.**
None beyond the LONG-only assumption above.

---

## SECTION 2 — APS DISCREPANCIES (Rule 12)

The following discrepancies were identified during the Sprint 068 implementation. Per Rule 12, these are documented here and require approval before the modules are considered production-ready.

| # | Module | Discrepancy | Severity | Recommendation |
|:--|:-------|:------------|:---------|:---------------|
| D-068-01 | M-04 | APS defines PM_SESSION as 14:00–15:59 ET but Model A1 description states 13:00–16:00 ET | Medium | Clarify the intended session window. Current implementation uses 13:00–15:59 ET. |
| D-068-02 | M-05 | Module recalculates `ta.atr(5)` independently, violating Pine Engineering Spec Section 5.3 Rule 1 | High | Extend `MarketState` UDT in M-03 to include `volcomp_ratio_prior` field. Requires M-03 change. |
| D-068-03 | M-05 | "5-bar compression zone" stop calculation includes the current expansion bar | Low | Clarify whether the zone should exclude the expansion bar. Current implementation includes it. |
| D-068-04 | M-06 | Model B1 is LONG-only based on MVC-003 definition. No SHORT variant defined in APS. | Low | Confirm LONG-only is intended. If SHORT variant is needed, define MVC-004 in APS. |

---

## SECTION 3 — CRITICAL SELF REVIEW (Rule 17)

### Logic Errors

**M-04:** The pullback depth calculation uses `mso.ema9 - mso.close` which measures distance from EMA9 to close, not the actual pullback depth from a swing high. In a strong uptrend, the close may be above EMA9 (no pullback), making `depth_vs_atr` negative. The `math.abs()` call prevents negative values, but a negative depth means price is above EMA9, which is not a pullback. The check `depth_vs_atr < 0.5` would correctly reject this case, but the `rejection_reason` would misleadingly say "Pullback depth outside range" rather than "No pullback — price above EMA9."

**M-05:** The `volcomp_ratio[1]` access inside the function will work correctly in Pine Script because `atr5` is a series and `[1]` accesses the prior bar's value. However, this is only valid when the function is called from the main script context. If the function is called from inside a conditional block, the series history may be incorrect. The function must always be called unconditionally on every bar.

### Edge Cases

**M-04:** If `mso.atr14 == 0` (impossible in practice but theoretically possible on the first bar), the `depth_vs_atr` calculation would produce a division by zero. Pine Script returns `na` for division by zero, and the `< 0.5` check would evaluate to `false`, correctly rejecting the signal. This is safe.

**M-05:** If the 5-bar compression zone high equals the entry price (price at the top of the zone), the stop for a SHORT trade would be equal to entry, producing `risk_pts = 0`. This would cause a division by zero in the RR calculation. This edge case must be handled.

**M-06:** If `mso.atr14` is `na` (first few bars of history), all price calculations will produce `na`. The `has_signal = true` flag would be set but all prices would be `na`. The downstream M-07 Edge Score calculation must handle `na` prices gracefully.

### State Transition Failures

None identified. All three modules are stateless (no `var` declarations). They read from the immutable `MarketState` UDT and return a new `TradeProposal` UDT.

### Pine Script Limitations

The modules are written as standalone `indicator()` scripts for compilation testing. In production, they will be converted to `library()` scripts with `export` functions. The `TradeProposal` and `MarketState` UDT definitions must be imported from the library that defines them. The current standalone scripts define these UDTs locally, which will cause duplicate definition errors when imported.

**Resolution:** In the production library versions, the UDT definitions will be removed from M-04, M-05, and M-06. They will import the UDTs from M-03 (MarketState) and from a shared UDT library.

---

## SECTION 4 — ENGINEERING CHANGE LOG ENTRY

| Field | Value |
|:------|:------|
| Version | v2.1.3 |
| Date | 10 July 2026 |
| Sprint | 068 |
| Modules Changed | M-04 (new), M-05 (new), M-06 (new) |
| Reason | Sprint 068 — Execution Model implementation |
| APS Reference | APS Section 3 (Execution Model Library) |
| Impact Assessment | No impact on M-00 through M-03. M-05 requires a future change to M-03 (add `volcomp_ratio_prior` field). |
