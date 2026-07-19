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
 *
 * If any invariant is violated, the window is rejected and no FiveMinBar is produced.
 * This is the primary enforcement mechanism for the Gate G2 requirement:
 * "A five-minute window containing an unresolved minute must not produce a bar row."
 *
 * AUTHORITY NOTE: This module is parity-data preparation only.
 * TradingView remains the production processBar and postBarAutomation trigger.
 * MARKET_DATA_AUTHORITY = TRADINGVIEW_ONLY throughout Sprint 123A.3.
 *
 * Sprint 123A.3 — Gate G3
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

// ─── Five-Minute Aggregator ───────────────────────────────────────────────────

export class FiveMinAggregator {
  /**
   * Attempt to aggregate a window of one-minute bars into a five-minute bar.
   *
   * The bars array must be sorted in ascending chronological order.
   * Returns `{ ok: true, bar }` on success, or `{ ok: false, reason, detail }` on rejection.
   *
   * This method is pure and stateless — it does not maintain any internal
   * window state. The caller (BarPersistence or the orchestrator) is responsible
   * for accumulating confirmed bars and calling this method when a window is complete.
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
   * Returns true if exactly 5 contiguous confirmed bars are present and the
   * window aligns to a five-minute boundary.
   *
   * This is a lightweight check for the orchestrator to use before calling
   * `aggregate()`.
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
   *
   * Example: barOpenTsMs = 09:03:00 UTC → windowOpenTsMs = 09:00:00 UTC
   */
  getWindowOpenTsMs(barOpenTsMs: number): number {
    return barOpenTsMs - (barOpenTsMs % 300_000);
  }

  // ─── Private helpers ─────────────────────────────────────────────────────────

  /**
   * Aggregate OHLCV values from 5 one-minute bars.
   * Open = first bar's open
   * High = max of all highs
   * Low  = min of all lows
   * Close = last bar's close
   * Volume = sum of all volumes
   * TradeCount = sum of all trade counts
   */
  private _aggregateOhlcv(sortedBars: MinuteBar[]): OhlcvPts100 {
    const openPts100 = sortedBars[0].ohlcv.openPts100;
    const closePts100 = sortedBars[sortedBars.length - 1].ohlcv.closePts100;
    const highPts100 = Math.max(...sortedBars.map((b) => b.ohlcv.highPts100));
    const lowPts100 = Math.min(...sortedBars.map((b) => b.ohlcv.lowPts100));
    const volume = sortedBars.reduce((sum, b) => sum + b.ohlcv.volume, 0);
    const tradeCount = sortedBars.reduce((sum, b) => sum + b.ohlcv.tradeCount, 0);

    return { openPts100, highPts100, lowPts100, closePts100, volume, tradeCount };
  }

  /**
   * Determine the five-minute bar type based on the constituent bars.
   * RECOVERED if any bar was recovered from a gap.
   * CONTAINS_SYNTHETIC if any bar has zero volume (no-trade bar).
   * LIVE_CONFIRMED otherwise.
   */
  private _determineBarType(sortedBars: MinuteBar[]): FiveMinBarType {
    // A recovered bar is identified by revision > 0 (set by recovery pipeline)
    if (sortedBars.some((b) => b.revision > 0)) {
      return FiveMinBarType.RECOVERED;
    }
    // A synthetic bar has zero volume
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
 * Design: one WindowAccumulator per instrument per dataset.
 */
export class WindowAccumulator {
  private readonly aggregator: FiveMinAggregator;
  private readonly windows = new Map<number, MinuteBar[]>();

  constructor(aggregator: FiveMinAggregator) {
    this.aggregator = aggregator;
  }

  /**
   * Add a confirmed one-minute bar to the accumulator.
   * Returns a FiveMinBar if the window is now complete, or null otherwise.
   *
   * INVARIANT: Only CONFIRMED bars are accepted.
   * INVARIANT: UNRESOLVED bars are rejected and their window is discarded.
   */
  addBar(bar: MinuteBar): FiveMinBar | null {
    if (bar.lifecycle === BarLifecycle.UNRESOLVED) {
      // Discard the entire window that contains this bar
      const windowOpenTsMs = this.aggregator.getWindowOpenTsMs(bar.barOpenTsMs);
      this.windows.delete(windowOpenTsMs);
      return null;
    }

    if (bar.lifecycle !== BarLifecycle.CONFIRMED) {
      return null; // Only accept CONFIRMED bars
    }

    const windowOpenTsMs = this.aggregator.getWindowOpenTsMs(bar.barOpenTsMs);
    const window = this.windows.get(windowOpenTsMs) ?? [];
    window.push(bar);
    this.windows.set(windowOpenTsMs, window);

    if (this.aggregator.isWindowComplete(window)) {
      this.windows.delete(windowOpenTsMs);
      const result = this.aggregator.aggregate(window);
      if (result.ok) {
        return result.bar;
      }
      return null;
    }

    return null;
  }

  /**
   * Discard a window when an UNRESOLVED bar is detected for that window.
   * Called by the orchestrator when a bar transitions to UNRESOLVED.
   */
  discardWindow(barOpenTsMs: number): void {
    const windowOpenTsMs = this.aggregator.getWindowOpenTsMs(barOpenTsMs);
    this.windows.delete(windowOpenTsMs);
  }

  /** Return the current state of all in-progress windows (for testing). */
  getWindows(): ReadonlyMap<number, MinuteBar[]> {
    return this.windows;
  }

  /** Return the number of bars accumulated for a given window (for testing). */
  getWindowBarCount(windowOpenTsMs: number): number {
    return this.windows.get(windowOpenTsMs)?.length ?? 0;
  }
}
