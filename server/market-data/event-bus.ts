/**
 * Atlas Event Bus
 *
 * In-process typed EventEmitter for Atlas market events.
 * All market data flows through this bus — DataBento, TradingView, and replay
 * all publish to the same channels. Consumers subscribe once and receive events
 * from whichever source is active.
 *
 * Design: ADR-006 — In-process EventEmitter (Redis upgrade path documented)
 *
 * Sprint 121 — Atlas Market Data Platform
 */

import { EventEmitter } from 'events';
import {
  AtlasMarketEvent,
  AtlasTradeEvent,
  AtlasQuoteEvent,
  AtlasBarEvent,
  AtlasFeedHealthEvent,
  AtlasSymbolMappingEvent,
  ATLAS_EVENT_CHANNELS,
} from '../../shared/types/market-events.js';

// ── Event bus metrics ─────────────────────────────────────────────────────────

export interface EventBusMetrics {
  totalEmitted: number;
  totalDropped: number;
  listenerCount: Record<string, number>;
  lastEventTs: number;
}

// ── Atlas Event Bus class ─────────────────────────────────────────────────────

export class AtlasEventBus extends EventEmitter {
  private metrics: EventBusMetrics = {
    totalEmitted: 0,
    totalDropped: 0,
    listenerCount: {},
    lastEventTs: 0,
  };

  constructor() {
    super();
    // Increase max listeners to avoid Node.js warnings in production
    this.setMaxListeners(50);
  }

  // ── Typed emit methods ──────────────────────────────────────────────────────

  emitTrade(event: AtlasTradeEvent): void {
    this.metrics.totalEmitted++;
    this.metrics.lastEventTs = Date.now();
    this.emit(ATLAS_EVENT_CHANNELS.TRADE, event);
  }

  emitQuote(event: AtlasQuoteEvent): void {
    this.metrics.totalEmitted++;
    this.metrics.lastEventTs = Date.now();
    this.emit(ATLAS_EVENT_CHANNELS.QUOTE, event);
  }

  emitBar(event: AtlasBarEvent): void {
    this.metrics.totalEmitted++;
    this.metrics.lastEventTs = Date.now();
    this.emit(ATLAS_EVENT_CHANNELS.BAR, event);
  }

  emitFeedHealth(event: AtlasFeedHealthEvent): void {
    this.metrics.totalEmitted++;
    this.metrics.lastEventTs = Date.now();
    this.emit(ATLAS_EVENT_CHANNELS.FEED_HEALTH, event);
  }

  emitSymbolMapping(event: AtlasSymbolMappingEvent): void {
    this.metrics.totalEmitted++;
    this.metrics.lastEventTs = Date.now();
    this.emit(ATLAS_EVENT_CHANNELS.SYMBOL_MAPPING, event);
  }

  // ── Typed subscribe methods ─────────────────────────────────────────────────

  onTrade(listener: (event: AtlasTradeEvent) => void): this {
    return this.on(ATLAS_EVENT_CHANNELS.TRADE, listener as (e: unknown) => void);
  }

  onQuote(listener: (event: AtlasQuoteEvent) => void): this {
    return this.on(ATLAS_EVENT_CHANNELS.QUOTE, listener as (e: unknown) => void);
  }

  onBar(listener: (event: AtlasBarEvent) => void): this {
    return this.on(ATLAS_EVENT_CHANNELS.BAR, listener as (e: unknown) => void);
  }

  onFeedHealth(listener: (event: AtlasFeedHealthEvent) => void): this {
    return this.on(ATLAS_EVENT_CHANNELS.FEED_HEALTH, listener as (e: unknown) => void);
  }

  onSymbolMapping(listener: (event: AtlasSymbolMappingEvent) => void): this {
    return this.on(ATLAS_EVENT_CHANNELS.SYMBOL_MAPPING, listener as (e: unknown) => void);
  }

  // ── Unsubscribe helpers ─────────────────────────────────────────────────────

  offTrade(listener: (event: AtlasTradeEvent) => void): this {
    return this.off(ATLAS_EVENT_CHANNELS.TRADE, listener as (e: unknown) => void);
  }

  offQuote(listener: (event: AtlasQuoteEvent) => void): this {
    return this.off(ATLAS_EVENT_CHANNELS.QUOTE, listener as (e: unknown) => void);
  }

  offBar(listener: (event: AtlasBarEvent) => void): this {
    return this.off(ATLAS_EVENT_CHANNELS.BAR, listener as (e: unknown) => void);
  }

  // ── Metrics ─────────────────────────────────────────────────────────────────

  getMetrics(): EventBusMetrics {
    const listenerCount: Record<string, number> = {};
    for (const channel of Object.values(ATLAS_EVENT_CHANNELS)) {
      listenerCount[channel] = this.listenerCount(channel);
    }
    return {
      ...this.metrics,
      listenerCount,
    };
  }

  resetMetrics(): void {
    this.metrics = {
      totalEmitted: 0,
      totalDropped: 0,
      listenerCount: {},
      lastEventTs: 0,
    };
  }
}

// ── Singleton instance ────────────────────────────────────────────────────────

/** Global Atlas event bus singleton */
export const atlasEventBus = new AtlasEventBus();
