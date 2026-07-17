# Atlas Behaviour Engine — Phased Implementation Roadmap

**Sprint:** 121A
**Status:** APPROVED DESIGN
**Directive:** ORION-DIRECTIVE-001
**Date:** 2026-07-17

---

## Overview

This roadmap defines the complete implementation path from the current state (Sprint 121A architecture design) to the fully realised Atlas autonomous quantitative research operating system described in ORION-DIRECTIVE-001. The roadmap covers nine major phases, each building on the previous, with no phase requiring a destructive change to any existing production component.

The roadmap is organised around the nine layers of the Orion Directive vision:

```
Behaviour Engine
    ↓
Behaviour Library
    ↓
Strategy DNA
    ↓
Decision Replay
    ↓
Self Diagnosis
    ↓
Live Confidence
    ↓
Atlas Intelligence Layer
    ↓
DARWIN Behaviour Research
    ↓
Autonomous Portfolio Optimisation
```

---

## Phase 1 — Behaviour Engine (Sprint 122)

**Objective:** Implement the complete Behaviour Engine in shadow mode. All 12 classifiers running. Outputs logged to the Behaviour Registry. No strategy changes. No ADE changes.

**Deliverables:**

The Classifier Registry, Evidence Aggregator, Confidence Calculator, and Behaviour State Manager are all implemented as production-quality TypeScript modules in `server/behaviour-engine/`. All 12 classifiers are implemented using rule-based logic derived from the canonical specifications in `CANONICAL_BEHAVIOUR_SPECS.md`.

The Behaviour Event Bus is wired to the existing `AtlasEventBus`. Behaviour events are logged to the eight Behaviour Registry tables. The dashboard receives behaviour events via SSE and displays a new "Behaviour Engine" panel showing active behaviour instances in real time.

**Integration point:** The Behaviour Engine is called from `processBar()` after all existing processing is complete. Its output is logged but not consumed by ADE.

**Estimated effort:** 2 sprints (122, 122A). Approximately 40 hours of implementation work.

**Success criteria:** All 12 classifiers producing outputs. Behaviour instances logged to database. Dashboard panel displaying live behaviour signals. Unit test coverage ≥ 90%. Zero impact on existing ADE performance.

---

## Phase 2 — Behaviour Library (Sprint 123)

**Objective:** The Behaviour Library is the dashboard and research interface for the Behaviour Registry. It provides DARWIN and human researchers with a complete view of all detected behaviours, their performance statistics, and their relationships.

**Deliverables:**

A new `/behaviour-library` page in the Atlas Nexus dashboard. The page displays: all 12 canonical behaviours with their current lifecycle stage, performance statistics (win rate, profit factor, sample size), confidence calibration curves, behaviour relationship graph, and recent instance history.

The Behaviour Library also provides the DARWIN research interface: a view of all instances flagged for research (high-confidence rejections, unexpected expirations, confidence drift anomalies).

**Estimated effort:** 1 sprint (123). Approximately 20 hours.

**Success criteria:** Behaviour Library page live. All 12 behaviours displayed with real performance data. DARWIN research queue visible.

---

## Phase 3 — Strategy DNA (Sprint 124)

**Objective:** Formalise the Strategy DNA for all six production strategies. Create the `atlas_strategy_dna` table. Begin migrating A1 and A2 to consume Behaviour Engine signals.

**Deliverables:**

The `atlas_strategy_dna` table is created and seeded with the Strategy DNA for all six strategies (from `STRATEGY_INTEGRATION_PLAN.md`). A1 and A2 are migrated to consume `TREND_CONTINUATION` and `SECOND_ENTRY_PULLBACK` signals respectively, after 90-day shadow validation confirms equivalence.

The ADE scoring model is extended with the first two behaviour dimensions: `behaviour_confidence` and `behaviour_maturity`. The existing 17 dimensions are re-weighted to 60% of the total score.

**Estimated effort:** 2 sprints (124, 124A). Approximately 35 hours.

**Success criteria:** A1 and A2 performance within 5% of pre-migration baseline. Behaviour dimensions visible in ADE scoring output. Strategy DNA displayed in Certification dashboard.

---

## Phase 4 — Decision Replay Engine (Sprint 125)

**Objective:** Implement the Decision Replay Engine. Every processed bar stores a complete `DecisionReplayRecord`. The replay interface allows DARWIN to replay any historical period deterministically.

**Deliverables:**

The `atlas_decision_replay_records` table is created. The `DecisionReplayRecord` is generated for every processed bar and stored. A new `/replay` page in the dashboard allows DARWIN to select a time range, replay it, and compare the results to the stored records.

A3 and B1 are migrated to consume Behaviour Engine signals (after 90-day shadow validation).

**Estimated effort:** 2 sprints (125, 125A). Approximately 40 hours.

**Success criteria:** Decision records stored for every bar. Replay produces identical results to original processing. A3 and B1 performance within 5% of baseline.

---

## Phase 5 — Self-Diagnosis Engine (Sprint 126)

**Objective:** Every completed trade generates an automatic diagnosis. The diagnosis references the detected behaviour, the ADE decision record, and the actual outcome. Losses become research assets.

**Deliverables:**

The `atlas_trade_diagnoses` table is created. A diagnosis is generated for every closed paper trade and every closed live trade. The diagnosis includes: the primary behaviour at entry, the confidence at entry, the ADE decision record, the actual outcome vs expected outcome, and a DARWIN research flag if the outcome was unexpected.

SB1 and ORB-1 are migrated to consume Behaviour Engine signals.

**Estimated effort:** 2 sprints (126, 126A). Approximately 35 hours.

**Success criteria:** Diagnoses generated for all closed trades. DARWIN research queue populated with unexpected outcomes. SB1 and ORB-1 performance within 5% of baseline.

---

## Phase 6 — Live Confidence Engine (Sprint 127)

**Objective:** The dashboard displays 8-layer live confidence for every active position. DARWIN monitors confidence drift in real time.

**Deliverables:**

The Live Confidence Engine computes an 8-layer confidence score for every active position: behaviour confidence, ADE score, ARI approval, TVL verification, regime alignment, session quality, historical expectancy, and execution quality. The dashboard displays this as a live confidence gauge.

DARWIN receives alerts when confidence drops significantly during an active position (potential early exit signal).

**Estimated effort:** 1 sprint (127). Approximately 25 hours.

**Success criteria:** Live confidence gauge visible on dashboard. DARWIN alerts firing on confidence drops. 8-layer breakdown accessible for every active position.

---

## Phase 7 — Atlas Intelligence Layer (Sprint 128)

**Objective:** The Atlas Intelligence Layer is fully implemented. ADE receives all seven behaviour dimensions. The full 24-dimension scoring model is active.

**Deliverables:**

The `IntelligenceLayer` module is implemented in `server/intelligence-layer/`. All seven behaviour dimensions are active in ADE. The ADE scoring model is re-calibrated with the new weights. The Certification dashboard is updated to show the new ADE dimension breakdown.

**Estimated effort:** 2 sprints (128, 128A). Approximately 40 hours.

**Success criteria:** All 24 ADE dimensions active. ADE performance equal or better than pre-integration baseline. Intelligence Layer visible in ADE decision records.

---

## Phase 8 — DARWIN Behaviour Research (Sprint 129+)

**Objective:** DARWIN's research cycle is extended to research behaviours, not strategies. The full behaviour graduation pipeline is active: Observation → Hypothesis → Validation → Production.

**Deliverables:**

DARWIN's daily review is extended to include a behaviour research section. DARWIN analyses the Behaviour Library for: behaviours with declining win rates (candidates for retirement), behaviours with unexplained rejections (candidates for classifier improvement), and new behaviour hypotheses derived from the DARWIN research cycle.

The behaviour graduation pipeline is automated: DARWIN can promote a behaviour from OBSERVATION to VALIDATED based on statistical criteria, subject to human review.

**Estimated effort:** 3 sprints (129, 129A, 129B). Approximately 60 hours.

**Success criteria:** DARWIN daily review includes behaviour research section. First behaviour promoted through the full graduation pipeline. First behaviour retired based on statistical evidence.

---

## Phase 9 — Autonomous Portfolio Optimisation (Sprint 130+)

**Objective:** Atlas autonomously optimises its strategy portfolio based on behaviour performance data. The portfolio is the smallest possible set of complementary strategies that collectively cover the widest range of market conditions.

**Deliverables:**

The Portfolio Optimisation Engine analyses the behaviour performance data and the strategy performance data to identify: regime gaps (behaviours that are active but no strategy is exploiting them), strategy redundancy (multiple strategies exploiting the same behaviour), and portfolio concentration risk (too many strategies dependent on the same behaviour).

DARWIN generates portfolio optimisation recommendations for human review. No autonomous execution changes — all recommendations require human approval.

**Estimated effort:** 4 sprints (130–131). Approximately 80 hours.

**Success criteria:** Portfolio gap analysis visible in dashboard. First DARWIN portfolio recommendation generated. Regime coverage map showing which behaviours are covered by which strategies.

---

## Roadmap Summary

| Phase | Sprint | Objective | Effort |
|---|---|---|---|
| 1 | 122 | Behaviour Engine — shadow mode | 2 sprints |
| 2 | 123 | Behaviour Library — dashboard | 1 sprint |
| 3 | 124 | Strategy DNA + A1/A2 migration | 2 sprints |
| 4 | 125 | Decision Replay + A3/B1 migration | 2 sprints |
| 5 | 126 | Self-Diagnosis + SB1/ORB-1 migration | 2 sprints |
| 6 | 127 | Live Confidence Engine | 1 sprint |
| 7 | 128 | Atlas Intelligence Layer | 2 sprints |
| 8 | 129 | DARWIN Behaviour Research | 3 sprints |
| 9 | 130 | Autonomous Portfolio Optimisation | 4 sprints |

**Total estimated effort:** 19 sprints from Sprint 122 to completion of Phase 9.

**Critical path:** Phases 1 → 3 → 7 (Behaviour Engine → Strategy DNA → Intelligence Layer). All other phases can be parallelised or reordered without breaking the critical path.

---

## Guiding Principle

> The objective is not to maximise the number of strategies. The objective is to build the smallest possible portfolio of robust, complementary models that collectively cover the widest range of market conditions while maintaining controlled drawdown and execution reliability.

Every phase of this roadmap serves that objective. The Behaviour Engine is the foundation. Everything else is built on top of it.
