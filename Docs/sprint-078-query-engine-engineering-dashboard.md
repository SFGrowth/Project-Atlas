# Atlas Query Engine & Engineering Dashboard Specification

**Sprint:** 078  
**Date:** 10 July 2026  
**Author:** Manus AI  
**Status:** Approved for Implementation

This document specifies the design and functional requirements for the "Observatory Query Engine" and the "Engineering Health Dashboard." These components transform the Web Command Centre from a passive monitoring tool into an active research and project management platform.

---

## 1. Observatory Query Engine Specification

The Observatory Query Engine provides a searchable, filterable interface to the immutable `atlas_observability_logs` database. Its purpose is to allow the operator to extract long-term statistical insights and debug complex edge cases across months of historical data.

### 1.1 Query Interface Design

The interface consists of a natural-language-inspired query builder, allowing the operator to chain multiple filtering conditions without writing raw SQL.

**Filter Categories:**
*   **Temporal:** Date Range, Specific Session (e.g., `OVERNIGHT`), Day of Week.
*   **Market State:** Regime (e.g., `TRENDING`), Volatility State, Active MVCs.
*   **Model Evaluation:** Specific Model ID, Edge Score Range, Eligibility Status.
*   **Decision Engine (ADE):** Candidate Model, NO_TRADE conditions.
*   **Risk Engine (ARI):** Approval Status, Specific Rejection Rule (e.g., `R3_DAILY_LOSS`), Risk Multiplier.
*   **Verification (TVL):** TVL Status, Specific Failure Category.

### 1.2 Standard Query Examples

The engine must natively support the execution of the following predefined queries with a single click:
1.  **High Conviction:** "Show every B1 score above 90."
2.  **Risk Intervention:** "Show every ARI rejection."
3.  **Safety Intervention:** "Show every TVL failure."
4.  **Market Structure:** "Show every MVC-003 activation."
5.  **Capital Preservation:** "Show every trade rejected due to Daily Loss Rule."
6.  **System Passivity:** "Show every NO_TRADE decision."
7.  **Session Analysis:** "Show every candidate model during the Overnight Session."

### 1.3 Result Presentation

Query results are presented in a paginated, sortable data table. Clicking on any individual row in the result table immediately loads that specific 5-minute candle into the **Historical Replay Engine**, allowing the operator to seamlessly transition from macro-level statistical querying to micro-level candle-by-candle analysis.

### 1.4 Backend Implementation

The FastAPI backend will expose a `/api/query` endpoint that accepts a JSON payload of filter conditions. The backend will translate these conditions into a parametrised SQLAlchemy query against the PostgreSQL JSONB columns.

*Example SQLAlchemy Query translation:*
```python
# "Show every ARI rejection due to Daily Loss Limit"
session.query(ObservabilityLog).filter(
    ObservabilityLog.ari_decision['approved'].astext == 'false',
    ObservabilityLog.ari_decision['rejection_rule'].astext == 'R3_DAILY_LOSS'
).all()
```

---

## 2. Engineering Health Dashboard Specification

The Engineering Health Dashboard is a dedicated page within the Web Command Centre that serves as the permanent project management and governance view. It visualises the current state of the Atlas codebase, compliance metrics, and the development roadmap.

### 2.1 Dashboard Panels

**Panel 1: Sprint Tracking**
*   **Current Sprint:** Number, Objective, Status (e.g., "Sprint 078: Observatory Intelligence - In Progress").
*   **Completed Sprints:** A scrolling list of historically completed sprints and their deliverables.
*   **Future Sprint Queue:** The backlog of upcoming engineering tasks.

**Panel 2: Codebase Status**
*   **Compilation Status:** Real-time status of TradingView Pine Script compilation (e.g., "M-00: SUCCESS", "M-01: SUCCESS").
*   **Verification Status:** Status of the visual and mathematical verification of each module against the APS.
*   **APS Compliance:** A boolean flag indicating whether the current Pine implementation perfectly matches the canonical Atlas Production Specification.

**Panel 3: Governance & Documentation**
*   **Open Discrepancies:** A list of unresolved conflicts between the APS and the implementation, requiring operator approval.
*   **Engineering Decisions:** A searchable log of all Rule 11 Engineering Decision explanations.
*   **Critical Self Reviews:** Access to the Rule 17 review documents for every completed module.
*   **Engineering Change Log:** The permanent, chronological record of every modification made to the system.

**Panel 4: Risk & Issues**
*   **Known Issues:** A register of identified bugs or limitations currently accepted in production.
*   **Risk Register:** A log of architectural or market risks (e.g., "TradingView webhook latency spikes during CPI data releases").

### 2.2 Integration with Version Intelligence

The Engineering Dashboard is tightly coupled with the Version Intelligence module. It constantly displays the current canonical version numbers for the APS, Pine Script codebase, and Dashboard software, ensuring the operator always knows exactly which iteration of Atlas is currently active.
