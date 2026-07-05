# Atlas Tuned Export Analysis — 2026-07-05

## Sprint

Sprint 007 — Tuned Export Analysis

## Purpose

Analyse the tuned Atlas Market Data Exporter after Sprint 006 changed the extension risk rule.

The purpose is to determine whether the new `risk_on` behaviour is sensible, too permissive, or still too restrictive.

## Dataset

```text
Market: MNQ
Timeframe: 5 minute
Period: 2026-03-22 to 2026-07-03
Candles: 20,463
Export version: Atlas Market Data Exporter v0.1.1
```

## Executive Summary

Sprint 006 materially improved Atlas behaviour.

Before tuning, `risk_on` appeared on only 5.36% of candles.

After tuning, `risk_on` appeared on 35.35% of candles.

That looks like a large jump, but the detailed breakdown shows the new `risk_on` state is not random or uncontrolled.

All `risk_on` candles after tuning occurred only when:

```text
Volatility: normal
Chop: clean
Trend alignment: strong bullish or strong bearish
```

This means the tuning did not weaken the hard danger filters.

However, 84.8% of `risk_on` candles were still extended from EMA or VWAP. That confirms the tuning did exactly what it was designed to do: allow healthy trend extension.

The next question is whether extended trend conditions near major levels should still be reduced to `caution`.

## Risk Mode Distribution

```text
risk_on:      7,233 candles / 35.35%
caution:     12,292 candles / 60.07%
stand_down:     938 candles / 4.58%
```

## Volatility Breakdown

```text
low volatility:     3,211 candles / 15.7%
normal volatility: 13,796 candles / 67.4%
high volatility:    3,456 candles / 16.9%
```

Risk-on by volatility:

```text
low volatility:        0 risk_on candles
normal volatility: 7,233 risk_on candles
high volatility:       0 risk_on candles
```

## Chop Breakdown

```text
clean:       12,412 candles / 60.7%
mild chop:    7,656 candles / 37.4%
heavy chop:     395 candles / 1.9%
```

Risk-on by chop:

```text
clean:       7,233 risk_on candles
mild chop:       0 risk_on candles
heavy chop:      0 risk_on candles
```

This is positive. Atlas is not allowing `risk_on` during chop.

## Extension Breakdown

```text
stretched down: 5,084 candles / 24.8%
not stretched:  6,622 candles / 32.4%
stretched up:   8,757 candles / 42.8%
```

Risk-on by extension:

```text
stretched down: 2,389 risk_on candles
not stretched:  1,096 risk_on candles
stretched up:   3,748 risk_on candles
```

84.8% of all `risk_on` candles were extended.

This confirms that the old rule was suppressing clean trend conditions too aggressively.

## Trend Alignment Breakdown

Risk-on appeared only when trend alignment was strong:

```text
trend score -4: 2,257 risk_on candles
trend score -3:   659 risk_on candles
trend score +3:   895 risk_on candles
trend score +4: 3,422 risk_on candles
```

No `risk_on` candles appeared when trend alignment was weak or neutral.

This is good behaviour.

## Session Breakdown

Risk-on by session:

```text
outside_main:     187 risk_on candles
premarket:      2,143 risk_on candles
opening_range:     25 risk_on candles
mid_morning:       56 risk_on candles
midday:           916 risk_on candles
power_hour:       287 risk_on candles
after_hours:    3,619 risk_on candles
```

This is the main concern.

A large share of `risk_on` appears in premarket and after-hours conditions.

That may be acceptable for analysis, but it is probably not acceptable for prop firm execution rules without a session filter.

Atlas should eventually distinguish between:

```text
market is technically clean
```

and

```text
market is appropriate to trade for prop firm execution
```

Those are not the same thing.

## Risk-On Zone Analysis

Continuous `risk_on` zones:

```text
Risk-on zones: 1,262
Average zone length: 5.7 candles
Median zone length: 3 candles
Longest zone: 57 candles
```

On a 5-minute chart:

```text
Average risk_on zone: about 29 minutes
Median risk_on zone: about 15 minutes
Longest risk_on zone: about 4 hours 45 minutes
```

This is useful. Atlas is not firing isolated one-candle risk states only. It is identifying sustained clean conditions.

However, the number of total zones is high because the dataset includes extended hours.

## Major Level Proximity

Major levels tested:

```text
previous day high
previous day low
premarket high
premarket low
opening range high
opening range low
```

Risk-on near a major level:

```text
Within 0.5 ATR of a major level: 1,232 risk_on candles
Within 1.0 ATR of a major level: 2,239 risk_on candles
```

That means:

```text
17.0% of risk_on candles were within 0.5 ATR of a major level
31.0% of risk_on candles were within 1.0 ATR of a major level
```

This is the next area to investigate.

Price near major levels can be either good or dangerous depending on context. For Atlas, this should probably become a separate `location_risk` field before it changes `risk_mode` directly.

## Engineering Interpretation

The Sprint 006 tuning was directionally correct.

Atlas now allows clean trend extension instead of automatically punishing it.

The tuned version still blocks:

```text
high volatility risk_on
low volatility risk_on
mild chop risk_on
heavy chop risk_on
weak trend risk_on
neutral trend risk_on
```

So the model is not reckless.

But it now allows a lot of extended trend conditions, especially outside regular trading hours.

This means the next refinement should not undo the extension fix. Instead, Atlas should add more context around session and location.

## Current Conclusion

Atlas v0.1.1 is better than v0.1.0.

The old model was too blunt.

The new model is more useful, but needs session and location risk refinement before it should influence execution decisions.

## Recommended Next Sprint

Sprint 008 should be:

```text
Sprint 008 — Session and Location Risk Layer
```

Purpose:

Add separate export fields for session suitability and major-level location risk.

This should not immediately block trades. It should first expose data for analysis.

Recommended new fields:

```text
atlas_session_risk_code
atlas_near_major_level_code
atlas_nearest_major_level_distance_atr
atlas_location_risk_code
```

Potential interpretation:

```text
session_risk_code:
  1 = preferred execution session
  0 = acceptable but lower confidence
 -1 = avoid for prop firm execution

location_risk_code:
  1 = favourable location
  0 = neutral location
 -1 = dangerous reaction zone
```

## Decision

Do not add execution logic yet.

Do not connect to TradersPost yet.

Do not turn `risk_on` into trade signals yet.

Atlas should continue to improve its market classification first.

## Engineering Principle

A cleaner `risk_on` state is not the same as a trade signal.

Atlas assesses first.

Execution comes later.
