# DARWIN Continuous Research Scheduling Design

**Document type:** Architecture Design  
**Version:** 1.0  
**Effective from:** Sprint 123A.6 / Gate G6A  
**Parent doctrine:** `ATLAS_AUTONOMOUS_QUANTITATIVE_RESEARCH_MISSION.md`  
**Status:** ACTIVE — design only; implementation in Sprint 123A.7

---

## 1. Purpose

This document defines the bounded autonomous research cycle that DARWIN will execute periodically. Research must not degrade live trading systems. Live systems always receive resource priority.

---

## 2. Research Cycle Steps

Each research cycle executes the following 10 steps in order:

| Step | Action | Resource limit |
|------|--------|---------------|
| 1 | Refresh historical and live observations from `atlas_memory` | 512 MB, 1 CPU core |
| 2 | Update outcome labels for recently confirmed bars | 512 MB, 1 CPU core |
| 3 | Monitor existing strategies — compute rolling metrics, flag caution conditions | 512 MB, 1 CPU core |
| 4 | Reassess open portfolio gaps — check if any gap has new evidence | 256 MB, 1 CPU core |
| 5 | Generate at most 3 new hypotheses per cycle (from gap registry) | 256 MB, 1 CPU core |
| 6 | Run reproducible experiments for queued hypotheses | 512 MB, 1 CPU core |
| 7 | Reject weak findings (apply statistical gates) | 256 MB, 1 CPU core |
| 8 | Rank surviving candidates by: statistical confidence, stability, novelty, portfolio improvement, drawdown reduction, regime coverage, implementation complexity, overfitting risk | 256 MB, 1 CPU core |
| 9 | Produce review report (markdown, committed to git) | 256 MB, 1 CPU core |
| 10 | Preserve all outcomes and manifests (immutable, content-hashed) | 256 MB, 1 CPU core |

---

## 3. Resource Limits

| Resource | Limit per job | Limit per cycle |
|----------|-------------|----------------|
| Memory | 512 MB | 1,024 MB total |
| CPU | 1 core | 1 core (sequential jobs) |
| Concurrent jobs | 3 maximum | — |
| Cycle duration | 60 minutes maximum | — |
| New hypotheses per cycle | 3 maximum | — |

---

## 4. Research Frequency

| Cycle type | Default frequency | Configurable |
|-----------|------------------|-------------|
| Strategy monitoring | Every 24 hours | Yes — `DARWIN_MONITORING_INTERVAL_HOURS` |
| Observation refresh | Every 6 hours | Yes — `DARWIN_OBSERVATION_INTERVAL_HOURS` |
| Full research cycle | Weekly (Sunday 02:00 UTC) | Yes — `DARWIN_RESEARCH_CRON` |
| Portfolio gap review | Weekly (Sunday 02:00 UTC) | Yes |
| Emergency review | On Phil's request | Manual trigger |

---

## 5. Live System Priority

DARWIN research must not degrade:

- Databento live ingestion (`atlas-feed-adapter.service`)
- Chart rendering (`AtlasLiveChart`)
- Database persistence (`atlas_memory`)
- TradingView webhook processing (`processBar`)
- TradingView automation (`postBarAutomation`)
- TradersPost webhook delivery
- Tradovate order submission

**Priority order:**
1. Live trading (TradingView → TradersPost → Tradovate)
2. Live data ingestion (Databento feed adapter)
3. Chart rendering and persistence
4. DARWIN monitoring (lightweight)
5. DARWIN research (heavy — runs only in off-hours)

If any live system reports degraded performance during a DARWIN research cycle, the cycle must be paused immediately and the live system given full resources.

---

## 6. Failure Isolation

DARWIN research failures must never affect live systems. The failure isolation contract from Gate G6A remains in force:

- `liveChartAffected=false` on every DARWIN job failure
- `processBarCalled=false` on every DARWIN job
- `postBarAutomationCalled=false` on every DARWIN job
- `tradovateOrderSubmitted=false` on every DARWIN job

---

## 7. Output Artefacts

Each research cycle produces:

| Artefact | Location | Committed to git |
|---------|---------|-----------------|
| Strategy monitoring report | `docs/reports/DARWIN_MONITORING_YYYYMMDD.md` | Yes |
| Experiment manifests | `atlas_memory.darwin_experiment_manifests` | No (DB only) |
| Candidate registry updates | `atlas_memory.darwin_candidates` | No (DB only) |
| Portfolio gap updates | `docs/architecture/DARWIN_PORTFOLIO_GAP_REGISTRY.md` | Yes |
| Review report | `docs/reports/DARWIN_RESEARCH_YYYYMMDD.md` | Yes |

---

## 8. Configuration Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DARWIN_MONITORING_INTERVAL_HOURS` | 24 | Hours between strategy monitoring cycles |
| `DARWIN_OBSERVATION_INTERVAL_HOURS` | 6 | Hours between observation refresh cycles |
| `DARWIN_RESEARCH_CRON` | `0 2 * * 0` | Cron expression for full research cycle |
| `DARWIN_MAX_HYPOTHESES_PER_CYCLE` | 3 | Maximum new hypotheses per research cycle |
| `DARWIN_MAX_CONCURRENT_JOBS` | 3 | Maximum concurrent DARWIN jobs |
| `DARWIN_JOB_MEMORY_LIMIT_MB` | 512 | Memory limit per DARWIN job |
| `DARWIN_CYCLE_TIMEOUT_MINUTES` | 60 | Maximum duration of a full research cycle |

---

## 9. Amendment History

| Version | Date | Author | Change |
|---------|------|--------|--------|
| 1.0 | 2026-07-22 | Atlas Nexus (Phil approval) | Initial scheduling design — Sprint 123A.6 Gate G6A |
