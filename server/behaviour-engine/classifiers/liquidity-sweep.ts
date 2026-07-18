/**
 * B-003 — LIQUIDITY_SWEEP Classifier
 * Sprint 122B | ORION-DIRECTIVE-001
 */
import type { IBehaviourClassifier, ClassifierOutput, ProcessedBarData, BehaviourDirection } from '../types.js';

export class LiquiditySweepClassifier implements IBehaviourClassifier {
  readonly behaviourId = 'LIQUIDITY_SWEEP' as const;
  readonly version = '1.0.0';

  getRequiredHistory(): number { return 22; }

  isApplicable(bar: ProcessedBarData): boolean {
    return bar.session !== 'OVERNIGHT' && (bar.regime === 'RANGING' || bar.regime === 'TRENDING');
  }

  classify(bar: ProcessedBarData): ClassifierOutput | null {
    const { close, high, low, rsi, atr } = bar;
    const recent = bar.recentBars;

    // Find prior significant swing level in last 20 bars
    const swingHigh = Math.max(...recent.slice(0, 20).map((b) => b.high));
    const swingLow = Math.min(...recent.slice(0, 20).map((b) => b.low));

    // Check for sweep of lows (long signal): low went below swingLow then closed back above
    const sweptLow = low < swingLow && close > swingLow;
    // Check for sweep of highs (short signal): high went above swingHigh then closed back below
    const sweptHigh = high > swingHigh && close < swingHigh;

    if (!sweptLow && !sweptHigh) return null;

    const direction: BehaviourDirection = sweptLow ? 'LONG' : 'SHORT';

    // Sweep depth: 0.1–0.75 ATR beyond the level
    const sweepDepth = sweptLow
      ? (swingLow - low) / atr
      : (high - swingHigh) / atr;
    if (sweepDepth < 0.1 || sweepDepth > 0.75) return null;

    // RSI condition
    const rsiOk = direction === 'LONG' ? rsi < 35 : rsi > 65;
    if (!rsiOk) return null;

    // Volume: above 20-bar average (proxy: current bar range vs avg)
    const avgRange = recent.slice(0, 20).reduce((s, b) => s + (b.high - b.low), 0) / Math.min(recent.length, 20);
    const currentRange = high - low;
    const highVolume = currentRange > avgRange * 1.1;

    // Reversal speed: within 1–3 bars (current bar is the reversal bar)
    // The sweep and close-back happened in this bar — that's 1 bar reversal
    const reversalSpeed = 1;

    // Calculate confidence
    let confidence = 40;
    if (sweepDepth < 0.5) confidence += 10; // tight sweep
    if (direction === 'LONG' && rsi < 30) confidence += 10;
    if (direction === 'SHORT' && rsi > 70) confidence += 10;
    if (highVolume) confidence += 10;
    if (reversalSpeed === 1) confidence += 10;
    // Price returns to VWAP within 3 bars — check if close is near vwap
    if (Math.abs(close - bar.vwap) / atr < 0.5) confidence += 10;
    confidence = Math.min(85, confidence);

    const conditionsMet = [
      sweepDepth >= 0.1 && sweepDepth <= 0.75,
      rsiOk,
      highVolume,
      reversalSpeed <= 3,
    ].filter(Boolean).length;

    const evidenceScore = Math.round(50 + (conditionsMet / 4) * 50);
    if (evidenceScore < 65) return null;

    return {
      behaviourId: this.behaviourId,
      direction,
      rawEvidenceScores: { rsi, atr, sweepDepth, swingHigh, swingLow, currentRange, avgRange },
      preliminaryConfidence: confidence,
      classifierVersion: this.version,
      reasoning: `LIQUIDITY_SWEEP ${direction}: sweep=${sweepDepth.toFixed(2)}ATR, RSI=${rsi.toFixed(1)}, highVol=${highVolume}`,
    };
  }
}
