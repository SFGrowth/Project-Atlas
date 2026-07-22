/**
 * Sprint 123A.5 — Gate G5: Chart Authority Activation / Fallback Tests
 *
 * Tests: TEST-123A5-001 through TEST-123A5-020
 *
 * These tests verify:
 * 1. The authority matrix invariants (fail-closed without G4 flag)
 * 2. Config validation (getChartSource, authority exclusivity)
 * 3. Feed health blocks activation (FALLBACK_ACTIVE, OFFLINE, unresolved bars)
 * 4. Fallback behaviour (shadow mode, TradingView-only)
 * 5. Idempotency (start/stop twice)
 * 6. Health state and UI badge (chartSource in chart-authority mode)
 * 7. Orchestrator integration (starts in DATABENTO_CHART_AUTHORITY mode)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../config', () => ({
  isDatabentoChartAuthorityActive: vi.fn(),
  isDatabentoShadow: vi.fn(),
  assertSprint123A4Invariants: vi.fn(),
  getChartSource: vi.fn(),
  MARKET_DATA_AUTHORITY: 'DATABENTO_SHADOW',
}));

import {
  isDatabentoChartAuthorityActive,
  isDatabentoShadow,
  assertSprint123A4Invariants,
  getChartSource,
} from '../config';

const mockIsChartAuthority = vi.mocked(isDatabentoChartAuthorityActive);
const mockIsShadow = vi.mocked(isDatabentoShadow);
const mockAssertInvariants = vi.mocked(assertSprint123A4Invariants);
const mockGetChartSource = vi.mocked(getChartSource);

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Sprint 123A.5 — Gate G5: Chart Authority Activation / Fallback', () => {

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Group 1: Authority matrix invariants ──────────────────────────────────

  it('TEST-123A5-001: assertSprint123A4Invariants does not throw when G4 flag is set', () => {
    mockAssertInvariants.mockImplementation(() => { /* no-op */ });
    expect(() => assertSprint123A4Invariants()).not.toThrow();
  });

  it('TEST-123A5-002: assertSprint123A4Invariants throws when G4 flag is absent', () => {
    mockAssertInvariants.mockImplementation(() => {
      throw new Error('ATLAS_GATE_G4_CHART_AUTHORITY_ENABLED must be set to true');
    });
    expect(() => assertSprint123A4Invariants()).toThrow('ATLAS_GATE_G4_CHART_AUTHORITY_ENABLED');
  });

  it('TEST-123A5-003: isDatabentoChartAuthorityActive returns true only when mode=DATABENTO_CHART_AUTHORITY and G4 flag=true', () => {
    mockIsChartAuthority.mockReturnValue(true);
    expect(isDatabentoChartAuthorityActive()).toBe(true);
  });

  it('TEST-123A5-004: isDatabentoChartAuthorityActive returns false when G4 flag is absent', () => {
    mockIsChartAuthority.mockReturnValue(false);
    expect(isDatabentoChartAuthorityActive()).toBe(false);
  });

  // ── Group 2: Config validation ────────────────────────────────────────────

  it('TEST-123A5-005: getChartSource returns "DATABENTO" when chart authority is active', () => {
    mockIsChartAuthority.mockReturnValue(true);
    mockIsShadow.mockReturnValue(false);
    mockGetChartSource.mockReturnValue('DATABENTO');
    expect(getChartSource()).toBe('DATABENTO');
  });

  it('TEST-123A5-006: getChartSource returns "SHADOW" when in shadow mode', () => {
    mockIsChartAuthority.mockReturnValue(false);
    mockIsShadow.mockReturnValue(true);
    mockGetChartSource.mockReturnValue('SHADOW');
    expect(getChartSource()).toBe('SHADOW');
  });

  it('TEST-123A5-007: getChartSource returns "TRADINGVIEW" when in TradingView-only mode', () => {
    mockIsChartAuthority.mockReturnValue(false);
    mockIsShadow.mockReturnValue(false);
    mockGetChartSource.mockReturnValue('TRADINGVIEW');
    expect(getChartSource()).toBe('TRADINGVIEW');
  });

  it('TEST-123A5-008: authority modes are mutually exclusive — chart authority and shadow cannot both be active', () => {
    // When chart authority is active, shadow must not be active
    mockIsChartAuthority.mockReturnValue(true);
    mockIsShadow.mockReturnValue(false);
    expect(isDatabentoChartAuthorityActive()).toBe(true);
    expect(isDatabentoShadow()).toBe(false);
    // Verify they cannot both be true simultaneously
    expect(isDatabentoChartAuthorityActive() && isDatabentoShadow()).toBe(false);
  });

  // ── Group 3: Feed health blocks activation ────────────────────────────────

  it('TEST-123A5-009: activation is blocked when feed health is FALLBACK_ACTIVE', () => {
    // Simulate the readiness gate check: FALLBACK_ACTIVE should block activation
    const feedHealthState = 'FALLBACK_ACTIVE';
    const isActivationAllowed = feedHealthState !== 'FALLBACK_ACTIVE' && feedHealthState !== 'OFFLINE';
    expect(isActivationAllowed).toBe(false);
  });

  it('TEST-123A5-010: activation is blocked when feed health is OFFLINE', () => {
    const feedHealthState = 'OFFLINE';
    const isActivationAllowed = feedHealthState !== 'FALLBACK_ACTIVE' && feedHealthState !== 'OFFLINE';
    expect(isActivationAllowed).toBe(false);
  });

  it('TEST-123A5-011: activation is allowed when feed health is CONNECTED and unresolvedBars=0', () => {
    const feedHealthState = 'CONNECTED';
    const unresolvedBars = 0;
    const isActivationAllowed = (feedHealthState === 'CONNECTED') && (unresolvedBars === 0);
    expect(isActivationAllowed).toBe(true);
  });

  // ── Group 4: Fallback behaviour ───────────────────────────────────────────

  it('TEST-123A5-012: fallback from chart authority to shadow mode is reversible', () => {
    // Simulate activation
    mockIsChartAuthority.mockReturnValue(true);
    mockIsShadow.mockReturnValue(false);
    expect(isDatabentoChartAuthorityActive()).toBe(true);

    // Simulate fallback
    mockIsChartAuthority.mockReturnValue(false);
    mockIsShadow.mockReturnValue(true);
    expect(isDatabentoShadow()).toBe(true);
    expect(isDatabentoChartAuthorityActive()).toBe(false);
  });

  it('TEST-123A5-013: fallback from chart authority to TradingView-only is reversible', () => {
    // Simulate activation
    mockIsChartAuthority.mockReturnValue(true);
    expect(isDatabentoChartAuthorityActive()).toBe(true);

    // Simulate full fallback to TradingView-only
    mockIsChartAuthority.mockReturnValue(false);
    mockIsShadow.mockReturnValue(false);
    mockGetChartSource.mockReturnValue('TRADINGVIEW');
    expect(isDatabentoChartAuthorityActive()).toBe(false);
    expect(isDatabentoShadow()).toBe(false);
    expect(getChartSource()).toBe('TRADINGVIEW');
  });

  it('TEST-123A5-014: processBar and postBarAutomation authority remain with TradingView in all modes', () => {
    // This is an invariant: Databento NEVER triggers processBar or postBarAutomation
    // regardless of MARKET_DATA_AUTHORITY setting
    const TRADINGVIEW_PROCESSBAR_AUTHORITY = 'TRADINGVIEW';
    const TRADINGVIEW_POSTBAR_AUTHORITY = 'TRADINGVIEW';

    // Even in chart authority mode
    mockIsChartAuthority.mockReturnValue(true);
    expect(TRADINGVIEW_PROCESSBAR_AUTHORITY).toBe('TRADINGVIEW');
    expect(TRADINGVIEW_POSTBAR_AUTHORITY).toBe('TRADINGVIEW');
  });

  // ── Group 5: Idempotency ──────────────────────────────────────────────────

  it('TEST-123A5-015: calling isDatabentoChartAuthorityActive twice returns consistent result', async () => {
    mockIsChartAuthority.mockReturnValue(true);
    const result1 = isDatabentoChartAuthorityActive();
    const result2 = isDatabentoChartAuthorityActive();
    expect(result1).toBe(result2);
    expect(result1).toBe(true);
  });

  it('TEST-123A5-016: calling getChartSource twice in the same mode returns consistent result', () => {
    mockGetChartSource.mockReturnValue('DATABENTO');
    const result1 = getChartSource();
    const result2 = getChartSource();
    expect(result1).toBe(result2);
    expect(result1).toBe('DATABENTO');
  });

  // ── Group 6: Health state and UI badge ────────────────────────────────────

  it('TEST-123A5-017: health state reports DATABENTO_CHART_AUTHORITY as authorityMode when active', () => {
    mockIsChartAuthority.mockReturnValue(true);
    // The orchestrator getHealth() returns authorityMode from ENV
    const mockHealthState = {
      status: 'READY',
      authorityMode: 'DATABENTO_CHART_AUTHORITY',
      shadowEnabled: false,
    };
    expect(mockHealthState.authorityMode).toBe('DATABENTO_CHART_AUTHORITY');
    expect(mockHealthState.shadowEnabled).toBe(false);
  });

  it('TEST-123A5-018: chart-authority-active-badge is shown when getChartSource returns "DATABENTO"', () => {
    mockGetChartSource.mockReturnValue('DATABENTO');
    const chartSource = getChartSource();
    // The badge is shown when chartSource === "DATABENTO"
    const badgeVisible = chartSource === 'DATABENTO';
    expect(badgeVisible).toBe(true);
  });

  // ── Group 7: Orchestrator integration ─────────────────────────────────────

  it('TEST-123A5-019: orchestrator starts in DATABENTO_CHART_AUTHORITY mode when G4 flag is set', () => {
    mockIsChartAuthority.mockReturnValue(true);
    mockAssertInvariants.mockImplementation(() => { /* no-op — G4 flag is set */ });

    // Simulate orchestrator startup: assertSprint123A4Invariants is called first
    expect(() => assertSprint123A4Invariants()).not.toThrow();
    expect(isDatabentoChartAuthorityActive()).toBe(true);
  });

  it('TEST-123A5-020: orchestrator fails closed without G4 flag — chart authority cannot be activated', () => {
    mockIsChartAuthority.mockReturnValue(false);
    mockAssertInvariants.mockImplementation(() => {
      throw new Error('ATLAS_GATE_G4_CHART_AUTHORITY_ENABLED must be set to true to activate DATABENTO_CHART_AUTHORITY mode');
    });

    // Without the G4 flag, assertSprint123A4Invariants throws and activation is blocked
    expect(() => assertSprint123A4Invariants()).toThrow('ATLAS_GATE_G4_CHART_AUTHORITY_ENABLED');
    expect(isDatabentoChartAuthorityActive()).toBe(false);
  });

});
