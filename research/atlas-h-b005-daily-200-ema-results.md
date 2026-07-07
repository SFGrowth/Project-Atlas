# Atlas Research Record: H-B005 Daily 200 EMA Mean Reversion

## 1. Context and Objective

**Research Stream:** D — Component Intelligence
**Sprint:** 022
**Status:** Completed
**Verdict:** REJECTED

The Daily 200 Exponential Moving Average (EMA) is widely regarded in traditional finance and retail trading as a major institutional inflection point. It is often claimed that when price deviates significantly from the Daily 200 EMA, a mean reversion event is highly probable, or that touches of the Daily 200 EMA provide high-probability bounce opportunities.

This sprint tested whether the Daily 200 EMA provides a statistically valid edge in the MNQ futures market, either as a location for mean reversion entries or as a contextual filter.

## 2. Hypothesis

**H-B005a (Mean Reversion from Extremes):** When the intraday price deviates from the Daily 200 EMA by more than $X$ ATR, initiating a mean reversion trade back toward the Daily 200 EMA yields a Profit Factor > 1.20 over a 2-year dataset.

**H-B005b (Bounce from Daily 200 EMA):** When intraday price pulls back to within $Y$ ATR of the Daily 200 EMA, entering in the direction of the broader trend yields a Profit Factor > 1.20 over a 2-year dataset.

## 3. Experimental Design

- **Dataset:** 2-year MNQ 5-minute dataset (`MNQ_5min_full.csv`, 140,933 bars, July 2024 to July 2026).
- **Test Variables:** 
  - Deviation thresholds for H-B005a (1.5, 2.0, 2.5, 3.0 Daily ATR).
  - Proximity thresholds for H-B005b (0.25, 0.50, 0.75, 1.0 Daily ATR).
  - Risk/Reward ratios (1:1, 2:1).
- **Execution Logic:** Entries taken unconditionally during RTH when location conditions were met.
- **Robustness Check:** Best parameters run against Year 1 and Year 2 sub-periods independently.

## 4. Results

Both hypotheses completely failed to generate an edge. Across 16 parameter configurations tested over 140,933 bars, **not a single configuration achieved a Profit Factor above 1.005**. Every test resulted in a net loss and massive drawdown.

### H-B005a: Mean Reversion from Extreme Deviation (Fade the Extension)

Fading extreme extensions from the Daily 200 EMA resulted in consistent losses.

| Parameter (Dev/RR) | Trades | Profit Factor | Net P&L | Max Drawdown | Verdict |
|---|---|---|---|---|---|
| Dev>1.5xATR / RR=1:1 | 11,706 | 0.922 | -$23,418 | -$25,411 | FAIL |
| Dev>1.5xATR / RR=2:1 | 7,272 | 0.940 | -$14,379 | -$17,206 | FAIL |
| Dev>2.0xATR / RR=1:1 | 10,597 | 0.915 | -$22,930 | -$24,609 | FAIL |
| Dev>2.0xATR / RR=2:1 | 6,579 | 0.942 | -$12,460 | -$15,042 | FAIL |
| Dev>2.5xATR / RR=1:1 | 9,539 | 0.933 | -$16,313 | -$18,074 | FAIL |
| Dev>2.5xATR / RR=2:1 | 5,908 | 0.956 | -$8,524 | -$11,520 | FAIL |
| Dev>3.0xATR / RR=1:1 | 8,429 | 0.938 | -$13,232 | -$14,636 | FAIL |
| Dev>3.0xATR / RR=2:1 | 5,243 | 0.952 | -$8,207 | -$10,970 | FAIL |

*Robustness Check (Dev>2.0xATR, RR=2:1):*
- Year 1 PF: 0.884 (Max DD: -$11,325)
- Year 2 PF: 0.985 (Max DD: -$5,447)

### H-B005b: Bounce at Daily 200 EMA (Trend Continuation)

Trading bounces off the Daily 200 EMA also failed to generate an edge. The market frequently sliced straight through the level.

| Parameter (Prox/RR) | Trades | Profit Factor | Net P&L | Max Drawdown | Verdict |
|---|---|---|---|---|---|
| Prox<0.25xATR / RR=1:1 | 404 | 1.005 | $50 | -$1,011 | FAIL |
| Prox<0.25xATR / RR=2:1 | 255 | 0.882 | -$1,040 | -$1,259 | FAIL |
| Prox<0.5xATR / RR=1:1 | 719 | 0.887 | -$2,342 | -$2,821 | FAIL |
| Prox<0.5xATR / RR=2:1 | 435 | 0.805 | -$3,121 | -$3,744 | FAIL |
| Prox<0.75xATR / RR=1:1 | 999 | 0.894 | -$3,046 | -$3,519 | FAIL |
| Prox<0.75xATR / RR=2:1 | 578 | 0.846 | -$3,318 | -$4,012 | FAIL |
| Prox<1.0xATR / RR=1:1 | 1,328 | 0.854 | -$5,633 | -$6,100 | FAIL |
| Prox<1.0xATR / RR=2:1 | 795 | 0.859 | -$4,138 | -$5,046 | FAIL |

*Robustness Check (Prox<0.5xATR, RR=2:1):*
- Year 1 PF: 0.843 (Max DD: -$1,671)
- Year 2 PF: 0.763 (Max DD: -$2,551)

## 5. Conclusion and Verdict

**Verdict: REJECTED**

**Evidence:**
The Daily 200 EMA provides zero predictive edge for intraday MNQ trading. Fading extensions results in severe drawdown because trends frequently extend much further than 3.0 Daily ATR without reverting. Trading bounces at the level fails because the market treats the D200 EMA as liquidity rather than structural support/resistance, slicing through it repeatedly.

**Atlas Principle Applied:**
"If evidence contradicts an existing rule, Atlas changes the rule — not the evidence." The retail trading consensus that the Daily 200 EMA is a magic level is statistically false in the MNQ intraday environment.

**Next Steps:**
- Record H-B005 as a rejected component in the `KNOWLEDGE_BASE.md`.
- Do not add the Daily 200 EMA to the `COMPONENT_CATALOGUE.md` Execution Component Library.
- Proceed with Stream A research on Regime Engine v2.0.
