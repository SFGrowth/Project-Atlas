"""
Atlas Research Engine — Sprint 025
Independent Validation: Atlas Execution Model A1 (Candidate)
Stream B — Execution Intelligence

FROZEN MODEL A1 PARAMETERS (do not alter):
  Structural: ATR(5) / ATR(5)[20 bars ago] > 1.8
  Trend:      EMA9 > EMA21 > EMA50 (long) / EMA9 < EMA21 < EMA50 (short)
  Trigger:    Price touches/crosses EMA21
  Depth:      0.5 <= (swing_extreme - close) / ATR(14) <= 1.2
  Structure:  1-leg pullback
  Timeframe:  5-minute MNQ
  Risk/Reward: Stop = 1.0 ATR, Target = 2.0 ATR (1:2)

Validation Tests:
  T1: Slippage & Commission Stress (0, 1, 2, 4 ticks)
  T2: Parameter Sensitivity / Neighbourhood Analysis
  T3: Quarter-by-Quarter Stability (8 quarters)
  T4: Session Decomposition (AM vs PM)
  T5: Long vs Short Decomposition
  T6: Monte Carlo Resampling (1,000 shuffles)
"""

import pandas as pd
import numpy as np
from pathlib import Path
import random

# ─────────────────────────────────────────────
# FROZEN MODEL A1 CONSTANTS
# ─────────────────────────────────────────────
DATA_PATH       = Path("/home/ubuntu/Project-Atlas/data/raw/massive/MNQ_5min_full.csv")
MNQ_POINT_VALUE = 2.0
BASE_COMMISSION = 1.00
STOP_ATR_MULT   = 1.0
TARGET_RR       = 2.0
TICK_SIZE       = 0.25   # MNQ tick = 0.25 points = $0.50

# FROZEN PARAMETERS
EXP_LOOKBACK = 20
EXP_RATIO    = 1.8
DEPTH_MIN    = 0.5
DEPTH_MAX    = 1.2

# Promotion criteria
MIN_TRADES   = 100
PF_THRESHOLD = 1.20
MAX_DD_LIMIT = -2000.0

# ─────────────────────────────────────────────
# DATA LOADING & FEATURE ENGINEERING
# ─────────────────────────────────────────────

def load_and_prepare():
    df = pd.read_csv(DATA_PATH)
    df['ts'] = pd.to_datetime(df['timestamp_et'], utc=True)
    df = df.sort_values('ts').reset_index(drop=True)
    df['date']    = df['ts'].dt.date
    df['hour']    = df['ts'].dt.hour
    df['minute']  = df['ts'].dt.minute
    df['quarter'] = df['ts'].dt.to_period('Q').astype(str)
    df['is_rth']  = (
        ((df['hour'] == 9) & (df['minute'] >= 30)) |
        ((df['hour'] >= 10) & (df['hour'] <= 15))
    )
    df['session'] = np.where(
        df['is_rth'] & ((df['hour'] < 12) | ((df['hour'] == 9) & (df['minute'] >= 30))),
        'AM', 'PM'
    )

    pc = df['close'].shift(1)
    tr = np.maximum(df['high'] - df['low'],
         np.maximum((df['high'] - pc).abs(), (df['low'] - pc).abs()))
    df['tr']    = tr
    df['atr5']  = tr.rolling(5,  min_periods=1).mean()
    df['atr14'] = tr.rolling(14, min_periods=1).mean()

    df['ema9']  = df['close'].ewm(span=9,  adjust=False).mean()
    df['ema21'] = df['close'].ewm(span=21, adjust=False).mean()
    df['ema50'] = df['close'].ewm(span=50, adjust=False).mean()

    df['uptrend']   = (df['ema9'] > df['ema21']) & (df['ema21'] > df['ema50'])
    df['downtrend'] = (df['ema9'] < df['ema21']) & (df['ema21'] < df['ema50'])

    prev_close = df['close'].shift(1)
    df['pb_long_touch']  = (prev_close > df['ema21']) & (df['close'] <= df['ema21'] * 1.001)
    df['pb_short_touch'] = (prev_close < df['ema21']) & (df['close'] >= df['ema21'] * 0.999)

    df['swing_high_10'] = df['high'].shift(1).rolling(10, min_periods=1).max()
    df['swing_low_10']  = df['low'].shift(1).rolling(10, min_periods=1).min()
    df['pb_depth_long']  = (df['swing_high_10'] - df['close']) / df['atr14'].replace(0, np.nan)
    df['pb_depth_short'] = (df['close'] - df['swing_low_10'])  / df['atr14'].replace(0, np.nan)

    return df


def precompute_expansion(df, lookback, ratio):
    atr5 = df['atr5'].values
    n    = len(atr5)
    sig  = np.zeros(n, dtype=bool)
    for i in range(lookback, n):
        prev = atr5[i - lookback]
        if prev > 0:
            sig[i] = atr5[i] / prev > ratio
    return sig


# ─────────────────────────────────────────────
# TRADE SIMULATION
# ─────────────────────────────────────────────

def simulate_trade(close, high, low, is_rth, entry_idx, direction,
                   stop_pts, target_pts, slippage_pts, commission):
    entry_price  = close[entry_idx] + direction * slippage_pts
    stop_price   = entry_price - direction * stop_pts
    target_price = entry_price + direction * target_pts
    n = len(close)

    for i in range(entry_idx + 1, min(entry_idx + 300, n)):
        if not is_rth[i]:
            exit_price = close[i - 1]
            return direction * (exit_price - entry_price) * MNQ_POINT_VALUE - commission, i - entry_idx, 'EOD'
        if direction == 1:
            if low[i]  <= stop_price:
                return direction * (stop_price  - entry_price) * MNQ_POINT_VALUE - commission, i - entry_idx, 'STOP'
            if high[i] >= target_price:
                return direction * (target_price - entry_price) * MNQ_POINT_VALUE - commission, i - entry_idx, 'TARGET'
        else:
            if high[i] >= stop_price:
                return direction * (stop_price  - entry_price) * MNQ_POINT_VALUE - commission, i - entry_idx, 'STOP'
            if low[i]  <= target_price:
                return direction * (target_price - entry_price) * MNQ_POINT_VALUE - commission, i - entry_idx, 'TARGET'

    exit_price = close[min(entry_idx + 299, n - 1)]
    return direction * (exit_price - entry_price) * MNQ_POINT_VALUE - commission, 299, 'TIMEOUT'


# ─────────────────────────────────────────────
# CORE MODEL RUNNER
# ─────────────────────────────────────────────

def run_model(df, exp_signal, depth_min, depth_max, slippage_ticks=0, commission=BASE_COMMISSION):
    """Run Model A1 with specified parameters. Returns list of trade dicts."""
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
    session_arr = df['session'].values
    quarter_arr = df['quarter'].values
    date_arr    = df['date'].values

    slippage_pts = slippage_ticks * TICK_SIZE
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
        if uptrend[i] and pb_lt[i]:
            d = pb_dl[i]
            if not np.isnan(d) and depth_min <= d <= depth_max:
                direction = 1
        if direction is None and downtrend[i] and pb_st[i]:
            d = pb_ds[i]
            if not np.isnan(d) and depth_min <= d <= depth_max:
                direction = -1

        if direction is None:
            i += 1
            continue

        stop_pts   = STOP_ATR_MULT * atr14[i]
        target_pts = TARGET_RR * stop_pts
        if stop_pts <= 0:
            i += 1
            continue

        pnl, bars, exit_type = simulate_trade(
            close, high, low, is_rth, i, direction,
            stop_pts, target_pts, slippage_pts, commission
        )
        trades.append({
            'pnl': pnl, 'direction': direction, 'bars': bars,
            'exit_type': exit_type,
            'session': session_arr[i],
            'quarter': quarter_arr[i],
            'date': date_arr[i],
        })
        i += bars

    return trades


# ─────────────────────────────────────────────
# METRICS
# ─────────────────────────────────────────────

def metrics(trades, label=''):
    if not trades:
        return {'label': label, 'trade_count': 0, 'verdict': 'NO_TRADES'}

    pnls = [t['pnl'] for t in trades]
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

    verdict = 'PASS' if pf >= PF_THRESHOLD and max_dd >= MAX_DD_LIMIT else 'FAIL'

    return {
        'label': label, 'trade_count': len(pnls),
        'net_profit': round(net, 2), 'profit_factor': round(pf, 3),
        'expectancy': round(exp, 2), 'win_rate': round(wr, 1),
        'max_drawdown': round(max_dd, 2), 'avg_winner': round(avg_w, 2),
        'avg_loser': round(avg_l, 2), 'largest_losing_streak': max_streak,
        'verdict': verdict,
    }


def print_metrics(r, indent='  '):
    if 'profit_factor' not in r:
        print(f"{indent}{r['label']}: {r.get('verdict','N/A')} ({r['trade_count']} trades, Net ${r.get('net_profit',0):,.0f})")
        return
    print(f"{indent}{r['label']}")
    print(f"{indent}  Trades: {r['trade_count']}  PF: {r['profit_factor']}  Net: ${r['net_profit']:,.0f}  MaxDD: ${r['max_drawdown']:,.0f}  WR: {r['win_rate']}%  Exp: ${r['expectancy']:.2f}  Streak: {r['largest_losing_streak']}  Verdict: {r['verdict']}")


# ─────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────

def main():
    print("=" * 75)
    print("ATLAS RESEARCH ENGINE — SPRINT 025")
    print("Independent Validation: Atlas Execution Model A1 (Candidate)")
    print("=" * 75)
    print("\nFROZEN PARAMETERS: ExpLookback=20 | ExpRatio=1.8 | Depth=0.5-1.2 | 1-leg | 5-min | 1:2 R:R")

    print("\n[1] Loading data...")
    df = load_and_prepare()
    print(f"    Total bars: {len(df):,}")

    # Pre-compute frozen expansion signal
    exp_signal = precompute_expansion(df, EXP_LOOKBACK, EXP_RATIO)

    # ── BASELINE (frozen model, no slippage) ──
    print("\n[2] Running frozen baseline...")
    base_trades = run_model(df, exp_signal, DEPTH_MIN, DEPTH_MAX)
    base = metrics(base_trades, "Model A1 Baseline (0 slippage)")
    print_metrics(base)

    # ─────────────────────────────────────────
    # TEST 1: SLIPPAGE & COMMISSION STRESS
    # ─────────────────────────────────────────
    print(f"\n{'='*75}")
    print("TEST 1: Slippage & Commission Stress")
    print(f"{'='*75}")
    for ticks in [0, 1, 2, 4]:
        t = run_model(df, exp_signal, DEPTH_MIN, DEPTH_MAX, slippage_ticks=ticks)
        r = metrics(t, f"Slippage = {ticks} tick(s) ({ticks * TICK_SIZE:.2f} pts / ${ticks * TICK_SIZE * MNQ_POINT_VALUE:.2f})")
        print_metrics(r)

    # ─────────────────────────────────────────
    # TEST 2: PARAMETER SENSITIVITY
    # ─────────────────────────────────────────
    print(f"\n{'='*75}")
    print("TEST 2: Parameter Sensitivity (Neighbourhood Analysis)")
    print(f"{'='*75}")
    print("  Varying Expansion Ratio (Depth fixed at 0.5-1.2):")
    for ratio in [1.6, 1.7, 1.8, 1.9, 2.0, 2.1]:
        sig = precompute_expansion(df, EXP_LOOKBACK, ratio)
        t = run_model(df, sig, DEPTH_MIN, DEPTH_MAX)
        r = metrics(t, f"  ExpRatio={ratio}")
        pf_s = f"{r.get('profit_factor','N/A')}" if 'profit_factor' in r else r.get('verdict','N/A')
        print(f"    ratio={ratio:<5}  Trades={r['trade_count']:>4}  PF={pf_s:>6}  Net=${r.get('net_profit',0):>8,.0f}  MaxDD=${r.get('max_drawdown',0):>8,.0f}  {r.get('verdict','N/A')}")

    print("  Varying Depth Min (Ratio fixed at 1.8, DepthMax=1.2):")
    for dmin in [0.3, 0.4, 0.5, 0.6, 0.7]:
        t = run_model(df, exp_signal, dmin, DEPTH_MAX)
        r = metrics(t, f"  DepthMin={dmin}")
        pf_s = f"{r.get('profit_factor','N/A')}" if 'profit_factor' in r else r.get('verdict','N/A')
        print(f"    dmin={dmin:<5}  Trades={r['trade_count']:>4}  PF={pf_s:>6}  Net=${r.get('net_profit',0):>8,.0f}  MaxDD=${r.get('max_drawdown',0):>8,.0f}  {r.get('verdict','N/A')}")

    print("  Varying Depth Max (Ratio fixed at 1.8, DepthMin=0.5):")
    for dmax in [1.0, 1.1, 1.2, 1.3, 1.4]:
        t = run_model(df, exp_signal, DEPTH_MIN, dmax)
        r = metrics(t, f"  DepthMax={dmax}")
        pf_s = f"{r.get('profit_factor','N/A')}" if 'profit_factor' in r else r.get('verdict','N/A')
        print(f"    dmax={dmax:<5}  Trades={r['trade_count']:>4}  PF={pf_s:>6}  Net=${r.get('net_profit',0):>8,.0f}  MaxDD=${r.get('max_drawdown',0):>8,.0f}  {r.get('verdict','N/A')}")

    # ─────────────────────────────────────────
    # TEST 3: QUARTER-BY-QUARTER STABILITY
    # ─────────────────────────────────────────
    print(f"\n{'='*75}")
    print("TEST 3: Quarter-by-Quarter Stability")
    print(f"{'='*75}")
    quarters = sorted(df['quarter'].unique())
    q_results = {}
    for q in quarters:
        df_q = df[df['quarter'] == q].reset_index(drop=True)
        if len(df_q) < 100:
            continue
        exp_q = precompute_expansion(df_q, EXP_LOOKBACK, EXP_RATIO)
        t = run_model(df_q, exp_q, DEPTH_MIN, DEPTH_MAX)
        r = metrics(t, q)
        q_results[q] = r
        pf_s = f"{r.get('profit_factor','N/A')}" if 'profit_factor' in r else r.get('verdict','N/A')
        net_s = f"${r.get('net_profit',0):>8,.0f}" if 'net_profit' in r else 'N/A'
        print(f"  {q}  Trades={r['trade_count']:>3}  PF={pf_s:>6}  Net={net_s}  {r.get('verdict','N/A')}")

    profitable_qs = sum(1 for r in q_results.values() if r.get('net_profit', 0) > 0)
    total_qs      = len(q_results)
    print(f"\n  Profitable quarters: {profitable_qs}/{total_qs} ({profitable_qs/total_qs*100:.0f}%)")

    # ─────────────────────────────────────────
    # TEST 4: SESSION DECOMPOSITION
    # ─────────────────────────────────────────
    print(f"\n{'='*75}")
    print("TEST 4: Session Decomposition (AM vs PM)")
    print(f"{'='*75}")
    for sess in ['AM', 'PM']:
        t = [tr for tr in base_trades if tr['session'] == sess]
        r = metrics(t, f"{sess} Session")
        print_metrics(r)

    # ─────────────────────────────────────────
    # TEST 5: LONG vs SHORT DECOMPOSITION
    # ─────────────────────────────────────────
    print(f"\n{'='*75}")
    print("TEST 5: Long vs Short Decomposition")
    print(f"{'='*75}")
    for d, label in [(1, 'Long'), (-1, 'Short')]:
        t = [tr for tr in base_trades if tr['direction'] == d]
        r = metrics(t, label)
        print_metrics(r)

    # ─────────────────────────────────────────
    # TEST 6: MONTE CARLO (1,000 shuffles)
    # ─────────────────────────────────────────
    print(f"\n{'='*75}")
    print("TEST 6: Monte Carlo Resampling (1,000 shuffles)")
    print(f"{'='*75}")
    pnls = [t['pnl'] for t in base_trades]
    n_mc = 1000
    mc_max_dds = []
    mc_net_pnls = []
    random.seed(42)
    for _ in range(n_mc):
        shuffled = random.sample(pnls, len(pnls))
        equity   = np.cumsum(shuffled)
        peak     = np.maximum.accumulate(equity)
        mc_max_dds.append((equity - peak).min())
        mc_net_pnls.append(equity[-1])

    mc_max_dds  = sorted(mc_max_dds)
    mc_net_pnls = sorted(mc_net_pnls)
    p5_dd   = mc_max_dds[int(0.05 * n_mc)]   # 5th percentile (worst 5%)
    p50_dd  = mc_max_dds[int(0.50 * n_mc)]
    p95_dd  = mc_max_dds[int(0.95 * n_mc)]   # 95th percentile (best 95%)
    p5_net  = mc_net_pnls[int(0.05 * n_mc)]
    p50_net = mc_net_pnls[int(0.50 * n_mc)]
    p95_net = mc_net_pnls[int(0.95 * n_mc)]

    print(f"  Simulations: {n_mc:,}")
    print(f"  Max Drawdown — 5th pct (worst):  ${p5_dd:,.2f}")
    print(f"  Max Drawdown — 50th pct (median): ${p50_dd:,.2f}")
    print(f"  Max Drawdown — 95th pct (best):  ${p95_dd:,.2f}")
    print(f"  Net P&L      — 5th pct (worst):  ${p5_net:,.2f}")
    print(f"  Net P&L      — 50th pct (median): ${p50_net:,.2f}")
    print(f"  Net P&L      — 95th pct (best):  ${p95_net:,.2f}")
    dd_pass = p5_dd >= MAX_DD_LIMIT
    print(f"\n  Worst-case (5th pct) DD ${p5_dd:,.2f} vs limit ${MAX_DD_LIMIT:,.0f}: {'PASS' if dd_pass else 'FAIL'}")

    # ─────────────────────────────────────────
    # PROMOTION VERDICT
    # ─────────────────────────────────────────
    print(f"\n\n{'='*75}")
    print("SPRINT 025 — PROMOTION VERDICT")
    print(f"{'='*75}")

    slip2_trades = run_model(df, exp_signal, DEPTH_MIN, DEPTH_MAX, slippage_ticks=2)
    slip2 = metrics(slip2_trades, "2-tick slippage")
    slip2_pass = slip2.get('profit_factor', 0) > 1.0

    # Sensitivity: check immediate neighbours
    neigh_results = []
    for ratio in [1.7, 1.9]:
        sig = precompute_expansion(df, EXP_LOOKBACK, ratio)
        t = run_model(df, sig, DEPTH_MIN, DEPTH_MAX)
        neigh_results.append(metrics(t))
    for dmin in [0.4, 0.6]:
        t = run_model(df, exp_signal, dmin, DEPTH_MAX)
        neigh_results.append(metrics(t))
    for dmax in [1.1, 1.3]:
        t = run_model(df, exp_signal, DEPTH_MIN, dmax)
        neigh_results.append(metrics(t))
    neigh_pass = all(r.get('profit_factor', 0) > 1.0 for r in neigh_results if r['trade_count'] >= MIN_TRADES)

    q_pass = profitable_qs / total_qs >= 0.50 if total_qs > 0 else False

    long_t  = [tr for tr in base_trades if tr['direction'] ==  1]
    short_t = [tr for tr in base_trades if tr['direction'] == -1]
    long_m  = metrics(long_t)
    short_m = metrics(short_t)
    ls_pass = (long_m.get('profit_factor', 0) > 1.0 and
               short_m.get('profit_factor', 0) > 1.0)

    mc_pass = dd_pass

    criteria = {
        'Profitable after 2-tick slippage':    (slip2_pass,  f"PF={slip2.get('profit_factor','N/A')}"),
        'Neighbourhood sensitivity (PF>1.0)':  (neigh_pass,  f"{sum(1 for r in neigh_results if r.get('profit_factor',0)>1.0 and r['trade_count']>=MIN_TRADES)}/{len([r for r in neigh_results if r['trade_count']>=MIN_TRADES])} neighbours positive"),
        'Profitable in >50% of quarters':      (q_pass,      f"{profitable_qs}/{total_qs} quarters profitable"),
        'Long & Short both PF > 1.0':          (ls_pass,     f"Long PF={long_m.get('profit_factor','N/A')}  Short PF={short_m.get('profit_factor','N/A')}"),
        'Monte Carlo worst-case DD in limits': (mc_pass,     f"5th pct DD=${p5_dd:,.0f}"),
    }

    all_pass = all(v for v, _ in criteria.values())

    for criterion, (passed, detail) in criteria.items():
        status = "PASS" if passed else "FAIL"
        print(f"  [{status}] {criterion}")
        print(f"         {detail}")

    print(f"\n  OVERALL PROMOTION VERDICT: {'PROMOTED — Atlas Execution Model A1' if all_pass else 'NOT PROMOTED — Candidate remains'}")

    print("\n[DONE] Sprint 025 Independent Validation complete.")


if __name__ == "__main__":
    main()
