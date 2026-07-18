/**
 * B-006 — OPENING_RANGE_BREAKOUT Classifier
 * Sprint 122B | ORION-DIRECTIVE-001
 * NY session only: 13:30–14:30 UTC (first 6 bars = 30 min)
 */
import type { IBehaviourClassifier, ClassifierOutput, ProcessedBarData, BehaviourDirection } from '../types.js';

// NY open: 13:30 UTC, ORB window ends 14:30 UTC
const NY_OPEN_UTC_HOUR = 13;
const NY_OPEN_UTC_MIN = 30;
const ORB_END_UTC_HOUR = 14;
const ORB_END_UTC_MIN = 30;

export class OpeningRangeBreakoutClassifier implements IBehaviourClassifier {
  readonly behaviourId = 'OPENING_RANGE_BREAKOUT' as const;
  readonly version = '1.0.0';

  getRequiredHistory(): number { return 8; }

  isApplicable(bar: ProcessedBarData): boolean {
    if (bar.session !== 'NEW_YORK') return false;
    // Check if within ORB window
    const barDate = new Date(bar.barOpenTs);
    const utcH = barDate.getUTCHours();
    const utcM = barDate.getUTCMinutes();
    const minutesSinceMidnight = utcH * 60 + utcM;
    const orbStart = NY_OPEN_UTC_HOUR * 60 + NY_OPEN_UTC_MIN;
    const orbEnd = ORB_END_UTC_HOUR * 60 + ORB_END_UTC_MIN;
    return minutesSinceMidnight >= orbStart && minutesSinceMidnight <= orbEnd;
  }

  classify(bar: ProcessedBarData): ClassifierOutput | null {
    const { close, high, low, adx, atr } = bar;
    const recent = bar.recentBars;

    if (adx < 15) return null;

    // Define opening range from first 6 bars (30 min)
    const orbBars = recent.slice(0, Math.min(6, recent.length));
    if (orbBars.length < 3) return null; // Need at least 3 bars to define range

    const orbHigh = Math.max(...orbBars.map((b) => b.high));
    const orbLow = Math.min(...orbBars.map((b) => b.low));

    // Breakout: close above ORB high or below ORB low by ≥0.5 ATR
    const longBreakout = close > orbHigh && (close - orbHigh) / atr >= 0.5;
    const shortBreakout = close < orbLow && (orbLow - close) / atr >= 0.5;

    if (!longBreakout && !shortBreakout) return null;

    const direction: BehaviourDirection = longBreakout ? 'LONG' : 'SHORT';
    const breakoutMagnitude = longBreakout ? (close - orbHigh) / atr : (orbLow - close) / atr;

    // Volume: above 20-bar average (proxy via range)
    const avgRange = recent.slice(0, 20).reduce((s, b) => s + (b.high - b.low), 0) / Math.min(recent.length, 20);
    const currentRange = high - low;
    const highVolume = currentRange > avgRange * 1.0;
    if (!highVolume) return null;

    // Calculate confidence
    let confidence = 45;
    if (breakoutMagnitude >= 1.0) confidence += 10;
    if (currentRange > avgRange * 1.5) confidence += 10; // volume ≥1.5× avg
    if (adx >= 20) confidence += 10;
    // Prior day context: check if close is moving away from recent range
    const recentHigh = Math.max(...recent.slice(0, 20).map((b) => b.high));
    const recentLow = Math.min(...recent.slice(0, 20).map((b) => b.low));
    const orbRange = orbHigh - orbLow;
    const cleanRange = orbRange < atr * 1.5; // clean, tight opening range
    if (cleanRange) confidence += 10;
    // Prior day close in same direction: simplified check
    if (recent.length >= 20) {
      const priorClose = recent[19]?.close ?? close;
      const priorDayAligned = direction === 'LONG' ? close > priorClose : close < priorClose;
      if (priorDayAligned) confidence += 10;
    }
    confidence = Math.min(90, confidence);

    const conditionsMet = [
      breakoutMagnitude >= 0.5,
      highVolume,
      adx >= 15,
      orbBars.length >= 3,
    ].filter(Boolean).length;

    const evidenceScore = Math.round(50 + (conditionsMet / 4) * 50);
    if (evidenceScore < 65) return null;

    return {
      behaviourId: this.behaviourId,
      direction,
      rawEvidenceScores: { adx, atr, orbHigh, orbLow, breakoutMagnitude, currentRange, avgRange },
      preliminaryConfidence: confidence,
      classifierVersion: this.version,
      reasoning: `ORB ${direction}: breakout=${breakoutMagnitude.toFixed(2)}ATR, ADX=${adx.toFixed(1)}, orbRange=${(orbHigh - orbLow).toFixed(1)}`,
    };
  }
}
