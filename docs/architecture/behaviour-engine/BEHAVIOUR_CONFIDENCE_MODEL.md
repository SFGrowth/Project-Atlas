# Atlas Behaviour Confidence Model

**Sprint:** 121A
**Status:** APPROVED DESIGN
**Directive:** ORION-DIRECTIVE-001
**Date:** 2026-07-17

---

## Overview

The Behaviour Confidence Model defines how Atlas quantifies its certainty about a detected market behaviour. Confidence is not a single number — it is a multi-dimensional assessment that incorporates current evidence, historical performance, regime alignment, and behaviour maturity.

The model produces five outputs for every active behaviour instance: **confidence**, **probability**, **expected R**, **expected duration**, and **failure probability**. These outputs are consumed by ADE for model selection and by the dashboard for live display.

---

## Design Principles

The confidence model is built on four principles. First, it must be **calibrated** — a behaviour with 70% confidence should confirm approximately 70% of the time. Second, it must be **transparent** — every confidence score must be explainable in terms of its contributing dimensions. Third, it must be **stable** — small changes in indicator values should not cause large swings in confidence. Fourth, it must be **historically grounded** — confidence is anchored to actual historical performance, not theoretical expectations.

---

## Input Dimensions

The confidence model receives seven input dimensions from the Evidence Aggregator:

| Dimension | Weight | Description |
|---|---|---|
| Indicator Agreement | 25% | Fraction of required indicators confirming the behaviour |
| Regime Alignment | 20% | Whether the current regime matches the behaviour's target regimes |
| Session Quality | 15% | Historical win rate of this behaviour in the current session |
| Price Structure | 15% | Quality of the price structure supporting the behaviour |
| Volume Confirmation | 10% | Whether volume supports the behaviour |
| Historical Base Rate | 10% | Historical frequency of this behaviour in similar conditions |
| Recency Weight | 5% | Decay factor — recent performance is weighted more heavily |

Each dimension produces a score from 0 to 100. The weighted sum produces the **evidence score**.

---

## Evidence Score Calculation

The evidence score is the weighted sum of all seven dimensions:

```
evidence_score = (
  indicator_agreement × 0.25 +
  regime_alignment × 0.20 +
  session_quality × 0.15 +
  price_structure × 0.15 +
  volume_confirmation × 0.10 +
  historical_base_rate × 0.10 +
  recency_weight × 0.05
)
```

The evidence score is bounded to [0, 100]. An evidence score below the behaviour's minimum threshold (defined in `CANONICAL_BEHAVIOUR_SPECS.md`) results in the behaviour not being detected.

---

## Confidence Calculation

Confidence is derived from the evidence score but is not identical to it. The confidence calculation applies three adjustments:

**Step 1 — Base Confidence.** The base confidence is the behaviour's defined base confidence (from the canonical spec). This represents the confidence when all evidence dimensions are at their minimum threshold.

**Step 2 — Evidence Scaling.** The evidence score above the minimum threshold is scaled to add confidence above the base:

```
confidence = base_confidence + (evidence_score - min_evidence) × scaling_factor
```

Where `scaling_factor` is behaviour-specific and calibrated so that a perfect evidence score (100) produces the behaviour's maximum confidence.

**Step 3 — Maturity Adjustment.** Confidence is adjusted based on the behaviour's current maturity:

| Maturity | Adjustment |
|---|---|
| FORMING | −5 (uncertainty about whether behaviour will develop) |
| ACTIVE | 0 (no adjustment — behaviour is confirmed developing) |
| MATURE | +5 (behaviour has sustained, increasing conviction) |
| EXHAUSTED | −10 (behaviour may be ending, reducing conviction) |

The final confidence is bounded to [0, 100].

---

## Probability Calculation

Probability is the model's estimate of the forward probability that the expected outcome will occur. It is derived from confidence using a calibration curve that is specific to each behaviour.

The calibration curve maps confidence deciles to historical win rates. For example, for TREND_CONTINUATION:

| Confidence Range | Historical Win Rate |
|---|---|
| 0–40 | Not detected (below minimum) |
| 40–50 | 45% |
| 50–60 | 52% |
| 60–70 | 60% |
| 70–80 | 67% |
| 80–90 | 74% |
| 90–100 | 80% |

Initially, the calibration curves are seeded with theoretical estimates based on the behaviour definitions. As Atlas accumulates real instances, the curves are updated using actual historical performance from `atlas_behaviour_performance_stats`.

---

## Expected R Calculation

Expected R is the model's estimate of the risk-adjusted return if the behaviour confirms. It is calculated as:

```
expected_r = base_expected_r × regime_multiplier × session_multiplier × maturity_multiplier
```

Where:
- `base_expected_r` is the behaviour's historical average R from `atlas_behaviour_performance_stats`
- `regime_multiplier` adjusts for the current regime (e.g., trending regimes amplify trend behaviours)
- `session_multiplier` adjusts for the current session (e.g., New York open amplifies ORB)
- `maturity_multiplier` adjusts for behaviour maturity (mature behaviours have higher expected R)

Initially, `base_expected_r` is seeded from the canonical spec estimates. It is updated as real trades are recorded.

---

## Expected Duration Calculation

Expected duration (in 5-minute bars) is calculated as:

```
expected_duration_bars = base_duration × (1 + regime_factor) × maturity_factor
```

Where:
- `base_duration` is the behaviour's expected duration from the canonical spec
- `regime_factor` adjusts for regime (trending regimes extend trend behaviour duration)
- `maturity_factor` decreases as the behaviour ages (remaining duration decreases each bar)

---

## Failure Probability Calculation

Failure probability is the complement of the forward probability, adjusted for current conditions:

```
failure_probability = 1.0 - probability + contradiction_penalty
```

Where `contradiction_penalty` is added when a contradicting behaviour is simultaneously active. For example, if TREND_CONTINUATION is active but VOLATILITY_EXPANSION is also detected, the contradiction penalty increases the failure probability.

---

## Confidence Drift Monitoring

DARWIN monitors confidence drift — the pattern of confidence changes over the lifetime of a behaviour instance. Healthy behaviour instances show:

- Confidence increasing or stable from FORMING to ACTIVE
- Confidence peaking at MATURE
- Confidence declining at EXHAUSTED

Abnormal patterns (e.g., confidence declining immediately after detection, or confidence oscillating) are flagged for DARWIN research as potential classifier calibration issues.

The `atlas_behaviour_confidence_history` table stores the full confidence history for every instance, enabling DARWIN to analyse drift patterns across thousands of instances.

---

## Calibration Update Protocol

The confidence model is recalibrated by DARWIN at the end of each trading week. The recalibration process:

1. Retrieves all confirmed, expired, and rejected instances from the past 90 days
2. Computes the actual win rate at each confidence decile for each behaviour
3. Compares actual win rates to the current calibration curve
4. If the deviation exceeds 5 percentage points at any decile, flags the behaviour for recalibration
5. Updates the calibration curve using a weighted average of the current curve and the new data (80% current, 20% new — conservative update to prevent overfitting)

Recalibration is logged to `atlas_behaviour_discovery_history` with event type `CALIBRATION_UPDATE`.

---

## Confidence Floor and Ceiling

Every behaviour has a hard confidence floor (minimum evidence score) and a soft confidence ceiling (maximum achievable confidence). These are defined in the canonical spec and enforced by the model:

| Behaviour | Min Evidence | Max Confidence |
|---|---|---|
| TREND_CONTINUATION | 55 | 90 |
| SECOND_ENTRY_PULLBACK | 60 | 90 |
| LIQUIDITY_SWEEP | 65 | 85 |
| FAILED_BREAKOUT | 60 | 80 |
| MEAN_REVERSION | 55 | 80 |
| OPENING_RANGE_BREAKOUT | 65 | 90 |
| VWAP_RECLAIM | 55 | 85 |
| COMPRESSION | 50 | 80 |
| BREAKOUT_EXPANSION | 65 | 88 |
| OVERNIGHT_INVENTORY | 60 | 85 |
| SESSION_ROTATION | 55 | 80 |
| VOLATILITY_EXPANSION | 50 | 90 |

The maximum confidence ceiling reflects the inherent uncertainty of each behaviour. No behaviour can achieve 100% confidence because market behaviour is inherently probabilistic.
