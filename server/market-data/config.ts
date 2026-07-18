/**
 * Atlas Market-Data Authority Configuration
 * Sprint 123A.1 — Foundation
 *
 * MARKET_DATA_AUTHORITY controls the data authority mode for the entire
 * Atlas market-data pipeline. No system may automatically promote itself
 * between modes. Every promotion requires:
 *   1. Documented validation evidence
 *   2. Explicit gate approval (Gate G2 through G6A)
 *   3. Rollback verification
 *   4. Phil's written authorisation
 *
 * Gate G0 approval (2026-07-18): TRADINGVIEW_ONLY is the only authorised
 * mode for Sprint 123A.1. All Databento authority modes are disabled.
 * Sprint 123A.1 must stop at Gate G1.
 *
 * Authority mode progression (requires separate gate approval for each step):
 *   TRADINGVIEW_ONLY          → current default (Sprint 123A.1)
 *   DATABENTO_SHADOW          → after Gate G3 (Sprint 123A.3)
 *   DATABENTO_CHART_AUTHORITY → after Gate G4 (Sprint 123A.4)
 *   DATABENTO_LEARNING_AUTHORITY → after Gate G6A (Sprint 123A.5, optional)
 *   DATABENTO_DECISION_AUTHORITY → Sprint 123B only (not part of Sprint 123A)
 */

export type MarketDataAuthorityMode =
  | 'TRADINGVIEW_ONLY'
  | 'DATABENTO_SHADOW'
  | 'DATABENTO_CHART_AUTHORITY'
  | 'DATABENTO_LEARNING_AUTHORITY'
  | 'DATABENTO_DECISION_AUTHORITY';

/**
 * Returns the current market-data authority mode from the environment.
 * Defaults to TRADINGVIEW_ONLY if unset or invalid.
 *
 * The environment variable MARKET_DATA_AUTHORITY must be set explicitly
 * to activate any Databento mode. It will never be auto-promoted.
 */
export function getMarketDataAuthority(): MarketDataAuthorityMode {
  const raw = process.env.MARKET_DATA_AUTHORITY;
  const valid: MarketDataAuthorityMode[] = [
    'TRADINGVIEW_ONLY',
    'DATABENTO_SHADOW',
    'DATABENTO_CHART_AUTHORITY',
    'DATABENTO_LEARNING_AUTHORITY',
    'DATABENTO_DECISION_AUTHORITY',
  ];
  if (raw && valid.includes(raw as MarketDataAuthorityMode)) {
    return raw as MarketDataAuthorityMode;
  }
  // Default: TRADINGVIEW_ONLY — safe fallback, no Databento connection
  return 'TRADINGVIEW_ONLY';
}

/**
 * Sprint 123A.1 invariants — these must all be true during Sprint 123A.1.
 * Any violation is a critical error and must stop execution.
 */
export function assertSprint123A1Invariants(): void {
  const mode = getMarketDataAuthority();

  // Databento must not be connected in Sprint 123A.1
  if (process.env.DATABENTO_LIVE_ENABLED === 'true') {
    throw new Error(
      '[Sprint 123A.1] DATABENTO_LIVE_ENABLED=true is not authorised in Sprint 123A.1. ' +
      'Gate G2 approval required before Databento connection is permitted.'
    );
  }

  // Decision authority is Sprint 123B only
  if (mode === 'DATABENTO_DECISION_AUTHORITY') {
    throw new Error(
      '[Sprint 123A.1] DATABENTO_DECISION_AUTHORITY is not part of Sprint 123A. ' +
      'This authority mode is reserved exclusively for Sprint 123B.'
    );
  }

  // Shadow and above require Gate G3+ approval
  if (
    mode === 'DATABENTO_SHADOW' ||
    mode === 'DATABENTO_CHART_AUTHORITY' ||
    mode === 'DATABENTO_LEARNING_AUTHORITY'
  ) {
    throw new Error(
      `[Sprint 123A.1] Authority mode ${mode} is not authorised in Sprint 123A.1. ` +
      'Gate G3 approval required before any Databento shadow mode is activated.'
    );
  }
}

// ─── Derived authority predicates ────────────────────────────────────────────

/** True only when TradingView is the sole data authority (Sprint 123A.1 default). */
export function isTradingViewOnly(): boolean {
  return getMarketDataAuthority() === 'TRADINGVIEW_ONLY';
}

/** True when Databento is connected in shadow mode (Sprint 123A.3+). */
export function isDatabentoShadow(): boolean {
  return getMarketDataAuthority() === 'DATABENTO_SHADOW';
}

/** True when Databento is the chart and canonical candle authority (Sprint 123A.4+). */
export function isDatabentoChartAuthority(): boolean {
  return getMarketDataAuthority() === 'DATABENTO_CHART_AUTHORITY';
}

/**
 * True when Databento triggers postBarAutomation (Sprint 123A.5 Gate G6A, optional).
 * processBar() remains TradingView-owned even in this mode.
 */
export function isDatabentoLearningAuthority(): boolean {
  return getMarketDataAuthority() === 'DATABENTO_LEARNING_AUTHORITY';
}

/**
 * True when Databento is the full decision authority (Sprint 123B only).
 * This mode is never activated in Sprint 123A.
 */
export function isDatabentoDecisionAuthority(): boolean {
  return getMarketDataAuthority() === 'DATABENTO_DECISION_AUTHORITY';
}

/**
 * True when Databento is connected in any capacity (shadow or above).
 * Used to gate Databento-specific processing paths.
 * Always false in Sprint 123A.1.
 */
export function isDatabentoConnected(): boolean {
  const mode = getMarketDataAuthority();
  return (
    mode === 'DATABENTO_SHADOW' ||
    mode === 'DATABENTO_CHART_AUTHORITY' ||
    mode === 'DATABENTO_LEARNING_AUTHORITY' ||
    mode === 'DATABENTO_DECISION_AUTHORITY'
  );
}

/**
 * True when postBarAutomation should be triggered by a Databento canonical bar
 * rather than a TradingView bar.
 * Only true in DATABENTO_LEARNING_AUTHORITY and DATABENTO_DECISION_AUTHORITY.
 * Always false in Sprint 123A.1.
 */
export function isDatabentoPostBarAutomationTrigger(): boolean {
  const mode = getMarketDataAuthority();
  return (
    mode === 'DATABENTO_LEARNING_AUTHORITY' ||
    mode === 'DATABENTO_DECISION_AUTHORITY'
  );
}

/**
 * processBar() is ALWAYS owned by TradingView in Sprint 123A.
 * This invariant is enforced by TEST-123A5-008.
 * Returns true if the current mode allows Databento to trigger processBar.
 * This must always return false in Sprint 123A.
 */
export function isDatabentoProcessBarTrigger(): boolean {
  // CRITICAL INVARIANT: Databento must never trigger processBar in Sprint 123A.
  // processBar is exclusively TradingView-owned until Sprint 123B
  // (DATABENTO_DECISION_AUTHORITY).
  // This function exists only to make the invariant explicit and testable.
  return false; // Always false in Sprint 123A
}
