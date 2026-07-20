/**
 * Atlas Chart History Service
 * Sprint 123A.4 — Live Chart and Databento Shadow Integration
 *
 * Provides authenticated historical bar queries for the Atlas live chart.
 *
 * AUTHORITY BOUNDARY
 * ------------------
 * This service reads confirmed canonical bars ONLY. It MUST NOT:
 *   - trigger processBar
 *   - trigger postBarAutomation
 *   - expose database internals or secrets
 *   - serve DEVELOPING or PROVISIONAL bars
 *   - serve UNRESOLVED bars as confirmed
 *
 * QUERY RULES
 * -----------
 *   - Only CONFIRMED bars with reconciliation_status = MATCHED are returned
 *   - DEVELOPING, PROVISIONAL, UNRESOLVED bars are excluded
 *   - For each logical bar (same canonical identity excluding revision),
 *     the highest eligible confirmed revision is selected
 *   - Bars are returned in ascending barOpenTsMs order
 *   - Maximum range: 7 days
 *   - Maximum rows: 10,000
 *
 * Sprint 123A.4 — Gate G3 Approved
 */

import type { Pool } from 'mysql2/promise';

// ─── Request / Response types ─────────────────────────────────────────────────

export interface HistoricalBarRequest {
  /** Canonical symbol or raw symbol (e.g. 'MNQM5', 'MNQ1!'). */
  symbol: string;
  /** Bar interval: '1m' or '5m'. */
  interval: '1m' | '5m';
  /** Start timestamp (UTC milliseconds, inclusive). */
  startTsMs: number;
  /** End timestamp (UTC milliseconds, inclusive). */
  endTsMs: number;
  /** Maximum number of bars to return (default 500, max 10000). */
  limit?: number;
  /** Cursor for pagination: barOpenTsMs of the last bar in the previous page. */
  cursor?: number;
}

export interface HistoricalBarRecord {
  source: string;
  dataset: string;
  canonicalSymbol: string;
  rawSymbol: string;
  instrumentId: number;
  intervalMs: number;
  barOpenTsMs: number;
  barCloseTsMs: number;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
  tradeCount: number | null;
  revision: number;
  mappingVersion: string;
  reconciliationStatus: string;
  recovered: boolean;
  dataQuality: 'GOOD' | 'DEGRADED' | 'UNAVAILABLE';
}

export interface HistoricalBarResponse {
  bars: HistoricalBarRecord[];
  total: number;
  hasMore: boolean;
  nextCursor: number | null;
  requestedAt: number;
}

// ─── Validation ───────────────────────────────────────────────────────────────

const SUPPORTED_INTERVALS = ['1m', '5m'] as const;
const MAX_RANGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 10_000;

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

function validateRequest(req: HistoricalBarRequest): void {
  if (!req.symbol || typeof req.symbol !== 'string' || req.symbol.trim() === '') {
    throw new ValidationError('symbol is required');
  }
  if (!SUPPORTED_INTERVALS.includes(req.interval as any)) {
    throw new ValidationError(`interval must be one of: ${SUPPORTED_INTERVALS.join(', ')}`);
  }
  if (typeof req.startTsMs !== 'number' || !isFinite(req.startTsMs) || req.startTsMs < 0) {
    throw new ValidationError('startTsMs must be a valid positive timestamp');
  }
  if (typeof req.endTsMs !== 'number' || !isFinite(req.endTsMs) || req.endTsMs < 0) {
    throw new ValidationError('endTsMs must be a valid positive timestamp');
  }
  if (req.endTsMs <= req.startTsMs) {
    throw new ValidationError('endTsMs must be greater than startTsMs');
  }
  if (req.endTsMs - req.startTsMs > MAX_RANGE_MS) {
    throw new ValidationError(`Time range exceeds maximum of 7 days`);
  }
  if (req.limit !== undefined) {
    if (!Number.isInteger(req.limit) || req.limit < 1 || req.limit > MAX_LIMIT) {
      throw new ValidationError(`limit must be an integer between 1 and ${MAX_LIMIT}`);
    }
  }
}

// ─── ChartHistoryService ──────────────────────────────────────────────────────

export class ChartHistoryService {
  private readonly pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async query(req: HistoricalBarRequest): Promise<HistoricalBarResponse> {
    validateRequest(req);

    const limit = Math.min(req.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const table = req.interval === '1m' ? 'atlas_bars_1m' : 'atlas_bars_5m';
    const requestedAt = Date.now();

    // Build the query:
    // - Only CONFIRMED lifecycle (reconciliation_status = 'MATCHED')
    // - Select highest revision per logical bar
    // - Filter by symbol (raw_symbol), time range, cursor
    // - Order by barOpenTsMs ASC
    // - Limit + 1 to detect hasMore

    const cursorClause = req.cursor !== undefined
      ? 'AND b.bar_open_ts_ms > ?'
      : '';

    const sql = `
      SELECT
        b.source,
        b.dataset,
        b.raw_symbol,
        b.instrument_id,
        b.interval_ms,
        b.bar_open_ts_ms,
        b.bar_close_ts_ms,
        b.open_price_pts100,
        b.high_price_pts100,
        b.low_price_pts100,
        b.close_price_pts100,
        b.volume,
        b.trade_count,
        b.revision,
        b.mapping_version,
        b.reconciliation_status,
        b.is_recovered
      FROM ${table} b
      INNER JOIN (
        SELECT
          raw_symbol,
          instrument_id,
          interval_ms,
          bar_open_ts_ms,
          mapping_version,
          MAX(revision) AS max_revision
        FROM ${table}
        WHERE raw_symbol = ?
          AND reconciliation_status = 'MATCHED'
          AND bar_open_ts_ms >= ?
          AND bar_open_ts_ms <= ?
          ${cursorClause}
        GROUP BY raw_symbol, instrument_id, interval_ms, bar_open_ts_ms, mapping_version
      ) latest ON
        b.raw_symbol = latest.raw_symbol
        AND b.instrument_id = latest.instrument_id
        AND b.interval_ms = latest.interval_ms
        AND b.bar_open_ts_ms = latest.bar_open_ts_ms
        AND b.mapping_version = latest.mapping_version
        AND b.revision = latest.max_revision
      WHERE b.reconciliation_status = 'MATCHED'
      ORDER BY b.bar_open_ts_ms ASC
      LIMIT ?
    `;

    const params: unknown[] = [
      req.symbol.trim(),
      req.startTsMs,
      req.endTsMs,
    ];
    if (req.cursor !== undefined) params.push(req.cursor);
    params.push(limit + 1);

    const [rows] = await this.pool.execute(sql, params) as [any[], any];

    const hasMore = rows.length > limit;
    const resultRows = hasMore ? rows.slice(0, limit) : rows;

    const bars: HistoricalBarRecord[] = resultRows.map((row: any) => ({
      source: row.source,
      dataset: row.dataset,
      canonicalSymbol: row.raw_symbol,
      rawSymbol: row.raw_symbol,
      instrumentId: row.instrument_id,
      intervalMs: row.interval_ms,
      barOpenTsMs: Number(row.bar_open_ts_ms),
      barCloseTsMs: Number(row.bar_close_ts_ms),
      open: row.open_price_pts100 !== null ? row.open_price_pts100 / 100 : null,
      high: row.high_price_pts100 !== null ? row.high_price_pts100 / 100 : null,
      low: row.low_price_pts100 !== null ? row.low_price_pts100 / 100 : null,
      close: row.close_price_pts100 !== null ? row.close_price_pts100 / 100 : null,
      volume: row.volume,
      tradeCount: row.trade_count,
      revision: row.revision,
      mappingVersion: row.mapping_version,
      reconciliationStatus: row.reconciliation_status,
      recovered: Boolean(row.is_recovered),
      dataQuality: _computeDataQuality(row),
    }));

    return {
      bars,
      total: bars.length,
      hasMore,
      nextCursor: hasMore && bars.length > 0
        ? bars[bars.length - 1].barOpenTsMs
        : null,
      requestedAt,
    };
  }
}

function _computeDataQuality(row: any): 'GOOD' | 'DEGRADED' | 'UNAVAILABLE' {
  if (row.reconciliation_status === 'MATCHED') return 'GOOD';
  if (row.reconciliation_status === 'WITHIN_TOLERANCE') return 'DEGRADED';
  return 'UNAVAILABLE';
}
