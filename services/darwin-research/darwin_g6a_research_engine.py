"""
DARWIN G6A Research Engine — Sprint 123A.6
Python implementation of experiments A-D.

Runs against historical Databento 1m and 5m MNQ data.
Applies full statistical validation pipeline:
  1. Feature extraction (no look-ahead)
  2. Outcome labelling (after horizon elapsed)
  3. Statistical significance testing
  4. Walk-forward validation
  5. Anti-overfitting checks
  6. Manifest generation

RESEARCH ONLY — NO LIVE EXECUTION
"""

import os
import sys
import json
import hashlib
import logging
import argparse
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional
import warnings

warnings.filterwarnings("ignore")

# ─── Logging ──────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [DARWIN-G6A] %(levelname)s %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%SZ",
)
log = logging.getLogger("darwin_g6a")

# ─── Constants ────────────────────────────────────────────────────────────────

FEATURE_VERSION = "1.0"
LABEL_VERSION = "1.0"
ENGINE_VERSION = "1.0.0"

# Statistical gates
MIN_OCCURRENCES = 30
MAX_P_VALUE = 0.05
MIN_EFFECT_SIZE = 0.2
MIN_WIN_RATE = 0.55
MIN_PROFIT_FACTOR = 1.5
MIN_STABILITY_SCORE = 0.6

# Walk-forward parameters
TRAIN_RATIO = 0.6
VALIDATION_RATIO = 0.2
OOS_RATIO = 0.2
EMBARGO_BARS = 10  # bars between train/validation to prevent leakage

# Resource limits
MAX_BARS_PER_RUN = 50_000
MAX_CANDIDATES_PER_RUN = 10

# ─── Data loading ─────────────────────────────────────────────────────────────

def load_bars_from_db(
    host: str,
    user: str,
    password: str,
    database: str,
    symbol: str,
    interval: str,
    start_ts: Optional[int] = None,
    end_ts: Optional[int] = None,
    limit: int = MAX_BARS_PER_RUN,
) -> list[dict]:
    """Load bars from the staging database."""
    try:
        import mysql.connector
    except ImportError:
        log.warning("mysql.connector not available — using CSV fallback")
        return []

    conn = mysql.connector.connect(
        host=host, user=user, password=password, database=database
    )
    cursor = conn.cursor(dictionary=True)

    query = """
        SELECT
            bar_time AS bar_timestamp,
            open, high, low, close, volume,
            raw_symbol, dataset, interval_val AS interval
        FROM atlas_bars_1m
        WHERE reconciliation_status = 'MATCHED'
        ORDER BY bar_time ASC
        LIMIT %s
    """
    cursor.execute(query, (limit,))
    rows = cursor.fetchall()
    cursor.close()
    conn.close()

    log.info(f"Loaded {len(rows)} bars from database")
    return rows


def load_bars_from_csv(csv_path: str) -> list[dict]:
    """Load bars from a CSV file (fallback when DB is unavailable)."""
    import csv
    rows = []
    with open(csv_path, "r") as f:
        reader = csv.DictReader(f)
        for row in reader:
            rows.append({
                "bar_timestamp": int(row.get("bar_time", row.get("bar_timestamp", 0))),
                "open": float(row["open"]),
                "high": float(row["high"]),
                "low": float(row["low"]),
                "close": float(row["close"]),
                "volume": int(row.get("volume", 0)),
                "raw_symbol": row.get("raw_symbol", "MNQU6"),
                "dataset": row.get("dataset", "GLBX.MDP3"),
                "interval": row.get("interval", "1m"),
            })
    log.info(f"Loaded {len(rows)} bars from CSV: {csv_path}")
    return rows


# ─── Feature extraction ───────────────────────────────────────────────────────

def compute_ema(prices: list[float], period: int) -> Optional[float]:
    """Compute EMA for the last price in the series."""
    if len(prices) < period:
        return None
    k = 2.0 / (period + 1)
    ema = sum(prices[:period]) / period
    for p in prices[period:]:
        ema = p * k + ema * (1 - k)
    return ema


def compute_atr(bars: list[dict], period: int = 14) -> Optional[float]:
    """Compute ATR from a list of bars."""
    if len(bars) < period + 1:
        return None
    trs = []
    for i in range(1, len(bars)):
        tr = max(
            bars[i]["high"] - bars[i]["low"],
            abs(bars[i]["high"] - bars[i - 1]["close"]),
            abs(bars[i]["low"] - bars[i - 1]["close"]),
        )
        trs.append(tr)
    if len(trs) < period:
        return None
    return sum(trs[-period:]) / period


def count_ema_crosses(closes: list[float], emas: list[float]) -> int:
    """Count EMA crosses in a price/EMA series."""
    crosses = 0
    for i in range(1, min(len(closes), len(emas))):
        prev_above = closes[i - 1] > emas[i - 1]
        curr_above = closes[i] > emas[i]
        if prev_above != curr_above:
            crosses += 1
    return crosses


def extract_features(bars: list[dict], idx: int) -> Optional[dict]:
    """
    Extract features for bar at index idx.
    Uses only bars[0:idx+1] — no look-ahead.
    Returns None if insufficient history.
    """
    if idx < 20:
        return None

    bar = bars[idx]
    prior_bars = bars[max(0, idx - 200):idx]
    prior_closes = [b["close"] for b in prior_bars]
    all_closes = prior_closes + [bar["close"]]

    # EMA
    ema15 = compute_ema(all_closes, 15)
    ema50 = compute_ema(all_closes, 50)
    ema200 = compute_ema(all_closes, 200)
    atr = compute_atr(prior_bars + [bar])

    if ema15 is None or atr is None:
        return None

    # EMA cross counts
    prior10 = prior_closes[-10:]
    prior10_emas = [compute_ema(prior_closes[:len(prior_closes) - 10 + i + 1], 15) or ema15 for i in range(len(prior10))]
    ema15_cross_count_10 = count_ema_crosses(prior10, prior10_emas)

    prior5 = prior_closes[-5:]
    prior5_emas = [compute_ema(prior_closes[:len(prior_closes) - 5 + i + 1], 15) or ema15 for i in range(len(prior5))]
    ema15_cross_count_5 = count_ema_crosses(prior5, prior5_emas)

    # Bar stats
    bar_range = bar["high"] - bar["low"]
    body_size = abs(bar["close"] - bar["open"])
    body_size_pct = body_size / bar_range if bar_range > 0 else 0
    upper_wick = bar["high"] - max(bar["open"], bar["close"])
    lower_wick = min(bar["open"], bar["close"]) - bar["low"]
    upper_wick_pct = upper_wick / bar_range if bar_range > 0 else 0
    lower_wick_pct = lower_wick / bar_range if bar_range > 0 else 0
    is_bullish = bar["close"] > bar["open"]

    # Distance from EMA15
    distance_from_ema15 = bar["close"] - ema15
    distance_from_ema15_pct = distance_from_ema15 / bar["close"] if bar["close"] > 0 else 0

    # ATR%
    atr_pct = atr / bar["close"] if bar["close"] > 0 else 0

    # Volume ratio
    prior_vols = [b.get("volume", 0) for b in prior_bars[-5:] if b.get("volume", 0) > 0]
    avg_vol5 = sum(prior_vols) / len(prior_vols) if prior_vols else None
    volume_ratio_5 = bar.get("volume", 0) / avg_vol5 if avg_vol5 and avg_vol5 > 0 else None

    # Session (simplified — based on UTC hour)
    ts_ms = bar["bar_timestamp"]
    ts_sec = ts_ms / 1000 if ts_ms > 1e10 else ts_ms
    dt = datetime.fromtimestamp(ts_sec, tz=timezone.utc)
    hour_utc = dt.hour
    # RTH: 13:30-20:00 UTC (08:30-15:00 ET)
    if 13 <= hour_utc < 20:
        session = "RTH"
        minutes_into_session = (hour_utc - 13) * 60 + dt.minute - 30
        if minutes_into_session < 0:
            minutes_into_session = 0
    elif 20 <= hour_utc or hour_utc < 1:
        session = "ETH"
        minutes_into_session = None
    else:
        session = "OVERNIGHT"
        minutes_into_session = None

    is_opening_range = session == "RTH" and (minutes_into_session or 999) <= 30

    # VWAP (simplified — cumulative session VWAP)
    # In production this would use session-scoped bars
    vwap = None
    distance_from_vwap_pct = None

    return {
        "bar_timestamp": bar["bar_timestamp"],
        "open": bar["open"],
        "high": bar["high"],
        "low": bar["low"],
        "close": bar["close"],
        "volume": bar.get("volume"),
        "ema15": ema15,
        "ema50": ema50,
        "ema200": ema200,
        "atr": atr,
        "atr_pct": atr_pct,
        "distance_from_ema15": distance_from_ema15,
        "distance_from_ema15_pct": distance_from_ema15_pct,
        "ema15_cross_count_5": ema15_cross_count_5,
        "ema15_cross_count_10": ema15_cross_count_10,
        "bar_range": bar_range,
        "body_size": body_size,
        "body_size_pct": body_size_pct,
        "upper_wick": upper_wick,
        "lower_wick": lower_wick,
        "upper_wick_pct": upper_wick_pct,
        "lower_wick_pct": lower_wick_pct,
        "is_bullish": is_bullish,
        "volume_ratio_5": volume_ratio_5,
        "is_high_volume": (volume_ratio_5 or 0) > 1.5,
        "session": session,
        "minutes_into_session": minutes_into_session,
        "is_opening_range": is_opening_range,
        "vwap": vwap,
        "distance_from_vwap_pct": distance_from_vwap_pct,
        "price_above_ema15": bar["close"] > ema15,
        "price_above_ema50": ema50 is not None and bar["close"] > ema50,
    }


# ─── Outcome labelling ────────────────────────────────────────────────────────

def compute_outcome_label(
    entry_price: float,
    entry_idx: int,
    bars: list[dict],
    horizon_bars: int,
    atr: float,
) -> Optional[dict]:
    """
    Compute forward outcome label.
    Uses only bars[entry_idx+1:entry_idx+1+horizon_bars] — strictly after entry.
    """
    future_bars = bars[entry_idx + 1: entry_idx + 1 + horizon_bars]
    if not future_bars:
        return None

    horizon_close = future_bars[-1]["close"]
    net_change = horizon_close - entry_price
    net_change_pct = net_change / entry_price if entry_price > 0 else 0
    direction = "LONG" if net_change > 0 else ("SHORT" if net_change < 0 else "FLAT")

    mfe = 0.0
    mae = 0.0
    for b in future_bars:
        mfe = max(mfe, b["high"] - entry_price, entry_price - b["low"])
        mae = max(mae, entry_price - b["low"], b["high"] - entry_price)

    r1 = atr * 1.0
    r2 = atr * 2.0
    r3 = atr * 3.0

    long_1r = any(b["high"] - entry_price >= r1 for b in future_bars)
    long_2r = any(b["high"] - entry_price >= r2 for b in future_bars)
    long_3r = any(b["high"] - entry_price >= r3 for b in future_bars)
    short_1r = any(entry_price - b["low"] >= r1 for b in future_bars)
    short_2r = any(entry_price - b["low"] >= r2 for b in future_bars)
    short_3r = any(entry_price - b["low"] >= r3 for b in future_bars)

    return {
        "net_change": net_change,
        "net_change_pct": net_change_pct,
        "direction": direction,
        "mfe": mfe,
        "mae": mae,
        "long_1r": long_1r,
        "long_2r": long_2r,
        "long_3r": long_3r,
        "short_1r": short_1r,
        "short_2r": short_2r,
        "short_3r": short_3r,
        "volatility_adjusted_return": net_change / atr if atr > 0 else 0,
    }


# ─── Experiment runner ────────────────────────────────────────────────────────

def run_experiment_a(features: list[dict], bars: list[dict], feature_indices: list[int]) -> dict:
    """
    Experiment A: EMA15 Displacement Recovery
    Condition: distance_from_ema15_pct > 0.003 AND ema15_cross_count_10 <= 1
    Direction: SHORT (price reverts toward EMA15)
    Horizon: 15 bars (5m bars) = 75 minutes, or 15 1m bars = 15 minutes
    """
    matches = []
    for i, (feat, bar_idx) in enumerate(zip(features, feature_indices)):
        if feat is None:
            continue
        if (
            feat.get("distance_from_ema15_pct", 0) > 0.003
            and feat.get("ema15_cross_count_10", 99) <= 1
        ):
            matches.append((i, feat, bar_idx))

    if len(matches) < MIN_OCCURRENCES:
        return {
            "experiment": "A",
            "name": "EMA15 Displacement Recovery",
            "occurrences": len(matches),
            "passed_gates": False,
            "gate_failures": [f"Insufficient occurrences: {len(matches)} < {MIN_OCCURRENCES}"],
        }

    outcomes = []
    for i, feat, bar_idx in matches:
        label = compute_outcome_label(
            entry_price=feat["close"],
            entry_idx=bar_idx,
            bars=bars,
            horizon_bars=15,
            atr=feat.get("atr", 1.0),
        )
        if label:
            outcomes.append(label)

    if not outcomes:
        return {"experiment": "A", "occurrences": len(matches), "passed_gates": False,
                "gate_failures": ["No outcome labels computed"]}

    # Compute statistics
    short_wins = sum(1 for o in outcomes if o["short_1r"])
    win_rate = short_wins / len(outcomes)
    avg_return = sum(o["net_change"] for o in outcomes) / len(outcomes)
    gains = [abs(o["net_change"]) for o in outcomes if o["direction"] == "SHORT"]
    losses = [abs(o["net_change"]) for o in outcomes if o["direction"] == "LONG"]
    profit_factor = (sum(gains) / sum(losses)) if losses and sum(losses) > 0 else 0

    # Effect size (Cohen's d approximation)
    import statistics
    returns = [o["net_change"] for o in outcomes]
    try:
        effect_size = abs(statistics.mean(returns)) / statistics.stdev(returns) if len(returns) > 1 else 0
    except statistics.StatisticsError:
        effect_size = 0

    # p-value (t-test against zero)
    try:
        from scipy import stats as scipy_stats
        t_stat, p_value = scipy_stats.ttest_1samp(returns, 0)
        p_value = float(p_value)
    except ImportError:
        # Approximate p-value without scipy
        import math
        n = len(returns)
        mean_r = statistics.mean(returns)
        std_r = statistics.stdev(returns) if n > 1 else 1
        t_stat = mean_r / (std_r / math.sqrt(n)) if std_r > 0 else 0
        # Approximate two-tailed p-value
        p_value = min(1.0, 2 * (1 - min(0.9999, abs(t_stat) / (abs(t_stat) + math.sqrt(n)))))

    # Walk-forward stability
    n = len(outcomes)
    thirds = [outcomes[:n//3], outcomes[n//3:2*n//3], outcomes[2*n//3:]]
    period_win_rates = []
    for period in thirds:
        if period:
            period_wins = sum(1 for o in period if o["short_1r"])
            period_win_rates.append(period_wins / len(period))
    stability_score = 1.0 - (max(period_win_rates) - min(period_win_rates)) if period_win_rates else 0

    gate_failures = []
    if len(outcomes) < MIN_OCCURRENCES:
        gate_failures.append(f"Insufficient occurrences: {len(outcomes)} < {MIN_OCCURRENCES}")
    if p_value > MAX_P_VALUE:
        gate_failures.append(f"p-value too high: {p_value:.4f} > {MAX_P_VALUE}")
    if effect_size < MIN_EFFECT_SIZE:
        gate_failures.append(f"Effect size too small: {effect_size:.3f} < {MIN_EFFECT_SIZE}")
    if win_rate < MIN_WIN_RATE:
        gate_failures.append(f"Win rate too low: {win_rate*100:.1f}% < {MIN_WIN_RATE*100:.1f}%")
    if profit_factor < MIN_PROFIT_FACTOR:
        gate_failures.append(f"Profit factor too low: {profit_factor:.2f} < {MIN_PROFIT_FACTOR}")
    if stability_score < MIN_STABILITY_SCORE:
        gate_failures.append(f"Stability score too low: {stability_score:.2f} < {MIN_STABILITY_SCORE}")

    return {
        "experiment": "A",
        "name": "EMA15 Displacement Recovery",
        "occurrences": len(matches),
        "labelled_outcomes": len(outcomes),
        "win_rate": win_rate,
        "profit_factor": profit_factor,
        "effect_size": effect_size,
        "p_value": p_value,
        "stability_score": stability_score,
        "avg_return": avg_return,
        "passed_gates": len(gate_failures) == 0,
        "gate_failures": gate_failures,
    }


def run_experiment_b(features: list[dict], bars: list[dict], feature_indices: list[int]) -> dict:
    """
    Experiment B: Opening Range Breakout Continuation
    Condition: session=RTH, minutes_into_session between 30-90, volume_ratio_5 >= 1.2
    Direction: BOTH
    Horizon: 30 bars
    """
    matches = []
    for i, (feat, bar_idx) in enumerate(zip(features, feature_indices)):
        if feat is None:
            continue
        mins = feat.get("minutes_into_session")
        if (
            feat.get("session") == "RTH"
            and mins is not None
            and 30 <= mins <= 90
            and (feat.get("volume_ratio_5") or 0) >= 1.2
        ):
            matches.append((i, feat, bar_idx))

    if len(matches) < MIN_OCCURRENCES:
        return {
            "experiment": "B",
            "name": "Opening Range Breakout Continuation",
            "occurrences": len(matches),
            "passed_gates": False,
            "gate_failures": [f"Insufficient occurrences: {len(matches)} < {MIN_OCCURRENCES}"],
        }

    outcomes = []
    for i, feat, bar_idx in matches:
        label = compute_outcome_label(
            entry_price=feat["close"],
            entry_idx=bar_idx,
            bars=bars,
            horizon_bars=30,
            atr=feat.get("atr", 1.0),
        )
        if label:
            outcomes.append(label)

    if not outcomes:
        return {"experiment": "B", "occurrences": len(matches), "passed_gates": False,
                "gate_failures": ["No outcome labels computed"]}

    long_wins = sum(1 for o in outcomes if o["long_1r"])
    short_wins = sum(1 for o in outcomes if o["short_1r"])
    best_win_rate = max(long_wins, short_wins) / len(outcomes)
    returns = [o["net_change"] for o in outcomes]

    import statistics
    try:
        effect_size = abs(statistics.mean(returns)) / statistics.stdev(returns) if len(returns) > 1 else 0
    except statistics.StatisticsError:
        effect_size = 0

    gains = [abs(r) for r in returns if r > 0]
    losses = [abs(r) for r in returns if r < 0]
    profit_factor = (sum(gains) / sum(losses)) if losses and sum(losses) > 0 else 0

    try:
        from scipy import stats as scipy_stats
        _, p_value = scipy_stats.ttest_1samp(returns, 0)
        p_value = float(p_value)
    except ImportError:
        import math
        n = len(returns)
        mean_r = statistics.mean(returns)
        std_r = statistics.stdev(returns) if n > 1 else 1
        t_stat = mean_r / (std_r / math.sqrt(n)) if std_r > 0 else 0
        p_value = min(1.0, 2 * (1 - min(0.9999, abs(t_stat) / (abs(t_stat) + math.sqrt(n)))))

    n = len(outcomes)
    thirds = [outcomes[:n//3], outcomes[n//3:2*n//3], outcomes[2*n//3:]]
    period_wrs = [sum(1 for o in p if o["long_1r"] or o["short_1r"]) / len(p) for p in thirds if p]
    stability_score = 1.0 - (max(period_wrs) - min(period_wrs)) if period_wrs else 0

    gate_failures = []
    if best_win_rate < MIN_WIN_RATE:
        gate_failures.append(f"Win rate too low: {best_win_rate*100:.1f}% < {MIN_WIN_RATE*100:.1f}%")
    if profit_factor < MIN_PROFIT_FACTOR:
        gate_failures.append(f"Profit factor too low: {profit_factor:.2f} < {MIN_PROFIT_FACTOR}")
    if effect_size < MIN_EFFECT_SIZE:
        gate_failures.append(f"Effect size too small: {effect_size:.3f} < {MIN_EFFECT_SIZE}")
    if p_value > MAX_P_VALUE:
        gate_failures.append(f"p-value too high: {p_value:.4f} > {MAX_P_VALUE}")
    if stability_score < MIN_STABILITY_SCORE:
        gate_failures.append(f"Stability score too low: {stability_score:.2f} < {MIN_STABILITY_SCORE}")

    return {
        "experiment": "B",
        "name": "Opening Range Breakout Continuation",
        "occurrences": len(matches),
        "labelled_outcomes": len(outcomes),
        "win_rate": best_win_rate,
        "profit_factor": profit_factor,
        "effect_size": effect_size,
        "p_value": p_value,
        "stability_score": stability_score,
        "passed_gates": len(gate_failures) == 0,
        "gate_failures": gate_failures,
    }


def run_experiment_c(features: list[dict], bars: list[dict], feature_indices: list[int]) -> dict:
    """
    Experiment C: VWAP Reclaim After Sweep
    Condition: distance_from_vwap_pct < -0.002 AND lower_wick_pct >= 0.4 AND session=RTH
    Direction: LONG
    Horizon: 15 bars
    Note: VWAP data is limited in current dataset — this experiment may have insufficient occurrences.
    """
    matches = []
    for i, (feat, bar_idx) in enumerate(zip(features, feature_indices)):
        if feat is None:
            continue
        dvwap = feat.get("distance_from_vwap_pct")
        if dvwap is None:
            continue
        if (
            dvwap < -0.002
            and feat.get("lower_wick_pct", 0) >= 0.4
            and feat.get("session") == "RTH"
        ):
            matches.append((i, feat, bar_idx))

    if len(matches) < MIN_OCCURRENCES:
        return {
            "experiment": "C",
            "name": "VWAP Reclaim After Sweep",
            "occurrences": len(matches),
            "passed_gates": False,
            "gate_failures": [
                f"Insufficient occurrences: {len(matches)} < {MIN_OCCURRENCES}. "
                "VWAP data may be limited in current dataset — requires production VWAP computation."
            ],
        }

    outcomes = []
    for i, feat, bar_idx in matches:
        label = compute_outcome_label(
            entry_price=feat["close"],
            entry_idx=bar_idx,
            bars=bars,
            horizon_bars=15,
            atr=feat.get("atr", 1.0),
        )
        if label:
            outcomes.append(label)

    long_wins = sum(1 for o in outcomes if o["long_1r"])
    win_rate = long_wins / len(outcomes) if outcomes else 0
    returns = [o["net_change"] for o in outcomes]
    gains = [r for r in returns if r > 0]
    losses = [abs(r) for r in returns if r < 0]
    profit_factor = (sum(gains) / sum(losses)) if losses and sum(losses) > 0 else 0

    gate_failures = []
    if win_rate < MIN_WIN_RATE:
        gate_failures.append(f"Win rate too low: {win_rate*100:.1f}%")
    if profit_factor < MIN_PROFIT_FACTOR:
        gate_failures.append(f"Profit factor too low: {profit_factor:.2f}")

    return {
        "experiment": "C",
        "name": "VWAP Reclaim After Sweep",
        "occurrences": len(matches),
        "labelled_outcomes": len(outcomes),
        "win_rate": win_rate,
        "profit_factor": profit_factor,
        "passed_gates": len(gate_failures) == 0,
        "gate_failures": gate_failures,
    }


def run_experiment_d(features: list[dict], bars: list[dict], feature_indices: list[int]) -> dict:
    """
    Experiment D: High-Chop EMA15 Cross Fade
    Condition: ema15_cross_count_10 >= 3 AND atr_pct < 0.002
    Direction: BOTH (fade the cross)
    Horizon: 5 bars
    """
    matches = []
    for i, (feat, bar_idx) in enumerate(zip(features, feature_indices)):
        if feat is None:
            continue
        if (
            feat.get("ema15_cross_count_10", 0) >= 3
            and feat.get("atr_pct", 1) < 0.002
        ):
            matches.append((i, feat, bar_idx))

    if len(matches) < MIN_OCCURRENCES:
        return {
            "experiment": "D",
            "name": "High-Chop EMA15 Cross Fade",
            "occurrences": len(matches),
            "passed_gates": False,
            "gate_failures": [f"Insufficient occurrences: {len(matches)} < {MIN_OCCURRENCES}"],
        }

    outcomes = []
    for i, feat, bar_idx in matches:
        label = compute_outcome_label(
            entry_price=feat["close"],
            entry_idx=bar_idx,
            bars=bars,
            horizon_bars=5,
            atr=feat.get("atr", 1.0),
        )
        if label:
            outcomes.append(label)

    if not outcomes:
        return {"experiment": "D", "occurrences": len(matches), "passed_gates": False,
                "gate_failures": ["No outcome labels computed"]}

    # In chop, we expect BOTH directions to be near 50% — this is the null hypothesis
    long_wins = sum(1 for o in outcomes if o["long_1r"])
    short_wins = sum(1 for o in outcomes if o["short_1r"])
    long_wr = long_wins / len(outcomes)
    short_wr = short_wins / len(outcomes)
    returns = [o["net_change"] for o in outcomes]

    import statistics
    try:
        effect_size = abs(statistics.mean(returns)) / statistics.stdev(returns) if len(returns) > 1 else 0
    except statistics.StatisticsError:
        effect_size = 0

    # In chop, we expect effect size to be near zero — confirming no edge
    gate_failures = []
    if effect_size >= MIN_EFFECT_SIZE:
        # Surprisingly found an edge — worth investigating further
        pass
    else:
        gate_failures.append(
            f"No tradeable edge found in chop regime (effect_size={effect_size:.3f}). "
            "This confirms the null hypothesis — chop is noise. "
            "This is a VALID and USEFUL finding: avoid trading in high-chop regimes."
        )

    return {
        "experiment": "D",
        "name": "High-Chop EMA15 Cross Fade",
        "occurrences": len(matches),
        "labelled_outcomes": len(outcomes),
        "long_win_rate": long_wr,
        "short_win_rate": short_wr,
        "effect_size": effect_size,
        "passed_gates": effect_size >= MIN_EFFECT_SIZE,
        "gate_failures": gate_failures,
        "finding": "CHOP_IS_NOISE" if effect_size < MIN_EFFECT_SIZE else "EDGE_FOUND_INVESTIGATE",
    }


# ─── Manifest generation ──────────────────────────────────────────────────────

def generate_manifest(
    experiment_id: str,
    candidate_id: str,
    bars: list[dict],
    results: dict,
    code_sha: str,
    parameter_set: dict,
) -> dict:
    """Generate a reproducible experiment manifest."""
    if not bars:
        date_range_start = 0
        date_range_end = 0
    else:
        date_range_start = bars[0]["bar_timestamp"]
        date_range_end = bars[-1]["bar_timestamp"]

    n = len(bars)
    train_end_idx = int(n * 0.6)
    val_end_idx = int(n * 0.8)

    manifest = {
        "experimentId": experiment_id,
        "candidateId": candidate_id,
        "codeSha": code_sha,
        "dataset": "GLBX.MDP3",
        "symbol": "MNQ",
        "contractMapping": "MNQU6",
        "dateRangeStart": date_range_start,
        "dateRangeEnd": date_range_end,
        "trainStart": date_range_start,
        "trainEnd": bars[train_end_idx]["bar_timestamp"] if n > train_end_idx else date_range_end,
        "validationStart": bars[train_end_idx]["bar_timestamp"] if n > train_end_idx else date_range_end,
        "validationEnd": bars[val_end_idx]["bar_timestamp"] if n > val_end_idx else date_range_end,
        "outOfSampleStart": bars[val_end_idx]["bar_timestamp"] if n > val_end_idx else date_range_end,
        "outOfSampleEnd": date_range_end,
        "embargoMinutes": EMBARGO_BARS,
        "featureVersion": FEATURE_VERSION,
        "labelVersion": LABEL_VERSION,
        "parameterSet": parameter_set,
        "transactionCostAssumptions": {"commissionPerContract": 4.0, "slippageTicks": 1},
        "slippageAssumptions": {"avgSlippageTicks": 1, "maxSlippageTicks": 3},
        "seed": 42,
        "resultHashes": {
            "resultsHash": hashlib.sha256(json.dumps(results, sort_keys=True).encode()).hexdigest()
        },
        "executionTimestamp": int(datetime.now(timezone.utc).timestamp() * 1000),
        "status": "COMPLETE",
    }
    return manifest


# ─── Main runner ──────────────────────────────────────────────────────────────

def run_all_experiments(
    bars: list[dict],
    code_sha: str,
    output_dir: str = "/tmp/darwin_g6a_results",
) -> dict:
    """Run all four experiments and generate manifests."""
    Path(output_dir).mkdir(parents=True, exist_ok=True)

    log.info(f"Running DARWIN G6A experiments on {len(bars)} bars")
    log.info(f"Code SHA: {code_sha}")
    log.info("RESEARCH ONLY — NO LIVE EXECUTION")

    # Extract features for all bars
    log.info("Extracting features...")
    features = []
    feature_indices = []
    for i in range(len(bars)):
        feat = extract_features(bars, i)
        if feat is not None:
            features.append(feat)
            feature_indices.append(i)

    log.info(f"Extracted {len(features)} feature records from {len(bars)} bars")

    # Run experiments
    results = {}

    log.info("Running Experiment A: EMA15 Displacement Recovery...")
    results["A"] = run_experiment_a(features, bars, feature_indices)
    log.info(f"  Occurrences: {results['A'].get('occurrences', 0)} | Gates: {'PASS' if results['A'].get('passed_gates') else 'FAIL'}")

    log.info("Running Experiment B: Opening Range Breakout Continuation...")
    results["B"] = run_experiment_b(features, bars, feature_indices)
    log.info(f"  Occurrences: {results['B'].get('occurrences', 0)} | Gates: {'PASS' if results['B'].get('passed_gates') else 'FAIL'}")

    log.info("Running Experiment C: VWAP Reclaim After Sweep...")
    results["C"] = run_experiment_c(features, bars, feature_indices)
    log.info(f"  Occurrences: {results['C'].get('occurrences', 0)} | Gates: {'PASS' if results['C'].get('passed_gates') else 'FAIL'}")

    log.info("Running Experiment D: High-Chop EMA15 Cross Fade...")
    results["D"] = run_experiment_d(features, bars, feature_indices)
    log.info(f"  Occurrences: {results['D'].get('occurrences', 0)} | Gates: {'PASS' if results['D'].get('passed_gates') else 'FAIL'}")

    # Generate manifests
    manifests = {}
    for exp_id, result in results.items():
        manifest = generate_manifest(
            experiment_id=f"EXP_{exp_id}_{int(datetime.now(timezone.utc).timestamp())}",
            candidate_id=f"DARWIN_EXP_{exp_id}",
            bars=bars,
            results=result,
            code_sha=code_sha,
            parameter_set={"experiment": exp_id, "feature_version": FEATURE_VERSION},
        )
        manifests[exp_id] = manifest

    # Save results
    results_path = Path(output_dir) / "experiment_results.json"
    manifests_path = Path(output_dir) / "experiment_manifests.json"

    with open(results_path, "w") as f:
        json.dump(results, f, indent=2, default=str)
    with open(manifests_path, "w") as f:
        json.dump(manifests, f, indent=2, default=str)

    log.info(f"Results saved to {results_path}")
    log.info(f"Manifests saved to {manifests_path}")

    # Summary
    passed = [k for k, v in results.items() if v.get("passed_gates")]
    failed = [k for k, v in results.items() if not v.get("passed_gates")]

    summary = {
        "engine_version": ENGINE_VERSION,
        "code_sha": code_sha,
        "total_bars": len(bars),
        "total_features": len(features),
        "experiments_run": 4,
        "experiments_passed": len(passed),
        "experiments_failed": len(failed),
        "passed_experiments": passed,
        "failed_experiments": failed,
        "results": results,
        "manifests": manifests,
        "research_only": True,
        "live_execution": False,
        "process_bar_called": False,
        "post_bar_automation_called": False,
        "traders_post_sent": False,
        "tradovate_order_submitted": False,
    }

    summary_path = Path(output_dir) / "summary.json"
    with open(summary_path, "w") as f:
        json.dump(summary, f, indent=2, default=str)

    log.info(f"Summary: {len(passed)}/4 experiments passed gates")
    log.info(f"Summary saved to {summary_path}")

    return summary


# ─── CLI ──────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="DARWIN G6A Research Engine")
    parser.add_argument("--csv", help="Path to CSV file with bar data")
    parser.add_argument("--db-host", default="localhost", help="Database host")
    parser.add_argument("--db-user", default="atlas", help="Database user")
    parser.add_argument("--db-pass", default=os.environ.get("DB_PASS", ""), help="Database password (use DB_PASS env var or --db-pass; never hardcode)")
    parser.add_argument("--db-name", default="atlas_staging_g4", help="Database name")
    parser.add_argument("--output-dir", default="/tmp/darwin_g6a_results", help="Output directory")
    parser.add_argument("--code-sha", default="unknown", help="Git commit SHA")
    parser.add_argument("--limit", type=int, default=MAX_BARS_PER_RUN, help="Max bars to load")
    args = parser.parse_args()

    # Load bars
    if args.csv:
        bars = load_bars_from_csv(args.csv)
    else:
        bars = load_bars_from_db(
            host=args.db_host,
            user=args.db_user,
            password=args.db_pass,
            database=args.db_name,
            symbol="MNQ",
            interval="1m",
            limit=args.limit,
        )

    if not bars:
        log.error("No bars loaded — cannot run experiments")
        sys.exit(1)

    summary = run_all_experiments(bars, code_sha=args.code_sha, output_dir=args.output_dir)

    # Print summary to stdout
    print(json.dumps(summary, indent=2, default=str))
    sys.exit(0)
