/**
 * Atlas Market Event Contracts
 *
 * Provider-independent internal event types for the Atlas market data system.
 * No downstream consumer should have any knowledge of DataBento or TradingView.
 * All provider-specific formats are normalised to these types by the gateway layer.
 *
 * Sprint 121 — Atlas Market Data Platform
 */

// ── Feed health states ────────────────────────────────────────────────────────

export type FeedHealthState =
  | 'UNKNOWN'
  | 'CONNECTED'
  | 'DEGRADED'
  | 'RECONNECTING'
  | 'FALLBACK_ACTIVE'
  | 'OFFLINE';

export type DataSource = 'databento' | 'tradingview' | 'replay';

// ── Core price/size types ─────────────────────────────────────────────────────

/**
 * All prices in Atlas are stored as floating-point USD values.
 * DataBento prices arrive as fixed-point integers (÷ 1e9 to get USD).
 * TradingView prices arrive as floats already.
 */
export type AtlasPrice = number;

/** Lot size (number of contracts) */
export type AtlasSize = number;

// ── Trade event ───────────────────────────────────────────────────────────────

/**
 * A single trade execution on the exchange.
 * Normalised from DataBento MBP-1 record (action='T', flags & F_LAST).
 */
export interface AtlasTradeEvent {
  type: 'trade';
  source: DataSource;

  /** Canonical symbol (e.g. "MNQ1!") */
  symbol: string;

  /** Trade price in USD */
  price: AtlasPrice;

  /** Number of contracts traded */
  size: AtlasSize;

  /** Aggressor side: 'B' = buy aggressor, 'S' = sell aggressor, 'N' = unknown */
  side: 'B' | 'S' | 'N';

  /**
   * Exchange timestamp in milliseconds UTC.
   * From DataBento: ts_event (nanoseconds) ÷ 1_000_000.
   */
  tsEvent: number;

  /**
   * DataBento receive timestamp in milliseconds UTC.
   * From DataBento: ts_recv (nanoseconds) ÷ 1_000_000.
   * Undefined for non-DataBento sources.
   */
  tsRecv?: number;

  /**
   * Atlas receive timestamp in milliseconds UTC.
   * Set by the normaliser when the event is created.
   */
  atlasTs: number;

  /**
   * DataBento sequence number for gap detection.
   * Undefined for non-DataBento sources.
   */
  sequence?: number;

  /**
   * DataBento instrument_id (numeric).
   * Undefined for non-DataBento sources.
   */
  instrumentId?: number;
}

// ── Quote event ───────────────────────────────────────────────────────────────

/**
 * A best-bid-offer (BBO) update.
 * Normalised from DataBento MBP-1 record (action='M' or 'A' or 'C').
 */
export interface AtlasQuoteEvent {
  type: 'quote';
  source: DataSource;

  /** Canonical symbol (e.g. "MNQ1!") */
  symbol: string;

  /** Best bid price in USD */
  bidPx: AtlasPrice;

  /** Best ask price in USD */
  askPx: AtlasPrice;

  /** Best bid size (contracts) */
  bidSz: AtlasSize;

  /** Best ask size (contracts) */
  askSz: AtlasSize;

  /** Best bid order count */
  bidCt: number;

  /** Best ask order count */
  askCt: number;

  /** Spread in USD (askPx - bidPx) */
  spread: AtlasPrice;

  /** Exchange timestamp in milliseconds UTC */
  tsEvent: number;

  /** DataBento receive timestamp in milliseconds UTC */
  tsRecv?: number;

  /** Atlas receive timestamp in milliseconds UTC */
  atlasTs: number;

  /** DataBento sequence number */
  sequence?: number;

  /** DataBento instrument_id */
  instrumentId?: number;
}

// ── Bar status ────────────────────────────────────────────────────────────────

export type AtlasBarStatus = 'developing' | 'confirmed';

// ── Bar event ─────────────────────────────────────────────────────────────────

/**
 * A 5-minute OHLCV bar.
 * 'developing' = bar is in progress (emitted on every trade update, rate-limited).
 * 'confirmed'  = bar is closed (emitted once at barCloseTs + 50ms grace period).
 */
export interface AtlasBarEvent {
  type: 'bar';
  source: DataSource;
  status: AtlasBarStatus;

  /** Canonical symbol (e.g. "MNQ1!") */
  symbol: string;

  /** Bar open timestamp in milliseconds UTC (UTC-aligned, floor to 5-min boundary) */
  barOpenTs: number;

  /** Bar close timestamp in milliseconds UTC (barOpenTs + 300_000) */
  barCloseTs: number;

  /** Open price in USD */
  open: AtlasPrice;

  /** High price in USD */
  high: AtlasPrice;

  /** Low price in USD */
  low: AtlasPrice;

  /** Close price in USD (last trade price for developing, final for confirmed) */
  close: AtlasPrice;

  /** Total volume (contracts) in this bar */
  volume: AtlasSize;

  /** Number of individual trades in this bar */
  tickCount: number;

  /** Atlas receive timestamp in milliseconds UTC */
  atlasTs: number;
}

// ── Feed health event ─────────────────────────────────────────────────────────

/**
 * Feed health state change notification.
 * Emitted by feed-health.ts on every state transition.
 */
export interface AtlasFeedHealthEvent {
  type: 'feed_health';
  source: DataSource;

  /** New state */
  state: FeedHealthState;

  /** Previous state */
  previousState: FeedHealthState;

  /** Human-readable reason for the transition */
  reason: string;

  /** Atlas timestamp of the transition */
  atlasTs: number;

  /** Milliseconds since last message from this source (for DEGRADED/RECONNECTING) */
  silenceMs?: number;

  /** Reconnection attempt number (for RECONNECTING) */
  reconnectAttempt?: number;
}

// ── Symbol mapping event ──────────────────────────────────────────────────────

/**
 * Emitted when DataBento sends a SymbolMappingMsg.
 * Used to update the symbol registry with the current instrument_id → symbol mapping.
 */
export interface AtlasSymbolMappingEvent {
  type: 'symbol_mapping';
  source: DataSource;

  /** DataBento instrument_id (numeric) */
  instrumentId: number;

  /** DataBento raw symbol (e.g. "MNQM5") */
  rawSymbol: string;

  /** Atlas canonical symbol (e.g. "MNQ1!") */
  canonicalSymbol: string;

  /** Mapping valid from timestamp (ms UTC) */
  startTs: number;

  /** Mapping valid until timestamp (ms UTC), 0 = indefinite */
  endTs: number;

  /** Atlas timestamp */
  atlasTs: number;
}

// ── Union type for all Atlas market events ────────────────────────────────────

export type AtlasMarketEvent =
  | AtlasTradeEvent
  | AtlasQuoteEvent
  | AtlasBarEvent
  | AtlasFeedHealthEvent
  | AtlasSymbolMappingEvent;

// ── Event bus channel names ───────────────────────────────────────────────────

export const ATLAS_EVENT_CHANNELS = {
  TRADE: 'atlas:trade',
  QUOTE: 'atlas:quote',
  BAR: 'atlas:bar',
  FEED_HEALTH: 'atlas:feed_health',
  SYMBOL_MAPPING: 'atlas:symbol_mapping',
  ALL: 'atlas:*',
} as const;

export type AtlasEventChannel = (typeof ATLAS_EVENT_CHANNELS)[keyof typeof ATLAS_EVENT_CHANNELS];
