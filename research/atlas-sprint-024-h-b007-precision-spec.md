# Atlas Research Specification: Sprint 024 — Component Precision Research

## 1. Context and Objective

**Research Stream:** B — Execution Intelligence / D — Component Intelligence
**Sprint:** 024
**Status:** Planned

In Sprint 023, four interaction hypotheses were tested. All were rejected because none produced a Profit Factor > 1.20. However, **H-B007 (Pullback Continuation + Volatility Expansion)** produced the first meaningful research signal: a positive net profit (PF 1.023) that was stable across both Year 1 and Year 2 sub-periods, with drawdown safely inside prop firm limits.

The objective of Sprint 024 is not to optimise randomly. The objective is to determine whether the weak edge in H-B007 becomes stronger when the component definitions (Pullback and Volatility Expansion) become more mathematically precise. 

## 2. Research Questions and Hypotheses

This sprint will test specific precision refinements based on six research questions:

**Q1. What is the most statistically meaningful definition of a pullback?**
- *Hypothesis (H-B007a):* A pullback defined by a specific depth relative to ATR (e.g., 0.5x to 1.5x ATR from the swing high) outperforms a simple "touch of the EMA21" because it ensures sufficient discount without invalidating the trend.

**Q2. Does a two-leg pullback outperform a one-leg pullback inside this environment?**
- *Hypothesis (H-B007b):* A complex two-leg pullback (A-B-C structure) outperforms a single-leg pullback because it traps early buyers/sellers and sweeps internal liquidity before continuation.

**Q3. What pullback depth relative to ATR produces the best robustness?**
- *Hypothesis (H-B007c):* Shallow pullbacks (<0.5 ATR) fail due to lack of discount; deep pullbacks (>2.0 ATR) fail because they are actually trend reversals. The optimal depth lies between 0.8 and 1.2 ATR.

**Q4. What volatility expansion lookback period is most meaningful?**
- *Hypothesis (H-B007d):* A longer lookback period for Volatility Expansion (e.g., 20 bars vs 10 bars) provides a more robust baseline, reducing false signals caused by isolated single-bar spikes.

**Q5. What expansion ratio separates noise from genuine directional participation?**
- *Hypothesis (H-B007e):* The 1.4x expansion ratio used in Sprint 023 was too low. An expansion ratio of >1.8x separates genuine institutional participation from retail noise.

**Q6. Does the signal improve on higher timeframes?**
- *Hypothesis (H-B007f):* The 15-minute timeframe will yield a higher Profit Factor than the 5-minute timeframe because structural components (expansion and pullbacks) carry less noise.

## 3. Experimental Design

**Dataset:** 2-year MNQ 5-minute dataset (`MNQ_5min_full.csv`) and 15-minute dataset.
**Methodology:** 
A comprehensive parameter sweep will be conducted across the dimensions defined in the hypotheses:
- **Pullback Structure:** 1-leg vs 2-leg.
- **Pullback Depth:** 0.5x, 1.0x, 1.5x ATR.
- **Expansion Lookback:** 5, 10, 20 bars.
- **Expansion Ratio:** 1.2x, 1.4x, 1.8x, 2.0x.
- **Timeframe:** 5-min vs 15-min.

**Test Harness:**
A Python script (`atlas_sprint_024_precision.py`) will systematically iterate through these combinations, applying the same 12 robustness metrics and Year 1/Year 2 stability checks used in previous sprints.

## 4. Acceptance Criteria

To be validated and permanently accepted into the Execution Component Library, the refined H-B007 model must demonstrate:
- **PF > 1.20** across the full dataset.
- Acceptable drawdown compatible with a $50k prop firm evaluation (Max DD < $2,000).
- Minimum 100 trades.
- Stability across both Year 1 and Year 2 sub-periods.
- Robustness across nearby parameter values (no curve-fitting spikes).
- No over-filtering (the improvement must come from higher win rate or larger average winners, not just starvation of trades).

If the improved definitions still fail to achieve PF > 1.20, H-B007 will be rejected permanently or moved to the low-confidence archive.
