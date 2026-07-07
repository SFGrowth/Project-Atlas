"""
Atlas Research Engine — Sprint 024
Component Precision Research: H-B007 (Pullback + Volatility Expansion)
Stream B/D — Execution & Component Intelligence

Optimised version: all structural signals are pre-computed as boolean arrays
before the trade loop, eliminating per-bar function call overhead.

Research Questions:
  Q1. What is the most statistically meaningful definition of a pullback?
  Q2. Does a two-leg pullback outperform a one-leg pullback?
  Q3. What pullback depth relative to ATR produces the best robustness?
  Q4. What volatility expansion lookback period is most meaningful?
  Q5. What expansion ratio separates noise from genuine directional participation?
  Q6. Does the signal improve on higher timeframes?
"""

import pandas as pd
import numpy as np
from pathlib import Path
from itertools import product

# ─────────────────────────────────────────────
# CONSTANTS
# ─────────────────────────────────────────────
DATA_PATH_5M    = Path("/home/ubuntu/Project-Atlas/data/raw/massive/MNQ_5min_full.csv")
MNQ_POINT_VALUE = 2.0
COMMISSION      = 1.00
STOP_ATR_MULT   = 1.0
TARGET_RR       = 2.0
MIN_TRADES      = 100
PF_THRESHOLD    = 1.20
MAX_DD_LIMIT    = -2000.0

# ─────────────────────────────────────────────
# DATA LOADING & FEATURE ENGINEERING
# ─────────────────────────────────────────────

def load_and_prepare(path):
    df = pd.read_csv(path)
    df['ts'] = pd.to_datetime(df['timestamp_et'], utc=True)
    df = df.sort_values('ts').reset_index(drop=True)
    df['date']   = df['ts'].dt.date
    df['hour']   = df['ts'].dt.hour
    df['minute'] = df['ts'].dt.minute
    df['is_rth'] = (
        ((df['hour'] == 9) & (df['minute'] >= 30)) |
        ((df['hour'] >= 10) & (df['hour'] <= 15))
    )

    # ATR variants
    pc = df['close'].shift(1)
    tr = np.maximum(df['high'] - df['low'],
         np.maximum((df['high'] - pc).abs(), (df['low'] - pc).abs()))
    df['tr']    = tr
    df['atr5']  = tr.rolling(5,  min_periods=1).mean()
    df['atr14'] = tr.rolling(14, min_periods=1).mean()
    df['atr20'] = tr.rolling(20, min_periods=1).mean()

    # EMA stack
    df['ema9']  = df['close'].ewm(span=9,  adjust=False).mean()
    df['ema21'] = df['close'].ewm(span=21, adjust=False).mean()
    df['ema50'] = df['close'].ewm(span=50, adjust=False).mean()

    # Trend direction flags (vectorised)
    df['uptrend']   = (df['ema9'] > df['ema21']) & (df['ema21'] > df['ema50'])
    df['downtrend'] = (df['ema9'] < df['ema21']) & (df['ema21'] < df['ema50'])

    # Pullback to EMA21 detection (1-leg)
    prev_close = df['close'].shift(1)
    df['pb_long_touch']  = (prev_close > df['ema21']) & (df['close'] <= df['ema21'] * 1.001)
    df['pb_short_touch'] = (prev_close < df['ema21']) & (df['close'] >= df['ema21'] * 0.999)

    # Rolling 10-bar swing high/low for depth calculation
    df['swing_high_10'] = df['high'].shift(1).rolling(10, min_periods=1).max()
    df['swing_low_10']  = df['low'].shift(1).rolling(10, min_periods=1).min()

    # Pullback depth (ATR multiples)
    df['pb_depth_long']  = (df['swing_high_10'] - df['close']) / df['atr14'].replace(0, np.nan)
    df['pb_depth_short'] = (df['close'] - df['swing_low_10'])  / df['atr14'].replace(0, np.nan)

    # 2-leg pullback: proxy using a 2-bar lower-low then recovery to EMA21
    # Long 2-leg: bar[i-2] low < bar[i-4] low AND bar[i] touches EMA21 from above
    df['ll_2bar']  = df['low'].shift(2) < df['low'].shift(4)   # lower low 2 bars ago vs 4 bars ago
    df['hh_2bar']  = df['high'].shift(2) > df['high'].shift(4) # higher high (for shorts)

    return df


def resample_to_15min(df5):
    df5 = df5.copy()
    df5 = df5.set_index('ts')
    df15 = df5.resample('15min').agg({
        'open': 'first', 'high': 'max', 'low': 'min',
        'close': 'last', 'volume': 'sum'
    }).dropna(subset=['open']).reset_index()
    df15['date']   = df15['ts'].dt.date
    df15['hour']   = df15['ts'].dt.hour
    df15['minute'] = df15['ts'].dt.minute
    df15['is_rth'] = (
        ((df15['hour'] == 9) & (df15['minute'] >= 30)) |
        ((df15['hour'] >= 10) & (df15['hour'] <= 15))
    )
    pc = df15['close'].shift(1)
    tr = np.maximum(df15['high'] - df15['low'],
         np.maximum((df15['high'] - pc).abs(), (df15['low'] - pc).abs()))
    df15['tr']    = tr
    df15['atr5']  = tr.rolling(5,  min_periods=1).mean()
    df15['atr14'] = tr.rolling(14, min_periods=1).mean()
    df15['ema9']  = df15['close'].ewm(span=9,  adjust=False).mean()
    df15['ema21'] = df15['close'].ewm(span=21, adjust=False).mean()
    df15['ema50'] = df15['close'].ewm(span=50, adjust=False).mean()
    df15['uptrend']   = (df15['ema9'] > df15['ema21']) & (df15['ema21'] > df15['ema50'])
    df15['downtrend'] = (df15['ema9'] < df15['ema21']) & (df15['ema21'] < df15['ema50'])
    prev_close = df15['close'].shift(1)
    df15['pb_long_touch']  = (prev_close > df15['ema21']) & (df15['close'] <= df15['ema21'] * 1.001)
    df15['pb_short_touch'] = (prev_close < df15['ema21']) & (df15['close'] >= df15['ema21'] * 0.999)
    df15['swing_high_10'] = df15['high'].shift(1).rolling(10, min_periods=1).max()
    df15['swing_low_10']  = df15['low'].shift(1).rolling(10, min_periods=1).min()
    df15['pb_depth_long']  = (df15['swing_high_10'] - df15['close']) / df15['atr14'].replace(0, np.nan)
    df15['pb_depth_short'] = (df15['close'] - df15['swing_low_10'])  / df15['atr14'].replace(0, np.nan)
    df15['ll_2bar'] = df15['low'].shift(2) < df15['low'].shift(4)
    df15['hh_2bar'] = df15['high'].shift(2) > df15['high'].shift(4)
    return df15.reset_index(drop=True)


# ─────────────────────────────────────────────
# PRE-COMPUTE EXPANSION SIGNALS
# ─────────────────────────────────────────────

def precompute_expansion(df, lookback, ratio):
    """Vectorised: True where atr5[i] / atr5[i-lookback] > ratio."""
    atr5 = df['atr5'].values
    n    = len(atr5)
    sig  = np.zeros(n, dtype=bool)
    for i in range(lookback, n):
        prev = atr5[i - lookback]
        if prev > 0:
            sig[i] = atr5[i] / prev > ratio
    return sig


# ─────────────────────────────────────────────
# TRADE SIMULATION (vectorised exit search)
# ─────────────────────────────────────────────

def simulate_trade(close, high, low, is_rth, entry_idx, direction, stop_pts, target_pts):
    entry_price  = close[entry_idx]
    stop_price   = entry_price - direction * stop_pts
    target_price = entry_price + direction * target_pts
    n = len(close)

    for i in range(entry_idx + 1, min(entry_idx + 300, n)):
        if not is_rth[i]:
            exit_price = close[i - 1]
            return direction * (exit_price - entry_price) * MNQ_POINT_VALUE - COMMISSION, i - entry_idx
        if direction == 1:
            if low[i]  <= stop_price:
                return direction * (stop_price  - entry_price) * MNQ_POINT_VALUE - COMMISSION, i - entry_idx
            if high[i] >= target_price:
                return direction * (target_price - entry_price) * MNQ_POINT_VALUE - COMMISSION, i - entry_idx
        else:
            if high[i] >= stop_price:
                return direction * (stop_price  - entry_price) * MNQ_POINT_VALUE - COMMISSION, i - entry_idx
            if low[i]  <= target_price:
                return direction * (target_price - entry_price) * MNQ_POINT_VALUE - COMMISSION, i - entry_idx

    exit_price = close[min(entry_idx + 299, n - 1)]
    return direction * (exit_price - entry_price) * MNQ_POINT_VALUE - COMMISSION, 299


# ─────────────────────────────────────────────
# METRICS
# ─────────────────────────────────────────────

def compute_metrics(trades, label):
    if not trades:
        return {'label': label, 'trade_count': 0, 'verdict': 'NO_TRADES'}

    pnls = [t[0] for t in trades]
    dirs = [t[1] for t in trades]

    if len(pnls) < MIN_TRADES:
        return {'label': label, 'trade_count': len(pnls),
                'net_profit': round(sum(pnls), 2), 'verdict': f'INSUF({len(pnls)})'}

    winners = [p for p in pnls if p > 0]
    losers  = [p for p in pnls if p <= 0]
    gp = sum(winners) if winners else 0
    gl = abs(sum(losers)) if losers else 0.001
    pf = gp / gl
    net = sum(pnls)
    wr  = len(winners) / len(pnls) * 100
    avg_w = np.mean(winners) if winners else 0
    avg_l = np.mean(losers)  if losers  else 0
    exp   = net / len(pnls)

    equity = np.cumsum(pnls)
    peak   = np.maximum.accumulate(equity)
    max_dd = (equity - peak).min()

    streak = max_streak = 0
    for p in pnls:
        streak = streak + 1 if p <= 0 else 0
        max_streak = max(max_streak, streak)

    lp = [pnls[k] for k, d in enumerate(dirs) if d ==  1]
    sp = [pnls[k] for k, d in enumerate(dirs) if d == -1]
    lw = sum(p for p in lp if p > 0); ll = abs(sum(p for p in lp if p <= 0)) or 0.001
    sw = sum(p for p in sp if p > 0); sl = abs(sum(p for p in sp if p <= 0)) or 0.001

    verdict = 'PASS' if pf >= PF_THRESHOLD and max_dd >= MAX_DD_LIMIT else 'FAIL'

    return {
        'label': label, 'trade_count': len(pnls),
        'net_profit': round(net, 2), 'profit_factor': round(pf, 3),
        'expectancy': round(exp, 2), 'win_rate': round(wr, 1),
        'max_drawdown': round(max_dd, 2), 'avg_winner': round(avg_w, 2),
        'avg_loser': round(avg_l, 2), 'largest_losing_streak': max_streak,
        'long_pf': round(lw/ll, 3), 'short_pf': round(sw/sl, 3),
        'long_count': len(lp), 'short_count': len(sp),
        'verdict': verdict,
    }


# ─────────────────────────────────────────────
# EXPERIMENT RUNNER
# ─────────────────────────────────────────────

def run_config(df, exp_signal, legs, depth_min, depth_max, label):
    """
    exp_signal: pre-computed boolean array for expansion condition.
    legs: 1 = single-leg pullback, 2 = two-leg pullback.
    """
    close  = df['close'].values
    high   = df['high'].values
    low    = df['low'].values
    is_rth = df['is_rth'].values
    atr14  = df['atr14'].values
    uptrend   = df['uptrend'].values
    downtrend = df['downtrend'].values
    pb_lt = df['pb_long_touch'].values
    pb_st = df['pb_short_touch'].values
    pb_dl = df['pb_depth_long'].values
    pb_ds = df['pb_depth_short'].values
    ll2   = df['ll_2bar'].values
    hh2   = df['hh_2bar'].values

    trades = []
    i = 0
    n = len(df)

    while i < n - 1:
        if not is_rth[i] or np.isnan(atr14[i]) or atr14[i] == 0:
            i += 1
            continue

        if not exp_signal[i]:
            i += 1
            continue

        direction = None

        if legs == 1:
            if uptrend[i] and pb_lt[i]:
                d = pb_dl[i]
                if not np.isnan(d) and depth_min <= d <= depth_max:
                    direction = 1
            if direction is None and downtrend[i] and pb_st[i]:
                d = pb_ds[i]
                if not np.isnan(d) and depth_min <= d <= depth_max:
                    direction = -1
        else:
            # 2-leg: require the lower-low/higher-high structure plus EMA21 touch
            if uptrend[i] and pb_lt[i] and ll2[i]:
                d = pb_dl[i]
                if not np.isnan(d) and depth_min <= d <= depth_max:
                    direction = 1
            if direction is None and downtrend[i] and pb_st[i] and hh2[i]:
                d = pb_ds[i]
                if not np.isnan(d) and depth_min <= d <= depth_max:
                    direction = -1

        if direction is None:
            i += 1
            continue

        stop_pts   = STOP_ATR_MULT * atr14[i]
        target_pts = TARGET_RR * stop_pts

        pnl, bars = simulate_trade(close, high, low, is_rth, i, direction, stop_pts, target_pts)
        trades.append((pnl, direction))
        i += bars

    return compute_metrics(trades, label)


# ─────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────

def main():
    print("=" * 75)
    print("ATLAS RESEARCH ENGINE — SPRINT 024")
    print("Component Precision Research: H-B007 (Pullback + Volatility Expansion)")
    print("=" * 75)

    print("\n[1] Loading data...")
    df5  = load_and_prepare(DATA_PATH_5M)
    df15 = resample_to_15min(df5)
    print(f"    5-min bars:  {len(df5):,}")
    print(f"    15-min bars: {len(df15):,}")

    cutoff  = pd.Timestamp('2025-07-07').date()
    df5_y1  = df5[df5['date'] < cutoff].reset_index(drop=True)
    df5_y2  = df5[df5['date'] >= cutoff].reset_index(drop=True)
    df15_y1 = df15[df15['date'] < cutoff].reset_index(drop=True)
    df15_y2 = df15[df15['date'] >= cutoff].reset_index(drop=True)

    # Parameter grid
    legs_opts  = [1, 2]
    depth_opts = [(0.0, 999.0), (0.3, 0.8), (0.5, 1.2), (0.8, 1.5), (1.0, 2.0)]
    lb_opts    = [5, 10, 20]
    ratio_opts = [1.2, 1.4, 1.8, 2.0]

    # Pre-compute all expansion signals for 5-min and 15-min
    print("\n[2] Pre-computing expansion signals...")
    exp5  = {(lb, r): precompute_expansion(df5,  lb, r) for lb, r in product(lb_opts, ratio_opts)}
    exp15 = {(lb, r): precompute_expansion(df15, lb, r) for lb, r in product(lb_opts, ratio_opts)}
    exp5_y1 = {(lb, r): precompute_expansion(df5_y1,  lb, r) for lb, r in product(lb_opts, ratio_opts)}
    exp5_y2 = {(lb, r): precompute_expansion(df5_y2,  lb, r) for lb, r in product(lb_opts, ratio_opts)}
    print("    Done.")

    # Sprint 023 baseline (1-leg, any depth, lb=10, ratio=1.4)
    print("\n[3] Sprint 023 Baseline Replication...")
    baseline = run_config(df5, exp5[(10, 1.4)], 1, 0.0, 999.0, "S023-BASELINE")
    print(f"    PF: {baseline.get('profit_factor','N/A')}  Trades: {baseline['trade_count']}  Net: ${baseline.get('net_profit',0):,.0f}  Verdict: {baseline.get('verdict','N/A')}")

    # Full parameter sweep (5-min)
    print("\n[4] Running 5-min parameter sweep...")
    all_results = []
    total = len(legs_opts) * len(depth_opts) * len(lb_opts) * len(ratio_opts)
    done  = 0
    for legs, (dmin, dmax), lb, ratio in product(legs_opts, depth_opts, lb_opts, ratio_opts):
        label = f"legs={legs} | d={dmin}-{dmax} | lb={lb} | r={ratio}"
        r = run_config(df5, exp5[(lb, ratio)], legs, dmin, dmax, label)
        all_results.append((r, legs, dmin, dmax, lb, ratio))
        done += 1
        if done % 20 == 0:
            print(f"    {done}/{total} configs done...")
    print(f"    {total}/{total} configs done.")

    # 15-min comparison
    print("\n[5] Running 15-min timeframe comparison...")
    tf15_results = []
    for legs, (dmin, dmax), lb, ratio in product([1, 2], [(0.5, 1.2), (0.8, 1.5)], [5, 10], [1.4, 1.8]):
        label = f"15MIN | legs={legs} | d={dmin}-{dmax} | lb={lb} | r={ratio}"
        r = run_config(df15, exp15[(lb, ratio)], legs, dmin, dmax, label)
        tf15_results.append(r)
    print("    Done.")

    # Identify passing configs
    passing = [(r, legs, dmin, dmax, lb, ratio) for r, legs, dmin, dmax, lb, ratio in all_results
               if r.get('verdict') == 'PASS']
    print(f"\n[6] Passing configurations (PF > {PF_THRESHOLD}): {len(passing)}")

    # Sub-period stability for passing configs
    stable_results = []
    if passing:
        print("\n[7] Year 1 / Year 2 stability for passing configurations...")
        for r, legs, dmin, dmax, lb, ratio in passing:
            r_y1 = run_config(df5_y1, exp5_y1[(lb, ratio)], legs, dmin, dmax, r['label'] + " | Y1")
            r_y2 = run_config(df5_y2, exp5_y2[(lb, ratio)], legs, dmin, dmax, r['label'] + " | Y2")
            pf_y1 = r_y1.get('profit_factor', 0)
            pf_y2 = r_y2.get('profit_factor', 0)
            stable = isinstance(pf_y1, float) and pf_y1 > 1.0 and isinstance(pf_y2, float) and pf_y2 > 1.0
            stable_results.append({'full': r, 'y1': r_y1, 'y2': r_y2, 'stable': stable})

    # ── Print Summary ──
    print(f"\n\n{'='*75}")
    print("SPRINT 024 SUMMARY — 5-MIN PARAMETER SWEEP (TOP 40 BY PF)")
    print(f"{'='*75}")
    print(f"\n{'Config':<52} {'Trades':>7} {'PF':>6} {'Net P&L':>11} {'MaxDD':>10} {'Verdict':>8}")
    print("-" * 100)

    r = baseline
    pf_s  = f"{r['profit_factor']:.3f}" if 'profit_factor' in r else 'N/A'
    net_s = f"${r.get('net_profit',0):>9,.0f}"
    dd_s  = f"${r.get('max_drawdown',0):>9,.0f}" if 'max_drawdown' in r else 'N/A'
    print(f"{'BASELINE (S023)':<52} {r['trade_count']:>7}  {pf_s:>6}  {net_s}  {dd_s}  {r.get('verdict','N/A'):>8}")
    print("-" * 100)

    for r, *_ in sorted(all_results, key=lambda x: x[0].get('profit_factor', 0), reverse=True)[:40]:
        pf_s  = f"{r['profit_factor']:.3f}" if 'profit_factor' in r else r.get('verdict','N/A')
        net_s = f"${r.get('net_profit',0):>9,.0f}"
        dd_s  = f"${r.get('max_drawdown',0):>9,.0f}" if 'max_drawdown' in r else 'N/A'
        print(f"{r['label']:<52} {r['trade_count']:>7}  {pf_s:>6}  {net_s}  {dd_s}  {r.get('verdict','N/A'):>8}")

    print(f"\n\n{'='*75}")
    print("15-MINUTE TIMEFRAME RESULTS (ALL CONFIGS)")
    print(f"{'='*75}")
    print(f"\n{'Config':<52} {'Trades':>7} {'PF':>6} {'Net P&L':>11} {'MaxDD':>10} {'Verdict':>8}")
    print("-" * 100)
    for r in sorted(tf15_results, key=lambda x: x.get('profit_factor', 0), reverse=True):
        pf_s  = f"{r['profit_factor']:.3f}" if 'profit_factor' in r else r.get('verdict','N/A')
        net_s = f"${r.get('net_profit',0):>9,.0f}"
        dd_s  = f"${r.get('max_drawdown',0):>9,.0f}" if 'max_drawdown' in r else 'N/A'
        print(f"{r['label']:<52} {r['trade_count']:>7}  {pf_s:>6}  {net_s}  {dd_s}  {r.get('verdict','N/A'):>8}")

    if stable_results:
        print(f"\n\n{'='*75}")
        print("PASSING CONFIGURATIONS — YEAR 1 / YEAR 2 STABILITY")
        print(f"{'='*75}")
        for entry in stable_results:
            r, r_y1, r_y2 = entry['full'], entry['y1'], entry['y2']
            flag = "STABLE" if entry['stable'] else "UNSTABLE"
            print(f"\n  Config: {r['label']}")
            print(f"  Full: PF={r.get('profit_factor','N/A')}  Trades={r['trade_count']}  Net=${r.get('net_profit',0):,.0f}  MaxDD=${r.get('max_drawdown',0):,.0f}")
            print(f"  Y1:   PF={r_y1.get('profit_factor','N/A')}  Trades={r_y1['trade_count']}  Net=${r_y1.get('net_profit',0):,.0f}")
            print(f"  Y2:   PF={r_y2.get('profit_factor','N/A')}  Trades={r_y2['trade_count']}  Net=${r_y2.get('net_profit',0):,.0f}")
            print(f"  Stability: {flag}")
    else:
        print("\n\n*** NO CONFIGURATIONS PASSED PF > 1.20 ***")

    print("\n[DONE] Sprint 024 Component Precision Research complete.")


if __name__ == "__main__":
    main()
