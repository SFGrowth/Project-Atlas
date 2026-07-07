"""
Atlas Research Engine — Sprint 023
Interaction Effects: Structural Components × Trigger Components
Stream B — Execution Intelligence

Hypotheses:
  H-B006: Liquidity Sweep + High Tradeability Regime
  H-B007: Pullback Continuation + Volatility Expansion
  H-B008: Mean Reversion + Low Trend Strength
  H-B009: Breakout Continuation + Volatility Compression

Design:
  Each hypothesis is tested as a controlled A/B experiment:
    Experiment A — Trigger unconditional (baseline, re-verifying Sprint 021)
    Experiment B — Trigger restricted to the structural condition
  The interaction effect is the measured difference in PF and drawdown between A and B.

  All tests run on:
    - Full 2-year dataset (Jul 2024 – Jul 2026)
    - Year 1 sub-period (Jul 2024 – Jul 2025)
    - Year 2 sub-period (Jul 2025 – Jul 2026)

  All 12 Atlas robustness metrics reported for every result.
  Minimum 100 trades required for any result to be statistically valid.
"""

import pandas as pd
import numpy as np
from pathlib import Path

# ─────────────────────────────────────────────
# CONSTANTS
# ─────────────────────────────────────────────
DATA_PATH = Path("/home/ubuntu/Project-Atlas/data/raw/massive/MNQ_5min_full.csv")
MNQ_POINT_VALUE = 2.0      # $2.00 per point per MNQ contract
COMMISSION = 1.00          # $1.00 round-trip per contract
STOP_ATR_MULT = 1.0        # Stop = 1.0 × ATR(14) intraday
TARGET_RR = 2.0            # Take Profit = 2.0 × Stop (1:2 R:R)
MIN_TRADES = 100
PF_THRESHOLD = 1.20
MAX_DD_LIMIT = -2000.0

# ─────────────────────────────────────────────
# DATA LOADING & FEATURE ENGINEERING
# ─────────────────────────────────────────────

def load_and_prepare():
    df = pd.read_csv(DATA_PATH)
    df['ts'] = pd.to_datetime(df['timestamp_et'], utc=True)
    df = df.sort_values('ts').reset_index(drop=True)
    df['date'] = df['ts'].dt.date
    df['hour'] = df['ts'].dt.hour
    df['minute'] = df['ts'].dt.minute

    # RTH filter: 9:30–15:55 ET
    df['is_rth'] = (
        ((df['hour'] == 9) & (df['minute'] >= 30)) |
        ((df['hour'] >= 10) & (df['hour'] <= 15))
    )

    # ── Intraday ATR(14) ──
    df['prev_close'] = df['close'].shift(1)
    df['tr'] = np.maximum(
        df['high'] - df['low'],
        np.maximum(
            (df['high'] - df['prev_close']).abs(),
            (df['low'] - df['prev_close']).abs()
        )
    )
    df['atr14'] = df['tr'].rolling(14, min_periods=1).mean()

    # ── Intraday VWAP (reset each RTH session) ──
    df['tp'] = (df['high'] + df['low'] + df['close']) / 3
    df['cum_tp_vol'] = 0.0
    df['cum_vol'] = 0.0
    # Vectorised VWAP per session
    session_id = (df['is_rth'] & ~df['is_rth'].shift(1, fill_value=False)).cumsum()
    df['session_id'] = session_id
    df['cum_tp_vol'] = df.groupby('session_id').apply(
        lambda g: (g['tp'] * g['volume']).cumsum()
    ).reset_index(level=0, drop=True)
    df['cum_vol'] = df.groupby('session_id')['volume'].cumsum()
    df['vwap'] = df['cum_tp_vol'] / df['cum_vol'].replace(0, np.nan)

    # ── Relative Volume (vs 20-bar rolling mean) ──
    df['vol_ma20'] = df['volume'].rolling(20, min_periods=1).mean()
    df['rel_vol'] = df['volume'] / df['vol_ma20'].replace(0, np.nan)

    # ── ATR Ratio: short-term vs long-term (for compression/expansion) ──
    df['atr5'] = df['tr'].rolling(5, min_periods=1).mean()
    df['atr50'] = df['tr'].rolling(50, min_periods=1).mean()
    df['atr_ratio_5_50'] = df['atr5'] / df['atr50'].replace(0, np.nan)

    # ── EMA stack for trend direction and strength ──
    df['ema9']  = df['close'].ewm(span=9,  adjust=False).mean()
    df['ema21'] = df['close'].ewm(span=21, adjust=False).mean()
    df['ema50'] = df['close'].ewm(span=50, adjust=False).mean()

    # EMA slope (5-bar change normalised by ATR)
    df['ema21_slope'] = (df['ema21'] - df['ema21'].shift(5)) / df['atr14'].replace(0, np.nan)

    # ── Swing High / Low detection (5-bar pivot) ──
    n = 5
    df['swing_high'] = (
        (df['high'] == df['high'].rolling(2*n+1, center=True).max()) &
        df['is_rth']
    )
    df['swing_low'] = (
        (df['low'] == df['low'].rolling(2*n+1, center=True).min()) &
        df['is_rth']
    )

    return df


# ─────────────────────────────────────────────
# STRUCTURAL CONDITION DEFINITIONS
# ─────────────────────────────────────────────

def cond_high_tradeability(row):
    """
    High Tradeability: relative volume > 1.5 AND ATR expansion (atr5 > atr50).
    Represents a bar where the market is actively moving with above-average participation.
    """
    return (
        pd.notna(row['rel_vol']) and row['rel_vol'] > 1.5 and
        pd.notna(row['atr_ratio_5_50']) and row['atr_ratio_5_50'] > 1.0
    )


def cond_volatility_expansion(df, i, lookback=10):
    """
    Volatility Expansion: current ATR(5) is significantly higher than it was
    lookback bars ago. Represents a burst of directional energy.
    """
    if i < lookback:
        return False
    current = df.loc[i, 'atr5']
    prior   = df.loc[i - lookback, 'atr5']
    if pd.isna(current) or pd.isna(prior) or prior == 0:
        return False
    return current / prior > 1.4   # 40% ATR expansion over last 10 bars


def cond_low_trend_strength(row):
    """
    Low Trend Strength: EMA21 slope is flat (near zero) and price is between
    EMA9 and EMA50 (no clear directional stack). Represents a choppy/ranging environment.
    """
    return (
        pd.notna(row['ema21_slope']) and abs(row['ema21_slope']) < 0.3 and
        pd.notna(row['ema9']) and pd.notna(row['ema50']) and
        min(row['ema9'], row['ema50']) <= row['close'] <= max(row['ema9'], row['ema50'])
    )


def cond_volatility_compression(row):
    """
    Volatility Compression: ATR(5) / ATR(50) < 0.85.
    Represents a period of tightening range before a potential expansion.
    """
    return (
        pd.notna(row['atr_ratio_5_50']) and row['atr_ratio_5_50'] < 0.85
    )


# ─────────────────────────────────────────────
# TRIGGER DEFINITIONS
# ─────────────────────────────────────────────

def trigger_liquidity_sweep(df, i):
    """
    Liquidity Sweep: price breaks below a recent swing low (stop hunt) then
    closes back above it within the same bar — or breaks above a swing high
    then closes back below it.
    Direction: Long after a downward sweep (price swept lows and recovered).
               Short after an upward sweep (price swept highs and rejected).
    """
    if i < 10:
        return None

    bar = df.loc[i]
    # Look for recent swing lows in the prior 20 bars
    lookback = df.loc[max(0, i-20):i-1]
    if lookback.empty:
        return None

    recent_low  = lookback['low'].min()
    recent_high = lookback['high'].max()

    # Downward sweep: bar low pierced recent swing low but closed above it → Long
    if bar['low'] < recent_low and bar['close'] > recent_low:
        return 1   # Long
    # Upward sweep: bar high pierced recent swing high but closed below it → Short
    if bar['high'] > recent_high and bar['close'] < recent_high:
        return -1  # Short
    return None


def trigger_pullback(df, i):
    """
    Pullback Continuation: price pulls back to EMA21 in a trending environment.
    Long when: EMA9 > EMA21 > EMA50 (uptrend) and close touches/crosses EMA21 from above.
    Short when: EMA9 < EMA21 < EMA50 (downtrend) and close touches/crosses EMA21 from below.
    """
    if i < 2:
        return None
    bar  = df.loc[i]
    prev = df.loc[i-1]

    if any(pd.isna([bar['ema9'], bar['ema21'], bar['ema50']])):
        return None

    # Uptrend pullback to EMA21
    if bar['ema9'] > bar['ema21'] > bar['ema50']:
        if prev['close'] > bar['ema21'] and bar['close'] <= bar['ema21'] * 1.001:
            return 1   # Long
    # Downtrend pullback to EMA21
    if bar['ema9'] < bar['ema21'] < bar['ema50']:
        if prev['close'] < bar['ema21'] and bar['close'] >= bar['ema21'] * 0.999:
            return -1  # Short
    return None


def trigger_mean_reversion(df, i):
    """
    Mean Reversion: price is significantly extended from VWAP and we fade it back.
    Long when: close is more than 1.5 ATR below VWAP.
    Short when: close is more than 1.5 ATR above VWAP.
    """
    bar = df.loc[i]
    if pd.isna(bar['vwap']) or pd.isna(bar['atr14']) or bar['atr14'] == 0:
        return None

    deviation = bar['close'] - bar['vwap']
    threshold = 1.5 * bar['atr14']

    if deviation < -threshold:
        return 1   # Long (fade the downward extension)
    if deviation > threshold:
        return -1  # Short (fade the upward extension)
    return None


def trigger_breakout(df, i):
    """
    Breakout Continuation: price breaks above a recent consolidation high
    or below a recent consolidation low with momentum.
    Long when: close > 20-bar high AND strong close (close in top 25% of bar range).
    Short when: close < 20-bar low AND strong close (close in bottom 25% of bar range).
    """
    if i < 20:
        return None
    bar = df.loc[i]
    lookback = df.loc[max(0, i-20):i-1]

    recent_high = lookback['high'].max()
    recent_low  = lookback['low'].min()
    bar_range   = bar['high'] - bar['low']

    if bar_range == 0:
        return None

    close_position = (bar['close'] - bar['low']) / bar_range

    if bar['close'] > recent_high and close_position > 0.75:
        return 1   # Long breakout
    if bar['close'] < recent_low and close_position < 0.25:
        return -1  # Short breakout
    return None


# ─────────────────────────────────────────────
# TRADE SIMULATION
# ─────────────────────────────────────────────

def simulate_trade(df, entry_idx, direction, stop_pts, target_pts):
    """Simulate a single trade from entry bar close. Returns (pnl, bars_held)."""
    entry_price  = df.loc[entry_idx, 'close']
    stop_price   = entry_price - direction * stop_pts
    target_price = entry_price + direction * target_pts

    for i in range(entry_idx + 1, min(entry_idx + 300, len(df))):
        bar = df.loc[i]
        if not bar['is_rth']:
            exit_price = df.loc[i - 1, 'close']
            pnl = direction * (exit_price - entry_price) * MNQ_POINT_VALUE - COMMISSION
            return pnl, i - entry_idx

        if direction == 1:
            if bar['low'] <= stop_price:
                return direction * (stop_price - entry_price) * MNQ_POINT_VALUE - COMMISSION, i - entry_idx
            if bar['high'] >= target_price:
                return direction * (target_price - entry_price) * MNQ_POINT_VALUE - COMMISSION, i - entry_idx
        else:
            if bar['high'] >= stop_price:
                return direction * (stop_price - entry_price) * MNQ_POINT_VALUE - COMMISSION, i - entry_idx
            if bar['low'] <= target_price:
                return direction * (target_price - entry_price) * MNQ_POINT_VALUE - COMMISSION, i - entry_idx

    exit_price = df.loc[min(entry_idx + 299, len(df) - 1), 'close']
    pnl = direction * (exit_price - entry_price) * MNQ_POINT_VALUE - COMMISSION
    return pnl, 299


# ─────────────────────────────────────────────
# METRICS
# ─────────────────────────────────────────────

def compute_metrics(trades, label):
    if not trades:
        return {'label': label, 'trade_count': 0, 'note': 'NO TRADES GENERATED'}

    if len(trades) < MIN_TRADES:
        pnls = [t['pnl'] for t in trades]
        return {
            'label': label,
            'trade_count': len(trades),
            'net_profit': round(sum(pnls), 2),
            'note': f'INSUFFICIENT TRADES ({len(trades)} < {MIN_TRADES}) — not statistically valid'
        }

    pnls    = [t['pnl'] for t in trades]
    winners = [p for p in pnls if p > 0]
    losers  = [p for p in pnls if p <= 0]

    gross_profit = sum(winners) if winners else 0
    gross_loss   = abs(sum(losers)) if losers else 0.001
    pf           = gross_profit / gross_loss
    net          = sum(pnls)
    wr           = len(winners) / len(pnls) * 100
    avg_w        = np.mean(winners) if winners else 0
    avg_l        = np.mean(losers)  if losers  else 0
    expectancy   = net / len(pnls)

    equity  = np.cumsum(pnls)
    peak    = np.maximum.accumulate(equity)
    max_dd  = (equity - peak).min()

    streak = max_streak = 0
    for p in pnls:
        streak = streak + 1 if p <= 0 else 0
        max_streak = max(max_streak, streak)

    longs  = [t for t in trades if t['direction'] ==  1]
    shorts = [t for t in trades if t['direction'] == -1]
    lw = sum(p for t in longs  for p in [t['pnl']] if p > 0)
    ll = abs(sum(p for t in longs  for p in [t['pnl']] if p <= 0)) or 0.001
    sw = sum(p for t in shorts for p in [t['pnl']] if p > 0)
    sl = abs(sum(p for t in shorts for p in [t['pnl']] if p <= 0)) or 0.001

    verdict = (
        'PASS' if pf >= PF_THRESHOLD and max_dd >= MAX_DD_LIMIT and len(trades) >= MIN_TRADES
        else 'FAIL'
    )

    return {
        'label':                label,
        'trade_count':          len(trades),
        'net_profit':           round(net, 2),
        'profit_factor':        round(pf, 3),
        'expectancy':           round(expectancy, 2),
        'win_rate':             round(wr, 1),
        'max_drawdown':         round(max_dd, 2),
        'avg_winner':           round(avg_w, 2),
        'avg_loser':            round(avg_l, 2),
        'largest_losing_streak': max_streak,
        'long_pf':              round(lw / ll, 3),
        'short_pf':             round(sw / sl, 3),
        'long_count':           len(longs),
        'short_count':          len(shorts),
        'verdict':              verdict,
    }


def print_result(r):
    print(f"\n  Label:                  {r['label']}")
    if 'note' in r:
        print(f"  *** {r['note']} ***")
        if 'net_profit' in r:
            print(f"  Trade Count:            {r['trade_count']}")
            print(f"  Net Profit:             ${r['net_profit']:,.2f}")
        return
    print(f"  Trade Count:            {r['trade_count']}")
    print(f"  Net Profit:             ${r['net_profit']:,.2f}")
    print(f"  Profit Factor:          {r['profit_factor']}")
    print(f"  Expectancy:             ${r['expectancy']:.2f}/trade")
    print(f"  Win Rate:               {r['win_rate']}%")
    print(f"  Max Drawdown:           ${r['max_drawdown']:,.2f}")
    print(f"  Avg Winner:             ${r['avg_winner']:.2f}")
    print(f"  Avg Loser:              ${r['avg_loser']:.2f}")
    print(f"  Largest Losing Streak:  {r['largest_losing_streak']} trades")
    print(f"  Long PF:                {r['long_pf']}  ({r['long_count']} trades)")
    print(f"  Short PF:               {r['short_pf']}  ({r['short_count']} trades)")
    print(f"  Atlas Verdict:          {r['verdict']}")


# ─────────────────────────────────────────────
# GENERIC EXPERIMENT RUNNER
# ─────────────────────────────────────────────

def run_experiment(df, trigger_fn, structural_fn, label, use_structural):
    """
    Run a single A or B experiment.
    trigger_fn(df, i) → direction (+1/-1) or None
    structural_fn(df, i) → bool (condition met)
    use_structural: if True, only enter when structural condition is also met
    """
    trades = []
    i = 0
    while i < len(df) - 1:
        row = df.loc[i]
        if not row['is_rth'] or pd.isna(row['atr14']) or row['atr14'] == 0:
            i += 1
            continue

        direction = trigger_fn(df, i)
        if direction is None:
            i += 1
            continue

        if use_structural and not structural_fn(df, i):
            i += 1
            continue

        stop_pts   = STOP_ATR_MULT * row['atr14']
        target_pts = TARGET_RR * stop_pts

        if stop_pts <= 0:
            i += 1
            continue

        pnl, bars = simulate_trade(df, i, direction, stop_pts, target_pts)
        trades.append({'direction': direction, 'pnl': pnl, 'bars': bars, 'date': row['date']})
        i += bars

    return compute_metrics(trades, label)


def structural_fn_factory(df, cond_type):
    """Return a structural condition function that takes (df, i)."""
    if cond_type == 'high_tradeability':
        return lambda d, i: cond_high_tradeability(d.loc[i])
    elif cond_type == 'vol_expansion':
        return lambda d, i: cond_volatility_expansion(d, i)
    elif cond_type == 'low_trend':
        return lambda d, i: cond_low_trend_strength(d.loc[i])
    elif cond_type == 'compression':
        return lambda d, i: cond_volatility_compression(d.loc[i])
    raise ValueError(f"Unknown condition type: {cond_type}")


# ─────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────

def run_hypothesis(df, df_y1, df_y2, trigger_fn, cond_type, hyp_id, hyp_name):
    struct_fn = structural_fn_factory(df, cond_type)

    print(f"\n{'='*70}")
    print(f"{hyp_id}: {hyp_name}")
    print(f"{'='*70}")

    # Full dataset
    r_a_full = run_experiment(df,    trigger_fn, struct_fn, f"{hyp_id} | Baseline (A) | FULL",      use_structural=False)
    r_b_full = run_experiment(df,    trigger_fn, struct_fn, f"{hyp_id} | Interaction (B) | FULL",   use_structural=True)
    # Year 1
    r_b_y1   = run_experiment(df_y1, trigger_fn, structural_fn_factory(df_y1, cond_type),
                               f"{hyp_id} | Interaction (B) | YEAR1", use_structural=True)
    # Year 2
    r_b_y2   = run_experiment(df_y2, trigger_fn, structural_fn_factory(df_y2, cond_type),
                               f"{hyp_id} | Interaction (B) | YEAR2", use_structural=True)

    print("\n--- Experiment A: Trigger Unconditional (Baseline) ---")
    print_result(r_a_full)
    print("\n--- Experiment B: Trigger + Structural Condition (Interaction) ---")
    print_result(r_b_full)
    print("\n--- Experiment B: Year 1 / Year 2 Stability ---")
    print_result(r_b_y1)
    print_result(r_b_y2)

    return r_a_full, r_b_full, r_b_y1, r_b_y2


def main():
    print("=" * 70)
    print("ATLAS RESEARCH ENGINE — SPRINT 023")
    print("Interaction Effects: Structural Components × Trigger Components")
    print("=" * 70)

    print("\n[1] Loading and preparing data...")
    df = load_and_prepare()
    print(f"    Total bars: {len(df):,}")

    cutoff = pd.Timestamp('2025-07-07').date()
    df_y1 = df[df['date'] < cutoff].reset_index(drop=True)
    df_y2 = df[df['date'] >= cutoff].reset_index(drop=True)
    print(f"    Year 1: {len(df_y1):,} bars  |  Year 2: {len(df_y2):,} bars")

    all_results = []

    # ── H-B006: Liquidity Sweep + High Tradeability ──
    a, b, y1, y2 = run_hypothesis(
        df, df_y1, df_y2,
        trigger_fn=trigger_liquidity_sweep,
        cond_type='high_tradeability',
        hyp_id='H-B006',
        hyp_name='Liquidity Sweep + High Tradeability Regime'
    )
    all_results.append((a, b, y1, y2, 'H-B006'))

    # ── H-B007: Pullback + Volatility Expansion ──
    a, b, y1, y2 = run_hypothesis(
        df, df_y1, df_y2,
        trigger_fn=trigger_pullback,
        cond_type='vol_expansion',
        hyp_id='H-B007',
        hyp_name='Pullback Continuation + Volatility Expansion'
    )
    all_results.append((a, b, y1, y2, 'H-B007'))

    # ── H-B008: Mean Reversion + Low Trend Strength ──
    a, b, y1, y2 = run_hypothesis(
        df, df_y1, df_y2,
        trigger_fn=trigger_mean_reversion,
        cond_type='low_trend',
        hyp_id='H-B008',
        hyp_name='Mean Reversion + Low Trend Strength'
    )
    all_results.append((a, b, y1, y2, 'H-B008'))

    # ── H-B009: Breakout + Volatility Compression ──
    a, b, y1, y2 = run_hypothesis(
        df, df_y1, df_y2,
        trigger_fn=trigger_breakout,
        cond_type='compression',
        hyp_id='H-B009',
        hyp_name='Breakout Continuation + Volatility Compression'
    )
    all_results.append((a, b, y1, y2, 'H-B009'))

    # ── Summary ──
    print(f"\n\n{'='*70}")
    print("SPRINT 023 SUMMARY — INTERACTION EFFECT RESULTS")
    print(f"{'='*70}")
    print(f"\n{'Hypothesis':<10} {'Exp':>4} {'Trades':>7} {'PF':>6} {'Net P&L':>10} {'MaxDD':>10} {'Verdict':>8}")
    print("-" * 65)
    for (ra, rb, ry1, ry2, hid) in all_results:
        for r, exp in [(ra, 'A'), (rb, 'B'), (ry1, 'B-Y1'), (ry2, 'B-Y2')]:
            if 'note' in r and 'net_profit' not in r:
                print(f"{hid:<10} {exp:>4} {r['trade_count']:>7}  {'N/A':>6}  {'N/A':>10}  {'N/A':>10}  {'INSUF':>8}")
            elif 'note' in r:
                print(f"{hid:<10} {exp:>4} {r['trade_count']:>7}  {'N/A':>6}  ${r['net_profit']:>9,.0f}  {'N/A':>10}  {'INSUF':>8}")
            else:
                print(f"{hid:<10} {exp:>4} {r['trade_count']:>7}  {r['profit_factor']:>6.3f}  ${r['net_profit']:>9,.0f}  ${r['max_drawdown']:>9,.0f}  {r['verdict']:>8}")

    print("\n[DONE] Sprint 023 interaction effects research complete.")


if __name__ == "__main__":
    main()
