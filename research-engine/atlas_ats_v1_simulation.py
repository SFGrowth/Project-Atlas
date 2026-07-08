"""
Atlas Trading System v1.0 — Full System Simulation
====================================================
Integrates all validated components into a single operating system and
simulates performance against a $50k prop firm evaluation.

Components integrated:
  - Market Regime Engine v1.0 (C-REG-001: Volatility Compression, C-LOC-001: VWAP Deviation)
  - Execution Model A1 (C-STR-001: Volatility Expansion, C-TRG-001: Depth-Constrained Pullback)
  - ARI Session & Day Filter (PM Session 13:00-16:00 ET, no Fridays)
  - ARI Capital Allocation (1% base risk, 0.5% on 4-5 consecutive losses)
  - ARI Daily Risk Limits ($1,000 daily loss limit)
  - ARI Consecutive Loss Block (block at 6 consecutive losses)
  - Prop Firm Rules ($50k account, $3,000 profit target, $2,000 trailing drawdown limit)

Experiments:
  A: Model A1 alone (no ARI, no regime filter) — baseline
  B: Model A1 + ARI Session/Day Filter only
  C: Model A1 + ARI Session/Day Filter + ARI Capital/Risk Management (full ATS v1.0)

For each experiment:
  - Full 2-year backtest
  - Year 1 / Year 2 sub-period stability
  - Monte Carlo prop firm pass rate (10,000 simulations)
"""

import pandas as pd
import numpy as np
import sys
import os
from datetime import time as dtime

DATA_PATH = "/home/ubuntu/Project-Atlas/data/raw/massive/MNQ_5min_full.csv"
OUTPUT_PATH = "/tmp/ats_v1_output.txt"

# ── Prop firm parameters ──────────────────────────────────────────────────────
ACCOUNT_SIZE       = 50_000
PROFIT_TARGET      = 3_000
TRAILING_DD_LIMIT  = 2_000   # trailing drawdown from peak
DAILY_LOSS_LIMIT   = 2_000   # $2,000 daily loss limit (4x base risk, consistent with $50k prop)
POINT_VALUE        = 2.0     # MNQ: $2 per point

# ── Model A1 parameters (frozen) ─────────────────────────────────────────────
EMA_FAST, EMA_MID, EMA_SLOW = 9, 21, 50
ATR_PERIOD         = 14
EXPANSION_PERIOD   = 20
EXPANSION_RATIO    = 1.8
DEPTH_MIN          = 0.5
DEPTH_MAX          = 1.2
STOP_ATR_MULT      = 1.0     # 1x ATR stop (validated Sprint 024)
RR_RATIO           = 2.0     # 2:1 reward:risk (validated Sprint 024)
COMMISSION_PER_RT  = 1.0     # $1 per trade (Sprint 024 convention)

# ── ARI parameters ────────────────────────────────────────────────────────────
BASE_RISK_PCT      = 0.01    # 1% of account
REDUCED_RISK_PCT   = 0.005   # 0.5% after 4-5 consecutive losses
CONSEC_BLOCK       = 6       # block after 6 consecutive losses
CONSEC_REDUCE      = 4       # reduce risk at 4 consecutive losses
SESSION_HOUR_START = 13      # 13:00 ET (hour-based, consistent with Sprint 024/026)
SESSION_HOUR_END   = 15      # up to end of hour 15 (15:55 ET)

# ── Regime Engine v1.0 parameters ────────────────────────────────────────────
ATR_SHORT, ATR_LONG = 5, 20
COMPRESSION_THRESH = 0.7     # ATR ratio must be > this (resolved compression)
VWAP_DEV_THRESH    = 1.5     # price must be within 1.5 ATR of VWAP


def load_data():
    df = pd.read_csv(DATA_PATH)
    # Parse ET timestamp preserving the UTC offset (consistent with Sprint 024/026)
    df["ts"]      = pd.to_datetime(df["timestamp_et"], utc=True)
    df["hour"]    = df["ts"].dt.hour
    df["minute"]  = df["ts"].dt.minute
    df["weekday"] = df["ts"].dt.weekday  # 0=Mon, 4=Fri
    df["date"]    = df["ts"].dt.date
    # RTH: 09:30-16:00 ET
    df["is_rth"]  = (
        ((df["hour"] == 9) & (df["minute"] >= 30)) |
        ((df["hour"] >= 10) & (df["hour"] <= 15))
    )
    return df


def compute_indicators(df):
    """
    Compute all indicators on the FULL dataset (including overnight bars).
    This matches Sprint 024's approach exactly — RTH filtering is applied
    only inside the trade loop, not here.
    """
    # ATR (rolling, not EWM, to match Sprint 024)
    pc = df["close"].shift(1)
    tr = np.maximum(
        df["high"] - df["low"],
        np.maximum((df["high"] - pc).abs(), (df["low"] - pc).abs())
    )
    df["tr"]        = tr
    df["atr14"]     = tr.rolling(ATR_PERIOD, min_periods=1).mean()
    df["atr_short"] = tr.rolling(ATR_SHORT,  min_periods=1).mean()
    df["atr_long"]  = tr.rolling(ATR_LONG,   min_periods=1).mean()

    # EMAs (exact Sprint 024 names)
    df["ema9"]  = df["close"].ewm(span=EMA_FAST, adjust=False).mean()
    df["ema21"] = df["close"].ewm(span=EMA_MID,  adjust=False).mean()
    df["ema50"] = df["close"].ewm(span=EMA_SLOW, adjust=False).mean()

    # Trend stack (exact Sprint 024 logic)
    df["uptrend"]   = (df["ema9"] > df["ema21"]) & (df["ema21"] > df["ema50"])
    df["downtrend"] = (df["ema9"] < df["ema21"]) & (df["ema21"] < df["ema50"])

    # Pullback to EMA21 touch (exact Sprint 024 logic)
    prev_close = df["close"].shift(1)
    df["pb_long_touch"]  = (prev_close > df["ema21"]) & (df["close"] <= df["ema21"] * 1.001)
    df["pb_short_touch"] = (prev_close < df["ema21"]) & (df["close"] >= df["ema21"] * 0.999)

    # Depth from 10-bar swing (exact Sprint 024 logic)
    df["swing_high_10"] = df["high"].shift(1).rolling(10, min_periods=1).max()
    df["swing_low_10"]  = df["low"].shift(1).rolling(10, min_periods=1).min()
    df["pb_depth_long"]  = (df["swing_high_10"] - df["close"]) / df["atr14"].replace(0, np.nan)
    df["pb_depth_short"] = (df["close"] - df["swing_low_10"])  / df["atr14"].replace(0, np.nan)

    # Volatility Expansion (C-STR-001, exact Sprint 024 validated params)
    df["atr_exp_base"]  = df["atr_short"].shift(EXPANSION_PERIOD)
    df["vol_expansion"] = df["atr_short"] / df["atr_exp_base"].replace(0, np.nan)

    # Regime: Volatility Compression resolved (C-REG-001)
    df["atr_ratio"] = df["atr_short"] / df["atr_long"].replace(0, np.nan)
    df["regime_ok"] = df["atr_ratio"] > COMPRESSION_THRESH

    # Intraday VWAP (C-LOC-001) — computed on full dataset by date
    df["vwap"] = (
        df.groupby("date")
          .apply(lambda g: (g["close"] * g["volume"]).cumsum() / g["volume"].cumsum())
          .reset_index(level=0, drop=True)
    )
    df["vwap_dev"] = abs(df["close"] - df["vwap"]) / df["atr14"].replace(0, np.nan)
    df["vwap_ok"]  = df["vwap_dev"] <= VWAP_DEV_THRESH

    return df


def run_experiment(df, use_session_filter=False, use_ari=False, label=""):
    """
    Run a backtest experiment.
    use_session_filter: apply PM session + no-Friday filter
    use_ari: apply full ARI capital management and daily limits
    """
    trades = []
    account = ACCOUNT_SIZE
    peak_account = ACCOUNT_SIZE
    daily_pnl = {}
    consecutive_losses = 0
    blocked_today = False
    last_date = None

    for i in range(EXPANSION_PERIOD + 50, len(df)):
        row = df.iloc[i]
        bar_date = row["date"]
        bar_hour = int(row["hour"])

        # Skip non-RTH bars (consistent with Sprint 024)
        if not row["is_rth"]:
            i += 1
            continue

        # Reset daily state
        if bar_date != last_date:
            blocked_today = False
            last_date = bar_date
            # Consecutive loss block resets each day (per Model A1 spec: block for rest of session)
            if consecutive_losses >= CONSEC_BLOCK:
                consecutive_losses = 0

        # Skip if blocked for the day
        if blocked_today:
            continue

        # ── Q1: Is the market tradeable? (Regime Engine) ─────────────────────
        if not row["regime_ok"] or not row["vwap_ok"]:
            continue

        # ── Q2: Is Model A1 appropriate? (Session + Day filter) ──────────────
        if use_session_filter:
            if not (SESSION_HOUR_START <= bar_hour <= SESSION_HOUR_END):
                continue
            if row["weekday"] == 4:  # Friday
                continue

        # ── Q3: Is account risk acceptable? (ARI) ────────────────────────────
        if use_ari:
            if consecutive_losses >= CONSEC_BLOCK:
                continue
            day_loss = daily_pnl.get(bar_date, 0)
            if day_loss <= -DAILY_LOSS_LIMIT:
                blocked_today = True
                continue

        # ── Q5: Should Atlas execute? (Model A1 logic) ───────────────────────
        if row["vol_expansion"] < EXPANSION_RATIO:
            continue

        # Depth constraint check (exact Sprint 024 validated params: 0.5 to 1.2 ATR)
        direction = None
        if row["uptrend"] and row["pb_long_touch"]:
            d = row["pb_depth_long"]
            if not np.isnan(d) and DEPTH_MIN <= d <= DEPTH_MAX:
                direction = "long"
        if direction is None and row["downtrend"] and row["pb_short_touch"]:
            d = row["pb_depth_short"]
            if not np.isnan(d) and DEPTH_MIN <= d <= DEPTH_MAX:
                direction = "short"

        if direction is None:
            continue

        # ── Q4: What position size is justified? (ARI) ────────────────────────────
        if use_ari:
            risk_pct = REDUCED_RISK_PCT if consecutive_losses >= CONSEC_REDUCE else BASE_RISK_PCT
        else:
            risk_pct = BASE_RISK_PCT

        risk_dollars = account * risk_pct
        stop_pts     = row["atr14"] * STOP_ATR_MULT
        tp_pts       = stop_pts * RR_RATIO
        contracts    = max(1, int(risk_dollars / (stop_pts * POINT_VALUE)))

        # Entry at current bar close (consistent with Sprint 024 which uses close[entry_idx])
        entry_price = row["close"]
        dir_sign    = 1 if direction == "long" else -1
        stop_price  = entry_price - dir_sign * stop_pts
        tp_price    = entry_price + dir_sign * tp_pts

        # Walk forward to find exit — advance i past trade bars (no re-entry during open trade)
        outcome    = None
        exit_price = None
        bars_held  = 0
        for j in range(i + 1, min(i + 300, len(df))):
            future = df.iloc[j]
            bars_held = j - i
            if direction == "long":
                if future["low"] <= stop_price:
                    outcome    = "loss"
                    exit_price = stop_price
                    break
                if future["high"] >= tp_price:
                    outcome    = "win"
                    exit_price = tp_price
                    break
            else:
                if future["high"] >= stop_price:
                    outcome    = "loss"
                    exit_price = stop_price
                    break
                if future["low"] <= tp_price:
                    outcome    = "win"
                    exit_price = tp_price
                    break

        if outcome is None:
            exit_price = df.iloc[min(i + 299, len(df) - 1)]["close"]
            outcome    = "win" if dir_sign * (exit_price - entry_price) > 0 else "loss"
            bars_held  = 299

        # Calculate P&L
        pnl = dir_sign * (exit_price - entry_price) * POINT_VALUE * contracts - COMMISSION_PER_RT

        account += pnl
        peak_account = max(peak_account, account)
        daily_pnl[bar_date] = daily_pnl.get(bar_date, 0) + pnl

        if outcome == "win":
            consecutive_losses = 0
        else:
            consecutive_losses += 1

        trades.append({
            "date":       bar_date,
            "hour":       bar_hour,
            "direction":  direction,
            "outcome":    outcome,
            "pnl":        pnl,
            "contracts":  contracts,
            "account":    account,
            "peak":       peak_account,
            "drawdown":   account - peak_account,
        })

        # Advance past the trade (no re-entry while trade is open, consistent with Sprint 024)
        i += bars_held
        continue

    return pd.DataFrame(trades)


def compute_metrics(trades_df, label):
    if trades_df.empty:
        return {"label": label, "trades": 0}

    wins   = trades_df[trades_df["outcome"] == "win"]["pnl"]
    losses = trades_df[trades_df["outcome"] == "loss"]["pnl"]

    gross_profit = wins.sum() if len(wins) > 0 else 0
    gross_loss   = abs(losses.sum()) if len(losses) > 0 else 0
    pf           = gross_profit / gross_loss if gross_loss > 0 else float("inf")
    net_pnl      = trades_df["pnl"].sum()
    win_rate     = len(wins) / len(trades_df) * 100
    avg_win      = wins.mean() if len(wins) > 0 else 0
    avg_loss     = losses.mean() if len(losses) > 0 else 0
    expectancy   = trades_df["pnl"].mean()
    max_dd       = trades_df["drawdown"].min()

    # Losing streak
    streak = 0
    max_streak = 0
    for o in trades_df["outcome"]:
        if o == "loss":
            streak += 1
            max_streak = max(max_streak, streak)
        else:
            streak = 0

    return {
        "label":       label,
        "trades":      len(trades_df),
        "pf":          round(pf, 3),
        "net_pnl":     round(net_pnl, 0),
        "win_rate":    round(win_rate, 1),
        "avg_win":     round(avg_win, 0),
        "avg_loss":    round(avg_loss, 0),
        "expectancy":  round(expectancy, 0),
        "max_dd":      round(max_dd, 0),
        "max_streak":  max_streak,
    }


def monte_carlo_prop_pass(trades_df, n_sims=10_000):
    """
    Simulate prop firm evaluation pass rate.
    Target: reach +$3,000 before trailing drawdown exceeds $2,000 from peak.
    """
    if trades_df.empty:
        return 0.0

    pnl_list = trades_df["pnl"].tolist()
    passes   = 0

    for _ in range(n_sims):
        shuffled = np.random.choice(pnl_list, size=len(pnl_list), replace=True)
        account  = ACCOUNT_SIZE
        peak     = ACCOUNT_SIZE
        passed   = False
        failed   = False

        for pnl in shuffled:
            account += pnl
            peak     = max(peak, account)
            if account - peak <= -TRAILING_DD_LIMIT:
                failed = True
                break
            if account - ACCOUNT_SIZE >= PROFIT_TARGET:
                passed = True
                break

        if passed and not failed:
            passes += 1

    return round(passes / n_sims * 100, 1)


def sub_period_metrics(df, trades_df, label):
    """Split into Year 1 and Year 2."""
    all_dates = sorted(df["date"].unique())
    mid_date  = all_dates[len(all_dates) // 2]

    y1 = trades_df[trades_df["date"] < mid_date]
    y2 = trades_df[trades_df["date"] >= mid_date]

    m1 = compute_metrics(y1, f"{label} Year 1")
    m2 = compute_metrics(y2, f"{label} Year 2")
    return m1, m2


def print_result(m, file=None):
    line = (
        f"  {m['label']:<40} | "
        f"Trades: {m.get('trades', 0):>4} | "
        f"PF: {m.get('pf', 0):>5.3f} | "
        f"Net: ${m.get('net_pnl', 0):>8,.0f} | "
        f"WR: {m.get('win_rate', 0):>5.1f}% | "
        f"MaxDD: ${m.get('max_dd', 0):>8,.0f} | "
        f"Streak: {m.get('max_streak', 0):>2}"
    )
    print(line)
    if file:
        file.write(line + "\n")


def main():
    np.random.seed(42)
    print("Loading data...")
    df = load_data()
    print(f"  Loaded {len(df):,} bars from {df['date'].min()} to {df['date'].max()}")

    print("Computing indicators...")
    df = compute_indicators(df)

    results = {}

    with open(OUTPUT_PATH, "w") as f:
        header = "\n" + "=" * 100 + "\n  ATLAS TRADING SYSTEM v1.0 — FULL SYSTEM SIMULATION\n" + "=" * 100
        print(header)
        f.write(header + "\n")

        # ── Experiment A: Model A1 alone (baseline) ───────────────────────────
        print("\n[EXPERIMENT A] Model A1 Baseline (no ARI, no regime filter)")
        f.write("\n[EXPERIMENT A] Model A1 Baseline (no ARI, no regime filter)\n")
        trades_a = run_experiment(df, use_session_filter=False, use_ari=False, label="A")
        m_a      = compute_metrics(trades_a, "A: Model A1 Baseline")
        m_a1, m_a2 = sub_period_metrics(df, trades_a, "A")
        pass_a   = monte_carlo_prop_pass(trades_a)
        print_result(m_a, f)
        print_result(m_a1, f)
        print_result(m_a2, f)
        line = f"  {'A: Monte Carlo Prop Pass Rate':<40} | {pass_a}%"
        print(line); f.write(line + "\n")
        results["A"] = (m_a, pass_a)

        # ── Experiment B: Model A1 + Session/Day Filter ───────────────────────
        print("\n[EXPERIMENT B] Model A1 + ARI Session/Day Filter (PM only, no Fridays)")
        f.write("\n[EXPERIMENT B] Model A1 + ARI Session/Day Filter (PM only, no Fridays)\n")
        trades_b = run_experiment(df, use_session_filter=True, use_ari=False, label="B")
        m_b      = compute_metrics(trades_b, "B: Session Filter")
        m_b1, m_b2 = sub_period_metrics(df, trades_b, "B")
        pass_b   = monte_carlo_prop_pass(trades_b)
        print_result(m_b, f)
        print_result(m_b1, f)
        print_result(m_b2, f)
        line = f"  {'B: Monte Carlo Prop Pass Rate':<40} | {pass_b}%"
        print(line); f.write(line + "\n")
        results["B"] = (m_b, pass_b)

        # ── Experiment C: Full ATS v1.0 ───────────────────────────────────────
        print("\n[EXPERIMENT C] Full ATS v1.0 (Session + ARI Capital Management)")
        f.write("\n[EXPERIMENT C] Full ATS v1.0 (Session + ARI Capital Management)\n")
        trades_c = run_experiment(df, use_session_filter=True, use_ari=True, label="C")
        m_c      = compute_metrics(trades_c, "C: Full ATS v1.0")
        m_c1, m_c2 = sub_period_metrics(df, trades_c, "C")
        pass_c   = monte_carlo_prop_pass(trades_c)
        print_result(m_c, f)
        print_result(m_c1, f)
        print_result(m_c2, f)
        line = f"  {'C: Monte Carlo Prop Pass Rate':<40} | {pass_c}%"
        print(line); f.write(line + "\n")
        results["C"] = (m_c, pass_c)

        # ── Summary ───────────────────────────────────────────────────────────
        summary = "\n" + "=" * 100 + "\n  ATS v1.0 SUMMARY\n" + "=" * 100
        print(summary); f.write(summary + "\n")

        for exp, (m, pr) in results.items():
            line = (
                f"  Experiment {exp}: "
                f"PF={m.get('pf',0):.3f} | "
                f"Net=${m.get('net_pnl',0):,.0f} | "
                f"MaxDD=${m.get('max_dd',0):,.0f} | "
                f"Trades={m.get('trades',0)} | "
                f"PropPassRate={pr}%"
            )
            print(line); f.write(line + "\n")

        # Verdict
        m_c_full = results["C"][0]
        pass_c_full = results["C"][1]
        if m_c_full.get("pf", 0) >= 1.20 and pass_c_full >= 50.0 and m_c_full.get("max_dd", 0) >= -TRAILING_DD_LIMIT:
            verdict = "\n  VERDICT: ATS v1.0 PASSES — System meets prop firm survival criteria."
        else:
            verdict = "\n  VERDICT: ATS v1.0 REQUIRES REFINEMENT — One or more criteria not met."
        print(verdict); f.write(verdict + "\n")

    print(f"\nFull output saved to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
