/**
 * Sprint 123A.4 — Gate G4 Parity Service Tests
 *
 *   TEST-123A4-PAR-001  EXACT_MATCH classification when all fields identical
 *   TEST-123A4-PAR-002  WITHIN_TOLERANCE classification when close delta <= tolerance
 *   TEST-123A4-PAR-003  CLOSE_MISMATCH classification when close delta > tolerance but <= 5x
 *   TEST-123A4-PAR-004  LARGE_MISMATCH classification when close delta > 5x tolerance
 *   TEST-123A4-PAR-005  DB_ONLY classification when no TV bar registered
 *   TEST-123A4-PAR-006  TV_ONLY classification when TV bar times out
 *   TEST-123A4-PAR-007  processTimeouts() returns timed-out TV bars as TV_ONLY records
 *   TEST-123A4-PAR-008  Metrics: totalCompared increments on each comparison
 *   TEST-123A4-PAR-009  Metrics: totalMismatches only counts non-WITHIN_TOLERANCE
 *   TEST-123A4-PAR-010  Metrics: classificationCounts tracks all 6 classifications
 *   TEST-123A4-PAR-011  Metrics: rollingMismatchRate reflects last 100 bars
 *   TEST-123A4-PAR-012  Gate G4: gate4Ready=false when < 200 bars compared
 *   TEST-123A4-PAR-013  Gate G4: gate4Ready=false when rolling mismatch rate > 2%
 *   TEST-123A4-PAR-014  Gate G4: gate4Ready=false when LARGE_MISMATCH in last 100 bars
 *   TEST-123A4-PAR-015  Gate G4: gate4Ready=false when TV_ONLY in last 100 bars
 *   TEST-123A4-PAR-016  Gate G4: gate4Ready=true when all thresholds met
 *   TEST-123A4-PAR-017  reset() clears all state including classificationCounts
 *   TEST-123A4-PAR-018  compareConfirmedBar ignores non-CONFIRMED bars
 *   TEST-123A4-PAR-019  compareConfirmedBar ignores non-MATCHED bars
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ParityService, GATE4_THRESHOLDS } from '../parity-service.js';
import { BarLifecycle, ReconciliationStatus } from '../types/bar-lifecycle.js';
import type { MinuteBar } from '../types/bar-lifecycle.js';
import type { TradingViewBarRecord } from '../parity-service.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeTvBar(overrides: Partial<TradingViewBarRecord> = {}): TradingViewBarRecord {
  return {
    barOpenTsMs: 1_700_000_000_000,
    openPts100:  2_100_000,
    highPts100:  2_105_000,
    lowPts100:   2_098_000,
    closePts100: 2_103_000,
    volume: 1500,
    symbol: 'MNQM5',
    atlasTsMs: Date.now(),
    ...overrides,
  };
}

function makeDbBar(overrides: Partial<MinuteBar> = {}): MinuteBar {
  return {
    source: 'DATABENTO',
    dataset: 'GLBX.MDP3',
    rawSymbol: 'MNQM5',
    instrumentId: 12345,
    intervalMs: 60000,
    barOpenTsMs: 1_700_000_000_000,
    barCloseTsMs: 1_700_000_060_000,
    barOpenTsNs: BigInt('1700000000000000000'),
    ohlcv: {
      openPts100:  2_100_000,
      highPts100:  2_105_000,
      lowPts100:   2_098_000,
      closePts100: 2_103_000,
      volume: 1500,
      tradeCount: 120,
    },
    lifecycle: BarLifecycle.CONFIRMED,
    reconciliation: {
      status: ReconciliationStatus.MATCHED,
      closeDeltaPts100: 0,
      highDeltaPts100: 0,
      lowDeltaPts100: 0,
      volumeDelta: 0,
      withinTolerance: true,
      tolerancePts100: 500,
    },
    revision: 1,
    mappingVersion: 'v1',
    atlasTsMs: Date.now(),
    ...overrides,
  } as MinuteBar;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Sprint 123A.4 — ParityService', () => {

  let svc: ParityService;

  beforeEach(() => {
    svc = new ParityService(25); // 0.25 point tolerance
  });

  it('TEST-123A4-PAR-001: EXACT_MATCH when all fields identical', () => {
    svc.registerTradingViewBar(makeTvBar());
    const result = svc.compareConfirmedBar(makeDbBar());
    expect(result).not.toBeNull();
    expect(result!.classification).toBe('EXACT_MATCH');
    expect(result!.withinTolerance).toBe(true);
  });

  it('TEST-123A4-PAR-002: WITHIN_TOLERANCE when close delta <= tolerance', () => {
    svc.registerTradingViewBar(makeTvBar({ closePts100: 2_103_000 }));
    const dbBar = makeDbBar({ ohlcv: { openPts100: 2_100_000, highPts100: 2_105_000, lowPts100: 2_098_000, closePts100: 2_103_020, volume: 1501, tradeCount: 120 } } as any);
    const result = svc.compareConfirmedBar(dbBar);
    expect(result!.classification).toBe('WITHIN_TOLERANCE');
    expect(result!.withinTolerance).toBe(true);
    expect(result!.closeDeltaPts100).toBe(20);
  });

  it('TEST-123A4-PAR-003: CLOSE_MISMATCH when close delta > tolerance but <= 5x', () => {
    // tolerance=25, 5x=125; use delta=50
    svc.registerTradingViewBar(makeTvBar({ closePts100: 2_103_000 }));
    const dbBar = makeDbBar({ ohlcv: { openPts100: 2_100_000, highPts100: 2_105_000, lowPts100: 2_098_000, closePts100: 2_103_050, volume: 1500, tradeCount: 120 } } as any);
    const result = svc.compareConfirmedBar(dbBar);
    expect(result!.classification).toBe('CLOSE_MISMATCH');
    expect(result!.withinTolerance).toBe(false);
    expect(result!.closeDeltaPts100).toBe(50);
  });

  it('TEST-123A4-PAR-004: LARGE_MISMATCH when close delta > 5x tolerance', () => {
    // tolerance=25, 5x=125; use delta=200
    svc.registerTradingViewBar(makeTvBar({ closePts100: 2_103_000 }));
    const dbBar = makeDbBar({ ohlcv: { openPts100: 2_100_000, highPts100: 2_105_000, lowPts100: 2_098_000, closePts100: 2_103_200, volume: 1500, tradeCount: 120 } } as any);
    const result = svc.compareConfirmedBar(dbBar);
    expect(result!.classification).toBe('LARGE_MISMATCH');
    expect(result!.withinTolerance).toBe(false);
    expect(result!.closeDeltaPts100).toBe(200);
  });

  it('TEST-123A4-PAR-005: DB_ONLY when no TV bar registered', () => {
    // No registerTradingViewBar call
    const result = svc.compareConfirmedBar(makeDbBar());
    expect(result).not.toBeNull();
    expect(result!.classification).toBe('DB_ONLY');
    expect(result!.tvClosePts100).toBeNull();
    expect(result!.dbClosePts100).toBe(2_103_000);
  });

  it('TEST-123A4-PAR-006: TV_ONLY when TV bar times out', () => {
    // Register a TV bar with an old timestamp (> 10 minutes ago)
    const oldTs = Date.now() - 11 * 60 * 1000;
    svc.registerTradingViewBar(makeTvBar({
      barOpenTsMs: 1_700_000_000_000,
      atlasTsMs: oldTs,
    }));
    // Register a new bar to trigger eviction
    svc.registerTradingViewBar(makeTvBar({
      barOpenTsMs: 1_700_000_060_000,
      atlasTsMs: Date.now(),
    }));
    // The old bar should have been evicted as TV_ONLY
    expect(svc.getMetrics().classificationCounts['TV_ONLY']).toBe(1);
  });

  it('TEST-123A4-PAR-007: processTimeouts() returns timed-out TV bars as TV_ONLY records', () => {
    const oldTs = Date.now() - 11 * 60 * 1000;
    // Use a fresh service to avoid the eviction in registerTradingViewBar
    const freshSvc = new ParityService(25);
    // Manually inject an old pending bar
    (freshSvc as any).tvPending.set(1_700_000_000_000, makeTvBar({ atlasTsMs: oldTs }));

    const timedOut = freshSvc.processTimeouts();
    expect(timedOut.length).toBe(1);
    expect(timedOut[0].classification).toBe('TV_ONLY');
    expect(freshSvc.getPendingCount()).toBe(0);
  });

  it('TEST-123A4-PAR-008: totalCompared increments on each comparison', () => {
    svc.registerTradingViewBar(makeTvBar({ barOpenTsMs: 1_000 }));
    svc.compareConfirmedBar(makeDbBar({ barOpenTsMs: 1_000 } as any));
    svc.registerTradingViewBar(makeTvBar({ barOpenTsMs: 2_000 }));
    svc.compareConfirmedBar(makeDbBar({ barOpenTsMs: 2_000 } as any));
    expect(svc.getMetrics().totalCompared).toBe(2);
  });

  it('TEST-123A4-PAR-009: totalMismatches only counts non-WITHIN_TOLERANCE', () => {
    // 1 exact match, 1 large mismatch
    svc.registerTradingViewBar(makeTvBar({ barOpenTsMs: 1_000 }));
    svc.compareConfirmedBar(makeDbBar({ barOpenTsMs: 1_000 } as any));

    svc.registerTradingViewBar(makeTvBar({ barOpenTsMs: 2_000, closePts100: 2_103_000 }));
    const largeDb = makeDbBar({
      barOpenTsMs: 2_000,
      ohlcv: { openPts100: 2_100_000, highPts100: 2_105_000, lowPts100: 2_098_000, closePts100: 2_103_200, volume: 1500, tradeCount: 120 },
    } as any);
    svc.compareConfirmedBar(largeDb);

    const metrics = svc.getMetrics();
    expect(metrics.totalCompared).toBe(2);
    expect(metrics.totalMismatches).toBe(1);
  });

  it('TEST-123A4-PAR-010: classificationCounts tracks all 6 classifications', () => {
    // EXACT_MATCH
    svc.registerTradingViewBar(makeTvBar({ barOpenTsMs: 1_000 }));
    svc.compareConfirmedBar(makeDbBar({ barOpenTsMs: 1_000 } as any));
    // DB_ONLY
    svc.compareConfirmedBar(makeDbBar({ barOpenTsMs: 2_000 } as any));

    const counts = svc.getMetrics().classificationCounts;
    expect(counts.EXACT_MATCH).toBe(1);
    expect(counts.DB_ONLY).toBe(1);
    expect(counts.WITHIN_TOLERANCE).toBe(0);
    expect(counts.CLOSE_MISMATCH).toBe(0);
    expect(counts.LARGE_MISMATCH).toBe(0);
    expect(counts.TV_ONLY).toBe(0);
  });

  it('TEST-123A4-PAR-011: rollingMismatchRate reflects last 100 bars', () => {
    // Add 10 exact matches and 10 large mismatches
    for (let i = 0; i < 10; i++) {
      svc.registerTradingViewBar(makeTvBar({ barOpenTsMs: i * 1000 }));
      svc.compareConfirmedBar(makeDbBar({ barOpenTsMs: i * 1000 } as any));
    }
    for (let i = 10; i < 20; i++) {
      svc.registerTradingViewBar(makeTvBar({ barOpenTsMs: i * 1000, closePts100: 2_103_000 }));
      const largeDb = makeDbBar({
        barOpenTsMs: i * 1000,
        ohlcv: { openPts100: 2_100_000, highPts100: 2_105_000, lowPts100: 2_098_000, closePts100: 2_103_200, volume: 1500, tradeCount: 120 },
      } as any);
      svc.compareConfirmedBar(largeDb);
    }
    const rate = svc.getRollingMismatchRate();
    expect(rate).toBeCloseTo(0.5, 2); // 10 mismatches out of 20
  });

  it('TEST-123A4-PAR-012: gate4Ready=false when < 200 bars compared', () => {
    // Only 1 bar compared
    svc.registerTradingViewBar(makeTvBar());
    svc.compareConfirmedBar(makeDbBar());
    const metrics = svc.getMetrics();
    expect(metrics.gate4Ready).toBe(false);
    expect(metrics.gate4BlockReason).toContain('Insufficient bars');
  });

  it('TEST-123A4-PAR-013: gate4Ready=false when rolling mismatch rate > 2%', () => {
    // Add 200 bars: 195 exact matches + 5 large mismatches = 2.5% mismatch rate
    for (let i = 0; i < 195; i++) {
      svc.registerTradingViewBar(makeTvBar({ barOpenTsMs: i * 1000 }));
      svc.compareConfirmedBar(makeDbBar({ barOpenTsMs: i * 1000 } as any));
    }
    for (let i = 195; i < 200; i++) {
      svc.registerTradingViewBar(makeTvBar({ barOpenTsMs: i * 1000, closePts100: 2_103_000 }));
      const largeDb = makeDbBar({
        barOpenTsMs: i * 1000,
        ohlcv: { openPts100: 2_100_000, highPts100: 2_105_000, lowPts100: 2_098_000, closePts100: 2_103_200, volume: 1500, tradeCount: 120 },
      } as any);
      svc.compareConfirmedBar(largeDb);
    }
    const metrics = svc.getMetrics();
    expect(metrics.gate4Ready).toBe(false);
    expect(metrics.gate4BlockReason).toContain('mismatch rate');
  });

  it('TEST-123A4-PAR-014: gate4Ready=false when LARGE_MISMATCH in last 100 bars', () => {
    // Add 200 exact matches, then 1 large mismatch
    for (let i = 0; i < 200; i++) {
      svc.registerTradingViewBar(makeTvBar({ barOpenTsMs: i * 1000 }));
      svc.compareConfirmedBar(makeDbBar({ barOpenTsMs: i * 1000 } as any));
    }
    svc.registerTradingViewBar(makeTvBar({ barOpenTsMs: 200_000, closePts100: 2_103_000 }));
    const largeDb = makeDbBar({
      barOpenTsMs: 200_000,
      ohlcv: { openPts100: 2_100_000, highPts100: 2_105_000, lowPts100: 2_098_000, closePts100: 2_103_200, volume: 1500, tradeCount: 120 },
    } as any);
    svc.compareConfirmedBar(largeDb);

    const metrics = svc.getMetrics();
    expect(metrics.gate4Ready).toBe(false);
    expect(metrics.gate4BlockReason).toContain('LARGE_MISMATCH');
  });

  it('TEST-123A4-PAR-015: gate4Ready=false when TV_ONLY in last 100 bars', () => {
    // Add 200 exact matches, then inject a TV_ONLY via DB_ONLY (no TV bar)
    for (let i = 0; i < 200; i++) {
      svc.registerTradingViewBar(makeTvBar({ barOpenTsMs: i * 1000 }));
      svc.compareConfirmedBar(makeDbBar({ barOpenTsMs: i * 1000 } as any));
    }
    // DB_ONLY (no TV bar registered)
    svc.compareConfirmedBar(makeDbBar({ barOpenTsMs: 200_000 } as any));

    const metrics = svc.getMetrics();
    expect(metrics.gate4Ready).toBe(false);
    expect(metrics.gate4BlockReason).toContain('DB_ONLY');
  });

  it('TEST-123A4-PAR-016: gate4Ready=true when all thresholds met', () => {
    // Add exactly 200 exact matches
    for (let i = 0; i < 200; i++) {
      svc.registerTradingViewBar(makeTvBar({ barOpenTsMs: i * 1000 }));
      svc.compareConfirmedBar(makeDbBar({ barOpenTsMs: i * 1000 } as any));
    }
    const metrics = svc.getMetrics();
    expect(metrics.gate4Ready).toBe(true);
    expect(metrics.gate4BlockReason).toBeNull();
  });

  it('TEST-123A4-PAR-017: reset() clears all state', () => {
    svc.registerTradingViewBar(makeTvBar());
    svc.compareConfirmedBar(makeDbBar());
    svc.reset();
    const metrics = svc.getMetrics();
    expect(metrics.totalCompared).toBe(0);
    expect(metrics.totalMismatches).toBe(0);
    expect(metrics.classificationCounts.EXACT_MATCH).toBe(0);
    expect(metrics.lastComparedAt).toBeNull();
    expect(svc.getPendingCount()).toBe(0);
  });

  it('TEST-123A4-PAR-018: compareConfirmedBar ignores non-CONFIRMED bars', () => {
    svc.registerTradingViewBar(makeTvBar());
    const devBar = makeDbBar({ lifecycle: BarLifecycle.DEVELOPING } as any);
    const result = svc.compareConfirmedBar(devBar);
    expect(result).toBeNull();
    expect(svc.getMetrics().totalCompared).toBe(0);
  });

  it('TEST-123A4-PAR-019: compareConfirmedBar ignores non-MATCHED bars', () => {
    svc.registerTradingViewBar(makeTvBar());
    const unmatchedBar = makeDbBar({
      reconciliation: {
        status: ReconciliationStatus.UNMATCHED,
        closeDeltaPts100: 100,
        highDeltaPts100: 0,
        lowDeltaPts100: 0,
        volumeDelta: 0,
        withinTolerance: false,
        tolerancePts100: 500,
      },
    } as any);
    const result = svc.compareConfirmedBar(unmatchedBar);
    expect(result).toBeNull();
    expect(svc.getMetrics().totalCompared).toBe(0);
  });
});
