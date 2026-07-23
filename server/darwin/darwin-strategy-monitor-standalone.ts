/**
 * DARWIN Strategy Monitor — Standalone Entry Point
 * Sprint 123A.7 / Gate G7
 *
 * This is the systemd service entry point for the DARWIN strategy monitor.
 * It runs as an independent process (atlas-darwin-monitor.service) and
 * continuously monitors strategy lifecycle metrics.
 *
 * AUTHORITY BOUNDARIES — PERMANENT INVARIANTS:
 *   - NEVER calls processBar
 *   - NEVER calls postBarAutomation
 *   - NEVER sends TradersPost webhooks
 *   - NEVER submits Tradovate orders
 *   - NEVER auto-promotes strategies
 *   - ALL recommendations require human (Phil's) explicit approval
 *   - liveChartAffected: false — permanent
 *
 * Resource limits (enforced by systemd unit):
 *   - MemoryMax=256M
 *   - CPUQuota=10%
 *   - RestartSec=30s, StartLimitBurst=5
 */

import {
  monitorAllStrategies,
  getOpenGaps,
  getHighPriorityGaps,
  STRATEGY_REGISTRY,
  type StrategyId,
} from './darwin-strategy-monitor.js';
import { isDarwinObservationPermitted } from '../market-data/darwin-authority.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const MONITOR_INTERVAL_MS = 15 * 60_000;       // 15 minutes
const HEALTH_CHECK_INTERVAL_MS = 60_000;       // 1 minute
const STARTUP_DELAY_MS = 8_000;                // 8 second startup delay (after scheduler)
const MONITORING_WINDOW_DAYS = 30;

// ─── Logging ─────────────────────────────────────────────────────────────────

function log(level: 'INFO' | 'WARN' | 'ERROR', message: string, data?: unknown): void {
  const ts = new Date().toISOString();
  const prefix = `[${ts}] [DARWIN-MONITOR] [${level}]`;
  if (data !== undefined) {
    console.log(`${prefix} ${message}`, JSON.stringify(data, null, 2));
  } else {
    console.log(`${prefix} ${message}`);
  }
}

// ─── Monitor Loop ─────────────────────────────────────────────────────────────

let isShuttingDown = false;
const activeTimers: ReturnType<typeof setInterval>[] = [];

async function runMonitorCycle(): Promise<void> {
  if (!isDarwinObservationPermitted()) {
    log('WARN', 'DARWIN observation not permitted — skipping monitor cycle');
    return;
  }

  log('INFO', 'Running strategy monitor cycle', {
    windowDays: MONITORING_WINDOW_DAYS,
    strategies: Object.keys(STRATEGY_REGISTRY),
    liveChartAffected: false,
  });

  try {
    const result = await monitorAllStrategies(MONITORING_WINDOW_DAYS);

    log('INFO', 'Monitor cycle complete', {
      summary: result.summary,
      recommendationCount: result.recommendations.length,
      actionRequired: result.recommendations.filter(r => r.recommendation !== 'NO_ACTION').length,
      computedAt: result.computedAt.toISOString(),
      liveChartAffected: result.liveChartAffected,
    });

    // Log individual recommendations
    for (const rec of result.recommendations) {
      const level = rec.recommendation === 'NO_ACTION' ? 'INFO' : 'WARN';
      log(level, `Strategy ${rec.strategyId}: ${rec.recommendation}`, {
        strategyId: rec.strategyId,
        currentStatus: rec.currentStatus,
        recommendation: rec.recommendation,
        reason: rec.reason,
        requiresHumanApproval: rec.requiresHumanApproval,
        metrics: {
          nTrades: rec.metrics.nTrades,
          winRate: rec.metrics.winRate.toFixed(4),
          expectancyPts: rec.metrics.expectancyPts.toFixed(2),
          netPnlDollars: rec.metrics.netPnlDollars.toFixed(2),
          maxDrawdownDollars: rec.metrics.maxDrawdownDollars.toFixed(2),
          liveChartAffected: false,
        },
      });
    }

    // Log portfolio gaps
    const openGaps = getOpenGaps();
    const highPriorityGaps = getHighPriorityGaps();
    log('INFO', 'Portfolio gap status', {
      openGaps: openGaps.length,
      highPriorityGaps: highPriorityGaps.length,
      liveChartAffected: false,
    });

  } catch (err) {
    log('ERROR', 'Monitor cycle failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

async function runMonitorLoop(): Promise<void> {
  log('INFO', 'DARWIN Strategy Monitor starting', {
    pid: process.pid,
    nodeVersion: process.version,
    liveChartAffected: false,
    authorityBoundary: 'RESEARCH_ONLY',
    requiresHumanApproval: true,
  });

  // Startup delay — let the main server and scheduler stabilise first
  await new Promise(resolve => setTimeout(resolve, STARTUP_DELAY_MS));

  // Authority check
  if (!isDarwinObservationPermitted()) {
    log('WARN', 'DARWIN observation not permitted — monitor will poll but skip cycles until authority is active');
  } else {
    log('INFO', 'DARWIN observation permitted — monitor is active');
  }

  // Log strategy registry
  log('INFO', 'Strategy registry loaded', {
    strategies: Object.entries(STRATEGY_REGISTRY).map(([id, entry]) => ({
      id,
      name: entry.name,
      status: entry.status,
      fidelity: entry.fidelity,
    })),
    liveChartAffected: false,
  });

  // ─── Health check (every 60s) ─────────────────────────────────────────────
  const healthTimer = setInterval(() => {
    if (isShuttingDown) return;
    log('INFO', 'Health check', {
      pid: process.pid,
      uptime: process.uptime().toFixed(0) + 's',
      memoryMB: (process.memoryUsage().rss / 1024 / 1024).toFixed(1),
      liveChartAffected: false,
    });
  }, HEALTH_CHECK_INTERVAL_MS);
  activeTimers.push(healthTimer);

  // ─── Monitor cycle (every 15 min) ─────────────────────────────────────────
  const monitorTimer = setInterval(async () => {
    if (isShuttingDown) return;
    await runMonitorCycle();
  }, MONITOR_INTERVAL_MS);
  activeTimers.push(monitorTimer);

  // Run immediately on startup
  await runMonitorCycle();

  log('INFO', 'DARWIN Strategy Monitor is running', {
    monitorIntervalMs: MONITOR_INTERVAL_MS,
    healthCheckIntervalMs: HEALTH_CHECK_INTERVAL_MS,
    windowDays: MONITORING_WINDOW_DAYS,
    liveChartAffected: false,
  });
}

// ─── Graceful Shutdown ────────────────────────────────────────────────────────

function handleShutdown(signal: string): void {
  log('INFO', `Received ${signal} — initiating graceful shutdown`);
  isShuttingDown = true;

  for (const timer of activeTimers) {
    clearInterval(timer);
  }

  log('INFO', 'DARWIN Strategy Monitor shutdown complete', {
    signal,
    liveChartAffected: false,
  });

  process.exit(0);
}

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));

process.on('uncaughtException', (err) => {
  log('ERROR', 'Uncaught exception — monitor will restart via systemd', {
    error: err.message,
    stack: err.stack,
  });
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  log('ERROR', 'Unhandled rejection — monitor will restart via systemd', {
    reason: String(reason),
  });
  process.exit(1);
});

// ─── Start ────────────────────────────────────────────────────────────────────

runMonitorLoop().catch((err) => {
  log('ERROR', 'Fatal error in monitor loop', {
    error: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });
  process.exit(1);
});
