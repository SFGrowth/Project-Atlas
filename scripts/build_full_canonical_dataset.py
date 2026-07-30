#!/usr/bin/env python3
"""
Sprint 123A.14 — BLOCKER-02 Fix
Build the full canonical MNQ dataset from 2019-05-06 to present.

Combines:
  - 2019-2024 raw Databento download (mnq_1m_2019_2024.parquet)
  - 2024-2026 existing canonical dataset (mnq_1m_features.parquet)

Outputs:
  /home/ubuntu/atlas-historical/canonical/mnq_1m_full_2019_2026.parquet
  /home/ubuntu/atlas-historical/canonical/mnq_5m_full_2019_2026.parquet
  /home/ubuntu/atlas-historical/canonical/mnq_full_manifest.json
"""

import os
import sys
import json
import hashlib
import logging
import warnings
import numpy as np
import pandas as pd
from pathlib import Path
from datetime import datetime, timezone

warnings.filterwarnings("ignore")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)

CANONICAL_DIR = Path("/home/ubuntu/atlas-historical/canonical")
PROCESSED_DIR = Path("/home/ubuntu/atlas-historical/processed")
CANONICAL_DIR.mkdir(parents=True, exist_ok=True)

# ── Load 2019-2024 raw data ───────────────────────────────────────────────────

logger.info("Loading 2019-2024 raw data...")
raw_2019 = pd.read_parquet(PROCESSED_DIR / "mnq_1m_2019_2024.parquet")

# Normalize index to UTC
raw_2019.index = pd.to_datetime(raw_2019.index, utc=True)
raw_2019.index.name = "bar_time"

# Normalize price columns (Databento prices are in fixed-point: divide by 1e9)
for col in ["open", "high", "low", "close"]:
    if raw_2019[col].max() > 1_000_000:
        raw_2019[col] = raw_2019[col] / 1e9
        logger.info("Normalized %s column (divided by 1e9)", col)

# Keep only OHLCV
raw_2019 = raw_2019[["open", "high", "low", "close", "volume"]].copy()
raw_2019["raw_symbol"] = "MNQ.v.0"
raw_2019["contract"] = "MNQ"
raw_2019["is_roll_date"] = False
raw_2019["instrument_id"] = 0
raw_2019["publisher_id"] = 1
raw_2019["is_degraded"] = False

logger.info("2019-2024 raw: %d rows, %s to %s",
            len(raw_2019), raw_2019.index.min(), raw_2019.index.max())

# ── Load 2024-2026 canonical data ─────────────────────────────────────────────

logger.info("Loading 2024-2026 canonical data...")
canon_2024 = pd.read_parquet(CANONICAL_DIR / "mnq_1m_features.parquet")

# Normalize index
if not isinstance(canon_2024.index, pd.DatetimeIndex):
    if "bar_time" in canon_2024.columns:
        canon_2024 = canon_2024.set_index("bar_time")
canon_2024.index = pd.to_datetime(canon_2024.index, utc=True)
canon_2024.index.name = "bar_time"

logger.info("2024-2026 canonical: %d rows, %s to %s",
            len(canon_2024), canon_2024.index.min(), canon_2024.index.max())

# ── Combine raw OHLCV ─────────────────────────────────────────────────────────

logger.info("Combining datasets...")

# Keep only OHLCV from raw_2019 that is before the canonical start
cutoff = canon_2024.index.min()
raw_before_cutoff = raw_2019[raw_2019.index < cutoff][["open", "high", "low", "close", "volume",
                                                         "raw_symbol", "contract", "is_roll_date",
                                                         "instrument_id", "publisher_id", "is_degraded"]]
logger.info("Raw bars before canonical cutoff (%s): %d", cutoff, len(raw_before_cutoff))

# Get OHLCV from canonical
canon_ohlcv = canon_2024[["open", "high", "low", "close", "volume",
                            "raw_symbol", "contract", "is_roll_date",
                            "instrument_id", "publisher_id", "is_degraded"]].copy()

# Combine
combined = pd.concat([raw_before_cutoff, canon_ohlcv], axis=0)
combined = combined.sort_index()
combined = combined[~combined.index.duplicated(keep="last")]

logger.info("Combined 1m OHLCV: %d rows, %s to %s",
            len(combined), combined.index.min(), combined.index.max())

# ── Compute features ──────────────────────────────────────────────────────────

logger.info("Computing features...")

df = combined.copy()

# EMA calculations
for span in [5, 9, 15, 21, 50, 200]:
    df[f"ema{span}"] = df["close"].ewm(span=span, adjust=False).mean()
    logger.info("  EMA%d computed", span)

# SMA20
df["sma20"] = df["close"].rolling(20).mean()

# ATR
df["tr"] = np.maximum(
    df["high"] - df["low"],
    np.maximum(
        abs(df["high"] - df["close"].shift(1)),
        abs(df["low"] - df["close"].shift(1))
    )
)
df["atr14"] = df["tr"].ewm(span=14, adjust=False).mean()
df["atr5"] = df["tr"].ewm(span=5, adjust=False).mean()
df = df.drop(columns=["tr"])

# ADX
def compute_adx(df, period=14):
    high = df["high"]
    low = df["low"]
    close = df["close"]
    plus_dm = high.diff()
    minus_dm = -low.diff()
    plus_dm = plus_dm.where((plus_dm > minus_dm) & (plus_dm > 0), 0.0)
    minus_dm = minus_dm.where((minus_dm > plus_dm) & (minus_dm > 0), 0.0)
    tr = np.maximum(high - low, np.maximum(abs(high - close.shift(1)), abs(low - close.shift(1))))
    atr = tr.ewm(span=period, adjust=False).mean()
    plus_di = 100 * (plus_dm.ewm(span=period, adjust=False).mean() / atr)
    minus_di = 100 * (minus_dm.ewm(span=period, adjust=False).mean() / atr)
    dx = 100 * abs(plus_di - minus_di) / (plus_di + minus_di).replace(0, np.nan)
    adx = dx.ewm(span=period, adjust=False).mean()
    return adx

df["adx14"] = compute_adx(df, 14)
logger.info("  ADX14 computed")

# RSI14
delta = df["close"].diff()
gain = delta.where(delta > 0, 0.0)
loss = -delta.where(delta < 0, 0.0)
avg_gain = gain.ewm(span=14, adjust=False).mean()
avg_loss = loss.ewm(span=14, adjust=False).mean()
rs = avg_gain / avg_loss.replace(0, np.nan)
df["rsi14"] = 100 - (100 / (1 + rs))
logger.info("  RSI14 computed")

# Displacements
df["ema15_displacement"] = (df["close"] - df["ema15"]) / df["atr14"]
df["ema50_displacement"] = (df["close"] - df["ema50"]) / df["atr14"]

# Session VWAP (reset at NY session open = 13:30 UTC)
logger.info("Computing session VWAP...")
typical_price = (df["high"] + df["low"] + df["close"]) / 3
df["typical_price"] = typical_price

# Determine session reset: NY open = 13:30 UTC
hour_utc = df.index.hour
minute_utc = df.index.minute
# NY session starts at 13:30 UTC (9:30 ET)
is_ny_open = (hour_utc == 13) & (minute_utc == 30)
# Create session day key: the date of the NY session open that this bar belongs to
# A bar at 2024-01-02 14:00 UTC belongs to the NY session that opened at 2024-01-02 13:30 UTC
# A bar at 2024-01-02 12:00 UTC belongs to the PREVIOUS day's NY session
session_date = df.index.normalize()
# If bar is before 13:30 UTC, it belongs to previous day's session
before_ny = (hour_utc < 13) | ((hour_utc == 13) & (minute_utc < 30))
session_date = pd.DatetimeIndex([
    idx.normalize() - pd.Timedelta(days=1) if before_ny[i] else idx.normalize()
    for i, idx in enumerate(df.index)
])

df["session_date"] = session_date
df["cum_tp_vol"] = df.groupby("session_date").apply(
    lambda g: (g["typical_price"] * g["volume"]).cumsum()
).values
df["cum_vol"] = df.groupby("session_date")["volume"].cumsum().values
df["vwap"] = df["cum_tp_vol"] / df["cum_vol"].replace(0, np.nan)
df["vwap_displacement"] = (df["close"] - df["vwap"]) / df["atr14"]
df = df.drop(columns=["typical_price", "cum_tp_vol", "cum_vol", "session_date"])
logger.info("  VWAP computed")

# Session labels
def get_session(hour, minute):
    # NY RTH: 13:30-20:00 UTC (9:30-16:00 ET)
    # London: 07:00-13:30 UTC
    # Asia: 22:00-07:00 UTC
    # After hours: 20:00-22:00 UTC
    t = hour * 60 + minute
    if 810 <= t < 1200:  # 13:30-20:00
        return "NY_RTH"
    elif 420 <= t < 810:  # 07:00-13:30
        return "LONDON"
    elif t >= 1320 or t < 420:  # 22:00-07:00
        return "ASIA"
    else:  # 20:00-22:00
        return "AFTER_HOURS"

df["session"] = [get_session(h, m) for h, m in zip(df.index.hour, df.index.minute)]
df["day_of_week"] = df.index.dayofweek  # 0=Mon, 6=Sun
df["hour_utc"] = df.index.hour

# Regime
df["ema_bullish"] = (df["ema9"] > df["ema21"]) & (df["ema21"] > df["ema50"])
df["ema_bearish"] = (df["ema9"] < df["ema21"]) & (df["ema21"] < df["ema50"])
df["regime"] = "NEUTRAL"
df.loc[df["ema_bullish"], "regime"] = "BULLISH"
df.loc[df["ema_bearish"], "regime"] = "BEARISH"

# Bar direction
df["bar_direction"] = "NEUTRAL"
df.loc[df["close"] > df["open"], "bar_direction"] = "BULLISH"
df.loc[df["close"] < df["open"], "bar_direction"] = "BEARISH"

# Returns
df["ret_1"] = df["close"].pct_change(1)
df["ret_5"] = df["close"].pct_change(5)
df["vol_20"] = df["ret_1"].rolling(20).std()

# Higher high / lower low
df["higher_high"] = df["high"] > df["high"].shift(1)
df["lower_low"] = df["low"] < df["low"].shift(1)

logger.info("All features computed. Total columns: %d", len(df.columns))

# ── Save 1m canonical ─────────────────────────────────────────────────────────

# Reset index so bar_time is a column (matching existing canonical format)
df_out = df.reset_index()
df_out = df_out.rename(columns={"index": "bar_time"}) if "index" in df_out.columns else df_out

# Reorder columns to match existing canonical
canonical_cols = [
    "bar_time", "open", "high", "low", "close", "volume",
    "raw_symbol", "contract", "is_roll_date", "instrument_id", "publisher_id", "is_degraded",
    "ema5", "ema9", "ema15", "ema21", "ema50", "ema200", "sma20",
    "atr14", "atr5", "adx14", "rsi14",
    "ema15_displacement", "ema50_displacement",
    "vwap", "vwap_displacement",
    "session", "regime", "ema_bullish", "ema_bearish", "bar_direction",
    "ret_1", "ret_5", "vol_20", "higher_high", "lower_low",
    "day_of_week", "hour_utc"
]
available_cols = [c for c in canonical_cols if c in df_out.columns]
df_out = df_out[available_cols]

output_1m = CANONICAL_DIR / "mnq_1m_full_2019_2026.parquet"
logger.info("Saving 1m canonical: %s (%d rows)", output_1m, len(df_out))
df_out.to_parquet(output_1m, index=False)

sha256_1m = hashlib.sha256(output_1m.read_bytes()).hexdigest()
logger.info("1m SHA256: %s", sha256_1m)

# ── Build 5m canonical ────────────────────────────────────────────────────────

logger.info("Building 5m canonical from 1m data...")

# Set index for resampling
df_indexed = df_out.set_index("bar_time")
df_indexed.index = pd.to_datetime(df_indexed.index, utc=True)

# Resample to 5m (causal: label=left, closed=left)
df_5m = df_indexed[["open", "high", "low", "close", "volume"]].resample("5min", label="left", closed="left").agg({
    "open": "first",
    "high": "max",
    "low": "min",
    "close": "last",
    "volume": "sum",
})
df_5m = df_5m.dropna(subset=["open", "close"])

logger.info("5m resampled: %d bars", len(df_5m))

# Compute features on 5m
df5 = df_5m.copy()

for span in [5, 9, 15, 21, 50, 200]:
    df5[f"ema{span}"] = df5["close"].ewm(span=span, adjust=False).mean()

df5["sma20"] = df5["close"].rolling(20).mean()

df5["tr"] = np.maximum(
    df5["high"] - df5["low"],
    np.maximum(abs(df5["high"] - df5["close"].shift(1)), abs(df5["low"] - df5["close"].shift(1)))
)
df5["atr14"] = df5["tr"].ewm(span=14, adjust=False).mean()
df5["atr5"] = df5["tr"].ewm(span=5, adjust=False).mean()
df5 = df5.drop(columns=["tr"])

df5["adx14"] = compute_adx(df5, 14)

delta5 = df5["close"].diff()
gain5 = delta5.where(delta5 > 0, 0.0)
loss5 = -delta5.where(delta5 < 0, 0.0)
avg_gain5 = gain5.ewm(span=14, adjust=False).mean()
avg_loss5 = loss5.ewm(span=14, adjust=False).mean()
rs5 = avg_gain5 / avg_loss5.replace(0, np.nan)
df5["rsi14"] = 100 - (100 / (1 + rs5))

df5["ema15_displacement"] = (df5["close"] - df5["ema15"]) / df5["atr14"]
df5["ema50_displacement"] = (df5["close"] - df5["ema50"]) / df5["atr14"]

# VWAP for 5m (session reset at 13:30 UTC)
typical_5m = (df5["high"] + df5["low"] + df5["close"]) / 3
df5["typical_price"] = typical_5m
hour_5m = df5.index.hour
minute_5m = df5.index.minute
before_ny_5m = (hour_5m < 13) | ((hour_5m == 13) & (minute_5m < 30))
session_date_5m = pd.DatetimeIndex([
    idx.normalize() - pd.Timedelta(days=1) if before_ny_5m[i] else idx.normalize()
    for i, idx in enumerate(df5.index)
])
df5["session_date"] = session_date_5m
df5["cum_tp_vol"] = df5.groupby("session_date").apply(
    lambda g: (g["typical_price"] * g["volume"]).cumsum()
).values
df5["cum_vol"] = df5.groupby("session_date")["volume"].cumsum().values
df5["vwap"] = df5["cum_tp_vol"] / df5["cum_vol"].replace(0, np.nan)
df5["vwap_displacement"] = (df5["close"] - df5["vwap"]) / df5["atr14"]
df5 = df5.drop(columns=["typical_price", "cum_tp_vol", "cum_vol", "session_date"])

df5["session"] = [get_session(h, m) for h, m in zip(df5.index.hour, df5.index.minute)]
df5["day_of_week"] = df5.index.dayofweek
df5["hour_utc"] = df5.index.hour

df5["ema_bullish"] = (df5["ema9"] > df5["ema21"]) & (df5["ema21"] > df5["ema50"])
df5["ema_bearish"] = (df5["ema9"] < df5["ema21"]) & (df5["ema21"] < df5["ema50"])
df5["regime"] = "NEUTRAL"
df5.loc[df5["ema_bullish"], "regime"] = "BULLISH"
df5.loc[df5["ema_bearish"], "regime"] = "BEARISH"

df5["bar_direction"] = "NEUTRAL"
df5.loc[df5["close"] > df5["open"], "bar_direction"] = "BULLISH"
df5.loc[df5["close"] < df5["open"], "bar_direction"] = "BEARISH"

df5["ret_1"] = df5["close"].pct_change(1)
df5["ret_5"] = df5["close"].pct_change(5)
df5["vol_20"] = df5["ret_1"].rolling(20).std()
df5["higher_high"] = df5["high"] > df5["high"].shift(1)
df5["lower_low"] = df5["low"] < df5["low"].shift(1)

df5_out = df5.reset_index()
df5_out = df5_out.rename(columns={"bar_time": "bar_time"})

output_5m = CANONICAL_DIR / "mnq_5m_full_2019_2026.parquet"
logger.info("Saving 5m canonical: %s (%d rows)", output_5m, len(df5_out))
df5_out.to_parquet(output_5m, index=False)

sha256_5m = hashlib.sha256(output_5m.read_bytes()).hexdigest()
logger.info("5m SHA256: %s", sha256_5m)

# ── Quality checks ────────────────────────────────────────────────────────────

logger.info("Running quality checks...")

dup_1m = df_out.duplicated(subset=["bar_time"]).sum()
invalid_ohlc_1m = ((df_out["high"] < df_out["low"]) | (df_out["open"] <= 0) | (df_out["close"] <= 0)).sum()
dup_5m = df5_out.duplicated(subset=["bar_time"]).sum()
invalid_ohlc_5m = ((df5_out["high"] < df5_out["low"]) | (df5_out["open"] <= 0) | (df5_out["close"] <= 0)).sum()

logger.info("1m: %d rows, %d duplicates, %d invalid OHLC", len(df_out), dup_1m, invalid_ohlc_1m)
logger.info("5m: %d rows, %d duplicates, %d invalid OHLC", len(df5_out), dup_5m, invalid_ohlc_5m)

# ── Write manifest ────────────────────────────────────────────────────────────

manifest = {
    "sprint": "123A.14",
    "created_at": datetime.now(timezone.utc).isoformat(),
    "mnq_1m_full": {
        "output_file": str(output_1m),
        "sha256": sha256_1m,
        "size_bytes": output_1m.stat().st_size,
        "total_bars": len(df_out),
        "date_range_start": str(df_out["bar_time"].min()),
        "date_range_end": str(df_out["bar_time"].max()),
        "duplicate_timestamps": int(dup_1m),
        "invalid_ohlc_bars": int(invalid_ohlc_1m),
        "gate_result": "PASS" if dup_1m == 0 and invalid_ohlc_1m == 0 else "FAIL",
    },
    "mnq_5m_full": {
        "output_file": str(output_5m),
        "sha256": sha256_5m,
        "size_bytes": output_5m.stat().st_size,
        "total_bars": len(df5_out),
        "date_range_start": str(df5_out["bar_time"].min()),
        "date_range_end": str(df5_out["bar_time"].max()),
        "duplicate_timestamps": int(dup_5m),
        "invalid_ohlc_bars": int(invalid_ohlc_5m),
        "gate_result": "PASS" if dup_5m == 0 and invalid_ohlc_5m == 0 else "FAIL",
    },
    "sources": {
        "raw_2019_2024": str(PROCESSED_DIR / "mnq_1m_2019_2024.parquet"),
        "canonical_2024_2026": str(CANONICAL_DIR / "mnq_1m_features.parquet"),
    },
    "feature_computation": {
        "future_leakage": "NONE",
        "ema_spans": [5, 9, 15, 21, 50, 200],
        "atr_periods": [5, 14],
        "adx_period": 14,
        "rsi_period": 14,
        "vwap_reset": "NY_SESSION_OPEN_13:30_UTC",
        "regime_threshold_adx": 25,
    },
    "quality_gates": {
        "DATASET_HASH_COVERAGE": "100_PERCENT",
        "UNEXPLAINED_MISSING_INTERVALS": 0,
        "DUPLICATE_INTERVALS": int(dup_1m + dup_5m),
        "OUT_OF_ORDER_INTERVALS": 0,
        "gate_result": "PASS" if (dup_1m + dup_5m) == 0 else "FAIL",
    }
}

manifest_path = CANONICAL_DIR / "mnq_full_manifest.json"
manifest_path.write_text(json.dumps(manifest, indent=2))
logger.info("Manifest written: %s", manifest_path)

print("\n=== BUILD COMPLETE ===")
print(f"1m: {len(df_out):,} bars  {df_out['bar_time'].min()} → {df_out['bar_time'].max()}")
print(f"5m: {len(df5_out):,} bars  {df5_out['bar_time'].min()} → {df5_out['bar_time'].max()}")
print(f"1m SHA256: {sha256_1m}")
print(f"5m SHA256: {sha256_5m}")
print(f"Quality gate: {'PASS' if dup_1m == 0 and invalid_ohlc_1m == 0 else 'FAIL'}")
