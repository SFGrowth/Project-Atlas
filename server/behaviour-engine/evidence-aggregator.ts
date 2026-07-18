/**
 * Atlas Behaviour Engine — Evidence Aggregator
 * Sprint 122B | ORION-DIRECTIVE-001
 *
 * Maps raw ClassifierOutput scores into a structured 7-dimension EvidenceRecord.
 * Each dimension is scored 0–100. The weighted composite becomes the evidenceScore.
 */

import type { ClassifierOutput, EvidenceRecord, ProcessedBarData } from './types.js';

// Dimension weights (sum = 1.0)
const EVIDENCE_WEIGHTS = {
  indicatorAgreement: 0.25,
  regimeAlignment: 0.20,
  sessionQuality: 0.10,
  priceStructure: 0.20,
  volumeConfirmation: 0.10,
  historicalBaseRate: 0.10,
  recencyWeight: 0.05,
} as const;

// Historical base rates per behaviour (from backtested data — updated by DARWIN)
const BASE_RATES: Record<string, number> = {
  TREND_CONTINUATION: 58,
  SECOND_ENTRY_PULLBACK: 62,
  LIQUIDITY_SWEEP: 55,
  FAILED_BREAKOUT: 53,
  MEAN_REVERSION: 57,
  OPENING_RANGE_BREAKOUT: 60,
  VWAP_RECLAIM: 56,
  COMPRESSION: 70,           // High base rate — compression is reliable
  BREAKOUT_EXPANSION: 63,
  OVERNIGHT_INVENTORY: 52,
  SESSION_ROTATION: 54,
  VOLATILITY_EXPANSION: 68, // High base rate — volatility expansion is reliable
};

// Regime alignment scores per behaviour
const REGIME_ALIGNMENT: Record<string, Record<string, number>> = {
  TREND_CONTINUATION: { TRENDING: 90, VOLATILE: 70, RANGING: 30, CHOPPY: 10 },
  SECOND_ENTRY_PULLBACK: { TRENDING: 85, VOLATILE: 60, RANGING: 50, CHOPPY: 20 },
  LIQUIDITY_SWEEP: { RANGING: 80, TRENDING: 70, VOLATILE: 60, CHOPPY: 40 },
  FAILED_BREAKOUT: { RANGING: 85, CHOPPY: 75, TRENDING: 30, VOLATILE: 40 },
  MEAN_REVERSION: { RANGING: 90, CHOPPY: 80, TRENDING: 20, VOLATILE: 30 },
  OPENING_RANGE_BREAKOUT: { TRENDING: 85, VOLATILE: 80, RANGING: 50, CHOPPY: 30 },
  VWAP_RECLAIM: { RANGING: 80, TRENDING: 70, VOLATILE: 60, CHOPPY: 40 },
  COMPRESSION: { RANGING: 90, CHOPPY: 85, TRENDING: 30, VOLATILE: 20 },
  BREAKOUT_EXPANSION: { TRENDING: 90, VOLATILE: 85, RANGING: 40, CHOPPY: 20 },
  OVERNIGHT_INVENTORY: { RANGING: 80, CHOPPY: 70, TRENDING: 50, VOLATILE: 60 },
  SESSION_ROTATION: { RANGING: 75, CHOPPY: 70, TRENDING: 50, VOLATILE: 55 },
  VOLATILITY_EXPANSION: { VOLATILE: 95, TRENDING: 80, RANGING: 40, CHOPPY: 30 },
};

// Session quality scores per behaviour
const SESSION_QUALITY: Record<string, Record<string, number>> = {
  TREND_CONTINUATION: { NEW_YORK: 90, LONDON: 80, ASIA: 50, OVERNIGHT: 20 },
  SECOND_ENTRY_PULLBACK: { NEW_YORK: 85, LONDON: 80, ASIA: 50, OVERNIGHT: 20 },
  LIQUIDITY_SWEEP: { NEW_YORK: 90, LONDON: 85, ASIA: 60, OVERNIGHT: 30 },
  FAILED_BREAKOUT: { NEW_YORK: 80, LONDON: 75, ASIA: 50, OVERNIGHT: 25 },
  MEAN_REVERSION: { NEW_YORK: 85, LONDON: 80, ASIA: 60, OVERNIGHT: 30 },
  OPENING_RANGE_BREAKOUT: { NEW_YORK: 100, LONDON: 20, ASIA: 10, OVERNIGHT: 5 },
  VWAP_RECLAIM: { NEW_YORK: 90, LONDON: 85, ASIA: 40, OVERNIGHT: 15 },
  COMPRESSION: { NEW_YORK: 80, LONDON: 75, ASIA: 60, OVERNIGHT: 40 },
  BREAKOUT_EXPANSION: { NEW_YORK: 90, LONDON: 85, ASIA: 60, OVERNIGHT: 30 },
  OVERNIGHT_INVENTORY: { NEW_YORK: 90, LONDON: 50, ASIA: 30, OVERNIGHT: 70 },
  SESSION_ROTATION: { NEW_YORK: 95, LONDON: 80, ASIA: 20, OVERNIGHT: 10 },
  VOLATILITY_EXPANSION: { NEW_YORK: 85, LONDON: 80, ASIA: 60, OVERNIGHT: 50 },
};

export class EvidenceAggregator {
  aggregate(output: ClassifierOutput, bar: ProcessedBarData): EvidenceRecord {
    const { behaviourId, rawEvidenceScores, preliminaryConfidence } = output;

    // 1. Indicator Agreement: how many indicators agree with the signal
    const indicatorAgreement = this.calcIndicatorAgreement(rawEvidenceScores, bar);

    // 2. Regime Alignment: how well the current regime supports this behaviour
    const regimeAlignment = REGIME_ALIGNMENT[behaviourId]?.[bar.regime] ?? 50;

    // 3. Session Quality: how well the current session supports this behaviour
    const sessionQuality = SESSION_QUALITY[behaviourId]?.[bar.session] ?? 50;

    // 4. Price Structure: from raw evidence scores (conditionsMet / total)
    const priceStructure = this.calcPriceStructure(rawEvidenceScores, preliminaryConfidence);

    // 5. Volume Confirmation: from raw evidence scores
    const volumeConfirmation = this.calcVolumeConfirmation(rawEvidenceScores, bar);

    // 6. Historical Base Rate
    const historicalBaseRate = BASE_RATES[behaviourId] ?? 50;

    // 7. Recency Weight: how recent is the trigger (always 80+ for current bar)
    const recencyWeight = 85;

    return {
      indicatorAgreement,
      regimeAlignment,
      sessionQuality,
      priceStructure,
      volumeConfirmation,
      historicalBaseRate,
      recencyWeight,
      rawIndicatorValues: rawEvidenceScores,
      classifierReasoning: output.reasoning,
    };
  }

  computeWeightedScore(evidence: EvidenceRecord): number {
    const score =
      evidence.indicatorAgreement * EVIDENCE_WEIGHTS.indicatorAgreement +
      evidence.regimeAlignment * EVIDENCE_WEIGHTS.regimeAlignment +
      evidence.sessionQuality * EVIDENCE_WEIGHTS.sessionQuality +
      evidence.priceStructure * EVIDENCE_WEIGHTS.priceStructure +
      evidence.volumeConfirmation * EVIDENCE_WEIGHTS.volumeConfirmation +
      evidence.historicalBaseRate * EVIDENCE_WEIGHTS.historicalBaseRate +
      evidence.recencyWeight * EVIDENCE_WEIGHTS.recencyWeight;
    return Math.round(Math.min(100, Math.max(0, score)));
  }

  private calcIndicatorAgreement(scores: Record<string, number>, bar: ProcessedBarData): number {
    // Count how many of the core indicators agree with the signal
    const indicators = [
      scores.conditionsMet !== undefined
        ? (scores.conditionsMet / (scores.totalConditions ?? 6)) * 100
        : 50,
    ];
    // ADX strength
    if (scores.adx !== undefined) {
      indicators.push(Math.min(100, (scores.adx / 40) * 100));
    }
    // RSI distance from 50
    if (scores.rsi !== undefined) {
      const rsiDist = Math.abs(scores.rsi - 50);
      indicators.push(Math.min(100, rsiDist * 2));
    }
    return Math.round(indicators.reduce((a, b) => a + b, 0) / indicators.length);
  }

  private calcPriceStructure(scores: Record<string, number>, preliminaryConfidence: number): number {
    // Use conditionsMet ratio if available, otherwise derive from confidence
    if (scores.conditionsMet !== undefined && scores.totalConditions !== undefined) {
      return Math.round((scores.conditionsMet / scores.totalConditions) * 100);
    }
    return Math.round(preliminaryConfidence * 0.9);
  }

  private calcVolumeConfirmation(scores: Record<string, number>, bar: ProcessedBarData): number {
    // Volume proxy: current ATR vs average ATR
    if (scores.avgAtr !== undefined && scores.atr !== undefined) {
      const ratio = scores.atr / scores.avgAtr;
      if (ratio >= 1.5) return 90;
      if (ratio >= 1.2) return 75;
      if (ratio >= 1.0) return 60;
      if (ratio >= 0.8) return 45;
      return 30;
    }
    // Range proxy
    if (scores.currentRange !== undefined && scores.avgRange !== undefined) {
      const ratio = scores.currentRange / scores.avgRange;
      if (ratio >= 1.5) return 90;
      if (ratio >= 1.2) return 75;
      if (ratio >= 1.0) return 60;
      return 40;
    }
    return 50;
  }
}
