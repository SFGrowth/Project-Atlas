"""
DARWIN-MOM-EQ-001 Validation Script
Momentum continuation in direction of EMA21 extension on MNQ 5m bars.
Pre-registration SHA: a7a57ddd6e75fc06c703d9137ed3d24177a0045b

ALL parameters are frozen from pre-registration. No post-hoc modification.
"""

import pandas as pd
import numpy as np
from scipy import stats
import json
from datetime import datetime, timezone
import warnings
warnings.filterwarnings('ignore')

FEATURES_PATH = '/home/ubuntu/atlas-historical/canonical/mnq_5m_full_2019_2026.parquet'
OUTPUT_JSON   = '/home/ubuntu/atlas-nexus/sprint-artefacts-mom-eq001/DARWIN_MOM_EQ001_RESULTS.json'

# Pre-registered constants
THRESHOLDS    = [1.9, 2.0, 2.1]
HOLD_BARS     = {1: 5, 2: 15}           # Exit 1 = 5 bars, Exit 2 = 15 bars
COST_SCENARIOS = {'BASE': 2.47, 'STRESSED': 3.09, 'SEVERE': 3.71}
BOOTSTRAP_N   = 2000
BH_Q          = 0.05

# Chronological partitions (pre-registered)
DISCOVERY_END   = pd.Timestamp('2024-01-01')
VALIDATION_END  = pd.Timestamp('2025-07-01')
# HOLDOUT = 2025-07-01 onwards

print("Loading features parquet...")
df = pd.read_parquet(FEATURES_PATH)
df = df.sort_values('bar_time').reset_index(drop=True)
df['bar_time'] = pd.to_datetime(df['bar_time'], utc=True)

# Exclude degraded bars (column may not exist in this file)
if 'is_degraded' in df.columns:
    df = df[~df['is_degraded']].reset_index(drop=True)
print(f"Bars after degraded exclusion: {len(df):,}")
print(f"Date range: {df['bar_time'].iloc[0]} to {df['bar_time'].iloc[-1]}")

closes = df['close'].values
ema21  = df['ema21'].values
atr14  = df['atr14'].values
sessions = df['session'].values
ema_bull = df['ema_bullish'].values
ema_bear = df['ema_bearish'].values
bar_times = df['bar_time'].values

n = len(df)

def bootstrap_ci(returns, n_boot=BOOTSTRAP_N, ci=0.95):
    if len(returns) < 10:
        return (np.nan, np.nan)
    boot = np.random.choice(returns, size=(n_boot, len(returns)), replace=True)
    means = boot.mean(axis=1)
    lo = np.percentile(means, (1 - ci) / 2 * 100)
    hi = np.percentile(means, (1 + ci) / 2 * 100)
    return (float(lo), float(hi))

def bh_fdr_correct(pvals, q=BH_Q):
    """Benjamini-Hochberg FDR correction. Returns array of booleans (reject H0)."""
    pvals = np.array(pvals)
    n = len(pvals)
    if n == 0:
        return np.array([], dtype=bool)
    order = np.argsort(pvals)
    ranked = np.empty(n)
    ranked[order] = np.arange(1, n + 1)
    threshold = ranked / n * q
    reject = pvals <= threshold
    # Enforce monotonicity: if rank k is rejected, all ranks < k are too
    reject_ordered = pvals[order] <= (np.arange(1, n + 1) / n * q)
    if reject_ordered.any():
        last_reject = np.where(reject_ordered)[0][-1]
        reject_ordered[:last_reject + 1] = True
    result = np.zeros(n, dtype=bool)
    result[order] = reject_ordered
    return result

def analyse_subgroup(returns_raw, label, cost_pts):
    """Compute stats for a subgroup of raw (pre-cost) returns."""
    if len(returns_raw) < 20:
        return None
    net = returns_raw - cost_pts
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

for thresh in THRESHOLDS:
    print(f"\nThreshold: {thresh}x ATR14")

    # Signal detection: momentum continuation (enter IN DIRECTION of extension)
    # LONG: close >= ema21 + thresh * atr14
    # SHORT: close <= ema21 - thresh * atr14
    long_signals  = np.where((closes >= ema21 + thresh * atr14) & (np.arange(n) >= 50))[0]
    short_signals = np.where((closes <= ema21 - thresh * atr14) & (np.arange(n) >= 50))[0]
    all_signals   = np.concatenate([long_signals, short_signals])
    directions    = np.array(['LONG'] * len(long_signals) + ['SHORT'] * len(short_signals))
    print(f"  Signals: {len(long_signals)} LONG, {len(short_signals)} SHORT = {len(all_signals)} total")

    for exit_id, hold in HOLD_BARS.items():
        # Vectorised exit: entry at close of signal bar (Entry A)
        # Return = close[i+hold] - close[i]  (LONG) or close[i] - close[i+hold] (SHORT)
        valid_mask = all_signals + hold < n
        sig_valid  = all_signals[valid_mask]
        dir_valid  = directions[valid_mask]

        entry_prices = closes[sig_valid]
        exit_prices  = closes[sig_valid + hold]

        raw_long  = exit_prices[dir_valid == 'LONG']  - entry_prices[dir_valid == 'LONG']
        raw_short = entry_prices[dir_valid == 'SHORT'] - exit_prices[dir_valid == 'SHORT']
        raw_all   = np.concatenate([raw_long, raw_short])

        # Timestamps for partition splits
        sig_times = pd.to_datetime(bar_times[sig_valid])
        disc_mask  = sig_times < DISCOVERY_END
        val_mask   = (sig_times >= DISCOVERY_END) & (sig_times < VALIDATION_END)
        hold_mask  = sig_times >= VALIDATION_END

        # Session masks
        sess_valid = sessions[sig_valid]
        rth_mask   = sess_valid == 'RTH'
        eth_mask   = ~rth_mask

        # Trend masks
        bull_valid = ema_bull[sig_valid]
        bear_valid = ema_bear[sig_valid]
        with_trend_long  = (dir_valid == 'LONG')  & bull_valid.astype(bool)
        with_trend_short = (dir_valid == 'SHORT') & bear_valid.astype(bool)
        with_trend_mask  = with_trend_long | with_trend_short
        against_trend_mask = ~with_trend_mask

        for cost_name, cost_pts in COST_SCENARIOS.items():
            subgroups = []

            # Full
            r = analyse_subgroup(raw_all, f'ALL', cost_pts)
            if r: subgroups.append(r)

            # Partitions
            for part_label, mask in [('DISCOVERY', disc_mask), ('VALIDATION', val_mask), ('HOLDOUT', hold_mask)]:
                raw_part = np.concatenate([
                    raw_long[disc_mask[dir_valid == 'LONG'] if part_label == 'DISCOVERY' else
                             val_mask[dir_valid == 'LONG'] if part_label == 'VALIDATION' else
                             hold_mask[dir_valid == 'LONG']],
                    raw_short[disc_mask[dir_valid == 'SHORT'] if part_label == 'DISCOVERY' else
                              val_mask[dir_valid == 'SHORT'] if part_label == 'VALIDATION' else
                              hold_mask[dir_valid == 'SHORT']]
                ])
                r = analyse_subgroup(raw_part, part_label, cost_pts)
                if r: subgroups.append(r)

            # Direction
            r = analyse_subgroup(raw_long, 'LONG', cost_pts)
            if r: subgroups.append(r)
            r = analyse_subgroup(raw_short, 'SHORT', cost_pts)
            if r: subgroups.append(r)

            # Session
            raw_rth = np.concatenate([
                raw_long[rth_mask[dir_valid == 'LONG']],
                raw_short[rth_mask[dir_valid == 'SHORT']]
            ])
            raw_eth = np.concatenate([
                raw_long[eth_mask[dir_valid == 'LONG']],
                raw_short[eth_mask[dir_valid == 'SHORT']]
            ])
            r = analyse_subgroup(raw_rth, 'RTH', cost_pts)
            if r: subgroups.append(r)
            r = analyse_subgroup(raw_eth, 'ETH', cost_pts)
            if r: subgroups.append(r)

            # Trend alignment
            raw_with    = raw_all[with_trend_mask]
            raw_against = raw_all[against_trend_mask]
            r = analyse_subgroup(raw_with, 'WITH_TREND', cost_pts)
            if r: subgroups.append(r)
            r = analyse_subgroup(raw_against, 'AGAINST_TREND', cost_pts)
            if r: subgroups.append(r)

            # Year-by-year
            years = pd.to_datetime(bar_times[sig_valid]).year
            for yr in sorted(np.unique(years)):
                yr_mask = years == yr
                raw_yr = np.concatenate([
                    raw_long[yr_mask[dir_valid == 'LONG']],
                    raw_short[yr_mask[dir_valid == 'SHORT']]
                ])
                r = analyse_subgroup(raw_yr, f'YEAR_{yr}', cost_pts)
                if r: subgroups.append(r)

            # BH-FDR correction
            pvals = [s['p_value'] for s in subgroups]
            reject_flags = bh_fdr_correct(pvals)
            for i, sg in enumerate(subgroups):
                sg['bh_fdr_significant'] = bool(reject_flags[i])
                sg['bh_fdr_direction'] = 'POSITIVE' if (sg['mean_net'] > 0 and reject_flags[i]) else \
                                          'NEGATIVE' if (sg['mean_net'] < 0 and reject_flags[i]) else 'NS'

            # Classify
            all_sg = subgroups
            disc_sg = next((s for s in all_sg if s['label'] == 'DISCOVERY'), None)
            val_sg  = next((s for s in all_sg if s['label'] == 'VALIDATION'), None)
            full_sg = next((s for s in all_sg if s['label'] == 'ALL'), None)

            classification = 'INCONCLUSIVE'
            if disc_sg and val_sg and full_sg:
                if (disc_sg['mean_net'] > 0 and disc_sg['p_value'] < 0.05 and
                    val_sg['mean_net'] > 0 and val_sg['p_value'] < 0.10 and
                    disc_sg['win_rate'] > 0.50 and val_sg['win_rate'] > 0.50):
                    classification = 'PROMISING'
                elif full_sg['mean_net'] < 0 and full_sg['p_value'] < 0.05:
                    classification = 'NEGATIVE_EDGE'

            combo_key = f"thresh={thresh}_exit={exit_id}_cost={cost_name}"
            print(f"    {combo_key}: n={len(raw_all)}, mean_net={full_sg['mean_net'] if full_sg else 'N/A':.4f}, wr={full_sg['win_rate'] if full_sg else 'N/A':.3f}, p={full_sg['p_value'] if full_sg else 'N/A':.4f} → {classification}")

            all_results.append({
                'combo': combo_key,
                'threshold': thresh,
                'exit_id': exit_id,
                'hold_bars': hold,
                'cost_scenario': cost_name,
                'cost_pts': cost_pts,
                'n_signals': int(len(all_signals)),
                'n_valid': int(len(raw_all)),
                'classification': classification,
                'subgroups': all_sg
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
    print(f"\nPROMISING combinations:")
    for r in promising:
        print(f"  {r['combo']}")

# Save results
output = {
    'experiment_id': 'DARWIN-MOM-EQ-001',
    'preregistration_sha': 'a7a57ddd6e75fc06c703d9137ed3d24177a0045b',
    'run_timestamp': datetime.now(timezone.utc).isoformat(),
    'data_source': FEATURES_PATH,
    'summary': dict(class_counts),
    'results': all_results
}

import os
os.makedirs('/home/ubuntu/atlas-nexus/sprint-artefacts-mom-eq001', exist_ok=True)
with open(OUTPUT_JSON, 'w') as f:
    json.dump(output, f, indent=2, default=str)

print(f"\nResults saved to: {OUTPUT_JSON}")
