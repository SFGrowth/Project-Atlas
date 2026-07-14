# Sprint 104 — Executive Intelligence Dashboard Architecture

## Summary of Changes

### New DB Tables Required
1. `capital_growth_milestones` — configurable risk milestones for Part 8
2. `executive_reports` — stores daily/weekly/monthly auto-generated reports for Part 9

### New tRPC Procedures Required
- `executive.homeStats` — all 13 home metrics in one call
- `executive.strategyPerformance` — per-model live stats (today/7d/30d/all-time)
- `executive.riskAnalytics` — risk projections at configurable risk levels
- `executive.portfolioCommandCentre` — portfolio overview + model rankings
- `executive.coverageMap` — gap coverage map data
- `executive.darwinLive` — DARWIN research live status
- `executive.liveLearningLatest` — what Atlas learned from the last candle
- `executive.capitalGrowth` — capital growth milestones + projections
- `executive.reports` — list/get executive reports
- `executive.generateReport` — trigger manual report generation

### New Pages
- `/executive` — Executive Intelligence Home (replaces Home as primary page)
- `/strategy-performance` — Part 2: Live Strategy Performance
- `/risk-analytics` — Part 3: Risk Analytics (configurable profiles)
- `/portfolio-command` — Part 4+5: Portfolio Command Centre + Coverage Map
- `/capital-growth` — Part 8: Capital Growth tracker
- `/executive-reports` — Part 9: Executive Reports archive

### Existing Pages Enhanced
- `Home.tsx` — redesigned as Executive Home (Part 1)
- `Portfolio.tsx` — enhanced with command centre view
- `Darwin.tsx` — enhanced with live research status
- `LiveLearningDashboard.tsx` — enhanced with per-candle update panel

## Strategy Registry (for static reference in frontend)
Based on institutional knowledge:

### Production (ATS v2.0 — Frozen)
- A1: EMA21 Pullback | TRENDING | PM | PF 1.5 | WR ~60% | PCS 65.0
- A2: Flag Continuation | TRENDING | Late PM | PF 1.27 | WR ~52% | PCS ~62
- A3: Overnight Breakout | TRENDING | AM Open | PF 1.76 | WR ~60% | PCS 69.2
- Portfolio: PF 1.708 | Net $5,212 | MaxDD -$771 | PCS 66.1

### Paper Trading / Forward Validation
- ORB-1: Opening Range Breakout | VOLATILE | AM Open | PF 7.76 | WR 79.5% | PCS 91.2
- SB1: VWAP Reclaim | TRENDING | AM | PF 1.55 | WR ~62% | PCS 59.2

### Candidates
- RC-006: Volatility Expansion Momentum | VOLATILE | RTH | PF 1.55 | PCS 61.0
- RC-NEW-001: VOLATILE ORB Extension | VOLATILE | AM Open | Hypothesis
- RC-NEW-002: Pre-Market Level Filter | ALL | AM | Context filter

## Risk Profiles
- Prop Evaluation: $450/trade
- Live Profile: $1,650/trade
- User Defined: configurable

## Page Routing Plan
```
/ → Executive Home (Part 1) — redesigned
/strategy-performance → Live Strategy Performance (Part 2)
/risk-analytics → Risk Analytics (Part 3)
/portfolio-command → Portfolio Command Centre (Part 4+5)
/capital-growth → Capital Growth (Part 8)
/executive-reports → Executive Reports (Part 9)
```
