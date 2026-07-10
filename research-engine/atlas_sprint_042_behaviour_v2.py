"""
Atlas Sprint 042 — Model A2 Discovery: Behavioural Validation v2
Revised with relaxed parameters and ADX regime sweep.
Focus: H-A2-01 (Micro-Consolidation) and H-A2-02 (Flag) with regime filtering.
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
RR_TEST        = 2.0

def ewm_fast(arr, span):
    alpha = 2.0 / (span + 1)
    result = np.empty_like(arr, dtype=float)
    result[0] = arr[0]
    for i in range(1, len(arr)):
        result[i] = alpha * arr[i] + (1 - alpha) * result[i - 1]
    return result

def load_data():
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
    date   = df['ts'].dt.date.values
    year   = df['ts'].dt.year.values
    month  = df['ts'].dt.month.values

    tr = np.maximum(hi - lo, np.maximum(np.abs(hi - np.roll(cl,1)), np.abs(lo - np.roll(cl,1))))
    tr[0] = hi[0] - lo[0]
    atr5  = ewm_fast(tr, 5)
    atr14 = ewm_fast(tr, 14)
    atr20 = ewm_fast(tr, 20)

    ema9  = ewm_fast(cl, 9)
    ema21 = ewm_fast(cl, 21)
    ema50 = ewm_fast(cl, 50)

    plus_dm  = np.where((hi-np.roll(hi,1))>(np.roll(lo,1)-lo), np.maximum(hi-np.roll(hi,1),0), 0)
    minus_dm = np.where((np.roll(lo,1)-lo)>(hi-np.roll(hi,1)), np.maximum(np.roll(lo,1)-lo,0), 0)
    plus_dm[0] = minus_dm[0] = 0
    plus_di14  = 100 * ewm_fast(plus_dm,14) / np.where(atr14>0, atr14, 1)
    minus_di14 = 100 * ewm_fast(minus_dm,14) / np.where(atr14>0, atr14, 1)
    di_sum = plus_di14 + minus_di14
    dx = np.where(di_sum>0, 100*np.abs(plus_di14-minus_di14)/di_sum, 0)
    adx = ewm_fast(dx, 14)

    trend_long  = (ema9 > ema21) & (ema21 > ema50)
    trend_short = (ema9 < ema21) & (ema21 < ema50)
    is_rth = ((hour == 9) & (minute >= 30)) | ((hour >= 10) & (hour <= 15))

    return dict(df=df, hi=hi, lo=lo, cl=cl, op=op, n=n,
                hour=hour, minute=minute, date=date, year=year, month=month,
                atr5=atr5, atr14=atr14, atr20=atr20,
                ema9=ema9, ema21=ema21, ema50=ema50, adx=adx,
                trend_long=trend_long, trend_short=trend_short, is_rth=is_rth)

def simulate_trade(mkt, i, d, stop_pts, rr=RR_TEST, max_bars=200):
    hi=mkt['hi']; lo=mkt['lo']; cl=mkt['cl']
    is_rth=mkt['is_rth']; n=mkt['n']
    entry = cl[i]
    stop  = entry - d * stop_pts
    tgt   = entry + d * stop_pts * rr
    n_c   = max(1, round(RISK_PER_TRADE / (stop_pts * POINT_VALUE)))
    for j in range(i+1, min(i+max_bars, n)):
        if not is_rth[j]:
            net = (cl[j-1]-entry)*POINT_VALUE*d*n_c - COMMISSION*2*n_c
            return dict(outcome='time_exit', net=net, bars=j-i, exit_price=cl[j-1])
        if d==1:
            if lo[j]<=stop: net=(stop-entry)*POINT_VALUE*d*n_c-COMMISSION*2*n_c; return dict(outcome='loss',net=net,bars=j-i,exit_price=stop)
            if hi[j]>=tgt:  net=(tgt-entry)*POINT_VALUE*d*n_c-COMMISSION*2*n_c;  return dict(outcome='win', net=net,bars=j-i,exit_price=tgt)
        else:
            if hi[j]>=stop: net=(stop-entry)*POINT_VALUE*d*n_c-COMMISSION*2*n_c; return dict(outcome='loss',net=net,bars=j-i,exit_price=stop)
            if lo[j]<=tgt:  net=(tgt-entry)*POINT_VALUE*d*n_c-COMMISSION*2*n_c;  return dict(outcome='win', net=net,bars=j-i,exit_price=tgt)
    return None

def compute_stats(trades_df, label):
    if len(trades_df) < 10:
        return dict(label=label, n=len(trades_df), pf=0, wr=0, net=0, exp=0, p_value=1.0, max_dd=0, equity=np.array([]))
    pnl = trades_df['net'].values
    wins = pnl[pnl>0]; loss = pnl[pnl<0]
    gw = wins.sum(); gl = abs(loss.sum())
    pf = gw/gl if gl>0 else 0
    wr = (pnl>0).mean()
    net = pnl.sum()
    exp = pnl.mean()
    n_wins = int((pnl>0).sum())
    p_val = stats.binomtest(n_wins, len(pnl), 0.333, alternative='greater').pvalue
    eq = np.cumsum(pnl)
    max_dd = (eq - np.maximum.accumulate(eq)).min()
    return dict(label=label, n=len(pnl), pf=pf, wr=wr, net=net, exp=exp,
                p_value=p_val, max_dd=max_dd, equity=eq)

# ─── H-A2-01 v2: Relaxed Micro-Consolidation ──────────────────────────────────
def test_micro_consol(mkt, adx_min=25, clen_min=2, clen_max=10, comp_ratio=0.75):
    """
    Relaxed: comp_ratio 0.75 (was 0.60), clen_min=2 (was 3).
    Consolidation = N bars where the bar range < comp_ratio * ATR14.
    Entry: close breaks above consol_hi (long) or below consol_lo (short).
    """
    hi=mkt['hi']; lo=mkt['lo']; cl=mkt['cl']
    atr14=mkt['atr14']; adx=mkt['adx']
    trend_long=mkt['trend_long']; trend_short=mkt['trend_short']
    is_rth=mkt['is_rth']; n=mkt['n']
    trades = []
    i = 60
    while i < n - 1:
        if not is_rth[i] or adx[i] < adx_min: i+=1; continue
        avg_atr = atr14[i]
        if avg_atr <= 0: i+=1; continue
        # Count consecutive narrow bars ending at i-1
        for clen in range(clen_max, clen_min-1, -1):
            if i - clen < 10: break
            # All bars in window must have range < comp_ratio * ATR14
            ok = all((hi[j]-lo[j]) < comp_ratio * avg_atr for j in range(i-clen, i))
            if not ok: continue
            consol_hi = hi[i-clen:i].max()
            consol_lo = lo[i-clen:i].min()
            consol_range = consol_hi - consol_lo
            if consol_range < 1.0: break
            # Long breakout
            if bool(trend_long[i]) and cl[i] > consol_hi:
                result = simulate_trade(mkt, i, 1, consol_range)
                if result:
                    trades.append({**result, 'adx':adx[i], 'year':mkt['year'][i],
                                   'month':mkt['month'][i], 'date':mkt['date'][i], 'dir':1})
                i += result['bars'] if result else 1
                break
            elif bool(trend_short[i]) and cl[i] < consol_lo:
                result = simulate_trade(mkt, i, -1, consol_range)
                if result:
                    trades.append({**result, 'adx':adx[i], 'year':mkt['year'][i],
                                   'month':mkt['month'][i], 'date':mkt['date'][i], 'dir':-1})
                i += result['bars'] if result else 1
                break
            else:
                break
        else:
            i += 1
            continue
    return pd.DataFrame(trades)

# ─── H-A2-02 v2: Flag with ADX regime filtering ───────────────────────────────
def test_flag_filtered(mkt, adx_min=25, adx_max=60, flag_bars=8, max_retrace=0.50):
    """
    Flag continuation with ADX band filtering.
    Impulse = 5-bar move > 1.5 * ATR14.
    Flag = up to flag_bars bars counter-trend, retracing <= max_retrace of impulse.
    Entry: close breaks above flag high (long) or below flag low (short).
    """
    hi=mkt['hi']; lo=mkt['lo']; cl=mkt['cl']
    atr14=mkt['atr14']; adx=mkt['adx']
    trend_long=mkt['trend_long']; trend_short=mkt['trend_short']
    is_rth=mkt['is_rth']; n=mkt['n']
    trades = []
    i = 60
    while i < n - 1:
        if not is_rth[i]: i+=1; continue
        if adx[i] < adx_min or adx[i] > adx_max: i+=1; continue
        avg_atr = atr14[i]
        if avg_atr <= 0: i+=1; continue
        # Impulse: 5-bar move
        impulse_hi = hi[max(0,i-5):i].max()
        impulse_lo = lo[max(0,i-5):i].min()
        impulse_range = impulse_hi - impulse_lo
        if impulse_range < 1.5 * avg_atr: i+=1; continue
        # Long: impulse up, flag = pullback
        if bool(trend_long[i]):
            # Flag high = recent high before pullback
            flag_hi = hi[max(0,i-flag_bars):i+1].max()
            flag_lo = lo[max(0,i-flag_bars):i+1].min()
            retrace = (flag_hi - cl[i]) / impulse_range if impulse_range > 0 else 1
            if retrace > max_retrace: i+=1; continue
            if cl[i] > flag_hi * 0.998:
                stop_pts = cl[i] - flag_lo
                if stop_pts < 1.0 or stop_pts > avg_atr * 5: i+=1; continue
                result = simulate_trade(mkt, i, 1, stop_pts)
                if result:
                    trades.append({**result, 'adx':adx[i], 'year':mkt['year'][i],
                                   'month':mkt['month'][i], 'date':mkt['date'][i], 'dir':1})
                i += result['bars'] if result else 1
                continue
        elif bool(trend_short[i]):
            flag_hi = hi[max(0,i-flag_bars):i+1].max()
            flag_lo = lo[max(0,i-flag_bars):i+1].min()
            retrace = (cl[i] - flag_lo) / impulse_range if impulse_range > 0 else 1
            if retrace > max_retrace: i+=1; continue
            if cl[i] < flag_lo * 1.002:
                stop_pts = flag_hi - cl[i]
                if stop_pts < 1.0 or stop_pts > avg_atr * 5: i+=1; continue
                result = simulate_trade(mkt, i, -1, stop_pts)
                if result:
                    trades.append({**result, 'adx':adx[i], 'year':mkt['year'][i],
                                   'month':mkt['month'][i], 'date':mkt['date'][i], 'dir':-1})
                i += result['bars'] if result else 1
                continue
        i += 1
    return pd.DataFrame(trades)

# ─── H-A2-05 v2: Volatility Compression Inside Trend (relaxed) ────────────────
def test_vol_compress(mkt, adx_min=25, comp_ratio=0.65, comp_bars=3):
    """
    Relaxed: comp_ratio=0.65 (was 0.50), comp_bars=3 (was 5).
    ATR5 < comp_ratio * ATR20 for comp_bars consecutive bars.
    Entry: bar after compression ends (ATR5 expands), in trend direction.
    Stop: range of compression zone.
    """
    hi=mkt['hi']; lo=mkt['lo']; cl=mkt['cl']
    atr5=mkt['atr5']; atr20=mkt['atr20']; adx=mkt['adx']
    trend_long=mkt['trend_long']; trend_short=mkt['trend_short']
    is_rth=mkt['is_rth']; n=mkt['n']
    trades = []
    i = 60
    while i < n - 1:
        if not is_rth[i] or adx[i] < adx_min: i+=1; continue
        avg_atr = atr20[i]
        if avg_atr <= 0: i+=1; continue
        # Current bar must be expansion
        if atr5[i] < comp_ratio * avg_atr: i+=1; continue
        # Count consecutive compressed bars ending at i-1
        count = 0
        for k in range(i-1, max(i-20, 0), -1):
            if atr5[k] < comp_ratio * avg_atr: count += 1
            else: break
        if count < comp_bars: i+=1; continue
        zone_start = i - count
        zone_hi = hi[zone_start:i].max()
        zone_lo = lo[zone_start:i].min()
        zone_range = zone_hi - zone_lo
        if zone_range < 1.0: i+=1; continue
        if bool(trend_long[i]) and cl[i] > zone_lo:
            result = simulate_trade(mkt, i, 1, zone_range)
            if result:
                trades.append({**result, 'adx':adx[i], 'year':mkt['year'][i],
                               'month':mkt['month'][i], 'date':mkt['date'][i], 'dir':1})
            i += result['bars'] if result else 1
        elif bool(trend_short[i]) and cl[i] < zone_hi:
            result = simulate_trade(mkt, i, -1, zone_range)
            if result:
                trades.append({**result, 'adx':adx[i], 'year':mkt['year'][i],
                               'month':mkt['month'][i], 'date':mkt['date'][i], 'dir':-1})
            i += result['bars'] if result else 1
        else:
            i += 1
    return pd.DataFrame(trades)

# ─── ADX Regime Sweep for best hypothesis ─────────────────────────────────────
def adx_regime_sweep(mkt, test_fn, adx_levels, label):
    print(f"\n  ADX Regime Sweep: {label}")
    print(f"  {'ADX Min':>8} {'N':>5} {'PF':>7} {'WR':>7} {'Exp($)':>9} {'p-val':>8}")
    best = None
    for adx_min in adx_levels:
        df = test_fn(mkt, adx_min=adx_min)
        s = compute_stats(df, f"{label} ADX>{adx_min}")
        sig = "**" if s['p_value'] < 0.05 else ("*" if s['p_value'] < 0.10 else "")
        print(f"  ADX>{adx_min:>5} {s['n']:>5} {s['pf']:>7.3f} {s['wr']:>7.1%} "
              f"{s['exp']:>9.2f} {s['p_value']:>8.4f}{sig}")
        if best is None or s['pf'] > best['pf']:
            best = {**s, 'df': df, 'adx_min': adx_min}
    return best

# ─── Main ─────────────────────────────────────────────────────────────────────
print("="*70)
print("Sprint 042 — Model A2 Discovery: Behavioural Validation v2")
print(f"Data: MNQ 5-min | Risk: ${RISK_PER_TRADE}/trade | RR: {RR_TEST}R")
print("="*70)

mkt = load_data()
print(f"Data: {mkt['n']} bars, {mkt['df']['ts'].iloc[0].date()} to {mkt['df']['ts'].iloc[-1].date()}")

# Primary tests
print("\n" + "─"*70)
print("PRIMARY BEHAVIOURAL TESTS")
print("─"*70)

tests_v2 = [
    ("H-A2-01 v2: Micro-Consolidation (relaxed)", test_micro_consol(mkt)),
    ("H-A2-05 v2: Vol Compression (relaxed)",     test_vol_compress(mkt)),
    ("H-A2-02 v2: Flag (filtered)",               test_flag_filtered(mkt)),
]

print(f"\n{'Hypothesis':<44} {'N':>5} {'PF':>7} {'WR':>7} {'Exp($)':>9} {'p-val':>8}")
print("─"*70)

primary_results = {}
for name, df in tests_v2:
    s = compute_stats(df, name)
    primary_results[name] = {'df': df, 'stats': s}
    sig = "**" if s['p_value'] < 0.05 else ("*" if s['p_value'] < 0.10 else "")
    print(f"{name:<44} {s['n']:>5} {s['pf']:>7.3f} {s['wr']:>7.1%} "
          f"{s['exp']:>9.2f} {s['p_value']:>8.4f}{sig}")

# ADX regime sweeps for the most promising hypotheses
print("\n" + "─"*70)
print("ADX REGIME SWEEP — Finding optimal regime filter")
print("─"*70)

adx_levels = [20, 25, 30, 35, 40, 45]

best_mc = adx_regime_sweep(mkt, test_micro_consol, adx_levels, "Micro-Consolidation")
best_vc = adx_regime_sweep(mkt, test_vol_compress,  adx_levels, "Vol Compression")
best_fl = adx_regime_sweep(mkt, test_flag_filtered, adx_levels, "Flag Filtered")

print("\n" + "─"*70)
print("BEST CONFIGURATION PER HYPOTHESIS")
print("─"*70)
for name, best in [("Micro-Consolidation", best_mc), ("Vol Compression", best_vc), ("Flag", best_fl)]:
    print(f"  {name}: ADX>{best['adx_min']} | PF={best['pf']:.3f} | N={best['n']} | "
          f"WR={best['wr']:.1%} | p={best['p_value']:.4f}")

# ─── Charts ───────────────────────────────────────────────────────────────────
fig, axes = plt.subplots(2, 3, figsize=(20, 12))
fig.suptitle('Sprint 042 — Model A2 Discovery: Behavioural Validation v2\nMNQ | $800 Risk/Trade | ADX Regime Sweep',
             fontsize=13, fontweight='bold')

colors = ['#2196F3','#4CAF50','#FF9800']
names_short = ['Micro-Consol', 'Vol Compress', 'Flag']
bests = [best_mc, best_vc, best_fl]

# Top row: equity curves for best ADX config
for ax, best, col, nm in zip(axes[0], bests, colors, names_short):
    eq = best.get('equity', np.array([]))
    if len(eq) > 5:
        ax.plot(eq, color=col, lw=2)
        ax.axhline(0, color='black', lw=0.5)
        ax.fill_between(range(len(eq)), eq, 0, where=eq>0, alpha=0.15, color='green')
        ax.fill_between(range(len(eq)), eq, 0, where=eq<0, alpha=0.15, color='red')
    ax.set_title(f'{nm}\nADX>{best["adx_min"]} | PF={best["pf"]:.3f} | N={best["n"]}', fontweight='bold')
    ax.set_xlabel('Trade'); ax.set_ylabel('Cumulative P&L ($)')
    ax.grid(True, alpha=0.3)

# Bottom row: ADX sweep PF charts
for ax, test_fn, col, nm in zip(axes[1],
    [test_micro_consol, test_vol_compress, test_flag_filtered], colors, names_short):
    pfs = []
    ns  = []
    for adx_min in adx_levels:
        df = test_fn(mkt, adx_min=adx_min)
        s = compute_stats(df, nm)
        pfs.append(s['pf'])
        ns.append(s['n'])
    ax2 = ax.twinx()
    ax.bar([str(a) for a in adx_levels], pfs, color=col, alpha=0.7)
    ax2.plot([str(a) for a in adx_levels], ns, 'k--o', lw=1.5, ms=5)
    ax.axhline(1.0, color='red', lw=1.5, ls='--')
    ax.axhline(1.2, color='green', lw=1.0, ls=':')
    ax.set_title(f'{nm} — ADX Regime Sweep', fontweight='bold')
    ax.set_xlabel('ADX Minimum'); ax.set_ylabel('Profit Factor', color=col)
    ax2.set_ylabel('Trade Count', color='black')
    ax.grid(True, alpha=0.3, axis='y')

plt.tight_layout()
plt.savefig(f'{OUTPUT_DIR}/sprint_042_behaviour_v2.png', dpi=150, bbox_inches='tight')
plt.close()
print(f"\nChart saved.")
print("\n=== BEHAVIOURAL VALIDATION v2 COMPLETE ===")
