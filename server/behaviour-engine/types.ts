/**
 * Atlas Behaviour Engine — Type Definitions
 * Sprint 122B — Shadow Mode Implementation
 * Directive: ORION-DIRECTIVE-001
 */

// ─── Enumerations ────────────────────────────────────────────────────────────

export type BehaviourId =
  | 'TREND_CONTINUATION'
  | 'SECOND_ENTRY_PULLBACK'
  | 'LIQUIDITY_SWEEP'
  | 'FAILED_BREAKOUT'
  | 'MEAN_REVERSION'
  | 'OPENING_RANGE_BREAKOUT'
  | 'VWAP_RECLAIM'
  | 'COMPRESSION'
  | 'BREAKOUT_EXPANSION'
  | 'OVERNIGHT_INVENTORY'
  | 'SESSION_ROTATION'
  | 'VOLATILITY_EXPANSION';

export type BehaviourMaturity = 'FORMING' | 'ACTIVE' | 'MATURE' | 'EXHAUSTED';

export type BehaviourLifecycleState =
  | 'FORMING'
  | 'ACTIVE'
  | 'MATURE'
  | 'CONFIRMED'
  | 'EXPIRED'
  | 'REJECTED'
  | 'SUPERSEDED';

export type MarketRegime = 'TRENDING' | 'RANGING' | 'VOLATILE' | 'CHOPPY';
export type TradingSession = 'ASIA' | 'LONDON' | 'NEW_YORK' | 'OVERNIGHT';
export type BehaviourDirection = 'LONG' | 'SHORT' | 'NEUTRAL';

// ─── Input Data ──────────────────────────────────────────────────────────────

export interface RecentBarSummary {
  barOpenTs: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  atr: number;
  adx: number;
  rsi: number;
  vwap: number;
  ema9: number;
  ema21: number;
  regime: MarketRegime;
}

export interface ProcessedBarData {
  // Core OHLCV
  symbol: string;
  barOpenTs: number;
  barCloseTs: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;

  // Indicators
  atr: number;
  adx: number;
  rsi: number;
  vwap: number;
  ema9: number;
  ema21: number;
  regime: MarketRegime;
  session: TradingSession;

  // Recent history (last N bars)
  recentBars: RecentBarSummary[];
}

// ─── Classifier Interfaces ───────────────────────────────────────────────────

export interface EvidenceRecord {
  indicatorAgreement: number;    // 0–100
  regimeAlignment: number;       // 0–100
  sessionQuality: number;        // 0–100
  priceStructure: number;        // 0–100
  volumeConfirmation: number;    // 0–100
  historicalBaseRate: number;    // 0–100
  recencyWeight: number;         // 0–100
  rawIndicatorValues: Record<string, number>;
  classifierReasoning: string;
}

export interface ClassifierOutput {
  behaviourId: BehaviourId;
  direction: BehaviourDirection;
  rawEvidenceScores: Record<string, number>;
  preliminaryConfidence: number;
  classifierVersion: string;
  reasoning: string;
}

export interface IBehaviourClassifier {
  readonly behaviourId: BehaviourId;
  readonly version: string;
  classify(bar: ProcessedBarData): ClassifierOutput | null;
  getRequiredHistory(): number;
  isApplicable(bar: ProcessedBarData): boolean;
}

// ─── Behaviour Signal ────────────────────────────────────────────────────────

export interface BehaviourSignal {
  instanceId: string;
  behaviourId: BehaviourId;
  symbol: string;
  detectedAt: number;
  barOpenTs: number;
  direction: BehaviourDirection;
  confidence: number;
  probability: number;
  maturity: BehaviourMaturity;
  evidenceScore: number;
  expectedR: number;
  expectedDurationBars: number;
  failureProbability: number;
  regime: MarketRegime;
  session: TradingSession;
  evidence: EvidenceRecord;
  lifecycleState: BehaviourLifecycleState;
  classifierVersion: string;
}

// ─── Behaviour Instance (State Manager) ─────────────────────────────────────

export interface BehaviourInstance {
  instanceId: string;
  behaviourId: BehaviourId;
  symbol: string;
  direction: BehaviourDirection;
  firstDetectedAt: number;
  lastUpdatedAt: number;
  barCount: number;
  maxDurationBars: number;
  lifecycleState: BehaviourLifecycleState;
  maturity: BehaviourMaturity;
  confidence: number;
  peakConfidence: number;
  probability: number;
  evidenceScore: number;
  expectedR: number;
  expectedDurationBars: number;
  failureProbability: number;
  regime: MarketRegime;
  session: TradingSession;
  evidence: EvidenceRecord;
  classifierVersion: string;
  // Confirmation tracking
  confirmationBarTs?: number;
  confirmationReason?: string;
  rejectionReason?: string;
  contradictingBehaviourId?: string;
}

// ─── Behaviour Events ────────────────────────────────────────────────────────

export interface AtlasBehaviourEventBase {
  type: AtlasBehaviourEventType;
  eventId: string;
  atlasTs: number;
  instanceId: string;
  behaviourId: BehaviourId;
  symbol: string;
  barOpenTs: number;
  barCloseTs: number;
  source: 'live' | 'replay' | 'shadow';
}

export type AtlasBehaviourEventType =
  | 'behaviour_detected'
  | 'behaviour_updated'
  | 'behaviour_confirmed'
  | 'behaviour_expired'
  | 'behaviour_rejected';

export interface AtlasBehaviourDetected extends AtlasBehaviourEventBase {
  type: 'behaviour_detected';
  direction: BehaviourDirection;
  confidence: number;
  probability: number;
  maturity: BehaviourMaturity;
  evidenceScore: number;
  expectedR: number;
  expectedDurationBars: number;
  failureProbability: number;
  regime: string;
  session: string;
  lifecycleState: 'FORMING';
  evidence: EvidenceRecord;
  classifierVersion: string;
}

export interface AtlasBehaviourUpdated extends AtlasBehaviourEventBase {
  type: 'behaviour_updated';
  direction: BehaviourDirection;
  confidence: number;
  probability: number;
  maturity: BehaviourMaturity;
  evidenceScore: number;
  expectedR: number;
  expectedDurationBars: number;
  failureProbability: number;
  deltaConfidence: number;
  deltaProbability: number;
  lifecycleState: BehaviourLifecycleState;
  barCount: number;
  peakConfidence: number;
  regime: string;
  session: string;
  evidence: EvidenceRecord;
}

export interface AtlasBehaviourConfirmed extends AtlasBehaviourEventBase {
  type: 'behaviour_confirmed';
  direction: BehaviourDirection;
  finalConfidence: number;
  peakConfidence: number;
  totalBarsActive: number;
  confirmationReason: string;
  actualOutcome: {
    direction: BehaviourDirection;
    priceMove: number;
    barsToConfirmation: number;
    actualR: number | null;
  };
  updatePerformanceStats: boolean;
}

export interface AtlasBehaviourExpired extends AtlasBehaviourEventBase {
  type: 'behaviour_expired';
  direction: BehaviourDirection;
  finalConfidence: number;
  peakConfidence: number;
  totalBarsActive: number;
  maxDurationBars: number;
  expiryReason: 'MAX_DURATION_EXCEEDED' | 'REGIME_CHANGE' | 'SESSION_END';
  regimeAtExpiry: string;
  sessionAtExpiry: string;
  updatePerformanceStats: boolean;
}

export interface AtlasBehaviourRejected extends AtlasBehaviourEventBase {
  type: 'behaviour_rejected';
  direction: BehaviourDirection;
  finalConfidence: number;
  peakConfidence: number;
  totalBarsActive: number;
  rejectionReason: string;
  contradictingBehaviourId: string | null;
  contradictingEvidence: {
    indicatorValues: Record<string, number>;
    reasoning: string;
  };
  updatePerformanceStats: boolean;
}

export type AtlasBehaviourEvent =
  | AtlasBehaviourDetected
  | AtlasBehaviourUpdated
  | AtlasBehaviourConfirmed
  | AtlasBehaviourExpired
  | AtlasBehaviourRejected;

// ─── Engine Output ───────────────────────────────────────────────────────────

export interface BehaviourEngineResult {
  barOpenTs: number;
  symbol: string;
  processingMs: number;
  activeInstances: BehaviourInstance[];
  newDetections: BehaviourSignal[];
  updates: BehaviourSignal[];
  resolutions: Array<{ instanceId: string; resolution: 'CONFIRMED' | 'EXPIRED' | 'REJECTED' }>;
  events: AtlasBehaviourEvent[];
  volatilityExpansionActive: boolean;
}
