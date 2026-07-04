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

## System Boundary

Atlas begins as an assessment system, not an execution system.

The first production-grade capability is to classify market conditions and identify when risk should be reduced or avoided.

Execution must only be introduced after documentation, validation, alert testing, paper execution, and risk review.

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
