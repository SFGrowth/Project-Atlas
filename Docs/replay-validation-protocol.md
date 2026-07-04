# Replay Validation Protocol

## Purpose

This document defines the manual TradingView replay process for validating Atlas Observer.

The goal is not to prove that Atlas predicts the market.

The goal is to test whether Atlas market states help improve decision quality, reduce unnecessary trades, and protect capital during prop firm-style trading.

## Validation Principle

Atlas must be judged by whether it helps answer:

- Should I be trading right now?
- Is the market clean or messy?
- Is the risk environment favourable?
- Would standing down have protected capital?
- Did the observer reduce poor decision-making?

## Market

Initial validation market:

- Instrument: MNQ futures
- Platform: TradingView
- Module: Atlas Observer v0.1

## Replay Session Setup

For each validation session:

1. Open MNQ chart in TradingView.
2. Apply Atlas Observer v0.1.
3. Select one timeframe for the session.
4. Start TradingView Bar Replay.
5. Hide future price action.
6. Advance one candle at a time.
7. Record Atlas state before seeing the next move.
8. Log observations in the validation template.

## Recommended Initial Timeframes

Start with:

- 1 minute
- 3 minute
- 5 minute

Do not mix timeframes inside the same validation session.

## Session Types To Test

Validation should include different market conditions:

- Clean trending sessions
- Choppy sessions
- High-volatility reversal sessions
- Low-volume slow sessions
- News-affected sessions
- Opening range sessions
- Midday sessions
- Late-session sessions

## Minimum Sample Size

A single replay session proves nothing.

Initial minimum validation target:

```text
20 replay sessions