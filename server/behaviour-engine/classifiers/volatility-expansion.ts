/**
 * B-012 — VOLATILITY_EXPANSION Classifier
 * Sprint 122B | ORION-DIRECTIVE-001
 * Special: modifies confidence of other behaviours when active
 * - Trend behaviours: +10 confidence boost
 * - Reversal behaviours: -15 confidence penalty
 * - COMPRESSION: invalidated
 */
import type { IBehaviourClassifier, ClassifierOutput, ProcessedBarData } from '../types.js';

export class VolatilityExpansionClassifier implements IBehaviourClassifier {
  readonly behaviourId = 'VOLATILITY_EXPANSION' as const;
  readonly version = '1.0.0';

  getRequiredHistory(): number { return 22; }

  isApplicable(_bar: ProcessedBarData): boolean {
    return true; // Volatility expansion can occur in any session/regime
  }

  classify(bar: ProcessedBarData): ClassifierOutput | null {
    const { high, low, adx, atr } = bar;
    const recent = bar.recentBars;

    // ATR: ≥150% of 20-bar average
    const avgAtr = recent.slice(0, 20).reduce((s, b) => s + b.atr, 0) / Math.min(recent.length, 20);
    if (atr < avgAtr * 1.50) return null;

    // Bar range: ≥1.5× average for last 2 bars
    const avgRange = recent.slice(0, 20).reduce((s, b) => s + (b.high - b.low), 0) / Math.min(recent.length, 20);
    const currentRange = high - low;
    if (currentRange < avgRange * 1.5) return null;

    const prevBar = recent[0];
    if (!prevBar || (prevBar.high - prevBar.low) < avgRange * 1.5) return null;

    // Volume: ≥1.5× average (proxy via range)
    const highVolume = currentRange >= avgRange * 1.5;
    if (!highVolume) return null;

    // ADX rising by ≥2
    const prevAdx = recent[0]?.adx ?? adx;
    const adxRising = adx > prevAdx + 2;

    // Calculate confidence
    let confidence = 35;
    if (atr >= avgAtr * 2.0) confidence += 15;
    else if (atr >= avgAtr * 1.75) confidence += 10;
    if (currentRange >= avgRange * 2.0) confidence += 10;
    if (adxRising) confidence += 10;
    // Consecutive expansion bars
    const expansionBars = recent.slice(0, 5).filter((b) => b.atr >= avgAtr * 1.3).length;
    if (expansionBars >= 3) confidence += 10;
    confidence = Math.min(85, confidence);

    const conditionsMet = [
      atr >= avgAtr * 1.5,
      currentRange >= avgRange * 1.5,
      highVolume,
      adxRising,
    ].filter(Boolean).length;

    const evidenceScore = Math.round(40 + (conditionsMet / 4) * 60);
    if (evidenceScore < 50) return null;

    return {
      behaviourId: this.behaviourId,
      direction: 'NEUTRAL',
      rawEvidenceScores: { adx, atr, avgAtr, currentRange, avgRange, expansionBars },
      preliminaryConfidence: confidence,
      classifierVersion: this.version,
      reasoning: `VOLATILITY_EXPANSION: ATR=${(atr / avgAtr * 100).toFixed(0)}% of avg, range=${(currentRange / avgRange * 100).toFixed(0)}% of avg, ADX rising=${adxRising}`,
    };
  }
}
