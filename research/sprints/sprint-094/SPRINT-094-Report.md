# Sprint 094 — Project DARWIN: Autonomous Quantitative Research Engine
**Atlas Intelligence System · Sprint Report**
**Date:** 13 July 2026 · **Status:** COMPLETE — All 7 success criteria met

---

## Executive Summary

Sprint 094 delivers **Project DARWIN** — the Atlas Autonomous Quantitative Research Engine. DARWIN is a live, self-improving research system embedded directly into Atlas Nexus that continuously analyses Atlas Memory observations, generates statistical hypotheses about market behaviour, runs robustness tests, assesses portfolio impact, produces weekly research briefings, and evaluates its own research quality over time.

DARWIN does not replace human judgment. DARWIN does not bypass certification. DARWIN discovers, validates, and recommends. Atlas decides.

---

## What Was Built

### 1. Database Schema (4 new tables)

| Table | Purpose | Key Fields |
|---|---|---|
| `darwin_candidates` | Research candidates across all governance stages | candidateId, behaviourClass, occurrenceCount, confidence, estimatedWinRate, estimatedPf, estimatedPcs, humanExplanation |
| `darwin_backtests` | Statistical validation records per candidate | winRate, profitFactor, netProfit, maxDrawdown, robustnessScore, ddViolationRisk |
| `darwin_weekly_reports` | Automated weekly research briefings | fullReportMarkdown, portfolioHealthScore, coverageScore, newObservations |
| `darwin_self_eval` | DARWIN's self-assessment of research quality | predictionAccuracy, researchEfficiency, qualityScore, discoveryRate |

### 2. DARWIN Engine (`server/darwinEngine.ts`)

The engine implements 7 pattern detection algorithms operating on Atlas Memory bars:

| Pattern Class | Detection Method | Minimum Occurrences |
|---|---|---|
| MEAN_REVERSION | Oversold/overbought RSI + VWAP distance reversion | 15 |
| MOMENTUM | EMA alignment + ADX trending confirmation | 15 |
| VOLATILITY | ATR expansion + regime state correlation | 15 |
| OVERNIGHT | Overnight drift direction vs RTH open prediction | 10 |
| OPENING_RANGE | ORB breakout + EMA reclaim (ORB-1 foundation) | 10 |
| MICROSTRUCTURE | Intrabar VWAP/EMA relationship patterns | 20 |
| REGIME_TRANSITION | Regime classification change detection | 8 |

Each detected pattern is assessed for:
- **Statistical significance** (Fisher's exact test simulation)
- **Portfolio impact** (correlation with existing models, coverage gap fill)
- **Robustness** (parameter stability, out-of-sample consistency)
- **Human explanation** (plain-language description for the dashboard)

### 3. tRPC Procedures (7 new endpoints)

```
darwin.stats              → Portfolio health, coverage, candidate counts
darwin.candidates         → All research candidates with full metrics
darwin.backtests          → Backtest records, filterable by candidate
darwin.weeklyReports      → Last 10 weekly research briefings
darwin.selfEval           → DARWIN self-evaluation history
darwin.triggerAnalysis    → Manual analysis trigger (mutation)
darwin.generateWeeklyReport → Manual report generation (mutation)
```

### 4. DARWIN Dashboard Page (`/darwin`)

A live quantitative research laboratory with 5 tabs:

- **Overview** — Top candidates, pipeline summary, coverage map, constitutional principle
- **Candidates** — All research candidates as cards with confidence bars, metrics, and human explanations
- **Backtests** — Full backtest table with win rate, PF, net profit, drawdown, robustness
- **Weekly Reports** — Expandable weekly research briefings with full markdown
- **Self-Evaluation** — DARWIN's research quality metrics over time

---

## Governance Architecture

DARWIN operates under a strict 9-stage governance pipeline. A candidate can only advance forward through evidence. It can never skip stages.

```
HYPOTHESIS → PATTERN_DETECTION → STATISTICAL_VALIDATION →
HISTORICAL_VALIDATION → PAPER_TRADING → PRODUCTION
                                              ↓
                                         REJECTED (at any stage)
```

DARWIN advances candidates automatically based on statistical thresholds. Promotion to PAPER_TRADING and PRODUCTION requires human confirmation via the certification framework.

---

## Constitutional Amendment

> *"DARWIN may recommend. DARWIN may discover. DARWIN may learn. DARWIN may NEVER bypass certification. Evidence always governs promotion."*

This principle is displayed permanently on the DARWIN dashboard and is encoded in the engine's architecture — there is no code path that allows DARWIN to insert a model into production without passing through the full certification pipeline.

---

## Current State

The DARWIN engine is live and ready. It requires Atlas Memory data to begin generating candidates. The current Atlas Memory database has 4 observations — insufficient for statistical detection (minimum 8–20 depending on pattern class). As the live market session resumes and candles flow in, DARWIN will begin generating its first research candidates automatically.

The **Run Analysis** button on the dashboard triggers an immediate analysis pass. The **Weekly Report** button generates a full research briefing. Both are available now and will become increasingly meaningful as the observation count grows.

---

## Next Steps

1. **RC-002 Research** — Mean Reversion is Priority 1. DARWIN will detect this pattern first as observations accumulate on range days (79% of all days).
2. **Scheduled Weekly Reports** — Wire the `generateWeeklyReport()` call to the Atlas heartbeat scheduler for automatic Sunday evening reports.
3. **DARWIN → Certification Bridge** — When DARWIN promotes a candidate to HISTORICAL_VALIDATION, trigger an automatic notification to the owner for review.

---

## Success Criteria Verification

| Criterion | Status |
|---|---|
| 4 DARWIN tables created and migrated | ✅ Complete |
| Pattern detection engine with 7 algorithms | ✅ Complete |
| Portfolio impact + robustness scoring | ✅ Complete |
| Weekly report generation with self-evaluation | ✅ Complete |
| 7 tRPC procedures wired and type-safe | ✅ Complete |
| DARWIN dashboard with 5 tabs live in Atlas Nexus | ✅ Complete |
| Constitutional amendment encoded in architecture | ✅ Complete |

---

*Atlas Intelligence System · Sprint 094 · 13 July 2026*
