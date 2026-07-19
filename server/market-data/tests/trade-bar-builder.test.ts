/**
 * test-trade-bar-builder.ts — Trade-Built Bar Lifecycle Tests
 *
 * Tests the full trade-built DEVELOPING → PROVISIONAL → CONFIRMED/UNRESOLVED
 * lifecycle required by Gate G3 Revision 2.
 *
 * TEST-123A3-TBB001..TBB012
 *
 * Sprint 123A.3 — Gate G3 Revision 2
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { TradeBarBuilder, BridgeTradePayload, BridgeOhlcv1mPayload } from '../trade-bar-builder.js';
import { BarLifecycle, ReconciliationStatus, MinuteBar } from '../types/bar-lifecycle.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

/** 14:00:00.000 UTC on 2024-01-15 */
const BASE_TS_MS = 1705323600000;
const BASE_TS_NS = String(BigInt(BASE_TS_MS) * 1_000_000n);

function makeBuilder(opts: { pendingTimeoutMs?: number } = {}): TradeBarBuilder {
  return new TradeBarBuilder({
    dataset: 'GLBX.MDP3',
    rawSymbol: 'MNQH4',
    instrumentId: 372107,
    pendingTimeoutMs: opts.pendingTimeoutMs ?? 90_000,
  });
}

function makeTrade(overrides: Partial<BridgeTradePayload> = {}): BridgeTradePayload {
  return {
    schema: 'trade',
    dataset: 'GLBX.MDP3',
    raw_symbol: 'MNQH4',
    instrument_id: 372107,
    ts_event_ns: BASE_TS_NS,
    price_pts100: 1950000,
    size: 5,
    atlas_processing_ts_ms: BASE_TS_MS + 50,
    ...overrides,
  };
}

function makeOfficialOhlcv(overrides: Partial<BridgeOhlcv1mPayload> = {}): BridgeOhlcv1mPayload {
  return {
    schema: 'ohlcv-1m',
    dataset: 'GLBX.MDP3',
    raw_symbol: 'MNQH4',
    instrument_id: 372107,
    ts_event_ns: BASE_TS_NS,
    ts_recv_ns: String(BigInt(BASE_TS_MS + 100) * 1_000_000n),
    open_pts100: 1950000,
    high_pts100: 1951000,
    low_pts100: 1949500,
    close_pts100: 1950500,
    volume: 100,
    trade_count: 10,
    atlas_processing_ts_ms: BASE_TS_MS + 200,
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Trade-Built Bar Lifecycle (Gate G3 Revision 2)', () => {
  let builder: TradeBarBuilder;

  beforeEach(() => {
    builder = makeBuilder();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('TEST-123A3-TBB001: first trade creates a DEVELOPING bar', () => {
    const events: string[] = [];
    builder.on('bar:developing', () => events.push('developing'));
    builder.processTrade(makeTrade());
    expect(events).toContain('developing');
    const dev = builder.getDevelopingBar();
    expect(dev).not.toBeNull();
    expect(dev!.lifecycleState).toBe(BarLifecycle.DEVELOPING);
  });

  it('TEST-123A3-TBB002: subsequent trades update OHLCV correctly', () => {
    builder.processTrade(makeTrade({ price_pts100: 1950000, size: 5 }));
    builder.processTrade(makeTrade({ price_pts100: 1952000, size: 3 })); // New high
    builder.processTrade(makeTrade({ price_pts100: 1948000, size: 2 })); // New low
    builder.processTrade(makeTrade({ price_pts100: 1951000, size: 7 })); // New close

    const dev = builder.getDevelopingBar();
    expect(dev).not.toBeNull();
    expect(dev!.ohlcv.openPts100).toBe(1950000);   // First trade
    expect(dev!.ohlcv.highPts100).toBe(1952000);   // Max
    expect(dev!.ohlcv.lowPts100).toBe(1948000);    // Min
    expect(dev!.ohlcv.closePts100).toBe(1951000);  // Last trade
    expect(dev!.ohlcv.volume).toBe(17);             // Sum: 5+3+2+7
    expect(dev!.ohlcv.tradeCount).toBe(4);
  });

  it('TEST-123A3-TBB003: minute boundary creates PROVISIONAL only (not CONFIRMED)', () => {
    const events: string[] = [];
    builder.on('bar:provisional', () => events.push('provisional'));
    builder.on('bar:confirmed', () => events.push('confirmed'));

    builder.processTrade(makeTrade());
    builder.closeMinute(BASE_TS_MS);

    expect(events).toContain('provisional');
    expect(events).not.toContain('confirmed');
  });

  it('TEST-123A3-TBB004: official record is required for CONFIRMED (internally consistent provisional is not confirmed without it)', () => {
    const confirmed: MinuteBar[] = [];
    builder.on('bar:confirmed', (e: { bar: MinuteBar }) => confirmed.push(e.bar));

    // Build a perfectly valid DEVELOPING bar
    builder.processTrade(makeTrade({ price_pts100: 1950000 }));
    builder.processTrade(makeTrade({ price_pts100: 1951000 })); // High
    builder.processTrade(makeTrade({ price_pts100: 1949500 })); // Low
    builder.processTrade(makeTrade({ price_pts100: 1950500 })); // Close

    // Close the minute — bar is PROVISIONAL, not CONFIRMED
    builder.closeMinute(BASE_TS_MS);
    expect(confirmed.length).toBe(0); // NOT confirmed yet

    // Now send the official record
    builder.processOfficialOhlcv1m(makeOfficialOhlcv({
      open_pts100: 1950000,
      high_pts100: 1951000,
      low_pts100: 1949500,
      close_pts100: 1950500,
      volume: 4,
    }));
    expect(confirmed.length).toBe(1); // NOW confirmed
    expect(confirmed[0].lifecycle).toBe(BarLifecycle.CONFIRMED);
  });

  it('TEST-123A3-TBB005: exact official match confirms the bar', () => {
    builder.processTrade(makeTrade({ price_pts100: 1950000, size: 10 }));
    builder.closeMinute(BASE_TS_MS);

    const confirmed: MinuteBar[] = [];
    builder.on('bar:confirmed', (e: { bar: MinuteBar }) => confirmed.push(e.bar));

    builder.processOfficialOhlcv1m(makeOfficialOhlcv({
      open_pts100: 1950000,
      high_pts100: 1950000,
      low_pts100: 1950000,
      close_pts100: 1950000,
      volume: 10,
    }));

    expect(confirmed.length).toBe(1);
    expect(confirmed[0].reconciliation!.status).toBe(ReconciliationStatus.MATCHED);
    expect(confirmed[0].reconciliation!.withinTolerance).toBe(true);
    expect(confirmed[0].reconciliation!.closeDetlaPts100).toBe(0);
  });

  it('TEST-123A3-TBB006: one-tick tolerance (25 pts100) confirms the bar', () => {
    builder.processTrade(makeTrade({ price_pts100: 1950000, size: 10 }));
    builder.closeMinute(BASE_TS_MS);

    const confirmed: MinuteBar[] = [];
    builder.on('bar:confirmed', (e: { bar: MinuteBar }) => confirmed.push(e.bar));

    // Official close is 25 pts100 away (exactly at tolerance boundary)
    builder.processOfficialOhlcv1m(makeOfficialOhlcv({
      open_pts100: 1950000,
      high_pts100: 1950000,
      low_pts100: 1950000,
      close_pts100: 1950000 - 25, // Exactly at tolerance
      volume: 10,
    }));

    expect(confirmed.length).toBe(1);
    expect(confirmed[0].reconciliation!.withinTolerance).toBe(true);
    expect(confirmed[0].reconciliation!.closeDetlaPts100).toBe(25); // constructed - official
  });

  it('TEST-123A3-TBB007: excessive close delta (26 pts100) becomes UNRESOLVED', () => {
    builder.processTrade(makeTrade({ price_pts100: 1950000, size: 10 }));
    builder.closeMinute(BASE_TS_MS);

    const unresolved: MinuteBar[] = [];
    builder.on('bar:unresolved', (e: { bar: MinuteBar }) => unresolved.push(e.bar));

    builder.processOfficialOhlcv1m(makeOfficialOhlcv({
      open_pts100: 1950000,
      high_pts100: 1950000,
      low_pts100: 1950000,
      close_pts100: 1950000 - 26, // 26 pts100 — exceeds tolerance
      volume: 10,
    }));

    expect(unresolved.length).toBe(1);
    expect(unresolved[0].lifecycle).toBe(BarLifecycle.UNRESOLVED);
    expect(unresolved[0].reconciliation!.status).toBe(ReconciliationStatus.UNMATCHED);
    expect(unresolved[0].reconciliation!.withinTolerance).toBe(false);
    expect(unresolved[0].reconciliation!.closeDetlaPts100).toBe(26);
  });

  it('TEST-123A3-TBB008: missing official record causes UNRESOLVED after timeout', () => {
    builder.processTrade(makeTrade({ price_pts100: 1950000 }));
    builder.closeMinute(BASE_TS_MS);

    const unresolved: MinuteBar[] = [];
    builder.on('bar:unresolved', (e: { bar: MinuteBar }) => unresolved.push(e.bar));

    // Advance fake timers past the pending timeout
    vi.advanceTimersByTime(90_001);

    expect(unresolved.length).toBe(1);
    expect(unresolved[0].lifecycle).toBe(BarLifecycle.UNRESOLVED);
    expect(unresolved[0].reconciliation!.status).toBe(ReconciliationStatus.UNAVAILABLE);
  });

  it('TEST-123A3-TBB009: nanosecond timestamps retain precision in DEVELOPING bar', () => {
    const highPrecisionNs = '1705323600123456789'; // Sub-millisecond precision
    builder.processTrade(makeTrade({ ts_event_ns: highPrecisionNs }));
    const dev = builder.getDevelopingBar();
    expect(dev!.firstTradeTsNs).toBe(highPrecisionNs);
    expect(dev!.lastTradeTsNs).toBe(highPrecisionNs);
  });

  it('TEST-123A3-TBB010: confirmed event is emitted exactly once per bar', () => {
    builder.processTrade(makeTrade({ price_pts100: 1950000, size: 10 }));
    builder.closeMinute(BASE_TS_MS);

    const confirmedCount = { count: 0 };
    builder.on('bar:confirmed', () => { confirmedCount.count++; });

    // Send official record once
    builder.processOfficialOhlcv1m(makeOfficialOhlcv({
      open_pts100: 1950000, high_pts100: 1950000, low_pts100: 1950000,
      close_pts100: 1950000, volume: 10,
    }));
    // Send official record again (duplicate)
    builder.processOfficialOhlcv1m(makeOfficialOhlcv({
      open_pts100: 1950000, high_pts100: 1950000, low_pts100: 1950000,
      close_pts100: 1950000, volume: 10,
    }));

    expect(confirmedCount.count).toBe(1); // Exactly once
    expect(builder.getConfirmedEmitCount(BASE_TS_MS)).toBe(1);
  });

  it('TEST-123A3-TBB011: trade for wrong instrument is ignored', () => {
    const events: string[] = [];
    builder.on('bar:developing', () => events.push('developing'));
    builder.processTrade(makeTrade({ raw_symbol: 'ESHU4', instrument_id: 999999 }));
    expect(events.length).toBe(0);
    expect(builder.getDevelopingBar()).toBeNull();
  });

  it('TEST-123A3-TBB012: trade in next minute auto-closes the previous developing bar', () => {
    const events: string[] = [];
    builder.on('bar:provisional', () => events.push('provisional'));

    // Trade in minute 0
    builder.processTrade(makeTrade({ ts_event_ns: BASE_TS_NS }));

    // Trade in minute 1 — should auto-close minute 0
    const nextMinuteNs = String(BigInt(BASE_TS_MS + 60_000) * 1_000_000n);
    builder.processTrade(makeTrade({ ts_event_ns: nextMinuteNs }));

    expect(events).toContain('provisional'); // Minute 0 was auto-closed
    expect(builder.getDevelopingBar()!.barOpenTsMs).toBe(BASE_TS_MS + 60_000);
  });
});
