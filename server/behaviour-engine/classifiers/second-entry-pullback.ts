/**
 * B-002 — SECOND_ENTRY_PULLBACK Classifier
 * Sprint 122B | ORION-DIRECTIVE-001
 */
import type { IBehaviourClassifier, ClassifierOutput, ProcessedBarData, BehaviourDirection } from '../types.js';

export class SecondEntryPullbackClassifier implements IBehaviourClassifier {
  readonly behaviourId = 'SECOND_ENTRY_PULLBACK' as const;
  readonly version = '1.0.0';

  getRequiredHistory(): number { return 12; }

  isApplicable(bar: ProcessedBarData): boolean {
    return bar.adx >= 15 && (bar.regime === 'TRENDING' || bar.regime === 'RANGING');
  }

  classify(bar: ProcessedBarData): ClassifierOutput | null {
    const { close, ema9, ema21, vwap, adx, rsi, atr } = bar;
    const recent = bar.recentBars;

    if (adx < 20) return null;

    // Find prior directional move: ≥1.5 ATR in 3–10 bars
    const priorMove = this.findPriorMove(recent, atr);
    if (!priorMove) return null;

    const direction: BehaviourDirection = priorMove.direction;

    // Pullback depth: 38–62% of prior move
    const pullbackDepth = this.calcPullbackDepth(recent, priorMove);
    if (pullbackDepth < 0.38 || pullbackDepth > 0.62) return null;

    // Pullback to key level: within 0.25 ATR of EMA9, EMA21, or VWAP
    const atKeyLevel = (
      Math.abs(close - ema9) / atr < 0.25 ||
      Math.abs(close - ema21) / atr < 0.25 ||
      Math.abs(close - vwap) / atr < 0.25
    );
    if (!atKeyLevel) return null;

    // RSI at pullback low
    const rsiOk = direction === 'LONG'
      ? rsi >= 40 && rsi <= 55
      : rsi >= 45 && rsi <= 60;
    if (!rsiOk) return null;

    // Volume on pullback: below 20-bar average
    const avgVol = recent.slice(0, 20).reduce((s, b) => s + b.atr, 0) / Math.min(recent.length, 20);
    const pullbackBars = recent.slice(0, Math.min(4, recent.length));
    const pullbackVolOk = pullbackBars.every((b) => b.atr <= avgVol * 1.1); // proxy via ATR contraction

    // Calculate confidence
    let confidence = 45;
    const atEma9 = Math.abs(close - ema9) / atr < 0.15;
    if (atEma9) confidence += 10;
    if (rsiOk) confidence += 10;
    if (pullbackVolOk) confidence += 10;
    if (adx >= 25) confidence += 10;
    if (priorMove.magnitude >= 2.0 * atr) confidence += 10;
    confidence = Math.min(90, confidence);

    const conditionsMet = [
      priorMove.magnitude >= 1.5 * atr,
      pullbackDepth >= 0.38 && pullbackDepth <= 0.62,
      atKeyLevel,
      adx >= 20,
      rsiOk,
      pullbackVolOk,
    ].filter(Boolean).length;

    const evidenceScore = Math.round((conditionsMet / 6) * 100);
    if (evidenceScore < 60) return null;

    return {
      behaviourId: this.behaviourId,
      direction,
      rawEvidenceScores: {
        adx, rsi, ema9, ema21, vwap, close, atr,
        priorMoveMagnitude: priorMove.magnitude,
        pullbackDepth,
        conditionsMet,
      },
      preliminaryConfidence: confidence,
      classifierVersion: this.version,
      reasoning: `SEP ${direction}: prior move=${priorMove.magnitude.toFixed(1)}, pullback=${(pullbackDepth * 100).toFixed(0)}%, ADX=${adx.toFixed(1)}, RSI=${rsi.toFixed(1)}`,
    };
  }

  private findPriorMove(recent: ProcessedBarData['recentBars'], atr: number): { direction: BehaviourDirection; magnitude: number; bars: number } | null {
    // Look for a move of ≥1.5 ATR in 3–10 bars in recent history
    for (let lookback = 3; lookback <= 10; lookback++) {
      if (recent.length < lookback) break;
      const bars = recent.slice(0, lookback);
      const startClose = bars[bars.length - 1].close;
      const endClose = bars[0].close;
      const magnitude = Math.abs(endClose - startClose);
      if (magnitude >= 1.5 * atr) {
        return {
          direction: endClose > startClose ? 'LONG' : 'SHORT',
          magnitude,
          bars: lookback,
        };
      }
    }
    return null;
  }

  private calcPullbackDepth(recent: ProcessedBarData['recentBars'], priorMove: { direction: BehaviourDirection; magnitude: number; bars: number }): number {
    const moveBars = recent.slice(0, priorMove.bars);
    const moveHigh = Math.max(...moveBars.map((b) => b.high));
    const moveLow = Math.min(...moveBars.map((b) => b.low));
    const currentClose = recent[0]?.close ?? 0;

    if (priorMove.direction === 'LONG') {
      const retrace = moveHigh - currentClose;
      return priorMove.magnitude > 0 ? retrace / priorMove.magnitude : 0;
    } else {
      const retrace = currentClose - moveLow;
      return priorMove.magnitude > 0 ? retrace / priorMove.magnitude : 0;
    }
  }
}
