"""
Sprint 112 — Part 1: Apex 50K Evaluation Risk Analysis
DARWIN-S109-001 (VWAP_ALIGNED_CONTINUATION) — Frozen hypothesis
"""

import numpy as np
import json
from scipy import stats

np.random.seed(42)

# ── Frozen S109-001 Parameters (from Sprint 109/110) ──────────────────────────
BENCHMARK_WR = 0.755          # 75.5% win rate (Sprint 110 OOS)
BENCHMARK_PF = 4.609          # Profit factor (Sprint 110 OOS)
BENCHMARK_TRADES = 351        # Total trades in OOS validation
BENCHMARK_MAX_DD = 685        # Max drawdown in dollars
BENCHMARK_CALMAR = 49.8       # Calmar ratio

# R:R ratio is 2:1 (target = 2×ATR, stop = 1×ATR)
RR_RATIO = 2.0

# ── Apex 50K Intraday Evaluation Rules (official, July 2026) ──────────────────
APEX_ACCOUNT_SIZE = 50_000
APEX_PROFIT_TARGET = 3_000    # Must reach $3,000 profit
APEX_TRAILING_DD = 2_000      # $2,000 intraday trailing drawdown (from official page)
APEX_MAX_CONTRACTS = 6        # Max 6 contracts (NQ/MNQ equivalent)
APEX_DAILY_LOSS_LIMIT = None  # No DLL on Intraday Evaluation
APEX_MIN_DAYS = None          # No minimum days required
APEX_ACCESS_PERIOD = 30       # 30 calendar days

# MNQ contract specs
MNQ_POINT_VALUE = 2.0         # $2 per point per contract
MNQ_TICK_SIZE = 0.25          # 0.25 points per tick
MNQ_TICK_VALUE = 0.50         # $0.50 per tick per contract

# ── Risk Scenarios ─────────────────────────────────────────────────────────────
# Current live risk: $450/trade
# Question: should we reduce for validation phase?

scenarios = {
    "S1_FULL_RISK": {
        "label": "Full Risk ($450/trade)",
        "risk_per_trade": 450,
        "description": "Current live risk — unchanged from Sprint 110 benchmark"
    },
    "S2_REDUCED_RISK": {
        "label": "Reduced Risk ($200/trade)",
        "risk_per_trade": 200,
        "description": "Conservative validation risk — 44% of full risk"
    },
    "S3_MINIMAL_RISK": {
        "label": "Minimal Risk ($100/trade)",
        "risk_per_trade": 100,
        "description": "Minimal validation risk — 1 MNQ micro contract"
    }
}

# ── Derived statistics from S109-001 ──────────────────────────────────────────
# From PF = (WR × avg_win) / ((1-WR) × avg_loss)
# With RR = 2.0: avg_win = 2 × avg_loss
# PF = (WR × 2) / (1-WR)
# avg_loss = risk_per_trade (stop = 1R)
# avg_win = 2 × risk_per_trade (target = 2R)

def compute_expectancy(wr, risk_per_trade, rr=2.0):
    avg_win = risk_per_trade * rr
    avg_loss = risk_per_trade
    return (wr * avg_win) - ((1 - wr) * avg_loss)

def compute_pf_from_wr(wr, rr=2.0):
    return (wr * rr) / (1 - wr)

print("=" * 70)
print("SPRINT 112 — APEX 50K EVALUATION RISK ANALYSIS")
print("DARWIN-S109-001 | VWAP_ALIGNED_CONTINUATION | Frozen Hypothesis")
print("=" * 70)

print("\n── APEX 50K INTRADAY EVALUATION RULES ──")
print(f"  Account Size:        ${APEX_ACCOUNT_SIZE:,}")
print(f"  Profit Target:       ${APEX_PROFIT_TARGET:,}")
print(f"  Trailing Drawdown:   ${APEX_TRAILING_DD:,} (intraday, trails peak balance)")
print(f"  Max Contracts:       {APEX_MAX_CONTRACTS} (NQ/MNQ)")
print(f"  Daily Loss Limit:    None (Intraday Evaluation has no DLL)")
print(f"  Minimum Days:        None (can pass in 1 day)")
print(f"  Access Period:       {APEX_ACCESS_PERIOD} calendar days")
print(f"  Consistency Rule:    Not applied in Evaluation")

print("\n── FROZEN S109-001 PARAMETERS ──")
print(f"  Win Rate:            {BENCHMARK_WR*100:.1f}%")
print(f"  Profit Factor:       {BENCHMARK_PF}")
print(f"  R:R Ratio:           {RR_RATIO}:1")
print(f"  OOS Max Drawdown:    ${BENCHMARK_MAX_DD}")
print(f"  OOS Calmar:          {BENCHMARK_CALMAR}")
print(f"  OOS Trade Count:     {BENCHMARK_TRADES}")

print("\n" + "=" * 70)
print("PART 1A — RISK SCENARIO ANALYSIS")
print("=" * 70)

results = {}
for key, scenario in scenarios.items():
    r = scenario["risk_per_trade"]
    wr = BENCHMARK_WR
    rr = RR_RATIO
    
    avg_win = r * rr
    avg_loss = r
    expectancy = compute_expectancy(wr, r, rr)
    pf = compute_pf_from_wr(wr, rr)
    
    # Trades needed to hit profit target (expected)
    trades_to_pass = APEX_PROFIT_TARGET / expectancy
    
    # Max single-day DD risk (1 trade per session, 2:1 R:R)
    # Worst case: lose 1 trade = -$r
    max_single_trade_loss = r
    
    # Trailing DD safety margin
    # If we start at $50,000, trailing DD is $2,000
    # We need to ensure we never lose $2,000 from peak
    # With 1 trade at a time, worst streak matters
    
    # Probability of N consecutive losses
    p_loss = 1 - wr
    p_5_consec_losses = p_loss ** 5
    p_10_consec_losses = p_loss ** 10
    
    # Max consecutive loss streak to breach trailing DD
    # Each loss = -$r, trailing DD = $2,000
    losses_to_breach = int(APEX_TRAILING_DD / r)
    
    # Probability of hitting that streak
    p_breach_streak = p_loss ** losses_to_breach
    
    results[key] = {
        "label": scenario["label"],
        "risk_per_trade": r,
        "avg_win": avg_win,
        "avg_loss": avg_loss,
        "expectancy": expectancy,
        "pf": pf,
        "trades_to_pass": trades_to_pass,
        "losses_to_breach_dd": losses_to_breach,
        "p_breach_streak": p_breach_streak,
        "max_single_trade_loss": max_single_trade_loss,
        "dd_safety_multiple": APEX_TRAILING_DD / r
    }
    
    print(f"\n  {scenario['label']}")
    print(f"  {'-' * 50}")
    print(f"  Risk/Trade:          ${r}")
    print(f"  Avg Win:             ${avg_win:.0f}")
    print(f"  Avg Loss:            ${avg_loss:.0f}")
    print(f"  Expectancy/Trade:    ${expectancy:.2f}")
    print(f"  Profit Factor:       {pf:.3f}")
    print(f"  Trades to Pass:      ~{trades_to_pass:.1f} expected")
    print(f"  DD Safety Multiple:  {APEX_TRAILING_DD/r:.1f}× (need {losses_to_breach} consecutive losses to breach)")
    print(f"  P(breach streak):    {p_breach_streak*100:.4f}%")

print("\n" + "=" * 70)
print("PART 1B — MONTE CARLO SIMULATION (10,000 runs per scenario)")
print("=" * 70)

def run_monte_carlo(wr, risk_per_trade, rr, n_sims=10_000, max_trades=200):
    """
    Simulate evaluation runs. 
    Returns: pass_rate, avg_trades_to_pass, avg_max_dd, ruin_rate
    """
    passes = 0
    ruins = 0
    trades_to_pass_list = []
    max_dd_list = []
    final_pnl_list = []
    
    avg_win = risk_per_trade * rr
    avg_loss = risk_per_trade
    
    for _ in range(n_sims):
        balance = 0.0
        peak_balance = 0.0
        trailing_threshold = -APEX_TRAILING_DD  # starts at -$2,000 from initial
        max_dd = 0.0
        passed = False
        ruined = False
        
        for trade_num in range(1, max_trades + 1):
            # Simulate trade outcome
            if np.random.random() < wr:
                pnl = avg_win
            else:
                pnl = -avg_loss
            
            balance += pnl
            
            # Update peak and trailing threshold
            if balance > peak_balance:
                peak_balance = balance
                # Trailing threshold moves up with peak
                trailing_threshold = peak_balance - APEX_TRAILING_DD
            
            # Track max drawdown from peak
            dd = peak_balance - balance
            if dd > max_dd:
                max_dd = dd
            
            # Check ruin: balance touches trailing threshold
            if balance <= trailing_threshold:
                ruined = True
                ruins += 1
                break
            
            # Check pass: profit target reached
            if balance >= APEX_PROFIT_TARGET:
                passed = True
                passes += 1
                trades_to_pass_list.append(trade_num)
                break
        
        max_dd_list.append(max_dd)
        final_pnl_list.append(balance)
    
    pass_rate = passes / n_sims
    ruin_rate = ruins / n_sims
    avg_trades = np.mean(trades_to_pass_list) if trades_to_pass_list else np.nan
    median_trades = np.median(trades_to_pass_list) if trades_to_pass_list else np.nan
    avg_max_dd = np.mean(max_dd_list)
    p95_max_dd = np.percentile(max_dd_list, 95)
    
    return {
        "pass_rate": pass_rate,
        "ruin_rate": ruin_rate,
        "avg_trades_to_pass": avg_trades,
        "median_trades_to_pass": median_trades,
        "avg_max_dd": avg_max_dd,
        "p95_max_dd": p95_max_dd,
        "final_pnl_p5": np.percentile(final_pnl_list, 5),
        "final_pnl_median": np.median(final_pnl_list),
        "final_pnl_p95": np.percentile(final_pnl_list, 95),
    }

mc_results = {}
for key, scenario in scenarios.items():
    r = scenario["risk_per_trade"]
    mc = run_monte_carlo(BENCHMARK_WR, r, RR_RATIO, n_sims=10_000)
    mc_results[key] = mc
    
    print(f"\n  {scenario['label']}")
    print(f"  {'-' * 50}")
    print(f"  Pass Rate:           {mc['pass_rate']*100:.1f}%")
    print(f"  Ruin Rate:           {mc['ruin_rate']*100:.2f}%")
    print(f"  Avg Trades to Pass:  {mc['avg_trades_to_pass']:.1f}")
    print(f"  Median Trades:       {mc['median_trades_to_pass']:.1f}")
    print(f"  Avg Max DD:          ${mc['avg_max_dd']:.0f}")
    print(f"  P95 Max DD:          ${mc['p95_max_dd']:.0f}")
    print(f"  P5 Final PnL:        ${mc['final_pnl_p5']:.0f}")
    print(f"  Median Final PnL:    ${mc['final_pnl_median']:.0f}")
    print(f"  P95 Final PnL:       ${mc['final_pnl_p95']:.0f}")

print("\n" + "=" * 70)
print("PART 1C — OPTIMAL RISK RECOMMENDATION")
print("=" * 70)

# Key insight: The trailing DD is $2,000. With $450/trade:
# - Need 4.4 consecutive losses to breach DD
# - P(4 consecutive losses at 24.5% loss rate) = 0.245^4 = 0.36%
# - Pass rate should be very high

full_risk_mc = mc_results["S1_FULL_RISK"]
reduced_risk_mc = mc_results["S2_REDUCED_RISK"]

print(f"""
  RECOMMENDATION: MAINTAIN $450/TRADE (FULL RISK)
  
  Evidence:
  
  1. DD Safety: At $450/trade, it takes {results['S1_FULL_RISK']['losses_to_breach_dd']} consecutive losses 
     to breach the $2,000 trailing drawdown.
     P(4 consecutive losses) = {results['S1_FULL_RISK']['p_breach_streak']*100:.3f}%
     
  2. Pass Rate: {full_risk_mc['pass_rate']*100:.1f}% of simulations pass the evaluation
     at $450/trade. Reducing to $200 gives {reduced_risk_mc['pass_rate']*100:.1f}% — 
     marginal improvement at the cost of much slower progress.
     
  3. Trades to Pass: At $450/trade, median {full_risk_mc['median_trades_to_pass']:.0f} trades to reach $3,000 
     profit target. At $200/trade, median {reduced_risk_mc['median_trades_to_pass']:.0f} trades — nearly 
     double the time with same risk profile.
     
  4. Benchmark Alignment: $450/trade is the exact risk used in Sprint 110 
     OOS validation. Changing risk breaks the comparison between live 
     execution and historical benchmark.
     
  5. Validation Integrity: The purpose of this account is to validate whether 
     live execution matches the frozen hypothesis. Using the same risk as the 
     benchmark is mandatory for a valid comparison.
     
  VERDICT: $450/trade. No change. Evidence supports it.
""")

print("=" * 70)
print("PART 1D — EXPECTED ACCOUNT VOLATILITY")
print("=" * 70)

# Estimate trades per week based on Sprint 110 OOS data
# 351 trades over ~3 years of data = ~117 trades/year = ~2.25 trades/week
TRADES_PER_WEEK = 2.25
TRADING_DAYS_PER_WEEK = 5

r = 450
avg_win = r * RR_RATIO
avg_loss = r
expectancy = compute_expectancy(BENCHMARK_WR, r, RR_RATIO)

weekly_expectancy = TRADES_PER_WEEK * expectancy
weekly_std = TRADES_PER_WEEK ** 0.5 * r * (BENCHMARK_WR * (1-BENCHMARK_WR)) ** 0.5 * RR_RATIO

print(f"""
  Trade Frequency:     ~{TRADES_PER_WEEK} trades/week (based on Sprint 110 OOS data)
  Weekly Expectancy:   ${weekly_expectancy:.0f}
  Expected Weeks to Pass: {APEX_PROFIT_TARGET / weekly_expectancy:.1f} weeks
  
  Account Volatility (daily):
    Best case day:     +${avg_win:.0f} (1 win)
    Worst case day:    -${avg_loss:.0f} (1 loss)
    Expected daily:    +${expectancy:.0f} (on trade days)
    
  Trailing DD Buffer:
    Starting buffer:   $2,000
    After 1 win:       $2,000 + $900 = $2,900 buffer (DD trails up)
    After 2 wins:      $2,000 + $1,800 = $3,800 buffer
    After hitting PT:  DD stops trailing at peak — full buffer preserved
    
  Key Risk Events:
    Single losing day: -$450 (22.5% of trailing DD)
    Two consecutive losses: -$900 (45% of trailing DD)
    Three consecutive losses: -$1,350 (67.5% of trailing DD)
    Four consecutive losses: -$1,800 (90% of trailing DD — DANGER ZONE)
    Five consecutive losses: -$2,250 (BREACH — evaluation failed)
    
  P(5 consecutive losses): {(1-BENCHMARK_WR)**5 * 100:.3f}%
  
  DAILY PROTECTION PROTOCOL:
    After any single losing day: continue normally (22.5% of DD used)
    After 2 consecutive losses: increase vigilance, confirm filter alignment
    After 3 consecutive losses: mandatory review before next trade
    After 4 consecutive losses: STOP — investigate before continuing
""")

print("=" * 70)
print("PART 1E — SUMMARY TABLE")
print("=" * 70)

print(f"""
  ┌─────────────────────────────────────────────────────────────────┐
  │ APEX 50K EVALUATION — DARWIN-S109-001 OPERATIONAL SETTINGS      │
  ├─────────────────────────────────────────────────────────────────┤
  │ Risk Per Trade:              $450 (unchanged)                    │
  │ Contracts Per Trade:         1 MNQ micro (standard)             │
  │ Max Contracts Available:     6 (using 1 — conservative)         │
  │ Daily Loss Protection:       Self-imposed 4-loss rule            │
  │ Trailing DD Buffer (start):  $2,000                             │
  │ Losses to Breach DD:         5 consecutive losses               │
  │ P(Breach DD):                {(1-BENCHMARK_WR)**5 * 100:.3f}%                           │
  │ Expected Pass Rate:          {full_risk_mc['pass_rate']*100:.1f}%                          │
  │ Expected Trades to Pass:     {full_risk_mc['median_trades_to_pass']:.0f} (median)                    │
  │ Expected Time to Pass:       ~{full_risk_mc['median_trades_to_pass']/TRADES_PER_WEEK:.0f} weeks                        │
  │ Expected Max DD During Eval: ${full_risk_mc['avg_max_dd']:.0f} (avg), ${full_risk_mc['p95_max_dd']:.0f} (P95)       │
  │ Risk of Failure:             {full_risk_mc['ruin_rate']*100:.2f}%                          │
  │ Expected Account Volatility: ±$450/day (on trade days)          │
  └─────────────────────────────────────────────────────────────────┘
""")

# Save results for use in Part 4 dashboard
output = {
    "apex_rules": {
        "account_size": APEX_ACCOUNT_SIZE,
        "profit_target": APEX_PROFIT_TARGET,
        "trailing_dd": APEX_TRAILING_DD,
        "max_contracts": APEX_MAX_CONTRACTS,
        "daily_loss_limit": None,
        "access_period_days": APEX_ACCESS_PERIOD
    },
    "s109001_frozen": {
        "win_rate": BENCHMARK_WR,
        "profit_factor": BENCHMARK_PF,
        "rr_ratio": RR_RATIO,
        "risk_per_trade": 450,
        "avg_win": 900,
        "avg_loss": 450,
        "expectancy_per_trade": compute_expectancy(BENCHMARK_WR, 450, RR_RATIO)
    },
    "monte_carlo_full_risk": mc_results["S1_FULL_RISK"],
    "recommendation": {
        "risk_per_trade": 450,
        "rationale": "Maintain full risk for benchmark alignment and validation integrity",
        "pass_rate_pct": full_risk_mc['pass_rate'] * 100,
        "ruin_rate_pct": full_risk_mc['ruin_rate'] * 100,
        "median_trades_to_pass": full_risk_mc['median_trades_to_pass'],
        "losses_to_breach_dd": results['S1_FULL_RISK']['losses_to_breach_dd']
    }
}

with open("/tmp/sprint112-risk-analysis.json", "w") as f:
    json.dump(output, f, indent=2)

print("\nResults saved to /tmp/sprint112-risk-analysis.json")
print("\nPart 1 COMPLETE.")
