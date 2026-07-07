"""
Atlas Research Engine — Sprint 022
H-B005: Daily 200 EMA Mean Reversion
Stream D — Component Intelligence

Hypothesis:
  H-B005a: When intraday price deviates from the Daily 200 EMA by more than N ATR,
            a mean reversion trade back toward the D200 EMA yields PF > 1.20.
  H-B005b: When intraday price pulls back to within N ATR of the Daily 200 EMA,
            entering in the direction of the broader trend yields PF > 1.20.

Design principles:
  - Daily 200 EMA is calculated from daily OHLC bars derived from the 5-minute data.
  - The D200 EMA value is mapped forward to every intraday bar (no lookahead).
  - All tests run unconditionally (no Regime Engine filter) to isolate the location edge.
  - All 12 Atlas robustness metrics are reported for every test.
  - Minimum 100 trades required for any result to be considered statistically valid.
  - Tests run on: Full 2-year dataset, Year 1 (Jul 2024–Jun 2025), Year 2 (Jul 2025–Jul 2026).
"""

import pandas as pd
import numpy as np
from pathlib import Path

# ─────────────────────────────────────────────
# CONSTANTS
# ─────────────────────────────────────────────
DATA_PATH = Path("/home/ubuntu/Project-Atlas/data/raw/massive/MNQ_5min_full.csv")
MNQ_TICK_VALUE = 0.50   # $0.50 per tick (1 tick = 0.25 points → $0.50 per contract)
MNQ_POINT_VALUE = 2.0   # $2.00 per point per MNQ contract
COMMISSION = 1.00       # $1.00 round-trip per contract (conservative estimate)
RTH_START = 9           # 9:30 ET
RTH_END = 16            # 16:00 ET

# ─────────────────────────────────────────────
# DATA LOADING & PREPARATION
# ─────────────────────────────────────────────

def load_data():
    df = pd.read_csv(DATA_PATH)
    df['ts'] = pd.to_datetime(df['timestamp_et'], utc=True)
    df = df.sort_values('ts').reset_index(drop=True)
    df['date'] = df['ts'].dt.date
    df['hour'] = df['ts'].dt.hour
    df['minute'] = df['ts'].dt.minute
    # RTH filter: 9:30–15:55 ET (last entry bar at 15:55)
    df['is_rth'] = (
        ((df['hour'] == 9) & (df['minute'] >= 30)) |
        ((df['hour'] >= 10) & (df['hour'] <= 15))
    )
    return df


def build_daily_bars(df):
    """Aggregate 5-min data into daily OHLC bars using RTH session."""
    rth = df[df['is_rth']].copy()
    daily = rth.groupby('date').agg(
        open=('open', 'first'),
        high=('high', 'max'),
        low=('low', 'min'),
        close=('close', 'last'),
        volume=('volume', 'sum')
    ).reset_index()
    daily['date'] = pd.to_datetime(daily['date'])
    return daily


def compute_daily_200_ema(daily):
    """Compute Daily 200 EMA and Daily ATR(14) on daily bars."""
    daily = daily.copy()
    daily['d200_ema'] = daily['close'].ewm(span=200, adjust=False).mean()
    # True Range for daily ATR
    daily['prev_close'] = daily['close'].shift(1)
    daily['tr'] = daily.apply(
        lambda r: max(r['high'] - r['low'],
                      abs(r['high'] - r['prev_close']) if not pd.isna(r['prev_close']) else 0,
                      abs(r['low'] - r['prev_close']) if not pd.isna(r['prev_close']) else 0),
        axis=1
    )
    daily['d_atr14'] = daily['tr'].rolling(14).mean()
    return daily[['date', 'd200_ema', 'd_atr14']]


def map_daily_to_intraday(df, daily_features):
    """
    Map daily D200 EMA and ATR to each intraday bar.
    Uses the PREVIOUS day's value to avoid lookahead bias.
    """
    daily_features = daily_features.copy()
    daily_features['date'] = pd.to_datetime(daily_features['date']).dt.date
    # Shift forward: today's bar gets yesterday's daily close values
    daily_features['d200_ema_fwd'] = daily_features['d200_ema'].shift(1)
    daily_features['d_atr14_fwd'] = daily_features['d_atr14'].shift(1)
    df = df.merge(
        daily_features[['date', 'd200_ema_fwd', 'd_atr14_fwd']],
        on='date', how='left'
    )
    return df


# ─────────────────────────────────────────────
# TRADE SIMULATION UTILITIES
# ─────────────────────────────────────────────

def simulate_trade(df, entry_idx, direction, stop_pts, target_pts):
    """
    Simulate a single trade from entry_idx.
    direction: +1 (long) or -1 (short)
    Returns: pnl in dollars, bars_held
    """
    entry_price = df.loc[entry_idx, 'close']
    stop_price = entry_price - direction * stop_pts
    target_price = entry_price + direction * target_pts

    for i in range(entry_idx + 1, min(entry_idx + 200, len(df))):
        bar = df.loc[i]
        # Check if RTH session ends — force close at close of last RTH bar
        if not bar['is_rth']:
            exit_price = df.loc[i - 1, 'close']
            pnl = direction * (exit_price - entry_price) * MNQ_POINT_VALUE - COMMISSION
            return pnl, i - entry_idx

        low = bar['low']
        high = bar['high']

        if direction == 1:  # Long
            if low <= stop_price:
                pnl = direction * (stop_price - entry_price) * MNQ_POINT_VALUE - COMMISSION
                return pnl, i - entry_idx
            if high >= target_price:
                pnl = direction * (target_price - entry_price) * MNQ_POINT_VALUE - COMMISSION
                return pnl, i - entry_idx
        else:  # Short
            if high >= stop_price:
                pnl = direction * (stop_price - entry_price) * MNQ_POINT_VALUE - COMMISSION
                return pnl, i - entry_idx
            if low <= target_price:
                pnl = direction * (target_price - entry_price) * MNQ_POINT_VALUE - COMMISSION
                return pnl, i - entry_idx

    # End of data — close at last known price
    exit_price = df.loc[min(entry_idx + 199, len(df) - 1), 'close']
    pnl = direction * (exit_price - entry_price) * MNQ_POINT_VALUE - COMMISSION
    return pnl, 199


def compute_metrics(trades, label):
    """Compute all 12 Atlas robustness metrics from a list of trade dicts."""
    if len(trades) < 100:
        return {
            'label': label,
            'trade_count': len(trades),
            'note': 'INSUFFICIENT TRADES (< 100) — result not statistically valid'
        }

    pnls = [t['pnl'] for t in trades]
    winners = [p for p in pnls if p > 0]
    losers = [p for p in pnls if p <= 0]

    gross_profit = sum(winners) if winners else 0
    gross_loss = abs(sum(losers)) if losers else 0
    profit_factor = gross_profit / gross_loss if gross_loss > 0 else float('inf')
    net_profit = sum(pnls)
    win_rate = len(winners) / len(pnls) * 100
    avg_winner = np.mean(winners) if winners else 0
    avg_loser = np.mean(losers) if losers else 0
    expectancy = (win_rate / 100 * avg_winner) + ((1 - win_rate / 100) * abs(avg_loser)) * (win_rate / 100) - (1 - win_rate / 100) * abs(avg_loser)
    expectancy = net_profit / len(pnls)

    # Max drawdown
    equity = np.cumsum(pnls)
    peak = np.maximum.accumulate(equity)
    drawdown = equity - peak
    max_dd = drawdown.min()

    # Largest losing streak
    streak = 0
    max_streak = 0
    for p in pnls:
        if p <= 0:
            streak += 1
            max_streak = max(max_streak, streak)
        else:
            streak = 0

    # Long vs Short
    longs = [t for t in trades if t['direction'] == 1]
    shorts = [t for t in trades if t['direction'] == -1]
    long_pf = sum(p for t in longs for p in [t['pnl']] if p > 0) / max(abs(sum(p for t in longs for p in [t['pnl']] if p <= 0)), 0.01)
    short_pf = sum(p for t in shorts for p in [t['pnl']] if p > 0) / max(abs(sum(p for t in shorts for p in [t['pnl']] if p <= 0)), 0.01)

    # Session performance (RTH only in this engine)
    return {
        'label': label,
        'trade_count': len(trades),
        'net_profit': round(net_profit, 2),
        'profit_factor': round(profit_factor, 3),
        'expectancy': round(expectancy, 2),
        'win_rate': round(win_rate, 1),
        'max_drawdown': round(max_dd, 2),
        'avg_winner': round(avg_winner, 2),
        'avg_loser': round(avg_loser, 2),
        'largest_losing_streak': max_streak,
        'long_pf': round(long_pf, 3),
        'short_pf': round(short_pf, 3),
        'long_count': len(longs),
        'short_count': len(shorts),
    }


# ─────────────────────────────────────────────
# H-B005a: MEAN REVERSION FROM EXTREMES
# Entry: price is N ATR above/below D200 EMA → fade back toward D200
# ─────────────────────────────────────────────

def run_h_b005a(df, deviation_atr_threshold, rr_ratio, label):
    """
    H-B005a: Mean Reversion from Extreme Deviation.
    When close is > threshold * D_ATR above D200 EMA → SHORT (fade the extension).
    When close is > threshold * D_ATR below D200 EMA → LONG (fade the extension).
    Stop: 1.0 ATR(14) intraday from entry.
    Target: rr_ratio * stop.
    """
    df = df.copy()
    # Intraday ATR(14) on 5-min bars
    df['prev_close'] = df['close'].shift(1)
    df['tr'] = df.apply(
        lambda r: max(r['high'] - r['low'],
                      abs(r['high'] - r['prev_close']) if not pd.isna(r['prev_close']) else 0,
                      abs(r['low'] - r['prev_close']) if not pd.isna(r['prev_close']) else 0),
        axis=1
    )
    df['atr14'] = df['tr'].rolling(14).mean()

    trades = []
    in_trade = False
    i = 0
    while i < len(df) - 1:
        row = df.loc[i]
        if not row['is_rth'] or pd.isna(row['d200_ema_fwd']) or pd.isna(row['d_atr14_fwd']) or pd.isna(row['atr14']):
            i += 1
            continue
        if in_trade:
            i += 1
            continue

        deviation = row['close'] - row['d200_ema_fwd']
        threshold = deviation_atr_threshold * row['d_atr14_fwd']
        stop_pts = 1.0 * row['atr14']
        target_pts = rr_ratio * stop_pts

        if stop_pts <= 0 or target_pts <= 0:
            i += 1
            continue

        direction = None
        if deviation > threshold:
            direction = -1  # Price above D200 EMA by threshold → SHORT back toward D200
        elif deviation < -threshold:
            direction = 1   # Price below D200 EMA by threshold → LONG back toward D200

        if direction is not None:
            pnl, bars = simulate_trade(df, i, direction, stop_pts, target_pts)
            trades.append({
                'entry_idx': i,
                'direction': direction,
                'pnl': pnl,
                'bars_held': bars,
                'deviation_atr': abs(deviation) / row['d_atr14_fwd'],
                'date': row['date']
            })
            i += bars
            in_trade = False
        else:
            i += 1

    return compute_metrics(trades, label)


# ─────────────────────────────────────────────
# H-B005b: BOUNCE AT DAILY 200 EMA
# Entry: price pulls back to within N ATR of D200 EMA → enter in trend direction
# ─────────────────────────────────────────────

def run_h_b005b(df, proximity_atr_threshold, rr_ratio, label):
    """
    H-B005b: Bounce at Daily 200 EMA.
    Trend direction determined by whether close is above or below D200 EMA on entry.
    When price is within proximity_atr_threshold * D_ATR of D200 EMA:
      - If price is above D200 EMA → LONG (bounce off support)
      - If price is below D200 EMA → SHORT (bounce off resistance)
    Stop: 1.0 ATR(14) intraday from entry.
    Target: rr_ratio * stop.
    """
    df = df.copy()
    df['prev_close'] = df['close'].shift(1)
    df['tr'] = df.apply(
        lambda r: max(r['high'] - r['low'],
                      abs(r['high'] - r['prev_close']) if not pd.isna(r['prev_close']) else 0,
                      abs(r['low'] - r['prev_close']) if not pd.isna(r['prev_close']) else 0),
        axis=1
    )
    df['atr14'] = df['tr'].rolling(14).mean()

    trades = []
    in_trade = False
    i = 0
    while i < len(df) - 1:
        row = df.loc[i]
        if not row['is_rth'] or pd.isna(row['d200_ema_fwd']) or pd.isna(row['d_atr14_fwd']) or pd.isna(row['atr14']):
            i += 1
            continue
        if in_trade:
            i += 1
            continue

        deviation = row['close'] - row['d200_ema_fwd']
        proximity = proximity_atr_threshold * row['d_atr14_fwd']
        stop_pts = 1.0 * row['atr14']
        target_pts = rr_ratio * stop_pts

        if stop_pts <= 0 or target_pts <= 0:
            i += 1
            continue

        direction = None
        if abs(deviation) <= proximity:
            if deviation >= 0:
                direction = 1   # Price near D200 EMA from above → LONG (support bounce)
            else:
                direction = -1  # Price near D200 EMA from below → SHORT (resistance bounce)

        if direction is not None:
            pnl, bars = simulate_trade(df, i, direction, stop_pts, target_pts)
            trades.append({
                'entry_idx': i,
                'direction': direction,
                'pnl': pnl,
                'bars_held': bars,
                'deviation_atr': abs(deviation) / row['d_atr14_fwd'],
                'date': row['date']
            })
            i += bars
            in_trade = False
        else:
            i += 1

    return compute_metrics(trades, label)


# ─────────────────────────────────────────────
# MAIN EXPERIMENT RUNNER
# ─────────────────────────────────────────────

def print_result(r):
    print(f"\n  Label:                  {r['label']}")
    if 'note' in r:
        print(f"  *** {r['note']} ***")
        print(f"  Trade Count:            {r['trade_count']}")
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
    verdict = "PASS" if r['profit_factor'] >= 1.20 and r['max_drawdown'] >= -2000 and r['trade_count'] >= 100 else "FAIL"
    print(f"  Atlas Verdict:          {verdict}")


def main():
    print("=" * 70)
    print("ATLAS RESEARCH ENGINE — SPRINT 022")
    print("H-B005: Daily 200 EMA Mean Reversion")
    print("=" * 70)

    # ── Load and prepare data ──
    print("\n[1] Loading data...")
    df = load_data()
    print(f"    Total bars: {len(df):,}")

    print("\n[2] Building daily bars and computing D200 EMA...")
    daily = build_daily_bars(df)
    print(f"    Daily bars: {len(daily)}")
    daily_features = compute_daily_200_ema(daily)

    # Check how many daily bars have a valid D200 EMA
    valid_d200 = daily_features['d200_ema'].notna().sum()
    print(f"    Daily bars with valid D200 EMA: {valid_d200} / {len(daily_features)}")

    print("\n[3] Mapping daily features to intraday bars (no lookahead)...")
    df = map_daily_to_intraday(df, daily_features)
    valid_intraday = df['d200_ema_fwd'].notna().sum()
    print(f"    Intraday bars with valid D200 EMA: {valid_intraday:,} / {len(df):,}")

    # ── Define sub-periods ──
    df['ts_date'] = pd.to_datetime(df['date'])
    cutoff = pd.Timestamp('2025-07-07').date()
    df_y1 = df[df['date'] < cutoff].reset_index(drop=True)
    df_y2 = df[df['date'] >= cutoff].reset_index(drop=True)
    print(f"\n    Full dataset: {len(df):,} bars")
    print(f"    Year 1 (Jul 2024–Jul 2025): {len(df_y1):,} bars")
    print(f"    Year 2 (Jul 2025–Jul 2026): {len(df_y2):,} bars")

    # ─────────────────────────────────────────────
    # EXPERIMENT A: H-B005a — Mean Reversion from Extremes
    # Parameter sweep: deviation threshold (1.5, 2.0, 2.5, 3.0 D-ATR)
    #                  R:R ratio (1:1, 1:2)
    # ─────────────────────────────────────────────
    print("\n" + "=" * 70)
    print("EXPERIMENT A: H-B005a — Mean Reversion from Extreme Deviation")
    print("Entry: Fade price when it deviates > N * Daily ATR from D200 EMA")
    print("=" * 70)

    a_params = [
        (1.5, 1.0), (1.5, 2.0),
        (2.0, 1.0), (2.0, 2.0),
        (2.5, 1.0), (2.5, 2.0),
        (3.0, 1.0), (3.0, 2.0),
    ]

    a_results_full = []
    for dev, rr in a_params:
        label = f"H-B005a | Dev>{dev}xATR | RR={rr}:1 | FULL"
        r = run_h_b005a(df, dev, rr, label)
        a_results_full.append(r)
        print_result(r)

    # Best configuration on Year 1 and Year 2 for robustness check
    print("\n--- Year 1 / Year 2 Robustness Check (Dev>2.0xATR, RR=2:1) ---")
    r_y1 = run_h_b005a(df_y1, 2.0, 2.0, "H-B005a | Dev>2.0xATR | RR=2:1 | YEAR1")
    r_y2 = run_h_b005a(df_y2, 2.0, 2.0, "H-B005a | Dev>2.0xATR | RR=2:1 | YEAR2")
    print_result(r_y1)
    print_result(r_y2)

    # ─────────────────────────────────────────────
    # EXPERIMENT B: H-B005b — Bounce at Daily 200 EMA
    # Parameter sweep: proximity threshold (0.25, 0.5, 0.75, 1.0 D-ATR)
    #                  R:R ratio (1:1, 1:2)
    # ─────────────────────────────────────────────
    print("\n" + "=" * 70)
    print("EXPERIMENT B: H-B005b — Bounce at Daily 200 EMA")
    print("Entry: Enter in trend direction when price is within N * Daily ATR of D200 EMA")
    print("=" * 70)

    b_params = [
        (0.25, 1.0), (0.25, 2.0),
        (0.50, 1.0), (0.50, 2.0),
        (0.75, 1.0), (0.75, 2.0),
        (1.00, 1.0), (1.00, 2.0),
    ]

    b_results_full = []
    for prox, rr in b_params:
        label = f"H-B005b | Prox<{prox}xATR | RR={rr}:1 | FULL"
        r = run_h_b005b(df, prox, rr, label)
        b_results_full.append(r)
        print_result(r)

    # Year 1 / Year 2 robustness on best proximity
    print("\n--- Year 1 / Year 2 Robustness Check (Prox<0.5xATR, RR=2:1) ---")
    r_y1b = run_h_b005b(df_y1, 0.5, 2.0, "H-B005b | Prox<0.5xATR | RR=2:1 | YEAR1")
    r_y2b = run_h_b005b(df_y2, 0.5, 2.0, "H-B005b | Prox<0.5xATR | RR=2:1 | YEAR2")
    print_result(r_y1b)
    print_result(r_y2b)

    # ─────────────────────────────────────────────
    # SUMMARY TABLE
    # ─────────────────────────────────────────────
    print("\n" + "=" * 70)
    print("SUMMARY — ALL FULL-DATASET RESULTS")
    print("=" * 70)
    print(f"\n{'Label':<55} {'Trades':>7} {'PF':>6} {'Net P&L':>10} {'MaxDD':>10} {'Verdict':>8}")
    print("-" * 100)
    for r in a_results_full + b_results_full:
        if 'note' in r:
            print(f"{r['label']:<55} {r['trade_count']:>7}  {'N/A':>6}  {'N/A':>10}  {'N/A':>10}  {'INSUF':>8}")
        else:
            verdict = "PASS" if r['profit_factor'] >= 1.20 and r['max_drawdown'] >= -2000 and r['trade_count'] >= 100 else "FAIL"
            print(f"{r['label']:<55} {r['trade_count']:>7}  {r['profit_factor']:>6.3f}  ${r['net_profit']:>9,.0f}  ${r['max_drawdown']:>9,.0f}  {verdict:>8}")

    print("\n[DONE] H-B005 research complete.")


if __name__ == "__main__":
    main()
