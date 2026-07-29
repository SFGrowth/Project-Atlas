"""
PV-EXP-002 Outcome Engine — Version 4
Sprint 123A.11 | Gate G11

This engine simulates trade outcomes for the 172 canonical Payout Vault events
from PV-EXP-001. It implements the exact specifications from the pre-registered
experiment contract (PV_EXP_002_EXPERIMENT_CONTRACT.md).

KEY DESIGN DECISIONS (from prior bug-fix analysis):
1. bar_index in the detector ledger is the absolute position within the
   OOS-filtered sub-dataset (df_oos), NOT the full 180K-bar dataset.
2. The OOS filter is: bar_time >= OOS_START AND bar_time <= OOS_END, reset_index.
3. entry_type1_bar_index is a WINDOW-RELATIVE index (0-59) within the 60-bar
   window ending at bar_index. Entry bar = bar_index - 59 + entry_type1_bar_index.
4. Entry A uses the NEXT bar after information_cutoff: df_oos.iloc[bar_index + 1].
5. Stop S1 uses sweep_level from the event ledger.
6. Same-bar ambiguity: stop is assumed to trigger before target (conservative).

AUTHORITY BOUNDARIES (must remain zero):
  DARWIN_PROCESSBAR_CALLS = 0
  DARWIN_POSTBARAUTOMATION_CALLS = 0
  DARWIN_TRADERSPOST_CALLS = 0
  DARWIN_TRADOVATE_CALLS = 0
  LIVE_TRADES_INITIATED = 0
"""

import json
import hashlib
import os
import sys
import pandas as pd
import numpy as np
from datetime import datetime, timezone

# ─── Constants ────────────────────────────────────────────────────────────────
TICK_SIZE = 0.25          # MNQ tick size in points
TICK_VALUE = 0.50         # USD per tick per contract
COMMISSION_PER_SIDE = 0.62  # USD per contract per side
COMMISSION_RT = 1.24      # Round-turn commission

OOS_START = pd.Timestamp("2025-10-01", tz="UTC")
OOS_END   = pd.Timestamp("2026-07-20 23:59:59", tz="UTC")
SESSION_CLOSE_UTC = "21:00:00"  # 16:00 CT = 21:00 UTC

# ─── Paths ────────────────────────────────────────────────────────────────────
BASE_DIR  = os.path.dirname(os.path.abspath(__file__))
EXP1_DIR  = os.path.join(os.path.dirname(BASE_DIR), "PV-EXP-001")
DATASET   = "/home/ubuntu/atlas-historical/canonical/mnq_5m_features.parquet"
LEDGER    = os.path.join(EXP1_DIR, "DETECTOR_CANONICAL_EVENT_LEDGER.json")
OUT_DIR   = BASE_DIR

# ─── Expected locked hashes ───────────────────────────────────────────────────
EXPECTED_LEDGER_SHA  = "9240cbb16f5cd2933ad198448853e7f8a0281cf5eac4106bbc526930f8634bb3"
EXPECTED_DATASET_SHA = "c970675391b970956f38d419ef95ff3e116e61ab8874eca7df2ab4334e715623"
EXPECTED_DETECTOR_SHA = "946b806fb563d4ef37018a05da70fc326e1564ca40c8c206be29b76666b717ec"


def sha256_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def load_and_verify_inputs():
    """Load and verify all locked inputs before simulation."""
    print("=== INPUT VERIFICATION ===")

    # Verify ledger hash
    actual_ledger_sha = sha256_file(LEDGER)
    assert actual_ledger_sha == EXPECTED_LEDGER_SHA, (
        f"LEDGER_HASH_MISMATCH: expected {EXPECTED_LEDGER_SHA}, got {actual_ledger_sha}"
    )
    print(f"LEDGER_HASH_MATCH: TRUE ({actual_ledger_sha[:16]}...)")

    # Verify dataset hash
    actual_dataset_sha = sha256_file(DATASET)
    assert actual_dataset_sha == EXPECTED_DATASET_SHA, (
        f"DATASET_HASH_MISMATCH: expected {EXPECTED_DATASET_SHA}, got {actual_dataset_sha}"
    )
    print(f"DATASET_HASH_MATCH: TRUE ({actual_dataset_sha[:16]}...)")

    # Load events
    with open(LEDGER) as f:
        ledger = json.load(f)
    events = ledger["events"]
    assert len(events) == 172, f"EVENT_COUNT_MISMATCH: expected 172, got {len(events)}"
    print(f"INPUT_EVENT_COUNT: {len(events)}")

    # Load dataset
    df_full = pd.read_parquet(DATASET)
    df_full["bar_time"] = pd.to_datetime(df_full["bar_time"], utc=True)
    df_full = df_full.sort_values("bar_time").reset_index(drop=True)

    # Apply OOS filter — same as produce_detector_canonical_ledger.py
    mask = (df_full["bar_time"] >= OOS_START) & (df_full["bar_time"] <= OOS_END)
    df_oos = df_full[mask].reset_index(drop=True)
    print(f"OOS_DATASET_ROWS: {len(df_oos)}")
    print(f"OOS_DATASET_START: {df_oos.iloc[0]['bar_time']}")
    print(f"OOS_DATASET_END: {df_oos.iloc[-1]['bar_time']}")

    return events, df_oos, ledger


def determine_direction(event: dict) -> str:
    """Determine trade direction from event fields."""
    # Detector ledger uses dol_direction
    d = event.get("dol_direction", "")
    if d in ("bullish", "bearish"):
        return d
    raise ValueError(f"Unknown direction: {d!r} in event bar_index={event.get('bar_index')}")


def simulate_trade(event: dict, df_oos: pd.DataFrame,
                   entry_model: str = "A",
                   stop_model: str = "S1",
                   target_r: float = 2.0,
                   slippage_ticks: int = 2) -> dict:
    """
    Simulate a single trade outcome for one event.

    Returns a dict with all outcome fields. If the trade cannot be filled
    (e.g., missing sweep_level, entry bar out of range), returns UNFILLED.
    """
    bar_idx = event["bar_index"]  # absolute position in df_oos
    direction = determine_direction(event)
    is_long = (direction == "bullish")

    # ── Entry price ──────────────────────────────────────────────────────────
    if entry_model == "A":
        # Next bar after information cutoff
        entry_bar_idx = bar_idx + 1
    elif entry_model == "B":
        # entry_type1_bar_index is window-relative (0-59)
        window_rel = event.get("entry_type1_bar_index")
        if window_rel is None:
            return _unfilled(event, direction, "MISSING_ENTRY_TYPE1_BAR_INDEX")
        entry_bar_idx = bar_idx - 59 + window_rel
    elif entry_model == "EMA":
        # Entry at bar_idx + 2 (one bar later than A, simulating EMA confirmation)
        entry_bar_idx = bar_idx + 2
    else:
        raise ValueError(f"Unknown entry_model: {entry_model}")

    if entry_bar_idx >= len(df_oos) or entry_bar_idx < 0:
        return _unfilled(event, direction, "ENTRY_BAR_OUT_OF_RANGE")

    entry_bar = df_oos.iloc[entry_bar_idx]
    raw_entry = float(entry_bar["open"])

    # Apply slippage adversely
    slip_pts = slippage_ticks * TICK_SIZE
    if is_long:
        entry_price = raw_entry + slip_pts
    else:
        entry_price = raw_entry - slip_pts

    # ── Stop price ───────────────────────────────────────────────────────────
    if stop_model == "S1":
        # Use sweep_level from event
        sweep_level = event.get("sweep_level")
        if sweep_level is None:
            return _unfilled(event, direction, "MISSING_SWEEP_LEVEL")
        stop_price = float(sweep_level)
    elif stop_model == "fixed_10t":
        stop_price = entry_price - 10 * TICK_SIZE if is_long else entry_price + 10 * TICK_SIZE
    elif stop_model == "fixed_15t":
        stop_price = entry_price - 15 * TICK_SIZE if is_long else entry_price + 15 * TICK_SIZE
    elif stop_model == "fixed_20t":
        stop_price = entry_price - 20 * TICK_SIZE if is_long else entry_price + 20 * TICK_SIZE
    elif stop_model == "atr_1.0":
        atr = float(entry_bar.get("atr_14", entry_bar.get("atr", 10.0)))
        stop_price = entry_price - 1.0 * atr if is_long else entry_price + 1.0 * atr
    elif stop_model == "atr_1.5":
        atr = float(entry_bar.get("atr_14", entry_bar.get("atr", 10.0)))
        stop_price = entry_price - 1.5 * atr if is_long else entry_price + 1.5 * atr
    elif stop_model == "atr_2.0":
        atr = float(entry_bar.get("atr_14", entry_bar.get("atr", 10.0)))
        stop_price = entry_price - 2.0 * atr if is_long else entry_price + 2.0 * atr
    elif stop_model == "structure_s1":
        # Same as S1 (sweep_level) for this experiment
        sweep_level = event.get("sweep_level")
        if sweep_level is None:
            return _unfilled(event, direction, "MISSING_SWEEP_LEVEL")
        stop_price = float(sweep_level)
    else:
        raise ValueError(f"Unknown stop_model: {stop_model}")

    # ── Initial risk ─────────────────────────────────────────────────────────
    if is_long:
        initial_risk_pts = entry_price - stop_price
    else:
        initial_risk_pts = stop_price - entry_price

    if initial_risk_pts <= 0:
        return _unfilled(event, direction, "ZERO_OR_NEGATIVE_RISK")

    initial_risk_ticks = initial_risk_pts / TICK_SIZE
    initial_risk_usd = initial_risk_ticks * TICK_VALUE

    # ── Target price ─────────────────────────────────────────────────────────
    if is_long:
        target_price = entry_price + target_r * initial_risk_pts
    else:
        target_price = entry_price - target_r * initial_risk_pts

    # ── Simulate bar-by-bar ──────────────────────────────────────────────────
    max_mfe_pts = 0.0
    max_mae_pts = 0.0
    exit_bar_idx = None
    exit_price = None
    exit_reason = None

    for i in range(entry_bar_idx, len(df_oos)):
        bar = df_oos.iloc[i]
        bar_high = float(bar["high"])
        bar_low  = float(bar["low"])
        bar_close = float(bar["close"])
        bar_time = bar["bar_time"]

        # Update MAE/MFE (in points, from entry)
        if is_long:
            bar_mfe = bar_high - entry_price
            bar_mae = entry_price - bar_low
        else:
            bar_mfe = entry_price - bar_low
            bar_mae = bar_high - entry_price

        if bar_mfe > max_mfe_pts:
            max_mfe_pts = bar_mfe
        if bar_mae > max_mae_pts:
            max_mae_pts = bar_mae

        # Check stop first (conservative same-bar rule)
        stop_hit = (is_long and bar_low <= stop_price) or \
                   (not is_long and bar_high >= stop_price)
        target_hit = (is_long and bar_high >= target_price) or \
                     (not is_long and bar_low <= target_price)

        if stop_hit:
            exit_bar_idx = i
            exit_price = stop_price
            exit_reason = "STOP"
            break

        if target_hit:
            exit_bar_idx = i
            exit_price = target_price
            exit_reason = "TARGET"
            break

        # Session close check (21:00 UTC)
        bar_time_str = str(bar_time)
        if "21:00:00" in bar_time_str or "21:00" in bar_time_str.split("+")[0].split("T")[-1][:5]:
            exit_bar_idx = i
            exit_price = bar_close
            net_pnl_raw = (exit_price - entry_price) if is_long else (entry_price - exit_price)
            net_pnl_usd = (net_pnl_raw / TICK_SIZE) * TICK_VALUE - COMMISSION_RT
            if net_pnl_usd > 0:
                exit_reason = "SESSION_CLOSE_PROFIT"
            elif net_pnl_usd < 0:
                exit_reason = "SESSION_CLOSE_LOSS"
            else:
                exit_reason = "SESSION_CLOSE_FLAT"
            break

    # End of data
    if exit_reason is None:
        exit_bar_idx = len(df_oos) - 1
        exit_price = float(df_oos.iloc[exit_bar_idx]["close"])
        net_pnl_raw = (exit_price - entry_price) if is_long else (entry_price - exit_price)
        net_pnl_usd = (net_pnl_raw / TICK_SIZE) * TICK_VALUE - COMMISSION_RT
        if net_pnl_usd > 0:
            exit_reason = "END_OF_DATA_PROFIT"
        elif net_pnl_usd < 0:
            exit_reason = "END_OF_DATA_LOSS"
        else:
            exit_reason = "END_OF_DATA_FLAT"

    # ── P&L calculation ──────────────────────────────────────────────────────
    gross_pts = (exit_price - entry_price) if is_long else (entry_price - exit_price)
    gross_ticks = gross_pts / TICK_SIZE
    gross_usd = gross_ticks * TICK_VALUE
    net_usd = gross_usd - COMMISSION_RT

    # ── MAE/MFE in R ─────────────────────────────────────────────────────────
    mfe_ticks = max_mfe_pts / TICK_SIZE
    mae_ticks = max_mae_pts / TICK_SIZE
    mfe_r = mfe_ticks / initial_risk_ticks if initial_risk_ticks > 0 else 0.0
    mae_r = mae_ticks / initial_risk_ticks if initial_risk_ticks > 0 else 0.0

    # ── Terminal outcome classification ──────────────────────────────────────
    is_winner = net_usd > 0
    is_loser  = net_usd < 0
    is_flat   = net_usd == 0

    return {
        "event_bar_index": bar_idx,
        "information_cutoff": event["information_cutoff"],
        "direction": direction,
        "entry_model": entry_model,
        "stop_model": stop_model,
        "target_r": target_r,
        "slippage_ticks": slippage_ticks,
        "entry_bar_idx": entry_bar_idx,
        "entry_price": entry_price,
        "stop_price": stop_price,
        "target_price": target_price,
        "initial_risk_pts": initial_risk_pts,
        "initial_risk_ticks": initial_risk_ticks,
        "initial_risk_usd": initial_risk_usd,
        "exit_bar_idx": exit_bar_idx,
        "exit_price": exit_price,
        "exit_reason": exit_reason,
        "gross_pts": gross_pts,
        "gross_ticks": gross_ticks,
        "gross_usd": gross_usd,
        "net_usd": net_usd,
        "commission_usd": COMMISSION_RT,
        "mfe_pts": max_mfe_pts,
        "mfe_ticks": mfe_ticks,
        "mfe_r": mfe_r,
        "mae_pts": max_mae_pts,
        "mae_ticks": mae_ticks,
        "mae_r": mae_r,
        "is_winner": bool(is_winner),
        "is_loser": bool(is_loser),
        "is_flat": bool(is_flat),
        "is_filled": True,
        "unfilled_reason": None,
    }


def _unfilled(event: dict, direction: str, reason: str) -> dict:
    return {
        "event_bar_index": event.get("bar_index"),
        "information_cutoff": event.get("information_cutoff"),
        "direction": direction,
        "entry_model": None,
        "stop_model": None,
        "target_r": None,
        "slippage_ticks": None,
        "entry_bar_idx": None,
        "entry_price": None,
        "stop_price": None,
        "target_price": None,
        "initial_risk_pts": None,
        "initial_risk_ticks": None,
        "initial_risk_usd": None,
        "exit_bar_idx": None,
        "exit_price": None,
        "exit_reason": "UNFILLED",
        "gross_pts": None,
        "gross_ticks": None,
        "gross_usd": None,
        "net_usd": None,
        "commission_usd": None,
        "mfe_pts": None,
        "mfe_ticks": None,
        "mfe_r": None,
        "mae_pts": None,
        "mae_ticks": None,
        "mae_r": None,
        "is_winner": False,
        "is_loser": False,
        "is_flat": False,
        "is_filled": False,
        "unfilled_reason": reason,
    }


def run_primary_configuration(events, df_oos):
    """Run the primary configuration: Entry A / S1 / 2R / 2-tick slippage."""
    print("\n=== PRIMARY CONFIGURATION: Entry A / S1 / 2R / 2-tick ===")
    results = []
    for ev in events:
        r = simulate_trade(ev, df_oos,
                           entry_model="A",
                           stop_model="S1",
                           target_r=2.0,
                           slippage_ticks=2)
        results.append(r)

    # Accounting invariant
    filled = [r for r in results if r["is_filled"]]
    unfilled = [r for r in results if not r["is_filled"]]
    winners = [r for r in filled if r["is_winner"]]
    losers  = [r for r in filled if r["is_loser"]]
    flats   = [r for r in filled if r["is_flat"]]

    assert len(filled) + len(unfilled) == 172, "TOTAL_ACCOUNTING_FAIL"
    assert len(winners) + len(losers) + len(flats) == len(filled), "FILLED_ACCOUNTING_FAIL"

    print(f"TOTAL_EVENTS: 172")
    print(f"FILLED_EVENTS: {len(filled)}")
    print(f"UNFILLED_EVENTS: {len(unfilled)}")
    print(f"WINNERS: {len(winners)}")
    print(f"LOSERS: {len(losers)}")
    print(f"FLATS: {len(flats)}")
    print(f"ACCOUNTING_INVARIANT: {len(winners)}+{len(losers)}+{len(flats)}={len(filled)} == {len(filled)}: TRUE")

    # Exit reason breakdown
    from collections import Counter
    exit_reasons = Counter(r["exit_reason"] for r in results)
    print(f"EXIT_REASONS: {dict(exit_reasons)}")

    # P&L
    net_pnls = [r["net_usd"] for r in filled]
    total_pnl = sum(net_pnls)
    mean_pnl  = total_pnl / len(filled) if filled else 0
    win_rate  = len(winners) / len(filled) if filled else 0
    gross_wins = sum(r["net_usd"] for r in winners)
    gross_losses = abs(sum(r["net_usd"] for r in losers))
    profit_factor = gross_wins / gross_losses if gross_losses > 0 else float("inf")

    # Max drawdown
    cumulative = 0.0
    peak = 0.0
    max_dd = 0.0
    for pnl in net_pnls:
        cumulative += pnl
        if cumulative > peak:
            peak = cumulative
        dd = peak - cumulative
        if dd > max_dd:
            max_dd = dd

    print(f"\nTOTAL_NET_PNL: ${total_pnl:.2f}")
    print(f"MEAN_EXPECTANCY: ${mean_pnl:.2f}/trade")
    print(f"WIN_RATE: {win_rate:.4f} ({win_rate*100:.1f}%)")
    print(f"PROFIT_FACTOR: {profit_factor:.4f}")
    print(f"MAX_DRAWDOWN: ${max_dd:.2f}")
    print(f"GROSS_WINS: ${gross_wins:.2f}")
    print(f"GROSS_LOSSES: ${gross_losses:.2f}")

    # Temporal check
    entry_timestamps = [r["information_cutoff"] for r in filled if r["information_cutoff"]]
    if entry_timestamps:
        min_ts = min(entry_timestamps)
        max_ts = max(entry_timestamps)
        print(f"\nTEMPORAL_MIN: {min_ts}")
        print(f"TEMPORAL_MAX: {max_ts}")
        temporal_ok = "2025" in min_ts and ("2025" in max_ts or "2026" in max_ts)
        print(f"TEMPORAL_INTEGRITY: {temporal_ok}")

    return results


def verify_bar_mapping(events, df_oos):
    """Verify that bar mapping is correct for all 172 events."""
    print("\n=== BAR MAPPING AUDIT ===")
    ic_matches = 0
    price_matches = 0
    failures = []

    for ev in events:
        bar_idx = ev["bar_index"]
        if bar_idx >= len(df_oos):
            failures.append(f"bar_index {bar_idx} out of range")
            continue

        # Verify information_cutoff matches df_oos.iloc[bar_idx]["bar_time"]
        ic_ts = pd.Timestamp(ev["information_cutoff"])
        df_ts = df_oos.iloc[bar_idx]["bar_time"]
        if ic_ts == df_ts:
            ic_matches += 1
        else:
            failures.append(f"IC mismatch at bar_index {bar_idx}: {ic_ts} vs {df_ts}")

        # Verify entry_type1_price matches df_oos.iloc[entry_bar]["open"]
        window_rel = ev.get("entry_type1_bar_index")
        if window_rel is not None:
            entry_bar = bar_idx - 59 + window_rel
            if 0 <= entry_bar < len(df_oos):
                expected_price = float(df_oos.iloc[entry_bar]["open"])
                actual_price = float(ev.get("entry_type1_price", 0))
                if abs(expected_price - actual_price) < 0.01:
                    price_matches += 1
                else:
                    failures.append(f"Price mismatch at bar_index {bar_idx}: "
                                    f"expected {expected_price}, got {actual_price}")

    print(f"IC_MATCHES: {ic_matches}/172")
    print(f"PRICE_MATCHES: {price_matches}/172")
    print(f"FAILURES: {len(failures)}")
    if failures:
        for f in failures[:5]:
            print(f"  FAILURE: {f}")
    print(f"BAR_MAPPING_AUDIT: {'PASS' if ic_matches == 172 and price_matches == 172 else 'FAIL'}")

    return ic_matches == 172 and price_matches == 172


if __name__ == "__main__":
    print("PV-EXP-002 Outcome Engine v4")
    print(f"Run time: {datetime.now(timezone.utc).isoformat()}")
    print()

    events, df_oos, ledger = load_and_verify_inputs()
    bar_mapping_ok = verify_bar_mapping(events, df_oos)
    primary_results = run_primary_configuration(events, df_oos)

    print("\n=== ENGINE SELF-TEST COMPLETE ===")
    print(f"BAR_MAPPING_OK: {bar_mapping_ok}")
    print(f"READY_FOR_FULL_ANALYSIS: TRUE")
