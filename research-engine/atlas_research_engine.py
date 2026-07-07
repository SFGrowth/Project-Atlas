#!/usr/bin/env python3

import argparse
import math
import zipfile
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd


@dataclass
class Trade:
    trade_id: int
    direction: int
    entry_time: str
    exit_time: str
    entry_price: float
    exit_price: float
    stop_price: float
    target_price: float
    risk_points: float
    risk_dollars: float
    r_multiple: float
    pnl: float
    bars_in_trade: int
    exit_reason: str
    pressure_code: int
    location_code: int
    structure_code: int
    trend_score: int
    session_code: int
    volatility_code: int
    risk_mode_code: int
    regime_code: int
    chop_score: int
    h001_flag: int


def find_column(df, candidates):
    lower_map = {c.lower().strip(): c for c in df.columns}
    for name in candidates:
        if name.lower() in lower_map:
            return lower_map[name.lower()]
    return None


def load_ohlcv(path):
    df = pd.read_csv(path)

    open_col = find_column(df, ["open", "o"])
    high_col = find_column(df, ["high", "h"])
    low_col = find_column(df, ["low", "l"])
    close_col = find_column(df, ["close", "c"])
    volume_col = find_column(df, ["volume", "v"])

    if not all([open_col, high_col, low_col, close_col, volume_col]):
        raise ValueError(f"Missing OHLCV columns. Found: {list(df.columns)}")

    ts_utc_col = find_column(df, ["timestamp_utc", "time_utc", "datetime_utc"])
    ts_et_col = find_column(df, ["timestamp_et", "time_et", "datetime_et", "timestamp"])

    out = pd.DataFrame()
    if ts_utc_col:
        out["timestamp_utc"] = pd.to_datetime(df[ts_utc_col], utc=True, errors="coerce")
    elif ts_et_col:
        temp = pd.to_datetime(df[ts_et_col], errors="coerce")
        if getattr(temp.dt, "tz", None) is None:
            temp = temp.dt.tz_localize("America/New_York", nonexistent="shift_forward", ambiguous="NaT")
        out["timestamp_utc"] = temp.dt.tz_convert("UTC")
    else:
        raise ValueError("No timestamp column found.")

    out["timestamp_et"] = out["timestamp_utc"].dt.tz_convert("America/New_York")
    out["open"] = pd.to_numeric(df[open_col], errors="coerce")
    out["high"] = pd.to_numeric(df[high_col], errors="coerce")
    out["low"] = pd.to_numeric(df[low_col], errors="coerce")
    out["close"] = pd.to_numeric(df[close_col], errors="coerce")
    out["volume"] = pd.to_numeric(df[volume_col], errors="coerce").fillna(0)

    symbol_col = find_column(df, ["symbol", "ticker", "contract"])
    out["symbol"] = df[symbol_col].astype(str) if symbol_col else ""

    out = out.dropna(subset=["timestamp_utc", "open", "high", "low", "close"])
    out = out.sort_values("timestamp_utc").drop_duplicates("timestamp_utc").reset_index(drop=True)
    return out


def rsi(close, length):
    delta = close.diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    avg_gain = gain.ewm(alpha=1 / length, adjust=False, min_periods=length).mean()
    avg_loss = loss.ewm(alpha=1 / length, adjust=False, min_periods=length).mean()
    rs = avg_gain / avg_loss.replace(0, np.nan)
    return (100 - (100 / (1 + rs))).fillna(50)


def true_range(df):
    prev_close = df["close"].shift(1)
    return pd.concat(
        [
            df["high"] - df["low"],
            (df["high"] - prev_close).abs(),
            (df["low"] - prev_close).abs(),
        ],
        axis=1,
    ).max(axis=1)


def classify_session(ts_et):
    minutes = ts_et.dt.hour * 60 + ts_et.dt.minute

    session = pd.Series(0, index=ts_et.index)
    premarket = (minutes >= 4 * 60) & (minutes <= 9 * 60 + 29)
    opening = (minutes >= 9 * 60 + 30) & (minutes < 10 * 60)
    mid_morning = (minutes >= 10 * 60) & (minutes < 11 * 60 + 30)
    midday = (minutes >= 11 * 60 + 30) & (minutes < 14 * 60)
    power_hour = (minutes >= 15 * 60) & (minutes < 16 * 60)
    regular = (minutes >= 9 * 60 + 30) & (minutes < 16 * 60)

    session.loc[premarket] = 1
    session.loc[opening] = 2
    session.loc[mid_morning] = 3
    session.loc[midday] = 4
    session.loc[power_hour] = 5
    session.loc[~regular & ~premarket] = 6
    return session


def add_features(df):
    fast_ema_len = 15
    slow_ema_len = 50
    slope_lookback = 10
    rsi_len = 14
    atr_len = 14
    atr_baseline_len = 50
    cross_lookback = 20
    stop_swing_lookback = 8
    low_vol_mult = 0.75
    high_vol_mult = 1.25
    heavy_cross_threshold = 3
    mild_chop_threshold = 2
    heavy_chop_threshold = 4
    extension_atr_threshold = 2.0
    major_level_atr_threshold = 0.50
    impulse_atr_threshold = 1.20
    strong_body_atr_threshold = 0.80
    volume_baseline_len = 50
    round_number_interval = 100.0

    df = df.copy()
    df["date_et"] = df["timestamp_et"].dt.date
    df["session_code"] = classify_session(df["timestamp_et"])
    df["session_allows_risk_on"] = df["session_code"].isin([0, 2, 3, 4, 5]).astype(int)

    df["fast_ema"] = df["close"].ewm(span=fast_ema_len, adjust=False).mean()
    df["slow_ema"] = df["close"].ewm(span=slow_ema_len, adjust=False).mean()
    df["fast_ema_slope"] = df["fast_ema"] - df["fast_ema"].shift(slope_lookback)
    df["slow_ema_slope"] = df["slow_ema"] - df["slow_ema"].shift(slope_lookback)

    hlc3 = (df["high"] + df["low"] + df["close"]) / 3.0
    pv = hlc3 * df["volume"]
    vwap_den = df["volume"].groupby(df["date_et"]).cumsum().replace(0, np.nan)
    df["vwap"] = pv.groupby(df["date_et"]).cumsum() / vwap_den
    df["vwap"] = df["vwap"].ffill()

    tr = true_range(df)
    df["atr"] = tr.ewm(alpha=1 / atr_len, adjust=False, min_periods=atr_len).mean()
    df["atr_baseline"] = df["atr"].rolling(atr_baseline_len, min_periods=atr_baseline_len).mean()
    df["atr_ratio"] = df["atr"] / df["atr_baseline"].replace(0, np.nan)
    df["high_volatility"] = df["atr"] > df["atr_baseline"] * high_vol_mult
    df["low_volatility"] = df["atr"] < df["atr_baseline"] * low_vol_mult
    df["volatility_code"] = np.where(df["high_volatility"], 1, np.where(df["low_volatility"], -1, 0))

    df["rsi"] = rsi(df["close"], rsi_len)

    ema_bull = df["fast_ema"] > df["slow_ema"]
    ema_bear = df["fast_ema"] < df["slow_ema"]
    slope_bull = df["fast_ema_slope"] > 0
    slope_bear = df["fast_ema_slope"] < 0
    above_vwap = df["close"] > df["vwap"]
    below_vwap = df["close"] < df["vwap"]
    mom_bull = df["rsi"] >= 55
    mom_bear = df["rsi"] <= 45

    df["trend_score"] = 0
    df["trend_score"] += np.where(ema_bull, 1, np.where(ema_bear, -1, 0))
    df["trend_score"] += np.where(slope_bull, 1, np.where(slope_bear, -1, 0))
    df["trend_score"] += np.where(above_vwap, 1, np.where(below_vwap, -1, 0))
    df["trend_score"] += np.where(mom_bull, 1, np.where(mom_bear, -1, 0))

    df["strong_bull_trend"] = df["trend_score"] >= 3
    df["strong_bear_trend"] = df["trend_score"] <= -3
    df["bias_code"] = np.where(df["strong_bull_trend"], 1, np.where(df["strong_bear_trend"], -1, 0))
    df["weak_trend"] = df["trend_score"].between(-1, 1)

    df["ema_cross"] = ((df["close"] > df["fast_ema"]) != (df["close"].shift(1) > df["fast_ema"].shift(1))).astype(int)
    df["vwap_cross"] = ((df["close"] > df["vwap"]) != (df["close"].shift(1) > df["vwap"].shift(1))).astype(int)
    df["ema_cross_count_20"] = df["ema_cross"].rolling(cross_lookback, min_periods=1).sum()
    df["vwap_cross_count_20"] = df["vwap_cross"].rolling(cross_lookback, min_periods=1).sum()

    daily = df.groupby("date_et").agg(day_high=("high", "max"), day_low=("low", "min"), day_close=("close", "last"))
    daily["prev_day_high"] = daily["day_high"].shift(1)
    daily["prev_day_low"] = daily["day_low"].shift(1)
    daily["prev_day_close"] = daily["day_close"].shift(1)
    df = df.merge(daily[["prev_day_high", "prev_day_low", "prev_day_close"]], left_on="date_et", right_index=True, how="left")

    df["premarket_high"] = np.nan
    df["premarket_low"] = np.nan
    df["opening_range_high"] = np.nan
    df["opening_range_low"] = np.nan

    for _, idx in df.groupby("date_et").groups.items():
        day = df.loc[list(idx)]
        pre = day[day["session_code"] == 1]
        opening = day[day["session_code"] == 2]

        if not pre.empty:
            df.loc[pre.index, "premarket_high"] = pre["high"].cummax()
            df.loc[pre.index, "premarket_low"] = pre["low"].cummin()
            df.loc[day.index, "premarket_high"] = df.loc[day.index, "premarket_high"].ffill()
            df.loc[day.index, "premarket_low"] = df.loc[day.index, "premarket_low"].ffill()

        if not opening.empty:
            df.loc[opening.index, "opening_range_high"] = opening["high"].cummax()
            df.loc[opening.index, "opening_range_low"] = opening["low"].cummin()
            df.loc[day.index, "opening_range_high"] = df.loc[day.index, "opening_range_high"].ffill()
            df.loc[day.index, "opening_range_low"] = df.loc[day.index, "opening_range_low"].ffill()

    df["bar_body"] = (df["close"] - df["open"]).abs()
    df["bar_range"] = df["high"] - df["low"]
    df["body_atr"] = df["bar_body"] / df["atr"].replace(0, np.nan)
    df["range_atr"] = df["bar_range"] / df["atr"].replace(0, np.nan)
    df["close_position_range"] = (df["close"] - df["low"]) / df["bar_range"].replace(0, np.nan)
    df["distance_fast_ema_atr"] = (df["close"] - df["fast_ema"]) / df["atr"].replace(0, np.nan)
    df["distance_vwap_atr"] = (df["close"] - df["vwap"]) / df["atr"].replace(0, np.nan)

    recent_high = df["high"].rolling(stop_swing_lookback, min_periods=1).max()
    recent_low = df["low"].rolling(stop_swing_lookback, min_periods=1).min()

    df["impulse_candle"] = df["range_atr"] >= impulse_atr_threshold
    df["extended_fast_ema"] = df["distance_fast_ema_atr"].abs() >= extension_atr_threshold
    df["extended_vwap"] = df["distance_vwap_atr"].abs() >= extension_atr_threshold

    df["structure_score"] = 0
    df["structure_score"] += (df["distance_fast_ema_atr"].abs() <= 1.0).astype(int)
    df["structure_score"] += (df["distance_vwap_atr"].abs() <= 1.5).astype(int)
    df["structure_score"] += (~df["impulse_candle"]).astype(int)
    df["structure_score"] += (~df["extended_fast_ema"]).astype(int)

    df["structure_code"] = np.select(
        [df["structure_score"] >= 3, df["extended_fast_ema"] | df["extended_vwap"], df["impulse_candle"]],
        [3, 1, 2],
        default=0,
    )

    df["volume_baseline"] = df["volume"].rolling(volume_baseline_len, min_periods=volume_baseline_len).mean()
    df["volume_ratio"] = df["volume"] / df["volume_baseline"].replace(0, np.nan)

    consecutive = []
    bull_count = 0
    bear_count = 0
    for o, c in zip(df["open"], df["close"]):
        if c > o:
            bull_count += 1
            bear_count = 0
        elif c < o:
            bear_count += 1
            bull_count = 0
        else:
            bull_count = 0
            bear_count = 0
        consecutive.append(bull_count if bull_count > 0 else -bear_count if bear_count > 0 else 0)

    df["signed_consecutive_pressure"] = consecutive

    breakout_long_pressure = (df["close"] > df["high"].shift(1)) & (df["close_position_range"] >= 0.60)
    breakout_short_pressure = (df["close"] < df["low"].shift(1)) & (df["close_position_range"] <= 0.40)

    df["pressure_score"] = 0
    df["pressure_score"] += (df["body_atr"] >= strong_body_atr_threshold).astype(int)
    df["pressure_score"] += (df["volume_ratio"] >= 1.0).astype(int)
    df["pressure_score"] += (df["signed_consecutive_pressure"].abs() >= 2).astype(int)
    df["pressure_score"] += (breakout_long_pressure | breakout_short_pressure).astype(int)

    df["pressure_code"] = np.select(
        [
            df["impulse_candle"] & (df["distance_fast_ema_atr"].abs() >= extension_atr_threshold),
            df["pressure_score"] >= 3,
            df["pressure_score"] >= 2,
        ],
        [3, 2, 1],
        default=0,
    )

    df["nearest_round_number"] = (df["close"] / round_number_interval).round() * round_number_interval

    level_cols = ["prev_day_high", "prev_day_low", "premarket_high", "premarket_low", "opening_range_high", "opening_range_low"]
    for col in level_cols:
        df[f"distance_{col}_atr"] = (df["close"] - df[col]) / df["atr"].replace(0, np.nan)

    df["distance_round_number_atr"] = (df["close"] - df["nearest_round_number"]) / df["atr"].replace(0, np.nan)

    near_prev_day_high = df["distance_prev_day_high_atr"].abs() <= major_level_atr_threshold
    near_prev_day_low = df["distance_prev_day_low_atr"].abs() <= major_level_atr_threshold
    near_premarket_high = df["distance_premarket_high_atr"].abs() <= major_level_atr_threshold
    near_premarket_low = df["distance_premarket_low_atr"].abs() <= major_level_atr_threshold
    near_opening_high = df["distance_opening_range_high_atr"].abs() <= major_level_atr_threshold
    near_opening_low = df["distance_opening_range_low_atr"].abs() <= major_level_atr_threshold
    near_round = df["distance_round_number_atr"].abs() <= major_level_atr_threshold

    df["near_major_level"] = near_prev_day_high | near_prev_day_low | near_premarket_high | near_premarket_low | near_opening_high | near_opening_low | near_round
    near_resistance = near_prev_day_high | near_premarket_high | near_opening_high
    near_support = near_prev_day_low | near_premarket_low | near_opening_low
    inside_or = (df["close"] <= df["opening_range_high"]) & (df["close"] >= df["opening_range_low"])
    breakout_location = (df["close"] > df["opening_range_high"]) | (df["close"] < df["opening_range_low"])

    df["location_code"] = np.select(
        [df["near_major_level"], near_resistance, near_support, inside_or, breakout_location],
        [5, 1, 2, 3, 4],
        default=0,
    )

    body_high = np.maximum(df["open"], df["close"])
    body_low = np.minimum(df["open"], df["close"])
    prior_body_high = body_high.shift(1)
    prior_body_low = body_low.shift(1)
    overlap = np.maximum(0, np.minimum(body_high, prior_body_high) - np.maximum(body_low, prior_body_low))
    prior_body_range = prior_body_high - prior_body_low
    avg_body_range = (df["bar_body"] + prior_body_range) / 2.0
    high_overlap = (overlap / avg_body_range.replace(0, np.nan)) > 0.6

    df["chop_score"] = 0
    df["chop_score"] += (df["ema_cross_count_20"] >= heavy_cross_threshold).astype(int)
    df["chop_score"] += (df["vwap_cross_count_20"] >= heavy_cross_threshold).astype(int)
    df["chop_score"] += df["weak_trend"].astype(int)
    df["chop_score"] += high_overlap.astype(int)
    df["chop_score"] += (df["atr_ratio"] < low_vol_mult).astype(int)

    heavy_chop = df["chop_score"] >= heavy_chop_threshold
    mild_chop = (df["chop_score"] >= mild_chop_threshold) & (df["chop_score"] < heavy_chop_threshold)

    stretched_up = (df["distance_fast_ema_atr"] > extension_atr_threshold) | (df["distance_vwap_atr"] > extension_atr_threshold)
    stretched_down = (df["distance_fast_ema_atr"] < -extension_atr_threshold) | (df["distance_vwap_atr"] < -extension_atr_threshold)
    extension = stretched_up | stretched_down
    extension_trigger = df["weak_trend"] | (df["chop_score"] >= mild_chop_threshold)
    df["extension_risk"] = extension & extension_trigger
    df["major_level_risk"] = False

    stand_down = heavy_chop | (df["high_volatility"] & df["weak_trend"])
    chop_blocks = heavy_chop | mild_chop

    risk_on = (
        (df["strong_bull_trend"] | df["strong_bear_trend"])
        & (df["session_allows_risk_on"] == 1)
        & (~chop_blocks)
        & (~df["extension_risk"])
        & (~df["major_level_risk"])
    )

    df["risk_mode_base"] = np.where(stand_down, -1, np.where(risk_on, 1, 0))
    df["regime_base"] = np.select(
        [
            df["risk_mode_base"] == -1,
            (df["bias_code"] == 1) & (df["risk_mode_base"] == 1),
            (df["bias_code"] == -1) & (df["risk_mode_base"] == 1),
            (df["bias_code"] == 1) & (df["risk_mode_base"] == 0),
            (df["bias_code"] == -1) & (df["risk_mode_base"] == 0),
        ],
        [-9, 2, -2, 1, -1],
        default=0,
    )

    df["h001_flag"] = ((df["pressure_code"] == 2) & (df["location_code"] == 5)).astype(int)
    df["recent_structure_high"] = recent_high
    df["recent_structure_low"] = recent_low

    return df


def simulate(df, mode):
    trades = []
    active = None
    last_setup = None
    trade_id = 0

    contracts = 1
    mnq_point_value = 2.0
    max_dollar_risk = 850.0
    stop_buffer = 2.0
    target_r = 2.0
    cooldown = 60
    expiry = 40

    for i, row in df.iterrows():
        if active and i > active["start_i"]:
            if active["direction"] == 1:
                stop_hit = row["low"] <= active["stop"]
                target_hit = row["high"] >= active["target"]
            else:
                stop_hit = row["high"] >= active["stop"]
                target_hit = row["low"] <= active["target"]

            expired = i - active["start_i"] >= expiry

            if stop_hit or target_hit or expired:
                if stop_hit:
                    exit_price = active["stop"]
                    reason = "STOP"
                elif target_hit:
                    exit_price = active["target"]
                    reason = "TP2"
                else:
                    exit_price = row["close"]
                    reason = "EXPIRED"

                if active["direction"] == 1:
                    r_multiple = (exit_price - active["entry"]) / active["risk_points"]
                else:
                    r_multiple = (active["entry"] - exit_price) / active["risk_points"]

                pnl = r_multiple * active["risk_dollars"]

                trades.append(
                    Trade(
                        trade_id=active["trade_id"],
                        direction=active["direction"],
                        entry_time=str(active["entry_time"]),
                        exit_time=str(row["timestamp_et"]),
                        entry_price=active["entry"],
                        exit_price=exit_price,
                        stop_price=active["stop"],
                        target_price=active["target"],
                        risk_points=active["risk_points"],
                        risk_dollars=active["risk_dollars"],
                        r_multiple=r_multiple,
                        pnl=pnl,
                        bars_in_trade=i - active["start_i"],
                        exit_reason=reason,
                        pressure_code=int(active["pressure_code"]),
                        location_code=int(active["location_code"]),
                        structure_code=int(active["structure_code"]),
                        trend_score=int(active["trend_score"]),
                        session_code=int(active["session_code"]),
                        volatility_code=int(active["volatility_code"]),
                        risk_mode_code=int(active["risk_mode_code"]),
                        regime_code=int(active["regime_code"]),
                        chop_score=int(active["chop_score"]),
                        h001_flag=int(active["h001_flag"]),
                    )
                )
                active = None

        if active:
            continue

        if last_setup is not None and i - last_setup < cooldown:
            continue

        risk_mode = int(row["risk_mode_base"])

        if mode == "block" and int(row["h001_flag"]) == 1:
            risk_mode = 0

        if risk_mode != 1:
            continue

        bias = int(row["bias_code"])
        if bias == 0 or i == 0:
            continue

        prev = df.iloc[i - 1]
        long_trigger = row["close"] > prev["high"] and row["close"] > row["fast_ema"] and row["close"] > row["vwap"]
        short_trigger = row["close"] < prev["low"] and row["close"] < row["fast_ema"] and row["close"] < row["vwap"]

        if bias == 1 and long_trigger:
            entry = row["close"]
            stop = row["recent_structure_low"] - stop_buffer
            risk_points = entry - stop
            direction = 1
            target = entry + risk_points * target_r
        elif bias == -1 and short_trigger:
            entry = row["close"]
            stop = row["recent_structure_high"] + stop_buffer
            risk_points = stop - entry
            direction = -1
            target = entry - risk_points * target_r
        else:
            continue

        if risk_points <= 0:
            continue

        risk_dollars = risk_points * mnq_point_value * contracts
        if risk_dollars > max_dollar_risk:
            continue

        trade_id += 1
        last_setup = i
        active = {
            "trade_id": trade_id,
            "direction": direction,
            "entry_time": row["timestamp_et"],
            "entry": entry,
            "stop": stop,
            "target": target,
            "risk_points": risk_points,
            "risk_dollars": risk_dollars,
            "start_i": i,
            "pressure_code": row["pressure_code"],
            "location_code": row["location_code"],
            "structure_code": row["structure_code"],
            "trend_score": row["trend_score"],
            "session_code": row["session_code"],
            "volatility_code": row["volatility_code"],
            "risk_mode_code": risk_mode,
            "regime_code": row["regime_base"],
            "chop_score": row["chop_score"],
            "h001_flag": row["h001_flag"],
        }

    return trades


def summarize(trades):
    pnls = np.array([t.pnl for t in trades], dtype=float)
    wins = pnls[pnls > 0]
    losses = pnls[pnls < 0]

    equity = pnls.cumsum() if len(pnls) else np.array([])
    drawdown = equity - np.maximum.accumulate(equity) if len(equity) else np.array([0])

    streak = 0
    max_streak = 0
    for p in pnls:
        if p < 0:
            streak += 1
            max_streak = max(max_streak, streak)
        else:
            streak = 0

    return {
        "trades": len(trades),
        "net_pnl": float(pnls.sum()) if len(pnls) else 0.0,
        "gross_profit": float(wins.sum()) if len(wins) else 0.0,
        "gross_loss": float(losses.sum()) if len(losses) else 0.0,
        "profit_factor": float(wins.sum() / abs(losses.sum())) if len(losses) and losses.sum() != 0 else 0.0,
        "win_rate": float((pnls > 0).mean() * 100) if len(pnls) else 0.0,
        "average_trade": float(pnls.mean()) if len(pnls) else 0.0,
        "max_drawdown": float(drawdown.min()) if len(drawdown) else 0.0,
        "largest_losing_streak": int(max_streak),
    }


def write_outputs(out_dir, source_csv, off_trades, block_trades):
    out_dir.mkdir(parents=True, exist_ok=True)

    off_df = pd.DataFrame([asdict(t) for t in off_trades])
    block_df = pd.DataFrame([asdict(t) for t in block_trades])

    off_path = out_dir / "atlas_external_trades_h001_off.csv"
    block_path = out_dir / "atlas_external_trades_h001_block.csv"

    off_df.to_csv(off_path, index=False)
    block_df.to_csv(block_path, index=False)

    off = summarize(off_trades)
    block = summarize(block_trades)

    h001_baseline = off_df[off_df["h001_flag"] == 1] if not off_df.empty else pd.DataFrame()
    h001_trades = len(h001_baseline)
    h001_pnl = h001_baseline["pnl"].sum() if h001_trades else 0
    h001_avg = h001_baseline["pnl"].mean() if h001_trades else 0
    h001_win = (h001_baseline["pnl"] > 0).mean() * 100 if h001_trades else 0

    report = out_dir / "atlas-external-research-run-001.md"
    report.write_text(
        f"""# Atlas External Research Run 001

## Purpose

Run the first external Python research-engine test using the Massive MNQ dataset.

This compares Hypothesis 001 Off versus Hypothesis 001 Block.

## Source

CSV: {source_csv}

## Hypothesis 001

Trades fail when strong pressure occurs into a reaction zone.

## H001 Off

Trades: {off['trades']}
Net PnL: {off['net_pnl']:.2f}
Gross Profit: {off['gross_profit']:.2f}
Gross Loss: {off['gross_loss']:.2f}
Profit Factor: {off['profit_factor']:.3f}
Win Rate: {off['win_rate']:.2f}%
Average Trade: {off['average_trade']:.2f}
Max Drawdown: {off['max_drawdown']:.2f}
Largest Losing Streak: {off['largest_losing_streak']}

## H001 Block

Trades: {block['trades']}
Net PnL: {block['net_pnl']:.2f}
Gross Profit: {block['gross_profit']:.2f}
Gross Loss: {block['gross_loss']:.2f}
Profit Factor: {block['profit_factor']:.3f}
Win Rate: {block['win_rate']:.2f}%
Average Trade: {block['average_trade']:.2f}
Max Drawdown: {block['max_drawdown']:.2f}
Largest Losing Streak: {block['largest_losing_streak']}

## Comparison

Trades removed: {off['trades'] - block['trades']}
Net PnL change: {block['net_pnl'] - off['net_pnl']:.2f}
Average Trade change: {block['average_trade'] - off['average_trade']:.2f}
Profit Factor change: {block['profit_factor'] - off['profit_factor']:.3f}
Max Drawdown change: {block['max_drawdown'] - off['max_drawdown']:.2f}

## H001 Baseline Condition

H001 trades in baseline: {h001_trades}
H001 baseline net PnL: {h001_pnl:.2f}
H001 baseline average trade: {h001_avg:.2f}
H001 baseline win rate: {h001_win:.2f}%

## Decision

This is the first external Atlas research-engine run.

Do not treat as production approval until reviewed against TradingView results and contract stitching limitations.

## Generated Files

- {off_path}
- {block_path}
""",
        encoding="utf-8",
    )

    return report


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--csv", required=True)
    parser.add_argument("--out", default="research")
    args = parser.parse_args()

    csv_path = Path(args.csv)
    out_dir = Path(args.out)

    print(f"Loading: {csv_path}")
    df = load_ohlcv(csv_path)
    print(f"Rows loaded: {len(df):,}")
    print(f"Date range ET: {df['timestamp_et'].min()} to {df['timestamp_et'].max()}")

    print("Building Atlas features...")
    df = add_features(df)

    print("Simulating H001 Off...")
    off_trades = simulate(df, "off")

    print("Simulating H001 Block...")
    block_trades = simulate(df, "block")

    report = write_outputs(out_dir, csv_path, off_trades, block_trades)
    print(f"Report written: {report}")
    print("Done.")


if __name__ == "__main__":
    main()
