/**
 * Atlas Parity Service
 * Sprint 123A.4 — Live Chart and Databento Shadow Integration
 *
 * Compares TradingView bars against Databento confirmed bars to measure
 * data quality parity. Used for DATABENTO_SHADOW mode validation.
 *
 * AUTHORITY BOUNDARY
 * ------------------
 * This service is READ-ONLY comparison. It MUST NOT:
 *   - trigger processBar
 *   - trigger postBarAutomation
 *   - influence strategy decisions
 *   - activate any authority mode
 *
 * PARITY METRICS
 * --------------
 *   - closeDeltaPts100: |TV_close - DB_close| in pts*100
 *   - highDeltaPts100:  |TV_high  - DB_high|  in pts*100
 *   - lowDeltaPts100:   |TV_low   - DB_low|   in pts*100
 *   - volumeDelta:      |TV_volume - DB_volume|
 *   - withinTolerance:  closeDelta <= tolerancePts100
 *   - mismatchRate:     rolling 100-bar mismatch percentage
 *
 * Sprint 123A.4 — Gate G3 Approved
 */

import type { MinuteBar } from './types/bar-lifecycle.js';
import { BarLifecycle, ReconciliationStatus } from './types/bar-lifecycle.js';

// ─── Parity record ────────────────────────────────────────────────────────────

export interface TradingViewBarRecord {
  barOpenTsMs: number;
  openPts100: number;
  highPts100: number;
  lowPts100: number;
  closePts100: number;
  volume: number;
  symbol: string;
  atlasTsMs: number;
}

export interface ParityRecord {
  barOpenTsMs: number;
  symbol: string;
  tvClosePts100: number;
  dbClosePts100: number;
  closeDeltaPts100: number;
  highDeltaPts100: number;
  lowDeltaPts100: number;
  volumeDelta: number;
  withinTolerance: boolean;
  tolerancePts100: number;
  atlasTsMs: number;
}

export interface ParityMetrics {
  totalCompared: number;
  totalMismatches: number;
  mismatchRate: number;
  avgCloseDeltaPts100: number;
  maxCloseDeltaPts100: number;
  lastComparedAt: number | null;
  recentRecords: ParityRecord[];
}

// ─── ParityService ────────────────────────────────────────────────────────────

const DEFAULT_TOLERANCE_PTS100 = 25; // 0.25 points
const ROLLING_WINDOW = 100;
const MAX_RECENT_RECORDS = 20;

export class ParityService {
  private readonly tolerancePts100: number;
  /** Pending TradingView bars awaiting Databento confirmation. */
  private readonly tvPending = new Map<number, TradingViewBarRecord>();
  /** Rolling window of parity results. */
  private readonly rollingResults: boolean[] = [];
  private totalCompared = 0;
  private totalMismatches = 0;
  private sumCloseDelta = 0;
  private maxCloseDelta = 0;
  private lastComparedAt: number | null = null;
  private recentRecords: ParityRecord[] = [];

  constructor(tolerancePts100 = DEFAULT_TOLERANCE_PTS100) {
    this.tolerancePts100 = tolerancePts100;
  }

  // ─── Ingestion ─────────────────────────────────────────────────────────────

  /**
   * Register a TradingView bar for parity comparison.
   * Called when a TradingView bar is received in DATABENTO_SHADOW mode.
   */
  registerTradingViewBar(bar: TradingViewBarRecord): void {
    this.tvPending.set(bar.barOpenTsMs, bar);
    // Evict old pending bars (> 10 minutes old)
    const cutoff = Date.now() - 10 * 60 * 1000;
    for (const [ts, b] of this.tvPending) {
      if (b.atlasTsMs < cutoff) this.tvPending.delete(ts);
    }
  }

  /**
   * Compare a confirmed Databento bar against the pending TradingView bar.
   * Returns a ParityRecord if a match was found, null otherwise.
   */
  compareConfirmedBar(dbBar: MinuteBar): ParityRecord | null {
    if (dbBar.lifecycle !== BarLifecycle.CONFIRMED) return null;
    if (dbBar.reconciliation?.status !== ReconciliationStatus.MATCHED) return null;

    const tvBar = this.tvPending.get(dbBar.barOpenTsMs);
    if (!tvBar) return null;

    this.tvPending.delete(dbBar.barOpenTsMs);

    const closeDelta = Math.abs(tvBar.closePts100 - dbBar.ohlcv.closePts100);
    const highDelta = Math.abs(tvBar.highPts100 - dbBar.ohlcv.highPts100);
    const lowDelta = Math.abs(tvBar.lowPts100 - dbBar.ohlcv.lowPts100);
    const volumeDelta = Math.abs(tvBar.volume - (dbBar.ohlcv.volume ?? 0));
    const withinTolerance = closeDelta <= this.tolerancePts100;
    const record: ParityRecord = {
      barOpenTsMs: dbBar.barOpenTsMs,
      symbol: dbBar.rawSymbol,
      tvClosePts100: tvBar.closePts100,
      dbClosePts100: dbBar.ohlcv.closePts100,
      closeDeltaPts100: closeDelta,
      highDeltaPts100: highDelta,
      lowDeltaPts100: lowDelta,
      volumeDelta,
      withinTolerance,
      tolerancePts100: this.tolerancePts100,
      atlasTsMs: Date.now(),
    };

    this._recordResult(record);
    return record;
  }

  // ─── Metrics ───────────────────────────────────────────────────────────────

  getMetrics(): ParityMetrics {
    const mismatchRate = this.totalCompared > 0
      ? this.totalMismatches / this.totalCompared
      : 0;
    const avgCloseDelta = this.totalCompared > 0
      ? this.sumCloseDelta / this.totalCompared
      : 0;

    return {
      totalCompared: this.totalCompared,
      totalMismatches: this.totalMismatches,
      mismatchRate,
      avgCloseDeltaPts100: avgCloseDelta,
      maxCloseDeltaPts100: this.maxCloseDelta,
      lastComparedAt: this.lastComparedAt,
      recentRecords: [...this.recentRecords],
    };
  }

  getRollingMismatchRate(): number {
    if (this.rollingResults.length === 0) return 0;
    const mismatches = this.rollingResults.filter(r => !r).length;
    return mismatches / this.rollingResults.length;
  }

  reset(): void {
    this.tvPending.clear();
    this.rollingResults.length = 0;
    this.totalCompared = 0;
    this.totalMismatches = 0;
    this.sumCloseDelta = 0;
    this.maxCloseDelta = 0;
    this.lastComparedAt = null;
    this.recentRecords = [];
  }

  // ─── Private ───────────────────────────────────────────────────────────────

  private _recordResult(record: ParityRecord): void {
    this.totalCompared++;
    this.lastComparedAt = record.atlasTsMs;
    this.sumCloseDelta += record.closeDeltaPts100;
    if (record.closeDeltaPts100 > this.maxCloseDelta) {
      this.maxCloseDelta = record.closeDeltaPts100;
    }
    if (!record.withinTolerance) {
      this.totalMismatches++;
    }

    // Rolling window
    this.rollingResults.push(record.withinTolerance);
    if (this.rollingResults.length > ROLLING_WINDOW) {
      this.rollingResults.shift();
    }

    // Recent records
    this.recentRecords.push(record);
    if (this.recentRecords.length > MAX_RECENT_RECORDS) {
      this.recentRecords.shift();
    }
  }
}
