"""
Canonical Strategy Backtests — Sprint 123A.7
Fidelity: CORRECTED to match atlas_portfolio_v1.pine (SHA: d40b6e112f168692202af8fc8dbcc0464b1464c10b8b563c70625e2f0bf5ddfb)

Key corrections from Sprint 123A.6 (DIVERGENT) runners:
1. A1/A3: Entry uses DMI (DI+/DI-), not EMA15 crossover
2. A3: Only fires when A1 is disabled (ADE score = ADX * 0.95 < A1 score = ADX)
3. SB1: Entry uses EMA9 slope, not breakout; AM Mid session only (1000-1100 NY)
4. ORB-1: Entry uses volatile-bar direction (close vs open), not ORB formation window
5. B1: Entry uses VWAP direction; fallback-only (fires when all others ineligible)
6. Commission: $0.62/contract (Pine canonical), not $2.00/round-trip
7. ADE selection: single-active-strategy portfolio, not independent runners
8. Roll-window policy: roll-excluded results are primary
"""

import json
import hashlib
import sys
from datetime import datetime, date
from pathlib import Path
import numpy as np
import pandas as pd

# Import roll-window policy
sys.path.insert(0, str(Path(__file__).parent))
from roll_window_policy import apply_roll_flags, split_roll_excluded, assert_dataset_approved

# ============================================================
# CONSTANTS (from Pine Script canonical)
# ============================================================

COMMISSION_PER_CONTRACT = 0.62  # Pine: strategy.commission.cash_per_contract
TICK_VALUE = 0.50               # MNQ tick value ($)
TICK_SIZE = 0.25                # MNQ tick size (pts)
MAX_RISK_PER_TRADE = 450.0      # Apex 50K default ($)
ADX_THRESHOLD = 25.0            # isTrending threshold
ATR_VOLATILE_MULT = 1.2         # isVolatile: atr > sma(atr,20) * 1.2
ATR_VOLATILE_WINDOW = 20        # SMA window for volatile regime

# Session times (NY Eastern, 24h format)
RTH_START = "09:30"
RTH_END = "16:00"
AM_OPEN_START = "09:30"
AM_OPEN_END = "10:00"
AM_MID_START = "10:00"
AM_MID_END = "11:00"

# Stop/target multipliers (from Pine Section 7)
STOP_MULT = {"A1": 2.0, "A3": 2.0, "SB1": 1.5, "ORB-1": 1.8, "B1": 2.0}
TARGET_RR = {"A1": 2.0, "A3": 2.0, "SB1": 2.5, "ORB-1": 2.0, "B1": 1.5}

# ADE scores
ADE_SCORE_SB1 = 50.0
ADE_SCORE_ORB1 = 45.0
ADE_SCORE_B1 = 1.0

# Train/Val/OOS split (chronological)
TRAIN_END = "2025-03-31"
VAL_END = "2025-09-30"
# OOS: 2025-10-01 onwards (untouched)

PINE_SHA = "d40b6e112f168692202af8fc8dbcc0464b1464c10b8b563c70625e2f0bf5ddfb"
DATASET_INTERVAL = "5m"  # Primary research dataset


def load_canonical_5m(path: str) -> pd.DataFrame:
    """Load the canonical 5m dataset and apply roll flags."""
    assert_dataset_approved(DATASET_INTERVAL)
    df = pd.read_parquet(path)

    # The canonical dataset uses 'bar_time' as the datetime column
    if "bar_time" in df.columns:
        df["datetime"] = pd.to_datetime(df["bar_time"], utc=True)
    elif "ts_event" in df.columns:
        df["datetime"] = pd.to_datetime(df["ts_event"], utc=True)
    elif "datetime" not in df.columns:
        df["datetime"] = pd.to_datetime(df.index, utc=True)

    # Convert to NY time for session filters
    df["datetime_ny"] = df["datetime"].dt.tz_convert("America/New_York")
    df["date"] = df["datetime_ny"].dt.date
    df["time_str"] = df["datetime_ny"].dt.strftime("%H:%M")

    # Apply roll flags
    df = apply_roll_flags(df, date_col="date")

    return df.sort_values("datetime").reset_index(drop=True)


def compute_indicators(df: pd.DataFrame) -> pd.DataFrame:
    """Compute all indicators required by the Pine Script canonical definitions."""
    df = df.copy()

    # ATR (Wilder, length=14)
    high_low = df["high"] - df["low"]
    high_close = (df["high"] - df["close"].shift(1)).abs()
    low_close = (df["low"] - df["close"].shift(1)).abs()
    tr = pd.concat([high_low, high_close, low_close], axis=1).max(axis=1)
    df["atr"] = tr.ewm(alpha=1/14, adjust=False).mean()

    # ATR SMA for volatile regime
    df["atr_sma20"] = df["atr"].rolling(20).mean()
    df["is_volatile"] = df["atr"] > df["atr_sma20"] * ATR_VOLATILE_MULT

    # ADX + DMI (Wilder, length=14)
    up_move = df["high"] - df["high"].shift(1)
    down_move = df["low"].shift(1) - df["low"]
    plus_dm = np.where((up_move > down_move) & (up_move > 0), up_move, 0.0)
    minus_dm = np.where((down_move > up_move) & (down_move > 0), down_move, 0.0)
    plus_dm_s = pd.Series(plus_dm, index=df.index).ewm(alpha=1/14, adjust=False).mean()
    minus_dm_s = pd.Series(minus_dm, index=df.index).ewm(alpha=1/14, adjust=False).mean()
    df["di_plus"] = 100 * plus_dm_s / df["atr"]
    df["di_minus"] = 100 * minus_dm_s / df["atr"]
    dx = 100 * (df["di_plus"] - df["di_minus"]).abs() / (df["di_plus"] + df["di_minus"])
    df["adx"] = dx.ewm(alpha=1/14, adjust=False).mean()
    df["is_trending"] = df["adx"] >= ADX_THRESHOLD

    # RSI (length=14)
    delta = df["close"].diff()
    gain = delta.clip(lower=0).ewm(alpha=1/14, adjust=False).mean()
    loss = (-delta.clip(upper=0)).ewm(alpha=1/14, adjust=False).mean()
    df["rsi"] = 100 - (100 / (1 + gain / loss))

    # VWAP (daily reset using hlc3)
    df["hlc3"] = (df["high"] + df["low"] + df["close"]) / 3
    df["vwap"] = (
        df.groupby("date")
        .apply(lambda g: (g["hlc3"] * g["volume"]).cumsum() / g["volume"].cumsum())
        .reset_index(level=0, drop=True)
    )
    df["vwap_dev"] = df["close"] - df["vwap"]

    # EMA9 and slope
    df["ema9"] = df["close"].ewm(span=9, adjust=False).mean()
    df["ema9_slope"] = df["ema9"] - df["ema9"].shift(1)

    # Session flags
    df["is_rth"] = (df["time_str"] >= RTH_START) & (df["time_str"] < RTH_END)
    df["is_am_open"] = (df["time_str"] >= AM_OPEN_START) & (df["time_str"] < AM_OPEN_END)
    df["is_am_mid"] = (df["time_str"] >= AM_MID_START) & (df["time_str"] < AM_MID_END)

    # OV direction (overnight inventory proxy)
    df["ov_long"] = (df["ema9_slope"] > 0) & (df["close"] > df["vwap"])
    df["ov_short"] = (df["ema9_slope"] < 0) & (df["close"] < df["vwap"])

    return df


def compute_ade_signals(df: pd.DataFrame) -> pd.DataFrame:
    """
    Compute ADE (Autonomous Decision Engine) portfolio signals.
    Single-active-strategy rule: only one strategy fires per bar.
    Highest ADE score wins.
    """
    df = df.copy()

    # A1 eligibility and score
    df["a1_long"] = df["is_trending"] & df["is_rth"] & (df["di_plus"] > df["di_minus"])
    df["a1_short"] = df["is_trending"] & df["is_rth"] & (df["di_minus"] > df["di_plus"])
    df["a1_elig"] = df["a1_long"] | df["a1_short"]
    df["a1_score"] = df["adx"]

    # A3 eligibility and score (5% haircut — can never beat A1 when both enabled)
    df["a3_long"] = df["is_trending"] & df["is_rth"] & (df["di_plus"] > df["di_minus"])
    df["a3_short"] = df["is_trending"] & df["is_rth"] & (df["di_minus"] > df["di_plus"])
    df["a3_elig"] = df["a3_long"] | df["a3_short"]
    df["a3_score"] = df["adx"] * 0.95

    # SB1 eligibility and score
    df["sb1_long"] = df["is_trending"] & df["is_am_mid"] & (df["ema9_slope"] > 0)
    df["sb1_short"] = df["is_trending"] & df["is_am_mid"] & (df["ema9_slope"] < 0)
    df["sb1_elig"] = df["sb1_long"] | df["sb1_short"]
    df["sb1_score"] = ADE_SCORE_SB1

    # ORB-1 eligibility and score
    df["orb1_long"] = df["is_volatile"] & df["is_am_open"] & df["is_rth"] & (df["close"] > df["open"])
    df["orb1_short"] = df["is_volatile"] & df["is_am_open"] & df["is_rth"] & (df["close"] < df["open"])
    df["orb1_elig"] = df["orb1_long"] | df["orb1_short"]
    df["orb1_score"] = ADE_SCORE_ORB1

    # B1 eligibility and score (fallback)
    df["b1_long"] = df["is_rth"] & (df["close"] > df["vwap"])
    df["b1_short"] = df["is_rth"] & (df["close"] < df["vwap"])
    df["b1_elig"] = df["b1_long"] | df["b1_short"]
    df["b1_score"] = ADE_SCORE_B1

    # ADE selection: highest score wins (no position open assumed — handled in backtest loop)
    df["win_model"] = ""
    df["win_long"] = False
    df["win_score"] = 0.0

    for idx in df.index:
        win_model = ""
        win_long = False
        win_score = 0.0

        # A1
        if df.at[idx, "a1_elig"] and df.at[idx, "a1_score"] > win_score:
            win_model = "A1"
            win_long = bool(df.at[idx, "a1_long"])
            win_score = df.at[idx, "a1_score"]
        # A3 (can never beat A1 when both eligible, but included for completeness)
        if df.at[idx, "a3_elig"] and df.at[idx, "a3_score"] > win_score:
            win_model = "A3"
            win_long = bool(df.at[idx, "a3_long"])
            win_score = df.at[idx, "a3_score"]
        # SB1
        if df.at[idx, "sb1_elig"] and df.at[idx, "sb1_score"] > win_score:
            win_model = "SB1"
            win_long = bool(df.at[idx, "sb1_long"])
            win_score = df.at[idx, "sb1_score"]
        # ORB-1
        if df.at[idx, "orb1_elig"] and df.at[idx, "orb1_score"] > win_score:
            win_model = "ORB-1"
            win_long = bool(df.at[idx, "orb1_long"])
            win_score = df.at[idx, "orb1_score"]
        # B1 (fallback)
        if df.at[idx, "b1_elig"] and df.at[idx, "b1_score"] > win_score:
            win_model = "B1"
            win_long = bool(df.at[idx, "b1_long"])
            win_score = df.at[idx, "b1_score"]

        df.at[idx, "win_model"] = win_model
        df.at[idx, "win_long"] = win_long
        df.at[idx, "win_score"] = win_score

    return df


def run_backtest(df: pd.DataFrame, strategy_id: str, enable_only: str = None) -> pd.DataFrame:
    """
    Run a single-strategy or portfolio backtest.

    Args:
        df: DataFrame with indicators and ADE signals computed
        strategy_id: "A1", "A3", "SB1", "ORB-1", "B1", or "PORTFOLIO"
        enable_only: if set, only trades for this strategy are included

    Returns:
        trades DataFrame
    """
    trades = []
    in_position = False
    entry_price = 0.0
    entry_bar = None
    stop_px = 0.0
    target_px = 0.0
    contracts = 1
    current_strategy = ""
    is_long = True

    for idx in range(len(df)):
        row = df.iloc[idx]

        # Skip roll-jump bars for entry
        if row.get("is_roll_jump", False):
            continue

        if in_position:
            # Check exit conditions
            if is_long:
                if row["low"] <= stop_px:
                    pnl_pts = stop_px - entry_price
                    exit_type = "STOP"
                    exit_price = stop_px
                    in_position = False
                elif row["high"] >= target_px:
                    pnl_pts = target_px - entry_price
                    exit_type = "TARGET"
                    exit_price = target_px
                    in_position = False
                else:
                    continue
            else:
                if row["high"] >= stop_px:
                    pnl_pts = entry_price - stop_px
                    exit_type = "STOP"
                    exit_price = stop_px
                    in_position = False
                elif row["low"] <= target_px:
                    pnl_pts = entry_price - target_px
                    exit_type = "TARGET"
                    exit_price = target_px
                    in_position = False
                else:
                    continue

            if not in_position:
                commission = COMMISSION_PER_CONTRACT * 2 * contracts  # round-trip
                pnl_dollars = pnl_pts * (1 / TICK_SIZE) * TICK_VALUE * contracts - commission
                trades.append({
                    "strategy": current_strategy,
                    "entry_date": entry_bar["date"],
                    "entry_datetime": entry_bar["datetime_ny"],
                    "exit_datetime": row["datetime_ny"],
                    "direction": "LONG" if is_long else "SHORT",
                    "entry_price": entry_price,
                    "exit_price": exit_price,
                    "stop_price": stop_px,
                    "target_price": target_px,
                    "pnl_pts": pnl_pts,
                    "pnl_dollars": pnl_dollars,
                    "contracts": contracts,
                    "exit_type": exit_type,
                    "is_roll_window": entry_bar.get("is_roll_window", False),
                    "atr_at_entry": entry_bar["atr"],
                    "adx_at_entry": entry_bar.get("adx", 0),
                    "session": "AM_OPEN" if entry_bar["is_am_open"] else ("AM_MID" if entry_bar["is_am_mid"] else "RTH"),
                    "regime": "VOLATILE" if entry_bar["is_volatile"] else ("TRENDING" if entry_bar["is_trending"] else "CHOP"),
                })
        else:
            # Check entry conditions
            win_model = row["win_model"]
            if not win_model:
                continue
            if enable_only and win_model != enable_only:
                continue
            if strategy_id != "PORTFOLIO" and win_model != strategy_id:
                continue

            atr = row["atr"]
            if pd.isna(atr) or atr <= 0:
                continue

            stop_mult = STOP_MULT.get(win_model, 2.0)
            target_rr = TARGET_RR.get(win_model, 2.0)
            stop_dist = atr * stop_mult
            target_dist = stop_dist * target_rr

            entry_price = row["close"]
            is_long = bool(row["win_long"])
            stop_px = entry_price - stop_dist if is_long else entry_price + stop_dist
            target_px = entry_price + target_dist if is_long else entry_price - target_dist

            # Position sizing
            ticks_risk = stop_dist / TICK_SIZE
            risk_per_con = ticks_risk * TICK_VALUE
            contracts = max(1, int(MAX_RISK_PER_TRADE / risk_per_con))

            in_position = True
            entry_bar = row
            current_strategy = win_model

    return pd.DataFrame(trades)


def compute_metrics(trades: pd.DataFrame, label: str = "") -> dict:
    """Compute full strategy metrics from trades DataFrame."""
    if len(trades) == 0:
        return {"label": label, "n_trades": 0, "status": "NO_TRADES"}

    wins = trades[trades["pnl_pts"] > 0]
    losses = trades[trades["pnl_pts"] <= 0]

    win_rate = len(wins) / len(trades)
    avg_win = wins["pnl_pts"].mean() if len(wins) > 0 else 0
    avg_loss = losses["pnl_pts"].mean() if len(losses) > 0 else 0
    expectancy = trades["pnl_pts"].mean()
    net_pnl = trades["pnl_dollars"].sum()
    profit_factor = (wins["pnl_dollars"].sum() / abs(losses["pnl_dollars"].sum())) if len(losses) > 0 and losses["pnl_dollars"].sum() != 0 else float("inf")

    # Drawdown
    cumulative = trades["pnl_dollars"].cumsum()
    rolling_max = cumulative.cummax()
    drawdown = cumulative - rolling_max
    max_drawdown = drawdown.min()

    # Sharpe (annualised, assuming 252 trading days, ~4 trades/day average)
    daily_pnl = trades.groupby("entry_date")["pnl_dollars"].sum()
    sharpe = (daily_pnl.mean() / daily_pnl.std() * np.sqrt(252)) if daily_pnl.std() > 0 else 0

    # Max loss streak
    results = (trades["pnl_pts"] > 0).astype(int)
    max_loss_streak = 0
    current_streak = 0
    for r in results:
        if r == 0:
            current_streak += 1
            max_loss_streak = max(max_loss_streak, current_streak)
        else:
            current_streak = 0

    # MFE/MAE proxies (using target/stop distances as upper bounds)
    avg_mfe = (trades["target_price"] - trades["entry_price"]).abs().mean()
    avg_mae = (trades["stop_price"] - trades["entry_price"]).abs().mean()

    # Holding time (approximate — bars between entry and exit)
    # Not available without bar-level data, report as N/A

    # Session breakdown
    session_perf = trades.groupby("session")["pnl_pts"].agg(["count", "mean"]).to_dict()

    # Regime breakdown
    regime_perf = trades.groupby("regime")["pnl_pts"].agg(["count", "mean"]).to_dict()

    return {
        "label": label,
        "n_trades": len(trades),
        "win_rate": round(win_rate, 4),
        "expectancy_pts": round(expectancy, 4),
        "net_pnl_dollars": round(net_pnl, 2),
        "profit_factor": round(profit_factor, 4),
        "sharpe": round(sharpe, 4),
        "max_drawdown_dollars": round(max_drawdown, 2),
        "max_loss_streak": max_loss_streak,
        "avg_mfe_pts": round(avg_mfe, 4),
        "avg_mae_pts": round(avg_mae, 4),
        "avg_win_pts": round(avg_win, 4),
        "avg_loss_pts": round(avg_loss, 4),
        "session_perf": session_perf,
        "regime_perf": regime_perf,
    }


def run_all_strategies(data_path: str, output_dir: str) -> dict:
    """
    Run all 5 canonical strategies with full metrics.
    Returns a dict of results keyed by strategy ID.
    """
    print(f"Loading canonical 5m dataset from {data_path}...")
    df = load_canonical_5m(data_path)
    print(f"Loaded {len(df):,} bars. Computing indicators...")
    df = compute_indicators(df)
    print("Computing ADE signals...")
    df = compute_ade_signals(df)

    # Split periods
    train_mask = df["date"] <= date.fromisoformat(TRAIN_END)
    val_mask = (df["date"] > date.fromisoformat(TRAIN_END)) & (df["date"] <= date.fromisoformat(VAL_END))
    oos_mask = df["date"] > date.fromisoformat(VAL_END)

    results = {}
    strategies = ["A1", "A3", "SB1", "ORB-1", "B1"]

    for strat in strategies:
        print(f"\n=== {strat} ===")
        strat_results = {}

        for period_name, mask in [("train", train_mask), ("val", val_mask), ("oos", oos_mask)]:
            period_df = df[mask].copy()
            trades = run_backtest(period_df, strategy_id="PORTFOLIO", enable_only=strat)

            # Split roll-excluded vs roll-inclusive
            if len(trades) > 0:
                roll_excl, roll_only = split_roll_excluded(trades, "entry_date")
                metrics_excl = compute_metrics(roll_excl, f"{strat}_{period_name}_roll_excluded")
                metrics_incl = compute_metrics(trades, f"{strat}_{period_name}_roll_inclusive")
                metrics_roll = compute_metrics(roll_only, f"{strat}_{period_name}_roll_only")
            else:
                metrics_excl = {"label": f"{strat}_{period_name}_roll_excluded", "n_trades": 0, "status": "NO_TRADES"}
                metrics_incl = {"label": f"{strat}_{period_name}_roll_inclusive", "n_trades": 0, "status": "NO_TRADES"}
                metrics_roll = {"label": f"{strat}_{period_name}_roll_only", "n_trades": 0, "status": "NO_TRADES"}

            strat_results[period_name] = {
                "primary": metrics_excl,    # roll-excluded = primary per RWP-001
                "secondary": metrics_incl,  # roll-inclusive = secondary
                "roll_only": metrics_roll,
                "n_trades_total": len(trades),
                "n_trades_roll_excl": metrics_excl.get("n_trades", 0),
                "n_trades_roll_only": metrics_roll.get("n_trades", 0),
            }

            exp = metrics_excl.get('expectancy_pts', 'N/A')
            wr = metrics_excl.get('win_rate', 'N/A')
            exp_str = f"{exp:.3f}" if isinstance(exp, float) else str(exp)
            wr_str = f"{wr:.1%}" if isinstance(wr, float) else str(wr)
            print(f"  {period_name}: {metrics_excl.get('n_trades', 0)} trades (roll-excl), "
                  f"expectancy={exp_str} pts, win_rate={wr_str}")

        results[strat] = {
            "fidelity": "DIVERGENT_CORRECTED",
            "pine_sha": PINE_SHA,
            "dataset": DATASET_INTERVAL,
            "roll_window_policy": "RWP-001",
            "periods": strat_results,
        }

        # Save trades to parquet
        Path(output_dir).mkdir(parents=True, exist_ok=True)
        all_trades = []
        for period_name, mask in [("train", train_mask), ("val", val_mask), ("oos", oos_mask)]:
            period_df = df[mask].copy()
            trades = run_backtest(period_df, strategy_id="PORTFOLIO", enable_only=strat)
            if len(trades) > 0:
                trades["period"] = period_name
                all_trades.append(trades)
        if all_trades:
            all_df = pd.concat(all_trades, ignore_index=True)
            out_path = Path(output_dir) / f"{strat.lower().replace('-', '_')}_trades_canonical.parquet"
            all_df.to_parquet(out_path, index=False)
            print(f"  Saved {len(all_df)} trades to {out_path}")

    # Save results manifest
    manifest_path = Path(output_dir) / "canonical_backtest_results.json"
    with open(manifest_path, "w") as f:
        json.dump(results, f, indent=2, default=str)
    print(f"\nManifest saved to {manifest_path}")

    # Compute manifest SHA
    manifest_sha = hashlib.sha256(manifest_path.read_bytes()).hexdigest()
    print(f"Manifest SHA: {manifest_sha}")

    return results


if __name__ == "__main__":
    DATA_PATH = "/home/ubuntu/atlas-historical/canonical/mnq_5m_features.parquet"
    OUTPUT_DIR = "/home/ubuntu/atlas-historical/backtest_results_canonical"

    if not Path(DATA_PATH).exists():
        print(f"ERROR: Canonical 5m dataset not found at {DATA_PATH}")
        sys.exit(1)

    results = run_all_strategies(DATA_PATH, OUTPUT_DIR)
    print("\n=== DONE ===")
    for strat, r in results.items():
        oos = r["periods"].get("oos", {}).get("primary", {})
        print(f"{strat}: OOS expectancy={oos.get('expectancy_pts', 'N/A')}, "
              f"n={oos.get('n_trades', 0)}, win_rate={oos.get('win_rate', 'N/A')}")
