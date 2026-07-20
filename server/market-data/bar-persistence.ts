/**
 * bar-persistence.ts — Effectively-Once Persistence Layer
 *
 * Writes one-minute bars and five-minute bars to the database with
 * effectively-once semantics using the unique constraints defined in
 * migrations 0026 + 0027:
 *
 *   atlas_bars_1m: UNIQUE KEY uq_atlas_bars_1m_canonical_identity
 *     (source, dataset, raw_symbol, instrument_id, bar_open_ts_ms, revision, mapping_version)
 *
 *   atlas_bars_5m: UNIQUE KEY uq_atlas_bars_5m_canonical_identity
 *     (source, dataset, raw_symbol, instrument_id, bar_open_ts_ms, revision, mapping_version)
 *
 *   atlas_bar_processing_ledger: UNIQUE KEY uq_atlas_bar_processing_ledger
 *     (source, dataset, raw_symbol, instrument_id, bar_open_ts_ms, revision,
 *      mapping_version, consumer_name, consumer_version)
 *
 * DUPLICATE HANDLING POLICY (Gate G3 Revision 3):
 *   Effectively-once is implemented via INSERT ... ON DUPLICATE KEY UPDATE
 *   with a no-op update (id = id). This suppresses ONLY the expected
 *   duplicate-key error (ER_DUP_ENTRY / errno 1062). All other database
 *   errors (malformed values, CHECK violations, NOT NULL violations,
 *   foreign-key violations, unexpected SQL errors) must fail loudly and
 *   roll back the transaction.
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
 *   It does NOT write to atlas_canonical_bars (that is the Canonical Router's
 *   responsibility, gated on MARKET_DATA_AUTHORITY).
 *   It does NOT trigger processBar or postBarAutomation.
 *   MARKET_DATA_AUTHORITY = TRADINGVIEW_ONLY throughout Sprint 123A.3.
 *
 * PRODUCTION SAFETY: This module requires migrations 0026 and 0027 to have
 *   been applied. These migrations must NOT be run against the production
 *   database without Phil's explicit written approval at Gate G3.
 *
 * Sprint 123A.3 — Gate G3 Revision 3
 */

import { MinuteBar, FiveMinBar, ReconciliationStatus, BarLifecycle } from './types/bar-lifecycle.js';

// ─── Database Adapter Interface ───────────────────────────────────────────────

/**
 * Minimal database adapter interface for persistence.
 * In production, this is backed by the Drizzle ORM connection.
 * In tests, this is backed by a disposable MySQL 8 instance or in-memory adapter.
 *
 * DUPLICATE HANDLING CONTRACT:
 *   insertBar1m and insertBar5m must implement INSERT ... ON DUPLICATE KEY
 *   UPDATE id = id (or equivalent). They must:
 *   - Return { inserted: true, rowId: N } when a new row is inserted.
 *   - Return { inserted: false, rowId: null } when the row already exists
 *     (duplicate key on the canonical identity unique key).
 *   - THROW for any other database error (malformed values, CHECK violations,
 *     NOT NULL violations, foreign-key violations, unexpected SQL errors).
 *   The adapter must NEVER convert non-duplicate errors into success.
 */
export interface BarDatabaseAdapter {
  /**
   * Insert a one-minute bar into atlas_bars_1m using ON DUPLICATE KEY UPDATE.
   * Returns { inserted: true } for new rows, { inserted: false } for duplicates.
   * Throws for all other database errors.
   */
  insertBar1m(row: InsertBar1mRow): Promise<PersistenceResult>;

  /**
   * Insert a five-minute bar into atlas_bars_5m using ON DUPLICATE KEY UPDATE.
   * Returns { inserted: true } for new rows, { inserted: false } for duplicates.
   * Throws for all other database errors.
   */
  insertBar5m(row: InsertBar5mRow): Promise<PersistenceResult>;

  /**
   * Check whether a bar has already been processed by a given consumer.
   * Used for effectively-once downstream event dispatch.
   */
  isAlreadyProcessed(consumerId: string, consumerVersion: string, eventKey: string): Promise<boolean>;

  /**
   * Mark a bar as processed by a given consumer.
   * Uses ON DUPLICATE KEY UPDATE id = id semantics.
   * Throws for non-duplicate errors.
   */
  markProcessed(consumerId: string, consumerVersion: string, eventType: string, eventKey: string): Promise<void>;
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

// ─── Persistence Result ───────────────────────────────────────────────────────

export interface PersistenceResult {
  /** Whether the row was newly inserted (true) or was a duplicate (false). */
  inserted: boolean;
  /** The row ID of the inserted row, or null if it was a duplicate. */
  rowId: number | null;
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
      return { inserted: false, rowId: null };
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
      return { inserted: false, rowId: null };
    }
    const row = this._toBar5mRow(bar);
    return this.db.insertBar5m(row);
  }

  /**
   * Check whether a bar has already been processed by a downstream consumer.
   * Used to implement effectively-once semantics for event dispatch.
   */
  async isAlreadyProcessed(consumerId: string, bar: MinuteBar): Promise<boolean> {
    const key = this._bar1mKey(bar);
    return this.db.isAlreadyProcessed(consumerId, this.consumerVersion, key);
  }

  /**
   * Mark a bar as processed by a downstream consumer.
   * Throws for all non-duplicate database errors.
   */
  async markProcessed(consumerId: string, eventType: string, bar: MinuteBar): Promise<void> {
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
    // Canonical identity key includes raw_symbol (migration 0027)
    const key = `${row.source}:${row.dataset}:${row.rawSymbol}:${row.instrumentId}:${row.barOpenTsMs}:${row.revision}:${row.mappingVersion}`;
    if (this.bars1m.has(key)) return { inserted: false, rowId: null };
    const id = this.nextId++;
    this.bars1m.set(key, { id, row });
    return { inserted: true, rowId: id };
  }

  async insertBar5m(row: InsertBar5mRow): Promise<PersistenceResult> {
    // Canonical identity key includes raw_symbol (migration 0027)
    const key = `${row.source}:${row.dataset}:${row.rawSymbol}:${row.instrumentId}:${row.barOpenTsMs}:${row.revision}:${row.mappingVersion}`;
    if (this.bars5m.has(key)) return { inserted: false, rowId: null };
    const id = this.nextId++;
    this.bars5m.set(key, { id, row });
    return { inserted: true, rowId: id };
  }

  async isAlreadyProcessed(consumerId: string, consumerVersion: string, eventKey: string): Promise<boolean> {
    return this.ledger.has(`${consumerId}:${consumerVersion}:${eventKey}`);
  }

  async markProcessed(consumerId: string, consumerVersion: string, _eventType: string, eventKey: string): Promise<void> {
    this.ledger.add(`${consumerId}:${consumerVersion}:${eventKey}`);
  }

  /** Test helper: return all persisted 1m bars. */
  getAllBars1m(): InsertBar1mRow[] {
    return Array.from(this.bars1m.values()).map((v) => v.row);
  }

  /** Test helper: return all persisted 5m bars. */
  getAllBars5m(): InsertBar5mRow[] {
    return Array.from(this.bars5m.values()).map((v) => v.row);
  }

  /** Test helper: return the count of 1m bars. */
  getBar1mCount(): number {
    return this.bars1m.size;
  }

  /** Test helper: return the count of 5m bars. */
  getBar5mCount(): number {
    return this.bars5m.size;
  }

  /** Test helper: clear all data. */
  clear(): void {
    this.bars1m.clear();
    this.bars5m.clear();
    this.ledger.clear();
    this.nextId = 1;
  }
}
