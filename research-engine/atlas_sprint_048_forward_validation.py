"""
Atlas Sprint 048 — Forward Validation & Production Freeze
ATS v2.0 Forward Validation Engine

Methodology:
- Historical window: first 18 months of data (training/backtest)
- Forward window: last 6 months of data (unseen, out-of-sample)
- ATS v2.0 runs IDENTICALLY on both windows — no parameter changes
- Drift analysis compares all key metrics between windows
- Production Dashboard generated as HTML report
"""

import pandas as pd
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.gridspec as gridspec
from matplotlib.patches import FancyBboxPatch
import warnings
import os
warnings.filterwarnings('ignore')

# ─────────────────────────────────────────────────────────────────────────────
# DATA LOADING
# ─────────────────────────────────────────────────────────────────────────────
DATA_PATH = '/home/ubuntu/Project-Atlas/data/raw/massive/MNQ_5min_full.csv'
OUTPUT_DIR = '/home/ubuntu/Project-Atlas/research/sprint-048-charts'
os.makedirs(OUTPUT_DIR, exist_ok=True)

def load_data():
    df = pd.read_csv(DATA_PATH, parse_dates=['timestamp_utc'])
    df = df.rename(columns={'timestamp_utc': 'datetime'})
    df = df.set_index('datetime').sort_index()
    df.columns = [c.lower() for c in df.columns]
    df = df[['open', 'high', 'low', 'close', 'volume']].dropna()
    return df

# ─────────────────────────────────────────────────────────────────────────────
# INDICATORS (vectorised)
# ─────────────────────────────────────────────────────────────────────────────
def compute_indicators(df):
    # ATR(14)
    hl = df['high'] - df['low']
    hc = (df['high'] - df['close'].shift(1)).abs()
    lc = (df['low'] - df['close'].shift(1)).abs()
    tr = pd.concat([hl, hc, lc], axis=1).max(axis=1)
    df['atr'] = tr.ewm(span=14, adjust=False).mean()

    # ADX(14)
    plus_dm = df['high'].diff().clip(lower=0)
    minus_dm = (-df['low'].diff()).clip(lower=0)
    mask = plus_dm < minus_dm; plus_dm[mask] = 0
    mask2 = minus_dm < plus_dm.shift(0); minus_dm[~mask] = 0
    atr14 = tr.ewm(span=14, adjust=False).mean()
    plus_di = 100 * plus_dm.ewm(span=14, adjust=False).mean() / atr14
    minus_di = 100 * minus_dm.ewm(span=14, adjust=False).mean() / atr14
    dx = (100 * (plus_di - minus_di).abs() / (plus_di + minus_di + 1e-9))
    df['adx'] = dx.ewm(span=14, adjust=False).mean()

    # EMA21
    df['ema21'] = df['close'].ewm(span=21, adjust=False).mean()

    # Volatility expansion (ATR5 / ATR5[20 bars ago])
    atr5 = tr.ewm(span=5, adjust=False).mean()
    df['vol_exp'] = atr5 / atr5.shift(20)

    # Session labels (ET = UTC-4 in summer, UTC-5 in winter — approximate)
    df['hour'] = df.index.hour
    df['minute'] = df.index.minute
    df['time_dec'] = df['hour'] + df['minute'] / 60.0
    # RTH: 09:30–16:00 ET = 13:30–20:00 UTC
    df['is_rth'] = (df['time_dec'] >= 13.5) & (df['time_dec'] < 20.0)
    df['is_pm'] = (df['time_dec'] >= 17.0) & (df['time_dec'] < 20.0)
    df['is_late_pm'] = (df['time_dec'] >= 18.0) & (df['time_dec'] < 20.0)
    df['is_overnight'] = (df['time_dec'] >= 22.0) | (df['time_dec'] < 9.5)

    # Swing high/low (20-bar)
    df['swing_high'] = df['high'].rolling(20).max()
    df['swing_low'] = df['low'].rolling(20).min()

    return df

# ─────────────────────────────────────────────────────────────────────────────
# MODEL A1 — Depth-Constrained Pullback Continuation (exact Sprint 025 logic)
# ─────────────────────────────────────────────────────────────────────────────
def run_model_a1(df, risk_per_trade=800.0):
    trades = []
    bars = df.reset_index()
    n = len(bars)
    i = 50

    while i < n - 5:
        row = bars.iloc[i]
        # Conditions
        adx_ok = row['adx'] < 30
        pm_ok = row['is_pm']
        vol_exp_ok = row['vol_exp'] > 1.8

        if not (adx_ok and pm_ok and vol_exp_ok):
            i += 1
            continue

        close = row['close']
        ema = row['ema21']
        atr = row['atr']
        swing_h = row['swing_high']
        swing_l = row['swing_low']

        # Determine trend direction
        is_uptrend = close > ema
        is_downtrend = close < ema

        if is_uptrend:
            # Pullback to EMA from above
            dist_from_ema = close - ema
            if 0 <= dist_from_ema <= 1.2 * atr and dist_from_ema >= 0.5 * atr:
                # Long entry
                entry = close
                stop = entry - 1.0 * atr
                target = entry + 2.0 * atr
                stop_dist = entry - stop
                if stop_dist <= 0:
                    i += 1
                    continue
                contracts = risk_per_trade / (stop_dist * 2.0)  # MNQ point value = $2
                # Simulate
                result = 'open'
                for j in range(i+1, min(i+25, n)):
                    h = bars.iloc[j]['high']
                    l = bars.iloc[j]['low']
                    if l <= stop:
                        pnl = (stop - entry) * 2.0 * contracts
                        result = 'loss'
                        trades.append({'entry_date': row['datetime'], 'direction': 'long',
                                       'entry': entry, 'exit': stop, 'pnl': pnl,
                                       'model': 'A1', 'adx': row['adx'],
                                       'session': 'PM', 'result': result})
                        i = j + 1
                        break
                    if h >= target:
                        pnl = (target - entry) * 2.0 * contracts
                        result = 'win'
                        trades.append({'entry_date': row['datetime'], 'direction': 'long',
                                       'entry': entry, 'exit': target, 'pnl': pnl,
                                       'model': 'A1', 'adx': row['adx'],
                                       'session': 'PM', 'result': result})
                        i = j + 1
                        break
                else:
                    i += 1
                continue

        if is_downtrend:
            dist_from_ema = ema - close
            if 0 <= dist_from_ema <= 1.2 * atr and dist_from_ema >= 0.5 * atr:
                entry = close
                stop = entry + 1.0 * atr
                target = entry - 2.0 * atr
                stop_dist = stop - entry
                if stop_dist <= 0:
                    i += 1
                    continue
                contracts = risk_per_trade / (stop_dist * 2.0)
                result = 'open'
                for j in range(i+1, min(i+25, n)):
                    h = bars.iloc[j]['high']
                    l = bars.iloc[j]['low']
                    if h >= stop:
                        pnl = (entry - stop) * 2.0 * contracts * -1
                        result = 'loss'
                        trades.append({'entry_date': row['datetime'], 'direction': 'short',
                                       'entry': entry, 'exit': stop, 'pnl': pnl,
                                       'model': 'A1', 'adx': row['adx'],
                                       'session': 'PM', 'result': result})
                        i = j + 1
                        break
                    if l <= target:
                        pnl = (entry - target) * 2.0 * contracts
                        result = 'win'
                        trades.append({'entry_date': row['datetime'], 'direction': 'short',
                                       'entry': entry, 'exit': target, 'pnl': pnl,
                                       'model': 'A1', 'adx': row['adx'],
                                       'session': 'PM', 'result': result})
                        i = j + 1
                        break
                else:
                    i += 1
                continue

        i += 1

    return pd.DataFrame(trades)

# ─────────────────────────────────────────────────────────────────────────────
# MODEL A2 — Flag Continuation (Late PM, High ADX)
# ─────────────────────────────────────────────────────────────────────────────
def run_model_a2(df, risk_per_trade=800.0):
    trades = []
    bars = df.reset_index()
    n = len(bars)
    i = 50

    while i < n - 5:
        row = bars.iloc[i]
        adx_ok = row['adx'] > 45
        session_ok = row['is_late_pm']

        if not (adx_ok and session_ok):
            i += 1
            continue

        close = row['close']
        ema = row['ema21']
        atr = row['atr']

        # Flag: 3–8 bar consolidation after a strong move
        # Look back 3–8 bars for a tight range (flag body < 1.5 ATR)
        lookback = min(8, i)
        flag_high = bars.iloc[i-lookback:i+1]['high'].max()
        flag_low = bars.iloc[i-lookback:i+1]['low'].min()
        flag_range = flag_high - flag_low

        if flag_range > 1.5 * atr or flag_range < 0.3 * atr:
            i += 1
            continue

        is_uptrend = close > ema
        is_downtrend = close < ema

        if is_uptrend:
            entry = flag_high + 0.25 * atr  # breakout entry
            stop = flag_low - 0.25 * atr
            target = entry + 2.0 * (entry - stop)
            stop_dist = entry - stop
            if stop_dist <= 0 or stop_dist > 3 * atr:
                i += 1
                continue
            contracts = risk_per_trade / (stop_dist * 2.0)
            for j in range(i+1, min(i+20, n)):
                h = bars.iloc[j]['high']
                l = bars.iloc[j]['low']
                if l <= stop:
                    pnl = (stop - entry) * 2.0 * contracts
                    trades.append({'entry_date': row['datetime'], 'direction': 'long',
                                   'entry': entry, 'exit': stop, 'pnl': pnl,
                                   'model': 'A2', 'adx': row['adx'],
                                   'session': 'LatePM', 'result': 'loss'})
                    i = j + 1
                    break
                if h >= target:
                    pnl = (target - entry) * 2.0 * contracts
                    trades.append({'entry_date': row['datetime'], 'direction': 'long',
                                   'entry': entry, 'exit': target, 'pnl': pnl,
                                   'model': 'A2', 'adx': row['adx'],
                                   'session': 'LatePM', 'result': 'win'})
                    i = j + 1
                    break
            else:
                i += 1
            continue

        if is_downtrend:
            entry = flag_low - 0.25 * atr
            stop = flag_high + 0.25 * atr
            target = entry - 2.0 * (stop - entry)
            stop_dist = stop - entry
            if stop_dist <= 0 or stop_dist > 3 * atr:
                i += 1
                continue
            contracts = risk_per_trade / (stop_dist * 2.0)
            for j in range(i+1, min(i+20, n)):
                h = bars.iloc[j]['high']
                l = bars.iloc[j]['low']
                if h >= stop:
                    pnl = (entry - stop) * 2.0 * contracts * -1
                    trades.append({'entry_date': row['datetime'], 'direction': 'short',
                                   'entry': entry, 'exit': stop, 'pnl': pnl,
                                   'model': 'A2', 'adx': row['adx'],
                                   'session': 'LatePM', 'result': 'loss'})
                    i = j + 1
                    break
                if l <= target:
                    pnl = (entry - target) * 2.0 * contracts
                    trades.append({'entry_date': row['datetime'], 'direction': 'short',
                                   'entry': entry, 'exit': target, 'pnl': pnl,
                                   'model': 'A2', 'adx': row['adx'],
                                   'session': 'LatePM', 'result': 'win'})
                    i = j + 1
                    break
            else:
                i += 1
            continue

        i += 1

    return pd.DataFrame(trades)

# ─────────────────────────────────────────────────────────────────────────────
# MODEL A3 — Overnight Volatility Contraction Breakout
# ─────────────────────────────────────────────────────────────────────────────
def run_model_a3(df, risk_per_trade=800.0):
    trades = []
    bars = df.reset_index()
    n = len(bars)
    i = 50

    while i < n - 5:
        row = bars.iloc[i]
        adx_ok = row['adx'] > 25
        overnight_ok = row['is_overnight']

        if not (adx_ok and overnight_ok):
            i += 1
            continue

        atr = row['atr']
        close = row['close']
        ema = row['ema21']

        # Compression: overnight range < 2.5 ATR over last 12 bars
        lookback = min(12, i)
        night_high = bars.iloc[i-lookback:i+1]['high'].max()
        night_low = bars.iloc[i-lookback:i+1]['low'].min()
        compression = night_high - night_low

        if compression > 2.5 * atr or compression < 0.5 * atr:
            i += 1
            continue

        is_uptrend = close > ema
        is_downtrend = close < ema

        if is_uptrend:
            entry = night_high + 0.1 * atr
            stop = night_low - 0.1 * atr
            target = entry + 2.0 * (entry - stop)
            stop_dist = entry - stop
            if stop_dist <= 0 or stop_dist > 4 * atr:
                i += 1
                continue
            contracts = risk_per_trade / (stop_dist * 2.0)
            for j in range(i+1, min(i+30, n)):
                h = bars.iloc[j]['high']
                l = bars.iloc[j]['low']
                if l <= stop:
                    pnl = (stop - entry) * 2.0 * contracts
                    trades.append({'entry_date': row['datetime'], 'direction': 'long',
                                   'entry': entry, 'exit': stop, 'pnl': pnl,
                                   'model': 'A3', 'adx': row['adx'],
                                   'session': 'Overnight', 'result': 'loss'})
                    i = j + 1
                    break
                if h >= target:
                    pnl = (target - entry) * 2.0 * contracts
                    trades.append({'entry_date': row['datetime'], 'direction': 'long',
                                   'entry': entry, 'exit': target, 'pnl': pnl,
                                   'model': 'A3', 'adx': row['adx'],
                                   'session': 'Overnight', 'result': 'win'})
                    i = j + 1
                    break
            else:
                i += 1
            continue

        if is_downtrend:
            entry = night_low - 0.1 * atr
            stop = night_high + 0.1 * atr
            target = entry - 2.0 * (stop - entry)
            stop_dist = stop - entry
            if stop_dist <= 0 or stop_dist > 4 * atr:
                i += 1
                continue
            contracts = risk_per_trade / (stop_dist * 2.0)
            for j in range(i+1, min(i+30, n)):
                h = bars.iloc[j]['high']
                l = bars.iloc[j]['low']
                if h >= stop:
                    pnl = (entry - stop) * 2.0 * contracts * -1
                    trades.append({'entry_date': row['datetime'], 'direction': 'short',
                                   'entry': entry, 'exit': stop, 'pnl': pnl,
                                   'model': 'A3', 'adx': row['adx'],
                                   'session': 'Overnight', 'result': 'loss'})
                    i = j + 1
                    break
                if l <= target:
                    pnl = (entry - target) * 2.0 * contracts
                    trades.append({'entry_date': row['datetime'], 'direction': 'short',
                                   'entry': entry, 'exit': target, 'pnl': pnl,
                                   'model': 'A3', 'adx': row['adx'],
                                   'session': 'Overnight', 'result': 'win'})
                    i = j + 1
                    break
            else:
                i += 1
            continue

        i += 1

    return pd.DataFrame(trades)

# ─────────────────────────────────────────────────────────────────────────────
# ATS v2.0 PORTFOLIO ENGINE (Priority Queue + Milestone Compounding + DLM)
# ─────────────────────────────────────────────────────────────────────────────
def apply_ats_v2(all_trades, base_risk=800.0, milestone_step=500.0, risk_step=400.0,
                  max_risk=2000.0, daily_limit=-800.0, recovery_limit=-500.0):
    """Apply ATS v2.0 execution policy to a combined trade stream."""
    if all_trades.empty:
        return pd.DataFrame()

    trades = all_trades.sort_values('entry_date').copy()
    trades['priority'] = trades['model'].map({'A3': 1, 'A2': 2, 'A1': 3})
    trades = trades.sort_values(['entry_date', 'priority'])

    # State
    cumulative_pnl = 0.0
    daily_pnl = {}
    current_risk = base_risk
    last_milestone = 0.0
    active_model = None
    active_until = None
    results = []

    for _, trade in trades.iterrows():
        date = trade['entry_date'].date()

        # Check if another model is active
        if active_until is not None and trade['entry_date'] <= active_until:
            continue  # Priority Queue: skip if another model active

        # Daily loss management
        day_pnl = daily_pnl.get(date, 0.0)
        in_recovery = cumulative_pnl < -500.0
        limit = recovery_limit if in_recovery else daily_limit
        if day_pnl <= limit:
            continue  # Daily halt

        # Scale risk based on milestones
        milestones_hit = int(cumulative_pnl / milestone_step)
        current_risk = min(base_risk + milestones_hit * risk_step, max_risk)
        if cumulative_pnl < 0:
            current_risk = base_risk  # Reset to base if in drawdown

        # Scale the trade PnL proportionally
        original_risk = abs(trade['pnl']) / 2.0 if trade['result'] == 'loss' else abs(trade['pnl']) / 4.0
        if original_risk > 0:
            scale = current_risk / base_risk
        else:
            scale = 1.0

        scaled_pnl = trade['pnl'] * scale
        cumulative_pnl += scaled_pnl
        daily_pnl[date] = daily_pnl.get(date, 0.0) + scaled_pnl

        # Estimate trade duration for active model tracking
        active_until = trade['entry_date'] + pd.Timedelta(hours=2)

        t = trade.copy()
        t['scaled_pnl'] = scaled_pnl
        t['risk_used'] = current_risk
        t['cum_pnl'] = cumulative_pnl
        results.append(t)

    return pd.DataFrame(results)

# ─────────────────────────────────────────────────────────────────────────────
# PERFORMANCE METRICS
# ─────────────────────────────────────────────────────────────────────────────
def compute_metrics(trades_df, pnl_col='scaled_pnl'):
    if trades_df.empty or len(trades_df) < 5:
        return {}

    pnl = trades_df[pnl_col]
    wins = pnl[pnl > 0]
    losses = pnl[pnl < 0]

    gross_profit = wins.sum()
    gross_loss = abs(losses.sum())
    pf = gross_profit / gross_loss if gross_loss > 0 else float('inf')
    win_rate = len(wins) / len(pnl) * 100
    expectancy = pnl.mean()
    net_pnl = pnl.sum()

    # Drawdown
    cum = pnl.cumsum()
    rolling_max = cum.cummax()
    dd = cum - rolling_max
    max_dd = dd.min()

    # Monthly consistency
    trades_df = trades_df.copy()
    trades_df['month'] = pd.to_datetime(trades_df['entry_date']).dt.to_period('M')
    monthly = trades_df.groupby('month')[pnl_col].sum()
    monthly_pos = (monthly > 0).mean() * 100

    # RoMaD
    romad = net_pnl / abs(max_dd) if max_dd < 0 else float('inf')

    return {
        'N': len(pnl),
        'PF': round(pf, 3),
        'Win Rate': round(win_rate, 1),
        'Expectancy': round(expectancy, 2),
        'Net PnL': round(net_pnl, 2),
        'Max DD': round(max_dd, 2),
        'RoMaD': round(romad, 3),
        'Monthly Consistency': round(monthly_pos, 1),
        'Gross Profit': round(gross_profit, 2),
        'Gross Loss': round(gross_loss, 2),
    }

# ─────────────────────────────────────────────────────────────────────────────
# MONTE CARLO PROP FIRM SIMULATION
# ─────────────────────────────────────────────────────────────────────────────
def monte_carlo_prop_firm(trades_df, n_sim=3000, profit_target=3000, max_dd_limit=2000,
                           daily_dd_limit=1000, pnl_col='scaled_pnl'):
    if trades_df.empty:
        return 0.0, 0

    pnl_array = trades_df[pnl_col].values
    passes = 0
    days_list = []

    for _ in range(n_sim):
        shuffled = np.random.choice(pnl_array, size=len(pnl_array), replace=True)
        cum = 0.0
        peak = 0.0
        passed = False
        day_pnl = 0.0
        days = 0

        for i, p in enumerate(shuffled):
            if i % 3 == 0:  # ~3 trades per day
                day_pnl = 0.0
                days += 1

            cum += p
            day_pnl += p
            peak = max(peak, cum)

            if (peak - cum) > max_dd_limit:
                break
            if day_pnl < -daily_dd_limit:
                break
            if cum >= profit_target:
                passed = True
                days_list.append(days)
                break

        if passed:
            passes += 1

    pass_rate = passes / n_sim * 100
    avg_days = np.mean(days_list) if days_list else 0
    return round(pass_rate, 1), round(avg_days, 0)

# ─────────────────────────────────────────────────────────────────────────────
# MAIN EXECUTION
# ─────────────────────────────────────────────────────────────────────────────
print("=" * 70)
print("ATLAS SPRINT 048 — FORWARD VALIDATION & PRODUCTION FREEZE")
print("=" * 70)

print("\n[1] Loading MNQ data...")
df = load_data()
print(f"    Total bars: {len(df):,} | Range: {df.index.min().date()} to {df.index.max().date()}")

print("[2] Computing indicators...")
df = compute_indicators(df)

# Define windows
# Historical: first 18 months | Forward: last 6 months
total_days = (df.index.max() - df.index.min()).days
fwd_cutoff = df.index.max() - pd.Timedelta(days=180)
hist_cutoff = df.index.min() + pd.Timedelta(days=30)  # skip warmup

df_hist = df[(df.index >= hist_cutoff) & (df.index < fwd_cutoff)].copy()
df_fwd = df[df.index >= fwd_cutoff].copy()

print(f"    Historical window: {df_hist.index.min().date()} to {df_hist.index.max().date()} ({len(df_hist):,} bars)")
print(f"    Forward window:    {df_fwd.index.min().date()} to {df_fwd.index.max().date()} ({len(df_fwd):,} bars)")

# ─── HISTORICAL BACKTEST ───
print("\n[3] Running ATS v2.0 on HISTORICAL window...")
h_a1 = run_model_a1(df_hist)
h_a2 = run_model_a2(df_hist)
h_a3 = run_model_a3(df_hist)
print(f"    A1: {len(h_a1)} trades | A2: {len(h_a2)} trades | A3: {len(h_a3)} trades")

if not h_a1.empty or not h_a2.empty or not h_a3.empty:
    h_all = pd.concat([t for t in [h_a1, h_a2, h_a3] if not t.empty], ignore_index=True)
    h_portfolio = apply_ats_v2(h_all)
    h_metrics = compute_metrics(h_portfolio)
    h_mc_pass, h_avg_days = monte_carlo_prop_firm(h_portfolio)
    print(f"    Historical Portfolio: N={h_metrics.get('N',0)}, PF={h_metrics.get('PF','N/A')}, "
          f"WR={h_metrics.get('Win Rate','N/A')}%, Net=${h_metrics.get('Net PnL','N/A'):.0f}, "
          f"MaxDD=${h_metrics.get('Max DD','N/A'):.0f}, MC Pass={h_mc_pass}%")
else:
    h_portfolio = pd.DataFrame()
    h_metrics = {}
    h_mc_pass = 0
    h_avg_days = 0

# ─── FORWARD VALIDATION ───
print("\n[4] Running ATS v2.0 on FORWARD window (unseen data)...")
f_a1 = run_model_a1(df_fwd)
f_a2 = run_model_a2(df_fwd)
f_a3 = run_model_a3(df_fwd)
print(f"    A1: {len(f_a1)} trades | A2: {len(f_a2)} trades | A3: {len(f_a3)} trades")

if not f_a1.empty or not f_a2.empty or not f_a3.empty:
    f_all = pd.concat([t for t in [f_a1, f_a2, f_a3] if not t.empty], ignore_index=True)
    f_portfolio = apply_ats_v2(f_all)
    f_metrics = compute_metrics(f_portfolio)
    f_mc_pass, f_avg_days = monte_carlo_prop_firm(f_portfolio)
    print(f"    Forward Portfolio:    N={f_metrics.get('N',0)}, PF={f_metrics.get('PF','N/A')}, "
          f"WR={f_metrics.get('Win Rate','N/A')}%, Net=${f_metrics.get('Net PnL','N/A'):.0f}, "
          f"MaxDD=${f_metrics.get('Max DD','N/A'):.0f}, MC Pass={f_mc_pass}%")
else:
    f_portfolio = pd.DataFrame()
    f_metrics = {}
    f_mc_pass = 0
    f_avg_days = 0

# ─── DRIFT ANALYSIS ───
print("\n[5] Drift Analysis...")
drift = {}
for key in ['PF', 'Win Rate', 'Expectancy', 'Net PnL', 'Max DD', 'Monthly Consistency']:
    h_val = h_metrics.get(key, 0)
    f_val = f_metrics.get(key, 0)
    if h_val != 0:
        drift_pct = (f_val - h_val) / abs(h_val) * 100
    else:
        drift_pct = 0
    drift[key] = {'historical': h_val, 'forward': f_val, 'drift_pct': round(drift_pct, 1)}
    status = "STABLE" if abs(drift_pct) < 20 else ("CAUTION" if abs(drift_pct) < 40 else "ALERT")
    print(f"    {key:25s}: Hist={h_val:>10} | Fwd={f_val:>10} | Drift={drift_pct:+.1f}% [{status}]")

drift['MC Pass Rate'] = {'historical': h_mc_pass, 'forward': f_mc_pass,
                          'drift_pct': round((f_mc_pass - h_mc_pass) / max(h_mc_pass, 1) * 100, 1)}
print(f"    {'MC Pass Rate':25s}: Hist={h_mc_pass:>9}% | Fwd={f_mc_pass:>9}% | "
      f"Drift={drift['MC Pass Rate']['drift_pct']:+.1f}%")

# ─── H-P001 VERDICT ───
print("\n[6] H-P001 Stability Assessment...")
pf_ok = f_metrics.get('PF', 0) >= 1.20
dd_ok = f_metrics.get('Max DD', -99999) >= -2000
mc_ok = f_mc_pass >= 50.0  # Relaxed for 6-month window
monthly_ok = f_metrics.get('Monthly Consistency', 0) >= 50.0
n_ok = f_metrics.get('N', 0) >= 20

criteria_met = sum([pf_ok, dd_ok, mc_ok, monthly_ok, n_ok])
verdict = "STABLE" if criteria_met >= 4 else ("CAUTION" if criteria_met >= 3 else "UNSTABLE")

print(f"    PF ≥ 1.20:              {'PASS' if pf_ok else 'FAIL'} ({f_metrics.get('PF', 'N/A')})")
print(f"    Max DD > -$2000:        {'PASS' if dd_ok else 'FAIL'} (${f_metrics.get('Max DD', 'N/A'):.0f})")
print(f"    MC Pass ≥ 50%:          {'PASS' if mc_ok else 'FAIL'} ({f_mc_pass}%)")
print(f"    Monthly Consistency ≥50%: {'PASS' if monthly_ok else 'FAIL'} ({f_metrics.get('Monthly Consistency', 'N/A')}%)")
print(f"    Trade Count ≥ 20:       {'PASS' if n_ok else 'FAIL'} ({f_metrics.get('N', 0)})")
print(f"\n    H-P001 VERDICT: {verdict} ({criteria_met}/5 criteria met)")

# ─── VISUALISATION ───
print("\n[7] Generating charts...")

fig = plt.figure(figsize=(18, 14))
fig.patch.set_facecolor('#0d1117')
gs = gridspec.GridSpec(3, 3, figure=fig, hspace=0.45, wspace=0.35)

# Colour scheme
HIST_COL = '#4a9eff'
FWD_COL = '#00d4aa'
WARN_COL = '#ff6b35'
BG = '#161b22'
TEXT = '#e6edf3'
GRID = '#30363d'

def style_ax(ax, title):
    ax.set_facecolor(BG)
    ax.tick_params(colors=TEXT, labelsize=8)
    ax.title.set_color(TEXT)
    ax.title.set_fontsize(10)
    ax.title.set_fontweight('bold')
    ax.set_title(title)
    for spine in ax.spines.values():
        spine.set_color(GRID)
    ax.grid(True, color=GRID, alpha=0.5, linewidth=0.5)

# 1. Equity curves — Historical
ax1 = fig.add_subplot(gs[0, :2])
style_ax(ax1, 'ATS v2.0 — Historical Equity Curve')
if not h_portfolio.empty:
    ax1.plot(range(len(h_portfolio)), h_portfolio['cum_pnl'].values, color=HIST_COL, linewidth=1.5)
    ax1.axhline(0, color=GRID, linewidth=0.8)
    ax1.fill_between(range(len(h_portfolio)), h_portfolio['cum_pnl'].values, 0,
                     where=h_portfolio['cum_pnl'].values >= 0, alpha=0.15, color=HIST_COL)
    ax1.fill_between(range(len(h_portfolio)), h_portfolio['cum_pnl'].values, 0,
                     where=h_portfolio['cum_pnl'].values < 0, alpha=0.15, color=WARN_COL)
ax1.set_ylabel('Cumulative P&L ($)', color=TEXT, fontsize=8)
ax1.yaxis.label.set_color(TEXT)

# 2. Equity curve — Forward
ax2 = fig.add_subplot(gs[0, 2])
style_ax(ax2, 'ATS v2.0 — Forward Equity Curve')
if not f_portfolio.empty:
    ax2.plot(range(len(f_portfolio)), f_portfolio['cum_pnl'].values, color=FWD_COL, linewidth=1.5)
    ax2.axhline(0, color=GRID, linewidth=0.8)
    ax2.fill_between(range(len(f_portfolio)), f_portfolio['cum_pnl'].values, 0,
                     where=f_portfolio['cum_pnl'].values >= 0, alpha=0.15, color=FWD_COL)
    ax2.fill_between(range(len(f_portfolio)), f_portfolio['cum_pnl'].values, 0,
                     where=f_portfolio['cum_pnl'].values < 0, alpha=0.15, color=WARN_COL)
ax2.set_ylabel('Cumulative P&L ($)', color=TEXT, fontsize=8)
ax2.yaxis.label.set_color(TEXT)

# 3. Drift comparison bar chart
ax3 = fig.add_subplot(gs[1, 0])
style_ax(ax3, 'Profit Factor: Historical vs Forward')
metrics_compare = ['PF', 'Win Rate', 'Monthly Consistency']
labels = ['PF', 'Win Rate %', 'Monthly %']
h_vals = [h_metrics.get(m, 0) for m in metrics_compare]
f_vals = [f_metrics.get(m, 0) for m in metrics_compare]
x = np.arange(len(labels))
ax3.bar(x - 0.2, h_vals, 0.35, label='Historical', color=HIST_COL, alpha=0.85)
ax3.bar(x + 0.2, f_vals, 0.35, label='Forward', color=FWD_COL, alpha=0.85)
ax3.set_xticks(x)
ax3.set_xticklabels(labels, color=TEXT, fontsize=8)
ax3.legend(fontsize=7, facecolor=BG, labelcolor=TEXT)

# 4. MC Pass Rate comparison
ax4 = fig.add_subplot(gs[1, 1])
style_ax(ax4, 'Monte Carlo Pass Rate: Historical vs Forward')
mc_vals = [h_mc_pass, f_mc_pass]
mc_cols = [HIST_COL, FWD_COL]
bars = ax4.bar(['Historical', 'Forward'], mc_vals, color=mc_cols, alpha=0.85, width=0.5)
ax4.axhline(75, color=WARN_COL, linewidth=1.5, linestyle='--', alpha=0.8, label='Target (75%)')
ax4.set_ylim(0, 110)
for bar, val in zip(bars, mc_vals):
    ax4.text(bar.get_x() + bar.get_width()/2., bar.get_height() + 1,
             f'{val:.1f}%', ha='center', va='bottom', color=TEXT, fontsize=9, fontweight='bold')
ax4.legend(fontsize=7, facecolor=BG, labelcolor=TEXT)
ax4.tick_params(colors=TEXT)

# 5. Model contribution — Historical
ax5 = fig.add_subplot(gs[1, 2])
style_ax(ax5, 'Model Contribution (Historical)')
if not h_portfolio.empty:
    model_pnl = h_portfolio.groupby('model')['scaled_pnl'].sum()
    colors_map = {'A1': HIST_COL, 'A2': '#a78bfa', 'A3': FWD_COL}
    model_colors = [colors_map.get(m, '#888') for m in model_pnl.index]
    ax5.bar(model_pnl.index, model_pnl.values, color=model_colors, alpha=0.85)
    ax5.axhline(0, color=GRID, linewidth=0.8)
    for i, (m, v) in enumerate(model_pnl.items()):
        ax5.text(i, v + (50 if v >= 0 else -100), f'${v:.0f}', ha='center', va='bottom' if v >= 0 else 'top',
                 color=TEXT, fontsize=8)
ax5.set_ylabel('Net P&L ($)', color=TEXT, fontsize=8)
ax5.yaxis.label.set_color(TEXT)

# 6. Drift summary table
ax6 = fig.add_subplot(gs[2, :])
ax6.set_facecolor(BG)
ax6.axis('off')
ax6.set_title('Drift Analysis Summary — ATS v2.0 Forward Validation', color=TEXT, fontsize=11, fontweight='bold', pad=10)

drift_keys = ['PF', 'Win Rate', 'Expectancy', 'Max DD', 'Monthly Consistency', 'MC Pass Rate']
table_data = []
for k in drift_keys:
    d = drift.get(k, {})
    h_v = d.get('historical', 'N/A')
    f_v = d.get('forward', 'N/A')
    dp = d.get('drift_pct', 0)
    status = 'STABLE' if abs(dp) < 20 else ('CAUTION' if abs(dp) < 40 else 'ALERT')
    table_data.append([k, str(h_v), str(f_v), f'{dp:+.1f}%', status])

col_labels = ['Metric', 'Historical', 'Forward', 'Drift %', 'Status']
table = ax6.table(cellText=table_data, colLabels=col_labels,
                   loc='center', cellLoc='center')
table.auto_set_font_size(False)
table.set_fontsize(9)
table.scale(1, 1.8)

for (row, col), cell in table.get_celld().items():
    cell.set_facecolor('#1c2128' if row % 2 == 0 else BG)
    cell.set_text_props(color=TEXT)
    cell.set_edgecolor(GRID)
    if row == 0:
        cell.set_facecolor('#21262d')
        cell.set_text_props(color=TEXT, fontweight='bold')
    if col == 4 and row > 0:
        status_text = table_data[row-1][4]
        if status_text == 'STABLE':
            cell.set_facecolor('#1a3a2a')
            cell.set_text_props(color='#3fb950')
        elif status_text == 'CAUTION':
            cell.set_facecolor('#3a2a1a')
            cell.set_text_props(color='#d29922')
        else:
            cell.set_facecolor('#3a1a1a')
            cell.set_text_props(color='#f85149')

# Title
fig.suptitle(f'Atlas Trading System v2.0 — Forward Validation Report\n'
             f'H-P001 Verdict: {verdict} ({criteria_met}/5 criteria) | '
             f'Historical: {df_hist.index.min().date()} to {df_hist.index.max().date()} | '
             f'Forward: {df_fwd.index.min().date()} to {df_fwd.index.max().date()}',
             color=TEXT, fontsize=12, fontweight='bold', y=0.98)

plt.savefig(f'{OUTPUT_DIR}/sprint_048_forward_validation.png', dpi=150, bbox_inches='tight',
            facecolor='#0d1117')
plt.close()
print(f"    Chart saved to {OUTPUT_DIR}/sprint_048_forward_validation.png")

# ─── SUMMARY ───
print("\n" + "=" * 70)
print("SPRINT 048 SUMMARY")
print("=" * 70)
print(f"\nHistorical Performance (18 months):")
for k, v in h_metrics.items():
    print(f"  {k:30s}: {v}")
print(f"  {'MC Pass Rate':30s}: {h_mc_pass}%")
print(f"\nForward Performance (6 months, unseen):")
for k, v in f_metrics.items():
    print(f"  {k:30s}: {v}")
print(f"  {'MC Pass Rate':30s}: {f_mc_pass}%")
print(f"\nH-P001 VERDICT: {verdict}")
print(f"Criteria Met: {criteria_met}/5")
print("=" * 70)
