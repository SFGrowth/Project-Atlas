/**
 * Sprint 123A.4 — Gate G4 ChartHistoryService MySQL Integration Tests
 *
 * Proves ChartHistoryService behaviour against real MySQL 8.
 *
 *   TEST-123A4-HIS-001  1m query returns MATCHED bars in ascending order
 *   TEST-123A4-HIS-002  1m query excludes PENDING bars
 *   TEST-123A4-HIS-003  1m query excludes UNMATCHED bars
 *   TEST-123A4-HIS-004  1m query excludes UNAVAILABLE bars
 *   TEST-123A4-HIS-005  1m query selects highest revision per logical bar
 *   TEST-123A4-HIS-006  1m query respects startTsMs / endTsMs range
 *   TEST-123A4-HIS-007  1m query respects cursor (pagination)
 *   TEST-123A4-HIS-008  1m query hasMore=true when rows > limit
 *   TEST-123A4-HIS-009  1m query hasMore=false when rows <= limit
 *   TEST-123A4-HIS-010  1m query returns empty array when no MATCHED bars
 *   TEST-123A4-HIS-011  1m query isolates by symbol (different symbols do not bleed)
 *   TEST-123A4-HIS-012  5m eligibility contract: LIVE_CONFIRMED bars are returned
 *   TEST-123A4-HIS-013  5m eligibility contract: RECOVERED bars are returned
 *   TEST-123A4-HIS-014  5m eligibility contract: CONTAINS_SYNTHETIC bars are excluded
 *   TEST-123A4-HIS-015  5m query selects highest revision per logical bar
 *   TEST-123A4-HIS-016  5m query respects startTsMs / endTsMs range
 *   TEST-123A4-HIS-017  5m query cursor pagination
 *   TEST-123A4-HIS-018  5m query hasMore=true when rows > limit
 *   TEST-123A4-HIS-019  1m dataQuality=GOOD for MATCHED bars
 *   TEST-123A4-HIS-020  5m dataQuality=GOOD for LIVE_CONFIRMED, DEGRADED for RECOVERED
 *   TEST-123A4-HIS-021  1m query returns correct pts100 values (no division by 100)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mysql from 'mysql2/promise';
import { ChartHistoryService } from '../chart-history-service.js';

// ─── Test database setup ──────────────────────────────────────────────────────

const SOCKET = '/tmp/mysql_test.sock';
const DB     = 'atlas_test_123a3'; // reuse the existing test DB with migrations already applied

let pool: mysql.Pool;
let svc: ChartHistoryService;

const BASE_TS = 1_700_000_000_000;
const SYMBOL  = 'MNQM5';
const SYMBOL2 = 'MNQU5';

function ts(offsetMinutes: number): number {
  return BASE_TS + offsetMinutes * 60_000;
}

async function insert1m(conn: mysql.PoolConnection, overrides: {
  rawSymbol?: string;
  barOpenTsMs?: number;
  reconciliationStatus?: string;
  revision?: number;
  openPts100?: number;
  closePts100?: number;
  instrumentId?: number;
}): Promise<void> {
  const {
    rawSymbol = SYMBOL,
    barOpenTsMs = BASE_TS,
    reconciliationStatus = 'MATCHED',
    revision = 1,
    openPts100 = 2_100_000,
    closePts100 = 2_103_000,
    instrumentId = 12345,
  } = overrides;

  await conn.execute(`
    INSERT INTO atlas_bars_1m
      (source, dataset, raw_symbol, instrument_id, interval_ms,
       bar_open_ts_ms, bar_open_ts_ns, bar_close_ts_ms,
       open_price_pts100, high_price_pts100, low_price_pts100, close_price_pts100,
       volume, trade_count, reconciliation_status, revision, mapping_version, atlas_ts_ms)
    VALUES
      ('DATABENTO', 'GLBX.MDP3', ?, ?, 60000,
       ?, ?, ?,
       ?, ?, ?, ?,
       1500, 120, ?, ?, 'v1', ?)
  `, [
    rawSymbol, instrumentId,
    barOpenTsMs, barOpenTsMs * 1_000_000, barOpenTsMs + 60_000,
    openPts100, openPts100 + 5000, openPts100 - 2000, closePts100,
    reconciliationStatus, revision, Date.now(),
  ]);
}

async function insert5m(conn: mysql.PoolConnection, overrides: {
  rawSymbol?: string;
  barOpenTsMs?: number;
  canonicalBarType?: string;
  revision?: number;
  instrumentId?: number;
}): Promise<void> {
  const {
    rawSymbol = SYMBOL,
    barOpenTsMs = BASE_TS,
    canonicalBarType = 'LIVE_CONFIRMED',
    revision = 1,
    instrumentId = 12345,
  } = overrides;

  await conn.execute(`
    INSERT INTO atlas_bars_5m
      (source, dataset, raw_symbol, instrument_id, interval_ms,
       bar_open_ts_ms, bar_close_ts_ms,
       open_price_pts100, high_price_pts100, low_price_pts100, close_price_pts100,
       volume, trade_count, minute_bar_count, canonical_bar_type, revision, mapping_version, atlas_ts_ms)
    VALUES
      ('DATABENTO', 'GLBX.MDP3', ?, ?, 300000,
       ?, ?,
       2100000, 2110000, 2095000, 2105000,
       7500, 600, 5, ?, ?, 'v1', ?)
  `, [
    rawSymbol, instrumentId,
    barOpenTsMs, barOpenTsMs + 300_000,
    canonicalBarType, revision, Date.now(),
  ]);
}

// ─── Setup / teardown ─────────────────────────────────────────────────────────

beforeAll(async () => {
  pool = mysql.createPool({
    socketPath: SOCKET,
    user: 'root',
    database: DB,
    waitForConnections: true,
    connectionLimit: 5,
  });
  const conn = await pool.getConnection();
  await conn.ping();
  conn.release();
  svc = new ChartHistoryService(pool);
});

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  const conn = await pool.getConnection();
  await conn.execute('DELETE FROM atlas_bars_1m');
  await conn.execute('DELETE FROM atlas_bars_5m');
  conn.release();
});

// ─── 1m tests ─────────────────────────────────────────────────────────────────

describe('Sprint 123A.4 — ChartHistoryService MySQL: 1m bars', () => {

  it('TEST-123A4-HIS-001: returns MATCHED bars in ascending order', async () => {
    const conn = await pool.getConnection();
    await insert1m(conn, { barOpenTsMs: ts(2) });
    await insert1m(conn, { barOpenTsMs: ts(0) });
    await insert1m(conn, { barOpenTsMs: ts(1) });
    conn.release();

    const result = await svc.query({
      symbol: SYMBOL, interval: '1m',
      startTsMs: ts(0), endTsMs: ts(3),
    });

    expect(result.bars.length).toBe(3);
    expect(result.bars[0].barOpenTsMs).toBe(ts(0));
    expect(result.bars[1].barOpenTsMs).toBe(ts(1));
    expect(result.bars[2].barOpenTsMs).toBe(ts(2));
  });

  it('TEST-123A4-HIS-002: excludes PENDING bars', async () => {
    const conn = await pool.getConnection();
    await insert1m(conn, { barOpenTsMs: ts(0), reconciliationStatus: 'MATCHED' });
    await insert1m(conn, { barOpenTsMs: ts(1), reconciliationStatus: 'PENDING' });
    conn.release();

    const result = await svc.query({
      symbol: SYMBOL, interval: '1m',
      startTsMs: ts(0), endTsMs: ts(2),
    });

    expect(result.bars.length).toBe(1);
    expect(result.bars[0].barOpenTsMs).toBe(ts(0));
  });

  it('TEST-123A4-HIS-003: excludes UNMATCHED bars', async () => {
    const conn = await pool.getConnection();
    await insert1m(conn, { barOpenTsMs: ts(0), reconciliationStatus: 'MATCHED' });
    await insert1m(conn, { barOpenTsMs: ts(1), reconciliationStatus: 'UNMATCHED' });
    conn.release();

    const result = await svc.query({
      symbol: SYMBOL, interval: '1m',
      startTsMs: ts(0), endTsMs: ts(2),
    });

    expect(result.bars.length).toBe(1);
  });

  it('TEST-123A4-HIS-004: excludes UNAVAILABLE bars', async () => {
    const conn = await pool.getConnection();
    await insert1m(conn, { barOpenTsMs: ts(0), reconciliationStatus: 'MATCHED' });
    await insert1m(conn, { barOpenTsMs: ts(1), reconciliationStatus: 'UNAVAILABLE' });
    conn.release();

    const result = await svc.query({
      symbol: SYMBOL, interval: '1m',
      startTsMs: ts(0), endTsMs: ts(2),
    });

    expect(result.bars.length).toBe(1);
  });

  it('TEST-123A4-HIS-005: selects highest revision per logical bar', async () => {
    const conn = await pool.getConnection();
    // Two rows for the same logical bar — revision 1 and revision 2
    await insert1m(conn, { barOpenTsMs: ts(0), revision: 1, closePts100: 2_103_000 });
    await insert1m(conn, { barOpenTsMs: ts(0), revision: 2, closePts100: 2_104_000 });
    conn.release();

    const result = await svc.query({
      symbol: SYMBOL, interval: '1m',
      startTsMs: ts(0), endTsMs: ts(1),
    });

    expect(result.bars.length).toBe(1);
    expect(result.bars[0].revision).toBe(2);
    expect(result.bars[0].closePts100).toBe(2_104_000);
  });

  it('TEST-123A4-HIS-006: respects startTsMs / endTsMs range', async () => {
    const conn = await pool.getConnection();
    await insert1m(conn, { barOpenTsMs: ts(0) }); // outside range
    await insert1m(conn, { barOpenTsMs: ts(1) }); // inside
    await insert1m(conn, { barOpenTsMs: ts(2) }); // inside
    await insert1m(conn, { barOpenTsMs: ts(3) }); // outside range
    conn.release();

    const result = await svc.query({
      symbol: SYMBOL, interval: '1m',
      startTsMs: ts(1), endTsMs: ts(2),
    });

    expect(result.bars.length).toBe(2);
    expect(result.bars[0].barOpenTsMs).toBe(ts(1));
    expect(result.bars[1].barOpenTsMs).toBe(ts(2));
  });

  it('TEST-123A4-HIS-007: respects cursor (pagination)', async () => {
    const conn = await pool.getConnection();
    for (let i = 0; i < 5; i++) {
      await insert1m(conn, { barOpenTsMs: ts(i) });
    }
    conn.release();

    // First page: limit=2
    const page1 = await svc.query({
      symbol: SYMBOL, interval: '1m',
      startTsMs: ts(0), endTsMs: ts(5), limit: 2,
    });
    expect(page1.bars.length).toBe(2);
    expect(page1.hasMore).toBe(true);
    expect(page1.nextCursor).toBe(ts(1));

    // Second page: cursor = last bar from page 1
    const page2 = await svc.query({
      symbol: SYMBOL, interval: '1m',
      startTsMs: ts(0), endTsMs: ts(5), limit: 2,
      cursor: page1.nextCursor!,
    });
    expect(page2.bars.length).toBe(2);
    expect(page2.bars[0].barOpenTsMs).toBe(ts(2));
    expect(page2.bars[1].barOpenTsMs).toBe(ts(3));
    expect(page2.hasMore).toBe(true);

    // Third page
    const page3 = await svc.query({
      symbol: SYMBOL, interval: '1m',
      startTsMs: ts(0), endTsMs: ts(5), limit: 2,
      cursor: page2.nextCursor!,
    });
    expect(page3.bars.length).toBe(1);
    expect(page3.hasMore).toBe(false);
  });

  it('TEST-123A4-HIS-008: hasMore=true when rows > limit', async () => {
    const conn = await pool.getConnection();
    for (let i = 0; i < 5; i++) {
      await insert1m(conn, { barOpenTsMs: ts(i) });
    }
    conn.release();

    const result = await svc.query({
      symbol: SYMBOL, interval: '1m',
      startTsMs: ts(0), endTsMs: ts(5), limit: 3,
    });

    expect(result.hasMore).toBe(true);
    expect(result.bars.length).toBe(3);
  });

  it('TEST-123A4-HIS-009: hasMore=false when rows <= limit', async () => {
    const conn = await pool.getConnection();
    for (let i = 0; i < 3; i++) {
      await insert1m(conn, { barOpenTsMs: ts(i) });
    }
    conn.release();

    const result = await svc.query({
      symbol: SYMBOL, interval: '1m',
      startTsMs: ts(0), endTsMs: ts(3), limit: 10,
    });

    expect(result.hasMore).toBe(false);
    expect(result.nextCursor).toBeNull();
  });

  it('TEST-123A4-HIS-010: returns empty array when no MATCHED bars', async () => {
    const conn = await pool.getConnection();
    await insert1m(conn, { barOpenTsMs: ts(0), reconciliationStatus: 'PENDING' });
    conn.release();

    const result = await svc.query({
      symbol: SYMBOL, interval: '1m',
      startTsMs: ts(0), endTsMs: ts(1),
    });

    expect(result.bars.length).toBe(0);
    expect(result.hasMore).toBe(false);
  });

  it('TEST-123A4-HIS-011: isolates by symbol (different symbols do not bleed)', async () => {
    const conn = await pool.getConnection();
    await insert1m(conn, { rawSymbol: SYMBOL,  barOpenTsMs: ts(0), instrumentId: 12345 });
    await insert1m(conn, { rawSymbol: SYMBOL2, barOpenTsMs: ts(0), instrumentId: 99999 });
    conn.release();

    const result = await svc.query({
      symbol: SYMBOL, interval: '1m',
      startTsMs: ts(0), endTsMs: ts(1),
    });

    expect(result.bars.length).toBe(1);
    expect(result.bars[0].rawSymbol).toBe(SYMBOL);
  });

  it('TEST-123A4-HIS-019: dataQuality=GOOD for MATCHED bars', async () => {
    const conn = await pool.getConnection();
    await insert1m(conn, { barOpenTsMs: ts(0), reconciliationStatus: 'MATCHED' });
    conn.release();

    const result = await svc.query({
      symbol: SYMBOL, interval: '1m',
      startTsMs: ts(0), endTsMs: ts(1),
    });

    expect(result.bars[0].dataQuality).toBe('GOOD');
    expect(result.bars[0].reconciliationStatus).toBe('MATCHED');
  });

  it('TEST-123A4-HIS-021: returns correct pts100 values (no division by 100)', async () => {
    const conn = await pool.getConnection();
    await insert1m(conn, { barOpenTsMs: ts(0), openPts100: 2_100_000, closePts100: 2_103_000 });
    conn.release();

    const result = await svc.query({
      symbol: SYMBOL, interval: '1m',
      startTsMs: ts(0), endTsMs: ts(1),
    });

    expect(result.bars[0].openPts100).toBe(2_100_000);
    expect(result.bars[0].closePts100).toBe(2_103_000);
  });
});

// ─── 5m tests ─────────────────────────────────────────────────────────────────

describe('Sprint 123A.4 — ChartHistoryService MySQL: 5m bars (eligibility contract)', () => {

  it('TEST-123A4-HIS-012: LIVE_CONFIRMED bars are returned', async () => {
    const conn = await pool.getConnection();
    await insert5m(conn, { barOpenTsMs: ts(0), canonicalBarType: 'LIVE_CONFIRMED' });
    conn.release();

    const result = await svc.query({
      symbol: SYMBOL, interval: '5m',
      startTsMs: ts(0), endTsMs: ts(5),
    });

    expect(result.bars.length).toBe(1);
    expect(result.bars[0].canonicalBarType).toBe('LIVE_CONFIRMED');
  });

  it('TEST-123A4-HIS-013: RECOVERED bars are returned', async () => {
    const conn = await pool.getConnection();
    await insert5m(conn, { barOpenTsMs: ts(0), canonicalBarType: 'RECOVERED' });
    conn.release();

    const result = await svc.query({
      symbol: SYMBOL, interval: '5m',
      startTsMs: ts(0), endTsMs: ts(5),
    });

    expect(result.bars.length).toBe(1);
    expect(result.bars[0].canonicalBarType).toBe('RECOVERED');
    expect(result.bars[0].isRecovered).toBe(true);
  });

  it('TEST-123A4-HIS-014: CONTAINS_SYNTHETIC bars are excluded (5m eligibility contract)', async () => {
    const conn = await pool.getConnection();
    await insert5m(conn, { barOpenTsMs: ts(0),  canonicalBarType: 'LIVE_CONFIRMED' });
    await insert5m(conn, { barOpenTsMs: ts(5),  canonicalBarType: 'CONTAINS_SYNTHETIC' });
    await insert5m(conn, { barOpenTsMs: ts(10), canonicalBarType: 'RECOVERED' });
    conn.release();

    const result = await svc.query({
      symbol: SYMBOL, interval: '5m',
      startTsMs: ts(0), endTsMs: ts(15),
    });

    expect(result.bars.length).toBe(2);
    const types = result.bars.map(b => b.canonicalBarType);
    expect(types).not.toContain('CONTAINS_SYNTHETIC');
    expect(types).toContain('LIVE_CONFIRMED');
    expect(types).toContain('RECOVERED');
  });

  it('TEST-123A4-HIS-015: selects highest revision per logical 5m bar', async () => {
    const conn = await pool.getConnection();
    await insert5m(conn, { barOpenTsMs: ts(0), revision: 1 });
    await insert5m(conn, { barOpenTsMs: ts(0), revision: 2 });
    conn.release();

    const result = await svc.query({
      symbol: SYMBOL, interval: '5m',
      startTsMs: ts(0), endTsMs: ts(5),
    });

    expect(result.bars.length).toBe(1);
    expect(result.bars[0].revision).toBe(2);
  });

  it('TEST-123A4-HIS-016: respects startTsMs / endTsMs range for 5m', async () => {
    const conn = await pool.getConnection();
    await insert5m(conn, { barOpenTsMs: ts(0)  }); // outside
    await insert5m(conn, { barOpenTsMs: ts(5)  }); // inside
    await insert5m(conn, { barOpenTsMs: ts(10) }); // inside
    await insert5m(conn, { barOpenTsMs: ts(15) }); // outside
    conn.release();

    const result = await svc.query({
      symbol: SYMBOL, interval: '5m',
      startTsMs: ts(5), endTsMs: ts(10),
    });

    expect(result.bars.length).toBe(2);
  });

  it('TEST-123A4-HIS-017: cursor pagination for 5m', async () => {
    const conn = await pool.getConnection();
    for (let i = 0; i < 4; i++) {
      await insert5m(conn, { barOpenTsMs: ts(i * 5) });
    }
    conn.release();

    const page1 = await svc.query({
      symbol: SYMBOL, interval: '5m',
      startTsMs: ts(0), endTsMs: ts(20), limit: 2,
    });
    expect(page1.bars.length).toBe(2);
    expect(page1.hasMore).toBe(true);

    const page2 = await svc.query({
      symbol: SYMBOL, interval: '5m',
      startTsMs: ts(0), endTsMs: ts(20), limit: 2,
      cursor: page1.nextCursor!,
    });
    expect(page2.bars.length).toBe(2);
    expect(page2.hasMore).toBe(false);
  });

  it('TEST-123A4-HIS-018: hasMore=true when 5m rows > limit', async () => {
    const conn = await pool.getConnection();
    for (let i = 0; i < 4; i++) {
      await insert5m(conn, { barOpenTsMs: ts(i * 5) });
    }
    conn.release();

    const result = await svc.query({
      symbol: SYMBOL, interval: '5m',
      startTsMs: ts(0), endTsMs: ts(20), limit: 2,
    });

    expect(result.hasMore).toBe(true);
  });

  it('TEST-123A4-HIS-020: dataQuality=GOOD for LIVE_CONFIRMED, DEGRADED for RECOVERED', async () => {
    const conn = await pool.getConnection();
    await insert5m(conn, { barOpenTsMs: ts(0),  canonicalBarType: 'LIVE_CONFIRMED' });
    await insert5m(conn, { barOpenTsMs: ts(5),  canonicalBarType: 'RECOVERED' });
    conn.release();

    const result = await svc.query({
      symbol: SYMBOL, interval: '5m',
      startTsMs: ts(0), endTsMs: ts(10),
    });

    expect(result.bars.length).toBe(2);
    const lc = result.bars.find(b => b.canonicalBarType === 'LIVE_CONFIRMED');
    const rc = result.bars.find(b => b.canonicalBarType === 'RECOVERED');
    expect(lc?.dataQuality).toBe('GOOD');
    expect(rc?.dataQuality).toBe('DEGRADED');
  });
});
