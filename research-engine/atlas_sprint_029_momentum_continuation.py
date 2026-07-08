"""
Sprint 029 — Model A2 Candidate: Momentum Continuation
=======================================================
Tests whether N consecutive bars closing in the top X% of their range,
within a high-ADX trending regime, produces statistically significant edge.

Identical risk management to Model A1 (1 ATR stop, 2:1 RR) to isolate entry logic.
Includes combined A1+A2 portfolio analysis for any passing configuration.
"""

import pandas as pd
import numpy as np
import sys
import os
from datetime import time as dtime

# ── Constants (identical to Model A1 for isolation) ──────────────────────────
DATA_PATH   = "/home/ubuntu/Project-Atlas/data/raw/massive/MNQ_5min_full.csv"
STOP_ATR    = 1.0
TARGET_RR   = 2.0
COMMISSION  = 1.00   # per side
MNQ_POINT   = 2.0    # $2 per point per contract
MIN_TRADES  = 100
MC_RUNS     = 10000

# ── Model A1 parameters (for portfolio comparison) ────────────────────────────
A1_EXP_MULT_LO = 0.5
A1_EXP_MULT_HI = 1.2
A1_VOL_LOOKBACK = 20
A1_VOL_RATIO    = 1.8

# ── Load & prepare data ───────────────────────────────────────────────────────
def load_data():
    df = pd.read_csv(DATA_PATH)
    df['ts'] = pd.to_datetime(df['timestamp_et'], utc=True)
    df = df.sort_values('ts').reset_index(drop=True)
    df['hour'] = df['ts'].dt.hour
    df['minute'] = df['ts'].dt.minute
    df['dow'] = df['ts'].dt.dayofweek   # 0=Mon, 4=Fri
    df['date'] = df['ts'].dt.date
    return df

def compute_indicators(df):
    c = df['close']
    h = df['high']
    l = df['low']

    # EMAs
    df['ema9']  = c.ewm(span=9,  adjust=False).mean()
    df['ema21'] = c.ewm(span=21, adjust=False).mean()
    df['ema50'] = c.ewm(span=50, adjust=False).mean()

    # ATR(14)
    prev_c = c.shift(1)
    tr = pd.concat([h - l,
                    (h - prev_c).abs(),
                    (l - prev_c).abs()], axis=1).max(axis=1)
    df['atr14'] = tr.ewm(span=14, adjust=False).mean()

    # ADX(14)
    up   = h.diff()
    down = -l.diff()
    plus_dm  = np.where((up > down) & (up > 0), up, 0.0)
    minus_dm = np.where((down > up) & (down > 0), down, 0.0)
    atr_s = pd.Series(tr).ewm(span=14, adjust=False).mean()
    plus_di  = 100 * pd.Series(plus_dm).ewm(span=14, adjust=False).mean() / atr_s
    minus_di = 100 * pd.Series(minus_dm).ewm(span=14, adjust=False).mean() / atr_s
    dx = (100 * (plus_di - minus_di).abs() / (plus_di + minus_di + 1e-9))
    df['adx14'] = dx.ewm(span=14, adjust=False).mean()

    # Bar close position within range (0–1; 1 = closed at high)
    rng = (h - l).replace(0, np.nan)
    df['close_pos'] = (c - l) / rng   # NaN for doji bars

    # Volatility expansion ratio (for Model A1 portfolio comparison)
    df['atr_ratio'] = df['atr14'] / df['atr14'].shift(A1_VOL_LOOKBACK)

    # Swing high/low for Model A1 depth constraint
    df['swing_hi'] = h.rolling(10).max()
    df['swing_lo'] = l.rolling(10).min()

    # Model A1 signals (for portfolio analysis)
    bull_stack = (df['ema9'] > df['ema21']) & (df['ema21'] > df['ema50'])
    bear_stack = (df['ema9'] < df['ema21']) & (df['ema21'] < df['ema50'])
    pb_touch_bull = c <= df['ema21'] * 1.001
    pb_touch_bear = c >= df['ema21'] * 0.999
    depth_bull = (df['swing_hi'] - c) / df['atr14']
    depth_bear = (c - df['swing_lo']) / df['atr14']
    depth_ok_bull = (depth_bull >= A1_EXP_MULT_LO) & (depth_bull <= A1_EXP_MULT_HI)
    depth_ok_bear = (depth_bear >= A1_EXP_MULT_LO) & (depth_bear <= A1_EXP_MULT_HI)
    vol_exp = df['atr_ratio'] >= A1_VOL_RATIO
    df['a1_long']  = bull_stack & pb_touch_bull & depth_ok_bull & vol_exp
    df['a1_short'] = bear_stack & pb_touch_bear & depth_ok_bear & vol_exp

    return df

# ── Session / day filter (consistent with Model A1 characterisation) ──────────
def is_valid_session(row):
    """13:00–16:00 ET, Mon–Thu only."""
    if row['dow'] == 4:          # Friday
        return False
    h, m = row['hour'], row['minute']
    return (h == 13 or h == 14 or h == 15) or (h == 16 and m == 0)

# ── Momentum Continuation signal ─────────────────────────────────────────────
def compute_mc_signal(df, n_bars, close_pct, adx_threshold=30):
    """
    Long signal: last N bars each have close_pos >= close_pct,
                 ADX > threshold, full bullish EMA stack,
                 no climax (bar range < 2.0 × ATR).
    Short signal: mirror.
    """
    cp = df['close_pos'].fillna(0)
    rng = df['high'] - df['low']
    no_climax = rng < 2.0 * df['atr14']
    adx_ok    = df['adx14'] > adx_threshold
    bull_stack = (df['ema9'] > df['ema21']) & (df['ema21'] > df['ema50'])
    bear_stack = (df['ema9'] < df['ema21']) & (df['ema21'] < df['ema50'])

    # Rolling check: all N bars close in top X%
    top_x  = (cp >= close_pct).astype(int)
    bot_x  = (cp <= (1 - close_pct)).astype(int)
    consec_top = top_x.rolling(n_bars).sum() == n_bars
    consec_bot = bot_x.rolling(n_bars).sum() == n_bars

    long_sig  = consec_top & adx_ok & bull_stack & no_climax
    short_sig = consec_bot & adx_ok & bear_stack & no_climax

    df['mc_long']  = long_sig
    df['mc_short'] = short_sig
    return df

# ── Trade simulator ───────────────────────────────────────────────────────────
def simulate(df, signal_col, direction, label=""):
    """
    Simulate trades using STOP_ATR stop and TARGET_RR target.
    Returns list of trade dicts.
    """
    trades = []
    i = 0
    n = len(df)
    while i < n:
        row = df.iloc[i]
        if not row.get('valid_session', False):
            i += 1
            continue
        if not row[signal_col]:
            i += 1
            continue

        entry_price = row['close']
        atr_val     = row['atr14']
        if pd.isna(atr_val) or atr_val == 0:
            i += 1
            continue

        stop_pts   = STOP_ATR * atr_val
        target_pts = TARGET_RR * stop_pts

        if direction == 'long':
            stop_price   = entry_price - stop_pts
            target_price = entry_price + target_pts
        else:
            stop_price   = entry_price + stop_pts
            target_price = entry_price - target_pts

        entry_date = row['date']
        outcome = None
        bars_held = 1

        for j in range(i + 1, min(i + 200, n)):
            bar = df.iloc[j]
            # End of session: close at market
            if bar['date'] != entry_date:
                pnl_pts = (bar['open'] - entry_price) if direction == 'long' else (entry_price - bar['open'])
                outcome = 'eod'
                bars_held = j - i
                break
            if direction == 'long':
                if bar['low'] <= stop_price:
                    pnl_pts = stop_price - entry_price
                    outcome = 'stop'
                    bars_held = j - i
                    break
                if bar['high'] >= target_price:
                    pnl_pts = target_price - entry_price
                    outcome = 'target'
                    bars_held = j - i
                    break
            else:
                if bar['high'] >= stop_price:
                    pnl_pts = entry_price - stop_price
                    outcome = 'stop'
                    bars_held = j - i
                    break
                if bar['low'] <= target_price:
                    pnl_pts = entry_price - target_price
                    outcome = 'target'
                    bars_held = j - i
                    break

        if outcome is None:
            pnl_pts = 0
            bars_held = 1

        pnl_dollars = pnl_pts * MNQ_POINT - COMMISSION * 2
        trades.append({
            'entry_ts':    row['ts'],
            'date':        entry_date,
            'direction':   direction,
            'entry_price': entry_price,
            'pnl_pts':     pnl_pts,
            'pnl':         pnl_dollars,
            'outcome':     outcome,
            'bars_held':   bars_held,
            'year':        row['ts'].dt.year if hasattr(row['ts'], 'dt') else row['ts'].year,
        })
        i += bars_held if bars_held > 0 else 1

    return trades

# ── Statistics ────────────────────────────────────────────────────────────────
def compute_stats(trades, label=""):
    if not trades:
        return None
    t = pd.DataFrame(trades)
    wins  = t[t['pnl'] > 0]
    losses = t[t['pnl'] <= 0]
    gross_profit = wins['pnl'].sum()
    gross_loss   = abs(losses['pnl'].sum())
    pf = gross_profit / gross_loss if gross_loss > 0 else float('inf')
    net = t['pnl'].sum()
    wr  = len(wins) / len(t)
    avg_w = wins['pnl'].mean() if len(wins) > 0 else 0
    avg_l = losses['pnl'].mean() if len(losses) > 0 else 0
    exp   = (wr * avg_w) + ((1 - wr) * avg_l)

    equity = t['pnl'].cumsum()
    peak   = equity.cummax()
    dd     = equity - peak
    max_dd = dd.min()

    # Losing streak
    streak = max_streak = 0
    for p in t['pnl']:
        if p <= 0:
            streak += 1
            max_streak = max(max_streak, streak)
        else:
            streak = 0

    return {
        'label':      label,
        'trades':     len(t),
        'pf':         round(pf, 3),
        'net':        round(net, 0),
        'wr':         round(wr, 3),
        'expectancy': round(exp, 2),
        'avg_win':    round(avg_w, 2),
        'avg_loss':   round(avg_l, 2),
        'max_dd':     round(max_dd, 0),
        'max_streak': max_streak,
        'pnl_series': t['pnl'].values,
        'dates':      t['date'].values if 'date' in t.columns else [],
    }

def year_split(trades):
    t = pd.DataFrame(trades)
    if t.empty:
        return None, None
    t['yr'] = pd.to_datetime(t['entry_ts']).dt.year
    y1 = t[t['yr'] == t['yr'].min()]
    y2 = t[t['yr'] == t['yr'].max()]
    return y1['pnl'].tolist(), y2['pnl'].tolist()

def monte_carlo(pnl_series, n_runs=MC_RUNS, account=50000, max_dd_limit=2000):
    rng = np.random.default_rng(42)
    passes = 0
    for _ in range(n_runs):
        shuffled = rng.choice(pnl_series, size=len(pnl_series), replace=True)
        equity   = np.cumsum(shuffled)
        peak     = np.maximum.accumulate(equity)
        dd       = equity - peak
        if dd.min() > -max_dd_limit:
            passes += 1
    return passes / n_runs

# ── Portfolio analysis (A1 + A2 combined) ────────────────────────────────────
def portfolio_analysis(a1_trades, a2_trades):
    """Combine A1 and A2 trade streams and compute portfolio-level stats."""
    if not a1_trades or not a2_trades:
        return None
    t1 = pd.DataFrame(a1_trades)[['date', 'pnl']].copy()
    t2 = pd.DataFrame(a2_trades)[['date', 'pnl']].copy()
    combined = pd.concat([t1, t2]).sort_values('date').reset_index(drop=True)

    wins   = combined[combined['pnl'] > 0]
    losses = combined[combined['pnl'] <= 0]
    gp = wins['pnl'].sum()
    gl = abs(losses['pnl'].sum())
    pf = gp / gl if gl > 0 else float('inf')
    net = combined['pnl'].sum()

    equity = combined['pnl'].cumsum()
    peak   = equity.cummax()
    dd     = equity - peak
    max_dd = dd.min()

    # Daily P&L for Sharpe
    daily = combined.groupby('date')['pnl'].sum()
    sharpe = (daily.mean() / daily.std() * np.sqrt(252)) if daily.std() > 0 else 0

    # Correlation between A1 and A2 daily P&L
    d1 = t1.groupby('date')['pnl'].sum().rename('a1')
    d2 = t2.groupby('date')['pnl'].sum().rename('a2')
    merged = pd.concat([d1, d2], axis=1).fillna(0)
    corr = merged['a1'].corr(merged['a2'])

    return {
        'combined_trades': len(combined),
        'combined_pf':     round(pf, 3),
        'combined_net':    round(net, 0),
        'combined_max_dd': round(max_dd, 0),
        'sharpe':          round(sharpe, 3),
        'a1_a2_corr':      round(corr, 3),
    }

# ── Main sweep ────────────────────────────────────────────────────────────────
def main():
    print("=" * 70)
    print("SPRINT 029 — MODEL A2: MOMENTUM CONTINUATION")
    print("=" * 70)

    print("\nLoading data...")
    df = load_data()
    print(f"  Rows: {len(df):,}  |  Date range: {df['date'].min()} → {df['date'].max()}")

    print("Computing indicators...")
    df = compute_indicators(df)
    df['valid_session'] = df.apply(is_valid_session, axis=1)
    print(f"  Valid session bars: {df['valid_session'].sum():,}")

    # ── Run Model A1 once for portfolio comparison ────────────────────────────
    print("\nRunning Model A1 baseline for portfolio comparison...")
    a1_long_trades  = simulate(df, 'a1_long',  'long',  'A1-Long')
    a1_short_trades = simulate(df, 'a1_short', 'short', 'A1-Short')
    a1_all = a1_long_trades + a1_short_trades
    a1_stats = compute_stats(a1_all, 'Model A1 Baseline')
    if a1_stats:
        print(f"  A1: {a1_stats['trades']} trades | PF {a1_stats['pf']} | Net ${a1_stats['net']:,.0f} | Max DD ${a1_stats['max_dd']:,.0f}")

    # ── Parameter sweep ───────────────────────────────────────────────────────
    n_bars_list  = [2, 3, 4]
    close_pcts   = [0.25, 0.33, 0.50]   # close in top 25%, 33%, 50% of range
    adx_threshold = 30

    results = []
    passing_configs = []

    print(f"\nRunning {len(n_bars_list) * len(close_pcts)} configurations (N × close_pct)...")
    print("-" * 70)

    for n in n_bars_list:
        for cp in close_pcts:
            label = f"N={n} | Top{int(cp*100)}% | ADX>{adx_threshold}"
            df2 = compute_mc_signal(df.copy(), n, cp, adx_threshold)

            long_trades  = simulate(df2, 'mc_long',  'long',  label)
            short_trades = simulate(df2, 'mc_short', 'short', label)
            all_trades   = long_trades + short_trades

            stats = compute_stats(all_trades, label)
            if stats is None:
                print(f"  {label}: NO TRADES")
                continue

            # Year split
            y1_pnl, y2_pnl = year_split(all_trades)
            y1_stats = compute_stats([{'pnl': p} for p in y1_pnl], 'Y1') if y1_pnl else None
            y2_stats = compute_stats([{'pnl': p} for p in y2_pnl], 'Y2') if y2_pnl else None

            y1_pf  = y1_stats['pf'] if y1_stats else 0
            y2_pf  = y2_stats['pf'] if y2_stats else 0
            y1_net = y1_stats['net'] if y1_stats else 0
            y2_net = y2_stats['net'] if y2_stats else 0

            # Acceptance check
            passes = (
                stats['pf'] >= 1.20 and
                stats['trades'] >= MIN_TRADES and
                stats['max_dd'] > -2000 and
                y1_net > 0 and
                y2_net > 0
            )

            verdict = "PASS (standalone)" if passes else "FAIL"
            print(f"\n  {label}")
            print(f"    Trades: {stats['trades']} | PF: {stats['pf']} | Net: ${stats['net']:,.0f} | Max DD: ${stats['max_dd']:,.0f}")
            print(f"    Win Rate: {stats['wr']:.1%} | Expectancy: ${stats['expectancy']:.2f} | Max Streak: {stats['max_streak']}")
            print(f"    Year 1: PF {y1_pf} | Net ${y1_net:,.0f}   Year 2: PF {y2_pf} | Net ${y2_net:,.0f}")
            print(f"    Verdict: {verdict}")

            row = {
                'label': label, 'n': n, 'close_pct': cp,
                'trades': stats['trades'], 'pf': stats['pf'],
                'net': stats['net'], 'max_dd': stats['max_dd'],
                'wr': stats['wr'], 'expectancy': stats['expectancy'],
                'max_streak': stats['max_streak'],
                'y1_pf': y1_pf, 'y1_net': y1_net,
                'y2_pf': y2_pf, 'y2_net': y2_net,
                'passes': passes,
                'pnl_series': stats['pnl_series'],
                'all_trades': all_trades,
            }
            results.append(row)
            if passes:
                passing_configs.append(row)

    # ── Summary ───────────────────────────────────────────────────────────────
    print("\n" + "=" * 70)
    print("SPRINT 029 SUMMARY")
    print("=" * 70)

    passing = [r for r in results if r['passes']]
    print(f"\nConfigurations tested: {len(results)}")
    print(f"Standalone passes:     {len(passing)}")

    if not passing:
        print("\nVERDICT: MOMENTUM CONTINUATION — REJECTED")
        print("No configuration met the standalone acceptance criteria.")
        print("Proceeding to next ranked candidate: Breakout Continuation.")
        # Print best result for the record
        best = max(results, key=lambda x: x['pf'])
        print(f"\nBest configuration: {best['label']}")
        print(f"  PF: {best['pf']} | Net: ${best['net']:,.0f} | Trades: {best['trades']} | Max DD: ${best['max_dd']:,.0f}")
        print(f"  Year 1: PF {best['y1_pf']} | Year 2: PF {best['y2_pf']}")
    else:
        print("\nStandalone passing configurations:")
        for r in passing:
            print(f"  {r['label']}: PF {r['pf']} | Net ${r['net']:,.0f} | Trades {r['trades']} | Max DD ${r['max_dd']:,.0f}")

        # Monte Carlo on best passing config
        best = max(passing, key=lambda x: x['pf'])
        print(f"\nMonte Carlo ({MC_RUNS:,} runs) on best config: {best['label']}")
        mc_pass = monte_carlo(best['pnl_series'])
        print(f"  Prop firm pass rate: {mc_pass:.1%}")

        # Parameter sensitivity: check neighbours
        print(f"\nParameter sensitivity check for best config (N={best['n']}, Top{int(best['close_pct']*100)}%):")
        neighbours = [r for r in results if abs(r['n'] - best['n']) <= 1 or abs(r['close_pct'] - best['close_pct']) <= 0.1]
        for nb in neighbours:
            print(f"  {nb['label']}: PF {nb['pf']} | Net ${nb['net']:,.0f}")

        # Portfolio analysis
        print(f"\nCombined A1 + A2 Portfolio Analysis (best config):")
        port = portfolio_analysis(a1_all, best['all_trades'])
        if port:
            print(f"  Combined trades:  {port['combined_trades']}")
            print(f"  Combined PF:      {port['combined_pf']}")
            print(f"  Combined Net:     ${port['combined_net']:,.0f}")
            print(f"  Combined Max DD:  ${port['combined_max_dd']:,.0f}")
            print(f"  Portfolio Sharpe: {port['sharpe']}")
            print(f"  A1/A2 Correlation: {port['a1_a2_corr']}")

            # Compare to A1 alone
            print(f"\nComparison (A1 alone vs A1+A2 portfolio):")
            print(f"  A1 alone:   PF {a1_stats['pf']} | Net ${a1_stats['net']:,.0f} | Max DD ${a1_stats['max_dd']:,.0f}")
            print(f"  A1+A2 port: PF {port['combined_pf']} | Net ${port['combined_net']:,.0f} | Max DD ${port['combined_max_dd']:,.0f}")

            dd_improvement = a1_stats['max_dd'] - port['combined_max_dd']
            if dd_improvement > 0:
                print(f"  Drawdown improvement: ${dd_improvement:,.0f} ({dd_improvement/abs(a1_stats['max_dd']):.1%} reduction)")
            else:
                print(f"  Drawdown change: ${dd_improvement:,.0f} (no improvement)")

        # Final verdict
        print(f"\nFINAL VERDICT:")
        if mc_pass >= 0.50 and port and port['combined_max_dd'] > a1_stats['max_dd']:
            print("  PROMOTED — Momentum Continuation meets all acceptance criteria.")
            print("  Portfolio benefit confirmed. Proceed to characterisation.")
        elif mc_pass >= 0.40:
            print("  CONDITIONAL — Passes standalone but portfolio benefit marginal.")
            print("  Further investigation required before promotion.")
        else:
            print("  REJECTED — Monte Carlo pass rate insufficient for prop firm use.")

    print("\n" + "=" * 70)
    print("Sprint 029 complete.")
    print("=" * 70)

if __name__ == "__main__":
    main()
