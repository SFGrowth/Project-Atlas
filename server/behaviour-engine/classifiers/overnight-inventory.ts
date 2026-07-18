/**
 * B-010 — OVERNIGHT_INVENTORY Classifier
 * Sprint 122B | ORION-DIRECTIVE-001
 * NY pre-open / open: 12:00–14:00 UTC
 */
import type { IBehaviourClassifier, ClassifierOutput, ProcessedBarData, BehaviourDirection } from '../types.js';

export class OvernightInventoryClassifier implements IBehaviourClassifier {
  readonly behaviourId = 'OVERNIGHT_INVENTORY' as const;
  readonly version = '1.0.0';

  getRequiredHistory(): number { return 25; }

  isApplicable(bar: ProcessedBarData): boolean {
    if (bar.regime === 'TRENDING') return false;
    // Check if within NY pre-open/open window: 12:00–14:00 UTC
    const barDate = new Date(bar.barOpenTs);
    const utcH = barDate.getUTCHours();
    const utcM = barDate.getUTCMinutes();
    const minutesSinceMidnight = utcH * 60 + utcM;
    return minutesSinceMidnight >= 720 && minutesSinceMidnight <= 840; // 12:00–14:00
  }

  classify(bar: ProcessedBarData): ClassifierOutput | null {
    const { close, rsi, atr } = bar;
    const recent = bar.recentBars;

    // Find prior day close: look back for the last bar before midnight UTC
    const priorDayClose = this.findPriorDayClose(recent, bar.barOpenTs);
    if (!priorDayClose) return null;

    // Overnight move: ≥1.5 ATR from prior day close
    const overnightMove = (close - priorDayClose) / atr;
    const longSignal = overnightMove <= -1.5 && rsi < 40;
    const shortSignal = overnightMove >= 1.5 && rsi > 60;

    if (!longSignal && !shortSignal) return null;

    const direction: BehaviourDirection = longSignal ? 'LONG' : 'SHORT';

    // Volume: below average during overnight (proxy: ATR below average)
    const avgAtr = recent.slice(0, 20).reduce((s, b) => s + b.atr, 0) / Math.min(recent.length, 20);
    const lowOvernightVolume = atr <= avgAtr * 1.1;

    // Prior day context: closed near middle of range
    const recentHigh = Math.max(...recent.slice(0, 20).map((b) => b.high));
    const recentLow = Math.min(...recent.slice(0, 20).map((b) => b.low));
    const rangeMiddle = (recentHigh + recentLow) / 2;
    const priorDayNearMiddle = Math.abs(priorDayClose - rangeMiddle) / (recentHigh - recentLow) < 0.3;

    // Calculate confidence
    let confidence = 40;
    if (Math.abs(overnightMove) >= 2.0) confidence += 10;
    if (lowOvernightVolume) confidence += 10;
    if (direction === 'LONG' && rsi < 35) confidence += 10;
    if (direction === 'SHORT' && rsi > 65) confidence += 10;
    if (priorDayNearMiddle) confidence += 10;
    confidence = Math.min(85, confidence);

    const conditionsMet = [
      Math.abs(overnightMove) >= 1.5,
      direction === 'LONG' ? rsi < 40 : rsi > 60,
      lowOvernightVolume,
      priorDayNearMiddle,
    ].filter(Boolean).length;

    const evidenceScore = Math.round(40 + (conditionsMet / 4) * 60);
    if (evidenceScore < 60) return null;

    return {
      behaviourId: this.behaviourId,
      direction,
      rawEvidenceScores: { rsi, atr, overnightMove, priorDayClose, avgAtr },
      preliminaryConfidence: confidence,
      classifierVersion: this.version,
      reasoning: `OVERNIGHT_INVENTORY ${direction}: move=${overnightMove.toFixed(2)}ATR, RSI=${rsi.toFixed(1)}, priorClose=${priorDayClose.toFixed(2)}`,
    };
  }

  private findPriorDayClose(recent: ProcessedBarData['recentBars'], currentBarTs: number): number | null {
    // Find the last bar from the previous calendar day
    const currentDate = new Date(currentBarTs);
    const currentDay = currentDate.getUTCDate();
    for (const bar of recent) {
      const barDate = new Date(bar.barOpenTs);
      if (barDate.getUTCDate() !== currentDay) {
        return bar.close;
      }
    }
    return recent.length >= 20 ? recent[19].close : null;
  }
}
