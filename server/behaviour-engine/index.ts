/**
 * Atlas Behaviour Engine — Module Entry Point
 * Sprint 122B | ORION-DIRECTIVE-001
 *
 * Shadow mode: wired into processBar() after all existing logic.
 * Failure is isolated — never affects execution pipeline.
 */

export { behaviourEngine } from './behaviour-engine.js';
export { behaviourEventBus } from './behaviour-event-bus.js';
export type { BehaviourEngineResult, BehaviourSignal, BehaviourInstance, ProcessedBarData } from './types.js';

/**
 * Shadow-mode wrapper for processBar integration.
 * Call this AFTER all existing processBar logic completes.
 * Never await in the execution path — fire and forget.
 */
export async function runBehaviourEngineShadow(bar: import('./types.js').ProcessedBarData): Promise<void> {
  try {
    const { behaviourEngine } = await import('./behaviour-engine.js');
    await behaviourEngine.processBar(bar);
  } catch (err) {
    // Shadow mode: swallow all errors
    console.error('[BehaviourEngine:shadow] Error (isolated):', err);
  }
}
