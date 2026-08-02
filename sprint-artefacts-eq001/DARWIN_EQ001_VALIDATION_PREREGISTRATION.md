# DARWIN-EQ001-VALIDATION-001 — Pre-Registration

**Experiment ID:** DARWIN-EQ001-VALIDATION-001  
**Parent Rule:** RULE-EQ-001  
**Parent Finding:** Wave 1 research batch (2026-07-31T04:44:37Z)  
**Pre-registration date:** 2026-08-02T03:35:00Z  
**Branch:** sprint/darwin-eq001-validation  
**Status:** PRE-REGISTERED — PARAMETERS FROZEN  

---

## Parent Finding (Preserved Unchanged)

```
PARENT_RULE_ID             = RULE-EQ-001
PARENT_SAMPLE_SIZE         = 328
PARENT_RAW_P_VALUE         = 0.0299
PARENT_MEAN_RETURN_PERCENT = 0.0251
PARENT_WIN_RATE_PERCENT    = 52.7
PARENT_CLASSIFICATION      = PROMISING_BEHAVIOUR_NOT_STRATEGY
POST_HOC_PARENT_MODIFICATIONS = 0
```

The parent finding used 1,835 5m bars (2026-07-22 to 2026-07-31) and evaluated forward returns at 3 bars (15 minutes). This pre-registration extends the analysis to a 7.5-year dataset with directional, session, trend-relationship, and cost-adjusted validation.

---

## Frozen Parameters

```
EMA_LENGTH               = 21
ATR_LENGTH               = 14
DISTANCE_THRESHOLD_ATR   = 2.0  (canonical — not to be changed)
PARAMETERS_FROZEN_BEFORE_TEST = TRUE
PARAMETER_SWEEP_PERFORMED     = FALSE
FUTURE_DATA_USES              = 0
```

No threshold search is authorised. The neighbourhood check (1.9, 2.0, 2.1) is a robustness check only — 2.0 remains canonical regardless of results.

---

## Base Signal Condition

```
UPWARD_EXTENSION:
  CLOSE > EMA21
  AND ABS(CLOSE - EMA21) >= 2.0 × ATR14

DOWNWARD_EXTENSION:
  CLOSE < EMA21
  AND ABS(CLOSE - EMA21) >= 2.0 × ATR14
```

Completed bars only. No future information. EMA and ATR computed causally (using only bars up to and including the signal bar).

---

## Pre-Registered Hypotheses

### EQ001-LONG
When price closes at least 2 ATR **below** EMA21, price may mean-revert upward.  
Direction: LONG

### EQ001-SHORT
When price closes at least 2 ATR **above** EMA21, price may mean-revert downward.  
Direction: SHORT

---

## Pre-Registered Entry Models

```
ENTRY_A: Next bar open after the qualifying completed signal bar.
ENTRY_B: Next bar open, only if price has not already touched EMA21 before entry.
         (Execution-feasibility check — not a new signal family.)
```

No intrabar entries. No limit-order assumptions.

---

## Pre-Registered Exit Models

```
EXIT_1: Close after 5 minutes  (1 bar on 5m timeframe)
EXIT_2: Close after 10 minutes (2 bars on 5m timeframe)
EXIT_3: Close after 15 minutes (3 bars on 5m timeframe)
EXIT_4: First causal touch of EMA21, capped at 15 minutes.
        - Use only bars after entry.
        - No same-bar future knowledge.
        - If EMA21 not touched within 15 min, exit at 15-min close.
```

No stop optimisation. No target optimisation.

---

## Pre-Registered Splits

```
DIRECTIONAL:      LONG, SHORT (separate results required)
SESSION:          RTH (09:30–16:00 ET), ETH (all other non-maintenance hours)
TREND_RELATION:   WITH_TREND, AGAINST_TREND (using EMA21 slope)
COMBINED:         RTH_LONG, RTH_SHORT, ETH_LONG, ETH_SHORT
                  RTH_WITH_TREND, RTH_AGAINST_TREND
                  ETH_WITH_TREND, ETH_AGAINST_TREND
```

Trend definition: EMA21 slope > 0 → uptrend. Slope <= 0 → downtrend.  
With-trend extension: upward extension in uptrend, downward extension in downtrend.  
Against-trend extension: upward extension in downtrend, downward extension in uptrend.

---

## Pre-Registered Chronological Partitions

```
DISCOVERY_PERIOD:   Earliest 60% of available history
VALIDATION_PERIOD:  Next 20%
HOLDOUT_PERIOD:     Final 20%
HOLDOUT_UNTOUCHED_UNTIL_FINAL_GATE = TRUE
```

Partitions are determined by bar count, not calendar date, to ensure equal representation.

---

## Pre-Registered Cost Model

Reusing the existing Atlas locked MNQ cost model:

```
COMMISSION_PER_SIDE_USD  = 0.62   (NinjaTrader/Apex rate)
EXCHANGE_FEE_PER_SIDE    = 0.85   (CME MNQ)
SLIPPAGE_PER_SIDE_POINTS = 0.25   (1 tick = $0.50 on MNQ)
ROUND_TRIP_TOTAL_USD     = (0.62 + 0.85) × 2 + (0.25 × 2 × 2.00)  = 3.94 + 1.00 = 4.94
MNQ_POINT_VALUE          = 2.00 USD
ROUND_TRIP_COST_POINTS   = 4.94 / 2.00 = 2.47 points
```

Cost sensitivity: BASE, BASE×1.25, BASE×1.50 all tested.

---

## Pre-Registered Neighbourhood Check

```
DISTANCE_THRESHOLD_ATR = 1.9  (robustness check only)
DISTANCE_THRESHOLD_ATR = 2.0  (canonical)
DISTANCE_THRESHOLD_ATR = 2.1  (robustness check only)
```

The 2.0 result is canonical. 1.9 or 2.1 will not be selected as the winner.

---

## Multiple-Testing Control

```
HYPOTHESIS_FAMILY  = EQ001_MEAN_REVERSION
BENJAMINI_HOCHBERG_FDR = TRUE
FDR_Q              = 0.05
FAMILY_K_COUNT     = <to be recorded after all combinations are counted>
```

All tested combinations belong to one registered family. BH-FDR applied to all raw p-values simultaneously.

---

## Classification Gates

```
REJECTED if:
  net_expectancy <= 0 in validation OR holdout
  net_profit_factor <= 1.0
  sample < 50
  future-data violation
  costs fully remove the effect

INCONCLUSIVE if:
  positive direction but insufficient confidence
  validation and holdout disagree
  BH-FDR does not pass
  unstable across periods

PROMISING requires ALL:
  net_expectancy > 0
  net_profit_factor > 1.0
  validation_expectancy > 0
  holdout_expectancy > 0
  adequate sample
  no severe year dependence
  no future-data violation
  realistic execution
  positive bootstrap central estimate

PROMISING_STRONG requires ALL:
  net_expectancy > 0
  net_profit_factor > 1.10
  validation_expectancy > 0
  holdout_expectancy > 0
  bootstrap_lower_bound > 0
  BH-FDR adjusted p-value < 0.05
  stable direction and session evidence
  cost +25% remains net positive
```

---

## Strategy Formation Gate

A strategy specification candidate is created only if at least one subgroup reaches PROMISING_STRONG.

```
STRATEGY_SPECIFICATION_CREATED = FALSE (default — updated after results)
```

---

## Authority Boundaries

```
DARWIN_PROCESSBAR_CALLS        = 0
DARWIN_POSTBARAUTOMATION_CALLS = 0
DARWIN_TRADERSPOST_CALLS       = 0
DARWIN_TRADOVATE_CALLS         = 0
LIVE_TRADES_INITIATED          = 0
PAPER_TRADES_INITIATED         = 0
STRATEGY_STATUS_CHANGES        = 0
CAPITAL_REALLOCATIONS          = 0
DARWIN_DECISION_AUTHORITY      = DISABLED
DARWIN_EXECUTION_AUTHORITY     = DISABLED
```

---

## Required Outputs (exactly 6)

1. DARWIN_EQ001_VALIDATION_PREREGISTRATION.md (this file)
2. DARWIN_EQ001_VALIDATION_RESULTS.json
3. DARWIN_EQ001_VALIDATION_REPORT.md
4. DARWIN_EQ001_SUBGROUP_RANKING.md
5. DARWIN_EQ001_COST_AND_ROBUSTNESS_REPORT.md
6. DARWIN_EQ001_ARTEFACT_MANIFEST.json

```
NEW_ARTEFACT_COUNT   <= 6
PLACEHOLDER_COUNT    = 0
ARTEFACT_HASH_COVERAGE = 100%
```
