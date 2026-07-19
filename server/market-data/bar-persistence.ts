/**
 * bar-persistence.ts — Effectively-Once Persistence Layer
 *
 * Writes confirmed one-minute bars and five-minute bars to the database
 * with effectively-once semantics using the unique constraints defined in
 * migration 0026:
 *
 *   atlas_bars_1m: UNIQUE KEY (source, dataset, instrument_id, bar_open_ts_ms,
 *                              revision, mapping_version)
 *   atlas_bars_5m: UNIQUE KEY (source, dataset, instrument_id, bar_open_ts_ms,
 *                              revision, mapping_version)
 *
 * Duplicate inserts are silently ignored via INSERT IGNORE (MySQL) semantics.
 * The persistence layer also writes to the atlas_consumer_processing_ledger
 * to prevent downstream consumers from processing the same bar twice.
 *
 * AUTHORITY NOTE: This module writes to atlas_bars_1m and atlas_bars_5m only.
 * It does NOT write to atlas_canonical_bars (that is the Canonical Router's
 * responsibility, gated on MARKET_DATA_AUTHORITY).
 * It does NOT trigger processBar or postBarAutomation.
 * MARKET_DATA_AUTHORITY = TRADINGVIEW_ONLY throughout Sprint 123A.3.
 *
 * PRODUCTION SAFETY: This module requires migration 0026 to have been applied.
 * Migration 0026 must NOT be run against the production database without
 * Phil's explicit written approval at Gate G3.
 *
 * Sprint 123A.3 — Gate G3
 */

import { MinuteBar, FiveMinBar, ReconciliationStatus, BarLifecycle } from './types/bar-lifecycle.js';

// ─── Database Adapter Interface ───────────────────────────────────────────────

/**
 * Minimal database adapter interface for persistence.
 * In production, this is backed by the Drizzle ORM connection.
 * In tests, this is backed by a disposable in-memory or test database.
 *
 * Using an interface rather than importing the Drizzle connection directly
 * allows the persistence layer to be tested without a live database.
 */
export interface BarDatabaseAdapter {
  /**
   * Insert a one-minute bar into atlas_bars_1m.
   * Must use INSERT IGNORE (or equivalent) to silently skip duplicates.
   * Returns the inserted row ID, or null if the row already existed.
   */
  insertBar1m(row: InsertBar1mRow): Promise<number | null>;

  /**
   * Insert a five-minute bar into atlas_bars_5m.
   * Must use INSERT IGNORE (or equivalent) to silently skip duplicates.
   * Returns the inserted row ID, or null if the row already existed.
   */
  insertBar5m(row: InsertBar5mRow): Promise<number | null>;

  /**
   * Check whether a bar has already been processed by a given consumer.
   * Used for effectively-once downstream event dispatch.
   */
  isAlreadyProcessed(consumerId: string, eventKey: string): Promise<boolean>;

  /**
   * Mark a bar as processed by a given consumer.
   */
  markProcessed(consumerId: string, eventType: string, eventKey: string): Promise<void>;
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
  /** The row ID of the inserted or existing row. */
  rowId: number | null;
}

// ─── Bar Persistence ──────────────────────────────────────────────────────────

export class BarPersistence {
  private readonly db: BarDatabaseAdapter;

  constructor(db: BarDatabaseAdapter) {
    this.db = db;
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * Persist a confirmed one-minute bar to atlas_bars_1m.
   *
   * INVARIANT: Only CONFIRMED bars are persisted. UNRESOLVED bars are rejected.
   * Returns { inserted: false } if the bar is not CONFIRMED or is a duplicate.
   */
  async persistBar1m(bar: MinuteBar): Promise<PersistenceResult> {
    if (bar.lifecycle !== BarLifecycle.CONFIRMED) {
      return { inserted: false, rowId: null };
    }

    const row = this._toBar1mRow(bar);
    const rowId = await this.db.insertBar1m(row);
    return { inserted: rowId !== null, rowId };
  }

  /**
   * Persist a five-minute bar to atlas_bars_5m.
   *
   * INVARIANT: The FiveMinBar must have minuteBarCount === 5.
   * INVARIANT: All constituent bars must be CONFIRMED (enforced by FiveMinAggregator).
   */
  async persistBar5m(bar: FiveMinBar): Promise<PersistenceResult> {
    if (bar.minuteBarCount !== 5) {
      return { inserted: false, rowId: null };
    }

    const row = this._toBar5mRow(bar);
    const rowId = await this.db.insertBar5m(row);
    return { inserted: rowId !== null, rowId };
  }

  /**
   * Check whether a bar has already been processed by a downstream consumer.
   * Used to implement effectively-once semantics for event dispatch.
   *
   * @param consumerId - Identifies the downstream consumer (e.g., 'parity-monitor')
   * @param bar - The bar to check
   */
  async isAlreadyProcessed(consumerId: string, bar: MinuteBar): Promise<boolean> {
    const key = this._bar1mKey(bar);
    return this.db.isAlreadyProcessed(consumerId, key);
  }

  /**
   * Mark a bar as processed by a downstream consumer.
   */
  async markProcessed(consumerId: string, eventType: string, bar: MinuteBar): Promise<void> {
    const key = this._bar1mKey(bar);
    return this.db.markProcessed(consumerId, eventType, key);
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
    return `${bar.source}:${bar.dataset}:${bar.instrumentId}:${bar.barOpenTsMs}:${bar.revision}:${bar.mappingVersion}`;
  }
}

// ─── In-Memory Test Adapter ───────────────────────────────────────────────────

/**
 * In-memory database adapter for unit tests.
 * Does not require a live database connection.
 * Enforces the same unique constraints as the production schema.
 */
export class InMemoryBarDatabaseAdapter implements BarDatabaseAdapter {
  private readonly bars1m = new Map<string, { id: number; row: InsertBar1mRow }>();
  private readonly bars5m = new Map<string, { id: number; row: InsertBar5mRow }>();
  private readonly ledger = new Set<string>();
  private nextId = 1;

  async insertBar1m(row: InsertBar1mRow): Promise<number | null> {
    const key = `${row.source}:${row.dataset}:${row.instrumentId}:${row.barOpenTsMs}:${row.revision}:${row.mappingVersion}`;
    if (this.bars1m.has(key)) return null; // Duplicate — INSERT IGNORE
    const id = this.nextId++;
    this.bars1m.set(key, { id, row });
    return id;
  }

  async insertBar5m(row: InsertBar5mRow): Promise<number | null> {
    const key = `${row.source}:${row.dataset}:${row.instrumentId}:${row.barOpenTsMs}:${row.revision}:${row.mappingVersion}`;
    if (this.bars5m.has(key)) return null; // Duplicate — INSERT IGNORE
    const id = this.nextId++;
    this.bars5m.set(key, { id, row });
    return id;
  }

  async isAlreadyProcessed(consumerId: string, eventKey: string): Promise<boolean> {
    return this.ledger.has(`${consumerId}:${eventKey}`);
  }

  async markProcessed(consumerId: string, _eventType: string, eventKey: string): Promise<void> {
    this.ledger.add(`${consumerId}:${eventKey}`);
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
