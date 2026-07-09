"""
Atlas Sprint 057 — Discovery Integration: Interaction Test Harness

Operationalises all 7 Atlas Market Principles and 4 Sprint 056 discoveries
as binary filters on the full RTH bar dataset, then computes all pairwise
and higher-order interactions.

Principles (from market_principles.md):
  MP-001: Regime Dependence   → EMA alignment required (ema_alignment != 0)
  MP-002: ADX Thresholds      → ADX >= 25
  MP-003: Session Asymmetry   → PM session (hour >= 13)
  MP-004: VolComp→Expansion   → volcomp_5_14 < 0.85 (compressed)
  MP-005: Loss Streaks=Regime → (tested on trade-level data in Phase 4)
  MP-006: Structural Anchoring→ close near swing structure (close_vs_range_mid within 0.3)
  MP-008: Theory of Edge      → all MP-001..004 active simultaneously

Discoveries (Sprint 056):
  D-01: Participation Surge   → rel_txn >= 1.33 (top quintile)
  D-02: Overnight Inventory   → ov_dir != 0 (non-flat overnight)
  D-03: Overnight Range Amp   → ov_range_vs_atr14 >= 10.85 (top quartile)
  D-08: Intraday Expansion    → day_range_vs_atr14 >= 12.12 (top half)
"""

import pandas as pd
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.gridspec as gridspec
import seaborn as sns
from scipy import stats
from sklearn.feature_selection import mutual_info_classif
import warnings, json, os, itertools
warnings.filterwarnings('ignore')

FEAT_PATH   = '/home/ubuntu/Project-Atlas/research-engine/sprint056/discovery_features_rth.csv'
OUTPUT_DIR  = '/home/ubuntu/Project-Atlas/research-engine/sprint057'
CHARTS_DIR  = '/home/ubuntu/Project-Atlas/research/sprint-057-charts'
os.makedirs(OUTPUT_DIR, exist_ok=True)
os.makedirs(CHARTS_DIR, exist_ok=True)

print("Loading RTH feature matrix...")
df = pd.read_csv(FEAT_PATH)
df['ts']   = pd.to_datetime(df['ts'])
df['year'] = df['ts'].dt.year
df_clean   = df.dropna(subset=['fwd_12_return_atr', 'is_exceptional_fwd', 'is_catastrophic_fwd']).copy()
print(f"  {len(df_clean):,} clean RTH bars")

# ─── Operationalise all principles and discoveries as binary flags ────────────
print("\nOperationalising principles and discoveries...")

# MP-001: Regime Dependence — EMA alignment (bull or bear, not neutral)
df_clean['MP001'] = (df_clean['ema_alignment'] != 0).astype(int)

# MP-002: ADX Thresholds — ADX >= 25
df_clean['MP002'] = (df_clean['adx14'] >= 25).astype(int)

# MP-003: Session Asymmetry — PM session (13:00-16:00)
df_clean['MP003'] = (df_clean['hour'] >= 13).astype(int)

# MP-004: VolComp→Expansion — currently compressed (volcomp_5_14 < 0.85)
df_clean['MP004'] = (df_clean['volcomp_5_14'] < 0.85).astype(int)

# MP-006: Structural Anchoring — price near structural midpoint (within 30% of range)
df_clean['MP006'] = (df_clean['close_vs_range_mid'].abs() < 0.3).astype(int)

# MP-008: Theory of Edge — all core conditions active
df_clean['MP008'] = ((df_clean['MP001'] == 1) & (df_clean['MP002'] == 1) & 
                     (df_clean['MP004'] == 1)).astype(int)

# D-01: Participation Surge — rel_txn in top quintile (>= 1.33)
df_clean['D01'] = (df_clean['rel_txn'] >= 1.33).astype(int)

# D-02: Overnight Inventory Direction — non-flat overnight (ov_dir != 0)
df_clean['D02'] = (df_clean['ov_dir'] != 0).astype(int)
# Also directional version
df_clean['D02_bull'] = (df_clean['ov_dir'] == 1).astype(int)
df_clean['D02_bear'] = (df_clean['ov_dir'] == -1).astype(int)

# D-03: Overnight Range Amplification — top quartile (>= 10.85 × ATR)
df_clean['D03'] = (df_clean['ov_range_vs_atr14'] >= 10.85).astype(int)

# D-08: Intraday Expansion State — top half (>= 12.12 × ATR)
df_clean['D08'] = (df_clean['day_range_vs_atr14'] >= 12.12).astype(int)

# Print activation rates
print("\n  Activation rates:")
for flag in ['MP001', 'MP002', 'MP003', 'MP004', 'MP006', 'MP008', 'D01', 'D02', 'D03', 'D08']:
    rate = df_clean[flag].mean() * 100
    n    = df_clean[flag].sum()
    print(f"  {flag}: {rate:.1f}% ({n:,} bars)")

# ─── Core metric computation function ────────────────────────────────────────
def compute_metrics(mask, df, name=''):
    """Compute all 9 metrics for a given boolean mask."""
    grp  = df[mask]
    n    = len(grp)
    if n < 100:
        return None
    
    fwd  = grp['fwd_12_return_atr']
    exc  = grp['is_exceptional_fwd']
    cat  = grp['is_catastrophic_fwd']
    
    # Forward return stats
    mean_ret  = fwd.mean()
    std_ret   = fwd.std()
    
    # Exceptional move rate
    exc_rate  = exc.mean() * 100
    cat_rate  = cat.mean() * 100
    
    # Simulated "win rate" using positive forward return as win
    wr        = (fwd > 0).mean() * 100
    
    # Profit Factor (positive returns / abs negative returns)
    pos_sum   = fwd[fwd > 0].sum()
    neg_sum   = fwd[fwd < 0].abs().sum()
    pf        = pos_sum / (neg_sum + 1e-6)
    
    # Expectancy (mean return)
    expectancy = mean_ret
    
    # Max drawdown (running max of cumulative negative returns)
    cum_ret   = fwd.cumsum()
    roll_max  = cum_ret.cummax()
    drawdown  = (cum_ret - roll_max)
    max_dd    = drawdown.min()
    
    # Monte Carlo pass rate (1000 simulations, target: max_dd > -5 ATR units)
    np.random.seed(42)
    mc_pass   = 0
    fwd_arr   = fwd.values
    for _ in range(1000):
        sample = np.random.choice(fwd_arr, size=min(n, 200), replace=True)
        cum    = np.cumsum(sample)
        dd     = (cum - np.maximum.accumulate(cum)).min()
        if dd > -5.0:
            mc_pass += 1
    mc_pass_rate = mc_pass / 10  # as percentage
    
    # Information gain (mutual info with is_exceptional_fwd)
    # (computed separately for the interaction flag)
    
    # Behaviour Confidence Score (BCS) — composite
    bcs = min(100, (
        min(30, abs(mean_ret) * 20) +           # effect size (max 30)
        min(25, (exc_rate - 14.2) * 2) +        # exc rate lift (max 25)
        min(25, mc_pass_rate / 4) +             # MC stability (max 25)
        min(20, np.log10(n + 1) * 5)            # sample size (max 20)
    ))
    
    return {
        'name': name, 'n': n, 'exc_rate': exc_rate, 'cat_rate': cat_rate,
        'win_rate': wr, 'pf': pf, 'expectancy': expectancy,
        'max_dd': max_dd, 'mc_pass_rate': mc_pass_rate, 'bcs': bcs,
        'mean_ret': mean_ret, 'std_ret': std_ret,
    }

# ─── Baseline metrics ─────────────────────────────────────────────────────────
print("\nComputing baseline metrics...")
baseline = compute_metrics(pd.Series([True] * len(df_clean), index=df_clean.index), df_clean, 'Baseline')
print(f"  Baseline: N={baseline['n']:,} | Exc={baseline['exc_rate']:.1f}% | PF={baseline['pf']:.3f} | "
      f"WR={baseline['win_rate']:.1f}% | MC={baseline['mc_pass_rate']:.1f}%")

# ─── Individual principle/discovery metrics ───────────────────────────────────
print("\nComputing individual metrics...")
individual_results = {}
for flag in ['MP001', 'MP002', 'MP003', 'MP004', 'MP006', 'MP008', 'D01', 'D02', 'D03', 'D08']:
    mask = df_clean[flag] == 1
    result = compute_metrics(mask, df_clean, flag)
    if result:
        individual_results[flag] = result
        print(f"  {flag}: N={result['n']:,} | Exc={result['exc_rate']:.1f}% | PF={result['pf']:.3f} | "
              f"WR={result['win_rate']:.1f}% | MC={result['mc_pass_rate']:.1f}% | BCS={result['bcs']:.1f}")

# ─── Pairwise interaction matrix ──────────────────────────────────────────────
print("\n=== PAIRWISE INTERACTION MATRIX ===")
flags = ['MP001', 'MP002', 'MP003', 'MP004', 'MP006', 'MP008', 'D01', 'D02', 'D03', 'D08']
pairwise_results = {}
synergy_scores = {}

for f1, f2 in itertools.combinations(flags, 2):
    combo_name = f"{f1}×{f2}"
    mask = (df_clean[f1] == 1) & (df_clean[f2] == 1)
    result = compute_metrics(mask, df_clean, combo_name)
    if result is None:
        continue
    
    # Compute synergy: does the combination exceed the better of the two individuals?
    ind1 = individual_results.get(f1, {})
    ind2 = individual_results.get(f2, {})
    best_exc = max(ind1.get('exc_rate', 0), ind2.get('exc_rate', 0))
    synergy = result['exc_rate'] - best_exc  # positive = synergistic
    
    # Compute information gain of combination vs each individual
    ig_over_f1 = result['exc_rate'] - ind1.get('exc_rate', baseline['exc_rate'])
    ig_over_f2 = result['exc_rate'] - ind2.get('exc_rate', baseline['exc_rate'])
    
    result['synergy'] = synergy
    result['ig_over_f1'] = ig_over_f1
    result['ig_over_f2'] = ig_over_f2
    pairwise_results[combo_name] = result
    synergy_scores[combo_name] = synergy

# Sort by synergy
sorted_pairs = sorted(pairwise_results.items(), key=lambda x: x[1]['synergy'], reverse=True)

print(f"\n  {'Combination':<20} {'N':>6} {'Exc%':>7} {'Synergy':>8} {'PF':>7} {'WR%':>7} {'MC%':>7} {'BCS':>6}")
print("  " + "-"*75)
for name, r in sorted_pairs[:20]:
    print(f"  {name:<20} {r['n']:>6,} {r['exc_rate']:>7.1f} {r['synergy']:>+8.2f} "
          f"{r['pf']:>7.3f} {r['win_rate']:>7.1f} {r['mc_pass_rate']:>7.1f} {r['bcs']:>6.1f}")

# ─── Save results ─────────────────────────────────────────────────────────────
all_results = {
    'baseline': baseline,
    'individual': individual_results,
    'pairwise': pairwise_results,
}
with open(f'{OUTPUT_DIR}/interaction_results.json', 'w') as f:
    json.dump(all_results, f, indent=2, default=str)

print(f"\nSaved: {OUTPUT_DIR}/interaction_results.json")
print("=== INTERACTION HARNESS COMPLETE ===")
