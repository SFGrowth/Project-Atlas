# PV-EXP-004 Results Report
## Reversed-Direction Target Matrix

**Sprint:** 123A.13
**Experiment type:** RETROSPECTIVE_TARGET_MATRIX_WITH_INTERNAL_TEMPORAL_VALIDATION
**Generated:** 2026-07-29T22:06:30.756875+00:00
**Status:** AWAITING PHIL'S WRITTEN APPROVAL TO MERGE

---

## Locked Inputs

| Field | Value |
|---|---|
| INPUT_LEDGER_SHA256 | `741e153ee454d2b080dd413d170436ab...` |
| DATASET_SHA256 | `c970675391b970956f38d419ef95ff3e...` |
| INPUT_EVENTS | 172 |
| FILLED_EVENTS | 152 |
| INVALID_RISK_DISTANCE_EVENTS | 0 |
| UNEXPLAINED_EVENT_LOSS | 0 |

---

## Primary Results: All 8 Configurations

| Config | Direction | Target | Win Rate | Target Win Rate | Expectancy | PF | Total Net | Max DD |
|---|---|---|---|---|---|---|---|---|
| ORIG_R1 | Original | 1.0R | 46.1% | 46.1% | $0.21 | 1.039 | $31.52 | $972.74 |
| ORIG_R15 | Original | 1.5R | 36.8% | 36.2% | $4.40 | 1.132 | $669.02 | $1579.36 |
| ORIG_R2 | Original | 2.0R | 30.3% | 29.6% | $8.10 | 1.200 | $1230.52 | $1683.76 |
| ORIG_R25 | Original | 2.5R | 25.7% | 24.3% | $13.26 | 1.297 | $2016.02 | $1749.76 |
| REV_R1 | Reversed | 1.0R | 44.1% | 43.4% | $-7.85 | 0.843 | $-1193.48 | $1638.50 |
| REV_R15 | Reversed | 1.5R | 40.1% | 38.8% | $1.96 | 1.071 | $298.02 | $984.94 |
| REV_R2 | Reversed | 2.0R | 34.2% | 32.2% | $1.90 | 1.064 | $288.52 | $1501.08 |
| REV_R25 | Reversed | 2.5R | 30.9% | 26.3% | $-0.83 | 1.008 | $-125.98 | $1993.30 |

---

## Reversal Conversion Analysis

| Metric | REV_R1 | REV_R15 | REV_R2 | REV_R25 |
|---|---|---|---|---|
| ORIGINAL_LOSERS_TO_REV_WINNERS | 66 | 59 | 49 | 40 |
| ORIGINAL_WINNERS_TO_REV_LOSERS | 46 | 46 | 46 | 46 |
| THEORETICAL_REVERSAL_RATE | 69.1% | 69.1% | 69.1% | 69.1% |
| ACTUAL_TARGET_WIN_RATE | 43.4% | 38.8% | 32.2% | 26.3% |

---

## Breakeven Analysis

| Config | Gross BE Rate | Net BE Rate | Actual Target Win Rate | Margin |
|---|---|---|---|---|
| REV_R1 (1.0R) | 50.0% | 51.6% | 43.4% | -8.2% |
| REV_R15 (1.5R) | 40.0% | 41.4% | 38.8% | -2.6% |
| REV_R2 (2.0R) | 33.3% | 34.5% | 32.2% | -2.3% |
| REV_R25 (2.5R) | 28.6% | 29.6% | 26.3% | -3.3% |

---

## Statistical Validation (Holm-Bonferroni)

| Config | Expectancy | 95% CI | PF | Adj p-value | Classification |
|---|---|---|---|---|---|
| REV_R1 | $-7.85 | [-25.22, 8.42] | 0.843 | 1.0000 | REJECTED |
| REV_R15 | $1.96 | [-17.93, 21.87] | 1.071 | 1.0000 | PROMISING |
| REV_R2 | $1.90 | [-19.38, 24.47] | 1.064 | 1.0000 | PROMISING |
| REV_R25 | $-0.83 | [-23.02, 22.26] | 1.008 | 1.0000 | REJECTED |

---

## Walk-Forward Validation

| Config | Training Exp | Validation Exp | Parameter Changed |
|---|---|---|---|
| REV_R1 | $-5.07 | $-12.00 | FALSE |
| REV_R15 | $0.93 | $3.50 | FALSE |
| REV_R2 | $8.56 | $-8.04 | FALSE |
| REV_R25 | $5.96 | $-10.95 | FALSE |

**PARAMETER_CHANGED_AFTER_VALIDATION: FALSE** ✓

---

## Best Reversed Configuration

| Metric | Value |
|---|---|
| BEST_REVERSED_CONFIGURATION | REV_R15 |
| BEST_REVERSED_EXPECTANCY | $1.9607 |
| BEST_REVERSED_PROFIT_FACTOR | 1.0713 |
| BEST_REVERSED_EXPECTANCY_95CI | [-17.93, 21.87] |
| BEST_REVERSED_ADJUSTED_P_VALUE | 1.0000 |
| WALK_FORWARD_VALIDATION_RESULT | Train=$0.93, Val=$3.50 |
| FINAL_CLASSIFICATION | PROMISING |

---

## Causality

| Check | Result |
|---|---|
| FUTURE_BAR_USES | 0 |
| LOOKAHEAD_VIOLATIONS | 0 |
| OUTCOME_ACCOUNTING_RECONCILES | TRUE |
| PARAMETER_CHANGED_AFTER_VALIDATION | FALSE |

---

## Authority Boundaries

| Boundary | Status |
|---|---|
| LIVE_TRADES_INITIATED | 0 |
| DARWIN_DECISION_AUTHORITY | DISABLED |
| DARWIN_EXECUTION_AUTHORITY | DISABLED |
