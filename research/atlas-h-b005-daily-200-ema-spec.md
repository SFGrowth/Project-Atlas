# Atlas Research Specification: H-B005 Daily 200 EMA Mean Reversion

## 1. Context and Objective

**Research Stream:** D — Component Intelligence (and B — Execution Intelligence)
**Sprint:** 022
**Status:** In Progress

The Daily 200 Exponential Moving Average (EMA) is widely regarded in traditional finance and retail trading as a major institutional inflection point. It is often claimed that when price deviates significantly from the Daily 200 EMA, a mean reversion event is highly probable, or that touches of the Daily 200 EMA provide high-probability bounce opportunities. 

Atlas assumes nothing. This sprint tests whether the Daily 200 EMA provides a statistically valid edge in the MNQ futures market, either as a location for mean reversion entries or as a contextual filter.

## 2. Research Questions

1. Does the distance from the Daily 200 EMA possess predictive power for mean reversion in intraday MNQ trading?
2. Do intraday touches (or near-touches) of the Daily 200 EMA provide a high-expectancy bounce (reversal) edge?

## 3. Hypothesis (H-B005)

**H-B005a (Mean Reversion from Extremes):** When the intraday price deviates from the Daily 200 EMA by more than $X$ ATR, initiating a mean reversion trade back toward the Daily 200 EMA yields a Profit Factor > 1.20 over a 2-year dataset.

**H-B005b (Bounce from Daily 200 EMA):** When intraday price pulls back to within $Y$ ATR of the Daily 200 EMA, entering in the direction of the broader trend yields a Profit Factor > 1.20 over a 2-year dataset.

## 4. Experimental Design

**Dataset:** 2-year MNQ 5-minute dataset (`MNQ_5min_2yr_massive.csv`), mapping daily timeframe values down to the intraday scale.
**Variables to Test:**
- `Distance_from_D200EMA`: Measured in multiples of Daily ATR to normalise for volatility.
- `Entry Types`: 
  - Mean Reversion (Fade the extreme extension).
  - Bounce (Enter upon testing the Daily 200 EMA).
- `Take Profit / Stop Loss`: Fixed R:R models (e.g., 1:1, 1:2) and trailing models to isolate the entry edge.

**Test Harness:**
A Python script (`atlas_h_b005_daily_200_ema.py`) will calculate the Daily 200 EMA using a rolling window, map it to the 5-minute data, and simulate the execution models unconditionally (without Regime Engine filters initially) to determine if the location alone provides edge.

## 5. Success Criteria (Atlas Standard)

To be accepted into the Execution Component Library, the component must demonstrate:
- Minimum 100 trades for statistical significance.
- Profit Factor > 1.20.
- Max Drawdown < $2,000 (prop firm trailing limit).
- Favourable performance across the 12 Atlas robustness metrics.
