"""
Atlas Sprint 030 — External Strategy Evaluation
Strategy: Casper SMC "First Candle Value"
Source: https://www.instagram.com/reel/DXKyonPDaaK/

The strategy uses the first 15-minute candle of the NY session to define an
Opening Range (OR). A volume profile is drawn over that candle to identify
the Value Area (VA) — the range where 70% of volume traded.

Two setups are tested independently:

Setup A — Failed Breakout (Mean Reversion):
  Price pushes above VA High then closes back inside the VA.
  Entry: Close of the candle that closes back inside.
  Stop: High of the breakout candle.
  Target: VA Low (with trailing stop option).

Setup B — Confirmed Breakout Pullback (Continuation):
  Price pushes above VA High and holds (does not close back inside).
  Wait for a pullback to the VA High level.
  Entry: First candle that touches VA High from above.
  Stop: Low of the entry candle.
  Target: Trailing (test fixed 2R as proxy).

Both setups are tested long and short (mirror logic for shorts).

Atlas Research Rules:
- No lookahead bias.
- Indicators computed on full dataset; session filter applied in trade loop.
- Exact same risk framework as Model A1 (1 ATR stop, 2R target) as baseline.
- Additionally test the strategy's own stop/target logic.
- Year 1 / Year 2 sub-period stability check.
- Monte Carlo sequence analysis.
"""

import pandas as pd
import numpy as np
import random
from datetime import time as dtime

# ── Constants ────────────────────────────────────────────────────────────────
DATA_PATH = "/home/ubuntu/Project-Atlas/data/raw/massive/MNQ_5min_full.csv"
MNQ_POINT = 2.0          # $ per point per contract
COMMISSION = 1.00        # $ per side per contract
CONTRACTS  = 1
STOP_ATR_MULT = 1.0      # Model A1 baseline stop
TARGET_RR     = 2.0      # Model A1 baseline RR
NY_OPEN       = dtime(9, 30)
NY_CLOSE      = dtime(16, 0)
OR_END        = dtime(9, 45)   # 15-min opening range ends at 9:45
ENTRY_CUTOFF  = dtime(15, 30)  # No new entries after 3:30 PM

# ── Data Loading ─────────────────────────────────────────────────────────────
def load_data():
    df = pd.read_csv(DATA_PATH)
    df['ts'] = pd.to_datetime(df['timestamp_et'], utc=True)
    df = df.sort_values('ts').reset_index(drop=True)
    df['hour']   = df['ts'].dt.hour
    df['minute'] = df['ts'].dt.minute
    df['date']   = df['ts'].dt.date
    df['time']   = df['ts'].dt.time
    df['is_rth'] = df['time'].apply(lambda t: NY_OPEN <= t < NY_CLOSE)
    df['is_or']  = df['time'].apply(lambda t: NY_OPEN <= t < OR_END)
    # ATR(14) on full dataset — no lookahead
    high  = df['high']
    low   = df['low']
    close = df['close']
    prev_close = close.shift(1)
    tr = pd.concat([high - low,
                    (high - prev_close).abs(),
                    (low  - prev_close).abs()], axis=1).max(axis=1)
    df['atr14'] = tr.ewm(span=14, adjust=False).mean()
    return df

# ── Opening Range + Value Area Calculation ───────────────────────────────────
def compute_daily_or_va(df):
    """
    For each trading day, compute:
      - or_high, or_low: high/low of the 15-min opening range (9:30-9:44 ET)
      - va_high, va_low: value area (70% of volume) within the OR candles

    Volume profile approximation:
      We have 3 x 5-min candles in the 9:30-9:44 window.
      We distribute each candle's volume uniformly across its price range
      in 10 price buckets, then find the 70% value area.
    """
    results = {}
    or_bars = df[df['is_or']].copy()

    for date, group in or_bars.groupby('date'):
        if len(group) < 3:
            continue  # Need all 3 candles for a valid OR

        or_high = group['high'].max()
        or_low  = group['low'].min()
        or_range = or_high - or_low

        if or_range < 1.0:  # Skip degenerate days
            continue

        # Build volume profile with 20 price buckets
        n_buckets = 20
        bucket_size = or_range / n_buckets
        buckets = np.zeros(n_buckets)

        for _, bar in group.iterrows():
            bar_range = bar['high'] - bar['low']
            if bar_range < 0.01:
                continue
            # Distribute volume proportionally across buckets touched by this bar
            for b in range(n_buckets):
                bucket_low  = or_low + b * bucket_size
                bucket_high = bucket_low + bucket_size
                overlap = max(0, min(bar['high'], bucket_high) - max(bar['low'], bucket_low))
                buckets[b] += bar['volume'] * (overlap / bar_range)

        total_vol = buckets.sum()
        if total_vol == 0:
            # Fallback: VA = middle 70% of OR range
            va_high = or_low + or_range * 0.85
            va_low  = or_low + or_range * 0.15
        else:
            # Find the 70% value area: start from highest-volume bucket, expand outward
            target = total_vol * 0.70
            # Sort buckets by volume descending, accumulate until 70%
            sorted_idx = np.argsort(buckets)[::-1]
            included = []
            acc = 0.0
            for idx in sorted_idx:
                included.append(idx)
                acc += buckets[idx]
                if acc >= target:
                    break
            va_bucket_low  = min(included)
            va_bucket_high = max(included)
            va_low  = or_low + va_bucket_low  * bucket_size
            va_high = or_low + (va_bucket_high + 1) * bucket_size

        # OR mid for reference
        or_mid = (or_high + or_low) / 2.0

        # ATR at end of OR
        or_atr = group['atr14'].iloc[-1]

        results[date] = {
            'or_high': or_high,
            'or_low':  or_low,
            'or_mid':  or_mid,
            'va_high': va_high,
            'va_low':  va_low,
            'or_atr':  or_atr,
            'or_end_idx': group.index[-1]  # index of last OR bar
        }

    return results

# ── Trade Simulation ──────────────────────────────────────────────────────────
def simulate_trade(df, entry_idx, direction, stop_price, target_price):
    """
    Simulate a trade from entry_idx forward.
    Returns (pnl, bars_held, outcome)
    """
    entry_price = df['close'].iloc[entry_idx]
    pnl = 0.0
    bars_held = 0
    outcome = 'open'

    for j in range(entry_idx + 1, min(entry_idx + 200, len(df))):
        bar = df.iloc[j]
        bars_held += 1

        # Force close at NY session end
        if bar['time'] >= NY_CLOSE:
            exit_price = bar['open']
            if direction == 'long':
                pnl = (exit_price - entry_price) * MNQ_POINT * CONTRACTS - COMMISSION * 2
            else:
                pnl = (entry_price - exit_price) * MNQ_POINT * CONTRACTS - COMMISSION * 2
            outcome = 'eod'
            break

        if direction == 'long':
            if bar['low'] <= stop_price:
                pnl = (stop_price - entry_price) * MNQ_POINT * CONTRACTS - COMMISSION * 2
                outcome = 'stop'
                break
            if bar['high'] >= target_price:
                pnl = (target_price - entry_price) * MNQ_POINT * CONTRACTS - COMMISSION * 2
                outcome = 'target'
                break
        else:  # short
            if bar['high'] >= stop_price:
                pnl = (entry_price - stop_price) * MNQ_POINT * CONTRACTS - COMMISSION * 2
                outcome = 'stop'
                break
            if bar['low'] <= target_price:
                pnl = (entry_price - target_price) * MNQ_POINT * CONTRACTS - COMMISSION * 2
                outcome = 'target'
                break

    if outcome == 'open':
        # Timed out — close at last bar
        exit_price = df['close'].iloc[min(entry_idx + 199, len(df) - 1)]
        if direction == 'long':
            pnl = (exit_price - entry_price) * MNQ_POINT * CONTRACTS - COMMISSION * 2
        else:
            pnl = (entry_price - exit_price) * MNQ_POINT * CONTRACTS - COMMISSION * 2
        outcome = 'timeout'

    return pnl, bars_held, outcome

# ── Setup A: Failed Breakout ──────────────────────────────────────────────────
def run_setup_a(df, daily_or):
    """
    Setup A — Failed Breakout (Mean Reversion):
    Bullish version: price closes above VA High, then a subsequent candle
    closes back inside the VA. Entry on that close. Stop = breakout high.
    Target = VA Low.

    Bearish version: mirror logic.
    """
    trades = []
    traded_dates = set()

    i = 0
    while i < len(df):
        bar = df.iloc[i]
        date = bar['date']

        if date in traded_dates or date not in daily_or:
            i += 1
            continue

        or_data = daily_or[date]
        va_high = or_data['va_high']
        va_low  = or_data['va_low']
        or_atr  = or_data['or_atr']
        or_end_idx = or_data['or_end_idx']

        # Only look at bars after the OR ends
        if i <= or_end_idx:
            i += 1
            continue

        if not bar['is_rth']:
            i += 1
            continue

        if bar['time'] >= ENTRY_CUTOFF:
            i += 1
            continue

        # ── Bullish Failed Breakout (short setup) ──────────────────────────
        # Previous bar closed above VA High, current bar closes back inside VA
        if i > 0:
            prev_bar = df.iloc[i - 1]
            # Bullish failed breakout → SHORT
            if (prev_bar['close'] > va_high and
                bar['close'] < va_high and
                bar['close'] > va_low):
                # Entry: close of current bar (short)
                # Stop: high of the breakout (prev bar high or current bar high, whichever higher)
                breakout_high = max(prev_bar['high'], bar['high'])
                stop_price = breakout_high
                # Target: VA Low (strategy's own target)
                target_price = va_low
                risk = stop_price - bar['close']
                if risk < 0.5 or risk > or_atr * 3:
                    i += 1
                    continue
                pnl, bars_held, outcome = simulate_trade(df, i, 'short', stop_price, target_price)
                trades.append({
                    'date': date,
                    'setup': 'A_short',
                    'entry': bar['close'],
                    'stop': stop_price,
                    'target': target_price,
                    'pnl': pnl,
                    'bars': bars_held,
                    'outcome': outcome,
                    'year': bar['ts'].year
                })
                traded_dates.add(date)
                i += bars_held + 1
                continue

            # Bearish failed breakout → LONG
            if (prev_bar['close'] < va_low and
                bar['close'] > va_low and
                bar['close'] < va_high):
                breakout_low = min(prev_bar['low'], bar['low'])
                stop_price = breakout_low
                target_price = va_high
                risk = bar['close'] - stop_price
                if risk < 0.5 or risk > or_atr * 3:
                    i += 1
                    continue
                pnl, bars_held, outcome = simulate_trade(df, i, 'long', stop_price, target_price)
                trades.append({
                    'date': date,
                    'setup': 'A_long',
                    'entry': bar['close'],
                    'stop': stop_price,
                    'target': target_price,
                    'pnl': pnl,
                    'bars': bars_held,
                    'outcome': outcome,
                    'year': bar['ts'].year
                })
                traded_dates.add(date)
                i += bars_held + 1
                continue

        i += 1

    return trades

# ── Setup B: Confirmed Breakout Pullback ──────────────────────────────────────
def run_setup_b(df, daily_or):
    """
    Setup B — Confirmed Breakout Pullback (Continuation):
    Bullish: price closes above VA High and holds (no close back inside).
    Wait for pullback: first bar whose low touches VA High from above.
    Entry: close of that bar. Stop: low of entry bar. Target: 2R (fixed).

    Bearish: mirror logic.
    """
    trades = []
    traded_dates = set()

    # Track per-day state
    day_state = {}  # date -> {'breakout_bull': bool, 'breakout_bear': bool, 'confirmed': bool}

    i = 0
    while i < len(df):
        bar = df.iloc[i]
        date = bar['date']

        if date in traded_dates or date not in daily_or:
            i += 1
            continue

        or_data = daily_or[date]
        va_high = or_data['va_high']
        va_low  = or_data['va_low']
        or_atr  = or_data['or_atr']
        or_end_idx = or_data['or_end_idx']

        if i <= or_end_idx:
            i += 1
            continue

        if not bar['is_rth']:
            i += 1
            continue

        if bar['time'] >= ENTRY_CUTOFF:
            i += 1
            continue

        # Initialise day state
        if date not in day_state:
            day_state[date] = {
                'bull_confirmed': False,
                'bear_confirmed': False,
                'bull_breakout_high': None,
                'bear_breakout_low': None
            }

        state = day_state[date]

        # ── Check for confirmed bullish breakout ───────────────────────────
        if not state['bull_confirmed']:
            if bar['close'] > va_high:
                # Closed above VA High — potential confirmation
                # Check it hasn't closed back inside (we look at next bar)
                state['bull_confirmed'] = True
                state['bull_breakout_high'] = bar['high']
            i += 1
            continue

        # Bull confirmed — look for pullback to VA High
        if state['bull_confirmed'] and not state['bear_confirmed']:
            # If price closes back inside VA, confirmation is void
            if bar['close'] < va_high:
                state['bull_confirmed'] = False
                i += 1
                continue

            # Pullback: bar's low touches or dips into VA High zone (within 2 pts)
            if bar['low'] <= va_high + 2.0 and bar['close'] >= va_high:
                # Entry on close
                entry_price = bar['close']
                stop_price  = bar['low'] - 1.0  # 1 pt below entry bar low
                risk = entry_price - stop_price
                if risk < 0.5 or risk > or_atr * 3:
                    i += 1
                    continue
                target_price = entry_price + risk * TARGET_RR
                pnl, bars_held, outcome = simulate_trade(df, i, 'long', stop_price, target_price)
                trades.append({
                    'date': date,
                    'setup': 'B_long',
                    'entry': entry_price,
                    'stop': stop_price,
                    'target': target_price,
                    'pnl': pnl,
                    'bars': bars_held,
                    'outcome': outcome,
                    'year': bar['ts'].year
                })
                traded_dates.add(date)
                i += bars_held + 1
                continue

        # ── Check for confirmed bearish breakout ───────────────────────────
        if not state['bear_confirmed']:
            if bar['close'] < va_low:
                state['bear_confirmed'] = True
                state['bear_breakout_low'] = bar['low']

        if state['bear_confirmed']:
            if bar['close'] > va_low:
                state['bear_confirmed'] = False
                i += 1
                continue

            if bar['high'] >= va_low - 2.0 and bar['close'] <= va_low:
                entry_price = bar['close']
                stop_price  = bar['high'] + 1.0
                risk = stop_price - entry_price
                if risk < 0.5 or risk > or_atr * 3:
                    i += 1
                    continue
                target_price = entry_price - risk * TARGET_RR
                pnl, bars_held, outcome = simulate_trade(df, i, 'short', stop_price, target_price)
                trades.append({
                    'date': date,
                    'setup': 'B_short',
                    'entry': entry_price,
                    'stop': stop_price,
                    'target': target_price,
                    'pnl': pnl,
                    'bars': bars_held,
                    'outcome': outcome,
                    'year': bar['ts'].year
                })
                traded_dates.add(date)
                i += bars_held + 1
                continue

        i += 1

    return trades

# ── Statistics ────────────────────────────────────────────────────────────────
def compute_stats(trades, label):
    if not trades:
        print(f"\n{label}: NO TRADES")
        return {}

    pnls = [t['pnl'] for t in trades]
    wins = [p for p in pnls if p > 0]
    losses = [p for p in pnls if p <= 0]

    gross_profit = sum(wins) if wins else 0
    gross_loss   = abs(sum(losses)) if losses else 0
    pf = gross_profit / gross_loss if gross_loss > 0 else float('inf')
    net = sum(pnls)
    win_rate = len(wins) / len(pnls) * 100
    avg_win  = np.mean(wins) if wins else 0
    avg_loss = np.mean(losses) if losses else 0
    expectancy = (win_rate/100 * avg_win) + ((1 - win_rate/100) * avg_loss)

    # Max drawdown
    equity = np.cumsum(pnls)
    peak = np.maximum.accumulate(equity)
    dd = equity - peak
    max_dd = dd.min()

    # Losing streak
    max_streak = 0
    streak = 0
    for p in pnls:
        if p <= 0:
            streak += 1
            max_streak = max(max_streak, streak)
        else:
            streak = 0

    # Year split
    y1 = [t['pnl'] for t in trades if t['year'] == 2024]
    y2 = [t['pnl'] for t in trades if t['year'] == 2025 or t['year'] == 2026]
    def pf_of(lst):
        w = sum(p for p in lst if p > 0)
        l = abs(sum(p for p in lst if p <= 0))
        return w/l if l > 0 else float('inf')

    print(f"\n{'='*60}")
    print(f"  {label}")
    print(f"{'='*60}")
    print(f"  Trades:          {len(pnls)}")
    print(f"  Profit Factor:   {pf:.3f}")
    print(f"  Net P&L:         ${net:,.0f}")
    print(f"  Win Rate:        {win_rate:.1f}%")
    print(f"  Avg Winner:      ${avg_win:,.0f}")
    print(f"  Avg Loser:       ${avg_loss:,.0f}")
    print(f"  Expectancy:      ${expectancy:,.0f}")
    print(f"  Max Drawdown:    ${max_dd:,.0f}")
    print(f"  Max Lose Streak: {max_streak}")
    print(f"  Year 1 PF:       {pf_of(y1):.3f}  ({len(y1)} trades)")
    print(f"  Year 2 PF:       {pf_of(y2):.3f}  ({len(y2)} trades)")

    return {'pf': pf, 'net': net, 'pnls': pnls, 'trades': len(pnls), 'max_dd': max_dd}

# ── Monte Carlo ───────────────────────────────────────────────────────────────
def monte_carlo(pnls, n_sims=5000, starting_balance=50000, max_dd_limit=2000):
    if len(pnls) < 10:
        return 0.0
    passes = 0
    for _ in range(n_sims):
        shuffled = random.sample(pnls, len(pnls))
        equity = 0.0
        peak = 0.0
        worst_dd = 0.0
        for p in shuffled:
            equity += p
            if equity > peak:
                peak = equity
            dd = peak - equity
            if dd > worst_dd:
                worst_dd = dd
        if worst_dd <= max_dd_limit:
            passes += 1
    return passes / n_sims * 100

# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    print("Atlas Sprint 030 — First Candle Value Strategy Evaluation")
    print("Loading data...")
    df = load_data()
    print(f"  Loaded {len(df):,} bars | {df['date'].nunique()} trading days")

    print("\nComputing daily Opening Range and Value Areas...")
    daily_or = compute_daily_or_va(df)
    print(f"  Valid OR days: {len(daily_or)}")

    # Sample a few VA calculations for sanity check
    sample_dates = list(daily_or.keys())[:3]
    for d in sample_dates:
        od = daily_or[d]
        print(f"  {d}: OR=[{od['or_low']:.1f},{od['or_high']:.1f}]  "
              f"VA=[{od['va_low']:.1f},{od['va_high']:.1f}]  "
              f"ATR={od['or_atr']:.1f}")

    print("\n" + "="*60)
    print("  SETUP A: Failed Breakout (Mean Reversion)")
    print("="*60)
    trades_a = run_setup_a(df, daily_or)
    stats_a = compute_stats(trades_a, "Setup A — Failed Breakout (All)")

    # Sub-analysis: long vs short
    trades_a_long  = [t for t in trades_a if t['setup'] == 'A_long']
    trades_a_short = [t for t in trades_a if t['setup'] == 'A_short']
    compute_stats(trades_a_long,  "Setup A — Long Only (Bearish Failed Breakout)")
    compute_stats(trades_a_short, "Setup A — Short Only (Bullish Failed Breakout)")

    print("\n" + "="*60)
    print("  SETUP B: Confirmed Breakout Pullback (Continuation)")
    print("="*60)
    trades_b = run_setup_b(df, daily_or)
    stats_b = compute_stats(trades_b, "Setup B — Confirmed Breakout Pullback (All)")

    trades_b_long  = [t for t in trades_b if t['setup'] == 'B_long']
    trades_b_short = [t for t in trades_b if t['setup'] == 'B_short']
    compute_stats(trades_b_long,  "Setup B — Long Only")
    compute_stats(trades_b_short, "Setup B — Short Only")

    # Combined
    all_trades = trades_a + trades_b
    stats_all = compute_stats(all_trades, "Combined (Setup A + Setup B)")

    # Monte Carlo
    print("\n" + "="*60)
    print("  MONTE CARLO ANALYSIS")
    print("="*60)
    if stats_a.get('pnls'):
        mc_a = monte_carlo(stats_a['pnls'])
        print(f"  Setup A — Prop Pass Rate (DD < $2,000): {mc_a:.1f}%")
    if stats_b.get('pnls'):
        mc_b = monte_carlo(stats_b['pnls'])
        print(f"  Setup B — Prop Pass Rate (DD < $2,000): {mc_b:.1f}%")
    if stats_all.get('pnls'):
        mc_all = monte_carlo(stats_all['pnls'])
        print(f"  Combined — Prop Pass Rate (DD < $2,000): {mc_all:.1f}%")

    # Slippage stress test on best setup
    best_trades = trades_b if (stats_b.get('pf', 0) > stats_a.get('pf', 0)) else trades_a
    best_label  = "Setup B" if (stats_b.get('pf', 0) > stats_a.get('pf', 0)) else "Setup A"
    if best_trades:
        print(f"\n  Slippage Stress ({best_label}):")
        for slip in [1, 2, 4]:
            adj = [t['pnl'] - slip * MNQ_POINT * CONTRACTS * 2 for t in best_trades]
            w = sum(p for p in adj if p > 0)
            l = abs(sum(p for p in adj if p <= 0))
            pf_s = w/l if l > 0 else float('inf')
            print(f"    {slip}-tick slippage: PF {pf_s:.3f}  Net ${sum(adj):,.0f}")

    print("\n" + "="*60)
    print("  ATLAS VERDICT")
    print("="*60)
    best_pf = max(stats_a.get('pf', 0), stats_b.get('pf', 0), stats_all.get('pf', 0))
    if best_pf >= 1.20:
        print(f"  CANDIDATE — Best PF {best_pf:.3f} meets minimum threshold.")
        print("  Proceed to full Atlas validation (Sprint 031).")
    elif best_pf >= 1.10:
        print(f"  WEAK SIGNAL — Best PF {best_pf:.3f}. Insufficient for promotion.")
        print("  Archive with notes. Do not proceed to validation.")
    else:
        print(f"  REJECTED — Best PF {best_pf:.3f}. No statistical edge detected.")
        print("  Archive in Rejected Components. Do not re-test without new evidence.")

if __name__ == "__main__":
    main()
