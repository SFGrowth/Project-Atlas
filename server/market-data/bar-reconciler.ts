/**
 * bar-reconciler.ts — Official Bar Reconciliation Engine
 *
 * Manages reconciliation of constructed one-minute bars against official
 * Databento ohlcv-1m reference records.
 *
 * In Sprint 123A.3, the official ohlcv-1m record from Databento is both the
 * source of bar data and the reconciliation reference. Reconciliation validates:
 *   - All OHLCV fields are present and non-zero
 *   - High >= Open, Close, Low
 *   - Low <= Open, Close, High
 *   - Nanosecond timestamp precision is preserved
 *
 * In Sprint 123A.4+ (parity mode), this module will compare the constructed
 * bar against a separately-received reference feed (e.g., a second Databento
 * subscription or a TradingView bar).
 *
 * AUTHORITY NOTE: Reconciliation is parity-data preparation only.
 * TradingView remains the production processBar trigger.
 * Only CONFIRMED bars are eligible for five-minute aggregation.
 * UNRESOLVED bars block aggregation for their five-minute window.
 *
 * Sprint 123A.3 — Gate G3
 */

import {
  MinuteBar,
  OfficialOhlcv1mRecord,
  OhlcvPts100,
  ReconciliationDetail,
  ReconciliationStatus,
  BarLifecycle,
  DEFAULT_RECONCILIATION_TOLERANCE_PTS100,
} from './types/bar-lifecycle.js';

// ─── Reconciliation Configuration ────────────────────────────────────────────

export interface ReconcilerConfig {
  /** Tolerance in pts100 units (integer * 100). Default: 25 = 0.25 points. */
  tolerancePts100?: number;
}

// ─── Reconciliation Result ────────────────────────────────────────────────────

export interface ReconciliationResult {
  bar: MinuteBar;
  detail: ReconciliationDetail;
  /** Whether the bar transitioned to CONFIRMED or UNRESOLVED. */
  outcome: BarLifecycle.CONFIRMED | BarLifecycle.UNRESOLVED;
}

// ─── Bar Reconciler ───────────────────────────────────────────────────────────

export class BarReconciler {
  private readonly tolerancePts100: number;

  constructor(config: ReconcilerConfig = {}) {
    this.tolerancePts100 = config.tolerancePts100 ?? DEFAULT_RECONCILIATION_TOLERANCE_PTS100;
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * Reconcile a PROVISIONAL bar against an official ohlcv-1m reference record.
   *
   * Returns a ReconciliationResult with the updated bar and reconciliation detail.
   * The bar's lifecycle is updated in place.
   *
   * INVARIANT: Only PROVISIONAL or PENDING bars may be reconciled.
   * INVARIANT: A bar that is already CONFIRMED or UNRESOLVED is returned unchanged.
   */
  reconcile(bar: MinuteBar, reference: OfficialOhlcv1mRecord): ReconciliationResult {
    if (
      bar.lifecycle === BarLifecycle.CONFIRMED ||
      bar.lifecycle === BarLifecycle.UNRESOLVED
    ) {
      return {
        bar,
        detail: bar.reconciliation!,
        outcome: bar.lifecycle as BarLifecycle.CONFIRMED | BarLifecycle.UNRESOLVED,
      };
    }

    // Validate timestamp alignment
    if (bar.barOpenTsMs !== reference.barOpenTsMs) {
      const detail: ReconciliationDetail = {
        status: ReconciliationStatus.UNMATCHED,
        closeDetlaPts100: null,
        highDeltaPts100: null,
        lowDeltaPts100: null,
        volumeDelta: null,
        withinTolerance: false,
        tolerancePts100: this.tolerancePts100,
        reconTsMs: Date.now(),
      };
      bar.lifecycle = BarLifecycle.UNRESOLVED;
      bar.reconciliation = detail;
      return { bar, detail, outcome: BarLifecycle.UNRESOLVED };
    }

    const detail = this._computeDetail(bar.ohlcv, reference.ohlcv);
    bar.reconciliation = detail;
    bar.lifecycle =
      detail.status === ReconciliationStatus.MATCHED
        ? BarLifecycle.CONFIRMED
        : BarLifecycle.UNRESOLVED;

    return {
      bar,
      detail,
      outcome: bar.lifecycle as BarLifecycle.CONFIRMED | BarLifecycle.UNRESOLVED,
    };
  }

  /**
   * Validate a single ohlcv-1m record for internal consistency.
   * Used to confirm a bar before storing it, even without a separate reference.
   *
   * Rules:
   *   - All price fields must be positive (> 0)
   *   - High >= Open, Close, Low
   *   - Low <= Open, Close, High
   *   - Volume >= 0
   */
  validateOhlcvConsistency(ohlcv: OhlcvPts100): {
    valid: boolean;
    reason?: string;
  } {
    if (ohlcv.openPts100 <= 0) return { valid: false, reason: 'open_price_pts100 must be > 0' };
    if (ohlcv.highPts100 <= 0) return { valid: false, reason: 'high_price_pts100 must be > 0' };
    if (ohlcv.lowPts100 <= 0) return { valid: false, reason: 'low_price_pts100 must be > 0' };
    if (ohlcv.closePts100 <= 0) return { valid: false, reason: 'close_price_pts100 must be > 0' };
    if (ohlcv.volume < 0) return { valid: false, reason: 'volume must be >= 0' };

    if (ohlcv.highPts100 < ohlcv.openPts100)
      return { valid: false, reason: 'high < open' };
    if (ohlcv.highPts100 < ohlcv.closePts100)
      return { valid: false, reason: 'high < close' };
    if (ohlcv.highPts100 < ohlcv.lowPts100)
      return { valid: false, reason: 'high < low' };
    if (ohlcv.lowPts100 > ohlcv.openPts100)
      return { valid: false, reason: 'low > open' };
    if (ohlcv.lowPts100 > ohlcv.closePts100)
      return { valid: false, reason: 'low > close' };

    return { valid: true };
  }

  /**
   * Mark a bar as UNRESOLVED due to reference data being unavailable.
   * Used when the PENDING timeout expires.
   */
  markUnavailable(bar: MinuteBar): ReconciliationResult {
    const detail: ReconciliationDetail = {
      status: ReconciliationStatus.UNAVAILABLE,
      closeDetlaPts100: null,
      highDeltaPts100: null,
      lowDeltaPts100: null,
      volumeDelta: null,
      withinTolerance: false,
      tolerancePts100: this.tolerancePts100,
      reconTsMs: Date.now(),
    };
    bar.lifecycle = BarLifecycle.UNRESOLVED;
    bar.reconciliation = detail;
    return { bar, detail, outcome: BarLifecycle.UNRESOLVED };
  }

  // ─── Private helpers ─────────────────────────────────────────────────────────

  private _computeDetail(
    constructed: OhlcvPts100,
    reference: OhlcvPts100,
  ): ReconciliationDetail {
    const closeDetlaPts100 = constructed.closePts100 - reference.closePts100;
    const highDeltaPts100 = constructed.highPts100 - reference.highPts100;
    const lowDeltaPts100 = constructed.lowPts100 - reference.lowPts100;
    const volumeDelta = constructed.volume - reference.volume;

    const tol = this.tolerancePts100;
    const withinTolerance =
      Math.abs(closeDetlaPts100) <= tol &&
      Math.abs(highDeltaPts100) <= tol &&
      Math.abs(lowDeltaPts100) <= tol;

    return {
      status: withinTolerance ? ReconciliationStatus.MATCHED : ReconciliationStatus.UNMATCHED,
      closeDetlaPts100,
      highDeltaPts100,
      lowDeltaPts100,
      volumeDelta,
      withinTolerance,
      tolerancePts100: tol,
      reconTsMs: Date.now(),
    };
  }
}
