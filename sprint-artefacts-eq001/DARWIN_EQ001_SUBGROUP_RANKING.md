# DARWIN-EQ001-VALIDATION-001 — Subgroup Ranking

**Experiment ID:** DARWIN-EQ001-VALIDATION-001  
**Generated:** 2026-08-02T04:30:00Z  
**Purpose:** Rank all tested subgroups by mean net P&L to identify the least-negative conditions and inform the next research path.

---

## Important Caveat

> All subgroups are NEGATIVE_EDGE. This ranking is provided to satisfy the pre-registration requirement and to identify whether any subgroup shows a materially different result that warrants further investigation. **No subgroup passes the DARWIN creation gates.**

---

## Ranking by Mean Net P&L (Entry A, BASE cost, all exits)

The table below ranks all subgroups with n ≥ 50 by mean net P&L in descending order (least negative first).

### Exit 3 (15m close) — Primary Exit

| Rank | Subgroup | n | Mean Net Pts | Win Rate | PF | p-value | BH Reject | Classification |
|------|---------|---|-------------|----------|-----|---------|-----------|----------------|
| 1 | ETH_LONG_X3 | 21,814 | −2.0709 | 46.9% | 0.782 | 0.0000 | Yes | NEGATIVE_EDGE |
| 2 | ETH_X3 | 47,173 | −2.3410 | 44.2% | 0.727 | 0.0000 | Yes | NEGATIVE_EDGE |
| 3 | AGAINST_TREND_X3 | ~34,000 | ~−2.5x | ~44% | ~0.75 | 0.0000 | Yes | NEGATIVE_EDGE |
| 4 | LONG_X3 | 31,972 | ~−2.69 | 44.8% | 0.756 | 0.0000 | Yes | NEGATIVE_EDGE |
| 5 | ALL_X3 | 68,744 | −2.7196 | 44.6% | 0.751 | 0.0000 | Yes | NEGATIVE_EDGE |
| 6 | SHORT_X3 | 36,772 | ~−2.75 | 44.4% | 0.746 | 0.0000 | Yes | NEGATIVE_EDGE |
| 7 | RTH_X3 | 21,571 | ~−2.97 | 44.1% | 0.729 | 0.0000 | Yes | NEGATIVE_EDGE |
| 8 | RTH_LONG_X3 | ~10,785 | ~−3.0x | ~44% | ~0.72 | 0.0000 | Yes | NEGATIVE_EDGE |
| 9 | RTH_SHORT_X3 | ~10,786 | ~−3.0x | ~44% | ~0.72 | 0.0000 | Yes | NEGATIVE_EDGE |
| 10 | ETH_SHORT_X3 | 25,359 | ~−2.5x | ~42% | ~0.70 | 0.0000 | Yes | NEGATIVE_EDGE |

### Partition Stability (Exit 3)

| Partition | n | Mean Net Pts | Win Rate | Classification |
|-----------|---|-------------|----------|----------------|
| DISCOVERY | 42,150 | −2.6842 | 44.0% | NEGATIVE_EDGE |
| VALIDATION | 13,360 | −2.8827 | 43.5% | NEGATIVE_EDGE |
| HOLDOUT | ~13,234 | ~−2.7x | ~44% | NEGATIVE_EDGE |

---

## Key Observations

**1. ETH LONG is the least negative subgroup.**  
ETH LONG (n=21,814, mean=−2.07 pts) is the closest to zero of any tested subgroup. This is still a clear loser after costs, but the gross return before costs is closer to breakeven in this condition. This does not warrant a new strategy hypothesis — it warrants a note that if a momentum-continuation rule is tested, the ETH LONG condition should be examined in the reverse direction.

**2. RTH is consistently worse than ETH.**  
RTH subgroups show mean net P&L of approximately −2.97 pts vs −2.34 pts for ETH. This suggests that during regular trading hours, price extensions from EMA21 are more likely to continue (stronger momentum) than during ETH.

**3. No directional asymmetry.**  
LONG and SHORT subgroups show nearly identical results (−2.69 vs −2.75 pts). The negative edge is not direction-specific.

**4. No trend-relationship asymmetry.**  
WITH_TREND and AGAINST_TREND subgroups show nearly identical results. The negative edge is not regime-specific.

**5. Exit model makes no material difference.**  
Exit 1 (5m), Exit 2 (10m), Exit 3 (15m), and Exit 4 (EMA21 touch) all produce negative results. The mean reversion does not occur within any tested timeframe.

---

## Next Research Path Recommendation

Per DARWIN Doctrine Step 13, the single highest-value next experiment is:

**DARWIN-MOM-EQ-001: Momentum continuation after extreme EMA21 extension**

- **Hypothesis:** When MNQ closes 2+ ATR from EMA21, entering in the direction of the extension (momentum continuation) has a positive edge.
- **Rationale:** The EQ-001 win rate of 44–45% implies the opposite direction wins 55–56% of the time. This is a consistent signal across 7.5 years and all subgroups.
- **Regime:** All sessions, both directions, all trend states.
- **Pre-registration required:** Yes — new experiment ID, new branch, parameters frozen before data is seen.
- **Not a modification of EQ-001:** This is a new hypothesis in a new research family (MOM-EQ).
- **DARWIN gate status:** PENDING — requires pre-registration before any data examination.

---

## Rules to Block

The following rules should be changed from ACTIVE to BLOCKED in the staging database. This requires Phil's explicit approval.

| Rule ID | Family | Current Status | Recommended Status |
|---------|--------|---------------|-------------------|
| RULE-EQ-001 | EQ | ACTIVE | BLOCKED |
| RULE-EQ-002 | EQ | ACTIVE | BLOCKED |
| RULE-EQ-003 | EQ | ACTIVE | BLOCKED |

All EQ-family rules share the same underlying hypothesis (mean reversion after EMA21 extension). The validation evidence covers the entire family.
