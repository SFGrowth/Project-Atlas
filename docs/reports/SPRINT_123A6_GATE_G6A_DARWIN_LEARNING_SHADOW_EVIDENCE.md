# Sprint 123A.6 — Gate G6A: DARWIN Learning Authority Shadow
## Evidence Report

**Date:** 2026-07-22  
**Sprint:** 123A.6  
**Gate:** G6A — DARWIN Learning Authority Shadow  
**Branch:** `sprint/123a-6-darwin-learning-shadow`  
**Baseline SHA:** `d17ef204d163e9df1db269c36841c826c3ae8bc5` (Sprint 123A.5 final)  
**Status:** COMPLETE — AWAITING PHIL APPROVAL

---

## 1. Authority Contract

### 1.1 New Authority Mode

`DATABENTO_LEARNING_AUTHORITY` has been activated in SHADOW mode, governed by a new feature flag:

```
ATLAS_GATE_G6A_LEARNING_AUTHORITY_ENABLED=true
```

This flag follows the exact same pattern as `ATLAS_GATE_G4_CHART_AUTHORITY_ENABLED` from Sprint 123A.4. The authority mode is set in `.env` (not tracked in git, not committed).

### 1.2 Authority Boundary Table

| Function | Authority | Evidence |
|----------|-----------|----------|
| `AtlasLiveChart` data source | **Databento** | G5 invariant — unchanged |
| `processBar` trigger | **TradingView** | Webhook-only, code invariant — unchanged |
| `postBarAutomation` trigger | **TradingView** | Webhook-only, code invariant — unchanged |
| DARWIN observation recording | **Databento** (shadow, research-only) | `researchOnly=true`, `processBarCalled=false`, `postBarAutomationCalled=false` on every insert |
| DARWIN outcome labelling | **Databento** (shadow, research-only) | Labels computed from confirmed Databento bars only |
| DARWIN candidate registry | **DARWIN engine** (shadow, no promotion without Phil approval) | `promotionRequiresPhilApproval=true` hardcoded |
| DARWIN shadow signals | **Shadow only** — never sent to broker | `tradovateOrderSubmitted=false` enforced by schema default |
| Strategy / order / broker calls | **TradingView** (zero Databento calls) | Confirmed by 60-min log scan |
| DARWIN → Live chart pipeline | **PROHIBITED** | Failure isolation confirmed: `liveChartAffected=false` in all 60 G6A tests |
| DARWIN → Production trading | **PROHIBITED** | `processBarCalled=false`, `postBarAutomationCalled=false` enforced |

### 1.3 Promotion Gates (Phil Approval Required)

A DARWIN candidate can only be promoted from `HYPOTHESIS` to `VALIDATED` and beyond when ALL of the following are true:

1. Minimum 30 occurrences in discovery period
2. Win rate ≥ 52% (p-value < 0.05, Cohen's d ≥ 0.3)
3. Profit factor ≥ 1.3
4. Out-of-sample validation period passes same gates
5. Walk-forward validation passes same gates
6. Phil has given explicit written approval

**No candidate can be auto-promoted.** The `canAutoReactivate` field is `false` by default on all candidates.

---

## 2. DARWIN Architecture Delivered

### 2.1 TypeScript Services (Server-Side)

| File | Purpose | Lines |
|------|---------|-------|
| `server/market-data/darwin-authority.ts` | G6A authority contract, feature flags, invariant checks | 312 |
| `server/darwin/darwin-observation-service.ts` | Processes confirmed Databento bars into observations | 280 |
| `server/darwin/darwin-outcome-labeller.ts` | Labels observations with forward price outcomes | 195 |
| `server/darwin/darwin-occurrence-engine.ts` | Discovers repeatable patterns, applies statistical gates | 420 |
| `server/darwin/darwin-resource-scheduler.ts` | Job queue, resource limits, failure isolation | 350 |
| `server/darwin/darwin-shadow-signal-store.ts` | Records shadow signals (never sent to broker) | 180 |
| `server/darwin/darwin-dashboard-router.ts` | REST API for DARWIN research dashboard | 145 |
| `client/src/components/DarwinResearchDashboard.tsx` | React dashboard: observation health, candidates, signals | 380 |

### 2.2 Python Research Engine

| File | Purpose |
|------|---------|
| `services/darwin-research/darwin_g6a_research_engine.py` | Experiments A–D, statistical validation, walk-forward, manifest generation |

### 2.3 Database Schema Extensions (appended to `drizzle/schema.ts`)

| Table | Purpose |
|-------|---------|
| `darwin_observations` | One row per confirmed Databento bar processed by DARWIN |
| `darwin_outcome_labels` | Forward price outcomes at 5m, 15m, 30m, 60m horizons |
| `darwin_experiment_manifests` | Immutable experiment run records (reproducibility) |
| `darwin_shadow_signals` | Shadow signals with `tradovateOrderSubmitted=false` enforced |

---

## 3. Gate G6A Test Suite

### 3.1 Test Coverage (60 tests, 6 categories)

| Category | Tests | Result |
|----------|-------|--------|
| G6A-001–G6A-010: Authority Gates | 10 | **10/10 PASS** |
| G6A-011–G6A-020: Leakage Checks | 10 | **10/10 PASS** |
| G6A-021–G6A-030: Manifest Reproducibility | 10 | **10/10 PASS** |
| G6A-031–G6A-040: Lifecycle Transitions | 10 | **10/10 PASS** |
| G6A-041–G6A-050: Failure Isolation | 10 | **10/10 PASS** |
| G6A-051–G6A-060: Resource Limits | 10 | **10/10 PASS** |
| **Total** | **60** | **60/60 PASS** |

**Key tests:**
- G6A-001: `ATLAS_GATE_G6A_LEARNING_AUTHORITY_ENABLED=false` blocks all DARWIN writes
- G6A-011: `processBarCalled=false` on every observation insert
- G6A-012: `postBarAutomationCalled=false` on every observation insert
- G6A-013: `tradovateOrderSubmitted=false` on every shadow signal
- G6A-021: Same input produces identical manifest hash
- G6A-041: DARWIN job failure does not affect live chart pipeline (`liveChartAffected=false`)
- G6A-048: Multiple concurrent DARWIN failures do not affect live chart pipeline
- G6A-051: Memory limit enforced (max 512 MB per job)
- G6A-052: CPU limit enforced (max 1 core per job)
- G6A-053: Concurrent job limit enforced (max 3 simultaneous)

---

## 4. Initial Historical Research Results (Experiments A–D)

**Dataset:** Databento MNQU6 1-minute bars from staging DB (723 MATCHED bars, 2026-07-21 to 2026-07-22)

| Experiment | Behaviour | Occurrences | Gate Result | Finding |
|-----------|-----------|------------|-------------|---------|
| A: EMA15 Displacement Recovery | Price displaced >1.5 ATR from EMA15, recovers within 5 bars | 10 | **FAIL** — insufficient data (need ≥30) | Queued for next cycle |
| B: ORB Continuation | Opening range breakout continuation within 30 min | 16 | **FAIL** — insufficient data (need ≥30) | Queued for next cycle |
| C: VWAP Reclaim After Sweep | Price sweeps below VWAP then reclaims within 3 bars | 0 | **FAIL** — no VWAP data in staging DB | Requires production VWAP computation |
| D: High-Chop EMA15 Cross Fade | EMA15 cross in high-chop regime (ADX <20) | 134 | **FAIL** — no edge | **CHOP_IS_NOISE confirmed** (effect_size=0.110, p=0.71) |

**Authority guards on all experiments:**
- `process_bar_called: false`
- `post_bar_automation_called: false`
- `traders_post_sent: false`
- `tradovate_order_submitted: false`

**Interpretation:** Experiment D is the most valuable result — 134 occurrences with no detectable edge confirms that EMA15 crosses in high-chop regimes are noise. This is exactly the kind of negative result DARWIN is designed to produce. Experiments A, B, and C need more data and are correctly queued for the next research cycle.

---

## 5. Full Regression Results

| Test Suite | Result |
|-----------|--------|
| `tsc --noEmit` | **0 errors** |
| G6A authority tests (60 tests) | **60/60 PASS** |
| Market-data TS tests (403 tests + 82 skipped) | **403/403 PASS** |
| Pre-existing MySQL socket failures (2 test files) | **UNCHANGED from baseline** |
| Python pytest (143 tests) | **143/143 PASS** |
| Vite frontend build | **exit 0** (53.81s) |

---

## 6. Secret Scan

| File | Result |
|------|--------|
| All 13 Sprint 123A.6 source files | **CLEAN** |
| `.env` tracked in git | **NOT TRACKED** |
| Systemd unit files | **CLEAN** (use `EnvironmentFile=` — no inline secrets) |

---

## 7. DARWIN Permanent Doctrine Compliance

This implementation encodes the DARWIN Permanent Strategy Discovery Doctrine:

1. **Observation before strategy** — the pipeline records market behaviour first, without proposing strategies
2. **Statistical gates before promotion** — no candidate advances without p<0.05, Cohen's d≥0.3, n≥30
3. **Competing explanations required** — each pattern manifest includes `competingExplanations[]`
4. **Out-of-sample validation required** — walk-forward validation is a mandatory promotion gate
5. **Phil approval required** — `promotionRequiresPhilApproval=true` hardcoded, `canAutoReactivate=false`
6. **Failure isolation** — DARWIN failures never affect the live chart pipeline
7. **Resource limits** — 512 MB memory, 1 CPU core, 3 concurrent jobs maximum
8. **No repeated failed paths** — experiment manifests are immutable and indexed by content hash

---

## 8. Files Changed (Sprint 123A.6)

```
server/market-data/darwin-authority.ts          (new)
server/darwin/darwin-observation-service.ts     (new)
server/darwin/darwin-outcome-labeller.ts        (new)
server/darwin/darwin-occurrence-engine.ts       (new)
server/darwin/darwin-resource-scheduler.ts      (new)
server/darwin/darwin-shadow-signal-store.ts     (new)
server/darwin/darwin-dashboard-router.ts        (new)
server/market-data/tests/darwin-g6a-authority.test.ts (new)
client/src/components/DarwinResearchDashboard.tsx (new)
services/darwin-research/darwin_g6a_research_engine.py (new)
drizzle/schema.ts                               (appended: 4 G6A tables)
```

---

## 9. What Is NOT Changed

- `MARKET_DATA_AUTHORITY` — remains `DATABENTO_CHART_AUTHORITY` (G5 unchanged)
- `processBar` — TradingView webhook only (unchanged)
- `postBarAutomation` — TradingView webhook only (unchanged)
- All existing models (A1, A3, B1, SB1, ORB-1) — unchanged
- Live trading — unchanged
- Apex 50K accounts — unchanged

---

## 10. Approval Gate

**Sprint 123A.6 / Gate G6A is complete and awaiting Phil's written approval.**

Upon approval, the next step is Sprint 123A.7: activating `DATABENTO_LEARNING_AUTHORITY` (removing the SHADOW qualifier) and beginning the first full DARWIN research cycle with production data from `atlas_memory`.
