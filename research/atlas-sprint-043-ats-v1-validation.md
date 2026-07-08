# Atlas Sprint 043 — Atlas Trading System v1.0 Validation
**Objective:** Validate ATS v1.0 (Models A1+A2+A3 + ARI v2.0) against the primary mission of passing and scaling prop firm evaluations.
**Date:** July 2026
**Status:** EXPERIMENTAL

## 1. Executive Summary

Sprint 043 assembled the complete Atlas Trading System v1.0 and evaluated it across 16 metrics and three prop firm simulations at a fixed risk of $800 per trade. 

The verdict is **EXPERIMENTAL**. The system met 4 out of 8 production criteria.

While the portfolio generates a positive expectancy and possesses three uncorrelated execution models, it fails the primary mission of the project: the Monte Carlo pass rate for $50K prop firm evaluations is unacceptably low (12.3% for Topstep, 8.0% for Apex).

The data reveals a critical architectural flaw: **Concurrent Execution Risk**. Because the models operate independently, they frequently execute simultaneously during volatile sessions, stacking risk and causing the portfolio to breach daily loss limits.

## 2. ATS v1.0 Performance Scorecard

The complete system (ARI Portfolio) was evaluated over a 2-year period (July 2024 - July 2026).

| Metric | Result | Target | Status |
| :--- | :--- | :--- | :--- |
| **Net Profit** | $28,442.86 | > $0 | ✓ PASS |
| **Profit Factor** | 1.182 | ≥ 1.20 | ✗ FAIL |
| **Win Rate** | 35.6% | — | (High RR System) |
| **Expectancy** | $47.56 | > $0 | ✓ PASS |
| **Max Drawdown** | -$10,802 | > -$15,000 | ✓ PASS |
| **RoMaD** | 2.633 | ≥ 2.0 | ✓ PASS |
| **Monthly Consistency** | 72.0% | ≥ 55.0% | ✓ PASS |
| **Risk of Ruin (-$5k)** | 39.0% | < 5.0% | ✗ FAIL |

## 3. Prop Firm Simulation Results

The system was subjected to 3,000 Monte Carlo simulations against standard prop firm rules.

| Prop Firm | Pass Rate | Fail Rate | Avg Days to Pass | Worst DD (95th) |
| :--- | :--- | :--- | :--- | :--- |
| **Apex 50K** | 8.0% | 92.0% | 7.6 | -$2,683 |
| **Topstep 50K** | 12.3% | 87.7% | 5.7 | -$2,652 |
| **Generic 50K** | 14.6% | 85.4% | 5.7 | -$2,614 |

**Why does the system fail prop firms despite making $28,000 in net profit?**
The failure is entirely driven by the **$1,000 Daily Loss Limit**. At $800 risk per trade, a single loss consumes 80% of the daily limit. If Model A1 and Model A2 both take a trade in the PM session and lose, the daily limit is breached instantly.

## 4. Portfolio Composition & Correlation

The portfolio consists of three highly uncorrelated models, which validates the regime-based discovery process.

| Model | Net Profit Contribution | Correlation vs A1 | Correlation vs A2 | Correlation vs A3 |
| :--- | :--- | :--- | :--- | :--- |
| **Model A1** | $14,877 (38.6%) | 1.000 | 0.032 | -0.021 |
| **Model A2** | $18,918 (49.0%) | 0.032 | 1.000 | -0.020 |
| **Model A3** | $4,791 (12.4%) | -0.021 | -0.020 | 1.000 |

*Note: The static portfolio generated $38,586. ARI v2.0 reduced net profit to $28,442 but successfully reduced Max Drawdown from -$14,509 to -$10,802.*

## 5. The Critical Discovery: Concurrent Execution Risk

The correlation matrix proves the models trigger on different days. However, when they *do* trigger on the same day, they often trigger in the same session (A1 and A2 both operate in the PM session).

This leads to a violation of the prop firm risk constraints. The system requires a **Single Active Strategy (SAS) constraint**:
> *Only one trading strategy can be active at a time. If a strategy is already active, no other strategy should initiate a trade.*

## 6. Strategic Implications & Next Steps

ATS v1.0 is not ready for production deployment on prop firm accounts at $800 risk per trade.

To achieve the mission, Atlas must solve the position sizing and concurrency problem. The required solutions are:

1. **Implement a Single Active Strategy (SAS) rule** within ARI to prevent concurrent risk stacking.
2. **Reduce base risk** to $400-$500 per trade to survive the $1,000 daily loss limit.
3. **Implement milestone-based risk compounding** (scaling risk up only after a profit buffer is established).

**Recommended Next Sprint:** Sprint 044 — **ARI v3.0 (Concurrency & Prop Firm Engineering)**. This sprint will rewrite the ARI layer to include SAS concurrency blocking, milestone compounding, and prop-firm-optimised base risk.
