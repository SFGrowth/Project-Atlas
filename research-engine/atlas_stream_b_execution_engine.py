"""
Atlas Stream B — Execution Intelligence Research Engine
Sprint 021: Entry Type Hypothesis Testing

Research Question:
  Which entry type produces the highest statistical expectancy when the
  Atlas Regime Engine v1.0 gives a PASS signal on MNQ 5-minute futures?

Hypotheses:
  H-B001: Pullback continuation (EMA21 retracement in trending regime)
  H-B002: Liquidity sweep (sweep of prior swing high/low then reversal)
  H-B003: Breakout continuation (close above/below N-bar swing in trending regime)
  H-B004: Mean reversion (price > 2 ATR from VWAP, returning toward VWAP)

Atlas Research Standards:
  - Every hypothesis assumed FALSE until statistically supported
  - All 12 robustness metrics reported for every result
  - Minimum 100 trades required for statistical validity
  - Acceptance: PF > 1.20, Max DD < $2,000, Trade Count >= 100
"""

import pandas as pd
import numpy as np
import os
import warnings
warnings.filterwarnings('ignore')

# ─────────────────────────────────────────────
# Configuration
# ─────────────────────────────────────────────
DATA_PATH = "/home/ubuntu/Project-Atlas/data/raw/massive/MNQ_5min_full.csv"
POINT_VALUE = 2.0          # MNQ: $2 per point
ATR_LEN = 14
STOP_ATR = 1.0             # Stop loss: 1.0 ATR
TP_ATR = 2.0               # Take profit: 2.0 ATR (2:1 RR)
MAX_BARS = 12              # Max holding: 60 minutes
MIN_TRADES = 100           # Minimum for statistical validity
ACCEPTANCE_PF = 1.20
ACCEPTANCE_MAX_DD = 2000.0

# ─────────────────────────────────────────────
# Data Loading
# ─────────────────────────────────────────────
def load_data():
    df = pd.read_csv(DATA_PATH)
    df['time'] = pd.to_datetime(df['timestamp_et'], utc=True).dt.tz_convert('America/New_York').dt.tz_localize(None)
    df = df.sort_values('time').reset_index(drop=True)
    df['hour'] = df['time'].dt.hour
    df['minute'] = df['time'].dt.minute
    df['time_dec'] = df['hour'] + df['minute'] / 60.0
    df['date'] = df['time'].dt.date
    return df

# ─────────────────────────────────────────────
# Indicator Computation (vectorised)
# ─────────────────────────────────────────────
def compute_indicators(df):
    # ATR
    hl = df['high'] - df['low']
    hc = (df['high'] - df['close'].shift(1)).abs()
    lc = (df['low'] - df['close'].shift(1)).abs()
    tr = pd.concat([hl, hc, lc], axis=1).max(axis=1)
    df['atr'] = tr.rolling(ATR_LEN).mean()
    df['atr_fast'] = tr.rolling(5).mean()
    df['atr_slow'] = tr.rolling(20).mean()

    # EMAs
    df['ema9']  = df['close'].ewm(span=9,  adjust=False).mean()
    df['ema21'] = df['close'].ewm(span=21, adjust=False).mean()
    df['ema50'] = df['close'].ewm(span=50, adjust=False).mean()

    # VWAP (daily reset)
    df['cum_vol_price'] = (df['close'] * df['volume']).groupby(df['date']).cumsum()
    df['cum_vol']       = df['volume'].groupby(df['date']).cumsum()
    df['vwap']          = df['cum_vol_price'] / df['cum_vol']

    # Swing highs/lows (5-bar lookback)
    df['swing_high_5'] = df['high'].rolling(5).max().shift(1)
    df['swing_low_5']  = df['low'].rolling(5).min().shift(1)
    df['swing_high_10'] = df['high'].rolling(10).max().shift(1)
    df['swing_low_10']  = df['low'].rolling(10).min().shift(1)

    # VWAP deviation in ATR units
    df['vwap_dev_atr'] = (df['close'] - df['vwap']).abs() / df['atr'].replace(0, np.nan)

    # ATR ratio (regime filter)
    df['atr_ratio'] = df['atr_fast'] / df['atr_slow'].replace(0, np.nan)

    return df

# ─────────────────────────────────────────────
# Regime Engine v1.0 Filter (FROZEN)
# Accepted: Volatility Compression + VWAP Proximity
# ─────────────────────────────────────────────
def apply_regime_filter(df, compression_threshold=0.7, vwap_dev_threshold=1.5):
    """Apply the frozen Regime Engine v1.0 filter."""
    compression_pass = df['atr_ratio'] <= compression_threshold
    vwap_pass        = df['vwap_dev_atr'] <= vwap_dev_threshold
    rth_pass         = (df['time_dec'] >= 9.5) & (df['time_dec'] < 16.0)
    df['regime_pass'] = compression_pass & vwap_pass & rth_pass
    return df

# ─────────────────────────────────────────────
# Trade Simulation (vectorised-friendly)
# ─────────────────────────────────────────────
def simulate_trades(df, signal_long, signal_short, label):
    """
    Given boolean series for long/short entry signals,
    simulate trades with ATR-based stop and target.
    Returns a list of trade result dicts.
    """
    trades = []
    in_trade = False

    closes = df['close'].values
    highs  = df['high'].values
    lows   = df['low'].values
    atrs   = df['atr'].values
    times  = df['time'].values
    dates  = df['date'].values
    time_decs = df['time_dec'].values

    sig_long  = signal_long.values
    sig_short = signal_short.values

    i = 0
    n = len(df)

    while i < n:
        if in_trade:
            i += 1
            continue

        # Long entry
        if sig_long[i] and not in_trade:
            entry_price = closes[i]
            atr_val = atrs[i]
            if np.isnan(atr_val) or atr_val == 0:
                i += 1
                continue
            stop  = entry_price - STOP_ATR * atr_val
            tp    = entry_price + TP_ATR * atr_val
            entry_time = times[i]
            entry_date = dates[i]
            session = get_session(time_decs[i])

            result = None
            for j in range(i+1, min(i+1+MAX_BARS, n)):
                if highs[j] >= tp:
                    result = ('win', tp - entry_price, entry_time, entry_date, 'long', session)
                    break
                if lows[j] <= stop:
                    result = ('loss', stop - entry_price, entry_time, entry_date, 'long', session)
                    break
            if result is None:
                result = ('timeout', closes[min(i+MAX_BARS, n-1)] - entry_price, entry_time, entry_date, 'long', session)

            pnl = result[1] * POINT_VALUE
            trades.append({
                'outcome': result[0], 'pnl': pnl, 'time': result[2],
                'date': result[3], 'direction': result[4], 'session': result[5]
            })
            i += MAX_BARS
            continue

        # Short entry
        if sig_short[i] and not in_trade:
            entry_price = closes[i]
            atr_val = atrs[i]
            if np.isnan(atr_val) or atr_val == 0:
                i += 1
                continue
            stop  = entry_price + STOP_ATR * atr_val
            tp    = entry_price - TP_ATR * atr_val
            entry_time = times[i]
            entry_date = dates[i]
            session = get_session(time_decs[i])

            result = None
            for j in range(i+1, min(i+1+MAX_BARS, n)):
                if lows[j] <= tp:
                    result = ('win', entry_price - tp, entry_time, entry_date, 'short', session)
                    break
                if highs[j] >= stop:
                    result = ('loss', entry_price - stop, entry_time, entry_date, 'short', session)
                    break
            if result is None:
                result = ('timeout', entry_price - closes[min(i+MAX_BARS, n-1)], entry_time, entry_date, 'short', session)

            pnl = result[1] * POINT_VALUE
            trades.append({
                'outcome': result[0], 'pnl': pnl, 'time': result[2],
                'date': result[3], 'direction': result[4], 'session': result[5]
            })
            i += MAX_BARS
            continue

        i += 1

    return trades

def get_session(time_dec):
    if 9.5 <= time_dec < 10.5:
        return 'Opening'
    elif 10.5 <= time_dec < 12.0:
        return 'Mid-Morning'
    elif 12.0 <= time_dec < 13.5:
        return 'Lunch'
    elif 13.5 <= time_dec < 16.0:
        return 'Afternoon'
    return 'Other'

# ─────────────────────────────────────────────
# Metrics Computation
# ─────────────────────────────────────────────
def compute_metrics(trades, label):
    if len(trades) < MIN_TRADES:
        return {
            'label': label, 'trade_count': len(trades),
            'status': f'INSUFFICIENT ({len(trades)} trades < {MIN_TRADES} minimum)',
            'net_profit': 0, 'profit_factor': 0, 'win_rate': 0,
            'max_drawdown': 0, 'expectancy': 0,
            'avg_winner': 0, 'avg_loser': 0, 'largest_losing_streak': 0
        }

    tdf = pd.DataFrame(trades)
    winners = tdf[tdf['pnl'] > 0]['pnl']
    losers  = tdf[tdf['pnl'] <= 0]['pnl']

    net_profit = tdf['pnl'].sum()
    gross_win  = winners.sum() if len(winners) > 0 else 0
    gross_loss = abs(losers.sum()) if len(losers) > 0 else 0
    pf = gross_win / gross_loss if gross_loss > 0 else (999 if gross_win > 0 else 0)
    wr = len(winners) / len(tdf) * 100
    avg_win  = winners.mean() if len(winners) > 0 else 0
    avg_loss = losers.mean() if len(losers) > 0 else 0
    expectancy = tdf['pnl'].mean()

    # Max drawdown
    equity = tdf['pnl'].cumsum()
    peak = equity.cummax()
    dd = equity - peak
    max_dd = abs(dd.min())

    # Largest losing streak
    streak = 0
    max_streak = 0
    for p in tdf['pnl']:
        if p <= 0:
            streak += 1
            max_streak = max(max_streak, streak)
        else:
            streak = 0

    # Long vs Short
    long_pnl  = tdf[tdf['direction'] == 'long']['pnl'].sum()
    short_pnl = tdf[tdf['direction'] == 'short']['pnl'].sum()
    long_pf   = compute_pf(tdf[tdf['direction'] == 'long']['pnl'])
    short_pf  = compute_pf(tdf[tdf['direction'] == 'short']['pnl'])

    # Session performance
    session_pf = {}
    for sess in ['Opening', 'Mid-Morning', 'Lunch', 'Afternoon']:
        sess_trades = tdf[tdf['session'] == sess]['pnl']
        session_pf[sess] = compute_pf(sess_trades) if len(sess_trades) >= 10 else 'N/A'

    # Acceptance check
    accepted = pf >= ACCEPTANCE_PF and max_dd <= ACCEPTANCE_MAX_DD and len(tdf) >= MIN_TRADES
    both_positive = long_pnl > 0 and short_pnl > 0

    return {
        'label': label,
        'status': 'ACCEPTED' if accepted else 'REJECTED',
        'trade_count': len(tdf),
        'net_profit': round(net_profit, 2),
        'profit_factor': round(pf, 3),
        'win_rate': round(wr, 1),
        'max_drawdown': round(max_dd, 2),
        'expectancy': round(expectancy, 2),
        'avg_winner': round(avg_win, 2),
        'avg_loser': round(avg_loss, 2),
        'largest_losing_streak': max_streak,
        'long_pnl': round(long_pnl, 2),
        'short_pnl': round(short_pnl, 2),
        'long_pf': round(long_pf, 3),
        'short_pf': round(short_pf, 3),
        'both_directions_positive': both_positive,
        'session_pf': session_pf,
        'accepted': accepted
    }

def compute_pf(pnl_series):
    if len(pnl_series) == 0:
        return 0
    wins = pnl_series[pnl_series > 0].sum()
    losses = abs(pnl_series[pnl_series <= 0].sum())
    return round(wins / losses, 3) if losses > 0 else (999 if wins > 0 else 0)

# ─────────────────────────────────────────────
# H-B001: Pullback Continuation
# Entry: Price retraces to EMA21 in trending regime
# Long: ema9 > ema21 > ema50, price touches ema21 from above, then closes above ema21
# Short: ema9 < ema21 < ema50, price touches ema21 from below, then closes below ema21
# ─────────────────────────────────────────────
def hypothesis_b001_pullback(df):
    print("\n--- H-B001: Pullback Continuation ---")
    regime = df['regime_pass']

    # Trend alignment
    uptrend   = (df['ema9'] > df['ema21']) & (df['ema21'] > df['ema50'])
    downtrend = (df['ema9'] < df['ema21']) & (df['ema21'] < df['ema50'])

    # Pullback to EMA21: low touches or crosses EMA21 on prior bar, then closes above
    touched_ema21_long  = (df['low'].shift(1) <= df['ema21'].shift(1)) & (df['close'].shift(1) >= df['ema21'].shift(1))
    touched_ema21_short = (df['high'].shift(1) >= df['ema21'].shift(1)) & (df['close'].shift(1) <= df['ema21'].shift(1))

    # Signal bar: close back in trend direction
    signal_long  = regime & uptrend   & touched_ema21_long  & (df['close'] > df['ema21'])
    signal_short = regime & downtrend & touched_ema21_short & (df['close'] < df['ema21'])

    print(f"  Long signals: {signal_long.sum()}, Short signals: {signal_short.sum()}")
    trades = simulate_trades(df, signal_long, signal_short, 'H-B001')
    return compute_metrics(trades, 'H-B001: Pullback Continuation')

# ─────────────────────────────────────────────
# H-B002: Liquidity Sweep
# Entry: Price sweeps prior 10-bar swing high/low then reverses
# Long: price sweeps below 10-bar swing low, then closes above it (false breakdown)
# Short: price sweeps above 10-bar swing high, then closes below it (false breakout)
# ─────────────────────────────────────────────
def hypothesis_b002_liquidity_sweep(df):
    print("\n--- H-B002: Liquidity Sweep ---")
    regime = df['regime_pass']

    # Sweep: current bar's low went below prior swing low but closed above it
    swept_low  = (df['low'] < df['swing_low_10']) & (df['close'] > df['swing_low_10'])
    swept_high = (df['high'] > df['swing_high_10']) & (df['close'] < df['swing_high_10'])

    signal_long  = regime & swept_low
    signal_short = regime & swept_high

    print(f"  Long signals: {signal_long.sum()}, Short signals: {signal_short.sum()}")
    trades = simulate_trades(df, signal_long, signal_short, 'H-B002')
    return compute_metrics(trades, 'H-B002: Liquidity Sweep')

# ─────────────────────────────────────────────
# H-B003: Breakout Continuation
# Entry: Price closes above/below 10-bar swing high/low in trending regime
# Long: uptrend + close above 10-bar swing high
# Short: downtrend + close below 10-bar swing low
# ─────────────────────────────────────────────
def hypothesis_b003_breakout(df):
    print("\n--- H-B003: Breakout Continuation ---")
    regime = df['regime_pass']

    uptrend   = (df['ema9'] > df['ema21']) & (df['ema21'] > df['ema50'])
    downtrend = (df['ema9'] < df['ema21']) & (df['ema21'] < df['ema50'])

    broke_high = df['close'] > df['swing_high_10']
    broke_low  = df['close'] < df['swing_low_10']

    signal_long  = regime & uptrend   & broke_high
    signal_short = regime & downtrend & broke_low

    print(f"  Long signals: {signal_long.sum()}, Short signals: {signal_short.sum()}")
    trades = simulate_trades(df, signal_long, signal_short, 'H-B003')
    return compute_metrics(trades, 'H-B003: Breakout Continuation')

# ─────────────────────────────────────────────
# H-B004: Mean Reversion
# Entry: Price deviates > 2 ATR from VWAP, then first bar that closes back toward VWAP
# Long: price > 2 ATR below VWAP, closes above prior bar's close (reversal candle)
# Short: price > 2 ATR above VWAP, closes below prior bar's close (reversal candle)
# ─────────────────────────────────────────────
def hypothesis_b004_mean_reversion(df):
    print("\n--- H-B004: Mean Reversion ---")
    regime = df['regime_pass']

    far_below_vwap = df['vwap_dev_atr'] > 2.0
    far_above_vwap = df['vwap_dev_atr'] > 2.0
    below_vwap = df['close'] < df['vwap']
    above_vwap = df['close'] > df['vwap']

    # Reversal candle: closes in opposite direction
    reversal_up   = df['close'] > df['close'].shift(1)
    reversal_down = df['close'] < df['close'].shift(1)

    signal_long  = regime & far_below_vwap & below_vwap & reversal_up
    signal_short = regime & far_above_vwap & above_vwap & reversal_down

    print(f"  Long signals: {signal_long.sum()}, Short signals: {signal_short.sum()}")
    trades = simulate_trades(df, signal_long, signal_short, 'H-B004')
    return compute_metrics(trades, 'H-B004: Mean Reversion')

# ─────────────────────────────────────────────
# Print Results
# ─────────────────────────────────────────────
def print_result(r):
    print(f"\n{'='*60}")
    print(f"  {r['label']}")
    print(f"  Status: {r['status']}")
    print(f"{'='*60}")
    if 'INSUFFICIENT' in r.get('status', ''):
        print(f"  Trade Count: {r['trade_count']} — below minimum {MIN_TRADES}")
        return

    print(f"  Profit Factor:         {r['profit_factor']}")
    print(f"  Net Profit:            ${r['net_profit']:,.2f}")
    print(f"  Win Rate:              {r['win_rate']}%")
    print(f"  Max Drawdown:          ${r['max_drawdown']:,.2f}")
    print(f"  Expectancy (per trade): ${r['expectancy']:,.2f}")
    print(f"  Trade Count:           {r['trade_count']}")
    print(f"  Avg Winner:            ${r['avg_winner']:,.2f}")
    print(f"  Avg Loser:             ${r['avg_loser']:,.2f}")
    print(f"  Largest Losing Streak: {r['largest_losing_streak']}")
    print(f"  Long PF:               {r['long_pf']} (${r['long_pnl']:,.2f})")
    print(f"  Short PF:              {r['short_pf']} (${r['short_pnl']:,.2f})")
    print(f"  Both Directions +ve:   {r['both_directions_positive']}")
    print(f"  Session PF:")
    for sess, pf in r['session_pf'].items():
        print(f"    {sess:15s}: {pf}")

    print(f"\n  Hypothesis/Result/Evidence/Decision:")
    if r['accepted']:
        print(f"  Hypothesis: {r['label']} produces PF > {ACCEPTANCE_PF}")
        print(f"  Result: TRUE")
        print(f"  Evidence: PF={r['profit_factor']}, DD=${r['max_drawdown']:,.2f}, Trades={r['trade_count']}")
        print(f"  Decision: ACCEPT — promote to parameter sweep")
    else:
        print(f"  Hypothesis: {r['label']} produces PF > {ACCEPTANCE_PF}")
        print(f"  Result: FALSE")
        pf_gap = round(ACCEPTANCE_PF - r['profit_factor'], 3) if r['profit_factor'] < ACCEPTANCE_PF else 0
        dd_gap = round(r['max_drawdown'] - ACCEPTANCE_MAX_DD, 2) if r['max_drawdown'] > ACCEPTANCE_MAX_DD else 0
        if pf_gap > 0:
            print(f"  Evidence: PF={r['profit_factor']} (below {ACCEPTANCE_PF} by {pf_gap})")
        if dd_gap > 0:
            print(f"  Evidence: Max DD=${r['max_drawdown']:,.2f} (exceeds ${ACCEPTANCE_MAX_DD:,.0f} by ${dd_gap:,.2f})")
        print(f"  Decision: REJECT — document in Knowledge Base")

# ─────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────
if __name__ == '__main__':
    print("Atlas Stream B — Execution Intelligence Research Engine")
    print("Sprint 021: Entry Type Hypothesis Testing")
    print("="*60)

    print("\nLoading data...")
    df = load_data()
    print(f"  Loaded {len(df):,} bars ({df['date'].min()} to {df['date'].max()})")

    print("\nComputing indicators...")
    df = compute_indicators(df)

    print("\nApplying Regime Engine v1.0 filter...")
    df = apply_regime_filter(df)
    regime_bars = df['regime_pass'].sum()
    print(f"  Regime PASS bars: {regime_bars:,} ({regime_bars/len(df)*100:.1f}% of all bars)")

    results = []

    # Run all four hypotheses
    r1 = hypothesis_b001_pullback(df)
    print_result(r1)
    results.append(r1)

    r2 = hypothesis_b002_liquidity_sweep(df)
    print_result(r2)
    results.append(r2)

    r3 = hypothesis_b003_breakout(df)
    print_result(r3)
    results.append(r3)

    r4 = hypothesis_b004_mean_reversion(df)
    print_result(r4)
    results.append(r4)

    # Summary ranking
    print("\n" + "="*60)
    print("SUMMARY — Entry Type Ranking by Profit Factor")
    print("="*60)
    valid = [r for r in results if 'INSUFFICIENT' not in r.get('status', '')]
    ranked = sorted(valid, key=lambda x: x['profit_factor'], reverse=True)
    for i, r in enumerate(ranked):
        status_marker = "✓ ACCEPTED" if r['accepted'] else "✗ REJECTED"
        print(f"  #{i+1} {r['label']}")
        print(f"       PF={r['profit_factor']}, DD=${r['max_drawdown']:,.0f}, Trades={r['trade_count']} — {status_marker}")

    accepted = [r for r in results if r.get('accepted')]
    if accepted:
        print(f"\n  Best accepted entry: {accepted[0]['label']}")
        print(f"  Proceeding to parameter sweep...")
    else:
        print(f"\n  No hypothesis met acceptance criteria.")
        print(f"  All results documented in Knowledge Base.")
        print(f"  Next step: refine signal definitions or test new entry concepts.")

    print("\nDone.")
