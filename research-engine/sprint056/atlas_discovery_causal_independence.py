"""
Atlas Sprint 056 — Causal Independence Testing

For each candidate discovery, tests:
  1. Independence from existing Atlas principles (partial correlation, conditional MI)
  2. Incremental information gain over the Atlas baseline
  3. Cross-year stability (2024 vs 2025 vs 2026)
  4. Economic plausibility scoring

Candidate discoveries to test:
  D-01: Participation Surge (rel_txn / rel_vol / rel_dollar_vol)
  D-02: Overnight Inventory Direction (ov_dir → AM forward return)
  D-03: Overnight Range Amplification (ov_range_vs_atr14 → exceptional rate)
  D-04: Day Value Position (day_value_pos → catastrophic failure)
  D-05: Trend Age Decay (trend_age_bars → forward return)
  D-06: Compression Duration → Expansion Magnitude
  D-07: Auction Extension (auction_extension → reversal probability)
  D-08: Relative Transaction Rate (txn_per_vol → participation quality)
"""

import pandas as pd
import numpy as np
from scipy import stats
from sklearn.feature_selection import mutual_info_regression, mutual_info_classif
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import roc_auc_score
import warnings, json, os
warnings.filterwarnings('ignore')

FEAT_PATH   = '/home/ubuntu/Project-Atlas/research-engine/sprint056/discovery_features_rth.csv'
OUTPUT_DIR  = '/home/ubuntu/Project-Atlas/research-engine/sprint056'

print("Loading RTH feature matrix...")
df = pd.read_csv(FEAT_PATH)
df['ts']   = pd.to_datetime(df['ts'])
df['year'] = df['ts'].dt.year
df_clean   = df.dropna(subset=['fwd_12_return_atr', 'is_exceptional_fwd', 'is_catastrophic_fwd']).copy()
print(f"  {len(df_clean):,} clean RTH bars")

# ─── Existing Atlas Principle Proxies ─────────────────────────────────────────
# These are the features that operationalise existing Atlas principles
ATLAS_PROXIES = ['adx14', 'volcomp_5_14', 'ema_alignment', 'rsi14', 'hour', 'bars_since_rth_open']

# ─── Helper: Partial Spearman correlation ─────────────────────────────────────
def partial_spearman(x, y, controls, data):
    """Compute Spearman correlation between x and y after removing linear effects of controls."""
    from scipy.stats import spearmanr
    from sklearn.linear_model import LinearRegression
    ctrl_data = data[controls].fillna(0).values
    lr_x = LinearRegression().fit(ctrl_data, data[x].fillna(0))
    lr_y = LinearRegression().fit(ctrl_data, data[y].fillna(0))
    resid_x = data[x].fillna(0) - lr_x.predict(ctrl_data)
    resid_y = data[y].fillna(0) - lr_y.predict(ctrl_data)
    r, p = spearmanr(resid_x, resid_y)
    return r, p

# ─── Helper: Incremental AUC ──────────────────────────────────────────────────
def incremental_auc(base_features, new_feature, target, data):
    """Compute AUC improvement from adding new_feature to base_features."""
    scaler = StandardScaler()
    mask = data[base_features + [new_feature] + [target]].notna().all(axis=1)
    d = data[mask].copy()
    X_base = scaler.fit_transform(d[base_features].fillna(0))
    X_new  = scaler.fit_transform(d[base_features + [new_feature]].fillna(0))
    y      = d[target].values
    if y.sum() < 20: return 0.0, 0.0
    lr_base = LogisticRegression(max_iter=500, random_state=42)
    lr_new  = LogisticRegression(max_iter=500, random_state=42)
    lr_base.fit(X_base, y)
    lr_new.fit(X_new, y)
    auc_base = roc_auc_score(y, lr_base.predict_proba(X_base)[:, 1])
    auc_new  = roc_auc_score(y, lr_new.predict_proba(X_new)[:, 1])
    return auc_base, auc_new

# ─── Helper: Cross-year stability ─────────────────────────────────────────────
def cross_year_stability(feature, target, data, years=[2024, 2025, 2026]):
    """Compute Spearman r for each year."""
    results = {}
    for yr in years:
        d = data[data['year'] == yr]
        if len(d) < 100: continue
        r, p = stats.spearmanr(d[feature].fillna(0), d[target].fillna(0))
        results[yr] = {'r': r, 'p': p, 'n': len(d)}
    return results

# ─── CANDIDATE DISCOVERIES ────────────────────────────────────────────────────
candidates = []

print("\n" + "="*70)
print("CANDIDATE D-01: Participation Surge")
print("="*70)
# Hypothesis: elevated transaction rate (rel_txn) predicts exceptional moves
# independently of volatility (VolComp) and trend (ADX)
feat = 'rel_txn'
target = 'is_exceptional_fwd'

r_raw, p_raw = stats.spearmanr(df_clean[feat].fillna(0), df_clean[target])
r_partial, p_partial = partial_spearman(feat, target, ATLAS_PROXIES, df_clean)
auc_base, auc_new = incremental_auc(ATLAS_PROXIES, feat, target, df_clean)
year_stability = cross_year_stability(feat, target, df_clean)

print(f"  Raw Spearman r={r_raw:.4f}, p={p_raw:.4f}")
print(f"  Partial r (controlling Atlas proxies): r={r_partial:.4f}, p={p_partial:.4f}")
print(f"  AUC: base={auc_base:.4f} → with D-01={auc_new:.4f} (Δ={auc_new-auc_base:+.4f})")
print(f"  Year stability: {year_stability}")

# Also test rel_vol_20 and rel_dollar_vol
r_vol, p_vol = stats.spearmanr(df_clean['rel_vol_20'].fillna(0), df_clean[target])
r_dv, p_dv   = stats.spearmanr(df_clean['rel_dollar_vol'].fillna(0), df_clean[target])
r_txn_partial, p_txn_partial = partial_spearman('rel_txn', target, ATLAS_PROXIES + ['rel_vol_20'], df_clean)
print(f"  rel_vol_20 raw r={r_vol:.4f}, rel_dollar_vol raw r={r_dv:.4f}")
print(f"  rel_txn partial (also controlling rel_vol_20): r={r_txn_partial:.4f}, p={p_txn_partial:.4f}")

candidates.append({
    'id': 'D-01', 'name': 'Participation Surge',
    'feature': feat, 'target': target,
    'raw_r': r_raw, 'raw_p': p_raw,
    'partial_r': r_partial, 'partial_p': p_partial,
    'auc_base': auc_base, 'auc_new': auc_new, 'auc_delta': auc_new - auc_base,
    'year_stability': year_stability,
    'independent_of_atlas': abs(r_partial) > 0.05 and p_partial < 0.05,
})

print("\n" + "="*70)
print("CANDIDATE D-02: Overnight Inventory Direction")
print("="*70)
# Hypothesis: overnight direction (ov_dir) predicts AM forward return
# independently of EMA alignment and ADX
feat = 'ov_dir'
target = 'fwd_12_return_atr'
am_bars = df_clean[df_clean['hour'] <= 11].copy()

r_raw, p_raw = stats.spearmanr(am_bars[feat].fillna(0), am_bars[target])
r_partial, p_partial = partial_spearman(feat, target, ['ema_alignment', 'adx14', 'rsi14'], am_bars)
year_stability = cross_year_stability(feat, target, am_bars)

print(f"  Raw Spearman r={r_raw:.4f}, p={p_raw:.4f} (AM bars only, N={len(am_bars):,})")
print(f"  Partial r (controlling EMA, ADX, RSI): r={r_partial:.4f}, p={p_partial:.4f}")
print(f"  Year stability: {year_stability}")

# Directional breakdown
for d_val, label in [(-1, 'Bearish'), (1, 'Bullish')]:
    grp = am_bars[am_bars[feat] == d_val]
    print(f"  {label} overnight: N={len(grp):,} | FwdR={grp[target].mean():+.3f} | std={grp[target].std():.3f}")

candidates.append({
    'id': 'D-02', 'name': 'Overnight Inventory Direction',
    'feature': feat, 'target': target,
    'raw_r': r_raw, 'raw_p': p_raw,
    'partial_r': r_partial, 'partial_p': p_partial,
    'year_stability': year_stability,
    'independent_of_atlas': abs(r_partial) > 0.05 and p_partial < 0.05,
    'note': 'AM session only'
})

print("\n" + "="*70)
print("CANDIDATE D-03: Overnight Range Amplification")
print("="*70)
feat = 'ov_range_vs_atr14'
target = 'is_exceptional_fwd'

r_raw, p_raw = stats.spearmanr(am_bars[feat].fillna(0), am_bars[target])
r_partial, p_partial = partial_spearman(feat, target, ATLAS_PROXIES, am_bars)
auc_base, auc_new = incremental_auc(ATLAS_PROXIES, feat, target, am_bars)
year_stability = cross_year_stability(feat, target, am_bars)

print(f"  Raw Spearman r={r_raw:.4f}, p={p_raw:.4f}")
print(f"  Partial r (controlling Atlas proxies): r={r_partial:.4f}, p={p_partial:.4f}")
print(f"  AUC: base={auc_base:.4f} → with D-03={auc_new:.4f} (Δ={auc_new-auc_base:+.4f})")
print(f"  Year stability: {year_stability}")

# Quartile breakdown
for q, label in [(0.25, 'Q1 (small)'), (0.5, 'Q2'), (0.75, 'Q3'), (1.0, 'Q4 (large)')]:
    lo = am_bars[feat].quantile(q - 0.25) if q > 0.25 else 0
    hi = am_bars[feat].quantile(q)
    grp = am_bars[(am_bars[feat] > lo) & (am_bars[feat] <= hi)]
    if len(grp) > 50:
        print(f"  {label}: N={len(grp):,} | Exc={grp[target].mean()*100:.1f}%")

candidates.append({
    'id': 'D-03', 'name': 'Overnight Range Amplification',
    'feature': feat, 'target': target,
    'raw_r': r_raw, 'raw_p': p_raw,
    'partial_r': r_partial, 'partial_p': p_partial,
    'auc_base': auc_base, 'auc_new': auc_new, 'auc_delta': auc_new - auc_base,
    'year_stability': year_stability,
    'independent_of_atlas': abs(r_partial) > 0.05 and p_partial < 0.05,
    'note': 'AM session only'
})

print("\n" + "="*70)
print("CANDIDATE D-04: Day Value Position → Catastrophic Failure")
print("="*70)
feat = 'day_value_pos'
target = 'is_catastrophic_fwd'

r_raw, p_raw = stats.spearmanr(df_clean[feat].fillna(0), df_clean[target])
r_partial, p_partial = partial_spearman(feat, target, ATLAS_PROXIES, df_clean)
auc_base, auc_new = incremental_auc(ATLAS_PROXIES, feat, target, df_clean)
year_stability = cross_year_stability(feat, target, df_clean)

print(f"  Raw Spearman r={r_raw:.4f}, p={p_raw:.4f}")
print(f"  Partial r (controlling Atlas proxies): r={r_partial:.4f}, p={p_partial:.4f}")
print(f"  AUC: base={auc_base:.4f} → with D-04={auc_new:.4f} (Δ={auc_new-auc_base:+.4f})")
print(f"  Year stability: {year_stability}")

# Quintile breakdown
for i in range(5):
    lo = df_clean[feat].quantile(i * 0.2)
    hi = df_clean[feat].quantile((i + 1) * 0.2)
    grp = df_clean[(df_clean[feat] > lo) & (df_clean[feat] <= hi)]
    if len(grp) > 50:
        print(f"  Q{i+1} (pos {i*20}-{(i+1)*20}%): N={len(grp):,} | Cat={grp[target].mean()*100:.1f}%")

candidates.append({
    'id': 'D-04', 'name': 'Day Value Position → Catastrophic Failure',
    'feature': feat, 'target': target,
    'raw_r': r_raw, 'raw_p': p_raw,
    'partial_r': r_partial, 'partial_p': p_partial,
    'auc_base': auc_base, 'auc_new': auc_new, 'auc_delta': auc_new - auc_base,
    'year_stability': year_stability,
    'independent_of_atlas': abs(r_partial) > 0.05 and p_partial < 0.05,
})

print("\n" + "="*70)
print("CANDIDATE D-05: Compression Duration → Expansion Magnitude")
print("="*70)
feat = 'bars_compressed'
target = 'fwd_12_return_atr'

# Focus on bars that are currently in compression (bars_compressed > 0)
comp_bars = df_clean[df_clean['bars_compressed'] > 0].copy()
print(f"  Compression bars: {len(comp_bars):,}")

r_raw, p_raw = stats.spearmanr(comp_bars[feat].fillna(0), comp_bars['fwd_12_return_atr'].abs())
r_partial, p_partial = partial_spearman(feat, 'fwd_12_return_atr', ATLAS_PROXIES, comp_bars)
year_stability = cross_year_stability(feat, 'is_exceptional_fwd', comp_bars)

print(f"  Compression duration vs |fwd return|: r={r_raw:.4f}, p={p_raw:.4f}")
print(f"  Partial r (controlling Atlas proxies): r={r_partial:.4f}, p={p_partial:.4f}")
print(f"  Year stability: {year_stability}")

# Duration bins
for lo, hi, label in [(1, 10, '1-10'), (10, 30, '10-30'), (30, 60, '30-60'), (60, 999, '60+')]:
    grp = comp_bars[(comp_bars[feat] >= lo) & (comp_bars[feat] < hi)]
    if len(grp) > 50:
        print(f"  Comp {label:>6} bars: N={len(grp):,} | |FwdR|={grp['fwd_12_return_atr'].abs().mean():.3f} | Exc={grp['is_exceptional_fwd'].mean()*100:.1f}%")

candidates.append({
    'id': 'D-05', 'name': 'Compression Duration → Expansion Magnitude',
    'feature': feat, 'target': 'fwd_12_return_atr',
    'raw_r': r_raw, 'raw_p': p_raw,
    'partial_r': r_partial, 'partial_p': p_partial,
    'year_stability': year_stability,
    'independent_of_atlas': abs(r_partial) > 0.05 and p_partial < 0.05,
    'note': 'Compression bars only; target = |fwd_return|'
})

print("\n" + "="*70)
print("CANDIDATE D-06: Auction Extension → Reversal Probability")
print("="*70)
feat = 'auction_extension'
target = 'is_catastrophic_fwd'

r_raw, p_raw = stats.spearmanr(df_clean[feat].fillna(0), df_clean[target])
r_partial, p_partial = partial_spearman(feat, target, ATLAS_PROXIES + ['day_value_pos'], df_clean)
auc_base, auc_new = incremental_auc(ATLAS_PROXIES, feat, target, df_clean)
year_stability = cross_year_stability(feat, target, df_clean)

print(f"  Raw Spearman r={r_raw:.4f}, p={p_raw:.4f}")
print(f"  Partial r (controlling Atlas proxies + DVP): r={r_partial:.4f}, p={p_partial:.4f}")
print(f"  AUC: base={auc_base:.4f} → with D-06={auc_new:.4f} (Δ={auc_new-auc_base:+.4f})")
print(f"  Year stability: {year_stability}")

candidates.append({
    'id': 'D-06', 'name': 'Auction Extension → Reversal Probability',
    'feature': feat, 'target': target,
    'raw_r': r_raw, 'raw_p': p_raw,
    'partial_r': r_partial, 'partial_p': p_partial,
    'auc_base': auc_base, 'auc_new': auc_new, 'auc_delta': auc_new - auc_base,
    'year_stability': year_stability,
    'independent_of_atlas': abs(r_partial) > 0.05 and p_partial < 0.05,
})

print("\n" + "="*70)
print("CANDIDATE D-07: Relative Transaction Rate (Participation Quality)")
print("="*70)
feat = 'txn_per_vol'
target = 'is_exceptional_fwd'

r_raw, p_raw = stats.spearmanr(df_clean[feat].fillna(0), df_clean[target])
r_partial, p_partial = partial_spearman(feat, target, ATLAS_PROXIES + ['rel_vol_20'], df_clean)
auc_base, auc_new = incremental_auc(ATLAS_PROXIES + ['rel_vol_20'], feat, target, df_clean)
year_stability = cross_year_stability(feat, target, df_clean)

print(f"  Raw Spearman r={r_raw:.4f}, p={p_raw:.4f}")
print(f"  Partial r (controlling Atlas proxies + rel_vol): r={r_partial:.4f}, p={p_partial:.4f}")
print(f"  AUC: base={auc_base:.4f} → with D-07={auc_new:.4f} (Δ={auc_new-auc_base:+.4f})")
print(f"  Year stability: {year_stability}")

candidates.append({
    'id': 'D-07', 'name': 'Relative Transaction Rate (Participation Quality)',
    'feature': feat, 'target': target,
    'raw_r': r_raw, 'raw_p': p_raw,
    'partial_r': r_partial, 'partial_p': p_partial,
    'auc_base': auc_base, 'auc_new': auc_new, 'auc_delta': auc_new - auc_base,
    'year_stability': year_stability,
    'independent_of_atlas': abs(r_partial) > 0.05 and p_partial < 0.05,
})

print("\n" + "="*70)
print("CANDIDATE D-08: Day Range vs ATR14 (Intraday Expansion State)")
print("="*70)
feat = 'day_range_vs_atr14'
target = 'is_exceptional_fwd'

r_raw, p_raw = stats.spearmanr(df_clean[feat].fillna(0), df_clean[target])
r_partial, p_partial = partial_spearman(feat, target, ATLAS_PROXIES, df_clean)
auc_base, auc_new = incremental_auc(ATLAS_PROXIES, feat, target, df_clean)
year_stability = cross_year_stability(feat, target, df_clean)

print(f"  Raw Spearman r={r_raw:.4f}, p={p_raw:.4f}")
print(f"  Partial r (controlling Atlas proxies): r={r_partial:.4f}, p={p_partial:.4f}")
print(f"  AUC: base={auc_base:.4f} → with D-08={auc_new:.4f} (Δ={auc_new-auc_base:+.4f})")
print(f"  Year stability: {year_stability}")

# Quartile breakdown
for i in range(4):
    lo = df_clean[feat].quantile(i * 0.25)
    hi = df_clean[feat].quantile((i + 1) * 0.25)
    grp = df_clean[(df_clean[feat] > lo) & (df_clean[feat] <= hi)]
    if len(grp) > 50:
        print(f"  Q{i+1}: N={len(grp):,} | Exc={grp[target].mean()*100:.1f}% | Cat={grp['is_catastrophic_fwd'].mean()*100:.1f}%")

candidates.append({
    'id': 'D-08', 'name': 'Day Range vs ATR14 (Intraday Expansion State)',
    'feature': feat, 'target': target,
    'raw_r': r_raw, 'raw_p': p_raw,
    'partial_r': r_partial, 'partial_p': p_partial,
    'auc_base': auc_base, 'auc_new': auc_new, 'auc_delta': auc_new - auc_base,
    'year_stability': year_stability,
    'independent_of_atlas': abs(r_partial) > 0.05 and p_partial < 0.05,
})

# ─── SUMMARY ──────────────────────────────────────────────────────────────────
print("\n" + "="*70)
print("CANDIDATE DISCOVERY SUMMARY")
print("="*70)
print(f"  {'ID':<6} {'Name':<45} {'Partial r':>10} {'p':>10} {'ΔAUC':>8} {'Indep':>6}")
print("  " + "-"*85)
for c in candidates:
    indep = 'YES' if c.get('independent_of_atlas') else 'NO'
    delta_auc = f"{c.get('auc_delta', 0):+.4f}" if 'auc_delta' in c else 'N/A'
    print(f"  {c['id']:<6} {c['name']:<45} {c['partial_r']:>+10.4f} {c['partial_p']:>10.4f} {delta_auc:>8} {indep:>6}")

# Save
with open(f'{OUTPUT_DIR}/discovery_candidates.json', 'w') as f:
    json.dump(candidates, f, indent=2, default=str)

print(f"\nSaved: {OUTPUT_DIR}/discovery_candidates.json")
print("=== CAUSAL INDEPENDENCE TESTING COMPLETE ===")
