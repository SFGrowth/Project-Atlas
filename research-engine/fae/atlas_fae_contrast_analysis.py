"""
Atlas Sprint 051 — FAE Statistical Contrast Analysis
Compares winning vs losing trade feature distributions per model.
Uses Cohen's d, Mann-Whitney U, t-test, and Information Gain.
Produces ranked feature importance table and visualisations.
"""

import pandas as pd
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.gridspec as gridspec
from scipy import stats
from sklearn.feature_selection import mutual_info_classif
import warnings
import os
warnings.filterwarnings('ignore')

DATA_FILE  = '/home/ubuntu/Project-Atlas/research-engine/fae/fae_trades.csv'
OUTPUT_DIR = '/home/ubuntu/Project-Atlas/research/sprint-051-charts'
os.makedirs(OUTPUT_DIR, exist_ok=True)

# ─── Load data ────────────────────────────────────────────────────────────────
df = pd.read_csv(DATA_FILE)
print(f"Loaded {len(df)} trades")

# For contrast analysis: use only hard wins and losses (exclude time_exits)
df_wl = df[df['outcome'].isin(['win', 'loss'])].copy()
df_wl['is_win_bin'] = (df_wl['outcome'] == 'win').astype(int)
print(f"Win/Loss only: {len(df_wl)} trades ({(df_wl['outcome']=='win').sum()} wins, {(df_wl['outcome']=='loss').sum()} losses)")

# Feature columns for analysis
FEATURES = [
    'adx', 'adx_slope', 'ema_spread_atr', 'trend_maturity',
    'atr14', 'atr_accel', 'atr14_pct', 'stop_pts',
    'pb_depth', 'bars_since_impulse',
    'dist_vwap_atr', 'dist_pdh_atr', 'dist_pdl_atr',
    'dist_wkh_atr', 'dist_wkl_atr', 'rel_vol',
    'impulse_size_atr', 'flag_range_atr',
    'consec_wins_before', 'consec_losses_before',
    'daily_pnl_at_entry', 'ari_caution',
    'hour', 'dow', 'month',
]

# ─── Cohen's d helper ─────────────────────────────────────────────────────────
def cohens_d(a, b):
    """Compute Cohen's d effect size between two groups."""
    na, nb = len(a), len(b)
    if na < 3 or nb < 3:
        return np.nan
    pooled_std = np.sqrt(((na - 1) * np.var(a, ddof=1) + (nb - 1) * np.var(b, ddof=1)) / (na + nb - 2))
    if pooled_std == 0:
        return np.nan
    return (np.mean(a) - np.mean(b)) / pooled_std

# ─── Per-model contrast analysis ──────────────────────────────────────────────
all_results = []

for model in ['A1', 'A2', 'A3']:
    sub = df_wl[df_wl['model'] == model]
    wins  = sub[sub['outcome'] == 'win']
    losses = sub[sub['outcome'] == 'loss']
    nw, nl = len(wins), len(losses)
    print(f"\n{'='*60}")
    print(f"MODEL {model}: {nw} wins, {nl} losses")
    print(f"{'='*60}")

    model_results = []
    for feat in FEATURES:
        w_vals = wins[feat].dropna().values
        l_vals = losses[feat].dropna().values
        if len(w_vals) < 5 or len(l_vals) < 5:
            continue

        # Cohen's d
        d = cohens_d(w_vals, l_vals)

        # Mann-Whitney U test
        try:
            mw_stat, mw_p = stats.mannwhitneyu(w_vals, l_vals, alternative='two-sided')
        except:
            mw_p = 1.0

        # t-test
        try:
            t_stat, t_p = stats.ttest_ind(w_vals, l_vals, equal_var=False)
        except:
            t_p = 1.0

        # Information Gain (mutual info)
        all_vals = sub[feat].dropna()
        all_labels = sub.loc[all_vals.index, 'is_win_bin']
        try:
            ig = mutual_info_classif(all_vals.values.reshape(-1, 1), all_labels.values,
                                     discrete_features=False, random_state=42)[0]
        except:
            ig = 0.0

        model_results.append({
            'model': model,
            'feature': feat,
            'win_mean': np.mean(w_vals),
            'loss_mean': np.mean(l_vals),
            'win_median': np.median(w_vals),
            'loss_median': np.median(l_vals),
            'cohens_d': d,
            'abs_cohens_d': abs(d) if not np.isnan(d) else 0,
            'mw_pvalue': mw_p,
            'ttest_pvalue': t_p,
            'info_gain': ig,
            'n_wins': len(w_vals),
            'n_losses': len(l_vals),
            'significant': (mw_p < 0.05) and (abs(d) > 0.20 if not np.isnan(d) else False),
        })

    # Sort by absolute Cohen's d
    model_results.sort(key=lambda x: x['abs_cohens_d'], reverse=True)
    all_results.extend(model_results)

    # Print top features
    print(f"\n{'Feature':<25} {'Win Mean':>10} {'Loss Mean':>10} {'Cohen d':>9} {'MW p':>9} {'IG':>8} {'Sig':>5}")
    print("-" * 80)
    for r in model_results[:15]:
        sig = '***' if r['mw_pvalue'] < 0.001 else ('**' if r['mw_pvalue'] < 0.01 else ('*' if r['mw_pvalue'] < 0.05 else ''))
        d_str = f"{r['cohens_d']:+.3f}" if not np.isnan(r['cohens_d']) else '   nan'
        print(f"{r['feature']:<25} {r['win_mean']:>10.3f} {r['loss_mean']:>10.3f} {d_str:>9} {r['mw_pvalue']:>9.4f} {r['info_gain']:>8.4f} {sig:>5}")

# ─── Save results ─────────────────────────────────────────────────────────────
results_df = pd.DataFrame(all_results)
results_df.to_csv('/home/ubuntu/Project-Atlas/research-engine/fae/fae_contrast_results.csv', index=False)
print("\nContrast results saved.")

# ─── Cross-model significant features ─────────────────────────────────────────
print("\n" + "="*60)
print("CROSS-MODEL SIGNIFICANT FEATURES (|d|>0.3, p<0.05)")
print("="*60)
sig_df = results_df[(results_df['abs_cohens_d'] > 0.3) & (results_df['mw_pvalue'] < 0.05)]
print(sig_df[['model','feature','win_mean','loss_mean','cohens_d','mw_pvalue','info_gain']].to_string(index=False))

# ─── Visualisations ───────────────────────────────────────────────────────────
print("\nGenerating visualisations...")

# Figure 1: Top features per model (box plots)
fig, axes = plt.subplots(3, 5, figsize=(20, 14))
fig.suptitle('FAE Contrast Analysis: Win vs Loss Feature Distributions\n(Sprint 051 — Atlas Failure Analysis Engine)',
             fontsize=14, fontweight='bold')

model_colors = {'A1': ('#2196F3', '#F44336'), 'A2': ('#4CAF50', '#FF9800'), 'A3': ('#9C27B0', '#E91E63')}

for row_idx, model in enumerate(['A1', 'A2', 'A3']):
    sub = df_wl[df_wl['model'] == model]
    wins  = sub[sub['outcome'] == 'win']
    losses = sub[sub['outcome'] == 'loss']
    model_res = [r for r in all_results if r['model'] == model]
    model_res.sort(key=lambda x: x['abs_cohens_d'], reverse=True)
    top5 = [r for r in model_res if not np.isnan(r['cohens_d'])][:5]

    win_c, loss_c = model_colors[model]
    for col_idx, feat_res in enumerate(top5):
        ax = axes[row_idx, col_idx]
        feat = feat_res['feature']
        w_data = wins[feat].dropna().values
        l_data = losses[feat].dropna().values

        bp = ax.boxplot([w_data, l_data], patch_artist=True,
                        medianprops={'color': 'black', 'linewidth': 2},
                        whiskerprops={'linewidth': 1.5},
                        capprops={'linewidth': 1.5},
                        flierprops={'marker': 'o', 'markersize': 3, 'alpha': 0.5})
        bp['boxes'][0].set_facecolor(win_c + '80')
        bp['boxes'][1].set_facecolor(loss_c + '80')

        ax.set_xticklabels(['Win', 'Loss'], fontsize=9)
        d_val = feat_res['cohens_d']
        p_val = feat_res['mw_pvalue']
        sig = '***' if p_val < 0.001 else ('**' if p_val < 0.01 else ('*' if p_val < 0.05 else ''))
        ax.set_title(f'{model}: {feat}\nd={d_val:+.2f} {sig}', fontsize=9, fontweight='bold')
        ax.tick_params(labelsize=8)
        ax.grid(True, alpha=0.3)

plt.tight_layout()
plt.savefig(os.path.join(OUTPUT_DIR, 'fae_contrast_boxplots.png'), dpi=150, bbox_inches='tight')
plt.close()
print("  Saved: fae_contrast_boxplots.png")

# Figure 2: Cohen's d heatmap across models and features
pivot_data = results_df.pivot_table(index='feature', columns='model', values='cohens_d')
pivot_data = pivot_data.reindex(pivot_data.abs().max(axis=1).sort_values(ascending=False).index)

fig, ax = plt.subplots(figsize=(10, 12))
im = ax.imshow(pivot_data.values, cmap='RdBu_r', aspect='auto', vmin=-1, vmax=1)
ax.set_xticks(range(len(pivot_data.columns)))
ax.set_xticklabels(pivot_data.columns, fontsize=12, fontweight='bold')
ax.set_yticks(range(len(pivot_data.index)))
ax.set_yticklabels(pivot_data.index, fontsize=10)
plt.colorbar(im, ax=ax, label="Cohen's d (positive = higher in wins)")
ax.set_title("Cohen's d: Win vs Loss Feature Differences\n(Sprint 051 FAE — Blue=Higher in Wins, Red=Higher in Losses)",
             fontsize=12, fontweight='bold')

# Annotate cells
for i in range(len(pivot_data.index)):
    for j in range(len(pivot_data.columns)):
        val = pivot_data.values[i, j]
        if not np.isnan(val):
            ax.text(j, i, f'{val:+.2f}', ha='center', va='center',
                    fontsize=8, color='black' if abs(val) < 0.5 else 'white')

plt.tight_layout()
plt.savefig(os.path.join(OUTPUT_DIR, 'fae_cohens_d_heatmap.png'), dpi=150, bbox_inches='tight')
plt.close()
print("  Saved: fae_cohens_d_heatmap.png")

# Figure 3: Information Gain bar chart
fig, axes = plt.subplots(1, 3, figsize=(18, 8))
fig.suptitle('Information Gain: Feature Importance for Win/Loss Classification\n(Sprint 051 FAE)',
             fontsize=13, fontweight='bold')

for ax, model in zip(axes, ['A1', 'A2', 'A3']):
    model_res = [r for r in all_results if r['model'] == model]
    model_res.sort(key=lambda x: x['info_gain'], reverse=True)
    top10 = model_res[:12]
    feats = [r['feature'] for r in top10]
    igs   = [r['info_gain'] for r in top10]
    colors = ['#2196F3' if r['mw_pvalue'] < 0.05 else '#BDBDBD' for r in top10]
    bars = ax.barh(range(len(feats)), igs, color=colors)
    ax.set_yticks(range(len(feats)))
    ax.set_yticklabels(feats, fontsize=9)
    ax.set_xlabel('Information Gain', fontsize=10)
    ax.set_title(f'Model {model}', fontsize=12, fontweight='bold')
    ax.invert_yaxis()
    ax.grid(True, alpha=0.3, axis='x')
    # Add value labels
    for bar, ig in zip(bars, igs):
        ax.text(ig + 0.001, bar.get_y() + bar.get_height()/2,
                f'{ig:.3f}', va='center', fontsize=8)

# Legend
from matplotlib.patches import Patch
legend_elements = [Patch(facecolor='#2196F3', label='p<0.05 (significant)'),
                   Patch(facecolor='#BDBDBD', label='p≥0.05 (not significant)')]
axes[0].legend(handles=legend_elements, loc='lower right', fontsize=9)

plt.tight_layout()
plt.savefig(os.path.join(OUTPUT_DIR, 'fae_information_gain.png'), dpi=150, bbox_inches='tight')
plt.close()
print("  Saved: fae_information_gain.png")

# Figure 4: ADX distribution for wins vs losses (key feature)
fig, axes = plt.subplots(1, 3, figsize=(18, 6))
fig.suptitle('ADX Distribution: Wins vs Losses\n(Sprint 051 FAE)', fontsize=13, fontweight='bold')

for ax, model in zip(axes, ['A1', 'A2', 'A3']):
    sub = df_wl[df_wl['model'] == model]
    wins  = sub[sub['outcome'] == 'win']['adx'].dropna()
    losses = sub[sub['outcome'] == 'loss']['adx'].dropna()
    ax.hist(wins.values, bins=20, alpha=0.6, color='#2196F3', label=f'Wins (n={len(wins)})', density=True)
    ax.hist(losses.values, bins=20, alpha=0.6, color='#F44336', label=f'Losses (n={len(losses)})', density=True)
    ax.axvline(wins.mean(), color='#1565C0', linestyle='--', linewidth=2, label=f'Win mean={wins.mean():.1f}')
    ax.axvline(losses.mean(), color='#B71C1C', linestyle='--', linewidth=2, label=f'Loss mean={losses.mean():.1f}')
    d_val = cohens_d(wins.values, losses.values)
    _, p_val = stats.mannwhitneyu(wins.values, losses.values, alternative='two-sided')
    ax.set_title(f'Model {model}\nd={d_val:+.3f}, p={p_val:.4f}', fontsize=11, fontweight='bold')
    ax.set_xlabel('ADX', fontsize=10)
    ax.set_ylabel('Density', fontsize=10)
    ax.legend(fontsize=9)
    ax.grid(True, alpha=0.3)

plt.tight_layout()
plt.savefig(os.path.join(OUTPUT_DIR, 'fae_adx_win_loss.png'), dpi=150, bbox_inches='tight')
plt.close()
print("  Saved: fae_adx_win_loss.png")

# Figure 5: Time of day win rate heatmap
fig, axes = plt.subplots(1, 3, figsize=(18, 6))
fig.suptitle('Win Rate by Hour of Day\n(Sprint 051 FAE)', fontsize=13, fontweight='bold')

for ax, model in zip(axes, ['A1', 'A2', 'A3']):
    sub = df_wl[df_wl['model'] == model]
    hour_wr = sub.groupby('hour').apply(lambda x: (x['outcome']=='win').mean())
    hour_n  = sub.groupby('hour').size()
    valid_hours = hour_n[hour_n >= 5].index
    hour_wr = hour_wr[valid_hours]
    bars = ax.bar(hour_wr.index, hour_wr.values, color=['#2196F3' if v > 0.4 else '#F44336' for v in hour_wr.values])
    for bar, (h, wr) in zip(bars, hour_wr.items()):
        n = hour_n[h]
        ax.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 0.01,
                f'n={n}', ha='center', va='bottom', fontsize=8)
    ax.axhline(sub['is_win_bin'].mean(), color='black', linestyle='--', linewidth=1.5, label=f'Overall WR={sub["is_win_bin"].mean():.1%}')
    ax.set_title(f'Model {model}', fontsize=11, fontweight='bold')
    ax.set_xlabel('Hour (ET)', fontsize=10)
    ax.set_ylabel('Win Rate', fontsize=10)
    ax.set_ylim(0, 1.0)
    ax.legend(fontsize=9)
    ax.grid(True, alpha=0.3, axis='y')

plt.tight_layout()
plt.savefig(os.path.join(OUTPUT_DIR, 'fae_hour_winrate.png'), dpi=150, bbox_inches='tight')
plt.close()
print("  Saved: fae_hour_winrate.png")

print("\n=== CONTRAST ANALYSIS COMPLETE ===")
print(f"Significant features (|d|>0.3, p<0.05): {len(sig_df)}")
print("\nTop 5 features by Cohen's d across all models:")
top_overall = results_df.nlargest(10, 'abs_cohens_d')[['model','feature','cohens_d','mw_pvalue','info_gain']]
print(top_overall.to_string(index=False))
