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
 *     (source, dataset, raw_symbol, instrument_id, bar_open_ts_ms, revision, mapping_version)
 *     — 7 columns. NOTE: interval_ms does NOT exist in this table.
 *
 *   atlas_bars_5m: UNIQUE KEY uq_atlas_bars_5m_canonical_identity
 *     (source, dataset, raw_symbol, instrument_id, bar_open_ts_ms, revision, mapping_version)
 *     — 7 columns.
 *
 *   atlas_bar_processing_ledger: UNIQUE KEY uq_atlas_bar_processing_ledger
 *     (source, dataset, raw_symbol, instrument_id, bar_open_ts_ms, revision,
 *      mapping_version, consumer_name, consumer_version)
 *     — 9 columns.
 *
 * DUPLICATE HANDLING POLICY (Gate G3 Revision 4):
 *   Effectively-once is implemented via plain INSERT followed by ER_DUP_ENTRY
 *   (errno 1062) catch. This is the preferred robust approach because:
 *
 *   EMPIRICAL FINDING (Gate G3 Revision 4 verification):
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
 * TRANSACTION POLICY (Gate G3 Revision 4):
 *   Any operation that writes more than one row (bar + ledger) uses an explicit
 *   transaction. If any write fails, the entire transaction is rolled back and
 *   neither row remains.
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
 * Sprint 123A.3 — Gate G3 Revision 4
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
 * DUPLICATE HANDLING CONTRACT (Gate G3 Revision 4):
 *   All insert methods use plain INSERT (no ON DUPLICATE KEY) and catch
 *   ER_DUP_ENTRY (errno 1062) to return { inserted: false }.
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
    return `${bar.source}:${bar.dataset}:${bar.rawSymbol}:${bar.instrumentId}:${bar.barOpenTsMs}:${bar.revision}:${bar.mappingVersion}`;
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
    const key = `${row.source}:${row.dataset}:${row.rawSymbol}:${row.instrumentId}:${row.barOpenTsMs}:${row.revision}:${row.mappingVersion}`;
    if (this.bars1m.has(key)) return { inserted: false, rowId: null, warningStatus: 0 };
    const id = this.nextId++;
    this.bars1m.set(key, { id, row });
    return { inserted: true, rowId: id, warningStatus: 0 };
  }

  async insertBar5m(row: InsertBar5mRow): Promise<PersistenceResult> {
    const key = `${row.source}:${row.dataset}:${row.rawSymbol}:${row.instrumentId}:${row.barOpenTsMs}:${row.revision}:${row.mappingVersion}`;
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
    const barKey = `${bar1mRow.source}:${bar1mRow.dataset}:${bar1mRow.rawSymbol}:${bar1mRow.instrumentId}:${bar1mRow.barOpenTsMs}:${bar1mRow.revision}:${bar1mRow.mappingVersion}`;
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
