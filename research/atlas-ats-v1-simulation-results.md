# Atlas Trading System v1.0 — Simulation Results

**Date:** 2026-07-08
**Dataset:** MNQ 5-minute (July 2024 – July 2026)
**Objective:** Validate the complete, integrated Atlas Trading System v1.0 under realistic prop firm constraints.

---

## 1. The System Architecture Tested

ATS v1.0 integrates three independent Atlas modules into a single execution pipeline:

1. **Market Intelligence (Regime Engine v1.0):** Volatility Compression resolved + VWAP deviation.
2. **Execution Intelligence (Model A1):** Depth-Constrained Pullback following Volatility Expansion.
3. **Risk Intelligence (ARI v1.0):** Session constraints, daily loss limits, and consecutive loss reduction/blocking.

The simulation was run as a 10,000-iteration Monte Carlo to determine the probability of passing a $50,000 prop firm evaluation (Target: +$3,000 | Max Trailing DD: -$2,000 | Daily Loss Limit: -$2,000).

---

## 2. Simulation Results

The simulation progressed from a raw execution model to the fully integrated system.

### Experiment A: Model A1 Baseline (No ARI, No Session Filter)
* **Trades:** 290
* **Profit Factor:** 1.245
* **Net Profit:** +$22,611
* **Max Drawdown:** -$11,959
* **Prop Pass Rate:** 42.0%

### Experiment B: Model A1 + ARI Session Filter (PM only, No Fridays)
* **Trades:** 204
* **Profit Factor:** 1.459
* **Net Profit:** +$28,854
* **Max Drawdown:** -$7,621
* **Prop Pass Rate:** 52.3%

### Experiment C: Full ATS v1.0 (Session + ARI Capital Management)
* **Trades:** 196
* **Profit Factor:** 1.531
* **Net Profit:** +$30,114
* **Max Drawdown:** -$6,806
* **Prop Pass Rate:** 56.7%

---

## 3. Analysis: The Impact of ARI

The integration of Atlas Risk Intelligence (ARI) produced exactly the effect it was designed to achieve: it increased system expectancy by systematically cutting risk during unfavourable conditions.

1. **Drawdown Reduction:** ARI reduced the system's maximum historical drawdown from -$11,959 (Baseline) to -$6,806 (Full ATS). It achieved this by enforcing consecutive loss blocks and daily loss limits.
2. **Profit Factor Expansion:** By eliminating trades on Fridays and during the AM session, and by halving risk after 4 consecutive losses, the system PF expanded from 1.245 to 1.531.
3. **Prop Firm Pass Rate:** The probability of passing a $50k evaluation increased from 42.0% to 56.7%.

### The Year 1 Problem

The simulation revealed one critical structural weakness. The performance of ATS v1.0 is heavily skewed toward Year 2 of the dataset:

* **Year 1:** 90 trades | PF 0.956 | Net -$1,098
* **Year 2:** 106 trades | PF 1.985 | Net +$31,213

Year 1 was marginally negative. Year 2 was exceptionally profitable.

This confirms the finding from Sprint 026: Model A1 is highly regime-dependent. It performs exceptionally well when trend strength is low (ADX < 21) prior to the volatility expansion, which characterised much of Year 2. When the market is already in a high-ADX trending regime, the pullback depth constraint frequently fails, resulting in the Year 1 drawdown.

---

## 4. Verdict

**ATS v1.0 is operationally sound, but structurally incomplete.**

The integration of the Regime Engine, Model A1, and ARI functions exactly as designed. The system successfully enforces prop firm constraints and dynamically manages capital. The software architecture is validated.

However, the system relies entirely on a single execution model (Model A1). Because Model A1 struggles in high-ADX regimes (Year 1), the system as a whole struggles in high-ADX regimes.

**Conclusion:** ATS v1.0 does not need to be redesigned. It needs more execution models. A complete trading system cannot rely on a single market behaviour. To smooth the equity curve and improve the prop firm pass rate beyond 56.7%, Atlas must discover and validate a new execution model that specifically targets the high-ADX regimes where Model A1 is blocked.
