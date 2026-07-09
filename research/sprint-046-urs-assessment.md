# Sprint 046 — URS Assessment
## RMCE Validation Programme

**Date:** July 2026

---

## URS Scoring: H-RMCE-01 (AM Volatility Breakout)

| Dimension | Score | Rationale |
|---|---|---|
| Directional Uncertainty | 15/20 | AM session breakouts have RMCE-confirmed directional bias (65% of all ≥2R events). Uncertainty is moderate — AM sweeps are common. |
| Volatility State Uncertainty | 18/20 | ATR Acceleration is the primary RMCE discriminator. Requiring ATR_accel > 1.2 directly reduces volatility uncertainty. |
| Regime Uncertainty | 10/20 | ADX has no discriminating power in AM session per RMCE. Regime uncertainty remains high. |
| Session Uncertainty | 18/20 | Explicitly targeting the Open/Midday session (09:30–12:00 ET) eliminates session uncertainty. |
| Structural Uncertainty | 12/20 | Breakout entry reduces structural uncertainty but AM false breakouts are frequent. |
| **Total URS** | **73/100** | **Above 60 threshold — eligible for testing.** |

---

## URS Scoring: H-RMCE-02 (ATR Acceleration Filter)

| Dimension | Score | Rationale |
|---|---|---|
| Directional Uncertainty | 16/20 | Existing models already address directional uncertainty. ATR filter adds marginal improvement. |
| Volatility State Uncertainty | 20/20 | ATR_accel > 1.2 directly and explicitly reduces volatility state uncertainty. Cohen's d = +0.889. |
| Regime Uncertainty | 16/20 | Applied on top of existing ADX regime filter — double-filtering reduces regime uncertainty further. |
| Session Uncertainty | 18/20 | Existing models already address session uncertainty. |
| Structural Uncertainty | 16/20 | Existing structural requirements maintained. |
| **Total URS** | **86/100** | **Highest-priority hypothesis. Directly addresses the most powerful RMCE discriminator.** |

---

## URS Scoring: H-RMCE-03 (Relative Volume Confirmation)

| Dimension | Score | Rationale |
|---|---|---|
| Directional Uncertainty | 14/20 | RelVol expansion confirms participation but does not guarantee direction. |
| Volatility State Uncertainty | 16/20 | High relative volume implies genuine volatility expansion, not noise. |
| Regime Uncertainty | 12/20 | RelVol does not directly address regime uncertainty. |
| Session Uncertainty | 14/20 | Volume patterns vary by session — the filter may be session-dependent. |
| Structural Uncertainty | 18/20 | RelVol > 1.3 at a structural break directly reduces false breakout risk. |
| **Total URS** | **74/100** | **Above threshold — eligible for testing.** |

---

## Priority Ranking

| Rank | Hypothesis | URS | Rationale |
|---|---|---|---|
| 1 | **H-RMCE-02** (ATR Acceleration Filter) | **86** | Highest URS. Directly applies the strongest RMCE discovery to validated models. Lowest risk. |
| 2 | **H-RMCE-03** (Relative Volume Confirmation) | **74** | Second-strongest RMCE discriminator. Cross-pattern test. |
| 3 | **H-RMCE-01** (AM Volatility Breakout) | **73** | New execution model. Highest potential upside but also highest risk of failure. |
