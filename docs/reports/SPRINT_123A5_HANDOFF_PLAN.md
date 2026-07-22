# Sprint 123A.5 — Corrected Handoff Plan

**Prepared:** 2026-07-22 (corrected)  
**Status:** NOT STARTED — awaiting Phil's written approval before chart authority activation  
**Supersedes:** Initial handoff plan (which incorrectly referenced SHA `d817452`)

---

## 1. Verified Starting Baseline

| Field | Value |
|---|---|
| **Repository** | https://github.com/SFGrowth/Project-Atlas |
| **Branch** | `sprint/123a-2-databento-adapter` |
| **Sprint 123A.4 implementation SHA** | `9b7972a05456a73abd2f5c572cbccb46e0f566a6` |
| **Sprint 123A.4 evidence SHA** | `98be9fddc1807e05fd7697b4aa1c9618944a07d2` |
| **Remote branch SHA (at baseline lock)** | `9b7972a05456a73abd2f5c572cbccb46e0f566a6` |
| **Local/remote match at baseline** | YES |

Sprint 123A.5 begins from the verified implementation SHA `9b7972a05456a73abd2f5c572cbccb46e0f566a6`. The incorrect SHA `d817452b5c4a3e9f8a1d6b2c7e0f4a8d9c3b5e7f` must not be used as a starting point.

---

## 2. Authority Separation — Immutable Constraint

Sprint 123A.5 concerns **chart display authority only**. The following authority assignments are frozen and must not change.

| Authority | Holder | Sprint 123A.5 Action |
|---|---|---|
| **processBar** | TradingView | **UNCHANGED** |
| **postBarAutomation** | TradingView | **UNCHANGED** |
| **Trading decisions** | TradingView pipeline | **UNCHANGED** |
| **Risk decisions** | TradingView pipeline | **UNCHANGED** |
| **Execution decisions** | TradingView pipeline | **UNCHANGED** |
| **Chart display authority** | Not activated | Sprint 123A.5 subject — display only |
| **Learning authority** | Not defined | Future sprint — must not be combined with chart authority |
| **Decision authority** | Not defined | Future sprint — must not be combined with chart authority |
| **Automation authority** | Not defined | Future sprint — must not be combined with chart authority |
| **Execution authority** | Not defined | Future sprint — must not be combined with chart authority |

**Databento chart authority means only:** the Atlas dashboard displays Databento-sourced live candles. It does not affect any trading, automation, risk, or execution path.

---

## 3. Accepted Sprint 123A.4 Baseline

The following components are accepted and must not be redesigned:

- Databento GLBX.MDP3 API connection
- Live MNQ feed (MNQU6 September front-month, contract auto-configuration)
- Python feed adapter
- Authenticated private bridge server
- TypeScript runtime orchestrator
- MySQL persistence layer
- Official one-minute reconciliation (89/89 MATCHED, 0 unresolved)
- SSE chart stream (wire format: `bar:1m-confirmed`, `bar:5m-confirmed`, `bar:developing`)
- CB-001 through CB-020 Playwright browser tests
- Authority guards in `TradeBarBuilder` and `RuntimeOrchestrator`
- GitHub push and secret-scan process

---

## 4. Sprint 123A.5 Scope

### Objective

Prepare a reversible display-only chart authority cutover and produce a Gate G5 readiness report. Do not activate chart authority until Phil gives explicit written approval.

### Activation Criteria

Before requesting activation approval, all of the following must be confirmed:

| Criterion | Requirement |
|---|---|
| Databento feed | Connected |
| Bridge | Connected |
| Runtime orchestrator | Healthy |
| MySQL persistence | Active |
| Reconciliation | Healthy (≥ 99.5% MATCHED) |
| Unresolved bars | 0 |
| Authenticated chart history | Working |
| Authenticated SSE | Working |
| CB-001 through CB-020 | All pass |
| Chart-authority readiness script | All 7 gates pass |
| TradingView processBar authority | Unchanged |
| TradingView postBarAutomation authority | Unchanged |
| Phil's written approval | **Required — do not activate without it** |

The five-trading-day shadow period is additional operational-confidence evidence, not an automatic implementation blocker. The existing 89/89 MATCHED bars prove the pipeline is connected and operational.

### Implementation Requirements

The chart authority activation must:

- Switch the dashboard chart source to Databento
- Preserve TradingView processing authority
- Preserve TradingView automation authority
- Preserve shadow reconciliation
- Retain rapid fallback to the previous chart source
- Expose the current chart authority in health state and UI
- Prevent mixed chart-source state
- Prevent duplicate candles
- Prevent SSE replay corruption

### Test Requirements

The Gate G5 test suite must prove:

- Chart authority is inactive by default
- Activation requires the approved feature gate
- Databento chart source becomes active only after valid configuration
- processBar remains TradingView-owned
- postBarAutomation remains TradingView-owned
- Strategy, risk, and execution are unchanged
- Stale Databento feed blocks activation
- Disconnected Databento feed blocks activation
- Unresolved data blocks activation where required
- Fallback restores the previous chart source
- Fallback does not duplicate candles
- Fallback does not corrupt persisted data
- Repeated activation is idempotent
- Repeated fallback is idempotent
- Health state reports the active chart authority
- UI badge reports the active chart authority

---

## 5. Deliverables

| Deliverable | When |
|---|---|
| `docs/reports/SPRINT_123A5_CHART_AUTHORITY_READINESS.md` | Before activation — stop here and request approval |
| `docs/reports/SPRINT_123A5_CHART_AUTHORITY_ACTIVATION_RESULTS.md` | After Phil's written approval and successful activation |

---

## 6. GitHub Requirements

Every Sprint 123A.5 change must be committed and pushed before any gate submission. Local and remote SHAs must match. No secrets may be committed. The branch must not be merged into `main` without Phil's explicit written approval.

---

*This corrected handoff plan supersedes the initial version. The correct Sprint 123A.4 baseline SHA is `9b7972a05456a73abd2f5c572cbccb46e0f566a6`.*
