/**
 * Sprint 121 — Atlas Market Data Platform Unit Tests
 *
 * Tests for:
 * 1. DBN Parser — binary record parsing
 * 2. Event Normalizer — MBP-1 to Atlas events
 * 3. Symbol Registry — instrument mapping and roll detection
 * 4. Event Bus — typed emit/subscribe
 * 5. Feed Health Monitor — state machine transitions
 * 6. Gap Detector — sequence gap detection
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AtlasEventBus } from './event-bus.js';
import { FeedHealthMonitor } from './feed-health.js';
import { GapDetector } from './gap-detector.js';
import { SymbolRegistry } from './symbol-registry.js';
import { EventNormalizer } from './event-normalizer.js';
import { DbnParser } from './dbn-parser.js';
import type { AtlasTradeEvent, AtlasQuoteEvent, AtlasFeedHealthEvent } from '../../shared/types/market-events.js';
import { ATLAS_EVENT_CHANNELS } from '../../shared/types/market-events.js';

// ── 1. Event Bus Tests ────────────────────────────────────────────────────────

describe('AtlasEventBus', () => {
  let bus: AtlasEventBus;

  beforeEach(() => {
    bus = new AtlasEventBus();
  });

  it('emits and receives trade events via typed methods', () => {
    const received: AtlasTradeEvent[] = [];
    bus.onTrade((e) => received.push(e));

    const trade: AtlasTradeEvent = {
      type: 'trade',
      source: 'databento',
      symbol: 'MNQ',
      instrumentId: 3814,
      price: 21500.25,
      size: 2,
      side: 'B',
      tsEvent: 1_700_000_000_000_000_000n,
      tsRecv: 1_700_000_000_001_000_000n,
      atlasTs: Date.now(),
      sequence: 1001,
    };

    bus.emitTrade(trade);
    expect(received).toHaveLength(1);
    expect(received[0].price).toBe(21500.25);
    expect(received[0].symbol).toBe('MNQ');
  });

  it('emits and receives quote events via typed methods', () => {
    const received: AtlasQuoteEvent[] = [];
    bus.onQuote((e) => received.push(e));

    const quote: AtlasQuoteEvent = {
      type: 'quote',
      source: 'databento',
      symbol: 'MNQ',
      instrumentId: 3814,
      bidPx: 21500.00,
      askPx: 21500.25,
      bidSz: 5,
      askSz: 3,
      bidCt: 2,
      askCt: 1,
      spread: 0.25,
      tsEvent: 1_700_000_000_000_000_000n,
      atlasTs: Date.now(),
      sequence: 1001,
    };

    bus.emitQuote(quote);
    expect(received).toHaveLength(1);
    expect(received[0].spread).toBe(0.25);
  });

  it('tracks metrics correctly', () => {
    bus.onTrade(() => {});
    const trade: AtlasTradeEvent = {
      type: 'trade', source: 'databento', symbol: 'MNQ', instrumentId: 3814,
      price: 21500.25, size: 1, side: 'B',
      tsEvent: 1_700_000_000_000_000_000n, tsRecv: 1_700_000_000_001_000_000n,
      atlasTs: Date.now(), sequence: 1,
    };
    bus.emitTrade(trade);
    bus.emitTrade(trade);

    const metrics = bus.getMetrics();
    expect(metrics.totalEmitted).toBe(2);
    expect(metrics.listenerCount[ATLAS_EVENT_CHANNELS.TRADE]).toBe(1);
  });

  it('allows removing listeners', () => {
    const received: AtlasTradeEvent[] = [];
    const listener = (e: AtlasTradeEvent) => received.push(e);
    bus.onTrade(listener);
    bus.offTrade(listener);

    const trade: AtlasTradeEvent = {
      type: 'trade', source: 'databento', symbol: 'MNQ', instrumentId: 3814,
      price: 21500.25, size: 1, side: 'B',
      tsEvent: 1_700_000_000_000_000_000n, tsRecv: 1_700_000_000_001_000_000n,
      atlasTs: Date.now(), sequence: 1,
    };
    bus.emitTrade(trade);
    expect(received).toHaveLength(0);
  });

  it('does not cross-contaminate trade and quote channels', () => {
    const trades: AtlasTradeEvent[] = [];
    const quotes: AtlasQuoteEvent[] = [];
    bus.onTrade((e) => trades.push(e));
    bus.onQuote((e) => quotes.push(e));

    const quote: AtlasQuoteEvent = {
      type: 'quote', source: 'databento', symbol: 'MNQ', instrumentId: 3814,
      bidPx: 21500.00, askPx: 21500.25, bidSz: 5, askSz: 3, bidCt: 2, askCt: 1,
      spread: 0.25, tsEvent: 1_700_000_000_000_000_000n, atlasTs: Date.now(), sequence: 1,
    };
    bus.emitQuote(quote);

    expect(trades).toHaveLength(0);
    expect(quotes).toHaveLength(1);
  });
});

// ── 2. Feed Health Monitor Tests ──────────────────────────────────────────────

describe('FeedHealthMonitor', () => {
  let bus: AtlasEventBus;
  let monitor: FeedHealthMonitor;

  beforeEach(() => {
    bus = new AtlasEventBus();
    monitor = new FeedHealthMonitor(bus);
    monitor.registerFeed('databento');
    monitor.registerFeed('tradingview');
  });

  it('starts in UNKNOWN state', () => {
    expect(monitor.getState('databento')).toBe('UNKNOWN');
    expect(monitor.getState('tradingview')).toBe('UNKNOWN');
  });

  it('transitions to CONNECTED on setConnected', () => {
    monitor.setConnected('databento');
    expect(monitor.getState('databento')).toBe('CONNECTED');
  });

  it('emits a feed health event on state transition', () => {
    const events: AtlasFeedHealthEvent[] = [];
    bus.onFeedHealth((e) => events.push(e));

    monitor.setConnected('databento');
    expect(events).toHaveLength(1);
    expect(events[0].state).toBe('CONNECTED');
    expect(events[0].previousState).toBe('UNKNOWN');
    expect(events[0].source).toBe('databento');
  });

  it('does not emit when state is unchanged', () => {
    const events: AtlasFeedHealthEvent[] = [];
    bus.onFeedHealth((e) => events.push(e));

    monitor.setConnected('databento');
    monitor.setConnected('databento'); // same state
    expect(events).toHaveLength(1);
  });

  it('transitions CONNECTED → DEGRADED → RECONNECTING', () => {
    monitor.setConnected('databento');
    monitor.setDegraded('databento', 30_000);
    monitor.setDisconnected('databento', 'TCP disconnect');

    expect(monitor.getState('databento')).toBe('RECONNECTING');
  });

  it('transitions to FALLBACK_ACTIVE', () => {
    monitor.setFallbackActive('databento');
    expect(monitor.getState('databento')).toBe('FALLBACK_ACTIVE');
    expect(monitor.isFallbackActive()).toBe(true);
    expect(monitor.isPrimaryHealthy()).toBe(false);
  });

  it('isPrimaryHealthy returns true only when CONNECTED', () => {
    expect(monitor.isPrimaryHealthy()).toBe(false);
    monitor.setConnected('databento');
    expect(monitor.isPrimaryHealthy()).toBe(true);
    monitor.setDegraded('databento', 10_000);
    expect(monitor.isPrimaryHealthy()).toBe(false);
  });

  it('recovers from DEGRADED to CONNECTED on message receipt', () => {
    monitor.setConnected('databento');
    monitor.setDegraded('databento', 30_000);
    expect(monitor.getState('databento')).toBe('DEGRADED');

    monitor.recordMessage('databento', Date.now());
    expect(monitor.getState('databento')).toBe('CONNECTED');
  });

  it('auto-creates entry for unregistered source', () => {
    // Should not throw
    monitor.setConnected('tradingview');
    expect(monitor.getState('tradingview')).toBe('CONNECTED');
  });
});

// ── 3. Gap Detector Tests ─────────────────────────────────────────────────────

describe('GapDetector', () => {
  let detector: GapDetector;

  beforeEach(() => {
    detector = new GapDetector();
  });

  it('does not report gap on first message', () => {
    const gaps: unknown[] = [];
    detector.onGap((e) => gaps.push(e));
    detector.checkSequence(1000);
    expect(gaps).toHaveLength(0);
  });

  it('does not report gap for sequential messages', () => {
    const gaps: unknown[] = [];
    detector.onGap((e) => gaps.push(e));
    detector.checkSequence(1000);
    detector.checkSequence(1001);
    detector.checkSequence(1002);
    expect(gaps).toHaveLength(0);
  });

  it('reports a gap when sequence jumps', () => {
    const gaps: Array<{ gapSize: number }> = [];
    detector.onGap((e) => gaps.push(e));
    detector.checkSequence(1000);
    detector.checkSequence(1005); // gap of 4
    expect(gaps).toHaveLength(1);
    expect(gaps[0].gapSize).toBe(4);
  });

  it('handles 32-bit sequence wrap-around', () => {
    const gaps: unknown[] = [];
    detector.onGap((e) => gaps.push(e));
    detector.checkSequence(0xFFFFFFFF);
    detector.checkSequence(0); // wrap to 0 — expected next is 0
    expect(gaps).toHaveLength(0);
  });

  it('resets and suppresses gaps after reconnection', () => {
    const gaps: unknown[] = [];
    detector.onGap((e) => gaps.push(e));
    detector.checkSequence(1000);
    detector.reset();
    detector.checkSequence(5000); // large jump but suppressed
    expect(gaps).toHaveLength(0);
  });

  it('tracks gap statistics', () => {
    detector.checkSequence(1000);
    detector.checkSequence(1003); // gap of 2
    const stats = detector.getStats();
    expect(stats.gapCount).toBe(1);
    expect(stats.totalGapSize).toBe(2);
  });

  it('does not report gaps > 10000 (reconnection jumps)', () => {
    const gaps: unknown[] = [];
    detector.onGap((e) => gaps.push(e));
    detector.checkSequence(1000);
    detector.checkSequence(50000); // 49000 gap — reconnection
    expect(gaps).toHaveLength(0);
  });
});

// ── 4. Symbol Registry Tests ──────────────────────────────────────────────────

describe('SymbolRegistry', () => {
  let registry: SymbolRegistry;

  beforeEach(() => {
    registry = new SymbolRegistry();
  });

  it('resolves instrument_id to canonical symbol after mapping', () => {
    registry.processSymbolMapping({
      type: 'symbol_mapping',
      source: 'databento',
      instrumentId: 3814,
      rawSymbol: 'MNQM5',
      canonicalSymbol: 'MNQ1!',
      startTs: 0n,
      endTs: 0n,
      atlasTs: Date.now(),
    });

    expect(registry.getCanonicalSymbol(3814)).toBe('MNQ1!');
  });

  it('returns null for unknown instrument_id', () => {
    expect(registry.getCanonicalSymbol(9999)).toBeNull();
  });

  it('detects contract roll when instrument_id changes for same canonical', () => {
    const rolls: unknown[] = [];
    registry.onRoll((e) => rolls.push(e));

    // First mapping — establishes active instrument
    registry.processSymbolMapping({
      type: 'symbol_mapping', source: 'databento',
      instrumentId: 3814, rawSymbol: 'MNQM5', canonicalSymbol: 'MNQ1!',
      startTs: 0n, endTs: 0n, atlasTs: Date.now(),
    });

    // Second mapping with different instrument_id — should trigger roll
    registry.processSymbolMapping({
      type: 'symbol_mapping', source: 'databento',
      instrumentId: 3815, rawSymbol: 'MNQU5', canonicalSymbol: 'MNQ1!',
      startTs: 0n, endTs: 0n, atlasTs: Date.now(),
    });

    expect(rolls).toHaveLength(1);
  });

  it('does not detect roll for same instrument_id re-mapping', () => {
    const rolls: unknown[] = [];
    registry.onRoll((e) => rolls.push(e));

    registry.processSymbolMapping({
      type: 'symbol_mapping', source: 'databento',
      instrumentId: 3814, rawSymbol: 'MNQM5', canonicalSymbol: 'MNQ1!',
      startTs: 0n, endTs: 0n, atlasTs: Date.now(),
    });

    registry.processSymbolMapping({
      type: 'symbol_mapping', source: 'databento',
      instrumentId: 3814, rawSymbol: 'MNQM5', canonicalSymbol: 'MNQ1!',
      startTs: 0n, endTs: 0n, atlasTs: Date.now(),
    });

    expect(rolls).toHaveLength(0);
  });

  it('returns the active instrument_id for MNQ1!', () => {
    registry.processSymbolMapping({
      type: 'symbol_mapping', source: 'databento',
      instrumentId: 3814, rawSymbol: 'MNQM5', canonicalSymbol: 'MNQ1!',
      startTs: 0n, endTs: 0n, atlasTs: Date.now(),
    });

    expect(registry.getActiveInstrumentId()).toBe(3814);
  });

  it('returns null when no symbol mapping has been received', () => {
    const emptyRegistry = new SymbolRegistry();
    expect(emptyRegistry.getActiveInstrumentId()).toBeNull();
  });
});

// ── 5. Event Normalizer Tests ─────────────────────────────────────────────────

describe('EventNormalizer', () => {
  let registry: SymbolRegistry;
  let normalizer: EventNormalizer;

  beforeEach(() => {
    registry = new SymbolRegistry();
    normalizer = new EventNormalizer(registry);

    // Register MNQ instrument
    registry.processSymbolMapping({
      type: 'symbol_mapping', source: 'databento',
      instrumentId: 3814, rawSymbol: 'MNQM5', canonicalSymbol: 'MNQ1!',
      startTs: 0n, endTs: 0n, atlasTs: Date.now(),
    });
  });

  it('normalizes a trade MBP-1 record to AtlasTradeEvent', () => {
    const record: import('./dbn-parser.js').ParsedMbp1Record = {
      rtype: 0x20,
      publisherId: 1,
      instrumentId: 3814,
      tsEvent: 1_700_000_000_000_000_000n,
      price: 21500_250_000_000n, // fixed-point: divide by 1e9 → 21500.25
      size: 2,
      action: 'T',
      side: 'B',
      flags: 0x80, // F_LAST
      depth: 0,
      tsRecv: 1_700_000_000_001_000_000n,
      tsInDelta: 100,
      sequence: 1001,
      bidPx0: 21500_000_000_000n,
      askPx0: 21500_250_000_000n,
      bidSz0: 5,
      askSz0: 3,
      bidCt0: 2,
      askCt0: 1,
    };

    const { trade, quote } = normalizer.normalizeMbp1(record);

    expect(trade).not.toBeNull();
    expect(trade!.price).toBeCloseTo(21500.25, 2);
    expect(trade!.size).toBe(2);
    expect(trade!.side).toBe('B');
    expect(trade!.symbol).toBe('MNQ1!');
    expect(trade!.instrumentId).toBe(3814);
  });

  it('normalizes a quote-only MBP-1 record (action=A)', () => {
    const record: import('./dbn-parser.js').ParsedMbp1Record = {
      rtype: 0x20,
      publisherId: 1,
      instrumentId: 3814,
      tsEvent: 1_700_000_000_000_000_000n,
      price: 0n,
      size: 0,
      action: 'A', // Add order — no trade
      side: 'N',
      flags: 0x80, // F_LAST
      depth: 0,
      tsRecv: 1_700_000_000_001_000_000n,
      tsInDelta: 100,
      sequence: 1002,
      bidPx0: 21500_000_000_000n,
      askPx0: 21500_250_000_000n,
      bidSz0: 5,
      askSz0: 3,
      bidCt0: 2,
      askCt0: 1,
    };

    const { trade, quote } = normalizer.normalizeMbp1(record);

    expect(trade).toBeNull();
    expect(quote).not.toBeNull();
    expect(quote!.bidPx).toBeCloseTo(21500.00, 2);
    expect(quote!.askPx).toBeCloseTo(21500.25, 2);
    expect(quote!.spread).toBeCloseTo(0.25, 2);
  });

  it('returns null trade and null quote for unknown instrument_id', () => {
    const record: import('./dbn-parser.js').ParsedMbp1Record = {
      rtype: 0x20,
      publisherId: 1,
      instrumentId: 9999,
      tsEvent: 1_700_000_000_000_000_000n,
      price: 21500_250_000_000n,
      size: 1,
      action: 'T',
      side: 'B',
      flags: 0x80,
      depth: 0,
      tsRecv: 1_700_000_000_001_000_000n,
      tsInDelta: 100,
      sequence: 1,
      bidPx0: 0n,
      askPx0: 0n,
      bidSz0: 0,
      askSz0: 0,
      bidCt0: 0,
      askCt0: 0,
    };

    const { trade, quote } = normalizer.normalizeMbp1(record);
    expect(trade).toBeNull();
    expect(quote).toBeNull();
  });

  it('converts fixed-point price correctly for MNQ tick size', () => {
    // MNQ tick = 0.25 points = $0.50
    // Price 21500.25 in DataBento fixed-point = 21500250000000 (divide by 1e9)
    const record: import('./dbn-parser.js').ParsedMbp1Record = {
      rtype: 0x20,
      publisherId: 1,
      instrumentId: 3814,
      tsEvent: 1_700_000_000_000_000_000n,
      price: 21500_250_000_000n,
      size: 1,
      action: 'T',
      side: 'A',
      flags: 0x80, // F_LAST
      depth: 0,
      tsRecv: 1_700_000_000_001_000_000n,
      tsInDelta: 100,
      sequence: 1,
      bidPx0: 21500_000_000_000n,
      askPx0: 21500_250_000_000n,
      bidSz0: 1,
      askSz0: 1,
      bidCt0: 1,
      askCt0: 1,
    };

    const { trade } = normalizer.normalizeMbp1(record);
    expect(trade!.price).toBeCloseTo(21500.25, 4);
  });
});

// ── 6. DBN Parser Tests ───────────────────────────────────────────────────────

describe('DbnParser', () => {
  let parser: DbnParser;

  beforeEach(() => {
    parser = new DbnParser();
  });

  it('instantiates without throwing', () => {
    expect(parser).toBeDefined();
  });

  it('does not throw on garbage bytes', () => {
    const errors: unknown[] = [];
    parser.on('error', (e) => errors.push(e));

    // Feed garbage bytes — parser should handle gracefully
    const garbage = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07]);
    expect(() => parser.push(garbage)).not.toThrow();
  });

  it('accepts data without throwing', () => {
    // Construct a minimal DBN record-like buffer
    const buf = Buffer.alloc(88);
    buf.writeUInt8(22, 0); // length units (22 * 4 = 88 bytes)
    buf.writeUInt8(0x20, 1); // rtype = MBP_1

    const errors: unknown[] = [];
    parser.on('error', (e) => errors.push(e));
    expect(() => parser.push(buf)).not.toThrow();
  });

  it('resets cleanly', () => {
    expect(() => parser.reset()).not.toThrow();
  });

  it('exposes push and reset methods', () => {
    expect(typeof parser.push).toBe('function');
    expect(typeof parser.reset).toBe('function');
    expect(typeof parser.on).toBe('function');
  });
});
