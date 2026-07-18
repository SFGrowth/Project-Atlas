/**
 * Atlas Behaviour Engine — Behaviour State Manager
 * Sprint 122B | ORION-DIRECTIVE-001
 *
 * Manages the lifecycle of all active behaviour instances:
 * - Creates new instances on detection
 * - Updates existing instances on re-detection
 * - Promotes instances through lifecycle states
 * - Expires instances that exceed max duration
 * - Rejects instances when contradicting evidence appears
 *
 * 7 lifecycle states: FORMING → ACTIVE → MATURE → CONFIRMED | EXPIRED | REJECTED | SUPERSEDED
 */

import { randomUUID } from 'crypto';
import type {
  BehaviourInstance,
  BehaviourSignal,
  ClassifierOutput,
  EvidenceRecord,
  BehaviourId,
  BehaviourLifecycleState,
  BehaviourMaturity,
  ProcessedBarData,
} from './types.js';
import { EvidenceAggregator } from './evidence-aggregator.js';
import { ConfidenceCalculator } from './confidence-calculator.js';
import { behaviourEventBus } from './behaviour-event-bus.js';

// Max duration per behaviour (bars)
const MAX_DURATION: Record<string, number> = {
  TREND_CONTINUATION: 12,
  SECOND_ENTRY_PULLBACK: 8,
  LIQUIDITY_SWEEP: 10,
  FAILED_BREAKOUT: 12,
  MEAN_REVERSION: 15,
  OPENING_RANGE_BREAKOUT: 20,
  VWAP_RECLAIM: 12,
  COMPRESSION: 20,
  BREAKOUT_EXPANSION: 20,
  OVERNIGHT_INVENTORY: 20,
  SESSION_ROTATION: 15,
  VOLATILITY_EXPANSION: 30,
};

// Confirmation threshold (confidence must reach this to confirm)
const CONFIRMATION_THRESHOLD = 75;

// Maturity thresholds
function getMaturity(barCount: number, maxDuration: number): BehaviourMaturity {
  const pct = barCount / maxDuration;
  if (pct < 0.25) return 'FORMING';
  if (pct < 0.60) return 'ACTIVE';
  if (pct < 0.85) return 'MATURE';
  return 'EXHAUSTED';
}

export class BehaviourStateManager {
  private readonly instances: Map<string, BehaviourInstance> = new Map();
  private readonly evidenceAggregator = new EvidenceAggregator();
  private readonly confidenceCalculator = new ConfidenceCalculator();

  processClassifierOutputs(
    outputs: ClassifierOutput[],
    bar: ProcessedBarData,
    volatilityExpansionActive: boolean,
  ): { newSignals: BehaviourSignal[]; updatedSignals: BehaviourSignal[] } {
    const newSignals: BehaviourSignal[] = [];
    const updatedSignals: BehaviourSignal[] = [];

    for (const output of outputs) {
      const evidence = this.evidenceAggregator.aggregate(output, bar);
      const evidenceScore = this.evidenceAggregator.computeWeightedScore(evidence);

      const confResult = this.confidenceCalculator.calculate(
        output.behaviourId,
        evidenceScore,
        evidence,
        output.direction,
        bar.regime,
        bar.session,
        volatilityExpansionActive,
      );

      if (confResult.confidence === 0) continue;

      // Find existing active instance for this behaviour+direction
      const existing = this.findActiveInstance(output.behaviourId, output.direction, bar.symbol);

      if (existing) {
        // Update existing instance
        const updated = this.updateInstance(existing, output, evidence, confResult, bar);
        updatedSignals.push(this.instanceToSignal(updated, bar));
      } else {
        // Create new instance
        const instance = this.createInstance(output, evidence, confResult, bar);
        this.instances.set(instance.instanceId, instance);
        newSignals.push(this.instanceToSignal(instance, bar));

        // Emit detected event
        behaviourEventBus.emitDetected({
          type: 'behaviour_detected',
          eventId: randomUUID(),
          atlasTs: Date.now(),
          instanceId: instance.instanceId,
          behaviourId: instance.behaviourId,
          symbol: instance.symbol,
          barOpenTs: bar.barOpenTs,
          barCloseTs: bar.barCloseTs,
          source: 'shadow',
          direction: instance.direction,
          confidence: instance.confidence,
          probability: instance.probability,
          maturity: instance.maturity,
          evidenceScore: instance.evidenceScore,
          expectedR: instance.expectedR,
          expectedDurationBars: instance.expectedDurationBars,
          failureProbability: instance.failureProbability,
          regime: instance.regime,
          session: instance.session,
          lifecycleState: 'FORMING',
          evidence: instance.evidence,
          classifierVersion: instance.classifierVersion,
        });
      }
    }

    return { newSignals, updatedSignals };
  }

  expireStaleInstances(bar: ProcessedBarData): Array<{ instanceId: string; resolution: 'EXPIRED' | 'REJECTED' }> {
    const resolutions: Array<{ instanceId: string; resolution: 'EXPIRED' | 'REJECTED' }> = [];

    for (const [id, instance] of this.instances) {
      if (!['FORMING', 'ACTIVE', 'MATURE'].includes(instance.lifecycleState)) continue;

      const maxDuration = MAX_DURATION[instance.behaviourId] ?? 12;

      // Check regime change (reject)
      const regimeChanged = bar.regime !== instance.regime &&
        ['TRENDING', 'VOLATILE'].includes(bar.regime) &&
        ['RANGING', 'CHOPPY'].includes(instance.regime);

      if (regimeChanged && instance.barCount >= 2) {
        instance.lifecycleState = 'REJECTED';
        instance.rejectionReason = `Regime changed from ${instance.regime} to ${bar.regime}`;
        resolutions.push({ instanceId: id, resolution: 'REJECTED' });

        behaviourEventBus.emitRejected({
          type: 'behaviour_rejected',
          eventId: randomUUID(),
          atlasTs: Date.now(),
          instanceId: id,
          behaviourId: instance.behaviourId,
          symbol: instance.symbol,
          barOpenTs: bar.barOpenTs,
          barCloseTs: bar.barCloseTs,
          source: 'shadow',
          direction: instance.direction,
          finalConfidence: instance.confidence,
          peakConfidence: instance.peakConfidence,
          totalBarsActive: instance.barCount,
          rejectionReason: instance.rejectionReason,
          contradictingBehaviourId: null,
          contradictingEvidence: { indicatorValues: {}, reasoning: instance.rejectionReason },
          updatePerformanceStats: true,
        });
        continue;
      }

      // Check max duration (expire)
      if (instance.barCount >= maxDuration) {
        instance.lifecycleState = 'EXPIRED';
        resolutions.push({ instanceId: id, resolution: 'EXPIRED' });

        behaviourEventBus.emitExpired({
          type: 'behaviour_expired',
          eventId: randomUUID(),
          atlasTs: Date.now(),
          instanceId: id,
          behaviourId: instance.behaviourId,
          symbol: instance.symbol,
          barOpenTs: bar.barOpenTs,
          barCloseTs: bar.barCloseTs,
          source: 'shadow',
          direction: instance.direction,
          finalConfidence: instance.confidence,
          peakConfidence: instance.peakConfidence,
          totalBarsActive: instance.barCount,
          maxDurationBars: maxDuration,
          expiryReason: 'MAX_DURATION_EXCEEDED',
          regimeAtExpiry: bar.regime,
          sessionAtExpiry: bar.session,
          updatePerformanceStats: true,
        });
      }
    }

    return resolutions;
  }

  getActiveInstances(symbol?: string): BehaviourInstance[] {
    const active: BehaviourInstance[] = [];
    for (const instance of this.instances.values()) {
      if (!['FORMING', 'ACTIVE', 'MATURE'].includes(instance.lifecycleState)) continue;
      if (symbol && instance.symbol !== symbol) continue;
      active.push(instance);
    }
    return active;
  }

  getAllInstances(): BehaviourInstance[] {
    return Array.from(this.instances.values());
  }

  getInstanceById(id: string): BehaviourInstance | undefined {
    return this.instances.get(id);
  }

  clearResolvedInstances(maxAge = 200): void {
    const cutoff = Date.now() - maxAge * 5 * 60 * 1000; // maxAge bars × 5 min
    for (const [id, instance] of this.instances) {
      if (!['FORMING', 'ACTIVE', 'MATURE'].includes(instance.lifecycleState) &&
          instance.lastUpdatedAt < cutoff) {
        this.instances.delete(id);
      }
    }
  }

  private findActiveInstance(
    behaviourId: BehaviourId,
    direction: BehaviourInstance['direction'],
    symbol: string,
  ): BehaviourInstance | undefined {
    for (const instance of this.instances.values()) {
      if (
        instance.behaviourId === behaviourId &&
        instance.direction === direction &&
        instance.symbol === symbol &&
        ['FORMING', 'ACTIVE', 'MATURE'].includes(instance.lifecycleState)
      ) {
        return instance;
      }
    }
    return undefined;
  }

  private createInstance(
    output: ClassifierOutput,
    evidence: EvidenceRecord,
    confResult: ReturnType<ConfidenceCalculator['calculate']>,
    bar: ProcessedBarData,
  ): BehaviourInstance {
    const maxDuration = MAX_DURATION[output.behaviourId] ?? 12;
    return {
      instanceId: randomUUID(),
      behaviourId: output.behaviourId,
      symbol: bar.symbol,
      direction: output.direction,
      firstDetectedAt: bar.barOpenTs,
      lastUpdatedAt: bar.barOpenTs,
      barCount: 1,
      maxDurationBars: maxDuration,
      lifecycleState: 'FORMING',
      maturity: 'FORMING',
      confidence: confResult.confidence,
      peakConfidence: confResult.confidence,
      probability: confResult.probability,
      evidenceScore: this.evidenceAggregator.computeWeightedScore(evidence),
      expectedR: confResult.expectedR,
      expectedDurationBars: confResult.expectedDurationBars,
      failureProbability: confResult.failureProbability,
      regime: bar.regime,
      session: bar.session,
      evidence,
      classifierVersion: output.classifierVersion,
    };
  }

  private updateInstance(
    instance: BehaviourInstance,
    output: ClassifierOutput,
    evidence: EvidenceRecord,
    confResult: ReturnType<ConfidenceCalculator['calculate']>,
    bar: ProcessedBarData,
  ): BehaviourInstance {
    const prevConfidence = instance.confidence;
    const prevProbability = instance.probability;

    instance.barCount += 1;
    instance.lastUpdatedAt = bar.barOpenTs;
    instance.confidence = confResult.confidence;
    instance.peakConfidence = Math.max(instance.peakConfidence, confResult.confidence);
    instance.probability = confResult.probability;
    instance.evidenceScore = this.evidenceAggregator.computeWeightedScore(evidence);
    instance.expectedR = confResult.expectedR;
    instance.failureProbability = confResult.failureProbability;
    instance.evidence = evidence;
    instance.session = bar.session;
    instance.maturity = getMaturity(instance.barCount, instance.maxDurationBars);

    // Lifecycle promotion
    if (instance.lifecycleState === 'FORMING' && instance.barCount >= 2) {
      instance.lifecycleState = 'ACTIVE';
    } else if (instance.lifecycleState === 'ACTIVE' && instance.confidence >= CONFIRMATION_THRESHOLD) {
      instance.lifecycleState = 'MATURE';
    }

    // Check for confirmation
    if (instance.confidence >= CONFIRMATION_THRESHOLD && instance.barCount >= 3) {
      instance.lifecycleState = 'CONFIRMED';
      instance.confirmationBarTs = bar.barOpenTs;
      instance.confirmationReason = `Confidence ${instance.confidence} ≥ threshold ${CONFIRMATION_THRESHOLD} after ${instance.barCount} bars`;

      behaviourEventBus.emitConfirmed({
        type: 'behaviour_confirmed',
        eventId: randomUUID(),
        atlasTs: Date.now(),
        instanceId: instance.instanceId,
        behaviourId: instance.behaviourId,
        symbol: instance.symbol,
        barOpenTs: bar.barOpenTs,
        barCloseTs: bar.barCloseTs,
        source: 'shadow',
        direction: instance.direction,
        finalConfidence: instance.confidence,
        peakConfidence: instance.peakConfidence,
        totalBarsActive: instance.barCount,
        confirmationReason: instance.confirmationReason,
        actualOutcome: {
          direction: instance.direction,
          priceMove: bar.close - bar.open,
          barsToConfirmation: instance.barCount,
          actualR: null,
        },
        updatePerformanceStats: true,
      });
    } else {
      behaviourEventBus.emitUpdated({
        type: 'behaviour_updated',
        eventId: randomUUID(),
        atlasTs: Date.now(),
        instanceId: instance.instanceId,
        behaviourId: instance.behaviourId,
        symbol: instance.symbol,
        barOpenTs: bar.barOpenTs,
        barCloseTs: bar.barCloseTs,
        source: 'shadow',
        direction: instance.direction,
        confidence: instance.confidence,
        probability: instance.probability,
        maturity: instance.maturity,
        evidenceScore: instance.evidenceScore,
        expectedR: instance.expectedR,
        expectedDurationBars: instance.expectedDurationBars,
        failureProbability: instance.failureProbability,
        deltaConfidence: instance.confidence - prevConfidence,
        deltaProbability: instance.probability - prevProbability,
        lifecycleState: instance.lifecycleState,
        barCount: instance.barCount,
        peakConfidence: instance.peakConfidence,
        regime: bar.regime,
        session: bar.session,
        evidence,
      });
    }

    return instance;
  }

  private instanceToSignal(instance: BehaviourInstance, bar: ProcessedBarData): BehaviourSignal {
    return {
      instanceId: instance.instanceId,
      behaviourId: instance.behaviourId,
      symbol: instance.symbol,
      detectedAt: instance.firstDetectedAt,
      barOpenTs: bar.barOpenTs,
      direction: instance.direction,
      confidence: instance.confidence,
      probability: instance.probability,
      maturity: instance.maturity,
      evidenceScore: instance.evidenceScore,
      expectedR: instance.expectedR,
      expectedDurationBars: instance.expectedDurationBars,
      failureProbability: instance.failureProbability,
      regime: instance.regime,
      session: instance.session,
      evidence: instance.evidence,
      lifecycleState: instance.lifecycleState,
      classifierVersion: instance.classifierVersion,
    };
  }
}
