# Sprint 002 — Validation Framework

## Objective

Create the first repeatable validation framework for Atlas Observer.

Atlas must not become a pile of opinions or visual signals. Before adding more logic, Atlas needs a disciplined way to test whether its market-state assessments improve decision quality, reduce unnecessary trades, and protect capital during prop firm evaluations.

## Status

In progress.

## Scope

### Included

- Replay validation process
- Observer state definitions
- Manual validation log template
- Evidence-first development workflow

### Excluded

- New Pine Script features
- Trade automation
- TradersPost integration
- Live execution
- Strategy optimisation
- New indicators

## Why This Sprint Comes Before More Code

Atlas Observer v0.1 now compiles and displays market-state information.

The next question is not:

> What else can we add?

The correct engineering question is:

> Can we prove the current observer helps decision quality?

If we add more modules before defining validation, we risk building complexity without evidence.

## Acceptance Criteria

- A repeatable TradingView replay validation protocol exists.
- Observer states are clearly defined.
- A manual validation log template exists.
- Validation can be performed without changing Pine code.
- Sprint 2 produces evidence infrastructure, not more trading logic.

## Charter Alignment

This sprint supports Atlas by:

- Improving decision quality through structured review.
- Reducing unnecessary trades by identifying conditions that should be avoided.
- Enabling objective testing through a repeatable validation process.
- Supporting long-term expectancy by measuring whether observer states are useful.
- Preserving capital by delaying automation until evidence exists.
- Supporting prop firm evaluation survival by focusing on risk selection before execution.

## Definition of Done

Sprint 2 is complete when:

- `Docs/replay-validation-protocol.md` explains exactly how to run a replay session.
- `Docs/observer-state-definitions.md` defines each Atlas Observer state.
- `research/observer-validation-log-template.md` provides a consistent logging format.
- All files are committed and pushed.
- No Pine Script changes were made in this sprint.

## Engineering Decision

Sprint 2 intentionally avoids new Pine code.

This is deliberate.

Atlas should earn complexity through evidence.
