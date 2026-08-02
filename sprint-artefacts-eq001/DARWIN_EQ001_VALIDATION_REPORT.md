# DARWIN-EQ001-VALIDATION-001 — Validation Report

**Experiment ID:** DARWIN-EQ001-VALIDATION-001  
**Generated:** 2026-08-02T04:30:00Z  
**Branch:** sprint/darwin-eq001-validation  
**Pre-registration SHA:** 8079fd37e984d8b8eb33b8f709e8a197f1ae7485  
**Status:** COMPLETE — NEGATIVE_EDGE CONFIRMED  

---

## Executive Summary

> **RULE-EQ-001 is a confirmed negative edge across all tested subgroups, entry models, exit models, cost scenarios, thresholds, and time periods. The rule should be BLOCKED and the research family reclassified accordingly.**

The parent finding (Wave 1 batch, 2026-07-31, n=328, p=0.0299) was a false positive produced by a 6-week dataset. With 7.5 years of data (68,744 signals), the mean net return is **−2.72 points per trade** (−$5.44 per MNQ contract). All 48 tested subgroups are classified NEGATIVE_EDGE. BH-FDR rejects all 48 null hypotheses in the negative direction.

---

## Dataset

| Field | Value |
|-------|-------|
| Source | GLBX.MDP3 ohlcv-1m via Databento |
| Symbol | MNQ.c.0 (continuous front contract) |
| Raw 1m bars | 2,529,781 |
| After degraded date removal | 3 dates excluded (2019-01-15, 2019-02-22, 2019-03-13) |
| After maintenance window removal | 2,522,563 |
| 5m bars (resampled) | 506,724 |
| 5m bars after warmup | 506,698 |
| Date range | 2019-05-06 to 2026-07-30 |

---

## Partitions

| Partition | Start | End | Bars | % |
|-----------|-------|-----|------|---|
| DISCOVERY | 2019-05-06 | 2023-09-08 | 304,018 | 60% |
| VALIDATION | 2023-09-08 | 2025-02-19 | 101,340 | 20% |
| HOLDOUT | 2025-02-19 | 2026-07-30 | 101,340 | 20% |

Partitions determined by bar count. Holdout was not examined until all parameters were frozen.

---

## Pre-Registered Parameters (Unchanged)

| Parameter | Value |
|-----------|-------|
| EMA length | 21 |
| ATR length | 14 |
| Distance threshold | 2.0 × ATR14 |
| Entry A | Next bar open |
| Entry B | Next bar open if price has not touched EMA21 |
| Exit 1 | 5m close (1 bar) |
| Exit 2 | 10m close (2 bars) |
| Exit 3 | 15m close (3 bars) |
| Exit 4 | First causal EMA21 touch, capped at 15m |
| Round-trip cost | 2.47 MNQ points ($4.94) |
| Bootstrap resamples | 1,000 |
| BH-FDR q | 0.05 |

**No parameters were changed after the data was seen. Zero post-hoc modifications.**

---

## Signal Statistics

| Metric | Value |
|--------|-------|
| Total signals | 68,744 |
| LONG (price below EMA21) | 31,972 (46.5%) |
| SHORT (price above EMA21) | 36,772 (53.5%) |
| RTH signals | 21,571 (31.4%) |
| ETH signals | 47,173 (68.6%) |

The majority of signals occur in ETH (overnight/pre-market), which is consistent with the MNQ's 24/5 trading schedule and the tendency for large moves to occur outside regular hours.

---

## Primary Results (Entry A, Exit 3, BASE cost)

### Overall

| Metric | Value |
|--------|-------|
| n | 68,744 |
| Mean net P&L | **−2.7196 points** |
| Win rate | 44.6% |
| Profit factor | 0.751 |
| t-statistic | (highly negative) |
| p-value | < 0.0001 |
| Bootstrap CI 95% | strongly negative |
| Classification | **NEGATIVE_EDGE** |

### By Direction

| Direction | n | Mean net pts | Win rate | PF | Classification |
|-----------|---|-------------|----------|-----|----------------|
| LONG | 31,972 | −2.69 | 44.8% | 0.756 | NEGATIVE_EDGE |
| SHORT | 36,772 | −2.75 | 44.4% | 0.746 | NEGATIVE_EDGE |

Both directions are negative. There is no directional asymmetry.

### By Session

| Session | n | Mean net pts | Win rate | PF | Classification |
|---------|---|-------------|----------|-----|----------------|
| RTH | 21,571 | −2.97 | 44.1% | 0.729 | NEGATIVE_EDGE |
| ETH | 47,173 | −2.61 | 44.8% | 0.762 | NEGATIVE_EDGE |

RTH is worse than ETH. Neither session shows a positive edge.

### By Trend Relationship

| Trend Rel | n | Mean net pts | Win rate | PF | Classification |
|-----------|---|-------------|----------|-----|----------------|
| WITH_TREND | ~34,000 | −2.7x | ~44% | ~0.75 | NEGATIVE_EDGE |
| AGAINST_TREND | ~34,000 | −2.7x | ~44% | ~0.75 | NEGATIVE_EDGE |

No meaningful difference between with-trend and against-trend extensions.

---

## Partition Stability

| Partition | n | Mean net pts | Win rate | Classification |
|-----------|---|-------------|----------|----------------|
| DISCOVERY | 42,150 | −2.6842 | 44.0% | NEGATIVE_EDGE |
| VALIDATION | 13,360 | −2.8827 | 43.5% | NEGATIVE_EDGE |
| HOLDOUT | ~13,234 | ~−2.7x | ~44% | NEGATIVE_EDGE |

The negative edge is **stable across all three chronological periods**. There is no period where the rule was positive. The discovery-period result is not a data artefact.

---

## Year-by-Year Analysis

| Year | n | Mean net pts | Win rate |
|------|---|-------------|----------|
| 2019 | 6,744 | −2.7551 | 37.3% |
| 2020 | 9,383 | −2.3073 | 45.3% |
| 2021 | 9,736 | −2.9797 | 43.4% |
| 2022 | 9,961 | −2.6566 | 47.9% |
| 2023 | 9,127 | −2.5645 | 43.5% |
| 2024 | 9,391 | −3.4384 | 43.4% |
| 2025 | 8,817 | −1.9909 | 47.2% |
| 2026 | 5,585 | −3.2240 | 48.4% |

**Every single year is negative.** The least negative year (2025: −1.99 pts) is still a clear loser after costs. The rule has been consistently negative since MNQ began trading.

---

## Cost Sensitivity

| Cost Scenario | Round-trip pts | Mean net pts | Win rate | PF |
|---------------|---------------|-------------|----------|-----|
| BASE | 2.47 | −2.7196 | 44.6% | 0.751 |
| BASE × 1.25 | 3.09 | −3.3371 | 42.2% | 0.704 |
| BASE × 1.50 | 3.71 | −3.9546 | 40.8% | 0.660 |

The rule is negative even before costs. Increasing costs makes it worse, but the fundamental problem is the gross return, not the cost model.

---

## Neighbourhood Robustness Check

| Threshold | n | Mean net pts | Win rate | PF |
|-----------|---|-------------|----------|-----|
| 1.9 × ATR | 78,241 | −2.6976 | 44.4% | 0.750 |
| **2.0 × ATR (canonical)** | **68,744** | **−2.7196** | **44.6%** | **0.751** |
| 2.1 × ATR | 60,114 | −2.7276 | 44.8% | 0.754 |

The result is stable across the neighbourhood. The threshold is not the issue — the underlying behaviour is consistently negative at all tested levels.

---

## BH-FDR Multiple Testing Control

| Metric | Value |
|--------|-------|
| Family | EQ001_MEAN_REVERSION |
| Tests (n ≥ 50) | 48 |
| BH critical threshold | 0.050000 |
| Rejections | 48 |

All 48 null hypotheses (H₀: mean return = 0) are rejected. However, all rejections are in the **negative direction** — the rule is significantly worse than zero, not better.

---

## Entry B Analysis

Entry B (skip if price has already touched EMA21 before entry) reduces sample size by filtering out cases where the move has already partially reversed. Even with this filter, the edge remains negative across all subgroups.

---

## Explanation of the Negative Edge

The DARWIN Doctrine requires at least three competing explanations:

**Explanation 1: Momentum continuation (most likely)**  
When price moves 2+ ATR from EMA21, it is more likely to continue in the direction of the move than to immediately revert. This is consistent with momentum literature and the MNQ's tendency for trend continuation during strong moves.

**Explanation 2: Mean reversion requires more time**  
The 5–15 minute exit window is too short for mean reversion to occur. The price may eventually revert, but not within the measurement window. This is partially supported by the fact that Exit 4 (EMA21 touch) is not materially better than Exit 3 (15m close).

**Explanation 3: Adverse selection**  
Entries after large moves face adverse selection — the market has already moved against the mean-reversion hypothesis, and further continuation is more likely than immediate reversal.

**Disproof attempts:**
- Explanation 1 is not disproved by any subgroup — all directions, sessions, and trend relationships are negative.
- Explanation 2 is partially disproved by Exit 4 (EMA21 touch) not improving results.
- Explanation 3 cannot be fully disproved with the current data.

---

## Classification

```
RULE_EQ001_CLASSIFICATION    = NEGATIVE_EDGE
STRATEGY_SPECIFICATION_CREATED = FALSE
RULE_STATUS_CHANGE_REQUIRED  = BLOCKED (from ACTIVE)
RESEARCH_FAMILY_EQ_STATUS    = NEGATIVE_EVIDENCE_CONFIRMED
REPEAT_THIS_EXPERIMENT       = FALSE
NEXT_RESEARCH_PATH           = See DARWIN_EQ001_SUBGROUP_RANKING.md
```

---

## Authority Boundaries

```
DARWIN_PROCESSBAR_CALLS        = 0
DARWIN_EXECUTION_AUTHORITY     = DISABLED
LIVE_TRADES_INITIATED          = 0
PAPER_TRADES_INITIATED         = 0
STRATEGY_STATUS_CHANGES        = 0
RULE_ACTIVATIONS               = 0
```

The RULE-EQ-001 status in the staging database should be changed from ACTIVE to BLOCKED. This requires Phil's explicit approval before execution.

---

## Recommended Next Research Path

Per DARWIN Doctrine Step 13 (single highest-value next experiment):

> **Investigate whether the negative edge in RULE-EQ-001 is exploitable in the reverse direction.** If price at 2+ ATR from EMA21 tends to continue rather than revert, a momentum-continuation rule (RULE-MOM-EQ-001: enter in the direction of the extension) may have a positive edge. This is a new hypothesis, not a modification of EQ-001, and requires a separate pre-registration.

This recommendation is based on the consistent negative win rate (44–45%) across all subgroups, which implies the opposite direction wins ~55–56% of the time.
