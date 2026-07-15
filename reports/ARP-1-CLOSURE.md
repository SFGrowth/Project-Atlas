# ARP-1 — Atlas Autonomous Research Program 1
## Closure Report

**Sprint:** ARP-1 (follows Sprint 112)
**Date:** 2026-07-15
**Status:** COMPLETE — OPERATIONAL
**Dataset:** ATLAS-MNQ-5M-V1 v1.0 (SHA-256: 663893c5…) — certified canonical

---

## Mission

Transition Atlas OS from a software development project into a continuously operating autonomous quantitative research system. ARP-1 defines seven permanent programs that run 24/5 without requiring manual sprint initiation.

---

## Programs Deployed

### Program A — Live Operations Continuity

**Status:** ACTIVE  
**Trigger:** Every webhook bar + tRPC query  
**Function:** Monitors all Atlas OS processes in real time. Reports status (ACTIVE / DEGRADED / OFFLINE) for 8 core processes: Webhook Pipeline, S109-001 Walk-Forward Engine, Safety Lockout Engine, Discovery Engine, Portfolio Intelligence Engine, Execution Certification Engine, Heartbeat Scheduler, and Database Health.

### Program B — Continuous Discovery Engine

**Status:** ACTIVE  
**Trigger:** Every 5-min MNQ bar (webhook pipeline)  
**Function:** On every bar, evaluates the current market context against the Behaviour Library (BL-001 through BL-022). Records behaviour matches, generates research candidates when novel patterns are detected, and logs Market Law updates. All events are stored in `arp1_discovery_events` for downstream analysis.

**Discovery criteria:**
- Behaviour match: bar context matches a known behaviour pattern
- Candidate generation: novel pattern not in the library, confidence > 0.6
- ML update: pattern frequency crosses significance threshold

### Program C — Portfolio Coverage Tracker

**Status:** ACTIVE  
**Trigger:** PM_CLOSE bar (webhook pipeline)  
**Function:** Analyses the current model portfolio for regime coverage gaps, session coverage, and model diversity. Identifies underrepresented regimes and sessions to guide future research priorities.

### Program D — Model Lifecycle State Machine

**Status:** ACTIVE  
**Trigger:** Manual operator transitions + auto-promotion rules  
**Function:** Tracks all Atlas models through a 9-state lifecycle:

```
DISCOVERY → RESEARCH → HISTORICAL_VALIDATION → OUT_OF_SAMPLE
→ WALK_FORWARD → PAPER_TRADING → PRODUCTION → REVIEW → RETIREMENT
```

**Current model registry (seeded at ARP-1 launch):**

| Model | State | Notes |
|---|---|---|
| A1 | PRODUCTION | Live account |
| A3 | PRODUCTION | Live account |
| B1 | PRODUCTION | Live account |
| SB1 | PAPER_TRADING | Apex paper |
| ORB-1 | PAPER_TRADING | Apex paper |
| DARWIN-S107-002 | RETIREMENT | Superseded by S109-001 |
| DARWIN-S109-001 | WALK_FORWARD | Sprint 111 active |

**Auto-promotion rules:**
- WALK_FORWARD → PAPER_TRADING: WR ≥ 65% AND PF ≥ 2.0 AND trades ≥ 20
- PAPER_TRADING → PRODUCTION: WR ≥ 70% AND PF ≥ 2.5 AND trades ≥ 50
- Any state → REVIEW: DD > 2× expected OR WR < 50% over 20+ trades

### Program E — Portfolio Intelligence Engine

**Status:** ACTIVE  
**Trigger:** PM_CLOSE bar (webhook pipeline)  
**Function:** Calculates portfolio-level metrics after each session close:
- Aggregate PF, WR, and Max Drawdown across all active models
- Diversification score (0–1) based on correlation between model signals
- Regime coverage score across TRENDING / CHOPPY / COMPRESSED / VOLATILE
- Session coverage score across AM / MIDDAY / PM sessions
- Model summary table with per-model contribution

All snapshots stored in `arp1_portfolio_intelligence` for trend analysis.

### Program F — Weekly Self-Review Generator

**Status:** ACTIVE  
**Trigger:** Heartbeat cron — every Sunday at 22:00 UTC (18:00 ET)  
**Function:** Generates a structured weekly review covering:
- What did Atlas learn this week?
- What improved?
- What deteriorated?
- What research gaps were identified?
- What are the priorities for next week?

Reviews stored in `arp1_weekly_reviews`. Full text preserved for audit.

### Program G — Daily Owner Brief

**Status:** ACTIVE  
**Trigger:** Heartbeat cron — every weekday at 12:00 UTC (08:00 ET)  
**Function:** Generates a concise morning brief covering:
- Operational status (nominal / alert)
- Walk-forward model status
- Paper trading model status
- Production model status
- Active specialist count
- Critical alerts (if any)
- Today's research focus

Briefs stored in `arp1_daily_briefs`. Full text preserved for audit.

---

## Database Schema

Five new tables created:

| Table | Purpose |
|---|---|
| `arp1_discovery_events` | Program B — behaviour match log |
| `arp1_model_lifecycle` | Program D — model state registry |
| `arp1_portfolio_intelligence` | Program E — daily portfolio snapshots |
| `arp1_weekly_reviews` | Program F — weekly review archive |
| `arp1_daily_briefs` | Program G — daily brief archive |

---

## Scheduled Jobs Registered

| Job | Cron | UTC | ET |
|---|---|---|---|
| `arp1-weekly-review` | `0 22 * * 0` | Sunday 22:00 | Sunday 18:00 |
| `arp1-daily-brief` | `0 12 * * 1-5` | Weekdays 12:00 | Weekdays 08:00 |

---

## ARP-1 Command Centre Dashboard

**Route:** `/arp1`  
**Nav:** PORTFOLIO group → ARP-1 Command Centre

The dashboard provides a unified view of all 7 programs:

- **Program grid:** 7 program cards with live status indicators
- **KPI row:** Models tracked, discovery events, active processes, latest brief date
- **Tabbed detail:** Each program has a dedicated tab with full data
- **Program D tab:** Operator can transition any model to any state via dropdown
- **Program F/G tabs:** Full review/brief text with expandable history

---

## Registry Updates

### Behaviour Library
- BL-001 through BL-022 seeded into Program B discovery engine
- New behaviours auto-added as discovery events accumulate

### Model Registry
- All 7 models seeded into `arp1_model_lifecycle`
- State machine is now the single source of truth for model status

### Market Laws
- ML-001 through ML-012 referenced in Program B evaluation logic

---

## Operational Protocol

ARP-1 is now the operating rhythm of Atlas OS. The research process is:

1. **Every bar:** Program B evaluates market context, Program A monitors health
2. **Every session close:** Programs C and E update portfolio intelligence
3. **Every morning:** Program G delivers the daily brief
4. **Every Sunday:** Program F generates the weekly self-review
5. **Operator action:** Program D allows manual lifecycle transitions when evidence warrants

Sprint initiation is no longer required for routine research. Sprints are now reserved for:
- Specific hypothesis validation (e.g., Sprint 110 OOS validation)
- New strategy development requiring focused analysis
- Infrastructure upgrades
- Promotion decisions requiring formal evidence review

---

## Success Criteria

| Criterion | Status |
|---|---|
| All 7 programs operational | PASS |
| Webhook pipeline integration (B, C, E) | PASS |
| Scheduled job registration (F, G) | PASS |
| Model lifecycle registry seeded | PASS |
| Command Centre dashboard live | PASS |
| TypeScript clean | PASS |
| GitHub commit pushed | PASS |

---

## Next Actions

1. **ARP-1 is now running.** No manual action required.
2. **Sprint 113** (when triggered): First funded account setup — Apex 50K evaluation account activation, Tradovate connection, first live S109-001 signal execution.
3. **Walk-Forward gate** (auto-triggered when S109-001 reaches 20 trades with WR ≥ 65% and PF ≥ 2.0): Promotion to Paper Trading.
4. **Weekly review** will appear in the dashboard every Monday morning.
5. **Daily brief** will appear every weekday morning.

---

*ARP-1 represents the completion of Atlas OS Phase 1 (infrastructure) and the beginning of Phase 2 (autonomous operation). The system is now capable of conducting quantitative research, monitoring its own health, and generating institutional-quality reports without human initiation.*
