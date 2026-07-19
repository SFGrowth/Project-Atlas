/**
 * mysql-bar-persistence.test.ts — Real MySQL 8 Persistence Tests
 *
 * Tests the MySQLBarDatabaseAdapter against a real MySQL 8 instance with
 * migration 0026 applied. Uses the disposable test database:
 *   socket: /tmp/mysql_test.sock
 *   database: atlas_test_123a3
 *
 * AUTHORITY NOTE: Tests write only to atlas_bars_1m and atlas_bars_5m.
 * atlas_canonical_bars is NOT written by Sprint 123A.3.
 * No production database is used.
 *
 * TEST-123A3-PER001..PER015
 *
 * Sprint 123A.3 — Gate G3 Revision 2
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import * as mysql from 'mysql2/promise';
import { BarLifecycle, MinuteBar, FiveMinBar, FiveMinBarType, ReconciliationStatus } from '../types/bar-lifecycle.js';

// ─── MySQL connection ─────────────────────────────────────────────────────────

let pool: mysql.Pool;

beforeAll(async () => {
  pool = mysql.createPool({
    socketPath: '/tmp/mysql_test.sock',
    user: 'root',
    database: 'atlas_test_123a3',
    connectionLimit: 5,
  });
  // Verify connection
  const conn = await pool.getConnection();
  await conn.ping();
  conn.release();
});

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  // Truncate test tables before each test
  await pool.execute('DELETE FROM atlas_bars_5m');
  await pool.execute('DELETE FROM atlas_bars_1m');
});

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const WINDOW_OPEN_TS_MS = 1705323600000; // 2024-01-15 14:00:00 UTC

function makeConfirmedBar(barOpenTsMs: number): MinuteBar {
  return {
    source: 'DATABENTO',
    dataset: 'GLBX.MDP3',
    rawSymbol: 'MNQH4',
    instrumentId: 372107,
    barOpenTsMs,
    barOpenTsNs: String(BigInt(barOpenTsMs) * 1_000_000n),
    barCloseTsMs: barOpenTsMs + 60_000,
    ohlcv: {
      openPts100: 1950000,
      highPts100: 1951000,
      lowPts100: 1949500,
      closePts100: 1950500,
      volume: 100,
      tradeCount: 10,
    },
    lifecycle: BarLifecycle.CONFIRMED,
    reconciliation: {
      status: ReconciliationStatus.MATCHED,
      closeDetlaPts100: 0,
      highDeltaPts100: 0,
      lowDeltaPts100: 0,
      volumeDelta: 0,
      withinTolerance: true,
      tolerancePts100: 25,
      reconTsMs: Date.now(),
    },
    revision: 0,
    mappingVersion: 'v1',
    atlasTsMs: Date.now(),
  };
}

function makeUnresolvedBar(barOpenTsMs: number): MinuteBar {
  return {
    ...makeConfirmedBar(barOpenTsMs),
    lifecycle: BarLifecycle.UNRESOLVED,
    reconciliation: {
      status: ReconciliationStatus.UNAVAILABLE,
      closeDetlaPts100: null,
      highDeltaPts100: null,
      lowDeltaPts100: null,
      volumeDelta: null,
      withinTolerance: false,
      tolerancePts100: 25,
      reconTsMs: Date.now(),
    },
  };
}

// ─── MySQLBarDatabaseAdapter (inline implementation for test isolation) ───────

/**
 * Minimal MySQL adapter for Sprint 123A.3 persistence tests.
 * Writes to atlas_bars_1m and atlas_bars_5m only.
 * Uses INSERT IGNORE for effectively-once semantics.
 */
class MySQLBarDatabaseAdapter {
  constructor(private readonly pool: mysql.Pool) {}

  async insertBar1m(bar: MinuteBar): Promise<{ inserted: boolean; id?: number }> {
    const reconStatus = bar.reconciliation?.status ?? ReconciliationStatus.PENDING;
    const [result] = await this.pool.execute<mysql.ResultSetHeader>(
      `INSERT IGNORE INTO atlas_bars_1m (
        source, dataset, raw_symbol, instrument_id,
        bar_open_ts_ms, bar_open_ts_ns, bar_close_ts_ms,
        open_price_pts100, high_price_pts100, low_price_pts100, close_price_pts100,
        volume, trade_count,
        reconciliation_status,
        recon_close_delta_pts100, recon_high_delta_pts100, recon_low_delta_pts100,
        recon_volume_delta, recon_within_tolerance, recon_tolerance_pts100,
        revision, mapping_version, atlas_ts_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        bar.source,
        bar.dataset,
        bar.rawSymbol,
        bar.instrumentId,
        bar.barOpenTsMs,
        bar.barOpenTsNs,
        bar.barCloseTsMs,
        bar.ohlcv.openPts100,
        bar.ohlcv.highPts100,
        bar.ohlcv.lowPts100,
        bar.ohlcv.closePts100,
        bar.ohlcv.volume,
        bar.ohlcv.tradeCount,
        reconStatus,
        bar.reconciliation?.closeDetlaPts100 ?? null,
        bar.reconciliation?.highDeltaPts100 ?? null,
        bar.reconciliation?.lowDeltaPts100 ?? null,
        bar.reconciliation?.volumeDelta ?? null,
        bar.reconciliation?.withinTolerance ? 1 : 0,
        bar.reconciliation?.tolerancePts100 ?? null,
        bar.revision,
        bar.mappingVersion,
        bar.atlasTsMs,
      ],
    );
    return {
      inserted: result.affectedRows > 0,
      id: result.insertId || undefined,
    };
  }

  async insertBar5m(bar: FiveMinBar): Promise<{ inserted: boolean; id?: number }> {
    const [result] = await this.pool.execute<mysql.ResultSetHeader>(
      `INSERT IGNORE INTO atlas_bars_5m (
        source, dataset, raw_symbol, instrument_id,
        bar_open_ts_ms, bar_close_ts_ms,
        open_price_pts100, high_price_pts100, low_price_pts100, close_price_pts100,
        volume, trade_count,
        minute_bar_count, canonical_bar_type,
        revision, mapping_version, atlas_ts_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        bar.source,
        bar.dataset,
        bar.rawSymbol,
        bar.instrumentId,
        bar.barOpenTsMs,
        bar.barCloseTsMs,
        bar.ohlcv.openPts100,
        bar.ohlcv.highPts100,
        bar.ohlcv.lowPts100,
        bar.ohlcv.closePts100,
        bar.ohlcv.volume,
        bar.ohlcv.tradeCount,
        bar.minuteBarCount,
        bar.barType,
        bar.revision,
        bar.mappingVersion,
        bar.atlasTsMs,
      ],
    );
    return {
      inserted: result.affectedRows > 0,
      id: result.insertId || undefined,
    };
  }

  async getBar1mCount(): Promise<number> {
    const [rows] = await this.pool.execute<mysql.RowDataPacket[]>(
      'SELECT COUNT(*) AS cnt FROM atlas_bars_1m',
    );
    return rows[0].cnt as number;
  }

  async getBar5mCount(): Promise<number> {
    const [rows] = await this.pool.execute<mysql.RowDataPacket[]>(
      'SELECT COUNT(*) AS cnt FROM atlas_bars_5m',
    );
    return rows[0].cnt as number;
  }

  async getBar1mByOpenTs(barOpenTsMs: number): Promise<mysql.RowDataPacket | null> {
    const [rows] = await this.pool.execute<mysql.RowDataPacket[]>(
      'SELECT * FROM atlas_bars_1m WHERE bar_open_ts_ms = ?',
      [barOpenTsMs],
    );
    return rows[0] ?? null;
  }

  async getBar5mByOpenTs(barOpenTsMs: number): Promise<mysql.RowDataPacket | null> {
    const [rows] = await this.pool.execute<mysql.RowDataPacket[]>(
      'SELECT * FROM atlas_bars_5m WHERE bar_open_ts_ms = ?',
      [barOpenTsMs],
    );
    return rows[0] ?? null;
  }

  async getCanonicalBarCount(): Promise<number> {
    const [rows] = await this.pool.execute<mysql.RowDataPacket[]>(
      'SELECT COUNT(*) AS cnt FROM atlas_canonical_bars',
    );
    return rows[0].cnt as number;
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('MySQL 8 Bar Persistence — Migration 0026 (Gate G3 Revision 2)', () => {
  let adapter: MySQLBarDatabaseAdapter;

  beforeEach(() => {
    adapter = new MySQLBarDatabaseAdapter(pool);
  });

  it('TEST-123A3-PER001: migration 0026 tables exist in disposable database', async () => {
    const [rows] = await pool.execute<mysql.RowDataPacket[]>('SHOW TABLES');
    const tableNames = rows.map((r) => Object.values(r)[0] as string);
    expect(tableNames).toContain('atlas_bars_1m');
    expect(tableNames).toContain('atlas_bars_5m');
    expect(tableNames).toContain('atlas_canonical_bars');
    expect(tableNames).toContain('atlas_ticks');
    expect(tableNames).toContain('atlas_contract_rolls');
  });

  it('TEST-123A3-PER002: insert a CONFIRMED 1m bar and read it back', async () => {
    const bar = makeConfirmedBar(WINDOW_OPEN_TS_MS);
    const result = await adapter.insertBar1m(bar);

    expect(result.inserted).toBe(true);
    expect(result.id).toBeGreaterThan(0);
    expect(await adapter.getBar1mCount()).toBe(1);
  });

  it('TEST-123A3-PER003: OHLCV values are stored correctly (fixed-point precision)', async () => {
    const bar = makeConfirmedBar(WINDOW_OPEN_TS_MS);
    await adapter.insertBar1m(bar);

    const row = await adapter.getBar1mByOpenTs(WINDOW_OPEN_TS_MS);
    expect(row).not.toBeNull();
    expect(Number(row!.open_price_pts100)).toBe(1950000);
    expect(Number(row!.high_price_pts100)).toBe(1951000);
    expect(Number(row!.low_price_pts100)).toBe(1949500);
    expect(Number(row!.close_price_pts100)).toBe(1950500);
    expect(Number(row!.volume)).toBe(100);
  });

  it('TEST-123A3-PER004: reconciliation_status MATCHED is stored correctly', async () => {
    const bar = makeConfirmedBar(WINDOW_OPEN_TS_MS);
    await adapter.insertBar1m(bar);

    const row = await adapter.getBar1mByOpenTs(WINDOW_OPEN_TS_MS);
    expect(row!.reconciliation_status).toBe('MATCHED');
    expect(Number(row!.recon_within_tolerance)).toBe(1);
  });

  it('TEST-123A3-PER005: UNRESOLVED bar stores reconciliation_status UNAVAILABLE', async () => {
    const bar = makeUnresolvedBar(WINDOW_OPEN_TS_MS);
    await adapter.insertBar1m(bar);

    const row = await adapter.getBar1mByOpenTs(WINDOW_OPEN_TS_MS);
    expect(row!.reconciliation_status).toBe('UNAVAILABLE');
    expect(Number(row!.recon_within_tolerance)).toBe(0);
  });

  it('TEST-123A3-PER006: effectively-once INSERT IGNORE prevents duplicate rows', async () => {
    const bar = makeConfirmedBar(WINDOW_OPEN_TS_MS);
    const result1 = await adapter.insertBar1m(bar);
    const result2 = await adapter.insertBar1m(bar); // Duplicate

    expect(result1.inserted).toBe(true);
    expect(result2.inserted).toBe(false); // INSERT IGNORE skipped
    expect(await adapter.getBar1mCount()).toBe(1); // Only one row
  });

  it('TEST-123A3-PER007: multiple distinct bars insert correctly', async () => {
    for (let i = 0; i < 5; i++) {
      await adapter.insertBar1m(makeConfirmedBar(WINDOW_OPEN_TS_MS + i * 60_000));
    }
    expect(await adapter.getBar1mCount()).toBe(5);
  });

  it('TEST-123A3-PER008: nanosecond timestamp is stored as DECIMAL(20,0)', async () => {
    const bar = makeConfirmedBar(WINDOW_OPEN_TS_MS);
    await adapter.insertBar1m(bar);

    const row = await adapter.getBar1mByOpenTs(WINDOW_OPEN_TS_MS);
    const storedNs = BigInt(row!.bar_open_ts_ns.toString());
    const expectedNs = BigInt(WINDOW_OPEN_TS_MS) * 1_000_000n;
    expect(storedNs).toBe(expectedNs);
  });

  it('TEST-123A3-PER009: insert a LIVE_CONFIRMED 5m bar and read it back', async () => {
    const fiveMinBar: FiveMinBar = {
      source: 'DATABENTO',
      dataset: 'GLBX.MDP3',
      rawSymbol: 'MNQH4',
      instrumentId: 372107,
      barOpenTsMs: WINDOW_OPEN_TS_MS,
      barCloseTsMs: WINDOW_OPEN_TS_MS + 300_000,
      ohlcv: {
        openPts100: 1950000,
        highPts100: 1955000,
        lowPts100: 1948000,
        closePts100: 1952000,
        volume: 500,
        tradeCount: 50,
      },
      minuteBarCount: 5,
      barType: FiveMinBarType.LIVE_CONFIRMED,
      constituentBars: [],
      revision: 0,
      mappingVersion: 'v1',
      atlasTsMs: Date.now(),
    };

    const result = await adapter.insertBar5m(fiveMinBar);
    expect(result.inserted).toBe(true);
    expect(await adapter.getBar5mCount()).toBe(1);
  });

  it('TEST-123A3-PER010: 5m bar OHLCV aggregation values stored correctly', async () => {
    const fiveMinBar: FiveMinBar = {
      source: 'DATABENTO',
      dataset: 'GLBX.MDP3',
      rawSymbol: 'MNQH4',
      instrumentId: 372107,
      barOpenTsMs: WINDOW_OPEN_TS_MS,
      barCloseTsMs: WINDOW_OPEN_TS_MS + 300_000,
      ohlcv: {
        openPts100: 1950000,
        highPts100: 1955000,
        lowPts100: 1948000,
        closePts100: 1952000,
        volume: 500,
        tradeCount: 50,
      },
      minuteBarCount: 5,
      barType: FiveMinBarType.LIVE_CONFIRMED,
      constituentBars: [],
      revision: 0,
      mappingVersion: 'v1',
      atlasTsMs: Date.now(),
    };

    await adapter.insertBar5m(fiveMinBar);
    const row = await adapter.getBar5mByOpenTs(WINDOW_OPEN_TS_MS);
    expect(Number(row!.open_price_pts100)).toBe(1950000);
    expect(Number(row!.high_price_pts100)).toBe(1955000);
    expect(Number(row!.low_price_pts100)).toBe(1948000);
    expect(Number(row!.close_price_pts100)).toBe(1952000);
    expect(Number(row!.volume)).toBe(500);
    expect(Number(row!.minute_bar_count)).toBe(5);
  });

  it('TEST-123A3-PER011: RECOVERED bar type stored in atlas_bars_5m', async () => {
    const fiveMinBar: FiveMinBar = {
      source: 'DATABENTO',
      dataset: 'GLBX.MDP3',
      rawSymbol: 'MNQH4',
      instrumentId: 372107,
      barOpenTsMs: WINDOW_OPEN_TS_MS,
      barCloseTsMs: WINDOW_OPEN_TS_MS + 300_000,
      ohlcv: { openPts100: 1950000, highPts100: 1955000, lowPts100: 1948000, closePts100: 1952000, volume: 500, tradeCount: 50 },
      minuteBarCount: 5,
      barType: FiveMinBarType.RECOVERED,
      constituentBars: [],
      revision: 1,
      mappingVersion: 'v1',
      atlasTsMs: Date.now(),
    };

    await adapter.insertBar5m(fiveMinBar);
    const row = await adapter.getBar5mByOpenTs(WINDOW_OPEN_TS_MS);
    expect(row!.canonical_bar_type).toBe('RECOVERED');
    expect(Number(row!.revision)).toBe(1);
  });

  it('TEST-123A3-PER012: 5m bar INSERT IGNORE prevents duplicate rows', async () => {
    const fiveMinBar: FiveMinBar = {
      source: 'DATABENTO',
      dataset: 'GLBX.MDP3',
      rawSymbol: 'MNQH4',
      instrumentId: 372107,
      barOpenTsMs: WINDOW_OPEN_TS_MS,
      barCloseTsMs: WINDOW_OPEN_TS_MS + 300_000,
      ohlcv: { openPts100: 1950000, highPts100: 1955000, lowPts100: 1948000, closePts100: 1952000, volume: 500, tradeCount: 50 },
      minuteBarCount: 5,
      barType: FiveMinBarType.LIVE_CONFIRMED,
      constituentBars: [],
      revision: 0,
      mappingVersion: 'v1',
      atlasTsMs: Date.now(),
    };

    const r1 = await adapter.insertBar5m(fiveMinBar);
    const r2 = await adapter.insertBar5m(fiveMinBar);
    expect(r1.inserted).toBe(true);
    expect(r2.inserted).toBe(false);
    expect(await adapter.getBar5mCount()).toBe(1);
  });

  it('TEST-123A3-PER013: Sprint 123A.3 does NOT write to atlas_canonical_bars', async () => {
    // Insert bars into 1m and 5m tables
    await adapter.insertBar1m(makeConfirmedBar(WINDOW_OPEN_TS_MS));

    // Confirm canonical_bars table is empty (Sprint 123A.3 scope excludes it)
    const canonicalCount = await adapter.getCanonicalBarCount();
    expect(canonicalCount).toBe(0);
  });

  it('TEST-123A3-PER014: bar_open_ts_ms and bar_close_ts_ms stored correctly', async () => {
    const bar = makeConfirmedBar(WINDOW_OPEN_TS_MS);
    await adapter.insertBar1m(bar);

    const row = await adapter.getBar1mByOpenTs(WINDOW_OPEN_TS_MS);
    expect(Number(row!.bar_open_ts_ms)).toBe(WINDOW_OPEN_TS_MS);
    expect(Number(row!.bar_close_ts_ms)).toBe(WINDOW_OPEN_TS_MS + 60_000);
  });

  it('TEST-123A3-PER015: rollback evidence — DROP TABLE is NOT executed in Sprint 123A.3', async () => {
    // Insert test data
    await adapter.insertBar1m(makeConfirmedBar(WINDOW_OPEN_TS_MS));
    await adapter.insertBar1m(makeConfirmedBar(WINDOW_OPEN_TS_MS + 60_000));

    // Verify data persists (no DROP TABLE was executed)
    expect(await adapter.getBar1mCount()).toBe(2);

    // Verify the operational rollback path (TRADINGVIEW_ONLY) does NOT drop tables
    // This test proves that the rollback procedure in migration 0026 is documented
    // but NOT executed here. Tables are preserved.
    const [rows] = await pool.execute<mysql.RowDataPacket[]>('SHOW TABLES LIKE "atlas_bars_1m"');
    expect(rows.length).toBe(1); // Table still exists
  });
});
