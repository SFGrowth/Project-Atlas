# Sprint 029 — Model A2 Candidate: Momentum Continuation

**Sprint Type:** Stream B — Execution Intelligence  
**Research Gate:** Does this increase Atlas's knowledge? YES. Does this improve the Atlas portfolio? UNKNOWN — this is what the sprint will determine.  
**Status:** In Progress  
**Date:** 2026-07-08

---

## Research Question

Can a Momentum Continuation model — entering long when multiple consecutive bars close near their highs within an established high-ADX trend — produce statistically significant edge in the market regimes where Model A1 underperforms?

---

## Hypothesis

**H-A2-001:** In a high-ADX trending environment (ADX > 30, full EMA trend alignment), a sequence of N consecutive bars each closing in the top X% of their range — excluding volatility climax bars — represents persistent institutional directional pressure. Entering in the direction of that pressure should produce positive expectancy because the signal captures continuation rather than reversal.

**Null Hypothesis:** The momentum continuation signal produces no statistically significant edge above random entry in high-ADX environments.

---

## Why This Behaviour Should Exist

In an established trending environment, institutional participants are executing directional orders across multiple bars. Each bar closing near its high (for longs) reflects that buying pressure is absorbing all selling throughout the bar — not just at the open. A sequence of such bars indicates that this pressure is persistent rather than a single spike. The absence of a volatility climax (bar range < 2.0 × ATR) confirms the move is controlled rather than exhausted.

---

## Why It Might Fail

The signal may fire at the end of a mature trend, just before exhaustion. High-ADX environments can transition abruptly to mean reversion. The signal has no structural anchor (no pullback, no level) — it enters into momentum, which means the stop placement is inherently less precise than Model A1's depth-constrained pullback.

---

## Test Design

### Regime Filter
- ADX(14) > 30
- EMA9 > EMA21 > EMA50 (full bullish trend alignment for longs; reversed for shorts)
- Session: 13:00–16:00 ET (consistent with Model A1 characterisation)
- Day filter: Monday–Thursday only (Friday excluded per Model A1 characterisation)

### Execution Trigger
- N consecutive bars each closing in the top X% of their range
- Test N ∈ {2, 3, 4}
- Test X ∈ {25%, 33%, 50%} (i.e., close > low + X% × range)
- Exclude climax bars: current bar range < 2.0 × ATR(14)

### Risk Management
Identical to Model A1 to isolate the entry logic:
- Stop: 1.0 × ATR(14) below entry close
- Target: 2.0 × ATR(14) above entry close (2:1 RR)
- Commission: $1.00 per side

### Portfolio Analysis
Every configuration that passes standalone acceptance criteria will be evaluated as a combined A1 + A2 portfolio:
- Combined equity curve
- Combined maximum drawdown
- Combined Profit Factor
- Portfolio Sharpe ratio (annualised)
- Correlation of trade outcomes between A1 and A2

---

## Acceptance Criteria

A candidate progresses only if it satisfies **all** of the following:

| Criterion | Threshold |
|---|---|
| Profit Factor | ≥ 1.20 |
| Year 1 Expectancy | Positive |
| Year 2 Expectancy | Positive |
| Trade Count | ≥ 100 over 2 years |
| Maximum Drawdown | Within prop-firm limits ($2,000 per contract) |
| Monte Carlo Pass Rate | Not materially worse than Model A1 (56.7%) |
| Parameter Sensitivity | Robust across neighbouring parameter values |
| Portfolio Benefit | Improved combined equity curve, reduced drawdown, or improved Sharpe/Sortino vs A1 alone |

---

## Failure Protocol

If Momentum Continuation fails all configurations, the findings are archived in the Knowledge Base and the next ranked candidate from the Sprint 028 Design Space Survey (Breakout Continuation) is tested immediately. The hypothesis is not redesigned or parameter-fished.

---

## Deliverables

1. Full parameter sweep results (9 configurations × long + short)
2. Year 1 / Year 2 sub-period stability
3. Monte Carlo simulation (10,000 runs)
4. Combined A1 + A2 portfolio analysis for any passing configuration
5. Formal verdict: PROMOTED, REJECTED, or ARCHIVED
