# Regime Engine v2.0 Research Specification

## 1. Research Question
The frozen Regime Engine v1.0 (specifically the Volatility Compression component `ATR(14) / ATR(100) <= 0.7`) is highly effective at reducing drawdown but passes only 0.7% of all Regular Trading Hours (RTH) bars. This restricts opportunity density so severely that execution models cannot be properly evaluated or traded.

**Question:** Can we discover a new regime classification threshold or component that maintains the capital protection benefits of v1.0 while significantly increasing opportunity density?

## 2. Hypothesis
A relaxed Volatility Compression threshold (e.g., `0.8` to `1.2`) or a dynamic compression measurement (e.g., Bollinger Band Width percentiles) will pass a statistically significant number of bars (e.g., > 10%) while still filtering out the lowest-expectancy, high-drawdown market noise.

## 3. Experimental Design
- **Baseline:** The raw, unfiltered RTH market (from Sprint 021 baseline).
- **Control:** The frozen Regime Engine v1.0.
- **Variables to Test:**
  1. Incremental relaxation of the `ATR(14) / ATR(100)` threshold (0.75, 0.8, 0.85, 0.9, 0.95, 1.0).
  2. Alternative compression metrics (e.g., Bollinger Band Width percentile).
  3. Multi-timeframe trend alignment as a substitute for strict compression.

## 4. Acceptance Criteria
To be accepted as a validated component for Regime Engine v2.0, the new filter must:
1. Pass at least **10%** of RTH bars (Opportunity Density).
2. Produce a Max Drawdown materially lower than the unfiltered baseline.
3. Improve the Profit Factor of a standard test signal compared to the unfiltered baseline.

## 5. Next Steps
Build the Python test harness to run the parameter sweep on the Volatility Compression threshold and evaluate the 12 robustness metrics for each step.
