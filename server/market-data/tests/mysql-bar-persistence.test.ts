/**
 * mysql-bar-persistence.test.ts — Real MySQL 8 Persistence Tests (Gate G3 Revision 3)
 *
 * Tests run against a disposable MySQL 8 instance at /tmp/mysql_test.sock
 * with migrations 0026 and 0027 applied. No production connection.
 *
 * Test suites:
 *   PER001–PER008: Basic persistence (canonical identity, ON DUPLICATE KEY UPDATE)
 *   PER009–PER017: Canonical identity — 8 identity dimension tests
 *   PER018–PER026: Failure-path — 9 tests proving non-duplicate errors fail loudly
 *   PER027–PER031: UNRESOLVED bar policy — 5 tests
 *
 * Sprint 123A.3 — Gate G3 Revision 3
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import * as mysql from 'mysql2/promise';
import { BarLifecycle, FiveMinBarType, ReconciliationStatus } from '../types/bar-lifecycle.js';

// ─── MySQL connection ─────────────────────────────────────────────────────────

let pool: mysql.Pool;

beforeAll(async () => {
  pool = mysql.createPool({
    socketPath: '/tmp/mysql_test.sock',
    user: 'root',
    database: 'atlas_test_123a3',
    connectionLimit: 5,
  });
  const conn = await pool.getConnection();
  await conn.ping();
  conn.release();
});

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await pool.execute('DELETE FROM atlas_bar_processing_ledger');
  await pool.execute('DELETE FROM atlas_bars_5m');
  await pool.execute('DELETE FROM atlas_bars_1m');
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

const BASE_TS = 1_705_323_600_000; // 2024-01-15 14:00:00 UTC

async function insert1m(overrides: Record<string, unknown> = {}): Promise<mysql.ResultSetHeader> {
  const defaults = {
    source: 'DATABENTO', dataset: 'GLBX.MDP3', raw_symbol: 'MNQM5',
    instrument_id: 10001, bar_open_ts_ms: BASE_TS,
    bar_open_ts_ns: String(BigInt(BASE_TS) * 1_000_000n),
    bar_close_ts_ms: BASE_TS + 60000,
    open_price_pts100: 1900000, high_price_pts100: 1901000,
    low_price_pts100: 1899000, close_price_pts100: 1900500,
    volume: 100, trade_count: 50,
    reconciliation_status: 'MATCHED',
    recon_close_delta_pts100: 0, recon_high_delta_pts100: 0,
    recon_low_delta_pts100: 0, recon_volume_delta: 0,
    recon_within_tolerance: 1, recon_tolerance_pts100: 25,
    revision: 0, mapping_version: 'v1', atlas_ts_ms: BASE_TS + 1,
    ...overrides,
  };
  const cols = Object.keys(defaults).join(', ');
  const placeholders = Object.keys(defaults).map(() => '?').join(', ');
  const [result] = await pool.execute<mysql.ResultSetHeader>(
    `INSERT INTO atlas_bars_1m (${cols}) VALUES (${placeholders}) ON DUPLICATE KEY UPDATE id = id`,
    Object.values(defaults),
  );
  return result;
}

async function insert5m(overrides: Record<string, unknown> = {}): Promise<mysql.ResultSetHeader> {
  const defaults = {
    source: 'DATABENTO', dataset: 'GLBX.MDP3', raw_symbol: 'MNQM5',
    instrument_id: 10001, bar_open_ts_ms: BASE_TS,
    bar_close_ts_ms: BASE_TS + 300000,
    open_price_pts100: 1900000, high_price_pts100: 1905000,
    low_price_pts100: 1895000, close_price_pts100: 1902000,
    volume: 500, trade_count: 250, minute_bar_count: 5,
    canonical_bar_type: 'LIVE_CONFIRMED',
    revision: 0, mapping_version: 'v1', atlas_ts_ms: BASE_TS + 1,
    ...overrides,
  };
  const cols = Object.keys(defaults).join(', ');
  const placeholders = Object.keys(defaults).map(() => '?').join(', ');
  const [result] = await pool.execute<mysql.ResultSetHeader>(
    `INSERT INTO atlas_bars_5m (${cols}) VALUES (${placeholders}) ON DUPLICATE KEY UPDATE id = id`,
    Object.values(defaults),
  );
  return result;
}

// ─── PER001–PER008: Basic Persistence ────────────────────────────────────────

describe('Basic Persistence (ON DUPLICATE KEY UPDATE)', () => {
  it('TEST-123A3-PER001: migrations 0026 and 0027 tables exist', async () => {
    const [rows] = await pool.execute<mysql.RowDataPacket[]>('SHOW TABLES');
    const names = rows.map((r) => Object.values(r)[0] as string);
    expect(names).toContain('atlas_bars_1m');
    expect(names).toContain('atlas_bars_5m');
    expect(names).toContain('atlas_bar_processing_ledger');
    expect(names).toContain('atlas_canonical_bars');
  });

  it('TEST-123A3-PER002: insert 1m bar returns affectedRows=1', async () => {
    const result = await insert1m();
    expect(result.affectedRows).toBe(1);
    expect(result.insertId).toBeGreaterThan(0);
  });

  it('TEST-123A3-PER003: exact duplicate 1m bar is idempotent (ON DUPLICATE KEY no-op)', async () => {
    // MySQL 8.0 ON DUPLICATE KEY UPDATE returns affectedRows=1 when the row is found
    // but no column values change ("found but not modified"). The critical invariant
    // is that only ONE row exists in the table, not that affectedRows is 0.
    await insert1m();
    const result = await insert1m(); // exact duplicate
    // affectedRows is 1 (found, no change) — this is MySQL 8.0 behaviour for ON DUPLICATE KEY
    expect(result.affectedRows).toBeLessThanOrEqual(1);
    const [rows] = await pool.execute<mysql.RowDataPacket[]>('SELECT COUNT(*) as cnt FROM atlas_bars_1m');
    expect(rows[0].cnt).toBe(1); // Only ONE row — the key invariant
  });

  it('TEST-123A3-PER004: insert 5m bar returns affectedRows=1', async () => {
    const result = await insert5m();
    expect(result.affectedRows).toBe(1);
  });

  it('TEST-123A3-PER005: exact duplicate 5m bar is idempotent (ON DUPLICATE KEY no-op)', async () => {
    await insert5m();
    const result = await insert5m();
    expect(result.affectedRows).toBeLessThanOrEqual(1);
    const [rows] = await pool.execute<mysql.RowDataPacket[]>('SELECT COUNT(*) as cnt FROM atlas_bars_5m');
    expect(rows[0].cnt).toBe(1);
  });

  it('TEST-123A3-PER006: bar_open_ts_ms precision preserved (milliseconds)', async () => {
    const ts = BASE_TS + 60000;
    await insert1m({ bar_open_ts_ms: ts, bar_close_ts_ms: ts + 60000 });
    const [rows] = await pool.execute<mysql.RowDataPacket[]>(
      'SELECT bar_open_ts_ms FROM atlas_bars_1m WHERE bar_open_ts_ms = ?', [ts],
    );
    expect(Number(rows[0].bar_open_ts_ms)).toBe(ts);
  });

  it('TEST-123A3-PER007: atlas_canonical_bars is NOT written by this adapter', async () => {
    await insert1m();
    const [rows] = await pool.execute<mysql.RowDataPacket[]>('SELECT COUNT(*) as cnt FROM atlas_canonical_bars');
    expect(rows[0].cnt).toBe(0);
  });

  it('TEST-123A3-PER008: migration 0027 unique key includes raw_symbol', async () => {
    const [rows] = await pool.execute<mysql.RowDataPacket[]>(
      "SHOW INDEX FROM atlas_bars_1m WHERE Key_name = 'uq_atlas_bars_1m_canonical_identity'",
    );
    const cols = (rows as mysql.RowDataPacket[]).map((r) => r.Column_name);
    expect(cols).toContain('raw_symbol');
    expect(cols).toContain('source');
    expect(cols).toContain('dataset');
    expect(cols).toContain('instrument_id');
    expect(cols).toContain('bar_open_ts_ms');
    expect(cols).toContain('revision');
    expect(cols).toContain('mapping_version');
  });
});

// ─── PER009–PER017: Canonical Identity Dimensions ────────────────────────────

describe('Canonical Identity Dimensions', () => {
  it('TEST-123A3-PER009: exact replay duplicate is idempotently ignored', async () => {
    await insert1m();
    const r2 = await insert1m();
    expect(r2.affectedRows).toBeLessThanOrEqual(1); // MySQL 8.0: 1 = found/no-change
    const [rows] = await pool.execute<mysql.RowDataPacket[]>('SELECT COUNT(*) as cnt FROM atlas_bars_1m');
    expect(rows[0].cnt).toBe(1); // Only ONE row — the key invariant
  });

  it('TEST-123A3-PER010: different revision is not suppressed', async () => {
    await insert1m({ revision: 0 });
    const r2 = await insert1m({ revision: 1 });
    expect(r2.affectedRows).toBe(1);
    const [rows] = await pool.execute<mysql.RowDataPacket[]>('SELECT COUNT(*) as cnt FROM atlas_bars_1m');
    expect(rows[0].cnt).toBe(2);
  });

  it('TEST-123A3-PER011: different mapping_version is not suppressed', async () => {
    await insert1m({ mapping_version: 'v1' });
    const r2 = await insert1m({ mapping_version: 'v2' });
    expect(r2.affectedRows).toBe(1);
    const [rows] = await pool.execute<mysql.RowDataPacket[]>('SELECT COUNT(*) as cnt FROM atlas_bars_1m');
    expect(rows[0].cnt).toBe(2);
  });

  it('TEST-123A3-PER012: different raw_symbol (contract roll) is not suppressed', async () => {
    await insert1m({ raw_symbol: 'MNQM5' });
    const r2 = await insert1m({ raw_symbol: 'MNQU5', instrument_id: 10002 });
    expect(r2.affectedRows).toBe(1);
    const [rows] = await pool.execute<mysql.RowDataPacket[]>(
      'SELECT raw_symbol FROM atlas_bars_1m ORDER BY raw_symbol',
    );
    expect(rows.map((r) => r.raw_symbol)).toEqual(['MNQM5', 'MNQU5']);
  });

  it('TEST-123A3-PER013: same instrument and timestamp across different datasets do not collide', async () => {
    await insert1m({ dataset: 'GLBX.MDP3' });
    const r2 = await insert1m({ dataset: 'XNAS.ITCH' });
    expect(r2.affectedRows).toBe(1);
    const [rows] = await pool.execute<mysql.RowDataPacket[]>('SELECT COUNT(*) as cnt FROM atlas_bars_1m');
    expect(rows[0].cnt).toBe(2);
  });

  it('TEST-123A3-PER014: 1m and 5m records cannot collide (separate tables)', async () => {
    await insert1m();
    await insert5m();
    const [r1] = await pool.execute<mysql.RowDataPacket[]>('SELECT COUNT(*) as cnt FROM atlas_bars_1m');
    const [r5] = await pool.execute<mysql.RowDataPacket[]>('SELECT COUNT(*) as cnt FROM atlas_bars_5m');
    expect(r1[0].cnt).toBe(1);
    expect(r5[0].cnt).toBe(1);
  });

  it('TEST-123A3-PER015: contract roll cannot overwrite previous contract bar at same timestamp', async () => {
    await insert1m({ raw_symbol: 'MNQM5' });
    const r2 = await insert1m({ raw_symbol: 'MNQU5', instrument_id: 10002 });
    expect(r2.affectedRows).toBe(1);
    const [rows] = await pool.execute<mysql.RowDataPacket[]>(
      'SELECT raw_symbol FROM atlas_bars_1m ORDER BY raw_symbol',
    );
    expect(rows.map((r) => r.raw_symbol)).toEqual(['MNQM5', 'MNQU5']);
  });

  it('TEST-123A3-PER016: consumer ledger identity includes consumer_name and consumer_version', async () => {
    await pool.execute(
      `INSERT INTO atlas_bar_processing_ledger
         (source, dataset, raw_symbol, instrument_id, bar_open_ts_ms, revision, mapping_version,
          consumer_name, consumer_version, processed_at_ms, atlas_ts_ms)
       VALUES ('DATABENTO','GLBX.MDP3','MNQM5',10001,?,0,'v1','parity-monitor','v1',?,?)`,
      [BASE_TS, BASE_TS, BASE_TS],
    );
    await pool.execute(
      `INSERT INTO atlas_bar_processing_ledger
         (source, dataset, raw_symbol, instrument_id, bar_open_ts_ms, revision, mapping_version,
          consumer_name, consumer_version, processed_at_ms, atlas_ts_ms)
       VALUES ('DATABENTO','GLBX.MDP3','MNQM5',10001,?,0,'v1','parity-monitor','v2',?,?)`,
      [BASE_TS, BASE_TS, BASE_TS],
    );
    const [rows] = await pool.execute<mysql.RowDataPacket[]>('SELECT COUNT(*) as cnt FROM atlas_bar_processing_ledger');
    expect(rows[0].cnt).toBe(2);
  });

  it('TEST-123A3-PER017: ON DUPLICATE KEY does not throw, row count stays at 1', async () => {
    await insert1m();
    const result = await insert1m(); // duplicate
    // Does not throw — the key invariant
    expect(result.affectedRows).toBeLessThanOrEqual(1);
    const [rows] = await pool.execute<mysql.RowDataPacket[]>('SELECT COUNT(*) as cnt FROM atlas_bars_1m');
    expect(rows[0].cnt).toBe(1);
  });
});

// ─── PER018–PER026: Failure-Path Tests ───────────────────────────────────────

describe('Failure-Path Tests (non-duplicate errors must fail loudly)', () => {
  it('TEST-123A3-PER018: malformed numeric value fails', async () => {
    await expect(
      pool.execute(
        `INSERT INTO atlas_bars_1m (source, dataset, raw_symbol, instrument_id, bar_open_ts_ms,
           bar_open_ts_ns, bar_close_ts_ms, reconciliation_status, revision, mapping_version, atlas_ts_ms)
         VALUES ('DATABENTO','GLBX.MDP3','MNQM5','not_a_number',?,?,?,'MATCHED',0,'v1',?)`,
        [BASE_TS + 1000, '0', BASE_TS + 61000, BASE_TS],
      ),
    ).rejects.toThrow();
  });

  it('TEST-123A3-PER019: invalid enum value fails', async () => {
    await expect(
      pool.execute(
        `INSERT INTO atlas_bars_1m (source, dataset, raw_symbol, instrument_id, bar_open_ts_ms,
           bar_open_ts_ns, bar_close_ts_ms, reconciliation_status, revision, mapping_version, atlas_ts_ms)
         VALUES ('DATABENTO','GLBX.MDP3','MNQM5',10001,?,?,?,'INVALID_STATUS',0,'v1',?)`,
        [BASE_TS + 2000, '0', BASE_TS + 62000, BASE_TS],
      ),
    ).rejects.toThrow();
  });

  it('TEST-123A3-PER020: NOT NULL violation fails (missing atlas_ts_ms)', async () => {
    await expect(
      pool.execute(
        `INSERT INTO atlas_bars_1m (source, dataset, raw_symbol, instrument_id, bar_open_ts_ms,
           bar_open_ts_ns, bar_close_ts_ms, reconciliation_status, revision, mapping_version)
         VALUES ('DATABENTO','GLBX.MDP3','MNQM5',10001,?,?,?,'MATCHED',0,'v1')`,
        [BASE_TS + 3000, '0', BASE_TS + 63000],
      ),
    ).rejects.toThrow();
  });

  it('TEST-123A3-PER021: foreign-key violation fails (atlas_consumer_processing_ledger)', async () => {
    await expect(
      pool.execute(
        `INSERT INTO atlas_consumer_processing_ledger
           (canonical_bar_id, consumer_name, processed_at_ms, atlas_ts_ms)
         VALUES (999999, 'test-consumer', ?, ?)`,
        [BASE_TS, BASE_TS],
      ),
    ).rejects.toThrow();
  });

  it('TEST-123A3-PER022: unexpected SQL error rolls back transaction', async () => {
    const conn = await pool.getConnection();
    await conn.beginTransaction();
    try {
      await conn.execute(
        `INSERT INTO atlas_bars_1m (source, dataset, raw_symbol, instrument_id, bar_open_ts_ms,
           bar_open_ts_ns, bar_close_ts_ms, reconciliation_status, revision, mapping_version, atlas_ts_ms)
         VALUES ('DATABENTO','GLBX.MDP3','MNQM5',10001,?,?,?,'MATCHED',0,'v1',?)`,
        [BASE_TS + 4000, '0', BASE_TS + 64000, BASE_TS],
      );
      await conn.execute('SELECT * FROM nonexistent_table_xyz_abc');
      await conn.commit();
    } catch {
      await conn.rollback();
    } finally {
      conn.release();
    }
    const [rows] = await pool.execute<mysql.RowDataPacket[]>(
      'SELECT COUNT(*) as cnt FROM atlas_bars_1m WHERE bar_open_ts_ms = ?', [BASE_TS + 4000],
    );
    expect(rows[0].cnt).toBe(0);
  });

  it('TEST-123A3-PER023: invalid enum is not silently converted to success', async () => {
    let threw = false;
    try {
      await pool.execute(
        `INSERT INTO atlas_bars_1m (source, dataset, raw_symbol, instrument_id, bar_open_ts_ms,
           bar_open_ts_ns, bar_close_ts_ms, reconciliation_status, revision, mapping_version, atlas_ts_ms)
         VALUES ('DATABENTO','GLBX.MDP3','MNQM5',10001,?,?,?,'GARBAGE_VALUE',0,'v1',?)`,
        [BASE_TS + 5000, '0', BASE_TS + 65000, BASE_TS],
      );
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
    const [rows] = await pool.execute<mysql.RowDataPacket[]>(
      'SELECT COUNT(*) as cnt FROM atlas_bars_1m WHERE bar_open_ts_ms = ?', [BASE_TS + 5000],
    );
    expect(rows[0].cnt).toBe(0);
  });

  it('TEST-123A3-PER024: zero unexpected SQL warnings after clean insert', async () => {
    await insert1m({ bar_open_ts_ms: BASE_TS + 6000, bar_close_ts_ms: BASE_TS + 66000 });
    // SHOW WARNINGS is not supported in prepared-statement protocol; use pool.query() instead
    const [warnings] = await pool.query<mysql.RowDataPacket[]>('SHOW WARNINGS');
    expect(warnings.length).toBe(0);
  });

  it('TEST-123A3-PER025: zero unexpected SQL warnings after duplicate insert', async () => {
    const ts = BASE_TS + 7000;
    await insert1m({ bar_open_ts_ms: ts, bar_close_ts_ms: ts + 60000 });
    await insert1m({ bar_open_ts_ms: ts, bar_close_ts_ms: ts + 60000 }); // duplicate
    const [warnings] = await pool.query<mysql.RowDataPacket[]>('SHOW WARNINGS');
    expect(warnings.length).toBe(0);
  });

  it('TEST-123A3-PER026: 5m CONTAINS_UNRESOLVED enum value is rejected', async () => {
    await expect(
      pool.execute(
        `INSERT INTO atlas_bars_5m (source, dataset, raw_symbol, instrument_id, bar_open_ts_ms,
           bar_close_ts_ms, minute_bar_count, canonical_bar_type, revision, mapping_version, atlas_ts_ms)
         VALUES ('DATABENTO','GLBX.MDP3','MNQM5',10001,?,?,5,'CONTAINS_UNRESOLVED',0,'v1',?)`,
        [BASE_TS + 8000, BASE_TS + 308000, BASE_TS],
      ),
    ).rejects.toThrow();
  });
});

// ─── PER027–PER031: UNRESOLVED Bar Policy ────────────────────────────────────

describe('UNRESOLVED Bar Policy', () => {
  it('TEST-123A3-PER027: UNRESOLVED evidence row may be retained in atlas_bars_1m', async () => {
    const ts = BASE_TS + 9000;
    await insert1m({ bar_open_ts_ms: ts, bar_close_ts_ms: ts + 60000, reconciliation_status: 'UNMATCHED', recon_within_tolerance: 0 });
    const [rows] = await pool.execute<mysql.RowDataPacket[]>(
      'SELECT reconciliation_status FROM atlas_bars_1m WHERE bar_open_ts_ms = ?', [ts],
    );
    expect(rows[0].reconciliation_status).toBe('UNMATCHED');
  });

  it('TEST-123A3-PER028: UNRESOLVED row excluded from confirmed-bar query', async () => {
    await insert1m({ bar_open_ts_ms: BASE_TS + 10000, bar_close_ts_ms: BASE_TS + 70000, reconciliation_status: 'UNMATCHED' });
    await insert1m({ bar_open_ts_ms: BASE_TS + 11000, bar_close_ts_ms: BASE_TS + 71000, reconciliation_status: 'MATCHED' });
    const [rows] = await pool.execute<mysql.RowDataPacket[]>(
      "SELECT COUNT(*) as cnt FROM atlas_bars_1m WHERE reconciliation_status = 'MATCHED'",
    );
    expect(rows[0].cnt).toBe(1);
  });

  it('TEST-123A3-PER029: recovered confirmed revision stored separately (revision+1)', async () => {
    const ts = BASE_TS + 12000;
    await insert1m({ bar_open_ts_ms: ts, bar_close_ts_ms: ts + 60000, reconciliation_status: 'UNMATCHED', revision: 0 });
    const r2 = await insert1m({ bar_open_ts_ms: ts, bar_close_ts_ms: ts + 60000, reconciliation_status: 'MATCHED', revision: 1 });
    expect(r2.affectedRows).toBe(1);
    const [rows] = await pool.execute<mysql.RowDataPacket[]>(
      'SELECT revision, reconciliation_status FROM atlas_bars_1m WHERE bar_open_ts_ms = ? ORDER BY revision', [ts],
    );
    expect(rows).toHaveLength(2);
    expect(rows[0].revision).toBe(0);
    expect(rows[0].reconciliation_status).toBe('UNMATCHED');
    expect(rows[1].revision).toBe(1);
    expect(rows[1].reconciliation_status).toBe('MATCHED');
  });

  it('TEST-123A3-PER030: UNRESOLVED and recovered rows do not collide', async () => {
    const ts = BASE_TS + 13000;
    const r1 = await insert1m({ bar_open_ts_ms: ts, bar_close_ts_ms: ts + 60000, reconciliation_status: 'UNMATCHED', revision: 0 });
    const r2 = await insert1m({ bar_open_ts_ms: ts, bar_close_ts_ms: ts + 60000, reconciliation_status: 'MATCHED', revision: 1 });
    expect(r1.affectedRows).toBe(1);
    expect(r2.affectedRows).toBe(1);
    expect(r1.insertId).not.toBe(r2.insertId);
  });

  it('TEST-123A3-PER031: only CONFIRMED revision can complete a blocked 5m window (CONTAINS_UNRESOLVED rejected)', async () => {
    // CONTAINS_UNRESOLVED is intentionally absent from atlas_bars_5m canonical_bar_type ENUM
    await expect(
      pool.execute(
        `INSERT INTO atlas_bars_5m (source, dataset, raw_symbol, instrument_id, bar_open_ts_ms,
           bar_close_ts_ms, minute_bar_count, canonical_bar_type, revision, mapping_version, atlas_ts_ms)
         VALUES ('DATABENTO','GLBX.MDP3','MNQM5',10001,?,?,5,'CONTAINS_UNRESOLVED',0,'v1',?)`,
        [BASE_TS + 14000, BASE_TS + 314000, BASE_TS],
      ),
    ).rejects.toThrow();
    // RECOVERED is valid — a blocked window unblocked by recovery
    const r = await insert5m({ bar_open_ts_ms: BASE_TS + 14000, bar_close_ts_ms: BASE_TS + 314000, canonical_bar_type: 'RECOVERED', revision: 1 });
    expect(r.affectedRows).toBe(1);
  });
});
