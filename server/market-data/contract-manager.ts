/**
 * contract-manager.ts — Contract Definition, Symbol Mapping, and Roll Manager
 *
 * Manages the lifecycle of Databento contract definitions and symbol mappings:
 *   - Stores InstrumentDefMsg decoded records (via bridge `databento:definition`)
 *   - Stores SymbolMappingMsg decoded records (via bridge `databento:symbol-mapping`)
 *   - Detects contract rolls when the active symbol changes
 *   - Provides the current active contract for a given dataset
 *
 * AUTHORITY NOTE: This module is parity-data preparation only.
 * TradingView remains the production processBar and postBarAutomation trigger.
 * MARKET_DATA_AUTHORITY = TRADINGVIEW_ONLY throughout Sprint 123A.3.
 *
 * Sprint 123A.3 — Gate G3
 */

import { EventEmitter } from 'events';
import {
  ContractDefinition,
  SymbolMapping,
  ContractRoll,
} from './types/bar-lifecycle.js';

// ─── Bridge payload types ─────────────────────────────────────────────────────

export interface BridgeDefinitionPayload {
  schema: 'definition';
  dataset: string;
  instrument_id: number;
  raw_symbol: string;
  expiry_ts_ns: string | null;
  min_price_increment_pts100: number;
  currency: string;
  instrument_class: string;
  mapping_version?: string;
  atlas_processing_ts_ms: number;
}

export interface BridgeSymbolMappingPayload {
  schema: 'symbol-mapping';
  dataset: string;
  instrument_id: number;
  raw_symbol: string;
  stype: string;
  mapping_version?: string;
  effective_ts_ms: number;
  atlas_processing_ts_ms: number;
}

// ─── Contract Manager Events ──────────────────────────────────────────────────

export type ContractManagerEvent =
  | { type: 'contract:definition-updated'; definition: ContractDefinition }
  | { type: 'contract:symbol-mapping-updated'; mapping: SymbolMapping }
  | { type: 'contract:roll-detected'; roll: ContractRoll };

// ─── Contract Manager ─────────────────────────────────────────────────────────

/**
 * ContractManager maintains the current active contract definitions and symbol
 * mappings for each dataset. It detects contract rolls when the active symbol
 * changes and emits a `contract:roll-detected` event.
 *
 * One ContractManager instance manages all instruments across all datasets.
 */
export class ContractManager extends EventEmitter {
  /** Active contract definitions keyed by `${dataset}:${instrumentId}`. */
  private readonly definitions = new Map<string, ContractDefinition>();

  /** Active symbol mappings keyed by `${dataset}:${instrumentId}`. */
  private readonly symbolMappings = new Map<string, SymbolMapping>();

  /**
   * The currently active symbol per dataset (the most recently seen rawSymbol
   * for that dataset). Used for roll detection.
   * Keyed by dataset.
   */
  private readonly activeSymbols = new Map<string, string>();

  /** All detected contract rolls (in chronological order). */
  private readonly rolls: ContractRoll[] = [];

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * Process an incoming contract definition from the bridge server.
   * Stores the definition and emits `contract:definition-updated`.
   */
  processDefinition(payload: BridgeDefinitionPayload): ContractDefinition {
    const definition: ContractDefinition = {
      source: 'DATABENTO',
      dataset: payload.dataset,
      instrumentId: payload.instrument_id,
      rawSymbol: payload.raw_symbol,
      expiryTsMs: payload.expiry_ts_ns
        ? this._tsNsToMs(payload.expiry_ts_ns)
        : null,
      minPriceIncrementPts100: payload.min_price_increment_pts100,
      currency: payload.currency,
      instrumentClass: payload.instrument_class,
      mappingVersion: payload.mapping_version ?? 'v1',
      atlasTsMs: payload.atlas_processing_ts_ms,
    };

    const key = this._defKey(payload.dataset, payload.instrument_id);
    this.definitions.set(key, definition);
    this._emit({ type: 'contract:definition-updated', definition });
    return definition;
  }

  /**
   * Process an incoming symbol mapping from the bridge server.
   * Stores the mapping, detects contract rolls, and emits events.
   */
  processSymbolMapping(payload: BridgeSymbolMappingPayload): SymbolMapping {
    const mapping: SymbolMapping = {
      source: 'DATABENTO',
      dataset: payload.dataset,
      instrumentId: payload.instrument_id,
      rawSymbol: payload.raw_symbol,
      stype: payload.stype,
      mappingVersion: payload.mapping_version ?? 'v1',
      effectiveTsMs: payload.effective_ts_ms,
      atlasTsMs: payload.atlas_processing_ts_ms,
    };

    const key = this._defKey(payload.dataset, payload.instrument_id);
    this.symbolMappings.set(key, mapping);
    this._emit({ type: 'contract:symbol-mapping-updated', mapping });

    // Roll detection: if the active symbol for this dataset has changed
    const currentActive = this.activeSymbols.get(payload.dataset);
    if (currentActive !== undefined && currentActive !== payload.raw_symbol) {
      const roll: ContractRoll = {
        dataset: payload.dataset,
        fromSymbol: currentActive,
        toSymbol: payload.raw_symbol,
        instrumentId: payload.instrument_id,
        rollTsMs: payload.effective_ts_ms,
        mappingVersion: payload.mapping_version ?? 'v1',
        detectedBy: 'CONTRACT_ROLL_MANAGER',
        atlasTsMs: payload.atlas_processing_ts_ms,
      };
      this.rolls.push(roll);
      this._emit({ type: 'contract:roll-detected', roll });
    }

    this.activeSymbols.set(payload.dataset, payload.raw_symbol);
    return mapping;
  }

  /**
   * Return the current active contract definition for a dataset and instrument.
   * Returns null if no definition has been received.
   */
  getDefinition(dataset: string, instrumentId: number): ContractDefinition | null {
    return this.definitions.get(this._defKey(dataset, instrumentId)) ?? null;
  }

  /**
   * Return the current symbol mapping for a dataset and instrument.
   * Returns null if no mapping has been received.
   */
  getSymbolMapping(dataset: string, instrumentId: number): SymbolMapping | null {
    return this.symbolMappings.get(this._defKey(dataset, instrumentId)) ?? null;
  }

  /**
   * Return the currently active symbol for a dataset.
   * Returns null if no symbol has been seen for this dataset.
   */
  getActiveSymbol(dataset: string): string | null {
    return this.activeSymbols.get(dataset) ?? null;
  }

  /**
   * Return all detected contract rolls in chronological order.
   */
  getRolls(): ReadonlyArray<ContractRoll> {
    return this.rolls;
  }

  /**
   * Return the most recent contract roll for a dataset, or null.
   */
  getLatestRoll(dataset: string): ContractRoll | null {
    for (let i = this.rolls.length - 1; i >= 0; i--) {
      if (this.rolls[i].dataset === dataset) return this.rolls[i];
    }
    return null;
  }

  /**
   * Check whether the instrument is approaching expiry.
   * Returns true if expiry is within the given warning window (default: 7 days).
   */
  isNearExpiry(
    dataset: string,
    instrumentId: number,
    warningWindowMs: number = 7 * 24 * 60 * 60 * 1000,
  ): boolean {
    const def = this.getDefinition(dataset, instrumentId);
    if (!def || def.expiryTsMs === null) return false;
    return def.expiryTsMs - Date.now() <= warningWindowMs;
  }

  // ─── Private helpers ─────────────────────────────────────────────────────────

  private _defKey(dataset: string, instrumentId: number): string {
    return `${dataset}:${instrumentId}`;
  }

  private _emit(event: ContractManagerEvent): void {
    this.emit(event.type, event);
  }

  private _tsNsToMs(tsNs: string): number {
    return Number(BigInt(tsNs) / 1_000_000n);
  }
}
