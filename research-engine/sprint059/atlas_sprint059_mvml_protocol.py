"""
Atlas Sprint 059 — MVML Discovery Protocol

Phase 1: Formalise ML-001 and define the systematic search protocol.

Terminology note (per Sprint 059 directive):
  - "Minimum Viable Combination" (MVC) = the internal research term for an irreducible
    behavioural structure observed within the Atlas MNQ dataset.
  - "Candidate Market Law" = aspirational label applied only after cross-instrument
    and cross-period replication.
  - The term "Market Law" is used as a long-term vision, not a current scientific claim.

ML-001 Formalisation:
  Components: D-01 (rel_txn >= 1.33), D-03 (ov_range_vs_atr14 >= 10.85), D-02_bull (ov_dir == 1)
  Behaviour: Bullish directional momentum in the AM session
  Evidence: Sprint 058 — Z=10.45, p=0.000000, OOS PF=2.903, 100% MC pass rate
"""

import pandas as pd
import numpy as np
import json, os

FEAT_PATH  = '/home/ubuntu/Project-Atlas/research-engine/sprint056/discovery_features_rth.csv'
OUTPUT_DIR = '/home/ubuntu/Project-Atlas/research-engine/sprint059'
os.makedirs(OUTPUT_DIR, exist_ok=True)

print("Loading RTH feature matrix...")
df = pd.read_csv(FEAT_PATH)
df['ts']    = pd.to_datetime(df['ts'])
df_clean    = df.dropna(subset=['fwd_12_return_atr', 'is_exceptional_fwd']).copy()
print(f"  {len(df_clean):,} clean RTH bars | {df_clean['ts'].min().date()} to {df_clean['ts'].max().date()}")

# ─── ML-001 Formalisation ─────────────────────────────────────────────────────
print("\n=== ML-001 FORMALISATION ===")
ml001 = {
    'id': 'ML-001',
    'name': 'Participation-Amplified Directional Momentum',
    'status': 'Candidate MVC (single-instrument, single-period)',
    'components': {
        'D-01': {'variable': 'rel_txn', 'operator': '>=', 'threshold': 1.33,
                 'description': 'Relative transaction rate >= 1.33x 20-bar mean'},
        'D-03': {'variable': 'ov_range_vs_atr14', 'operator': '>=', 'threshold': 10.85,
                 'description': 'Overnight range >= 10.85x ATR14 (large overnight range)'},
        'D-02_bull': {'variable': 'ov_dir', 'operator': '==', 'threshold': 1,
                      'description': 'Overnight session direction is bullish'},
    },
    'behaviour': 'When institutional participation surges (D-01) during a session where the overnight range was large (D-03) and directionally bullish (D-02_bull), the probability of a sustained AM directional move is significantly elevated.',
    'economic_mechanism': 'Large bullish overnight ranges indicate institutional positioning. When the subsequent AM session opens with elevated participation (order fragmentation), it signals institutional continuation rather than reversal. The three conditions together identify the rare confluence of institutional intent + institutional execution + market structure alignment.',
    'irreducibility_evidence': {
        'remove_D01': 'PF drops from 2.536 to 1.876 (D03×D02 only)',
        'remove_D03': 'PF drops from 2.536 to 1.613 (D01×D02 only)',
        'remove_D02': 'PF drops from 2.536 to 0.939 (D01×D03 only — below 1.0)',
        'permutation_z': 10.45,
        'permutation_p': 0.000000,
    },
    'validation_scores': {
        'oos_pf': 2.903, 'is_pf': 2.406, 'mc_pass_rate': 100.0,
        'wf_windows_above_55pct': '11/12', 'rolling_windows_above_55pct': '29/29',
        'year_stability': {'2024': 65.3, '2025': 65.8, '2026': 64.5},
    },
    'replication_required': ['NQ (same underlying)', 'ES (different underlying)', 'additional time periods'],
    'promotion_criteria_met': True,
    'notes': 'Terminology: This is a Candidate MVC within the Atlas MNQ research framework. The label "Market Law" is aspirational and requires cross-instrument replication before it can be claimed.',
}

# Verify ML-001 metrics
df_clean['D01']      = (df_clean['rel_txn'] >= 1.33).astype(int)
df_clean['D03']      = (df_clean['ov_range_vs_atr14'] >= 10.85).astype(int)
df_clean['D02_bull'] = (df_clean['ov_dir'] == 1).astype(int)
apex = (df_clean['D01']==1) & (df_clean['D03']==1) & (df_clean['D02_bull']==1)
fwd  = df_clean.loc[apex, 'fwd_12_return_atr']
wr   = (fwd > 0).mean() * 100
pf   = fwd[fwd>0].sum() / (fwd[fwd<0].abs().sum() + 1e-6)
print(f"  ML-001 verified: N={apex.sum():,} | WR={wr:.1f}% | PF={pf:.3f}")
ml001['verified_metrics'] = {'n': int(apex.sum()), 'wr': float(wr), 'pf': float(pf)}

# ─── MVML Discovery Protocol ──────────────────────────────────────────────────
print("\n=== MVML DISCOVERY PROTOCOL ===")
protocol = {
    'name': 'Atlas MVML Discovery Protocol v1.0',
    'terminology': {
        'MVC': 'Minimum Viable Combination — an irreducible behavioural structure observed in the Atlas MNQ dataset',
        'Candidate_Market_Law': 'A MVC that has survived all internal validation tests and is being tracked for cross-instrument replication',
        'Market_Law': 'Aspirational label — requires replication across multiple instruments and independent time periods',
    },
    'acceptance_criteria': {
        'win_rate': '>= 60% (vs 52.3% baseline)',
        'profit_factor': '>= 1.8',
        'oos_pf': '>= 1.5 (must not degrade OOS)',
        'mc_pass_rate': '>= 90%',
        'wf_windows': '>= 8/12 above 55% WR',
        'permutation_p': '< 0.001',
        'permutation_z': '>= 5.0',
        'irreducibility': 'Removing any component must reduce WR by >= 5pp or PF below 1.5',
        'simplicity': 'No simpler formulation achieves equivalent performance',
        'economic_mechanism': 'Must have a plausible institutional or structural explanation',
    },
    'rejection_criteria': [
        'Can be simplified to fewer variables without performance loss',
        'Duplicates an existing MVC',
        'Relies on proxy variables (fails causal independence test)',
        'Fails OOS validation (PF degrades by > 30%)',
        'Permutation Z-score < 5.0',
        'MC pass rate < 90%',
        'No plausible economic mechanism',
    ],
    'search_strategy': {
        'feature_space': '88 features from Sprint 056 feature matrix',
        'combination_orders': [2, 3, 4],
        'pre_filter': 'Activation rate 2-15% of RTH bars (to ensure adequate N)',
        'initial_screen': 'WR >= 60% and N >= 200 bars',
        'full_validation': 'Applied to all candidates passing initial screen',
    }
}

print(f"  Protocol defined: {len(protocol['acceptance_criteria'])} acceptance criteria")
print(f"  Rejection criteria: {len(protocol['rejection_criteria'])}")
print(f"  Feature space: {protocol['search_strategy']['feature_space']}")

# ─── Feature Space Inventory ──────────────────────────────────────────────────
print("\n=== FEATURE SPACE INVENTORY ===")
# Categorise all available features for the systematic search
feature_categories = {
    'Participation': ['rel_txn', 'rel_vol_20', 'rel_dollar_vol'],
    'Overnight': ['ov_dir', 'ov_range_vs_atr14', 'ov_return', 'ov_high_vs_prev_close', 'ov_low_vs_prev_close'],
    'Trend': ['ema_alignment', 'adx14', 'adx_slope', 'ema_spread_pct'],
    'Volatility': ['volcomp_5_14', 'atr14', 'bar_range', 'day_range_vs_atr14'],
    'Session': ['hour', 'minute', 'dow', 'mins_since_open'],
    'Price_Structure': ['close_vs_ema20', 'close_vs_ema50', 'day_high_pct', 'day_low_pct'],
    'Momentum': ['bar_dir', 'bar_body', 'bar_body_pct', 'prev_bar_dir'],
}

available_features = []
for cat, feats in feature_categories.items():
    for f in feats:
        if f in df_clean.columns:
            available_features.append({'feature': f, 'category': cat})
            
print(f"  Available features for search: {len(available_features)}")
for cat in feature_categories:
    cat_feats = [f['feature'] for f in available_features if f['category'] == cat]
    print(f"  {cat}: {cat_feats}")

# Save protocol and ML-001 formalisation
output = {
    'protocol': protocol,
    'ml001': ml001,
    'available_features': available_features,
}
with open(f'{OUTPUT_DIR}/mvml_protocol.json', 'w') as f:
    json.dump(output, f, indent=2, default=str)
print(f"\nSaved: {OUTPUT_DIR}/mvml_protocol.json")
print("=== PHASE 1 COMPLETE ===")
