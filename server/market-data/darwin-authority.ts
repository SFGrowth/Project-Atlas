/**
 * DARWIN Learning Authority Contract — Sprint 123A.6 / Gate G6A
 *
 * Authority: DATABENTO_LEARNING_AUTHORITY (shadow mode)
 *
 * This module defines the formal authority contract for DARWIN learning in
 * shadow mode. It enforces fail-closed validation and documents the exact
 * boundaries of what DARWIN is and is not permitted to do.
 *
 * ─── AUTHORITY BOUNDARIES ────────────────────────────────────────────────────
 *
 * DARWIN MAY:
 *   - observe confirmed Databento 1m and 5m bars
 *   - generate immutable observation records
 *   - compute forward outcome labels (after horizon elapsed)
 *   - run occurrence discovery experiments
 *   - generate candidate hypotheses
 *   - run backtests and out-of-sample validation
 *   - produce shadow signals (stored only, never transmitted)
 *   - rank candidates by portfolio value
 *   - produce research reports
 *
 * DARWIN MUST NOT:
 *   - call processBar
 *   - call postBarAutomation
 *   - send TradersPost webhooks
 *   - submit Tradovate orders
 *   - modify live risk limits
 *   - activate strategies
 *   - modify TradingView alerts
 *   - change open positions
 *   - affect existing automation
 *   - auto-promote candidates to live trading
 *
 * ─── INVALID COMBINATIONS ────────────────────────────────────────────────────
 *
 * The following combinations are rejected at startup:
 *   - learning authority + decision authority
 *   - learning authority + execution authority
 *   - learning authority without Databento chart/data authority
 *   - automatic strategy activation flag
 *   - automatic TradersPost submission flag
 *   - any Databento path into live order execution
 *
 * ─── FEATURE FLAG ────────────────────────────────────────────────────────────
 *
 * ATLAS_GATE_G6A_LEARNING_AUTHORITY_ENABLED=true
 *
 * Must be set alongside MARKET_DATA_AUTHORITY=DATABENTO_LEARNING_AUTHORITY.
 * Without this flag, the authority mode throws even when the env var is set.
 * Requires Phil's explicit written Gate G6A approval.
 */

import { getMarketDataAuthority } from './config.js';

// ─── Feature flag ─────────────────────────────────────────────────────────────

/**
 * Returns true if the Gate G6A learning authority feature flag is enabled.
 * Requires ATLAS_GATE_G6A_LEARNING_AUTHORITY_ENABLED=true in the environment.
 */
export function isGate6AFeatureFlagEnabled(): boolean {
  return process.env.ATLAS_GATE_G6A_LEARNING_AUTHORITY_ENABLED === 'true';
}

// ─── Authority checks ─────────────────────────────────────────────────────────

/**
 * Returns true if DARWIN learning authority is active.
 * Both the authority mode AND the G6A feature flag must be set.
 */
export function isDarwinLearningAuthorityActive(): boolean {
  return (
    getMarketDataAuthority() === 'DATABENTO_LEARNING_AUTHORITY' &&
    isGate6AFeatureFlagEnabled()
  );
}

/**
 * Returns true if Databento data is available for DARWIN observation.
 * Requires either DATABENTO_CHART_AUTHORITY or DATABENTO_LEARNING_AUTHORITY.
 */
export function isDarwinObservationPermitted(): boolean {
  const mode = getMarketDataAuthority();
  return (
    mode === 'DATABENTO_CHART_AUTHORITY' ||
    mode === 'DATABENTO_LEARNING_AUTHORITY'
  );
}

// ─── Invariant assertions ─────────────────────────────────────────────────────

/**
 * Sprint 123A.6 hard invariant checks for DARWIN learning authority.
 *
 * Gate G6A approved: DATABENTO_LEARNING_AUTHORITY is permitted when
 * ATLAS_GATE_G6A_LEARNING_AUTHORITY_ENABLED=true.
 *
 * Fails closed on any prohibited combination.
 * Call at application startup after assertSprint123A4Invariants().
 */
export function assertSprint123A6Invariants(): void {
  const mode = getMarketDataAuthority();

  // Check 1: DATABENTO_LEARNING_AUTHORITY requires G6A feature flag
  if (mode === 'DATABENTO_LEARNING_AUTHORITY') {
    if (!isGate6AFeatureFlagEnabled()) {
      throw new Error(
        '[Atlas invariant] DATABENTO_LEARNING_AUTHORITY requires Gate G6A approval. ' +
        'Set ATLAS_GATE_G6A_LEARNING_AUTHORITY_ENABLED=true after receiving ' +
        'explicit written approval from Phil. ' +
        'Current state: ATLAS_GATE_G6A_LEARNING_AUTHORITY_ENABLED is absent or false.'
      );
    }
    // Feature flag present — log audit record
    console.log(
      '[Atlas config] DATABENTO_LEARNING_AUTHORITY is ACTIVE (shadow mode). ' +
      'Gate G6A feature flag is enabled. ' +
      'processBar trigger: TradingView. postBarAutomation trigger: TradingView. ' +
      'DARWIN learning: SHADOW (observe/research only). ' +
      'DARWIN decision authority: PROHIBITED. ' +
      'DARWIN execution authority: PROHIBITED. ' +
      'TradersPost: TradingView only. Tradovate: TradingView only.'
    );
  }

  // Check 2: DARWIN cannot have decision authority in Sprint 123A
  if (process.env.DARWIN_DECISION_AUTHORITY === 'true') {
    throw new Error(
      '[Atlas invariant] DARWIN_DECISION_AUTHORITY=true is not permitted in Sprint 123A. ' +
      'DARWIN may observe and research only. Decision authority requires Sprint 123B.'
    );
  }

  // Check 3: DARWIN cannot have execution authority in Sprint 123A
  if (process.env.DARWIN_EXECUTION_AUTHORITY === 'true') {
    throw new Error(
      '[Atlas invariant] DARWIN_EXECUTION_AUTHORITY=true is not permitted in Sprint 123A. ' +
      'DARWIN may not place orders or send webhooks.'
    );
  }

  // Check 4: Auto-promotion is prohibited
  if (process.env.DARWIN_AUTO_PROMOTE === 'true') {
    throw new Error(
      '[Atlas invariant] DARWIN_AUTO_PROMOTE=true is not permitted. ' +
      'Candidate promotion requires Phil\'s explicit written approval.'
    );
  }

  // Check 5: Auto TradersPost submission is prohibited
  if (process.env.DARWIN_AUTO_TRADERSPOST === 'true') {
    throw new Error(
      '[Atlas invariant] DARWIN_AUTO_TRADERSPOST=true is not permitted. ' +
      'DARWIN shadow signals must not be transmitted to TradersPost.'
    );
  }

  // Check 6: If learning authority is active, Databento chart authority must also be active
  if (mode === 'DATABENTO_LEARNING_AUTHORITY' && isGate6AFeatureFlagEnabled()) {
    const chartFlagEnabled = process.env.ATLAS_GATE_G4_CHART_AUTHORITY_ENABLED === 'true';
    if (!chartFlagEnabled) {
      throw new Error(
        '[Atlas invariant] DATABENTO_LEARNING_AUTHORITY requires ' +
        'ATLAS_GATE_G4_CHART_AUTHORITY_ENABLED=true. ' +
        'Learning authority cannot be active without chart authority.'
      );
    }
  }
}

// ─── DARWIN processBar guard ──────────────────────────────────────────────────

/**
 * DARWIN must never trigger processBar.
 * This function always returns false and is a permanent code invariant.
 *
 * @returns false — always
 */
export function isDarwinProcessBarTrigger(): false {
  return false;
}

/**
 * DARWIN must never trigger postBarAutomation in Sprint 123A.
 * This function always returns false and is a permanent code invariant.
 *
 * @returns false — always
 */
export function isDarwinPostBarAutomationTrigger(): false {
  return false;
}

/**
 * DARWIN must never send TradersPost webhooks.
 * This function always returns false and is a permanent code invariant.
 *
 * @returns false — always
 */
export function isDarwinTradersPostTrigger(): false {
  return false;
}

/**
 * DARWIN must never submit Tradovate orders.
 * This function always returns false and is a permanent code invariant.
 *
 * @returns false — always
 */
export function isDarwinTradovateOrderTrigger(): false {
  return false;
}

// ─── DARWIN shadow signal guard ───────────────────────────────────────────────

/**
 * Validates that a DARWIN shadow signal is stored-only and cannot be transmitted.
 * Throws if any transmission flag is set.
 */
export function assertShadowSignalStorageOnly(signal: {
  candidateId: string;
  timestamp: number;
  symbol: string;
}): void {
  // Shadow signals are research-only artefacts
  if (process.env.DARWIN_EXECUTION_AUTHORITY === 'true') {
    throw new Error(
      `[Atlas invariant] Shadow signal for candidate ${signal.candidateId} ` +
      'cannot be transmitted: DARWIN_EXECUTION_AUTHORITY is prohibited.'
    );
  }
  if (process.env.DARWIN_AUTO_TRADERSPOST === 'true') {
    throw new Error(
      `[Atlas invariant] Shadow signal for candidate ${signal.candidateId} ` +
      'cannot be sent to TradersPost: DARWIN_AUTO_TRADERSPOST is prohibited.'
    );
  }
  // Signal is valid for storage
}

// ─── Authority status for health endpoint ─────────────────────────────────────

export interface DarwinAuthorityStatus {
  learningAuthority: 'SHADOW' | 'INACTIVE';
  decisionAuthority: 'INACTIVE';
  executionAuthority: 'INACTIVE';
  observationPermitted: boolean;
  g6aFeatureFlag: boolean;
  processBarOwner: 'TRADINGVIEW';
  postBarAutomationOwner: 'TRADINGVIEW';
  tradersPostOwner: 'TRADINGVIEW';
  tradovateOwner: 'TRADINGVIEW';
}

/**
 * Returns the current DARWIN authority status for the health endpoint.
 */
export function getDarwinAuthorityStatus(): DarwinAuthorityStatus {
  return {
    learningAuthority: isDarwinLearningAuthorityActive() ? 'SHADOW' : 'INACTIVE',
    decisionAuthority: 'INACTIVE',
    executionAuthority: 'INACTIVE',
    observationPermitted: isDarwinObservationPermitted(),
    g6aFeatureFlag: isGate6AFeatureFlagEnabled(),
    processBarOwner: 'TRADINGVIEW',
    postBarAutomationOwner: 'TRADINGVIEW',
    tradersPostOwner: 'TRADINGVIEW',
    tradovateOwner: 'TRADINGVIEW',
  };
}
