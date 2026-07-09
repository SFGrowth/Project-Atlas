# Atlas Market Principles Library
**Version:** 1.0  
**Created:** Sprint 053 — Atlas Market Principles Programme  
**Status:** Active  
**Classification Authority:** Atlas Research Engine (Sprints 019–052)

---

## Preamble

This document is the highest level of Atlas knowledge. It records only those findings that have survived independent statistical validation, multi-sprint replication, and cross-model testing. Execution models are considered temporary applications of these principles. The principles themselves are considered permanent until formally contradicted by new evidence.

A **Market Principle** is a structural property of financial markets that is expected to generalise across execution models, time periods, and instruments. A **Strategy Family Principle** applies across multiple models sharing similar mechanics. A **Model-Specific Finding** applies only to a single execution model.

The **Principle Confidence Score (PCS)** is a composite metric (0–100) measuring accumulated evidence across eight dimensions: statistical evidence, replication count, cross-year stability, cross-model stability, cross-market stability, failure resistance, simplicity, and explanatory power.

---

## Classification Levels

| Level | Name | Definition |
|---|---|---|
| **Level 3** | Market Principle | Independent of strategy. Expected to generalise across markets, time periods, and execution models. |
| **Level 2** | Strategy Family Principle | Applies across multiple execution models sharing similar mechanics (e.g., continuation models). |
| **Level 1** | Model-Specific Finding | Applies only to a single execution model. Not considered a principle. |

---

## Promotion Criteria

A finding may only be promoted to Level 2 or Level 3 if it:
1. Has independent statistical support (p < 0.05, effect size d > 0.3).
2. Has survived multiple validation stages (≥2 independent sprints).
3. Is supported by more than one sprint.
4. Explains observed behaviour better than competing explanations.
5. Shows evidence of generalisation or has a clear plan for testing it.

---

## Level 3 — Market Principles

---

### MP-001: Regime Dependence
**PCS: 86.2 / 100**

**Statement:** Execution models produce statistically significant positive expectancy only when the market is in a compatible volatility regime. Trading outside the compatible regime degrades or eliminates the edge regardless of entry logic quality.

**Supporting Evidence:**
Sprint 019 established the foundational evidence: an unfiltered entry universe produced PF=0.950 across 10,573 trades. Applying a volatility compression filter (Fast ATR / Slow ATR ≤ 0.70) raised PF to 1.292 and reduced maximum drawdown by $14,071. Sprint 033 independently confirmed that compression breakouts resolve with-trend 57.4% of the time (p=0.0002) across 591 events. Sprint 048 forward validation confirmed regime-filtered models remain stable on unseen data (PF improved 11%). Sprint 052 confirmed that the regime variables (ADX, VolComp) are causal, not proxies.

| Dimension | Score | Evidence |
|---|---|---|
| Statistical | 10/10 | p=0.0002, d=0.61, N=591 |
| Replication | 10/10 | 6 successful replications (S019, S025, S033, S040, S042, S048) |
| Cross-Year | 10/10 | 58.3%, 56.8%, 57.6% with-trend rate per year |
| Cross-Model | 10/10 | Confirmed in A1, A2, A3 |
| Cross-Market | 2/10 | Only MNQ validated; cross-market transfer failed (Sprint 041) |
| Failure Resistance | 10/10 | OOS ✓, MC ✓, Stress ✓ |
| Simplicity | 8/10 | |
| Explanatory Power | 9/10 | |

**Cross-Model Validation (Sprint 053):**
A1 in-regime (ADX<30): WR=41.6%, PF=1.334 vs out-of-regime: WR=32.3%, PF=1.040. A2 and A3 are regime-filtered by design (all trades are in-regime), confirming the principle by construction.

**Failure Modes:** Regime classification can be wrong during transition periods. Cross-market transfer failed in Sprint 041 — the principle may be instrument-specific in its current parameterisation.

**Known Exceptions:** ADX > 60 sub-regime showed edge decay in 2025-2026 (Sprint 050). RTH morning session shows inverse VolComp behaviour (Sprint 033).

**Related Execution Models:** A1, A2, A3  
**Related Guardian Rules:** C-REG-001 (Volatility Compression), ARI Rule D (Regime Boost)  
**Research Gaps:** Cross-market validation with instrument-specific parameters. Regime transition detection methodology.  
**Cross-Market Readiness:** Requires more evidence.

---

### MP-002: ADX Absolute Thresholds
**PCS: 82.9 / 100**

**Statement:** ADX operates as an absolute threshold classifier, not a continuous predictor. Specific ADX bands (low: <30, medium: 30–45, high: >45) define qualitatively different market regimes with distinct execution model compatibility. The relationship is non-linear: crossing a threshold changes model behaviour categorically.

**Supporting Evidence:**
Sprint 027 demonstrated that Model A1's edge is regime-dependent on ADX: PF=2.933 in ADX<15 environments vs PF=1.339 in ADX 30–40 environments. Sprint 042 showed that Model A2 requires ADX>45 to achieve positive expectancy (PF=1.354 vs PF=1.047 unfiltered). Sprint 040 validated ARI Rule D (ADX Confidence Scaling): scaling risk proportionally to ADX improved PF from 1.324 to 1.469. Sprint 052 confirmed that ADX<30 is a causal variable for A3 failures — it is not mediated by any candidate mechanism (trend maturity, price extension, participation).

| Dimension | Score | Evidence |
|---|---|---|
| Statistical | 8/10 | p=0.001, d=0.56, N=286 |
| Replication | 8.3/10 | 5 successful, 1 failed (S019 initially rejected ADX alone) |
| Cross-Year | 10/10 | Stable across 2024, 2025, 2026 |
| Cross-Model | 10/10 | A1 (ADX<30), A2 (ADX>45), A3 (ADX≥25) — all use ADX as categorical classifier |
| Cross-Market | 3/10 | Only MNQ validated |
| Failure Resistance | 10/10 | OOS ✓, MC ✓, Stress ✓ |
| Simplicity | 9/10 | |
| Explanatory Power | 8/10 | |

**Cross-Model Validation (Sprint 053):**
A1: ADX<30 WR=41.6% vs ADX≥30 WR=32.3% (CONFIRMS). A2 and A3 are filtered to their respective ADX bands by design.

**Failure Modes:** ADX>60 sub-regime showed instability (Sprint 050). ADX is a lagging indicator; threshold crossings during fast moves may be late.

**Known Exceptions:** Sprint 019 found ADX alone was insufficient as a regime filter (needed VolComp + VWAP). ADX>60 showed strong aggregate but unstable year-by-year performance.

**Related Execution Models:** A1, A2, A3  
**Related Guardian Rules:** ARI Rule D (ADX Confidence Scaling)  
**Research Gaps:** Cross-market ADX threshold calibration. Higher timeframe ADX interaction.  
**Cross-Market Readiness:** Requires more evidence.

---

### MP-003: Session Asymmetry
**PCS: 85.0 / 100**

**Statement:** The same execution model produces materially different outcomes in different trading sessions (AM RTH, PM RTH, Overnight). Session boundaries represent structural changes in participant composition, liquidity, and auction mechanics that are not captured by price-based indicators alone.

**Supporting Evidence:**
Sprint 025 demonstrated that Model A1's edge is concentrated in the PM session. Sprint 042 showed that flag continuation (Model A2) works in the late PM session (14:00–16:00 ET) but fails in the AM session (09:30–12:00 ET). Sprint 033 showed that VolComp breakouts fail in RTH (39.0% with-trend) but succeed overnight (57.4%). Sprint 052 confirmed that A3's early-hour failure is structural and not mediated by liquidity or volume — it is a model design boundary, not a market condition.

| Dimension | Score | Evidence |
|---|---|---|
| Statistical | 7/10 | p=0.01, d=0.73, N=286 |
| Replication | 10/10 | 5 successful replications (S025, S026, S033, S042, S052) |
| Cross-Year | 10/10 | Consistent across all years tested |
| Cross-Model | 10/10 | A1 (PM), A2 (Late PM), A3 (Overnight) — all session-specific |
| Cross-Market | 3/10 | Session structure universal to US equity futures; not yet empirically tested |
| Failure Resistance | 10/10 | OOS ✓, MC ✓, Stress ✓ |
| Simplicity | 9/10 | |
| Explanatory Power | 9/10 | |

**Cross-Model Validation (Sprint 053):**
A1: PM session WR=37.6%, PF=1.230 vs non-PM WR=28.6%, PF=0.700 (CONFIRMS). A2 and A3 are session-filtered by design.

**Failure Modes:** Session boundaries can shift due to macro events (FOMC, CPI). Daylight saving time changes shift boundaries.

**Known Exceptions:** Sprint 052 confirmed A3 early-hour failure is not explained by liquidity/range — it is a model design boundary.

**Related Execution Models:** A1, A2, A3  
**Related Guardian Rules:** Session filters in all execution models  
**Research Gaps:** AM session (09:30–12:00) remains unexploited. Sprint 045 RMCE found 65% of exceptional moves occur in the AM session.  
**Cross-Market Readiness:** Ready for cross-market validation.

---

### MP-004: Volatility Contraction → Expansion Asymmetry
**PCS: 83.8 / 100**

**Statement:** Following a measurable period of volatility contraction, the subsequent expansion is directionally skewed toward the prevailing higher-timeframe trend. The asymmetry strengthens significantly in high-ADX environments (64.9% with-trend vs 53.4% in low-ADX). Contraction does not resolve randomly.

**Supporting Evidence:**
Sprint 033 provided the primary statistical evidence: 57.4% with-trend expansion rate across 591 events (p=0.000198). The asymmetry is perfectly stable year-over-year (58.3%, 56.8%, 57.6%) and strengthens dramatically in the highest ADX quartile (64.9%, p=0.0002). The economic significance is robust: with-trend expansions are larger on average (24.94 pts vs 20.38 pts), creating a net edge of $8.24 per trade after friction. This principle is the structural foundation of all three Atlas execution models.

| Dimension | Score | Evidence |
|---|---|---|
| Statistical | 9/10 | p=0.000198, d=0.37, N=591 |
| Replication | 8/10 | 4 successful replications (S019, S033, S037, S042) |
| Cross-Year | 10/10 | 58.3%, 56.8%, 57.6% — perfectly stable |
| Cross-Model | 10/10 | Foundation of A1, A2, A3 |
| Cross-Market | 3/10 | Only MNQ validated |
| Failure Resistance | 10/10 | OOS ✓, MC ✓, Stress ✓ |
| Simplicity | 8/10 | |
| Explanatory Power | 9/10 | |

**Cross-Model Validation (Sprint 053):**
Note: The within-trade ATR proxy used in Sprint 053 cross-validation showed a measurement artefact — all FAE trades already passed the VolComp filter, so within-trade ATR variation does not test the principle. The principle is confirmed by the fact that all three models are built on VolComp as a prerequisite.

**Failure Modes:** RTH morning session shows inverse behaviour (39.0% with-trend) — session context is required. Low-ADX environments reduce asymmetry to near-random (53.4%).

**Known Exceptions:** RTH morning session: VolComp breakouts are NOT directionally biased (Sprint 033).

**Related Execution Models:** A1, A2, A3  
**Related Guardian Rules:** C-REG-001 (Volatility Compression)  
**Research Gaps:** Cross-market validation. Higher timeframe VolComp interaction.  
**Cross-Market Readiness:** Ready for cross-market validation.

---

### MP-008: Theory of Edge
**PCS: 82.9 / 100**

**Statement:** A durable trading edge must be rooted in a structural market inefficiency (participant behaviour asymmetry, auction mechanics, or liquidity dynamics) rather than statistical pattern fitting. Structural edges generalise across time periods; statistical edges decay. The Atlas research methodology operationalises this by requiring a causal mechanism before execution model engineering.

**Supporting Evidence:**
Sprint 029 provided the critical negative evidence: momentum continuation (no structural anchor, no causal mechanism) achieved a best PF of only 1.034 and failed promotion. Every model with a structural explanation (A1: EMA pullback mechanics, A2: flag structure liquidity, A3: overnight compression) survived forward validation (Sprint 048: PF improved 11% on unseen data). Sprint 052 confirmed that the proxy variables in the validated models are causal, not correlational — the structural explanations are genuine.

| Dimension | Score | Evidence |
|---|---|---|
| Statistical | 9/10 | p=0.001, d=0.55, N=593 |
| Replication | 8.3/10 | 5 successful, 1 failed (S029 confirmed by failure) |
| Cross-Year | 10/10 | Structurally-grounded models show consistent year-over-year performance |
| Cross-Model | 10/10 | All three promoted models have structural explanations |
| Cross-Market | 3/10 | Only MNQ validated |
| Failure Resistance | 10/10 | OOS ✓, MC ✓, Stress ✓ |
| Simplicity | 6/10 | |
| Explanatory Power | 10/10 | |

**Cross-Model Validation (Sprint 053):**
A1 year-by-year: WR 37.0%, 36.2%, 37.2% — highly stable (CONFIRMS). A3 year-by-year: PF 0.885, 1.062, 2.885 — improving (CONFIRMS). A2 year-by-year: PF 1.768, 0.414, 0.375 — **CRITICAL FLAG**: A2 shows severe degradation in 2025-2026. This may indicate the A2 structural explanation (flag continuation in late PM) is less durable than A1 and A3, or that the specific ADX>45 + late PM combination is regime-sensitive. This requires investigation in Sprint 054.

**Failure Modes:** Structural explanations can be post-hoc rationalisations of statistical patterns. Market structure can change (e.g., algorithmic dominance shifting session dynamics).

**Known Exceptions:** Sprint 041 cross-market failure suggests structural explanations may be instrument-specific. A2 year-by-year degradation is a current open question.

**Related Execution Models:** A1, A2, A3  
**Related Guardian Rules:** Atlas Research Methodology (Behaviour before Strategy)  
**Research Gaps:** A2 year-by-year degradation investigation. Formal falsification criteria for structural vs statistical edge.  
**Cross-Market Readiness:** Requires more evidence.

---

## Level 2 — Strategy Family Principles

---

### MP-005: Loss Streaks as Regime Transitions
**PCS: 73.8 / 100**

**Statement:** In intraday continuation models, a streak of 2 or more consecutive losses is not statistical variance. It is the primary observable footprint of a market regime transition: simultaneous ATR expansion (>100%) and EMA alignment flip. The streak counter is the most efficient detector of this transition. This principle applies to continuation models; it does not apply to pullback models.

**Supporting Evidence:**
Sprint 039 and 040 validated ARI Rule C (Sequence Risk): pausing after consecutive losses improved Model A2's performance and reduced drawdown. Sprint 051 confirmed that the ARI Caution filter (losses≥2) improves A2 PF from 1.354 to 2.200 (+0.846) with 96% MC pass rate and 3/3 year stability. Sprint 052 provided the causal mechanism: at consec_losses=2, ATR expands by +124% and EMA alignment flip rate is 29%.

**Cross-Model Validation (Sprint 053):**
A2: Fresh-start WR=42.1%, PF=1.444 vs streak WR=20.4%, PF=0.499 (CONFIRMS). A3: Fresh-start WR=56.2%, PF=3.025 vs streak WR=24.1%, PF=0.772 (CONFIRMS). **A1: CONTRADICTS** — Fresh-start WR=34.4%, PF=0.993 vs streak WR=37.8%, PF=1.312. A1 losses are more randomly distributed; the streak mechanism does not apply to pullback models.

**Scope Restriction:** This principle applies to continuation models (A2, A3) only. It is not a universal market principle.

**Failure Modes:** Only tested on A2 in the original sprint. Reactive, not predictive.

**Related Execution Models:** A2, A3  
**Related Guardian Rules:** ARI Rule C (Sequence Risk / ARI Caution)  
**Research Gaps:** Cross-model validation for A1 (confirmed contradiction). Can regime transition be detected before the first loss?  
**Cross-Market Readiness:** Requires more evidence.

---

### MP-006: Structural Anchoring
**PCS: 61.7 / 100**

**Statement:** Execution models require a structural anchor (dynamic support/resistance level) to achieve positive expectancy. Entries made without a structural reference point fail systematically due to vulnerability to routine market noise. The anchor converts the stop loss from arbitrary to structural.

**Supporting Evidence:**
Sprint 029 provided the critical negative evidence: momentum continuation without a structural anchor achieved a best PF of only 1.034 — insufficient for promotion. Sprint 025 (A1 with EMA21 anchor: PF=1.387) and Sprint 042 (A2 with flag structure anchor: PF=1.354) provided the positive evidence.

**Cross-Model Validation (Sprint 053):**
A1: Shallow pullback (close to anchor) WR=37.4%, PF=1.313 vs deep pullback WR=35.8%, PF=1.088 (CONFIRMS, p=0.89 — weak). A2: Tight stop WR=32.1%, PF=0.903 vs wide stop WR=0.0%, PF=0.000 (CONFIRMS, p=0.03 — significant).

**Failure Modes:** Dynamic anchors (EMAs) can be violated in fast-moving markets. Flag structures can be false (liquidity sweeps).

**Known Exceptions:** A3 uses a compression zone as its anchor — the principle holds but the anchor type differs.

**Related Execution Models:** A1, A2  
**Related Guardian Rules:** Entry validation rules  
**Research Gaps:** Formal definition of structural anchor across model types.  
**Cross-Market Readiness:** Requires more evidence.

---

## Level 1 — Model-Specific Findings

---

### MP-009: A3 Temporal Restriction
**PCS: 67.5 / 100 (Level 1)**

Model A3 (Overnight Expansion) produces positive expectancy only in the pre-midnight window (18:00–23:59 ET). Trades in the 00:00–08:00 window fail structurally due to incompatibility with European session auction mechanics. This is a model design boundary, not a general market principle. Confirmed in Sprints 051 and 052.

**Action Required:** Redesign A3 to restrict entry to 18:00–23:59 ET only.

---

### MP-007: Overnight Inventory Imbalance (REJECTED)
**PCS: 19.2 / 100 (Level 1 — Rejected)**

The hypothesis that overnight directional inventory predicts RTH opening direction was tested in Sprint 032 and rejected. Pearson r ranged from -0.20 to +0.20 with directional agreement of 43–54%. The correlation inverted in 2024. The behaviour only shows positive correlation in the highest volatility quartile (Q4), which is too narrow to constitute a principle.

**Status:** Archived. No execution model should be built on this hypothesis in its current form.

---

## Open Questions and Research Gaps

The following questions are unresolved and should be addressed in future sprints:

1. **A2 Year-by-Year Degradation (Critical):** Model A2 PF degraded from 1.768 (2024) to 0.414 (2025) to 0.375 (2026). This contradicts the Sprint 048 forward validation result (PF improved 11%). The discrepancy must be investigated. Possible causes: the specific ADX>45 + late PM combination is regime-sensitive; the flag structure definition has become less reliable; or the forward validation period happened to coincide with a favourable sub-period.

2. **AM Session Edge (Sprint 045 Finding):** 65% of all exceptional moves occur in the AM session (09:30–12:00 ET). No execution model currently exploits this. Sprint 054 should investigate Model B1.

3. **Cross-Market Validation:** MP-001, MP-003, and MP-004 are ready for cross-market validation. Sprint 041 failed because it applied MNQ parameters directly to other instruments. The correct approach is to calibrate instrument-specific parameters before testing.

4. **Regime Transition Detection:** Can a regime transition (the mechanism behind MP-005) be detected before the first loss? Early detection would allow proactive risk reduction rather than reactive pausing.

5. **A3 Redesign:** Implement the temporal restriction (18:00–23:59 ET) and re-validate A3 with the ADX≥30 filter (FS-A3-01) applied simultaneously.

---

## Principle Confidence Score Summary

| ID | Name | Level | PCS | Status |
|---|---|---|---|---|
| MP-001 | Regime Dependence | 3 | 86.2 | **Promoted** |
| MP-003 | Session Asymmetry | 3 | 85.0 | **Promoted** |
| MP-004 | Volatility Contraction → Expansion Asymmetry | 3 | 83.8 | **Promoted** |
| MP-002 | ADX Absolute Thresholds | 3 | 82.9 | **Promoted** |
| MP-008 | Theory of Edge | 3 | 82.9 | **Promoted** |
| MP-005 | Loss Streaks as Regime Transitions | 2 | 73.8 | **Promoted** |
| MP-009 | A3 Temporal Restriction | 1 | 67.5 | Classified |
| MP-006 | Structural Anchoring | 2 | 61.7 | **Promoted** |
| MP-007 | Overnight Inventory Imbalance | 1 | 19.2 | Rejected |

---

*This document is maintained by the Atlas Research Engine. All entries require sprint-level evidence before promotion. Last updated: Sprint 053.*
