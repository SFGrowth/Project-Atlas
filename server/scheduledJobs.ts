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
import {
  runHourlyAnalysis,
  runDailyResearchReview,
  runWeeklyExecutiveBriefing,
  runMonthlyAudit,
} from "./darwinAutonomous";
import {
  runHeartbeatMonitor,
  generateMorningBrief,
  generateDailyIntelligenceReport,
  generateWeeklyExecutiveReview,
  updateLiveConcordance,
} from "./atlasAutonomous";
import {
  runDailyAutonomousWork,
  generateCroReport,
} from "./darwinCroEngine";

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

// ─── TIE Autonomous Discovery Handler ────────────────────────────────────────

async function handleTIEDiscovery(req: Request, res: Response): Promise<void> {
  const startTime = Date.now();
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron) {
      res.status(403).json({ error: "cron-only endpoint" });
      return;
    }

    console.log("[Scheduler] TIE Autonomous Discovery starting…");

    // Run TIE processing on the last 500 bars from Atlas Memory
    const { processTIE, runAutonomousDiscovery } = await import("./tieEngine");
    await processTIE(500);
    const discoveryResult = await runAutonomousDiscovery();

    const durationMs = Date.now() - startTime;
    console.log(`[Scheduler] TIE Discovery complete in ${durationMs}ms`, discoveryResult);

    // Notify owner
    await notifyOwner({
      title: "TIE Autonomous Discovery Complete",
      content: `Processed ${discoveryResult?.sequencesProcessed ?? 0} sequences, found ${discoveryResult?.newCandidates ?? 0} new research candidates in ${durationMs}ms`,
    });

    res.json({
      ok: true,
      durationMs,
      ...discoveryResult,
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("[Scheduler] TIE Discovery FAILED:", err);
    try {
      await notifyOwner({
        title: "TIE Autonomous Discovery Failed",
        content: `Error: ${errorMsg.slice(0, 200)}`,
      });
    } catch { /* suppress secondary failure */ }
    res.status(500).json({ error: errorMsg, timestamp: new Date().toISOString() });
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

  // TIE Autonomous Discovery — every Sunday 06:00 UTC (Sprint 090)
  app.post("/api/scheduled/tie-discovery", (req, res) => {
    handleTIEDiscovery(req, res).catch((err) => {
      console.error("[Scheduler] Unhandled error in tie-discovery:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: String(err), timestamp: new Date().toISOString() });
      }
    });
  });

  // ─── DARWIN Autonomous Jobs (Sprint 094A) ─────────────────────────────────

  // DARWIN Hourly Analysis — every hour during market hours
  app.post("/api/scheduled/darwin-hourly", async (req, res) => {
    try {
      const auth = await sdk.authenticateRequest(req);
      if (!auth.isCron) { res.status(403).json({ error: "Forbidden" }); return; }
      await runHourlyAnalysis();
      res.json({ ok: true, job: "darwin-hourly", timestamp: new Date().toISOString() });
    } catch (err) {
      console.error("[DARWIN] Hourly analysis error:", err);
      if (!res.headersSent) res.status(500).json({ error: String(err) });
    }
  });

  // DARWIN Daily Review — 4:45 PM ET (21:45 UTC) weekdays
  app.post("/api/scheduled/darwin-daily", async (req, res) => {
    try {
      const auth = await sdk.authenticateRequest(req);
      if (!auth.isCron) { res.status(403).json({ error: "Forbidden" }); return; }
      await runDailyResearchReview();
      res.json({ ok: true, job: "darwin-daily", timestamp: new Date().toISOString() });
    } catch (err) {
      console.error("[DARWIN] Daily review error:", err);
      if (!res.headersSent) res.status(500).json({ error: String(err) });
    }
  });

  // DARWIN Weekly Briefing — Saturdays 09:00 ET (13:00 UTC)
  app.post("/api/scheduled/darwin-weekly", async (req, res) => {
    try {
      const auth = await sdk.authenticateRequest(req);
      if (!auth.isCron) { res.status(403).json({ error: "Forbidden" }); return; }
      await runWeeklyExecutiveBriefing();
      res.json({ ok: true, job: "darwin-weekly", timestamp: new Date().toISOString() });
    } catch (err) {
      console.error("[DARWIN] Weekly briefing error:", err);
      if (!res.headersSent) res.status(500).json({ error: String(err) });
    }
  });

  // DARWIN Monthly Audit — 1st of month 09:00 ET
  app.post("/api/scheduled/darwin-monthly", async (req, res) => {
    try {
      const auth = await sdk.authenticateRequest(req);
      if (!auth.isCron) { res.status(403).json({ error: "Forbidden" }); return; }
      await runMonthlyAudit();
      res.json({ ok: true, job: "darwin-monthly", timestamp: new Date().toISOString() });
    } catch (err) {
      console.error("[DARWIN] Monthly audit error:", err);
      if (!res.headersSent) res.status(500).json({ error: String(err) });
    }
  });

  // ─── Sprint 099 Autonomous Operations Jobs ───────────────────────────────

  // Heartbeat Monitor — every 5 minutes during RTH (checks for webhook silence)
  app.post("/api/scheduled/atlas-heartbeat", async (req, res) => {
    try {
      const auth = await sdk.authenticateRequest(req);
      if (!auth.isCron) { res.status(403).json({ error: "Forbidden" }); return; }
      const result = await runHeartbeatMonitor();
      res.json({ ok: true, job: "atlas-heartbeat", result, timestamp: new Date().toISOString() });
    } catch (err) {
      console.error("[Atlas] Heartbeat monitor error:", err);
      if (!res.headersSent) res.status(500).json({ error: String(err) });
    }
  });

  // Morning Brief — 08:30 ET weekdays (13:30 UTC)
  app.post("/api/scheduled/atlas-morning-brief", async (req, res) => {
    try {
      const auth = await sdk.authenticateRequest(req);
      if (!auth.isCron) { res.status(403).json({ error: "Forbidden" }); return; }
      const result = await generateMorningBrief();
      res.json({ ok: true, job: "atlas-morning-brief", result, timestamp: new Date().toISOString() });
    } catch (err) {
      console.error("[Atlas] Morning brief error:", err);
      if (!res.headersSent) res.status(500).json({ error: String(err) });
    }
  });

  // Daily Intelligence Report — 16:15 ET weekdays (20:15 UTC)
  app.post("/api/scheduled/atlas-daily-intelligence", async (req, res) => {
    try {
      const auth = await sdk.authenticateRequest(req);
      if (!auth.isCron) { res.status(403).json({ error: "Forbidden" }); return; }
      const result = await generateDailyIntelligenceReport();
      res.json({ ok: true, job: "atlas-daily-intelligence", result, timestamp: new Date().toISOString() });
    } catch (err) {
      console.error("[Atlas] Daily intelligence error:", err);
      if (!res.headersSent) res.status(500).json({ error: String(err) });
    }
  });

  // Weekly Executive Review — Sundays 18:00 ET (22:00 UTC)
  app.post("/api/scheduled/atlas-weekly-review", async (req, res) => {
    try {
      const auth = await sdk.authenticateRequest(req);
      if (!auth.isCron) { res.status(403).json({ error: "Forbidden" }); return; }
      const result = await generateWeeklyExecutiveReview();
      res.json({ ok: true, job: "atlas-weekly-review", result, timestamp: new Date().toISOString() });
    } catch (err) {
      console.error("[Atlas] Weekly review error:", err);
      if (!res.headersSent) res.status(500).json({ error: String(err) });
    }
  });

  // Live Concordance — 16:30 ET weekdays (20:30 UTC)
  app.post("/api/scheduled/atlas-concordance", async (req, res) => {
    try {
      const auth = await sdk.authenticateRequest(req);
      if (!auth.isCron) { res.status(403).json({ error: "Forbidden" }); return; }
      await updateLiveConcordance(7);
      await updateLiveConcordance(30);
      res.json({ ok: true, job: "atlas-concordance", timestamp: new Date().toISOString() });
    } catch (err) {
      console.error("[Atlas] Concordance error:", err);
      if (!res.headersSent) res.status(500).json({ error: String(err) });
    }
  });

  // ─── Sprint 101 DARWIN CRO Jobs ──────────────────────────────────────────
  // DARWIN CRO Daily Work — 5:00 PM ET (22:00 UTC) weekdays
  app.post("/api/scheduled/darwin-cro-daily", async (req, res) => {
    try {
      const auth = await sdk.authenticateRequest(req);
      if (!auth.isCron) { res.status(403).json({ error: "Forbidden" }); return; }
      const result = await runDailyAutonomousWork();
      res.json({ ok: true, job: "darwin-cro-daily", result, timestamp: new Date().toISOString() });
    } catch (err) {
      console.error("[DARWIN CRO] Daily work error:", err);
      if (!res.headersSent) res.status(500).json({ error: String(err) });
    }
  });

  // DARWIN CRO Weekly Report — Sundays 20:00 ET (00:00 UTC Monday)
  app.post("/api/scheduled/darwin-cro-weekly", async (req, res) => {
    try {
      const auth = await sdk.authenticateRequest(req);
      if (!auth.isCron) { res.status(403).json({ error: "Forbidden" }); return; }
      const reportId = await generateCroReport();
      res.json({ ok: true, job: "darwin-cro-weekly", reportId, timestamp: new Date().toISOString() });
    } catch (err) {
      console.error("[DARWIN CRO] Weekly report error:", err);
      if (!res.headersSent) res.status(500).json({ error: String(err) });
    }
  });

  // ─── ARP-1 Programs F and G ─────────────────────────────────────────────
  // ARP-1 Weekly Self-Review — Sundays 18:00 ET (22:00 UTC)
  app.post("/api/scheduled/arp1-weekly-review", async (req, res) => {
    try {
      const auth = await sdk.authenticateRequest(req);
      if (!auth.isCron) { res.status(403).json({ error: "Forbidden" }); return; }
      const { generateWeeklyReview } = await import("./arp1Db");
      const result = await generateWeeklyReview();
      res.json({ ok: true, job: "arp1-weekly-review", result, timestamp: new Date().toISOString() });
    } catch (err) {
      console.error("[ARP1-F] Weekly review error:", err);
      if (!res.headersSent) res.status(500).json({ error: String(err) });
    }
  });

  // ARP-1 Daily Owner Brief — 08:00 ET weekdays (12:00 UTC)
  app.post("/api/scheduled/arp1-daily-brief", async (req, res) => {
    try {
      const auth = await sdk.authenticateRequest(req);
      if (!auth.isCron) { res.status(403).json({ error: "Forbidden" }); return; }
      const { generateDailyBrief } = await import("./arp1Db");
      const result = await generateDailyBrief();
      res.json({ ok: true, job: "arp1-daily-brief", result, timestamp: new Date().toISOString() });
    } catch (err) {
      console.error("[ARP1-G] Daily brief error:", err);
      if (!res.headersSent) res.status(500).json({ error: String(err) });
    }
  });

  console.log("[Scheduler] Registered 18 scheduled job endpoints (5 Atlas + 4 DARWIN + 5 Sprint-099 + 2 Sprint-101 CRO + 2 ARP-1)");
}
