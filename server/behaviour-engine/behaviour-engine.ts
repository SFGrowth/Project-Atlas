/**
 * Atlas Behaviour Engine — Main Orchestrator
 * Sprint 122B | ORION-DIRECTIVE-001
 *
 * Shadow Mode: runs after every processBar() call.
 * Failure is isolated — never affects execution pipeline.
 *
 * Pipeline per bar:
 * 1. Fetch recent bars from atlas_memory
 * 2. Run all 12 classifiers via ClassifierRegistry
 * 3. Check for VOLATILITY_EXPANSION (applies interaction effects)
 * 4. Aggregate evidence and calculate confidence for each output
 * 5. Update BehaviourStateManager (new instances + updates)
 * 6. Expire/reject stale instances
 * 7. Persist all changes to Behaviour Registry
 * 8. Emit events via BehaviourEventBus
 * 9. Return BehaviourEngineResult
 */

import type { ProcessedBarData, BehaviourEngineResult } from './types.js';
import { ClassifierRegistry } from './classifier-registry.js';
import { BehaviourStateManager } from './behaviour-state-manager.js';
import { behaviourEventBus } from './behaviour-event-bus.js';
import { BehaviourPersistence } from './behaviour-persistence.js';

export class BehaviourEngine {
  private readonly classifierRegistry = new ClassifierRegistry();
  private readonly stateManager = new BehaviourStateManager();
  private readonly persistence: BehaviourPersistence;
  private barCount = 0;

  constructor() {
    this.persistence = new BehaviourPersistence();
  }

  async processBar(bar: ProcessedBarData): Promise<BehaviourEngineResult> {
    const start = Date.now();
    this.barCount++;

    try {
      // 1. Run all 12 classifiers
      const classificationResult = this.classifierRegistry.classify(bar);

      // 2. Check if VOLATILITY_EXPANSION is active (either just detected or already active)
      const volatilityExpansionOutput = classificationResult.outputs.find(
        (o) => o.behaviourId === 'VOLATILITY_EXPANSION',
      );
      const existingVolExpansion = this.stateManager
        .getActiveInstances(bar.symbol)
        .some((i) => i.behaviourId === 'VOLATILITY_EXPANSION');
      const volatilityExpansionActive = !!volatilityExpansionOutput || existingVolExpansion;

      // 3. Process outputs through state manager
      const { newSignals, updatedSignals } = this.stateManager.processClassifierOutputs(
        classificationResult.outputs,
        bar,
        volatilityExpansionActive,
      );

      // 4. Expire stale instances
      const resolutions = this.stateManager.expireStaleInstances(bar);

      // 5. Persist changes (fire-and-forget — shadow mode)
      const allInstances = this.stateManager.getAllInstances();
      this.persistence.persistBarResults(bar, newSignals, updatedSignals, resolutions, allInstances)
        .catch((err) => console.error('[BehaviourEngine] Persistence error:', err));

      // 6. Clean up old resolved instances every 100 bars
      if (this.barCount % 100 === 0) {
        this.stateManager.clearResolvedInstances(200);
      }

      const activeInstances = this.stateManager.getActiveInstances(bar.symbol);

      // 7. Emit bar complete event
      behaviourEventBus.emitBarComplete({
        barOpenTs: bar.barOpenTs,
        symbol: bar.symbol,
        activeCount: activeInstances.length,
        newDetections: newSignals.length,
        resolutions: resolutions.length,
        processingMs: Date.now() - start,
      });

      return {
        barOpenTs: bar.barOpenTs,
        symbol: bar.symbol,
        processingMs: Date.now() - start,
        activeInstances,
        newDetections: newSignals,
        updates: updatedSignals,
        resolutions,
        events: [], // Events are emitted via EventBus, not returned
        volatilityExpansionActive,
      };
    } catch (err) {
      console.error('[BehaviourEngine] processBar error:', err);
      return {
        barOpenTs: bar.barOpenTs,
        symbol: bar.symbol,
        processingMs: Date.now() - start,
        activeInstances: [],
        newDetections: [],
        updates: [],
        resolutions: [],
        events: [],
        volatilityExpansionActive: false,
      };
    }
  }

  getActiveInstances(symbol?: string) {
    return this.stateManager.getActiveInstances(symbol);
  }

  getEventBus() {
    return behaviourEventBus;
  }
}

// Singleton export
export const behaviourEngine = new BehaviourEngine();
