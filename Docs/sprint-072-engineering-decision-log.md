# Sprint 072 — Engineering Decision Log
## Atlas Execution & Order Lifecycle Engine (M-10)

**Date:** 2026-07-10
**Sprint:** 072
**Module:** M-10 `atlas_execution_engine.pine`
**Status:** COMPLETE — Compiled and saved in TradingView (zero errors)

---

## Decision 1: Standalone Indicator vs Library

**Context:** M-10 manages persistent position state (`var Position v_position`). Pine Script libraries cannot have exported functions that modify global `var` variables (discovered during Sprint 071 module uploads).

**Decision:** M-10 is implemented as a standalone `indicator()`, not a `library()`.

**Rationale:** The state management pattern (persistent `var` variables modified at global scope) is incompatible with Pine Script's library model. In production (M-14 `atlas_core`), the Position UDT and lifecycle logic will be inlined directly.

---

## Decision 2: State Machine Implementation Pattern

**Context:** Pine Script does not allow functions to modify global `var` variables. The state machine must transition `v_position.status` across bars.

**Decision:** State transitions are implemented at the **global scope** using `if/else` blocks, not inside functions. Functions are pure (read-only) and return new `Position` objects.

**Implementation:**
```pine
// Global scope — state machine runs every bar
if v_position.status == STATE_PENDING
    if f_is_valid_transition(STATE_PENDING, STATE_SUBMITTED)
        v_position := f_fill_position(v_position, close)
        v_last_state := STATE_SUBMITTED
```

---

## Decision 3: f_is_valid_transition() as Sole Guard

**Context:** The sprint specification requires "no impossible transitions" and "no duplicate state changes".

**Decision:** All state transitions are gated through `f_is_valid_transition(from, to)` which encodes the complete legal transition matrix. Any transition not in the matrix returns `false` and is silently rejected.

**Legal transitions:**
- `NONE → PENDING`
- `PENDING → SUBMITTED`
- `SUBMITTED → ACKNOWLEDGED`
- `ACKNOWLEDGED → FILLED`
- `FILLED → ACTIVE`
- `ACTIVE → PARTIAL_EXIT`
- `ACTIVE → CLOSED`
- `PARTIAL_EXIT → CLOSED`
- `CLOSED → ARCHIVED`
- `ARCHIVED → NONE` (reset for next trade)

---

## Decision 4: Position Object Immutability Pattern

**Context:** Pine Script UDT fields can be mutated directly (`pos.status := "ACTIVE"`), but this makes state transitions hard to audit.

**Decision:** Lifecycle functions return **new Position objects** with updated fields rather than mutating in place. The global `v_position` is replaced atomically:
```pine
v_position := f_fill_position(v_position, close)
```

**Rationale:** This pattern makes every state transition explicit and auditable. The function signature documents what changes.

---

## Decision 5: Simulation Mode for Standalone Verification

**Context:** M-10 depends on M-09 (TVL) output (`ApprovedTrade`). In standalone mode, M-09 is not loaded, so there is no `ApprovedTrade` to process.

**Decision:** Input `i_sim_trade` (default: false) triggers a synthetic `ApprovedTrade` with realistic values on the first bar where `barstate.islast` is true. This allows complete lifecycle verification without M-09.

**Synthetic trade parameters:**
- Direction: LONG
- Entry: current close
- Stop: close - 20 pts (4 ticks)
- Target: close + 40 pts (2:1 R:R)
- Contracts: 1
- Risk: $800

---

## Decision 6: Event Log Rolling Buffer

**Context:** Pine Script does not have arrays that persist across bars in a way that supports efficient rolling buffers in libraries. M-10 needs a 6-entry rolling event log for the Observatory.

**Decision:** Six `var string` variables (`v_event_log_0` through `v_event_log_5`) are used as a manual rolling buffer. On each new event, logs are shifted down and the new event is inserted at position 0.

**Implementation:**
```pine
v_event_log_5 := v_event_log_4
v_event_log_4 := v_event_log_3
v_event_log_3 := v_event_log_2
v_event_log_2 := v_event_log_1
v_event_log_1 := v_event_log_0
v_event_log_0 := new_event
```

---

## Decision 7: MFE/MAE Tracking

**Context:** Maximum Favourable Excursion (MFE) and Maximum Adverse Excursion (MAE) are standard trade analytics metrics. They require tracking the maximum profit and maximum loss seen during the trade.

**Decision:** MFE and MAE are tracked in the `Position` UDT and updated every bar while the position is `ACTIVE`:
```pine
// MFE: maximum unrealised profit
if direction == 1  // LONG
    mfe := math.max(mfe, high - entry_price)
    mae := math.max(mae, entry_price - low)
```

**Units:** Points (not dollars). Conversion to dollars = value × contract_size.

---

## Validation Results

| Test | Expected | Result |
|------|----------|--------|
| Compilation | Zero errors | PASS — zero errors, zero warnings |
| State machine | NONE → PENDING on sim trigger | PASS — visible in debug table |
| Position tracking | Entry/Stop/Target displayed | PASS — values shown in debug table |
| Event log | State transitions logged | PASS — event table renders |
| Debug table | All 13 rows populated | PASS — all rows visible |
| Observability | Event log table renders | PASS — bottom-right table visible |

---

## Module Registry Update

| Module | File | Status | Lines |
|--------|------|--------|-------|
| M-00 | atlas_config.pine | ✅ Compiled | 324 |
| M-01 | atlas_utils.pine | ✅ Compiled | 418 |
| M-02 | atlas_state_manager.pine | ✅ Compiled | 334 |
| M-03 | atlas_market_state_engine.pine | ✅ Compiled | 792 |
| M-04 | atlas_model_a1.pine | ✅ Compiled | ~200 |
| M-05 | atlas_model_a3.pine | ✅ Compiled | ~200 |
| M-06 | atlas_model_b1.pine | ✅ Compiled | ~200 |
| M-07 | atlas_decision_engine.pine | ✅ Compiled | 307 |
| M-08 | atlas_risk_intelligence.pine | ✅ Compiled | 284 |
| M-09 | atlas_tvl.pine | ✅ Compiled | 211 |
| **M-10** | **atlas_execution_engine.pine** | **✅ Compiled** | **679** |

---

## Next Sprint: M-11 or M-14?

**Recommendation:** Sprint 073 should implement **M-14 `atlas_core.pine`** — the master integration script that imports/inlines all modules and runs the complete Atlas pipeline end-to-end. This is the production execution script.

Alternatively, Sprint 073 could implement **M-11 `atlas_position_monitor.pine`** — a dedicated position monitoring module that tracks open positions across sessions and generates alerts.

The APS specification should be consulted to determine the correct next module in the dependency chain.
