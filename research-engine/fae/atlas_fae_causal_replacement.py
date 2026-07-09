"""
Atlas Sprint 052 — Failure Mechanism Discovery
Phase 5: Causal Replacement Test

For each failure signature, test whether replacing the proxy variable
with the best causal candidate:
  1. Preserves the PF improvement
  2. Reduces unnecessary trade filtering (fewer trades removed)
  3. Maintains cross-year stability

Also tests combined (proxy + causal) filters to see if the causal
variable adds independent information beyond the proxy.

Key question: can we get the same improvement while removing fewer trades?
"""

import pandas as pd
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import warnings
import os
warnings.filterwarnings('ignore')

DATA_FILE  = '/home/ubuntu/Project-Atlas/research-engine/fae/fae_causal.csv'
OUTPUT_DIR = '/home/ubuntu/Project-Atlas/research/sprint-052-charts'
os.makedirs(OUTPUT_DIR, exist_ok=True)

df = pd.read_csv(DATA_FILE)
print(f"Loaded {len(df)} trades")

# ─── Utility functions ────────────────────────────────────────────────────────
def pf(d):
    pnl = d['net_pnl'].values
    w = pnl[pnl>0]; l = pnl[pnl<0]
    return w.sum()/abs(l.sum()) if len(l)>0 and abs(l.sum())>0 else 0

def wr(d):
    return (d['net_pnl']>0).mean() if len(d)>0 else 0

def max_dd(d):
    eq = np.cumsum(d['net_pnl'].values)
    pk = np.maximum.accumulate(eq)
    return (eq-pk).min()

def mc_pass(pnl, dd_limit, n=1000, seed=42):
    np.random.seed(seed)
    passes = 0
    for _ in range(n):
        sh = np.random.permutation(pnl)
        eq = np.cumsum(sh)
        pk = np.maximum.accumulate(eq)
        if (eq-pk).min() > dd_limit:
            passes += 1
    return passes / n

def cross_year_stability(sub, good):
    yr_pass = 0; yr_tot = 0
    for yr in sorted(sub['year'].unique()):
        yr_sub = sub[sub['year']==yr]
        yr_good = good[good['year']==yr]
        if len(yr_sub)<5 or len(yr_good)<3: continue
        yr_tot += 1
        if pf(yr_good) > pf(yr_sub): yr_pass += 1
    return yr_pass, yr_tot

def test_filter(model, mask_fn, label, mc_dd=-5000):
    sub = df[df['model']==model].copy()
    bad_mask = mask_fn(sub)
    good = sub[~bad_mask]
    n_bad = bad_mask.sum()
    pct = n_bad / len(sub)
    pf_b = pf(sub); pf_f = pf(good)
    dd_b = max_dd(sub); dd_f = max_dd(good)
    mc = mc_pass(good['net_pnl'].values, mc_dd)
    yr_pass, yr_tot = cross_year_stability(sub, good)
    return {
        'label': label, 'model': model,
        'n_total': len(sub), 'n_filtered': n_bad, 'pct_removed': pct,
        'pf_base': pf_b, 'pf_filtered': pf_f, 'pf_delta': pf_f - pf_b,
        'wr_base': wr(sub), 'wr_filtered': wr(good),
        'dd_base': dd_b, 'dd_filtered': dd_f, 'dd_delta': dd_f - dd_b,
        'mc_pass': mc,
        'yr_pass': yr_pass, 'yr_total': yr_tot,
        'promoted': (pf_f > pf_b and dd_f > dd_b and pct < 0.35 and mc >= 0.70 and yr_pass >= max(2, yr_tot-1)),
    }

def print_result(r):
    verdict = 'PROMOTED' if r['promoted'] else 'REJECTED'
    print(f"  [{verdict}] {r['label']}")
    print(f"    N removed: {r['n_filtered']}/{r['n_total']} ({r['pct_removed']:.0%})")
    print(f"    PF: {r['pf_base']:.3f} → {r['pf_filtered']:.3f} ({r['pf_delta']:+.3f})")
    print(f"    WR: {r['wr_base']:.1%} → {r['wr_filtered']:.1%}")
    print(f"    DD: ${r['dd_base']:.0f} → ${r['dd_filtered']:.0f} ({r['dd_delta']:+.0f})")
    print(f"    MC: {r['mc_pass']:.0%} | Yr: {r['yr_pass']}/{r['yr_total']}")

# ═══════════════════════════════════════════════════════════════════════════════
# FS-A3-01: ADX < 30 — CAUSAL REPLACEMENT TEST
# ═══════════════════════════════════════════════════════════════════════════════
print("\n" + "="*70)
print("FS-A3-01: ADX<30 — CAUSAL REPLACEMENT TEST")
print("="*70)
print("\nFinding: ADX is not strongly mediated by any single candidate.")
print("ADX appears to be a direct measure of trend strength, not a proxy.")
print("Testing whether causal candidates can match ADX's performance...\n")

a3_tests = []

# Baseline: proxy only
r = test_filter('A3', lambda d: d['adx'] < 30, 'PROXY: ADX < 30', mc_dd=-5000)
a3_tests.append(r); print_result(r)

# Candidate 1: Trend maturity (best mediator, 11.6% attenuation)
# Hypothesis: ADX<30 is measuring "trend hasn't matured yet"
# Low trend maturity = EMA alignment is recent = trend not confirmed
r = test_filter('A3', lambda d: d['c_trend_maturity'] < 10, 'CAUSAL: Trend Maturity < 10 bars', mc_dd=-5000)
a3_tests.append(r); print_result(r)

r = test_filter('A3', lambda d: d['c_trend_maturity'] < 15, 'CAUSAL: Trend Maturity < 15 bars', mc_dd=-5000)
a3_tests.append(r); print_result(r)

r = test_filter('A3', lambda d: d['c_trend_maturity'] < 20, 'CAUSAL: Trend Maturity < 20 bars', mc_dd=-5000)
a3_tests.append(r); print_result(r)

# Candidate 2: Price vs EMA50 (7.4% attenuation)
# Hypothesis: ADX<30 is measuring "price hasn't extended enough from EMA50"
r = test_filter('A3', lambda d: np.abs(d['c_price_vs_ema50_atr']) < 0.5, 'CAUSAL: |Price-EMA50| < 0.5 ATR', mc_dd=-5000)
a3_tests.append(r); print_result(r)

r = test_filter('A3', lambda d: np.abs(d['c_price_vs_ema50_atr']) < 1.0, 'CAUSAL: |Price-EMA50| < 1.0 ATR', mc_dd=-5000)
a3_tests.append(r); print_result(r)

# Candidate 3: DI Spread (trend purity)
# Hypothesis: ADX<30 is measuring "directional disagreement between +DI and -DI"
r = test_filter('A3', lambda d: d['c_di_spread'] < 0.5, 'CAUSAL: DI Spread < 0.50 (impure trend)', mc_dd=-5000)
a3_tests.append(r); print_result(r)

r = test_filter('A3', lambda d: d['c_di_spread'] < 0.6, 'CAUSAL: DI Spread < 0.60', mc_dd=-5000)
a3_tests.append(r); print_result(r)

# Combined: ADX + DI Spread (most specific)
r = test_filter('A3', lambda d: (d['adx'] < 30) | (d['c_di_spread'] < 0.5), 'COMBINED: ADX<30 OR DI_Spread<0.5', mc_dd=-5000)
a3_tests.append(r); print_result(r)

# Combined: ADX + Trend Maturity
r = test_filter('A3', lambda d: (d['adx'] < 30) | (d['c_trend_maturity'] < 15), 'COMBINED: ADX<30 OR Maturity<15', mc_dd=-5000)
a3_tests.append(r); print_result(r)

# Refined proxy: tighter ADX threshold
r = test_filter('A3', lambda d: d['adx'] < 35, 'PROXY REFINED: ADX < 35', mc_dd=-5000)
a3_tests.append(r); print_result(r)

# ═══════════════════════════════════════════════════════════════════════════════
# FS-A3-02: EARLY HOUR — CAUSAL REPLACEMENT TEST
# ═══════════════════════════════════════════════════════════════════════════════
print("\n" + "="*70)
print("FS-A3-02: EARLY HOUR — CAUSAL REPLACEMENT TEST")
print("="*70)
print("\nFinding: Time is not strongly mediated by any candidate.")
print("Overnight momentum (d=+0.691) is the strongest candidate but only 19.6% attenuation.")
print("Testing whether overnight momentum can replace time...\n")

a3_time_tests = []

# Baseline: proxy only
r = test_filter('A3', lambda d: d['hour'] < 10, 'PROXY: Hour < 10', mc_dd=-5000)
a3_time_tests.append(r); print_result(r)

# Candidate 1: Overnight momentum (strongest mediator)
# Hypothesis: early hours fail because overnight momentum hasn't developed yet
# Wins have higher overnight momentum in the trade direction
r = test_filter('A3', lambda d: d['c_overnight_momentum_aligned'] == 0, 'CAUSAL: Overnight Momentum Not Aligned', mc_dd=-5000)
a3_time_tests.append(r); print_result(r)

# Candidate 2: Overnight range development
# Hypothesis: early hours fail because the overnight range is still developing
r = test_filter('A3', lambda d: d['c_overnight_range_atr'] < 1.0, 'CAUSAL: Overnight Range < 1.0 ATR', mc_dd=-5000)
a3_time_tests.append(r); print_result(r)

r = test_filter('A3', lambda d: d['c_overnight_range_atr'] < 1.5, 'CAUSAL: Overnight Range < 1.5 ATR', mc_dd=-5000)
a3_time_tests.append(r); print_result(r)

r = test_filter('A3', lambda d: d['c_overnight_range_atr'] < 2.0, 'CAUSAL: Overnight Range < 2.0 ATR', mc_dd=-5000)
a3_time_tests.append(r); print_result(r)

# Candidate 3: Overnight bars elapsed (session maturity)
r = test_filter('A3', lambda d: d['c_overnight_bars'] < 12, 'CAUSAL: Overnight Bars < 12 (first hour)', mc_dd=-5000)
a3_time_tests.append(r); print_result(r)

r = test_filter('A3', lambda d: d['c_overnight_bars'] < 24, 'CAUSAL: Overnight Bars < 24 (first 2 hrs)', mc_dd=-5000)
a3_time_tests.append(r); print_result(r)

# Combined: momentum + range
r = test_filter('A3', lambda d: (d['c_overnight_momentum_aligned'] == 0) | (d['c_overnight_range_atr'] < 1.5),
                'COMBINED: Not Aligned OR Range<1.5ATR', mc_dd=-5000)
a3_time_tests.append(r); print_result(r)

# Combined: range + bars
r = test_filter('A3', lambda d: (d['c_overnight_range_atr'] < 1.5) | (d['c_overnight_bars'] < 24),
                'COMBINED: Range<1.5ATR OR Bars<24', mc_dd=-5000)
a3_time_tests.append(r); print_result(r)

# ═══════════════════════════════════════════════════════════════════════════════
# FS-A2-01: ARI CAUTION — CAUSAL REPLACEMENT TEST
# ═══════════════════════════════════════════════════════════════════════════════
print("\n" + "="*70)
print("FS-A2-01: ARI CAUTION — CAUSAL REPLACEMENT TEST")
print("="*70)
print("\nFinding: Consecutive losses coincide with regime transitions.")
print("ATR expands 124% and EMA flips 64% at consec_losses=1.")
print("Testing whether regime change variables can replace the streak counter...\n")

a2_tests = []

# Baseline: proxy only
r = test_filter('A2', lambda d: d['ari_caution'] == 1, 'PROXY: ARI Caution (losses>=2)', mc_dd=-5000)
a2_tests.append(r); print_result(r)

# Candidate 1: EMA alignment flip (regime change)
# Hypothesis: consecutive losses occur because the regime flipped
r = test_filter('A2', lambda d: d['c_regime_ema_flip'] == 1, 'CAUSAL: EMA Regime Flip', mc_dd=-5000)
a2_tests.append(r); print_result(r)

# Candidate 2: ATR expansion (volatility shift)
# Hypothesis: consecutive losses occur because volatility expanded
r = test_filter('A2', lambda d: d['c_regime_atr_change'] > 0.5, 'CAUSAL: ATR Expanded >50%', mc_dd=-5000)
a2_tests.append(r); print_result(r)

r = test_filter('A2', lambda d: d['c_regime_atr_change'] > 0.3, 'CAUSAL: ATR Expanded >30%', mc_dd=-5000)
a2_tests.append(r); print_result(r)

# Candidate 3: Current ATR percentile (high vol regime)
r = test_filter('A2', lambda d: d['c_vol_regime_pct'] > 0.7, 'CAUSAL: ATR14 Pct > 70th (high vol)', mc_dd=-5000)
a2_tests.append(r); print_result(r)

r = test_filter('A2', lambda d: d['c_vol_regime_pct'] > 0.8, 'CAUSAL: ATR14 Pct > 80th (very high vol)', mc_dd=-5000)
a2_tests.append(r); print_result(r)

# Candidate 4: ATR acceleration at entry
r = test_filter('A2', lambda d: d['c_atr_accel_now'] > 1.3, 'CAUSAL: ATR Accelerating >30%', mc_dd=-5000)
a2_tests.append(r); print_result(r)

# Combined: EMA flip OR ATR expansion
r = test_filter('A2', lambda d: (d['c_regime_ema_flip'] == 1) | (d['c_regime_atr_change'] > 0.5),
                'COMBINED: EMA Flip OR ATR>50%', mc_dd=-5000)
a2_tests.append(r); print_result(r)

# Combined: EMA flip AND ATR expansion (more specific)
r = test_filter('A2', lambda d: (d['c_regime_ema_flip'] == 1) & (d['c_regime_atr_change'] > 0.3),
                'COMBINED: EMA Flip AND ATR>30%', mc_dd=-5000)
a2_tests.append(r); print_result(r)

# Combined: proxy + EMA flip (additive)
r = test_filter('A2', lambda d: (d['ari_caution'] == 1) | (d['c_regime_ema_flip'] == 1),
                'COMBINED: ARI Caution OR EMA Flip', mc_dd=-5000)
a2_tests.append(r); print_result(r)

# ═══════════════════════════════════════════════════════════════════════════════
# SUMMARY TABLE
# ═══════════════════════════════════════════════════════════════════════════════
print("\n" + "="*80)
print("CAUSAL REPLACEMENT SUMMARY")
print("="*80)

all_tests = [
    ('FS-A3-01', a3_tests),
    ('FS-A3-02', a3_time_tests),
    ('FS-A2-01', a2_tests),
]

for sig_id, tests in all_tests:
    print(f"\n{sig_id}:")
    print(f"  {'Label':<45} {'%Rem':>6} {'PF Δ':>7} {'DD Δ':>9} {'MC':>7} {'Yr':>6} {'Verdict':>10}")
    print("  " + "-"*95)
    for r in tests:
        verdict = 'PROMOTED' if r['promoted'] else 'REJECTED'
        print(f"  {r['label']:<45} {r['pct_removed']:>6.0%} {r['pf_delta']:>+7.3f} {r['dd_delta']:>+9.0f} {r['mc_pass']:>7.0%} {r['yr_pass']}/{r['yr_total']:>4} {verdict:>10}")

# ─── Best replacement per signature ───────────────────────────────────────────
print("\n" + "="*80)
print("BEST CAUSAL REPLACEMENT PER SIGNATURE")
print("="*80)

for sig_id, tests in all_tests:
    # Find best promoted (or best by PF delta if none promoted)
    promoted = [t for t in tests if t['promoted']]
    if promoted:
        best = max(promoted, key=lambda x: x['pf_delta'])
        status = "PROMOTED"
    else:
        best = max(tests, key=lambda x: x['pf_delta'])
        status = "BEST (not promoted)"

    proxy = tests[0]
    print(f"\n{sig_id}:")
    print(f"  Proxy:  {proxy['label']:<45} {proxy['pct_removed']:.0%} removed, PF Δ={proxy['pf_delta']:+.3f}")
    print(f"  Best:   {best['label']:<45} {best['pct_removed']:.0%} removed, PF Δ={best['pf_delta']:+.3f} [{status}]")
    if best['pct_removed'] < proxy['pct_removed']:
        saving = proxy['pct_removed'] - best['pct_removed']
        print(f"  Trade savings: {saving:.0%} fewer trades removed ({int(saving * best['n_total'])} trades recovered)")
    else:
        print(f"  No trade savings vs proxy (causal candidate removes same or more)")

# ─── Save results ─────────────────────────────────────────────────────────────
all_results_flat = []
for sig_id, tests in all_tests:
    for t in tests:
        t['signature'] = sig_id
        all_results_flat.append(t)

results_df = pd.DataFrame(all_results_flat)
results_df.to_csv('/home/ubuntu/Project-Atlas/research-engine/fae/fae_causal_replacement.csv', index=False)
print("\nResults saved to fae_causal_replacement.csv")

# ═══════════════════════════════════════════════════════════════════════════════
# VISUALISATION: Replacement comparison
# ═══════════════════════════════════════════════════════════════════════════════
print("\nGenerating visualisations...")

fig, axes = plt.subplots(1, 3, figsize=(21, 8))
fig.suptitle('Sprint 052 — Causal Replacement Test\n(Can causal candidates match proxy performance with fewer trade removals?)',
             fontsize=13, fontweight='bold')

for ax, (sig_id, tests) in zip(axes, all_tests):
    labels = [t['label'].replace('PROXY: ', '★ ').replace('CAUSAL: ', '').replace('COMBINED: ', '⊕ ').replace('PROXY REFINED: ', '▲ ')
              for t in tests]
    pf_deltas = [t['pf_delta'] for t in tests]
    pct_removed = [t['pct_removed'] for t in tests]
    promoted = [t['promoted'] for t in tests]

    # Colour by type
    colors = []
    for t in tests:
        if t['label'].startswith('PROXY'):
            colors.append('#1565C0')  # blue = proxy
        elif t['label'].startswith('COMBINED'):
            colors.append('#7B1FA2')  # purple = combined
        elif t['promoted']:
            colors.append('#2E7D32')  # dark green = promoted causal
        else:
            colors.append('#81C784')  # light green = rejected causal

    # Scatter: % removed vs PF delta
    sc = ax.scatter(pct_removed, pf_deltas, c=colors, s=100, alpha=0.85, zorder=5)

    # Annotate
    for i, (label, x, y, prom) in enumerate(zip(labels, pct_removed, pf_deltas, promoted)):
        short = label[:25] + '…' if len(label) > 25 else label
        ax.annotate(short, (x, y), textcoords='offset points', xytext=(5, 3),
                    fontsize=7, alpha=0.85)

    ax.axvline(0.35, color='red', linestyle='--', linewidth=1.5, alpha=0.7, label='35% removal limit')
    ax.axhline(0, color='black', linewidth=0.5)
    ax.set_xlabel('% Trades Removed', fontsize=10)
    ax.set_ylabel('PF Delta (filtered - baseline)', fontsize=10)
    ax.set_title(f'{sig_id}\nProxy vs Causal Candidates', fontsize=11, fontweight='bold')
    ax.legend(fontsize=8)
    ax.grid(True, alpha=0.3)

    # Add legend for colors
    from matplotlib.patches import Patch
    legend_elements = [
        Patch(facecolor='#1565C0', label='Proxy'),
        Patch(facecolor='#2E7D32', label='Causal (promoted)'),
        Patch(facecolor='#81C784', label='Causal (rejected)'),
        Patch(facecolor='#7B1FA2', label='Combined'),
    ]
    ax.legend(handles=legend_elements, fontsize=8, loc='upper right')

plt.tight_layout()
plt.savefig(os.path.join(OUTPUT_DIR, 'fae_causal_replacement.png'), dpi=150, bbox_inches='tight')
plt.close()
print("  Saved: fae_causal_replacement.png")

print("\n=== CAUSAL REPLACEMENT TEST COMPLETE ===")
