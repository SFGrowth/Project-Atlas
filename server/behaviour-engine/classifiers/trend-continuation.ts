/**
 * B-001 — TREND_CONTINUATION Classifier
 * Sprint 122B | ORION-DIRECTIVE-001
 */
import type { IBehaviourClassifier, ClassifierOutput, ProcessedBarData, BehaviourDirection } from '../types.js';

export class TrendContinuationClassifier implements IBehaviourClassifier {
  readonly behaviourId = 'TREND_CONTINUATION' as const;
  readonly version = '1.0.0';

  getRequiredHistory(): number { return 8; }

  isApplicable(bar: ProcessedBarData): boolean {
    return bar.adx >= 20 && (bar.regime === 'TRENDING' || bar.regime === 'VOLATILE');
  }

  classify(bar: ProcessedBarData): ClassifierOutput | null {
    const { close, vwap, ema9, ema21, adx, rsi, atr } = bar;
    const recent = bar.recentBars;

    // Determine direction
    const longSignal = ema9 > ema21 && close > vwap && rsi >= 45 && rsi <= 70;
    const shortSignal = ema9 < ema21 && close < vwap && rsi >= 30 && rsi <= 55;

    if (!longSignal && !shortSignal) return null;
    if (adx < 25) return null;
    if (atr < 0.001) return null;

    const direction: BehaviourDirection = longSignal ? 'LONG' : 'SHORT';

    // Check ATR condition: current ATR >= 0.5× 20-bar average
    const avgAtr = recent.slice(0, 20).reduce((s, b) => s + b.atr, 0) / Math.min(recent.length, 20);
    if (atr < avgAtr * 0.5) return null;

    // Check pullback: 2–6 bars of counter-trend in recent history
    const counterTrendBars = this.countCounterTrendBars(recent, direction);
    if (counterTrendBars < 2 || counterTrendBars > 6) return null;

    // Check price structure: higher lows (long) or lower highs (short)
    const structureOk = this.checkPriceStructure(recent, direction);
    if (!structureOk) return null;

    // Calculate confidence
    let confidence = 40;
    if (adx >= 30) confidence += 10;
    if (direction === 'LONG' && rsi >= 50 && rsi <= 65) confidence += 10;
    if (direction === 'SHORT' && rsi >= 35 && rsi <= 50) confidence += 10;
    const vwapDist = Math.abs(close - vwap) / atr;
    if (vwapDist >= 0.25) confidence += 10;
    const emaSep = Math.abs(ema9 - ema21) / atr;
    if (emaSep >= 0.5) confidence += 10;
    // Pullback to EMA9 or EMA21
    const pullbackToEma = recent.slice(0, counterTrendBars).some(
      (b) => Math.abs(b.low - ema9) / atr < 0.25 || Math.abs(b.low - ema21) / atr < 0.25
    );
    if (pullbackToEma) confidence += 10;
    confidence = Math.min(90, confidence);

    // Evidence scores
    const conditionsMet = [
      adx >= 25,
      direction === 'LONG' ? ema9 > ema21 : ema9 < ema21,
      direction === 'LONG' ? close > vwap : close < vwap,
      direction === 'LONG' ? (rsi >= 45 && rsi <= 70) : (rsi >= 30 && rsi <= 55),
      atr >= avgAtr * 0.5,
      counterTrendBars >= 2 && counterTrendBars <= 6,
    ].filter(Boolean).length;

    const evidenceScore = Math.round((conditionsMet / 6) * 100);
    if (evidenceScore < 55) return null;

    return {
      behaviourId: this.behaviourId,
      direction,
      rawEvidenceScores: {
        adx, rsi, ema9, ema21, vwap, close, atr, avgAtr,
        counterTrendBars, conditionsMet, emaSep, vwapDist,
      },
      preliminaryConfidence: confidence,
      classifierVersion: this.version,
      reasoning: `TREND_CONTINUATION ${direction}: ADX=${adx.toFixed(1)}, EMA9/21=${ema9.toFixed(1)}/${ema21.toFixed(1)}, RSI=${rsi.toFixed(1)}, pullback=${counterTrendBars} bars, conditions=${conditionsMet}/6`,
    };
  }

  private countCounterTrendBars(recent: ProcessedBarData['recentBars'], direction: BehaviourDirection): number {
    let count = 0;
    for (const bar of recent.slice(0, 8)) {
      const isCounter = direction === 'LONG' ? bar.close < bar.open : bar.close > bar.open;
      if (isCounter) count++;
      else break;
    }
    return count;
  }

  private checkPriceStructure(recent: ProcessedBarData['recentBars'], direction: BehaviourDirection): boolean {
    if (recent.length < 4) return false;
    const bars = recent.slice(0, 4);
    if (direction === 'LONG') {
      // Higher lows
      return bars[0].low > bars[1].low || bars[1].low > bars[2].low;
    } else {
      // Lower highs
      return bars[0].high < bars[1].high || bars[1].high < bars[2].high;
    }
  }
}
