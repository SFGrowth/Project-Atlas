# Atlas Event Transport Design

**Document type:** Component Design  
**Sprint:** 120  
**Status:** DESIGN — Pending Review and Approval  
**Date:** 2026-07-17  
**Implements:** ADR-004

---

## Overview

This document specifies the design of the Atlas internal event transport — the mechanism by which market events flow from the DataBento gateway to all downstream consumers. The transport is the backbone of the Atlas market data architecture. Its design determines the system's throughput, latency, reliability, and scalability.

---

## Transport Selection: In-Process EventEmitter

Atlas will use Node.js's built-in `EventEmitter` as the initial event transport. This is the simplest possible implementation that satisfies all Sprint 121–127 requirements without introducing external dependencies.

The selection rationale is as follows. Atlas is a single-process Node.js application running on a single server. All consumers (bar builder, tick storage, DARWIN, dashboard SSE layer) run in the same process. There is no requirement for cross-process or cross-server event delivery in the initial implementation. The `EventEmitter` provides zero-copy, zero-serialisation event delivery with nanosecond latency within the same process.

The design is structured so that the `EventEmitter` can be replaced with Redis Pub/Sub or another message broker without changing any consumer code. The upgrade path is documented in the Redis Upgrade Path section below.

### Throughput Analysis

MNQ during Regular Trading Hours (RTH) produces approximately 500–2,000 trade events per minute. This is approximately 8–33 events per second. The `EventEmitter` can handle millions of events per second in a single Node.js process. There is no throughput concern for the initial implementation.

During high-volatility periods (e.g., FOMC announcements, major economic releases), MNQ can produce 5,000–20,000 events per minute (83–333 events per second). This remains well within `EventEmitter` capacity.

---

## Event Bus Implementation

The event bus is implemented as a typed wrapper around `EventEmitter`:

```typescript
// server/market-data/event-bus.ts

import { EventEmitter } from 'events';
import type {
  AtlasMarketEvent,
  AtlasTradeEvent,
  AtlasQuoteEvent,
  AtlasBarEvent,
  AtlasFeedHealthEvent,
  AtlasSymbolMappingEvent,
} from '../../shared/types/market-events.js';

class AtlasEventBus {
  private emitter = new EventEmitter();
  
  constructor() {
    // Increase max listeners to prevent warning (default is 10)
    this.emitter.setMaxListeners(50);
  }
  
  publish(event: AtlasMarketEvent): void {
    this.emitter.emit(event.type, event);
    this.emitter.emit('*', event);  // wildcard for monitoring
  }
  
  onTrade(handler: (event: AtlasTradeEvent) => void): () => void {
    this.emitter.on('trade', handler);
    return () => this.emitter.off('trade', handler);
  }
  
  onQuote(handler: (event: AtlasQuoteEvent) => void): () => void {
    this.emitter.on('quote', handler);
    return () => this.emitter.off('quote', handler);
  }
  
  onBar(handler: (event: AtlasBarEvent) => void): () => void {
    this.emitter.on('bar', handler);
    return () => this.emitter.off('bar', handler);
  }
  
  onFeedHealth(handler: (event: AtlasFeedHealthEvent) => void): () => void {
    this.emitter.on('feed_health', handler);
    return () => this.emitter.off('feed_health', handler);
  }
  
  onSymbolMapping(handler: (event: AtlasSymbolMappingEvent) => void): () => void {
    this.emitter.on('symbol_mapping', handler);
    return () => this.emitter.off('symbol_mapping', handler);
  }
  
  onAll(handler: (event: AtlasMarketEvent) => void): () => void {
    this.emitter.on('*', handler);
    return () => this.emitter.off('*', handler);
  }
}

// Singleton instance — shared across all server modules
export const atlasEventBus = new AtlasEventBus();
```

The event bus is a singleton. All server modules import `atlasEventBus` and use it directly. There is no dependency injection or factory pattern required for the initial implementation.

---

## Consumer Registration

Each consumer registers its handlers during module initialisation. The registration pattern is:

```typescript
// server/market-data/bar-builder.ts
import { atlasEventBus } from './event-bus.js';

export function initBarBuilder(): void {
  const unsubscribeTrade = atlasEventBus.onTrade(handleTrade);
  const unsubscribeSymbol = atlasEventBus.onSymbolMapping(handleSymbolMapping);
  
  // Store unsubscribe functions for graceful shutdown
  shutdownHandlers.push(unsubscribeTrade, unsubscribeSymbol);
}
```

All consumers must store their unsubscribe functions and call them during graceful shutdown to prevent memory leaks.

---

## Event Ordering Guarantees

The `EventEmitter` delivers events synchronously in the order they are published. All handlers for a given event type are called in the order they were registered. This provides the following guarantees:

- Trade events are delivered to all consumers in the order they arrive from DataBento
- Bar events are delivered after all trade events for that bar have been processed
- Feed health events are delivered immediately when the state machine transitions

There is no buffering or queuing in the event bus. If a consumer's handler is slow, it blocks the delivery of subsequent events to all other consumers. Consumer handlers must be non-blocking. Any slow operation (database insert, HTTP request) must be executed asynchronously without blocking the handler.

### Non-Blocking Handler Pattern

```typescript
// ✅ Correct: non-blocking handler
atlasEventBus.onTrade((event) => {
  // Synchronous state update (fast)
  barBuilder.updateDevelopingBar(event);
  
  // Async operation (non-blocking)
  tickStorage.insertTick(event).catch((err) => {
    console.error('[TickStorage] Insert failed:', err);
  });
});

// ❌ Incorrect: blocking handler
atlasEventBus.onTrade(async (event) => {
  await tickStorage.insertTick(event); // Blocks all other consumers
});
```

---

## Back-Pressure Handling

The `EventEmitter` has no built-in back-pressure mechanism. If a consumer falls behind, events accumulate in the Node.js event loop. For the initial implementation, this is acceptable because:

1. MNQ tick rate (8–333 events/second) is well below Node.js's processing capacity
2. All consumer handlers are designed to be non-blocking
3. Database inserts are fire-and-forget (errors logged but not retried in the hot path)

If back-pressure becomes a concern in future (e.g., when adding more instruments or higher-frequency schemas), the Redis upgrade path provides a natural solution.

---

## SSE Fan-Out

The dashboard SSE layer subscribes to the event bus and fans out events to all connected browser clients. The fan-out is implemented as a separate consumer that serialises events to JSON and writes them to each SSE response stream.

The SSE fan-out must not block the event bus. If a client's SSE connection is slow, the write to that client's stream is dropped (not queued). The client will receive the next event on the next publish cycle. This prevents a slow dashboard client from blocking the entire event pipeline.

```typescript
// server/market-data/sse-fanout.ts
atlasEventBus.onTrade((event) => {
  const data = serialiseEvent(event);
  for (const [clientId, client] of sseClients) {
    try {
      client.res.write(`event: atlas_trade\ndata: ${data}\n\n`);
    } catch {
      // Client disconnected — remove from map
      sseClients.delete(clientId);
    }
  }
});
```

---

## Redis Upgrade Path

The event bus interface is designed to be drop-in replaceable with a Redis Pub/Sub implementation. The upgrade is triggered when any of the following conditions are met:

- Atlas scales to multiple server instances (horizontal scaling)
- A consumer requires durable message delivery (guaranteed delivery even if consumer is offline)
- The tick rate exceeds 10,000 events/second (unlikely for single-instrument MNQ)
- DARWIN research requires cross-process event streaming

The Redis upgrade requires:

1. Replace `AtlasEventBus` implementation with a Redis Pub/Sub client
2. Add serialisation/deserialisation for all event types
3. Add consumer group support for durable delivery
4. No changes to any consumer code (the interface is identical)

The upgrade is estimated at 2–3 days of engineering work and does not require any consumer code changes.

---

## Event Bus Monitoring

The event bus exposes the following metrics for the observability layer:

| Metric | Type | Description |
|---|---|---|
| `atlas_event_bus_published_total` | Counter | Total events published, by type |
| `atlas_event_bus_consumers` | Gauge | Number of registered consumers, by type |
| `atlas_event_bus_handler_duration_ms` | Histogram | Handler execution time, by consumer and type |
| `atlas_event_bus_handler_errors_total` | Counter | Handler errors, by consumer and type |

These metrics are collected by wrapping each handler call with a timing and error-counting decorator.

---

*This document specifies the Atlas event transport for Sprint 121. The in-process EventEmitter implementation is the correct choice for the initial deployment. The Redis upgrade path is documented and ready to execute when required.*
