# USER-STRAT-002-EMA9-VWAP-MOMENTUM — Baseline Experiment Contract

**Status:** PRE_REGISTERED (frozen before any results)
**Sprint:** 123A.14 (correction)
**Experiment ID:** USER-STRAT-002-EMA9-VWAP-MOMENTUM
**Gate:** G14
**Date:** 2026-07-30

---

## Strategy Definition (Exact — No Modifications Permitted)

### Market
MNQ (Micro E-mini Nasdaq-100 Futures)

### Timeframe
5-minute bars

### Alignment Condition

**Long alignment:**
```
CLOSE > EMA9 AND EMA9 > SESSION_VWAP
```

**Short alignment:**
```
CLOSE < EMA9 AND EMA9 < SESSION_VWAP
```

### Entry Rule
A completed 5-minute candle must make a **fresh transition** to the correct alignment state (i.e., the previous bar was NOT in the correct alignment, and the current bar IS). Enter at the **next 5-minute bar open**.

### Exit Rule — Primary Version (No Fixed Target)

**Long exit:** Exit at the first causal bar where `LOW <= EMA9` (EMA9 touch from above). Exit at the EMA9 value at that bar (not the bar open).

**Short exit:** Exit at the first causal bar where `HIGH >= EMA9` (EMA9 touch from below). Exit at the EMA9 value at that bar.

**Session close:** If no EMA9 touch occurs before the end of the CME session (23:00 UTC), exit at the last bar close.

### Exit Rule — Secondary Safety Version (2 ATR Emergency Stop)
Same as primary, but with an additional emergency stop at **2 × ATR14** from entry price. If the emergency stop is hit before the EMA9 touch, exit at the stop price. Report separately from primary version.

### What Is NOT Used
- No EMA21
- No EMA50
- No ADX filter
- No fixed take-profit target
- No crossover-candle stop
- No RTH-only filter (full CME session baseline)
- No VWAP proximity filter
- No weekday filter

### Session
Full CME session (Sunday 23:00 UTC to Friday 22:00 UTC). No session filter applied in the primary baseline.

### Execution
- Entry: next 5m bar open + 2-tick adverse slippage (0.50 pts)
- Exit: EMA9 touch price − 2-tick adverse slippage (0.50 pts)
- Commission: $1.24 round-trip
- MNQ point value: $2.00
- MNQ tick size: 0.25 pts

---

## Dataset

- **Source:** Databento GLBX.MDP3 OHLCV-5m (canonical)
- **File:** `/home/ubuntu/atlas-historical/canonical/mnq_5m_full_2019_2026.parquet`
- **Period:** 2019-05-06 to 2026-07-20
- **Bars:** 508,903

---

## Required Metrics (Pre-Registered)

1. Total signals generated
2. Filled trades (transitions that resulted in a completed trade)
3. Trades per week
4. Win rate
5. Profit factor
6. Expectancy ($/trade)
7. Total net P&L
8. Maximum drawdown
9. Average win
10. Average loss
11. Maximum win
12. Maximum loss
13. Holding-time distribution (bars held histogram)
14. Long results (trades, expectancy, win rate, PF)
15. Short results (trades, expectancy, win rate, PF)
16. Session results (NY_RTH, LONDON, ASIA, AFTER_HOURS)
17. Year-by-year results (2019–2026)
18. Untouched validation expectancy (60/40 chronological split, validation = 2025-05-01+)
19. Bootstrap 95% confidence interval on expectancy
20. Walk-forward result (training vs validation expectancy)
21. ATR-reach analysis: % of trades reaching 1 ATR, 2 ATR, 3 ATR, 5 ATR before EMA9 return

---

## Statistical Gates

**SUPPORTED classification requires:**
- Bootstrap 95% CI lower bound > **$0** (positive-edge gate, stricter than prior experiments)
- Permutation p < 0.10
- Validation expectancy > $0
- Minimum 50 trades

**PROMISING:** CI lower bound > −$10 but fails positive-edge gate
**NOT_SUPPORTED:** CI lower bound ≤ −$10

---

## Authority

```
DARWIN_DECISION_AUTHORITY: DISABLED
DARWIN_EXECUTION_AUTHORITY: DISABLED
LIVE_TRADES_INITIATED: 0
PARAMETER_CHANGED_AFTER_PREREGISTRATION: false
```

---

## Superseded Experiment

The STRAT-9EMA-002 experiment in `docs/research/strategies/9ema-vwap/` is marked SUPERSEDED. It tested a different strategy (15m EMA9/21/50 crossover with ADX and 2R target) and must not be treated as evidence for this strategy.

---

## Merge Gate

**Do not merge to main without Phil's written approval.**
