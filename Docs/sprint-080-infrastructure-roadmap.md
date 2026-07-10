# Atlas Infrastructure, Readiness & Roadmap Specification v1.0

**Sprint:** 080  
**Date:** 10 July 2026  
**Author:** Manus AI  
**Status:** Approved for Implementation

This document specifies the operational infrastructure tools for the Atlas Nexus Operating System (ANOS), including the Performance Profiler, Workspace Manager, System Readiness Framework, and the technical implementation roadmap.

---

## 1. Performance Profiler Specification

The Performance Profiler provides live telemetry on the computational efficiency of the Atlas ecosystem. Because Atlas operates on 5-minute candles, execution latency is critical to minimising slippage.

### 1.1 Measurement Points
The Profiler tracks the millisecond timestamp at every stage of the execution pipeline:
1.  `T0`: TradingView Bar Close.
2.  `T1`: Pine Script Calculation Complete.
3.  `T2`: Webhook Generation.
4.  `T3`: Webhook Transmission (Network Latency).
5.  `T4`: ANOS Backend Processing & Database Insert.
6.  `T5`: TradersPost Routing.
7.  `T6`: Broker Acknowledgement.
8.  `T7`: Trade Fill.
9.  `T8`: SSE Broadcast to ANOS Dashboard.

### 1.2 Interface Display
The Profiler panel displays a live waterfall chart of the current candle's execution timeline, alongside historical averages, minimums, and maximums for each step. Alerts are generated if total execution latency (`T0` to `T7`) exceeds 1,500 milliseconds.

---

## 2. System Readiness Framework

The System Readiness Score provides a single, definitive metric indicating whether Atlas is safe to operate. It aggregates the health of all subsystems into a tri-state indicator: `READY`, `CAUTION`, or `NOT READY`.

### 2.1 Readiness States
*   **READY (Green):** All infrastructure is connected, latency is nominal, API keys are valid, and no critical risk rules (e.g., Daily Loss Limit) are breached.
*   **CAUTION (Amber):** The system is operational, but non-critical degradation is detected (e.g., Observatory webhook latency > 2 seconds, or Knowledge Confidence has dropped). Trading continues, but operator attention is requested.
*   **NOT READY (Red):** The system is unsafe. Trading is halted. Causes include: Broker disconnection, TradersPost API failure, TVL emergency block, or Database unavailability.

### 2.2 Explainability
When the score is `CAUTION` or `NOT READY`, clicking the indicator opens the Object Explorer to immediately highlight the specific failing dependency (e.g., "Tradovate API Token Expired").

---

## 3. Workspace Manager Specification

ANOS must support diverse physical trading setups, from a single laptop to a multi-monitor trading wall.

### 3.1 Grid Architecture
The UI is built on a responsive grid system (e.g., React Grid Layout). Every panel (Mission Control, Dependency Graph, Live Chart) is a modular widget.

### 3.2 Features
*   **Drag and Drop:** Operators can resize and rearrange panels freely.
*   **Multi-Window Support:** Widgets can be popped out into separate browser windows while maintaining their SSE data connection.
*   **Layout Profiles:** Operators can save and load specific layouts (e.g., "Pre-Market Research Layout", "Live Execution Layout", "Dual-Monitor Wall Layout").

---

## 4. Implementation Roadmap & Technology Recommendations

### 4.1 Technology Stack Recommendations
To achieve the high-density, low-latency requirements of the Digital Twin and Mission Control:
*   **Frontend Framework:** Next.js (React) for robust routing and component architecture.
*   **State Management:** Zustand or Redux for managing the complex Digital Twin object graph client-side.
*   **Data Visualisation:**
    *   React Flow (for the Dependency Graph).
    *   Lightweight Charts (for TradingView chart integration).
    *   Recharts or D3.js (for the Performance Profiler waterfall).
*   **Backend:** FastAPI (Python) for high-performance async webhook processing and SSE streaming.
*   **Database:** PostgreSQL with JSONB columns for the immutable object store.

### 4.2 Phased Implementation Roadmap

**Phase 1: The Digital Twin Core (Sprint 081)**
*   Define the SQLAlchemy database models for the Digital Twin objects.
*   Implement the `/api/twin/state/current` endpoint.
*   Refactor the existing observability webhook to populate the Digital Twin schema.

**Phase 2: Mission Control & Explorer (Sprint 082)**
*   Build the React frontend for Mission Control.
*   Implement the Object Explorer slide-over panel.
*   Integrate the System Readiness Score logic.

**Phase 3: Visualisation & Time Travel (Sprint 083)**
*   Implement the React Flow Dependency Graph.
*   Build the Time Travel Replay Engine utilizing the historical Digital Twin API endpoints.
*   Implement the Performance Profiler telemetry tracking.

**Phase 4: Workspace & Polish (Sprint 084)**
*   Implement the drag-and-drop Workspace Manager.
*   Finalise the dark-mode institutional design language.
