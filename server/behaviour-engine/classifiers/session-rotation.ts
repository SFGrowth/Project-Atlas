/**
 * B-011 — SESSION_ROTATION Classifier
 * Sprint 122B | ORION-DIRECTIVE-001
 * London close / NY afternoon: 16:30–17:30 UTC
 */
import type { IBehaviourClassifier, ClassifierOutput, ProcessedBarData, BehaviourDirection } from '../types.js';

export class SessionRotationClassifier implements IBehaviourClassifier {
  readonly behaviourId = 'SESSION_ROTATION' as const;
  readonly version = '1.0.0';

  getRequiredHistory(): number { return 18; }

  isApplicable(bar: ProcessedBarData): boolean {
    // Check if within London close / session rotation window: 16:30–17:30 UTC
    const barDate = new Date(bar.barOpenTs);
    const utcH = barDate.getUTCHours();
    const utcM = barDate.getUTCMinutes();
    const minutesSinceMidnight = utcH * 60 + utcM;
    return minutesSinceMidnight >= 990 && minutesSinceMidnight <= 1050; // 16:30–17:30
  }

  classify(bar: ProcessedBarData): ClassifierOutput | null {
    const { close, vwap, rsi, atr } = bar;
    const recent = bar.recentBars;

    // London session direction: measure move from ~07:00 UTC to current
    const londonSessionBars = recent.filter((b) => {
      const d = new Date(b.barOpenTs);
      const mins = d.getUTCHours() * 60 + d.getUTCMinutes();
      return mins >= 420 && mins <= 990; // 07:00–16:30 UTC
    });

    if (londonSessionBars.length < 6) return null;

    const londonOpen = londonSessionBars[londonSessionBars.length - 1].close;
    const londonMove = (close - londonOpen) / atr;

    // London session move ≥1.0 ATR
    if (Math.abs(londonMove) < 1.0) return null;

    // Rotation: price reversing London direction
    const longSignal = londonMove <= -1.0 && rsi < 40; // London was down, now rotating up
    const shortSignal = londonMove >= 1.0 && rsi > 60;  // London was up, now rotating down

    if (!longSignal && !shortSignal) return null;

    const direction: BehaviourDirection = longSignal ? 'LONG' : 'SHORT';

    // VWAP position: price should be near VWAP for rotation
    const vwapDist = Math.abs(close - vwap) / atr;
    const nearVwap = vwapDist < 1.0;

    // RSI turning: check if RSI is changing direction
    const prevRsi = recent[0]?.rsi ?? rsi;
    const rsiTurning = direction === 'LONG'
      ? rsi > prevRsi
      : rsi < prevRsi;

    // Calculate confidence
    let confidence = 35;
    if (Math.abs(londonMove) >= 1.5) confidence += 10;
    if (nearVwap) confidence += 10;
    if (rsiTurning) confidence += 10;
    if (direction === 'LONG' && rsi < 35) confidence += 10;
    if (direction === 'SHORT' && rsi > 65) confidence += 10;
    confidence = Math.min(80, confidence);

    const conditionsMet = [
      Math.abs(londonMove) >= 1.0,
      direction === 'LONG' ? rsi < 40 : rsi > 60,
      nearVwap,
      rsiTurning,
    ].filter(Boolean).length;

    const evidenceScore = Math.round((conditionsMet / 4) * 100);
    if (evidenceScore < 55) return null;

    return {
      behaviourId: this.behaviourId,
      direction,
      rawEvidenceScores: { rsi, atr, londonMove, vwapDist, londonSessionBarsCount: londonSessionBars.length },
      preliminaryConfidence: confidence,
      classifierVersion: this.version,
      reasoning: `SESSION_ROTATION ${direction}: London move=${londonMove.toFixed(2)}ATR, RSI=${rsi.toFixed(1)}, VWAPdist=${vwapDist.toFixed(2)}ATR`,
    };
  }
}
