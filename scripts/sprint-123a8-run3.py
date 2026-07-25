#!/usr/bin/env python3
"""
Sprint 123A.8 — Run 3 Deterministic Reproducibility Check
Executes a fresh third backtest run and verifies SHA matches Runs 1 and 2.
DARWIN_DECISION_AUTHORITY=DISABLED
DARWIN_EXECUTION_AUTHORITY=DISABLED
"""
import json
import hashlib
import sys
import pandas as pd
import numpy as np
from pathlib import Path
from datetime import date, datetime, timezone
from dataclasses import dataclass, field
from typing import List, Optional, Dict, Any

# ── Paths ─────────────────────────────────────────────────────────────────────
ATLAS_HIST = Path("/home/ubuntu/atlas-historical")
DATASET_5M = ATLAS_HIST / "canonical" / "mnq_5m_features.parquet"
CONTRACT_PATH = Path("/home/ubuntu/atlas-nexus/docs/architecture/canonical_strategy_contract.json")
ARTEFACTS_DIR = ATLAS_HIST / "sprint_123a8_artefacts"
RUN3_OUTPUT = ATLAS_HIST / "sprint_123a8_artefacts" / "run3_verification.json"

REQUIRED_LEDGER_SHA = "670c3f7e59d82b3069df1ebcefdb9221a219ad73783618e7b35eca7864072e22"
REQUIRED_CONTRACT_SHA = "cb5c58947d04d8d41c5164e2563cedbb816c969500cef003c611f2a078f042fd"
REQUIRED_DATASET_SHA = "c970675391b970956f38d419ef95ff3e116e61ab8874eca7df2ab4334e715623"
REQUIRED_SPLIT_SHA = "5115e7fdfbc28170a6f28d501d88e34bd9511399b944359cdec1f7ff486f391d"

# ── Frozen contract parameters (must match contract exactly) ──────────────────
COMMISSION_RT = 5.00
TICK_SIZE = 0.25
TICK_VALUE = 0.50
MAX_RISK_USD = 450.0
ADX_THRESHOLD = 25.0
ATR_VOLATILE_MULT = 1.5
ROLL_WINDOW_DAYS = 3
WARMUP_BARS = 200

SPLIT_MANIFEST = {
    "split_manifest_version": "1.0.0",
    "sprint": "123A.8",
    "defined_at": "2026-07-24T00:00:00Z",
    "note": "Splits defined chronologically before inspecting outcomes. No alteration after definition.",
    "train": {"start": "2024-01-01", "end": "2025-03-31"},
    "validation": {"start": "2025-04-01", "end": "2025-09-30"},
    "oos": {"start": "2025-10-01", "end": "2026-07-20"},
    "walk_forward_folds": [
        {"fold": 1, "train_start": "2024-01-01", "train_end": "2024-06-30",
         "val_start": "2024-07-01", "val_end": "2024-09-30"},
        {"fold": 2, "train_start": "2024-01-01", "train_end": "2024-09-30",
         "val_start": "2024-10-01", "val_end": "2024-12-31"},
        {"fold": 3, "train_start": "2024-01-01", "train_end": "2024-12-31",
         "val_start": "2025-01-01", "val_end": "2025-03-31"},
        {"fold": 4, "train_start": "2024-01-01", "train_end": "2025-03-31",
         "val_start": "2025-04-01", "val_end": "2025-06-30"},
        {"fold": 5, "train_start": "2024-01-01", "train_end": "2025-06-30",
         "val_start": "2025-07-01", "val_end": "2025-09-30"},
    ],
    "roll_policy": "RWP-001",
    "primary_results": "ROLL_EXCLUDED",
    "secondary_results": "ROLL_INCLUSIVE",
    "quarantined_datasets": ["3m", "60m"],
    "approved_datasets": ["1m", "5m", "15m", "30m"],
}

ADE_ORDER = ["A1", "A3", "SB1", "ORB1", "B1"]

# ── Data classes ──────────────────────────────────────────────────────────────
@dataclass
class Trade:
    trade_id: str
    strategy_id: str
    direction: str
    entry_bar_idx: int
    entry_date: str
    entry_time_ny: str
    entry_price: float
    quantity: int
    stop_price: float
    target_price: float
    stop_dist_pts: float
    target_dist_pts: float
    ade_score: float
    is_roll_window: bool
    raw_symbol: str
    exit_bar_idx: int = -1
    exit_date: str = ""
    exit_price: float = 0.0
    exit_reason: str = ""
    gross_pnl_pts: float = 0.0
    commission_dollars: float = COMMISSION_RT
    net_pnl_dollars: float = 0.0
    hold_bars: int = 0
    mae_pts: float = 0.0
    mfe_pts: float = 0.0

# ── SHA helpers ───────────────────────────────────────────────────────────────
def sha256_trades(trades: List[Trade]) -> str:
    ledger = []
    for t in sorted(trades, key=lambda x: (x.entry_date, x.entry_time_ny, x.trade_id)):
        ledger.append({
            "trade_id": t.trade_id,
            "strategy_id": t.strategy_id,
            "direction": t.direction,
            "entry_date": t.entry_date,
            "entry_time_ny": t.entry_time_ny,
            "entry_price": round(t.entry_price, 4),
            "exit_price": round(t.exit_price, 4),
            "quantity": t.quantity,
            "exit_reason": t.exit_reason,
            "net_pnl_dollars": round(t.net_pnl_dollars, 4),
        })
    ledger_json = json.dumps(ledger, sort_keys=True)
    return hashlib.sha256(ledger_json.encode()).hexdigest()

def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()

# ── Feature computation ───────────────────────────────────────────────────────
def compute_features(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    # EMA
    df['ema20'] = df['close'].ewm(span=20, adjust=False).mean()
    df['ema50'] = df['close'].ewm(span=50, adjust=False).mean()
    df['ema200'] = df['close'].ewm(span=200, adjust=False).mean()
    # ATR
    tr = pd.concat([
        df['high'] - df['low'],
        (df['high'] - df['close'].shift(1)).abs(),
        (df['low'] - df['close'].shift(1)).abs(),
    ], axis=1).max(axis=1)
    df['atr14'] = tr.ewm(span=14, adjust=False).mean()
    # ADX / DI
    up = df['high'].diff()
    down = -df['low'].diff()
    plus_dm = np.where((up > down) & (up > 0), up, 0.0)
    minus_dm = np.where((down > up) & (down > 0), down, 0.0)
    atr_s = pd.Series(tr).ewm(span=14, adjust=False).mean()
    di_plus = 100 * pd.Series(plus_dm).ewm(span=14, adjust=False).mean() / atr_s
    di_minus = 100 * pd.Series(minus_dm).ewm(span=14, adjust=False).mean() / atr_s
    dx = (100 * (di_plus - di_minus).abs() / (di_plus + di_minus).replace(0, np.nan)).fillna(0)
    df['adx14'] = dx.ewm(span=14, adjust=False).mean()
    df['di_plus'] = di_plus.values
    df['di_minus'] = di_minus.values
    # VWAP (session-based, vectorized)
    df['bar_date'] = pd.to_datetime(df['bar_time']).dt.date
    df['typical'] = (df['high'] + df['low'] + df['close']) / 3
    df['cum_tp_vol'] = df.groupby('bar_date').apply(
        lambda g: (g['typical'] * g['volume']).cumsum()
    ).reset_index(level=0, drop=True)
    df['cum_vol'] = df.groupby('bar_date')['volume'].cumsum()
    df['vwap'] = df['cum_tp_vol'] / df['cum_vol'].replace(0, np.nan)
    df['above_vwap'] = (df['close'] > df['vwap']).astype(int)
    # Session hour (NY time)
    bt = pd.to_datetime(df['bar_time'])
    if bt.dt.tz is None:
        bt = bt.dt.tz_localize('UTC')
    df['ny_hour'] = bt.dt.tz_convert('America/New_York').dt.hour
    return df

# ── Strategy signal functions ─────────────────────────────────────────────────
def ade_score(row, strategy_id: str) -> float:
    adx = row.get('adx14', 0)
    atr = row.get('atr14', 1)
    above_vwap = row.get('above_vwap', 0)
    scores = {
        'A1': adx * 0.4 + atr * 0.3 + above_vwap * 0.3,
        'A3': adx * 0.35 + atr * 0.35 + above_vwap * 0.3,
        'SB1': adx * 0.3 + atr * 0.4 + above_vwap * 0.3,
        'ORB1': adx * 0.45 + atr * 0.25 + above_vwap * 0.3,
        'B1': adx * 0.25 + atr * 0.45 + above_vwap * 0.3,
    }
    return scores.get(strategy_id, 0.0)

def check_signal(df: pd.DataFrame, i: int, strategy_id: str) -> Optional[str]:
    if i < WARMUP_BARS:
        return None
    row = df.iloc[i]
    adx = row.get('adx14', 0)
    ema20 = row.get('ema20', 0)
    ema50 = row.get('ema50', 0)
    ema200 = row.get('ema200', 0)
    close = row['close']
    atr = row.get('atr14', 1)
    above_vwap = row.get('above_vwap', 0)
    di_plus = row.get('di_plus', 0)
    di_minus = row.get('di_minus', 0)
    ny_hour = row.get('ny_hour', 0)

    if strategy_id == 'A1':
        if adx > ADX_THRESHOLD and ema20 > ema50 > ema200 and close > ema20 and above_vwap:
            return 'LONG'
        if adx > ADX_THRESHOLD and ema20 < ema50 < ema200 and close < ema20 and not above_vwap:
            return 'SHORT'
    elif strategy_id == 'A3':
        if adx > ADX_THRESHOLD * 1.2 and ema20 > ema50 > ema200 and close > ema20 and above_vwap and di_plus > di_minus:
            return 'LONG'
        if adx > ADX_THRESHOLD * 1.2 and ema20 < ema50 < ema200 and close < ema20 and not above_vwap and di_minus > di_plus:
            return 'SHORT'
    elif strategy_id == 'SB1':
        if 9 <= ny_hour <= 11 and above_vwap and adx > ADX_THRESHOLD * 0.8 and close > ema50:
            return 'LONG'
        if 9 <= ny_hour <= 11 and not above_vwap and adx > ADX_THRESHOLD * 0.8 and close < ema50:
            return 'SHORT'
    elif strategy_id == 'ORB1':
        if ny_hour == 10 and above_vwap and close > ema20 and adx > ADX_THRESHOLD * 0.7:
            return 'LONG'
        if ny_hour == 10 and not above_vwap and close < ema20 and adx > ADX_THRESHOLD * 0.7:
            return 'SHORT'
    elif strategy_id == 'B1':
        if close > ema200 and above_vwap and atr > df['atr14'].iloc[max(0,i-20):i].mean() * ATR_VOLATILE_MULT:
            return 'LONG'
        if close < ema200 and not above_vwap and atr > df['atr14'].iloc[max(0,i-20):i].mean() * ATR_VOLATILE_MULT:
            return 'SHORT'
    return None

# ── Backtest engine ───────────────────────────────────────────────────────────
def run_backtest(df: pd.DataFrame, period_label: str = "ALL") -> List[Trade]:
    trades: List[Trade] = []
    active_trade: Optional[Trade] = None
    trade_counter = 0

    for i in range(WARMUP_BARS, len(df)):
        row = df.iloc[i]
        bar_date_str = str(row['bar_date'])
        _bt = pd.to_datetime(row['bar_time'])
        if _bt.tzinfo is None:
            _bt = _bt.tz_localize('UTC')
        bar_time_str = _bt.tz_convert('America/New_York').strftime('%H:%M')

        # Manage open trade
        if active_trade is not None:
            high = row['high']
            low = row['low']
            close = row['close']
            active_trade.hold_bars += 1
            # Track MAE/MFE
            if active_trade.direction == 'LONG':
                active_trade.mfe_pts = max(active_trade.mfe_pts, high - active_trade.entry_price)
                active_trade.mae_pts = min(active_trade.mae_pts, low - active_trade.entry_price)
            else:
                active_trade.mfe_pts = max(active_trade.mfe_pts, active_trade.entry_price - low)
                active_trade.mae_pts = min(active_trade.mae_pts, active_trade.entry_price - high)

            exit_price = None
            exit_reason = None

            if active_trade.direction == 'LONG':
                if low <= active_trade.stop_price:
                    exit_price = active_trade.stop_price
                    exit_reason = 'STOP'
                elif high >= active_trade.target_price:
                    exit_price = active_trade.target_price
                    exit_reason = 'TARGET'
                elif active_trade.hold_bars >= 48:
                    exit_price = close
                    exit_reason = 'TIMEOUT'
            else:
                if high >= active_trade.stop_price:
                    exit_price = active_trade.stop_price
                    exit_reason = 'STOP'
                elif low <= active_trade.target_price:
                    exit_price = active_trade.target_price
                    exit_reason = 'TARGET'
                elif active_trade.hold_bars >= 48:
                    exit_price = close
                    exit_reason = 'TIMEOUT'

            if exit_price is not None:
                active_trade.exit_bar_idx = i
                active_trade.exit_date = bar_date_str
                active_trade.exit_price = exit_price
                active_trade.exit_reason = exit_reason
                if active_trade.direction == 'LONG':
                    active_trade.gross_pnl_pts = exit_price - active_trade.entry_price
                else:
                    active_trade.gross_pnl_pts = active_trade.entry_price - exit_price
                gross_dollars = active_trade.gross_pnl_pts * (1.0 / TICK_SIZE) * TICK_VALUE * active_trade.quantity
                active_trade.net_pnl_dollars = gross_dollars - COMMISSION_RT
                trades.append(active_trade)
                active_trade = None
            continue

        # No active trade — check for new signal via ADE hierarchy
        if row.get('is_degraded', False):
            continue

        best_signal = None
        best_strategy = None
        best_score = -1.0

        for sid in ADE_ORDER:
            signal = check_signal(df, i, sid)
            if signal is not None:
                score = ade_score(row, sid)
                if score > best_score:
                    best_score = score
                    best_signal = signal
                    best_strategy = sid
                break  # ADE hierarchy: first eligible strategy wins

        if best_signal is None:
            continue

        # Size position
        atr = row.get('atr14', 1.0)
        stop_dist = atr * 2.0
        qty = max(1, int(MAX_RISK_USD / (stop_dist * (1.0 / TICK_SIZE) * TICK_VALUE)))
        qty = min(qty, 10)

        entry_price = row['close']
        if best_signal == 'LONG':
            stop_price = entry_price - stop_dist
            target_price = entry_price + stop_dist * 2.0
        else:
            stop_price = entry_price + stop_dist
            target_price = entry_price - stop_dist * 2.0

        trade_counter += 1
        trade_id = f"{best_strategy}_{bar_date_str}_{trade_counter:05d}"

        active_trade = Trade(
            trade_id=trade_id,
            strategy_id=best_strategy,
            direction=best_signal,
            entry_bar_idx=i,
            entry_date=bar_date_str,
            entry_time_ny=bar_time_str,
            entry_price=entry_price,
            quantity=qty,
            stop_price=stop_price,
            target_price=target_price,
            stop_dist_pts=stop_dist,
            target_dist_pts=stop_dist * 2.0,
            ade_score=best_score,
            is_roll_window=bool(row.get('is_roll_window', False)),
            raw_symbol=str(row.get('raw_symbol', '')),
        )

    # Close any open trade at end
    if active_trade is not None:
        last = df.iloc[-1]
        active_trade.exit_bar_idx = len(df) - 1
        active_trade.exit_date = str(last['bar_date'])
        active_trade.exit_price = last['close']
        active_trade.exit_reason = 'END_OF_DATA'
        if active_trade.direction == 'LONG':
            active_trade.gross_pnl_pts = active_trade.exit_price - active_trade.entry_price
        else:
            active_trade.gross_pnl_pts = active_trade.entry_price - active_trade.exit_price
        gross_dollars = active_trade.gross_pnl_pts * (1.0 / TICK_SIZE) * TICK_VALUE * active_trade.quantity
        active_trade.net_pnl_dollars = gross_dollars - COMMISSION_RT
        trades.append(active_trade)

    return trades

# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    print("=" * 70)
    print("SPRINT 123A.8 — RUN 3 DETERMINISTIC REPRODUCIBILITY CHECK")
    print(f"Timestamp: {datetime.now(timezone.utc).isoformat()}")
    print("DARWIN_DECISION_AUTHORITY=DISABLED")
    print("DARWIN_EXECUTION_AUTHORITY=DISABLED")
    print("=" * 70)

    # 1. Verify contract SHA
    print("\n[1] Verifying frozen strategy contract...")
    with open(CONTRACT_PATH) as f:
        contract = json.load(f)
    contract_body = {k: v for k, v in contract.items() if k != 'contract_sha256'}
    contract_json = json.dumps(contract_body, sort_keys=True)
    computed_contract_sha = hashlib.sha256(contract_json.encode()).hexdigest()
    assert computed_contract_sha == REQUIRED_CONTRACT_SHA, \
        f"CONTRACT SHA MISMATCH: {computed_contract_sha} != {REQUIRED_CONTRACT_SHA}"
    print(f"  Contract SHA: {computed_contract_sha} ✓")

    # 2. Verify dataset SHA
    print("\n[2] Verifying canonical dataset...")
    dataset_sha = sha256_file(DATASET_5M)
    assert dataset_sha == REQUIRED_DATASET_SHA, \
        f"DATASET SHA MISMATCH: {dataset_sha} != {REQUIRED_DATASET_SHA}"
    print(f"  Dataset SHA: {dataset_sha} ✓")

    # 3. Verify split manifest SHA
    print("\n[3] Verifying split manifest...")
    split_json = json.dumps(SPLIT_MANIFEST, sort_keys=True)
    split_sha = hashlib.sha256(split_json.encode()).hexdigest()
    assert split_sha == REQUIRED_SPLIT_SHA, \
        f"SPLIT SHA MISMATCH: {split_sha} != {REQUIRED_SPLIT_SHA}"
    print(f"  Split manifest SHA: {split_sha} ✓")

    # 4. Load dataset
    print("\n[4] Loading canonical 5m dataset...")
    df = pd.read_parquet(DATASET_5M)
    print(f"  Total bars: {len(df)}")

    # 5. Compute features
    print("\n[5] Computing features...")
    df = compute_features(df)
    df['bar_date_str'] = df['bar_date'].astype(str)

    # 6. Apply split
    train_end = date.fromisoformat(SPLIT_MANIFEST['train']['end'])
    val_end = date.fromisoformat(SPLIT_MANIFEST['validation']['end'])
    oos_start = date.fromisoformat(SPLIT_MANIFEST['oos']['start'])
    oos_end = date.fromisoformat(SPLIT_MANIFEST['oos']['end'])

    df_oos = df[
        (df['bar_date'] >= oos_start) &
        (df['bar_date'] <= oos_end) &
        (~df.get('is_roll_window', pd.Series(False, index=df.index)).astype(bool))
    ].copy().reset_index(drop=True)
    print(f"  OOS bars (roll-excluded): {len(df_oos)}")

    # 7. Run backtest (Run 3)
    print("\n[6] Running backtest (Run 3)...")
    trades_oos = run_backtest(df_oos, "OOS")
    print(f"  OOS trades: {len(trades_oos)}")

    # 8. Run full dataset for ledger SHA comparison
    df_all = df[~df.get('is_roll_window', pd.Series(False, index=df.index)).astype(bool)].copy().reset_index(drop=True)
    trades_all = run_backtest(df_all, "ALL")
    print(f"  All-period trades (roll-excluded): {len(trades_all)}")

    # 9. Compute ledger SHA
    run3_sha = sha256_trades(trades_all)
    print(f"\n[7] Run 3 ledger SHA: {run3_sha}")
    print(f"    Required:           {REQUIRED_LEDGER_SHA}")
    match = run3_sha == REQUIRED_LEDGER_SHA
    print(f"    Match: {match}")

    # 10. Compare trade-level fields with saved ledger
    print("\n[8] Comparing trade-level fields with Run 1/2 ledger...")
    with open(ARTEFACTS_DIR / "trade_ledger_full.json") as f:
        saved_trades = json.load(f)

    run3_trades_sorted = sorted(trades_all, key=lambda x: (x.entry_date, x.entry_time_ny, x.trade_id))
    saved_sorted = sorted(saved_trades, key=lambda x: (x['entry_date'], x['entry_time_ny'], x['trade_id']))

    field_mismatches = []
    if len(run3_trades_sorted) != len(saved_sorted):
        field_mismatches.append(f"Trade count mismatch: Run3={len(run3_trades_sorted)} vs Saved={len(saved_sorted)}")
    else:
        for idx, (r3, sv) in enumerate(zip(run3_trades_sorted, saved_sorted)):
            for field_name in ['trade_id', 'strategy_id', 'direction', 'entry_date', 'entry_time_ny', 'exit_reason']:
                r3_val = getattr(r3, field_name)
                sv_val = sv[field_name]
                if r3_val != sv_val:
                    field_mismatches.append(f"Trade {idx} {field_name}: Run3={r3_val} vs Saved={sv_val}")
            for field_name in ['entry_price', 'exit_price', 'net_pnl_dollars']:
                r3_val = round(getattr(r3, field_name), 4)
                sv_val = round(sv[field_name], 4)
                if abs(r3_val - sv_val) > 0.0001:
                    field_mismatches.append(f"Trade {idx} {field_name}: Run3={r3_val} vs Saved={sv_val}")

    if field_mismatches:
        print(f"  FIELD MISMATCHES DETECTED ({len(field_mismatches)}):")
        for m in field_mismatches[:10]:
            print(f"    {m}")
    else:
        print(f"  All {len(run3_trades_sorted)} trades match field-by-field ✓")

    # 11. OOS performance summary
    oos_net = sum(t.net_pnl_dollars for t in trades_oos)
    oos_wins = sum(1 for t in trades_oos if t.net_pnl_dollars > 0)
    oos_gross_w = sum(t.net_pnl_dollars for t in trades_oos if t.net_pnl_dollars > 0)
    oos_gross_l = abs(sum(t.net_pnl_dollars for t in trades_oos if t.net_pnl_dollars < 0))
    oos_pf = oos_gross_w / oos_gross_l if oos_gross_l > 0 else 0.0
    oos_exp = oos_net / len(trades_oos) if trades_oos else 0.0

    print(f"\n[9] OOS Performance (Run 3):")
    print(f"  Trades: {len(trades_oos)}")
    print(f"  Win rate: {oos_wins/len(trades_oos)*100:.1f}%")
    print(f"  Profit factor: {oos_pf:.4f}")
    print(f"  Expectancy: ${oos_exp:.2f}/trade")
    print(f"  Net P&L: ${oos_net:.2f}")

    # 12. Save Run 3 verification record
    result = {
        "run": 3,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "contract_sha_verified": computed_contract_sha,
        "dataset_sha_verified": dataset_sha,
        "split_sha_verified": split_sha,
        "run3_ledger_sha": run3_sha,
        "required_ledger_sha": REQUIRED_LEDGER_SHA,
        "ledger_sha_match": match,
        "field_mismatches": len(field_mismatches),
        "all_trades": len(trades_all),
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
    run3_sha_file = hashlib.sha256(Path(RUN3_OUTPUT).read_bytes()).hexdigest()
    print(f"\n[10] Run 3 verification saved: {RUN3_OUTPUT}")
    print(f"     File SHA256: {run3_sha_file}")

    if match and len(field_mismatches) == 0:
        print("\n✓ RUN_3_DETERMINISTIC_MATCH=TRUE")
        print("✓ Gate G8 reproducibility requirement: SATISFIED")
    else:
        print("\n✗ RUN_3_DETERMINISTIC_MATCH=FALSE — Gate G8 BLOCKED")
        sys.exit(1)

    return result

if __name__ == "__main__":
    main()
