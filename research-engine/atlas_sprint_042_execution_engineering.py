"""
Atlas Sprint 042 — Model A2 Discovery: Execution Engineering
Converts H-A2-02 (Flag Continuation) into a precision execution model.
Tests multiple precision filters to lift PF above 1.20 threshold.
"""
import pandas as pd
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.gridspec as gridspec
import warnings, os
from scipy import stats
warnings.filterwarnings('ignore')

DATA_PATH   = '/home/ubuntu/Project-Atlas/data/raw/massive/MNQ_5min_full.csv'
OUTPUT_DIR  = '/home/ubuntu/Project-Atlas/research/sprint-042-charts'
os.makedirs(OUTPUT_DIR, exist_ok=True)

POINT_VALUE    = 2.0
COMMISSION     = 1.00
RISK_PER_TRADE = 800.0

def ewm_np(arr, span):
    a = 2.0 / (span + 1)
    out = np.empty_like(arr, dtype=float)
    out[0] = arr[0]
    for i in range(1, len(arr)):
        out[i] = a * arr[i] + (1 - a) * out[i-1]
    return out

def load_data():
    df = pd.read_csv(DATA_PATH)
    df['ts'] = pd.to_datetime(df['timestamp_et'], utc=True)
    df = df.sort_values('ts').reset_index(drop=True)
    hi = df['high'].values.astype(float)
    lo = df['low'].values.astype(float)
    cl = df['close'].values.astype(float)
    n  = len(df)
    hour   = df['ts'].dt.hour.values
    minute = df['ts'].dt.minute.values
    year   = df['ts'].dt.year.values
    month  = df['ts'].dt.month.values

    tr = np.maximum(hi - lo, np.maximum(np.abs(hi - np.roll(cl,1)), np.abs(lo - np.roll(cl,1))))
    tr[0] = hi[0] - lo[0]
    atr5  = ewm_np(tr, 5)
    atr14 = ewm_np(tr, 14)
    atr20 = ewm_np(tr, 20)
    ema9  = ewm_np(cl, 9)
    ema21 = ewm_np(cl, 21)
    ema50 = ewm_np(cl, 50)

    pdm = np.where((hi-np.roll(hi,1))>(np.roll(lo,1)-lo), np.maximum(hi-np.roll(hi,1),0), 0)
    mdm = np.where((np.roll(lo,1)-lo)>(hi-np.roll(hi,1)), np.maximum(np.roll(lo,1)-lo,0), 0)
    pdm[0] = mdm[0] = 0
    pdi = 100 * ewm_np(pdm,14) / np.where(atr14>0, atr14, 1)
    mdi = 100 * ewm_np(mdm,14) / np.where(atr14>0, atr14, 1)
    ds  = pdi + mdi
    dx  = np.where(ds>0, 100*np.abs(pdi-mdi)/ds, 0)
    adx = ewm_np(dx, 14)

    trend_long  = (ema9 > ema21) & (ema21 > ema50)
    trend_short = (ema9 < ema21) & (ema21 < ema50)
    is_rth = ((hour == 9) & (minute >= 30)) | ((hour >= 10) & (hour <= 15))
    # Session time buckets
    time_val = hour * 60 + minute
    is_early_rth  = (time_val >= 570) & (time_val < 720)   # 09:30-12:00
    is_mid_rth    = (time_val >= 720) & (time_val < 840)   # 12:00-14:00
    is_late_rth   = (time_val >= 840) & (time_val < 960)   # 14:00-16:00

    return dict(hi=hi, lo=lo, cl=cl, n=n, hour=hour, minute=minute,
                year=year, month=month, atr5=atr5, atr14=atr14, atr20=atr20,
                adx=adx, trend_long=trend_long, trend_short=trend_short,
                is_rth=is_rth, is_early_rth=is_early_rth,
                is_mid_rth=is_mid_rth, is_late_rth=is_late_rth)

def simulate_trades(mkt, signal_idx, directions, stop_pts_arr, rr=2.0, max_bars=150):
    hi=mkt['hi']; lo=mkt['lo']; cl=mkt['cl']
    is_rth=mkt['is_rth']; n=mkt['n']
    trades = []
    used_until = -1
    for k in range(len(signal_idx)):
        i = int(signal_idx[k])
        if i <= used_until: continue
        d = int(directions[k])
        sp = float(stop_pts_arr[k])
        if sp < 1.0: continue
        entry = cl[i]
        stop  = entry - d * sp
        tgt   = entry + d * sp * rr
        n_c   = max(1, round(RISK_PER_TRADE / (sp * POINT_VALUE)))
        outcome = None
        for j in range(i+1, min(i+max_bars, n)):
            if not is_rth[j]:
                net = (cl[j-1]-entry)*POINT_VALUE*d*n_c - COMMISSION*2*n_c
                outcome = dict(net=net, bars=j-i, outcome='time_exit',
                               year=mkt['year'][i], month=mkt['month'][i])
                break
            if d==1:
                if lo[j]<=stop: net=(stop-entry)*POINT_VALUE*d*n_c-COMMISSION*2*n_c; outcome=dict(net=net,bars=j-i,outcome='loss',year=mkt['year'][i],month=mkt['month'][i]); break
                if hi[j]>=tgt:  net=(tgt-entry)*POINT_VALUE*d*n_c-COMMISSION*2*n_c;  outcome=dict(net=net,bars=j-i,outcome='win', year=mkt['year'][i],month=mkt['month'][i]); break
            else:
                if hi[j]>=stop: net=(stop-entry)*POINT_VALUE*d*n_c-COMMISSION*2*n_c; outcome=dict(net=net,bars=j-i,outcome='loss',year=mkt['year'][i],month=mkt['month'][i]); break
                if lo[j]<=tgt:  net=(tgt-entry)*POINT_VALUE*d*n_c-COMMISSION*2*n_c;  outcome=dict(net=net,bars=j-i,outcome='win', year=mkt['year'][i],month=mkt['month'][i]); break
        if outcome:
            trades.append(outcome)
            used_until = i + outcome['bars']
    return pd.DataFrame(trades)

def stats_from_df(df):
    if len(df) < 10:
        return dict(n=len(df), pf=0, wr=0, net=0, exp=0, p_value=1.0, max_dd=0, equity=np.array([]))
    pnl = df['net'].values
    wins = pnl[pnl>0]; loss = pnl[pnl<0]
    gw = wins.sum(); gl = abs(loss.sum())
    pf = gw/gl if gl>0 else 0
    wr = (pnl>0).mean()
    n_wins = int((pnl>0).sum())
    p_val = stats.binomtest(n_wins, len(pnl), 0.333, alternative='greater').pvalue
    eq = np.cumsum(pnl)
    max_dd = (eq - np.maximum.accumulate(eq)).min()
    return dict(n=len(pnl), pf=pf, wr=wr, net=pnl.sum(), exp=pnl.mean(),
                p_value=p_val, max_dd=max_dd, equity=eq)

def flag_signals(mkt, adx_min=45, impulse_w=5, flag_w=8, max_retrace=0.50,
                 require_vol_compress=False, compress_ratio=0.80,
                 session_filter=None, min_impulse_mult=1.5, rr=2.0):
    """
    Precision flag model with optional filters:
    - require_vol_compress: flag must show ATR compression
    - session_filter: 'early', 'mid', 'late', or None
    - min_impulse_mult: minimum impulse size as multiple of ATR14
    """
    hi=mkt['hi']; lo=mkt['lo']; cl=mkt['cl']
    atr5=mkt['atr5']; atr14=mkt['atr14']; adx=mkt['adx']
    tl=mkt['trend_long']; ts=mkt['trend_short']
    rth=mkt['is_rth']; n=mkt['n']

    if session_filter == 'early':   sess = mkt['is_early_rth']
    elif session_filter == 'mid':   sess = mkt['is_mid_rth']
    elif session_filter == 'late':  sess = mkt['is_late_rth']
    else:                           sess = rth

    idx=[]; dirs=[]; stops=[]
    for i in range(flag_w+impulse_w+10, n-1):
        if not rth[i] or not sess[i]: continue
        if adx[i] < adx_min: continue
        avg = atr14[i]
        if avg <= 0: continue
        # Impulse (prior to flag)
        ihi = hi[i-impulse_w-flag_w:i-flag_w].max()
        ilo = lo[i-impulse_w-flag_w:i-flag_w].min()
        imp = ihi - ilo
        if imp < min_impulse_mult * avg: continue
        # Flag zone
        fhi = hi[i-flag_w:i+1].max()
        flo = lo[i-flag_w:i+1].min()
        frange = fhi - flo
        if frange < 1.0: continue
        # Optional: flag must show ATR compression
        if require_vol_compress:
            flag_atrs = atr5[i-flag_w:i+1]
            if not np.all(flag_atrs < compress_ratio * avg): continue
        if tl[i]:
            retrace = (fhi - cl[i]) / imp if imp > 0 else 1
            if retrace > max_retrace: continue
            if cl[i] > fhi * 0.998:
                sp = cl[i] - flo
                if 1.0 <= sp <= avg * 5:
                    idx.append(i); dirs.append(1); stops.append(sp)
        elif ts[i]:
            retrace = (cl[i] - flo) / imp if imp > 0 else 1
            if retrace > max_retrace: continue
            if cl[i] < flo * 1.002:
                sp = fhi - cl[i]
                if 1.0 <= sp <= avg * 5:
                    idx.append(i); dirs.append(-1); stops.append(sp)
    return np.array(idx), np.array(dirs), np.array(stops)

# ─── Main ─────────────────────────────────────────────────────────────────────
print("="*70)
print("Sprint 042 — Model A2 Execution Engineering")
print(f"Base behaviour: Flag Continuation (H-A2-02)")
print(f"Data: MNQ 5-min | Risk: ${RISK_PER_TRADE}/trade")
print("="*70)

mkt = load_data()

# Baseline (no precision filters)
print("\n" + "─"*70)
print("BASELINE: Flag ADX>45, no additional filters")
idx, dirs, stops = flag_signals(mkt, adx_min=45)
df_base = simulate_trades(mkt, idx, dirs, stops)
s_base = stats_from_df(df_base)
print(f"  N={s_base['n']} | PF={s_base['pf']:.3f} | WR={s_base['wr']:.1%} | "
      f"Exp=${s_base['exp']:.2f} | p={s_base['p_value']:.4f}")

# Filter sweep
print("\n" + "─"*70)
print("PRECISION FILTER SWEEP")
print("─"*70)
print(f"{'Configuration':<45} {'N':>5} {'PF':>7} {'WR':>7} {'Exp($)':>9} {'p-val':>8}")
print("─"*70)

configs = [
    ("ADX>45, no filters",                     dict(adx_min=45)),
    ("ADX>45, vol compress in flag",            dict(adx_min=45, require_vol_compress=True)),
    ("ADX>45, impulse>2.0x ATR",               dict(adx_min=45, min_impulse_mult=2.0)),
    ("ADX>45, impulse>2.5x ATR",               dict(adx_min=45, min_impulse_mult=2.5)),
    ("ADX>45, retrace<40%",                    dict(adx_min=45, max_retrace=0.40)),
    ("ADX>45, retrace<30%",                    dict(adx_min=45, max_retrace=0.30)),
    ("ADX>45, late session (14:00-16:00)",     dict(adx_min=45, session_filter='late')),
    ("ADX>45, early session (09:30-12:00)",    dict(adx_min=45, session_filter='early')),
    ("ADX>45, vol+impulse>2.0x",               dict(adx_min=45, require_vol_compress=True, min_impulse_mult=2.0)),
    ("ADX>45, vol+retrace<40%",                dict(adx_min=45, require_vol_compress=True, max_retrace=0.40)),
    ("ADX>45, impulse>2.0x+retrace<40%",       dict(adx_min=45, min_impulse_mult=2.0, max_retrace=0.40)),
    ("ADX>45, impulse>2.5x+retrace<40%",       dict(adx_min=45, min_impulse_mult=2.5, max_retrace=0.40)),
    ("ADX>45, all 3 filters (vol+2.0x+40%)",   dict(adx_min=45, require_vol_compress=True, min_impulse_mult=2.0, max_retrace=0.40)),
    ("ADX>40, vol+impulse>2.0x+retrace<40%",   dict(adx_min=40, require_vol_compress=True, min_impulse_mult=2.0, max_retrace=0.40)),
    ("ADX>35, vol+impulse>2.0x+retrace<40%",   dict(adx_min=35, require_vol_compress=True, min_impulse_mult=2.0, max_retrace=0.40)),
    ("ADX>50, vol+impulse>2.0x+retrace<40%",   dict(adx_min=50, require_vol_compress=True, min_impulse_mult=2.0, max_retrace=0.40)),
    ("ADX>45, RR=1.5, impulse>2.0x",           dict(adx_min=45, min_impulse_mult=2.0)),  # will test RR=1.5 separately
]

best_config = None
best_pf = 0
all_config_results = []

for label, kwargs in configs:
    rr_val = 1.5 if "RR=1.5" in label else 2.0
    idx, dirs, stops = flag_signals(mkt, **kwargs)
    if len(idx) == 0:
        print(f"  {label:<43} {'0':>5}")
        continue
    df = simulate_trades(mkt, idx, dirs, stops, rr=rr_val)
    s = stats_from_df(df)
    sig = "**" if s['p_value'] < 0.05 else ("*" if s['p_value'] < 0.10 else "")
    print(f"  {label:<43} {s['n']:>5} {s['pf']:>7.3f} {s['wr']:>7.1%} "
          f"{s['exp']:>9.2f} {s['p_value']:>8.4f}{sig}")
    all_config_results.append({'label': label, **s, 'df': df, 'kwargs': kwargs, 'rr': rr_val})
    if s['pf'] > best_pf and s['n'] >= 30:
        best_pf = s['pf']
        best_config = {'label': label, **s, 'df': df, 'kwargs': kwargs, 'rr': rr_val}

print("\n" + "="*70)
if best_config and best_config['pf'] >= 1.20:
    print(f"BEST CONFIGURATION (PF >= 1.20 THRESHOLD MET):")
    print(f"  {best_config['label']}")
    print(f"  N={best_config['n']} | PF={best_config['pf']:.3f} | WR={best_config['wr']:.1%} | "
          f"Exp=${best_config['exp']:.2f} | p={best_config['p_value']:.4f}")
elif best_config:
    print(f"BEST CONFIGURATION (below 1.20 threshold):")
    print(f"  {best_config['label']}")
    print(f"  N={best_config['n']} | PF={best_config['pf']:.3f} | WR={best_config['wr']:.1%} | "
          f"Exp=${best_config['exp']:.2f} | p={best_config['p_value']:.4f}")
    print(f"\n  NOTE: Best PF={best_config['pf']:.3f} is below the 1.20 promotion threshold.")
    print(f"  Flag Continuation does not meet the Atlas promotion criteria as currently defined.")
else:
    print("  NO CONFIGURATION MET MINIMUM SAMPLE SIZE (N>=30)")

# ─── Quarterly breakdown for best config ──────────────────────────────────────
if best_config and best_config['n'] >= 30:
    print("\n" + "─"*70)
    print("QUARTERLY BREAKDOWN — Best Configuration")
    df_b = best_config['df']
    df_b['quarter'] = df_b['year'].astype(str) + 'Q' + ((df_b['month']-1)//3+1).astype(str)
    for q, grp in df_b.groupby('quarter'):
        pnl = grp['net'].values
        pf_q = pnl[pnl>0].sum() / abs(pnl[pnl<0].sum()) if abs(pnl[pnl<0].sum()) > 0 else 0
        print(f"  {q}: N={len(grp)} | PF={pf_q:.3f} | Net=${pnl.sum():.0f}")

# ─── Charts ───────────────────────────────────────────────────────────────────
fig = plt.figure(figsize=(20, 14))
gs = gridspec.GridSpec(2, 2, figure=fig, hspace=0.40, wspace=0.35)
fig.suptitle('Sprint 042 — Model A2 Execution Engineering\nFlag Continuation Precision Filter Sweep | MNQ | $800 Risk/Trade',
             fontsize=13, fontweight='bold')

# 1. Equity curve comparison: baseline vs best
ax1 = fig.add_subplot(gs[0, :])
eq_base = s_base.get('equity', np.array([]))
if len(eq_base) > 5:
    ax1.plot(eq_base, color='#9E9E9E', lw=1.5, alpha=0.7, label=f'Baseline (ADX>45) PF={s_base["pf"]:.3f} N={s_base["n"]}')
if best_config and len(best_config.get('equity', [])) > 5:
    eq_best = best_config['equity']
    ax1.plot(eq_best, color='#2196F3', lw=2.5, label=f'Best: {best_config["label"][:40]} PF={best_config["pf"]:.3f} N={best_config["n"]}')
ax1.axhline(0, color='black', lw=0.5)
ax1.set_title('Equity Curves: Baseline vs Best Configuration', fontweight='bold')
ax1.set_xlabel('Trade'); ax1.set_ylabel('Cumulative P&L ($)')
ax1.legend(fontsize=9); ax1.grid(True, alpha=0.3)

# 2. Filter sweep PF bar chart
ax2 = fig.add_subplot(gs[1, 0])
valid = [r for r in all_config_results if r['n'] >= 20]
labels = [r['label'][:30] for r in valid]
pfs = [r['pf'] for r in valid]
colors_bar = ['#4CAF50' if p >= 1.2 else ('#FF9800' if p >= 1.0 else '#F44336') for p in pfs]
bars = ax2.barh(range(len(labels)), pfs, color=colors_bar, alpha=0.85)
ax2.axvline(1.0, color='red', lw=1.5, ls='--')
ax2.axvline(1.2, color='green', lw=1.0, ls=':')
ax2.set_yticks(range(len(labels))); ax2.set_yticklabels(labels, fontsize=7)
ax2.set_title('Profit Factor by Filter Configuration', fontweight='bold')
ax2.set_xlabel('Profit Factor'); ax2.grid(True, alpha=0.3, axis='x')

# 3. Sample size vs PF scatter
ax3 = fig.add_subplot(gs[1, 1])
ns_all  = [r['n'] for r in all_config_results if r['n'] >= 10]
pfs_all = [r['pf'] for r in all_config_results if r['n'] >= 10]
colors_sc = ['#4CAF50' if p >= 1.2 else ('#FF9800' if p >= 1.0 else '#F44336') for p in pfs_all]
ax3.scatter(ns_all, pfs_all, c=colors_sc, s=80, alpha=0.85, edgecolors='black', lw=0.5)
ax3.axhline(1.0, color='red', lw=1.5, ls='--')
ax3.axhline(1.2, color='green', lw=1.0, ls=':')
ax3.axvline(30, color='orange', lw=1.0, ls=':', label='N=30 minimum')
ax3.set_title('Sample Size vs Profit Factor', fontweight='bold')
ax3.set_xlabel('Trade Count'); ax3.set_ylabel('Profit Factor')
ax3.legend(fontsize=9); ax3.grid(True, alpha=0.3)

plt.savefig(f'{OUTPUT_DIR}/sprint_042_execution_engineering.png', dpi=150, bbox_inches='tight')
plt.close()
print(f"\nChart saved.")
print("=== EXECUTION ENGINEERING COMPLETE ===")
