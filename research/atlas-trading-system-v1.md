# Atlas Trading System (ATS) v1.0 — Architecture

## The Mission

The objective of Atlas has shifted from discovering market behaviour to building a complete trading system capable of consistently passing and scaling prop firm evaluations.

ATS v1.0 integrates every validated component from Streams A, B, and C into a single, cohesive operating system. The system is judged on system expectancy, drawdown survival, and psychological simplicity—not isolated component metrics.

---

## The 7-Question Decision Framework

Before any order is placed, ATS v1.0 must answer seven questions in strict sequence. If any question returns a negative or blocking response, the sequence terminates and no trade is placed.

| Step | Question | Engine | Core Rules |
|---|---|---|---|
| 1 | Is the market tradeable? | Market Regime Engine v1.0 | Volatility Compression must be resolved (ATR Ratio > 0.7). Price must not be overextended (VWAP Deviation ≤ 1.5 ATR). |
| 2 | Is Model A1 appropriate for this environment? | Execution Model A1 Specification | Time must be PM Session (13:00–16:00 ET). Day must not be Friday. Trend Strength must be low at entry (ADX ≤ 21.0). |
| 3 | Is current account risk acceptable? | Atlas Risk Intelligence (ARI) | Current daily loss must be < $1,000. Current open drawdown must be > $1,500 above the prop firm trailing limit. Consecutive losses must be < 6. |
| 4 | What position size is justified? | ARI Capital Allocation | Base risk is 1.0% ($500 on a $50k account). If consecutive losses reach 4 or 5, risk is reduced to 0.5% ($250). |
| 5 | Should Atlas execute this trade? | Execution Model A1 Logic | Volatility Expansion (C-STR-001) triggered (`ATR(5) / ATR(5)[20] > 1.8`). Depth-Constrained Pullback (C-TRG-001) triggered (`0.5 to 1.2 ATR` depth to EMA21). |
| 6 | How should the trade be managed? | Trade Management Logic | Hard stop placed at entry price ± 1.5 ATR. Take profit placed at 1:1.5 to 1:2.0 Reward/Risk ratio. No discretionary intervention permitted. |
| 7 | When should trading stop for the day? | ARI Daily Limits | Stop trading if daily loss limit is hit, if daily profit target is hit, or at 15:55 ET regardless of outcome. |

---

## System Optimisation Objective

ATS v1.0 is not optimised for Profit Factor. It is optimised for **System Expectancy and Survival**.

The primary metric of success is the **Prop Firm Pass Rate** — the mathematical probability that the system reaches a $3,000 profit target before hitting a $2,000 trailing drawdown limit, measured over thousands of Monte Carlo simulations.

## Parallel Research

While ATS v1.0 operates, the core Atlas architecture remains frozen. Research continues in parallel:
- Stream D validates new components.
- Stream B builds Model A2.
- Stream E discovers new hypotheses.

ATS v1.0 remains completely stable until a new component or model has been independently validated and formally promoted to the live system.
