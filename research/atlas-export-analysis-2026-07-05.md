# Atlas Export Analysis — 2026-07-05

## Source

- Export file: `CME_MINI_MNQ1!, 5 (2).csv`
- Market: MNQ1!
- Timeframe: 5 minute
- Rows analysed: 20,463
- Date coverage: 2026-03-22 18:00 to 2026-07-03 12:55 New York time
- Unique trading dates present: 90

## Purpose

This report reviews the first longer Atlas Market Data Exporter file.

The goal is not to prove predictive power. The goal is to check whether the current Atlas state rules are usable for prop-firm evaluation discipline:

- risk_on
- caution
- stand_down
- chop
- volatility
- extension
- session context

Atlas should improve decision quality, reduce unnecessary trades, and preserve capital.

---

## 1. Risk Mode Distribution

| Risk mode | Bars | Percent |
| --- | --- | --- |
| stand_down | 938 | 4.6 |
| caution | 18429 | 90.1 |
| risk_on | 1096 | 5.4 |


### Interpretation

Atlas is currently very conservative.

Only **5.4%** of bars were classified as `risk_on`. Around **90.1%** were classified as `caution`.

That is not automatically wrong for prop-firm trading, but it does mean Atlas is currently acting more like a capital-preservation filter than an opportunity selector.

The next engineering question is:

> Is caution too broad, or is the market genuinely messy most of the time?

---

## 2. Bias Distribution

| Bias | Bars | Percent |
| --- | --- | --- |
| bearish | 5321 | 26.0 |
| neutral | 6573 | 32.1 |
| bullish | 8569 | 41.9 |


### Interpretation

The exported period leaned bullish overall, with bullish alignment appearing more often than bearish or neutral.

This aligns visually with the sample chart period, where MNQ spent large portions of the period trending upward.

---

## 3. Volatility Distribution

| Volatility state | Bars | Percent |
| --- | --- | --- |
| low | 3211 | 15.7 |
| normal | 13796 | 67.4 |
| high | 3456 | 16.9 |


### Interpretation

Normal volatility appears about two-thirds of the time.

High volatility and low volatility are both frequent enough to matter. This supports keeping volatility as a core Atlas dimension.

---

## 4. Chop Distribution

| Chop state | Bars | Percent |
| --- | --- | --- |
| clean | 12412 | 60.7 |
| mild_chop | 7656 | 37.4 |
| heavy_chop | 395 | 1.9 |


### Interpretation

The chop detector is not over-firing at the heavy-chop level.

Heavy chop appeared only **1.9%** of the time, while mild chop appeared **37.4%** of the time.

This is reasonable for a first pass. Heavy chop should remain a strong stand-down candidate.

---

## 5. Extension Distribution

| Extension state | Bars | Percent |
| --- | --- | --- |
| stretched_down | 5084 | 24.8 |
| not_stretched | 6622 | 32.4 |
| stretched_up | 8757 | 42.8 |


### Interpretation

This is the first major design concern.

Only **32.4%** of bars were classified as not stretched. That means the exporter is treating price as extended roughly two-thirds of the time.

Because the current risk logic turns any extension into `caution`, this is probably one of the main reasons `risk_on` is rare.

Engineering view:

> Extension should not automatically make the whole market unsafe. It should probably become a late-entry or location-risk warning.

A clean trend can remain extended for a long time. Calling all extension `caution` may block too many good trend conditions.

---

## 6. Session Risk Distribution

| Session | Risk on bars | Risk on % | Caution bars | Caution % | Stand down bars | Stand down % |
| --- | --- | --- | --- | --- | --- | --- |
| premarket | 238 | 4.8 | 4551 | 92.0 | 158 | 3.2 |
| opening_range | 3 | 0.7 | 354 | 79.7 | 87 | 19.6 |
| mid_morning | 1 | 0.1 | 1137 | 85.4 | 194 | 14.6 |
| midday | 114 | 5.2 | 1985 | 90.9 | 85 | 3.9 |
| power_hour | 26 | 3.1 | 813 | 95.4 | 13 | 1.5 |
| regular_other | 21 | 2.5 | 805 | 94.5 | 26 | 3.1 |
| outside_regular | 693 | 7.0 | 8784 | 89.2 | 375 | 3.8 |


### Interpretation

Opening range and mid-morning are the most restrictive areas.

- Opening range had only **0.7% risk_on**
- Mid-morning had only **0.1% risk_on**
- Opening range stand_down was **19.6%**

This may be acceptable if Atlas is designed to protect against opening volatility, but it also may be too restrictive if the target strategy relies on opening range continuation.

Important note:

The current `session_code` implementation does not perfectly match the original written spec. Code `6` currently means outside regular session, while code `0` means regular-session time not captured by the named windows. This should be clarified in the next exporter version.

---

## 7. Forward Movement Sanity Check

This is a rough 30-minute forward check using 6 future 5-minute bars.

This is not a trading backtest. It only asks whether the labelled state had clean directional follow-through based on the current bias.

| Risk mode | Biased bars | Avg directional 30m | Median directional 30m | Directional win % | Avg absolute 30m move |
| --- | --- | --- | --- | --- | --- |
| stand_down | 44 | 7.79 pts | 7.25 pts | 65.9% | 46.07 pts |
| caution | 12,750 | -0.46 pts | 1.25 pts | 51.5% | 37.79 pts |
| risk_on | 1,096 | -1.58 pts | -1.00 pts | 48.1% | 31.37 pts |


### Interpretation

This does **not** show strong directional prediction from `risk_on`.

That is not fatal, because Atlas is not supposed to predict. But it does tell us not to treat `risk_on` as an entry signal.

The useful finding is different:

- `stand_down` had the largest average 30-minute absolute movement.
- `risk_on` had the smallest average 30-minute absolute movement.

This suggests the current stand_down logic may be catching unstable or fast-moving conditions, while risk_on is selecting calmer conditions.

That fits the capital-preservation mission, but it may also mean risk_on is too conservative for capturing expansion trades.

---

## 8. First Engineering Conclusions

### Keep

- Separate exporter module.
- Risk mode classification.
- Chop score.
- Volatility state.
- EMA/VWAP cross counting.
- Extension measurement.
- Session context.

### Review

- Extension should not automatically force caution.
- Risk_on may be too rare.
- Opening range may be too restricted.
- Session code labels need cleanup.
- Forward directional movement should not be used as a prediction score.

### Do Not Do Yet

Do not add execution.

Do not connect TradersPost.

Do not build buy/sell signals from this yet.

The exporter is working, but the state rules need refinement before they should influence execution.

---

## 9. Recommended Next Sprint

## Sprint 006 — Exporter Calibration v0.2

Objective:

Refine Atlas Market Data Exporter rules so exported state labels are cleaner and more useful for validation.

Recommended changes:

1. Fix session code definitions.
2. Split extension into `location_risk_code` instead of automatically forcing `caution`.
3. Add separate `late_entry_risk_code`.
4. Keep `stand_down` strict.
5. Re-test risk_on distribution after calibration.
6. Add documentation for every code mapping.

Acceptance target:

- `risk_on` should remain selective, but not so rare that it becomes unusable.
- `stand_down` should remain protective.
- `caution` should mean something specific, not just “anything imperfect.”

---

## 10. Current Decision

Atlas Market Data Exporter v0.1 is successful as an export tool.

Atlas risk classification v0.1 is useful, but probably too conservative.

The correct next move is calibration, not automation.


Put it into your repo here: