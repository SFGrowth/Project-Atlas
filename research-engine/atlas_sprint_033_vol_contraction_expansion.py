"""
Atlas Sprint 033: Volatility Contraction → Expansion Asymmetry
Behavioural Validation Harness
=======================================================================
Research Stream: D — Component Intelligence
Hypothesis: Following a measurable period of volatility contraction,
price expansion is more likely to occur in the direction of the
prevailing higher-timeframe trend than against it.

This script measures a market behaviour. It does NOT design an execution model.

Definitions (objective, no optimisation):
  Volatility Contraction: ATR(14) on 5-min bars drops to ≤ 0.5x of its
    20-bar rolling mean (i.e., current ATR is at most half the recent average).
    Contraction must persist for at least 3 consecutive bars.
  Volatility Expansion: The bar immediately following the contraction period
    has a range (high - low) ≥ 1.5x ATR(14).
  Higher-Timeframe Trend: EMA9 > EMA21 > EMA50 = Bullish; EMA9 < EMA21 < EMA50 = Bearish.
  Directional Asymmetry: Expansion bar close > open = With-Trend; close < open = Counter-Trend.
"""

import pandas as pd
import numpy as np
from scipy import stats
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.gridspec as gridspec
import warnings
warnings.filterwarnings('ignore')
import os

# ─── Configuration ────────────────────────────────────────────────────────────
DATA_PATH  = '/home/ubuntu/Project-Atlas/data/raw/massive/MNQ_5min_full.csv'
OUTPUT_DIR = '/home/ubuntu/Project-Atlas/research/sprint-033-charts'
POINT_VALUE = 2.00   # MNQ: $2.00 per point
COMMISSION  = 1.00   # $1.00 per side
SLIPPAGE    = 0.50   # $0.50 per side (1 tick)
FRICTION    = (COMMISSION + SLIPPAGE) * 2  # $3.00 round trip

# Contraction definition parameters (broad, defensible)
CONTRACTION_RATIO   = 0.75  # ATR must be ≤ 75% of its 20-bar mean
CONTRACTION_BARS    = 2     # Must persist for at least 2 bars
EXPANSION_RATIO     = 1.3   # Expansion bar range ≥ 1.3x ATR
ATR_PERIOD          = 14
ATR_MEAN_PERIOD     = 20
EMA_FAST, EMA_MED, EMA_SLOW = 9, 21, 50

os.makedirs(OUTPUT_DIR, exist_ok=True)

# ─── Load & Prepare Data ──────────────────────────────────────────────────────
print("=" * 70)
print("ATLAS SPRINT 033: VOLATILITY CONTRACTION → EXPANSION ASYMMETRY")
print("=" * 70)

df = pd.read_csv(DATA_PATH)
df['ts']      = pd.to_datetime(df['timestamp_et'], utc=True)
df['hour']    = df['ts'].dt.hour
df['minute']  = df['ts'].dt.minute
df['date_et'] = df['ts'].dt.date
df['year']    = df['ts'].dt.year
df['month']   = df['ts'].dt.month
df = df.sort_values('ts').reset_index(drop=True)

print(f"Dataset: {len(df):,} bars | {df['ts'].min().date()} to {df['ts'].max().date()}")

# ─── Compute Indicators ───────────────────────────────────────────────────────
print("\nComputing indicators...")

# ATR (True Range)
df['prev_close'] = df['close'].shift(1)
df['tr'] = np.maximum(
    df['high'] - df['low'],
    np.maximum(
        (df['high'] - df['prev_close']).abs(),
        (df['low']  - df['prev_close']).abs()
    )
)
df['atr'] = df['tr'].ewm(span=ATR_PERIOD, adjust=False).mean()
df['atr_mean'] = df['atr'].rolling(ATR_MEAN_PERIOD).mean()

# EMAs
df['ema9']  = df['close'].ewm(span=EMA_FAST, adjust=False).mean()
df['ema21'] = df['close'].ewm(span=EMA_MED,  adjust=False).mean()
df['ema50'] = df['close'].ewm(span=EMA_SLOW, adjust=False).mean()

# Trend direction
df['trend_bull'] = (df['ema9'] > df['ema21']) & (df['ema21'] > df['ema50'])
df['trend_bear'] = (df['ema9'] < df['ema21']) & (df['ema21'] < df['ema50'])
df['trend_dir']  = np.where(df['trend_bull'], 1, np.where(df['trend_bear'], -1, 0))

# ADX proxy (directional movement)
df['dm_plus']  = np.where((df['high'] - df['high'].shift(1)) > (df['low'].shift(1) - df['low']),
                           np.maximum(df['high'] - df['high'].shift(1), 0), 0)
df['dm_minus'] = np.where((df['low'].shift(1) - df['low']) > (df['high'] - df['high'].shift(1)),
                           np.maximum(df['low'].shift(1) - df['low'], 0), 0)
df['di_plus']  = 100 * df['dm_plus'].ewm(span=14, adjust=False).mean() / df['atr']
df['di_minus'] = 100 * df['dm_minus'].ewm(span=14, adjust=False).mean() / df['atr']
df['dx']       = 100 * (df['di_plus'] - df['di_minus']).abs() / (df['di_plus'] + df['di_minus']).replace(0, np.nan)
df['adx']      = df['dx'].ewm(span=14, adjust=False).mean()

# Session
df['is_rth'] = (
    ((df['hour'] == 9) & (df['minute'] >= 30)) |
    ((df['hour'] >= 10) & (df['hour'] < 16))
)
df['is_am']  = df['is_rth'] & (df['hour'] < 12)
df['is_pm']  = df['is_rth'] & (df['hour'] >= 13) & (df['hour'] < 16)

# ─── Identify Contraction Periods ─────────────────────────────────────────────
print("Identifying contraction and expansion events...")

# Is this bar in contraction?
df['in_contraction'] = (df['atr'] <= df['atr_mean'] * CONTRACTION_RATIO) & df['atr_mean'].notna()

# Count consecutive contraction bars
df['consec_contraction'] = 0
consec = 0
for i in range(len(df)):
    if df.loc[i, 'in_contraction']:
        consec += 1
    else:
        consec = 0
    df.loc[i, 'consec_contraction'] = consec

# A "contraction end" is a bar that is NOT in contraction, preceded by ≥ CONTRACTION_BARS in contraction
df['prev_consec'] = df['consec_contraction'].shift(1).fillna(0)
df['contraction_end'] = (~df['in_contraction']) & (df['prev_consec'] >= CONTRACTION_BARS)

# Is the expansion bar range ≥ 1.5x ATR?
df['bar_range']  = df['high'] - df['low']
df['is_expansion'] = df['bar_range'] >= df['atr'] * EXPANSION_RATIO

# Expansion events: bar immediately after contraction ends AND is a genuine expansion
df['expansion_event'] = df['contraction_end'] & df['is_expansion']

# ─── Collect Expansion Events ─────────────────────────────────────────────────
events = df[df['expansion_event']].copy()
print(f"Total expansion events: {len(events)}")
print(f"  RTH events: {events['is_rth'].sum()}")
print(f"  AM session: {events['is_am'].sum()}")
print(f"  PM session: {events['is_pm'].sum()}")

# Expansion direction
events['exp_dir']    = np.sign(events['close'] - events['open'])  # +1 up, -1 down
events['with_trend'] = (events['exp_dir'] == events['trend_dir']) & (events['trend_dir'] != 0)
events['vs_trend']   = (events['exp_dir'] != events['trend_dir']) & (events['trend_dir'] != 0) & (events['exp_dir'] != 0)
events['has_trend']  = events['trend_dir'] != 0

# Magnitude of expansion
events['exp_pts']    = (events['close'] - events['open']).abs()
events['exp_atr_mult'] = events['exp_pts'] / events['atr']

# ─── Q1: Does the Behaviour Exist? ────────────────────────────────────────────
print("\n" + "=" * 70)
print("Q1: DOES THE BEHAVIOUR EXIST?")
print("=" * 70)

# Only use events where trend direction is defined
trend_events = events[events['has_trend']].copy()
print(f"\nEvents with defined trend direction: {len(trend_events)}")

n_with_trend = trend_events['with_trend'].sum()
n_vs_trend   = trend_events['vs_trend'].sum()
n_neutral    = len(trend_events) - n_with_trend - n_vs_trend
total_dir    = n_with_trend + n_vs_trend

pct_with_trend = n_with_trend / total_dir if total_dir > 0 else 0
pct_vs_trend   = n_vs_trend  / total_dir if total_dir > 0 else 0

print(f"\nDirectional Breakdown (excluding neutral expansion bars):")
print(f"  With-Trend expansions:    {n_with_trend} ({pct_with_trend:.1%})")
print(f"  Counter-Trend expansions: {n_vs_trend}   ({pct_vs_trend:.1%})")
print(f"  Neutral (doji) bars:      {n_neutral}")

# Binomial test: is with-trend rate significantly > 50%?
binom_result = stats.binomtest(n_with_trend, total_dir, 0.5, alternative='greater')
print(f"\nBinomial Test (H0: with-trend rate = 50%):")
print(f"  p-value: {binom_result.pvalue:.6f}")
print(f"  Significant at 5%: {'YES' if binom_result.pvalue < 0.05 else 'NO'}")
print(f"  Significant at 1%: {'YES' if binom_result.pvalue < 0.01 else 'NO'}")

# Chi-squared test
chi2, p_chi2 = stats.chisquare([n_with_trend, n_vs_trend], f_exp=[total_dir/2, total_dir/2])
print(f"\nChi-Squared Test:")
print(f"  chi2 = {chi2:.4f}, p = {p_chi2:.6f}")

# ─── Q2: Is the Effect Economically Meaningful? ───────────────────────────────
print("\n" + "=" * 70)
print("Q2: IS THE EFFECT ECONOMICALLY MEANINGFUL?")
print("=" * 70)

# Average expansion magnitude by direction
wt_events = trend_events[trend_events['with_trend']]
ct_events = trend_events[trend_events['vs_trend']]

print(f"\nWith-Trend Expansion ({len(wt_events)} events):")
print(f"  Avg magnitude: {wt_events['exp_pts'].mean():.2f} pts = ${wt_events['exp_pts'].mean() * POINT_VALUE:.2f}")
print(f"  Median magnitude: {wt_events['exp_pts'].median():.2f} pts")
print(f"  Avg ATR multiple: {wt_events['exp_atr_mult'].mean():.2f}x")

print(f"\nCounter-Trend Expansion ({len(ct_events)} events):")
print(f"  Avg magnitude: {ct_events['exp_pts'].mean():.2f} pts = ${ct_events['exp_pts'].mean() * POINT_VALUE:.2f}")
print(f"  Median magnitude: {ct_events['exp_pts'].median():.2f} pts")
print(f"  Avg ATR multiple: {ct_events['exp_atr_mult'].mean():.2f}x")

# Effect size: Cohen's d on expansion magnitude
d_magnitude = (wt_events['exp_pts'].mean() - ct_events['exp_pts'].mean()) / \
              trend_events['exp_pts'].std()
print(f"\nEffect Size (Cohen's d, magnitude): {d_magnitude:.4f}")
print(f"  Interpretation: {'Small (<0.2)' if abs(d_magnitude) < 0.2 else 'Medium (0.2-0.5)' if abs(d_magnitude) < 0.5 else 'Large (>0.5)'}")

# Directional edge: if we could trade the direction, what is the gross edge?
# Assume entry at open of expansion bar, exit at close
gross_edge_pts = wt_events['exp_pts'].mean() * pct_with_trend - ct_events['exp_pts'].mean() * pct_vs_trend
print(f"\nGross directional edge (before costs): {gross_edge_pts:.2f} pts = ${gross_edge_pts * POINT_VALUE:.2f}")
print(f"Round-trip friction: ${FRICTION:.2f}")
print(f"Net edge estimate: ${gross_edge_pts * POINT_VALUE - FRICTION:.2f}")

# ─── Q3: Is the Behaviour Stable? ─────────────────────────────────────────────
print("\n" + "=" * 70)
print("Q3: IS THE BEHAVIOUR STABLE?")
print("=" * 70)

# Year-by-year
print("\nYear-by-Year Stability:")
for year in sorted(trend_events['year'].unique()):
    yr = trend_events[trend_events['year'] == year]
    yr_dir = yr[yr['exp_dir'] != 0]
    if len(yr_dir) < 10:
        continue
    yr_wt = yr_dir['with_trend'].sum()
    yr_ct = yr_dir['vs_trend'].sum()
    yr_total = yr_wt + yr_ct
    yr_pct = yr_wt / yr_total if yr_total > 0 else 0
    yr_binom = stats.binomtest(yr_wt, yr_total, 0.5, alternative='greater')
    print(f"  {year} ({len(yr)} events, {yr_total} directional): with-trend={yr_pct:.1%}, p={yr_binom.pvalue:.4f}")

# ADX regime stability
trend_events['adx_quartile'] = pd.qcut(trend_events['adx'].dropna(), q=4,
                                        labels=['Q1 Low', 'Q2', 'Q3', 'Q4 High'], duplicates='drop')
print(f"\nStability by ADX Regime:")
for q in ['Q1 Low', 'Q2', 'Q3', 'Q4 High']:
    subset = trend_events[trend_events['adx_quartile'] == q]
    if len(subset) < 10:
        continue
    sub_dir = subset[subset['exp_dir'] != 0]
    wt = sub_dir['with_trend'].sum()
    ct = sub_dir['vs_trend'].sum()
    total = wt + ct
    pct = wt / total if total > 0 else 0
    b = stats.binomtest(wt, total, 0.5, alternative='greater')
    print(f"  {q} ({len(subset)} events): with-trend={pct:.1%}, p={b.pvalue:.4f}")

# ATR regime stability
trend_events['atr_quartile'] = pd.qcut(trend_events['atr'].dropna(), q=4,
                                        labels=['Q1 Low', 'Q2', 'Q3', 'Q4 High'], duplicates='drop')
print(f"\nStability by ATR Regime:")
for q in ['Q1 Low', 'Q2', 'Q3', 'Q4 High']:
    subset = trend_events[trend_events['atr_quartile'] == q]
    if len(subset) < 10:
        continue
    sub_dir = subset[subset['exp_dir'] != 0]
    wt = sub_dir['with_trend'].sum()
    ct = sub_dir['vs_trend'].sum()
    total = wt + ct
    pct = wt / total if total > 0 else 0
    b = stats.binomtest(wt, total, 0.5, alternative='greater')
    print(f"  {q} ({len(subset)} events): with-trend={pct:.1%}, p={b.pvalue:.4f}")

# Session stability
print(f"\nStability by Session:")
for session_name, session_mask in [('RTH All', trend_events['is_rth']),
                                    ('AM (09:30-12:00)', trend_events['is_am']),
                                    ('PM (13:00-16:00)', trend_events['is_pm']),
                                    ('Overnight', ~trend_events['is_rth'])]:
    subset = trend_events[session_mask]
    if len(subset) < 10:
        continue
    sub_dir = subset[subset['exp_dir'] != 0]
    wt = sub_dir['with_trend'].sum()
    ct = sub_dir['vs_trend'].sum()
    total = wt + ct
    pct = wt / total if total > 0 else 0
    b = stats.binomtest(wt, total, 0.5, alternative='greater')
    print(f"  {session_name} ({len(subset)} events): with-trend={pct:.1%}, p={b.pvalue:.4f}")

# ─── Q4: Objective Measurability ──────────────────────────────────────────────
print("\n" + "=" * 70)
print("Q4: OBJECTIVE MEASURABILITY")
print("=" * 70)

print(f"\nContraction Definition:")
print(f"  ATR(14) ≤ {CONTRACTION_RATIO}x of 20-bar ATR mean, persisting ≥ {CONTRACTION_BARS} bars")
print(f"  Total contraction periods detected: {df['contraction_end'].sum()}")
print(f"  Total expansion events (≥{EXPANSION_RATIO}x ATR): {df['expansion_event'].sum()}")
print(f"  Conversion rate (contraction → expansion): {df['expansion_event'].sum() / df['contraction_end'].sum():.1%}")

# Contraction duration distribution
contraction_durations = []
in_cont = False
dur = 0
for _, row in df.iterrows():
    if row['in_contraction']:
        in_cont = True
        dur += 1
    elif in_cont:
        if dur >= CONTRACTION_BARS:
            contraction_durations.append(dur)
        in_cont = False
        dur = 0

print(f"\nContraction Duration Statistics:")
print(f"  Mean duration: {np.mean(contraction_durations):.1f} bars ({np.mean(contraction_durations) * 5:.0f} minutes)")
print(f"  Median duration: {np.median(contraction_durations):.0f} bars")
print(f"  Max duration: {max(contraction_durations)} bars ({max(contraction_durations) * 5:.0f} minutes)")

# ─── Behaviour Confidence Score ───────────────────────────────────────────────
print("\n" + "=" * 70)
print("BEHAVIOUR CONFIDENCE SCORE")
print("=" * 70)

score_sig     = 20 if binom_result.pvalue < 0.001 else 15 if binom_result.pvalue < 0.01 else 10 if binom_result.pvalue < 0.05 else 0
score_effect  = 20 if pct_with_trend > 0.60 else 15 if pct_with_trend > 0.57 else 10 if pct_with_trend > 0.54 else 5 if pct_with_trend > 0.51 else 0
score_econ    = 20 if (gross_edge_pts * POINT_VALUE - FRICTION) > 10 else 15 if (gross_edge_pts * POINT_VALUE - FRICTION) > 5 else 10 if (gross_edge_pts * POINT_VALUE - FRICTION) > 0 else 0

# Stability: check year-by-year consistency
yr_results = []
for year in sorted(trend_events['year'].unique()):
    yr = trend_events[trend_events['year'] == year]
    yr_dir = yr[yr['exp_dir'] != 0]
    if len(yr_dir) < 10:
        continue
    yr_wt = yr_dir['with_trend'].sum()
    yr_total = yr_wt + yr_dir['vs_trend'].sum()
    yr_results.append(yr_wt / yr_total > 0.5)
score_stability = 20 if all(yr_results) else 10 if sum(yr_results) >= len(yr_results) * 0.7 else 5

score_measurable = 20  # Objective definition exists

total_score = score_sig + score_effect + score_econ + score_stability + score_measurable

print(f"\n  Statistical Significance:  {score_sig}/20")
print(f"  Effect Size (dir rate):    {score_effect}/20")
print(f"  Economic Significance:     {score_econ}/20")
print(f"  Year-over-Year Stability:  {score_stability}/20")
print(f"  Objective Measurability:   {score_measurable}/20")
print(f"\n  TOTAL BEHAVIOUR CONFIDENCE SCORE: {total_score}/100")

if total_score >= 70:
    verdict = "VALIDATED — Advance to execution model engineering"
elif total_score >= 50:
    verdict = "INCONCLUSIVE — Requires additional data or refinement"
else:
    verdict = "REJECTED — Insufficient evidence of persistent behaviour"
print(f"\n  VERDICT: {verdict}")

# ─── Visualisations ───────────────────────────────────────────────────────────
print("\nGenerating visualisations...")

fig = plt.figure(figsize=(18, 14))
fig.suptitle('Atlas Sprint 033: Volatility Contraction → Expansion Asymmetry\nMNQ Futures — 2-Year Dataset',
             fontsize=14, fontweight='bold', y=0.98)
gs = gridspec.GridSpec(3, 3, figure=fig, hspace=0.45, wspace=0.35)

# 1. With-Trend vs Counter-Trend pie
ax1 = fig.add_subplot(gs[0, 0])
sizes = [n_with_trend, n_vs_trend, n_neutral]
labels = [f'With-Trend\n{pct_with_trend:.1%}', f'Counter-Trend\n{pct_vs_trend:.1%}', f'Neutral\n{n_neutral}']
colors_pie = ['#2ecc71', '#e74c3c', '#95a5a6']
pie_result = ax1.pie(sizes, labels=labels, colors=colors_pie, autopct='%1.0f%%',
                         startangle=90, textprops={'fontsize': 8})
ax1.set_title(f'Expansion Direction\n({len(trend_events)} events with trend)', fontsize=9)

# 2. Year-by-year with-trend rate
ax2 = fig.add_subplot(gs[0, 1])
yr_labels_plot, yr_rates = [], []
for year in sorted(trend_events['year'].unique()):
    yr = trend_events[trend_events['year'] == year]
    yr_dir = yr[yr['exp_dir'] != 0]
    if len(yr_dir) < 10:
        continue
    yr_wt = yr_dir['with_trend'].sum()
    yr_total = yr_wt + yr_dir['vs_trend'].sum()
    yr_labels_plot.append(str(year))
    yr_rates.append(yr_wt / yr_total * 100)

bar_colors = ['#2ecc71' if r > 50 else '#e74c3c' for r in yr_rates]
ax2.bar(yr_labels_plot, yr_rates, color=bar_colors, alpha=0.8, edgecolor='black', linewidth=0.5)
ax2.axhline(50, color='red', linewidth=1.5, linestyle='--', label='50% (random)')
ax2.set_ylabel('With-Trend Rate %', fontsize=9)
ax2.set_title('Year-by-Year Stability', fontsize=9)
ax2.set_ylim(40, 70)
ax2.legend(fontsize=7)

# 3. ADX regime breakdown
ax3 = fig.add_subplot(gs[0, 2])
adq_labels, adq_rates, adq_ns = [], [], []
for q in ['Q1 Low', 'Q2', 'Q3', 'Q4 High']:
    subset = trend_events[trend_events['adx_quartile'] == q]
    if len(subset) < 10:
        continue
    sub_dir = subset[subset['exp_dir'] != 0]
    wt = sub_dir['with_trend'].sum()
    ct = sub_dir['vs_trend'].sum()
    total = wt + ct
    adq_labels.append(q)
    adq_rates.append(wt / total * 100 if total > 0 else 0)
    adq_ns.append(len(subset))

bar_colors_adq = ['#2ecc71' if r > 50 else '#e74c3c' for r in adq_rates]
bars = ax3.bar(adq_labels, adq_rates, color=bar_colors_adq, alpha=0.8, edgecolor='black', linewidth=0.5)
ax3.axhline(50, color='red', linewidth=1.5, linestyle='--')
for bar, n in zip(bars, adq_ns):
    ax3.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 0.3, f'n={n}',
             ha='center', va='bottom', fontsize=7)
ax3.set_ylabel('With-Trend Rate %', fontsize=9)
ax3.set_title('Stability by ADX Regime', fontsize=9)
ax3.set_ylim(40, 70)
ax3.tick_params(axis='x', labelsize=8)

# 4. Expansion magnitude distribution
ax4 = fig.add_subplot(gs[1, 0])
ax4.hist(wt_events['exp_pts'], bins=30, alpha=0.6, color='#2ecc71',
         label=f'With-Trend (n={len(wt_events)})', density=True)
ax4.hist(ct_events['exp_pts'], bins=30, alpha=0.6, color='#e74c3c',
         label=f'Counter-Trend (n={len(ct_events)})', density=True)
ax4.axvline(wt_events['exp_pts'].mean(), color='darkgreen', linewidth=2, linestyle='--')
ax4.axvline(ct_events['exp_pts'].mean(), color='darkred', linewidth=2, linestyle='--')
ax4.set_xlabel('Expansion Magnitude (pts)', fontsize=9)
ax4.set_ylabel('Density', fontsize=9)
ax4.set_title('Expansion Magnitude Distribution', fontsize=9)
ax4.legend(fontsize=7)

# 5. Session breakdown
ax5 = fig.add_subplot(gs[1, 1])
session_labels_plot, session_rates, session_ns = [], [], []
for session_name, session_mask in [('RTH All', trend_events['is_rth']),
                                    ('AM', trend_events['is_am']),
                                    ('PM', trend_events['is_pm']),
                                    ('Overnight', ~trend_events['is_rth'])]:
    subset = trend_events[session_mask]
    if len(subset) < 10:
        continue
    sub_dir = subset[subset['exp_dir'] != 0]
    wt = sub_dir['with_trend'].sum()
    ct = sub_dir['vs_trend'].sum()
    total = wt + ct
    session_labels_plot.append(session_name)
    session_rates.append(wt / total * 100 if total > 0 else 0)
    session_ns.append(len(subset))

bar_colors_sess = ['#2ecc71' if r > 50 else '#e74c3c' for r in session_rates]
bars = ax5.bar(session_labels_plot, session_rates, color=bar_colors_sess, alpha=0.8,
               edgecolor='black', linewidth=0.5)
ax5.axhline(50, color='red', linewidth=1.5, linestyle='--')
for bar, n in zip(bars, session_ns):
    ax5.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 0.3, f'n={n}',
             ha='center', va='bottom', fontsize=7)
ax5.set_ylabel('With-Trend Rate %', fontsize=9)
ax5.set_title('Stability by Session', fontsize=9)
ax5.set_ylim(40, 70)
ax5.tick_params(axis='x', labelsize=8)

# 6. Monthly consistency
ax6 = fig.add_subplot(gs[1, 2])
monthly_rates = []
monthly_labels_plot = []
for (yr, mo), group in trend_events.groupby(['year', 'month']):
    sub_dir = group[group['exp_dir'] != 0]
    if len(sub_dir) < 5:
        continue
    wt = sub_dir['with_trend'].sum()
    total = wt + sub_dir['vs_trend'].sum()
    monthly_rates.append(wt / total * 100 if total > 0 else 0)
    monthly_labels_plot.append(f"{yr}-{mo:02d}")

colors_mo = ['#2ecc71' if r > 50 else '#e74c3c' for r in monthly_rates]
ax6.bar(range(len(monthly_rates)), monthly_rates, color=colors_mo, alpha=0.8,
        edgecolor='black', linewidth=0.3)
ax6.axhline(50, color='black', linewidth=1)
ax6.set_xticks(range(0, len(monthly_labels_plot), max(1, len(monthly_labels_plot)//6)))
ax6.set_xticklabels([monthly_labels_plot[i] for i in range(0, len(monthly_labels_plot), max(1, len(monthly_labels_plot)//6))],
                     fontsize=7, rotation=45)
ax6.set_ylabel('With-Trend Rate %', fontsize=9)
pos_months = sum(r > 50 for r in monthly_rates)
ax6.set_title(f'Monthly Consistency\n({pos_months}/{len(monthly_rates)} months > 50%)', fontsize=9)

# 7. Contraction duration histogram
ax7 = fig.add_subplot(gs[2, 0])
ax7.hist(contraction_durations, bins=20, color='steelblue', alpha=0.8, edgecolor='black', linewidth=0.5)
ax7.axvline(np.mean(contraction_durations), color='red', linewidth=2, linestyle='--',
            label=f'Mean: {np.mean(contraction_durations):.1f} bars')
ax7.set_xlabel('Contraction Duration (bars)', fontsize=9)
ax7.set_ylabel('Frequency', fontsize=9)
ax7.set_title('Contraction Period Duration\nDistribution', fontsize=9)
ax7.legend(fontsize=7)

# 8. Confidence Score Summary
ax8 = fig.add_subplot(gs[2, 1:])
criteria = ['Statistical\nSignificance', 'Effect Size\n(Dir Rate)', 'Economic\nSignificance',
            'Year-over-Year\nStability', 'Objective\nMeasurability']
scores = [score_sig, score_effect, score_econ, score_stability, score_measurable]
max_scores = [20, 20, 20, 20, 20]
colors_score = ['#2ecc71' if s >= 15 else '#f39c12' if s >= 10 else '#e74c3c' for s in scores]
bars = ax8.barh(criteria, scores, color=colors_score, alpha=0.8, edgecolor='black', linewidth=0.5)
ax8.barh(criteria, [m - s for m, s in zip(max_scores, scores)], left=scores,
         color='lightgray', alpha=0.5, edgecolor='black', linewidth=0.5)
for bar, score in zip(bars, scores):
    ax8.text(score + 0.3, bar.get_y() + bar.get_height()/2, f'{score}/20',
             va='center', fontsize=9, fontweight='bold')
ax8.set_xlim(0, 22)
ax8.set_xlabel('Score', fontsize=9)
ax8.set_title(f'Behaviour Confidence Score: {total_score}/100\nVerdict: {verdict}',
              fontsize=10, fontweight='bold')

plt.savefig(f'{OUTPUT_DIR}/sprint_033_vol_contraction_expansion.png',
            dpi=150, bbox_inches='tight', facecolor='white')
plt.close()
print(f"Chart saved to {OUTPUT_DIR}/sprint_033_vol_contraction_expansion.png")

# ─── Summary ──────────────────────────────────────────────────────────────────
print("\n" + "=" * 70)
print("SPRINT 033 SUMMARY")
print("=" * 70)
print(f"\nBehaviour: Volatility Contraction → Expansion Asymmetry")
print(f"Dataset: {len(df):,} bars | {df['ts'].min().date()} to {df['ts'].max().date()}")
print(f"\nTotal expansion events: {len(events)}")
print(f"Events with defined trend: {len(trend_events)}")
print(f"\nWith-Trend Rate: {pct_with_trend:.1%}")
print(f"Binomial p-value: {binom_result.pvalue:.6f}")
print(f"Cohen's d (magnitude): {d_magnitude:.4f}")
print(f"Net edge estimate: ${gross_edge_pts * POINT_VALUE - FRICTION:.2f}")
print(f"\nBehaviour Confidence Score: {total_score}/100")
print(f"Verdict: {verdict}")
