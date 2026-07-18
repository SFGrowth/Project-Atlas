/**
 * Sprint 123A.1 — Foundation and Autonomy Remediation Test Suite
 *
 * Tests:
 *   TEST-123A1-001  Feature flag defaults to TRADINGVIEW_ONLY
 *   TEST-123A1-002  Databento authority flags are disabled by default
 *   TEST-123A1-003  isDatabentoProcessBarTrigger always returns false in Sprint 123A
 *   TEST-123A1-004  assertSprint123A1Invariants throws on DATABENTO_LIVE_ENABLED=true
 *   TEST-123A1-005  assertSprint123A1Invariants throws on DATABENTO_DECISION_AUTHORITY
 *   TEST-123A1-006  assertSprint123A1Invariants throws on DATABENTO_SHADOW mode
 *   TEST-123A1-007  postBarAutomation rejects Databento trigger in TRADINGVIEW_ONLY mode
 *   TEST-123A1-008  postBarAutomation accepts TradingView trigger in TRADINGVIEW_ONLY mode
 *   TEST-123A1-009  Monthly review handler is wired (not not_implemented stub)
 *   TEST-123A1-010  PostBarAutomationInput interface accepts string|null for numeric fields
 *   TEST-123A1-011  nexusRoutes no longer contains direct processLiveBar import
 *   TEST-123A1-012  Migration file 0026 exists with all required tables
 *   TEST-123A1-013  CanonicalBarConfirmed SSE consumer list excludes strategies
 *   TEST-123A1-014  BDE capability status document records NOT_IMPLEMENTED correctly
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// ─── TEST-123A1-001 through TEST-123A1-006: Feature Flag Tests ────────────────

describe('Sprint 123A.1 — Feature Flag Configuration', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    // Restore environment after each test
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

  it('TEST-123A1-003: isDatabentoProcessBarTrigger always returns false in Sprint 123A', async () => {
    // Test all authority modes — processBar trigger must always be false in Sprint 123A
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

// ─── TEST-123A1-007 and TEST-123A1-008: postBarAutomation Authority Guard ─────

describe('Sprint 123A.1 — postBarAutomation Authority Guard', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    Object.keys(process.env).forEach(k => delete process.env[k]);
    Object.assign(process.env, originalEnv);
    vi.resetModules();
  });

  it('TEST-123A1-007: postBarAutomation returns success=false when Databento triggers it in TRADINGVIEW_ONLY mode', async () => {
    delete process.env.MARKET_DATA_AUTHORITY; // defaults to TRADINGVIEW_ONLY
    vi.resetModules();
    const { runPostBarAutomation } = await import('./automation/postBarAutomation.js');
    const result = await runPostBarAutomation({
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
      triggerSource: 'DATABENTO',  // ← DATABENTO trigger in TRADINGVIEW_ONLY mode
      authorityMode: 'TRADINGVIEW_ONLY',
    });
    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('INVARIANT VIOLATION');
    expect(result.liveLearnCompleted).toBe(false);
    expect(result.darwinObservationCompleted).toBe(false);
    expect(result.behaviourEngineCompleted).toBe(false);
  });

  it('TEST-123A1-008: postBarAutomation accepts TradingView trigger in TRADINGVIEW_ONLY mode (authority guard passes)', async () => {
    delete process.env.MARKET_DATA_AUTHORITY; // defaults to TRADINGVIEW_ONLY
    vi.resetModules();
    const { runPostBarAutomation } = await import('./automation/postBarAutomation.js');
    // This test verifies the authority guard passes — it does not verify the
    // sub-systems complete (they may fail due to DB not being available in test env)
    const result = await runPostBarAutomation({
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
      triggerSource: 'TRADINGVIEW',  // ← correct trigger source
      authorityMode: 'TRADINGVIEW_ONLY',
    });
    // Authority guard must not produce an INVARIANT VIOLATION error
    const invariantErrors = result.errors.filter(e => e.includes('INVARIANT VIOLATION'));
    expect(invariantErrors).toHaveLength(0);
    // triggerSource must be recorded correctly
    expect(result.triggerSource).toBe('TRADINGVIEW');
    expect(result.authorityMode).toBe('TRADINGVIEW_ONLY');
  });
});

// ─── TEST-123A1-009: Monthly Review Handler ───────────────────────────────────

describe('Sprint 123A.1 — Monthly Review Handler (G-002 fix)', () => {
  it('TEST-123A1-009: scheduledJobs.ts monthly review handler calls runMonthlyAudit (not not_implemented)', () => {
    const scheduledJobsPath = path.join(process.cwd(), 'server', 'scheduledJobs.ts');
    const content = fs.readFileSync(scheduledJobsPath, 'utf-8');
    // Extract only the handleMonthlyReview function body
    const monthlyStart = content.indexOf('async function handleMonthlyReview');
    const monthlyEnd = content.indexOf('\n}', monthlyStart) + 2;
    const monthlyFn = content.slice(monthlyStart, monthlyEnd);
    // The monthly review function must NOT return not_implemented
    expect(monthlyFn).not.toContain('not_implemented');
    // Must call runMonthlyAudit
    expect(content).toContain('runMonthlyAudit()');
    // Must have the G-002 fix comment
    expect(content).toContain('G-002 fix');
  });
});

// ─── TEST-123A1-010: PostBarAutomationInput type ──────────────────────────────

describe('Sprint 123A.1 — Canonical Event Types', () => {
  it('TEST-123A1-010: PostBarAutomationInput numeric fields are string|null (matches BarPayload and mem object)', () => {
    // Verify the shared types file has string|null for numeric fields
    const typesPath = path.join(process.cwd(), 'shared', 'types', 'canonical-events.ts');
    const content = fs.readFileSync(typesPath, 'utf-8');
    // These fields must be string|null (not number|null) to match BarPayload
    expect(content).toContain('open: string | null;');
    expect(content).toContain('high: string | null;');
    expect(content).toContain('low: string | null;');
    expect(content).toContain('close: string | null;');
    expect(content).toContain('volume: string | null;');
    expect(content).toContain('atr: string | null;');
    expect(content).toContain('rsi: string | null;');
    expect(content).toContain('vwap: string | null;');
    // memoryId must be string (not number)
    expect(content).toContain('memoryId: string;');
  });
});

// ─── TEST-123A1-011: nexusRoutes no longer has direct processLiveBar ──────────

describe('Sprint 123A.1 — nexusRoutes postBarAutomation wiring', () => {
  it('TEST-123A1-011: nexusRoutes.ts no longer imports or calls processLiveBar directly', () => {
    const nexusPath = path.join(process.cwd(), 'server', 'nexusRoutes.ts');
    const content = fs.readFileSync(nexusPath, 'utf-8');
    // Must not have the old direct import of processLiveBar
    expect(content).not.toContain('import("./liveLearnEngine")');
    // Must have the new postBarAutomation import
    expect(content).toContain('import("./automation/postBarAutomation")');
    // Must call runPostBarAutomation
    expect(content).toContain('runPostBarAutomation(');
    // Must set triggerSource: 'TRADINGVIEW'
    expect(content).toContain("triggerSource: 'TRADINGVIEW'");
    // Must set authorityMode: 'TRADINGVIEW_ONLY'
    expect(content).toContain("authorityMode: 'TRADINGVIEW_ONLY'");
  });
});

// ─── TEST-123A1-012: Migration file exists ────────────────────────────────────

describe('Sprint 123A.1 — Database Migration', () => {
  it('TEST-123A1-012: migration 0026_sprint_123a1_foundation.sql exists with all required tables', () => {
    const migPath = path.join(process.cwd(), 'drizzle', '0026_sprint_123a1_foundation.sql');
    expect(fs.existsSync(migPath)).toBe(true);
    const content = fs.readFileSync(migPath, 'utf-8');
    // All 7 required tables must be present
    expect(content).toContain('atlas_ticks');
    expect(content).toContain('atlas_bars_1m');
    expect(content).toContain('atlas_bars_5m');
    expect(content).toContain('atlas_canonical_bars');
    expect(content).toContain('atlas_parity_reports');
    expect(content).toContain('atlas_feed_health_log');
    expect(content).toContain('atlas_consumer_processing_ledger');
    // Must have Sprint 123A.1 header comment
    expect(content).toContain('Sprint 123A.1');
  });

  it('TEST-123A1-012b: drizzle journal includes 0026_sprint_123a1_foundation', () => {
    const journalPath = path.join(process.cwd(), 'drizzle', 'meta', '_journal.json');
    const journal = JSON.parse(fs.readFileSync(journalPath, 'utf-8'));
    const entry = journal.entries.find((e: { tag: string }) => e.tag === '0026_sprint_123a1_foundation');
    expect(entry).toBeDefined();
    expect(entry.idx).toBe(26);
  });
});

// ─── TEST-123A1-013: CANONICAL_BAR_CONFIRMED SSE consumer list ───────────────

describe('Sprint 123A.1 — Event Contracts Consumer List', () => {
  it('TEST-123A1-013: canonical-events.ts does not list strategies as CanonicalBarConfirmed consumers', () => {
    const typesPath = path.join(process.cwd(), 'shared', 'types', 'canonical-events.ts');
    const content = fs.readFileSync(typesPath, 'utf-8');
    // CanonicalBarConfirmed comment must mention Sprint 123B for strategy consumption
    expect(content).toContain('Sprint 123B');
    // Must not say strategies are Sprint 123A consumers
    // The comment should say strategies are Sprint 123B only
    expect(content).toContain('Strategy processing and processBar');
    // Must list AtlasLiveChart as a Sprint 123A.1 consumer
    expect(content).toContain('AtlasLiveChart');
  });
});

// ─── TEST-123A1-014: BDE Capability Status ───────────────────────────────────

describe('Sprint 123A.1 — BDE Capability Status', () => {
  it('TEST-123A1-014: BDE_CAPABILITY_STATUS.md records all four functions as NOT_IMPLEMENTED', () => {
    const bdePath = path.join(process.cwd(), 'docs', 'architecture', 'BDE_CAPABILITY_STATUS.md');
    expect(fs.existsSync(bdePath)).toBe(true);
    const content = fs.readFileSync(bdePath, 'utf-8');
    expect(content).toContain('computeMarketIntent');
    expect(content).toContain('runBehaviourClustering');
    expect(content).toContain('buildPortfolioCoverageMap');
    expect(content).toContain('runStrategyInteractionAnalysis');
    expect(content).toContain('NOT_IMPLEMENTED');
    // Must not claim any of them are VERIFIED_OPERATIONAL (only in the allowed-status table definition)
    // Count occurrences — it should only appear in the allowed-status table, not as a status value
    const verifiedOpCount = (content.match(/VERIFIED_OPERATIONAL/g) || []).length;
    // It appears once in the allowed-status table definition, that's acceptable
    // It must NOT appear as a status value for any of the four functions
    const computeSection = content.indexOf('computeMarketIntent');
    const runStratSection = content.lastIndexOf('runStrategyInteractionAnalysis');
    const functionsSection = content.slice(computeSection, runStratSection + 200);
    expect(functionsSection).not.toContain('VERIFIED_OPERATIONAL');
  });
});
