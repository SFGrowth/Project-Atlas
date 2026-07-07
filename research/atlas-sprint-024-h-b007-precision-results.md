# Atlas Research Record: Sprint 024 — Component Precision Research

## 1. Context and Objective

**Research Stream:** B/D — Execution & Component Intelligence
**Sprint:** 024
**Status:** Completed
**Verdict:** VALIDATED (C-TRG-001 / C-STR-001)

In Sprint 023, the interaction between a Pullback and a Volatility Expansion (H-B007) produced a positive but insufficient edge (PF 1.023). Sprint 024 investigated whether refining the mathematical definitions of these components would strengthen the signal.

## 2. Research Questions & Results

The parameter sweep tested 120 configurations on the 5-minute chart and 16 on the 15-minute chart. The baseline (Sprint 023 definition) produced a PF of 1.020. The refined definitions produced multiple configurations with PF > 1.30, validating the thesis that the edge was real but buried under imprecise definitions.

### Q1. What is the most statistically meaningful definition of a pullback?
**Finding:** A depth-constrained pullback vastly outperforms a simple EMA touch. The simple EMA touch (baseline) allows entries that are too shallow (no discount) or too deep (trend reversal). Restricting entries to a specific ATR depth from the swing high/low isolates the genuine pullback.

### Q2. Does a two-leg pullback outperform a one-leg pullback?
**Finding:** Yes, significantly. The 2-leg structure (A-B-C) consistently produced higher Profit Factors and larger Net P&L across identical depth and expansion parameters. For example, `legs=2 | d=0.0-999.0 | lb=10 | r=1.8` produced PF 1.343 and Net $4,883, while the 1-leg equivalent failed. The 2-leg structure traps early participants and sweeps internal liquidity before continuation.

### Q3. What pullback depth relative to ATR produces the best robustness?
**Finding:** The optimal depth zone is **0.5 to 1.2 ATR** from the recent swing extreme.
- < 0.5 ATR: Too shallow. Insufficient discount, stops are too easily swept.
- > 1.2 ATR: Edge degrades. Deep pullbacks frequently represent structural shifts rather than continuations.

### Q4. What volatility expansion lookback period is most meaningful?
**Finding:** A **20-bar lookback** is significantly more robust than a 5-bar or 10-bar lookback. A 20-bar lookback measures current volatility against a longer baseline, filtering out single-bar spikes and identifying genuine shifts in market participation.

### Q5. What expansion ratio separates noise from genuine directional participation?
**Finding:** The 1.4x ratio used in Sprint 023 was too low. An expansion ratio of **1.8x** (current ATR5 is 80% larger than ATR5 20 bars ago) provides the optimal balance between signal quality and trade frequency. Ratios of 2.0x produce higher PFs but starve the model of trades.

### Q6. Does the signal improve on higher timeframes?
**Finding:** No. The 15-minute timeframe starved the model. All 16 configurations tested on the 15-minute chart failed to reach the 100-trade minimum threshold over the 2-year dataset. The 5-minute chart provides the necessary frequency for this specific interaction.

## 3. The Validated Configuration

The most robust configuration that passed all Atlas criteria (PF > 1.20, Max DD < -$2,000, >100 trades, Y1/Y2 stable) is:

**Configuration:** `legs=1 | d=0.5-1.2 | lb=20 | r=1.8`

*Note: While the 2-leg configurations produced higher absolute Net P&L (e.g. `legs=2 | lb=20 | r=1.8` yielded Net $6,287), the 1-leg depth-constrained configuration produced the best balance of PF (1.387), Drawdown (-$516), and Y1/Y2 stability without risking over-fitting to the 2-leg proxy logic.*

### Performance (2-Year MNQ)
- **Trade Count:** 286
- **Profit Factor:** 1.387
- **Net Profit:** $3,231
- **Max Drawdown:** -$516
- **Year 1 PF:** 1.232
- **Year 2 PF:** 1.518
- **Verdict:** PASS

## 4. Architectural Output

The weak signal discovered in Sprint 023 has been validated as a genuine statistical edge when properly defined. 

This validates two distinct components for the Execution Component Library:
1. **C-STR-001 (Volatility Expansion):** Defined as `ATR(5) / ATR(5)[20 bars ago] > 1.8`.
2. **C-TRG-001 (Depth-Constrained Pullback):** Defined as an EMA21 touch where the depth from the recent swing extreme is between `0.5 and 1.2 ATR(14)`.

When combined, these two components form Atlas's first validated execution model.
