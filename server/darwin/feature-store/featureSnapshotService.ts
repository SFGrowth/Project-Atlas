/**
 * DARWIN Feature Snapshot Service
 * Sprint: darwin-complete-edge-search-universe
 * Created: 2026-07-31T01:18:00Z
 * Status: LOCAL ONLY — not deployed until soak completion and evidence lock
 *
 * Computes causal feature snapshots for completed bars.
 * FUTURE_DATA_USES=0 — all features use only data at or before bar close timestamp.
 */

import mysql from 'mysql2/promise';

let _pool: mysql.Pool | null = null;
function getPool(): mysql.Pool {
  if (!_pool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL not set');
    const u = new URL(url);
    _pool = mysql.createPool({
      host: u.hostname,
      user: u.username,
      password: decodeURIComponent(u.password),
      database: u.pathname.slice(1),
      port: parseInt(u.port || '3306', 10),
      waitForConnections: true,
      connectionLimit: 5,
    });
  }
  return _pool;
}

export interface FeatureSnapshot {
  feature_snapshot_id?: number;
  source_event_id?: number;
  market_timestamp: Date;
  instrument: string;
  contract: string;
  timeframe: '1m' | '5m' | '15m' | '30m' | '60m';
  feature_version: string;
  features_json: FeatureGroups;
  data_quality_status: 'OK' | 'STALE' | 'MISSING' | 'ROLL';
}

export interface FeatureGroups {
  price: PriceFeatures;
  volatility: VolatilityFeatures;
  trend: TrendFeatures;
  vwap: VwapFeatures;
  volume: VolumeFeatures;
  structure: StructureFeatures;
  session: SessionFeatures;
  regime: RegimeFeatures;
  quality: QualityFeatures;
}

export interface PriceFeatures {
  open: number;
  high: number;
  low: number;
  close: number;
  range: number;
  body: number;
  upper_wick: number;
  lower_wick: number;
  close_location_value: number;
  returns_1bar: number | null;
  gap: number | null;
  inside_bar: boolean;
  outside_bar: boolean;
}

export interface VolatilityFeatures {
  atr14: number | null;
  atr_percentile: number | null;
  rolling_range_10: number | null;
  realised_vol_20: number | null;
  vol_acceleration: number | null;
  compression_score: number | null;
  expansion_score: number | null;
  vol_regime: 'LOW' | 'NORMAL' | 'HIGH' | 'EXTREME' | null;
}

export interface TrendFeatures {
  ema9: number | null;
  ema20: number | null;
  ema50: number | null;
  ema200: number | null;
  ema9_slope: number | null;
  ema20_slope: number | null;
  ema_separation: number | null;
  trend_strength: number | null;
  bars_above_ema20: number | null;
  bars_below_ema20: number | null;
  ema_cross_count_20: number | null;
  bars_since_ema_cross: number | null;
}

export interface VwapFeatures {
  session_vwap: number | null;
  distance_from_vwap: number | null;
  vwap_slope: number | null;
  vwap_cross_count: number | null;
  bars_since_vwap_cross: number | null;
  vwap_reclaim_state: boolean | null;
  vwap_rejection_state: boolean | null;
}

export interface VolumeFeatures {
  volume: number;
  relative_volume: number | null;
  volume_percentile: number | null;
  volume_acceleration: number | null;
  volume_deceleration: number | null;
  price_volume_agreement: boolean | null;
  price_volume_divergence: boolean | null;
}

export interface StructureFeatures {
  prior_day_high: number | null;
  prior_day_low: number | null;
  prior_week_high: number | null;
  prior_week_low: number | null;
  overnight_high: number | null;
  overnight_low: number | null;
  opening_range_high: number | null;
  opening_range_low: number | null;
  recent_swing_high: number | null;
  recent_swing_low: number | null;
  range_centre: number | null;
  dist_from_pdh: number | null;
  dist_from_pdl: number | null;
  dist_from_orh: number | null;
  dist_from_orl: number | null;
  break_state: 'NONE' | 'ABOVE_PDH' | 'BELOW_PDL' | 'ABOVE_ORH' | 'BELOW_ORL' | null;
  reclaim_state: boolean | null;
  retest_state: boolean | null;
  retest_count: number | null;
}

export interface SessionFeatures {
  session: 'ASIA' | 'LONDON' | 'NY_PREMARKET' | 'NY_RTH' | 'NY_CLOSE' | 'MAINTENANCE';
  minute_within_session: number;
  weekday: number;
  week_of_month: number;
  month: number;
  time_to_rth_open_min: number;
  time_from_rth_open_min: number;
  time_to_maintenance_min: number | null;
  time_from_maintenance_min: number | null;
}

export interface RegimeFeatures {
  trend_regime: 'BULLISH' | 'BEARISH' | 'NEUTRAL' | null;
  vol_regime: 'LOW' | 'NORMAL' | 'HIGH' | 'EXTREME' | null;
  market_regime: 'TRENDING' | 'RANGING' | 'COMPRESSION' | 'EXPANSION' | 'TRANSITION' | null;
  regime_confidence: number | null;
}

export interface QualityFeatures {
  missing_data_flag: boolean;
  stale_data_flag: boolean;
  feed_health_state: 'OK' | 'DEGRADED' | 'DOWN';
  contract_roll_flag: boolean;
  spread_quality_flag: boolean | null;
  microstructure_quality_flag: boolean | null;
}

export const FEATURE_VERSION = '1.0.0';

/**
 * Compute price features from a completed bar.
 * All inputs are from the bar itself — strictly causal.
 */
export function computePriceFeatures(
  bar: { open: number; high: number; low: number; close: number },
  prevClose: number | null
): PriceFeatures {
  const range = bar.high - bar.low;
  const body = Math.abs(bar.close - bar.open);
  const upper_wick = bar.high - Math.max(bar.open, bar.close);
  const lower_wick = Math.min(bar.open, bar.close) - bar.low;
  const close_location_value = range > 0 ? (bar.close - bar.low) / range : 0.5;
  const returns_1bar = prevClose !== null ? (bar.close - prevClose) / prevClose : null;
  const gap = prevClose !== null ? bar.open - prevClose : null;

  return {
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
    range,
    body,
    upper_wick,
    lower_wick,
    close_location_value,
    returns_1bar,
    gap,
    inside_bar: false, // requires prev bar — computed by caller
    outside_bar: false, // requires prev bar — computed by caller
  };
}

/**
 * Compute EMA using Wilder's method.
 * Strictly causal: uses only bars up to and including the current bar.
 */
export function computeEMA(prices: number[], period: number): number | null {
  if (prices.length < period) return null;
  const k = 2 / (period + 1);
  let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < prices.length; i++) {
    ema = prices[i] * k + ema * (1 - k);
  }
  return ema;
}

/**
 * Compute ATR14 using Wilder's method.
 * Strictly causal: uses only bars up to and including the current bar.
 */
export function computeATR14(bars: Array<{ high: number; low: number; close: number }>): number | null {
  if (bars.length < 15) return null;
  const trs: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const tr = Math.max(
      bars[i].high - bars[i].low,
      Math.abs(bars[i].high - bars[i - 1].close),
      Math.abs(bars[i].low - bars[i - 1].close)
    );
    trs.push(tr);
  }
  if (trs.length < 14) return null;
  let atr = trs.slice(0, 14).reduce((a, b) => a + b, 0) / 14;
  for (let i = 14; i < trs.length; i++) {
    atr = (atr * 13 + trs[i]) / 14;
  }
  return atr;
}

/**
 * Classify session from UTC timestamp.
 * Uses CME Globex session definitions.
 */
export function classifySession(ts: Date): SessionFeatures['session'] {
  const utcHour = ts.getUTCHours();
  const utcMin = ts.getUTCMinutes();
  const totalMin = utcHour * 60 + utcMin;

  // Maintenance: 22:00–23:00 UTC (Mon–Thu) — simplified
  if (totalMin >= 22 * 60 && totalMin < 23 * 60) return 'MAINTENANCE';

  // NY RTH: 14:30–21:00 UTC (09:30–16:00 ET, EDT offset)
  // Note: DST handling is simplified here; production uses cmeSchedule.ts
  if (totalMin >= 14 * 60 + 30 && totalMin < 21 * 60) return 'NY_RTH';

  // NY Premarket: 13:00–14:30 UTC
  if (totalMin >= 13 * 60 && totalMin < 14 * 60 + 30) return 'NY_PREMARKET';

  // London: 08:00–13:00 UTC
  if (totalMin >= 8 * 60 && totalMin < 13 * 60) return 'LONDON';

  // Asia: 00:00–08:00 UTC
  if (totalMin >= 0 && totalMin < 8 * 60) return 'ASIA';

  // NY Close: 21:00–22:00 UTC
  return 'NY_CLOSE';
}

/**
 * Persist a feature snapshot to the database.
 * Only called after the soak is complete and the service is deployed.
 */
export async function persistFeatureSnapshot(snapshot: FeatureSnapshot): Promise<number> {
  const db = getPool();
  const [result] = await db.execute(
    `INSERT INTO darwin_feature_snapshots
      (source_event_id, market_timestamp, instrument, contract, timeframe,
       feature_version, features_json, data_quality_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      snapshot.source_event_id ?? null,
      snapshot.market_timestamp,
      snapshot.instrument,
      snapshot.contract,
      snapshot.timeframe,
      snapshot.feature_version,
      JSON.stringify(snapshot.features_json),
      snapshot.data_quality_status,
    ]
  );
  return (result as any).insertId;
}
