# Atlas Behaviour Event Contracts

**Sprint:** 121A
**Status:** APPROVED DESIGN
**Directive:** ORION-DIRECTIVE-001
**Date:** 2026-07-17

---

## Overview

The Behaviour Event Bus extends the existing Atlas Market Event Bus (introduced in Sprint 121) with five new event types. These events are provider-independent — they carry no DataBento or TradingView-specific fields — and are designed to integrate naturally with the existing `AtlasEventBus` infrastructure.

All behaviour events are emitted by the Behaviour State Manager after each bar is processed. Downstream consumers (ADE, Decision Replay Engine, Self-Diagnosis Engine, DARWIN) subscribe to these events via the same typed EventEmitter pattern used by market events.

---

## Event Type Hierarchy

All behaviour events extend a common `AtlasBehaviourEventBase` interface:

```typescript
interface AtlasBehaviourEventBase {
  // Event identification
  type: AtlasBehaviourEventType;
  eventId: string;           // UUID for this event
  atlasTs: number;           // Atlas processing timestamp (ms)

  // Behaviour identification
  instanceId: string;        // UUID for the behaviour instance
  behaviourId: string;       // e.g. 'TREND_CONTINUATION'
  symbol: string;            // Instrument symbol

  // Bar context
  barOpenTs: number;         // Bar open timestamp (ms)
  barCloseTs: number;        // Bar close timestamp (ms)

  // Source
  source: 'live' | 'replay' | 'shadow';
}

type AtlasBehaviourEventType =
  | 'behaviour_detected'
  | 'behaviour_updated'
  | 'behaviour_confirmed'
  | 'behaviour_expired'
  | 'behaviour_rejected';
```

---

## Event 1 — AtlasBehaviourDetected

Emitted when a behaviour is detected for the first time. This is the primary signal that downstream consumers act on.

```typescript
interface AtlasBehaviourDetected extends AtlasBehaviourEventBase {
  type: 'behaviour_detected';

  // Classification
  confidence: number;            // 0–100
  probability: number;           // 0.0–1.0
  maturity: BehaviourMaturity;   // Always 'FORMING' on first detection
  evidenceScore: number;         // 0–100

  // Expectations
  expectedR: number;
  expectedDurationBars: number;
  failureProbability: number;

  // Context
  regime: string;
  session: string;
  lifecycleState: 'FORMING';

  // Evidence snapshot
  evidence: {
    indicatorAgreement: number;
    regimeAlignment: number;
    sessionQuality: number;
    priceStructure: number;
    volumeConfirmation: number;
    historicalBaseRate: number;
    recencyWeight: number;
    rawIndicatorValues: Record<string, number>;
    classifierReasoning: string;
  };

  // Classifier metadata
  classifierVersion: string;
}
```

**Subscribers:** ADE (future), Decision Replay Engine (future), DARWIN (future), Dashboard SSE stream.

---

## Event 2 — AtlasBehaviourUpdated

Emitted on every subsequent bar after a behaviour has been detected, while it remains in an active lifecycle state. Carries updated confidence, evidence, and maturity.

```typescript
interface AtlasBehaviourUpdated extends AtlasBehaviourEventBase {
  type: 'behaviour_updated';

  // Updated classification
  confidence: number;
  probability: number;
  maturity: BehaviourMaturity;
  evidenceScore: number;

  // Updated expectations
  expectedR: number;
  expectedDurationBars: number;
  failureProbability: number;

  // Deltas since last update
  deltaConfidence: number;       // Change in confidence since previous bar
  deltaProbability: number;

  // Lifecycle
  lifecycleState: BehaviourLifecycleState;
  barCount: number;              // How many bars this instance has been active
  peakConfidence: number;        // Highest confidence reached so far

  // Context
  regime: string;
  session: string;

  // Evidence snapshot
  evidence: {
    indicatorAgreement: number;
    regimeAlignment: number;
    sessionQuality: number;
    priceStructure: number;
    volumeConfirmation: number;
    historicalBaseRate: number;
    recencyWeight: number;
    rawIndicatorValues: Record<string, number>;
    classifierReasoning: string;
  };
}
```

**Subscribers:** Dashboard SSE stream (live confidence display), Decision Replay Engine (future).

---

## Event 3 — AtlasBehaviourConfirmed

Emitted when a behaviour instance has been confirmed — the expected outcome has occurred. This is the positive resolution event.

```typescript
interface AtlasBehaviourConfirmed extends AtlasBehaviourEventBase {
  type: 'behaviour_confirmed';

  // Final state
  finalConfidence: number;
  peakConfidence: number;
  totalBarsActive: number;

  // Outcome
  confirmationReason: string;    // e.g. 'PRICE_TARGET_REACHED', 'MOMENTUM_SUSTAINED'
  actualOutcome: {
    direction: 'LONG' | 'SHORT';
    priceMove: number;           // Points moved in expected direction
    barsToConfirmation: number;
    actualR: number | null;      // Null if not associated with a trade
  };

  // Performance update trigger
  updatePerformanceStats: boolean;  // Always true for confirmed events
}
```

**Subscribers:** Self-Diagnosis Engine (future), DARWIN performance tracking, Behaviour Performance Stats updater.

---

## Event 4 — AtlasBehaviourExpired

Emitted when a behaviour instance has exceeded its maximum duration without confirming or being rejected. This is a neutral resolution — the behaviour was detected but did not play out within the expected timeframe.

```typescript
interface AtlasBehaviourExpired extends AtlasBehaviourEventBase {
  type: 'behaviour_expired';

  // Final state
  finalConfidence: number;
  peakConfidence: number;
  totalBarsActive: number;
  maxDurationBars: number;

  // Expiry context
  expiryReason: 'MAX_DURATION_EXCEEDED' | 'REGIME_CHANGE' | 'SESSION_END';
  regimeAtExpiry: string;
  sessionAtExpiry: string;

  // Performance update trigger
  updatePerformanceStats: boolean;  // Always true for expired events
}
```

**Subscribers:** DARWIN (expired behaviours are research candidates — why did the behaviour not confirm?), Behaviour Performance Stats updater.

---

## Event 5 — AtlasBehaviourRejected

Emitted when a behaviour instance is actively rejected — contradicting evidence has appeared that invalidates the original classification. This is the negative resolution event and is the most valuable for DARWIN research.

```typescript
interface AtlasBehaviourRejected extends AtlasBehaviourEventBase {
  type: 'behaviour_rejected';

  // Final state
  finalConfidence: number;
  peakConfidence: number;
  totalBarsActive: number;

  // Rejection details
  rejectionReason: string;       // e.g. 'COUNTER_TREND_MOMENTUM', 'REGIME_FLIP', 'LIQUIDITY_SWEEP_OPPOSITE'
  contradictingBehaviourId: string | null;  // If another behaviour triggered the rejection
  contradictingEvidence: {
    indicatorValues: Record<string, number>;
    reasoning: string;
  };

  // Performance update trigger
  updatePerformanceStats: boolean;  // Always true for rejected events
}
```

**Subscribers:** Self-Diagnosis Engine (future), DARWIN (rejected behaviours are the highest-value research signal), Behaviour Performance Stats updater.

---

## Event Bus Integration

The Behaviour Event Bus is implemented as an extension of the existing `AtlasEventBus` from Sprint 121. The integration adds five new event channels without modifying existing market event channels:

```typescript
// Existing channels (Sprint 121)
eventBus.on('trade', handler);
eventBus.on('quote', handler);
eventBus.on('bar_close', handler);
eventBus.on('feed_health', handler);
eventBus.on('symbol_roll', handler);

// New behaviour channels (Sprint 121A design, Sprint 122 implementation)
eventBus.on('behaviour_detected', handler);
eventBus.on('behaviour_updated', handler);
eventBus.on('behaviour_confirmed', handler);
eventBus.on('behaviour_expired', handler);
eventBus.on('behaviour_rejected', handler);
```

The `BehaviourEventType` union is added to the existing `AtlasEventType` union. All existing subscribers are unaffected.

---

## SSE Dashboard Integration

Behaviour events are forwarded to the SSE stream for live dashboard display. The existing SSE handler in `nexusRoutes.ts` is extended to include behaviour events in the broadcast. Dashboard consumers receive behaviour signals in real time alongside market data.

The SSE payload for behaviour events follows the existing `SSEMessage` format:

```typescript
interface BehaviourSSEMessage {
  type: 'behaviour_detected' | 'behaviour_updated' | 'behaviour_confirmed' | 'behaviour_expired' | 'behaviour_rejected';
  data: AtlasBehaviourDetected | AtlasBehaviourUpdated | AtlasBehaviourConfirmed | AtlasBehaviourExpired | AtlasBehaviourRejected;
  ts: number;
}
```

---

## Type Definitions Summary

```typescript
type BehaviourMaturity = 'FORMING' | 'ACTIVE' | 'MATURE' | 'EXHAUSTED';

type BehaviourLifecycleState =
  | 'FORMING'
  | 'ACTIVE'
  | 'MATURE'
  | 'EXHAUSTED'
  | 'CONFIRMED'
  | 'EXPIRED'
  | 'REJECTED';

type AtlasBehaviourEvent =
  | AtlasBehaviourDetected
  | AtlasBehaviourUpdated
  | AtlasBehaviourConfirmed
  | AtlasBehaviourExpired
  | AtlasBehaviourRejected;
```

These types will be added to `shared/types/market-events.ts` in Sprint 122.
