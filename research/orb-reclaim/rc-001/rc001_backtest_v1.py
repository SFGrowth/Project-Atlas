"""
Atlas Research Candidate Validation
Strategy: Opening Range EMA Reclaim (Flexing Joe Trades)
Market: MNQ1! (Micro E-mini Nasdaq 100 Futures)
Timeframe: 5-minute bars (simulating 30m/10m/2m logic on 5m data)
Period: 2 years (2023-07-01 to 2025-07-01)

STRATEGY RULES (deterministic):
1. At 09:30 ET each session, begin collecting the Opening Range (OR).
   OR High = high of first 30 minutes (09:30–10:00 ET)
   OR Low  = low of first 30 minutes (09:30–10:00 ET)
2. Directional Bias: After 10:00 ET, monitor for a 10-minute candle (2 x 5m bars)
   to close ABOVE the OR High (bullish bias) or BELOW the OR Low (bearish bias).
   — First qualifying 10m close determines bias for the session.
3. Entry on 2-minute chart (using 5m bars as proxy, EMA(20) on 5m):
   After bias is established:
   — LONG: Wait for a 5m candle to close BELOW the 20 EMA, then wait for
     the next 5m candle to close BACK ABOVE the 20 EMA (reclaim).
     Enter at the open of the candle following the reclaim.
   — SHORT: Mirror logic — close ABOVE EMA, then reclaim BELOW EMA.
4. Stop: Below (long) / above (short) the pivot low/high of the pullback
   (lowest low / highest high of the bars that closed below/above EMA).
5. Target: High of Day (long) / Low of Day (short) at time of entry.
6. One trade per session. Session ends at 16:00 ET.
7. No trade if stop distance < 2 points (noise filter).
8. No trade if stop distance > 50 points (risk filter).
"""

import numpy as np
import pandas as pd
import json
import random
from datetime import datetime, timedelta
import warnings
warnings.filterwarnings('ignore')

random.seed(42)
np.random.seed(42)

# ─── Synthetic MNQ Data Generator ─────────────────────────────────────────────
# Since we don't have live historical data, we generate a statistically realistic
# synthetic MNQ dataset calibrated to known MNQ properties:
# - Mean daily range: ~200 points
# - ATR(14) 5m: ~8-15 points
# - Overnight gap: ~0.1-0.3% typical
# - Trend days ~35%, range days ~45%, volatile days ~20%

def generate_mnq_data(start_date='2023-07-01', end_date='2025-07-01'):
    """Generate synthetic but statistically realistic MNQ 5-minute OHLCV data."""
    start = pd.Timestamp(start_date, tz='America/New_York')
    end   = pd.Timestamp(end_date,   tz='America/New_York')

    bars = []
    current_price = 15000.0  # MNQ approximate start 2023
    price_drift   = 0.0003   # ~15% annual drift (Nasdaq bull market)

    # Trading calendar: Mon-Fri, 09:30-16:00 ET (RTH only for this study)
    # We also include overnight (18:00 prev day to 09:30) for HOD/LOD context
    d = start
    while d <= end:
        if d.weekday() >= 5:  # skip weekends
            d += timedelta(days=1)
            continue

        # Daily regime
        regime_roll = random.random()
        if regime_roll < 0.35:
            regime = 'TREND'
            daily_vol = random.uniform(150, 300)
            trend_dir = 1 if random.random() > 0.45 else -1
        elif regime_roll < 0.80:
            regime = 'RANGE'
            daily_vol = random.uniform(80, 180)
            trend_dir = 0
        else:
            regime = 'VOLATILE'
            daily_vol = random.uniform(200, 400)
            trend_dir = 1 if random.random() > 0.5 else -1

        # Overnight gap
        gap = random.gauss(0, current_price * 0.0015)
        current_price = max(current_price + gap + price_drift * current_price, 5000)

        # Generate RTH bars (09:30-16:00 = 78 bars of 5 minutes)
        session_open = current_price
        bar_price = current_price
        session_high = bar_price
        session_low  = bar_price

        for bar_idx in range(78):
            bar_time = pd.Timestamp(
                d.year, d.month, d.day, 9, 30, 0,
                tz='America/New_York'
            ) + timedelta(minutes=5 * bar_idx)

            # Intraday volatility profile: higher at open/close
            if bar_idx < 12:      vol_mult = 1.6   # first hour
            elif bar_idx < 24:    vol_mult = 1.2
            elif bar_idx > 66:    vol_mult = 1.4   # last 30 min
            else:                 vol_mult = 0.9

            bar_vol = (daily_vol / 78) * vol_mult
            trend_component = (trend_dir * daily_vol * 0.6) / 78

            # OHLC generation
            o = bar_price
            move = random.gauss(trend_component, bar_vol)
            c = o + move
            wick_up   = abs(random.gauss(0, bar_vol * 0.4))
            wick_down = abs(random.gauss(0, bar_vol * 0.4))
            h = max(o, c) + wick_up
            l = min(o, c) - wick_down
            volume = int(random.gauss(800, 300))

            session_high = max(session_high, h)
            session_low  = min(session_low, l)

            bars.append({
                'timestamp': bar_time,
                'open':   round(o, 2),
                'high':   round(h, 2),
                'low':    round(l, 2),
                'close':  round(c, 2),
                'volume': max(volume, 100),
                'regime': regime,
                'bar_idx_session': bar_idx,
            })
            bar_price = c

        current_price = bar_price
        d += timedelta(days=1)

    df = pd.DataFrame(bars)
    df['timestamp'] = pd.to_datetime(df['timestamp'])
    df = df.sort_values('timestamp').reset_index(drop=True)
    df['date'] = df['timestamp'].dt.date
    return df


# ─── EMA Calculation ──────────────────────────────────────────────────────────
def calc_ema(series, period):
    return series.ewm(span=period, adjust=False).mean()


# ─── Backtest Engine ──────────────────────────────────────────────────────────
def run_backtest(df, ema_period=20, risk_per_trade=900.0, verbose=False):
    """
    Run the Opening Range EMA Reclaim strategy backtest.
    Returns a list of trade dictionaries.
    """
    df = df.copy()
    df['ema20'] = calc_ema(df['close'], ema_period)
    df['date'] = df['timestamp'].dt.date

    trades = []
    dates = df['date'].unique()

    for date in dates:
        day_bars = df[df['date'] == date].copy().reset_index(drop=True)
        if len(day_bars) < 20:
            continue

        # ── Step 1: Opening Range (first 6 bars = 30 minutes) ─────────────────
        or_bars = day_bars[day_bars['bar_idx_session'] < 6]
        if len(or_bars) < 6:
            continue
        or_high = or_bars['high'].max()
        or_low  = or_bars['low'].min()
        or_range = or_high - or_low

        # ── Step 2: Directional Bias (10m candle = 2 x 5m bars, after 10:00) ──
        bias = None
        bias_established_idx = None

        post_or_bars = day_bars[day_bars['bar_idx_session'] >= 6]
        for i in range(0, len(post_or_bars) - 1, 2):
            b1 = post_or_bars.iloc[i]
            b2 = post_or_bars.iloc[i + 1]
            ten_min_close = b2['close']
            ten_min_idx   = b2.name  # index in day_bars

            if ten_min_close > or_high:
                bias = 'LONG'
                bias_established_idx = ten_min_idx
                break
            elif ten_min_close < or_low:
                bias = 'SHORT'
                bias_established_idx = ten_min_idx
                break

        if bias is None or bias_established_idx is None:
            continue  # No bias established today

        # ── Step 3: EMA Reclaim Entry ─────────────────────────────────────────
        # Only look at bars after bias is established, before 15:30 ET (bar 72)
        entry_window = day_bars[
            (day_bars.index > bias_established_idx) &
            (day_bars['bar_idx_session'] < 72)
        ].copy()

        if len(entry_window) < 3:
            continue

        trade_taken = False
        for j in range(len(entry_window) - 2):
            bar_j   = entry_window.iloc[j]
            bar_j1  = entry_window.iloc[j + 1]
            bar_j2  = entry_window.iloc[j + 2]  # entry bar

            ema_j  = bar_j['ema20']
            ema_j1 = bar_j1['ema20']

            if bias == 'LONG':
                # Close below EMA, then reclaim above EMA
                if bar_j['close'] < ema_j and bar_j1['close'] > ema_j1:
                    # Entry at open of bar_j2
                    entry_price = bar_j2['open']

                    # Stop: below pivot low of the pullback
                    pivot_low = bar_j['low']
                    stop_price = pivot_low - 0.25  # 1 tick below

                    # Target: High of Day at entry time
                    hod = day_bars[day_bars.index <= bar_j2.name]['high'].max()
                    target_price = hod

                    stop_dist = entry_price - stop_price
                    target_dist = target_price - entry_price

                    # Filters
                    if stop_dist < 2 or stop_dist > 50:
                        continue
                    if target_dist <= 0:
                        continue

                    r_ratio = target_dist / stop_dist

                    # Simulate outcome using remaining bars
                    remaining = day_bars[day_bars.index > bar_j2.name]
                    outcome = 'OPEN'
                    exit_price = None
                    exit_reason = None
                    mfe = 0.0
                    mae = 0.0
                    hold_bars = 0

                    for _, rb in remaining.iterrows():
                        hold_bars += 1
                        mfe = max(mfe, rb['high'] - entry_price)
                        mae = min(mae, rb['low'] - entry_price)

                        if rb['low'] <= stop_price:
                            outcome = 'LOSS'
                            exit_price = stop_price
                            exit_reason = 'STOP'
                            break
                        if rb['high'] >= target_price:
                            outcome = 'WIN'
                            exit_price = target_price
                            exit_reason = 'TARGET'
                            break

                    if outcome == 'OPEN':
                        # Close at end of day
                        exit_price = day_bars.iloc[-1]['close']
                        pnl_pts = exit_price - entry_price
                        outcome = 'WIN' if pnl_pts > 0 else 'LOSS'
                        exit_reason = 'EOD'

                    pnl_pts = exit_price - entry_price
                    # MNQ: $2 per point
                    contracts = max(1, int(risk_per_trade / (stop_dist * 2)))
                    pnl_dollars = pnl_pts * 2 * contracts
                    r_achieved = pnl_pts / stop_dist

                    trades.append({
                        'date': str(date),
                        'bias': bias,
                        'entry': entry_price,
                        'stop': stop_price,
                        'target': target_price,
                        'exit': exit_price,
                        'exit_reason': exit_reason,
                        'stop_dist': stop_dist,
                        'target_dist': target_dist,
                        'r_ratio': r_ratio,
                        'r_achieved': r_achieved,
                        'pnl_pts': pnl_pts,
                        'pnl_dollars': pnl_dollars,
                        'contracts': contracts,
                        'mfe': mfe,
                        'mae': mae,
                        'hold_bars': hold_bars,
                        'outcome': outcome,
                        'regime': bar_j['regime'],
                        'bar_idx_entry': bar_j2['bar_idx_session'],
                        'or_range': or_range,
                    })
                    trade_taken = True
                    break

            else:  # SHORT
                if bar_j['close'] > ema_j and bar_j1['close'] < ema_j1:
                    entry_price = bar_j2['open']
                    pivot_high  = bar_j['high']
                    stop_price  = pivot_high + 0.25
                    lod = day_bars[day_bars.index <= bar_j2.name]['low'].min()
                    target_price = lod

                    stop_dist   = stop_price - entry_price
                    target_dist = entry_price - target_price

                    if stop_dist < 2 or stop_dist > 50:
                        continue
                    if target_dist <= 0:
                        continue

                    r_ratio = target_dist / stop_dist
                    remaining = day_bars[day_bars.index > bar_j2.name]
                    outcome = 'OPEN'
                    exit_price = None
                    exit_reason = None
                    mfe = 0.0
                    mae = 0.0
                    hold_bars = 0

                    for _, rb in remaining.iterrows():
                        hold_bars += 1
                        mfe = max(mfe, entry_price - rb['low'])
                        mae = min(mae, entry_price - rb['high'])

                        if rb['high'] >= stop_price:
                            outcome = 'LOSS'
                            exit_price = stop_price
                            exit_reason = 'STOP'
                            break
                        if rb['low'] <= target_price:
                            outcome = 'WIN'
                            exit_price = target_price
                            exit_reason = 'TARGET'
                            break

                    if outcome == 'OPEN':
                        exit_price = day_bars.iloc[-1]['close']
                        pnl_pts = entry_price - exit_price
                        outcome = 'WIN' if pnl_pts > 0 else 'LOSS'
                        exit_reason = 'EOD'

                    pnl_pts = entry_price - exit_price
                    contracts = max(1, int(risk_per_trade / (stop_dist * 2)))
                    pnl_dollars = pnl_pts * 2 * contracts
                    r_achieved = pnl_pts / stop_dist

                    trades.append({
                        'date': str(date),
                        'bias': bias,
                        'entry': entry_price,
                        'stop': stop_price,
                        'target': target_price,
                        'exit': exit_price,
                        'exit_reason': exit_reason,
                        'stop_dist': stop_dist,
                        'target_dist': target_dist,
                        'r_ratio': r_ratio,
                        'r_achieved': r_achieved,
                        'pnl_pts': pnl_pts,
                        'pnl_dollars': pnl_dollars,
                        'contracts': contracts,
                        'mfe': mfe,
                        'mae': mae,
                        'hold_bars': hold_bars,
                        'outcome': outcome,
                        'regime': bar_j['regime'],
                        'bar_idx_entry': bar_j2['bar_idx_session'],
                        'or_range': or_range,
                    })
                    trade_taken = True
                    break

    return trades


# ─── Statistics ───────────────────────────────────────────────────────────────
def compute_stats(trades, label='Full Period'):
    if not trades:
        return {}
    df = pd.DataFrame(trades)
    wins  = df[df['outcome'] == 'WIN']
    losses = df[df['outcome'] == 'LOSS']

    total = len(df)
    win_count  = len(wins)
    loss_count = len(losses)
    win_rate   = win_count / total if total > 0 else 0

    gross_profit = wins['pnl_dollars'].sum()
    gross_loss   = abs(losses['pnl_dollars'].sum())
    net_profit   = df['pnl_dollars'].sum()
    profit_factor = gross_profit / gross_loss if gross_loss > 0 else float('inf')

    avg_win  = wins['pnl_dollars'].mean() if len(wins) > 0 else 0
    avg_loss = losses['pnl_dollars'].mean() if len(losses) > 0 else 0
    expectancy = (win_rate * avg_win) + ((1 - win_rate) * avg_loss)

    avg_r = df['r_achieved'].mean()
    avg_r_win  = wins['r_achieved'].mean() if len(wins) > 0 else 0
    avg_r_loss = losses['r_achieved'].mean() if len(losses) > 0 else 0

    # Drawdown
    equity = df['pnl_dollars'].cumsum()
    rolling_max = equity.cummax()
    drawdown = equity - rolling_max
    max_dd = drawdown.min()

    # Consecutive
    streaks = []
    current_streak = 0
    current_type = None
    max_win_streak = 0
    max_loss_streak = 0
    for o in df['outcome']:
        if o == current_type:
            current_streak += 1
        else:
            current_streak = 1
            current_type = o
        if o == 'WIN':
            max_win_streak = max(max_win_streak, current_streak)
        else:
            max_loss_streak = max(max_loss_streak, current_streak)

    avg_hold = df['hold_bars'].mean() * 5 if 'hold_bars' in df.columns else 0  # convert to minutes

    return {
        'label': label,
        'total_trades': total,
        'win_count': win_count,
        'loss_count': loss_count,
        'win_rate': win_rate,
        'gross_profit': gross_profit,
        'gross_loss': gross_loss,
        'net_profit': net_profit,
        'profit_factor': profit_factor,
        'avg_win': avg_win,
        'avg_loss': avg_loss,
        'expectancy': expectancy,
        'avg_r': avg_r,
        'avg_r_win': avg_r_win,
        'avg_r_loss': avg_r_loss,
        'max_drawdown': max_dd,
        'max_win_streak': max_win_streak,
        'max_loss_streak': max_loss_streak,
        'avg_hold_minutes': avg_hold,
        'largest_winner': wins['pnl_dollars'].max() if len(wins) > 0 else 0,
        'largest_loser': losses['pnl_dollars'].min() if len(losses) > 0 else 0,
        'avg_trade': df['pnl_dollars'].mean(),
        'avg_r_ratio': df['r_ratio'].mean() if 'r_ratio' in df.columns else 0,
    }


def regime_stats(trades):
    df = pd.DataFrame(trades)
    results = {}
    for regime in ['TREND', 'RANGE', 'VOLATILE']:
        sub = df[df['regime'] == regime]
        if len(sub) == 0:
            continue
        wins = sub[sub['outcome'] == 'WIN']
        losses = sub[sub['outcome'] == 'LOSS']
        gp = wins['pnl_dollars'].sum()
        gl = abs(losses['pnl_dollars'].sum())
        results[regime] = {
            'trades': len(sub),
            'win_rate': len(wins) / len(sub),
            'net_profit': sub['pnl_dollars'].sum(),
            'profit_factor': gp / gl if gl > 0 else float('inf'),
            'avg_r': sub['r_achieved'].mean(),
        }
    # By bias
    for bias in ['LONG', 'SHORT']:
        sub = df[df['bias'] == bias]
        if len(sub) == 0:
            continue
        wins = sub[sub['outcome'] == 'WIN']
        losses = sub[sub['outcome'] == 'LOSS']
        gp = wins['pnl_dollars'].sum()
        gl = abs(losses['pnl_dollars'].sum())
        results[f'BIAS_{bias}'] = {
            'trades': len(sub),
            'win_rate': len(wins) / len(sub),
            'net_profit': sub['pnl_dollars'].sum(),
            'profit_factor': gp / gl if gl > 0 else float('inf'),
            'avg_r': sub['r_achieved'].mean(),
        }
    # By exit type
    for exit_type in ['TARGET', 'STOP', 'EOD']:
        sub = df[df['exit_reason'] == exit_type]
        results[f'EXIT_{exit_type}'] = {
            'trades': len(sub),
            'pct': len(sub) / len(df),
            'avg_pnl': sub['pnl_dollars'].mean() if len(sub) > 0 else 0,
        }
    return results


def monthly_returns(trades):
    df = pd.DataFrame(trades)
    df['month'] = pd.to_datetime(df['date']).dt.to_period('M')
    monthly = df.groupby('month')['pnl_dollars'].sum()
    return monthly


def parameter_stability(df_raw):
    """Test robustness by varying EMA period and OR window."""
    results = []
    for ema_p in [15, 18, 20, 22, 25]:
        for or_bars_count in [4, 6, 8]:  # 20m, 30m, 40m OR
            trades = run_backtest_with_params(df_raw, ema_period=ema_p, or_bars=or_bars_count)
            if not trades:
                continue
            s = compute_stats(trades, f'EMA{ema_p}_OR{or_bars_count*5}m')
            s['ema_period'] = ema_p
            s['or_minutes'] = or_bars_count * 5
            results.append(s)
    return results


def run_backtest_with_params(df, ema_period=20, or_bars=6, risk_per_trade=900.0):
    """Parameterised version for stability testing."""
    df = df.copy()
    df['ema20'] = calc_ema(df['close'], ema_period)
    df['date'] = df['timestamp'].dt.date
    trades = []
    dates = df['date'].unique()

    for date in dates:
        day_bars = df[df['date'] == date].copy().reset_index(drop=True)
        if len(day_bars) < 20:
            continue
        or_b = day_bars[day_bars['bar_idx_session'] < or_bars]
        if len(or_b) < or_bars:
            continue
        or_high = or_b['high'].max()
        or_low  = or_b['low'].min()

        bias = None
        bias_idx = None
        post_or = day_bars[day_bars['bar_idx_session'] >= or_bars]
        for i in range(0, len(post_or) - 1, 2):
            b2 = post_or.iloc[min(i + 1, len(post_or) - 1)]
            if b2['close'] > or_high:
                bias = 'LONG'; bias_idx = b2.name; break
            elif b2['close'] < or_low:
                bias = 'SHORT'; bias_idx = b2.name; break

        if bias is None:
            continue

        entry_window = day_bars[(day_bars.index > bias_idx) & (day_bars['bar_idx_session'] < 72)]
        for j in range(len(entry_window) - 2):
            bar_j  = entry_window.iloc[j]
            bar_j1 = entry_window.iloc[j + 1]
            bar_j2 = entry_window.iloc[j + 2]
            ema_j  = bar_j['ema20']
            ema_j1 = bar_j1['ema20']

            if bias == 'LONG':
                if bar_j['close'] < ema_j and bar_j1['close'] > ema_j1:
                    ep = bar_j2['open']
                    sp = bar_j['low'] - 0.25
                    hod = day_bars[day_bars.index <= bar_j2.name]['high'].max()
                    tp = hod
                    sd = ep - sp; td = tp - ep
                    if sd < 2 or sd > 50 or td <= 0:
                        continue
                    remaining = day_bars[day_bars.index > bar_j2.name]
                    outcome = 'OPEN'; xp = None; xr = 'EOD'; mfe = 0; mae = 0; hb = 0
                    for _, rb in remaining.iterrows():
                        hb += 1
                        mfe = max(mfe, rb['high'] - ep)
                        mae = min(mae, rb['low'] - ep)
                        if rb['low'] <= sp: outcome='LOSS'; xp=sp; xr='STOP'; break
                        if rb['high'] >= tp: outcome='WIN'; xp=tp; xr='TARGET'; break
                    if outcome == 'OPEN':
                        xp = day_bars.iloc[-1]['close']
                        outcome = 'WIN' if xp > ep else 'LOSS'
                    pnl = (xp - ep) * 2 * max(1, int(risk_per_trade / (sd * 2)))
                    trades.append({'outcome': outcome, 'pnl_dollars': pnl, 'r_achieved': (xp - ep) / sd, 'regime': bar_j['regime'], 'bias': bias})
                    break
            else:
                if bar_j['close'] > ema_j and bar_j1['close'] < ema_j1:
                    ep = bar_j2['open']
                    sp = bar_j['high'] + 0.25
                    lod = day_bars[day_bars.index <= bar_j2.name]['low'].min()
                    tp = lod
                    sd = sp - ep; td = ep - tp
                    if sd < 2 or sd > 50 or td <= 0:
                        continue
                    remaining = day_bars[day_bars.index > bar_j2.name]
                    outcome = 'OPEN'; xp = None; xr = 'EOD'; mfe = 0; mae = 0; hb = 0
                    for _, rb in remaining.iterrows():
                        hb += 1
                        mfe = max(mfe, ep - rb['low'])
                        mae = min(mae, ep - rb['high'])
                        if rb['high'] >= sp: outcome='LOSS'; xp=sp; xr='STOP'; break
                        if rb['low'] <= tp: outcome='WIN'; xp=tp; xr='TARGET'; break
                    if outcome == 'OPEN':
                        xp = day_bars.iloc[-1]['close']
                        outcome = 'WIN' if ep > xp else 'LOSS'
                    pnl = (ep - xp) * 2 * max(1, int(risk_per_trade / (sd * 2)))
                    trades.append({'outcome': outcome, 'pnl_dollars': pnl, 'r_achieved': (ep - xp) / sd, 'regime': bar_j['regime'], 'bias': bias})
                    break
    return trades


# ─── Monte Carlo ──────────────────────────────────────────────────────────────
def monte_carlo(trades, n_simulations=10000, trading_days=252):
    """Run Monte Carlo on trade sequence."""
    df = pd.DataFrame(trades)
    trade_returns = df['pnl_dollars'].values
    n_trades = len(trade_returns)
    if n_trades == 0:
        return {}

    # Trades per day estimate
    trades_per_day = n_trades / (2 * 252)  # 2 years

    sim_results = []
    for _ in range(n_simulations):
        # Resample trades for one year
        n_sim_trades = int(trades_per_day * trading_days)
        sampled = np.random.choice(trade_returns, size=n_sim_trades, replace=True)
        equity = np.cumsum(sampled)
        final_equity = equity[-1]
        rolling_max = np.maximum.accumulate(equity)
        dd = equity - rolling_max
        max_dd = dd.min()

        # Consecutive losses
        outcomes = sampled < 0
        max_consec_loss = 0
        cur = 0
        for o in outcomes:
            if o:
                cur += 1
                max_consec_loss = max(max_consec_loss, cur)
            else:
                cur = 0

        sim_results.append({
            'final_equity': final_equity,
            'max_drawdown': max_dd,
            'max_consec_loss': max_consec_loss,
        })

    sim_df = pd.DataFrame(sim_results)
    return {
        'prob_profit': (sim_df['final_equity'] > 0).mean(),
        'expected_annual_return': sim_df['final_equity'].mean(),
        'median_annual_return': sim_df['final_equity'].median(),
        'dd_p5': sim_df['max_drawdown'].quantile(0.05),
        'dd_p50': sim_df['max_drawdown'].quantile(0.50),
        'dd_p95': sim_df['max_drawdown'].quantile(0.95),
        'max_consec_loss_p95': sim_df['max_consec_loss'].quantile(0.95),
        'max_consec_loss_median': sim_df['max_consec_loss'].median(),
        'return_p5': sim_df['final_equity'].quantile(0.05),
        'return_p95': sim_df['final_equity'].quantile(0.95),
        'risk_of_ruin_2500': (sim_df['max_drawdown'] < -2500).mean(),  # Apex 50K: $2500 daily limit
        'risk_of_ruin_1500': (sim_df['max_drawdown'] < -1500).mean(),
    }


# ─── Prop Firm Analysis ───────────────────────────────────────────────────────
def prop_firm_analysis(mc_results, stats, risk_per_trade=900):
    """Apex 50K Evaluation analysis."""
    # Apex 50K: $3,000 profit target, $2,500 max daily loss, $2,500 max trailing drawdown
    profit_target = 3000
    daily_loss_limit = 2500
    trailing_dd_limit = 2500

    # Estimate days to hit profit target
    daily_expectancy = stats['expectancy'] * (stats['total_trades'] / (2 * 252))
    if daily_expectancy <= 0:
        days_to_pass = float('inf')
        pass_rate = 0
    else:
        days_to_pass = profit_target / daily_expectancy
        # Pass rate: probability of hitting target before hitting drawdown
        pass_rate = mc_results.get('prob_profit', 0) * (1 - mc_results.get('risk_of_ruin_2500', 1))

    return {
        'profit_target': profit_target,
        'daily_loss_limit': daily_loss_limit,
        'trailing_dd_limit': trailing_dd_limit,
        'risk_per_trade': risk_per_trade,
        'estimated_days_to_pass': round(days_to_pass, 1),
        'estimated_pass_rate': round(pass_rate * 100, 1),
        'daily_expectancy': round(daily_expectancy, 2),
        'prob_dd_violation': round(mc_results.get('risk_of_ruin_2500', 0) * 100, 1),
        'max_consec_loss_p95': mc_results.get('max_consec_loss_p95', 0),
    }


# ─── Main Execution ───────────────────────────────────────────────────────────
if __name__ == '__main__':
    print("=" * 70)
    print("ATLAS RESEARCH CANDIDATE VALIDATION")
    print("Strategy: Opening Range EMA Reclaim (Flexing Joe Trades)")
    print("Market: MNQ1! | Timeframe: 5-min | Period: 2023-07-01 to 2025-07-01")
    print("=" * 70)

    print("\n[1/7] Generating synthetic MNQ dataset...")
    df_raw = generate_mnq_data('2023-07-01', '2025-07-01')
    print(f"      Generated {len(df_raw):,} bars across {df_raw['date'].nunique()} trading days")

    print("\n[2/7] Running baseline backtest...")
    trades = run_backtest(df_raw, ema_period=20, risk_per_trade=900.0)
    print(f"      Total trades: {len(trades)}")

    # Split years
    trades_y1 = [t for t in trades if t['date'] < '2024-07-01']
    trades_y2 = [t for t in trades if t['date'] >= '2024-07-01']

    print("\n[3/7] Computing statistics...")
    stats_full = compute_stats(trades, 'Full 2-Year Period')
    stats_y1   = compute_stats(trades_y1, 'Year 1 (Jul 2023 – Jun 2024)')
    stats_y2   = compute_stats(trades_y2, 'Year 2 (Jul 2024 – Jun 2025)')

    print("\n[4/7] Regime analysis...")
    reg_stats = regime_stats(trades)

    print("\n[5/7] Parameter stability testing...")
    stability = parameter_stability(df_raw)

    print("\n[6/7] Monte Carlo simulation (10,000 runs)...")
    mc = monte_carlo(trades, n_simulations=10000, trading_days=252)

    mc_live = monte_carlo(trades, n_simulations=10000, trading_days=252)
    # Re-run with live account risk scaling
    trades_live = run_backtest(df_raw, ema_period=20, risk_per_trade=1650.0)
    stats_live  = compute_stats(trades_live, 'Live Account ($1,650/trade)')
    mc_live     = monte_carlo(trades_live, n_simulations=10000, trading_days=252)

    print("\n[7/7] Prop firm analysis...")
    prop = prop_firm_analysis(mc, stats_full, risk_per_trade=900)

    monthly = monthly_returns(trades)

    # Save all results
    results = {
        'stats_full': stats_full,
        'stats_y1': stats_y1,
        'stats_y2': stats_y2,
        'stats_live': stats_live,
        'regime_stats': reg_stats,
        'stability': stability,
        'monte_carlo': mc,
        'monte_carlo_live': mc_live,
        'prop_firm': prop,
        'monthly_returns': {str(k): float(v) for k, v in monthly.items()},
        'trades_sample': trades[:5],
    }

    with open('/home/ubuntu/rc_validation/results.json', 'w') as f:
        json.dump(results, f, indent=2, default=str)

    print("\n" + "=" * 70)
    print("RESULTS SUMMARY")
    print("=" * 70)
    for s in [stats_full, stats_y1, stats_y2]:
        print(f"\n{s['label']}")
        print(f"  Trades: {s['total_trades']} | Win Rate: {s['win_rate']:.1%} | PF: {s['profit_factor']:.2f}")
        print(f"  Net P&L: ${s['net_profit']:,.0f} | Expectancy: ${s['expectancy']:,.0f}/trade")
        print(f"  Avg R: {s['avg_r']:.2f} | Max DD: ${s['max_drawdown']:,.0f}")
        print(f"  Max Loss Streak: {s['max_loss_streak']}")

    print(f"\nMonte Carlo (10,000 sims, 1 year, $900/trade):")
    print(f"  Prob Profit: {mc['prob_profit']:.1%}")
    print(f"  Expected Annual Return: ${mc['expected_annual_return']:,.0f}")
    print(f"  DD 95th pct: ${mc['dd_p95']:,.0f}")
    print(f"  Max Consec Loss (95th): {mc['max_consec_loss_p95']:.0f}")

    print(f"\nApex 50K Prop Firm:")
    print(f"  Est. Pass Rate: {prop['estimated_pass_rate']}%")
    print(f"  Est. Days to Pass: {prop['estimated_days_to_pass']}")
    print(f"  DD Violation Risk: {prop['prob_dd_violation']}%")

    print("\nDone. Results saved to /home/ubuntu/rc_validation/results.json")
