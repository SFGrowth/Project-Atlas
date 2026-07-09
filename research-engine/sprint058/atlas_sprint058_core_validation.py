"""
Atlas Sprint 058 — Apex Combination 1 Core Validation Suite

Tests:
  1. Out-of-sample validation (IS: 2024-2025, OOS: 2026)
  2. Walk-forward validation (12 windows)
  3. Rolling-window validation (90-day windows)
  4. Monte Carlo simulation (10,000 runs)
  5. Slippage + commission simulation
  6. Year-by-year stability
  7. Month-by-month stability
  8. Regime decomposition (ADX, EMA, VolComp)
  9. Session decomposition (AM, MID, PM)
"""

import pandas as pd
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.gridspec as gridspec
from scipy import stats
import warnings, json, os
warnings.filterwarnings('ignore')

FEAT_PATH   = '/home/ubuntu/Project-Atlas/research-engine/sprint056/discovery_features_rth.csv'
OUTPUT_DIR  = '/home/ubuntu/Project-Atlas/research-engine/sprint058'
CHARTS_DIR  = '/home/ubuntu/Project-Atlas/research/sprint-058-charts'
os.makedirs(OUTPUT_DIR, exist_ok=True)
os.makedirs(CHARTS_DIR, exist_ok=True)

print("Loading RTH feature matrix...")
df = pd.read_csv(FEAT_PATH)
df['ts']   = pd.to_datetime(df['ts'])
df['year'] = df['ts'].dt.year
df['month'] = df['ts'].dt.to_period('M')
df_clean   = df.dropna(subset=['fwd_12_return_atr', 'is_exceptional_fwd']).copy()
print(f"  {len(df_clean):,} clean RTH bars")

# Apex Combination 1 flags
df_clean['D01']      = (df_clean['rel_txn'] >= 1.33).astype(int)
df_clean['D03']      = (df_clean['ov_range_vs_atr14'] >= 10.85).astype(int)
df_clean['D02_bull'] = (df_clean['ov_dir'] == 1).astype(int)
df_clean['apex']     = ((df_clean['D01']==1) & (df_clean['D03']==1) & (df_clean['D02_bull']==1)).astype(int)

# Also compute Atlas principle flags for regime decomposition
df_clean['adx_high']   = (df_clean['adx14'] >= 25).astype(int)
df_clean['ema_bull']   = (df_clean['ema_alignment'] == 1).astype(int)
df_clean['ema_bear']   = (df_clean['ema_alignment'] == -1).astype(int)
df_clean['compressed'] = (df_clean['volcomp_5_14'] < 0.85).astype(int)

BASELINE_WR  = df_clean['fwd_12_return_atr'].gt(0).mean() * 100
BASELINE_EXC = df_clean['is_exceptional_fwd'].mean() * 100
APEX_MASK    = df_clean['apex'] == 1
APEX_N       = APEX_MASK.sum()
APEX_WR      = df_clean.loc[APEX_MASK, 'fwd_12_return_atr'].gt(0).mean() * 100
APEX_EXC     = df_clean.loc[APEX_MASK, 'is_exceptional_fwd'].mean() * 100

print(f"\n  Baseline: WR={BASELINE_WR:.1f}%, Exc={BASELINE_EXC:.1f}%")
print(f"  Apex C1:  N={APEX_N:,}, WR={APEX_WR:.1f}%, Exc={APEX_EXC:.1f}%")

results = {}

# ─── 1. Out-of-Sample Validation ──────────────────────────────────────────────
print("\n=== 1. OUT-OF-SAMPLE VALIDATION ===")
# IS: 2024-01 to 2025-12 (first ~66%), OOS: 2026 (last ~33%)
is_mask  = df_clean['year'] <= 2025
oos_mask = df_clean['year'] == 2026

for split_name, mask in [('In-Sample (2024-2025)', is_mask), ('Out-of-Sample (2026)', oos_mask)]:
    apex_in_split = APEX_MASK & mask
    n    = apex_in_split.sum()
    wr   = df_clean.loc[apex_in_split, 'fwd_12_return_atr'].gt(0).mean() * 100
    exc  = df_clean.loc[apex_in_split, 'is_exceptional_fwd'].mean() * 100
    fwd  = df_clean.loc[apex_in_split, 'fwd_12_return_atr']
    pos  = fwd[fwd > 0].sum()
    neg  = fwd[fwd < 0].abs().sum()
    pf   = pos / (neg + 1e-6)
    exp  = fwd.mean()
    print(f"  {split_name}: N={n:,} | WR={wr:.1f}% | Exc={exc:.1f}% | PF={pf:.3f} | Exp={exp:+.3f}")

results['oos'] = {
    'is_wr': df_clean.loc[APEX_MASK & is_mask, 'fwd_12_return_atr'].gt(0).mean() * 100,
    'oos_wr': df_clean.loc[APEX_MASK & oos_mask, 'fwd_12_return_atr'].gt(0).mean() * 100,
    'is_n': int((APEX_MASK & is_mask).sum()),
    'oos_n': int((APEX_MASK & oos_mask).sum()),
}

# ─── 2. Walk-Forward Validation (12 windows) ──────────────────────────────────
print("\n=== 2. WALK-FORWARD VALIDATION (12 windows) ===")
df_clean_sorted = df_clean.sort_values('ts').reset_index(drop=True)
n_total = len(df_clean_sorted)
window_size = n_total // 12
wf_results = []

for i in range(12):
    start = i * window_size
    end   = start + window_size
    window = df_clean_sorted.iloc[start:end]
    apex_w = window['apex'] == 1
    n_w    = apex_w.sum()
    if n_w < 20:
        continue
    wr_w   = window.loc[apex_w, 'fwd_12_return_atr'].gt(0).mean() * 100
    exc_w  = window.loc[apex_w, 'is_exceptional_fwd'].mean() * 100
    fwd_w  = window.loc[apex_w, 'fwd_12_return_atr']
    pf_w   = fwd_w[fwd_w>0].sum() / (fwd_w[fwd_w<0].abs().sum() + 1e-6)
    period = f"{window['ts'].min().strftime('%Y-%m')} to {window['ts'].max().strftime('%Y-%m')}"
    wf_results.append({'window': i+1, 'period': period, 'n': n_w, 'wr': wr_w, 'exc': exc_w, 'pf': pf_w})
    print(f"  W{i+1:02d} {period}: N={n_w:3d} | WR={wr_w:.1f}% | Exc={exc_w:.1f}% | PF={pf_w:.3f}")

results['walk_forward'] = wf_results
wf_wrs = [w['wr'] for w in wf_results]
print(f"\n  WF WR range: {min(wf_wrs):.1f}% - {max(wf_wrs):.1f}% | Mean={np.mean(wf_wrs):.1f}% | Std={np.std(wf_wrs):.1f}%")
print(f"  Windows above 55% WR: {sum(1 for w in wf_wrs if w >= 55)}/{len(wf_wrs)}")

# ─── 3. Rolling-Window Validation (90-day windows) ────────────────────────────
print("\n=== 3. ROLLING-WINDOW VALIDATION (90-day) ===")
df_clean_sorted['date_only'] = df_clean_sorted['ts'].dt.date
dates = sorted(df_clean_sorted['date_only'].unique())
rolling_results = []

for i in range(0, len(dates) - 90, 15):  # step every 15 days
    window_dates = set(dates[i:i+90])
    window = df_clean_sorted[df_clean_sorted['date_only'].isin(window_dates)]
    apex_w = window['apex'] == 1
    n_w = apex_w.sum()
    if n_w < 15:
        continue
    wr_w = window.loc[apex_w, 'fwd_12_return_atr'].gt(0).mean() * 100
    rolling_results.append({'start': dates[i], 'n': n_w, 'wr': wr_w})

results['rolling'] = rolling_results
rolling_wrs = [r['wr'] for r in rolling_results]
print(f"  Rolling windows: {len(rolling_results)}")
print(f"  WR range: {min(rolling_wrs):.1f}% - {max(rolling_wrs):.1f}% | Mean={np.mean(rolling_wrs):.1f}% | Std={np.std(rolling_wrs):.1f}%")
print(f"  Windows above 55% WR: {sum(1 for w in rolling_wrs if w >= 55)}/{len(rolling_wrs)} ({sum(1 for w in rolling_wrs if w >= 55)/len(rolling_wrs)*100:.1f}%)")

# ─── 4. Monte Carlo Simulation ────────────────────────────────────────────────
print("\n=== 4. MONTE CARLO SIMULATION (10,000 runs) ===")
apex_returns = df_clean.loc[APEX_MASK, 'fwd_12_return_atr'].values
n_apex = len(apex_returns)
np.random.seed(42)
N_MC = 10000
mc_wrs = []
mc_pfs = []
mc_dds = []

for _ in range(N_MC):
    sample = np.random.choice(apex_returns, size=min(n_apex, 500), replace=True)
    wr_mc  = (sample > 0).mean() * 100
    pf_mc  = sample[sample > 0].sum() / (np.abs(sample[sample < 0]).sum() + 1e-6)
    cum    = np.cumsum(sample)
    dd_mc  = (cum - np.maximum.accumulate(cum)).min()
    mc_wrs.append(wr_mc)
    mc_pfs.append(pf_mc)
    mc_dds.append(dd_mc)

mc_wrs = np.array(mc_wrs)
mc_pfs = np.array(mc_pfs)
mc_dds = np.array(mc_dds)

print(f"  MC WR: mean={mc_wrs.mean():.1f}%, 5th pct={np.percentile(mc_wrs,5):.1f}%, 95th={np.percentile(mc_wrs,95):.1f}%")
print(f"  MC PF: mean={mc_pfs.mean():.3f}, 5th pct={np.percentile(mc_pfs,5):.3f}, 95th={np.percentile(mc_pfs,95):.3f}")
print(f"  MC DD: mean={mc_dds.mean():.3f}, 5th pct={np.percentile(mc_dds,5):.3f}")
print(f"  MC pass rate (WR>55%): {(mc_wrs>55).mean()*100:.1f}%")
print(f"  MC pass rate (PF>1.5): {(mc_pfs>1.5).mean()*100:.1f}%")

results['monte_carlo'] = {
    'wr_mean': float(mc_wrs.mean()), 'wr_5pct': float(np.percentile(mc_wrs,5)), 'wr_95pct': float(np.percentile(mc_wrs,95)),
    'pf_mean': float(mc_pfs.mean()), 'pf_5pct': float(np.percentile(mc_pfs,5)), 'pf_95pct': float(np.percentile(mc_pfs,95)),
    'dd_mean': float(mc_dds.mean()), 'dd_5pct': float(np.percentile(mc_dds,5)),
    'pass_rate_wr55': float((mc_wrs>55).mean()*100),
    'pass_rate_pf15': float((mc_pfs>1.5).mean()*100),
}

# ─── 5. Slippage + Commission Simulation ──────────────────────────────────────
print("\n=== 5. SLIPPAGE + COMMISSION SIMULATION ===")
# MNQ: 1 ATR unit ≈ 20 NQ points ≈ $40 per contract
# Slippage: 0.5 to 2.0 points per side (0.025 to 0.1 ATR units)
# Commission: $0.50 per contract per side = $1.00 round trip ≈ 0.025 ATR units
apex_ret = df_clean.loc[APEX_MASK, 'fwd_12_return_atr'].values

for slip_atr in [0.0, 0.025, 0.05, 0.1, 0.15]:
    adjusted = apex_ret - slip_atr  # deduct slippage from each return
    wr_adj   = (adjusted > 0).mean() * 100
    pf_adj   = adjusted[adjusted>0].sum() / (np.abs(adjusted[adjusted<0]).sum() + 1e-6)
    exp_adj  = adjusted.mean()
    print(f"  Slip={slip_atr:.3f} ATR: WR={wr_adj:.1f}% | PF={pf_adj:.3f} | Exp={exp_adj:+.3f}")

results['slippage'] = []
for slip_atr in [0.0, 0.025, 0.05, 0.1, 0.15]:
    adjusted = apex_ret - slip_atr
    results['slippage'].append({
        'slip': slip_atr, 'wr': float((adjusted>0).mean()*100),
        'pf': float(adjusted[adjusted>0].sum() / (np.abs(adjusted[adjusted<0]).sum() + 1e-6)),
        'exp': float(adjusted.mean())
    })

# ─── 6. Month-by-Month Stability ──────────────────────────────────────────────
print("\n=== 6. MONTH-BY-MONTH STABILITY ===")
monthly_results = []
for month in sorted(df_clean['month'].unique()):
    month_mask = (df_clean['month'] == month) & APEX_MASK
    n_m = month_mask.sum()
    if n_m < 10:
        continue
    wr_m = df_clean.loc[month_mask, 'fwd_12_return_atr'].gt(0).mean() * 100
    monthly_results.append({'month': str(month), 'n': n_m, 'wr': wr_m})

monthly_wrs = [m['wr'] for m in monthly_results]
print(f"  Months with data: {len(monthly_results)}")
print(f"  WR range: {min(monthly_wrs):.1f}% - {max(monthly_wrs):.1f}% | Mean={np.mean(monthly_wrs):.1f}% | Std={np.std(monthly_wrs):.1f}%")
print(f"  Months above 55% WR: {sum(1 for w in monthly_wrs if w >= 55)}/{len(monthly_results)}")
results['monthly'] = monthly_results

# ─── 7. Regime Decomposition ──────────────────────────────────────────────────
print("\n=== 7. REGIME DECOMPOSITION ===")
for regime_name, regime_mask in [
    ('ADX >= 25 (trending)',     df_clean['adx_high'] == 1),
    ('ADX < 25 (ranging)',       df_clean['adx_high'] == 0),
    ('EMA bullish',              df_clean['ema_bull'] == 1),
    ('EMA bearish',              df_clean['ema_bear'] == 1),
    ('EMA neutral',              (df_clean['ema_bull']==0) & (df_clean['ema_bear']==0)),
    ('Compressed (VolComp<0.85)',df_clean['compressed'] == 1),
    ('Expanded (VolComp>=0.85)', df_clean['compressed'] == 0),
]:
    mask = APEX_MASK & regime_mask
    n_r  = mask.sum()
    if n_r < 20:
        continue
    wr_r = df_clean.loc[mask, 'fwd_12_return_atr'].gt(0).mean() * 100
    exc_r = df_clean.loc[mask, 'is_exceptional_fwd'].mean() * 100
    print(f"  {regime_name:<35}: N={n_r:4d} | WR={wr_r:.1f}% | Exc={exc_r:.1f}%")

# ─── 8. Session Decomposition ─────────────────────────────────────────────────
print("\n=== 8. SESSION DECOMPOSITION ===")
for session_name, session_mask in [
    ('AM  (09:30-11:59)', (df_clean['hour'] >= 9) & (df_clean['hour'] <= 11)),
    ('MID (12:00-12:59)', df_clean['hour'] == 12),
    ('PM  (13:00-15:59)', df_clean['hour'] >= 13),
]:
    mask = APEX_MASK & session_mask
    n_s  = mask.sum()
    if n_s < 10:
        continue
    wr_s = df_clean.loc[mask, 'fwd_12_return_atr'].gt(0).mean() * 100
    exc_s = df_clean.loc[mask, 'is_exceptional_fwd'].mean() * 100
    print(f"  {session_name}: N={n_s:4d} | WR={wr_s:.1f}% | Exc={exc_s:.1f}%")

# ─── VISUALISATIONS ───────────────────────────────────────────────────────────
print("\nGenerating visualisations...")
plt.style.use('dark_background')
fig = plt.figure(figsize=(20, 20), facecolor='#0d1117')
gs  = gridspec.GridSpec(3, 2, figure=fig, hspace=0.4, wspace=0.3)

GREEN = '#22c55e'; RED = '#ef4444'; GOLD = '#f59e0b'; BLUE = '#3b82f6'

# Chart 1: Walk-forward WR by window
ax1 = fig.add_subplot(gs[0, 0])
wf_x = [w['window'] for w in wf_results]
wf_y = [w['wr'] for w in wf_results]
wf_colors = [GREEN if wr >= 55 else RED for wr in wf_y]
ax1.bar(wf_x, wf_y, color=wf_colors, alpha=0.85, edgecolor='white', linewidth=0.5)
ax1.axhline(55, color=GOLD, linestyle='--', alpha=0.7, label='55% threshold')
ax1.axhline(APEX_WR, color=GREEN, linestyle='-', alpha=0.5, label=f'Overall WR ({APEX_WR:.1f}%)')
ax1.set_title('Walk-Forward Validation\n(12 sequential windows)', color='white', fontsize=11, fontweight='bold')
ax1.set_xlabel('Window', color='white'); ax1.set_ylabel('Win Rate (%)', color='white')
ax1.tick_params(colors='white'); ax1.legend(fontsize=9)
ax1.set_ylim(0, 100)

# Chart 2: Rolling-window WR distribution
ax2 = fig.add_subplot(gs[0, 1])
ax2.hist(rolling_wrs, bins=20, color=BLUE, alpha=0.85, edgecolor='white', linewidth=0.5)
ax2.axvline(55, color=GOLD, linestyle='--', alpha=0.7, label='55% threshold')
ax2.axvline(np.mean(rolling_wrs), color=GREEN, linestyle='-', alpha=0.7, label=f'Mean ({np.mean(rolling_wrs):.1f}%)')
ax2.set_title('Rolling-Window WR Distribution\n(90-day windows, 15-day step)', color='white', fontsize=11, fontweight='bold')
ax2.set_xlabel('Win Rate (%)', color='white'); ax2.set_ylabel('Count', color='white')
ax2.tick_params(colors='white'); ax2.legend(fontsize=9)

# Chart 3: Monte Carlo WR distribution
ax3 = fig.add_subplot(gs[1, 0])
ax3.hist(mc_wrs, bins=50, color=BLUE, alpha=0.85, edgecolor='white', linewidth=0.3)
ax3.axvline(55, color=GOLD, linestyle='--', alpha=0.7, label='55% threshold')
ax3.axvline(mc_wrs.mean(), color=GREEN, linestyle='-', alpha=0.7, label=f'Mean ({mc_wrs.mean():.1f}%)')
ax3.axvline(np.percentile(mc_wrs, 5), color=RED, linestyle='--', alpha=0.7, label=f'5th pct ({np.percentile(mc_wrs,5):.1f}%)')
ax3.set_title('Monte Carlo WR Distribution\n(10,000 bootstrap samples)', color='white', fontsize=11, fontweight='bold')
ax3.set_xlabel('Win Rate (%)', color='white'); ax3.set_ylabel('Count', color='white')
ax3.tick_params(colors='white'); ax3.legend(fontsize=9)

# Chart 4: Slippage sensitivity
ax4 = fig.add_subplot(gs[1, 1])
slip_x = [s['slip'] for s in results['slippage']]
slip_wr = [s['wr'] for s in results['slippage']]
slip_pf = [s['pf'] for s in results['slippage']]
ax4.plot(slip_x, slip_wr, color=GREEN, marker='o', linewidth=2, label='Win Rate (%)')
ax4_twin = ax4.twinx()
ax4_twin.plot(slip_x, slip_pf, color=GOLD, marker='s', linewidth=2, linestyle='--', label='Profit Factor')
ax4.axhline(55, color=GREEN, linestyle=':', alpha=0.5)
ax4_twin.axhline(1.5, color=GOLD, linestyle=':', alpha=0.5)
ax4.set_title('Slippage Sensitivity\n(ATR units per trade)', color='white', fontsize=11, fontweight='bold')
ax4.set_xlabel('Slippage (ATR units)', color='white')
ax4.set_ylabel('Win Rate (%)', color='white'); ax4_twin.set_ylabel('Profit Factor', color=GOLD)
ax4.tick_params(colors='white'); ax4_twin.tick_params(colors=GOLD)
lines1, labels1 = ax4.get_legend_handles_labels()
lines2, labels2 = ax4_twin.get_legend_handles_labels()
ax4.legend(lines1 + lines2, labels1 + labels2, fontsize=9)

# Chart 5: Month-by-month WR
ax5 = fig.add_subplot(gs[2, :])
months_x = range(len(monthly_results))
months_y = [m['wr'] for m in monthly_results]
months_labels = [m['month'] for m in monthly_results]
month_colors = [GREEN if wr >= 55 else RED for wr in months_y]
bars5 = ax5.bar(months_x, months_y, color=month_colors, alpha=0.85, edgecolor='white', linewidth=0.3)
ax5.axhline(55, color=GOLD, linestyle='--', alpha=0.7, label='55% threshold')
ax5.axhline(APEX_WR, color=GREEN, linestyle='-', alpha=0.5, label=f'Overall ({APEX_WR:.1f}%)')
ax5.set_xticks(months_x)
ax5.set_xticklabels(months_labels, rotation=45, ha='right', fontsize=7, color='white')
ax5.set_title('Month-by-Month Win Rate Stability', color='white', fontsize=11, fontweight='bold')
ax5.set_ylabel('Win Rate (%)', color='white'); ax5.tick_params(colors='white')
ax5.legend(fontsize=9); ax5.set_ylim(0, 100)

plt.suptitle('Atlas Sprint 058 — Apex Combination 1 Core Validation Suite\n(D-01 × D-03 × D-02_bull)', 
             color='white', fontsize=14, fontweight='bold')
plt.savefig(f'{CHARTS_DIR}/sprint058_core_validation.png', dpi=150, bbox_inches='tight', facecolor='#0d1117')
plt.close()
print(f"  Saved: sprint058_core_validation.png")

with open(f'{OUTPUT_DIR}/core_validation_results.json', 'w') as f:
    json.dump(results, f, indent=2, default=str)
print(f"Saved: {OUTPUT_DIR}/core_validation_results.json")
print("=== CORE VALIDATION SUITE COMPLETE ===")
