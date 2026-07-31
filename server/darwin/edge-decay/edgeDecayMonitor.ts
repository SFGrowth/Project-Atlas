/**
 * DARWIN Edge Decay Monitor
 * Sprint: darwin-complete-edge-search-universe
 * Created: 2026-07-31T01:18:00Z
 * Status: LOCAL ONLY — not deployed until soak completion and evidence lock
 *
 * Tracks rolling performance for PROMISING+ findings.
 * Detects edge decay and notifies Phil via Telegram.
 * NO automatic trading changes are made.
 */

import { db } from '../../_core/db';
import { sendTelegramNotification } from '../../_core/telegramNotifier';

export type DecayStatus = 'STABLE' | 'WATCH' | 'DEGRADED' | 'RETIRED';

export interface DecayWindow {
  hypothesis_id: string;
  window_start: Date;
  window_end: Date;
  rolling_expectancy: number | null;
  rolling_win_rate: number | null;
  rolling_profit_factor: number | null;
  signal_frequency: number | null;
  mfe_avg: number | null;
  mae_avg: number | null;
  ci_lower: number | null;
  ci_upper: number | null;
  decay_status: DecayStatus;
}

/**
 * Compute the decay status for a rolling window.
 */
export function computeDecayStatus(window: Omit<DecayWindow, 'decay_status'>): DecayStatus {
  if (window.rolling_expectancy === null) return 'STABLE';

  // RETIRED: persistently negative expectancy
  if (window.rolling_expectancy < -0.01) return 'DEGRADED';

  // DEGRADED: negative expectancy or CI lower below zero
  if (window.rolling_expectancy < 0) return 'DEGRADED';
  if (window.ci_lower !== null && window.ci_lower < 0) return 'WATCH';

  return 'STABLE';
}

/**
 * Record a new decay window for a hypothesis.
 */
export async function recordDecayWindow(window: DecayWindow): Promise<void> {
  await db.execute(
    `INSERT INTO darwin_edge_decay_monitor (
      hypothesis_id, window_start, window_end,
      rolling_expectancy, rolling_win_rate, rolling_profit_factor,
      signal_frequency, mfe_avg, mae_avg,
      ci_lower, ci_upper, decay_status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      window.hypothesis_id,
      window.window_start,
      window.window_end,
      window.rolling_expectancy,
      window.rolling_win_rate,
      window.rolling_profit_factor,
      window.signal_frequency,
      window.mfe_avg,
      window.mae_avg,
      window.ci_lower,
      window.ci_upper,
      window.decay_status,
    ]
  );

  // Send Telegram notification for DEGRADED status
  if (window.decay_status === 'DEGRADED') {
    await sendTelegramNotification(
      `⚠️ EDGE DECAY ALERT: ${window.hypothesis_id}\n` +
      `Rolling expectancy: ${window.rolling_expectancy?.toFixed(4)}\n` +
      `Window: ${window.window_start.toISOString().slice(0, 10)} → ${window.window_end.toISOString().slice(0, 10)}\n` +
      `No automatic changes made. Review required.`
    );
  }
}

/**
 * Get the current decay status for all PROMISING+ hypotheses.
 */
export async function getAllDecayStatuses(): Promise<Array<{ hypothesis_id: string; decay_status: DecayStatus; last_window: Date | null }>> {
  const [rows] = await db.execute(
    `SELECT h.hypothesis_id,
            COALESCE(latest.decay_status, 'STABLE') AS decay_status,
            latest.window_end AS last_window
     FROM darwin_hypotheses h
     LEFT JOIN (
       SELECT hypothesis_id, decay_status, window_end,
              ROW_NUMBER() OVER (PARTITION BY hypothesis_id ORDER BY window_end DESC) AS rn
       FROM darwin_edge_decay_monitor
     ) latest ON latest.hypothesis_id = h.hypothesis_id AND latest.rn = 1
     WHERE h.status IN ('PROMISING', 'SUPPORTED')`
  );
  return rows as any[];
}
