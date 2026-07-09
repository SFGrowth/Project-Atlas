"""
Atlas Sprint 058 — Adversarial Testing

Attempts to invalidate Apex Combination 1 by:
  1. Threshold sensitivity (relax/tighten each parameter)
  2. Component removal (test 2-way combinations)
  3. Random variable replacement (replace each discovery with noise)
  4. Label permutation test (1,000 permutations)
  5. Time shuffling (destroy temporal structure)
  6. Neighbouring parameter values (grid search around thresholds)
"""

import pandas as pd
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.gridspec as gridspec
from scipy import stats
import warnings, json, os
warnings.filterwarnings('ignore')

FEAT_PATH  = '/home/ubuntu/Project-Atlas/research-engine/sprint056/discovery_features_rth.csv'
OUTPUT_DIR = '/home/ubuntu/Project-Atlas/research-engine/sprint058'
CHARTS_DIR = '/home/ubuntu/Project-Atlas/research/sprint-058-charts'
os.makedirs(OUTPUT_DIR, exist_ok=True)
os.makedirs(CHARTS_DIR, exist_ok=True)

print("Loading RTH feature matrix...")
df = pd.read_csv(FEAT_PATH)
df['ts']    = pd.to_datetime(df['ts'])
df_clean    = df.dropna(subset=['fwd_12_return_atr', 'is_exceptional_fwd']).copy()
print(f"  {len(df_clean):,} clean RTH bars")

# Canonical thresholds
D01_THRESH = 1.33   # rel_txn
D03_THRESH = 10.85  # ov_range_vs_atr14
D02_BULL   = 1      # ov_dir == 1

def apex_metrics(df_in, d01_t, d03_t, d02_bull=True, label=''):
    """Compute WR, PF, N for a given threshold combination."""
    d01 = df_in['rel_txn'] >= d01_t
    d03 = df_in['ov_range_vs_atr14'] >= d03_t
    d02 = df_in['ov_dir'] == 1 if d02_bull else pd.Series(True, index=df_in.index)
    mask = d01 & d03 & d02
    n    = mask.sum()
    if n < 20:
        return {'n': n, 'wr': np.nan, 'pf': np.nan, 'exc': np.nan}
    fwd  = df_in.loc[mask, 'fwd_12_return_atr']
    wr   = (fwd > 0).mean() * 100
    pf   = fwd[fwd>0].sum() / (fwd[fwd<0].abs().sum() + 1e-6)
    exc  = df_in.loc[mask, 'is_exceptional_fwd'].mean() * 100
    return {'n': int(n), 'wr': float(wr), 'pf': float(pf), 'exc': float(exc)}

CANONICAL = apex_metrics(df_clean, D01_THRESH, D03_THRESH)
print(f"\n  Canonical: N={CANONICAL['n']:,} | WR={CANONICAL['wr']:.1f}% | PF={CANONICAL['pf']:.3f}")

results = {}

# ─── 1. Threshold Sensitivity: D01 (rel_txn) ──────────────────────────────────
print("\n=== 1. D01 THRESHOLD SENSITIVITY (rel_txn) ===")
d01_results = []
for t in [1.0, 1.1, 1.2, 1.25, 1.30, 1.33, 1.40, 1.50, 1.60, 1.75, 2.0]:
    m = apex_metrics(df_clean, t, D03_THRESH)
    d01_results.append({'threshold': t, **m})
    print(f"  D01>={t:.2f}: N={m['n']:4d} | WR={m['wr']:.1f}% | PF={m['pf']:.3f}")
results['d01_sensitivity'] = d01_results

# ─── 2. Threshold Sensitivity: D03 (ov_range_vs_atr14) ───────────────────────
print("\n=== 2. D03 THRESHOLD SENSITIVITY (ov_range_vs_atr14) ===")
d03_results = []
for t in [5.0, 7.0, 8.0, 9.0, 10.0, 10.85, 12.0, 14.0, 16.0, 18.0, 20.0]:
    m = apex_metrics(df_clean, D01_THRESH, t)
    d03_results.append({'threshold': t, **m})
    print(f"  D03>={t:.1f}: N={m['n']:4d} | WR={m['wr']:.1f}% | PF={m['pf']:.3f}")
results['d03_sensitivity'] = d03_results

# ─── 3. Component Removal (2-way combinations) ────────────────────────────────
print("\n=== 3. COMPONENT REMOVAL TEST ===")
combos = {
    'D01 only':          lambda d: d['rel_txn'] >= D01_THRESH,
    'D03 only':          lambda d: d['ov_range_vs_atr14'] >= D03_THRESH,
    'D02_bull only':     lambda d: d['ov_dir'] == 1,
    'D01 × D03':         lambda d: (d['rel_txn'] >= D01_THRESH) & (d['ov_range_vs_atr14'] >= D03_THRESH),
    'D01 × D02_bull':    lambda d: (d['rel_txn'] >= D01_THRESH) & (d['ov_dir'] == 1),
    'D03 × D02_bull':    lambda d: (d['ov_range_vs_atr14'] >= D03_THRESH) & (d['ov_dir'] == 1),
    'D01×D03×D02_bull':  lambda d: (d['rel_txn'] >= D01_THRESH) & (d['ov_range_vs_atr14'] >= D03_THRESH) & (d['ov_dir'] == 1),
}
combo_results = []
for name, func in combos.items():
    mask = func(df_clean)
    n    = mask.sum()
    if n < 20:
        continue
    fwd  = df_clean.loc[mask, 'fwd_12_return_atr']
    wr   = (fwd > 0).mean() * 100
    pf   = fwd[fwd>0].sum() / (fwd[fwd<0].abs().sum() + 1e-6)
    exc  = df_clean.loc[mask, 'is_exceptional_fwd'].mean() * 100
    combo_results.append({'combo': name, 'n': int(n), 'wr': float(wr), 'pf': float(pf), 'exc': float(exc)})
    print(f"  {name:<25}: N={n:5d} | WR={wr:.1f}% | PF={pf:.3f} | Exc={exc:.1f}%")
results['component_removal'] = combo_results

# ─── 4. Random Variable Replacement ──────────────────────────────────────────
print("\n=== 4. RANDOM VARIABLE REPLACEMENT ===")
np.random.seed(42)
n_rows = len(df_clean)

# Replace each discovery with a random binary variable of the same activation rate
d01_rate = (df_clean['rel_txn'] >= D01_THRESH).mean()
d03_rate = (df_clean['ov_range_vs_atr14'] >= D03_THRESH).mean()
d02_rate = (df_clean['ov_dir'] == 1).mean()

rand_results = []
for n_rep in range(1000):
    r_d01 = np.random.random(n_rows) < d01_rate
    r_d03 = np.random.random(n_rows) < d03_rate
    r_d02 = np.random.random(n_rows) < d02_rate
    rand_mask = r_d01 & r_d03 & r_d02
    if rand_mask.sum() < 10:
        continue
    fwd_r = df_clean.loc[rand_mask, 'fwd_12_return_atr']
    wr_r  = (fwd_r > 0).mean() * 100
    rand_results.append(wr_r)

rand_results = np.array(rand_results)
p_value = (rand_results >= CANONICAL['wr']).mean()
print(f"  Random replacement WR: mean={rand_results.mean():.1f}%, max={rand_results.max():.1f}%")
print(f"  Canonical WR: {CANONICAL['wr']:.1f}%")
print(f"  P-value (random >= canonical): {p_value:.6f}")
print(f"  Conclusion: {'ROBUST (p<0.001)' if p_value < 0.001 else 'WEAK (p>=0.001)'}")
results['random_replacement'] = {
    'rand_mean': float(rand_results.mean()), 'rand_max': float(rand_results.max()),
    'canonical_wr': CANONICAL['wr'], 'p_value': float(p_value)
}

# ─── 5. Label Permutation Test ────────────────────────────────────────────────
print("\n=== 5. LABEL PERMUTATION TEST (1,000 permutations) ===")
apex_mask = (df_clean['rel_txn'] >= D01_THRESH) & (df_clean['ov_range_vs_atr14'] >= D03_THRESH) & (df_clean['ov_dir'] == 1)
apex_returns = df_clean.loc[apex_mask, 'fwd_12_return_atr'].values
n_apex = len(apex_returns)

perm_wrs = []
for _ in range(1000):
    perm_labels = np.random.permutation(df_clean['fwd_12_return_atr'].values)
    perm_apex   = perm_labels[apex_mask.values]
    perm_wrs.append((perm_apex > 0).mean() * 100)

perm_wrs = np.array(perm_wrs)
perm_p   = (perm_wrs >= CANONICAL['wr']).mean()
print(f"  Permutation WR: mean={perm_wrs.mean():.1f}%, std={perm_wrs.std():.2f}%")
print(f"  Canonical WR: {CANONICAL['wr']:.1f}%")
print(f"  P-value (permutation >= canonical): {perm_p:.6f}")
print(f"  Z-score: {(CANONICAL['wr'] - perm_wrs.mean()) / perm_wrs.std():.2f}")
print(f"  Conclusion: {'ROBUST (p<0.001)' if perm_p < 0.001 else 'WEAK (p>=0.001)'}")
results['permutation'] = {
    'perm_mean': float(perm_wrs.mean()), 'perm_std': float(perm_wrs.std()),
    'canonical_wr': CANONICAL['wr'], 'p_value': float(perm_p),
    'z_score': float((CANONICAL['wr'] - perm_wrs.mean()) / perm_wrs.std())
}

# ─── 6. Time Shuffling ────────────────────────────────────────────────────────
print("\n=== 6. TIME SHUFFLING TEST ===")
# Shuffle the feature flags while keeping returns in place
# This destroys any temporal/autocorrelation structure
shuffle_wrs = []
for _ in range(1000):
    d01_shuf = df_clean['rel_txn'].sample(frac=1).values >= D01_THRESH
    d03_shuf = df_clean['ov_range_vs_atr14'].sample(frac=1).values >= D03_THRESH
    d02_shuf = df_clean['ov_dir'].sample(frac=1).values == 1
    shuf_mask = d01_shuf & d03_shuf & d02_shuf
    if shuf_mask.sum() < 10:
        continue
    fwd_s = df_clean.loc[shuf_mask, 'fwd_12_return_atr']
    shuffle_wrs.append((fwd_s > 0).mean() * 100)

shuffle_wrs = np.array(shuffle_wrs)
shuf_p = (shuffle_wrs >= CANONICAL['wr']).mean()
print(f"  Shuffled WR: mean={shuffle_wrs.mean():.1f}%, std={shuffle_wrs.std():.2f}%")
print(f"  Canonical WR: {CANONICAL['wr']:.1f}%")
print(f"  P-value (shuffled >= canonical): {shuf_p:.6f}")
print(f"  Conclusion: {'ROBUST (p<0.001)' if shuf_p < 0.001 else 'WEAK (p>=0.001)'}")
results['time_shuffle'] = {
    'shuf_mean': float(shuffle_wrs.mean()), 'shuf_std': float(shuffle_wrs.std()),
    'canonical_wr': CANONICAL['wr'], 'p_value': float(shuf_p)
}

# ─── VISUALISATIONS ───────────────────────────────────────────────────────────
print("\nGenerating adversarial test visualisations...")
plt.style.use('dark_background')
GREEN = '#22c55e'; RED = '#ef4444'; GOLD = '#f59e0b'; BLUE = '#3b82f6'

fig = plt.figure(figsize=(20, 18), facecolor='#0d1117')
gs  = gridspec.GridSpec(3, 2, figure=fig, hspace=0.45, wspace=0.35)

# Chart 1: D01 threshold sensitivity
ax1 = fig.add_subplot(gs[0, 0])
d01_t = [r['threshold'] for r in d01_results if not np.isnan(r['wr'])]
d01_w = [r['wr'] for r in d01_results if not np.isnan(r['wr'])]
d01_n = [r['n'] for r in d01_results if not np.isnan(r['wr'])]
ax1.plot(d01_t, d01_w, color=GREEN, marker='o', linewidth=2)
ax1.axvline(D01_THRESH, color=GOLD, linestyle='--', alpha=0.7, label=f'Canonical ({D01_THRESH})')
ax1.axhline(55, color=RED, linestyle=':', alpha=0.5, label='55% floor')
ax1.set_title('D01 Threshold Sensitivity\n(rel_txn threshold)', color='white', fontsize=11, fontweight='bold')
ax1.set_xlabel('D01 Threshold', color='white'); ax1.set_ylabel('Win Rate (%)', color='white')
ax1.tick_params(colors='white'); ax1.legend(fontsize=9)
ax1_twin = ax1.twinx()
ax1_twin.bar(d01_t, d01_n, alpha=0.2, color=BLUE, width=0.05)
ax1_twin.set_ylabel('N (bars)', color=BLUE); ax1_twin.tick_params(colors=BLUE)

# Chart 2: D03 threshold sensitivity
ax2 = fig.add_subplot(gs[0, 1])
d03_t = [r['threshold'] for r in d03_results if not np.isnan(r['wr'])]
d03_w = [r['wr'] for r in d03_results if not np.isnan(r['wr'])]
d03_n = [r['n'] for r in d03_results if not np.isnan(r['wr'])]
ax2.plot(d03_t, d03_w, color=GREEN, marker='o', linewidth=2)
ax2.axvline(D03_THRESH, color=GOLD, linestyle='--', alpha=0.7, label=f'Canonical ({D03_THRESH})')
ax2.axhline(55, color=RED, linestyle=':', alpha=0.5, label='55% floor')
ax2.set_title('D03 Threshold Sensitivity\n(ov_range_vs_atr14 threshold)', color='white', fontsize=11, fontweight='bold')
ax2.set_xlabel('D03 Threshold', color='white'); ax2.set_ylabel('Win Rate (%)', color='white')
ax2.tick_params(colors='white'); ax2.legend(fontsize=9)
ax2_twin = ax2.twinx()
ax2_twin.bar(d03_t, d03_n, alpha=0.2, color=BLUE, width=0.5)
ax2_twin.set_ylabel('N (bars)', color=BLUE); ax2_twin.tick_params(colors=BLUE)

# Chart 3: Component removal
ax3 = fig.add_subplot(gs[1, 0])
cr_names = [r['combo'] for r in combo_results]
cr_wrs   = [r['wr'] for r in combo_results]
cr_colors = [GREEN if wr >= 65 else GOLD if wr >= 55 else RED for wr in cr_wrs]
ax3.barh(cr_names, cr_wrs, color=cr_colors, alpha=0.85, edgecolor='white', linewidth=0.5)
ax3.axvline(55, color=GOLD, linestyle='--', alpha=0.7, label='55% floor')
ax3.axvline(CANONICAL['wr'], color=GREEN, linestyle='-', alpha=0.5, label=f'Canonical ({CANONICAL["wr"]:.1f}%)')
ax3.set_title('Component Removal Test\n(WR by combination)', color='white', fontsize=11, fontweight='bold')
ax3.set_xlabel('Win Rate (%)', color='white')
ax3.tick_params(colors='white', labelsize=9); ax3.legend(fontsize=9)

# Chart 4: Permutation test distribution
ax4 = fig.add_subplot(gs[1, 1])
ax4.hist(perm_wrs, bins=40, color=BLUE, alpha=0.85, edgecolor='white', linewidth=0.3, label='Permuted WR')
ax4.axvline(CANONICAL['wr'], color=GREEN, linewidth=2, label=f'Canonical WR ({CANONICAL["wr"]:.1f}%)')
ax4.axvline(perm_wrs.mean(), color=GOLD, linestyle='--', alpha=0.7, label=f'Perm mean ({perm_wrs.mean():.1f}%)')
ax4.set_title(f'Label Permutation Test\n(p={results["permutation"]["p_value"]:.6f}, Z={results["permutation"]["z_score"]:.2f})', 
              color='white', fontsize=11, fontweight='bold')
ax4.set_xlabel('Win Rate (%)', color='white'); ax4.set_ylabel('Count', color='white')
ax4.tick_params(colors='white'); ax4.legend(fontsize=9)

# Chart 5: Random variable replacement distribution
ax5 = fig.add_subplot(gs[2, 0])
ax5.hist(rand_results, bins=40, color=BLUE, alpha=0.85, edgecolor='white', linewidth=0.3, label='Random variables WR')
ax5.axvline(CANONICAL['wr'], color=GREEN, linewidth=2, label=f'Canonical WR ({CANONICAL["wr"]:.1f}%)')
ax5.axvline(rand_results.mean(), color=GOLD, linestyle='--', alpha=0.7, label=f'Random mean ({rand_results.mean():.1f}%)')
ax5.set_title(f'Random Variable Replacement\n(p={results["random_replacement"]["p_value"]:.6f})', 
              color='white', fontsize=11, fontweight='bold')
ax5.set_xlabel('Win Rate (%)', color='white'); ax5.set_ylabel('Count', color='white')
ax5.tick_params(colors='white'); ax5.legend(fontsize=9)

# Chart 6: Time shuffling distribution
ax6 = fig.add_subplot(gs[2, 1])
ax6.hist(shuffle_wrs, bins=40, color=BLUE, alpha=0.85, edgecolor='white', linewidth=0.3, label='Shuffled WR')
ax6.axvline(CANONICAL['wr'], color=GREEN, linewidth=2, label=f'Canonical WR ({CANONICAL["wr"]:.1f}%)')
ax6.axvline(shuffle_wrs.mean(), color=GOLD, linestyle='--', alpha=0.7, label=f'Shuffled mean ({shuffle_wrs.mean():.1f}%)')
ax6.set_title(f'Time Shuffling Test\n(p={results["time_shuffle"]["p_value"]:.6f})', 
              color='white', fontsize=11, fontweight='bold')
ax6.set_xlabel('Win Rate (%)', color='white'); ax6.set_ylabel('Count', color='white')
ax6.tick_params(colors='white'); ax6.legend(fontsize=9)

plt.suptitle('Atlas Sprint 058 — Adversarial Testing\n(Apex Combination 1: D-01 × D-03 × D-02_bull)', 
             color='white', fontsize=14, fontweight='bold')
plt.savefig(f'{CHARTS_DIR}/sprint058_adversarial.png', dpi=150, bbox_inches='tight', facecolor='#0d1117')
plt.close()
print(f"  Saved: sprint058_adversarial.png")

with open(f'{OUTPUT_DIR}/adversarial_results.json', 'w') as f:
    json.dump(results, f, indent=2, default=str)
print(f"Saved: {OUTPUT_DIR}/adversarial_results.json")
print("=== ADVERSARIAL TESTING COMPLETE ===")
