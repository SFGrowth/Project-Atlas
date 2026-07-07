# Sprint 021 — Stream B: Execution Intelligence Research Cycle 001

**Research Stream:** B — Execution Intelligence  
**Date:** 2026-07-08  
**Status:** In Progress  
**Researcher:** Orion (Atlas AI Architect)

---

## 1. Research Question

Which entry type — pullback continuation, liquidity sweep, breakout continuation, or mean reversion — produces the highest statistical expectancy when the Atlas Regime Engine v1.0 gives a PASS signal on MNQ 5-minute futures?

---

## 2. Hypotheses

Four independent hypotheses will be tested. Each entry type is a separate hypothesis. They compete on evidence alone.

| ID | Hypothesis |
|---|---|
| H-B001 | Pullback continuation entries (price retracing to EMA21 in a trending regime) produce a Profit Factor > 1.20 |
| H-B002 | Liquidity sweep entries (price sweeping a prior swing high/low then reversing) produce a Profit Factor > 1.20 |
| H-B003 | Breakout continuation entries (price closing above/below a swing high/low in a trending regime) produce a Profit Factor > 1.20 |
| H-B004 | Mean reversion entries (price deviating > 2 ATR from VWAP then returning) produce a Profit Factor > 1.20 |

---

## 3. Experimental Design

**Controlled variable:** The Atlas Regime Engine v1.0 filter (Volatility Compression + VWAP Deviation) is applied identically to all four hypotheses. Only the entry trigger changes.

**Dataset:** 140,933 bars of 5-minute MNQ futures data (July 2024 – July 2026).

**Exit rules (identical for all hypotheses):**
- Stop loss: 1.0 ATR from entry
- Take profit: 2.0 ATR from entry (2:1 reward/risk)
- Maximum holding: 12 bars (60 minutes)

**Minimum trade count:** 100 trades required for a result to be considered statistically valid.

**Acceptance criteria:** Profit Factor > 1.20, Max Drawdown < $2,000, Trade Count ≥ 100.

---

## 4. Metrics Reported for Every Hypothesis

Every result must report all 12 robustness metrics:
1. Net Profit
2. Profit Factor
3. Win Rate
4. Maximum Drawdown
5. Expectancy (per trade)
6. Trade Count
7. Average Winner
8. Average Loser
9. Largest Losing Streak
10. Long vs Short Performance
11. Session Performance (Opening / Mid-Morning / Afternoon)
12. Regime Performance (Compression vs Expansion)

---

## 5. Research Philosophy

Atlas does not seek confirmation. Atlas seeks evidence. Every hypothesis is assumed false until statistically supported. If evidence contradicts a hypothesis, Atlas rejects the hypothesis — not the evidence.

---

## 6. Acceptance Criteria

A hypothesis is accepted only if ALL of the following are true:

- Profit Factor > 1.20
- Maximum Drawdown < $2,000 (prop firm trailing drawdown limit)
- Trade Count ≥ 100
- No single session or regime accounts for > 60% of all profit (robustness check)
- Long and Short performance are both positive (no directional bias dependency)

---

## 7. Results

*To be completed after testing.*

---

## 8. Decision

*To be completed after Evidence Review.*

---

## 9. Lessons Learned

*To be completed after Decision.*
