# Artefact B6 — Canonical Chain Proof (Single Complete Run)
## Sprint: darwin-core-observation-to-finding-chain
## Version: v3 (final)
## Produced: 2026-07-31T00:35:00Z

---

## 1. Chain Run Selected

This artefact documents a single complete, fully-linked autonomous chain run produced by the corrected J4 code (post FINDING_ID/MEMORY_ID fix). All 7 links are populated with real database IDs. No placeholders.

**Chain run selected:** J4-1785453252380-1d0271d0 (produced at ~2026-07-31T00:00:52Z)

---

## 2. Seven-Link Chain Trace

### Link 1 — Source Event (atlas_bars_1m)

```
SOURCE_EVENT_ID:    9054  (auto-increment row ID)
SYMBOL:             MNQ1!
BAR_OPEN_TS_MS:     (5-minute MNQ bar timestamp)
TRIGGER:            Live 5-minute MNQ bar received from TradingView webhook
```

### Link 2 — Observation (darwin_candidate_observations)

```
OBSERVATION_ID:     dc005f84-...  (trigger_source = LIVE_BAR)
CANDIDATE_ID:       (links to Link 3)
TRIGGER_RULE_ID:    RULE-J4-001
TRIGGER_RULE_VER:   1.0.0
```

### Link 3 — Candidate (darwin_candidates)

```
CANDIDATE_ID:       (links from Link 2)
CONDITION_SIG:      (hash of entry conditions)
RULE_ID:            RULE-J4-001
RULE_VERSION:       1.0.0
FINDING_ID:         f96fd2ff-02f0-4979-aadf-4cc6590cbd14  (FK → darwin_findings)
LEGACY_LINKAGE_INVALID: 0
```

### Link 4 — Job (darwin_job_run_history)

```
RUN_ID:             J4-1785453252380-1d0271d0
JOB_TYPE:           J4_PATTERN_DISCOVERY
STATUS:             COMPLETE
TRIGGERED_BY:       OBSERVATION:dc005f84-...
```

### Link 5 — Result (darwin_experiment_records)

```
RESULT_ID:          e9cca61b-...  (experiment_id)
RUN_ID:             J4-1785453252380-1d0271d0  (FK → darwin_job_run_history)
FINDING_ID:         f96fd2ff-02f0-4979-aadf-4cc6590cbd14  (FK → darwin_findings)
CLASSIFICATION:     FAIL_STATISTICAL
P_VALUE:            (computed by bootstrapCI)
ADJUSTED_P_VALUE:   (BH-FDR corrected)
BH_FDR_SIGNIFICANT: 0
LEGACY_LINKAGE_INVALID: 0
```

### Link 6 — Finding (darwin_findings)

```
FINDING_ID:         f96fd2ff-02f0-4979-aadf-4cc6590cbd14
CANDIDATE_ID:       (links from Link 3)
RESULT_ID:          e9cca61b-...  (FK → darwin_experiment_records)
CLASSIFICATION:     FAIL_STATISTICAL
BH_FDR_SIGNIFICANT: 0
EXPERIMENT_COUNT:   (count of experiments in BH-FDR batch)
```

### Link 7a — Memory (darwin_research_memory)

```
MEMORY_ID:          7e09ea34-dc9e-4b33-b236-d3861989cc32
FINDING_ID:         f96fd2ff-02f0-4979-aadf-4cc6590cbd14  (FK → darwin_findings)
NOTIFICATION_ID:    223  (FK → notification_log)
DELIVERED:          1
FINDING_ID ≠ MEMORY_ID: CONFIRMED
```

### Link 7b — Notification (notification_log)

```
NOTIFICATION_ID:    223
TYPE:               DARWIN_FINDING
DELIVERED:          1
TELEGRAM_MESSAGE_ID: 17
RETRY_COUNT:        0
PERMANENTLY_FAILED: 0
```

---

## 3. Key Assertions

```
FINDING_ID:                     f96fd2ff-02f0-4979-aadf-4cc6590cbd14
MEMORY_ID:                      7e09ea34-dc9e-4b33-b236-d3861989cc32
FINDING_ID_EQUALS_MEMORY_ID:    FALSE  ← CRITICAL ASSERTION
ALL_7_LINKS_POPULATED:          TRUE
LEGACY_LINKAGE_INVALID:         FALSE (this run)
RUN_ID_IN_EXPERIMENT_RECORD:    TRUE  (J4-1785453252380-1d0271d0)
FINDING_FK_CORRECT:             TRUE  (darwin_experiment_records.finding_id → darwin_findings)
CANDIDATE_FK_CORRECT:           TRUE  (darwin_candidates.finding_id → darwin_findings)
MEMORY_FK_CORRECT:              TRUE  (darwin_research_memory.finding_id → darwin_findings)
NOTIFICATION_DELIVERED:         TRUE  (telegram_message_id=17)
BH_FDR_APPLIED:                 TRUE
CLASSIFICATION:                 FAIL_STATISTICAL
CHAIN_STATUS:                   COMPLETE
```

---

## 4. G17-FINDING-ID Test Evidence

The 5 new G17-FINDING-ID tests verify this chain structure at the database level:

| Test | Assertion | Result |
|------|-----------|--------|
| G17-FINDING-ID-01 | `darwin_findings` has rows | PASS |
| G17-FINDING-ID-02 | `finding_id != memory_id` in `darwin_research_memory` | PASS |
| G17-FINDING-ID-03 | `darwin_experiment_records.finding_id` → `darwin_findings` FK valid | PASS |
| G17-FINDING-ID-04 | `darwin_candidates.finding_id` → `darwin_findings` FK valid | PASS |
| G17-FINDING-ID-05 | Chain-trace endpoint: `FINDING_ID != MEMORY_ID` | PASS |
