/**
 * B-007 — VWAP_RECLAIM Classifier
 * Sprint 122B | ORION-DIRECTIVE-001
 */
import type { IBehaviourClassifier, ClassifierOutput, ProcessedBarData, BehaviourDirection } from '../types.js';

export class VwapReclaimClassifier implements IBehaviourClassifier {
  readonly behaviourId = 'VWAP_RECLAIM' as const;
  readonly version = '1.0.0';

  getRequiredHistory(): number { return 6; }

  isApplicable(bar: ProcessedBarData): boolean {
    return bar.session === 'NEW_YORK' || bar.session === 'LONDON';
  }

  classify(bar: ProcessedBarData): ClassifierOutput | null {
    const { close, high, low, open, vwap, ema9, ema21, rsi, atr } = bar;
    const recent = bar.recentBars;

    // Prior position: at least 3 bars below/above VWAP
    const barsBelow = recent.slice(0, 6).filter((b) => b.close < b.vwap).length;
    const barsAbove = recent.slice(0, 6).filter((b) => b.close > b.vwap).length;

    const longSignal = barsBelow >= 3 && close > vwap;
    const shortSignal = barsAbove >= 3 && close < vwap;

    if (!longSignal && !shortSignal) return null;

    const direction: BehaviourDirection = longSignal ? 'LONG' : 'SHORT';

    // Reclaim bar: close above/below VWAP by ≥0.1 ATR
    const reclaimDist = direction === 'LONG'
      ? (close - vwap) / atr
      : (vwap - close) / atr;
    if (reclaimDist < 0.1) return null;

    // Reclaim bar body: ≥60% of bar range
    const barRange = high - low;
    const barBody = Math.abs(close - open);
    const bodyPct = barRange > 0 ? barBody / barRange : 0;
    if (bodyPct < 0.60) return null;

    // Volume: above average (proxy via range)
    const avgRange = recent.slice(0, 20).reduce((s, b) => s + (b.high - b.low), 0) / Math.min(recent.length, 20);
    const highVolume = barRange > avgRange * 0.9;
    if (!highVolume) return null;

    // RSI: transitioning
    const rsiOk = direction === 'LONG'
      ? rsi >= 45 && rsi <= 65
      : rsi >= 35 && rsi <= 55;

    // Calculate confidence
    let confidence = 40;
    const priorBarsCount = direction === 'LONG' ? barsBelow : barsAbove;
    if (priorBarsCount >= 5) confidence += 10;
    if (bodyPct >= 0.75) confidence += 10;
    if (barRange > avgRange * 1.3) confidence += 10;
    if (rsiOk) confidence += 10;
    // EMA9 crossing EMA21 in same direction
    const emaCross = direction === 'LONG'
      ? ema9 > ema21 && (recent[0]?.ema9 ?? ema9) <= (recent[0]?.ema21 ?? ema21)
      : ema9 < ema21 && (recent[0]?.ema9 ?? ema9) >= (recent[0]?.ema21 ?? ema21);
    if (emaCross) confidence += 10;
    confidence = Math.min(85, confidence);

    const conditionsMet = [
      priorBarsCount >= 3,
      reclaimDist >= 0.1,
      bodyPct >= 0.60,
      highVolume,
      rsiOk,
    ].filter(Boolean).length;

    const evidenceScore = Math.round((conditionsMet / 5) * 100);
    if (evidenceScore < 55) return null;

    return {
      behaviourId: this.behaviourId,
      direction,
      rawEvidenceScores: { rsi, atr, reclaimDist, bodyPct, priorBarsCount, barRange, avgRange },
      preliminaryConfidence: confidence,
      classifierVersion: this.version,
      reasoning: `VWAP_RECLAIM ${direction}: dist=${reclaimDist.toFixed(2)}ATR, body=${(bodyPct * 100).toFixed(0)}%, priorBars=${priorBarsCount}, RSI=${rsi.toFixed(1)}`,
    };
  }
}
