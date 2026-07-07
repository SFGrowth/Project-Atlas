# Sprint 018: Atlas Strategy — Statistical Validation

**Date:** July 07, 2026
**Author:** Orion
**Status:** Completed

## Executive Summary

The objective of Sprint 018 was to statistically validate the Thomas Wade-inspired Atlas Strategy components against a massive 2-year MNQ dataset (140,933 5-minute bars) using the Atlas Research Engine v2.0.

The research philosophy was strictly enforced: **Atlas does not seek confirmation. Atlas seeks evidence. Every hypothesis is assumed false until statistically supported.**

The results were sobering but highly valuable. While certain components (two-legged pullbacks, tighter stops) proved statistically superior, the overall system struggled to achieve the required Profit Factor and Win Rate thresholds necessary for prop firm survival. The peak robustness combination achieved a Profit Factor of 1.141 and a Win Rate of 31.4% — which fails the Atlas Acceptance Criteria (PF > 1.20).

## Component Isolation Tests

Before running the full parameter sweep, each component was isolated and tested against a baseline trend-following model (EMA 9/21 alignment).

**Baseline Performance (Trend Only):**
The baseline trend-following model achieved a Profit Factor of 1.044 and a Win Rate of 34.3% over 2,082 trades. The Net PnL stood at $22,259, but this was accompanied by a severe Max Drawdown of -$22,726, rendering the baseline too volatile for prop firm constraints.

| Component Test | Hypothesis | Evidence | Result & Decision |
|---|---|---|---|
| **Structure Filter (BOS)** | Requiring a recent Break of Structure (BOS) improves trade quality. | Profit Factor decreased to 1.036, and Max Drawdown increased. | **FALSE** — Reject rule. |
| **Two-Leg Pullback (H2/L2)** | Two-legged pullbacks outperform single-leg entries. | Profit Factor increased to 1.054, and Max Drawdown reduced by $8,241. | **TRUE** — Accept rule. |
| **Signal Bar Quality** | Requiring a strong signal bar (close in top 35% of range) improves expectancy. | Profit Factor marginally improved (1.059), but Net PnL dropped significantly due to severe trade reduction. | **FALSE** — Reject rule. |
| **Location Filter (EMA Proximity)** | Entries within 1.5 ATR of the slow EMA have higher expectancy. | Catastrophic failure. Profit Factor collapsed to 0.938, and Net PnL went negative. | **FALSE** — Reject rule. |
| **Reward:Risk Ratio (2.5 vs 2.0)** | Increasing RR from 2.0 to 2.5 improves overall robustness. | Win rate dropped to 27.3%, and expectancy remained negative. | **FALSE** — Reject rule. |
| **Tighter Stop (0.75 ATR vs 1.0 ATR)** | A tighter stop improves expectancy by reducing loss size. | Profit Factor improved to 1.000, and expectancy improved from -0.043 to -0.001. | **TRUE** — Accept rule. |

## Full Parameter Sweep Results

Following the isolation tests, a full parameter sweep of 3,456 combinations was executed. To ensure statistical significance, any combination producing fewer than 100 trades over the 2-year period was discarded.

The engine ranked combinations using a custom **Robustness Score** that penalises high drawdown and low trade counts while rewarding high Profit Factor and Expectancy.

### The Peak Combination
The absolute best combination found by the engine produced a Robustness Score of 5.4326. This peak configuration achieved a Profit Factor of 1.141 and a Win Rate of 31.39% across 1,150 trades. While the Net PnL reached $41,737 with a positive Expectancy of 0.099 R, the strategy suffered a Max Drawdown of -$9,903 and a Largest Losing Streak of 12 trades.

The winning parameters for this configuration required the Structure filter to be enabled (BOS required within 20 bars) and utilized Two-leg pullbacks (H2/L2). The Signal Bar requirement was set to close in the top/bottom 45% (min_close_ratio: 0.55). The Location filter was disabled entirely (max_ema_dist: 99.0), while the Reward:Risk ratio was optimized at 2.5 with a tighter Stop Loss of 0.75 ATR.

## Conclusion & Next Steps

### The Verdict
The peak combination (PF 1.141, WR 31.4%, Max DD -$9,903) **fails** the Atlas Acceptance Criteria defined in Sprint 017.

A $9,903 maximum drawdown is fatal for any 50K prop firm account (which typically enforces a $2,000 trailing drawdown limit). Even with scaling or position sizing adjustments, a 12-trade losing streak at a 31% win rate will reliably blow prop firm evaluations.

### Why Did It Fail?
The evidence suggests that purely mechanical implementations of discretionary price action concepts (like Thomas Wade's) degrade significantly when stripped of human context. The system is catching too many false pullbacks in choppy regimes, and the location filter (EMA proximity) actively hurt performance rather than helping it.

### Recommendation for Sprint 019
We must pivot. The current logic is not robust enough for automated execution or even high-confidence planner signals.

**Proposed Pivot:**
First, we must implement a strict chop or consolidation filter. The data clearly shows that the strategy bleeds capital in ranging environments, with a Ranging Profit Factor of 0.945 compared to a Trending Profit Factor of 1.286. 

Second, we need to incorporate timeframe alignment. Adding a higher timeframe (such as 15-minute or 60-minute) trend alignment check before taking 5-minute pullbacks should help filter out low-probability setups.

Finally, we should revisit the high-win-rate logic detailed in the PlayBot strategy report, specifically the Akimbo and Safe Flow mechanisms. Testing these specific mechanisms against our robust 2-year dataset will provide the evidence needed to build a strategy capable of passing prop firm evaluations.

Atlas OS functioned exactly as designed. It demanded evidence, tested the hypothesis, and rejected a failing strategy before a single dollar was risked.
