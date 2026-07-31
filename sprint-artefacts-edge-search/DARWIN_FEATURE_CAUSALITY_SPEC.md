# DARWIN Feature Causality Specification

**Version:** 1.0.0
**Created:** 2026-07-31T01:18:00Z
**Sprint:** darwin-complete-edge-search-universe
**Status:** PRE-REGISTRATION

---

## 1. Causality Principle

Every feature used in a DARWIN hypothesis must be **strictly causal**: it must be computable from data that was available at or before the bar close timestamp used as the feature snapshot timestamp.

**FUTURE_DATA_USES=0** is a hard invariant. Any feature that references a future bar's open, high, low, close, or volume is a causality violation and must be rejected.

---

## 2. Causality Violation Categories

| Category | Description | Example |
|---|---|---|
| DIRECT_LOOKAHEAD | Feature references a future bar directly | Using next bar's open as entry price |
| INDIRECT_LOOKAHEAD | Feature uses a calculation that implicitly requires future data | Using session VWAP computed at session close for a mid-session bar |
| HINDSIGHT_LABEL | Outcome label computed using future data leaks into features | Labelling a bar as "winner" based on subsequent bars, then using the label as a feature |
| STALE_REFERENCE | Feature uses a level that was not yet established at bar time | Using the day's high as a structural level before the day closes |
| PARAMETER_HINDSIGHT | Parameters selected by looking at outcomes first | Choosing ATR period after observing which period maximises backtest profit |

---

## 3. Causality Validation Rules

### Rule CV-001: Timestamp Ordering
For every feature snapshot row, all input data timestamps must satisfy:
`input_bar_timestamp ≤ feature_snapshot_timestamp`

### Rule CV-002: Session VWAP Causality
Session VWAP at bar T is computed using only bars from the session open up to and including bar T. It does not use any bar after T.

### Rule CV-003: Structural Level Causality
Prior-day high/low are computed from the previous completed RTH session. They become available at the prior session close and remain fixed for the current session. They do not update intraday.

Opening-range high/low are computed from the first 30 minutes of RTH. They are only available after minute 30 of RTH. Bars before minute 30 must have `opening_range_high=NULL` and `opening_range_low=NULL`.

### Rule CV-004: EMA Causality
EMA values are computed using only bars at or before the snapshot timestamp. The EMA warm-up period must be satisfied before the feature is considered valid. Bars within the warm-up period must have `data_quality_status='STALE'` for EMA-dependent features.

### Rule CV-005: ATR Causality
ATR14 at bar T uses the 14 bars ending at T (inclusive). It does not use bar T+1 or later.

### Rule CV-006: Swing High/Low Causality
A swing high at bar T requires confirmation from subsequent bars. The confirmation bars are after T, so the swing high is only recorded in the feature snapshot for bar T+N where N is the confirmation lookback. The feature `recent_swing_high` reflects the most recently confirmed swing high, not the current bar's potential swing.

### Rule CV-007: Regime Classification Causality
Regime classification at bar T uses only features computed from bars ≤ T. It does not use any future bar.

### Rule CV-008: No Post-Hoc Filtering
Features must not be filtered or selected based on observed outcomes. The feature set is frozen before any hypothesis is tested.

---

## 4. Causality Test Suite

The following tests are required to pass before any feature snapshot service is deployed:

| Test ID | Description |
|---|---|
| CAUS-001 | All feature timestamps ≤ bar close timestamp |
| CAUS-002 | Session VWAP computed from session-open bars only |
| CAUS-003 | Opening-range features NULL before minute 30 of RTH |
| CAUS-004 | Prior-day levels fixed at prior session close |
| CAUS-005 | EMA values match independent calculation from same bar window |
| CAUS-006 | ATR14 matches independent calculation from same 14-bar window |
| CAUS-007 | Swing high/low only confirmed after lookback bars |
| CAUS-008 | Regime classification uses only ≤T features |
| CAUS-009 | No feature references any bar with timestamp > feature_snapshot_timestamp |
| CAUS-010 | Feature version increments when any formula changes |

---

## 5. Feature Versioning

When any feature formula changes:

1. Increment `feature_version` (semver: MAJOR.MINOR.PATCH).
2. MAJOR: formula change that alters the meaning or scale of the feature.
3. MINOR: formula change that adds precision without altering meaning.
4. PATCH: bug fix that corrects an incorrect implementation.

All hypotheses record the `feature_version` at the time of pre-registration. A hypothesis tested on version 1.0.0 features is not automatically valid for version 2.0.0 features without re-registration.

---

## 6. Data Quality Flags

| Flag | Condition | Action |
|---|---|---|
| MISSING | Required input bar is absent | Set `data_quality_status='MISSING'`; exclude from experiments |
| STALE | Input bar is older than expected (gap in feed) | Set `data_quality_status='STALE'`; flag in experiment results |
| ROLL | Contract roll occurred within last 3 bars | Set `contract_roll_flag=TRUE`; exclude from experiments unless roll-aware |
| OK | All inputs present and current | Normal processing |
