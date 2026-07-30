# SUPERSEDED — WRONG STRATEGY IMPLEMENTATION

**Status:** SUPERSEDED_WRONG_STRATEGY_IMPLEMENTATION
**Sprint:** 123A.14
**Date:** 2026-07-30

## What Was Tested (Incorrect)

The STRAT-9EMA-002 experiment in this directory tested a **15-minute EMA9/EMA21/EMA50 crossover strategy** with:
- EMA9 crosses above/below EMA21 on 15m bars
- Price above/below EMA50 filter
- ADX > 20 / ADX > 25 filter
- Fixed 2R take-profit target
- Crossover-candle stop
- RTH session only (13:30–20:00 UTC)

This is **not Phil's strategy**. It was derived from the Instagram Reel (STRAT-9EMA-001) and incorrectly extended.

## What Should Have Been Tested (Correct)

**STRATEGY_ID:** USER-STRAT-002-EMA9-VWAP-MOMENTUM

- **Timeframe:** 5-minute bars
- **Long alignment:** CLOSE > EMA9 > SESSION_VWAP
- **Short alignment:** CLOSE < EMA9 < SESSION_VWAP
- **Entry:** Fresh transition to correct side of both EMA9 and VWAP — enter at next 5m bar open
- **Long exit:** First causal touch of EMA9 (LOW <= EMA9)
- **Short exit:** First causal touch of EMA9 (HIGH >= EMA9)
- **No fixed take-profit, no EMA21, no EMA50, no ADX, no crossover-candle stop**
- **Full CME session baseline** (not RTH only)
- **Secondary safety version:** 2 ATR emergency stop

## Preservation

The STRAT-9EMA-002 artefacts in this directory are preserved as research history but **must not be treated as evidence for Phil's EMA9/VWAP strategy**. They represent a separate, unrelated strategy that was tested in error.

## Correct Experiment

The correct experiment is in:
`docs/research/strategies/9ema-vwap-momentum/`

Experiment ID: USER-STRAT-002-EMA9-VWAP-MOMENTUM
