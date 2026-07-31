# DARWIN Research Coverage Registry

**Version:** 1.0.0
**Created:** 2026-07-31T01:18:00Z
**Sprint:** darwin-complete-edge-search-universe
**Status:** PRE-REGISTRATION

---

## Dashboard Metrics

| Metric | Value |
|---|---|
| TOTAL_RESEARCH_FAMILIES | 24 |
| TOTAL_DEFINED_RULES | 35 |
| ACTIVE_RULE_COUNT | 0 |
| INACTIVE_RULE_COUNT | 35 |
| BLOCKED_RULE_COUNT | 0 |
| TOTAL_RESEARCH_UNIVERSE_COVERAGE_PERCENT | 100% (all families catalogued) |
| ACTIVE_FAMILY_COVERAGE_PERCENT | 0% (pre-deployment) |
| TESTED_RULE_COVERAGE_PERCENT | 0% (pre-deployment) |
| UNTESTED_HIGH_PRIORITY_FAMILIES | B, C, E, F, G, H, J, N, O, P, V |
| DATA_BLOCKED_FAMILIES | I (microstructure — requires paid schema) |
| RESEARCH_STARVATION_EVENTS | 0 |
| RESEARCH_UNIVERSE_STATUS | COMPLETE_CATALOGUE |
| ALL_REQUIRED_FAMILIES_REGISTERED | TRUE |

---

## Family Registry

| Family | Name | Wave | Status | Defined Rules | Priority |
|---|---|---|---|---|---|
| A | Price Action | 1 | QUEUED_FOR_ACTIVATION | 0 | 3 |
| B | Market Structure | 1 | QUEUED_FOR_ACTIVATION | 8 | 1 |
| C | Trend | 1 | QUEUED_FOR_ACTIVATION | 3 | 2 |
| D | Mean Reversion | 2 | DEFINED | 0 | 8 |
| E | Momentum | 1 | QUEUED_FOR_ACTIVATION | 3 | 4 |
| F | Volatility | 1 | QUEUED_FOR_ACTIVATION | 4 | 1 |
| G | Volume and Participation | 1 | QUEUED_FOR_ACTIVATION | 3 | 3 |
| H | VWAP and Fair Value | 1 | QUEUED_FOR_ACTIVATION | 4 | 2 |
| I | Liquidity and Microstructure | BLOCKED | BLOCKED_DATA_UNAVAILABLE | 0 | 99 |
| J | Session and Time | 1 | QUEUED_FOR_ACTIVATION | 5 | 2 |
| K | Cross-Session Relationships | 2 | DEFINED | 0 | 6 |
| L | Regimes | 2 | DEFINED | 0 | 7 |
| M | Multi-Timeframe Relationships | 2 | DEFINED | 0 | 7 |
| N | Breakouts | 1 | QUEUED_FOR_ACTIVATION | 0 | 3 |
| O | Reversals | 1 | QUEUED_FOR_ACTIVATION | 3 | 3 |
| P | Entry Quality | 1 | QUEUED_FOR_ACTIVATION | 5 | 2 |
| Q | Exit Quality | 2 | DEFINED | 0 | 10 |
| R | Asymmetries | 2 | DEFINED | 0 | 9 |
| S | Market Cycles | 3 | DEFINED | 0 | 15 |
| T | Event Sequences | 2 | DEFINED | 0 | 8 |
| U | Cross-Feature Interactions | 2 | DEFINED | 0 | 9 |
| V | Negative Edges and No-Trade Conditions | 1 | QUEUED_FOR_ACTIVATION | 0 | 4 |
| W | Portfolio and Complementarity | 3 | DEFINED | 0 | 20 |
| X | Edge Decay and Edge Emergence | 2 | DEFINED | 0 | 11 |

---

## Wave 1 Activation Families (Post-Soak Deployment)

Families B, C, E, F, G, H, J, N, O, P, V are queued for Wave 1 activation.
Initial active rules: 35 (see DARWIN_COMPLETE_RULE_LIBRARY.md).

**MAX_ACTIVE_RULES=25** (initial Wave 1 limit).

---

## Blocked Families

**Family I — Liquidity and Microstructure**

DATA_SCHEMA_REQUIRED: Databento MBO or MBP-10
DATA_SCHEMA_AVAILABLE: OHLCV-1m only
FEATURE_SUPPORTED: FALSE
FEATURE_BLOCKER: Paid microstructure dataset not enabled. Requires Phil's written approval before any activation.

---

## Scheduler Controls

| Control | Value |
|---|---|
| MAX_RESEARCH_SHARE_PER_FAMILY | 20% |
| MIN_DISTINCT_FAMILIES_RESEARCHED_PER_WEEK | 5 |
| HIGH_PRIORITY_UNTESTED_FAMILY_AGE_LIMIT_DAYS | 14 |
| RESEARCH_STARVATION_EVENTS | 0 |

The scheduler must not remain focused permanently on one family. No additional approval is required to rotate between already approved families and frozen rules. Phil's approval is required before adding a new external data source, increasing research budgets, enabling paid microstructure datasets, changing promotion thresholds, enabling ungoverned search, activating paper trading, or activating live trading.
