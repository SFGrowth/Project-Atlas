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

  // ADE — Atlas Decision Engine
  ade_decision?: string | null;
  ade_candidate_model?: string | null;
  ade_edge_score?: number | null;
  ade_confidence?: number | null;
  ade_rank_order?: string | null;

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
