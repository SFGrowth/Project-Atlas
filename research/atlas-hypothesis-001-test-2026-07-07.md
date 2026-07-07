# Atlas Hypothesis 001 Test — 2026-07-07

## Sprint

Sprint 014 — Hypothesis 001 Test

## Purpose

Test whether blocking trades where strong pressure occurs into a reaction zone improves Atlas trade quality.

This test follows the Atlas research process:

Hypothesis → Measurement → Validation → Decision

This is not production approval.

This is a hypothesis test based on the one-year TradingView backtest export.

## Hypothesis 001

Trades fail when strong pressure occurs into a reaction zone.

## Reason

Atlas may be entering late after price has already travelled hard into a support or resistance reaction area.

The research expectation is that blocking or downgrading this condition should reduce poor trades, improve expectancy, and reduce drawdown.

## Test Method

Two TradingView Strategy Tester exports were compared using Atlas Trade Backtester v0.2.

Only one setting was changed:

Strong Pressure + Reaction Zone Handling

Baseline test:

Strong Pressure + Reaction Zone Handling: Off

Hypothesis test:

Strong Pressure + Reaction Zone Handling: Block Trade

All other settings were kept the same.

## Dataset

Market: MNQ
Timeframe: 5 minute
Test period: approximately 2025-07-07 to 2026-07-06
Backtester: Atlas Trade Backtester v0.2

## Baseline Result — H001 Off

Trades: 389
Net PnL: -$205.50
Gross Profit: $34,236.00
Gross Loss: -$34,441.50
Profit Factor: 0.994
Win Rate: 40.87%
Average Trade: -$0.53
Max Drawdown: -$4,873.50
Largest Losing Streak: 11

Direction review:

Long Trades: 208
Long Net PnL: +$1,413.50
Long Average Trade: +$6.80

Short Trades: 181
Short Net PnL: -$1,619.00
Short Average Trade: -$8.94

## Hypothesis Test Result — H001 Block Trade

Trades: 359
Net PnL: +$4,542.50
Gross Profit: $34,311.50
Gross Loss: -$29,769.00
Profit Factor: 1.153
Win Rate: 44.01%
Average Trade: +$12.65
Max Drawdown: -$3,137.50
Largest Losing Streak: 9

Direction review:

Long Trades: 198
Long Net PnL: +$2,789.00
Long Average Trade: +$14.09

Short Trades: 161
Short Net PnL: +$1,753.50
Short Average Trade: +$10.89

## Comparison

Trades removed: 30
Net PnL improvement: +$4,748.00
Profit Factor improvement: 0.994 to 1.153
Average Trade improvement: -$0.53 to +$12.65
Win Rate improvement: 40.87% to 44.01%
Max Drawdown improvement: -$4,873.50 to -$3,137.50
Largest Losing Streak improvement: 11 to 9

## Key Finding

Blocking strong_pressure + reaction_zone improved every major quality metric in this test:

- Net PnL improved
- Profit Factor improved
- Win Rate improved
- Average Trade improved
- Max Drawdown improved
- Largest Losing Streak improved
- Short-side performance improved materially

The most important observation is that gross profit remained approximately stable while gross loss was reduced.

This suggests the filter removed poor risk rather than simply removing opportunity.

## Interpretation

Hypothesis 001 is strengthened.

The result supports the idea that Atlas was taking late trades when strong pressure had already driven price into a reaction zone.

This condition appears to reduce trade quality and increase unnecessary loss.

## Decision

Decision: Hypothesis 001 passed the first meaningful TradingView backtest validation.

Status: Validated on available 1-year TradingView sample.

Production status: Not final production logic yet.

Next action: Keep H001 as a candidate Guardian filter and retest using external MNQ historical data when available.

## Engineering Notes

This result is not treated as curve-fit proof.

The correct interpretation is:

Strong pressure + reaction zone is now a validated candidate failure condition.

Before production promotion, Atlas should test the same hypothesis on a larger external MNQ dataset.

## Current Recommendation

Atlas Trade Backtester v0.2 should retain H001 as a configurable setting.

Preferred setting for continued testing:

Strong Pressure + Reaction Zone Handling: Block Trade

This setting should be considered a candidate Guardian rule, not final production execution logic.

## Engineering Principle

Atlas should not optimise for more trades.

This filter improved decision quality by removing a specific measured failure condition.
