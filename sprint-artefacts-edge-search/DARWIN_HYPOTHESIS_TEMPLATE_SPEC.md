# DARWIN Hypothesis Template Specification

**Version:** 1.0.0
**Created:** 2026-07-31T01:18:00Z
**Sprint:** darwin-complete-edge-search-universe
**Status:** PRE-REGISTRATION

---

## 1. Purpose

Every DARWIN hypothesis must be precisely defined before any data is examined. Vague ideas are not hypotheses. A hypothesis is a structured, falsifiable, pre-registered claim about a specific market behaviour under specific conditions.

---

## 2. Hypothesis Structure

Every hypothesis must use the following structure:

```
WHEN:
  A precisely defined causal market condition occurs.

UNDER:
  A defined timeframe, session and regime.

THEN:
  A defined future market behaviour may be more likely.

MEASURE:
  A fixed set of future outcomes over frozen horizons.
```

---

## 3. Required Fields

| Field | Type | Description |
|---|---|---|
| HYPOTHESIS_ID | VARCHAR(40) | Unique ID: {FAMILY}-{RULE_ID}-{K}-{YYYYMMDD} |
| HYPOTHESIS_FAMILY | VARCHAR(10) | Research family ID (A–X) |
| HYPOTHESIS_FAMILY_K | INT | Sequential counter within family (prevents p-hacking) |
| TITLE | VARCHAR(300) | Human-readable title |
| MECHANISM_RATIONALE | TEXT | Why this behaviour should exist (causal explanation) |
| TRIGGER_CONDITION | TEXT | Precise, reproducible trigger definition |
| CONTEXT_CONDITION | TEXT | Timeframe, session, regime, structural context |
| OUTCOME_DEFINITION | TEXT | Exact outcome being measured |
| FORWARD_HORIZONS | JSON | Array of bar counts for outcome measurement |
| DIRECTION | ENUM | LONG, SHORT, or BOTH |
| TIMEFRAME | VARCHAR(20) | Bar timeframe (1m, 5m, 15m, 30m, 60m) |
| SESSION | VARCHAR(50) | Session scope (NY_RTH, LONDON, ALL, etc.) |
| REGIME | VARCHAR(50) | Regime scope (TRENDING, RANGING, ALL, etc.) |
| MINIMUM_SAMPLE | INT | Minimum required occurrences for valid test |
| MINIMUM_INDEPENDENT_SESSIONS | INT | Minimum independent trading sessions required |
| DATASET | VARCHAR(100) | Dataset identifier used for discovery |
| DATASET_SHA | VARCHAR(64) | SHA-256 of dataset file (frozen at pre-registration) |
| COST_MODEL | JSON | Slippage and commission assumptions |
| VALIDATION_PLAN | TEXT | Which stages will be run and in what order |
| NULL_HYPOTHESIS | TEXT | H0: the behaviour has no predictive value |
| ALTERNATIVE_HYPOTHESIS | TEXT | H1: the behaviour has positive/negative predictive value |
| CONDITION_SIGNATURE | VARCHAR(64) | SHA-256 of canonical trigger+context string (deduplication key) |
| PARENT_HYPOTHESIS_ID | VARCHAR(40) | ID of parent hypothesis (for refinements) |
| PARENT_FINDING_ID | VARCHAR(40) | ID of finding that motivated this hypothesis |
| SOURCE_OBSERVATION_IDS | JSON | Array of observation IDs that triggered this hypothesis |
| PRIOR_MEMORY_MATCH_IDS | JSON | Array of memory IDs checked before pre-registration |
| PRIORITY_SCORE | DECIMAL(5,2) | Composite priority score (0–100) |
| PRIORITY_LEVEL | ENUM | LOW, MEDIUM, HIGH, CRITICAL_REVIEW |
| RULE_ID | VARCHAR(30) | Associated rule from rule library |
| STATUS | ENUM | See classification system |
| CREATED_AT | DATETIME(3) | Pre-registration timestamp |
| UPDATED_AT | DATETIME(3) | Last update timestamp |

---

## 4. Hypothesis ID Format

```
{FAMILY_ID}-{RULE_ID}-K{K_COUNT}-{YYYYMMDD}
```

Example: `B-MS001-K001-20260731`

The K counter increments for every hypothesis created within the same family-rule combination, regardless of whether the hypothesis was tested or rejected. This prevents the family K count from being reset to hide the number of attempts.

---

## 5. Condition Signature

The condition signature is a SHA-256 hash of the canonical string:

```
{FAMILY_ID}|{TIMEFRAME}|{SESSION}|{DIRECTION}|{TRIGGER_CONDITION_NORMALISED}|{CONTEXT_CONDITION_NORMALISED}|{FORWARD_HORIZONS_SORTED}
```

All whitespace is normalised, all strings are lowercased, and forward horizons are sorted ascending before hashing. This signature is used for deduplication: if a new hypothesis has the same signature as an existing one, it is a duplicate and must not be registered.

---

## 6. Example Hypothesis

```
HYPOTHESIS_ID: H-VW001-K001-20260731
HYPOTHESIS_FAMILY: H
HYPOTHESIS_FAMILY_K: 1
TITLE: Overnight-low reclaim in NY RTH predicts positive 6-bar forward return

MECHANISM_RATIONALE:
  When price trades below the overnight low and then closes back above it,
  short sellers who positioned on the breakdown are trapped. The reclaim
  signals that the breakdown was a liquidity sweep rather than genuine
  directional continuation. Trapped shorts covering creates buying pressure
  that may sustain upward movement over the next several bars.

TRIGGER_CONDITION:
  1. Price trades below overnight_low by at least 0.25 × atr14.
  2. The same 5-minute bar closes above overnight_low.
  3. No prior reclaim of overnight_low has occurred in the current session.

CONTEXT_CONDITION:
  Timeframe: 5m
  Session: NY_RTH
  Regime: NORMAL or HIGH volatility (vol_regime IN ('NORMAL','HIGH'))
  Structural context: overnight_low is available (time_from_rth_open_min >= 0)

OUTCOME_DEFINITION:
  Forward return measured as (close[T+N] − close[T]) / atr14[T]
  where T is the trigger bar close.

FORWARD_HORIZONS: [1, 3, 6]

DIRECTION: LONG
TIMEFRAME: 5m
SESSION: NY_RTH
REGIME: NORMAL or HIGH volatility
MINIMUM_SAMPLE: 50
MINIMUM_INDEPENDENT_SESSIONS: 5

COST_MODEL:
  slippage_ticks: 1
  commission_per_side_ticks: 0.5
  total_round_trip_ticks: 3

NULL_HYPOTHESIS:
  H0: The forward return distribution after overnight-low reclaim is not
  materially different from the unconditional distribution.

ALTERNATIVE_HYPOTHESIS:
  H1: The forward return distribution after overnight-low reclaim has a
  positive mean that exceeds round-trip costs after BH-FDR correction.

VALIDATION_PLAN:
  Stage 1 (Discovery): 2023-01-01 to 2024-06-30
  Stage 2 (Chronological Validation): 2024-07-01 to 2025-06-30
  Stage 3 (Walk-Forward): 6-month rolling windows
  Stage 4 (Robustness): ±0.1 ATR trigger threshold, ±1 forward horizon
  Stage 5 (Prospective Shadow): 30 trading days live observation
```

---

## 7. Pre-Registration Gate

Before any data is examined, the following must be recorded and immutable:

1. HYPOTHESIS_ID (assigned)
2. CONDITION_SIGNATURE (computed and stored)
3. PRIOR_MEMORY_LOOKUP completed (PRIOR_MEMORY_MATCH_IDS populated)
4. DATASET_SHA (frozen)
5. FORWARD_HORIZONS (frozen)
6. COST_MODEL (frozen)
7. MINIMUM_SAMPLE (frozen)
8. NULL_HYPOTHESIS and ALTERNATIVE_HYPOTHESIS (frozen)
9. STATUS set to QUEUED

Any change to frozen fields after data examination is a POST_HOC_PARAMETER_CHANGE violation.

---

## 8. Hypothesis Generation Sources

| Source | Code | Description |
|---|---|---|
| Live Anomaly | A | A live feature materially differs from its historical baseline |
| Repeated Live Behaviour | B | Same condition appears across multiple independent sessions |
| Historical Association Scan | C | Pre-approved research family shows stable relationship |
| Failure Autopsy | D | Rejected strategy contains materially different winner/loser subsets |
| Regime Asymmetry | E | Condition behaves differently across direction/session/volatility/trend |
| Research Memory | F | Prior rejected/inconclusive hypothesis receives materially new evidence |
| User-Supplied Idea | G | Phil provides a strategy or observation for exact baseline testing |
| External Research Side Quest | H | Sanitised public research idea independently translated (idea only, never evidence) |
| Event-Sequence Discovery | I | Repeated causal sequences appear in historical or live feature data |
| Negative-Edge Discovery | J | Conditions consistently predict poor trade quality |

---

## 9. Rejection Before Testing

A hypothesis must be rejected before testing when any of the following apply:

- Duplicate research exists (same condition_signature in memory)
- Sample is insufficient (estimated occurrences < MINIMUM_SAMPLE)
- Data is unavailable for required features
- Future information is required for the trigger condition
- Execution is unrealistic (move smaller than round-trip cost)
- Parameter precision is excessive (threshold requires tick-level precision)
- Likely move is cost-dominated
- No mechanism rationale exists
- Condition is not reproducible from frozen rules
- Too many interacting features (> MAX_FEATURES_PER_HYPOTHESIS)
