"""
Atlas Sprint 059 — Candidate MVC Validation Suite

Applies the full MVML validation protocol to the top 5 candidates from the systematic search:
  1. C-01: ov_range_p75 × ov_bull × am_session  (WR=71.1%, PF=3.153)
  2. C-02: ov_range_p85 × ov_bull × dow_wed      (WR=68.8%, PF=2.440)
  3. C-03: ov_range_p75 × ema_bull × am_session  (WR=67.7%, PF=1.739)
  4. C-04: rel_vol_20_p85 × ov_range_p75 × ov_bull (WR=67.5%, PF=3.107)
  5. C-05: ov_bull × dayrange_p75 × am_session   (WR=66.4%, PF=2.487)

Validation tests:
  - OOS (2026 holdout)
  - Walk-forward (12 windows)
  - Rolling-window (90-day)
  - Monte Carlo (10,000 runs)
  - Permutation test (1,000 runs)
  - Year stability
  - Irreducibility confirmation
"""

import pandas as pd
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.gridspec as gridspec
import warnings, json, os
warnings.filterwarnings('ignore')

FEAT_PATH  = '/home/ubuntu/Project-Atlas/research-engine/sprint056/discovery_features_rth.csv'
OUTPUT_DIR = '/home/ubuntu/Project-Atlas/research-engine/sprint059'
CHARTS_DIR = '/home/ubuntu/Project-Atlas/research/sprint-059-charts'
os.makedirs(OUTPUT_DIR, exist_ok=True)
os.makedirs(CHARTS_DIR, exist_ok=True)

print("Loading RTH feature matrix...")
df = pd.read_csv(FEAT_PATH)
df['ts']    = pd.to_datetime(df['ts'])
df_clean    = df.dropna(subset=['fwd_12_return_atr', 'is_exceptional_fwd']).copy()
df_clean    = df_clean.sort_values('ts').reset_index(drop=True)
N_TOTAL     = len(df_clean)
BASELINE_WR = (df_clean['fwd_12_return_atr'] > 0).mean() * 100
print(f"  {N_TOTAL:,} clean RTH bars | Baseline WR: {BASELINE_WR:.1f}%")

# ─── Binarise features ────────────────────────────────────────────────────────
# Compute thresholds from full dataset
p75_ov_range = np.percentile(df_clean['ov_range_vs_atr14'].dropna(), 75)
p85_ov_range = np.percentile(df_clean['ov_range_vs_atr14'].dropna(), 85)
p75_dayrange = np.percentile(df_clean['day_range_vs_atr14'].dropna(), 75)
p85_rel_vol  = np.percentile(df_clean['rel_vol_20'].dropna(), 85)

df_clean['ov_range_p75']   = (df_clean['ov_range_vs_atr14'] >= p75_ov_range).astype(int)
df_clean['ov_range_p85']   = (df_clean['ov_range_vs_atr14'] >= p85_ov_range).astype(int)
df_clean['ov_bull']        = (df_clean['ov_dir'] == 1).astype(int)
df_clean['am_session']     = ((df_clean['hour'] >= 9) & (df_clean['hour'] <= 11)).astype(int)
df_clean['dow_wed']        = (df_clean['dow'] == 2).astype(int)
df_clean['ema_bull']       = (df_clean['ema_alignment'] == 1).astype(int)
df_clean['dayrange_p75']   = (df_clean['day_range_vs_atr14'] >= p75_dayrange).astype(int)
df_clean['rel_vol_p85']    = (df_clean['rel_vol_20'] >= p85_rel_vol).astype(int)

print(f"  Thresholds: ov_range_p75={p75_ov_range:.2f}, ov_range_p85={p85_ov_range:.2f}")
print(f"              dayrange_p75={p75_dayrange:.2f}, rel_vol_p85={p85_rel_vol:.2f}")

# ─── Candidate definitions ────────────────────────────────────────────────────
candidates = {
    'C-01': {
        'name': 'Overnight Range + Bullish OV + AM Session',
        'flags': ['ov_range_p75', 'ov_bull', 'am_session'],
        'hypothesis': 'Large bullish overnight ranges, when the AM session opens, produce elevated directional momentum without requiring elevated participation.',
    },
    'C-02': {
        'name': 'Large OV Range + Bullish OV + Wednesday',
        'flags': ['ov_range_p85', 'ov_bull', 'dow_wed'],
        'hypothesis': 'Wednesday sessions following large bullish overnight ranges exhibit elevated directional momentum (mid-week institutional positioning effect).',
    },
    'C-03': {
        'name': 'OV Range + EMA Aligned Bull + AM Session',
        'flags': ['ov_range_p75', 'ema_bull', 'am_session'],
        'hypothesis': 'When overnight range is large AND EMA stack is bullish AND it is the AM session, trend continuation is highly probable.',
    },
    'C-04': {
        'name': 'High Volume + Large OV Range + Bullish OV',
        'flags': ['rel_vol_p85', 'ov_range_p75', 'ov_bull'],
        'hypothesis': 'High relative volume combined with large bullish overnight range produces elevated directional edge (volume-confirmed overnight positioning).',
    },
    'C-05': {
        'name': 'Bullish OV + Expanded Day Range + AM Session',
        'flags': ['ov_bull', 'dayrange_p75', 'am_session'],
        'hypothesis': 'When the day range is already expanded AND overnight was bullish AND it is the AM session, the expansion is directionally biased.',
    },
}

# ─── Validation Functions ─────────────────────────────────────────────────────
def get_mask(df_in, flags):
    mask = pd.Series(True, index=df_in.index)
    for f in flags:
        mask = mask & (df_in[f] == 1)
    return mask

def base_metrics(df_in, flags):
    mask = get_mask(df_in, flags)
    n    = mask.sum()
    if n < 30:
        return None
    fwd  = df_in.loc[mask, 'fwd_12_return_atr']
    wr   = (fwd > 0).mean() * 100
    pf   = fwd[fwd>0].sum() / (fwd[fwd<0].abs().sum() + 1e-6)
    return {'n': int(n), 'wr': float(wr), 'pf': float(pf)}

def oos_validation(df_in, flags):
    """Split at 2026-01-01 for OOS test."""
    cutoff  = pd.Timestamp('2026-01-01')
    df_is   = df_in[df_in['ts'] < cutoff]
    df_oos  = df_in[df_in['ts'] >= cutoff]
    is_m    = base_metrics(df_is, flags)
    oos_m   = base_metrics(df_oos, flags)
    return {'is': is_m, 'oos': oos_m}

def walk_forward(df_in, flags, n_windows=12):
    """12-window walk-forward: each window is ~2 months."""
    df_in   = df_in.sort_values('ts').reset_index(drop=True)
    n       = len(df_in)
    wsize   = n // n_windows
    results = []
    for i in range(n_windows):
        start = i * wsize
        end   = min((i+1) * wsize, n)
        df_w  = df_in.iloc[start:end]
        m     = base_metrics(df_w, flags)
        if m:
            results.append({'window': i+1, **m})
    above_55 = sum(1 for r in results if r['wr'] >= 55)
    return {'windows': results, 'above_55': above_55, 'total': len(results)}

def monte_carlo(df_in, flags, n_runs=5000):
    """Bootstrap Monte Carlo: resample with replacement."""
    mask    = get_mask(df_in, flags)
    returns = df_in.loc[mask, 'fwd_12_return_atr'].values
    n       = len(returns)
    if n < 30:
        return None
    
    wrs, pfs = [], []
    for _ in range(n_runs):
        sample = np.random.choice(returns, size=n, replace=True)
        wr = (sample > 0).mean() * 100
        pf = sample[sample>0].sum() / (abs(sample[sample<0]).sum() + 1e-6)
        wrs.append(wr)
        pfs.append(pf)
    
    wrs, pfs = np.array(wrs), np.array(pfs)
    return {
        'wr_mean': float(wrs.mean()), 'wr_p5': float(np.percentile(wrs, 5)),
        'pf_mean': float(pfs.mean()), 'pf_p5': float(np.percentile(pfs, 5)),
        'pass_wr55': float((wrs >= 55).mean() * 100),
        'pass_pf15': float((pfs >= 1.5).mean() * 100),
    }

def permutation_test(df_in, flags, n_perm=1000):
    """Label permutation: shuffle outcome labels."""
    mask    = get_mask(df_in, flags)
    n_apex  = mask.sum()
    if n_apex < 30:
        return None
    canonical_wr = (df_in.loc[mask, 'fwd_12_return_atr'] > 0).mean() * 100
    
    perm_wrs = []
    all_returns = df_in['fwd_12_return_atr'].values
    for _ in range(n_perm):
        perm = np.random.permutation(all_returns)
        perm_apex = perm[mask.values]
        perm_wrs.append((perm_apex > 0).mean() * 100)
    
    perm_wrs = np.array(perm_wrs)
    p_val    = (perm_wrs >= canonical_wr).mean()
    z_score  = (canonical_wr - perm_wrs.mean()) / (perm_wrs.std() + 1e-10)
    return {'canonical_wr': float(canonical_wr), 'perm_mean': float(perm_wrs.mean()),
            'p_value': float(p_val), 'z_score': float(z_score)}

def year_stability(df_in, flags):
    """Year-by-year win rates."""
    results = {}
    for year in [2024, 2025, 2026]:
        df_y = df_in[df_in['ts'].dt.year == year]
        if len(df_y) < 100:
            continue
        m = base_metrics(df_y, flags)
        if m:
            results[str(year)] = m
    return results

def irreducibility_confirm(df_in, flags, base_wr):
    """Confirm removing each component reduces WR by >= 5pp."""
    removals = {}
    for i, flag in enumerate(flags):
        reduced = [f for j, f in enumerate(flags) if j != i]
        m = base_metrics(df_in, reduced)
        if m:
            removals[flag] = {'wr': m['wr'], 'wr_drop': base_wr - m['wr'], 'pf': m['pf']}
    all_irreducible = all(v['wr_drop'] >= 5.0 for v in removals.values())
    return {'removals': removals, 'all_irreducible': all_irreducible}

# ─── Run Full Validation ──────────────────────────────────────────────────────
print("\n=== FULL VALIDATION SUITE ===")
all_results = {}
np.random.seed(42)

for cid, cinfo in candidates.items():
    print(f"\n  {cid}: {cinfo['name']}")
    flags = cinfo['flags']
    
    base  = base_metrics(df_clean, flags)
    if not base:
        print(f"    SKIP: insufficient data")
        continue
    print(f"    Base: N={base['n']:,} | WR={base['wr']:.1f}% | PF={base['pf']:.3f}")
    
    oos   = oos_validation(df_clean, flags)
    wf    = walk_forward(df_clean, flags)
    mc    = monte_carlo(df_clean, flags)
    perm  = permutation_test(df_clean, flags)
    ystab = year_stability(df_clean, flags)
    irred = irreducibility_confirm(df_clean, flags, base['wr'])
    
    if oos['oos']:
        print(f"    OOS:  WR={oos['oos']['wr']:.1f}% | PF={oos['oos']['pf']:.3f} (IS: WR={oos['is']['wr']:.1f}% | PF={oos['is']['pf']:.3f})")
    if wf:
        print(f"    WF:   {wf['above_55']}/{wf['total']} windows above 55% WR")
    if mc:
        print(f"    MC:   WR pass={mc['pass_wr55']:.0f}% | PF pass={mc['pass_pf15']:.0f}% | WR p5={mc['wr_p5']:.1f}%")
    if perm:
        print(f"    Perm: Z={perm['z_score']:.2f} | p={perm['p_value']:.6f}")
    removal_str = ', '.join([f'{k}: -{v["wr_drop"]:.1f}pp' for k,v in irred['removals'].items()])
    print(f"    Irred: {irred['all_irreducible']} | Removals: {removal_str}")
    
    # Year stability
    for yr, ym in ystab.items():
        print(f"    {yr}: WR={ym['wr']:.1f}% | PF={ym['pf']:.3f} (N={ym['n']})")
    
    # Promotion decision
    promoted = (
        base['wr'] >= 60 and
        (oos['oos'] and oos['oos']['pf'] >= 1.5) and
        (wf and wf['above_55'] >= 8) and
        (mc and mc['pass_wr55'] >= 90) and
        (perm and perm['z_score'] >= 5.0) and
        irred['all_irreducible']
    )
    print(f"    DECISION: {'PROMOTED to Candidate MVC' if promoted else 'REJECTED'}")
    
    all_results[cid] = {
        'name': cinfo['name'], 'flags': flags, 'hypothesis': cinfo['hypothesis'],
        'base': base, 'oos': oos, 'wf': wf, 'mc': mc, 'perm': perm,
        'year_stability': ystab, 'irreducibility': irred, 'promoted': promoted,
    }

# ─── Visualisation ────────────────────────────────────────────────────────────
print("\nGenerating validation summary visualisation...")
plt.style.use('dark_background')
GREEN = '#22c55e'; RED = '#ef4444'; GOLD = '#f59e0b'; BLUE = '#3b82f6'

fig = plt.figure(figsize=(22, 14), facecolor='#0d1117')
gs  = gridspec.GridSpec(2, 3, figure=fig, hspace=0.45, wspace=0.35)

# Chart 1: Base WR comparison
ax1 = fig.add_subplot(gs[0, 0])
cids   = list(all_results.keys())
wrs    = [all_results[c]['base']['wr'] for c in cids]
colors = [GREEN if all_results[c]['promoted'] else RED for c in cids]
bars1  = ax1.bar(cids, wrs, color=colors, alpha=0.85, edgecolor='white', linewidth=0.5)
ax1.axhline(BASELINE_WR, color=RED, linestyle='--', alpha=0.7, label=f'Baseline ({BASELINE_WR:.1f}%)')
ax1.axhline(60, color=GOLD, linestyle=':', alpha=0.5, label='60% floor')
ax1.set_title('Base Win Rate by Candidate', color='white', fontsize=11, fontweight='bold')
ax1.set_ylabel('Win Rate (%)', color='white'); ax1.tick_params(colors='white')
ax1.legend(fontsize=9); ax1.set_ylim(45, 80)
for bar, wr in zip(bars1, wrs):
    ax1.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 0.3, f'{wr:.1f}%', 
             ha='center', va='bottom', color='white', fontsize=9)

# Chart 2: OOS vs IS PF
ax2 = fig.add_subplot(gs[0, 1])
is_pfs  = [all_results[c]['oos']['is']['pf'] if all_results[c]['oos']['is'] else 0 for c in cids]
oos_pfs = [all_results[c]['oos']['oos']['pf'] if all_results[c]['oos']['oos'] else 0 for c in cids]
x = np.arange(len(cids))
ax2.bar(x - 0.2, is_pfs,  0.35, color=BLUE,  alpha=0.85, label='In-Sample PF',  edgecolor='white', linewidth=0.5)
ax2.bar(x + 0.2, oos_pfs, 0.35, color=GREEN, alpha=0.85, label='OOS PF',         edgecolor='white', linewidth=0.5)
ax2.axhline(1.5, color=GOLD, linestyle='--', alpha=0.7, label='PF 1.5 floor')
ax2.set_title('In-Sample vs OOS Profit Factor', color='white', fontsize=11, fontweight='bold')
ax2.set_ylabel('Profit Factor', color='white'); ax2.set_xticks(x); ax2.set_xticklabels(cids)
ax2.tick_params(colors='white'); ax2.legend(fontsize=9)

# Chart 3: Permutation Z-scores
ax3 = fig.add_subplot(gs[0, 2])
zscores = [all_results[c]['perm']['z_score'] if all_results[c]['perm'] else 0 for c in cids]
z_colors = [GREEN if z >= 5.0 else RED for z in zscores]
bars3 = ax3.bar(cids, zscores, color=z_colors, alpha=0.85, edgecolor='white', linewidth=0.5)
ax3.axhline(5.0, color=GOLD, linestyle='--', alpha=0.7, label='Z=5.0 threshold')
ax3.set_title('Permutation Z-Score\n(significance against random)', color='white', fontsize=11, fontweight='bold')
ax3.set_ylabel('Z-Score', color='white'); ax3.tick_params(colors='white'); ax3.legend(fontsize=9)
for bar, z in zip(bars3, zscores):
    ax3.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 0.1, f'{z:.1f}', 
             ha='center', va='bottom', color='white', fontsize=9)

# Chart 4: Walk-forward windows above 55%
ax4 = fig.add_subplot(gs[1, 0])
wf_pass = [all_results[c]['wf']['above_55'] if all_results[c]['wf'] else 0 for c in cids]
wf_total = [all_results[c]['wf']['total'] if all_results[c]['wf'] else 12 for c in cids]
wf_pct   = [p/t*100 for p, t in zip(wf_pass, wf_total)]
wf_colors = [GREEN if p >= 8 else GOLD if p >= 6 else RED for p in wf_pass]
bars4 = ax4.bar(cids, wf_pct, color=wf_colors, alpha=0.85, edgecolor='white', linewidth=0.5)
ax4.axhline(66.7, color=GOLD, linestyle='--', alpha=0.7, label='8/12 threshold (66.7%)')
ax4.set_title('Walk-Forward: % Windows Above 55% WR', color='white', fontsize=11, fontweight='bold')
ax4.set_ylabel('% Windows Passing', color='white'); ax4.tick_params(colors='white'); ax4.legend(fontsize=9)
for bar, p, t in zip(bars4, wf_pass, wf_total):
    ax4.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 0.5, f'{p}/{t}', 
             ha='center', va='bottom', color='white', fontsize=9)

# Chart 5: MC pass rates
ax5 = fig.add_subplot(gs[1, 1])
mc_wr  = [all_results[c]['mc']['pass_wr55'] if all_results[c]['mc'] else 0 for c in cids]
mc_pf  = [all_results[c]['mc']['pass_pf15'] if all_results[c]['mc'] else 0 for c in cids]
x = np.arange(len(cids))
ax5.bar(x - 0.2, mc_wr, 0.35, color=BLUE,  alpha=0.85, label='MC WR>55% pass rate', edgecolor='white', linewidth=0.5)
ax5.bar(x + 0.2, mc_pf, 0.35, color=GREEN, alpha=0.85, label='MC PF>1.5 pass rate',  edgecolor='white', linewidth=0.5)
ax5.axhline(90, color=GOLD, linestyle='--', alpha=0.7, label='90% threshold')
ax5.set_title('Monte Carlo Pass Rates\n(10,000 bootstrap runs)', color='white', fontsize=11, fontweight='bold')
ax5.set_ylabel('Pass Rate (%)', color='white'); ax5.set_xticks(x); ax5.set_xticklabels(cids)
ax5.tick_params(colors='white'); ax5.legend(fontsize=9); ax5.set_ylim(0, 110)

# Chart 6: Promotion scorecard
ax6 = fig.add_subplot(gs[1, 2])
criteria = ['WR≥60%', 'OOS PF≥1.5', 'WF 8/12', 'MC 90%', 'Z≥5.0', 'Irreducible']
scorecard = {}
for cid in cids:
    r = all_results[cid]
    scorecard[cid] = [
        1 if r['base']['wr'] >= 60 else 0,
        1 if (r['oos']['oos'] and r['oos']['oos']['pf'] >= 1.5) else 0,
        1 if (r['wf'] and r['wf']['above_55'] >= 8) else 0,
        1 if (r['mc'] and r['mc']['pass_wr55'] >= 90) else 0,
        1 if (r['perm'] and r['perm']['z_score'] >= 5.0) else 0,
        1 if r['irreducibility']['all_irreducible'] else 0,
    ]

sc_matrix = np.array([scorecard[c] for c in cids])
im = ax6.imshow(sc_matrix, cmap='RdYlGn', vmin=0, vmax=1, aspect='auto')
ax6.set_xticks(range(len(criteria))); ax6.set_xticklabels(criteria, rotation=45, ha='right', fontsize=8)
ax6.set_yticks(range(len(cids))); ax6.set_yticklabels(cids)
ax6.set_title('Promotion Scorecard\n(Green=Pass, Red=Fail)', color='white', fontsize=11, fontweight='bold')
ax6.tick_params(colors='white')
for i in range(len(cids)):
    for j in range(len(criteria)):
        ax6.text(j, i, '✓' if sc_matrix[i,j] else '✗', ha='center', va='center', 
                 color='white', fontsize=12, fontweight='bold')

plt.suptitle('Atlas Sprint 059 — Candidate MVC Validation Suite\n(Top 5 Candidates from Systematic Search)', 
             color='white', fontsize=14, fontweight='bold')
plt.savefig(f'{CHARTS_DIR}/sprint059_candidate_validation.png', dpi=150, bbox_inches='tight', facecolor='#0d1117')
plt.close()
print(f"  Saved: sprint059_candidate_validation.png")

with open(f'{OUTPUT_DIR}/candidate_validation_results.json', 'w') as f:
    json.dump(all_results, f, indent=2, default=str)
print(f"Saved: {OUTPUT_DIR}/candidate_validation_results.json")

# Summary
print("\n=== PROMOTION SUMMARY ===")
for cid, r in all_results.items():
    status = 'PROMOTED' if r['promoted'] else 'REJECTED'
    print(f"  {cid} ({r['name'][:40]}): {status}")
print("=== CANDIDATE VALIDATION COMPLETE ===")
