# Atlas Market Laws Library v1.0
**Date:** 9 July 2026
**Status:** Permanent Scientific Asset
**Project:** Atlas ATS v2.0

## 1. Epistemological Framework

The Atlas Market Laws Library represents the highest tier of knowledge within the Atlas system. It contains **Minimum Viable Combinations (MVCs)** — irreducible behavioural structures observed within the Atlas research framework. 

**Terminology Calibration:**
* **MVC (Minimum Viable Combination):** A statistically validated, irreducible combination of conditions that yields a persistent directional edge within the MNQ dataset. If removing any single condition destroys the edge, the combination is irreducible.
* **Candidate Market Law:** An aspirational label applied to an MVC that is being tracked for cross-instrument replication.
* **Market Law:** A theoretical long-term objective. No MVC is classified as a "Law" until it has been replicated across independent instruments (e.g., ES, RTY) and fully independent time periods.

*Engineering Rule:* Execution models are applications of MVCs. MVCs never reference execution models. Only after an MVC is validated may an execution model be engineered around it.

## 2. Validated MVC Registry

The Sprint 059 systematic search evaluated 13,755 feature combinations. Six combinations passed the full MVML validation suite (OOS, Walk-Forward, Monte Carlo, Permutation, and Irreducibility). They are ranked below by their Behaviour Confidence Score (BCS).

### MVC-001: Volume-Confirmed Overnight Expansion
* **BCS:** 79.1 (High Confidence)
* **Performance:** WR 67.5% | PF 3.107 | Permutation Z=9.30
* **Minimum Component Set:** 
  1. `rel_vol_20 >= 85th percentile` (High relative volume)
  2. `ov_range_vs_atr14 >= 75th percentile` (Large overnight range)
  3. `ov_dir == 1` (Bullish overnight direction)
* **Economic Mechanism:** Large bullish overnight ranges indicate institutional positioning. When confirmed by high relative volume during the RTH session, it signals institutional continuation rather than reversal.
* **Irreducibility:** Removing the bullish direction drops the WR by 14.2pp.

### MVC-002: AM Session Overnight Expansion
* **BCS:** 75.0 (High Confidence)
* **Performance:** WR 71.1% | PF 3.153 | Permutation Z=13.64
* **Minimum Component Set:** 
  1. `ov_range_vs_atr14 >= 75th percentile`
  2. `ov_dir == 1`
  3. `hour in [9, 10, 11]` (AM Session)
* **Economic Mechanism:** The structural advantage of overnight institutional positioning is most acutely resolved during the initial AM session liquidity window. 
* **Relationship to MVC-003:** Independent. Overlaps with MVC-003 in only 27.6% of cases. MVC-002 does not require a participation surge, relying instead on the structural liquidity of the AM session.

### MVC-003: Participation-Amplified Directional Momentum (formerly ML-001)
* **BCS:** 74.0 (Moderate Confidence)
* **Performance:** WR 65.3% | PF 2.536 | Permutation Z=10.45
* **Minimum Component Set:** 
  1. `rel_txn >= 1.33` (Participation Surge)
  2. `ov_range_vs_atr14 >= 10.85`
  3. `ov_dir == 1`
* **Economic Mechanism:** When participation (order fragmentation) surges following a large bullish overnight range, it forces directional continuation regardless of the time of day.
* **Note:** This was the original Apex Combination 1 discovered in Sprint 058.

### MVC-004: Mid-Week Overnight Expansion
* **BCS:** 72.3 (Moderate Confidence)
* **Performance:** WR 68.8% | PF 2.440 | Permutation Z=10.81
* **Minimum Component Set:** 
  1. `ov_range_vs_atr14 >= 85th percentile` (Extreme overnight range)
  2. `ov_dir == 1`
  3. `dow == 2` (Wednesday)
* **Economic Mechanism:** Mid-week institutional positioning. Wednesdays following extreme overnight expansions exhibit highly anomalous directional persistence.

### MVC-005: AM Session Intraday Expansion
* **BCS:** 68.3 (Moderate Confidence)
* **Performance:** WR 66.4% | PF 2.487 | Permutation Z=8.40
* **Minimum Component Set:** 
  1. `day_range_vs_atr14 >= 75th percentile` (Expanded intraday range)
  2. `ov_dir == 1`
  3. `hour in [9, 10, 11]`

### MVC-006: Trend-Aligned AM Expansion
* **BCS:** 61.8 (Moderate Confidence)
* **Performance:** WR 67.7% | PF 1.739 | Permutation Z=10.89
* **Minimum Component Set:** 
  1. `ov_range_vs_atr14 >= 75th percentile`
  2. `ema_alignment == 1` (Bullish EMA stack)
  3. `hour in [9, 10, 11]`

## 3. Engineering Recommendations for Model B1

Based on the validated MVCs, the following engineering directives are issued for the development of Atlas Execution Model B1:

1. **The Core Engine:** Model B1 should be engineered primarily around **MVC-001** and **MVC-002**. These two structures possess the highest Behaviour Confidence Scores, the highest Profit Factors (>3.1), and massive permutation significance (Z>9.0).
2. **Session Restriction:** MVC-002 explicitly mandates execution within the AM session. Model B1 should be heavily weighted toward, or exclusively restricted to, the 09:30–11:59 RTH window.
3. **Overnight Dependency:** All top MVCs rely on the `ov_range_vs_atr14` and `ov_dir` metrics. Model B1's signal generator must have perfect access to the overnight session data prior to the RTH open.
4. **Execution Overlap:** MVC-001 and MVC-002 overlap in ~37% of cases. Model B1 must handle this concurrency gracefully, ensuring that risk limits are not breached when multiple MVC conditions are simultaneously met.
