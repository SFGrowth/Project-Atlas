/**
 * DARWIN Research Scheduler — Standalone Entry Point
 * Sprint 123A.7 / Gate G7
 *
 * This is the systemd service entry point for the DARWIN research scheduler.
 * It runs as an independent process (atlas-darwin-scheduler.service) and
 * executes the 7 research job types on their defined schedules.
 *
 * AUTHORITY BOUNDARIES — PERMANENT INVARIANTS:
 *   - NEVER calls processBar
 *   - NEVER calls postBarAutomation
 *   - NEVER sends TradersPost webhooks
 *   - NEVER submits Tradovate orders
 *   - NEVER generates live trade signals
 *   - ALL jobs are RESEARCH ONLY (liveChartAffected: false)
 *   - ALL data comes from Databento (atlas_bars_1m / atlas_bars_5m)
 *
 * Resource limits (enforced by systemd unit):
 *   - MemoryMax=512M
 *   - CPUQuota=25%
 *   - RestartSec=30s, StartLimitBurst=5
 */

import { getResearchSchedulerStatus, runJob, type JobType } from './darwin-research-scheduler.js';
import { sweepTimedOutJobs, getSchedulerStatus } from './darwin-resource-scheduler.js';
import { isDarwinObservationPermitted } from '../market-data/darwin-authority.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const HEALTH_CHECK_INTERVAL_MS = 60_000;       // 1 minute
const TIMEOUT_SWEEP_INTERVAL_MS = 30_000;      // 30 seconds
const SCHEDULE_POLL_INTERVAL_MS = 30_000;      // 30 seconds
const STARTUP_DELAY_MS = 5_000;                // 5 second startup delay

// ─── Logging ─────────────────────────────────────────────────────────────────

function log(level: 'INFO' | 'WARN' | 'ERROR', message: string, data?: unknown): void {
  const ts = new Date().toISOString();
  const prefix = `[${ts}] [DARWIN-SCHEDULER] [${level}]`;
  if (data !== undefined) {
    console.log(`${prefix} ${message}`, JSON.stringify(data, null, 2));
  } else {
    console.log(`${prefix} ${message}`);
  }
}

// ─── Job Schedule Checker ─────────────────────────────────────────────────────

/**
 * Checks whether a job is due to run based on its schedule.
 * Called every SCHEDULE_POLL_INTERVAL_MS.
 */
function isJobDue(jobType: JobType, now: Date): boolean {
  const status = getResearchSchedulerStatus();
  const job = status.jobs.find(j => j.jobType === jobType);
  if (!job) return false;
  if (!job.nextRunAt) return false;

  // Job is due if nextRunAt is in the past
  return job.nextRunAt <= now;
}

// ─── Main Scheduler Loop ──────────────────────────────────────────────────────

let isShuttingDown = false;
const activeTimers: ReturnType<typeof setInterval>[] = [];

async function runSchedulerLoop(): Promise<void> {
  log('INFO', 'DARWIN Research Scheduler starting', {
    pid: process.pid,
    nodeVersion: process.version,
    liveChartAffected: false,
    authorityBoundary: 'RESEARCH_ONLY',
  });

  // Startup delay — let the main server stabilise first
  await new Promise(resolve => setTimeout(resolve, STARTUP_DELAY_MS));

  // Authority check
  if (!isDarwinObservationPermitted()) {
    log('WARN', 'DARWIN observation not permitted — scheduler will poll but skip jobs until authority is active');
  } else {
    log('INFO', 'DARWIN observation permitted — scheduler is active');
  }

  // Log initial status
  const initialStatus = getResearchSchedulerStatus();
  log('INFO', 'Initial scheduler status', {
    isActive: initialStatus.isActive,
    jobCount: initialStatus.jobs.length,
    jobs: initialStatus.jobs.map(j => ({
      jobId: j.jobId,
      description: j.description,
      nextRunAt: j.nextRunAt?.toISOString(),
      liveChartAffected: j.liveChartAffected,
    })),
  });

  // ─── Timeout sweep (every 30s) ────────────────────────────────────────────
  const sweepTimer = setInterval(() => {
    if (isShuttingDown) return;
    sweepTimedOutJobs();
  }, TIMEOUT_SWEEP_INTERVAL_MS);
  activeTimers.push(sweepTimer);

  // ─── Health check (every 60s) ─────────────────────────────────────────────
  const healthTimer = setInterval(() => {
    if (isShuttingDown) return;
    const resourceStatus = getSchedulerStatus();
    const schedulerStatus = getResearchSchedulerStatus();
    log('INFO', 'Health check', {
      running: resourceStatus.runningJobs,
      queued: resourceStatus.queuedJobs,
      healthy: resourceStatus.healthy,
      totalJobsRun: schedulerStatus.totalJobsRun,
      totalErrors: schedulerStatus.totalErrors,
      liveChartAffected: false,
    });
  }, HEALTH_CHECK_INTERVAL_MS);
  activeTimers.push(healthTimer);

  // ─── Schedule polling loop (every 30s) ────────────────────────────────────
  const scheduleTimer = setInterval(async () => {
    if (isShuttingDown) return;
    if (!isDarwinObservationPermitted()) return;

    const now = new Date();
    const jobTypes: JobType[] = ['J1', 'J2', 'J3', 'J4', 'J5', 'J6', 'J7'];

    for (const jobType of jobTypes) {
      if (isShuttingDown) break;
      if (isJobDue(jobType, now)) {
        log('INFO', `Job ${jobType} is due — executing`, { jobType, now: now.toISOString() });
        try {
          const result = await runJob(jobType);
          log('INFO', `Job ${jobType} completed`, {
            status: result.status,
            durationMs: result.durationMs,
            liveChartAffected: result.liveChartAffected,
          });
        } catch (err) {
          log('ERROR', `Job ${jobType} threw an unhandled exception`, {
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }
  }, SCHEDULE_POLL_INTERVAL_MS);
  activeTimers.push(scheduleTimer);

  log('INFO', 'DARWIN Research Scheduler is running', {
    pollIntervalMs: SCHEDULE_POLL_INTERVAL_MS,
    healthCheckIntervalMs: HEALTH_CHECK_INTERVAL_MS,
    timeoutSweepIntervalMs: TIMEOUT_SWEEP_INTERVAL_MS,
    liveChartAffected: false,
  });
}

// ─── Graceful Shutdown ────────────────────────────────────────────────────────

function handleShutdown(signal: string): void {
  log('INFO', `Received ${signal} — initiating graceful shutdown`);
  isShuttingDown = true;

  // Clear all timers
  for (const timer of activeTimers) {
    clearInterval(timer);
  }

  log('INFO', 'DARWIN Research Scheduler shutdown complete', {
    signal,
    liveChartAffected: false,
  });

  process.exit(0);
}

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));

process.on('uncaughtException', (err) => {
  log('ERROR', 'Uncaught exception — scheduler will restart via systemd', {
    error: err.message,
    stack: err.stack,
  });
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  log('ERROR', 'Unhandled rejection — scheduler will restart via systemd', {
    reason: String(reason),
  });
  process.exit(1);
});

// ─── Start ────────────────────────────────────────────────────────────────────

runSchedulerLoop().catch((err) => {
  log('ERROR', 'Fatal error in scheduler loop', {
    error: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });
  process.exit(1);
});
