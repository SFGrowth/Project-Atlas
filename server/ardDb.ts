/**
 * ARD (Autonomous Research Division) Database Helpers
 * Sprint 089 — Constitution-compliant every-bar observation store
 *
 * Handles:
 *  - BAR_OBSERVATION ingestion with idempotency
 *  - Missing-bar detection during RTH hours
 *  - Research candidate CRUD
 *  - ORACLE prediction / reality record management
 */

import { getDb } from "./db";
import {
  ardBarObservations,
  ardCandidates,
  oraclePredictions,
  oracleReality,
  oracleScores,
  InsertArdBarObservation,
  InsertArdCandidate,
  InsertOraclePrediction,
  InsertOracleReality,
  InsertOracleScore,
} from "../drizzle/schema";
import { eq, desc, and, gte, sql } from "drizzle-orm";

// ─── Bar Observation Ingestion ────────────────────────────────────────────────

/**
 * Insert a BAR_OBSERVATION record with idempotency.
 * Returns { inserted: true } on new record, { inserted: false } on duplicate.
 */
export async function insertBarObservation(
  data: InsertArdBarObservation
): Promise<{ inserted: boolean; id?: number }> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  // Check idempotency by idempotency_key first
  if (data.idempotencyKey) {
    const existing = await db
      .select({ id: ardBarObservations.id })
      .from(ardBarObservations)
      .where(eq(ardBarObservations.idempotencyKey, data.idempotencyKey))
      .limit(1);
    if (existing.length > 0) {
      return { inserted: false, id: existing[0].id };
    }
  }

  const result = await db.insert(ardBarObservations).values(data);
  return { inserted: true, id: Number(result[0].insertId) };
}

/**
 * Get the most recent N bar observations.
 */
export async function getRecentObservations(limit = 20) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  return db
    .select()
    .from(ardBarObservations)
    .orderBy(desc(ardBarObservations.barTime))
    .limit(limit);
}

/**
 * Count total bar observations (optionally for today).
 */
export async function getObservationStats(): Promise<{
  total: number;
  today: number;
  thisWeek: number;
}> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - 7);

  const [totalResult, todayResult, weekResult] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(ardBarObservations),
    db
      .select({ count: sql<number>`count(*)` })
      .from(ardBarObservations)
      .where(gte(ardBarObservations.receivedAt, todayStart)),
    db
      .select({ count: sql<number>`count(*)` })
      .from(ardBarObservations)
      .where(gte(ardBarObservations.receivedAt, weekStart)),
  ]);

  return {
    total: Number(totalResult[0]?.count ?? 0),
    today: Number(todayResult[0]?.count ?? 0),
    thisWeek: Number(weekResult[0]?.count ?? 0),
  };
}

/**
 * Detect missing bars during RTH (09:30–16:00 ET).
 * A gap > 6 minutes between consecutive observations is flagged.
 */
export async function detectMissingBars(
  since: Date
): Promise<Array<{ gapStart: Date; gapEnd: Date; gapMinutes: number }>> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const rows = await db
    .select({ barTime: ardBarObservations.barTime, session: ardBarObservations.session })
    .from(ardBarObservations)
    .where(
      and(
        gte(ardBarObservations.barTime, since),
        sql`session IN ('AM', 'MID', 'PM')`
      )
    )
    .orderBy(ardBarObservations.barTime);

  const gaps: Array<{ gapStart: Date; gapEnd: Date; gapMinutes: number }> = [];
  for (let i = 1; i < rows.length; i++) {
    const prev = new Date(rows[i - 1].barTime).getTime();
    const curr = new Date(rows[i].barTime).getTime();
    const diffMin = (curr - prev) / 60000;
    if (diffMin > 6) {
      gaps.push({
        gapStart: new Date(rows[i - 1].barTime),
        gapEnd: new Date(rows[i].barTime),
        gapMinutes: Math.round(diffMin),
      });
    }
  }
  return gaps;
}

// ─── Research Candidates ──────────────────────────────────────────────────────

export async function listCandidates(status?: string) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  if (status) {
    return db
      .select()
      .from(ardCandidates)
      .where(eq(ardCandidates.status, status))
      .orderBy(desc(ardCandidates.priorityScore));
  }
  return db
    .select()
    .from(ardCandidates)
    .orderBy(desc(ardCandidates.priorityScore));
}

export async function getCandidateById(candidateId: string) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const rows = await db
    .select()
    .from(ardCandidates)
    .where(eq(ardCandidates.candidateId, candidateId))
    .limit(1);
  return rows[0] ?? null;
}

export async function insertCandidate(data: InsertArdCandidate) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.insert(ardCandidates).values(data);
  return Number(result[0].insertId);
}

export async function updateCandidateStatus(
  candidateId: string,
  status: string,
  rejectionReason?: string
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db
    .update(ardCandidates)
    .set({ status, rejectionReason: rejectionReason ?? null })
    .where(eq(ardCandidates.candidateId, candidateId));
}

// ─── ORACLE Predictions ───────────────────────────────────────────────────────

/**
 * Create an immutable ORACLE prediction record.
 * Must be called BEFORE the trade outcome is known.
 */
export async function createOraclePrediction(data: InsertOraclePrediction) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.insert(oraclePredictions).values(data);
  return Number(result[0].insertId);
}

export async function getOraclePrediction(predictionId: string) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const rows = await db
    .select()
    .from(oraclePredictions)
    .where(eq(oraclePredictions.predictionId, predictionId))
    .limit(1);
  return rows[0] ?? null;
}

export async function listOraclePredictions(modelId?: string, limit = 50) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  if (modelId) {
    return db
      .select()
      .from(oraclePredictions)
      .where(eq(oraclePredictions.modelId, modelId))
      .orderBy(desc(oraclePredictions.createdAt))
      .limit(limit);
  }
  return db
    .select()
    .from(oraclePredictions)
    .orderBy(desc(oraclePredictions.createdAt))
    .limit(limit);
}

// ─── ORACLE Reality Records ───────────────────────────────────────────────────

/**
 * Record the actual outcome for a prediction.
 * Called at trade closure.
 */
export async function createOracleReality(data: InsertOracleReality) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.insert(oracleReality).values(data);
  return Number(result[0].insertId);
}

export async function getOracleReality(predictionId: string) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const rows = await db
    .select()
    .from(oracleReality)
    .where(eq(oracleReality.predictionId, predictionId))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Get prediction + reality pairs for calibration analysis.
 */
export async function getOraclePairs(modelId?: string, limit = 100) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  if (modelId) {
    return db
      .select({
        prediction: oraclePredictions,
        reality: oracleReality,
      })
      .from(oraclePredictions)
      .innerJoin(
        oracleReality,
        eq(oraclePredictions.predictionId, oracleReality.predictionId)
      )
      .where(eq(oraclePredictions.modelId, modelId))
      .orderBy(desc(oraclePredictions.createdAt))
      .limit(limit);
  }
  return db
    .select({
      prediction: oraclePredictions,
      reality: oracleReality,
    })
    .from(oraclePredictions)
    .innerJoin(
      oracleReality,
      eq(oraclePredictions.predictionId, oracleReality.predictionId)
    )
    .orderBy(desc(oraclePredictions.createdAt))
    .limit(limit);
}

// ─── ORACLE Scores ────────────────────────────────────────────────────────────

export async function upsertOracleScore(data: InsertOracleScore) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db
    .insert(oracleScores)
    .values(data)
    .onDuplicateKeyUpdate({
      set: {
        calibrationAccuracy: data.calibrationAccuracy,
        predictionAccuracy: data.predictionAccuracy,
        reasoningConsistency: data.reasoningConsistency,
        regimeRecognition: data.regimeRecognition,
        confidenceReliability: data.confidenceReliability,
        decisionQuality: data.decisionQuality,
        reportCompleteness: data.reportCompleteness,
        oracleScore: data.oracleScore,
        brierScore: data.brierScore,
        logLoss: data.logLoss,
        expectedCalibrationError: data.expectedCalibrationError,
        tradeCount: data.tradeCount,
      },
    });
}

export async function getLatestOracleScore(
  modelId: string,
  windowType = "ROLLING_30"
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const rows = await db
    .select()
    .from(oracleScores)
    .where(
      and(eq(oracleScores.modelId, modelId), eq(oracleScores.windowType, windowType))
    )
    .orderBy(desc(oracleScores.scoreDate))
    .limit(1);
  return rows[0] ?? null;
}

export async function getOracleScoreHistory(modelId: string, limit = 30) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  return db
    .select()
    .from(oracleScores)
    .where(eq(oracleScores.modelId, modelId))
    .orderBy(desc(oracleScores.scoreDate))
    .limit(limit);
}
