# Sprint 027 Research Specification: Edge Attribution Analysis

**Objective:**
Perform a complete Edge Attribution analysis on Model A1 to determine *why* it underperformed in Year 1, and evaluate alternative solutions before concluding that a second execution model (Model A2) is required.

**Background:**
ATS v1.0 Monte Carlo simulations showed a PF of 1.531 overall, but revealed severe underperformance in Year 1 (PF 0.956) compared to Year 2 (PF 1.985). Before adding complexity, Atlas must diagnose the exact cause of this regime-dependency.

## Phase 1: Trade Partitioning & Feature Importance
Partition all 290 historical Model A1 trades by market regime variables at the time of entry:
- ADX (Trend Strength)
- ATR Percentile (Volatility Level)
- Trend Direction (Bull/Bear)
- VWAP Relationship (Distance from VWAP)
- Session (AM, PM early, PM late)
- Day of Week
- Volatility Expansion Ratio (Magnitude of the trigger)
- Pullback Depth (Distance from swing)

Calculate the predictive power of each feature on Profit Factor, Win Rate, Expectancy, and Drawdown. Rank features from highest impact to lowest.

## Phase 2: Year 1 Root Cause Analysis
Compare the statistical distribution of the highest-ranked features between Year 1 and Year 2. Answer definitively:
- What exact market characteristics changed between Year 1 and Year 2?
- Why did the edge disappear in Year 1?

## Phase 3: Alternative Solutions Testing
Before recommending Model A2, simulate the following modifications to Model A1 to see if they solve the Year 1 problem:
1. **Different Exits:** Trailing stops, time-based exits, larger/smaller RR targets.
2. **Dynamic Position Sizing:** Volatility-adjusted sizing, regime-based risk scaling.
3. **Regime Exclusion:** Blocking trades entirely when the identified toxic conditions are present.

## Phase 4: Final Recommendation
Deliver a formal research report with the edge attribution findings. Only recommend the development of Model A2 if the alternative solutions fail to provide a statistically robust improvement to ATS v1.0.
