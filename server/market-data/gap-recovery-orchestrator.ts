/**
 * gap-recovery-orchestrator.ts — End-to-End Gap Recovery Integration
 *
 * Connects the TypeScript bar construction pipeline to the Python recovery
 * subsystem. When a gap is detected by the TradeBarBuilder, this orchestrator:
 *
 *   1. Receives the `bar:gap-detected` event from TradeBarBuilder.
 *   2. Emits a `recovery:requested` event to the AtlasEventBus (consumed by
 *      the Python RecoveryManager via the bridge server).
 *   3. Listens for `recovery:progress`, `recovery:complete`, `recovery:partial`,
 *      and `recovery:failed` events from the bridge server.
 *   4. Re-injects recovered bars into the TradeBarBuilder as official ohlcv-1m
 *      records so they flow through the normal reconciliation path.
 *   5. Notifies the FiveMinAggregator that blocked windows may now be unblocked.
 *
 * AUTHORITY NOTE: This module is parity-data preparation only.
 * TradingView remains the production processBar and postBarAutomation trigger.
 * MARKET_DATA_AUTHORITY = TRADINGVIEW_ONLY throughout Sprint 123A.3.
 *
 * Sprint 123A.3 — Gate G3 Revision 2
 */

import { EventEmitter } from 'events';
import { BarGap, RecoveryResult, MinuteBar, BarLifecycle } from './types/bar-lifecycle.js';
import { BridgeOhlcv1mPayload } from './trade-bar-builder.js';

// ─── Recovery Request / Response Types ───────────────────────────────────────

/**
 * Emitted to the bridge server to trigger Python-side recovery.
 */
export interface RecoveryRequest {
  recoveryId: string;
  gap: BarGap;
  requestedTsMs: number;
}

/**
 * Received from the bridge server when a recovery record arrives.
 */
export interface RecoveryRecord {
  recoveryId: string;
  schema: 'ohlcv-1m';
  dataset: string;
  raw_symbol: string;
  instrument_id: number;
  ts_event_ns: string;
  open_pts100: number;
  high_pts100: number;
  low_pts100: number;
  close_pts100: number;
  volume: number;
  trade_count?: number;
  atlas_processing_ts_ms: number;
}

/**
 * Received from the bridge server when a recovery completes.
 */
export interface RecoveryCompletion {
  recoveryId: string;
  status: 'COMPLETE' | 'PARTIAL' | 'FAILED';
  recoveredCount: number;
  failureReason?: string;
  completedTsMs: number;
}

// ─── Orchestrator Events ──────────────────────────────────────────────────────

export type OrchestratorEvent =
  | { type: 'recovery:requested'; request: RecoveryRequest }
  | { type: 'recovery:progress'; recoveryId: string; recoveredCount: number }
  | { type: 'recovery:complete'; result: RecoveryResult }
  | { type: 'recovery:partial'; result: RecoveryResult }
  | { type: 'recovery:failed'; result: RecoveryResult };

// ─── Active Recovery State ────────────────────────────────────────────────────

interface ActiveRecovery {
  recoveryId: string;
  gap: BarGap;
  requestedTsMs: number;
  recoveredBars: MinuteBar[];
  status: 'IN_PROGRESS' | 'COMPLETE' | 'PARTIAL' | 'FAILED';
}

// ─── GapRecoveryOrchestrator ──────────────────────────────────────────────────

/**
 * Orchestrates end-to-end gap recovery between the TypeScript bar pipeline
 * and the Python RecoveryManager.
 *
 * Usage:
 *   const orchestrator = new GapRecoveryOrchestrator({ onRecoveredBar, onRecoveryComplete });
 *   tradeBarBuilder.on('bar:gap-detected', (e) => orchestrator.onGapDetected(e.gap));
 *   bridgeServer.on('recovery:record', (r) => orchestrator.onRecoveryRecord(r));
 *   bridgeServer.on('recovery:completion', (c) => orchestrator.onRecoveryCompletion(c));
 */
export class GapRecoveryOrchestrator extends EventEmitter {
  /** Active recoveries keyed by recoveryId. */
  private readonly activeRecoveries = new Map<string, ActiveRecovery>();

  /** Gaps that are currently being recovered (keyed by gapKey). */
  private readonly pendingGapKeys = new Set<string>();

  /** Total recovery requests issued. */
  private recoveryRequestCount = 0;

  /** Total successful recoveries (COMPLETE). */
  private recoveryCompleteCount = 0;

  /** Total partial recoveries. */
  private recoveryPartialCount = 0;

  /** Total failed recoveries. */
  private recoveryFailedCount = 0;

  /**
   * Callback invoked for each recovered bar.
   * The caller should inject this bar into the TradeBarBuilder as an official record.
   */
  private readonly onRecoveredBar: (payload: BridgeOhlcv1mPayload) => void;

  /**
   * Callback invoked when a recovery window is complete (COMPLETE or PARTIAL).
   * The caller should notify the FiveMinAggregator to reconsider blocked windows.
   */
  private readonly onRecoveryComplete: (result: RecoveryResult) => void;

  constructor(callbacks: {
    onRecoveredBar: (payload: BridgeOhlcv1mPayload) => void;
    onRecoveryComplete: (result: RecoveryResult) => void;
  }) {
    super();
    this.onRecoveredBar = callbacks.onRecoveredBar;
    this.onRecoveryComplete = callbacks.onRecoveryComplete;
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * Handle a gap detected by the TradeBarBuilder.
   *
   * Generates a recovery request and emits `recovery:requested`.
   * Duplicate gap requests for the same time range are suppressed.
   */
  onGapDetected(gap: BarGap): RecoveryRequest | null {
    const gapKey = this._gapKey(gap);

    // Suppress duplicate recovery requests for the same gap
    if (this.pendingGapKeys.has(gapKey)) {
      return null;
    }

    const recoveryId = this._generateRecoveryId(gap);
    const request: RecoveryRequest = {
      recoveryId,
      gap,
      requestedTsMs: Date.now(),
    };

    const activeRecovery: ActiveRecovery = {
      recoveryId,
      gap,
      requestedTsMs: request.requestedTsMs,
      recoveredBars: [],
      status: 'IN_PROGRESS',
    };

    this.activeRecoveries.set(recoveryId, activeRecovery);
    this.pendingGapKeys.add(gapKey);
    this.recoveryRequestCount++;

    this._emit({ type: 'recovery:requested', request });
    return request;
  }

  /**
   * Handle a recovered bar record from the bridge server.
   *
   * Converts the recovery record to a BridgeOhlcv1mPayload and injects it
   * into the TradeBarBuilder via the onRecoveredBar callback.
   */
  onRecoveryRecord(record: RecoveryRecord): void {
    const recovery = this.activeRecoveries.get(record.recoveryId);
    if (!recovery) return;
    if (recovery.status !== 'IN_PROGRESS') return;

    const payload: BridgeOhlcv1mPayload = {
      schema: 'ohlcv-1m',
      dataset: record.dataset,
      raw_symbol: record.raw_symbol,
      instrument_id: record.instrument_id,
      ts_event_ns: record.ts_event_ns,
      ts_recv_ns: String(BigInt(record.atlas_processing_ts_ms) * 1_000_000n),
      open_pts100: record.open_pts100,
      high_pts100: record.high_pts100,
      low_pts100: record.low_pts100,
      close_pts100: record.close_pts100,
      volume: record.volume,
      trade_count: record.trade_count,
      atlas_processing_ts_ms: record.atlas_processing_ts_ms,
    };

    // Inject into the bar pipeline
    this.onRecoveredBar(payload);

    // Track for the result
    const bar: MinuteBar = {
      source: 'DATABENTO',
      dataset: record.dataset,
      rawSymbol: record.raw_symbol,
      instrumentId: record.instrument_id,
      intervalMs: 60000,
      barOpenTsMs: Number(BigInt(record.ts_event_ns) / 1_000_000n),
      barOpenTsNs: record.ts_event_ns,
      barCloseTsMs: Number(BigInt(record.ts_event_ns) / 1_000_000n) + 60_000,
      ohlcv: {
        openPts100: record.open_pts100,
        highPts100: record.high_pts100,
        lowPts100: record.low_pts100,
        closePts100: record.close_pts100,
        volume: record.volume,
        tradeCount: record.trade_count ?? 0,
      },
      lifecycle: BarLifecycle.CONFIRMED,
      reconciliation: null,
      revision: 0,
      mappingVersion: 'v1',
      atlasTsMs: record.atlas_processing_ts_ms,
    };

    recovery.recoveredBars.push(bar);

    this._emit({
      type: 'recovery:progress',
      recoveryId: record.recoveryId,
      recoveredCount: recovery.recoveredBars.length,
    });
  }

  /**
   * Handle a recovery completion event from the bridge server.
   *
   * Updates the active recovery state and invokes the onRecoveryComplete callback.
   */
  onRecoveryCompletion(completion: RecoveryCompletion): void {
    const recovery = this.activeRecoveries.get(completion.recoveryId);
    if (!recovery) return;

    recovery.status = completion.status;

    const result: RecoveryResult = {
      gap: recovery.gap,
      recoveredBars: recovery.recoveredBars,
      status: completion.status,
      recoveredCount: completion.recoveredCount,
      failureReason: completion.failureReason,
      completedTsMs: completion.completedTsMs,
    };

    // Remove from pending gap keys
    this.pendingGapKeys.delete(this._gapKey(recovery.gap));

    // Update counters
    if (completion.status === 'COMPLETE') {
      this.recoveryCompleteCount++;
      this._emit({ type: 'recovery:complete', result });
    } else if (completion.status === 'PARTIAL') {
      this.recoveryPartialCount++;
      this._emit({ type: 'recovery:partial', result });
    } else {
      this.recoveryFailedCount++;
      this._emit({ type: 'recovery:failed', result });
    }

    // Notify FiveMinAggregator for COMPLETE and PARTIAL (not FAILED)
    if (completion.status !== 'FAILED') {
      this.onRecoveryComplete(result);
    }

    // Clean up
    this.activeRecoveries.delete(completion.recoveryId);
  }

  // ─── Accessors (for testing) ─────────────────────────────────────────────────

  getActiveRecoveries(): ReadonlyMap<string, ActiveRecovery> {
    return this.activeRecoveries;
  }

  getPendingGapKeys(): ReadonlySet<string> {
    return this.pendingGapKeys;
  }

  getRecoveryRequestCount(): number { return this.recoveryRequestCount; }
  getRecoveryCompleteCount(): number { return this.recoveryCompleteCount; }
  getRecoveryPartialCount(): number { return this.recoveryPartialCount; }
  getRecoveryFailedCount(): number { return this.recoveryFailedCount; }

  // ─── Private helpers ─────────────────────────────────────────────────────────

  private _gapKey(gap: BarGap): string {
    return `${gap.dataset}:${gap.rawSymbol}:${gap.gapStartTsMs}:${gap.gapEndTsMs}`;
  }

  private _generateRecoveryId(gap: BarGap): string {
    return `REC-${gap.dataset}-${gap.rawSymbol}-${gap.gapStartTsMs}-${Date.now()}`;
  }

  private _emit(event: OrchestratorEvent): void {
    this.emit(event.type, event);
  }
}
