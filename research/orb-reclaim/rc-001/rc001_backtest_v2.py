"""
Atlas RC-001 v2 — Opening Range EMA Reclaim (Full Checklist)
Incorporates all 6 steps from the Flexing Joe ORB Checklist PDF:

STEP 1 — External Conditions
  • Skip FOMC/NFP/CPI macro event days (simulated as ~8 days/year)
  • Mental readiness: not modelled (assumed pass)

STEP 2 — VIX Environment
  • VIX ≤ 20: standard size
  • VIX 20–25: reduce size (0.5× contracts), wider stops
  • VIX > 25: extreme caution — skip trade (too erratic)

STEP 3 — Pre-Market Structure
  • Gap direction vs prior day close
  • Price vs Prior Day High (PDH) / Prior Day Low (PDL)
  • London ORB (03:00–03:30 AM ET) — mark range, check position
  • Bias must align with gap + PDH/PDL + London ORB for FULL CONVICTION
  • Partial alignment = take trade but note lower conviction
  • No alignment = skip

STEP 4 — ES/NQ/VIX Alignment
  • All three aligned = highest conviction (take trade)
  • Any divergence = reduce size or skip
  • Simulated via regime + gap direction consistency

STEP 5 — Prior Day Candle Type
  • Inside Day / Doji = compressed energy, ORB breakouts hold better
  • Wide Range Day = continuation or reversal possible, wait for confirmation

STEP 6 — Bias Confirmation
  • Bullish: gap up + above PDH + London ORB + ES/NQ/VIX aligned
  • Bearish: gap down + below PDL + London ORB + ES/NQ/VIX aligned
  • Neutral/No bias: wait
  • No trade: mental game off

ADDITIONAL RULE FROM PDF:
  • Avoid 10-minute candles with long wicks in the breakout direction
    (long upper wick on long breakout = weak close, skip)

RISK PARAMETERS:
  • 50K Prop Account: $450/trade
  • Live Account: $1,650/trade
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

# ─── Macro event calendar (simulated ~8 high-impact days per year) ────────────
def generate_macro_days(start_date, end_date):
    """Generate a set of high-impact macro event dates to skip."""
    macro_days = set()
    d = pd.Timestamp(start_date)
    end = pd.Timestamp(end_date)
    # Approximately 8 FOMC/NFP/CPI events per year
    while d <= end:
        if random.random() < 8/252:  # ~8 per 252 trading days
            macro_days.add(d.date())
        d += timedelta(days=1)
    return macro_days


# ─── Synthetic MNQ Data Generator (v2 — with pre-market context) ─────────────
def generate_mnq_data_v2(start_date='2023-07-01', end_date='2025-07-01'):
    """
    Generate synthetic MNQ 5-minute OHLCV data with pre-market context:
    - VIX level per day
    - Gap vs prior close
    - Prior day high/low
    - London ORB direction
    - Prior day candle type
    - ES/NQ alignment score
    """
    start = pd.Timestamp(start_date)
    end   = pd.Timestamp(end_date)

    bars = []
    daily_meta = {}

    current_price = 15000.0
    price_drift   = 0.0003
    prev_close    = current_price
    prev_high     = current_price + 100
    prev_low      = current_price - 100
    prev_range    = 200.0

    # VIX simulation: mean-reverting around 18
    vix = 18.0

    d = start
    while d <= end:
        if d.weekday() >= 5:
            d += timedelta(days=1)
            continue

        # VIX evolution
        vix += random.gauss(0, 1.5)
        vix = max(10, min(50, vix + 0.1 * (18 - vix)))  # mean-revert to 18

        # Daily regime
        regime_roll = random.random()
        if vix > 25:
            # High VIX days are more volatile
            regime_roll = min(regime_roll, 0.5)  # push toward volatile
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
        gap_pct = random.gauss(0, 0.0015)
        gap_pts = current_price * gap_pct
        open_price = max(prev_close + gap_pts + price_drift * current_price, 5000)

        # London ORB (03:00–03:30 AM ET) — simulated as a directional signal
        london_dir = 1 if random.random() > 0.5 else -1
        # London aligns with day trend ~60% of time
        if trend_dir != 0 and random.random() < 0.6:
            london_dir = trend_dir

        # Prior day candle type
        if prev_range < 100:
            prev_day_type = 'INSIDE_DOJI'
        elif prev_range > 250:
            prev_day_type = 'WIDE_RANGE'
        else:
            prev_day_type = 'NORMAL'

        # ES/NQ alignment (simulated: aligned ~70% of trend days, ~40% range days)
        if regime == 'TREND':
            es_nq_aligned = random.random() < 0.70
        elif regime == 'VOLATILE':
            es_nq_aligned = random.random() < 0.55
        else:
            es_nq_aligned = random.random() < 0.40

        # Gap direction
        gap_dir = 1 if gap_pts > 5 else (-1 if gap_pts < -5 else 0)

        # PDH/PDL position
        above_pdh = open_price > prev_high
        below_pdl = open_price < prev_low

        # Pre-market bias score (0 = no bias, 1 = partial, 2 = full conviction)
        # For LONG: gap up + above PDH + London bullish + ES/NQ aligned
        long_signals  = sum([gap_dir == 1, above_pdh, london_dir == 1, es_nq_aligned])
        short_signals = sum([gap_dir == -1, below_pdl, london_dir == -1, es_nq_aligned])

        if long_signals >= 3:
            premarket_bias = 'LONG'
            bias_conviction = 'HIGH' if long_signals == 4 else 'MEDIUM'
        elif short_signals >= 3:
            premarket_bias = 'SHORT'
            bias_conviction = 'HIGH' if short_signals == 4 else 'MEDIUM'
        elif long_signals == 2:
            premarket_bias = 'LONG'
            bias_conviction = 'LOW'
        elif short_signals == 2:
            premarket_bias = 'SHORT'
            bias_conviction = 'LOW'
        else:
            premarket_bias = 'NEUTRAL'
            bias_conviction = 'NONE'

        # Store daily metadata
        daily_meta[d.date()] = {
            'vix': vix,
            'regime': regime,
            'gap_dir': gap_dir,
            'gap_pts': gap_pts,
            'above_pdh': above_pdh,
            'below_pdl': below_pdl,
            'london_dir': london_dir,
            'es_nq_aligned': es_nq_aligned,
            'prev_day_type': prev_day_type,
            'premarket_bias': premarket_bias,
            'bias_conviction': bias_conviction,
            'prev_high': prev_high,
            'prev_low': prev_low,
        }

        # Generate RTH bars
        bar_price = open_price
        session_high = bar_price
        session_low  = bar_price
        day_bars_list = []

        for bar_idx in range(78):
            bar_time = pd.Timestamp(
                d.year, d.month, d.day, 9, 30, 0,
                tz='America/New_York'
            ) + timedelta(minutes=5 * bar_idx)

            if bar_idx < 12:      vol_mult = 1.6
            elif bar_idx < 24:    vol_mult = 1.2
            elif bar_idx > 66:    vol_mult = 1.4
            else:                 vol_mult = 0.9

            bar_vol = (daily_vol / 78) * vol_mult
            trend_component = (trend_dir * daily_vol * 0.6) / 78

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

            day_bars_list.append({
                'timestamp': bar_time,
                'open':   round(o, 2),
                'high':   round(h, 2),
                'low':    round(l, 2),
                'close':  round(c, 2),
                'volume': max(volume, 100),
                'regime': regime,
                'bar_idx_session': bar_idx,
                'date': d.date(),
                'vix': vix,
                'premarket_bias': premarket_bias,
                'bias_conviction': bias_conviction,
                'es_nq_aligned': es_nq_aligned,
                'prev_day_type': prev_day_type,
                'gap_dir': gap_dir,
            })
            bar_price = c

        bars.extend(day_bars_list)
        prev_close = bar_price
        prev_high  = session_high
        prev_low   = session_low
        prev_range = session_high - session_low
        current_price = bar_price
        d += timedelta(days=1)

    df = pd.DataFrame(bars)
    df['timestamp'] = pd.to_datetime(df['timestamp'])
    df = df.sort_values('timestamp').reset_index(drop=True)
    return df, daily_meta


def calc_ema(series, period):
    return series.ewm(span=period, adjust=False).mean()


# ─── Checklist Filter ─────────────────────────────────────────────────────────
def passes_checklist(day_meta, required_bias_direction, macro_days, date):
    """
    Returns (passes: bool, reason: str, size_multiplier: float)
    Applies all 6 checklist steps.
    """
    # Step 1: Macro event
    if date in macro_days:
        return False, 'MACRO_EVENT', 0.0

    # Step 2: VIX
    vix = day_meta['vix']
    if vix > 25:
        return False, 'VIX_TOO_HIGH', 0.0
    size_mult = 0.5 if vix > 20 else 1.0

    # Step 3 + 4 + 6: Pre-market bias must align with ORB breakout direction
    pm_bias = day_meta['premarket_bias']
    conviction = day_meta['bias_conviction']

    if pm_bias == 'NEUTRAL':
        return False, 'NO_PREMARKET_BIAS', 0.0

    if pm_bias != required_bias_direction:
        return False, 'BIAS_MISMATCH', 0.0

    # Low conviction = reduce size
    if conviction == 'LOW':
        size_mult *= 0.5

    # Step 4: ES/NQ alignment
    if not day_meta['es_nq_aligned']:
        size_mult *= 0.5
        if size_mult < 0.25:
            return False, 'NO_ALIGNMENT', 0.0

    # Step 5: Prior day type — inside day = higher conviction, no change to filter
    # Wide range day = reduce size slightly
    if day_meta['prev_day_type'] == 'WIDE_RANGE':
        size_mult *= 0.8

    return True, 'PASS', size_mult


# ─── Backtest Engine v2 ───────────────────────────────────────────────────────
def run_backtest_v2(df, daily_meta, ema_period=20, risk_per_trade=450.0,
                    apply_checklist=True, macro_days=None):
    if macro_days is None:
        macro_days = set()

    df = df.copy()
    df['ema20'] = calc_ema(df['close'], ema_period)

    trades = []
    skipped = {'MACRO_EVENT': 0, 'VIX_TOO_HIGH': 0, 'NO_PREMARKET_BIAS': 0,
               'BIAS_MISMATCH': 0, 'NO_ALIGNMENT': 0, 'WEAK_10M_CANDLE': 0,
               'NO_BIAS_ESTABLISHED': 0, 'NO_SETUP': 0}

    dates = sorted(df['date'].unique())

    for date in dates:
        day_bars = df[df['date'] == date].copy().reset_index(drop=True)
        if len(day_bars) < 20:
            continue

        meta = daily_meta.get(date, {})

        # Opening Range
        or_bars = day_bars[day_bars['bar_idx_session'] < 6]
        if len(or_bars) < 6:
            continue
        or_high = or_bars['high'].max()
        or_low  = or_bars['low'].min()
        or_range = or_high - or_low

        # Find directional bias from 10m candle close
        bias = None
        bias_established_idx = None
        weak_candle = False

        post_or = day_bars[day_bars['bar_idx_session'] >= 6]
        for i in range(0, len(post_or) - 1, 2):
            b1 = post_or.iloc[i]
            b2 = post_or.iloc[min(i + 1, len(post_or) - 1)]
            ten_min_close = b2['close']
            ten_min_idx   = b2.name

            if ten_min_close > or_high:
                # Check for weak candle (long upper wick = close near low of 10m candle)
                ten_min_high  = max(b1['high'], b2['high'])
                ten_min_low   = min(b1['low'], b2['low'])
                ten_min_range = ten_min_high - ten_min_low
                upper_wick    = ten_min_high - ten_min_close
                if ten_min_range > 0 and upper_wick / ten_min_range > 0.5:
                    weak_candle = True
                    skipped['WEAK_10M_CANDLE'] += 1
                    break
                bias = 'LONG'
                bias_established_idx = ten_min_idx
                break
            elif ten_min_close < or_low:
                ten_min_high  = max(b1['high'], b2['high'])
                ten_min_low   = min(b1['low'], b2['low'])
                ten_min_range = ten_min_high - ten_min_low
                lower_wick    = ten_min_close - ten_min_low
                if ten_min_range > 0 and lower_wick / ten_min_range > 0.5:
                    weak_candle = True
                    skipped['WEAK_10M_CANDLE'] += 1
                    break
                bias = 'SHORT'
                bias_established_idx = ten_min_idx
                break

        if weak_candle:
            continue
        if bias is None:
            skipped['NO_BIAS_ESTABLISHED'] += 1
            continue

        # Apply checklist filters
        if apply_checklist:
            passes, reason, size_mult = passes_checklist(meta, bias, macro_days, date)
            if not passes:
                skipped[reason] = skipped.get(reason, 0) + 1
                continue
        else:
            size_mult = 1.0

        # EMA Reclaim Entry
        entry_window = day_bars[
            (day_bars.index > bias_established_idx) &
            (day_bars['bar_idx_session'] < 72)
        ].copy()

        if len(entry_window) < 3:
            skipped['NO_SETUP'] += 1
            continue

        trade_taken = False
        for j in range(len(entry_window) - 2):
            bar_j   = entry_window.iloc[j]
            bar_j1  = entry_window.iloc[j + 1]
            bar_j2  = entry_window.iloc[j + 2]

            ema_j  = bar_j['ema20']
            ema_j1 = bar_j1['ema20']

            if bias == 'LONG':
                if bar_j['close'] < ema_j and bar_j1['close'] > ema_j1:
                    ep = bar_j2['open']
                    sp = bar_j['low'] - 0.25
                    hod = day_bars[day_bars.index <= bar_j2.name]['high'].max()
                    tp = hod
                    sd = ep - sp
                    td = tp - ep
                    if sd < 2 or sd > 50 or td <= 0:
                        continue

                    # Adjusted contracts based on size multiplier
                    base_contracts = max(1, int(risk_per_trade / (sd * 2)))
                    contracts = max(1, int(base_contracts * size_mult))

                    remaining = day_bars[day_bars.index > bar_j2.name]
                    outcome = 'OPEN'; xp = None; xr = 'EOD'; mfe = 0; mae = 0; hb = 0
                    for _, rb in remaining.iterrows():
                        hb += 1
                        mfe = max(mfe, rb['high'] - ep)
                        mae = min(mae, rb['low'] - ep)
                        if rb['low'] <= sp:  outcome='LOSS'; xp=sp; xr='STOP'; break
                        if rb['high'] >= tp: outcome='WIN';  xp=tp; xr='TARGET'; break
                    if outcome == 'OPEN':
                        xp = day_bars.iloc[-1]['close']
                        outcome = 'WIN' if xp > ep else 'LOSS'
                    pnl_pts = xp - ep
                    pnl_dollars = pnl_pts * 2 * contracts
                    r_achieved = pnl_pts / sd

                    trades.append({
                        'date': str(date),
                        'bias': bias,
                        'entry': ep, 'stop': sp, 'target': tp, 'exit': xp,
                        'exit_reason': xr,
                        'stop_dist': sd, 'target_dist': td,
                        'r_ratio': td / sd,
                        'r_achieved': r_achieved,
                        'pnl_pts': pnl_pts,
                        'pnl_dollars': pnl_dollars,
                        'contracts': contracts,
                        'size_mult': size_mult,
                        'mfe': mfe, 'mae': mae, 'hold_bars': hb,
                        'outcome': outcome,
                        'regime': bar_j['regime'],
                        'vix': bar_j.get('vix', 18),
                        'bias_conviction': meta.get('bias_conviction', 'UNKNOWN'),
                        'es_nq_aligned': meta.get('es_nq_aligned', False),
                        'prev_day_type': meta.get('prev_day_type', 'NORMAL'),
                        'bar_idx_entry': bar_j2['bar_idx_session'],
                        'or_range': or_range,
                    })
                    trade_taken = True
                    break

            else:  # SHORT
                if bar_j['close'] > ema_j and bar_j1['close'] < ema_j1:
                    ep = bar_j2['open']
                    sp = bar_j['high'] + 0.25
                    lod = day_bars[day_bars.index <= bar_j2.name]['low'].min()
                    tp = lod
                    sd = sp - ep
                    td = ep - tp
                    if sd < 2 or sd > 50 or td <= 0:
                        continue

                    base_contracts = max(1, int(risk_per_trade / (sd * 2)))
                    contracts = max(1, int(base_contracts * size_mult))

                    remaining = day_bars[day_bars.index > bar_j2.name]
                    outcome = 'OPEN'; xp = None; xr = 'EOD'; mfe = 0; mae = 0; hb = 0
                    for _, rb in remaining.iterrows():
                        hb += 1
                        mfe = max(mfe, ep - rb['low'])
                        mae = min(mae, ep - rb['high'])
                        if rb['high'] >= sp: outcome='LOSS'; xp=sp; xr='STOP'; break
                        if rb['low'] <= tp:  outcome='WIN';  xp=tp; xr='TARGET'; break
                    if outcome == 'OPEN':
                        xp = day_bars.iloc[-1]['close']
                        outcome = 'WIN' if ep > xp else 'LOSS'
                    pnl_pts = ep - xp
                    pnl_dollars = pnl_pts * 2 * contracts
                    r_achieved = pnl_pts / sd

                    trades.append({
                        'date': str(date),
                        'bias': bias,
                        'entry': ep, 'stop': sp, 'target': tp, 'exit': xp,
                        'exit_reason': xr,
                        'stop_dist': sd, 'target_dist': td,
                        'r_ratio': td / sd,
                        'r_achieved': r_achieved,
                        'pnl_pts': pnl_pts,
                        'pnl_dollars': pnl_dollars,
                        'contracts': contracts,
                        'size_mult': size_mult,
                        'mfe': mfe, 'mae': mae, 'hold_bars': hb,
                        'outcome': outcome,
                        'regime': bar_j['regime'],
                        'vix': bar_j.get('vix', 18),
                        'bias_conviction': meta.get('bias_conviction', 'UNKNOWN'),
                        'es_nq_aligned': meta.get('es_nq_aligned', False),
                        'prev_day_type': meta.get('prev_day_type', 'NORMAL'),
                        'bar_idx_entry': bar_j2['bar_idx_session'],
                        'or_range': or_range,
                    })
                    trade_taken = True
                    break

        if not trade_taken:
            skipped['NO_SETUP'] += 1

    return trades, skipped


def compute_stats(trades, label=''):
    if not trades:
        return {'label': label, 'total_trades': 0}
    df = pd.DataFrame(trades)
    wins   = df[df['outcome'] == 'WIN']
    losses = df[df['outcome'] == 'LOSS']
    total  = len(df)
    wc = len(wins); lc = len(losses)
    wr = wc / total if total > 0 else 0
    gp = wins['pnl_dollars'].sum()
    gl = abs(losses['pnl_dollars'].sum())
    np_ = df['pnl_dollars'].sum()
    pf = gp / gl if gl > 0 else float('inf')
    avg_win  = wins['pnl_dollars'].mean() if wc > 0 else 0
    avg_loss = losses['pnl_dollars'].mean() if lc > 0 else 0
    exp = (wr * avg_win) + ((1 - wr) * avg_loss)
    avg_r = df['r_achieved'].mean()
    equity = df['pnl_dollars'].cumsum()
    dd = (equity - equity.cummax()).min()
    max_win_streak = max_loss_streak = cur = 0
    cur_type = None
    for o in df['outcome']:
        if o == cur_type: cur += 1
        else: cur = 1; cur_type = o
        if o == 'WIN':  max_win_streak  = max(max_win_streak, cur)
        else:           max_loss_streak = max(max_loss_streak, cur)
    avg_hold = df['hold_bars'].mean() * 5 if 'hold_bars' in df.columns else 0
    return {
        'label': label, 'total_trades': total, 'win_count': wc, 'loss_count': lc,
        'win_rate': wr, 'gross_profit': gp, 'gross_loss': gl, 'net_profit': np_,
        'profit_factor': pf, 'avg_win': avg_win, 'avg_loss': avg_loss,
        'expectancy': exp, 'avg_r': avg_r,
        'max_drawdown': dd, 'max_win_streak': max_win_streak,
        'max_loss_streak': max_loss_streak, 'avg_hold_minutes': avg_hold,
        'largest_winner': wins['pnl_dollars'].max() if wc > 0 else 0,
        'largest_loser': losses['pnl_dollars'].min() if lc > 0 else 0,
        'avg_trade': df['pnl_dollars'].mean(),
        'avg_r_ratio': df['r_ratio'].mean() if 'r_ratio' in df.columns else 0,
    }


def regime_stats(trades):
    df = pd.DataFrame(trades)
    results = {}
    for regime in ['TREND', 'RANGE', 'VOLATILE']:
        sub = df[df['regime'] == regime]
        if len(sub) == 0: continue
        wins = sub[sub['outcome'] == 'WIN']
        losses = sub[sub['outcome'] == 'LOSS']
        gp = wins['pnl_dollars'].sum(); gl = abs(losses['pnl_dollars'].sum())
        results[regime] = {
            'trades': len(sub), 'win_rate': len(wins)/len(sub),
            'net_profit': sub['pnl_dollars'].sum(),
            'profit_factor': gp/gl if gl > 0 else float('inf'),
            'avg_r': sub['r_achieved'].mean(),
        }
    for bias in ['LONG', 'SHORT']:
        sub = df[df['bias'] == bias]
        if len(sub) == 0: continue
        wins = sub[sub['outcome'] == 'WIN']
        losses = sub[sub['outcome'] == 'LOSS']
        gp = wins['pnl_dollars'].sum(); gl = abs(losses['pnl_dollars'].sum())
        results[f'BIAS_{bias}'] = {
            'trades': len(sub), 'win_rate': len(wins)/len(sub),
            'net_profit': sub['pnl_dollars'].sum(),
            'profit_factor': gp/gl if gl > 0 else float('inf'),
            'avg_r': sub['r_achieved'].mean(),
        }
    for conv in ['HIGH', 'MEDIUM', 'LOW']:
        sub = df[df['bias_conviction'] == conv] if 'bias_conviction' in df.columns else pd.DataFrame()
        if len(sub) == 0: continue
        wins = sub[sub['outcome'] == 'WIN']
        losses = sub[sub['outcome'] == 'LOSS']
        gp = wins['pnl_dollars'].sum(); gl = abs(losses['pnl_dollars'].sum())
        results[f'CONVICTION_{conv}'] = {
            'trades': len(sub), 'win_rate': len(wins)/len(sub),
            'net_profit': sub['pnl_dollars'].sum(),
            'profit_factor': gp/gl if gl > 0 else float('inf'),
        }
    for exit_type in ['TARGET', 'STOP', 'EOD']:
        sub = df[df['exit_reason'] == exit_type]
        results[f'EXIT_{exit_type}'] = {
            'trades': len(sub), 'pct': len(sub)/len(df),
            'avg_pnl': sub['pnl_dollars'].mean() if len(sub) > 0 else 0,
        }
    return results


def monthly_returns(trades):
    df = pd.DataFrame(trades)
    df['month'] = pd.to_datetime(df['date']).dt.to_period('M')
    return df.groupby('month')['pnl_dollars'].sum()


def monte_carlo(trades, n_simulations=10000, trading_days=252):
    df = pd.DataFrame(trades)
    trade_returns = df['pnl_dollars'].values
    n_trades = len(trade_returns)
    if n_trades == 0: return {}
    trades_per_day = n_trades / (2 * 252)
    sim_results = []
    for _ in range(n_simulations):
        n_sim = int(trades_per_day * trading_days)
        sampled = np.random.choice(trade_returns, size=max(n_sim, 1), replace=True)
        equity = np.cumsum(sampled)
        final_equity = equity[-1]
        rolling_max = np.maximum.accumulate(equity)
        dd = equity - rolling_max
        max_dd = dd.min()
        outcomes = sampled < 0
        max_cl = cur = 0
        for o in outcomes:
            cur = cur + 1 if o else 0
            max_cl = max(max_cl, cur)
        sim_results.append({'final_equity': final_equity, 'max_drawdown': max_dd, 'max_consec_loss': max_cl})
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
        'risk_of_ruin_2500': (sim_df['max_drawdown'] < -2500).mean(),
        'risk_of_ruin_1500': (sim_df['max_drawdown'] < -1500).mean(),
        'risk_of_ruin_900': (sim_df['max_drawdown'] < -900).mean(),
    }


# ─── Main ─────────────────────────────────────────────────────────────────────
if __name__ == '__main__':
    print("=" * 70)
    print("ATLAS RC-001 v2 — FULL CHECKLIST BACKTEST")
    print("Strategy: Opening Range EMA Reclaim (Flexing Joe Full Guide)")
    print("=" * 70)

    print("\n[1/8] Generating synthetic MNQ dataset with pre-market context...")
    df_raw, daily_meta = generate_mnq_data_v2('2023-07-01', '2025-07-01')
    macro_days = generate_macro_days('2023-07-01', '2025-07-01')
    print(f"      {len(df_raw):,} bars | {df_raw['date'].nunique()} trading days | {len(macro_days)} macro days")

    print("\n[2/8] Baseline (no checklist, $450/trade)...")
    trades_base, skip_base = run_backtest_v2(df_raw, daily_meta, risk_per_trade=450, apply_checklist=False, macro_days=set())
    stats_base = compute_stats(trades_base, 'Baseline — No Checklist ($450/trade)')

    print("\n[3/8] Full checklist ($450/trade — 50K Prop)...")
    trades_prop, skip_prop = run_backtest_v2(df_raw, daily_meta, risk_per_trade=450, apply_checklist=True, macro_days=macro_days)
    stats_prop = compute_stats(trades_prop, 'Full Checklist — 50K Prop ($450/trade)')

    print("\n[4/8] Full checklist ($1,650/trade — Live Account)...")
    trades_live, skip_live = run_backtest_v2(df_raw, daily_meta, risk_per_trade=1650, apply_checklist=True, macro_days=macro_days)
    stats_live = compute_stats(trades_live, 'Full Checklist — Live Account ($1,650/trade)')

    print("\n[5/8] Year splits (prop)...")
    trades_y1 = [t for t in trades_prop if t['date'] < '2024-07-01']
    trades_y2 = [t for t in trades_prop if t['date'] >= '2024-07-01']
    stats_y1 = compute_stats(trades_y1, 'Year 1 — Checklist ($450/trade)')
    stats_y2 = compute_stats(trades_y2, 'Year 2 — Checklist ($450/trade)')

    print("\n[6/8] Regime and conviction analysis...")
    reg_stats = regime_stats(trades_prop)

    print("\n[7/8] Monte Carlo (10,000 sims)...")
    mc_prop = monte_carlo(trades_prop, n_simulations=10000)
    mc_live = monte_carlo(trades_live, n_simulations=10000)

    print("\n[8/8] Monthly returns...")
    monthly_prop = monthly_returns(trades_prop)
    monthly_live = monthly_returns(trades_live)

    # Prop firm analysis
    prop_daily_exp = stats_prop['expectancy'] * (stats_prop['total_trades'] / (2 * 252)) if stats_prop['total_trades'] > 0 else 0
    prop_days_to_target = 3000 / prop_daily_exp if prop_daily_exp > 0 else float('inf')
    prop_dd_risk = mc_prop.get('risk_of_ruin_2500', 1.0)

    results = {
        'stats_base': stats_base,
        'stats_prop': stats_prop,
        'stats_live': stats_live,
        'stats_y1': stats_y1,
        'stats_y2': stats_y2,
        'regime_stats': reg_stats,
        'monte_carlo_prop': mc_prop,
        'monte_carlo_live': mc_live,
        'monthly_prop': {str(k): float(v) for k, v in monthly_prop.items()},
        'monthly_live': {str(k): float(v) for k, v in monthly_live.items()},
        'skip_prop': skip_prop,
        'skip_base': skip_base,
        'prop_firm': {
            'risk_per_trade': 450,
            'profit_target': 3000,
            'daily_loss_limit': 2500,
            'trailing_dd_limit': 2500,
            'daily_expectancy': round(prop_daily_exp, 2),
            'estimated_days_to_pass': round(prop_days_to_target, 1),
            'prob_dd_violation': round(prop_dd_risk * 100, 1),
            'max_consec_loss_p95': mc_prop.get('max_consec_loss_p95', 0),
        },
    }

    with open('/home/ubuntu/rc_validation/results_v2.json', 'w') as f:
        json.dump(results, f, indent=2, default=str)

    print("\n" + "=" * 70)
    print("RESULTS SUMMARY")
    print("=" * 70)
    for s in [stats_base, stats_prop, stats_live, stats_y1, stats_y2]:
        if s['total_trades'] == 0:
            print(f"\n{s['label']}: No trades")
            continue
        print(f"\n{s['label']}")
        print(f"  Trades: {s['total_trades']} | WR: {s['win_rate']:.1%} | PF: {s['profit_factor']:.2f}")
        print(f"  Net P&L: ${s['net_profit']:,.0f} | Exp: ${s['expectancy']:,.0f}/trade | Avg R: {s['avg_r']:.2f}")
        print(f"  Max DD: ${s['max_drawdown']:,.0f} | Max Loss Streak: {s['max_loss_streak']}")

    print(f"\nSkipped (checklist): {skip_prop}")
    print(f"\nMonte Carlo — Prop ($450/trade):")
    print(f"  Prob Profit: {mc_prop.get('prob_profit',0):.1%}")
    print(f"  Expected Annual: ${mc_prop.get('expected_annual_return',0):,.0f}")
    print(f"  DD 95th pct: ${mc_prop.get('dd_p95',0):,.0f}")
    print(f"  DD Violation Risk (>$2500): {mc_prop.get('risk_of_ruin_2500',1)*100:.1f}%")
    print(f"  Max Consec Loss (95th): {mc_prop.get('max_consec_loss_p95',0):.0f}")
    print(f"\nProp Firm (Apex 50K, $450/trade):")
    print(f"  Est. Days to Pass: {prop_days_to_target:.0f}")
    print(f"  DD Violation Risk: {prop_dd_risk*100:.1f}%")
    print("\nDone. Saved to results_v2.json")
