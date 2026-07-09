"""
Atlas Sprint 052 — Failure Mechanism Discovery
Phase 1: Causal Instrumentation

For every trade in the FAE dataset, compute candidate causal features
that the proxy variables (ADX, hour, ARI caution) may be measuring.

FS-A3-01 (ADX<30) candidates:
  - trend_maturity_bars: how long has the current EMA alignment been in place?
  - overnight_range_pct: overnight range as % of 5-day ATR (inventory development)
  - overnight_range_abs: absolute overnight range in points
  - overnight_direction_aligned: is overnight drift aligned with trade direction?
  - vol_ratio_overnight: overnight volume vs overnight average (participation)
  - adx_trend: is ADX rising or falling? (momentum direction)
  - di_spread: |+DI - -DI| / ADX (trend purity, not just strength)
  - price_vs_ema50_atr: distance from EMA50 in ATR units (trend extension)
  - bars_since_last_adx_peak: how many bars since ADX was last above 40?

FS-A3-02 (Early Session <10) candidates:
  - overnight_range_pct: same as above (range development)
  - overnight_vol_cumulative: cumulative volume from session open to entry
  - overnight_vol_pct_of_day: overnight volume as % of prior day total
  - time_since_overnight_open: bars since 18:00 ET (session maturity)
  - overnight_high_low_range: high - low from 18:00 to entry
  - overnight_momentum: close - open from 18:00 to entry (directional drift)
  - atr_ratio_overnight_vs_rth: overnight ATR vs prior RTH ATR (vol regime)
  - bars_since_last_impulse_overnight: bars since last ATR expansion in session

FS-A2-01 (ARI Caution: consec_losses>=2) candidates:
  - regime_atr_change: ATR14 change from first loss to current entry (vol shift)
  - regime_adx_change: ADX change from first loss to current entry (momentum shift)
  - regime_ema_flip: did EMA alignment flip between first loss and now?
  - prior_loss_size_avg: average size of prior losses (edge decay signal)
  - prior_loss_size_vs_win: ratio of recent loss size to recent win size
  - vix_proxy_atr_pct: current ATR14 percentile (market vol regime)
  - session_pnl_at_entry: cumulative P&L for the day before this trade
  - time_since_first_loss: bars elapsed since the first consecutive loss
  - market_structure_break: did price break a significant S/R level recently?
"""

import pandas as pd
import numpy as np
import warnings
import os
warnings.filterwarnings('ignore')

DATA_PATH   = '/home/ubuntu/Project-Atlas/data/raw/massive/MNQ_5min_full.csv'
FAE_FILE    = '/home/ubuntu/Project-Atlas/research-engine/fae/fae_trades.csv'
OUTPUT_FILE = '/home/ubuntu/Project-Atlas/research-engine/fae/fae_causal.csv'

# ─── Load price data ──────────────────────────────────────────────────────────
print("Loading price data...")
raw = pd.read_csv(DATA_PATH)
raw['ts'] = pd.to_datetime(raw['timestamp_et'], utc=True)
raw = raw.sort_values('ts').reset_index(drop=True)

hi  = raw['high'].values.astype(float)
lo  = raw['low'].values.astype(float)
cl  = raw['close'].values.astype(float)
op  = raw['open'].values.astype(float)
vol = raw['volume'].values.astype(float) if 'volume' in raw.columns else np.ones(len(raw))
n   = len(raw)

hour_r   = raw['ts'].dt.hour.values
minute_r = raw['ts'].dt.minute.values
date_r   = raw['ts'].dt.date.values
time_val = hour_r * 60 + minute_r

print(f"Loaded {n:,} bars")

# ─── EWM helper ───────────────────────────────────────────────────────────────
def ewm_np(arr, span):
    a = 2.0 / (span + 1)
    out = np.empty_like(arr, dtype=float)
    out[0] = arr[0]
    for i in range(1, len(arr)):
        out[i] = a * arr[i] + (1 - a) * out[i-1]
    return out

# ─── Core indicators ──────────────────────────────────────────────────────────
print("Computing core indicators...")
tr = np.maximum(hi - lo, np.maximum(np.abs(hi - np.roll(cl,1)), np.abs(lo - np.roll(cl,1))))
tr[0] = hi[0] - lo[0]

atr14  = ewm_np(tr, 14)
atr5   = ewm_np(tr, 5)
ema9   = ewm_np(cl, 9)
ema21  = ewm_np(cl, 21)
ema50  = ewm_np(cl, 50)

# ADX components
plus_dm  = np.where((hi - np.roll(hi,1)) > (np.roll(lo,1) - lo), np.maximum(hi - np.roll(hi,1), 0), 0)
minus_dm = np.where((np.roll(lo,1) - lo) > (hi - np.roll(hi,1)), np.maximum(np.roll(lo,1) - lo, 0), 0)
plus_dm[0] = minus_dm[0] = 0
plus_di14  = 100 * ewm_np(plus_dm, 14) / np.where(atr14 > 0, atr14, 1)
minus_di14 = 100 * ewm_np(minus_dm, 14) / np.where(atr14 > 0, atr14, 1)
di_sum = plus_di14 + minus_di14
dx     = np.where(di_sum > 0, 100 * np.abs(plus_di14 - minus_di14) / di_sum, 0)
adx    = ewm_np(dx, 14)

# DI spread (trend purity): |+DI - -DI| normalised by their sum
di_spread = np.where(di_sum > 0, np.abs(plus_di14 - minus_di14) / di_sum, 0)

# ADX slope and trend
adx_lag5 = np.empty(n); adx_lag5[:5] = np.nan; adx_lag5[5:] = adx[:-5]
adx_slope = adx - adx_lag5
adx_rising = (adx_slope > 0).astype(float)

# EMA alignment
trend_long  = (ema9 > ema21) & (ema21 > ema50)
trend_short = (ema9 < ema21) & (ema21 < ema50)

# Trend maturity (bars in current alignment)
trend_maturity = np.zeros(n, dtype=int)
for i in range(1, n):
    if trend_long[i] == trend_long[i-1] and trend_short[i] == trend_short[i-1]:
        trend_maturity[i] = trend_maturity[i-1] + 1
    else:
        trend_maturity[i] = 0

# Price vs EMA50 in ATR units
price_vs_ema50_atr = (cl - ema50) / np.where(atr14 > 0, atr14, 1)

# ATR14 percentile (rolling 100-bar)
atr14_pct = np.full(n, np.nan)
for i in range(100, n):
    window = atr14[i-100:i]
    atr14_pct[i] = np.sum(window < atr14[i]) / 100.0

# Bars since ADX last above 40
print("Computing bars since ADX peak...")
bars_since_adx40 = np.full(n, 999)
last_adx40 = 0
for i in range(n):
    if adx[i] >= 40:
        last_adx40 = i
    bars_since_adx40[i] = i - last_adx40

# ATR expansion signal
atr5_lag20 = np.empty(n); atr5_lag20[:20] = np.nan; atr5_lag20[20:] = atr5[:-20]
is_impulse = np.where(~np.isnan(atr5_lag20), atr5 / atr5_lag20 > 1.5, False)
bars_since_impulse = np.full(n, 999)
last_imp = 0
for i in range(n):
    if is_impulse[i]:
        last_imp = i
    bars_since_impulse[i] = i - last_imp

# ─── Overnight session features ───────────────────────────────────────────────
print("Computing overnight session features...")

# Session boundaries: overnight = 18:00-09:29 ET
is_overnight = (hour_r >= 18) | (hour_r < 9) | ((hour_r == 9) & (minute_r < 30))

# For each bar, compute features since the most recent 18:00 open
# Build a session-start index for each bar
print("  Building overnight session index...")
session_open_idx = np.full(n, -1, dtype=int)
current_session_start = -1
for i in range(n):
    if hour_r[i] == 18 and minute_r[i] == 0:
        current_session_start = i
    session_open_idx[i] = current_session_start

# For each bar: overnight high, low, open, volume since session start
overnight_high   = np.full(n, np.nan)
overnight_low    = np.full(n, np.nan)
overnight_open   = np.full(n, np.nan)
overnight_vol_cum = np.full(n, np.nan)
overnight_bars   = np.zeros(n, dtype=int)

print("  Computing overnight OHLV per bar...")
for i in range(n):
    s = session_open_idx[i]
    if s < 0:
        continue
    overnight_high[i]    = hi[s:i+1].max()
    overnight_low[i]     = lo[s:i+1].min()
    overnight_open[i]    = op[s]
    overnight_vol_cum[i] = vol[s:i+1].sum()
    overnight_bars[i]    = i - s

overnight_range = overnight_high - overnight_low
overnight_momentum = cl - overnight_open  # directional drift since session open

# Overnight range as % of ATR14 (range development)
overnight_range_atr = overnight_range / np.where(atr14 > 0, atr14, 1)

# Is overnight momentum aligned with trade direction?
# (computed per trade below using direction)

# Overnight ATR: rolling ATR5 of overnight bars only
overnight_atr5 = np.full(n, np.nan)
for i in range(5, n):
    if is_overnight[i]:
        overnight_atr5[i] = tr[max(0,i-5):i+1].mean()

# Prior RTH ATR (last RTH session's average ATR)
is_rth = ((hour_r == 9) & (minute_r >= 30)) | ((hour_r >= 10) & (hour_r <= 15))
rth_atr_daily = {}
prev_date = None
rth_atrs = []
for i in range(n):
    d = date_r[i]
    if d != prev_date:
        if rth_atrs:
            rth_atr_daily[prev_date] = np.mean(rth_atrs)
        rth_atrs = []
        prev_date = d
    if is_rth[i]:
        rth_atrs.append(atr14[i])

# Map prior RTH ATR to each bar
sorted_dates = sorted(rth_atr_daily.keys())
prior_rth_atr_map = {}
for k in range(1, len(sorted_dates)):
    prior_rth_atr_map[sorted_dates[k]] = rth_atr_daily[sorted_dates[k-1]]

prior_rth_atr = np.array([prior_rth_atr_map.get(d, np.nan) for d in date_r])
atr_ratio_overnight_vs_rth = np.where(
    ~np.isnan(prior_rth_atr) & (prior_rth_atr > 0),
    atr14 / prior_rth_atr, np.nan
)

# ─── Load FAE trades ──────────────────────────────────────────────────────────
print("\nLoading FAE trades...")
df = pd.read_csv(FAE_FILE)
df['entry_time'] = pd.to_datetime(df['entry_time'])
print(f"Loaded {len(df)} trades")

# Build a bar_idx lookup: entry_time → raw bar index
raw_ts_series = raw['ts']
raw_ts_index = {ts: idx for idx, ts in enumerate(raw_ts_series)}

# Match each trade to its bar index in the raw data
print("Matching trades to raw bars...")
bar_indices = []
for _, row in df.iterrows():
    et = row['entry_time']
    # Try exact match first
    idx = raw_ts_index.get(et, None)
    if idx is None:
        # Find nearest bar within 5 minutes
        diffs = (raw_ts_series - et).abs()
        idx = diffs.idxmin()
        if diffs[idx].total_seconds() > 300:
            idx = -1
    bar_indices.append(idx)

df['raw_idx'] = bar_indices
print(f"  Matched: {(np.array(bar_indices) >= 0).sum()}/{len(df)}")

# ─── Compute causal features per trade ───────────────────────────────────────
print("Computing causal features per trade...")

causal_records = []

for _, row in df.iterrows():
    i = int(row['raw_idx'])
    if i < 0 or i >= n:
        causal_records.append({})
        continue

    direction = int(row['direction'])

    # ── FS-A3-01 causal candidates ──────────────────────────────────────────
    # 1. Trend maturity (bars in current EMA alignment)
    tm = int(trend_maturity[i])

    # 2. DI spread (trend purity: how cleanly directional is the trend?)
    di_sp = float(di_spread[i])

    # 3. ADX trend direction (is momentum building or fading?)
    adx_rising_flag = int(adx_rising[i]) if not np.isnan(adx_slope[i]) else 0
    adx_slope_val = float(adx_slope[i]) if not np.isnan(adx_slope[i]) else 0.0

    # 4. Bars since ADX was last above 40 (institutional participation proxy)
    bars_adx40 = int(bars_since_adx40[i])

    # 5. Price vs EMA50 in ATR units (trend extension / overextension)
    p_vs_ema50 = float(price_vs_ema50_atr[i])

    # 6. Overnight range development (inventory proxy)
    ov_range_atr = float(overnight_range_atr[i]) if not np.isnan(overnight_range_atr[i]) else np.nan
    ov_range_abs = float(overnight_range[i]) if not np.isnan(overnight_range[i]) else np.nan

    # 7. Overnight momentum alignment with trade direction
    ov_mom = float(overnight_momentum[i]) if not np.isnan(overnight_momentum[i]) else np.nan
    ov_mom_aligned = int(np.sign(ov_mom) == direction) if not np.isnan(ov_mom) else 0

    # 8. Overnight volume (participation proxy)
    ov_vol = float(overnight_vol_cum[i]) if not np.isnan(overnight_vol_cum[i]) else np.nan

    # 9. Overnight bars elapsed (session maturity)
    ov_bars = int(overnight_bars[i])

    # 10. ATR regime: overnight vs prior RTH
    atr_ratio = float(atr_ratio_overnight_vs_rth[i]) if not np.isnan(atr_ratio_overnight_vs_rth[i]) else np.nan

    # 11. ATR14 percentile (volatility regime)
    atr_pct = float(atr14_pct[i]) if not np.isnan(atr14_pct[i]) else np.nan

    # 12. Bars since last impulse (time since last expansion)
    bsi = int(bars_since_impulse[i])

    # ── FS-A2-01 causal candidates ──────────────────────────────────────────
    # For A2 trades: look back at the prior consecutive losses to measure
    # what changed in the market between the first loss and this entry.
    # We need to find the bar index of the first consecutive loss.
    # Use the consec_losses_before field and the trade's position in the sequence.

    consec_losses = int(row.get('consec_losses_before', 0))

    # Regime shift: ATR change since the streak started
    # Approximate: compare current ATR14 to ATR14 N*avg_trade_duration bars ago
    # Average A2 trade duration ~12 bars; N losses back = consec_losses * 12 bars
    regime_lookback = max(1, consec_losses * 12)
    regime_start_idx = max(0, i - regime_lookback)

    atr_at_streak_start = float(atr14[regime_start_idx])
    atr_now = float(atr14[i])
    regime_atr_change = (atr_now - atr_at_streak_start) / atr_at_streak_start if atr_at_streak_start > 0 else 0.0

    adx_at_streak_start = float(adx[regime_start_idx])
    adx_now = float(adx[i])
    regime_adx_change = adx_now - adx_at_streak_start

    # EMA alignment flip during streak
    tl_start = bool(trend_long[regime_start_idx])
    ts_start = bool(trend_short[regime_start_idx])
    tl_now   = bool(trend_long[i])
    ts_now   = bool(trend_short[i])
    regime_ema_flip = int((tl_start != tl_now) or (ts_start != ts_now))

    # ATR acceleration at entry (current volatility expansion)
    atr5_now = float(atr5[i])
    atr5_lag = float(atr5_lag20[i]) if not np.isnan(atr5_lag20[i]) else atr5_now
    atr_accel_now = atr5_now / atr5_lag if atr5_lag > 0 else 1.0

    # Time since streak started (bars)
    time_since_streak = regime_lookback

    # Current ATR14 percentile (vol regime)
    vol_regime = atr_pct  # already computed above

    causal_records.append({
        # A3-01 candidates
        'c_trend_maturity': tm,
        'c_di_spread': di_sp,
        'c_adx_rising': adx_rising_flag,
        'c_adx_slope': adx_slope_val,
        'c_bars_since_adx40': bars_adx40,
        'c_price_vs_ema50_atr': p_vs_ema50,
        'c_overnight_range_atr': ov_range_atr,
        'c_overnight_range_abs': ov_range_abs,
        'c_overnight_momentum_aligned': ov_mom_aligned,
        'c_overnight_momentum_raw': ov_mom,
        'c_overnight_vol_cum': ov_vol,
        'c_overnight_bars': ov_bars,
        'c_atr_ratio_ov_rth': atr_ratio,
        'c_atr14_pct': atr_pct,
        'c_bars_since_impulse': bsi,
        # A2-01 candidates
        'c_regime_atr_change': regime_atr_change,
        'c_regime_adx_change': regime_adx_change,
        'c_regime_ema_flip': regime_ema_flip,
        'c_atr_accel_now': atr_accel_now,
        'c_time_since_streak': time_since_streak,
        'c_vol_regime_pct': vol_regime,
    })

causal_df = pd.DataFrame(causal_records)
df_out = pd.concat([df.reset_index(drop=True), causal_df.reset_index(drop=True)], axis=1)
df_out.to_csv(OUTPUT_FILE, index=False)
print(f"\nCausal dataset saved: {OUTPUT_FILE}")
print(f"Shape: {df_out.shape}")
print(f"New causal columns: {[c for c in causal_df.columns]}")

# Quick sanity check
print("\nSanity check (A3 trades):")
a3 = df_out[df_out['model']=='A3']
print(f"  N={len(a3)}, causal cols non-null: {a3[[c for c in causal_df.columns]].notna().mean().mean():.1%}")
print(f"  c_overnight_range_atr: mean={a3['c_overnight_range_atr'].mean():.2f}, std={a3['c_overnight_range_atr'].std():.2f}")
print(f"  c_trend_maturity: mean={a3['c_trend_maturity'].mean():.1f}")
print(f"  c_di_spread: mean={a3['c_di_spread'].mean():.3f}")

print("\nSanity check (A2 trades):")
a2 = df_out[df_out['model']=='A2']
print(f"  N={len(a2)}, c_regime_atr_change: mean={a2['c_regime_atr_change'].mean():.3f}")
print(f"  c_regime_ema_flip: {a2['c_regime_ema_flip'].value_counts().to_dict()}")
