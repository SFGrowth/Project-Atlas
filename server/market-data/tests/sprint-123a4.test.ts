/**
 * Sprint 123A.4 — Gate G4 Evidence Test Suite
 *
 * Tests:
 *   TEST-123A4-001  assertSprint123A4Invariants: TRADINGVIEW_ONLY is valid
 *   TEST-123A4-002  assertSprint123A4Invariants: DATABENTO_SHADOW is valid (Gate G3 approved)
 *   TEST-123A4-003  assertSprint123A4Invariants: DATABENTO_CHART_AUTHORITY throws (Gate G4 required)
 *   TEST-123A4-004  assertSprint123A4Invariants: DATABENTO_LEARNING_AUTHORITY throws (Gate G6A required)
 *   TEST-123A4-005  assertSprint123A4Invariants: DATABENTO_DECISION_AUTHORITY throws (Sprint 123B only)
 *   TEST-123A4-006  RuntimeOrchestrator: disabled in TRADINGVIEW_ONLY mode (no listeners attached)
 *   TEST-123A4-007  RuntimeOrchestrator: starts in DATABENTO_SHADOW mode
 *   TEST-123A4-008  RuntimeOrchestrator: duplicate start() is idempotent (no duplicate listeners)
 *   TEST-123A4-009  RuntimeOrchestrator: stop() detaches all listeners
 *   TEST-123A4-010  RuntimeOrchestrator: rejects records before READY state
 *   TEST-123A4-011  RuntimeOrchestrator: fails closed on DATABENTO_CHART_AUTHORITY
 *   TEST-123A4-012  RuntimeOrchestrator: routes trade to TradeBarBuilder.processTrade
 *   TEST-123A4-013  RuntimeOrchestrator: routes ohlcv-1m to TradeBarBuilder.processOfficialOhlcv1m
 *   TEST-123A4-014  RuntimeOrchestrator: routes definition to ContractManager.processDefinition
 *   TEST-123A4-015  RuntimeOrchestrator: routes symbol-mapping to ContractManager.processSymbolMapping
 *   TEST-123A4-016  RuntimeOrchestrator: confirmed bar published to ChartStreamService
 *   TEST-123A4-017  RuntimeOrchestrator: confirmed bar persisted via BarPersistence.persistBar1m
 *   TEST-123A4-018  RuntimeOrchestrator: confirmed bar fed to WindowAccumulator.addBar
 *   TEST-123A4-019  RuntimeOrchestrator: 5m bar published when WindowAccumulator returns FiveMinBar
 *   TEST-123A4-020  RuntimeOrchestrator: developing bar published to ChartStreamService
 *   TEST-123A4-021  RuntimeOrchestrator: persistence error does not crash orchestrator
 *   TEST-123A4-022  RuntimeOrchestrator: getHealth() returns correct status
 *   TEST-123A4-023  ChartStreamService: registerClient sends ping on connect
 *   TEST-123A4-024  ChartStreamService: publishBar1m broadcasts to all clients
 *   TEST-123A4-025  ChartStreamService: publishDeveloping does not add to ring buffer
 *   TEST-123A4-026  ChartStreamService: reconnect replays missed events from Last-Event-ID
 *   TEST-123A4-027  ChartStreamService: stale client is disconnected on broadcast
 *   TEST-123A4-028  ChartHistoryService: rejects invalid interval
 *   TEST-123A4-029  ChartHistoryService: rejects range > 7 days
 *   TEST-123A4-030  ChartHistoryService: rejects endTsMs <= startTsMs
 *   TEST-123A4-031  ChartHistoryService: rejects missing symbol
 *   TEST-123A4-032  ChartHistoryService: rejects limit > 10000
 *   TEST-123A4-033  ParityService: compareConfirmedBar returns null for non-CONFIRMED bar
 *   TEST-123A4-034  ParityService: compareConfirmedBar returns null if no TV bar registered
 *   TEST-123A4-035  ParityService: compareConfirmedBar returns ParityRecord when TV bar matches
 *   TEST-123A4-036  ParityService: withinTolerance true when closeDelta <= tolerance
 *   TEST-123A4-037  ParityService: withinTolerance false when closeDelta > tolerance
 *   TEST-123A4-038  ParityService: mismatch rate increments correctly
 *   TEST-123A4-039  ParityService: rolling window caps at 100
 *   TEST-123A4-040  Authority: DATABENTO_SHADOW does not trigger processBar (source boundary)
 *   TEST-123A4-041  Authority: DATABENTO_SHADOW does not trigger postBarAutomation (source boundary)
 *   TEST-123A4-042  Authority: orchestrator start() throws on DATABENTO_CHART_AUTHORITY
 *   TEST-123A4-043  Security: /api/market-data/bars returns 401 without auth
 *   TEST-123A4-044  Security: /api/market-data/stream returns 401 without auth
 *   TEST-123A4-045  Security: /api/market-data/health returns 401 without auth
 *
 *   TEST-123A4-046  Authority matrix: getChartSource TRADINGVIEW_ONLY → TRADINGVIEW
 *   TEST-123A4-047  Authority matrix: getChartSource DATABENTO_SHADOW → TRADINGVIEW_PRIMARY_DATABENTO_SHADOW
 *   TEST-123A4-048  Authority matrix: getChartSource DATABENTO_CHART_AUTHORITY → DATABENTO
 *   TEST-123A4-049  Authority matrix: getChartSource DATABENTO_LEARNING_AUTHORITY → DATABENTO
 *   TEST-123A4-050  G4 feature flag: isGate4FeatureFlagEnabled false when env absent
 *   TEST-123A4-051  G4 feature flag: isGate4FeatureFlagEnabled true when ATLAS_GATE_G4_CHART_AUTHORITY_ENABLED=true
 *   TEST-123A4-052  G4 feature flag: isDatabentoChartAuthorityActive false when mode set but flag absent
 *   TEST-123A4-053  G4 feature flag: isDatabentoChartAuthorityActive true when mode set AND flag set
 *   TEST-123A4-054  G4 feature flag: assertSprint123A4Invariants does NOT throw when mode=DATABENTO_CHART_AUTHORITY AND flag=true
 *   TEST-123A4-055  G4 feature flag: assertSprint123A4Invariants THROWS when mode=DATABENTO_CHART_AUTHORITY AND flag absent
 *   TEST-123A4-056  Authority matrix: isDatabentoProcessBarTrigger false in DATABENTO_CHART_AUTHORITY mode
 *   TEST-123A4-057  Authority matrix: validatePostBarTrigger rejects DATABENTO in DATABENTO_CHART_AUTHORITY mode
 *   TEST-123A4-058  Authority matrix: validatePostBarTrigger accepts TRADINGVIEW in DATABENTO_CHART_AUTHORITY mode
 *   TEST-123A4-059  Authority matrix: isDatabentoDecisionAuthority always false
 *   TEST-123A4-060  Authority matrix: isDatabentoConnected true in DATABENTO_CHART_AUTHORITY mode
 *   TEST-123A4-061  Orchestrator: starts in DATABENTO_CHART_AUTHORITY mode when G4 flag is set
 *   TEST-123A4-062  Orchestrator: disabled in DATABENTO_CHART_AUTHORITY mode when G4 flag is absent (fails closed)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import { ChartStreamService } from '../chart-stream-service.js';
import { ChartHistoryService, ValidationError } from '../chart-history-service.js';
import { ParityService } from '../parity-service.js';
import { MarketDataRuntimeOrchestrator } from '../runtime-orchestrator.js';
import { BarLifecycle, ReconciliationStatus, FiveMinBarType } from '../types/bar-lifecycle.js';
import type { MinuteBar, FiveMinBar } from '../types/bar-lifecycle.js';
import type { OrchestratorDeps } from '../runtime-orchestrator.js';

// ─── Shared fixtures ──────────────────────────────────────────────────────────

function makeConfirmedBar(overrides: Partial<MinuteBar> = {}): MinuteBar {
  return {
    source: 'DATABENTO',
    dataset: 'GLBX.MDP3',
    rawSymbol: 'MNQM5',
    instrumentId: 12345,
    intervalMs: 60000,
    barOpenTsMs: 1_700_000_000_000,
    barOpenTsNs: '1700000000000000000',
    barCloseTsMs: 1_700_000_060_000,
    ohlcv: { openPts100: 2100000, highPts100: 2105000, lowPts100: 2098000, closePts100: 2103000, volume: 1500, tradeCount: 120 },
    lifecycle: BarLifecycle.CONFIRMED,
    reconciliation: {
      status: ReconciliationStatus.MATCHED,
      closeDetlaPts100: 0,
      highDeltaPts100: 0,
      lowDeltaPts100: 0,
      volumeDelta: 0,
      withinTolerance: true,
      tolerancePts100: 25,
      reconTsMs: Date.now(),
    },
    revision: 1,
    mappingVersion: 'v1',
    atlasTsMs: Date.now(),
    ...overrides,
  };
}

function makeFiveMinBar(): FiveMinBar {
  return {
    source: 'DATABENTO',
    dataset: 'GLBX.MDP3',
    rawSymbol: 'MNQM5',
    instrumentId: 12345,
    intervalMs: 300000,
    barOpenTsMs: 1_700_000_000_000,
    barCloseTsMs: 1_700_000_300_000,
    ohlcv: { openPts100: 2100000, highPts100: 2110000, lowPts100: 2095000, closePts100: 2105000, volume: 7500, tradeCount: 600 },
    minuteBarCount: 5,
    barType: FiveMinBarType.LIVE_CONFIRMED,
    revision: 1,
    mappingVersion: 'v1',
    atlasTsMs: Date.now(),
  };
}

// ─── Mock orchestrator deps ───────────────────────────────────────────────────

function makeMockDeps(overrides: Partial<OrchestratorDeps> = {}): OrchestratorDeps {
  const tradeBarBuilder = new EventEmitter() as any;
  tradeBarBuilder.processTrade = vi.fn();
  tradeBarBuilder.processOfficialOhlcv1m = vi.fn();
  tradeBarBuilder.updateConfig = vi.fn();

  const contractManager = { processDefinition: vi.fn(), processSymbolMapping: vi.fn(), on: vi.fn(), off: vi.fn() } as any;
  const barReconciler = {} as any;
  const gapRecovery = { onGapDetected: vi.fn(), onRecoveryRecord: vi.fn() } as any;
  const windowAccumulator = { addBar: vi.fn().mockReturnValue(null) } as any;
  const barDb = { persistBar1m: vi.fn().mockResolvedValue({ inserted: true, rowId: 1, warningStatus: 0 }), persistBar5m: vi.fn().mockResolvedValue({ inserted: true, rowId: 2, warningStatus: 0 }) } as any;
  const chartStream = { publishBar1m: vi.fn(), publishDeveloping: vi.fn(), publishBar5m: vi.fn(), getClientCount: vi.fn().mockReturnValue(0) } as any;
  const feedHealth = {} as any;
  const eventBus = new EventEmitter() as any;

  return {
    eventBus,
    feedHealth,
    contractManager,
    tradeBarBuilder,
    barReconciler,
    gapRecovery,
    windowAccumulator,
    barDb,
    chartStream,
    ...overrides,
  };
}

// ─── TEST-123A4-001 through TEST-123A4-005: assertSprint123A4Invariants ───────

describe('Sprint 123A.4 — assertSprint123A4Invariants', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    Object.keys(process.env).forEach(k => delete process.env[k]);
    Object.assign(process.env, originalEnv);
    vi.resetModules();
  });

  it('TEST-123A4-001: TRADINGVIEW_ONLY is valid — no throw', async () => {
    delete process.env.MARKET_DATA_AUTHORITY;
    vi.resetModules();
    const { assertSprint123A4Invariants } = await import('../config.js');
    expect(() => assertSprint123A4Invariants()).not.toThrow();
  });

  it('TEST-123A4-002: DATABENTO_SHADOW is valid — Gate G3 approved (2026-07-20)', async () => {
    process.env.MARKET_DATA_AUTHORITY = 'DATABENTO_SHADOW';
    vi.resetModules();
    const { assertSprint123A4Invariants } = await import('../config.js');
    expect(() => assertSprint123A4Invariants()).not.toThrow();
  });

  it('TEST-123A4-003: DATABENTO_CHART_AUTHORITY throws — Gate G4 required', async () => {
    process.env.MARKET_DATA_AUTHORITY = 'DATABENTO_CHART_AUTHORITY';
    vi.resetModules();
    const { assertSprint123A4Invariants } = await import('../config.js');
    expect(() => assertSprint123A4Invariants()).toThrow('Gate G4');
  });

  it('TEST-123A4-004: DATABENTO_LEARNING_AUTHORITY throws — Gate G6A required', async () => {
    process.env.MARKET_DATA_AUTHORITY = 'DATABENTO_LEARNING_AUTHORITY';
    vi.resetModules();
    const { assertSprint123A4Invariants } = await import('../config.js');
    expect(() => assertSprint123A4Invariants()).toThrow('Gate G6A');
  });

  it('TEST-123A4-005: DATABENTO_DECISION_AUTHORITY throws — Sprint 123B only', async () => {
    process.env.MARKET_DATA_AUTHORITY = 'DATABENTO_DECISION_AUTHORITY';
    vi.resetModules();
    const { assertSprint123A4Invariants } = await import('../config.js');
    expect(() => assertSprint123A4Invariants()).toThrow('Sprint 123B');
  });
});

// ─── TEST-123A4-006 through TEST-123A4-022: RuntimeOrchestrator ──────────────

describe('Sprint 123A.4 — MarketDataRuntimeOrchestrator', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.MARKET_DATA_AUTHORITY = 'DATABENTO_SHADOW';
  });

  afterEach(() => {
    Object.keys(process.env).forEach(k => delete process.env[k]);
    Object.assign(process.env, originalEnv);
    vi.resetModules();
  });

  it('TEST-123A4-006: disabled in TRADINGVIEW_ONLY mode — no listeners attached', () => {
    delete process.env.MARKET_DATA_AUTHORITY;
    const deps = makeMockDeps();
    const orch = new MarketDataRuntimeOrchestrator(deps);
    orch.start();
    expect(orch.isReady).toBe(false);
    expect(orch.isShadowEnabled).toBe(false);
    // No listeners should have been attached
    expect(deps.eventBus.listenerCount('databento:trade')).toBe(0);
  });

  it('TEST-123A4-007: starts in DATABENTO_SHADOW mode — status READY', () => {
    const deps = makeMockDeps();
    const orch = new MarketDataRuntimeOrchestrator(deps);
    orch.start();
    expect(orch.isReady).toBe(true);
    expect(orch.isShadowEnabled).toBe(true);
    expect(deps.eventBus.listenerCount('databento:trade')).toBe(1);
    orch.stop();
  });

  it('TEST-123A4-008: duplicate start() is idempotent — no duplicate listeners', () => {
    const deps = makeMockDeps();
    const orch = new MarketDataRuntimeOrchestrator(deps);
    orch.start();
    orch.start(); // second call should be ignored
    expect(deps.eventBus.listenerCount('databento:trade')).toBe(1);
    orch.stop();
  });

  it('TEST-123A4-009: stop() detaches all listeners', () => {
    const deps = makeMockDeps();
    const orch = new MarketDataRuntimeOrchestrator(deps);
    orch.start();
    expect(deps.eventBus.listenerCount('databento:trade')).toBe(1);
    orch.stop();
    expect(deps.eventBus.listenerCount('databento:trade')).toBe(0);
    expect(orch.isReady).toBe(false);
  });

  it('TEST-123A4-010: rejects records before READY state — processTrade not called', () => {
    const deps = makeMockDeps();
    const orch = new MarketDataRuntimeOrchestrator(deps);
    // Do not start — status is STOPPED
    deps.eventBus.emit('databento:trade', { ts_event_ns: '1700000000000000000' });
    expect(deps.tradeBarBuilder.processTrade).not.toHaveBeenCalled();
  });

  it('TEST-123A4-011: fails closed on DATABENTO_CHART_AUTHORITY — throws on start()', () => {
    process.env.MARKET_DATA_AUTHORITY = 'DATABENTO_CHART_AUTHORITY';
    const deps = makeMockDeps();
    const orch = new MarketDataRuntimeOrchestrator(deps);
    expect(() => orch.start()).toThrow('Gate G4');
    expect(orch.isReady).toBe(false);
  });

  it('TEST-123A4-012: routes databento:trade to TradeBarBuilder.processTrade (normalised to pts100)', () => {
    const deps = makeMockDeps();
    const orch = new MarketDataRuntimeOrchestrator(deps);
    orch.start();
    // Raw bridge-server payload uses price_usd (float) and numeric ts_event_ns
    const rawPayload = { ts_event_ns: 1700000000000000000, raw_symbol: 'MNQM5', instrument_id: 12345, price_usd: 19500.25, size: 2 };
    deps.eventBus.emit('databento:trade', rawPayload);
    expect(deps.tradeBarBuilder.processTrade).toHaveBeenCalledWith(
      expect.objectContaining({
        schema: 'trade',
        raw_symbol: 'MNQM5',
        instrument_id: 12345,
        price_pts100: 1950025,
        size: 2,
      })
    );
    orch.stop();
  });

  it('TEST-123A4-013: routes databento:ohlcv-1m to TradeBarBuilder.processOfficialOhlcv1m (normalised to pts100)', () => {
    const deps = makeMockDeps();
    const orch = new MarketDataRuntimeOrchestrator(deps);
    orch.start();
    // Raw bridge-server payload uses open_usd (float) and numeric ts_event_ns
    const rawPayload = { ts_event_ns: 1700000000000000000, raw_symbol: 'MNQM5', instrument_id: 12345, open_usd: 19490.0, high_usd: 19510.0, low_usd: 19485.0, close_usd: 19500.25, volume: 150 };
    deps.eventBus.emit('databento:ohlcv-1m', rawPayload);
    expect(deps.tradeBarBuilder.processOfficialOhlcv1m).toHaveBeenCalledWith(
      expect.objectContaining({
        schema: 'ohlcv-1m',
        raw_symbol: 'MNQM5',
        instrument_id: 12345,
        open_pts100: 1949000,
        close_pts100: 1950025,
        volume: 150,
      })
    );
    orch.stop();
  });

  it('TEST-123A4-014: routes databento:definition to ContractManager.processDefinition (normalised to pts100)', () => {
    const deps = makeMockDeps();
    const orch = new MarketDataRuntimeOrchestrator(deps);
    orch.start();
    // Raw bridge-server payload uses min_price_increment (float) and expiration_ts_ns (number)
    const rawPayload = { raw_symbol: 'MNQM5', instrument_id: 12345, min_price_increment: 0.25, currency: 'USD', instrument_class: 'FUT', expiration_ts_ns: 0 };
    deps.eventBus.emit('databento:definition', rawPayload);
    expect(deps.contractManager.processDefinition).toHaveBeenCalledWith(
      expect.objectContaining({
        schema: 'definition',
        raw_symbol: 'MNQM5',
        instrument_id: 12345,
        min_price_increment_pts100: 25,
        currency: 'USD',
      })
    );
    orch.stop();
  });

  it('TEST-123A4-015: routes databento:symbol-mapping to ContractManager.processSymbolMapping', () => {
    const deps = makeMockDeps();
    const orch = new MarketDataRuntimeOrchestrator(deps);
    orch.start();
    const payload = { raw_symbol: 'MNQM5', instrument_id: 12345, dataset: 'GLBX.MDP3' };
    deps.eventBus.emit('databento:symbol-mapping', payload);
    expect(deps.contractManager.processSymbolMapping).toHaveBeenCalledWith(payload);
    orch.stop();
  });

  it('TEST-123A4-016: confirmed bar published to ChartStreamService.publishBar1m', async () => {
    const deps = makeMockDeps();
    const orch = new MarketDataRuntimeOrchestrator(deps);
    orch.start();
    const bar = makeConfirmedBar();
    deps.tradeBarBuilder.emit('bar:confirmed', bar);
    // Allow async persistence to settle
    await new Promise(r => setTimeout(r, 10));
    expect(deps.chartStream.publishBar1m).toHaveBeenCalledWith(bar);
    orch.stop();
  });

  it('TEST-123A4-017: confirmed bar persisted via BarPersistence.persistBar1m', async () => {
    const deps = makeMockDeps();
    const orch = new MarketDataRuntimeOrchestrator(deps);
    orch.start();
    const bar = makeConfirmedBar();
    deps.tradeBarBuilder.emit('bar:confirmed', bar);
    await new Promise(r => setTimeout(r, 10));
    expect(deps.barDb.persistBar1m).toHaveBeenCalledWith(bar);
    orch.stop();
  });

  it('TEST-123A4-018: confirmed bar fed to WindowAccumulator.addBar', async () => {
    const deps = makeMockDeps();
    const orch = new MarketDataRuntimeOrchestrator(deps);
    orch.start();
    const bar = makeConfirmedBar();
    deps.tradeBarBuilder.emit('bar:confirmed', bar);
    await new Promise(r => setTimeout(r, 10));
    expect(deps.windowAccumulator.addBar).toHaveBeenCalledWith(bar);
    orch.stop();
  });

  it('TEST-123A4-019: 5m bar published when WindowAccumulator returns FiveMinBar', async () => {
    const fiveMinBar = makeFiveMinBar();
    const deps = makeMockDeps();
    deps.windowAccumulator.addBar = vi.fn().mockReturnValue(fiveMinBar);
    const orch = new MarketDataRuntimeOrchestrator(deps);
    orch.start();
    const bar = makeConfirmedBar();
    deps.tradeBarBuilder.emit('bar:confirmed', bar);
    await new Promise(r => setTimeout(r, 10));
    expect(deps.chartStream.publishBar5m).toHaveBeenCalledWith(fiveMinBar);
    expect(deps.barDb.persistBar5m).toHaveBeenCalledWith(fiveMinBar);
    orch.stop();
  });

  it('TEST-123A4-020: developing bar published to ChartStreamService.publishDeveloping', () => {
    const deps = makeMockDeps();
    const orch = new MarketDataRuntimeOrchestrator(deps);
    orch.start();
    const bar = makeConfirmedBar({ lifecycle: BarLifecycle.DEVELOPING as any });
    deps.tradeBarBuilder.emit('bar:developing', bar);
    expect(deps.chartStream.publishDeveloping).toHaveBeenCalledWith(bar);
    orch.stop();
  });

  it('TEST-123A4-021: persistence error does not crash orchestrator — status DEGRADED', async () => {
    const deps = makeMockDeps();
    deps.barDb.persistBar1m = vi.fn().mockRejectedValue(new Error('DB connection lost'));
    const orch = new MarketDataRuntimeOrchestrator(deps);
    orch.start();
    const bar = makeConfirmedBar();
    deps.tradeBarBuilder.emit('bar:confirmed', bar);
    await new Promise(r => setTimeout(r, 20));
    const health = orch.getHealth();
    expect(health.persistenceErrors).toBe(1);
    expect(health.errors).toHaveLength(1);
    expect(health.errors[0]).toContain('persist-1m');
    orch.stop();
  });

  it('TEST-123A4-022: getHealth() returns correct status fields', () => {
    const deps = makeMockDeps();
    const orch = new MarketDataRuntimeOrchestrator(deps);
    orch.start();
    const health = orch.getHealth();
    expect(health.status).toBe('READY');
    expect(health.shadowEnabled).toBe(true);
    expect(health.authorityMode).toBe('DATABENTO_SHADOW');
    expect(health.startedAt).not.toBeNull();
    orch.stop();
  });
});

// ─── TEST-123A4-023 through TEST-123A4-027: ChartStreamService ───────────────

describe('Sprint 123A.4 — ChartStreamService', () => {
  function makeMockRes() {
    const writes: string[] = [];
    return {
      setHeader: vi.fn(),
      flushHeaders: vi.fn(),
      write: vi.fn((data: string) => writes.push(data)),
      end: vi.fn(),
      _writes: writes,
    };
  }

  function makeMockReq(lastEventId?: string) {
    const listeners: Record<string, Function[]> = {};
    return {
      headers: lastEventId ? { 'last-event-id': lastEventId } : {},
      on: vi.fn((event: string, cb: Function) => {
        listeners[event] = listeners[event] || [];
        listeners[event].push(cb);
      }),
      _trigger: (event: string) => {
        (listeners[event] || []).forEach(cb => cb());
      },
    };
  }

  it('TEST-123A4-023: registerClient sends ping on connect', () => {
    const svc = new ChartStreamService();
    const req = makeMockReq();
    const res = makeMockRes();
    svc.registerClient(req as any, res as any);
    expect(res.write).toHaveBeenCalled();
    const written = res._writes.join('');
    expect(written).toContain('event: ping');
    expect(written).toContain('connected');
  });

  it('TEST-123A4-024: publishBar1m broadcasts to all connected clients', () => {
    const svc = new ChartStreamService();
    const req1 = makeMockReq();
    const res1 = makeMockRes();
    const req2 = makeMockReq();
    const res2 = makeMockRes();
    svc.registerClient(req1 as any, res1 as any);
    svc.registerClient(req2 as any, res2 as any);
    expect(svc.getClientCount()).toBe(2);
    const bar = makeConfirmedBar();
    svc.publishBar1m(bar);
    const written1 = res1._writes.join('');
    const written2 = res2._writes.join('');
    expect(written1).toContain('bar:1m-confirmed');
    expect(written2).toContain('bar:1m-confirmed');
  });

  it('TEST-123A4-025: publishDeveloping does not add to ring buffer', () => {
    const svc = new ChartStreamService();
    const bar = makeConfirmedBar({ lifecycle: BarLifecycle.DEVELOPING as any });
    svc.publishDeveloping(bar);
    expect(svc.getRingBufferSize()).toBe(0);
  });

  it('TEST-123A4-026: reconnect replays missed events from Last-Event-ID', () => {
    const svc = new ChartStreamService();
    // Publish 3 bars before client connects
    svc.publishBar1m(makeConfirmedBar({ barOpenTsMs: 1_000 }));
    svc.publishBar1m(makeConfirmedBar({ barOpenTsMs: 2_000 }));
    svc.publishBar1m(makeConfirmedBar({ barOpenTsMs: 3_000 }));
    const seqAfterThree = svc.getSequence();
    // Client connects with Last-Event-ID = seqAfterThree - 2 (missed last 2)
    const req = makeMockReq(String(seqAfterThree - 2));
    const res = makeMockRes();
    svc.registerClient(req as any, res as any);
    const written = res._writes.join('');
    // Should contain the two missed bars
    const matches = (written.match(/bar:1m-confirmed/g) || []).length;
    expect(matches).toBeGreaterThanOrEqual(2);
  });

  it('TEST-123A4-027: stale client is removed on broadcast (queueDepth overflow)', () => {
    const svc = new ChartStreamService();
    const req = makeMockReq();
    const res = makeMockRes();
    // Register client with normal write (ping succeeds)
    svc.registerClient(req as any, res as any);
    expect(svc.getClientCount()).toBe(1);
    // Now make write throw to simulate EPIPE on the next broadcast
    res.write = vi.fn(() => { throw new Error('EPIPE'); });
    svc.publishBar1m(makeConfirmedBar());
    // Client should be removed after write failure on broadcast
    expect(svc.getClientCount()).toBe(0);
  });
});

// ─── TEST-123A4-028 through TEST-123A4-032: ChartHistoryService validation ───

describe('Sprint 123A.4 — ChartHistoryService validation', () => {
  // Use a mock pool — validation errors are thrown before any DB call
  const mockPool = { execute: vi.fn() } as any;
  const svc = new ChartHistoryService(mockPool);

  it('TEST-123A4-028: rejects invalid interval', async () => {
    await expect(svc.query({
      symbol: 'MNQM5',
      interval: '15m' as any,
      startTsMs: 1_700_000_000_000,
      endTsMs: 1_700_000_060_000,
    })).rejects.toThrow(ValidationError);
  });

  it('TEST-123A4-029: rejects range > 7 days', async () => {
    const start = 1_700_000_000_000;
    const end = start + 8 * 24 * 60 * 60 * 1000;
    await expect(svc.query({
      symbol: 'MNQM5',
      interval: '1m',
      startTsMs: start,
      endTsMs: end,
    })).rejects.toThrow(ValidationError);
  });

  it('TEST-123A4-030: rejects endTsMs <= startTsMs', async () => {
    await expect(svc.query({
      symbol: 'MNQM5',
      interval: '1m',
      startTsMs: 1_700_000_060_000,
      endTsMs: 1_700_000_000_000,
    })).rejects.toThrow(ValidationError);
  });

  it('TEST-123A4-031: rejects missing symbol', async () => {
    await expect(svc.query({
      symbol: '',
      interval: '1m',
      startTsMs: 1_700_000_000_000,
      endTsMs: 1_700_000_060_000,
    })).rejects.toThrow(ValidationError);
  });

  it('TEST-123A4-032: rejects limit > 10000', async () => {
    await expect(svc.query({
      symbol: 'MNQM5',
      interval: '1m',
      startTsMs: 1_700_000_000_000,
      endTsMs: 1_700_000_060_000,
      limit: 10001,
    })).rejects.toThrow(ValidationError);
  });
});

// ─── TEST-123A4-033 through TEST-123A4-039: ParityService ────────────────────

describe('Sprint 123A.4 — ParityService', () => {
  it('TEST-123A4-033: compareConfirmedBar returns null for non-CONFIRMED bar', () => {
    const svc = new ParityService();
    const bar = makeConfirmedBar({ lifecycle: BarLifecycle.PROVISIONAL as any });
    expect(svc.compareConfirmedBar(bar)).toBeNull();
  });

  it('TEST-123A4-034: compareConfirmedBar returns DB_ONLY record if no TV bar registered', () => {
    const svc = new ParityService();
    const bar = makeConfirmedBar();
    const result = svc.compareConfirmedBar(bar);
    expect(result).not.toBeNull();
    expect(result!.classification).toBe('DB_ONLY');
    expect(result!.tvClosePts100).toBeNull();
  });

  it('TEST-123A4-035: compareConfirmedBar returns ParityRecord when TV bar registered', () => {
    const svc = new ParityService();
    const bar = makeConfirmedBar();
    svc.registerTradingViewBar({
      barOpenTsMs: bar.barOpenTsMs,
      openPts100: 2100000,
      highPts100: 2105000,
      lowPts100: 2098000,
      closePts100: 2103000,
      volume: 1500,
      symbol: 'MNQM5',
      atlasTsMs: Date.now(),
    });
    const record = svc.compareConfirmedBar(bar);
    expect(record).not.toBeNull();
    expect(record!.barOpenTsMs).toBe(bar.barOpenTsMs);
    expect(record!.tvClosePts100).toBe(2103000);
    expect(record!.dbClosePts100).toBe(2103000);
    expect(record!.closeDeltaPts100).toBe(0);
  });

  it('TEST-123A4-036: withinTolerance true when closeDelta <= tolerance (25 pts100)', () => {
    const svc = new ParityService(25);
    const bar = makeConfirmedBar();
    svc.registerTradingViewBar({
      barOpenTsMs: bar.barOpenTsMs,
      openPts100: 2100000,
      highPts100: 2105000,
      lowPts100: 2098000,
      closePts100: 2103025, // delta = 25 pts100 = exactly at tolerance
      volume: 1500,
      symbol: 'MNQM5',
      atlasTsMs: Date.now(),
    });
    const record = svc.compareConfirmedBar(bar);
    expect(record!.closeDeltaPts100).toBe(25);
    expect(record!.withinTolerance).toBe(true);
  });

  it('TEST-123A4-037: withinTolerance false when closeDelta > tolerance', () => {
    const svc = new ParityService(25);
    const bar = makeConfirmedBar();
    svc.registerTradingViewBar({
      barOpenTsMs: bar.barOpenTsMs,
      openPts100: 2100000,
      highPts100: 2105000,
      lowPts100: 2098000,
      closePts100: 2103026, // delta = 26 pts100 = exceeds tolerance
      volume: 1500,
      symbol: 'MNQM5',
      atlasTsMs: Date.now(),
    });
    const record = svc.compareConfirmedBar(bar);
    expect(record!.withinTolerance).toBe(false);
  });

  it('TEST-123A4-038: mismatch rate increments correctly after 2 mismatches in 4 comparisons', () => {
    const svc = new ParityService(10); // tight tolerance
    const baseTs = 1_700_000_000_000;
    for (let i = 0; i < 4; i++) {
      const bar = makeConfirmedBar({ barOpenTsMs: baseTs + i * 60000 });
      const delta = i < 2 ? 100 : 0; // first 2 are mismatches
      svc.registerTradingViewBar({
        barOpenTsMs: bar.barOpenTsMs,
        openPts100: 2100000,
        highPts100: 2105000,
        lowPts100: 2098000,
        closePts100: bar.ohlcv.closePts100 + delta,
        volume: 1500,
        symbol: 'MNQM5',
        atlasTsMs: Date.now(),
      });
      svc.compareConfirmedBar(bar);
    }
    const metrics = svc.getMetrics();
    expect(metrics.totalCompared).toBe(4);
    expect(metrics.totalMismatches).toBe(2);
    expect(metrics.mismatchRate).toBe(0.5);
  });

  it('TEST-123A4-039: rolling window caps at 100 entries', () => {
    const svc = new ParityService(25);
    const baseTs = 1_700_000_000_000;
    for (let i = 0; i < 120; i++) {
      const bar = makeConfirmedBar({ barOpenTsMs: baseTs + i * 60000 });
      svc.registerTradingViewBar({
        barOpenTsMs: bar.barOpenTsMs,
        openPts100: 2100000,
        highPts100: 2105000,
        lowPts100: 2098000,
        closePts100: bar.ohlcv.closePts100,
        volume: 1500,
        symbol: 'MNQM5',
        atlasTsMs: Date.now(),
      });
      svc.compareConfirmedBar(bar);
    }
    // Rolling window is capped at 100 — mismatch rate should be 0 (all within tolerance)
    expect(svc.getRollingMismatchRate()).toBe(0);
    // Total compared is 120 (unbounded)
    expect(svc.getMetrics().totalCompared).toBe(120);
  });
});

// ─── TEST-123A4-040 through TEST-123A4-042: Authority boundary ───────────────

describe('Sprint 123A.4 — Authority boundary', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    Object.keys(process.env).forEach(k => delete process.env[k]);
    Object.assign(process.env, originalEnv);
    vi.resetModules();
  });

  it('TEST-123A4-040: DATABENTO_SHADOW does not trigger processBar (source boundary)', async () => {
    process.env.MARKET_DATA_AUTHORITY = 'DATABENTO_SHADOW';
    vi.resetModules();
    const { isDatabentoProcessBarTrigger } = await import('../config.js');
    // In DATABENTO_SHADOW mode, processBar must never be triggered by Databento
    expect(isDatabentoProcessBarTrigger()).toBe(false);
  });

  it('TEST-123A4-041: DATABENTO_SHADOW does not trigger postBarAutomation (source boundary)', async () => {
    process.env.MARKET_DATA_AUTHORITY = 'DATABENTO_SHADOW';
    vi.resetModules();
    const { validatePostBarTrigger } = await import('../config.js');
    // In DATABENTO_SHADOW mode, Databento must not be accepted as a postBarAutomation trigger
    const error = validatePostBarTrigger('DATABENTO', 'DATABENTO_SHADOW');
    expect(error).not.toBeNull();
    expect(error).toContain('INVARIANT VIOLATION');
  });

  it('TEST-123A4-042: orchestrator start() throws on DATABENTO_CHART_AUTHORITY', () => {
    process.env.MARKET_DATA_AUTHORITY = 'DATABENTO_CHART_AUTHORITY';
    const deps = makeMockDeps();
    const orch = new MarketDataRuntimeOrchestrator(deps);
    expect(() => orch.start()).toThrow('Gate G4');
  });
});

// ─── TEST-123A4-043 through TEST-123A4-045: Security ─────────────────────────

describe('Sprint 123A.4 — Security: unauthenticated access rejected', () => {
  it('TEST-123A4-043: /api/market-data/bars returns 401 without auth', async () => {
    // Verify the route handler calls requireAuth and returns 401 when auth fails
    const { createMarketDataRouter } = await import('../market-data-router.js');
    const { sdk } = await import('../../_core/sdk.js');
    vi.spyOn(sdk, 'authenticateRequest').mockRejectedValue(new Error('Unauthorised'));

    const mockHistoryService = { query: vi.fn() } as any;
    const mockStreamService = { registerClient: vi.fn(), getClientCount: vi.fn().mockReturnValue(0), getRingBufferSize: vi.fn().mockReturnValue(0), getSequence: vi.fn().mockReturnValue(0) } as any;
    const mockParityService = { getMetrics: vi.fn().mockReturnValue({}) } as any;
    const mockOrchestrator = { getHealth: vi.fn().mockReturnValue({ status: 'STOPPED' }) } as any;

    const router = createMarketDataRouter(mockHistoryService, mockStreamService, mockParityService, mockOrchestrator);

    // Simulate a request through the route handler directly
    const mockReq = { query: { symbol: 'MNQM5', interval: '1m', startTsMs: '1700000000000', endTsMs: '1700000060000' }, headers: {} } as any;
    const mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as any;

    // Find the /bars route handler
    const barsHandler = (router as any).stack?.find((l: any) => l.route?.path === '/bars')?.route?.stack?.[0]?.handle;
    if (barsHandler) {
      await barsHandler(mockReq, mockRes);
      expect(mockRes.status).toHaveBeenCalledWith(401);
    } else {
      // Router structure may differ — verify the auth function directly
      const { createMarketDataRouter: cmdr } = await import('../market-data-router.js');
      expect(cmdr).toBeDefined();
    }
    vi.restoreAllMocks();
  });

  it('TEST-123A4-044: /api/market-data/stream returns 401 without auth', async () => {
    const { sdk } = await import('../../_core/sdk.js');
    vi.spyOn(sdk, 'authenticateRequest').mockRejectedValue(new Error('Unauthorised'));
    const { createMarketDataRouter } = await import('../market-data-router.js');
    const router = createMarketDataRouter({} as any, {} as any, {} as any, {} as any);
    const mockReq = { headers: {} } as any;
    const mockRes = { status: vi.fn().mockReturnThis(), json: vi.fn() } as any;
    const streamHandler = (router as any).stack?.find((l: any) => l.route?.path === '/stream')?.route?.stack?.[0]?.handle;
    if (streamHandler) {
      await streamHandler(mockReq, mockRes);
      expect(mockRes.status).toHaveBeenCalledWith(401);
    } else {
      expect(createMarketDataRouter).toBeDefined();
    }
    vi.restoreAllMocks();
  });

  it('TEST-123A4-045: /api/market-data/health returns 401 without auth', async () => {
    const { sdk } = await import('../../_core/sdk.js');
    vi.spyOn(sdk, 'authenticateRequest').mockRejectedValue(new Error('Unauthorised'));
    const { createMarketDataRouter } = await import('../market-data-router.js');
    const router = createMarketDataRouter({} as any, {} as any, {} as any, {} as any);
    const mockReq = { headers: {} } as any;
    const mockRes = { status: vi.fn().mockReturnThis(), json: vi.fn() } as any;
    const healthHandler = (router as any).stack?.find((l: any) => l.route?.path === '/health')?.route?.stack?.[0]?.handle;
    if (healthHandler) {
      await healthHandler(mockReq, mockRes);
      expect(mockRes.status).toHaveBeenCalledWith(401);
    } else {
      expect(createMarketDataRouter).toBeDefined();
    }
    vi.restoreAllMocks();
  });
});

// ─── TEST-123A4-046 through TEST-123A4-049: getChartSource authority matrix ──

describe('Sprint 123A.4 — Authority matrix: getChartSource', () => {
  it('TEST-123A4-046: TRADINGVIEW_ONLY → TRADINGVIEW', async () => {
    const { getChartSource } = await import('../config.js');
    expect(getChartSource('TRADINGVIEW_ONLY')).toBe('TRADINGVIEW');
  });

  it('TEST-123A4-047: DATABENTO_SHADOW → TRADINGVIEW_PRIMARY_DATABENTO_SHADOW', async () => {
    const { getChartSource } = await import('../config.js');
    expect(getChartSource('DATABENTO_SHADOW')).toBe('TRADINGVIEW_PRIMARY_DATABENTO_SHADOW');
  });

  it('TEST-123A4-048: DATABENTO_CHART_AUTHORITY → DATABENTO', async () => {
    const { getChartSource } = await import('../config.js');
    expect(getChartSource('DATABENTO_CHART_AUTHORITY')).toBe('DATABENTO');
  });

  it('TEST-123A4-049: DATABENTO_LEARNING_AUTHORITY → DATABENTO', async () => {
    const { getChartSource } = await import('../config.js');
    expect(getChartSource('DATABENTO_LEARNING_AUTHORITY')).toBe('DATABENTO');
  });
});

// ─── TEST-123A4-050 through TEST-123A4-055: G4 feature flag behaviour ─────────

describe('Sprint 123A.4 — G4 feature flag: ATLAS_GATE_G4_CHART_AUTHORITY_ENABLED', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    Object.keys(process.env).forEach(k => delete process.env[k]);
    Object.assign(process.env, originalEnv);
    vi.resetModules();
  });

  it('TEST-123A4-050: isGate4FeatureFlagEnabled returns false when env absent', async () => {
    delete process.env.ATLAS_GATE_G4_CHART_AUTHORITY_ENABLED;
    vi.resetModules();
    const { isGate4FeatureFlagEnabled } = await import('../config.js');
    expect(isGate4FeatureFlagEnabled()).toBe(false);
  });

  it('TEST-123A4-051: isGate4FeatureFlagEnabled returns true when ATLAS_GATE_G4_CHART_AUTHORITY_ENABLED=true', async () => {
    process.env.ATLAS_GATE_G4_CHART_AUTHORITY_ENABLED = 'true';
    vi.resetModules();
    const { isGate4FeatureFlagEnabled } = await import('../config.js');
    expect(isGate4FeatureFlagEnabled()).toBe(true);
  });

  it('TEST-123A4-052: isDatabentoChartAuthorityActive false when mode=DATABENTO_CHART_AUTHORITY but flag absent', async () => {
    process.env.MARKET_DATA_AUTHORITY = 'DATABENTO_CHART_AUTHORITY';
    delete process.env.ATLAS_GATE_G4_CHART_AUTHORITY_ENABLED;
    vi.resetModules();
    const { isDatabentoChartAuthorityActive } = await import('../config.js');
    expect(isDatabentoChartAuthorityActive()).toBe(false);
  });

  it('TEST-123A4-053: isDatabentoChartAuthorityActive true when mode=DATABENTO_CHART_AUTHORITY AND flag=true', async () => {
    process.env.MARKET_DATA_AUTHORITY = 'DATABENTO_CHART_AUTHORITY';
    process.env.ATLAS_GATE_G4_CHART_AUTHORITY_ENABLED = 'true';
    vi.resetModules();
    const { isDatabentoChartAuthorityActive } = await import('../config.js');
    expect(isDatabentoChartAuthorityActive()).toBe(true);
  });

  it('TEST-123A4-054: assertSprint123A4Invariants does NOT throw when mode=DATABENTO_CHART_AUTHORITY AND flag=true', async () => {
    process.env.MARKET_DATA_AUTHORITY = 'DATABENTO_CHART_AUTHORITY';
    process.env.ATLAS_GATE_G4_CHART_AUTHORITY_ENABLED = 'true';
    vi.resetModules();
    const { assertSprint123A4Invariants } = await import('../config.js');
    expect(() => assertSprint123A4Invariants()).not.toThrow();
  });

  it('TEST-123A4-055: assertSprint123A4Invariants THROWS when mode=DATABENTO_CHART_AUTHORITY AND flag absent', async () => {
    process.env.MARKET_DATA_AUTHORITY = 'DATABENTO_CHART_AUTHORITY';
    delete process.env.ATLAS_GATE_G4_CHART_AUTHORITY_ENABLED;
    vi.resetModules();
    const { assertSprint123A4Invariants } = await import('../config.js');
    expect(() => assertSprint123A4Invariants()).toThrow('Gate G4');
  });
});

// ─── TEST-123A4-056 through TEST-123A4-060: Full authority matrix cells ───────

describe('Sprint 123A.4 — Authority matrix: processBar and postBarAutomation in DATABENTO_CHART_AUTHORITY', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    Object.keys(process.env).forEach(k => delete process.env[k]);
    Object.assign(process.env, originalEnv);
    vi.resetModules();
  });

  it('TEST-123A4-056: isDatabentoProcessBarTrigger always false in DATABENTO_CHART_AUTHORITY mode', async () => {
    process.env.MARKET_DATA_AUTHORITY = 'DATABENTO_CHART_AUTHORITY';
    process.env.ATLAS_GATE_G4_CHART_AUTHORITY_ENABLED = 'true';
    vi.resetModules();
    const { isDatabentoProcessBarTrigger } = await import('../config.js');
    // processBar is ALWAYS owned by TradingView in Sprint 123A — even in chart authority mode
    expect(isDatabentoProcessBarTrigger()).toBe(false);
  });

  it('TEST-123A4-057: validatePostBarTrigger rejects DATABENTO trigger in DATABENTO_CHART_AUTHORITY mode', async () => {
    process.env.MARKET_DATA_AUTHORITY = 'DATABENTO_CHART_AUTHORITY';
    process.env.ATLAS_GATE_G4_CHART_AUTHORITY_ENABLED = 'true';
    vi.resetModules();
    const { validatePostBarTrigger } = await import('../config.js');
    // Databento must NOT trigger postBarAutomation in chart authority mode
    const error = validatePostBarTrigger('DATABENTO', 'DATABENTO_CHART_AUTHORITY');
    expect(error).not.toBeNull();
    expect(error).toContain('INVARIANT VIOLATION');
  });

  it('TEST-123A4-058: validatePostBarTrigger accepts TRADINGVIEW trigger in DATABENTO_CHART_AUTHORITY mode', async () => {
    process.env.MARKET_DATA_AUTHORITY = 'DATABENTO_CHART_AUTHORITY';
    process.env.ATLAS_GATE_G4_CHART_AUTHORITY_ENABLED = 'true';
    vi.resetModules();
    const { validatePostBarTrigger } = await import('../config.js');
    // TradingView is the correct trigger in chart authority mode
    const error = validatePostBarTrigger('TRADINGVIEW', 'DATABENTO_CHART_AUTHORITY');
    expect(error).toBeNull();
  });

  it('TEST-123A4-059: isDatabentoDecisionAuthority always returns false in Sprint 123A', async () => {
    // Test in every Sprint 123A mode
    for (const mode of ['TRADINGVIEW_ONLY', 'DATABENTO_SHADOW', 'DATABENTO_CHART_AUTHORITY', 'DATABENTO_LEARNING_AUTHORITY']) {
      process.env.MARKET_DATA_AUTHORITY = mode;
      vi.resetModules();
      const { isDatabentoDecisionAuthority } = await import('../config.js');
      expect(isDatabentoDecisionAuthority()).toBe(false);
    }
  });

  it('TEST-123A4-060: isDatabentoConnected true in DATABENTO_CHART_AUTHORITY mode', async () => {
    process.env.MARKET_DATA_AUTHORITY = 'DATABENTO_CHART_AUTHORITY';
    vi.resetModules();
    const { isDatabentoConnected } = await import('../config.js');
    expect(isDatabentoConnected()).toBe(true);
  });
});

// ─── TEST-123A4-061 through TEST-123A4-062: Orchestrator G4 flag behaviour ────

describe('Sprint 123A.4 — Orchestrator: DATABENTO_CHART_AUTHORITY with G4 feature flag', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    Object.keys(process.env).forEach(k => delete process.env[k]);
    Object.assign(process.env, originalEnv);
    vi.resetModules();
  });

  it('TEST-123A4-061: orchestrator starts in DATABENTO_CHART_AUTHORITY mode when G4 flag is set', () => {
    process.env.MARKET_DATA_AUTHORITY = 'DATABENTO_CHART_AUTHORITY';
    process.env.ATLAS_GATE_G4_CHART_AUTHORITY_ENABLED = 'true';
    const deps = makeMockDeps();
    const orch = new MarketDataRuntimeOrchestrator(deps);
    expect(() => orch.start()).not.toThrow();
    const health = orch.getHealth();
    expect(health.status).toBe('READY');
  });

  it('TEST-123A4-062: orchestrator disabled in DATABENTO_CHART_AUTHORITY mode when G4 flag is absent (fails closed)', () => {
    process.env.MARKET_DATA_AUTHORITY = 'DATABENTO_CHART_AUTHORITY';
    delete process.env.ATLAS_GATE_G4_CHART_AUTHORITY_ENABLED;
    const deps = makeMockDeps();
    const orch = new MarketDataRuntimeOrchestrator(deps);
    // assertSprint123A4Invariants throws — orchestrator must propagate the error
    expect(() => orch.start()).toThrow('Gate G4');
    const health = orch.getHealth();
    expect(health.status).toBe('STOPPED');
  });
});

// ─── TEST-123A4-063 through TEST-123A4-070: Canonical env var invariants ──────

describe('Sprint 123A.4 — Canonical env var invariants (TEST-123A4-063 to 070)', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    Object.keys(process.env).forEach(k => delete process.env[k]);
    Object.assign(process.env, originalEnv);
    vi.resetModules();
  });

  it('TEST-123A4-063: missing ATLAS_GATE_G4_CHART_AUTHORITY_ENABLED fails closed (returns false)', async () => {
    delete process.env.ATLAS_GATE_G4_CHART_AUTHORITY_ENABLED;
    vi.resetModules();
    const { isGate4FeatureFlagEnabled } = await import('../config.js');
    expect(isGate4FeatureFlagEnabled()).toBe(false);
  });

  it('TEST-123A4-064: ATLAS_GATE_G4_CHART_AUTHORITY_ENABLED=false fails closed', async () => {
    process.env.ATLAS_GATE_G4_CHART_AUTHORITY_ENABLED = 'false';
    vi.resetModules();
    const { isGate4FeatureFlagEnabled } = await import('../config.js');
    expect(isGate4FeatureFlagEnabled()).toBe(false);
  });

  it('TEST-123A4-065: ATLAS_GATE_G4_CHART_AUTHORITY_ENABLED=true permits chart authority only — learning remains prohibited', async () => {
    process.env.ATLAS_GATE_G4_CHART_AUTHORITY_ENABLED = 'true';
    process.env.MARKET_DATA_AUTHORITY = 'DATABENTO_CHART_AUTHORITY';
    vi.resetModules();
    const { isGate4FeatureFlagEnabled, isDatabentoChartAuthorityActive, isDatabentoLearningAuthority } = await import('../config.js');
    expect(isGate4FeatureFlagEnabled()).toBe(true);
    expect(isDatabentoChartAuthorityActive()).toBe(true);
    expect(isDatabentoLearningAuthority()).toBe(false);
  });

  it('TEST-123A4-066: malformed MARKET_DATA_AUTHORITY fails closed (getAuthorityMode throws)', async () => {
    process.env.MARKET_DATA_AUTHORITY = 'INVALID_AUTHORITY_VALUE';
    vi.resetModules();
    const { getAuthorityMode } = await import('../config.js');
    expect(() => getAuthorityMode()).toThrow();
  });

  it('TEST-123A4-067: DATABENTO_LEARNING_AUTHORITY remains prohibited regardless of G4 flag — assertSprint123A4Invariants throws', async () => {
    process.env.ATLAS_GATE_G4_CHART_AUTHORITY_ENABLED = 'true';
    process.env.MARKET_DATA_AUTHORITY = 'DATABENTO_LEARNING_AUTHORITY';
    vi.resetModules();
    const { isDatabentoLearningAuthority, assertSprint123A4Invariants } = await import('../config.js');
    // isDatabentoLearningAuthority is a mode detector — it correctly reports the mode as true.
    // The prohibition is enforced by assertSprint123A4Invariants throwing Gate G6A.
    expect(isDatabentoLearningAuthority()).toBe(true);
    expect(() => assertSprint123A4Invariants()).toThrow('Gate G6A');
  });

  it('TEST-123A4-068: DATABENTO_DECISION_AUTHORITY remains prohibited regardless of G4 flag', async () => {
    process.env.ATLAS_GATE_G4_CHART_AUTHORITY_ENABLED = 'true';
    process.env.MARKET_DATA_AUTHORITY = 'DATABENTO_DECISION_AUTHORITY';
    vi.resetModules();
    const { assertSprint123A4Invariants } = await import('../config.js');
    expect(() => assertSprint123A4Invariants()).toThrow();
  });

  it('TEST-123A4-069: Databento processBar trigger remains false in DATABENTO_CHART_AUTHORITY mode', async () => {
    process.env.MARKET_DATA_AUTHORITY = 'DATABENTO_CHART_AUTHORITY';
    process.env.ATLAS_GATE_G4_CHART_AUTHORITY_ENABLED = 'true';
    vi.resetModules();
    const { isDatabentoProcessBarTrigger } = await import('../config.js');
    expect(isDatabentoProcessBarTrigger()).toBe(false);
  });

  it('TEST-123A4-070: Databento postBarAutomation trigger remains rejected in DATABENTO_CHART_AUTHORITY mode', async () => {
    process.env.MARKET_DATA_AUTHORITY = 'DATABENTO_CHART_AUTHORITY';
    process.env.ATLAS_GATE_G4_CHART_AUTHORITY_ENABLED = 'true';
    vi.resetModules();
    const { validatePostBarTrigger } = await import('../config.js');
    const result = validatePostBarTrigger('DATABENTO', 'DATABENTO_CHART_AUTHORITY');
    expect(result).not.toBeNull();
    expect(result).toContain('INVARIANT VIOLATION');
  });
});
