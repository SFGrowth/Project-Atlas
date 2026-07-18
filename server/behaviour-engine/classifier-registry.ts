/**
 * Atlas Behaviour Engine — Classifier Registry
 * Sprint 122B — Shadow Mode Implementation
 * Directive: ORION-DIRECTIVE-001
 */

import type {
  IBehaviourClassifier,
  ClassifierOutput,
  ProcessedBarData,
  BehaviourId,
} from './types.js';

import { TrendContinuationClassifier } from './classifiers/trend-continuation.js';
import { SecondEntryPullbackClassifier } from './classifiers/second-entry-pullback.js';
import { LiquiditySweepClassifier } from './classifiers/liquidity-sweep.js';
import { FailedBreakoutClassifier } from './classifiers/failed-breakout.js';
import { MeanReversionClassifier } from './classifiers/mean-reversion.js';
import { OpeningRangeBreakoutClassifier } from './classifiers/opening-range-breakout.js';
import { VwapReclaimClassifier } from './classifiers/vwap-reclaim.js';
import { CompressionClassifier } from './classifiers/compression.js';
import { BreakoutExpansionClassifier } from './classifiers/breakout-expansion.js';
import { OvernightInventoryClassifier } from './classifiers/overnight-inventory.js';
import { SessionRotationClassifier } from './classifiers/session-rotation.js';
import { VolatilityExpansionClassifier } from './classifiers/volatility-expansion.js';

export interface ClassificationResult {
  outputs: ClassifierOutput[];
  skipped: BehaviourId[];
  processingMs: number;
}

export class ClassifierRegistry {
  private readonly classifiers: IBehaviourClassifier[];
  private readonly disabled: Set<BehaviourId> = new Set();

  constructor() {
    this.classifiers = [
      new TrendContinuationClassifier(),
      new SecondEntryPullbackClassifier(),
      new LiquiditySweepClassifier(),
      new FailedBreakoutClassifier(),
      new MeanReversionClassifier(),
      new OpeningRangeBreakoutClassifier(),
      new VwapReclaimClassifier(),
      new CompressionClassifier(),
      new BreakoutExpansionClassifier(),
      new OvernightInventoryClassifier(),
      new SessionRotationClassifier(),
      new VolatilityExpansionClassifier(),
    ];
  }

  classify(bar: ProcessedBarData): ClassificationResult {
    const start = Date.now();
    const outputs: ClassifierOutput[] = [];
    const skipped: BehaviourId[] = [];

    for (const classifier of this.classifiers) {
      if (this.disabled.has(classifier.behaviourId)) {
        skipped.push(classifier.behaviourId);
        continue;
      }

      // Pre-filter: quick applicability check
      if (!classifier.isApplicable(bar)) {
        skipped.push(classifier.behaviourId);
        continue;
      }

      // Check minimum history requirement
      if (bar.recentBars.length < classifier.getRequiredHistory()) {
        skipped.push(classifier.behaviourId);
        continue;
      }

      try {
        const output = classifier.classify(bar);
        if (output !== null) {
          outputs.push(output);
        }
      } catch (err) {
        console.error(`[BehaviourEngine] Classifier ${classifier.behaviourId} threw:`, err);
        skipped.push(classifier.behaviourId);
      }
    }

    return { outputs, skipped, processingMs: Date.now() - start };
  }

  disable(behaviourId: BehaviourId): void {
    this.disabled.add(behaviourId);
  }

  enable(behaviourId: BehaviourId): void {
    this.disabled.delete(behaviourId);
  }

  getRegisteredIds(): BehaviourId[] {
    return this.classifiers.map((c) => c.behaviourId);
  }
}
