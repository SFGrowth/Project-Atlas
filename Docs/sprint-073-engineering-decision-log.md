# Sprint 073 Engineering Decision Log
## Atlas Kernel — M-14

**Date:** 2026-07-10
**Sprint:** 073
**Module:** M-14 atlas_core.pine
**Status:** COMPLETE — Zero errors, zero warnings

---

## Decisions Made

### Decision 1: Inline All Upstream Modules in M-14

**Context:** Pine Script libraries cannot modify global `var` variables in exported functions. This means M-02, M-04, M-05, M-06, and M-10 cannot be imported as libraries — they must be inlined.

**Decision:** All upstream modules are inlined directly into M-14. M-01, M-03, M-07, M-08, M-09 are pure function libraries and are also inlined for performance.

**Consequence:** M-14 is a single self-contained Pine Script indicator (1,264 lines) with no external library imports.

### Decision 2: PipelineReport as Immutable Per-Bar Record

**Context:** The Observatory requires one complete pipeline report per bar. The report must be immutable once generated.

**Decision:** `PipelineReport` is a UDT with 35 fields created fresh on every bar. It is never mutated after creation. The `var PipelineReport v_last_report` holds the most recent report for display.

### Decision 3: Fail-Safe via Boolean Gate

**Context:** If any pipeline stage fails, execution must stop immediately. No partial execution.

**Decision:** A `bool v_pipeline_ok` flag gates each stage. If any stage sets `v_pipeline_ok := false`, all subsequent stages are skipped. The Observatory receives an error event with the failing stage name.

### Decision 4: Pine Script v5 Compatibility Fixes

Three Pine Script v6-only features were found and removed:
1. `if ... then ...` inline syntax → converted to block syntax
2. `table.cell(..., colspan=N)` → `colspan` removed (v6 only)
3. `str.tostring(time, "HH:mm:ss", "America/New_York")` → reduced to 2-argument form

---

## Module Inventory (as of Sprint 073)

| Module | File | Lines | Status |
|--------|------|-------|--------|
| M-00 | atlas_config.pine | 324 | ✅ Live |
| M-01 | atlas_utils.pine | 418 | ✅ Live |
| M-02 | atlas_state_manager.pine | 334 | ✅ Live |
| M-03 | atlas_market_state_engine.pine | 792 | ✅ Live |
| M-04 | atlas_model_a1.pine | ~200 | ✅ Live |
| M-05 | atlas_model_a3.pine | ~200 | ✅ Live |
| M-06 | atlas_model_b1.pine | ~200 | ✅ Live |
| M-07 | atlas_decision_engine.pine | 307 | ✅ Live |
| M-08 | atlas_risk_intelligence.pine | 284 | ✅ Live |
| M-09 | atlas_tvl.pine | 211 | ✅ Live |
| M-10 | atlas_execution_engine.pine | 679 | ✅ Live |
| M-14 | atlas_core.pine | 1,264 | ✅ Live |

---

## Next Sprint Recommendation

Sprint 074: Webhook Integration — M-15 atlas_webhook.pine

The Atlas Kernel is verified and frozen. The next step is implementing the webhook output layer that converts `PipelineReport` events into JSON payloads for the Observatory and Mission Control dashboards.

