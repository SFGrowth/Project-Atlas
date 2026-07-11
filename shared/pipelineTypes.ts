/**
 * Shared types for the Atlas Nexus PipelineReport payload.
 * These types are used by both the server (webhook validation) and the client (dashboard rendering).
 */

export interface ModelEvaluation {
  signal_direction?: string | null;
  edge_score?: number | null;
  signal_basis?: string | null;
  confidence?: number | null;
  rank?: number | null;
}

export interface VerificationCheck {
  name: string;
  passed: boolean;
  value?: string | null;
}

export interface AdeV2EAR {
  version: string;
  model: string;
  direction?: string | null;
  raw_score: number;
  raw_max: number;
  norm_score: number;
  confidence_tier: string;
  is_candidate: boolean;
  // Dimension scores
  d_ms01: number;
  d_ms02: number;
  d_ms03: number;
  d_ms04: number;
  d_ms05?: number | null;
  d_eq01?: number | null;
  d_eq02: number;
  d_eq03: number;
  d_tc01: number;
  d_tc02: number;
  d_si01: number;
  d_si02: number;
  d_si03: number;
  d_cr01?: number | null;
  d_cr02?: number | null;
}

export interface AdeEdgeAttribution {
  model: string;
  raw: number;
  max: number;
  norm: number;
  conf: string;
  // Dimension scores
  ms01: number; // Trend Quality
  ms02: number; // ADX Regime
  ms03: number; // Volatility Expansion
  ms04: number; // Market Structure Integrity
  ms05: number; // Compression Quality (A3 only)
  eq01: number; // Pullback Depth (A1 only)
  eq02: number; // Liquidity Clearance
  eq03: number; // Risk Distance
  tc01: number; // Session Quality
  tc02: number; // Day-of-Week
  si01: number; // Historical Reliability
  si02: number; // Live Stability
  si03: number; // Observatory Confidence
  cr01: number; // Consecutive Loss penalty
  cr02: number; // Daily Drawdown penalty
}

export interface PipelineReportPayload {
  // Required fields
  schema_version: string;
  payload_type: string;
  event_id: string;
  idempotency_key: string;
  pipeline_run_id: string;
  timestamp_utc: string;
  bar_time: string;
  bar_index: number;
  chart_id: string;
  symbol: string;
  timeframe: string;
  master_state: string;

  // Market structure
  trend?: string | null;
  adx?: number | null;
  atr?: number | null;
  ema9?: number | null;
  ema21?: number | null;
  ema50?: number | null;
  vwap?: number | null;
  rsi?: number | null;
  volume_ratio?: number | null;

  // Position state
  trade_id?: string | null;
  entry_price?: number | null;
  stop_price?: number | null;
  target_price?: number | null;
  unrealized_pnl?: number | null;
  mfe?: number | null;
  mae?: number | null;
  bars_in_trade?: number | null;

  // Model evaluations
  model_a1?: ModelEvaluation | null;
  model_a3?: ModelEvaluation | null;
  model_b1?: ModelEvaluation | null;

  // ADE — Atlas Decision Engine v2
  ade_decision?: string | null;
  ade_candidate_model?: string | null;
  ade_edge_score?: number | null;
  ade_confidence?: string | null;
  ade_rank_order?: string | null;
  ade_version?: string | null;
  ade_edge_attribution?: AdeEdgeAttribution | null;
  ade_no_trade_reason?: string | null;
  ade_v2?: AdeV2EAR | null;

  // ARI — Atlas Risk Intelligence
  ari_approved?: string | null;
  ari_approved_risk?: number | null;
  ari_daily_pnl?: number | null;
  ari_drawdown?: number | null;
  ari_consecutive_losses?: number | null;
  ari_consecutive_wins?: number | null;
  ari_circuit_breaker?: string | null;

  // TVL — Trade Verification Layer
  tvl_status?: string | null;
  tvl_checks?: VerificationCheck[] | null;
  tvl_blocking_rule?: string | null;
  tvl_execution_permitted?: boolean | null;

  // Brain view
  brain_view?: string | null;
}

export interface NexusReport {
  id: string;
  receivedAt: string;
  payload: PipelineReportPayload;
}
