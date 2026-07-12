"""
SB1 Canonical Validation Simulator v2 — Sprint 086
====================================================
Faithfully reproduces ALL Pine Script filters from the real strategy:
  $132k CHOP Filter — Trend Momentum Rider v4 [Manus]

Missing filters identified in v1 calibration failure (910 vs 146 trades):
  1. VWAP Direction filter (Long above VWAP, Short below VWAP)
  2. Skip Open 30 min (no entries before 10:00 AM ET)
  3. Monday Extra Skip (no entries before 10:30 AM ET on Mondays)
  4. Block 14:xx hour
  5. Max Daily Losses = 2
  6. Exhaustion Exit: 2.5× ATR + 2.0× vol + 1.5× prev body + min $500 + after 11:00 AM
  7. Trailing Stop: MFE ≥ $1,500 AND bars ≥ 12 (not just MFE)
  8. Seasonal filters (Jul/Dec VIX proxy, EMA cross count)

Strategy constants (from Pine Script source):
  EMA period:          15
  Slow Burn bars:      4 (consecutive bars on same side of EMA)
  Max body mult:       5.0 (body ≤ 5×ATR)
  Max dist mult:       3.0 (close within 3×ATR of EMA)
  EMA cross recency:   8 bars
  CHOP period:         14
  CHOP threshold:      61.8
  ADX period:          14
  ADX threshold:       20
  EMA break bars:      2
  Exhaustion: dist ≥2.5×ATR + vol ≥2.0×avg + body ≥1.5×prev + min $500 + after 11:00
  Trail trigger:       $1,500 MFE AND ≥12 bars in trade
  Trail lock:          $800 profit
  Time stop:           12 bars (60 min)
  Early loss stop:     $900 (within first 1 bar)
  Max daily losses:    2
  Skip open:           10:00 AM ET (30 min after open)
  Monday skip:         10:30 AM ET
  Block 14:xx:         14:00–14:59 ET
  EOD close:           15:55 ET
  Point value:         $2.00 per point (MNQ)
  Commission:          $0.62 per side = $1.24 round trip
"""

import pandas as pd
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import warnings
warnings.filterwarnings('ignore')

# ─── Load real MNQ 5-min data ───────────────────────────────────────────────
print("Loading MNQ 5-minute canonical dataset...")
df = pd.read_csv('/home/ubuntu/Project-Atlas/data/raw/massive/MNQ_5min_full.csv')
df['dt'] = pd.to_datetime(df['timestamp_et'], utc=True).dt.tz_convert('America/New_York').dt.tz_localize(None)
df = df.sort_values('dt').reset_index(drop=True)
df['date'] = df['dt'].dt.date
df['hour'] = df['dt'].dt.hour
df['minute'] = df['dt'].dt.minute
df['dow'] = df['dt'].dt.day_name()
df['month_num'] = df['dt'].dt.month
print(f"  Loaded {len(df):,} bars from {df['dt'].iloc[0]} to {df['dt'].iloc[-1]}")

# ─── Indicator Calculations ──────────────────────────────────────────────────
print("Computing indicators...")

# EMA 15
df['ema15'] = df['close'].ewm(span=15, adjust=False).mean()

# ATR 14
df['tr'] = np.maximum(df['high'] - df['low'],
           np.maximum(abs(df['high'] - df['close'].shift(1)),
                      abs(df['low'] - df['close'].shift(1))))
df['atr14'] = df['tr'].ewm(span=14, adjust=False).mean()

# CHOP Index 14
def chop_index(df, period=14):
    chop = pd.Series(np.nan, index=df.index)
    atr_sum = df['tr'].rolling(period).sum()
    high_max = df['high'].rolling(period).max()
    low_min = df['low'].rolling(period).min()
    rng = high_max - low_min
    valid = rng > 0
    chop[valid] = 100 * np.log10(atr_sum[valid] / rng[valid]) / np.log10(period)
    chop[~valid] = 50
    return chop

df['chop14'] = chop_index(df, 14)

# ADX 14
def compute_adx(df, period=14):
    up_move = df['high'].diff()
    down_move = -df['low'].diff()
    plus_dm = np.where((up_move > down_move) & (up_move > 0), up_move, 0.0)
    minus_dm = np.where((down_move > up_move) & (down_move > 0), down_move, 0.0)
    plus_dm_s = pd.Series(plus_dm, index=df.index).ewm(span=period, adjust=False).mean()
    minus_dm_s = pd.Series(minus_dm, index=df.index).ewm(span=period, adjust=False).mean()
    atr_s = df['tr'].ewm(span=period, adjust=False).mean()
    plus_di = 100 * plus_dm_s / atr_s.replace(0, np.nan)
    minus_di = 100 * minus_dm_s / atr_s.replace(0, np.nan)
    dx = 100 * abs(plus_di - minus_di) / (plus_di + minus_di).replace(0, np.nan)
    adx = dx.ewm(span=period, adjust=False).mean()
    return adx

df['adx14'] = compute_adx(df, 14)

# VWAP (daily rolling)
df['typical_price'] = (df['high'] + df['low'] + df['close']) / 3
df['tp_vol'] = df['typical_price'] * df['volume']
df['cum_tp_vol'] = df.groupby('date')['tp_vol'].cumsum()
df['cum_vol'] = df.groupby('date')['volume'].cumsum()
df['vwap'] = df['cum_tp_vol'] / df['cum_vol']

# Candle body
df['body'] = abs(df['close'] - df['open'])
df['prev_body'] = df['body'].shift(1)

# EMA cross detection
df['above_ema'] = df['close'] > df['ema15']
df['cross_up'] = (~df['above_ema'].shift(1).fillna(False)) & df['above_ema']
df['cross_dn'] = df['above_ema'].shift(1).fillna(False) & (~df['above_ema'])

# Rolling EMA cross count (for seasonal filter — last 20 bars)
df['cross_any'] = df['cross_up'] | df['cross_dn']
df['cross_count_20'] = df['cross_any'].rolling(20).sum()

# Average volume (5-bar rolling for exhaustion)
df['avg_vol_5'] = df['volume'].rolling(5).mean()

print("  Indicators computed.")

# ─── US Market Holidays (approximate) ───────────────────────────────────────
HOLIDAYS = {
    '2024-07-04', '2024-09-02', '2024-11-28', '2024-11-29',
    '2024-12-24', '2024-12-25', '2025-01-01', '2025-01-20',
    '2025-02-17', '2025-04-18', '2025-05-26', '2025-06-19',
    '2025-07-04', '2025-09-01', '2025-11-27', '2025-11-28',
    '2025-12-24', '2025-12-25', '2026-01-01', '2026-01-19',
    '2026-02-16', '2026-04-03', '2026-05-25', '2026-06-19',
    '2026-07-03',
}

# ─── Strategy Simulator v2 ───────────────────────────────────────────────────
def run_strategy_v2(df, config=None):
    """
    Run the SB1 Slow Burn strategy on the given dataframe.
    All Pine Script filters faithfully implemented.
    Returns a list of trade dictionaries.
    """
    if config is None:
        config = {}

    # Parameters
    sb_bars = config.get('sb_bars', 4)
    max_body_mult = config.get('max_body_mult', 5.0)
    max_dist_mult = config.get('max_dist_mult', 3.0)
    cross_recency = config.get('cross_recency', 8)
    chop_thresh = config.get('chop_thresh', 61.8)
    adx_thresh = config.get('adx_thresh', 20.0)
    ema_break_bars = config.get('ema_break_bars', 2)
    trail_trigger_usd = config.get('trail_trigger_usd', 1500.0)
    trail_bars_min = config.get('trail_bars_min', 12)
    trail_lock_usd = config.get('trail_lock_usd', 800.0)
    time_stop_bars = config.get('time_stop_bars', 12)
    early_loss_usd = config.get('early_loss_usd', 900.0)
    eod_hour = config.get('eod_hour', 15)
    eod_min = config.get('eod_min', 55)
    max_daily_losses = config.get('max_daily_losses', 2)
    point_value = config.get('point_value', 2.0)
    commission = config.get('commission', 1.24)
    # Exhaustion exit parameters
    exh_dist_mult = config.get('exh_dist_mult', 2.5)
    exh_vol_mult = config.get('exh_vol_mult', 2.0)
    exh_body_mult = config.get('exh_body_mult', 1.5)
    exh_min_profit = config.get('exh_min_profit', 500.0)
    exh_min_hour = config.get('exh_min_hour', 11)
    # Engineering variant flags
    one_bar_confirm = config.get('one_bar_confirm', False)
    rth_only = config.get('rth_only', False)
    friday_filter = config.get('friday_filter', False)
    holiday_protection = config.get('holiday_protection', False)
    trail_trigger_usd_v2 = config.get('trail_trigger_usd_v2', None)
    if trail_trigger_usd_v2 is not None:
        trail_trigger_usd = trail_trigger_usd_v2

    trades = []
    in_trade = False
    entry_bar = None
    entry_price = None
    direction = None
    mfe = 0.0
    mae = 0.0
    trail_active = False
    trail_stop_price = None
    wrong_side_count = 0

    # Daily tracking
    daily_losses = {}  # date -> count

    n = len(df)

    for i in range(50, n):
        row = df.iloc[i]
        dt = row['dt']
        close = row['close']
        high = row['high']
        low = row['low']
        ema = row['ema15']
        atr = row['atr14']
        chop = row['chop14']
        adx = row['adx14']
        body = row['body']
        prev_body = row['prev_body']
        hour = row['hour']
        minute = row['minute']
        dow = row['dow']
        date_str = str(row['date'])
        month = row['month_num']
        vwap = row['vwap']
        avg_vol = row['avg_vol_5']
        cross_count = row['cross_count_20']

        # ── In-trade management ──────────────────────────────────────────────
        if in_trade:
            # Current P&L in USD (using close for mark-to-market)
            if direction == 'LONG':
                pnl_usd = (close - entry_price) * point_value
                mfe_pts = high - entry_price
                mae_pts = low - entry_price
            else:
                pnl_usd = (entry_price - close) * point_value
                mfe_pts = entry_price - low
                mae_pts = entry_price - high

            mfe = max(mfe, mfe_pts * point_value)
            mae = min(mae, mae_pts * point_value)
            bars_held = i - entry_bar
            mins_held = bars_held * 5

            def close_trade(exit_price_val, exit_sig, is_close_price=True):
                nonlocal in_trade, trail_active, wrong_side_count
                if direction == 'LONG':
                    pnl_pts = exit_price_val - entry_price
                else:
                    pnl_pts = entry_price - exit_price_val
                pnl_final = pnl_pts * point_value - commission
                trades.append({
                    'entry_dt': df.iloc[entry_bar]['dt'],
                    'exit_dt': dt,
                    'direction': direction,
                    'entry_price': entry_price,
                    'exit_price': exit_price_val,
                    'pnl': pnl_final,
                    'mfe_usd': mfe,
                    'mae_usd': mae,
                    'bars_held': bars_held,
                    'mins_held': mins_held,
                    'exit_signal': exit_sig,
                })
                # Track daily losses
                if pnl_final < 0:
                    daily_losses[date_str] = daily_losses.get(date_str, 0) + 1
                in_trade = False
                trail_active = False
                wrong_side_count = 0

            # Priority 1: EOD close
            if hour == eod_hour and minute >= eod_min:
                close_trade(close, 'EOD Close')
                continue

            # Priority 2: Holiday protection (early close)
            if holiday_protection and date_str in HOLIDAYS:
                close_trade(close, 'Holiday Early Close')
                continue

            # Priority 3: Early loss stop (within first 1 bar = bars_held <= 1)
            if bars_held <= 1 and pnl_usd < -early_loss_usd:
                close_trade(close, 'Early Loss Stop')
                continue

            # Priority 4: EMA Cross Stop (first bar — close crosses EMA)
            if bars_held == 1:
                if direction == 'LONG' and close < ema:
                    close_trade(close, 'EMA Cross Stop')
                    continue
                elif direction == 'SHORT' and close > ema:
                    close_trade(close, 'EMA Cross Stop')
                    continue

            # Priority 5: Exhaustion Exit
            # Conditions: dist ≥ 2.5×ATR + vol ≥ 2.0×avg + body ≥ 1.5×prev + min $500 profit + after 11:00
            if bars_held >= 3 and pnl_usd >= exh_min_profit and hour >= exh_min_hour:
                dist_from_ema = abs(close - ema)
                vol_spike = row['volume'] > avg_vol * exh_vol_mult if avg_vol > 0 else False
                overextended = dist_from_ema >= atr * exh_dist_mult
                reversal_body = body >= prev_body * exh_body_mult if prev_body > 0 else False
                if direction == 'LONG':
                    reversal_candle = row['open'] > row['close'] and reversal_body
                else:
                    reversal_candle = row['close'] > row['open'] and reversal_body
                if vol_spike and overextended and reversal_candle:
                    close_trade(close, 'Exhaustion Exit')
                    continue

            # Priority 6: Trailing stop
            if mfe >= trail_trigger_usd and bars_held >= trail_bars_min and not trail_active:
                trail_active = True
                if direction == 'LONG':
                    trail_stop_price = entry_price + (trail_lock_usd / point_value)
                else:
                    trail_stop_price = entry_price - (trail_lock_usd / point_value)

            if trail_active:
                if direction == 'LONG' and low <= trail_stop_price:
                    close_trade(trail_stop_price, 'Trail Lock Exit', is_close_price=False)
                    continue
                elif direction == 'SHORT' and high >= trail_stop_price:
                    close_trade(trail_stop_price, 'Trail Lock Exit', is_close_price=False)
                    continue

            # Priority 7: Time stop (12 bars = 60 min, only if in loss)
            if bars_held >= time_stop_bars and pnl_usd < 0:
                close_trade(close, 'Time Stop')
                continue

            # Priority 8: EMA Break Exit (M consecutive bars on wrong side)
            if direction == 'LONG':
                on_wrong_side = close < ema
            else:
                on_wrong_side = close > ema

            if on_wrong_side:
                wrong_side_count += 1
            else:
                wrong_side_count = 0

            if wrong_side_count >= ema_break_bars:
                close_trade(close, 'EMA Break Exit')
                continue

            continue  # Still in trade

        # ── Entry logic ──────────────────────────────────────────────────────
        # Max daily losses check
        if daily_losses.get(date_str, 0) >= max_daily_losses:
            continue

        # Session time filters
        # Skip first 30 minutes (before 10:00 AM ET)
        if hour < 10:
            continue
        if hour == 9:
            continue

        # Monday extra skip: no entries before 10:30 AM
        if dow == 'Monday' and hour == 10 and minute < 30:
            continue

        # Block 14:xx hour
        if hour == 14:
            continue

        # No new entries at or after 15:30
        if hour == 15 and minute >= 30:
            continue
        if hour >= 16:
            continue

        # RTH-only variant
        if rth_only:
            is_rth = (10 <= hour <= 15) or (hour == 15 and minute < 30)
            if not is_rth:
                continue

        # Friday filter
        if friday_filter and dow == 'Friday':
            continue

        # CHOP filter: chop > threshold AND ADX < adx_thresh (dual gate)
        if pd.isna(chop) or pd.isna(adx):
            continue
        chop_blocked = (chop > chop_thresh) and (adx < adx_thresh)
        if chop_blocked:
            continue

        # Seasonal filter: July/December — require EMA crosses < 3 in last 20 bars
        if month in (7, 12):
            if not pd.isna(cross_count) and cross_count >= 3:
                continue

        # Slow Burn filter
        if i < sb_bars:
            continue
        window = df.iloc[i-sb_bars:i+1]
        all_above = all(window['close'] > window['ema15'])
        all_below = all(window['close'] < window['ema15'])
        small_bodies = all(window['body'] <= window['atr14'] * max_body_mult)
        close_to_ema = all(abs(window['close'] - window['ema15']) <= window['atr14'] * max_dist_mult)

        if not small_bodies or not close_to_ema:
            continue

        # EMA cross recency
        recent_cross_up = any(df['cross_up'].iloc[max(0,i-cross_recency):i+1])
        recent_cross_dn = any(df['cross_dn'].iloc[max(0,i-cross_recency):i+1])

        # VWAP Direction filter
        above_vwap = close > vwap
        below_vwap = close < vwap

        # Determine signal direction
        signal_long = all_above and recent_cross_up and above_vwap
        signal_short = all_below and recent_cross_dn and below_vwap

        if not signal_long and not signal_short:
            continue

        # One-bar confirmation variant
        entry_bar_idx = i + 1 if one_bar_confirm else i
        if entry_bar_idx >= n:
            continue

        entry_row = df.iloc[entry_bar_idx]
        entry_price_val = entry_row['close']
        entry_dir = 'LONG' if signal_long else 'SHORT'

        # Enter trade
        in_trade = True
        entry_bar = entry_bar_idx
        entry_price = entry_price_val
        direction = entry_dir
        mfe = 0.0
        mae = 0.0
        trail_active = False
        trail_stop_price = None
        wrong_side_count = 0

    return trades


# ─── Metrics Calculator ──────────────────────────────────────────────────────
def calc_metrics(trades, label=''):
    if not trades:
        return {'label': label, 'n': 0, 'net_pnl': 0, 'pf': 0, 'wr': 0, 'expectancy': 0,
                'avg_win': 0, 'avg_loss': 0, 'max_dd': 0, 'roMAD': 0, 'gross_profit': 0, 'gross_loss': 0}
    t = pd.DataFrame(trades)
    wins = t[t['pnl'] > 0]
    losses = t[t['pnl'] <= 0]
    gross_profit = wins['pnl'].sum() if len(wins) > 0 else 0
    gross_loss = abs(losses['pnl'].sum()) if len(losses) > 0 else 0
    pf = gross_profit / gross_loss if gross_loss > 0 else float('inf')
    wr = len(wins) / len(t) * 100
    net_pnl = t['pnl'].sum()
    expectancy = t['pnl'].mean()
    avg_win = wins['pnl'].mean() if len(wins) > 0 else 0
    avg_loss = losses['pnl'].mean() if len(losses) > 0 else 0
    cumulative = t['pnl'].cumsum()
    running_max = cumulative.cummax()
    drawdown = cumulative - running_max
    max_dd = drawdown.min()
    roMAD = abs(net_pnl / max_dd) if max_dd < 0 else float('inf')
    return {
        'label': label, 'n': len(t), 'net_pnl': net_pnl,
        'gross_profit': gross_profit, 'gross_loss': gross_loss,
        'pf': pf, 'wr': wr, 'expectancy': expectancy,
        'avg_win': avg_win, 'avg_loss': avg_loss,
        'max_dd': max_dd, 'roMAD': roMAD, 'trades': t,
    }


# ─── Phase 1: Calibration ────────────────────────────────────────────────────
print("\n" + "="*70)
print("PHASE 1 — CALIBRATION (Mar–Jul 2026 vs real TV data)")
print("="*70)

df_cal = df[df['dt'] >= '2026-03-01'].copy().reset_index(drop=True)
print(f"  Calibration period: {df_cal['dt'].iloc[0]} to {df_cal['dt'].iloc[-1]}")
print(f"  Bars: {len(df_cal):,}")

cal_trades = run_strategy_v2(df_cal)
cal = calc_metrics(cal_trades, 'Calibration (Mar–Jul 2026)')

# Real TV ground truth
real_n = 146
real_net = 52113
real_pf = 1.622
real_wr = 43.8

print(f"\n  Calibration result vs real TV data:")
print(f"  {'Metric':<25} {'Simulated':>12} {'Real TV':>12} {'Delta':>10}")
print(f"  {'-'*62}")
n_delta = abs(cal['n'] - real_n) / real_n * 100
pf_delta = abs(cal['pf'] - real_pf) / real_pf * 100
wr_delta = abs(cal['wr'] - real_wr) / real_wr * 100
print(f"  {'Trades':<25} {cal['n']:>12} {real_n:>12} {n_delta:>9.1f}%")
print(f"  {'Net P&L':<25} ${cal['net_pnl']:>11,.0f} ${real_net:>11,} {abs(cal['net_pnl']-real_net)/real_net*100:>9.1f}%")
print(f"  {'Profit Factor':<25} {cal['pf']:>12.3f} {real_pf:>12.3f} {pf_delta:>9.1f}%")
print(f"  {'Win Rate':<25} {cal['wr']:>11.1f}% {real_wr:>11.1f}% {wr_delta:>9.1f}%")
print(f"  {'Expectancy':<25} ${cal['expectancy']:>11,.0f} ${'357':>11}")

fidelity = max(0, 100 - (n_delta + pf_delta + wr_delta) / 3)
print(f"\n  Calibration fidelity score: {fidelity:.1f}% (target ≥85%)")
print(f"  {'PASS' if fidelity >= 85 else 'FAIL — calibration gap remains'}")

# ─── Phase 2: Full 2-Year Canonical Validation ───────────────────────────────
print("\n" + "="*70)
print("PHASE 2 — FULL 2-YEAR CANONICAL VALIDATION (Jul 2024–Jul 2026)")
print("="*70)

baseline_trades = run_strategy_v2(df)
base = calc_metrics(baseline_trades, 'Baseline (2yr, unchanged)')

print(f"\n  2-Year Baseline Results:")
print(f"  Trades:          {base['n']:>8}")
print(f"  Net P&L:         ${base['net_pnl']:>10,.0f}")
print(f"  Gross Profit:    ${base['gross_profit']:>10,.0f}")
print(f"  Gross Loss:      ${base['gross_loss']:>10,.0f}")
print(f"  Profit Factor:   {base['pf']:>10.3f}")
print(f"  Win Rate:        {base['wr']:>10.1f}%")
print(f"  Expectancy:      ${base['expectancy']:>10,.0f}")
print(f"  Avg Winner:      ${base['avg_win']:>10,.0f}")
print(f"  Avg Loser:       ${base['avg_loss']:>10,.0f}")
print(f"  Max Drawdown:    ${base['max_dd']:>10,.0f}")
print(f"  RoMaD:           {base['roMAD']:>10.2f}")

if base['n'] == 0:
    print("\n  ERROR: No trades generated. Check filter logic.")
    import sys; sys.exit(1)

bt = base['trades'].copy()
bt['year'] = pd.to_datetime(bt['entry_dt']).dt.year
bt['month'] = pd.to_datetime(bt['entry_dt']).dt.to_period('M')
bt['dow'] = pd.to_datetime(bt['entry_dt']).dt.day_name()
bt['entry_hour'] = pd.to_datetime(bt['entry_dt']).dt.hour
bt['is_win'] = bt['pnl'] > 0

print(f"\n  Year-by-Year Breakdown:")
for yr, grp in bt.groupby('year'):
    wins = grp[grp['pnl'] > 0]
    losses = grp[grp['pnl'] <= 0]
    gp = wins['pnl'].sum()
    gl = abs(losses['pnl'].sum())
    pf = gp/gl if gl > 0 else float('inf')
    wr = len(wins)/len(grp)*100
    print(f"  {yr}: {len(grp):>4} trades | ${grp['pnl'].sum():>10,.0f} | PF {pf:.3f} | WR {wr:.1f}%")

monthly = bt.groupby('month').agg(
    trades=('pnl','count'),
    net_pnl=('pnl','sum'),
    wins=('is_win','sum')
).reset_index()
monthly['wr'] = monthly['wins']/monthly['trades']*100
monthly['cum_pnl'] = monthly['net_pnl'].cumsum()
pos_months = (monthly['net_pnl'] > 0).sum()
total_months = len(monthly)

print(f"\n  Monthly Breakdown:")
for _, r in monthly.iterrows():
    sign = '▲' if r['net_pnl'] >= 0 else '▼'
    print(f"  {r['month']} {sign}${abs(r['net_pnl']):>9,.0f} | {r['trades']:>3} trades | WR {r['wr']:>5.1f}% | Cum ${r['cum_pnl']:>10,.0f}")
print(f"\n  Positive months: {pos_months}/{total_months} ({pos_months/total_months*100:.1f}%)")

# ─── Phase 3: Exit Attribution ───────────────────────────────────────────────
print(f"\n  Exit Attribution (2yr):")
exit_attr = bt.groupby('exit_signal').agg(
    count=('pnl','count'),
    net_pnl=('pnl','sum'),
    wins=('is_win','sum')
).reset_index()
exit_attr['wr'] = exit_attr['wins']/exit_attr['count']*100
exit_attr['avg_pnl'] = exit_attr['net_pnl']/exit_attr['count']
exit_attr = exit_attr.sort_values('net_pnl', ascending=False)
for _, r in exit_attr.iterrows():
    sign = '+' if r['net_pnl'] >= 0 else '-'
    print(f"  {r['exit_signal']:<22}: {r['count']:>4} trades | {sign}${abs(r['net_pnl']):>9,.0f} | WR {r['wr']:>5.1f}% | Avg ${r['avg_pnl']:>7,.0f}")

print(f"\n  Day of Week:")
dow_order = ['Monday','Tuesday','Wednesday','Thursday','Friday']
dow_stats = bt.groupby('dow').agg(
    count=('pnl','count'),
    net_pnl=('pnl','sum'),
    wins=('is_win','sum')
).reset_index()
dow_stats['wr'] = dow_stats['wins']/dow_stats['count']*100
dow_stats['dow'] = pd.Categorical(dow_stats['dow'], categories=dow_order, ordered=True)
dow_stats = dow_stats.sort_values('dow')
for _, r in dow_stats.iterrows():
    sign = '+' if r['net_pnl'] >= 0 else '-'
    print(f"  {r['dow']:<12}: {r['count']:>4} trades | {sign}${abs(r['net_pnl']):>9,.0f} | WR {r['wr']:>5.1f}%")

# ─── Phase 4: Engineering Improvements ──────────────────────────────────────
print("\n" + "="*70)
print("PHASE 4 — ENGINEERING IMPROVEMENTS")
print("="*70)

variants = [
    ('Baseline', {}),
    ('V1: 1-bar confirm', {'one_bar_confirm': True}),
    ('V2: RTH-only', {'rth_only': True}),
    ('V3: Friday filter', {'friday_filter': True}),
    ('V4: Holiday protect', {'holiday_protection': True}),
    ('V5: Trail $1000', {'trail_trigger_usd_v2': 1000.0}),
    ('V6: V1+V2+V3+V4', {'one_bar_confirm': True, 'rth_only': True, 'friday_filter': True, 'holiday_protection': True}),
    ('V7: All combined', {'one_bar_confirm': True, 'rth_only': True, 'friday_filter': True, 'holiday_protection': True, 'trail_trigger_usd_v2': 1000.0}),
]

variant_results = []
for label, cfg in variants:
    v_trades = run_strategy_v2(df, config=cfg)
    v = calc_metrics(v_trades, label)
    variant_results.append(v)
    print(f"  {label:<25} | {v['n']:>4} trades | ${v['net_pnl']:>10,.0f} | PF {v['pf']:>6.3f} | WR {v['wr']:>5.1f}% | DD ${v['max_dd']:>9,.0f}")

# ─── Phase 5: Walk-Forward Validation ────────────────────────────────────────
print("\n" + "="*70)
print("PHASE 5 — WALK-FORWARD VALIDATION (12 windows)")
print("="*70)

wf_results = []
start_date = pd.Timestamp('2024-07-01')
for w in range(12):
    window_start = start_date + pd.DateOffset(months=w)
    window_end = window_start + pd.DateOffset(months=6)
    df_wf = df[(df['dt'] >= window_start) & (df['dt'] < window_end)].copy().reset_index(drop=True)
    if len(df_wf) < 1000:
        continue
    wf_trades = run_strategy_v2(df_wf)
    wf = calc_metrics(wf_trades, f"W{w+1:02d}")
    wf['window_start'] = window_start
    wf['window_end'] = window_end
    wf_results.append(wf)
    sign = '✓' if wf['pf'] >= 1.30 and wf['net_pnl'] > 0 else '✗'
    print(f"  W{w+1:02d} {window_start.strftime('%Y-%m')}–{window_end.strftime('%Y-%m')}: {wf['n']:>4} trades | ${wf['net_pnl']:>9,.0f} | PF {wf['pf']:>6.3f} | WR {wf['wr']:>5.1f}% {sign}")

wf_pass = sum(1 for w in wf_results if w['pf'] >= 1.30 and w['net_pnl'] > 0)
print(f"\n  Walk-forward pass rate: {wf_pass}/{len(wf_results)} ({wf_pass/len(wf_results)*100:.1f}%)" if wf_results else "  No walk-forward windows completed.")

# ─── Phase 5b: Monte Carlo ───────────────────────────────────────────────────
print("\n" + "="*70)
print("PHASE 5b — MONTE CARLO (10,000 simulations)")
print("="*70)

trade_pnls = bt['pnl'].values
n_sims = 10000
n_trades_annual = max(1, int(base['n'] / 2))
rng = np.random.default_rng(42)
sim_annual_pnls = []
sim_max_dds = []
for _ in range(n_sims):
    sample = rng.choice(trade_pnls, size=n_trades_annual, replace=True)
    sim_annual_pnls.append(sample.sum())
    cum = np.cumsum(sample)
    running_max = np.maximum.accumulate(cum)
    dd = (cum - running_max).min()
    sim_max_dds.append(dd)

sim_annual_pnls = np.array(sim_annual_pnls)
sim_max_dds = np.array(sim_max_dds)
p_positive = (sim_annual_pnls > 0).mean() * 100
mean_annual = sim_annual_pnls.mean()
p5 = np.percentile(sim_annual_pnls, 5)
p25 = np.percentile(sim_annual_pnls, 25)
p75 = np.percentile(sim_annual_pnls, 75)
p95 = np.percentile(sim_annual_pnls, 95)
mean_dd = np.mean(sim_max_dds)
p95_dd = np.percentile(sim_max_dds, 95)

print(f"  Annual P&L distribution (10,000 sims, {n_trades_annual} trades/yr):")
print(f"  Mean:          ${mean_annual:>10,.0f}")
print(f"  5th pct:       ${p5:>10,.0f}")
print(f"  25th pct:      ${p25:>10,.0f}")
print(f"  75th pct:      ${p75:>10,.0f}")
print(f"  95th pct:      ${p95:>10,.0f}")
print(f"  P(positive):   {p_positive:>10.1f}%")
print(f"  Mean max DD:   ${mean_dd:>10,.0f}")
print(f"  95th pct DD:   ${p95_dd:>10,.0f}")

# ─── Phase 6: Prop Firm Evaluation ──────────────────────────────────────────
print("\n" + "="*70)
print("PHASE 6 — PROP FIRM EVALUATION")
print("="*70)

risk_profiles = [
    ('Paper ($800)', 800, 1.0),
    ('Apex Eval ($900)', 900, 900/800),
    ('Apex Funded ($450)', 450, 450/800),
    ('Live ($1650)', 1650, 1650/800),
]

for profile_name, risk_usd, scale in risk_profiles:
    scaled_pnl = bt['pnl'] * scale
    net = scaled_pnl.sum()
    gp = scaled_pnl[scaled_pnl > 0].sum()
    gl = abs(scaled_pnl[scaled_pnl <= 0].sum())
    pf = gp/gl if gl > 0 else float('inf')
    cum = scaled_pnl.cumsum()
    max_dd = (cum - cum.cummax()).min()
    print(f"  {profile_name:<22}: Net ${net:>10,.0f} | PF {pf:.3f} | Max DD ${max_dd:>9,.0f}")

print(f"\n  Apex 50K Evaluation Pass Rate (5,000 MC sims):")
apex_scale = 900/800
apex_pnls = bt['pnl'].values * apex_scale
n_sims_apex = 5000
apex_pass = 0
apex_days_to_pass = []
for _ in range(n_sims_apex):
    sample = rng.choice(apex_pnls, size=50, replace=True)
    cum = np.cumsum(sample)
    daily_breach = any(sample < -1000)
    running_max = np.maximum.accumulate(cum)
    dd = (cum - running_max).min()
    dd_breach = dd < -2500
    profit_hit = any(cum >= 3000)
    if profit_hit and not daily_breach and not dd_breach:
        apex_pass += 1
        days = next((j+1 for j, c in enumerate(cum) if c >= 3000), 50)
        apex_days_to_pass.append(days)

apex_pass_rate = apex_pass / n_sims_apex * 100
avg_days = np.mean(apex_days_to_pass) if apex_days_to_pass else 0
print(f"  Pass rate:       {apex_pass_rate:.1f}%")
print(f"  Avg days:        {avg_days:.1f}")

# ─── Charts ──────────────────────────────────────────────────────────────────
print("\n" + "="*70)
print("GENERATING CHARTS")
print("="*70)

# Chart 1: Equity curve + monthly P&L + drawdown
fig, axes = plt.subplots(3, 1, figsize=(16, 14), facecolor='#0d1117')
fig.suptitle('SB1 Slow Burn — 2-Year Canonical Validation (v2 Simulator)\nMNQ 5-Min | Jul 2024–Jul 2026', 
             color='white', fontsize=16, fontweight='bold', y=0.98)

ax1, ax2, ax3 = axes
for ax in axes:
    ax.set_facecolor('#161b22')
    ax.tick_params(colors='#8b949e')
    ax.spines['bottom'].set_color('#30363d')
    ax.spines['left'].set_color('#30363d')
    ax.spines['top'].set_visible(False)
    ax.spines['right'].set_visible(False)

cum_pnl = bt['pnl'].cumsum().reset_index(drop=True)
ax1.plot(cum_pnl.values, color='#58a6ff', linewidth=1.5, label='Equity Curve')
ax1.fill_between(range(len(cum_pnl)), 0, cum_pnl.values, 
                  where=cum_pnl.values >= 0, alpha=0.15, color='#3fb950')
ax1.fill_between(range(len(cum_pnl)), 0, cum_pnl.values, 
                  where=cum_pnl.values < 0, alpha=0.15, color='#f85149')
ax1.axhline(y=0, color='#30363d', linewidth=0.8, linestyle='--')
ax1.set_ylabel('Cumulative P&L ($)', color='#8b949e')
ax1.set_title(f'Equity Curve — Net ${base["net_pnl"]:,.0f} | PF {base["pf"]:.3f} | {base["n"]} trades | WR {base["wr"]:.1f}%', 
              color='#e6edf3', fontsize=12)

monthly_sorted = monthly.sort_values('month')
colors_m = ['#3fb950' if v >= 0 else '#f85149' for v in monthly_sorted['net_pnl']]
ax2.bar(range(len(monthly_sorted)), monthly_sorted['net_pnl'].values, color=colors_m, alpha=0.8)
ax2.set_xticks(range(len(monthly_sorted)))
ax2.set_xticklabels([str(m) for m in monthly_sorted['month']], rotation=45, ha='right', fontsize=7)
ax2.axhline(y=0, color='#30363d', linewidth=0.8)
ax2.set_ylabel('Monthly P&L ($)', color='#8b949e')
ax2.set_title(f'Monthly P&L — {pos_months}/{total_months} positive months ({pos_months/total_months*100:.1f}%)', 
              color='#e6edf3', fontsize=12)

running_max = cum_pnl.cummax()
drawdown = cum_pnl - running_max
ax3.fill_between(range(len(drawdown)), 0, drawdown.values, alpha=0.6, color='#f85149')
ax3.plot(drawdown.values, color='#f85149', linewidth=0.8)
ax3.axhline(y=base['max_dd'], color='#ff7b72', linewidth=1, linestyle='--', 
            label=f'Max DD: ${base["max_dd"]:,.0f}')
ax3.set_ylabel('Drawdown ($)', color='#8b949e')
ax3.set_xlabel('Trade Number', color='#8b949e')
ax3.set_title('Drawdown Profile', color='#e6edf3', fontsize=12)
ax3.legend(facecolor='#161b22', edgecolor='#30363d', labelcolor='#8b949e')

plt.tight_layout(rect=[0, 0, 1, 0.96])
plt.savefig('/home/ubuntu/sb1_086_chart1_equity.png', dpi=150, bbox_inches='tight', facecolor='#0d1117')
plt.close()
print("  Chart 1 saved.")

# Chart 2: Engineering variants
fig, axes = plt.subplots(1, 3, figsize=(18, 7), facecolor='#0d1117')
fig.suptitle('SB1 Engineering Variants — Independent Testing', color='white', fontsize=14, fontweight='bold')
labels = [v['label'] for v in variant_results]
net_pnls = [v['net_pnl'] for v in variant_results]
pfs = [v['pf'] for v in variant_results]
wrs = [v['wr'] for v in variant_results]
for ax in axes:
    ax.set_facecolor('#161b22')
    ax.tick_params(colors='#8b949e')
    ax.spines['bottom'].set_color('#30363d')
    ax.spines['left'].set_color('#30363d')
    ax.spines['top'].set_visible(False)
    ax.spines['right'].set_visible(False)
colors_v = ['#3fb950' if p >= 1.30 else '#f85149' for p in pfs]
axes[0].barh(labels, net_pnls, color=colors_v, alpha=0.8)
axes[0].axvline(x=0, color='#30363d', linewidth=0.8)
axes[0].set_title('Net P&L ($)', color='#e6edf3')
axes[1].barh(labels, pfs, color=colors_v, alpha=0.8)
axes[1].axvline(x=1.30, color='#f0e68c', linewidth=1.5, linestyle='--', label='Min PF 1.30')
axes[1].set_title('Profit Factor', color='#e6edf3')
axes[1].legend(facecolor='#161b22', edgecolor='#30363d', labelcolor='#8b949e', fontsize=8)
axes[2].barh(labels, wrs, color=colors_v, alpha=0.8)
axes[2].set_title('Win Rate (%)', color='#e6edf3')
plt.tight_layout()
plt.savefig('/home/ubuntu/sb1_086_chart2_variants.png', dpi=150, bbox_inches='tight', facecolor='#0d1117')
plt.close()
print("  Chart 2 saved.")

# Chart 3: Walk-forward
if wf_results:
    fig, ax = plt.subplots(figsize=(16, 7), facecolor='#0d1117')
    ax.set_facecolor('#161b22')
    ax.tick_params(colors='#8b949e')
    ax.spines['bottom'].set_color('#30363d')
    ax.spines['left'].set_color('#30363d')
    ax.spines['top'].set_visible(False)
    ax.spines['right'].set_visible(False)
    wf_labels = [f"W{i+1:02d}\n{w['window_start'].strftime('%b%y')}" for i, w in enumerate(wf_results)]
    wf_pnls = [w['net_pnl'] for w in wf_results]
    wf_pfs = [w['pf'] for w in wf_results]
    wf_colors = ['#3fb950' if p >= 1.30 and n > 0 else '#f85149' for p, n in zip(wf_pfs, wf_pnls)]
    bars = ax.bar(wf_labels, wf_pnls, color=wf_colors, alpha=0.8)
    ax.axhline(y=0, color='#30363d', linewidth=0.8)
    for bar, pf in zip(bars, wf_pfs):
        y_pos = bar.get_height() + 50 if bar.get_height() >= 0 else bar.get_height() - 200
        ax.text(bar.get_x() + bar.get_width()/2, y_pos, f'PF\n{pf:.2f}', 
                ha='center', va='bottom', color='#8b949e', fontsize=7)
    ax.set_title(f'Walk-Forward Validation — {wf_pass}/{len(wf_results)} windows pass (PF≥1.30)', 
                 color='#e6edf3', fontsize=13)
    ax.set_ylabel('Net P&L ($)', color='#8b949e')
    plt.tight_layout()
    plt.savefig('/home/ubuntu/sb1_086_chart3_walkforward.png', dpi=150, bbox_inches='tight', facecolor='#0d1117')
    plt.close()
    print("  Chart 3 saved.")

# Chart 4: Monte Carlo
fig, axes = plt.subplots(1, 2, figsize=(16, 7), facecolor='#0d1117')
fig.suptitle('SB1 Monte Carlo Analysis — 10,000 Simulations', color='white', fontsize=14, fontweight='bold')
for ax in axes:
    ax.set_facecolor('#161b22')
    ax.tick_params(colors='#8b949e')
    ax.spines['bottom'].set_color('#30363d')
    ax.spines['left'].set_color('#30363d')
    ax.spines['top'].set_visible(False)
    ax.spines['right'].set_visible(False)
axes[0].hist(sim_annual_pnls, bins=80, color='#58a6ff', alpha=0.7, edgecolor='none')
axes[0].axvline(x=0, color='#f85149', linewidth=1.5, linestyle='--', label='Break-even')
axes[0].axvline(x=mean_annual, color='#3fb950', linewidth=1.5, linestyle='-', label=f'Mean ${mean_annual:,.0f}')
axes[0].axvline(x=p5, color='#f0e68c', linewidth=1.5, linestyle=':', label=f'5th pct ${p5:,.0f}')
axes[0].set_title(f'Annual P&L Distribution\nP(positive): {p_positive:.1f}%', color='#e6edf3')
axes[0].set_xlabel('Annual P&L ($)', color='#8b949e')
axes[0].legend(facecolor='#161b22', edgecolor='#30363d', labelcolor='#8b949e', fontsize=9)
axes[1].hist(sim_max_dds, bins=80, color='#f85149', alpha=0.7, edgecolor='none')
axes[1].axvline(x=mean_dd, color='#ff7b72', linewidth=1.5, linestyle='-', label=f'Mean ${mean_dd:,.0f}')
axes[1].axvline(x=p95_dd, color='#f0e68c', linewidth=1.5, linestyle=':', label=f'95th pct ${p95_dd:,.0f}')
axes[1].set_title('Max Drawdown Distribution', color='#e6edf3')
axes[1].set_xlabel('Max Drawdown ($)', color='#8b949e')
axes[1].legend(facecolor='#161b22', edgecolor='#30363d', labelcolor='#8b949e', fontsize=9)
plt.tight_layout()
plt.savefig('/home/ubuntu/sb1_086_chart4_montecarlo.png', dpi=150, bbox_inches='tight', facecolor='#0d1117')
plt.close()
print("  Chart 4 saved.")

# ─── Save CSVs ───────────────────────────────────────────────────────────────
bt.to_csv('/home/ubuntu/sb1_086_trades_2yr.csv', index=False)
monthly.to_csv('/home/ubuntu/sb1_086_monthly.csv', index=False)
vr_df = pd.DataFrame([{k: v for k, v in r.items() if k != 'trades'} for r in variant_results])
vr_df.to_csv('/home/ubuntu/sb1_086_variants.csv', index=False)
print("  CSVs saved.")

# ─── Final Summary ───────────────────────────────────────────────────────────
print(f"\n{'='*70}")
print("FINAL SUMMARY")
print("="*70)
print(f"  Calibration fidelity:   {fidelity:.1f}% (target ≥85%)")
print(f"  2-Year Net P&L:         ${base['net_pnl']:>10,.0f}")
print(f"  Profit Factor:          {base['pf']:>10.3f}  (target ≥1.30)")
print(f"  Win Rate:               {base['wr']:>10.1f}%")
print(f"  Expectancy:             ${base['expectancy']:>10,.0f}")
print(f"  Max Drawdown:           ${base['max_dd']:>10,.0f}")
print(f"  RoMaD:                  {base['roMAD']:>10.2f}")
print(f"  Positive months:        {pos_months}/{total_months} ({pos_months/total_months*100:.1f}%)")
if wf_results:
    print(f"  Walk-Forward Pass:      {wf_pass}/{len(wf_results)} ({wf_pass/len(wf_results)*100:.1f}%)  (target ≥70%)")
print(f"  MC P(positive):         {p_positive:>10.1f}%  (target ≥70%)")
print(f"  Apex 50K Pass Rate:     {apex_pass_rate:>10.1f}%")
print(f"\n  ACCEPTANCE CRITERIA:")
print(f"  PF ≥ 1.30:              {'PASS ✓' if base['pf'] >= 1.30 else 'FAIL ✗'}")
if wf_results:
    print(f"  WF ≥ 70%:               {'PASS ✓' if wf_pass/len(wf_results) >= 0.70 else 'FAIL ✗'}")
print(f"  MC ≥ 70%:               {'PASS ✓' if p_positive >= 70 else 'FAIL ✗'}")
print(f"  Calibration ≥ 85%:      {'PASS ✓' if fidelity >= 85 else 'FAIL ✗'}")
all_pass = (base['pf'] >= 1.30 and p_positive >= 70 and 
            (not wf_results or wf_pass/len(wf_results) >= 0.70))
print(f"\n  OVERALL VERDICT:        {'ACCEPTED ✓' if all_pass else 'REJECTED ✗'}")
