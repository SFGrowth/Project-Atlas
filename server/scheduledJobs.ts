/**
 * Atlas Nexus — Scheduled Jobs Handler
 *
 * This module registers all Atlas scheduled job endpoints under /api/scheduled/*.
 * Each handler is authenticated via sdk.authenticateRequest (isCron check).
 *
 * Current jobs:
 *   - daily-review   → runs at 4:30 PM ET (21:30 UTC) on weekdays
 *
 * Future jobs (same framework):
 *   - weekly-review
 *   - monthly-review
 *   - model-certification
 *   - monte-carlo-refresh
 *   - portfolio-health
 *   - risk-audit
 */

import type { Router, Request, Response } from "express";
import { sdk } from "./_core/sdk";
import { notifyOwner } from "./_core/notification";
import {
  generateDailyReviewReport,
  saveDailyReview,
  upsertRollingPerformance,
  computeRollingStats,
  updateScheduledJobRun,
} from "./sb1Db";

// ─── Utility ─────────────────────────────────────────────────────────────────

function getTodayEtDate(): string {
  // Get today's date in America/New_York timezone
  const now = new Date();
  const etFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return etFormatter.format(now); // returns YYYY-MM-DD
}

function isWeekday(dateStr: string): boolean {
  const d = new Date(dateStr + "T12:00:00Z");
  const dow = d.getUTCDay();
  return dow >= 1 && dow <= 5; // Mon–Fri
}

// ─── Daily Review Handler ─────────────────────────────────────────────────────

async function handleDailyReview(req: Request, res: Response): Promise<void> {
  const startTime = Date.now();
  const jobName = "atlas-daily-review";

  try {
    // Authenticate — must be a cron callback
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron) {
      res.status(403).json({ error: "cron-only endpoint" });
      return;
    }

    const reviewDate = getTodayEtDate();

    console.log(`[Scheduler] Daily review starting for ${reviewDate}`);

    // Generate the full daily review report
    const report = await generateDailyReviewReport(reviewDate);

    // Persist to database
    await saveDailyReview({
      reviewDate: reviewDate as unknown as Date,
      generatedBy: "HEARTBEAT",
      generationStatus: "SUCCESS",
      totalTrades: report.tradingSummary.totalTrades,
      winningTrades: report.tradingSummary.winningTrades,
      losingTrades: report.tradingSummary.losingTrades,
      netPnl: String(report.tradingSummary.netPnl),
      grossProfit: String(report.tradingSummary.grossProfit),
      grossLoss: String(report.tradingSummary.grossLoss),
      winRate: String(report.tradingSummary.winRate),
      expectancy: String(report.tradingSummary.expectancy),
      largestWinner: String(report.tradingSummary.largestWinner),
      largestLoser: String(report.tradingSummary.largestLoser),
      reportJson: report,
      notificationSent: false,
    });

    // Update rolling performance metrics (compute and upsert all 4 windows)
    const windowDayMap: Record<string, number | null> = { "7D": 7, "30D": 30, "90D": 90, "LIFETIME": null };
    const windowKeys = ["7D", "30D", "90D", "LIFETIME"] as const;
    for (const window of windowKeys) {
      const stats = await computeRollingStats(windowDayMap[window]);
      if (!stats) continue;
      const toStr = (v: number | undefined) => v !== undefined ? String(v) : null;
      await upsertRollingPerformance({
        reviewDate: reviewDate as unknown as Date,
        window,
        netPnl: toStr(stats.allStats?.netPnl),
        winRate: toStr(stats.allStats?.wr),
        profitFactor: toStr(stats.allStats?.pf),
        expectancy: toStr(stats.allStats?.expectancy),
        maxDrawdown: toStr(stats.allStats?.maxDd),
        avgR: toStr(stats.allStats?.avgR),
        tradeCount: stats.allStats?.count ?? 0,
        sb1NetPnl: toStr(stats.sb1Stats?.netPnl),
        sb1WinRate: toStr(stats.sb1Stats?.wr),
        sb1ProfitFactor: toStr(stats.sb1Stats?.pf),
        sb1TradeCount: stats.sb1Stats?.count ?? 0,
        sb1AvgRas: toStr(stats.sb1AvgRas),
      });
    }

    // Update job run record
    const durationMs = Date.now() - startTime;
    await updateScheduledJobRun(jobName, "SUCCESS", durationMs);

    // Send push notification
    const tradeCount = report.tradingSummary.totalTrades;
    const netPnl = report.tradingSummary.netPnl;
    const pnlStr = netPnl >= 0 ? `+$${netPnl.toFixed(0)}` : `-$${Math.abs(netPnl).toFixed(0)}`;
    const notifBody = tradeCount > 0
      ? `${reviewDate} — ${tradeCount} trade${tradeCount !== 1 ? "s" : ""}, ${pnlStr} net P&L`
      : `${reviewDate} — No trades taken`;

    await notifyOwner({
      title: "Atlas Daily Review Complete",
      content: notifBody,
    });

    console.log(`[Scheduler] Daily review complete: ${reviewDate} in ${durationMs}ms`);

    res.json({
      ok: true,
      reviewDate,
      durationMs,
      totalTrades: tradeCount,
      netPnl,
    });
  } catch (err) {
    const durationMs = Date.now() - startTime;
    const errorMsg = err instanceof Error ? err.message : String(err);
    const errorStack = err instanceof Error ? err.stack : undefined;

    console.error(`[Scheduler] Daily review FAILED:`, err);

    // Try to record the failure
    try {
      await updateScheduledJobRun("atlas-daily-review", "FAILED", durationMs);
    } catch {
      // Don't let this secondary failure mask the original error
    }

    // Send failure notification
    try {
      await notifyOwner({
        title: "Atlas Daily Review Failed – Investigation Required",
        content: `Error: ${errorMsg.slice(0, 200)}`,
      });
    } catch {
      // Don't let notification failure mask the original error
    }

    res.status(500).json({
      error: errorMsg,
      stack: errorStack,
      context: {
        url: req.url,
        durationMs,
      },
      timestamp: new Date().toISOString(),
    });
  }
}

// ─── Weekly Review Handler (placeholder for future use) ───────────────────────

async function handleWeeklyReview(req: Request, res: Response): Promise<void> {
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron) {
      res.status(403).json({ error: "cron-only endpoint" });
      return;
    }
    // TODO: implement weekly review in Sprint 089+
    console.log("[Scheduler] Weekly review triggered (not yet implemented)");
    res.json({ ok: true, status: "not_implemented", message: "Weekly review scheduled for Sprint 089" });
  } catch (err) {
    res.status(500).json({ error: String(err), timestamp: new Date().toISOString() });
  }
}

// ─── Monthly Review Handler (placeholder for future use) ──────────────────────

async function handleMonthlyReview(req: Request, res: Response): Promise<void> {
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron) {
      res.status(403).json({ error: "cron-only endpoint" });
      return;
    }
    // TODO: implement monthly review in Sprint 089+
    console.log("[Scheduler] Monthly review triggered (not yet implemented)");
    res.json({ ok: true, status: "not_implemented", message: "Monthly review scheduled for Sprint 089" });
  } catch (err) {
    res.status(500).json({ error: String(err), timestamp: new Date().toISOString() });
  }
}

// ─── Monte Carlo Refresh Handler (placeholder for future use) ─────────────────

async function handleMonteCarloRefresh(req: Request, res: Response): Promise<void> {
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron) {
      res.status(403).json({ error: "cron-only endpoint" });
      return;
    }
    // TODO: implement Monte Carlo refresh in Sprint 089+
    console.log("[Scheduler] Monte Carlo refresh triggered (not yet implemented)");
    res.json({ ok: true, status: "not_implemented", message: "Monte Carlo refresh scheduled for Sprint 089" });
  } catch (err) {
    res.status(500).json({ error: String(err), timestamp: new Date().toISOString() });
  }
}

// ─── Registration ─────────────────────────────────────────────────────────────

/**
 * Register all Atlas scheduled job endpoints on the given Express router.
 * Call this in server/_core/index.ts BEFORE the Vite/static fallthrough.
 */
export function registerScheduledJobs(app: Router): void {
  // Daily review — 4:30 PM ET (21:30 UTC) weekdays
  app.post("/api/scheduled/daily-review", (req, res) => {
    handleDailyReview(req, res).catch((err) => {
      console.error("[Scheduler] Unhandled error in daily-review:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: String(err), timestamp: new Date().toISOString() });
      }
    });
  });

  // Weekly review — Saturdays 08:00 ET (12:00 UTC)
  app.post("/api/scheduled/weekly-review", (req, res) => {
    handleWeeklyReview(req, res).catch((err) => {
      console.error("[Scheduler] Unhandled error in weekly-review:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: String(err), timestamp: new Date().toISOString() });
      }
    });
  });

  // Monthly review — 1st of month 08:00 ET
  app.post("/api/scheduled/monthly-review", (req, res) => {
    handleMonthlyReview(req, res).catch((err) => {
      console.error("[Scheduler] Unhandled error in monthly-review:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: String(err), timestamp: new Date().toISOString() });
      }
    });
  });

  // Monte Carlo refresh — Sundays 09:00 ET
  app.post("/api/scheduled/monte-carlo-refresh", (req, res) => {
    handleMonteCarloRefresh(req, res).catch((err) => {
      console.error("[Scheduler] Unhandled error in monte-carlo-refresh:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: String(err), timestamp: new Date().toISOString() });
      }
    });
  });

  console.log("[Scheduler] Registered 4 scheduled job endpoints");
}
