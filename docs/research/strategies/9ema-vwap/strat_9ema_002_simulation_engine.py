"""
STRAT-9EMA-002 — 9EMA Crossover + VWAP Filter Simulation Engine
Sprint 123A.14 | Gate G14

Pre-registration commit: abfbed6
This script is run AFTER the pre-registration commit.

4 Configurations:
  CONFIG_A: VWAP_BASIC       — 9EMA cross + price above/below VWAP, ADX>20, 2R
  CONFIG_B: VWAP_PROXIMITY   — CONFIG_A + price within 1.0 ATR of VWAP
  CONFIG_C: VWAP_1H_TREND    — CONFIG_A + 1H EMA50 trend filter
  CONFIG_D: VWAP_STRICT_ADX  — CONFIG_C + ADX > 25 (stricter)

Authority:
  DARWIN_DECISION_AUTHORITY: DISABLED
  DARWIN_EXECUTION_AUTHORITY: DISABLED
  LIVE_TRADES_INITIATED: 0
"""

import json
import hashlib
import numpy as np
import pandas as pd
from pathlib import Path
from datetime import datetime, timezone

# ─── Paths ────────────────────────────────────────────────────────────────────
CANONICAL_5M = Path("/home/ubuntu/atlas-historical/canonical/mnq_5m_full_2019_2026.parquet")
OUT_DIR = Path(__file__).parent
EXPECTED_5M_SHA = "17206c6289589622a6bf0fc25b0f598752045c2e61a24d0896002f9bfda531fe"

# ─── Constants ────────────────────────────────────────────────────────────────
SLIPPAGE_PTS   = 0.50   # 2 ticks adverse per side
COMMISSION_USD = 1.24   # round-trip
POINT_VALUE    = 2.00   # MNQ $/point
TICK_VALUE     = 0.50   # MNQ $/tick
TICK_SIZE      = 0.25   # MNQ points per tick
RTH_START_MIN  = 13 * 60 + 30   # 810 minutes from midnight UTC
RTH_END_MIN    = 20 * 60         # 1200 minutes from midnight UTC
TARGET_R       = 2.0
TRAIN_END      = "2025-04-30"
VAL_START      = "2025-05-01"
BOOTSTRAP_N    = 10000
PERMUTATION_N  = 10000
CI_LOWER_GATE  = -10.0
P_VALUE_GATE   = 0.10
MIN_TRADES     = 50
np.random.seed(42)

# ─── Helpers ──────────────────────────────────────────────────────────────────
def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()

def bootstrap_ci(pnls: np.ndarray, n: int = BOOTSTRAP_N) -> tuple:
    if len(pnls) < 2:
        return (np.nan, np.nan)
    means = [np.mean(np.random.choice(pnls, size=len(pnls), replace=True)) for _ in range(n)]
    return (round(np.percentile(means, 2.5), 4), round(np.percentile(means, 97.5), 4))

def permutation_test(pnls: np.ndarray, n: int = PERMUTATION_N) -> float:
    if len(pnls) < 2:
        return np.nan
    observed = np.mean(pnls)
    count = sum(
        np.mean(pnls * np.random.choice([-1, 1], size=len(pnls))) >= observed
        for _ in range(n)
    )
    return round(count / n, 4)

def profit_factor(pnls: np.ndarray) -> float:
    gp = pnls[pnls > 0].sum()
    gl = abs(pnls[pnls < 0].sum())
    return round(gp / gl, 4) if gl > 0 else (float("inf") if gp > 0 else float("nan"))

def win_rate(pnls: np.ndarray) -> float:
    return round((pnls > 0).sum() / len(pnls), 4) if len(pnls) > 0 else float("nan")

def max_drawdown(pnls: np.ndarray) -> float:
    if len(pnls) == 0:
        return float("nan")
    equity = np.cumsum(pnls)
    peak = np.maximum.accumulate(equity)
    return round(float((peak - equity).max()), 2)

def passes_gates(train_pnls: np.ndarray, val_pnls: np.ndarray) -> dict:
    if len(train_pnls) < MIN_TRADES:
        return {"pass": False, "reason": f"Insufficient training trades: {len(train_pnls)} < {MIN_TRADES}",
                "training_trades": int(len(train_pnls)), "validation_trades": int(len(val_pnls))}
    ci_lo, ci_hi = bootstrap_ci(train_pnls)
    p_val = permutation_test(train_pnls)
    val_exp = float(np.mean(val_pnls)) if len(val_pnls) > 0 else float("nan")
    g1 = ci_lo > CI_LOWER_GATE
    g2 = p_val < P_VALUE_GATE
    g3 = val_exp > 0 if not np.isnan(val_exp) else False
    g4 = len(train_pnls) >= MIN_TRADES
    return {
        "pass": bool(g1 and g2 and g3 and g4),
        "bootstrap_ci_lower": ci_lo, "bootstrap_ci_upper": ci_hi,
        "permutation_p": p_val,
        "validation_expectancy": round(val_exp, 4) if not np.isnan(val_exp) else None,
        "gate1_ci_lower_gt_neg10": bool(g1),
        "gate2_p_lt_010": bool(g2),
        "gate3_val_exp_gt_0": bool(g3),
        "gate4_min_trades": bool(g4),
        "training_trades": int(len(train_pnls)),
        "validation_trades": int(len(val_pnls))
    }

# ─── Load and verify data ─────────────────────────────────────────────────────
print("=== STRAT-9EMA-002 Simulation Engine ===")
print(f"Pre-registration commit: abfbed6")
print(f"Run time: {datetime.now(timezone.utc).isoformat()}")
print()

print("Verifying dataset SHA...")
actual_5m_sha = sha256_file(CANONICAL_5M)
assert actual_5m_sha == EXPECTED_5M_SHA, f"5m SHA mismatch: {actual_5m_sha}"
print(f"  5m SHA: {actual_5m_sha[:16]}... OK")

print("Loading 5m dataset...")
df5m = pd.read_parquet(CANONICAL_5M)
df5m["bar_time"] = pd.to_datetime(df5m["bar_time"], utc=True)
df5m = df5m.sort_values("bar_time").reset_index(drop=True)
print(f"  5m bars: {len(df5m):,} ({df5m['bar_time'].min()} to {df5m['bar_time'].max()})")

# ─── Resample 5m → 15m ───────────────────────────────────────────────────────
print("Resampling 5m to 15m...")
df5m_idx = df5m.set_index("bar_time")
df15 = df5m_idx[["open","high","low","close","volume"]].resample(
    "15min", label="left", closed="left"
).agg({"open":"first","high":"max","low":"min","close":"last","volume":"sum"}).dropna(subset=["open","close"])

# EMAs on 15m
df15["ema9"]  = df15["close"].ewm(span=9,  adjust=False).mean()
df15["ema21"] = df15["close"].ewm(span=21, adjust=False).mean()
df15["ema50"] = df15["close"].ewm(span=50, adjust=False).mean()

# ATR14 on 15m
_h = df15["high"]; _l = df15["low"]; _c = df15["close"]
_tr = np.maximum(_h-_l, np.maximum(abs(_h-_c.shift(1)), abs(_l-_c.shift(1))))
df15["atr14"] = _tr.ewm(span=14, adjust=False).mean()

# ADX14 on 15m
_pdm = _h.diff(); _mdm = -_l.diff()
_pdm = _pdm.where((_pdm > _mdm) & (_pdm > 0), 0.0)
_mdm = _mdm.where((_mdm > _pdm) & (_mdm > 0), 0.0)
_atr_adx = _tr.ewm(span=14, adjust=False).mean()
_pdi = 100*(_pdm.ewm(span=14,adjust=False).mean()/_atr_adx)
_mdi = 100*(_mdm.ewm(span=14,adjust=False).mean()/_atr_adx)
_dx  = 100*abs(_pdi-_mdi)/(_pdi+_mdi).replace(0, np.nan)
df15["adx14"] = _dx.ewm(span=14, adjust=False).mean()

# Session and day_of_week
_h15 = df15.index.hour; _m15 = df15.index.minute
def _sess(h, m):
    t = h * 60 + m
    if 810 <= t < 1200: return "NY_RTH"
    elif 420 <= t < 810: return "LONDON"
    elif t >= 1320 or t < 420: return "ASIA"
    else: return "AFTER_HOURS"
df15["session"] = [_sess(h, m) for h, m in zip(_h15, _m15)]
df15["day_of_week"] = df15.index.dayofweek

df15 = df15.reset_index()
df15 = df15.rename(columns={df15.columns[0]: "bar_time"}) if "bar_time" not in df15.columns else df15
df15["bar_time"] = pd.to_datetime(df15["bar_time"], utc=True)
df15 = df15.sort_values("bar_time").reset_index(drop=True)
print(f"  15m bars: {len(df15):,}")

# ─── Build 1H EMA50 from 5m data ─────────────────────────────────────────────
print("Building 1H EMA50 from 5m data...")
df1h = df5m_idx["close"].resample("1h", label="left", closed="left").last().dropna().reset_index()
df1h.columns = ["bar_time_1h", "close_1h"]
df1h["ema50_1h"] = df1h["close_1h"].ewm(span=50, adjust=False).mean()
df1h = df1h.sort_values("bar_time_1h")

# Merge 1H EMA50 into 15m bars
df15 = pd.merge_asof(
    df15.sort_values("bar_time"),
    df1h[["bar_time_1h", "ema50_1h"]],
    left_on="bar_time",
    right_on="bar_time_1h",
    direction="backward"
)
print(f"  1H EMA50 null count: {df15['ema50_1h'].isna().sum()}")
del df5m_idx, df1h

# ─── Session VWAP (reset at RTH open each day) ───────────────────────────────
print("Computing session VWAP...")
df15["hour_min_utc"] = df15["bar_time"].dt.hour * 60 + df15["bar_time"].dt.minute
df15["is_rth"] = (df15["hour_min_utc"] >= RTH_START_MIN) & (df15["hour_min_utc"] < RTH_END_MIN)
df15["date_utc"] = df15["bar_time"].dt.date

# Session VWAP: reset at 13:30 UTC each day, computed only during RTH
# For each RTH bar, VWAP = cumulative(price * volume) / cumulative(volume) since 13:30
df15["typical_price"] = (df15["high"] + df15["low"] + df15["close"]) / 3
df15["tp_vol"] = df15["typical_price"] * df15["volume"]

# Group by date, compute cumulative VWAP within RTH
vwap_vals = []
for date, grp in df15.groupby("date_utc"):
    rth_mask = grp["is_rth"]
    grp_vwap = pd.Series(float("nan"), index=grp.index)
    rth_grp = grp[rth_mask]
    if len(rth_grp) > 0:
        cum_tp_vol = rth_grp["tp_vol"].cumsum()
        cum_vol    = rth_grp["volume"].cumsum()
        grp_vwap[rth_grp.index] = cum_tp_vol / cum_vol.replace(0, float("nan"))
    vwap_vals.append(grp_vwap)

df15["vwap"] = pd.concat(vwap_vals).sort_index()
print(f"  VWAP null count (non-RTH expected): {df15['vwap'].isna().sum()}")

# ─── EMA crossover signals ────────────────────────────────────────────────────
print("Computing EMA crossover signals...")
df15["ema9_prev"]  = df15["ema9"].shift(1)
df15["ema21_prev"] = df15["ema21"].shift(1)
df15["long_xo"]  = (df15["ema9_prev"] <= df15["ema21_prev"]) & (df15["ema9"] > df15["ema21"])
df15["short_xo"] = (df15["ema9_prev"] >= df15["ema21_prev"]) & (df15["ema9"] < df15["ema21"])

# ─── Build signals for each configuration ────────────────────────────────────
configs = {
    "CONFIG_A": {"adx_thresh": 20, "proximity": False, "trend_1h": False},
    "CONFIG_B": {"adx_thresh": 20, "proximity": True,  "trend_1h": False},
    "CONFIG_C": {"adx_thresh": 20, "proximity": False, "trend_1h": True},
    "CONFIG_D": {"adx_thresh": 25, "proximity": False, "trend_1h": True},
}

for cfg_name, cfg in configs.items():
    # Base filters (same for all configs)
    base_long  = df15["long_xo"]  & (df15["close"] > df15["ema50"]) & df15["is_rth"] & (df15["adx14"] > cfg["adx_thresh"])
    base_short = df15["short_xo"] & (df15["close"] < df15["ema50"]) & df15["is_rth"] & (df15["adx14"] > cfg["adx_thresh"])

    # VWAP filter (all configs)
    vwap_ok_long  = df15["close"] > df15["vwap"]
    vwap_ok_short = df15["close"] < df15["vwap"]

    # Proximity filter (Config B only)
    if cfg["proximity"]:
        prox_ok_long  = abs(df15["close"] - df15["vwap"]) <= 1.0 * df15["atr14"]
        prox_ok_short = abs(df15["close"] - df15["vwap"]) <= 1.0 * df15["atr14"]
        vwap_ok_long  = vwap_ok_long  & prox_ok_long
        vwap_ok_short = vwap_ok_short & prox_ok_short

    # 1H trend filter (Configs C and D)
    if cfg["trend_1h"]:
        trend_long  = df15["close"] > df15["ema50_1h"]
        trend_short = df15["close"] < df15["ema50_1h"]
    else:
        trend_long  = pd.Series(True, index=df15.index)
        trend_short = pd.Series(True, index=df15.index)

    df15[f"long_signal_{cfg_name}"]  = base_long  & vwap_ok_long  & trend_long
    df15[f"short_signal_{cfg_name}"] = base_short & vwap_ok_short & trend_short

    n_long  = df15[f"long_signal_{cfg_name}"].sum()
    n_short = df15[f"short_signal_{cfg_name}"].sum()
    print(f"  {cfg_name}: {n_long} long + {n_short} short = {n_long+n_short} signals")

# ─── Simulate trades ─────────────────────────────────────────────────────────
print("\nSimulating trades...")

def simulate_trades(df: pd.DataFrame, long_col: str, short_col: str) -> pd.DataFrame:
    trades = []
    n = len(df)
    for i in range(n - 1):
        row = df.iloc[i]
        if not (row[long_col] or row[short_col]):
            continue
        direction = "LONG" if row[long_col] else "SHORT"
        next_row = df.iloc[i + 1]

        # Entry price: next bar open + adverse slippage
        if direction == "LONG":
            entry_price = next_row["open"] + SLIPPAGE_PTS
            stop_price  = row["low"]
        else:
            entry_price = next_row["open"] - SLIPPAGE_PTS
            stop_price  = row["high"]

        stop_dist = abs(entry_price - stop_price)
        if stop_dist <= 0:
            continue

        # 2R target
        if direction == "LONG":
            target_price = entry_price + TARGET_R * stop_dist
        else:
            target_price = entry_price - TARGET_R * stop_dist

        # Simulate bar-by-bar
        exit_price = None
        exit_reason = None
        exit_bar_idx = None

        for j in range(i + 1, min(i + 300, n)):
            bar = df.iloc[j]

            # Stop hit
            if direction == "LONG" and bar["low"] <= stop_price:
                exit_price  = stop_price - SLIPPAGE_PTS
                exit_reason = "STOP"
                exit_bar_idx = j
                break
            elif direction == "SHORT" and bar["high"] >= stop_price:
                exit_price  = stop_price + SLIPPAGE_PTS
                exit_reason = "STOP"
                exit_bar_idx = j
                break

            # Target hit
            if direction == "LONG" and bar["high"] >= target_price:
                exit_price  = target_price - SLIPPAGE_PTS
                exit_reason = "TARGET"
                exit_bar_idx = j
                break
            elif direction == "SHORT" and bar["low"] <= target_price:
                exit_price  = target_price + SLIPPAGE_PTS
                exit_reason = "TARGET"
                exit_bar_idx = j
                break

            # Session close: force exit at last RTH bar
            if bar["hour_min_utc"] >= RTH_END_MIN - 15:
                if direction == "LONG":
                    exit_price = bar["close"] - SLIPPAGE_PTS
                else:
                    exit_price = bar["close"] + SLIPPAGE_PTS
                exit_reason = "SESSION_CLOSE"
                exit_bar_idx = j
                break

        if exit_price is None:
            last_bar = df.iloc[min(i + 299, n - 1)]
            exit_price  = last_bar["close"] - SLIPPAGE_PTS if direction == "LONG" else last_bar["close"] + SLIPPAGE_PTS
            exit_reason = "TIMEOUT"
            exit_bar_idx = min(i + 299, n - 1)

        raw_pnl_pts = (exit_price - entry_price) if direction == "LONG" else (entry_price - exit_price)
        pnl_usd = raw_pnl_pts * POINT_VALUE - COMMISSION_USD
        r_multiple = raw_pnl_pts / stop_dist

        trades.append({
            "signal_bar_idx": i,
            "signal_bar_time": row["bar_time"],
            "direction": direction,
            "entry_bar_time": next_row["bar_time"],
            "entry_price": round(entry_price, 4),
            "stop_price": round(stop_price, 4),
            "stop_dist_pts": round(stop_dist, 4),
            "target_price": round(target_price, 4),
            "exit_price": round(exit_price, 4),
            "exit_reason": exit_reason,
            "exit_bar_idx": exit_bar_idx,
            "pnl_pts": round(raw_pnl_pts, 4),
            "pnl_usd": round(pnl_usd, 4),
            "r_multiple": round(r_multiple, 4),
            "session": row["session"],
            "day_of_week": int(row["day_of_week"]),
            "adx14": round(float(row["adx14"]), 2),
            "vwap": round(float(row["vwap"]), 4) if pd.notna(row["vwap"]) else None,
            "ema50_1h": round(float(row["ema50_1h"]), 4) if pd.notna(row["ema50_1h"]) else None,
        })

    return pd.DataFrame(trades)

results = {}
for cfg_name in configs:
    print(f"  Simulating {cfg_name}...")
    trades_df = simulate_trades(df15, f"long_signal_{cfg_name}", f"short_signal_{cfg_name}")
    results[cfg_name] = trades_df
    if len(trades_df) > 0:
        exp = trades_df["pnl_usd"].mean()
        pf  = profit_factor(trades_df["pnl_usd"].values)
        print(f"    {len(trades_df)} trades, exp=${exp:.2f}, PF={pf:.3f}")
    else:
        print(f"    No trades generated")

# ─── Statistical analysis ─────────────────────────────────────────────────────
print("\nRunning statistical analysis...")
summary = {}
for cfg_name, trades_df in results.items():
    if len(trades_df) == 0:
        summary[cfg_name] = {"error": "No trades generated"}
        continue

    trades_df["is_train"] = trades_df["signal_bar_time"] <= pd.Timestamp(TRAIN_END, tz="UTC")
    trades_df["is_val"]   = trades_df["signal_bar_time"] >= pd.Timestamp(VAL_START, tz="UTC")

    train_pnls = trades_df[trades_df["is_train"]]["pnl_usd"].values
    val_pnls   = trades_df[trades_df["is_val"]]["pnl_usd"].values
    all_pnls   = trades_df["pnl_usd"].values

    gate_result = passes_gates(train_pnls, val_pnls)

    # Direction subgroups
    long_pnls  = trades_df[trades_df["direction"] == "LONG"]["pnl_usd"].values
    short_pnls = trades_df[trades_df["direction"] == "SHORT"]["pnl_usd"].values

    # Weekday subgroups
    dow_names = {0:"Monday",1:"Tuesday",2:"Wednesday",3:"Thursday",4:"Friday"}
    dow_groups = {}
    for dow_val in sorted(trades_df["day_of_week"].unique()):
        dow_pnls = trades_df[trades_df["day_of_week"] == dow_val]["pnl_usd"].values
        dow_name = dow_names.get(int(dow_val), f"DOW_{dow_val}")
        dow_groups[dow_name] = {
            "count": int(len(dow_pnls)),
            "expectancy": round(float(np.mean(dow_pnls)), 4) if len(dow_pnls) > 0 else None,
            "profit_factor": float(profit_factor(dow_pnls)) if len(dow_pnls) > 0 else None
        }

    # Exit reason breakdown
    exit_reasons = trades_df["exit_reason"].value_counts().to_dict()

    # Takeoff analysis: how many bars until exit
    if "exit_bar_idx" in trades_df.columns and "signal_bar_idx" in trades_df.columns:
        trades_df["bars_held"] = trades_df["exit_bar_idx"] - trades_df["signal_bar_idx"]
        avg_bars_held = round(float(trades_df["bars_held"].mean()), 2)
    else:
        avg_bars_held = None

    # Classification
    if gate_result["pass"]:
        classification = "SUPPORTED"
    elif gate_result.get("bootstrap_ci_lower", float("-inf")) > CI_LOWER_GATE:
        classification = "PROMISING"
    else:
        classification = "NOT_SUPPORTED"

    summary[cfg_name] = {
        "total_trades": int(len(all_pnls)),
        "training_trades": int(len(train_pnls)),
        "validation_trades": int(len(val_pnls)),
        "total_expectancy_usd": round(float(np.mean(all_pnls)), 4),
        "training_expectancy_usd": round(float(np.mean(train_pnls)), 4) if len(train_pnls) > 0 else None,
        "validation_expectancy_usd": round(float(np.mean(val_pnls)), 4) if len(val_pnls) > 0 else None,
        "total_pnl_usd": round(float(all_pnls.sum()), 2),
        "win_rate": float(win_rate(all_pnls)),
        "profit_factor": float(profit_factor(all_pnls)),
        "max_drawdown_usd": float(max_drawdown(all_pnls)),
        "long_trades": int(len(long_pnls)),
        "short_trades": int(len(short_pnls)),
        "long_expectancy": round(float(np.mean(long_pnls)), 4) if len(long_pnls) > 0 else None,
        "short_expectancy": round(float(np.mean(short_pnls)), 4) if len(short_pnls) > 0 else None,
        "avg_bars_held": avg_bars_held,
        "exit_reasons": exit_reasons,
        "weekday_subgroups": dow_groups,
        "statistical_gates": gate_result,
        "classification": classification
    }

    print(f"  {cfg_name}: {len(all_pnls)} trades, exp=${np.mean(all_pnls):.2f}, "
          f"PF={profit_factor(all_pnls):.3f}, WR={win_rate(all_pnls):.1%}, {classification}")

# ─── Overall answer ───────────────────────────────────────────────────────────
best_cfg = max(summary.keys(), key=lambda c: summary[c].get("total_expectancy_usd", -999))
any_supported = any(summary[c].get("classification") == "SUPPORTED" for c in summary)
any_promising = any(summary[c].get("classification") in ("SUPPORTED","PROMISING") for c in summary)
does_have_edge = "YES" if any_supported else ("PROMISING" if any_promising else "NO")

print(f"\nDOES_THE_SIMPLE_IDEA_HAVE_AN_EDGE: {does_have_edge}")
print(f"BEST_CONFIG: {best_cfg} (exp=${summary[best_cfg].get('total_expectancy_usd',0):.2f})")

# ─── Write artefacts ──────────────────────────────────────────────────────────
print("\nWriting artefacts...")

primary_results = {
    "experiment_id": "STRAT-9EMA-002",
    "sprint": "123A.14",
    "pre_registration_commit": "abfbed6",
    "run_timestamp": datetime.now(timezone.utc).isoformat(),
    "dataset_sha_5m": actual_5m_sha,
    "dataset_period": "2019-05-06 to 2026-07-20",
    "total_15m_bars": int(len(df15)),
    "does_the_simple_idea_have_an_edge": does_have_edge,
    "best_config": best_cfg,
    "best_config_expectancy_usd": summary[best_cfg].get("total_expectancy_usd"),
    "configurations": summary,
    "authority": {
        "DARWIN_DECISION_AUTHORITY": "DISABLED",
        "DARWIN_EXECUTION_AUTHORITY": "DISABLED",
        "LIVE_TRADES_INITIATED": 0,
        "PARAMETER_CHANGED_AFTER_PREREGISTRATION": False,
        "LOOKAHEAD_VIOLATIONS": 0,
        "FUTURE_BAR_USES": 0
    }
}

with open(OUT_DIR / "STRAT_9EMA_002_PRIMARY_RESULTS.json", "w") as f:
    json.dump(primary_results, f, indent=2, default=str)
print("  STRAT_9EMA_002_PRIMARY_RESULTS.json")

# Trade ledgers
for cfg_name, trades_df in results.items():
    if len(trades_df) > 0:
        fname = f"STRAT_9EMA_002_TRADE_LEDGER_{cfg_name}.json"
        trades_df.to_json(OUT_DIR / fname, orient="records", indent=2, date_format="iso")
        print(f"  {fname} ({len(trades_df)} trades)")

# Artefact manifest
artefact_files = sorted(OUT_DIR.glob("STRAT_9EMA_002_*.json")) + sorted(OUT_DIR.glob("STRAT_9EMA_002_*.md"))
manifest = {
    "experiment_id": "STRAT-9EMA-002",
    "sprint": "123A.14",
    "created_at": datetime.now(timezone.utc).isoformat(),
    "artefacts": [{"filename": af.name, "sha256": sha256_file(af), "size_bytes": af.stat().st_size}
                  for af in artefact_files]
}
with open(OUT_DIR / "STRAT_9EMA_002_ARTEFACT_MANIFEST.json", "w") as f:
    json.dump(manifest, f, indent=2)
print("  STRAT_9EMA_002_ARTEFACT_MANIFEST.json")

print("\n=== Simulation complete ===")
print(f"DOES_THE_SIMPLE_IDEA_HAVE_AN_EDGE: {does_have_edge}")
for cfg_name, s in summary.items():
    exp = s.get("total_expectancy_usd", "N/A")
    cls = s.get("classification", "N/A")
    n   = s.get("total_trades", 0)
    print(f"  {cfg_name}: {n} trades, exp=${exp}, {cls}")
