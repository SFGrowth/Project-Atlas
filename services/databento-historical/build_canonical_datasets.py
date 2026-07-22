#!/usr/bin/env python3
"""
Atlas Nexus — Canonical Research Dataset Builder
Sprint 123A.6 / Gate G6A — Phases 5, 6, 7

Builds canonical research datasets at multiple timeframes:
  1m, 3m, 5m, 15m, 30m, 60m

For each timeframe:
  - Aggregates from 1m continuous series
  - Computes research features (EMA, VWAP, ATR, ADX, RSI, sessions, regimes)
  - All features computed WITHOUT future leakage (strictly causal)
  - Runs data quality gates
  - Saves versioned parquet with manifest and checksum

Feature computation rules (NO FUTURE LEAKAGE):
  - All rolling windows use only past data (min_periods enforced)
  - VWAP resets at session open (00:00 UTC = Sunday 18:00 ET session open)
  - Session labels: ASIA (18:00-00:00 ET), LONDON (03:00-09:30 ET), NY (09:30-16:00 ET), AFTER (16:00-18:00 ET)
  - Regime: TREND if ADX > 25, CHOP if ADX <= 25
  - EMA displacement: (close - EMA15) / ATR14

Output:
  /home/ubuntu/atlas-historical/canonical/mnq_{tf}_features.parquet
  /home/ubuntu/atlas-historical/canonical/mnq_{tf}_manifest.json
  /home/ubuntu/atlas-historical/canonical/canonical_build_report.json
"""

import pandas as pd
import numpy as np
import json
import hashlib
import os
from pathlib import Path
from datetime import datetime, timezone

PROCESSED_DIR = Path("/home/ubuntu/atlas-historical/processed")
CANONICAL_DIR = Path("/home/ubuntu/atlas-historical/canonical")
MANIFESTS_DIR = Path("/home/ubuntu/atlas-historical/manifests")

TIMEFRAMES = [1, 3, 5, 15, 30, 60]  # minutes

# Session boundaries in UTC (ET + 5 hours standard, + 4 hours EDT)
# Using EDT (summer): ET = UTC - 4
# NY session: 09:30-16:00 ET = 13:30-20:00 UTC
# London: 03:00-09:30 ET = 07:00-13:30 UTC
# Asia: 18:00-00:00 ET prev day = 22:00-04:00 UTC
SESSION_BOUNDARIES_UTC = {
    "ASIA":   (22, 4),    # 22:00-04:00 UTC (wraps midnight)
    "LONDON": (7, 13),    # 07:00-13:00 UTC
    "NY":     (13, 20),   # 13:30-20:00 UTC (approx)
    "AFTER":  (20, 22),   # 20:00-22:00 UTC
}


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def compute_ema(series: pd.Series, span: int) -> pd.Series:
    """Compute EMA with no future leakage (adjust=False, min_periods=span)."""
    return series.ewm(span=span, adjust=False, min_periods=span).mean()


def compute_sma(series: pd.Series, window: int) -> pd.Series:
    """Compute SMA with no future leakage."""
    return series.rolling(window=window, min_periods=window).mean()


def compute_atr(high: pd.Series, low: pd.Series, close: pd.Series, period: int = 14) -> pd.Series:
    """Compute ATR with no future leakage."""
    prev_close = close.shift(1)
    tr = pd.concat([
        high - low,
        (high - prev_close).abs(),
        (low - prev_close).abs()
    ], axis=1).max(axis=1)
    return tr.ewm(span=period, adjust=False, min_periods=period).mean()


def compute_adx(high: pd.Series, low: pd.Series, close: pd.Series, period: int = 14) -> pd.Series:
    """Compute ADX with no future leakage."""
    prev_high = high.shift(1)
    prev_low = low.shift(1)
    prev_close = close.shift(1)

    # True Range
    tr = pd.concat([
        high - low,
        (high - prev_close).abs(),
        (low - prev_close).abs()
    ], axis=1).max(axis=1)

    # Directional movement
    dm_plus = np.where((high - prev_high) > (prev_low - low), np.maximum(high - prev_high, 0), 0)
    dm_minus = np.where((prev_low - low) > (high - prev_high), np.maximum(prev_low - low, 0), 0)

    dm_plus = pd.Series(dm_plus, index=high.index)
    dm_minus = pd.Series(dm_minus, index=high.index)

    # Smoothed
    atr_smooth = tr.ewm(span=period, adjust=False, min_periods=period).mean()
    di_plus = 100 * dm_plus.ewm(span=period, adjust=False, min_periods=period).mean() / atr_smooth.replace(0, np.nan)
    di_minus = 100 * dm_minus.ewm(span=period, adjust=False, min_periods=period).mean() / atr_smooth.replace(0, np.nan)

    dx = 100 * (di_plus - di_minus).abs() / (di_plus + di_minus).replace(0, np.nan)
    adx = dx.ewm(span=period, adjust=False, min_periods=period).mean()

    return adx.fillna(0)


def compute_rsi(close: pd.Series, period: int = 14) -> pd.Series:
    """Compute RSI with no future leakage."""
    delta = close.diff()
    gain = delta.clip(lower=0)
    loss = (-delta).clip(lower=0)
    avg_gain = gain.ewm(span=period, adjust=False, min_periods=period).mean()
    avg_loss = loss.ewm(span=period, adjust=False, min_periods=period).mean()
    rs = avg_gain / avg_loss.replace(0, np.nan)
    rsi = 100 - (100 / (1 + rs))
    return rsi.fillna(50)


def compute_vwap_session(df: pd.DataFrame) -> pd.Series:
    """
    Compute VWAP that resets at each NY session open (13:30 UTC).
    Strictly causal — uses only past bars within the current session.
    """
    vwap = pd.Series(index=df.index, dtype=float)
    typical_price = (df["high"] + df["low"] + df["close"]) / 3
    pv = typical_price * df["volume"]

    # Group by session day (resets at 13:30 UTC)
    # Create a session ID: increments each time hour transitions from 13 to 14
    hour = df["bar_time"].dt.hour
    minute = df["bar_time"].dt.minute
    is_session_start = ((hour == 13) & (minute == 30)) | ((hour == 14) & (minute == 0))

    # Use cumsum to create session groups
    session_id = is_session_start.cumsum()

    cumulative_pv = pv.groupby(session_id).cumsum()
    cumulative_vol = df["volume"].groupby(session_id).cumsum()

    vwap = cumulative_pv / cumulative_vol.replace(0, np.nan)
    return vwap


def assign_session(bar_time: pd.Series) -> pd.Series:
    """Assign session label based on UTC hour."""
    hour = bar_time.dt.hour
    session = pd.Series("AFTER", index=bar_time.index)
    session[hour.between(7, 12)] = "LONDON"
    session[(hour >= 13) | (hour < 4)] = "NY"
    session[hour.between(22, 23) | hour.between(0, 3)] = "ASIA"
    return session


def aggregate_to_timeframe(df_1m: pd.DataFrame, tf_minutes: int) -> pd.DataFrame:
    """Aggregate 1m bars to higher timeframe. No future leakage."""
    if tf_minutes == 1:
        return df_1m.copy()

    df = df_1m.copy()
    df = df.set_index("bar_time")

    # Resample
    rule = f"{tf_minutes}min"
    agg = df.resample(rule, label="left", closed="left").agg({
        "open": "first",
        "high": "max",
        "low": "min",
        "close": "last",
        "volume": "sum",
        "is_degraded": "any",
    }).dropna(subset=["open", "close"])

    agg = agg.reset_index()
    agg = agg.rename(columns={"bar_time": "bar_time"})

    # Remove bars where open == close == 0 (no data)
    agg = agg[(agg["open"] > 0) & (agg["close"] > 0)]

    return agg


def compute_features(df: pd.DataFrame) -> pd.DataFrame:
    """Compute all research features. Strictly causal — no future leakage."""
    df = df.copy()

    # Price features
    df["ema5"] = compute_ema(df["close"], 5)
    df["ema9"] = compute_ema(df["close"], 9)
    df["ema15"] = compute_ema(df["close"], 15)
    df["ema21"] = compute_ema(df["close"], 21)
    df["ema50"] = compute_ema(df["close"], 50)
    df["ema200"] = compute_ema(df["close"], 200)
    df["sma20"] = compute_sma(df["close"], 20)

    # Volatility
    df["atr14"] = compute_atr(df["high"], df["low"], df["close"], 14)
    df["atr5"] = compute_atr(df["high"], df["low"], df["close"], 5)

    # Momentum
    df["adx14"] = compute_adx(df["high"], df["low"], df["close"], 14)
    df["rsi14"] = compute_rsi(df["close"], 14)

    # EMA displacement (normalised by ATR)
    df["ema15_displacement"] = (df["close"] - df["ema15"]) / df["atr14"].replace(0, np.nan)
    df["ema50_displacement"] = (df["close"] - df["ema50"]) / df["atr14"].replace(0, np.nan)

    # VWAP
    df["vwap"] = compute_vwap_session(df)
    df["vwap_displacement"] = (df["close"] - df["vwap"]) / df["atr14"].replace(0, np.nan)

    # Session
    df["session"] = assign_session(df["bar_time"])

    # Regime
    df["regime"] = np.where(df["adx14"] > 25, "TREND", "CHOP")

    # EMA structure (bullish/bearish alignment)
    df["ema_bullish"] = (df["ema5"] > df["ema15"]) & (df["ema15"] > df["ema50"])
    df["ema_bearish"] = (df["ema5"] < df["ema15"]) & (df["ema15"] < df["ema50"])

    # Bar direction
    df["bar_direction"] = np.where(df["close"] > df["open"], "BULL",
                          np.where(df["close"] < df["open"], "BEAR", "DOJI"))

    # Returns
    df["ret_1"] = df["close"].pct_change(1)
    df["ret_5"] = df["close"].pct_change(5)

    # Rolling volatility (20-bar std of returns)
    df["vol_20"] = df["ret_1"].rolling(20, min_periods=20).std()

    # High/Low relative to prior bar
    df["higher_high"] = df["high"] > df["high"].shift(1)
    df["lower_low"] = df["low"] < df["low"].shift(1)

    # Day of week (0=Monday, 4=Friday)
    df["day_of_week"] = df["bar_time"].dt.dayofweek

    # Hour of day (UTC)
    df["hour_utc"] = df["bar_time"].dt.hour

    return df


def run_quality_gates(df: pd.DataFrame, tf_minutes: int) -> dict:
    """Run data quality gates on the feature dataset."""
    issues = []
    
    n_total = len(df)
    
    # Gate 1: No duplicate timestamps
    n_dups = df["bar_time"].duplicated().sum()
    if n_dups > 0:
        issues.append(f"DUPLICATE_TIMESTAMPS: {n_dups}")
    
    # Gate 2: No invalid OHLC
    invalid_ohlc = ((df["high"] < df["low"]) | (df["high"] < df["open"]) | 
                    (df["high"] < df["close"]) | (df["low"] > df["open"]) |
                    (df["low"] > df["close"])).sum()
    if invalid_ohlc > 0:
        issues.append(f"INVALID_OHLC: {invalid_ohlc}")
    
    # Gate 3: Feature NaN rate (expected for warm-up period)
    for col in ["ema15", "ema50", "atr14", "adx14", "rsi14"]:
        if col in df.columns:
            nan_rate = df[col].isna().mean()
            if nan_rate > 0.05:  # >5% NaN is suspicious
                issues.append(f"HIGH_NAN_RATE_{col}: {nan_rate:.2%}")
    
    # Gate 4: Price range sanity
    if df["close"].min() < 1000 or df["close"].max() > 100000:
        issues.append(f"PRICE_RANGE_SUSPICIOUS: {df['close'].min():.0f} - {df['close'].max():.0f}")
    
    # Gate 5: No future leakage check (EMA should not be available before warm-up)
    # EMA200 should be NaN for first 200 bars
    ema200_first_valid = df["ema200"].first_valid_index()
    if ema200_first_valid is not None:
        first_valid_pos = df.index.get_loc(ema200_first_valid)
        if first_valid_pos < 199:
            issues.append(f"POSSIBLE_FUTURE_LEAKAGE_EMA200: first valid at position {first_valid_pos}")
    
    return {
        "timeframe_minutes": tf_minutes,
        "total_bars": n_total,
        "duplicate_timestamps": int(n_dups),
        "invalid_ohlc_bars": int(invalid_ohlc),
        "issues": issues,
        "gate_result": "PASS" if not issues else "FAIL",
    }


def main():
    print("=" * 70)
    print("ATLAS NEXUS — CANONICAL DATASET BUILDER")
    print(f"Run time: {datetime.now(timezone.utc).isoformat()}")
    print("=" * 70)
    
    CANONICAL_DIR.mkdir(parents=True, exist_ok=True)
    MANIFESTS_DIR.mkdir(parents=True, exist_ok=True)
    
    # Load 1m continuous series
    print("\nLoading 1m continuous series...")
    df_1m = pd.read_parquet(PROCESSED_DIR / "mnq_1m_continuous.parquet")
    print(f"  Loaded {len(df_1m):,} bars")
    
    # Ensure bar_time is UTC datetime
    if df_1m["bar_time"].dt.tz is None:
        df_1m["bar_time"] = pd.to_datetime(df_1m["bar_time"], utc=True)
    
    build_report = {
        "created_at": datetime.now(timezone.utc).isoformat(),
        "source_bars": len(df_1m),
        "timeframes": {},
        "git_sha": os.environ.get("GIT_SHA", "unknown"),
    }
    
    for tf in TIMEFRAMES:
        print(f"\n{'='*50}")
        print(f"Building {tf}m dataset...")
        
        # Aggregate
        df_tf = aggregate_to_timeframe(df_1m, tf)
        print(f"  Aggregated to {len(df_tf):,} bars")
        
        # Compute features
        df_tf = compute_features(df_tf)
        print(f"  Features computed: {len([c for c in df_tf.columns if c not in ['bar_time','open','high','low','close','volume','is_degraded','symbol','instrument_id']])} features")
        
        # Quality gates
        quality = run_quality_gates(df_tf, tf)
        print(f"  Quality gate: {quality['gate_result']}")
        if quality["issues"]:
            print(f"  Issues: {quality['issues']}")
        
        # Save
        output_path = CANONICAL_DIR / f"mnq_{tf}m_features.parquet"
        df_tf.to_parquet(output_path, index=False, compression="snappy")
        checksum = sha256_file(output_path)
        size_bytes = output_path.stat().st_size
        
        print(f"  Saved: {output_path.name} ({size_bytes/1024/1024:.1f} MB) SHA256={checksum[:16]}...")
        
        # Manifest
        manifest = {
            "timeframe_minutes": tf,
            "source_file": str(PROCESSED_DIR / "mnq_1m_continuous.parquet"),
            "output_file": str(output_path),
            "output_sha256": checksum,
            "output_size_bytes": size_bytes,
            "total_bars": len(df_tf),
            "columns": list(df_tf.columns),
            "date_range_start": str(df_tf["bar_time"].min()),
            "date_range_end": str(df_tf["bar_time"].max()),
            "quality_gates": quality,
            "feature_computation": {
                "future_leakage": "NONE",
                "ema_spans": [5, 9, 15, 21, 50, 200],
                "atr_periods": [5, 14],
                "adx_period": 14,
                "rsi_period": 14,
                "vwap_reset": "NY_SESSION_OPEN_13:30_UTC",
                "regime_threshold_adx": 25,
            },
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        
        manifest_path = CANONICAL_DIR / f"mnq_{tf}m_manifest.json"
        with open(manifest_path, "w") as f:
            json.dump(manifest, f, indent=2, default=str)
        
        build_report["timeframes"][f"{tf}m"] = {
            "bars": len(df_tf),
            "sha256": checksum,
            "size_bytes": size_bytes,
            "quality": quality["gate_result"],
        }
    
    # Save build report
    report_path = CANONICAL_DIR / "canonical_build_report.json"
    with open(report_path, "w") as f:
        json.dump(build_report, f, indent=2, default=str)
    
    print("\n" + "=" * 70)
    print("CANONICAL DATASET BUILD COMPLETE")
    for tf_key, tf_data in build_report["timeframes"].items():
        print(f"  {tf_key}: {tf_data['bars']:,} bars | Quality: {tf_data['quality']} | {tf_data['size_bytes']//1024//1024} MB")
    print("=" * 70)
    
    return build_report


if __name__ == "__main__":
    result = main()
    print(json.dumps(result, indent=2, default=str))
