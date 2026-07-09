# Atlas Trading System — Production Freeze v1.0

**Effective Date:** 2026-07-09
**Frozen Version:** ATS v2.0
**Sprint:** 048
**Status:** PRODUCTION CANDIDATE — Forward Validation In Progress

---

## 1. The Production Freeze Principle

ATS v2.0 is the first production candidate of Project Atlas. It has completed the full Atlas research pipeline: behavioural hypothesis validation, execution model engineering, independent validation, Monte Carlo stress testing, portfolio construction, capital allocation engineering, and production engineering.

**Effective immediately, ATS v2.0 is frozen.** No component may be modified. No parameter may be tuned. No execution logic may be changed. The frozen system will be subjected to forward validation on unseen market data. Only evidence from that forward validation — not intuition, not optimism, and not new research — may change the production system.

---

## 2. Frozen Components

The following components are permanently frozen in this version:

| Component | Version | Sprint Validated | Key Parameters |
|---|---|---|---|
| **Model A1** | v1.0 | Sprint 025 | EMA21 touch, vol_exp > 1.8, depth 0.5–1.2 ATR, PM session, ADX < 30 |
| **Model A2** | v1.0 | Sprint 042 | Flag continuation, ADX > 45, Late PM (14:00–16:00), 1:2 RR |
| **Model A3** | v1.0 | Sprint 037 | Overnight compression breakout, ADX > 25, compression < 2.5 ATR |
| **Regime Engine** | v1.0 | Sprint 022 | ADX(14), ATR(14), 5-minute MNQ bars |
| **ARI v2.0** | v2.0 | Sprint 040 | Daily halt at -$300, consecutive loss scaling at 3+, ADX boost ≥ 32 |
| **Execution Policy** | Priority Queue | Sprint 044 | A3 > A2 > A1 priority ordering |
| **Milestone Compounding** | v1.0 | Sprint 047 | +$400 per $500 profit, max $2,000 risk |
| **Daily Loss Management** | v1.0 | Sprint 047 | $800 daily limit, $500 recovery limit |
| **Theory of Edge** | v1.0 | Sprint 035 | Uncertainty reduction framework |
| **URS** | v1.0 | Sprint 035 | 6-dimension scoring, 0–100 scale |

---

## 3. Production Branch Architecture

### `production/ats-v2.0` (Frozen)
This branch contains the exact production system. It is never modified except to create a new version tag (e.g., `production/ats-v2.1`) after a new version is scientifically validated.

**Rules:**
- No direct commits to this branch.
- Changes only occur via a formal promotion process (see Section 5).
- Every production release is tagged and version-controlled.

### `research/model-b-series` (Active Research)
This branch contains all ongoing research: Model B-series discovery, AI Discovery Engine experiments, RMCE diagnostics, and new hypotheses. Nothing in this branch enters production until it statistically outperforms ATS v2.0.

### `main` (Integration)
The main branch receives sprint merges and serves as the integration point. Production branch is only updated after a formal promotion decision.

---

## 4. Forward Validation Standards

ATS v2.0 must demonstrate the following stability criteria during forward validation to be declared **fully production ready**:

| Metric | Historical Benchmark | Acceptable Drift | Rejection Threshold |
|---|---|---|---|
| Profit Factor | 1.708 | ≥ 1.20 (forward) | < 1.00 |
| Win Rate | ~60% | ± 15 percentage points | < 40% |
| Max Drawdown | -$771 | ≤ 2× historical | > -$2,000 |
| Monthly Consistency | 72% | ≥ 50% | < 40% |
| ARI Intervention Rate | ~30% | ± 15 percentage points | > 60% |
| Prop Firm Compliance | 0 violations | 0 violations | Any violation |

---

## 5. Promotion Rules for Future Versions

A new version (e.g., ATS v2.1) may only replace ATS v2.0 if it satisfies **all** of the following:

1. **Statistically superior** on at least 3 of the 5 primary metrics (PF, MaxDD, MC Pass Rate, Monthly Consistency, RoMaD).
2. **Not inferior** on any primary metric by more than 10%.
3. **Validated on out-of-sample data** — not just the historical backtest window.
4. **Passed Monte Carlo** at ≥ 80% (higher than the current 88.3% threshold).
5. **Approved by the research lead** after reviewing the full evidence package.

---

## 6. The Benchmark

ATS v2.0 Historical Performance (the benchmark every future version must beat):

| Metric | Value |
|---|---|
| Profit Factor | 1.708 |
| Net P&L (2yr, $800 base risk) | $5,212 |
| Max Drawdown | -$771 |
| Monthly Consistency | 72% |
| Topstep 50K MC Pass Rate | 86.7% |
| Apex 50K MC Pass Rate | 88.7% |
| Generic 50K MC Pass Rate | 90.3% |
| Average Days to Pass | 20–24 |

---

*This document is permanent and may not be modified except to record a new production version. All modifications require a sprint record in KNOWLEDGE_BASE.md.*
