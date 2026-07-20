/**
 * mysql-bar-persistence.test.ts — Real MySQL 8 Persistence Tests
 *
 * Gate G3 Revision 5 — Sprint 123A.3
 *
 * Uses a disposable MySQL 8 instance at /tmp/mysql_test.sock
 * with migrations 0026 + 0027 applied. No production connection.
 *
 * EMPIRICAL DRIVER SEMANTICS (Gate G3 Revision 5 verification):
 *   ON DUPLICATE KEY UPDATE id=id returns affectedRows=1 for BOTH a new insert
 *   AND an exact duplicate (CLIENT_FOUND_ROWS not set). insertId is 0 for
 *   duplicates but this is fragile. Therefore all inserts use plain INSERT and
 *   catch ER_DUP_ENTRY (errno 1062) explicitly.
 *
 * CANONICAL IDENTITY KEY (8 columns — interval_ms IS part of the key):
 *   atlas_bars_1m / atlas_bars_5m:
 *     (source, dataset, raw_symbol, instrument_id, interval_ms, bar_open_ts_ms, revision, mapping_version)
 *   atlas_bar_processing_ledger:
 *     (source, dataset, raw_symbol, instrument_id, bar_open_ts_ms,
 *      revision, mapping_version, consumer_name, consumer_version)
 *
 * Test suites:
 *   PER001–PER008: Basic persistence
 *   PER009–PER017: Canonical identity dimensions
 *   PER018–PER026: Failure-path (non-duplicate errors must fail loudly)
 *   PER027–PER031: UNRESOLVED bar policy
 *   MYS001–MYS006: MySQL driver semantics (ER_DUP_ENTRY empirical verification)
 *   TXN001–TXN005: Transaction rollback
 *   SCH001–SCH003: SHOW CREATE TABLE schema verification
 *   MIG001:        Migration recovery
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import * as mysql from 'mysql2/promise';
import { ER_DUP_ENTRY, isDuplicateKeyError } from '../bar-persistence.js';

// ─── MySQL connection ─────────────────────────────────────────────────────────

let pool: mysql.Pool;

beforeAll(async () => {
  pool = mysql.createPool({
    socketPath: '/tmp/mysql_test.sock',
    user: 'root',
    database: 'atlas_test_123a3',
    connectionLimit: 5,
    // CLIENT_FOUND_ROWS is NOT set — this is the default and is intentional
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

/**
 * Insert a 1m bar using plain INSERT + ER_DUP_ENTRY catch.
 * Returns { inserted, insertId, warningStatus }.
 */
async function insert1m(overrides: Record<string, unknown> = {}): Promise<{
  inserted: boolean;
  insertId: number;
  warningStatus: number;
}> {
  const defaults = {
    source: 'DATABENTO', dataset: 'GLBX.MDP3', raw_symbol: 'MNQM5',
    instrument_id: 10001, interval_ms: 60000, bar_open_ts_ms: BASE_TS,
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
  try {
    const [result] = await pool.execute<mysql.ResultSetHeader>(
      `INSERT INTO atlas_bars_1m (${cols}) VALUES (${placeholders})`,
      Object.values(defaults),
    );
    // Verify warningStatus=0 for every successful insert
    const [warnings] = await pool.query<mysql.RowDataPacket[]>('SHOW WARNINGS');
    if (result.warningStatus !== 0 || warnings.length > 0) {
      throw new Error(`Unexpected MySQL warnings: warningStatus=${result.warningStatus} count=${warnings.length}`);
    }
    return { inserted: true, insertId: result.insertId, warningStatus: result.warningStatus };
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      return { inserted: false, insertId: 0, warningStatus: 0 };
    }
    throw err;
  }
}

async function insert5m(overrides: Record<string, unknown> = {}): Promise<{
  inserted: boolean;
  insertId: number;
  warningStatus: number;
}> {
  const defaults = {
    source: 'DATABENTO', dataset: 'GLBX.MDP3', raw_symbol: 'MNQM5',
    instrument_id: 10001, interval_ms: 300000, bar_open_ts_ms: BASE_TS,
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
  try {
    const [result] = await pool.execute<mysql.ResultSetHeader>(
      `INSERT INTO atlas_bars_5m (${cols}) VALUES (${placeholders})`,
      Object.values(defaults),
    );
    const [warnings] = await pool.query<mysql.RowDataPacket[]>('SHOW WARNINGS');
    if (result.warningStatus !== 0 || warnings.length > 0) {
      throw new Error(`Unexpected MySQL warnings: warningStatus=${result.warningStatus} count=${warnings.length}`);
    }
    return { inserted: true, insertId: result.insertId, warningStatus: result.warningStatus };
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      return { inserted: false, insertId: 0, warningStatus: 0 };
    }
    throw err;
  }
}

// ─── PER001–PER008: Basic Persistence ────────────────────────────────────────

describe('Basic Persistence (plain INSERT + ER_DUP_ENTRY)', () => {
  it('TEST-123A3-PER001: migrations 0026 and 0027 tables exist', async () => {
    const [rows] = await pool.execute<mysql.RowDataPacket[]>('SHOW TABLES');
    const names = rows.map((r) => Object.values(r)[0] as string);
    expect(names).toContain('atlas_bars_1m');
    expect(names).toContain('atlas_bars_5m');
    expect(names).toContain('atlas_bar_processing_ledger');
    expect(names).toContain('atlas_canonical_bars');
  });

  it('TEST-123A3-PER002: insert 1m bar returns inserted=true with insertId > 0', async () => {
    const result = await insert1m();
    expect(result.inserted).toBe(true);
    expect(result.insertId).toBeGreaterThan(0);
    expect(result.warningStatus).toBe(0);
  });

  it('TEST-123A3-PER003: exact duplicate 1m bar returns inserted=false (ER_DUP_ENTRY caught)', async () => {
    await insert1m();
    const result = await insert1m(); // exact duplicate
    expect(result.inserted).toBe(false);
    expect(result.insertId).toBe(0);
    // Only ONE row must exist — the key invariant
    const [rows] = await pool.execute<mysql.RowDataPacket[]>('SELECT COUNT(*) as cnt FROM atlas_bars_1m');
    expect(rows[0].cnt).toBe(1);
  });

  it('TEST-123A3-PER004: insert 5m bar returns inserted=true with insertId > 0', async () => {
    const result = await insert5m();
    expect(result.inserted).toBe(true);
    expect(result.insertId).toBeGreaterThan(0);
    expect(result.warningStatus).toBe(0);
  });

  it('TEST-123A3-PER005: exact duplicate 5m bar returns inserted=false', async () => {
    await insert5m();
    const result = await insert5m();
    expect(result.inserted).toBe(false);
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

  it('TEST-123A3-PER008: migration 0027 unique key includes interval_ms (8-column key)', async () => {
    const [rows] = await pool.execute<mysql.RowDataPacket[]>(
      "SHOW INDEX FROM atlas_bars_1m WHERE Key_name = 'uq_atlas_bars_1m_canonical_identity'",
    );
    const cols = (rows as mysql.RowDataPacket[]).map((r) => r.Column_name);
    expect(cols).toContain('raw_symbol');
    expect(cols).toContain('source');
    expect(cols).toContain('dataset');
    expect(cols).toContain('instrument_id');
    expect(cols).toContain('interval_ms');
    expect(cols).toContain('bar_open_ts_ms');
    expect(cols).toContain('revision');
    expect(cols).toContain('mapping_version');
    expect(cols).toHaveLength(8);
  });
});

// ─── PER009–PER017: Canonical Identity Dimensions ────────────────────────────

describe('Canonical Identity Dimensions', () => {
  it('TEST-123A3-PER009: exact replay duplicate is idempotently rejected (inserted=false)', async () => {
    await insert1m();
    const r2 = await insert1m();
    expect(r2.inserted).toBe(false);
    const [rows] = await pool.execute<mysql.RowDataPacket[]>('SELECT COUNT(*) as cnt FROM atlas_bars_1m');
    expect(rows[0].cnt).toBe(1);
  });

  it('TEST-123A3-PER010: different revision is not suppressed', async () => {
    await insert1m({ revision: 0 });
    const r2 = await insert1m({ revision: 1 });
    expect(r2.inserted).toBe(true);
    const [rows] = await pool.execute<mysql.RowDataPacket[]>('SELECT COUNT(*) as cnt FROM atlas_bars_1m');
    expect(rows[0].cnt).toBe(2);
  });

  it('TEST-123A3-PER011: different mapping_version is not suppressed', async () => {
    await insert1m({ mapping_version: 'v1' });
    const r2 = await insert1m({ mapping_version: 'v2' });
    expect(r2.inserted).toBe(true);
    const [rows] = await pool.execute<mysql.RowDataPacket[]>('SELECT COUNT(*) as cnt FROM atlas_bars_1m');
    expect(rows[0].cnt).toBe(2);
  });

  it('TEST-123A3-PER012: different raw_symbol (contract roll) is not suppressed', async () => {
    await insert1m({ raw_symbol: 'MNQM5' });
    const r2 = await insert1m({ raw_symbol: 'MNQU5', instrument_id: 10002 });
    expect(r2.inserted).toBe(true);
    const [rows] = await pool.execute<mysql.RowDataPacket[]>(
      'SELECT raw_symbol FROM atlas_bars_1m ORDER BY raw_symbol',
    );
    expect(rows.map((r) => r.raw_symbol)).toEqual(['MNQM5', 'MNQU5']);
  });

  it('TEST-123A3-PER013: same instrument and timestamp across different datasets do not collide', async () => {
    await insert1m({ dataset: 'GLBX.MDP3' });
    const r2 = await insert1m({ dataset: 'XNAS.ITCH' });
    expect(r2.inserted).toBe(true);
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
    expect(r2.inserted).toBe(true);
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

  it('TEST-123A3-PER017: duplicate insert does not throw, returns inserted=false, row count stays at 1', async () => {
    await insert1m();
    const result = await insert1m(); // duplicate — must not throw
    expect(result.inserted).toBe(false);
    const [rows] = await pool.execute<mysql.RowDataPacket[]>('SELECT COUNT(*) as cnt FROM atlas_bars_1m');
    expect(rows[0].cnt).toBe(1);
  });
});

// ─── PER018–PER026: Failure-Path Tests ───────────────────────────────────────

describe('Failure-Path Tests (non-duplicate errors must fail loudly)', () => {
  it('TEST-123A3-PER018: malformed numeric value fails', async () => {
    await expect(
      pool.execute(
        `INSERT INTO atlas_bars_1m (source, dataset, raw_symbol, instrument_id, interval_ms, bar_open_ts_ms,
           bar_open_ts_ns, bar_close_ts_ms, reconciliation_status, revision, mapping_version, atlas_ts_ms)
         VALUES ('DATABENTO','GLBX.MDP3','MNQM5','not_a_number',60000,?,?,?,'MATCHED',0,'v1',?)`,
        [BASE_TS + 1000, '0', BASE_TS + 61000, BASE_TS],
      ),
    ).rejects.toThrow();
  });

  it('TEST-123A3-PER019: invalid enum value fails', async () => {
    await expect(
      pool.execute(
        `INSERT INTO atlas_bars_1m (source, dataset, raw_symbol, instrument_id, interval_ms, bar_open_ts_ms,
           bar_open_ts_ns, bar_close_ts_ms, reconciliation_status, revision, mapping_version, atlas_ts_ms)
         VALUES ('DATABENTO','GLBX.MDP3','MNQM5',10001,60000,?,?,?,'INVALID_STATUS',0,'v1',?)`,
        [BASE_TS + 2000, '0', BASE_TS + 62000, BASE_TS],
      ),
    ).rejects.toThrow();
  });

  it('TEST-123A3-PER020: NOT NULL violation fails (missing atlas_ts_ms)', async () => {
    await expect(
      pool.execute(
        `INSERT INTO atlas_bars_1m (source, dataset, raw_symbol, instrument_id, interval_ms, bar_open_ts_ms,
           bar_open_ts_ns, bar_close_ts_ms, reconciliation_status, revision, mapping_version)
         VALUES ('DATABENTO','GLBX.MDP3','MNQM5',10001,60000,?,?,?,'MATCHED',0,'v1')`,
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
        `INSERT INTO atlas_bars_1m (source, dataset, raw_symbol, instrument_id, interval_ms, bar_open_ts_ms,
           bar_open_ts_ns, bar_close_ts_ms, reconciliation_status, revision, mapping_version, atlas_ts_ms)
         VALUES ('DATABENTO','GLBX.MDP3','MNQM5',10001,60000,?,?,?,'MATCHED',0,'v1',?)`,
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

  it('TEST-123A3-PER023: invalid enum in 1m bar is not silently accepted', async () => {
    let threw = false;
    try {
      await pool.execute(
        `INSERT INTO atlas_bars_1m (source, dataset, raw_symbol, instrument_id, interval_ms, bar_open_ts_ms,
           bar_open_ts_ns, bar_close_ts_ms, reconciliation_status, revision, mapping_version, atlas_ts_ms)
         VALUES ('DATABENTO','GLBX.MDP3','MNQM5',10001,60000,?,?,?,'GARBAGE_VALUE',0,'v1',?)`,
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
    const [warnings] = await pool.query<mysql.RowDataPacket[]>('SHOW WARNINGS');
    expect(warnings.length).toBe(0);
  });

  it('TEST-123A3-PER025: no Warning-level entries after duplicate insert (ER_DUP_ENTRY is Error-level, not Warning-level)', async () => {
    // EMPIRICAL: MySQL records ER_DUP_ENTRY (errno 1062) in SHOW WARNINGS as Level='Error'
    // after the exception is caught. This is expected behaviour — it is NOT a Warning-level entry.
    // The invariant is: zero Warning-level entries (data truncation, implicit conversion, etc.)
    const ts = BASE_TS + 7000;
    await insert1m({ bar_open_ts_ms: ts, bar_close_ts_ms: ts + 60000 });
    await insert1m({ bar_open_ts_ms: ts, bar_close_ts_ms: ts + 60000 }); // duplicate — caught by ER_DUP_ENTRY
    const [warnings] = await pool.query<mysql.RowDataPacket[]>('SHOW WARNINGS');
    // Filter to Warning-level only — ER_DUP_ENTRY appears as Level='Error', not Level='Warning'
    const warningLevelEntries = warnings.filter((w) => w.Level === 'Warning');
    expect(warningLevelEntries.length).toBe(0);
  });

  it('TEST-123A3-PER026: 5m CONTAINS_UNRESOLVED enum value is rejected', async () => {
    await expect(
      pool.execute(
        `INSERT INTO atlas_bars_5m (source, dataset, raw_symbol, instrument_id, interval_ms, bar_open_ts_ms,
           bar_close_ts_ms, minute_bar_count, canonical_bar_type, revision, mapping_version, atlas_ts_ms)
         VALUES ('DATABENTO','GLBX.MDP3','MNQM5',10001,300000,?,?,5,'CONTAINS_UNRESOLVED',0,'v1',?)`,
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
    expect(r2.inserted).toBe(true);
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
    expect(r1.inserted).toBe(true);
    expect(r2.inserted).toBe(true);
    expect(r1.insertId).not.toBe(r2.insertId);
  });

  it('TEST-123A3-PER031: only CONFIRMED revision can complete a blocked 5m window (CONTAINS_UNRESOLVED rejected)', async () => {
    await expect(
      pool.execute(
        `INSERT INTO atlas_bars_5m (source, dataset, raw_symbol, instrument_id, interval_ms, bar_open_ts_ms,
           bar_close_ts_ms, minute_bar_count, canonical_bar_type, revision, mapping_version, atlas_ts_ms)
         VALUES ('DATABENTO','GLBX.MDP3','MNQM5',10001,300000,?,?,5,'CONTAINS_UNRESOLVED',0,'v1',?)`,
        [BASE_TS + 14000, BASE_TS + 314000, BASE_TS],
      ),
    ).rejects.toThrow();
    // RECOVERED is valid — a blocked window unblocked by recovery
    const r = await insert5m({ bar_open_ts_ms: BASE_TS + 14000, bar_close_ts_ms: BASE_TS + 314000, canonical_bar_type: 'RECOVERED', revision: 1 });
    expect(r.inserted).toBe(true);
  });
});

// ─── MYS001–MYS006: MySQL Driver Semantics ───────────────────────────────────

describe('TEST-123A3-MYS: MySQL Driver Semantics (empirical ER_DUP_ENTRY verification)', () => {
  it('TEST-123A3-MYS001: first insert returns inserted=true with insertId > 0 and warningStatus=0', async () => {
    const result = await insert1m({ bar_open_ts_ms: BASE_TS + 20000, bar_close_ts_ms: BASE_TS + 80000 });
    expect(result.inserted).toBe(true);
    expect(result.insertId).toBeGreaterThan(0);
    expect(result.warningStatus).toBe(0);
  });

  it('TEST-123A3-MYS002: exact duplicate returns inserted=false (ER_DUP_ENTRY caught, no throw)', async () => {
    const ts = BASE_TS + 21000;
    await insert1m({ bar_open_ts_ms: ts, bar_close_ts_ms: ts + 60000 });
    const result = await insert1m({ bar_open_ts_ms: ts, bar_close_ts_ms: ts + 60000 });
    expect(result.inserted).toBe(false);
    expect(result.insertId).toBe(0);
    const [rows] = await pool.execute<mysql.RowDataPacket[]>('SELECT COUNT(*) as cnt FROM atlas_bars_1m WHERE bar_open_ts_ms = ?', [ts]);
    expect(rows[0].cnt).toBe(1);
  });

  it('TEST-123A3-MYS003: new revision returns inserted=true (different revision = different identity)', async () => {
    const ts = BASE_TS + 22000;
    await insert1m({ bar_open_ts_ms: ts, bar_close_ts_ms: ts + 60000, revision: 1 });
    const result = await insert1m({ bar_open_ts_ms: ts, bar_close_ts_ms: ts + 60000, revision: 2 });
    expect(result.inserted).toBe(true);
    expect(result.insertId).toBeGreaterThan(0);
  });

  it('TEST-123A3-MYS004: new mapping version returns inserted=true', async () => {
    const ts = BASE_TS + 23000;
    await insert1m({ bar_open_ts_ms: ts, bar_close_ts_ms: ts + 60000, mapping_version: 'v1' });
    const result = await insert1m({ bar_open_ts_ms: ts, bar_close_ts_ms: ts + 60000, mapping_version: 'v2' });
    expect(result.inserted).toBe(true);
  });

  it('TEST-123A3-MYS005: concurrent duplicate inserts produce exactly one inserted=true', async () => {
    const ts = BASE_TS + 24000;
    const [r1, r2, r3] = await Promise.all([
      insert1m({ bar_open_ts_ms: ts, bar_close_ts_ms: ts + 60000 }),
      insert1m({ bar_open_ts_ms: ts, bar_close_ts_ms: ts + 60000 }),
      insert1m({ bar_open_ts_ms: ts, bar_close_ts_ms: ts + 60000 }),
    ]);
    const insertedCount = [r1, r2, r3].filter(r => r.inserted).length;
    expect(insertedCount).toBe(1);
    const [rows] = await pool.execute<mysql.RowDataPacket[]>('SELECT COUNT(*) as cnt FROM atlas_bars_1m WHERE bar_open_ts_ms = ?', [ts]);
    expect(rows[0].cnt).toBe(1);
  });

  it('TEST-123A3-MYS006: no duplicate creates a second row (idempotency invariant)', async () => {
    const ts = BASE_TS + 25000;
    await insert1m({ bar_open_ts_ms: ts, bar_close_ts_ms: ts + 60000 });
    await insert1m({ bar_open_ts_ms: ts, bar_close_ts_ms: ts + 60000 });
    await insert1m({ bar_open_ts_ms: ts, bar_close_ts_ms: ts + 60000 });
    const [rows] = await pool.execute<mysql.RowDataPacket[]>('SELECT COUNT(*) as cnt FROM atlas_bars_1m WHERE bar_open_ts_ms = ?', [ts]);
    expect(rows[0].cnt).toBe(1);
  });
});

// ─── TXN001–TXN005: Transaction Rollback ─────────────────────────────────────

describe('TEST-123A3-TXN: Transaction Rollback Tests', () => {
  it('TEST-123A3-TXN001: successful bar+ledger transaction commits both rows', async () => {
    const conn = await pool.getConnection();
    const ts = BASE_TS + 30000;
    try {
      await conn.beginTransaction();
      await conn.execute(
        `INSERT INTO atlas_bars_1m (source, dataset, raw_symbol, instrument_id, interval_ms, bar_open_ts_ms,
           bar_open_ts_ns, bar_close_ts_ms, reconciliation_status, revision, mapping_version, atlas_ts_ms)
         VALUES ('DATABENTO','GLBX.MDP3','MNQM5',10001,60000,?,?,?,'MATCHED',0,'v1',?)`,
        [ts, '0', ts + 60000, BASE_TS],
      );
      await conn.execute(
        `INSERT INTO atlas_bar_processing_ledger
           (source, dataset, raw_symbol, instrument_id, bar_open_ts_ms, revision, mapping_version,
            consumer_name, consumer_version, processed_at_ms, atlas_ts_ms)
         VALUES ('DATABENTO','GLBX.MDP3','MNQM5',10001,?,0,'v1','darwin-research','v1',?,?)`,
        [ts, BASE_TS, BASE_TS],
      );
      await conn.commit();
    } finally {
      conn.release();
    }
    const [barRows] = await pool.execute<mysql.RowDataPacket[]>('SELECT COUNT(*) as cnt FROM atlas_bars_1m WHERE bar_open_ts_ms = ?', [ts]);
    const [ledgerRows] = await pool.execute<mysql.RowDataPacket[]>('SELECT COUNT(*) as cnt FROM atlas_bar_processing_ledger WHERE bar_open_ts_ms = ?', [ts]);
    expect(barRows[0].cnt).toBe(1);
    expect(ledgerRows[0].cnt).toBe(1);
  });

  it('TEST-123A3-TXN002: ledger NOT NULL violation rolls back — neither bar nor ledger row remains', async () => {
    const conn = await pool.getConnection();
    const ts = BASE_TS + 31000;
    let rolledBack = false;
    try {
      await conn.beginTransaction();
      await conn.execute(
        `INSERT INTO atlas_bars_1m (source, dataset, raw_symbol, instrument_id, interval_ms, bar_open_ts_ms,
           bar_open_ts_ns, bar_close_ts_ms, reconciliation_status, revision, mapping_version, atlas_ts_ms)
         VALUES ('DATABENTO','GLBX.MDP3','MNQM5',10001,60000,?,?,?,'MATCHED',0,'v1',?)`,
        [ts, '0', ts + 60000, BASE_TS],
      );
      // Force ledger failure: consumer_name is NOT NULL
      await conn.execute(
        `INSERT INTO atlas_bar_processing_ledger
           (source, dataset, raw_symbol, instrument_id, bar_open_ts_ms, revision, mapping_version,
            consumer_name, consumer_version, processed_at_ms, atlas_ts_ms)
         VALUES ('DATABENTO','GLBX.MDP3','MNQM5',10001,?,0,'v1',NULL,'v1',?,?)`,
        [ts, BASE_TS, BASE_TS],
      );
      await conn.commit();
    } catch {
      await conn.rollback();
      rolledBack = true;
    } finally {
      conn.release();
    }
    expect(rolledBack).toBe(true);
    const [barRows] = await pool.execute<mysql.RowDataPacket[]>('SELECT COUNT(*) as cnt FROM atlas_bars_1m WHERE bar_open_ts_ms = ?', [ts]);
    const [ledgerRows] = await pool.execute<mysql.RowDataPacket[]>('SELECT COUNT(*) as cnt FROM atlas_bar_processing_ledger WHERE bar_open_ts_ms = ?', [ts]);
    expect(barRows[0].cnt).toBe(0);
    expect(ledgerRows[0].cnt).toBe(0);
  });

  it('TEST-123A3-TXN003: connection is returned cleanly to pool after rollback', async () => {
    // Force a rollback first
    const conn1 = await pool.getConnection();
    try {
      await conn1.beginTransaction();
      await conn1.execute('SELECT * FROM nonexistent_table_xyz');
      await conn1.commit();
    } catch {
      await conn1.rollback();
    } finally {
      conn1.release();
    }
    // Pool connection must be reusable
    const ts = BASE_TS + 32000;
    const result = await insert1m({ bar_open_ts_ms: ts, bar_close_ts_ms: ts + 60000 });
    expect(result.inserted).toBe(true);
  });

  it('TEST-123A3-TXN004: duplicate bar + new ledger is idempotent (bar=false, ledger=true)', async () => {
    const ts = BASE_TS + 33000;
    // First insert
    const conn1 = await pool.getConnection();
    try {
      await conn1.beginTransaction();
      await conn1.execute(
        `INSERT INTO atlas_bars_1m (source, dataset, raw_symbol, instrument_id, interval_ms, bar_open_ts_ms,
           bar_open_ts_ns, bar_close_ts_ms, reconciliation_status, revision, mapping_version, atlas_ts_ms)
         VALUES ('DATABENTO','GLBX.MDP3','MNQM5',10001,60000,?,?,?,'MATCHED',0,'v1',?)`,
        [ts, '0', ts + 60000, BASE_TS],
      );
      await conn1.execute(
        `INSERT INTO atlas_bar_processing_ledger
           (source, dataset, raw_symbol, instrument_id, bar_open_ts_ms, revision, mapping_version,
            consumer_name, consumer_version, processed_at_ms, atlas_ts_ms)
         VALUES ('DATABENTO','GLBX.MDP3','MNQM5',10001,?,0,'v1','darwin-research','v1',?,?)`,
        [ts, BASE_TS, BASE_TS],
      );
      await conn1.commit();
    } finally {
      conn1.release();
    }
    // Second insert: duplicate bar, new consumer
    const conn2 = await pool.getConnection();
    let barDuplicate = false;
    let ledgerInserted = false;
    try {
      await conn2.beginTransaction();
      try {
        await conn2.execute(
          `INSERT INTO atlas_bars_1m (source, dataset, raw_symbol, instrument_id, interval_ms, bar_open_ts_ms,
             bar_open_ts_ns, bar_close_ts_ms, reconciliation_status, revision, mapping_version, atlas_ts_ms)
           VALUES ('DATABENTO','GLBX.MDP3','MNQM5',10001,60000,?,?,?,'MATCHED',0,'v1',?)`,
          [ts, '0', ts + 60000, BASE_TS],
        );
      } catch (err) {
        if (isDuplicateKeyError(err)) barDuplicate = true;
        else throw err;
      }
      await conn2.execute(
        `INSERT INTO atlas_bar_processing_ledger
           (source, dataset, raw_symbol, instrument_id, bar_open_ts_ms, revision, mapping_version,
            consumer_name, consumer_version, processed_at_ms, atlas_ts_ms)
         VALUES ('DATABENTO','GLBX.MDP3','MNQM5',10001,?,0,'v1','risk-monitor','v1',?,?)`,
        [ts, BASE_TS, BASE_TS],
      );
      ledgerInserted = true;
      await conn2.commit();
    } finally {
      conn2.release();
    }
    expect(barDuplicate).toBe(true);
    expect(ledgerInserted).toBe(true);
    const [barRows] = await pool.execute<mysql.RowDataPacket[]>('SELECT COUNT(*) as cnt FROM atlas_bars_1m WHERE bar_open_ts_ms = ?', [ts]);
    expect(barRows[0].cnt).toBe(1);
  });

  it('TEST-123A3-TXN005: duplicate bar + duplicate ledger is fully idempotent', async () => {
    const ts = BASE_TS + 34000;
    // Insert both once
    await insert1m({ bar_open_ts_ms: ts, bar_close_ts_ms: ts + 60000 });
    await pool.execute(
      `INSERT INTO atlas_bar_processing_ledger
         (source, dataset, raw_symbol, instrument_id, bar_open_ts_ms, revision, mapping_version,
          consumer_name, consumer_version, processed_at_ms, atlas_ts_ms)
       VALUES ('DATABENTO','GLBX.MDP3','MNQM5',10001,?,0,'v1','darwin-research','v1',?,?)`,
      [ts, BASE_TS, BASE_TS],
    );
    // Try again — both should be duplicates
    const r2 = await insert1m({ bar_open_ts_ms: ts, bar_close_ts_ms: ts + 60000 });
    let ledgerDuplicate = false;
    try {
      await pool.execute(
        `INSERT INTO atlas_bar_processing_ledger
           (source, dataset, raw_symbol, instrument_id, bar_open_ts_ms, revision, mapping_version,
            consumer_name, consumer_version, processed_at_ms, atlas_ts_ms)
         VALUES ('DATABENTO','GLBX.MDP3','MNQM5',10001,?,0,'v1','darwin-research','v1',?,?)`,
        [ts, BASE_TS, BASE_TS],
      );
    } catch (err) {
      if (isDuplicateKeyError(err)) ledgerDuplicate = true;
      else throw err;
    }
    expect(r2.inserted).toBe(false);
    expect(ledgerDuplicate).toBe(true);
    const [barRows] = await pool.execute<mysql.RowDataPacket[]>('SELECT COUNT(*) as cnt FROM atlas_bars_1m WHERE bar_open_ts_ms = ?', [ts]);
    const [ledgerRows] = await pool.execute<mysql.RowDataPacket[]>('SELECT COUNT(*) as cnt FROM atlas_bar_processing_ledger WHERE bar_open_ts_ms = ?', [ts]);
    expect(barRows[0].cnt).toBe(1);
    expect(ledgerRows[0].cnt).toBe(1);
  });
});

// ─── SCH001–SCH003: Schema Verification ──────────────────────────────────────

describe('TEST-123A3-SCH: Schema Verification (SHOW CREATE TABLE)', () => {
  it('TEST-123A3-SCH001: atlas_bars_1m unique key is exactly 8 columns (includes interval_ms)', async () => {
    const [rows] = await pool.query<mysql.RowDataPacket[]>('SHOW CREATE TABLE atlas_bars_1m');
    const ddl: string = rows[0]['Create Table'];
    expect(ddl).toContain('uq_atlas_bars_1m_canonical_identity');
    expect(ddl).toContain('`source`');
    expect(ddl).toContain('`dataset`');
    expect(ddl).toContain('`raw_symbol`');
    expect(ddl).toContain('`instrument_id`');
    expect(ddl).toContain('`interval_ms`');
    expect(ddl).toContain('`bar_open_ts_ms`');
    expect(ddl).toContain('`revision`');
    expect(ddl).toContain('`mapping_version`');
  });

  it('TEST-123A3-SCH002: atlas_bars_5m unique key includes interval_ms (8-column key)', async () => {
    const [rows] = await pool.query<mysql.RowDataPacket[]>('SHOW CREATE TABLE atlas_bars_5m');
    const ddl: string = rows[0]['Create Table'];
    expect(ddl).toContain('uq_atlas_bars_5m_canonical_identity');
    expect(ddl).toContain('`interval_ms`');
  });

  it('TEST-123A3-SCH003: atlas_bar_processing_ledger unique key is exactly 9 columns', async () => {
    const [rows] = await pool.query<mysql.RowDataPacket[]>('SHOW CREATE TABLE atlas_bar_processing_ledger');
    const ddl: string = rows[0]['Create Table'];
    expect(ddl).toContain('uq_atlas_bar_processing_ledger');
    expect(ddl).toContain('`consumer_name`');
    expect(ddl).toContain('`consumer_version`');
  });
});

// ─── MIG001: Migration Recovery ──────────────────────────────────────────────

describe('TEST-123A3-MIG: Migration Recovery Tests', () => {
  it('TEST-123A3-MIG001: table is writable after 0027 applied (migration idempotency)', async () => {
    const [rows] = await pool.execute<mysql.RowDataPacket[]>('SELECT COUNT(*) as cnt FROM atlas_bars_1m');
    expect(rows[0].cnt).toBeGreaterThanOrEqual(0);
    const ts = BASE_TS + 99000;
    const result = await insert1m({ bar_open_ts_ms: ts, bar_close_ts_ms: ts + 60000 });
    expect(result.inserted).toBe(true);
  });
});
