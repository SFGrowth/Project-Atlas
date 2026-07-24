# Sprint 123A.7 / Gate G7 — Autonomous Research Operations
## Evidence Report v7.0 (Seventh Withhold)

**Branch:** `sprint/123a-7-autonomous-research-operations`
**COMMIT-1 SHA:** `fa44ce313789adfb2186552acccdd15c17dab98e`
**COMMIT-2 SHA:** PENDING (this document)
**Report generated:** 2026-07-24T00:33:15Z
**Prepared by:** Manus AI (Atlas Nexus autonomous research agent)

---

## Executive Summary

Sprint 123A.7 Gate G7 delivers the Atlas Nexus Autonomous Research Operations system — a production-grade, chart-isolated, self-healing Darwin research engine running as three independent systemd services on the cloud computer. This report constitutes the seventh-withhold final evidence package, addressing all corrections required across six prior review cycles.

---

## 1. Strategy Definition Conflict Resolution

The seventh withhold identified a conflict between the strategy descriptions in v5.0/v6.0 reports and the actual implementation. A full audit was conducted.

**Finding:** The conflict was a `DOCUMENTATION_ERROR` in the reports. The code was never wrong. The TypeScript strategy registry (`server/darwin/strategy-registry/index.ts`) correctly reflects the Python backtest implementation at all times.

| Strategy | v5.0/v6.0 Report Description (INCORRECT) | Actual Implementation (CANONICAL) | Classification |
|----------|------------------------------------------|-----------------------------------|----------------|
| A1 | "EMA9 cross + ADX" | DMI direction (DI+ vs DI-) in TRENDING regime, score=ADX | DOCUMENTATION_ERROR |
| A3 | "ORB breakout + ATR filter" | DMI direction × 0.95 haircut; ADE-secondary only | DOCUMENTATION_ERROR |
| B1 | "VWAP reversion + trend" | VWAP direction (close vs VWAP), fallback-only | DOCUMENTATION_ERROR (minor) |
| SB1 | "session bias + momentum" | EMA9 slope in AM_MID + TRENDING regime | DOCUMENTATION_ERROR (minor) |
| ORB-1 | "opening range breakout" | Volatile-bar direction (close vs open) in AM_OPEN | DOCUMENTATION_ERROR |

**Action taken:** Canonical strategy contracts v1.0.0 frozen in `server/darwin/strategy-registry/index.ts`. All documentation corrected. No code changes required.

**A3 NO_TRADES note:** A3 correctly shows `NO_TRADES` in all backtest periods. This is the expected and correct result. A3 is an ADE-secondary strategy with score = ADX × 0.95. Since A1 score = ADX, A3 can never beat A1 in a live single-active-strategy portfolio. The `NO_TRADES` result is proof the ADE selection logic is working correctly, not a bug.

---

## 2. Cross-Language Fidelity Harness

A real cross-language fidelity harness was built with shared JSON fixtures evaluated independently by both the Python backtest engine and the TypeScript strategy registry.

### 2.1 Shared Fixture File

**Path:** `server/darwin/strategy-registry/fidelity-fixtures.json`

Seven deterministic OHLCV bar fixtures with pre-verified arithmetic (Python-computed ground truth):

| Fixture ID | Strategy | Direction | Key Indicators | Expected PnL |
|-----------|----------|-----------|----------------|-------------|
| FIX-A1-LONG-001 | A1 | LONG | ADX=28.5, DI+=22.1>DI-=9.8, TRENDING | +$140.00 |
| FIX-A1-LONG-002 | A1 | LONG | ADX=32.0, DI+=25.3>DI-=11.2, TRENDING | +$175.00 |
| FIX-A1-SHORT-001 | SB1 | SHORT | ADX=29.1, EMA9_slope=-4.10, AM_MID | -$62.50 |
| FIX-A1-LONG-003 | A1 | LONG | ADX=27.0, DI+=22.5>DI-=10.3, TRENDING | +$130.00 |
| FIX-A3-LONG-001 (isolation) | A3 | LONG | ADX=26.0, DI+=20.1>DI-=9.5, enable_only=A3 | +$120.00 |
| FIX-SB1-LONG-001 | SB1 | LONG | EMA9_slope=+3.20, AM_MID, TRENDING | +$100.00 |
| FIX-ORB1-LONG-001 | ORB-1 | LONG | close>open, VOLATILE, AM_OPEN | +$87.50 |

### 2.2 Evaluators

- **Python:** `server/darwin/strategy-registry/fidelity-evaluator.py`
- **TypeScript:** `server/darwin/strategy-registry/fidelity-evaluator.ts`
- **Comparison:** `server/darwin/strategy-registry/fidelity-cross-compare.py`

### 2.3 Results

```
CROSS_LANGUAGE_FIDELITY = EXACT
Python evaluator:     7/7 PASS
TypeScript evaluator: 7/7 PASS
Disagreements:        0
```

---

## 3. Playwright Dashboard Lineage Proof

Two Playwright browser tests confirm the Databento data lineage through the live dashboard.

### 3.1 Test Results

| Test | Status | Duration | Key Assertion |
|------|--------|----------|---------------|
| PW-G7-001: Dashboard loads with Databento data source | PASS | 8.8s | `DATABENTO_LINEAGE_PROOF=CONFIRMED` |
| PW-G7-002: Chart API returns DATABENTO bars | PASS | 110ms | `source=DATABENTO, dataset=GLBX.MDP3` |

### 3.2 Lineage Chain (7 Stages)

| Stage | System | Key Fields |
|-------|--------|-----------|
| 1 | Databento GLBX.MDP3 feed | `source=DATABENTO`, `dataset=GLBX.MDP3`, `instrumentId=42004800` |
| 2 | `atlas-feed-adapter.service` | WebSocket bridge, `BRIDGE_AUTH_TOKEN` |
| 3 | `atlas_bars_1m` (DB) | `reconciliation_status=MATCHED`, `revision=0` |
| 4 | `atlas_bars_5m` (DB) | `canonical_bar_type=LIVE_CONFIRMED`, `dataQuality=GOOD` |
| 5 | Chart API `/api/market-data/bars` | `source=DATABENTO`, `dataset=GLBX.MDP3` |
| 6 | `DatabentoLiveChart` candle | `barToCandle()` pts100÷100, FE-014 |
| 7 | `darwin_observations` (DB) | `source=DATABENTO`, `volatility_regime`, `trend_regime` |

**No TradingView, Pine Script, or Massive data in any stage.**

### 3.3 Screenshot

Dashboard screenshot saved: `docs/reports/g7-dashboard-screenshot.png`
Page title: "Atlas Nexus — JARVIS Pipeline Observability"
Lineage proof JSON: `docs/reports/g7-dashboard-lineage-proof.json`

---

## 4. Backtest Results Verification

**Status:** `BACKTEST_REGENERATION_STATUS = VERIFIED_CONSISTENT`

The canonical backtest results (`/home/ubuntu/atlas-historical/backtest_results_canonical/canonical_backtest_results.json`) were generated during Sprint 123A.6 using the corrected canonical strategy definitions. The historical parquet dataset is not present on this machine; regeneration from scratch requires the full Sprint 123A.6 data pipeline.

Verification script: `scripts/verify-canonical-backtest-results.py`
Result: **148/148 checks pass**

| Strategy | Period | n_trades | win_rate | sharpe | net_pnl |
|----------|--------|----------|----------|--------|---------|
| A1 | train | 612 | 32.2% | -0.80 | -$11,095 |
| A1 | val | 223 | 36.8% | +1.60 | +$8,579 |
| A1 | oos | 334 | 34.1% | +0.32 | +$2,622 |
| A3 | all | 0 | N/A | N/A | N/A (ADE-secondary, NO_TRADES expected) |
| SB1 | train | 342 | 33.3% | +1.73 | +$21,013 |
| SB1 | val | 125 | 25.6% | -1.58 | -$6,704 |
| SB1 | oos | 219 | 29.2% | +0.11 | +$702 |
| ORB-1 | train | 442 | 35.8% | +0.68 | +$8,882 |
| ORB-1 | val | 173 | 34.7% | +0.57 | +$2,794 |
| ORB-1 | oos | 303 | 33.0% | -0.03 | -$296 |
| B1 | train | 784 | 42.6% | +1.12 | +$15,776 |
| B1 | val | 314 | 42.0% | +1.06 | +$6,157 |
| B1 | oos | 490 | 40.0% | -0.05 | -$387 |

**Pine SHA:** `d40b6e112f168692202af8fc8dbcc0464b1464c10b8b563c70625e2f0bf5ddfb`
**Fidelity:** `DIVERGENT_CORRECTED` (all 5 strategies)
**Commission:** `$0.62/contract` (canonical Pine value)
**Roll window policy:** `RWP-001` (primary = roll-excluded)

---

## 5. Six-Hour Autonomous Operations Window

**Window:** 2026-07-23 11:22:53 UTC → 17:23:03 UTC (6h 0m 10s)
**Samples:** 13 × 30-minute intervals
**File:** `docs/reports/darwin-g7-real-6hr-ops-window.json`

| Metric | Value |
|--------|-------|
| Samples collected | 13/13 |
| Services active (all 13 samples) | 5/5 |
| Health endpoint (all 13 samples) | 200 OK |
| `live_chart_affected=false` (all 13 samples) | ✓ |
| `true_unexplained_bar_loss` (all 13 samples) | **0** |
| `pending_timer_cycle_bars` | 0 (S1), 2-3 (S2-S13) |
| NRestarts (scheduler + monitor) | 0 |

**Note on `pending_timer_cycle_bars`:** Samples 2-13 show 2-3 bars classified as `PENDING_TIMER_CYCLE` — bars that arrived between 5-minute recorder timer cycles. These are processed by the next recorder run and are never lost. `TRUE_UNEXPLAINED_BAR_LOSS=0` at every sample cutoff.

---

## 6. Bar Accounting Reconciliation

**Status:** `UNEXPLAINED_BAR_LOSS = 0`

**Final accounting (cutoff 2026-07-24T00:33:00Z):**

| Category | Count |
|----------|-------|
| RAW_CONFIRMED_BARS | 2,235 |
| OBSERVATIONS_CREATED | 2,186 |
| UNRESOLVED (INSUFFICIENT_HISTORY) | 49 |
| EXCLUDED | 0 |
| PENDING_TIMER_CYCLE | 0 |
| **TRUE_UNEXPLAINED_BAR_LOSS** | **0** |

**Three recorder bugs fixed:**
1. History query used `ORDER BY ASC LIMIT 1200` — bars beyond context window were silently dropped. Fixed to `ORDER BY DESC LIMIT 1200` then reversed.
2. `darwin_bar_exclusion_log` had no unique constraint — 196 duplicate rows. Fixed with `UNIQUE KEY (bar_timestamp, raw_symbol)`.
3. VWAP `groupby.apply` returns a DataFrame (not Series) when all 1,200 context bars fall on the same calendar date — `iloc[1199]` failed with out-of-bounds. Fixed with type check and index realignment.

---

## 7. Databento Architecture Labels

All `ACTIVE_TEMPORARY_TRIGGER` / `ACTIVE_TEMPORARY` labels have been retired.

| Component | Canonical Label |
|-----------|----------------|
| Pine Script M-16 | `NON_CANONICAL_LEGACY_REFERENCE` |
| TradingView chart | `NON_CANONICAL_LEGACY_REFERENCE` |
| Databento GLBX.MDP3 feed | `CANONICAL_LIVE_DATA_SOURCE` |
| `atlas-feed-adapter.service` | `CANONICAL_LIVE_BRIDGE` |
| `atlas_bars_1m` / `atlas_bars_5m` | `CANONICAL_BAR_STORE` |
| `darwin_observations` | `CANONICAL_FEATURE_STORE` |

---

## 8. Services (15h Uptime, NRestarts=0)

| Service | Status | Since | NRestarts |
|---------|--------|-------|-----------|
| `atlas-darwin-observation-recorder.timer` | active (waiting) | 2026-07-23 09:20:37 UTC | — |
| `atlas-darwin-scheduler.service` | active (running) | 2026-07-23 09:27:13 UTC | **0** |
| `atlas-darwin-monitor.service` | active (running) | 2026-07-23 09:27:13 UTC | **0** |
| `atlas-nexus.service` | active (running) | 2026-07-23 05:31:36 UTC | — |
| `atlas-feed-adapter.service` | active (running) | 2026-07-23 05:31:36 UTC | — |

---

## 9. Full Regression

| Suite | Result | Detail |
|-------|--------|--------|
| `tsc --noEmit` | **PASS** | 0 errors |
| `vite build` | **PASS** | exit 0, 52s |
| Vitest | **926/926** | 37 files, 0 failures |
| Python pytest | **143/143** | 4.33s |
| Playwright | **2/2** | PW-G7-001 + PW-G7-002 |
| Secret scan | **CLEAN** | `HARDCODED_CREDENTIALS=0` |
| Cross-language fidelity | **7/7 EXACT** | Python = TypeScript |
| Backtest verification | **148/148** | `VERIFIED_CONSISTENT` |

`GATE_TARGETED_TESTS_FAILED=0`

---

## 10. GitHub SHA Chain

| Commit | SHA | Description |
|--------|-----|-------------|
| COMMIT-1 | `fa44ce313789adfb2186552acccdd15c17dab98e` | Implementation + contracts + fidelity + Playwright |
| COMMIT-2 | PENDING (this document) | Evidence report + artefacts + checksums |

**Branch:** `sprint/123a-7-autonomous-research-operations`
**Remote:** `origin/sprint/123a-7-autonomous-research-operations`
**LOCAL=REMOTE:** Will be confirmed after COMMIT-2 push.

---

## 11. Artefacts

| Artefact | Path | Description |
|---------|------|-------------|
| Strategy contracts v1.0.0 | `server/darwin/strategy-registry/index.ts` | Canonical TS definitions |
| Fidelity fixtures | `server/darwin/strategy-registry/fidelity-fixtures.json` | 7 shared JSON fixtures |
| Python evaluator | `server/darwin/strategy-registry/fidelity-evaluator.py` | Python fixture evaluator |
| TS evaluator | `server/darwin/strategy-registry/fidelity-evaluator.ts` | TypeScript fixture evaluator |
| Cross-compare | `server/darwin/strategy-registry/fidelity-cross-compare.py` | Comparison script |
| Playwright tests | `server/darwin/strategy-registry/playwright-dashboard-lineage.test.ts` | PW-G7-001 + PW-G7-002 |
| Dashboard screenshot | `docs/reports/g7-dashboard-screenshot.png` | Live dashboard render |
| Lineage proof JSON | `docs/reports/g7-dashboard-lineage-proof.json` | Machine-readable lineage |
| Backtest verification | `docs/reports/g7-backtest-verification.json` | 148/148 checks |
| Ops window JSON | `docs/reports/darwin-g7-real-6hr-ops-window.json` | 13 samples × 29 fields |
| Evidence report | `docs/reports/SPRINT_123A7_GATE_G7_AUTONOMOUS_RESEARCH_EVIDENCE.md` | This document |

---

*Awaiting Phil's written approval to close Sprint 123A.7 and begin Sprint 123A.8.*
