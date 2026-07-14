/**
 * sessionReporter.ts — Sprint 104C Autonomous Pipeline Monitor
 *
 * Generates end-of-RTH-session certification reports.
 * Called at RTH session close (16:00 ET) or when triggered manually.
 *
 * Report contents:
 *   - Expected vs received bars, missing/duplicate bars
 *   - Models evaluated, eligible, signals generated
 *   - Trades opened/closed, P&L by model
 *   - LLC (Live Learning Certification) status
 *   - Owner action required (if any)
 *
 * After generation:
 *   - Writes to session_reports table
 *   - Writes to live_learning_sessions_monitor table
 *   - Commits report to GitHub (Project-Atlas repo)
 */

import { getDb } from "../db.js";
import {
  monitorEvaluations,
  paperTrades,
  sb1PaperTrades,
  sessionReports,
  liveLearningSessionsMonitor,
} from "../../drizzle/schema.js";
import { and, eq, gte, lte, desc, count, sql } from "drizzle-orm";
import { execSync } from "child_process";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

// ─── Constants ────────────────────────────────────────────────────────────────

// RTH: 09:30–16:00 ET = 78 five-minute bars
const RTH_BARS_EXPECTED = 78;

// GitHub repo path
const REPO_PATH = "/home/ubuntu/Project-Atlas";
const GIT_REMOTE = "https://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@github.com/SFGrowth/Project-Atlas.git";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SessionSummary {
  sessionDate: string; // YYYY-MM-DD
  rthOpen: number; // Unix ms
  rthClose: number; // Unix ms
  barsExpected: number;
  barsReceived: number;
  barsMissing: number;
  barsDuplicate: number;
  gapEvents: { barTimeEt: string | null; gapMinutes: number }[];
  modelsEvaluated: string[];
  modelsEligible: string[];
  signalsGenerated: number;
  tradesOpened: number;
  tradesClosed: number;
  pnlByModel: Record<string, number>;
  sessionPnl: number;
  certificationStatus: "CLEAN" | "CONTAMINATED" | "INCOMPLETE" | "PENDING";
  contaminationReason: string | null;
  ownerActionRequired: string | null;
}

// ─── Date Utilities ───────────────────────────────────────────────────────────

/**
 * Get RTH open/close timestamps for a given date (ET timezone).
 * RTH: 09:30–16:00 ET
 */
function getRthWindow(dateStr: string): { open: number; close: number } {
  // Parse date as ET (UTC-4 in summer, UTC-5 in winter)
  // We use a simple heuristic: assume EDT (UTC-4) for now
  // In production, use a proper timezone library
  const [year, month, day] = dateStr.split("-").map(Number);

  // 09:30 ET = 13:30 UTC (EDT) or 14:30 UTC (EST)
  const openUtc = Date.UTC(year, month - 1, day, 13, 30, 0); // EDT
  const closeUtc = Date.UTC(year, month - 1, day, 20, 0, 0); // 16:00 ET = 20:00 UTC EDT

  return { open: openUtc, close: closeUtc };
}

/**
 * Get today's date in ET timezone as YYYY-MM-DD.
 */
function getTodayEt(): string {
  const now = new Date();
  // Offset for ET (EDT = UTC-4, EST = UTC-5)
  const etOffset = -4 * 60; // minutes, assume EDT
  const etNow = new Date(now.getTime() + etOffset * 60 * 1000);
  return etNow.toISOString().split("T")[0];
}

// ─── Report Generation ────────────────────────────────────────────────────────

/**
 * Generate a session report for the given date.
 * Defaults to today's RTH session.
 */
export async function generateSessionReport(dateStr?: string): Promise<SessionSummary> {
  const db = await getDb();
  if (!db) throw new Error("[sessionReporter] DB unavailable");

  const sessionDate = dateStr ?? getTodayEt();
  const { open: rthOpen, close: rthClose } = getRthWindow(sessionDate);

  // ── 1. Bar statistics ──────────────────────────────────────────────────────

  const evaluations = await db
    .select()
    .from(monitorEvaluations)
    .where(
      and(
        gte(monitorEvaluations.barTime, rthOpen),
        lte(monitorEvaluations.barTime, rthClose),
        eq(monitorEvaluations.isRth, true)
      )
    )
    .orderBy(monitorEvaluations.barTime);

  const barsReceived = evaluations.length;
  const barsDuplicate = evaluations.filter((e) => e.duplicateDetected).length;
  const barsMissing = Math.max(0, RTH_BARS_EXPECTED - barsReceived);

  const gapEvents = evaluations
    .filter((e) => e.gapDetected && e.gapMinutes)
    .map((e) => ({ barTimeEt: e.barTimeEt, gapMinutes: e.gapMinutes! }));

  // ── 2. Model activity ──────────────────────────────────────────────────────

  const modelsEvaluatedSet = new Set<string>();
  const modelsEligibleSet = new Set<string>();
  let signalsGenerated = 0;

  for (const ev of evaluations) {
    // All models are always evaluated
    modelsEvaluatedSet.add("A1");
    modelsEvaluatedSet.add("A3");
    modelsEvaluatedSet.add("B1");
    modelsEvaluatedSet.add("SB1");
    modelsEvaluatedSet.add("ORB-1");

    if (ev.a1Eligible) modelsEligibleSet.add("A1");
    if (ev.a3Eligible) modelsEligibleSet.add("A3");
    if (ev.b1Eligible) modelsEligibleSet.add("B1");
    if (ev.sb1Eligible) modelsEligibleSet.add("SB1");
    if (ev.orb1Eligible) modelsEligibleSet.add("ORB-1");

    if (ev.signalModel) signalsGenerated++;
  }

  // ── 3. Trade statistics ────────────────────────────────────────────────────

  const sessionTrades = await db
    .select()
    .from(paperTrades)
    .where(
      and(
        eq(paperTrades.account, "ATLAS_MONITOR_PAPER"),
        gte(paperTrades.openedAt, new Date(rthOpen)),
        lte(paperTrades.openedAt, new Date(rthClose))
      )
    );

  const sessionSb1Trades = await db
    .select()
    .from(sb1PaperTrades)
    .where(
      and(
        gte(sb1PaperTrades.openedAt, new Date(rthOpen)),
        lte(sb1PaperTrades.openedAt, new Date(rthClose))
      )
    );

  const allSessionTrades = [
    ...sessionTrades.map((t) => ({ model: t.model, status: t.status, pnl: t.pnl })),
    ...sessionSb1Trades.map((t) => ({ model: "SB1", status: t.status, pnl: t.pnl })),
  ];

  const tradesOpened = allSessionTrades.length;
  const tradesClosed = allSessionTrades.filter((t) => t.status === "CLOSED").length;

  const pnlByModel: Record<string, number> = { A1: 0, A3: 0, B1: 0, SB1: 0, "ORB-1": 0 };
  let sessionPnl = 0;

  for (const trade of allSessionTrades) {
    if (trade.status === "CLOSED" && trade.pnl) {
      const p = parseFloat(String(trade.pnl));
      pnlByModel[trade.model] = (pnlByModel[trade.model] ?? 0) + p;
      sessionPnl += p;
    }
  }

  // ── 4. Certification status ────────────────────────────────────────────────

  let certificationStatus: "CLEAN" | "CONTAMINATED" | "INCOMPLETE" | "PENDING" = "PENDING";
  let contaminationReason: string | null = null;
  const ownerActions: string[] = [];

  if (barsReceived === 0) {
    certificationStatus = "INCOMPLETE";
    ownerActions.push("No bars received for this session — check TradingView webhook and M-16 alert.");
  } else if (barsMissing > 5) {
    certificationStatus = "CONTAMINATED";
    contaminationReason = `${barsMissing} missing bars (>${Math.round((barsMissing / RTH_BARS_EXPECTED) * 100)}% of RTH session)`;
    ownerActions.push(`Session has ${barsMissing} missing bars — data integrity compromised. Do not use for LLC certification.`);
  } else if (barsDuplicate > 0) {
    certificationStatus = "CONTAMINATED";
    contaminationReason = `${barsDuplicate} duplicate bars detected`;
    ownerActions.push(`${barsDuplicate} duplicate bars detected — investigate TradingView alert configuration.`);
  } else if (barsReceived >= RTH_BARS_EXPECTED * 0.95) {
    certificationStatus = "CLEAN";
  } else {
    certificationStatus = "INCOMPLETE";
    ownerActions.push(`Only ${barsReceived}/${RTH_BARS_EXPECTED} bars received — session incomplete.`);
  }

  if (gapEvents.length > 0) {
    ownerActions.push(`${gapEvents.length} gap event(s) detected: ${gapEvents.map((g) => `${g.barTimeEt} (${g.gapMinutes}min)`).join(", ")}`);
  }

  const summary: SessionSummary = {
    sessionDate,
    rthOpen,
    rthClose,
    barsExpected: RTH_BARS_EXPECTED,
    barsReceived,
    barsMissing,
    barsDuplicate,
    gapEvents,
    modelsEvaluated: Array.from(modelsEvaluatedSet),
    modelsEligible: Array.from(modelsEligibleSet),
    signalsGenerated,
    tradesOpened,
    tradesClosed,
    pnlByModel,
    sessionPnl,
    certificationStatus,
    contaminationReason,
    ownerActionRequired: ownerActions.length > 0 ? ownerActions.join(" | ") : null,
  };

  // ── 5. Persist to DB ───────────────────────────────────────────────────────

  await db.insert(sessionReports).values({
    sessionDate: new Date(sessionDate) as unknown as Date,
    reportType: "RTH_SESSION",
    status: certificationStatus === "CLEAN" ? "CLEAN" : certificationStatus === "INCOMPLETE" ? "DEGRADED" : "FAILED",
    barsExpected: RTH_BARS_EXPECTED,
    barsReceived,
    barsMissing,
    signalsGenerated,
    tradesOpened,
    tradesClosed,
    sessionPnl: String(sessionPnl),
    certificationStatus,
    ownerActionRequired: summary.ownerActionRequired,
    reportJson: JSON.stringify(summary, null, 2),
    generatedAt: new Date(),
  });

  // ── 6. Update LLC session tracking ────────────────────────────────────────

  await updateLlcSession(summary);

  // ── 7. Commit to GitHub ────────────────────────────────────────────────────

  const commitSha = await commitReportToGitHub(summary);
  if (commitSha) {
    // Update the session report with the commit SHA
    await db
      .update(sessionReports)
      .set({ githubCommitSha: commitSha })
      .where(eq(sessionReports.sessionDate, new Date(sessionDate) as unknown as Date));
  }

  console.log(`[sessionReporter] Session report generated for ${sessionDate}: ${certificationStatus}`);
  return summary;
}

// ─── LLC Session Tracking ─────────────────────────────────────────────────────

/**
 * Update the LLC (Live Learning Certification) session tracking.
 * The LLC requires 5 consecutive clean RTH sessions.
 */
async function updateLlcSession(summary: SessionSummary): Promise<void> {
  const db = await getDb();
  if (!db) return;

  // Find the current certification window
  const recentSessions = await db
    .select()
    .from(liveLearningSessionsMonitor)
    .orderBy(desc(liveLearningSessionsMonitor.sessionDate))
    .limit(10);

  // Determine session number in current window
  let sessionNumber = 1;
  let certWindowId = `LLC-${summary.sessionDate}`;

  if (recentSessions.length > 0) {
    const lastSession = recentSessions[0];
    const lastWindowId = lastSession.certWindowId;

    if (lastSession.certificationStatus === "CONTAMINATED" || lastSession.certificationStatus === "INCOMPLETE") {
      // Restart window
      certWindowId = `LLC-${summary.sessionDate}`;
      sessionNumber = 1;
    } else if (lastWindowId) {
      certWindowId = lastWindowId;
      sessionNumber = (lastSession.sessionNumber ?? 0) + 1;
    }
  }

  await db.insert(liveLearningSessionsMonitor).values({
    sessionDate: new Date(summary.sessionDate) as unknown as Date,
    sessionNumber,
    certWindowId,
    barsExpected: summary.barsExpected,
    barsReceived: summary.barsReceived,
    barsMissing: summary.barsMissing,
    barsDuplicate: summary.barsDuplicate,
    modelsEvaluated: summary.modelsEvaluated.join(","),
    modelsEligible: summary.modelsEligible.join(","),
    signalsGenerated: summary.signalsGenerated,
    tradesOpened: summary.tradesOpened,
    tradesClosed: summary.tradesClosed,
    pnlByModel: JSON.stringify(summary.pnlByModel),
    sessionPnl: String(summary.sessionPnl),
    certificationStatus: summary.certificationStatus,
    contaminationReason: summary.contaminationReason,
    ownerActionRequired: summary.ownerActionRequired,
    rthOpen: summary.rthOpen,
    rthClose: summary.rthClose,
    reportGeneratedAt: new Date(),
  });
}

// ─── GitHub Commit ────────────────────────────────────────────────────────────

/**
 * Commit the session report to the Project-Atlas GitHub repository.
 * Returns the commit SHA if successful, null otherwise.
 */
async function commitReportToGitHub(summary: SessionSummary): Promise<string | null> {
  try {
    // Ensure repo directory exists
    const reportsDir = join(REPO_PATH, "session-reports");
    mkdirSync(reportsDir, { recursive: true });

    // Write report file
    const filename = `session-report-${summary.sessionDate}.json`;
    const filepath = join(reportsDir, filename);
    writeFileSync(filepath, JSON.stringify(summary, null, 2));

    // Git operations
    execSync(`git -C ${REPO_PATH} config user.email "atlas@nexus.local"`, { stdio: "pipe" });
    execSync(`git -C ${REPO_PATH} config user.name "Atlas Nexus"`, { stdio: "pipe" });
    execSync(`git -C ${REPO_PATH} remote set-url origin ${GIT_REMOTE}`, { stdio: "pipe" });
    execSync(`git -C ${REPO_PATH} add ${filepath}`, { stdio: "pipe" });
    execSync(
      `git -C ${REPO_PATH} commit -m "session-report: ${summary.sessionDate} — ${summary.certificationStatus} (${summary.barsReceived}/${summary.barsExpected} bars, P&L $${summary.sessionPnl.toFixed(2)})"`,
      { stdio: "pipe" }
    );
    execSync(`git -C ${REPO_PATH} push origin main`, { stdio: "pipe" });

    // Get commit SHA
    const sha = execSync(`git -C ${REPO_PATH} rev-parse HEAD`, { encoding: "utf8" }).trim();
    console.log(`[sessionReporter] Committed report to GitHub: ${sha}`);
    return sha;
  } catch (err) {
    console.warn("[sessionReporter] GitHub commit failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Get recent session reports for dashboard display.
 */
export async function getRecentSessionReports(limit = 10) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(sessionReports)
    .orderBy(desc(sessionReports.generatedAt))
    .limit(limit);
}

/**
 * Get current LLC certification progress.
 */
export async function getLlcProgress() {
  const db = await getDb();
  if (!db) return null;

  const sessions = await db
    .select()
    .from(liveLearningSessionsMonitor)
    .orderBy(desc(liveLearningSessionsMonitor.sessionDate))
    .limit(10);

  if (sessions.length === 0) {
    return {
      windowId: null,
      sessionsCompleted: 0,
      sessionsRequired: 5,
      currentStatus: "NOT_STARTED",
      sessions: [],
    };
  }

  // Find the current window
  const latestWindowId = sessions[0].certWindowId;
  const windowSessions = sessions.filter((s) => s.certWindowId === latestWindowId);
  const cleanSessions = windowSessions.filter((s) => s.certificationStatus === "CLEAN");

  return {
    windowId: latestWindowId,
    sessionsCompleted: cleanSessions.length,
    sessionsRequired: 5,
    currentStatus: cleanSessions.length >= 5 ? "CERTIFIED" : "IN_PROGRESS",
    sessions: windowSessions,
  };
}
