# Artefact A12 — Open Items and Next Sprint
## Sprint: darwin-core-observation-to-finding-chain
## Date: 2026-07-30 | Generated: 2026-07-30T22:51:00Z

---

## Sprint Completion Status

| Part | Description | Status |
|------|-------------|--------|
| A | Session startup protocol | COMPLETE |
| B | Soak evidence retrieval | COMPLETE |
| C | GitHub archival evidence | COMPLETE (token fixed) |
| D | Observation-to-hypothesis service | COMPLETE (already implemented) |
| E | Freeze discovery rule | COMPLETE (RULE-J4-001 v1.0.0 frozen) |
| F | Hypothesis-to-job-to-result worker | COMPLETE (J4 running autonomously) |
| G | Result-to-finding-to-memory | COMPLETE (darwin_findings table added, BH-FDR implemented) |
| H | Telegram notification + dashboard chain trace | COMPLETE (notification_id fixed, chain-trace updated) |
| I | G17 test suite | COMPLETE (54/54 pass) |
| J | Artefacts | COMPLETE (13 artefacts written) |
| K | Sprint branch commit | IN PROGRESS (Phase 8) |

## Resolved Issues

| Issue | Resolution |
|-------|-----------|
| ATLAS_WEBHOOK_TOKEN expired | Updated to valid [REDACTED_GH_TOKEN] |
| darwin_findings table missing | Created and populated |
| BH-FDR not implemented | Implemented in persistFinding() |
| persistFinding() returned wrong ID | Fixed to return memoryId for backward compatibility |
| notification_id NULL in memory | Fixed by same change |
| G17 tests: 2 failures | Fixed — 54/54 now pass |

## Open Items (Not Blocking Sprint Closure)

| Item | Priority | Description |
|------|----------|-------------|
| Out-of-sample gate hardcoded to 0 | HIGH | `stability_gate_passed = 0` in J4 — never enforced. Requires separate sprint to implement OOS validation. |
| Narrative memory unpopulated | MEDIUM | `proposedReason`, `lessonsLearned`, `rejectionReasons` fields exist in schema but J4 does not populate them. |
| Reflect-retry governance | MEDIUM | INCONCLUSIVE findings are permanently archived with no refinement path. Requires separate sprint. |
| K-tracking (hypothesis family counter) | MEDIUM | `family_id` field added to schema but not yet populated or used in correction. |
| DARWIN-C003 execution | MEDIUM | Pre-registered in A9. Execute in next research session. |
| GitHub token rotation | LOW | `[REDACTED_GH_TOKEN]` tokens expire. Consider a fine-grained PAT with longer expiry. |

## Next Sprint Recommendation

**Sprint: darwin-c003-k1-15m-regime-momentum**

Execute the pre-registered DARWIN-C003 research cycle:
1. Derive 15-minute MNQ bars from canonical 5m data
2. Run K1 regime filter at 15m resolution
3. Apply BH-FDR correction
4. Enforce out-of-sample gate
5. Report findings

**SPRINT_STATUS: COMPLETE (pending commit)**
