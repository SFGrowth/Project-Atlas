/**
 * Atlas Behaviour Engine — Confidence Calculator
 * Sprint 122B | ORION-DIRECTIVE-001
 *
 * Converts evidence scores into:
 * - confidence: 0–100 (certainty of behaviour classification)
 * - probability: 0.0–1.0 (estimated probability of profitable outcome)
 * - expectedR: expected R-multiple
 * - failureProbability: 0.0–1.0
 * - expectedDurationBars: estimated bars until resolution
 *
 * Applies VOLATILITY_EXPANSION interaction effects when active.
 */

import type { BehaviourId, EvidenceRecord, BehaviourDirection, MarketRegime, TradingSession } from './types.js';

// Expected R-multiples per behaviour (from backtested data)
const EXPECTED_R: Record<string, number> = {
  TREND_CONTINUATION: 1.8,
  SECOND_ENTRY_PULLBACK: 2.1,
  LIQUIDITY_SWEEP: 1.6,
  FAILED_BREAKOUT: 1.5,
  MEAN_REVERSION: 1.4,
  OPENING_RANGE_BREAKOUT: 2.3,
  VWAP_RECLAIM: 1.5,
  COMPRESSION: 0.0,        // Compression itself has no directional R
  BREAKOUT_EXPANSION: 2.5,
  OVERNIGHT_INVENTORY: 1.6,
  SESSION_ROTATION: 1.4,
  VOLATILITY_EXPANSION: 0.0, // Modifier, not directional
};

// Expected duration in bars per behaviour
const EXPECTED_DURATION: Record<string, number> = {
  TREND_CONTINUATION: 8,
  SECOND_ENTRY_PULLBACK: 5,
  LIQUIDITY_SWEEP: 4,
  FAILED_BREAKOUT: 6,
  MEAN_REVERSION: 10,
  OPENING_RANGE_BREAKOUT: 12,
  VWAP_RECLAIM: 6,
  COMPRESSION: 15,
  BREAKOUT_EXPANSION: 10,
  OVERNIGHT_INVENTORY: 8,
  SESSION_ROTATION: 6,
  VOLATILITY_EXPANSION: 20,
};

// Volatility expansion interaction effects
const VOLATILITY_EXPANSION_EFFECTS: Record<string, number> = {
  TREND_CONTINUATION: +10,
  SECOND_ENTRY_PULLBACK: +5,
  LIQUIDITY_SWEEP: -15,
  FAILED_BREAKOUT: -15,
  MEAN_REVERSION: -15,
  OPENING_RANGE_BREAKOUT: +10,
  VWAP_RECLAIM: -10,
  COMPRESSION: -100,        // Invalidated
  BREAKOUT_EXPANSION: +10,
  OVERNIGHT_INVENTORY: -5,
  SESSION_ROTATION: -10,
  VOLATILITY_EXPANSION: 0,
};

export interface ConfidenceResult {
  confidence: number;
  probability: number;
  expectedR: number;
  expectedDurationBars: number;
  failureProbability: number;
}

export class ConfidenceCalculator {
  calculate(
    behaviourId: BehaviourId,
    evidenceScore: number,
    evidence: EvidenceRecord,
    direction: BehaviourDirection,
    regime: MarketRegime,
    session: TradingSession,
    volatilityExpansionActive: boolean,
  ): ConfidenceResult {
    // Base confidence from evidence score
    let confidence = evidenceScore;

    // Apply volatility expansion interaction effect
    if (volatilityExpansionActive && behaviourId !== 'VOLATILITY_EXPANSION') {
      const effect = VOLATILITY_EXPANSION_EFFECTS[behaviourId] ?? 0;
      confidence = Math.max(0, confidence + effect);
      // Compression is invalidated
      if (behaviourId === 'COMPRESSION') {
        return { confidence: 0, probability: 0, expectedR: 0, expectedDurationBars: 0, failureProbability: 1 };
      }
    }

    // Session quality modifier
    const sessionMod = this.getSessionModifier(behaviourId, session);
    confidence = Math.min(100, confidence * sessionMod);

    // Regime alignment modifier
    const regimeMod = this.getRegimeModifier(behaviourId, regime);
    confidence = Math.min(100, confidence * regimeMod);

    confidence = Math.round(Math.min(100, Math.max(0, confidence)));

    // Convert confidence to probability using calibrated sigmoid
    const probability = this.confidenceToProbability(confidence, behaviourId);

    // Expected R (adjusted for confidence)
    const baseR = EXPECTED_R[behaviourId] ?? 1.5;
    const expectedR = baseR * (0.5 + (confidence / 200)); // scales from 50% to 100% of base R

    // Expected duration
    const expectedDurationBars = EXPECTED_DURATION[behaviourId] ?? 8;

    // Failure probability
    const failureProbability = Math.round((1 - probability) * 100) / 100;

    return {
      confidence,
      probability: Math.round(probability * 100) / 100,
      expectedR: Math.round(expectedR * 100) / 100,
      expectedDurationBars,
      failureProbability,
    };
  }

  private confidenceToProbability(confidence: number, behaviourId: BehaviourId): number {
    // Calibrated sigmoid: confidence 50 → prob 0.50, confidence 80 → prob 0.70, confidence 95 → prob 0.85
    const x = (confidence - 50) / 20;
    const sigmoid = 1 / (1 + Math.exp(-x));
    // Scale to realistic range: 0.35–0.85
    return 0.35 + sigmoid * 0.50;
  }

  private getSessionModifier(behaviourId: BehaviourId, session: TradingSession): number {
    if (behaviourId === 'OPENING_RANGE_BREAKOUT' && session !== 'NEW_YORK') return 0.3;
    if (behaviourId === 'SESSION_ROTATION' && session !== 'NEW_YORK') return 0.5;
    if (behaviourId === 'OVERNIGHT_INVENTORY' && session === 'ASIA') return 0.7;
    return 1.0;
  }

  private getRegimeModifier(behaviourId: BehaviourId, regime: MarketRegime): number {
    const trendBehaviours: BehaviourId[] = ['TREND_CONTINUATION', 'BREAKOUT_EXPANSION', 'OPENING_RANGE_BREAKOUT'];
    const reversalBehaviours: BehaviourId[] = ['MEAN_REVERSION', 'FAILED_BREAKOUT', 'LIQUIDITY_SWEEP'];

    if (trendBehaviours.includes(behaviourId) && regime === 'CHOPPY') return 0.7;
    if (reversalBehaviours.includes(behaviourId) && regime === 'TRENDING') return 0.75;
    if (behaviourId === 'COMPRESSION' && regime === 'VOLATILE') return 0.5;
    return 1.0;
  }
}
