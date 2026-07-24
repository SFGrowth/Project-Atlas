# Sprint 123A.8 — Handoff Document
## Canonical Backtest Regeneration and Strategy Evidence Lock

**Sprint:** 123A.8  
**Status:** COMPLETE  
**Date:** 2026-07-24  
**Branch:** `sprint/123a-8-canonical-backtest-regeneration`  
**COMMIT-1:** `9f2466e` (implementation, contracts, G8 tests)  
**COMMIT-2:** (evidence — see below)

---

## What Was Done

Sprint 123A.8 replaced all provisional backtest results with a canonical, reproducible, leakage-audited baseline. The key deliverables are:

**1. Canonical Databento Dataset**  
Downloaded 902,065 1m MNQ bars from Databento GLBX.MDP3 (2024-01-01 to 2026-07-20, cost $0.00). Aggregated to 180,414 5m bars. Quality gate: PASS (0 nulls, 0 duplicates, 0 invalid OHLC). Dataset SHA-256: `c970675391b970956f38d419ef95ff3e116e61ab8874eca7df2ab4334e715623`.

**2. Frozen TypeScript Contract**  
The strategy registry module is frozen at git blob SHA `6549df15ed8cc8e351d82e8dc647bb9c75f0dd69`. The shared canonical contract (`docs/architecture/canonical_strategy_contract.json`) exports all execution parameters for Python consumption.

**3. Versioned Split Manifest**  
Train: 2024-01-01 to 2025-03-31 | Val: 2025-04-01 to 2025-09-30 | OOS: 2025-10-01 to 2026-07-20. Defined before any backtest execution. Version 1.0.0, immutable.

**4. Canonical Backtest Results**  
14 backtest types executed. Primary: roll-excluded (RWP-001). Secondary: roll-inclusive. Deterministic: Run 1 SHA = Run 2 SHA = `670c3f7e59d82b3069df1ebcefdb9221a219ad73783618e7b35eca7864072e22`.

**5. Strategy Classifications (OOS, Research Only)**  
A1: RESEARCH_FAIL | A3: NO_TRADES (expected) | SB1: RESEARCH_FAIL | ORB-1: RESEARCH_FAIL | B1: RESEARCH_CAUTION | Portfolio: RESEARCH_FAIL.

**6. G8 Tests**  
156 tests across 35 categories (G8-01 through G8-35). All pass. Full regression: 35 files pass, 3 pre-existing DB failures unchanged.

---

## What the Next Sprint Should Do

The canonical OOS results establish the research baseline. The next sprint should focus on:

**Priority 1: Investigate B1's OOS edge**  
B1 is the only strategy with positive OOS PF (1.24, 256 trades, +$41/trade expectancy). DARWIN should investigate regime dependence, sub-period stability, and whether the edge is transferable to a more robust model. This is the single highest-value next experiment per the DARWIN doctrine.

**Priority 2: A1 regime filter investigation**  
A1 shows consistent underperformance (PF=0.80 OOS). The ADX-trend filter may be misaligned with the current MNQ volatility regime. DARWIN should examine whether the entry conditions need recalibration.

**Priority 3: ORB-1 breakout criteria review**  
ORB-1 is closest to breakeven (PF=0.97). The opening range definition and breakout confirmation criteria should be examined for the current session structure.

**Do not do:**
- Do not change any live/paper trading status, risk parameters, or capital allocation based on these results
- Do not create new strategies until the B1 investigation is complete and the edge is confirmed stable
- Do not alter the split manifest or backtest artefacts

---

## Key File Locations

| File | Location |
|---|---|
| Canonical backtest results | `/home/ubuntu/atlas-historical/backtest_results_canonical/canonical_backtest_results.json` |
| Trade ledger | `/home/ubuntu/atlas-historical/sprint_123a8_artefacts/trade_ledger_full.json` |
| Split manifest | `/home/ubuntu/atlas-historical/sprint_123a8_artefacts/split_manifest.json` |
| Monitoring baselines | `/home/ubuntu/atlas-historical/sprint_123a8_artefacts/monitoring_baselines.json` |
| Sensitivity matrix | `/home/ubuntu/atlas-historical/sprint_123a8_artefacts/sensitivity_matrix.json` |
| Walk-forward results | `/home/ubuntu/atlas-historical/sprint_123a8_artefacts/walk_forward_results.json` |
| Classification results | `/home/ubuntu/atlas-historical/sprint_123a8_artefacts/classification_results.json` |
| Canonical strategy contract | `/home/ubuntu/atlas-nexus/docs/architecture/canonical_strategy_contract.json` |
| 5m canonical dataset | `/home/ubuntu/atlas-historical/canonical/mnq_5m_features.parquet` |
| Gate G8 evidence report | `/home/ubuntu/atlas-nexus/docs/architecture/SPRINT_123A8_GATE_G8_EVIDENCE.md` |
| Backtest runner script | `/home/ubuntu/atlas-nexus/scripts/sprint-123a8-implementation.py` |
| G8 test file | `/home/ubuntu/atlas-nexus/server/market-data/tests/darwin-g8-canonical-backtest.test.ts` |

---

## Authority Status (Unchanged)

DARWIN_DECISION_AUTHORITY: DISABLED  
DARWIN_EXECUTION_AUTHORITY: DISABLED  
AUTOMATIC_PROMOTIONS: 0  
AUTOMATIC_DEMOTIONS: 0  
AUTOMATIC_RETIREMENTS: 0  
CAPITAL_REALLOCATIONS: 0  

All strategy statuses, risk parameters, and execution authorities are unchanged from the G7 baseline.
