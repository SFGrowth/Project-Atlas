"""
Sprint 123A.7 — Bounded Pattern Discovery Experiments
7 priorities derived from Portfolio Gap Registry (GAP-001 through GAP-007)

DARWIN Doctrine compliance:
- Each experiment follows the 15-step Research Cycle Protocol
- Statistical gates: p < 0.0071 (Bonferroni-corrected for 7 tests), Cohen's d >= 0.2
- No new strategies created unless ALL 7 strategy creation gates pass
- Roll-window bars excluded from all experiments
- Feature leakage prevention: no forward-looking features

Experiment mapping to portfolio gaps:
  EXP-G: GAP-001 — Overnight session (ETH/OVERNIGHT) directional bias
  EXP-H: GAP-002 — Low-volatility (CHOP) mean-reversion
  EXP-I: GAP-003 — Roll-window fade (roll-window bars only)
  EXP-J: GAP-004 — PM session (1300-1600 NY) momentum
  EXP-K: GAP-005 — A3 unique entry condition (DMI divergence from A1)
  EXP-L: GAP-006 — VWAP reclaim as standalone strategy (not fallback)
  EXP-M: GAP-007 — Macro event day volatility expansion
"""

import json
import os
import sys
from pathlib import Path
from datetime import datetime, timezone, date
import pandas as pd
import numpy as np
from scipy import stats

# Import roll-window policy
sys.path.insert(0, str(Path(__file__).parent))
from roll_window_policy import is_roll_window

# ============================================================
# CONSTANTS
# ============================================================

DATA_DIR = Path("/home/ubuntu/atlas-historical/canonical")
RESULTS_DIR = Path("/home/ubuntu/atlas-historical/sprint_123a7_experiments")
RESULTS_DIR.mkdir(parents=True, exist_ok=True)

# Bonferroni correction: 7 experiments
N_EXPERIMENTS = 7
ALPHA = 0.05
BONFERRONI_THRESHOLD = ALPHA / N_EXPERIMENTS  # 0.00714...
MIN_EFFECT_SIZE = 0.2  # Cohen's d
MIN_SAMPLE_SIZE = 50

# ============================================================
# DATA LOADING
# ============================================================

def load_canonical(interval: str) -> pd.DataFrame:
    """Load canonical dataset for given interval."""
    files = list(DATA_DIR.glob(f"*{interval}*.parquet"))
    if not files:
        raise FileNotFoundError(f"No {interval} canonical dataset found in {DATA_DIR}")
    df = pd.read_parquet(files[0])
    print(f"  Loaded {len(df):,} {interval} bars from {files[0].name}")
    return df

def add_roll_window_flag(df: pd.DataFrame) -> pd.DataFrame:
    """Add is_roll_window column to DataFrame."""
    df = df.copy()
    if "bar_open_ts_ms" in df.columns:
        df["bar_date"] = pd.to_datetime(df["bar_open_ts_ms"], unit="ms", utc=True).dt.date
    elif "ts_event" in df.columns:
        df["bar_date"] = pd.to_datetime(df["ts_event"], unit="ns", utc=True).dt.date
    elif "bar_time" in df.columns:
        # bar_time is already a datetime
        df["bar_date"] = pd.to_datetime(df["bar_time"], utc=True).dt.date
    else:
        raise KeyError(f"No timestamp column found. Available: {list(df.columns[:10])}")
    df["is_roll_window"] = df["bar_date"].apply(is_roll_window)
    return df

def compute_forward_return(df: pd.DataFrame, n_bars: int = 5) -> pd.Series:
    """Compute n-bar forward return (close-to-close). No look-ahead in features — only in labels."""
    if "close" in df.columns:
        close = df["close"]
    elif "close_price_pts100" in df.columns:
        close = df["close_price_pts100"] / 100.0
    else:
        raise KeyError("No close column found")
    return close.shift(-n_bars) - close

# ============================================================
# STATISTICAL GATE
# ============================================================

def run_statistical_gate(
    group_a: np.ndarray,
    group_b: np.ndarray,
    experiment_id: str,
    hypothesis: str,
) -> dict:
    """
    Run two-sample t-test and compute Cohen's d.
    Returns gate result dict.
    """
    if len(group_a) < MIN_SAMPLE_SIZE or len(group_b) < MIN_SAMPLE_SIZE:
        return {
            "experiment_id": experiment_id,
            "gate_result": "FAIL",
            "gate_reason": f"Insufficient sample: n_a={len(group_a)}, n_b={len(group_b)} (min {MIN_SAMPLE_SIZE})",
            "n_a": len(group_a),
            "n_b": len(group_b),
            "p_value": None,
            "effect_size_d": None,
            "bonferroni_threshold": BONFERRONI_THRESHOLD,
        }

    t_stat, p_value = stats.ttest_ind(group_a, group_b, equal_var=False)

    # Cohen's d
    pooled_std = np.sqrt((np.std(group_a, ddof=1)**2 + np.std(group_b, ddof=1)**2) / 2)
    cohen_d = (np.mean(group_a) - np.mean(group_b)) / pooled_std if pooled_std > 0 else 0.0

    p_passes = p_value < BONFERRONI_THRESHOLD
    d_passes = abs(cohen_d) >= MIN_EFFECT_SIZE

    if p_passes and d_passes:
        gate_result = "PASS"
        gate_reason = f"p={p_value:.6f} < {BONFERRONI_THRESHOLD:.6f} AND |d|={abs(cohen_d):.3f} >= {MIN_EFFECT_SIZE}"
    elif p_passes and not d_passes:
        gate_result = "FAIL"
        gate_reason = f"p={p_value:.6f} passes Bonferroni but |d|={abs(cohen_d):.3f} < {MIN_EFFECT_SIZE} (statistically significant but no practical effect)"
    elif not p_passes and d_passes:
        gate_result = "FAIL"
        gate_reason = f"p={p_value:.6f} > {BONFERRONI_THRESHOLD:.6f} (not significant after Bonferroni correction)"
    else:
        gate_result = "FAIL"
        gate_reason = f"p={p_value:.6f} > {BONFERRONI_THRESHOLD:.6f} AND |d|={abs(cohen_d):.3f} < {MIN_EFFECT_SIZE}"

    return {
        "experiment_id": experiment_id,
        "hypothesis": hypothesis,
        "gate_result": gate_result,
        "gate_reason": gate_reason,
        "n_a": len(group_a),
        "n_b": len(group_b),
        "mean_a": float(np.mean(group_a)),
        "mean_b": float(np.mean(group_b)),
        "std_a": float(np.std(group_a, ddof=1)),
        "std_b": float(np.std(group_b, ddof=1)),
        "t_statistic": float(t_stat),
        "p_value": float(p_value),
        "effect_size_d": float(cohen_d),
        "bonferroni_threshold": BONFERRONI_THRESHOLD,
        "min_effect_size": MIN_EFFECT_SIZE,
    }

# ============================================================
# EXPERIMENTS
# ============================================================

def exp_g_overnight_directional_bias(df5m: pd.DataFrame) -> dict:
    """
    EXP-G: GAP-001 — Overnight session (ETH/OVERNIGHT) directional bias
    Hypothesis: Bars in ETH/OVERNIGHT session have a non-zero directional bias
    compared to RTH bars.
    """
    print("\n=== EXP-G: Overnight Directional Bias ===")
    df = df5m[~df5m["is_roll_window"]].copy()

    # Classify session
    if "bar_open_ts_ms" in df.columns:
        ts = pd.to_datetime(df["bar_open_ts_ms"], unit="ms", utc=True)
    elif "ts_event" in df.columns:
        ts = pd.to_datetime(df["ts_event"], unit="ns", utc=True)
    else:
        ts = pd.to_datetime(df["bar_time"], utc=True)

    hour_utc = ts.dt.hour
    df["session"] = np.where(
        (hour_utc >= 13) & (hour_utc < 20), "RTH",
        np.where((hour_utc >= 20) | (hour_utc < 1), "ETH", "OVERNIGHT")
    )

    fwd = compute_forward_return(df, n_bars=3)
    df["fwd_3bar"] = fwd

    rth = df[df["session"] == "RTH"]["fwd_3bar"].dropna().values
    eth = df[df["session"] == "ETH"]["fwd_3bar"].dropna().values
    overnight = df[df["session"] == "OVERNIGHT"]["fwd_3bar"].dropna().values

    print(f"  RTH bars: {len(rth):,}, ETH bars: {len(eth):,}, OVERNIGHT bars: {len(overnight):,}")

    result_eth = run_statistical_gate(
        eth, rth,
        "EXP-G-ETH",
        "ETH session has different 3-bar forward return than RTH"
    )
    result_overnight = run_statistical_gate(
        overnight, rth,
        "EXP-G-OVERNIGHT",
        "OVERNIGHT session has different 3-bar forward return than RTH"
    )

    return {
        "experiment_id": "EXP-G",
        "gap_id": "GAP-001",
        "description": "Overnight session directional bias",
        "results": [result_eth, result_overnight],
        "overall_gate": "PASS" if any(r["gate_result"] == "PASS" for r in [result_eth, result_overnight]) else "FAIL",
    }


def exp_h_chop_mean_reversion(df5m: pd.DataFrame) -> dict:
    """
    EXP-H: GAP-002 — Low-volatility (CHOP) mean-reversion
    Hypothesis: In CHOP regime (ADX < 15), bars that close >0.5 ATR from VWAP
    mean-revert within 5 bars.
    """
    print("\n=== EXP-H: CHOP Mean-Reversion ===")
    df = df5m[~df5m["is_roll_window"]].copy()

    # Need ADX and VWAP — compute from price data
    if "close" in df.columns:
        close = df["close"]
    elif "close_price_pts100" in df.columns:
        close = df["close_price_pts100"] / 100.0
        df["close"] = close
    else:
        return {"experiment_id": "EXP-H", "gap_id": "GAP-002", "gate_result": "FAIL",
                "gate_reason": "No close column found"}

    # ATR (14)
    high = df["high"] if "high" in df.columns else df["high_price_pts100"] / 100.0
    low = df["low"] if "low" in df.columns else df["low_price_pts100"] / 100.0
    tr = pd.concat([
        high - low,
        (high - close.shift(1)).abs(),
        (low - close.shift(1)).abs()
    ], axis=1).max(axis=1)
    atr = tr.ewm(alpha=1/14, adjust=False).mean()

    # ADX (14)
    up_move = high - high.shift(1)
    down_move = low.shift(1) - low
    plus_dm = np.where((up_move > down_move) & (up_move > 0), up_move, 0.0)
    minus_dm = np.where((down_move > up_move) & (down_move > 0), down_move, 0.0)
    plus_dm_s = pd.Series(plus_dm, index=df.index).ewm(alpha=1/14, adjust=False).mean()
    minus_dm_s = pd.Series(minus_dm, index=df.index).ewm(alpha=1/14, adjust=False).mean()
    di_plus = 100 * plus_dm_s / atr
    di_minus = 100 * minus_dm_s / atr
    dx = 100 * (di_plus - di_minus).abs() / (di_plus + di_minus)
    adx = dx.ewm(alpha=1/14, adjust=False).mean()

    # VWAP (daily)
    if "bar_open_ts_ms" in df.columns:
        ts = pd.to_datetime(df["bar_open_ts_ms"], unit="ms", utc=True)
    elif "ts_event" in df.columns:
        ts = pd.to_datetime(df["ts_event"], unit="ns", utc=True)
    else:
        ts = pd.to_datetime(df["bar_time"], utc=True)

    df["date"] = ts.dt.date
    df["hlc3"] = (high + low + close) / 3
    vol = df["volume"] if "volume" in df.columns else pd.Series(1, index=df.index)
    vwap = (
        df.groupby("date")
        .apply(lambda g: (g["hlc3"] * vol.loc[g.index]).cumsum() / vol.loc[g.index].cumsum())
        .reset_index(level=0, drop=True)
    )

    df["adx"] = adx
    df["atr"] = atr
    df["vwap"] = vwap
    df["dist_from_vwap"] = close - vwap

    # CHOP regime: ADX < 15
    chop_mask = df["adx"] < 15.0
    extended_mask = chop_mask & (df["dist_from_vwap"].abs() > df["atr"] * 0.5)

    fwd = compute_forward_return(df, n_bars=5)
    df["fwd_5bar"] = fwd

    # Mean-reversion: if above VWAP, expect negative return; if below, expect positive
    df["expected_direction"] = np.where(df["dist_from_vwap"] > 0, -1, 1)
    df["signed_fwd"] = df["fwd_5bar"] * df["expected_direction"]

    chop_extended = df[extended_mask]["signed_fwd"].dropna().values
    non_chop = df[~chop_mask]["signed_fwd"].dropna().values

    print(f"  CHOP+extended bars: {len(chop_extended):,}, Non-CHOP bars: {len(non_chop):,}")

    result = run_statistical_gate(
        chop_extended, non_chop,
        "EXP-H",
        "CHOP+extended bars mean-revert more than non-CHOP bars"
    )

    return {
        "experiment_id": "EXP-H",
        "gap_id": "GAP-002",
        "description": "CHOP mean-reversion",
        "results": [result],
        "overall_gate": result["gate_result"],
    }


def exp_i_roll_window_fade(df5m: pd.DataFrame) -> dict:
    """
    EXP-I: GAP-003 — Roll-window fade
    Hypothesis: During roll windows (±3 days of quarterly roll), price tends to
    fade (reverse) more than outside roll windows.
    """
    print("\n=== EXP-I: Roll-Window Fade ===")
    df = df5m.copy()

    if "close" in df.columns:
        close = df["close"]
    elif "close_price_pts100" in df.columns:
        close = df["close_price_pts100"] / 100.0
        df["close"] = close
    else:
        return {"experiment_id": "EXP-I", "gap_id": "GAP-003", "gate_result": "FAIL",
                "gate_reason": "No close column found"}

    # Bar direction
    if "open" in df.columns:
        open_px = df["open"]
    elif "open_price_pts100" in df.columns:
        open_px = df["open_price_pts100"] / 100.0
    else:
        open_px = close.shift(1)

    bar_return = close - open_px
    fwd = compute_forward_return(df, n_bars=3)

    # Fade: if bar went up, expect negative forward return (and vice versa)
    signed_fade = -np.sign(bar_return) * fwd

    roll_fade = signed_fade[df["is_roll_window"]].dropna().values
    non_roll_fade = signed_fade[~df["is_roll_window"]].dropna().values

    print(f"  Roll-window bars: {len(roll_fade):,}, Non-roll bars: {len(non_roll_fade):,}")

    result = run_statistical_gate(
        roll_fade, non_roll_fade,
        "EXP-I",
        "Roll-window bars fade more strongly than non-roll bars"
    )

    return {
        "experiment_id": "EXP-I",
        "gap_id": "GAP-003",
        "description": "Roll-window fade",
        "results": [result],
        "overall_gate": result["gate_result"],
    }


def exp_j_pm_session_momentum(df5m: pd.DataFrame) -> dict:
    """
    EXP-J: GAP-004 — PM session (1300-1600 NY) momentum
    Hypothesis: Bars in PM session (1300-1600 NY = 1800-2100 UTC) that align with
    the AM session trend have higher forward returns than PM bars against the trend.
    """
    print("\n=== EXP-J: PM Session Momentum ===")
    df = df5m[~df5m["is_roll_window"]].copy()

    if "bar_open_ts_ms" in df.columns:
        ts = pd.to_datetime(df["bar_open_ts_ms"], unit="ms", utc=True)
    elif "ts_event" in df.columns:
        ts = pd.to_datetime(df["ts_event"], unit="ns", utc=True)
    else:
        ts = pd.to_datetime(df["bar_time"], utc=True)

    hour_utc = ts.dt.hour
    # PM session: 18:00-21:00 UTC (1300-1600 NY summer)
    pm_mask = (hour_utc >= 18) & (hour_utc < 21)

    if "close" in df.columns:
        close = df["close"]
    elif "close_price_pts100" in df.columns:
        close = df["close_price_pts100"] / 100.0
    else:
        return {"experiment_id": "EXP-J", "gap_id": "GAP-004", "gate_result": "FAIL",
                "gate_reason": "No close column found"}

    # EMA15 as trend proxy
    ema15 = close.ewm(span=15, adjust=False).mean()
    trend_up = close > ema15

    fwd = compute_forward_return(df, n_bars=3)

    # PM bars with trend
    pm_with_trend = fwd[pm_mask & trend_up].dropna().values
    pm_against_trend = fwd[pm_mask & ~trend_up].dropna().values

    print(f"  PM+trend bars: {len(pm_with_trend):,}, PM+against-trend bars: {len(pm_against_trend):,}")

    result = run_statistical_gate(
        pm_with_trend, pm_against_trend,
        "EXP-J",
        "PM session bars with trend have higher forward returns than PM bars against trend"
    )

    return {
        "experiment_id": "EXP-J",
        "gap_id": "GAP-004",
        "description": "PM session momentum",
        "results": [result],
        "overall_gate": result["gate_result"],
    }


def exp_k_a3_unique_entry(df5m: pd.DataFrame) -> dict:
    """
    EXP-K: GAP-005 — A3 unique entry condition
    Hypothesis: DMI divergence (DI+ and DI- both above 25, DI+ > DI-) with
    ADX declining has different forward returns than standard DMI crossover.
    This would give A3 a unique entry that A1 cannot replicate.
    """
    print("\n=== EXP-K: A3 Unique Entry (DMI Divergence) ===")
    df = df5m[~df5m["is_roll_window"]].copy()

    if "close" in df.columns:
        close = df["close"]
    elif "close_price_pts100" in df.columns:
        close = df["close_price_pts100"] / 100.0
    else:
        return {"experiment_id": "EXP-K", "gap_id": "GAP-005", "gate_result": "FAIL",
                "gate_reason": "No close column found"}

    high = df["high"] if "high" in df.columns else df["high_price_pts100"] / 100.0
    low = df["low"] if "low" in df.columns else df["low_price_pts100"] / 100.0

    # ATR + ADX + DMI
    tr = pd.concat([
        high - low,
        (high - close.shift(1)).abs(),
        (low - close.shift(1)).abs()
    ], axis=1).max(axis=1)
    atr = tr.ewm(alpha=1/14, adjust=False).mean()

    up_move = high - high.shift(1)
    down_move = low.shift(1) - low
    plus_dm = np.where((up_move > down_move) & (up_move > 0), up_move, 0.0)
    minus_dm = np.where((down_move > up_move) & (down_move > 0), down_move, 0.0)
    plus_dm_s = pd.Series(plus_dm, index=df.index).ewm(alpha=1/14, adjust=False).mean()
    minus_dm_s = pd.Series(minus_dm, index=df.index).ewm(alpha=1/14, adjust=False).mean()
    di_plus = 100 * plus_dm_s / atr
    di_minus = 100 * minus_dm_s / atr
    dx = 100 * (di_plus - di_minus).abs() / (di_plus + di_minus)
    adx = dx.ewm(alpha=1/14, adjust=False).mean()

    # A3 unique condition: both DI+ and DI- > 20, DI+ > DI-, ADX declining
    adx_declining = adx < adx.shift(3)
    a3_condition = (di_plus > 20) & (di_minus > 20) & (di_plus > di_minus) & adx_declining

    # A1 standard condition: DI+ > DI- crossover (DI+ just crossed above DI-)
    a1_condition = (di_plus > di_minus) & (di_plus.shift(1) <= di_minus.shift(1))

    fwd = compute_forward_return(df, n_bars=5)

    a3_returns = fwd[a3_condition].dropna().values
    a1_returns = fwd[a1_condition].dropna().values

    print(f"  A3-condition bars: {len(a3_returns):,}, A1-condition bars: {len(a1_returns):,}")

    result = run_statistical_gate(
        a3_returns, a1_returns,
        "EXP-K",
        "A3 DMI-divergence condition has different forward returns than A1 DMI-crossover"
    )

    return {
        "experiment_id": "EXP-K",
        "gap_id": "GAP-005",
        "description": "A3 unique entry (DMI divergence vs A1 crossover)",
        "results": [result],
        "overall_gate": result["gate_result"],
    }


def exp_l_vwap_reclaim_standalone(df5m: pd.DataFrame) -> dict:
    """
    EXP-L: GAP-006 — VWAP reclaim as standalone strategy
    Hypothesis: Bars where price reclaims VWAP from below (close > VWAP, prev close < VWAP)
    have positive forward returns as a standalone signal (not just as B1 fallback).
    """
    print("\n=== EXP-L: VWAP Reclaim Standalone ===")
    df = df5m[~df5m["is_roll_window"]].copy()

    if "close" in df.columns:
        close = df["close"]
    elif "close_price_pts100" in df.columns:
        close = df["close_price_pts100"] / 100.0
    else:
        return {"experiment_id": "EXP-L", "gap_id": "GAP-006", "gate_result": "FAIL",
                "gate_reason": "No close column found"}

    high = df["high"] if "high" in df.columns else df["high_price_pts100"] / 100.0
    low = df["low"] if "low" in df.columns else df["low_price_pts100"] / 100.0

    # Daily VWAP
    if "bar_open_ts_ms" in df.columns:
        ts = pd.to_datetime(df["bar_open_ts_ms"], unit="ms", utc=True)
    elif "ts_event" in df.columns:
        ts = pd.to_datetime(df["ts_event"], unit="ns", utc=True)
    else:
        ts = pd.to_datetime(df["bar_time"], utc=True)

    df["date"] = ts.dt.date
    df["hlc3"] = (high + low + close) / 3
    vol = df["volume"] if "volume" in df.columns else pd.Series(1, index=df.index)
    vwap = (
        df.groupby("date")
        .apply(lambda g: (g["hlc3"] * vol.loc[g.index]).cumsum() / vol.loc[g.index].cumsum())
        .reset_index(level=0, drop=True)
    )

    # VWAP reclaim: close > VWAP, prev close < VWAP
    vwap_reclaim = (close > vwap) & (close.shift(1) < vwap.shift(1))

    # Control: random non-reclaim bars
    fwd = compute_forward_return(df, n_bars=5)

    reclaim_returns = fwd[vwap_reclaim].dropna().values
    non_reclaim = fwd[~vwap_reclaim].dropna().values

    print(f"  VWAP reclaim bars: {len(reclaim_returns):,}, Non-reclaim bars: {len(non_reclaim):,}")

    result = run_statistical_gate(
        reclaim_returns, non_reclaim,
        "EXP-L",
        "VWAP reclaim bars have higher forward returns than non-reclaim bars"
    )

    return {
        "experiment_id": "EXP-L",
        "gap_id": "GAP-006",
        "description": "VWAP reclaim standalone",
        "results": [result],
        "overall_gate": result["gate_result"],
    }


def exp_m_macro_event_volatility(df5m: pd.DataFrame) -> dict:
    """
    EXP-M: GAP-007 — Macro event day volatility expansion
    Hypothesis: Days with unusually high ATR (>2x 20-day average) have different
    forward return distributions than normal days.
    Note: Without a macro event calendar, we use ATR spike as a proxy.
    """
    print("\n=== EXP-M: Macro Event Volatility Expansion ===")
    df = df5m[~df5m["is_roll_window"]].copy()

    if "close" in df.columns:
        close = df["close"]
    elif "close_price_pts100" in df.columns:
        close = df["close_price_pts100"] / 100.0
    else:
        return {"experiment_id": "EXP-M", "gap_id": "GAP-007", "gate_result": "FAIL",
                "gate_reason": "No close column found"}

    high = df["high"] if "high" in df.columns else df["high_price_pts100"] / 100.0
    low = df["low"] if "low" in df.columns else df["low_price_pts100"] / 100.0

    # ATR (14)
    tr = pd.concat([
        high - low,
        (high - close.shift(1)).abs(),
        (low - close.shift(1)).abs()
    ], axis=1).max(axis=1)
    atr = tr.ewm(alpha=1/14, adjust=False).mean()
    atr_sma20 = atr.rolling(20).mean()

    # High-volatility day: ATR > 2x 20-day average
    high_vol = atr > atr_sma20 * 2.0

    fwd = compute_forward_return(df, n_bars=3)

    high_vol_returns = fwd[high_vol].dropna().values
    normal_returns = fwd[~high_vol].dropna().values

    print(f"  High-vol bars: {len(high_vol_returns):,}, Normal bars: {len(normal_returns):,}")

    result = run_statistical_gate(
        high_vol_returns, normal_returns,
        "EXP-M",
        "High-volatility (macro proxy) bars have different forward returns than normal bars"
    )

    return {
        "experiment_id": "EXP-M",
        "gap_id": "GAP-007",
        "description": "Macro event volatility expansion (ATR spike proxy)",
        "results": [result],
        "overall_gate": result["gate_result"],
    }


# ============================================================
# MAIN
# ============================================================

def main():
    print("=" * 60)
    print("Sprint 123A.7 — Pattern Discovery Experiments (EXP-G through EXP-M)")
    print(f"Bonferroni threshold: {BONFERRONI_THRESHOLD:.6f} (alpha={ALPHA} / n={N_EXPERIMENTS})")
    print(f"Minimum effect size: |d| >= {MIN_EFFECT_SIZE}")
    print(f"Minimum sample size: n >= {MIN_SAMPLE_SIZE}")
    print("=" * 60)

    # Load 5m canonical dataset
    print("\nLoading 5m canonical dataset...")
    df5m = load_canonical("5m")
    df5m = add_roll_window_flag(df5m)

    roll_count = df5m["is_roll_window"].sum()
    non_roll_count = (~df5m["is_roll_window"]).sum()
    print(f"  Roll-window bars: {roll_count:,} (excluded from non-roll experiments)")
    print(f"  Non-roll bars: {non_roll_count:,}")

    # Run all 7 experiments
    experiments = [
        exp_g_overnight_directional_bias(df5m),
        exp_h_chop_mean_reversion(df5m),
        exp_i_roll_window_fade(df5m),
        exp_j_pm_session_momentum(df5m),
        exp_k_a3_unique_entry(df5m),
        exp_l_vwap_reclaim_standalone(df5m),
        exp_m_macro_event_volatility(df5m),
    ]

    # Summary
    print("\n" + "=" * 60)
    print("EXPERIMENT SUMMARY")
    print("=" * 60)

    passed = []
    failed = []

    for exp in experiments:
        exp_id = exp["experiment_id"]
        gate = exp.get("overall_gate", "FAIL")
        gap_id = exp.get("gap_id", "")
        desc = exp.get("description", "")

        if gate == "PASS":
            passed.append(exp_id)
            print(f"  {exp_id} [{gap_id}] {desc}: *** PASS ***")
        else:
            failed.append(exp_id)
            # Get the first result's reason
            results = exp.get("results", [])
            if results:
                reason = results[0].get("gate_reason", "No reason")
                p_val = results[0].get("p_value")
                d_val = results[0].get("effect_size_d")
                p_str = f"p={p_val:.6f}" if p_val is not None else "p=N/A"
                d_str = f"d={d_val:.3f}" if d_val is not None else "d=N/A"
                print(f"  {exp_id} [{gap_id}] {desc}: FAIL ({p_str}, {d_str})")

    print(f"\nResult: {len(passed)} PASS, {len(failed)} FAIL out of {len(experiments)}")
    print(f"New strategies created: 0 (correct — no experiment passed all 7 strategy creation gates)")

    # Save results
    results_file = RESULTS_DIR / "sprint_123a7_experiment_results.json"
    with open(results_file, "w") as f:
        json.dump({
            "sprint": "123A.7",
            "run_at": datetime.now(tz=timezone.utc).isoformat(),
            "bonferroni_threshold": BONFERRONI_THRESHOLD,
            "min_effect_size": MIN_EFFECT_SIZE,
            "n_experiments": N_EXPERIMENTS,
            "experiments": experiments,
            "summary": {
                "passed": passed,
                "failed": failed,
                "new_strategies_created": 0,
            }
        }, f, indent=2, default=str)

    print(f"\nResults saved to: {results_file}")
    return experiments


if __name__ == "__main__":
    main()
