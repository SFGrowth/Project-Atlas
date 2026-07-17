# Atlas Market Event Contracts

**Document type:** Interface Contract Specification  
**Sprint:** 120  
**Status:** DESIGN — Pending Review and Approval  
**Date:** 2026-07-17  
**Implements:** ADR-003

---

## Overview

This document defines the complete set of Atlas market event contracts. These contracts are the internal language of the Atlas market data system. Every component that produces or consumes market data — the DataBento gateway, the bar builder, the feature engine, the DARWIN research engine, the dashboard streaming layer, and the replay engine — communicates exclusively through these contracts.

The contracts are provider-independent. No component downstream of the normalisation layer has any knowledge of DataBento, TradingView, or any other external data source. This design ensures that the data provider can be replaced, extended, or supplemented without changing any consumer code.

---

## Design Principles

The event contract design follows five principles:

**Provider independence.** No contract field references DataBento, TradingView, or any other specific provider. The `source` field identifies the data origin for monitoring and debugging but is never used for business logic.

**Timestamp completeness.** Every event carries both the exchange timestamp (`tsEvent`) and the Atlas receipt timestamp (`atlasTs`). This enables latency measurement and deterministic replay.

**Symbol completeness.** Every event carries the Atlas canonical symbol (`atlasSymbol`), the continuous contract symbol (`symbol`), and the raw exchange contract symbol (`rawSymbol`). This enables symbol-aware processing without requiring consumers to query the symbol registry.

**Immutability.** Events are immutable value objects. No consumer may modify an event after it is published. Consumers that need to enrich events must create new derived events.

**Serializability.** All events must be serialisable to JSON for SSE streaming, logging, and replay. `bigint` fields (`tsEvent`, `tsRecv`) are serialised as strings in JSON contexts.

---

## Event Type Hierarchy

```
AtlasMarketEvent (base)
├── AtlasTradeEvent        — A single executed trade
├── AtlasQuoteEvent        — A BBO (best bid/offer) update
├── AtlasBarEvent          — A 5-minute OHLCV bar (developing or confirmed)
├── AtlasFeedHealthEvent   — Feed health state transition
└── AtlasSymbolMappingEvent — Contract roll or symbol remapping
```

---

## AtlasMarketEvent (Base)

All Atlas market events extend this base interface:

```typescript
interface AtlasMarketEvent {
  type: AtlasMarketEventType;
  eventId: string;           // Atlas-generated UUID v4
  atlasTs: number;           // Atlas receipt timestamp (UTC milliseconds)
  source: AtlasDataSource;   // Data origin
}

type AtlasMarketEventType = 
  | 'trade' 
  | 'quote' 
  | 'bar' 
  | 'feed_health' 
  | 'symbol_mapping';

type AtlasDataSource = 
  | 'databento'           // Live DataBento feed
  | 'databento_snapshot'  // DataBento session-start snapshot
  | 'databento_historical'// DataBento historical API
  | 'tradingview'         // TradingView M-16 webhook
  | 'replay'              // Atlas replay engine
  | 'synthetic';          // Test or simulation data
```

---

## AtlasTradeEvent

An `AtlasTradeEvent` represents a single executed trade at the exchange. It is produced by the DataBento event normaliser for every MBP-1 record with `action='T'`.

```typescript
interface AtlasTradeEvent extends AtlasMarketEvent {
  type: 'trade';
  
  // Symbol identification
  symbol: string;            // Continuous symbol: "MNQ.v.0"
  atlasSymbol: string;       // Atlas canonical: "MNQ1!"
  rawSymbol: string;         // Raw contract: "MNQM5"
  
  // Trade data
  price: number;             // Decimal float (e.g. 21450.25)
  size: number;              // Number of contracts
  side: 'A' | 'B' | 'N';    // A=Ask aggressor (sell), B=Bid aggressor (buy), N=None
  
  // Sequence and timing
  sequence: number;          // Exchange sequence number (uint32)
  tsEvent: bigint;           // Exchange timestamp (nanoseconds since UNIX epoch)
  tsRecv: bigint;            // DataBento receipt timestamp (nanoseconds)
  tsInDelta?: number;        // Exchange-to-DataBento latency (nanoseconds)
}
```

### AtlasTradeEvent: Validation Rules

- `price` must be a positive finite number and a multiple of the instrument's tick size (0.25 for MNQ)
- `size` must be a positive integer
- `side` must be one of 'A', 'B', 'N'
- `sequence` must be a non-negative integer
- `tsEvent` must be a positive bigint
- `atlasTs` must be within 10 seconds of the current wall clock time (stale event detection)

### AtlasTradeEvent: Direction Convention

The `side` field indicates the aggressor side of the trade:

| `side` | Meaning | Market interpretation |
|---|---|---|
| `'B'` | Bid aggressor | A buy order hit the ask — buyer was aggressive |
| `'A'` | Ask aggressor | A sell order hit the bid — seller was aggressive |
| `'N'` | None | Indeterminate (e.g. cross trade, auction) |

---

## AtlasQuoteEvent

An `AtlasQuoteEvent` represents a change to the best bid or offer. It is produced by the DataBento event normaliser for every MBP-1 record with `action` other than 'T'.

```typescript
interface AtlasQuoteEvent extends AtlasMarketEvent {
  type: 'quote';
  
  // Symbol identification
  symbol: string;
  atlasSymbol: string;
  rawSymbol: string;
  
  // BBO data
  bidPx: number;             // Best bid price
  askPx: number;             // Best ask price
  bidSz: number;             // Best bid size (contracts)
  askSz: number;             // Best ask size (contracts)
  bidCt: number;             // Best bid order count
  askCt: number;             // Best ask order count
  
  // Event type
  action: 'A' | 'C' | 'M' | 'R';  // Add/Cancel/Modify/Clear
  side: 'A' | 'B' | 'N';
  
  // Sequence and timing
  sequence: number;
  tsEvent: bigint;
  tsRecv: bigint;
}
```

### AtlasQuoteEvent: Derived Properties

Consumers may derive the following from an `AtlasQuoteEvent`:

```typescript
// Mid price
const mid = (event.bidPx + event.askPx) / 2;

// Spread in points
const spread = event.askPx - event.bidPx;

// Spread in ticks (MNQ tick = 0.25)
const spreadTicks = spread / 0.25;
```

### AtlasQuoteEvent: Validation Rules

- `bidPx` must be less than `askPx` (crossed book is an error condition)
- Both prices must be positive multiples of the tick size
- `bidSz` and `askSz` must be non-negative integers
- `action='R'` (clear book) may have `bidPx=0`, `askPx=0`, `bidSz=0`, `askSz=0`

---

## AtlasBarEvent

An `AtlasBarEvent` represents a 5-minute OHLCV bar. It is produced by the Atlas bar builder in two states: `developing` (updated on every trade) and `confirmed` (finalised at bar close).

```typescript
interface AtlasBarEvent extends AtlasMarketEvent {
  type: 'bar';
  
  // Symbol identification
  symbol: string;
  atlasSymbol: string;
  rawSymbol: string;
  
  // Bar definition
  timeframe: number;         // Minutes (always 5 for standard Atlas bars)
  barOpenTs: number;         // Bar open UTC milliseconds
  barCloseTs: number;        // Bar close UTC milliseconds (projected for developing)
  
  // OHLCV
  open: number;
  high: number;
  low: number;
  close: number;             // Last trade price (developing) or close price (confirmed)
  volume: number;            // Total contracts traded in this bar
  tickCount: number;         // Number of individual trades
  
  // Bar state
  status: 'developing' | 'confirmed';
  
  // Session context (populated by feature engine for confirmed bars)
  session?: string;          // e.g. "AM_OPEN", "PM_CORE", "ETH"
  isRth?: boolean;           // Regular Trading Hours flag
  
  // Indicators (populated by feature engine for confirmed bars only)
  indicators?: AtlasBarIndicators;
  
  // Parity data (populated when M-16 watchdog is active)
  tvBar?: {
    open: number; high: number; low: number; close: number;
    parityStatus: 'MATCH' | 'MISMATCH' | 'PENDING';
    parityDelta?: number;    // Max absolute OHLCV difference
  };
}

interface AtlasBarIndicators {
  // ATR family
  atr14: number;
  atr5: number;
  atrExpansion: number;
  atrPercentile: number;
  
  // Trend
  adx14: number;
  adxTrending: boolean;
  chop: number;
  
  // Momentum
  rsi14: number;
  
  // Price levels
  vwap: number;
  distVwap: number;
  
  // EMAs
  ema9: number;
  ema21: number;
  ema50: number;
  ema200: number;
  ema9Slope: number;
  ema21Slope: number;
  ema50Slope: number;
  emaAlignment: string;      // e.g. "BULL", "BEAR", "MIXED"
  trendDirection: string;    // e.g. "UP", "DOWN", "FLAT"
  
  // Regime
  volatilityState: string;   // e.g. "VOLATILE", "NORMAL", "COMPRESSED"
  compressionState: string;  // e.g. "COMPRESSED", "NORMAL", "EXPANDING"
  regimeClassification: string; // e.g. "BULL_TRENDING", "BEAR_VOLATILE"
  
  // Previous day structure
  prevDayHigh: number;
  prevDayLow: number;
  prevDayClose: number;
  prevDayRange: number;
  prevDayRangeAtr: number;
  overnightGap: number;
  priceVsPrevDay: string;    // e.g. "ABOVE", "BELOW", "AT"
}
```

### AtlasBarEvent: Processing Rules

Only confirmed `AtlasBarEvent` records with `indicators` populated trigger `processBar()`. The processing chain is:

1. Bar builder emits `{ status: 'confirmed' }` at the 5-minute boundary
2. Feature engine receives the confirmed bar, calculates all indicators, and emits a new `AtlasBarEvent` with `indicators` populated
3. `processBar()` is called with the featured bar
4. The featured bar is stored in `atlas_memory`

Developing bars are never stored in `atlas_memory` and never trigger `processBar()`.

---

## AtlasFeedHealthEvent

An `AtlasFeedHealthEvent` is published by the feed health state machine whenever the feed health state changes.

```typescript
interface AtlasFeedHealthEvent extends AtlasMarketEvent {
  type: 'feed_health';
  provider: 'databento' | 'tradingview';
  state: FeedHealthState;
  previousState: FeedHealthState;
  reason: string;            // Human-readable description of the transition
  metadata?: {
    lastMessageTs?: number;  // Timestamp of last received message
    gapCount?: number;       // Number of sequence gaps detected
    reconnectAttempt?: number; // Current reconnection attempt number
    fallbackActive?: boolean;  // Whether M-16 fallback is active
  };
}

type FeedHealthState = 
  | 'CONNECTED'        // Feed is healthy and receiving data
  | 'DEGRADED'         // Feed is receiving data but with gaps or high latency
  | 'RECONNECTING'     // Feed is disconnected and attempting to reconnect
  | 'FALLBACK_ACTIVE'  // DataBento offline, M-16 is primary
  | 'OFFLINE'          // Feed is offline and not attempting to reconnect
  | 'UNKNOWN';         // Initial state before first connection
```

### Feed Health State Transitions

| From | To | Trigger |
|---|---|---|
| `UNKNOWN` | `CONNECTED` | First successful message received |
| `CONNECTED` | `DEGRADED` | Silence > 30 seconds OR gap rate > 0.1% |
| `CONNECTED` | `RECONNECTING` | TCP disconnect |
| `DEGRADED` | `CONNECTED` | Message received, gap rate normalised |
| `DEGRADED` | `RECONNECTING` | Silence > 120 seconds |
| `RECONNECTING` | `CONNECTED` | Reconnection successful |
| `RECONNECTING` | `FALLBACK_ACTIVE` | Reconnection attempts > 3 |
| `FALLBACK_ACTIVE` | `CONNECTED` | DataBento reconnection successful |
| Any | `OFFLINE` | Manual shutdown or unrecoverable error |

---

## AtlasSymbolMappingEvent

An `AtlasSymbolMappingEvent` is published by the symbol registry when a contract roll occurs or when the initial symbol mapping is established.

```typescript
interface AtlasSymbolMappingEvent extends AtlasMarketEvent {
  type: 'symbol_mapping';
  atlasSymbol: string;       // "MNQ1!"
  continuousSymbol: string;  // "MNQ.v.0"
  rawSymbol: string;         // "MNQM5" (new contract)
  previousRawSymbol?: string; // "MNQH5" (previous contract, if roll)
  instrumentId: number;      // DataBento instrument_id
  previousInstrumentId?: number;
  isRoll: boolean;           // true if this is a contract roll
  rollTs?: number;           // Roll timestamp (UTC milliseconds)
  expiryDate?: string;       // New contract expiry date (ISO 8601)
}
```

---

## Event Bus Interface

The event bus exposes a typed publish/subscribe interface:

```typescript
interface AtlasEventBus {
  // Publish an event to all subscribers
  publish(event: AtlasMarketEvent): void;
  
  // Subscribe to events of a specific type
  subscribe(type: 'trade', handler: (event: AtlasTradeEvent) => void): Unsubscribe;
  subscribe(type: 'quote', handler: (event: AtlasQuoteEvent) => void): Unsubscribe;
  subscribe(type: 'bar', handler: (event: AtlasBarEvent) => void): Unsubscribe;
  subscribe(type: 'feed_health', handler: (event: AtlasFeedHealthEvent) => void): Unsubscribe;
  subscribe(type: 'symbol_mapping', handler: (event: AtlasSymbolMappingEvent) => void): Unsubscribe;
  
  // Subscribe to all events
  subscribeAll(handler: (event: AtlasMarketEvent) => void): Unsubscribe;
  
  // Unsubscribe function returned by subscribe
  type Unsubscribe = () => void;
}
```

---

## JSON Serialisation

All events must be serialisable for SSE streaming and logging. The `bigint` fields `tsEvent` and `tsRecv` are serialised as strings:

```typescript
function serialiseEvent(event: AtlasMarketEvent): string {
  return JSON.stringify(event, (key, value) => {
    if (typeof value === 'bigint') return value.toString();
    return value;
  });
}
```

The SSE streaming layer uses this serialiser for all events sent to dashboard clients.

---

## Contract Versioning

The event contracts are versioned. The current version is `1.0.0`. The version is embedded in every event via the `atlasTs` field's presence (version 1.0.0 always has `atlasTs`). Breaking changes to event contracts require a new version number and a migration plan.

Non-breaking additions (new optional fields) do not require a version bump. All consumers must tolerate unknown optional fields.

---

*These contracts are the foundation of the Atlas market data architecture. All implementation sprints must conform to these definitions without modification unless a formal contract revision is approved.*
