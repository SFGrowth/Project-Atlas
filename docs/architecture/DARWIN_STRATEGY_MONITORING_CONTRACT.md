# DARWIN Strategy Monitoring Contract

**Document type:** Architecture Contract  
**Version:** 1.0  
**Effective from:** Sprint 123A.6 / Gate G6A  
**Parent doctrine:** `ATLAS_AUTONOMOUS_QUANTITATIVE_RESEARCH_MISSION.md`  
**Status:** ACTIVE

---

## 1. Purpose

This contract defines the mandatory fields, rolling windows, evaluation logic, and output states for every strategy monitored by DARWIN. It governs how Atlas detects edge decay, regime failure, and portfolio deterioration without triggering any automated trading action.

---

## 2. Strategy Record Schema

Every strategy registered for monitoring must contain the following fields:

### 2.1 Identity Fields

| Field | Type | Description |
|-------|------|-------------|
| `strategyId` | string | Unique identifier (e.g., `A1`, `ORB-1`) |
| `version` | string | Strategy version (e.g., `1.0.0`) |
| `codeSha` | string | Full 40-character git SHA of the strategy implementation |
| `pineScriptVersion` | string | TradingView Pine Script version, if applicable |
| `currentLifecycleStatus` | enum | See Section 4 |
| `approvedAuthorityLevel` | enum | `SHADOW`, `LIMITED_LIVE`, `ACTIVE` |
| `owner` | string | `phil` — all strategies require Phil approval to change status |

### 2.2 Baseline Metrics (Set at Promotion to ACTIVE)

| Field | Type | Description |
|-------|------|-------------|
| `baselineTrades` | integer | Number of trades in the baseline period |
| `baselineWinRate` | decimal | Win rate in the baseline period |
| `baselineExpectancy` | decimal | Expectancy per trade (points) in the baseline period |
| `baselineProfitFactor` | decimal | Profit factor in the baseline period |
| `baselineSharpe` | decimal | Sharpe ratio in the baseline period |
| `baselineMaxDrawdown` | decimal | Maximum drawdown (points) in the baseline period |
| `baselineMaxLossStreak` | integer | Maximum consecutive losses in the baseline period |
| `baselinePeriodStart` | timestamp | Start of baseline period |
| `baselinePeriodEnd` | timestamp | End of baseline period |
| `baselineExpectancyLowerBound` | decimal | 95% confidence lower bound on expectancy |
| `baselineExpectancyUpperBound` | decimal | 95% confidence upper bound on expectancy |

### 2.3 Expected Live Range

| Field | Type | Description |
|-------|------|-------------|
| `expectedWinRateMin` | decimal | Minimum acceptable win rate (below triggers CAUTION) |
| `expectedExpectancyMin` | decimal | Minimum acceptable expectancy per trade |
| `expectedProfitFactorMin` | decimal | Minimum acceptable profit factor |
| `expectedSharpeMin` | decimal | Minimum acceptable Sharpe ratio |
| `expectedMaxDrawdownMax` | decimal | Maximum acceptable drawdown |
| `expectedMaxLossStreakMax` | integer | Maximum acceptable consecutive losses |

### 2.4 Current Rolling Metrics

For each rolling window, DARWIN computes the following. Where sample size is insufficient, the field returns `INSUFFICIENT_EVIDENCE` rather than a fabricated value.

| Window | Minimum trades required |
|--------|------------------------|
| Last 20 trades | 20 |
| Last 50 trades | 50 |
| Last 100 trades | 100 |
| Last 30 calendar days | 5 |
| Last 90 calendar days | 10 |
| Current volatility regime | 10 |
| Current session regime | 10 |

For each window where sufficient data exists:

- `trades` — number of trades in window
- `winRate` — win rate
- `expectancy` — expectancy per trade (points)
- `profitFactor` — profit factor
- `sharpe` — Sharpe ratio (annualised)
- `maxDrawdown` — maximum drawdown (points)
- `maxLossStreak` — maximum consecutive losses
- `vsBaselineExpectancy` — deviation from baseline expectancy (standard deviations)
- `cautionFlags` — list of triggered caution conditions (see Section 5)

### 2.5 Regime-Specific Metrics

| Field | Type | Description |
|-------|------|-------------|
| `regimeTrend_expectancy` | decimal or `INSUFFICIENT_EVIDENCE` | Expectancy in TREND regime |
| `regimeChop_expectancy` | decimal or `INSUFFICIENT_EVIDENCE` | Expectancy in CHOP regime |
| `sessionNY_expectancy` | decimal or `INSUFFICIENT_EVIDENCE` | Expectancy in NY session |
| `sessionLondon_expectancy` | decimal or `INSUFFICIENT_EVIDENCE` | Expectancy in London session |
| `sessionAsia_expectancy` | decimal or `INSUFFICIENT_EVIDENCE` | Expectancy in Asia session |

### 2.6 Lifecycle Timestamps

| Field | Type | Description |
|-------|------|-------------|
| `lastEvaluationTimestamp` | timestamp | When DARWIN last evaluated this strategy |
| `lastPromotionTimestamp` | timestamp | When strategy was last promoted |
| `lastDowngradeTimestamp` | timestamp | When strategy was last downgraded |
| `downgradeReason` | string | Documented reason for last downgrade |
| `retirementReason` | string | Documented reason for retirement (if applicable) |

### 2.7 Portfolio Fields

| Field | Type | Description |
|-------|------|-------------|
| `allocationStatus` | enum | `FULL`, `REDUCED`, `SUSPENDED`, `RETIRED` |
| `correlationProfile` | object | Rolling correlation with each other active strategy |
| `portfolioContribution` | decimal | Marginal Sharpe contribution to portfolio |
| `diversificationValue` | enum | `HIGH`, `MEDIUM`, `LOW`, `REDUNDANT` |

---

## 3. Current Strategy Registry (Sprint 123A.6 Baseline)

| Strategy ID | Lifecycle Status | Authority Level | OOS Sharpe | OOS Expectancy | Monitoring Status |
|-------------|-----------------|-----------------|-----------|----------------|-------------------|
| A1 | `CAUTION_CANDIDATE` | SHADOW (paper) | -1.263 | -6.60 pts | `REQUIRES_REVIEW` |
| A3 | `CAUTION_CANDIDATE` | SHADOW (paper) | -0.111 | -2.79 pts | `REQUIRES_REVIEW` |
| B1 | `CAUTION_CANDIDATE` | SHADOW (paper) | -1.242 | -0.91 pts | `REQUIRES_REVIEW` |
| SB1 | `CAUTION_CANDIDATE` | SHADOW (paper) | -2.174 | -2.05 pts | `REQUIRES_REVIEW` |
| ORB-1 | `SHADOW` | SHADOW (paper) | +2.886 | +6.44 pts | `MONITORING` |

**Important caveat:** A1, A3, B1, and SB1 are classified as `CAUTION_CANDIDATE` / `REQUIRES_REVIEW` based on the historical backtest results. These classifications are provisional and subject to strategy-fidelity reconciliation (see `DARWIN_STRATEGY_FIDELITY_REPORT.md`). No strategy is automatically retired or has capital reallocated as a result of this sprint.

---

## 4. Lifecycle Status Definitions

| Status | Description |
|--------|-------------|
| `OBSERVED` | Market behaviour identified, no strategy yet |
| `HYPOTHESIS` | Strategy hypothesis formed, not yet backtested |
| `BACKTEST` | Backtest in progress |
| `OUT_OF_SAMPLE` | OOS validation in progress |
| `SHADOW` | Live shadow trading (no real orders) |
| `ELIGIBLE_FOR_REVIEW` | Passed all gates, awaiting Phil review |
| `LIMITED_LIVE` | Live trading with reduced allocation |
| `ACTIVE` | Full live trading |
| `CAUTION` | Performance deteriorating — monitoring intensified |
| `CAUTION_CANDIDATE` | Historical evidence suggests CAUTION warranted — pending fidelity reconciliation |
| `REQUIRES_REVIEW` | Requires Phil review before status change |
| `REDUCED` | Allocation reduced due to sustained underperformance |
| `SHADOW_REVIEW` | Returned to shadow for revalidation |
| `RETIRED` | Strategy permanently retired |
| `REJECTED` | Candidate rejected — does not meet gates |
| `INCONCLUSIVE` | Insufficient evidence to determine status |

---

## 5. Caution Trigger Conditions

The following conditions may trigger a `CAUTION` flag on a strategy. Flags are advisory only — no automatic action is taken.

| Condition | Threshold |
|-----------|-----------|
| Rolling expectancy below baseline lower bound | `vsBaselineExpectancy < -2.0` standard deviations |
| Profit factor below approved minimum | `profitFactor < expectedProfitFactorMin` |
| Drawdown exceeding expected percentile | `maxDrawdown > expectedMaxDrawdownMax * 1.5` |
| Loss streak exceeding approved tolerance | `maxLossStreak > expectedMaxLossStreakMax * 1.5` |
| Regime-specific breakdown | Expectancy negative in primary regime |
| Slippage materially above model | Slippage > 2× assumed slippage |
| Rising correlation removing portfolio benefit | `correlationWithOtherStrategies > 0.7` |

---

## 6. Output States

DARWIN monitoring produces one of the following output states per evaluation:

| State | Meaning |
|-------|---------|
| `HEALTHY` | All rolling metrics within expected range |
| `MONITORING` | No caution flags, but sample size limited |
| `CAUTION_CANDIDATE` | One or more caution flags triggered — recommend Phil review |
| `REQUIRES_REVIEW` | Multiple caution flags or sustained underperformance — Phil review required |
| `INSUFFICIENT_EVIDENCE` | Sample size too small to evaluate — no conclusion drawn |

**No automatic demotion, retirement, or capital reallocation occurs from any output state.** All state changes require Phil's written approval.

---

## 7. Evaluation Frequency

- Rolling metrics: updated after every confirmed live bar (real-time)
- Caution flag evaluation: every 24 hours
- Full strategy review report: weekly (or on Phil's request)
- Regime-specific breakdown: evaluated after each session close

---

## 8. Amendment History

| Version | Date | Author | Change |
|---------|------|--------|--------|
| 1.0 | 2026-07-22 | Atlas Nexus (Phil approval) | Initial contract — Sprint 123A.6 Gate G6A |
