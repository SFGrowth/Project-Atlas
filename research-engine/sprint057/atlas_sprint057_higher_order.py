"""
Atlas Sprint 057 — Higher-Order Interaction Search

Searches all 3-way and 4-way combinations of the validated flags,
focusing on combinations that include at least one Discovery (D-01, D-03, D-08).
Also tests the directional D-02 variants (D02_bull, D02_bear).
"""

import pandas as pd
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.gridspec as gridspec
import seaborn as sns
from scipy import stats
import warnings, json, os, itertools
warnings.filterwarnings('ignore')

FEAT_PATH   = '/home/ubuntu/Project-Atlas/research-engine/sprint056/discovery_features_rth.csv'
OUTPUT_DIR  = '/home/ubuntu/Project-Atlas/research-engine/sprint057'
CHARTS_DIR  = '/home/ubuntu/Project-Atlas/research/sprint-057-charts'
os.makedirs(OUTPUT_DIR, exist_ok=True)
os.makedirs(CHARTS_DIR, exist_ok=True)

print("Loading RTH feature matrix...")
df = pd.read_csv(FEAT_PATH)
df['ts']   = pd.to_datetime(df['ts'])
df['year'] = df['ts'].dt.year
df_clean   = df.dropna(subset=['fwd_12_return_atr', 'is_exceptional_fwd', 'is_catastrophic_fwd']).copy()
print(f"  {len(df_clean):,} clean RTH bars")

# Re-operationalise all flags
df_clean['MP001'] = (df_clean['ema_alignment'] != 0).astype(int)
df_clean['MP002'] = (df_clean['adx14'] >= 25).astype(int)
df_clean['MP003'] = (df_clean['hour'] >= 13).astype(int)
df_clean['MP004'] = (df_clean['volcomp_5_14'] < 0.85).astype(int)
df_clean['MP006'] = (df_clean['close_vs_range_mid'].abs() < 0.3).astype(int)
df_clean['MP008'] = ((df_clean['MP001'] == 1) & (df_clean['MP002'] == 1) & (df_clean['MP004'] == 1)).astype(int)
df_clean['D01']   = (df_clean['rel_txn'] >= 1.33).astype(int)
df_clean['D02']   = (df_clean['ov_dir'] != 0).astype(int)
df_clean['D02_bull'] = (df_clean['ov_dir'] == 1).astype(int)
df_clean['D02_bear'] = (df_clean['ov_dir'] == -1).astype(int)
df_clean['D03']   = (df_clean['ov_range_vs_atr14'] >= 10.85).astype(int)
df_clean['D08']   = (df_clean['day_range_vs_atr14'] >= 12.12).astype(int)

BASELINE_EXC = df_clean['is_exceptional_fwd'].mean() * 100

def compute_exc_metrics(mask, df, name=''):
    grp = df[mask]
    n   = len(grp)
    if n < 200:
        return None
    fwd = grp['fwd_12_return_atr']
    exc = grp['is_exceptional_fwd'].mean() * 100
    cat = grp['is_catastrophic_fwd'].mean() * 100
    wr  = (fwd > 0).mean() * 100
    pos = fwd[fwd > 0].sum()
    neg = fwd[fwd < 0].abs().sum()
    pf  = pos / (neg + 1e-6)
    exp = fwd.mean()
    # Year stability
    year_exc = {}
    for yr in [2024, 2025, 2026]:
        g = grp[grp['year'] == yr]
        if len(g) >= 50:
            year_exc[yr] = g['is_exceptional_fwd'].mean() * 100
    # Synergy vs best individual
    return {'name': name, 'n': n, 'exc': exc, 'cat': cat, 'wr': wr, 'pf': pf,
            'exp': exp, 'year_exc': year_exc}

# ─── 3-way combinations (must include at least one discovery) ─────────────────
print("\n=== 3-WAY INTERACTION SEARCH ===")
discovery_flags = ['D01', 'D03', 'D08', 'D02_bull', 'D02_bear']
mp_flags        = ['MP001', 'MP002', 'MP003', 'MP004', 'MP006', 'MP008']
all_flags       = discovery_flags + mp_flags

threeway_results = []
for combo in itertools.combinations(all_flags, 3):
    # Must include at least one discovery
    if not any(f in discovery_flags for f in combo):
        continue
    mask = (df_clean[combo[0]] == 1) & (df_clean[combo[1]] == 1) & (df_clean[combo[2]] == 1)
    result = compute_exc_metrics(mask, df_clean, '×'.join(combo))
    if result:
        result['lift'] = result['exc'] - BASELINE_EXC
        threeway_results.append(result)

threeway_results.sort(key=lambda x: x['exc'], reverse=True)
print(f"\n  Top 20 three-way combinations (sorted by exceptional rate):")
print(f"  {'Combination':<40} {'N':>6} {'Exc%':>7} {'Lift':>7} {'PF':>7} {'WR%':>7}")
print("  " + "-"*75)
for r in threeway_results[:20]:
    print(f"  {r['name']:<40} {r['n']:>6,} {r['exc']:>7.1f} {r['lift']:>+7.2f} {r['pf']:>7.3f} {r['wr']:>7.1f}")

# ─── 4-way combinations (top candidates only) ─────────────────────────────────
print("\n=== 4-WAY INTERACTION SEARCH ===")
# Focus on combinations involving the top 2-way synergy pairs
top_4way_seeds = [
    ('D01', 'D08', 'D03', 'MP002'),
    ('D01', 'D08', 'D03', 'MP001'),
    ('D01', 'D08', 'D03', 'MP003'),
    ('D01', 'D08', 'D03', 'D02_bull'),
    ('D01', 'D08', 'MP002', 'MP001'),
    ('D01', 'D08', 'MP003', 'D02_bull'),
    ('D01', 'D03', 'D08', 'MP001'),
    ('D01', 'D03', 'MP002', 'D02_bull'),
    ('D01', 'D03', 'MP003', 'D02_bull'),
    ('D01', 'D08', 'D02_bull', 'MP001'),
]

fourway_results = []
for combo in top_4way_seeds:
    mask = (df_clean[combo[0]] == 1) & (df_clean[combo[1]] == 1) & \
           (df_clean[combo[2]] == 1) & (df_clean[combo[3]] == 1)
    result = compute_exc_metrics(mask, df_clean, '×'.join(combo))
    if result:
        result['lift'] = result['exc'] - BASELINE_EXC
        fourway_results.append(result)

fourway_results.sort(key=lambda x: x['exc'], reverse=True)
print(f"\n  {'Combination':<50} {'N':>6} {'Exc%':>7} {'Lift':>7} {'PF':>7} {'WR%':>7}")
print("  " + "-"*85)
for r in fourway_results:
    print(f"  {r['name']:<50} {r['n']:>6,} {r['exc']:>7.1f} {r['lift']:>+7.2f} {r['pf']:>7.3f} {r['wr']:>7.1f}")

# ─── Year stability for top combinations ──────────────────────────────────────
print("\n=== YEAR-BY-YEAR STABILITY FOR TOP COMBINATIONS ===")
top_combos = [
    ('D01×D08',          (df_clean['D01']==1) & (df_clean['D08']==1)),
    ('D01×D03',          (df_clean['D01']==1) & (df_clean['D03']==1)),
    ('D01×D08×D03',      (df_clean['D01']==1) & (df_clean['D08']==1) & (df_clean['D03']==1)),
    ('D01×D08×D02_bull', (df_clean['D01']==1) & (df_clean['D08']==1) & (df_clean['D02_bull']==1)),
    ('D01×D03×D02_bull', (df_clean['D01']==1) & (df_clean['D03']==1) & (df_clean['D02_bull']==1)),
]

stability_data = {}
for name, mask in top_combos:
    grp = df_clean[mask]
    n_total = len(grp)
    yr_data = {}
    for yr in [2024, 2025, 2026]:
        g = grp[grp['year'] == yr]
        if len(g) >= 30:
            yr_data[yr] = {'exc': g['is_exceptional_fwd'].mean() * 100, 'n': len(g)}
    stability_data[name] = {'n': n_total, 'years': yr_data}
    print(f"\n  {name} (N={n_total:,}):")
    for yr, d in yr_data.items():
        print(f"    {yr}: Exc={d['exc']:.1f}% (N={d['n']:,})")

# ─── VISUALISATIONS ───────────────────────────────────────────────────────────
print("\nGenerating visualisations...")
plt.style.use('dark_background')

# Chart 1: Pairwise interaction matrix heatmap
# Load pairwise results from Phase 2
with open(f'{OUTPUT_DIR}/interaction_results.json') as f:
    prev_results = json.load(f)

pairwise = prev_results['pairwise']
individual = prev_results['individual']
baseline_exc = prev_results['baseline']['exc_rate']

# Build synergy matrix
flags_ordered = ['MP001', 'MP002', 'MP003', 'MP004', 'MP006', 'MP008', 'D01', 'D02', 'D03', 'D08']
n_flags = len(flags_ordered)
synergy_matrix = np.full((n_flags, n_flags), np.nan)

for i, f1 in enumerate(flags_ordered):
    for j, f2 in enumerate(flags_ordered):
        if i == j:
            synergy_matrix[i, j] = 0
        elif i < j:
            key = f"{f1}×{f2}"
            if key in pairwise:
                synergy_matrix[i, j] = pairwise[key]['synergy']
                synergy_matrix[j, i] = pairwise[key]['synergy']

fig, axes = plt.subplots(1, 2, figsize=(20, 9), facecolor='#0d1117')
fig.suptitle('Atlas Sprint 057 — Interaction Matrix & Higher-Order Synergies', 
             color='white', fontsize=14, fontweight='bold')

# Heatmap
ax1 = axes[0]
mask_nan = np.isnan(synergy_matrix)
synergy_masked = np.where(mask_nan, 0, synergy_matrix)
im = ax1.imshow(synergy_masked, cmap='RdYlGn', vmin=-3, vmax=10, aspect='auto')
ax1.set_xticks(range(n_flags))
ax1.set_yticks(range(n_flags))
ax1.set_xticklabels(flags_ordered, rotation=45, ha='right', color='white', fontsize=9)
ax1.set_yticklabels(flags_ordered, color='white', fontsize=9)
ax1.set_title('Pairwise Synergy Matrix\n(Exceptional Rate Lift over Best Individual)', 
              color='white', fontsize=11, fontweight='bold')
plt.colorbar(im, ax=ax1, label='Synergy Score (%)')
for i in range(n_flags):
    for j in range(n_flags):
        if not mask_nan[i, j] and i != j:
            val = synergy_matrix[i, j]
            ax1.text(j, i, f'{val:+.1f}', ha='center', va='center', 
                    color='black' if abs(val) < 5 else 'white', fontsize=7)

# Bar chart: top combinations by exceptional rate
ax2 = axes[1]
top_combos_data = [
    ('Baseline', BASELINE_EXC, 39353),
    ('D-01', individual['D01']['exc_rate'], individual['D01']['n']),
    ('D-08', individual['D08']['exc_rate'], individual['D08']['n']),
    ('D-03', individual['D03']['exc_rate'], individual['D03']['n']),
    ('D01×D08', pairwise['D01×D08']['exc_rate'], pairwise['D01×D08']['n']),
    ('D01×D03', pairwise['D01×D03']['exc_rate'], pairwise['D01×D03']['n']),
]
# Add top 3-way
if threeway_results:
    for r in threeway_results[:3]:
        top_combos_data.append((r['name'][:20], r['exc'], r['n']))

labels = [d[0] for d in top_combos_data]
exc_rates = [d[1] for d in top_combos_data]
ns = [d[2] for d in top_combos_data]

colors_bar = ['#6b7280'] + ['#3b82f6'] * 3 + ['#22c55e'] * 2 + ['#f59e0b'] * 3
bars = ax2.barh(labels, exc_rates, color=colors_bar[:len(labels)], alpha=0.85, edgecolor='white', linewidth=0.5)
ax2.axvline(BASELINE_EXC, color='white', linestyle='--', alpha=0.5, label=f'Baseline ({BASELINE_EXC:.1f}%)')
ax2.set_title('Exceptional Move Rate by Combination\n(Blue=Individual, Green=2-way, Gold=3-way)', 
              color='white', fontsize=11, fontweight='bold')
ax2.set_xlabel('Exceptional Move Rate (%)', color='white')
ax2.tick_params(colors='white')
for bar, rate, n in zip(bars, exc_rates, ns):
    ax2.text(bar.get_width() + 0.2, bar.get_y() + bar.get_height()/2,
             f'{rate:.1f}% (N={n:,})', va='center', color='white', fontsize=8)
ax2.set_xlim(0, max(exc_rates) * 1.35)
ax2.legend(fontsize=9)

plt.tight_layout()
plt.savefig(f'{CHARTS_DIR}/sprint057_interaction_matrix.png', dpi=150, bbox_inches='tight',
            facecolor='#0d1117')
plt.close()
print(f"  Saved: sprint057_interaction_matrix.png")

# Chart 2: Year stability for top combinations
fig2, ax = plt.subplots(figsize=(14, 7), facecolor='#0d1117')
years = [2024, 2025, 2026]
combo_names = list(stability_data.keys())
x = np.arange(len(years))
width = 0.15
colors_stab = ['#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#ef4444']

for i, (name, data) in enumerate(stability_data.items()):
    yr_exc = [data['years'].get(yr, {}).get('exc', 0) for yr in years]
    ax.bar(x + i * width, yr_exc, width, label=name, color=colors_stab[i], alpha=0.85, edgecolor='white', linewidth=0.5)

ax.axhline(BASELINE_EXC, color='white', linestyle='--', alpha=0.5, label=f'Baseline ({BASELINE_EXC:.1f}%)')
ax.set_title('Year-by-Year Stability — Top Interaction Combinations\n(Sprint 057)', 
             color='white', fontsize=12, fontweight='bold')
ax.set_ylabel('Exceptional Move Rate (%)', color='white')
ax.set_xticks(x + width * 2)
ax.set_xticklabels([str(y) for y in years], color='white')
ax.tick_params(colors='white')
ax.legend(fontsize=8, loc='upper left')
plt.tight_layout()
plt.savefig(f'{CHARTS_DIR}/sprint057_year_stability.png', dpi=150, bbox_inches='tight',
            facecolor='#0d1117')
plt.close()
print(f"  Saved: sprint057_year_stability.png")

# ─── Save higher-order results ────────────────────────────────────────────────
with open(f'{OUTPUT_DIR}/higher_order_results.json', 'w') as f:
    json.dump({'threeway': threeway_results[:30], 'fourway': fourway_results,
               'stability': stability_data}, f, indent=2, default=str)

print(f"\nSaved: {OUTPUT_DIR}/higher_order_results.json")
print("=== HIGHER-ORDER INTERACTION SEARCH COMPLETE ===")
