"""
Atlas Sprint 032: Overnight Inventory Imbalance — Behavioural Validation Harness
=================================================================================
Research Stream: D — Component Intelligence
Objective: Determine whether overnight directional inventory imbalance has a
statistically significant, economically meaningful, and stable relationship
with RTH opening behaviour in MNQ futures.

This script does NOT design an execution model. It measures a market behaviour.

Session Definitions (Eastern Time):
  - Globex (Overnight): 18:00 ET (prior day) to 09:29 ET (current day)
  - RTH Open: 09:30 ET
  - RTH Morning: 09:30 ET to 12:00 ET
  - RTH PM: 13:00 ET to 16:00 ET
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

# ─── Configuration ────────────────────────────────────────────────────────────
DATA_PATH = '/home/ubuntu/Project-Atlas/data/raw/massive/MNQ_5min_full.csv'
OUTPUT_DIR = '/home/ubuntu/Project-Atlas/research/sprint-032-charts'
TICK_VALUE = 0.50   # MNQ: $0.50 per tick
POINT_VALUE = 2.00  # MNQ: $2.00 per point
COMMISSION  = 1.00  # $1.00 per side (round trip = $2.00)
SLIPPAGE    = 0.50  # $0.50 per side (1 tick)
TOTAL_FRICTION = (COMMISSION + SLIPPAGE) * 2  # $3.00 round trip

import os
os.makedirs(OUTPUT_DIR, exist_ok=True)

# ─── Load Data ────────────────────────────────────────────────────────────────
print("=" * 70)
print("ATLAS SPRINT 032: OVERNIGHT INVENTORY IMBALANCE VALIDATION")
print("=" * 70)

df = pd.read_csv(DATA_PATH)
df['ts'] = pd.to_datetime(df['timestamp_et'], utc=True)
df['hour']   = df['ts'].dt.hour
df['minute'] = df['ts'].dt.minute
df['date_et'] = df['ts'].dt.date

# ─── Build Daily Session Records ──────────────────────────────────────────────
# For each RTH trading day, compute:
#   1. Globex net move: close of last Globex bar before RTH open minus
#      close of prior RTH session (16:00 ET close)
#   2. RTH morning direction: 09:30 open to 12:00 close
#   3. RTH full-day direction: 09:30 open to 16:00 close

def get_session_records(df):
    records = []
    dates = sorted(df['date_et'].unique())

    for i, rth_date in enumerate(dates):
        if i == 0:
            continue  # Need prior day for Globex reference

        prior_date = dates[i - 1]

        # ── Prior RTH close (16:00 bar on prior_date) ──────────────────────
        prior_rth = df[
            (df['date_et'] == prior_date) &
            (df['hour'] == 15) &
            (df['minute'] >= 55)
        ]
        if prior_rth.empty:
            continue
        prior_rth_close = prior_rth.iloc[-1]['close']

        # ── Globex session: 18:00 prior_date to 09:25 rth_date ─────────────
        globex_bars = df[
            (
                ((df['date_et'] == prior_date) & (df['hour'] >= 18)) |
                ((df['date_et'] == rth_date) & (df['hour'] < 9)) |
                ((df['date_et'] == rth_date) & (df['hour'] == 9) & (df['minute'] < 30))
            )
        ]
        if globex_bars.empty:
            continue
        globex_open  = globex_bars.iloc[0]['open']
        globex_close = globex_bars.iloc[-1]['close']
        globex_high  = globex_bars['high'].max()
        globex_low   = globex_bars['low'].min()
        globex_range = globex_high - globex_low
        globex_net   = globex_close - prior_rth_close  # Net move from prior RTH close

        # ── RTH Open bar (09:30) ────────────────────────────────────────────
        rth_open_bar = df[
            (df['date_et'] == rth_date) &
            (df['hour'] == 9) &
            (df['minute'] == 30)
        ]
        if rth_open_bar.empty:
            continue
        rth_open = rth_open_bar.iloc[0]['open']

        # ── RTH Morning close (12:00) ───────────────────────────────────────
        rth_morning = df[
            (df['date_et'] == rth_date) &
            (df['hour'] == 11) &
            (df['minute'] >= 55)
        ]
        if rth_morning.empty:
            continue
        rth_morning_close = rth_morning.iloc[-1]['close']
        rth_morning_net   = rth_morning_close - rth_open

        # ── RTH Full-day close (16:00) ──────────────────────────────────────
        rth_close_bar = df[
            (df['date_et'] == rth_date) &
            (df['hour'] == 15) &
            (df['minute'] >= 55)
        ]
        if rth_close_bar.empty:
            continue
        rth_day_close = rth_close_bar.iloc[-1]['close']
        rth_day_net   = rth_day_close - rth_open

        # ── ATR for the day (using prior 14 bars of daily range) ───────────
        day_range = df[
            (df['date_et'] == rth_date) &
            (df['hour'] >= 9) & (df['hour'] < 16)
        ]
        day_atr = day_range['high'].max() - day_range['low'].min() if not day_range.empty else np.nan

        # ── ADX proxy: use prior day's directional move ─────────────────────
        prior_rth_bars = df[
            (df['date_et'] == prior_date) &
            (df['hour'] >= 9) & (df['hour'] < 16)
        ]
        prior_day_range = prior_rth_bars['high'].max() - prior_rth_bars['low'].min() if not prior_rth_bars.empty else np.nan
        prior_day_net   = prior_rth_bars.iloc[-1]['close'] - prior_rth_bars.iloc[0]['open'] if not prior_rth_bars.empty else np.nan

        records.append({
            'date':              rth_date,
            'year':              rth_date.year,
            'month':             rth_date.month,
            'prior_rth_close':   prior_rth_close,
            'globex_open':       globex_open,
            'globex_close':      globex_close,
            'globex_high':       globex_high,
            'globex_low':        globex_low,
            'globex_range':      globex_range,
            'globex_net':        globex_net,           # Key independent variable
            'rth_open':          rth_open,
            'gap':               rth_open - prior_rth_close,  # Gap at open
            'rth_morning_net':   rth_morning_net,      # Key dependent variable (AM)
            'rth_day_net':       rth_day_net,           # Secondary dependent variable
            'day_atr':           day_atr,
            'prior_day_range':   prior_day_range,
            'prior_day_net':     prior_day_net,
        })

    return pd.DataFrame(records)

print("\nBuilding daily session records...")
daily = get_session_records(df)
print(f"Total trading days: {len(daily)}")
print(f"Date range: {daily['date'].min()} to {daily['date'].max()}")
print(f"Year 1 days: {len(daily[daily['year'] == 2024]) + len(daily[daily['year'] == 2025])}")
print(f"Year 2 days: {len(daily[daily['year'] == 2026])}")

# ─── Q1: Does the Behaviour Exist? ────────────────────────────────────────────
print("\n" + "=" * 70)
print("Q1: DOES THE BEHAVIOUR EXIST?")
print("=" * 70)

# Pearson correlation: Globex net vs RTH morning net
r_morning, p_morning = stats.pearsonr(daily['globex_net'], daily['rth_morning_net'])
r_day, p_day         = stats.pearsonr(daily['globex_net'], daily['rth_day_net'])
r_gap_morning, p_gap = stats.pearsonr(daily['gap'], daily['rth_morning_net'])

print(f"\nCorrelation: Globex Net → RTH Morning Net")
print(f"  Pearson r = {r_morning:.4f}, p = {p_morning:.6f}")
print(f"  Significant at 5%: {'YES' if p_morning < 0.05 else 'NO'}")
print(f"  Significant at 1%: {'YES' if p_morning < 0.01 else 'NO'}")

print(f"\nCorrelation: Globex Net → RTH Full-Day Net")
print(f"  Pearson r = {r_day:.4f}, p = {p_day:.6f}")
print(f"  Significant at 5%: {'YES' if p_day < 0.05 else 'NO'}")

print(f"\nCorrelation: Gap → RTH Morning Net")
print(f"  Pearson r = {r_gap_morning:.4f}, p = {p_gap:.6f}")
print(f"  Significant at 5%: {'YES' if p_gap < 0.05 else 'NO'}")

# Directional agreement: does Globex direction predict RTH morning direction?
daily['globex_dir']  = np.sign(daily['globex_net'])
daily['morning_dir'] = np.sign(daily['rth_morning_net'])
daily['day_dir']     = np.sign(daily['rth_day_net'])

# Only count non-flat days
valid = daily[(daily['globex_dir'] != 0) & (daily['morning_dir'] != 0)]
agree_morning = (valid['globex_dir'] == valid['morning_dir']).mean()
n_valid = len(valid)

# Binomial test: is directional agreement significantly different from 50%?
n_agree = (valid['globex_dir'] == valid['morning_dir']).sum()
binom_result = stats.binomtest(n_agree, n_valid, 0.5, alternative='two-sided')

print(f"\nDirectional Agreement: Globex → RTH Morning")
print(f"  Days with clear direction: {n_valid}")
print(f"  Agreement rate: {agree_morning:.1%}")
print(f"  Binomial test p-value: {binom_result.pvalue:.6f}")
print(f"  Significant at 5%: {'YES' if binom_result.pvalue < 0.05 else 'NO'}")

# ─── Q2: Is the Effect Economically Meaningful? ───────────────────────────────
print("\n" + "=" * 70)
print("Q2: IS THE EFFECT ECONOMICALLY MEANINGFUL?")
print("=" * 70)

# Partition by Globex direction and measure RTH morning outcome
bullish_globex = daily[daily['globex_net'] > 0]
bearish_globex = daily[daily['globex_net'] < 0]

print(f"\nGlobex Bullish Days ({len(bullish_globex)} days):")
print(f"  Avg RTH Morning Net: {bullish_globex['rth_morning_net'].mean():.2f} pts ({bullish_globex['rth_morning_net'].mean() * POINT_VALUE:.2f} USD)")
print(f"  Median RTH Morning Net: {bullish_globex['rth_morning_net'].median():.2f} pts")
print(f"  RTH Morning Positive: {(bullish_globex['rth_morning_net'] > 0).mean():.1%}")

print(f"\nGlobex Bearish Days ({len(bearish_globex)} days):")
print(f"  Avg RTH Morning Net: {bearish_globex['rth_morning_net'].mean():.2f} pts ({bearish_globex['rth_morning_net'].mean() * POINT_VALUE:.2f} USD)")
print(f"  Median RTH Morning Net: {bearish_globex['rth_morning_net'].median():.2f} pts")
print(f"  RTH Morning Positive: {(bearish_globex['rth_morning_net'] > 0).mean():.1%}")

# Effect size: Cohen's d
d_morning = (bullish_globex['rth_morning_net'].mean() - bearish_globex['rth_morning_net'].mean()) / \
            daily['rth_morning_net'].std()
print(f"\nEffect Size (Cohen's d): {d_morning:.4f}")
print(f"  Interpretation: {'Small (<0.2)' if abs(d_morning) < 0.2 else 'Medium (0.2-0.5)' if abs(d_morning) < 0.5 else 'Large (>0.5)'}")

# Economic significance: if we could trade the direction, what is the gross edge?
# Assuming we enter at RTH open and exit at 12:00
direction_edge = abs(bullish_globex['rth_morning_net'].mean() - bearish_globex['rth_morning_net'].mean())
print(f"\nGross directional edge (before costs): {direction_edge:.2f} pts = ${direction_edge * POINT_VALUE:.2f}")
print(f"Round-trip friction: ${TOTAL_FRICTION:.2f}")
print(f"Net edge estimate: ${direction_edge * POINT_VALUE - TOTAL_FRICTION:.2f}")

# ─── Q3: Is the Behaviour Stable? ─────────────────────────────────────────────
print("\n" + "=" * 70)
print("Q3: IS THE BEHAVIOUR STABLE?")
print("=" * 70)

# Year-by-year stability
for year in sorted(daily['year'].unique()):
    yr = daily[daily['year'] == year]
    if len(yr) < 20:
        continue
    r, p = stats.pearsonr(yr['globex_net'], yr['rth_morning_net'])
    valid_yr = yr[(yr['globex_dir'] != 0) & (yr['morning_dir'] != 0)]
    agree = (valid_yr['globex_dir'] == valid_yr['morning_dir']).mean() if len(valid_yr) > 0 else 0
    print(f"\n  Year {year} ({len(yr)} days):")
    print(f"    Pearson r = {r:.4f}, p = {p:.4f}")
    print(f"    Directional agreement = {agree:.1%}")

# Volatility regime stability
daily['atr_quartile'] = pd.qcut(daily['day_atr'].dropna(), q=4, labels=['Q1 Low', 'Q2', 'Q3', 'Q4 High'], duplicates='drop')
print(f"\nStability by ATR Regime:")
for q in ['Q1 Low', 'Q2', 'Q3', 'Q4 High']:
    subset = daily[daily['atr_quartile'] == q]
    if len(subset) < 10:
        continue
    r, p = stats.pearsonr(subset['globex_net'], subset['rth_morning_net'])
    valid_s = subset[(subset['globex_dir'] != 0) & (subset['morning_dir'] != 0)]
    agree = (valid_s['globex_dir'] == valid_s['morning_dir']).mean() if len(valid_s) > 0 else 0
    print(f"  {q} ({len(subset)} days): r={r:.4f}, p={p:.4f}, dir_agree={agree:.1%}")

# Globex magnitude buckets
daily['globex_magnitude'] = pd.qcut(daily['globex_net'].abs(), q=4,
                                     labels=['Q1 Small', 'Q2', 'Q3', 'Q4 Large'], duplicates='drop')
print(f"\nStability by Globex Imbalance Magnitude:")
for q in ['Q1 Small', 'Q2', 'Q3', 'Q4 Large']:
    subset = daily[daily['globex_magnitude'] == q]
    if len(subset) < 10:
        continue
    valid_s = subset[(subset['globex_dir'] != 0) & (subset['morning_dir'] != 0)]
    agree = (valid_s['globex_dir'] == valid_s['morning_dir']).mean() if len(valid_s) > 0 else 0
    avg_morning = subset['rth_morning_net'].mean()
    print(f"  {q} ({len(subset)} days): dir_agree={agree:.1%}, avg_morning={avg_morning:.2f} pts")

# ─── Q4: Can the Behaviour Be Exploited Objectively? ─────────────────────────
print("\n" + "=" * 70)
print("Q4: CAN THE BEHAVIOUR BE EXPLOITED OBJECTIVELY?")
print("=" * 70)

print(f"\nSignal Frequency:")
print(f"  Total days in dataset: {len(daily)}")
print(f"  Days with clear Globex direction: {len(daily[daily['globex_dir'] != 0])}")
print(f"  Estimated signals per week: {len(daily[daily['globex_dir'] != 0]) / (len(daily) / 5):.1f}")

print(f"\nExpected Holding Time:")
print(f"  Entry: RTH Open (09:30 ET)")
print(f"  Exit: 12:00 ET (2.5 hours)")
print(f"  Bars held: ~30 bars (5-min)")

print(f"\nExpected Directional Bias:")
bull_days = daily[daily['globex_net'] > 0]
bear_days = daily[daily['globex_net'] < 0]
print(f"  Globex Bullish days: {len(bull_days)} ({len(bull_days)/len(daily):.1%})")
print(f"  Globex Bearish days: {len(bear_days)} ({len(bear_days)/len(daily):.1%})")
print(f"  Flat Globex days: {len(daily[daily['globex_net'] == 0])} ({len(daily[daily['globex_net'] == 0])/len(daily):.1%})")

# ─── Behaviour Confidence Score ───────────────────────────────────────────────
print("\n" + "=" * 70)
print("BEHAVIOUR CONFIDENCE SCORE")
print("=" * 70)

# Scoring criteria (0-20 each):
# 1. Statistical significance (p-value)
# 2. Effect size (Cohen's d)
# 3. Directional agreement rate
# 4. Year-over-year stability
# 5. Economic significance after costs

score_sig = 20 if p_morning < 0.001 else 15 if p_morning < 0.01 else 10 if p_morning < 0.05 else 0
score_effect = 20 if abs(d_morning) > 0.5 else 15 if abs(d_morning) > 0.3 else 10 if abs(d_morning) > 0.2 else 5
score_dir = 20 if agree_morning > 0.60 else 15 if agree_morning > 0.55 else 10 if agree_morning > 0.52 else 0
# Year stability: check if both years show positive r
yr_scores = []
for year in sorted(daily['year'].unique()):
    yr = daily[daily['year'] == year]
    if len(yr) < 20:
        continue
    r, p = stats.pearsonr(yr['globex_net'], yr['rth_morning_net'])
    yr_scores.append(r > 0)
score_stability = 20 if all(yr_scores) else 10 if any(yr_scores) else 0
net_edge = direction_edge * POINT_VALUE - TOTAL_FRICTION
score_economic = 20 if net_edge > 10 else 15 if net_edge > 5 else 10 if net_edge > 0 else 0

total_score = score_sig + score_effect + score_dir + score_stability + score_economic

print(f"\n  Statistical Significance:  {score_sig}/20")
print(f"  Effect Size:               {score_effect}/20")
print(f"  Directional Agreement:     {score_dir}/20")
print(f"  Year-over-Year Stability:  {score_stability}/20")
print(f"  Economic Significance:     {score_economic}/20")
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
fig.suptitle('Atlas Sprint 032: Overnight Inventory Imbalance Validation\nMNQ Futures — 2-Year Dataset', 
             fontsize=14, fontweight='bold', y=0.98)
gs = gridspec.GridSpec(3, 3, figure=fig, hspace=0.45, wspace=0.35)

# 1. Scatter: Globex Net vs RTH Morning Net
ax1 = fig.add_subplot(gs[0, 0])
colors = ['#2ecc71' if x > 0 else '#e74c3c' for x in daily['globex_net']]
ax1.scatter(daily['globex_net'], daily['rth_morning_net'], alpha=0.4, s=12, c=colors)
m, b = np.polyfit(daily['globex_net'], daily['rth_morning_net'], 1)
x_line = np.linspace(daily['globex_net'].min(), daily['globex_net'].max(), 100)
ax1.plot(x_line, m * x_line + b, 'navy', linewidth=2)
ax1.axhline(0, color='gray', linewidth=0.5)
ax1.axvline(0, color='gray', linewidth=0.5)
ax1.set_xlabel('Globex Net Move (pts)', fontsize=9)
ax1.set_ylabel('RTH Morning Net (pts)', fontsize=9)
ax1.set_title(f'Scatter: Globex vs RTH Morning\nr={r_morning:.3f}, p={p_morning:.4f}', fontsize=9)

# 2. Directional agreement bar chart
ax2 = fig.add_subplot(gs[0, 1])
categories = ['Globex Bull\n→ RTH Bull', 'Globex Bull\n→ RTH Bear', 
              'Globex Bear\n→ RTH Bear', 'Globex Bear\n→ RTH Bull']
bull_bull = len(daily[(daily['globex_dir'] > 0) & (daily['morning_dir'] > 0)])
bull_bear = len(daily[(daily['globex_dir'] > 0) & (daily['morning_dir'] < 0)])
bear_bear = len(daily[(daily['globex_dir'] < 0) & (daily['morning_dir'] < 0)])
bear_bull = len(daily[(daily['globex_dir'] < 0) & (daily['morning_dir'] > 0)])
values = [bull_bull, bull_bear, bear_bear, bear_bull]
bar_colors = ['#2ecc71', '#e74c3c', '#2ecc71', '#e74c3c']
bars = ax2.bar(categories, values, color=bar_colors, alpha=0.8, edgecolor='black', linewidth=0.5)
for bar, val in zip(bars, values):
    ax2.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 0.5, str(val), 
             ha='center', va='bottom', fontsize=8)
ax2.set_title(f'Directional Agreement\n{agree_morning:.1%} alignment rate', fontsize=9)
ax2.set_ylabel('Days', fontsize=9)
ax2.tick_params(axis='x', labelsize=7)

# 3. Year-by-year correlation
ax3 = fig.add_subplot(gs[0, 2])
year_rs = []
year_ps = []
year_agrees = []
year_labels = []
for year in sorted(daily['year'].unique()):
    yr = daily[daily['year'] == year]
    if len(yr) < 20:
        continue
    r_yr, p_yr = stats.pearsonr(yr['globex_net'], yr['rth_morning_net'])
    valid_yr = yr[(yr['globex_dir'] != 0) & (yr['morning_dir'] != 0)]
    agree_yr = (valid_yr['globex_dir'] == valid_yr['morning_dir']).mean() if len(valid_yr) > 0 else 0
    year_rs.append(r_yr)
    year_ps.append(p_yr)
    year_agrees.append(agree_yr)
    year_labels.append(str(year))

x = np.arange(len(year_labels))
width = 0.35
bars1 = ax3.bar(x - width/2, year_rs, width, label='Pearson r', color='steelblue', alpha=0.8)
ax3.set_xticks(x)
ax3.set_xticklabels(year_labels, fontsize=9)
ax3.set_ylabel('Pearson r', fontsize=9, color='steelblue')
ax3.tick_params(axis='y', labelcolor='steelblue')
ax3_twin = ax3.twinx()
bars2 = ax3_twin.bar(x + width/2, [a * 100 for a in year_agrees], width, 
                      label='Dir. Agree %', color='coral', alpha=0.8)
ax3_twin.set_ylabel('Directional Agreement %', fontsize=9, color='coral')
ax3_twin.tick_params(axis='y', labelcolor='coral')
ax3.axhline(0, color='gray', linewidth=0.5)
ax3.set_title('Year-by-Year Stability', fontsize=9)

# 4. Distribution of RTH morning net by Globex direction
ax4 = fig.add_subplot(gs[1, 0])
ax4.hist(bullish_globex['rth_morning_net'], bins=30, alpha=0.6, color='#2ecc71', 
         label=f'Globex Bull (n={len(bullish_globex)})', density=True)
ax4.hist(bearish_globex['rth_morning_net'], bins=30, alpha=0.6, color='#e74c3c', 
         label=f'Globex Bear (n={len(bearish_globex)})', density=True)
ax4.axvline(bullish_globex['rth_morning_net'].mean(), color='darkgreen', linewidth=2, linestyle='--')
ax4.axvline(bearish_globex['rth_morning_net'].mean(), color='darkred', linewidth=2, linestyle='--')
ax4.axvline(0, color='black', linewidth=1)
ax4.set_xlabel('RTH Morning Net (pts)', fontsize=9)
ax4.set_ylabel('Density', fontsize=9)
ax4.set_title('RTH Morning Distribution\nby Globex Direction', fontsize=9)
ax4.legend(fontsize=7)

# 5. Globex magnitude vs RTH morning outcome
ax5 = fig.add_subplot(gs[1, 1])
magnitude_labels = ['Q1 Small', 'Q2', 'Q3', 'Q4 Large']
magnitude_agrees = []
magnitude_avg_morning = []
for q in magnitude_labels:
    subset = daily[daily['globex_magnitude'] == q]
    if len(subset) < 5:
        magnitude_agrees.append(0)
        magnitude_avg_morning.append(0)
        continue
    valid_s = subset[(subset['globex_dir'] != 0) & (subset['morning_dir'] != 0)]
    agree = (valid_s['globex_dir'] == valid_s['morning_dir']).mean() if len(valid_s) > 0 else 0
    magnitude_agrees.append(agree * 100)
    magnitude_avg_morning.append(abs(subset['rth_morning_net'].mean()))

x = np.arange(len(magnitude_labels))
ax5.bar(x, magnitude_agrees, color='steelblue', alpha=0.8, edgecolor='black', linewidth=0.5)
ax5.axhline(50, color='red', linewidth=1, linestyle='--', label='50% (random)')
ax5.set_xticks(x)
ax5.set_xticklabels(magnitude_labels, fontsize=8)
ax5.set_ylabel('Directional Agreement %', fontsize=9)
ax5.set_title('Agreement by Globex\nImbalance Magnitude', fontsize=9)
ax5.legend(fontsize=7)

# 6. Monthly consistency
ax6 = fig.add_subplot(gs[1, 2])
monthly_r = []
monthly_labels = []
for (yr, mo), group in daily.groupby(['year', 'month']):
    if len(group) < 10:
        continue
    r_mo, p_mo = stats.pearsonr(group['globex_net'], group['rth_morning_net'])
    monthly_r.append(r_mo)
    monthly_labels.append(f"{yr}-{mo:02d}")

colors_mo = ['#2ecc71' if r > 0 else '#e74c3c' for r in monthly_r]
ax6.bar(range(len(monthly_r)), monthly_r, color=colors_mo, alpha=0.8, edgecolor='black', linewidth=0.3)
ax6.axhline(0, color='black', linewidth=1)
ax6.set_xticks(range(0, len(monthly_labels), max(1, len(monthly_labels)//6)))
ax6.set_xticklabels([monthly_labels[i] for i in range(0, len(monthly_labels), max(1, len(monthly_labels)//6))], 
                     fontsize=7, rotation=45)
ax6.set_ylabel('Pearson r', fontsize=9)
ax6.set_title(f'Monthly Correlation Stability\n({sum(r > 0 for r in monthly_r)}/{len(monthly_r)} months positive)', fontsize=9)

# 7. Scatter: Gap vs RTH Morning Net
ax7 = fig.add_subplot(gs[2, 0])
gap_colors = ['#2ecc71' if x > 0 else '#e74c3c' for x in daily['gap']]
ax7.scatter(daily['gap'], daily['rth_morning_net'], alpha=0.4, s=12, c=gap_colors)
m_g, b_g = np.polyfit(daily['gap'], daily['rth_morning_net'], 1)
x_line_g = np.linspace(daily['gap'].min(), daily['gap'].max(), 100)
ax7.plot(x_line_g, m_g * x_line_g + b_g, 'navy', linewidth=2)
ax7.axhline(0, color='gray', linewidth=0.5)
ax7.axvline(0, color='gray', linewidth=0.5)
ax7.set_xlabel('Gap at RTH Open (pts)', fontsize=9)
ax7.set_ylabel('RTH Morning Net (pts)', fontsize=9)
ax7.set_title(f'Gap vs RTH Morning\nr={r_gap_morning:.3f}, p={p_gap:.4f}', fontsize=9)

# 8. Confidence Score Summary
ax8 = fig.add_subplot(gs[2, 1:])
criteria = ['Statistical\nSignificance', 'Effect\nSize', 'Directional\nAgreement', 
            'Year-over-Year\nStability', 'Economic\nSignificance']
scores = [score_sig, score_effect, score_dir, score_stability, score_economic]
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

plt.savefig(f'{OUTPUT_DIR}/sprint_032_overnight_inventory_analysis.png', 
            dpi=150, bbox_inches='tight', facecolor='white')
plt.close()
print(f"Chart saved to {OUTPUT_DIR}/sprint_032_overnight_inventory_analysis.png")

# ─── Summary ──────────────────────────────────────────────────────────────────
print("\n" + "=" * 70)
print("SPRINT 032 SUMMARY")
print("=" * 70)
print(f"\nBehaviour: Overnight Inventory Imbalance Resolution")
print(f"Dataset: {len(daily)} trading days ({daily['date'].min()} to {daily['date'].max()})")
print(f"\nKey Statistics:")
print(f"  Pearson r (Globex Net → RTH Morning): {r_morning:.4f}")
print(f"  p-value: {p_morning:.6f}")
print(f"  Directional agreement: {agree_morning:.1%}")
print(f"  Cohen's d: {d_morning:.4f}")
print(f"  Gross edge: {direction_edge:.2f} pts = ${direction_edge * POINT_VALUE:.2f}")
print(f"  Net edge (after friction): ${direction_edge * POINT_VALUE - TOTAL_FRICTION:.2f}")
print(f"\nBehaviour Confidence Score: {total_score}/100")
print(f"Verdict: {verdict}")
