/**
 * Sprint 123A.4 — Gate G4 Frontend Logic Tests
 *
 * Tests the chart state reducer (pure function, no DOM required).
 *
 *   TEST-123A4-FE-001  SEED action populates bars map and sets seeded=true
 *   TEST-123A4-FE-002  SEED action sets lastConfirmedTsMs to latest bar
 *   TEST-123A4-FE-003  CONFIRMED action adds new bar to map
 *   TEST-123A4-FE-004  CONFIRMED action updates bar with higher revision (FE-005/FE-006)
 *   TEST-123A4-FE-005  CONFIRMED action rejects bar with same revision (FE-009 duplicate suppression)
 *   TEST-123A4-FE-006  CONFIRMED action rejects bar with lower revision (FE-009 duplicate suppression)
 *   TEST-123A4-FE-007  CONFIRMED action clears developing bar for same timestamp
 *   TEST-123A4-FE-008  CONFIRMED action preserves developing bar for different timestamp
 *   TEST-123A4-FE-009  CONFIRMED action triggers contract-roll clear on rawSymbol change (FE-010)
 *   TEST-123A4-FE-010  DEVELOPING action adds developing bar when newer than lastConfirmedTsMs (FE-004)
 *   TEST-123A4-FE-011  DEVELOPING action is suppressed when barOpenTsMs <= lastConfirmedTsMs (FE-004)
 *   TEST-123A4-FE-012  RESET action clears all state
 *   TEST-123A4-FE-013  pts100ToPoints converts correctly and snaps to 0.25 tick (FE-014)
 *   TEST-123A4-FE-014  CONFIRMED action sets currentSymbol on first bar (no prior symbol)
 */

import { describe, it, expect } from 'vitest';
import {
  chartReducer,
  initialChartState,
  pts100ToPoints,
  type BarRecord,
  type DevelopingBar,
  type ChartState,
} from '../chart-state-reducer.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeBar(overrides: Partial<BarRecord> = {}): BarRecord {
  return {
    barOpenTsMs: 1_700_000_000_000,
    openPts100:  2_100_000,
    highPts100:  2_105_000,
    lowPts100:   2_098_000,
    closePts100: 2_103_000,
    volume:      1500,
    revision:    1,
    rawSymbol:   'MNQM5',
    intervalMs:  60_000,
    ...overrides,
  };
}

function makeDevBar(overrides: Partial<DevelopingBar> = {}): DevelopingBar {
  return {
    barOpenTsMs: 1_700_000_060_000,
    openPts100:  2_103_000,
    highPts100:  2_107_000,
    lowPts100:   2_102_000,
    closePts100: 2_106_000,
    volume:      300,
    ...overrides,
  };
}

function stateWithBar(bar: BarRecord): ChartState {
  return chartReducer(initialChartState, { type: 'SEED', bars: [bar] });
}

// ─── TEST-123A4-FE-001: SEED populates bars and sets seeded ──────────────────

describe('Sprint 123A.4 — Frontend: chart state reducer', () => {

  it('TEST-123A4-FE-001: SEED action populates bars map and sets seeded=true', () => {
    const bar1 = makeBar({ barOpenTsMs: 1_700_000_000_000 });
    const bar2 = makeBar({ barOpenTsMs: 1_700_000_060_000 });
    const state = chartReducer(initialChartState, { type: 'SEED', bars: [bar1, bar2] });

    expect(state.seeded).toBe(true);
    expect(state.bars.size).toBe(2);
    expect(state.bars.get(1_700_000_000_000)).toEqual(bar1);
    expect(state.bars.get(1_700_000_060_000)).toEqual(bar2);
  });

  it('TEST-123A4-FE-002: SEED action sets lastConfirmedTsMs to latest bar', () => {
    const bar1 = makeBar({ barOpenTsMs: 1_700_000_000_000 });
    const bar2 = makeBar({ barOpenTsMs: 1_700_000_120_000 });
    const bar3 = makeBar({ barOpenTsMs: 1_700_000_060_000 });
    const state = chartReducer(initialChartState, { type: 'SEED', bars: [bar1, bar2, bar3] });

    expect(state.lastConfirmedTsMs).toBe(1_700_000_120_000);
  });

  it('TEST-123A4-FE-003: CONFIRMED action adds new bar to map', () => {
    const seed = makeBar({ barOpenTsMs: 1_700_000_000_000 });
    const s1   = stateWithBar(seed);
    const newBar = makeBar({ barOpenTsMs: 1_700_000_060_000 });
    const s2 = chartReducer(s1, { type: 'CONFIRMED', bar: newBar, seq: 1 });

    expect(s2.bars.size).toBe(2);
    expect(s2.bars.get(1_700_000_060_000)).toEqual(newBar);
    expect(s2.lastConfirmedTsMs).toBe(1_700_000_060_000);
  });

  it('TEST-123A4-FE-004: CONFIRMED action updates bar with higher revision (FE-005/FE-006)', () => {
    const original = makeBar({ barOpenTsMs: 1_700_000_000_000, revision: 1, closePts100: 2_103_000 });
    const s1 = stateWithBar(original);
    const corrected = makeBar({ barOpenTsMs: 1_700_000_000_000, revision: 2, closePts100: 2_104_000 });
    const s2 = chartReducer(s1, { type: 'CONFIRMED', bar: corrected, seq: 2 });

    expect(s2.bars.size).toBe(1);
    expect(s2.bars.get(1_700_000_000_000)?.revision).toBe(2);
    expect(s2.bars.get(1_700_000_000_000)?.closePts100).toBe(2_104_000);
  });

  it('TEST-123A4-FE-005: CONFIRMED action rejects bar with same revision (FE-009 duplicate suppression)', () => {
    const bar = makeBar({ barOpenTsMs: 1_700_000_000_000, revision: 1, closePts100: 2_103_000 });
    const s1  = stateWithBar(bar);
    const dup = makeBar({ barOpenTsMs: 1_700_000_000_000, revision: 1, closePts100: 2_999_000 });
    const s2  = chartReducer(s1, { type: 'CONFIRMED', bar: dup, seq: 2 });

    // State must be unchanged — same object reference
    expect(s2).toBe(s1);
    expect(s2.bars.get(1_700_000_000_000)?.closePts100).toBe(2_103_000);
  });

  it('TEST-123A4-FE-006: CONFIRMED action rejects bar with lower revision (FE-009 duplicate suppression)', () => {
    const bar = makeBar({ barOpenTsMs: 1_700_000_000_000, revision: 3, closePts100: 2_103_000 });
    const s1  = stateWithBar(bar);
    const old = makeBar({ barOpenTsMs: 1_700_000_000_000, revision: 2, closePts100: 2_999_000 });
    const s2  = chartReducer(s1, { type: 'CONFIRMED', bar: old, seq: 2 });

    expect(s2).toBe(s1);
  });

  it('TEST-123A4-FE-007: CONFIRMED action clears developing bar for same timestamp', () => {
    const seed = makeBar({ barOpenTsMs: 1_700_000_000_000 });
    const dev  = makeDevBar({ barOpenTsMs: 1_700_000_060_000 });
    let s = stateWithBar(seed);
    s = chartReducer(s, { type: 'DEVELOPING', bar: dev, seq: 1 });
    expect(s.developing).not.toBeNull();

    // Confirmed bar arrives for the same timestamp as the developing bar
    const confirmed = makeBar({ barOpenTsMs: 1_700_000_060_000, revision: 1 });
    const s2 = chartReducer(s, { type: 'CONFIRMED', bar: confirmed, seq: 2 });

    expect(s2.developing).toBeNull();
  });

  it('TEST-123A4-FE-008: CONFIRMED action preserves developing bar for different timestamp', () => {
    const seed = makeBar({ barOpenTsMs: 1_700_000_000_000 });
    const dev  = makeDevBar({ barOpenTsMs: 1_700_000_120_000 }); // different ts
    let s = stateWithBar(seed);
    s = chartReducer(s, { type: 'DEVELOPING', bar: dev, seq: 1 });

    // Confirmed bar for a different timestamp
    const confirmed = makeBar({ barOpenTsMs: 1_700_000_060_000, revision: 1 });
    const s2 = chartReducer(s, { type: 'CONFIRMED', bar: confirmed, seq: 2 });

    expect(s2.developing).toEqual(dev);
  });

  it('TEST-123A4-FE-009: CONFIRMED action triggers contract-roll clear on rawSymbol change (FE-010)', () => {
    const bar1 = makeBar({ barOpenTsMs: 1_700_000_000_000, rawSymbol: 'MNQM5' });
    const bar2 = makeBar({ barOpenTsMs: 1_700_000_060_000, rawSymbol: 'MNQM5' });
    let s = chartReducer(initialChartState, { type: 'SEED', bars: [bar1, bar2] });
    expect(s.bars.size).toBe(2);

    // New bar with different rawSymbol (contract roll)
    const rollBar = makeBar({ barOpenTsMs: 1_700_000_120_000, rawSymbol: 'MNQU5', revision: 1 });
    const s2 = chartReducer(s, { type: 'CONFIRMED', bar: rollBar, seq: 3 });

    // Chart must be cleared and only the new bar retained
    expect(s2.bars.size).toBe(1);
    expect(s2.bars.get(1_700_000_120_000)?.rawSymbol).toBe('MNQU5');
    expect(s2.currentSymbol).toBe('MNQU5');
    expect(s2.developing).toBeNull();
  });

  it('TEST-123A4-FE-010: DEVELOPING action adds developing bar when newer than lastConfirmedTsMs (FE-004)', () => {
    const seed = makeBar({ barOpenTsMs: 1_700_000_000_000 });
    const s1   = stateWithBar(seed);
    const dev  = makeDevBar({ barOpenTsMs: 1_700_000_060_000 }); // newer
    const s2   = chartReducer(s1, { type: 'DEVELOPING', bar: dev, seq: 1 });

    expect(s2.developing).toEqual(dev);
    expect(s2.lastSeq).toBe(1);
  });

  it('TEST-123A4-FE-011: DEVELOPING action is suppressed when barOpenTsMs <= lastConfirmedTsMs (FE-004)', () => {
    const seed = makeBar({ barOpenTsMs: 1_700_000_060_000 });
    const s1   = stateWithBar(seed);
    // Developing bar for the same timestamp as the confirmed bar — must be suppressed
    const dev  = makeDevBar({ barOpenTsMs: 1_700_000_060_000 });
    const s2   = chartReducer(s1, { type: 'DEVELOPING', bar: dev, seq: 1 });

    expect(s2).toBe(s1); // state unchanged
    expect(s2.developing).toBeNull();
  });

  it('TEST-123A4-FE-012: RESET action clears all state', () => {
    const bar = makeBar();
    let s = stateWithBar(bar);
    s = chartReducer(s, { type: 'DEVELOPING', bar: makeDevBar(), seq: 1 });
    expect(s.seeded).toBe(true);
    expect(s.bars.size).toBe(1);

    const reset = chartReducer(s, { type: 'RESET' });
    expect(reset.seeded).toBe(false);
    expect(reset.bars.size).toBe(0);
    expect(reset.developing).toBeNull();
    expect(reset.currentSymbol).toBeNull();
    expect(reset.lastConfirmedTsMs).toBe(0);
    expect(reset.lastSeq).toBe(0);
  });

  it('TEST-123A4-FE-013: pts100ToPoints converts correctly and snaps to 0.25 tick (FE-014)', () => {
    // Exact values
    expect(pts100ToPoints(2_100_000)).toBe(21000.00);  // 21000 exactly
    expect(pts100ToPoints(2_100_025)).toBe(21000.25);  // 21000.25 exactly
    expect(pts100ToPoints(2_100_050)).toBe(21000.50);  // 21000.50 exactly
    expect(pts100ToPoints(2_100_075)).toBe(21000.75);  // 21000.75 exactly

    // Snapping — 21000.12 → nearest 0.25 = 21000.00
    expect(pts100ToPoints(2_100_012)).toBe(21000.00);
    // 21000.13 → nearest 0.25 = 21000.25
    expect(pts100ToPoints(2_100_013)).toBe(21000.25);
  });

  it('TEST-123A4-FE-014: CONFIRMED action sets currentSymbol on first bar (no prior symbol)', () => {
    const bar = makeBar({ rawSymbol: 'MNQM5' });
    expect(initialChartState.currentSymbol).toBeNull();
    const s = chartReducer(initialChartState, { type: 'CONFIRMED', bar, seq: 1 });
    expect(s.currentSymbol).toBe('MNQM5');
  });

});
