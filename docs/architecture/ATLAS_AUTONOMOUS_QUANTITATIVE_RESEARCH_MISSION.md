# Project Atlas — Autonomous Quantitative Research Mission

**Document type:** Permanent Doctrine  
**Version:** 1.0  
**Effective from:** Sprint 123A.6 / Gate G6A  
**Authority:** Phil (owner) — this document may only be amended with Phil's written approval  
**Status:** ACTIVE

---

## 1. Central Mission

Atlas's long-term objective is to operate as a fully autonomous quantitative research and strategy-management platform for MNQ futures trading.

Atlas must continuously analyse live and historical market data across all approved strategies, sessions, regimes, timeframes, event types, and market conditions.

Its purpose is not limited to improving strategies already known to the system.

---

## 2. Continuous Research Obligations

Atlas and DARWIN must continuously:

- observe unexplained market behaviour;
- identify gaps in current portfolio coverage;
- detect recurring market occurrences;
- generate testable quantitative hypotheses;
- run reproducible historical experiments;
- validate results using chronological train, validation, out-of-sample, and walk-forward periods;
- account for fees, commissions, slippage, and realistic execution constraints;
- compare candidates against appropriate baselines;
- reject unstable or overfitted findings;
- identify strategies with genuine positive expectancy;
- identify strategies that add diversification and portfolio value;
- create new research candidates when market gaps are found;
- maintain an immutable record of failed and inconclusive research paths.

---

## 3. Continuous Portfolio Monitoring Obligations

Atlas must also continuously monitor every strategy already in the portfolio, including:

- A1;
- A3;
- B1;
- SB1;
- ORB-1;
- every DARWIN-created candidate;
- every manually proposed strategy;
- every future live, shadow, or retired strategy.

Monitoring must detect:

- declining expectancy;
- declining profit factor;
- rising drawdown;
- longer loss streaks;
- regime failure;
- volatility sensitivity;
- execution-cost sensitivity;
- increasing correlation with other strategies;
- loss of diversification value;
- parameter instability;
- divergence between historical, shadow, and live results;
- structural market change;
- edge decay.

---

## 4. Strategy Lifecycle

The intended strategy lifecycle is:

```
OBSERVED
  → HYPOTHESIS
    → BACKTEST
      → OUT_OF_SAMPLE
        → SHADOW
          → ELIGIBLE_FOR_REVIEW
            → LIMITED_LIVE
              → ACTIVE
                → CAUTION
                  → REDUCED
                    → SHADOW_REVIEW
                      → RETIRED
```

Not every candidate must pass through every stage.

Rejected candidates must enter: `REJECTED`

Insufficient evidence must enter: `INCONCLUSIVE`

A previously profitable strategy must not remain `ACTIVE` merely because it once worked.

An underperforming strategy must be eligible for:

- downgrade to `CAUTION`;
- reduced allocation;
- removal from new-entry eligibility;
- return to `SHADOW`;
- retirement.

A new strategy must not be promoted because of an attractive backtest alone.

All promotion, demotion, reduction, and retirement actions must be:

- evidence-based;
- reproducible;
- auditable;
- resistant to overfitting;
- governed by explicit authority gates;
- approved by Phil where required.

---

## 5. Authority Boundaries (Permanent)

### 5.1 What DARWIN May Do Autonomously

- Observe market behaviour and record observations
- Label outcomes from confirmed historical and live bars
- Run reproducible experiments against historical data
- Discover and register candidate patterns
- Evaluate candidates against statistical gates
- Monitor active strategies for edge decay
- Classify strategies as `CAUTION_CANDIDATE` or `REQUIRES_REVIEW`
- Generate portfolio gap entries
- Produce research reports and recommendations

### 5.2 What DARWIN May Never Do Without Phil's Written Approval

- Promote a candidate from `SHADOW` to `ELIGIBLE_FOR_REVIEW` or above
- Reduce or retire any active strategy
- Reallocate capital between strategies
- Change position sizing or risk parameters
- Send TradersPost webhooks
- Submit Tradovate orders
- Call `processBar` or `postBarAutomation`
- Change any live trading parameter

### 5.3 Permanent Authority Invariants

| Function | Authority | Changeable? |
|----------|-----------|-------------|
| `AtlasLiveChart` data source | **Databento** | No — requires new gate |
| `processBar` trigger | **TradingView** | No — requires new gate |
| `postBarAutomation` trigger | **TradingView** | No — requires new gate |
| DARWIN observation recording | **Databento** (research-only) | No — shadow mode only |
| DARWIN candidate promotion | **Phil approval required** | No — hardcoded |
| DARWIN trading signals | **Shadow only** | No — `tradovateOrderSubmitted=false` enforced |
| Capital reallocation | **Phil approval required** | No |

---

## 6. Desired End State

The desired end state is a self-improving portfolio in which Atlas continuously:

1. watches the market;
2. identifies gaps and unexplained occurrences;
3. discovers and tests new quantitative patterns;
4. adds strategies with verified positive expectancy and portfolio benefit;
5. monitors all active strategies for deterioration;
6. reduces or removes underperforming strategies;
7. reallocates research attention and, in future authorised stages, capital toward the most robust opportunities.

This autonomous research and portfolio-management cycle is the central mission of DARWIN and Project Atlas.

---

## 7. Fundamental Objective (Unchanged from DARWIN Doctrine)

> The objective is **not** to maximise the number of strategies.
> The objective is to build the **smallest possible portfolio of robust, complementary models** that collectively cover the widest range of market conditions while maintaining controlled drawdown and execution reliability.
> DARWIN must prioritise **discovering market behaviour** over producing more strategies.

---

## 8. References

This document is referenced from:

- `docs/architecture/DARWIN_STRATEGY_MONITORING_CONTRACT.md` — monitoring contract
- `docs/architecture/DARWIN_LIFECYCLE_RULES.md` — lifecycle transition rules
- `docs/architecture/DARWIN_PORTFOLIO_GAP_REGISTRY.md` — portfolio gap registry
- `docs/architecture/DARWIN_RESEARCH_SCHEDULING.md` — research scheduling design
- `docs/architecture/SPRINT_123A7_HANDOFF.md` — Sprint 123A.7 scope
- `server/market-data/darwin-authority.ts` — TypeScript authority contract
- `server/darwin/darwin-occurrence-engine.ts` — candidate engine
- `todo.md` — sprint tracking
- All future gate evidence reports

---

## 9. Amendment History

| Version | Date | Author | Change |
|---------|------|--------|--------|
| 1.0 | 2026-07-22 | Atlas Nexus (Phil approval) | Initial permanent doctrine — Sprint 123A.6 Gate G6A |
