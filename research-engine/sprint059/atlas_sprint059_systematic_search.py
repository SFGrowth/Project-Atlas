"""
Atlas Sprint 059 — Systematic MVML Search

Exhaustively tests all 2-way, 3-way, and 4-way combinations of binarised features
for irreducible behavioural structures.

Search strategy:
  1. Binarise each feature at its 75th, 85th, and 95th percentile (and direction)
  2. Test all 2-way, 3-way, and 4-way combinations
  3. Apply initial screen: WR >= 60%, N >= 200, activation rate 2-15%
  4. Apply irreducibility test: removing any component must reduce WR by >= 5pp
  5. Exclude combinations that are supersets of ML-001
"""

import pandas as pd
import numpy as np
from itertools import combinations
import warnings, json, os
warnings.filterwarnings('ignore')

FEAT_PATH  = '/home/ubuntu/Project-Atlas/research-engine/sprint056/discovery_features_rth.csv'
OUTPUT_DIR = '/home/ubuntu/Project-Atlas/research-engine/sprint059'
os.makedirs(OUTPUT_DIR, exist_ok=True)

print("Loading RTH feature matrix...")
df = pd.read_csv(FEAT_PATH)
df['ts']    = pd.to_datetime(df['ts'])
df_clean    = df.dropna(subset=['fwd_12_return_atr', 'is_exceptional_fwd']).copy()
N_TOTAL     = len(df_clean)
BASELINE_WR = (df_clean['fwd_12_return_atr'] > 0).mean() * 100
print(f"  {N_TOTAL:,} clean RTH bars | Baseline WR: {BASELINE_WR:.1f}%")

# ─── Feature Binarisation ─────────────────────────────────────────────────────
print("\n=== FEATURE BINARISATION ===")
# For each continuous feature, create binary flags at multiple thresholds
# Also create directional flags for directional features

binary_flags = {}

# Participation features (high = good)
for feat in ['rel_txn', 'rel_vol_20', 'rel_dollar_vol']:
    if feat not in df_clean.columns:
        continue
    for pct in [75, 85, 95]:
        thresh = np.percentile(df_clean[feat].dropna(), pct)
        flag_name = f'{feat}_p{pct}'
        df_clean[flag_name] = (df_clean[feat] >= thresh).astype(int)
        binary_flags[flag_name] = {'feature': feat, 'direction': 'high', 'threshold': thresh, 'pct': pct}

# Overnight features
if 'ov_range_vs_atr14' in df_clean.columns:
    for pct in [75, 85, 95]:
        thresh = np.percentile(df_clean['ov_range_vs_atr14'].dropna(), pct)
        flag_name = f'ov_range_p{pct}'
        df_clean[flag_name] = (df_clean['ov_range_vs_atr14'] >= thresh).astype(int)
        binary_flags[flag_name] = {'feature': 'ov_range_vs_atr14', 'direction': 'high', 'threshold': thresh, 'pct': pct}

if 'ov_dir' in df_clean.columns:
    df_clean['ov_bull'] = (df_clean['ov_dir'] == 1).astype(int)
    df_clean['ov_bear'] = (df_clean['ov_dir'] == -1).astype(int)
    binary_flags['ov_bull'] = {'feature': 'ov_dir', 'direction': 'bull', 'threshold': 1}
    binary_flags['ov_bear'] = {'feature': 'ov_dir', 'direction': 'bear', 'threshold': -1}

# Trend features
if 'adx14' in df_clean.columns:
    for thresh in [20, 25, 30, 35]:
        flag_name = f'adx_ge{thresh}'
        df_clean[flag_name] = (df_clean['adx14'] >= thresh).astype(int)
        binary_flags[flag_name] = {'feature': 'adx14', 'direction': 'high', 'threshold': thresh}

if 'ema_alignment' in df_clean.columns:
    df_clean['ema_bull'] = (df_clean['ema_alignment'] == 1).astype(int)
    df_clean['ema_bear'] = (df_clean['ema_alignment'] == -1).astype(int)
    df_clean['ema_aligned'] = (df_clean['ema_alignment'] != 0).astype(int)
    binary_flags['ema_bull'] = {'feature': 'ema_alignment', 'direction': 'bull', 'threshold': 1}
    binary_flags['ema_bear'] = {'feature': 'ema_alignment', 'direction': 'bear', 'threshold': -1}
    binary_flags['ema_aligned'] = {'feature': 'ema_alignment', 'direction': 'aligned', 'threshold': 1}

# Volatility features
if 'volcomp_5_14' in df_clean.columns:
    for pct in [25, 50, 75]:
        thresh = np.percentile(df_clean['volcomp_5_14'].dropna(), pct)
        flag_name = f'volcomp_le{pct}'
        df_clean[flag_name] = (df_clean['volcomp_5_14'] <= thresh).astype(int)
        binary_flags[flag_name] = {'feature': 'volcomp_5_14', 'direction': 'low', 'threshold': thresh, 'pct': pct}

if 'day_range_vs_atr14' in df_clean.columns:
    for pct in [75, 85, 95]:
        thresh = np.percentile(df_clean['day_range_vs_atr14'].dropna(), pct)
        flag_name = f'dayrange_p{pct}'
        df_clean[flag_name] = (df_clean['day_range_vs_atr14'] >= thresh).astype(int)
        binary_flags[flag_name] = {'feature': 'day_range_vs_atr14', 'direction': 'high', 'threshold': thresh, 'pct': pct}

# Session features
if 'hour' in df_clean.columns:
    df_clean['am_session'] = ((df_clean['hour'] >= 9) & (df_clean['hour'] <= 11)).astype(int)
    df_clean['pm_session'] = (df_clean['hour'] >= 13).astype(int)
    binary_flags['am_session'] = {'feature': 'hour', 'direction': 'am', 'threshold': '9-11'}
    binary_flags['pm_session'] = {'feature': 'hour', 'direction': 'pm', 'threshold': '13+'}

if 'dow' in df_clean.columns:
    for day, name in [(0,'mon'), (1,'tue'), (2,'wed'), (3,'thu'), (4,'fri')]:
        flag_name = f'dow_{name}'
        df_clean[flag_name] = (df_clean['dow'] == day).astype(int)
        binary_flags[flag_name] = {'feature': 'dow', 'direction': name, 'threshold': day}

# Momentum features
if 'bar_dir' in df_clean.columns:
    df_clean['bar_bull'] = (df_clean['bar_dir'] == 1).astype(int)
    df_clean['bar_bear'] = (df_clean['bar_dir'] == -1).astype(int)
    binary_flags['bar_bull'] = {'feature': 'bar_dir', 'direction': 'bull', 'threshold': 1}
    binary_flags['bar_bear'] = {'feature': 'bar_dir', 'direction': 'bear', 'threshold': -1}

flag_names = list(binary_flags.keys())
print(f"  Created {len(flag_names)} binary flags")

# ─── ML-001 flag (to exclude supersets) ──────────────────────────────────────
df_clean['ml001'] = ((df_clean['rel_txn'] >= 1.33) & 
                     (df_clean['ov_range_vs_atr14'] >= 10.85) & 
                     (df_clean['ov_dir'] == 1)).astype(int)

# ─── Systematic Search ────────────────────────────────────────────────────────
def test_combination(df_in, flag_list, target_col='fwd_12_return_atr'):
    """Test a combination of binary flags and return metrics."""
    mask = pd.Series(True, index=df_in.index)
    for flag in flag_list:
        if flag not in df_in.columns:
            return None
        mask = mask & (df_in[flag] == 1)
    
    n = mask.sum()
    if n < 200:
        return None
    
    act_rate = n / len(df_in)
    if act_rate < 0.02 or act_rate > 0.15:
        return None
    
    fwd  = df_in.loc[mask, target_col]
    wr   = (fwd > 0).mean() * 100
    if wr < 60.0:
        return None
    
    pf   = fwd[fwd>0].sum() / (fwd[fwd<0].abs().sum() + 1e-6)
    exc  = df_in.loc[mask, 'is_exceptional_fwd'].mean() * 100
    
    return {'n': int(n), 'act_rate': float(act_rate), 'wr': float(wr), 'pf': float(pf), 'exc': float(exc)}

def irreducibility_test(df_in, flag_list, base_wr, target_col='fwd_12_return_atr'):
    """Test whether removing any component reduces WR by >= 5pp."""
    if len(flag_list) < 2:
        return True  # single-component is trivially irreducible
    
    for i, flag_to_remove in enumerate(flag_list):
        reduced = [f for j, f in enumerate(flag_list) if j != i]
        mask = pd.Series(True, index=df_in.index)
        for flag in reduced:
            mask = mask & (df_in[flag] == 1)
        n = mask.sum()
        if n < 50:
            return True  # can't test, assume irreducible
        fwd = df_in.loc[mask, target_col]
        wr_reduced = (fwd > 0).mean() * 100
        if wr_reduced >= base_wr - 5.0:
            return False  # removing this component doesn't hurt enough
    return True

print("\n=== SYSTEMATIC SEARCH ===")
print("  Testing 2-way combinations...")
candidates_2way = []
tested_2 = 0
for combo in combinations(flag_names, 2):
    tested_2 += 1
    result = test_combination(df_clean, list(combo))
    if result:
        irred = irreducibility_test(df_clean, list(combo), result['wr'])
        if irred:
            candidates_2way.append({'combo': list(combo), 'order': 2, **result})

print(f"  Tested {tested_2:,} 2-way combinations | Candidates: {len(candidates_2way)}")

print("  Testing 3-way combinations...")
candidates_3way = []
tested_3 = 0
for combo in combinations(flag_names, 3):
    tested_3 += 1
    result = test_combination(df_clean, list(combo))
    if result:
        irred = irreducibility_test(df_clean, list(combo), result['wr'])
        if irred:
            candidates_3way.append({'combo': list(combo), 'order': 3, **result})

print(f"  Tested {tested_3:,} 3-way combinations | Candidates: {len(candidates_3way)}")

print("  Testing 4-way combinations (top features only)...")
# For 4-way, only use top features to keep computation tractable
top_flags = [f for f in flag_names if any(k in f for k in ['rel_txn', 'ov_range', 'ov_bull', 'ov_bear', 
                                                              'adx', 'ema_bull', 'ema_bear', 'am_session',
                                                              'dayrange', 'volcomp'])]
candidates_4way = []
tested_4 = 0
for combo in combinations(top_flags, 4):
    tested_4 += 1
    result = test_combination(df_clean, list(combo))
    if result:
        irred = irreducibility_test(df_clean, list(combo), result['wr'])
        if irred:
            candidates_4way.append({'combo': list(combo), 'order': 4, **result})

print(f"  Tested {tested_4:,} 4-way combinations | Candidates: {len(candidates_4way)}")

# ─── Combine and rank all candidates ──────────────────────────────────────────
all_candidates = candidates_2way + candidates_3way + candidates_4way
all_candidates.sort(key=lambda x: x['wr'], reverse=True)

# Exclude ML-001 supersets
def is_ml001_superset(combo):
    ml001_flags = {'rel_txn_p75', 'rel_txn_p85', 'ov_range_p75', 'ov_range_p85', 'ov_bull'}
    return len(set(combo) & ml001_flags) >= 3

filtered_candidates = [c for c in all_candidates if not is_ml001_superset(c['combo'])]

print(f"\n  Total candidates: {len(all_candidates)}")
print(f"  After ML-001 superset filter: {len(filtered_candidates)}")
print(f"\n  Top 20 candidates:")
print(f"  {'Combo':<60} {'N':>5} {'Act%':>5} {'WR':>6} {'PF':>6}")
print("  " + "-"*90)
for c in filtered_candidates[:20]:
    combo_str = ' × '.join(c['combo'])[:58]
    print(f"  {combo_str:<60} {c['n']:>5} {c['act_rate']*100:>4.1f}% {c['wr']:>5.1f}% {c['pf']:>6.3f}")

# Save results
with open(f'{OUTPUT_DIR}/systematic_search_results.json', 'w') as f:
    json.dump({'candidates': filtered_candidates[:50], 'stats': {
        'tested_2way': tested_2, 'tested_3way': tested_3, 'tested_4way': tested_4,
        'candidates_2way': len(candidates_2way), 'candidates_3way': len(candidates_3way),
        'candidates_4way': len(candidates_4way), 'total_filtered': len(filtered_candidates)
    }}, f, indent=2, default=str)
print(f"\nSaved: {OUTPUT_DIR}/systematic_search_results.json")
print("=== SYSTEMATIC SEARCH COMPLETE ===")
