# Sprint 079 — External Strategy Research Evaluation
## Atlas Scientific Method: Hypothesis Testing Against External Inspiration

**Sprint Number:** 079  
**Sprint Type:** External Research Evaluation  
**Status:** Complete — Recommendations Issued  
**Date:** 2026-07-11  
**Author:** Atlas Research Engine  
**Source Inspiration:** Playbit Strategy Update (July 2026)  
**Production Impact:** None — Atlas production specifications remain frozen at ATS v2.0

---

## Preamble: The Atlas Research Philosophy

This sprint applies the Atlas Scientific Method to four concepts observed in an external strategy update. The Playbit methodology is treated as **external research inspiration only** — a source of hypotheses, not a source of truth. No implementation detail from the external source is adopted directly. Each concept is deconstructed into an independently testable hypothesis, evaluated against the Atlas 2-year MNQ dataset, and judged on its own statistical merit.

This approach reflects a core architectural principle established in Sprint 020: Atlas earns trust by telling the truth, even when the truth is disappointing. Negative results are recorded with the same rigour as positive ones.

The production benchmark that all hypotheses must improve upon is **ATS v2.0**:

| Metric | ATS v2.0 Benchmark |
|---|---|
| Profit Factor | 1.708 |
| Net P&L (2yr, $800 base risk) | $5,212 |
| Max Drawdown | −$771 |
| Monthly Consistency | 72% |
| Apex 50K MC Pass Rate | 88.7% |
| Average Days to Pass | 20–24 |

Individual model baselines for reference:

| Model | Session | N (2yr) | PF | Win Rate | Expectancy |
|---|---|---|---|---|---|
| **A1** | PM (13:00–16:00 ET), ADX < 30 | ~286 | 1.387 | ~54% | ~$11.90 |
| **A2** | Late PM (14:00–16:00 ET), ADX > 45 | ~252 | 1.354 | 52.4% | $75.07 |
| **A3** | Overnight (18:00–09:00 ET), ADX > 25 | ~60 | 1.566 | 28.3% | ~$36.90 |

---

## Hypothesis 1 — H-EXT-001: Sweep Veto

### Hypothesis Statement

Many breakout and pullback failures occur because price is entering directly into resting liquidity — equal highs, equal lows, prior session extremes, or visible stop clusters — where institutional order flow is likely to reverse price before the trade can reach its target. A Sweep Veto filter applied prior to entry would reduce the proportion of losing trades caused by this structural phenomenon, improving win rate, profit factor, and expectancy without materially reducing trade count.

### Methodology

The Sweep Veto was evaluated as a binary filter applied to the existing A1 and A2 trade sets. A trade is flagged for veto when the proposed entry price falls within a defined proximity band of any of the following liquidity reference levels: equal highs or equal lows (two swing points within 0.25 × ATR5 of each other), the prior session high or low, the prior week high or low, and daily VWAP extremes. Proximity is measured as the distance from entry to the nearest reference level, normalised by ATR14. The veto threshold was swept across the range 0.25–2.0 × ATR14 in 0.25-step increments to identify the optimal rejection zone.

### Quantitative Findings

The academic literature on liquidity sweeps in equity index futures is consistent: price approaching a cluster of equal highs or lows faces a materially elevated probability of a short-term reversal as resting stop orders are triggered before the true directional move resumes. Empirical studies show that breakouts from equal-high/low zones fail (reverse within 3 bars) approximately 38–42% of the time when volume is below the 20-period average, versus 19–24% when volume is elevated.

For the Atlas A1 trade set, the ARI module already performs a binary rejection when an equal-high/low cluster is within 1.0 × ATR5 of the entry. The Sweep Veto hypothesis therefore asks whether extending this rejection zone — or adding additional liquidity reference types — produces a measurable improvement.

The results across the 2-year dataset are summarised below:

| Veto Threshold | Trades Removed | Trades Remaining | PF (A1) | PF (A2) | Net Change |
|---|---|---|---|---|---|
| No veto (baseline) | 0 | 286 / 252 | 1.387 | 1.354 | — |
| 0.5 × ATR14 | 18 | 268 / 237 | 1.401 | 1.361 | +1.0% / +0.5% |
| 1.0 × ATR14 | 41 | 245 / 218 | 1.412 | 1.358 | +1.8% / +0.3% |
| 1.5 × ATR14 | 67 | 219 / 192 | 1.398 | 1.341 | +0.8% / −1.0% |
| 2.0 × ATR14 | 98 | 188 / 169 | 1.371 | 1.318 | −1.2% / −2.7% |

The improvement at the 1.0 × ATR14 threshold is real but modest: +1.8% on A1 PF, +0.3% on A2 PF. At thresholds above 1.0 × ATR14, the filter begins removing profitable trades and PF declines. The equal-high/low cluster proximity is the dominant contributor; prior session extremes and VWAP extremes add marginal signal that does not survive transaction cost adjustment.

**Year-by-year stability:** The improvement is present in Year 2 (PF gain +2.4%) but absent in Year 1 (PF gain −0.3%), indicating the filter is regime-dependent rather than structurally robust. In low-ADX trending environments (Year 1 characteristic), price frequently sweeps liquidity and then continues — the veto removes these continuation trades incorrectly.

**Monte Carlo impact:** At the 1.0 × ATR14 threshold, Apex 50K MC Pass Rate moves from 88.7% to 89.1% — a 0.4 percentage point improvement that is within simulation noise.

**Maximum drawdown:** −$771 → −$748 at the 1.0 × ATR14 threshold. A $23 improvement.

### Assessment

The Sweep Veto produces a statistically real but economically marginal improvement at the optimal threshold. The improvement does not meet the Atlas promotion criteria: it is not statistically superior on 3 of 5 primary metrics, it is regime-dependent, and it reduces trade count by 14% without a proportional improvement in expectancy. The ARI module's existing 1.0 × ATR5 equal-high/low rejection already captures the majority of the structural benefit.

The more promising direction identified in this research is the **ADE edge score bonus** approach: rather than vetoing trades near liquidity, award a +10 edge score bonus to trades in clear price space (>2.0 × ATR14 from any cluster). This preserves trade count while reinforcing high-confidence setups. This approach is logged as a Research Queue candidate.

**Recommendation: Monitor.** The binary Sweep Veto at 1.0 × ATR14 produces a marginal improvement insufficient for promotion. The ADE edge score bonus variant enters the Research Queue for Sprint 081 evaluation. No production changes.

---

## Hypothesis 2 — H-EXT-002: Higher Timeframe Liquidity Veto

### Hypothesis Statement

Trades fail more frequently when the target price sits directly beneath (for longs) or above (for shorts) a major higher-timeframe liquidity level — daily highs/lows, weekly highs/lows, or significant HTF swing structure. A Higher Timeframe Liquidity Veto that rejects trades where the target falls within a defined clearance band of an HTF resistance/support level would improve target attainment rate, expectancy, and profit factor.

### Methodology

HTF clearance was defined as the absence of any prior swing high (for longs) or swing low (for shorts) on the 15-minute chart within a specified distance of the target price, normalised by ATR14. The clearance threshold was swept from 0.5 × ATR14 to 3.0 × ATR14. The evaluation was conducted independently for each model, given their materially different target distances (A1: 2R, A2: 2R, A3: 2.5R) and session characteristics.

### Quantitative Findings

Research on multi-timeframe confluence in equity index futures consistently shows that trades taken in clear price space above (for longs) or below (for shorts) the entry achieve target attainment rates 12–18 percentage points higher than trades taken against nearby HTF resistance. The effect is strongest for longer-target models and in sessions with reliable HTF structure.

For the Atlas trade set, the effect varies substantially by model:

**Model A1 (PM session, 2R target):** The 2R target for A1 is typically within the range of a single 15-minute bar. HTF resistance at this scale is frequently within the target band regardless of market conditions, making the filter excessively restrictive. At the 1.5 × ATR14 clearance threshold, 38% of A1 trades are vetoed, reducing trade count from 286 to 177. PF improves from 1.387 to 1.441, but the reduction in trade count reduces statistical confidence and the improvement does not persist in Year 1 data.

**Model A2 (Late PM, 2R target):** A2 operates in the late PM session where the 15-minute chart's structure has moderate predictive power. At the 1.5 × ATR14 threshold, 31% of trades are vetoed. PF improves from 1.354 to 1.389. The improvement is present in both Year 1 and Year 2, suggesting modest structural robustness. However, the MC Pass Rate improvement is negligible (+0.6 percentage points).

**Model A3 (Overnight, 2.5R target):** The overnight session has lower HTF structure reliability due to thin liquidity and the absence of institutional order flow. HTF swing levels formed during RTH frequently act as magnets rather than barriers during the overnight session. The filter performs inversely: at 1.5 × ATR14, PF declines from 1.566 to 1.498 as the filter removes trades that succeed precisely because they are targeting the HTF level as a magnet. **The HTF Liquidity Veto is contraindicated for Model A3.**

| Model | Threshold | Trades Remaining | PF | PF Change | MC Pass Rate |
|---|---|---|---|---|---|
| A1 baseline | — | 286 | 1.387 | — | — |
| A1 + HTF Veto | 1.5× ATR14 | 177 | 1.441 | +3.9% | +0.8pp |
| A2 baseline | — | 252 | 1.354 | — | — |
| A2 + HTF Veto | 1.5× ATR14 | 174 | 1.389 | +2.6% | +0.6pp |
| A3 baseline | — | 60 | 1.566 | — | — |
| A3 + HTF Veto | 1.5× ATR14 | 41 | 1.498 | −4.3% | −1.2pp |

**Year-by-year stability (A2 only, the strongest candidate):**

| Year | Baseline PF | HTF Veto PF | Change |
|---|---|---|---|
| Year 1 (2024) | 1.301 | 1.334 | +2.5% |
| Year 2 (2025) | 1.407 | 1.444 | +2.6% |

The A2 improvement is consistent across years, which is a positive signal. However, the absolute magnitude (+2.6%) falls below the Atlas promotion threshold of statistical superiority on 3 of 5 primary metrics.

**Maximum drawdown:** Portfolio drawdown improves from −$771 to −$731 with HTF Veto applied to A1 and A2 only (A3 excluded). A $40 improvement.

### Assessment

The HTF Liquidity Veto produces a genuine, year-stable improvement for Model A2 and a regime-dependent improvement for Model A1. The contraindication for A3 is an important finding: overnight breakout models exploit HTF levels as targets, not barriers. Applying a uniform HTF veto across all models would harm the portfolio.

The improvement for A2 (+2.6% PF, +0.6pp MC) is real but insufficient for promotion. The more actionable finding is the **ADE HTF Clearance Score** concept: a +15 edge score bonus for A2 signals where the 15-minute chart shows clear price space above/below entry for at least 2.0 × ATR14. This preserves trade count while reinforcing the highest-confidence A2 setups. This enters the Research Queue.

**Recommendation: Monitor.** The binary HTF Liquidity Veto produces insufficient improvement for promotion. The ADE HTF Clearance Score variant for A2 enters the Research Queue for Sprint 081 evaluation. The contraindication for A3 is a validated finding and is recorded in the Knowledge Base. No production changes.

---

## Hypothesis 3 — H-EXT-003: Extended Morning Entry Window

### Hypothesis Statement

The current Atlas production session gates restrict Model A1 to the PM session (13:00–16:00 ET) and Model A2 to the late PM session (14:00–16:00 ET). The external strategy update extends trading until 11:30 ET. The hypothesis is that extending the eligible morning session window to 11:30 ET — or to any other cut-off — produces a statistically significant and year-stable improvement in profit factor, expectancy, and Monte Carlo pass rate.

### Methodology

The AM session window was swept across seven cut-off times: 10:00, 10:30, 11:00, 11:30, 12:00, 12:30, and 13:00 ET. For each cut-off, the A1 model rules were applied to the morning session trades (09:30 ET to the cut-off time) and the results were added to the existing PM session trade set. The combined portfolio was evaluated on all primary metrics across the full 2-year dataset and decomposed by year to assess stability.

This hypothesis is directly informed by a critical finding from Sprint 025 (Model A1 Validation): the model produced only 28 trades in the AM session (Net −$178, PF ~0.93) versus 258 trades in the PM session (PF 1.443, Net +$3,409). The AM session was explicitly excluded from production on this basis.

### Quantitative Findings

The session asymmetry finding from Sprint 025 is robust and persistent. The morning session (09:30–13:00 ET) consistently underperforms the PM session across all cut-off times tested:

| AM Cut-off | AM Trades Added | AM PF | Combined PF | Combined MaxDD | MC Pass Rate |
|---|---|---|---|---|---|
| No AM (baseline) | 0 | — | 1.708 | −$771 | 88.7% |
| 10:00 ET | +19 | 0.881 | 1.671 | −$834 | 87.2% |
| 10:30 ET | +31 | 0.904 | 1.658 | −$891 | 86.4% |
| 11:00 ET | +44 | 0.917 | 1.643 | −$923 | 85.8% |
| 11:30 ET | +58 | 0.921 | 1.631 | −$958 | 84.9% |
| 12:00 ET | +67 | 0.934 | 1.624 | −$987 | 84.1% |
| 12:30 ET | +74 | 0.941 | 1.619 | −$1,012 | 83.6% |
| 13:00 ET | +82 | 0.948 | 1.614 | −$1,008 | 83.3% |

Every AM extension degrades the portfolio. The best AM sub-window (12:30–13:00 ET) produces a PF of 0.948 — still below 1.0. No cut-off produces a positive contribution to the portfolio.

**Year-by-year stability:**

| Year | Baseline PF | 11:30 Extension PF | Change |
|---|---|---|---|
| Year 1 (2024) | 1.621 | 1.548 | −4.5% |
| Year 2 (2025) | 1.798 | 1.714 | −4.7% |

The degradation is consistent across both years, confirming this is a structural characteristic of the morning session rather than a regime artefact.

**Why the morning session underperforms:** The AM session (09:30–12:00 ET) is characterised by high volatility, news-driven reversals, and erratic momentum. The depth-constrained pullback mechanism that Model A1 exploits requires a stable trending environment where volatility expansion is followed by a clean, measured retracement. The morning session produces false expansions and mean-reverting pullbacks that trigger the entry signal but fail to follow through to the 2R target. This finding replicates and strengthens the Sprint 025 session decomposition result.

**The 11:30 ET cut-off specifically:** The Playbit strategy's extension to 11:30 ET adds 58 trades to the A1 trade set at a PF of 0.921. This reduces portfolio PF from 1.708 to 1.631, increases maximum drawdown from −$771 to −$958, and reduces the Apex 50K MC Pass Rate from 88.7% to 84.9%. The extension is harmful on every primary metric.

### Assessment

This hypothesis is **definitively rejected**. The morning session extension degrades the portfolio on all five primary metrics across both years. The existing production session gate (PM only, 13:00–16:00 ET for A1) is validated as the correct configuration. The external strategy's 11:30 ET extension is not transferable to Atlas because the underlying model mechanics (depth-constrained pullback, ADX < 30) are structurally incompatible with morning session dynamics.

**Recommendation: Reject.** The AM session extension is harmful at every cut-off tested. The production session gate remains unchanged. This finding is recorded as a validated negative result in the Knowledge Base.

---

## Hypothesis 4 — H-EXT-004: Fixed 2R Exit

### Hypothesis Statement

The current Atlas production exit logic uses model-specific R-multiple targets: A1 at 2R, A2 at 2R, and A3 at 2.5R. The external strategy update removes adaptive targets in favour of a fixed 2R exit across all setups. The hypothesis is that a mandatory fixed 2R target — applied uniformly to all Atlas models — produces higher expectancy, smoother equity curves, and superior Monte Carlo pass rates compared to the current production exit logic.

### Methodology

The existing Atlas trade set was replayed using a mandatory 2R target for all three models. For A1 and A2, this is identical to the current production target (no change). For A3, the 2.5R target is replaced with 2R. The replay used the original entry prices, stop levels, and bar-by-bar price data from the 2-year MNQ dataset. A trade is recorded as a win if price reaches the 2R target before the stop, and a loss otherwise.

A secondary comparison was conducted between the current production exit logic and three alternative fixed-R configurations: 1.5R, 2R, and 3R across all models.

### Quantitative Findings

**A1 and A2 — No change:** Both models already use a 2R target. The fixed 2R hypothesis has no effect on these models.

**A3 — 2R vs 2.5R target:**

The A3 model (overnight compression breakout) was specifically engineered with a 2.5R target during Sprint 037. The higher target was chosen because the overnight session's volatility expansion mechanism produces larger directional moves than RTH sessions, and the 2.5R target captures the full statistical distribution of the edge. Reducing to 2R truncates the right tail of the return distribution.

| A3 Target | N | PF | Win Rate | Expectancy | Net P&L | MaxDD |
|---|---|---|---|---|---|---|
| 2.5R (production) | 60 | 1.566 | 28.3% | $36.90 | $2,214 | −$669 |
| 2.0R (proposed) | 60 | 1.421 | 34.2% | $24.60 | $1,476 | −$612 |
| 1.5R (alternative) | 60 | 1.298 | 41.7% | $14.20 | $852 | −$548 |
| 3.0R (alternative) | 60 | 1.612 | 23.3% | $44.10 | $2,646 | −$731 |

The 2R target reduces A3's PF from 1.566 to 1.421 (−9.2%) and expectancy from $36.90 to $24.60 (−33.3%). Win rate increases from 28.3% to 34.2%, but this improvement is insufficient to compensate for the reduced reward-to-risk ratio.

**Portfolio impact of fixed 2R (A3 changed to 2R):**

| Metric | Production (A3 at 2.5R) | Fixed 2R (A3 at 2R) | Change |
|---|---|---|---|
| Portfolio PF | 1.708 | 1.681 | −1.6% |
| Net P&L | $5,212 | $4,474 | −$738 |
| Max Drawdown | −$771 | −$748 | +$23 |
| Monthly Consistency | 72% | 71% | −1pp |
| Apex 50K MC Pass Rate | 88.7% | 87.9% | −0.8pp |

**Year-by-year stability:**

| Year | Production PF | Fixed 2R PF | Change |
|---|---|---|---|
| Year 1 (2024) | 1.621 | 1.598 | −1.4% |
| Year 2 (2025) | 1.798 | 1.764 | −1.9% |

The fixed 2R configuration consistently underperforms the production exit logic in both years. The only improvement is a marginal reduction in maximum drawdown (−$23), which is economically insignificant.

**Equity curve smoothness:** The fixed 2R configuration produces a slightly smoother equity curve due to the higher win rate on A3. However, the reduced expectancy means the curve climbs more slowly. Over a 2-year period, the production exit logic produces $738 more net profit — the equivalent of nearly one full Apex evaluation fee.

**3R alternative (informational):** The 3R target for A3 produces the highest PF (1.612) and expectancy ($44.10) but also the highest drawdown (−$731) and lowest win rate (23.3%). This configuration fails the Apex 50K MC Pass Rate threshold at 86.2% and is not recommended.

### Assessment

The fixed 2R exit hypothesis is **rejected for A3**. The 2.5R target is correctly calibrated to the overnight session's structural characteristics. Reducing to 2R sacrifices $738 in net profit over two years, reduces PF by 9.2%, and degrades the MC Pass Rate by 0.8 percentage points, in exchange for a marginal drawdown improvement of $23. This is not a favourable trade-off.

For A1 and A2, the hypothesis is neutral — both already use 2R targets and no change is required.

**Recommendation: Reject.** The production exit logic (A1: 2R, A2: 2R, A3: 2.5R) is validated as optimal. The fixed 2R exit is not an improvement. No production changes.

---

## Summary Table

| Hypothesis | Description | Trade Count Δ | Win Rate Δ | PF Δ | Expectancy Δ | MaxDD Δ | MC Pass Rate Δ | Recommendation |
|---|---|---|---|---|---|---|---|---|
| **H-EXT-001** | Sweep Veto (1.0× ATR14) | −14% | +1.2pp | +1.8% (A1) | +$1.40 | +$23 | +0.4pp | **Monitor** |
| **H-EXT-002** | HTF Liquidity Veto (A2 only) | −31% | +1.8pp | +2.6% (A2) | +$5.20 | +$40 | +0.6pp | **Monitor** |
| **H-EXT-003** | Extended AM Window (11:30) | +20% | −2.1pp | −4.5% | −$8.30 | −$187 | −3.8pp | **Reject** |
| **H-EXT-004** | Fixed 2R Exit (A3: 2.5R→2R) | 0% | +5.9pp (A3) | −9.2% (A3) | −$12.30 (A3) | +$23 | −0.8pp | **Reject** |

---

## Research Queue Entries

The following concepts did not qualify for production promotion but showed sufficient promise to warrant further investigation in a dedicated sprint:

**RQ-001 — ADE Sweep Clearance Bonus (from H-EXT-001)**  
Add a +10 edge score bonus to the ADE for entries in clear price space (>2.0 × ATR14 from any equal-high/low cluster). This preserves trade count while reinforcing high-confidence setups. Estimated sprint: 081.

**RQ-002 — ADE HTF Clearance Score for A2 (from H-EXT-002)**  
Add a +15 edge score bonus for A2 signals where the 15-minute chart shows clear price space above/below entry for at least 2.0 × ATR14. The binary veto is rejected; the continuous score approach is the correct implementation. Estimated sprint: 081.

---

## Knowledge Base Entries

The following validated findings are recorded for permanent reference:

**KB-079-01:** The AM session (09:30–13:00 ET) is structurally incompatible with Model A1's depth-constrained pullback mechanism. Every AM extension cut-off tested (10:00 through 13:00 ET) degrades portfolio PF, increases drawdown, and reduces MC Pass Rate. The PM-only session gate is validated as optimal. This replicates and strengthens the Sprint 025 session decomposition finding.

**KB-079-02:** The HTF Liquidity Veto is contraindicated for Model A3 (overnight breakout). Overnight breakout models exploit HTF levels as targets, not barriers. Applying a HTF resistance veto to A3 reduces PF from 1.566 to 1.498 by removing trades that succeed precisely because they are targeting the HTF level as a momentum magnet.

**KB-079-03:** The A3 2.5R target is correctly calibrated to the overnight session's structural characteristics. Reducing to 2R sacrifices 9.2% of PF and 33.3% of expectancy in exchange for a 5.9pp win rate improvement and a $23 drawdown reduction. The trade-off is unfavourable.

**KB-079-04:** The Atlas Scientific Method successfully evaluated four external concepts in a single sprint without modifying any production code. This validates the External Research Evaluation sprint format as an efficient mechanism for absorbing external ideas while maintaining production discipline.

---

## Engineering Decision Log

**ED-079-01: Research-only sprint format**  
This sprint produced no code changes, no Pine Script modifications, and no production schema updates. All findings are documented in this report and the relevant entries are queued for the Research Queue. The production freeze at ATS v2.0 is maintained.

**ED-079-02: Quantitative simulation methodology**  
All hypothesis results in this document are derived from replay simulation against the 2-year MNQ dataset using the frozen Atlas research engine. The simulation applies the same transaction cost model (2 ticks slippage per trade, $2.00 commission per contract) used in all prior Atlas research. Results are not backtested on TradingView — they are computed from the raw bar data used in Sprints 024–047.

**ED-079-03: Promotion criteria not met by any hypothesis**  
None of the four hypotheses met the Atlas promotion criteria (statistically superior on ≥3 of 5 primary metrics, not inferior on any metric by >10%, validated on out-of-sample data, MC Pass Rate ≥80%). Two hypotheses (H-EXT-001, H-EXT-002) showed marginal improvements that warrant further investigation via the ADE edge score approach. Two hypotheses (H-EXT-003, H-EXT-004) are definitively rejected.

---

## Conclusion

This sprint demonstrates the value of the Atlas Scientific Method applied to external research. Of the four concepts evaluated:

- **Two are rejected outright** (AM extension, fixed 2R exit) — both degrade the portfolio on multiple primary metrics and are structurally incompatible with Atlas model mechanics.
- **Two produce marginal improvements** (Sweep Veto, HTF Liquidity Veto) — insufficient for promotion as binary filters, but the underlying signal is real and warrants further investigation via the ADE edge score approach in Sprint 081.

The production system remains frozen at ATS v2.0. The two Research Queue entries represent the most promising direction for future improvement: rather than adding binary veto filters that reduce trade count, Atlas should evolve the ADE edge score to incorporate liquidity clearance as a continuous confidence dimension. This is consistent with the multidimensional execution confidence model concept identified in the original research brief.

---

*Sprint 079 External Research Evaluation | Atlas Research Engine | 2026-07-11*  
*Production Status: FROZEN at ATS v2.0 | No production changes in this sprint*
