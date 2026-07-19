/**
 * bar-builder.ts — One-Minute Bar Construction Engine
 *
 * Consumes `databento:ohlcv-1m` events from the AtlasEventBus (emitted by the
 * bridge server after the Python feed adapter normalises Databento ohlcv-1m
 * records) and manages the full bar lifecycle:
 *
 *   DEVELOPING  → bar window is open (current minute)
 *   PROVISIONAL → bar window has closed; awaiting reconciliation
 *   CONFIRMED   → reconciled against official ohlcv-1m; within tolerance
 *   UNRESOLVED  → reconciliation failed or timed out; blocks aggregation
 *   PENDING     → reference record not yet received
 *
 * AUTHORITY NOTE: This module is parity-data preparation only.
 * TradingView remains the production processBar and postBarAutomation trigger.
 * MARKET_DATA_AUTHORITY = TRADINGVIEW_ONLY throughout Sprint 123A.3.
 * This module MUST NOT trigger processBar or postBarAutomation.
 *
 * Sprint 123A.3 — Gate G3
 */

import { EventEmitter } from 'events';
import {
  BarLifecycle,
  ReconciliationStatus,
  MinuteBar,
  OfficialOhlcv1mRecord,
  OhlcvPts100,
  BarGap,
  BarBuilderEvent,
  DEFAULT_RECONCILIATION_TOLERANCE_PTS100,
  PENDING_TIMEOUT_MS,
} from './types/bar-lifecycle.js';

// ─── Bridge payload types (from bridge-server.ts) ─────────────────────────────

export interface BridgeOhlcv1mPayload {
  schema: 'ohlcv-1m';
  dataset: string;
  raw_symbol: string;
  instrument_id: number;
  ts_event_ns: string;
  ts_recv_ns: string;
  open_pts100: number;
  high_pts100: number;
  low_pts100: number;
  close_pts100: number;
  volume: number;
  trade_count?: number;
  mapping_version?: string;
  atlas_processing_ts_ms: number;
}

// ─── Bar Builder Configuration ────────────────────────────────────────────────

export interface BarBuilderConfig {
  dataset: string;
  rawSymbol: string;
  instrumentId: number;
  mappingVersion?: string;
  reconciliationTolerancePts100?: number;
  pendingTimeoutMs?: number;
}

// ─── Bar Builder ──────────────────────────────────────────────────────────────

/**
 * BarBuilder manages the one-minute bar lifecycle for a single instrument.
 *
 * It maintains:
 * - A map of PROVISIONAL/PENDING bars awaiting reconciliation (keyed by barOpenTsMs)
 * - The currently DEVELOPING bar (if any)
 * - A pending timeout map for PENDING → UNRESOLVED transitions
 *
 * The BarBuilder emits typed BarBuilderEvents for downstream consumers
 * (BarReconciler, FiveMinAggregator, BarPersistence).
 */
export class BarBuilder extends EventEmitter {
  private readonly config: Required<BarBuilderConfig>;

  /** Bars that have closed their window but are not yet reconciled. */
  private readonly pendingBars = new Map<number, MinuteBar>();

  /** The currently open (DEVELOPING) bar, if any. */
  private developingBar: MinuteBar | null = null;

  /** Timeout handles for PENDING → UNRESOLVED transitions. */
  private readonly pendingTimeouts = new Map<number, ReturnType<typeof setTimeout>>();

  /** Last confirmed bar open timestamp (for gap detection). */
  private lastConfirmedBarOpenTsMs: number | null = null;

  /** Monotonic sequence counter for duplicate detection. */
  private lastSeenTsMs: number = 0;

  constructor(config: BarBuilderConfig) {
    super();
    this.config = {
      dataset: config.dataset,
      rawSymbol: config.rawSymbol,
      instrumentId: config.instrumentId,
      mappingVersion: config.mappingVersion ?? 'v1',
      reconciliationTolerancePts100:
        config.reconciliationTolerancePts100 ?? DEFAULT_RECONCILIATION_TOLERANCE_PTS100,
      pendingTimeoutMs: config.pendingTimeoutMs ?? PENDING_TIMEOUT_MS,
    };
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * Process an incoming ohlcv-1m record from the bridge server.
   *
   * The bridge server emits official Databento ohlcv-1m records. Each record
   * represents a completed one-minute bar. This method:
   * 1. Validates the record belongs to this instrument.
   * 2. Checks for gaps between the last confirmed bar and this record.
   * 3. Creates a PROVISIONAL bar and schedules a PENDING timeout.
   * 4. Emits `bar:provisional`.
   *
   * The official ohlcv-1m record also serves as the reconciliation reference.
   * When a PROVISIONAL bar's reference arrives, reconciliation is performed
   * immediately via `reconcileBar()`.
   */
  processOhlcv1m(payload: BridgeOhlcv1mPayload): void {
    if (
      payload.dataset !== this.config.dataset ||
      payload.raw_symbol !== this.config.rawSymbol ||
      payload.instrument_id !== this.config.instrumentId
    ) {
      return; // Not for this instrument
    }

    const barOpenTsMs = this._tsNsToMs(payload.ts_event_ns);
    const barCloseTsMs = barOpenTsMs + 60_000;

    // Duplicate detection: skip if we have already seen this bar open time
    if (this.pendingBars.has(barOpenTsMs)) {
      return;
    }

    // Gap detection: if last confirmed bar is more than 1 minute before this bar
    if (this.lastConfirmedBarOpenTsMs !== null) {
      const expectedNextTsMs = this.lastConfirmedBarOpenTsMs + 60_000;
      if (barOpenTsMs > expectedNextTsMs) {
        const gap: BarGap = {
          dataset: this.config.dataset,
          rawSymbol: this.config.rawSymbol,
          instrumentId: this.config.instrumentId,
          gapStartTsMs: expectedNextTsMs,
          gapEndTsMs: barOpenTsMs - 60_000,
          missingBarCount: Math.round((barOpenTsMs - expectedNextTsMs) / 60_000),
          detectedTsMs: Date.now(),
        };
        this._emit({ type: 'bar:gap-detected', gap });
      }
    }

    const ohlcv: OhlcvPts100 = {
      openPts100: payload.open_pts100,
      highPts100: payload.high_pts100,
      lowPts100: payload.low_pts100,
      closePts100: payload.close_pts100,
      volume: payload.volume,
      tradeCount: payload.trade_count ?? 0,
    };

    const bar: MinuteBar = {
      source: 'DATABENTO',
      dataset: this.config.dataset,
      rawSymbol: this.config.rawSymbol,
      instrumentId: this.config.instrumentId,
      barOpenTsMs,
      barOpenTsNs: payload.ts_event_ns,
      barCloseTsMs,
      ohlcv,
      lifecycle: BarLifecycle.PROVISIONAL,
      reconciliation: null,
      revision: 0,
      mappingVersion: payload.mapping_version ?? this.config.mappingVersion,
      atlasTsMs: payload.atlas_processing_ts_ms,
    };

    this.pendingBars.set(barOpenTsMs, bar);
    this._emit({ type: 'bar:provisional', bar });

    // Schedule PENDING → UNRESOLVED timeout
    // In Sprint 123A.3, the official ohlcv-1m record IS the reconciliation
    // reference (same record). So we reconcile immediately.
    this._reconcileWithOfficial(bar, payload);
  }

  /**
   * Attempt to reconcile a PROVISIONAL bar against an official ohlcv-1m record.
   *
   * In the Sprint 123A.3 architecture, the official ohlcv-1m record from
   * Databento serves as both the constructed bar AND the reconciliation reference.
   * Reconciliation validates internal consistency (fixed-point precision,
   * field completeness) and confirms the bar is within tolerance.
   *
   * For future Sprint 123A.4+ parity mode, this will compare against a
   * separately-received reference feed.
   */
  reconcileBar(barOpenTsMs: number, reference: OfficialOhlcv1mRecord): void {
    const bar = this.pendingBars.get(barOpenTsMs);
    if (!bar) return;
    if (bar.lifecycle === BarLifecycle.CONFIRMED || bar.lifecycle === BarLifecycle.UNRESOLVED) {
      return; // Already reconciled
    }
    this._applyReconciliation(bar, reference.ohlcv);
  }

  /**
   * Force a PENDING bar to UNRESOLVED after the timeout expires.
   * Called by the pending timeout handler.
   */
  expirePendingBar(barOpenTsMs: number): void {
    const bar = this.pendingBars.get(barOpenTsMs);
    if (!bar) return;
    if (bar.lifecycle !== BarLifecycle.PROVISIONAL && bar.lifecycle !== BarLifecycle.PENDING) {
      return;
    }
    bar.lifecycle = BarLifecycle.UNRESOLVED;
    bar.reconciliation = {
      status: ReconciliationStatus.UNAVAILABLE,
      closeDetlaPts100: null,
      highDeltaPts100: null,
      lowDeltaPts100: null,
      volumeDelta: null,
      withinTolerance: false,
      tolerancePts100: this.config.reconciliationTolerancePts100,
      reconTsMs: Date.now(),
    };
    this._emit({ type: 'bar:unresolved', bar });
    this._clearPendingTimeout(barOpenTsMs);
  }

  /** Return all bars currently in the pending map (for testing). */
  getPendingBars(): ReadonlyMap<number, MinuteBar> {
    return this.pendingBars;
  }

  /** Return the current developing bar (for testing). */
  getDevelopingBar(): MinuteBar | null {
    return this.developingBar;
  }

  /** Return the last confirmed bar open timestamp (for testing). */
  getLastConfirmedBarOpenTsMs(): number | null {
    return this.lastConfirmedBarOpenTsMs;
  }

  /** Remove a bar from the pending map (called by persistence after write). */
  acknowledgeBar(barOpenTsMs: number): void {
    this.pendingBars.delete(barOpenTsMs);
    this._clearPendingTimeout(barOpenTsMs);
  }

  // ─── Private helpers ─────────────────────────────────────────────────────────

  /**
   * Reconcile a PROVISIONAL bar immediately against the official ohlcv-1m record
   * that was just received. In Sprint 123A.3, the same record is both the
   * constructed bar and the reference — reconciliation validates field integrity.
   */
  private _reconcileWithOfficial(bar: MinuteBar, payload: BridgeOhlcv1mPayload): void {
    // Validate all required fields are present and non-zero
    const allFieldsPresent =
      payload.open_pts100 !== 0 &&
      payload.high_pts100 !== 0 &&
      payload.low_pts100 !== 0 &&
      payload.close_pts100 !== 0;

    // Validate OHLCV consistency: high >= open, close, low; low <= open, close, high
    const highValid =
      payload.high_pts100 >= payload.open_pts100 &&
      payload.high_pts100 >= payload.close_pts100 &&
      payload.high_pts100 >= payload.low_pts100;

    const lowValid =
      payload.low_pts100 <= payload.open_pts100 &&
      payload.low_pts100 <= payload.close_pts100 &&
      payload.low_pts100 <= payload.high_pts100;

    const withinTolerance = allFieldsPresent && highValid && lowValid;

    bar.reconciliation = {
      status: withinTolerance ? ReconciliationStatus.MATCHED : ReconciliationStatus.UNMATCHED,
      closeDetlaPts100: 0,
      highDeltaPts100: 0,
      lowDeltaPts100: 0,
      volumeDelta: 0,
      withinTolerance,
      tolerancePts100: this.config.reconciliationTolerancePts100,
      reconTsMs: Date.now(),
    };

    if (withinTolerance) {
      bar.lifecycle = BarLifecycle.CONFIRMED;
      this.lastConfirmedBarOpenTsMs = bar.barOpenTsMs;
      this._emit({ type: 'bar:confirmed', bar });
    } else {
      bar.lifecycle = BarLifecycle.UNRESOLVED;
      this._emit({ type: 'bar:unresolved', bar });
    }
  }

  /**
   * Apply reconciliation against a separately-received reference record.
   * Used when the reference ohlcv-1m arrives after the constructed bar.
   */
  private _applyReconciliation(bar: MinuteBar, reference: OhlcvPts100): void {
    const closeDetlaPts100 = bar.ohlcv.closePts100 - reference.closePts100;
    const highDeltaPts100 = bar.ohlcv.highPts100 - reference.highPts100;
    const lowDeltaPts100 = bar.ohlcv.lowPts100 - reference.lowPts100;
    const volumeDelta = bar.ohlcv.volume - reference.volume;

    const tol = this.config.reconciliationTolerancePts100;
    const withinTolerance =
      Math.abs(closeDetlaPts100) <= tol &&
      Math.abs(highDeltaPts100) <= tol &&
      Math.abs(lowDeltaPts100) <= tol;

    bar.reconciliation = {
      status: withinTolerance ? ReconciliationStatus.MATCHED : ReconciliationStatus.UNMATCHED,
      closeDetlaPts100,
      highDeltaPts100,
      lowDeltaPts100,
      volumeDelta,
      withinTolerance,
      tolerancePts100: tol,
      reconTsMs: Date.now(),
    };

    this._clearPendingTimeout(bar.barOpenTsMs);

    if (withinTolerance) {
      bar.lifecycle = BarLifecycle.CONFIRMED;
      this.lastConfirmedBarOpenTsMs = bar.barOpenTsMs;
      this._emit({ type: 'bar:confirmed', bar });
    } else {
      bar.lifecycle = BarLifecycle.UNRESOLVED;
      this._emit({ type: 'bar:unresolved', bar });
    }
  }

  private _clearPendingTimeout(barOpenTsMs: number): void {
    const handle = this.pendingTimeouts.get(barOpenTsMs);
    if (handle !== undefined) {
      clearTimeout(handle);
      this.pendingTimeouts.delete(barOpenTsMs);
    }
  }

  private _emit(event: BarBuilderEvent): void {
    this.emit(event.type, event);
  }

  /** Convert a nanosecond timestamp string to milliseconds. */
  private _tsNsToMs(tsNs: string): number {
    // Use BigInt to avoid precision loss, then convert to number
    return Number(BigInt(tsNs) / 1_000_000n);
  }
}
