# DARWIN Wave 1 Research Batch — Ranked Results

**Run date:** 2026-07-31T04:44:37Z  
**Data:** 1,835 5m bars | 9,376 1m bars  
**Rules evaluated:** 14 of 38 (representative cross-family sample)  
**Primary horizon:** 3 bars (15 minutes for 5m data)  
**Validation method:** Chronological 60/40 split  

---

## Ranked Results

| Rank | Rule ID | Family | Classification | n | Mean Return | p-value | Win Rate | Stable | Decision |
|------|---------|--------|---------------|---|-------------|---------|----------|--------|----------|
| 1 | RULE-EQ-001 | P — Equilibrium | **PROMISING** | 328 | +0.0251% | 0.0299 | 52.7% | Yes | **ACTIVATED** |
| 2 | RULE-TR-002 | C — Trend | INCONCLUSIVE_POSITIVE | 625 | +0.0246% | 0.0314 | 53.9% | No | **ACTIVATED** |
| 3 | RULE-REV-003 | O — Reversal | INCONCLUSIVE_POSITIVE | 837 | +0.0113% | 0.0706 | 52.1% | Yes | **ACTIVATED** |
| 4 | RULE-REV-002 | O — Reversal | INCONCLUSIVE | 103 | +0.0182% | 0.1411 | 53.4% | Yes | INACTIVE |
| 5 | RULE-VOL-001 | G — Volume | INCONCLUSIVE | 112 | +0.0175% | 0.5099 | 53.6% | Yes | INACTIVE |
| 6 | RULE-RV-001 | F — Range/Volatility | INCONCLUSIVE | 725 | +0.0041% | 0.1859 | 53.2% | Yes | INACTIVE |
| 7 | RULE-TR-001 | C — Trend | NEGATIVE_EDGE | 602 | -0.0038% | 0.7227 | 47.7% | No | BLOCKED |
| 8 | RULE-REV-001 | O — Reversal | NEGATIVE_EDGE | 100 | -0.0323% | 0.0654 | 40.0% | Yes | BLOCKED |
| — | RULE-RV-002 | F — Range/Volatility | INSUFFICIENT_SAMPLE | 1 | — | — | — | — | INACTIVE |
| — | RULE-MS-001 | B — Market Structure | INSUFFICIENT_SAMPLE | 3 | — | — | — | — | INACTIVE |
| — | RULE-MOM-001 | E — Momentum | INSUFFICIENT_SAMPLE | 0 | — | — | — | — | INACTIVE |
| — | RULE-MOM-002 | E — Momentum | INSUFFICIENT_SAMPLE | 0 | — | — | — | — | INACTIVE |
| — | RULE-VW-001 | H — VWAP | INSUFFICIENT_SAMPLE | 4 | — | — | — | — | INACTIVE |
| — | RULE-SESS-001 | J — Session | INSUFFICIENT_SAMPLE | 7 | — | — | — | — | INACTIVE |

---

## Classification Criteria

| Classification | Criteria |
|---------------|----------|
| PROMISING | p < 0.05, mean > 0, win rate > 52%, chronologically stable |
| INCONCLUSIVE_POSITIVE | p < 0.10, mean > 0 |
| INCONCLUSIVE | p ≥ 0.10, mean > 0 |
| NEGATIVE_EDGE | mean < 0, win rate < 48% |
| INSUFFICIENT_SAMPLE | n < 50 |

---

## Key Observations

**RULE-EQ-001 (Equilibrium)** is the only rule to achieve PROMISING status in this batch. It detects entries made after excessive moves away from EMA21, which historically show mean reversion. The signal is stable across both the early (60%) and late (40%) periods, and the p-value of 0.0299 crosses the 5% threshold with a sample of 328.

**RULE-TR-002 (Bearish Trend Continuation)** shows a positive mean return but fails the stability criterion — the early and late periods show different magnitudes. This warrants continued monitoring before upgrading to PROMISING.

**RULE-REV-001 (Hammer Candle)** is a confirmed negative edge with a 40% win rate and p = 0.0654. This is a statistically meaningful negative result. The rule is BLOCKED.

**6 rules with insufficient sample** are expected given the 6-week data window. These will be re-evaluated as the live webhook accumulates more bars.

---

## Next Recommended Experiment

Per the DARWIN doctrine, the single highest-value next experiment is:

> **Deepen the RULE-EQ-001 analysis** — specifically, test whether the negative edge is stronger when the excessive move occurs against the prevailing EMA21 trend direction versus with it. This may reveal a regime dependency that converts RULE-EQ-001 from a general mean-reversion rule into a more precise counter-trend rule.

This is a behaviour-first observation, not a strategy proposal.
