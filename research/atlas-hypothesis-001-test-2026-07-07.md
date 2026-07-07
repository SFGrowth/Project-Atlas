# Atlas Hypothesis 001 Test - 2026-07-07

## Sprint

Sprint 014 - Hypothesis 001 Test

## Purpose

Test whether blocking or downgrading trades where strong pressure occurs into a reaction zone improves Atlas trade quality.

This test follows the Atlas research process:

Hypothesis -> Measurement -> Validation -> Decision

This is not production approval.

This is a hypothesis test based on the available one-year TradingView Strategy Tester export.

## Hypothesis 001

Trades fail when strong pressure occurs into a reaction zone.

## Reason

Atlas may be entering late after price has already travelled hard into a support or resistance reaction area.

The research expectation is that blocking or downgrading this condition should reduce poor trades, improve expectancy, and reduce drawdown.

## Test Method

Three TradingView Strategy Tester exports were compared using Atlas Trade Backtester v0.2.

Only one setting was changed:

Strong Pressure + Reaction Zone Handling

The three settings tested were:

1. Off
2. Block Trade
3. Downgrade to Caution

All other settings were kept the same.

## Dataset

Market: MNQ  
Timeframe: 5 minute  
Test period: approximately 2025-07-07 to 2026-07-06  
Backtester: Atlas Trade Backtester v0.2  

## Test 1 - H001 Off

Strong Pressure + Reaction Zone Handling: Off

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

## Test 2 - H001 Block Trade

Strong Pressure + Reaction Zone Handling: Block Trade

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

## Test 3 - H001 Downgrade to Caution

Strong Pressure + Reaction Zone Handling: Downgrade to Caution

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

## Important Implementation Note

In Atlas Trade Backtester v0.2, Block Trade and Downgrade to Caution produce the same Strategy Tester result.

This is expected.

The strategy only enters trades when risk mode is risk_on.

Therefore:

Block Trade prevents the setup directly.

Downgrade to Caution changes the setup condition away from risk_on, which also prevents entry.

So for the current backtester:

Block Trade = no entry  
Downgrade to Caution = no entry  

The distinction is still useful architecturally.

For Atlas language and future Guardian logic, Downgrade to Caution is the better concept because it explains that the market state has become lower quality rather than simply hiding a trade.

## Comparison

Compared with H001 Off:

Trades removed: 30  
Net PnL improvement: +$4,748.00  
Profit Factor improvement: 0.994 to 1.153  
Average Trade improvement: -$0.53 to +$12.65  
Win Rate improvement: 40.87% to 44.01%  
Max Drawdown improvement: -$4,873.50 to -$3,137.50  
Largest Losing Streak improvement: 11 to 9  

## Key Finding

Blocking or downgrading strong_pressure + reaction_zone improved every major quality metric in this test:

- Net PnL improved
- Profit Factor improved
- Win Rate improved
- Average Trade improved
- Max Drawdown improved
- Largest Losing Streak improved
- Short-side performance improved materially

The most important observation is that gross profit remained approximately stable while gross loss was reduced.

This suggests the rule removed poor risk rather than simply removing opportunity.

## Interpretation

Hypothesis 001 is strengthened.

The result supports the idea that Atlas was taking late trades when strong pressure had already driven price into a reaction zone.

This condition appears to reduce trade quality and increase unnecessary loss.

## Decision

Decision: Hypothesis 001 passed the first meaningful TradingView backtest validation.

Status: Validated on available one-year TradingView sample.

Production status: Not final production logic yet.

Next action: Keep H001 as a candidate Guardian rule and retest using external MNQ historical data when available.

## Current Preferred Atlas Language

The preferred Atlas concept is:

Downgrade strong_pressure + reaction_zone to caution.

Reason:

Downgrade communicates decision quality better than simply blocking a trade.

For backtesting purposes, this currently behaves the same as blocking because caution conditions do not permit entries.

## Engineering Notes

This result is not treated as final proof.

The correct interpretation is:

Strong pressure + reaction zone is now a validated candidate failure condition.

Before production promotion, Atlas should test the same hypothesis on a larger external MNQ dataset.

## Current Recommendation

Atlas Trade Backtester v0.2 should retain H001 as a configurable setting.

Preferred setting for continued testing:

Strong Pressure + Reaction Zone Handling: Downgrade to Caution

Equivalent backtest setting:

Strong Pressure + Reaction Zone Handling: Block Trade

Both currently produce the same Strategy Tester result.

## Engineering Principle

Atlas should not optimise for more trades.

This rule improved decision quality by removing a specific measured failure condition.
