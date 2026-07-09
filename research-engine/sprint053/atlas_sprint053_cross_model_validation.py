"""
Atlas Sprint 053 — Cross-Model Validation
Phase 3: Test each Level 2/3 principle against A1, A2, A3 trade data.

For each principle, we test whether the core claim holds independently
across each model. Contradictions reduce PCS.
"""

import pandas as pd
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.gridspec as gridspec
from scipy import stats
import os, sys

sys.path.insert(0, '/home/ubuntu/Project-Atlas/research-engine')

# ─── Load FAE trade data ───────────────────────────────────────────────────────
# Use causal features file if available, otherwise base FAE trades
FAE_CAUSAL = '/home/ubuntu/Project-Atlas/research-engine/fae/fae_causal.csv'
FAE_BASE = '/home/ubuntu/Project-Atlas/research-engine/fae/fae_trades.csv'
FAE_PATH = FAE_CAUSAL if os.path.exists(FAE_CAUSAL) else FAE_BASE
print(f"Using FAE data: {FAE_PATH}")

df = pd.read_csv(FAE_PATH)
print(f"Loaded {len(df)} trades: A1={len(df[df.model=='A1'])}, A2={len(df[df.model=='A2'])}, A3={len(df[df.model=='A3'])}")

CHARTS_DIR = '/home/ubuntu/Project-Atlas/research/sprint-053-charts'
os.makedirs(CHARTS_DIR, exist_ok=True)

def win_rate(subset):
    # Exclude time_exits from WR calculation
    decisive = subset[subset['outcome'].isin(['win', 'loss'])]
    if len(decisive) == 0: return np.nan
    return (decisive['outcome'] == 'win').mean()

def pf(subset):
    decisive = subset[subset['outcome'].isin(['win', 'loss'])]
    wins = decisive[decisive['outcome'] == 'win']['net_pnl'].sum()
    losses = abs(decisive[decisive['outcome'] == 'loss']['net_pnl'].sum())
    return wins / losses if losses > 0 else np.nan

def test_principle(name, model_tests):
    """
    model_tests: dict of model -> (condition_mask, description)
    Returns a summary of results per model.
    """
    print(f"\n{'='*70}")
    print(f"PRINCIPLE: {name}")
    print(f"{'='*70}")
    results = {}
    for model, (mask, desc) in model_tests.items():
        subset = df[df.model == model]
        if len(subset) == 0:
            print(f"  {model}: NO DATA")
            continue
        in_condition = subset[mask(subset)]
        out_condition = subset[~mask(subset)]
        in_dec = in_condition[in_condition['outcome'].isin(['win','loss'])]
        out_dec = out_condition[out_condition['outcome'].isin(['win','loss'])]
        if len(in_dec) < 5 or len(out_dec) < 5:
            print(f"  {model}: INSUFFICIENT DATA (in={len(in_condition)}, out={len(out_condition)})")
            results[model] = {'verdict': 'INSUFFICIENT', 'in_n': len(in_condition), 'out_n': len(out_condition)}
            continue
        in_wr = win_rate(in_condition)
        out_wr = win_rate(out_condition)
        in_pf = pf(in_condition)
        out_pf = pf(out_condition)
        # Fisher's exact test on win/loss counts
        in_dec = in_condition[in_condition['outcome'].isin(['win','loss'])]
        out_dec = out_condition[out_condition['outcome'].isin(['win','loss'])]
        in_wins = (in_dec['outcome'] == 'win').sum()
        in_losses = (in_dec['outcome'] == 'loss').sum()
        out_wins = (out_dec['outcome'] == 'win').sum()
        out_losses = (out_dec['outcome'] == 'loss').sum()
        _, p_val = stats.fisher_exact([[in_wins, in_losses], [out_wins, out_losses]])
        direction = 'CONFIRMS' if in_wr > out_wr else 'CONTRADICTS'
        print(f"  {model}: {desc}")
        print(f"    In-condition:  N={len(in_condition):3d}, WR={in_wr:.1%}, PF={in_pf:.3f}")
        print(f"    Out-condition: N={len(out_condition):3d}, WR={out_wr:.1%}, PF={out_pf:.3f}")
        print(f"    p={p_val:.4f}  → {direction}")
        results[model] = {
            'verdict': direction, 'in_n': len(in_condition), 'out_n': len(out_condition),
            'in_wr': in_wr, 'out_wr': out_wr, 'in_pf': in_pf, 'out_pf': out_pf, 'p': p_val
        }
    return results

# ─── MP-001: Regime Dependence ────────────────────────────────────────────────
# Claim: Models perform better when in their designated regime vs out of it.
# For A1: ADX<30 is the compatible regime. For A2: ADX>45. For A3: VolComp active.
print("\n\n" + "="*70)
print("CROSS-MODEL VALIDATION RESULTS")
print("="*70)

mp001 = test_principle(
    "MP-001: Regime Dependence",
    {
        'A1': (lambda s: s['adx'] < 30, "In-regime: ADX<30"),
        'A2': (lambda s: s['adx'] > 45, "In-regime: ADX>45"),
        'A3': (lambda s: s['adx'] >= 25, "In-regime: ADX>=25 (compression threshold)"),
    }
)

# ─── MP-002: ADX Absolute Thresholds ─────────────────────────────────────────
# Claim: ADX operates as a categorical classifier. Different ADX bands produce
# qualitatively different outcomes for the same model.
mp002_a1 = test_principle(
    "MP-002: ADX Absolute Thresholds (A1 — low ADX better)",
    {
        'A1': (lambda s: s['adx'] < 30, "Low ADX (<30) vs High ADX (>=30)"),
        'A2': (lambda s: s['adx'] >= 45, "High ADX (>=45) vs Low ADX (<45)"),
        'A3': (lambda s: s['adx'] >= 25, "Moderate+ ADX (>=25) vs Low ADX (<25)"),
    }
)

# ─── MP-003: Session Asymmetry ────────────────────────────────────────────────
# Claim: Each model's edge is concentrated in its designated session window.
# A1: PM (12:00-16:00). A2: Late PM (14:00-16:00). A3: Overnight (18:00-06:00).
mp003 = test_principle(
    "MP-003: Session Asymmetry",
    {
        'A1': (lambda s: s['hour'].between(12, 15), "PM session (12:00-16:00)"),
        'A2': (lambda s: s['hour'].between(14, 15), "Late PM (14:00-16:00)"),
        'A3': (lambda s: (s['hour'] >= 18) | (s['hour'] < 6), "Pre-midnight overnight (18:00-06:00)"),
    }
)

# ─── MP-004: Volatility Contraction → Expansion ───────────────────────────────
# Claim: Compression precedes directional expansion. Models built on compression
# show better WR when compression is active vs not.
# Proxy: ATR ratio (short/long). We use stop_pts as a proxy for ATR at entry.
# Better proxy: check if the trade's stop_pts (= 1*ATR14) is below median (compression)
mp004 = test_principle(
    "MP-004: Volatility Contraction → Expansion Asymmetry",
    {
        'A1': (lambda s: s['stop_pts'] < s['stop_pts'].median(), "Low ATR (compression) vs High ATR"),
        'A2': (lambda s: s['stop_pts'] < s['stop_pts'].median(), "Low ATR (compression) vs High ATR"),
        'A3': (lambda s: s['stop_pts'] < s['stop_pts'].median(), "Low ATR (compression) vs High ATR"),
    }
)

# ─── MP-005: Loss Streaks as Regime Transitions ───────────────────────────────
# Claim: Consecutive losses predict future losses (regime transition signal).
# Test: WR when consec_losses=0 vs consec_losses>=1 vs consec_losses>=2
mp005 = test_principle(
    "MP-005: Loss Streaks as Regime Transitions",
    {
        'A1': (lambda s: s['consec_losses_before'] == 0, "No prior losses (fresh start)"),
        'A2': (lambda s: s['consec_losses_before'] == 0, "No prior losses (fresh start)"),
        'A3': (lambda s: s['consec_losses_before'] == 0, "No prior losses (fresh start)"),
    }
)

# ─── MP-006: Structural Anchoring ────────────────────────────────────────────
# Claim: Models with structural anchors outperform those without.
# Proxy: A1 and A2 have anchors; test whether their WR is higher than
# a "no anchor" baseline (random RTH entry in same regime).
# Since we can't test "no anchor" directly from FAE data, we test
# whether the depth constraint (pullback depth) correlates with outcome.
# Shallow pullbacks (close to anchor) should outperform deep ones.
mp006 = test_principle(
    "MP-006: Structural Anchoring (Pullback Depth)",
    {
        'A1': (lambda s: s['pb_depth'] < s['pb_depth'].median(), "Shallow pullback (close to anchor)"),
        'A2': (lambda s: s['stop_pts'] < s['stop_pts'].median(), "Tight stop (near structural support)"),
    }
)

# ─── MP-008: Theory of Edge ───────────────────────────────────────────────────
# Claim: Structurally-grounded models show stable WR across years.
# Test: Year-by-year WR stability for each model.
print(f"\n{'='*70}")
print("MP-008: Theory of Edge — Year-by-Year Stability")
print(f"{'='*70}")
for model in ['A1', 'A2', 'A3']:
    subset = df[df.model == model].copy()
    if 'entry_time' in subset.columns:
        subset['year'] = pd.to_datetime(subset['entry_time']).dt.year
    elif 'date' in subset.columns:
        subset['year'] = pd.to_datetime(subset['date']).dt.year
    else:
        # Try to infer from index
        print(f"  {model}: No date column found, skipping year analysis")
        continue
    print(f"\n  {model}:")
    for yr in sorted(subset['year'].unique()):
        yr_data = subset[subset['year'] == yr]
        wr = win_rate(yr_data)
        p = pf(yr_data)
        print(f"    {yr}: N={len(yr_data):3d}, WR={wr:.1%}, PF={p:.3f}")

# ─── Visualisation: Cross-Model Validation Matrix ─────────────────────────────
print("\n\nGenerating cross-model validation matrix chart...")

fig, axes = plt.subplots(2, 4, figsize=(18, 10))
fig.suptitle('Atlas Sprint 053 — Cross-Model Principle Validation Matrix', fontsize=14, fontweight='bold')

principles = [
    ('MP-001\nRegime\nDependence', mp001),
    ('MP-002\nADX\nThresholds', mp002_a1),
    ('MP-003\nSession\nAsymmetry', mp003),
    ('MP-004\nVolComp→\nExpansion', mp004),
    ('MP-005\nLoss Streaks\n= Regime', mp005),
    ('MP-006\nStructural\nAnchoring', mp006),
]

models = ['A1', 'A2', 'A3']
colors = {'CONFIRMS': '#2ecc71', 'CONTRADICTS': '#e74c3c', 'INSUFFICIENT': '#95a5a6', 'N/A': '#bdc3c7'}

for idx, (pname, presults) in enumerate(principles):
    row, col = divmod(idx, 4)
    ax = axes[row][col]
    
    bar_data = []
    bar_colors = []
    bar_labels = []
    
    for model in models:
        if model not in presults:
            bar_data.append(0)
            bar_colors.append(colors['N/A'])
            bar_labels.append('N/A')
        elif presults[model]['verdict'] == 'INSUFFICIENT':
            bar_data.append(0)
            bar_colors.append(colors['INSUFFICIENT'])
            bar_labels.append('INSUF')
        else:
            r = presults[model]
            wr_diff = r['in_wr'] - r['out_wr']
            bar_data.append(wr_diff * 100)
            bar_colors.append(colors[r['verdict']])
            bar_labels.append(f"{r['verdict'][:4]}\np={r['p']:.3f}")
    
    bars = ax.bar(models, bar_data, color=bar_colors, alpha=0.85, edgecolor='white', linewidth=1.5)
    ax.axhline(y=0, color='black', linewidth=0.8, linestyle='--', alpha=0.5)
    ax.set_title(pname, fontsize=9, fontweight='bold')
    ax.set_ylabel('WR Δ (in - out) %', fontsize=7)
    ax.tick_params(labelsize=8)
    
    for bar, label in zip(bars, bar_labels):
        height = bar.get_height()
        ax.text(bar.get_x() + bar.get_width()/2., height + (0.3 if height >= 0 else -1.5),
                label, ha='center', va='bottom', fontsize=6)

# Last two cells: summary table
ax_summary = axes[1][3]
ax_summary.axis('off')
summary_text = "VALIDATION SUMMARY\n\n"
summary_text += f"{'Principle':<12} {'A1':>6} {'A2':>6} {'A3':>6}\n"
summary_text += "-" * 34 + "\n"
for pname_short, presults in [
    ('MP-001', mp001), ('MP-002', mp002_a1), ('MP-003', mp003),
    ('MP-004', mp004), ('MP-005', mp005), ('MP-006', mp006)
]:
    row_str = f"{pname_short:<12}"
    for model in models:
        if model not in presults:
            row_str += f"{'N/A':>6}"
        elif presults[model]['verdict'] == 'INSUFFICIENT':
            row_str += f"{'INSUF':>6}"
        else:
            v = presults[model]['verdict'][:4]
            row_str += f"{v:>6}"
    summary_text += row_str + "\n"

ax_summary.text(0.05, 0.95, summary_text, transform=ax_summary.transAxes,
                fontsize=8, verticalalignment='top', fontfamily='monospace',
                bbox=dict(boxstyle='round', facecolor='#f8f9fa', alpha=0.8))

plt.tight_layout()
plt.savefig(f'{CHARTS_DIR}/sprint053_cross_model_validation.png', dpi=150, bbox_inches='tight')
plt.close()
print(f"Saved: {CHARTS_DIR}/sprint053_cross_model_validation.png")

# ─── PCS Chart ────────────────────────────────────────────────────────────────
import json
with open('/home/ubuntu/Project-Atlas/research-engine/sprint053/pcs_results.json') as f:
    pcs_data = json.load(f)

pcs_data.sort(key=lambda x: x['pcs'], reverse=True)

fig, ax = plt.subplots(figsize=(12, 7))
names = [f"{d['id']}\n{d['name'][:28]}" for d in pcs_data]
scores = [d['pcs'] for d in pcs_data]
levels = [d['level_candidate'] for d in pcs_data]
level_colors = {1: '#95a5a6', 2: '#3498db', 3: '#2ecc71'}
bar_colors = [level_colors[l] for l in levels]

bars = ax.barh(names, scores, color=bar_colors, alpha=0.85, edgecolor='white', linewidth=1.5)
ax.axvline(x=60, color='#e74c3c', linewidth=1.5, linestyle='--', alpha=0.7, label='L2 threshold (60)')
ax.axvline(x=70, color='#e67e22', linewidth=1.5, linestyle='--', alpha=0.7, label='L3 threshold (70)')
ax.set_xlabel('Principle Confidence Score (PCS)', fontsize=11)
ax.set_title('Atlas Market Principles — Principle Confidence Scores', fontsize=13, fontweight='bold')
ax.set_xlim(0, 100)

for bar, score in zip(bars, scores):
    ax.text(score + 0.5, bar.get_y() + bar.get_height()/2., f'{score:.1f}',
            va='center', ha='left', fontsize=9, fontweight='bold')

from matplotlib.patches import Patch
legend_elements = [
    Patch(facecolor='#2ecc71', alpha=0.85, label='Level 3 — Market Principle'),
    Patch(facecolor='#3498db', alpha=0.85, label='Level 2 — Strategy Family Principle'),
    Patch(facecolor='#95a5a6', alpha=0.85, label='Level 1 — Model-Specific'),
]
ax.legend(handles=legend_elements, loc='lower right', fontsize=9)
ax.invert_yaxis()
plt.tight_layout()
plt.savefig(f'{CHARTS_DIR}/sprint053_pcs_scores.png', dpi=150, bbox_inches='tight')
plt.close()
print(f"Saved: {CHARTS_DIR}/sprint053_pcs_scores.png")

print("\n=== CROSS-MODEL VALIDATION COMPLETE ===")
