# DARWIN Edge-Search — Staging Deployment Evidence

**Sprint:** darwin-complete-edge-search-universe  
**Branch:** sprint/darwin-complete-edge-search-universe  
**Date:** 2026-07-31  
**Deployed by:** Atlas Nexus autonomous session  

---

## 1. Schema Migration

| Migration | Applied | Tables Created |
|-----------|---------|----------------|
| 001_darwin_edge_search_schema.sql | YES | 9 new tables |
| 002_seed_rule_library.sql | YES | 38 rules seeded |

### Tables Verified Present

| Table | Row Count | Status |
|-------|-----------|--------|
| darwin_rule_library | 38 | SEEDED |
| darwin_research_coverage_registry | 24 | SEEDED (24 families) |
| darwin_feature_snapshots | 0 | EMPTY (ready) |
| darwin_hypotheses | 0 | EMPTY (ready) |
| darwin_experiments | 0 | EMPTY (ready) |
| darwin_research_memory | 45 | PRE-EXISTING (J4 chain) |
| darwin_edge_decay_monitor | 0 | EMPTY (ready) |
| darwin_research_queue | 0 | EMPTY (ready) |

---

## 2. Server Status

| Check | Result |
|-------|--------|
| atlas-nexus systemd service | ACTIVE |
| HTTP response on port 3000 | 200 OK |
| TypeScript errors in darwin/ | 0 |
| telegramNotifier.ts | RESTORED from git history (dc3c4af) |
| darwinDailyReport.ts merge conflict | RESOLVED (kept j4Findings code) |

---

## 3. Wave 1 Rule Activation

Rules activated after passing the historical research batch criteria (p < 0.10, positive mean return):

| Rule ID | Family | Classification | n | Mean Return | p-value | Win Rate | Stable |
|---------|--------|---------------|---|-------------|---------|----------|--------|
| RULE-EQ-001 | P (Equilibrium) | PROMISING | 328 | +0.0251% | 0.0299 | 52.7% | Yes |
| RULE-TR-002 | C (Trend) | INCONCLUSIVE_POSITIVE | 625 | +0.0246% | 0.0314 | 53.9% | No |
| RULE-REV-003 | O (Reversal) | INCONCLUSIVE_POSITIVE | 837 | +0.0113% | 0.0706 | 52.1% | Yes |

**Rules remaining INACTIVE:** 35 (insufficient sample, negative edge, or inconclusive)

---

## 4. Negative Edge Rules Identified

| Rule ID | Family | Mean Return | Win Rate | Action |
|---------|--------|-------------|----------|--------|
| RULE-TR-001 | C (Trend) | -0.0038% | 47.7% | BLOCKED pending further review |
| RULE-REV-001 | O (Reversal) | -0.0323% | 40.0% | BLOCKED — strong negative edge |

---

## 5. Insufficient Sample Rules (require more historical data)

| Rule ID | Signals Found | Minimum Required |
|---------|--------------|-----------------|
| RULE-RV-002 | 1 | 50 |
| RULE-MS-001 | 3 | 50 |
| RULE-MOM-001 | 0 | 50 |
| RULE-MOM-002 | 0 | 50 |
| RULE-VW-001 | 4 | 50 |
| RULE-SESS-001 | 7 | 50 |

**Root cause:** Only 1,835 5m bars available in staging (approximately 6 weeks of data). These rules require session-specific conditions that occur infrequently. More data will be accumulated as the live webhook continues.

---

## 6. Authority Boundaries

| Boundary | Status |
|----------|--------|
| DARWIN_DECISION_AUTHORITY | DISABLED |
| DARWIN_EXECUTION_AUTHORITY | DISABLED |
| Paper trading activated | NO |
| Live trading activated | NO |
| Main branch merge | NOT PERFORMED (requires Phil's written approval) |
| Cycle 003 | NOT RUN |

---

## 7. Data Integrity

| Invariant | Value |
|-----------|-------|
| FUTURE_DATA_USES | 0 |
| UNREGISTERED_EXPERIMENTS | 0 |
| POST_HOC_PARAMETER_CHANGES | 0 |
| Rules activated without batch evidence | 0 |
| Rules activated with p > 0.10 | 0 |
