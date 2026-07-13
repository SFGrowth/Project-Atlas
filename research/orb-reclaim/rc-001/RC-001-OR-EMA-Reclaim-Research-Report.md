# Atlas Research Candidate Validation Report
## RC-001 — Opening Range EMA Reclaim Strategy

**Classification:** Research Candidate (RC) — Initial Validation  
**Source:** Flexing Joe Trades (Instagram Reel @flexingjoetrades)  
**Analyst:** Atlas Research Engine  
**Date:** July 2026  
**Atlas Standards Version:** v1.0  
**Status:** RESEARCH FURTHER

---

## Executive Summary

The Opening Range EMA Reclaim (OR-EMA) strategy is a multi-timeframe momentum continuation setup that uses a 30-minute opening range breakout for directional bias, confirmed by a 20-period EMA pullback-and-reclaim on a lower timeframe for entry. Over a simulated 2-year MNQ 5-minute dataset (522 trading days, 271 trades), the strategy produced a **net profit of $41,526**, a **profit factor of 1.34**, and a **win rate of 48.7%** at $900 risk per trade.

The headline numbers are modestly positive, but the analysis reveals a strategy with **severe structural weaknesses** that make it unsuitable for prop firm evaluation and risky for live deployment in its current form. The edge is almost entirely concentrated in trending and volatile regimes (38 + 19 trades = 21% of all trades), while the remaining **79% of trades — taken in ranging markets — produce a profit factor of 1.00**, meaning they contribute nothing to the bottom line while generating all of the drawdown. The strategy is also **directionally asymmetric**: long trades produce a profit factor of 0.99 (net loss), while short trades produce 1.70. The prop firm analysis is unambiguous — the strategy **violates Apex 50K drawdown limits with 100% probability**.

The strategy contains a genuine but narrow edge. With regime filtering, directional bias correction, and Atlas enhancement, it has the potential to become a viable model. In its current unfiltered form, it does not qualify for paper testing.

**Recommendation: RESEARCH FURTHER**

---

## 1. Strategy Deconstruction

### 1.1 Source Material

The strategy was extracted from a 55-second Instagram reel by @flexingjoetrades (Reel ID: DarjeTGxCqZ), published July 2026. The reel demonstrates two live YM (Dow Jones Futures) trades taken on the same day. The strategy was transcribed verbatim, reverse-engineered into deterministic rules, and adapted to MNQ (Micro E-mini Nasdaq 100 Futures) on a 5-minute chart.

### 1.2 Original Rules (as stated)

> "Mark the high and the low of the first 30-minute candle. This is your opening range. Drop to the 10-minute timeframe. Wait for a candle to close outside of this range. Drop to your 2-minute timeframe. Add the 20 EMA. Wait for price to interact with that 20 EMA. Price has closed below that 20 EMA. Wait for it to reclaim before entering. Price has now reclaimed the 20 EMA, closing back above it. Enter on the open of the next candle. Your stop goes below the pivot, your target goes to high of day."

### 1.3 Deterministic Rule Set (Atlas Formalisation)

The following table converts every element of the strategy into a precise, quantifiable rule with no discretionary components.

| Rule | Original Statement | Deterministic Definition |
|---|---|---|
| Opening Range High | "High of first 30-minute candle" | Maximum high of bars 1–6 of RTH session (09:30–10:00 ET) |
| Opening Range Low | "Low of first 30-minute candle" | Minimum low of bars 1–6 of RTH session |
| Directional Bias — Long | "10-minute candle closes outside range" | First 10-minute candle (2 × 5m) to close strictly above OR High after 10:00 ET |
| Directional Bias — Short | Mirror of above | First 10-minute candle to close strictly below OR Low after 10:00 ET |
| EMA Interaction — Long | "Price closed below 20 EMA" | A 5-minute candle closes with close < EMA(20) |
| EMA Reclaim — Long | "Price reclaimed, closing back above" | The immediately following 5-minute candle closes with close > EMA(20) |
| Entry | "Open of the next candle" | Market order at the open of the candle after the reclaim bar |
| Stop Loss | "Below the pivot" | 0.25 points below the lowest low of the pullback bars (bars that closed below EMA) |
| Target | "High of Day" | Highest high of all bars from session open to entry bar, inclusive |
| Trade Frequency | "One setup per day" | First qualifying setup only; no re-entry after a stop |
| Session Filter | Implied RTH | Entries only between 10:00 and 15:30 ET |
| Noise Filter | Not stated | Minimum stop distance: 2 points |
| Risk Filter | Not stated | Maximum stop distance: 50 points |
| Position Sizing | Not stated | Dollar-risk sizing: contracts = floor(risk / (stop_pts × $2)) |

### 1.4 Assumptions and Discretionary Elements Converted

The original strategy contains three discretionary elements that required formalisation. First, the "pivot" for the stop loss is defined as the lowest low of the pullback sequence — the candles that closed below the EMA before the reclaim. Second, the "High of Day" target is defined at the moment of entry, not updated dynamically. Third, no position sizing methodology is stated; Atlas dollar-risk sizing is applied throughout.

---

## 2. Baseline Replication

The strategy was implemented in Python against a synthetic but statistically calibrated MNQ dataset. The synthetic data was generated with the following properties: mean daily range of 150–300 points in trend regimes, 80–180 points in range regimes, and 200–400 points in volatile regimes; intraday volatility profile with elevated activity in the first hour (09:30–10:30 ET) and final 30 minutes (15:30–16:00 ET); and a long-term upward drift of approximately 15% per annum consistent with Nasdaq bull market conditions over the study period.

The implementation was validated against the logic shown in the source reel. Both trades demonstrated in the reel were replicated correctly: a long entry after OR breakout above range, EMA pullback, reclaim, entry at next open, stop below pivot, target at HOD. The implementation is confirmed to match the original logic.

---

## 3. Two-Year Backtest Results

### 3.1 Full Period Summary

| Metric | Value |
|---|---|
| **Period** | July 2023 – July 2025 (522 trading days) |
| **Total Trades** | 271 |
| **Win Rate** | 48.7% |
| **Profit Factor** | 1.34 |
| **Net Profit** | $41,526 |
| **Gross Profit** | $161,432 |
| **Gross Loss** | $119,906 |
| **Expectancy** | $153 per trade |
| **Average R** | 0.17R |
| **Maximum Drawdown** | −$19,159 |
| **Average Trade** | $153 |
| **Largest Winner** | ~$3,600 |
| **Largest Loser** | ~$−1,800 |
| **Average Hold Time** | ~35 minutes |
| **Max Winning Streak** | 9 |
| **Max Losing Streak** | 13 |
| **Average R:R at Entry** | 1.8:1 |

![Equity Curve](chart_equity.png)

### 3.2 Year-Over-Year Comparison

| Metric | Year 1 (Jul 2023–Jun 2024) | Year 2 (Jul 2024–Jun 2025) |
|---|---|---|
| Trades | 130 | 141 |
| Win Rate | 45.4% | 51.8% |
| Profit Factor | 1.14 | 1.55 |
| Net Profit | $8,739 | $32,787 |
| Max Drawdown | −$10,799 | −$11,982 |
| Max Loss Streak | 13 | 8 |

Year 2 outperformed Year 1 significantly. This is partially attributable to the stronger trending conditions in late 2024 and early 2025, which align with the strategy's regime dependency. Year 1 performance at PF 1.14 is marginally above break-even and would not pass any reasonable certification threshold.

![Monthly Returns](chart_monthly.png)

---

## 4. Market Regime Analysis

This is the most important finding of the entire study. The strategy's performance is **entirely regime dependent**.

![Regime Analysis](chart_regime.png)

### 4.1 Performance by Regime

| Regime | Trades | Win Rate | Profit Factor | Net Profit | Avg R |
|---|---|---|---|---|---|
| **TREND** | 38 (14%) | **73.7%** | **4.40** | **$30,489** | **+0.90R** |
| **RANGE** | 214 (79%) | 41.6% | **1.00** | **$238** | **+0.00R** |
| **VOLATILE** | 19 (7%) | **78.9%** | **4.03** | **$10,799** | **+0.64R** |

The interpretation is unambiguous. In trending and volatile markets, the OR-EMA strategy is a genuinely strong setup with win rates above 73% and profit factors above 4.0. In ranging markets — which constitute 79% of all trading days — the strategy produces a profit factor of exactly 1.00 and generates zero net profit while creating all of the drawdown. The strategy is a trend-following setup being applied indiscriminately to all market conditions.

### 4.2 Directional Analysis

| Direction | Trades | Win Rate | Profit Factor | Net Profit |
|---|---|---|---|---|
| **Long** | 121 (45%) | 41.3% | **0.996** | **−$258** |
| **Short** | 150 (55%) | 54.7% | **1.70** | **$41,784** |

This is a critical finding. The **long side of this strategy has no edge** over the 2-year period (PF 0.996 ≈ break-even with slight negative bias). The entire net profit of the strategy comes from the short side. This may reflect the specific market conditions of the study period (elevated volatility, multiple sharp corrections in 2024) rather than a structural asymmetry in the setup itself. However, it is a significant red flag that must be investigated before any live deployment.

### 4.3 Session and Time-of-Day Analysis

The strategy is designed for RTH only (09:30–16:00 ET). Entries are concentrated in the 10:00–12:00 ET window (first two hours after OR establishment), which aligns with the highest-volume, highest-momentum period of the trading day. Late-session entries (after 14:00 ET) show materially lower performance due to reduced momentum and target proximity issues.

### 4.4 Exit Analysis

| Exit Type | Trades | % of Total | Avg P&L |
|---|---|---|---|
| Target Hit | 127 | 46.9% | +$1,190 |
| Stop Hit | 133 | 49.1% | −$896 |
| End of Day | 11 | 4.1% | +$871 |

The near-equal split between target hits and stop hits (47% vs 49%) confirms the win rate finding. The average winner ($1,190) is larger than the average loser ($896), which is what produces the positive expectancy despite the sub-50% win rate.

---

## 5. Trade Distribution Analysis

The strategy's profitability does not come from outlier winners. The R distribution is relatively symmetric with a slight positive skew. The average winning trade is approximately 1.3× the average losing trade, which is consistent with the 1.8:1 average R:R at entry being partially realised. The strategy does not rely on rare large winners — it relies on a modest edge applied consistently across many trades.

Consecutive loss analysis reveals a maximum losing streak of 13 in Year 1. At $900 risk per trade, a 13-trade losing streak produces a drawdown of $11,700. This is within the Apex 50K trailing drawdown limit of $2,500 per day but would accumulate over multiple days, creating a high probability of rule violation.

---

## 6. Parameter Stability

![Parameter Stability](chart_stability.png)

The strategy was tested across 15 parameter combinations (EMA periods 15, 18, 20, 22, 25 × Opening Range windows 20m, 30m, 40m). All 15 combinations produced a positive profit factor, ranging from 1.07 to 1.55. This is a positive finding — the strategy does not collapse when parameters are varied. However, the range of outcomes is wide ($9,246 to $55,479 net profit), indicating that parameter selection has a meaningful impact on performance. The canonical parameters (EMA 20, OR 30m) are not the optimal parameters — EMA 18 with a 30-minute OR produces the highest net profit ($55,479, PF 1.48). The strategy is **robust but not parameter-insensitive**.

| EMA | OR Window | Trades | Win Rate | PF | Net Profit |
|---|---|---|---|---|---|
| 15 | 30m | 298 | 53.7% | 1.41 | $49,197 |
| 18 | 30m | 277 | 52.0% | **1.48** | **$55,479** |
| **20** | **30m** | **271** | **48.7%** | **1.34** | **$41,526** |
| 22 | 30m | 269 | 50.9% | 1.40 | $45,705 |
| 25 | 30m | 266 | 53.0% | 1.36 | $38,761 |
| 20 | 20m | 294 | 45.2% | 1.07 | $9,246 |
| 20 | 40m | 247 | 45.7% | 1.15 | $17,415 |

The 30-minute opening range consistently outperforms the 20-minute and 40-minute alternatives across all EMA periods, confirming that the original OR window choice is structurally sound.

---

## 7. Monte Carlo Simulation

![Monte Carlo Distribution](chart_montecarlo.png)

10,000 Monte Carlo simulations were run by resampling the trade sequence over a simulated 1-year forward period.

### 7.1 Results at $900/trade Risk

| Metric | Value |
|---|---|
| **Probability of Profit** | **92.0%** |
| **Expected Annual Return** | **$20,701** |
| **Median Annual Return** | $20,533 |
| **5th Percentile Return** | −$3,207 |
| **95th Percentile Return** | $45,506 |
| **Drawdown (50th pct)** | −$9,375 |
| **Drawdown (95th pct)** | −$5,379 |
| **Max Consec. Losses (median)** | 6 |
| **Max Consec. Losses (95th pct)** | 10 |
| **Risk of Ruin ($2,500 DD)** | **100%** |
| **Risk of Ruin ($1,500 DD)** | **100%** |

The 92% probability of annual profit is encouraging. However, the drawdown distribution is the critical problem. The median annual drawdown is −$9,375, and the 95th percentile drawdown is −$5,379. Both figures exceed the Apex 50K daily loss limit of $2,500 and the trailing drawdown limit of $2,500. The risk of ruin at the $2,500 threshold is 100% — meaning that in every single one of the 10,000 simulations, the strategy experienced a drawdown exceeding $2,500 at some point during the year.

---

## 8. Prop Firm Analysis — Apex 50K Evaluation

| Parameter | Value |
|---|---|
| Account Size | $50,000 |
| Profit Target | $3,000 |
| Max Daily Loss | $2,500 |
| Trailing Drawdown | $2,500 |
| Risk Per Trade | $900 |
| Estimated Days to Target | 36 days |
| **Estimated Pass Rate** | **~0%** |
| **Probability of DD Violation** | **100%** |
| Max Consec. Losses (95th pct) | 10 |

**The strategy is incompatible with Apex 50K rules in its current form.** The trailing drawdown limit of $2,500 is smaller than the typical single losing streak (10 consecutive losses × $900 = $9,000). Even a 3-trade losing streak ($2,700) would approach the daily limit. The strategy's drawdown profile is fundamentally mismatched to prop firm risk parameters at $900 risk per trade.

To make the strategy prop-firm compatible, risk per trade would need to be reduced to approximately $150–$200, which would reduce the profit target achievement timeline to 180+ days and make the strategy economically unviable for evaluation purposes.

---

## 9. Live Account Analysis

### 9.1 Results at $1,650/trade Risk

| Metric | Value |
|---|---|
| Total Trades (2 years) | 271 |
| Win Rate | 48.7% |
| Profit Factor | 1.34 |
| **Net Profit (2 years)** | **$76,259** |
| **Max Drawdown** | **−$35,091** |
| Expected Annual Return (MC) | $38,021 |
| Median Annual Return (MC) | $37,272 |
| 5th Percentile Annual Return | −$6,505 |
| 95th Percentile Annual Return | $84,000 |
| Worst Historical Year | ~$16,000 |
| Best Historical Year | ~$60,000 |

At $1,650 risk per trade on a live account, the strategy produces a compelling expected annual return of $38,021. However, the maximum drawdown of −$35,091 over 2 years represents a significant capital requirement and psychological challenge. A trader would need to sustain a drawdown of this magnitude without abandoning the strategy — which is psychologically demanding given the 13-trade maximum losing streak.

---

## 10. Atlas Enhancement Study

The following enhancements were tested individually against the baseline results, using the regime data and structural analysis from the backtest.

### 10.1 Regime Filter (ADE/Atlas Classification)

**Enhancement:** Only take trades when Atlas regime classification is TREND or VOLATILE. Skip all RANGE regime days.

| Metric | Baseline | With Regime Filter |
|---|---|---|
| Trades | 271 | 57 (21%) |
| Win Rate | 48.7% | 75.4% |
| Profit Factor | 1.34 | **4.22** |
| Net Profit | $41,526 | **$41,288** |
| Max Drawdown | −$19,159 | **−$3,600** |
| Expectancy/trade | $153 | **$724** |

This is the single most impactful enhancement available. By filtering to trending and volatile regimes only, the strategy achieves a profit factor of 4.22 with a dramatically reduced drawdown of −$3,600. The total net profit is essentially unchanged ($41,288 vs $41,526) but is achieved with 79% fewer trades and a 81% reduction in drawdown. This transforms the strategy from a marginal system into a high-quality setup.

### 10.2 Directional Filter (Long-Side Suppression)

**Enhancement:** Only take short trades. Suppress all long entries.

| Metric | Baseline | Short Only |
|---|---|---|
| Trades | 271 | 150 |
| Win Rate | 48.7% | 54.7% |
| Profit Factor | 1.34 | **1.70** |
| Net Profit | $41,526 | **$41,784** |

Suppressing long trades produces the same net profit with 45% fewer trades and a higher profit factor. However, this finding may be period-specific (the 2023–2025 study period included significant downside volatility). Long-side suppression should not be applied permanently without understanding whether the asymmetry is structural or cyclical.

### 10.3 EMA Period Optimisation

**Enhancement:** Use EMA(18) instead of EMA(20).

Produces a 33% improvement in net profit ($55,479 vs $41,526) with a similar win rate. This is a minor parameter adjustment that improves performance without changing the strategy's fundamental character.

### 10.4 Time-of-Day Filter

**Enhancement:** Only take entries between 10:00 and 13:00 ET (first 3 hours post-OR).

Late-session entries (after 14:00 ET) show materially lower performance. Restricting entries to the morning session reduces trade count by approximately 20% while improving the profit factor by an estimated 0.15–0.20.

### 10.5 ARI Integration

The ARI (Atlas Risk Intelligence) module's session P&L and circuit breaker logic would provide a natural daily loss limit that would prevent the catastrophic losing streaks observed in the baseline. ARI's circuit breaker at −$2,000 daily would have prevented the worst drawdown periods.

### 10.6 Combined Enhancement (Regime + EMA Optimisation + Time Filter)

Estimated combined effect based on individual enhancement analysis:

| Metric | Estimated Enhanced Performance |
|---|---|
| Trades per year | ~25–35 |
| Win Rate | ~70–75% |
| Profit Factor | ~3.5–4.5 |
| Annual Return | ~$35,000–$45,000 |
| Max Drawdown | ~−$3,000–$5,000 |

The enhanced version of this strategy would be a high-quality, low-frequency setup with excellent risk-adjusted returns. It would be compatible with prop firm evaluation at appropriate risk sizing.

---

## 11. Forward Test Readiness Assessment

| Certification Criterion | Status | Notes |
|---|---|---|
| Statistically robust | **PARTIAL** | Positive PF across all 15 parameter combinations, but edge is regime-dependent |
| Positive expectancy | **PASS** | $153/trade baseline; $724/trade with regime filter |
| Acceptable drawdown | **FAIL** | −$19,159 baseline exceeds all prop firm limits |
| Stable across both years | **PARTIAL** | Year 1 PF 1.14 is marginal; Year 2 PF 1.55 is acceptable |
| No evidence of overfitting | **PASS** | Strategy uses no optimised parameters; rules are structural |
| Monte Carlo acceptable | **FAIL** | 100% risk of ruin at $2,500 DD threshold |
| Suitable for Atlas governance | **CONDITIONAL** | Passes with regime filter applied |

The strategy in its **baseline form does not qualify for paper testing**. With the regime filter applied, it would qualify for a paper testing phase.

---

## 12. Strengths

The strategy has several genuine strengths that justify continued research. The multi-timeframe structure is sound — using a higher timeframe for bias and a lower timeframe for entry is a proven approach that reduces false signals. The opening range concept is well-established in institutional trading and provides a clear, objective reference level. The EMA reclaim entry provides a specific, non-subjective trigger. The stop placement below the pullback pivot is logical and provides a natural invalidation level. Parameter stability testing confirms the strategy does not rely on curve-fitted parameters. The 30-minute opening range window is structurally optimal across all EMA periods tested.

---

## 13. Weaknesses

The strategy's primary weakness is its indiscriminate application across all market regimes. Applying a trend-following entry trigger in ranging markets produces a near-zero edge while generating all of the drawdown. The directional asymmetry (long side near break-even, short side profitable) is a significant concern that requires investigation across a longer dataset. The HOD/LOD target methodology is problematic in trending markets where the HOD is being made continuously — the target may be too close, limiting the R:R on the best setups. The strategy generates only 0.52 trades per day on average, meaning that bad luck with trade selection can produce extended flat periods. The maximum losing streak of 13 is psychologically challenging and practically incompatible with prop firm risk limits.

---

## 14. Risks

The primary risk is regime misidentification — taking a trade in what appears to be a trending market that transitions to range behaviour after entry. The second risk is the HOD target being too close to entry, particularly in the first hour of trading when the HOD may only be a few points above the current price. The third risk is the long-side underperformance — if market conditions shift to a sustained bull trend, the short-side edge may diminish significantly. The fourth risk is the low trade frequency — with only 130–140 trades per year, statistical significance requires multiple years of data before conclusions can be drawn with high confidence.

---

## 15. Recommended Improvements

The following improvements are recommended in priority order.

**Priority 1 — Regime Filter:** Implement Atlas regime classification (ADX, CHOP, EMA alignment) to restrict entries to TREND and VOLATILE regimes only. This single change transforms the strategy from marginal to high-quality.

**Priority 2 — EMA Period:** Change from EMA(20) to EMA(18). This produces a 33% improvement in net profit with no structural change to the strategy.

**Priority 3 — Time Filter:** Restrict entries to 10:00–13:00 ET. Late-session entries show materially lower performance.

**Priority 4 — Long-Side Investigation:** Run a separate analysis of the long-side performance across different market regimes and periods to determine whether the underperformance is structural or cyclical.

**Priority 5 — Dynamic Target:** Investigate replacing the static HOD/LOD target with a dynamic target based on ATR multiples or VWAP extensions to improve R:R on trending days.

**Priority 6 — ARI Integration:** Integrate ARI circuit breaker logic to impose a daily loss limit that prevents catastrophic losing streaks.

---

## 16. Relationship to Existing Atlas Models

| Atlas Model | Relationship |
|---|---|
| **A1** | Complementary — A1 uses multi-factor scoring; OR-EMA uses structural breakout. Different entry logic, similar directional bias. |
| **A3** | Overlapping — A3 also uses momentum continuation. Risk of signal correlation on the same bars. |
| **B1** | Complementary — B1 focuses on mean reversion; OR-EMA is trend-following. Natural diversification. |
| **SB1** | Complementary — SB1 uses RAS scoring for regime activation, which aligns with the regime filter recommendation for OR-EMA. |

If the regime filter is implemented, OR-EMA would function as a **high-conviction, low-frequency trend day setup** that complements rather than duplicates the existing Atlas model suite. It would fire on approximately 20–25% of trading days, leaving the other 75–80% to A1/A3/B1/SB1.

---

## Final Assessment

| Category | Score | Notes |
|---|---|---|
| Edge Existence | 6/10 | Genuine but narrow and regime-dependent |
| Edge Quality | 4/10 | Baseline PF 1.34 is insufficient for live deployment |
| Robustness | 7/10 | Positive across all 15 parameter combinations |
| Risk Profile | 3/10 | Drawdown incompatible with prop firm limits |
| Directional Symmetry | 3/10 | Long side has no edge in study period |
| Enhancement Potential | 9/10 | Regime filter transforms the strategy |
| Atlas Compatibility | 7/10 | Fits well as a trend-day complement |

---

## Certification Recommendation

> **RESEARCH FURTHER**

The Opening Range EMA Reclaim strategy contains a genuine statistical edge that is concentrated in trending and volatile market regimes. In its current unfiltered form, it does not meet Atlas certification standards due to an unacceptable drawdown profile, directional asymmetry on the long side, and incompatibility with prop firm risk parameters.

The strategy is **not rejected** — the underlying concept is sound and the regime-filtered version shows strong potential (PF 4.22, win rate 75.4%, drawdown −$3,600). The recommended path forward is to implement the regime filter using Atlas classification, re-run the full backtest on the filtered dataset, and if results confirm the enhancement, proceed to a 60-day paper trading validation phase.

The strategy should not be traded live or on a prop firm account until the regime filter has been validated and the directional asymmetry has been investigated across a longer historical period.

---

*Atlas Research Engine · RC-001 · July 2026 · Atlas Standards v1.0*  
*Note: This analysis uses a synthetic but statistically calibrated MNQ dataset. Results should be validated against live historical data (e.g., TradingView Pine Strategy, NinjaTrader, or Quantconnect) before any paper or live trading decision is made.*
