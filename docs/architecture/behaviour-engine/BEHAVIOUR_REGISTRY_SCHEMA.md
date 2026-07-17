# Atlas Behaviour Registry — Database Schema

**Sprint:** 121A
**Status:** APPROVED DESIGN
**Directive:** ORION-DIRECTIVE-001
**Date:** 2026-07-17

---

## Overview

The Behaviour Registry is the institutional memory of the Atlas Behaviour Engine. It stores every discovered market behaviour, every detected instance, every evidence record, and every confidence measurement — permanently and independently of strategies.

The registry comprises eight database tables, each with a distinct purpose. Together they form a complete audit trail of Atlas' understanding of market behaviour from initial discovery through to retirement.

---

## Table 1 — `atlas_behaviour_definitions`

Stores the canonical definition of each known market behaviour. This is the master catalogue — one row per behaviour type, updated only when a behaviour's definition is formally revised.

| Column | Type | Description |
|---|---|---|
| `id` | `INT AUTO_INCREMENT PK` | Internal row ID |
| `behaviour_id` | `VARCHAR(64) UNIQUE NOT NULL` | Canonical identifier, e.g. `TREND_CONTINUATION` |
| `display_name` | `VARCHAR(128) NOT NULL` | Human-readable name |
| `description` | `TEXT NOT NULL` | Plain-language definition |
| `category` | `VARCHAR(32) NOT NULL` | `TREND`, `REVERSAL`, `BREAKOUT`, `COMPRESSION`, `SESSION`, `VOLATILITY` |
| `direction_bias` | `VARCHAR(8) NOT NULL` | `LONG`, `SHORT`, `BOTH` |
| `target_regimes` | `JSON NOT NULL` | Array of applicable regimes: `["TRENDING", "RANGING"]` |
| `target_sessions` | `JSON NOT NULL` | Array of applicable sessions: `["NEW_YORK", "LONDON"]` |
| `min_adx` | `DECIMAL(5,2)` | Minimum ADX for this behaviour to be valid |
| `min_atr` | `DECIMAL(8,4)` | Minimum ATR for this behaviour to be valid |
| `evidence_requirements` | `JSON NOT NULL` | Required evidence dimensions and minimum scores |
| `confidence_weights` | `JSON NOT NULL` | Weights for each confidence dimension |
| `expected_duration_bars` | `INT NOT NULL` | Typical duration in 5-minute bars |
| `max_duration_bars` | `INT NOT NULL` | Maximum duration before expiry |
| `lifecycle_stage` | `VARCHAR(32) NOT NULL DEFAULT 'PRODUCTION'` | `HYPOTHESIS`, `VALIDATED`, `PRODUCTION`, `RETIRED` |
| `classifier_version` | `VARCHAR(16) NOT NULL` | Version of the classifier implementing this behaviour |
| `discovery_sprint` | `INT` | Sprint number when this behaviour was first discovered |
| `discovery_memory_id` | `VARCHAR(64)` | FK to `darwin_research_memory.memory_id` |
| `created_at` | `TIMESTAMP NOT NULL DEFAULT NOW()` | |
| `updated_at` | `TIMESTAMP NOT NULL DEFAULT NOW() ON UPDATE NOW()` | |

---

## Table 2 — `atlas_behaviour_instances`

Records every individual occurrence of a behaviour detected in the market. One row per detected instance, updated as the instance progresses through its lifecycle.

| Column | Type | Description |
|---|---|---|
| `id` | `BIGINT AUTO_INCREMENT PK` | Internal row ID |
| `instance_id` | `VARCHAR(64) UNIQUE NOT NULL` | UUID for this instance |
| `behaviour_id` | `VARCHAR(64) NOT NULL` | FK to `atlas_behaviour_definitions.behaviour_id` |
| `symbol` | `VARCHAR(16) NOT NULL` | Instrument symbol |
| `detected_at_ts` | `BIGINT NOT NULL` | Bar timestamp when first detected (ms) |
| `bar_open_ts` | `BIGINT NOT NULL` | Bar open timestamp |
| `resolved_at_ts` | `BIGINT` | Bar timestamp when resolved (null if still active) |
| `lifecycle_state` | `VARCHAR(32) NOT NULL DEFAULT 'FORMING'` | `FORMING`, `ACTIVE`, `MATURE`, `EXHAUSTED`, `CONFIRMED`, `EXPIRED`, `REJECTED` |
| `confidence` | `DECIMAL(5,2) NOT NULL` | Confidence at last update (0–100) |
| `probability` | `DECIMAL(5,4) NOT NULL` | Forward probability at last update |
| `maturity` | `VARCHAR(16) NOT NULL` | `FORMING`, `ACTIVE`, `MATURE`, `EXHAUSTED` |
| `evidence_score` | `DECIMAL(5,2) NOT NULL` | Evidence score at last update |
| `expected_r` | `DECIMAL(6,3)` | Expected R-multiple |
| `expected_duration_bars` | `INT` | Expected bars remaining |
| `failure_probability` | `DECIMAL(5,4)` | Failure probability at last update |
| `regime` | `VARCHAR(32) NOT NULL` | Market regime at detection |
| `session` | `VARCHAR(32) NOT NULL` | Session at detection |
| `bar_count` | `INT NOT NULL DEFAULT 1` | Number of bars this instance has been active |
| `peak_confidence` | `DECIMAL(5,2)` | Highest confidence reached during lifecycle |
| `resolution_reason` | `VARCHAR(64)` | Why the instance resolved: `CONFIRMED`, `EXPIRED`, `CONTRADICTED`, `REGIME_CHANGE` |
| `classifier_version` | `VARCHAR(16) NOT NULL` | Classifier version that detected this instance |
| `source` | `VARCHAR(16) NOT NULL DEFAULT 'live'` | `live`, `replay`, `shadow` |
| `created_at` | `TIMESTAMP NOT NULL DEFAULT NOW()` | |
| `updated_at` | `TIMESTAMP NOT NULL DEFAULT NOW() ON UPDATE NOW()` | |

**Indexes:** `(symbol, detected_at_ts)`, `(behaviour_id, lifecycle_state)`, `(detected_at_ts)`, `(lifecycle_state)`

---

## Table 3 — `atlas_behaviour_evidence`

Stores the detailed evidence record for each behaviour instance at each bar update. This is the audit trail of why Atlas classified a behaviour with a given confidence.

| Column | Type | Description |
|---|---|---|
| `id` | `BIGINT AUTO_INCREMENT PK` | Internal row ID |
| `instance_id` | `VARCHAR(64) NOT NULL` | FK to `atlas_behaviour_instances.instance_id` |
| `bar_ts` | `BIGINT NOT NULL` | Bar timestamp for this evidence snapshot |
| `evidence_score` | `DECIMAL(5,2) NOT NULL` | Overall evidence score |
| `indicator_agreement` | `DECIMAL(5,2)` | Score: how many indicators confirm the behaviour |
| `regime_alignment` | `DECIMAL(5,2)` | Score: current regime matches target regime |
| `session_quality` | `DECIMAL(5,2)` | Score: current session produces quality instances |
| `price_structure` | `DECIMAL(5,2)` | Score: quality of price structure |
| `volume_confirmation` | `DECIMAL(5,2)` | Score: volume confirms the behaviour |
| `historical_base_rate` | `DECIMAL(5,2)` | Score: historical frequency in similar conditions |
| `recency_weight` | `DECIMAL(5,4)` | Decay factor applied to older evidence |
| `raw_indicator_values` | `JSON` | Snapshot of all indicator values at this bar |
| `classifier_reasoning` | `TEXT` | Human-readable explanation from the classifier |
| `created_at` | `TIMESTAMP NOT NULL DEFAULT NOW()` | |

**Indexes:** `(instance_id, bar_ts)`, `(bar_ts)`

---

## Table 4 — `atlas_behaviour_confidence_history`

Tracks how confidence evolves over the lifetime of each behaviour instance. Used by DARWIN to analyse confidence drift patterns and by the Live Confidence Engine.

| Column | Type | Description |
|---|---|---|
| `id` | `BIGINT AUTO_INCREMENT PK` | Internal row ID |
| `instance_id` | `VARCHAR(64) NOT NULL` | FK to `atlas_behaviour_instances.instance_id` |
| `bar_ts` | `BIGINT NOT NULL` | Bar timestamp |
| `confidence` | `DECIMAL(5,2) NOT NULL` | Confidence at this bar |
| `probability` | `DECIMAL(5,4) NOT NULL` | Forward probability at this bar |
| `maturity` | `VARCHAR(16) NOT NULL` | Maturity state at this bar |
| `delta_confidence` | `DECIMAL(6,2)` | Change in confidence since previous bar |
| `created_at` | `TIMESTAMP NOT NULL DEFAULT NOW()` | |

**Indexes:** `(instance_id, bar_ts)`

---

## Table 5 — `atlas_behaviour_discovery_history`

Records the DARWIN research history for each behaviour — when it was first observed, how it was validated, and the research path from observation to production.

| Column | Type | Description |
|---|---|---|
| `id` | `INT AUTO_INCREMENT PK` | Internal row ID |
| `behaviour_id` | `VARCHAR(64) NOT NULL` | FK to `atlas_behaviour_definitions.behaviour_id` |
| `event_type` | `VARCHAR(32) NOT NULL` | `FIRST_OBSERVED`, `HYPOTHESIS_FORMED`, `VALIDATION_STARTED`, `VALIDATION_PASSED`, `VALIDATION_FAILED`, `PROMOTED`, `RETIRED` |
| `sprint_number` | `INT` | Sprint when this event occurred |
| `description` | `TEXT NOT NULL` | Description of the discovery event |
| `evidence_summary` | `TEXT` | Summary of evidence at this point |
| `sample_size` | `INT` | Number of instances analysed |
| `win_rate` | `DECIMAL(5,4)` | Win rate at this point in the research |
| `profit_factor` | `DECIMAL(6,3)` | Profit factor at this point |
| `research_memory_id` | `VARCHAR(64)` | FK to `darwin_research_memory.memory_id` |
| `created_at` | `TIMESTAMP NOT NULL DEFAULT NOW()` | |

---

## Table 6 — `atlas_behaviour_relationships`

Maps relationships between behaviours — which behaviours co-occur, which are mutually exclusive, and which are precursors or successors of others.

| Column | Type | Description |
|---|---|---|
| `id` | `INT AUTO_INCREMENT PK` | Internal row ID |
| `behaviour_id_a` | `VARCHAR(64) NOT NULL` | First behaviour |
| `behaviour_id_b` | `VARCHAR(64) NOT NULL` | Second behaviour |
| `relationship_type` | `VARCHAR(32) NOT NULL` | `CO_OCCURS`, `MUTUALLY_EXCLUSIVE`, `PRECURSOR`, `SUCCESSOR`, `AMPLIFIES`, `CONTRADICTS` |
| `correlation` | `DECIMAL(5,4)` | Statistical correlation (-1 to 1) |
| `sample_size` | `INT NOT NULL DEFAULT 0` | Number of observations |
| `confidence` | `DECIMAL(5,2)` | Confidence in this relationship |
| `notes` | `TEXT` | Research notes |
| `created_at` | `TIMESTAMP NOT NULL DEFAULT NOW()` | |
| `updated_at` | `TIMESTAMP NOT NULL DEFAULT NOW() ON UPDATE NOW()` | |

**Constraint:** `UNIQUE(behaviour_id_a, behaviour_id_b, relationship_type)`

---

## Table 7 — `atlas_behaviour_performance_stats`

Stores rolling performance statistics for each behaviour — win rate, profit factor, expectancy, and drawdown. Updated after every confirmed behaviour instance resolves.

| Column | Type | Description |
|---|---|---|
| `id` | `INT AUTO_INCREMENT PK` | Internal row ID |
| `behaviour_id` | `VARCHAR(64) NOT NULL` | FK to `atlas_behaviour_definitions.behaviour_id` |
| `window` | `VARCHAR(16) NOT NULL` | `7D`, `30D`, `90D`, `ALL_TIME` |
| `sample_size` | `INT NOT NULL DEFAULT 0` | Number of instances in this window |
| `win_rate` | `DECIMAL(5,4)` | Win rate (instances that confirmed) |
| `avg_confidence_at_detection` | `DECIMAL(5,2)` | Average confidence when first detected |
| `avg_peak_confidence` | `DECIMAL(5,2)` | Average peak confidence |
| `avg_duration_bars` | `DECIMAL(6,2)` | Average duration in bars |
| `avg_evidence_score` | `DECIMAL(5,2)` | Average evidence score |
| `regime_breakdown` | `JSON` | Win rate per regime |
| `session_breakdown` | `JSON` | Win rate per session |
| `confidence_calibration` | `JSON` | Actual win rate at each confidence decile |
| `last_updated_at` | `TIMESTAMP NOT NULL DEFAULT NOW() ON UPDATE NOW()` | |

**Constraint:** `UNIQUE(behaviour_id, window)`

---

## Table 8 — `atlas_behaviour_lifecycle_log`

Immutable audit log of every lifecycle state transition for every behaviour instance. Used for DARWIN research, debugging, and the Decision Replay Engine.

| Column | Type | Description |
|---|---|---|
| `id` | `BIGINT AUTO_INCREMENT PK` | Internal row ID |
| `instance_id` | `VARCHAR(64) NOT NULL` | FK to `atlas_behaviour_instances.instance_id` |
| `behaviour_id` | `VARCHAR(64) NOT NULL` | Denormalised for query efficiency |
| `from_state` | `VARCHAR(32) NOT NULL` | Previous lifecycle state |
| `to_state` | `VARCHAR(32) NOT NULL` | New lifecycle state |
| `bar_ts` | `BIGINT NOT NULL` | Bar timestamp of the transition |
| `confidence_at_transition` | `DECIMAL(5,2)` | Confidence at the time of transition |
| `trigger` | `VARCHAR(64) NOT NULL` | What caused the transition |
| `notes` | `TEXT` | Additional context |
| `created_at` | `TIMESTAMP NOT NULL DEFAULT NOW()` | |

**Indexes:** `(instance_id, bar_ts)`, `(behaviour_id, bar_ts)`

---

## Schema Summary

| Table | Purpose | Est. Row Growth |
|---|---|---|
| `atlas_behaviour_definitions` | Canonical behaviour catalogue | ~12 rows, slow growth |
| `atlas_behaviour_instances` | Every detected instance | ~50–200/week |
| `atlas_behaviour_evidence` | Per-bar evidence snapshots | ~500–2000/week |
| `atlas_behaviour_confidence_history` | Confidence evolution | ~500–2000/week |
| `atlas_behaviour_discovery_history` | DARWIN research events | ~5–20/sprint |
| `atlas_behaviour_relationships` | Inter-behaviour correlations | ~50–100 rows, slow growth |
| `atlas_behaviour_performance_stats` | Rolling performance | 48 rows (12 behaviours × 4 windows) |
| `atlas_behaviour_lifecycle_log` | State transition audit | ~500–2000/week |

---

## Migration SQL

The complete migration SQL for all 8 tables is provided in `BEHAVIOUR_REGISTRY_MIGRATION.sql` and applied via `webdev_execute_sql` in Sprint 121A.
