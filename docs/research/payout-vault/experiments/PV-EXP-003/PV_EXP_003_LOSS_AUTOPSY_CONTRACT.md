# PV-EXP-003 Loss Autopsy Contract
## Pre-Registered Before Results

**Experiment ID:** PV-EXP-003  
**Sprint:** 123A.12  
**Pre-Registration Date:** 2026-07-29  
**G11 Baseline Branch Head:** `4c4f7ead1e58ffff3cb7da54602a8bd21e475d15`  
**Status:** PRE_REGISTERED  
**Authority:** RESEARCH_ONLY — No live trades, no execution authority, no strategy creation

---

## Locked Inputs (Verified Before Contract Commit)

| Input | Value |
|---|---|
| INPUT_EVENTS | 172 |
| FILLED_EVENTS | 152 |
| WINNERS | 47 |
| LOSERS | 105 |
| LOSS_RATE | 0.690789 |
| INPUT_HASH_MATCH | TRUE |
| UNEXPLAINED_EVENT_LOSS | 0 |
| Outcome ledger SHA | `741e153ee454d2b080dd413d170436abb1400ecae3fbc10f627bffce9acf0989` |
| Event ledger SHA | `9240cbb16f5cd2933ad198448853e7f8a0281cf5eac4106bbc526930f8634bb3` |
| Configuration SHA | `2b629a56e1fd42572f9d14e86c0e79291b6a670f46a36d2aad9810f342701762` |
| Outcome engine SHA | `9e987ed15466f85a8453ed2ff4f0da7fe526bca2f96a2d63a8df0549af1111c7` |
| Dataset SHA | `c970675391b970956f38d419ef95ff3e116e61ab8874eca7df2ab4334e715623` |

---

## Primary Question

Which measurable, repeatable mechanisms explain the 105 losing trades, and which mechanisms can be mitigated using information available at or shortly after entry?

---

## Null Hypothesis

No entry-time or early-trade characteristic can distinguish losing trades from winning trades with stable out-of-sample value.

---

## Research Classes (Strictly Separated)

### Class A — Entry Filters
Information known **before** entry. All features in this class must use only data available at the moment of entry signal. No post-entry path information is permitted.

### Class B — Stop and Target Geometry
Path-dependent analysis used to identify placement errors. Examines whether the stop was inside normal noise, inside recent structure, too tight relative to ATR, or correctly placed at thesis invalidation. Tests alternative stop placements S1–S7.

### Class C — Early Trade Management
Rules using only the first 1 to 6 bars after entry. Tests early exit rules E1–E6 and partial management rules M1–M4. No look-ahead beyond the management bar.

These three classes must not be mixed in the same test or combined in this sprint.

---

## Loss Classification Hierarchy (Pre-Registered)

The following 12 loss classes are applied in strict priority order. Every loser receives exactly one primary class. The hierarchy is applied top-to-bottom; the first matching class wins.

| Priority | Class | Definition |
|---|---|---|
| 1 | L11_SAME_BAR_AMBIGUITY | Stop and target both touched in the same bar |
| 2 | L2_STOPPED_THEN_TARGET | Stop hit, but price subsequently reaches original 2R target within same session |
| 3 | L1_IMMEDIATE_ADVERSE_MOVE | MAE reaches 1R before MFE reaches 0.25R |
| 4 | L3_PARTIAL_PROGRESS_THEN_REVERSAL | Trade reaches ≥0.5R but later exits at a loss |
| 5 | L4_NO_MOMENTUM_TIMEOUT | Fails to reach 0.25R within 6 bars of entry |
| 6 | L5_OPPOSING_LEVEL_BLOCK | Room to nearest opposing level < 1.0R at entry |
| 7 | L6_EXTENDED_FROM_EMA | Entry distance from EMA15 > 1.5 × ATR14 |
| 8 | L7_EXHAUSTION_CANDLE | Signal candle range > 2.0 × ATR14 and entry within 20% of candle extreme |
| 9 | L8_HIGHER_TIMEFRAME_CONFLICT | Trade direction conflicts with higher-timeframe EMA structure |
| 10 | L9_VOLATILITY_STOP_MISMATCH | Stop distance < 0.5 × ATR14 and trade later recovers to entry |
| 11 | L10_SESSION_OR_WEEKDAY_WEAKNESS | Trade in Monday session (pre-registered weak bucket from PV-EXP-002 subgroup analysis) |
| 12 | L12_OTHER | No preceding class applies |

Secondary tags are retained but not used in primary reconciliation.

---

## Pre-Registered Thresholds

All thresholds below are frozen before any outcome data is examined.

| Parameter | Value | Basis |
|---|---|---|
| L1 MAE threshold | 1.0R | Definition: stop hit |
| L1 MFE threshold | 0.25R | Definition: no meaningful progress |
| L2 recovery window | Same session | Definition |
| L3 progress threshold | 0.5R | Definition |
| L4 momentum window | 6 bars | Definition |
| L5 room threshold | 1.0R | Theory: need room to target |
| L6 EMA distance threshold | 1.5 × ATR14 | Theory: mean reversion risk |
| L7 candle range threshold | 2.0 × ATR14 | Theory: exhaustion |
| L7 entry extreme threshold | 20% of candle range | Theory |
| L9 stop minimum | 0.5 × ATR14 | Theory: inside noise |
| L10 weak bucket | Monday | Pre-registered from PV-EXP-002 subgroup (PF=0.37) |

---

## Entry Filter Pre-Registration

The following filters and thresholds are frozen before outcome testing:

| Filter | Threshold | Basis |
|---|---|---|
| F1_RTH_ONLY | Session = RTH | Pre-registered from PV-EXP-002 (RTH PF=1.51) |
| F2_EXCLUDE_MONDAY | Weekday ≠ Monday | Pre-registered from PV-EXP-002 (Monday PF=0.37) |
| F3_RTH_ONLY_EXCLUDING_MONDAY | F1 AND F2 | Pre-registered combination |
| F4_MIN_ROOM_TO_TARGET_R | room_to_target_r ≥ 1.0R | Theory-based (same as L5) |
| F5_MAX_EMA_DISTANCE_ATR | distance_from_ema15_atr ≤ 1.5 | Theory-based (same as L6) |
| F6_MAX_SIGNAL_CANDLE_ATR | signal_candle_range_atr ≤ 2.0 | Theory-based (same as L7) |
| F7_HTF_ALIGNMENT_REQUIRED | DOL_HTF_alignment = True | Theory-based |
| F8_MAX_RECENT_EMA_CROSSES | number_of_recent_ema_crosses ≤ 2 | Theory: choppy market |
| F9_ATR_REGIME_FILTER | ATR_percentile ≥ 25th | Theory: avoid dead markets |
| F10_MIN_DISPLACEMENT_STRENGTH | displacement_strength ≥ 0.5 | Theory: weak displacement |

---

## Stop Placement Alternatives (Pre-Registered)

| Alternative | Definition |
|---|---|
| S1 | Original stop (sweep_level) |
| S2 | 1.0 × ATR14 from entry |
| S3 | 1.25 × ATR14 from entry |
| S4 | 1.5 × ATR14 from entry |
| S5 | Recent structural swing + 1 tick |
| S6 | max(original stop, 1.25 × ATR14) |
| S7 | max(structural stop, 1.25 × ATR14) |

---

## Early Exit Rules (Pre-Registered)

| Rule | Definition |
|---|---|
| E1 | Exit after 3 bars if MFE < 0.25R |
| E2 | Exit after 3 bars if MFE < 0.25R AND close back through signal midpoint |
| E3 | Exit after 3 bars if MFE < 0.25R AND close back through EMA15 |
| E4 | Exit on opposite CSD after entry |
| E5 | Exit on opposite MSU after entry |
| E6 | Time stop after 6 bars without reaching 0.5R |

---

## Partial Management Rules (Pre-Registered)

| Rule | Definition |
|---|---|
| M1 | Move stop to break-even after 1R |
| M2 | Take 50% at 1R, retain 50% for 2R |
| M3 | Take 33% at 1R, retain 67% for 2R |
| M4 | Trail behind confirmed structure only after 1R |

---

## Temporal Validation Split

- Training period: first 60% of OOS data (chronological)
- Validation period: final 40% of OOS data (untouched during threshold selection)
- Any threshold learned from training must remain frozen in validation
- Rolling 30-trade windows and quarter-by-quarter analysis required

---

## Required Accounting Invariants

| Invariant | Requirement |
|---|---|
| TOTAL_CLASSIFIED_LOSERS | = 105 |
| UNCLASSIFIED_LOSERS | = 0 |
| MULTI_PRIMARY_CLASS_LOSERS | = 0 |
| LOSS_CLASS_ACCOUNTING_RECONCILES | = TRUE |
| FEATURE_LOOKAHEAD_VIOLATIONS | = 0 |
| PARAMETER_CHANGED_AFTER_VALIDATION | = FALSE |

---

## Authority Boundaries

| Boundary | Requirement |
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

This is a historical research experiment only. No live or paper execution will be initiated.

---

## Preventability Classification Definitions

| Class | Definition |
|---|---|
| HIGH | A deterministic entry or management rule could plausibly reduce the loss using legally available information |
| MEDIUM | Potentially preventable, but the rule is uncertain or path-dependent |
| LOW | The thesis failed immediately and no reasonable adjustment would have helped |

A loss is not classified as preventable merely because price later recovered.

---

*Pre-registered: 2026-07-29 | Atlas Nexus DARWIN Research Protocol | Sprint 123A.12*
