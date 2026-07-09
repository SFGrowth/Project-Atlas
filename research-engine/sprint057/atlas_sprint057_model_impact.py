"""
Atlas Sprint 057 — Model Impact Assessment

Tests the top validated interaction combinations against:
  - Model A1 trade dataset
  - Model A2 trade dataset
  - Model A3 trade dataset
  - ARI rules (consecutive loss protection)
  - Portfolio construction

For each model, measures:
  - PF improvement when interaction conditions are met
  - WR improvement
  - Trade count retained
  - Year-by-year stability
  - Recommendation: Filter / Enhance / No Impact
"""

import pandas as pd
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.gridspec as gridspec
import warnings, json, os
warnings.filterwarnings('ignore')

FEAT_PATH   = '/home/ubuntu/Project-Atlas/research-engine/sprint056/discovery_features_rth.csv'
FAE_PATH    = '/home/ubuntu/Project-Atlas/research-engine/fae/fae_causal.csv'
OUTPUT_DIR  = '/home/ubuntu/Project-Atlas/research-engine/sprint057'
CHARTS_DIR  = '/home/ubuntu/Project-Atlas/research/sprint-057-charts'
os.makedirs(OUTPUT_DIR, exist_ok=True)
os.makedirs(CHARTS_DIR, exist_ok=True)

print("Loading datasets...")
df_feat = pd.read_csv(FEAT_PATH)
df_feat['ts'] = pd.to_datetime(df_feat['ts'])

df_fae = pd.read_csv(FAE_PATH)
df_fae['entry_ts'] = pd.to_datetime(df_fae['entry_time'])
print(f"  Feature matrix: {len(df_feat):,} RTH bars")
print(f"  FAE trade dataset: {len(df_fae):,} trades")
print(f"  Models: {df_fae['model'].value_counts().to_dict()}")

# ─── Merge interaction flags onto trade dataset ───────────────────────────────
# For each trade, look up the interaction flags at the entry bar
df_feat['ts_rounded'] = pd.to_datetime(df_feat['ts']).dt.tz_localize(None).dt.floor('5min')
df_fae['ts_rounded']  = df_fae['entry_ts'].dt.tz_localize(None).dt.floor('5min')

# Compute flags on feature matrix
df_feat['MP001'] = (df_feat['ema_alignment'] != 0).astype(int)
df_feat['MP002'] = (df_feat['adx14'] >= 25).astype(int)
df_feat['MP003'] = (df_feat['hour'] >= 13).astype(int)
df_feat['MP004'] = (df_feat['volcomp_5_14'] < 0.85).astype(int)
df_feat['D01']   = (df_feat['rel_txn'] >= 1.33).astype(int)
df_feat['D02_bull'] = (df_feat['ov_dir'] == 1).astype(int)
df_feat['D02_bear'] = (df_feat['ov_dir'] == -1).astype(int)
df_feat['D03']   = (df_feat['ov_range_vs_atr14'] >= 10.85).astype(int)
df_feat['D08']   = (df_feat['day_range_vs_atr14'] >= 12.12).astype(int)

flag_cols = ['MP001', 'MP002', 'MP003', 'MP004', 'D01', 'D02_bull', 'D02_bear', 'D03', 'D08',
             'adx14', 'rel_txn', 'ov_dir', 'ov_range_vs_atr14', 'day_range_vs_atr14',
             'volcomp_5_14', 'ema_alignment']

# Merge flags onto trade dataset
df_merged = df_fae.merge(
    df_feat[['ts_rounded'] + flag_cols].drop_duplicates('ts_rounded'),
    on='ts_rounded', how='left'
)
print(f"  Merged trades: {len(df_merged):,} (matched: {df_merged['D01'].notna().sum():,})")

# ─── Model impact function ────────────────────────────────────────────────────
def model_impact(df_model, condition_mask, condition_name, model_name):
    """Measure PF/WR improvement for trades meeting the condition."""
    n_total = len(df_model)
    n_cond  = condition_mask.sum()
    pct_retained = n_cond / n_total * 100

    # Baseline metrics
    wins_base = df_model[df_model['is_win'] == 1]['pnl_r']
    loss_base = df_model[df_model['is_win'] == 0]['pnl_r'].abs()
    pf_base   = wins_base.sum() / (loss_base.sum() + 1e-6)
    wr_base   = df_model['is_win'].mean() * 100

    # Condition metrics
    df_cond   = df_model[condition_mask]
    wins_cond = df_cond[df_cond['is_win'] == 1]['pnl_r']
    loss_cond = df_cond[df_cond['is_win'] == 0]['pnl_r'].abs()
    pf_cond   = wins_cond.sum() / (loss_cond.sum() + 1e-6)
    wr_cond   = df_cond['is_win'].mean() * 100 if len(df_cond) > 0 else 0

    # Year stability
    year_wr = {}
    for yr in [2024, 2025, 2026]:
        g = df_cond[df_cond['entry_ts'].dt.year == yr]
        if len(g) >= 10:
            year_wr[yr] = g['is_win'].mean() * 100

    return {
        'model': model_name, 'condition': condition_name,
        'n_total': n_total, 'n_cond': n_cond, 'pct_retained': pct_retained,
        'pf_base': pf_base, 'pf_cond': pf_cond, 'pf_delta': pf_cond - pf_base,
        'wr_base': wr_base, 'wr_cond': wr_cond, 'wr_delta': wr_cond - wr_base,
        'year_wr': year_wr,
    }

# ─── Test top interactions on each model ──────────────────────────────────────
print("\n=== MODEL IMPACT ASSESSMENT ===")

# Define the top interactions to test
interactions = {
    'D01×D08':          lambda d: (d['D01']==1) & (d['D08']==1),
    'D01×D03':          lambda d: (d['D01']==1) & (d['D03']==1),
    'D01×D03×D02_bull': lambda d: (d['D01']==1) & (d['D03']==1) & (d['D02_bull']==1),
    'D01×D08×D02_bull': lambda d: (d['D01']==1) & (d['D08']==1) & (d['D02_bull']==1),
    'D03×D02_bull':     lambda d: (d['D03']==1) & (d['D02_bull']==1),
    'D08×D02_bull':     lambda d: (d['D08']==1) & (d['D02_bull']==1),
    'D01 only':         lambda d: (d['D01']==1),
    'D03 only':         lambda d: (d['D03']==1),
    'D08 only':         lambda d: (d['D08']==1),
}

all_impact_results = []
for model_name in ['A1', 'A2', 'A3']:
    df_model = df_merged[df_merged['model'] == model_name].copy()
    # Add is_win and pnl_r columns
    df_model['is_win'] = (df_model['outcome'] == 'win').astype(int)
    df_model['pnl_r']  = df_model['net_pnl']
    if len(df_model) < 20:
        print(f"  {model_name}: insufficient trades ({len(df_model)}), skipping")
        continue
    
    print(f"\n  Model {model_name} (N={len(df_model):,}):")
    print(f"  {'Interaction':<25} {'N':>5} {'%':>5} {'PF_base':>8} {'PF_cond':>8} {'ΔPF':>7} {'WR_base':>8} {'WR_cond':>8} {'ΔWR':>7}")
    print("  " + "-"*90)
    
    for int_name, int_func in interactions.items():
        try:
            mask = int_func(df_model)
            if mask.sum() < 10:
                continue
            result = model_impact(df_model, mask, int_name, model_name)
            all_impact_results.append(result)
            print(f"  {int_name:<25} {result['n_cond']:>5} {result['pct_retained']:>4.0f}% "
                  f"{result['pf_base']:>8.3f} {result['pf_cond']:>8.3f} {result['pf_delta']:>+7.3f} "
                  f"{result['wr_base']:>7.1f}% {result['wr_cond']:>7.1f}% {result['wr_delta']:>+6.1f}%")
        except Exception as e:
            print(f"  {int_name}: Error - {e}")

# ─── ARI impact assessment ────────────────────────────────────────────────────
print("\n=== ARI IMPACT ASSESSMENT ===")
# Test whether the interactions can improve ARI's trade selection
# ARI currently uses: consec_losses >= 2 → pause
# Question: can D01×D03×D02_bull identify HIGH QUALITY setups that should override the ARI pause?

# Find trades where ARI would pause (consec_losses >= 2) but the interaction is active
df_merged['is_win'] = (df_merged['outcome'] == 'win').astype(int)
df_merged['pnl_r']  = df_merged['net_pnl']
if 'consec_losses_before' in df_merged.columns:
    ari_pause = df_merged['consec_losses_before'] >= 2
    d01_d03_bull = (df_merged['D01']==1) & (df_merged['D03']==1) & (df_merged['D02_bull']==1)
    
    print(f"\n  ARI pause trades: {ari_pause.sum():,}")
    print(f"  ARI pause + D01×D03×D02_bull: {(ari_pause & d01_d03_bull).sum():,}")
    
    for model_name in ['A1', 'A2', 'A3']:
        df_m = df_merged[df_merged['model'] == model_name]
        pause_m = df_m['consec_losses_before'] >= 2
        override_m = pause_m & (df_m['D01']==1) & (df_m['D03']==1) & (df_m['D02_bull']==1)
        if override_m.sum() >= 5:
            wr_override = df_m[override_m]['is_win'].mean() * 100
            wr_pause    = df_m[pause_m]['is_win'].mean() * 100
            print(f"  {model_name}: ARI pause WR={wr_pause:.1f}% | Override WR={wr_override:.1f}% (N={override_m.sum()})")

# ─── Portfolio construction impact ────────────────────────────────────────────
print("\n=== PORTFOLIO CONSTRUCTION IMPACT ===")
# Test the impact of the top interaction as a portfolio-level filter
# If D01×D03×D02_bull is active, increase position sizing by 1.5x
# If D01×D08×D02_bear is active, reduce position sizing to 0.5x

for interaction_name, int_func in [
    ('D01×D03×D02_bull (enhance)', lambda d: (d['D01']==1) & (d['D03']==1) & (d['D02_bull']==1)),
    ('D01×D08×D02_bear (reduce)',  lambda d: (d['D01']==1) & (d['D08']==1) & (d['D02_bear']==1)),
]:
    mask = int_func(df_merged)
    grp  = df_merged[mask]
    if len(grp) < 20:
        continue
    wr   = grp['is_win'].mean() * 100
    pf   = grp[grp['is_win']==1]['pnl_r'].sum() / (grp[grp['is_win']==0]['pnl_r'].abs().sum() + 1e-6)
    print(f"  {interaction_name}: N={len(grp):,} | WR={wr:.1f}% | PF={pf:.3f}")

# ─── VISUALISATIONS ───────────────────────────────────────────────────────────
print("\nGenerating model impact visualisation...")
plt.style.use('dark_background')

if all_impact_results:
    # Filter to show only meaningful results
    df_impact = pd.DataFrame(all_impact_results)
    df_impact = df_impact[df_impact['pct_retained'] >= 15]  # At least 15% of trades
    
    fig, axes = plt.subplots(1, 3, figsize=(21, 8), facecolor='#0d1117')
    fig.suptitle('Atlas Sprint 057 — Model Impact Assessment\n(Interaction Conditions vs Baseline)', 
                 color='white', fontsize=13, fontweight='bold')
    
    models = ['A1', 'A2', 'A3']
    colors_pos = '#22c55e'
    colors_neg = '#ef4444'
    
    for idx, model_name in enumerate(models):
        ax = axes[idx]
        df_m = df_impact[df_impact['model'] == model_name].copy()
        if len(df_m) == 0:
            ax.set_visible(False)
            continue
        
        df_m = df_m.sort_values('pf_delta', ascending=True)
        bar_colors = [colors_pos if v >= 0 else colors_neg for v in df_m['pf_delta']]
        
        bars = ax.barh(df_m['condition'], df_m['pf_delta'], color=bar_colors, 
                       alpha=0.85, edgecolor='white', linewidth=0.5)
        ax.axvline(0, color='white', linewidth=0.8)
        ax.set_title(f'Model {model_name}\nΔ Profit Factor vs Baseline', 
                     color='white', fontsize=11, fontweight='bold')
        ax.set_xlabel('ΔPF (positive = improvement)', color='white')
        ax.tick_params(colors='white', labelsize=8)
        
        for bar, row in zip(bars, df_m.itertuples(index=False)):
            x_pos = bar.get_width()
            ax.text(x_pos + (0.01 if x_pos >= 0 else -0.01), 
                    bar.get_y() + bar.get_height()/2,
                    f'{row.pf_delta:+.3f} ({row.pct_retained:.0f}%)',
                    va='center', ha='left' if x_pos >= 0 else 'right',
                    color='white', fontsize=7)
    
    plt.tight_layout()
    plt.savefig(f'{CHARTS_DIR}/sprint057_model_impact.png', dpi=150, bbox_inches='tight',
                facecolor='#0d1117')
    plt.close()
    print(f"  Saved: sprint057_model_impact.png")

# ─── Save results ─────────────────────────────────────────────────────────────
with open(f'{OUTPUT_DIR}/model_impact_results.json', 'w') as f:
    json.dump(all_impact_results, f, indent=2, default=str)

print(f"\nSaved: {OUTPUT_DIR}/model_impact_results.json")
print("=== MODEL IMPACT ASSESSMENT COMPLETE ===")
