"""
DARWIN-SWEEP-001 Validation Script
Liquidity sweep + reclaim on MNQ 5m bars.
Pre-registration SHA: a3c6303d5d8c535d8567c35d413abcc5ce51aac6

ALL parameters frozen from pre-registration. No post-hoc modification.
"""

import pandas as pd
import numpy as np
from scipy import stats
import json
from datetime import datetime, timezone
import warnings
warnings.filterwarnings('ignore')

DATA_PATH   = '/home/ubuntu/atlas-historical/canonical/mnq_5m_full_2019_2026.parquet'
OUTPUT_JSON = '/home/ubuntu/atlas-nexus/sprint-artefacts-sweep001/DARWIN_SWEEP001_RESULTS.json'

# Pre-registered constants
TOLERANCES     = [0.3, 0.5, 0.75]   # ATR14 multiples
HOLD_BARS      = {1: 5, 2: 15}
COST_SCENARIOS = {'BASE': 2.47, 'STRESSED': 3.09, 'SEVERE': 3.71}
BOOTSTRAP_N    = 1000
BH_Q           = 0.05

# RTH session: 13:30–20:00 UTC
RTH_START_H, RTH_START_M = 13, 30
RTH_END_H,   RTH_END_M   = 20, 0

# Chronological partitions
DISCOVERY_END  = pd.Timestamp('2024-01-01')
VALIDATION_END = pd.Timestamp('2025-07-01')

print("Loading data...")
df = pd.read_parquet(DATA_PATH)
df = df.sort_values('bar_time').reset_index(drop=True)
df['bar_time'] = pd.to_datetime(df['bar_time'], utc=True)
print(f"Bars: {len(df):,}  |  {df['bar_time'].iloc[0]} → {df['bar_time'].iloc[-1]}")

# ── Compute prior RTH session high/low for each bar ──────────────────────────
# Mark RTH bars
df['is_rth'] = (
    (df['bar_time'].dt.hour * 60 + df['bar_time'].dt.minute >= RTH_START_H * 60 + RTH_START_M) &
    (df['bar_time'].dt.hour * 60 + df['bar_time'].dt.minute < RTH_END_H * 60 + RTH_END_M)
)
df['date_utc'] = df['bar_time'].dt.date

# Build daily RTH session high/low lookup
rth_bars = df[df['is_rth']].copy()
daily_rth = rth_bars.groupby('date_utc').agg(
    session_high=('high', 'max'),
    session_low=('low', 'min')
).reset_index()
daily_rth['prev_date'] = daily_rth['date_utc'].shift(-1)  # next day uses today's session

# Map: for each bar, what was the PRIOR RTH session high/low?
# Prior = the most recent completed RTH session before this bar's date
date_to_prev_high = {}
date_to_prev_low  = {}
dates_sorted = sorted(daily_rth['date_utc'].tolist())
for i, d in enumerate(dates_sorted):
    if i > 0:
        prev_d = dates_sorted[i - 1]
        row = daily_rth[daily_rth['date_utc'] == prev_d]
        if len(row):
            date_to_prev_high[d] = float(row['session_high'].iloc[0])
            date_to_prev_low[d]  = float(row['session_low'].iloc[0])

df['prev_rth_high'] = df['date_utc'].map(date_to_prev_high)
df['prev_rth_low']  = df['date_utc'].map(date_to_prev_low)

# Drop bars with no prior session data (first day)
df = df.dropna(subset=['prev_rth_high', 'prev_rth_low']).reset_index(drop=True)
print(f"Bars with prior session data: {len(df):,}")

closes     = df['close'].values
highs      = df['high'].values
lows       = df['low'].values
atr14      = df['atr14'].values
sessions   = df['session'].values
bar_times  = df['bar_time'].values
prev_highs = df['prev_rth_high'].values
prev_lows  = df['prev_rth_low'].values
hours_utc  = df['bar_time'].dt.hour.values
minutes_utc = df['bar_time'].dt.minute.values
n = len(df)

def bootstrap_ci(returns, n_boot=BOOTSTRAP_N):
    if len(returns) < 10:
        return (np.nan, np.nan)
    boot = np.random.choice(returns, size=(n_boot, len(returns)), replace=True)
    means = boot.mean(axis=1)
    return (float(np.percentile(means, 2.5)), float(np.percentile(means, 97.5)))

def bh_fdr_correct(pvals, q=BH_Q):
    pvals = np.array(pvals)
    n = len(pvals)
    if n == 0:
        return np.array([], dtype=bool)
    order = np.argsort(pvals)
    reject_ordered = pvals[order] <= (np.arange(1, n + 1) / n * q)
    if reject_ordered.any():
        last = np.where(reject_ordered)[0][-1]
        reject_ordered[:last + 1] = True
    result = np.zeros(n, dtype=bool)
    result[order] = reject_ordered
    return result

def analyse_subgroup(raw_returns, label, cost_pts):
    if len(raw_returns) < 20:
        return None
    net = raw_returns - cost_pts
    mean_net = float(np.mean(net))
    win_rate = float(np.mean(net > 0))
    winners = net[net > 0]
    losers  = net[net < 0]
    pf = float(winners.sum() / abs(losers.sum())) if len(losers) > 0 and losers.sum() != 0 else np.nan
    t_stat, p_val = stats.ttest_1samp(net, 0)
    ci_lo, ci_hi = bootstrap_ci(net)
    return {
        'label': label,
        'n': int(len(net)),
        'mean_net': round(mean_net, 4),
        'win_rate': round(win_rate, 4),
        'profit_factor': round(pf, 3) if not np.isnan(pf) else None,
        't_stat': round(float(t_stat), 4),
        'p_value': round(float(p_val), 6),
        'ci_95_lo': round(ci_lo, 4) if not np.isnan(ci_lo) else None,
        'ci_95_hi': round(ci_hi, 4) if not np.isnan(ci_hi) else None,
    }

all_results = []

for tol in TOLERANCES:
    print(f"\nTolerance: {tol}x ATR14")

    # Sweep-high: high > prev_rth_high AND high <= prev_rth_high + tol*atr14 AND close < prev_rth_high
    sweep_high_mask = (
        (highs > prev_highs) &
        (highs <= prev_highs + tol * atr14) &
        (closes < prev_highs) &
        (np.arange(n) >= 50)
    )
    # Sweep-low: low < prev_rth_low AND low >= prev_rth_low - tol*atr14 AND close > prev_rth_low
    sweep_low_mask = (
        (lows < prev_lows) &
        (lows >= prev_lows - tol * atr14) &
        (closes > prev_lows) &
        (np.arange(n) >= 50)
    )

    sweep_high_idx = np.where(sweep_high_mask)[0]
    sweep_low_idx  = np.where(sweep_low_mask)[0]
    print(f"  Sweep-high signals: {len(sweep_high_idx)}, Sweep-low signals: {len(sweep_low_idx)}")

    # Entry A: close of signal bar
    # SHORT on sweep-high reclaim: return = entry - exit (price falls)
    # LONG on sweep-low reclaim:   return = exit - entry (price rises)

    for exit_id, hold in HOLD_BARS.items():
        # Sweep-high → SHORT
        valid_h = sweep_high_idx[sweep_high_idx + hold < n]
        entry_h = closes[valid_h]
        exit_h  = closes[valid_h + hold]
        raw_short = entry_h - exit_h   # positive if price fell (SHORT wins)

        # Sweep-low → LONG
        valid_l = sweep_low_idx[sweep_low_idx + hold < n]
        entry_l = closes[valid_l]
        exit_l  = closes[valid_l + hold]
        raw_long = exit_l - entry_l    # positive if price rose (LONG wins)

        raw_all = np.concatenate([raw_short, raw_long])
        all_idx = np.concatenate([valid_h, valid_l])
        sig_times = pd.to_datetime(bar_times[all_idx])

        disc_mask  = sig_times < DISCOVERY_END
        val_mask   = (sig_times >= DISCOVERY_END) & (sig_times < VALIDATION_END)
        hold_mask  = sig_times >= VALIDATION_END

        # Session masks
        sess_arr = sessions[all_idx]
        rth_mask_sig = sess_arr == 'RTH'
        eth_mask_sig = ~rth_mask_sig

        # Time of day for RTH signals
        h_arr = hours_utc[all_idx]
        m_arr = minutes_utc[all_idx]
        tod_min = h_arr * 60 + m_arr
        early_rth = (tod_min >= 810) & (tod_min < 930)   # 13:30–15:30 UTC
        mid_rth   = (tod_min >= 930) & (tod_min < 1110)  # 15:30–18:30 UTC
        late_rth  = (tod_min >= 1110) & (tod_min < 1200) # 18:30–20:00 UTC

        for cost_name, cost_pts in COST_SCENARIOS.items():
            subgroups = []

            # Full
            r = analyse_subgroup(raw_all, 'ALL', cost_pts)
            if r: subgroups.append(r)

            # Partitions
            for part_label, mask in [('DISCOVERY', np.array(disc_mask)), ('VALIDATION', np.array(val_mask)), ('HOLDOUT', np.array(hold_mask))]:
                r = analyse_subgroup(raw_all[mask], part_label, cost_pts)
                if r: subgroups.append(r)

            # Direction
            r = analyse_subgroup(raw_short[:len(valid_h)], 'SHORT_SWEEP_HIGH', cost_pts)
            if r: subgroups.append(r)
            r = analyse_subgroup(raw_long[:len(valid_l)], 'LONG_SWEEP_LOW', cost_pts)
            if r: subgroups.append(r)

            # Session
            r = analyse_subgroup(raw_all[rth_mask_sig], 'RTH', cost_pts)
            if r: subgroups.append(r)
            r = analyse_subgroup(raw_all[eth_mask_sig], 'ETH', cost_pts)
            if r: subgroups.append(r)

            # Time of day
            r = analyse_subgroup(raw_all[early_rth], 'EARLY_RTH', cost_pts)
            if r: subgroups.append(r)
            r = analyse_subgroup(raw_all[mid_rth], 'MID_RTH', cost_pts)
            if r: subgroups.append(r)
            r = analyse_subgroup(raw_all[late_rth], 'LATE_RTH', cost_pts)
            if r: subgroups.append(r)

            # Year-by-year
            years = sig_times.year
            for yr in sorted(years.unique()):
                r = analyse_subgroup(raw_all[years == yr], f'YEAR_{yr}', cost_pts)
                if r: subgroups.append(r)

            # BH-FDR
            pvals = [s['p_value'] for s in subgroups]
            reject_flags = bh_fdr_correct(pvals)
            for i, sg in enumerate(subgroups):
                sg['bh_fdr_significant'] = bool(reject_flags[i])
                sg['bh_fdr_direction'] = ('POSITIVE' if sg['mean_net'] > 0 and reject_flags[i]
                                          else 'NEGATIVE' if sg['mean_net'] < 0 and reject_flags[i]
                                          else 'NS')

            # Classify
            disc_sg = next((s for s in subgroups if s['label'] == 'DISCOVERY'), None)
            val_sg  = next((s for s in subgroups if s['label'] == 'VALIDATION'), None)
            full_sg = next((s for s in subgroups if s['label'] == 'ALL'), None)

            classification = 'INCONCLUSIVE'
            if disc_sg and val_sg and full_sg:
                if (disc_sg['mean_net'] > 0 and disc_sg['p_value'] < 0.05 and
                    val_sg['mean_net'] > 0 and val_sg['p_value'] < 0.10 and
                    disc_sg['win_rate'] > 0.50 and val_sg['win_rate'] > 0.50):
                    classification = 'PROMISING'
                elif full_sg['mean_net'] < 0 and full_sg['p_value'] < 0.05:
                    classification = 'NEGATIVE_EDGE'

            combo = f"tol={tol}_exit={exit_id}_cost={cost_name}"
            fn = full_sg or {}
            print(f"    {combo}: n={len(raw_all)}, mean_net={fn.get('mean_net','?'):.4f}, wr={fn.get('win_rate','?'):.3f}, p={fn.get('p_value','?'):.4f} → {classification}")

            all_results.append({
                'combo': combo,
                'tolerance': tol,
                'exit_id': exit_id,
                'hold_bars': hold,
                'cost_scenario': cost_name,
                'cost_pts': cost_pts,
                'n_sweep_high': int(len(valid_h)),
                'n_sweep_low': int(len(valid_l)),
                'n_total': int(len(raw_all)),
                'classification': classification,
                'subgroups': subgroups
            })

# Summary
print("\n=== SUMMARY ===")
from collections import Counter
class_counts = Counter(r['classification'] for r in all_results)
print(f"Total combinations: {len(all_results)}")
for k, v in sorted(class_counts.items()):
    print(f"  {k}: {v}")

promising = [r for r in all_results if r['classification'] == 'PROMISING']
if promising:
    print("\nPROMISING combinations:")
    for r in promising:
        print(f"  {r['combo']}: n={r['n_total']}, mean_net={next(s for s in r['subgroups'] if s['label']=='ALL')['mean_net']:.4f}")

# Save
import os
os.makedirs('/home/ubuntu/atlas-nexus/sprint-artefacts-sweep001', exist_ok=True)
output = {
    'experiment_id': 'DARWIN-SWEEP-001',
    'preregistration_sha': 'a3c6303d5d8c535d8567c35d413abcc5ce51aac6',
    'run_timestamp': datetime.now(timezone.utc).isoformat(),
    'summary': dict(class_counts),
    'results': all_results
}
with open(OUTPUT_JSON, 'w') as f:
    json.dump(output, f, indent=2, default=str)
print(f"\nSaved: {OUTPUT_JSON}")
