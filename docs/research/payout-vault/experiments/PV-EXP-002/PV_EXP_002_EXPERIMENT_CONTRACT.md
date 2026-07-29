# PV-EXP-002 — Experiment Contract (Pre-Registered)

## Status: PRE-REGISTERED — Committed before results are generated

**Sprint:** 123A.11
**Experiment ID:** PV-EXP-002
**Branch:** sprint/123a-11-pv-exp-002-profitability-analysis
**G10 Baseline SHA:** 18bffe1fe86b89c838dd2faa8fb21c25ef2eec14
**Pre-registration date:** 2026-07-29 UTC

---

## 1. Experiment Objective

Measure the profitability, MAE/MFE profile, directional accuracy, session/regime
dependence, temporal stability, and robustness of the 172 canonical Payout Vault
events identified in PV-EXP-001 under pre-registered entry, stop, and target
configurations.

This is a historical research experiment. No live, paper, or shadow execution
will be activated. No strategy will be promoted. No capital will be reallocated.

---

## 2. Primary Hypothesis

The 172 canonical Payout Vault events produce positive net expectancy after
realistic costs (2-tick slippage per side, $0.62 commission per contract) under
the primary configuration (Entry A / Stop S1 / Target T3 / 2R).

---

## 3. Null Hypothesis

The 172 canonical Payout Vault events produce zero or negative net expectancy
after realistic costs under the primary configuration. Any observed positive
expectancy is consistent with random variation.

---

## 4. Canonical Event Input

| Field | Value |
|---|---|
| Source | DETECTOR_CANONICAL_EVENT_LEDGER.json |
| Event Count | 172 |
| Ledger SHA-256 | 9240cbb16f5cd2933ad198448853e7f8a0281cf5eac4106bbc526930f8634bb3 |
| Scanner Ledger SHA-256 | 43aa07a21ea220157b1bdaeeb0f6fc12a1bab2aadc0d84cf8498b0eab25f8352 |
| Dataset SHA-256 | c970675391b970956f38d419ef95ff3e116e61ab8874eca7df2ab4334e715623 |
| Detector SHA-256 | 946b806fb563d4ef37018a05da70fc326e1564ca40c8c206be29b76666b717ec |
| OOS Window Start | 2025-10-01T00:00:00+00:00 |
| OOS Window End | 2026-07-20T23:59:59+00:00 |
| Min Event Timestamp | 2025-10-01T13:50:00+00:00 |
| Max Event Timestamp | 2026-07-16T05:45:00+00:00 |

The 172 events must remain unchanged throughout PV-EXP-002. No events may be
removed based on direction, outcome, session, regime, or any post-hoc criterion.

---

## 5. Primary Entry Model (Entry A)

**Rule:** Enter at the open of the bar immediately following the information
cutoff bar (bar_index + 1 in the OOS-filtered sub-dataset).

**Entry price:** `df_oos.iloc[bar_index + 1]["open"]`

**Slippage:** 2 ticks adverse (added to entry price for longs, subtracted for
shorts).

**Tick size:** 0.25 points (MNQ)
**Tick value:** $0.50 per tick per contract

**Entry price after slippage:**
- Long: `open + 2 * 0.25 = open + 0.50`
- Short: `open - 2 * 0.25 = open - 0.50`

---

## 6. Primary Stop Model (Stop S1)

**Rule:** Stop is placed at the `sweep_level` field from the event ledger.

**Stop distance (initial risk):**
- Long: `entry_price_after_slippage - sweep_level`
- Short: `sweep_level - entry_price_after_slippage`

**Stop fill convention:** Stop is triggered when the bar's low (long) or high
(short) touches or crosses the stop level. Fill price = stop level (no additional
slippage on stop exit — stop slippage is included in the 2-tick entry slippage
assumption).

**Unfilled condition:** If `sweep_level` is None or missing, the event is
UNFILLED.

---

## 7. Primary Target Model (Target T3)

**Rule:** Target = 2R from entry (after slippage).

**Target price:**
- Long: `entry_price_after_slippage + 2 * initial_risk`
- Short: `entry_price_after_slippage - 2 * initial_risk`

**Target fill convention:** Target is triggered when the bar's high (long) or
low (short) touches or crosses the target level. Fill price = target level.

---

## 8. Slippage Assumptions

| Scenario | Ticks |
|---|---|
| Standard (primary) | 2 ticks per side |
| Zero slippage (gross) | 0 ticks |
| Conservative | 3 ticks |
| Extreme | 4 ticks |

Slippage is applied adversely: added to entry for longs, subtracted for shorts.
Exit slippage is embedded in the stop/target fill convention (fills at level, not
through level).

---

## 9. Commission Assumptions

**Commission:** $0.62 per contract per side (round-turn = $1.24)

This is applied to every filled trade regardless of exit reason.

---

## 10. Session-Close Treatment

**Session close time:** 16:00 CT (21:00 UTC) — end of RTH session.

If a trade is open at session close, it is exited at the close bar's close price.

**Exit reason:** `SESSION_CLOSE_PROFIT`, `SESSION_CLOSE_LOSS`, or
`SESSION_CLOSE_FLAT` depending on net P&L.

Commission is applied. Slippage is not applied to session-close exits (market
order at close is assumed to fill at close price).

---

## 11. End-of-Data Treatment

If a trade is open at the last bar of the dataset, it is exited at that bar's
close price.

**Exit reason:** `END_OF_DATA_PROFIT`, `END_OF_DATA_LOSS`, or `END_OF_DATA_FLAT`
depending on net P&L.

Commission is applied. Slippage is not applied.

---

## 12. Same-Bar Stop/Target Ambiguity Rule

**Conservative rule:** If both stop and target are triggered on the same bar
(i.e., the bar's range covers both levels), the stop is assumed to be hit first.

**Rationale:** This is the most conservative assumption and avoids favouring the
strategy with intrabar ordering.

---

## 13. Fill Ordering

For each bar after entry:
1. Check stop first (conservative same-bar rule).
2. If stop not triggered, check target.
3. If neither, check session close.
4. If end of dataset, close at last bar's close.

---

## 14. MAE/MFE Formulas

**For long trades:**

```
MFE_TICKS = max(high_after_entry - entry_price_after_slippage) / tick_size
MAE_TICKS = max(entry_price_after_slippage - low_after_entry) / tick_size
```

**For short trades:**

```
MFE_TICKS = max(entry_price_after_slippage - low_after_entry) / tick_size
MAE_TICKS = max(high_after_entry - entry_price_after_slippage) / tick_size
```

**R values:**

```
MFE_R = MFE_TICKS / initial_risk_ticks
MAE_R = MAE_TICKS / initial_risk_ticks
```

Where `initial_risk_ticks = initial_risk_dollars / tick_value`.

**Measurement window:** From the entry bar (inclusive) to the exit bar (inclusive).

**Invariants (must hold):**

```
REACH_025R_COUNT >= REACH_050R_COUNT >= REACH_075R_COUNT >= REACH_100R_COUNT
REACH_100R_COUNT >= REACH_150R_COUNT >= REACH_200R_COUNT >= TARGET_2R_WINNERS
```

No 2R winner may report MFE_R below 2.0.

---

## 15. Matrix Dimensions (Robustness Matrix)

The robustness matrix is a fixed Cartesian product defined before execution:

| Dimension | Values |
|---|---|
| Entry Models | A, B, EMA (3) |
| Stop Models | fixed_10t, fixed_15t, fixed_20t, atr_1.0, atr_1.5, atr_2.0, structure_s1 (7) |
| Target Models | 1R, 1.5R, 2R, 3R (4) |
| Slippage | 0, 1, 2, 3, 4 ticks (5) |

**Total configurations:** 3 × 7 × 4 × 5 = **420**

The exact configuration count is 420. This is frozen before execution.

---

## 16. Subgroup Analyses

Subgroups to be analysed:
- Direction (bullish / bearish)
- Session (RTH / ETH / overnight)
- Weekday (Mon–Fri)
- Month (Oct 2025 – Jul 2026)
- Regime (trending / ranging — defined by ADX threshold at signal time)
- Volatility bucket (low / medium / high — defined by ATR percentile at signal time)

**Required reconciliation:** BULLISH_N + BEARISH_N = 172

Minimum sample-size warning: displayed for any subgroup with N < 20.

---

## 17. Bootstrap Method

- Bootstrap unit: individual trades (IID bootstrap)
- Iterations: 10,000
- Statistic: mean net P&L per trade (expectancy)
- Confidence level: 95%
- Random seed: 42

Also run temporal block bootstrap:
- Block length: 10 trades
- Iterations: 10,000
- Seed: 42

---

## 18. Permutation Test

- Null: trade outcomes are random (no directional edge)
- Test statistic: mean net P&L per trade
- Iterations: 10,000
- Seed: 42
- Two-tailed p-value reported

---

## 19. Multiple-Comparison Method

- Method: Benjamini-Hochberg (BH) FDR correction
- Applied across all 420 matrix configurations
- Significance threshold: α = 0.05
- Report: number of configurations surviving BH correction

---

## 20. Pass/Fail Criteria

**RESEARCH_PASS** requires ALL of:
- Net expectancy at standard costs (2-tick slippage, $1.24 commission) > 0
- 95% CI lower bound > −$10/trade (materially positive)
- Profit factor > 1.0
- Max drawdown < 50% of gross profit
- Result not dependent on a single subgroup with N < 20
- At least one quarter shows positive expectancy (temporal robustness)
- At least one configuration survives BH multiple-comparison correction

**RESEARCH_FAIL** if:
- Primary net expectancy ≤ 0
- No configuration positive at standard costs after BH correction
- Temporal stability absent (all quarters negative)

**INCONCLUSIVE** if:
- Sample size < 50 filled events
- Unresolved data-quality issues
- Conflicting evidence that cannot be resolved

---

## 21. Stop Conditions

Stop and report GATE_G11_BLOCKED if:
- Input ledger is not the approved 172-event ledger
- Locked input hashes differ
- Any event has multiple or zero terminal outcomes
- Outcome accounting does not reconcile
- MAE/MFE invariants fail
- Event timestamps fall outside canonical window
- Monthly counts do not sum to 172
- Matrix cardinality ≠ 420
- Any required test fails
- Reproducibility fails
- Authority counters are non-zero

---

## 22. Authority Boundaries

This experiment is historical research only.

```
DARWIN_PROCESSBAR_CALLS=0
DARWIN_POSTBARAUTOMATION_CALLS=0
DARWIN_TRADERSPOST_CALLS=0
DARWIN_TRADOVATE_CALLS=0
LIVE_TRADES_INITIATED=0
STRATEGY_STATUS_CHANGES=0
CAPITAL_REALLOCATIONS=0
DARWIN_DECISION_AUTHORITY=DISABLED
DARWIN_EXECUTION_AUTHORITY=DISABLED
```

No strategy may be promoted from this sprint.
No capital allocation may be changed.
Do not begin PV-EXP-003.
Do not begin Sprint 123A.12.

---

*This contract is pre-registered and committed before any profitability results
are generated. The primary classification may not be changed after results are
known.*
