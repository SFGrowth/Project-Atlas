"""
Atlas Sprint 051 — FAE Portfolio Impact Analysis (Phase 5+6)
Full validation and portfolio impact for promoted failure signatures.
Includes: in-sample, OOS, walk-forward, MC, parameter sensitivity, cross-year.
"""

import pandas as pd
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from scipy import stats
import warnings
import os
warnings.filterwarnings('ignore')

DATA_FILE  = '/home/ubuntu/Project-Atlas/research-engine/fae/fae_trades.csv'
OUTPUT_DIR = '/home/ubuntu/Project-Atlas/research/sprint-051-charts'
os.makedirs(OUTPUT_DIR, exist_ok=True)

df = pd.read_csv(DATA_FILE)
print(f"Loaded {len(df)} trades")

# ─── Utility functions ────────────────────────────────────────────────────────
def pf(d):
    pnl = d['net_pnl'].values
    w = pnl[pnl>0]; l = pnl[pnl<0]
    return w.sum()/abs(l.sum()) if len(l)>0 and abs(l.sum())>0 else 0

def wr(d):
    return (d['net_pnl']>0).mean()

def expectancy(d):
    return d['net_pnl'].mean()

def max_dd(d):
    eq = np.cumsum(d['net_pnl'].values)
    pk = np.maximum.accumulate(eq)
    return (eq-pk).min()

def mc_analysis(pnl, dd_limit, n=2000, seed=42):
    np.random.seed(seed)
    dds = []; nets = []
    for _ in range(n):
        sh = np.random.permutation(pnl)
        eq = np.cumsum(sh)
        pk = np.maximum.accumulate(eq)
        dds.append((eq-pk).min())
        nets.append(eq[-1])
    dds = np.array(dds); nets = np.array(nets)
    return {
        'pass_rate': (dds > dd_limit).mean(),
        'dd_5pct': np.percentile(dds, 5),
        'dd_50pct': np.percentile(dds, 50),
        'dd_95pct': np.percentile(dds, 95),
        'net_5pct': np.percentile(nets, 5),
        'net_50pct': np.percentile(nets, 50),
        'net_95pct': np.percentile(nets, 95),
    }

def prop_firm_pass_prob(pnl, target=3000, dd_limit=2000, n=2000, seed=42):
    """Estimate prop firm pass probability: reach target before hitting DD limit."""
    np.random.seed(seed)
    passes = 0
    for _ in range(n):
        sh = np.random.permutation(pnl)
        eq = np.cumsum(sh)
        pk = np.maximum.accumulate(eq)
        dds = eq - pk
        # Pass if: net PnL reaches target AND max DD never exceeds limit
        if eq[-1] >= target and dds.min() > -dd_limit:
            passes += 1
    return passes / n

# ─── CANDIDATE SIGNATURES ─────────────────────────────────────────────────────
# Based on Phase 3-4 analysis, the following are the best candidates:
# Note: A3 early-hour filter removes 60%+ of trades (model design issue, not filter)
# We test ALL candidates and report full results

SIGNATURES = [
    # A3 signatures
    {'id': 'FS-A3-01', 'model': 'A3', 'name': 'Low ADX (<30)',
     'filter': lambda d: d['adx'] < 30,
     'description': 'Skip A3 trades when ADX < 30 (insufficient trend strength)',
     'threshold_param': 'adx', 'threshold_val': 30, 'threshold_dir': 'lt'},
    {'id': 'FS-A3-02', 'model': 'A3', 'name': 'Early Hour (<10)',
     'filter': lambda d: d['hour'] < 10,
     'description': 'Skip A3 trades entered before 10:00 ET (low-conviction overnight)',
     'threshold_param': 'hour', 'threshold_val': 10, 'threshold_dir': 'lt'},
    {'id': 'FS-A3-03', 'model': 'A3', 'name': 'No Prior Wins (=0)',
     'filter': lambda d: d['consec_wins_before'] == 0,
     'description': 'Skip A3 trades when no prior consecutive wins',
     'threshold_param': 'consec_wins_before', 'threshold_val': 0, 'threshold_dir': 'eq'},
    # A2 signatures
    {'id': 'FS-A2-01', 'model': 'A2', 'name': 'ARI Caution (losses>=2)',
     'filter': lambda d: d['ari_caution'] == 1,
     'description': 'Skip A2 trades when ARI caution active (consecutive losses >= 2)',
     'threshold_param': 'consec_losses_before', 'threshold_val': 2, 'threshold_dir': 'gte'},
    {'id': 'FS-A2-02', 'model': 'A2', 'name': 'Severe Drawdown (losses>=3)',
     'filter': lambda d: d['consec_losses_before'] >= 3,
     'description': 'Skip A2 trades after 3+ consecutive losses',
     'threshold_param': 'consec_losses_before', 'threshold_val': 3, 'threshold_dir': 'gte'},
    # A1 signatures (weaker signals but worth documenting)
    {'id': 'FS-A1-01', 'model': 'A1', 'name': 'High ATR Pct (>0.80)',
     'filter': lambda d: d['atr14_pct'] > 0.80,
     'description': 'Skip A1 trades when ATR14 in top 20% of 100-bar range',
     'threshold_param': 'atr14_pct', 'threshold_val': 0.80, 'threshold_dir': 'gt'},
    {'id': 'FS-A1-02', 'model': 'A1', 'name': 'ADX Declining (slope<-3)',
     'filter': lambda d: d['adx_slope'] < -3,
     'description': 'Skip A1 trades when ADX slope < -3 (strong trend weakening)',
     'threshold_param': 'adx_slope', 'threshold_val': -3, 'threshold_dir': 'lt'},
]

# MC DD limits per model
MC_DD = {'A1': -2000, 'A2': -5000, 'A3': -5000}

# ─── FULL VALIDATION ──────────────────────────────────────────────────────────
print("\n" + "="*70)
print("FULL SIGNATURE VALIDATION WITH PORTFOLIO IMPACT")
print("="*70)

all_results = []

for sig in SIGNATURES:
    model = sig['model']
    sub = df[df['model'] == model].copy()
    sub = sub.sort_values('entry_time').reset_index(drop=True)

    bad_mask = sig['filter'](sub)
    bad = sub[bad_mask]
    good = sub[~bad_mask]

    n_total = len(sub)
    n_bad = len(bad)
    n_good = len(good)
    pct_removed = n_bad / n_total

    if n_bad < 5 or n_good < 10:
        print(f"\n{sig['id']}: Insufficient data")
        continue

    # ── Baseline stats ──
    pf_base = pf(sub)
    pf_filt = pf(good)
    wr_base = wr(sub)
    wr_filt = wr(good)
    exp_base = expectancy(sub)
    exp_filt = expectancy(good)
    dd_base = max_dd(sub)
    dd_filt = max_dd(good)
    net_base = sub['net_pnl'].sum()
    net_filt = good['net_pnl'].sum()

    # ── Walk-forward validation (3 folds) ──
    n = len(sub)
    fold_size = n // 3
    wf_results = []
    for fold in range(3):
        is_start = fold * fold_size
        is_end = is_start + fold_size
        oos_start = is_end
        oos_end = min(is_end + fold_size, n)
        oos_data = sub.iloc[oos_start:oos_end]
        if len(oos_data) < 5: continue
        oos_bad = sig['filter'](oos_data)
        oos_good = oos_data[~oos_bad]
        if len(oos_good) < 3: continue
        pf_oos_base = pf(oos_data)
        pf_oos_filt = pf(oos_good)
        wf_results.append({'fold': fold+1, 'pf_base': pf_oos_base, 'pf_filt': pf_oos_filt,
                           'improved': pf_oos_filt > pf_oos_base})
    wf_pass = sum(1 for w in wf_results if w['improved'])
    wf_total = len(wf_results)

    # ── Cross-year stability ──
    year_results = []
    for yr in sorted(sub['year'].unique()):
        yr_sub = sub[sub['year'] == yr]
        yr_good = good[good['year'] == yr]
        if len(yr_sub) < 5 or len(yr_good) < 3: continue
        pf_yr_b = pf(yr_sub); pf_yr_f = pf(yr_good)
        year_results.append({'year': yr, 'pf_base': pf_yr_b, 'pf_filt': pf_yr_f,
                             'n_base': len(yr_sub), 'n_filt': len(yr_good),
                             'improved': pf_yr_f > pf_yr_b})
    yr_pass = sum(1 for y in year_results if y['improved'])
    yr_total = len(year_results)
    cross_year_stable = yr_pass >= max(2, yr_total - 1)

    # ── Monte Carlo ──
    mc = mc_analysis(good['net_pnl'].values, MC_DD[model])
    mc_base = mc_analysis(sub['net_pnl'].values, MC_DD[model])

    # ── Parameter sensitivity (±20% threshold) ──
    param = sig['threshold_param']
    val = sig['threshold_val']
    dirn = sig['threshold_dir']
    sensitivity_pass = 0
    sensitivity_total = 0
    for mult in [0.8, 0.9, 1.1, 1.2]:
        adj_val = val * mult
        if dirn == 'lt':
            adj_mask = sub[param] < adj_val
        elif dirn == 'gt':
            adj_mask = sub[param] > adj_val
        elif dirn == 'gte':
            adj_mask = sub[param] >= adj_val
        elif dirn == 'eq':
            adj_mask = sub[param] == 0  # binary, skip sensitivity
            break
        adj_good = sub[~adj_mask]
        if len(adj_good) < 5: continue
        sensitivity_total += 1
        if pf(adj_good) > pf_base:
            sensitivity_pass += 1
    sensitivity_stable = sensitivity_total == 0 or sensitivity_pass >= sensitivity_total * 0.75

    # ── Prop firm pass probability ──
    # Using $50k account, $3k target, $2k DD limit (simplified)
    prop_base = prop_firm_pass_prob(sub['net_pnl'].values, target=3000, dd_limit=2000)
    prop_filt = prop_firm_pass_prob(good['net_pnl'].values, target=3000, dd_limit=2000)

    # ── Promotion decision ──
    pf_improved = pf_filt > pf_base
    dd_improved = dd_filt > dd_base
    trade_count_ok = pct_removed < 0.35
    mc_ok = mc['pass_rate'] >= 0.70
    promoted = (pf_improved and dd_improved and trade_count_ok and
                cross_year_stable and n_bad >= 8 and mc_ok)

    result = {
        'id': sig['id'], 'model': model, 'name': sig['name'],
        'description': sig['description'],
        'n_total': n_total, 'n_filtered': n_bad, 'pct_removed': pct_removed,
        'pf_base': pf_base, 'pf_filtered': pf_filt, 'pf_delta': pf_filt - pf_base,
        'wr_base': wr_base, 'wr_filtered': wr_filt,
        'exp_base': exp_base, 'exp_filtered': exp_filt,
        'net_base': net_base, 'net_filtered': net_filt,
        'dd_base': dd_base, 'dd_filtered': dd_filt, 'dd_delta': dd_filt - dd_base,
        'mc_pass_rate': mc['pass_rate'], 'mc_dd_5pct': mc['dd_5pct'],
        'mc_net_50pct': mc['net_50pct'],
        'mc_base_pass_rate': mc_base['pass_rate'],
        'wf_pass': wf_pass, 'wf_total': wf_total,
        'yr_pass': yr_pass, 'yr_total': yr_total,
        'cross_year_stable': cross_year_stable,
        'sensitivity_stable': sensitivity_stable,
        'prop_pass_base': prop_base, 'prop_pass_filtered': prop_filt,
        'pf_improved': pf_improved, 'dd_improved': dd_improved,
        'trade_count_ok': trade_count_ok, 'mc_ok': mc_ok,
        'promoted': promoted,
        'year_details': year_results,
        'wf_details': wf_results,
    }
    all_results.append(result)

    verdict = 'PROMOTED' if promoted else 'REJECTED'
    print(f"\n{'='*60}")
    print(f"{sig['id']}: {sig['name']} [{model}] — {verdict}")
    print(f"  {sig['description']}")
    print(f"  Trades filtered: {n_bad}/{n_total} ({pct_removed:.0%})")
    print(f"  PF:    {pf_base:.3f} → {pf_filt:.3f} ({pf_filt-pf_base:+.3f})")
    print(f"  WR:    {wr_base:.1%} → {wr_filt:.1%}")
    print(f"  Exp:   ${exp_base:.0f} → ${exp_filt:.0f}")
    print(f"  Net:   ${net_base:.0f} → ${net_filt:.0f}")
    print(f"  DD:    ${dd_base:.0f} → ${dd_filt:.0f} ({dd_filt-dd_base:+.0f})")
    print(f"  MC:    {mc_base['pass_rate']:.0%} → {mc['pass_rate']:.0%} (DD limit ${MC_DD[model]:,})")
    print(f"  MC DD 5th pct: ${mc['dd_5pct']:.0f}")
    print(f"  Walk-forward: {wf_pass}/{wf_total} folds improved")
    print(f"  Cross-year:   {yr_pass}/{yr_total} years improved")
    for y in year_results:
        print(f"    {y['year']}: PF {y['pf_base']:.3f}→{y['pf_filt']:.3f} (n={y['n_base']}→{y['n_filt']}) {'✓' if y['improved'] else '✗'}")
    print(f"  Sensitivity stable: {sensitivity_stable}")
    print(f"  Prop pass prob: {prop_base:.1%} → {prop_filt:.1%}")
    print(f"  Criteria: PF✓={pf_improved} DD✓={dd_improved} N✓={trade_count_ok} MC✓={mc_ok} Yr✓={cross_year_stable}")

# ─── Save results ─────────────────────────────────────────────────────────────
save_cols = [k for k in all_results[0].keys() if k not in ['year_details', 'wf_details']]
results_df = pd.DataFrame([{k: r[k] for k in save_cols} for r in all_results])
results_df.to_csv('/home/ubuntu/Project-Atlas/research-engine/fae/fae_portfolio_impact.csv', index=False)

# ─── Summary table ────────────────────────────────────────────────────────────
print("\n" + "="*80)
print("PORTFOLIO IMPACT SUMMARY")
print("="*80)
print(f"\n{'ID':<12} {'Model':<6} {'Name':<28} {'PF Δ':>7} {'DD Δ':>9} {'MC':>7} {'Yr':>6} {'WF':>6} {'Verdict':>10}")
print("-" * 100)
for r in sorted(all_results, key=lambda x: x['pf_delta'], reverse=True):
    verdict = 'PROMOTED' if r['promoted'] else 'REJECTED'
    print(f"{r['id']:<12} {r['model']:<6} {r['name']:<28} {r['pf_delta']:>+7.3f} {r['dd_delta']:>+9.0f} {r['mc_pass_rate']:>7.1%} {r['yr_pass']}/{r['yr_total']:>4} {r['wf_pass']}/{r['wf_total']:>4} {verdict:>10}")

promoted = [r for r in all_results if r['promoted']]
print(f"\nPromoted: {len(promoted)}/{len(all_results)}")
for r in promoted:
    print(f"  {r['id']}: {r['name']} [{r['model']}]")
    print(f"    PF {r['pf_base']:.3f}→{r['pf_filtered']:.3f} | DD ${r['dd_base']:.0f}→${r['dd_filtered']:.0f} | MC {r['mc_pass_rate']:.0%}")

# ─── PORTFOLIO IMPACT VISUALISATION ──────────────────────────────────────────
print("\nGenerating portfolio impact visualisations...")

fig = plt.figure(figsize=(20, 16))
fig.suptitle('Atlas FAE Portfolio Impact Analysis\n(Sprint 051 — Failure Signature Validation)',
             fontsize=14, fontweight='bold')

gs = fig.add_gridspec(3, 3, hspace=0.4, wspace=0.35)

# 1. PF comparison
ax1 = fig.add_subplot(gs[0, 0])
ids = [r['id'] for r in all_results]
pf_b = [r['pf_base'] for r in all_results]
pf_f = [r['pf_filtered'] for r in all_results]
x = np.arange(len(ids))
w = 0.35
ax1.bar(x - w/2, pf_b, w, label='Baseline', color='#90CAF9', alpha=0.8)
ax1.bar(x + w/2, pf_f, w, label='Filtered', color='#1565C0', alpha=0.8)
ax1.set_xticks(x); ax1.set_xticklabels(ids, rotation=45, ha='right', fontsize=8)
ax1.set_ylabel('Profit Factor'); ax1.set_title('PF: Baseline vs Filtered', fontweight='bold')
ax1.axhline(1.0, color='red', linestyle='--', linewidth=1, alpha=0.5)
ax1.legend(fontsize=8); ax1.grid(True, alpha=0.3, axis='y')
for i, r in enumerate(all_results):
    if r['promoted']:
        ax1.text(i, max(pf_b[i], pf_f[i]) + 0.02, '★', ha='center', fontsize=12, color='gold')

# 2. DD comparison
ax2 = fig.add_subplot(gs[0, 1])
dd_b = [r['dd_base'] for r in all_results]
dd_f = [r['dd_filtered'] for r in all_results]
ax2.bar(x - w/2, dd_b, w, label='Baseline', color='#EF9A9A', alpha=0.8)
ax2.bar(x + w/2, dd_f, w, label='Filtered', color='#B71C1C', alpha=0.8)
ax2.set_xticks(x); ax2.set_xticklabels(ids, rotation=45, ha='right', fontsize=8)
ax2.set_ylabel('Max Drawdown ($)'); ax2.set_title('Max DD: Baseline vs Filtered', fontweight='bold')
ax2.legend(fontsize=8); ax2.grid(True, alpha=0.3, axis='y')

# 3. MC pass rate
ax3 = fig.add_subplot(gs[0, 2])
mc_b = [r['mc_base_pass_rate'] for r in all_results]
mc_f = [r['mc_pass_rate'] for r in all_results]
ax3.bar(x - w/2, mc_b, w, label='Baseline', color='#A5D6A7', alpha=0.8)
ax3.bar(x + w/2, mc_f, w, label='Filtered', color='#2E7D32', alpha=0.8)
ax3.set_xticks(x); ax3.set_xticklabels(ids, rotation=45, ha='right', fontsize=8)
ax3.set_ylabel('MC Pass Rate'); ax3.set_title('Monte Carlo Pass Rate', fontweight='bold')
ax3.axhline(0.70, color='blue', linestyle='--', linewidth=1.5, alpha=0.7, label='70% threshold')
ax3.set_ylim(0, 1.05); ax3.legend(fontsize=8); ax3.grid(True, alpha=0.3, axis='y')

# 4. Equity curves for promoted signatures
promoted_list = [r for r in all_results if r['promoted']]
if not promoted_list:
    # Show best non-promoted
    promoted_list = sorted(all_results, key=lambda x: x['pf_delta'], reverse=True)[:2]

for plot_idx, r in enumerate(promoted_list[:3]):
    ax = fig.add_subplot(gs[1, plot_idx])
    model = r['model']
    sub = df[df['model'] == model].sort_values('entry_time').reset_index(drop=True)
    sig_match = next((s for s in SIGNATURES if s['id'] == r['id']), None)
    if sig_match is None: continue
    bad_mask = sig_match['filter'](sub)
    good = sub[~bad_mask]

    eq_base = np.cumsum(sub['net_pnl'].values)
    eq_filt = np.cumsum(good['net_pnl'].values)

    ax.plot(eq_base, color='#EF5350', linewidth=1.5, label=f'Baseline (PF={r["pf_base"]:.3f})', alpha=0.8)
    ax.plot(np.linspace(0, len(eq_base)-1, len(eq_filt)), eq_filt,
            color='#1565C0', linewidth=2, label=f'Filtered (PF={r["pf_filtered"]:.3f})')
    ax.axhline(0, color='black', linewidth=0.5, linestyle='--')
    ax.set_title(f'{r["id"]}: {r["name"]}\n[{model}] {"★PROMOTED" if r["promoted"] else "REJECTED"}',
                 fontsize=9, fontweight='bold')
    ax.set_xlabel('Trade #'); ax.set_ylabel('Cumulative P&L ($)')
    ax.legend(fontsize=8); ax.grid(True, alpha=0.3)

# 5. Cross-year stability heatmap
ax5 = fig.add_subplot(gs[2, :])
years = sorted(set(y for r in all_results for y in [yr['year'] for yr in r['year_details']]))
sig_ids = [r['id'] for r in all_results]
heatmap_data = np.full((len(sig_ids), len(years)), np.nan)
for i, r in enumerate(all_results):
    for yr_res in r['year_details']:
        j = years.index(yr_res['year'])
        heatmap_data[i, j] = yr_res['pf_filt'] - yr_res['pf_base']

im = ax5.imshow(heatmap_data, cmap='RdYlGn', aspect='auto', vmin=-0.5, vmax=0.5)
ax5.set_xticks(range(len(years))); ax5.set_xticklabels(years, fontsize=10)
ax5.set_yticks(range(len(sig_ids))); ax5.set_yticklabels(sig_ids, fontsize=9)
plt.colorbar(im, ax=ax5, label='PF Delta (filtered - baseline)', orientation='horizontal', pad=0.15)
ax5.set_title('Cross-Year PF Delta Heatmap (Green=Improved, Red=Degraded)', fontweight='bold')
for i in range(len(sig_ids)):
    for j in range(len(years)):
        if not np.isnan(heatmap_data[i, j]):
            ax5.text(j, i, f'{heatmap_data[i,j]:+.2f}', ha='center', va='center',
                     fontsize=8, color='black')

plt.savefig(os.path.join(OUTPUT_DIR, 'fae_portfolio_impact.png'), dpi=150, bbox_inches='tight')
plt.close()
print("Saved: fae_portfolio_impact.png")

# ─── COMBINED PORTFOLIO IMPACT ────────────────────────────────────────────────
print("\n" + "="*60)
print("COMBINED PORTFOLIO IMPACT (All models, best signatures)")
print("="*60)

# Apply best signature per model
best_sigs = {
    'A1': 'FS-A1-01',  # High ATR pct (best A1 candidate)
    'A2': 'FS-A2-01',  # ARI Caution (best A2 candidate)
    'A3': 'FS-A3-01',  # Low ADX (best A3 candidate)
}

combined_base = df.copy()
combined_filt_parts = []

for model, sig_id in best_sigs.items():
    sub = df[df['model'] == model].copy()
    sig_match = next((s for s in SIGNATURES if s['id'] == sig_id), None)
    if sig_match is None:
        combined_filt_parts.append(sub)
        continue
    bad_mask = sig_match['filter'](sub)
    good = sub[~bad_mask]
    combined_filt_parts.append(good)
    print(f"  {model} ({sig_id}): {len(bad_mask[bad_mask])}/{len(sub)} removed ({len(bad_mask[bad_mask])/len(sub):.0%})")

combined_filt = pd.concat(combined_filt_parts).sort_values('entry_time').reset_index(drop=True)

print(f"\nCombined baseline: N={len(combined_base)}, PF={pf(combined_base):.3f}, "
      f"WR={wr(combined_base):.1%}, Exp=${expectancy(combined_base):.0f}, "
      f"Net=${combined_base['net_pnl'].sum():.0f}, DD=${max_dd(combined_base):.0f}")
print(f"Combined filtered: N={len(combined_filt)}, PF={pf(combined_filt):.3f}, "
      f"WR={wr(combined_filt):.1%}, Exp=${expectancy(combined_filt):.0f}, "
      f"Net=${combined_filt['net_pnl'].sum():.0f}, DD=${max_dd(combined_filt):.0f}")

# Combined MC (use $5k limit for portfolio)
mc_comb_base = mc_analysis(combined_base['net_pnl'].values, -5000)
mc_comb_filt = mc_analysis(combined_filt['net_pnl'].values, -5000)
print(f"\nCombined MC (DD>-$5k): {mc_comb_base['pass_rate']:.0%} → {mc_comb_filt['pass_rate']:.0%}")
print(f"  Filtered MC DD 5th pct: ${mc_comb_filt['dd_5pct']:.0f}")
print(f"  Filtered MC Net 50th pct: ${mc_comb_filt['net_50pct']:.0f}")

print("\n=== PORTFOLIO IMPACT ANALYSIS COMPLETE ===")
