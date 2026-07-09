"""
Atlas Sprint 052 — Failure Mechanism Discovery
Phases 2-4: Mediation Analysis for FS-A3-01, FS-A3-02, FS-A2-01

Mediation framework:
  Proxy → Outcome (total effect)
  Proxy → Causal Candidate (path a)
  Causal Candidate → Outcome (path b, controlling for proxy)
  If path a * path b ≈ total effect → candidate mediates the proxy
  If proxy effect collapses when candidate is controlled → candidate is the mechanism

Additional tests:
  1. Partial Information Gain: IG(proxy | candidate) vs IG(proxy alone)
  2. Logistic regression: proxy vs candidate vs both (coefficient attenuation)
  3. Replacement test: filter on candidate alone vs proxy alone vs both
"""

import pandas as pd
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.gridspec as gridspec
from scipy import stats
from sklearn.feature_selection import mutual_info_classif
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
from sklearn.impute import SimpleImputer
import warnings
import os
warnings.filterwarnings('ignore')

DATA_FILE  = '/home/ubuntu/Project-Atlas/research-engine/fae/fae_causal.csv'
OUTPUT_DIR = '/home/ubuntu/Project-Atlas/research/sprint-052-charts'
os.makedirs(OUTPUT_DIR, exist_ok=True)

df = pd.read_csv(DATA_FILE)
df_wl = df[df['outcome'].isin(['win', 'loss'])].copy()
df_wl['is_win'] = (df_wl['outcome'] == 'win').astype(int)

print(f"Loaded {len(df)} trades, {len(df_wl)} win/loss")

# ─── Utility functions ────────────────────────────────────────────────────────
def cohens_d(a, b):
    na, nb = len(a), len(b)
    if na < 3 or nb < 3: return np.nan
    pooled = np.sqrt(((na-1)*np.var(a,ddof=1) + (nb-1)*np.var(b,ddof=1)) / (na+nb-2))
    return (np.mean(a) - np.mean(b)) / pooled if pooled > 0 else np.nan

def mw_test(a, b):
    try:
        _, p = stats.mannwhitneyu(a, b, alternative='two-sided')
        return p
    except: return 1.0

def info_gain(X, y):
    """Mutual information between feature X and binary outcome y."""
    X_clean = X.copy(); y_clean = y.copy()
    mask = ~np.isnan(X_clean)
    if mask.sum() < 10: return 0.0
    return mutual_info_classif(X_clean[mask].reshape(-1,1), y_clean[mask],
                               discrete_features=False, random_state=42)[0]

def partial_info_gain(X_proxy, X_candidate, y):
    """IG of proxy after controlling for candidate (partial IG)."""
    mask = ~(np.isnan(X_proxy) | np.isnan(X_candidate))
    if mask.sum() < 10: return 0.0, 0.0
    Xp = X_proxy[mask]; Xc = X_candidate[mask]; yy = y[mask]
    ig_proxy_alone = mutual_info_classif(Xp.reshape(-1,1), yy, random_state=42)[0]
    ig_both = mutual_info_classif(np.column_stack([Xp, Xc]), yy, random_state=42)
    ig_proxy_given_candidate = ig_both[0]  # proxy's contribution in joint model
    return ig_proxy_alone, ig_proxy_given_candidate

def logistic_attenuation(X_proxy, X_candidate, y):
    """Measure coefficient attenuation of proxy when candidate is added."""
    mask = ~(np.isnan(X_proxy) | np.isnan(X_candidate))
    if mask.sum() < 15: return np.nan, np.nan, np.nan
    Xp = X_proxy[mask].reshape(-1,1)
    Xc = X_candidate[mask].reshape(-1,1)
    yy = y[mask]
    scaler = StandardScaler()
    Xp_s = scaler.fit_transform(Xp)
    Xc_s = scaler.fit_transform(Xc)
    # Model 1: proxy alone
    lr1 = LogisticRegression(random_state=42, max_iter=500)
    lr1.fit(Xp_s, yy)
    coef_proxy_alone = lr1.coef_[0][0]
    # Model 2: proxy + candidate
    lr2 = LogisticRegression(random_state=42, max_iter=500)
    lr2.fit(np.hstack([Xp_s, Xc_s]), yy)
    coef_proxy_with_candidate = lr2.coef_[0][0]
    coef_candidate = lr2.coef_[0][1]
    # Attenuation: how much did proxy coefficient shrink?
    attenuation = 1 - abs(coef_proxy_with_candidate) / abs(coef_proxy_alone) if coef_proxy_alone != 0 else np.nan
    return coef_proxy_alone, coef_proxy_with_candidate, attenuation

def pf(d):
    pnl = d['net_pnl'].values
    w = pnl[pnl>0]; l = pnl[pnl<0]
    return w.sum()/abs(l.sum()) if len(l)>0 and abs(l.sum())>0 else 0

def max_dd(d):
    eq = np.cumsum(d['net_pnl'].values)
    pk = np.maximum.accumulate(eq)
    return (eq-pk).min()

def filter_stats(sub, mask_bad):
    good = sub[~mask_bad]
    bad  = sub[mask_bad]
    return {
        'n_bad': len(bad), 'pct_removed': len(bad)/len(sub),
        'pf_base': pf(sub), 'pf_filt': pf(good),
        'pf_delta': pf(good) - pf(sub),
        'dd_base': max_dd(sub), 'dd_filt': max_dd(good),
        'wr_base': (sub['net_pnl']>0).mean(),
        'wr_filt': (good['net_pnl']>0).mean() if len(good)>0 else 0,
    }

# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 2: FS-A3-01 — ADX < 30
# ═══════════════════════════════════════════════════════════════════════════════
print("\n" + "="*70)
print("PHASE 2: FS-A3-01 — IS LOW ADX THE CAUSE?")
print("="*70)

a3 = df_wl[df_wl['model'] == 'A3'].copy()
a3_all = df[df['model'] == 'A3'].copy()
wins_a3   = a3[a3['outcome'] == 'win']
losses_a3 = a3[a3['outcome'] == 'loss']

proxy_a3 = a3['adx'].values
y_a3     = a3['is_win'].values

print(f"\nA3 dataset: {len(a3)} trades ({len(wins_a3)} wins, {len(losses_a3)} losses)")
print(f"Proxy (ADX): win mean={wins_a3['adx'].mean():.1f}, loss mean={losses_a3['adx'].mean():.1f}")

# Candidate causal features for A3-01
A3_01_CANDIDATES = {
    'c_trend_maturity':          'Trend Maturity (bars in EMA alignment)',
    'c_di_spread':               'DI Spread (trend purity: |+DI - -DI| / sum)',
    'c_adx_rising':              'ADX Rising (momentum building)',
    'c_bars_since_adx40':        'Bars Since ADX>40 (institutional participation)',
    'c_price_vs_ema50_atr':      'Price vs EMA50 (ATR units, trend extension)',
    'c_overnight_range_atr':     'Overnight Range / ATR14 (inventory development)',
    'c_overnight_momentum_aligned': 'Overnight Momentum Aligned with Direction',
    'c_overnight_bars':          'Overnight Bars Elapsed (session maturity)',
    'c_atr_ratio_ov_rth':        'ATR Ratio: Overnight vs Prior RTH (vol regime)',
    'c_atr14_pct':               'ATR14 Percentile (vol regime)',
    'c_bars_since_impulse':      'Bars Since Last Impulse (momentum recency)',
}

print("\n--- Candidate Analysis for ADX Proxy ---")
print(f"\n{'Candidate':<35} {'d(W-L)':>8} {'p':>8} {'IG_alone':>10} {'IG_partial':>12} {'Attenuation':>13}")
print("-" * 90)

a3_01_results = {}
for feat, label in A3_01_CANDIDATES.items():
    if feat not in a3.columns: continue
    vals = a3[feat].values
    w_vals = wins_a3[feat].dropna().values
    l_vals = losses_a3[feat].dropna().values
    if len(w_vals) < 5 or len(l_vals) < 5: continue

    d = cohens_d(w_vals, l_vals)
    p = mw_test(w_vals, l_vals)
    ig_alone = info_gain(vals, y_a3)
    ig_proxy_alone, ig_proxy_given_cand = partial_info_gain(proxy_a3, vals, y_a3)
    coef_proxy, coef_proxy_adj, attenuation = logistic_attenuation(proxy_a3, vals, y_a3)

    # Mediation: does adding this candidate reduce the proxy's IG?
    ig_reduction_pct = (1 - ig_proxy_given_cand / ig_proxy_alone) * 100 if ig_proxy_alone > 0 else 0

    a3_01_results[feat] = {
        'label': label, 'd': d, 'p': p,
        'ig_alone': ig_alone, 'ig_proxy_alone': ig_proxy_alone,
        'ig_proxy_given_cand': ig_proxy_given_cand,
        'ig_reduction_pct': ig_reduction_pct,
        'attenuation': attenuation,
        'coef_proxy': coef_proxy, 'coef_proxy_adj': coef_proxy_adj,
    }

    d_str = f"{d:+.3f}" if not np.isnan(d) else "   nan"
    att_str = f"{attenuation:.1%}" if not np.isnan(attenuation) else "   nan"
    print(f"{feat:<35} {d_str:>8} {p:>8.4f} {ig_alone:>10.4f} {ig_proxy_given_cand:>12.4f} {att_str:>13}")

# Sort by attenuation (highest = strongest mediator)
sorted_a3_01 = sorted(a3_01_results.items(),
                       key=lambda x: x[1]['attenuation'] if not np.isnan(x[1]['attenuation']) else -1,
                       reverse=True)
print("\n--- Top Mediators (sorted by proxy attenuation) ---")
for feat, res in sorted_a3_01[:5]:
    print(f"  {feat}: attenuation={res['attenuation']:.1%}, IG reduction={res['ig_reduction_pct']:.1f}%")
    print(f"    d={res['d']:+.3f}, p={res['p']:.4f}, IG_alone={res['ig_alone']:.4f}")

# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 3: FS-A3-02 — EARLY SESSION (hour < 10)
# ═══════════════════════════════════════════════════════════════════════════════
print("\n" + "="*70)
print("PHASE 3: FS-A3-02 — IS TIME THE CAUSE?")
print("="*70)

proxy_a3_time = a3['hour'].values

print(f"\nProxy (hour): win mean={wins_a3['hour'].mean():.1f}, loss mean={losses_a3['hour'].mean():.1f}")

A3_02_CANDIDATES = {
    'c_overnight_range_atr':     'Overnight Range / ATR14 (range development)',
    'c_overnight_bars':          'Overnight Bars Elapsed (session maturity)',
    'c_overnight_momentum_aligned': 'Overnight Momentum Aligned',
    'c_overnight_momentum_raw':  'Overnight Momentum (raw pts)',
    'c_overnight_vol_cum':       'Overnight Cumulative Volume (participation)',
    'c_atr_ratio_ov_rth':        'ATR Ratio: Overnight vs Prior RTH',
    'c_bars_since_impulse':      'Bars Since Last Impulse',
    'c_adx_rising':              'ADX Rising (momentum building)',
    'c_di_spread':               'DI Spread (trend purity)',
    'c_atr14_pct':               'ATR14 Percentile (vol regime)',
}

print("\n--- Candidate Analysis for Hour Proxy ---")
print(f"\n{'Candidate':<35} {'d(W-L)':>8} {'p':>8} {'IG_alone':>10} {'IG_partial':>12} {'Attenuation':>13}")
print("-" * 90)

a3_02_results = {}
for feat, label in A3_02_CANDIDATES.items():
    if feat not in a3.columns: continue
    vals = a3[feat].values
    w_vals = wins_a3[feat].dropna().values
    l_vals = losses_a3[feat].dropna().values
    if len(w_vals) < 5 or len(l_vals) < 5: continue

    d = cohens_d(w_vals, l_vals)
    p = mw_test(w_vals, l_vals)
    ig_alone = info_gain(vals, y_a3)
    ig_proxy_alone, ig_proxy_given_cand = partial_info_gain(proxy_a3_time, vals, y_a3)
    coef_proxy, coef_proxy_adj, attenuation = logistic_attenuation(proxy_a3_time, vals, y_a3)

    ig_reduction_pct = (1 - ig_proxy_given_cand / ig_proxy_alone) * 100 if ig_proxy_alone > 0 else 0

    a3_02_results[feat] = {
        'label': label, 'd': d, 'p': p,
        'ig_alone': ig_alone, 'ig_proxy_alone': ig_proxy_alone,
        'ig_proxy_given_cand': ig_proxy_given_cand,
        'ig_reduction_pct': ig_reduction_pct,
        'attenuation': attenuation,
    }

    d_str = f"{d:+.3f}" if not np.isnan(d) else "   nan"
    att_str = f"{attenuation:.1%}" if not np.isnan(attenuation) else "   nan"
    print(f"{feat:<35} {d_str:>8} {p:>8.4f} {ig_alone:>10.4f} {ig_proxy_given_cand:>12.4f} {att_str:>13}")

sorted_a3_02 = sorted(a3_02_results.items(),
                       key=lambda x: x[1]['attenuation'] if not np.isnan(x[1]['attenuation']) else -1,
                       reverse=True)
print("\n--- Top Mediators (sorted by proxy attenuation) ---")
for feat, res in sorted_a3_02[:5]:
    print(f"  {feat}: attenuation={res['attenuation']:.1%}, IG reduction={res['ig_reduction_pct']:.1f}%")
    print(f"    d={res['d']:+.3f}, p={res['p']:.4f}, IG_alone={res['ig_alone']:.4f}")

# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 4: FS-A2-01 — ARI CAUTION (consecutive losses >= 2)
# ═══════════════════════════════════════════════════════════════════════════════
print("\n" + "="*70)
print("PHASE 4: FS-A2-01 — WHY DO CONSECUTIVE LOSSES PREDICT FUTURE LOSSES?")
print("="*70)

a2 = df_wl[df_wl['model'] == 'A2'].copy()
a2_all = df[df['model'] == 'A2'].copy()
wins_a2   = a2[a2['outcome'] == 'win']
losses_a2 = a2[a2['outcome'] == 'loss']

proxy_a2 = a2['ari_caution'].values
y_a2     = a2['is_win'].values

print(f"\nA2 dataset: {len(a2)} trades ({len(wins_a2)} wins, {len(losses_a2)} losses)")
print(f"Proxy (ari_caution): win rate no-caution={a2[a2['ari_caution']==0]['is_win'].mean():.1%}, "
      f"caution={a2[a2['ari_caution']==1]['is_win'].mean():.1%}")

A2_01_CANDIDATES = {
    'c_regime_atr_change':   'ATR Change Since Streak Start (vol shift)',
    'c_regime_adx_change':   'ADX Change Since Streak Start (momentum shift)',
    'c_regime_ema_flip':     'EMA Alignment Flip During Streak (regime change)',
    'c_atr_accel_now':       'ATR Acceleration at Entry (current vol expansion)',
    'c_vol_regime_pct':      'ATR14 Percentile (vol regime)',
    'c_time_since_streak':   'Bars Since Streak Started (temporal decay)',
    'adx':                   'ADX at Entry (trend strength)',
    'adx_slope':             'ADX Slope (trend momentum direction)',
    'atr14':                 'ATR14 at Entry (absolute volatility)',
    'stop_pts':              'Stop Distance (execution quality)',
    'trend_maturity':        'Trend Maturity (trend age)',
}

print("\n--- Candidate Analysis for ARI Caution Proxy ---")
print(f"\n{'Candidate':<35} {'d(W-L)':>8} {'p':>8} {'IG_alone':>10} {'IG_partial':>12} {'Attenuation':>13}")
print("-" * 90)

a2_01_results = {}
for feat, label in A2_01_CANDIDATES.items():
    if feat not in a2.columns: continue
    vals = a2[feat].values
    w_vals = wins_a2[feat].dropna().values
    l_vals = losses_a2[feat].dropna().values
    if len(w_vals) < 5 or len(l_vals) < 5: continue

    d = cohens_d(w_vals, l_vals)
    p = mw_test(w_vals, l_vals)
    ig_alone = info_gain(vals, y_a2)
    ig_proxy_alone, ig_proxy_given_cand = partial_info_gain(proxy_a2.astype(float), vals, y_a2)
    coef_proxy, coef_proxy_adj, attenuation = logistic_attenuation(proxy_a2.astype(float), vals, y_a2)

    ig_reduction_pct = (1 - ig_proxy_given_cand / ig_proxy_alone) * 100 if ig_proxy_alone > 0 else 0

    a2_01_results[feat] = {
        'label': label, 'd': d, 'p': p,
        'ig_alone': ig_alone, 'ig_proxy_alone': ig_proxy_alone,
        'ig_proxy_given_cand': ig_proxy_given_cand,
        'ig_reduction_pct': ig_reduction_pct,
        'attenuation': attenuation,
    }

    d_str = f"{d:+.3f}" if not np.isnan(d) else "   nan"
    att_str = f"{attenuation:.1%}" if not np.isnan(attenuation) else "   nan"
    print(f"{feat:<35} {d_str:>8} {p:>8.4f} {ig_alone:>10.4f} {ig_proxy_given_cand:>12.4f} {att_str:>13}")

sorted_a2_01 = sorted(a2_01_results.items(),
                       key=lambda x: x[1]['attenuation'] if not np.isnan(x[1]['attenuation']) else -1,
                       reverse=True)
print("\n--- Top Mediators (sorted by proxy attenuation) ---")
for feat, res in sorted_a2_01[:5]:
    print(f"  {feat}: attenuation={res['attenuation']:.1%}, IG reduction={res['ig_reduction_pct']:.1f}%")
    print(f"    d={res['d']:+.3f}, p={res['p']:.4f}, IG_alone={res['ig_alone']:.4f}")

# ─── Additional A2 investigation: conditional win rates ───────────────────────
print("\n--- A2 Conditional Win Rate Analysis ---")
print("Win rate by consecutive losses before entry:")
for cl_val in sorted(a2['consec_losses_before'].unique()):
    sub = a2[a2['consec_losses_before'] == cl_val]
    if len(sub) < 3: continue
    wr = sub['is_win'].mean()
    print(f"  consec_losses={cl_val}: N={len(sub)}, WR={wr:.1%}")

print("\nATR change during loss streaks:")
for cl_val in [0, 1, 2, 3, 4, 5]:
    sub = a2[a2['consec_losses_before'] == cl_val]
    if len(sub) < 3: continue
    atr_chg = sub['c_regime_atr_change'].mean()
    adx_chg = sub['c_regime_adx_change'].mean()
    ema_flip = sub['c_regime_ema_flip'].mean()
    print(f"  consec_losses={cl_val}: ATR_chg={atr_chg:+.3f}, ADX_chg={adx_chg:+.1f}, EMA_flip={ema_flip:.0%}")

# ─── Save all mediation results ───────────────────────────────────────────────
med_records = []
for sig_id, results_dict, proxy_name in [
    ('FS-A3-01', a3_01_results, 'adx'),
    ('FS-A3-02', a3_02_results, 'hour'),
    ('FS-A2-01', a2_01_results, 'ari_caution'),
]:
    for feat, res in results_dict.items():
        med_records.append({
            'signature': sig_id, 'proxy': proxy_name,
            'candidate': feat, 'candidate_label': res['label'],
            'cohens_d': res['d'], 'mw_pvalue': res['p'],
            'ig_candidate_alone': res['ig_alone'],
            'ig_proxy_alone': res['ig_proxy_alone'],
            'ig_proxy_given_candidate': res['ig_proxy_given_cand'],
            'ig_reduction_pct': res['ig_reduction_pct'],
            'logistic_attenuation': res['attenuation'],
        })

med_df = pd.DataFrame(med_records)
med_df.to_csv('/home/ubuntu/Project-Atlas/research-engine/fae/fae_mediation_results.csv', index=False)
print("\nMediation results saved.")

# ═══════════════════════════════════════════════════════════════════════════════
# VISUALISATIONS
# ═══════════════════════════════════════════════════════════════════════════════
print("\nGenerating visualisations...")

# ─── Figure 1: Mediation summary — attenuation heatmap ───────────────────────
fig, axes = plt.subplots(1, 3, figsize=(20, 8))
fig.suptitle('Sprint 052 — Proxy Attenuation Analysis\n(How much does each candidate reduce the proxy\'s predictive power?)',
             fontsize=13, fontweight='bold')

for ax, (sig_id, results_dict, proxy_name, model_name) in zip(axes, [
    ('FS-A3-01', a3_01_results, 'ADX', 'A3'),
    ('FS-A3-02', a3_02_results, 'Hour', 'A3'),
    ('FS-A2-01', a2_01_results, 'ARI Caution', 'A2'),
]):
    sorted_res = sorted(results_dict.items(),
                        key=lambda x: x[1]['attenuation'] if not np.isnan(x[1]['attenuation']) else -1,
                        reverse=True)
    feats = [r[0].replace('c_', '') for r in sorted_res]
    attenuations = [r[1]['attenuation'] if not np.isnan(r[1]['attenuation']) else 0 for r in sorted_res]
    ig_reductions = [r[1]['ig_reduction_pct'] for r in sorted_res]

    colors = ['#1565C0' if a > 0.3 else ('#42A5F5' if a > 0.1 else '#BDBDBD') for a in attenuations]
    bars = ax.barh(range(len(feats)), attenuations, color=colors, alpha=0.85)
    ax.set_yticks(range(len(feats)))
    ax.set_yticklabels(feats, fontsize=9)
    ax.set_xlabel('Proxy Coefficient Attenuation', fontsize=10)
    ax.set_title(f'{sig_id}: {proxy_name} Proxy\n[Model {model_name}]', fontsize=11, fontweight='bold')
    ax.axvline(0.3, color='red', linestyle='--', linewidth=1.5, alpha=0.7, label='30% threshold')
    ax.set_xlim(-0.1, 1.0)
    ax.invert_yaxis()
    ax.legend(fontsize=8)
    ax.grid(True, alpha=0.3, axis='x')
    for bar, att in zip(bars, attenuations):
        ax.text(max(att + 0.01, 0.01), bar.get_y() + bar.get_height()/2,
                f'{att:.0%}', va='center', fontsize=8)

plt.tight_layout()
plt.savefig(os.path.join(OUTPUT_DIR, 'fae_proxy_attenuation.png'), dpi=150, bbox_inches='tight')
plt.close()
print("  Saved: fae_proxy_attenuation.png")

# ─── Figure 2: Information Gain comparison ───────────────────────────────────
fig, axes = plt.subplots(1, 3, figsize=(20, 8))
fig.suptitle('Sprint 052 — Information Gain: Proxy vs Candidates\n(Blue=Proxy alone, Orange=Proxy given candidate)',
             fontsize=13, fontweight='bold')

for ax, (sig_id, results_dict, proxy_name, model_name) in zip(axes, [
    ('FS-A3-01', a3_01_results, 'ADX', 'A3'),
    ('FS-A3-02', a3_02_results, 'Hour', 'A3'),
    ('FS-A2-01', a2_01_results, 'ARI Caution', 'A2'),
]):
    sorted_res = sorted(results_dict.items(),
                        key=lambda x: x[1]['ig_alone'], reverse=True)
    feats = [r[0].replace('c_', '') for r in sorted_res]
    ig_cand   = [r[1]['ig_alone'] for r in sorted_res]
    ig_proxy  = [r[1]['ig_proxy_alone'] for r in sorted_res]
    ig_p_given_c = [r[1]['ig_proxy_given_cand'] for r in sorted_res]

    x = np.arange(len(feats))
    w = 0.3
    ax.bar(x - w, ig_cand, w, label='Candidate IG', color='#4CAF50', alpha=0.8)
    ax.bar(x,     ig_proxy, w, label='Proxy IG (alone)', color='#2196F3', alpha=0.8)
    ax.bar(x + w, ig_p_given_c, w, label='Proxy IG (given candidate)', color='#FF9800', alpha=0.8)
    ax.set_xticks(x)
    ax.set_xticklabels(feats, rotation=45, ha='right', fontsize=8)
    ax.set_ylabel('Information Gain (bits)', fontsize=10)
    ax.set_title(f'{sig_id}: {proxy_name} Proxy\n[Model {model_name}]', fontsize=11, fontweight='bold')
    ax.legend(fontsize=8)
    ax.grid(True, alpha=0.3, axis='y')

plt.tight_layout()
plt.savefig(os.path.join(OUTPUT_DIR, 'fae_information_gain_mediation.png'), dpi=150, bbox_inches='tight')
plt.close()
print("  Saved: fae_information_gain_mediation.png")

# ─── Figure 3: A3 overnight range vs hour scatter ────────────────────────────
fig, axes = plt.subplots(1, 3, figsize=(18, 6))
fig.suptitle('Sprint 052 — A3 Causal Investigation\nOvernightRange vs Hour vs ADX',
             fontsize=13, fontweight='bold')

a3_all_wl = df_wl[df_wl['model'] == 'A3']
win_mask  = a3_all_wl['outcome'] == 'win'
loss_mask = a3_all_wl['outcome'] == 'loss'

# Scatter: hour vs overnight range, coloured by outcome
ax = axes[0]
ax.scatter(a3_all_wl[loss_mask]['hour'], a3_all_wl[loss_mask]['c_overnight_range_atr'],
           c='#F44336', alpha=0.6, s=40, label='Loss', marker='x')
ax.scatter(a3_all_wl[win_mask]['hour'], a3_all_wl[win_mask]['c_overnight_range_atr'],
           c='#2196F3', alpha=0.7, s=50, label='Win', marker='o')
ax.set_xlabel('Hour of Entry (ET)', fontsize=10)
ax.set_ylabel('Overnight Range / ATR14', fontsize=10)
ax.set_title('Hour vs Overnight Range\n(A3 Trades)', fontsize=11, fontweight='bold')
ax.legend(fontsize=9); ax.grid(True, alpha=0.3)

# Scatter: ADX vs overnight range
ax = axes[1]
ax.scatter(a3_all_wl[loss_mask]['adx'], a3_all_wl[loss_mask]['c_overnight_range_atr'],
           c='#F44336', alpha=0.6, s=40, label='Loss', marker='x')
ax.scatter(a3_all_wl[win_mask]['adx'], a3_all_wl[win_mask]['c_overnight_range_atr'],
           c='#2196F3', alpha=0.7, s=50, label='Win', marker='o')
ax.axvline(30, color='orange', linestyle='--', linewidth=2, label='ADX=30 filter')
ax.set_xlabel('ADX at Entry', fontsize=10)
ax.set_ylabel('Overnight Range / ATR14', fontsize=10)
ax.set_title('ADX vs Overnight Range\n(A3 Trades)', fontsize=11, fontweight='bold')
ax.legend(fontsize=9); ax.grid(True, alpha=0.3)

# Scatter: DI spread vs ADX
ax = axes[2]
ax.scatter(a3_all_wl[loss_mask]['adx'], a3_all_wl[loss_mask]['c_di_spread'],
           c='#F44336', alpha=0.6, s=40, label='Loss', marker='x')
ax.scatter(a3_all_wl[win_mask]['adx'], a3_all_wl[win_mask]['c_di_spread'],
           c='#2196F3', alpha=0.7, s=50, label='Win', marker='o')
ax.axvline(30, color='orange', linestyle='--', linewidth=2, label='ADX=30 filter')
ax.set_xlabel('ADX at Entry', fontsize=10)
ax.set_ylabel('DI Spread (trend purity)', fontsize=10)
ax.set_title('ADX vs DI Spread\n(A3 Trades)', fontsize=11, fontweight='bold')
ax.legend(fontsize=9); ax.grid(True, alpha=0.3)

plt.tight_layout()
plt.savefig(os.path.join(OUTPUT_DIR, 'fae_a3_causal_scatter.png'), dpi=150, bbox_inches='tight')
plt.close()
print("  Saved: fae_a3_causal_scatter.png")

# ─── Figure 4: A2 regime shift analysis ──────────────────────────────────────
fig, axes = plt.subplots(1, 3, figsize=(18, 6))
fig.suptitle('Sprint 052 — A2 Regime Shift Investigation\n(ARI Caution Mechanism)',
             fontsize=13, fontweight='bold')

a2_all_wl = df_wl[df_wl['model'] == 'A2']

# ATR change vs consecutive losses
ax = axes[0]
cl_vals = sorted(a2_all_wl['consec_losses_before'].unique())
atr_chg_by_cl = [a2_all_wl[a2_all_wl['consec_losses_before']==cl]['c_regime_atr_change'].mean()
                 for cl in cl_vals]
wr_by_cl = [a2_all_wl[a2_all_wl['consec_losses_before']==cl]['is_win'].mean()
            for cl in cl_vals]
n_by_cl  = [len(a2_all_wl[a2_all_wl['consec_losses_before']==cl]) for cl in cl_vals]

ax2_twin = ax.twinx()
ax.bar(cl_vals, atr_chg_by_cl, color='#FF9800', alpha=0.7, label='ATR Change')
ax2_twin.plot(cl_vals, wr_by_cl, 'b-o', linewidth=2, markersize=6, label='Win Rate')
ax.set_xlabel('Consecutive Losses Before Entry', fontsize=10)
ax.set_ylabel('ATR Change Since Streak Start', fontsize=10, color='#FF9800')
ax2_twin.set_ylabel('Win Rate', fontsize=10, color='blue')
ax.set_title('ATR Shift vs Consecutive Losses', fontsize=11, fontweight='bold')
ax.axhline(0, color='black', linewidth=0.5)
lines1, labels1 = ax.get_legend_handles_labels()
lines2, labels2 = ax2_twin.get_legend_handles_labels()
ax.legend(lines1 + lines2, labels1 + labels2, fontsize=8)
ax.grid(True, alpha=0.3)

# ADX change vs consecutive losses
ax = axes[1]
adx_chg_by_cl = [a2_all_wl[a2_all_wl['consec_losses_before']==cl]['c_regime_adx_change'].mean()
                 for cl in cl_vals]
ax2_twin2 = ax.twinx()
ax.bar(cl_vals, adx_chg_by_cl, color='#9C27B0', alpha=0.7, label='ADX Change')
ax2_twin2.plot(cl_vals, wr_by_cl, 'b-o', linewidth=2, markersize=6, label='Win Rate')
ax.set_xlabel('Consecutive Losses Before Entry', fontsize=10)
ax.set_ylabel('ADX Change Since Streak Start', fontsize=10, color='#9C27B0')
ax2_twin2.set_ylabel('Win Rate', fontsize=10, color='blue')
ax.set_title('ADX Shift vs Consecutive Losses', fontsize=11, fontweight='bold')
ax.axhline(0, color='black', linewidth=0.5)
lines1, labels1 = ax.get_legend_handles_labels()
lines2, labels2 = ax2_twin2.get_legend_handles_labels()
ax.legend(lines1 + lines2, labels1 + labels2, fontsize=8)
ax.grid(True, alpha=0.3)

# EMA flip rate vs consecutive losses
ax = axes[2]
ema_flip_by_cl = [a2_all_wl[a2_all_wl['consec_losses_before']==cl]['c_regime_ema_flip'].mean()
                  for cl in cl_vals]
ax2_twin3 = ax.twinx()
ax.bar(cl_vals, ema_flip_by_cl, color='#E53935', alpha=0.7, label='EMA Flip Rate')
ax2_twin3.plot(cl_vals, wr_by_cl, 'b-o', linewidth=2, markersize=6, label='Win Rate')
ax.set_xlabel('Consecutive Losses Before Entry', fontsize=10)
ax.set_ylabel('EMA Alignment Flip Rate', fontsize=10, color='#E53935')
ax2_twin3.set_ylabel('Win Rate', fontsize=10, color='blue')
ax.set_title('EMA Regime Flip vs Consecutive Losses', fontsize=11, fontweight='bold')
lines1, labels1 = ax.get_legend_handles_labels()
lines2, labels2 = ax2_twin3.get_legend_handles_labels()
ax.legend(lines1 + lines2, labels1 + labels2, fontsize=8)
ax.grid(True, alpha=0.3)

plt.tight_layout()
plt.savefig(os.path.join(OUTPUT_DIR, 'fae_a2_regime_analysis.png'), dpi=150, bbox_inches='tight')
plt.close()
print("  Saved: fae_a2_regime_analysis.png")

print("\n=== MEDIATION ANALYSIS COMPLETE ===")
