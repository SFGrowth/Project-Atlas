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
 * 1m bars (atlas_bars_1m):
 *   - Only bars with reconciliation_status = 'MATCHED' are returned
 *   - PENDING, UNMATCHED, UNAVAILABLE bars are excluded
 *   - For each logical bar, the highest eligible revision is selected
 *
 * 5m bars (atlas_bars_5m):
 *   - Only bars with canonical_bar_type IN ('LIVE_CONFIRMED', 'RECOVERED') are returned
 *   - CONTAINS_SYNTHETIC bars are excluded (FE-5m eligibility contract)
 *   - For each logical bar, the highest eligible revision is selected
 *
 * Common rules:
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
  openPts100: number | null;
  highPts100: number | null;
  lowPts100: number | null;
  closePts100: number | null;
  volume: number | null;
  tradeCount: number | null;
  revision: number;
  mappingVersion: string;
  /** Only present for 1m bars. */
  reconciliationStatus: string | null;
  /** Only present for 5m bars. */
  canonicalBarType: string | null;
  /** True if this bar was gap-recovered (1m only). */
  isRecovered: boolean;
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
    const requestedAt = Date.now();

    const bars = req.interval === '1m'
      ? await this._query1m(req, limit)
      : await this._query5m(req, limit);

    const hasMore = bars.length > limit;
    const resultBars = hasMore ? bars.slice(0, limit) : bars;

    return {
      bars: resultBars,
      total: resultBars.length,
      hasMore,
      nextCursor: hasMore && resultBars.length > 0
        ? resultBars[resultBars.length - 1].barOpenTsMs
        : null,
      requestedAt,
    };
  }

  // ── 1m query: filter by reconciliation_status = 'MATCHED' ─────────────────

  private async _query1m(req: HistoricalBarRequest, limit: number): Promise<HistoricalBarRecord[]> {
    const cursorClause = req.cursor !== undefined ? 'AND bar_open_ts_ms > ?' : '';

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
        NULL AS canonical_bar_type
      FROM atlas_bars_1m b
      INNER JOIN (
        SELECT
          raw_symbol,
          instrument_id,
          interval_ms,
          bar_open_ts_ms,
          mapping_version,
          MAX(revision) AS max_revision
        FROM atlas_bars_1m
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

    const params: unknown[] = [req.symbol.trim(), req.startTsMs, req.endTsMs];
    if (req.cursor !== undefined) params.push(req.cursor);
    params.push(limit + 1);

    const [rows] = await this.pool.query(sql, params) as [any[], any];
    return rows.map((row: any) => _map1mRow(row));
  }

  // ── 5m query: filter by canonical_bar_type IN ('LIVE_CONFIRMED', 'RECOVERED') ─

  private async _query5m(req: HistoricalBarRequest, limit: number): Promise<HistoricalBarRecord[]> {
    const cursorClause = req.cursor !== undefined ? 'AND bar_open_ts_ms > ?' : '';

    // FE-5m eligibility contract: CONTAINS_SYNTHETIC bars are excluded
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
        NULL AS reconciliation_status,
        b.canonical_bar_type
      FROM atlas_bars_5m b
      INNER JOIN (
        SELECT
          raw_symbol,
          instrument_id,
          interval_ms,
          bar_open_ts_ms,
          mapping_version,
          MAX(revision) AS max_revision
        FROM atlas_bars_5m
        WHERE raw_symbol = ?
          AND canonical_bar_type IN ('LIVE_CONFIRMED', 'RECOVERED')
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
      WHERE b.canonical_bar_type IN ('LIVE_CONFIRMED', 'RECOVERED')
      ORDER BY b.bar_open_ts_ms ASC
      LIMIT ?
    `;

    const params: unknown[] = [req.symbol.trim(), req.startTsMs, req.endTsMs];
    if (req.cursor !== undefined) params.push(req.cursor);
    params.push(limit + 1);

    const [rows] = await this.pool.query(sql, params) as [any[], any];
    return rows.map((row: any) => _map5mRow(row));
  }
}

// ─── Row mappers ──────────────────────────────────────────────────────────────

function _map1mRow(row: any): HistoricalBarRecord {
  return {
    source:               row.source,
    dataset:              row.dataset,
    canonicalSymbol:      row.raw_symbol,
    rawSymbol:            row.raw_symbol,
    instrumentId:         Number(row.instrument_id),
    intervalMs:           Number(row.interval_ms),
    barOpenTsMs:          Number(row.bar_open_ts_ms),
    barCloseTsMs:         Number(row.bar_close_ts_ms),
    openPts100:           row.open_price_pts100 !== null ? Number(row.open_price_pts100) : null,
    highPts100:           row.high_price_pts100 !== null ? Number(row.high_price_pts100) : null,
    lowPts100:            row.low_price_pts100 !== null ? Number(row.low_price_pts100) : null,
    closePts100:          row.close_price_pts100 !== null ? Number(row.close_price_pts100) : null,
    volume:               row.volume !== null ? Number(row.volume) : null,
    tradeCount:           row.trade_count !== null ? Number(row.trade_count) : null,
    revision:             Number(row.revision),
    mappingVersion:       row.mapping_version,
    reconciliationStatus: row.reconciliation_status ?? null,
    canonicalBarType:     null,
    isRecovered:          false, // 1m bars use gap recovery via GapRecoveryOrchestrator — not a column
    dataQuality:          row.reconciliation_status === 'MATCHED' ? 'GOOD' : 'DEGRADED',
  };
}

function _map5mRow(row: any): HistoricalBarRecord {
  const barType = row.canonical_bar_type as string;
  return {
    source:               row.source,
    dataset:              row.dataset,
    canonicalSymbol:      row.raw_symbol,
    rawSymbol:            row.raw_symbol,
    instrumentId:         Number(row.instrument_id),
    intervalMs:           Number(row.interval_ms),
    barOpenTsMs:          Number(row.bar_open_ts_ms),
    barCloseTsMs:         Number(row.bar_close_ts_ms),
    openPts100:           row.open_price_pts100 !== null ? Number(row.open_price_pts100) : null,
    highPts100:           row.high_price_pts100 !== null ? Number(row.high_price_pts100) : null,
    lowPts100:            row.low_price_pts100 !== null ? Number(row.low_price_pts100) : null,
    closePts100:          row.close_price_pts100 !== null ? Number(row.close_price_pts100) : null,
    volume:               row.volume !== null ? Number(row.volume) : null,
    tradeCount:           row.trade_count !== null ? Number(row.trade_count) : null,
    revision:             Number(row.revision),
    mappingVersion:       row.mapping_version,
    reconciliationStatus: null,
    canonicalBarType:     barType ?? null,
    isRecovered:          barType === 'RECOVERED',
    dataQuality:          barType === 'LIVE_CONFIRMED' ? 'GOOD' : 'DEGRADED',
  };
}
