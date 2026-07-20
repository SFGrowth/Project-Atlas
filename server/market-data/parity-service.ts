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
 * PARITY CLASSIFICATIONS (6 terminal states)
 * -------------------------------------------
 *   EXACT_MATCH       — all fields identical
 *   WITHIN_TOLERANCE  — close delta <= tolerancePts100
 *   CLOSE_MISMATCH    — close delta > tolerancePts100 but <= 5x tolerance
 *   LARGE_MISMATCH    — close delta > 5x tolerance
 *   TV_ONLY           — TradingView bar received but no Databento bar within timeout
 *   DB_ONLY           — Databento bar received but no TradingView bar registered
 *
 * GATE G4 ACTIVATION THRESHOLDS (proposed)
 * -----------------------------------------
 *   Rolling 100-bar mismatch rate <= 2%  (i.e. >= 98% WITHIN_TOLERANCE or better)
 *   No LARGE_MISMATCH in last 100 bars
 *   No TV_ONLY or DB_ONLY in last 100 bars
 *   Minimum 200 bars compared
 *
 * Sprint 123A.4 — Gate G4
 */

import type { MinuteBar } from './types/bar-lifecycle.js';
import { BarLifecycle, ReconciliationStatus } from './types/bar-lifecycle.js';

// ─── Parity classification ────────────────────────────────────────────────────

export type ParityClassification =
  | 'EXACT_MATCH'
  | 'WITHIN_TOLERANCE'
  | 'CLOSE_MISMATCH'
  | 'LARGE_MISMATCH'
  | 'TV_ONLY'
  | 'DB_ONLY';

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
  classification: ParityClassification;
  tvClosePts100: number | null;
  dbClosePts100: number | null;
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
  classificationCounts: Record<ParityClassification, number>;
  rollingMismatchRate: number;
  /** Gate G4 activation readiness: true if all thresholds are met. */
  gate4Ready: boolean;
  /** Human-readable reason why gate4Ready is false, or null if ready. */
  gate4BlockReason: string | null;
}

// ─── Gate G4 thresholds ───────────────────────────────────────────────────────

export const GATE4_THRESHOLDS = {
  /** Minimum bars compared before gate can be considered. */
  minBarsCompared: 200,
  /** Maximum rolling mismatch rate (fraction). */
  maxRollingMismatchRate: 0.02,
  /** No LARGE_MISMATCH allowed in last 100 bars. */
  noLargeMismatch: true,
  /** No TV_ONLY or DB_ONLY allowed in last 100 bars. */
  noMissingBars: true,
} as const;

// ─── ParityService ────────────────────────────────────────────────────────────

const DEFAULT_TOLERANCE_PTS100 = 25;     // 0.25 points
const CLOSE_MISMATCH_MULTIPLIER = 5;     // > 5x tolerance = LARGE_MISMATCH
const ROLLING_WINDOW = 100;
const MAX_RECENT_RECORDS = 20;
const TV_TIMEOUT_MS = 10 * 60 * 1000;   // 10 minutes

export class ParityService {
  private readonly tolerancePts100: number;
  /** Pending TradingView bars awaiting Databento confirmation. */
  private readonly tvPending = new Map<number, TradingViewBarRecord>();
  /** Rolling window of parity results. */
  private readonly rollingResults: ParityRecord[] = [];
  private totalCompared = 0;
  private totalMismatches = 0;
  private sumCloseDelta = 0;
  private maxCloseDelta = 0;
  private lastComparedAt: number | null = null;
  private recentRecords: ParityRecord[] = [];
  private classificationCounts: Record<ParityClassification, number> = {
    EXACT_MATCH: 0,
    WITHIN_TOLERANCE: 0,
    CLOSE_MISMATCH: 0,
    LARGE_MISMATCH: 0,
    TV_ONLY: 0,
    DB_ONLY: 0,
  };

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
    // Evict old pending bars beyond timeout
    const cutoff = Date.now() - TV_TIMEOUT_MS;
    for (const [ts, b] of this.tvPending) {
      if (b.atlasTsMs < cutoff) {
        // TV_ONLY: bar timed out without a Databento match
        const record = this._makeTimeoutRecord(b);
        this._recordResult(record);
        this.tvPending.delete(ts);
      }
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

    if (!tvBar) {
      // DB_ONLY: Databento bar with no TradingView counterpart
      const record = this._makeDbOnlyRecord(dbBar);
      this._recordResult(record);
      return record;
    }

    this.tvPending.delete(dbBar.barOpenTsMs);

    const closeDelta = Math.abs(tvBar.closePts100 - dbBar.ohlcv.closePts100);
    const highDelta  = Math.abs(tvBar.highPts100  - dbBar.ohlcv.highPts100);
    const lowDelta   = Math.abs(tvBar.lowPts100   - dbBar.ohlcv.lowPts100);
    const volumeDelta = Math.abs(tvBar.volume - (dbBar.ohlcv.volume ?? 0));

    const classification = this._classify(closeDelta, tvBar, dbBar);
    const withinTolerance = closeDelta <= this.tolerancePts100;

    const record: ParityRecord = {
      barOpenTsMs: dbBar.barOpenTsMs,
      symbol: dbBar.rawSymbol,
      classification,
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

  /**
   * Process any TV bars that have timed out (no Databento match received).
   * Call periodically (e.g. every minute) to flush stale pending bars.
   */
  processTimeouts(): ParityRecord[] {
    const cutoff = Date.now() - TV_TIMEOUT_MS;
    const timedOut: ParityRecord[] = [];
    for (const [ts, b] of this.tvPending) {
      if (b.atlasTsMs < cutoff) {
        const record = this._makeTimeoutRecord(b);
        this._recordResult(record);
        timedOut.push(record);
        this.tvPending.delete(ts);
      }
    }
    return timedOut;
  }

  // ─── Metrics ───────────────────────────────────────────────────────────────

  getMetrics(): ParityMetrics {
    const mismatchRate = this.totalCompared > 0
      ? this.totalMismatches / this.totalCompared
      : 0;
    const avgCloseDelta = this.totalCompared > 0
      ? this.sumCloseDelta / this.totalCompared
      : 0;
    const rollingMismatchRate = this.getRollingMismatchRate();
    const { gate4Ready, gate4BlockReason } = this._checkGate4();

    return {
      totalCompared: this.totalCompared,
      totalMismatches: this.totalMismatches,
      mismatchRate,
      avgCloseDeltaPts100: avgCloseDelta,
      maxCloseDeltaPts100: this.maxCloseDelta,
      lastComparedAt: this.lastComparedAt,
      recentRecords: [...this.recentRecords],
      classificationCounts: { ...this.classificationCounts },
      rollingMismatchRate,
      gate4Ready,
      gate4BlockReason,
    };
  }

  getRollingMismatchRate(): number {
    if (this.rollingResults.length === 0) return 0;
    const mismatches = this.rollingResults.filter(r => !r.withinTolerance).length;
    return mismatches / this.rollingResults.length;
  }

  getPendingCount(): number {
    return this.tvPending.size;
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
    this.classificationCounts = {
      EXACT_MATCH: 0,
      WITHIN_TOLERANCE: 0,
      CLOSE_MISMATCH: 0,
      LARGE_MISMATCH: 0,
      TV_ONLY: 0,
      DB_ONLY: 0,
    };
  }

  // ─── Private ───────────────────────────────────────────────────────────────

  private _classify(
    closeDelta: number,
    tvBar: TradingViewBarRecord,
    dbBar: MinuteBar,
  ): ParityClassification {
    if (
      closeDelta === 0 &&
      Math.abs(tvBar.highPts100 - dbBar.ohlcv.highPts100) === 0 &&
      Math.abs(tvBar.lowPts100  - dbBar.ohlcv.lowPts100)  === 0 &&
      Math.abs(tvBar.volume     - (dbBar.ohlcv.volume ?? 0)) === 0
    ) {
      return 'EXACT_MATCH';
    }
    if (closeDelta <= this.tolerancePts100) return 'WITHIN_TOLERANCE';
    if (closeDelta <= this.tolerancePts100 * CLOSE_MISMATCH_MULTIPLIER) return 'CLOSE_MISMATCH';
    return 'LARGE_MISMATCH';
  }

  private _makeTimeoutRecord(tvBar: TradingViewBarRecord): ParityRecord {
    return {
      barOpenTsMs: tvBar.barOpenTsMs,
      symbol: tvBar.symbol,
      classification: 'TV_ONLY',
      tvClosePts100: tvBar.closePts100,
      dbClosePts100: null,
      closeDeltaPts100: 0,
      highDeltaPts100: 0,
      lowDeltaPts100: 0,
      volumeDelta: 0,
      withinTolerance: false,
      tolerancePts100: this.tolerancePts100,
      atlasTsMs: Date.now(),
    };
  }

  private _makeDbOnlyRecord(dbBar: MinuteBar): ParityRecord {
    return {
      barOpenTsMs: dbBar.barOpenTsMs,
      symbol: dbBar.rawSymbol,
      classification: 'DB_ONLY',
      tvClosePts100: null,
      dbClosePts100: dbBar.ohlcv.closePts100,
      closeDeltaPts100: 0,
      highDeltaPts100: 0,
      lowDeltaPts100: 0,
      volumeDelta: 0,
      withinTolerance: false,
      tolerancePts100: this.tolerancePts100,
      atlasTsMs: Date.now(),
    };
  }

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
    this.classificationCounts[record.classification]++;

    // Rolling window
    this.rollingResults.push(record);
    if (this.rollingResults.length > ROLLING_WINDOW) {
      this.rollingResults.shift();
    }

    // Recent records
    this.recentRecords.push(record);
    if (this.recentRecords.length > MAX_RECENT_RECORDS) {
      this.recentRecords.shift();
    }
  }

  private _checkGate4(): { gate4Ready: boolean; gate4BlockReason: string | null } {
    if (this.totalCompared < GATE4_THRESHOLDS.minBarsCompared) {
      return {
        gate4Ready: false,
        gate4BlockReason: `Insufficient bars: ${this.totalCompared} < ${GATE4_THRESHOLDS.minBarsCompared} required`,
      };
    }
    const rollingRate = this.getRollingMismatchRate();
    if (rollingRate > GATE4_THRESHOLDS.maxRollingMismatchRate) {
      return {
        gate4Ready: false,
        gate4BlockReason: `Rolling mismatch rate ${(rollingRate * 100).toFixed(1)}% exceeds threshold ${(GATE4_THRESHOLDS.maxRollingMismatchRate * 100).toFixed(1)}%`,
      };
    }
    const recentLargeMismatch = this.rollingResults.some(r => r.classification === 'LARGE_MISMATCH');
    if (recentLargeMismatch) {
      return {
        gate4Ready: false,
        gate4BlockReason: 'LARGE_MISMATCH detected in last 100 bars',
      };
    }
    const recentMissingBar = this.rollingResults.some(
      r => r.classification === 'TV_ONLY' || r.classification === 'DB_ONLY',
    );
    if (recentMissingBar) {
      return {
        gate4Ready: false,
        gate4BlockReason: 'TV_ONLY or DB_ONLY bars detected in last 100 bars',
      };
    }
    return { gate4Ready: true, gate4BlockReason: null };
  }
}
