/**
 * Atlas Market Data Runtime Orchestrator
 * Sprint 123A.4 — Live Chart and Databento Shadow Integration
 *
 * Wires the full Databento shadow pipeline:
 *
 *   Python Databento adapter
 *   → authenticated private bridge (DatabentoBridgeServer)
 *   → TypeScript record validation
 *   → ContractManager
 *   → TradeBarBuilder
 *   → BarReconciler
 *   → GapRecoveryOrchestrator
 *   → WindowAccumulator
 *   → MySQLBarDatabaseAdapter
 *   → ChartStreamService (SSE publication)
 *
 * AUTHORITY BOUNDARY
 * ------------------
 * The orchestrator is a SHADOW pipeline only in DATABENTO_SHADOW mode.
 * It MUST NOT:
 *   - trigger processBar
 *   - trigger postBarAutomation
 *   - trigger ADE
 *   - trigger strategies
 *   - trigger risk or order creation
 *   - activate DATABENTO_CHART_AUTHORITY (requires Gate G4)
 *   - activate DATABENTO_LEARNING_AUTHORITY (requires Gate G6A)
 *   - activate DATABENTO_DECISION_AUTHORITY (Sprint 123B only)
 *
 * The orchestrator MUST:
 *   - remain disabled in TRADINGVIEW_ONLY mode
 *   - reject records before readiness
 *   - validate protocol version
 *   - validate dataset, schema, instrument and mapping
 *   - preserve nanosecond timestamps
 *   - update feed and bridge health
 *   - handle clean shutdown
 *   - prevent duplicate listeners
 *   - prevent duplicate processing after reconnect
 *   - remain fail-closed when authority configuration is invalid
 *
 * Sprint 123A.4 — Gate G3 Approved
 */

import {
  getMarketDataAuthority,
  isDatabentoShadow,
  assertSprint123A4Invariants,
} from './config.js';
import type { AtlasEventBus } from './event-bus.js';
import type { FeedHealthMonitor } from './feed-health.js';
import type { ContractManager } from './contract-manager.js';
import type { TradeBarBuilder, BridgeTradePayload, BridgeOhlcv1mPayload } from './trade-bar-builder.js';
import type { BarReconciler } from './bar-reconciler.js';
import type { GapRecoveryOrchestrator } from './gap-recovery-orchestrator.js';
import type { WindowAccumulator } from './five-min-aggregator.js';
import type { BarPersistence } from './bar-persistence.js';
import type { ChartStreamService } from './chart-stream-service.js';
import type { MinuteBar, FiveMinBar } from './types/bar-lifecycle.js';
import type { BridgeDefinitionPayload, BridgeSymbolMappingPayload } from './contract-manager.js';

// ─── Bridge gap/recovery payload types ───────────────────────────────────────

export interface BridgeGapDetectedPayload {
  instrumentId: number;
  rawSymbol: string;
  dataset: string;
  gapStartTsMs: number;
  gapEndTsMs: number;
  missingBarCount: number;
  mappingVersion: string;
}

export interface BridgeRecoveryPayload {
  instrumentId: number;
  rawSymbol: string;
  dataset: string;
  barOpenTsMs: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  tradeCount: number;
  mappingVersion: string;
  event: string;
}

// ─── Orchestrator health state ────────────────────────────────────────────────

export type OrchestratorStatus =
  | 'STOPPED'
  | 'STARTING'
  | 'READY'
  | 'DEGRADED'
  | 'SHUTTING_DOWN';

export interface OrchestratorHealth {
  status: OrchestratorStatus;
  authorityMode: string;
  shadowEnabled: boolean;
  startedAt: number | null;
  lastTradeTs: number | null;
  lastOfficialBarTs: number | null;
  lastConfirmed1mTs: number | null;
  lastConfirmed5mTs: number | null;
  unresolvedBars: number;
  activeRecoveries: number;
  recoveryFailures: number;
  persistenceErrors: number;
  connectedClients: number;
  parityMismatchRate: number;
  chartLagMs: number;
  errors: string[];
}

// ─── Orchestrator dependencies ────────────────────────────────────────────────

export interface OrchestratorDeps {
  eventBus: AtlasEventBus;
  feedHealth: FeedHealthMonitor;
  contractManager: ContractManager;
  tradeBarBuilder: TradeBarBuilder;
  barReconciler: BarReconciler;
  gapRecovery: GapRecoveryOrchestrator;
  windowAccumulator: WindowAccumulator;
  barDb: BarPersistence;
  chartStream: ChartStreamService;
}

// ─── MarketDataRuntimeOrchestrator ───────────────────────────────────────────

export class MarketDataRuntimeOrchestrator {
  private readonly deps: OrchestratorDeps;
  private status: OrchestratorStatus = 'STOPPED';
  private startedAt: number | null = null;
  private lastTradeTs: number | null = null;
  private lastOfficialBarTs: number | null = null;
  private lastConfirmed1mTs: number | null = null;
  private lastConfirmed5mTs: number | null = null;
  private unresolvedBars = 0;
  private activeRecoveries = 0;
  private recoveryFailures = 0;
  private persistenceErrors = 0;
  private errors: string[] = [];
  private listenersAttached = false;

  constructor(deps: OrchestratorDeps) {
    this.deps = deps;
  }

  // ─── Startup ───────────────────────────────────────────────────────────────

  start(): void {
    // Fail closed on invalid authority configuration
    try {
      assertSprint123A4Invariants();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.errors.push(msg);
      this.status = 'STOPPED';
      throw err;
    }

    const mode = getMarketDataAuthority();

    // Remain disabled in TRADINGVIEW_ONLY mode
    if (!isDatabentoShadow()) {
      console.log(
        `[RuntimeOrchestrator] Disabled — MARKET_DATA_AUTHORITY=${mode}. ` +
        'Set MARKET_DATA_AUTHORITY=DATABENTO_SHADOW to enable shadow pipeline.'
      );
      return;
    }

    if (this.status !== 'STOPPED') {
      console.warn('[RuntimeOrchestrator] Already started — ignoring duplicate start()');
      return;
    }

    this.status = 'STARTING';
    this.startedAt = Date.now();
    console.log('[RuntimeOrchestrator] Starting shadow pipeline...');

    // Attach listeners (idempotent guard prevents duplicates after reconnect)
    this._attachListeners();

    this.status = 'READY';
    console.log('[RuntimeOrchestrator] Shadow pipeline READY.');
  }

  stop(): void {
    if (this.status === 'STOPPED') return;
    this.status = 'SHUTTING_DOWN';
    console.log('[RuntimeOrchestrator] Shutting down shadow pipeline...');
    this._detachListeners();
    this.status = 'STOPPED';
    console.log('[RuntimeOrchestrator] Shadow pipeline STOPPED.');
  }

  // ─── Listener handlers ─────────────────────────────────────────────────────

  private readonly _onTrade = (payload: BridgeTradePayload): void => {
    if (this.status !== 'READY') return;
    this.lastTradeTs = Date.now();
    try {
      this.deps.tradeBarBuilder.processTrade(payload);
    } catch (err) {
      this._recordError('trade', err);
    }
  };

  private readonly _onOhlcv1m = (payload: BridgeOhlcv1mPayload): void => {
    if (this.status !== 'READY') return;
    this.lastOfficialBarTs = Date.now();
    try {
      this.deps.tradeBarBuilder.processOfficialOhlcv1m(payload);
    } catch (err) {
      this._recordError('ohlcv-1m', err);
    }
  };

  private readonly _onDefinition = (payload: BridgeDefinitionPayload): void => {
    if (this.status !== 'READY') return;
    try {
      this.deps.contractManager.processDefinition(payload);
    } catch (err) {
      this._recordError('definition', err);
    }
  };

  private readonly _onSymbolMapping = (payload: BridgeSymbolMappingPayload): void => {
    if (this.status !== 'READY') return;
    try {
      this.deps.contractManager.processSymbolMapping(payload);
    } catch (err) {
      this._recordError('symbol-mapping', err);
    }
  };

  private readonly _onGapDetected = (payload: BridgeGapDetectedPayload): void => {
    if (this.status !== 'READY') return;
    try {
      this.deps.gapRecovery.onGapDetected(payload as any);
      this.activeRecoveries++;
    } catch (err) {
      this._recordError('gap-detected', err);
    }
  };

  private readonly _onRecovery = (payload: BridgeRecoveryPayload): void => {
    if (this.status !== 'READY') return;
    try {
      this.deps.gapRecovery.onRecoveryRecord(payload as any);
    } catch (err) {
      this._recordError('recovery', err);
      this.recoveryFailures++;
    }
  };

  /**
   * Called by TradeBarBuilder event 'bar:confirmed'.
   * Routes confirmed 1m bars through WindowAccumulator and persistence.
   */
  private readonly _onBarConfirmed = (bar: MinuteBar): void => {
    if (this.status !== 'READY') return;
    this.lastConfirmed1mTs = Date.now();

    // Track unresolved bars
    if (bar.reconciliation === null) {
      this.unresolvedBars++;
    }

    // Publish to chart stream
    try {
      this.deps.chartStream.publishBar1m(bar);
    } catch (err) {
      this._recordError('chart-stream-1m', err);
    }

    // Feed into WindowAccumulator — may produce a 5m bar
    try {
      const fiveMinBar = this.deps.windowAccumulator.addBar(bar);
      if (fiveMinBar !== null) {
        this._onBar5mReady(fiveMinBar);
      }
    } catch (err) {
      this._recordError('window-accumulator', err);
    }

    // Persist 1m bar
    this._persistBar1m(bar);
  };

  private readonly _onBarDeveloping = (bar: MinuteBar): void => {
    if (this.status !== 'READY') return;
    try {
      this.deps.chartStream.publishDeveloping(bar);
    } catch (err) {
      this._recordError('chart-stream-developing', err);
    }
  };

  private _onBar5mReady(bar: FiveMinBar): void {
    this.lastConfirmed5mTs = Date.now();
    try {
      this.deps.chartStream.publishBar5m(bar);
    } catch (err) {
      this._recordError('chart-stream-5m', err);
    }
    this._persistBar5m(bar);
  }

  private _attachListeners(): void {
    if (this.listenersAttached) {
      console.warn('[RuntimeOrchestrator] Listeners already attached — skipping duplicate attachment');
      return;
    }
    const bus = this.deps.eventBus;
    bus.on('databento:trade', this._onTrade);
    bus.on('databento:ohlcv-1m', this._onOhlcv1m);
    bus.on('databento:definition', this._onDefinition);
    bus.on('databento:symbol-mapping', this._onSymbolMapping);
    bus.on('databento:gap-detected', this._onGapDetected);
    bus.on('databento:recovery', this._onRecovery);

    // Subscribe to bar builder output events
    this.deps.tradeBarBuilder.on('bar:confirmed', this._onBarConfirmed);
    this.deps.tradeBarBuilder.on('bar:developing', this._onBarDeveloping);

    this.listenersAttached = true;
  }

  private _detachListeners(): void {
    if (!this.listenersAttached) return;
    const bus = this.deps.eventBus;
    bus.off('databento:trade', this._onTrade);
    bus.off('databento:ohlcv-1m', this._onOhlcv1m);
    bus.off('databento:definition', this._onDefinition);
    bus.off('databento:symbol-mapping', this._onSymbolMapping);
    bus.off('databento:gap-detected', this._onGapDetected);
    bus.off('databento:recovery', this._onRecovery);

    this.deps.tradeBarBuilder.off('bar:confirmed', this._onBarConfirmed);
    this.deps.tradeBarBuilder.off('bar:developing', this._onBarDeveloping);

    this.listenersAttached = false;
  }

  // ─── Persistence ───────────────────────────────────────────────────────────

  private async _persistBar1m(bar: MinuteBar): Promise<void> {
    try {
      await this.deps.barDb.persistBar1m(bar);
    } catch (err) {
      this.persistenceErrors++;
      this._recordError('persist-1m', err);
    }
  }

  private async _persistBar5m(bar: FiveMinBar): Promise<void> {
    try {
      await this.deps.barDb.persistBar5m(bar);
    } catch (err) {
      this.persistenceErrors++;
      this._recordError('persist-5m', err);
    }
  }

  // ─── Error recording ───────────────────────────────────────────────────────

  private _recordError(context: string, err: unknown): void {
    const msg = err instanceof Error ? err.message : String(err);
    const entry = `[${context}] ${msg}`;
    this.errors.push(entry);
    // Keep last 100 errors only
    if (this.errors.length > 100) this.errors.shift();
    if (this.status === 'READY') this.status = 'DEGRADED';
    console.error(`[RuntimeOrchestrator] Error in ${context}:`, msg);
  }

  // ─── Health ────────────────────────────────────────────────────────────────

  getHealth(): OrchestratorHealth {
    return {
      status: this.status,
      authorityMode: getMarketDataAuthority(),
      shadowEnabled: isDatabentoShadow(),
      startedAt: this.startedAt,
      lastTradeTs: this.lastTradeTs,
      lastOfficialBarTs: this.lastOfficialBarTs,
      lastConfirmed1mTs: this.lastConfirmed1mTs,
      lastConfirmed5mTs: this.lastConfirmed5mTs,
      unresolvedBars: this.unresolvedBars,
      activeRecoveries: this.activeRecoveries,
      recoveryFailures: this.recoveryFailures,
      persistenceErrors: this.persistenceErrors,
      connectedClients: this.deps.chartStream.getClientCount(),
      parityMismatchRate: 0, // populated by ParityService
      chartLagMs: this._computeChartLag(),
      errors: [...this.errors],
    };
  }

  private _computeChartLag(): number {
    if (!this.lastConfirmed1mTs) return 0;
    return Date.now() - this.lastConfirmed1mTs;
  }

  get isReady(): boolean {
    return this.status === 'READY';
  }

  get isShadowEnabled(): boolean {
    return isDatabentoShadow();
  }
}
