/**
 * blocked-window.test.ts — BLOCKED_UNRESOLVED Window State Tests
 *
 * Tests the BLOCKED_UNRESOLVED state in WindowAccumulator:
 *   - UNRESOLVED bar transitions window to BLOCKED_UNRESOLVED
 *   - Recovered bar replaces UNRESOLVED slot
 *   - Window emits exactly once when all 5 slots are CONFIRMED
 *   - Duplicate-completion guard prevents double emission
 *
 * TEST-123A3-BLK001..BLK005
 *
 * Sprint 123A.3 — Gate G3 Revision 2
 */

import { describe, it, expect } from 'vitest';
import { FiveMinAggregator, WindowAccumulator, WindowState } from '../five-min-aggregator.js';
import { BarLifecycle, MinuteBar, ReconciliationStatus } from '../types/bar-lifecycle.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

/** 14:00:00.000 UTC on 2024-01-15 — aligns to 5-minute boundary */
const WINDOW_OPEN_TS_MS = 1705323600000;

function makeConfirmedBar(barOpenTsMs: number): MinuteBar {
  return {
    source: 'DATABENTO',
    dataset: 'GLBX.MDP3',
    rawSymbol: 'MNQH4',
    instrumentId: 372107,
    intervalMs: 60000,
    barOpenTsMs,
    barOpenTsNs: String(BigInt(barOpenTsMs) * 1_000_000n),
    barCloseTsMs: barOpenTsMs + 60_000,
    ohlcv: {
      openPts100: 1950000,
      highPts100: 1951000,
      lowPts100: 1949500,
      closePts100: 1950500,
      volume: 100,
      tradeCount: 10,
    },
    lifecycle: BarLifecycle.CONFIRMED,
    reconciliation: {
      status: ReconciliationStatus.MATCHED,
      closeDetlaPts100: 0,
      highDeltaPts100: 0,
      lowDeltaPts100: 0,
      volumeDelta: 0,
      withinTolerance: true,
      tolerancePts100: 25,
      reconTsMs: Date.now(),
    },
    revision: 0,
    mappingVersion: 'v1',
    atlasTsMs: Date.now(),
  };
}

function makeUnresolvedBar(barOpenTsMs: number): MinuteBar {
  return {
    ...makeConfirmedBar(barOpenTsMs),
    lifecycle: BarLifecycle.UNRESOLVED,
    reconciliation: {
      status: ReconciliationStatus.UNAVAILABLE,
      closeDetlaPts100: null,
      highDeltaPts100: null,
      lowDeltaPts100: null,
      volumeDelta: null,
      withinTolerance: false,
      tolerancePts100: 25,
      reconTsMs: Date.now(),
    },
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('BLOCKED_UNRESOLVED Window State (Gate G3 Revision 2)', () => {
  let aggregator: FiveMinAggregator;
  let accumulator: WindowAccumulator;

  beforeEach(() => {
    aggregator = new FiveMinAggregator();
    accumulator = new WindowAccumulator(aggregator);
  });

  it('TEST-123A3-BLK001: UNRESOLVED bar transitions window to BLOCKED_UNRESOLVED (not discarded)', () => {
    // Add 3 confirmed bars
    accumulator.addBar(makeConfirmedBar(WINDOW_OPEN_TS_MS));
    accumulator.addBar(makeConfirmedBar(WINDOW_OPEN_TS_MS + 60_000));
    accumulator.addBar(makeConfirmedBar(WINDOW_OPEN_TS_MS + 120_000));

    // Add an UNRESOLVED bar — window should become BLOCKED, not discarded
    const result = accumulator.addBar(makeUnresolvedBar(WINDOW_OPEN_TS_MS + 180_000));
    expect(result).toBeNull(); // No five-min bar yet
    expect(accumulator.getWindowState(WINDOW_OPEN_TS_MS)).toBe(WindowState.BLOCKED_UNRESOLVED);
    expect(accumulator.getWindowBarCount(WINDOW_OPEN_TS_MS)).toBe(4); // 3 confirmed + 1 unresolved
  });

  it('TEST-123A3-BLK002: recovered bar replaces UNRESOLVED slot and unblocks window', () => {
    // Build a window with 4 confirmed + 1 unresolved
    accumulator.addBar(makeConfirmedBar(WINDOW_OPEN_TS_MS));
    accumulator.addBar(makeConfirmedBar(WINDOW_OPEN_TS_MS + 60_000));
    accumulator.addBar(makeConfirmedBar(WINDOW_OPEN_TS_MS + 120_000));
    accumulator.addBar(makeUnresolvedBar(WINDOW_OPEN_TS_MS + 180_000));
    accumulator.addBar(makeConfirmedBar(WINDOW_OPEN_TS_MS + 240_000));

    expect(accumulator.getWindowState(WINDOW_OPEN_TS_MS)).toBe(WindowState.BLOCKED_UNRESOLVED);

    // Insert recovered bar for the UNRESOLVED slot
    const recoveredBar = makeConfirmedBar(WINDOW_OPEN_TS_MS + 180_000);
    recoveredBar.revision = 1; // Marks it as recovered

    const fiveMinBar = accumulator.insertRecoveredBar(recoveredBar);

    // Window should now be complete and emitted
    expect(fiveMinBar).not.toBeNull();
    expect(fiveMinBar!.barType).toBe('RECOVERED'); // Because revision > 0
    expect(fiveMinBar!.minuteBarCount).toBe(5);
    expect(accumulator.getWindowState(WINDOW_OPEN_TS_MS)).toBeNull(); // Window removed after emit
  });

  it('TEST-123A3-BLK003: window emits exactly once — duplicate insertion is ignored', () => {
    // Build a complete window
    for (let i = 0; i < 5; i++) {
      accumulator.addBar(makeConfirmedBar(WINDOW_OPEN_TS_MS + i * 60_000));
    }

    // Window should have been emitted and removed
    expect(accumulator.getWindowState(WINDOW_OPEN_TS_MS)).toBeNull();

    // Try to add another bar to the same window slot
    const duplicateResult = accumulator.addBar(makeConfirmedBar(WINDOW_OPEN_TS_MS));
    expect(duplicateResult).toBeNull(); // No second emission
  });

  it('TEST-123A3-BLK004: BLOCKED window with all 5 slots filled (4 confirmed + 1 recovered) emits once', () => {
    let emitCount = 0;

    // Add 4 confirmed bars
    for (let i = 0; i < 4; i++) {
      accumulator.addBar(makeConfirmedBar(WINDOW_OPEN_TS_MS + i * 60_000));
    }
    // Add UNRESOLVED for slot 4
    accumulator.addBar(makeUnresolvedBar(WINDOW_OPEN_TS_MS + 4 * 60_000));

    // Insert recovered bar for slot 4
    const recovered = makeConfirmedBar(WINDOW_OPEN_TS_MS + 4 * 60_000);
    recovered.revision = 1;
    const result1 = accumulator.insertRecoveredBar(recovered);
    if (result1) emitCount++;

    // Try inserting again (duplicate)
    const result2 = accumulator.insertRecoveredBar(recovered);
    if (result2) emitCount++;

    expect(emitCount).toBe(1); // Exactly once
  });

  it('TEST-123A3-BLK005: UNRESOLVED bar without prior confirmed bars creates BLOCKED window', () => {
    // UNRESOLVED arrives first (no prior confirmed bars in this window)
    const result = accumulator.addBar(makeUnresolvedBar(WINDOW_OPEN_TS_MS + 120_000));
    expect(result).toBeNull();
    expect(accumulator.getWindowState(WINDOW_OPEN_TS_MS)).toBe(WindowState.BLOCKED_UNRESOLVED);
    expect(accumulator.getWindowBarCount(WINDOW_OPEN_TS_MS)).toBe(1);

    // Now add the remaining 4 confirmed bars
    accumulator.addBar(makeConfirmedBar(WINDOW_OPEN_TS_MS));
    accumulator.addBar(makeConfirmedBar(WINDOW_OPEN_TS_MS + 60_000));
    accumulator.addBar(makeConfirmedBar(WINDOW_OPEN_TS_MS + 180_000));
    accumulator.addBar(makeConfirmedBar(WINDOW_OPEN_TS_MS + 240_000));

    // Still blocked because slot 2 is UNRESOLVED
    expect(accumulator.getWindowState(WINDOW_OPEN_TS_MS)).toBe(WindowState.BLOCKED_UNRESOLVED);

    // Insert recovered bar for slot 2
    const recovered = makeConfirmedBar(WINDOW_OPEN_TS_MS + 120_000);
    recovered.revision = 1;
    const fiveMinBar = accumulator.insertRecoveredBar(recovered);

    expect(fiveMinBar).not.toBeNull();
    expect(fiveMinBar!.minuteBarCount).toBe(5);
  });
});

// Need to import beforeEach
import { beforeEach } from 'vitest';
