# Artefact B5 — Git Verification and Branch State
## Sprint: darwin-core-observation-to-finding-chain
## Version: v3 (final — pre-soak commit)
## Produced: 2026-07-31T00:35:00Z

---

## 1. Current Branch State

```
ACTIVE_BRANCH:         sprint/darwin-core-observation-to-finding-chain
LOCAL_TIP:             cf2310d
REMOTE_TIP:            a5c7f1b  (origin — 3 commits behind local)
COMMITS_AHEAD_REMOTE:  3
MAIN_TIP:              1e8557d  (origin/main — UNCHANGED)
MERGED_TO_MAIN:        FALSE
WORKING_TREE_CLEAN:    FALSE (uncommitted changes — to be committed in final push)
```

---

## 2. Local Commit Log (sprint branch, last 5)

| SHA | Message |
|-----|---------|
| `cf2310d` | fix(darwin): resolve FINDING_ID/MEMORY_ID conflation in J4 and add G17-FINDING-ID tests |
| `9d6c703` | chore(sprint): add v2 corrected artefacts — FINDING_ID/MEMORY_ID fix, 59/59 G17, soak ledger 246/246 |
| `99a85e9` | Sprint completion: darwin-core-observation-to-finding-chain |
| `a5c7f1b` | Fix: add FINDING_VISIBLE_ON_DASHBOARD to chain-trace response |
| `4374638` | Sprint DARWIN-CORE-CHAIN: G17 54/54 PASS, full regression 1775/1775 PASS |

---

## 3. Uncommitted Changes (to be committed in final v3 push)

| File | Status | Description |
|------|--------|-------------|
| `server/darwin/darwin-dashboard-router.ts` | Modified | Pipeline-metrics endpoint column name fix |
| `server/darwin/darwin-j4-pattern-discovery.ts` | Modified | FINDING_ID/MEMORY_ID fix, BH-FDR, run_id |
| `server/darwinDailyReport.ts` | Modified | TS2503 fix |
| `server/nexusRoutes.ts` | Modified | Retry scheduler wiring |
| `services/databento-feed/feed_adapter.py` | Modified | Metrics file writer |
| `server/_core/notificationRetryService.ts` | New | Notification retry governance |
| `soak_collector.py` | New | 4-hour soak collector script |
| `sprint-artefacts-v3/` | New | All v3 artefacts (this commit) |
| `trigger_j4_once.ts` | New | J4 trigger script (diagnostic tool) |

---

## 4. Main Branch Protection

```
MAIN_BRANCH:           main
MAIN_TIP_SHA:          1e8557d
MAIN_TIP_MESSAGE:      Sprint 123A docs: Gate G0 evidence lock — approval submission SHA d732078 recorded, git proofs updated, confirmations table added
MAIN_MODIFIED:         FALSE
MERGE_APPROVAL_REQUIRED: TRUE (written approval from project owner required)
```

---

## 5. Pending Final Push

The final v3 commit will include:
- All v3 artefacts (B1–B9)
- All code changes listed above
- Soak ledger (once soak completes at ~04:31 UTC)
- Autonomous archival proof (PENDING — expected 22:00 UTC 2026-07-31)

**RELEASE_GATE_STATUS: WITHHELD_PENDING_SCHEDULED_ARCHIVAL**
**EXPECTED_ARCHIVAL_TRIGGER: 2026-07-31T22:00:00Z**
