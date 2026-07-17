# Atlas Behaviour Engine — Architecture

**Sprint:** 121A
**Status:** APPROVED DESIGN — Architecture Only
**Directive:** ORION-DIRECTIVE-001
**Author:** Atlas Chief Architect (Orion)
**Date:** 2026-07-17

---

## 1. Purpose and Mandate

The Behaviour Engine is the first new core subsystem introduced by ORION-DIRECTIVE-001. It becomes the **single source of truth for market behaviour classification** within Atlas.

The fundamental shift it enables is this: strategies stop detecting behaviour themselves and instead consume behaviour signals produced by the Behaviour Engine. This separation of concerns is the architectural foundation upon which every subsequent Orion Directive extension — Strategy DNA, Decision Replay, Self-Diagnosis, Live Confidence, and the Atlas Intelligence Layer — depends.

> "The Behaviour Engine must become the single source of truth for market behaviour classification. Strategies must eventually consume behaviour signals instead of implementing their own behaviour detection."
> — ORION-DIRECTIVE-001, Extension 1

The Behaviour Engine is not a strategy. It is a **classification service** — a component that observes market data and produces labelled, confidence-weighted behaviour signals that other components consume.

---

## 2. Position in the Atlas Architecture

The Behaviour Engine sits between the Feature Engine and the Atlas Intelligence Layer. It receives processed bar data (with all indicators computed) and produces behaviour signals that flow downstream to ADE via the Intelligence Layer.

```
Market Data (DataBento / TradingView M-16)
    ↓
Feature Engine (ATR, ADX, RSI, VWAP, EMAs, regime)
    ↓
┌─────────────────────────────────────────────────────┐
│                 BEHAVIOUR ENGINE                     │
│                                                      │
│  Classifier Registry → Classifiers (×12)            │
│  Evidence Aggregator → Confidence Calculator        │
│  Behaviour State Manager → Behaviour Event Bus      │
│  Behaviour Library (DB) ← Persistence Layer         │
└─────────────────────────────────────────────────────┘
    ↓
Behaviour Event Bus (AtlasBehaviourDetected, etc.)
    ↓
Atlas Intelligence Layer (future)
    ↓
ADE (consumes behaviour confidence + maturity)
    ↓
Guardian → Execution → Learning
```

The Behaviour Engine is **read-only with respect to execution**. It never places orders, never modifies positions, and never interacts with TradersPost. It is a pure classification and signal-generation service.

---

## 3. Internal Module Architecture

The Behaviour Engine is composed of six internal modules, each with a distinct responsibility.

### 3.1 Classifier Registry

The Classifier Registry is the entry point for all behaviour classification. It maintains the ordered list of active classifiers and dispatches each processed bar to every classifier in sequence. The registry is responsible for:

- Loading and initialising all registered classifiers at startup
- Dispatching `ProcessedBarData` to each classifier
- Collecting classifier outputs into a unified `ClassificationResult`
- Managing classifier enable/disable state (for A/B testing and research)

The registry is designed to be extensible: adding a new behaviour requires only implementing the `IBehaviourClassifier` interface and registering it. No other code changes are required.

### 3.2 Behaviour Classifiers (×12)

Each canonical behaviour has a dedicated classifier implementing the `IBehaviourClassifier` interface. A classifier receives a `ProcessedBarData` record and returns a `ClassifierOutput` containing the detected behaviour (if any), raw evidence scores, and a preliminary confidence estimate.

Classifiers are **stateless with respect to the current bar** — they receive the full bar context including recent history and return a result. State across bars is managed by the Behaviour State Manager.

The twelve initial classifiers correspond to the twelve canonical behaviours defined in `CANONICAL_BEHAVIOUR_SPECS.md`.

### 3.3 Evidence Aggregator

The Evidence Aggregator collects raw evidence from all classifiers and produces a structured `EvidenceRecord` for each detected behaviour. Evidence is multi-dimensional:

| Evidence Dimension | Description |
|---|---|
| Indicator Agreement | Number of indicators confirming the behaviour |
| Regime Alignment | Whether the current regime is historically favourable |
| Session Quality | Whether the current session produces high-quality instances |
| Price Structure | Quality of the price structure supporting the behaviour |
| Volume Confirmation | Whether volume confirms the behaviour |
| Historical Base Rate | Historical frequency of this behaviour in similar conditions |
| Recency Weight | Decay factor applied to older evidence |

The Evidence Aggregator produces a normalised `evidence_score` (0–100) that feeds the Confidence Calculator.

### 3.4 Confidence Calculator

The Confidence Calculator converts evidence scores into the multi-dimensional confidence output that downstream consumers use. It implements the confidence model defined in `BEHAVIOUR_CONFIDENCE_MODEL.md`.

Outputs per detected behaviour:

| Output | Type | Description |
|---|---|---|
| `confidence` | `0–100` | Overall confidence in the classification |
| `probability` | `0.0–1.0` | Forward probability of the expected outcome |
| `expected_r` | `decimal` | Expected R-multiple based on historical performance |
| `expected_duration_bars` | `integer` | Expected number of bars until resolution |
| `failure_probability` | `0.0–1.0` | Probability of the behaviour failing |

### 3.5 Behaviour State Manager

The Behaviour State Manager tracks the lifecycle state of each active behaviour instance. A behaviour instance is created when a classifier first detects a behaviour and is updated on each subsequent bar until it resolves (confirmed, expired, or rejected).

The State Manager is responsible for:

- Creating new behaviour instances on first detection
- Updating confidence and evidence on subsequent bars
- Transitioning instances through the lifecycle states
- Expiring instances that have exceeded their maximum duration
- Emitting lifecycle events to the Behaviour Event Bus

### 3.6 Behaviour Event Bus

The Behaviour Event Bus is an extension of the existing Atlas Market Event Bus. It emits typed behaviour events that downstream components subscribe to. The full event contract is defined in `BEHAVIOUR_EVENT_CONTRACTS.md`.

The Behaviour Event Bus is **additive** — it extends the existing `AtlasEventBus` without modifying it. Existing market event subscribers are unaffected.

---

## 4. Data Interfaces

### 4.1 Input: ProcessedBarData

The Behaviour Engine receives `ProcessedBarData` — the same bar data that currently flows into `processBar()`. This ensures zero changes to the existing pipeline during the transition period.

```typescript
interface ProcessedBarData {
  // Core OHLCV
  symbol: string;
  barOpenTs: number;
  barCloseTs: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;

  // Indicators (computed by Feature Engine / M-16)
  atr: number;
  adx: number;
  rsi: number;
  vwap: number;
  ema9: number;
  ema21: number;
  regime: 'TRENDING' | 'RANGING' | 'VOLATILE' | 'CHOPPY';
  session: 'ASIA' | 'LONDON' | 'NEW_YORK' | 'OVERNIGHT';

  // Recent history (last N bars for pattern detection)
  recentBars: RecentBarSummary[];
}
```

### 4.2 Output: BehaviourSignal

The primary output of the Behaviour Engine is a `BehaviourSignal` — a confidence-weighted classification of the current market behaviour.

```typescript
interface BehaviourSignal {
  instanceId: string;           // UUID for this behaviour instance
  behaviourId: string;          // e.g. 'TREND_CONTINUATION'
  symbol: string;
  detectedAt: number;           // Bar timestamp (ms)
  barOpenTs: number;
  confidence: number;           // 0–100
  probability: number;          // 0.0–1.0
  maturity: BehaviourMaturity;  // FORMING | ACTIVE | MATURE | EXHAUSTED
  evidenceScore: number;        // 0–100
  expectedR: number;
  expectedDurationBars: number;
  failureProbability: number;
  regime: string;
  session: string;
  evidence: EvidenceRecord;
  lifecycleState: BehaviourLifecycleState;
}
```

### 4.3 IBehaviourClassifier Interface

Every classifier implements this interface:

```typescript
interface IBehaviourClassifier {
  readonly behaviourId: string;
  readonly version: string;

  classify(bar: ProcessedBarData): ClassifierOutput | null;
  getRequiredHistory(): number;  // Minimum bars needed
  isApplicable(bar: ProcessedBarData): boolean;  // Quick pre-filter
}

interface ClassifierOutput {
  behaviourId: string;
  rawEvidenceScores: Record<string, number>;
  preliminaryConfidence: number;
  classifierVersion: string;
  reasoning: string;
}
```

---

## 5. Processing Pipeline

Each bar processed by Atlas flows through the Behaviour Engine in the following sequence:

**Step 1 — Pre-filter:** The Classifier Registry calls `isApplicable()` on each classifier. Classifiers that cannot possibly fire given the current regime, session, or indicator state return `false` immediately, avoiding unnecessary computation.

**Step 2 — Classification:** Each applicable classifier receives the full `ProcessedBarData` and returns a `ClassifierOutput` or `null`.

**Step 3 — Evidence Aggregation:** The Evidence Aggregator collects all non-null classifier outputs and builds an `EvidenceRecord` for each detected behaviour.

**Step 4 — Confidence Calculation:** The Confidence Calculator processes each `EvidenceRecord` and produces the full `BehaviourSignal` output.

**Step 5 — State Management:** The Behaviour State Manager updates existing behaviour instances and creates new ones. Expired instances are closed.

**Step 6 — Event Emission:** The Behaviour Event Bus emits `AtlasBehaviourDetected`, `AtlasBehaviourUpdated`, or `AtlasBehaviourExpired` events as appropriate.

**Step 7 — Persistence:** New and updated behaviour instances are persisted to the Behaviour Registry database tables.

The entire pipeline is synchronous within the bar-processing context. The Behaviour Engine must complete before the bar result is passed to the Atlas Intelligence Layer.

---

## 6. Integration Points

### 6.1 Current Integration (Sprint 121A — Architecture Only)

During this sprint, the Behaviour Engine is **designed but not wired**. The existing `processBar()` pipeline is unchanged. No production code is modified.

### 6.2 Phase 1 Integration (Sprint 122 — Shadow Mode)

The Behaviour Engine is instantiated and called in parallel with the existing pipeline. Its outputs are logged to the database but not consumed by ADE. This enables validation of the classification logic without any risk to live trading.

### 6.3 Phase 2 Integration (Sprint 123 — Intelligence Layer)

The Atlas Intelligence Layer is introduced. It receives both the existing ADE inputs and the Behaviour Engine outputs. ADE begins receiving behaviour signals as additional context, but the existing ADE scoring logic is unchanged.

### 6.4 Phase 3 Integration (Sprint 124+ — Full Integration)

ADE's dimension scoring is extended to incorporate behaviour confidence and maturity. Strategies begin referencing their primary behaviour from the Behaviour Library rather than implementing detection internally.

---

## 7. Dependencies

The Behaviour Engine depends on the following existing Atlas components:

| Dependency | Version | Usage |
|---|---|---|
| `AtlasEventBus` | Sprint 121 | Behaviour Event Bus extends this |
| `atlas_memory` table | Sprint 074+ | Bar data for recent history |
| `ProcessedBarData` interface | Sprint 074+ | Input to classifiers |
| Feature Engine outputs | Sprint 074+ | ATR, ADX, RSI, VWAP, EMAs, regime |

The Behaviour Engine has **no dependency on ADE, Guardian, TradersPost, or any execution component**. This isolation is intentional and permanent.

---

## 8. Non-Functional Requirements

**Latency:** The Behaviour Engine must complete its full processing pipeline within 50ms per bar. Given that bars arrive every 5 minutes, this is a very conservative budget. The constraint exists to ensure the engine remains viable if bar frequency is increased in future.

**Reliability:** A failure in the Behaviour Engine must never propagate to the execution pipeline. The engine is wrapped in a try-catch at the integration point. If the engine fails, the bar is processed without behaviour signals and the failure is logged to `system_health_events`.

**Observability:** Every behaviour detection, update, and expiry is logged. The dashboard will eventually display live behaviour signals. All behaviour instances are persisted to the database for DARWIN research.

**Testability:** Every classifier implements a deterministic `classify()` method. Given the same `ProcessedBarData` input, the output is always identical. This enables unit testing of every classifier in isolation and deterministic replay.

---

## 9. Upgrade Path

The Behaviour Engine is designed for incremental capability expansion. The upgrade path is:

**Sprint 121A (current):** Architecture and schema design. No implementation.

**Sprint 122:** Implement the Classifier Registry, Evidence Aggregator, Confidence Calculator, and State Manager. Implement all 12 classifiers using rule-based logic. Shadow mode only — outputs logged but not consumed.

**Sprint 123:** Implement the Atlas Intelligence Layer. Wire Behaviour Engine outputs to ADE as additional context. Validate that ADE scores improve with behaviour signals.

**Sprint 124:** Implement Strategy DNA for all 6 production strategies. Strategies declare their primary behaviour. ADE uses Strategy DNA for model selection.

**Sprint 125:** Implement Decision Replay Engine. Every bar stores the full decision record including behaviour signals.

**Sprint 126:** Implement Self-Diagnosis Engine. Every completed trade generates a diagnosis referencing the detected behaviour.

**Sprint 127:** Implement Live Confidence Engine. Dashboard displays layered confidence in real time.

**Sprint 128+:** DARWIN researches behaviours. Behaviour graduation pipeline active.

---

*This document is the authoritative architecture specification for the Atlas Behaviour Engine. All implementation work must conform to this design.*
