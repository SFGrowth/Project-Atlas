/**
 * B-004 — FAILED_BREAKOUT Classifier
 * Sprint 122B | ORION-DIRECTIVE-001
 */
import type { IBehaviourClassifier, ClassifierOutput, ProcessedBarData, BehaviourDirection } from '../types.js';

export class FailedBreakoutClassifier implements IBehaviourClassifier {
  readonly behaviourId = 'FAILED_BREAKOUT' as const;
  readonly version = '1.0.0';

  getRequiredHistory(): number { return 32; }

  isApplicable(bar: ProcessedBarData): boolean {
    return bar.session !== 'OVERNIGHT' && (bar.regime === 'RANGING' || bar.regime === 'CHOPPY');
  }

  classify(bar: ProcessedBarData): ClassifierOutput | null {
    const { close, high, low, adx, rsi, atr } = bar;
    const recent = bar.recentBars;

    if (adx >= 30) return null;

    // Find prior support/resistance level in last 30 bars
    const priorHigh = Math.max(...recent.slice(0, 30).map((b) => b.high));
    const priorLow = Math.min(...recent.slice(0, 30).map((b) => b.low));

    // Check for failed breakdown (long): price broke below priorLow then closed back above
    const failedBreakdown = low < priorLow && close > priorLow;
    // Check for failed breakout (short): price broke above priorHigh then closed back below
    const failedBreakout = high > priorHigh && close < priorHigh;

    if (!failedBreakdown && !failedBreakout) return null;

    const direction: BehaviourDirection = failedBreakdown ? 'LONG' : 'SHORT';

    // Initial break: ≥0.25 ATR beyond the level
    const breakDistance = failedBreakdown
      ? (priorLow - low) / atr
      : (high - priorHigh) / atr;
    if (breakDistance < 0.25) return null;

    // RSI condition
    const rsiOk = direction === 'LONG' ? rsi < 50 : rsi > 50;
    if (!rsiOk) return null;

    // Volume on failure: above average (proxy via bar range)
    const avgRange = recent.slice(0, 20).reduce((s, b) => s + (b.high - b.low), 0) / Math.min(recent.length, 20);
    const currentRange = high - low;
    const highVolume = currentRange > avgRange * 1.0;

    // Calculate confidence
    let confidence = 35;
    if (adx < 20) confidence += 10;
    if (breakDistance < 0.5) confidence += 10; // failure within 2 bars (same bar)
    if (highVolume) confidence += 10;
    // RSI divergence: simplified check
    if (direction === 'LONG' && rsi < 40) confidence += 10;
    if (direction === 'SHORT' && rsi > 60) confidence += 10;
    // Prior level tested ≥3 times: check if priorHigh/Low appears in multiple bars
    const levelTests = recent.slice(0, 30).filter((b) =>
      direction === 'LONG'
        ? Math.abs(b.low - priorLow) / atr < 0.3
        : Math.abs(b.high - priorHigh) / atr < 0.3
    ).length;
    if (levelTests >= 3) confidence += 10;
    confidence = Math.min(80, confidence);

    const conditionsMet = [
      breakDistance >= 0.25,
      rsiOk,
      highVolume,
      adx < 30,
    ].filter(Boolean).length;

    const evidenceScore = Math.round(40 + (conditionsMet / 4) * 60);
    if (evidenceScore < 60) return null;

    return {
      behaviourId: this.behaviourId,
      direction,
      rawEvidenceScores: { adx, rsi, atr, breakDistance, priorHigh, priorLow, levelTests },
      preliminaryConfidence: confidence,
      classifierVersion: this.version,
      reasoning: `FAILED_BREAKOUT ${direction}: break=${breakDistance.toFixed(2)}ATR, ADX=${adx.toFixed(1)}, RSI=${rsi.toFixed(1)}, levelTests=${levelTests}`,
    };
  }
}
