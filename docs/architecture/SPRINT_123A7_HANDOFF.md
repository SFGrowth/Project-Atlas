# Sprint 123A.7 — Handoff Document

**Document type:** Sprint Handoff  
**Version:** 1.0  
**Effective from:** Sprint 123A.6 / Gate G6A (pending Phil approval)  
**Parent doctrine:** `ATLAS_AUTONOMOUS_QUANTITATIVE_RESEARCH_MISSION.md`  
**Status:** PROPOSED — awaiting Gate G6A approval

---

## 1. Sprint 123A.7 Title

**AUTONOMOUS RESEARCH OPERATIONS AND STRATEGY LIFECYCLE MONITORING**

---

## 2. What Sprint 123A.7 Is NOT

Sprint 123A.7 is **not** defined as "remove the SHADOW qualifier from DARWIN."

That framing was incorrect. Removing the SHADOW qualifier would imply activating decision or execution authority, which requires separate future gates.

---

## 3. What Sprint 123A.7 May Authorise

Sprint 123A.7 may authorise DARWIN to operate its full research cycle autonomously:

- Continuous observation of live `atlas_memory` bars
- Scheduled historical research cycles (per `DARWIN_RESEARCH_SCHEDULING.md`)
- Strategy monitoring and rolling metric computation
- Portfolio gap detection and registry updates
- Candidate generation from gap registry
- Experiment execution against historical and live data
- Recommendation reports (markdown, committed to git)

---

## 4. What Sprint 123A.7 Must NOT Authorise

Sprint 123A.7 must not authorise any of the following. These require separate future gates:

| Prohibited action | Future gate required |
|------------------|---------------------|
| `processBar` calls from DARWIN | Never — TradingView-only invariant |
| `postBarAutomation` calls from DARWIN | Never — TradingView-only invariant |
| TradersPost webhooks from DARWIN | Separate execution gate |
| Tradovate orders from DARWIN | Separate execution gate |
| Live strategy promotion | Separate promotion gate |
| Risk parameter changes | Separate risk gate |
| Execution parameter changes | Separate execution gate |
| Capital reallocation | Separate capital gate |

---

## 5. Sprint 123A.7 Prerequisite: Gate G6A Approval

Sprint 123A.7 must not begin until:

1. Gate G6A is reviewed and approved by Phil
2. All 15 Gate G6A withhold requirements are satisfied
3. The corrected evidence report is committed and pushed
4. Phil provides written approval to proceed

---

## 6. Sprint 123A.7 Proposed Scope

### 6.1 Phase 1 — Pine Script Reconciliation

Complete the strategy fidelity reconciliation required by `DARWIN_STRATEGY_FIDELITY_REPORT.md`:

- Obtain Pine Script source for A1, A3, B1, SB1, ORB-1
- Line-by-line comparison of entry, exit, session filters, position sizing
- Update fidelity ratings from `APPROXIMATE` to `EXACT` or `DIVERGENT`
- Rerun backtests with confirmed implementation parity
- Produce updated strategy status classifications

### 6.2 Phase 2 — Live Observation Pipeline

Activate DARWIN observation recording from live `atlas_memory` bars:

- Connect `darwin-observation-service.ts` to live bar stream
- Begin recording observations with `researchOnly=true`
- Verify `processBarCalled=false` and `postBarAutomationCalled=false` on every insert
- Verify `tradovateOrderSubmitted=false` on every shadow signal

### 6.3 Phase 3 — Scheduled Research Cycle

Implement the research scheduling design from `DARWIN_RESEARCH_SCHEDULING.md`:

- Configure cron jobs for monitoring and research cycles
- Implement portfolio gap review automation
- Implement candidate ranking and reporting

### 6.4 Phase 4 — Strategy Monitoring Dashboard

Extend the DARWIN dashboard to show:

- Rolling metrics for all 5 strategies
- Caution flags
- Portfolio gap registry
- Research cycle status

---

## 7. Authority Boundaries Unchanged

The following authority boundaries are unchanged from Gate G6A and remain in force for Sprint 123A.7:

| Authority | Status |
|-----------|--------|
| `DATABENTO_CHART_AUTHORITY` | ACTIVE — unchanged |
| `TRADINGVIEW_PROCESSBAR_AUTHORITY` | ACTIVE — unchanged |
| `TRADINGVIEW_POSTBARAUTOMATION_AUTHORITY` | ACTIVE — unchanged |
| `DATABENTO_LEARNING_AUTHORITY` | SHADOW — research-only |
| `DARWIN_DECISION_AUTHORITY` | INACTIVE — not activated in Sprint 123A.7 |
| `DARWIN_EXECUTION_AUTHORITY` | INACTIVE — not activated in Sprint 123A.7 |

---

## 8. Amendment History

| Version | Date | Author | Change |
|---------|------|--------|--------|
| 1.0 | 2026-07-22 | Atlas Nexus (Phil approval) | Initial handoff — Sprint 123A.6 Gate G6A |
