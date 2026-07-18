/**
 * B-009 — BREAKOUT_EXPANSION Classifier
 * Sprint 122B | ORION-DIRECTIVE-001
 */
import type { IBehaviourClassifier, ClassifierOutput, ProcessedBarData, BehaviourDirection } from '../types.js';

export class BreakoutExpansionClassifier implements IBehaviourClassifier {
  readonly behaviourId = 'BREAKOUT_EXPANSION' as const;
  readonly version = '1.0.0';

  getRequiredHistory(): number { return 12; }

  isApplicable(bar: ProcessedBarData): boolean {
    return bar.regime === 'TRENDING' || bar.regime === 'VOLATILE';
  }

  classify(bar: ProcessedBarData): ClassifierOutput | null {
    const { close, high, low, open, adx, atr } = bar;
    const recent = bar.recentBars;

    // Prior compression: COMPRESSION behaviour detected in last 10 bars
    // Proxy: look for a period of low ATR in recent bars
    const avgAtr = recent.slice(0, 20).reduce((s, b) => s + b.atr, 0) / Math.min(recent.length, 20);
    const compressionBars = recent.slice(0, 10).filter((b) => b.atr <= avgAtr * 0.70);
    const hadCompression = compressionBars.length >= 3;
    if (!hadCompression) return null;

    // Find compression high/low
    const compressionHigh = Math.max(...compressionBars.map((b) => b.high));
    const compressionLow = Math.min(...compressionBars.map((b) => b.low));

    // Breakout: close above compression high or below compression low by ≥0.5 ATR
    const longBreakout = close > compressionHigh && (close - compressionHigh) / atr >= 0.5;
    const shortBreakout = close < compressionLow && (compressionLow - close) / atr >= 0.5;

    if (!longBreakout && !shortBreakout) return null;

    const direction: BehaviourDirection = longBreakout ? 'LONG' : 'SHORT';
    const breakoutMagnitude = longBreakout ? (close - compressionHigh) / atr : (compressionLow - close) / atr;

    // Volume: ≥1.5× 20-bar average (proxy via range)
    const avgRange = recent.slice(0, 20).reduce((s, b) => s + (b.high - b.low), 0) / Math.min(recent.length, 20);
    const currentRange = high - low;
    const highVolume = currentRange >= avgRange * 1.5;
    if (!highVolume) return null;

    // Bar body: ≥65% of bar range
    const barBody = Math.abs(close - open);
    const bodyPct = currentRange > 0 ? barBody / currentRange : 0;
    if (bodyPct < 0.65) return null;

    // ADX rising
    const prevAdx = recent[0]?.adx ?? adx;
    const adxRising = adx > prevAdx;

    // Calculate confidence
    let confidence = 40;
    if (breakoutMagnitude >= 1.0) confidence += 10;
    if (currentRange >= avgRange * 2.0) confidence += 10;
    if (bodyPct >= 0.75) confidence += 10;
    if (adxRising && recent.length >= 2 && adx > (recent[1]?.adx ?? adx)) confidence += 10;
    if (compressionBars.length >= 5) confidence += 10;
    confidence = Math.min(88, confidence);

    const conditionsMet = [
      hadCompression,
      breakoutMagnitude >= 0.5,
      highVolume,
      bodyPct >= 0.65,
      adxRising,
    ].filter(Boolean).length;

    const evidenceScore = Math.round(40 + (conditionsMet / 5) * 60);
    if (evidenceScore < 65) return null;

    return {
      behaviourId: this.behaviourId,
      direction,
      rawEvidenceScores: { adx, atr, breakoutMagnitude, bodyPct, compressionBarsCount: compressionBars.length, currentRange, avgRange },
      preliminaryConfidence: confidence,
      classifierVersion: this.version,
      reasoning: `BREAKOUT_EXPANSION ${direction}: breakout=${breakoutMagnitude.toFixed(2)}ATR, body=${(bodyPct * 100).toFixed(0)}%, compressionBars=${compressionBars.length}`,
    };
  }
}
