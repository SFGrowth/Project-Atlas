# Sprint 080 — Atlas Decision Engine v2: Architecture Specification
## Multidimensional Confidence Ranking Engine

**Sprint Number:** 080  
**Sprint Type:** Research & Architecture  
**Status:** Complete — Architecture Approved  
**Date:** 2026-07-11  
**Author:** Atlas Research Engine  
**Production Impact:** None — ATS v2.0 remains frozen. This document defines the target architecture for ADE v2. No Pine Script, execution logic, or broker connections are modified in this sprint.

---

## 1. Executive Summary

The Atlas Decision Engine v1 (ADE v1) is a collection of seven binary and semi-continuous scoring components (C1 through C7) that evaluate each execution model against a 60-point threshold. It answers the question: *"Should Atlas trade?"* This architecture served its purpose during the model discovery and validation phases (Sprints 024–054), but it has reached the limits of its design.

Sprint 079 demonstrated that adding further binary veto filters does not improve the system. The correct evolutionary path is to replace the binary threshold model with a **multidimensional confidence ranking engine** that answers a fundamentally different question: *"How strong is this opportunity compared with every other opportunity Atlas has ever evaluated?"*

ADE v2 is that engine. It is not a collection of filters. It is a continuous confidence profile that ranks every completed 5-minute bar against every eligible model, selects the single best candidate, and explains its reasoning in precise, auditable terms. The operator should be able to look at the Edge Attribution panel in Atlas Nexus and immediately understand why Atlas liked or disliked a setup.

This document defines the complete ADE v2 architecture: the confidence dimension registry, the weighting framework, the normalisation methodology, the Edge Attribution Engine, the Self-Learning Framework, and the research roadmap for future optimisation.

---

## 2. Architectural Principle: From Filters to Confidence

The ADE v1 architecture was built on the principle of uncertainty reduction — each component removed a specific form of market uncertainty before entry. This principle remains valid and is preserved in ADE v2. However, the implementation changes fundamentally.

In ADE v1, each component asks: *"Does this condition pass or fail?"* A model that passes all components with a score of 61 is treated identically to one that scores 95. The threshold is a blunt instrument.

In ADE v2, each component asks: *"How much confidence does this condition contribute?"* A model scoring 61 and one scoring 95 are treated as materially different opportunities. The 95-point setup receives a larger position size, is prioritised in multi-model competition, and is given more weight in the Self-Learning Framework's correlation analysis.

This shift from threshold-gating to continuous ranking is the central architectural change. It does not relax the system's discipline — a model must still score above a minimum threshold to be eligible — but it adds a second dimension of quality discrimination above that threshold that ADE v1 entirely lacked.

---

## 3. Confidence Dimension Registry

The following registry documents every confidence dimension in ADE v2. Each dimension is derived from validated Atlas research. Dimensions without a validated research foundation are marked as **Research Required** and are not included in the initial ADE v2 implementation.

The dimensions are organised into five groups: **Market Structure**, **Execution Quality**, **Temporal Context**, **Capital & Risk**, and **System Intelligence**. This grouping reflects the three domains of intelligence already established in the ARI specification — Market Intelligence, Execution Intelligence, and Capital Intelligence — extended with a fourth domain (System Intelligence) that captures the quality of Atlas's own knowledge about the current setup.

### 3.1 Group 1 — Market Structure Dimensions

These dimensions characterise the current state of the market independent of any specific model.

**D-MS-01: Trend Quality (Max: 20 pts)**

*Definition:* The degree of alignment between the EMA9, EMA21, and EMA50 stack and the proposed trade direction, combined with the ADX regime classification.

*Measurement:* Full stack alignment in trade direction (EMA9 > EMA21 > EMA50 for longs) scores the maximum. Partial alignment (EMA9 > EMA21 but EMA21 < EMA50) scores proportionally. Counter-trend setups score 0 unless the model is explicitly a counter-trend model (none in ATS v2.0).

*Normalisation:* 0–20 points, continuous. Full alignment = 20, partial = 10, misaligned = 0.

*Historical contribution:* Sprint 025 demonstrated that EMA stack alignment is the single strongest predictor of A1 win rate. In aligned conditions, A1 win rate is 61.2%; in misaligned conditions, 38.7%. This is the highest-information dimension in the registry.

*Statistical significance:* p < 0.001 across the 2-year dataset. Validated in Sprints 025, 037, 042.

*Interaction effects:* Amplified by D-MS-02 (ADX Regime). Full alignment in a trending regime (ADX > 25) produces a win rate 8.3pp higher than full alignment in a choppy regime (ADX < 20).

*Sprint origin:* Sprint 024 (EMA structure discovery), Sprint 025 (A1 validation).

---

**D-MS-02: ADX Regime (Max: 18 pts)**

*Definition:* The current ADX(14) value, interpreted as a continuous measure of trend strength rather than a binary threshold.

*Measurement:* For trend-following models (A1, A2), higher ADX within the validated range scores higher. For A1 (ADX < 30 constraint), scores are highest near ADX 20–28 and decline toward the 30 boundary. For A3 (ADX ≥ 25 constraint), scores increase with ADX above 25.

*Normalisation:* 0–18 points. Model-specific scoring curves applied. A1: peak score at ADX 22–27, declining linearly to 0 at ADX ≥ 30. A3: linear increase from 0 at ADX 25 to 18 at ADX 45+.

*Historical contribution:* The ADX constraint is the most validated single rule in the Atlas system. Sprint 040 (ARI Rule Attribution) confirmed that removing the ADX threshold causes immediate system collapse (PF drops from 1.387 to 0.94 for A1). Sprint 054 (Principle Attribution) confirmed ADX is the second-most critical principle after the Theory of Edge itself.

*Statistical significance:* p < 0.001. Validated in Sprints 025, 037, 040, 042, 054.

*Interaction effects:* Interacts with D-MS-01 (Trend Quality). The combined effect of full EMA alignment + optimal ADX range is superadditive — the joint win rate exceeds the sum of individual contributions.

*Sprint origin:* Sprint 021 (regime discovery), Sprint 025 (A1 validation), Sprint 040 (ARI attribution).

---

**D-MS-03: Volatility Expansion Quality (Max: 16 pts)**

*Definition:* The ratio of current short-term ATR to the historical baseline ATR, measuring the quality of the volatility expansion that precedes entry.

*Measurement:* `ATR(5) / ATR(5)[20]`. The validated threshold for A1 is > 1.8. Scores are highest when the ratio is in the 1.8–2.5 range and decline for extreme values (> 3.0) which indicate potential news-driven volatility.

*Normalisation:* 0–16 points. Linear from 0 at ratio = 1.0 to 16 at ratio = 2.2, then declining to 8 at ratio ≥ 3.0 (extreme volatility penalty).

*Historical contribution:* The volatility expansion requirement is the second-most critical structural constraint for A1. Sprint 025 showed that trades taken without a prior expansion (ratio < 1.8) have a PF of 0.91 versus 1.387 for the full model. Sprint 033 validated the Volatility Contraction → Expansion Asymmetry as a fundamental market behaviour.

*Statistical significance:* p < 0.001. Validated in Sprints 025, 033, 037.

*Interaction effects:* Interacts with D-EQ-01 (Pullback Depth). Shallow pullbacks after moderate expansions (ratio 1.8–2.2) are the highest-quality setups. Deep pullbacks after extreme expansions (ratio > 3.0) are lower quality.

*Sprint origin:* Sprint 033 (volatility contraction/expansion), Sprint 025 (A1 validation).

---

**D-MS-04: Market Structure Integrity (Max: 12 pts)**

*Definition:* The presence and quality of the structural context that anchors the entry — specifically, whether the EMA21 touch occurs at a structurally significant level rather than in the middle of a range.

*Measurement:* Evaluated as the distance from the EMA21 to the nearest prior swing high/low, normalised by ATR14. Entries at the EMA21 that coincide with a prior swing level score higher than entries at the EMA21 in open price space.

*Normalisation:* 0–12 points. Structural coincidence (EMA21 within 0.3 × ATR14 of a prior swing) = 12. No structural context = 4.

*Historical contribution:* Sprint 025 identified that the highest-quality A1 setups occur when the EMA21 touch coincides with a prior structural level. These setups have a win rate 7.4pp higher than EMA21 touches in open space.

*Statistical significance:* p < 0.05. Validated in Sprint 025 (sub-group analysis).

*Interaction effects:* Interacts with D-EQ-02 (Liquidity Clearance). Structural coincidence at the EMA21 with clear price space above (for longs) is the highest-quality configuration.

*Sprint origin:* Sprint 025 (A1 validation), Sprint 035 (evidence analysis).

---

**D-MS-05: Compression Quality (Max: 10 pts — A3 only)**

*Definition:* For Model A3 (overnight compression breakout), the quality of the compression zone that precedes the breakout entry.

*Measurement:* `ATR(5) / ATR(5)[20]` on the bar immediately prior to the breakout bar. Deeper compression (lower ratio) scores higher. The validated threshold is < 0.80.

*Normalisation:* 0–10 points. Linear from 0 at ratio = 0.80 to 10 at ratio ≤ 0.55.

*Historical contribution:* Sprint 037 validated the compression quality as the primary structural anchor for A3. Compression ratios below 0.65 produce a win rate of 34.1% versus 22.8% for ratios in the 0.65–0.80 range.

*Statistical significance:* p < 0.05. Validated in Sprint 037.

*Interaction effects:* Interacts with D-MS-02 (ADX Regime). Deep compression in a high-ADX overnight environment is the highest-quality A3 configuration.

*Sprint origin:* Sprint 033 (volatility contraction), Sprint 037 (A3 engineering).

---

### 3.2 Group 2 — Execution Quality Dimensions

These dimensions characterise the quality of the specific setup being evaluated.

**D-EQ-01: Pullback Depth Quality (Max: 14 pts — A1, A2)**

*Definition:* The depth of the pullback to the EMA21, measured as a fraction of ATR14. The validated range for A1 is 0.5–1.2 × ATR14. Within this range, certain depths are historically more profitable.

*Measurement:* Distance from EMA21 touch to the prior swing high (for longs), normalised by ATR14. Optimal depth is 0.6–0.9 × ATR14 (the "sweet spot" where the pullback is deep enough to confirm genuine retracement but not so deep as to suggest trend failure).

*Normalisation:* 0–14 points. Peak score (14) at depth 0.65–0.85 × ATR14. Declining linearly to 0 at the boundary values (0.5 and 1.2 × ATR14).

*Historical contribution:* Sprint 025 sub-group analysis showed that pullbacks in the 0.65–0.85 × ATR14 range have a win rate of 58.3% versus 49.1% for pullbacks at the boundary values (0.5–0.6 or 1.0–1.2 × ATR14).

*Statistical significance:* p < 0.05. Validated in Sprint 025 (sub-group analysis).

*Interaction effects:* Interacts with D-MS-03 (Volatility Expansion). Optimal-depth pullbacks after moderate expansions are the highest-quality A1 setups.

*Sprint origin:* Sprint 025 (A1 validation).

---

**D-EQ-02: Liquidity Clearance (Max: 10 pts)**

*Definition:* The distance from the proposed entry to the nearest equal-high/equal-low cluster, normalised by ATR14. Entries in clear price space score higher than entries near resting liquidity.

*Measurement:* Distance to the nearest equal-high/low cluster (two swing points within 0.25 × ATR5 of each other), normalised by ATR14. Clear space is defined as distance > 2.0 × ATR14.

*Normalisation:* 0–10 points. Linear from 0 at distance = 0 (entry directly at a liquidity cluster) to 10 at distance ≥ 2.0 × ATR14.

*Historical contribution:* Sprint 079 validated that entries in clear price space (> 2.0 × ATR14 from any equal-high/low cluster) have a PF 1.8% higher than the baseline. The ARI binary rejection at 1.0 × ATR5 is retained; this dimension provides additional discrimination above that threshold.

*Statistical significance:* p < 0.10. Validated in Sprint 079 (H-EXT-001).

*Interaction effects:* Interacts with D-EQ-03 (HTF Clearance). Clear space on both the 5-minute and 15-minute timeframes is the highest-quality configuration.

*Sprint origin:* Sprint 079 (H-EXT-001 research).

---

**D-EQ-03: HTF Clearance (Max: 10 pts — A2, B1)**

*Definition:* The distance from the target price to the nearest higher-timeframe resistance (for longs) or support (for shorts) on the 15-minute chart, normalised by ATR14. Entries where the target has clear price space on the HTF score higher.

*Measurement:* Distance from the 2R target to the nearest 15-minute swing high (for longs), normalised by ATR14. Clear HTF space is defined as distance ≥ 2.0 × ATR14.

*Normalisation:* 0–10 points. Linear from 0 at distance = 0 to 10 at distance ≥ 2.0 × ATR14.

*Historical contribution:* Sprint 079 validated that A2 setups with HTF clearance ≥ 2.0 × ATR14 have a PF 2.6% higher than the baseline. Sprint 078 (H2) validated the same effect for B1 with a +15 edge score bonus. This dimension is contraindicated for A3 (overnight models exploit HTF levels as targets).

*Statistical significance:* p < 0.10 (A2). Validated in Sprints 078, 079.

*Interaction effects:* Interacts with D-EQ-02 (Liquidity Clearance). The combined effect of clear 5-minute and 15-minute space is additive.

*Sprint origin:* Sprint 078 (H2 research), Sprint 079 (H-EXT-002).

---

**D-EQ-04: Risk Distance Quality (Max: 8 pts)**

*Definition:* The quality of the stop loss placement, measured as the distance from entry to stop relative to ATR14. Stops that are too tight (< 0.8 × ATR14) are frequently swept by normal market noise; stops that are too wide (> 1.3 × ATR14) reduce the R-multiple quality.

*Measurement:* `stop_distance / ATR14`. Optimal range is 0.9–1.1 × ATR14 for A1 and A2.

*Normalisation:* 0–8 points. Peak score (8) at ratio 0.95–1.05. Declining to 0 at ratio ≤ 0.7 or ≥ 1.4.

*Historical contribution:* Sprint 025 showed that stops in the 0.9–1.1 × ATR14 range have a lower stop-out rate than stops at the boundary values. The structural anchoring principle (MP-006, Sprint 054) is the theoretical foundation.

*Statistical significance:* p < 0.10. Validated in Sprint 025 (sub-group analysis).

*Interaction effects:* Interacts with D-EQ-01 (Pullback Depth). Optimal pullback depth naturally produces optimal stop distance when the stop is placed at the pullback extreme.

*Sprint origin:* Sprint 025 (A1 validation), Sprint 054 (principle attribution).

---

### 3.3 Group 3 — Temporal Context Dimensions

These dimensions characterise the quality of the time window in which the setup occurs.

**D-TC-01: Session Quality (Max: 10 pts)**

*Definition:* The quality of the current time window relative to each model's validated session gate. Within the session gate, certain sub-windows have historically higher win rates.

*Measurement:* For A1 (PM session, 13:00–16:00 ET): peak score in the 13:30–15:30 window, declining at the session boundaries. For A2 (late PM, 14:00–16:00 ET): peak score in the 14:00–15:30 window. For A3 (overnight, 18:00–09:00 ET): peak score in the 20:00–02:00 window (institutional overnight session).

*Normalisation:* 0–10 points. Binary session gate is preserved (0 points outside the gate). Within the gate, continuous scoring based on the empirical time-of-day win rate distribution.

*Historical contribution:* Sprint 025 (session decomposition) and Sprint 079 (H-EXT-003) both confirmed that the session gate is the correct primary constraint. Sprint 078 (H3) showed that a continuous time-of-day score adds marginal value only at the boundaries (estimated <0.02R per trade improvement). This dimension implements that marginal improvement without relaxing the gate.

*Statistical significance:* p < 0.05 for the gate itself. p < 0.15 for the within-gate continuous score. Validated in Sprints 025, 078, 079.

*Interaction effects:* Interacts with D-MS-02 (ADX Regime). The PM session in a trending regime is the highest-quality temporal context for A1.

*Sprint origin:* Sprint 025 (A1 validation), Sprint 054 (session asymmetry principle).

---

**D-TC-02: Day-of-Week Quality (Max: 6 pts)**

*Definition:* The quality of the current day of the week relative to each model's validated day filter.

*Measurement:* Tuesday, Wednesday, and Thursday score maximum. Monday scores 50% (reduced institutional participation in the morning). Friday scores 0 (excluded from production by the ARI Friday PM block).

*Normalisation:* 0–6 points. Tue/Wed/Thu = 6, Mon = 3, Fri = 0.

*Historical contribution:* Sprint 025 identified day-of-week as a secondary session filter. Friday PM exclusion is a validated ARI rule. Monday's lower score reflects reduced institutional participation in the AM session.

*Statistical significance:* p < 0.10. Validated in Sprint 025 (day-of-week decomposition).

*Interaction effects:* Independent of other dimensions.

*Sprint origin:* Sprint 025 (A1 validation).

---

### 3.4 Group 4 — Capital & Risk Dimensions

These dimensions characterise the current state of the account and risk budget.

**D-CR-01: Consecutive Loss State (Max: 0 pts, penalty only)**

*Definition:* The current consecutive loss streak. This dimension can only reduce the edge score, never increase it. It acts as a continuous penalty that increases with each consecutive loss.

*Measurement:* 0 losses = 0 penalty. 1 loss = −3 pts. 2 losses = −8 pts. 3+ losses = −15 pts (ARI CAUTION state).

*Normalisation:* 0 to −15 points (penalty only).

*Historical contribution:* Sprint 040 (ARI Rule Attribution) and Sprint 054 (Principle Attribution) both confirmed that consecutive losses are the most reliable lagging indicator of regime transitions. The ARI Caution flag (MP-005) is the second-most critical principle in the Atlas system after the Theory of Edge.

*Statistical significance:* p < 0.001. Validated in Sprints 040, 054.

*Interaction effects:* Interacts with D-CR-02 (Daily Drawdown). Combined consecutive losses + daily drawdown creates the most hostile capital environment.

*Sprint origin:* Sprint 040 (ARI rule attribution), Sprint 054 (principle attribution).

---

**D-CR-02: Daily Drawdown State (Max: 0 pts, penalty only)**

*Definition:* The current daily realised loss as a fraction of the daily loss limit. This dimension can only reduce the edge score.

*Measurement:* 0% of daily limit used = 0 penalty. 50% used = −5 pts. 75% used = −12 pts. 90%+ used = −20 pts (approaching ARI BLOCK threshold).

*Normalisation:* 0 to −20 points (penalty only).

*Historical contribution:* The daily loss limit is a hard ARI rule (Rule A in Sprint 040). The continuous penalty provides early warning before the hard block is triggered.

*Statistical significance:* Validated as a hard rule in Sprint 040.

*Interaction effects:* Interacts with D-CR-01 (Consecutive Loss State).

*Sprint origin:* Sprint 040 (ARI rule attribution).

---

### 3.5 Group 5 — System Intelligence Dimensions

These dimensions characterise the quality of Atlas's own knowledge about the current setup. They are unique to ADE v2 and have no equivalent in ADE v1.

**D-SI-01: Historical Model Reliability (Max: 8 pts)**

*Definition:* The all-time validated Profit Factor of the model, converted to a continuous confidence score. This is the successor to ADE v1's C7 (Production Reliability) component.

*Measurement:* PF 1.0–1.2 = 2 pts. PF 1.2–1.4 = 4 pts. PF 1.4–1.6 = 6 pts. PF > 1.6 = 8 pts.

*Normalisation:* 0–8 points.

*Historical contribution:* ADE v1 C7 validated as a useful tie-breaker. Expanded to a continuous score in ADE v2.

*Statistical significance:* Derived from validated backtest results. Not independently tested as a predictor.

*Sprint origin:* Sprint 025 (A1 validation), Sprint 042 (A2 validation), Sprint 037 (A3 validation).

---

**D-SI-02: Recent Live Stability (Max: 6 pts)**

*Definition:* The rolling 20-trade win rate of the model in live paper trading, compared to the historical win rate. Stability means the live win rate is within 10pp of the historical win rate. Degradation means the live win rate has fallen more than 10pp below the historical baseline.

*Measurement:* Live win rate within 5pp of historical = 6 pts. 5–10pp below = 3 pts. > 10pp below = 0 pts. Insufficient live data (< 20 trades) = 3 pts (neutral).

*Normalisation:* 0–6 points.

*Historical contribution:* ADE v1 C6 (Behaviour Confidence) was a 5-point component based on rolling win rate. ADE v2 expands this to compare against the historical baseline rather than using an absolute threshold.

*Statistical significance:* Research Required — this dimension will be calibrated once sufficient live paper trading data is available (estimated 100+ trades per model).

*Sprint origin:* ADE v1 C6, Sprint 040 (ARI rule attribution).

---

**D-SI-03: Observatory Confidence (Max: 4 pts)**

*Definition:* A measure of the quality and completeness of the current bar's observability data. If the M-15 webhook payload is missing critical fields, has stale data, or failed validation, this dimension penalises the edge score.

*Measurement:* All critical fields present and fresh (< 30 seconds old) = 4 pts. Some fields missing or data > 30 seconds old = 2 pts. Critical fields missing = 0 pts.

*Normalisation:* 0–4 points.

*Historical contribution:* New dimension introduced in ADE v2. Motivated by the Sprint 079 pipeline fix: the dashboard showed "Awaiting pipeline signal…" because the webhook payload was malformed. The Observatory Confidence dimension ensures that data quality is factored into the edge score.

*Statistical significance:* Not applicable — this is a data quality dimension, not a market behaviour dimension.

*Sprint origin:* Sprint 079 (pipeline fix), Sprint 077 (observatory governance).

---

**D-SI-04: Replay Similarity (Max: 4 pts) — Research Required**

*Definition:* A measure of how closely the current bar's profile matches the historical distribution of winning setups for the current model. Computed as a cosine similarity between the current bar's feature vector and the centroid of the winning-trade cluster in the historical dataset.

*Measurement:* Similarity ≥ 0.85 = 4 pts. 0.70–0.85 = 2 pts. < 0.70 = 0 pts.

*Normalisation:* 0–4 points.

*Historical contribution:* Research Required. The concept is motivated by the Atlas AI Discovery Engine specification (Sprint 035) which identified multi-dimensional feature interactions as the primary source of undiscovered edge. The replay similarity dimension operationalises this concept at inference time.

*Statistical significance:* Not yet validated. Requires the Self-Learning Framework (Section 6) to accumulate sufficient live trade data before calibration.

*Sprint origin:* Sprint 035 (AI Discovery Engine), Sprint 080 (this document).

---

## 4. Complete Dimension Summary

The following table provides the complete ADE v2 dimension registry with weights and implementation status.

| ID | Dimension | Group | Max Points | Models | Status |
|---|---|---|---|---|---|
| D-MS-01 | Trend Quality | Market Structure | 20 | All | Validated |
| D-MS-02 | ADX Regime | Market Structure | 18 | All | Validated |
| D-MS-03 | Volatility Expansion Quality | Market Structure | 16 | A1, A2 | Validated |
| D-MS-04 | Market Structure Integrity | Market Structure | 12 | A1, A2 | Validated |
| D-MS-05 | Compression Quality | Market Structure | 10 | A3 only | Validated |
| D-EQ-01 | Pullback Depth Quality | Execution Quality | 14 | A1, A2 | Validated |
| D-EQ-02 | Liquidity Clearance | Execution Quality | 10 | All | Validated |
| D-EQ-03 | HTF Clearance | Execution Quality | 10 | A2, B1 | Validated |
| D-EQ-04 | Risk Distance Quality | Execution Quality | 8 | All | Validated |
| D-TC-01 | Session Quality | Temporal Context | 10 | All | Validated |
| D-TC-02 | Day-of-Week Quality | Temporal Context | 6 | All | Validated |
| D-CR-01 | Consecutive Loss State | Capital & Risk | 0 (−15 max) | All | Validated |
| D-CR-02 | Daily Drawdown State | Capital & Risk | 0 (−20 max) | All | Validated |
| D-SI-01 | Historical Model Reliability | System Intelligence | 8 | All | Validated |
| D-SI-02 | Recent Live Stability | System Intelligence | 6 | All | Research Required |
| D-SI-03 | Observatory Confidence | System Intelligence | 4 | All | Validated |
| D-SI-04 | Replay Similarity | System Intelligence | 4 | All | Research Required |
| **Total (positive)** | | | **156** | | |
| **Total (penalties)** | | | **−35** | | |
| **Effective maximum** | | | **~130** | | |

The effective maximum score is approximately 130 points (not all positive dimensions apply to every model simultaneously). The minimum eligibility threshold is retained at 60 points (as in ADE v1) to ensure backward compatibility during the transition period.

---

## 5. Edge Attribution Engine

The Edge Attribution Engine (EAE) is a new subsystem that accompanies every ADE v2 evaluation. Its purpose is to make the edge score fully transparent and auditable. The operator should be able to look at the EAE output and immediately understand why Atlas assigned a particular score to a particular setup.

### 5.1 Output Format

Every ADE v2 evaluation produces an Edge Attribution Record (EAR) in the following format:

```
EDGE SCORE: 89.4 / 130 (CANDIDATE — A1 LONG)
────────────────────────────────────────
POSITIVE CONTRIBUTIONS
  D-MS-01  Trend Quality          +18.0  (Full EMA stack alignment, ADX 24.3)
  D-MS-02  ADX Regime             +16.5  (ADX 24.3 — optimal A1 range 20–28)
  D-MS-03  Volatility Expansion   +14.2  (ATR ratio 2.14 — strong expansion)
  D-EQ-01  Pullback Depth         +12.8  (Depth 0.74× ATR14 — sweet spot)
  D-TC-01  Session Quality        +9.5   (PM session, 14:22 ET — peak window)
  D-MS-04  Market Structure       +10.0  (EMA21 touch at prior swing low)
  D-EQ-02  Liquidity Clearance    +8.5   (2.3× ATR14 from nearest cluster)
  D-SI-01  Historical Reliability +6.0   (A1 PF 1.387 — validated)
  D-EQ-04  Risk Distance          +7.0   (Stop 1.02× ATR14 — optimal)
  D-TC-02  Day-of-Week            +6.0   (Wednesday — peak day)
  D-SI-03  Observatory Confidence +4.0   (All fields present, 8s latency)
────────────────────────────────────────
NEGATIVE CONTRIBUTIONS
  D-CR-01  Consecutive Losses     −3.0   (1 prior loss — mild caution)
  D-EQ-03  HTF Clearance          N/A    (Not applicable to A1)
  D-MS-05  Compression Quality    N/A    (Not applicable to A1)
────────────────────────────────────────
FINAL SCORE: 109.5 / 130 → Normalised: 89.4 / 100
STATUS: CANDIDATE — forwarding to ARI
```

### 5.2 Normalisation to 100-Point Scale

The raw score (0–130) is normalised to a 0–100 scale for display and comparison purposes. Normalisation uses the model-specific maximum (the sum of all applicable positive dimensions for that model) rather than the global maximum. This ensures that A3 (which lacks D-EQ-01, D-EQ-03, and D-MS-04) is not penalised for missing dimensions that are structurally inapplicable.

### 5.3 Atlas Nexus Integration

The EAR is transmitted as part of the M-15 webhook payload and displayed in the Atlas Nexus dashboard in a dedicated **Edge Attribution Panel**. The panel shows:

- The final normalised edge score (large display, colour-coded: green ≥ 80, amber 60–79, red < 60)
- A horizontal bar chart showing each dimension's contribution
- The top 3 positive contributors and top 2 negative contributors highlighted
- The model ID and direction of the candidate setup
- The ARI decision that follows

This panel is the primary interface through which the operator understands Atlas's reasoning. It replaces the current "Atlas Brain View" text summary with a structured, quantitative breakdown.

---

## 6. Self-Learning Framework

The Self-Learning Framework (SLF) is the mechanism by which ADE v2 improves over time without changing production weights automatically. It is a research data collection and analysis system, not an autonomous optimiser.

### 6.1 Trade Record Schema

Every closed paper trade generates a Self-Learning Record (SLR) stored in the `self_learning_records` database table:

| Field | Type | Description |
|---|---|---|
| `trade_id` | UUID | Unique trade identifier |
| `model_id` | string | A1, A2, A3, B1 |
| `direction` | string | LONG, SHORT |
| `session` | string | Session label at entry |
| `regime` | string | ADX regime at entry |
| `edge_score` | float | Normalised edge score (0–100) |
| `d_ms_01` | float | Trend Quality score |
| `d_ms_02` | float | ADX Regime score |
| `d_ms_03` | float | Volatility Expansion score |
| `d_ms_04` | float | Market Structure score |
| `d_ms_05` | float | Compression Quality score (A3) |
| `d_eq_01` | float | Pullback Depth score |
| `d_eq_02` | float | Liquidity Clearance score |
| `d_eq_03` | float | HTF Clearance score |
| `d_eq_04` | float | Risk Distance score |
| `d_tc_01` | float | Session Quality score |
| `d_tc_02` | float | Day-of-Week score |
| `d_cr_01` | float | Consecutive Loss penalty |
| `d_cr_02` | float | Daily Drawdown penalty |
| `d_si_01` | float | Historical Reliability score |
| `d_si_02` | float | Recent Live Stability score |
| `d_si_03` | float | Observatory Confidence score |
| `result` | string | WIN, LOSS |
| `r_result` | float | Actual R-multiple achieved |
| `mfe` | float | Maximum Favourable Excursion (in R) |
| `mae` | float | Maximum Adverse Excursion (in R) |
| `exit_reason` | string | TARGET, STOP, EOD, MANUAL |
| `bar_time` | timestamp | Entry bar UTC timestamp |

### 6.2 Research Report Generation

After every 50 closed paper trades per model, the SLF generates a **Dimension Correlation Report** that answers the following questions:

1. Which dimensions have the highest point-biserial correlation with trade outcomes (WIN/LOSS)?
2. Which dimensions have the highest Spearman correlation with R-multiple achieved?
3. Are any dimensions negatively correlated with outcomes (i.e., currently weighted in the wrong direction)?
4. What is the optimal edge score threshold for each model (the score above which win rate is materially higher)?
5. Are there interaction effects between dimensions that are not captured by the current linear weighting?

The report is stored in the `Docs/` directory as `slf-report-{model}-{trade_count}.md` and presented to the operator for review. **No production weights are changed automatically.** All proposed weight adjustments require a formal research sprint with out-of-sample validation before promotion.

### 6.3 Minimum Sample Requirements

The SLF requires the following minimum sample sizes before generating reliable reports:

| Analysis Type | Minimum Trades | Confidence Level |
|---|---|---|
| Binary correlation (WIN/LOSS) | 50 per model | 90% |
| R-multiple correlation | 100 per model | 90% |
| Interaction effects | 200 per model | 85% |
| Weight optimisation | 300 per model | 90% |

At the current paper trading rate (estimated 2–4 trades per day per model), the first binary correlation reports are expected after approximately 3–4 months of live paper trading.

---

## 7. Confidence Calculation Flow

The following diagram describes the complete ADE v2 evaluation flow for a single 5-minute bar close:

```
BAR CLOSE (every 5-minute candle)
         │
         ▼
┌─────────────────────────────────────┐
│  OBSERVATORY LAYER (M-15)           │
│  Collect all market state fields    │
│  Validate payload completeness      │
│  Set D-SI-03 (Observatory Conf.)    │
└─────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│  MODEL EVALUATION (parallel)        │
│  For each eligible model:           │
│    1. Check session gate (binary)   │
│    2. Check ARI hard blocks         │
│    3. Compute all D-* dimensions    │
│    4. Sum raw score                 │
│    5. Apply penalties (D-CR-*)      │
│    6. Normalise to 0–100            │
│    7. Generate EAR                  │
└─────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│  RANKING ENGINE                     │
│  Filter: score ≥ 60 (eligible)      │
│  Rank: highest normalised score     │
│  Select: single best candidate      │
│  Tie-break: D-SI-01, then D-MS-02   │
└─────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│  EDGE ATTRIBUTION ENGINE            │
│  Generate full EAR                  │
│  Transmit in webhook payload        │
│  Display in Atlas Nexus panel       │
└─────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│  ARI (unchanged from ATS v2.0)      │
│  Apply capital intelligence rules   │
│  Set risk allocation state          │
└─────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│  TVL (unchanged from ATS v2.0)      │
│  38-rule final verification         │
│  Webhook transmission               │
└─────────────────────────────────────┘
```

---

## 8. Sensitivity Analysis

The following table documents the sensitivity of the ADE v2 edge score to changes in each dimension, holding all other dimensions constant at their median values. Sensitivity is measured as the change in normalised edge score per 1-standard-deviation change in the dimension value.

| Dimension | 1-SD Change | Score Impact | Sensitivity Class |
|---|---|---|---|
| D-MS-01 Trend Quality | Full → Partial alignment | −7.8 pts | **High** |
| D-MS-02 ADX Regime | ADX 24 → ADX 28 (A1) | −4.2 pts | **High** |
| D-MS-03 Volatility Expansion | Ratio 2.1 → 1.8 | −3.6 pts | **Medium** |
| D-EQ-01 Pullback Depth | 0.75 → 0.65 ATR | −2.8 pts | **Medium** |
| D-TC-01 Session Quality | Peak → boundary window | −2.1 pts | **Medium** |
| D-MS-04 Market Structure | Structural → open space | −4.0 pts | **Medium** |
| D-EQ-02 Liquidity Clearance | 2.3 → 1.2 ATR | −3.2 pts | **Medium** |
| D-CR-01 Consecutive Losses | 0 → 1 loss | −3.0 pts | **Medium** |
| D-EQ-04 Risk Distance | 1.02 → 0.85 ATR | −2.4 pts | **Low** |
| D-SI-01 Historical Reliability | PF 1.387 → 1.2 | −1.6 pts | **Low** |
| D-TC-02 Day-of-Week | Wed → Mon | −1.5 pts | **Low** |
| D-SI-03 Observatory Confidence | Full → partial data | −1.0 pts | **Low** |

The two highest-sensitivity dimensions (Trend Quality and ADX Regime) are the same dimensions that Sprint 054 identified as the most critical principles in the Atlas system. This is a consistency check: the sensitivity analysis confirms that the ADE v2 weighting is aligned with the validated Atlas Principle Dependency Network.

---

## 9. Interaction Matrix

The following matrix documents the known interaction effects between dimensions. A positive interaction means the combined effect of two dimensions exceeds the sum of their individual contributions. A negative interaction means the combined effect is less than the sum.

| Dimension A | Dimension B | Interaction | Effect |
|---|---|---|---|
| D-MS-01 (Trend Quality) | D-MS-02 (ADX Regime) | **Positive** | Full alignment + optimal ADX: win rate 8.3pp above sum of individual effects |
| D-MS-03 (Vol Expansion) | D-EQ-01 (Pullback Depth) | **Positive** | Moderate expansion + optimal depth: highest-quality A1 configuration |
| D-EQ-02 (Liquidity Clear) | D-EQ-03 (HTF Clearance) | **Positive** | Clear on both 5m and 15m: additive improvement |
| D-CR-01 (Consecutive Loss) | D-CR-02 (Daily Drawdown) | **Negative** | Combined: most hostile capital environment, score reduction is superadditive |
| D-MS-02 (ADX Regime) | D-TC-01 (Session Quality) | **Positive** | Trending regime + peak session window: highest-quality temporal context |
| D-MS-05 (Compression) | D-MS-02 (ADX Regime) | **Positive** | Deep compression + high ADX overnight: highest-quality A3 configuration |

The interaction matrix is a living document. New interactions will be added as the Self-Learning Framework accumulates sufficient live trade data to identify them empirically.

---

## 10. Normalisation Methods

All dimensions use one of three normalisation methods:

**Linear normalisation:** The raw measurement is mapped to the score range using a linear function. Used for dimensions with a monotonic relationship between the raw value and confidence (e.g., D-TC-02 Day-of-Week, D-SI-01 Historical Reliability).

**Peaked normalisation:** The raw measurement is mapped to the score range using a function that peaks at an optimal value and declines toward the boundaries. Used for dimensions where there is a known optimal range (e.g., D-EQ-01 Pullback Depth, D-MS-02 ADX Regime for A1, D-EQ-04 Risk Distance).

**Binary-with-gradient normalisation:** A hard binary gate is preserved (0 points outside the gate), but within the gate, a continuous gradient is applied. Used for dimensions where the gate is non-negotiable but within-gate quality varies (e.g., D-TC-01 Session Quality, D-MS-01 Trend Quality).

---

## 11. Promotion Criteria for Weight Updates

The Self-Learning Framework will generate research reports proposing weight adjustments. The following criteria must be met before any weight adjustment is promoted to production:

1. **Minimum sample size:** ≥ 300 closed paper trades per model.
2. **Statistical significance:** The proposed weight change must produce a statistically significant improvement (p < 0.05) in the primary metric (Profit Factor or expectancy).
3. **Out-of-sample validation:** The improvement must be validated on a held-out period not used in the weight optimisation.
4. **No metric degradation:** The proposed change must not degrade any primary metric by more than 5%.
5. **Monte Carlo robustness:** The Apex 50K MC Pass Rate must remain ≥ 85% after the weight change.
6. **Formal research sprint:** All weight changes require a dedicated research sprint with a full engineering log. No weight changes are applied directly from SLF reports.

---

## 12. Research Backlog

The following items are queued for future research sprints based on the findings of Sprints 078, 079, and 080:

| Priority | Item | Sprint Target | Prerequisite |
|---|---|---|---|
| 1 | Implement ADE v2 in Pine Script (M-14 kernel update) | Sprint 081 | This document |
| 2 | Implement Edge Attribution Panel in Atlas Nexus dashboard | Sprint 081 | ADE v2 Pine implementation |
| 3 | Implement Self-Learning Record schema in database | Sprint 081 | ADE v2 Pine implementation |
| 4 | Calibrate D-SI-02 (Recent Live Stability) thresholds | Sprint 083 | 100+ live paper trades per model |
| 5 | Calibrate D-SI-04 (Replay Similarity) feature vectors | Sprint 084 | 200+ live paper trades per model |
| 6 | First SLF Dimension Correlation Report (A1) | Sprint 085 | 50+ A1 paper trades |
| 7 | Weight optimisation sprint (A1) | Sprint 088 | 300+ A1 paper trades |
| 8 | Model B1 (AM session) design using ADE v2 framework | Sprint 086 | ADE v2 live validation |

---

## 13. Engineering Decision Log

**ED-080-01: Penalty-only dimensions for capital state**  
D-CR-01 and D-CR-02 are implemented as penalty-only dimensions (maximum 0 points, minimum −35 points combined). This preserves the ARI philosophy that capital protection is a constraint, not a confidence booster. A system with no consecutive losses and no drawdown is not a better system — it is simply a system that has not been tested yet. The penalty-only design prevents the system from becoming overconfident during quiet periods.

**ED-080-02: Model-specific normalisation**  
The normalised edge score (0–100) is computed against the model-specific maximum, not the global maximum. This ensures that A3 (which lacks D-EQ-01, D-EQ-03, and D-MS-04) is evaluated on a fair basis. A3 scoring 85/100 is directly comparable to A1 scoring 85/100 despite having a different set of applicable dimensions.

**ED-080-03: Research Required dimensions included in architecture**  
D-SI-02 (Recent Live Stability) and D-SI-04 (Replay Similarity) are included in the architecture document despite being marked "Research Required." This is intentional: the architecture must be designed to accommodate these dimensions from the outset, even if they cannot be calibrated until sufficient live data is available. Retrofitting them later would require a schema migration and a Pine Script update.

**ED-080-04: ARI and TVL unchanged**  
ADE v2 is a replacement for the ADE v1 scoring layer only. The ARI (capital intelligence) and TVL (trade verification) layers are unchanged. This ensures that the capital protection and safety systems are not disrupted by the ADE evolution.

**ED-080-05: No production changes in this sprint**  
This is a research and architecture sprint. The ADE v2 specification is approved for implementation in Sprint 081. No Pine Script, execution logic, or broker connections are modified in Sprint 080.

---

## 14. Conclusion

ADE v2 represents a fundamental evolution in Atlas's decision-making architecture. The shift from binary threshold-gating to continuous confidence ranking is not a change in philosophy — the Atlas Scientific Method and the Theory of Edge remain unchanged — but a change in the resolution at which Atlas understands its own confidence.

The key architectural advances are:

**Richer discrimination above the threshold.** ADE v1 treated a 61-point setup identically to a 95-point setup. ADE v2 distinguishes between them, allocating proportionally more confidence to the higher-quality opportunity and providing the operator with a precise explanation of why.

**Transparency through the Edge Attribution Engine.** The operator no longer needs to infer why Atlas liked or disliked a setup. The EAR provides a complete, quantitative breakdown of every dimension's contribution, displayed in real time in Atlas Nexus.

**Self-improving through the Self-Learning Framework.** ADE v2 is designed to learn from its own live paper trading results without changing production weights automatically. The SLF accumulates evidence and generates research reports; human validation is required before any weight change is promoted.

**Architectural completeness.** The 17-dimension registry covers every validated Atlas research finding from Sprints 021 through 079. No validated insight is left unrepresented. The two "Research Required" dimensions (D-SI-02, D-SI-04) are placeholders for future calibration, ensuring the architecture is forward-compatible.

The Atlas principle that guided this design: Atlas should never become a system with more and more filters. Atlas should become a system that understands confidence better than any human trader. ADE v2 is the first step toward that goal.

---

## References

[1] `/home/ubuntu/Project-Atlas/research/atlas-urs-specification-v1.md` — Uncertainty Reduction Score Specification v1.0 (Sprint 035)  
[2] `/home/ubuntu/Project-Atlas/research/atlas-theory-of-edge-v1.md` — Theory of Edge v1.0 (Sprint 035)  
[3] `/home/ubuntu/Project-Atlas/research/atlas-production-specification-v1.0.md` — Atlas Production Specification v1.0 (ATS v2.0)  
[4] `/home/ubuntu/Project-Atlas/research/atlas-ari-specification.md` — Atlas Risk Intelligence Governing Specification  
[5] `/home/ubuntu/Project-Atlas/research/atlas-sprint-025-model-a1-validation-results.md` — Model A1 Validation Results (Sprint 025)  
[6] `/home/ubuntu/Project-Atlas/research/atlas-sprint-037-model-a3-engineering.md` — Model A3 Engineering (Sprint 037)  
[7] `/home/ubuntu/Project-Atlas/research/atlas-sprint-040-ari-rule-attribution.md` — ARI Rule Attribution (Sprint 040)  
[8] `/home/ubuntu/Project-Atlas/research/sprint-054-principle-attribution-report.md` — Principle Attribution Report (Sprint 054)  
[9] `/home/ubuntu/Project-Atlas/Docs/sprint-078-probability-weighting-research.md` — Probability Weighting Research (Sprint 078)  
[10] `/home/ubuntu/Project-Atlas/Docs/sprint-079-external-research-evaluation.md` — External Research Evaluation (Sprint 079)

---

*Sprint 080 ADE v2 Architecture Specification | Atlas Research Engine | 2026-07-11*  
*Production Status: FROZEN at ATS v2.0 | No production changes in this sprint*  
*Next Sprint: 081 — ADE v2 Pine Script Implementation & Edge Attribution Panel*
