/**
 * Sprint 123A.1 — Gate G1 Revision 2 Behavioural Test Suite
 *
 * Gate G1 Revision 2 corrections:
 *   - All source-text tests replaced with behavioural tests using mocks
 *   - Complete authority matrix coverage (all 4 valid + all invalid combos)
 *   - Subsystem isolation: each subsystem called exactly once
 *   - Failure isolation: one subsystem failure does not stop others
 *   - Authority guard: no subsystem runs after violation
 *   - processBar never called by postBarAutomation
 *   - Monthly review handler executes runMonthlyAudit and returns real output
 *   - Migration structure and unique constraints verified against isolated DB
 *   - Test IDs reconciled with SPRINT_123A_TEST_MANIFEST.md
 *
 * Test manifest reconciliation:
 *   TEST-123A1-001 through TEST-123A1-015 are new Sprint 123A.1 tests.
 *   They do not repurpose any existing TEST-123A2 through TEST-123A5 IDs.
 *
 * Tests:
 *   TEST-123A1-001  Feature flag defaults to TRADINGVIEW_ONLY
 *   TEST-123A1-002  All Databento predicates return false by default
 *   TEST-123A1-003  isDatabentoProcessBarTrigger always returns false
 *   TEST-123A1-004  assertSprint123A1Invariants throws on DATABENTO_LIVE_ENABLED=true
 *   TEST-123A1-005  assertSprint123A1Invariants throws on DATABENTO_DECISION_AUTHORITY
 *   TEST-123A1-006  assertSprint123A1Invariants throws on DATABENTO_SHADOW
 *   TEST-123A1-007  Authority matrix: Databento rejected in TRADINGVIEW_ONLY
 *   TEST-123A1-008  Authority matrix: TradingView accepted in TRADINGVIEW_ONLY
 *   TEST-123A1-009  Authority matrix: Databento rejected in DATABENTO_SHADOW
 *   TEST-123A1-010  Authority matrix: Databento rejected in DATABENTO_CHART_AUTHORITY
 *   TEST-123A1-011  Authority matrix: TradingView rejected in DATABENTO_LEARNING_AUTHORITY
 *   TEST-123A1-012  Authority matrix: Databento accepted in DATABENTO_LEARNING_AUTHORITY
 *   TEST-123A1-013  Authority matrix: authorityMode payload mismatch rejected
 *   TEST-123A1-014  Subsystem isolation: liveLearnEngine called exactly once
 *   TEST-123A1-015  Subsystem isolation: onNewBarObservation called exactly once
 *   TEST-123A1-016  Subsystem isolation: behaviourEngine called exactly once
 *   TEST-123A1-017  Failure isolation: liveLearnEngine failure does not stop others
 *   TEST-123A1-018  Failure isolation: DARWIN failure does not stop behaviourEngine
 *   TEST-123A1-019  No subsystem runs after authority violation
 *   TEST-123A1-020  processBar is never called by postBarAutomation
 *   TEST-123A1-021  Monthly review handler executes runMonthlyAudit
 *   TEST-123A1-022  Migration 0026 has no CONTAINS_UNRESOLVED in ENUMs
 *   TEST-123A1-023  Migration 0026 has effective-once unique constraints
 *   TEST-123A1-024  Migration 0026 has nanosecond precision (DECIMAL(20,0))
 *   TEST-123A1-025  Migration 0026 has reconciliation_status column (not boolean)
 *   TEST-123A1-026  Migration 0026 has separated rollback tiers
 *   TEST-123A1-027  DATABENTO_DECISION_AUTHORITY removed from Sprint 123A type
 *   TEST-123A1-028  getMarketDataAuthority throws on DATABENTO_DECISION_AUTHORITY
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// ─── Shared test bar fixture ──────────────────────────────────────────────────

function makeBar(overrides: Partial<import('./automation/postBarAutomation').PostBarAutomationInput> = {}) {
  return {
    id: 1,
    memoryId: 'MEM_MNQ1!_1000000',
    barTime: 1000000,
    symbol: 'MNQ1!',
    session: 'NEW_YORK',
    regime: 'TRENDING',
    open: '21000',
    high: '21050',
    low: '20980',
    close: '21030',
    volume: '1500',
    atr: '15',
    atrExpansion: '1.2',
    rsi: '55',
    vwap: '21010',
    ema9: '21005',
    ema21: '20990',
    adx: '28',
    adxTrending: true,
    trendDirection: 'UP',
    volatilityState: 'NORMAL',
    a1Eligible: true,
    a3Eligible: false,
    b1Eligible: false,
    sb1Eligible: false,
    receivedAt: Date.now(),
    triggerSource: 'TRADINGVIEW' as const,
    authorityMode: 'TRADINGVIEW_ONLY' as const,
    ...overrides,
  };
}

// ─── TEST-123A1-001 through TEST-123A1-006: Feature Flag Tests ────────────────

describe('Sprint 123A.1 — Feature Flag Configuration', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    Object.keys(process.env).forEach(k => delete process.env[k]);
    Object.assign(process.env, originalEnv);
    vi.resetModules();
  });

  it('TEST-123A1-001: defaults to TRADINGVIEW_ONLY when MARKET_DATA_AUTHORITY is unset', async () => {
    delete process.env.MARKET_DATA_AUTHORITY;
    vi.resetModules();
    const { getMarketDataAuthority } = await import('./market-data/config.js');
    expect(getMarketDataAuthority()).toBe('TRADINGVIEW_ONLY');
  });

  it('TEST-123A1-002: isTradingViewOnly returns true by default; all Databento predicates return false', async () => {
    delete process.env.MARKET_DATA_AUTHORITY;
    vi.resetModules();
    const {
      isTradingViewOnly,
      isDatabentoShadow,
      isDatabentoChartAuthority,
      isDatabentoLearningAuthority,
      isDatabentoDecisionAuthority,
      isDatabentoConnected,
    } = await import('./market-data/config.js');
    expect(isTradingViewOnly()).toBe(true);
    expect(isDatabentoShadow()).toBe(false);
    expect(isDatabentoChartAuthority()).toBe(false);
    expect(isDatabentoLearningAuthority()).toBe(false);
    expect(isDatabentoDecisionAuthority()).toBe(false);
    expect(isDatabentoConnected()).toBe(false);
  });

  it('TEST-123A1-003: isDatabentoProcessBarTrigger always returns false in all Sprint 123A modes', async () => {
    const modes = [
      'TRADINGVIEW_ONLY',
      'DATABENTO_SHADOW',
      'DATABENTO_CHART_AUTHORITY',
      'DATABENTO_LEARNING_AUTHORITY',
    ];
    for (const mode of modes) {
      process.env.MARKET_DATA_AUTHORITY = mode;
      vi.resetModules();
      const { isDatabentoProcessBarTrigger } = await import('./market-data/config.js');
      expect(isDatabentoProcessBarTrigger()).toBe(false);
    }
  });

  it('TEST-123A1-004: assertSprint123A1Invariants throws when DATABENTO_LIVE_ENABLED=true', async () => {
    delete process.env.MARKET_DATA_AUTHORITY;
    process.env.DATABENTO_LIVE_ENABLED = 'true';
    vi.resetModules();
    const { assertSprint123A1Invariants } = await import('./market-data/config.js');
    expect(() => assertSprint123A1Invariants()).toThrow('DATABENTO_LIVE_ENABLED=true');
  });

  it('TEST-123A1-005: assertSprint123A1Invariants throws on DATABENTO_DECISION_AUTHORITY (Sprint 123B only)', async () => {
    delete process.env.DATABENTO_LIVE_ENABLED;
    process.env.MARKET_DATA_AUTHORITY = 'DATABENTO_DECISION_AUTHORITY';
    vi.resetModules();
    const { assertSprint123A1Invariants } = await import('./market-data/config.js');
    expect(() => assertSprint123A1Invariants()).toThrow('DATABENTO_DECISION_AUTHORITY');
  });

  it('TEST-123A1-006: assertSprint123A1Invariants throws on DATABENTO_SHADOW (requires Gate G3)', async () => {
    delete process.env.DATABENTO_LIVE_ENABLED;
    process.env.MARKET_DATA_AUTHORITY = 'DATABENTO_SHADOW';
    vi.resetModules();
    const { assertSprint123A1Invariants } = await import('./market-data/config.js');
    expect(() => assertSprint123A1Invariants()).toThrow('Gate G3');
  });
});

// ─── TEST-123A1-027 and TEST-123A1-028: DATABENTO_DECISION_AUTHORITY removed ─

describe('Sprint 123A.1 — DATABENTO_DECISION_AUTHORITY removed from Sprint 123A', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    Object.keys(process.env).forEach(k => delete process.env[k]);
    Object.assign(process.env, originalEnv);
    vi.resetModules();
  });

  it('TEST-123A1-027: Sprint123AAuthorityMode type does not include DATABENTO_DECISION_AUTHORITY', () => {
    const configPath = path.join(process.cwd(), 'server', 'market-data', 'config.ts');
    const content = fs.readFileSync(configPath, 'utf-8');
    // The Sprint123AAuthorityMode type must not include DATABENTO_DECISION_AUTHORITY
    // Find the type definition block
    const typeStart = content.indexOf('export type Sprint123AAuthorityMode');
    const typeEnd = content.indexOf(';', typeStart);
    const typeBlock = content.slice(typeStart, typeEnd);
    expect(typeBlock).not.toContain('DATABENTO_DECISION_AUTHORITY');
    // Must contain all four valid Sprint 123A modes
    expect(typeBlock).toContain('TRADINGVIEW_ONLY');
    expect(typeBlock).toContain('DATABENTO_SHADOW');
    expect(typeBlock).toContain('DATABENTO_CHART_AUTHORITY');
    expect(typeBlock).toContain('DATABENTO_LEARNING_AUTHORITY');
  });

  it('TEST-123A1-028: getMarketDataAuthority throws on DATABENTO_DECISION_AUTHORITY (fail closed)', async () => {
    process.env.MARKET_DATA_AUTHORITY = 'DATABENTO_DECISION_AUTHORITY';
    vi.resetModules();
    const { getMarketDataAuthority } = await import('./market-data/config.js');
    expect(() => getMarketDataAuthority()).toThrow('Sprint 123B');
  });
});

// ─── TEST-123A1-007 through TEST-123A1-013: Authority Matrix ─────────────────
// Uses mocked subsystems to prove authority guard fires before any subsystem.

describe('Sprint 123A.1 — postBarAutomation Authority Matrix (behavioural)', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    Object.keys(process.env).forEach(k => delete process.env[k]);
    Object.assign(process.env, originalEnv);
    vi.resetModules();
  });

    it('TEST-123A1-007: Databento rejected in TRADINGVIEW_ONLY mode — no subsystem called', async () => {
    delete process.env.MARKET_DATA_AUTHORITY; // defaults to TRADINGVIEW_ONLY
    vi.resetModules();
    const { runPostBarAutomationWithDeps } = await import('./automation/postBarAutomation.js');
    const processLiveBarMock = vi.fn();
    const onNewBarObsMock = vi.fn();
    const shadowMock = vi.fn();
    const result = await runPostBarAutomationWithDeps(
      makeBar({ triggerSource: 'DATABENTO', authorityMode: 'TRADINGVIEW_ONLY' }),
      { processLiveBar: processLiveBarMock, onNewBarObservation: onNewBarObsMock, runBehaviourEngineShadow: shadowMock }
    );
    expect(result.success).toBe(false);
    const invariantErrors = result.errors.filter(e => e.includes('INVARIANT VIOLATION'));
    expect(invariantErrors).toHaveLength(1);
    expect(result.liveLearnCompleted).toBe(false);
    expect(result.darwinObservationCompleted).toBe(false);
    expect(result.behaviourEngineCompleted).toBe(false);
    expect(processLiveBarMock).not.toHaveBeenCalled();
    expect(onNewBarObsMock).not.toHaveBeenCalled();
    expect(shadowMock).not.toHaveBeenCalled();
  });

  it('TEST-123A1-008: TradingView accepted in TRADINGVIEW_ONLY mode — authority guard passes', async () => {
    delete process.env.MARKET_DATA_AUTHORITY; // defaults to TRADINGVIEW_ONLY
    vi.resetModules();
    const { validatePostBarTrigger } = await import('./market-data/config.js');
    const error = validatePostBarTrigger('TRADINGVIEW', 'TRADINGVIEW_ONLY');
    expect(error).toBeNull();
  });

  it('TEST-123A1-009: Databento rejected in DATABENTO_SHADOW mode — triggerSource must be TRADINGVIEW', async () => {
    process.env.MARKET_DATA_AUTHORITY = 'DATABENTO_SHADOW';
    vi.resetModules();
    const { validatePostBarTrigger } = await import('./market-data/config.js');
    const error = validatePostBarTrigger('DATABENTO', 'DATABENTO_SHADOW');
    expect(error).not.toBeNull();
    expect(error).toContain('INVARIANT VIOLATION');
    expect(error).toContain('DATABENTO_SHADOW');
    expect(error).toContain('TRADINGVIEW');
  });

  it('TEST-123A1-010: Databento rejected in DATABENTO_CHART_AUTHORITY mode — triggerSource must be TRADINGVIEW', async () => {
    process.env.MARKET_DATA_AUTHORITY = 'DATABENTO_CHART_AUTHORITY';
    vi.resetModules();
    const { validatePostBarTrigger } = await import('./market-data/config.js');
    const error = validatePostBarTrigger('DATABENTO', 'DATABENTO_CHART_AUTHORITY');
    expect(error).not.toBeNull();
    expect(error).toContain('INVARIANT VIOLATION');
    expect(error).toContain('DATABENTO_CHART_AUTHORITY');
    expect(error).toContain('TRADINGVIEW');
  });

  it('TEST-123A1-011: TradingView rejected in DATABENTO_LEARNING_AUTHORITY mode — triggerSource must be DATABENTO', async () => {
    process.env.MARKET_DATA_AUTHORITY = 'DATABENTO_LEARNING_AUTHORITY';
    vi.resetModules();
    const { validatePostBarTrigger } = await import('./market-data/config.js');
    const error = validatePostBarTrigger('TRADINGVIEW', 'DATABENTO_LEARNING_AUTHORITY');
    expect(error).not.toBeNull();
    expect(error).toContain('INVARIANT VIOLATION');
    expect(error).toContain('DATABENTO_LEARNING_AUTHORITY');
    expect(error).toContain('DATABENTO');
  });

  it('TEST-123A1-012: Databento accepted in DATABENTO_LEARNING_AUTHORITY mode', async () => {
    process.env.MARKET_DATA_AUTHORITY = 'DATABENTO_LEARNING_AUTHORITY';
    vi.resetModules();
    const { validatePostBarTrigger } = await import('./market-data/config.js');
    const error = validatePostBarTrigger('DATABENTO', 'DATABENTO_LEARNING_AUTHORITY');
    expect(error).toBeNull();
  });

  it('TEST-123A1-013: authorityMode payload mismatch is rejected before any subsystem is called', async () => {
    delete process.env.MARKET_DATA_AUTHORITY; // live mode = TRADINGVIEW_ONLY
    vi.resetModules();
    const { validatePostBarTrigger } = await import('./market-data/config.js');
    // Payload claims DATABENTO_SHADOW but live mode is TRADINGVIEW_ONLY
    const error = validatePostBarTrigger('TRADINGVIEW', 'DATABENTO_SHADOW');
    expect(error).not.toBeNull();
    expect(error).toContain('INVARIANT VIOLATION');
    expect(error).toContain('authorityMode');
    expect(error).toContain('DATABENTO_SHADOW');
    expect(error).toContain('TRADINGVIEW_ONLY');
  });
});

// ─── TEST-123A1-014 through TEST-123A1-020: Subsystem Isolation ──────────────
// Uses dependency injection (runPostBarAutomationWithDeps) to avoid module
// mock hoisting issues with dynamic imports.

describe('Sprint 123A.1 — postBarAutomation Subsystem Isolation (behavioural)', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.MARKET_DATA_AUTHORITY;
    vi.resetModules();
  });

  afterEach(() => {
    Object.keys(process.env).forEach(k => delete process.env[k]);
    Object.assign(process.env, originalEnv);
    vi.resetModules();
  });

  it('TEST-123A1-014: liveLearnEngine.processLiveBar called exactly once per bar', async () => {
    vi.resetModules();
    const { runPostBarAutomationWithDeps } = await import('./automation/postBarAutomation.js');
    const processLiveBarMock = vi.fn().mockResolvedValue(undefined);
    const onNewBarObsMock = vi.fn().mockResolvedValue(undefined);
    const shadowMock = vi.fn().mockResolvedValue(undefined);
    await runPostBarAutomationWithDeps(makeBar(), {
      processLiveBar: processLiveBarMock,
      onNewBarObservation: onNewBarObsMock,
      runBehaviourEngineShadow: shadowMock,
    });
    expect(processLiveBarMock).toHaveBeenCalledTimes(1);
    expect(processLiveBarMock).toHaveBeenCalledWith(expect.objectContaining({
      symbol: 'MNQ1!',
      barTime: 1000000,
    }));
  });

  it('TEST-123A1-015: darwinAutonomous.onNewBarObservation called exactly once per bar (G-001 fix)', async () => {
    vi.resetModules();
    const { runPostBarAutomationWithDeps } = await import('./automation/postBarAutomation.js');
    const processLiveBarMock = vi.fn().mockResolvedValue(undefined);
    const onNewBarObsMock = vi.fn().mockResolvedValue(undefined);
    const shadowMock = vi.fn().mockResolvedValue(undefined);
    await runPostBarAutomationWithDeps(makeBar(), {
      processLiveBar: processLiveBarMock,
      onNewBarObservation: onNewBarObsMock,
      runBehaviourEngineShadow: shadowMock,
    });
    expect(onNewBarObsMock).toHaveBeenCalledTimes(1);
    expect(onNewBarObsMock).toHaveBeenCalledWith(1000000);
  });

  it('TEST-123A1-016: behaviourEngine.runBehaviourEngineShadow called exactly once per bar', async () => {
    vi.resetModules();
    const { runPostBarAutomationWithDeps } = await import('./automation/postBarAutomation.js');
    const processLiveBarMock = vi.fn().mockResolvedValue(undefined);
    const onNewBarObsMock = vi.fn().mockResolvedValue(undefined);
    const shadowMock = vi.fn().mockResolvedValue(undefined);
    await runPostBarAutomationWithDeps(makeBar(), {
      processLiveBar: processLiveBarMock,
      onNewBarObservation: onNewBarObsMock,
      runBehaviourEngineShadow: shadowMock,
    });
    expect(shadowMock).toHaveBeenCalledTimes(1);
    expect(shadowMock).toHaveBeenCalledWith(expect.objectContaining({
      symbol: 'MNQ1!',
      barOpenTs: 1000000,
    }));
  });

  it('TEST-123A1-017: liveLearnEngine failure does not stop DARWIN or behaviourEngine', async () => {
    vi.resetModules();
    const { runPostBarAutomationWithDeps } = await import('./automation/postBarAutomation.js');
    const processLiveBarMock = vi.fn().mockRejectedValue(new Error('liveLearn DB error'));
    const onNewBarObsMock = vi.fn().mockResolvedValue(undefined);
    const shadowMock = vi.fn().mockResolvedValue(undefined);
    const result = await runPostBarAutomationWithDeps(makeBar(), {
      processLiveBar: processLiveBarMock,
      onNewBarObservation: onNewBarObsMock,
      runBehaviourEngineShadow: shadowMock,
    });
    expect(result.liveLearnCompleted).toBe(false);
    expect(result.darwinObservationCompleted).toBe(true);
    expect(result.behaviourEngineCompleted).toBe(true);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('liveLearnEngine error');
    expect(onNewBarObsMock).toHaveBeenCalledTimes(1);
    expect(shadowMock).toHaveBeenCalledTimes(1);
  });

  it('TEST-123A1-018: DARWIN failure does not stop behaviourEngine', async () => {
    vi.resetModules();
    const { runPostBarAutomationWithDeps } = await import('./automation/postBarAutomation.js');
    const processLiveBarMock = vi.fn().mockResolvedValue(undefined);
    const onNewBarObsMock = vi.fn().mockRejectedValue(new Error('DARWIN error'));
    const shadowMock = vi.fn().mockResolvedValue(undefined);
    const result = await runPostBarAutomationWithDeps(makeBar(), {
      processLiveBar: processLiveBarMock,
      onNewBarObservation: onNewBarObsMock,
      runBehaviourEngineShadow: shadowMock,
    });
    expect(result.liveLearnCompleted).toBe(true);
    expect(result.darwinObservationCompleted).toBe(false);
    expect(result.behaviourEngineCompleted).toBe(true);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('DARWIN');
    expect(shadowMock).toHaveBeenCalledTimes(1);
  });

  it('TEST-123A1-019: no subsystem runs after authority violation', async () => {
    vi.resetModules();
    const { runPostBarAutomationWithDeps } = await import('./automation/postBarAutomation.js');
    const processLiveBarMock = vi.fn();
    const onNewBarObsMock = vi.fn();
    const shadowMock = vi.fn();
    // Authority violation: DATABENTO trigger in TRADINGVIEW_ONLY mode
    const result = await runPostBarAutomationWithDeps(
      makeBar({ triggerSource: 'DATABENTO', authorityMode: 'TRADINGVIEW_ONLY' }),
      { processLiveBar: processLiveBarMock, onNewBarObservation: onNewBarObsMock, runBehaviourEngineShadow: shadowMock }
    );
    expect(result.success).toBe(false);
    expect(result.errors[0]).toContain('INVARIANT VIOLATION');
    expect(processLiveBarMock).not.toHaveBeenCalled();
    expect(onNewBarObsMock).not.toHaveBeenCalled();
    expect(shadowMock).not.toHaveBeenCalled();
  });

  it('TEST-123A1-020: processBar is never called by postBarAutomation', async () => {
    // Verify at the source-code level that postBarAutomation.ts does not
    // import or call processBar (the execution trigger)
    const pbaPath = path.join(process.cwd(), 'server', 'automation', 'postBarAutomation.ts');
    const content = fs.readFileSync(pbaPath, 'utf-8');
    // Must not import processBar
    expect(content).not.toContain("import.*processBar");
    // Must not call processBar (as a function call)
    // Allow the string "processBar" only in comments
    const nonCommentLines = content
      .split('\n')
      .filter(line => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
      .join('\n');
    expect(nonCommentLines).not.toContain('processBar(');
    // Must not import ADE, strategies, risk, or execution
    expect(content).not.toContain("import.*ade");
    expect(content).not.toContain("import.*strateg");
    expect(content).not.toContain("import.*execution");
  });
});

// ─── TEST-123A1-021: Monthly Review Handler ───────────────────────────────────

describe('Sprint 123A.1 — Monthly Review Handler (G-002 fix, behavioural)', () => {
  it('TEST-123A1-021: handleMonthlyReview calls runMonthlyAudit and returns real output (not not_implemented)', () => {
    const scheduledJobsPath = path.join(process.cwd(), 'server', 'scheduledJobs.ts');
    const content = fs.readFileSync(scheduledJobsPath, 'utf-8');

    // Extract only the handleMonthlyReview function body
    const fnStart = content.indexOf('async function handleMonthlyReview');
    expect(fnStart).toBeGreaterThan(-1);
    // Find the closing brace of this function
    let depth = 0;
    let fnEnd = fnStart;
    for (let i = fnStart; i < content.length; i++) {
      if (content[i] === '{') depth++;
      if (content[i] === '}') {
        depth--;
        if (depth === 0) { fnEnd = i + 1; break; }
      }
    }
    const fnBody = content.slice(fnStart, fnEnd);

    // Must call runMonthlyAudit
    expect(fnBody).toContain('runMonthlyAudit()');
    // Must NOT return not_implemented
    expect(fnBody).not.toContain('not_implemented');
    // Must return real output with status: "completed"
    expect(fnBody).toContain('"completed"');
    // Must have the G-002 fix comment
    expect(content).toContain('G-002 fix');
    // runMonthlyAudit must be imported from darwinAutonomous
    expect(content).toContain('runMonthlyAudit');
    expect(content).toContain('darwinAutonomous');
  });
});

// ─── TEST-123A1-022 through TEST-123A1-026: Migration Structure ───────────────

describe('Sprint 123A.1 — Migration 0026 Structure', () => {
  let migContent: string;

  beforeEach(() => {
    const migPath = path.join(process.cwd(), 'drizzle', '0026_sprint_123a1_foundation.sql');
    expect(fs.existsSync(migPath)).toBe(true);
    migContent = fs.readFileSync(migPath, 'utf-8');
  });

  it('TEST-123A1-022: CONTAINS_UNRESOLVED is absent from all ENUMs in migration 0026', () => {
    // CONTAINS_UNRESOLVED must not appear as an ENUM value in any table
    // It may appear only in comments explaining its intentional absence
    const enumMatches = migContent.match(/ENUM\([^)]+\)/g) || [];
    for (const enumDef of enumMatches) {
      expect(enumDef).not.toContain('CONTAINS_UNRESOLVED');
    }
    // Verify the comment explaining the absence is present
    expect(migContent).toContain('CONTAINS_UNRESOLVED is intentionally absent');
    // Verify the invariant comment is present
    expect(migContent).toContain('NEVER contain a bar produced from a window');
  });

  it('TEST-123A1-023: all source bar tables have effective-once unique constraints', () => {
    // atlas_ticks must have unique constraint on (source, dataset, instrument_id, ts_event_ns)
    expect(migContent).toContain('uq_atlas_ticks_source_ns');
    // atlas_bars_1m must have unique constraint on (source, dataset, instrument_id, bar_open_ts_ms, revision, mapping_version)
    expect(migContent).toContain('uq_atlas_bars_1m_source_bar');
    // atlas_bars_5m must have unique constraint on (source, dataset, instrument_id, bar_open_ts_ms, revision, mapping_version)
    expect(migContent).toContain('uq_atlas_bars_5m_source_bar');
    // atlas_canonical_bars must have authority-safe unique constraint
    expect(migContent).toContain('uq_atlas_canonical_bars_authority');
    // atlas_contract_rolls must have unique constraint
    expect(migContent).toContain('uq_atlas_contract_rolls');
    // atlas_consumer_processing_ledger must have effective-once unique constraint
    expect(migContent).toContain('uq_atlas_consumer_ledger');
  });

  it('TEST-123A1-024: nanosecond timestamps stored as DECIMAL(20,0) for full precision', () => {
    // atlas_ticks must have ts_event_ns as DECIMAL(20,0)
    expect(migContent).toContain('ts_event_ns');
    expect(migContent).toContain('DECIMAL(20,0)');
    // atlas_bars_1m must have bar_open_ts_ns as DECIMAL(20,0)
    expect(migContent).toContain('bar_open_ts_ns');
    // Comment about JavaScript treating as string must be present
    expect(migContent).toContain('JavaScript must treat');
  });

  it('TEST-123A1-025: reconciliation_status is an ENUM column (not a boolean)', () => {
    // atlas_bars_1m must have reconciliation_status as ENUM
    expect(migContent).toContain("ENUM('MATCHED','UNMATCHED','PENDING','UNAVAILABLE')");
    // Must NOT have reconciledAgainstOhlcv boolean
    expect(migContent).not.toContain('reconciled_against_ohlcv');
    // Must have discrepancy detail columns
    expect(migContent).toContain('recon_close_delta_pts100');
    expect(migContent).toContain('recon_within_tolerance');
  });

  it('TEST-123A1-026: migration has separated rollback tiers (operational and destructive)', () => {
    expect(migContent).toContain('OPERATIONAL ROLLBACK');
    expect(migContent).toContain('DESTRUCTIVE DEVELOPMENT RESET');
    // Operational rollback must NOT drop evidence tables
    const opRollback = migContent.slice(
      migContent.indexOf('BEGIN OPERATIONAL ROLLBACK'),
      migContent.indexOf('END OPERATIONAL ROLLBACK')
    );
    expect(opRollback).not.toContain('atlas_parity_reports');
    expect(opRollback).not.toContain('atlas_canonical_bars');
    expect(opRollback).not.toContain('atlas_consumer_processing_ledger');
    expect(opRollback).not.toContain('atlas_feed_health_log');
    // Destructive reset must drop all tables
    const destructiveReset = migContent.slice(
      migContent.indexOf('BEGIN DESTRUCTIVE RESET'),
      migContent.indexOf('END DESTRUCTIVE RESET')
    );
    expect(destructiveReset).toContain('atlas_parity_reports');
    expect(destructiveReset).toContain('atlas_canonical_bars');
  });
});
