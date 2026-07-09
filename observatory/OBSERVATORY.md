# Atlas Observatory — Architecture Specification v1.0

**Sprint:** 049  
**Status:** ACTIVE  
**Production Safety:** Observatory may NEVER modify production. Read-only access to all live data.

---

## 1. Purpose

The Atlas Observatory is the continuous learning layer of the Atlas Trading System. It does not trade. It observes, records, and questions. Its sole purpose is identifying situations where Atlas should learn something new.

The Observatory converts live production behaviour into a structured research queue, ensuring that every future hypothesis is grounded in observed market reality rather than theoretical intuition.

---

## 2. Architecture

```
ATS v2.0 (Production)
        │
        ▼ (trade logs, rejected signals, ARI decisions)
┌───────────────────────────────────────────────────────┐
│                 OBSERVATORY CORE ENGINE               │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────┐  │
│  │ Trade       │  │ Regime       │  │ Exceptional │  │
│  │ Analyser    │  │ Monitor      │  │ Move        │  │
│  │             │  │              │  │ Scanner     │  │
│  └─────────────┘  └──────────────┘  └─────────────┘  │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────┐  │
│  │ Missed Opp  │  │ ARI Decision │  │ Knowledge   │  │
│  │ Scanner     │  │ Validator    │  │ Confidence  │  │
│  │             │  │              │  │ Tracker     │  │
│  └─────────────┘  └──────────────┘  └─────────────┘  │
└───────────────────────────────────────────────────────┘
        │
        ▼ (classified observations)
┌───────────────────────────────────────────────────────┐
│              RESEARCH QUEUE ENGINE                    │
│  No Action │ Monitor │ Generate Hypothesis │ Priority │
└───────────────────────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────────────────────┐
│           OBSERVATORY DASHBOARD                       │
│  Daily Report │ Weekly Drift │ Monthly Opportunity    │
│  Research Queue │ Knowledge Confidence │ Alerts       │
└───────────────────────────────────────────────────────┘
```

---

## 3. Observation Taxonomy

Every observation is classified into one of seven categories:

| Category | Code | Description |
|---|---|---|
| Trade Execution | TE | Analysis of completed trades vs expected behaviour |
| Rejected Signal | RS | Signals that were filtered by ARI or policy rules |
| Missed Opportunity | MO | Exceptional moves that no model captured |
| Regime Transition | RT | Changes in ADX/ATR regime state |
| ARI Decision | AD | Evaluation of ARI intervention quality |
| Model Behaviour | MB | Unusual model performance patterns |
| Market Structure | MS | New structural behaviours not previously observed |

---

## 4. Research Queue Classification Rules

Every observation receives one of four classifications based on statistical significance and magnitude:

| Classification | Trigger Condition | Action |
|---|---|---|
| **No Action** | Within ±1σ of historical baseline | Log only |
| **Monitor** | ±1σ to ±2σ deviation, or 3+ consecutive sessions | Track for 10 trading days |
| **Generate Hypothesis** | ±2σ deviation, or Monitor item persists 10+ days | Add to research backlog with URS pre-score |
| **Immediate Priority** | ±3σ deviation, or production assumption failure | Escalate to next sprint |

---

## 5. Daily Questions

The Observatory answers these questions automatically every trading day:

1. Did Atlas perform as expected today?
2. Did any model behave unusually?
3. Did any model stop behaving normally?
4. Did ARI intervene correctly?
5. Were there exceptional moves Atlas completely missed?
6. Were there rejected trades that became major winners?
7. Did the market exhibit a new structural behaviour?
8. Has any production assumption become weaker?
9. Did today's market increase or decrease Atlas Knowledge Confidence?

---

## 6. Knowledge Confidence Tracking

The Observatory maintains a rolling Knowledge Confidence score for each validated market truth. Confidence increases when observations confirm the truth, decreases when observations contradict it.

| Market Truth | Initial Confidence | Tracking Metric |
|---|---|---|
| Regime Dependence | 95% | ADX/performance correlation |
| Session Asymmetry | 90% | PM vs AM performance ratio |
| Overnight Compression | 90% | A3 win rate vs historical |
| Structural Anchoring | 85% | A1/A2 entry quality scores |
| Static Level Failure | 80% | D200/VA performance |

---

## 7. Production Safety Rules

1. The Observatory has **read-only** access to all production data.
2. The Observatory **may never** modify ATS v2.0 parameters.
3. The Observatory **may never** block or modify live trades.
4. All recommendations are advisory only.
5. Only a formal Atlas sprint can promote a research queue item to production.

---

## 8. Data Schema

### Trade Log Entry
```json
{
  "date": "2026-07-09",
  "model": "A3",
  "session": "overnight",
  "direction": "long",
  "entry": 21450.25,
  "exit": 21468.75,
  "pnl_points": 18.5,
  "pnl_dollars": 740.0,
  "risk_dollars": 800.0,
  "outcome": "win",
  "adx_at_entry": 38.2,
  "atr_at_entry": 12.4,
  "regime": "high_adx",
  "ari_intervention": false,
  "ari_rule": null,
  "risk_multiplier": 1.0
}
```

### Observation Entry
```json
{
  "date": "2026-07-09",
  "category": "MO",
  "description": "AM session produced 4.2R move at 09:47 ET. No model active.",
  "magnitude": 4.2,
  "sigma_deviation": 2.8,
  "classification": "Generate Hypothesis",
  "urs_pre_score": 72,
  "knowledge_impact": "AM_session_edge: -2%",
  "recommended_action": "Investigate AM volatility breakout with RelVol filter"
}
```
