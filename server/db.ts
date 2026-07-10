import { and, desc, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser,
  InsertPipelineReport,
  InsertPaperTrade,
  InsertJournalDay,
  InsertSystemHealthEvent,
  InsertNotificationLog,
  journalDays,
  notificationLog,
  paperTrades,
  pipelineReports,
  systemHealthEvents,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ─── User helpers ────────────────────────────────────────────────────────────

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) { console.warn("[Database] Cannot upsert user: database not available"); return; }

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;
  type TextField = (typeof textFields)[number];
  const assignNullable = (field: TextField) => {
    const value = user[field];
    if (value === undefined) return;
    const normalized = value ?? null;
    values[field] = normalized;
    updateSet[field] = normalized;
  };
  textFields.forEach(assignNullable);
  if (user.lastSignedIn !== undefined) { values.lastSignedIn = user.lastSignedIn; updateSet.lastSignedIn = user.lastSignedIn; }
  if (user.role !== undefined) { values.role = user.role; updateSet.role = user.role; }
  else if (user.openId === ENV.ownerOpenId) { values.role = "admin"; updateSet.role = "admin"; }
  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ─── Pipeline Report helpers ──────────────────────────────────────────────────

export async function insertPipelineReport(report: InsertPipelineReport): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(pipelineReports).values(report);
}

export async function getPipelineReportByIdempotencyKey(key: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(pipelineReports)
    .where(eq(pipelineReports.idempotencyKey, key))
    .limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getLatestPipelineReport() {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(pipelineReports)
    .orderBy(desc(pipelineReports.receivedAt))
    .limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getRecentPipelineReports(limit = 50) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(pipelineReports)
    .orderBy(desc(pipelineReports.receivedAt))
    .limit(limit);
}

export async function getPipelineReportCount(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const [row] = await db.select({ count: sql<number>`count(*)` }).from(pipelineReports);
  return Number(row?.count ?? 0);
}

export async function getPipelineReportById(id: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(pipelineReports).where(eq(pipelineReports.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ─── Paper Trade helpers ──────────────────────────────────────────────────────

export async function insertPaperTrade(trade: InsertPaperTrade): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(paperTrades).values(trade);
}

export async function updatePaperTrade(id: string, updates: Partial<InsertPaperTrade>): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(paperTrades).set(updates).where(eq(paperTrades.id, id));
}

export async function getOpenPaperTrade(account = "ATLAS_MNQ_PAPER") {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(paperTrades)
    .where(and(eq(paperTrades.account, account), eq(paperTrades.status, "OPEN")))
    .orderBy(desc(paperTrades.openedAt))
    .limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getRecentPaperTrades(limit = 50, account = "ATLAS_MNQ_PAPER") {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(paperTrades)
    .where(eq(paperTrades.account, account))
    .orderBy(desc(paperTrades.openedAt))
    .limit(limit);
}

export async function getPaperTradeById(id: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(paperTrades).where(eq(paperTrades.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ─── Journal Day helpers ──────────────────────────────────────────────────────

export async function upsertJournalDay(day: InsertJournalDay): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(journalDays).values(day).onDuplicateKeyUpdate({
    set: {
      totalTrades: day.totalTrades,
      wins: day.wins,
      losses: day.losses,
      breakevens: day.breakevens,
      dailyPnl: day.dailyPnl,
      dailyR: day.dailyR,
      profitFactor: day.profitFactor,
      winRate: day.winRate,
      largestWinner: day.largestWinner,
      largestLoser: day.largestLoser,
      modelsTraded: day.modelsTraded,
      ariInterventions: day.ariInterventions,
      tvlInterventions: day.tvlInterventions,
    },
  });
}

export async function getJournalDays(account = "ATLAS_MNQ_PAPER", limit = 90) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(journalDays)
    .where(eq(journalDays.account, account))
    .orderBy(desc(journalDays.tradeDate))
    .limit(limit);
}

export async function getJournalDayByDate(tradeDate: string, account = "ATLAS_MNQ_PAPER") {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(journalDays)
    .where(    and(sql`${journalDays.tradeDate} = ${tradeDate}`, eq(journalDays.account, account)))
    .limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ─── System Health helpers ────────────────────────────────────────────────────

export async function insertHealthEvent(event: InsertSystemHealthEvent): Promise<void> {
  const db = await getDb();
  if (!db) return; // health events are best-effort
  await db.insert(systemHealthEvents).values(event);
}

export async function getRecentHealthEvents(limit = 100) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(systemHealthEvents)
    .orderBy(desc(systemHealthEvents.ts))
    .limit(limit);
}

export async function getLastWebhookEvent() {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(systemHealthEvents)
    .where(eq(systemHealthEvents.eventType, "WEBHOOK_RECEIVED"))
    .orderBy(desc(systemHealthEvents.ts))
    .limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ─── Notification Log helpers ─────────────────────────────────────────────────

export async function insertNotificationLog(n: InsertNotificationLog): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(notificationLog).values(n);
}

export async function getRecentNotifications(limit = 50) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(notificationLog)
    .orderBy(desc(notificationLog.sentAt))
    .limit(limit);
}

// ─── Journal aggregation helper ───────────────────────────────────────────────
// Recomputes daily stats from paper_trades for a given date and account.

export async function recomputeJournalDay(tradeDate: string, account = "ATLAS_MNQ_PAPER"): Promise<void> {
  const db = await getDb();
  if (!db) return;

  // Get all closed trades for this date
  const startOfDay = new Date(`${tradeDate}T00:00:00Z`);
  const endOfDay = new Date(`${tradeDate}T23:59:59Z`);

  const trades = await db
    .select()
    .from(paperTrades)
    .where(
      and(
        eq(paperTrades.account, account),
        eq(paperTrades.status, "CLOSED"),
        sql`${paperTrades.closedAt} >= ${startOfDay.toISOString().replace('T', ' ').slice(0, 19)}`
      )
    );

  const dayTrades = trades.filter((t) => {
    const closed = t.closedAt;
    return closed && closed >= startOfDay && closed <= endOfDay;
  });

  if (dayTrades.length === 0) return;

  const wins = dayTrades.filter((t) => Number(t.pnl ?? 0) > 0).length;
  const losses = dayTrades.filter((t) => Number(t.pnl ?? 0) < 0).length;
  const breakevens = dayTrades.filter((t) => Number(t.pnl ?? 0) === 0).length;
  const dailyPnl = dayTrades.reduce((s, t) => s + Number(t.pnl ?? 0), 0);
  const dailyR = dayTrades.reduce((s, t) => s + Number(t.currentR ?? 0), 0);
  const grossWin = dayTrades.filter((t) => Number(t.pnl ?? 0) > 0).reduce((s, t) => s + Number(t.pnl ?? 0), 0);
  const grossLoss = Math.abs(dayTrades.filter((t) => Number(t.pnl ?? 0) < 0).reduce((s, t) => s + Number(t.pnl ?? 0), 0));
  const profitFactor = grossLoss > 0 ? grossWin / grossLoss : wins > 0 ? 999 : 0;
  const winRate = dayTrades.length > 0 ? wins / dayTrades.length : 0;
  const pnls = dayTrades.map((t) => Number(t.pnl ?? 0));
  const largestWinner = Math.max(...pnls, 0);
  const largestLoser = Math.min(...pnls, 0);
  const modelsTraded = Array.from(new Set(dayTrades.map((t) => t.model))).join(",");
  const ariInterventions = dayTrades.filter((t) => t.ariDecision === "REJECTED").length;
  const tvlInterventions = dayTrades.filter((t) => t.tvlDecision === "BLOCKED").length;

  await upsertJournalDay({
    tradeDate: tradeDate as unknown as Date,
    account,
    totalTrades: dayTrades.length,
    wins,
    losses,
    breakevens,
    dailyPnl: String(dailyPnl.toFixed(2)),
    dailyR: String(dailyR.toFixed(4)),
    profitFactor: String(profitFactor.toFixed(4)),
    winRate: String(winRate.toFixed(4)),
    largestWinner: String(largestWinner.toFixed(2)),
    largestLoser: String(largestLoser.toFixed(2)),
    modelsTraded,
    ariInterventions,
    tvlInterventions,
  });
}
