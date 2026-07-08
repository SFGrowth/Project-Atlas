"""
Atlas Sprint 037 — Model A3 Independent Validation & Characterisation
Runs: quarterly stability, long/short symmetry, parameter neighbourhood,
      day-of-week, ADX deep-dive, time-exit analysis, and extended MC.
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
OUTPUT_DIR = '/home/ubuntu/Project-Atlas/research/sprint-037-charts'
os.makedirs(OUTPUT_DIR, exist_ok=True)

COMMISSION = 1.00
POINT_VALUE = 2.00

# Best config from primary backtest
BEST_ADX   = 25.0
BEST_COMP  = 0.80
BEST_EXP   = 1.3
BEST_RR    = 2.5

# ─── Fast EWM ─────────────────────────────────────────────────────────────────
def ewm_fast(arr, span):
    alpha = 2.0 / (span + 1)
    result = np.empty_like(arr, dtype=float)
    result[0] = arr[0]
    for i in range(1, len(arr)):
        result[i] = alpha * arr[i] + (1 - alpha) * result[i - 1]
    return result

# ─── Load ─────────────────────────────────────────────────────────────────────
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
qtr    = ((month - 1) // 3 + 1)
dow    = df['ts'].dt.dayofweek.values
date   = df['ts'].dt.date.values

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
zone_low  = pd.Series(lo).rolling(5).min().shift(1).values
zone_high = pd.Series(hi).rolling(5).max().shift(1).values
print("Indicators ready.")

# ─── Signal finder ────────────────────────────────────────────────────────────
def find_signals(adx_t, comp, exp):
    prev_comp = np.roll(vol_ratio, 1) < comp
    prev_comp[0] = False
    base = (is_overnight & (adx >= adx_t) & prev_comp &
            (vol_ratio >= exp) & ~np.isnan(vol_ratio) & ~np.isnan(adx))
    long_bar  = trend_long  & (cl > op)
    short_bar = trend_short & (cl < op)
    idxs = np.where(base & (long_bar | short_bar))[0]
    return idxs[idxs >= 50]

# ─── Trade simulator ──────────────────────────────────────────────────────────
def simulate(sigs, rr, max_risk=100.0):
    trades = []
    for i in sigs:
        if i+1 >= n: continue
        is_long  = bool(trend_long[i])  and (cl[i] > op[i])
        is_short = bool(trend_short[i]) and (cl[i] < op[i])
        if not (is_long or is_short): continue
        entry = op[i+1]
        if is_long:
            stop = zone_low[i]
            if np.isnan(stop) or stop >= entry: continue
            risk = entry - stop; tgt = entry + risk*rr; dirn = 1
        else:
            stop = zone_high[i]
            if np.isnan(stop) or stop <= entry: continue
            risk = stop - entry; tgt = entry - risk*rr; dirn = -1
        if risk <= 0 or risk > max_risk: continue
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
        if outcome is None: continue
        gross = (exit_p - entry) * POINT_VALUE * dirn
        net   = gross - COMMISSION*2
        trades.append({
            'direction': 'long' if dirn==1 else 'short',
            'entry': entry, 'exit': exit_p, 'stop': stop,
            'risk_pts': risk, 'outcome': outcome,
            'gross_pnl': gross, 'net_pnl': net,
            'adx_entry': adx[i], 'vol_ratio': vol_ratio[i],
            'year': year[i], 'month': month[i], 'qtr': qtr[i],
            'dow': dow[i], 'hour': hour[i], 'date': date[i],
        })
    return pd.DataFrame(trades)

def mets(t):
    if len(t) < 5: return None
    wins = t[t['outcome']=='win']; loss = t[t['outcome']=='loss']
    gw = wins['net_pnl'].sum(); gl = abs(loss['net_pnl'].sum())
    pf = gw/gl if gl>0 else 0
    eq = t['net_pnl'].cumsum(); pk = eq.cummax(); dd = (eq-pk).min()
    return dict(n=len(t), wr=len(wins)/len(t), pf=pf,
                net=t['net_pnl'].sum(), dd=dd,
                aw=wins['net_pnl'].mean() if len(wins) else 0,
                al=loss['net_pnl'].mean() if len(loss) else 0)

# ─── Primary trades ───────────────────────────────────────────────────────────
sigs = find_signals(BEST_ADX, BEST_COMP, BEST_EXP)
trades = simulate(sigs, BEST_RR)
print(f"\nPrimary config trades: {len(trades)}")

# ─── Quarterly stability ──────────────────────────────────────────────────────
print("\n=== QUARTERLY STABILITY ===")
trades['yr_qtr'] = trades['year'].astype(str) + '-Q' + trades['qtr'].astype(str)
qtrs = sorted(trades['yr_qtr'].unique())
qtr_data = []
for q in qtrs:
    qt = trades[trades['yr_qtr']==q]
    m = mets(qt)
    if m:
        qtr_data.append({'qtr': q, **m})
        print(f"  {q}: N={m['n']}, PF={m['pf']:.3f}, Net=${m['net']:.2f}, WR={m['wr']:.1%}")

profitable_qtrs = sum(1 for d in qtr_data if d['net'] > 0)
total_qtrs = len(qtr_data)
print(f"\nProfitable quarters: {profitable_qtrs}/{total_qtrs} ({profitable_qtrs/total_qtrs:.1%})")

# ─── Long/Short symmetry ──────────────────────────────────────────────────────
print("\n=== LONG/SHORT SYMMETRY ===")
for d in ['long','short']:
    dt = trades[trades['direction']==d]
    m = mets(dt)
    if m:
        print(f"  {d}: N={m['n']}, PF={m['pf']:.3f}, Net=${m['net']:.2f}, WR={m['wr']:.1%}, DD=${m['dd']:.2f}")

# ─── Day-of-week ──────────────────────────────────────────────────────────────
print("\n=== DAY-OF-WEEK ===")
day_names = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
for d in sorted(trades['dow'].unique()):
    dt = trades[trades['dow']==d]
    m = mets(dt)
    if m:
        print(f"  {day_names[d]}: N={m['n']}, PF={m['pf']:.3f}, Net=${m['net']:.2f}")

# ─── ADX deep-dive (deciles) ──────────────────────────────────────────────────
print("\n=== ADX DECILE ANALYSIS ===")
trades['adx_decile'] = pd.qcut(trades['adx_entry'], q=5, labels=['D1','D2','D3','D4','D5'])
for d in ['D1','D2','D3','D4','D5']:
    dt = trades[trades['adx_decile']==d]
    m = mets(dt)
    if m:
        print(f"  {d} (ADX {dt['adx_entry'].min():.1f}-{dt['adx_entry'].max():.1f}): "
              f"N={m['n']}, PF={m['pf']:.3f}, Net=${m['net']:.2f}")

# ─── Time-exit analysis ───────────────────────────────────────────────────────
print("\n=== TIME-EXIT ANALYSIS ===")
te = trades[trades['outcome']=='time_exit']
if len(te) > 0:
    te_pnl = te['net_pnl']
    print(f"  Time exits: {len(te)} ({len(te)/len(trades):.1%} of trades)")
    print(f"  Time-exit avg P&L: ${te_pnl.mean():.2f}")
    print(f"  Time-exit profitable: {(te_pnl > 0).mean():.1%}")

# ─── Parameter neighbourhood (stability test) ─────────────────────────────────
print("\n=== PARAMETER NEIGHBOURHOOD STABILITY ===")
for adx_t2 in [20, 25, 30]:
    for comp in [0.75, 0.80, 0.85]:
        for exp in [1.2, 1.3, 1.4]:
            s = find_signals(adx_t2, comp, exp)
            t = simulate(s, BEST_RR)
            m = mets(t)
            marker = " <-- PRIMARY" if (adx_t2==BEST_ADX and comp==BEST_COMP and exp==BEST_EXP) else ""
            if m and m['n'] >= 15:
                print(f"  ADX>={adx_t2}, C<{comp}, E>{exp}: N={m['n']}, PF={m['pf']:.3f}, "
                      f"Net=${m['net']:.2f}{marker}")

# ─── Extended Monte Carlo (5,000 shuffles) ────────────────────────────────────
print("\n=== EXTENDED MONTE CARLO (5,000 shuffles) ===")
np.random.seed(42)
pnl = trades['net_pnl'].values
mc = []
for _ in range(5000):
    sh = np.random.permutation(pnl)
    eq = np.cumsum(sh); pk = np.maximum.accumulate(eq)
    mc.append({'fp': eq[-1], 'dd': (eq-pk).min()})
mc_df = pd.DataFrame(mc)
print(f"Median Final P&L: ${mc_df['fp'].median():.2f}")
print(f"5th Pct Final P&L: ${mc_df['fp'].quantile(0.05):.2f}")
print(f"95th Pct Final P&L: ${mc_df['fp'].quantile(0.95):.2f}")
print(f"5th Pct Max DD: ${mc_df['dd'].quantile(0.05):.2f}")
print(f"Prop Firm Pass Rate (DD < $2,000): {(mc_df['dd'] > -2000).mean():.1%}")
print(f"Prop Firm Pass Rate (DD < $1,500): {(mc_df['dd'] > -1500).mean():.1%}")

# ─── Comprehensive charts ─────────────────────────────────────────────────────
fig = plt.figure(figsize=(18, 14))
gs = gridspec.GridSpec(3, 3, figure=fig, hspace=0.45, wspace=0.35)
fig.suptitle('Sprint 037 — Model A3 Independent Validation\n'
             f'ADX>={BEST_ADX}, Comp<{BEST_COMP}, Exp>{BEST_EXP}, RR={BEST_RR}',
             fontsize=13, fontweight='bold')

# 1. Equity curve
ax1 = fig.add_subplot(gs[0, :2])
eq_curve = trades['net_pnl'].cumsum()
ax1.plot(range(len(eq_curve)), eq_curve, color='#2196F3', linewidth=1.5)
ax1.fill_between(range(len(eq_curve)), eq_curve, 0, alpha=0.1, color='#2196F3')
ax1.axhline(0, color='black', linewidth=0.5)
ax1.set_title('Equity Curve (Full 2-Year Period)', fontweight='bold')
ax1.set_xlabel('Trade Number'); ax1.set_ylabel('Cumulative P&L ($)')
ax1.grid(True, alpha=0.3)

# 2. Quarterly PF
ax2 = fig.add_subplot(gs[0, 2])
qtr_pfs = [d['pf'] for d in qtr_data]
qtr_labels = [d['qtr'] for d in qtr_data]
bars = ax2.bar(range(len(qtr_labels)), qtr_pfs,
               color=['#4CAF50' if p >= 1.0 else '#F44336' for p in qtr_pfs])
ax2.axhline(1.0, color='black', linewidth=0.8, linestyle='--')
ax2.set_xticks(range(len(qtr_labels)))
ax2.set_xticklabels(qtr_labels, rotation=45, fontsize=7)
ax2.set_title('PF by Quarter', fontweight='bold')
ax2.set_ylabel('Profit Factor'); ax2.grid(True, alpha=0.3, axis='y')

# 3. Long vs Short
ax3 = fig.add_subplot(gs[1, 0])
dirs = ['long','short']
dir_pfs = []
dir_nets = []
for d in dirs:
    dt = trades[trades['direction']==d]
    m = mets(dt)
    dir_pfs.append(m['pf'] if m else 0)
    dir_nets.append(m['net'] if m else 0)
bars3 = ax3.bar(dirs, dir_pfs, color=['#2196F3','#FF9800'])
ax3.axhline(1.0, color='black', linewidth=0.8, linestyle='--')
ax3.set_title('PF: Long vs Short', fontweight='bold')
ax3.set_ylabel('Profit Factor'); ax3.grid(True, alpha=0.3, axis='y')
for bar, pf_val in zip(bars3, dir_pfs):
    ax3.text(bar.get_x()+bar.get_width()/2., bar.get_height()+0.02,
             f'{pf_val:.3f}', ha='center', va='bottom', fontsize=10)

# 4. Day-of-week
ax4 = fig.add_subplot(gs[1, 1])
dow_pfs, dow_labels = [], []
for d in sorted(trades['dow'].unique()):
    dt = trades[trades['dow']==d]
    m = mets(dt)
    dow_pfs.append(m['pf'] if m else 0)
    dow_labels.append(f"{day_names[d]}\n(n={len(dt)})")
bars4 = ax4.bar(dow_labels, dow_pfs,
                color=['#4CAF50' if p >= 1.0 else '#F44336' for p in dow_pfs])
ax4.axhline(1.0, color='black', linewidth=0.8, linestyle='--')
ax4.set_title('PF by Day of Week', fontweight='bold')
ax4.set_ylabel('Profit Factor'); ax4.grid(True, alpha=0.3, axis='y')
for bar, pf_val in zip(bars4, dow_pfs):
    ax4.text(bar.get_x()+bar.get_width()/2., bar.get_height()+0.02,
             f'{pf_val:.3f}', ha='center', va='bottom', fontsize=9)

# 5. ADX decile
ax5 = fig.add_subplot(gs[1, 2])
dec_pfs, dec_labels = [], []
for d in ['D1','D2','D3','D4','D5']:
    dt = trades[trades['adx_decile']==d]
    m = mets(dt)
    dec_pfs.append(m['pf'] if m else 0)
    dec_labels.append(f"{d}\n(n={len(dt)})")
bars5 = ax5.bar(dec_labels, dec_pfs,
                color=['#4CAF50' if p >= 1.0 else '#F44336' for p in dec_pfs])
ax5.axhline(1.0, color='black', linewidth=0.8, linestyle='--')
ax5.set_title('PF by ADX Decile', fontweight='bold')
ax5.set_ylabel('Profit Factor'); ax5.grid(True, alpha=0.3, axis='y')
for bar, pf_val in zip(bars5, dec_pfs):
    ax5.text(bar.get_x()+bar.get_width()/2., bar.get_height()+0.02,
             f'{pf_val:.3f}', ha='center', va='bottom', fontsize=9)

# 6. MC Final P&L distribution
ax6 = fig.add_subplot(gs[2, 0])
ax6.hist(mc_df['fp'], bins=50, color='#4CAF50', alpha=0.7, edgecolor='white')
ax6.axvline(0, color='red', linewidth=1.5, linestyle='--', label='Break-even')
ax6.axvline(mc_df['fp'].median(), color='blue', linewidth=1.5, linestyle='--',
            label=f"Median ${mc_df['fp'].median():.0f}")
ax6.set_title('MC Final P&L Distribution', fontweight='bold')
ax6.set_xlabel('Final P&L ($)'); ax6.set_ylabel('Frequency')
ax6.legend(fontsize=8); ax6.grid(True, alpha=0.3)

# 7. MC Max DD distribution
ax7 = fig.add_subplot(gs[2, 1])
ax7.hist(mc_df['dd'], bins=50, color='#FF5722', alpha=0.7, edgecolor='white')
ax7.axvline(-2000, color='red', linewidth=1.5, linestyle='--', label='Prop Limit -$2,000')
p5 = mc_df['dd'].quantile(0.05)
ax7.axvline(p5, color='orange', linewidth=1.5, linestyle='--', label=f'5th Pct ${p5:.0f}')
ax7.set_title('MC Max Drawdown Distribution', fontweight='bold')
ax7.set_xlabel('Max Drawdown ($)'); ax7.set_ylabel('Frequency')
ax7.legend(fontsize=8); ax7.grid(True, alpha=0.3)

# 8. Cumulative outcome analysis
ax8 = fig.add_subplot(gs[2, 2])
outcome_counts = trades['outcome'].value_counts()
colors = {'win': '#4CAF50', 'loss': '#F44336', 'time_exit': '#FF9800'}
ax8.pie([outcome_counts.get(k,0) for k in ['win','loss','time_exit']],
        labels=[f"Win\n{outcome_counts.get('win',0)}",
                f"Loss\n{outcome_counts.get('loss',0)}",
                f"Time Exit\n{outcome_counts.get('time_exit',0)}"],
        colors=[colors[k] for k in ['win','loss','time_exit']],
        autopct='%1.1f%%', startangle=90)
ax8.set_title('Trade Outcome Distribution', fontweight='bold')

plt.savefig(f'{OUTPUT_DIR}/sprint_037_model_a3_validation.png', dpi=150, bbox_inches='tight')
plt.close()
print(f"\nValidation chart saved.")
print("\n=== VALIDATION COMPLETE ===")
