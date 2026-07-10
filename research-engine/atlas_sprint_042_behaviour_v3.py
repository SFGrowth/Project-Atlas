"""
Atlas Sprint 042 — Model A2 Discovery: Behavioural Validation v3
Fully vectorised for speed. Tests three core hypotheses with ADX sweep.
"""
import pandas as pd
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import warnings, os
from scipy import stats
warnings.filterwarnings('ignore')

DATA_PATH   = '/home/ubuntu/Project-Atlas/data/raw/massive/MNQ_5min_full.csv'
OUTPUT_DIR  = '/home/ubuntu/Project-Atlas/research/sprint-042-charts'
os.makedirs(OUTPUT_DIR, exist_ok=True)

POINT_VALUE    = 2.0
COMMISSION     = 1.00
RISK_PER_TRADE = 800.0
RR             = 2.0

def ewm_np(arr, span):
    a = 2.0 / (span + 1)
    out = np.empty_like(arr, dtype=float)
    out[0] = arr[0]
    for i in range(1, len(arr)):
        out[i] = a * arr[i] + (1 - a) * out[i-1]
    return out

def rolling_max(arr, w):
    n = len(arr)
    out = np.empty(n); out[:] = np.nan
    for i in range(w-1, n):
        out[i] = arr[i-w+1:i+1].max()
    return out

def rolling_min(arr, w):
    n = len(arr)
    out = np.empty(n); out[:] = np.nan
    for i in range(w-1, n):
        out[i] = arr[i-w+1:i+1].min()
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

    return dict(hi=hi, lo=lo, cl=cl, n=n, hour=hour, minute=minute,
                year=year, month=month, atr5=atr5, atr14=atr14, atr20=atr20,
                adx=adx, trend_long=trend_long, trend_short=trend_short, is_rth=is_rth)

def simulate_trades_vectorised(mkt, signal_idx, directions, stop_pts_arr, rr=RR, max_bars=150):
    """Simulate all trades. signal_idx: array of bar indices. directions: +1/-1."""
    hi=mkt['hi']; lo=mkt['lo']; cl=mkt['cl']
    is_rth=mkt['is_rth']; n=mkt['n']
    trades = []
    used_until = -1
    for k in range(len(signal_idx)):
        i = signal_idx[k]
        if i <= used_until: continue
        d = directions[k]
        sp = stop_pts_arr[k]
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

def stats_from_df(df, label=""):
    if len(df) < 10:
        return dict(label=label, n=len(df), pf=0, wr=0, net=0, exp=0, p_value=1.0, max_dd=0, equity=np.array([]))
    pnl = df['net'].values
    wins = pnl[pnl>0]; loss = pnl[pnl<0]
    gw = wins.sum(); gl = abs(loss.sum())
    pf = gw/gl if gl>0 else 0
    wr = (pnl>0).mean()
    n_wins = int((pnl>0).sum())
    p_val = stats.binomtest(n_wins, len(pnl), 0.333, alternative='greater').pvalue
    eq = np.cumsum(pnl)
    max_dd = (eq - np.maximum.accumulate(eq)).min()
    return dict(label=label, n=len(pnl), pf=pf, wr=wr, net=pnl.sum(), exp=pnl.mean(),
                p_value=p_val, max_dd=max_dd, equity=eq)

# ─── Signal generators (vectorised) ──────────────────────────────────────────

def signals_micro_consol(mkt, adx_min=25, w=5, comp_ratio=0.75):
    """
    For each bar: check if the prior w bars all have range < comp_ratio * ATR14.
    Entry: current close breaks above/below the w-bar high/low.
    """
    hi=mkt['hi']; lo=mkt['lo']; cl=mkt['cl']
    atr14=mkt['atr14']; adx=mkt['adx']
    tl=mkt['trend_long']; ts=mkt['trend_short']; rth=mkt['is_rth']; n=mkt['n']

    idx=[]; dirs=[]; stops=[]
    for i in range(w+10, n-1):
        if not rth[i] or adx[i] < adx_min: continue
        avg = atr14[i]
        if avg <= 0: continue
        # Check all prior w bars are narrow
        ranges = hi[i-w:i] - lo[i-w:i]
        if not np.all(ranges < comp_ratio * avg): continue
        ch = hi[i-w:i].max()
        cl_ = lo[i-w:i].min()
        rng = ch - cl_
        if rng < 1.0: continue
        if tl[i] and cl[i] > ch:
            idx.append(i); dirs.append(1); stops.append(rng)
        elif ts[i] and cl[i] < cl_:
            idx.append(i); dirs.append(-1); stops.append(rng)
    return np.array(idx), np.array(dirs), np.array(stops)

def signals_vol_compress(mkt, adx_min=25, comp_ratio=0.65, comp_bars=3):
    """
    Current bar ATR5 >= comp_ratio*ATR20 (expansion), prior comp_bars bars all compressed.
    """
    hi=mkt['hi']; lo=mkt['lo']; cl=mkt['cl']
    atr5=mkt['atr5']; atr20=mkt['atr20']; adx=mkt['adx']
    tl=mkt['trend_long']; ts=mkt['trend_short']; rth=mkt['is_rth']; n=mkt['n']

    idx=[]; dirs=[]; stops=[]
    for i in range(comp_bars+10, n-1):
        if not rth[i] or adx[i] < adx_min: continue
        avg = atr20[i]
        if avg <= 0: continue
        if atr5[i] < comp_ratio * avg: continue  # current must be expansion
        # Prior comp_bars must all be compressed
        if not np.all(atr5[i-comp_bars:i] < comp_ratio * avg): continue
        zh = hi[i-comp_bars:i].max()
        zl = lo[i-comp_bars:i].min()
        zr = zh - zl
        if zr < 1.0: continue
        if tl[i] and cl[i] > zl:
            idx.append(i); dirs.append(1); stops.append(zr)
        elif ts[i] and cl[i] < zh:
            idx.append(i); dirs.append(-1); stops.append(zr)
    return np.array(idx), np.array(dirs), np.array(stops)

def signals_flag(mkt, adx_min=25, impulse_w=5, flag_w=8, max_retrace=0.50):
    """
    Impulse > 1.5*ATR14 in prior impulse_w bars.
    Current close breaks above/below flag_w-bar high/low.
    Retrace <= max_retrace of impulse.
    """
    hi=mkt['hi']; lo=mkt['lo']; cl=mkt['cl']
    atr14=mkt['atr14']; adx=mkt['adx']
    tl=mkt['trend_long']; ts=mkt['trend_short']; rth=mkt['is_rth']; n=mkt['n']

    idx=[]; dirs=[]; stops=[]
    for i in range(flag_w+impulse_w+10, n-1):
        if not rth[i] or adx[i] < adx_min: continue
        avg = atr14[i]
        if avg <= 0: continue
        # Impulse
        ihi = hi[i-impulse_w-flag_w:i-flag_w].max()
        ilo = lo[i-impulse_w-flag_w:i-flag_w].min()
        imp = ihi - ilo
        if imp < 1.5 * avg: continue
        # Flag zone
        fhi = hi[i-flag_w:i+1].max()
        flo = lo[i-flag_w:i+1].min()
        frange = fhi - flo
        if frange < 1.0: continue
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
print("Sprint 042 — Model A2 Discovery: Behavioural Validation v3")
print(f"Data: MNQ 5-min | Risk: ${RISK_PER_TRADE}/trade | RR: {RR}R")
print("="*70)

mkt = load_data()
print(f"Data: {mkt['n']} bars")

adx_levels = [20, 25, 30, 35, 40, 45]
hyps = [
    ("Micro-Consolidation", signals_micro_consol),
    ("Vol Compression",     signals_vol_compress),
    ("Flag Continuation",   signals_flag),
]

all_results = {}
for hname, sig_fn in hyps:
    print(f"\n{'─'*60}")
    print(f"  {hname} — ADX Regime Sweep")
    print(f"  {'ADX':>5} {'N':>5} {'PF':>7} {'WR':>7} {'Exp($)':>9} {'p-val':>8}")
    best = None
    sweep = []
    for adx_min in adx_levels:
        idx, dirs, stops = sig_fn(mkt, adx_min=adx_min)
        if len(idx) == 0:
            print(f"  >{adx_min:>4} {'0':>5} {'—':>7}")
            sweep.append(dict(adx_min=adx_min, n=0, pf=0, wr=0, exp=0, p_value=1.0))
            continue
        df = simulate_trades_vectorised(mkt, idx, dirs, stops)
        s = stats_from_df(df, f"{hname} ADX>{adx_min}")
        sig = "**" if s['p_value'] < 0.05 else ("*" if s['p_value'] < 0.10 else "")
        print(f"  >{adx_min:>4} {s['n']:>5} {s['pf']:>7.3f} {s['wr']:>7.1%} "
              f"{s['exp']:>9.2f} {s['p_value']:>8.4f}{sig}")
        sweep.append({**s, 'adx_min': adx_min, 'df': df})
        if best is None or s['pf'] > best['pf']:
            best = {**s, 'adx_min': adx_min, 'df': df}
    all_results[hname] = {'best': best, 'sweep': sweep}

# Summary
print("\n" + "="*70)
print("SUMMARY — BEST CONFIGURATION PER HYPOTHESIS")
print("="*70)
print(f"{'Hypothesis':<25} {'ADX':>5} {'N':>5} {'PF':>7} {'WR':>7} {'Exp($)':>9} {'p-val':>8}")
print("─"*70)
for hname, res in all_results.items():
    b = res['best']
    if b is None: print(f"  {hname:<23} — NO TRADES"); continue
    sig = "**" if b['p_value'] < 0.05 else ("*" if b['p_value'] < 0.10 else "")
    print(f"  {hname:<23} >{b['adx_min']:>4} {b['n']:>5} {b['pf']:>7.3f} {b['wr']:>7.1%} "
          f"{b['exp']:>9.2f} {b['p_value']:>8.4f}{sig}")

# ─── Charts ───────────────────────────────────────────────────────────────────
fig, axes = plt.subplots(2, 3, figsize=(20, 12))
fig.suptitle('Sprint 042 — Model A2 Discovery: Behavioural Validation v3\nMNQ | $800 Risk/Trade | ADX Regime Sweep',
             fontsize=13, fontweight='bold')

colors = ['#2196F3','#4CAF50','#FF9800']
for col_idx, (hname, res) in enumerate(all_results.items()):
    b = res['best']
    sweep = res['sweep']
    # Top row: equity curve for best config
    ax = axes[0, col_idx]
    if b and len(b.get('equity', [])) > 5:
        eq = b['equity']
        ax.plot(eq, color=colors[col_idx], lw=2)
        ax.axhline(0, color='black', lw=0.5)
        ax.fill_between(range(len(eq)), eq, 0, where=eq>0, alpha=0.15, color='green')
        ax.fill_between(range(len(eq)), eq, 0, where=eq<0, alpha=0.15, color='red')
        ax.set_title(f'{hname}\nADX>{b["adx_min"]} | PF={b["pf"]:.3f} | N={b["n"]}', fontweight='bold')
    else:
        ax.set_title(f'{hname}\nNo trades', fontweight='bold')
    ax.set_xlabel('Trade'); ax.set_ylabel('Cumulative P&L ($)'); ax.grid(True, alpha=0.3)
    # Bottom row: ADX sweep
    ax2 = axes[1, col_idx]
    valid = [s for s in sweep if s['n'] > 0]
    if valid:
        adxs = [str(s['adx_min']) for s in valid]
        pfs  = [s['pf'] for s in valid]
        ns   = [s['n'] for s in valid]
        ax2b = ax2.twinx()
        ax2.bar(adxs, pfs, color=colors[col_idx], alpha=0.7)
        ax2b.plot(adxs, ns, 'k--o', lw=1.5, ms=5)
        ax2.axhline(1.0, color='red', lw=1.5, ls='--')
        ax2.axhline(1.2, color='green', lw=1.0, ls=':')
        ax2.set_ylabel('Profit Factor', color=colors[col_idx])
        ax2b.set_ylabel('Trade Count')
    ax2.set_title(f'{hname} — ADX Sweep', fontweight='bold')
    ax2.set_xlabel('ADX Minimum'); ax2.grid(True, alpha=0.3, axis='y')

plt.tight_layout()
plt.savefig(f'{OUTPUT_DIR}/sprint_042_behaviour_v3.png', dpi=150, bbox_inches='tight')
plt.close()
print(f"\nChart saved: {OUTPUT_DIR}/sprint_042_behaviour_v3.png")
print("=== COMPLETE ===")
