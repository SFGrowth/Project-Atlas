/**
 * five-min-aggregator.ts — Five-Minute Bar Aggregation Engine
 *
 * Aggregates exactly 5 confirmed one-minute bars into a five-minute bar.
 *
 * INVARIANTS (enforced at runtime, not just by type):
 *   1. A five-minute window must contain exactly 5 one-minute bars.
 *   2. All 5 bars must have lifecycle === CONFIRMED.
 *   3. No bar in the window may have lifecycle === UNRESOLVED.
 *   4. Bars must be contiguous (each bar's open = previous bar's open + 60,000ms).
 *   5. The window must align to a five-minute boundary (barOpenTsMs % 300,000 === 0).
 *   6. A five-minute bar is emitted exactly once per window.
 *
 * BLOCKED_UNRESOLVED State (Gate G3 Revision 2):
 *   When an UNRESOLVED bar arrives for a window, the window transitions to
 *   BLOCKED_UNRESOLVED rather than being discarded. This allows recovered bars
 *   to be inserted later. When all 5 slots are filled with CONFIRMED bars,
 *   the window is unblocked and the five-minute bar is emitted exactly once.
 *
 * AUTHORITY NOTE: This module is parity-data preparation only.
 * TradingView remains the production processBar and postBarAutomation trigger.
 * MARKET_DATA_AUTHORITY = TRADINGVIEW_ONLY throughout Sprint 123A.3.
 *
 * Sprint 123A.3 — Gate G3 Revision 2
 */

import {
  MinuteBar,
  FiveMinBar,
  FiveMinBarType,
  OhlcvPts100,
  BarLifecycle,
  FIVE_MIN_WINDOW_SIZE,
} from './types/bar-lifecycle.js';

// ─── Aggregation Result ───────────────────────────────────────────────────────

export type AggregationResult =
  | { ok: true; bar: FiveMinBar }
  | { ok: false; reason: AggregationRejectionReason; detail: string };

export enum AggregationRejectionReason {
  /** Window does not contain exactly 5 bars. */
  WRONG_BAR_COUNT = 'WRONG_BAR_COUNT',
  /** One or more bars are UNRESOLVED. Blocks aggregation. */
  CONTAINS_UNRESOLVED = 'CONTAINS_UNRESOLVED',
  /** One or more bars are not CONFIRMED (e.g., PROVISIONAL, PENDING). */
  NOT_ALL_CONFIRMED = 'NOT_ALL_CONFIRMED',
  /** Bars are not contiguous (gap detected within the window). */
  NON_CONTIGUOUS = 'NON_CONTIGUOUS',
  /** Window does not align to a five-minute boundary. */
  MISALIGNED_WINDOW = 'MISALIGNED_WINDOW',
  /** Bars are from different instruments or datasets. */
  MIXED_INSTRUMENTS = 'MIXED_INSTRUMENTS',
}

// ─── Window State ─────────────────────────────────────────────────────────────

/**
 * The state of a five-minute window in the WindowAccumulator.
 *
 * ACCUMULATING:     Normal state — collecting confirmed bars.
 * BLOCKED_UNRESOLVED: One or more bars are UNRESOLVED; window is held open
 *                     pending recovery. Bars can still be inserted.
 * EMITTED:          The five-minute bar has been emitted. No further emissions.
 */
export enum WindowState {
  ACCUMULATING = 'ACCUMULATING',
  BLOCKED_UNRESOLVED = 'BLOCKED_UNRESOLVED',
  EMITTED = 'EMITTED',
}

/**
 * An in-progress five-minute window.
 */
export interface WindowEntry {
  /** Bars keyed by barOpenTsMs. Allows replacement when a recovered bar arrives. */
  bars: Map<number, MinuteBar>;
  state: WindowState;
}

// ─── Five-Minute Aggregator ───────────────────────────────────────────────────

export class FiveMinAggregator {
  /**
   * Attempt to aggregate a window of one-minute bars into a five-minute bar.
   *
   * The bars array must be sorted in ascending chronological order.
   * Returns `{ ok: true, bar }` on success, or `{ ok: false, reason, detail }` on rejection.
   *
   * This method is pure and stateless — it does not maintain any internal
   * window state. The caller (WindowAccumulator) is responsible for
   * accumulating confirmed bars and calling this method when a window is complete.
   */
  aggregate(bars: MinuteBar[]): AggregationResult {
    // Invariant 1: exactly 5 bars
    if (bars.length !== FIVE_MIN_WINDOW_SIZE) {
      return {
        ok: false,
        reason: AggregationRejectionReason.WRONG_BAR_COUNT,
        detail: `Expected ${FIVE_MIN_WINDOW_SIZE} bars, got ${bars.length}`,
      };
    }

    // Invariant 3: no UNRESOLVED bars (checked first — this is the primary gate)
    const unresolvedBars = bars.filter((b) => b.lifecycle === BarLifecycle.UNRESOLVED);
    if (unresolvedBars.length > 0) {
      return {
        ok: false,
        reason: AggregationRejectionReason.CONTAINS_UNRESOLVED,
        detail: `Window contains ${unresolvedBars.length} UNRESOLVED bar(s) at: ${unresolvedBars.map((b) => b.barOpenTsMs).join(', ')}`,
      };
    }

    // Invariant 2: all bars must be CONFIRMED
    const nonConfirmed = bars.filter((b) => b.lifecycle !== BarLifecycle.CONFIRMED);
    if (nonConfirmed.length > 0) {
      return {
        ok: false,
        reason: AggregationRejectionReason.NOT_ALL_CONFIRMED,
        detail: `Window contains ${nonConfirmed.length} non-CONFIRMED bar(s): ${nonConfirmed.map((b) => `${b.barOpenTsMs}:${b.lifecycle}`).join(', ')}`,
      };
    }

    // Invariant 6: all bars from the same instrument and dataset
    const firstBar = bars[0];
    const mixedInstrument = bars.some(
      (b) =>
        b.instrumentId !== firstBar.instrumentId ||
        b.dataset !== firstBar.dataset ||
        b.rawSymbol !== firstBar.rawSymbol,
    );
    if (mixedInstrument) {
      return {
        ok: false,
        reason: AggregationRejectionReason.MIXED_INSTRUMENTS,
        detail: 'Window contains bars from different instruments or datasets',
      };
    }

    // Sort bars by open timestamp (defensive — caller should already sort)
    const sorted = [...bars].sort((a, b) => a.barOpenTsMs - b.barOpenTsMs);

    // Invariant 5: window must align to a five-minute boundary
    const windowOpenTsMs = sorted[0].barOpenTsMs;
    if (windowOpenTsMs % 300_000 !== 0) {
      return {
        ok: false,
        reason: AggregationRejectionReason.MISALIGNED_WINDOW,
        detail: `Window open time ${windowOpenTsMs} does not align to a 5-minute boundary (${windowOpenTsMs} % 300000 = ${windowOpenTsMs % 300_000})`,
      };
    }

    // Invariant 4: bars must be contiguous
    for (let i = 1; i < sorted.length; i++) {
      const expectedOpen = sorted[i - 1].barOpenTsMs + 60_000;
      if (sorted[i].barOpenTsMs !== expectedOpen) {
        return {
          ok: false,
          reason: AggregationRejectionReason.NON_CONTIGUOUS,
          detail: `Gap between bar ${i - 1} (${sorted[i - 1].barOpenTsMs}) and bar ${i} (${sorted[i].barOpenTsMs}): expected ${expectedOpen}`,
        };
      }
    }

    // All invariants satisfied — aggregate
    const aggregatedOhlcv = this._aggregateOhlcv(sorted);
    const barType = this._determineBarType(sorted);
    const windowCloseTsMs = sorted[sorted.length - 1].barCloseTsMs;
    const mappingVersion = sorted[0].mappingVersion;

    const fiveMinBar: FiveMinBar = {
      source: 'DATABENTO',
      dataset: firstBar.dataset,
      rawSymbol: firstBar.rawSymbol,
      instrumentId: firstBar.instrumentId,
      barOpenTsMs: windowOpenTsMs,
      barCloseTsMs: windowCloseTsMs,
      ohlcv: aggregatedOhlcv,
      minuteBarCount: 5,
      barType,
      constituentBars: sorted,
      revision: 0,
      mappingVersion,
      atlasTsMs: Date.now(),
    };

    return { ok: true, bar: fiveMinBar };
  }

  /**
   * Check whether a set of confirmed bars forms a complete five-minute window.
   */
  isWindowComplete(bars: MinuteBar[]): boolean {
    if (bars.length !== FIVE_MIN_WINDOW_SIZE) return false;
    if (bars.some((b) => b.lifecycle !== BarLifecycle.CONFIRMED)) return false;
    const sorted = [...bars].sort((a, b) => a.barOpenTsMs - b.barOpenTsMs);
    if (sorted[0].barOpenTsMs % 300_000 !== 0) return false;
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].barOpenTsMs !== sorted[i - 1].barOpenTsMs + 60_000) return false;
    }
    return true;
  }

  /**
   * Return the five-minute window boundary (open timestamp) for a given
   * one-minute bar open timestamp.
   */
  getWindowOpenTsMs(barOpenTsMs: number): number {
    return barOpenTsMs - (barOpenTsMs % 300_000);
  }

  // ─── Private helpers ─────────────────────────────────────────────────────────

  private _aggregateOhlcv(sortedBars: MinuteBar[]): OhlcvPts100 {
    const openPts100 = sortedBars[0].ohlcv.openPts100;
    const closePts100 = sortedBars[sortedBars.length - 1].ohlcv.closePts100;
    const highPts100 = Math.max(...sortedBars.map((b) => b.ohlcv.highPts100));
    const lowPts100 = Math.min(...sortedBars.map((b) => b.ohlcv.lowPts100));
    const volume = sortedBars.reduce((sum, b) => sum + b.ohlcv.volume, 0);
    const tradeCount = sortedBars.reduce((sum, b) => sum + b.ohlcv.tradeCount, 0);

    return { openPts100, highPts100, lowPts100, closePts100, volume, tradeCount };
  }

  private _determineBarType(sortedBars: MinuteBar[]): FiveMinBarType {
    if (sortedBars.some((b) => b.revision > 0)) {
      return FiveMinBarType.RECOVERED;
    }
    if (sortedBars.some((b) => b.ohlcv.volume === 0)) {
      return FiveMinBarType.CONTAINS_SYNTHETIC;
    }
    return FiveMinBarType.LIVE_CONFIRMED;
  }
}

// ─── Window Accumulator ───────────────────────────────────────────────────────

/**
 * WindowAccumulator maintains the in-progress five-minute window for a single
 * instrument. It accumulates confirmed one-minute bars and signals when a
 * complete window is ready for aggregation.
 *
 * Gate G3 Revision 2: Windows containing UNRESOLVED bars transition to
 * BLOCKED_UNRESOLVED state rather than being discarded. Recovered bars can
 * replace the UNRESOLVED slot. When all 5 slots are CONFIRMED, the window
 * is unblocked and the five-minute bar is emitted exactly once.
 */
export class WindowAccumulator {
  private readonly aggregator: FiveMinAggregator;

  /** Windows keyed by windowOpenTsMs. */
  private readonly windows = new Map<number, WindowEntry>();

  constructor(aggregator: FiveMinAggregator) {
    this.aggregator = aggregator;
  }

  /**
   * Add a bar to the accumulator.
   *
   * CONFIRMED bars: added to the window. If the window is now complete, returns FiveMinBar.
   * UNRESOLVED bars: window transitions to BLOCKED_UNRESOLVED. Returns null.
   * Other lifecycle states: ignored.
   *
   * INVARIANT: A five-minute bar is emitted exactly once per window (EMITTED guard).
   */
  addBar(bar: MinuteBar): FiveMinBar | null {
    const windowOpenTsMs = this.aggregator.getWindowOpenTsMs(bar.barOpenTsMs);
    let entry = this.windows.get(windowOpenTsMs);

    // Duplicate-completion guard: never emit from an already-emitted window
    if (entry?.state === WindowState.EMITTED) {
      return null;
    }

    if (bar.lifecycle === BarLifecycle.UNRESOLVED) {
      // Transition window to BLOCKED_UNRESOLVED (create if needed)
      if (!entry) {
        entry = { bars: new Map(), state: WindowState.BLOCKED_UNRESOLVED };
        this.windows.set(windowOpenTsMs, entry);
      } else {
        entry.state = WindowState.BLOCKED_UNRESOLVED;
      }
      // Store the UNRESOLVED bar in the slot (may be replaced by recovery)
      entry.bars.set(bar.barOpenTsMs, bar);
      return null;
    }

    if (bar.lifecycle !== BarLifecycle.CONFIRMED) {
      return null; // Only accept CONFIRMED or UNRESOLVED
    }

    // CONFIRMED bar
    if (!entry) {
      entry = { bars: new Map(), state: WindowState.ACCUMULATING };
      this.windows.set(windowOpenTsMs, entry);
    }

    // Insert or replace the bar at this slot (recovery replaces UNRESOLVED)
    entry.bars.set(bar.barOpenTsMs, bar);

    // Check if window is now complete (all 5 slots filled with CONFIRMED bars)
    return this._tryComplete(windowOpenTsMs, entry);
  }

  /**
   * Insert a recovered bar into a BLOCKED_UNRESOLVED window.
   * The recovered bar replaces the UNRESOLVED slot at the same barOpenTsMs.
   * If all 5 slots are now CONFIRMED, emits the five-minute bar exactly once.
   */
  insertRecoveredBar(bar: MinuteBar): FiveMinBar | null {
    if (bar.lifecycle !== BarLifecycle.CONFIRMED) {
      return null; // Only CONFIRMED bars can unblock a window
    }
    return this.addBar(bar);
  }

  /**
   * Explicitly block a window (called when an UNRESOLVED bar is detected
   * before the bar has been added via addBar).
   */
  blockWindow(barOpenTsMs: number): void {
    const windowOpenTsMs = this.aggregator.getWindowOpenTsMs(barOpenTsMs);
    const entry = this.windows.get(windowOpenTsMs);
    if (entry && entry.state !== WindowState.EMITTED) {
      entry.state = WindowState.BLOCKED_UNRESOLVED;
    }
  }

  /**
   * Return the current state of a window.
   */
  getWindowState(windowOpenTsMs: number): WindowState | null {
    return this.windows.get(windowOpenTsMs)?.state ?? null;
  }

  /** Return all windows (for testing). */
  getWindows(): ReadonlyMap<number, WindowEntry> {
    return this.windows;
  }

  /** Return the number of bars accumulated for a given window (for testing). */
  getWindowBarCount(windowOpenTsMs: number): number {
    return this.windows.get(windowOpenTsMs)?.bars.size ?? 0;
  }

  // ─── Private helpers ─────────────────────────────────────────────────────────

  private _tryComplete(windowOpenTsMs: number, entry: WindowEntry): FiveMinBar | null {
    // Need exactly 5 bars
    if (entry.bars.size !== FIVE_MIN_WINDOW_SIZE) return null;

    // All bars must be CONFIRMED
    const bars = Array.from(entry.bars.values());
    if (bars.some((b) => b.lifecycle !== BarLifecycle.CONFIRMED)) return null;

    // Attempt aggregation
    const result = this.aggregator.aggregate(bars);
    if (!result.ok) return null;

    // Mark as EMITTED — duplicate-completion guard
    entry.state = WindowState.EMITTED;
    this.windows.delete(windowOpenTsMs);

    return result.bar;
  }
}
