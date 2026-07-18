/**
 * Atlas Databento Bridge Readiness Reporter
 * Sprint 123A.2 — Databento Adapter and Private Bridge
 *
 * Provides a readiness endpoint and health summary for the Databento bridge.
 * Consumed by the Atlas health check route (/api/health/databento-bridge).
 *
 * AUTHORITY NOTE
 * --------------
 * This module reports status only. It does not change the authority mode,
 * trigger any processing, or activate any Databento capability.
 *
 * Sprint 123A.2 — Shadow mode only. No authority changes.
 */

import { DatabentoBridgeServer, BridgeServerStats } from './bridge-server.js';
import { FeedHealthMonitor } from './feed-health.js';
import { getMarketDataAuthority } from './config.js';

// ── Readiness status ───────────────────────────────────────────────────────────

export type BridgeReadinessStatus =
  | 'DISABLED'          // TRADINGVIEW_ONLY — bridge not started
  | 'STARTING'          // Bridge server started, no Python adapter connected yet
  | 'CONNECTED'         // Python adapter connected, records flowing
  | 'DEGRADED'          // Connected but no records in last 60s
  | 'DISCONNECTED'      // Python adapter was connected but dropped
  | 'ERROR';            // Bridge server error

export interface BridgeReadinessReport {
  status: BridgeReadinessStatus;
  authorityMode: string;
  bridgeServer: BridgeServerStats | null;
  feedHealthState: string;
  lastRecordAgeMs: number | null;
  symbolsResolved: number;
  sprint: string;
  ts: number;
}

// ── Readiness reporter ─────────────────────────────────────────────────────────

export class BridgeReadinessReporter {
  private readonly bridgeServer: DatabentoBridgeServer | null;
  private readonly feedHealth: FeedHealthMonitor;
  private symbolsResolved = 0;

  constructor(
    bridgeServer: DatabentoBridgeServer | null,
    feedHealth: FeedHealthMonitor,
  ) {
    this.bridgeServer = bridgeServer;
    this.feedHealth = feedHealth;
  }

  /**
   * Update the count of symbols resolved by the Python adapter.
   * Called when a definition or symbol-mapping record is received.
   */
  setSymbolsResolved(count: number): void {
    this.symbolsResolved = count;
  }

  /**
   * Produce a readiness report for the bridge.
   */
  getReport(): BridgeReadinessReport {
    const authority = getMarketDataAuthority();
    const ts = Date.now();

    if (authority === 'TRADINGVIEW_ONLY' || !this.bridgeServer) {
      return {
        status: 'DISABLED',
        authorityMode: authority,
        bridgeServer: null,
        feedHealthState: 'N/A',
        lastRecordAgeMs: null,
        symbolsResolved: 0,
        sprint: '123A.2',
        ts,
      };
    }

    const stats = this.bridgeServer.getStats();
    const feedState = this.feedHealth.getState('databento');
    const lastRecordAgeMs = stats.lastRecordTs !== null
      ? ts - stats.lastRecordTs
      : null;

    let status: BridgeReadinessStatus;
    if (!stats.isRunning) {
      status = 'ERROR';
    } else if (stats.connectedClients === 0) {
      status = 'STARTING';
    } else if (lastRecordAgeMs !== null && lastRecordAgeMs > 60_000) {
      status = 'DEGRADED';
    } else if (feedState === 'OFFLINE' || feedState === 'FALLBACK_ACTIVE') {
      status = 'DISCONNECTED';
    } else {
      status = 'CONNECTED';
    }

    return {
      status,
      authorityMode: authority,
      bridgeServer: stats,
      feedHealthState: feedState ?? 'UNKNOWN',
      lastRecordAgeMs,
      symbolsResolved: this.symbolsResolved,
      sprint: '123A.2',
      ts,
    };
  }

  /**
   * Return true if the bridge is ready to receive records.
   * Used by the health check endpoint.
   */
  isReady(): boolean {
    const report = this.getReport();
    return report.status === 'CONNECTED';
  }
}

/**
 * Format a readiness report as a human-readable summary for logs.
 */
export function formatReadinessReport(report: BridgeReadinessReport): string {
  return [
    `[BridgeReadiness] status=${report.status}`,
    `authority=${report.authorityMode}`,
    `feedHealth=${report.feedHealthState}`,
    `clients=${report.bridgeServer?.connectedClients ?? 0}`,
    `records=${report.bridgeServer?.recordsReceived ?? 0}`,
    `lastRecordAge=${report.lastRecordAgeMs !== null ? `${report.lastRecordAgeMs}ms` : 'N/A'}`,
    `symbols=${report.symbolsResolved}`,
  ].join(' ');
}
