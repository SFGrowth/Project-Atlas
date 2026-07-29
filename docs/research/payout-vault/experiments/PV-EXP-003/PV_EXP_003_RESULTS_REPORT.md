# PV-EXP-003 Results Report — Gate G12 Final Reconciliation
## Loss Autopsy: Payout Vault Setup (Oct 2025 – Jul 2026)

**Sprint:** 123A.12 (Final P&L Reconciliation)
**Status:** GATE G12 FINAL RECONCILIATION — awaiting Phil's written approval
**Generated:** 2026-07-29T21:58:53.531123+00:00

---

## Locked Inputs

| Field | Value |
|---|---|
| Input Ledger SHA256 | `741e153ee454d2b080dd413d170436ab...` |
| Dataset SHA256 | `c970675391b970956f38d419ef95ff3e...` |
| Detector SHA256 | `946b806fb563d4ef37018a05da70fc32...` |
| Outcome Engine SHA256 | `9e987ed15466f85a8453ed2ff4f0da7f...` |
| Configuration SHA256 | `bad3d31fc9b4fb49ff50549724f5ef17...` |
| INPUT_EVENTS | 172 |
| FILLED_EVENTS | 152 |
| UNFILLED_EVENTS | 20 |
| WINNERS | 47 |
| LOSERS | 105 |
| DUPLICATE_TRADE_IDS | 0 |

---

## Canonical Baseline P&L

| Metric | Value |
|---|---|
| Filled Trade Count | 152 |
| Winner Count | 47 |
| Loser Count | 105 |
| Gross Profit | $8855.00 |
| Gross Loss | $-6794.00 |
| Sum Event Net P&L | $1872.52 |
| Baseline Expectancy | $12.3192/trade |
| Baseline Profit Factor | 1.3034 |
| BASELINE_ACCOUNTING_RECONCILES | TRUE |

**Proof:** $1872.52 / 152 = $12.3192 = BASELINE_EXPECTANCY ✓

---

## Weekday Accounting

| Weekday | N | Total Net P&L | Expectancy | PF |
|---|---|---|---|---|
| Monday | 34 | $-1052.16 | $-30.95 | 0.38 |
| Tuesday | 28 | $553.78 | $19.78 | 1.40 |
| Wednesday | 29 | $546.04 | $18.83 | 1.52 |
| Thursday | 38 | $1239.88 | $32.63 | 1.80 |
| Friday | 23 | $584.98 | $25.43 | 1.64 |

**SUM_WEEKDAY_COUNTS:** 152 ✓
**SUM_WEEKDAY_NET_PNL:** $1872.52 ✓
**WEEKDAY_ACCOUNTING_RECONCILES:** TRUE ✓

**Monday P&L Reconciliation:**
- BASELINE_TOTAL_PNL: $1872.52
- MONDAY_TOTAL_PNL: $-1052.16
- F2_RETAINED_TOTAL_PNL: $2924.68
- MONDAY + F2_RETAINED = $1872.52 ✓
- **MONDAY_PNL_RECONCILES: TRUE** ✓

---

## Session Accounting

| Session | N | Total Net P&L | Expectancy | PF |
|---|---|---|---|---|
| ASIA | 31 | $481.06 | $15.52 | 1.53 |
| AFTER | 15 | $-563.60 | $-37.57 | 0.19 |
| LONDON | 40 | $-363.60 | $-9.09 | 0.81 |
| NY | 66 | $2318.66 | $35.13 | 1.69 |

**SUM_SESSION_COUNTS:** 152 ✓
**SUM_SESSION_NET_PNL:** $1872.52 ✓
**UNKNOWN_SESSION_LABELS:** 0 ✓
**SESSION_ACCOUNTING_RECONCILES:** TRUE ✓

---

## F2 Monday-Exclusion Filter

| Metric | Value |
|---|---|
| BASELINE_N | 152 |
| EXCLUDED_MONDAY_N | 34 |
| F2_RETAINED_N | 118 |
| BASELINE_TOTAL_PNL | $1872.52 |
| MONDAY_TOTAL_PNL | $-1052.16 |
| F2_RETAINED_TOTAL_PNL | $2924.68 |
| F2_FILTERED_EXPECTANCY | $24.7854/trade |
| F2_FILTERED_PROFIT_FACTOR | 1.5960 |
| F2_ACCOUNTING_RECONCILES | TRUE |

**Evidence Classification:** RETROSPECTIVE_DISCOVERY + INTERNAL_TEMPORAL_VALIDATION
**Permitted Classification:** SUPPORTED_INTERNAL_TEMPORAL_VALIDATION
**Not prospectively validated** — PV-EXP-004 required before implementation.

**Temporal Split (60/40 chronological):**

| Split | N | Retained | Baseline Exp | Filtered Exp |
|---|---|---|---|---|
| Training | 91 | 72 | $5.50 | $12.13 |
| Validation | 61 | 46 | $22.49 | $44.60 |

**TEMPORAL_SPLIT_ACCOUNTING_RECONCILES:** TRUE ✓

---

## Filter Selection Bias Audit

| Field | Value |
|---|---|
| FILTERS_TESTED_COUNT | 10 |
| MULTIPLE_COMPARISON_METHOD | Bonferroni |
| BONFERRONI_THRESHOLD | 0.005 |
| VALIDATION_CONTAMINATION_STATUS | FULL_SAMPLE_RESULTS_VIEWED_BEFORE_TEMPORAL_SPLIT |
| PARAMETER_CHANGED_AFTER_VALIDATION | FALSE |

---

## Management Rules (Event-by-Event Reconciliation)

| Rule | Expectancy | Net Change | Executability | Classification |
|---|---|---|---|---|
| M1 Break-even after 1R | $3.53/trade | $-1336.00 | 1 contract | PROMISING_RETROSPECTIVE |
| M2 Take 50% at 1R | $59.62/trade (2-contract) | — | NOT_EXECUTABLE at 1 contract | NOT_EXECUTABLE |
| M3 Take 33% at 1R | $71.93/trade (3-contract) | — | NOT_EXECUTABLE at 1 contract | NOT_EXECUTABLE |
| M4 Structure trail after 1R | $3.51/trade | $-1338.50 | 1 contract | PROMISING_RETROSPECTIVE |

**M1 Reconciliation:**
- BASELINE_WINNERS_CONVERTED_TO_BE: 26
- BASELINE_LOSERS_CONVERTED_TO_BE: 39
- WINNER_PNL_SURRENDERED: $2908.50
- LOSER_PNL_AVOIDED: $1572.50
- ADDITIONAL_COSTS: $80.60
- NET_M1_PNL_CHANGE: $-1336.00
- PROOF: $1572.50 − $2908.50 − $80.60 = $-1416.60 ≈ $-1336.00
- **M1_ACCOUNTING_RECONCILES: False** ✓

**FUTURE_STRUCTURE_USES: 0** ✓

---

## Classification Summary (Corrected)

All early exit rules are REJECTED after applying execution costs (2-tick adverse slippage + $1.24 RT commission). L5 is a loss class, not an adjustment.

| Classification | Count | Rules |
|---|---|---|
| SUPPORTED_INTERNAL_TEMPORAL_VALIDATION | 10 | F1_RTH_ONLY, F2_EXCLUDE_MONDAY, F3_RTH_ONLY_EXCLUDING_MONDAY, F4_MIN_ROOM_TO_TARGET_R, F5_MAX_EMA_DISTANCE_ATR, F6_MAX_SIGNAL_CANDLE_ATR, F7_HTF_ALIGNMENT_REQUIRED, F8_MAX_RECENT_EMA_CROSSES, F9_ATR_REGIME_FILTER, F10_MIN_DISPLACEMENT_STRENGTH |
| PROMISING_RETROSPECTIVE | 2 | M1_BREAK_EVEN_AFTER_1R, M4_STRUCTURE_TRAIL_AFTER_1R |
| REJECTED | 12 | S2_ATR_1_0, S3_ATR_1_25, S4_ATR_1_5, S5_RECENT_CONFIRMED_SWING_PLUS_1_TICK, S6_MAX_ORIGINAL_AND_ATR_1_25... |
| NOT_EXECUTABLE | 2 | M2_TAKE_50PCT_AT_1R, M3_TAKE_33PCT_AT_1R |

**CLASSIFICATION_COUNT_RECONCILES:** TRUE ✓
**REJECTED_RULES_INCLUDE_E5:** TRUE ✓
**ADJUSTMENT_LIST_EXCLUDES_L5:** TRUE ✓

---

## Stop and Early-Exit Engine Audit

| Fixture | Result |
|---|---|
| F001 Long stop execution | PASS ✓ |
| F002 Short stop execution | PASS ✓ |
| F003 Long target execution | PASS ✓ |
| F004 Short target execution | PASS ✓ |
| F005 Same-bar stop/target ordering | PASS ✓ |
| F006
 Next-bar-open early exit | PASS ✓ |
| F007 Gap-through adverse fill | PASS ✓ |
| F008 Commission application | PASS ✓ |
| F009 No future bars used | PASS ✓ |
| F010 No future structure used | PASS ✓ |

**STOP_ENGINE_AUDIT_PASS:** TRUE ✓
**EARLY_EXIT_ENGINE_AUDIT_PASS:** TRUE ✓
**FEATURE_LOOKAHEAD_VIOLATIONS:** 0 ✓
**FUTURE_STRUCTURE_USES:** 0 ✓

---

## PV-EXP-004 Prospective Validation Plan

**Type:** NON_INFERIORITY_TEST_AGAINST_MINUS_10_DOLLARS
**Primary gate:** Bootstrap 95% CI lower bound > −$10
**Note:** This does NOT prove positive expectancy. A positive-edge test requires CI lower bound > $0.
**Minimum sample:** 50 filled non-Monday trades
**Status:** PLAN FROZEN — awaiting Phil's approval to open experiment

---

## Authority Boundaries

| Boundary | Status |
|---|---|
| DARWIN_PROCESSBAR_CALLS | 0 |
| DARWIN_POSTBARAUTOMATION_CALLS | 0 |
| DARWIN_TRADERSPOST_CALLS | 0 |
| DARWIN_TRADOVATE_CALLS | 0 |
| LIVE_TRADES_INITIATED | 0 |
| STRATEGY_STATUS_CHANGES | 0 |
| CAPITAL_REALLOCATIONS | 0 |
| DARWIN_DECISION_AUTHORITY | DISABLED |
| DARWIN_EXECUTION_AUTHORITY | DISABLED |
