"""
Atlas Sprint 021 — Stream B: Execution Intelligence Baseline Research
Two-part controlled experiment:

Research Question A:
  Do the candidate execution models possess a statistical edge
  independently of the Regime Engine?
  (No Regime Engine filter applied — RTH session only)

Research Question B:
  Once a baseline is established, what is the independent contribution
  of the frozen Regime Engine v1.0?
  (Execution Only vs Execution + Regime Engine v1.0)

Atlas Research Standards:
  - Every hypothesis assumed FALSE until statistically supported
  - All 12 robustness metrics reported for every result
  - Minimum 100 trades required for statistical validity
  - Acceptance: PF > 1.20, Max DD < $2,000, Trade Count >= 100
  - Only ONE variable changes between Experiment A and B (the Regime Engine)
"""

import pandas as pd
import numpy as np
import warnings
warnings.filterwarnings('ignore')

# ─────────────────────────────────────────────
# Configuration
# ─────────────────────────────────────────────
DATA_PATH   = "/home/ubuntu/Project-Atlas/data/raw/massive/MNQ_5min_full.csv"
POINT_VALUE = 2.0
ATR_LEN     = 14
STOP_ATR    = 1.0
TP_ATR      = 2.0
MAX_BARS    = 12
MIN_TRADES  = 100
ACCEPT_PF   = 1.20
ACCEPT_DD   = 2000.0

# ─────────────────────────────────────────────
# Data Loading
# ─────────────────────────────────────────────
def load_data():
    df = pd.read_csv(DATA_PATH)
    df['time'] = (pd.to_datetime(df['timestamp_et'], utc=True)
                    .dt.tz_convert('America/New_York')
                    .dt.tz_localize(None))
    df = df.sort_values('time').reset_index(drop=True)
    df['hour']     = df['time'].dt.hour
    df['minute']   = df['time'].dt.minute
    df['time_dec'] = df['hour'] + df['minute'] / 60.0
    df['date']     = df['time'].dt.date
    return df

# ─────────────────────────────────────────────
# Indicators
# ─────────────────────────────────────────────
def compute_indicators(df):
    hl = df['high'] - df['low']
    hc = (df['high'] - df['close'].shift(1)).abs()
    lc = (df['low']  - df['close'].shift(1)).abs()
    tr = pd.concat([hl, hc, lc], axis=1).max(axis=1)
    df['atr']      = tr.rolling(ATR_LEN).mean()
    df['atr_fast'] = tr.rolling(5).mean()
    df['atr_slow'] = tr.rolling(20).mean()

    df['ema9']  = df['close'].ewm(span=9,  adjust=False).mean()
    df['ema21'] = df['close'].ewm(span=21, adjust=False).mean()
    df['ema50'] = df['close'].ewm(span=50, adjust=False).mean()

    df['cum_vp']  = (df['close'] * df['volume']).groupby(df['date']).cumsum()
    df['cum_vol'] = df['volume'].groupby(df['date']).cumsum()
    df['vwap']    = df['cum_vp'] / df['cum_vol']

    df['swing_high_10'] = df['high'].rolling(10).max().shift(1)
    df['swing_low_10']  = df['low'].rolling(10).min().shift(1)

    df['vwap_dev_atr'] = (df['close'] - df['vwap']).abs() / df['atr'].replace(0, np.nan)
    df['atr_ratio']    = df['atr_fast'] / df['atr_slow'].replace(0, np.nan)

    # RTH session filter (9:30 – 16:00 ET)
    df['rth'] = (df['time_dec'] >= 9.5) & (df['time_dec'] < 16.0)

    # Frozen Regime Engine v1.0 filter
    df['regime_v1'] = (df['atr_ratio'] <= 0.7) & (df['vwap_dev_atr'] <= 1.5) & df['rth']

    return df

# ─────────────────────────────────────────────
# Session Label
# ─────────────────────────────────────────────
def get_session(t):
    if   9.5  <= t < 10.5: return 'Opening'
    elif 10.5 <= t < 12.0: return 'Mid-Morning'
    elif 12.0 <= t < 13.5: return 'Lunch'
    elif 13.5 <= t < 16.0: return 'Afternoon'
    return 'Other'

# ─────────────────────────────────────────────
# Trade Simulation
# ─────────────────────────────────────────────
def simulate_trades(df, sig_long, sig_short):
    trades = []
    closes    = df['close'].values
    highs     = df['high'].values
    lows      = df['low'].values
    atrs      = df['atr'].values
    times     = df['time'].values
    dates     = df['date'].values
    time_decs = df['time_dec'].values
    sl        = sig_long.values
    ss        = sig_short.values
    n         = len(df)
    i         = 0

    while i < n:
        entry_price = closes[i]
        atr_val     = atrs[i]

        if np.isnan(atr_val) or atr_val == 0:
            i += 1
            continue

        direction = None
        if sl[i]:
            direction = 'long'
            stop = entry_price - STOP_ATR * atr_val
            tp   = entry_price + TP_ATR  * atr_val
        elif ss[i]:
            direction = 'short'
            stop = entry_price + STOP_ATR * atr_val
            tp   = entry_price - TP_ATR  * atr_val

        if direction is None:
            i += 1
            continue

        sess   = get_session(time_decs[i])
        result = None
        end    = min(i + 1 + MAX_BARS, n)

        for j in range(i + 1, end):
            if direction == 'long':
                if highs[j] >= tp:
                    result = ('win',  tp   - entry_price); break
                if lows[j]  <= stop:
                    result = ('loss', stop - entry_price); break
            else:
                if lows[j]  <= tp:
                    result = ('win',  entry_price - tp);   break
                if highs[j] >= stop:
                    result = ('loss', entry_price - stop); break

        if result is None:
            idx = min(i + MAX_BARS, n - 1)
            raw = closes[idx] - entry_price if direction == 'long' else entry_price - closes[idx]
            result = ('timeout', raw)

        pnl = result[1] * POINT_VALUE
        trades.append({'outcome': result[0], 'pnl': pnl,
                       'time': times[i], 'date': dates[i],
                       'direction': direction, 'session': sess})
        i += MAX_BARS

    return trades

# ─────────────────────────────────────────────
# Metrics
# ─────────────────────────────────────────────
def pf(series):
    w = series[series > 0].sum()
    l = abs(series[series <= 0].sum())
    return round(w / l, 3) if l > 0 else (999.0 if w > 0 else 0.0)

def compute_metrics(trades, label):
    if len(trades) < MIN_TRADES:
        return {'label': label, 'trade_count': len(trades),
                'status': f'INSUFFICIENT ({len(trades)} < {MIN_TRADES})',
                'profit_factor': 0, 'net_profit': 0, 'win_rate': 0,
                'max_drawdown': 0, 'expectancy': 0, 'avg_winner': 0,
                'avg_loser': 0, 'largest_losing_streak': 0,
                'long_pf': 0, 'short_pf': 0,
                'both_positive': False, 'session_pf': {}, 'accepted': False}

    tdf     = pd.DataFrame(trades)
    winners = tdf[tdf['pnl'] > 0]['pnl']
    losers  = tdf[tdf['pnl'] <= 0]['pnl']

    net     = tdf['pnl'].sum()
    pf_val  = pf(tdf['pnl'])
    wr      = len(winners) / len(tdf) * 100
    avg_w   = winners.mean() if len(winners) > 0 else 0
    avg_l   = losers.mean()  if len(losers)  > 0 else 0
    exp     = tdf['pnl'].mean()

    equity  = tdf['pnl'].cumsum()
    peak    = equity.cummax()
    max_dd  = abs((equity - peak).min())

    streak = max_streak = 0
    for p in tdf['pnl']:
        streak = streak + 1 if p <= 0 else 0
        max_streak = max(max_streak, streak)

    long_trades  = tdf[tdf['direction'] == 'long']['pnl']
    short_trades = tdf[tdf['direction'] == 'short']['pnl']
    long_pf_val  = pf(long_trades)
    short_pf_val = pf(short_trades)

    sess_pf = {}
    for s in ['Opening', 'Mid-Morning', 'Lunch', 'Afternoon']:
        sp = tdf[tdf['session'] == s]['pnl']
        sess_pf[s] = pf(sp) if len(sp) >= 10 else 'N/A'

    accepted = (pf_val >= ACCEPT_PF and max_dd <= ACCEPT_DD and len(tdf) >= MIN_TRADES)

    return {
        'label': label, 'trade_count': len(tdf),
        'status': 'ACCEPTED' if accepted else 'REJECTED',
        'profit_factor': pf_val, 'net_profit': round(net, 2),
        'win_rate': round(wr, 1), 'max_drawdown': round(max_dd, 2),
        'expectancy': round(exp, 2), 'avg_winner': round(avg_w, 2),
        'avg_loser': round(avg_l, 2), 'largest_losing_streak': max_streak,
        'long_pf': long_pf_val, 'short_pf': short_pf_val,
        'long_pnl': round(long_trades.sum(), 2),
        'short_pnl': round(short_trades.sum(), 2),
        'both_positive': long_trades.sum() > 0 and short_trades.sum() > 0,
        'session_pf': sess_pf, 'accepted': accepted
    }

# ─────────────────────────────────────────────
# Print Result
# ─────────────────────────────────────────────
def print_result(r, hypothesis_text):
    print(f"\n{'='*65}")
    print(f"  {r['label']}")
    print(f"  Status: {r['status']}")
    print(f"{'='*65}")
    if 'INSUFFICIENT' in r['status']:
        print(f"  Trade Count: {r['trade_count']} — below minimum {MIN_TRADES}")
        return
    print(f"  Profit Factor:          {r['profit_factor']}")
    print(f"  Net Profit:             ${r['net_profit']:>10,.2f}")
    print(f"  Win Rate:               {r['win_rate']}%")
    print(f"  Max Drawdown:           ${r['max_drawdown']:>10,.2f}")
    print(f"  Expectancy (per trade): ${r['expectancy']:>10,.2f}")
    print(f"  Trade Count:            {r['trade_count']}")
    print(f"  Avg Winner:             ${r['avg_winner']:>10,.2f}")
    print(f"  Avg Loser:              ${r['avg_loser']:>10,.2f}")
    print(f"  Largest Losing Streak:  {r['largest_losing_streak']}")
    print(f"  Long  PF: {r['long_pf']}  (${r['long_pnl']:,.2f})")
    print(f"  Short PF: {r['short_pf']}  (${r['short_pnl']:,.2f})")
    print(f"  Both Directions +ve:    {r['both_positive']}")
    print(f"  Session PF:")
    for s, v in r['session_pf'].items():
        print(f"    {s:<15}: {v}")
    print(f"\n  ── Hypothesis / Result / Evidence / Decision ──")
    print(f"  Hypothesis: {hypothesis_text}")
    if r['accepted']:
        print(f"  Result:     TRUE")
        print(f"  Evidence:   PF={r['profit_factor']}, DD=${r['max_drawdown']:,.2f}, Trades={r['trade_count']}")
        print(f"  Decision:   ACCEPT")
    else:
        print(f"  Result:     FALSE")
        if r['profit_factor'] < ACCEPT_PF:
            gap = round(ACCEPT_PF - r['profit_factor'], 3)
            print(f"  Evidence:   PF={r['profit_factor']} (below {ACCEPT_PF} by {gap})")
        if r['max_drawdown'] > ACCEPT_DD:
            print(f"  Evidence:   Max DD=${r['max_drawdown']:,.2f} (exceeds ${ACCEPT_DD:,.0f})")
        print(f"  Decision:   REJECT — document in Knowledge Base")

# ─────────────────────────────────────────────
# Entry Signal Definitions
# ─────────────────────────────────────────────
def signals_pullback(df, regime_mask):
    uptrend   = (df['ema9'] > df['ema21']) & (df['ema21'] > df['ema50'])
    downtrend = (df['ema9'] < df['ema21']) & (df['ema21'] < df['ema50'])
    touched_long  = (df['low'].shift(1)  <= df['ema21'].shift(1)) & (df['close'].shift(1) >= df['ema21'].shift(1))
    touched_short = (df['high'].shift(1) >= df['ema21'].shift(1)) & (df['close'].shift(1) <= df['ema21'].shift(1))
    sig_l = regime_mask & uptrend   & touched_long  & (df['close'] > df['ema21'])
    sig_s = regime_mask & downtrend & touched_short & (df['close'] < df['ema21'])
    return sig_l, sig_s

def signals_liquidity_sweep(df, regime_mask):
    swept_low  = (df['low']  < df['swing_low_10'])  & (df['close'] > df['swing_low_10'])
    swept_high = (df['high'] > df['swing_high_10']) & (df['close'] < df['swing_high_10'])
    return regime_mask & swept_low, regime_mask & swept_high

def signals_breakout(df, regime_mask):
    uptrend   = (df['ema9'] > df['ema21']) & (df['ema21'] > df['ema50'])
    downtrend = (df['ema9'] < df['ema21']) & (df['ema21'] < df['ema50'])
    sig_l = regime_mask & uptrend   & (df['close'] > df['swing_high_10'])
    sig_s = regime_mask & downtrend & (df['close'] < df['swing_low_10'])
    return sig_l, sig_s

def signals_mean_reversion(df, regime_mask):
    far_below = (df['vwap_dev_atr'] > 1.5) & (df['close'] < df['vwap'])
    far_above = (df['vwap_dev_atr'] > 1.5) & (df['close'] > df['vwap'])
    rev_up    = df['close'] > df['close'].shift(1)
    rev_down  = df['close'] < df['close'].shift(1)
    return regime_mask & far_below & rev_up, regime_mask & far_above & rev_down

# ─────────────────────────────────────────────
# Run One Experiment Set
# ─────────────────────────────────────────────
def run_experiment(df, regime_mask, experiment_label):
    print(f"\n{'#'*65}")
    print(f"  {experiment_label}")
    bars = regime_mask.sum()
    pct  = bars / len(df) * 100
    print(f"  Available bars: {bars:,} ({pct:.1f}% of total)")
    print(f"{'#'*65}")

    results = []

    # H-B001: Pullback Continuation
    sl, ss = signals_pullback(df, regime_mask)
    print(f"\n  H-B001 Pullback: {sl.sum()} long / {ss.sum()} short signals")
    trades = simulate_trades(df, sl, ss)
    r = compute_metrics(trades, f'H-B001 Pullback [{experiment_label}]')
    print_result(r, "Pullback continuation entries produce PF > 1.20")
    results.append(r)

    # H-B002: Liquidity Sweep
    sl, ss = signals_liquidity_sweep(df, regime_mask)
    print(f"\n  H-B002 Liquidity Sweep: {sl.sum()} long / {ss.sum()} short signals")
    trades = simulate_trades(df, sl, ss)
    r = compute_metrics(trades, f'H-B002 Liquidity Sweep [{experiment_label}]')
    print_result(r, "Liquidity sweep entries produce PF > 1.20")
    results.append(r)

    # H-B003: Breakout Continuation
    sl, ss = signals_breakout(df, regime_mask)
    print(f"\n  H-B003 Breakout: {sl.sum()} long / {ss.sum()} short signals")
    trades = simulate_trades(df, sl, ss)
    r = compute_metrics(trades, f'H-B003 Breakout [{experiment_label}]')
    print_result(r, "Breakout continuation entries produce PF > 1.20")
    results.append(r)

    # H-B004: Mean Reversion
    sl, ss = signals_mean_reversion(df, regime_mask)
    print(f"\n  H-B004 Mean Reversion: {sl.sum()} long / {ss.sum()} short signals")
    trades = simulate_trades(df, sl, ss)
    r = compute_metrics(trades, f'H-B004 Mean Reversion [{experiment_label}]')
    print_result(r, "Mean reversion entries produce PF > 1.20")
    results.append(r)

    return results

# ─────────────────────────────────────────────
# Comparison Table
# ─────────────────────────────────────────────
def print_comparison(results_a, results_b):
    print(f"\n{'='*80}")
    print("  RESEARCH QUESTION B — Regime Engine v1.0 Contribution Analysis")
    print(f"{'='*80}")
    print(f"  {'Entry Type':<30} {'Baseline PF':>12} {'+ Regime PF':>12} {'Change':>10} {'DD Baseline':>12} {'DD + Regime':>12}")
    print(f"  {'-'*30} {'-'*12} {'-'*12} {'-'*10} {'-'*12} {'-'*12}")

    entry_names = ['Pullback', 'Liquidity Sweep', 'Breakout', 'Mean Reversion']
    for i, name in enumerate(entry_names):
        ra = results_a[i]
        rb = results_b[i]
        pf_a  = ra['profit_factor'] if ra['trade_count'] >= MIN_TRADES else 'N/A'
        pf_b  = rb['profit_factor'] if rb['trade_count'] >= MIN_TRADES else 'N/A'
        dd_a  = f"${ra['max_drawdown']:,.0f}" if ra['trade_count'] >= MIN_TRADES else 'N/A'
        dd_b  = f"${rb['max_drawdown']:,.0f}" if rb['trade_count'] >= MIN_TRADES else 'N/A'

        if isinstance(pf_a, float) and isinstance(pf_b, float):
            change = round(pf_b - pf_a, 3)
            change_str = f"+{change}" if change >= 0 else str(change)
        else:
            change_str = 'N/A'

        print(f"  {name:<30} {str(pf_a):>12} {str(pf_b):>12} {change_str:>10} {dd_a:>12} {dd_b:>12}")

    print(f"\n  Guardian Contribution Summary:")
    improvements = []
    for i, name in enumerate(entry_names):
        ra, rb = results_a[i], results_b[i]
        if ra['trade_count'] >= MIN_TRADES and rb['trade_count'] >= MIN_TRADES:
            delta = rb['profit_factor'] - ra['profit_factor']
            if delta > 0:
                improvements.append(f"    + {name}: Regime Engine improved PF by {round(delta,3)}")
            elif delta < 0:
                improvements.append(f"    - {name}: Regime Engine degraded PF by {round(abs(delta),3)}")
            else:
                improvements.append(f"    = {name}: No change")
        else:
            improvements.append(f"    ? {name}: Insufficient data in one or both experiments")

    for line in improvements:
        print(line)

# ─────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────
if __name__ == '__main__':
    print("Atlas Sprint 021 — Stream B: Execution Intelligence Baseline Research")
    print("Two-Part Controlled Experiment")
    print("="*65)

    print("\nLoading data...")
    df = load_data()
    print(f"  Loaded {len(df):,} bars ({df['date'].min()} to {df['date'].max()})")

    print("\nComputing indicators...")
    df = compute_indicators(df)

    # Define the two regime masks
    rth_only    = df['rth']                  # Research Question A: RTH only, no regime filter
    regime_v1   = df['regime_v1']            # Research Question B: RTH + frozen Regime Engine v1.0

    print(f"\n  RTH bars available:         {rth_only.sum():,} ({rth_only.sum()/len(df)*100:.1f}%)")
    print(f"  Regime v1.0 PASS bars:      {regime_v1.sum():,} ({regime_v1.sum()/len(df)*100:.1f}%)")

    # ── Research Question A: Baseline (no Regime Engine) ──
    results_a = run_experiment(df, rth_only, "RESEARCH QUESTION A — Execution Baseline (RTH, No Regime Engine)")

    # ── Research Question B: Controlled Comparison ──
    results_b = run_experiment(df, regime_v1, "RESEARCH QUESTION B — Execution + Frozen Regime Engine v1.0")

    # ── Comparison Table ──
    print_comparison(results_a, results_b)

    print("\n\nDone.")
