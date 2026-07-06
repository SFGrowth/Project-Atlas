# Atlas Trade Failure Research - Sample A Extended

## Sprint

Sprint 012 - Trade Failure Sample A Extended

## Purpose

Document the extended Atlas trade failure research sample using the Atlas Trade Research Exporter v0.1.

This note does not approve an optimisation.

This note strengthens or weakens hypotheses by measuring why trades won or failed across Atlas research dimensions.

## Sample

Sample ID: A Extended  
Market: MNQ  
Timeframe: 5 minute  
Period: 2026-03-22 to 2026-07-06  
Bars: 20,593  
Completed Trades: 111  
Exporter: Atlas Trade Research Exporter v0.1  

## Baseline Result

Trades: 111  
Net PnL: -$2,388.50  
Win Rate: 39.6%  
Profit Factor: 0.82  
Average Trade: -$21.52  
Gross Profit: $10,642.00  
Gross Loss: -$13,030.50  

This sample remains negative.

The system is not ready for optimisation or execution promotion.

## Direction Review

Long Trades: 62  
Long Net PnL: -$176.50  
Long Win Rate: 43.5%  
Long Average Trade: -$2.85  

Short Trades: 49  
Short Net PnL: -$2,212.00  
Short Win Rate: 34.7%  
Short Average Trade: -$45.14  

Short trades remain materially weaker than long trades in this sample.

However, Atlas should not disable shorts yet. The correct next step is to identify why short setups are failing.

## Pressure Review

Strong Pressure:  
Trades: 42  
Net PnL: -$3,524.00  
Win Rate: 31.0%  
Average Trade: -$83.90  

Moderate Pressure:  
Trades: 23  
Net PnL: -$568.00  
Win Rate: 39.1%  
Average Trade: -$24.70  

Weak Pressure:  
Trades: 13  
Net PnL: +$201.50  
Win Rate: 38.5%  
Average Trade: +$15.50  

Exhaustion Pressure:  
Trades: 33  
Net PnL: +$1,502.00  
Win Rate: 51.5%  
Average Trade: +$45.52  

Strong pressure is again negative.

This supports the idea that Atlas may be entering too late on strong breakout candles rather than entering at the start of a clean directional move.

## Location Review

Reaction Zone:  
Trades: 74  
Net PnL: -$2,218.50  
Win Rate: 36.5%  
Average Trade: -$29.98  

Inside Range:  
Trades: 14  
Net PnL: -$858.00  
Win Rate: 28.6%  
Average Trade: -$61.29  

Breakout Location:  
Trades: 23  
Net PnL: +$688.00  
Win Rate: 56.5%  
Average Trade: +$29.91  

Reaction zone trades remain negative.

Breakout location trades remain positive in this sample.

## Structure Review

Extended Structure:  
Trades: 78  
Net PnL: -$189.00  
Win Rate: 42.3%  
Average Trade: -$2.42  

Clean Structure:  
Trades: 22  
Net PnL: -$336.00  
Win Rate: 36.4%  
Average Trade: -$15.27  

Late Structure:  
Trades: 10  
Net PnL: -$1,131.50  
Win Rate: 30.0%  
Average Trade: -$113.15  

Weak Structure:  
Trades: 1  
Net PnL: -$732.00  
Win Rate: 0.0%  
Average Trade: -$732.00  

Late structure is poor, but sample size is small.

Extended structure is not automatically bad in this sample. This reinforces the earlier decision not to treat extension alone as a hard failure condition.

## Session Review

Opening Range:  
Trades: 44  
Net PnL: -$557.50  
Win Rate: 36.4%  
Average Trade: -$12.67  

Mid-Morning:  
Trades: 23  
Net PnL: -$1,169.50  
Win Rate: 47.8%  
Average Trade: -$50.85  

Midday:  
Trades: 6  
Net PnL: -$638.00  
Win Rate: 33.3%  
Average Trade: -$106.33  

Power Hour:  
Trades: 29  
Net PnL: -$678.50  
Win Rate: 34.5%  
Average Trade: -$23.40  

Other Regular:  
Trades: 9  
Net PnL: +$655.00  
Win Rate: 55.6%  
Average Trade: +$72.78  

Session alone is not sufficient as a failure explanation.

Mid-morning and midday are negative, but Atlas should not apply a time filter until the failure cause is tested against structure, pressure, location, trend, volatility, and Guardian status.

## Volatility Review

High Volatility:  
Trades: 60  
Net PnL: -$1,755.50  
Win Rate: 41.7%  
Average Trade: -$29.26  

Normal Volatility:  
Trades: 44  
Net PnL: -$1,405.00  
Win Rate: 34.1%  
Average Trade: -$31.93  

Low Volatility:  
Trades: 7  
Net PnL: +$772.00  
Win Rate: 57.1%  
Average Trade: +$110.29  

High volatility is negative, but normal volatility is also negative.

Volatility alone does not explain trade failure.

## Guardian Review

Guardian Clear:  
Trades: 111  
Net PnL: -$2,388.50  
Win Rate: 39.6%  
Average Trade: -$21.52  

All recorded trades were taken under Guardian Clear conditions.

This means current Guardian logic allowed the losing conditions.

The next question is whether Guardian should be upgraded to recognize specific combinations such as strong pressure into reaction zones.

## Key Failure Combination

The strongest repeated failure cluster is:

Strong Pressure + Reaction Zone:  
Trades: 34  
Net PnL: -$3,120.00  
Win Rate: 29.4%  
Average Trade: -$91.76  

This is the most important finding.

It is consistent with Sample A.

## Supporting Combination Review

Moderate Pressure + Reaction Zone:  
Trades: 10  
Net PnL: -$574.00  
Win Rate: 20.0%  
Average Trade: -$57.40  

Strong Pressure + Inside Range:  
Trades: 4  
Net PnL: -$310.00  
Win Rate: 25.0%  
Average Trade: -$77.50  

Strong Pressure + Breakout Location:  
Trades: 4  
Net PnL: -$94.00  
Win Rate: 50.0%  
Average Trade: -$23.50  

Exhaustion Pressure + Reaction Zone:  
Trades: 26  
Net PnL: +$1,039.00  
Win Rate: 50.0%  
Average Trade: +$39.96  

Exhaustion Pressure + Breakout Location:  
Trades: 4  
Net PnL: +$403.50  
Win Rate: 75.0%  
Average Trade: +$100.88  

The failure is not simply reaction zone.

Reaction zone with exhaustion pressure performed positively.

The failure appears concentrated in strong pressure into reaction zone.

## Hypothesis 001 - Strengthened

Hypothesis:  
Trades fail when strong pressure occurs into a reaction zone.

Reason:  
Atlas may be entering late after price has already travelled hard into a support or resistance area.

Expected improvement:  
Downgrading or blocking strong_pressure + reaction_zone setups may reduce poor entries and improve expectancy.

Validation required:  
Test the hypothesis on another non-overlapping sample if available, or test with a forward sample before accepting.

## Important Interpretation

This sample does not support a blind time filter yet.

A time filter may still be useful later, but the better current explanation is:

The setup fails when pressure and location conflict.

Specifically:

- Strong pressure may be good only when location is clean.
- Strong pressure into reaction zones may represent late entry risk.
- Reaction zones are not always bad.
- Exhaustion pressure inside or near reaction zones may behave differently.

## Provisional Failure Cause

The likely failure cause is:

location_failure + pressure_failure

Not:

session_failure

## Decision

Decision: Do not implement a production filter yet.  
Status: Hypothesis 001 strengthened.  
Next action: Build a hypothesis test script or report comparing:

- strong_pressure + reaction_zone allowed
- strong_pressure + reaction_zone blocked
- strong_pressure + reaction_zone downgraded to caution

## Engineering Principle

Atlas should not chase time-of-day optimisation before it understands why trades fail.

The research evidence now points toward an interaction between pressure and location.

That is a higher-quality explanation than assuming session alone is the cause.
