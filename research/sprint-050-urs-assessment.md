# Sprint 050 — URS Assessment: H-B-RT01

**Hypothesis:** ADX > 60 represents a genuinely higher-confidence execution regime for Model A2 and Model A3, materially improving expectancy and warranting dynamic risk scaling via ARI.

**Source:** Observatory-generated (Sprint 049 — 5 consecutive extreme-ADX days detected, 4.5σ above mean)

---

## Uncertainty Reduction Score (URS v1.0)

| Dimension | Weight | Score | Rationale |
|---|---|---|---|
| **Directional Uncertainty** | 20 | 18 | ADX >60 = extreme trend strength. Directional uncertainty is near-minimum. |
| **Volatility State** | 20 | 16 | Extreme ADX correlates with elevated ATR — volatility is expanded and directional, not random. |
| **Structural Clarity** | 20 | 16 | Model A2 (flag) and A3 (compression breakout) are both structural models. High-ADX environments produce cleaner structures. |
| **Session Context** | 20 | 14 | Model A2 is PM-only (session known). Model A3 is overnight (session known). Session context is fully specified. |
| **Regime Confirmation** | 20 | 18 | ADX >60 is the most extreme confirmation of the regime filter already embedded in both models. |
| **Total URS** | 100 | **82/100** | Above the 60/100 minimum threshold. Approved for testing. |

**Minimum threshold:** 60/100 ✅  
**Decision:** H-B-RT01 is approved for full validation.

---

## Experimental Design

### ADX Segmentation
- **Band 1:** ADX < 45 (below Model A2 threshold — baseline noise floor)
- **Band 2:** ADX 45–60 (current Model A2/A3 operating range)
- **Band 3:** ADX > 60 (extreme sub-regime — the hypothesis)

### Models Tested
- Model A2 (High-ADX RTH Flag Continuation, PM session, ADX > 45)
- Model A3 (Overnight Volatility Contraction Breakout, ADX > 25)

### Metrics Required
- Trade count, Profit Factor, Win Rate, Expectancy, Max Drawdown
- Year-by-year stability (2024, 2025, 2026)
- Parameter neighbourhood stability
- Monte Carlo prop firm pass rate
- ARI integration: static vs dynamic risk scaling at ADX > 60

### Decision Rules
- **PROMOTE to ARI:** ADX > 60 PF ≥ 1.30 AND N ≥ 20 AND year-by-year stability ≥ 2/3 years profitable
- **MONITOR:** ADX > 60 PF ≥ 1.15 AND N ≥ 15 (insufficient sample, track for 6 months)
- **REJECT:** ADX > 60 PF < 1.15 OR N < 15
