"""
ADE Portfolio Runner — Full Pine Script Fidelity
=================================================
Implements the exact ADE selection logic from atlas_portfolio_v1.pine v1.0.2
(SHA-256: d40b6e112f168692202af8fc8dbcc0464b1464c10b8b563c70625e2f0bf5ddfb)

Pine Script rule hash: ATLAS-PORT-117-2026-07-15

ADE Selection Hierarchy (highest score wins):
  A1       → score = ADX value           (TRENDING regime, RTH)
  A3       → score = ADX × 0.95          (TRENDING regime, RTH)
  SB1      → score = 50 (fixed)          (TRENDING, AM_MID, RAS)
  ORB-1    → score = 45 (fixed)          (VOLATILE, AM_OPEN, RTH)
  S109-001 → score = |VWAP dev|/ATR×100  (RTH, VWAP deviation ≥ 0.5×ATR)
  B1       → score = 1  (fallback)       (RTH always)

Commission: $0.62/contract/order (cash_per_contract)
Round trip: $1.24/contract (entry + exit)

Entry: close of confirmed bar (barstate.isconfirmed)
Stop:  entry ± ATR × model_stop_mult
Target: stop_dist × model_rr_mult
Contracts: floor(risk_per_trade / (stop_ticks × tick_value)), min 1

Key differences from canonical_strategy_backtests.py (Sprint 123A.7):
  - S109-001 is now included (was missing)
  - Commission is $0.62/contract/order (not $2.00/round-trip)
  - Entry is close of bar (not open of next bar)
  - Single-active-strategy: no new entry while position is open
  - barstate.isconfirmed equivalent: only process closed bars
"""

import json
import logging
import os
from dataclasses import dataclass, field
from datetime import datetime, time, timezone
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd
from scipy import stats

log = logging.getLogger("ade_portfolio_runner")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

# ============================================================
# PINE SCRIPT PARAMETERS (canonical defaults)
# ============================================================
PINE_PARAMS = {
    "adx_len": 14,
    "adx_thresh": 25.0,
    "atr_len": 14,
    "rsi_len": 14,
    "vwap_dev_mult": 0.5,
    "risk_per_trade": 450.0,
    "tick_value": 0.50,   # $ per tick per contract (MNQ)
    "tick_size": 0.25,    # points per tick (MNQ)
    "commission_per_contract_per_order": 0.62,
    # Session windows (NY time, 5-min bars)
    "rth_start_ny": time(9, 30),
    "rth_end_ny": time(16, 0),
    "am_open_start_ny": time(9, 30),
    "am_open_end_ny": time(10, 0),
    "am_mid_start_ny": time(10, 0),
    "am_mid_end_ny": time(11, 0),
}

# Stop and target multipliers by model
MODEL_STOP_MULT = {
    "A1": 2.0,
    "A3": 2.0,
    "SB1": 1.5,
    "ORB-1": 1.8,
    "S109-001": 2.5,
    "B1": 2.0,
}

MODEL_RR_MULT = {
    "A1": 2.0,
    "A3": 2.0,
    "SB1": 2.5,
    "ORB-1": 2.0,
    "S109-001": 2.0,
    "B1": 1.5,
}

# ============================================================
# INDICATORS (exact Pine Script equivalents)
# ============================================================

def wilder_smooth(series: pd.Series, length: int) -> pd.Series:
    """Wilder smoothing (used in ADX/DMI)."""
    result = pd.Series(index=series.index, dtype=float)
    result.iloc[:length] = np.nan
    result.iloc[length] = series.iloc[:length].sum()
    for i in range(length + 1, len(series)):
        result.iloc[i] = result.iloc[i - 1] - (result.iloc[i - 1] / length) + series.iloc[i]
    return result


def compute_dmi_adx(high: pd.Series, low: pd.Series, close: pd.Series, length: int = 14):
    """Compute DI+, DI-, ADX using Wilder smoothing (matches ta.dmi in Pine Script)."""
    up_move = high.diff()
    down_move = -low.diff()

    plus_dm = np.where((up_move > down_move) & (up_move > 0), up_move, 0.0)
    minus_dm = np.where((down_move > up_move) & (down_move > 0), down_move, 0.0)

    tr = pd.concat([
        high - low,
        (high - close.shift(1)).abs(),
        (low - close.shift(1)).abs()
    ], axis=1).max(axis=1)

    plus_dm_s = wilder_smooth(pd.Series(plus_dm, index=high.index), length)
    minus_dm_s = wilder_smooth(pd.Series(minus_dm, index=high.index), length)
    tr_s = wilder_smooth(tr, length)

    di_plus = 100 * plus_dm_s / tr_s
    di_minus = 100 * minus_dm_s / tr_s

    dx = 100 * (di_plus - di_minus).abs() / (di_plus + di_minus)
    adx = wilder_smooth(dx.fillna(0), length)

    return di_plus, di_minus, adx


def compute_atr(high: pd.Series, low: pd.Series, close: pd.Series, length: int = 14) -> pd.Series:
    """ATR using Wilder smoothing (matches ta.atr in Pine Script)."""
    tr = pd.concat([
        high - low,
        (high - close.shift(1)).abs(),
        (low - close.shift(1)).abs()
    ], axis=1).max(axis=1)
    return wilder_smooth(tr, length)


def compute_rsi(close: pd.Series, length: int = 14) -> pd.Series:
    """RSI using Wilder smoothing (matches ta.rsi in Pine Script)."""
    delta = close.diff()
    gain = delta.clip(lower=0)
    loss = (-delta).clip(lower=0)
    avg_gain = wilder_smooth(gain, length)
    avg_loss = wilder_smooth(loss, length)
    rs = avg_gain / avg_loss.replace(0, np.nan)
    return 100 - (100 / (1 + rs))


def compute_vwap(high: pd.Series, low: pd.Series, close: pd.Series, volume: pd.Series) -> pd.Series:
    """Session VWAP using HLC3 (matches ta.vwap(hlc3) in Pine Script).
    Note: Pine Script resets VWAP at session open. We approximate with a
    rolling 390-bar (1 RTH day) VWAP for the backtest.
    """
    hlc3 = (high + low + close) / 3
    # Rolling VWAP approximation (390 5-min bars = 1 RTH session)
    rolling_window = 78  # 78 × 5min = 6.5 hours ≈ 1 RTH session
    tp_vol = hlc3 * volume
    return tp_vol.rolling(rolling_window, min_periods=1).sum() / volume.rolling(rolling_window, min_periods=1).sum()


def compute_ema(close: pd.Series, length: int) -> pd.Series:
    """EMA (matches ta.ema in Pine Script)."""
    return close.ewm(span=length, adjust=False).mean()


# ============================================================
# SESSION FLAGS
# ============================================================

def get_session_flags(ts_utc: pd.Series) -> pd.DataFrame:
    """Convert UTC timestamps to NY time and compute session flags."""
    # Convert to NY time (UTC-5 standard, UTC-4 daylight)
    ts_ny = ts_utc.dt.tz_localize("UTC").dt.tz_convert("America/New_York")
    t_ny = ts_ny.dt.time

    is_rth = ((t_ny >= PINE_PARAMS["rth_start_ny"]) & (t_ny < PINE_PARAMS["rth_end_ny"]))
    is_am_open = ((t_ny >= PINE_PARAMS["am_open_start_ny"]) & (t_ny < PINE_PARAMS["am_open_end_ny"]))
    is_am_mid = ((t_ny >= PINE_PARAMS["am_mid_start_ny"]) & (t_ny < PINE_PARAMS["am_mid_end_ny"]))

    return pd.DataFrame({
        "is_rth": is_rth.values,
        "is_am_open": is_am_open.values,
        "is_am_mid": is_am_mid.values,
    }, index=ts_utc.index)


# ============================================================
# ADE SELECTION (exact Pine Script logic)
# ============================================================

@dataclass
class AdeProposal:
    model: str
    is_long: bool
    score: float


def ade_select(row: dict) -> Optional[AdeProposal]:
    """
    Exact ADE selection logic from Pine Script Section 6.
    Returns the winning proposal or None if no strategy is eligible.

    Evaluation order matches Pine Script:
      A1 → A3 → SB1 → ORB-1 → S109-001 → B1
    Each model wins only if its score > current winScore.
    """
    p = PINE_PARAMS
    win_model = ""
    win_long = False
    win_score = 0.0

    adx = row["adx"]
    di_plus = row["di_plus"]
    di_minus = row["di_minus"]
    atr = row["atr"]
    rsi = row["rsi"]
    vwap_dev = row["vwap_dev"]
    ema9_slope = row["ema9_slope"]
    close = row["close"]
    vwap = row["vwap"]
    is_rth = row["is_rth"]
    is_am_open = row["is_am_open"]
    is_am_mid = row["is_am_mid"]

    is_trending = adx >= p["adx_thresh"]
    is_volatile = atr > row["atr_sma20"] * 1.2
    ov_long = (ema9_slope > 0) and (close > vwap)
    ov_short = (ema9_slope < 0) and (close < vwap)

    # A1
    a1_long = is_trending and is_rth and (di_plus > di_minus)
    a1_short = is_trending and is_rth and (di_minus > di_plus)
    a1_elig = a1_long or a1_short
    a1_score = adx
    if a1_elig and a1_score > win_score:
        win_model = "A1"
        win_long = a1_long
        win_score = a1_score

    # A3
    a3_long = is_trending and is_rth and (di_plus > di_minus)
    a3_short = is_trending and is_rth and (di_minus > di_plus)
    a3_elig = a3_long or a3_short
    a3_score = adx * 0.95
    if a3_elig and a3_score > win_score:
        win_model = "A3"
        win_long = a3_long
        win_score = a3_score

    # SB1
    sb1_long = is_trending and is_am_mid and (ema9_slope > 0)
    sb1_short = is_trending and is_am_mid and (ema9_slope < 0)
    sb1_elig = sb1_long or sb1_short
    sb1_score = 50.0
    if sb1_elig and sb1_score > win_score:
        win_model = "SB1"
        win_long = sb1_long
        win_score = sb1_score

    # ORB-1
    orb1_long = is_volatile and is_am_open and is_rth and (close > row["open"])
    orb1_short = is_volatile and is_am_open and is_rth and (close < row["open"])
    orb1_elig = orb1_long or orb1_short
    orb1_score = 45.0
    if orb1_elig and orb1_score > win_score:
        win_model = "ORB-1"
        win_long = orb1_long
        win_score = orb1_score

    # S109-001
    s109_dev_abs = abs(vwap_dev)
    s109_dev_ok = s109_dev_abs >= p["vwap_dev_mult"] * atr
    s109_long = is_rth and s109_dev_ok and (vwap_dev > 0) and ov_long and (rsi > 50)
    s109_short = is_rth and s109_dev_ok and (vwap_dev < 0) and ov_short and (rsi < 50)
    s109_elig = s109_long or s109_short
    s109_score = (s109_dev_abs / atr * 100) if atr > 0 else 0.0
    if s109_elig and s109_score > win_score:
        win_model = "S109-001"
        win_long = s109_long
        win_score = s109_score

    # B1 (fallback)
    b1_long = is_rth and (close > vwap)
    b1_short = is_rth and (close < vwap)
    b1_elig = b1_long or b1_short
    b1_score = 1.0
    if b1_elig and b1_score > win_score:
        win_model = "B1"
        win_long = b1_long
        win_score = b1_score

    if not win_model:
        return None

    return AdeProposal(model=win_model, is_long=win_long, score=win_score)


# ============================================================
# BACKTEST ENGINE
# ============================================================

@dataclass
class Trade:
    bar_index: int
    timestamp: pd.Timestamp
    model: str
    direction: str  # "long" or "short"
    entry_px: float
    stop_px: float
    target_px: float
    contracts: int
    score: float
    exit_px: float = 0.0
    exit_reason: str = ""  # "target", "stop"
    pnl_pts: float = 0.0
    pnl_usd: float = 0.0
    commission_usd: float = 0.0
    net_pnl_usd: float = 0.0


def run_backtest(df: pd.DataFrame, enable_s109: bool = True) -> list[Trade]:
    """
    Run the ADE portfolio backtest on the given DataFrame.

    DataFrame must have columns:
        timestamp (UTC), open, high, low, close, volume

    Returns a list of Trade objects.
    """
    p = PINE_PARAMS

    # Compute indicators
    log.info("Computing indicators...")
    di_plus, di_minus, adx = compute_dmi_adx(df["high"], df["low"], df["close"], p["adx_len"])
    atr = compute_atr(df["high"], df["low"], df["close"], p["atr_len"])
    atr_sma20 = atr.rolling(20, min_periods=1).mean()
    rsi = compute_rsi(df["close"], p["rsi_len"])
    vwap = compute_vwap(df["high"], df["low"], df["close"], df["volume"])
    vwap_dev = df["close"] - vwap
    ema9 = compute_ema(df["close"], 9)
    ema9_slope = ema9 - ema9.shift(1)

    # Session flags
    log.info("Computing session flags...")
    sess = get_session_flags(df["timestamp"])

    # Build feature matrix
    features = pd.DataFrame({
        "timestamp": df["timestamp"].values,
        "open": df["open"].values,
        "high": df["high"].values,
        "low": df["low"].values,
        "close": df["close"].values,
        "volume": df["volume"].values,
        "adx": adx.values,
        "di_plus": di_plus.values,
        "di_minus": di_minus.values,
        "atr": atr.values,
        "atr_sma20": atr_sma20.values,
        "rsi": rsi.values,
        "vwap": vwap.values,
        "vwap_dev": vwap_dev.values,
        "ema9_slope": ema9_slope.values,
        "is_rth": sess["is_rth"].values,
        "is_am_open": sess["is_am_open"].values,
        "is_am_mid": sess["is_am_mid"].values,
    })

    # Backtest loop
    trades = []
    position = None  # current open trade or None

    log.info(f"Running backtest on {len(features)} bars...")

    for i, row in features.iterrows():
        # Skip bars with NaN indicators (warmup period)
        if pd.isna(row["adx"]) or pd.isna(row["atr"]) or pd.isna(row["rsi"]):
            continue

        # Check if open position should be closed
        if position is not None:
            # Check stop and target on this bar (using high/low)
            if position.direction == "long":
                if row["low"] <= position.stop_px:
                    position.exit_px = position.stop_px
                    position.exit_reason = "stop"
                elif row["high"] >= position.target_px:
                    position.exit_px = position.target_px
                    position.exit_reason = "target"
            else:  # short
                if row["high"] >= position.stop_px:
                    position.exit_px = position.stop_px
                    position.exit_reason = "stop"
                elif row["low"] <= position.target_px:
                    position.exit_px = position.target_px
                    position.exit_reason = "target"

            if position.exit_reason:
                # Compute P&L
                if position.direction == "long":
                    position.pnl_pts = position.exit_px - position.entry_px
                else:
                    position.pnl_pts = position.entry_px - position.exit_px

                # Commission: $0.62/contract/order × 2 orders (entry + exit)
                position.commission_usd = p["commission_per_contract_per_order"] * position.contracts * 2
                # P&L in USD: pnl_pts / tick_size × tick_value × contracts
                position.pnl_usd = (position.pnl_pts / p["tick_size"]) * p["tick_value"] * position.contracts
                position.net_pnl_usd = position.pnl_usd - position.commission_usd

                trades.append(position)
                position = None

        # Only enter on confirmed bars (barstate.isconfirmed equivalent)
        # and only when no position is open
        if position is not None:
            continue

        # ADE selection
        proposal = ade_select(row.to_dict())
        if proposal is None:
            continue

        # Skip S109-001 if disabled
        if not enable_s109 and proposal.model == "S109-001":
            continue

        # Compute stop and target
        atr_val = row["atr"]
        stop_dist = atr_val * MODEL_STOP_MULT[proposal.model]
        target_dist = stop_dist * MODEL_RR_MULT[proposal.model]

        entry_px = row["close"]
        if proposal.is_long:
            stop_px = entry_px - stop_dist
            target_px = entry_px + target_dist
        else:
            stop_px = entry_px + stop_dist
            target_px = entry_px - target_dist

        # Contracts
        ticks_risk = stop_dist / p["tick_size"]
        risk_per_con = ticks_risk * p["tick_value"]
        contracts = max(1, int(p["risk_per_trade"] / risk_per_con))

        position = Trade(
            bar_index=i,
            timestamp=row["timestamp"],
            model=proposal.model,
            direction="long" if proposal.is_long else "short",
            entry_px=entry_px,
            stop_px=stop_px,
            target_px=target_px,
            contracts=contracts,
            score=proposal.score,
        )

    # Close any open position at end of data
    if position is not None:
        last_row = features.iloc[-1]
        position.exit_px = last_row["close"]
        position.exit_reason = "end_of_data"
        if position.direction == "long":
            position.pnl_pts = position.exit_px - position.entry_px
        else:
            position.pnl_pts = position.entry_px - position.exit_px
        position.commission_usd = p["commission_per_contract_per_order"] * position.contracts * 2
        position.pnl_usd = (position.pnl_pts / p["tick_size"]) * p["tick_value"] * position.contracts
        position.net_pnl_usd = position.pnl_usd - position.commission_usd
        trades.append(position)

    return trades


# ============================================================
# METRICS
# ============================================================

def compute_metrics(trades: list[Trade], label: str = "") -> dict:
    """Compute comprehensive metrics from a list of trades."""
    if not trades:
        return {
            "label": label,
            "n_trades": 0,
            "win_rate": None,
            "expectancy_pts": None,
            "expectancy_usd": None,
            "sharpe": None,
            "max_drawdown_usd": None,
            "max_loss_streak": None,
            "total_pnl_usd": None,
            "model_breakdown": {},
        }

    pnl_pts = [t.pnl_pts for t in trades]
    pnl_usd = [t.net_pnl_usd for t in trades]
    wins = [p > 0 for p in pnl_pts]

    # Max drawdown
    equity = np.cumsum(pnl_usd)
    running_max = np.maximum.accumulate(equity)
    drawdown = equity - running_max
    max_dd = float(drawdown.min())

    # Max loss streak
    max_streak = 0
    current_streak = 0
    for w in wins:
        if not w:
            current_streak += 1
            max_streak = max(max_streak, current_streak)
        else:
            current_streak = 0

    # Sharpe (annualised, assuming 252 trading days × ~5 trades/day)
    if len(pnl_usd) > 1 and np.std(pnl_usd) > 0:
        sharpe = (np.mean(pnl_usd) / np.std(pnl_usd)) * np.sqrt(252 * 5)
    else:
        sharpe = 0.0

    # Model breakdown
    model_breakdown = {}
    for t in trades:
        if t.model not in model_breakdown:
            model_breakdown[t.model] = {"n": 0, "wins": 0, "pnl_pts": 0.0, "pnl_usd": 0.0}
        model_breakdown[t.model]["n"] += 1
        model_breakdown[t.model]["wins"] += int(t.pnl_pts > 0)
        model_breakdown[t.model]["pnl_pts"] += t.pnl_pts
        model_breakdown[t.model]["pnl_usd"] += t.net_pnl_usd

    return {
        "label": label,
        "n_trades": len(trades),
        "win_rate": float(np.mean(wins)),
        "expectancy_pts": float(np.mean(pnl_pts)),
        "expectancy_usd": float(np.mean(pnl_usd)),
        "sharpe": float(sharpe),
        "max_drawdown_usd": float(max_dd),
        "max_loss_streak": int(max_streak),
        "total_pnl_usd": float(np.sum(pnl_usd)),
        "model_breakdown": model_breakdown,
    }


# ============================================================
# BAR-BY-BAR RECONCILIATION REPORT
# ============================================================

def bar_by_bar_reconciliation(df: pd.DataFrame, n_sample: int = 50) -> list[dict]:
    """
    Produce a bar-by-bar reconciliation table for the first n_sample entry signals.
    This is the foundation for the Pine Script vs Python reconciliation required
    in Sprint 123A.8.

    Returns a list of dicts with all ADE inputs and the winning proposal.
    """
    p = PINE_PARAMS
    di_plus, di_minus, adx = compute_dmi_adx(df["high"], df["low"], df["close"], p["adx_len"])
    atr = compute_atr(df["high"], df["low"], df["close"], p["atr_len"])
    atr_sma20 = atr.rolling(20, min_periods=1).mean()
    rsi = compute_rsi(df["close"], p["rsi_len"])
    vwap = compute_vwap(df["high"], df["low"], df["close"], df["volume"])
    vwap_dev = df["close"] - vwap
    ema9 = compute_ema(df["close"], 9)
    ema9_slope = ema9 - ema9.shift(1)
    sess = get_session_flags(df["timestamp"])

    records = []
    count = 0

    for i in range(len(df)):
        if count >= n_sample:
            break
        if pd.isna(adx.iloc[i]) or pd.isna(atr.iloc[i]):
            continue

        row = {
            "timestamp": df["timestamp"].iloc[i],
            "open": df["open"].iloc[i],
            "high": df["high"].iloc[i],
            "low": df["low"].iloc[i],
            "close": df["close"].iloc[i],
            "volume": df["volume"].iloc[i],
            "adx": adx.iloc[i],
            "di_plus": di_plus.iloc[i],
            "di_minus": di_minus.iloc[i],
            "atr": atr.iloc[i],
            "atr_sma20": atr_sma20.iloc[i],
            "rsi": rsi.iloc[i],
            "vwap": vwap.iloc[i],
            "vwap_dev": vwap_dev.iloc[i],
            "ema9_slope": ema9_slope.iloc[i],
            "is_rth": sess["is_rth"].iloc[i],
            "is_am_open": sess["is_am_open"].iloc[i],
            "is_am_mid": sess["is_am_mid"].iloc[i],
        }

        proposal = ade_select(row)
        if proposal is None:
            continue

        record = {
            "bar_index": i,
            "timestamp_utc": str(row["timestamp"]),
            "close": round(row["close"], 2),
            "adx": round(row["adx"], 2),
            "di_plus": round(row["di_plus"], 2),
            "di_minus": round(row["di_minus"], 2),
            "atr": round(row["atr"], 4),
            "rsi": round(row["rsi"], 2),
            "vwap": round(row["vwap"], 2),
            "vwap_dev": round(row["vwap_dev"], 4),
            "ema9_slope": round(row["ema9_slope"], 4),
            "is_rth": bool(row["is_rth"]),
            "is_am_open": bool(row["is_am_open"]),
            "is_am_mid": bool(row["is_am_mid"]),
            "is_trending": bool(row["adx"] >= PINE_PARAMS["adx_thresh"]),
            "is_volatile": bool(row["atr"] > row["atr_sma20"] * 1.2),
            "win_model": proposal.model,
            "win_direction": "long" if proposal.is_long else "short",
            "win_score": round(proposal.score, 2),
            "pine_reconciled": False,  # Set to True after manual Pine Script comparison
            "pine_model": None,        # Fill in from TradingView paper trade log
            "pine_direction": None,    # Fill in from TradingView paper trade log
            "pine_score": None,        # Fill in from TradingView paper trade log
            "reconciliation_status": "PENDING",  # MATCH / MISMATCH / PENDING
        }
        records.append(record)
        count += 1

    return records


# ============================================================
# MAIN
# ============================================================

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="ADE Portfolio Runner — Full Pine Script Fidelity")
    parser.add_argument("--dataset", default="/home/ubuntu/atlas-historical/canonical/mnq_5m_features.parquet",
                        help="Path to 5m canonical dataset parquet")
    parser.add_argument("--output-dir", default="/home/ubuntu/atlas-historical/backtest_results",
                        help="Output directory for results")
    parser.add_argument("--reconcile", action="store_true",
                        help="Produce bar-by-bar reconciliation table (first 50 signals)")
    parser.add_argument("--split", choices=["train", "val", "oos", "all"], default="all",
                        help="Dataset split to run on")
    args = parser.parse_args()

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    log.info(f"Loading dataset: {args.dataset}")
    df = pd.read_parquet(args.dataset)

    # Normalise timestamp column
    if "bar_time" in df.columns:
        df = df.rename(columns={"bar_time": "timestamp"})
    elif "ts_event" in df.columns:
        df = df.rename(columns={"ts_event": "timestamp"})

    df["timestamp"] = pd.to_datetime(df["timestamp"])
    df = df.sort_values("timestamp").reset_index(drop=True)

    log.info(f"Dataset: {len(df)} bars from {df['timestamp'].iloc[0]} to {df['timestamp'].iloc[-1]}")

    # Train/Val/OOS split (60/20/20)
    n = len(df)
    train_end = int(n * 0.6)
    val_end = int(n * 0.8)

    if args.split == "train":
        df_run = df.iloc[:train_end].reset_index(drop=True)
        label = "TRAIN (60%)"
    elif args.split == "val":
        df_run = df.iloc[train_end:val_end].reset_index(drop=True)
        label = "VAL (20%)"
    elif args.split == "oos":
        df_run = df.iloc[val_end:].reset_index(drop=True)
        label = "OOS (20%)"
    else:
        df_run = df
        label = "ALL"

    if args.reconcile:
        log.info("Producing bar-by-bar reconciliation table...")
        records = bar_by_bar_reconciliation(df_run, n_sample=50)
        recon_path = output_dir / "ade_reconciliation_table.json"
        with open(recon_path, "w") as f:
            json.dump(records, f, indent=2, default=str)
        log.info(f"Reconciliation table saved: {recon_path} ({len(records)} signals)")
        print(f"\nFirst 5 signals:")
        for r in records[:5]:
            print(f"  {r['timestamp_utc']} | {r['win_model']:8s} | {r['win_direction']:5s} | score={r['win_score']:.1f} | ADX={r['adx']:.1f} | ATR={r['atr']:.4f}")
    else:
        log.info(f"Running backtest on {label} ({len(df_run)} bars)...")
        trades = run_backtest(df_run)
        metrics = compute_metrics(trades, label=label)

        # Save results
        trades_data = [vars(t) for t in trades]
        for td in trades_data:
            td["timestamp"] = str(td["timestamp"])

        results = {
            "pine_script_sha256": "d40b6e112f168692202af8fc8dbcc0464b1464c10b8b563c70625e2f0bf5ddfb",
            "pine_script_version": "1.0.2",
            "rule_hash": "ATLAS-PORT-117-2026-07-15",
            "commission_per_contract_per_order": PINE_PARAMS["commission_per_contract_per_order"],
            "commission_round_trip": PINE_PARAMS["commission_per_contract_per_order"] * 2,
            "split": args.split,
            "n_bars": len(df_run),
            "metrics": metrics,
            "trades": trades_data,
        }

        out_path = output_dir / f"ade_portfolio_results_{args.split}.json"
        with open(out_path, "w") as f:
            json.dump(results, f, indent=2, default=str)

        log.info(f"Results saved: {out_path}")
        print(f"\n=== ADE Portfolio Results ({label}) ===")
        print(f"  Trades:       {metrics['n_trades']}")
        print(f"  Win rate:     {metrics['win_rate']:.1%}" if metrics['win_rate'] else "  Win rate:     N/A")
        print(f"  Expectancy:   {metrics['expectancy_pts']:.3f} pts / ${metrics['expectancy_usd']:.2f}" if metrics['expectancy_pts'] else "  Expectancy:   N/A")
        print(f"  Sharpe:       {metrics['sharpe']:.3f}" if metrics['sharpe'] else "  Sharpe:       N/A")
        print(f"  Max DD:       ${metrics['max_drawdown_usd']:.2f}" if metrics['max_drawdown_usd'] else "  Max DD:       N/A")
        print(f"  Max streak:   {metrics['max_loss_streak']}" if metrics['max_loss_streak'] else "  Max streak:   N/A")
        print(f"\n  Model breakdown:")
        for model, mb in sorted(metrics.get("model_breakdown", {}).items()):
            wr = mb['wins'] / mb['n'] if mb['n'] > 0 else 0
            print(f"    {model:12s}: n={mb['n']:4d}  WR={wr:.1%}  PnL={mb['pnl_pts']:.1f}pts / ${mb['pnl_usd']:.0f}")
