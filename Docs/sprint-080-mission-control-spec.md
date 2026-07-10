# Atlas Mission Control & Interface Specification v1.0

**Sprint:** 080  
**Date:** 10 July 2026  
**Author:** Manus AI  
**Status:** Approved for Implementation

This document specifies the primary operational interfaces for the Atlas Nexus Operating System (ANOS): Mission Control, the Object Explorer, and the Dependency Graph. These interfaces consume data directly from the Digital Twin API to provide total operational awareness.

---

## 1. Mission Control Specification

Mission Control is the apex interface of ANOS. It replaces the Home Dashboard as the default operational view. It is designed specifically for large, high-resolution monitors (e.g., 4K or ultra-wide displays) to provide a complete operational overview within five seconds.

### 1.1 Layout Architecture
Mission Control abandons pagination in favour of a dense, unified grid layout. The operator must not need to scroll or switch tabs to understand the system state.

**Zone 1: Global State (Top Bar)**
*   System Readiness Score (READY / CAUTION / NOT READY).
*   Countdown to next 5-minute candle close.
*   Infrastructure Heartbeat (Latency and Uptime).

**Zone 2: Market & Brain (Left Column)**
*   Current Market State (Session, Regime, Volatility).
*   Live TradingView Chart integration (MNQ1! 5m).
*   Current Candidate Model and Model Rankings.

**Zone 3: Risk & Execution (Middle Column)**
*   ARI State (Approved/Rejected, Risk Multiplier, Active Rule blocks).
*   TVL State (38-rule verification matrix).
*   Execution Status (Pending, Filled, Rejected).

**Zone 4: Portfolio & Telemetry (Right Column)**
*   Open Positions (Floating P&L, Trailing Stop distance).
*   Account Health (Tradovate/Prop firm balances, Drawdown limits).
*   Recent Decisions Feed (Timeline of the last 10 candles).

---

## 2. Object Explorer Specification

The Object Explorer fulfills the mandate that "Every object must be clickable and completely explain itself." It acts as a deep-dive diagnostic tool.

### 2.1 Interaction Model
When the operator clicks on any data point within Mission Control (e.g., the "ADX: 32.4" value, or the "ARI Approved" badge), a modal or slide-over panel opens, revealing the underlying Digital Twin object.

### 2.2 Inspection Data
The Object Explorer panel displays the following for the selected object:
*   **Identity:** Object UUID, Timestamp, Owner Module (e.g., `M-01`).
*   **Values:** Current Value, Previous Value (Delta).
*   **Traceability:** The specific APS reference governing this calculation.
*   **Lineage:** A list of all upstream inputs used to calculate this value.
*   **Downstream:** A list of all components that rely on this value.
*   **Raw Data:** The raw JSON payload from the Observatory database.

---

## 3. Dependency Graph Specification

The Dependency Graph provides a visual, interactive map of the Atlas calculation pipeline. It ensures that every calculation path is traceable and every decision is reproducible.

### 3.1 Visual Architecture
The graph is rendered as a Directed Acyclic Graph (DAG) using a library such as React Flow or D3.js. Nodes represent Digital Twin objects, and edges represent data flow.

**Standard Flow Path:**
`Market Data` → `Market State (MSO)` → `Model Evaluations (A1, A3, B1)` → `Decision Engine (ADE)` → `Risk Intelligence (ARI)` → `Verification (TVL)` → `Execution Engine`.

### 3.2 Interaction
*   **Live Tracing:** As a new 5-minute candle closes, the graph animates the flow of data through the nodes.
*   **Failure Isolation:** If a trade is rejected (e.g., by ARI), the specific node turns red, and the downstream path (TVL, Execution) is greyed out, instantly isolating the point of failure.
*   **Time Travel Integration:** When using the Replay Engine, the Dependency Graph updates to reflect the exact flow and failure points of the historical candle being viewed.
