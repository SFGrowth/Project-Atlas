# Atlas Strategy Research Specification

**Project Atlas: Vision 1.0**  
**Document Status:** Draft for Review  
**Module:** Atlas Strategy (First Execution Module)  

## 1. Purpose

This document outlines the research and specification for the first execution module in the Atlas Operating System: the **Atlas Strategy**. 

As mandated by the Atlas Constitution, the Atlas Strategy is inspired by Thomas Wade's price action methodology but is not intended to replicate it blindly. The objective is to deconstruct Wade's discretionary approach into objective, testable components, validate them statistically, and engineer a superior systematic strategy integrated with the Atlas decision engine.

This strategy will only request permission to trade; the Atlas Guardian will decide if the market conditions justify risking capital.

## 2. Research: Thomas Wade Methodology Deconstruction

Thomas Wade's approach is a price action-based scalping methodology primarily used on ES/MES/MNQ futures. It is heavily derived from Al Brooks' price action concepts but simplified [1] [2].

### 2.1 The Core Setup: 0-1-2 Entry Logic (Two-Legged Pullback)
The foundational setup is the two-legged pullback to the moving average (M2B/M2S) [3] [4].
- **0**: Start of an impulse leg.
- **1**: First entry attempt (first pullback).
- **2L / 2S**: Second entry long/short (the primary setup).

The logic dictates that counter-trend traders enter on the first pullback. When that fails and price pulls back a second time, the second entry traps those traders, providing momentum for trend continuation [4].

### 2.2 Discretionary vs. Objective Components

| Component | Thomas Wade Discretionary Approach | Proposed Atlas Systematic Implementation |
| :--- | :--- | :--- |
| **Trend** | Visual assessment of EMA slope and price action | **Trend Alignment Score:** Fast EMA > Slow EMA; Price > VWAP; Slope > 0. |
| **Structure** | Visual Break of Structure (BOS) / Change of Character (CHOCH) | **Objective Structure:** Close above previous N-bar swing high (BOS Bullish); Close below previous N-bar swing low (BOS Bearish) [5]. |
| **Leg Counting** | Visual counting of pullbacks, often inconsistent [6] | **Mechanical Leg Count:** High 1 (H1) = first bar high > previous bar high during pullback. High 2 (H2) = second instance. |
| **Signal Bar** | "Looks strong," rejects levels | **Bar Quality Metric:** Close must be in the top 25% of the bar's range (for longs) or bottom 25% (for shorts). Body size must exceed a minimum ATR threshold. |
| **Location** | "Key entry points" (EMA, prior swings) | **Proximity Metric:** Signal bar must close within 0.5 ATR of the 21 EMA or identified support/resistance zones. |
| **Filters** | Avoid dojis, shooting stars, "bad feel" | **Candle Math:** Body-to-wick ratio limits; maximum bar size limit (e.g., < 2 ATR) to prevent late entries [1]. |

## 3. Proposed Measurable Implementations

To integrate with the Atlas OS, the strategy will generate a **Setup Confidence Score** based on the following measurable rules:

### 3.1 Structure & Trend Rules
1. **Trend Baseline:** Price must be on the correct side of the 21-period EMA (Longs > EMA, Shorts < EMA).
2. **Structure Confirmation:** A valid BOS in the direction of the trend must have occurred within the last 20 bars [5]. A CHOCH against the trend invalidates the setup until a new BOS occurs.

### 3.2 Setup Rules (The 2nd Entry)
1. **Pullback Initiation:** Price must pull back toward the 21 EMA.
2. **Leg 1 (H1/L1):** The first bar to break the extreme of the previous bar in the trend direction.
3. **Leg 2 (H2/L2):** The second bar to break the extreme of the previous bar in the trend direction, occurring after a lower low (for longs) or higher high (for shorts) following Leg 1 [4].

### 3.3 Quality & Location Rules
1. **EMA Proximity:** The H2/L2 signal bar must touch or close within 0.5 ATR of the 21 EMA.
2. **Signal Bar Quality:** For a Long (H2), the close must be >= 75% of the high-low range. For a Short (L2), the close must be <= 25% of the high-low range.
3. **Bar Size Limit:** The signal bar range must not exceed 1.5x the current ATR (prevents entering on exhaustion).

## 4. Validation Methodology

Before any production code is deployed, the proposed rules must pass the Atlas validation framework:

1. **Phase 1: Visual Replay Validation**
   - Implement the logic as a visual indicator in Pine Script (Atlas Planner mode).
   - Manually review 100 setups in TradingView replay mode across different market regimes (trending, choppy, high volatility).
   - *Goal:* Ensure the mechanical rules accurately capture the spirit of the two-legged pullback without excessive false positives.

2. **Phase 2: Statistical Backtesting**
   - Export setup data using the Atlas Research Exporter.
   - Run the data through the Python `atlas_research_engine.py`.
   - Measure Net PnL, Profit Factor, Win Rate, and Drawdown.
   - *Goal:* Prove that the setup possesses a positive statistical expectancy over a minimum of 1,000 trades.

3. **Phase 3: Guardian Integration Testing**
   - Test the setup in conjunction with the H001 Guardian rule (blocking strong pressure into reaction zones).
   - *Goal:* Verify that Guardian effectively filters low-quality setups and improves overall decision quality.

## 5. Assumptions and Limitations

- **Assumption:** A 21-period EMA on a 2-minute or 5-minute chart provides a robust dynamic support/resistance level for MNQ futures.
- **Assumption:** Mechanical leg counting (bar-by-bar high/low breaks) will filter out some valid discretionary setups but will provide the consistency required for algorithmic validation.
- **Limitation:** The strategy does not currently account for higher-timeframe context (e.g., 15-minute trend) beyond what the 50 EMA provides. This will be a focus for future research.

## 6. Acceptance Criteria

The Atlas Strategy module will only be promoted to production if it meets the following criteria:

1. **Expectancy:** The backtested Profit Factor must exceed 1.20 over a 2-year sample.
2. **Decision Quality:** The strategy must demonstrate a clear reduction in trades taken during choppy or low-probability regimes when paired with Atlas Observer.
3. **Drawdown:** The maximum historical drawdown must remain within the acceptable limits for a $50k prop firm evaluation (e.g., < $2,000 trailing drawdown).
4. **Code Quality:** The Pine Script must compile without errors, follow Atlas coding standards, and include no repainting logic.

---

## References

[1] User Guide: "Thomas Wade Price Action" Strategy. Thomas Wade Price Action Indicators. https://thomaswadepriceactionindicators.com/blogs/noticias/user-guide-thomas-wade-price-action-strategy
[2] Thomas Wade. Wade Trading Academy. https://wadetradingacademy.com/
[3] The Real Al Brooks 2nd Entry Setup Explained. Trasignal. https://trasignal.com/blog/learn/al-brooks-2nd-entry-setup/
[4] Two-legged Pullback to Moving Average (M2B, M2S). Trading Setups Review. https://www.tradingsetupsreview.com/two-legged-pullback-to-moving-average-m2b-m2s/
[5] Market Structure: BoS And CHoCH Made Simple. Daily Price Action. https://dailypriceaction.com/blog/smc-market-structure/
[6] Reddit Discussion: Thomas Wade (PATS) - 2 legged pullback question. r/Daytrading. https://www.reddit.com/r/Daytrading/comments/1n5z4wf/thomas_wade_pats_2_leg_ged_pullback_question/
