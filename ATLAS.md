# Project Atlas

## Status

**Atlas Trading System v1.0 — Integrated**

ATS v1.0 was integrated and simulated on 2026-07-08. It combines the Market Regime Engine, Execution Model A1, and Atlas Risk Intelligence (ARI) into a single operational pipeline.

**Atlas OS Version 1.0 — Architecture Freeze**

Foundation documentation created on 2026-07-04. Architectural maturity achieved and frozen on 2026-07-08.

### Architecture Freeze Declaration

Effective immediately, the core Atlas architecture is in **Architecture Freeze v1.0**.
- No new research streams.
- No new constitutional principles.
- No major architectural redesigns.
- No philosophical additions.

From this point forward, the burden of proof shifts. If anyone proposes a change to Atlas' core architecture, they must demonstrate that the existing architecture cannot solve the problem first. The architecture is now stable; the research is now dynamic.

The primary objective is no longer to build a better architecture. The objective is to use the stable scientific framework to generate a larger body of validated knowledge.

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

## The Epistemology Principle

**The success of Atlas is measured not only by the quality of its execution models, but by the rate at which it converts uncertainty into validated knowledge.**

Atlas is an epistemology project. It exists to answer one question: "How do we know something is true?" Every research stream exists to reduce uncertainty through evidence. Knowledge is the compounding asset. Everything else—including profit—is simply an application of that knowledge.

## The Mission Principle

**Research without application becomes academic. Application without research becomes speculation. Atlas must now combine both.**

The purpose of research is no longer simply to discover knowledge. The purpose of research is to continuously improve a complete trading system capable of repeatedly passing prop firm evaluations under realistic conditions.

## The Portfolio Principle

**A candidate is not promoted because it is profitable. A candidate is promoted only if it improves the Atlas portfolio.**

Atlas is no longer building standalone strategies; it is building a portfolio of execution models. A model that earns less profit but materially smooths equity or reduces portfolio drawdown may be more valuable than a higher-profit standalone model. Model A2 does not need to outperform A1—it needs to make Atlas better.

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
   - Atlas Risk Intelligence (ARI) must consume information from three domains: Market Intelligence (regime, volatility), Execution Intelligence (model confidence, operating conditions), and Capital Intelligence (drawdown, consecutive losses, prop firm limits).
   - Purpose: Answer *"Given everything Atlas currently knows about the market, the execution model, and the account, what level of risk is objectively justified right now?"*

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

### The Seven-Question Decision Framework

Atlas Trading System (ATS) v1.0 integrates all research streams into a single operating system. Before any order is placed, ATS must answer seven questions in strict sequence. If any question returns a negative or blocking response, the sequence terminates.

1. **Is the market tradeable?** *(Market Regime Engine)*
2. **Is the model appropriate for this environment?** *(Model Characterisation)*
3. **Is current account risk acceptable?** *(Atlas Risk Intelligence)*
4. **What position size is justified?** *(ARI Capital Allocation)*
5. **Should Atlas execute this trade?** *(Execution Model Logic)*
6. **How should the trade be managed?** *(Trade Management Logic)*
7. **When should trading stop for the day?** *(ARI Daily Limits)*

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

### Atlas Risk Intelligence (ARI)

The executive decision-maker of Atlas. ARI continuously evaluates whether risk deserves to exist at all, and if so, how much. It synthesises Market Intelligence, Execution Intelligence, and Capital Intelligence to output dynamic risk allocations (BLOCK, OBSERVE ONLY, PAPER TRADE, REDUCED RISK, STANDARD RISK). Execution models discover opportunity; ARI determines whether opportunity deserves capital.

### Dashboard

Future user interface layer for concise decision quality, not visual clutter.

### Journal and Validation

Future module for replay notes, signal review, expectancy analysis, drawdown analysis, and feature validation.

### The Knowledge Gain Framework

Every completed research cycle must measure **Knowledge Gain** rather than just Profit Factor. A profitable experiment with little understanding is less valuable than a negative experiment that permanently eliminates an entire branch of research.

Every experiment must answer:
1. What did we learn?
2. What uncertainty was removed?
3. What future work has been eliminated?
4. What new research questions were created?
5. Did Atlas become objectively smarter?

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

## Atlas Maturity Model

Atlas has progressed through six stages of evolution. Every future decision should move Atlas further into Stage 6.

1. **Strategy Development:** Attempting to build profitable algorithms.
2. **Quantitative Research:** Testing ideas with historical data.
3. **Knowledge Preservation:** Recording what does not work.
4. **Component Architecture:** Breaking strategies into isolated, testable behaviours.
5. **AI-Assisted Discovery:** Using machine learning to find hidden relationships.
6. **Scientific Learning:** Building a system that continuously improves its fundamental understanding of financial markets.

## Definition of Success

The primary measure of success for Project Atlas is no longer discovering interesting market behaviour. The objective is to build a complete trading system capable of consistently passing and scaling prop firm evaluations. 

Research without application becomes academic. Application without research becomes speculation. Atlas must combine both. The purpose of research is to continuously improve a complete trading system that survives real-world trading conditions.

Atlas is successful only if it helps preserve capital, improve decision quality, and keep the trader aligned with the long-term mission of sustainable freedom.

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
