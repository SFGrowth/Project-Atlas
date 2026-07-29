# PV-EXP-004 — Experiment Contract
## Reversed-Direction Target Matrix

**Sprint:** 123A.13
**Pre-registration date (UTC):** 2026-07-30
**Branch:** sprint/123a-13-pv-exp-004-reversed-direction-matrix
**Parent experiment:** PV-EXP-003 (Loss Autopsy, Sprint 123A.12)
**Status:** PRE-REGISTERED — no results computed at time of commit

---

## AUTHORITY BOUNDARIES (FROZEN)

DARWIN_DECISION_AUTHORITY: DISABLED
DARWIN_EXECUTION_AUTHORITY: DISABLED
LIVE_TRADES_INITIATED: 0
STRATEGY_STATUS_CHANGES: 0
CAPITAL_REALLOCATIONS: 0

This is a historical research experiment only.
Do not apply the reversed logic to live, paper or shadow execution.
Do not change strategy status.
Do not change capital allocation.
Do not merge into main without Phil's written approval.

---

## 1. Research Hypothesis

**Primary hypothesis:**

The original Payout Vault trade direction is systematically inverted. Reversing each canonical trade direction while preserving the original entry timing and initial risk distance may produce positive expectancy.

**Secondary hypothesis:**

The reversed edge (if it exists) is robust across multiple reward-to-risk configurations and survives internal temporal validation.

**Null hypothesis:**

Reversing trade direction produces no statistically significant improvement in expectancy compared to the original direction at the same reward-to-risk ratio.

---

## 2. Locked Inputs

| Input | Value |
|---|---|
| Source ledger | PV_EXP_002_OUTCOME_LEDGER.json |
| Canonical baseline | PV_EXP_003_CANONICAL_BASELINE_PNL_LEDGER.json |
| Dataset | mnq_5m_features.parquet |
| OOS window | 2025-10-01 to 2026-07-20 UTC |
| INPUT_EVENTS | 172 |
| FILLED_BASELINE_EVENTS | 152 |
| WINNERS | 47 |
| LOSERS | 105 |

**Input hashes are frozen at pre-registration and must not change.**

---

## 3. Configurations (Pre-Registered)

Eight configurations are tested. All parameters are frozen before any results are computed.

### Reversed-Direction Configurations

| Config | Direction | Stop | Target |
|---|---|---|---|
| REV_R1 | Reversed | 1.0R | 1.0R |
| REV_R15 | Reversed | 1.0R | 1.5R |
| REV_R2 | Reversed | 1.0R | 2.0R |
| REV_R25 | Reversed | 1.0R | 2.5R |

### Original-Direction Controls

| Config | Direction | Stop | Target |
|---|---|---|---|
| ORIG_R1 | Original | 1.0R | 1.0R |
| ORIG_R15 | Original | 1.0R | 1.5R |
| ORIG_R2 | Original | 1.0R | 2.0R |
| ORIG_R25 | Original | 1.0R | 2.5R |

**Note:** ORIG_R2 is the closest to the original PV-EXP-002 setup (which used a 2R target). Minor differences may exist due to the stop being reconstructed from the original stop distance rather than the original stop price.

---

## 4. Risk Distance Definition

```
RISK_DISTANCE = ABS(original_entry_price - original_stop_price)
```

For the reversed trade:
- Reversed stop = entry_price + RISK_DISTANCE (for original long → reversed short)
- Reversed stop = entry_price - RISK_DISTANCE (for original short → reversed long)
- Target = entry_price - (target_multiple × RISK_DISTANCE) (for reversed short)
- Target = entry_price + (target_multiple × RISK_DISTANCE) (for reversed long)

**Do not use the original target distance to define risk.**

---

## 5. Execution Assumptions (Frozen)

| Parameter | Value |
|---|---|
| Instrument | MNQ (Micro E-mini Nasdaq) |
| Tick size | 0.25 |
| Tick value | $0.50 |
| Adverse slippage | 2 ticks |
| Commission | $1.24 round-trip |
| Entry convention | Next bar after signal (bar_idx + 1) |
| Same-bar rule | STOP_FIRST (conservative) |
| Gap-through rule | Fill at first available adverse price (bar open) |
| Target fill | Only when price actually trades through target |
| Session close | Exit at session close price |
| End of data | Exit at last available bar close |

---

## 6. Preservation Requirements

For every filled baseline trade, preserve:
- Signal timestamp (information_cutoff)
- Entry timestamp (entry bar time)
- Entry price (unchanged — do not reverse entry price)
- Original initial risk distance
- Eligible trading session
- Maximum holding period (same as original)
- Commission ($1.24 RT)
- Slippage (2 ticks adverse)
- Data source (canonical OOS dataset)
- Bar resolution (5-minute)

Only the trade direction is reversed.

---

## 7. Rejection Criteria

Separately classify any trade with:
- Missing entry price
- Missing original stop price
- Zero or negative risk distance
- Invalid tick alignment
- Insufficient bars after entry

Required: INVALID_RISK_DISTANCE_EVENTS=0

---

## 8. Terminal Outcomes (Mutually Exclusive)

- TARGET
- STOP
- SESSION_CLOSE_PROFIT
- SESSION_CLOSE_LOSS
- SESSION_CLOSE_FLAT
- END_OF_DATA_PROFIT
- END_OF_DATA_LOSS
- END_OF_DATA_FLAT
- UNFILLED

Required:
- EVENTS_WITH_ZERO_TERMINAL_OUTCOMES=0
- EVENTS_WITH_MULTIPLE_TERMINAL_OUTCOMES=0
- OUTCOME_ACCOUNTING_RECONCILES=TRUE

---

## 9. Statistical Validation Gates

A reversed configuration may be classified **SUPPORTED** only if ALL of:
- Net expectancy > 0
- Profit factor > 1.10
- Bootstrap 95% expectancy lower bound > 0
- Holm-Bonferroni adjusted p-value < 0.05 (permutation test vs matching original control)
- Result is not dependent on one month or one session
- Maximum drawdown is acceptable relative to total net P&L

Otherwise classify: PROMISING / INCONCLUSIVE / REJECTED

**Multiple-comparison correction:** Holm-Bonferroni across 4 reversed configurations.

**Experiment type label:** RETROSPECTIVE_TARGET_MATRIX_WITH_INTERNAL_TEMPORAL_VALIDATION

---

## 10. Walk-Forward Split (Frozen)

- Training: first 60% of filled trades (chronological)
- Validation: final 40% of filled trades (chronological)
- Split frozen before any results are computed
- PARAMETER_CHANGED_AFTER_VALIDATION=FALSE required

---

## 11. Causality Requirements

- FUTURE_BAR_USES=0
- LOOKAHEAD_VIOLATIONS=0
- ENTRY_BEFORE_SIGNAL=0
- EXIT_BEFORE_ENTRY=0
- DUPLICATE_TRADE_IDS=0
- UNEXPLAINED_EVENT_LOSS=0
- DATASET_HASH_MATCH=TRUE
- INPUT_LEDGER_HASH_MATCH=TRUE

---

## 12. No-Parameter-Change Rule

Once this contract is committed to GitHub, no parameter may be changed:
- The 4 target multiples are frozen (1.0R, 1.5R, 2.0R, 2.5R)
- The stop distance is frozen (1.0R)
- The execution assumptions are frozen
- The multiple-comparison method is frozen (Holm-Bonferroni)
- The walk-forward split is frozen (60/40 chronological)

Any parameter change after viewing results invalidates the experiment.

---

## 13. Separate from PV-EXP-004 Monday-Filter Plan

This experiment (reversed-direction matrix) is a separate research hypothesis from the Monday-exclusion prospective validation plan (also labelled PV-EXP-004 in earlier sprints). The Monday-exclusion plan is preserved in PV-EXP-003/PV_EXP_004_PROSPECTIVE_VALIDATION_PLAN.md and is not overwritten by this experiment.

---

## 14. Pre-Registration Attestation

I attest that:
- This contract is committed before any results are computed
- No data has been inspected to inform the choice of configurations
- The 4 target multiples (1.0R, 1.5R, 2.0R, 2.5R) were specified in the sprint brief, not selected from data
- The Holm-Bonferroni correction method was specified in the sprint brief
- The walk-forward split (60/40) was specified in the sprint brief

**DARWIN_DECISION_AUTHORITY: DISABLED**
**DARWIN_EXECUTION_AUTHORITY: DISABLED**
**LIVE_TRADES_INITIATED: 0**
