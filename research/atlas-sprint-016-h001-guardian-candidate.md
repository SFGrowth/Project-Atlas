# Atlas Sprint 016 - H001 Guardian Candidate Logic

## Purpose

Promote Hypothesis 001 into Atlas Guardian candidate logic.

## Validated Research

H001 has now been validated by:

- TradingView 1-year Strategy Tester sample
- External 2-year MNQ Massive research-engine sample

## H001 Rule

Strong pressure into a reaction zone is a lower-quality decision condition.

Atlas interpretation:

strong_pressure + reaction_zone = caution

## Implementation

A new Trade Planner version was created:

atlas-observer/Atlas_Trade_Planner_v0_2.pine

The rule is configurable:

- Off
- Block Trade
- Downgrade to Caution

Preferred Atlas setting:

Downgrade to Caution

## Why Caution

Downgrade to Caution is preferred because Atlas should describe decision quality, not merely hide trades.

For trade execution logic, caution prevents new entries.

## Production Status

This is still candidate Guardian logic.

It should remain configurable until further scenario testing is complete.

## Next Sprint

Sprint 017 - Atlas Scenario Tester

Purpose:

Test many rule combinations and rank them by decision quality, not by raw profit alone.
