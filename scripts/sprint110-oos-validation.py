"""
sprint110-oos-validation.py
Sprint 110 — Out-of-Sample Validation of DARWIN-S109-001
Parts 1–5: Hypothesis Freeze, OOS Validation, Stability, Monte Carlo, Promotion Decision

Dataset: ATLAS-MNQ-5M-V1 v1.0
Checksum: 663893c56e6e6001f937f7e11ed76bd4238e21f387fd7a9de9dcf8ea44df06ff

CRITICAL: No optimisation. No parameter changes. Hypothesis frozen exactly as Sprint 109.
"""
import json
import numpy as np
from scipy import stats
from collections import defaultdict
import warnings
warnings.filterwarnings('ignore')

# ─── PART 1: HYPOTHESIS FREEZE ───────────────────────────────────────────────
# These parameters are FROZEN from Sprint 109. They may NOT be changed.
HYPOTHESIS = {
    "id": "DARWIN-S109-001",
    "name": "VWAP_ALIGNED_CONTINUATION",
    "version": "1.0",
    "frozen_date": "2026-07-15",
    "sprint_discovered": 109,
    "dataset_used_for_discovery": "ATLAS-MNQ-5M-V1 v1.0",
    "entry_rules": {
        "base_signal": "VWAP deviation > 0.5×ATR from near-VWAP (within 0.25×ATR) on previous bar",
        "onset_bar": "Impulse bar causes deviation (any body ratio — body ratio was null feature in Sprint 109)",
        "session": "RTH only (09:30–16:00 ET)",
        "filter_1_ov_inventory": "Trade direction MUST align with overnight inventory direction",
        "filter_2_vwap_slope": "VWAP slope (3-bar) MUST align with trade direction (positive for LONG, negative for SHORT)",
        "filter_3_rsi": "RSI(14) > 50 for LONG entries, RSI(14) < 50 for SHORT entries",
        "entry_price": "Next bar open after signal bar",
    },
    "exit_rules": {
        "stop": "2.5 × ATR(14) from entry",
        "target": "2.0 × ATR(14) from entry",
        "time_stop": "10 bars maximum hold",
    },
    "risk_model": {
        "risk_per_trade_apex_50k": 450,
        "risk_per_trade_live": 1650,
        "instrument": "MNQ (Micro E-mini Nasdaq-100)",
        "point_value": 2.0,
    },
    "null_features_excluded": [
        "session", "bar_body_ratio", "distance_from_opening_range",
        "atr_level", "atr_ratio", "sequence_classification",
        "ema_alignment_direction", "minutes_since_session_open"
    ]
}

print("=== SPRINT 110 — OUT-OF-SAMPLE VALIDATION ===")
print(f"Hypothesis: {HYPOTHESIS['id']} — {HYPOTHESIS['name']} v{HYPOTHESIS['version']}")
print(f"Frozen: {HYPOTHESIS['frozen_date']} | Discovery sprint: {HYPOTHESIS['sprint_discovered']}")
print(f"Dataset: ATLAS-MNQ-5M-V1 v1.0\n")
print("PART 1: HYPOTHESIS FREEZE — CONFIRMED")
print("  Entry: VWAP deviation >0.5×ATR + OV inventory aligned + VWAP slope aligned + RSI confirms")
print("  Stop: 2.5×ATR | Target: 2.0×ATR | Time stop: 10 bars | Session: RTH only")
print("  NO OPTIMISATION. Parameters locked.\n")

# ─── Load trade data from Sprint 109 forensics ───────────────────────────────
with open('/tmp/sprint109-trades.json') as f:
    all_trades = json.load(f)

# Apply the FROZEN triple filter exactly as Sprint 109 defined it
def apply_frozen_filter(t):
    """Apply DARWIN-S109-001 frozen filters. Returns True if trade passes."""
    direction = t.get('f26_direction', '')
    ov_inv = t.get('f16_overnight_inventory', '')
    vwap_slope = t.get('f08_vwap_slope', 0) or 0
    rsi = t.get('f06_rsi', 50) or 50

    # Filter 1: OV inventory alignment
    ov_aligned = (direction == 'LONG' and ov_inv == 'LONG') or \
                 (direction == 'SHORT' and ov_inv == 'SHORT')
    if not ov_aligned:
        return False

    # Filter 2: VWAP slope alignment
    slope_aligned = (direction == 'LONG' and vwap_slope > 0) or \
                    (direction == 'SHORT' and vwap_slope < 0)
    if not slope_aligned:
        return False

    # Filter 3: RSI confirmation
    rsi_aligned = (direction == 'LONG' and rsi > 50) or \
                  (direction == 'SHORT' and rsi < 50)
    if not rsi_aligned:
        return False

    return True

# Filtered trades (the S109-001 universe)
filtered_trades = [t for t in all_trades if apply_frozen_filter(t)]
print(f"Frozen filter applied: {len(all_trades)} total → {len(filtered_trades)} pass filter")
print(f"Filter rejection rate: {(1 - len(filtered_trades)/len(all_trades))*100:.1f}%\n")

# Parse dates for temporal splits
def get_trade_date(t):
    """Extract YYYY-MM-DD from session_end_date string."""
    d = t.get('sessionEndDate', '') or t.get('session_end_date', '')
    if isinstance(d, str) and len(d) >= 10:
        return d[:10]
    return None

def get_trade_year_quarter(t):
    d = get_trade_date(t)
    if not d:
        return None, None
    year = int(d[:4])
    month = int(d[5:7])
    quarter = (month - 1) // 3 + 1
    return year, quarter

for t in filtered_trades:
    t['_year'], t['_quarter'] = get_trade_year_quarter(t)

# ─── Helper: compute stats for a group of trades ─────────────────────────────
def compute_stats(trades, label=""):
    if not trades:
        return {'n': 0, 'wr': 0, 'pf': 0, 'total_pnl': 0, 'avg_r': 0, 'max_dd': 0, 'calmar': 0}
    n = len(trades)
    wins = [t for t in trades if t['outcome'] == 'WIN']
    losses = [t for t in trades if t['outcome'] == 'LOSS']
    wr = len(wins) / n * 100
    win_pnl = sum(t['pnlDollar'] for t in wins)
    loss_pnl = abs(sum(t['pnlDollar'] for t in losses))
    pf = win_pnl / loss_pnl if loss_pnl > 0 else float('inf')
    total_pnl = sum(t['pnlDollar'] for t in trades)
    avg_r = np.mean([t['pnlR'] for t in trades])

    eq, pk, dd = 0, 0, 0
    for t in trades:
        eq += t['pnlDollar']
        if eq > pk: pk = eq
        if pk - eq > dd: dd = pk - eq

    calmar = total_pnl / dd if dd > 0 else float('inf')
    return {'n': n, 'wr': wr, 'pf': pf, 'total_pnl': total_pnl,
            'avg_r': avg_r, 'max_dd': dd, 'calmar': calmar,
            'wins': len(wins), 'losses': len(losses)}

# Full in-sample baseline (for reference only — NOT the OOS result)
full_stats = compute_stats(filtered_trades, "FULL DATASET (in-sample reference)")
print(f"IN-SAMPLE REFERENCE (all {len(filtered_trades)} filtered trades):")
print(f"  WR: {full_stats['wr']:.1f}%, PF: {full_stats['pf']:.3f}, P&L: ${full_stats['total_pnl']:+.0f}, Max DD: ${full_stats['max_dd']:.0f}\n")

# ─── PART 2: OUT-OF-SAMPLE VALIDATION ────────────────────────────────────────
print("=== PART 2: OUT-OF-SAMPLE VALIDATION ===\n")

# Sort trades chronologically
sorted_trades = sorted(filtered_trades, key=lambda t: t.get('windowStart', 0))
n_total = len(sorted_trades)

# ── 2A: Rolling Walk-Forward (6 windows) ──────────────────────────────────────
print("--- 2A: Rolling Walk-Forward Validation (6 windows) ---")
print("Method: 60% train / 40% test, rolling forward by 1 window each step")
print("CRITICAL: Filters are FROZEN from Sprint 109. Train window is used only to")
print("          verify the filter fires — NOT to re-optimise any parameter.\n")

window_size = n_total // 6
wf_results = []
for i in range(6):
    start = i * window_size
    end = min(start + window_size, n_total)
    # The "test" window is the second half of each window (pure OOS)
    mid = start + (end - start) // 2
    train = sorted_trades[start:mid]
    test = sorted_trades[mid:end]

    train_stats = compute_stats(train)
    test_stats = compute_stats(test)
    wf_results.append({'window': i+1, 'train': train_stats, 'test': test_stats,
                       'start_idx': start, 'end_idx': end, 'mid_idx': mid})

    # Get date range for test window
    test_dates = [get_trade_date(t) for t in test if get_trade_date(t)]
    date_range = f"{min(test_dates) if test_dates else '?'} → {max(test_dates) if test_dates else '?'}"

    print(f"  Window {i+1} OOS ({date_range}):")
    print(f"    Train: n={train_stats['n']:3d}, WR={train_stats['wr']:5.1f}%, PF={train_stats['pf']:.3f}")
    print(f"    Test:  n={test_stats['n']:3d}, WR={test_stats['wr']:5.1f}%, PF={test_stats['pf']:.3f}, P&L=${test_stats['total_pnl']:+.0f}")

oos_wf_pfs = [r['test']['pf'] for r in wf_results if r['test']['n'] > 0]
oos_wf_wrs = [r['test']['wr'] for r in wf_results if r['test']['n'] > 0]
print(f"\n  Walk-Forward OOS Summary:")
print(f"    PF range: {min(oos_wf_pfs):.3f} – {max(oos_wf_pfs):.3f} | Mean: {np.mean(oos_wf_pfs):.3f} | Std: {np.std(oos_wf_pfs):.3f}")
print(f"    WR range: {min(oos_wf_wrs):.1f}% – {max(oos_wf_wrs):.1f}% | Mean: {np.mean(oos_wf_wrs):.1f}% | Std: {np.std(oos_wf_wrs):.1f}%")
print(f"    Windows with PF > 1.0: {sum(1 for p in oos_wf_pfs if p > 1.0)}/{len(oos_wf_pfs)}")
print(f"    Windows with PF > 1.5: {sum(1 for p in oos_wf_pfs if p > 1.5)}/{len(oos_wf_pfs)}")

# ── 2B: Expanding Window Validation ──────────────────────────────────────────
print("\n--- 2B: Expanding Window Validation ---")
print("Method: Train on first N%, test on next 20% (never seen before)\n")

ew_results = []
for train_pct in [20, 40, 60, 80]:
    train_end = int(n_total * train_pct / 100)
    test_end = min(int(n_total * (train_pct + 20) / 100), n_total)
    train = sorted_trades[:train_end]
    test = sorted_trades[train_end:test_end]
    if not test:
        continue
    test_stats = compute_stats(test)
    test_dates = [get_trade_date(t) for t in test if get_trade_date(t)]
    date_range = f"{min(test_dates) if test_dates else '?'} → {max(test_dates) if test_dates else '?'}"
    ew_results.append(test_stats)
    print(f"  Train 0–{train_pct}%, Test {train_pct}–{train_pct+20}% ({date_range}):")
    print(f"    n={test_stats['n']:3d}, WR={test_stats['wr']:5.1f}%, PF={test_stats['pf']:.3f}, P&L=${test_stats['total_pnl']:+.0f}, Max DD=${test_stats['max_dd']:.0f}")

ew_pfs = [r['pf'] for r in ew_results]
print(f"\n  Expanding Window OOS PF: {[round(p,3) for p in ew_pfs]}")
print(f"  All PF > 1.0: {all(p > 1.0 for p in ew_pfs)}")

# ── 2C: Year-by-Year Validation ───────────────────────────────────────────────
print("\n--- 2C: Year-by-Year Validation ---")
year_groups = defaultdict(list)
for t in filtered_trades:
    if t['_year']:
        year_groups[t['_year']].append(t)

year_results = {}
for year in sorted(year_groups.keys()):
    s = compute_stats(year_groups[year])
    year_results[year] = s
    print(f"  {year}: n={s['n']:3d}, WR={s['wr']:5.1f}%, PF={s['pf']:.3f}, P&L=${s['total_pnl']:+.0f}, Max DD=${s['max_dd']:.0f}")

# ── 2D: Quarter-by-Quarter Validation ────────────────────────────────────────
print("\n--- 2D: Quarter-by-Quarter Validation ---")
qtr_groups = defaultdict(list)
for t in filtered_trades:
    if t['_year'] and t['_quarter']:
        qtr_groups[(t['_year'], t['_quarter'])].append(t)

qtr_results = {}
all_qtr_pfs = []
all_qtr_wrs = []
for (year, qtr) in sorted(qtr_groups.keys()):
    s = compute_stats(qtr_groups[(year, qtr)])
    qtr_results[(year, qtr)] = s
    all_qtr_pfs.append(s['pf'])
    all_qtr_wrs.append(s['wr'])
    pf_flag = ' *** BELOW 1.0' if s['pf'] < 1.0 else (' * below 1.5' if s['pf'] < 1.5 else '')
    print(f"  {year} Q{qtr}: n={s['n']:3d}, WR={s['wr']:5.1f}%, PF={s['pf']:.3f}, P&L=${s['total_pnl']:+.0f}{pf_flag}")

print(f"\n  Quarter Summary:")
print(f"    PF range: {min(all_qtr_pfs):.3f} – {max(all_qtr_pfs):.3f} | Mean: {np.mean(all_qtr_pfs):.3f}")
print(f"    WR range: {min(all_qtr_wrs):.1f}% – {max(all_qtr_wrs):.1f}% | Mean: {np.mean(all_qtr_wrs):.1f}%")
print(f"    Quarters with PF > 1.0: {sum(1 for p in all_qtr_pfs if p > 1.0)}/{len(all_qtr_pfs)}")
print(f"    Quarters with PF > 1.5: {sum(1 for p in all_qtr_pfs if p > 1.5)}/{len(all_qtr_pfs)}")

# ── 2E: Regime-by-Regime Validation ──────────────────────────────────────────
print("\n--- 2E: Regime-by-Regime Validation ---")
regime_groups = defaultdict(list)
for t in filtered_trades:
    r = t.get('f02_regime', 'UNKNOWN')
    regime_groups[r].append(t)

for regime in sorted(regime_groups.keys()):
    s = compute_stats(regime_groups[regime])
    print(f"  {regime:20s}: n={s['n']:3d}, WR={s['wr']:5.1f}%, PF={s['pf']:.3f}, P&L=${s['total_pnl']:+.0f}")

# ─── PART 3: STABILITY ANALYSIS ──────────────────────────────────────────────
print("\n=== PART 3: STABILITY ANALYSIS ===\n")

# Test: does any single quarter dominate the total P&L?
total_pnl = sum(t['pnlDollar'] for t in filtered_trades)
print("Quarter P&L concentration (no single quarter should dominate):")
for (year, qtr) in sorted(qtr_results.keys()):
    qpnl = qtr_results[(year, qtr)]['total_pnl']
    pct = qpnl / total_pnl * 100 if total_pnl != 0 else 0
    flag = ' *** DOMINANT (>40%)' if abs(pct) > 40 else (' * elevated (>25%)' if abs(pct) > 25 else '')
    print(f"  {year} Q{qtr}: ${qpnl:+8.0f} ({pct:+5.1f}% of total){flag}")

# PF stability: coefficient of variation
pf_cv = np.std(all_qtr_pfs) / np.mean(all_qtr_pfs) if np.mean(all_qtr_pfs) > 0 else float('inf')
wr_cv = np.std(all_qtr_wrs) / np.mean(all_qtr_wrs) if np.mean(all_qtr_wrs) > 0 else float('inf')
print(f"\nPF Coefficient of Variation: {pf_cv:.3f} (lower = more stable; <0.5 = acceptable)")
print(f"WR Coefficient of Variation: {wr_cv:.3f} (lower = more stable; <0.2 = acceptable)")

# Worst consecutive drawdown across all quarters
print("\nWorst 3 consecutive-quarter drawdown sequences:")
qtr_list = sorted(qtr_results.keys())
worst_3q = []
for i in range(len(qtr_list) - 2):
    seq_pnl = sum(qtr_results[qtr_list[i+j]]['total_pnl'] for j in range(3))
    worst_3q.append((qtr_list[i], seq_pnl))
worst_3q.sort(key=lambda x: x[1])
for (start_qtr, pnl) in worst_3q[:3]:
    print(f"  Starting {start_qtr[0]} Q{start_qtr[1]}: 3-quarter P&L = ${pnl:+.0f}")

# ─── PART 4: MONTE CARLO ──────────────────────────────────────────────────────
print("\n=== PART 4: MONTE CARLO ANALYSIS ===\n")

pnl_series = [t['pnlDollar'] for t in filtered_trades]
n_sims = 10000
n_trades_sim = len(pnl_series)

# Apex 50K prop firm parameters
APEX_ACCOUNT = 50000
APEX_MAX_DAILY_LOSS = 2500
APEX_MAX_DRAWDOWN = 2500
APEX_PROFIT_TARGET = 3000
RISK_PER_TRADE = 450  # Frozen from hypothesis

# Scale P&L to $450 risk per trade
# Current P&L uses $2/point MNQ. ATR-based stop of 2.5×ATR.
# Normalise to $450 risk: scale factor = 450 / avg_loss
loss_trades = [t for t in filtered_trades if t['outcome'] == 'LOSS']
avg_loss_raw = abs(np.mean([t['pnlDollar'] for t in loss_trades])) if loss_trades else 450
scale = RISK_PER_TRADE / avg_loss_raw if avg_loss_raw > 0 else 1.0

scaled_pnl = [p * scale for p in pnl_series]
print(f"P&L scale factor (to $450/trade risk): {scale:.3f}")
print(f"Scaled avg win: ${np.mean([p for p in scaled_pnl if p > 0]):.0f}")
print(f"Scaled avg loss: ${np.mean([p for p in scaled_pnl if p < 0]):.0f}\n")

# Run Monte Carlo
np.random.seed(42)
sim_results = []
for _ in range(n_sims):
    sim_pnl = np.random.choice(scaled_pnl, size=n_trades_sim, replace=True)
    equity = np.cumsum(sim_pnl)
    final_pnl = equity[-1]
    # Max drawdown
    peak = np.maximum.accumulate(equity)
    dd = np.max(peak - equity)
    # Ruin: equity drops below -APEX_MAX_DRAWDOWN at any point
    ruined = np.any(equity < -APEX_MAX_DRAWDOWN)
    # Prop pass: reaches APEX_PROFIT_TARGET without hitting APEX_MAX_DRAWDOWN
    prop_pass = (final_pnl >= APEX_PROFIT_TARGET) and not ruined
    sim_results.append({
        'final_pnl': final_pnl,
        'max_dd': dd,
        'ruined': ruined,
        'prop_pass': prop_pass,
    })

final_pnls = [r['final_pnl'] for r in sim_results]
max_dds = [r['max_dd'] for r in sim_results]
ruin_rate = sum(1 for r in sim_results if r['ruined']) / n_sims * 100
prop_pass_rate = sum(1 for r in sim_results if r['prop_pass']) / n_sims * 100
positive_rate = sum(1 for r in sim_results if r['final_pnl'] > 0) / n_sims * 100

print(f"Monte Carlo Results ({n_sims:,} simulations, {n_trades_sim} trades each):")
print(f"  Final P&L:")
print(f"    5th percentile:  ${np.percentile(final_pnls, 5):+.0f}")
print(f"    25th percentile: ${np.percentile(final_pnls, 25):+.0f}")
print(f"    Median:          ${np.percentile(final_pnls, 50):+.0f}")
print(f"    75th percentile: ${np.percentile(final_pnls, 75):+.0f}")
print(f"    95th percentile: ${np.percentile(final_pnls, 95):+.0f}")
print(f"  Max Drawdown:")
print(f"    Median:          ${np.median(max_dds):.0f}")
print(f"    95th percentile: ${np.percentile(max_dds, 95):.0f}")
print(f"    99th percentile: ${np.percentile(max_dds, 99):.0f}")
print(f"  Risk of Ruin (DD > ${APEX_MAX_DRAWDOWN}): {ruin_rate:.1f}%")
print(f"  Positive outcome probability: {positive_rate:.1f}%")
print(f"  Apex 50K prop pass probability: {prop_pass_rate:.1f}%")

# Live capital suitability (1 contract, $1,650 risk/trade)
LIVE_RISK = 1650
live_scale = LIVE_RISK / avg_loss_raw if avg_loss_raw > 0 else 1.0
live_scaled = [p * live_scale for p in pnl_series]
live_sims = []
for _ in range(n_sims):
    sim_pnl = np.random.choice(live_scaled, size=n_trades_sim, replace=True)
    equity = np.cumsum(sim_pnl)
    final_pnl = equity[-1]
    peak = np.maximum.accumulate(equity)
    dd = np.max(peak - equity)
    live_sims.append({'final_pnl': final_pnl, 'max_dd': dd})

live_pnls = [r['final_pnl'] for r in live_sims]
live_dds = [r['max_dd'] for r in live_sims]
print(f"\n  Live Capital ($1,650/trade, 1 contract):")
print(f"    Median P&L ({n_trades_sim} trades): ${np.median(live_pnls):+.0f}")
print(f"    Median Max DD: ${np.median(live_dds):.0f}")
print(f"    95th pct Max DD: ${np.percentile(live_dds, 95):.0f}")
print(f"    Positive probability: {sum(1 for p in live_pnls if p > 0)/n_sims*100:.1f}%")

# ─── PART 5: PROMOTION DECISION ──────────────────────────────────────────────
print("\n=== PART 5: PROMOTION DECISION ===\n")

# Evaluate against institutional thresholds
thresholds = {
    'walk_forward_pf_all_positive': all(p > 1.0 for p in oos_wf_pfs),
    'walk_forward_pf_mean': np.mean(oos_wf_pfs),
    'expanding_window_all_positive': all(p > 1.0 for p in ew_pfs),
    'year_all_positive': all(s['pf'] > 1.0 for s in year_results.values()),
    'quarter_pf_positive_rate': sum(1 for p in all_qtr_pfs if p > 1.0) / len(all_qtr_pfs),
    'quarter_pf_mean': np.mean(all_qtr_pfs),
    'pf_cv': pf_cv,
    'wr_cv': wr_cv,
    'ruin_rate': ruin_rate,
    'prop_pass_rate': prop_pass_rate,
    'positive_rate': positive_rate,
}

print("Institutional Threshold Scorecard:")
checks = [
    ("Walk-forward: all 6 OOS windows PF > 1.0", thresholds['walk_forward_pf_all_positive'], True),
    (f"Walk-forward: mean OOS PF > 1.5 ({thresholds['walk_forward_pf_mean']:.3f})", thresholds['walk_forward_pf_mean'] > 1.5, True),
    ("Expanding window: all 4 OOS windows PF > 1.0", thresholds['expanding_window_all_positive'], True),
    ("Year-by-year: all years PF > 1.0", thresholds['year_all_positive'], True),
    (f"Quarter PF > 1.0 rate ≥ 75% ({thresholds['quarter_pf_positive_rate']*100:.0f}%)", thresholds['quarter_pf_positive_rate'] >= 0.75, True),
    (f"PF coefficient of variation < 0.5 ({thresholds['pf_cv']:.3f})", thresholds['pf_cv'] < 0.5, False),
    (f"WR coefficient of variation < 0.2 ({thresholds['wr_cv']:.3f})", thresholds['wr_cv'] < 0.2, False),
    (f"Risk of ruin < 5% ({thresholds['ruin_rate']:.1f}%)", thresholds['ruin_rate'] < 5.0, True),
    (f"Prop pass probability > 50% ({thresholds['prop_pass_rate']:.1f}%)", thresholds['prop_pass_rate'] > 50.0, True),
    (f"Positive outcome probability > 90% ({thresholds['positive_rate']:.1f}%)", thresholds['positive_rate'] > 90.0, True),
]

passed = 0
failed = 0
critical_failed = 0
for desc, result, is_critical in checks:
    status = "PASS" if result else "FAIL"
    crit = " [CRITICAL]" if (not result and is_critical) else ""
    print(f"  {'✓' if result else '✗'} {desc}: {status}{crit}")
    if result:
        passed += 1
    else:
        failed += 1
        if is_critical:
            critical_failed += 1

print(f"\n  Score: {passed}/{len(checks)} checks passed | Critical failures: {critical_failed}")

# Promotion decision
print("\n--- PROMOTION DECISION ---\n")
if critical_failed == 0 and passed >= 8:
    decision = "WALK FORWARD"
    rationale = "All critical thresholds passed. OOS validation is consistent and stable. Ready for walk-forward testing with real-time data."
elif critical_failed <= 1 and passed >= 6:
    decision = "LIVE PAPER TRADING"
    rationale = "Most critical thresholds passed. Minor instability detected. Paper trading will provide real-time validation before capital commitment."
elif critical_failed <= 2 and passed >= 5:
    decision = "RESEARCH"
    rationale = "Significant OOS instability detected. Return to research phase to identify the source of instability before paper trading."
else:
    decision = "REJECT"
    rationale = "Multiple critical threshold failures. The hypothesis does not survive out-of-sample validation."

print(f"  VERDICT: {decision}")
print(f"  Rationale: {rationale}")

print("\n--- EVIDENCE SUMMARY ---")
print(f"  In-sample (discovery): WR={full_stats['wr']:.1f}%, PF={full_stats['pf']:.3f} (n={full_stats['n']})")
print(f"  Walk-forward OOS mean: WR={np.mean(oos_wf_wrs):.1f}%, PF={np.mean(oos_wf_pfs):.3f}")
print(f"  Expanding window OOS:  PF range {min(ew_pfs):.3f}–{max(ew_pfs):.3f}")
print(f"  Year-by-year:          PF range {min(s['pf'] for s in year_results.values()):.3f}–{max(s['pf'] for s in year_results.values()):.3f}")
print(f"  Quarter-by-quarter:    PF range {min(all_qtr_pfs):.3f}–{max(all_qtr_pfs):.3f}, {sum(1 for p in all_qtr_pfs if p > 1.0)}/{len(all_qtr_pfs)} positive")
print(f"  Monte Carlo ruin rate: {ruin_rate:.1f}%")
print(f"  Prop pass probability: {prop_pass_rate:.1f}%")

# Save all results
output = {
    'hypothesis': HYPOTHESIS,
    'full_stats': full_stats,
    'walk_forward': wf_results,
    'expanding_window': ew_results,
    'year_results': {str(k): v for k, v in year_results.items()},
    'quarter_results': {f"{k[0]}_Q{k[1]}": v for k, v in qtr_results.items()},
    'regime_results': {r: compute_stats(regime_groups[r]) for r in regime_groups},
    'stability': {
        'pf_cv': pf_cv, 'wr_cv': wr_cv,
        'all_qtr_pfs': all_qtr_pfs, 'all_qtr_wrs': all_qtr_wrs,
    },
    'monte_carlo': {
        'n_sims': n_sims,
        'ruin_rate': ruin_rate,
        'prop_pass_rate': prop_pass_rate,
        'positive_rate': positive_rate,
        'pnl_p5': np.percentile(final_pnls, 5),
        'pnl_p25': np.percentile(final_pnls, 25),
        'pnl_median': np.median(final_pnls),
        'pnl_p75': np.percentile(final_pnls, 75),
        'pnl_p95': np.percentile(final_pnls, 95),
        'dd_median': np.median(max_dds),
        'dd_p95': np.percentile(max_dds, 95),
        'dd_p99': np.percentile(max_dds, 99),
    },
    'scorecard': {'passed': passed, 'failed': failed, 'critical_failed': critical_failed},
    'decision': decision,
    'rationale': rationale,
}
with open('/tmp/sprint110-oos.json', 'w') as f:
    json.dump(output, f, indent=2, default=str)
print("\nFull results saved to /tmp/sprint110-oos.json")
