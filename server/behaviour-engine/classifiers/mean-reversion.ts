/**
 * B-005 — MEAN_REVERSION Classifier
 * Sprint 122B | ORION-DIRECTIVE-001
 */
import type { IBehaviourClassifier, ClassifierOutput, ProcessedBarData, BehaviourDirection } from '../types.js';

export class MeanReversionClassifier implements IBehaviourClassifier {
  readonly behaviourId = 'MEAN_REVERSION' as const;
  readonly version = '1.0.0';

  getRequiredHistory(): number { return 6; }

  isApplicable(bar: ProcessedBarData): boolean {
    return bar.adx < 25 && (bar.regime === 'RANGING' || bar.regime === 'CHOPPY');
  }

  classify(bar: ProcessedBarData): ClassifierOutput | null {
    const { close, vwap, ema9, ema21, adx, rsi, atr } = bar;
    const recent = bar.recentBars;

    if (adx >= 25) return null;

    // VWAP distance: ≥1.5 ATR
    const vwapDist = (close - vwap) / atr;
    const longSignal = vwapDist <= -1.5 && rsi < 35;
    const shortSignal = vwapDist >= 1.5 && rsi > 65;

    if (!longSignal && !shortSignal) return null;

    const direction: BehaviourDirection = longSignal ? 'LONG' : 'SHORT';

    // EMA structure: EMA9 < EMA21 but converging (long) or EMA9 > EMA21 but converging (short)
    const emaConverging = direction === 'LONG'
      ? ema9 < ema21 && Math.abs(ema9 - ema21) < Math.abs(recent[0]?.ema9 - recent[0]?.ema21 || 0) * 1.1
      : ema9 > ema21 && Math.abs(ema9 - ema21) < Math.abs(recent[0]?.ema9 - recent[0]?.ema21 || 0) * 1.1;

    // Momentum declining: last 3 bars show decreasing range
    const last3 = recent.slice(0, 3);
    const momentumDeclining = last3.length >= 3 &&
      (last3[0].high - last3[0].low) <= (last3[1].high - last3[1].low) ||
      (last3[1].high - last3[1].low) <= (last3[2].high - last3[2].low);

    // Volume declining on extension bars
    const volumeDeclining = last3.length >= 3 &&
      last3[0].atr <= last3[1].atr || last3[1].atr <= last3[2].atr;

    // Calculate confidence
    let confidence = 35;
    if (Math.abs(vwapDist) >= 2.0) confidence += 10;
    if (direction === 'LONG' && rsi < 30) confidence += 10;
    if (direction === 'SHORT' && rsi > 70) confidence += 10;
    if (adx < 20) confidence += 10;
    if (volumeDeclining) confidence += 10;
    if (emaConverging) confidence += 10;
    confidence = Math.min(80, confidence);

    const conditionsMet = [
      Math.abs(vwapDist) >= 1.5,
      direction === 'LONG' ? rsi < 35 : rsi > 65,
      adx < 25,
      momentumDeclining,
      emaConverging,
      volumeDeclining,
    ].filter(Boolean).length;

    const evidenceScore = Math.round((conditionsMet / 6) * 100);
    if (evidenceScore < 55) return null;

    return {
      behaviourId: this.behaviourId,
      direction,
      rawEvidenceScores: { adx, rsi, vwapDist, ema9, ema21, atr },
      preliminaryConfidence: confidence,
      classifierVersion: this.version,
      reasoning: `MEAN_REVERSION ${direction}: VWAP dist=${vwapDist.toFixed(2)}ATR, RSI=${rsi.toFixed(1)}, ADX=${adx.toFixed(1)}, conditions=${conditionsMet}/6`,
    };
  }
}
