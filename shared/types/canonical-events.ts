/**
 * Atlas Canonical Market Event Contracts — TypeScript Interfaces
 * Sprint 123A.1 — Foundation (Gate G1 Revision 3)
 *
 * These interfaces implement the contracts defined in:
 *   docs/architecture/ATLAS_CANONICAL_MARKET_EVENT_CONTRACTS.md (Revision 6)
 *
 * Key corrections applied at Gate G1 Revision 3:
 *   - DatabentoEventId and TradingViewEventId are fully separate types.
 *     TradingView does not fabricate dataset, instrumentId, or mappingVersion
 *     fields — those fields simply do not exist on TradingViewEventId.
 *   - All Databento 1-minute lifecycle events (Developing, ProvisionalClosed,
 *     Confirmed, Unresolved, ReleasedForInspection) use eventId: DatabentoEventId.
 *     TradingView is not assignable to these event types.
 *   - AtlasBarReleasedForInspection uses a formal InspectionReleaseApproval
 *     record instead of an unrestricted releasedByOperator string.
 *   - The event remains ineligible for canonical processing.
 *
 * Key corrections applied at Gate G1 Revision 2:
 *   - CanonicalEventId = DatabentoEventId | TradingViewEventId
 *   - All timestamps use barOpenTsMs (not barOpenTs)
 *   - Five distinct bar lifecycle types
 *   - AtlasBarConfirmed always has reconciliationStatus = 'MATCHED'
 *   - reconciledAgainstOhlcv: boolean removed
 *   - CONTAINS_UNRESOLVED removed from all canonical bar types
 *   - CanonicalBarConfirmed has containsUnresolvedMinutes: false (literal)
 *
 * Authority rules:
 *   - CanonicalBarConfirmed is published by the Canonical Router only.
 *   - In TRADINGVIEW_ONLY mode, it is derived from TradingView webhook bars.
 *   - processBar() is ALWAYS triggered by TradingView in Sprint 123A.
 *   - postBarAutomation is triggered by TradingView in TRADINGVIEW_ONLY,
 *     DATABENTO_SHADOW, and DATABENTO_CHART_AUTHORITY modes.
 *   - postBarAutomation is triggered by Databento in
 *     DATABENTO_LEARNING_AUTHORITY mode only.
 *   - DATABENTO_DECISION_AUTHORITY is Sprint 123B only — not part of Sprint 123A.
 */

import type { Sprint123AAuthorityMode } from '../../server/market-data/config';

// ─── Source-specific Event IDs ────────────────────────────────────────────────

/**
 * Identifies a Databento-sourced market event.
 *
 * Fields match Event Contracts Revision 6 Section 3 exactly.
 * Raw Databento timestamps are preserved as bigint (nanoseconds since epoch)
 * internally. On the WebSocket wire they are serialised as decimal strings
 * to avoid JavaScript number precision loss.
 */
export interface DatabentoEventId {
  source: 'DATABENTO';
  /** Databento dataset identifier (e.g. 'GLBX.MDP3') */
  dataset: string;
  /** Raw symbol as resolved from Databento (e.g. 'MNQM5') */
  rawSymbol: string;
  /** Databento instrument_id (numeric, stable within a dataset+date range) */
  instrumentId: number;
  /** Bar interval: '1m' | '5m' */
  interval: '1m' | '5m';
  /**
   * Bar open timestamp in UTC milliseconds (used for all Atlas processing).
   * Derived from the raw nanosecond timestamp: barOpenTsMs = barOpenTsNs / 1_000_000n
   */
  barOpenTsMs: number;
  /** Revision number (0 = original; increments on correction) */
  revision: number;
  /** Symbol mapping version at time of event */
  mappingVersion: string;
}

/**
 * Identifies a TradingView-sourced market event.
 *
 * Fields match Event Contracts Revision 6 Section 3 exactly.
 * TradingView does not provide dataset identifiers, instrument IDs, or
 * nanosecond timestamps. These fields are intentionally absent — they must
 * not be fabricated or defaulted.
 */
export interface TradingViewEventId {
  source: 'TRADINGVIEW';
  /** TradingView instrument key (e.g. 'MNQ1!') */
  sourceInstrumentKey: string;
  /** Bar interval: always '5m' for TradingView webhook bars in Sprint 123A */
  interval: '5m';
  /** Bar open timestamp in UTC milliseconds */
  barOpenTsMs: number;
  /** Revision number (0 = original) */
  revision: number;
}

/**
 * Union type for all canonical event identifiers.
 * Use the `source` discriminant to narrow to the specific type.
 */
export type CanonicalEventId = DatabentoEventId | TradingViewEventId;

// ─── Reconciliation Status ────────────────────────────────────────────────────

/**
 * Result of reconciling a bar against the Databento ohlcv-1m reference feed.
 *
 * MATCHED:     Bar matches the reference feed within tolerance. Safe to use.
 * UNMATCHED:   Bar does not match the reference feed. Must not become canonical.
 * PENDING:     Reconciliation has not yet been attempted.
 * UNAVAILABLE: Reference feed data is not available for this bar.
 *
 * CRITICAL: Only MATCHED bars may be aggregated into a 5-minute window.
 * UNMATCHED bars must be emitted as AtlasBarUnresolved.
 */
export type ReconciliationStatus = 'MATCHED' | 'UNMATCHED' | 'PENDING' | 'UNAVAILABLE';

// ─── Bar Lifecycle Type 1: Developing ────────────────────────────────────────

/**
 * A 1-minute bar that is still developing (intra-bar update).
 * Published by the Bar Builder at rate-limited intervals during the bar.
 *
 * Source: Databento only. eventId is always DatabentoEventId.
 * TradingView is not assignable to this event type.
 *
 * Consumers: AtlasLiveChart.tsx only.
 * NOT consumed by: strategies, DARWIN, Behaviour Engine, Five-Min Aggregator.
 */
export interface AtlasBarDeveloping {
  type: 'ATLAS_BAR_DEVELOPING';
  eventId: DatabentoEventId;
  /** Bar open timestamp (UTC ms) — always use barOpenTsMs, never barOpenTs */
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

// ─── Bar Lifecycle Type 2: ProvisionalClosed ─────────────────────────────────

/**
 * A 1-minute bar that has crossed the bar boundary but has not yet been
 * reconciled against the Databento ohlcv-1m reference feed.
 *
 * Source: Databento only. eventId is always DatabentoEventId.
 * TradingView is not assignable to this event type.
 *
 * This is a transient state. The bar will transition to either
 * AtlasBarConfirmed (reconciliationStatus = MATCHED) or
 * AtlasBarUnresolved (reconciliationStatus = UNMATCHED | UNAVAILABLE).
 *
 * Consumers: Bar Builder internal state machine only.
 * NOT forwarded to the Five-Min Aggregator.
 */
export interface AtlasBarProvisionalClosed {
  type: 'ATLAS_BAR_PROVISIONAL_CLOSED';
  eventId: DatabentoEventId;
  barOpenTsMs: number;
  barCloseTsMs: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  tradeCount: number;
  reconciliationStatus: 'PENDING';
  atlasTsMs: number;
}

// ─── Bar Lifecycle Type 3: Confirmed ─────────────────────────────────────────

/**
 * A 1-minute bar that has been confirmed after successful reconciliation.
 *
 * Source: Databento only. eventId is always DatabentoEventId.
 * TradingView is not assignable to this event type.
 *
 * INVARIANT: reconciliationStatus is ALWAYS 'MATCHED'.
 * A bar with any other reconciliation status must not be emitted as
 * AtlasBarConfirmed. It must be emitted as AtlasBarUnresolved instead.
 *
 * Consumers: Five-Min Aggregator.
 * NOT consumed directly by strategies, DARWIN, or the Behaviour Engine.
 */
export interface AtlasBarConfirmed {
  type: 'ATLAS_BAR_CONFIRMED';
  eventId: DatabentoEventId;
  barOpenTsMs: number;
  barCloseTsMs: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  tradeCount: number;
  /**
   * INVARIANT: Must always be 'MATCHED'.
   * This is a literal type to make the invariant explicit and compile-time enforced.
   */
  reconciliationStatus: 'MATCHED';
  /**
   * Discrepancy details from reconciliation (null when MATCHED with zero discrepancy).
   * Preserved for audit purposes even when reconciliation passes within tolerance.
   */
  reconciliationDiscrepancy: ReconciliationDiscrepancy | null;
  atlasTsMs: number;
}

/**
 * Quantified discrepancy between the live bar and the reference feed.
 * Stored even when within tolerance, for audit and parity reporting.
 */
export interface ReconciliationDiscrepancy {
  closeDeltaPts: number;
  highDeltaPts: number;
  lowDeltaPts: number;
  volumeDelta: number;
  withinTolerance: boolean;
  toleranceThresholdPts: number;
}

// ─── Bar Lifecycle Type 4: Unresolved ────────────────────────────────────────

/**
 * A 1-minute bar that could not be reconciled.
 *
 * Source: Databento only. eventId is always DatabentoEventId.
 * TradingView is not assignable to this event type.
 *
 * CRITICAL INVARIANT: AtlasBarUnresolved must NEVER be forwarded to the
 * Five-Min Aggregator. The five-minute window is marked BLOCKED_UNRESOLVED.
 * No CanonicalBarConfirmed event is emitted for a window containing an
 * unresolved minute. No containsUnresolvedMinutes=true canonical candidate
 * is created. No processBar or postBarAutomation is called.
 *
 * Consumers: AtlasLiveChart.tsx (for annotation), DARWIN (for gap analysis).
 * NOT forwarded to: Five-Min Aggregator, strategies, Behaviour Engine.
 */
export interface AtlasBarUnresolved {
  type: 'ATLAS_BAR_UNRESOLVED';
  eventId: DatabentoEventId;
  barOpenTsMs: number;
  barCloseTsMs: number;
  reconciliationStatus: 'UNMATCHED' | 'UNAVAILABLE';
  unresolvedReason: string;
  reconciliationDiscrepancy: ReconciliationDiscrepancy | null;
  atlasTsMs: number;
}

// ─── Inspection Release Approval ─────────────────────────────────────────────

/**
 * Formal approval record required to release an unresolved bar for inspection.
 *
 * An unrestricted operator string is not sufficient. Every release must carry
 * a formally authenticated approval record. The approver ID must be one of the
 * authorised Atlas operations principals.
 *
 * This record is immutable once created and must be stored in the audit log.
 */
export interface InspectionReleaseApproval {
  /**
   * Authorised approver identifier.
   * Currently restricted to 'PHIL' (Atlas principal operator).
   * Additional approvers may be added by amending this type in a future sprint.
   */
  releaseApprovedBy: 'PHIL';
  /** Approval timestamp (UTC ms) */
  approvalTsMs: number;
  /**
   * Written approval reference — a short human-readable reference that
   * identifies the approval event (e.g. a Gate number, ticket ID, or
   * session reference such as 'Gate G1 Round 3 — 2026-07-19').
   */
  writtenApprovalReference: string;
  /** Human-readable reason for releasing this bar for inspection */
  releaseReason: string;
}

// ─── Bar Lifecycle Type 5: ReleasedForInspection ──────────────────────────────

/**
 * A bar that was previously unresolved and has been manually reviewed and
 * released for inspection by the Atlas operations team.
 *
 * Source: Databento only. eventId is always DatabentoEventId.
 * TradingView is not assignable to this event type.
 *
 * CRITICAL: This type exists to support post-hoc analysis and DARWIN research.
 * It must NEVER be used as input to the Five-Min Aggregator or any
 * production processing path. The event is permanently ineligible for
 * canonical processing.
 *
 * Every release requires a formal InspectionReleaseApproval record.
 * An unrestricted operator string is not sufficient.
 *
 * Consumers: DARWIN research pipeline, Observatory dashboard.
 * NOT forwarded to: Five-Min Aggregator, strategies, Behaviour Engine,
 *                   postBarAutomation, processBar.
 */
export interface AtlasBarReleasedForInspection {
  type: 'ATLAS_BAR_RELEASED_FOR_INSPECTION';
  eventId: DatabentoEventId;
  barOpenTsMs: number;
  barCloseTsMs: number;
  originalReconciliationStatus: 'UNMATCHED' | 'UNAVAILABLE';
  /**
   * Formal approval record. An unrestricted string is not accepted.
   * Every release must carry a complete InspectionReleaseApproval.
   */
  releaseApproval: InspectionReleaseApproval;
  /**
   * INVARIANT: This event is permanently ineligible for canonical processing.
   * This literal type makes the invariant explicit and compile-time enforced.
   */
  eligibleForCanonicalProcessing: false;
  atlasTsMs: number;
}

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
 * a COMPLETE window (all 5 minutes confirmed with reconciliationStatus = MATCHED).
 *
 * INVARIANT: containsUnresolvedMinutes is ALWAYS false (literal type).
 * A window containing any unresolved minute must not produce a
 * CanonicalBarConfirmed event.
 *
 * Sprint 123A.1 consumers (TRADINGVIEW_ONLY mode):
 *   - AtlasLiveChart.tsx
 *   - postBarAutomation (after Gate G6A, via DATABENTO_LEARNING_AUTHORITY)
 *   - DARWIN and learning systems (via postBarAutomation)
 *
 * Sprint 123B consumers (DATABENTO_DECISION_AUTHORITY only):
 *   - Strategy processing and processBar
 *
 * NOTE: Strategy and processBar consumption is reserved exclusively for
 * Sprint 123B and DATABENTO_DECISION_AUTHORITY.
 */
export interface CanonicalBarConfirmed {
  type: 'CANONICAL_BAR_CONFIRMED';
  eventId: CanonicalEventId;
  /** Authority mode at time of dispatch */
  authorityMode: Sprint123AAuthorityMode;
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
  /**
   * INVARIANT: Always false.
   * A CanonicalBarConfirmed event must never be produced from a window
   * that contains an unresolved minute. This is a literal type to make
   * the invariant explicit and compile-time enforced.
   */
  containsUnresolvedMinutes: false;
  /** True if this bar has been dispatched to processBar (TradingView path) */
  dispatchedToProcessBar: boolean;
  /** True if this bar has been dispatched to postBarAutomation */
  dispatchedToPostBarAuto: boolean;
  dispatchTsMs: number;
  atlasTsMs: number;
}

/**
 * Canonical bar type classification.
 * CONTAINS_UNRESOLVED is intentionally absent — a canonical bar can never
 * contain unresolved minutes.
 */
export type AtlasCanonicalBarType =
  | 'LIVE_CONFIRMED'      // All 5 minutes confirmed from live feed
  | 'CONTAINS_SYNTHETIC'  // One or more minutes are synthetic (no-trade bars)
  | 'RECOVERED';          // Bar was recovered from a gap

// ─── Contract Roll Event ──────────────────────────────────────────────────────

/**
 * Emitted by the Contract Roll Manager when a symbol mapping change is detected.
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
 */
export interface AtlasParityAlert {
  type: 'ATLAS_PARITY_ALERT';
  reportDate: string;
  severity: 'WARN' | 'ERROR';
  sectionAPass: boolean;
  sectionBPass: boolean;
  message: string;
  atlasTsMs: number;
}

// ─── Union type for all canonical events ─────────────────────────────────────

export type AtlasCanonicalEvent =
  | AtlasBarDeveloping
  | AtlasBarProvisionalClosed
  | AtlasBarConfirmed
  | AtlasBarUnresolved
  | AtlasBarReleasedForInspection
  | CanonicalBarConfirmed
  | AtlasContractRoll
  | AtlasFeedHealthEvent
  | AtlasParityAlert;

// ─── postBarAutomation input type ────────────────────────────────────────────

/**
 * The bar payload passed to postBarAutomation.
 *
 * In TRADINGVIEW_ONLY, DATABENTO_SHADOW, and DATABENTO_CHART_AUTHORITY modes,
 * this is constructed from the TradingView webhook bar.
 *
 * In DATABENTO_LEARNING_AUTHORITY mode, this is constructed from a
 * CanonicalBarConfirmed event sourced from Databento.
 *
 * postBarAutomation is the SINGLE EXCLUSIVE owner of:
 *   - liveLearnEngine (candle certification, gap detection, market-law updates)
 *   - onNewBarObservation (DARWIN per-bar trigger — G-001 fix)
 *   - behaviourEngine.runBehaviourEngineShadow (canonical 12-classifier, shadow mode)
 *
 * postBarAutomation does NOT own:
 *   - processBar() — execution trigger (TradingView only, Sprint 123A)
 *   - ADE, strategies, risk, or execution logic
 */
export interface PostBarAutomationInput {
  /** Atlas memory record ID */
  id: number;
  /** Atlas memory ID string (e.g. 'MEM_MNQ1!_1234567890') */
  memoryId: string;
  /** Bar open timestamp (UTC ms) */
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
  /**
   * Source of the bar that triggered postBarAutomation.
   * Must match the authority matrix:
   *   TRADINGVIEW_ONLY           → TRADINGVIEW
   *   DATABENTO_SHADOW           → TRADINGVIEW
   *   DATABENTO_CHART_AUTHORITY  → TRADINGVIEW
   *   DATABENTO_LEARNING_AUTHORITY → DATABENTO
   */
  triggerSource: 'TRADINGVIEW' | 'DATABENTO';
  /**
   * Authority mode at time of trigger.
   * Must match getMarketDataAuthority() at runtime.
   * A mismatch between this field and the live environment value is a
   * critical invariant violation and must abort before any subsystem is called.
   */
  authorityMode: Sprint123AAuthorityMode;
}
