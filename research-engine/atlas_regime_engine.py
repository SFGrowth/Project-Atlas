"""
Atlas Regime Filter Research Engine v1.0
Sprint 019 — Regime Detection

Atlas does not seek confirmation. Atlas seeks evidence.

This engine tests four regime detection methods against the 2-year MNQ dataset:
  1. ADX (Average Directional Index)
  2. EMA Slope (fast EMA angle over N bars)
  3. ATR Expansion (current ATR vs rolling ATR average)
  4. Chop Index (Choppiness Index)

For each method, we measure:
  - How accurately it classifies trending vs ranging bars
  - How much the Atlas Strategy improves when only trading in "trending" regime
  - The optimal threshold for each method

Then we combine the best methods and run a final sweep.
"""

import pandas as pd
import numpy as np
import os
import itertools
from datetime import datetime

DATA_PATH = "/home/ubuntu/Project-Atlas/data/raw/massive/MNQ_5min_2yr_massive.csv"
RESULTS_DIR = "/home/ubuntu/Project-Atlas/research-engine/results"
os.makedirs(RESULTS_DIR, exist_ok=True)

POINT_VALUE = 2.0  # MNQ: $2 per point
COMMISSION = 0.62  # per side, $1.24 round trip
MIN_TRADES = 80    # minimum trades for statistical validity

print("=" * 60)
print("Atlas Regime Filter Research Engine v1.0")
print("Atlas does not seek confirmation. Atlas seeks evidence.")
print("=" * 60)

# ─────────────────────────────────────────────
# 1. LOAD DATA
# ─────────────────────────────────────────────
print("Loading MNQ 5-min data...")
df = pd.read_csv(DATA_PATH, parse_dates=["time"])
df = df.sort_values("time").reset_index(drop=True)
print(f"  Loaded {len(df):,} rows | Date range: {df['time'].iloc[0]} → {df['time'].iloc[-1]}")

# ─────────────────────────────────────────────
# 2. COMPUTE BASE INDICATORS
# ─────────────────────────────────────────────
print("Computing base indicators...")

def ema(series, period):
    return series.ewm(span=period, adjust=False).mean()

def atr(df, period=14):
    high, low, close = df['high'], df['low'], df['close']
    tr = pd.concat([
        high - low,
        (high - close.shift(1)).abs(),
        (low - close.shift(1)).abs()
    ], axis=1).max(axis=1)
    return tr.ewm(span=period, adjust=False).mean()

def adx(df, period=14):
    high, low, close = df['high'], df['low'], df['close']
    up_move = high.diff()
    down_move = -low.diff()
    plus_dm = np.where((up_move > down_move) & (up_move > 0), up_move, 0.0)
    minus_dm = np.where((down_move > up_move) & (down_move > 0), down_move, 0.0)
    tr_vals = pd.concat([
        high - low,
        (high - close.shift(1)).abs(),
        (low - close.shift(1)).abs()
    ], axis=1).max(axis=1)
    atr_s = tr_vals.ewm(span=period, adjust=False).mean()
    plus_di = 100 * pd.Series(plus_dm).ewm(span=period, adjust=False).mean() / atr_s
    minus_di = 100 * pd.Series(minus_dm).ewm(span=period, adjust=False).mean() / atr_s
    dx = 100 * (plus_di - minus_di).abs() / (plus_di + minus_di).replace(0, np.nan)
    return dx.ewm(span=period, adjust=False).mean(), plus_di, minus_di

def chop_index(df, period=14):
    high, low, close = df['high'], df['low'], df['close']
    tr = pd.concat([
        high - low,
        (high - close.shift(1)).abs(),
        (low - close.shift(1)).abs()
    ], axis=1).max(axis=1)
    atr_sum = tr.rolling(period).sum()
    highest_high = high.rolling(period).max()
    lowest_low = low.rolling(period).min()
    range_hl = highest_high - lowest_low
    chop = 100 * np.log10(atr_sum / range_hl.replace(0, np.nan)) / np.log10(period)
    return chop

# Core indicators
df['ema9'] = ema(df['close'], 9)
df['ema21'] = ema(df['close'], 21)
df['ema50'] = ema(df['close'], 50)
df['atr14'] = atr(df, 14)
df['atr_slow'] = df['atr14'].rolling(50).mean()  # ATR expansion baseline
df['adx14'], df['plus_di'], df['minus_di'] = adx(df, 14)
df['chop14'] = chop_index(df, 14)

# EMA slope: change in fast EMA over N bars (normalised by ATR)
df['ema9_slope5'] = (df['ema9'] - df['ema9'].shift(5)) / df['atr14']
df['ema9_slope10'] = (df['ema9'] - df['ema9'].shift(10)) / df['atr14']

# ATR expansion ratio
df['atr_ratio'] = df['atr14'] / df['atr_slow']

# Trend direction
df['trend_up'] = (df['ema9'] > df['ema21']) & (df['ema21'] > df['ema50'])
df['trend_dn'] = (df['ema9'] < df['ema21']) & (df['ema21'] < df['ema50'])

# Two-leg pullback (from Sprint 018 — the one accepted rule)
df['higher_high'] = df['high'] > df['high'].shift(1)
df['lower_low'] = df['low'] < df['low'].shift(1)
df['h2'] = df['higher_high'] & df['higher_high'].shift(2)  # two consecutive HH
df['l2'] = df['lower_low'] & df['lower_low'].shift(2)       # two consecutive LL

# Entry signals (two-leg pullback in trend direction)
df['long_signal'] = df['trend_up'] & df['l2']   # pullback in uptrend
df['short_signal'] = df['trend_dn'] & df['h2']  # pullback in downtrend

df = df.dropna().reset_index(drop=True)
print(f"  Features ready. Shape: {df.shape}")

# ─────────────────────────────────────────────
# 3. BACKTEST FUNCTION
# ─────────────────────────────────────────────
def backtest(df, regime_mask=None, rr=2.5, stop_atr=0.75):
    """
    Vectorised backtest. regime_mask is a boolean Series — if provided,
    only trades where regime_mask is True are taken.
    """
    entries = df['long_signal'] | df['short_signal']
    if regime_mask is not None:
        entries = entries & regime_mask

    entry_idx = df.index[entries].tolist()
    if len(entry_idx) < MIN_TRADES:
        return None

    pnl_list = []
    bars_held_list = []
    in_trade = False
    trade_entry_idx = -1

    for i in entry_idx:
        if in_trade and i <= trade_entry_idx + 1:
            continue  # skip overlapping entries
        is_long = bool(df.at[i, 'long_signal'])
        entry_price = df.at[i, 'close']
        stop_dist = df.at[i, 'atr14'] * stop_atr
        stop = entry_price - stop_dist if is_long else entry_price + stop_dist
        target = entry_price + stop_dist * rr if is_long else entry_price - stop_dist * rr

        # Simulate forward
        result_pnl = None
        bars = 0
        max_forward = min(i + 50, len(df) - 1)
        for j in range(i + 1, max_forward + 1):
            bars += 1
            h, l = df.at[j, 'high'], df.at[j, 'low']
            if is_long:
                if l <= stop:
                    result_pnl = (stop - entry_price) * POINT_VALUE - COMMISSION * 2
                    break
                if h >= target:
                    result_pnl = (target - entry_price) * POINT_VALUE - COMMISSION * 2
                    break
            else:
                if h >= stop:
                    result_pnl = (entry_price - stop) * POINT_VALUE - COMMISSION * 2
                    break
                if l <= target:
                    result_pnl = (entry_price - target) * POINT_VALUE - COMMISSION * 2
                    break
        if result_pnl is None:
            # Time exit at 50 bars
            exit_price = df.at[max_forward, 'close']
            result_pnl = ((exit_price - entry_price) if is_long else (entry_price - exit_price)) * POINT_VALUE - COMMISSION * 2

        pnl_list.append(result_pnl)
        bars_held_list.append(bars)
        in_trade = True
        trade_entry_idx = i

    if len(pnl_list) < MIN_TRADES:
        return None

    pnl = np.array(pnl_list)
    winners = pnl[pnl > 0]
    losers = pnl[pnl <= 0]
    gross_profit = winners.sum() if len(winners) > 0 else 0
    gross_loss = abs(losers.sum()) if len(losers) > 0 else 1e-9
    pf = gross_profit / gross_loss if gross_loss > 0 else 0

    # Max drawdown
    equity = np.cumsum(pnl)
    peak = np.maximum.accumulate(equity)
    dd = equity - peak
    max_dd = dd.min()

    # Losing streak
    losing_streak = 0
    max_losing_streak = 0
    for p in pnl:
        if p <= 0:
            losing_streak += 1
            max_losing_streak = max(max_losing_streak, losing_streak)
        else:
            losing_streak = 0

    wr = len(winners) / len(pnl)
    avg_w = winners.mean() if len(winners) > 0 else 0
    avg_l = losers.mean() if len(losers) > 0 else 0
    expectancy = (wr * avg_w + (1 - wr) * avg_l) / abs(avg_l) if avg_l != 0 else 0

    robustness = (pf * len(pnl) * expectancy) / (abs(max_dd) / 1000 + 1)

    return {
        'profit_factor': round(pf, 3),
        'win_rate': round(wr * 100, 2),
        'trades': len(pnl),
        'net_pnl': round(pnl.sum(), 2),
        'avg_trade': round(pnl.mean(), 2),
        'max_drawdown': round(max_dd, 2),
        'expectancy': round(expectancy, 3),
        'avg_winner': round(avg_w, 2),
        'avg_loser': round(avg_l, 2),
        'largest_losing_streak': max_losing_streak,
        'avg_bars_held': round(np.mean(bars_held_list), 1),
        'robustness_score': round(robustness, 4),
    }

# ─────────────────────────────────────────────
# 4. BASELINE (no regime filter)
# ─────────────────────────────────────────────
print("\n" + "=" * 60)
print("REGIME FILTER ISOLATION TESTS")
print("=" * 60)

baseline = backtest(df)
print(f"\nBaseline (no regime filter):")
print(f"  PF={baseline['profit_factor']} | WR={baseline['win_rate']}% | "
      f"Trades={baseline['trades']} | PnL=${baseline['net_pnl']:,.0f} | "
      f"DD=${baseline['max_drawdown']:,.0f} | Exp={baseline['expectancy']}")

def print_hypothesis(name, hypothesis, before, after):
    pf_delta = after['profit_factor'] - before['profit_factor']
    dd_delta = after['max_drawdown'] - before['max_drawdown']
    trade_delta = after['trades'] - before['trades']
    pnl_delta = after['net_pnl'] - before['net_pnl']
    result = "TRUE" if (pf_delta > 0 and after['profit_factor'] >= 1.10 and after['max_drawdown'] > -5000) else "FALSE"
    print(f"\n{'─'*60}")
    print(f"  Hypothesis:  {hypothesis}")
    print(f"  Result:      {result}")
    print(f"  Evidence:")
    print(f"    Profit Factor:   {before['profit_factor']} → {after['profit_factor']}  ({pf_delta:+.3f})")
    print(f"    Win Rate:        {before['win_rate']}% → {after['win_rate']}%")
    print(f"    Net PnL:         ${before['net_pnl']:,.0f} → ${after['net_pnl']:,.0f}  ({pnl_delta:+,.0f})")
    print(f"    Max Drawdown:    ${before['max_drawdown']:,.0f} → ${after['max_drawdown']:,.0f}  ({dd_delta:+,.0f})")
    print(f"    Trades:          {before['trades']} → {after['trades']}  ({trade_delta:+d})")
    print(f"    Robustness Δ:    {after['robustness_score'] - before['robustness_score']:+.4f}")
    print(f"  Decision:    {'Accept rule.' if result == 'TRUE' else 'Reject rule.'}")
    print(f"{'─'*60}")
    return result == "TRUE"

# ─────────────────────────────────────────────
# 5. TEST EACH REGIME METHOD
# ─────────────────────────────────────────────
regime_results = {}

# --- ADX Filter ---
print("\n[1/5] Testing ADX Regime Filter")
adx_thresholds = [15, 20, 25, 30]
best_adx = None
best_adx_thresh = None
for thresh in adx_thresholds:
    mask = df['adx14'] >= thresh
    r = backtest(df, regime_mask=mask)
    if r and (best_adx is None or r['robustness_score'] > best_adx['robustness_score']):
        best_adx = r
        best_adx_thresh = thresh

if best_adx:
    accepted = print_hypothesis(
        "ADX Filter",
        f"Only trading when ADX >= {best_adx_thresh} (trending regime) improves robustness.",
        baseline, best_adx
    )
    regime_results['adx'] = {'result': best_adx, 'threshold': best_adx_thresh, 'accepted': accepted}
    print(f"  Best ADX threshold: {best_adx_thresh}")

# --- EMA Slope Filter ---
print("\n[2/5] Testing EMA Slope Regime Filter")
slope_thresholds = [0.1, 0.2, 0.3, 0.5]
best_slope = None
best_slope_thresh = None
for thresh in slope_thresholds:
    mask = df['ema9_slope5'].abs() >= thresh
    r = backtest(df, regime_mask=mask)
    if r and (best_slope is None or r['robustness_score'] > best_slope['robustness_score']):
        best_slope = r
        best_slope_thresh = thresh

if best_slope:
    accepted = print_hypothesis(
        "EMA Slope Filter",
        f"Only trading when EMA slope >= {best_slope_thresh} ATR/bar improves robustness.",
        baseline, best_slope
    )
    regime_results['ema_slope'] = {'result': best_slope, 'threshold': best_slope_thresh, 'accepted': accepted}
    print(f"  Best EMA slope threshold: {best_slope_thresh}")

# --- ATR Expansion Filter ---
print("\n[3/5] Testing ATR Expansion Regime Filter")
atr_thresholds = [1.0, 1.1, 1.2, 1.3]
best_atr = None
best_atr_thresh = None
for thresh in atr_thresholds:
    mask = df['atr_ratio'] >= thresh
    r = backtest(df, regime_mask=mask)
    if r and (best_atr is None or r['robustness_score'] > best_atr['robustness_score']):
        best_atr = r
        best_atr_thresh = thresh

if best_atr:
    accepted = print_hypothesis(
        "ATR Expansion Filter",
        f"Only trading when current ATR >= {best_atr_thresh}x the 50-bar ATR average improves robustness.",
        baseline, best_atr
    )
    regime_results['atr_expansion'] = {'result': best_atr, 'threshold': best_atr_thresh, 'accepted': accepted}
    print(f"  Best ATR expansion threshold: {best_atr_thresh}")

# --- Chop Index Filter ---
print("\n[4/5] Testing Chop Index Regime Filter")
chop_thresholds = [50, 55, 60, 65]
best_chop = None
best_chop_thresh = None
for thresh in chop_thresholds:
    mask = df['chop14'] <= thresh  # low chop = trending
    r = backtest(df, regime_mask=mask)
    if r and (best_chop is None or r['robustness_score'] > best_chop['robustness_score']):
        best_chop = r
        best_chop_thresh = thresh

if best_chop:
    accepted = print_hypothesis(
        "Chop Index Filter",
        f"Only trading when Chop Index <= {best_chop_thresh} (low chop = trending) improves robustness.",
        baseline, best_chop
    )
    regime_results['chop'] = {'result': best_chop, 'threshold': best_chop_thresh, 'accepted': accepted}
    print(f"  Best Chop threshold: {best_chop_thresh}")

# --- Combined Best Filters ---
print("\n[5/5] Testing Combined Regime Filter (best accepted methods)")
accepted_masks = []
if regime_results.get('adx', {}).get('accepted'):
    accepted_masks.append(df['adx14'] >= regime_results['adx']['threshold'])
if regime_results.get('ema_slope', {}).get('accepted'):
    accepted_masks.append(df['ema9_slope5'].abs() >= regime_results['ema_slope']['threshold'])
if regime_results.get('atr_expansion', {}).get('accepted'):
    accepted_masks.append(df['atr_ratio'] >= regime_results['atr_expansion']['threshold'])
if regime_results.get('chop', {}).get('accepted'):
    accepted_masks.append(df['chop14'] <= regime_results['chop']['threshold'])

combined_result = None
if len(accepted_masks) >= 2:
    combined_mask = accepted_masks[0]
    for m in accepted_masks[1:]:
        combined_mask = combined_mask & m
    combined_result = backtest(df, regime_mask=combined_mask)
    if combined_result:
        accepted = print_hypothesis(
            "Combined Filter",
            "Combining all accepted regime filters produces a superior result.",
            baseline, combined_result
        )
        regime_results['combined'] = {'result': combined_result, 'accepted': accepted}

# ─────────────────────────────────────────────
# 6. PARAMETER SWEEP WITH BEST REGIME FILTER
# ─────────────────────────────────────────────
print("\n" + "=" * 60)
print("PARAMETER SWEEP WITH BEST REGIME FILTER")
print("=" * 60)

# Determine the best single regime filter
best_regime_name = None
best_regime_score = 0
for name, data in regime_results.items():
    if data.get('result') and data['result']['robustness_score'] > best_regime_score:
        best_regime_score = data['result']['robustness_score']
        best_regime_name = name

print(f"\n  Best regime filter: {best_regime_name} (robustness: {best_regime_score:.4f})")

# Build the best mask
if best_regime_name == 'adx':
    best_mask = df['adx14'] >= regime_results['adx']['threshold']
elif best_regime_name == 'ema_slope':
    best_mask = df['ema9_slope5'].abs() >= regime_results['ema_slope']['threshold']
elif best_regime_name == 'atr_expansion':
    best_mask = df['atr_ratio'] >= regime_results['atr_expansion']['threshold']
elif best_regime_name == 'chop':
    best_mask = df['chop14'] <= regime_results['chop']['threshold']
elif best_regime_name == 'combined':
    best_mask = combined_mask
else:
    best_mask = None

# Sweep parameters on top of the best regime filter
rr_values = [1.5, 2.0, 2.5, 3.0]
stop_values = [0.5, 0.75, 1.0, 1.25]
adx_thresholds_sweep = [15, 20, 25, 30] if best_regime_name != 'adx' else [regime_results['adx']['threshold']]
chop_thresholds_sweep = [50, 55, 60] if best_regime_name != 'chop' else [regime_results['chop']['threshold']]

combos = list(itertools.product(rr_values, stop_values, adx_thresholds_sweep, chop_thresholds_sweep))
print(f"  Running {len(combos)} combinations...")

sweep_results = []
best_sweep = None

for i, (rr, stop, adx_t, chop_t) in enumerate(combos):
    mask = (df['adx14'] >= adx_t) & (df['chop14'] <= chop_t)
    r = backtest(df, regime_mask=mask, rr=rr, stop_atr=stop)
    if r:
        r.update({'rr_ratio': rr, 'stop_atr_mult': stop, 'adx_threshold': adx_t, 'chop_threshold': chop_t})
        sweep_results.append(r)
        if best_sweep is None or r['robustness_score'] > best_sweep['robustness_score']:
            best_sweep = r
    if (i + 1) % 50 == 0:
        best_pf = best_sweep['profit_factor'] if best_sweep else 0
        best_dd = best_sweep['max_drawdown'] if best_sweep else 0
        print(f"  [{i+1:4d}/{len(combos)}] Best PF={best_pf:.3f} | DD=${best_dd:,.0f}")

# ─────────────────────────────────────────────
# 7. RESULTS
# ─────────────────────────────────────────────
print("\n" + "=" * 60)
print("TOP 10 RESULTS BY ROBUSTNESS SCORE")
print("=" * 60)

if sweep_results:
    results_df = pd.DataFrame(sweep_results).sort_values('robustness_score', ascending=False)
    results_df.to_csv(f"{RESULTS_DIR}/regime_sweep_results.csv", index=False)
    print(results_df[['robustness_score', 'profit_factor', 'win_rate', 'trades', 'net_pnl',
                       'max_drawdown', 'expectancy', 'largest_losing_streak',
                       'adx_threshold', 'chop_threshold', 'rr_ratio', 'stop_atr_mult']].head(10).to_string(index=False))

    print("\n" + "=" * 60)
    print("BEST RESULT — FULL DETAIL")
    print("=" * 60)
    for k, v in best_sweep.items():
        print(f"  {k:<30}: {v}")

# Save component results
comp_df = pd.DataFrame([
    {'filter': 'baseline', **baseline},
    *[{'filter': name, **data['result']} for name, data in regime_results.items() if data.get('result')]
])
comp_df.to_csv(f"{RESULTS_DIR}/regime_component_results.csv", index=False)
print(f"\nAll results saved to: {RESULTS_DIR}")
