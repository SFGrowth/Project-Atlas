# Atlas Canonical Behaviour Specifications

**Sprint:** 121A
**Status:** APPROVED DESIGN
**Directive:** ORION-DIRECTIVE-001
**Date:** 2026-07-17

---

## Overview

This document defines the twelve canonical market behaviours that form the initial Atlas Behaviour Library. Each behaviour is defined with sufficient precision that a classifier can be implemented deterministically — given the same market data, the same classification is always produced.

These behaviours are not strategies. They are descriptions of recurring market phenomena. Strategies are built on top of behaviours, not the other way around.

The behaviours are organised into four categories: **Trend**, **Reversal**, **Breakout/Compression**, and **Session/Volatility**.

---

## Behaviour Specification Format

Each behaviour is specified using the following standard fields:

| Field | Description |
|---|---|
| **Definition** | Plain-language description of what this behaviour is |
| **Classification Rules** | Quantitative conditions that must be satisfied for detection |
| **Expected Outcome** | What Atlas expects to happen after this behaviour is detected |
| **Target Regimes** | Market regimes in which this behaviour is valid |
| **Target Sessions** | Trading sessions in which this behaviour is most reliable |
| **Evidence Requirements** | Minimum evidence scores required for detection |
| **Confidence Calculation** | How confidence is computed for this behaviour |
| **Expected Lifecycle** | Typical duration and resolution pattern |

---

## Category 1 — Trend Behaviours

### B-001 — TREND_CONTINUATION

**Definition.** The market is in an established directional trend and has completed a brief consolidation or minor pullback, with price structure, momentum, and indicator alignment all confirming that the trend is likely to resume in its original direction.

**Classification Rules.** All of the following must be satisfied:

| Condition | Long | Short |
|---|---|---|
| ADX | ≥ 25 | ≥ 25 |
| EMA9 vs EMA21 | EMA9 > EMA21 | EMA9 < EMA21 |
| Price vs VWAP | Close > VWAP | Close < VWAP |
| RSI | 45–70 | 30–55 |
| ATR | ≥ 0.5× 20-bar average ATR | ≥ 0.5× 20-bar average ATR |
| Pullback depth | 2–6 bars of counter-trend | 2–6 bars of counter-trend |
| Price structure | Higher lows (long) | Lower highs (short) |

**Expected Outcome.** Price resumes the trend direction within 3–8 bars. Expected R: 1.2–2.5. Win rate (historical): 58–68%.

**Target Regimes.** `TRENDING` (primary), `VOLATILE` (secondary, lower confidence).

**Target Sessions.** `NEW_YORK` (primary), `LONDON` (secondary).

**Evidence Requirements.** Minimum evidence score: 55. Indicator agreement: ≥ 4/6 conditions met.

**Confidence Calculation.** Base confidence = 40. Add 10 for each of: ADX ≥ 30, RSI in ideal range (50–65 long / 35–50 short), price above/below VWAP by ≥ 0.25 ATR, EMA separation ≥ 0.5 ATR, pullback to EMA9 or EMA21. Maximum: 90.

**Expected Lifecycle.** FORMING (1–2 bars) → ACTIVE (3–8 bars) → CONFIRMED or EXPIRED. Maximum duration: 12 bars.

---

### B-002 — SECOND_ENTRY_PULLBACK

**Definition.** The market has made an initial breakout or directional move, pulled back to a key level (EMA9, EMA21, VWAP, or prior swing), and is now presenting a second entry opportunity in the original direction. The second entry is typically higher quality than the first because the initial move has established directional conviction.

**Classification Rules.** All of the following must be satisfied:

| Condition | Long | Short |
|---|---|---|
| Prior directional move | ≥ 1.5 ATR in 3–10 bars | ≥ 1.5 ATR in 3–10 bars |
| Pullback depth | 38–62% of prior move | 38–62% of prior move |
| Pullback to key level | Within 0.25 ATR of EMA9, EMA21, or VWAP | Within 0.25 ATR of EMA9, EMA21, or VWAP |
| ADX | ≥ 20 | ≥ 20 |
| RSI at pullback low | 40–55 (long) | 45–60 (short) |
| Volume on pullback | Below 20-bar average | Below 20-bar average |

**Expected Outcome.** Price resumes the original direction within 2–5 bars. Expected R: 1.5–3.0. Win rate (historical): 62–72%.

**Target Regimes.** `TRENDING` (primary), `RANGING` (secondary, lower confidence).

**Target Sessions.** `NEW_YORK` (primary), `LONDON` (secondary).

**Evidence Requirements.** Minimum evidence score: 60. Prior move and pullback depth are mandatory.

**Confidence Calculation.** Base confidence = 45. Add 10 for each of: pullback to EMA9 exactly, RSI in ideal range, volume contraction confirmed, ADX ≥ 25, prior move ≥ 2.0 ATR. Maximum: 90.

**Expected Lifecycle.** FORMING (1 bar) → ACTIVE (2–5 bars) → CONFIRMED or EXPIRED. Maximum duration: 8 bars.

---

## Category 2 — Reversal Behaviours

### B-003 — LIQUIDITY_SWEEP

**Definition.** Price has briefly exceeded a significant prior high or low (sweeping the liquidity resting above/below that level), then reversed sharply, indicating that the sweep was a stop-hunt rather than a genuine breakout. The reversal is the tradeable behaviour.

**Classification Rules.** All of the following must be satisfied:

| Condition | Long (sweep of lows) | Short (sweep of highs) |
|---|---|---|
| Prior significant level | Identifiable swing low in last 20 bars | Identifiable swing high in last 20 bars |
| Sweep depth | 0.1–0.75 ATR beyond the level | 0.1–0.75 ATR beyond the level |
| Reversal bar | Close back above swept level | Close back below swept level |
| Reversal speed | Within 1–3 bars of the sweep | Within 1–3 bars of the sweep |
| Volume on sweep | Above 20-bar average | Above 20-bar average |
| RSI at sweep | < 35 (long) | > 65 (short) |

**Expected Outcome.** Price reverses from the sweep level and moves toward the opposite side of the recent range. Expected R: 1.5–3.5. Win rate (historical): 55–65%.

**Target Regimes.** `RANGING` (primary), `TRENDING` (secondary, lower confidence — counter-trend sweeps).

**Target Sessions.** `NEW_YORK` (primary), `LONDON` (secondary). Avoid `OVERNIGHT`.

**Evidence Requirements.** Minimum evidence score: 65. Sweep identification and reversal bar are mandatory.

**Confidence Calculation.** Base confidence = 40. Add 10 for each of: sweep < 0.5 ATR (tight sweep), RSI extreme (< 30 long / > 70 short), high volume on sweep bar, immediate reversal (1 bar), price returns to VWAP within 3 bars. Maximum: 85.

**Expected Lifecycle.** FORMING (1 bar — the reversal bar) → ACTIVE (2–6 bars) → CONFIRMED or EXPIRED. Maximum duration: 10 bars.

---

### B-004 — FAILED_BREAKOUT

**Definition.** Price has broken above a resistance level or below a support level, but failed to sustain the breakout and reversed back through the level. The failure indicates that the breakout was not supported by genuine buying/selling pressure and the original level is likely to act as resistance/support again.

**Classification Rules.** All of the following must be satisfied:

| Condition | Long (failed breakdown) | Short (failed breakout) |
|---|---|---|
| Prior level | Identifiable support/resistance in last 30 bars | Identifiable support/resistance in last 30 bars |
| Initial break | Close beyond level by ≥ 0.25 ATR | Close beyond level by ≥ 0.25 ATR |
| Failure | Close back through level within 1–4 bars | Close back through level within 1–4 bars |
| Volume on failure | Above average on reversal bar | Above average on reversal bar |
| ADX | < 30 (breakout not supported by trend) | < 30 |
| RSI at failure | < 50 (long) | > 50 (short) |

**Expected Outcome.** Price moves back toward the centre of the prior range. Expected R: 1.2–2.5. Win rate (historical): 52–62%.

**Target Regimes.** `RANGING` (primary), `CHOPPY` (secondary).

**Target Sessions.** `NEW_YORK` (primary). Lower quality in `OVERNIGHT`.

**Evidence Requirements.** Minimum evidence score: 60. Initial break and failure confirmation are mandatory.

**Confidence Calculation.** Base confidence = 35. Add 10 for each of: ADX < 20 (very low trend), failure within 2 bars, high volume on failure bar, RSI divergence, prior level tested ≥ 3 times. Maximum: 80.

**Expected Lifecycle.** FORMING (1–2 bars) → ACTIVE (3–8 bars) → CONFIRMED or EXPIRED. Maximum duration: 12 bars.

---

### B-005 — MEAN_REVERSION

**Definition.** Price has moved significantly away from its statistical mean (VWAP or EMA21) and is showing early signs of returning toward that mean. The behaviour is characterised by overextension, exhaustion signals, and a lack of continuation momentum.

**Classification Rules.** All of the following must be satisfied:

| Condition | Long (reversion from below) | Short (reversion from above) |
|---|---|---|
| VWAP distance | Close ≥ 1.5 ATR below VWAP | Close ≥ 1.5 ATR above VWAP |
| RSI | < 35 | > 65 |
| ADX | < 25 (not a strong trend) | < 25 |
| Momentum | Declining (last 3 bars show decreasing range) | Declining |
| EMA structure | EMA9 < EMA21 but converging | EMA9 > EMA21 but converging |
| Volume | Declining on extension bars | Declining |

**Expected Outcome.** Price reverts toward VWAP within 4–10 bars. Expected R: 0.8–1.8. Win rate (historical): 55–65%.

**Target Regimes.** `RANGING` (primary), `CHOPPY` (secondary). Avoid `TRENDING`.

**Target Sessions.** `NEW_YORK` (primary), `LONDON` (secondary).

**Evidence Requirements.** Minimum evidence score: 55. VWAP distance and RSI extreme are mandatory.

**Confidence Calculation.** Base confidence = 35. Add 10 for each of: VWAP distance ≥ 2.0 ATR, RSI < 30 or > 70, ADX < 20, volume declining for ≥ 3 bars, EMA convergence confirmed. Maximum: 80.

**Expected Lifecycle.** FORMING (1–2 bars) → ACTIVE (4–10 bars) → CONFIRMED or EXPIRED. Maximum duration: 15 bars.

---

## Category 3 — Breakout and Compression Behaviours

### B-006 — OPENING_RANGE_BREAKOUT

**Definition.** Price has broken above or below the opening range (first 30–60 minutes of the New York session) with momentum and volume confirmation, indicating directional conviction for the session.

**Classification Rules.** All of the following must be satisfied:

| Condition | Long | Short |
|---|---|---|
| Session | New York session (13:30–14:30 UTC) | New York session |
| Opening range | Defined by first 6 bars (30 min) | Defined by first 6 bars |
| Breakout | Close above OR high by ≥ 0.5 ATR | Close below OR low by ≥ 0.5 ATR |
| Volume | Above 20-bar average on breakout bar | Above 20-bar average |
| ADX | ≥ 15 (any directional movement) | ≥ 15 |
| Prior day context | Not at major resistance (long) | Not at major support (short) |

**Expected Outcome.** Price continues in the breakout direction for 6–15 bars. Expected R: 1.5–4.0. Win rate (historical): 55–65%.

**Target Regimes.** `TRENDING` (primary), `VOLATILE` (secondary).

**Target Sessions.** `NEW_YORK` only. This behaviour is session-specific.

**Evidence Requirements.** Minimum evidence score: 65. Session timing and volume confirmation are mandatory.

**Confidence Calculation.** Base confidence = 45. Add 10 for each of: breakout ≥ 1.0 ATR, volume ≥ 1.5× average, ADX ≥ 20, prior day close in same direction, clean opening range (low ATR during range). Maximum: 90.

**Expected Lifecycle.** FORMING (1 bar — the breakout bar) → ACTIVE (6–15 bars) → CONFIRMED or EXPIRED. Maximum duration: 20 bars.

---

### B-007 — VWAP_RECLAIM

**Definition.** Price has traded below VWAP (or above VWAP for shorts), then reclaimed VWAP with a strong close, indicating a shift in intraday sentiment and the potential for a VWAP-anchored continuation.

**Classification Rules.** All of the following must be satisfied:

| Condition | Long | Short |
|---|---|---|
| Prior position | At least 3 bars below VWAP | At least 3 bars above VWAP |
| Reclaim bar | Close above VWAP by ≥ 0.1 ATR | Close below VWAP by ≥ 0.1 ATR |
| Reclaim bar body | ≥ 60% of bar range | ≥ 60% of bar range |
| Volume | Above 20-bar average | Above 20-bar average |
| RSI | 45–65 (transitioning) | 35–55 |
| ADX | Any | Any |

**Expected Outcome.** Price uses VWAP as support (long) or resistance (short) and continues in the reclaim direction. Expected R: 1.0–2.5. Win rate (historical): 58–68%.

**Target Regimes.** `RANGING` (primary), `TRENDING` (secondary).

**Target Sessions.** `NEW_YORK` (primary), `LONDON` (secondary).

**Evidence Requirements.** Minimum evidence score: 55. Prior VWAP position and reclaim bar quality are mandatory.

**Confidence Calculation.** Base confidence = 40. Add 10 for each of: prior position ≥ 5 bars below/above VWAP, strong reclaim bar body ≥ 75%, volume ≥ 1.3× average, RSI in transition zone, EMA9 crossing EMA21 in same direction. Maximum: 85.

**Expected Lifecycle.** FORMING (1 bar) → ACTIVE (3–8 bars) → CONFIRMED or EXPIRED. Maximum duration: 12 bars.

---

### B-008 — COMPRESSION

**Definition.** Price is in a period of unusually low volatility — a tightening range with contracting ATR and declining volume — indicating that energy is building for a directional expansion. The compression itself is not directional; it is a precursor behaviour that signals high-probability expansion is approaching.

**Classification Rules.** All of the following must be satisfied:

| Condition | Value |
|---|---|
| ATR (current) | ≤ 60% of 20-bar ATR average |
| Bar range (last 3 bars) | Each bar range ≤ 0.5 ATR |
| Volume (last 3 bars) | Below 20-bar average |
| ADX | < 20 |
| Price position | Within 0.5 ATR of VWAP |
| Duration | ≥ 3 consecutive compression bars |

**Expected Outcome.** A directional expansion follows within 1–5 bars. The direction is not determined by this behaviour — it feeds into BREAKOUT_EXPANSION or OPENING_RANGE_BREAKOUT. Expected R (post-expansion): 1.5–4.0.

**Target Regimes.** `RANGING` (primary), `CHOPPY` (secondary).

**Target Sessions.** Any session. Most reliable in `NEW_YORK` pre-open and `LONDON` open.

**Evidence Requirements.** Minimum evidence score: 50. ATR contraction and volume decline are mandatory.

**Confidence Calculation.** Base confidence = 35. Add 10 for each of: ATR ≤ 50% of average, 5+ consecutive compression bars, volume ≤ 70% of average, price within 0.25 ATR of VWAP, ADX < 15. Maximum: 80.

**Expected Lifecycle.** FORMING (3+ bars) → ACTIVE (until expansion) → CONFIRMED (when expansion occurs) or EXPIRED. Maximum duration: 20 bars.

---

### B-009 — BREAKOUT_EXPANSION

**Definition.** Price has broken out of a compression or consolidation zone with strong momentum and volume, indicating the beginning of a new directional move. Unlike OPENING_RANGE_BREAKOUT, this behaviour can occur at any time of day following any compression period.

**Classification Rules.** All of the following must be satisfied:

| Condition | Long | Short |
|---|---|---|
| Prior compression | COMPRESSION behaviour detected in last 10 bars | Same |
| Breakout bar | Close above compression high by ≥ 0.5 ATR | Close below compression low by ≥ 0.5 ATR |
| Volume | ≥ 1.5× 20-bar average | ≥ 1.5× 20-bar average |
| Bar body | ≥ 65% of bar range | ≥ 65% of bar range |
| ADX | Rising (current > previous bar) | Rising |
| RSI | > 55 (long) | < 45 (short) |

**Expected Outcome.** Price continues in the breakout direction for 5–15 bars. Expected R: 2.0–5.0. Win rate (historical): 52–62%.

**Target Regimes.** `TRENDING` (emerging), `VOLATILE`.

**Target Sessions.** `NEW_YORK` (primary), `LONDON` (secondary).

**Evidence Requirements.** Minimum evidence score: 65. Prior compression and volume confirmation are mandatory.

**Confidence Calculation.** Base confidence = 40. Add 10 for each of: breakout ≥ 1.0 ATR, volume ≥ 2.0× average, strong bar body ≥ 75%, ADX rising for ≥ 2 bars, prior compression ≥ 5 bars. Maximum: 88.

**Expected Lifecycle.** FORMING (1 bar) → ACTIVE (5–15 bars) → CONFIRMED or EXPIRED. Maximum duration: 20 bars.

---

## Category 4 — Session and Volatility Behaviours

### B-010 — OVERNIGHT_INVENTORY

**Definition.** The overnight session has created a significant inventory imbalance — price has moved substantially from the prior day's close during the overnight session — and the New York open is likely to see a correction of that imbalance as institutional participants rebalance.

**Classification Rules.** All of the following must be satisfied:

| Condition | Long (overnight sold off) | Short (overnight rallied) |
|---|---|---|
| Overnight move | ≥ 1.5 ATR below prior day close | ≥ 1.5 ATR above prior day close |
| Session | New York pre-open or open (12:00–14:00 UTC) | Same |
| Volume | Below average during overnight move | Below average |
| RSI at open | < 40 (long) | > 60 (short) |
| Prior day context | Prior day closed near middle of range | Same |

**Expected Outcome.** Price reverts toward the prior day's close within 6–15 bars. Expected R: 1.0–2.5. Win rate (historical): 55–65%.

**Target Regimes.** `RANGING` (primary). Avoid `TRENDING` (inventory may be correct).

**Target Sessions.** `NEW_YORK` open only. Session-specific.

**Evidence Requirements.** Minimum evidence score: 60. Overnight move size and session timing are mandatory.

**Confidence Calculation.** Base confidence = 40. Add 10 for each of: overnight move ≥ 2.0 ATR, low overnight volume, RSI extreme at open, prior day close near middle of range, no major news catalyst. Maximum: 85.

**Expected Lifecycle.** FORMING (1 bar at open) → ACTIVE (6–15 bars) → CONFIRMED or EXPIRED. Maximum duration: 20 bars.

---

### B-011 — SESSION_ROTATION

**Definition.** Price is transitioning between major trading sessions (London close / New York open) and exhibiting the characteristic rotation behaviour where the dominant direction of one session reverses as the other session's participants take control.

**Classification Rules.** All of the following must be satisfied:

| Condition | Long (London sell / NY buy) | Short (London buy / NY sell) |
|---|---|---|
| Session transition | Within 30 min of London close (16:30–17:30 UTC) | Same |
| London session direction | Bearish (close < open by ≥ 1.0 ATR) | Bullish (close > open by ≥ 1.0 ATR) |
| Reversal signal | RSI < 40 and turning up | RSI > 60 and turning down |
| VWAP position | Price below VWAP (long) | Price above VWAP (short) |
| Volume | Declining into the rotation | Declining |

**Expected Outcome.** Price rotates in the opposite direction to the London session for 5–12 bars. Expected R: 0.8–2.0. Win rate (historical): 50–60%.

**Target Regimes.** `RANGING` (primary), `TRENDING` (lower confidence — trend may override rotation).

**Target Sessions.** `NEW_YORK` open / `LONDON` close transition only. Session-specific.

**Evidence Requirements.** Minimum evidence score: 55. Session timing and London session direction are mandatory.

**Confidence Calculation.** Base confidence = 35. Add 10 for each of: London session move ≥ 1.5 ATR, RSI extreme at transition, VWAP distance ≥ 0.5 ATR, volume declining for ≥ 3 bars, prior day rotation in same direction. Maximum: 80.

**Expected Lifecycle.** FORMING (1–2 bars) → ACTIVE (5–12 bars) → CONFIRMED or EXPIRED. Maximum duration: 15 bars.

---

### B-012 — VOLATILITY_EXPANSION

**Definition.** Market volatility is expanding significantly — ATR is increasing, bar ranges are widening, and price is moving with unusual speed. This is not a directional behaviour; it is a volatility state that modifies the confidence and expected R of all other detected behaviours.

**Classification Rules.** All of the following must be satisfied:

| Condition | Value |
|---|---|
| ATR (current) | ≥ 150% of 20-bar ATR average |
| Bar range (last 2 bars) | Each ≥ 1.5× 20-bar average bar range |
| Volume | ≥ 1.5× 20-bar average |
| ADX | Rising (current > previous by ≥ 2) |
| RSI | Moving away from 50 (either direction) |

**Expected Outcome.** This behaviour modifies other behaviours rather than generating its own signal. When VOLATILITY_EXPANSION is active: trend behaviours receive a confidence boost (+10), reversal behaviours receive a confidence penalty (-15), compression behaviours are invalidated.

**Target Regimes.** `VOLATILE` (primary), `TRENDING` (secondary).

**Target Sessions.** Any session. Most common at `NEW_YORK` open and major news events.

**Evidence Requirements.** Minimum evidence score: 50. ATR expansion and volume confirmation are mandatory.

**Confidence Calculation.** Base confidence = 50. Add 10 for each of: ATR ≥ 200% of average, volume ≥ 2.0× average, ADX rising for ≥ 3 bars, bar ranges expanding for ≥ 3 bars. Maximum: 90.

**Expected Lifecycle.** FORMING (2 bars) → ACTIVE (until ATR normalises) → EXPIRED. Maximum duration: 30 bars.

---

## Behaviour Interaction Matrix

| | TC | SEP | LS | FB | MR | ORB | VR | COMP | BE | OI | SR | VE |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **TC** | — | amplifies | neutral | contradicts | contradicts | neutral | neutral | precursor | amplifies | neutral | neutral | amplifies |
| **SEP** | amplifies | — | neutral | contradicts | neutral | neutral | neutral | precursor | amplifies | neutral | neutral | reduces |
| **LS** | neutral | neutral | — | co-occurs | co-occurs | neutral | co-occurs | neutral | neutral | neutral | co-occurs | reduces |
| **FB** | contradicts | contradicts | co-occurs | — | co-occurs | neutral | neutral | neutral | neutral | neutral | neutral | reduces |
| **MR** | contradicts | neutral | co-occurs | co-occurs | — | neutral | co-occurs | neutral | neutral | co-occurs | co-occurs | reduces |
| **ORB** | neutral | neutral | neutral | neutral | neutral | — | neutral | precursor | successor | neutral | neutral | amplifies |
| **VR** | neutral | neutral | co-occurs | neutral | co-occurs | neutral | — | neutral | neutral | neutral | neutral | neutral |
| **COMP** | neutral | neutral | neutral | neutral | neutral | precursor | neutral | — | precursor | neutral | neutral | contradicts |
| **BE** | amplifies | amplifies | neutral | neutral | neutral | successor | neutral | successor | — | neutral | neutral | amplifies |
| **OI** | neutral | neutral | neutral | neutral | co-occurs | neutral | neutral | neutral | neutral | — | co-occurs | neutral |
| **SR** | neutral | neutral | co-occurs | neutral | co-occurs | neutral | neutral | neutral | neutral | co-occurs | — | neutral |
| **VE** | amplifies | reduces | reduces | reduces | reduces | amplifies | neutral | contradicts | amplifies | neutral | neutral | — |

*TC=TREND_CONTINUATION, SEP=SECOND_ENTRY_PULLBACK, LS=LIQUIDITY_SWEEP, FB=FAILED_BREAKOUT, MR=MEAN_REVERSION, ORB=OPENING_RANGE_BREAKOUT, VR=VWAP_RECLAIM, COMP=COMPRESSION, BE=BREAKOUT_EXPANSION, OI=OVERNIGHT_INVENTORY, SR=SESSION_ROTATION, VE=VOLATILITY_EXPANSION*

---

## Summary Reference

| ID | Behaviour | Category | Direction | Primary Regime | Primary Session | Min Evidence |
|---|---|---|---|---|---|---|
| B-001 | TREND_CONTINUATION | Trend | Both | TRENDING | NEW_YORK | 55 |
| B-002 | SECOND_ENTRY_PULLBACK | Trend | Both | TRENDING | NEW_YORK | 60 |
| B-003 | LIQUIDITY_SWEEP | Reversal | Both | RANGING | NEW_YORK | 65 |
| B-004 | FAILED_BREAKOUT | Reversal | Both | RANGING | NEW_YORK | 60 |
| B-005 | MEAN_REVERSION | Reversal | Both | RANGING | NEW_YORK | 55 |
| B-006 | OPENING_RANGE_BREAKOUT | Breakout | Both | TRENDING | NEW_YORK only | 65 |
| B-007 | VWAP_RECLAIM | Breakout | Both | RANGING | NEW_YORK | 55 |
| B-008 | COMPRESSION | Compression | None | RANGING | Any | 50 |
| B-009 | BREAKOUT_EXPANSION | Breakout | Both | VOLATILE | NEW_YORK | 65 |
| B-010 | OVERNIGHT_INVENTORY | Session | Both | RANGING | NEW_YORK open | 60 |
| B-011 | SESSION_ROTATION | Session | Both | RANGING | NY/London transition | 55 |
| B-012 | VOLATILITY_EXPANSION | Volatility | None | VOLATILE | Any | 50 |
