# Atlas Brain View & Replay Engine Specification

**Sprint:** 078  
**Date:** 10 July 2026  
**Author:** Manus AI  
**Status:** Approved for Implementation

This document specifies the design and functional requirements for the "Atlas Brain View" and the "Historical Replay Engine," two core components of the Atlas Web Command Centre. These features are designed to fulfill the Final Principle: **Atlas should never become a black box. Every decision should be observable and explainable.**

---

## 1. Atlas Brain View Specification

The Atlas Brain View is the signature screen of the Web Command Centre. It provides a real-time, step-by-step translation of the Atlas decision-making process for the current 5-minute candle. It is designed as a structured Q&A interface that allows a human operator to literally "watch Atlas think."

### 1.1 Interface Design

The Brain View interface is divided into sequential logic blocks, mirroring the execution pipeline from Market State Engine (MSE) observation to Trade Verification Layer (TVL) execution.

**Block 1: Market Observation (MSE)**
*   **Question 1:** What session am I in?
    *   *Answer Format:* `Session: AM_SESSION | Time: 10:45 ET`
*   **Question 2:** What market regime am I in?
    *   *Answer Format:* `Regime: TRENDING | ADX(14): 32.4`
*   **Question 3:** What is the current trend state?
    *   *Answer Format:* `Trend: BULL_ALIGNED | EMA Stack: 9 > 21 > 50`
*   **Question 4:** What is the current volatility state?
    *   *Answer Format:* `Volatility: EXPANDING | VolComp Ratio: 1.45`
*   **Question 5:** Which MVCs are active?
    *   *Answer Format:* `Active MVCs: MVC-003 (Apex Combination)`

**Block 2: Model Evaluation**
*   **Question 6:** How did Model A1 evaluate this market?
    *   *Answer Format:* `Eligibility: REJECTED | Reason: ADX too high (>40) | Edge Score: 0`
*   **Question 7:** How did Model A3 evaluate this market?
    *   *Answer Format:* `Eligibility: REJECTED | Reason: Invalid Session (Not Overnight) | Edge Score: 0`
*   **Question 8:** How did Model B1 evaluate this market?
    *   *Answer Format:* `Eligibility: APPROVED | Edge Score: 88.5 | Entry: 20150.25 | Stop: 20120.00 | Target: 20240.75`

**Block 3: Atlas Decision Engine (ADE)**
*   **Question 9:** How did ADE rank every model?
    *   *Answer Format:* `Rank 1: B1 (88.5) | Rank 2: A1 (0.0) | Rank 3: A3 (0.0) -> Candidate: B1`

**Block 4: Atlas Risk Intelligence (ARI)**
*   **Question 10:** Did ARI approve the trade?
    *   *Answer Format:* `Decision: APPROVED | Contracts: 2 | Rule Evaluated: R3 (Daily Loss OK), R4 (Consecutive Loss OK), R5 (Trade Limit OK)`

**Block 5: Trade Verification Layer (TVL)**
*   **Question 11:** Did TVL verify the trade?
    *   *Answer Format:* `Status: VERIFIED | Categories Passed: C1, C2, C3, C4, C5, C6`

**Block 6: Final Execution**
*   **Question 12:** Final Result
    *   *Answer Format:* `TRADE EXECUTED | Webhook Transmitted | Target: Tradovate` (or `NO TRADE | Reason: No eligible candidate model`)

### 1.2 Explainability Requirement

Every rejection or approval in the Brain View must include explicit reasoning extracted directly from the observability webhook payload. If Model A1 is rejected, the dashboard must display the exact parameter that failed (e.g., "Pullback depth 1.5 ATR > Max 1.2 ATR").

---

## 2. Historical Replay Engine Specification

The Historical Replay Engine transforms the Observatory database into an interactive debugging and research tool. It allows the operator to select any historical trading day and step through the Atlas decision-making process candle-by-candle.

### 2.1 Replay Controls

The Replay Engine interface includes standard media playback controls:
*   **Date Selector:** A calendar widget to select the historical trading day.
*   **Timeline Scrubber:** A horizontal slider representing the trading day (04:00 ET to 17:59 ET), allowing the operator to jump to a specific 5-minute candle.
*   **Play/Pause:** Automatically advances the replay at a configurable speed (e.g., 1 candle per second).
*   **Step Forward / Step Back:** Manually advance or rewind by exactly one 5-minute candle.
*   **Jump to Next Event:** Automatically advances the timeline to the next candle where a trade was proposed, approved, or rejected.

### 2.2 Synchronised State Updates

When the timeline scrubber is moved or the replay advances, the entire Web Command Centre dashboard updates synchronously to reflect the exact state of the system at that historical timestamp.

This includes:
*   The Brain View panel populating with the historical Q&A sequence.
*   The Live Market State panel updating with the historical MSO values.
*   The ARI Risk panel reflecting the historical daily P&L and drawdown state at that exact moment.
*   The Decision Timeline scrolling to the corresponding historical event.

### 2.3 Data Source and Architecture

The Replay Engine operates entirely client-side by querying the `atlas_observability_logs` database table.
1.  When a date is selected, the backend fetches all webhook payloads for that specific day.
2.  The payloads are loaded into the React frontend's state management layer (e.g., Redux or Context API).
3.  The Replay Controls simply update the `current_bar_index` state variable.
4.  All dashboard components reactively re-render based on the payload corresponding to the `current_bar_index`.

This architecture ensures zero latency during playback and completely isolates the replay functionality from the live execution pipeline.
