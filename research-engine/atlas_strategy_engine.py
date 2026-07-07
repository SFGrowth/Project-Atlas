#!/usr/bin/env python3
"""
Atlas Strategy Research Engine v2.0
=====================================
Scientific, evidence-based strategy research engine.

Every test reports:
  - Net Profit, Profit Factor, Win Rate, Max Drawdown
  - Average Trade, Expectancy (R-multiple), Number of Trades
  - Average Winner, Average Loser, Largest Losing Streak
  - Long vs Short performance
  - Session performance (AM / Mid / PM)
  - Market regime performance (trending vs ranging)

Every component test produces:
  Hypothesis → Result → Evidence → Decision

Minimum 100 trades required for any result to be considered valid.

Optimises for ROBUSTNESS across all metrics, not just Profit Factor.
"""

import pandas as pd
import numpy as np
from pathlib import Path
from itertools import product
import warnings
warnings.filterwarnings("ignore")

# ─────────────────────────────────────────────────────────────────────────────
# CONFIG
# ─────────────────────────────────────────────────────────────────────────────
DATA_PATH   = Path("/home/ubuntu/Project-Atlas/data/raw/massive/MNQ_5min_full.csv")
OUTPUT_DIR  = Path("/home/ubuntu/Project-Atlas/research-engine/results")
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

POINT_VALUE       = 2.0      # MNQ: $2 per point
RISK_DOLLARS      = 400.0    # Prop account risk per trade
DAILY_LOSS_LIMIT  = -1000.0  # Prop firm daily loss limit
MIN_TRADES        = 100      # Minimum trades for a result to be considered valid

SESSION_START     = 9  * 60 + 30   # 09:30 ET
SESSION_END       = 16 * 60        # 16:00 ET
AVOID_OPEN_MINS   = 15             # Skip 09:30–09:45

# Session buckets (ET minutes)
SESSION_AM_END    = 11 * 60        # 09:30–11:00
SESSION_MID_END   = 13 * 60        # 11:00–13:00
# PM = 13:00–16:00

# ─────────────────────────────────────────────────────────────────────────────
# DATA LOADING
# ─────────────────────────────────────────────────────────────────────────────
def load_data():
    print("Loading MNQ 5-min data...")
    df = pd.read_csv(DATA_PATH)
    df["ts"] = pd.to_datetime(df["timestamp_et"], utc=True).dt.tz_convert("America/New_York")
    df = df.sort_values("ts").reset_index(drop=True)
    df["time_min"] = df["ts"].dt.hour * 60 + df["ts"].dt.minute
    df["date"]     = df["ts"].dt.date
    df["is_rth"]   = (df["time_min"] >= SESSION_START) & (df["time_min"] < SESSION_END)
    df["avoid_open"] = df["time_min"] < (SESSION_START + AVOID_OPEN_MINS)

    # Session bucket
    df["session_bucket"] = np.where(
        df["time_min"] < SESSION_AM_END, "AM",
        np.where(df["time_min"] < SESSION_MID_END, "Mid", "PM")
    )
    print(f"  Loaded {len(df):,} rows | {df['date'].nunique()} trading days")
    print(f"  Date range: {df['ts'].min()} → {df['ts'].max()}")
    return df

# ─────────────────────────────────────────────────────────────────────────────
# INDICATORS (vectorised)
# ─────────────────────────────────────────────────────────────────────────────
def add_indicators(df, fast_ema=9, slow_ema=21, atr_len=14):
    print(f"  Computing indicators (EMA {fast_ema}/{slow_ema}, ATR {atr_len})...")
    df["ema_fast"] = df["close"].ewm(span=fast_ema, adjust=False).mean()
    df["ema_slow"] = df["close"].ewm(span=slow_ema, adjust=False).mean()
    df["ema_slope"] = df["ema_slow"].diff(3)

    tr = pd.concat([
        df["high"] - df["low"],
        (df["high"] - df["close"].shift(1)).abs(),
        (df["low"]  - df["close"].shift(1)).abs()
    ], axis=1).max(axis=1)
    df["atr"] = tr.ewm(alpha=1/atr_len, adjust=False).mean()

    df["tp"]       = (df["high"] + df["low"] + df["close"]) / 3
    df["tp_vol"]   = df["tp"] * df["volume"]
    df["cum_tp_vol"] = df.groupby("date")["tp_vol"].cumsum()
    df["cum_vol"]    = df.groupby("date")["volume"].cumsum()
    df["vwap"]     = df["cum_tp_vol"] / df["cum_vol"]

    bar_range = (df["high"] - df["low"]).replace(0, np.nan)
    df["close_ratio"]   = (df["close"] - df["low"]) / bar_range
    df["body_size"]     = (df["close"] - df["open"]).abs()
    df["body_atr_ratio"]= df["body_size"] / df["atr"].replace(0, np.nan)
    df["bar_bullish"]   = df["close"] > df["open"]
    df["bar_bearish"]   = df["close"] < df["open"]
    df["dist_ema_atr"]  = (df["close"] - df["ema_slow"]).abs() / df["atr"].replace(0, np.nan)
    df["dist_vwap_atr"] = (df["close"] - df["vwap"]).abs()    / df["atr"].replace(0, np.nan)

    # Regime: simple ADX proxy — ratio of directional move to ATR
    df["adx_proxy"] = df["ema_slope"].abs() / df["atr"].replace(0, np.nan)
    df["regime"] = np.where(df["adx_proxy"] > 0.3, "trending", "ranging")

    return df

# ─────────────────────────────────────────────────────────────────────────────
# STRUCTURE ENGINE (vectorised)
# ─────────────────────────────────────────────────────────────────────────────
def add_structure(df, pivot_len=5):
    print(f"  Computing structure (pivot_len={pivot_len})...")
    n = len(df)
    highs = df["high"].values
    lows  = df["low"].values
    closes= df["close"].values

    ph_arr = np.full(n, np.nan)
    pl_arr = np.full(n, np.nan)

    for i in range(pivot_len, n - pivot_len):
        if highs[i] == highs[i-pivot_len:i+pivot_len+1].max():
            ph_arr[i] = highs[i]
        if lows[i]  == lows[i-pivot_len:i+pivot_len+1].min():
            pl_arr[i] = lows[i]

    df["pivot_high"] = ph_arr
    df["pivot_low"]  = pl_arr

    struct_trend = np.zeros(n, dtype=np.int8)
    bos_bull  = np.zeros(n, dtype=bool)
    bos_bear  = np.zeros(n, dtype=bool)
    choch_bull= np.zeros(n, dtype=bool)
    choch_bear= np.zeros(n, dtype=bool)

    cur_trend = 0
    active_bull = np.nan
    active_bear = np.nan
    last_ph_idx = -1
    last_pl_idx = -1

    for i in range(1, n):
        if not np.isnan(ph_arr[i]):
            active_bull = ph_arr[i]
            last_ph_idx = i
        if not np.isnan(pl_arr[i]):
            active_bear = pl_arr[i]
            last_pl_idx = i

        c = closes[i]
        if not np.isnan(active_bull) and c > active_bull:
            if cur_trend <= 0:
                choch_bull[i] = True
                cur_trend = 1
            else:
                bos_bull[i] = True
            active_bull = np.nan
        if not np.isnan(active_bear) and c < active_bear:
            if cur_trend >= 0:
                choch_bear[i] = True
                cur_trend = -1
            else:
                bos_bear[i] = True
            active_bear = np.nan
        struct_trend[i] = cur_trend

    df["struct_trend"] = struct_trend
    df["bos_bull"]     = bos_bull
    df["bos_bear"]     = bos_bear
    df["choch_bull"]   = choch_bull
    df["choch_bear"]   = choch_bear

    # Bars since last bullish/bearish structure event
    bsbb = np.full(n, 9999, dtype=np.int32)
    bsbe = np.full(n, 9999, dtype=np.int32)
    cb = 9999; ce = 9999
    for i in range(n):
        if bos_bull[i] or choch_bull[i]: cb = 0
        else: cb += 1
        if bos_bear[i] or choch_bear[i]: ce = 0
        else: ce += 1
        bsbb[i] = cb
        bsbe[i] = ce
    df["bars_since_bos_bull"] = bsbb
    df["bars_since_bos_bear"] = bsbe
    return df

# ─────────────────────────────────────────────────────────────────────────────
# PULLBACK / LEG DETECTION (vectorised)
# ─────────────────────────────────────────────────────────────────────────────
def add_pullback_legs(df):
    print("  Computing pullback legs (H1/H2/L1/L2)...")
    n = len(df)
    h1 = np.zeros(n, dtype=bool)
    h2 = np.zeros(n, dtype=bool)
    l1 = np.zeros(n, dtype=bool)
    l2 = np.zeros(n, dtype=bool)

    struct  = df["struct_trend"].values
    highs   = df["high"].values
    lows    = df["low"].values
    closes  = df["close"].values
    ema_f   = df["ema_fast"].values
    ema_s   = df["ema_slow"].values

    in_pb_bull = False; h1_seen = False
    in_pb_bear = False; l1_seen = False

    for i in range(2, n):
        t = struct[i]

        # ── LONG (bullish trend) ──
        if t == 1:
            if lows[i] < lows[i-1]:
                if not in_pb_bull:
                    in_pb_bull = True; h1_seen = False
            elif in_pb_bull and highs[i] > highs[i-1]:
                if not h1_seen:
                    h1[i] = True; h1_seen = True
                else:
                    h2[i] = True; in_pb_bull = False; h1_seen = False
        else:
            in_pb_bull = False; h1_seen = False

        # ── SHORT (bearish trend) ──
        if t == -1:
            if highs[i] > highs[i-1]:
                if not in_pb_bear:
                    in_pb_bear = True; l1_seen = False
            elif in_pb_bear and lows[i] < lows[i-1]:
                if not l1_seen:
                    l1[i] = True; l1_seen = True
                else:
                    l2[i] = True; in_pb_bear = False; l1_seen = False
        else:
            in_pb_bear = False; l1_seen = False

    df["h1_signal"] = h1
    df["h2_signal"] = h2
    df["l1_signal"] = l1
    df["l2_signal"] = l2
    return df

# ─────────────────────────────────────────────────────────────────────────────
# SIGNAL GENERATION (vectorised — produces entry candidate rows)
# ─────────────────────────────────────────────────────────────────────────────
def generate_signals(df, p):
    """
    Apply all filters and return a boolean mask of valid entry bars.
    Direction is encoded separately.
    """
    use_structure   = p.get("use_structure",   True)
    use_two_leg     = p.get("use_two_leg",      True)
    min_cr          = p.get("min_close_ratio",  0.65)
    min_body        = p.get("min_body_atr",     0.10)
    max_ema_dist    = p.get("max_ema_dist",     99.0)
    max_bos_bars    = p.get("max_bars_since_bos", 50)
    min_atr         = p.get("min_atr",          3.0)
    max_atr         = p.get("max_atr",          60.0)

    # Trend conditions
    bull = (
        (df["struct_trend"] == 1) &
        (df["ema_fast"] > df["ema_slow"]) &
        (df["close"] > df["ema_slow"]) &
        (df["ema_slope"] > 0)
    )
    bear = (
        (df["struct_trend"] == -1) &
        (df["ema_fast"] < df["ema_slow"]) &
        (df["close"] < df["ema_slow"]) &
        (df["ema_slope"] < 0)
    )

    # Structure filter
    if use_structure:
        bull = bull & (df["bars_since_bos_bull"] <= max_bos_bars)
        bear = bear & (df["bars_since_bos_bear"] <= max_bos_bars)

    # Pullback signal
    if use_two_leg:
        long_sig  = df["h2_signal"]
        short_sig = df["l2_signal"]
    else:
        long_sig  = df["h1_signal"] | df["h2_signal"]
        short_sig = df["l1_signal"] | df["l2_signal"]

    # Signal bar quality — long
    long_quality = (
        (df["close_ratio"] >= min_cr) &
        (df["body_atr_ratio"] >= min_body) &
        df["bar_bullish"]
    )
    # Signal bar quality — short
    short_quality = (
        (df["close_ratio"] <= (1 - min_cr)) &
        (df["body_atr_ratio"] >= min_body) &
        df["bar_bearish"]
    )

    # Location filter
    location_ok = df["dist_ema_atr"] <= max_ema_dist

    # Volatility filter
    vol_ok = (df["atr"] >= min_atr) & (df["atr"] <= max_atr)

    # Session filter
    session_ok = df["is_rth"] & ~df["avoid_open"]

    long_entry  = bull & long_sig  & long_quality  & location_ok & vol_ok & session_ok
    short_entry = bear & short_sig & short_quality & location_ok & vol_ok & session_ok

    return long_entry, short_entry

# ─────────────────────────────────────────────────────────────────────────────
# BACKTESTER (event-driven, fast)
# ─────────────────────────────────────────────────────────────────────────────
def backtest(df, p):
    rr          = p.get("rr_ratio",       2.0)
    stop_mult   = p.get("stop_atr_mult",  1.0)

    long_entry, short_entry = generate_signals(df, p)

    n = len(df)
    opens   = df["open"].values
    highs   = df["high"].values
    lows    = df["low"].values
    atrs    = df["atr"].values
    dates   = df["date"].values
    sessions= df["session_bucket"].values
    regimes = df["regime"].values
    struct  = df["struct_trend"].values

    trades = []
    in_trade = False
    t_dir = 0; t_entry = 0.0; t_stop = 0.0; t_target = 0.0
    t_entry_idx = 0
    daily_pnl = {}

    for i in range(50, n - 1):
        # ── MANAGE OPEN TRADE ──
        if in_trade:
            nxt_h = highs[i+1]; nxt_l = lows[i+1]
            if t_dir == 1:
                hit_stop   = nxt_l <= t_stop
                hit_target = nxt_h >= t_target
            else:
                hit_stop   = nxt_h >= t_stop
                hit_target = nxt_l <= t_target

            if hit_stop or hit_target:
                if hit_target and not hit_stop:
                    exit_p = t_target; reason = "target"
                elif hit_stop and not hit_target:
                    exit_p = t_stop;   reason = "stop"
                else:
                    # Both hit on same bar — assume stop (conservative)
                    exit_p = t_stop;   reason = "stop"

                raw_pnl = (exit_p - t_entry) * t_dir * POINT_VALUE
                risk_pts = abs(t_entry - t_stop)
                contracts = max(1, int(RISK_DOLLARS / (risk_pts * POINT_VALUE))) if risk_pts > 0 else 1
                actual_pnl = raw_pnl * contracts
                r_mult = raw_pnl / (risk_pts * POINT_VALUE) if risk_pts > 0 else 0

                d = dates[t_entry_idx]
                daily_pnl[d] = daily_pnl.get(d, 0) + actual_pnl

                trades.append({
                    "direction":  t_dir,
                    "pnl":        actual_pnl,
                    "r_multiple": r_mult,
                    "exit_reason":reason,
                    "contracts":  contracts,
                    "session":    sessions[t_entry_idx],
                    "regime":     regimes[t_entry_idx],
                    "bars_held":  i + 1 - t_entry_idx,
                })
                in_trade = False
            continue

        # ── DAILY LOSS GUARD ──
        today = dates[i]
        if daily_pnl.get(today, 0) <= DAILY_LOSS_LIMIT:
            continue

        # ── ENTRY ──
        atr = atrs[i]
        if np.isnan(atr) or atr <= 0:
            continue

        entry = opens[i+1]
        stop_dist = atr * stop_mult

        if long_entry.iloc[i]:
            t_dir = 1
            t_stop   = entry - stop_dist
            t_target = entry + stop_dist * rr
        elif short_entry.iloc[i]:
            t_dir = -1
            t_stop   = entry + stop_dist
            t_target = entry - stop_dist * rr
        else:
            continue

        in_trade = True
        t_entry = entry
        t_entry_idx = i

    return compute_metrics(trades, p)

# ─────────────────────────────────────────────────────────────────────────────
# METRICS (full robustness suite)
# ─────────────────────────────────────────────────────────────────────────────
def compute_metrics(trades, p):
    base = {**p}

    if len(trades) < MIN_TRADES:
        base.update({
            "trades": len(trades), "profit_factor": 0, "win_rate": 0,
            "net_pnl": 0, "avg_trade": 0, "max_drawdown": 0,
            "expectancy": 0, "avg_winner": 0, "avg_loser": 0,
            "largest_losing_streak": 0, "avg_bars_held": 0,
            "long_pf": 0, "short_pf": 0,
            "am_pf": 0, "mid_pf": 0, "pm_pf": 0,
            "trending_pf": 0, "ranging_pf": 0,
            "valid": False
        })
        return base

    pnls   = np.array([t["pnl"]        for t in trades])
    rmults = np.array([t["r_multiple"] for t in trades])
    dirs   = np.array([t["direction"]  for t in trades])
    sess   = np.array([t["session"]    for t in trades])
    reg    = np.array([t["regime"]     for t in trades])
    bars   = np.array([t["bars_held"]  for t in trades])
    exits  = np.array([t["exit_reason"]for t in trades])

    wins   = pnls[pnls > 0]
    losses = pnls[pnls <= 0]
    gp = wins.sum()  if len(wins)   > 0 else 0.0
    gl = abs(losses.sum()) if len(losses) > 0 else 0.0

    pf = gp / gl if gl > 0 else 999.0

    # Max drawdown
    equity = np.cumsum(pnls)
    peak   = np.maximum.accumulate(equity)
    dd     = equity - peak
    max_dd = dd.min()

    # Largest losing streak
    streak = 0; max_streak = 0
    for p_val in pnls:
        if p_val <= 0:
            streak += 1; max_streak = max(max_streak, streak)
        else:
            streak = 0

    # Long vs short
    def sub_pf(mask):
        sub = pnls[mask]
        if len(sub) < 5: return 0.0
        sp = sub[sub > 0].sum(); sl = abs(sub[sub <= 0].sum())
        return round(sp / sl, 3) if sl > 0 else 999.0

    long_mask  = dirs == 1
    short_mask = dirs == -1
    am_mask    = sess == "AM"
    mid_mask   = sess == "Mid"
    pm_mask    = sess == "PM"
    trend_mask = reg  == "trending"
    range_mask = reg  == "ranging"

    base.update({
        "trades":                len(trades),
        "profit_factor":         round(pf, 3),
        "win_rate":              round(len(wins) / len(pnls) * 100, 2),
        "net_pnl":               round(pnls.sum(), 2),
        "avg_trade":             round(pnls.mean(), 2),
        "max_drawdown":          round(max_dd, 2),
        "expectancy":            round(rmults.mean(), 3),
        "avg_winner":            round(wins.mean(), 2)   if len(wins)   > 0 else 0,
        "avg_loser":             round(losses.mean(), 2) if len(losses) > 0 else 0,
        "largest_losing_streak": max_streak,
        "avg_bars_held":         round(bars.mean(), 1),
        "long_pf":               sub_pf(long_mask),
        "short_pf":              sub_pf(short_mask),
        "am_pf":                 sub_pf(am_mask),
        "mid_pf":                sub_pf(mid_mask),
        "pm_pf":                 sub_pf(pm_mask),
        "trending_pf":           sub_pf(trend_mask),
        "ranging_pf":            sub_pf(range_mask),
        "valid":                 True
    })
    return base

# ─────────────────────────────────────────────────────────────────────────────
# ROBUSTNESS SCORE
# ─────────────────────────────────────────────────────────────────────────────
def robustness_score(r):
    """
    Composite score that rewards:
    - High Profit Factor (but not at the expense of trade count)
    - High Win Rate
    - Low Max Drawdown (relative to net profit)
    - High Expectancy
    - Consistency across sessions and regimes
    Penalises:
    - Low trade count
    - Large losing streaks
    - Huge drawdown relative to profit
    """
    if not r.get("valid", False) or r["trades"] < MIN_TRADES:
        return 0.0

    pf   = min(r["profit_factor"], 5.0)   # cap at 5 to avoid outlier domination
    wr   = r["win_rate"] / 100
    exp  = max(r["expectancy"], -1.0)
    dd   = abs(r["max_drawdown"])
    pnl  = max(r["net_pnl"], 1.0)
    tc   = r["trades"]
    streak = r["largest_losing_streak"]

    # Drawdown ratio (lower is better)
    dd_ratio = dd / pnl if pnl > 0 else 10.0

    # Session consistency: reward if all three sessions are profitable
    sessions_ok = sum([
        r["am_pf"]  > 1.0,
        r["mid_pf"] > 1.0,
        r["pm_pf"]  > 1.0
    ]) / 3.0

    # Regime consistency
    regimes_ok = sum([
        r["trending_pf"] > 1.0,
        r["ranging_pf"]  > 1.0
    ]) / 2.0

    # Long/short balance
    ls_balance = 1.0 - abs(r["long_pf"] - r["short_pf"]) / max(r["long_pf"] + r["short_pf"], 0.01)

    score = (
        pf * 2.0 +
        wr * 3.0 +
        exp * 2.0 -
        dd_ratio * 1.5 -
        (streak / 20.0) +
        sessions_ok * 1.5 +
        regimes_ok  * 1.0 +
        ls_balance  * 0.5 +
        min(tc / 500, 1.0) * 0.5   # reward for having enough trades
    )
    return round(score, 4)

# ─────────────────────────────────────────────────────────────────────────────
# HYPOTHESIS REPORTER
# ─────────────────────────────────────────────────────────────────────────────
def hypothesis_report(hypothesis, baseline, test, label=""):
    """
    Prints a structured Hypothesis → Result → Evidence → Decision block.
    """
    if not baseline.get("valid") or not test.get("valid"):
        print(f"\n  ⚠  Insufficient trades to evaluate: '{hypothesis}'")
        print(f"     Baseline trades: {baseline.get('trades',0)} | Test trades: {test.get('trades',0)}")
        return "INCONCLUSIVE"

    pf_delta   = test["profit_factor"]  - baseline["profit_factor"]
    wr_delta   = test["win_rate"]       - baseline["win_rate"]
    dd_delta   = test["max_drawdown"]   - baseline["max_drawdown"]   # negative = worse
    pnl_delta  = test["net_pnl"]        - baseline["net_pnl"]
    exp_delta  = test["expectancy"]     - baseline["expectancy"]
    trade_delta= test["trades"]         - baseline["trades"]
    rs_delta   = robustness_score(test) - robustness_score(baseline)

    # Decision: TRUE if robustness score improved AND PF improved
    result = "TRUE" if (rs_delta > 0 and pf_delta >= 0) else "FALSE"
    decision = "Accept rule." if result == "TRUE" else "Reject rule."

    print(f"\n{'─'*60}")
    print(f"  Hypothesis:  {hypothesis}")
    print(f"  Result:      {result}")
    print(f"  Evidence:")
    print(f"    Profit Factor:   {baseline['profit_factor']:.3f} → {test['profit_factor']:.3f}  ({pf_delta:+.3f})")
    print(f"    Win Rate:        {baseline['win_rate']:.1f}% → {test['win_rate']:.1f}%  ({wr_delta:+.1f}%)")
    print(f"    Net PnL:         ${baseline['net_pnl']:,.0f} → ${test['net_pnl']:,.0f}  ({pnl_delta:+,.0f})")
    print(f"    Max Drawdown:    ${baseline['max_drawdown']:,.0f} → ${test['max_drawdown']:,.0f}  ({dd_delta:+,.0f})")
    print(f"    Expectancy (R):  {baseline['expectancy']:.3f} → {test['expectancy']:.3f}  ({exp_delta:+.3f})")
    print(f"    Trades:          {baseline['trades']} → {test['trades']}  ({trade_delta:+d})")
    print(f"    Robustness Δ:    {rs_delta:+.4f}")
    print(f"  Decision:    {decision}")
    if label:
        print(f"  Label:       {label}")
    print(f"{'─'*60}")
    return result

# ─────────────────────────────────────────────────────────────────────────────
# COMPONENT ISOLATION TESTS
# ─────────────────────────────────────────────────────────────────────────────
def run_component_tests(df):
    print("\n" + "="*60)
    print("COMPONENT ISOLATION TESTS")
    print("="*60)

    results = {}

    # ── BASELINE ──
    print("\n[1/7] Baseline: trend filter only (no pullback, no structure, no quality)")
    baseline_p = {
        "use_structure": False, "use_two_leg": False,
        "min_close_ratio": 0.0, "min_body_atr": 0.0,
        "max_ema_dist": 99.0, "rr_ratio": 2.0, "stop_atr_mult": 1.0,
        "max_bars_since_bos": 9999, "label": "Baseline"
    }
    baseline = backtest(df, baseline_p)
    results["baseline"] = baseline
    print(f"  PF={baseline['profit_factor']:.3f} | WR={baseline['win_rate']:.1f}% | "
          f"Trades={baseline['trades']} | PnL=${baseline['net_pnl']:,.0f} | "
          f"DD=${baseline['max_drawdown']:,.0f} | Exp={baseline['expectancy']:.3f}")

    # ── TEST: Structure filter ──
    print("\n[2/7] Test: + Structure filter (BOS required within 50 bars)")
    struct_p = {**baseline_p, "use_structure": True, "max_bars_since_bos": 50, "label": "+Structure"}
    struct_r = backtest(df, struct_p)
    results["structure"] = struct_r
    hypothesis_report(
        "Requiring a recent BOS improves trade quality.",
        baseline, struct_r
    )

    # ── TEST: Two-leg pullback ──
    print("\n[3/7] Test: + Two-leg pullback (H2/L2 only)")
    twoleg_p = {**struct_p, "use_two_leg": True, "label": "+TwoLeg"}
    twoleg_r = backtest(df, twoleg_p)
    results["two_leg"] = twoleg_r
    hypothesis_report(
        "Two-legged pullbacks (H2/L2) outperform single-leg entries (H1/L1).",
        struct_r, twoleg_r
    )

    # ── TEST: Signal bar quality ──
    print("\n[4/7] Test: + Signal bar quality (close_ratio >= 0.65, body >= 0.1 ATR)")
    quality_p = {**twoleg_p, "min_close_ratio": 0.65, "min_body_atr": 0.10, "label": "+Quality"}
    quality_r = backtest(df, quality_p)
    results["quality"] = quality_r
    hypothesis_report(
        "Requiring a strong signal bar (close in top 35% of range) improves expectancy.",
        twoleg_r, quality_r
    )

    # ── TEST: Location filter (EMA proximity) ──
    print("\n[5/7] Test: + Location filter (EMA distance <= 1.5 ATR)")
    location_p = {**quality_p, "max_ema_dist": 1.5, "label": "+Location"}
    location_r = backtest(df, location_p)
    results["location"] = location_r
    hypothesis_report(
        "Entries within 1.5 ATR of the slow EMA have higher expectancy.",
        quality_r, location_r
    )

    # ── TEST: Higher RR (2.5:1) ──
    print("\n[6/7] Test: Higher RR ratio (2.5:1 vs 2.0:1)")
    rr_p = {**location_p, "rr_ratio": 2.5, "label": "+HigherRR"}
    rr_r = backtest(df, rr_p)
    results["higher_rr"] = rr_r
    hypothesis_report(
        "Increasing the reward:risk ratio from 2.0 to 2.5 improves overall robustness.",
        location_r, rr_r
    )

    # ── TEST: Tighter stop (0.75 ATR) ──
    print("\n[7/7] Test: Tighter stop (0.75 ATR vs 1.0 ATR)")
    stop_p = {**location_p, "stop_atr_mult": 0.75, "label": "+TighterStop"}
    stop_r = backtest(df, stop_p)
    results["tighter_stop"] = stop_r
    hypothesis_report(
        "A tighter stop (0.75 ATR) improves expectancy by reducing loss size.",
        location_r, stop_r
    )

    return results

# ─────────────────────────────────────────────────────────────────────────────
# PARAMETER SWEEP (vectorised signal generation, fast loop)
# ─────────────────────────────────────────────────────────────────────────────
def run_parameter_sweep(df):
    print("\n" + "="*60)
    print("PARAMETER SWEEP")
    print("="*60)

    param_grid = {
        "use_structure":      [True, False],
        "use_two_leg":        [True, False],
        "min_close_ratio":    [0.55, 0.65, 0.72],
        "min_body_atr":       [0.05, 0.12],
        "max_ema_dist":       [1.0, 1.5, 2.5, 99.0],
        "rr_ratio":           [1.5, 2.0, 2.5, 3.0],
        "stop_atr_mult":      [0.75, 1.0, 1.25],
        "max_bars_since_bos": [20, 50, 100],
    }

    keys   = list(param_grid.keys())
    combos = list(product(*param_grid.values()))
    total  = len(combos)
    print(f"  Running {total:,} combinations (min {MIN_TRADES} trades to be valid)...")

    results = []
    for idx, combo in enumerate(combos):
        p = dict(zip(keys, combo))
        p["label"] = f"sweep_{idx}"
        r = backtest(df, p)
        r["robustness_score"] = robustness_score(r)
        results.append(r)
        if (idx + 1) % 200 == 0:
            valid = [x for x in results if x.get("valid")]
            if valid:
                best = max(valid, key=lambda x: x["robustness_score"])
                print(f"  [{idx+1:>4}/{total}] Best robustness: {best['robustness_score']:.3f} | "
                      f"PF={best['profit_factor']:.3f} | WR={best['win_rate']:.1f}% | "
                      f"Trades={best['trades']} | DD=${best['max_drawdown']:,.0f}")

    return results

# ─────────────────────────────────────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────────────────────────────────────
def main():
    print("=" * 60)
    print("Atlas Strategy Research Engine v2.0")
    print("Atlas does not seek confirmation. Atlas seeks evidence.")
    print("=" * 60)

    df = load_data()

    print("\nComputing features...")
    df = add_indicators(df, fast_ema=9, slow_ema=21, atr_len=14)
    df = add_structure(df, pivot_len=5)
    df = add_pullback_legs(df)
    print(f"  Features ready. Shape: {df.shape}")

    # ── COMPONENT TESTS ──
    comp_results = run_component_tests(df)
    comp_df = pd.DataFrame(list(comp_results.values()))
    comp_path = OUTPUT_DIR / "component_isolation_results.csv"
    comp_df.to_csv(comp_path, index=False)
    print(f"\n  Component results saved: {comp_path}")

    # ── PARAMETER SWEEP ──
    sweep_results = run_parameter_sweep(df)
    sweep_df = pd.DataFrame(sweep_results)
    sweep_df["robustness_score"] = sweep_df.apply(robustness_score, axis=1)
    sweep_path = OUTPUT_DIR / "parameter_sweep_results.csv"
    sweep_df.to_csv(sweep_path, index=False)
    print(f"\n  Sweep results saved: {sweep_path}")

    # ── TOP RESULTS ──
    valid_df = sweep_df[sweep_df["valid"] == True].copy()
    top = valid_df.sort_values("robustness_score", ascending=False).head(20)
    top_path = OUTPUT_DIR / "top_20_robust_results.csv"
    top.to_csv(top_path, index=False)

    print("\n" + "="*60)
    print(f"TOP 10 RESULTS BY ROBUSTNESS SCORE (min {MIN_TRADES} trades)")
    print("="*60)
    display_cols = [
        "robustness_score", "profit_factor", "win_rate", "trades",
        "net_pnl", "max_drawdown", "expectancy", "largest_losing_streak",
        "use_two_leg", "min_close_ratio", "max_ema_dist", "rr_ratio", "stop_atr_mult"
    ]
    print(top[display_cols].head(10).to_string(index=False))

    # ── BEST RESULT FULL DETAIL ──
    if len(top) > 0:
        best = top.iloc[0]
        print(f"\n{'='*60}")
        print("BEST RESULT — FULL DETAIL")
        print(f"{'='*60}")
        full_cols = [
            "robustness_score", "profit_factor", "win_rate", "trades",
            "net_pnl", "avg_trade", "max_drawdown", "expectancy",
            "avg_winner", "avg_loser", "largest_losing_streak", "avg_bars_held",
            "long_pf", "short_pf", "am_pf", "mid_pf", "pm_pf",
            "trending_pf", "ranging_pf",
            "use_structure", "use_two_leg", "min_close_ratio", "min_body_atr",
            "max_ema_dist", "rr_ratio", "stop_atr_mult", "max_bars_since_bos"
        ]
        for col in full_cols:
            if col in best:
                print(f"  {col:30s}: {best[col]}")

    print(f"\nAll results saved to: {OUTPUT_DIR}")
    return sweep_df, comp_df

if __name__ == "__main__":
    sweep_df, comp_df = main()
