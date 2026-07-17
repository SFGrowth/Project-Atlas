# Atlas Behaviour Engine — Decision Replay Integration Design

**Sprint:** 121A
**Status:** APPROVED DESIGN
**Directive:** ORION-DIRECTIVE-001
**Date:** 2026-07-17

---

## Overview

The Decision Replay Engine (mandated by ORION-DIRECTIVE-001, Extension 4) requires that every bar processed by Atlas stores a complete decision record — including all detected behaviours, their confidence scores, their evidence, and the reasoning that led to the final ADE decision. This document defines how the Behaviour Engine integrates with the replay architecture.

No replay implementation occurs during Sprint 121A. This document is architecture only.

> **Constraint:** No replay implementation during Sprint 121A. This document is architecture only.

---

## Replay Requirements from the Orion Directive

The Orion Directive specifies that every processed bar should eventually record:

- Detected behaviours
- Behaviour confidence
- Behaviour maturity
- Reasoning
- Evidence
- Relationship graph

These requirements drive the design of the `atlas_decision_replay_records` table (to be created in Sprint 125).

---

## Decision Record Schema

Each processed bar will produce one `DecisionReplayRecord`. The record captures the complete state of Atlas at the moment the bar was processed:

```typescript
interface DecisionReplayRecord {
  // Identity
  replayId: string;              // UUID
  barOpenTs: number;             // Bar open timestamp (ms)
  barCloseTs: number;
  symbol: string;
  source: 'live' | 'replay';

  // Market data snapshot
  ohlcv: { open: number; high: number; low: number; close: number; volume: number };
  indicators: Record<string, number>;  // All indicator values at this bar
  regime: string;
  session: string;

  // Behaviour Engine outputs
  activeBehaviours: BehaviourReplaySnapshot[];
  dominantBehaviour: string | null;
  dominantBehaviourConfidence: number;
  behaviourRelationshipGraph: BehaviourRelationshipSnapshot[];

  // ADE outputs
  adeScores: Record<string, number>;   // Per-strategy norm scores
  candidateModel: string | null;
  candidateScore: number;
  adeDecision: 'SIGNAL' | 'NO_SIGNAL' | 'BLOCKED';
  adeReasoning: string;

  // ARI/TVL outputs
  ariDecision: string;
  tvlDecision: string;

  // Execution output
  executionDecision: 'ENTER' | 'SKIP' | 'BLOCKED';
  executionReason: string;

  // Metadata
  processingLatencyMs: number;
  atlasVersion: string;
}

interface BehaviourReplaySnapshot {
  instanceId: string;
  behaviourId: string;
  lifecycleState: BehaviourLifecycleState;
  confidence: number;
  probability: number;
  maturity: BehaviourMaturity;
  evidenceScore: number;
  expectedR: number;
  evidence: EvidenceRecord;
  classifierReasoning: string;
}

interface BehaviourRelationshipSnapshot {
  behaviourIdA: string;
  behaviourIdB: string;
  relationshipType: string;
  activeSimultaneously: boolean;
}
```

---

## Deterministic Replay Guarantee

The Behaviour Engine is designed to be **deterministically replayable**. Given the same `ProcessedBarData` input, the Behaviour Engine always produces the same output. This is guaranteed by:

1. All classifiers are stateless with respect to the current bar — they receive the full bar context and return a result.
2. The Confidence Calculator is a pure function — no random elements, no external dependencies.
3. The Evidence Aggregator is a pure function.
4. The only stateful component is the Behaviour State Manager, which tracks active instances. For replay, the State Manager is initialised from the stored instance state at the replay start point.

This determinism means that DARWIN can replay any historical period and get exactly the same behaviour classifications that Atlas would have produced in real time. This is essential for research — DARWIN can test new classifier versions against historical data and compare the results to what Atlas actually did.

---

## Replay Modes

The Decision Replay Engine supports three replay modes:

**Live Replay.** Replays a specific time range using stored bar data from `atlas_memory`. The Behaviour Engine processes each bar in sequence, producing behaviour signals that are compared to the stored `DecisionReplayRecord`. Any discrepancies are flagged as research candidates.

**Counterfactual Replay.** Replays a specific time range with a modified configuration — for example, a new classifier version or different confidence thresholds. The results are compared to the original replay to measure the impact of the change.

**Research Replay.** DARWIN uses research replay to test new behaviour hypotheses against historical data. A new classifier is implemented and run against the full historical dataset. The results are analysed for statistical significance before the classifier is promoted to shadow mode.

---

## Integration with the Behaviour Engine

The Behaviour Engine integrates with the replay architecture at two points:

**Point 1 — Record Generation.** After each bar is processed, the Behaviour Engine produces a `BehaviourReplaySnapshot` array. This is stored as part of the `DecisionReplayRecord` in the `atlas_decision_replay_records` table.

**Point 2 — Replay Execution.** When the Decision Replay Engine replays a bar, it instantiates the Behaviour Engine with the historical state (active instances at the replay start point) and processes each bar in sequence. The Behaviour Engine's outputs are compared to the stored snapshots.

---

## Storage Estimate

Each `DecisionReplayRecord` is approximately 2–5 KB of JSON. At 5-minute bars during market hours (approximately 80 bars/day, 5 days/week), the storage growth is:

- Per week: 80 × 5 × 5 KB = 2 MB
- Per month: ~8 MB
- Per year: ~100 MB

This is well within the MySQL storage budget. Records older than 2 years will be archived to S3 cold storage (Parquet format) as defined in the Sprint 120 Storage Design.
