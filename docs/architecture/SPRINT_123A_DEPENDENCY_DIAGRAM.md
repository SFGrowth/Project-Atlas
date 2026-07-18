# Sprint 123A Dependency Diagram
**Document type:** Architecture Reference  
**Sprint:** 123A  
**Status:** PENDING APPROVAL  
**Date:** 2026-07-18

---

## Sub-Sprint Dependency Graph

```mermaid
graph TD
    G0["Gate G0\nPlan Approval\n(Phil)"]
    S1["Sprint 123A.1\nFoundation\n• Feature flags\n• DB schema\n• Canonical event types\n• postBarAutomation\n• G-001 fix\n• G-002 fix\n• Architecture docs"]
    G1["Gate G1\n123A.1 Complete\n(Phil)"]
    S2["Sprint 123A.2\nDatabento Adapter\n• Python feed service\n• Bridge server\n• trades normaliser\n• Secret scanning"]
    G2["Gate G2\n123A.2 Complete\n(Phil)"]
    S3["Sprint 123A.3\nCanonical Bars\n• Bar builder (1-min)\n• 5-min aggregator\n• Contract roll manager\n• Canonical router\n• Tick storage\n• Effective-once ledger"]
    G3["Gate G3\n123A.3 Complete\n(Phil)"]
    S4["Sprint 123A.4\nParity + Chart\n• Parity monitor\n• AtlasLiveChart.tsx\n• Trade lifecycle SSE\n• Chart authority gate"]
    G4["Gate G4\nParity Certification\n≥99.9% over 5 days\n(Phil)"]
    G5["Gate G5\n123A.4 Complete\n(Phil)"]
    S5["Sprint 123A.5\nLearning Authority\n• postBarAutomation update\n• Canonical BE trigger\n• DARWIN canonical trigger\n• Duplicate protection"]
    G6["Gate G6\nLearning Authority\nActivation\n(Phil explicit)"]
    G7["Gate G7\n123A Complete\n(Phil)"]
    S123B["Sprint 123B\nDecision Authority\n(Separate approval)"]

    G0 --> S1
    S1 --> G1
    G1 --> S2
    S2 --> G2
    G2 --> S3
    S3 --> G3
    G3 --> S4
    S4 --> G4
    G4 --> G5
    G5 --> S5
    S5 --> G6
    G6 --> G7
    G7 --> S123B

    style G0 fill:#f0ad4e,color:#000
    style G1 fill:#f0ad4e,color:#000
    style G2 fill:#f0ad4e,color:#000
    style G3 fill:#f0ad4e,color:#000
    style G4 fill:#d9534f,color:#fff
    style G5 fill:#f0ad4e,color:#000
    style G6 fill:#d9534f,color:#fff
    style G7 fill:#f0ad4e,color:#000
    style S1 fill:#5bc0de,color:#000
    style S2 fill:#5bc0de,color:#000
    style S3 fill:#5bc0de,color:#000
    style S4 fill:#5bc0de,color:#000
    style S5 fill:#5bc0de,color:#000
    style S123B fill:#999,color:#fff
```

---

## Component Dependency Graph

```mermaid
graph TD
    TV["TradingView Webhook\n(Production — unchanged)"]
    PY["Python Feed Service\n(services/databento-feed/)"]
    BR["Bridge Server\n(server/market-data/bridge-server.ts)"]
    EB["Atlas Event Bus\n(server/market-data/event-bus.ts)"]
    BB["Bar Builder\n(server/market-data/bar-builder.ts)"]
    FA["Five-Min Aggregator\n(server/market-data/five-min-aggregator.ts)"]
    CRM["Contract Roll Manager\n(server/market-data/contract-roll-manager.ts)"]
    CR["Canonical Router\n(server/market-data/canonical-router.ts)"]
    TS["Tick Storage\n(server/market-data/tick-storage.ts)"]
    PM["Parity Monitor\n(server/market-data/parity-monitor.ts)"]
    PBA["postBarAutomation\n(server/automation/postBarAutomation.ts)"]
    LLE["liveLearnEngine\n(server/liveLearnEngine.ts)"]
    BE["Behaviour Engine\n(server/behaviour-engine/)"]
    DARWIN["DARWIN\n(server/darwinAutonomous.ts)"]
    PB["processBar()\n(server/monitor/paperTradeEngine.ts)"]
    CHART["AtlasLiveChart.tsx\n(client/src/components/)"]
    DB["Database\n(TiDB)"]

    TV -->|"bar close (TRADINGVIEW_ONLY)"| PB
    TV -->|"bar close (TRADINGVIEW_ONLY)"| LLE
    TV -->|"bar close (TRADINGVIEW_ONLY)"| PBA

    PY -->|"normalised trades + bars"| BR
    BR -->|"AtlasTradeEvent etc."| EB
    EB --> BB
    EB --> CRM
    EB --> TS
    BB -->|"AtlasBarConfirmed (1-min)"| FA
    FA -->|"CanonicalBarConfirmed (5-min)"| CR
    CR -->|"DATABENTO_SHADOW: persist + compare only"| PM
    CR -->|"DATABENTO_LEARNING_AUTHORITY: trigger"| PBA
    PBA --> LLE
    PBA --> DARWIN
    PBA --> BE
    LLE --> DB
    BE --> DB
    DARWIN --> DB
    PM --> DB
    TS --> DB
    CR --> DB
    BB --> DB
    FA --> DB

    CHART -->|"SSE: atlas_bar_developing\natlas_bar_confirmed\natlas_feed_health\natlas_contract_roll"| EB
```

---

## Authority Transition Diagram

```mermaid
stateDiagram-v2
    [*] --> TRADINGVIEW_ONLY : Current state
    TRADINGVIEW_ONLY --> DATABENTO_SHADOW : Gate G2 passed\n+ Phil approval
    DATABENTO_SHADOW --> DATABENTO_CHART_AUTHORITY : Gate G4 passed\n+ Phil approval
    DATABENTO_CHART_AUTHORITY --> DATABENTO_LEARNING_AUTHORITY : Gate G6 passed\n+ Phil explicit approval
    DATABENTO_LEARNING_AUTHORITY --> DATABENTO_DECISION_AUTHORITY : Sprint 123B\n+ Phil explicit approval

    note right of TRADINGVIEW_ONLY
        processBar: TradingView
        postBarAutomation: TradingView
        chart: LiveChart.tsx
    end note

    note right of DATABENTO_SHADOW
        processBar: TradingView
        postBarAutomation: TradingView
        chart: LiveChart.tsx (TV) or AtlasLiveChart.tsx (DB)
        Databento: persist + compare only
    end note

    note right of DATABENTO_CHART_AUTHORITY
        processBar: TradingView
        postBarAutomation: TradingView
        chart: AtlasLiveChart.tsx (DB)
    end note

    note right of DATABENTO_LEARNING_AUTHORITY
        processBar: TradingView
        postBarAutomation: Databento canonical bar
        chart: AtlasLiveChart.tsx (DB)
    end note

    note right of DATABENTO_DECISION_AUTHORITY
        processBar: Databento canonical bar
        postBarAutomation: Databento canonical bar
        chart: AtlasLiveChart.tsx (DB)
        Sprint 123B only
    end note
```
