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
  adeVersionGovernance,
  adeTradeRecords,
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

// ─── Analytics aggregation helper ───────────────────────────────────────────────
// Computes all stats needed for the Performance Analytics page from paper_trades.

export async function getAnalyticsData(account = "ATLAS_MNQ_PAPER") {
  const db = await getDb();
  if (!db) return null;

  // Fetch all closed trades ordered by close time
  const trades = await db
    .select()
    .from(paperTrades)
    .where(and(eq(paperTrades.account, account), eq(paperTrades.status, "CLOSED")))
    .orderBy(paperTrades.closedAt);

  if (trades.length === 0) return { trades: [], equityCurve: [], dailyPnl: [], stats: null };

  // Build equity curve (cumulative P&L over time)
  let cumPnl = 0;
  const equityCurve = trades.map((t) => {
    cumPnl += Number(t.pnl ?? 0);
    return {
      date: t.closedAt ? t.closedAt.toISOString() : "",
      cumPnl: parseFloat(cumPnl.toFixed(2)),
      pnl: parseFloat(Number(t.pnl ?? 0).toFixed(2)),
    };
  });

  // Build daily P&L buckets
  const dailyMap = new Map<string, number>();
  for (const t of trades) {
    if (!t.closedAt) continue;
    const day = t.closedAt.toISOString().slice(0, 10);
    dailyMap.set(day, (dailyMap.get(day) ?? 0) + Number(t.pnl ?? 0));
  }
  const dailyPnl = Array.from(dailyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, pnl]) => ({ date, pnl: parseFloat(pnl.toFixed(2)) }));

  // Compute aggregate stats
  const totalTrades = trades.length;
  const wins = trades.filter((t) => Number(t.pnl ?? 0) > 0).length;
  const losses = trades.filter((t) => Number(t.pnl ?? 0) < 0).length;
  const winRate = totalTrades > 0 ? wins / totalTrades : 0;
  const totalPnl = trades.reduce((s, t) => s + Number(t.pnl ?? 0), 0);
  const grossWin = trades.filter((t) => Number(t.pnl ?? 0) > 0).reduce((s, t) => s + Number(t.pnl ?? 0), 0);
  const grossLoss = Math.abs(trades.filter((t) => Number(t.pnl ?? 0) < 0).reduce((s, t) => s + Number(t.pnl ?? 0), 0));
  const profitFactor = grossLoss > 0 ? grossWin / grossLoss : wins > 0 ? 999 : 0;
  const avgR = totalTrades > 0 ? trades.reduce((s, t) => s + Number(t.currentR ?? 0), 0) / totalTrades : 0;

  // Max drawdown from equity curve peak
  let peak = 0;
  let maxDrawdown = 0;
  for (const point of equityCurve) {
    if (point.cumPnl > peak) peak = point.cumPnl;
    const dd = peak - point.cumPnl;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }

  // Win/loss distribution by model
  const modelStats: Record<string, { wins: number; losses: number; pnl: number }> = {};
  for (const t of trades) {
    const m = t.model ?? "UNKNOWN";
    if (!modelStats[m]) modelStats[m] = { wins: 0, losses: 0, pnl: 0 };
    if (Number(t.pnl ?? 0) > 0) modelStats[m].wins++;
    else modelStats[m].losses++;
    modelStats[m].pnl += Number(t.pnl ?? 0);
  }
  const modelBreakdown = Object.entries(modelStats).map(([model, s]) => ({
    model,
    wins: s.wins,
    losses: s.losses,
    pnl: parseFloat(s.pnl.toFixed(2)),
  }));

  return {
    trades: trades.map((t) => ({
      id: t.id,
      model: t.model,
      direction: t.direction,
      pnl: t.pnl ? String(t.pnl) : "0",
      currentR: t.currentR ? String(t.currentR) : "0",
      exitReason: t.exitReason,
      openedAt: t.openedAt.toISOString(),
      closedAt: t.closedAt?.toISOString() ?? null,
    })),
    equityCurve,
    dailyPnl,
    stats: {
      totalTrades,
      wins,
      losses,
      winRate: parseFloat(winRate.toFixed(4)),
      totalPnl: parseFloat(totalPnl.toFixed(2)),
      grossWin: parseFloat(grossWin.toFixed(2)),
      grossLoss: parseFloat(grossLoss.toFixed(2)),
      profitFactor: parseFloat(profitFactor.toFixed(4)),
      avgR: parseFloat(avgR.toFixed(4)),
      maxDrawdown: parseFloat(maxDrawdown.toFixed(2)),
      modelBreakdown,
    },
  };
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

// ─── ADE Certification Framework ──────────────────────────────────────────────────────────────────────────────────

export async function getAdeGovernanceLog() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(adeVersionGovernance)
    .orderBy(desc(adeVersionGovernance.createdAt));
}

export async function getAdeTradeStats(): Promise<{ model: string; count: number }[]> {
  const db = await getDb();
  if (!db) return [];
  const records = await db
    .select({ model: adeTradeRecords.model, outcome: adeTradeRecords.outcome })
    .from(adeTradeRecords);
  const counts: Record<string, number> = {};
  for (const r of records) {
    if (r.outcome === "WIN" || r.outcome === "LOSS" || r.outcome === "BREAKEVEN") {
      counts[r.model] = (counts[r.model] ?? 0) + 1;
    }
  }
  return Object.entries(counts).map(([model, count]) => ({ model, count }));
}

// ─── Paper Trading Summary Stats (provenance=PAPER only) ─────────────────────
export async function getPaperSummaryStats(account = "ATLAS_MONITOR_PAPER") {
  const db = await getDb();
  if (!db) return null;
  const now = new Date();
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dow = now.getUTCDay();
  const daysToMon = dow === 0 ? 6 : dow - 1;
  const weekStart = new Date(todayStart.getTime() - daysToMon * 86400000);
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const allClosed = await db
    .select()
    .from(paperTrades)
    .where(and(eq(paperTrades.account, account), eq(paperTrades.status, "CLOSED"), eq(paperTrades.provenance, "PAPER")))
    .orderBy(desc(paperTrades.closedAt));
  const openRows = await db
    .select()
    .from(paperTrades)
    .where(and(eq(paperTrades.account, account), eq(paperTrades.status, "OPEN"), eq(paperTrades.provenance, "PAPER")))
    .limit(1);
  function bucket(trades: typeof allClosed, since: Date) {
    const t = trades.filter((tr) => tr.closedAt && tr.closedAt >= since);
    const wins = t.filter((tr) => Number(tr.pnl ?? 0) > 0).length;
    const losses = t.filter((tr) => Number(tr.pnl ?? 0) < 0).length;
    const pnl = t.reduce((s, tr) => s + Number(tr.pnl ?? 0), 0);
    const winRate = t.length > 0 ? (wins / t.length) * 100 : null;
    const models: Record<string, { trades: number; wins: number; pnl: number }> = {};
    for (const tr of t) {
      const m = tr.model ?? "UNKNOWN";
      if (!models[m]) models[m] = { trades: 0, wins: 0, pnl: 0 };
      models[m].trades++;
      if (Number(tr.pnl ?? 0) > 0) models[m].wins++;
      models[m].pnl += Number(tr.pnl ?? 0);
    }
    return {
      trades: t.length,
      wins,
      losses,
      pnl: parseFloat(pnl.toFixed(2)),
      winRate: winRate !== null ? parseFloat(winRate.toFixed(1)) : null,
      models: Object.entries(models).map(([model, s]) => ({
        model,
        trades: s.trades,
        wins: s.wins,
        pnl: parseFloat(s.pnl.toFixed(2)),
        winRate: s.trades > 0 ? parseFloat(((s.wins / s.trades) * 100).toFixed(1)) : null,
      })),
    };
  }
  const open = openRows.length > 0 ? {
    id: openRows[0].id,
    model: openRows[0].model,
    direction: openRows[0].direction,
    entry: openRows[0].entry ? String(openRows[0].entry) : null,
    stop: openRows[0].stop ? String(openRows[0].stop) : null,
    target: openRows[0].target ? String(openRows[0].target) : null,
    riskDollars: openRows[0].riskDollars ? String(openRows[0].riskDollars) : null,
    openedAt: openRows[0].openedAt.toISOString(),
  } : null;
  return {
    today: bucket(allClosed, todayStart),
    week: bucket(allClosed, weekStart),
    month: bucket(allClosed, monthStart),
    allTime: bucket(allClosed, new Date(0)),
    open,
  };
}
