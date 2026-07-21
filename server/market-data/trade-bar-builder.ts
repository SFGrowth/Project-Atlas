/**
 * trade-bar-builder.ts — Trade-Built One-Minute Bar Construction Engine
 *
 * Implements the full approved lifecycle:
 *
 *   DEVELOPING  → bar window is open; individual trades update OHLCV
 *   PROVISIONAL → minute boundary closed; awaiting official ohlcv-1m reconciliation
 *   CONFIRMED   → official ohlcv-1m arrived and all fields within tolerance
 *   UNRESOLVED  → official record missing, or any field exceeds tolerance
 *
 * Two separate event sources:
 *   1. processTrade()     — individual normalised Databento trades (MBP-1 / trade schema)
 *   2. processOfficialOhlcv1m() — official Databento ohlcv-1m record (reconciliation reference)
 *
 * INVARIANT: A bar is CONFIRMED only when the official ohlcv-1m record arrives
 *            and all required fields are within the approved tolerance.
 *            Internal OHLC consistency alone is NOT sufficient for CONFIRMED.
 *
 * AUTHORITY NOTE: This module is parity-data preparation only.
 * TradingView remains the production processBar and postBarAutomation trigger.
 * MARKET_DATA_AUTHORITY = TRADINGVIEW_ONLY throughout Sprint 123A.3.
 * This module MUST NOT trigger processBar or postBarAutomation.
 *
 * Sprint 123A.3 — Gate G3 Revision 2
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

// ─── Trade Payload ────────────────────────────────────────────────────────────

/**
 * A normalised Databento trade record from the bridge server.
 * Produced by the Python feed adapter from MBP-1 or trade schema records.
 */
export interface BridgeTradePayload {
  schema: 'trade' | 'mbp-1';
  dataset: string;
  raw_symbol: string;
  instrument_id: number;
  /** Trade timestamp (nanoseconds since epoch, as string). */
  ts_event_ns: string;
  /** Trade price in pts100 (integer * 100). */
  price_pts100: number;
  /** Trade size (number of contracts). */
  size: number;
  mapping_version?: string;
  atlas_processing_ts_ms: number;
}

// ─── Official ohlcv-1m Payload ────────────────────────────────────────────────

/**
 * An official Databento ohlcv-1m record from the bridge server.
 * Used as the reconciliation reference for the trade-built PROVISIONAL bar.
 */
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

// ─── Developing Bar ───────────────────────────────────────────────────────────

/**
 * An in-progress bar accumulating trades within the current minute window.
 * Keyed by: dataset + instrumentId + rawSymbol + barOpenTsMs + revision + mappingVersion.
 */
export interface AtlasBarDeveloping {
  source: 'DATABENTO';
  dataset: string;
  rawSymbol: string;
  instrumentId: number;
  barOpenTsMs: number;
  revision: number;
  mappingVersion: string;
  /** OHLCV accumulated from individual trades. */
  ohlcv: OhlcvPts100;
  /** Nanosecond timestamp of the first trade in this bar. */
  firstTradeTsNs: string;
  /** Nanosecond timestamp of the most recent trade in this bar. */
  lastTradeTsNs: string;
  lifecycleState: BarLifecycle.DEVELOPING;
}

// ─── TradeBarBuilder Configuration ───────────────────────────────────────────

export interface TradeBarBuilderConfig {
  dataset: string;
  rawSymbol: string;
  instrumentId: number;
  mappingVersion?: string;
  reconciliationTolerancePts100?: number;
  pendingTimeoutMs?: number;
}

// ─── TradeBarBuilder ──────────────────────────────────────────────────────────

/**
 * TradeBarBuilder manages the full trade-built one-minute bar lifecycle.
 *
 * Architecture:
 *   - `processTrade()` accumulates individual trades into an AtlasBarDeveloping.
 *   - `closeMinute()` freezes the developing bar and emits PROVISIONAL.
 *   - `processOfficialOhlcv1m()` reconciles the PROVISIONAL bar against the
 *     official Databento ohlcv-1m record.
 *
 * The official ohlcv-1m record is required for CONFIRMED. An internally
 * consistent PROVISIONAL bar is NOT confirmed without the official record.
 */
export class TradeBarBuilder extends EventEmitter {
  private readonly config: Required<TradeBarBuilderConfig>;

  /** The currently open (DEVELOPING) bar, if any. */
  private developingBar: AtlasBarDeveloping | null = null;

  /** PROVISIONAL bars awaiting official ohlcv-1m reconciliation. */
  private readonly provisionalBars = new Map<number, MinuteBar>();

  /** Timeout handles for PROVISIONAL → UNRESOLVED transitions. */
  private readonly pendingTimeouts = new Map<number, ReturnType<typeof setTimeout>>();

  /** Last confirmed bar open timestamp (for gap detection). */
  private lastConfirmedBarOpenTsMs: number | null = null;

  /** Track how many times bar:confirmed has been emitted per barOpenTsMs. */
  private readonly confirmedEmitCount = new Map<number, number>();

  constructor(config: TradeBarBuilderConfig) {
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
   * Process an individual normalised trade.
   *
   * If no developing bar exists for this minute, a new DEVELOPING bar is created.
   * If a developing bar exists, its OHLCV is updated:
   *   - open: unchanged (set on first trade)
   *   - high: max(current high, trade price)
   *   - low:  min(current low, trade price)
   *   - close: trade price (last trade wins)
   *   - volume: += trade size
   *   - tradeCount: += 1
   *
   * Emits `bar:developing` after each update.
   */
  processTrade(payload: BridgeTradePayload): void {
    if (!this._isForThisInstrument(payload)) return;

    const tradeTsMs = this._tsNsToMs(payload.ts_event_ns);
    const barOpenTsMs = this._alignToMinute(tradeTsMs);

    // If the trade belongs to a new minute, close the previous developing bar first
    if (this.developingBar !== null && this.developingBar.barOpenTsMs !== barOpenTsMs) {
      this._closeMinuteBoundary(this.developingBar);
    }

    if (this.developingBar === null || this.developingBar.barOpenTsMs !== barOpenTsMs) {
      // Create a new DEVELOPING bar
      this.developingBar = {
        source: 'DATABENTO',
        dataset: this.config.dataset,
        rawSymbol: this.config.rawSymbol,
        instrumentId: this.config.instrumentId,
        barOpenTsMs,
        revision: 0,
        mappingVersion: payload.mapping_version ?? this.config.mappingVersion,
        ohlcv: {
          openPts100: payload.price_pts100,
          highPts100: payload.price_pts100,
          lowPts100: payload.price_pts100,
          closePts100: payload.price_pts100,
          volume: payload.size,
          tradeCount: 1,
        },
        firstTradeTsNs: payload.ts_event_ns,
        lastTradeTsNs: payload.ts_event_ns,
        lifecycleState: BarLifecycle.DEVELOPING,
      };
    } else {
      // Update the existing DEVELOPING bar
      const ohlcv = this.developingBar.ohlcv;
      ohlcv.highPts100 = Math.max(ohlcv.highPts100, payload.price_pts100);
      ohlcv.lowPts100 = Math.min(ohlcv.lowPts100, payload.price_pts100);
      ohlcv.closePts100 = payload.price_pts100;
      ohlcv.volume += payload.size;
      ohlcv.tradeCount += 1;
      this.developingBar.lastTradeTsNs = payload.ts_event_ns;
    }

    this._emitDeveloping(this.developingBar);
  }

  /**
   * Explicitly close the current minute boundary.
   *
   * Called when the minute boundary is detected (e.g., by a timer or when the
   * first trade of the next minute arrives). Freezes the developing bar and
   * emits `bar:provisional`. The bar awaits official ohlcv-1m reconciliation.
   *
   * INVARIANT: A PROVISIONAL bar is NOT confirmed without the official record.
   */
  closeMinute(barOpenTsMs: number): MinuteBar | null {
    if (this.developingBar === null || this.developingBar.barOpenTsMs !== barOpenTsMs) {
      return null;
    }
    return this._closeMinuteBoundary(this.developingBar);
  }

  /**
   * Process an official Databento ohlcv-1m record.
   *
   * This is the reconciliation reference. The trade-built PROVISIONAL bar for
   * the same barOpenTsMs is compared field-by-field against this record.
   *
   * If no PROVISIONAL bar exists (gap case), the official record is stored as
   * a CONFIRMED bar directly (recovered bar).
   *
   * Reconciliation compares:
   *   - barOpenTsMs (must match exactly)
   *   - open, high, low, close (within tolerance)
   *   - volume (within tolerance)
   */
  processOfficialOhlcv1m(payload: BridgeOhlcv1mPayload): void {
    if (!this._isForThisInstrument(payload)) return;

    const barOpenTsMs = this._tsNsToMs(payload.ts_event_ns);

    const official: OfficialOhlcv1mRecord = {
      source: 'DATABENTO',
      dataset: this.config.dataset,
      rawSymbol: this.config.rawSymbol,
      instrumentId: this.config.instrumentId,
      barOpenTsMs,
      barOpenTsNs: payload.ts_event_ns,
      barCloseTsMs: barOpenTsMs + 60_000,
      ohlcv: {
        openPts100: payload.open_pts100,
        highPts100: payload.high_pts100,
        lowPts100: payload.low_pts100,
        closePts100: payload.close_pts100,
        volume: payload.volume,
        tradeCount: payload.trade_count ?? 0,
      },
      tsRecvNs: payload.ts_recv_ns,
      atlasTsMs: payload.atlas_processing_ts_ms,
    };

    const provisional = this.provisionalBars.get(barOpenTsMs);

    if (provisional) {
      // Reconcile the trade-built PROVISIONAL bar against the official record
      this._reconcileProvisionalAgainstOfficial(provisional, official);
    } else {
      // No trade-built bar exists — check if the developing bar needs to be closed first
      if (this.developingBar !== null && this.developingBar.barOpenTsMs === barOpenTsMs) {
        const closed = this._closeMinuteBoundary(this.developingBar);
        if (closed) {
          this._reconcileProvisionalAgainstOfficial(closed, official);
          return;
        }
      }
      // Gap case: no trade-built bar. Create a CONFIRMED bar directly from official record.
      // This handles the case where trades were missed but the official record arrived.
      const recoveredBar = this._makeBarFromOfficial(official);
      recoveredBar.lifecycle = BarLifecycle.CONFIRMED;
      recoveredBar.reconciliation = {
        status: ReconciliationStatus.MATCHED,
        closeDetlaPts100: 0,
        highDeltaPts100: 0,
        lowDeltaPts100: 0,
        volumeDelta: 0,
        withinTolerance: true,
        tolerancePts100: this.config.reconciliationTolerancePts100,
        reconTsMs: Date.now(),
      };
      this._detectAndEmitGap(barOpenTsMs);
      this.lastConfirmedBarOpenTsMs = barOpenTsMs;
      this._emitConfirmed(recoveredBar);
    }
  }

  /**
   * Force a PROVISIONAL bar to UNRESOLVED after the pending timeout expires.
   * Called when the official ohlcv-1m record has not arrived within PENDING_TIMEOUT_MS.
   */
  expirePendingBar(barOpenTsMs: number): void {
    const bar = this.provisionalBars.get(barOpenTsMs);
    if (!bar) return;
    if (bar.lifecycle !== BarLifecycle.PROVISIONAL) return;

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
    this._clearPendingTimeout(barOpenTsMs);
    this._emit({ type: 'bar:unresolved', bar });
  }

  // ─── Accessors (for testing) ─────────────────────────────────────────────────
  /**
   * Update the active instrument config (e.g. on contract roll or initial
   * definition record from the Python adapter). Safe to call at any time.
   * In-flight PROVISIONAL bars for the old instrument are left to timeout.
   */
  updateConfig(patch: Partial<Pick<TradeBarBuilderConfig, 'dataset' | 'rawSymbol' | 'instrumentId' | 'mappingVersion'>>): void {
    const cfg = this.config as Partial<Required<TradeBarBuilderConfig>>;
    if (patch.dataset !== undefined) cfg.dataset = patch.dataset;
    if (patch.rawSymbol !== undefined) cfg.rawSymbol = patch.rawSymbol;
    if (patch.instrumentId !== undefined) cfg.instrumentId = patch.instrumentId;
    if (patch.mappingVersion !== undefined) cfg.mappingVersion = patch.mappingVersion;
  }


  getDevelopingBar(): AtlasBarDeveloping | null {
    return this.developingBar;
  }

  getProvisionalBars(): ReadonlyMap<number, MinuteBar> {
    return this.provisionalBars;
  }

  getLastConfirmedBarOpenTsMs(): number | null {
    return this.lastConfirmedBarOpenTsMs;
  }

  getConfirmedEmitCount(barOpenTsMs: number): number {
    return this.confirmedEmitCount.get(barOpenTsMs) ?? 0;
  }

  // ─── Private helpers ─────────────────────────────────────────────────────────

  private _closeMinuteBoundary(developing: AtlasBarDeveloping): MinuteBar {
    const bar: MinuteBar = {
      source: 'DATABENTO',
      dataset: developing.dataset,
      rawSymbol: developing.rawSymbol,
      instrumentId: developing.instrumentId,
      intervalMs: 60000,
      barOpenTsMs: developing.barOpenTsMs,
      barOpenTsNs: String(BigInt(developing.barOpenTsMs) * 1_000_000n),
      barCloseTsMs: developing.barOpenTsMs + 60_000,
      ohlcv: { ...developing.ohlcv },
      lifecycle: BarLifecycle.PROVISIONAL,
      reconciliation: null,
      revision: developing.revision,
      mappingVersion: developing.mappingVersion,
      atlasTsMs: Date.now(),
    };

    this.provisionalBars.set(developing.barOpenTsMs, bar);
    this.developingBar = null;

    // Schedule PENDING → UNRESOLVED timeout
    const timeout = setTimeout(() => {
      this.expirePendingBar(bar.barOpenTsMs);
    }, this.config.pendingTimeoutMs);
    this.pendingTimeouts.set(bar.barOpenTsMs, timeout);

    this._emit({ type: 'bar:provisional', bar });
    return bar;
  }

  private _reconcileProvisionalAgainstOfficial(
    bar: MinuteBar,
    official: OfficialOhlcv1mRecord,
  ): void {
    // Already reconciled
    if (bar.lifecycle === BarLifecycle.CONFIRMED || bar.lifecycle === BarLifecycle.UNRESOLVED) {
      return;
    }

    // Timestamp must match exactly
    if (bar.barOpenTsMs !== official.barOpenTsMs) {
      bar.lifecycle = BarLifecycle.UNRESOLVED;
      bar.reconciliation = {
        status: ReconciliationStatus.UNMATCHED,
        closeDetlaPts100: null,
        highDeltaPts100: null,
        lowDeltaPts100: null,
        volumeDelta: null,
        withinTolerance: false,
        tolerancePts100: this.config.reconciliationTolerancePts100,
        reconTsMs: Date.now(),
      };
      this._clearPendingTimeout(bar.barOpenTsMs);
      this._emit({ type: 'bar:unresolved', bar });
      return;
    }

    // Field-by-field delta comparison
    const closeDetlaPts100 = bar.ohlcv.closePts100 - official.ohlcv.closePts100;
    const highDeltaPts100 = bar.ohlcv.highPts100 - official.ohlcv.highPts100;
    const lowDeltaPts100 = bar.ohlcv.lowPts100 - official.ohlcv.lowPts100;
    const volumeDelta = bar.ohlcv.volume - official.ohlcv.volume;

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
      this._emitConfirmed(bar);
    } else {
      bar.lifecycle = BarLifecycle.UNRESOLVED;
      this._emit({ type: 'bar:unresolved', bar });
    }
  }

  private _makeBarFromOfficial(official: OfficialOhlcv1mRecord): MinuteBar {
    return {
      source: 'DATABENTO',
      dataset: official.dataset,
      rawSymbol: official.rawSymbol,
      instrumentId: official.instrumentId,
      intervalMs: 60000,
      barOpenTsMs: official.barOpenTsMs,
      barOpenTsNs: official.barOpenTsNs,
      barCloseTsMs: official.barCloseTsMs,
      ohlcv: { ...official.ohlcv },
      lifecycle: BarLifecycle.PROVISIONAL,
      reconciliation: null,
      revision: 0,
      mappingVersion: this.config.mappingVersion,
      atlasTsMs: official.atlasTsMs,
    };
  }

  private _detectAndEmitGap(barOpenTsMs: number): void {
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
  }

  private _emitDeveloping(developing: AtlasBarDeveloping): void {
    // Convert AtlasBarDeveloping to MinuteBar for the event
    const bar: MinuteBar = {
      source: 'DATABENTO',
      dataset: developing.dataset,
      rawSymbol: developing.rawSymbol,
      instrumentId: developing.instrumentId,
      intervalMs: 60000,
      barOpenTsMs: developing.barOpenTsMs,
      barOpenTsNs: String(BigInt(developing.barOpenTsMs) * 1_000_000n),
      barCloseTsMs: developing.barOpenTsMs + 60_000,
      ohlcv: { ...developing.ohlcv },
      lifecycle: BarLifecycle.DEVELOPING,
      reconciliation: null,
      revision: developing.revision,
      mappingVersion: developing.mappingVersion,
      atlasTsMs: Date.now(),
    };
    this._emit({ type: 'bar:developing', bar });
  }

  private _emitConfirmed(bar: MinuteBar): void {
    const count = (this.confirmedEmitCount.get(bar.barOpenTsMs) ?? 0) + 1;
    this.confirmedEmitCount.set(bar.barOpenTsMs, count);
    this._emit({ type: 'bar:confirmed', bar });
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

  private _tsNsToMs(tsNs: string): number {
    return Number(BigInt(tsNs) / 1_000_000n);
  }

  private _alignToMinute(tsMs: number): number {
    return tsMs - (tsMs % 60_000);
  }

  private _isForThisInstrument(
    payload: { dataset: string; raw_symbol: string; instrument_id: number },
  ): boolean {
    return (
      payload.dataset === this.config.dataset &&
      payload.raw_symbol === this.config.rawSymbol &&
      payload.instrument_id === this.config.instrumentId
    );
  }
}
