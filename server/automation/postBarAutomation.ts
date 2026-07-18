/**
 * postBarAutomation — Post-Bar Autonomous Processing
 * Sprint 123A.1 — Foundation (Gate G1 Revision 3)
 *
 * This module is the SINGLE EXCLUSIVE OWNER of all post-bar autonomous
 * processing. It replaces the direct liveLearnEngine.processLiveBar() call
 * that previously existed in nexusRoutes.ts (Sprint 100A, G-001 gap).
 *
 * Subsystems owned by postBarAutomation:
 *   1. liveLearnEngine.processLiveBar()   — candle certification, gap detection,
 *                                           market-law updates, legacy behaviour
 *   2. darwinAutonomous.onNewBarObservation() — DARWIN per-bar trigger (G-001 fix)
 *   3. behaviourEngine.runBehaviourEngineShadow() — 12-classifier, shadow mode
 *
 * Subsystems NOT owned by postBarAutomation:
 *   - processBar()    — execution trigger (TradingView-owned, Sprint 123A)
 *   - ADE             — autonomous decision engine
 *   - strategies      — strategy evaluation
 *   - risk            — risk management
 *   - execution       — order execution
 *
 * Authority matrix (enforced before any subsystem is called):
 *   TRADINGVIEW_ONLY           → triggerSource must be TRADINGVIEW
 *   DATABENTO_SHADOW           → triggerSource must be TRADINGVIEW
 *   DATABENTO_CHART_AUTHORITY  → triggerSource must be TRADINGVIEW
 *   DATABENTO_LEARNING_AUTHORITY → triggerSource must be DATABENTO
 *
 * Additionally, bar.authorityMode must match getMarketDataAuthority() at
 * runtime. A mismatch aborts before any subsystem is called.
 *
 * Databento must never trigger postBarAutomation in shadow or
 * chart-authority modes.
 *
 * Testability: subsystem dependencies are injected via PostBarAutomationDeps.
 * Production callers use runPostBarAutomation() which resolves real modules.
 * Tests use runPostBarAutomationWithDeps() with mock dependencies.
 */

import type { PostBarAutomationInput } from '../../shared/types/canonical-events';
import { validatePostBarTrigger } from '../market-data/config';

export interface PostBarAutomationResult {
  success: boolean;
  liveLearnCompleted: boolean;
  darwinObservationCompleted: boolean;
  behaviourEngineCompleted: boolean;
  durationMs: number;
  errors: string[];
  triggerSource: 'TRADINGVIEW' | 'DATABENTO';
  authorityMode: string;
}

/**
 * Injected subsystem dependencies.
 * Production code resolves these from the real modules.
 * Tests inject mocks to verify isolation and call counts.
 */
export interface PostBarAutomationDeps {
  processLiveBar: (bar: Record<string, unknown>) => Promise<void>;
  onNewBarObservation: (barTimestamp: number) => Promise<void>;
  runBehaviourEngineShadow: (bar: Record<string, unknown>) => Promise<void>;
}

/**
 * Core implementation — accepts injected dependencies.
 * Called by runPostBarAutomation (production) and
 * runPostBarAutomationWithDeps (tests).
 *
 * INVARIANT: This function must never call processBar(), ADE, strategies,
 * risk, or execution logic.
 */
export async function runPostBarAutomationWithDeps(
  bar: PostBarAutomationInput,
  deps: PostBarAutomationDeps
): Promise<PostBarAutomationResult> {
  const startMs = Date.now();
  let liveLearnCompleted = false;
  let darwinObservationCompleted = false;
  let behaviourEngineCompleted = false;
  const errors: string[] = [];

  // ── Authority guard ───────────────────────────────────────────────────────
  // Validate BEFORE any subsystem is called.
  // Two checks:
  //   1. bar.authorityMode matches the live environment value
  //   2. bar.triggerSource matches the authority matrix for the live mode
  const authError = validatePostBarTrigger(bar.triggerSource, bar.authorityMode);
  if (authError) {
    console.error(authError);
    return {
      success: false,
      liveLearnCompleted: false,
      darwinObservationCompleted: false,
      behaviourEngineCompleted: false,
      durationMs: Date.now() - startMs,
      errors: [authError],
      triggerSource: bar.triggerSource,
      authorityMode: bar.authorityMode,
    };
  }

  // ── 1. Live Learn Engine ──────────────────────────────────────────────────
  // Candle certification, gap detection, market-law updates, legacy behaviour.
  // This replaces the direct liveLearnEngine call removed from nexusRoutes.ts.
  try {
    await deps.processLiveBar({
      id: bar.id,
      memoryId: bar.memoryId,
      barTime: bar.barTime,
      symbol: bar.symbol,
      session: bar.session,
      regime: bar.regime,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      volume: bar.volume,
      atr: bar.atr,
      atrExpansion: bar.atrExpansion,
      rsi: bar.rsi,
      vwap: bar.vwap,
      ema9: bar.ema9,
      ema21: bar.ema21,
      adx: bar.adx,
      adxTrending: bar.adxTrending,
      trendDirection: bar.trendDirection,
      volatilityState: bar.volatilityState,
      a1Eligible: bar.a1Eligible,
      a3Eligible: bar.a3Eligible,
      b1Eligible: bar.b1Eligible,
      sb1Eligible: bar.sb1Eligible,
      receivedAt: bar.receivedAt,
    });
    liveLearnCompleted = true;
  } catch (err) {
    const msg = `[postBarAutomation] liveLearnEngine error: ${String(err)}`;
    console.error(msg);
    errors.push(msg);
  }

  // ── 2. DARWIN Per-Bar Observation (G-001 fix) ─────────────────────────────
  // onNewBarObservation was previously never called (verified gap G-001).
  // This is the fix: it is now wired exclusively through postBarAutomation.
  try {
    // onNewBarObservation accepts only the bar timestamp (ms)
    await deps.onNewBarObservation(bar.barTime);
    darwinObservationCompleted = true;
  } catch (err) {
    const msg = `[postBarAutomation] DARWIN onNewBarObservation error: ${String(err)}`;
    console.error(msg);
    errors.push(msg);
  }

  // ── 3. Behaviour Engine Shadow (canonical 12-classifier) ──────────────────
  // Runs the 12-classifier in shadow mode — does not affect execution.
  try {
    const n = (v: string | null | undefined, def = 0) => v != null ? parseFloat(v) || def : def;
    await deps.runBehaviourEngineShadow({
      symbol: bar.symbol,
      barOpenTs: bar.barTime,
      barCloseTs: bar.barTime + 5 * 60 * 1000,
      open: n(bar.open),
      high: n(bar.high),
      low: n(bar.low),
      close: n(bar.close),
      volume: n(bar.volume),
      atr: n(bar.atr),
      adx: n(bar.adx),
      rsi: n(bar.rsi, 50),
      vwap: n(bar.vwap),
      ema9: n(bar.ema9),
      ema21: n(bar.ema21),
      regime: bar.regime ?? 'RANGING',
      session: bar.session ?? 'NEW_YORK',
      recentBars: [],
    });
    behaviourEngineCompleted = true;
  } catch (err) {
    const msg = `[postBarAutomation] behaviourEngine error: ${String(err)}`;
    console.error(msg);
    errors.push(msg);
  }

  const durationMs = Date.now() - startMs;
  const success = errors.length === 0;

  if (!success) {
    console.warn(
      `[postBarAutomation] Completed with ${errors.length} error(s) in ${durationMs}ms. ` +
      `liveLearn=${liveLearnCompleted} darwin=${darwinObservationCompleted} ` +
      `behaviourEngine=${behaviourEngineCompleted}`
    );
  }

  return {
    success,
    liveLearnCompleted,
    darwinObservationCompleted,
    behaviourEngineCompleted,
    durationMs,
    errors,
    triggerSource: bar.triggerSource,
    authorityMode: bar.authorityMode,
  };
}

/**
 * Production entry point.
 * Validates authority BEFORE importing or initialising any production dependency.
 * If the authority check fails, the function returns immediately without loading
 * liveLearnEngine, darwinAutonomous, or the Behaviour Engine.
 *
 * Called from nexusRoutes.ts after a TradingView webhook bar is confirmed.
 */
export async function runPostBarAutomation(
  bar: PostBarAutomationInput
): Promise<PostBarAutomationResult> {
  const startMs = Date.now();

  // ── Authority guard — BEFORE any dynamic import ───────────────────────────
  // This is the critical invariant: no production dependency is loaded if the
  // authority check fails. Dynamic imports are deferred until after this check.
  const authError = validatePostBarTrigger(bar.triggerSource, bar.authorityMode);
  if (authError) {
    console.error(`[runPostBarAutomation] Authority violation — no dependencies loaded. ${authError}`);
    return {
      success: false,
      liveLearnCompleted: false,
      darwinObservationCompleted: false,
      behaviourEngineCompleted: false,
      durationMs: Date.now() - startMs,
      errors: [authError],
      triggerSource: bar.triggerSource,
      authorityMode: bar.authorityMode,
    };
  }

  // ── Load production dependencies only after authority is confirmed ─────────
  const { processLiveBar } = await import('../liveLearnEngine');
  const { onNewBarObservation } = await import('../darwinAutonomous');
  const { runBehaviourEngineShadow } = await import('../behaviour-engine/index');

  // Delegate to the core implementation with injected real dependencies.
  // The authority guard in runPostBarAutomationWithDeps will run again —
  // this is intentional (defence in depth). The second check is fast (sync).
  return runPostBarAutomationWithDeps(bar, {
    processLiveBar: processLiveBar as unknown as (bar: Record<string, unknown>) => Promise<void>,
    onNewBarObservation,
    runBehaviourEngineShadow: runBehaviourEngineShadow as unknown as (bar: Record<string, unknown>) => Promise<void>,
  });
}
