#!/usr/bin/env python3
"""
Sprint 123A.8 — Run 3 Deterministic Reproducibility Check (v2)
Uses the IDENTICAL engine as the original implementation script by importing
from it directly. This guarantees byte-for-byte identical trade ledger SHA.

DARWIN_DECISION_AUTHORITY=DISABLED
DARWIN_EXECUTION_AUTHORITY=DISABLED
"""
import sys
import os
import json
import hashlib
import importlib.util
from pathlib import Path
from datetime import datetime, timezone

# ── Required SHAs (from Runs 1 and 2) ────────────────────────────────────────
REQUIRED_LEDGER_SHA = "670c3f7e59d82b3069df1ebcefdb9221a219ad73783618e7b35eca7864072e22"
REQUIRED_CONTRACT_SHA = "cb5c58947d04d8d41c5164e2563cedbb816c969500cef003c611f2a078f042fd"
REQUIRED_DATASET_SHA = "c970675391b970956f38d419ef95ff3e116e61ab8874eca7df2ab4334e715623"
REQUIRED_SPLIT_SHA = "5115e7fdfbc28170a6f28d501d88e34bd9511399b944359cdec1f7ff486f391d"

ARTEFACTS_DIR = Path("/home/ubuntu/atlas-historical/sprint_123a8_artefacts")
RUN3_OUTPUT = ARTEFACTS_DIR / "run3_verification.json"

print("=" * 70)
print("SPRINT 123A.8 — RUN 3 DETERMINISTIC REPRODUCIBILITY CHECK (v2)")
print(f"Timestamp: {datetime.now(timezone.utc).isoformat()}")
print("DARWIN_DECISION_AUTHORITY=DISABLED")
print("DARWIN_EXECUTION_AUTHORITY=DISABLED")
print("=" * 70)

# ── Step 1: Load the implementation module ────────────────────────────────────
print("\n[1] Loading implementation module...")
impl_path = Path("/home/ubuntu/atlas-nexus/scripts/sprint-123a8-implementation.py")
spec = importlib.util.spec_from_file_location("sprint_123a8_impl", impl_path)
impl = importlib.util.module_from_spec(spec)

# Suppress the main() call by patching __name__
# We load the module but don't execute main()
import builtins
_original_name = "__main__"

# Redirect stdout during module load to suppress Phase output
import io
_stdout = sys.stdout
sys.stdout = io.StringIO()
try:
    spec.loader.exec_module(impl)
except SystemExit:
    pass  # The module calls sys.exit at the end of main() — ignore
finally:
    sys.stdout = _stdout

print("  Module loaded successfully")

# ── Step 2: Verify contract SHA ───────────────────────────────────────────────
print("\n[2] Verifying frozen strategy contract...")
contract_path = Path("/home/ubuntu/atlas-nexus/docs/architecture/canonical_strategy_contract.json")
with open(contract_path) as f:
    contract = json.load(f)
contract_body = {k: v for k, v in contract.items() if k != 'contract_sha256'}
contract_json = json.dumps(contract_body, sort_keys=True)
computed_contract_sha = hashlib.sha256(contract_json.encode()).hexdigest()
assert computed_contract_sha == REQUIRED_CONTRACT_SHA, \
    f"CONTRACT SHA MISMATCH: {computed_contract_sha}"
print(f"  Contract SHA: {computed_contract_sha} ✓")

# ── Step 3: Verify dataset SHA ────────────────────────────────────────────────
print("\n[3] Verifying canonical dataset...")
dataset_sha = hashlib.sha256(impl.DATASET_5M.read_bytes()).hexdigest()
assert dataset_sha == REQUIRED_DATASET_SHA, \
    f"DATASET SHA MISMATCH: {dataset_sha}"
print(f"  Dataset SHA: {dataset_sha} ✓")

# ── Step 4: Verify split manifest SHA ────────────────────────────────────────
print("\n[4] Verifying split manifest...")
split_json = json.dumps(impl.SPLIT_MANIFEST, sort_keys=True)
split_sha = hashlib.sha256(split_json.encode()).hexdigest()
assert split_sha == REQUIRED_SPLIT_SHA, \
    f"SPLIT SHA MISMATCH: {split_sha}"
print(f"  Split manifest SHA: {split_sha} ✓")

# ── Step 5: Load dataset and prepare features ─────────────────────────────────
print("\n[5] Loading and preparing features (identical to Run 1/2)...")
import pandas as pd
df_raw = pd.read_parquet(impl.DATASET_5M)
print(f"  Raw rows: {len(df_raw)}")
df = impl.prepare_features(df_raw)
print(f"  Features prepared: {len(df)} bars")
print(f"  Roll window bars: {df['is_roll_window'].sum()}")

# ── Step 6: Apply splits (identical to Run 1/2) ───────────────────────────────
from datetime import date
train_end = date.fromisoformat(impl.SPLIT_MANIFEST['train']['end'])
val_end = date.fromisoformat(impl.SPLIT_MANIFEST['validation']['end'])
oos_start = date.fromisoformat(impl.SPLIT_MANIFEST['oos']['start'])
df_all = df.copy()
print(f"  df_all: {len(df_all)} bars")

# ── Step 7: Run 3 backtest (IDENTICAL engine) ─────────────────────────────────
print("\n[6] Running backtest Run 3 (identical engine to Runs 1 and 2)...")
trades_all_r3 = impl.run_portfolio_backtest(df_all, roll_excluded=True)
print(f"  All-period trades (roll-excluded): {len(trades_all_r3)}")

# ── Step 8: Compute SHA ───────────────────────────────────────────────────────
run3_sha = impl.sha256_trades(trades_all_r3)
print(f"\n[7] Run 3 ledger SHA: {run3_sha}")
print(f"    Required:           {REQUIRED_LEDGER_SHA}")
match = run3_sha == REQUIRED_LEDGER_SHA
print(f"    Match: {match}")

# ── Step 9: Field-level comparison ───────────────────────────────────────────
print("\n[8] Field-level comparison with Run 1/2 saved ledger...")
with open(ARTEFACTS_DIR / "trade_ledger_full.json") as f:
    saved_trades = json.load(f)

run3_sorted = sorted(trades_all_r3, key=lambda x: (x.entry_date, x.entry_time_ny, x.trade_id))
saved_sorted = sorted(saved_trades, key=lambda x: (x['entry_date'], x['entry_time_ny'], x['trade_id']))

field_mismatches = []
if len(run3_sorted) != len(saved_sorted):
    field_mismatches.append(f"Trade count: Run3={len(run3_sorted)} vs Saved={len(saved_sorted)}")
else:
    for idx, (r3, sv) in enumerate(zip(run3_sorted, saved_sorted)):
        for fn in ['trade_id', 'strategy_id', 'direction', 'entry_date', 'entry_time_ny', 'exit_reason']:
            r3v = getattr(r3, fn)
            svv = sv[fn]
            if r3v != svv:
                field_mismatches.append(f"Trade {idx} {fn}: Run3={r3v} vs Saved={svv}")
                if len(field_mismatches) >= 5:
                    break
        if len(field_mismatches) >= 5:
            break

if field_mismatches:
    print(f"  MISMATCHES ({len(field_mismatches)}):")
    for m in field_mismatches:
        print(f"    {m}")
else:
    print(f"  All {len(run3_sorted)} trades match field-by-field ✓")

# ── Step 10: OOS performance ──────────────────────────────────────────────────
df_oos = df[df['date_ny'] >= oos_start].copy()
trades_oos = impl.run_portfolio_backtest(df_oos, roll_excluded=True)
oos_net = sum(t.net_pnl_dollars for t in trades_oos)
oos_wins = sum(1 for t in trades_oos if t.net_pnl_dollars > 0)
oos_gw = sum(t.net_pnl_dollars for t in trades_oos if t.net_pnl_dollars > 0)
oos_gl = abs(sum(t.net_pnl_dollars for t in trades_oos if t.net_pnl_dollars < 0))
oos_pf = oos_gw / oos_gl if oos_gl > 0 else 0.0
oos_exp = oos_net / len(trades_oos) if trades_oos else 0.0

print(f"\n[9] OOS Performance (Run 3):")
print(f"  Trades: {len(trades_oos)}")
print(f"  Win rate: {oos_wins/len(trades_oos)*100:.1f}%")
print(f"  Profit factor: {oos_pf:.4f}")
print(f"  Expectancy: ${oos_exp:.2f}/trade")
print(f"  Net P&L: ${oos_net:.2f}")

# ── Step 11: Save verification record ────────────────────────────────────────
result = {
    "run": 3,
    "timestamp": datetime.now(timezone.utc).isoformat(),
    "engine": "sprint-123a8-implementation.py (identical import)",
    "contract_sha_verified": computed_contract_sha,
    "dataset_sha_verified": dataset_sha,
    "split_sha_verified": split_sha,
    "run3_ledger_sha": run3_sha,
    "required_ledger_sha": REQUIRED_LEDGER_SHA,
    "ledger_sha_match": match,
    "field_mismatches": len(field_mismatches),
    "all_trades": len(trades_all_r3),
    "oos_trades": len(trades_oos),
    "oos_pf": round(oos_pf, 4),
    "oos_expectancy": round(oos_exp, 2),
    "oos_net_pnl": round(oos_net, 2),
    "deterministic_proof": {
        "run1_sha": REQUIRED_LEDGER_SHA,
        "run2_sha": REQUIRED_LEDGER_SHA,
        "run3_sha": run3_sha,
        "all_match": match and len(field_mismatches) == 0,
    },
    "darwin_decision_authority": "DISABLED",
    "darwin_execution_authority": "DISABLED",
    "darwin_traderspost_calls": 0,
    "darwin_tradovate_calls": 0,
}

with open(RUN3_OUTPUT, 'w') as f:
    json.dump(result, f, indent=2)
run3_file_sha = hashlib.sha256(RUN3_OUTPUT.read_bytes()).hexdigest()
print(f"\n[10] Run 3 verification saved: {RUN3_OUTPUT}")
print(f"     File SHA256: {run3_file_sha}")

if match and len(field_mismatches) == 0:
    print("\n✓ RUN_3_DETERMINISTIC_MATCH=TRUE")
    print("✓ Gate G8 reproducibility requirement: SATISFIED")
    sys.exit(0)
else:
    print("\n✗ RUN_3_DETERMINISTIC_MATCH=FALSE — Gate G8 BLOCKED")
    sys.exit(1)
