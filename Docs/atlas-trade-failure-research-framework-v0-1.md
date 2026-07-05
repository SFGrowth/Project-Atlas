# Atlas Trade Failure Research Framework v0.1

## Purpose

Atlas must determine why trades fail before adding optimisation filters.

No optimisation may be implemented unless it begins with a hypothesis and ends with validation.

Atlas is not optimising for more trades.

Atlas is optimising for higher-quality decisions, lower unnecessary risk, and improved expectancy over a meaningful sample size.

## Core Rule

Every proposed filter must follow this process:

- Hypothesis
- Measurement
- Validation
- Decision

A filter is not valid simply because it improves one historical backtest.

A filter must explain a repeatable failure condition.

## Research Objective

For every backtested trade, Atlas must measure the trade context across the following dimensions:

- Structure
- Pressure
- Location
- Trend
- Session
- Volatility
- Guardian status

The goal is to identify the true cause of losing trades rather than assuming that time of day, direction, or any single variable is responsible.

## Required Trade Fields

Every trade record should include:

- Trade ID
- Direction
- Entry time
- Exit time
- Entry price
- Exit price
- Stop price
- Target 1 price
- Target 2 price
- Outcome
- PnL
- R multiple
- Bars in trade

## Structure Metrics

Structure answers:

Was the trade taken from a structurally valid position?

Measure:

- Distance from fast EMA
- Distance from slow EMA
- Distance from VWAP
- Distance from recent swing high
- Distance from recent swing low
- Whether entry was extended from structure
- Whether stop was placed beyond meaningful structure
- Whether entry occurred after a large impulse candle

Possible structure classifications:

- clean_structure
- late_structure
- extended_structure
- weak_structure

## Pressure Metrics

Pressure answers:

Was there directional pressure behind the trade?

Measure:

- Candle body size relative to ATR
- Close position inside candle range
- Volume relative to recent average
- Consecutive directional candles
- Breakout candle quality
- Follow-through after entry

Possible pressure classifications:

- strong_pressure
- moderate_pressure
- weak_pressure
- exhaustion_pressure

## Location Metrics

Location answers:

Was the trade entering into a reaction zone?

Measure distance to:

- Previous day high
- Previous day low
- Premarket high
- Premarket low
- Opening range high
- Opening range low
- VWAP
- Major swing high
- Major swing low
- Round number zones

Possible location classifications:

- clean_location
- near_resistance
- near_support
- inside_range
- breakout_location
- reaction_zone

## Trend Metrics

Trend answers:

Was the trade aligned with a strong and stable trend?

Measure:

- EMA alignment
- EMA slope
- VWAP alignment
- RSI alignment
- Trend score
- Trend persistence
- Number of EMA/VWAP crosses in recent bars

Possible trend classifications:

- strong_trend
- weak_trend
- transition_trend
- choppy_trend

## Session Metrics

Session answers:

What market session was the trade taken in?

Track:

- Premarket
- Opening range
- Mid-morning
- Midday
- Power hour
- After-hours
- Other regular session

Session is not a cause by itself.

Session may only become a filter if failure analysis proves that a session condition remains negative after Structure, Pressure, Location, Trend, Volatility, and Guardian status are considered.

## Volatility Metrics

Volatility answers:

Was volatility favourable, compressed, expanded, or unstable?

Measure:

- ATR
- ATR ratio versus baseline
- High volatility flag
- Low volatility flag
- Range expansion
- Volatility compression

Possible volatility classifications:

- normal_volatility
- low_volatility
- high_volatility
- expanding_volatility
- unstable_volatility

## Guardian Status

Guardian status answers:

Was there a known risk condition that should have blocked or downgraded the trade?

Track:

- Chop score
- Extension risk
- Major level risk
- Volatility block
- Session block
- Risk mode
- Regime
- Stand-down condition

Possible Guardian classifications:

- guardian_clear
- guardian_caution
- guardian_conflict
- guardian_stand_down

## Failure Classification

Every losing trade should be assigned one or more likely failure causes:

- structure_failure
- pressure_failure
- location_failure
- trend_failure
- session_failure
- volatility_failure
- guardian_failure
- execution_failure
- unknown_failure

A trade may have multiple causes.

Atlas should not assume the first visible factor is the true cause.

## Hypothesis Template

Hypothesis ID:

Date:

Proposed change:

Failure condition observed:

Expected improvement:

Metrics to validate:

Minimum sample size:

Pass criteria:

Fail criteria:

Decision:

## Validation Rules

A proposed filter must be rejected if:

- It only improves one small sample
- It removes too many trades without improving expectancy
- It improves net profit but worsens drawdown materially
- It improves win rate but worsens average trade
- It is only explained by time of day without supporting quality metrics
- It cannot be objectively measured

A proposed filter may be accepted only if:

- It improves expectancy
- It reduces unnecessary losses
- It preserves enough trade sample size
- It has a clear causal explanation
- It can be retested out-of-sample
- It improves Atlas decision quality

## Engineering Principle

Atlas must explain why a trade was good or bad.

Backtest profit alone is not evidence.

The purpose of the research framework is to improve decision quality, not to curve-fit historical data.