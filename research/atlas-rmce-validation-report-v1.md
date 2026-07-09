# Atlas RMCE Validation Report v1.0
**Date:** July 2026  
**Sprint:** 046  

## 1. Executive Summary

The Reverse Market Causality Engine (RMCE) generated three hypotheses based on the structural precursors of exceptional market moves. Sprint 046 subjected all three hypotheses to the complete Atlas scientific validation workflow.

**The verdict is unambiguous:** The RMCE hypotheses failed independent validation. While the RMCE accurately identified the precursors to exceptional moves, those precursors do not translate into tradeable execution edges when subjected to real-world constraints (stops, targets, and false-positive frequencies).

## 2. H-RMCE-02: ATR Acceleration Filter (REJECTED)

**Hypothesis:** Adding an ATR Acceleration requirement (ATR_accel > 1.2) to existing models will improve their Profit Factor by filtering out low-volatility false signals.

**Validation Results:**
* **Model A1:** PF decreased from 1.187 to 1.179 (-0.7%). The filter removed two winning trades and zero losing trades.
* **Model A2:** PF decreased from 0.806 to 0.393 (-51.2%). Trade count dropped below statistical significance (N=6).
* **Model A3:** PF increased from 1.338 to 2.012 (+50.4%), but trade count collapsed from 5 to 2, rendering the result statistically meaningless.

**Component Attribution:**
The ATR Acceleration filter does not improve trade selection. It is a lagging indicator of volatility that often triggers *after* the optimal entry point has passed. By the time ATR_accel > 1.2 is confirmed on a 5-minute chart, the structural edge of the entry has already been consumed by the initial impulse.

## 3. H-RMCE-03: Relative Volume Confirmation (REJECTED)

**Hypothesis:** Structural continuation requires simultaneous relative volume expansion (RelVol > 1.3).

**Validation Results by Pattern:**
* **Breakouts:** PF improved marginally from 0.962 to 0.970 (+0.8%), but remained negative expectancy.
* **Pullbacks:** PF improved from 1.017 to 1.178 (+15.8%), but trade count dropped by 58%. The edge remains below the 1.20 promotion threshold.
* **Flags:** PF collapsed from 0.900 to 0.000 (100% loss rate).
* **Compression Breakouts:** PF collapsed from 2.184 to 0.000.

**Component Attribution:**
Relative volume is a descriptive metric, not a predictive one. High relative volume confirms that a move is happening, but it does not predict whether the move will reach a 2.0R target before hitting a 1.0R stop. In many cases, the highest relative volume occurs at the *exhaustion* point of a swing, making it a counter-indicator for continuation entries.

## 4. H-RMCE-01: AM Volatility Breakout (REJECTED)

**Hypothesis:** The AM session (09:30–12:00 ET) contains a tradeable volatility breakout edge when filtered by ATR Acceleration and Relative Volume.

**Validation Results (Best Configuration: ATR_accel>1.2, RelVol>1.1):**
* **Profit Factor:** 1.040
* **Win Rate:** 34.2%
* **Net P&L ($800 risk):** +$4,692 (over 2 years)
* **Walk-Forward:** 3/4 positive periods
* **MC Pass Rate (Topstep 50K):** 0.0%

**Verdict:**
The edge is statistically significant but economically unviable. A Profit Factor of 1.040 is indistinguishable from noise after slippage and commissions. The AM session is characterised by extreme two-way volatility; while it contains the majority of ≥2.0R moves (as discovered by RMCE), it also contains a massive frequency of false breakouts that destroy the expectancy of a systematic model.

## 5. H-RMCE-001: Discovery Methodology Comparison

**Research Question:** Does RMCE generate higher-quality hypotheses than traditional manual hypothesis generation?

**Comparison Matrix:**

| Metric | Traditional Atlas Research | RMCE Generation | Winner |
|---|---|---|---|
| Hypotheses Tested | 16 | 3 | — |
| Validation Rate | 37.5% (6/16) | 0.0% (0/3) | Traditional |
| Average URS Score | 55.0 | 77.6 | RMCE |
| Average Profit Factor | 1.124 | 1.066 | Traditional |
| Models Promoted | 3 | 0 | Traditional |

**Conclusion:**
RMCE is a powerful descriptive tool but a poor generative tool. It successfully identifies the characteristics of exceptional moves (high URS scores), but it suffers from severe survivorship bias. It looks at successful moves and identifies their common traits, but it fails to account for how often those same traits appear in failed moves (false positives).

Traditional hypothesis generation — which begins with a structural market theory and tests it forward — produces significantly more robust execution models.

**Decision:**
Traditional hypothesis generation remains the primary discovery methodology for Project Atlas. RMCE is relegated to a diagnostic tool for analysing the characteristics of already-validated models.
