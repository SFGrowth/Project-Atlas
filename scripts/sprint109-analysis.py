"""
sprint109-analysis.py
Sprint 109 — Parts 2+3: Winner vs Loser Analysis + Feature Importance
Dataset: ATLAS-MNQ-5M-V1 v1.0
"""
import json
import numpy as np
from scipy import stats
from collections import defaultdict
import warnings
warnings.filterwarnings('ignore')

# ─── Load trade data ─────────────────────────────────────────────────────────
with open('/tmp/sprint109-trades.json') as f:
    trades = json.load(f)

wins = [t for t in trades if t['outcome'] == 'WIN']
losses = [t for t in trades if t['outcome'] == 'LOSS']

print(f"=== Sprint 109 — Parts 2+3: Winner vs Loser Analysis ===")
print(f"Dataset: ATLAS-MNQ-5M-V1 v1.0")
print(f"Total trades: {len(trades)} | Winners: {len(wins)} | Losers: {len(losses)}")
print(f"Overall win rate: {len(wins)/len(trades)*100:.1f}%\n")

results = {}

# ─── PART 2: Categorical Feature Analysis ────────────────────────────────────
print("=== PART 2A: CATEGORICAL FEATURES ===\n")

categorical_features = [
    ('f01_session', 'Session'),
    ('f02_regime', 'Regime'),
    ('f15_prev_day_bias', 'Previous Day Bias'),
    ('f16_overnight_inventory', 'Overnight Inventory'),
    ('f17_or_position', 'Opening Range Position'),
    ('f23_seq_class', 'Sequence Classification'),
    ('f24_behav_class', 'Behaviour Classification'),
    ('f26_direction', 'Trade Direction'),
    ('f09_ema_align', 'EMA Alignment'),
]

cat_results = {}
for feat_key, feat_name in categorical_features:
    groups = defaultdict(lambda: {'wins': 0, 'total': 0})
    for t in trades:
        v = t.get(feat_key)
        if v is None:
            continue
        groups[str(v)]['total'] += 1
        if t['outcome'] == 'WIN':
            groups[str(v)]['wins'] += 1

    print(f"  {feat_name}:")
    group_data = []
    for grp, d in sorted(groups.items(), key=lambda x: -x[1]['total']):
        wr = d['wins'] / d['total'] * 100 if d['total'] > 0 else 0
        pnl = sum(t['pnlDollar'] for t in trades if str(t.get(feat_key)) == grp)
        group_data.append({'group': grp, 'n': d['total'], 'wr': wr, 'pnl': pnl})
        print(f"    {grp:20s}: n={d['total']:4d}, WR={wr:5.1f}%, P&L=${pnl:+8.0f}")

    # Chi-squared test for independence
    observed = [[d['wins'], d['total'] - d['wins']] for d in groups.values() if d['total'] >= 5]
    if len(observed) >= 2:
        try:
            chi2, p_val, dof, expected = stats.chi2_contingency(observed)
            significant = '*** SIGNIFICANT' if p_val < 0.05 else ('* marginal' if p_val < 0.10 else '')
            print(f"    Chi-squared p={p_val:.4f} {significant}")
            cat_results[feat_key] = {'p_value': p_val, 'chi2': chi2, 'groups': group_data}
        except Exception:
            cat_results[feat_key] = {'p_value': 1.0, 'groups': group_data}
    print()

# ─── PART 2B: Continuous Feature Analysis ────────────────────────────────────
print("=== PART 2B: CONTINUOUS FEATURES ===\n")

continuous_features = [
    ('f03_adx', 'ADX (14)'),
    ('f04_atr', 'ATR (14)'),
    ('f05_atr_ratio', 'ATR Ratio (current/20-bar-ago)'),
    ('f06_rsi', 'RSI (14)'),
    ('f07_vwap_dist_atr', 'VWAP Distance (ATR units)'),
    ('f08_vwap_slope', 'VWAP Slope'),
    ('f10_trend_strength', 'Trend Strength (ADX)'),
    ('f11_vol_ratio', 'Volume Ratio (vs 20-bar avg)'),
    ('f13_min_since_open', 'Minutes Since Session Open'),
    ('f14_min_until_close', 'Minutes Until Session Close'),
    ('f18_dist_from_or_atr', 'Distance from Opening Range (ATR)'),
    ('f19_dist_from_pd_high_atr', 'Distance from Prev Day High (ATR)'),
    ('f20_dist_from_pd_low_atr', 'Distance from Prev Day Low (ATR)'),
    ('f21_dist_from_ov_high_atr', 'Distance from Overnight High (ATR)'),
    ('f22_dist_from_ov_low_atr', 'Distance from Overnight Low (ATR)'),
    ('f25_body_ratio', 'Bar Body Ratio'),
    ('f27_ema20_vs_ema50', 'EMA20 vs EMA50 (ATR units)'),
]

cont_results = {}
for feat_key, feat_name in continuous_features:
    win_vals = [t[feat_key] for t in wins if t.get(feat_key) is not None]
    loss_vals = [t[feat_key] for t in losses if t.get(feat_key) is not None]

    if len(win_vals) < 10 or len(loss_vals) < 10:
        continue

    win_arr = np.array(win_vals, dtype=float)
    loss_arr = np.array(loss_vals, dtype=float)

    # Mann-Whitney U test (non-parametric, no normality assumption)
    u_stat, p_val = stats.mannwhitneyu(win_arr, loss_arr, alternative='two-sided')

    # Effect size: rank-biserial correlation
    n1, n2 = len(win_arr), len(loss_arr)
    r_effect = 1 - (2 * u_stat) / (n1 * n2)

    win_med = np.median(win_arr)
    loss_med = np.median(loss_arr)
    win_mean = np.mean(win_arr)
    loss_mean = np.mean(loss_arr)

    significant = '*** SIGNIFICANT' if p_val < 0.05 else ('* marginal' if p_val < 0.10 else '')
    print(f"  {feat_name}:")
    print(f"    WIN  median={win_med:8.3f}  mean={win_mean:8.3f}  n={n1}")
    print(f"    LOSS median={loss_med:8.3f}  mean={loss_mean:8.3f}  n={n2}")
    print(f"    Mann-Whitney p={p_val:.4f}, effect r={r_effect:.3f} {significant}")
    print()

    cont_results[feat_key] = {
        'p_value': p_val,
        'effect_r': r_effect,
        'win_median': win_med,
        'loss_median': loss_med,
        'win_mean': win_mean,
        'loss_mean': loss_mean,
        'n_win': n1,
        'n_loss': n2,
    }

# ─── PART 3: Feature Importance Ranking ──────────────────────────────────────
print("\n=== PART 3: FEATURE IMPORTANCE RANKING ===\n")

# Combine all features by statistical significance
all_features = []

for feat_key, data in cont_results.items():
    feat_name = dict(continuous_features).get(feat_key, feat_key)
    all_features.append({
        'feature': feat_key,
        'name': feat_name,
        'type': 'continuous',
        'p_value': data['p_value'],
        'effect_size': abs(data['effect_r']),
        'win_median': data['win_median'],
        'loss_median': data['loss_median'],
        'direction': 'WIN_HIGHER' if data['win_median'] > data['loss_median'] else 'WIN_LOWER',
    })

for feat_key, data in cat_results.items():
    feat_name = dict(categorical_features).get(feat_key, feat_key)
    # Use chi2 p-value as proxy
    all_features.append({
        'feature': feat_key,
        'name': feat_name,
        'type': 'categorical',
        'p_value': data['p_value'],
        'effect_size': 1 - data['p_value'],  # crude proxy
        'win_median': None,
        'loss_median': None,
        'direction': 'CATEGORICAL',
    })

# Sort by p-value (most significant first)
all_features.sort(key=lambda x: x['p_value'])

print(f"{'Rank':<5} {'Feature':<45} {'Type':<12} {'p-value':<10} {'Effect':<8} {'Direction'}")
print("-" * 100)
for rank, f in enumerate(all_features, 1):
    sig = '***' if f['p_value'] < 0.05 else ('*' if f['p_value'] < 0.10 else '   ')
    print(f"  {rank:<4} {f['name']:<45} {f['type']:<12} {f['p_value']:<10.4f} {f['effect_size']:<8.3f} {f['direction']} {sig}")

# Top discriminators
significant_features = [f for f in all_features if f['p_value'] < 0.05]
marginal_features = [f for f in all_features if 0.05 <= f['p_value'] < 0.10]
null_features = [f for f in all_features if f['p_value'] >= 0.10]

print(f"\nSignificant discriminators (p<0.05): {len(significant_features)}")
print(f"Marginal discriminators (p<0.10):   {len(marginal_features)}")
print(f"Null features (p≥0.10):             {len(null_features)}")

# ─── Save results ─────────────────────────────────────────────────────────────
output = {
    'summary': {
        'total_trades': len(trades),
        'winners': len(wins),
        'losers': len(losses),
        'win_rate': len(wins) / len(trades),
    },
    'feature_ranking': all_features,
    'significant_features': significant_features,
    'marginal_features': marginal_features,
    'null_features': null_features,
    'categorical_results': cat_results,
    'continuous_results': cont_results,
}

with open('/tmp/sprint109-analysis.json', 'w') as f:
    json.dump(output, f, indent=2, default=str)

print("\nAnalysis saved to /tmp/sprint109-analysis.json")
