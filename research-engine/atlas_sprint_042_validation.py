"""
Atlas Sprint 042 — Model A2 Independent Validation
Candidate: Flag Continuation, ADX>45, Late RTH Session (14:00-16:00)
Tests: parameter neighbourhood, quarterly stability, walk-forward, Monte Carlo
$800 risk per trade
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
RR             = 2.0

# Validated production parameters
PROD_ADX_MIN    = 45
PROD_FLAG_W     = 8
PROD_IMPULSE_W  = 5
PROD_MAX_RETRACE = 0.50
PROD_SESSION    = 'late'   # 14:00-16:00 ET

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
    time_val = hour * 60 + minute
    is_late_rth = (time_val >= 840) & (time_val < 960)

    return dict(hi=hi, lo=lo, cl=cl, n=n, hour=hour, minute=minute,
                year=year, month=month, atr5=atr5, atr14=atr14, atr20=atr20,
                adx=adx, trend_long=trend_long, trend_short=trend_short,
                is_rth=is_rth, is_late_rth=is_late_rth)

def flag_signals(mkt, adx_min=45, flag_w=8, impulse_w=5, max_retrace=0.50, late_only=True):
    hi=mkt['hi']; lo=mkt['lo']; cl=mkt['cl']
    atr14=mkt['atr14']; adx=mkt['adx']
    tl=mkt['trend_long']; ts=mkt['trend_short']
    sess = mkt['is_late_rth'] if late_only else mkt['is_rth']
    n=mkt['n']
    idx=[]; dirs=[]; stops=[]
    for i in range(flag_w+impulse_w+10, n-1):
        if not sess[i]: continue
        if adx[i] < adx_min: continue
        avg = atr14[i]
        if avg <= 0: continue
        ihi = hi[i-impulse_w-flag_w:i-flag_w].max()
        ilo = lo[i-impulse_w-flag_w:i-flag_w].min()
        imp = ihi - ilo
        if imp < 1.5 * avg: continue
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

def simulate_trades(mkt, signal_idx, directions, stop_pts_arr, rr=RR, max_bars=100):
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

def full_stats(df, label=""):
    if len(df) < 10:
        return dict(label=label, n=len(df), pf=0, wr=0, net=0, exp=0, avg_win=0, avg_loss=0,
                    max_dd=0, max_dd_r=0, romaD=0, rec_factor=0, mc_pass=0, p_value=1.0,
                    equity=np.array([]), monthly_pos=0, streak=0)
    pnl = df['net'].values
    wins = pnl[pnl>0]; loss = pnl[pnl<0]
    gw = wins.sum(); gl = abs(loss.sum())
    pf = gw/gl if gl>0 else 0
    wr = (pnl>0).mean()
    avg_win  = wins.mean() if len(wins) > 0 else 0
    avg_loss = loss.mean() if len(loss) > 0 else 0
    exp = pnl.mean()
    eq = np.cumsum(pnl)
    dd = eq - np.maximum.accumulate(eq)
    max_dd = dd.min()
    max_dd_r = max_dd / RISK_PER_TRADE
    romaD = eq[-1] / abs(max_dd) if max_dd < 0 else 0
    rec_factor = eq[-1] / abs(max_dd) if max_dd < 0 else 0
    n_wins = int((pnl>0).sum())
    p_val = stats.binomtest(n_wins, len(pnl), 0.333, alternative='greater').pvalue
    # Monthly consistency
    df2 = df.copy()
    df2['ym'] = df2['year'].astype(str) + '-' + df2['month'].astype(str).str.zfill(2)
    monthly = df2.groupby('ym')['net'].sum()
    monthly_pos = (monthly > 0).mean() if len(monthly) > 0 else 0
    # Longest losing streak
    streak = 0; cur = 0
    for p in pnl:
        if p < 0: cur += 1; streak = max(streak, cur)
        else: cur = 0
    # Trades per month
    tpm = len(pnl) / max(1, len(monthly))
    return dict(label=label, n=len(pnl), pf=pf, wr=wr, net=pnl.sum(), exp=exp,
                avg_win=avg_win, avg_loss=avg_loss, max_dd=max_dd, max_dd_r=max_dd_r,
                romaD=romaD, rec_factor=rec_factor, p_value=p_val, equity=eq,
                monthly_pos=monthly_pos, streak=streak, tpm=tpm)

def monte_carlo(pnl_arr, n_sims=5000, initial_capital=50000, dd_limit=0.10):
    """Prop firm MC: pass if max_dd < dd_limit * initial_capital."""
    passes = 0
    for _ in range(n_sims):
        shuffled = np.random.choice(pnl_arr, size=len(pnl_arr), replace=True)
        eq = np.cumsum(shuffled)
        dd = (eq - np.maximum.accumulate(eq)).min()
        if abs(dd) < dd_limit * initial_capital:
            passes += 1
    return passes / n_sims

print("="*70)
print("Sprint 042 — Model A2 Independent Validation")
print(f"Candidate: Flag Continuation, ADX>45, Late RTH (14:00-16:00)")
print(f"Data: MNQ 5-min | Risk: ${RISK_PER_TRADE}/trade | RR: {RR}R")
print("="*70)

mkt = load_data()

# Production model
idx, dirs, stops = flag_signals(mkt, adx_min=PROD_ADX_MIN, flag_w=PROD_FLAG_W,
                                 impulse_w=PROD_IMPULSE_W, max_retrace=PROD_MAX_RETRACE)
df_prod = simulate_trades(mkt, idx, dirs, stops)
s = full_stats(df_prod, "Model A2 Candidate")

print(f"\n{'─'*70}")
print("PRODUCTION MODEL PERFORMANCE")
print(f"{'─'*70}")
print(f"  N trades:           {s['n']}")
print(f"  Profit Factor:      {s['pf']:.3f}")
print(f"  Win Rate:           {s['wr']:.1%}")
print(f"  Expectancy:         ${s['exp']:.2f}")
print(f"  Avg Winner:         ${s['avg_win']:.2f}")
print(f"  Avg Loser:          ${s['avg_loss']:.2f}")
print(f"  Net P&L:            ${s['net']:,.2f}")
print(f"  Max Drawdown:       ${s['max_dd']:,.2f}")
print(f"  Max Drawdown (R):   {s['max_dd_r']:.2f}R")
print(f"  RoMaD:              {s['romaD']:.3f}")
print(f"  Recovery Factor:    {s['rec_factor']:.3f}")
print(f"  Monthly Consistency:{s['monthly_pos']:.1%}")
print(f"  Trades/Month:       {s['tpm']:.1f}")
print(f"  Longest Losing Str: {s['streak']}")
print(f"  p-value:            {s['p_value']:.6f}")

# Monte Carlo
mc_pass = monte_carlo(df_prod['net'].values)
print(f"  MC Pass Rate:       {mc_pass:.1%}")

# ─── Parameter neighbourhood ──────────────────────────────────────────────────
print(f"\n{'─'*70}")
print("PARAMETER NEIGHBOURHOOD (robustness test)")
print(f"{'─'*70}")
print(f"  {'ADX':>5} {'FlagW':>6} {'N':>5} {'PF':>7} {'WR':>7} {'Net($)':>10}")
print("─"*70)

neighbourhood_results = []
for adx_min in [40, 45, 50]:
    for fw in [6, 8, 10]:
        idx2, dirs2, stops2 = flag_signals(mkt, adx_min=adx_min, flag_w=fw)
        df2 = simulate_trades(mkt, idx2, dirs2, stops2)
        s2 = full_stats(df2)
        marker = " <<" if (adx_min==45 and fw==8) else ""
        print(f"  {adx_min:>5} {fw:>6} {s2['n']:>5} {s2['pf']:>7.3f} {s2['wr']:>7.1%} {s2['net']:>10,.0f}{marker}")
        neighbourhood_results.append({'adx_min':adx_min,'flag_w':fw,'pf':s2['pf'],'n':s2['n'],'net':s2['net']})

# ─── Walk-forward validation ──────────────────────────────────────────────────
print(f"\n{'─'*70}")
print("WALK-FORWARD VALIDATION (6-month windows)")
print(f"{'─'*70}")
df_prod['date'] = pd.to_datetime(df_prod['year'].astype(str) + '-' + df_prod['month'].astype(str).str.zfill(2) + '-01')
df_prod['half'] = df_prod['year'].astype(str) + 'H' + ((df_prod['month']-1)//6+1).astype(str)
wf_results = []
for h, grp in df_prod.groupby('half'):
    pnl = grp['net'].values
    if len(pnl) < 5: continue
    pf_h = pnl[pnl>0].sum() / abs(pnl[pnl<0].sum()) if abs(pnl[pnl<0].sum()) > 0 else 0
    wf_results.append({'period': h, 'n': len(pnl), 'pf': pf_h, 'net': pnl.sum()})
    print(f"  {h}: N={len(pnl):>3} | PF={pf_h:.3f} | Net=${pnl.sum():>8,.0f}")

pos_periods = sum(1 for r in wf_results if r['pf'] > 1.0)
print(f"\n  Positive periods: {pos_periods}/{len(wf_results)} ({pos_periods/max(1,len(wf_results)):.0%})")

# ─── Long/Short decomposition ─────────────────────────────────────────────────
print(f"\n{'─'*70}")
print("LONG / SHORT DECOMPOSITION")
print(f"{'─'*70}")
for d_label, d_val in [("Long", 1), ("Short", -1)]:
    idx2 = np.array([signal_idx for signal_idx, d in zip(
        [i for i in range(len(idx))], dirs) if d == d_val])
    sub_idx = idx[dirs == d_val]
    sub_dirs = dirs[dirs == d_val]
    sub_stops = stops[dirs == d_val]
    if len(sub_idx) == 0: continue
    df_sub = simulate_trades(mkt, sub_idx, sub_dirs, sub_stops)
    s_sub = full_stats(df_sub)
    print(f"  {d_label}: N={s_sub['n']} | PF={s_sub['pf']:.3f} | WR={s_sub['wr']:.1%} | Net=${s_sub['net']:,.0f}")

# ─── Charts ───────────────────────────────────────────────────────────────────
fig = plt.figure(figsize=(20, 16))
gs = gridspec.GridSpec(3, 3, figure=fig, hspace=0.45, wspace=0.35)
fig.suptitle(f'Sprint 042 — Model A2 Candidate: Flag Continuation (Late RTH, ADX>45)\n'
             f'MNQ | $800 Risk/Trade | PF={s["pf"]:.3f} | N={s["n"]} | MC={mc_pass:.1%}',
             fontsize=13, fontweight='bold')

# 1. Equity curve
ax1 = fig.add_subplot(gs[0, :])
eq = s['equity']
ax1.plot(eq, color='#2196F3', lw=2)
ax1.axhline(0, color='black', lw=0.5)
ax1.fill_between(range(len(eq)), eq, 0, where=eq>0, alpha=0.15, color='green')
ax1.fill_between(range(len(eq)), eq, 0, where=eq<0, alpha=0.15, color='red')
ax1.set_title(f'Equity Curve | Net=${s["net"]:,.0f} | Max DD=${s["max_dd"]:,.0f}', fontweight='bold')
ax1.set_xlabel('Trade'); ax1.set_ylabel('Cumulative P&L ($)'); ax1.grid(True, alpha=0.3)

# 2. Quarterly P&L
ax2 = fig.add_subplot(gs[1, 0])
df_prod['quarter'] = df_prod['year'].astype(str) + 'Q' + ((df_prod['month']-1)//3+1).astype(str)
q_pnl = df_prod.groupby('quarter')['net'].sum()
colors_q = ['#4CAF50' if v > 0 else '#F44336' for v in q_pnl.values]
ax2.bar(range(len(q_pnl)), q_pnl.values, color=colors_q, alpha=0.85)
ax2.set_xticks(range(len(q_pnl))); ax2.set_xticklabels(q_pnl.index, rotation=45, fontsize=7)
ax2.axhline(0, color='black', lw=0.5)
ax2.set_title('Quarterly P&L', fontweight='bold'); ax2.set_ylabel('Net P&L ($)'); ax2.grid(True, alpha=0.3, axis='y')

# 3. Parameter neighbourhood heatmap
ax3 = fig.add_subplot(gs[1, 1])
adx_vals = sorted(set(r['adx_min'] for r in neighbourhood_results))
fw_vals  = sorted(set(r['flag_w'] for r in neighbourhood_results))
heat = np.zeros((len(adx_vals), len(fw_vals)))
for r in neighbourhood_results:
    ri = adx_vals.index(r['adx_min']); ci = fw_vals.index(r['flag_w'])
    heat[ri, ci] = r['pf']
im = ax3.imshow(heat, cmap='RdYlGn', aspect='auto', vmin=0.8, vmax=1.6)
ax3.set_xticks(range(len(fw_vals))); ax3.set_xticklabels([f'FW={v}' for v in fw_vals])
ax3.set_yticks(range(len(adx_vals))); ax3.set_yticklabels([f'ADX>{v}' for v in adx_vals])
ax3.set_title('Parameter Neighbourhood (PF)', fontweight='bold')
plt.colorbar(im, ax=ax3)
for i in range(len(adx_vals)):
    for j in range(len(fw_vals)):
        ax3.text(j, i, f'{heat[i,j]:.3f}', ha='center', va='center', fontsize=9, fontweight='bold')

# 4. Walk-forward
ax4 = fig.add_subplot(gs[1, 2])
if wf_results:
    wf_pfs = [r['pf'] for r in wf_results]
    wf_labels = [r['period'] for r in wf_results]
    colors_wf = ['#4CAF50' if p > 1.0 else '#F44336' for p in wf_pfs]
    ax4.bar(range(len(wf_pfs)), wf_pfs, color=colors_wf, alpha=0.85)
    ax4.axhline(1.0, color='red', lw=1.5, ls='--')
    ax4.set_xticks(range(len(wf_labels))); ax4.set_xticklabels(wf_labels, rotation=45, fontsize=8)
    ax4.set_title(f'Walk-Forward ({pos_periods}/{len(wf_results)} positive)', fontweight='bold')
    ax4.set_ylabel('Profit Factor'); ax4.grid(True, alpha=0.3, axis='y')

# 5. MC distribution
ax5 = fig.add_subplot(gs[2, :2])
pnl_arr = df_prod['net'].values
n_sims = 2000
mc_dds = []
for _ in range(n_sims):
    shuffled = np.random.choice(pnl_arr, size=len(pnl_arr), replace=True)
    eq_mc = np.cumsum(shuffled)
    dd_mc = (eq_mc - np.maximum.accumulate(eq_mc)).min()
    mc_dds.append(abs(dd_mc))
ax5.hist(mc_dds, bins=50, color='#2196F3', alpha=0.7, edgecolor='white')
ax5.axvline(5000, color='red', lw=2, ls='--', label='$5,000 prop limit')
ax5.axvline(np.percentile(mc_dds, 95), color='orange', lw=1.5, ls=':', label=f'95th pct=${np.percentile(mc_dds,95):,.0f}')
ax5.set_title(f'Monte Carlo Drawdown Distribution (N={n_sims} sims)\nPass Rate (DD<$5k): {mc_pass:.1%}', fontweight='bold')
ax5.set_xlabel('Max Drawdown ($)'); ax5.set_ylabel('Frequency'); ax5.legend(); ax5.grid(True, alpha=0.3)

# 6. Scorecard
ax6 = fig.add_subplot(gs[2, 2])
ax6.axis('off')
scorecard = [
    ('Profit Factor', f'{s["pf"]:.3f}', s["pf"] >= 1.20),
    ('Win Rate', f'{s["wr"]:.1%}', s["wr"] >= 0.40),
    ('Expectancy', f'${s["exp"]:.2f}', s["exp"] > 0),
    ('Max Drawdown', f'${s["max_dd"]:,.0f}', s["max_dd"] > -5000),
    ('RoMaD', f'{s["romaD"]:.3f}', s["romaD"] > 2.0),
    ('Monthly Consistency', f'{s["monthly_pos"]:.0%}', s["monthly_pos"] >= 0.55),
    ('MC Pass Rate', f'{mc_pass:.1%}', mc_pass >= 0.75),
    ('Walk-Forward', f'{pos_periods}/{len(wf_results)}', pos_periods >= len(wf_results)*0.6),
]
y = 0.95
ax6.text(0.5, 1.02, 'Promotion Scorecard', ha='center', va='top', fontsize=11, fontweight='bold',
         transform=ax6.transAxes)
for metric, value, passed in scorecard:
    color = '#4CAF50' if passed else '#F44336'
    symbol = '✓' if passed else '✗'
    ax6.text(0.05, y, f'{symbol} {metric}', transform=ax6.transAxes, fontsize=9,
             color=color, fontweight='bold')
    ax6.text(0.75, y, value, transform=ax6.transAxes, fontsize=9, ha='right')
    y -= 0.115
passes = sum(1 for _,_,p in scorecard if p)
verdict = 'PROMOTE' if passes >= 6 else ('CONDITIONAL' if passes >= 5 else 'REJECT')
v_color = '#4CAF50' if verdict == 'PROMOTE' else ('#FF9800' if verdict == 'CONDITIONAL' else '#F44336')
ax6.text(0.5, 0.05, f'{verdict} ({passes}/{len(scorecard)})', transform=ax6.transAxes,
         fontsize=14, fontweight='bold', color=v_color, ha='center')

plt.savefig(f'{OUTPUT_DIR}/sprint_042_validation.png', dpi=150, bbox_inches='tight')
plt.close()
print(f"\nChart saved.")
print(f"\nPROMOTION VERDICT: {verdict} ({passes}/{len(scorecard)} criteria met)")
print("=== VALIDATION COMPLETE ===")
