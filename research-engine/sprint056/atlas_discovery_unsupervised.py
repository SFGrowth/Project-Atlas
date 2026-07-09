"""
Atlas Sprint 056 — Unsupervised Discovery Engine

Applies clustering, anomaly detection, PCA, and sequence mining to the
full discovery feature matrix to surface candidate market behaviours.

Discovery Methods:
  1. PCA — identify the dominant axes of market variation
  2. K-Means clustering — find natural market state clusters
  3. Isolation Forest — detect anomalous market states
  4. Feature correlation with forward returns — univariate screening
  5. Sequence mining — find recurring bar patterns preceding exceptional moves
  6. Compression cycle analysis — characterise the full VolComp cycle
  7. Trend ageing analysis — how does edge decay with trend age?
  8. Catastrophic failure precursor analysis — what precedes large adverse moves?
"""

import pandas as pd
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.gridspec as gridspec
from matplotlib.colors import LinearSegmentedColormap
from sklearn.preprocessing import StandardScaler
from sklearn.decomposition import PCA
from sklearn.cluster import KMeans
from sklearn.ensemble import IsolationForest, RandomForestClassifier
from sklearn.feature_selection import mutual_info_classif
from scipy import stats
import warnings, os, json
warnings.filterwarnings('ignore')

FEAT_PATH   = '/home/ubuntu/Project-Atlas/research-engine/sprint056/discovery_features_rth.csv'
OUTPUT_DIR  = '/home/ubuntu/Project-Atlas/research-engine/sprint056'
CHARTS_DIR  = '/home/ubuntu/Project-Atlas/research/sprint-056-charts'
os.makedirs(CHARTS_DIR, exist_ok=True)

print("Loading RTH feature matrix...")
df = pd.read_csv(FEAT_PATH)
df['ts']   = pd.to_datetime(df['ts'])
df['date'] = pd.to_datetime(df['date'])
df['year'] = df['ts'].dt.year
print(f"  {len(df):,} RTH bars loaded")

# ─── Feature sets for different analyses ─────────────────────────────────────
REGIME_FEATURES = [
    'adx14', 'volcomp_5_14', 'volcomp_14_50', 'atr14_zscore',
    'ema_alignment', 'trend_age_bars', 'bars_since_ema_flip',
    'rsi14', 'roc14', 'close_vs_ema50',
]
PARTICIPATION_FEATURES = [
    'rel_vol_20', 'rel_dollar_vol', 'rel_txn', 'txn_per_vol', 'vol_zscore',
]
STRUCTURE_FEATURES = [
    'close_vs_range_mid', 'range_symmetry', 'wick_ratio', 'body_ratio',
    'bars_since_impulse', 'bars_since_expansion', 'bars_compressed',
]
TIMING_FEATURES = [
    'hour', 'bars_since_rth_open', 'ov_range_vs_atr14', 'ov_dir',
    'day_range_vs_atr14', 'consec_up_days', 'day_value_pos',
]
ALL_DISCOVERY_FEATURES = list(set(
    REGIME_FEATURES + PARTICIPATION_FEATURES + STRUCTURE_FEATURES + TIMING_FEATURES
))

# Clean data
df_clean = df.dropna(subset=ALL_DISCOVERY_FEATURES + ['fwd_12_return_atr']).copy()
print(f"  Clean bars: {len(df_clean):,}")

discoveries = []  # Will collect all candidate discoveries

# ─── ANALYSIS 1: PCA — Dominant Axes of Market Variation ─────────────────────
print("\n=== ANALYSIS 1: PCA ===")
scaler = StandardScaler()
X_scaled = scaler.fit_transform(df_clean[ALL_DISCOVERY_FEATURES])
pca = PCA(n_components=10)
pca_components = pca.fit_transform(X_scaled)
explained_var = pca.explained_variance_ratio_

print(f"  Top 5 PCA components explain: {explained_var[:5].sum()*100:.1f}% of variance")
for i, ev in enumerate(explained_var[:5]):
    # Find top loading features for each component
    loadings = pd.Series(pca.components_[i], index=ALL_DISCOVERY_FEATURES).abs().sort_values(ascending=False)
    top3 = loadings.head(3).index.tolist()
    print(f"  PC{i+1} ({ev*100:.1f}%): {top3}")

# ─── ANALYSIS 2: K-Means Market State Clustering ─────────────────────────────
print("\n=== ANALYSIS 2: K-Means Clustering ===")
# Use regime + structure features for clustering
X_cluster = scaler.fit_transform(df_clean[REGIME_FEATURES + STRUCTURE_FEATURES])

# Find optimal K using inertia elbow
inertias = []
for k in range(3, 10):
    km = KMeans(n_clusters=k, random_state=42, n_init=10)
    km.fit(X_cluster)
    inertias.append(km.inertia_)

# Use K=6 (reasonable for market states: trending up/down × low/med/high vol)
km6 = KMeans(n_clusters=6, random_state=42, n_init=10)
df_clean['cluster'] = km6.fit_predict(X_cluster)

# Characterise each cluster
print("\n  Cluster characterisation:")
cluster_stats = []
for c in range(6):
    mask = df_clean['cluster'] == c
    grp  = df_clean[mask]
    stats_row = {
        'cluster': c,
        'n': len(grp),
        'pct': len(grp) / len(df_clean) * 100,
        'adx14': grp['adx14'].mean(),
        'volcomp': grp['volcomp_5_14'].mean(),
        'ema_align': grp['ema_alignment'].mean(),
        'trend_age': grp['trend_age_bars'].mean(),
        'fwd_return': grp['fwd_12_return_atr'].mean(),
        'fwd_std': grp['fwd_12_return_atr'].std(),
        'exc_rate': grp['is_exceptional_fwd'].mean() * 100,
        'cat_rate': grp['is_catastrophic_fwd'].mean() * 100,
    }
    cluster_stats.append(stats_row)
    print(f"  C{c}: N={len(grp):5,} ({len(grp)/len(df_clean)*100:.1f}%) | "
          f"ADX={grp['adx14'].mean():.1f} | VolComp={grp['volcomp_5_14'].mean():.2f} | "
          f"EMA={grp['ema_alignment'].mean():.2f} | FwdR={grp['fwd_12_return_atr'].mean():.3f} | "
          f"Exc={grp['is_exceptional_fwd'].mean()*100:.1f}%")

df_clusters = pd.DataFrame(cluster_stats)

# ─── ANALYSIS 3: Isolation Forest Anomaly Detection ──────────────────────────
print("\n=== ANALYSIS 3: Isolation Forest Anomaly Detection ===")
iso = IsolationForest(contamination=0.05, random_state=42, n_estimators=200)
df_clean['anomaly_score'] = iso.fit_predict(X_cluster)
df_clean['anomaly_raw']   = iso.score_samples(X_cluster)

anomalies = df_clean[df_clean['anomaly_score'] == -1]
normal    = df_clean[df_clean['anomaly_score'] == 1]
print(f"  Anomalies detected: {len(anomalies):,} ({len(anomalies)/len(df_clean)*100:.1f}%)")
print(f"  Anomaly fwd return: {anomalies['fwd_12_return_atr'].mean():.3f} ± {anomalies['fwd_12_return_atr'].std():.3f}")
print(f"  Normal  fwd return: {normal['fwd_12_return_atr'].mean():.3f} ± {normal['fwd_12_return_atr'].std():.3f}")
print(f"  Anomaly exceptional rate: {anomalies['is_exceptional_fwd'].mean()*100:.1f}%")
print(f"  Normal  exceptional rate: {normal['is_exceptional_fwd'].mean()*100:.1f}%")

# What characterises anomalies?
print("\n  Top anomaly features (mean diff from normal):")
for feat in REGIME_FEATURES + STRUCTURE_FEATURES:
    if feat not in df_clean.columns: continue
    diff = anomalies[feat].mean() - normal[feat].mean()
    std  = df_clean[feat].std()
    if std > 0:
        d = diff / std
        if abs(d) > 0.3:
            print(f"    {feat:<30}: d={d:+.3f}")

# ─── ANALYSIS 4: Feature Correlation with Forward Returns ────────────────────
print("\n=== ANALYSIS 4: Feature → Forward Return Correlation ===")
correlations = {}
for feat in ALL_DISCOVERY_FEATURES:
    if feat not in df_clean.columns: continue
    try:
        r, p = stats.spearmanr(df_clean[feat].fillna(0), df_clean['fwd_12_return_atr'].fillna(0))
        correlations[feat] = {'r': r, 'p': p, 'abs_r': abs(r)}
    except:
        pass

corr_df = pd.DataFrame(correlations).T.sort_values('abs_r', ascending=False)
print("\n  Top 15 features correlated with 1-hour forward return:")
print(f"  {'Feature':<35} {'Spearman r':>12} {'p-value':>12}")
print("  " + "-"*60)
for feat, row in corr_df.head(15).iterrows():
    sig = '***' if row['p'] < 0.001 else '**' if row['p'] < 0.01 else '*' if row['p'] < 0.05 else ''
    print(f"  {feat:<35} {row['r']:>+12.4f} {row['p']:>12.4f} {sig}")

# ─── ANALYSIS 5: Trend Ageing Analysis ───────────────────────────────────────
print("\n=== ANALYSIS 5: Trend Ageing Analysis ===")
# How does forward return and exceptional rate change with trend age?
trend_age_bins = [0, 5, 15, 30, 60, 120, 300, 9999]
trend_age_labels = ['0-5', '6-15', '16-30', '31-60', '61-120', '121-300', '300+']
df_clean['trend_age_bin'] = pd.cut(df_clean['trend_age_bars'],
                                    bins=trend_age_bins, labels=trend_age_labels)

trend_age_stats = []
for label in trend_age_labels:
    grp = df_clean[df_clean['trend_age_bin'] == label]
    if len(grp) < 50: continue
    trend_age_stats.append({
        'age_bin': label,
        'n': len(grp),
        'fwd_return': grp['fwd_12_return_atr'].mean(),
        'fwd_std': grp['fwd_12_return_atr'].std(),
        'exc_rate': grp['is_exceptional_fwd'].mean() * 100,
        'cat_rate': grp['is_catastrophic_fwd'].mean() * 100,
        'adx_mean': grp['adx14'].mean(),
    })
    print(f"  Age {label:>8}: N={len(grp):5,} | FwdR={grp['fwd_12_return_atr'].mean():+.3f} | "
          f"Exc={grp['is_exceptional_fwd'].mean()*100:.1f}% | Cat={grp['is_catastrophic_fwd'].mean()*100:.1f}%")

df_trend_age = pd.DataFrame(trend_age_stats)

# KEY DISCOVERY TEST: Does trend age predict forward return independently of ADX?
# Partial correlation: trend_age vs fwd_return, controlling for ADX
from scipy.stats import pearsonr
mask_valid = df_clean['trend_age_bars'].notna() & df_clean['adx14'].notna()
r_age_fwd, p_age_fwd = stats.spearmanr(df_clean.loc[mask_valid, 'trend_age_bars'],
                                         df_clean.loc[mask_valid, 'fwd_12_return_atr'])
r_adx_fwd, p_adx_fwd = stats.spearmanr(df_clean.loc[mask_valid, 'adx14'],
                                         df_clean.loc[mask_valid, 'fwd_12_return_atr'])
print(f"\n  Trend age vs fwd return: r={r_age_fwd:.4f}, p={p_age_fwd:.4f}")
print(f"  ADX vs fwd return:       r={r_adx_fwd:.4f}, p={p_adx_fwd:.4f}")

# ─── ANALYSIS 6: Compression Cycle Analysis ──────────────────────────────────
print("\n=== ANALYSIS 6: Compression Cycle Analysis ===")
# Characterise the full compression → expansion cycle
compression_bins = [0, 5, 15, 30, 60, 120, 9999]
compression_labels = ['0-5', '6-15', '16-30', '31-60', '61-120', '120+']
df_clean['compression_bin'] = pd.cut(df_clean['bars_compressed'],
                                      bins=compression_bins, labels=compression_labels)

print("  Compression duration vs forward return:")
compression_stats = []
for label in compression_labels:
    grp = df_clean[df_clean['compression_bin'] == label]
    if len(grp) < 50: continue
    compression_stats.append({
        'comp_bin': label,
        'n': len(grp),
        'fwd_return_abs': grp['fwd_12_return_atr'].abs().mean(),
        'exc_rate': grp['is_exceptional_fwd'].mean() * 100,
        'fwd_std': grp['fwd_12_return_atr'].std(),
    })
    print(f"  Comp {label:>7}: N={len(grp):5,} | |FwdR|={grp['fwd_12_return_atr'].abs().mean():.3f} | "
          f"Exc={grp['is_exceptional_fwd'].mean()*100:.1f}% | Std={grp['fwd_12_return_atr'].std():.3f}")

df_compression = pd.DataFrame(compression_stats)

# ─── ANALYSIS 7: Catastrophic Failure Precursors ─────────────────────────────
print("\n=== ANALYSIS 7: Catastrophic Failure Precursor Analysis ===")
cat_mask = df_clean['is_catastrophic_fwd'] == 1
norm_mask = df_clean['is_catastrophic_fwd'] == 0

print(f"  Catastrophic failures: {cat_mask.sum():,} ({cat_mask.mean()*100:.1f}%)")
print("\n  Feature comparison (catastrophic vs normal):")
cat_features = ['adx14', 'volcomp_5_14', 'trend_age_bars', 'bars_since_ema_flip',
                'rel_vol_20', 'rsi14', 'close_vs_ema50', 'wick_ratio',
                'bars_since_impulse', 'bars_compressed', 'day_value_pos']

cat_discoveries = []
for feat in cat_features:
    if feat not in df_clean.columns: continue
    cat_vals  = df_clean.loc[cat_mask, feat].dropna()
    norm_vals = df_clean.loc[norm_mask, feat].dropna()
    if len(cat_vals) < 30: continue
    d = (cat_vals.mean() - norm_vals.mean()) / (df_clean[feat].std() + 1e-6)
    _, p = stats.mannwhitneyu(cat_vals, norm_vals, alternative='two-sided')
    cat_discoveries.append({'feature': feat, 'd': d, 'p': p,
                             'cat_mean': cat_vals.mean(), 'norm_mean': norm_vals.mean()})
    sig = '***' if p < 0.001 else '**' if p < 0.01 else '*' if p < 0.05 else ''
    print(f"  {feat:<35}: d={d:+.3f}, p={p:.4f} {sig} | cat={cat_vals.mean():.2f} vs norm={norm_vals.mean():.2f}")

df_cat = pd.DataFrame(cat_discoveries)

# ─── ANALYSIS 8: Exceptional Move Precursors ─────────────────────────────────
print("\n=== ANALYSIS 8: Exceptional Move Precursor Analysis ===")
exc_mask  = df_clean['is_exceptional_fwd'] == 1
norm_mask2 = df_clean['is_exceptional_fwd'] == 0

exc_discoveries = []
for feat in ALL_DISCOVERY_FEATURES:
    if feat not in df_clean.columns: continue
    exc_vals  = df_clean.loc[exc_mask, feat].dropna()
    norm_vals = df_clean.loc[norm_mask2, feat].dropna()
    if len(exc_vals) < 30: continue
    d = (exc_vals.mean() - norm_vals.mean()) / (df_clean[feat].std() + 1e-6)
    _, p = stats.mannwhitneyu(exc_vals, norm_vals, alternative='two-sided')
    exc_discoveries.append({'feature': feat, 'd': d, 'p': p,
                             'exc_mean': exc_vals.mean(), 'norm_mean': norm_vals.mean()})

df_exc = pd.DataFrame(exc_discoveries).sort_values('d', key=abs, ascending=False)
print("\n  Top 15 features preceding exceptional moves:")
print(f"  {'Feature':<35} {'Cohen d':>8} {'p-value':>12}")
print("  " + "-"*60)
for _, row in df_exc.head(15).iterrows():
    sig = '***' if row['p'] < 0.001 else '**' if row['p'] < 0.01 else '*' if row['p'] < 0.05 else ''
    print(f"  {row['feature']:<35} {row['d']:>+8.3f} {row['p']:>12.4f} {sig}")

# ─── ANALYSIS 9: Random Forest Feature Importance ────────────────────────────
print("\n=== ANALYSIS 9: Random Forest Feature Importance ===")
X_rf = df_clean[ALL_DISCOVERY_FEATURES].fillna(0)
y_exc = df_clean['is_exceptional_fwd']
y_cat = df_clean['is_catastrophic_fwd']

rf_exc = RandomForestClassifier(n_estimators=100, max_depth=6, random_state=42, n_jobs=-1)
rf_exc.fit(X_rf, y_exc)
imp_exc = pd.Series(rf_exc.feature_importances_, index=ALL_DISCOVERY_FEATURES).sort_values(ascending=False)

rf_cat = RandomForestClassifier(n_estimators=100, max_depth=6, random_state=42, n_jobs=-1)
rf_cat.fit(X_rf, y_cat)
imp_cat = pd.Series(rf_cat.feature_importances_, index=ALL_DISCOVERY_FEATURES).sort_values(ascending=False)

print("\n  Top 10 features for predicting exceptional moves:")
for feat, imp in imp_exc.head(10).items():
    print(f"    {feat:<35}: {imp:.4f}")

print("\n  Top 10 features for predicting catastrophic failures:")
for feat, imp in imp_cat.head(10).items():
    print(f"    {feat:<35}: {imp:.4f}")

# ─── ANALYSIS 10: Overnight Inventory vs RTH Performance ─────────────────────
print("\n=== ANALYSIS 10: Overnight Inventory Analysis ===")
# Focus on RTH AM session bars
am_bars = df_clean[df_clean['hour'] <= 11].copy()
print(f"  AM session bars: {len(am_bars):,}")

# Overnight direction vs AM forward return
for ov_dir_val, label in [(-1, 'Bearish overnight'), (0, 'Flat overnight'), (1, 'Bullish overnight')]:
    grp = am_bars[am_bars['ov_dir'] == ov_dir_val]
    if len(grp) < 50: continue
    print(f"  {label}: N={len(grp):4,} | FwdR={grp['fwd_12_return_atr'].mean():+.3f} | "
          f"Exc={grp['is_exceptional_fwd'].mean()*100:.1f}%")

# Large overnight range vs AM performance
ov_range_median = am_bars['ov_range_vs_atr14'].median()
large_ov = am_bars[am_bars['ov_range_vs_atr14'] > ov_range_median * 1.5]
small_ov = am_bars[am_bars['ov_range_vs_atr14'] <= ov_range_median * 0.5]
print(f"\n  Large overnight range (>1.5×med): N={len(large_ov):,} | FwdR={large_ov['fwd_12_return_atr'].mean():+.3f} | Exc={large_ov['is_exceptional_fwd'].mean()*100:.1f}%")
print(f"  Small overnight range (<0.5×med): N={len(small_ov):,} | FwdR={small_ov['fwd_12_return_atr'].mean():+.3f} | Exc={small_ov['is_exceptional_fwd'].mean()*100:.1f}%")

# ─── SAVE RESULTS ─────────────────────────────────────────────────────────────
results = {
    'cluster_stats': df_clusters.to_dict('records'),
    'trend_age_stats': df_trend_age.to_dict('records'),
    'compression_stats': df_compression.to_dict('records'),
    'catastrophic_features': df_cat.to_dict('records'),
    'exceptional_features': df_exc.head(20).to_dict('records'),
    'rf_importance_exceptional': imp_exc.head(15).to_dict(),
    'rf_importance_catastrophic': imp_cat.head(15).to_dict(),
    'top_correlations': corr_df.head(15).to_dict('index'),
    'pca_explained_variance': explained_var[:5].tolist(),
    'anomaly_stats': {
        'n_anomalies': int(len(anomalies)),
        'anomaly_exc_rate': float(anomalies['is_exceptional_fwd'].mean()),
        'normal_exc_rate': float(normal['is_exceptional_fwd'].mean()),
    }
}

import json
with open(f'{OUTPUT_DIR}/discovery_results.json', 'w') as f:
    json.dump(results, f, indent=2, default=str)

# Save enriched dataframe with cluster and anomaly labels
df_clean[['ts', 'cluster', 'anomaly_score', 'anomaly_raw', 'trend_age_bin', 'compression_bin']].to_csv(
    f'{OUTPUT_DIR}/discovery_labels.csv', index=False)

print(f"\n=== UNSUPERVISED DISCOVERY COMPLETE ===")
print(f"Saved: {OUTPUT_DIR}/discovery_results.json")
