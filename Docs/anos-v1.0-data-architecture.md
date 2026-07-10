# Atlas Nexus Operating System (ANOS) v1.0 Data & API Architecture

**Sprint:** 079  
**Date:** 10 July 2026  
**Author:** Manus AI  
**Status:** Approved for Implementation

This document defines the underlying data structures, API endpoints, and security models that power the Atlas Nexus Operating System (ANOS).

---

## 1. Database Architecture

ANOS relies on a PostgreSQL database to serve as the permanent, searchable Observatory. The schema is designed to store heterogeneous JSON payloads while allowing for efficient querying of specific state parameters.

### 1.1 Core Tables

**Table 1: `atlas_observability_logs`**
The primary table storing the immutable record of every 5-minute candle evaluation.
*   `id` (UUID, Primary Key)
*   `timestamp_utc` (BigInt, Indexed) — Unix timestamp of the bar close.
*   `bar_index` (Integer) — TradingView bar index.
*   `market_state` (JSONB, Indexed) — The 43-field Market State Object.
*   `model_evaluations` (JSONB) — Array of Edge Scores and eligibility for all models.
*   `ade_decision` (JSONB) — Candidate ranking and selection rationale.
*   `ari_decision` (JSONB) — Capital allocation and risk rule evaluation.
*   `tvl_decision` (JSONB) — Final verification status.
*   `execution_payload` (JSONB) — The actual payload routed to TradersPost (if any).
*   `created_at` (Timestamp) — Server-side ingestion time.

**Table 2: `atlas_trades`**
Records the lifecycle of executed trades, reconciled with broker data.
*   `id` (UUID, Primary Key)
*   `signal_id` (String, Indexed) — Foreign key linking to the `observability_logs` TVL decision.
*   `account_id` (String) — E.g., 'Tradovate-Live', 'Apex-01'.
*   `status` (Enum) — `PENDING`, `FILLED`, `CLOSED`, `REJECTED`.
*   `entry_price` (Float)
*   `exit_price` (Float)
*   `slippage_ticks` (Float)
*   `realised_pnl` (Float)
*   `created_at` (Timestamp)
*   `closed_at` (Timestamp)

**Table 3: `atlas_engineering_log`**
The permanent repository of the Engineering Change Log and APS discrepancies.
*   `id` (UUID, Primary Key)
*   `sprint_number` (String)
*   `version` (String)
*   `module_modified` (String)
*   `rationale` (Text)
*   `aps_reference` (String)
*   `created_at` (Timestamp)

**Table 4: `atlas_knowledge_base`**
Stores research hypotheses, backtest results, and model documentation.
*   `id` (UUID, Primary Key)
*   `type` (Enum) — `HYPOTHESIS`, `BACKTEST`, `MODEL_SPEC`.
*   `title` (String)
*   `content` (Text / Markdown)
*   `status` (Enum) — `ACTIVE`, `REJECTED`, `PROMOTED`.
*   `created_at` (Timestamp)

---

## 2. API Architecture

The ANOS backend is built on FastAPI (Python), providing high-performance asynchronous endpoints for both data ingestion and frontend querying.

### 2.1 Ingestion Endpoints (Internal)
These endpoints are called exclusively by TradingView or internal background workers.

*   `POST /api/v1/webhook/observe`
    *   **Purpose:** Ingests the 5-minute observability payload from Pine Script.
    *   **Auth:** Requires a static Bearer token.
    *   **Action:** Validates JSON schema, inserts into `atlas_observability_logs`, and broadcasts the new record via SSE to all connected frontend clients.

*   `POST /api/v1/broker/sync`
    *   **Purpose:** Webhook endpoint for TradersPost/Tradovate to push fill and exit updates.
    *   **Action:** Updates the `atlas_trades` table.

### 2.2 Client Endpoints (Frontend)
These endpoints serve the React frontend.

*   `GET /api/v1/observatory/latest`
    *   **Purpose:** Fetches the most recent 5-minute evaluation to populate the Home Dashboard and Brain View on initial load.
*   `POST /api/v1/observatory/query`
    *   **Purpose:** Powers the Observatory Query Engine. Accepts a JSON payload of filter parameters and returns paginated records from `atlas_observability_logs`.
*   `GET /api/v1/observatory/replay/{date}`
    *   **Purpose:** Powers the Historical Replay Engine. Fetches an entire day's worth of payloads in chronological order.
*   `GET /api/v1/engineering/sprints`
    *   **Purpose:** Fetches the engineering roadmap and change log for the Engineering Dashboard.

### 2.3 Realtime Streaming
*   `GET /api/v1/stream`
    *   **Purpose:** A Server-Sent Events (SSE) endpoint. The React frontend maintains a persistent connection to this endpoint to receive instantaneous updates whenever a new payload is ingested or a trade state changes.

---

## 3. Authentication & Security Specification

ANOS contains highly sensitive intellectual property (the APS, model logic, and historical data). It must be secured with institutional-grade authentication.

### 3.1 Operator Accounts & Roles
ANOS implements Role-Based Access Control (RBAC) with the following tiers:
1.  **Administrator:** Full access to all panels, user management, and API key configuration.
2.  **Engineering:** Access to Engineering Dashboard, Observatory, Replay, and Knowledge Base. Cannot modify API keys.
3.  **Research:** Access to Knowledge Base, Observatory, and Replay Engine.
4.  **Observer (Audit):** Read-only access to the Home Dashboard and Live Positions. Cannot view raw model logic or the Knowledge Base.

### 3.2 Authentication Flow
*   **Method:** JSON Web Tokens (JWT) stored in secure, `HttpOnly` cookies.
*   **MFA:** Multi-Factor Authentication (TOTP via Google Authenticator/Authy) is mandatory for Administrator and Engineering roles.
*   **Session Management:** Sessions expire automatically after 12 hours of inactivity.
*   **Audit Logging:** Every successful login, failed attempt, and major query executed in the Observatory is logged to an internal `auth_audit` table.

### 3.3 Network Security
*   **VPC Isolation:** The database and backend API must be deployed within a Virtual Private Cloud (VPC), inaccessible from the public internet except through a configured API Gateway or Load Balancer.
*   **Webhook Obfuscation:** The `/api/v1/webhook/observe` endpoint must use a cryptographically secure, rotating UUID path (e.g., `/api/v1/webhook/obs-9f8d7c6b`) to prevent brute-force discovery, in addition to requiring the Bearer token.
