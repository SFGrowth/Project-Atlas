# Sprint 073 — M-14 Atlas Kernel Architecture

## Overview
The Atlas Kernel (`atlas_core.pine`) is the master orchestration script that connects all Atlas modules into a single deterministic pipeline. It acts as the executable entry point for the entire trading system.

## Pipeline Architecture
The Kernel executes sequentially on every completed bar (and optionally on realtime ticks):

1. **State Manager Refresh (M-02)**
   - Updates session state, tracks daily P&L, resets on new day.
2. **Market State Engine (M-03)**
   - Calculates EMAs, ATRs, ADX, VolComp, MVC-003.
   - Outputs `MarketState` UDT.
3. **Model Evaluation (M-04, M-05, M-06)**
   - A1, A3, B1 models evaluate the `MarketState`.
   - Outputs `TradeProposal` UDTs.
4. **Decision Engine (M-07)**
   - Evaluates all proposals, calculates Edge Scores.
   - Outputs `DecisionReport` and winning `CandidateModel`.
5. **Risk Intelligence (M-08)**
   - Applies risk rules, calculates position sizing.
   - Outputs `RiskDecision` and `ApprovedTrade` primitives.
6. **Trade Verification Layer (M-09)**
   - 18-rule safety barrier.
   - Outputs `VerificationReport` primitives.
7. **Execution Engine (M-10)**
   - Manages position lifecycle and order states.
   - Updates `Position` UDT.
8. **Observability & Heartbeat**
   - Generates `PipelineReport` and renders debug tables.

## Implementation Pattern
Since Pine Script v5 does not support importing UDTs from libraries, and the `import` statement has severe limitations regarding UDT passing, M-14 will use an **inline integration pattern**. 

The Kernel will include the UDT definitions and the core orchestration logic, while calling the library functions from M-01, M-03, M-07, M-08, M-09. M-02 (State Manager) and M-10 (Execution Engine) logic will be inlined directly into M-14, as they require global `var` mutations which are illegal in libraries.

## Fail-Safe Mechanism
The pipeline uses a `try/catch` equivalent pattern:
- A `bool pipeline_failed` flag is checked at each stage.
- If a stage fails (e.g., division by zero caught by `nz()`, or missing data), the flag is set.
- Subsequent stages are skipped.
- An emergency block is triggered in the Execution Engine.

## Performance Timing
M-14 will track execution timing using `timenow` at the start and end of the pipeline (if supported in the execution context, otherwise it will track bar processing latency).

## Observability
A comprehensive `PipelineReport` UDT will capture the state of all subsystems at the end of the bar, rendering to the Observatory dashboard.
