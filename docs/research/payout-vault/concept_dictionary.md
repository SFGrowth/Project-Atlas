# Payout Vault — Concept Dictionary v1.0.0
**Sprint:** 123A.9 | **Status:** INTAKE_DRAFT | **Date:** 2026-07-25

This dictionary defines every named concept in the Payout Vault course material. Each entry records the canonical term, all synonyms and abbreviations observed in the source, the source-quoted definition, the machine-intent interpretation, and the primary source lesson(s). Concepts are ordered by dependency: a concept that depends on another is listed after it.

---

## CD-01 — Draw on Liquidity (DOL)

**Abbreviation:** DOL

**Source definition (lesson 02a):**
> The specific price level or zone that the market is currently being drawn toward, based on where resting liquidity sits. Defines the directional bias for the entire setup.

**Source definition (glossary 10b):**
> Draw On Liquidity, the HTF level/zone price is being drawn toward, defines bias.

**Machine intent:** A scalar price level (not a zone) identified on the higher timeframe as the nearest significant resting liquidity pool in the direction of the prevailing HTF structure. In a bearish HTF structure, DOL is the prior swing low or equal lows below current price. In a bullish HTF structure, DOL is the prior swing high or equal highs above current price. DOL is the target level for the trade, not the entry level.

**Timeframe context:** Higher timeframe (HTF). The course uses 4h as the primary HTF reference in visual examples.

**Primary sources:** 02a, 03a, 07a, 10a, 10b, images 14, 19, 21.

---

## CD-02 — Higher Timeframe / Lower Timeframe (HTF / LTF)

**Abbreviations:** HTF, LTF

**Source definition (lesson 02a):**
> HTF is the timeframe used to define DOL and bias. LTF is the timeframe used to identify the MSU and execute the entry. The model is explicitly top-down.

**Machine intent:** The course does not specify exact timeframe values. The visual examples suggest 4h as HTF and 15m or lower as LTF. For MNQ research, the pre-registered pairing is: HTF = 1h or 4h bar, LTF = 5m bar. This must be formalised in the experiment plan before any detector is built.

**Primary sources:** 02a, 07a, 07b.

---

## CD-03 — Market Structure Unit (MSU)

**Abbreviation:** MSU

**Source definition (lesson 02b):**
> The swing sequence being tracked. A series of higher highs and higher lows (bullish MSU) or lower highs and lower lows (bearish MSU). The MSU defines the current structural context on the LTF.

**Machine intent:** A sequence of at least two confirmed swing points on the LTF that establishes a directional structure. A bullish MSU requires at least one higher low and one higher high. A bearish MSU requires at least one lower high and one lower low. The exact swing detection algorithm (lookback, minimum size) must be specified in the experiment plan.

**Primary sources:** 02b, 07b.

---

## CD-04 — Market Structure Shift (MSS)

**Abbreviation:** MSS

**Source definition (lesson 02b):**
> A break of the current MSU's swing sequence. In a bearish MSU, an MSS is a close above the most recent lower high. In a bullish MSU, an MSS is a close below the most recent higher low.

**Machine intent:** A candle close through the most recent swing point in the opposite direction to the prevailing MSU. The course is explicit that an MSS alone is insufficient for entry; CSD confirmation is required.

**Relationship to fMSS:** An MSS that is not confirmed by CSD is reclassified as a fake MSS (fMSS). The fMSS itself becomes inducement.

**Primary sources:** 02b, 04b, 09a, 10b.

---

## CD-05 — Fake MSS / Double MSU (fMSS)

**Abbreviations:** fMSS, Double MSU

**Source definition (lesson 02b):**
> A structure break that's just inducement, not a real shift. The break looks like an MSS but price reverses and continues in the original direction.

**Source definition (lesson 09a):**
> The double MSU trap: a first apparent MSS forms, traders enter, then price sweeps their stops and continues in the original direction. The first MSS was inducement.

**Machine intent:** An MSS that is followed by a reversal back through the break level before CSD is confirmed. Operationally, an fMSS is only identifiable in hindsight unless CSD is used as the confirmation gate. The detector must not label an MSS as real until CSD is confirmed.

**Primary sources:** 02b, 04b, 09a, images 12, 23.

---

## CD-06 — Inducement

**Source definition (lesson 02c):**
> Every swing low in a bullish trend is INDUCEMENT. Every swing high in a bearish trend is INDUCEMENT. An engineered swing point that draws in early entries and stop orders before the real move continues.

**Source definition (lesson 04a):**
> Inducement is not a zone. It is the price of the swing extreme. Traders who buy the swing low in an uptrend thinking "this is support" are the inducement. Their stops below that low are the liquidity the model expects to get run before continuation.

**Machine intent:** The price level of the most recent swing extreme in the direction of the prevailing MSU. In a bearish MSU, inducement is the price of the most recent lower high. In a bullish MSU, inducement is the price of the most recent higher low. Inducement is "swept" when price trades through (not just touches) that level.

**Key distinction:** Inducement is a level, not a zone. The sweep is confirmed when price trades beyond the inducement level, not merely touches it.

**Primary sources:** 02c, 04a, 10b, images 3, 11, 15.

---

## CD-07 — Change in State of Delivery (CSD)

**Abbreviations:** CSD, CISD

**Source definition (lesson 02d):**
> CSD marks the point where the way price is being delivered actually flips. Not just a structure break (that's the MSS), but visible evidence in the candles themselves that momentum has changed hands.

**Source definition (glossary 10b):**
> Change in State of Delivery, the candle-level confirmation that delivery has flipped, via a body close through 50% or through the prior candle.

**Two confirmation rules (lesson 05a):**
> Rule 1: Body close above 50% of the inducement/sweep candle. Rule 2: Body close above the previous candle entirely (a stronger version of the same idea).

**Machine intent:** After inducement has been swept, the CSD confirmation requires a candle body close that satisfies at least one of two conditions: (1) the close price is above (bullish) or below (bearish) the 50% midpoint of the sweep candle's range, or (2) the close price is above (bullish) or below (bearish) the entire body of the immediately preceding candle. Body close is required; wick touch does not qualify.

**Terminology note:** The source uses both "CSD" and "CISD" in different lessons and images. Based on the glossary definition, these are treated as synonyms in this dictionary. "CSD" is the canonical term.

**Primary sources:** 02d, 05a, 05b, 05c, 10b, images 4, 5, 6, 13.

---

## CD-08 — SMT Divergence

**Abbreviation:** SMT (Smart Money Divergence)

**Source definition (lesson 02e):**
> A confirmation technique that compares two correlated instruments. If one instrument makes a new high/low at a swing point and the correlated instrument fails to make that same new high/low, that's SMT divergence.

**Source claim (lesson 02e):**
> "SMT = biggest confirmation." Of all the confluences in the model, divergence between correlated pairs is treated as the strongest signal that a real move (not another inducement) is underway.

**Machine intent:** At the inducement swing point, the primary instrument (MNQ) makes a new extreme. The correlated instrument (pre-registered as MES for this research) fails to make the same new extreme at the same bar or within a defined lookback window. The exact lookback window and price tolerance must be specified in the experiment plan.

**Status:** Optional confirmation filter, not a required entry condition. The cheat sheet marks SMT as "(optional, strongest confirmation)."

**Primary sources:** 02e, 06a, 06b, images 7, 8.

---

## CD-09 — PD Arrays (EPA, IPA, TQL, FVG, iFVG, CME Gap, No-wick Candle)

**Source definition (lesson 02f):**
> Price Delivery arrays are the specific levels and zones the model references constantly.

The sub-concepts are defined individually below.

### CD-09a — External Price Array (EPA)
A significant external swing high or low used as a reference level or target. Equivalent to a prior swing extreme that has not yet been revisited.

### CD-09b — Internal Price Array (IPA)
A reference level inside a range rather than at its boundary. An internal reference point rather than the external high or low.

### CD-09c — Trendline Liquidity (TQL)
A pool of resting liquidity along a trendline connecting a series of similar swing points (equal-ish highs or lows on a slope, not a flat line).

### CD-09d — Fair Value Gap (FVG)
A three-candle imbalance in price delivery. The gap is defined by the high of candle N-2 and the low of candle N (for a bearish FVG) or the low of candle N-2 and the high of candle N (for a bullish FVG). Price often returns to fill this gap before continuing, making it a common re-entry zone.

### CD-09e — Inverted Fair Value Gap (iFVG)
An FVG that has been violated and flipped role: what was support becomes resistance, or vice versa.

### CD-09f — CME Gap
The overnight gap on CME futures charts between Friday close and Sunday open. Price frequently returns to fill this gap.

### CD-09g — No-wick Candle
A candle with no wick on the relevant side (upper wick for a bearish no-wick candle, lower wick for a bullish no-wick candle). Indicates one-directional, uncontested delivery. Often marks the edge of a liquidity pool.

**Machine intent for FVG:** The FVG is the three-candle imbalance created during or immediately after the CSD confirmation sequence. It is used as the Entry 2 zone (see CD-12). The exact FVG boundaries are the high of the candle two bars before the confirmation candle and the low of the confirmation candle (for a bullish FVG).

**Primary sources:** 02f, 03b, 10b, images 6, 10.

---

## CD-10 — 3R Fix

**Source definition (lesson 02g):**
> A fixed 1:3 risk-to-reward trade management target. Risk equals the distance from entry to the invalidation level (just beyond the inducement/sweep low or high). Target equals 3 times that risk, in the direction of the HTF DOL.

**Machine intent:** Stop loss is placed just beyond the swept inducement level. Target is 3× the stop distance in the direction of the DOL. No partial exits, no trailing stop, no manual management. The model is mechanically managed at the exit stage.

**Primary sources:** 02g, 07d, 10a.

---

## CD-11 — Entry Type 1 (Next-Candle Buy/Sell)

**Source definition (lesson 05c, image 13):**
> Entry 1 = next candle buy. The open of the candle immediately following the CSD confirmation candle.

**Machine intent:** Entry price is the open of bar N+1, where bar N is the first bar whose body close satisfies either CSD confirmation rule. This is the aggressive entry type.

**Primary sources:** 05c, image 13.

---

## CD-12 — Entry Type 2 (FVG Retracement)

**Source definition (lesson 05b, 05c, image 13):**
> Entry 2 = FVG buy. A retracement into the Fair Value Gap created by the CSD confirmation sequence.

**Machine intent:** After the CSD confirmation candle, a three-candle FVG is identified. Entry price is within the FVG zone on a subsequent retracement. This is the conservative entry type and may not always trigger if price does not retrace.

**Primary sources:** 05b, 05c, image 13.

---

## CD-13 — Q2 (Quadrant 2)

**Source definition (glossary 10b):**
> Quadrant 2 of a dealing range, a zone statistically favored for reversals.

**Machine intent:** Q2 is mentioned in the glossary but not explained in any lesson in this archive. It is likely a Tier 2 concept. It must be flagged as an unresolved concept pending Tier 2 material.

**Status:** UNRESOLVED — insufficient source material in Tier 1 archive.

**Primary sources:** 10b only.

---

## CD-14 — The 4-Step Process

**Source definition (lesson 10a cheat sheet):**
> 1. Define DOL and market conditions (HTF bias). 2. Define the LTF MSU (mark inducement). 3. CSD entry (body close above 50%, or above previous candle). 4. Print money (manage to 3R fix, target the DOL).

**Machine intent:** The process is a sequential gate system. Each step must be satisfied before the next is evaluated. The process is not a scoring system; it is a hard-gate filter.

**Primary sources:** 07a, 07b, 07c, 07d, 10a, images 14, 15, 16, 18.

