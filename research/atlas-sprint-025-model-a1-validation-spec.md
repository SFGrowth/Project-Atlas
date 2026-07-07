# Atlas Research Specification: Sprint 025 — Execution Model Validation

## 1. Context and Objective

**Research Stream:** B — Execution Intelligence
**Sprint:** 025
**Status:** Planned

In Sprint 024, Atlas discovered its first statistically validated execution model. By combining a Volatility Expansion structural component (C-STR-001) with a Depth-Constrained Pullback trigger (C-TRG-001), the model achieved a Profit Factor of 1.387 over a 2-year dataset.

This configuration is now frozen as **Atlas Execution Model A1 (Candidate)**.

The objective of Sprint 025 is not to improve the model. The objective is to attempt to break it. The model has earned validation; it must now earn trust.

## 2. The Frozen Configuration: Model A1 (Candidate)

- **Structural Condition:** Volatility Expansion (`ATR(5) / ATR(5)[20] > 1.8`)
- **Trend Alignment:** EMA9/21/50 stack alignment
- **Trigger:** Touch/cross of EMA21
- **Depth Constraint:** Distance from recent 10-bar swing extreme to current close must be between `0.5 and 1.2 * ATR(14)`
- **Structure:** 1-leg pullback
- **Timeframe:** 5-minute MNQ
- **Risk/Reward:** 1:2 (Stop = 1.0 ATR, Target = 2.0 ATR)

*No parameters may be altered from this baseline.*

## 3. Validation Tests

The validation harness will subject Model A1 to the following independent stress tests:

**Test 1: Slippage & Commission Stress**
- *Hypothesis:* The edge survives real-world friction.
- *Method:* Re-run the baseline adding 1 tick ($0.50), 2 ticks ($1.00), and 4 ticks ($2.00) of slippage per trade, plus standard commissions.

**Test 2: Parameter Sensitivity (Neighbourhood Analysis)**
- *Hypothesis:* The model is not curve-fit to a fragile peak.
- *Method:* Shift the core parameters slightly (Expansion Ratio 1.7 to 1.9, Depth Min 0.4 to 0.6, Depth Max 1.1 to 1.3). The edge should remain positive (PF > 1.10) in the immediate neighbourhood.

**Test 3: Year-by-Year / Quarter-by-Quarter Stability**
- *Hypothesis:* The edge is consistent across time, not dependent on a single outlier period.
- *Method:* Decompose the 2-year results into 8 quarters. The model should be profitable in the majority of quarters.

**Test 4: Session Decomposition**
- *Hypothesis:* The edge is not heavily skewed to a specific time of day.
- *Method:* Split performance into AM Session (09:30–12:00 ET) and PM Session (12:00–16:00 ET).

**Test 5: Long vs Short Decomposition**
- *Hypothesis:* The edge is symmetrical.
- *Method:* Compare Long PF vs Short PF. Neither side should be negative.

**Test 6: Monte Carlo Resampling (Sequence Risk)**
- *Hypothesis:* The drawdown profile is robust against bad luck in trade sequencing.
- *Method:* Randomly shuffle the sequence of the 286 trades 1,000 times to calculate the 95th percentile Maximum Drawdown.

## 4. Promotion Criteria

To be promoted from *Candidate* to **Atlas Execution Model A1**, the model must survive these attempts to break it:
- It must remain profitable after 2 ticks of slippage.
- It must not show catastrophic failure (PF < 1.0) in the immediate parameter neighbourhood.
- It must be profitable in >50% of quarters.
- Both Long and Short sides must have PF > 1.0.
- The 95th percentile Monte Carlo drawdown must remain compatible with a $50k prop firm evaluation (Max DD < -$2,000).

If it survives, Stream C (Capital Intelligence) will begin designing the Guardian allocation logic around it. If it fails, Atlas learns and returns to Stream D.
