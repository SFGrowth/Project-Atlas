/**
 * Sprint 088 — SB1 Regime Intelligence Database Helpers
 * Isolated from A1/A3/B1 paper trade helpers.
 * SB1 is LIVE ACCOUNT ONLY — no prop firm connection.
 */
import { desc, eq, gte, lte, and, sql, isNull } from "drizzle-orm";
import { getDb } from "./db";
import {
  sb1PaperTrades,
  sb1RejectedSignals,
  sb1RasSnapshots,
  dailyReviews,
  rollingPerformance,
  atlasScheduledJobs,
  InsertSb1PaperTrade,
  InsertSb1RejectedSignal,
  InsertSb1RasSnapshot,
  InsertDailyReview,
  InsertRollingPerformance,
  InsertAtlasScheduledJob,
} from "../drizzle/schema";

// ─── SB1 Paper Trades ─────────────────────────────────────────────────────────

export async function createSb1Trade(data: InsertSb1PaperTrade) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.insert(sb1PaperTrades).values(data);
  return data;
}

export async function updateSb1Trade(id: string, data: Partial<InsertSb1PaperTrade>) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(sb1PaperTrades).set(data).where(eq(sb1PaperTrades.id, id));
}

export async function getSb1OpenTrades() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(sb1PaperTrades)
    .where(eq(sb1PaperTrades.status, "OPEN"))
    .orderBy(desc(sb1PaperTrades.openedAt));
}

export async function getSb1RecentTrades(limit = 50) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(sb1PaperTrades)
    .where(eq(sb1PaperTrades.status, "CLOSED"))
    .orderBy(desc(sb1PaperTrades.closedAt))
    .limit(limit);
}

export async function getSb1TradeById(id: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(sb1PaperTrades)
    .where(eq(sb1PaperTrades.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function getSb1Stats() {
  const db = await getDb();
  if (!db) return null;
  const closed = await db
    .select()
    .from(sb1PaperTrades)
    .where(eq(sb1PaperTrades.status, "CLOSED"));
  if (closed.length === 0) return { trades: 0, wins: 0, losses: 0, pf: 0, wr: 0, expectancy: 0, netPnl: 0, maxDd: 0, avgRas: 0 };

  const pnls = closed.map((t) => parseFloat(t.pnl ?? "0"));
  const wins = pnls.filter((p) => p > 0);
  const losses = pnls.filter((p) => p < 0);
  const grossProfit = wins.reduce((a, b) => a + b, 0);
  const grossLoss = Math.abs(losses.reduce((a, b) => a + b, 0));
  const pf = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 999 : 0;
  const wr = wins.length / closed.length;
  const netPnl = pnls.reduce((a, b) => a + b, 0);
  const expectancy = netPnl / closed.length;

  // Max drawdown
  let peak = 0, equity = 0, maxDd = 0;
  for (const p of pnls) {
    equity += p;
    if (equity > peak) peak = equity;
    const dd = peak - equity;
    if (dd > maxDd) maxDd = dd;
  }

  const rasValues = closed
    .filter((t) => t.ras !== null)
    .map((t) => parseFloat(t.ras!));
  const avgRas = rasValues.length > 0 ? rasValues.reduce((a, b) => a + b, 0) / rasValues.length : 0;

  return {
    trades: closed.length,
    wins: wins.length,
    losses: losses.length,
    pf: parseFloat(pf.toFixed(4)),
    wr: parseFloat(wr.toFixed(4)),
    expectancy: parseFloat(expectancy.toFixed(2)),
    netPnl: parseFloat(netPnl.toFixed(2)),
    maxDd: parseFloat(maxDd.toFixed(2)),
    avgRas: parseFloat(avgRas.toFixed(2)),
    grossProfit: parseFloat(grossProfit.toFixed(2)),
    grossLoss: parseFloat(grossLoss.toFixed(2)),
    largestWinner: parseFloat(Math.max(...pnls, 0).toFixed(2)),
    largestLoser: parseFloat(Math.min(...pnls, 0).toFixed(2)),
  };
}

export async function getSb1CertificationStatus() {
  const db = await getDb();
  if (!db) return null;
  const stats = await getSb1Stats();
  if (!stats) return null;

  // Forward validation targets (60-day, 60 trades minimum)
  const TRADE_TARGET = 60;
  const PF_TARGET = 2.0;
  const WR_TARGET = 0.45;
  const DD_TARGET = -643; // max acceptable drawdown ($)

  const tradeProgress = Math.min(stats.trades / TRADE_TARGET * 100, 100);
  const pfPass = stats.pf >= PF_TARGET;
  const wrPass = stats.wr >= WR_TARGET;
  const ddPass = -stats.maxDd >= DD_TARGET;

  // Certification state
  const certState =
    stats.trades >= TRADE_TARGET && pfPass && wrPass && ddPass
      ? "PRODUCTION_READY"
      : stats.trades > 0
      ? "FORWARD_VALIDATION"
      : "RESEARCH";

  return {
    certState,
    trades: stats.trades,
    tradeTarget: TRADE_TARGET,
    tradeProgress,
    pf: stats.pf,
    pfTarget: PF_TARGET,
    pfPass,
    wr: stats.wr,
    wrTarget: WR_TARGET,
    wrPass,
    maxDd: -stats.maxDd,
    ddTarget: DD_TARGET,
    ddPass,
    netPnl: stats.netPnl,
    avgRas: stats.avgRas,
  };
}

// ─── SB1 Rejected Signals ────────────────────────────────────────────────────

export async function logSb1RejectedSignal(data: InsertSb1RejectedSignal) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.insert(sb1RejectedSignals).values(data);
}

export async function getSb1RecentRejections(limit = 20) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(sb1RejectedSignals)
    .orderBy(desc(sb1RejectedSignals.createdAt))
    .limit(limit);
}

// ─── SB1 RAS Snapshots ───────────────────────────────────────────────────────

export async function upsertSb1RasSnapshot(data: InsertSb1RasSnapshot) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.insert(sb1RasSnapshots).values(data);
}

export async function getLatestSb1RasSnapshot() {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(sb1RasSnapshots)
    .orderBy(desc(sb1RasSnapshots.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

export async function getRecentSb1RasSnapshots(limit = 50) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(sb1RasSnapshots)
    .orderBy(desc(sb1RasSnapshots.createdAt))
    .limit(limit);
}

// ─── Daily Reviews ───────────────────────────────────────────────────────────

export async function saveDailyReview(data: InsertDailyReview) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.insert(dailyReviews).values(data);
}

export async function getLatestDailyReview() {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(dailyReviews)
    .orderBy(desc(dailyReviews.reviewDate))
    .limit(1);
  return rows[0] ?? null;
}

export async function getDailyReviewByDate(date: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(dailyReviews)
    .where(eq(dailyReviews.reviewDate, date as unknown as Date))
    .limit(1);
  return rows[0] ?? null;
}

export async function listDailyReviews(limit = 30, offset = 0) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(dailyReviews)
    .orderBy(desc(dailyReviews.reviewDate))
    .limit(limit)
    .offset(offset);
}

// ─── Rolling Performance ─────────────────────────────────────────────────────

export async function upsertRollingPerformance(data: InsertRollingPerformance) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.insert(rollingPerformance).values(data);
}

export async function getLatestRollingPerformance() {
  const db = await getDb();
  if (!db) return [];
  // Get the most recent review date
  const latest = await db
    .select({ reviewDate: rollingPerformance.reviewDate })
    .from(rollingPerformance)
    .orderBy(desc(rollingPerformance.reviewDate))
    .limit(1);
  if (!latest[0]) return [];
  return db
    .select()
    .from(rollingPerformance)
    .where(eq(rollingPerformance.reviewDate, latest[0].reviewDate));
}

// ─── Atlas Scheduled Jobs ────────────────────────────────────────────────────

export async function upsertScheduledJob(data: InsertAtlasScheduledJob) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const existing = await db
    .select()
    .from(atlasScheduledJobs)
    .where(eq(atlasScheduledJobs.jobName, data.jobName))
    .limit(1);
  if (existing[0]) {
    await db
      .update(atlasScheduledJobs)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(atlasScheduledJobs.jobName, data.jobName));
  } else {
    await db.insert(atlasScheduledJobs).values(data);
  }
}

export async function getScheduledJob(jobName: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(atlasScheduledJobs)
    .where(eq(atlasScheduledJobs.jobName, jobName))
    .limit(1);
  return rows[0] ?? null;
}

export async function listScheduledJobs() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(atlasScheduledJobs).orderBy(atlasScheduledJobs.jobName);
}

export async function updateScheduledJobRun(
  jobName: string,
  status: string,
  durationMs: number
) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(atlasScheduledJobs)
    .set({
      lastRunAt: new Date(),
      lastRunStatus: status,
      lastRunDurationMs: durationMs,
      totalRuns: sql`${atlasScheduledJobs.totalRuns} + 1`,
      successfulRuns:
        status === "SUCCESS"
          ? sql`${atlasScheduledJobs.successfulRuns} + 1`
          : sql`${atlasScheduledJobs.successfulRuns}`,
      failedRuns:
        status !== "SUCCESS"
          ? sql`${atlasScheduledJobs.failedRuns} + 1`
          : sql`${atlasScheduledJobs.failedRuns}`,
    })
    .where(eq(atlasScheduledJobs.jobName, jobName));
}

// ─── Daily Review Generation ─────────────────────────────────────────────────

/**
 * Compute rolling performance stats for a given window.
 * windowDays: 7, 30, 90, or null for lifetime.
 */
export async function computeRollingStats(windowDays: number | null) {
  const db = await getDb();
  if (!db) return null;

  const cutoff = windowDays
    ? new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000)
    : new Date(0);

  // All paper trades (A1/A3/B1)
  const allTrades = await db
    .select()
    .from(await import("../drizzle/schema").then((m) => m.paperTrades))
    .where(
      and(
        eq((await import("../drizzle/schema")).paperTrades.status, "CLOSED"),
        gte(
          (await import("../drizzle/schema")).paperTrades.closedAt,
          cutoff
        )
      )
    );

  // SB1 trades
  const sb1Trades = await db
    .select()
    .from(sb1PaperTrades)
    .where(
      and(
        eq(sb1PaperTrades.status, "CLOSED"),
        gte(sb1PaperTrades.closedAt, cutoff)
      )
    );

  const calcStats = (trades: { pnl: string | null; r_multiple?: string | null }[]) => {
    if (trades.length === 0)
      return { count: 0, wins: 0, losses: 0, wr: 0, pf: 0, expectancy: 0, avgR: 0, netPnl: 0, maxDd: 0 };
    const pnls = trades.map((t) => parseFloat((t as any).pnl ?? "0"));
    const wins = pnls.filter((p) => p > 0);
    const losses = pnls.filter((p) => p < 0);
    const gp = wins.reduce((a, b) => a + b, 0);
    const gl = Math.abs(losses.reduce((a, b) => a + b, 0));
    const pf = gl > 0 ? gp / gl : gp > 0 ? 999 : 0;
    const net = pnls.reduce((a, b) => a + b, 0);
    const rVals = trades
      .map((t) => parseFloat((t as any).rMultiple ?? (t as any).r_multiple ?? "0"))
      .filter((r) => !isNaN(r));
    const avgR = rVals.length > 0 ? rVals.reduce((a, b) => a + b, 0) / rVals.length : 0;
    let peak = 0, equity = 0, maxDd = 0;
    for (const p of pnls) {
      equity += p;
      if (equity > peak) peak = equity;
      const dd = peak - equity;
      if (dd > maxDd) maxDd = dd;
    }
    return {
      count: trades.length,
      wins: wins.length,
      losses: losses.length,
      wr: wins.length / trades.length,
      pf,
      expectancy: net / trades.length,
      avgR,
      netPnl: net,
      maxDd,
    };
  };

  const allStats = calcStats(allTrades as any[]);
  const sb1Stats = calcStats(sb1Trades as any[]);
  const sb1RasVals = sb1Trades
    .filter((t) => t.ras !== null)
    .map((t) => parseFloat(t.ras!));
  const sb1AvgRas =
    sb1RasVals.length > 0
      ? sb1RasVals.reduce((a, b) => a + b, 0) / sb1RasVals.length
      : 0;

  return { allStats, sb1Stats, sb1AvgRas };
}

/**
 * Generate the full daily review report JSON.
 * Called by the Heartbeat handler at 4:30 PM ET.
 */
export async function generateDailyReviewReport(reviewDate: string) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  // ── Trading Summary ──────────────────────────────────────────────────────
  const dayStart = new Date(`${reviewDate}T00:00:00.000Z`);
  const dayEnd = new Date(`${reviewDate}T23:59:59.999Z`);

  // All paper trades for the day
  const { paperTrades: pt } = await import("../drizzle/schema");
  const dayTrades = await db
    .select()
    .from(pt)
    .where(
      and(
        eq(pt.status, "CLOSED"),
        gte(pt.closedAt, dayStart),
        lte(pt.closedAt, dayEnd)
      )
    );

  const dayPnls = dayTrades.map((t) => parseFloat(t.pnl ?? "0"));
  const dayWins = dayPnls.filter((p) => p > 0);
  const dayLosses = dayPnls.filter((p) => p < 0);
  const dayGrossProfit = dayWins.reduce((a, b) => a + b, 0);
  const dayGrossLoss = Math.abs(dayLosses.reduce((a, b) => a + b, 0));
  const dayNetPnl = dayPnls.reduce((a, b) => a + b, 0);
  const dayPf = dayGrossLoss > 0 ? dayGrossProfit / dayGrossLoss : dayGrossProfit > 0 ? 999 : 0;
  const dayWr = dayTrades.length > 0 ? dayWins.length / dayTrades.length : 0;
  const dayExpectancy = dayTrades.length > 0 ? dayNetPnl / dayTrades.length : 0;

  // SB1 trades for the day
  const sb1DayTrades = await db
    .select()
    .from(sb1PaperTrades)
    .where(
      and(
        eq(sb1PaperTrades.status, "CLOSED"),
        gte(sb1PaperTrades.closedAt, dayStart),
        lte(sb1PaperTrades.closedAt, dayEnd)
      )
    );

  // SB1 rejected signals for the day
  const sb1DayRejections = await db
    .select()
    .from(sb1RejectedSignals)
    .where(
      and(
        gte(sb1RejectedSignals.createdAt, dayStart),
        lte(sb1RejectedSignals.createdAt, dayEnd)
      )
    );

  // Latest RAS snapshot
  const latestRas = await getLatestSb1RasSnapshot();

  // ── Model Activity ───────────────────────────────────────────────────────
  const modelActivity: Record<string, {
    signals: number; approved: number; rejected: number;
    avgEdgeScore: number; avgRas: number; avgHoldingTime: number;
  }> = {};
  const models = ["A1", "A3", "B1", "SB1"];
  for (const model of models) {
    if (model === "SB1") {
      const sb1Approved = sb1DayTrades.length;
      const sb1Rejected = sb1DayRejections.length;
      const sb1Signals = sb1Approved + sb1Rejected;
      const sb1AvgRas =
        sb1DayTrades.length > 0
          ? sb1DayTrades
              .filter((t) => t.ras !== null)
              .reduce((a, t) => a + parseFloat(t.ras!), 0) / sb1DayTrades.length
          : 0;
      const sb1AvgHold =
        sb1DayTrades.length > 0
          ? sb1DayTrades
              .filter((t) => t.holdingTimeMs !== null)
              .reduce((a, t) => a + (t.holdingTimeMs ?? 0), 0) / sb1DayTrades.length
          : 0;
      modelActivity["SB1"] = {
        signals: sb1Signals,
        approved: sb1Approved,
        rejected: sb1Rejected,
        avgEdgeScore: 0,
        avgRas: parseFloat(sb1AvgRas.toFixed(2)),
        avgHoldingTime: parseFloat((sb1AvgHold / 60000).toFixed(1)), // minutes
      };
    } else {
      const modelTrades = dayTrades.filter((t) => t.model === model);
      const avgEdge =
        modelTrades.length > 0
          ? modelTrades
              .filter((t) => t.edgeScore !== null)
              .reduce((a, t) => a + parseFloat(t.edgeScore!), 0) / modelTrades.length
          : 0;
      const avgHold =
        modelTrades.length > 0
          ? modelTrades
              .filter((t) => t.tradeDurationMs !== null)
              .reduce((a, t) => a + (t.tradeDurationMs ?? 0), 0) / modelTrades.length
          : 0;
      modelActivity[model] = {
        signals: modelTrades.length,
        approved: modelTrades.length,
        rejected: 0,
        avgEdgeScore: parseFloat(avgEdge.toFixed(4)),
        avgRas: 0,
        avgHoldingTime: parseFloat((avgHold / 60000).toFixed(1)),
      };
    }
  }

  // ── Regime Summary ───────────────────────────────────────────────────────
  const regimeSummary = {
    marketRegime: latestRas?.rasActivated ? "TRENDING" : "CHOPPY",
    rasScore: latestRas ? parseFloat(latestRas.ras) : null,
    rasActivated: latestRas?.rasActivated ?? false,
    chop: latestRas?.featureChop ? parseFloat(latestRas.featureChop) : null,
    atrExpansion: latestRas?.featureAtrExpansion ? parseFloat(latestRas.featureAtrExpansion) : null,
    vwapDist: latestRas?.featureVwapDist ? parseFloat(latestRas.featureVwapDist) : null,
    sb1Activations: sb1DayTrades.length,
    sb1Rejections: sb1DayRejections.length,
    topRejectionReason:
      sb1DayRejections.length > 0
        ? (() => {
            const counts: Record<string, number> = {};
            for (const r of sb1DayRejections) {
              counts[r.rejectionReason] = (counts[r.rejectionReason] ?? 0) + 1;
            }
            return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
          })()
        : null,
  };

  // ── Decision Review ──────────────────────────────────────────────────────
  const decisionReview = {
    tradesApproved: dayTrades.length + sb1DayTrades.length,
    tradesRejected: sb1DayRejections.length,
    approvalReasons: dayTrades.map((t) => ({
      model: t.model,
      direction: t.direction,
      edgeScore: t.edgeScore,
      adeDecision: t.adeDecision,
    })),
    rejectionReasons: sb1DayRejections.map((r) => ({
      direction: r.direction,
      ras: r.ras,
      reason: r.rejectionReason,
    })),
    largestMissedOpportunity: null as null | { direction: string; ras: string; reason: string },
    suggestedResearchItems: [] as string[],
  };

  // Identify largest missed opportunity (rejected signal with highest hypothetical PnL)
  const missedWithPnl = sb1DayRejections.filter((r) => r.hypotheticalPnl !== null);
  if (missedWithPnl.length > 0) {
    const biggest = missedWithPnl.sort(
      (a, b) => parseFloat(b.hypotheticalPnl!) - parseFloat(a.hypotheticalPnl!)
    )[0];
    decisionReview.largestMissedOpportunity = {
      direction: biggest.direction,
      ras: biggest.ras,
      reason: biggest.rejectionReason,
    };
  }

  // Auto-suggest research items
  if (sb1DayRejections.length > 5) {
    decisionReview.suggestedResearchItems.push(
      "High rejection rate today — review RAS threshold calibration"
    );
  }
  if (dayTrades.filter((t) => parseFloat(t.pnl ?? "0") < 0).length > 2) {
    decisionReview.suggestedResearchItems.push(
      "Multiple losses today — review ADE edge score distribution"
    );
  }

  // ── System Health ────────────────────────────────────────────────────────
  const { systemHealthEvents } = await import("../drizzle/schema");
  const recentErrors = await db
    .select()
    .from(systemHealthEvents)
    .where(
      and(
        gte(systemHealthEvents.ts, dayStart),
        eq(systemHealthEvents.severity, "ERROR")
      )
    );
  const { notificationLog } = await import("../drizzle/schema");
  const dayNotifications = await db
    .select()
    .from(notificationLog)
    .where(gte(notificationLog.sentAt, dayStart));

  const systemHealth = {
    errorCount: recentErrors.length,
    notificationsSent: dayNotifications.length,
    dbStatus: "OK",
    errorEvents: recentErrors.slice(0, 5).map((e) => ({
      type: e.eventType,
      message: e.message,
      ts: e.ts,
    })),
  };

  // ── Rolling Performance ──────────────────────────────────────────────────
  const rolling7d = await computeRollingStats(7);
  const rolling30d = await computeRollingStats(30);
  const rolling90d = await computeRollingStats(90);
  const rollingLifetime = await computeRollingStats(null);

  const performanceTracking = {
    "7D": rolling7d,
    "30D": rolling30d,
    "90D": rolling90d,
    LIFETIME: rollingLifetime,
  };

  // ── Assemble full report ─────────────────────────────────────────────────
  const report = {
    reviewDate,
    generatedAt: new Date().toISOString(),
    tradingSummary: {
      totalTrades: dayTrades.length + sb1DayTrades.length,
      winningTrades: dayWins.length,
      losingTrades: dayLosses.length,
      netPnl: parseFloat(dayNetPnl.toFixed(2)),
      grossProfit: parseFloat(dayGrossProfit.toFixed(2)),
      grossLoss: parseFloat(dayGrossLoss.toFixed(2)),
      winRate: parseFloat(dayWr.toFixed(4)),
      expectancy: parseFloat(dayExpectancy.toFixed(2)),
      profitFactor: parseFloat(dayPf.toFixed(4)),
      largestWinner: parseFloat(Math.max(...dayPnls, 0).toFixed(2)),
      largestLoser: parseFloat(Math.min(...dayPnls, 0).toFixed(2)),
      noTradeReason:
        dayTrades.length + sb1DayTrades.length === 0
          ? sb1DayRejections.length > 0
            ? `No qualifying regime — ${sb1DayRejections.length} SB1 signals rejected (top reason: ${regimeSummary.topRejectionReason ?? "unknown"})`
            : "No signals generated — no eligible models activated"
          : null,
    },
    modelActivity,
    regimeSummary,
    decisionReview,
    systemHealth,
    performanceTracking,
  };

  return report;
}
