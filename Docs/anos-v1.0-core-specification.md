# Atlas Nexus Operating System (ANOS) v1.0 Core Specification

**Sprint:** 079  
**Date:** 10 July 2026  
**Author:** Manus AI  
**Status:** Approved for Implementation

The Atlas Nexus Operating System (ANOS) represents the evolution of the Atlas Trading System from a collection of isolated execution scripts into a unified, institutional-grade engineering and operations platform. ANOS serves as the single, permanent control centre for the entire Atlas ecosystem.

---

## 1. Mission and Architecture Principles

The mission of ANOS is to provide a single interface through which every Atlas component is monitored, understood, and managed. The operator should never need to leave Atlas Nexus during the trading day.

**Core Architectural Principles:**
1.  **Absolute Observability:** Every decision must be observable in real-time.
2.  **Absolute Explainability:** Every action must be explainable to a human.
3.  **Absolute Traceability:** Every engineering change must be traceable to a specific sprint and commit.
4.  **Absolute Searchability:** Every piece of knowledge, hypothesis, and trade outcome must remain permanently searchable in the Observatory database.
5.  **Non-Interference:** ANOS remains a read-only observability layer. It cannot directly place trades or modify Pine Script execution logic.

---

## 2. Navigation Structure

ANOS employs a persistent left-hand sidebar navigation, structured hierarchically to mirror the operational workflow of an institutional quantitative trading desk.

### 2.1 Primary Navigation Map

*   **Home Dashboard:** The daily launchpad (Status, Market State, P&L, Countdown).
*   **Markets:** Live price action, volatility metrics, and session data.
*   **Atlas Brain:** The signature real-time decision translation interface.
*   **Execution Layer**
    *   **Models:** Individual performance and eligibility of A1, A3, B1.
    *   **Decision Engine (ADE):** Real-time ranking and candidate selection.
    *   **Risk Intelligence (ARI):** Capital allocation and safety rules.
    *   **Trade Verification (TVL):** Final 38-rule safety gatekeeper.
    *   **Execution:** Webhook routing and broker acknowledgements.
*   **Portfolio Management**
    *   **Live Positions:** Active trades, floating P&L, trailing stops.
    *   **Accounts:** Tradovate, Apex, TopStep balances and drawdown limits.
    *   **Performance:** Equity curves, profit factors, and historical expectancy drift.
*   **Intelligence & Data**
    *   **Observatory:** The raw immutable database view.
    *   **Replay Engine:** Historical candle-by-candle simulation.
    *   **Knowledge Base:** Permanent repository of research and hypotheses.
    *   **Atlas AI:** Natural-language interface to the Observatory.
*   **Engineering & Governance**
    *   **Research:** Active hypotheses and backtest results.
    *   **Engineering:** Sprint tracking, codebase status, and APS compliance.
    *   **Version History:** Git commits, APS versions, and change logs.
    *   **System Health:** Latency, heartbeats, and infrastructure monitoring.
*   **System Administration**
    *   **Settings:** User preferences and API key management.
    *   **Notifications:** Alert routing rules (Email, Discord, Push).
    *   **Activity Log:** Audit trail of all user logins and queries.

---

## 3. Visual Design Language

The ANOS visual identity must project institutional authority, precision, and density. It combines the data density of a Bloomberg Terminal, the charting fluidity of TradingView, and the modern, minimalist typography of Linear.

### 3.1 Colour Palette (Dark Mode Default)
ANOS operates primarily in Dark Mode to reduce eye strain during extended monitoring sessions.
*   **Background:** Deep Obsidian (`#0A0A0A`) for the main canvas.
*   **Panels/Cards:** Matte Charcoal (`#141414`) with a subtle 1px border (`#2A2A2A`).
*   **Primary Accent:** Atlas Blue (`#2563EB`) for active states and primary buttons.
*   **Secondary Accent:** Slate Grey (`#64748B`) for secondary text and inactive elements.

**Semantic Status Colours:**
*   **Verified / Profit / Long:** Emerald Green (`#10B981`).
*   **Rejected / Loss / Short:** Rose Red (`#EF4444`).
*   **Delayed / Caution:** Amber Yellow (`#F59E0B`).
*   **Emergency Block:** Crimson (`#991B1B`) with pulsing animation.

### 3.2 Typography
*   **Primary Font:** `Inter` (sans-serif) for all UI elements, providing exceptional legibility at small sizes.
*   **Monospace Font:** `JetBrains Mono` or `Fira Code` for all numerical data, prices, edge scores, and JSON payloads. Tabular lining is mandatory to ensure decimal points align vertically.
*   **Hierarchy:**
    *   Panel Headers: 14px, Uppercase, Tracking-wide, Slate Grey.
    *   Primary Data: 24px, Medium weight, White.
    *   Secondary Data: 12px, Regular weight, Slate Grey.

### 3.3 Layout and Density
*   **Grid System:** Strict 8px baseline grid.
*   **Density:** High density. Padding within data tables should be minimal (4px to 8px) to maximize the amount of information visible without scrolling.
*   **Responsive Behaviour:** Panels use CSS Grid/Flexbox to reflow gracefully from ultra-wide desktop monitors down to standard laptop screens. Mobile support is secondary; ANOS is a desktop-first application.

### 3.4 UI Components
*   **Cards:** Flat, no drop shadows. Defined entirely by 1px borders.
*   **Tables:** Sticky headers, alternating row colours (`#0A0A0A` and `#111111`), right-aligned numeric columns.
*   **Animations:** Strictly functional. 150ms ease-in-out transitions for hover states. No decorative animations. Flashing or pulsing is reserved exclusively for Emergency Blocks or live trade execution.

---

## 4. The Atlas Home Dashboard

The Home Dashboard is the default landing page. It is designed to answer the question: *"What is the exact state of my trading business right now?"* within 3 seconds.

### 4.1 Dashboard Layout
The dashboard is divided into three vertical columns:

**Left Column (Market & System Status)**
*   **Next Candle Countdown:** A prominent timer counting down to the next 5-minute bar close.
*   **Current Market State:** A dense summary of Session, Regime, ADX, and active MVCs.
*   **Current ATS Status:** System Health indicator (Green/Yellow/Red) and current active Sprint number.

**Middle Column (The Brain & Execution)**
*   **Current Model:** The currently active Candidate Model and its Edge Score.
*   **Current Risk:** The approved risk multiplier and contract sizing for the current session.
*   **Recent Decisions:** A miniaturised feed of the last 5 decisions from the Decision Timeline.

**Right Column (Portfolio & Performance)**
*   **Current Position:** Active trade status, unrealised P&L, and distance to stop/target.
*   **Current P&L:** Realised daily P&L across all connected accounts.
*   **Important Alerts:** A feed of TVL rejections, ARI interventions, or system health warnings.
