# Atlas Behaviour Engine — ADE Integration Design

**Sprint:** 121A
**Status:** APPROVED DESIGN
**Directive:** ORION-DIRECTIVE-001
**Date:** 2026-07-17

---

## Overview

The Atlas Decision Engine (ADE) is the component that selects which strategy to activate on each bar. Currently, ADE scores strategies using 17 confidence dimensions derived from indicator values and market structure. The Behaviour Engine integration adds a new source of input to ADE: **behaviour signals** — confidence-weighted classifications of the current market behaviour.

This document defines how ADE will consume behaviour signals once the Atlas Intelligence Layer is in place (Sprint 123). No ADE changes occur during Sprint 121A.

> **Constraint:** No ADE changes during Sprint 121A. This document is architecture only.

---

## Current ADE Architecture

ADE currently receives `ProcessedBarData` and evaluates each strategy against 17 dimensions:

- Market structure alignment
- Trend strength (ADX)
- Momentum (RSI)
- VWAP position
- EMA alignment
- ATR regime
- Session quality
- And 10 additional dimensions

Each dimension produces a score (0–100). The weighted sum produces the strategy's `norm_score`. The strategy with the highest `norm_score` above the threshold becomes the `candidate_model`.

---

## Behaviour Engine Integration Points

The Behaviour Engine adds seven new inputs to ADE's scoring model:

### 1. Behaviour Confidence

When a behaviour matching a strategy's primary behaviour is active, ADE receives the behaviour's current confidence as an additional dimension. This replaces or supplements the strategy's internal behaviour detection.

**Integration:** A new ADE dimension `behaviour_confidence` is added with weight 15%. The dimension score is the Behaviour Engine's confidence for the strategy's primary behaviour (0–100). If no matching behaviour is active, the dimension scores 0.

### 2. Behaviour Maturity

Behaviour maturity affects the timing of strategy activation. ADE should prefer strategies whose primary behaviour is in ACTIVE or MATURE state over strategies whose behaviour is only FORMING.

**Integration:** A new ADE dimension `behaviour_maturity` is added with weight 10%. Scores: FORMING = 40, ACTIVE = 70, MATURE = 90, EXHAUSTED = 30. If no behaviour is active, score = 0.

### 3. Behaviour Correlation

When multiple behaviours are simultaneously active, ADE uses the behaviour correlation matrix (from `atlas_behaviour_relationships`) to assess whether the active behaviours are reinforcing or contradicting each other.

**Integration:** A new ADE dimension `behaviour_correlation` is added with weight 8%. Score is calculated from the interaction matrix: co-occurring behaviours add +10 each, contradicting behaviours subtract -15 each. Bounded to [0, 100].

### 4. Portfolio Overlap

ADE checks whether the candidate strategy's primary behaviour is already being exploited by an active position. If the same behaviour is driving both the current position and the new signal, the portfolio overlap score is reduced.

**Integration:** A new ADE dimension `portfolio_overlap` is added with weight 7%. Score: no overlap = 80, same behaviour active = 20, complementary behaviour active = 90.

### 5. Behaviour Rarity

Rare behaviours (those that occur infrequently) receive a rarity bonus when they are detected with high confidence. This prevents ADE from ignoring high-value but infrequent opportunities.

**Integration:** A new ADE dimension `behaviour_rarity` is added with weight 5%. Score is derived from the behaviour's historical base rate: base_rate < 5% = 90, 5–15% = 70, 15–30% = 50, > 30% = 30.

### 6. Expected Edge

Expected edge combines the behaviour's expected R with its forward probability to produce a single edge score.

**Integration:** A new ADE dimension `expected_edge` is added with weight 10%. Score = (expected_r × probability × 100), bounded to [0, 100].

### 7. Expected Opportunity Frequency

ADE considers how frequently the behaviour is expected to occur. High-frequency behaviours (like TREND_CONTINUATION) are weighted differently from low-frequency behaviours (like OPENING_RANGE_BREAKOUT).

**Integration:** A new ADE dimension `opportunity_frequency` is added with weight 5%. Score is derived from the behaviour's historical frequency: > 20 instances/week = 80, 10–20/week = 70, 5–10/week = 60, < 5/week = 50.

---

## ADE Scoring Model After Integration

The full ADE scoring model after Behaviour Engine integration will have 24 dimensions (17 existing + 7 new):

| Dimension Group | Dimensions | Total Weight |
|---|---|---|
| Existing (17 dimensions) | Market structure, trend, momentum, VWAP, EMAs, ATR, session, etc. | 60% |
| Behaviour Engine (7 dimensions) | Confidence, maturity, correlation, portfolio overlap, rarity, edge, frequency | 40% |

The existing 17 dimensions are re-weighted from 100% to 60% to accommodate the new behaviour dimensions. The re-weighting is applied proportionally — each existing dimension retains its relative weight within the 60% allocation.

---

## Intelligence Layer Architecture

The Atlas Intelligence Layer (Sprint 123) sits between the Behaviour Engine and ADE. It receives both the `ProcessedBarData` (existing ADE input) and the `BehaviourSignal` array (new Behaviour Engine output), and produces an enriched `IntelligenceLayerOutput` that ADE consumes.

```typescript
interface IntelligenceLayerOutput {
  // Existing ADE inputs (unchanged)
  processedBar: ProcessedBarData;

  // New behaviour inputs
  activeBehaviours: BehaviourSignal[];
  behaviourDimensions: {
    behaviourConfidence: number;      // 0–100
    behaviourMaturity: number;        // 0–100
    behaviourCorrelation: number;     // 0–100
    portfolioOverlap: number;         // 0–100
    behaviourRarity: number;          // 0–100
    expectedEdge: number;             // 0–100
    opportunityFrequency: number;     // 0–100
  };

  // Metadata
  behaviourCount: number;
  dominantBehaviour: string | null;
  dominantBehaviourConfidence: number;
}
```

The Intelligence Layer is a pure function — given the same inputs, it always produces the same output. This is essential for the Decision Replay Engine.

---

## Backward Compatibility

The Behaviour Engine integration is designed to be backward compatible. During the transition period (Sprint 122 shadow mode), ADE continues to operate exactly as it does today. The behaviour dimensions are added to ADE's scoring model only after the Intelligence Layer is in place and the behaviour signals have been validated.

If the Behaviour Engine fails (e.g., a classifier throws an exception), the Intelligence Layer returns a zero-scored behaviour dimensions object. ADE falls back to its existing 17-dimension scoring model. This ensures that a Behaviour Engine failure never prevents ADE from making a decision.
