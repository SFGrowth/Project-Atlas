"""
Atlas Sprint 050 — H-B-RT01: ADX Extreme Sub-Regime Analysis
Research Question: Do extreme ADX regimes (ADX > 60) materially improve
the expectancy of Model A2 and Model A3?
$800 risk per trade. Frozen model parameters.
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

DATA_PATH  = '/home/ubuntu/Project-Atlas/data/raw/massive/MNQ_5min_full.csv'
OUTPUT_DIR = '/home/ubuntu/Project-Atlas/research/sprint-050-charts'
os.makedirs(OUTPUT_DIR, exist_ok=True)

POINT_VALUE    = 2.0
COMMISSION     = 1.00
BASE_RISK      = 800.0

# ─── Helpers ──────────────────────────────────────────────────────────────────
def ewm_np(arr, span):
    a = 2.0 / (span + 1)
    out = np.empty_like(arr, dtype=float)
    out[0] = arr[0]
    for i in range(1, len(arr)):
        out[i] = a * arr[i] + (1 - a) * out[i-1]
    return out

def metrics(pnl_arr):
    if len(pnl_arr) < 5:
        return dict(n=len(pnl_arr), pf=0, wr=0, net=0, exp=0, p=1.0, max_dd=0)
    wins = pnl_arr[pnl_arr > 0]; loss = pnl_arr[pnl_arr < 0]
    gw = wins.sum(); gl = abs(loss.sum())
    pf = gw / gl if gl > 0 else 0
    wr = (pnl_arr > 0).mean()
    n_wins = int((pnl_arr > 0).sum())
    p = stats.binomtest(n_wins, len(pnl_arr), 0.333, alternative='greater').pvalue
    eq = np.cumsum(pnl_arr)
    max_dd = (eq - np.maximum.accumulate(eq)).min()
    return dict(n=len(pnl_arr), pf=pf, wr=wr, net=pnl_arr.sum(),
                exp=pnl_arr.mean(), p=p, max_dd=max_dd)

def monte_carlo(pnl_arr, n_sim=5000, daily_limit=-800, max_dd_limit=-2000,
                profit_target=3000, seed=42):
    rng = np.random.default_rng(seed)
    passes = 0
    for _ in range(n_sim):
        eq = 0.0; daily_eq = 0.0; max_eq = 0.0; failed = False
        sample = rng.choice(pnl_arr, size=len(pnl_arr), replace=True)
        for pnl in sample:
            eq += pnl; daily_eq += pnl
            max_eq = max(max_eq, eq)
            if daily_eq <= daily_limit:
                failed = True; break
            if eq - max_eq <= max_dd_limit:
                failed = True; break
            if eq >= profit_target:
                passes += 1; break
        if not failed and eq < profit_target:
            pass
    return passes / n_sim

# ─── Data Loading ─────────────────────────────────────────────────────────────
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
    time_val = hour * 60 + minute
    is_late_rth = (time_val >= 840) & (time_val < 960)
    is_overnight = (time_val >= 1200) | (time_val < 570)

    return dict(hi=hi, lo=lo, cl=cl, n=n, hour=hour, minute=minute,
                year=year, month=month, atr5=atr5, atr14=atr14, atr20=atr20,
                adx=adx, trend_long=trend_long, trend_short=trend_short,
                is_rth=is_rth, is_late_rth=is_late_rth, is_overnight=is_overnight)

# ─── Model A2: Flag Continuation (exact Sprint 042 validated logic) ───────────
def run_model_a2(mkt, adx_min=45, flag_w=8, impulse_w=5, max_retrace=0.50, rr=2.0):
    hi=mkt['hi']; lo=mkt['lo']; cl=mkt['cl']
    atr5=mkt['atr5']; atr14=mkt['atr14']; adx=mkt['adx']
    tl=mkt['trend_long']; ts=mkt['trend_short']
    rth=mkt['is_rth']; late=mkt['is_late_rth']; n=mkt['n']

    trades = []
    used_until = -1
    for i in range(flag_w + impulse_w + 10, n - 1):
        if i <= used_until: continue
        if not rth[i] or not late[i]: continue
        if adx[i] < adx_min: continue
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
        # Entry logic
        if tl[i]:
            retrace = (fhi - cl[i]) / imp if imp > 0 else 1
            if retrace > max_retrace: continue
            if cl[i] > fhi * 0.998:
                sp = cl[i] - flo
                if 1.0 <= sp <= avg * 5:
                    entry = cl[i]; stop = entry - sp; tgt = entry + sp * rr
                    n_c = max(1, round(BASE_RISK / (sp * POINT_VALUE)))
                    outcome = None
                    for j in range(i+1, min(i+150, n)):
                        if not rth[j]:
                            net = (cl[j-1]-entry)*POINT_VALUE*n_c - COMMISSION*2*n_c
                            outcome = dict(net=net, adx_entry=adx[i],
                                           year=mkt['year'][i], month=mkt['month'][i])
                            break
                        if lo[j] <= stop:
                            net = (stop-entry)*POINT_VALUE*n_c - COMMISSION*2*n_c
                            outcome = dict(net=net, adx_entry=adx[i],
                                           year=mkt['year'][i], month=mkt['month'][i])
                            break
                        if hi[j] >= tgt:
                            net = (tgt-entry)*POINT_VALUE*n_c - COMMISSION*2*n_c
                            outcome = dict(net=net, adx_entry=adx[i],
                                           year=mkt['year'][i], month=mkt['month'][i])
                            break
                    if outcome:
                        trades.append(outcome)
                        used_until = i + 150
        elif ts[i]:
            retrace = (cl[i] - flo) / imp if imp > 0 else 1
            if retrace > max_retrace: continue
            if cl[i] < flo * 1.002:
                sp = fhi - cl[i]
                if 1.0 <= sp <= avg * 5:
                    entry = cl[i]; stop = entry + sp; tgt = entry - sp * rr
                    n_c = max(1, round(BASE_RISK / (sp * POINT_VALUE)))
                    outcome = None
                    for j in range(i+1, min(i+150, n)):
                        if not rth[j]:
                            net = (entry-cl[j-1])*POINT_VALUE*n_c - COMMISSION*2*n_c
                            outcome = dict(net=net, adx_entry=adx[i],
                                           year=mkt['year'][i], month=mkt['month'][i])
                            break
                        if hi[j] >= stop:
                            net = (entry-stop)*POINT_VALUE*n_c - COMMISSION*2*n_c
                            outcome = dict(net=net, adx_entry=adx[i],
                                           year=mkt['year'][i], month=mkt['month'][i])
                            break
                        if lo[j] <= tgt:
                            net = (entry-tgt)*POINT_VALUE*n_c - COMMISSION*2*n_c
                            outcome = dict(net=net, adx_entry=adx[i],
                                           year=mkt['year'][i], month=mkt['month'][i])
                            break
                    if outcome:
                        trades.append(outcome)
                        used_until = i + 150
    return pd.DataFrame(trades)

# ─── Model A3: Overnight Volatility Contraction Breakout (Sprint 037 logic) ───
def run_model_a3(mkt, adx_min=25, compress_bars=12, compress_ratio=0.70, rr=2.5):
    hi=mkt['hi']; lo=mkt['lo']; cl=mkt['cl']
    atr14=mkt['atr14']; atr20=mkt['atr20']; adx=mkt['adx']
    overnight=mkt['is_overnight']; rth=mkt['is_rth']; n=mkt['n']

    trades = []
    used_until = -1
    for i in range(compress_bars + 20, n - 1):
        if i <= used_until: continue
        if not overnight[i]: continue
        if adx[i] < adx_min: continue
        avg20 = atr20[i]
        if avg20 <= 0: continue
        # Compression: recent ATR14 must be below ratio of longer ATR
        if atr14[i] > compress_ratio * avg20: continue
        # Range compression over compress_bars
        recent_hi = hi[i-compress_bars:i+1].max()
        recent_lo = lo[i-compress_bars:i+1].min()
        compress_range = recent_hi - recent_lo
        if compress_range > 1.5 * atr14[i]: continue
        # Breakout entry
        entry = cl[i]
        # Direction: with-trend (use recent momentum)
        momentum = cl[i] - cl[i-compress_bars]
        if momentum == 0: continue
        d = 1 if momentum > 0 else -1
        sp = max(compress_range, atr14[i] * 0.5)
        if sp < 1.0: continue
        tgt_pts = sp * rr
        n_c = max(1, round(BASE_RISK / (sp * POINT_VALUE)))
        stop = entry - d * sp
        tgt  = entry + d * tgt_pts
        outcome = None
        for j in range(i+1, min(i+200, n)):
            if rth[j]:  # session end
                net = (cl[j-1]-entry)*POINT_VALUE*d*n_c - COMMISSION*2*n_c
                outcome = dict(net=net, adx_entry=adx[i],
                               year=mkt['year'][i], month=mkt['month'][i])
                break
            if d == 1:
                if lo[j] <= stop:
                    net = (stop-entry)*POINT_VALUE*n_c - COMMISSION*2*n_c
                    outcome = dict(net=net, adx_entry=adx[i],
                                   year=mkt['year'][i], month=mkt['month'][i]); break
                if hi[j] >= tgt:
                    net = (tgt-entry)*POINT_VALUE*n_c - COMMISSION*2*n_c
                    outcome = dict(net=net, adx_entry=adx[i],
                                   year=mkt['year'][i], month=mkt['month'][i]); break
            else:
                if hi[j] >= stop:
                    net = (entry-stop)*POINT_VALUE*n_c - COMMISSION*2*n_c
                    outcome = dict(net=net, adx_entry=adx[i],
                                   year=mkt['year'][i], month=mkt['month'][i]); break
                if lo[j] <= tgt:
                    net = (entry-tgt)*POINT_VALUE*n_c - COMMISSION*2*n_c
                    outcome = dict(net=net, adx_entry=adx[i],
                                   year=mkt['year'][i], month=mkt['month'][i]); break
        if outcome:
            trades.append(outcome)
            used_until = i + 200
    return pd.DataFrame(trades)

# ─── ADX Regime Segmentation ──────────────────────────────────────────────────
def segment_by_adx(df, bands):
    """Return dict of {label: pnl_array} for each ADX band."""
    result = {}
    for label, lo_adx, hi_adx in bands:
        mask = (df['adx_entry'] >= lo_adx) & (df['adx_entry'] < hi_adx)
        result[label] = df[mask]['net'].values
    return result

# ─── ARI Integration Test ─────────────────────────────────────────────────────
def test_ari_adx_scaling(a2_df, a3_df, adx_threshold=60, scale_factor=1.5):
    """Test dynamic risk scaling when ADX > threshold."""
    all_trades = pd.concat([a2_df, a3_df]).sort_values('year').reset_index(drop=True)
    if len(all_trades) == 0:
        return None
    # Static: use base net P&L
    static_pnl = all_trades['net'].values
    # Dynamic: scale up trades where ADX > threshold
    dynamic_pnl = all_trades['net'].values.copy()
    high_adx_mask = all_trades['adx_entry'] >= adx_threshold
    dynamic_pnl[high_adx_mask] *= scale_factor
    return static_pnl, dynamic_pnl, high_adx_mask.sum()

# ─── Main ─────────────────────────────────────────────────────────────────────
print("=" * 70)
print("Sprint 050 — H-B-RT01: ADX Extreme Sub-Regime Analysis")
print("=" * 70)

print("\nLoading MNQ data...")
mkt = load_data()
n = mkt['n']
print(f"  Bars loaded: {n:,}  |  Date range: "
      f"{pd.to_datetime(mkt['year'][0]*10000+mkt['month'][0]*100+1, format='%Y%m%d').strftime('%Y-%m')} to "
      f"{pd.to_datetime(mkt['year'][-1]*10000+mkt['month'][-1]*100+1, format='%Y%m%d').strftime('%Y-%m')}")

print("\nRunning Model A2 (Flag Continuation, ADX >= 45, Late PM)...")
a2_df = run_model_a2(mkt)
print(f"  Total A2 trades: {len(a2_df)}")

print("\nRunning Model A3 (Overnight Compression Breakout, ADX >= 25)...")
a3_df = run_model_a3(mkt)
print(f"  Total A3 trades: {len(a3_df)}")

# ─── ADX Regime Segmentation ──────────────────────────────────────────────────
print("\n" + "=" * 70)
print("ADX REGIME SEGMENTATION")
print("=" * 70)

bands = [
    ("ADX < 45",    0,  45),
    ("ADX 45–60",  45,  60),
    ("ADX > 60",   60, 999),
]

for model_name, df in [("Model A2", a2_df), ("Model A3", a3_df)]:
    if len(df) == 0:
        print(f"\n{model_name}: No trades generated.")
        continue
    print(f"\n{model_name} — ADX Distribution:")
    print(f"  ADX range: {df['adx_entry'].min():.1f} – {df['adx_entry'].max():.1f}")
    print(f"  {'Band':<15} {'N':>5} {'PF':>7} {'WR':>7} {'Exp':>9} {'Net P&L':>12} {'p-value':>9}")
    print(f"  {'-'*70}")
    segs = segment_by_adx(df, bands)
    for label, pnl in segs.items():
        if len(pnl) < 3:
            print(f"  {label:<15} {'<3 trades — insufficient':>50}")
            continue
        m = metrics(pnl)
        print(f"  {label:<15} {m['n']:>5} {m['pf']:>7.3f} {m['wr']:>7.1%} "
              f"{m['exp']:>9.2f} {m['net']:>12,.2f} {m['p']:>9.4f}")

# ─── Full baseline metrics ─────────────────────────────────────────────────────
print("\n" + "=" * 70)
print("FULL BASELINE (ALL ADX LEVELS)")
print("=" * 70)
for model_name, df in [("Model A2", a2_df), ("Model A3", a3_df)]:
    if len(df) == 0:
        print(f"\n{model_name}: No trades.")
        continue
    m = metrics(df['net'].values)
    mc = monte_carlo(df['net'].values)
    print(f"\n{model_name}:")
    print(f"  N={m['n']}  PF={m['pf']:.3f}  WR={m['wr']:.1%}  "
          f"Exp=${m['exp']:.2f}  Net=${m['net']:,.2f}  MaxDD=${m['max_dd']:,.2f}")
    print(f"  p-value={m['p']:.4f}  MC Pass Rate={mc:.1%}")

# ─── ADX > 60 Deep Dive ───────────────────────────────────────────────────────
print("\n" + "=" * 70)
print("ADX > 60 DEEP DIVE — PARAMETER STABILITY & YEAR-BY-YEAR")
print("=" * 70)

for model_name, df in [("Model A2", a2_df), ("Model A3", a3_df)]:
    if len(df) == 0:
        continue
    high_df = df[df['adx_entry'] >= 60]
    print(f"\n{model_name} — ADX > 60 sub-regime:")
    if len(high_df) < 5:
        print(f"  Insufficient trades ({len(high_df)}) — REJECTED (sample too small)")
        continue
    m = metrics(high_df['net'].values)
    mc = monte_carlo(high_df['net'].values)
    print(f"  N={m['n']}  PF={m['pf']:.3f}  WR={m['wr']:.1%}  "
          f"Exp=${m['exp']:.2f}  Net=${m['net']:,.2f}  MaxDD=${m['max_dd']:,.2f}")
    print(f"  p-value={m['p']:.4f}  MC Pass Rate={mc:.1%}")
    # Year-by-year
    print(f"  Year-by-year:")
    for yr in sorted(high_df['year'].unique()):
        yr_pnl = high_df[high_df['year']==yr]['net'].values
        if len(yr_pnl) < 2:
            print(f"    {yr}: {len(yr_pnl)} trade(s) — insufficient")
            continue
        ym = metrics(yr_pnl)
        print(f"    {yr}: N={ym['n']}  PF={ym['pf']:.3f}  Net=${ym['net']:,.2f}")

# ─── ADX Threshold Sensitivity ────────────────────────────────────────────────
print("\n" + "=" * 70)
print("ADX THRESHOLD SENSITIVITY (A3 — most trades)")
print("=" * 70)
if len(a3_df) > 0:
    print(f"  {'Threshold':<12} {'N':>5} {'PF':>7} {'WR':>7} {'Net P&L':>12}")
    print(f"  {'-'*50}")
    for thresh in [25, 30, 35, 40, 45, 50, 55, 60, 65]:
        sub = a3_df[a3_df['adx_entry'] >= thresh]['net'].values
        if len(sub) < 3:
            print(f"  ADX >= {thresh:<6} {'<3 trades':>40}")
            continue
        m = metrics(sub)
        print(f"  ADX >= {thresh:<6} {m['n']:>5} {m['pf']:>7.3f} {m['wr']:>7.1%} {m['net']:>12,.2f}")

# ─── ARI Integration Test ─────────────────────────────────────────────────────
print("\n" + "=" * 70)
print("ARI INTEGRATION — ADX SCALING TEST")
print("=" * 70)
if len(a2_df) > 0 and len(a3_df) > 0:
    result = test_ari_adx_scaling(a2_df, a3_df, adx_threshold=60, scale_factor=1.5)
    if result:
        static_pnl, dynamic_pnl, n_scaled = result
        sm = metrics(static_pnl)
        dm = metrics(dynamic_pnl)
        smc = monte_carlo(static_pnl)
        dmc = monte_carlo(dynamic_pnl)
        print(f"\n  Trades scaled (ADX > 60): {n_scaled} / {len(static_pnl)}")
        print(f"\n  {'Metric':<20} {'Static':>12} {'ADX-Scaled':>12} {'Change':>10}")
        print(f"  {'-'*58}")
        print(f"  {'Profit Factor':<20} {sm['pf']:>12.3f} {dm['pf']:>12.3f} "
              f"  {(dm['pf']-sm['pf'])/sm['pf']:>+8.1%}")
        print(f"  {'Net P&L':<20} {sm['net']:>12,.2f} {dm['net']:>12,.2f} "
              f"  {(dm['net']-sm['net'])/abs(sm['net']):>+8.1%}")
        print(f"  {'Max Drawdown':<20} {sm['max_dd']:>12,.2f} {dm['max_dd']:>12,.2f} "
              f"  {(dm['max_dd']-sm['max_dd'])/abs(sm['max_dd']):>+8.1%}")
        print(f"  {'MC Pass Rate':<20} {smc:>12.1%} {dmc:>12.1%} "
              f"  {(dmc-smc):>+8.1%}")

# ─── Visualisation ────────────────────────────────────────────────────────────
fig = plt.figure(figsize=(18, 14))
fig.suptitle('Sprint 050 — H-B-RT01: ADX Extreme Sub-Regime Analysis', fontsize=14, fontweight='bold')
gs = gridspec.GridSpec(3, 3, figure=fig, hspace=0.45, wspace=0.35)

band_labels = ["ADX < 45", "ADX 45–60", "ADX > 60"]
colors = ['#e74c3c', '#f39c12', '#27ae60']

# Row 1: Model A2 and A3 PF by ADX band
for col_idx, (model_name, df) in enumerate([("Model A2", a2_df), ("Model A3", a3_df)]):
    ax = fig.add_subplot(gs[0, col_idx])
    if len(df) == 0:
        ax.text(0.5, 0.5, 'No trades', ha='center', va='center', transform=ax.transAxes)
        ax.set_title(f'{model_name} — PF by ADX Band')
        continue
    segs = segment_by_adx(df, bands)
    pfs = []
    ns  = []
    for label, pnl in segs.items():
        m = metrics(pnl) if len(pnl) >= 3 else dict(pf=0, n=0)
        pfs.append(m['pf'])
        ns.append(m['n'])
    bars = ax.bar(band_labels, pfs, color=colors, alpha=0.8, edgecolor='black', linewidth=0.5)
    ax.axhline(1.0, color='black', linestyle='--', linewidth=1, alpha=0.5)
    ax.axhline(1.2, color='blue', linestyle=':', linewidth=1, alpha=0.5, label='Target PF=1.20')
    for bar, n_val in zip(bars, ns):
        ax.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 0.02,
                f'N={n_val}', ha='center', va='bottom', fontsize=8)
    ax.set_title(f'{model_name} — PF by ADX Band', fontsize=10, fontweight='bold')
    ax.set_ylabel('Profit Factor')
    ax.set_ylim(0, max(pfs) * 1.3 + 0.5)
    ax.legend(fontsize=7)

# Row 1 col 3: ADX threshold sensitivity for A3
ax = fig.add_subplot(gs[0, 2])
if len(a3_df) > 0:
    thresholds = [25, 30, 35, 40, 45, 50, 55, 60, 65]
    pfs_thresh = []
    ns_thresh  = []
    for thresh in thresholds:
        sub = a3_df[a3_df['adx_entry'] >= thresh]['net'].values
        m = metrics(sub) if len(sub) >= 3 else dict(pf=0, n=0)
        pfs_thresh.append(m['pf'])
        ns_thresh.append(m['n'])
    ax.plot(thresholds, pfs_thresh, 'o-', color='#2980b9', linewidth=2, markersize=6)
    ax.axhline(1.0, color='black', linestyle='--', linewidth=1, alpha=0.5)
    ax.axhline(1.2, color='blue', linestyle=':', linewidth=1, alpha=0.5)
    ax2 = ax.twinx()
    ax2.bar(thresholds, ns_thresh, alpha=0.2, color='gray', width=3)
    ax2.set_ylabel('Trade Count', color='gray', fontsize=8)
    ax.set_title('A3 PF vs ADX Threshold', fontsize=10, fontweight='bold')
    ax.set_xlabel('Minimum ADX')
    ax.set_ylabel('Profit Factor')

# Row 2: Equity curves by ADX band for A3
for col_idx, (label, lo_adx, hi_adx) in enumerate(bands):
    ax = fig.add_subplot(gs[1, col_idx])
    if len(a3_df) == 0:
        continue
    sub = a3_df[(a3_df['adx_entry'] >= lo_adx) & (a3_df['adx_entry'] < hi_adx)]['net'].values
    if len(sub) < 3:
        ax.text(0.5, 0.5, f'N={len(sub)} — insufficient', ha='center', va='center', transform=ax.transAxes)
        ax.set_title(f'A3 Equity — {label}')
        continue
    eq = np.cumsum(sub)
    ax.plot(eq, color=colors[col_idx], linewidth=1.5)
    ax.axhline(0, color='black', linestyle='--', linewidth=0.8, alpha=0.5)
    m = metrics(sub)
    ax.set_title(f'A3 Equity — {label}\nPF={m["pf"]:.3f}  N={m["n"]}  Net=${m["net"]:,.0f}',
                 fontsize=9, fontweight='bold')
    ax.set_xlabel('Trade #')
    ax.set_ylabel('Cumulative P&L ($)')

# Row 3: ARI comparison
ax = fig.add_subplot(gs[2, :2])
if len(a2_df) > 0 and len(a3_df) > 0:
    result = test_ari_adx_scaling(a2_df, a3_df, adx_threshold=60, scale_factor=1.5)
    if result:
        static_pnl, dynamic_pnl, _ = result
        ax.plot(np.cumsum(static_pnl), color='#e74c3c', linewidth=1.5, label='Static (no scaling)')
        ax.plot(np.cumsum(dynamic_pnl), color='#27ae60', linewidth=1.5, label='ADX>60 scaled ×1.5')
        ax.axhline(0, color='black', linestyle='--', linewidth=0.8, alpha=0.5)
        ax.set_title('ARI Integration — ADX Scaling vs Static Portfolio', fontsize=10, fontweight='bold')
        ax.set_xlabel('Trade #')
        ax.set_ylabel('Cumulative P&L ($)')
        ax.legend(fontsize=9)

# Row 3 col 3: ADX distribution histogram
ax = fig.add_subplot(gs[2, 2])
if len(a3_df) > 0:
    ax.hist(a3_df['adx_entry'].values, bins=20, color='#2980b9', alpha=0.7, edgecolor='black', linewidth=0.5)
    ax.axvline(45, color='orange', linestyle='--', linewidth=1.5, label='ADX=45')
    ax.axvline(60, color='red', linestyle='--', linewidth=1.5, label='ADX=60')
    ax.set_title('A3 ADX Distribution at Entry', fontsize=10, fontweight='bold')
    ax.set_xlabel('ADX at Entry')
    ax.set_ylabel('Trade Count')
    ax.legend(fontsize=8)

plt.savefig(f'{OUTPUT_DIR}/sprint_050_adx_regime.png', dpi=150, bbox_inches='tight')
print(f"\nChart saved to {OUTPUT_DIR}/sprint_050_adx_regime.png")

# ─── Final Verdict ────────────────────────────────────────────────────────────
print("\n" + "=" * 70)
print("H-B-RT01 VERDICT SUMMARY")
print("=" * 70)

if len(a3_df) > 0:
    high_a3 = a3_df[a3_df['adx_entry'] >= 60]['net'].values
    low_a3  = a3_df[a3_df['adx_entry'] <  45]['net'].values
    mid_a3  = a3_df[(a3_df['adx_entry'] >= 45) & (a3_df['adx_entry'] < 60)]['net'].values
    mh = metrics(high_a3) if len(high_a3) >= 3 else dict(pf=0, n=0)
    ml = metrics(low_a3)  if len(low_a3)  >= 3 else dict(pf=0, n=0)
    mm = metrics(mid_a3)  if len(mid_a3)  >= 3 else dict(pf=0, n=0)
    print(f"\n  A3 PF by ADX band:")
    print(f"    ADX < 45:   PF={ml['pf']:.3f}  N={ml['n']}")
    print(f"    ADX 45-60:  PF={mm['pf']:.3f}  N={mm['n']}")
    print(f"    ADX > 60:   PF={mh['pf']:.3f}  N={mh['n']}")
    if mh['n'] >= 10 and mh['pf'] > 1.5:
        print(f"\n  VERDICT: PROMOTE — ADX > 60 is a materially higher-confidence regime")
        print(f"  RECOMMENDATION: Add ADX > 60 scaling rule to ARI v2.1")
    elif mh['n'] >= 5 and mh['pf'] > 1.2:
        print(f"\n  VERDICT: MONITOR — ADX > 60 shows improvement but sample is small")
        print(f"  RECOMMENDATION: Continue observing; revisit after 6 more months of data")
    else:
        print(f"\n  VERDICT: REJECT — ADX > 60 does not provide material improvement")
        print(f"  RECOMMENDATION: No ARI change required")

print("\nSprint 050 complete.")
