# Atlas Nexus Operating System (ANOS) v1.0 AI, Notifications & Roadmap

**Sprint:** 079  
**Date:** 10 July 2026  
**Author:** Manus AI  
**Status:** Approved for Implementation

This document specifies the Atlas AI natural-language interface, the multi-channel notification routing architecture, and the long-term expansion roadmap for the Atlas Nexus Operating System (ANOS).

---

## 1. Atlas AI Assistant Specification

Atlas AI is the natural-language interface to the Observatory database. It translates human questions into precise SQL queries against the `atlas_observability_logs` table, retrieves the data, and formulates an explainable response based strictly on the recorded facts.

### 1.1 Core Principle: No Invention
Atlas AI operates under a strict "Retrieval-Augmented Generation" (RAG) paradigm, where the retrieval source is the deterministic SQL database. It is explicitly instructed: **Never invent information. If the answer is not in the Observatory database, state that the data is unavailable.**

### 1.2 Architecture
1.  **Intent Parsing:** The user's natural language query is sent to an LLM (e.g., OpenAI GPT-4o or Claude 3.5 Sonnet).
2.  **Query Generation:** The LLM translates the intent into a specific JSON filter payload matching the Observatory Query Engine API.
3.  **Data Retrieval:** The backend executes the query against PostgreSQL and retrieves the raw JSONB records.
4.  **Synthesis:** The LLM receives the raw records and synthesises a human-readable answer.

### 1.3 Supported Query Archetypes
Atlas AI is specifically tuned to understand Atlas terminology (ADE, ARI, TVL, MVC-003, Edge Score).
*   **Diagnostic:** "Why didn't Atlas trade today?" (Checks for NO_TRADE decisions, ARI rejections, or TVL blocks).
*   **Statistical:** "Show every B1 trade above Edge Score 90." (Executes a filter query).
*   **Action-Oriented:** "Replay yesterday from 09:30." (Triggers the UI to switch to the Replay Engine and load the specified timestamp).
*   **Analytical:** "Explain why ARI reduced risk." (Queries the `ari_decision.rationale` field for the specific trade).
*   **Performance:** "Compare this week's performance with historical expectancy." (Queries `atlas_trades` and compares against the `score_c2` Historical Expectancy metric).

---

## 2. Notification Architecture

The ANOS notification system ensures the operator is immediately informed of critical system events without needing to stare at the dashboard continuously.

### 2.1 Event Types and Severities
Notifications are categorised by severity to prevent alert fatigue.

**Severity 1: CRITICAL (Immediate Action Required)**
*   Emergency Block triggered by TVL.
*   Broker disconnection or API failure.
*   Webhook receiver failure.
*   Daily Loss Limit breached.

**Severity 2: HIGH (Important Operational Event)**
*   Trade Executed successfully.
*   Trade closed (Profit/Loss summary).
*   ARI Intervention (e.g., risk multiplier reduced due to drawdown).

**Severity 3: MEDIUM (System State Change)**
*   Trade Rejected by ADE or TVL.
*   Compilation failure in TradingView.
*   Knowledge Confidence score change.

**Severity 4: LOW (Informational)**
*   New research hypothesis logged.
*   Sprint status updated.

### 2.2 Routing Channels
The operator can configure routing rules in the Settings panel based on severity.
*   **In-App Dashboard:** All notifications appear in the top-right notification centre.
*   **Discord / Slack:** Webhook integration for Severity 2 and above to a dedicated `#atlas-alerts` channel.
*   **Push / SMS:** Future integration via Twilio or Pushover for Severity 1 (Critical) alerts only.
*   **Email:** Daily summary reports and Sprint completion notices.

---

## 3. Implementation Roadmap

The development of ANOS will follow a phased rollout to ensure the core observability functions are stable before adding complex AI or external integrations.

### Phase 1: The Observability Core (MVP)
*   **Objective:** Establish the fundamental read-only monitoring capability.
*   **Deliverables:** FastAPI backend, SQLite database, React frontend scaffold. Implementation of the Home Dashboard, Brain View, and live SSE webhook ingestion.
*   **Timeline:** Sprints 080–082.

### Phase 2: Memory and Research
*   **Objective:** Unlock the value of the stored data.
*   **Deliverables:** PostgreSQL migration. Implementation of the Historical Replay Engine, Observatory Query Engine, and the Engineering Health Dashboard.
*   **Timeline:** Sprints 083–085.

### Phase 3: Intelligence and Routing
*   **Objective:** Proactive monitoring and natural language interaction.
*   **Deliverables:** Implementation of the Notification routing engine (Discord/Slack) and the Atlas AI Assistant integration.
*   **Timeline:** Sprints 086–088.

---

## 4. Future Expansion Plan

ANOS is designed with an extensible architecture to support the long-term institutionalisation of the Atlas ecosystem.

*   **Multi-Broker Portfolio Management:** Integrating REST APIs for Tradovate, TopStep, and Apex to provide real-time account reconciliation and cross-account drawdown monitoring directly within the ANOS Accounts panel.
*   **Machine Learning Pipeline:** Utilising the massive dataset stored in the Observatory to train secondary ML models that can predict `Edge Score` decay or identify new Minimum Viable Combinations (MVCs) autonomously.
*   **Cloud Execution Engine:** Eventually migrating the execution routing logic out of TradersPost and into a proprietary Rust or Go-based execution engine managed directly within ANOS, reducing latency and reliance on third-party SaaS.
*   **Institutional Multi-Tenancy:** Expanding the authentication model to support multiple distinct trading desks, each with their own isolated Observatory databases and risk limits, managed by a central super-administrator.
