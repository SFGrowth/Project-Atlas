# Project Atlas

## Status

Foundation documentation created on 2026-07-04.

## Identity

Project Atlas is a professional quantitative market assessment platform for MNQ futures.

Atlas is not a generic TradingView indicator.

Atlas is not designed to predict markets.

Atlas exists to assess market conditions, improve decision quality, reduce unnecessary trades, preserve capital, and support the long-term objective of passing and scaling prop firm evaluations.

## Primary Mission

Maximise the probability of passing and scaling prop firm evaluations while preserving capital.

Every module, rule, signal, alert, dashboard element, workflow, and automation feature must support that mission.

## The Final Principle

**Atlas does not search for perfect strategies. Atlas discovers durable market truths. Strategies are temporary combinations of validated knowledge.**

If we remain disciplined and continue building Atlas one validated hypothesis at a time, we are creating a platform that will continue improving for many years rather than chasing the next optimisation.

## The Knowledge Principle

**Atlas does not build features. Atlas discovers knowledge. Features are simply the implementation of validated knowledge.**

The primary output of Atlas is no longer code. The primary output of Atlas is knowledge. Code simply implements validated knowledge.

## The Understanding Principle

**Atlas must never optimise for a strategy. Atlas must optimise for understanding.**

Every engine should improve Atlas' ability to understand the market. Every validated improvement should make every future strategy better.

## The Evidence Principle

**Popularity is not evidence. Authority is not evidence. Reputation is not evidence. Only repeatable statistical validation earns a permanent place in Atlas.**

Every future hypothesis, regardless of who proposed it, must be subjected to the same rigorous research process. There are no exceptions.

## The Validation Principle

**A model may be validated. A model is not trusted until it survives independent validation.**

Discovering a statistical edge in a backtest is only the first milestone (Validation). The model must then survive rigorous attempts to break it—through out-of-sample testing, walk-forward analysis, parameter sensitivity checks, and stress testing—before it earns the right to be promoted to a trusted Execution Model. Atlas must never confuse a validated hypothesis with a trusted model.

## The Characterisation Principle

**A validated execution model is not simply a set of entry rules. It is a statistically characterised market behaviour with clearly defined operating conditions.**

Before any trusted model is allocated capital, it must be fully characterised. Atlas must understand exactly when the model performs best and when it should stand aside—decomposed by session, day of week, volatility quartile, and trend strength. Every future execution model must undergo this characterisation process before being trusted with capital.

## The Atlas Test

Before any feature is accepted into Atlas, it must answer these questions:

1. Does this improve decision quality?
2. Does this reduce unnecessary trades?
3. Can this be objectively tested?
4. Does this improve long-term expectancy?
5. Does this help preserve capital during prop firm evaluations and scaling?

If the answer is unclear, the feature must remain experimental.

If the answer is no, the feature must be challenged or rejected.

## Founding Principles

Atlas is governed by these principles:

- Clarity before capital
- Evidence before ego
- Simplicity before complexity
- Test before trust
- Protect capital first
- Software quality over feature count
- Robustness over novelty
- Fewer high-quality decisions over more low-quality signals
- Standing down is a valid output

## Personal Why

Atlas exists to support a better life, not to become a source of stress.

The deeper objective is freedom:

- More time with Sammi
- More time with the boys
- More capacity to train properly
- Better health
- Lower stress
- A disciplined project Phil can be proud of

Money is not the end goal. Money is a tool that creates freedom.

Atlas must therefore protect the trader from behaviours that damage freedom: overtrading, emotional execution, unnecessary risk, rule violations, and poorly tested complexity.

## Source of Truth

The GitHub repository is the source of truth.

The chat supports the repository.

The repository does not support the chat.

Any important project decision should eventually be captured in the repository as documentation, code, schema, tests, or version history.

## Initial Development Stack

| Area | Tool |
|---|---|
| Repository | GitHub private repository |
| Editor | Visual Studio Code |
| Charting | TradingView Premium |
| Automation bridge | TradersPost |
| Initial market | MNQ futures |
| Initial module | Atlas Observer |
| Primary language | Pine Script |

## System Boundary & Architecture

Atlas is not a trading bot with a research component. Atlas is a **quantitative research platform** with an execution module.

Every engine developed must be strategy-agnostic. Engines are reusable infrastructure that every current and future strategy will inherit.

### The Five Permanent Research Streams

Following Sprint 021, Atlas has permanently transitioned from a sprint-driven development model to a research-driven development model. Research is separated into five independent streams. They must be solved independently before being combined into a single decision engine.

1. **Stream A — Market Intelligence**
   - Understanding market regimes.
   - Purpose: Answer *"What kind of market is this?"*

2. **Stream B — Execution Intelligence**
   - Assembling complete execution models (strategies) from validated components.
   - Every execution model becomes a hypothesis built from previously validated building blocks. Atlas investigates **interaction effects** (e.g., Does a Liquidity Sweep become profitable only during High Tradeability regimes?).
   - Purpose: Answer *"Which combination of validated components produces the highest statistical edge in this environment?"*

3. **Stream C — Capital Intelligence**
   - Optimising capital preservation, position sizing, and risk allocation.
   - Guardian must consume information unavailable to the Regime Engine: consecutive losses, daily/weekly drawdown, prop firm trailing drawdown limits, live vs evaluation mode, and position sizing.
   - Purpose: Answer *"Given everything Atlas knows, how much capital deserves to be risked?"*

4. **Stream D — Component Intelligence**
   - Discovering which individual market behaviours consistently add statistical value.
   - Atlas categorises components into two fundamental types:
     - **Structural Components:** Describe the environment (e.g., Market Structure, Trend Alignment, Volatility Compression).
     - **Trigger Components:** Describe the event (e.g., Pullback, Liquidity Sweep, Breakout, Mean Reversion). A trigger should never be expected to produce an edge by itself.
   - Purpose: Answer *"Does this specific market behaviour possess intrinsic statistical edge?"*
   - Validated components are stored in the **Execution Component Library** and become reusable building blocks for Stream B.

5. **Stream E — AI Discovery Engine**
   - Deploying unsupervised machine learning and multi-dimensional analysis to discover hidden market relationships that humans may not consider.
   - Output: Ranked list of statistically significant market behaviours, new hypotheses, and potential Execution Components.
   - Purpose: Answer *"What combinations of market conditions consistently precede statistically significant directional movement?"*
   - Every discovery must survive the Validation Principle before entering Stream D.

### The Three-Question Ordering

Once the research streams mature, Atlas must answer three questions, strictly in this order, before any execution is permitted:

1. **What kind of market is this?** *(Market Regime Engine)*
2. **Given everything Atlas knows, how much capital deserves to be risked on this opportunity?** *(Guardian Risk Intelligence Engine)*
3. **Which strategy has the highest statistical edge in this environment?** *(Strategy Selection Layer)*

This ordering is fundamental and must not be reversed.

### Strategy Selection Layer

The long-term vision is not to have one strategy. The vision is for Atlas to evaluate multiple validated strategies and dynamically determine which, if any, best suits the current market regime. 

For example, Atlas should eventually be capable of determining that:
- Strategy A performs best in strong trends.
- Strategy B performs best during opening auctions.
- Strategy C performs best during low-volatility mean reversion.
- Some regimes are not worth trading at all.

## Initial Modules

### Atlas Observer

The first module. It assesses market state and displays decision-support information.

### Structure Engine

Future module for market structure, trend context, swing behaviour, and structural regime.

### Pressure Engine

Future module for momentum, directional pressure, impulse quality, and exhaustion risk.

### Location Engine

Future module for premium/discount, VWAP relationship, session location, prior levels, and contextual trade location.

### Guardian Risk Engine

Future module for capital preservation, rule compliance, drawdown awareness, daily limits, and stand-down logic.

### Dashboard

Future user interface layer for concise decision quality, not visual clutter.

### Journal and Validation

Future module for replay notes, signal review, expectancy analysis, drawdown analysis, and feature validation.

### The Research Workflow

Every future engine or feature must be developed through the formal 12-step Research Workflow:

1. **Research Question**
2. **Hypothesis**
3. **Component Development**
4. **Component Validation**
5. **Knowledge Base Update**
6. **Strategy Assembly**
7. **Integrated Validation**
8. **Out-of-Sample Validation**
9. **Walk-Forward Validation**
10. **Paper Trading**
11. **Prop Firm Simulation**
12. **Production Approval**

Atlas should never optimise a complete strategy until every component within that strategy has independently earned its place.

### Research Standards

Every hypothesis must be tested independently before being combined. No hypothesis should be accepted because it improves one metric at the expense of overall robustness.

Every experiment must report:
- Net Profit
- Profit Factor
- Expectancy
- Win Rate
- Maximum Drawdown
- Trade Count
- Average Winner
- Average Loser
- Largest Losing Streak
- Long vs Short Performance
- Session Performance
- Regime Performance

## Definition of Success

Atlas succeeds when it becomes a maintainable software project that produces disciplined, statistically validated trading decisions and supports a sustainable lifestyle rather than chasing short-term profits.

Atlas is successful only if it helps preserve capital, improve decision quality, and keep the trader aligned with the long-term mission.

## Non-Goals

Atlas is not designed to:

- Generate signals for activity's sake
- Chase every market move
- Become a crowded indicator bundle
- Replace discipline with automation
- Encourage overtrading
- Bypass prop firm rules
- Hide risk behind complexity
- Optimise for appearance over performance
- Enter live execution before validation

## Operating Bias

When uncertain, Atlas should prefer:

```text
No trade > low-quality trade
Capital preservation > opportunity capture
Validated edge > theoretical edge
Simple rule > fragile complexity
Statistical evidence > intuition
Stand down > force execution
```
