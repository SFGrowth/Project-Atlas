/**
 * Atlas Behaviour Engine — Behaviour Persistence
 * Sprint 122B | ORION-DIRECTIVE-001
 *
 * Writes behaviour instances, transitions, confidence history, and lifecycle events
 * to the 8 Behaviour Registry tables created in Sprint 121A.
 *
 * All writes are fire-and-forget. Failure never affects the execution pipeline.
 */

import { getDb } from '../db.js';
import { sql } from 'drizzle-orm';
import type {
  BehaviourInstance,
  BehaviourSignal,
  ProcessedBarData,
} from './types.js';

const MAX_DURATION_MAP: Record<string, number> = {
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

export class BehaviourPersistence {
  async persistBarResults(
    bar: ProcessedBarData,
    newSignals: BehaviourSignal[],
    updatedSignals: BehaviourSignal[],
    resolutions: Array<{ instanceId: string; resolution: 'CONFIRMED' | 'EXPIRED' | 'REJECTED' }>,
    allInstances: BehaviourInstance[],
  ): Promise<void> {
    const now = Date.now();
    const db = await getDb();

    // Persist new instances
    for (const signal of newSignals) {
      await this.upsertInstance(db, signal, bar, now);
      await this.recordLifecycleTransition(db, signal.instanceId, 'FORMING', now, bar);
      await this.recordConfidenceHistory(db, signal.instanceId, signal, bar, now);
    }

    // Persist updated instances
    for (const signal of updatedSignals) {
      await this.upsertInstance(db, signal, bar, now);
      await this.recordConfidenceHistory(db, signal.instanceId, signal, bar, now);
    }

    // Persist resolutions
    for (const resolution of resolutions) {
      const instance = allInstances.find((i) => i.instanceId === resolution.instanceId);
      if (!instance) continue;
      await this.recordLifecycleTransition(db, resolution.instanceId, resolution.resolution, now, bar);
      await this.updateInstanceState(db, resolution.instanceId, resolution.resolution, now, instance);
    }
  }

  private async upsertInstance(
    db: Awaited<ReturnType<typeof getDb>>,
    signal: BehaviourSignal,
    bar: ProcessedBarData,
    now: number,
  ): Promise<void> {
    if (!db) return;
    try {
      await db.execute(sql`
        INSERT INTO atlas_behaviour_instances (
          instance_id, behaviour_id, symbol, direction,
          first_detected_at, last_updated_at, bar_count, max_duration_bars,
          lifecycle_state, maturity, confidence, peak_confidence,
          probability, evidence_score, expected_r, expected_duration_bars,
          failure_probability, regime, session,
          evidence_json, classifier_version, created_at
        ) VALUES (
          ${signal.instanceId}, ${signal.behaviourId}, ${signal.symbol}, ${signal.direction},
          ${signal.detectedAt}, ${now}, 1, ${MAX_DURATION_MAP[signal.behaviourId] ?? 12},
          ${signal.lifecycleState}, ${signal.maturity}, ${signal.confidence}, ${signal.confidence},
          ${signal.probability}, ${signal.evidenceScore}, ${signal.expectedR}, ${signal.expectedDurationBars},
          ${signal.failureProbability}, ${signal.regime}, ${signal.session},
          ${JSON.stringify(signal.evidence)}, ${signal.classifierVersion}, ${now}
        )
        ON DUPLICATE KEY UPDATE
          last_updated_at = VALUES(last_updated_at),
          bar_count = bar_count + 1,
          lifecycle_state = VALUES(lifecycle_state),
          maturity = VALUES(maturity),
          confidence = VALUES(confidence),
          peak_confidence = GREATEST(peak_confidence, VALUES(confidence)),
          probability = VALUES(probability),
          evidence_score = VALUES(evidence_score),
          expected_r = VALUES(expected_r),
          failure_probability = VALUES(failure_probability),
          regime = VALUES(regime),
          session = VALUES(session),
          evidence_json = VALUES(evidence_json)
      `);
    } catch (err: unknown) {
      console.error('[BehaviourPersistence] upsertInstance error:', err);
    }
  }

  private async recordLifecycleTransition(
    db: Awaited<ReturnType<typeof getDb>>,
    instanceId: string,
    toState: string,
    now: number,
    bar: ProcessedBarData,
  ): Promise<void> {
    if (!db) return;
    try {
      const logId = crypto.randomUUID();
      await db.execute(sql`
        INSERT INTO atlas_behaviour_lifecycle_log (
          log_id, instance_id, from_state, to_state,
          transitioned_at, bar_open_ts, trigger_reason, created_at
        ) VALUES (
          ${logId}, ${instanceId}, NULL, ${toState},
          ${now}, ${bar.barOpenTs}, ${'Behaviour Engine shadow mode'}, ${now}
        )
      `);
    } catch (err: unknown) {
      console.error('[BehaviourPersistence] recordLifecycleTransition error:', err);
    }
  }

  private async recordConfidenceHistory(
    db: Awaited<ReturnType<typeof getDb>>,
    instanceId: string,
    signal: BehaviourSignal,
    bar: ProcessedBarData,
    now: number,
  ): Promise<void> {
    if (!db) return;
    try {
      const histId = crypto.randomUUID();
      await db.execute(sql`
        INSERT INTO atlas_behaviour_confidence_history (
          history_id, instance_id, bar_open_ts, confidence,
          probability, evidence_score, regime, session,
          indicator_agreement, regime_alignment, session_quality,
          price_structure, volume_confirmation, recorded_at
        ) VALUES (
          ${histId}, ${instanceId}, ${bar.barOpenTs}, ${signal.confidence},
          ${signal.probability}, ${signal.evidenceScore}, ${signal.regime}, ${signal.session},
          ${signal.evidence.indicatorAgreement}, ${signal.evidence.regimeAlignment},
          ${signal.evidence.sessionQuality}, ${signal.evidence.priceStructure},
          ${signal.evidence.volumeConfirmation}, ${now}
        )
      `);
    } catch (err: unknown) {
      console.error('[BehaviourPersistence] recordConfidenceHistory error:', err);
    }
  }

  private async updateInstanceState(
    db: Awaited<ReturnType<typeof getDb>>,
    instanceId: string,
    resolution: string,
    now: number,
    instance: BehaviourInstance,
  ): Promise<void> {
    if (!db) return;
    try {
      await db.execute(sql`
        UPDATE atlas_behaviour_instances
        SET lifecycle_state = ${resolution},
            last_updated_at = ${now},
            rejection_reason = ${instance.rejectionReason ?? null},
            confirmation_bar_ts = ${resolution === 'CONFIRMED' ? (instance.confirmationBarTs ?? now) : null}
        WHERE instance_id = ${instanceId}
      `);
    } catch (err: unknown) {
      console.error('[BehaviourPersistence] updateInstanceState error:', err);
    }
  }
}
