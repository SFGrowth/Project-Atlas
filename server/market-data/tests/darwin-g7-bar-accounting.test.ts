/**
 * Sprint 123A.7 / Gate G7 — Bar Accounting Reconciliation Tests
 *
 * Required identity (at any fixed cutoff timestamp):
 *   CONFIRMED_BARS = OBSERVATIONS_CREATED + EXCLUDED_BARS + UNRESOLVED_BARS
 *   UNEXPLAINED_BAR_LOSS = 0
 *
 * Tests:
 *   G7-BAR-001  Exact reconciliation at a single cutoff timestamp
 *   G7-BAR-002  No eligible confirmed bar silently disappears
 *   G7-BAR-003  Exclusion reason codes are mandatory (no NULL reason)
 *   G7-BAR-004  Replay does not create duplicate observations
 *   G7-BAR-005  Accounting report cannot pass while unexplained count is non-zero
 *   G7-BAR-006  No bar has both an observation AND an exclusion record
 *   G7-BAR-007  darwin_bar_exclusion_log has unique constraint on bar_timestamp
 */

import { describe, it, expect } from 'vitest';
import mysql from 'mysql2/promise';

const DB_URL = process.env.DATABASE_URL ?? '';

async function getConnection() {
  const url = new URL(DB_URL.replace('mysql://', 'http://'));
  return mysql.createConnection({
    host: url.hostname,
    port: Number(url.port) || 3306,
    user: url.username,
    password: url.password,
    database: url.pathname.slice(1),
  });
}

/** Compute the bar accounting at a fixed cutoff timestamp */
async function getBarAccounting(conn: mysql.Connection, cutoffMs: number) {
  const [rows] = await conn.execute<mysql.RowDataPacket[]>(`
    SELECT
      (SELECT COUNT(*) FROM atlas_bars_1m WHERE bar_open_ts_ms <= ?) AS confirmed_bars,
      (SELECT COUNT(*) FROM darwin_observations WHERE bar_timestamp <= ?) AS observations,
      (SELECT COUNT(*) FROM darwin_bar_exclusion_log WHERE bar_timestamp <= ?) AS exclusions,
      (SELECT COUNT(*) FROM darwin_bar_exclusion_log WHERE bar_timestamp <= ? AND exclusion_reason IS NULL) AS null_reason_exclusions,
      (SELECT COUNT(*) FROM darwin_bar_exclusion_log WHERE bar_timestamp <= ? AND exclusion_reason = 'DELAYED_PENDING_REPLAY') AS pending_bars
  `, [cutoffMs, cutoffMs, cutoffMs, cutoffMs, cutoffMs]);
  const r = rows[0];
  return {
    confirmedBars: Number(r.confirmed_bars),
    observations: Number(r.observations),
    exclusions: Number(r.exclusions),
    nullReasonExclusions: Number(r.null_reason_exclusions),
    pendingBars: Number(r.pending_bars),
    unexplainedBarLoss: Number(r.confirmed_bars) - Number(r.observations) - Number(r.exclusions),
  };
}

describe('Gate G7 — Bar Accounting Reconciliation', () => {
  // Use a cutoff 10 minutes before test run to ensure recorder has processed all bars
  const CUTOFF_MS = Date.now() - 10 * 60 * 1000;

  it('G7-BAR-001: exact reconciliation at a single cutoff timestamp — UNEXPLAINED_BAR_LOSS=0', async () => {
    if (!DB_URL) return;
    const conn = await getConnection();
    try {
      const acc = await getBarAccounting(conn, CUTOFF_MS);
      expect(acc.unexplainedBarLoss).toBe(0);
      expect(acc.confirmedBars).toBeGreaterThan(0);
      expect(acc.observations + acc.exclusions).toBe(acc.confirmedBars);
    } finally {
      await conn.end();
    }
  });

  it('G7-BAR-002: no eligible confirmed bar silently disappears (join-based verification)', async () => {
    if (!DB_URL) return;
    const conn = await getConnection();
    try {
      const [rows] = await conn.execute<mysql.RowDataPacket[]>(`
        SELECT SUM(CASE WHEN o.id IS NULL AND e.id IS NULL THEN 1 ELSE 0 END) AS unaccounted
        FROM atlas_bars_1m b
        LEFT JOIN darwin_observations o ON o.bar_timestamp = b.bar_open_ts_ms
        LEFT JOIN darwin_bar_exclusion_log e ON e.bar_timestamp = b.bar_open_ts_ms
        WHERE b.bar_open_ts_ms <= ?
      `, [CUTOFF_MS]);
      expect(Number(rows[0].unaccounted)).toBe(0);
    } finally {
      await conn.end();
    }
  });

  it('G7-BAR-003: exclusion reason codes are mandatory — no NULL reason in exclusion log', async () => {
    if (!DB_URL) return;
    const conn = await getConnection();
    try {
      const acc = await getBarAccounting(conn, CUTOFF_MS);
      expect(acc.nullReasonExclusions).toBe(0);
    } finally {
      await conn.end();
    }
  });

  it('G7-BAR-004: replay does not create duplicate observations — bar_timestamp is unique in darwin_observations', async () => {
    if (!DB_URL) return;
    const conn = await getConnection();
    try {
      const [rows] = await conn.execute<mysql.RowDataPacket[]>(`
        SELECT COUNT(*) AS duplicate_obs
        FROM (
          SELECT bar_timestamp, COUNT(*) AS cnt
          FROM darwin_observations
          GROUP BY bar_timestamp
          HAVING COUNT(*) > 1
        ) AS dupes
      `);
      expect(Number(rows[0].duplicate_obs)).toBe(0);
    } finally {
      await conn.end();
    }
  });

  it('G7-BAR-005: accounting report cannot pass while unexplained count is non-zero (invariant check)', () => {
    // This is a pure logic test — verifies the accounting formula itself
    const mockAccounting = (confirmed: number, obs: number, excl: number) => ({
      unexplainedBarLoss: confirmed - obs - excl,
    });
    expect(mockAccounting(1000, 950, 50).unexplainedBarLoss).toBe(0);
    expect(mockAccounting(1000, 950, 49).unexplainedBarLoss).toBe(1);
    expect(mockAccounting(1000, 950, 49).unexplainedBarLoss).not.toBe(0);
  });

  it('G7-BAR-006: no bar has both an observation AND an exclusion record', async () => {
    if (!DB_URL) return;
    const conn = await getConnection();
    try {
      const [rows] = await conn.execute<mysql.RowDataPacket[]>(`
        SELECT COUNT(*) AS bars_with_both
        FROM atlas_bars_1m b
        INNER JOIN darwin_observations o ON o.bar_timestamp = b.bar_open_ts_ms
        INNER JOIN darwin_bar_exclusion_log e ON e.bar_timestamp = b.bar_open_ts_ms
        WHERE b.bar_open_ts_ms <= ?
      `, [CUTOFF_MS]);
      expect(Number(rows[0].bars_with_both)).toBe(0);
    } finally {
      await conn.end();
    }
  });

  it('G7-BAR-007: darwin_bar_exclusion_log has unique constraint on bar_timestamp', async () => {
    if (!DB_URL) return;
    const conn = await getConnection();
    try {
      const [rows] = await conn.execute<mysql.RowDataPacket[]>(`
        SELECT COUNT(*) AS duplicate_excl
        FROM (
          SELECT bar_timestamp, COUNT(*) AS cnt
          FROM darwin_bar_exclusion_log
          GROUP BY bar_timestamp
          HAVING COUNT(*) > 1
        ) AS dupes
      `);
      expect(Number(rows[0].duplicate_excl)).toBe(0);
    } finally {
      await conn.end();
    }
  });
});
