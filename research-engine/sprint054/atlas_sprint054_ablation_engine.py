"""
Atlas Sprint 054 — Principle Attribution Engine
Ablation Study: Remove each Market Principle from ATS v2.0 and measure the delta.

Principles under test:
  MP-001: Regime Dependence      → Remove VolComp prerequisite (atr_accel filter)
  MP-002: ADX Absolute Thresholds → Remove ADX filters from all models
  MP-003: Session Asymmetry      → Remove session restrictions (allow all hours)
  MP-004: VolComp → Expansion    → Remove expansion signal requirement
  MP-005: Loss Streaks (L2)      → Remove ARI caution / streak-based risk reduction
  MP-006: Structural Anchoring   → Remove pullback depth / flag structure requirement
  MP-008: Theory of Edge         → Measured as baseline vs random entry (where feasible)

For each ablation:
  - Construct the exact ATS v2.0 with ONE principle removed
  - Run full 2-year simulation
  - Measure: PF, WR, Expectancy, Max DD, MC Pass Rate, Risk of Ruin,
             Monthly Consistency, Trade Count, Equity Curve Stability
"""

import numpy as np
import pandas as pd
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.gridspec as gridspec
from scipy import stats
import os, sys, json

# ─── Setup ────────────────────────────────────────────────────────────────────
DATA_PATH   = '/home/ubuntu/Project-Atlas/data/raw/massive/MNQ_5min_full.csv'
CHARTS_DIR  = '/home/ubuntu/Project-Atlas/research/sprint-054-charts'
RESULTS_DIR = '/home/ubuntu/Project-Atlas/research-engine/sprint054'
os.makedirs(CHARTS_DIR, exist_ok=True)
os.makedirs(RESULTS_DIR, exist_ok=True)

# ─── Load market data ─────────────────────────────────────────────────────────
print("Loading market data...")
df_raw = pd.read_csv(DATA_PATH)
df_raw.columns = [c.lower() for c in df_raw.columns]
# MNQ_5min_full.csv uses 'timestamp_utc' column
if 'timestamp_utc' in df_raw.columns:
    df_raw['ts'] = pd.to_datetime(df_raw['timestamp_utc'], utc=True)
elif 'timestamp' in df_raw.columns:
    df_raw['ts'] = pd.to_datetime(df_raw['timestamp'], utc=True)
elif 'datetime' in df_raw.columns:
    df_raw['ts'] = pd.to_datetime(df_raw['datetime'], utc=True)
elif 'date' in df_raw.columns and 'time' in df_raw.columns:
    df_raw['ts'] = pd.to_datetime(df_raw['date'] + ' ' + df_raw['time'], utc=True)
else:
    ts_col = [c for c in df_raw.columns if 'time' in c.lower() or 'date' in c.lower()][0]
    df_raw['ts'] = pd.to_datetime(df_raw[ts_col], utc=True)

df_raw = df_raw.sort_values('ts').reset_index(drop=True)
print(f"  Loaded {len(df_raw)} bars: {df_raw['ts'].min()} to {df_raw['ts'].max()}")

# ─── Compute indicators ───────────────────────────────────────────────────────
op = df_raw['open'].values.astype(float)
hi = df_raw['high'].values.astype(float)
lo = df_raw['low'].values.astype(float)
cl = df_raw['close'].values.astype(float)
vol = df_raw['volume'].values.astype(float) if 'volume' in df_raw.columns else np.ones(len(df_raw))
ts = df_raw['ts']
n = len(cl)

hour   = ts.dt.hour.values
minute = ts.dt.minute.values
time_val = hour * 60 + minute

# True Range
prev_cl = np.roll(cl, 1); prev_cl[0] = cl[0]
tr = np.maximum(hi - lo, np.maximum(np.abs(hi - prev_cl), np.abs(lo - prev_cl)))

# Rolling ATR14 and ATR5
atr14_rolling = pd.Series(tr).rolling(14, min_periods=1).mean().values
atr5_rolling  = pd.Series(tr).rolling(5, min_periods=1).mean().values

# EWM ATR14 (for atr_accel)
def ewm_np(arr, span):
    alpha = 2.0 / (span + 1)
    out = np.empty(len(arr)); out[0] = arr[0]
    for k in range(1, len(arr)):
        out[k] = alpha * arr[k] + (1 - alpha) * out[k-1]
    return out

atr14 = ewm_np(tr, 14)
atr_accel = np.where(atr14 > 0, atr5_rolling / atr14, np.nan)

# ADX
dm_plus  = np.where((hi - np.roll(hi,1)) > (np.roll(lo,1) - lo), np.maximum(hi - np.roll(hi,1), 0), 0)
dm_minus = np.where((np.roll(lo,1) - lo) > (hi - np.roll(hi,1)), np.maximum(np.roll(lo,1) - lo, 0), 0)
dm_plus[0] = dm_minus[0] = 0
sm_tr    = ewm_np(tr, 14)
sm_plus  = ewm_np(dm_plus, 14)
sm_minus = ewm_np(dm_minus, 14)
di_plus  = np.where(sm_tr > 0, 100 * sm_plus / sm_tr, 0)
di_minus = np.where(sm_tr > 0, 100 * sm_minus / sm_tr, 0)
dx       = np.where((di_plus + di_minus) > 0, 100 * np.abs(di_plus - di_minus) / (di_plus + di_minus), 0)
adx      = ewm_np(dx, 14)

# EMA stack
ema9  = ewm_np(cl, 9)
ema21 = ewm_np(cl, 21)
ema50 = ewm_np(cl, 50)
trend_long  = (ema9 > ema21) & (ema21 > ema50)
trend_short = (ema9 < ema21) & (ema21 < ema50)

# Swing highs/lows (10-bar)
swing_high_10 = pd.Series(hi).rolling(10, min_periods=1).max().values
swing_low_10  = pd.Series(lo).rolling(10, min_periods=1).min().values

# Zone high/low for A3 (20-bar)
zone_high = pd.Series(hi).rolling(20, min_periods=1).max().values
zone_low  = pd.Series(lo).rolling(20, min_periods=1).min().values

# Session flags
is_rth       = ((hour == 9) & (minute >= 30)) | ((hour >= 10) & (hour <= 15))
is_overnight = (hour >= 18) | (hour < 9)
is_late_rth  = (time_val >= 840) & (time_val < 960)   # 14:00-16:00
is_pm_a1     = (time_val >= 780) & (time_val < 960)   # 13:00-16:00

# Expansion signal (A1)
atr5_lag20 = np.empty(n); atr5_lag20[:20] = np.nan; atr5_lag20[20:] = atr5_rolling[:-20]
exp_signal_a1 = np.where(atr5_lag20 > 0, atr5_rolling / atr5_lag20 > 1.8, False)

# Pullback depth
pb_depth_long  = (swing_high_10 - cl) / np.where(atr14_rolling > 0, atr14_rolling, np.nan)
pb_depth_short = (cl - swing_low_10)  / np.where(atr14_rolling > 0, atr14_rolling, np.nan)
pb_long_touch  = (np.roll(cl, 1) > ema21) & (cl <= ema21 * 1.001)
pb_short_touch = (np.roll(cl, 1) < ema21) & (cl >= ema21 * 0.999)

# Previous bar compressed (A3)
prev_vr = np.roll(atr_accel, 1); prev_vr[0] = np.nan
prev_compressed = np.where(~np.isnan(prev_vr), prev_vr < 0.80, False)

# Constants
POINT_VALUE    = 2.0
COMMISSION     = 0.62
RISK_PER_TRADE = 800.0

print("Indicators computed.")

# ─── Core simulation functions ────────────────────────────────────────────────

def simulate_a1(use_session=True, use_expansion=True, use_depth=True, use_adx=False,
                adx_max=None):
    """Model A1 with ablation flags."""
    trades = []
    i = 0
    while i < n - 1:
        if use_session and not is_rth[i]:
            i += 1; continue
        if not use_session and not (is_rth[i] or is_overnight[i]):
            i += 1; continue
        if use_expansion and not exp_signal_a1[i]:
            i += 1; continue
        if np.isnan(atr14_rolling[i]) or atr14_rolling[i] == 0:
            i += 1; continue
        if use_adx and adx_max is not None and adx[i] > adx_max:
            i += 1; continue

        direction = None
        pb_d = np.nan
        if trend_long[i] and pb_long_touch[i]:
            d = pb_depth_long[i]
            if use_depth:
                if not np.isnan(d) and 0.5 <= d <= 1.2:
                    direction = 1; pb_d = d
            else:
                if not np.isnan(d):
                    direction = 1; pb_d = d
        if direction is None and trend_short[i] and pb_short_touch[i]:
            d = pb_depth_short[i]
            if use_depth:
                if not np.isnan(d) and 0.5 <= d <= 1.2:
                    direction = -1; pb_d = d
            else:
                if not np.isnan(d):
                    direction = -1; pb_d = d

        if direction is None:
            i += 1; continue

        stop_pts   = atr14_rolling[i]
        target_pts = 2.0 * stop_pts
        if stop_pts <= 0:
            i += 1; continue

        entry_price  = cl[i]
        stop_price   = entry_price - direction * stop_pts
        target_price = entry_price + direction * target_pts
        n_contracts  = 1

        outcome = None; net = 0.0; exit_bars = 0
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

        trades.append({'model': 'A1', 'outcome': outcome, 'net_pnl': net,
                       'entry_time': ts.iloc[i], 'adx_val': adx[i], 'hour_val': hour[i]})
        i += exit_bars if exit_bars > 0 else 1
    return trades


def simulate_a2(use_session=True, use_adx=True, use_flag=True, adx_min=45):
    """Model A2 with ablation flags."""
    trades = []
    used_until = -1
    FLAG_W = 8; IMPULSE_W = 5; MAX_RETRACE = 0.50; MIN_IMP_MULT = 1.5; RR_A2 = 2.0

    for i in range(FLAG_W + IMPULSE_W + 10, n - 1):
        if i <= used_until: continue
        if use_session and (not is_rth[i] or not is_late_rth[i]): continue
        if not use_session and not is_rth[i]: continue
        if use_adx and adx[i] < adx_min: continue
        avg = atr14[i]
        if avg <= 0: continue

        i_start = max(0, i - IMPULSE_W - FLAG_W)
        i_end   = i - FLAG_W
        if i_end <= i_start: continue
        ihi = hi[i_start:i_end].max()
        ilo = lo[i_start:i_end].min()
        imp = ihi - ilo
        if use_flag and imp < MIN_IMP_MULT * avg: continue
        if not use_flag and imp < 0.5 * avg: continue  # minimal sanity check

        fhi = hi[i-FLAG_W:i+1].max()
        flo = lo[i-FLAG_W:i+1].min()
        frange = fhi - flo
        if frange < 1.0: continue

        direction = None; sp = None; retrace = np.nan

        if trend_long[i]:
            retrace = (fhi - cl[i]) / imp if imp > 0 else 1
            if use_flag and retrace > MAX_RETRACE: continue
            if cl[i] > fhi * 0.998:
                sp = cl[i] - flo
                if 1.0 <= sp <= avg * 5:
                    direction = 1
        elif trend_short[i]:
            retrace = (cl[i] - flo) / imp if imp > 0 else 1
            if use_flag and retrace > MAX_RETRACE: continue
            if cl[i] < flo * 1.002:
                sp = fhi - cl[i]
                if 1.0 <= sp <= avg * 5:
                    direction = -1

        if direction is None or sp is None: continue

        entry_price  = cl[i]
        stop_price   = entry_price - direction * sp
        target_price = entry_price + direction * sp * RR_A2
        n_contracts  = max(1, round(RISK_PER_TRADE / (sp * POINT_VALUE)))

        outcome = None; net = 0.0; exit_bars = 0
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
        trades.append({'model': 'A2', 'outcome': outcome, 'net_pnl': net,
                       'entry_time': ts.iloc[i], 'adx_val': adx[i], 'hour_val': hour[i]})
        used_until = i + exit_bars
    return trades


def simulate_a3(use_session=True, use_adx=True, use_volcomp=True, use_expansion=True,
                adx_min=25):
    """Model A3 with ablation flags."""
    trades = []
    used_until = -1
    COMP_RATIO = 0.80; EXP_RATIO_A3 = 1.3; RR_A3 = 2.5

    for i in range(50, n - 1):
        if i <= used_until: continue
        if use_session and not is_overnight[i]: continue
        if not use_session and not (is_rth[i] or is_overnight[i]): continue
        if use_adx and adx[i] < adx_min: continue
        if np.isnan(atr_accel[i]): continue
        if use_expansion and atr_accel[i] < EXP_RATIO_A3: continue
        if use_volcomp and not prev_compressed[i]: continue

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

        outcome = None; net = 0.0; exit_bars = 0
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
        trades.append({'model': 'A3', 'outcome': outcome, 'net_pnl': net,
                       'entry_time': ts.iloc[i], 'adx_val': adx[i], 'hour_val': hour[i]})
        used_until = i + exit_bars
    return trades


# ─── Performance Metrics ──────────────────────────────────────────────────────

def compute_metrics(trades_list, n_mc=1000, mc_dd_limit=5000, label=''):
    """Compute all 9 required metrics from a list of trade dicts."""
    if not trades_list:
        return {k: np.nan for k in ['pf', 'wr', 'expectancy', 'max_dd', 'mc_pass_rate',
                                     'risk_of_ruin', 'monthly_consistency', 'trade_count',
                                     'equity_stability']}
    df = pd.DataFrame(trades_list)
    decisive = df[df['outcome'].isin(['win', 'loss'])]

    # PF
    gross_wins   = decisive[decisive['outcome'] == 'win']['net_pnl'].sum()
    gross_losses = abs(decisive[decisive['outcome'] == 'loss']['net_pnl'].sum())
    pf = gross_wins / gross_losses if gross_losses > 0 else np.nan

    # WR
    wr = (decisive['outcome'] == 'win').mean() if len(decisive) > 0 else np.nan

    # Expectancy per trade (all trades including time_exits)
    expectancy = df['net_pnl'].mean()

    # Max Drawdown (running equity)
    equity = np.cumsum(df['net_pnl'].values)
    running_max = np.maximum.accumulate(equity)
    drawdowns = running_max - equity
    max_dd = drawdowns.max()

    # Trade count
    trade_count = len(df)

    # Monthly consistency
    df['entry_time'] = pd.to_datetime(df['entry_time'])
    df['ym'] = df['entry_time'].dt.to_period('M')
    monthly = df.groupby('ym')['net_pnl'].sum()
    monthly_consistency = (monthly > 0).mean() if len(monthly) > 0 else np.nan

    # Equity curve stability (R² of linear fit)
    if len(equity) > 5:
        x = np.arange(len(equity))
        slope, intercept, r_val, _, _ = stats.linregress(x, equity)
        equity_stability = r_val ** 2
    else:
        equity_stability = np.nan

    # Monte Carlo: simulate n_mc random shuffles, check max DD < mc_dd_limit
    pnl_arr = df['net_pnl'].values
    mc_passes = 0
    np.random.seed(42)
    for _ in range(n_mc):
        shuffled = np.random.permutation(pnl_arr)
        eq = np.cumsum(shuffled)
        rm = np.maximum.accumulate(eq)
        dd = (rm - eq).max()
        if dd < mc_dd_limit:
            mc_passes += 1
    mc_pass_rate = mc_passes / n_mc

    # Risk of Ruin (simplified Kelly-based estimate)
    if wr is not None and not np.isnan(wr) and wr > 0 and wr < 1:
        avg_win  = decisive[decisive['outcome'] == 'win']['net_pnl'].mean() if len(decisive[decisive['outcome'] == 'win']) > 0 else 0
        avg_loss = abs(decisive[decisive['outcome'] == 'loss']['net_pnl'].mean()) if len(decisive[decisive['outcome'] == 'loss']) > 0 else 0
        if avg_loss > 0:
            rr_ratio = avg_win / avg_loss
            # Simplified RoR formula: ((1-wr)/wr)^(account/avg_loss) where account = $50k
            account = 50000
            ruin_level = 0.10 * account  # 10% ruin threshold
            if rr_ratio > 0 and wr > 0:
                p = wr; q = 1 - wr
                # Using gambler's ruin approximation
                try:
                    ror = (q / p) ** (ruin_level / avg_loss)
                    risk_of_ruin = min(1.0, ror)
                except:
                    risk_of_ruin = np.nan
            else:
                risk_of_ruin = 1.0
        else:
            risk_of_ruin = np.nan
    else:
        risk_of_ruin = np.nan

    return {
        'pf': pf, 'wr': wr, 'expectancy': expectancy, 'max_dd': max_dd,
        'mc_pass_rate': mc_pass_rate, 'risk_of_ruin': risk_of_ruin,
        'monthly_consistency': monthly_consistency, 'trade_count': trade_count,
        'equity_stability': equity_stability
    }


# ─── Run Control (ATS v2.0 Baseline) ─────────────────────────────────────────
print("\n" + "="*70)
print("RUNNING ATS v2.0 CONTROL BASELINE")
print("="*70)

control_a1 = simulate_a1(use_session=True, use_expansion=True, use_depth=True)
control_a2 = simulate_a2(use_session=True, use_adx=True, use_flag=True)
control_a3 = simulate_a3(use_session=True, use_adx=True, use_volcomp=True, use_expansion=True)
control_all = control_a1 + control_a2 + control_a3

print(f"  A1: {len(control_a1)} trades")
print(f"  A2: {len(control_a2)} trades")
print(f"  A3: {len(control_a3)} trades")
print(f"  Total: {len(control_all)} trades")

# Use model-appropriate MC DD limits
mc_dd_a1 = 2000; mc_dd_a2 = 5000; mc_dd_a3 = 5000; mc_dd_all = 8000

control_metrics_a1  = compute_metrics(control_a1,  mc_dd_limit=mc_dd_a1,  label='A1')
control_metrics_a2  = compute_metrics(control_a2,  mc_dd_limit=mc_dd_a2,  label='A2')
control_metrics_a3  = compute_metrics(control_a3,  mc_dd_limit=mc_dd_a3,  label='A3')
control_metrics_all = compute_metrics(control_all, mc_dd_limit=mc_dd_all, label='ALL')

print(f"\nControl Baseline:")
print(f"  ALL: PF={control_metrics_all['pf']:.3f}, WR={control_metrics_all['wr']:.1%}, "
      f"Exp=${control_metrics_all['expectancy']:.1f}, MaxDD=${control_metrics_all['max_dd']:.0f}, "
      f"MC={control_metrics_all['mc_pass_rate']:.1%}, Monthly={control_metrics_all['monthly_consistency']:.1%}")
print(f"  A1:  PF={control_metrics_a1['pf']:.3f}, WR={control_metrics_a1['wr']:.1%}")
print(f"  A2:  PF={control_metrics_a2['pf']:.3f}, WR={control_metrics_a2['wr']:.1%}")
print(f"  A3:  PF={control_metrics_a3['pf']:.3f}, WR={control_metrics_a3['wr']:.1%}")


# ─── Ablation Study ───────────────────────────────────────────────────────────
print("\n" + "="*70)
print("RUNNING ABLATION STUDY")
print("="*70)

ablation_results = {}

def run_ablation(name, a1_kwargs, a2_kwargs, a3_kwargs, description):
    print(f"\n  Ablating: {name} — {description}")
    abl_a1  = simulate_a1(**a1_kwargs)
    abl_a2  = simulate_a2(**a2_kwargs)
    abl_a3  = simulate_a3(**a3_kwargs)
    abl_all = abl_a1 + abl_a2 + abl_a3
    print(f"    A1={len(abl_a1)}, A2={len(abl_a2)}, A3={len(abl_a3)}, Total={len(abl_all)}")

    m_all = compute_metrics(abl_all, mc_dd_limit=mc_dd_all, label=name)
    m_a1  = compute_metrics(abl_a1,  mc_dd_limit=mc_dd_a1,  label=f'{name}-A1')
    m_a2  = compute_metrics(abl_a2,  mc_dd_limit=mc_dd_a2,  label=f'{name}-A2')
    m_a3  = compute_metrics(abl_a3,  mc_dd_limit=mc_dd_a3,  label=f'{name}-A3')

    # Compute deltas vs control
    deltas = {}
    for key in ['pf', 'wr', 'expectancy', 'max_dd', 'mc_pass_rate', 'risk_of_ruin',
                'monthly_consistency', 'trade_count', 'equity_stability']:
        ctrl_val = control_metrics_all[key]
        abl_val  = m_all[key]
        if not np.isnan(ctrl_val) and not np.isnan(abl_val):
            deltas[f'd_{key}'] = abl_val - ctrl_val
        else:
            deltas[f'd_{key}'] = np.nan

    print(f"    PF: {m_all['pf']:.3f} (Δ{deltas['d_pf']:+.3f}), "
          f"WR: {m_all['wr']:.1%} (Δ{deltas['d_wr']:+.1%}), "
          f"MC: {m_all['mc_pass_rate']:.1%} (Δ{deltas['d_mc_pass_rate']:+.1%})")

    ablation_results[name] = {
        'description': description,
        'metrics_all': m_all, 'metrics_a1': m_a1, 'metrics_a2': m_a2, 'metrics_a3': m_a3,
        'deltas': deltas,
        'trade_counts': {'a1': len(abl_a1), 'a2': len(abl_a2), 'a3': len(abl_a3), 'all': len(abl_all)}
    }
    return abl_all


# ─── MP-001: Regime Dependence ─────────────────────────────────────────────────
# Remove: VolComp prerequisite from A3 (prev_compressed check)
# A1 and A2 don't use VolComp directly; A3 uses it as the primary regime filter
run_ablation(
    'MP-001_regime',
    a1_kwargs=dict(use_session=True, use_expansion=True, use_depth=True),
    a2_kwargs=dict(use_session=True, use_adx=True, use_flag=True),
    a3_kwargs=dict(use_session=True, use_adx=True, use_volcomp=False, use_expansion=True),
    description="Remove VolComp prerequisite from A3 (regime dependence)"
)

# ─── MP-002: ADX Absolute Thresholds ──────────────────────────────────────────
# Remove: ADX filters from ALL models
run_ablation(
    'MP-002_adx',
    a1_kwargs=dict(use_session=True, use_expansion=True, use_depth=True),
    a2_kwargs=dict(use_session=True, use_adx=False, use_flag=True),
    a3_kwargs=dict(use_session=True, use_adx=False, use_volcomp=True, use_expansion=True),
    description="Remove ADX filters from A2 and A3 (ADX thresholds)"
)

# ─── MP-003: Session Asymmetry ────────────────────────────────────────────────
# Remove: Session restrictions from all models (allow all RTH + overnight)
run_ablation(
    'MP-003_session',
    a1_kwargs=dict(use_session=False, use_expansion=True, use_depth=True),
    a2_kwargs=dict(use_session=False, use_adx=True, use_flag=True),
    a3_kwargs=dict(use_session=False, use_adx=True, use_volcomp=True, use_expansion=True),
    description="Remove session restrictions from all models (session asymmetry)"
)

# ─── MP-004: VolComp → Expansion ──────────────────────────────────────────────
# Remove: Expansion signal from A1 and A3
run_ablation(
    'MP-004_volcomp',
    a1_kwargs=dict(use_session=True, use_expansion=False, use_depth=True),
    a2_kwargs=dict(use_session=True, use_adx=True, use_flag=True),
    a3_kwargs=dict(use_session=True, use_adx=True, use_volcomp=True, use_expansion=False),
    description="Remove expansion signal from A1 and A3 (VolComp→Expansion)"
)

# ─── MP-005: Loss Streaks as Regime Transitions ────────────────────────────────
# Remove: ARI caution (streak-based risk reduction) — implemented as post-processing
# We simulate this by including all trades regardless of streak state
# The ARI caution in the FAE is a flag; here we measure the portfolio impact
# by comparing filtered (consec_losses<2) vs unfiltered trade sets
# Since ARI caution is a portfolio-level filter, we apply it to the control trades
print("\n  Ablating: MP-005_streaks — ARI caution removed (all streak trades included)")
# Load the FAE causal data which has consec_losses_before
fae_df = pd.read_csv('/home/ubuntu/Project-Atlas/research-engine/fae/fae_causal.csv')
# Control with ARI caution: exclude trades where consec_losses_before >= 2
fae_ari_on  = fae_df[fae_df['consec_losses_before'] < 2].copy()
fae_ari_off = fae_df.copy()  # all trades = ARI caution removed

def fae_to_trades(fae_subset):
    return [{'model': r['model'], 'outcome': r['outcome'], 'net_pnl': r['net_pnl'],
             'entry_time': r['entry_time']} for _, r in fae_subset.iterrows()]

m_ari_on  = compute_metrics(fae_to_trades(fae_ari_on),  mc_dd_limit=mc_dd_all, label='ARI_ON')
m_ari_off = compute_metrics(fae_to_trades(fae_ari_off), mc_dd_limit=mc_dd_all, label='ARI_OFF')
print(f"    ARI ON (consec<2): N={len(fae_ari_on)}, PF={m_ari_on['pf']:.3f}, WR={m_ari_on['wr']:.1%}")
print(f"    ARI OFF (all):     N={len(fae_ari_off)}, PF={m_ari_off['pf']:.3f}, WR={m_ari_off['wr']:.1%}")

# Use FAE-based control for MP-005 (since it's a portfolio filter, not a signal filter)
fae_control_metrics = compute_metrics(fae_to_trades(fae_df), mc_dd_limit=mc_dd_all, label='FAE_CTRL')
mp005_deltas = {}
for key in ['pf', 'wr', 'expectancy', 'max_dd', 'mc_pass_rate', 'risk_of_ruin',
            'monthly_consistency', 'trade_count', 'equity_stability']:
    ctrl_val = m_ari_on[key]
    abl_val  = m_ari_off[key]
    if not np.isnan(ctrl_val) and not np.isnan(abl_val):
        mp005_deltas[f'd_{key}'] = abl_val - ctrl_val
    else:
        mp005_deltas[f'd_{key}'] = np.nan

ablation_results['MP-005_streaks'] = {
    'description': 'ARI caution removed — all streak trades included',
    'metrics_all': m_ari_off, 'metrics_a1': None, 'metrics_a2': None, 'metrics_a3': None,
    'deltas': mp005_deltas,
    'trade_counts': {'a1': len(fae_ari_off[fae_ari_off['model']=='A1']),
                     'a2': len(fae_ari_off[fae_ari_off['model']=='A2']),
                     'a3': len(fae_ari_off[fae_ari_off['model']=='A3']),
                     'all': len(fae_ari_off)},
    'control_metrics': m_ari_on
}
print(f"    Δ PF={mp005_deltas['d_pf']:+.3f}, Δ WR={mp005_deltas['d_wr']:+.1%}, "
      f"Δ MC={mp005_deltas['d_mc_pass_rate']:+.1%}")


# ─── MP-006: Structural Anchoring ─────────────────────────────────────────────
# Remove: Pullback depth constraint from A1, flag structure from A2
run_ablation(
    'MP-006_anchoring',
    a1_kwargs=dict(use_session=True, use_expansion=True, use_depth=False),
    a2_kwargs=dict(use_session=True, use_adx=True, use_flag=False),
    a3_kwargs=dict(use_session=True, use_adx=True, use_volcomp=True, use_expansion=True),
    description="Remove pullback depth (A1) and flag structure (A2) — structural anchoring"
)

# ─── MP-008: Theory of Edge (baseline vs no-structure) ────────────────────────
# Remove: All structural constraints — pure EMA trend + session only
run_ablation(
    'MP-008_edge',
    a1_kwargs=dict(use_session=True, use_expansion=False, use_depth=False),
    a2_kwargs=dict(use_session=True, use_adx=False, use_flag=False),
    a3_kwargs=dict(use_session=True, use_adx=False, use_volcomp=False, use_expansion=False),
    description="Remove all structural constraints — pure trend + session (theory of edge)"
)


# ─── Compute Principle Attribution Scores ─────────────────────────────────────
print("\n" + "="*70)
print("COMPUTING PRINCIPLE ATTRIBUTION SCORES (PAS)")
print("="*70)

def compute_pas(deltas, ctrl_metrics):
    """
    PAS = weighted combination of normalised deltas.
    Higher PAS = removing this principle hurts performance more.
    """
    # Weights for each metric
    weights = {
        'd_pf': 0.25,
        'd_wr': 0.15,
        'd_expectancy': 0.15,
        'd_max_dd': 0.15,       # negative delta = worse (higher DD)
        'd_mc_pass_rate': 0.15,
        'd_monthly_consistency': 0.10,
        'd_equity_stability': 0.05,
    }

    # Normalise each delta to a 0-100 contribution
    # For PF: delta of -0.5 = very significant; delta of -0.1 = minor
    # For DD: delta of +$5000 = very significant
    normalisers = {
        'd_pf': 0.5,
        'd_wr': 0.15,
        'd_expectancy': 50.0,
        'd_max_dd': 5000.0,
        'd_mc_pass_rate': 0.30,
        'd_monthly_consistency': 0.30,
        'd_equity_stability': 0.30,
    }

    total_score = 0.0
    total_weight = 0.0
    component_scores = {}

    for metric, weight in weights.items():
        delta = deltas.get(metric, np.nan)
        if np.isnan(delta): continue
        norm = normalisers.get(metric, 1.0)

        # For metrics where negative delta = bad (PF, WR, Exp, MC, Monthly, Stability)
        # For DD: positive delta = bad
        if metric == 'd_max_dd':
            raw_score = delta / norm  # positive = worse
        elif metric == 'd_risk_of_ruin':
            raw_score = delta / 0.20  # positive = worse
        else:
            raw_score = -delta / norm  # negative = worse → positive score

        # Clamp to [0, 1]
        clamped = max(0.0, min(1.0, raw_score))
        component_scores[metric] = clamped * 100
        total_score += clamped * weight
        total_weight += weight

    pas = (total_score / total_weight) * 100 if total_weight > 0 else 0
    return pas, component_scores


pas_results = {}
for name, result in ablation_results.items():
    ctrl = control_metrics_all
    # For MP-005, use ARI-on as control
    if name == 'MP-005_streaks':
        ctrl = ablation_results['MP-005_streaks']['control_metrics']
    pas, components = compute_pas(result['deltas'], ctrl)
    pas_results[name] = {'pas': pas, 'components': components}
    print(f"  {name}: PAS={pas:.1f}")


# ─── Save results ─────────────────────────────────────────────────────────────
results_export = {}
for name, result in ablation_results.items():
    results_export[name] = {
        'description': result['description'],
        'deltas': {k: (float(v) if not np.isnan(v) else None)
                   for k, v in result['deltas'].items()},
        'metrics_all': {k: (float(v) if v is not None and not np.isnan(v) else None)
                        for k, v in result['metrics_all'].items()},
        'trade_counts': result['trade_counts'],
        'pas': float(pas_results[name]['pas']),
        'pas_components': {k: float(v) for k, v in pas_results[name]['components'].items()}
    }

with open(f'{RESULTS_DIR}/ablation_results.json', 'w') as f:
    json.dump(results_export, f, indent=2)
print(f"\nSaved: {RESULTS_DIR}/ablation_results.json")

# Also save control metrics
control_export = {k: (float(v) if not np.isnan(v) else None)
                  for k, v in control_metrics_all.items()}
control_export['per_model'] = {
    'A1': {k: (float(v) if not np.isnan(v) else None) for k, v in control_metrics_a1.items()},
    'A2': {k: (float(v) if not np.isnan(v) else None) for k, v in control_metrics_a2.items()},
    'A3': {k: (float(v) if not np.isnan(v) else None) for k, v in control_metrics_a3.items()},
}
with open(f'{RESULTS_DIR}/control_metrics.json', 'w') as f:
    json.dump(control_export, f, indent=2)

print("\n=== ABLATION STUDY COMPLETE ===")
print(f"\nPrinciple Attribution Scores (PAS):")
sorted_pas = sorted(pas_results.items(), key=lambda x: x[1]['pas'], reverse=True)
for name, r in sorted_pas:
    pas = r['pas']
    if pas >= 90:   tier = 'FOUNDATIONAL'
    elif pas >= 70: tier = 'CRITICAL'
    elif pas >= 50: tier = 'IMPORTANT'
    elif pas >= 30: tier = 'SUPPORTING'
    else:           tier = 'MARGINAL'
    print(f"  {name:<25} PAS={pas:5.1f}  [{tier}]")
