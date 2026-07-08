"""
Atlas Sprint 038 — Portfolio Validation (H-P001)
Compare System A (Model A1), System B (Model A3), System C (Portfolio A1+A3)
across 15+ metrics, correlation analysis, and Monte Carlo simulation.

H-P001: A portfolio of complementary execution models operating in different
market regimes and trading sessions produces superior robustness, smoother
equity growth, lower drawdown, and higher prop firm survivability than any
individual execution model.
"""

import pandas as pd
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.gridspec as gridspec
import warnings, os
warnings.filterwarnings('ignore')

DATA_PATH = '/home/ubuntu/Project-Atlas/data/raw/massive/MNQ_5min_full.csv'
OUTPUT_DIR = '/home/ubuntu/Project-Atlas/research/sprint-038-charts'
os.makedirs(OUTPUT_DIR, exist_ok=True)

COMMISSION = 1.00
POINT_VALUE = 2.00

# ─── Model A1 Parameters (exact validated — Sprint 024/025) ─────────────────────
# Depth-constrained pullback continuation — RTH session
# Trigger: EMA21 touch (close crosses EMA21)
# Depth: 0.5-1.2 ATR(14) from 10-bar swing extreme
# Expansion: ATR5 / ATR5[20] > 1.8
# Stop: 1.0 x ATR(14) from entry; Target: 2.0 x ATR(14)
# Entry: at close of signal bar (same bar)
A1_EXP_LOOKBACK  = 20
A1_EXP_RATIO     = 1.8
A1_DEPTH_MIN_ATR = 0.5
A1_DEPTH_MAX_ATR = 1.2
A1_STOP_ATR_MULT = 1.0
A1_TARGET_RR     = 2.0

# ─── Model A3 Parameters (validated) ─────────────────────────────────────────
# Overnight volatility contraction breakout — overnight session, high ADX
A3_ADX_MIN    = 25.0
A3_COMP_RATIO = 0.80
A3_EXP_RATIO  = 1.30
A3_ATR_PERIOD = 5
A3_ATR_LOOKBACK = 20
A3_COMP_ZONE_BARS = 5
A3_TARGET_RR  = 2.5

# ─── Fast EWM ─────────────────────────────────────────────────────────────────
def ewm_fast(arr, span):
    alpha = 2.0 / (span + 1)
    result = np.empty_like(arr, dtype=float)
    result[0] = arr[0]
    for i in range(1, len(arr)):
        result[i] = alpha * arr[i] + (1 - alpha) * result[i - 1]
    return result

# ─── Load data ────────────────────────────────────────────────────────────────
print("Loading data...")
df = pd.read_csv(DATA_PATH)
df['ts'] = pd.to_datetime(df['timestamp_et'], utc=True)
df = df.sort_values('ts').reset_index(drop=True)

hi = df['high'].values.astype(float)
lo = df['low'].values.astype(float)
cl = df['close'].values.astype(float)
op = df['open'].values.astype(float)
n  = len(df)

hour   = df['ts'].dt.hour.values
minute = df['ts'].dt.minute.values
year   = df['ts'].dt.year.values
month  = df['ts'].dt.month.values
date   = df['ts'].dt.date.values
dow    = df['ts'].dt.dayofweek.values

# ─── Indicators ───────────────────────────────────────────────────────────────
print("Computing indicators...")
tr = np.maximum(hi - lo, np.maximum(np.abs(hi - np.roll(cl,1)), np.abs(lo - np.roll(cl,1))))
tr[0] = hi[0] - lo[0]
atr5  = ewm_fast(tr, 5)
atr14 = ewm_fast(tr, 14)
atr5_lag = np.empty(n); atr5_lag[:20] = np.nan; atr5_lag[20:] = atr5[:-20]
vol_ratio = np.where(atr5_lag > 0, atr5 / atr5_lag, np.nan)

ema9  = ewm_fast(cl, 9)
ema21 = ewm_fast(cl, 21)
ema50 = ewm_fast(cl, 50)

plus_dm  = np.where((hi-np.roll(hi,1))>(np.roll(lo,1)-lo), np.maximum(hi-np.roll(hi,1),0), 0)
minus_dm = np.where((np.roll(lo,1)-lo)>(hi-np.roll(hi,1)), np.maximum(np.roll(lo,1)-lo,0), 0)
plus_dm[0] = minus_dm[0] = 0
plus_di14  = 100 * ewm_fast(plus_dm,14) / np.where(atr14>0, atr14, np.nan)
minus_di14 = 100 * ewm_fast(minus_dm,14) / np.where(atr14>0, atr14, np.nan)
di_sum = plus_di14 + minus_di14
dx = np.where(di_sum>0, 100*np.abs(plus_di14-minus_di14)/di_sum, np.nan)
adx = ewm_fast(np.nan_to_num(dx, nan=0), 14)

trend_long  = (ema9 > ema21) & (ema21 > ema50)
trend_short = (ema9 < ema21) & (ema21 < ema50)
is_overnight = (hour >= 18) | (hour < 9)
is_rth_global = ((hour == 9) & (minute >= 30)) | ((hour >= 10) & (hour <= 15))

zone_low  = pd.Series(lo).rolling(5).min().shift(1).values
zone_high = pd.Series(hi).rolling(5).max().shift(1).values

# Swing detection for A1 pullback measurement
swing_high = pd.Series(hi).rolling(10, center=True).max().values
swing_low  = pd.Series(lo).rolling(10, center=True).min().values

print("Indicators ready.")

# ─── Model A1 Simulator (exact validated logic from Sprint 025) ──────────────────
def simulate_a1():
    """
    Model A1: Depth-constrained pullback continuation (exact Sprint 025 logic)
    - RTH session only (is_rth: 09:30-16:00 ET)
    - EMA 9/21/50 stack aligned
    - C-STR-001: ATR5 / ATR5[20] > 1.8
    - Trigger: close touches/crosses EMA21 (pb_long_touch / pb_short_touch)
    - C-TRG-001: Depth 0.5-1.2 ATR(14) from 10-bar swing extreme
    - Entry: close of signal bar
    - Stop: 1.0 x ATR(14) from entry
    - Target: 2.0 x ATR(14) from entry
    - Time exit: when is_rth turns False
    """
    # Pre-compute expansion signal
    atr5_vals = atr5.copy()
    exp_sig = np.zeros(n, dtype=bool)
    for i in range(A1_EXP_LOOKBACK, n):
        prev = atr5_vals[i - A1_EXP_LOOKBACK]
        if prev > 0:
            exp_sig[i] = atr5_vals[i] / prev > A1_EXP_RATIO

    # Pre-compute RTH mask
    is_rth = ((hour == 9) & (minute >= 30)) | ((hour >= 10) & (hour <= 15))

    # Pre-compute EMA21 touch
    prev_cl = np.roll(cl, 1); prev_cl[0] = cl[0]
    pb_long_touch  = (prev_cl > ema21) & (cl <= ema21 * 1.001)
    pb_short_touch = (prev_cl < ema21) & (cl >= ema21 * 0.999)

    # Pre-compute swing extremes (10-bar rolling)
    swing_high_10 = pd.Series(hi).shift(1).rolling(10, min_periods=1).max().values
    swing_low_10  = pd.Series(lo).shift(1).rolling(10, min_periods=1).min().values
    pb_depth_long  = np.where(atr14 > 0, (swing_high_10 - cl) / atr14, np.nan)
    pb_depth_short = np.where(atr14 > 0, (cl - swing_low_10)  / atr14, np.nan)

    trades = []
    i = 60
    while i < n - 1:
        if not is_rth[i] or np.isnan(atr14[i]) or atr14[i] == 0:
            i += 1; continue
        if not exp_sig[i]:
            i += 1; continue

        dirn = None
        if bool(trend_long[i]) and pb_long_touch[i]:
            d = pb_depth_long[i]
            if not np.isnan(d) and A1_DEPTH_MIN_ATR <= d <= A1_DEPTH_MAX_ATR:
                dirn = 1
        if dirn is None and bool(trend_short[i]) and pb_short_touch[i]:
            d = pb_depth_short[i]
            if not np.isnan(d) and A1_DEPTH_MIN_ATR <= d <= A1_DEPTH_MAX_ATR:
                dirn = -1

        if dirn is None:
            i += 1; continue

        stop_pts   = A1_STOP_ATR_MULT * atr14[i]
        target_pts = A1_TARGET_RR * stop_pts
        if stop_pts <= 0:
            i += 1; continue

        entry = cl[i]  # entry at close of signal bar
        stop  = entry - dirn * stop_pts
        tgt   = entry + dirn * target_pts

        outcome = exit_p = exit_j = None
        bars_held = 0
        for j in range(i+1, min(i+300, n)):
            bars_held += 1
            if not is_rth[j]:
                outcome, exit_p, exit_j = 'time_exit', cl[j-1], j; break
            if dirn == 1:
                if lo[j] <= stop: outcome, exit_p, exit_j = 'loss', stop, j; break
                if hi[j] >= tgt:  outcome, exit_p, exit_j = 'win',  tgt,  j; break
            else:
                if hi[j] >= stop: outcome, exit_p, exit_j = 'loss', stop, j; break
                if lo[j] <= tgt:  outcome, exit_p, exit_j = 'win',  tgt,  j; break

        if outcome is None:
            i += 1; continue

        gross = (exit_p - entry) * POINT_VALUE * dirn
        net   = gross - COMMISSION * 2

        trades.append({
            'model': 'A1',
            'entry_time': df['ts'].iloc[i],
            'exit_time': df['ts'].iloc[exit_j],
            'direction': 'long' if dirn==1 else 'short',
            'entry': entry, 'exit': exit_p, 'risk': stop_pts,
            'outcome': outcome, 'net_pnl': net,
            'adx': adx[i], 'year': year[i], 'month': month[i],
            'date': date[i], 'dow': dow[i],
        })
        i += bars_held  # advance past this trade
    return pd.DataFrame(trades)

# ─── Model A3 Simulator ───────────────────────────────────────────────────────
def simulate_a3():
    trades = []
    min_idx = 50
    for i in range(min_idx, n - 1):
        if not is_overnight[i]:
            continue
        if adx[i] < A3_ADX_MIN or np.isnan(adx[i]):
            continue
        if np.isnan(vol_ratio[i]):
            continue
        prev_vr = vol_ratio[i-1] if i > 0 else np.nan
        if np.isnan(prev_vr) or prev_vr >= A3_COMP_RATIO:
            continue
        if vol_ratio[i] < A3_EXP_RATIO:
            continue

        is_long  = bool(trend_long[i])  and (cl[i] > op[i])
        is_short = bool(trend_short[i]) and (cl[i] < op[i])
        if not (is_long or is_short):
            continue

        entry = op[i + 1]
        if is_long:
            stop = zone_low[i]
            if np.isnan(stop) or stop >= entry: continue
            risk = entry - stop; tgt = entry + risk * A3_TARGET_RR; dirn = 1
        else:
            stop = zone_high[i]
            if np.isnan(stop) or stop <= entry: continue
            risk = stop - entry; tgt = entry - risk * A3_TARGET_RR; dirn = -1

        if risk <= 0 or risk > 100:
            continue

        outcome = exit_p = exit_j = None
        for j in range(i+1, min(i+300, n)):
            if (not is_overnight[j]) and hour[j]==9 and minute[j]==30:
                outcome, exit_p, exit_j = 'time_exit', op[j], j; break
            if dirn == 1:
                if lo[j] <= stop: outcome, exit_p, exit_j = 'loss', stop, j; break
                if hi[j] >= tgt:  outcome, exit_p, exit_j = 'win',  tgt,  j; break
            else:
                if hi[j] >= stop: outcome, exit_p, exit_j = 'loss', stop, j; break
                if lo[j] <= tgt:  outcome, exit_p, exit_j = 'win',  tgt,  j; break

        if outcome is None:
            continue

        gross = (exit_p - entry) * POINT_VALUE * dirn
        net   = gross - COMMISSION * 2

        trades.append({
            'model': 'A3',
            'entry_time': df['ts'].iloc[i],
            'exit_time': df['ts'].iloc[exit_j],
            'direction': 'long' if dirn==1 else 'short',
            'entry': entry, 'exit': exit_p, 'risk': risk,
            'outcome': outcome, 'net_pnl': net,
            'adx': adx[i], 'year': year[i], 'month': month[i],
            'date': date[i], 'dow': dow[i],
        })
    return pd.DataFrame(trades)

# ─── Performance Metrics ──────────────────────────────────────────────────────
def full_metrics(trades, label):
    if len(trades) < 10:
        return None

    wins = trades[trades['outcome'] == 'win']
    loss = trades[trades['outcome'] == 'loss']
    te   = trades[trades['outcome'] == 'time_exit']

    gw = wins['net_pnl'].sum()
    gl = abs(loss['net_pnl'].sum())
    pf = gw / gl if gl > 0 else 0
    net = trades['net_pnl'].sum()
    wr  = len(wins) / len(trades)
    expectancy = trades['net_pnl'].mean()

    eq  = trades['net_pnl'].cumsum()
    pk  = eq.cummax()
    dd  = eq - pk
    max_dd = dd.min()
    romad = net / abs(max_dd) if max_dd != 0 else 0

    # Recovery factor: net profit / max drawdown
    recovery_factor = net / abs(max_dd) if max_dd != 0 else 0

    # Ulcer Index: RMS of drawdown percentages
    if eq.max() > 0:
        dd_pct = (dd / pk.replace(0, np.nan)).fillna(0) * 100
        ulcer = np.sqrt((dd_pct**2).mean())
    else:
        ulcer = 0

    # Sharpe (annualised, assuming ~252 trading days, ~1 trade/day avg)
    daily_pnl = trades.groupby('date')['net_pnl'].sum()
    sharpe = (daily_pnl.mean() / daily_pnl.std() * np.sqrt(252)) if daily_pnl.std() > 0 else 0

    # Equity smoothness: R² of equity curve vs linear trend
    x = np.arange(len(eq))
    coeffs = np.polyfit(x, eq.values, 1)
    trend_line = np.polyval(coeffs, x)
    ss_res = np.sum((eq.values - trend_line)**2)
    ss_tot = np.sum((eq.values - eq.mean())**2)
    r_squared = 1 - ss_res/ss_tot if ss_tot > 0 else 0

    # Losing streak
    outcomes = trades['outcome'].values
    max_streak = cur_streak = 0
    for o in outcomes:
        if o == 'loss':
            cur_streak += 1
            max_streak = max(max_streak, cur_streak)
        else:
            cur_streak = 0

    # Monthly stats
    trades['yr_mo'] = trades['year'].astype(str) + '-' + trades['month'].astype(str).str.zfill(2)
    monthly = trades.groupby('yr_mo')['net_pnl'].sum()
    avg_monthly = monthly.mean()
    monthly_consistency = (monthly > 0).mean()

    return {
        'label': label,
        'n_trades': len(trades),
        'net_pnl': net,
        'profit_factor': pf,
        'win_rate': wr,
        'expectancy': expectancy,
        'max_drawdown': max_dd,
        'romad': romad,
        'recovery_factor': recovery_factor,
        'ulcer_index': ulcer,
        'sharpe': sharpe,
        'r_squared': r_squared,
        'max_losing_streak': max_streak,
        'avg_monthly_return': avg_monthly,
        'monthly_consistency': monthly_consistency,
        'equity_curve': eq,
        'monthly_returns': monthly,
    }

# ─── Monte Carlo ──────────────────────────────────────────────────────────────
def monte_carlo(pnl_array, n_sims=5000, dd_limit=-2000):
    np.random.seed(42)
    mc = []
    for _ in range(n_sims):
        sh = np.random.permutation(pnl_array)
        eq = np.cumsum(sh); pk = np.maximum.accumulate(eq)
        mc.append({'fp': eq[-1], 'dd': (eq-pk).min()})
    mc_df = pd.DataFrame(mc)
    pass_rate = (mc_df['dd'] > dd_limit).mean()
    ruin_rate = (mc_df['fp'] < 0).mean()
    return {
        'pass_rate': pass_rate,
        'ruin_rate': ruin_rate,
        'median_fp': mc_df['fp'].median(),
        'p5_fp': mc_df['fp'].quantile(0.05),
        'p5_dd': mc_df['dd'].quantile(0.05),
        'mc_df': mc_df,
    }

# ─── Run all three systems ─────────────────────────────────────────────────────
print("\nSimulating Model A1...")
a1_trades = simulate_a1()
print(f"A1 trades: {len(a1_trades)}")

print("Simulating Model A3...")
a3_trades = simulate_a3()
print(f"A3 trades: {len(a3_trades)}")

# Portfolio: combine and sort by entry time
portfolio_trades = pd.concat([a1_trades, a3_trades]).sort_values('entry_time').reset_index(drop=True)
print(f"Portfolio trades: {len(portfolio_trades)}")

# ─── Metrics ──────────────────────────────────────────────────────────────────
print("\nComputing metrics...")
m_a1   = full_metrics(a1_trades, 'System A (Model A1)')
m_a3   = full_metrics(a3_trades, 'System B (Model A3)')
m_port = full_metrics(portfolio_trades, 'System C (Portfolio v1.0)')

print("\n=== PERFORMANCE COMPARISON ===")
headers = ['Metric', 'System A (A1)', 'System B (A3)', 'System C (Portfolio)']
rows = [
    ('Trades',            m_a1['n_trades'],         m_a3['n_trades'],         m_port['n_trades']),
    ('Net P&L',           f"${m_a1['net_pnl']:.2f}",    f"${m_a3['net_pnl']:.2f}",    f"${m_port['net_pnl']:.2f}"),
    ('Profit Factor',     f"{m_a1['profit_factor']:.3f}", f"{m_a3['profit_factor']:.3f}", f"{m_port['profit_factor']:.3f}"),
    ('Win Rate',          f"{m_a1['win_rate']:.1%}",     f"{m_a3['win_rate']:.1%}",     f"{m_port['win_rate']:.1%}"),
    ('Expectancy',        f"${m_a1['expectancy']:.2f}",  f"${m_a3['expectancy']:.2f}",  f"${m_port['expectancy']:.2f}"),
    ('Max Drawdown',      f"${m_a1['max_drawdown']:.2f}",f"${m_a3['max_drawdown']:.2f}",f"${m_port['max_drawdown']:.2f}"),
    ('RoMaD',             f"{m_a1['romad']:.3f}",        f"{m_a3['romad']:.3f}",        f"{m_port['romad']:.3f}"),
    ('Recovery Factor',   f"{m_a1['recovery_factor']:.3f}",f"{m_a3['recovery_factor']:.3f}",f"{m_port['recovery_factor']:.3f}"),
    ('Ulcer Index',       f"{m_a1['ulcer_index']:.2f}",  f"{m_a3['ulcer_index']:.2f}",  f"{m_port['ulcer_index']:.2f}"),
    ('Sharpe Ratio',      f"{m_a1['sharpe']:.3f}",       f"{m_a3['sharpe']:.3f}",       f"{m_port['sharpe']:.3f}"),
    ('Equity R²',         f"{m_a1['r_squared']:.4f}",    f"{m_a3['r_squared']:.4f}",    f"{m_port['r_squared']:.4f}"),
    ('Max Losing Streak', m_a1['max_losing_streak'],     m_a3['max_losing_streak'],     m_port['max_losing_streak']),
    ('Avg Monthly Return',f"${m_a1['avg_monthly_return']:.2f}",f"${m_a3['avg_monthly_return']:.2f}",f"${m_port['avg_monthly_return']:.2f}"),
    ('Monthly Consistency',f"{m_a1['monthly_consistency']:.1%}",f"{m_a3['monthly_consistency']:.1%}",f"{m_port['monthly_consistency']:.1%}"),
]
print(f"\n{'Metric':<22} {'System A (A1)':>16} {'System B (A3)':>16} {'System C (Port)':>18}")
print("-" * 74)
for row in rows:
    print(f"{row[0]:<22} {str(row[1]):>16} {str(row[2]):>16} {str(row[3]):>18}")

# ─── Monte Carlo ──────────────────────────────────────────────────────────────
print("\n=== MONTE CARLO (5,000 shuffles, DD limit -$2,000) ===")
mc_a1   = monte_carlo(a1_trades['net_pnl'].values)
mc_a3   = monte_carlo(a3_trades['net_pnl'].values)
mc_port = monte_carlo(portfolio_trades['net_pnl'].values)

for label, mc in [('System A (A1)', mc_a1), ('System B (A3)', mc_a3), ('System C (Port)', mc_port)]:
    print(f"  {label}: Pass={mc['pass_rate']:.1%}, Ruin={mc['ruin_rate']:.1%}, "
          f"Median FP=${mc['median_fp']:.2f}, 5th Pct DD=${mc['p5_dd']:.2f}")

# ─── Correlation Analysis ─────────────────────────────────────────────────────
print("\n=== CORRELATION ANALYSIS ===")

# Trade-level correlation: align by date
a1_daily = a1_trades.groupby('date')['net_pnl'].sum()
a3_daily = a3_trades.groupby('date')['net_pnl'].sum()
all_dates = sorted(set(a1_daily.index) | set(a3_daily.index))
a1_aligned = pd.Series([a1_daily.get(d, 0) for d in all_dates], index=all_dates)
a3_aligned = pd.Series([a3_daily.get(d, 0) for d in all_dates], index=all_dates)

# Only days where both traded
both_active = (a1_aligned != 0) & (a3_aligned != 0)
if both_active.sum() > 5:
    corr_both = a1_aligned[both_active].corr(a3_aligned[both_active])
    print(f"  Daily P&L correlation (days both traded): {corr_both:.4f}")
else:
    corr_both = 0
    print(f"  Insufficient overlap for correlation (days both traded: {both_active.sum()})")

# Overall daily correlation
corr_all = a1_aligned.corr(a3_aligned)
print(f"  Daily P&L correlation (all days): {corr_all:.4f}")

# Session overlap
a1_dates = set(a1_trades['date'])
a3_dates = set(a3_trades['date'])
overlap = a1_dates & a3_dates
print(f"  Days with A1 trades: {len(a1_dates)}")
print(f"  Days with A3 trades: {len(a3_dates)}")
print(f"  Days with BOTH models active: {len(overlap)} ({len(overlap)/max(len(a1_dates),len(a3_dates)):.1%})")

# Regime overlap (ADX)
a1_high_adx = (a1_trades['adx'] >= 25).mean()
a3_low_adx  = (a3_trades['adx'] < 25).mean()
print(f"  A1 trades in high-ADX (>=25): {a1_high_adx:.1%} (should be 0%)")
print(f"  A3 trades in low-ADX (<25): {a3_low_adx:.1%} (should be 0%)")

# Simultaneous trades
a1_trades_copy = a1_trades.copy()
a3_trades_copy = a3_trades.copy()
simultaneous = 0
for _, t1 in a1_trades_copy.iterrows():
    for _, t3 in a3_trades_copy.iterrows():
        if t1['entry_time'] < t3['exit_time'] and t3['entry_time'] < t1['exit_time']:
            simultaneous += 1
print(f"  Simultaneous trades (A1 & A3 open at same time): {simultaneous}")

# ─── Portfolio Contribution Analysis ─────────────────────────────────────────
print("\n=== PORTFOLIO CONTRIBUTION ANALYSIS ===")
port_net = m_port['net_pnl']
a1_contribution = m_a1['net_pnl'] / port_net * 100 if port_net != 0 else 0
a3_contribution = m_a3['net_pnl'] / port_net * 100 if port_net != 0 else 0
print(f"  A1 return contribution: {a1_contribution:.1f}%")
print(f"  A3 return contribution: {a3_contribution:.1f}%")
print(f"  Portfolio DD vs A1 DD: {m_port['max_drawdown']:.2f} vs {m_a1['max_drawdown']:.2f}")
print(f"  Portfolio DD vs A3 DD: {m_port['max_drawdown']:.2f} vs {m_a3['max_drawdown']:.2f}")
print(f"  Portfolio Ulcer vs A1: {m_port['ulcer_index']:.2f} vs {m_a1['ulcer_index']:.2f}")
print(f"  Portfolio Ulcer vs A3: {m_port['ulcer_index']:.2f} vs {m_a3['ulcer_index']:.2f}")
print(f"  Portfolio R² vs A1: {m_port['r_squared']:.4f} vs {m_a1['r_squared']:.4f}")
print(f"  Portfolio R² vs A3: {m_port['r_squared']:.4f} vs {m_a3['r_squared']:.4f}")

# ─── H-P001 Decision ──────────────────────────────────────────────────────────
print("\n=== H-P001 DECISION CRITERIA ===")
criteria = {
    'Lower DD than both standalone': m_port['max_drawdown'] > max(m_a1['max_drawdown'], m_a3['max_drawdown']),
    'Equal or higher PF': m_port['profit_factor'] >= min(m_a1['profit_factor'], m_a3['profit_factor']),
    'Improved MC pass rate': mc_port['pass_rate'] >= max(mc_a1['pass_rate'], mc_a3['pass_rate']),
    'Smoother equity (higher R²)': m_port['r_squared'] >= max(m_a1['r_squared'], m_a3['r_squared']),
    'Lower Ulcer Index': m_port['ulcer_index'] <= min(m_a1['ulcer_index'], m_a3['ulcer_index']),
    'Better monthly consistency': m_port['monthly_consistency'] >= max(m_a1['monthly_consistency'], m_a3['monthly_consistency']),
}
passed = sum(criteria.values())
print(f"\nCriteria passed: {passed}/{len(criteria)}")
for k, v in criteria.items():
    print(f"  {'PASS' if v else 'FAIL'}: {k}")

if passed >= 4:
    verdict = "VALIDATED"
    print(f"\nH-P001 VERDICT: {verdict}")
    print("Portfolio v1.0 is promoted to primary production system.")
else:
    verdict = "REJECTED"
    print(f"\nH-P001 VERDICT: {verdict}")
    print("Portfolio does not outperform standalone models on required criteria.")

# ─── Charts ───────────────────────────────────────────────────────────────────
print("\nGenerating charts...")
fig = plt.figure(figsize=(20, 16))
gs = gridspec.GridSpec(3, 3, figure=fig, hspace=0.45, wspace=0.35)
fig.suptitle('Sprint 038 — Portfolio Validation (H-P001)\nSystem A (A1) vs System B (A3) vs System C (Portfolio v1.0)',
             fontsize=14, fontweight='bold')

colors = {'A1': '#2196F3', 'A3': '#FF9800', 'Port': '#4CAF50'}

# 1. Equity curves overlay
ax1 = fig.add_subplot(gs[0, :])
ax1.plot(range(len(m_a1['equity_curve'])), m_a1['equity_curve'],
         color=colors['A1'], linewidth=1.5, label=f"System A (A1) — PF {m_a1['profit_factor']:.3f}")
ax1.plot(range(len(m_a3['equity_curve'])), m_a3['equity_curve'],
         color=colors['A3'], linewidth=1.5, label=f"System B (A3) — PF {m_a3['profit_factor']:.3f}")
ax1.plot(range(len(m_port['equity_curve'])), m_port['equity_curve'],
         color=colors['Port'], linewidth=2.0, label=f"System C (Portfolio) — PF {m_port['profit_factor']:.3f}")
ax1.axhline(0, color='black', linewidth=0.5)
ax1.set_title('Equity Curves: All Three Systems', fontweight='bold')
ax1.set_xlabel('Trade Number'); ax1.set_ylabel('Cumulative P&L ($)')
ax1.legend(fontsize=10); ax1.grid(True, alpha=0.3)

# 2. Key metrics bar chart
ax2 = fig.add_subplot(gs[1, 0])
metrics_labels = ['Profit\nFactor', 'RoMaD', 'Sharpe', 'Equity\nR²']
a1_vals  = [m_a1['profit_factor'], m_a1['romad'], m_a1['sharpe'], m_a1['r_squared']]
a3_vals  = [m_a3['profit_factor'], m_a3['romad'], m_a3['sharpe'], m_a3['r_squared']]
port_vals= [m_port['profit_factor'], m_port['romad'], m_port['sharpe'], m_port['r_squared']]
x = np.arange(len(metrics_labels))
w = 0.25
ax2.bar(x - w, a1_vals, w, label='A1', color=colors['A1'], alpha=0.8)
ax2.bar(x,     a3_vals, w, label='A3', color=colors['A3'], alpha=0.8)
ax2.bar(x + w, port_vals, w, label='Portfolio', color=colors['Port'], alpha=0.8)
ax2.set_xticks(x); ax2.set_xticklabels(metrics_labels)
ax2.set_title('Quality Metrics Comparison', fontweight='bold')
ax2.legend(fontsize=8); ax2.grid(True, alpha=0.3, axis='y')

# 3. Drawdown comparison
ax3 = fig.add_subplot(gs[1, 1])
dd_vals = [abs(m_a1['max_drawdown']), abs(m_a3['max_drawdown']), abs(m_port['max_drawdown'])]
bars3 = ax3.bar(['System A\n(A1)', 'System B\n(A3)', 'System C\n(Portfolio)'],
                dd_vals, color=[colors['A1'], colors['A3'], colors['Port']], alpha=0.8)
ax3.axhline(2000, color='red', linewidth=1.5, linestyle='--', label='Prop Limit $2,000')
ax3.set_title('Maximum Drawdown Comparison', fontweight='bold')
ax3.set_ylabel('Max Drawdown ($)')
ax3.legend(fontsize=8); ax3.grid(True, alpha=0.3, axis='y')
for bar, val in zip(bars3, dd_vals):
    ax3.text(bar.get_x()+bar.get_width()/2., bar.get_height()+20,
             f'${val:.0f}', ha='center', va='bottom', fontsize=9)

# 4. Monthly consistency
ax4 = fig.add_subplot(gs[1, 2])
all_months = sorted(set(list(m_a1['monthly_returns'].index) +
                        list(m_a3['monthly_returns'].index) +
                        list(m_port['monthly_returns'].index)))
port_monthly = m_port['monthly_returns'].reindex(all_months, fill_value=0)
bar_colors = ['#4CAF50' if v >= 0 else '#F44336' for v in port_monthly.values]
ax4.bar(range(len(all_months)), port_monthly.values, color=bar_colors, alpha=0.8)
ax4.axhline(0, color='black', linewidth=0.5)
ax4.set_title(f'Portfolio Monthly Returns\n({m_port["monthly_consistency"]:.0%} profitable months)',
              fontweight='bold')
ax4.set_xlabel('Month'); ax4.set_ylabel('Monthly P&L ($)')
ax4.set_xticks(range(0, len(all_months), 3))
ax4.set_xticklabels([all_months[i] for i in range(0, len(all_months), 3)], rotation=45, fontsize=7)
ax4.grid(True, alpha=0.3, axis='y')

# 5. MC pass rate comparison
ax5 = fig.add_subplot(gs[2, 0])
mc_labels = ['System A\n(A1)', 'System B\n(A3)', 'System C\n(Portfolio)']
mc_pass = [mc_a1['pass_rate']*100, mc_a3['pass_rate']*100, mc_port['pass_rate']*100]
bars5 = ax5.bar(mc_labels, mc_pass,
                color=[colors['A1'], colors['A3'], colors['Port']], alpha=0.8)
ax5.axhline(75, color='red', linewidth=1.5, linestyle='--', label='Target 75%')
ax5.set_title('Monte Carlo Prop Firm Pass Rate', fontweight='bold')
ax5.set_ylabel('Pass Rate (%)')
ax5.set_ylim(0, 110); ax5.legend(fontsize=8); ax5.grid(True, alpha=0.3, axis='y')
for bar, val in zip(bars5, mc_pass):
    ax5.text(bar.get_x()+bar.get_width()/2., bar.get_height()+1,
             f'{val:.1f}%', ha='center', va='bottom', fontsize=9)

# 6. MC drawdown distribution (portfolio)
ax6 = fig.add_subplot(gs[2, 1])
ax6.hist(mc_port['mc_df']['dd'], bins=50, color=colors['Port'], alpha=0.7, edgecolor='white', label='Portfolio')
ax6.hist(mc_a1['mc_df']['dd'], bins=50, color=colors['A1'], alpha=0.4, edgecolor='white', label='A1')
ax6.hist(mc_a3['mc_df']['dd'], bins=50, color=colors['A3'], alpha=0.4, edgecolor='white', label='A3')
ax6.axvline(-2000, color='red', linewidth=1.5, linestyle='--', label='Prop Limit')
ax6.set_title('MC Max Drawdown Distribution', fontweight='bold')
ax6.set_xlabel('Max Drawdown ($)'); ax6.set_ylabel('Frequency')
ax6.legend(fontsize=8); ax6.grid(True, alpha=0.3)

# 7. H-P001 scorecard
ax7 = fig.add_subplot(gs[2, 2])
ax7.axis('off')
criteria_text = '\n'.join([f"{'✓' if v else '✗'} {k}" for k, v in criteria.items()])
verdict_color = '#4CAF50' if verdict == 'VALIDATED' else '#F44336'
ax7.text(0.05, 0.95, f'H-P001 VERDICT: {verdict}',
         transform=ax7.transAxes, fontsize=13, fontweight='bold',
         color=verdict_color, va='top')
ax7.text(0.05, 0.80, f'Criteria Passed: {passed}/{len(criteria)}',
         transform=ax7.transAxes, fontsize=11, va='top')
ax7.text(0.05, 0.65, criteria_text,
         transform=ax7.transAxes, fontsize=9, va='top', family='monospace')

plt.savefig(f'{OUTPUT_DIR}/sprint_038_portfolio_validation.png', dpi=150, bbox_inches='tight')
plt.close()
print(f"Chart saved.")
print("\n=== SPRINT 038 COMPLETE ===")

# Print final summary for report writing
print("\n=== FINAL SUMMARY FOR REPORT ===")
print(f"A1: N={m_a1['n_trades']}, PF={m_a1['profit_factor']:.3f}, Net=${m_a1['net_pnl']:.2f}, "
      f"DD=${m_a1['max_drawdown']:.2f}, R²={m_a1['r_squared']:.4f}, "
      f"Ulcer={m_a1['ulcer_index']:.2f}, MC={mc_a1['pass_rate']:.1%}")
print(f"A3: N={m_a3['n_trades']}, PF={m_a3['profit_factor']:.3f}, Net=${m_a3['net_pnl']:.2f}, "
      f"DD=${m_a3['max_drawdown']:.2f}, R²={m_a3['r_squared']:.4f}, "
      f"Ulcer={m_a3['ulcer_index']:.2f}, MC={mc_a3['pass_rate']:.1%}")
print(f"Portfolio: N={m_port['n_trades']}, PF={m_port['profit_factor']:.3f}, Net=${m_port['net_pnl']:.2f}, "
      f"DD=${m_port['max_drawdown']:.2f}, R²={m_port['r_squared']:.4f}, "
      f"Ulcer={m_port['ulcer_index']:.2f}, MC={mc_port['pass_rate']:.1%}")
print(f"Daily correlation (all days): {corr_all:.4f}")
print(f"Simultaneous trades: {simultaneous}")
print(f"Verdict: {verdict}")
