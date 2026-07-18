/**
 * postBarAutomation — Single Exclusive Owner of All Post-Bar Autonomous Processing
 * Sprint 123A.1 — Foundation
 *
 * This module is the SINGLE AND EXCLUSIVE owner of all post-bar autonomous
 * processing. No other module may call liveLearnEngine, onNewBarObservation(),
 * behaviourEngine.processBar(), or any post-bar research hook directly from
 * a bar event.
 *
 * Authority rules (per ATLAS_CANONICAL_MARKET_EVENT_CONTRACTS.md Rev 6):
 *
 *   TRADINGVIEW_ONLY:          Triggered by TradingView bar (from nexusRoutes.ts)
 *   DATABENTO_SHADOW:          Triggered by TradingView bar (Databento does NOT trigger)
 *   DATABENTO_CHART_AUTHORITY: Triggered by TradingView bar (Databento does NOT trigger)
 *   DATABENTO_LEARNING_AUTHORITY: Triggered by Databento canonical bar (Gate G6A)
 *   DATABENTO_DECISION_AUTHORITY: Triggered by Databento canonical bar (Sprint 123B)
 *
 * What this module owns:
 *   1. liveLearnEngine.processLiveBar() — candle certification, gap detection,
 *      market-law updates, legacy behaviour classification (G-003 legacy path)
 *   2. darwinAutonomous.onNewBarObservation() — DARWIN per-bar trigger (G-001 fix)
 *   3. behaviourEngine.runBehaviourEngineShadow() — canonical 12-classifier (shadow)
 *
 * What this module does NOT own:
 *   - processBar() — execution trigger (remains in nexusRoutes.ts, TradingView only)
 *   - tpDispatch — trade persistence (remains in nexusRoutes.ts)
 *
 * Sprint 123A.1 change:
 *   The direct call from nexusRoutes.ts to liveLearnEngine is REMOVED.
 *   postBarAutomation is now the sole caller of liveLearnEngine.
 *   This makes authority control possible for future Databento modes.
 *
 * Invariants enforced by TEST-123A1-001 through TEST-123A1-005:
 *   - liveLearnEngine is only called via postBarAutomation
 *   - onNewBarObservation is only called via postBarAutomation
 *   - behaviourEngine.processBar is only called via postBarAutomation
 *   - postBarAutomation is never called by Databento in TRADINGVIEW_ONLY mode
 *   - postBarAutomation never triggers processBar()
 */

import type { PostBarAutomationInput } from '../../shared/types/canonical-events';
import { getMarketDataAuthority, isTradingViewOnly } from '../market-data/config';

// ─── Result type ──────────────────────────────────────────────────────────────

export interface PostBarAutomationResult {
  success: boolean;
  triggerSource: 'TRADINGVIEW' | 'DATABENTO';
  authorityMode: string;
  liveLearnCompleted: boolean;
  darwinObservationCompleted: boolean;
  behaviourEngineCompleted: boolean;
  durationMs: number;
  errors: string[];
}

// ─── Main entry point ─────────────────────────────────────────────────────────

/**
 * runPostBarAutomation — called after every confirmed bar write.
 *
 * In TRADINGVIEW_ONLY mode, this is called from nexusRoutes.ts after the
 * TradingView webhook bar is persisted. The direct liveLearnEngine call that
 * previously existed in nexusRoutes.ts has been removed and replaced by this.
 *
 * This function is non-blocking from the caller's perspective — it should be
 * called with setImmediate() or equivalent to avoid blocking the webhook response.
 *
 * Failure in any sub-system is isolated and logged. A failure in one sub-system
 * does not prevent the others from running.
 */
export async function runPostBarAutomation(
  bar: PostBarAutomationInput
): Promise<PostBarAutomationResult> {
  const startMs = Date.now();
  const authorityMode = getMarketDataAuthority();
  const errors: string[] = [];
  let liveLearnCompleted = false;
  let darwinObservationCompleted = false;
  let behaviourEngineCompleted = false;

  // ── Authority guard ───────────────────────────────────────────────────────
  // In TRADINGVIEW_ONLY mode, postBarAutomation must only be triggered by
  // TradingView bars. This is enforced here as a runtime invariant.
  if (isTradingViewOnly() && bar.triggerSource !== 'TRADINGVIEW') {
    const msg = `[postBarAutomation] INVARIANT VIOLATION: In TRADINGVIEW_ONLY mode, ` +
      `postBarAutomation must only be triggered by TradingView. ` +
      `Got triggerSource=${bar.triggerSource}. Aborting.`;
    console.error(msg);
    return {
      success: false,
      triggerSource: bar.triggerSource,
      authorityMode,
      liveLearnCompleted: false,
      darwinObservationCompleted: false,
      behaviourEngineCompleted: false,
      durationMs: Date.now() - startMs,
      errors: [msg],
    };
  }

  // ── 1. Live Learn Engine ──────────────────────────────────────────────────
  // Candle certification, gap detection, market-law updates, legacy behaviour.
  // This replaces the direct liveLearnEngine call removed from nexusRoutes.ts.
  try {
    const { processLiveBar } = await import('../liveLearnEngine');
    await processLiveBar({
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
    const { onNewBarObservation } = await import('../darwinAutonomous');
    await onNewBarObservation(bar.barTime);
    darwinObservationCompleted = true;
  } catch (err) {
    const msg = `[postBarAutomation] DARWIN onNewBarObservation error: ${String(err)}`;
    console.error(msg);
    errors.push(msg);
  }

  // ── 3. Behaviour Engine — Canonical 12-Classifier (shadow mode) ───────────
  // Runs after liveLearnEngine. Failure is isolated — never affects execution.
  try {
    const { runBehaviourEngineShadow } = await import('../behaviour-engine/index');
    // Build ProcessedBarData from the PostBarAutomationInput
    // Fields that are null/undefined are mapped to safe defaults for shadow mode
    const n = (v: string | null, def = 0) => v != null ? parseFloat(v) || def : def;
    const processedBar = {
      symbol: bar.symbol,
      barOpenTs: bar.barTime,
      barCloseTs: bar.barTime + 5 * 60 * 1000, // 5-min bar close
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
      regime: (bar.regime ?? 'RANGING') as import('../behaviour-engine/types').MarketRegime,
      session: (bar.session ?? 'NEW_YORK') as import('../behaviour-engine/types').TradingSession,
      recentBars: [],
    };
    await runBehaviourEngineShadow(processedBar);
    behaviourEngineCompleted = true;
  } catch (err) {
    const msg = `[postBarAutomation] behaviourEngine error: ${String(err)}`;
    console.error(msg);
    errors.push(msg);
  }

  const durationMs = Date.now() - startMs;

  return {
    success: errors.length === 0,
    triggerSource: bar.triggerSource,
    authorityMode,
    liveLearnCompleted,
    darwinObservationCompleted,
    behaviourEngineCompleted,
    durationMs,
    errors,
  };
}
