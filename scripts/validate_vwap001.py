"""
DARWIN-VWAP-001 Validation Script
VWAP deviation + reclaim on MNQ 5m bars.
Pre-registration SHA: 6b94edff05d509136e080cb044729f55a475214c
"""

import pandas as pd
import numpy as np
from scipy import stats
import json, os
from datetime import datetime, timezone
import warnings
warnings.filterwarnings('ignore')

DATA_PATH   = '/home/ubuntu/atlas-historical/canonical/mnq_5m_full_2019_2026.parquet'
OUTPUT_JSON = '/home/ubuntu/atlas-nexus/sprint-artefacts-vwap001/DARWIN_VWAP001_RESULTS.json'

DEV_THRESHOLDS = [1.0, 1.5, 2.0]
RECLAIM_THRESH = 0.5
HOLD_BARS      = {1: 5, 2: 15}
COST_SCENARIOS = {'BASE': 2.47, 'STRESSED': 3.09, 'SEVERE': 3.71}
BOOTSTRAP_N    = 1000
BH_Q           = 0.05
DISCOVERY_END  = pd.Timestamp('2024-01-01')
VALIDATION_END = pd.Timestamp('2025-07-01')

print("Loading data...")
df = pd.read_parquet(DATA_PATH)
df = df.sort_values('bar_time').reset_index(drop=True)
df['bar_time'] = pd.to_datetime(df['bar_time'], utc=True)
print(f"Bars: {len(df):,}")

closes   = df['close'].values
vwap     = df['vwap'].values
atr14    = df['atr14'].values
sessions = df['session'].values
bar_times = df['bar_time'].values
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
        'label': label, 'n': int(len(net)),
        'mean_net': round(mean_net, 4), 'win_rate': round(win_rate, 4),
        'profit_factor': round(pf, 3) if not np.isnan(pf) else None,
        't_stat': round(float(t_stat), 4), 'p_value': round(float(p_val), 6),
        'ci_95_lo': round(ci_lo, 4) if not np.isnan(ci_lo) else None,
        'ci_95_hi': round(ci_hi, 4) if not np.isnan(ci_hi) else None,
    }

all_results = []

for dev_thresh in DEV_THRESHOLDS:
    print(f"\nDeviation threshold: {dev_thresh}x ATR14")

    # Bar i: |close - vwap| > dev_thresh * atr14
    dev_above = (closes - vwap) > dev_thresh * atr14   # price above VWAP
    dev_below = (vwap - closes) > dev_thresh * atr14   # price below VWAP

    # Bar i+1: |close - vwap| < reclaim_thresh * atr14 (reclaim)
    # Shift by 1: reclaim[i] means bar i+1 reclaims
    reclaim = np.abs(closes - vwap) < RECLAIM_THRESH * atr14

    # Signal at bar i: deviation on bar i AND reclaim on bar i+1
    # SHORT: was above VWAP, reclaims → enter SHORT at close of bar i+1
    # LONG:  was below VWAP, reclaims → enter LONG at close of bar i+1
    short_signals = np.where(
        dev_above[:-1] & reclaim[1:] & (np.arange(n-1) >= 50)
    )[0] + 1   # +1 = index of reclaim bar (entry bar)

    long_signals = np.where(
        dev_below[:-1] & reclaim[1:] & (np.arange(n-1) >= 50)
    )[0] + 1

    print(f"  SHORT signals: {len(short_signals)}, LONG signals: {len(long_signals)}, Total: {len(short_signals)+len(long_signals)}")

    for exit_id, hold in HOLD_BARS.items():
        valid_s = short_signals[short_signals + hold < n]
        valid_l = long_signals[long_signals + hold < n]

        raw_short = closes[valid_s] - closes[valid_s + hold]
        raw_long  = closes[valid_l + hold] - closes[valid_l]
        raw_all   = np.concatenate([raw_short, raw_long])
        all_idx   = np.concatenate([valid_s, valid_l])

        sig_times = pd.to_datetime(bar_times[all_idx])
        disc_mask  = np.array(sig_times < DISCOVERY_END)
        val_mask   = np.array((sig_times >= DISCOVERY_END) & (sig_times < VALIDATION_END))
        hold_mask  = np.array(sig_times >= VALIDATION_END)
        sess_arr   = sessions[all_idx]
        rth_mask   = sess_arr == 'RTH'
        years      = sig_times.year

        for cost_name, cost_pts in COST_SCENARIOS.items():
            subgroups = []
            r = analyse_subgroup(raw_all, 'ALL', cost_pts)
            if r: subgroups.append(r)
            for lbl, mask in [('DISCOVERY', disc_mask), ('VALIDATION', val_mask), ('HOLDOUT', hold_mask)]:
                r = analyse_subgroup(raw_all[mask], lbl, cost_pts)
                if r: subgroups.append(r)
            r = analyse_subgroup(raw_short[:len(valid_s)], 'SHORT', cost_pts)
            if r: subgroups.append(r)
            r = analyse_subgroup(raw_long[:len(valid_l)], 'LONG', cost_pts)
            if r: subgroups.append(r)
            r = analyse_subgroup(raw_all[rth_mask], 'RTH', cost_pts)
            if r: subgroups.append(r)
            r = analyse_subgroup(raw_all[~rth_mask], 'ETH', cost_pts)
            if r: subgroups.append(r)
            for yr in sorted(years.unique()):
                r = analyse_subgroup(raw_all[years == yr], f'YEAR_{yr}', cost_pts)
                if r: subgroups.append(r)

            pvals = [s['p_value'] for s in subgroups]
            reject_flags = bh_fdr_correct(pvals)
            for i, sg in enumerate(subgroups):
                sg['bh_fdr_significant'] = bool(reject_flags[i])
                sg['bh_fdr_direction'] = ('POSITIVE' if sg['mean_net'] > 0 and reject_flags[i]
                                          else 'NEGATIVE' if sg['mean_net'] < 0 and reject_flags[i]
                                          else 'NS')

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

            combo = f"dev={dev_thresh}_exit={exit_id}_cost={cost_name}"
            fn = full_sg or {}
            print(f"    {combo}: n={len(raw_all)}, mean_net={fn.get('mean_net','?'):.4f}, wr={fn.get('win_rate','?'):.3f}, p={fn.get('p_value','?'):.4f} → {classification}")

            all_results.append({
                'combo': combo, 'dev_threshold': dev_thresh,
                'exit_id': exit_id, 'hold_bars': hold,
                'cost_scenario': cost_name, 'cost_pts': cost_pts,
                'n_short': int(len(valid_s)), 'n_long': int(len(valid_l)),
                'n_total': int(len(raw_all)),
                'classification': classification, 'subgroups': subgroups
            })

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
        full = next(s for s in r['subgroups'] if s['label'] == 'ALL')
        print(f"  {r['combo']}: n={r['n_total']}, mean_net={full['mean_net']:.4f}, wr={full['win_rate']:.3f}, p={full['p_value']:.4f}")

os.makedirs('/home/ubuntu/atlas-nexus/sprint-artefacts-vwap001', exist_ok=True)
output = {
    'experiment_id': 'DARWIN-VWAP-001',
    'preregistration_sha': '6b94edff05d509136e080cb044729f55a475214c',
    'run_timestamp': datetime.now(timezone.utc).isoformat(),
    'summary': dict(class_counts),
    'results': all_results
}
with open(OUTPUT_JSON, 'w') as f:
    json.dump(output, f, indent=2, default=str)
print(f"\nSaved: {OUTPUT_JSON}")
