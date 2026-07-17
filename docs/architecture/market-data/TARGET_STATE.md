# Atlas Target State Architecture

**Document type:** Target Architecture Design  
**Sprint:** 120  
**Status:** DESIGN — Pending Review and Approval  
**Date:** 2026-07-17  
**Implements:** ADR-001, ADR-002, ADR-003, ADR-004, ADR-005, ADR-006, ADR-007, ADR-008, ADR-009, ADR-010, ADR-011, ADR-012

---

## Overview

This document describes the complete target architecture for Atlas market data processing. The target state transforms Atlas from a TradingView-dependent webhook consumer into an independent, institutional-grade market data platform with DataBento as the primary live feed, a canonical feature library, a tiered storage architecture, a live dashboard chart, and a deterministic replay engine.

The target architecture is designed to be reached incrementally across Sprints 121–127. At no point during the migration does the existing M-16 pipeline lose its ability to trigger `processBar()` and dispatch live trades. The migration is additive and shadow-mode first.

---

## Target Architecture: Complete System View

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        EXTERNAL DATA PROVIDERS                               │
├──────────────────────────────┬──────────────────────────────────────────────┤
│  DataBento (PRIMARY)         │  TradingView M-16 (FALLBACK + WATCHDOG)      │
│  GLBX.MDP3 / MBP-1          │  Pine Script M-16 / 5-min webhook             │
│  TCP Raw API                 │  POST /api/webhook/observe/:token             │
└──────────────┬───────────────┴──────────────────┬───────────────────────────┘
               │                                  │
               ▼                                  ▼
┌──────────────────────────┐    ┌─────────────────────────────────────────────┐
│  Atlas Market Data       │    │  Atlas Webhook Receiver                      │
│  Gateway                 │    │  (unchanged from Sprint 119)                 │
│  ├── databento-client.ts │    │  ├── normalisePayload()                      │
│  ├── event-normalizer.ts │    │  ├── validatePayload()                       │
│  ├── symbol-registry.ts  │    │  ├── insertPipelineReport()                  │
│  ├── gap-detector.ts     │    │  └── atlas_memory insert                     │
│  └── feed-health.ts      │    └─────────────────────────────────────────────┘
└──────────────┬───────────┘
               │
               ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                     Atlas Market Event Bus                                    │
│              (in-process EventEmitter, Redis upgrade path)                   │
│                                                                               │
│  Events: AtlasTradeEvent | AtlasQuoteEvent | AtlasBarEvent                   │
│          AtlasFeedHealthEvent | AtlasSymbolMappingEvent                      │
└──────┬───────────┬────────────┬────────────┬──────────────┬──────────────────┘
       │           │            │            │              │
       ▼           ▼            ▼            ▼              ▼
┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────────┐
│ Live Bar │ │  Tick    │ │  Quote   │ │ DARWIN   │ │  Dashboard SSE       │
│ Builder  │ │ Storage  │ │ Storage  │ │ Research │ │  Streaming Layer     │
│          │ │          │ │          │ │ Engine   │ │                      │
│ Builds   │ │ Hot tier │ │ BBO      │ │ Behaviour│ │  Live chart updates  │
│ 5-min    │ │ MySQL    │ │ spread   │ │ Discovery│ │  Developing bar      │
│ Atlas    │ │ Warm tier│ │ analysis │ │ Market   │ │  Trade annotations   │
│ bars     │ │ MySQL    │ │          │ │ Intent   │ │  Position P&L        │
│          │ │ Cold tier│ │          │ │          │ │  Feed health status  │
└────┬─────┘ │ S3/GCS   │ └──────────┘ └──────────┘ └──────────────────────┘
     │       └──────────┘
     ▼ (confirmed 5-min bar)
┌──────────────────────────────────────────────────────────────────────────────┐
│                    Atlas Feature Engine                                       │
│  Canonical indicator calculations: ATR, ADX, RSI, VWAP, EMAs, Regime        │
│  Same implementation for live, historical, and replay                         │
└──────────────────────────────────┬───────────────────────────────────────────┘
                                   │
                                   ▼
                             processBar()
                                   │
                    ┌──────────────┼──────────────┐
                    ▼              ▼               ▼
                  ADE            ARI             TVL
                    └──────────────┼──────────────┘
                                   ▼
                           Guardian / Safety
                                   │
                                   ▼
                           tpDispatch.ts
                                   │
                                   ▼
                     TradersPost → Tradovate Broker
```

---

## Target State: Component Descriptions

### Atlas Market Data Gateway

The Atlas Market Data Gateway is a new server-side module responsible for the complete lifecycle of the DataBento connection. It is the only component in Atlas that knows about DataBento. All other components consume standardised Atlas market events.

The gateway consists of five sub-components:

**`databento-client.ts`** manages the TCP connection to DataBento's live API. It handles authentication via the challenge-response protocol, subscription management, reconnection with exponential backoff, and session lifecycle. It emits raw DataBento records to the normaliser.

**`event-normalizer.ts`** converts raw DataBento MBP-1 records into Atlas market event contracts (`AtlasTradeEvent`, `AtlasQuoteEvent`). It applies the price conversion from DataBento's 1e-9 integer format to decimal floating point, maps instrument IDs to Atlas symbols using the symbol registry, and stamps each event with an Atlas receipt timestamp.

**`symbol-registry.ts`** maintains the mapping between DataBento instrument IDs and Atlas symbols. It subscribes to DataBento's `definitions` schema to receive instrument definitions, tracks active front-month contracts, and handles contract rolls by updating the mapping and publishing an `AtlasSymbolMappingEvent` to the event bus.

**`gap-detector.ts`** monitors the sequence numbers of incoming MBP-1 records and detects gaps. When a gap is detected, it logs the gap, emits a `AtlasFeedHealthEvent` with severity `DEGRADED`, and triggers a gap-fill request using DataBento's historical API.

**`feed-health.ts`** implements the six-state feed health state machine: `CONNECTED`, `DEGRADED`, `RECONNECTING`, `FALLBACK_ACTIVE`, `OFFLINE`, and `UNKNOWN`. It monitors message rate, gap rate, and last-received timestamps to determine the current state and publishes state transitions to the event bus and to the owner notification system.

### Atlas Market Event Bus

The event bus is the internal message broker that decouples the Market Data Gateway from all downstream consumers. In the initial implementation it is an in-process Node.js `EventEmitter`. The design is structured so that the bus can be replaced with Redis Pub/Sub without changing any consumer code.

The bus carries five event types:

| Event Type | Published By | Consumed By |
|---|---|---|
| `AtlasTradeEvent` | event-normalizer | Bar builder, tick storage, DARWIN, dashboard |
| `AtlasQuoteEvent` | event-normalizer | Quote storage, dashboard, position valuation |
| `AtlasBarEvent` | bar builder | Feature engine, bar storage, DARWIN, dashboard |
| `AtlasFeedHealthEvent` | feed-health, gap-detector | Dashboard, notification system, monitoring |
| `AtlasSymbolMappingEvent` | symbol-registry | Bar builder, all consumers |

### Atlas Live Bar Builder

The bar builder subscribes to `AtlasTradeEvent` events and constructs 5-minute OHLCV bars. It maintains a developing-bar state that is updated on every trade event and published to the event bus as a partial `AtlasBarEvent` with `status: "developing"`. When a bar's 5-minute window closes, the bar builder finalises the bar, stamps it with `status: "confirmed"`, and publishes a confirmed `AtlasBarEvent`.

Confirmed `AtlasBarEvent` records are the trigger for `processBar()`. The bar builder is the only component authorised to produce confirmed bars. No other component may call `processBar()` directly.

### Atlas Feature Engine

The feature engine subscribes to confirmed `AtlasBarEvent` records and calculates all indicators. It maintains a rolling window of confirmed bars and computes ATR, ADX, RSI, VWAP, EMAs, regime classification, and all other indicators using canonical TypeScript implementations. The feature engine is the single source of truth for indicator values in the live system.

The same feature engine implementations are used for historical analysis and replay, ensuring that indicator values are identical regardless of the data source. This is the critical property that enables DARWIN research to use the same indicator logic as the live system.

### Tiered Storage Architecture

Market data is stored in three tiers:

**Hot tier (MySQL, 0–7 days):** Every confirmed `AtlasBarEvent` is stored in the `atlas_memory` table (existing schema). Every `AtlasTradeEvent` is stored in a new `atlas_ticks` table. Every `AtlasQuoteEvent` is stored in a new `atlas_quotes` table. This tier supports real-time queries from the dashboard and DARWIN.

**Warm tier (MySQL, 7–90 days):** Bars older than 7 days are retained in `atlas_memory` but tick and quote data is aggregated into 1-minute OHLCV bars and stored in `atlas_bars_1m`. This tier supports DARWIN research queries and replay.

**Cold tier (S3-compatible object storage, 90+ days):** Bars older than 90 days are exported to compressed Parquet files in object storage. Tick data older than 7 days is exported in bulk. This tier supports long-term backtesting and DARWIN historical research.

### Dashboard Streaming Layer

The dashboard streaming layer extends the existing SSE endpoint (`/api/events`) to carry additional event types:

- `atlas_trade`: every individual trade event (for live chart tick updates)
- `atlas_quote`: every BBO update (for spread display)
- `atlas_bar_developing`: developing-bar OHLCV update (for live candlestick)
- `atlas_bar_confirmed`: confirmed bar event (for bar close)
- `atlas_feed_health`: feed health state transitions

The dashboard uses TradingView Lightweight Charts to display a live candlestick chart. The chart receives developing-bar updates on every trade and confirmed-bar updates on every bar close.

### TradingView M-16 Fallback

The TradingView M-16 webhook pipeline remains fully operational throughout the migration and beyond. Its role transitions from primary feed to fallback and watchdog:

- **Fallback:** If the DataBento feed enters `RECONNECTING` or `OFFLINE` state, the feed-health monitor activates M-16 as the primary trigger for `processBar()`. The existing webhook receiver and `atlas_memory` insert path are unchanged.
- **Watchdog:** Even when DataBento is the primary feed, M-16 continues to fire on every bar close. The Atlas parity monitor compares M-16 bar data against Atlas-built bars and alerts if there is a discrepancy.

---

## Target State: Data Flow Sequences

### Sequence 1: Live Trade Event (DataBento Primary Active)

```
DataBento TCP socket → raw MBP-1 record (action=T)
  → event-normalizer.ts: convert to AtlasTradeEvent
  → event bus: emit('trade', AtlasTradeEvent)
  → bar-builder.ts: update developing bar OHLCV
  → bar-builder.ts: emit('bar:developing', partial AtlasBarEvent)
  → dashboard SSE: broadcast atlas_bar_developing event
  → tick-storage.ts: insert into atlas_ticks
  → darwin-engine.ts: update intrabar research state
```

### Sequence 2: Bar Close (5-minute boundary)

```
bar-builder.ts: 5-minute window closes
  → bar-builder.ts: finalise confirmed bar
  → bar-builder.ts: emit('bar:confirmed', AtlasBarEvent)
  → feature-engine.ts: calculate all indicators
  → feature-engine.ts: emit('bar:featured', AtlasBarEvent with indicators)
  → atlas_memory insert (same schema as M-16 path)
  → processBar() called
  → ADE → ARI → TVL → Guardian → Safety → tpDispatch
  → bar-storage.ts: insert into atlas_memory
  → dashboard SSE: broadcast atlas_bar_confirmed event
  → darwin-engine.ts: update research state
```

### Sequence 3: M-16 Webhook Received (Fallback or Watchdog)

```
TradingView → POST /api/webhook/observe/:token
  → normalisePayload() → validatePayload()
  → insertPipelineReport()
  → atlas_memory insert (existing path)
  → parity-monitor.ts: compare M-16 bar vs Atlas bar
  → if DataBento offline: processBar() called (fallback mode)
  → if DataBento online: parity check only (watchdog mode)
  → SSE broadcast: pipeline_report event
```

### Sequence 4: Feed Failure and Recovery

```
DataBento TCP socket: silence > 30 seconds
  → feed-health.ts: transition CONNECTED → DEGRADED
  → emit AtlasFeedHealthEvent (severity=WARN)
  → dashboard SSE: broadcast feed_health event
  → notification: "DataBento feed degraded"

DataBento TCP socket: silence > 120 seconds
  → feed-health.ts: transition DEGRADED → RECONNECTING
  → databento-client.ts: begin reconnection sequence
  → emit AtlasFeedHealthEvent (severity=ERROR)
  → feed-health.ts: activate M-16 fallback
  → notification: "DataBento offline, M-16 fallback active"

DataBento TCP socket: reconnected
  → databento-client.ts: session restored
  → feed-health.ts: transition RECONNECTING → CONNECTED
  → emit AtlasFeedHealthEvent (severity=INFO)
  → feed-health.ts: deactivate M-16 fallback
  → notification: "DataBento reconnected"
```

---

## Target State: Interface Contracts

### AtlasTradeEvent

```typescript
interface AtlasTradeEvent {
  type: 'trade';
  eventId: string;           // Atlas-generated UUID
  symbol: string;            // e.g. "MNQ.v.0"
  atlasSymbol: string;       // e.g. "MNQ1!" (Atlas canonical)
  rawSymbol: string;         // e.g. "MNQM5" (DataBento raw)
  price: number;             // Decimal float (converted from 1e-9)
  size: number;              // Contracts
  side: 'A' | 'B' | 'N';    // Ask aggressor / Bid aggressor / None
  action: 'T';               // Always T for trade events
  sequence: number;          // Exchange sequence number
  tsEvent: bigint;           // Exchange timestamp (nanoseconds)
  tsRecv: bigint;            // DataBento receipt timestamp (nanoseconds)
  atlasTs: number;           // Atlas receipt timestamp (milliseconds)
  source: 'databento' | 'replay';
}
```

### AtlasQuoteEvent

```typescript
interface AtlasQuoteEvent {
  type: 'quote';
  eventId: string;
  symbol: string;
  atlasSymbol: string;
  rawSymbol: string;
  bidPx: number;             // Best bid price
  askPx: number;             // Best ask price
  bidSz: number;             // Best bid size
  askSz: number;             // Best ask size
  bidCt: number;             // Best bid order count
  askCt: number;             // Best ask order count
  action: 'A' | 'C' | 'M' | 'R';  // Add/Cancel/Modify/Clear
  side: 'A' | 'B' | 'N';
  sequence: number;
  tsEvent: bigint;
  tsRecv: bigint;
  atlasTs: number;
  source: 'databento' | 'replay';
}
```

### AtlasBarEvent

```typescript
interface AtlasBarEvent {
  type: 'bar';
  eventId: string;
  symbol: string;
  atlasSymbol: string;
  rawSymbol: string;
  timeframe: number;         // Minutes (5 for standard bars)
  barOpenTs: number;         // Bar open UTC milliseconds
  barCloseTs: number;        // Bar close UTC milliseconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  tickCount: number;         // Number of trades in this bar
  status: 'developing' | 'confirmed';
  // Indicators (only present when status='confirmed' and feature engine has run)
  indicators?: AtlasBarIndicators;
  source: 'databento' | 'tradingview' | 'replay' | 'historical';
}
```

### AtlasFeedHealthEvent

```typescript
interface AtlasFeedHealthEvent {
  type: 'feed_health';
  provider: 'databento' | 'tradingview';
  state: 'CONNECTED' | 'DEGRADED' | 'RECONNECTING' | 'FALLBACK_ACTIVE' | 'OFFLINE' | 'UNKNOWN';
  previousState: string;
  reason: string;
  ts: number;
  metadata?: Record<string, unknown>;
}
```

---

## Target State: Non-Functional Requirements

| Requirement | Target | Measurement |
|---|---|---|
| Trade event latency (DataBento → atlas_ticks) | < 50ms p99 | Prometheus histogram |
| Bar event latency (bar close → processBar()) | < 200ms p99 | Prometheus histogram |
| Feed reconnection time | < 30 seconds | Feed health monitor |
| Dashboard chart update rate | ≥ 1 update/second during RTH | SSE message rate |
| Tick storage throughput | ≥ 500 events/second | Prometheus counter |
| Bar parity with M-16 | ≥ 99.9% OHLCV agreement | Parity monitor |
| Indicator parity with M-16 | ≥ 99.0% agreement (within 0.01%) | Parity monitor |
| Feed uptime during RTH | ≥ 99.5% | Feed health state machine |
| Cold storage export lag | < 24 hours | Storage tier monitor |
| Replay accuracy | 100% deterministic | Replay certification test |

---

## Target State: Rollback Criteria

The following conditions require immediate rollback to M-16-only mode:

- DataBento bar OHLCV disagrees with M-16 by more than 0.25 points on any confirmed bar
- Atlas Feature Engine indicator values disagree with M-16 by more than 1% on any confirmed bar
- `processBar()` is called by any path other than the Atlas bar builder
- Any execution dispatch occurs during the shadow-mode phase
- Any DataBento API key or credential is exposed to the browser
- Feed health state machine enters `OFFLINE` for more than 10 minutes without recovery

---

*This document describes the complete target architecture. Implementation begins in Sprint 121 following design review and approval.*
