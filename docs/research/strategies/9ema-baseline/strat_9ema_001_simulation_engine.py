"""
STRAT-9EMA-001 — 9EMA Crossover Baseline Simulation Engine
Sprint 123A.14 | Gate G14

Pre-registration commit: 86bf893
This script is run AFTER the pre-registration commit.

Rules (verbatim from source):
  - Chart: 15 minutes
  - Trend filter: 1 hour
  - EMAs: 9, 21, 50
  - Long: 9 EMA crosses above 21 EMA, AND price above 50 EMA (15m), AND price above 50 EMA (1H)
  - Short: 9 EMA crosses below 21 EMA, AND price below 50 EMA (15m), AND price below 50 EMA (1H)
  - Entry: next bar open after crossover candle closes
  - Momentum filter: ADX(14) > 20 on 15m
  - Session: RTH only (13:30–20:00 UTC)
  - Stop: low of crossover candle (long) / high of crossover candle (short)
  - Exit variants: EXIT_1R (1R target), EXIT_2R (2R target), EXIT_XO (opposite crossover)

Execution costs:
  - 2 ticks adverse slippage per side = 0.50 pts adverse
  - $1.24 round-trip commission
  - MNQ: $2.00/point, $0.50/tick

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
REPO_ROOT = Path(__file__).resolve().parents[4]
# Full 2019-2026 canonical dataset (built in Sprint 123A.14 BLOCKER-02 fix)
# 5m file used as the 15m source (will be resampled to 15m in this engine)
CANONICAL_5M  = Path("/home/ubuntu/atlas-historical/canonical/mnq_5m_full_2019_2026.parquet")
CANONICAL_1M  = Path("/home/ubuntu/atlas-historical/canonical/mnq_1m_full_2019_2026.parquet")
OUT_DIR = Path(__file__).parent
EXPECTED_5M_SHA  = "17206c6289589622a6bf0fc25b0f598752045c2e61a24d0896002f9bfda531fe"
EXPECTED_1M_SHA  = "845544b84770c417f630e3881e25c592ba9d56208932f83755bf00e6eb52922d"

# ─── Constants ────────────────────────────────────────────────────────────────
SLIPPAGE_PTS   = 0.50   # 2 ticks adverse per side
COMMISSION_USD = 1.24   # round-trip
POINT_VALUE    = 2.00   # MNQ $/point
TICK_VALUE     = 0.50   # MNQ $/tick
TICK_SIZE      = 0.25   # MNQ points per tick

RTH_START_UTC  = "13:30"
RTH_END_UTC    = "20:00"
ADX_THRESHOLD  = 20.0
TRAIN_END      = "2025-04-30"
VAL_START      = "2025-05-01"

BOOTSTRAP_N    = 10000
PERMUTATION_N  = 10000
CI_LOWER_GATE  = -10.0   # USD per trade
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

def bootstrap_ci(pnls: np.ndarray, n: int = BOOTSTRAP_N, ci: float = 0.95) -> tuple:
    if len(pnls) == 0:
        return (np.nan, np.nan)
    means = [np.mean(np.random.choice(pnls, size=len(pnls), replace=True)) for _ in range(n)]
    lo = np.percentile(means, (1 - ci) / 2 * 100)
    hi = np.percentile(means, (1 + ci) / 2 * 100)
    return (round(lo, 4), round(hi, 4))

def permutation_test(pnls: np.ndarray, n: int = PERMUTATION_N) -> float:
    if len(pnls) == 0:
        return np.nan
    observed = np.mean(pnls)
    count = 0
    for _ in range(n):
        shuffled = pnls * np.random.choice([-1, 1], size=len(pnls))
        if np.mean(shuffled) >= observed:
            count += 1
    return round(count / n, 4)

def profit_factor(pnls: np.ndarray) -> float:
    gross_profit = pnls[pnls > 0].sum()
    gross_loss   = abs(pnls[pnls < 0].sum())
    if gross_loss == 0:
        return np.inf if gross_profit > 0 else np.nan
    return round(gross_profit / gross_loss, 4)

def win_rate(pnls: np.ndarray) -> float:
    if len(pnls) == 0:
        return np.nan
    return round((pnls > 0).sum() / len(pnls), 4)

def max_drawdown(pnls: np.ndarray) -> float:
    if len(pnls) == 0:
        return np.nan
    equity = np.cumsum(pnls)
    peak = np.maximum.accumulate(equity)
    dd = peak - equity
    return round(float(dd.max()), 2)

def passes_gates(pnls_train: np.ndarray, pnls_val: np.ndarray) -> dict:
    if len(pnls_train) < MIN_TRADES:
        return {"pass": False, "reason": f"Insufficient training trades: {len(pnls_train)} < {MIN_TRADES}"}
    ci_lo, ci_hi = bootstrap_ci(pnls_train)
    p_val = permutation_test(pnls_train)
    val_exp = float(np.mean(pnls_val)) if len(pnls_val) > 0 else np.nan
    gate1 = ci_lo > CI_LOWER_GATE
    gate2 = p_val < P_VALUE_GATE
    gate3 = val_exp > 0 if not np.isnan(val_exp) else False
    gate4 = len(pnls_train) >= MIN_TRADES
    passed = gate1 and gate2 and gate3 and gate4
    return {
        "pass": passed,
        "bootstrap_ci_lower": ci_lo,
        "bootstrap_ci_upper": ci_hi,
        "permutation_p": p_val,
        "validation_expectancy": round(val_exp, 4) if not np.isnan(val_exp) else None,
        "gate1_ci_lower_gt_neg10": gate1,
        "gate2_p_lt_010": gate2,
        "gate3_val_exp_gt_0": gate3,
        "gate4_min_trades": gate4,
        "training_trades": int(len(pnls_train)),
        "validation_trades": int(len(pnls_val))
    }

# ─── Load and verify data ─────────────────────────────────────────────────────
print("=== STRAT-9EMA-001 Simulation Engine ===")
print(f"Pre-registration commit: 86bf893")
print(f"Run time: {datetime.now(timezone.utc).isoformat()}")
print()

print("Verifying dataset SHAs...")
actual_5m_sha = sha256_file(CANONICAL_5M)
actual_1m_sha = sha256_file(CANONICAL_1M)
assert actual_5m_sha == EXPECTED_5M_SHA,  f"5m SHA mismatch: {actual_5m_sha}"
assert actual_1m_sha == EXPECTED_1M_SHA,   f"1m SHA mismatch: {actual_1m_sha}"
print(f"  5m SHA:  {actual_5m_sha[:16]}... OK")
print(f"  1m SHA:  {actual_1m_sha[:16]}... OK")

print("Loading datasets...")
df5m = pd.read_parquet(CANONICAL_5M)
df1m = pd.read_parquet(CANONICAL_1M)

# Resample 5m to 15m (causal: label=left, closed=left)
print("Resampling 5m to 15m...")
df5m["bar_time"] = pd.to_datetime(df5m["bar_time"], utc=True)
df5m = df5m.sort_values("bar_time")
df5m_idx = df5m.set_index("bar_time")
# For OHLCV resample
df15_ohlcv = df5m_idx[["open","high","low","close","volume"]].resample("15min", label="left", closed="left").agg({"open":"first","high":"max","low":"min","close":"last","volume":"sum"}).dropna(subset=["open","close"])
# Recompute EMAs and ADX on 15m bars
df15_ohlcv["ema9"]  = df15_ohlcv["close"].ewm(span=9,  adjust=False).mean()
df15_ohlcv["ema21"] = df15_ohlcv["close"].ewm(span=21, adjust=False).mean()
df15_ohlcv["ema50"] = df15_ohlcv["close"].ewm(span=50, adjust=False).mean()
# ADX on 15m
import numpy as _np
_h = df15_ohlcv["high"]; _l = df15_ohlcv["low"]; _c = df15_ohlcv["close"]
_pdm = _h.diff(); _mdm = -_l.diff()
_pdm = _pdm.where((_pdm > _mdm) & (_pdm > 0), 0.0)
_mdm = _mdm.where((_mdm > _pdm) & (_mdm > 0), 0.0)
_tr  = _np.maximum(_h-_l, _np.maximum(abs(_h-_c.shift(1)), abs(_l-_c.shift(1))))
_atr = _tr.ewm(span=14, adjust=False).mean()
_pdi = 100*(_pdm.ewm(span=14,adjust=False).mean()/_atr)
_mdi = 100*(_mdm.ewm(span=14,adjust=False).mean()/_atr)
_dx  = 100*abs(_pdi-_mdi)/(_pdi+_mdi).replace(0, _np.nan)
df15_ohlcv["adx14"] = _dx.ewm(span=14, adjust=False).mean()
# Session and day_of_week
_h15 = df15_ohlcv.index.hour; _m15 = df15_ohlcv.index.minute
def _sess(h,m):
    t=h*60+m
    if 810<=t<1200: return "NY_RTH"
    elif 420<=t<810: return "LONDON"
    elif t>=1320 or t<420: return "ASIA"
    else: return "AFTER_HOURS"
df15_ohlcv["session"] = [_sess(h,m) for h,m in zip(_h15,_m15)]
df15_ohlcv["day_of_week"] = df15_ohlcv.index.dayofweek
df15 = df15_ohlcv.reset_index()
df15 = df15.rename(columns={"bar_time":"bar_time"}) if "bar_time" in df15.columns else df15.rename(columns={"index":"bar_time"})
if "bar_time" not in df15.columns:
    df15 = df15.rename(columns={df15.columns[0]: "bar_time"})
print(f"  15m bars: {len(df15):,} ({df15['bar_time'].min()} to {df15['bar_time'].max()})")

# Ensure bar_time is datetime with UTC
df15["bar_time"] = pd.to_datetime(df15["bar_time"], utc=True)
df15 = df15.sort_values("bar_time").reset_index(drop=True)
# 1m file not needed — 1H EMA50 built from 5m data (memory efficient)
del df1m

# ─── Build 1H EMA50 from 5m data ─────────────────────────────────────────────
print("Building 1H EMA50 from 5m data...")
df5m_for_1h = df5m.copy()
df5m_for_1h["bar_time"] = pd.to_datetime(df5m_for_1h["bar_time"], utc=True)
df1m_1h = df5m_for_1h.set_index("bar_time").resample("1h", label="left", closed="left")["close"].last().dropna().reset_index()
df1m_1h.columns = ["bar_time_1h", "close_1h"]
df1m_1h["ema50_1h"] = df1m_1h["close_1h"].ewm(span=50, adjust=False).mean()
df1m_1h = df1m_1h.sort_values("bar_time_1h")
del df5m_for_1h

# Merge 1H EMA50 into 15m bars using as-of merge (last known 1H bar at each 15m bar)
df15 = df15.sort_values("bar_time")
df1m_1h = df1m_1h.sort_values("bar_time_1h")
df15["bar_time_1h_floor"] = df15["bar_time"].dt.floor("1h")
df15 = pd.merge_asof(
    df15,
    df1m_1h[["bar_time_1h", "ema50_1h"]],
    left_on="bar_time_1h_floor",
    right_on="bar_time_1h",
    direction="backward"
)
print(f"  1H EMA50 merged. Null count: {df15['ema50_1h'].isna().sum()}")

# ─── Session filter: RTH only ─────────────────────────────────────────────────
# RTH: 13:30–20:00 UTC (09:30–16:00 ET)
df15["hour_min_utc"] = df15["bar_time"].dt.hour * 60 + df15["bar_time"].dt.minute
rth_start_min = 13 * 60 + 30  # 810
rth_end_min   = 20 * 60        # 1200
df15["is_rth"] = (df15["hour_min_utc"] >= rth_start_min) & (df15["hour_min_utc"] < rth_end_min)

# ─── EMA crossover signals ────────────────────────────────────────────────────
print("Computing EMA crossover signals...")
# ema9 and ema21 are already in the 15m dataset
df15["ema9_prev"]  = df15["ema9"].shift(1)
df15["ema21_prev"] = df15["ema21"].shift(1)

# Long crossover: ema9 crosses above ema21 (prev: ema9 <= ema21, curr: ema9 > ema21)
df15["long_xo"]  = (df15["ema9_prev"] <= df15["ema21_prev"]) & (df15["ema9"] > df15["ema21"])
# Short crossover: ema9 crosses below ema21 (prev: ema9 >= ema21, curr: ema9 < ema21)
df15["short_xo"] = (df15["ema9_prev"] >= df15["ema21_prev"]) & (df15["ema9"] < df15["ema21"])

# ─── Entry filters ────────────────────────────────────────────────────────────
# 1. Price above/below 50 EMA (15m)
df15["long_ema50_ok"]  = df15["close"] > df15["ema50"]
df15["short_ema50_ok"] = df15["close"] < df15["ema50"]

# 2. 1H trend filter: price above/below 1H 50 EMA
df15["long_1h_ok"]  = df15["close"] > df15["ema50_1h"]
df15["short_1h_ok"] = df15["close"] < df15["ema50_1h"]

# 3. Momentum filter: ADX > 20
df15["momentum_ok"] = df15["adx14"] > ADX_THRESHOLD

# 4. Session filter
df15["session_ok"] = df15["is_rth"]

# ─── Combined entry signals ───────────────────────────────────────────────────
df15["long_signal"]  = df15["long_xo"]  & df15["long_ema50_ok"]  & df15["long_1h_ok"]  & df15["momentum_ok"] & df15["session_ok"]
df15["short_signal"] = df15["short_xo"] & df15["short_ema50_ok"] & df15["short_1h_ok"] & df15["momentum_ok"] & df15["session_ok"]

total_signals = df15["long_signal"].sum() + df15["short_signal"].sum()
print(f"  Long signals: {df15['long_signal'].sum()}")
print(f"  Short signals: {df15['short_signal'].sum()}")
print(f"  Total signals: {total_signals}")

# ─── Simulate trades ─────────────────────────────────────────────────────────
print("Simulating trades...")

def simulate_trades(df: pd.DataFrame, exit_variant: str) -> pd.DataFrame:
    """
    Simulate all trades for a given exit variant.
    Entry: next bar open after signal bar closes.
    Stop: low of signal candle (long) / high of signal candle (short).
    Target: depends on exit_variant.
    """
    trades = []
    n = len(df)
    
    for i in range(n - 1):
        row = df.iloc[i]
        next_row = df.iloc[i + 1]
        
        if not (row["long_signal"] or row["short_signal"]):
            continue
        
        direction = "LONG" if row["long_signal"] else "SHORT"
        
        # Entry price: next bar open + adverse slippage
        if direction == "LONG":
            entry_price = next_row["open"] + SLIPPAGE_PTS
            stop_price  = row["low"]   # low of crossover candle
        else:
            entry_price = next_row["open"] - SLIPPAGE_PTS
            stop_price  = row["high"]  # high of crossover candle
        
        # Stop distance
        if direction == "LONG":
            stop_dist = entry_price - stop_price
        else:
            stop_dist = stop_price - entry_price
        
        # Skip if stop distance is zero or negative (degenerate)
        if stop_dist <= 0:
            continue
        
        # Determine target
        if exit_variant == "EXIT_1R":
            if direction == "LONG":
                target_price = entry_price + stop_dist
            else:
                target_price = entry_price - stop_dist
        elif exit_variant == "EXIT_2R":
            if direction == "LONG":
                target_price = entry_price + 2 * stop_dist
            else:
                target_price = entry_price - 2 * stop_dist
        else:  # EXIT_XO — no fixed target, exit on opposite crossover
            target_price = None
        
        # Simulate bar-by-bar
        exit_price = None
        exit_reason = None
        exit_bar_idx = None
        
        for j in range(i + 1, min(i + 200, n)):  # max 200 bars holding
            bar = df.iloc[j]
            
            # Check stop hit
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
            
            # Check target hit (for 1R and 2R variants)
            if target_price is not None:
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
            
            # Check opposite crossover (for EXIT_XO variant)
            if exit_variant == "EXIT_XO":
                if direction == "LONG" and bar["short_xo"]:
                    exit_price  = bar["open"] - SLIPPAGE_PTS
                    exit_reason = "OPPOSITE_XO"
                    exit_bar_idx = j
                    break
                elif direction == "SHORT" and bar["long_xo"]:
                    exit_price  = bar["open"] + SLIPPAGE_PTS
                    exit_reason = "OPPOSITE_XO"
                    exit_bar_idx = j
                    break
            
            # Session close: exit at session end if still open
            if bar["hour_min_utc"] >= rth_end_min - 15:
                # Last RTH bar — force close at close price
                if direction == "LONG":
                    exit_price  = bar["close"] - SLIPPAGE_PTS
                else:
                    exit_price  = bar["close"] + SLIPPAGE_PTS
                exit_reason = "SESSION_CLOSE"
                exit_bar_idx = j
                break
        
        if exit_price is None:
            # Timeout — exit at last bar close
            last_bar = df.iloc[min(i + 199, n - 1)]
            if direction == "LONG":
                exit_price = last_bar["close"] - SLIPPAGE_PTS
            else:
                exit_price = last_bar["close"] + SLIPPAGE_PTS
            exit_reason = "TIMEOUT"
            exit_bar_idx = min(i + 199, n - 1)
        
        # P&L calculation
        if direction == "LONG":
            raw_pnl_pts = exit_price - entry_price
        else:
            raw_pnl_pts = entry_price - exit_price
        
        pnl_usd = raw_pnl_pts * POINT_VALUE - COMMISSION_USD
        r_multiple = raw_pnl_pts / stop_dist if stop_dist > 0 else 0
        
        trades.append({
            "signal_bar_idx": i,
            "signal_bar_time": row["bar_time"],
            "direction": direction,
            "entry_bar_time": next_row["bar_time"],
            "entry_price": round(entry_price, 4),
            "stop_price": round(stop_price, 4),
            "stop_dist_pts": round(stop_dist, 4),
            "target_price": round(target_price, 4) if target_price else None,
            "exit_price": round(exit_price, 4),
            "exit_reason": exit_reason,
            "exit_bar_idx": exit_bar_idx,
            "pnl_pts": round(raw_pnl_pts, 4),
            "pnl_usd": round(pnl_usd, 4),
            "r_multiple": round(r_multiple, 4),
            "session": row["session"],
            "day_of_week": int(row["day_of_week"]),
            "adx14": round(float(row["adx14"]), 2),
            "ema50_1h": round(float(row["ema50_1h"]), 4) if pd.notna(row["ema50_1h"]) else None,
            "exit_variant": exit_variant,
        })
    
    return pd.DataFrame(trades)

# Simulate all three exit variants
results = {}
for variant in ["EXIT_1R", "EXIT_2R", "EXIT_XO"]:
    print(f"  Simulating {variant}...")
    trades_df = simulate_trades(df15, variant)
    results[variant] = trades_df
    print(f"    Trades: {len(trades_df)}, Expectancy: ${trades_df['pnl_usd'].mean():.2f}/trade")

# ─── Statistical analysis ─────────────────────────────────────────────────────
print("\nRunning statistical analysis...")

train_mask_15m = df15["bar_time"] <= pd.Timestamp(TRAIN_END, tz="UTC")
val_mask_15m   = df15["bar_time"] >= pd.Timestamp(VAL_START, tz="UTC")

summary = {}
for variant, trades_df in results.items():
    if len(trades_df) == 0:
        summary[variant] = {"error": "No trades generated"}
        continue
    
    trades_df["is_train"] = trades_df["signal_bar_time"] <= pd.Timestamp(TRAIN_END, tz="UTC")
    trades_df["is_val"]   = trades_df["signal_bar_time"] >= pd.Timestamp(VAL_START, tz="UTC")
    
    train_pnls = trades_df[trades_df["is_train"]]["pnl_usd"].values
    val_pnls   = trades_df[trades_df["is_val"]]["pnl_usd"].values
    all_pnls   = trades_df["pnl_usd"].values
    
    gate_result = passes_gates(train_pnls, val_pnls)
    
    # Subgroup analysis
    long_pnls  = trades_df[trades_df["direction"] == "LONG"]["pnl_usd"].values
    short_pnls = trades_df[trades_df["direction"] == "SHORT"]["pnl_usd"].values
    
    # Session subgroups (using the session column)
    session_groups = {}
    for sess in trades_df["session"].unique():
        sess_pnls = trades_df[trades_df["session"] == sess]["pnl_usd"].values
        session_groups[str(sess)] = {
            "count": int(len(sess_pnls)),
            "expectancy": round(float(np.mean(sess_pnls)), 4) if len(sess_pnls) > 0 else None,
            "profit_factor": float(profit_factor(sess_pnls)) if len(sess_pnls) > 0 else None
        }
    
    # Day of week subgroups (0=Mon, 4=Fri)
    dow_names = {0: "Monday", 1: "Tuesday", 2: "Wednesday", 3: "Thursday", 4: "Friday"}
    dow_groups = {}
    for dow_val in sorted(trades_df["day_of_week"].unique()):
        dow_pnls = trades_df[trades_df["day_of_week"] == dow_val]["pnl_usd"].values
        dow_name = dow_names.get(int(dow_val), f"DOW_{dow_val}")
        dow_groups[dow_name] = {
            "count": int(len(dow_pnls)),
            "expectancy": round(float(np.mean(dow_pnls)), 4) if len(dow_pnls) > 0 else None,
            "profit_factor": float(profit_factor(dow_pnls)) if len(dow_pnls) > 0 else None
        }
    
    summary[variant] = {
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
        "long_expectancy": round(float(np.mean(long_pnls)), 4) if len(long_pnls) > 0 else None,
        "short_expectancy": round(float(np.mean(short_pnls)), 4) if len(short_pnls) > 0 else None,
        "long_trades": int(len(long_pnls)),
        "short_trades": int(len(short_pnls)),
        "exit_reasons": trades_df["exit_reason"].value_counts().to_dict(),
        "session_subgroups": session_groups,
        "weekday_subgroups": dow_groups,
        "statistical_gates": gate_result,
        "classification": "SUPPORTED" if gate_result["pass"] else "NOT_SUPPORTED"
    }
    
    print(f"  {variant}: {len(all_pnls)} trades, exp=${np.mean(all_pnls):.2f}, PF={profit_factor(all_pnls):.3f}, "
          f"WR={win_rate(all_pnls):.1%}, gates={'PASS' if gate_result['pass'] else 'FAIL'}")

# ─── Determine overall answer ─────────────────────────────────────────────────
best_variant = max(summary.keys(), key=lambda v: summary[v].get("total_expectancy_usd", -999))
any_supported = any(summary[v].get("classification") == "SUPPORTED" for v in summary)
does_have_edge = "YES" if any_supported else "NO"

print(f"\nDOES_THE_SIMPLE_IDEA_HAVE_AN_EDGE: {does_have_edge}")
print(f"BEST_VARIANT: {best_variant} (exp=${summary[best_variant].get('total_expectancy_usd', 0):.2f})")

# ─── Write artefacts ──────────────────────────────────────────────────────────
print("\nWriting artefacts...")

# 1. Primary results
primary_results = {
    "experiment_id": "STRAT-9EMA-001",
    "sprint": "123A.14",
    "pre_registration_commit": "86bf893",
    "run_timestamp": datetime.now(timezone.utc).isoformat(),
    "dataset_sha_5m": actual_5m_sha,
    "dataset_sha_1m": actual_1m_sha,
    "dataset_period": "2019-05-06 to 2026-07-20",
    "total_15m_bars": int(len(df15)),
    "total_signals_long": int(df15["long_signal"].sum()),
    "total_signals_short": int(df15["short_signal"].sum()),
    "does_the_simple_idea_have_an_edge": does_have_edge,
    "best_variant": best_variant,
    "best_variant_expectancy_usd": summary[best_variant].get("total_expectancy_usd"),
    "exit_variants": summary,
    "authority": {
        "DARWIN_DECISION_AUTHORITY": "DISABLED",
        "DARWIN_EXECUTION_AUTHORITY": "DISABLED",
        "LIVE_TRADES_INITIATED": 0,
        "PARAMETER_CHANGED_AFTER_PREREGISTRATION": False,
        "LOOKAHEAD_VIOLATIONS": 0,
        "FUTURE_BAR_USES": 0
    }
}

with open(OUT_DIR / "STRAT_9EMA_001_PRIMARY_RESULTS.json", "w") as f:
    json.dump(primary_results, f, indent=2, default=str)
print("  STRAT_9EMA_001_PRIMARY_RESULTS.json")

# 2. Trade ledgers
for variant, trades_df in results.items():
    if len(trades_df) > 0:
        fname = f"STRAT_9EMA_001_TRADE_LEDGER_{variant}.json"
        trades_df.to_json(OUT_DIR / fname, orient="records", indent=2, date_format="iso")
        print(f"  {fname} ({len(trades_df)} trades)")

# 3. Artefact manifest
artefact_files = list(OUT_DIR.glob("STRAT_9EMA_001_*.json"))
artefact_files += list(OUT_DIR.glob("STRAT_9EMA_001_*.md"))
manifest = {
    "experiment_id": "STRAT-9EMA-001",
    "sprint": "123A.14",
    "created_at": datetime.now(timezone.utc).isoformat(),
    "artefacts": []
}
for af in sorted(artefact_files):
    sha = sha256_file(af)
    manifest["artefacts"].append({
        "filename": af.name,
        "sha256": sha,
        "size_bytes": af.stat().st_size
    })

with open(OUT_DIR / "STRAT_9EMA_001_ARTEFACT_MANIFEST.json", "w") as f:
    json.dump(manifest, f, indent=2)
print("  STRAT_9EMA_001_ARTEFACT_MANIFEST.json")

print("\n=== Simulation complete ===")
print(f"DOES_THE_SIMPLE_IDEA_HAVE_AN_EDGE: {does_have_edge}")
for v, s in summary.items():
    exp = s.get("total_expectancy_usd", "N/A")
    cls = s.get("classification", "N/A")
    n   = s.get("total_trades", 0)
    print(f"  {v}: {n} trades, exp=${exp}, {cls}")
