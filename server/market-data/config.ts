/**
 * Atlas Market Data Authority — Feature Flag Configuration
 * Sprint 123A.1 — Foundation (Gate G1 Revision 2)
 *
 * MARKET_DATA_AUTHORITY controls which feed is the source of truth
 * for each processing function. The default is TRADINGVIEW_ONLY.
 *
 * Sprint 123A authority modes (the ONLY valid values in Sprint 123A):
 *   TRADINGVIEW_ONLY           — TradingView is the sole data source.
 *   DATABENTO_SHADOW           — Databento runs in parallel but does not
 *                                trigger any processing. Requires Gate G3.
 *   DATABENTO_CHART_AUTHORITY  — Databento drives AtlasLiveChart.
 *                                TradingView remains the processBar trigger.
 *                                Requires Gate G4.
 *   DATABENTO_LEARNING_AUTHORITY — Databento drives postBarAutomation,
 *                                  DARWIN, and learning systems.
 *                                  TradingView remains the processBar trigger.
 *                                  Requires Gate G6A.
 *
 * DATABENTO_DECISION_AUTHORITY is Sprint 123B only.
 * It is NOT a valid Sprint 123A value. Setting it will cause
 * getMarketDataAuthority() and assertSprint123A1Invariants() to throw.
 *
 * postBarAutomation authority matrix (enforced at runtime):
 *   TRADINGVIEW_ONLY           → triggerSource must be TRADINGVIEW
 *   DATABENTO_SHADOW           → triggerSource must be TRADINGVIEW
 *   DATABENTO_CHART_AUTHORITY  → triggerSource must be TRADINGVIEW
 *   DATABENTO_LEARNING_AUTHORITY → triggerSource must be DATABENTO
 *
 * Any other combination is an invariant violation and must abort before
 * any subsystem is called.
 */

/**
 * Sprint 123A valid authority modes.
 * DATABENTO_DECISION_AUTHORITY is intentionally excluded — it is Sprint 123B only.
 */
export type Sprint123AAuthorityMode =
  | 'TRADINGVIEW_ONLY'
  | 'DATABENTO_SHADOW'
  | 'DATABENTO_CHART_AUTHORITY'
  | 'DATABENTO_LEARNING_AUTHORITY';

/**
 * @deprecated Use Sprint123AAuthorityMode.
 * Retained for backward compatibility with existing callers.
 */
export type MarketDataAuthorityMode = Sprint123AAuthorityMode;

const SPRINT_123A_VALID_MODES: readonly Sprint123AAuthorityMode[] = [
  'TRADINGVIEW_ONLY',
  'DATABENTO_SHADOW',
  'DATABENTO_CHART_AUTHORITY',
  'DATABENTO_LEARNING_AUTHORITY',
] as const;

/**
 * Returns the current market data authority mode.
 * Defaults to TRADINGVIEW_ONLY if unset or invalid.
 *
 * Throws if DATABENTO_DECISION_AUTHORITY is set — it is Sprint 123B only
 * and must fail closed with a clear error rather than silently falling back.
 */
export function getMarketDataAuthority(): Sprint123AAuthorityMode {
  const raw = process.env.MARKET_DATA_AUTHORITY;
  if (!raw) return 'TRADINGVIEW_ONLY';

  // Explicitly reject Sprint 123B mode — fail closed with a clear error
  if (raw === 'DATABENTO_DECISION_AUTHORITY') {
    throw new Error(
      '[Atlas config] DATABENTO_DECISION_AUTHORITY is reserved for Sprint 123B. ' +
      'It is not a valid Sprint 123A authority mode. ' +
      'Valid Sprint 123A modes: ' + SPRINT_123A_VALID_MODES.join(', ')
    );
  }

  if ((SPRINT_123A_VALID_MODES as readonly string[]).includes(raw)) {
    return raw as Sprint123AAuthorityMode;
  }

  console.warn(
    `[Atlas config] Unknown MARKET_DATA_AUTHORITY value "${raw}". ` +
    'Falling back to TRADINGVIEW_ONLY.'
  );
  return 'TRADINGVIEW_ONLY';
}

// ─── Authority mode predicates ────────────────────────────────────────────────

/** True only when TradingView is the sole data authority (Sprint 123A.1 default). */
export function isTradingViewOnly(): boolean {
  return getMarketDataAuthority() === 'TRADINGVIEW_ONLY';
}

/** True when Databento is connected in shadow mode (Sprint 123A.3+, Gate G3). */
export function isDatabentoShadow(): boolean {
  return getMarketDataAuthority() === 'DATABENTO_SHADOW';
}

/** True when Databento is the chart authority (Sprint 123A.4+, Gate G4). */
export function isDatabentoChartAuthority(): boolean {
  return getMarketDataAuthority() === 'DATABENTO_CHART_AUTHORITY';
}

/**
 * True when Databento triggers postBarAutomation (Sprint 123A.5, Gate G6A).
 * processBar() remains TradingView-owned even in this mode.
 */
export function isDatabentoLearningAuthority(): boolean {
  return getMarketDataAuthority() === 'DATABENTO_LEARNING_AUTHORITY';
}

/**
 * DATABENTO_DECISION_AUTHORITY is Sprint 123B only.
 * This predicate always returns false in Sprint 123A.
 * It is provided only for forward-compatibility type safety.
 */
export function isDatabentoDecisionAuthority(): false {
  return false;
}

/**
 * True when Databento is connected in any Sprint 123A capacity.
 * Does NOT include DATABENTO_DECISION_AUTHORITY (Sprint 123B only).
 * Always false in Sprint 123A.1 (TRADINGVIEW_ONLY default).
 */
export function isDatabentoConnected(): boolean {
  const mode = getMarketDataAuthority();
  return (
    mode === 'DATABENTO_SHADOW' ||
    mode === 'DATABENTO_CHART_AUTHORITY' ||
    mode === 'DATABENTO_LEARNING_AUTHORITY'
  );
}

/**
 * Returns the expected postBarAutomation trigger source for the given mode.
 *
 * Complete authority matrix:
 *   TRADINGVIEW_ONLY           → TRADINGVIEW
 *   DATABENTO_SHADOW           → TRADINGVIEW
 *   DATABENTO_CHART_AUTHORITY  → TRADINGVIEW
 *   DATABENTO_LEARNING_AUTHORITY → DATABENTO
 */
export function getExpectedPostBarTriggerSource(
  mode: Sprint123AAuthorityMode
): 'TRADINGVIEW' | 'DATABENTO' {
  if (mode === 'DATABENTO_LEARNING_AUTHORITY') return 'DATABENTO';
  return 'TRADINGVIEW';
}

/**
 * Validates that a postBarAutomation trigger is authorised.
 * Returns null if valid, or an error message string if invalid.
 *
 * Validates two things:
 *   1. The authorityMode in the payload matches the live environment value.
 *   2. The triggerSource matches the authority matrix for the live mode.
 *
 * A mismatch on either check is an invariant violation.
 * postBarAutomation must abort before any subsystem is called.
 */
export function validatePostBarTrigger(
  triggerSource: 'TRADINGVIEW' | 'DATABENTO',
  payloadAuthorityMode: Sprint123AAuthorityMode
): string | null {
  // Check 1: payload authority mode must match the live environment
  const liveMode = getMarketDataAuthority();
  if (payloadAuthorityMode !== liveMode) {
    return (
      `[Atlas config] INVARIANT VIOLATION: postBarAutomation payload ` +
      `authorityMode="${payloadAuthorityMode}" does not match live ` +
      `MARKET_DATA_AUTHORITY="${liveMode}". Aborting before any subsystem is called.`
    );
  }

  // Check 2: trigger source must match the authority matrix
  const expectedSource = getExpectedPostBarTriggerSource(liveMode);
  if (triggerSource !== expectedSource) {
    return (
      `[Atlas config] INVARIANT VIOLATION: In ${liveMode} mode, ` +
      `postBarAutomation must be triggered by ${expectedSource}. ` +
      `Got triggerSource=${triggerSource}. Databento must not trigger ` +
      `postBarAutomation in shadow or chart-authority modes. Aborting.`
    );
  }

  return null; // valid
}

/**
 * True when postBarAutomation should be triggered by a Databento canonical bar.
 * Only true in DATABENTO_LEARNING_AUTHORITY mode.
 * Always false in Sprint 123A.1 (TRADINGVIEW_ONLY default).
 */
export function isDatabentoPostBarTrigger(): boolean {
  return getMarketDataAuthority() === 'DATABENTO_LEARNING_AUTHORITY';
}

/**
 * processBar() is ALWAYS owned by TradingView in Sprint 123A.
 * This invariant is enforced by TEST-123A5-008.
 * Always returns false — Databento never triggers processBar in Sprint 123A.
 */
export function isDatabentoProcessBarTrigger(): false {
  return false;
}

// ─── Sprint 123A.1 hard invariant checks ─────────────────────────────────────

/**
 * Throws a hard error if any Sprint 123A.1 invariant is violated.
 * Call this at application startup to fail fast on misconfiguration.
 *
 * Invariants checked:
 *   - DATABENTO_LIVE_ENABLED must not be set to 'true'
 *   - MARKET_DATA_AUTHORITY must not be DATABENTO_DECISION_AUTHORITY
 *   - DATABENTO_SHADOW requires Gate G3 (not yet approved)
 *   - DATABENTO_CHART_AUTHORITY requires Gate G4 (not yet approved)
 *   - DATABENTO_LEARNING_AUTHORITY requires Gate G6A (not yet approved)
 */
export function assertSprint123A1Invariants(): void {
  // Check 1: DATABENTO_LIVE_ENABLED must not be true
  if (process.env.DATABENTO_LIVE_ENABLED === 'true') {
    throw new Error(
      '[Atlas invariant] DATABENTO_LIVE_ENABLED=true is not permitted in Sprint 123A.1. ' +
      'Databento connection requires Gate G3 approval.'
    );
  }

  // Check 2: DATABENTO_DECISION_AUTHORITY is Sprint 123B only
  if (process.env.MARKET_DATA_AUTHORITY === 'DATABENTO_DECISION_AUTHORITY') {
    throw new Error(
      '[Atlas invariant] DATABENTO_DECISION_AUTHORITY is reserved for Sprint 123B. ' +
      'It is not a valid Sprint 123A authority mode.'
    );
  }

  // Check 3: DATABENTO_SHADOW requires Gate G3
  if (process.env.MARKET_DATA_AUTHORITY === 'DATABENTO_SHADOW') {
    throw new Error(
      '[Atlas invariant] DATABENTO_SHADOW requires Gate G3 approval. ' +
      'Gate G3 has not been approved. Set MARKET_DATA_AUTHORITY=TRADINGVIEW_ONLY.'
    );
  }

  // Check 4: DATABENTO_CHART_AUTHORITY requires Gate G4
  if (process.env.MARKET_DATA_AUTHORITY === 'DATABENTO_CHART_AUTHORITY') {
    throw new Error(
      '[Atlas invariant] DATABENTO_CHART_AUTHORITY requires Gate G4 approval. ' +
      'Gate G4 has not been approved. Set MARKET_DATA_AUTHORITY=TRADINGVIEW_ONLY.'
    );
  }

  // Check 5: DATABENTO_LEARNING_AUTHORITY requires Gate G6A
  if (process.env.MARKET_DATA_AUTHORITY === 'DATABENTO_LEARNING_AUTHORITY') {
    throw new Error(
      '[Atlas invariant] DATABENTO_LEARNING_AUTHORITY requires Gate G6A approval. ' +
      'Gate G6A has not been approved. Set MARKET_DATA_AUTHORITY=TRADINGVIEW_ONLY.'
    );
  }
}
