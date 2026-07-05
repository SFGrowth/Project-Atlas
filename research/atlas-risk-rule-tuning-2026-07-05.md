# Atlas Risk Rule Tuning — 2026-07-05

## Sprint

Sprint 006 — Risk Rule Tuning

## Purpose

Tune the Atlas Market Data Exporter risk-mode logic after Sprint 005 showed the first version was likely too conservative.

The main issue was that `extension_code != 0` forced `caution` by itself.

That meant clean trending conditions were often blocked simply because price was stretched from EMA or VWAP.

## Engineering Decision

Extension alone should not force caution.

A clean trend can legitimately be extended.

Extension should only contribute to caution when it appears with additional risk conditions such as:

- Chop
- Weak trend alignment
- High volatility
- Major level risk

For Sprint 006, the first adjustment was:

```text
extensionRisk = extensionCode != 0 and (chopScore >= 2 or trendAlignmentScore between -1 and +1)
