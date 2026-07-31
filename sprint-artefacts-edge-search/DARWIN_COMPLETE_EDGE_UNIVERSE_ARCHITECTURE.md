# DARWIN Complete Edge-Search Universe — Architecture

**Sprint:** darwin-complete-edge-search-universe
**Branch:** sprint/darwin-complete-edge-search-universe
**Parent Commit:** 1e8557db49894bf86dcd010a9be6c4a98e482536 (origin/main)
**Created:** 2026-07-31T01:18:00Z
**Status:** PRE-REGISTRATION

---

## 1. Purpose

DARWIN's autonomous observation-to-finding chain is operational. The current
active discovery rule (RULE-J4-001: 1m bar range ≥ 1.5 × ATR14) is the only
active autonomous hypothesis source. This sprint extends DARWIN into a
continuously operating, governed research engine that searches the complete
measurable market-behaviour universe.

The objective is not to maximise the number of strategies. The objective is to
build the smallest possible portfolio of robust, complementary models that
collectively cover the widest range of market conditions while maintaining
controlled drawdown and execution reliability.

---

## 2. System Overview

```
LIVE DATA FEED
    ↓
CANONICAL FEATURE STORE (darwin_feature_snapshots)
    ↓
OBSERVATION ENGINE (existing J4 + new multi-family rules)
    ↓
HYPOTHESIS ENGINE
    ├── Memory Lookup (darwin_research_memory)
    ├── Pre-Registration Gate
    ├── Priority Scoring
    └── Experiment Queue
          ↓
    EXPERIMENT PIPELINE
    ├── Stage 1: Discovery
    ├── Stage 2: Chronological Validation
    ├── Stage 3: Walk-Forward
    ├── Stage 4: Robustness
    └── Stage 5: Prospective Shadow
          ↓
    CLASSIFICATION ENGINE
    ├── REJECTED / INCONCLUSIVE / PROMISING / SUPPORTED
    └── Reflect-Retry Governance (max depth 2)
          ↓
    RESEARCH MEMORY (darwin_research_memory)
    EDGE DECAY MONITOR
    DAILY REPORT GENERATOR
    TELEGRAM NOTIFICATION
    DASHBOARD
```

---

## 3. Authority Boundaries

| Capability | Status |
|---|---|
| Observe market behaviour | ENABLED |
| Calculate causal features | ENABLED |
| Generate hypotheses | ENABLED |
| Prioritise hypotheses | ENABLED |
| Test hypotheses historically | ENABLED |
| Reject hypotheses | ENABLED |
| Refine hypotheses (max depth 2) | ENABLED |
| Store research memory | ENABLED |
| Monitor edge decay | ENABLED |
| Notify Phil | ENABLED |
| Produce reports | ENABLED |
| Place trades | DISABLED |
| Alter strategies in execution | DISABLED |
| Change account risk | DISABLED |
| Change position size | DISABLED |
| Enable live automation | DISABLED |
| Promote strategy to trading | REQUIRES PHIL WRITTEN APPROVAL |
| Activate paper trading | REQUIRES PHIL WRITTEN APPROVAL |
| Add external data source | REQUIRES PHIL WRITTEN APPROVAL |
| Increase experiment budgets | REQUIRES PHIL WRITTEN APPROVAL |

DARWIN_DECISION_AUTHORITY=DISABLED
DARWIN_EXECUTION_AUTHORITY=DISABLED
DARWIN_PROCESSBAR_CALLS=0
DARWIN_POSTBARAUTOMATION_CALLS=0
DARWIN_TRADERSPOST_CALLS=0
DARWIN_TRADOVATE_CALLS=0

---

## 4. Research Families (A–X)

| Family ID | Name | Wave | Status |
|---|---|---|---|
| A | Price Action | 1 | QUEUED_FOR_ACTIVATION |
| B | Market Structure | 1 | QUEUED_FOR_ACTIVATION |
| C | Trend | 1 | QUEUED_FOR_ACTIVATION |
| D | Mean Reversion | 2 | DEFINED |
| E | Momentum | 1 | QUEUED_FOR_ACTIVATION |
| F | Volatility | 1 | QUEUED_FOR_ACTIVATION |
| G | Volume and Participation | 1 | QUEUED_FOR_ACTIVATION |
| H | VWAP and Fair Value | 1 | QUEUED_FOR_ACTIVATION |
| I | Liquidity and Microstructure | BLOCKED | BLOCKED_DATA_UNAVAILABLE |
| J | Session and Time | 1 | QUEUED_FOR_ACTIVATION |
| K | Cross-Session Relationships | 2 | DEFINED |
| L | Regimes | 2 | DEFINED |
| M | Multi-Timeframe Relationships | 2 | DEFINED |
| N | Breakouts | 1 | QUEUED_FOR_ACTIVATION |
| O | Reversals | 1 | QUEUED_FOR_ACTIVATION |
| P | Entry Quality | 1 | QUEUED_FOR_ACTIVATION |
| Q | Exit Quality | 2 | DEFINED |
| R | Asymmetries | 2 | DEFINED |
| S | Market Cycles | 3 | DEFINED |
| T | Event Sequences | 2 | DEFINED |
| U | Cross-Feature Interactions | 2 | DEFINED |
| V | Negative Edges and No-Trade Conditions | 1 | QUEUED_FOR_ACTIVATION |
| W | Portfolio and Complementarity | 3 | DEFINED |
| X | Edge Decay and Edge Emergence | 2 | DEFINED |

Wave 1 families are activated first (see Section 8). All other families are
DEFINED and PRIORITISED, awaiting controlled activation.

---

## 5. Database Schema — New Tables

### darwin_feature_snapshots
Canonical causal feature store. One row per bar per timeframe.

```sql
CREATE TABLE darwin_feature_snapshots (
  feature_snapshot_id   BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  source_event_id       BIGINT UNSIGNED,
  market_timestamp      DATETIME(3) NOT NULL,
  instrument            VARCHAR(20) NOT NULL DEFAULT 'MNQ',
  contract              VARCHAR(20) NOT NULL,
  timeframe             ENUM('1m','5m','15m','30m','60m') NOT NULL,
  feature_version       VARCHAR(20) NOT NULL DEFAULT '1.0.0',
  features_json         JSON NOT NULL,
  data_quality_status   ENUM('OK','STALE','MISSING','ROLL') NOT NULL DEFAULT 'OK',
  created_at            DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_ts_tf (market_timestamp, timeframe),
  INDEX idx_contract_ts (contract, market_timestamp)
);
```

### darwin_research_coverage_registry
One row per research family.

```sql
CREATE TABLE darwin_research_coverage_registry (
  family_id             VARCHAR(10) PRIMARY KEY,
  family_name           VARCHAR(100) NOT NULL,
  family_description    TEXT,
  total_defined_rules   INT NOT NULL DEFAULT 0,
  active_rules          INT NOT NULL DEFAULT 0,
  inactive_rules        INT NOT NULL DEFAULT 0,
  blocked_rules         INT NOT NULL DEFAULT 0,
  tested_hypotheses     INT NOT NULL DEFAULT 0,
  rejected_hypotheses   INT NOT NULL DEFAULT 0,
  inconclusive_hypotheses INT NOT NULL DEFAULT 0,
  promising_hypotheses  INT NOT NULL DEFAULT 0,
  supported_hypotheses  INT NOT NULL DEFAULT 0,
  last_researched_at    DATETIME(3),
  next_activation_priority INT NOT NULL DEFAULT 99,
  data_available        BOOLEAN NOT NULL DEFAULT TRUE,
  data_requirements     TEXT,
  blocker               TEXT,
  status                ENUM('DEFINED','QUEUED_FOR_ACTIVATION','ACTIVE','PAUSED',
                             'BLOCKED_DATA_UNAVAILABLE','RESEARCH_COMPLETE',
                             'REQUIRES_PHIL_APPROVAL') NOT NULL DEFAULT 'DEFINED',
  created_at            DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at            DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                          ON UPDATE CURRENT_TIMESTAMP(3)
);
```

### darwin_rule_library
Frozen causal rule definitions.

```sql
CREATE TABLE darwin_rule_library (
  rule_id               VARCHAR(30) PRIMARY KEY,
  rule_version          VARCHAR(10) NOT NULL DEFAULT '1.0.0',
  family_id             VARCHAR(10) NOT NULL,
  title                 VARCHAR(200) NOT NULL,
  market_mechanism      TEXT NOT NULL,
  exact_trigger         TEXT NOT NULL,
  context               TEXT NOT NULL,
  timeframe             VARCHAR(20) NOT NULL,
  session               VARCHAR(50) NOT NULL,
  direction             ENUM('LONG','SHORT','BOTH') NOT NULL DEFAULT 'BOTH',
  minimum_sample        INT NOT NULL DEFAULT 50,
  forward_horizons      JSON NOT NULL,
  outcome_measures      JSON NOT NULL,
  condition_signature   VARCHAR(64) NOT NULL,
  data_requirements     TEXT,
  known_limitations     TEXT,
  status                ENUM('ACTIVE','INACTIVE','BLOCKED','DEPRECATED') NOT NULL DEFAULT 'INACTIVE',
  created_at            DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (family_id) REFERENCES darwin_research_coverage_registry(family_id)
);
```

### darwin_hypotheses
Full hypothesis records with pre-registration fields.

```sql
CREATE TABLE darwin_hypotheses (
  hypothesis_id         VARCHAR(40) PRIMARY KEY,
  hypothesis_family     VARCHAR(10) NOT NULL,
  hypothesis_family_k   INT NOT NULL DEFAULT 1,
  title                 VARCHAR(300) NOT NULL,
  mechanism_rationale   TEXT NOT NULL,
  trigger_condition     TEXT NOT NULL,
  context_condition     TEXT NOT NULL,
  outcome_definition    TEXT NOT NULL,
  forward_horizons      JSON NOT NULL,
  direction             ENUM('LONG','SHORT','BOTH') NOT NULL,
  timeframe             VARCHAR(20) NOT NULL,
  session               VARCHAR(50) NOT NULL,
  regime                VARCHAR(50),
  minimum_sample        INT NOT NULL DEFAULT 50,
  minimum_independent_sessions INT NOT NULL DEFAULT 5,
  dataset               VARCHAR(100),
  dataset_sha           VARCHAR(64),
  cost_model            JSON,
  validation_plan       TEXT,
  null_hypothesis       TEXT NOT NULL,
  alternative_hypothesis TEXT NOT NULL,
  condition_signature   VARCHAR(64) NOT NULL,
  parent_hypothesis_id  VARCHAR(40),
  parent_finding_id     VARCHAR(40),
  source_observation_ids JSON,
  prior_memory_match_ids JSON,
  priority_score        DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  priority_level        ENUM('LOW','MEDIUM','HIGH','CRITICAL_REVIEW') NOT NULL DEFAULT 'MEDIUM',
  rule_id               VARCHAR(30),
  status                ENUM('OBSERVED','HYPOTHESIS_CREATED','QUEUED','TESTING',
                             'REJECTED','INCONCLUSIVE','PROMISING',
                             'INTERNAL_VALIDATION','PROSPECTIVE_VALIDATION',
                             'SUPPORTED','DEGRADED','RETIRED','SUPERSEDED')
                          NOT NULL DEFAULT 'HYPOTHESIS_CREATED',
  created_at            DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at            DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                          ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX idx_family_status (hypothesis_family, status),
  INDEX idx_condition_sig (condition_signature),
  FOREIGN KEY (hypothesis_family) REFERENCES darwin_research_coverage_registry(family_id)
);
```

### darwin_experiments
Experiment records linked to hypotheses.

```sql
CREATE TABLE darwin_experiments (
  experiment_id         VARCHAR(40) PRIMARY KEY,
  hypothesis_id         VARCHAR(40) NOT NULL,
  stage                 ENUM('DISCOVERY','CHRONOLOGICAL_VALIDATION','WALK_FORWARD',
                             'ROBUSTNESS','PROSPECTIVE_SHADOW') NOT NULL,
  dataset_period_start  DATE NOT NULL,
  dataset_period_end    DATE NOT NULL,
  dataset_sha           VARCHAR(64),
  parameters_json       JSON NOT NULL,
  results_json          JSON,
  sample_size           INT,
  raw_p_value           DECIMAL(10,6),
  bh_adjusted_p_value   DECIMAL(10,6),
  expectancy            DECIMAL(10,4),
  profit_factor         DECIMAL(10,4),
  win_rate              DECIMAL(5,4),
  bootstrap_ci_lower    DECIMAL(10,4),
  bootstrap_ci_upper    DECIMAL(10,4),
  status                ENUM('QUEUED','RUNNING','COMPLETE','FAILED') NOT NULL DEFAULT 'QUEUED',
  classification        ENUM('REJECTED','INCONCLUSIVE','PROMISING','SUPPORTED'),
  rejection_reason      VARCHAR(100),
  created_at            DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  completed_at          DATETIME(3),
  FOREIGN KEY (hypothesis_id) REFERENCES darwin_hypotheses(hypothesis_id)
);
```

### darwin_edge_decay_monitor
Rolling performance tracking for PROMISING+ findings.

```sql
CREATE TABLE darwin_edge_decay_monitor (
  monitor_id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  hypothesis_id         VARCHAR(40) NOT NULL,
  window_start          DATE NOT NULL,
  window_end            DATE NOT NULL,
  rolling_expectancy    DECIMAL(10,4),
  rolling_win_rate      DECIMAL(5,4),
  rolling_profit_factor DECIMAL(10,4),
  signal_frequency      DECIMAL(10,4),
  mfe_avg               DECIMAL(10,4),
  mae_avg               DECIMAL(10,4),
  regime_mix            JSON,
  session_mix           JSON,
  cost_drift            DECIMAL(10,4),
  slippage_drift        DECIMAL(10,4),
  ci_lower              DECIMAL(10,4),
  ci_upper              DECIMAL(10,4),
  prediction_interval_breaches INT NOT NULL DEFAULT 0,
  decay_status          ENUM('STABLE','WATCH','DEGRADED','RETIRED') NOT NULL DEFAULT 'STABLE',
  created_at            DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_hypothesis_window (hypothesis_id, window_start),
  FOREIGN KEY (hypothesis_id) REFERENCES darwin_hypotheses(hypothesis_id)
);
```

### darwin_daily_hypothesis_queue
Daily research queue records.

```sql
CREATE TABLE darwin_daily_hypothesis_queue (
  queue_id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  queue_date            DATE NOT NULL,
  queue_json            JSON NOT NULL,
  report_md             LONGTEXT,
  hypotheses_created    INT NOT NULL DEFAULT 0,
  hypotheses_rejected   INT NOT NULL DEFAULT 0,
  experiments_queued    INT NOT NULL DEFAULT 0,
  experiments_completed INT NOT NULL DEFAULT 0,
  promising_findings    INT NOT NULL DEFAULT 0,
  families_researched   JSON,
  starvation_risk_families JSON,
  data_blockers         JSON,
  created_at            DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_queue_date (queue_date)
);
```

---

## 6. Experiment Budget Controls

| Parameter | Value |
|---|---|
| MAX_NEW_HYPOTHESES_PER_HOUR | 3 |
| MAX_NEW_HYPOTHESES_PER_DAY | 25 |
| MAX_ACTIVE_EXPERIMENTS | 10 |
| MAX_VARIANTS_PER_HYPOTHESIS | 1 |
| MAX_PARAMETERS_PER_INITIAL_HYPOTHESIS | 6 |
| MAX_FEATURES_PER_HYPOTHESIS | 4 |
| MAX_INTERACTION_DEPTH | 2 |
| MAX_AUTOMATIC_REFINEMENT_DEPTH | 2 |
| MINIMUM_SAMPLE_DISCOVERY | 50 |
| MINIMUM_INDEPENDENT_SESSIONS | 5 |
| MAX_ACTIVE_RULES | 25 (Wave 1) |
| MAX_RESEARCH_SHARE_PER_FAMILY | 20% |
| MIN_DISTINCT_FAMILIES_RESEARCHED_PER_WEEK | 5 |
| HIGH_PRIORITY_UNTESTED_FAMILY_AGE_LIMIT_DAYS | 14 |
| MAX_SEQUENCE_LENGTH | 4 |
| MAX_SEQUENCE_LOOKBACK_BARS | 50 |
| MAX_SEQUENCE_FEATURES | 6 |

---

## 7. Deployment Order

### During Active Soak (NOW)
- Architecture ✓
- Code (local only) ← current
- Tests (isolated) ← current
- Migrations (prepared, not applied) ← current
- Documentation ← current

### After Soak Completion and Evidence Lock
1. Confirm soak PASS
2. Commit soak evidence separately to core-chain branch
3. Deploy schema changes to staging only
4. Deploy feature snapshot service
5. Validate causal feature generation
6. Deploy coverage registry
7. Deploy hypothesis engine
8. Activate only frozen Wave-1 rules
9. Start governed research scheduler
10. Verify first autonomous hypotheses
11. Verify first experiments
12. Verify memory lookup
13. Verify notification
14. Verify dashboard
15. Commit all evidence to new sprint branch

---

## 8. Wave 1 Activation Families

Range and Volatility (F), Market Structure (B), VWAP (H), Session (J),
Entry Quality (P), Trend (C), Momentum (E), Volume (G), Reversal (O).

Initial active rules: 35 (see DARWIN_COMPLETE_RULE_LIBRARY.md).
All other families: DEFINED, PRIORITISED, QUEUED_FOR_ACTIVATION.

---

## 9. Governance Invariants

```
UNREGISTERED_EXPERIMENTS=0
POST_HOC_PARAMETER_CHANGES=0
RUNAWAY_RESEARCH_LOOPS=0
EXPERIMENT_BUDGET_BREACHES=0
PRIOR_MEMORY_LOOKUP_RATE=100%
DUPLICATE_RESEARCH_RATE=0
OVERWRITTEN_RESEARCH_RECORDS=0
FUTURE_DATA_USES=0
DUPLICATE_FEATURE_SNAPSHOTS=0
ORPHAN_FEATURE_SNAPSHOTS=0
DARWIN_DECISION_AUTHORITY=DISABLED
DARWIN_EXECUTION_AUTHORITY=DISABLED
LIVE_TRADES_INITIATED=0
PAPER_TRADES_INITIATED=0
STRATEGY_STATUS_CHANGES=0
CAPITAL_REALLOCATIONS=0
```
