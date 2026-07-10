# Atlas Web Command Centre Specification v1.1

**Sprint:** 078  
**Date:** 10 July 2026  
**Author:** Manus AI  
**Status:** Approved for Implementation  
*Note: This document supersedes v1.0 (Sprint 077).*

The Atlas Web Command Centre is a read-only, browser-based observability platform. It provides real-time visibility into the Atlas Trading System (ATS) v2.1. The dashboard strictly enforces the principle of non-interference: it cannot place trades, modify Pine Script, alter the Atlas Production Specification (APS), or change live execution behaviour. Its primary purpose is to ensure Atlas remains permanently observable, explainable, and reproducible.

---

## 1. Architectural Overview

The Web Command Centre operates as an independent parallel workstream to the Pine Script execution path. It receives data via a dedicated observability webhook endpoint, entirely separate from the TradersPost execution routing pipeline.

### 1.1 Technology Stack
*   **Frontend:** React (Next.js) with Tailwind CSS.
*   **Backend:** FastAPI (Python) or Node.js (Express).
*   **Database:** PostgreSQL (production) or SQLite (MVP) for immutable event storage.
*   **Realtime Protocol:** Server-Sent Events (SSE) for unidirectional backend-to-frontend state broadcasting.
*   **Hosting:** Local deployment for MVP, transitioning to a secure VPS.

---

## 2. Core Dashboard Views

The Web Command Centre is structured around four primary operational views.

### 2.1 The Atlas Brain View (Signature Screen)
The primary real-time monitoring interface. It provides a step-by-step translation of the Atlas decision-making process for the current 5-minute candle via a structured Q&A interface.
*   **Market Observation:** Explicitly answers session, regime, trend, volatility, and MVC states.
*   **Model Evaluation:** Details the Edge Score, eligibility, and specific rejection rationale for models A1, A3, and B1.
*   **ADE & ARI:** Explains the candidate ranking logic and the specific risk rules evaluated for approval or rejection.
*   **TVL & Execution:** Confirms final safety verification and execution routing status.

### 2.2 The Historical Replay Engine
An interactive debugging and research tool.
*   **Functionality:** Allows the operator to select any historical trading day and step through the Atlas decision-making process candle-by-candle.
*   **Synchronisation:** Timeline scrubbing synchronously updates the entire Brain View, Market State, and Risk panels to reflect the exact historical state.
*   **Architecture:** Operates entirely client-side by querying the `atlas_observability_logs` database, ensuring zero latency and total isolation from live execution.

### 2.3 The Observatory Query Engine
A searchable, filterable interface to the immutable database.
*   **Functionality:** Enables natural-language-inspired querying (e.g., "Show every ARI rejection due to Daily Loss Limit").
*   **Integration:** Clicking any result row immediately loads that specific 5-minute candle into the Historical Replay Engine for micro-level analysis.
*   **Purpose:** Transforms the Observatory into a permanent, searchable memory for long-term statistical insight.

### 2.4 The Engineering Health Dashboard
The permanent project management and governance view.
*   **Sprint Tracking:** Monitors active and completed sprints, and the future backlog.
*   **Codebase Status:** Real-time compilation and verification status of all Pine Script modules.
*   **Governance:** Tracks APS compliance, open discrepancies, Rule 11 Engineering Decisions, and the Rule 13 Engineering Change Log.
*   **Version Intelligence:** Displays the canonical version numbers for the APS, Pine codebase, Dashboard, and Git commits.

---

## 3. Data and Webhook Schema

TradingView Pine Script generates a comprehensive JSON payload specifically for the observability endpoint. This payload captures the full internal state of Atlas on every 5-minute bar.

### 3.1 Observability Webhook Payload Schema
```json
{
  "version_intelligence": {
    "aps_version": "v1.0",
    "pine_version": "v2.1.0",
    "sprint": "078"
  },
  "timestamp_utc": 1718029500,
  "bar_index": 45210,
  "market_state": {
    "session": "AM_SESSION",
    "adx14": 28.5,
    "atr14": 12.4,
    "ema_structure": "BULL_ALIGNED",
    "volcomp_ratio": 0.85,
    "ov_direction": 1,
    "rel_txn": 1.42,
    "mvc_003_active": true
  },
  "model_evaluations": [
    {
      "model_id": "A1",
      "eligible": false,
      "edge_score": 0,
      "rejection_reason": "Regime constraint: ADX > 25"
    },
    {
      "model_id": "B1",
      "eligible": true,
      "edge_score": 87.4,
      "has_signal": true,
      "entry_price": 20150.25,
      "stop_price": 20120.00,
      "target_price": 20240.75
    }
  ],
  "ade_decision": {
    "candidate_model": "B1",
    "activation_threshold_met": true,
    "rationale": "Highest Edge Score (87.4) > Threshold (60)"
  },
  "ari_decision": {
    "approved": true,
    "risk_multiplier": 1.1,
    "contracts": 2,
    "daily_pnl": 450.00,
    "circuit_breaker_active": false,
    "rationale": "Approved. R3, R4, R5 checks passed."
  },
  "tvl_decision": {
    "status": "VERIFIED",
    "rejection_code": null,
    "signal_id": "B1-1718029500",
    "rationale": "All 38 verification rules passed."
  },
  "execution_payload": {
    "action": "buy",
    "ticker": "MNQ1!",
    "contracts": 2
  }
}
```

---

## 4. System Health & Alerts Panel

The dashboard continuously monitors system infrastructure to ensure operational integrity.
*   **Latency Metrics:** Webhook transmission latency and API response times.
*   **Connection Status:** TradersPost, Tradovate, and Database health.
*   **Heartbeats:** Last received Pine log timestamp and backend service heartbeat.
*   **Capacity:** Queue sizes and storage usage.

---

## 5. Security Model

The Web Command Centre must not introduce attack vectors into the trading system.
1.  **Read-Only Architecture:** The dashboard contains no functionality to transmit orders or modify state.
2.  **Authentication:** The frontend requires strong password authentication. No public access is permitted.
3.  **Webhook Authentication:** The backend observability endpoint requires a static Bearer token matching the token configured in the TradingView alert.
4.  **Network Isolation:** The observability backend operates on a separate port or server from the execution webhook receiver.

---

## 6. Implementation Roadmap

### Phase 1: MVP Build (Local Deployment)
*   Stand up FastAPI backend and SQLite database.
*   Scaffold React application with the Atlas Brain View and Engineering Dashboard.
*   Implement Server-Sent Events (SSE) for real-time updates.

### Phase 2: Replay & Query Engines
*   Build the Historical Replay Engine with timeline scrubbing.
*   Implement the natural-language Query Engine and result data tables.

### Phase 3: Production Deployment
*   Migrate database to PostgreSQL.
*   Deploy backend and frontend to a secure VPS.
*   Implement frontend authentication and System Health monitoring.
