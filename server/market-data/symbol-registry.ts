/**
 * Atlas Symbol Registry
 *
 * Manages the mapping between DataBento instrument_id (numeric) and Atlas
 * canonical symbols (e.g. "MNQ1!"). Also handles contract roll detection
 * and the MNQ futures instrument specification.
 *
 * The registry is populated from DataBento SymbolMappingMsg records received
 * at the start of each live session. It is also pre-seeded with the known
 * MNQ contract series for resilience during startup.
 *
 * Sprint 121 — Atlas Market Data Platform
 */

import { AtlasSymbolMappingEvent } from '../../shared/types/market-events.js';

// ── MNQ Instrument Specification ─────────────────────────────────────────────

/** MNQ futures contract specification */
export const MNQ_SPEC = {
  /** Atlas canonical symbol */
  canonicalSymbol: 'MNQ1!',

  /** DataBento continuous symbol (volume-based front month) */
  databentoContinuousSymbol: 'MNQ.v.0',

  /** DataBento dataset */
  dataset: 'GLBX.MDP3',

  /** DataBento schema */
  schema: 'mbp-1',

  /** Exchange */
  exchange: 'CME',

  /** Contract multiplier: 1 point = $2 */
  pointValue: 2.0,

  /** Minimum price increment */
  tickSize: 0.25,

  /** Tick value in USD */
  tickValue: 0.50,

  /** Trading hours (UTC) — approximate, excludes holidays */
  tradingHours: {
    /** Sunday open: 23:00 UTC (18:00 ET) */
    weeklyOpenUtcHour: 23,
    weeklyOpenDay: 0, // Sunday
    /** Friday close: 22:00 UTC (17:00 ET) */
    weeklyCloseUtcHour: 22,
    weeklyCloseDay: 5, // Friday
    /** RTH: 13:30–20:00 UTC (09:30–16:00 ET) */
    rthOpenUtcHour: 13,
    rthOpenUtcMinute: 30,
    rthCloseUtcHour: 20,
    rthCloseUtcMinute: 0,
  },

  /** Contract expiry months: March (H), June (M), September (U), December (Z) */
  expiryMonthCodes: ['H', 'M', 'U', 'Z'] as const,

  /** Contract prefix */
  prefix: 'MNQ',
} as const;

// ── Contract roll detection ───────────────────────────────────────────────────

export interface ContractRollEvent {
  oldSymbol: string;
  newSymbol: string;
  oldInstrumentId: number;
  newInstrumentId: number;
  detectedAt: number;
}

// ── Symbol registry entry ─────────────────────────────────────────────────────

interface RegistryEntry {
  instrumentId: number;
  rawSymbol: string;
  canonicalSymbol: string;
  startTs: number;
  endTs: number;
  addedAt: number;
}

// ── Symbol Registry class ─────────────────────────────────────────────────────

export class SymbolRegistry {
  /** Map from instrument_id → registry entry */
  private readonly byInstrumentId: Map<number, RegistryEntry> = new Map();

  /** Map from raw symbol (e.g. "MNQM5") → registry entry */
  private readonly byRawSymbol: Map<string, RegistryEntry> = new Map();

  /** Current active instrument_id for MNQ1! */
  private activeInstrumentId: number | null = null;

  /** Roll event listeners */
  private rollListeners: Array<(event: ContractRollEvent) => void> = [];

  /**
   * Process a SymbolMappingEvent from the normaliser.
   * Updates the registry and detects contract rolls.
   */
  processSymbolMapping(event: AtlasSymbolMappingEvent): void {
    const entry: RegistryEntry = {
      instrumentId: event.instrumentId,
      rawSymbol: event.rawSymbol,
      canonicalSymbol: event.canonicalSymbol,
      startTs: event.startTs,
      endTs: event.endTs,
      addedAt: Date.now(),
    };

    this.byInstrumentId.set(event.instrumentId, entry);
    this.byRawSymbol.set(event.rawSymbol, entry);

    // Detect contract roll: if this is a new MNQ instrument_id becoming active
    if (
      event.canonicalSymbol === 'MNQ1!' &&
      this.activeInstrumentId !== null &&
      this.activeInstrumentId !== event.instrumentId
    ) {
      const oldEntry = this.byInstrumentId.get(this.activeInstrumentId);
      if (oldEntry) {
        const rollEvent: ContractRollEvent = {
          oldSymbol: oldEntry.rawSymbol,
          newSymbol: event.rawSymbol,
          oldInstrumentId: this.activeInstrumentId,
          newInstrumentId: event.instrumentId,
          detectedAt: Date.now(),
        };
        this.emitRoll(rollEvent);
      }
    }

    if (event.canonicalSymbol === 'MNQ1!') {
      this.activeInstrumentId = event.instrumentId;
    }
  }

  /**
   * Get the canonical symbol for a given instrument_id.
   * Returns null if the instrument_id is not in the registry.
   */
  getCanonicalSymbol(instrumentId: number): string | null {
    return this.byInstrumentId.get(instrumentId)?.canonicalSymbol ?? null;
  }

  /**
   * Get the canonical symbol for a given raw symbol (e.g. "MNQM5").
   * Returns null if not found.
   */
  getCanonicalSymbolFromRaw(rawSymbol: string): string | null {
    // Check registry first
    const entry = this.byRawSymbol.get(rawSymbol);
    if (entry) return entry.canonicalSymbol;

    // Fallback: if the raw symbol starts with "MNQ", map to "MNQ1!"
    if (rawSymbol.startsWith('MNQ')) return 'MNQ1!';

    return null;
  }

  /**
   * Get the current active instrument_id for MNQ1!.
   * Returns null if no SymbolMappingMsg has been received yet.
   */
  getActiveInstrumentId(): number | null {
    return this.activeInstrumentId;
  }

  /**
   * Manually set the active instrument_id (used during startup from DB).
   */
  setActiveInstrumentId(instrumentId: number, rawSymbol: string): void {
    const entry: RegistryEntry = {
      instrumentId,
      rawSymbol,
      canonicalSymbol: 'MNQ1!',
      startTs: 0,
      endTs: 0,
      addedAt: Date.now(),
    };
    this.byInstrumentId.set(instrumentId, entry);
    this.byRawSymbol.set(rawSymbol, entry);
    this.activeInstrumentId = instrumentId;
  }

  /** Register a contract roll listener */
  onRoll(listener: (event: ContractRollEvent) => void): void {
    this.rollListeners.push(listener);
  }

  /** Get all current registry entries (for debugging) */
  getAll(): RegistryEntry[] {
    return Array.from(this.byInstrumentId.values());
  }

  /** Clear the registry (for testing) */
  clear(): void {
    this.byInstrumentId.clear();
    this.byRawSymbol.clear();
    this.activeInstrumentId = null;
  }

  private emitRoll(event: ContractRollEvent): void {
    for (const listener of this.rollListeners) {
      try {
        listener(event);
      } catch {
        // ignore
      }
    }
  }
}

// ── Singleton instance ────────────────────────────────────────────────────────

/** Global symbol registry singleton */
export const symbolRegistry = new SymbolRegistry();

// ── Utility functions ─────────────────────────────────────────────────────────

/**
 * Determine if a given UTC timestamp is within MNQ regular trading hours (RTH).
 * RTH: 09:30–16:00 ET (13:30–20:00 UTC), Monday–Friday.
 */
export function isRegularTradingHours(tsMs: number): boolean {
  const date = new Date(tsMs);
  const dayOfWeek = date.getUTCDay(); // 0=Sun, 1=Mon, ..., 5=Fri, 6=Sat

  // Exclude weekends
  if (dayOfWeek === 0 || dayOfWeek === 6) return false;

  const utcHour = date.getUTCHours();
  const utcMinute = date.getUTCMinutes();
  const utcMinutes = utcHour * 60 + utcMinute;

  const rthOpen = 13 * 60 + 30;  // 13:30 UTC
  const rthClose = 20 * 60;       // 20:00 UTC

  return utcMinutes >= rthOpen && utcMinutes < rthClose;
}

/**
 * Determine if a given UTC timestamp is within MNQ extended trading hours (ETH).
 * ETH: Sunday 23:00 UTC to Friday 22:00 UTC (excludes 1-hour maintenance window).
 */
export function isExtendedTradingHours(tsMs: number): boolean {
  const date = new Date(tsMs);
  const dayOfWeek = date.getUTCDay();
  const utcHour = date.getUTCHours();

  // Saturday: no trading
  if (dayOfWeek === 6) return false;

  // Sunday: trading starts at 23:00 UTC
  if (dayOfWeek === 0) return utcHour >= 23;

  // Friday: trading ends at 22:00 UTC
  if (dayOfWeek === 5) return utcHour < 22;

  // Monday–Thursday: 24-hour trading except 22:00–23:00 UTC (maintenance)
  return !(utcHour >= 22 && utcHour < 23);
}

/**
 * Get the 5-minute bar open timestamp for a given trade timestamp.
 * Aligns to UTC clock (00:00:00 UTC, 00:05:00 UTC, etc.).
 */
export function getBarOpenTs(tsMs: number): number {
  return Math.floor(tsMs / 300_000) * 300_000;
}

/**
 * Get the 5-minute bar close timestamp for a given bar open timestamp.
 */
export function getBarCloseTs(barOpenTs: number): number {
  return barOpenTs + 300_000;
}
