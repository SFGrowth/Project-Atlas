# DARWIN Validation Pipeline

**Version:** 1.0.0
**Created:** 2026-07-31T01:18:00Z
**Sprint:** darwin-complete-edge-search-universe
**Status:** PRE-REGISTRATION

---

## 1. Pipeline Stages

Every hypothesis must pass through all five stages in order. No hypothesis may be classified SUPPORTED using discovery data alone.

### Stage 1 — Discovery

Historical exploratory test on a designated discovery period.

- Period: frozen at pre-registration (e.g. 2023-01-01 to 2024-06-30).
- Purpose: determine whether the signal has any relationship with the outcome.
- Output: raw p-value, expectancy, profit factor, sample size, win rate.
- Gate: if raw p-value > 0.10 or expectancy < 0 after costs → REJECTED.

### Stage 2 — Chronological Validation

Test on an untouched later period (not used in Stage 1).

- Period: immediately following Stage 1 period (e.g. 2024-07-01 to 2025-06-30).
- Purpose: confirm the signal survives on unseen data.
- Output: same metrics as Stage 1.
- Gate: if Stage 2 expectancy < 0 after costs → REJECTED.

### Stage 3 — Walk-Forward

Rolling train-and-test windows.

- Window: 6-month training, 3-month test, stepped monthly.
- Purpose: confirm stability across multiple periods.
- Output: per-window metrics, stability score.
- Gate: if more than 30% of windows show negative expectancy → INCONCLUSIVE.

### Stage 4 — Robustness

Test neighbouring parameters, costs, sessions, years, directions, and regimes.

- Vary each frozen parameter by ±1 step.
- Vary slippage assumption by ±50%.
- Test on each available year separately.
- Test long and short directions separately.
- Test each session separately.
- Purpose: confirm the signal is not parameter-sensitive.
- Gate: if expectancy collapses under any reasonable parameter variation → INCONCLUSIVE.

### Stage 5 — Prospective Shadow

Observe live signals without execution.

- Duration: minimum 30 trading days.
- Purpose: confirm the signal appears in live data with expected frequency and characteristics.
- Output: signal count, frequency, live forward return distribution.
- Gate: if live frequency is < 50% of historical frequency → DEGRADED.

---

## 2. Required Statistical Controls

Every experiment must compute:

| Control | Description |
|---|---|
| raw_p_value | One-tailed t-test on forward return distribution |
| bh_adjusted_p_value | Benjamini-Hochberg FDR correction within family K |
| bootstrap_ci_lower | 5th percentile of 1000-iteration bootstrap |
| bootstrap_ci_upper | 95th percentile of 1000-iteration bootstrap |
| temporal_block_bootstrap | Bootstrap with 20-bar blocks to account for autocorrelation |
| cost_sensitivity | Expectancy at 1×, 1.5×, and 2× assumed round-trip cost |
| slippage_sensitivity | Expectancy at 0×, 1×, and 2× assumed slippage |
| year_stability | Expectancy computed separately for each calendar year |
| session_stability | Expectancy computed separately for each session |
| direction_stability | Expectancy computed separately for long and short |
| regime_stability | Expectancy computed separately for each regime |
| contract_stability | Expectancy computed separately for each contract period |
| sample_independence | Autocorrelation check on signal occurrence times |
| causality_validation | Feature causality test (no future data) |

---

## 3. Classification Thresholds

### PROMISING requires ALL of:
- Positive net expectancy after costs
- Profit factor > 1.0
- Positive chronological validation (Stage 2)
- Adequate sample (≥ MINIMUM_SAMPLE)
- No future-data violation
- No severe instability across years/sessions
- Realistic execution (move > round-trip cost)

### SUPPORTED requires ALL of:
- Positive net expectancy after costs
- Profit factor > 1.10
- Positive chronological validation (Stage 2)
- Positive untouched holdout (Stage 3)
- Bootstrap lower bound > 0
- BH-FDR adjusted p-value < 0.05
- Stable walk-forward evidence (Stage 3)
- Realistic slippage and cost assumptions
- Successful prospective shadow evidence (Stage 5)
- Phil's written approval before execution progression

---

## 4. Invariants

```
NO_HYPOTHESIS_SUPPORTED_ON_DISCOVERY_DATA_ALONE=TRUE
UNREGISTERED_EXPERIMENTS=0
POST_HOC_PARAMETER_CHANGES=0
```
