# Atlas Strategy Integration Plan — Behaviour Engine Migration

**Sprint:** 121A
**Status:** APPROVED DESIGN
**Directive:** ORION-DIRECTIVE-001
**Date:** 2026-07-17

---

## Overview

This document defines how each of the six production strategies (A1, A2, A3, B1, SB1, ORB-1) will eventually migrate from self-contained behaviour detection to consuming Behaviour Engine signals. No strategy logic changes occur during Sprint 121A — this is a design document only.

The migration is additive and non-breaking. Strategies continue to operate exactly as they do today. The Behaviour Engine runs in parallel (shadow mode) until it has accumulated sufficient calibration data. Integration is then introduced incrementally, with each strategy's behaviour detection replaced by Behaviour Engine signals only after the signals have been validated to be equivalent or superior.

> **Constraint:** No strategy logic changes during Sprint 121A. This document is architecture only.

---

## Migration Philosophy

The migration follows a strict principle: **a strategy's performance must not degrade when its behaviour detection is replaced by Behaviour Engine signals**. If the Behaviour Engine's signals are not at least as good as the strategy's existing detection, the migration does not proceed.

This principle is enforced by running both the strategy's existing detection and the Behaviour Engine in parallel for a minimum of 90 days before any migration. The comparison is quantitative: win rate, profit factor, and expectancy must be within 5% of the existing performance.

---

## Strategy DNA — Behaviour Mapping

Each strategy is associated with one or more primary behaviours from the Behaviour Library. This mapping is the Strategy DNA — the formal declaration of which market behaviours each strategy is designed to exploit.

| Strategy | Primary Behaviour | Secondary Behaviours | Direction |
|---|---|---|---|
| **A1** | TREND_CONTINUATION | SECOND_ENTRY_PULLBACK | Both |
| **A2** | SECOND_ENTRY_PULLBACK | TREND_CONTINUATION, VWAP_RECLAIM | Both |
| **A3** | MEAN_REVERSION | VWAP_RECLAIM, FAILED_BREAKOUT | Both |
| **B1** | BREAKOUT_EXPANSION | COMPRESSION, VOLATILITY_EXPANSION | Both |
| **SB1** | SECOND_ENTRY_PULLBACK | TREND_CONTINUATION | Both |
| **ORB-1** | OPENING_RANGE_BREAKOUT | BREAKOUT_EXPANSION, VOLATILITY_EXPANSION | Both |

The Strategy DNA is stored in the `atlas_behaviour_definitions` table's `discovery_memory_id` field and in a new `atlas_strategy_dna` table (to be created in Sprint 122).

---

## Per-Strategy Migration Plan

### A1 — Trend Continuation Strategy

**Current behaviour detection:** A1 currently detects trend continuation internally using ADX, EMA alignment, and price structure checks embedded in the Pine Script and the `processBar()` function.

**Target Behaviour Engine signals:** A1 will consume `AtlasBehaviourDetected` events for `TREND_CONTINUATION` with confidence ≥ 60. The existing internal checks will be replaced by a single confidence threshold check against the Behaviour Engine output.

**Migration prerequisites:** TREND_CONTINUATION classifier validated over ≥ 100 instances with win rate within 5% of A1's current win rate.

**Migration sprint estimate:** Sprint 124 (after Intelligence Layer is in place).

**Risk assessment:** Low. TREND_CONTINUATION is the most well-defined behaviour and A1's existing detection closely matches the canonical spec.

---

### A2 — Second Entry Pullback Strategy

**Current behaviour detection:** A2 detects second entry pullbacks using pullback depth, key level proximity, and momentum checks.

**Target Behaviour Engine signals:** A2 will consume `AtlasBehaviourDetected` events for `SECOND_ENTRY_PULLBACK` with confidence ≥ 65. A2 may also optionally consume `VWAP_RECLAIM` as a secondary confirmation.

**Migration prerequisites:** SECOND_ENTRY_PULLBACK classifier validated over ≥ 100 instances. Pullback depth and key level detection must match A2's existing logic within 5%.

**Migration sprint estimate:** Sprint 124.

**Risk assessment:** Medium. Pullback depth calculation requires careful calibration to match A2's existing logic.

---

### A3 — Mean Reversion Strategy

**Current behaviour detection:** A3 detects mean reversion using VWAP distance, RSI extremes, and momentum exhaustion.

**Target Behaviour Engine signals:** A3 will consume `AtlasBehaviourDetected` events for `MEAN_REVERSION` with confidence ≥ 60. A3 may also consume `VWAP_RECLAIM` as a confirmation signal.

**Migration prerequisites:** MEAN_REVERSION classifier validated over ≥ 100 instances. VWAP distance and RSI thresholds must match A3's existing logic.

**Migration sprint estimate:** Sprint 125 (after A1 and A2 migration is validated).

**Risk assessment:** Medium. Mean reversion is regime-sensitive and requires careful calibration.

---

### B1 — Breakout Expansion Strategy

**Current behaviour detection:** B1 detects breakout expansions using compression detection, volume confirmation, and momentum.

**Target Behaviour Engine signals:** B1 will consume `AtlasBehaviourDetected` events for `BREAKOUT_EXPANSION` with confidence ≥ 65. B1 will also consume `COMPRESSION` events as a precursor signal — when COMPRESSION is detected, B1 enters a heightened readiness state.

**Migration prerequisites:** BREAKOUT_EXPANSION and COMPRESSION classifiers both validated. The COMPRESSION → BREAKOUT_EXPANSION precursor relationship must be confirmed statistically.

**Migration sprint estimate:** Sprint 125.

**Risk assessment:** Medium-High. B1's breakout detection is more complex than other strategies and requires the precursor relationship to be well-calibrated.

---

### SB1 — Second Entry Pullback (Systematic)

**Current behaviour detection:** SB1 uses the RAS (Regime-Adjusted Score) system for signal filtering, with second entry pullback as the primary setup.

**Target Behaviour Engine signals:** SB1 will consume `AtlasBehaviourDetected` events for `SECOND_ENTRY_PULLBACK`. The Behaviour Engine's confidence score will be incorporated as one component of the RAS system, replacing SB1's internal pullback detection.

**Migration prerequisites:** SECOND_ENTRY_PULLBACK classifier validated (shared with A2 migration). RAS integration design completed.

**Migration sprint estimate:** Sprint 126 (after A2 migration is validated, since SB1 shares the same primary behaviour).

**Risk assessment:** Low-Medium. SB1 shares A2's primary behaviour, so the classifier validation is shared. The RAS integration requires careful design.

---

### ORB-1 — Opening Range Breakout

**Current behaviour detection:** ORB-1 detects opening range breakouts using session timing, range calculation, and volume confirmation.

**Target Behaviour Engine signals:** ORB-1 will consume `AtlasBehaviourDetected` events for `OPENING_RANGE_BREAKOUT` with confidence ≥ 65. ORB-1 is the most session-specific strategy and the Behaviour Engine's session awareness is a direct enhancement.

**Migration prerequisites:** OPENING_RANGE_BREAKOUT classifier validated over ≥ 50 instances (lower threshold due to session specificity — only one opportunity per day).

**Migration sprint estimate:** Sprint 126.

**Risk assessment:** Low. ORB-1's detection logic is straightforward and closely matches the canonical spec.

---

## Migration Sequence

The migration follows a strict sequence to minimise risk:

| Sprint | Action |
|---|---|
| 121A | Strategy DNA defined (this document). No code changes. |
| 122 | Behaviour Engine implemented in shadow mode. All 12 classifiers running. No strategy changes. |
| 123 | Intelligence Layer introduced. ADE receives behaviour signals as additional context. No strategy changes. |
| 124 | A1 and A2 migrate to Behaviour Engine signals (after 90-day shadow validation). |
| 125 | A3 and B1 migrate. |
| 126 | SB1 and ORB-1 migrate. |
| 127+ | All strategies fully behaviour-driven. Internal behaviour detection removed from strategies. |

---

## Rollback Protocol

If a strategy's performance degrades after migration, the rollback protocol is:

1. Immediately revert the strategy to its pre-migration detection logic (the old logic is preserved in a feature flag, never deleted).
2. Log the regression to `system_health_events` and `darwin_research_memory`.
3. DARWIN investigates the discrepancy between the Behaviour Engine's signals and the strategy's original detection.
4. The migration is not re-attempted until the root cause is identified and resolved.

This protocol ensures that the migration never permanently degrades a production strategy.
