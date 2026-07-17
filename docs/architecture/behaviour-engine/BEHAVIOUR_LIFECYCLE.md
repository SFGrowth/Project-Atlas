# Atlas Behaviour Lifecycle

**Sprint:** 121A
**Status:** APPROVED DESIGN
**Directive:** ORION-DIRECTIVE-001
**Date:** 2026-07-17

---

## Overview

Every behaviour instance progresses through a defined lifecycle from initial detection to final resolution. The lifecycle governs how confidence evolves, when events are emitted, and how the instance is stored in the Behaviour Registry.

The lifecycle operates at two levels: the **instance lifecycle** (tracking individual detections) and the **behaviour definition lifecycle** (tracking the maturity of the behaviour type itself within Atlas).

---

## Instance Lifecycle

### States

| State | Description |
|---|---|
| `FORMING` | Behaviour has been detected for the first time. Confidence is preliminary. Evidence is being gathered. |
| `ACTIVE` | Behaviour has been confirmed across multiple bars. Confidence is above the minimum threshold and stable or rising. |
| `MATURE` | Behaviour has been active for ≥ 50% of its expected duration. Confidence is at or near peak. |
| `EXHAUSTED` | Behaviour has been active for ≥ 80% of its expected duration. Confidence may be declining. Resolution is imminent. |
| `CONFIRMED` | The expected outcome has occurred. The behaviour has resolved positively. Terminal state. |
| `EXPIRED` | The maximum duration has been exceeded without confirmation. Terminal state. |
| `REJECTED` | Contradicting evidence has appeared. The behaviour has been invalidated. Terminal state. |

### State Transition Rules

**FORMING → ACTIVE.** Transition occurs when the behaviour has been detected for ≥ 2 consecutive bars and confidence is ≥ 50. If confidence drops below 40 in the FORMING state, the instance is immediately REJECTED.

**ACTIVE → MATURE.** Transition occurs when `bar_count ≥ expected_duration_bars × 0.5` and confidence is ≥ 55.

**MATURE → EXHAUSTED.** Transition occurs when `bar_count ≥ expected_duration_bars × 0.8`.

**Any state → CONFIRMED.** Transition occurs when the Behaviour State Manager determines that the expected outcome has been achieved. The confirmation criteria are behaviour-specific and defined in the canonical spec.

**Any state → EXPIRED.** Transition occurs when `bar_count > max_duration_bars`. This is a hard limit — no behaviour instance can remain active indefinitely.

**Any state → REJECTED.** Transition occurs when: (a) confidence drops below 30 in any state, (b) a contradicting behaviour is detected with confidence ≥ 60, or (c) a regime change makes the behaviour inapplicable.

### Transition Diagram

```
                    ┌─────────────────────────────────────────┐
                    │                                         │
  [Detection] ──→ FORMING ──→ ACTIVE ──→ MATURE ──→ EXHAUSTED │
                    │           │          │           │       │
                    │           │          │           │       │
                    ▼           ▼          ▼           ▼       │
                REJECTED    CONFIRMED  CONFIRMED  CONFIRMED    │
                    ▲           ▲          ▲           ▲       │
                    │           │          │           │       │
                    └───────────┴──────────┴───────────┘       │
                                                               │
                              EXPIRED ◄──────────────────────┘
                              (max duration exceeded)
```

All terminal states (CONFIRMED, EXPIRED, REJECTED) are immutable. Once an instance reaches a terminal state, it is never updated again.

---

## Promotion Rules

When a behaviour instance reaches a terminal state, the Behaviour Performance Stats updater is triggered. It updates the rolling performance statistics for the behaviour type:

**On CONFIRMED:** Win count +1, average confidence updated, average duration updated, regime/session breakdown updated, calibration curve updated.

**On EXPIRED:** Expiry count +1, average duration updated. Flagged for DARWIN review if the behaviour had confidence ≥ 60 at any point.

**On REJECTED:** Rejection count +1. Flagged for DARWIN review if the behaviour had confidence ≥ 70 at any point (high-confidence rejections are the most valuable research signal).

---

## Behaviour Definition Lifecycle

The behaviour definition lifecycle tracks the maturity of the behaviour type itself — from initial discovery by DARWIN through to production deployment and eventual retirement.

### Stages

| Stage | Description | Promotion Criteria |
|---|---|---|
| `HYPOTHESIS` | DARWIN has identified a potential behaviour but has not yet validated it. | DARWIN research cycle completed, behaviour survives initial validation. |
| `OBSERVATION` | The behaviour is being observed in shadow mode. Instances are logged but not consumed by ADE. | ≥ 30 instances observed, win rate ≥ 50%, profit factor ≥ 1.2. |
| `VALIDATED` | The behaviour has been validated across multiple market periods. | ≥ 100 instances, win rate stable across 3 separate periods, no overfitting detected. |
| `PRODUCTION` | The behaviour is active and consumed by ADE. | Promoted by DARWIN after validation. |
| `RETIRED` | The behaviour is no longer active. | Win rate < 40% over 90-day rolling window, or market structure change makes behaviour obsolete. |

### Promotion Process

A behaviour definition can only be promoted by DARWIN following a formal research cycle (as defined in the DARWIN Permanent Strategy Discovery Doctrine). The promotion is recorded in `atlas_behaviour_discovery_history` with the supporting evidence.

Demotion (from PRODUCTION to RETIRED) requires the same formal process. A behaviour is never silently retired — the retirement must be documented with evidence.

The twelve canonical behaviours defined in Sprint 121A are seeded directly into `PRODUCTION` stage, as they are based on well-established market phenomena with substantial theoretical and empirical support. Their calibration curves will be refined as Atlas accumulates real instances.

---

## Concurrent Instance Management

Multiple behaviour instances can be active simultaneously. The Behaviour State Manager maintains a map of all active instances indexed by `instanceId`. There is no limit on the number of concurrent instances.

However, the Behaviour Engine enforces one constraint: **a new instance of the same behaviour type cannot be created while an existing instance of the same type is in FORMING or ACTIVE state**. This prevents duplicate detection of the same behaviour occurrence. If the classifier detects the same behaviour again while an instance is already active, the existing instance is updated rather than a new one created.

This constraint does not apply to instances in MATURE or EXHAUSTED state — a new instance can be created if the classifier detects a fresh occurrence of the behaviour while an older instance is winding down.
