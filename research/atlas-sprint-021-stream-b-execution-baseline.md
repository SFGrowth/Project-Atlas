# Atlas Sprint 021 — Stream B: Execution Intelligence Baseline

## Research Objective
The objective of Sprint 021 was to establish the intrinsic statistical quality of four execution models (Pullback, Liquidity Sweep, Breakout, Mean Reversion) independently of the Regime Engine, and then measure the isolated contribution of the frozen Regime Engine v1.0.

This research follows the dual-experiment framework defined in the Atlas OS architecture:
- **Experiment A:** Execution models tested in isolation (RTH only, no regime filter)
- **Experiment B:** Execution models tested with the frozen Regime Engine v1.0 filter

## Experiment A: Baseline Execution (No Regime Engine)
The baseline tests were run against 39,353 Regular Trading Hours (RTH) bars from the 2-year MNQ dataset. 

| Execution Model | Profit Factor | Win Rate | Max Drawdown | Trade Count | Status |
|---|---|---|---|---|---|
| **Pullback Continuation** | 1.057 | 40.5% | $4,141 | 1,480 | REJECTED |
| **Liquidity Sweep** | 1.056 | 41.7% | $2,809 | 2,057 | REJECTED |
| **Breakout Continuation** | 1.000 | 38.3% | $2,845 | 394 | REJECTED |
| **Mean Reversion** | 0.947 | 36.0% | $7,642 | 2,248 | REJECTED |

**Finding:** None of the four execution models possess an intrinsic statistical edge (PF > 1.20) when traded unconditionally during RTH. They all bleed capital over time, with Max Drawdowns significantly exceeding the $2,000 prop firm limit.

## Experiment B: Regime Engine Contribution Analysis
The same execution models were then run through the frozen Regime Engine v1.0 filter, which restricted trading to only 958 bars (0.7% of the total dataset).

| Execution Model | Baseline PF | + Regime PF | Change | DD Baseline | DD + Regime |
|---|---|---|---|---|---|
| **Pullback** | 1.057 | N/A | N/A | $4,141 | N/A |
| **Liquidity Sweep** | 1.056 | 1.071 | +0.015 | $2,809 | $794 |
| **Breakout** | 1.000 | N/A | N/A | $2,845 | N/A |
| **Mean Reversion** | 0.947 | N/A | N/A | $7,642 | N/A |

*(Note: "N/A" indicates the trade count fell below the minimum 100 required for statistical validity.)*

**Finding:** The Regime Engine successfully collapsed the drawdown of the Liquidity Sweep model from $2,809 to $794 (a 71% reduction in risk), and marginally improved its Profit Factor. However, the Regime Engine is so restrictive (passing only 0.7% of bars) that it starved the other three models of enough trades to be evaluated.

## Conclusion & Next Steps
1. **Execution Models Lack Edge:** The simple implementations of Pullback, Liquidity Sweep, Breakout, and Mean Reversion do not possess enough intrinsic edge to overcome transaction costs and market noise, even when filtered.
2. **Regime Engine is Over-Restrictive:** The frozen Regime Engine v1.0 (specifically the ATR Compression ratio ≤ 0.7) is filtering out 99.3% of the market. While this successfully protects capital (drawdowns drop massively), it prevents the strategy from generating enough opportunities to compound returns.

**Recommendation:** 
Atlas must open a new research project in Stream A: **Regime Engine v2.0**. The objective is to discover a regime classification that protects capital (low drawdown) without starving the execution models of valid opportunities. The frozen v1.0 engine will remain untouched as the baseline comparison.
