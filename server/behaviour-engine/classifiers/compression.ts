/**
 * B-008 — COMPRESSION Classifier
 * Sprint 122B | ORION-DIRECTIVE-001
 */
import type { IBehaviourClassifier, ClassifierOutput, ProcessedBarData } from '../types.js';

export class CompressionClassifier implements IBehaviourClassifier {
  readonly behaviourId = 'COMPRESSION' as const;
  readonly version = '1.0.0';

  getRequiredHistory(): number { return 5; }

  isApplicable(bar: ProcessedBarData): boolean {
    return bar.adx < 25 && (bar.regime === 'RANGING' || bar.regime === 'CHOPPY');
  }

  classify(bar: ProcessedBarData): ClassifierOutput | null {
    const { close, vwap, adx, atr } = bar;
    const recent = bar.recentBars;

    if (adx >= 20) return null;

    // ATR: current ≤60% of 20-bar average
    const avgAtr = recent.slice(0, 20).reduce((s, b) => s + b.atr, 0) / Math.min(recent.length, 20);
    if (atr > avgAtr * 0.60) return null;

    // Bar range: last 3 bars each ≤0.5 ATR
    const last3 = recent.slice(0, 3);
    const rangesOk = last3.length >= 3 && last3.every((b) => (b.high - b.low) <= atr * 0.5);
    if (!rangesOk) return null;

    // Volume: last 3 bars below average (proxy via ATR contraction)
    const volumeOk = last3.every((b) => b.atr <= avgAtr * 1.0);

    // Price within 0.5 ATR of VWAP
    const vwapDist = Math.abs(close - vwap) / atr;
    if (vwapDist > 0.5) return null;

    // Duration: ≥3 consecutive compression bars
    let compressionCount = 0;
    for (const b of recent.slice(0, 20)) {
      if (b.atr <= avgAtr * 0.70 && (b.high - b.low) <= atr * 0.6) {
        compressionCount++;
      } else {
        break;
      }
    }
    if (compressionCount < 3) return null;

    // Calculate confidence
    let confidence = 35;
    if (atr <= avgAtr * 0.50) confidence += 10;
    if (compressionCount >= 5) confidence += 10;
    if (volumeOk) confidence += 10;
    if (vwapDist <= 0.25) confidence += 10;
    if (adx < 15) confidence += 10;
    confidence = Math.min(80, confidence);

    const conditionsMet = [
      atr <= avgAtr * 0.60,
      rangesOk,
      volumeOk,
      adx < 20,
      vwapDist <= 0.5,
      compressionCount >= 3,
    ].filter(Boolean).length;

    const evidenceScore = Math.round((conditionsMet / 6) * 100);
    if (evidenceScore < 50) return null;

    return {
      behaviourId: this.behaviourId,
      direction: 'NEUTRAL',
      rawEvidenceScores: { adx, atr, avgAtr, vwapDist, compressionCount },
      preliminaryConfidence: confidence,
      classifierVersion: this.version,
      reasoning: `COMPRESSION: ATR=${(atr / avgAtr * 100).toFixed(0)}% of avg, ${compressionCount} bars, ADX=${adx.toFixed(1)}, VWAPdist=${vwapDist.toFixed(2)}ATR`,
    };
  }
}
