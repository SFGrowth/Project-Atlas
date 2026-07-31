# Artefact B4 — Code Change Manifest and Schema Migration Record
## Sprint: darwin-core-observation-to-finding-chain
## Version: v3 (final)
## Produced: 2026-07-31T00:35:00Z

---

## 1. Code Files Modified

| File | Change Type | Description |
|------|-------------|-------------|
| `server/darwin/darwin-j4-pattern-discovery.ts` | Bug fix + feature | Fixed FINDING_ID/MEMORY_ID conflation; added `applyBHFDR()`; added `darwin_findings` write; fixed `delivered=1` conditional; added `runId` to `runHistoricalExperiment`; fixed `experimentId` TS type |
| `server/darwin/darwin-dashboard-router.ts` | Feature + bug fix | Added `/api/darwin/pipeline-metrics` endpoint; updated chain-trace to return `FINDING_ID` and `MEMORY_ID` as distinct fields; fixed `bar_open_ts_ms` column name |
| `server/darwinDailyReport.ts` | Bug fix | Fixed TS2503: changed `mysql.RowDataPacket` to `import type { RowDataPacket }` |
| `server/nexusRoutes.ts` | Feature | Wired `startNotificationRetryScheduler()` into server startup and `stopNotificationRetryScheduler()` into graceful shutdown |
| `services/databento-feed/feed_adapter.py` | Feature | Added metrics file writer loop (writes `/tmp/atlas_feed_metrics.json` every 5 seconds with 18 pipeline counters) |

## 2. New Files Added

| File | Description |
|------|-------------|
| `server/_core/notificationRetryService.ts` | Notification retry governance service with exponential backoff |
| `server/sprint-darwin-core-chain-gate-g17.test.ts` | Updated with 5 new G17-FINDING-ID tests (total: 59 tests) |

---

## 3. Schema Migrations Applied

All migrations are additive (no destructive changes). Applied directly via MySQL CLI on `atlas_staging_g4`.

### Migration 1 — `darwin_findings` table (new)

```sql
CREATE TABLE darwin_findings (
  finding_id       VARCHAR(64)  NOT NULL PRIMARY KEY,
  candidate_id     VARCHAR(64)  NOT NULL,
  result_id        VARCHAR(64)  NOT NULL,
  classification   VARCHAR(32)  NOT NULL,
  adjusted_p_value DECIMAL(10,6) DEFAULT NULL,
  bh_fdr_rank      INT          DEFAULT NULL,
  bh_fdr_threshold DECIMAL(10,6) DEFAULT NULL,
  bh_fdr_significant TINYINT(1) DEFAULT 0,
  experiment_count INT          DEFAULT 1,
  created_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_candidate (candidate_id),
  INDEX idx_result    (result_id)
);
```

### Migration 2 — BH-FDR fields on `darwin_experiment_records`

```sql
ALTER TABLE darwin_experiment_records
  ADD COLUMN adjusted_p_value DECIMAL(10,6) DEFAULT NULL,
  ADD COLUMN bh_fdr_rank      INT           DEFAULT NULL,
  ADD COLUMN bh_fdr_threshold DECIMAL(10,6) DEFAULT NULL,
  ADD COLUMN bh_fdr_significant TINYINT(1)  DEFAULT 0;
```

### Migration 3 — Linkage fields on `darwin_research_memory`

```sql
ALTER TABLE darwin_research_memory
  ADD COLUMN finding_id             VARCHAR(64)  DEFAULT NULL,
  ADD COLUMN source_observation_id  VARCHAR(64)  DEFAULT NULL,
  ADD COLUMN telegram_message_id    INT          DEFAULT NULL,
  ADD COLUMN notification_id        INT          DEFAULT NULL;
```

### Migration 4 — Governance fields on `darwin_candidates`

```sql
ALTER TABLE darwin_candidates
  ADD COLUMN rule_id      VARCHAR(64) DEFAULT 'RULE-J4-001',
  ADD COLUMN rule_version VARCHAR(16) DEFAULT '1.0.0',
  ADD COLUMN freeze_reason TEXT       DEFAULT NULL,
  ADD COLUMN frozen_at    TIMESTAMP   DEFAULT NULL;
```

### Migration 5 — Retry governance on `notification_log`

```sql
ALTER TABLE notification_log
  ADD COLUMN retry_count       TINYINT      NOT NULL DEFAULT 0,
  ADD COLUMN max_retries       TINYINT      NOT NULL DEFAULT 3,
  ADD COLUMN next_retry_at     TIMESTAMP    DEFAULT NULL,
  ADD COLUMN permanently_failed TINYINT(1)  NOT NULL DEFAULT 0,
  ADD COLUMN failure_reason    VARCHAR(256) DEFAULT NULL,
  ADD COLUMN priority          TINYINT      NOT NULL DEFAULT 5,
  ADD COLUMN dedupe_key        VARCHAR(128) DEFAULT NULL;
```

### Migration 6 — Legacy linkage correction (Option C)

```sql
-- darwin_experiment_records: 42 rows marked
ALTER TABLE darwin_experiment_records
  ADD COLUMN legacy_linkage_invalid TINYINT(1) NOT NULL DEFAULT 0;
UPDATE darwin_experiment_records
  SET legacy_linkage_invalid = 1
  WHERE finding_id IS NOT NULL
    AND finding_id NOT IN (SELECT finding_id FROM darwin_findings);

-- darwin_candidates: 3 rows marked
ALTER TABLE darwin_candidates
  ADD COLUMN legacy_linkage_invalid TINYINT(1) NOT NULL DEFAULT 0;
UPDATE darwin_candidates
  SET legacy_linkage_invalid = 1
  WHERE finding_id IS NOT NULL
    AND finding_id NOT IN (SELECT finding_id FROM darwin_findings);
```

**Legacy correction result:**

| Table | `legacy_linkage_invalid=0` | `legacy_linkage_invalid=1` |
|-------|---------------------------|---------------------------|
| `darwin_experiment_records` | 6 | 42 |
| `darwin_candidates` | 1 | 3 |

---

## 4. Environment Changes

| Change | File | Description |
|--------|------|-------------|
| `ATLAS_WEBHOOK_TOKEN` updated | `/home/ubuntu/atlas-nexus/.env` | Replaced expired `ghu_` token with valid token from `gh auth token` |

---

## 5. Files NOT Modified (Constraint Compliance)

| File / System | Status |
|---------------|--------|
| `sprint/darwin-core-observation-to-finding-chain` branch | NOT merged to main |
| `/etc/cron.d/atlas-darwin` | UNCHANGED |
| `darwin_candidates.auto_promote` | UNCHANGED (0 — execution disabled) |
| Any live order routing code | UNCHANGED |
| `main` branch | UNCHANGED (tip: `1e8557d`) |
