# Sprint 055: Atlas Knowledge Graph
**Date:** 9 July 2026
**Author:** Manus AI
**Project:** Atlas ATS v2.0

## 1. Executive Summary

Sprint 055 completes the formalisation of the Atlas knowledge architecture. While previous sprints quantified the statistical truth (PCS) and production value (PAS) of Atlas principles, Sprint 055 introduces the **Principle Knowledge Influence (PKI)** metric to measure structural importance. 

By mapping all 29 core components across 8 architectural layers (from Foundational Principles down to the Observatory) and calculating the 67 directed dependency edges between them, we have constructed the **Atlas Knowledge Graph v1.0**. 

The central scientific finding of this sprint is that Atlas is highly cohesive: a small number of foundational principles (specifically MP-008 and MP-001) generate almost the entirety of the system's operational logic. Execution models are merely the terminal applications of these deeper laws.

## 2. The Principle Knowledge Influence (PKI) Metric

The PKI score (0–100) measures how much of the Atlas system would collapse if a principle were proven false or removed. It is calculated using a weighted combination of:
* **Direct Dependencies:** How many components directly operationalise the principle.
* **Transitive Reach:** The total number of downstream nodes affected by cascading failure.
* **Layer Weighting:** Impact on deeper production layers (e.g., Portfolio, ATS) carries higher weight.
* **Graph Centrality:** Betweenness centrality within the directed network.
* **Research Generation:** The number of independent sprints that cite the principle.

### 2.1 The Atlas Principle Matrix

Every principle now possesses three permanent scores:
* **PCS (Truth):** How statistically robust and replicated is the finding?
* **PAS (Production Value):** How much does removing it degrade ATS v2.0 performance?
* **PKI (Knowledge Influence):** How much of the system's architecture depends on it?

The **Composite Atlas Score (CAS)** is the geometric mean of these three metrics, representing the ultimate scientific value of the principle.

| ID | Principle Name | Level | PCS | PAS | PKI | CAS | Reach |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **MP-008** | Theory of Edge | L3 | 82.9 | 66.4 | **81.4** | **76.5** | 28 |
| **MP-003** | Session Asymmetry | L3 | 85.0 | 50.4 | **54.8** | **61.7** | 21 |
| **MP-002** | ADX Thresholds | L3 | 82.9 | 52.4 | **49.6** | **59.9** | 18 |
| **MP-005** | Loss Streaks = Regime | L2 | 73.8 | 58.9 | **45.5** | **58.3** | 18 |
| **MP-004** | VolComp→ Expansion | L3 | 83.8 | 36.9 | **58.5** | **56.6** | 21 |
| **MP-006** | Structural Anchoring | L2 | 61.7 | 38.6 | **52.3** | **49.9** | 21 |
| **MP-001** | Regime Dependence | L3 | 86.2 | 22.7 | **58.2** | **48.5** | 18 |

![Principle Matrix](sprint-055-charts/sprint055_principle_matrix.png)

## 3. Knowledge Collapse Analysis

The PKI metric resolves the anomaly discovered in Sprint 054, where MP-001 (Regime Dependence) scored a low PAS (22.7) despite being the most statistically confident principle in the system (PCS 86.2). 

The Knowledge Collapse Analysis proves that MP-001 is a **generator principle**. While its direct removal is masked by redundant downstream filters (yielding a low PAS), its theoretical removal would cause a massive architectural collapse.

If MP-001 were invalidated, 18 downstream nodes across 7 layers would lose their theoretical justification, including the ADX Engine, the VolComp Filter, Models A2 and A3, and three ARI Rules. 

![Knowledge Collapse](sprint-055-charts/sprint055_knowledge_collapse.png)

### 3.1 The Apex Node: MP-008
MP-008 (Theory of Edge) is the apex node of the entire Atlas system. It dictates that pure price-action logic (EMA crosses) has zero inherent edge without structural, temporal, and regime alignment. If MP-008 is removed, 28 out of 29 nodes in the system (97%) collapse. It scores the highest across PAS (66.4) and PKI (81.4).

## 4. The Atlas Knowledge Graph v1.0

The full directed graph visualises the flow of knowledge from theoretical principles down to production code.

![Knowledge Graph](sprint-055-charts/sprint055_knowledge_graph.png)

**Key Architectural Observations:**
1. **The Regime Cluster:** MP-001, MP-002, MP-004, and MP-005 form a tightly coupled sub-graph. They all describe the same underlying phenomenon (volatility regime transition) using different mathematical proxies (ADX, ATR compression, sequence risk).
2. **The Temporal Anchor:** MP-003 (Session Asymmetry) operates entirely independently of the Regime Cluster. It is the sole justification for the Session Filter component and the A3 Temporal Restriction.
3. **The Executive Bottleneck:** All execution models (Layer 4) funnel into the ARI layer (Layer 5). The graph visually confirms that ARI is the true executive decision-maker of the system, acting as the bridge between signal generation and portfolio capital.

## 5. Strategic Implications

Atlas has evolved from a collection of profitable filters into a coherent scientific theory of market behaviour. 

The introduction of PKI ensures that research priorities are not skewed entirely by immediate PnL impact (PAS). Generator principles like MP-001 must be protected and researched even if their immediate ablation impact is low, because they provide the theoretical scaffolding that allows the rest of the system to function.

As requested in the sprint directive, this framework is not an end in itself. The Atlas Principle Matrix (PCS × PAS × PKI) will now serve as the permanent scientific scoreboard to guide future model development, specifically the upcoming Model B1.

All visualisations and the raw graph data structure (`knowledge_graph.json`) have been committed to the repository.
