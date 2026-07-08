"""
Atlas Sprint 037 — Model A3 Engineering
Overnight Volatility Contraction → Expansion Execution Model
Fully vectorised implementation for speed.
"""

import pandas as pd
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.gridspec as gridspec
import warnings, os, sys
warnings.filterwarnings('ignore')

DATA_PATH = '/home/ubuntu/Project-Atlas/data/raw/massive/MNQ_5min_full.csv'
OUTPUT_DIR = '/home/ubuntu/Project-Atlas/research/sprint-037-charts'
os.makedirs(OUTPUT_DIR, exist_ok=True)

COMMISSION = 1.00   # per side
POINT_VALUE = 2.00  # MNQ $2/point

# ─── Fast EWM helper ──────────────────────────────────────────────────────────
def ewm_fast(arr, span):
    alpha = 2.0 / (span + 1)
    result = np.empty_like(arr, dtype=float)
    result[0] = arr[0]
    for i in range(1, len(arr)):
        result[i] = alpha * arr[i] + (1 - alpha) * result[i - 1]
    return result

# ─── Load & prepare ───────────────────────────────────────────────────────────
print("Loading data...")
df = pd.read_csv(DATA_PATH)
df['ts'] = pd.to_datetime(df['timestamp_et'], utc=True)
df = df.sort_values('ts').reset_index(drop=True)

hi = df['high'].values.astype(float)
lo = df['low'].values.astype(float)
cl = df['close'].values.astype(float)
op = df['open'].values.astype(float)
n = len(df)
print(f"Loaded {n:,} bars")

# ─── Indicators ───────────────────────────────────────────────────────────────
print("Computing indicators (vectorised)...")

# True range
tr = np.maximum(hi - lo, np.maximum(np.abs(hi - np.roll(cl, 1)), np.abs(lo - np.roll(cl, 1))))
tr[0] = hi[0] - lo[0]

# ATR5, ATR14
atr5 = ewm_fast(tr, 5)
atr14 = ewm_fast(tr, 14)

# Vol ratio: ATR5 / ATR5[20 bars ago]
atr5_lag = np.empty(n)
atr5_lag[:20] = np.nan
atr5_lag[20:] = atr5[:-20]
vol_ratio = np.where(atr5_lag > 0, atr5 / atr5_lag, np.nan)

# EMAs
ema9  = ewm_fast(cl, 9)
ema21 = ewm_fast(cl, 21)
ema50 = ewm_fast(cl, 50)

# ADX
plus_dm  = np.where((hi - np.roll(hi,1)) > (np.roll(lo,1) - lo), np.maximum(hi - np.roll(hi,1), 0), 0)
minus_dm = np.where((np.roll(lo,1) - lo) > (hi - np.roll(hi,1)), np.maximum(np.roll(lo,1) - lo, 0), 0)
plus_dm[0] = minus_dm[0] = 0

plus_di14  = 100 * ewm_fast(plus_dm, 14)  / np.where(atr14 > 0, atr14, np.nan)
minus_di14 = 100 * ewm_fast(minus_dm, 14) / np.where(atr14 > 0, atr14, np.nan)
di_sum = plus_di14 + minus_di14
dx = np.where(di_sum > 0, 100 * np.abs(plus_di14 - minus_di14) / di_sum, np.nan)
adx = ewm_fast(np.nan_to_num(dx, nan=0), 14)

# Trend flags
trend_long  = (ema9 > ema21) & (ema21 > ema50)
trend_short = (ema9 < ema21) & (ema21 < ema50)

# Session
hour = df['ts'].dt.hour.values
minute = df['ts'].dt.minute.values
is_overnight = (hour >= 18) | (hour < 9)

# Compression zone: rolling 5-bar low/high shifted by 1
zone_low  = pd.Series(lo).rolling(5).min().shift(1).values
zone_high = pd.Series(hi).rolling(5).max().shift(1).values

# Year
year = df['ts'].dt.year.values
month = df['ts'].dt.to_period('M').values
dow = df['ts'].dt.dayofweek.values

print("Indicators ready.")
print(f"Overnight bars: {is_overnight.sum():,} ({is_overnight.mean():.1%})")

# ─── Vectorised signal generation ─────────────────────────────────────────────
def find_signals(adx_thresh, comp_ratio, exp_ratio, require_trend=True):
    """Return array of signal indices where all entry conditions are met."""
    min_idx = 50  # warmup
    prev_compressed = np.roll(vol_ratio, 1) < comp_ratio
    prev_compressed[0] = False

    cond_overnight = is_overnight
    cond_adx       = adx >= adx_thresh
    cond_prev_comp = prev_compressed
    cond_expansion = vol_ratio >= exp_ratio
    cond_valid_vr  = ~np.isnan(vol_ratio)
    cond_valid_adx = ~np.isnan(adx)

    base = (cond_overnight & cond_adx & cond_prev_comp &
            cond_expansion & cond_valid_vr & cond_valid_adx)

    if require_trend:
        long_bar  = trend_long  & (cl > op)
        short_bar = trend_short & (cl < op)
        has_dir = long_bar | short_bar
        base = base & has_dir

    idxs = np.where(base)[0]
    return idxs[idxs >= min_idx]

# ─── Trade simulation ─────────────────────────────────────────────────────────
def simulate_trades(signal_idxs, target_rr, max_risk_pts=100.0):
    trades = []
    for i in signal_idxs:
        if i + 1 >= n:
            continue

        # Direction
        is_long_bar  = trend_long[i]  and (cl[i] > op[i])
        is_short_bar = trend_short[i] and (cl[i] < op[i])
        if not (is_long_bar or is_short_bar):
            continue

        entry = op[i + 1]

        if is_long_bar:
            stop  = zone_low[i]
            if np.isnan(stop) or stop >= entry:
                continue
            risk  = entry - stop
            tgt   = entry + risk * target_rr
            dirn  = 1
        else:
            stop  = zone_high[i]
            if np.isnan(stop) or stop <= entry:
                continue
            risk  = stop - entry
            tgt   = entry - risk * target_rr
            dirn  = -1

        if risk <= 0 or risk > max_risk_pts:
            continue

        # Scan forward
        outcome = None
        exit_p  = None
        exit_j  = None

        for j in range(i + 1, min(i + 300, n)):
            # Time exit at RTH open (9:30)
            if (not is_overnight[j]) and hour[j] == 9 and minute[j] == 30:
                outcome = 'time_exit'
                exit_p  = op[j]
                exit_j  = j
                break
            if dirn == 1:
                if lo[j] <= stop:
                    outcome, exit_p, exit_j = 'loss', stop, j; break
                if hi[j] >= tgt:
                    outcome, exit_p, exit_j = 'win', tgt, j; break
            else:
                if hi[j] >= stop:
                    outcome, exit_p, exit_j = 'loss', stop, j; break
                if lo[j] <= tgt:
                    outcome, exit_p, exit_j = 'win', tgt, j; break

        if outcome is None:
            continue

        gross = (exit_p - entry) * POINT_VALUE * dirn
        net   = gross - COMMISSION * 2

        trades.append({
            'entry_time': df['ts'].iloc[i],
            'direction': 'long' if dirn == 1 else 'short',
            'entry': entry, 'exit': exit_p, 'stop': stop,
            'risk_pts': risk, 'outcome': outcome,
            'gross_pnl': gross, 'net_pnl': net,
            'adx_entry': adx[i], 'vol_ratio_entry': vol_ratio[i],
            'year': year[i], 'month': month[i], 'dow': dow[i], 'hour': hour[i],
        })
    return pd.DataFrame(trades)

# ─── Metrics ──────────────────────────────────────────────────────────────────
def metrics(t):
    if len(t) < 10:
        return None
    wins = t[t['outcome'] == 'win']
    loss = t[t['outcome'] == 'loss']
    gw = wins['net_pnl'].sum()
    gl = abs(loss['net_pnl'].sum())
    pf = gw / gl if gl > 0 else 0
    eq = t['net_pnl'].cumsum()
    pk = eq.cummax()
    dd = (eq - pk).min()
    return dict(n=len(t), wr=len(wins)/len(t), pf=pf,
                net=t['net_pnl'].sum(), dd=dd,
                aw=wins['net_pnl'].mean() if len(wins) else 0,
                al=loss['net_pnl'].mean() if len(loss) else 0)

# ─── Parameter sweep ──────────────────────────────────────────────────────────
print("\n=== PARAMETER SWEEP ===")
results = []
for adx_t in [15, 20, 25]:
    for comp in [0.80, 0.85, 0.90]:
        for exp in [1.2, 1.3, 1.4, 1.5]:
            for rr in [1.5, 2.0, 2.5]:
                sigs = find_signals(adx_t, comp, exp)
                t = simulate_trades(sigs, rr)
                m = metrics(t)
                if m and m['n'] >= 20:
                    results.append(dict(adx=adx_t, comp=comp, exp=exp, rr=rr, **m))

res_df = pd.DataFrame(results)
if len(res_df) == 0:
    print("No viable configurations found (n>=20). Model A3 REJECTED.")
    sys.exit(0)

res_df = res_df.sort_values('pf', ascending=False)
print(f"Viable configurations: {len(res_df)}")
cols = ['adx','comp','exp','rr','n','pf','net','dd','wr']
print(res_df.head(15)[cols].to_string(index=False))

best = res_df.iloc[0]
print(f"\n=== BEST CONFIG: ADX>={best['adx']}, Comp<{best['comp']}, Exp>{best['exp']}, RR={best['rr']} ===")
print(f"N={best['n']}, PF={best['pf']:.3f}, Net=${best['net']:.2f}, DD=${best['dd']:.2f}, WR={best['wr']:.1%}")

# ─── Full analysis on best config ─────────────────────────────────────────────
sigs_best = find_signals(best['adx'], best['comp'], best['exp'])
trades = simulate_trades(sigs_best, best['rr'])

print(f"\nYear-by-Year:")
for yr in sorted(trades['year'].unique()):
    yt = trades[trades['year'] == yr]
    m = metrics(yt)
    if m:
        print(f"  {yr}: N={m['n']}, PF={m['pf']:.3f}, Net=${m['net']:.2f}, WR={m['wr']:.1%}, DD=${m['dd']:.2f}")

print(f"\nOutcome counts: {trades['outcome'].value_counts().to_dict()}")

print(f"\nLong/Short:")
for d in ['long','short']:
    dt = trades[trades['direction']==d]
    m = metrics(dt)
    if m:
        print(f"  {d}: N={m['n']}, PF={m['pf']:.3f}, Net=${m['net']:.2f}")

print(f"\nADX Quartile:")
trades['adx_q'] = pd.qcut(trades['adx_entry'], q=4, labels=['Q1','Q2','Q3','Q4'])
for q in ['Q1','Q2','Q3','Q4']:
    qt = trades[trades['adx_q']==q]
    m = metrics(qt)
    if m:
        print(f"  {q} (ADX {qt['adx_entry'].min():.1f}-{qt['adx_entry'].max():.1f}): "
              f"N={m['n']}, PF={m['pf']:.3f}, Net=${m['net']:.2f}")

# ─── Monte Carlo ──────────────────────────────────────────────────────────────
print(f"\n=== MONTE CARLO (1,000 shuffles) ===")
np.random.seed(42)
pnl = trades['net_pnl'].values
mc = []
for _ in range(1000):
    sh = np.random.permutation(pnl)
    eq = np.cumsum(sh)
    pk = np.maximum.accumulate(eq)
    mc.append({'fp': eq[-1], 'dd': (eq - pk).min()})
mc_df = pd.DataFrame(mc)
print(f"Median Final P&L: ${mc_df['fp'].median():.2f}")
print(f"5th Pct Final P&L: ${mc_df['fp'].quantile(0.05):.2f}")
print(f"5th Pct Max DD: ${mc_df['dd'].quantile(0.05):.2f}")
prop_pass = (mc_df['dd'] > -2000).mean()
print(f"Prop Firm Pass Rate (DD < $2,000): {prop_pass:.1%}")

# ─── Charts ───────────────────────────────────────────────────────────────────
fig = plt.figure(figsize=(16, 12))
gs = gridspec.GridSpec(2, 2, figure=fig, hspace=0.4, wspace=0.35)
fig.suptitle(f'Sprint 037 — Model A3: Overnight Contraction Breakout\n'
             f'ADX>={best["adx"]}, Comp<{best["comp"]}, Exp>{best["exp"]}, RR={best["rr"]}',
             fontsize=13, fontweight='bold')

ax1 = fig.add_subplot(gs[0, 0])
eq_curve = trades['net_pnl'].cumsum()
ax1.plot(range(len(eq_curve)), eq_curve, color='#2196F3', linewidth=1.5)
ax1.fill_between(range(len(eq_curve)), eq_curve, 0, alpha=0.1, color='#2196F3')
ax1.axhline(0, color='black', linewidth=0.5)
ax1.set_title('Equity Curve (2-Year)', fontweight='bold')
ax1.set_xlabel('Trade Number'); ax1.set_ylabel('Cumulative P&L ($)')
ax1.grid(True, alpha=0.3)

ax2 = fig.add_subplot(gs[0, 1])
years = sorted(trades['year'].unique())
pfs = [metrics(trades[trades['year']==yr])['pf'] for yr in years]
bars2 = ax2.bar([str(y) for y in years], pfs,
                color=['#4CAF50' if p >= 1.2 else '#F44336' for p in pfs])
ax2.axhline(1.0, color='black', linewidth=0.8, linestyle='--')
ax2.axhline(1.2, color='#4CAF50', linewidth=0.8, linestyle='--', label='Target PF 1.20')
ax2.set_title('Profit Factor by Year', fontweight='bold')
ax2.set_ylabel('Profit Factor'); ax2.legend(fontsize=8); ax2.grid(True, alpha=0.3, axis='y')
for bar, pf_val in zip(bars2, pfs):
    ax2.text(bar.get_x()+bar.get_width()/2., bar.get_height()+0.02,
             f'{pf_val:.3f}', ha='center', va='bottom', fontsize=9)

ax3 = fig.add_subplot(gs[1, 0])
adx_pfs, adx_labels = [], []
for q in ['Q1','Q2','Q3','Q4']:
    qt = trades[trades['adx_q']==q]
    m = metrics(qt)
    adx_pfs.append(m['pf'] if m else 0)
    adx_labels.append(f"{q}\n(n={len(qt)})")
bars3 = ax3.bar(adx_labels, adx_pfs,
                color=['#4CAF50' if p >= 1.2 else '#F44336' for p in adx_pfs])
ax3.axhline(1.0, color='black', linewidth=0.8, linestyle='--')
ax3.axhline(1.2, color='#4CAF50', linewidth=0.8, linestyle='--')
ax3.set_title('PF by ADX Quartile at Entry', fontweight='bold')
ax3.set_ylabel('Profit Factor'); ax3.grid(True, alpha=0.3, axis='y')
for bar, pf_val in zip(bars3, adx_pfs):
    ax3.text(bar.get_x()+bar.get_width()/2., bar.get_height()+0.02,
             f'{pf_val:.3f}', ha='center', va='bottom', fontsize=9)

ax4 = fig.add_subplot(gs[1, 1])
ax4.hist(mc_df['dd'], bins=40, color='#FF5722', alpha=0.7, edgecolor='white')
ax4.axvline(-2000, color='red', linewidth=1.5, linestyle='--', label='Prop DD Limit')
p5 = mc_df['dd'].quantile(0.05)
ax4.axvline(p5, color='orange', linewidth=1.5, linestyle='--', label=f'5th Pct (${p5:.0f})')
ax4.set_title('Monte Carlo Max Drawdown', fontweight='bold')
ax4.set_xlabel('Max Drawdown ($)'); ax4.set_ylabel('Frequency')
ax4.legend(fontsize=8); ax4.grid(True, alpha=0.3)

plt.savefig(f'{OUTPUT_DIR}/sprint_037_model_a3_results.png', dpi=150, bbox_inches='tight')
plt.close()
print(f"\nChart saved to {OUTPUT_DIR}/sprint_037_model_a3_results.png")
print("\n=== SPRINT 037 COMPLETE ===")
