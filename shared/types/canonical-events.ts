/**
 * Atlas Canonical Market Event Contracts — TypeScript Interfaces
 * Sprint 123A.1 — Foundation
 *
 * These interfaces are the TypeScript implementation of the contracts defined in:
 *   docs/architecture/ATLAS_CANONICAL_MARKET_EVENT_CONTRACTS.md (Revision 6)
 *
 * Authority rules:
 *   - CanonicalBarConfirmed is published by the Canonical Router only.
 *   - In TRADINGVIEW_ONLY mode, it is derived from TradingView webhook bars.
 *   - Strategies, DARWIN, and the Behaviour Engine consume ONLY from
 *     atlas_canonical_bars (the database table) or via CanonicalBarConfirmed events.
 *   - processBar() is ALWAYS triggered by TradingView in Sprint 123A.
 *   - postBarAutomation is triggered by TradingView in TRADINGVIEW_ONLY mode.
 *
 * Sprint 123A.1 scope: interfaces only. No runtime emitters are implemented here.
 */

import type { MarketDataAuthorityMode } from '../../server/market-data/config';

// ─── Canonical Event ID ───────────────────────────────────────────────────────

/**
 * Uniquely identifies a canonical market event for effective-once processing.
 * Consumers use this to build their idempotency key:
 *   `{consumerName}_v{consumerVersion}:{source}:{dataset}:{rawSymbol}:{instrumentId}:{interval}:{barOpenTs}:{revision}`
 */
export interface CanonicalEventId {
  /** Data source: 'tradingview' | 'databento' */
  source: string;
  /** Databento dataset (e.g. 'GLBX.MDP3') or 'tradingview' */
  dataset: string;
  /** Raw symbol as resolved from the data source (e.g. 'MNQM5' or 'MNQ1!') */
  rawSymbol: string;
  /** Databento instrument ID, or 0 for TradingView */
  instrumentId: number;
  /** Bar interval: '1m' | '5m' */
  interval: '1m' | '5m';
  /** Bar open timestamp (UTC milliseconds) */
  barOpenTs: number;
  /** Revision number (0 = original; increments on correction) */
  revision: number;
  /** Symbol mapping version at time of event */
  mappingVersion: string;
}

// ─── 1-Minute Bar Events ──────────────────────────────────────────────────────

/**
 * A 1-minute bar that is still developing (intra-bar update).
 * Published by the Bar Builder at rate-limited intervals.
 * Consumed by AtlasLiveChart.tsx only.
 * NOT consumed by strategies, DARWIN, or the Behaviour Engine.
 */
export interface AtlasBarDeveloping1m {
  type: 'ATLAS_BAR_DEVELOPING_1M';
  eventId: CanonicalEventId;
  /** Bar open timestamp (UTC ms) */
  barOpenTsMs: number;
  /** Current partial OHLCV */
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  tradeCount: number;
  /** Atlas processing timestamp (UTC ms) */
  atlasTsMs: number;
}

/**
 * A 1-minute bar that has been confirmed (bar boundary crossed).
 * Published by the Bar Builder after reconciliation against ohlcv-1m.
 * Consumed by the Five-Min Aggregator.
 * NOT consumed directly by strategies, DARWIN, or the Behaviour Engine.
 */
export interface AtlasBarConfirmed1m {
  type: 'ATLAS_BAR_CONFIRMED_1M';
  eventId: CanonicalEventId;
  barOpenTsMs: number;
  barCloseTsMs: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  tradeCount: number;
  /** Bar type after reconciliation */
  barType: AtlasBar1mType;
  reconciledAgainstOhlcv: boolean;
  atlasTsMs: number;
}

/**
 * A 1-minute bar that could not be reconciled.
 * CRITICAL INVARIANT: AtlasBarUnresolved must NEVER be forwarded to the
 * five-minute aggregator. The five-minute window remains BLOCKED_UNRESOLVED.
 * No CanonicalBarConfirmed event is emitted for a window containing an
 * unresolved minute.
 */
export interface AtlasBarUnresolved {
  type: 'ATLAS_BAR_UNRESOLVED';
  eventId: CanonicalEventId;
  barOpenTsMs: number;
  barCloseTsMs: number;
  /** Reason the bar could not be resolved */
  unresolvedReason: string;
  atlasTsMs: number;
}

export type AtlasBar1mType =
  | 'LIVE_CONFIRMED'
  | 'SYNTHETIC_NO_TRADE_BAR'
  | 'UNRESOLVED'
  | 'RECOVERED';

// ─── 5-Minute Aggregation Window State ───────────────────────────────────────

export type FiveMinWindowState =
  | 'ACCUMULATING'        // 1–4 confirmed 1-minute bars received
  | 'COMPLETE'            // 5 confirmed bars — ready for canonical routing
  | 'BLOCKED_UNRESOLVED'  // At least one minute is unresolved — window is blocked
  | 'INCOMPLETE_TIMEOUT'; // Window timed out without 5 confirmed bars

// ─── Canonical Bar Confirmed ──────────────────────────────────────────────────

/**
 * The single authoritative confirmed 5-minute bar event.
 * Published by the Canonical Router after the Five-Min Aggregator produces
 * a COMPLETE window (no unresolved minutes).
 *
 * Sprint 123A.1 consumers (TRADINGVIEW_ONLY mode):
 *   - AtlasLiveChart.tsx
 *   - postBarAutomation (after Gate G6A, via Databento authority)
 *   - DARWIN and learning systems (via postBarAutomation)
 *
 * Sprint 123B consumers (DATABENTO_DECISION_AUTHORITY only):
 *   - Strategy processing and processBar
 *
 * CRITICAL: In TRADINGVIEW_ONLY mode, this event is derived from the
 * TradingView webhook bar, not from the Databento pipeline.
 */
export interface CanonicalBarConfirmed {
  type: 'CANONICAL_BAR_CONFIRMED';
  eventId: CanonicalEventId;
  /** Authority mode at time of dispatch */
  authorityMode: MarketDataAuthorityMode;
  /** Data source that produced this canonical bar */
  authoritySource: 'TRADINGVIEW' | 'DATABENTO';
  barOpenTsMs: number;
  barCloseTsMs: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  barType: AtlasCanonicalBarType;
  /** True if this bar has been dispatched to processBar (TradingView path) */
  dispatchedToProcessBar: boolean;
  /** True if this bar has been dispatched to postBarAutomation */
  dispatchedToPostBarAuto: boolean;
  dispatchTsMs: number;
  atlasTsMs: number;
}

export type AtlasCanonicalBarType =
  | 'LIVE_CONFIRMED'
  | 'CONTAINS_SYNTHETIC'
  | 'CONTAINS_UNRESOLVED'  // Must never be dispatched to production consumers
  | 'RECOVERED';

// ─── Contract Roll Event ──────────────────────────────────────────────────────

/**
 * Emitted by the Contract Roll Manager when a symbol mapping change is detected.
 * Consumed by AtlasLiveChart.tsx (for annotation) and the Bar Builder (to update
 * the active instrument ID).
 */
export interface AtlasContractRoll {
  type: 'ATLAS_CONTRACT_ROLL';
  dataset: string;
  fromSymbol: string;
  toSymbol: string;
  instrumentId: number;
  rollTsMs: number;
  mappingVersion: string;
  detectedBy: string;
  atlasTsMs: number;
}

// ─── Feed Health Event ────────────────────────────────────────────────────────

export type AtlasFeedHealthState =
  | 'CONNECTED'
  | 'DEGRADED'
  | 'RECONNECTING'
  | 'DISCONNECTED'
  | 'STALE'
  | 'UNKNOWN';

/**
 * Emitted by the Feed Health Monitor on state transitions.
 * Consumed by AtlasLiveChart.tsx only.
 */
export interface AtlasFeedHealthEvent {
  type: 'ATLAS_FEED_HEALTH';
  feedSource: 'TRADINGVIEW' | 'DATABENTO';
  state: AtlasFeedHealthState;
  previousState: AtlasFeedHealthState;
  message: string;
  consecutiveFailures: number;
  lastSuccessfulBarTsMs: number | null;
  atlasTsMs: number;
}

// ─── Parity Alert ─────────────────────────────────────────────────────────────

/**
 * Emitted by the Parity Monitor when a cross-feed parity check fails.
 * Consumed by AtlasLiveChart.tsx (for annotation) and the Observatory UI.
 */
export interface AtlasParityAlert {
  type: 'ATLAS_PARITY_ALERT';
  reportDate: string;
  severity: 'WARN' | 'ERROR';
  sectionAPass: boolean;
  sectionBPass: boolean;
  gateG4Pass: boolean;
  message: string;
  atlasTsMs: number;
}

// ─── Union type for all canonical events ─────────────────────────────────────

export type AtlasCanonicalEvent =
  | AtlasBarDeveloping1m
  | AtlasBarConfirmed1m
  | AtlasBarUnresolved
  | CanonicalBarConfirmed
  | AtlasContractRoll
  | AtlasFeedHealthEvent
  | AtlasParityAlert;

// ─── postBarAutomation input type ────────────────────────────────────────────

/**
 * The bar payload passed to postBarAutomation.
 * In TRADINGVIEW_ONLY mode, this is constructed from the TradingView webhook bar.
 * In DATABENTO_LEARNING_AUTHORITY mode, this is constructed from a
 * CanonicalBarConfirmed event.
 *
 * postBarAutomation is the SINGLE EXCLUSIVE owner of:
 *   - liveLearnEngine (candle certification, gap detection, market-law updates)
 *   - onNewBarObservation (DARWIN per-bar trigger — G-001 fix)
 *   - behaviourEngine.processBar (canonical 12-classifier)
 *
 * postBarAutomation does NOT own processBar() (execution trigger).
 */
export interface PostBarAutomationInput {
  /** Atlas memory record ID */
  id: number;
  memoryId: string;
  barTime: number;
  symbol: string;
  session: string | null;
  regime: string | null;
  open: string | null;
  high: string | null;
  low: string | null;
  close: string | null;
  volume: string | null;
  atr: string | null;
  atrExpansion: string | null;
  rsi: string | null;
  vwap: string | null;
  ema9: string | null;
  ema21: string | null;
  adx: string | null;
  adxTrending: boolean;
  trendDirection: string | null;
  volatilityState: string | null;
  a1Eligible: boolean;
  a3Eligible: boolean;
  b1Eligible: boolean;
  sb1Eligible: boolean;
  receivedAt: number;
  /** Source of the bar that triggered postBarAutomation */
  triggerSource: 'TRADINGVIEW' | 'DATABENTO';
  /** Authority mode at time of trigger */
  authorityMode: MarketDataAuthorityMode;
}
