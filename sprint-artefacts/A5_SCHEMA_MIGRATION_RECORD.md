# Artefact A5 — Schema Migration Record
## Sprint: darwin-core-observation-to-finding-chain
## Date: 2026-07-30 | Generated: 2026-07-30T22:51:00Z

---

## Migrations Applied This Session

All migrations were applied directly to `atlas_staging_g4` via `mysql` CLI. No Drizzle migration files were modified (the schema.ts reflects the current state).

### Migration 1: darwin_candidate_observations — trigger_rule fields

```sql
ALTER TABLE darwin_candidate_observations
  ADD COLUMN IF NOT EXISTS trigger_rule_id VARCHAR(32) DEFAULT 'RULE-J4-001',
  ADD COLUMN IF NOT EXISTS trigger_rule_version VARCHAR(16) DEFAULT '1.0.0';
```

**Status:** Applied (columns already existed from prior sprint work)

### Migration 2: darwin_candidates — additional governance fields

```sql
ALTER TABLE darwin_candidates
  ADD COLUMN IF NOT EXISTS rule_id VARCHAR(32) DEFAULT 'RULE-J4-001',
  ADD COLUMN IF NOT EXISTS rule_version VARCHAR(16) DEFAULT '1.0.0',
  ADD COLUMN IF NOT EXISTS governance_stage VARCHAR(32) DEFAULT 'HYPOTHESIS',
  ADD COLUMN IF NOT EXISTS notification_id INT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS experiment_id VARCHAR(36) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS finding_id VARCHAR(36) DEFAULT NULL;
```

**Status:** Applied

### Migration 3: darwin_experiment_records — BH-FDR fields

```sql
ALTER TABLE darwin_experiment_records
  ADD COLUMN IF NOT EXISTS raw_p_value DECIMAL(8,6) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS adjusted_p_value DECIMAL(8,6) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS bh_fdr_q DECIMAL(4,3) DEFAULT 0.050,
  ADD COLUMN IF NOT EXISTS bh_fdr_threshold DECIMAL(8,6) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS bh_fdr_significant TINYINT(1) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS family_id VARCHAR(64) DEFAULT NULL;
```

**Status:** Applied

### Migration 4: darwin_research_memory — additional linkage fields

```sql
ALTER TABLE darwin_research_memory
  ADD COLUMN IF NOT EXISTS finding_id VARCHAR(36) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS source_observation_id VARCHAR(36) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS source_event_id INT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS rule_id VARCHAR(32) DEFAULT 'RULE-J4-001',
  ADD COLUMN IF NOT EXISTS rule_version VARCHAR(16) DEFAULT '1.0.0',
  ADD COLUMN IF NOT EXISTS telegram_message_id INT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS notification_id INT DEFAULT NULL;
```

**Status:** Applied

### Migration 5: darwin_findings — new formal finding table

```sql
CREATE TABLE IF NOT EXISTS darwin_findings (
  finding_id         VARCHAR(36) NOT NULL PRIMARY KEY,
  result_id          VARCHAR(36) NOT NULL,
  candidate_id       VARCHAR(36) NOT NULL,
  classification     VARCHAR(32) NOT NULL,
  evidence_stage     VARCHAR(32) NOT NULL DEFAULT 'INITIAL',
  sample_size        INT DEFAULT NULL,
  raw_p_value        DECIMAL(8,6) DEFAULT NULL,
  adjusted_p_value   DECIMAL(8,6) DEFAULT NULL,
  bh_fdr_q           DECIMAL(4,3) DEFAULT 0.050,
  bh_fdr_threshold   DECIMAL(8,6) DEFAULT NULL,
  bh_fdr_significant TINYINT(1) DEFAULT 0,
  created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_candidate (candidate_id),
  INDEX idx_result (result_id),
  INDEX idx_created (created_at)
);
```

**Status:** Applied — 4 rows present as of 2026-07-30T22:51Z

## Current Table Row Counts

| Table | Rows |
|-------|------|
| darwin_candidates | 3 |
| darwin_candidate_observations | 4 |
| darwin_experiment_records | 54 |
| darwin_research_memory | 26 |
| darwin_findings | 4 |
| darwin_job_run_history (J4) | 64 |
| notification_log (DARWIN_FINDING) | 23 |

**MIGRATION_STATUS: ALL APPLIED**
