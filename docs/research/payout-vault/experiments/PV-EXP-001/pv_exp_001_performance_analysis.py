"""
PV-EXP-001 Performance Analysis
Analyses the 172 canonical qualifying events using forward bar data.

Entry:  _fwd_open (next bar open after CSD confirmation — actual fill)
Stop:   DOL level (the liquidity level being defended)
Target: 1R, 2R, 3R, 4R from entry

IMPORTANT: This is a FREQUENCY study. Profitability is NOT a G10 gate.
This analysis is provided for informational context only.
Stop-loss placement at the DOL level is a simplification — real execution
would use a buffer (4 ticks per PV_EXP_001_CONFIGURATION.json).
"""

import json
import pandas as pd
import numpy as np
from pathlib import Path
from datetime import datetime, timezone

LEDGER_PATH = Path("/home/ubuntu/atlas-nexus/docs/research/payout-vault/experiments/PV-EXP-001/PV_EXP_001_EVENT_LEDGER.json")
DATASET_PATH = Path("/home/ubuntu/atlas-historical/canonical/mnq_5m_features.parquet")
EXP_DIR = LEDGER_PATH.parent

# Load events
with open(LEDGER_PATH) as f:
    data = json.load(f)
events = data["events"]
print(f"Total events: {len(events)}")

# Load dataset
df_full = pd.read_parquet(DATASET_PATH)
OOS_START = pd.Timestamp("2025-10-01", tz="UTC")
df = df_full[df_full["bar_time"] >= OOS_START].reset_index(drop=True)
n_oos = len(df)
print(f"OOS bars: {n_oos}")

# ============================================================
# BUILD TRADE RECORDS
# ============================================================

STOP_BUFFER_TICKS = 4
TICK_SIZE = 0.25
MAX_FORWARD_BARS = 200  # ~16.7 hours

records = []

for ev in events:
    bar_idx = ev["bar_index"]
    direction = ev["direction"]
    entry_price = ev["_fwd_open"]
    dol_level = ev["dol_level"]

    # Stop with 4-tick buffer beyond DOL
    if direction == "bullish":
        stop_price = dol_level - STOP_BUFFER_TICKS * TICK_SIZE
        risk_pts = entry_price - stop_price
    else:
        stop_price = dol_level + STOP_BUFFER_TICKS * TICK_SIZE
        risk_pts = stop_price - entry_price

    if risk_pts <= 0:
        records.append({
            "event_id": ev["event_id"],
            "bar_index": bar_idx,
            "direction": direction,
            "session": ev.get("session", "UNKNOWN"),
            "information_cutoff": ev["information_cutoff_timestamp"],
            "entry": entry_price,
            "stop": stop_price,
            "dol_level": dol_level,
            "risk_pts": risk_pts,
            "skip_reason": "ENTRY_THROUGH_STOP",
            "outcome_1r": None, "outcome_2r": None,
            "outcome_3r": None, "outcome_4r": None,
            "max_adverse_r": None, "max_favourable_r": None,
            "bars_to_1r": None, "bars_to_2r": None, "bars_to_3r": None,
        })
        continue

    t1r = entry_price + risk_pts if direction == "bullish" else entry_price - risk_pts
    t2r = entry_price + 2*risk_pts if direction == "bullish" else entry_price - 2*risk_pts
    t3r = entry_price + 3*risk_pts if direction == "bullish" else entry_price - 3*risk_pts
    t4r = entry_price + 4*risk_pts if direction == "bullish" else entry_price - 4*risk_pts

    entry_bar = bar_idx + 1
    end_bar = min(entry_bar + MAX_FORWARD_BARS, n_oos)

    hit_stop = False
    hit_1r = hit_2r = hit_3r = hit_4r = False
    bars_to_1r = bars_to_2r = bars_to_3r = None
    max_adverse = max_favourable = 0.0

    for fwd_i in range(entry_bar, end_bar):
        bar = df.iloc[fwd_i]
        h, l = bar["high"], bar["low"]
        elapsed = fwd_i - entry_bar + 1

        if direction == "bullish":
            max_adverse = max(max_adverse, entry_price - l)
            max_favourable = max(max_favourable, h - entry_price)
            if l <= stop_price:
                hit_stop = True; break
            if h >= t1r and not hit_1r:
                hit_1r = True; bars_to_1r = elapsed
            if h >= t2r and not hit_2r:
                hit_2r = True; bars_to_2r = elapsed
            if h >= t3r and not hit_3r:
                hit_3r = True; bars_to_3r = elapsed
            if h >= t4r and not hit_4r:
                hit_4r = True; break
        else:
            max_adverse = max(max_adverse, h - entry_price)
            max_favourable = max(max_favourable, entry_price - l)
            if h >= stop_price:
                hit_stop = True; break
            if l <= t1r and not hit_1r:
                hit_1r = True; bars_to_1r = elapsed
            if l <= t2r and not hit_2r:
                hit_2r = True; bars_to_2r = elapsed
            if l <= t3r and not hit_3r:
                hit_3r = True; bars_to_3r = elapsed
            if l <= t4r and not hit_4r:
                hit_4r = True; break

    def outcome(hit_tgt, hit_stop, r_mult):
        if hit_stop: return -1.0
        if hit_tgt: return float(r_mult)
        return None  # unresolved

    records.append({
        "event_id": ev["event_id"],
        "bar_index": bar_idx,
        "direction": direction,
        "session": ev.get("session", "UNKNOWN"),
        "information_cutoff": ev["information_cutoff_timestamp"],
        "entry": entry_price,
        "stop": stop_price,
        "dol_level": dol_level,
        "risk_pts": risk_pts,
        "skip_reason": None,
        "outcome_1r": outcome(hit_1r, hit_stop, 1),
        "outcome_2r": outcome(hit_2r, hit_stop, 2),
        "outcome_3r": outcome(hit_3r, hit_stop, 3),
        "outcome_4r": outcome(hit_4r, hit_stop, 4),
        "max_adverse_r": round(max_adverse / risk_pts, 2) if risk_pts > 0 else None,
        "max_favourable_r": round(max_favourable / risk_pts, 2) if risk_pts > 0 else None,
        "bars_to_1r": bars_to_1r,
        "bars_to_2r": bars_to_2r,
        "bars_to_3r": bars_to_3r,
    })

df_t = pd.DataFrame(records)
valid = df_t[df_t["skip_reason"].isna()].copy()
skipped = df_t[df_t["skip_reason"].notna()]

# ============================================================
# SUMMARY STATS
# ============================================================

def rr_stats(col, label):
    res = valid[valid[col].notna()]
    if len(res) == 0:
        print(f"\n{label}: no resolved trades")
        return
    wins = res[res[col] > 0]
    losses = res[res[col] < 0]
    win_rate = len(wins) / len(res)
    total_r = res[col].sum()
    avg_r = res[col].mean()
    expectancy = win_rate * abs(res[res[col]>0][col].mean()) - (1-win_rate) * 1.0
    unresolved = len(valid) - len(res)
    print(f"\n{label}:")
    print(f"  Resolved: {len(res)} / {len(valid)}  ({100*len(res)/len(valid):.1f}%)")
    print(f"  Win rate: {len(wins)}/{len(res)} = {100*win_rate:.1f}%")
    print(f"  Total R: {total_r:+.1f}R")
    print(f"  Avg R per trade: {avg_r:+.2f}R")
    print(f"  Expectancy: {expectancy:+.2f}R per trade")
    print(f"  Unresolved (200 bars): {unresolved}")

print(f"\n{'='*50}")
print(f"PV-EXP-001 PERFORMANCE ANALYSIS")
print(f"{'='*50}")
print(f"Total events:          {len(df_t)}")
print(f"Valid trades:          {len(valid)}")
print(f"Skipped:               {len(skipped)}")
print(f"Bullish:               {len(valid[valid['direction']=='bullish'])}")
print(f"Bearish:               {len(valid[valid['direction']=='bearish'])}")
print(f"Avg risk (pts):        {valid['risk_pts'].mean():.1f}")
print(f"Median risk (pts):     {valid['risk_pts'].median():.1f}")
print(f"Min risk (pts):        {valid['risk_pts'].min():.1f}")
print(f"Max risk (pts):        {valid['risk_pts'].max():.1f}")

rr_stats("outcome_1r", "1R TARGET (1:1)")
rr_stats("outcome_2r", "2R TARGET (1:2)")
rr_stats("outcome_3r", "3R TARGET (1:3)")
rr_stats("outcome_4r", "4R TARGET (1:4)")

# Session breakdown
print(f"\n=== BY SESSION (3R target) ===")
for sess in sorted(valid["session"].unique()):
    s = valid[valid["session"] == sess]
    res = s[s["outcome_3r"].notna()]
    if len(res) == 0:
        print(f"  {sess}: {len(s)} events, 0 resolved")
        continue
    wins = res[res["outcome_3r"] > 0]
    print(f"  {sess}: {len(s)} events, {len(res)} resolved, {len(wins)}/{len(res)} wins ({100*len(wins)/len(res):.0f}%)")

# Direction breakdown
print(f"\n=== BY DIRECTION (3R target) ===")
for d in ["bullish", "bearish"]:
    s = valid[valid["direction"] == d]
    res = s[s["outcome_3r"].notna()]
    if len(res) == 0:
        print(f"  {d}: {len(s)} events, 0 resolved")
        continue
    wins = res[res["outcome_3r"] > 0]
    print(f"  {d}: {len(s)} events, {len(res)} resolved, {len(wins)}/{len(res)} wins ({100*len(wins)/len(res):.0f}%)")

# Time to target
print(f"\n=== TIME TO TARGET (bars, 5-min each) ===")
for col, label in [("bars_to_1r","1R"), ("bars_to_2r","2R"), ("bars_to_3r","3R")]:
    vals = valid[valid[col].notna()][col]
    if len(vals) > 0:
        print(f"  {label}: median={vals.median():.0f} bars ({vals.median()*5:.0f} min), mean={vals.mean():.0f} bars, max={vals.max():.0f} bars")

# Max adverse excursion
print(f"\n=== MAX ADVERSE EXCURSION (in R) ===")
mae = valid["max_adverse_r"].dropna()
print(f"  Mean MAE: {mae.mean():.2f}R")
print(f"  Median MAE: {mae.median():.2f}R")
print(f"  Trades with MAE > 0.5R: {(mae > 0.5).sum()} ({100*(mae > 0.5).mean():.0f}%)")
print(f"  Trades with MAE > 0.75R: {(mae > 0.75).sum()} ({100*(mae > 0.75).mean():.0f}%)")

# Save results
output = {
    "generated_utc": datetime.now(timezone.utc).isoformat(),
    "total_events": len(df_t),
    "valid_trades": len(valid),
    "skipped": len(skipped),
    "bullish": int(len(valid[valid["direction"]=="bullish"])),
    "bearish": int(len(valid[valid["direction"]=="bearish"])),
    "avg_risk_pts": float(valid["risk_pts"].mean()),
    "stop_buffer_ticks": STOP_BUFFER_TICKS,
    "max_forward_bars": MAX_FORWARD_BARS,
    "note": "FREQUENCY STUDY ONLY — profitability is not a G10 gate",
    "trades": df_t.to_dict(orient="records"),
}

out_path = EXP_DIR / "PV_EXP_001_PERFORMANCE_ANALYSIS.json"
with open(out_path, "w") as f:
    json.dump(output, f, indent=2, default=str)
print(f"\nSaved: {out_path}")
