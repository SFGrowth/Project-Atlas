#!/usr/bin/env python3
"""
Atlas Nexus — Strategy Backtests (Historical Databento Data)
Sprint 123A.6 / Gate G6A — Phase 8

Runs all existing Atlas strategies against the canonical 5m dataset:
  A1: EMA15 Trend Continuation
  A3: EMA15 Pullback Entry
  B1: VWAP Reclaim
  SB1: Session Breakout
  ORB-1: Opening Range Breakout

Cost model (Apex 50K prop account):
  - Slippage: 1 tick per side (0.25 pts = $0.50/contract)
  - Commission: $0.50/contract/side (NinjaTrader + Apex)
  - Total round-trip cost: 2 ticks + 2 × commission = $0.50 + $1.00 = $1.50/contract
  - MNQ point value: $2.00/point
  - Max risk per trade: $450 (Apex 50K)
  - Position size: 1 contract (standard for all strategies)

Train/Validation/Test split:
  - Train: 2024-01-01 to 2024-12-31 (12 months)
  - Validation: 2025-01-01 to 2025-06-30 (6 months)
  - Test (OOS): 2025-07-01 to 2026-07-21 (12 months)

No strategy parameters are tuned on test data.
"""

import pandas as pd
import numpy as np
import json
from pathlib import Path
from datetime import datetime, timezone
from dataclasses import dataclass, field, asdict
from typing import Optional

CANONICAL_DIR = Path("/home/ubuntu/atlas-historical/canonical")
RESULTS_DIR = Path("/home/ubuntu/atlas-historical/backtest_results")

# Cost model
SLIPPAGE_PTS = 0.50   # 2 ticks per round trip
COMMISSION_PTS = 0.50  # $1.00 round trip / $2.00 per point = 0.50 pts
TOTAL_COST_PTS = SLIPPAGE_PTS + COMMISSION_PTS  # 1.0 pts per round trip
POINT_VALUE = 2.0     # $2.00 per MNQ point
MAX_RISK_PTS = 225.0  # $450 / $2.00 = 225 pts

# Train/Val/Test splits
TRAIN_END = pd.Timestamp("2024-12-31 23:59:59", tz="UTC")
VAL_END = pd.Timestamp("2025-06-30 23:59:59", tz="UTC")
TEST_START = pd.Timestamp("2025-07-01 00:00:00", tz="UTC")


@dataclass
class Trade:
    entry_time: pd.Timestamp
    exit_time: Optional[pd.Timestamp]
    direction: str  # LONG or SHORT
    entry_price: float
    exit_price: float = 0.0
    stop_price: float = 0.0
    target_price: float = 0.0
    pnl_pts: float = 0.0
    pnl_usd: float = 0.0
    exit_reason: str = ""
    strategy: str = ""
    period: str = ""  # TRAIN, VAL, TEST


def compute_trade_pnl(entry: float, exit_price: float, direction: str) -> float:
    """Compute P&L in points, net of costs."""
    if direction == "LONG":
        gross = exit_price - entry
    else:
        gross = entry - exit_price
    return gross - TOTAL_COST_PTS


def compute_metrics(trades: list) -> dict:
    """Compute performance metrics from a list of trades."""
    if not trades:
        return {"n_trades": 0, "win_rate": 0, "expectancy_pts": 0, "total_pnl_pts": 0,
                "total_pnl_usd": 0, "max_drawdown_usd": 0, "sharpe": 0, "profit_factor": 0}

    pnls = [t.pnl_pts for t in trades]
    pnl_usd = [t.pnl_usd for t in trades]
    
    n = len(pnls)
    wins = [p for p in pnls if p > 0]
    losses = [p for p in pnls if p <= 0]
    
    win_rate = len(wins) / n if n > 0 else 0
    avg_win = np.mean(wins) if wins else 0
    avg_loss = np.mean(losses) if losses else 0
    expectancy = win_rate * avg_win + (1 - win_rate) * avg_loss
    
    # Drawdown
    cumulative = np.cumsum(pnl_usd)
    running_max = np.maximum.accumulate(cumulative)
    drawdown = running_max - cumulative
    max_dd = float(drawdown.max()) if len(drawdown) > 0 else 0
    
    # Sharpe (annualised, assuming ~250 trading days, ~5 trades/day)
    if len(pnl_usd) > 1 and np.std(pnl_usd) > 0:
        sharpe = (np.mean(pnl_usd) / np.std(pnl_usd)) * np.sqrt(252 * 5)
    else:
        sharpe = 0
    
    # Profit factor
    gross_profit = sum(p for p in pnl_usd if p > 0)
    gross_loss = abs(sum(p for p in pnl_usd if p < 0))
    profit_factor = gross_profit / gross_loss if gross_loss > 0 else float("inf")
    
    return {
        "n_trades": n,
        "win_rate": round(win_rate, 4),
        "avg_win_pts": round(avg_win, 2),
        "avg_loss_pts": round(avg_loss, 2),
        "expectancy_pts": round(expectancy, 4),
        "total_pnl_pts": round(sum(pnls), 2),
        "total_pnl_usd": round(sum(pnl_usd), 2),
        "max_drawdown_usd": round(max_dd, 2),
        "sharpe": round(sharpe, 3),
        "profit_factor": round(profit_factor, 3),
        "gross_profit_usd": round(gross_profit, 2),
        "gross_loss_usd": round(gross_loss, 2),
    }


def assign_period(bar_time: pd.Timestamp) -> str:
    if bar_time <= TRAIN_END:
        return "TRAIN"
    elif bar_time <= VAL_END:
        return "VAL"
    else:
        return "TEST"


# ============================================================
# STRATEGY A1: EMA15 Trend Continuation
# Entry: Close crosses above/below EMA15 in TREND regime (ADX>25)
# Stop: 1.5 × ATR14 below/above entry
# Target: 3 × ATR14 (2R)
# Filter: EMA bullish/bearish alignment
# ============================================================
def run_a1(df: pd.DataFrame) -> list:
    trades = []
    in_trade = False
    entry_price = 0.0
    stop_price = 0.0
    target_price = 0.0
    direction = ""
    entry_time = None

    for i in range(1, len(df)):
        row = df.iloc[i]
        prev = df.iloc[i - 1]

        if pd.isna(row.ema15) or pd.isna(row.atr14) or pd.isna(row.adx14):
            continue

        # Exit logic
        if in_trade:
            exit_price = None
            exit_reason = ""

            if direction == "LONG":
                if row.low <= stop_price:
                    exit_price = stop_price
                    exit_reason = "STOP"
                elif row.high >= target_price:
                    exit_price = target_price
                    exit_reason = "TARGET"
            else:
                if row.high >= stop_price:
                    exit_price = stop_price
                    exit_reason = "STOP"
                elif row.low <= target_price:
                    exit_price = target_price
                    exit_reason = "TARGET"

            if exit_price is not None:
                pnl_pts = compute_trade_pnl(entry_price, exit_price, direction)
                t = Trade(
                    entry_time=entry_time,
                    exit_time=row.bar_time,
                    direction=direction,
                    entry_price=entry_price,
                    exit_price=exit_price,
                    stop_price=stop_price,
                    target_price=target_price,
                    pnl_pts=pnl_pts,
                    pnl_usd=pnl_pts * POINT_VALUE,
                    exit_reason=exit_reason,
                    strategy="A1",
                    period=assign_period(entry_time),
                )
                trades.append(t)
                in_trade = False
            continue

        # Entry logic
        if row.regime != "TREND" or row.adx14 < 25:
            continue

        # NY session only
        if row.session not in ("NY",):
            continue

        # LONG: close crosses above EMA15, bullish alignment
        if (prev.close <= prev.ema15 and row.close > row.ema15 and
                row.ema_bullish and row.atr14 > 0):
            entry_price = row.close
            stop_price = entry_price - 1.5 * row.atr14
            target_price = entry_price + 3.0 * row.atr14
            # Risk check
            risk_pts = entry_price - stop_price
            if risk_pts > MAX_RISK_PTS:
                continue
            direction = "LONG"
            entry_time = row.bar_time
            in_trade = True

        # SHORT: close crosses below EMA15, bearish alignment
        elif (prev.close >= prev.ema15 and row.close < row.ema15 and
              row.ema_bearish and row.atr14 > 0):
            entry_price = row.close
            stop_price = entry_price + 1.5 * row.atr14
            target_price = entry_price - 3.0 * row.atr14
            risk_pts = stop_price - entry_price
            if risk_pts > MAX_RISK_PTS:
                continue
            direction = "SHORT"
            entry_time = row.bar_time
            in_trade = True

    return trades


# ============================================================
# STRATEGY A3: EMA15 Pullback Entry
# Entry: Price pulls back to EMA15 in TREND regime
# Stop: 1.0 × ATR14
# Target: 2.0 × ATR14
# ============================================================
def run_a3(df: pd.DataFrame) -> list:
    trades = []
    in_trade = False
    entry_price = 0.0
    stop_price = 0.0
    target_price = 0.0
    direction = ""
    entry_time = None

    for i in range(2, len(df)):
        row = df.iloc[i]
        prev = df.iloc[i - 1]
        prev2 = df.iloc[i - 2]

        if pd.isna(row.ema15) or pd.isna(row.atr14) or pd.isna(row.adx14):
            continue

        if in_trade:
            exit_price = None
            exit_reason = ""
            if direction == "LONG":
                if row.low <= stop_price:
                    exit_price = stop_price
                    exit_reason = "STOP"
                elif row.high >= target_price:
                    exit_price = target_price
                    exit_reason = "TARGET"
            else:
                if row.high >= stop_price:
                    exit_price = stop_price
                    exit_reason = "STOP"
                elif row.low <= target_price:
                    exit_price = target_price
                    exit_reason = "TARGET"

            if exit_price is not None:
                pnl_pts = compute_trade_pnl(entry_price, exit_price, direction)
                trades.append(Trade(
                    entry_time=entry_time, exit_time=row.bar_time,
                    direction=direction, entry_price=entry_price,
                    exit_price=exit_price, stop_price=stop_price,
                    target_price=target_price, pnl_pts=pnl_pts,
                    pnl_usd=pnl_pts * POINT_VALUE, exit_reason=exit_reason,
                    strategy="A3", period=assign_period(entry_time),
                ))
                in_trade = False
            continue

        if row.regime != "TREND" or row.session not in ("NY",):
            continue

        # LONG pullback: prior bar touched EMA15 from above, now bouncing
        if (row.ema_bullish and
                prev.low <= prev.ema15 and row.close > row.ema15 and
                row.close > prev.close and row.atr14 > 0):
            entry_price = row.close
            stop_price = row.ema15 - 1.0 * row.atr14
            target_price = entry_price + 2.0 * row.atr14
            risk_pts = entry_price - stop_price
            if risk_pts > MAX_RISK_PTS or risk_pts <= 0:
                continue
            direction = "LONG"
            entry_time = row.bar_time
            in_trade = True

        elif (row.ema_bearish and
              prev.high >= prev.ema15 and row.close < row.ema15 and
              row.close < prev.close and row.atr14 > 0):
            entry_price = row.close
            stop_price = row.ema15 + 1.0 * row.atr14
            target_price = entry_price - 2.0 * row.atr14
            risk_pts = stop_price - entry_price
            if risk_pts > MAX_RISK_PTS or risk_pts <= 0:
                continue
            direction = "SHORT"
            entry_time = row.bar_time
            in_trade = True

    return trades


# ============================================================
# STRATEGY B1: VWAP Reclaim
# Entry: Price reclaims VWAP after sweeping below/above
# Stop: 1.0 × ATR14
# Target: 1.5 × ATR14
# ============================================================
def run_b1(df: pd.DataFrame) -> list:
    trades = []
    in_trade = False
    entry_price = 0.0
    stop_price = 0.0
    target_price = 0.0
    direction = ""
    entry_time = None

    for i in range(1, len(df)):
        row = df.iloc[i]
        prev = df.iloc[i - 1]

        if pd.isna(row.vwap) or pd.isna(row.atr14):
            continue

        if in_trade:
            exit_price = None
            exit_reason = ""
            if direction == "LONG":
                if row.low <= stop_price:
                    exit_price = stop_price
                    exit_reason = "STOP"
                elif row.high >= target_price:
                    exit_price = target_price
                    exit_reason = "TARGET"
            else:
                if row.high >= stop_price:
                    exit_price = stop_price
                    exit_reason = "STOP"
                elif row.low <= target_price:
                    exit_price = target_price
                    exit_reason = "TARGET"

            if exit_price is not None:
                pnl_pts = compute_trade_pnl(entry_price, exit_price, direction)
                trades.append(Trade(
                    entry_time=entry_time, exit_time=row.bar_time,
                    direction=direction, entry_price=entry_price,
                    exit_price=exit_price, stop_price=stop_price,
                    target_price=target_price, pnl_pts=pnl_pts,
                    pnl_usd=pnl_pts * POINT_VALUE, exit_reason=exit_reason,
                    strategy="B1", period=assign_period(entry_time),
                ))
                in_trade = False
            continue

        if row.session not in ("NY", "LONDON"):
            continue

        # LONG: prev bar closed below VWAP, current bar reclaims VWAP
        if (prev.close < prev.vwap and row.close > row.vwap and row.atr14 > 0):
            entry_price = row.close
            stop_price = entry_price - 1.0 * row.atr14
            target_price = entry_price + 1.5 * row.atr14
            risk_pts = entry_price - stop_price
            if risk_pts > MAX_RISK_PTS or risk_pts <= 0:
                continue
            direction = "LONG"
            entry_time = row.bar_time
            in_trade = True

        elif (prev.close > prev.vwap and row.close < row.vwap and row.atr14 > 0):
            entry_price = row.close
            stop_price = entry_price + 1.0 * row.atr14
            target_price = entry_price - 1.5 * row.atr14
            risk_pts = stop_price - entry_price
            if risk_pts > MAX_RISK_PTS or risk_pts <= 0:
                continue
            direction = "SHORT"
            entry_time = row.bar_time
            in_trade = True

    return trades


# ============================================================
# STRATEGY SB1: Session Breakout
# Entry: Break of prior session high/low in NY open
# Stop: 0.5 × ATR14
# Target: 2.0 × ATR14
# ============================================================
def run_sb1(df: pd.DataFrame) -> list:
    trades = []
    in_trade = False
    entry_price = 0.0
    stop_price = 0.0
    target_price = 0.0
    direction = ""
    entry_time = None

    # Compute prior session high/low (rolling 24-bar high/low as proxy for prior session range)
    df = df.copy()
    df["prior_high"] = df["high"].rolling(24, min_periods=12).max().shift(1)
    df["prior_low"] = df["low"].rolling(24, min_periods=12).min().shift(1)

    for i in range(1, len(df)):
        row = df.iloc[i]
        prev = df.iloc[i - 1]

        if pd.isna(row.atr14) or pd.isna(row.prior_high) or pd.isna(row.prior_low):
            continue

        if in_trade:
            exit_price = None
            exit_reason = ""
            if direction == "LONG":
                if row.low <= stop_price:
                    exit_price = stop_price
                    exit_reason = "STOP"
                elif row.high >= target_price:
                    exit_price = target_price
                    exit_reason = "TARGET"
            else:
                if row.high >= stop_price:
                    exit_price = stop_price
                    exit_reason = "STOP"
                elif row.low <= target_price:
                    exit_price = target_price
                    exit_reason = "TARGET"

            if exit_price is not None:
                pnl_pts = compute_trade_pnl(entry_price, exit_price, direction)
                trades.append(Trade(
                    entry_time=entry_time, exit_time=row.bar_time,
                    direction=direction, entry_price=entry_price,
                    exit_price=exit_price, stop_price=stop_price,
                    target_price=target_price, pnl_pts=pnl_pts,
                    pnl_usd=pnl_pts * POINT_VALUE, exit_reason=exit_reason,
                    strategy="SB1", period=assign_period(entry_time),
                ))
                in_trade = False
            continue

        # NY session open only (13:30-15:00 UTC)
        if not (row.session == "NY" and 13 <= row.hour_utc <= 15):
            continue

        if row.close > row.prior_high and row.atr14 > 0:
            entry_price = row.close
            stop_price = entry_price - 0.5 * row.atr14
            target_price = entry_price + 2.0 * row.atr14
            risk_pts = entry_price - stop_price
            if risk_pts > MAX_RISK_PTS or risk_pts <= 0:
                continue
            direction = "LONG"
            entry_time = row.bar_time
            in_trade = True

        elif row.close < row.prior_low and row.atr14 > 0:
            entry_price = row.close
            stop_price = entry_price + 0.5 * row.atr14
            target_price = entry_price - 2.0 * row.atr14
            risk_pts = stop_price - entry_price
            if risk_pts > MAX_RISK_PTS or risk_pts <= 0:
                continue
            direction = "SHORT"
            entry_time = row.bar_time
            in_trade = True

    return trades


# ============================================================
# STRATEGY ORB-1: Opening Range Breakout
# Entry: Break of first 30-minute range after NY open
# Stop: Range midpoint
# Target: 1.5 × range
# ============================================================
def run_orb1(df: pd.DataFrame) -> list:
    trades = []
    in_trade = False
    entry_price = 0.0
    stop_price = 0.0
    target_price = 0.0
    direction = ""
    entry_time = None

    # Compute ORB range: high/low of first 6 bars after 13:30 UTC each day
    df = df.copy()
    df["date"] = df["bar_time"].dt.date

    orb_ranges = {}
    for date, group in df.groupby("date"):
        ny_bars = group[(group["hour_utc"] == 13) & (group["bar_time"].dt.minute >= 30) |
                        (group["hour_utc"] == 14) & (group["bar_time"].dt.minute < 30)]
        if len(ny_bars) >= 3:
            orb_ranges[date] = {
                "high": ny_bars["high"].max(),
                "low": ny_bars["low"].min(),
            }

    for i in range(1, len(df)):
        row = df.iloc[i]
        date = row.bar_time.date()

        if pd.isna(row.atr14):
            continue

        if date not in orb_ranges:
            continue

        orb_high = orb_ranges[date]["high"]
        orb_low = orb_ranges[date]["low"]
        orb_range = orb_high - orb_low

        if orb_range <= 0:
            continue

        if in_trade:
            exit_price = None
            exit_reason = ""
            if direction == "LONG":
                if row.low <= stop_price:
                    exit_price = stop_price
                    exit_reason = "STOP"
                elif row.high >= target_price:
                    exit_price = target_price
                    exit_reason = "TARGET"
            else:
                if row.high >= stop_price:
                    exit_price = stop_price
                    exit_reason = "STOP"
                elif row.low <= target_price:
                    exit_price = target_price
                    exit_reason = "TARGET"

            if exit_price is not None:
                pnl_pts = compute_trade_pnl(entry_price, exit_price, direction)
                trades.append(Trade(
                    entry_time=entry_time, exit_time=row.bar_time,
                    direction=direction, entry_price=entry_price,
                    exit_price=exit_price, stop_price=stop_price,
                    target_price=target_price, pnl_pts=pnl_pts,
                    pnl_usd=pnl_pts * POINT_VALUE, exit_reason=exit_reason,
                    strategy="ORB-1", period=assign_period(entry_time),
                ))
                in_trade = False
            continue

        # Only trade after ORB formation (after 14:00 UTC)
        if row.hour_utc < 14:
            continue

        # Only trade until 18:00 UTC
        if row.hour_utc >= 18:
            continue

        if row.close > orb_high:
            entry_price = row.close
            stop_price = orb_high - orb_range * 0.5
            target_price = entry_price + orb_range * 1.5
            risk_pts = entry_price - stop_price
            if risk_pts > MAX_RISK_PTS or risk_pts <= 0:
                continue
            direction = "LONG"
            entry_time = row.bar_time
            in_trade = True

        elif row.close < orb_low:
            entry_price = row.close
            stop_price = orb_low + orb_range * 0.5
            target_price = entry_price - orb_range * 1.5
            risk_pts = stop_price - entry_price
            if risk_pts > MAX_RISK_PTS or risk_pts <= 0:
                continue
            direction = "SHORT"
            entry_time = row.bar_time
            in_trade = True

    return trades


def main():
    print("=" * 70)
    print("ATLAS NEXUS — STRATEGY BACKTESTS (Historical Databento Data)")
    print(f"Run time: {datetime.now(timezone.utc).isoformat()}")
    print("=" * 70)

    RESULTS_DIR.mkdir(parents=True, exist_ok=True)

    # Load 5m canonical dataset
    print("\nLoading 5m canonical dataset...")
    df = pd.read_parquet(CANONICAL_DIR / "mnq_5m_features.parquet")
    df["bar_time"] = pd.to_datetime(df["bar_time"], utc=True)
    print(f"  Loaded {len(df):,} bars ({df['bar_time'].min()} to {df['bar_time'].max()})")

    strategies = {
        "A1": run_a1,
        "A3": run_a3,
        "B1": run_b1,
        "SB1": run_sb1,
        "ORB-1": run_orb1,
    }

    all_results = {}

    for name, func in strategies.items():
        print(f"\n{'='*50}")
        print(f"Running {name}...")
        trades = func(df)
        print(f"  Total trades: {len(trades)}")

        # Split by period
        train_trades = [t for t in trades if t.period == "TRAIN"]
        val_trades = [t for t in trades if t.period == "VAL"]
        test_trades = [t for t in trades if t.period == "TEST"]

        train_metrics = compute_metrics(train_trades)
        val_metrics = compute_metrics(val_trades)
        test_metrics = compute_metrics(test_trades)
        all_metrics = compute_metrics(trades)

        print(f"  TRAIN ({len(train_trades)} trades): WR={train_metrics['win_rate']:.1%} | Exp={train_metrics['expectancy_pts']:.2f}pts | P&L=${train_metrics['total_pnl_usd']:,.0f}")
        print(f"  VAL   ({len(val_trades)} trades): WR={val_metrics['win_rate']:.1%} | Exp={val_metrics['expectancy_pts']:.2f}pts | P&L=${val_metrics['total_pnl_usd']:,.0f}")
        print(f"  TEST  ({len(test_trades)} trades): WR={test_metrics['win_rate']:.1%} | Exp={test_metrics['expectancy_pts']:.2f}pts | P&L=${test_metrics['total_pnl_usd']:,.0f}")
        print(f"  ALL   ({len(trades)} trades): Sharpe={all_metrics['sharpe']:.2f} | MaxDD=${all_metrics['max_drawdown_usd']:,.0f} | PF={all_metrics['profit_factor']:.2f}")

        all_results[name] = {
            "strategy": name,
            "total_trades": len(trades),
            "train": {**train_metrics, "n_trades": len(train_trades)},
            "validation": {**val_metrics, "n_trades": len(val_trades)},
            "test_oos": {**test_metrics, "n_trades": len(test_trades)},
            "all_periods": all_metrics,
        }

        # Save trade log
        if trades:
            trades_df = pd.DataFrame([asdict(t) for t in trades])
            trades_df.to_parquet(RESULTS_DIR / f"{name}_trades.parquet", index=False)

    # Save summary
    summary = {
        "created_at": datetime.now(timezone.utc).isoformat(),
        "dataset": "mnq_5m_features.parquet",
        "date_range": "2024-01-01 to 2026-07-21",
        "cost_model": {
            "slippage_pts": SLIPPAGE_PTS,
            "commission_pts": COMMISSION_PTS,
            "total_cost_pts": TOTAL_COST_PTS,
            "point_value_usd": POINT_VALUE,
            "max_risk_pts": MAX_RISK_PTS,
        },
        "train_period": "2024-01-01 to 2024-12-31",
        "validation_period": "2025-01-01 to 2025-06-30",
        "test_period": "2025-07-01 to 2026-07-21",
        "strategies": all_results,
    }

    summary_path = RESULTS_DIR / "backtest_summary.json"
    with open(summary_path, "w") as f:
        json.dump(summary, f, indent=2, default=str)

    print("\n" + "=" * 70)
    print("BACKTEST COMPLETE")
    print(f"Results: {summary_path}")
    print("=" * 70)

    return summary


if __name__ == "__main__":
    result = main()
    print(json.dumps(result, indent=2, default=str))
