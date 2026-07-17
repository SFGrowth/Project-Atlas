# Orion Architecture Review Directive

**Author:** Atlas Chief Architect (Orion)
**Date:** 2026-07-17
**Sprint:** 120
**Status:** APPROVED — Permanently encoded in Atlas Memory (ORION-DIRECTIVE-001)
**Supersedes:** None — this document extends the Sprint 120 Market Data Architecture

---

## Executive Summary

The Sprint 120 Market Data Architecture is approved in principle. The proposed DataBento architecture, provider-independent event contracts, shadow-mode migration, replay engine, dual-feed failover, and Atlas-owned market data pipeline represent an institutional-grade foundation and shall remain the basis of Atlas moving forward.

This directive does not replace the current architecture. Instead, it extends Atlas into a **true autonomous quantitative research operating system**.

The goal is to ensure Atlas evolves beyond a trading platform into an AI-driven research organisation capable of understanding, explaining, and improving its own decision-making.

---

## Part I — Approved Architecture (Non-Negotiable)

The following architectural decisions from Sprint 120 are approved without modification. They are permanent and shall not be revisited without a formal architectural review.

| Decision | Specification |
|---|---|
| Primary market data provider | DataBento GLBX.MDP3, MBP-1 schema |
| Fallback market data provider | TradingView M-16 Pine Script — permanent, not temporary |
| Bar construction | Atlas-owned bar builder — no external bar data |
| DataBento connectivity | Backend-only — never exposed to frontend |
| Market event contracts | Provider-independent internal types — no DataBento types in downstream code |
| Replay architecture | Same-code-path — identical to live execution |
| Migration strategy | Shadow-mode — additive, zero risk to live trading |
| Architecture style | Event-driven — all market data flows through the Atlas event bus |
| Separation of concerns | Market data completely separated from execution logic |
| Dashboard role | Dashboard is never in the execution path |

These principles are non-negotiable and govern all future implementation decisions.

---

## Part II — Architecture Extensions

The following ten capabilities are mandated as new platform capabilities. These are not strategy changes — they are foundational extensions to the Atlas platform itself.

---

### Extension 1 — Atlas Behaviour Engine

A new core service, the **Behaviour Engine**, becomes responsible for identifying market behaviours independently from strategy logic. Strategies shall no longer detect behaviour themselves. Instead, they consume behaviour signals produced by the Behaviour Engine.

The Behaviour Engine is a first-class citizen within Atlas, operating between the Feature Engine and the Atlas Intelligence Layer.

**Canonical behaviour outputs:**

| Behaviour ID | Description |
|---|---|
| `TREND_CONTINUATION` | Price continuing in the direction of the established trend |
| `SECOND_ENTRY_PULLBACK` | Pullback to a prior breakout level offering a second entry |
| `LIQUIDITY_SWEEP` | Price sweeping a liquidity pool (stop cluster) before reversing |
| `FAILED_BREAKOUT` | Breakout attempt that fails and reverses |
| `MEAN_REVERSION` | Price returning to a mean (VWAP, EMA, prior range midpoint) |
| `OPENING_RANGE_BREAKOUT` | Breakout from the opening range (first 30 or 60 minutes) |
| `VWAP_RECLAIM` | Price reclaiming VWAP after a failed break below/above |
| `COMPRESSION` | Narrowing range indicating energy build before expansion |
| `BREAKOUT_EXPANSION` | Expansion from compression or consolidation |
| `OVERNIGHT_INVENTORY` | Directional bias from overnight positioning |
| `SESSION_ROTATION` | Transition between session regimes (Asia → London → New York) |
| `VOLATILITY_EXPANSION` | Sudden increase in ATR indicating regime change |

Each behaviour instance carries the following attributes:

| Attribute | Type | Description |
|---|---|---|
| `confidence` | `0–100` | Statistical confidence in the classification |
| `probability` | `0–1` | Forward probability of the expected outcome |
| `maturity` | `FORMING \| ACTIVE \| MATURE \| EXHAUSTED` | Lifecycle stage |
| `evidence_score` | `0–100` | Strength of supporting evidence |
| `historical_expectancy` | `decimal` | Average R-multiple when this behaviour was traded historically |

---

### Extension 2 — Behaviour Library

A permanent **Behaviour Registry** stores every discovered market behaviour independently from strategies. This is the institutional memory of Atlas — the accumulated knowledge of every behaviour ever observed and validated.

**Behaviours do not belong to strategies. Strategies reference behaviours.**

Each behaviour record contains:

| Field | Description |
|---|---|
| Name | Canonical identifier |
| Description | Plain-language explanation |
| Required Conditions | Minimum conditions for classification |
| Supporting Evidence | Statistical evidence base |
| Statistical Validation | Sample size, win rate, profit factor, stability metrics |
| DARWIN Discovery History | Which research cycle discovered this behaviour |
| Market Regimes | Which regimes this behaviour occurs in |
| Best Sessions | Which sessions produce the highest-quality instances |
| Expected Win Rate | Historical win rate when traded |
| Expected Drawdown | Historical maximum adverse excursion |
| Portfolio Correlation | Correlation with existing strategies |
| Confidence | Current confidence level |
| Lifecycle Stage | `HYPOTHESIS \| VALIDATED \| PRODUCTION \| RETIRED` |

---

### Extension 3 — Strategy DNA

Every strategy automatically exposes a **Strategy DNA** metadata record. ADE shall use Strategy DNA when selecting models for a given bar.

**Strategy DNA fields:**

| Field | Description |
|---|---|
| Strategy Name | Canonical identifier |
| Primary Behaviour | The primary behaviour this strategy trades |
| Secondary Behaviour | Optional supporting behaviour |
| Market Regime | Target regime (trending, ranging, volatile) |
| Session | Target session (London, New York, Asia) |
| Direction Bias | Long, Short, or Both |
| Win Rate | Rolling win rate (50-trade window) |
| Profit Factor | Rolling profit factor |
| Average R | Rolling average R-multiple |
| Maximum Drawdown | Maximum observed drawdown |
| Average Hold Time | Average trade duration in minutes |
| Trade Frequency | Expected trades per week |
| Behaviour Correlation | Correlation between strategy and its primary behaviour |
| Portfolio Correlation | Correlation with other active strategies |
| Current Confidence | Real-time confidence score |
| Historical Confidence | Confidence trend over time |
| Expected Opportunity Frequency | Expected qualifying bars per week |

---

### Extension 4 — Decision Replay Engine

Replay shall not only replay market data. **Replay shall reconstruct Atlas' thinking.**

Every bar processed by Atlas shall store a complete decision record, enabling deterministic replay of both market data and decision logic. When replaying history, Atlas must be able to answer "Why was Strategy B selected instead of Strategy A?" without recalculation.

**Per-bar decision record:**

| Field | Description |
|---|---|
| Detected Behaviour | Behaviour Engine output at this bar |
| ADE Scores | Full ADE dimension scores for every evaluated model |
| Strategy Rankings | Ranked list of strategies considered |
| Guardian Decisions | Guardian accept/reject for each candidate |
| ARI Confidence | ARI confidence score and decision |
| TVL Decision | TVL accept/reject and reason |
| Risk State | Account risk state at bar time |
| Execution Decision | Final execution decision |
| Reason For Rejection | Why the rejected models were not selected |
| Reason For Selection | Why the selected model was chosen |
| Alternative Models Considered | All models evaluated but not selected |

---

### Extension 5 — Self-Diagnosis Engine

Every completed trade automatically generates a **trade diagnosis**. Losses become research assets rather than discarded data.

**Winning trade diagnosis:**

| Question | Purpose |
|---|---|
| What worked? | Identify the successful component |
| Why? | Explain the mechanism |
| Which behaviour produced edge? | Attribute the win to a specific behaviour |
| Expected repeatability? | Assess whether this is a repeatable edge |

**Losing trade diagnosis — failure classification:**

| Failure Category | Description |
|---|---|
| Primary Failure Cause | The dominant reason for the loss |
| Secondary Cause | Contributing factor |
| Regime Mismatch | Strategy traded outside its target regime |
| VWAP Conflict | Entry against VWAP direction |
| ATR Compression | Low volatility environment unsuitable for the strategy |
| ADX Weakness | Insufficient trend strength |
| Late Entry | Entry after the optimal entry window |
| News Influence | Macro event disrupted the setup |
| Trend Exhaustion | Trend was ending when the strategy entered |
| Behaviour Misclassification | Behaviour Engine misidentified the setup |

---

### Extension 6 — Live Confidence Engine

Every live trade exposes **layered confidence** in real time. The dashboard displays confidence live. DARWIN analyses confidence drift over time to detect degrading edges before they produce significant losses.

**Confidence layers:**

| Layer | Description |
|---|---|
| Behaviour Confidence | Confidence in the detected behaviour classification |
| Strategy Confidence | Confidence in the strategy's suitability for this bar |
| ADE Confidence | ADE normalised score as a confidence indicator |
| Guardian Confidence | Guardian's risk-adjusted confidence |
| Regime Confidence | Confidence that the current regime matches the strategy's target |
| Portfolio Confidence | Confidence that this trade adds portfolio value |
| Execution Confidence | Confidence in execution quality (spread, time of day, liquidity) |
| Overall Confidence | Composite confidence score |

---

### Extension 7 — Atlas Intelligence Layer

A new architectural layer is inserted between the Behaviour Library and ADE. This **Intelligence Layer** becomes the knowledge centre of Atlas — the component that synthesises behaviour signals, strategy DNA, historical context, and portfolio state into a unified decision input for ADE.

**Current architecture:**

```
Market Data → Feature Engine → processBar() → ADE → Execution
```

**Target architecture:**

```
Market Data
    ↓
Feature Engine
    ↓
Behaviour Engine
    ↓
Behaviour Library
    ↓
Atlas Intelligence Layer    ← Knowledge centre
    ↓
ADE
    ↓
Guardian
    ↓
Execution
    ↓
Learning
```

---

### Extension 8 — DARWIN Integration

DARWIN no longer researches strategies. **DARWIN researches behaviours.** Behaviours graduate into strategies through a formal pipeline.

**Behaviour graduation pipeline:**

```
Behaviour Discovery
    ↓
Hypothesis Formation
    ↓
Statistical Validation
    ↓
Strategy Specification
    ↓
Paper Trading (forward validation)
    ↓
Production (live account)
    ↓
Portfolio Integration
```

This pipeline ensures that every strategy in the Atlas portfolio is grounded in a validated, statistically significant market behaviour — not in curve-fitting or external imitation.

---

### Extension 9 — Research Philosophy

Atlas shall never chase external strategies. When an external strategy is encountered (YouTube, social media, vendor), it shall be **decomposed into its behavioural components**. Only the underlying behaviour is evaluated. If the behaviour is statistically significant and stable, it enters the DARWIN research pipeline. The external strategy itself is discarded.

> "The objective is not to maximise the number of strategies. The objective is to build the smallest possible portfolio of robust, complementary models that collectively cover the widest range of market conditions while maintaining controlled drawdown and execution reliability."

---

### Extension 10 — Long-Term Vision

Atlas is no longer defined as a collection of automated trading strategies.

**Atlas is:**

> **An autonomous quantitative research operating system capable of discovering, validating, explaining, and deploying statistically significant market behaviours.**

Every subsystem — market data, behaviour detection, strategy selection, execution, diagnosis, and research — shall evolve toward this objective. Every architectural decision shall be evaluated against this definition.

---

## Part III — Implementation Priorities

The ten extensions are sequenced by dependency and risk:

| Priority | Extension | Dependency | Target Sprint |
|---|---|---|---|
| 1 | Behaviour Engine (schema + core logic) | Sprint 121 market data infra | Sprint 122 |
| 2 | Behaviour Library (database + registry) | Behaviour Engine | Sprint 122 |
| 3 | Strategy DNA (metadata schema) | Behaviour Library | Sprint 123 |
| 4 | Decision Replay Engine (bar decision records) | Strategy DNA | Sprint 123 |
| 5 | Self-Diagnosis Engine (trade diagnosis) | Decision Replay | Sprint 124 |
| 6 | Live Confidence Engine (layered confidence) | Self-Diagnosis | Sprint 124 |
| 7 | Atlas Intelligence Layer (synthesis) | All above | Sprint 125 |
| 8 | DARWIN Integration (behaviour research) | Intelligence Layer | Sprint 125 |
| 9 | Research Philosophy (process governance) | DARWIN Integration | Sprint 126 |
| 10 | Full Autonomous QR OS | All above | Sprint 127+ |

---

## Part IV — Permanent Directives

The following directives are permanently encoded in Atlas Memory (ORION-DIRECTIVE-001) and govern all future DARWIN research cycles and architectural decisions:

1. The Behaviour Engine is a first-class citizen. Strategies consume behaviour signals — they do not detect behaviour.
2. The Behaviour Library is the institutional memory of Atlas. It is permanent and grows continuously.
3. Every strategy must have a Strategy DNA record before entering paper trading.
4. Every bar processed in production must generate a decision record for the Decision Replay Engine.
5. Every completed trade must generate a Self-Diagnosis record.
6. DARWIN researches behaviours, not strategies.
7. No external strategy is adopted without behavioural decomposition and statistical validation.
8. The Atlas Intelligence Layer is the knowledge centre — it synthesises all signals before ADE.
9. Confidence is layered, transparent, and monitored for drift.
10. Atlas is an autonomous quantitative research operating system. Every decision must serve this definition.

---

*This document is permanently stored in Atlas Memory as ORION-DIRECTIVE-001 and shall be referenced at the start of every DARWIN research cycle.*
