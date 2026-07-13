/**
 * atlasMemoryDb.ts — Database helpers for the atlas_memory table.
 * Sprint 089A — Atlas Memory
 *
 * ARCHITECTURAL RULES:
 *   - Never delete, never truncate, never modify after insertion.
 *   - Idempotent: duplicate inserts (same idempotency_key) are silently ignored.
 *   - Source of truth for ARD pattern discovery and ORACLE calibration.
 */
import { getDb } from "./db";
import { atlasMemory, InsertAtlasMemory } from "../drizzle/schema";
import { desc, eq, gte, sql } from "drizzle-orm";

// ── Insert (idempotent) ───────────────────────────────────────────────────────
export async function insertAtlasMemory(
  data: Omit<InsertAtlasMemory, "id" | "receivedAt">
): Promise<{ inserted: boolean; id: number }> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  // Check for duplicate idempotency key
  const existing = await db
    .select({ id: atlasMemory.id })
    .from(atlasMemory)
    .where(eq(atlasMemory.idempotencyKey, data.idempotencyKey))
    .limit(1);
  if (existing.length > 0) {
    return { inserted: false, id: existing[0].id };
  }
  const result = await db.insert(atlasMemory).values(data);
  return { inserted: true, id: Number(result[0].insertId) };
}

// ── Recent observations ───────────────────────────────────────────────────────
export async function getRecentMemory(limit = 50) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  return db
    .select()
    .from(atlasMemory)
    .orderBy(desc(atlasMemory.barTime))
    .limit(limit);
}

// ── Stats ─────────────────────────────────────────────────────────────────────
export async function getAtlasMemoryStats(): Promise<{
  total: number;
  todayCount: number;
  weekCount: number;
  latestBarTime: number | null;
  latestSession: string | null;
  latestRegime: string | null;
  latestClose: string | null;
}> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart = new Date(todayStart.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [totalRes, todayRes, weekRes, latestRes] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(atlasMemory),
    db.select({ count: sql<number>`count(*)` }).from(atlasMemory)
      .where(gte(atlasMemory.receivedAt, todayStart)),
    db.select({ count: sql<number>`count(*)` }).from(atlasMemory)
      .where(gte(atlasMemory.receivedAt, weekStart)),
    db.select({
      barTime: atlasMemory.barTime,
      session: atlasMemory.session,
      regimeClassification: atlasMemory.regimeClassification,
      close: atlasMemory.close,
    }).from(atlasMemory).orderBy(desc(atlasMemory.barTime)).limit(1),
  ]);

  const latest = latestRes[0] ?? null;
  return {
    total: Number(totalRes[0]?.count ?? 0),
    todayCount: Number(todayRes[0]?.count ?? 0),
    weekCount: Number(weekRes[0]?.count ?? 0),
    latestBarTime: latest?.barTime ?? null,
    latestSession: latest?.session ?? null,
    latestRegime: latest?.regimeClassification ?? null,
    latestClose: latest?.close ?? null,
  };
}

// ── Regime distribution (last N bars) ────────────────────────────────────────
export async function getRegimeDistribution(limit = 288) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  return db
    .select({
      regimeClassification: atlasMemory.regimeClassification,
      count: sql<number>`count(*)`,
    })
    .from(atlasMemory)
    .orderBy(desc(atlasMemory.barTime))
    .limit(limit)
    .groupBy(atlasMemory.regimeClassification);
}

// ── Session distribution (last N bars) ───────────────────────────────────────
// Uses a subquery to first get the N most recent bars, then groups by session.
export async function getSessionDistribution(limit = 288) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  // Subquery: get the IDs of the N most recent bars
  const recentIds = db
    .select({ id: atlasMemory.id })
    .from(atlasMemory)
    .orderBy(desc(atlasMemory.barTime))
    .limit(limit)
    .as("recent");
  // Group by session within those N bars
  return db
    .select({
      session: atlasMemory.session,
      count: sql<number>`count(*)`,
    })
    .from(atlasMemory)
    .innerJoin(recentIds, sql`${atlasMemory.id} = ${recentIds.id}`)
    .groupBy(atlasMemory.session)
    .orderBy(desc(sql<number>`count(*)`));
}
