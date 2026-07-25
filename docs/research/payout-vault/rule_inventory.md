# Payout Vault — Rule Inventory v1.0.0
**Sprint:** 123A.9 | **Status:** INTAKE_DRAFT | **Date:** 2026-07-25

This inventory lists every rule, condition, and constraint stated or implied in the Payout Vault source material. Each rule is assigned a unique identifier, a type, a source quote, a machine-intent translation, and an ambiguity flag. Rules are grouped by the process step they govern.

---

## Step 0 — Context and Bias Rules

| ID | Rule | Source Quote | Machine Intent | Ambiguous? |
|---|---|---|---|---|
| R-01 | HTF DOL must be defined before any LTF analysis begins | "Define DOL and market conditions" (10a) | No LTF setup is valid unless a DOL level has been identified on the HTF | No |
| R-02 | DOL is the nearest resting liquidity pool in the direction of HTF structure | "The specific price level or zone that the market is currently being drawn toward" (02a) | DOL = prior swing low (bearish) or prior swing high (bullish) on HTF | Partial — "zone vs level" ambiguity |
| R-03 | HTF structure must align with the trade direction | "Market conditions stop you from trading against the higher timeframe draw" (09c) | If HTF structure is bullish, only long setups are valid; if bearish, only short setups | No |
| R-04 | The model is explicitly top-down | "HTF is the timeframe used to define DOL and bias. LTF is the timeframe used to identify the MSU and execute the entry" (02a) | All steps must be evaluated in order: HTF first, LTF second | No |

---

## Step 1 — DOL and Market Conditions

| ID | Rule | Source Quote | Machine Intent | Ambiguous? |
|---|---|---|---|---|
| R-05 | DOL is a level, not a zone | "It is the price of the swing extreme" (04a, by analogy to inducement) | DOL is stored as a scalar price, not a range | Partial — lesson 02a says "level/zone" |
| R-06 | DOL defines the directional target for the trade | "Target equals 3 times that risk, in the direction of the HTF DOL" (02g) | The trade target is the DOL level | No |

---

## Step 2 — LTF MSU and Inducement

| ID | Rule | Source Quote | Machine Intent | Ambiguous? |
|---|---|---|---|---|
| R-07 | Every swing low in a bullish LTF trend is inducement | "Every swing low in a bullish trend is INDUCEMENT" (02c, 04a, image 11) | In a bullish MSU, each confirmed swing low is an inducement level | No |
| R-08 | Every swing high in a bearish LTF trend is inducement | "Every swing high in a bearish trend is INDUCEMENT" (02c, 04a, image 11) | In a bearish MSU, each confirmed swing high is an inducement level | No |
| R-09 | Inducement is a level, not a zone | "Inducement is not a zone. It is the price of the swing extreme" (04a) | Inducement level = exact price of the swing extreme | No |
| R-10 | Inducement is swept when price trades through (not just touches) the level | "Their stops below that low are the liquidity the model expects to get run" (02c) | Sweep confirmed when low of any bar < inducement level (bearish sweep) or high of any bar > inducement level (bullish sweep) | Partial — "through" vs "close through" not specified |
| R-11 | The MSU must be identified on the LTF before the inducement swing is marked | "Define the LTF MSU" (07b) | Swing detection must precede inducement identification | No |

---

## Step 3 — CSD Confirmation

| ID | Rule | Source Quote | Machine Intent | Ambiguous? |
|---|---|---|---|---|
| R-12 | CSD requires a body close, not a wick touch | "Body close above 50% of the inducement/sweep candle" (02d, 05a) | Only candle body close price is evaluated; wick highs/lows are excluded | No |
| R-13 | CSD Rule 1: body close above/below 50% of sweep candle | "Body close above 50% of the inducement/sweep candle" (05a) | Close > (sweep_candle_low + 0.5 × sweep_candle_range) for bullish; Close < (sweep_candle_high − 0.5 × sweep_candle_range) for bearish | Partial — exact handling of close exactly at 50% not specified |
| R-14 | CSD Rule 2: body close above/below the entire prior candle body | "Body close above the previous candle entirely (a stronger version)" (02d, 05a) | Close > prior_candle_close AND Close > prior_candle_open (bullish); Close < prior_candle_close AND Close < prior_candle_open (bearish) | No |
| R-15 | Either CSD rule is sufficient; Rule 2 is stronger but not required | "Once either condition is met, delivery has changed state" (02d) | OR logic: R-13 OR R-14 triggers CSD | No |
| R-16 | CSD must occur after inducement has been swept | "CSD marks the point where delivery flips" (02d) — implied sequence | The CSD confirmation candle must be at or after the bar that swept inducement | No |
| R-17 | An MSS alone is not sufficient for entry | "Not just a structure break (that's the MSS), but visible evidence in the candles" (02d) | Entry is blocked until CSD is confirmed regardless of MSS | No |
| R-18 | CSD must occur within a reasonable number of bars after the sweep | Not explicitly stated in source | Ambiguous — maximum wait window not defined | YES — UNRESOLVED |

---

## Step 4 — Entry and Trade Management

| ID | Rule | Source Quote | Machine Intent | Ambiguous? |
|---|---|---|---|---|
| R-19 | Entry Type 1 is the open of the next candle after CSD confirmation | "Entry 1 = next candle buy" (05c, image 13) | Entry price = open of bar N+1 where bar N is the CSD confirmation bar | No |
| R-20 | Entry Type 2 is a retracement into the FVG created by the CSD sequence | "Entry 2 = FVG buy" (05c, image 13) | Entry price = within the FVG zone on a subsequent retracement bar | Partial — FVG boundaries and fill definition not fully specified |
| R-21 | Stop loss is placed just beyond the swept inducement level | "Invalidation set just beyond the sweep point" (10a) | Stop = swept_inducement_level − buffer (bearish) or + buffer (bullish) | Partial — "just beyond" not quantified |
| R-22 | Target is exactly 3R | "Fixed 1:3 risk-to-reward trade management target" (02g) | Target = entry ± 3 × |entry − stop| | No |
| R-23 | Target direction is toward the HTF DOL | "Target equals 3 times that risk, in the direction of the HTF DOL" (02g) | Target is set in the direction of the DOL, not necessarily at the DOL | No |
| R-24 | No partial exits or manual management | "Keeps the model mechanical at the exit stage" (02g) | Full position closed at target or stop; no intermediate exits | No |

---

## Confirmation Filters (Optional)

| ID | Rule | Source Quote | Machine Intent | Ambiguous? |
|---|---|---|---|---|
| R-25 | SMT divergence is the strongest optional confirmation | "SMT = biggest confirmation" (02e) | If SMT divergence is present at the inducement swing, setup confidence is highest | No |
| R-26 | SMT requires a correlated instrument to fail to confirm the new extreme | "One instrument makes a new high/low and the correlated instrument fails to make that same new high/low" (02e) | At the inducement sweep bar, primary instrument makes new extreme; correlated instrument does not | Partial — lookback window and tolerance not specified |
| R-27 | SMT is optional, not required | "SMT divergence checked on a correlated instrument (optional, strongest confirmation)" (10a) | Setup is valid without SMT; SMT only upgrades confidence | No |

---

## Failure Mode Rules

| ID | Rule | Source Quote | Machine Intent | Ambiguous? |
|---|---|---|---|---|
| R-28 | Do not enter on a fake MSS | "Skipping straight to 'structure broke, I'm in' is exactly the failure mode" (09c) | An MSS without CSD confirmation must be treated as fMSS until CSD confirms | No |
| R-29 | Do not enter when the setup is obvious to everyone | "When everyone sees the same setup, the setup is likely to fail" (09b) | Crowded/obvious MSS without LTF confirmation is a low-quality setup | Partial — "obvious" is not machine-definable |
| R-30 | Be careful of double MSU | "Be careful of double MSU" (04b, 09a, images 12, 23) | After a first fMSS, the real MSS may follow; the first fMSS is itself inducement | No |

---

## Unresolved Rules (require Tier 2 material or further research)

| ID | Rule | Status |
|---|---|---|
| R-18 | Maximum wait window after inducement sweep before CSD is required | UNRESOLVED |
| R-31 | Q2 quadrant definition and its role in setup filtering | UNRESOLVED — Tier 2 concept |
| R-32 | No-wick candle exact quantitative threshold | UNRESOLVED |
| R-33 | Stop buffer size ("just beyond") | UNRESOLVED |
| R-34 | FVG fill definition for Entry Type 2 | PARTIAL |

