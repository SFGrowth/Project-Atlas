/**
 * bar-persistence.ts — Effectively-Once Persistence Layer
 *
 * Writes one-minute bars and five-minute bars to the database with
 * effectively-once semantics using the unique constraints defined in
 * migrations 0026 + 0027.
 *
 * ACTUAL SCHEMA (from SHOW CREATE TABLE — verified against disposable MySQL 8):
 *
 *   atlas_bars_1m: UNIQUE KEY uq_atlas_bars_1m_canonical_identity
 *     (source, dataset, raw_symbol, instrument_id, interval_ms, bar_open_ts_ms, revision, mapping_version)
 *     — 8 columns. interval_ms INT NOT NULL DEFAULT 60000.
 *
 *   atlas_bars_5m: UNIQUE KEY uq_atlas_bars_5m_canonical_identity
 *     (source, dataset, raw_symbol, instrument_id, interval_ms, bar_open_ts_ms, revision, mapping_version)
 *     — 8 columns. interval_ms INT NOT NULL DEFAULT 300000.
 *
 *   atlas_bar_processing_ledger: UNIQUE KEY uq_atlas_bar_processing_ledger
 *     (source, dataset, raw_symbol, instrument_id, bar_open_ts_ms, revision,
 *      mapping_version, consumer_name, consumer_version)
 *     — 9 columns.
 *
 * DUPLICATE HANDLING POLICY (Gate G3 Revision 5):
 *   Effectively-once is implemented via plain INSERT followed by ER_DUP_ENTRY
 *   (errno 1062) catch. This is the preferred robust approach because:
 *
 *   EMPIRICAL FINDING (Gate G3 Revision 5 verification):
 *     ON DUPLICATE KEY UPDATE id = id returns affectedRows=1 for BOTH a new
 *     insert AND an exact duplicate when CLIENT_FOUND_ROWS is not set.
 *     The only distinguishing field is insertId (> 0 for new rows, 0 for
 *     duplicates), but this is fragile with multi-row inserts and auto-increment
 *     gaps. Therefore, plain INSERT + ER_DUP_ENTRY catch is used instead.
 *
 *   - New row: INSERT succeeds → { inserted: true, rowId: N }
 *   - Duplicate: INSERT throws ER_DUP_ENTRY (errno 1062) → { inserted: false }
 *   - Any other error: re-thrown immediately (NOT silently swallowed)
 *
 *   INSERT IGNORE is PROHIBITED. It silently swallows non-duplicate errors
 *   (e.g., NOT NULL violations, oversized strings) and must never be used.
 *
 * TRANSACTION POLICY (Gate G3 Revision 5):
 *   Any operation that writes more than one row (bar + ledger) uses an explicit
 *   transaction via pool.getConnection() + conn.beginTransaction().
 *   If any write fails for a non-duplicate reason, the entire transaction is
 *   rolled back via conn.rollback() and neither row remains.
 *
 * UNRESOLVED BAR POLICY (Gate G3 Revision 3):
 *   UNRESOLVED bars MAY be persisted to atlas_bars_1m as evidence rows.
 *   They are clearly non-canonical (reconciliation_status = UNMATCHED or
 *   UNAVAILABLE). They are NEVER forwarded to the five-minute aggregator
 *   as confirmed inputs. They are NEVER written to atlas_canonical_bars.
 *   They cannot trigger processBar or postBarAutomation.
 *   Recovery can later create a new revision (revision + 1) without
 *   overwriting the evidence row (the unique key includes revision).
 *
 * AUTHORITY NOTE: This module writes to atlas_bars_1m and atlas_bars_5m only.
 *   It does NOT write to atlas_canonical_bars.
 *   It does NOT trigger processBar or postBarAutomation.
 *   MARKET_DATA_AUTHORITY = TRADINGVIEW_ONLY throughout Sprint 123A.3.
 *
 * PRODUCTION SAFETY: This module requires migrations 0026 and 0027 to have
 *   been applied. These migrations must NOT be run against the production
 *   database without Phil's explicit written approval at Gate G3.
 *
 * Sprint 123A.3 — Gate G3 Revision 5
 */

import { MinuteBar, FiveMinBar, ReconciliationStatus, BarLifecycle } from './types/bar-lifecycle.js';

// ─── MySQL Error Codes ────────────────────────────────────────────────────────

/** MySQL error code for duplicate key violation. */
export const ER_DUP_ENTRY = 1062;

/** Type guard for MySQL errors with an errno field. */
export function isMySQLError(err: unknown): err is { errno: number; code: string; message: string } {
  return typeof err === 'object' && err !== null && 'errno' in err && 'code' in err;
}

/** Returns true if the error is a duplicate-key violation (ER_DUP_ENTRY). */
export function isDuplicateKeyError(err: unknown): boolean {
  return isMySQLError(err) && err.errno === ER_DUP_ENTRY;
}

// ─── Database Adapter Interface ───────────────────────────────────────────────

/**
 * Minimal database adapter interface for persistence.
 * In production, this is backed by the Drizzle ORM connection.
 * In tests, this is backed by a disposable MySQL 8 instance or in-memory adapter.
 *
 * DUPLICATE HANDLING CONTRACT (Gate G3 Revision 5):
 *   All insert methods use plain INSERT (no ON DUPLICATE KEY, no INSERT IGNORE)
 *   and catch ER_DUP_ENTRY (errno 1062) to return { inserted: false }.
 *   All other errors are re-thrown immediately.
 *   warningStatus must be 0 for every successful write.
 */
export interface BarDatabaseAdapter {
  insertBar1m(row: InsertBar1mRow): Promise<PersistenceResult>;
  insertBar5m(row: InsertBar5mRow): Promise<PersistenceResult>;
  isAlreadyProcessed(consumerId: string, consumerVersion: string, eventKey: string): Promise<boolean>;
  markProcessed(consumerId: string, consumerVersion: string, eventType: string, eventKey: string): Promise<LedgerResult>;

  /**
   * Persist a bar and mark it as processed in a single explicit transaction.
   * Uses pool.getConnection() + conn.beginTransaction() / conn.commit() / conn.rollback().
   * If the ledger insert fails for any reason other than ER_DUP_ENTRY, the
   * entire transaction is rolled back and neither row remains.
   */
  persistBarWithLedger(
    bar1mRow: InsertBar1mRow,
    ledgerRow: InsertLedgerRow,
  ): Promise<TransactionResult>;
}

// ─── Row Types ────────────────────────────────────────────────────────────────

export interface InsertBar1mRow {
  source: 'DATABENTO';
  dataset: string;
  rawSymbol: string;
  instrumentId: number;
  /** Bar interval in milliseconds. Always 60000 for atlas_bars_1m. */
  intervalMs: 60000;
  barOpenTsMs: number;
  barOpenTsNs: string;
  barCloseTsMs: number;
  openPricePts100: number | null;
  highPricePts100: number | null;
  lowPricePts100: number | null;
  closePricePts100: number | null;
  volume: number | null;
  tradeCount: number | null;
  reconciliationStatus: ReconciliationStatus;
  reconCloseDeltaPts100: number | null;
  reconHighDeltaPts100: number | null;
  reconLowDeltaPts100: number | null;
  reconVolumeDelta: number | null;
  reconWithinTolerance: boolean | null;
  reconTolerancePts100: number | null;
  revision: number;
  mappingVersion: string;
  atlasTsMs: number;
}

export interface InsertBar5mRow {
  source: 'DATABENTO';
  dataset: string;
  rawSymbol: string;
  instrumentId: number;
  /** Bar interval in milliseconds. Always 300000 for atlas_bars_5m. */
  intervalMs: 300000;
  barOpenTsMs: number;
  barCloseTsMs: number;
  openPricePts100: number | null;
  highPricePts100: number | null;
  lowPricePts100: number | null;
  closePricePts100: number | null;
  volume: number | null;
  tradeCount: number | null;
  minuteBarCount: 5;
  canonicalBarType: 'LIVE_CONFIRMED' | 'CONTAINS_SYNTHETIC' | 'RECOVERED';
  revision: number;
  mappingVersion: string;
  atlasTsMs: number;
}

export interface InsertLedgerRow {
  source: 'DATABENTO';
  dataset: string;
  rawSymbol: string;
  instrumentId: number;
  barOpenTsMs: number;
  revision: number;
  mappingVersion: string;
  consumerName: string;
  consumerVersion: string;
  processedAtMs: number;
  success: boolean;
  errorMessage: string | null;
  atlasTsMs: number;
}

// ─── Result Types ─────────────────────────────────────────────────────────────

export interface PersistenceResult {
  /** Whether the row was newly inserted (true) or was a duplicate (false). */
  inserted: boolean;
  /** The auto-increment row ID of the inserted row, or null if it was a duplicate. */
  rowId: number | null;
  /** warningStatus from the MySQL driver — must be 0 for clean writes. */
  warningStatus: number;
}

export interface LedgerResult {
  /** Whether the ledger entry was newly inserted (true) or was a duplicate (false). */
  alreadyProcessed: boolean;
  /** warningStatus from the MySQL driver — must be 0 for clean writes. */
  warningStatus: number;
}

export interface TransactionResult {
  barInserted: boolean;
  ledgerInserted: boolean;
  barRowId: number | null;
  /** True if the entire transaction was rolled back due to a non-duplicate error. */
  rolledBack: boolean;
}

// ─── Bar Persistence ──────────────────────────────────────────────────────────

export class BarPersistence {
  private readonly db: BarDatabaseAdapter;
  private readonly consumerVersion: string;

  constructor(db: BarDatabaseAdapter, consumerVersion = 'v1') {
    this.db = db;
    this.consumerVersion = consumerVersion;
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * Persist a one-minute bar to atlas_bars_1m.
   *
   * CONFIRMED bars: persisted as canonical evidence.
   * UNRESOLVED bars: persisted as non-canonical evidence (reconciliation_status
   *   = UNMATCHED or UNAVAILABLE). Never forwarded to the five-minute aggregator.
   *   Never written to atlas_canonical_bars. Cannot trigger processBar.
   *
   * Returns { inserted: false } if the bar lifecycle is not CONFIRMED or UNRESOLVED.
   * Throws for all non-duplicate database errors.
   */
  async persistBar1m(bar: MinuteBar): Promise<PersistenceResult> {
    if (bar.lifecycle !== BarLifecycle.CONFIRMED && bar.lifecycle !== BarLifecycle.UNRESOLVED) {
      return { inserted: false, rowId: null, warningStatus: 0 };
    }
    const row = this._toBar1mRow(bar);
    return this.db.insertBar1m(row);
  }

  /**
   * Persist a five-minute bar to atlas_bars_5m.
   *
   * INVARIANT: The FiveMinBar must have minuteBarCount === 5.
   * INVARIANT: All constituent bars must be CONFIRMED (enforced by FiveMinAggregator).
   * Throws for all non-duplicate database errors.
   */
  async persistBar5m(bar: FiveMinBar): Promise<PersistenceResult> {
    if (bar.minuteBarCount !== 5) {
      return { inserted: false, rowId: null, warningStatus: 0 };
    }
    const row = this._toBar5mRow(bar);
    return this.db.insertBar5m(row);
  }

  /**
   * Persist a bar and atomically mark it as processed in a single transaction.
   * Uses explicit BEGIN/COMMIT/ROLLBACK via pool.getConnection().
   * If the ledger insert fails for any reason other than ER_DUP_ENTRY, the
   * entire transaction is rolled back and neither row remains.
   */
  async persistBar1mWithLedger(bar: MinuteBar, consumerId: string): Promise<TransactionResult> {
    if (bar.lifecycle !== BarLifecycle.CONFIRMED && bar.lifecycle !== BarLifecycle.UNRESOLVED) {
      return { barInserted: false, ledgerInserted: false, barRowId: null, rolledBack: false };
    }
    const bar1mRow = this._toBar1mRow(bar);
    const ledgerRow: InsertLedgerRow = {
      source: 'DATABENTO',
      dataset: bar.dataset,
      rawSymbol: bar.rawSymbol,
      instrumentId: bar.instrumentId,
      barOpenTsMs: bar.barOpenTsMs,
      revision: bar.revision,
      mappingVersion: bar.mappingVersion,
      consumerName: consumerId,
      consumerVersion: this.consumerVersion,
      processedAtMs: Date.now(),
      success: true,
      errorMessage: null,
      atlasTsMs: Date.now(),
    };
    return this.db.persistBarWithLedger(bar1mRow, ledgerRow);
  }

  /**
   * Check whether a bar has already been processed by a downstream consumer.
   */
  async isAlreadyProcessed(consumerId: string, bar: MinuteBar): Promise<boolean> {
    const key = this._bar1mKey(bar);
    return this.db.isAlreadyProcessed(consumerId, this.consumerVersion, key);
  }

  /**
   * Mark a bar as processed by a downstream consumer.
   * Throws for all non-duplicate database errors.
   */
  async markProcessed(consumerId: string, eventType: string, bar: MinuteBar): Promise<LedgerResult> {
    const key = this._bar1mKey(bar);
    return this.db.markProcessed(consumerId, this.consumerVersion, eventType, key);
  }

  // ─── Private helpers ─────────────────────────────────────────────────────────

  private _toBar1mRow(bar: MinuteBar): InsertBar1mRow {
    const recon = bar.reconciliation;
    return {
      source: 'DATABENTO',
      dataset: bar.dataset,
      rawSymbol: bar.rawSymbol,
      instrumentId: bar.instrumentId,
      intervalMs: 60000,
      barOpenTsMs: bar.barOpenTsMs,
      barOpenTsNs: bar.barOpenTsNs,
      barCloseTsMs: bar.barCloseTsMs,
      openPricePts100: bar.ohlcv.openPts100,
      highPricePts100: bar.ohlcv.highPts100,
      lowPricePts100: bar.ohlcv.lowPts100,
      closePricePts100: bar.ohlcv.closePts100,
      volume: bar.ohlcv.volume,
      tradeCount: bar.ohlcv.tradeCount,
      reconciliationStatus: recon?.status ?? ReconciliationStatus.PENDING,
      reconCloseDeltaPts100: recon?.closeDetlaPts100 ?? null,
      reconHighDeltaPts100: recon?.highDeltaPts100 ?? null,
      reconLowDeltaPts100: recon?.lowDeltaPts100 ?? null,
      reconVolumeDelta: recon?.volumeDelta ?? null,
      reconWithinTolerance: recon?.withinTolerance ?? null,
      reconTolerancePts100: recon?.tolerancePts100 ?? null,
      revision: bar.revision,
      mappingVersion: bar.mappingVersion,
      atlasTsMs: bar.atlasTsMs,
    };
  }

  private _toBar5mRow(bar: FiveMinBar): InsertBar5mRow {
    return {
      source: 'DATABENTO',
      dataset: bar.dataset,
      rawSymbol: bar.rawSymbol,
      instrumentId: bar.instrumentId,
      intervalMs: 300000,
      barOpenTsMs: bar.barOpenTsMs,
      barCloseTsMs: bar.barCloseTsMs,
      openPricePts100: bar.ohlcv.openPts100,
      highPricePts100: bar.ohlcv.highPts100,
      lowPricePts100: bar.ohlcv.lowPts100,
      closePricePts100: bar.ohlcv.closePts100,
      volume: bar.ohlcv.volume,
      tradeCount: bar.ohlcv.tradeCount,
      minuteBarCount: 5,
      canonicalBarType: bar.barType,
      revision: bar.revision,
      mappingVersion: bar.mappingVersion,
      atlasTsMs: bar.atlasTsMs,
    };
  }

  private _bar1mKey(bar: MinuteBar): string {
    return `${bar.source}:${bar.dataset}:${bar.rawSymbol}:${bar.instrumentId}:${bar.intervalMs}:${bar.barOpenTsMs}:${bar.revision}:${bar.mappingVersion}`;
  }
}

// ─── In-Memory Test Adapter ───────────────────────────────────────────────────

/**
 * In-memory database adapter for unit tests that do not require MySQL.
 * Enforces the same canonical identity unique constraints as the production schema.
 *
 * DUPLICATE HANDLING: Returns { inserted: false } for exact duplicates.
 * Does NOT simulate other database errors (use MySQLBarDatabaseAdapter for that).
 */
export class InMemoryBarDatabaseAdapter implements BarDatabaseAdapter {
  private readonly bars1m = new Map<string, { id: number; row: InsertBar1mRow }>();
  private readonly bars5m = new Map<string, { id: number; row: InsertBar5mRow }>();
  private readonly ledger = new Set<string>();
  private nextId = 1;

  async insertBar1m(row: InsertBar1mRow): Promise<PersistenceResult> {
    const key = `${row.source}:${row.dataset}:${row.rawSymbol}:${row.instrumentId}:${row.intervalMs}:${row.barOpenTsMs}:${row.revision}:${row.mappingVersion}`;
    if (this.bars1m.has(key)) return { inserted: false, rowId: null, warningStatus: 0 };
    const id = this.nextId++;
    this.bars1m.set(key, { id, row });
    return { inserted: true, rowId: id, warningStatus: 0 };
  }

  async insertBar5m(row: InsertBar5mRow): Promise<PersistenceResult> {
    const key = `${row.source}:${row.dataset}:${row.rawSymbol}:${row.instrumentId}:${row.intervalMs}:${row.barOpenTsMs}:${row.revision}:${row.mappingVersion}`;
    if (this.bars5m.has(key)) return { inserted: false, rowId: null, warningStatus: 0 };
    const id = this.nextId++;
    this.bars5m.set(key, { id, row });
    return { inserted: true, rowId: id, warningStatus: 0 };
  }

  async isAlreadyProcessed(consumerId: string, consumerVersion: string, eventKey: string): Promise<boolean> {
    return this.ledger.has(`${consumerId}:${consumerVersion}:${eventKey}`);
  }

  async markProcessed(consumerId: string, consumerVersion: string, _eventType: string, eventKey: string): Promise<LedgerResult> {
    const key = `${consumerId}:${consumerVersion}:${eventKey}`;
    if (this.ledger.has(key)) return { alreadyProcessed: true, warningStatus: 0 };
    this.ledger.add(key);
    return { alreadyProcessed: false, warningStatus: 0 };
  }

  async persistBarWithLedger(
    bar1mRow: InsertBar1mRow,
    ledgerRow: InsertLedgerRow,
  ): Promise<TransactionResult> {
    const barKey = `${bar1mRow.source}:${bar1mRow.dataset}:${bar1mRow.rawSymbol}:${bar1mRow.instrumentId}:${bar1mRow.intervalMs}:${bar1mRow.barOpenTsMs}:${bar1mRow.revision}:${bar1mRow.mappingVersion}`;
    const ledgerKey = `${ledgerRow.consumerName}:${ledgerRow.consumerVersion}:${barKey}`;
    const barInserted = !this.bars1m.has(barKey);
    const ledgerInserted = !this.ledger.has(ledgerKey);
    if (barInserted) {
      const id = this.nextId++;
      this.bars1m.set(barKey, { id, row: bar1mRow });
    }
    if (ledgerInserted) {
      this.ledger.add(ledgerKey);
    }
    return { barInserted, ledgerInserted, barRowId: barInserted ? (this.nextId - 1) : null, rolledBack: false };
  }

  getAllBars1m(): InsertBar1mRow[] {
    return Array.from(this.bars1m.values()).map((v) => v.row);
  }

  getAllBars5m(): InsertBar5mRow[] {
    return Array.from(this.bars5m.values()).map((v) => v.row);
  }

  getBar1mCount(): number { return this.bars1m.size; }
  getBar5mCount(): number { return this.bars5m.size; }

  clear(): void {
    this.bars1m.clear();
    this.bars5m.clear();
    this.ledger.clear();
    this.nextId = 1;
  }
}


// ─── MySQL Bar Database Adapter ───────────────────────────────────────────────

/**
 * MySQLBarDatabaseAdapter — Production BarDatabaseAdapter backed by a mysql2 Pool.
 *
 * Implements the BarDatabaseAdapter interface for use in the live server startup
 * wiring. Uses the same INSERT + ER_DUP_ENTRY pattern as the test helpers in
 * mysql-bar-persistence.test.ts.
 *
 * Sprint 123A.4 — Gate G4
 */
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';

export class MySQLBarDatabaseAdapter implements BarDatabaseAdapter {
  constructor(private readonly pool: Pool) {}

  async insertBar1m(row: InsertBar1mRow): Promise<PersistenceResult> {
    const cols = [
      'source', 'dataset', 'raw_symbol', 'instrument_id', 'interval_ms',
      'bar_open_ts_ms', 'bar_open_ts_ns', 'bar_close_ts_ms',
      'open_price_pts100', 'high_price_pts100', 'low_price_pts100', 'close_price_pts100',
      'volume', 'trade_count', 'reconciliation_status',
      'recon_close_delta_pts100', 'recon_high_delta_pts100', 'recon_low_delta_pts100',
      'recon_volume_delta', 'recon_within_tolerance', 'recon_tolerance_pts100',
      'revision', 'mapping_version', 'atlas_ts_ms',
    ];
    const values = [
      row.source, row.dataset, row.rawSymbol, row.instrumentId, row.intervalMs,
      row.barOpenTsMs, row.barOpenTsNs, row.barCloseTsMs,
      row.openPricePts100, row.highPricePts100, row.lowPricePts100, row.closePricePts100,
      row.volume, row.tradeCount, row.reconciliationStatus,
      row.reconCloseDeltaPts100, row.reconHighDeltaPts100, row.reconLowDeltaPts100,
      row.reconVolumeDelta,
      row.reconWithinTolerance === null ? null : (row.reconWithinTolerance ? 1 : 0),
      row.reconTolerancePts100, row.revision, row.mappingVersion, row.atlasTsMs,
    ];
    const placeholders = cols.map(() => '?').join(', ');
    try {
      const [result] = await this.pool.execute<ResultSetHeader>(
        `INSERT INTO atlas_bars_1m (${cols.join(', ')}) VALUES (${placeholders})`,
        values,
      );
      return { inserted: true, rowId: result.insertId, warningStatus: result.warningStatus };
    } catch (err) {
      if (isDuplicateKeyError(err)) {
        return { inserted: false, rowId: null, warningStatus: 0 };
      }
      throw err;
    }
  }

  async insertBar5m(row: InsertBar5mRow): Promise<PersistenceResult> {
    const cols = [
      'source', 'dataset', 'raw_symbol', 'instrument_id', 'interval_ms',
      'bar_open_ts_ms', 'bar_close_ts_ms',
      'open_price_pts100', 'high_price_pts100', 'low_price_pts100', 'close_price_pts100',
      'volume', 'trade_count', 'minute_bar_count', 'canonical_bar_type',
      'revision', 'mapping_version', 'atlas_ts_ms',
    ];
    const values = [
      row.source, row.dataset, row.rawSymbol, row.instrumentId, row.intervalMs,
      row.barOpenTsMs, row.barCloseTsMs,
      row.openPricePts100, row.highPricePts100, row.lowPricePts100, row.closePricePts100,
      row.volume, row.tradeCount, row.minuteBarCount, row.canonicalBarType,
      row.revision, row.mappingVersion, row.atlasTsMs,
    ];
    const placeholders = cols.map(() => '?').join(', ');
    try {
      const [result] = await this.pool.execute<ResultSetHeader>(
        `INSERT INTO atlas_bars_5m (${cols.join(', ')}) VALUES (${placeholders})`,
        values,
      );
      return { inserted: true, rowId: result.insertId, warningStatus: result.warningStatus };
    } catch (err) {
      if (isDuplicateKeyError(err)) {
        return { inserted: false, rowId: null, warningStatus: 0 };
      }
      throw err;
    }
  }

  async isAlreadyProcessed(consumerId: string, consumerVersion: string, eventKey: string): Promise<boolean> {
    // eventKey format: "source:dataset:rawSymbol:instrumentId:intervalMs:barOpenTsMs:revision:mappingVersion"
    const parts = eventKey.split(':');
    if (parts.length < 8) return false;
    const [source, dataset, rawSymbol, instrumentId, , barOpenTsMs, revision, mappingVersion] = parts;
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT 1 FROM atlas_bar_processing_ledger
       WHERE source = ? AND dataset = ? AND raw_symbol = ? AND instrument_id = ?
         AND bar_open_ts_ms = ? AND revision = ? AND mapping_version = ?
         AND consumer_name = ? AND consumer_version = ?
       LIMIT 1`,
      [source, dataset, rawSymbol, Number(instrumentId), Number(barOpenTsMs),
       Number(revision), mappingVersion, consumerId, consumerVersion],
    );
    return rows.length > 0;
  }

  async markProcessed(
    consumerId: string,
    consumerVersion: string,
    _eventType: string,
    eventKey: string,
  ): Promise<LedgerResult> {
    const parts = eventKey.split(':');
    if (parts.length < 8) throw new Error(`Invalid eventKey format: ${eventKey}`);
    const [source, dataset, rawSymbol, instrumentId, , barOpenTsMs, revision, mappingVersion] = parts;
    try {
      const [result] = await this.pool.execute<ResultSetHeader>(
        `INSERT INTO atlas_bar_processing_ledger
           (source, dataset, raw_symbol, instrument_id, bar_open_ts_ms, revision, mapping_version,
            consumer_name, consumer_version, processed_at_ms, success, error_message, atlas_ts_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [source, dataset, rawSymbol, Number(instrumentId), Number(barOpenTsMs),
         Number(revision), mappingVersion, consumerId, consumerVersion,
         Date.now(), 1, null, Date.now()],
      );
      return { alreadyProcessed: false, warningStatus: result.warningStatus };
    } catch (err) {
      if (isDuplicateKeyError(err)) {
        return { alreadyProcessed: true, warningStatus: 0 };
      }
      throw err;
    }
  }

  async persistBarWithLedger(
    bar1mRow: InsertBar1mRow,
    ledgerRow: InsertLedgerRow,
  ): Promise<TransactionResult> {
    let conn: PoolConnection | null = null;
    try {
      conn = await this.pool.getConnection();
      await conn.beginTransaction();

      // Insert bar
      const barCols = [
        'source', 'dataset', 'raw_symbol', 'instrument_id', 'interval_ms',
        'bar_open_ts_ms', 'bar_open_ts_ns', 'bar_close_ts_ms',
        'open_price_pts100', 'high_price_pts100', 'low_price_pts100', 'close_price_pts100',
        'volume', 'trade_count', 'reconciliation_status',
        'recon_close_delta_pts100', 'recon_high_delta_pts100', 'recon_low_delta_pts100',
        'recon_volume_delta', 'recon_within_tolerance', 'recon_tolerance_pts100',
        'revision', 'mapping_version', 'atlas_ts_ms',
      ];
      const barValues = [
        bar1mRow.source, bar1mRow.dataset, bar1mRow.rawSymbol, bar1mRow.instrumentId, bar1mRow.intervalMs,
        bar1mRow.barOpenTsMs, bar1mRow.barOpenTsNs, bar1mRow.barCloseTsMs,
        bar1mRow.openPricePts100, bar1mRow.highPricePts100, bar1mRow.lowPricePts100, bar1mRow.closePricePts100,
        bar1mRow.volume, bar1mRow.tradeCount, bar1mRow.reconciliationStatus,
        bar1mRow.reconCloseDeltaPts100, bar1mRow.reconHighDeltaPts100, bar1mRow.reconLowDeltaPts100,
        bar1mRow.reconVolumeDelta,
        bar1mRow.reconWithinTolerance === null ? null : (bar1mRow.reconWithinTolerance ? 1 : 0),
        bar1mRow.reconTolerancePts100, bar1mRow.revision, bar1mRow.mappingVersion, bar1mRow.atlasTsMs,
      ];
      const barPlaceholders = barCols.map(() => '?').join(', ');

      let barInserted = false;
      let barRowId: number | null = null;
      try {
        const [barResult] = await conn.execute<ResultSetHeader>(
          `INSERT INTO atlas_bars_1m (${barCols.join(', ')}) VALUES (${barPlaceholders})`,
          barValues,
        );
        barInserted = true;
        barRowId = barResult.insertId;
      } catch (err) {
        if (!isDuplicateKeyError(err)) {
          await conn.rollback();
          return { barInserted: false, ledgerInserted: false, barRowId: null, rolledBack: true };
        }
        // Duplicate bar — continue to ledger insert
      }

      // Insert ledger
      let ledgerInserted = false;
      try {
        await conn.execute<ResultSetHeader>(
          `INSERT INTO atlas_bar_processing_ledger
             (source, dataset, raw_symbol, instrument_id, bar_open_ts_ms, revision, mapping_version,
              consumer_name, consumer_version, processed_at_ms, success, error_message, atlas_ts_ms)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [ledgerRow.source, ledgerRow.dataset, ledgerRow.rawSymbol, ledgerRow.instrumentId,
           ledgerRow.barOpenTsMs, ledgerRow.revision, ledgerRow.mappingVersion,
           ledgerRow.consumerName, ledgerRow.consumerVersion,
           ledgerRow.processedAtMs, ledgerRow.success ? 1 : 0,
           ledgerRow.errorMessage, ledgerRow.atlasTsMs],
        );
        ledgerInserted = true;
      } catch (err) {
        if (!isDuplicateKeyError(err)) {
          await conn.rollback();
          return { barInserted: false, ledgerInserted: false, barRowId: null, rolledBack: true };
        }
        // Duplicate ledger — already processed
      }

      await conn.commit();
      return { barInserted, ledgerInserted, barRowId, rolledBack: false };
    } finally {
      if (conn) conn.release();
    }
  }
}
