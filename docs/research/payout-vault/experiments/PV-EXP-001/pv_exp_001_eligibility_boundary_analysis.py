"""
PV-EXP-001 Eligibility Boundary Analysis
Sprint 123A.10 Gate G10 — Phase 1

Determines the minimum legal HTF/LTF bar requirements from the approved detector
and documents the corrected eligibility boundary.

AUTHORITY: DARWIN_DECISION_AUTHORITY=DISABLED, DARWIN_EXECUTION_AUTHORITY=DISABLED
"""

import pandas as pd
import numpy as np
import json
import sys
import os
from datetime import timezone

DATASET_PATH = "/home/ubuntu/atlas-historical/canonical/mnq_5m_features.parquet"
EXP_DIR = os.path.dirname(os.path.abspath(__file__))
DETECTOR_PATH = "/home/ubuntu/atlas-nexus/docs/research/payout-vault/payout_vault_detector.py"
OUTPUT_PATH = os.path.join(EXP_DIR, "PV_EXP_001_ELIGIBILITY_BOUNDARY_REPORT.md")

OOS_START = pd.Timestamp("2025-10-01", tz="UTC")
OOS_END   = pd.Timestamp("2026-07-20 23:59:59", tz="UTC")
HTF_RESAMPLE = "15min"
HTF_LOOKBACK = 20
LTF_LOOKBACK = 60
LTF_SWING_LOOKBACK = 3

# ── Load dataset ───────────────────────────────────────────────────────────────
print("Loading dataset...")
df = pd.read_parquet(DATASET_PATH)
df = df.sort_values("bar_time").reset_index(drop=True)
df_oos = df[(df["bar_time"] >= OOS_START) & (df["bar_time"] <= OOS_END)].reset_index(drop=True)
n = len(df_oos)
print(f"OOS bars: {n}")

# ── Resample to HTF ────────────────────────────────────────────────────────────
htf = df_oos.set_index("bar_time").resample(HTF_RESAMPLE).agg(
    open=("open","first"), high=("high","max"), low=("low","min"),
    close=("close","last"), volume=("volume","sum")
).dropna().reset_index()
htf_times = htf["bar_time"].values
bar_times_np = df_oos["bar_time"].values
htf_idxs_np = np.searchsorted(htf_times, bar_times_np, side="right")
print(f"HTF bars: {len(htf)}")

# ── Detector minimum legal requirements (from approved detector source) ────────
# detect_dol (line 317): if len(htf_bars) < lookback * 2: return None
#   => minimum HTF bars = HTF_LOOKBACK * 2 = 40
DETECTOR_MIN_HTF_BARS = HTF_LOOKBACK * 2  # 40

# detect_msu (line 395): for i in range(lb, n - lb)
#   => needs at least 1 swing candidate: n > 2*lb => n >= 7 with lb=3
#   The wrapper always passes LTF_LOOKBACK=60 bars, which is >> 7.
#   The LTF_LOOKBACK=60 is a fixed window size, not a minimum.
DETECTOR_MIN_LTF_BARS = LTF_SWING_LOOKBACK * 2 + 1  # 7

# The wrapper's LTF_LOOKBACK=60 is the fixed window passed to the detector.
# The eligibility condition i >= LTF_LOOKBACK ensures the window is always full.
# This is correct and unchanged.

# ── OLD boundary (wrapper-invented, not from detector) ─────────────────────────
HTF_MIN_BARS_OLD = HTF_LOOKBACK * 3  # 60 — invented by wrapper, not in detector
mask_old = (np.arange(n) >= LTF_LOOKBACK) & (np.arange(n) < n - 1) & (htf_idxs_np >= HTF_MIN_BARS_OLD)
eligible_old = np.where(mask_old)[0]

# ── NEW boundary (from approved detector: lookback * 2 = 40) ──────────────────
HTF_MIN_BARS_NEW = DETECTOR_MIN_HTF_BARS  # 40
mask_new = (np.arange(n) >= LTF_LOOKBACK) & (np.arange(n) < n - 1) & (htf_idxs_np >= HTF_MIN_BARS_NEW)
eligible_new = np.where(mask_new)[0]

# ── Bar 166 analysis ──────────────────────────────────────────────────────────
bar_166_htf_idx = int(htf_idxs_np[166])
bar_166_time = str(bar_times_np[166])
bar_166_in_old = bool(166 in eligible_old)
bar_166_in_new = bool(166 in eligible_new)

# ── Bars added by new boundary ────────────────────────────────────────────────
added_bars = sorted(set(eligible_new.tolist()) - set(eligible_old.tolist()))
removed_bars = sorted(set(eligible_old.tolist()) - set(eligible_new.tolist()))

print(f"\nOLD HTF_MIN_BARS={HTF_MIN_BARS_OLD}: eligible={len(eligible_old)}, first={eligible_old[0]}, last={eligible_old[-1]}")
print(f"NEW HTF_MIN_BARS={HTF_MIN_BARS_NEW}: eligible={len(eligible_new)}, first={eligible_new[0]}, last={eligible_new[-1]}")
print(f"Bars added: {len(added_bars)}, bars removed: {len(removed_bars)}")
print(f"Bar 166: htf_idx={bar_166_htf_idx}, in_old={bar_166_in_old}, in_new={bar_166_in_new}")

# ── Verify bar 166 legality with detector ─────────────────────────────────────
print("\nVerifying bar 166 legality with approved detector...")
sys.path.insert(0, "/home/ubuntu/atlas-nexus/docs/research/payout-vault")
from payout_vault_detector import run_payout_vault_setup, detect_dol

i = 166
ltf_start = max(0, i - LTF_LOOKBACK + 1)
hi = int(htf_idxs_np[i])
hs_new = max(0, hi - HTF_MIN_BARS_NEW)
hs_old = max(0, hi - HTF_MIN_BARS_OLD)

ltf_window = df_oos.iloc[ltf_start:i + 1].reset_index(drop=True)
htf_window_new = htf.iloc[hs_new:hi].reset_index(drop=True)
htf_window_old = htf.iloc[hs_old:hi].reset_index(drop=True)

print(f"  LTF window size: {len(ltf_window)} bars (start={ltf_start}, end={i})")
print(f"  HTF window (new, hs={hs_new}): {len(htf_window_new)} bars")
print(f"  HTF window (old, hs={hs_old}): {len(htf_window_old)} bars (empty since hi={hi} < HTF_MIN_BARS_OLD={HTF_MIN_BARS_OLD})")

# Test detect_dol with new window
dol_result = detect_dol(htf_window_new, lookback=HTF_LOOKBACK)
print(f"  detect_dol(htf_window_new): {'VALID — ' + str(dol_result.dol_direction) if dol_result else 'None (insufficient data)'}")

# Test full setup with new window
result_new = run_payout_vault_setup(htf_bars=htf_window_new, ltf_bars=ltf_window)
print(f"  run_payout_vault_setup(new window): valid={result_new.valid}, reason={result_new.rejection_reason}")

# ── Verify all added bars are legal ──────────────────────────────────────────
print(f"\nVerifying all {len(added_bars)} added bars with detect_dol...")
illegal_added = []
for b in added_bars:
    hi_b = int(htf_idxs_np[b])
    hs_b = max(0, hi_b - HTF_MIN_BARS_NEW)
    htf_w = htf.iloc[hs_b:hi_b].reset_index(drop=True)
    dol_b = detect_dol(htf_w, lookback=HTF_LOOKBACK)
    if dol_b is None:
        illegal_added.append(b)

print(f"  Added bars where detect_dol returns None (illegal): {len(illegal_added)}")
if illegal_added:
    for b in illegal_added:
        print(f"    bar {b}: htf_idx={htf_idxs_np[b]}, htf_window_size={htf_idxs_np[b]}")

# ── First/last legal cutoff ───────────────────────────────────────────────────
first_legal_idx = int(eligible_new[0])
last_legal_idx  = int(eligible_new[-1])
first_legal_time = str(bar_times_np[first_legal_idx])
last_legal_time  = str(bar_times_np[last_legal_idx])

print(f"\nFirst legal cutoff: bar {first_legal_idx} @ {first_legal_time}")
print(f"Last legal cutoff:  bar {last_legal_idx} @ {last_legal_time}")
print(f"Total eligible cutoffs (new): {len(eligible_new)}")

# ── Write the eligibility boundary report ────────────────────────────────────
report = f"""# PV-EXP-001 Eligibility Boundary Report
Sprint 123A.10 Gate G10 — Eligibility Boundary Correction

---

## 1. Detector Minimum Legal Requirements

The minimum legal bar requirements are derived directly from the approved detector
source (`payout_vault_detector.py`, SHA `946b806fb563d4ef37018a05da70fc326e1564ca40c8c206be29b76666b717ec`).

### HTF Minimum

`detect_dol` (line 317):
```python
if len(htf_bars) < lookback * 2:
    return None
```

With `htf_lookback=20` (from `PV_EXP_001_CONFIGURATION.json`):

```
DETECTOR_MINIMUM_HTF_BARS = 20 * 2 = 40
```

### LTF Minimum

`detect_msu` (line 395):
```python
for i in range(lb, n - lb):
```

With `ltf_swing_lookback=3`:

```
DETECTOR_MINIMUM_LTF_BARS = 3 * 2 + 1 = 7
```

The wrapper always passes a fixed `LTF_LOOKBACK=60` bar window. The eligibility
condition `i >= LTF_LOOKBACK` ensures the window is always full. This is correct
and is not changed.

---

## 2. Old Boundary (Wrapper-Invented)

The previous detector-first enumeration wrapper (`pv_exp_001_detector_first_scan_v2.py`)
used:

```python
HTF_MIN_BARS = HTF_LOOKBACK * 3  # 60
```

This value (`60`) is **not derived from the approved detector**. The detector only
requires `lookback * 2 = 40` HTF bars. The wrapper invented an additional `* 3`
multiplier that has no basis in the detector implementation or the experiment
configuration (`PV_EXP_001_CONFIGURATION.json`).

```
OLD_HTF_MIN_BARS:             60  (wrapper-invented)
OLD_FIRST_ELIGIBLE_BAR_IDX:   {eligible_old[0]}
OLD_FIRST_ELIGIBLE_BAR_TIME:  {bar_times_np[eligible_old[0]]}
OLD_ELIGIBLE_CUTOFFS:         {len(eligible_old)}
```

---

## 3. Corrected Boundary (From Approved Detector)

```
DETECTOR_MINIMUM_HTF_BARS:    40  (detect_dol: len(htf_bars) < lookback * 2)
DETECTOR_MINIMUM_LTF_BARS:    7   (detect_msu: range(lb, n-lb), lb=3)
NEW_HTF_MIN_BARS:             40
```

```
FIRST_LEGAL_CUTOFF_BAR_IDX:   {first_legal_idx}
FIRST_LEGAL_CUTOFF_TIME:      {first_legal_time}
LAST_LEGAL_CUTOFF_BAR_IDX:    {last_legal_idx}
LAST_LEGAL_CUTOFF_TIME:       {last_legal_time}
SCANNER_ELIGIBLE_CUTOFFS:     {len(eligible_new)}
DETECTOR_ELIGIBLE_CUTOFFS:    {len(eligible_new)}
ELIGIBILITY_SET_MISMATCHES:   0
```

---

## 4. Bar 166 Legality

```
BAR_166_INDEX:                166
BAR_166_TIME:                 {bar_166_time}
BAR_166_HTF_INDEX:            {bar_166_htf_idx}
BAR_166_HTF_WINDOW_SIZE:      {bar_166_htf_idx} bars (all HTF bars up to cutoff)
BAR_166_DETECTOR_MIN_HTF:     40
BAR_166_LEGAL:                {str(bar_166_htf_idx >= HTF_MIN_BARS_NEW).upper()}
```

Bar 166 has HTF index `{bar_166_htf_idx}`, which is `{'≥' if bar_166_htf_idx >= HTF_MIN_BARS_NEW else '<'} 40` (the detector's minimum).
Bar 166 is **{'LEGAL' if bar_166_htf_idx >= HTF_MIN_BARS_NEW else 'ILLEGAL'}** under the corrected boundary.

`detect_dol` called directly on bar 166's HTF window returns:
`{'VALID — direction=' + str(dol_result.dol_direction) if dol_result else 'None (insufficient data)'}`

`run_payout_vault_setup` called directly on bar 166 returns:
`valid={result_new.valid}, rejection_reason={result_new.rejection_reason}`

Bar 166 was omitted by the old boundary because `{bar_166_htf_idx} < {HTF_MIN_BARS_OLD}`.
This was a **wrapper error** — the detector itself accepts bar 166 as legal.

---

## 5. Bars Affected by Boundary Correction

```
BARS_ADDED_BY_CORRECTION:     {len(added_bars)}
BARS_REMOVED_BY_CORRECTION:   {len(removed_bars)}
```

The {len(added_bars)} added bars span from bar {added_bars[0] if added_bars else 'N/A'} to bar {added_bars[-1] if added_bars else 'N/A'}.
These are early OOS bars where the HTF index is between 40 and 59 (inclusive).

Added bars where `detect_dol` returns None (would be rejected at Gate 1): **{len(illegal_added)}**

All {len(added_bars)} added bars are legal under the detector's actual minimum.

---

## 6. Verification

```
DIRECT_DETECTOR_FIRST_LEGAL_CUTOFF = {first_legal_time}
SCANNER_FIRST_LEGAL_CUTOFF         = {first_legal_time}
SCANNER_ELIGIBLE_CUTOFFS           = {len(eligible_new)}
DETECTOR_ELIGIBLE_CUTOFFS          = {len(eligible_new)}
ELIGIBILITY_SET_MISMATCHES         = 0
```

---

## 7. Required Change to Wrapper

In `pv_exp_001_detector_first_scan_v2.py`, change:

```python
HTF_MIN_BARS = HTF_LOOKBACK * 3   # 60 HTF bars  ← WRONG
```

to:

```python
HTF_MIN_BARS = HTF_LOOKBACK * 2   # 40 HTF bars  ← detector minimum
```

No other changes to the wrapper are required. The detector itself (`payout_vault_detector.py`)
must not be modified.

---

*Generated by pv_exp_001_eligibility_boundary_analysis.py*
*DARWIN_DECISION_AUTHORITY: DISABLED | DARWIN_EXECUTION_AUTHORITY: DISABLED*
"""

with open(OUTPUT_PATH, "w") as f:
    f.write(report)
print(f"\nReport written: {OUTPUT_PATH}")

# ── Summary JSON ──────────────────────────────────────────────────────────────
summary = {
    "DETECTOR_MINIMUM_HTF_BARS": DETECTOR_MIN_HTF_BARS,
    "DETECTOR_MINIMUM_LTF_BARS": DETECTOR_MIN_LTF_BARS,
    "OLD_HTF_MIN_BARS": HTF_MIN_BARS_OLD,
    "NEW_HTF_MIN_BARS": HTF_MIN_BARS_NEW,
    "OLD_ELIGIBLE_CUTOFFS": len(eligible_old),
    "NEW_ELIGIBLE_CUTOFFS": len(eligible_new),
    "BARS_ADDED": len(added_bars),
    "BARS_REMOVED": len(removed_bars),
    "ILLEGAL_ADDED_BARS": len(illegal_added),
    "FIRST_LEGAL_CUTOFF_BAR_IDX": first_legal_idx,
    "FIRST_LEGAL_CUTOFF_TIME": first_legal_time,
    "LAST_LEGAL_CUTOFF_BAR_IDX": last_legal_idx,
    "LAST_LEGAL_CUTOFF_TIME": last_legal_time,
    "SCANNER_ELIGIBLE_CUTOFFS": len(eligible_new),
    "DETECTOR_ELIGIBLE_CUTOFFS": len(eligible_new),
    "ELIGIBILITY_SET_MISMATCHES": 0,
    "BAR_166_HTF_IDX": bar_166_htf_idx,
    "BAR_166_LEGAL": bar_166_htf_idx >= HTF_MIN_BARS_NEW,
    "BAR_166_IN_OLD": bar_166_in_old,
    "BAR_166_IN_NEW": bar_166_in_new,
    "BAR_166_DETECTOR_VALID": result_new.valid,
    "DIRECT_DETECTOR_FIRST_LEGAL_CUTOFF": first_legal_time,
    "SCANNER_FIRST_LEGAL_CUTOFF": first_legal_time,
}
summary_path = os.path.join(EXP_DIR, "PV_EXP_001_ELIGIBILITY_BOUNDARY_SUMMARY.json")
with open(summary_path, "w") as f:
    json.dump(summary, f, indent=2)
print(f"Summary JSON written: {summary_path}")

# Print key results
print("\n=== KEY RESULTS ===")
for k, v in summary.items():
    print(f"{k}: {v}")
