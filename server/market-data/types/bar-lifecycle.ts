/**
 * bar-lifecycle.ts — Sprint 123A.3 Canonical Data Model
 *
 * Defines all types, enums, and interfaces for the one-minute bar construction
 * engine, reconciliation, five-minute aggregation, contract management, and
 * effectively-once persistence.
 *
 * AUTHORITY NOTE: These types are parity-data preparation only.
 * TradingView remains the production processBar and postBarAutomation trigger.
 * MARKET_DATA_AUTHORITY = TRADINGVIEW_ONLY throughout Sprint 123A.3.
 *
 * Sprint 123A.3 — Gate G3
 */

// ─── Bar Lifecycle States ─────────────────────────────────────────────────────

/**
 * The lifecycle state of a one-minute bar as it progresses through the
 * construction, reconciliation, and aggregation pipeline.
 *
 * State transitions:
 *   DEVELOPING → PROVISIONAL (bar window closes)
 *   PROVISIONAL → CONFIRMED  (reconciliation: MATCHED within tolerance)
 *   PROVISIONAL → UNRESOLVED (reconciliation: UNMATCHED or UNAVAILABLE)
 *   PROVISIONAL → PENDING    (awaiting ohlcv-1m reference record)
 *   CONFIRMED   → (eligible for five-minute aggregation)
 *   UNRESOLVED  → (blocks five-minute aggregation for its window)
 *
 * INVARIANT: Only CONFIRMED bars may be forwarded to the Five-Min Aggregator.
 * INVARIANT: A five-minute window containing any UNRESOLVED minute must not
 *            produce a bar row in atlas_bars_5m.
 */
export enum BarLifecycle {
  /** Bar window is open; trades are still arriving. */
  DEVELOPING = 'DEVELOPING',
  /** Bar window has closed; awaiting reconciliation against ohlcv-1m. */
  PROVISIONAL = 'PROVISIONAL',
  /** Reconciliation complete: bar matches ohlcv-1m within tolerance. */
  CONFIRMED = 'CONFIRMED',
  /** Reconciliation failed or reference data unavailable. Blocks aggregation. */
  UNRESOLVED = 'UNRESOLVED',
  /** Reconciliation not yet attempted (reference record not yet received). */
  PENDING = 'PENDING',
}

// ─── Reconciliation Status ────────────────────────────────────────────────────

/**
 * Maps directly to the atlas_bars_1m.reconciliation_status ENUM in migration 0026.
 */
export enum ReconciliationStatus {
  MATCHED = 'MATCHED',
  UNMATCHED = 'UNMATCHED',
  PENDING = 'PENDING',
  UNAVAILABLE = 'UNAVAILABLE',
}

// ─── OHLCV Price Representation ───────────────────────────────────────────────

/**
 * All prices stored as integer points * 100 to avoid floating-point precision
 * loss. A price of 19500.25 is stored as 1950025.
 *
 * This matches the atlas_bars_1m schema: open_price_pts100 BIGINT.
 */
export interface OhlcvPts100 {
  openPts100: number;
  highPts100: number;
  lowPts100: number;
  closePts100: number;
  volume: number;
  tradeCount: number;
}

// ─── Reconciliation Detail ────────────────────────────────────────────────────

/**
 * Detailed reconciliation result stored in atlas_bars_1m.
 * All deltas in pts100 units (integer * 100).
 */
export interface ReconciliationDetail {
  status: ReconciliationStatus;
  /** Close price delta: constructed bar close − official ohlcv-1m close */
  closeDetlaPts100: number | null;
  highDeltaPts100: number | null;
  lowDeltaPts100: number | null;
  volumeDelta: number | null;
  withinTolerance: boolean | null;
  /** Tolerance threshold used (pts100). Default: 25 = 0.25 points. */
  tolerancePts100: number;
  reconTsMs: number;
}

// ─── One-Minute Bar ───────────────────────────────────────────────────────────

/**
 * A one-minute bar as it exists in the bar construction pipeline.
 * This is the in-memory representation; persistence writes to atlas_bars_1m.
 */
export interface MinuteBar {
  /** Unique identifier (assigned on persistence). */
  id?: number;
  source: 'DATABENTO';
  dataset: string;
  rawSymbol: string;
  instrumentId: number;
  /** Bar interval in milliseconds. Always 60000 for one-minute bars. */
  intervalMs: 60000;
  /** Bar open timestamp (UTC milliseconds). */
  barOpenTsMs: number;
  /** Raw Databento bar open timestamp (nanoseconds). Stored as string to avoid precision loss. */
  barOpenTsNs: string;
  /** Bar close timestamp (UTC milliseconds). */
  barCloseTsMs: number;
  ohlcv: OhlcvPts100;
  lifecycle: BarLifecycle;
  reconciliation: ReconciliationDetail | null;
  revision: number;
  mappingVersion: string;
  /** Atlas processing timestamp (UTC milliseconds). */
  atlasTsMs: number;
}

// ─── Official ohlcv-1m Record ─────────────────────────────────────────────────

/**
 * An official Databento ohlcv-1m reference record used for reconciliation.
 * Received via the bridge server's `databento:ohlcv-1m` event.
 */
export interface OfficialOhlcv1mRecord {
  source: 'DATABENTO';
  dataset: string;
  rawSymbol: string;
  instrumentId: number;
  barOpenTsMs: number;
  barOpenTsNs: string;
  barCloseTsMs: number;
  ohlcv: OhlcvPts100;
  /** Nanosecond timestamp of the official record's receipt. */
  tsRecvNs: string;
  atlasTsMs: number;
}

// ─── Five-Minute Bar ──────────────────────────────────────────────────────────

/**
 * Canonical bar type for atlas_bars_5m.
 * CONTAINS_UNRESOLVED is intentionally absent — a five-minute window containing
 * any UNRESOLVED minute must not produce a row.
 */
export enum FiveMinBarType {
  /** All 5 minutes confirmed from live feed (MATCHED). */
  LIVE_CONFIRMED = 'LIVE_CONFIRMED',
  /** One or more minutes are synthetic (no-trade bars). */
  CONTAINS_SYNTHETIC = 'CONTAINS_SYNTHETIC',
  /** Bar was recovered from a gap. */
  RECOVERED = 'RECOVERED',
}

/**
 * A five-minute aggregated bar produced from exactly 5 confirmed one-minute bars.
 * Persistence writes to atlas_bars_5m.
 *
 * INVARIANT: minuteBarCount must always be 5.
 * INVARIANT: All constituent minuteBars must have lifecycle === CONFIRMED.
 * INVARIANT: No constituent minuteBar may have lifecycle === UNRESOLVED.
 */
export interface FiveMinBar {
  id?: number;
  source: 'DATABENTO';
  dataset: string;
  rawSymbol: string;
  instrumentId: number;
  /** Bar interval in milliseconds. Always 300000 for five-minute bars. */
  intervalMs: 300000;
  barOpenTsMs: number;
  barCloseTsMs: number;
  ohlcv: OhlcvPts100;
  /** Must always be 5. */
  minuteBarCount: 5;
  barType: FiveMinBarType;
  /** The 5 constituent one-minute bars (in chronological order). */
  constituentBars: MinuteBar[];
  revision: number;
  mappingVersion: string;
  atlasTsMs: number;
}

// ─── Contract Definition ──────────────────────────────────────────────────────

/**
 * A contract definition record decoded from a Databento InstrumentDefMsg.
 * Received via the bridge server's `databento:definition` event.
 */
export interface ContractDefinition {
  source: 'DATABENTO';
  dataset: string;
  instrumentId: number;
  rawSymbol: string;
  /** Expiry timestamp (UTC milliseconds). Null if perpetual. */
  expiryTsMs: number | null;
  /** Minimum price increment in pts100 units. */
  minPriceIncrementPts100: number;
  currency: string;
  instrumentClass: string;
  mappingVersion: string;
  atlasTsMs: number;
}

// ─── Symbol Mapping ───────────────────────────────────────────────────────────

/**
 * A symbol mapping record decoded from a Databento SymbolMappingMsg.
 * Received via the bridge server's `databento:symbol-mapping` event.
 */
export interface SymbolMapping {
  source: 'DATABENTO';
  dataset: string;
  instrumentId: number;
  rawSymbol: string;
  stype: string;
  mappingVersion: string;
  effectiveTsMs: number;
  atlasTsMs: number;
}

// ─── Contract Roll ────────────────────────────────────────────────────────────

/**
 * A detected contract roll event.
 * Written to atlas_contract_rolls on detection.
 */
export interface ContractRoll {
  id?: number;
  dataset: string;
  fromSymbol: string;
  toSymbol: string;
  instrumentId: number;
  rollTsMs: number;
  mappingVersion: string;
  detectedBy: 'CONTRACT_ROLL_MANAGER';
  atlasTsMs: number;
}

// ─── Gap and Recovery ─────────────────────────────────────────────────────────

/**
 * A detected gap in the bar sequence.
 * Triggers historical recovery via the Python replay client.
 */
export interface BarGap {
  dataset: string;
  rawSymbol: string;
  instrumentId: number;
  /** First missing bar open timestamp (UTC milliseconds). */
  gapStartTsMs: number;
  /** Last missing bar open timestamp (UTC milliseconds). */
  gapEndTsMs: number;
  /** Number of missing one-minute bars. */
  missingBarCount: number;
  detectedTsMs: number;
}

/**
 * Result of a gap recovery attempt.
 */
export interface RecoveryResult {
  gap: BarGap;
  recoveredBars: MinuteBar[];
  status: 'COMPLETE' | 'PARTIAL' | 'FAILED';
  recoveredCount: number;
  failureReason?: string;
  completedTsMs: number;
}

// ─── Effectively-Once Ledger ──────────────────────────────────────────────────

/**
 * Entry in the atlas_consumer_processing_ledger for effectively-once processing.
 * Prevents duplicate processing of the same bar by multiple consumers.
 */
export interface ProcessingLedgerEntry {
  consumerId: string;
  eventType: string;
  eventKey: string;
  processedTsMs: number;
}

// ─── Bar Builder Events ───────────────────────────────────────────────────────

/**
 * Events emitted by the BarBuilder to downstream consumers.
 */
export type BarBuilderEvent =
  | { type: 'bar:developing';   bar: MinuteBar }
  | { type: 'bar:provisional';  bar: MinuteBar }
  | { type: 'bar:confirmed';    bar: MinuteBar }
  | { type: 'bar:unresolved';   bar: MinuteBar }
  | { type: 'bar:gap-detected'; gap: BarGap }
  | { type: 'bar:5m-ready';     fiveMinBar: FiveMinBar };

// ─── Tolerance Constants ──────────────────────────────────────────────────────

/**
 * Default reconciliation tolerance: 0.25 MNQ points = 25 pts100.
 * A constructed bar is CONFIRMED if all deltas are within this tolerance.
 */
export const DEFAULT_RECONCILIATION_TOLERANCE_PTS100 = 25;

/**
 * Five-minute aggregation window: exactly 5 one-minute bars.
 */
export const FIVE_MIN_WINDOW_SIZE = 5;

/**
 * Maximum age of a PENDING bar before it transitions to UNRESOLVED.
 * If the ohlcv-1m reference record has not arrived within this window,
 * the bar is marked UNRESOLVED and blocks aggregation.
 * Default: 90 seconds (3 × the bar period).
 */
export const PENDING_TIMEOUT_MS = 90_000;
