"""
Atlas Sprint 051 — Failure Analysis Engine (FAE) Data Engine v2
Uses exact canonical model simulations (matching validated sprint results).
A1: 1-contract, EXP_RATIO=1.8, DEPTH=0.5-1.2, RR=2.0, PM session (13:00-16:00)
A2: $800 dynamic risk, ADX>45, late RTH (14:00-16:00), flag continuation, RR=2.0
A3: $800 dynamic risk, ADX>=25, Comp<0.80, Exp>1.3, RR=2.5, overnight
Produces: fae_trades.csv with ~45 features per trade for contrast analysis.
"""

import pandas as pd
import numpy as np
import warnings
import os
warnings.filterwarnings('ignore')

DATA_PATH   = '/home/ubuntu/Project-Atlas/data/raw/massive/MNQ_5min_full.csv'
OUTPUT_DIR  = '/home/ubuntu/Project-Atlas/research-engine/fae'
OUTPUT_FILE = os.path.join(OUTPUT_DIR, 'fae_trades.csv')
os.makedirs(OUTPUT_DIR, exist_ok=True)

POINT_VALUE    = 2.0
COMMISSION     = 1.00
RISK_PER_TRADE = 800.0
TICK_SIZE      = 0.25

# ─── EWM helper ───────────────────────────────────────────────────────────────
def ewm_np(arr, span):
    a = 2.0 / (span + 1)
    out = np.empty_like(arr, dtype=float)
    out[0] = arr[0]
    for i in range(1, len(arr)):
        out[i] = a * arr[i] + (1 - a) * out[i-1]
    return out

# ─── Load & prepare ───────────────────────────────────────────────────────────
print("Loading data...")
df = pd.read_csv(DATA_PATH)
df['ts'] = pd.to_datetime(df['timestamp_et'], utc=True)
df = df.sort_values('ts').reset_index(drop=True)

hi  = df['high'].values.astype(float)
lo  = df['low'].values.astype(float)
cl  = df['close'].values.astype(float)
op  = df['open'].values.astype(float)
vol = df['volume'].values.astype(float) if 'volume' in df.columns else np.ones(len(df))
n   = len(df)
print(f"Loaded {n:,} bars")

# ─── Indicators ───────────────────────────────────────────────────────────────
print("Computing indicators...")

hour   = df['ts'].dt.hour.values
minute = df['ts'].dt.minute.values
year   = df['ts'].dt.year.values
month  = df['ts'].dt.month.values
dow    = df['ts'].dt.dayofweek.values   # 0=Mon
dates_arr = df['ts'].dt.date.values

# True range
tr = np.maximum(hi - lo, np.maximum(np.abs(hi - np.roll(cl, 1)), np.abs(lo - np.roll(cl, 1))))
tr[0] = hi[0] - lo[0]

atr5  = ewm_np(tr, 5)
atr14 = ewm_np(tr, 14)  # EWM for A2/A3
atr20 = ewm_np(tr, 20)
# Rolling ATR14 for A1 (matches Sprint 025 original)
atr14_rolling = pd.Series(tr).rolling(14, min_periods=1).mean().values

# ATR acceleration: current ATR5 / ATR5 20 bars ago
atr5_lag20 = np.empty(n); atr5_lag20[:20] = np.nan; atr5_lag20[20:] = atr5[:-20]
atr_accel = np.where(atr5_lag20 > 0, atr5 / atr5_lag20, np.nan)

# Volatility percentile (rolling 100-bar percentile of ATR14)
atr14_pct = np.full(n, np.nan)
for i in range(100, n):
    window = atr14[i-100:i]
    atr14_pct[i] = np.sum(window < atr14[i]) / 100.0

# EMAs
ema9  = ewm_np(cl, 9)
ema21 = ewm_np(cl, 21)
ema50 = ewm_np(cl, 50)

# EMA alignment
trend_long  = (ema9 > ema21) & (ema21 > ema50)
trend_short = (ema9 < ema21) & (ema21 < ema50)
ema_spread  = (ema9 - ema50) / np.where(atr14 > 0, atr14, 1)  # normalised EMA spread

# ADX
plus_dm  = np.where((hi - np.roll(hi,1)) > (np.roll(lo,1) - lo), np.maximum(hi - np.roll(hi,1), 0), 0)
minus_dm = np.where((np.roll(lo,1) - lo) > (hi - np.roll(hi,1)), np.maximum(np.roll(lo,1) - lo, 0), 0)
plus_dm[0] = minus_dm[0] = 0
plus_di14  = 100 * ewm_np(plus_dm, 14) / np.where(atr14 > 0, atr14, 1)
minus_di14 = 100 * ewm_np(minus_dm, 14) / np.where(atr14 > 0, atr14, 1)
di_sum = plus_di14 + minus_di14
dx     = np.where(di_sum > 0, 100 * np.abs(plus_di14 - minus_di14) / di_sum, 0)
adx    = ewm_np(dx, 14)

# ADX slope (5-bar)
adx_lag5 = np.empty(n); adx_lag5[:5] = np.nan; adx_lag5[5:] = adx[:-5]
adx_slope = adx - adx_lag5

# Session flags
is_rth       = ((hour == 9) & (minute >= 30)) | ((hour >= 10) & (hour <= 15))
is_overnight = (hour >= 18) | (hour < 9)
time_val     = hour * 60 + minute
is_early_rth = (time_val >= 570) & (time_val < 720)   # 09:30-12:00
is_mid_rth   = (time_val >= 720) & (time_val < 840)   # 12:00-14:00
is_late_rth  = (time_val >= 840) & (time_val < 960)   # 14:00-16:00
is_pm_a1     = (time_val >= 780) & (time_val < 960)   # 13:00-16:00 (A1 session)

session_label = np.where(is_early_rth, 'AM',
                np.where(is_mid_rth, 'MID',
                np.where(is_late_rth, 'PM', 'OVERNIGHT')))

mins_since_open = np.where(is_rth, time_val - 570, np.nan)

# VWAP (daily reset)
print("Computing daily VWAP...")
typical = (hi + lo + cl) / 3.0
vwap = np.full(n, np.nan)
prev_date = None
cum_tp_vol = 0.0
cum_vol_d = 0.0
for i in range(n):
    d = dates_arr[i]
    if d != prev_date:
        cum_tp_vol = 0.0
        cum_vol_d = 0.0
        prev_date = d
    cum_tp_vol += typical[i] * vol[i]
    cum_vol_d += vol[i]
    if cum_vol_d > 0:
        vwap[i] = cum_tp_vol / cum_vol_d

dist_vwap_atr = (cl - vwap) / np.where(atr14 > 0, atr14, 1)

# Previous day high/low
print("Computing prev day high/low...")
day_groups = {}
for i in range(n):
    d = dates_arr[i]
    if d not in day_groups:
        day_groups[d] = {'hi': hi[i], 'lo': lo[i]}
    else:
        day_groups[d]['hi'] = max(day_groups[d]['hi'], hi[i])
        day_groups[d]['lo'] = min(day_groups[d]['lo'], lo[i])

sorted_dates = sorted(day_groups.keys())
prev_day_hi_map = {}
prev_day_lo_map = {}
for k in range(1, len(sorted_dates)):
    prev_day_hi_map[sorted_dates[k]] = day_groups[sorted_dates[k-1]]['hi']
    prev_day_lo_map[sorted_dates[k]] = day_groups[sorted_dates[k-1]]['lo']

pdh = np.array([prev_day_hi_map.get(d, np.nan) for d in dates_arr])
pdl = np.array([prev_day_lo_map.get(d, np.nan) for d in dates_arr])
dist_pdh_atr = (cl - pdh) / np.where(atr14 > 0, atr14, 1)
dist_pdl_atr = (cl - pdl) / np.where(atr14 > 0, atr14, 1)

# Weekly high/low (rolling 5-day window ~390 bars)
wkh = pd.Series(hi).rolling(390, min_periods=1).max().values
wkl = pd.Series(lo).rolling(390, min_periods=1).min().values
dist_wkh_atr = (cl - wkh) / np.where(atr14 > 0, atr14, 1)
dist_wkl_atr = (cl - wkl) / np.where(atr14 > 0, atr14, 1)

# Relative volume (vs 20-bar average)
vol_ma20 = pd.Series(vol).rolling(20, min_periods=1).mean().values
rel_vol = np.where(vol_ma20 > 0, vol / vol_ma20, np.nan)

# Swing high/low (10-bar lookback)
swing_high_10 = pd.Series(hi).shift(1).rolling(10, min_periods=1).max().values
swing_low_10  = pd.Series(lo).shift(1).rolling(10, min_periods=1).min().values

# Trend maturity: bars since EMA alignment started
print("Computing trend maturity...")
trend_maturity = np.zeros(n, dtype=int)
for i in range(1, n):
    if trend_long[i] == trend_long[i-1] and trend_short[i] == trend_short[i-1]:
        trend_maturity[i] = trend_maturity[i-1] + 1
    else:
        trend_maturity[i] = 0

# Compression zone (A3 style: 5-bar rolling)
zone_low  = pd.Series(lo).rolling(5).min().shift(1).values
zone_high = pd.Series(hi).rolling(5).max().shift(1).values

# Bars since last significant move (ATR expansion > 1.5)
print("Computing time since last impulse...")
is_impulse = np.where(~np.isnan(atr_accel), atr_accel > 1.5, False)
bars_since_impulse = np.full(n, 999)
last_impulse = 0
for i in range(n):
    if is_impulse[i]:
        last_impulse = i
    bars_since_impulse[i] = i - last_impulse

print("Indicators ready.")

# ─── FEATURE CAPTURE HELPER ───────────────────────────────────────────────────
def capture_features(i, model_name, direction, outcome, net_pnl, exit_bars, n_contracts, stop_pts, extra=None):
    """Capture all market features at bar index i."""
    rec = {
        'model': model_name, 'bar_idx': i,
        'entry_time': df['ts'].iloc[i],
        'year': int(year[i]), 'month': int(month[i]), 'dow': int(dow[i]),
        'hour': int(hour[i]), 'minute': int(minute[i]),
        'session': session_label[i],
        'mins_since_open': float(mins_since_open[i]) if not np.isnan(mins_since_open[i]) else np.nan,
        'direction': int(direction),
        'outcome': outcome,
        'net_pnl': float(net_pnl),
        'exit_bars': int(exit_bars),
        'n_contracts': int(n_contracts),
        # Trend features
        'adx': float(adx[i]),
        'adx_slope': float(adx_slope[i]) if not np.isnan(adx_slope[i]) else np.nan,
        'ema_spread_atr': float(ema_spread[i]),
        'trend_maturity': int(trend_maturity[i]),
        'trend_long': int(trend_long[i]),
        # Volatility features
        'atr14': float(atr14[i]),
        'atr_accel': float(atr_accel[i]) if not np.isnan(atr_accel[i]) else np.nan,
        'atr14_pct': float(atr14_pct[i]) if not np.isnan(atr14_pct[i]) else np.nan,
        'stop_pts': float(stop_pts),
        # Market structure
        'swing_high_10': float(swing_high_10[i]),
        'swing_low_10': float(swing_low_10[i]),
        'bars_since_impulse': int(bars_since_impulse[i]),
        # Liquidity
        'dist_vwap_atr': float(dist_vwap_atr[i]) if not np.isnan(dist_vwap_atr[i]) else np.nan,
        'dist_pdh_atr': float(dist_pdh_atr[i]) if not np.isnan(dist_pdh_atr[i]) else np.nan,
        'dist_pdl_atr': float(dist_pdl_atr[i]) if not np.isnan(dist_pdl_atr[i]) else np.nan,
        'dist_wkh_atr': float(dist_wkh_atr[i]) if not np.isnan(dist_wkh_atr[i]) else np.nan,
        'dist_wkl_atr': float(dist_wkl_atr[i]) if not np.isnan(dist_wkl_atr[i]) else np.nan,
        'rel_vol': float(rel_vol[i]) if not np.isnan(rel_vol[i]) else np.nan,
        # Model-specific extras (filled with nan if not applicable)
        'pb_depth': np.nan,
        'impulse_size_atr': np.nan,
        'flag_range_atr': np.nan,
    }
    if extra:
        rec.update(extra)
    return rec

# ─── MODEL A1 SIGNAL GENERATION ───────────────────────────────────────────────
# FROZEN: ExpLookback=20, ExpRatio=1.8, Depth=0.5-1.2, 1:2 RR, 1-contract
# Session: ALL RTH (09:30-16:00) - matches Sprint 025 original
# Uses rolling ATR5/ATR14 (not EWM) to match Sprint 025
print("\nGenerating Model A1 signals (canonical)...")

EXP_RATIO    = 1.8
DEPTH_MIN    = 0.5
DEPTH_MAX    = 1.2
STOP_ATR_MULT = 1.0
TARGET_RR_A1 = 2.0

# Rolling ATR5 for expansion signal (matches Sprint 025)
atr5_rolling = pd.Series(tr).rolling(5, min_periods=1).mean().values
atr5_lag20_r = np.empty(n); atr5_lag20_r[:20] = np.nan; atr5_lag20_r[20:] = atr5_rolling[:-20]
exp_signal = np.where(atr5_lag20_r > 0, atr5_rolling / atr5_lag20_r > EXP_RATIO, False)

# EMA21 touch/cross
prev_cl = np.roll(cl, 1); prev_cl[0] = cl[0]
pb_long_touch  = (prev_cl > ema21) & (cl <= ema21 * 1.001)
pb_short_touch = (prev_cl < ema21) & (cl >= ema21 * 0.999)

# Pullback depth using rolling ATR14
pb_depth_long  = (swing_high_10 - cl) / np.where(atr14_rolling > 0, atr14_rolling, np.nan)
pb_depth_short = (cl - swing_low_10)  / np.where(atr14_rolling > 0, atr14_rolling, np.nan)

a1_trades = []
i = 0
while i < n - 1:
    if not is_rth[i]:  # ALL RTH, no PM filter
        i += 1; continue
    if not exp_signal[i]:
        i += 1; continue
    if np.isnan(atr14_rolling[i]) or atr14_rolling[i] == 0:
        i += 1; continue

    direction = None
    pb_d = np.nan
    if trend_long[i] and pb_long_touch[i]:
        d = pb_depth_long[i]
        if not np.isnan(d) and DEPTH_MIN <= d <= DEPTH_MAX:
            direction = 1
            pb_d = d
    if direction is None and trend_short[i] and pb_short_touch[i]:
        d = pb_depth_short[i]
        if not np.isnan(d) and DEPTH_MIN <= d <= DEPTH_MAX:
            direction = -1
            pb_d = d

    if direction is None:
        i += 1; continue

    stop_pts   = STOP_ATR_MULT * atr14_rolling[i]
    target_pts = TARGET_RR_A1 * stop_pts
    if stop_pts <= 0:
        i += 1; continue

    entry_price  = cl[i]
    stop_price   = entry_price - direction * stop_pts
    target_price = entry_price + direction * target_pts
    n_contracts  = 1  # A1 uses 1-contract fixed sizing

    outcome = None
    net = 0.0
    exit_bars = 0
    for j in range(i + 1, min(i + 300, n)):
        if not is_rth[j]:
            net = direction * (cl[j-1] - entry_price) * POINT_VALUE * n_contracts - COMMISSION * 2 * n_contracts
            outcome = 'time_exit'; exit_bars = j - i; break
        if direction == 1:
            if lo[j] <= stop_price:
                net = (stop_price - entry_price) * POINT_VALUE * n_contracts - COMMISSION * 2 * n_contracts
                outcome = 'loss'; exit_bars = j - i; break
            if hi[j] >= target_price:
                net = (target_price - entry_price) * POINT_VALUE * n_contracts - COMMISSION * 2 * n_contracts
                outcome = 'win'; exit_bars = j - i; break
        else:
            if hi[j] >= stop_price:
                net = direction * (stop_price - entry_price) * POINT_VALUE * n_contracts - COMMISSION * 2 * n_contracts
                outcome = 'loss'; exit_bars = j - i; break
            if lo[j] <= target_price:
                net = direction * (target_price - entry_price) * POINT_VALUE * n_contracts - COMMISSION * 2 * n_contracts
                outcome = 'win'; exit_bars = j - i; break

    if outcome is None:
        i += 1; continue

    rec = capture_features(i, 'A1', direction, outcome, net, exit_bars, n_contracts, stop_pts,
                           extra={'pb_depth': pb_d})
    a1_trades.append(rec)
    i += exit_bars if exit_bars > 0 else 1

print(f"  A1: {len(a1_trades)} trades")

# ─── MODEL A2 SIGNAL GENERATION ───────────────────────────────────────────────
# FROZEN: ADX>45, late RTH (14:00-16:00), flag continuation, RR=2.0, $800 dynamic risk
print("Generating Model A2 signals (canonical)...")

ADX_MIN_A2    = 45
IMPULSE_W     = 5
FLAG_W        = 8
MAX_RETRACE   = 0.50
MIN_IMP_MULT  = 1.5
RR_A2         = 2.0

a2_trades = []
used_until = -1

for i in range(FLAG_W + IMPULSE_W + 10, n - 1):
    if i <= used_until: continue
    if not is_rth[i] or not is_late_rth[i]: continue
    if adx[i] < ADX_MIN_A2: continue
    avg = atr14[i]
    if avg <= 0: continue

    # Impulse
    i_start = max(0, i - IMPULSE_W - FLAG_W)
    i_end   = i - FLAG_W
    if i_end <= i_start: continue
    ihi = hi[i_start:i_end].max()
    ilo = lo[i_start:i_end].min()
    imp = ihi - ilo
    if imp < MIN_IMP_MULT * avg: continue

    # Flag zone
    fhi = hi[i-FLAG_W:i+1].max()
    flo = lo[i-FLAG_W:i+1].min()
    frange = fhi - flo
    if frange < 1.0: continue

    direction = None
    sp = None
    retrace = np.nan

    if trend_long[i]:
        retrace = (fhi - cl[i]) / imp if imp > 0 else 1
        if retrace > MAX_RETRACE: continue
        if cl[i] > fhi * 0.998:
            sp = cl[i] - flo
            if 1.0 <= sp <= avg * 5:
                direction = 1
    elif trend_short[i]:
        retrace = (cl[i] - flo) / imp if imp > 0 else 1
        if retrace > MAX_RETRACE: continue
        if cl[i] < flo * 1.002:
            sp = fhi - cl[i]
            if 1.0 <= sp <= avg * 5:
                direction = -1

    if direction is None or sp is None: continue

    entry_price  = cl[i]
    stop_price   = entry_price - direction * sp
    target_price = entry_price + direction * sp * RR_A2
    n_contracts  = max(1, round(RISK_PER_TRADE / (sp * POINT_VALUE)))

    outcome = None
    net = 0.0
    exit_bars = 0
    for j in range(i + 1, min(i + 150, n)):
        cur_tv = hour[j] * 60 + minute[j]
        if not is_rth[j] or cur_tv >= 960:
            exit_idx = j - 1 if j > i + 1 else i
            net = direction * (cl[exit_idx] - entry_price) * POINT_VALUE * n_contracts - COMMISSION * 2 * n_contracts
            outcome = 'time_exit'; exit_bars = j - i; break
        if direction == 1:
            if lo[j] <= stop_price:
                net = (stop_price - entry_price) * POINT_VALUE * n_contracts - COMMISSION * 2 * n_contracts
                outcome = 'loss'; exit_bars = j - i; break
            if hi[j] >= target_price:
                net = (target_price - entry_price) * POINT_VALUE * n_contracts - COMMISSION * 2 * n_contracts
                outcome = 'win'; exit_bars = j - i; break
        else:
            if hi[j] >= stop_price:
                net = direction * (stop_price - entry_price) * POINT_VALUE * n_contracts - COMMISSION * 2 * n_contracts
                outcome = 'loss'; exit_bars = j - i; break
            if lo[j] <= target_price:
                net = direction * (target_price - entry_price) * POINT_VALUE * n_contracts - COMMISSION * 2 * n_contracts
                outcome = 'win'; exit_bars = j - i; break

    if outcome is None: continue

    rec = capture_features(i, 'A2', direction, outcome, net, exit_bars, n_contracts, sp,
                           extra={'pb_depth': float(retrace),
                                  'impulse_size_atr': float(imp / avg),
                                  'flag_range_atr': float(frange / avg)})
    a2_trades.append(rec)
    used_until = i + exit_bars

print(f"  A2: {len(a2_trades)} trades")

# ─── MODEL A3 SIGNAL GENERATION ───────────────────────────────────────────────
# FROZEN: ADX>=25, Comp<0.80, Exp>1.3, RR=2.5, overnight, $800 dynamic risk
print("Generating Model A3 signals (canonical)...")

ADX_MIN_A3   = 25
COMP_RATIO   = 0.80
EXP_RATIO_A3 = 1.3
RR_A3        = 2.5

# Previous bar vol_ratio < comp_ratio (compression before expansion)
prev_vr = np.roll(atr_accel, 1); prev_vr[0] = np.nan
prev_compressed = np.where(~np.isnan(prev_vr), prev_vr < COMP_RATIO, False)

a3_trades = []
used_until_a3 = -1

for i in range(50, n - 1):
    if i <= used_until_a3: continue
    if not is_overnight[i]: continue
    if adx[i] < ADX_MIN_A3: continue
    if np.isnan(atr_accel[i]) or atr_accel[i] < EXP_RATIO_A3: continue
    if not prev_compressed[i]: continue

    is_long_bar  = bool(trend_long[i])  and (cl[i] > op[i])
    is_short_bar = bool(trend_short[i]) and (cl[i] < op[i])
    if not (is_long_bar or is_short_bar): continue

    entry = op[i + 1]

    if is_long_bar:
        stop  = zone_low[i]
        if np.isnan(stop) or stop >= entry: continue
        risk  = entry - stop
        tgt   = entry + risk * RR_A3
        dirn  = 1
    else:
        stop  = zone_high[i]
        if np.isnan(stop) or stop <= entry: continue
        risk  = stop - entry
        tgt   = entry - risk * RR_A3
        dirn  = -1

    if risk <= 0 or risk > 100.0: continue

    n_contracts = max(1, round(RISK_PER_TRADE / (risk * POINT_VALUE)))

    outcome = None
    net = 0.0
    exit_bars = 0
    for j in range(i + 1, min(i + 300, n)):
        if (not is_overnight[j]) and hour[j] == 9 and minute[j] == 30:
            net = dirn * (op[j] - entry) * POINT_VALUE * n_contracts - COMMISSION * 2 * n_contracts
            outcome = 'time_exit'; exit_bars = j - i; break
        if dirn == 1:
            if lo[j] <= stop:
                net = (stop - entry) * POINT_VALUE * n_contracts - COMMISSION * 2 * n_contracts
                outcome = 'loss'; exit_bars = j - i; break
            if hi[j] >= tgt:
                net = (tgt - entry) * POINT_VALUE * n_contracts - COMMISSION * 2 * n_contracts
                outcome = 'win'; exit_bars = j - i; break
        else:
            if hi[j] >= stop:
                net = dirn * (stop - entry) * POINT_VALUE * n_contracts - COMMISSION * 2 * n_contracts
                outcome = 'loss'; exit_bars = j - i; break
            if lo[j] <= tgt:
                net = dirn * (tgt - entry) * POINT_VALUE * n_contracts - COMMISSION * 2 * n_contracts
                outcome = 'win'; exit_bars = j - i; break

    if outcome is None: continue

    rec = capture_features(i, 'A3', dirn, outcome, net, exit_bars, n_contracts, risk)
    a3_trades.append(rec)
    used_until_a3 = i + exit_bars

print(f"  A3: {len(a3_trades)} trades")

# ─── Combine & add trade context features ─────────────────────────────────────
print("\nCombining trades and computing trade context features...")

all_trades = a1_trades + a2_trades + a3_trades
df_trades = pd.DataFrame(all_trades)
df_trades = df_trades.sort_values('entry_time').reset_index(drop=True)

# Binary outcome
df_trades['is_win']  = (df_trades['outcome'] == 'win').astype(int)
df_trades['is_loss'] = (df_trades['outcome'] == 'loss').astype(int)

# Trade context: consecutive wins/losses per model
df_trades['consec_wins_before']   = 0
df_trades['consec_losses_before'] = 0
for model in ['A1', 'A2', 'A3']:
    mask = df_trades['model'] == model
    idxs = df_trades[mask].index.tolist()
    cw = 0; cl_c = 0
    for k, idx in enumerate(idxs):
        df_trades.loc[idx, 'consec_wins_before']   = cw
        df_trades.loc[idx, 'consec_losses_before'] = cl_c
        if df_trades.loc[idx, 'outcome'] == 'win':
            cw += 1; cl_c = 0
        elif df_trades.loc[idx, 'outcome'] == 'loss':
            cl_c += 1; cw = 0
        # time_exit: keep previous streak

# Daily P&L at entry (cumulative P&L on the same day before this trade, all models)
df_trades['date_str'] = df_trades['entry_time'].dt.date.astype(str)
df_trades['daily_pnl_at_entry'] = 0.0
for date, grp in df_trades.groupby('date_str'):
    idxs = grp.index.tolist()
    cum = 0.0
    for idx in idxs:
        df_trades.loc[idx, 'daily_pnl_at_entry'] = cum
        cum += df_trades.loc[idx, 'net_pnl']

# ARI state proxy: consecutive losses >= 2 → risk reduction flag
df_trades['ari_caution'] = (df_trades['consec_losses_before'] >= 2).astype(int)

print(f"\nTotal trades: {len(df_trades)}")
print(df_trades.groupby(['model', 'outcome']).size().unstack(fill_value=0))

# ─── Save ─────────────────────────────────────────────────────────────────────
df_trades.to_csv(OUTPUT_FILE, index=False)
print(f"\nFAE trade dataset saved: {OUTPUT_FILE}")
print(f"Shape: {df_trades.shape}")

# ─── Sanity check ─────────────────────────────────────────────────────────────
print("\n=== SANITY CHECK (wins vs losses, excluding time_exits) ===")
for model in ['A1', 'A2', 'A3']:
    sub = df_trades[df_trades['model'] == model]
    wins   = sub[sub['outcome'] == 'win']['net_pnl']
    losses = sub[sub['outcome'] == 'loss']['net_pnl']
    gw = wins.sum(); gl = abs(losses.sum())
    pf = gw / gl if gl > 0 else 0
    wr = len(wins) / (len(wins) + len(losses)) if (len(wins) + len(losses)) > 0 else 0
    net = sub['net_pnl'].sum()
    te  = (sub['outcome'] == 'time_exit').sum()
    print(f"  {model}: N={len(sub)} (W={len(wins)}, L={len(losses)}, TE={te}) | PF={pf:.3f} | WR={wr:.1%} | Net=${net:.0f}")

print("\n=== EXPECTED FROM VALIDATED SPRINTS ===")
print("  A1: PF=1.387, WR~54%, N=286 (Sprint 025, ratio=1.8)")
print("  A2: PF=1.354, WR=52.4%, N=252 (Sprint 042, ADX>45 late)")
print("  A3: PF=1.566, WR=28.3%, N=60 (Sprint 037, ADX>=25, comp<0.80, exp>1.3, RR=2.5)")
