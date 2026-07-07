"""
Atlas Research Engine — Sprint 026
Operational Characterisation: Atlas Execution Model A1
Stream B — Execution Intelligence

FROZEN MODEL A1 PARAMETERS (do not alter):
  Structural: ATR(5) / ATR(5)[20 bars ago] > 1.8
  Trend:      EMA9 > EMA21 > EMA50 (long) / EMA9 < EMA21 < EMA50 (short)
  Trigger:    Price touches/crosses EMA21
  Depth:      0.5 <= (swing_extreme - close) / ATR(14) <= 1.2
  Structure:  1-leg pullback
  Timeframe:  5-minute MNQ
  Risk/Reward: Stop = 1.0 ATR, Target = 2.0 ATR (1:2)

Characterisation Dimensions:
  C1:  PM Session by Hour (12-13, 13-14, 14-15, 15-16)
  C2:  Day of Week (Mon-Fri)
  C3:  Monthly Consistency
  C4:  Long vs Short (deep metrics)
  C5:  Volatility Quartiles (daily ATR at entry)
  C6:  Trend Strength Quartiles (ADX14 at entry)
  C7:  Trade Duration Distribution (winners vs losers)
  C8:  Consecutive Outcomes (streak distribution)
  C9:  Losing Streak Probability
  C10: Risk-of-Ruin Estimation
  C11: Equity Curve Stability (R-squared)
"""

import pandas as pd
import numpy as np
from pathlib import Path
import random
from scipy import stats as scipy_stats

DATA_PATH       = Path("/home/ubuntu/Project-Atlas/data/raw/massive/MNQ_5min_full.csv")
MNQ_POINT_VALUE = 2.0
COMMISSION      = 1.00
TICK_SIZE       = 0.25
STOP_ATR_MULT   = 1.0
TARGET_RR       = 2.0
EXP_LOOKBACK    = 20
EXP_RATIO       = 1.8
DEPTH_MIN       = 0.5
DEPTH_MAX       = 1.2

# ─────────────────────────────────────────────
# DATA LOADING
# ─────────────────────────────────────────────

def load_and_prepare():
    df = pd.read_csv(DATA_PATH)
    df['ts'] = pd.to_datetime(df['timestamp_et'], utc=True)
    df = df.sort_values('ts').reset_index(drop=True)
    df['date']    = df['ts'].dt.date
    df['hour']    = df['ts'].dt.hour
    df['minute']  = df['ts'].dt.minute
    df['dow']     = df['ts'].dt.day_name()
    df['month']   = df['ts'].dt.to_period('M').astype(str)
    df['quarter'] = df['ts'].dt.to_period('Q').astype(str)
    df['is_rth']  = (
        ((df['hour'] == 9) & (df['minute'] >= 30)) |
        ((df['hour'] >= 10) & (df['hour'] <= 15))
    )
    df['pm_hour'] = np.where(
        df['is_rth'] & (df['hour'] >= 12),
        df['hour'].astype(str) + ':00-' + (df['hour'] + 1).astype(str) + ':00',
        'OTHER'
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

    # ADX(14) — vectorised
    plus_dm  = np.maximum(df['high'].diff(), 0)
    minus_dm = np.maximum(-df['low'].diff(), 0)
    plus_dm  = np.where(plus_dm > minus_dm, plus_dm, 0)
    minus_dm = np.where(minus_dm > plus_dm, minus_dm, 0)
    tr_s     = pd.Series(tr).rolling(14, min_periods=1).sum()
    plus_di  = 100 * pd.Series(plus_dm).rolling(14, min_periods=1).sum() / tr_s.replace(0, np.nan)
    minus_di = 100 * pd.Series(minus_dm).rolling(14, min_periods=1).sum() / tr_s.replace(0, np.nan)
    dx       = 100 * (plus_di - minus_di).abs() / (plus_di + minus_di).replace(0, np.nan)
    df['adx14'] = dx.ewm(span=14, adjust=False).mean()

    # Daily ATR for volatility quartile
    daily_atr = df.groupby('date')['tr'].mean().rename('daily_atr')
    df = df.merge(daily_atr, on='date', how='left')

    df['uptrend']   = (df['ema9'] > df['ema21']) & (df['ema21'] > df['ema50'])
    df['downtrend'] = (df['ema9'] < df['ema21']) & (df['ema21'] < df['ema50'])

    prev_close = df['close'].shift(1)
    df['pb_long_touch']  = (prev_close > df['ema21']) & (df['close'] <= df['ema21'] * 1.001)
    df['pb_short_touch'] = (prev_close < df['ema21']) & (df['close'] >= df['ema21'] * 0.999)
    df['swing_high_10'] = df['high'].shift(1).rolling(10, min_periods=1).max()
    df['swing_low_10']  = df['low'].shift(1).rolling(10, min_periods=1).min()
    df['pb_depth_long']  = (df['swing_high_10'] - df['close']) / df['atr14'].replace(0, np.nan)
    df['pb_depth_short'] = (df['close'] - df['swing_low_10'])  / df['atr14'].replace(0, np.nan)

    return df.reset_index(drop=True)


def precompute_expansion(df):
    atr5 = df['atr5'].values
    n    = len(atr5)
    sig  = np.zeros(n, dtype=bool)
    for i in range(EXP_LOOKBACK, n):
        prev = atr5[i - EXP_LOOKBACK]
        if prev > 0:
            sig[i] = atr5[i] / prev > EXP_RATIO
    return sig


# ─────────────────────────────────────────────
# TRADE SIMULATION
# ─────────────────────────────────────────────

def simulate_trade(close, high, low, is_rth, entry_idx, direction, stop_pts, target_pts):
    entry_price  = close[entry_idx]
    stop_price   = entry_price - direction * stop_pts
    target_price = entry_price + direction * target_pts
    n = len(close)

    for i in range(entry_idx + 1, min(entry_idx + 300, n)):
        if not is_rth[i]:
            exit_price = close[i - 1]
            return direction * (exit_price - entry_price) * MNQ_POINT_VALUE - COMMISSION, i - entry_idx, 'EOD'
        if direction == 1:
            if low[i]  <= stop_price:
                return direction * (stop_price  - entry_price) * MNQ_POINT_VALUE - COMMISSION, i - entry_idx, 'STOP'
            if high[i] >= target_price:
                return direction * (target_price - entry_price) * MNQ_POINT_VALUE - COMMISSION, i - entry_idx, 'TARGET'
        else:
            if high[i] >= stop_price:
                return direction * (stop_price  - entry_price) * MNQ_POINT_VALUE - COMMISSION, i - entry_idx, 'STOP'
            if low[i]  <= target_price:
                return direction * (target_price - entry_price) * MNQ_POINT_VALUE - COMMISSION, i - entry_idx, 'TARGET'

    exit_price = close[min(entry_idx + 299, n - 1)]
    return direction * (exit_price - entry_price) * MNQ_POINT_VALUE - COMMISSION, 299, 'TIMEOUT'


# ─────────────────────────────────────────────
# MODEL RUNNER (returns rich trade records)
# ─────────────────────────────────────────────

def run_model(df, exp_signal):
    close  = df['close'].values
    high   = df['high'].values
    low    = df['low'].values
    is_rth = df['is_rth'].values
    atr14  = df['atr14'].values
    adx14  = df['adx14'].values
    daily_atr = df['daily_atr'].values
    uptrend   = df['uptrend'].values
    downtrend = df['downtrend'].values
    pb_lt = df['pb_long_touch'].values
    pb_st = df['pb_short_touch'].values
    pb_dl = df['pb_depth_long'].values
    pb_ds = df['pb_depth_short'].values
    hour_arr    = df['hour'].values
    dow_arr     = df['dow'].values
    month_arr   = df['month'].values
    pm_hour_arr = df['pm_hour'].values

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
            if not np.isnan(d) and DEPTH_MIN <= d <= DEPTH_MAX:
                direction = 1
        if direction is None and downtrend[i] and pb_st[i]:
            d = pb_ds[i]
            if not np.isnan(d) and DEPTH_MIN <= d <= DEPTH_MAX:
                direction = -1

        if direction is None:
            i += 1
            continue

        stop_pts   = STOP_ATR_MULT * atr14[i]
        target_pts = TARGET_RR * stop_pts
        if stop_pts <= 0:
            i += 1
            continue

        pnl, bars, exit_type = simulate_trade(close, high, low, is_rth, i, direction, stop_pts, target_pts)
        trades.append({
            'pnl':       pnl,
            'direction': direction,
            'bars':      bars,
            'exit_type': exit_type,
            'hour':      int(hour_arr[i]),
            'dow':       str(dow_arr[i]),
            'month':     str(month_arr[i]),
            'pm_hour':   str(pm_hour_arr[i]),
            'adx14':     float(adx14[i]) if not np.isnan(adx14[i]) else 0.0,
            'daily_atr': float(daily_atr[i]) if not np.isnan(daily_atr[i]) else 0.0,
            'stop_pts':  stop_pts,
        })
        i += bars

    return trades


# ─────────────────────────────────────────────
# ANALYSIS HELPERS
# ─────────────────────────────────────────────

def group_metrics(trades, key_fn, label=''):
    groups = {}
    for t in trades:
        k = key_fn(t)
        groups.setdefault(k, []).append(t['pnl'])

    results = {}
    for k, pnls in groups.items():
        winners = [p for p in pnls if p > 0]
        losers  = [p for p in pnls if p <= 0]
        gp = sum(winners) if winners else 0
        gl = abs(sum(losers)) if losers else 0.001
        results[k] = {
            'trades': len(pnls),
            'net':    round(sum(pnls), 2),
            'pf':     round(gp / gl, 3),
            'wr':     round(len(winners) / len(pnls) * 100, 1),
            'avg_w':  round(np.mean(winners), 2) if winners else 0,
            'avg_l':  round(np.mean(losers),  2) if losers  else 0,
        }
    return results


def print_group(results, sort_key=None, title=''):
    print(f"\n  {title}")
    print(f"  {'Group':<22} {'Trades':>7} {'PF':>6} {'Net P&L':>10} {'WR%':>6} {'Avg Win':>8} {'Avg Loss':>9}")
    print(f"  {'-'*75}")
    keys = sorted(results.keys(), key=sort_key) if sort_key else sorted(results.keys())
    for k in keys:
        r = results[k]
        print(f"  {str(k):<22} {r['trades']:>7}  {r['pf']:>6.3f}  ${r['net']:>9,.0f}  {r['wr']:>5.1f}%  ${r['avg_w']:>7,.2f}  ${r['avg_l']:>8,.2f}")


# ─────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────

def main():
    print("=" * 75)
    print("ATLAS RESEARCH ENGINE — SPRINT 026")
    print("Operational Characterisation: Atlas Execution Model A1")
    print("=" * 75)
    print("\nFROZEN PARAMETERS: ExpLookback=20 | ExpRatio=1.8 | Depth=0.5-1.2 | 1-leg | 5-min | 1:2 R:R")

    print("\n[1] Loading data...")
    df = load_and_prepare()
    print(f"    Total bars: {len(df):,}")

    exp_signal = precompute_expansion(df)

    print("\n[2] Running Model A1 (frozen)...")
    trades = run_model(df, exp_signal)
    print(f"    Total trades: {len(trades)}")
    pnls = [t['pnl'] for t in trades]
    winners = [p for p in pnls if p > 0]
    losers  = [p for p in pnls if p <= 0]
    gp = sum(winners); gl = abs(sum(losers)) or 0.001
    print(f"    PF: {gp/gl:.3f}  Net: ${sum(pnls):,.0f}  WR: {len(winners)/len(pnls)*100:.1f}%")

    # ─────────────────────────────────────────
    # C1: PM HOUR DECOMPOSITION
    # ─────────────────────────────────────────
    print(f"\n{'='*75}")
    print("C1: PM Session by Hour")
    print(f"{'='*75}")
    pm_results = group_metrics(trades, lambda t: t['pm_hour'])
    print_group(pm_results, sort_key=lambda k: k, title="Hour Bucket")

    # ─────────────────────────────────────────
    # C2: DAY OF WEEK
    # ─────────────────────────────────────────
    print(f"\n{'='*75}")
    print("C2: Day of Week")
    print(f"{'='*75}")
    dow_order = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
    dow_results = group_metrics(trades, lambda t: t['dow'])
    print_group(dow_results, sort_key=lambda k: dow_order.index(k) if k in dow_order else 99, title="Day of Week")

    # ─────────────────────────────────────────
    # C3: MONTHLY CONSISTENCY
    # ─────────────────────────────────────────
    print(f"\n{'='*75}")
    print("C3: Monthly Consistency")
    print(f"{'='*75}")
    month_results = group_metrics(trades, lambda t: t['month'])
    print_group(month_results, sort_key=lambda k: k, title="Month")
    profitable_months = sum(1 for r in month_results.values() if r['net'] > 0)
    total_months = len(month_results)
    print(f"\n  Profitable months: {profitable_months}/{total_months} ({profitable_months/total_months*100:.0f}%)")

    # ─────────────────────────────────────────
    # C4: LONG vs SHORT (DEEP)
    # ─────────────────────────────────────────
    print(f"\n{'='*75}")
    print("C4: Long vs Short (Deep Metrics)")
    print(f"{'='*75}")
    for d, label in [(1, 'Long'), (-1, 'Short')]:
        t_sub = [t for t in trades if t['direction'] == d]
        pnl_sub = [t['pnl'] for t in t_sub]
        w_sub = [p for p in pnl_sub if p > 0]
        l_sub = [p for p in pnl_sub if p <= 0]
        dur_w = [t['bars'] for t in t_sub if t['pnl'] > 0]
        dur_l = [t['bars'] for t in t_sub if t['pnl'] <= 0]
        gp_s = sum(w_sub); gl_s = abs(sum(l_sub)) or 0.001
        print(f"\n  {label}: {len(t_sub)} trades  PF={gp_s/gl_s:.3f}  Net=${sum(pnl_sub):,.0f}  WR={len(w_sub)/len(pnl_sub)*100:.1f}%")
        print(f"    Avg Winner: ${np.mean(w_sub):,.2f}  Avg Loser: ${np.mean(l_sub):,.2f}")
        print(f"    Avg Duration (winner): {np.mean(dur_w):.1f} bars  Avg Duration (loser): {np.mean(dur_l):.1f} bars")

    # ─────────────────────────────────────────
    # C5: VOLATILITY QUARTILES
    # ─────────────────────────────────────────
    print(f"\n{'='*75}")
    print("C5: Volatility Quartiles (Daily ATR at Entry)")
    print(f"{'='*75}")
    daily_atrs = [t['daily_atr'] for t in trades if t['daily_atr'] > 0]
    q_cuts = np.percentile(daily_atrs, [25, 50, 75])
    def vol_quartile(t):
        v = t['daily_atr']
        if v <= q_cuts[0]: return f"Q1 (low, <={q_cuts[0]:.1f})"
        if v <= q_cuts[1]: return f"Q2 ({q_cuts[0]:.1f}-{q_cuts[1]:.1f})"
        if v <= q_cuts[2]: return f"Q3 ({q_cuts[1]:.1f}-{q_cuts[2]:.1f})"
        return f"Q4 (high, >{q_cuts[2]:.1f})"
    vol_results = group_metrics(trades, vol_quartile)
    print_group(vol_results, sort_key=lambda k: k, title="Volatility Quartile (Daily ATR)")

    # ─────────────────────────────────────────
    # C6: TREND STRENGTH QUARTILES (ADX)
    # ─────────────────────────────────────────
    print(f"\n{'='*75}")
    print("C6: Trend Strength Quartiles (ADX14 at Entry)")
    print(f"{'='*75}")
    adx_vals = [t['adx14'] for t in trades if t['adx14'] > 0]
    adx_cuts = np.percentile(adx_vals, [25, 50, 75])
    def adx_quartile(t):
        v = t['adx14']
        if v <= adx_cuts[0]: return f"Q1 (weak, <={adx_cuts[0]:.1f})"
        if v <= adx_cuts[1]: return f"Q2 ({adx_cuts[0]:.1f}-{adx_cuts[1]:.1f})"
        if v <= adx_cuts[2]: return f"Q3 ({adx_cuts[1]:.1f}-{adx_cuts[2]:.1f})"
        return f"Q4 (strong, >{adx_cuts[2]:.1f})"
    adx_results = group_metrics(trades, adx_quartile)
    print_group(adx_results, sort_key=lambda k: k, title="Trend Strength Quartile (ADX14)")

    # ─────────────────────────────────────────
    # C7: TRADE DURATION DISTRIBUTION
    # ─────────────────────────────────────────
    print(f"\n{'='*75}")
    print("C7: Trade Duration Distribution (in 5-min bars)")
    print(f"{'='*75}")
    dur_all = [t['bars'] for t in trades]
    dur_win = [t['bars'] for t in trades if t['pnl'] > 0]
    dur_los = [t['bars'] for t in trades if t['pnl'] <= 0]
    print(f"  All trades — Mean: {np.mean(dur_all):.1f}  Median: {np.median(dur_all):.0f}  P90: {np.percentile(dur_all, 90):.0f}  Max: {max(dur_all)}")
    print(f"  Winners   — Mean: {np.mean(dur_win):.1f}  Median: {np.median(dur_win):.0f}  P90: {np.percentile(dur_win, 90):.0f}")
    print(f"  Losers    — Mean: {np.mean(dur_los):.1f}  Median: {np.median(dur_los):.0f}  P90: {np.percentile(dur_los, 90):.0f}")
    print(f"\n  Duration buckets (bars):")
    buckets = [(1, 5), (6, 15), (16, 30), (31, 60), (61, 120), (121, 300)]
    for lo, hi in buckets:
        cnt = sum(1 for b in dur_all if lo <= b <= hi)
        pct = cnt / len(dur_all) * 100
        print(f"    {lo:>3}-{hi:<3} bars: {cnt:>4} trades ({pct:.1f}%)")

    # ─────────────────────────────────────────
    # C8 & C9: STREAK DISTRIBUTION & PROBABILITY
    # ─────────────────────────────────────────
    print(f"\n{'='*75}")
    print("C8: Consecutive Outcome Distribution")
    print(f"{'='*75}")
    outcomes = [1 if p > 0 else 0 for p in pnls]
    win_streaks = []; loss_streaks = []
    cur_w = cur_l = 0
    for o in outcomes:
        if o == 1:
            cur_w += 1
            if cur_l > 0: loss_streaks.append(cur_l); cur_l = 0
        else:
            cur_l += 1
            if cur_w > 0: win_streaks.append(cur_w); cur_w = 0
    if cur_w > 0: win_streaks.append(cur_w)
    if cur_l > 0: loss_streaks.append(cur_l)

    print(f"  Winning streak distribution:")
    for n in range(1, max(win_streaks) + 1):
        cnt = win_streaks.count(n)
        if cnt > 0:
            print(f"    {n} consecutive wins:  {cnt} occurrences")

    print(f"\n  Losing streak distribution:")
    for n in range(1, max(loss_streaks) + 1):
        cnt = loss_streaks.count(n)
        if cnt > 0:
            print(f"    {n} consecutive losses: {cnt} occurrences")

    print(f"\n{'='*75}")
    print("C9: Losing Streak Probability")
    print(f"{'='*75}")
    wr = len(winners) / len(pnls)
    lr = 1 - wr
    print(f"  Win Rate: {wr*100:.1f}%  Loss Rate: {lr*100:.1f}%")
    print(f"  Probability of N consecutive losses (independent):")
    for n in range(1, 11):
        prob = lr ** n * 100
        print(f"    {n} losses in a row: {prob:.2f}%")

    # ─────────────────────────────────────────
    # C10: RISK-OF-RUIN
    # ─────────────────────────────────────────
    print(f"\n{'='*75}")
    print("C10: Risk-of-Ruin Estimation")
    print(f"{'='*75}")
    avg_w = np.mean(winners)
    avg_l = abs(np.mean(losers))
    payoff_ratio = avg_w / avg_l
    kelly = wr - (lr / payoff_ratio)
    print(f"  Avg Winner: ${avg_w:.2f}  Avg Loser: ${avg_l:.2f}  Payoff Ratio: {payoff_ratio:.3f}")
    print(f"  Kelly Criterion (full): {kelly*100:.2f}%")
    print(f"  Kelly Criterion (half): {kelly*50:.2f}%  (recommended safe maximum)")
    print(f"  Kelly Criterion (quarter): {kelly*25:.2f}%  (conservative)")

    # Risk-of-ruin using empirical formula: RoR = ((1-edge)/(1+edge))^(capital/risk_per_trade)
    # edge = wr * payoff_ratio - lr
    edge = wr * payoff_ratio - lr
    account_sizes = [50000, 100000]
    risk_pcts = [0.005, 0.01, 0.02]
    print(f"\n  Risk-of-Ruin estimates (reaching 50% drawdown of account):")
    print(f"  {'Account':>10} {'Risk%':>7} {'Risk$':>8} {'Edge':>7} {'RoR%':>8}")
    print(f"  {'-'*50}")
    for acct in account_sizes:
        for rp in risk_pcts:
            risk_dollar = acct * rp
            if edge > 0:
                ror = ((1 - edge) / (1 + edge)) ** (acct * 0.5 / risk_dollar)
                print(f"  ${acct:>9,} {rp*100:>6.1f}%  ${risk_dollar:>7,.0f}  {edge:>7.4f}  {ror*100:>7.4f}%")

    # ─────────────────────────────────────────
    # C11: EQUITY CURVE STABILITY (R-SQUARED)
    # ─────────────────────────────────────────
    print(f"\n{'='*75}")
    print("C11: Equity Curve Stability")
    print(f"{'='*75}")
    equity = np.cumsum(pnls)
    x = np.arange(len(equity))
    slope, intercept, r_value, p_value, std_err = scipy_stats.linregress(x, equity)
    r_squared = r_value ** 2
    print(f"  R-squared of equity curve: {r_squared:.4f}")
    print(f"  Slope ($ per trade): ${slope:.4f}")
    print(f"  Interpretation: {'Strong linear growth' if r_squared > 0.85 else 'Moderate linearity' if r_squared > 0.70 else 'Weak linearity — volatile equity curve'}")

    peak = np.maximum.accumulate(equity)
    max_dd = (equity - peak).min()
    print(f"  Max Drawdown: ${max_dd:,.2f}")
    print(f"  Final Equity: ${equity[-1]:,.2f}")
    print(f"  Calmar Ratio (Net/MaxDD): {abs(equity[-1]/max_dd):.2f}")

    # ─────────────────────────────────────────
    # SUMMARY TABLE
    # ─────────────────────────────────────────
    print(f"\n\n{'='*75}")
    print("SPRINT 026 — MODEL A1 CHARACTERISATION SUMMARY")
    print(f"{'='*75}")
    print(f"\n  Total Trades:       {len(trades)}")
    print(f"  Profit Factor:      {gp/gl:.3f}")
    print(f"  Net Profit:         ${sum(pnls):,.0f}")
    print(f"  Win Rate:           {wr*100:.1f}%")
    print(f"  Avg Winner:         ${avg_w:,.2f}")
    print(f"  Avg Loser:          ${-avg_l:,.2f}")
    print(f"  Max Drawdown:       ${max_dd:,.2f}")
    print(f"  Equity R-squared:   {r_squared:.4f}")
    print(f"  Kelly (full):       {kelly*100:.2f}%")
    print(f"  Kelly (half):       {kelly*50:.2f}%")
    print(f"  Profitable months:  {profitable_months}/{total_months}")
    print(f"\n  BEST HOUR:          {max(pm_results, key=lambda k: pm_results[k]['pf']) if pm_results else 'N/A'}")
    print(f"  BEST DAY:           {max(dow_results, key=lambda k: dow_results[k]['pf']) if dow_results else 'N/A'}")
    print(f"  BEST VOL QUARTILE:  {max(vol_results, key=lambda k: vol_results[k]['pf']) if vol_results else 'N/A'}")
    print(f"  BEST ADX QUARTILE:  {max(adx_results, key=lambda k: adx_results[k]['pf']) if adx_results else 'N/A'}")

    print("\n[DONE] Sprint 026 Characterisation complete.")


if __name__ == "__main__":
    main()
