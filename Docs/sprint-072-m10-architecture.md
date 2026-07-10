# Sprint 072: M-10 Atlas Execution & Order Lifecycle Engine Architecture

## 1. Module Purpose
M-10 (atlas_execution_engine.pine) is the final execution boundary of the Atlas Trading System. It is responsible for the complete lifecycle of every trade, from TVL approval through to position archival. It does not evaluate the market, change model decisions, or alter risk parameters. It is a pure state machine for order execution.

## 2. Order State Machine
The module implements a deterministic state machine for order tracking. The states are:

- `PENDING`: Order is approved by TVL but not yet submitted to the broker (or simulated broker).
- `SUBMITTED`: Order has been sent to the broker.
- `ACKNOWLEDGED`: Broker has acknowledged the order.
- `FILLED`: Order has been filled; position is now active.
- `ACTIVE`: Position is open and being managed.
- `PARTIAL_EXIT`: Position has been partially closed (future-ready state).
- `CLOSED`: Position has been fully closed.
- `ARCHIVED`: Position is closed and moved to historical records.

*Note: In Pine Script simulation, `SUBMITTED` and `ACKNOWLEDGED` may be instantaneous or bypassed, but the state machine must track them for future live execution integration.*

## 3. Position Object (UDT)
The `Position` UDT tracks the lifecycle of a trade.

```pine
export type Position
    string  trade_id
    string  signal_id
    string  model_id
    string  status          // PENDING, SUBMITTED, ACKNOWLEDGED, FILLED, ACTIVE, PARTIAL_EXIT, CLOSED, ARCHIVED
    int     direction       // 1 for Long, -1 for Short
    float   entry_price
    float   stop_price
    float   target_price
    int     contracts
    float   risk_amount
    float   r_multiple      // Current R-multiple
    int     entry_time      // Unix timestamp
    int     exit_time       // Unix timestamp
    float   current_pnl     // Unrealized or Realized PnL
    float   mfe             // Maximum Favourable Excursion
    float   mae             // Maximum Adverse Excursion
    string  exit_reason     // "STOP", "TARGET", "EOD", "MANUAL", "REVERSAL"
```

## 4. Lifecycle Functions
M-10 will export pure functions to manage the position lifecycle. State mutation (e.g., updating a `var Position` variable) will happen in the main script (`atlas_core`), while M-10 provides the transition logic.

- `f_activate_trade(ApprovedTrade trade) => Position`: Converts an `ApprovedTrade` from TVL into a `PENDING` `Position`.
- `f_update_position(Position pos, float current_price, float current_high, float current_low) => Position`: Updates MFE, MAE, current PnL, and R-multiple.
- `f_check_exit(Position pos, float current_high, float current_low) => [bool, string, float]`: Checks if the position hit the stop loss or profit target. Returns `[is_exit, exit_reason, exit_price]`.
- `f_close_position(Position pos, string reason, float exit_price, int time) => Position`: Transitions the position to `CLOSED` and records exit metrics.

## 5. Observability Events
Every state transition must generate an event for the Observatory dashboard and Mission Control.

```pine
export type ExecutionEvent
    string  event_type      // "STATE_CHANGE", "MFE_UPDATE", "EXIT"
    string  trade_id
    string  old_state
    string  new_state
    string  message
    int     timestamp
```

## 6. Validation Constraints
- **No duplicate orders:** A new trade cannot be activated if `status == "ACTIVE"`.
- **No impossible transitions:** A `CLOSED` trade cannot transition back to `ACTIVE`.
- **No orphaned trades:** Every `PENDING` trade must eventually reach `CLOSED` or `ARCHIVED`.

## 7. Pine Script Implementation Notes
- M-10 will be implemented as a `library("atlas_execution_engine", overlay=false)`.
- It will export the `Position` and `ExecutionEvent` UDTs.
- It will export pure functions for state transitions.
- The actual `var` state tracking will occur in M-02 or the main execution script, adhering to Pine Script's restriction against modifying global `var` variables inside library functions.
