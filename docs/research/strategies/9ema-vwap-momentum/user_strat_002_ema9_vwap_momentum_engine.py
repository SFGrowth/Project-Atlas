"""
USER-STRAT-002-EMA9-VWAP-MOMENTUM — Exact Baseline Simulation Engine (Vectorised)
Sprint 123A.14 (correction) | Gate G14

Pre-registration commit: c433fe9
This script is run AFTER the pre-registration commit.

Strategy (exact — no modifications):
  Timeframe: 5-minute bars
  Long alignment:  CLOSE > EMA9 > SESSION_VWAP
  Short alignment: CLOSE < EMA9 < SESSION_VWAP
  Entry: fresh transition to correct alignment → next 5m bar open
  Long exit:  first causal bar where LOW <= EMA9
  Short exit: first causal bar where HIGH >= EMA9
  Session close exit: last bar before 23:00 UTC
  No fixed target, no EMA21, no EMA50, no ADX, no session filter

Secondary safety version: same + 2 ATR emergency stop

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
EXPECTED_SHA = "17206c6289589622a6bf0fc25b0f598752045c2e61a24d0896002f9bfda531fe"

# ─── Constants ────────────────────────────────────────────────────────────────
SLIPPAGE_PTS   = 0.50
COMMISSION_USD = 1.24
POINT_VALUE    = 2.00
TICK_SIZE      = 0.25
SESSION_CLOSE_HOUR_UTC = 23
EMA_PERIOD     = 9
ATR_PERIOD     = 14
ATR_STOP_MULT  = 2.0
TRAIN_END      = "2025-04-30"
VAL_START      = "2025-05-01"
BOOTSTRAP_N    = 10000
PERMUTATION_N  = 10000
SUPPORTED_CI_GATE = 0.0
PROMISING_CI_GATE = -10.0
P_VALUE_GATE   = 0.10
MIN_TRADES     = 50
MAX_BARS_HELD  = 2000
np.random.seed(42)

# ─── Helpers ──────────────────────────────────────────────────────────────────
def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()

def bootstrap_ci(pnls, n=BOOTSTRAP_N):
    if len(pnls) < 2: return (float("nan"), float("nan"))
    means = np.array([np.mean(np.random.choice(pnls, size=len(pnls), replace=True)) for _ in range(n)])
    return (round(float(np.percentile(means, 2.5)), 4), round(float(np.percentile(means, 97.5)), 4))

def permutation_test(pnls, n=PERMUTATION_N):
    if len(pnls) < 2: return float("nan")
    obs = np.mean(pnls)
    count = sum(np.mean(pnls * np.random.choice([-1, 1], size=len(pnls))) >= obs for _ in range(n))
    return round(count / n, 4)

def profit_factor(pnls):
    gp = pnls[pnls > 0].sum(); gl = abs(pnls[pnls < 0].sum())
    return round(float(gp / gl), 4) if gl > 0 else (float("inf") if gp > 0 else float("nan"))

def win_rate(pnls):
    return round(float((pnls > 0).sum() / len(pnls)), 4) if len(pnls) > 0 else float("nan")

def max_drawdown(pnls):
    if len(pnls) == 0: return float("nan")
    eq = np.cumsum(pnls); pk = np.maximum.accumulate(eq)
    return round(float((pk - eq).max()), 2)

def classify(ci_lo, p_val, val_exp, n_trades):
    if n_trades < MIN_TRADES: return "INSUFFICIENT_SAMPLE"
    if ci_lo > SUPPORTED_CI_GATE and p_val < P_VALUE_GATE and val_exp > 0: return "SUPPORTED"
    elif ci_lo > PROMISING_CI_GATE: return "PROMISING"
    else: return "NOT_SUPPORTED"

# ─── Load and verify data ─────────────────────────────────────────────────────
print("=== USER-STRAT-002-EMA9-VWAP-MOMENTUM Simulation Engine (Vectorised) ===")
print(f"Pre-registration commit: c433fe9")
print(f"Run time: {datetime.now(timezone.utc).isoformat()}")

print("Verifying dataset SHA...")
actual_sha = sha256_file(CANONICAL_5M)
assert actual_sha == EXPECTED_SHA, f"SHA mismatch: {actual_sha}"
print(f"  SHA: {actual_sha[:16]}... OK")

print("Loading 5m dataset...")
df = pd.read_parquet(CANONICAL_5M)
df["bar_time"] = pd.to_datetime(df["bar_time"], utc=True)
df = df.sort_values("bar_time").reset_index(drop=True)
print(f"  5m bars: {len(df):,} ({df['bar_time'].min()} to {df['bar_time'].max()})")

# ─── EMA9 ─────────────────────────────────────────────────────────────────────
print("Computing EMA9...")
df["ema9"] = df["close"].ewm(span=EMA_PERIOD, adjust=False).mean()

# ─── ATR14 ────────────────────────────────────────────────────────────────────
print("Computing ATR14...")
_h = df["high"]; _l = df["low"]; _c = df["close"]
_tr = np.maximum(_h - _l, np.maximum(abs(_h - _c.shift(1)), abs(_l - _c.shift(1))))
df["atr14"] = _tr.ewm(span=ATR_PERIOD, adjust=False).mean()

# ─── Session VWAP (reset at 00:00 UTC each day) ───────────────────────────────
print("Computing session VWAP...")
df["date_utc"] = df["bar_time"].dt.date
df["typical_price"] = (df["high"] + df["low"] + df["close"]) / 3
df["tp_vol"] = df["typical_price"] * df["volume"]
vwap_vals = []
for date, grp in df.groupby("date_utc"):
    cum_tp_vol = grp["tp_vol"].cumsum()
    cum_vol    = grp["volume"].cumsum()
    vwap_vals.append(cum_tp_vol / cum_vol.replace(0, float("nan")))
df["vwap"] = pd.concat(vwap_vals).sort_index()

# ─── Session / weekday labels ─────────────────────────────────────────────────
_h_utc = df["bar_time"].dt.hour
_m_utc = df["bar_time"].dt.minute
_t_min = _h_utc * 60 + _m_utc
def _session(t):
    if 810 <= t < 1200: return "NY_RTH"
    elif 420 <= t < 810: return "LONDON"
    elif t >= 1380 or t < 420: return "ASIA"
    else: return "AFTER_HOURS"
df["session"]     = [_session(t) for t in _t_min]
df["day_of_week"] = df["bar_time"].dt.dayofweek
df["year"]        = df["bar_time"].dt.year
df["hour_utc"]    = df["bar_time"].dt.hour
df["is_session_close"] = df["hour_utc"] >= SESSION_CLOSE_HOUR_UTC

# ─── Alignment and signals ────────────────────────────────────────────────────
print("Computing alignment signals...")
df["long_aligned"]  = (df["close"] > df["ema9"]) & (df["ema9"] > df["vwap"])
df["short_aligned"] = (df["close"] < df["ema9"]) & (df["ema9"] < df["vwap"])
df["prev_long"]     = df["long_aligned"].shift(1, fill_value=False)
df["prev_short"]    = df["short_aligned"].shift(1, fill_value=False)
df["long_signal"]   = df["long_aligned"]  & ~df["prev_long"]
df["short_signal"]  = df["short_aligned"] & ~df["prev_short"]

signal_idx = df.index[(df["long_signal"] | df["short_signal"]) & (df.index < len(df) - 1)].tolist()
total_long_signals  = int(df["long_signal"].sum())
total_short_signals = int(df["short_signal"].sum())
print(f"  Long signals:  {total_long_signals:,}")
print(f"  Short signals: {total_short_signals:,}")
print(f"  Total signals: {total_long_signals + total_short_signals:,}")

# ─── Vectorised simulation ────────────────────────────────────────────────────
# Pre-extract numpy arrays for speed
open_arr  = df["open"].values
high_arr  = df["high"].values
low_arr   = df["low"].values
close_arr = df["close"].values
ema9_arr  = df["ema9"].values
vwap_arr  = df["vwap"].values
atr_arr   = df["atr14"].values
hour_arr  = df["hour_utc"].values
sess_arr  = df["session"].values
dow_arr   = df["day_of_week"].values
year_arr  = df["year"].values
time_arr  = df["bar_time"].values
long_sig  = df["long_signal"].values
short_sig = df["short_signal"].values

def simulate_all(use_atr_stop: bool) -> list:
    trades = []
    n = len(open_arr)

    for i in signal_idx:
        is_long = bool(long_sig[i])
        direction = "LONG" if is_long else "SHORT"

        j_entry = i + 1
        if j_entry >= n:
            continue

        # Entry price
        if is_long:
            entry_price = float(open_arr[j_entry]) + SLIPPAGE_PTS
        else:
            entry_price = float(open_arr[j_entry]) - SLIPPAGE_PTS

        atr_val = float(atr_arr[i]) if not np.isnan(atr_arr[i]) else 0.0

        if use_atr_stop and atr_val > 0:
            atr_stop = entry_price - ATR_STOP_MULT * atr_val if is_long else entry_price + ATR_STOP_MULT * atr_val
        else:
            atr_stop = None

        exit_price  = None
        exit_reason = None
        exit_j      = None
        bars_held   = 0
        mfe_pts     = 0.0
        mae_pts     = 0.0
        atr_r1 = atr_r2 = atr_r3 = atr_r5 = False

        for j in range(j_entry, min(j_entry + MAX_BARS_HELD, n)):
            bars_held = j - i
            bar_high  = float(high_arr[j])
            bar_low   = float(low_arr[j])
            bar_ema9  = float(ema9_arr[j])
            bar_hour  = int(hour_arr[j])

            # MFE/MAE
            if is_long:
                fav = bar_high - entry_price
                adv = entry_price - bar_low
            else:
                fav = entry_price - bar_low
                adv = bar_high - entry_price
            if fav > mfe_pts: mfe_pts = fav
            if adv > mae_pts: mae_pts = adv

            # ATR reach
            if atr_val > 0:
                if fav >= 1.0 * atr_val: atr_r1 = True
                if fav >= 2.0 * atr_val: atr_r2 = True
                if fav >= 3.0 * atr_val: atr_r3 = True
                if fav >= 5.0 * atr_val: atr_r5 = True

            # ATR stop
            if atr_stop is not None:
                if is_long and bar_low <= atr_stop:
                    exit_price  = atr_stop - SLIPPAGE_PTS
                    exit_reason = "ATR_STOP"
                    exit_j = j; break
                elif not is_long and bar_high >= atr_stop:
                    exit_price  = atr_stop + SLIPPAGE_PTS
                    exit_reason = "ATR_STOP"
                    exit_j = j; break

            # EMA9 touch
            if is_long and bar_low <= bar_ema9:
                exit_price  = bar_ema9 - SLIPPAGE_PTS
                exit_reason = "EMA9_TOUCH"
                exit_j = j; break
            elif not is_long and bar_high >= bar_ema9:
                exit_price  = bar_ema9 + SLIPPAGE_PTS
                exit_reason = "EMA9_TOUCH"
                exit_j = j; break

            # Session close
            if bar_hour >= SESSION_CLOSE_HOUR_UTC:
                bar_close = float(close_arr[j])
                exit_price  = bar_close - SLIPPAGE_PTS if is_long else bar_close + SLIPPAGE_PTS
                exit_reason = "SESSION_CLOSE"
                exit_j = j; break

        if exit_price is None:
            last_j = min(j_entry + MAX_BARS_HELD - 1, n - 1)
            bar_close = float(close_arr[last_j])
            exit_price  = bar_close - SLIPPAGE_PTS if is_long else bar_close + SLIPPAGE_PTS
            exit_reason = "TIMEOUT"
            exit_j = last_j

        raw_pts = (exit_price - entry_price) if is_long else (entry_price - exit_price)
        pnl_usd = raw_pts * POINT_VALUE - COMMISSION_USD

        trades.append({
            "signal_bar_idx":  i,
            "signal_bar_time": str(pd.Timestamp(time_arr[i])),
            "direction":       direction,
            "entry_bar_time":  str(pd.Timestamp(time_arr[j_entry])),
            "entry_price":     round(entry_price, 4),
            "ema9_at_signal":  round(float(ema9_arr[i]), 4),
            "vwap_at_signal":  round(float(vwap_arr[i]), 4) if not np.isnan(vwap_arr[i]) else None,
            "atr14_at_signal": round(atr_val, 4),
            "atr_stop":        round(atr_stop, 4) if atr_stop is not None else None,
            "exit_price":      round(exit_price, 4),
            "exit_reason":     exit_reason,
            "bars_held":       bars_held,
            "pnl_pts":         round(raw_pts, 4),
            "pnl_usd":         round(pnl_usd, 4),
            "mfe_pts":         round(mfe_pts, 4),
            "mae_pts":         round(mae_pts, 4),
            "atr_reached_1":   atr_r1,
            "atr_reached_2":   atr_r2,
            "atr_reached_3":   atr_r3,
            "atr_reached_5":   atr_r5,
            "session":         str(sess_arr[i]),
            "day_of_week":     int(dow_arr[i]),
            "year":            int(year_arr[i]),
        })

    return trades

print("\nSimulating primary version (no fixed target)...")
trades_primary_list = simulate_all(use_atr_stop=False)
trades_primary = pd.DataFrame(trades_primary_list)
print(f"  Primary: {len(trades_primary):,} trades")

print("Simulating secondary safety version (2 ATR stop)...")
trades_safety_list = simulate_all(use_atr_stop=True)
trades_safety = pd.DataFrame(trades_safety_list)
print(f"  Safety:  {len(trades_safety):,} trades")

# ─── Analysis ─────────────────────────────────────────────────────────────────
def analyse(tdf: pd.DataFrame, label: str) -> dict:
    if len(tdf) == 0: return {"error": "No trades"}
    pnls = tdf["pnl_usd"].values
    tdf = tdf.copy()
    tdf["signal_dt"] = pd.to_datetime(tdf["signal_bar_time"], utc=True)
    tdf["is_train"]  = tdf["signal_dt"] <= pd.Timestamp(TRAIN_END, tz="UTC")
    tdf["is_val"]    = tdf["signal_dt"] >= pd.Timestamp(VAL_START, tz="UTC")

    train_pnls = tdf[tdf["is_train"]]["pnl_usd"].values
    val_pnls   = tdf[tdf["is_val"]]["pnl_usd"].values
    long_pnls  = tdf[tdf["direction"] == "LONG"]["pnl_usd"].values
    short_pnls = tdf[tdf["direction"] == "SHORT"]["pnl_usd"].values

    date_weeks = (tdf["signal_dt"].max() - tdf["signal_dt"].min()).days / 7
    tpw = round(len(tdf) / date_weeks, 2) if date_weeks > 0 else float("nan")

    ci_lo, ci_hi = bootstrap_ci(train_pnls)
    p_val = permutation_test(train_pnls)
    val_exp = float(np.mean(val_pnls)) if len(val_pnls) > 0 else float("nan")
    cls = classify(ci_lo, p_val, val_exp, len(train_pnls))

    # Holding time histogram
    bh = tdf["bars_held"].value_counts().sort_index()
    bh_dict = {str(k): int(v) for k, v in bh.items() if k <= 100}
    bh_dict["100+"] = int((tdf["bars_held"] > 100).sum())

    # ATR reach
    n_t = len(tdf)
    atr_reach = {
        "pct_reaching_1atr": round(float(tdf["atr_reached_1"].sum()) / n_t, 4),
        "pct_reaching_2atr": round(float(tdf["atr_reached_2"].sum()) / n_t, 4),
        "pct_reaching_3atr": round(float(tdf["atr_reached_3"].sum()) / n_t, 4),
        "pct_reaching_5atr": round(float(tdf["atr_reached_5"].sum()) / n_t, 4),
    }

    # Session breakdown
    sess_res = {}
    for s in ["NY_RTH", "LONDON", "ASIA", "AFTER_HOURS"]:
        sp = tdf[tdf["session"] == s]["pnl_usd"].values
        sess_res[s] = {"count": int(len(sp)),
                       "expectancy": round(float(np.mean(sp)), 4) if len(sp) > 0 else None,
                       "profit_factor": float(profit_factor(sp)) if len(sp) > 0 else None,
                       "win_rate": float(win_rate(sp)) if len(sp) > 0 else None}

    # Year-by-year
    yr_res = {}
    for yr in sorted(tdf["year"].unique()):
        yp = tdf[tdf["year"] == yr]["pnl_usd"].values
        yr_res[str(yr)] = {"count": int(len(yp)),
                           "expectancy": round(float(np.mean(yp)), 4) if len(yp) > 0 else None,
                           "profit_factor": float(profit_factor(yp)) if len(yp) > 0 else None,
                           "win_rate": float(win_rate(yp)) if len(yp) > 0 else None,
                           "total_pnl": round(float(yp.sum()), 2) if len(yp) > 0 else None}

    wins = pnls[pnls > 0]; losses = pnls[pnls < 0]
    return {
        "label": label,
        "total_signals": total_long_signals + total_short_signals,
        "filled_trades": int(len(pnls)),
        "trades_per_week": tpw,
        "win_rate": float(win_rate(pnls)),
        "profit_factor": float(profit_factor(pnls)),
        "expectancy_usd": round(float(np.mean(pnls)), 4),
        "total_net_pnl_usd": round(float(pnls.sum()), 2),
        "max_drawdown_usd": float(max_drawdown(pnls)),
        "avg_win_usd": round(float(np.mean(wins)), 4) if len(wins) > 0 else None,
        "avg_loss_usd": round(float(np.mean(losses)), 4) if len(losses) > 0 else None,
        "max_win_usd": round(float(wins.max()), 4) if len(wins) > 0 else None,
        "max_loss_usd": round(float(losses.min()), 4) if len(losses) > 0 else None,
        "long_trades": int(len(long_pnls)),
        "long_expectancy_usd": round(float(np.mean(long_pnls)), 4) if len(long_pnls) > 0 else None,
        "long_win_rate": float(win_rate(long_pnls)) if len(long_pnls) > 0 else None,
        "long_profit_factor": float(profit_factor(long_pnls)) if len(long_pnls) > 0 else None,
        "short_trades": int(len(short_pnls)),
        "short_expectancy_usd": round(float(np.mean(short_pnls)), 4) if len(short_pnls) > 0 else None,
        "short_win_rate": float(win_rate(short_pnls)) if len(short_pnls) > 0 else None,
        "short_profit_factor": float(profit_factor(short_pnls)) if len(short_pnls) > 0 else None,
        "training_trades": int(len(train_pnls)),
        "training_expectancy_usd": round(float(np.mean(train_pnls)), 4) if len(train_pnls) > 0 else None,
        "validation_trades": int(len(val_pnls)),
        "validation_expectancy_usd": round(float(val_exp), 4) if not np.isnan(val_exp) else None,
        "bootstrap_95ci_lower": ci_lo,
        "bootstrap_95ci_upper": ci_hi,
        "permutation_p": p_val,
        "classification": cls,
        "holding_time_distribution_bars": bh_dict,
        "atr_reach_analysis": atr_reach,
        "session_results": sess_res,
        "year_by_year_results": yr_res,
        "exit_reasons": tdf["exit_reason"].value_counts().to_dict(),
    }

print("\nRunning statistical analysis...")
primary_analysis = analyse(trades_primary, "PRIMARY_NO_FIXED_TARGET")
safety_analysis  = analyse(trades_safety,  "SECONDARY_2ATR_STOP")

print(f"\n=== PRIMARY VERSION ===")
print(f"  Trades:      {primary_analysis['filled_trades']:,}")
print(f"  Exp/trade:   ${primary_analysis['expectancy_usd']:.2f}")
print(f"  PF:          {primary_analysis['profit_factor']:.3f}")
print(f"  WR:          {primary_analysis['win_rate']:.1%}")
print(f"  Total P&L:   ${primary_analysis['total_net_pnl_usd']:,.0f}")
print(f"  Max DD:      ${primary_analysis['max_drawdown_usd']:,.0f}")
print(f"  CI:          [{primary_analysis['bootstrap_95ci_lower']}, {primary_analysis['bootstrap_95ci_upper']}]")
print(f"  p-value:     {primary_analysis['permutation_p']}")
v = primary_analysis['validation_expectancy_usd']
print(f"  Val exp:     ${v:.2f}" if v is not None else "  Val exp:     N/A")
print(f"  Class:       {primary_analysis['classification']}")

print(f"\n=== SECONDARY SAFETY VERSION (2 ATR stop) ===")
print(f"  Trades:      {safety_analysis['filled_trades']:,}")
print(f"  Exp/trade:   ${safety_analysis['expectancy_usd']:.2f}")
print(f"  PF:          {safety_analysis['profit_factor']:.3f}")
print(f"  WR:          {safety_analysis['win_rate']:.1%}")
print(f"  Total P&L:   ${safety_analysis['total_net_pnl_usd']:,.0f}")
print(f"  Max DD:      ${safety_analysis['max_drawdown_usd']:,.0f}")
print(f"  Class:       {safety_analysis['classification']}")

# ─── Write artefacts ──────────────────────────────────────────────────────────
print("\nWriting artefacts...")
primary_cls = primary_analysis["classification"]
does_have_edge = "YES" if primary_cls == "SUPPORTED" else ("PROMISING" if primary_cls == "PROMISING" else "NO")

primary_results = {
    "experiment_id": "USER-STRAT-002-EMA9-VWAP-MOMENTUM",
    "sprint": "123A.14",
    "pre_registration_commit": "c433fe9",
    "run_timestamp": datetime.now(timezone.utc).isoformat(),
    "dataset_sha": actual_sha,
    "dataset_period": f"{df['bar_time'].min().date()} to {df['bar_time'].max().date()}",
    "total_5m_bars": int(len(df)),
    "total_signals": total_long_signals + total_short_signals,
    "total_long_signals": total_long_signals,
    "total_short_signals": total_short_signals,
    "does_phils_strategy_have_edge": does_have_edge,
    "primary_version": primary_analysis,
    "secondary_safety_version": safety_analysis,
    "authority": {
        "DARWIN_DECISION_AUTHORITY": "DISABLED",
        "DARWIN_EXECUTION_AUTHORITY": "DISABLED",
        "LIVE_TRADES_INITIATED": 0,
        "PARAMETER_CHANGED_AFTER_PREREGISTRATION": False,
        "LOOKAHEAD_VIOLATIONS": 0,
        "FUTURE_BAR_USES": 0,
        "WRONG_STRATEGY_SUPERSEDED": "STRAT-9EMA-002"
    }
}

with open(OUT_DIR / "USER_STRAT_002_EMA9_VWAP_MOMENTUM_PRIMARY_RESULTS.json", "w") as f:
    json.dump(primary_results, f, indent=2, default=str)
print("  PRIMARY_RESULTS.json written")

trades_primary.to_json(OUT_DIR / "USER_STRAT_002_EMA9_VWAP_MOMENTUM_TRADE_LEDGER_PRIMARY.json",
                       orient="records", indent=2, date_format="iso")
print(f"  TRADE_LEDGER_PRIMARY.json ({len(trades_primary):,} trades)")

trades_safety.to_json(OUT_DIR / "USER_STRAT_002_EMA9_VWAP_MOMENTUM_TRADE_LEDGER_SAFETY.json",
                      orient="records", indent=2, date_format="iso")
print(f"  TRADE_LEDGER_SAFETY.json ({len(trades_safety):,} trades)")

artefact_files = sorted(OUT_DIR.glob("USER_STRAT_002_*.json")) + sorted(OUT_DIR.glob("USER_STRAT_002_*.md"))
manifest = {
    "experiment_id": "USER-STRAT-002-EMA9-VWAP-MOMENTUM",
    "sprint": "123A.14",
    "created_at": datetime.now(timezone.utc).isoformat(),
    "artefacts": [{"filename": af.name, "sha256": sha256_file(af), "size_bytes": af.stat().st_size}
                  for af in artefact_files]
}
with open(OUT_DIR / "USER_STRAT_002_EMA9_VWAP_MOMENTUM_ARTEFACT_MANIFEST.json", "w") as f:
    json.dump(manifest, f, indent=2)
print("  ARTEFACT_MANIFEST.json written")

print(f"\n=== FINAL ANSWER ===")
print(f"DOES_PHILS_STRATEGY_HAVE_EDGE: {does_have_edge}")
print(f"CLASSIFICATION: {primary_cls}")
print(f"FILLED_TRADES: {primary_analysis['filled_trades']:,}")
print(f"EXPECTANCY: ${primary_analysis['expectancy_usd']:.2f}/trade")
print(f"PROFIT_FACTOR: {primary_analysis['profit_factor']:.3f}")
print(f"WIN_RATE: {primary_analysis['win_rate']:.1%}")
print(f"TOTAL_NET_PNL: ${primary_analysis['total_net_pnl_usd']:,.0f}")
print(f"MAX_DRAWDOWN: ${primary_analysis['max_drawdown_usd']:,.0f}")
print(f"BOOTSTRAP_95CI: [{primary_analysis['bootstrap_95ci_lower']}, {primary_analysis['bootstrap_95ci_upper']}]")
print(f"PERMUTATION_P: {primary_analysis['permutation_p']}")
