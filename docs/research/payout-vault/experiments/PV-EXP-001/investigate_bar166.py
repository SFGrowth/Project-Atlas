"""Investigate bar 166 FP - why scanner finds it but detector doesn't."""
import sys
from pathlib import Path
import pandas as pd
import numpy as np

sys.path.insert(0, str(Path(__file__).parent.parent.parent))
from payout_vault_detector import run_payout_vault_setup

DATASET_PATH = Path("/home/ubuntu/atlas-historical/canonical/mnq_5m_features.parquet")
OOS_START = pd.Timestamp("2025-10-01", tz="UTC")
OOS_END   = pd.Timestamp("2026-07-20 23:59:59", tz="UTC")
HTF_LOOKBACK = 20
LTF_WINDOW = 60
CONFIG = {
    "htf_lookback": HTF_LOOKBACK, "ltf_swing_lookback": 3,
    "csd_window": 3, "sweep_variant": "sweep-wick",
    "stop_buffer_ticks": 4, "entry_type": 1,
    "smt_enabled": False, "smt_window_bars": 3, "tick_size": 0.25,
}

df = pd.read_parquet(DATASET_PATH)
oos = df[(df["bar_time"] >= OOS_START) & (df["bar_time"] <= OOS_END)].copy().reset_index(drop=True)
sub = oos.set_index("bar_time")
htf_full = sub[["open","high","low","close","volume"]].resample(
    "15min", closed="left", label="left"
).agg({"open":"first","high":"max","low":"min","close":"last","volume":"sum"}).dropna().reset_index()

bar_i = 166
cutoff = oos["bar_time"].iloc[bar_i]
print(f"Bar {bar_i}: {cutoff}")

htf_times_ns = htf_full["bar_time"].values.astype("int64")
cutoff_ns = np.int64(cutoff.value)
htf_end = int(np.searchsorted(htf_times_ns, cutoff_ns, side="right"))
htf_w = htf_full.iloc[max(0, htf_end - HTF_LOOKBACK * 3):htf_end].copy().reset_index(drop=True)
ltf_w = oos.iloc[max(0, bar_i - LTF_WINDOW + 1):bar_i + 1].copy().reset_index(drop=True)

print(f"HTF slice: {len(htf_w)} bars, LTF slice: {len(ltf_w)} bars")
result = run_payout_vault_setup(htf_bars=htf_w, ltf_bars=ltf_w, config=CONFIG)
print(f"Detector valid: {result.valid}")
print(f"Rejection reason: {result.rejection_reason}")
print(f"DOL: {result.dol}")
print(f"MSU direction: {result.msu.msu_direction if result.msu else None}")
print(f"Inducement price: {result.inducement_price}")
print(f"Sweep: {result.sweep}")
print(f"CSD: {result.csd}")
print(f"Entry type1 bar: {result.entry_type1_bar_index}")
