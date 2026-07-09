"""
Atlas Sprint 055 — Knowledge Graph Construction and PKI Computation

Constructs the complete directed knowledge graph of the Atlas system
across all 8 layers, computes the Principle Knowledge Influence (PKI)
metric for every node, and produces the Atlas Principle Matrix.

Layers:
  L1: Foundational Principles (MP-001, MP-003, MP-004, MP-008)
  L2: Derived Principles (MP-002, MP-005, MP-006, MP-009)
  L3: Execution Components (EMA Stack, ATR Engine, ADX Engine, VolComp, Session Filter, Swing Structure)
  L4: Execution Models (A1, A2, A3)
  L5: ARI (Rules A, C, D + Priority Queue)
  L6: Portfolio Layer (Milestone Compounding, DLM, BCS Priority)
  L7: ATS v2.0 (Production System)
  L8: Production Dashboard / Observatory
"""

import networkx as nx
import numpy as np
import pandas as pd
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib.colors import LinearSegmentedColormap
import matplotlib.gridspec as gridspec
import json, os

CHARTS_DIR  = '/home/ubuntu/Project-Atlas/research/sprint-055-charts'
RESULTS_DIR = '/home/ubuntu/Project-Atlas/research-engine/sprint055'
os.makedirs(CHARTS_DIR, exist_ok=True)
os.makedirs(RESULTS_DIR, exist_ok=True)

# ─── Node Definitions ─────────────────────────────────────────────────────────
# Each node: id, label, layer, type, pcs, pas, description

nodes = [
    # ── Layer 1: Foundational Market Principles ──────────────────────────────
    {'id': 'MP-001', 'label': 'Regime\nDependence',        'layer': 1, 'type': 'principle_l3',
     'pcs': 86.2, 'pas': 22.7, 'sprint_origin': 19,
     'desc': 'Edge only exists in compatible volatility regimes'},
    {'id': 'MP-003', 'label': 'Session\nAsymmetry',        'layer': 1, 'type': 'principle_l3',
     'pcs': 85.0, 'pas': 50.4, 'sprint_origin': 26,
     'desc': 'Different sessions have structurally different edge profiles'},
    {'id': 'MP-004', 'label': 'VolComp→\nExpansion',       'layer': 1, 'type': 'principle_l3',
     'pcs': 83.8, 'pas': 36.9, 'sprint_origin': 33,
     'desc': 'Volatility contraction precedes and enables expansion breakouts'},
    {'id': 'MP-008', 'label': 'Theory\nof Edge',           'layer': 1, 'type': 'principle_l3',
     'pcs': 82.9, 'pas': 66.4, 'sprint_origin': 27,
     'desc': 'Edge requires structural + regime + temporal alignment'},

    # ── Layer 2: Derived Principles ───────────────────────────────────────────
    {'id': 'MP-002', 'label': 'ADX\nThresholds',           'layer': 2, 'type': 'principle_l3',
     'pcs': 82.9, 'pas': 52.4, 'sprint_origin': 25,
     'desc': 'ADX operates as absolute threshold classifier, not continuous'},
    {'id': 'MP-005', 'label': 'Loss Streaks\n= Regime',    'layer': 2, 'type': 'principle_l2',
     'pcs': 73.8, 'pas': 58.9, 'sprint_origin': 40,
     'desc': 'Consecutive losses are footprint of regime transitions'},
    {'id': 'MP-006', 'label': 'Structural\nAnchoring',     'layer': 2, 'type': 'principle_l2',
     'pcs': 61.7, 'pas': 38.6, 'sprint_origin': 25,
     'desc': 'Entries anchored to structural levels outperform random entries'},
    {'id': 'MP-009', 'label': 'A3 Temporal\nRestriction',  'layer': 2, 'type': 'principle_l1',
     'pcs': 67.5, 'pas': None, 'sprint_origin': 51,
     'desc': 'A3 model incompatible with European session (00:00-08:00)'},

    # ── Layer 3: Execution Components ─────────────────────────────────────────
    {'id': 'EC-EMA',  'label': 'EMA Stack\n(9/21/50)',     'layer': 3, 'type': 'component',
     'pcs': None, 'pas': None, 'sprint_origin': 19,
     'desc': 'Trend direction and alignment classifier'},
    {'id': 'EC-ATR',  'label': 'ATR Engine\n(5/14)',       'layer': 3, 'type': 'component',
     'pcs': None, 'pas': None, 'sprint_origin': 19,
     'desc': 'Volatility measurement for stops, sizing, regime detection'},
    {'id': 'EC-ADX',  'label': 'ADX Engine\n(14)',         'layer': 3, 'type': 'component',
     'pcs': None, 'pas': None, 'sprint_origin': 25,
     'desc': 'Trend strength absolute threshold classifier'},
    {'id': 'EC-VOLC', 'label': 'VolComp\nFilter',         'layer': 3, 'type': 'component',
     'pcs': None, 'pas': None, 'sprint_origin': 19,
     'desc': 'ATR5/ATR14 ratio compression prerequisite'},
    {'id': 'EC-SESS', 'label': 'Session\nFilter',          'layer': 3, 'type': 'component',
     'pcs': None, 'pas': None, 'sprint_origin': 26,
     'desc': 'RTH/PM/Overnight session boundary enforcement'},
    {'id': 'EC-STRUC','label': 'Swing\nStructure',         'layer': 3, 'type': 'component',
     'pcs': None, 'pas': None, 'sprint_origin': 25,
     'desc': 'Pullback depth, flag structure, zone anchoring'},
    {'id': 'EC-BCS',  'label': 'BCS Scorer',               'layer': 3, 'type': 'component',
     'pcs': None, 'pas': None, 'sprint_origin': 38,
     'desc': 'Behaviour Confidence Score for model priority ranking'},

    # ── Layer 4: Execution Models ──────────────────────────────────────────────
    {'id': 'MODEL-A1','label': 'Model A1\n(Pullback)',      'layer': 4, 'type': 'model',
     'pcs': None, 'pas': None, 'sprint_origin': 25,
     'desc': 'EMA pullback, all RTH, 1:2 RR, 1-contract'},
    {'id': 'MODEL-A2','label': 'Model A2\n(Flag Cont.)',    'layer': 4, 'type': 'model',
     'pcs': None, 'pas': None, 'sprint_origin': 42,
     'desc': 'Flag continuation, ADX>45, late RTH, $800 risk'},
    {'id': 'MODEL-A3','label': 'Model A3\n(Overnight)',     'layer': 4, 'type': 'model',
     'pcs': None, 'pas': None, 'sprint_origin': 37,
     'desc': 'Overnight expansion, ADX>=25, VolComp, $800 risk'},

    # ── Layer 5: ARI ──────────────────────────────────────────────────────────
    {'id': 'ARI-A',   'label': 'ARI Rule A\n(Circuit Bkr)','layer': 5, 'type': 'ari_rule',
     'pcs': None, 'pas': None, 'sprint_origin': 39,
     'desc': 'Daily loss ≤ -$300 → Risk = 0.0x (halt)'},
    {'id': 'ARI-C',   'label': 'ARI Rule C\n(Streak Risk)', 'layer': 5, 'type': 'ari_rule',
     'pcs': None, 'pas': None, 'sprint_origin': 40,
     'desc': 'Consecutive losses ≥ 3 → Risk = 0.5x'},
    {'id': 'ARI-D',   'label': 'ARI Rule D\n(ADX Boost)',   'layer': 5, 'type': 'ari_rule',
     'pcs': None, 'pas': None, 'sprint_origin': 40,
     'desc': 'ADX ≥ 32 → Risk = 1.25x (regime confidence boost)'},
    {'id': 'ARI-PQ',  'label': 'Priority\nQueue',           'layer': 5, 'type': 'ari_rule',
     'pcs': None, 'pas': None, 'sprint_origin': 44,
     'desc': 'A3 > A2 > A1 conflict resolution by BCS rank'},

    # ── Layer 6: Portfolio Layer ───────────────────────────────────────────────
    {'id': 'PORT-MC', 'label': 'Milestone\nCompounding',    'layer': 6, 'type': 'portfolio',
     'pcs': None, 'pas': None, 'sprint_origin': 47,
     'desc': '+$400 risk per $500 profit, max $2000 risk'},
    {'id': 'PORT-DLM','label': 'Daily Loss\nMgmt (DLM)',    'layer': 6, 'type': 'portfolio',
     'pcs': None, 'pas': None, 'sprint_origin': 47,
     'desc': '$800 daily limit, $500 recovery limit'},

    # ── Layer 7: ATS v2.0 ─────────────────────────────────────────────────────
    {'id': 'ATS-V2',  'label': 'ATS v2.0\nProduction',      'layer': 7, 'type': 'system',
     'pcs': None, 'pas': None, 'sprint_origin': 47,
     'desc': 'Validated production system: 88.3% MC pass rate'},

    # ── Layer 8: Production Dashboard / Observatory ───────────────────────────
    {'id': 'OBS-DASH','label': 'Intelligence\nDashboard',   'layer': 8, 'type': 'observatory',
     'pcs': None, 'pas': None, 'sprint_origin': 49,
     'desc': 'Live HTML interface: Daily/Weekly/Monthly reports'},
    {'id': 'OBS-CORE','label': 'Observatory\nCore',         'layer': 8, 'type': 'observatory',
     'pcs': None, 'pas': None, 'sprint_origin': 49,
     'desc': 'Automated anomaly detection and hypothesis generation'},
    {'id': 'OBS-KCS', 'label': 'Knowledge\nConf. Scores',   'layer': 8, 'type': 'observatory',
     'pcs': None, 'pas': None, 'sprint_origin': 49,
     'desc': 'Live KCS updates from trade log ingestion'},
    {'id': 'OBS-RQ',  'label': 'Research\nQueue',           'layer': 8, 'type': 'observatory',
     'pcs': None, 'pas': None, 'sprint_origin': 49,
     'desc': 'Evidence-weighted hypothesis prioritisation'},
]

# ─── Edge Definitions ─────────────────────────────────────────────────────────
# (source, target, edge_type, weight)
# edge_type: 'mandates', 'operationalises', 'enables', 'constrains', 'informs', 'generates'
# weight: 1=weak, 2=moderate, 3=strong

edges = [
    # ── L1 Principles → L2 Derived Principles ────────────────────────────────
    ('MP-001', 'MP-002', 'operationalises', 3),   # Regime Dependence → ADX Thresholds
    ('MP-001', 'MP-005', 'explains',        3),   # Regime Dependence → Loss Streaks
    ('MP-001', 'MP-009', 'explains',        2),   # Regime Dependence → A3 Temporal Restriction
    ('MP-004', 'MP-002', 'operationalises', 2),   # VolComp → ADX Thresholds (both measure regime)
    ('MP-008', 'MP-001', 'mandates',        3),   # Theory of Edge → Regime Dependence
    ('MP-008', 'MP-003', 'mandates',        3),   # Theory of Edge → Session Asymmetry
    ('MP-008', 'MP-004', 'mandates',        3),   # Theory of Edge → VolComp→Expansion
    ('MP-008', 'MP-006', 'mandates',        2),   # Theory of Edge → Structural Anchoring

    # ── L1/L2 Principles → L3 Execution Components ───────────────────────────
    ('MP-001', 'EC-VOLC', 'mandates',       3),   # Regime Dependence → VolComp Filter
    ('MP-001', 'EC-ADX',  'mandates',       3),   # Regime Dependence → ADX Engine
    ('MP-002', 'EC-ADX',  'operationalises',3),   # ADX Thresholds → ADX Engine
    ('MP-003', 'EC-SESS', 'mandates',       3),   # Session Asymmetry → Session Filter
    ('MP-004', 'EC-VOLC', 'mandates',       3),   # VolComp→Expansion → VolComp Filter
    ('MP-004', 'EC-ATR',  'mandates',       3),   # VolComp→Expansion → ATR Engine
    ('MP-006', 'EC-STRUC','mandates',       3),   # Structural Anchoring → Swing Structure
    ('MP-008', 'EC-EMA',  'mandates',       2),   # Theory of Edge → EMA Stack
    ('MP-008', 'EC-BCS',  'generates',      2),   # Theory of Edge → BCS Scorer

    # ── L3 Components → L4 Execution Models ──────────────────────────────────
    ('EC-EMA',   'MODEL-A1', 'enables', 3),
    ('EC-ATR',   'MODEL-A1', 'enables', 3),
    ('EC-SESS',  'MODEL-A1', 'constrains', 3),
    ('EC-STRUC', 'MODEL-A1', 'enables', 3),

    ('EC-EMA',   'MODEL-A2', 'enables', 3),
    ('EC-ATR',   'MODEL-A2', 'enables', 3),
    ('EC-ADX',   'MODEL-A2', 'constrains', 3),
    ('EC-SESS',  'MODEL-A2', 'constrains', 3),
    ('EC-STRUC', 'MODEL-A2', 'enables', 3),

    ('EC-EMA',   'MODEL-A3', 'enables', 3),
    ('EC-ATR',   'MODEL-A3', 'enables', 3),
    ('EC-ADX',   'MODEL-A3', 'constrains', 3),
    ('EC-VOLC',  'MODEL-A3', 'constrains', 3),
    ('EC-SESS',  'MODEL-A3', 'constrains', 3),

    # ── L4 Models → L5 ARI ────────────────────────────────────────────────────
    ('MODEL-A1', 'ARI-A',  'feeds', 2),
    ('MODEL-A2', 'ARI-A',  'feeds', 2),
    ('MODEL-A3', 'ARI-A',  'feeds', 2),
    ('MODEL-A1', 'ARI-C',  'feeds', 2),
    ('MODEL-A2', 'ARI-C',  'feeds', 2),
    ('MODEL-A3', 'ARI-C',  'feeds', 2),
    ('MODEL-A1', 'ARI-D',  'feeds', 2),
    ('MODEL-A2', 'ARI-D',  'feeds', 2),
    ('MODEL-A3', 'ARI-D',  'feeds', 2),
    ('EC-BCS',   'ARI-PQ', 'enables', 3),
    ('MODEL-A1', 'ARI-PQ', 'feeds', 3),
    ('MODEL-A2', 'ARI-PQ', 'feeds', 3),
    ('MODEL-A3', 'ARI-PQ', 'feeds', 3),

    # ── L2 Principles → L5 ARI (direct principle mandates) ───────────────────
    ('MP-005', 'ARI-C', 'mandates', 3),   # Loss Streaks → ARI Rule C (streak risk)
    ('MP-002', 'ARI-D', 'mandates', 3),   # ADX Thresholds → ARI Rule D (regime boost)
    ('MP-001', 'ARI-A', 'mandates', 2),   # Regime Dependence → ARI Rule A (circuit breaker)

    # ── L5 ARI → L6 Portfolio ─────────────────────────────────────────────────
    ('ARI-A',  'PORT-DLM', 'enables', 3),
    ('ARI-C',  'PORT-DLM', 'enables', 2),
    ('ARI-D',  'PORT-MC',  'enables', 2),
    ('ARI-PQ', 'PORT-MC',  'enables', 3),

    # ── L6 Portfolio → L7 ATS v2.0 ───────────────────────────────────────────
    ('PORT-MC',  'ATS-V2', 'enables', 3),
    ('PORT-DLM', 'ATS-V2', 'enables', 3),
    ('ARI-A',    'ATS-V2', 'enables', 3),
    ('ARI-C',    'ATS-V2', 'enables', 3),
    ('ARI-D',    'ATS-V2', 'enables', 3),
    ('ARI-PQ',   'ATS-V2', 'enables', 3),

    # ── L7 ATS → L8 Observatory ───────────────────────────────────────────────
    ('ATS-V2',   'OBS-DASH', 'feeds', 3),
    ('ATS-V2',   'OBS-CORE', 'feeds', 3),
    ('OBS-CORE', 'OBS-KCS',  'generates', 3),
    ('OBS-CORE', 'OBS-RQ',   'generates', 3),
    ('OBS-KCS',  'OBS-DASH', 'informs', 2),
    ('OBS-RQ',   'OBS-DASH', 'informs', 2),

    # ── Observatory feedback loop back to principles ──────────────────────────
    ('OBS-RQ',  'MP-001', 'informs', 1),  # Research queue can update principle confidence
    ('OBS-RQ',  'MP-002', 'informs', 1),
    ('OBS-KCS', 'MP-001', 'informs', 1),
    ('OBS-KCS', 'MP-002', 'informs', 1),
]

print(f"Nodes: {len(nodes)}")
print(f"Edges: {len(edges)}")

# ─── Build NetworkX Graph ─────────────────────────────────────────────────────
G = nx.DiGraph()

node_map = {n['id']: n for n in nodes}
for n in nodes:
    G.add_node(n['id'], **n)

for src, dst, etype, weight in edges:
    G.add_edge(src, dst, edge_type=etype, weight=weight)

print(f"\nGraph: {G.number_of_nodes()} nodes, {G.number_of_edges()} edges")
print(f"Is DAG: {nx.is_directed_acyclic_graph(G)}")

# ─── Compute PKI Scores ───────────────────────────────────────────────────────
print("\n=== COMPUTING PKI SCORES ===")

# PKI components:
# 1. Direct dependents (out-degree)
# 2. All reachable nodes (transitive closure)
# 3. Weighted betweenness centrality
# 4. Layer-weighted reach (deeper layers = higher weight)
# 5. Research generation (number of sprints that cite this principle)

layer_weights = {1: 1.0, 2: 0.9, 3: 0.7, 4: 0.5, 5: 0.4, 6: 0.3, 7: 0.2, 8: 0.1}

# Sprint citation counts (how many sprints reference each principle)
sprint_citations = {
    'MP-001': 8,  # S019, S025, S033, S040, S042, S048, S052, S053
    'MP-002': 6,  # S025, S040, S042, S048, S050, S053
    'MP-003': 5,  # S026, S033, S038, S042, S053
    'MP-004': 6,  # S019, S033, S037, S042, S048, S053
    'MP-005': 4,  # S039, S040, S051, S052
    'MP-006': 3,  # S025, S042, S053
    'MP-008': 5,  # S027, S038, S043, S048, S053
    'MP-009': 2,  # S051, S052
}

# Compute betweenness centrality
betweenness = nx.betweenness_centrality(G, weight='weight', normalized=True)

# Compute reachability (all nodes reachable from each node)
pki_results = {}
for node_id in G.nodes():
    node = node_map[node_id]
    layer = node['layer']

    # Direct out-degree
    direct_deps = G.out_degree(node_id)

    # All reachable nodes (descendants)
    try:
        descendants = nx.descendants(G, node_id)
    except:
        descendants = set()
    total_reach = len(descendants)

    # Layer-weighted reach
    layer_weighted_reach = 0
    for desc in descendants:
        desc_layer = node_map[desc]['layer']
        layer_weighted_reach += layer_weights.get(desc_layer, 0.1)

    # Type-weighted reach (principles > components > models > rules)
    type_weights = {'principle_l3': 2.0, 'principle_l2': 1.5, 'principle_l1': 1.0,
                    'component': 0.8, 'model': 1.2, 'ari_rule': 0.9,
                    'portfolio': 0.7, 'system': 0.5, 'observatory': 0.3}
    type_weighted_reach = sum(type_weights.get(node_map[d]['type'], 0.5) for d in descendants)

    # Betweenness centrality
    bc = betweenness.get(node_id, 0)

    # Sprint citations
    citations = sprint_citations.get(node_id, 0)

    # Cascading failure analysis: what layers are affected?
    affected_layers = set(node_map[d]['layer'] for d in descendants)
    cascade_depth = max(affected_layers) - layer if affected_layers else 0
    cascade_breadth = len(affected_layers)

    # PKI formula (0-100 scale)
    # Components:
    #   - Normalised direct deps (max ~10): weight 0.15
    #   - Normalised total reach (max ~25): weight 0.25
    #   - Layer-weighted reach (max ~15): weight 0.20
    #   - Type-weighted reach (max ~30): weight 0.20
    #   - Betweenness centrality (0-1): weight 0.10
    #   - Sprint citations (max ~8): weight 0.10

    pki_raw = (
        (direct_deps / 12.0)          * 0.15 +
        (total_reach / 25.0)          * 0.25 +
        (layer_weighted_reach / 15.0) * 0.20 +
        (type_weighted_reach / 30.0)  * 0.20 +
        bc                            * 0.10 +
        (citations / 8.0)             * 0.10
    )
    pki = min(100.0, pki_raw * 100)

    pki_results[node_id] = {
        'pki': pki,
        'direct_deps': direct_deps,
        'total_reach': total_reach,
        'layer_weighted_reach': layer_weighted_reach,
        'type_weighted_reach': type_weighted_reach,
        'betweenness': bc,
        'citations': citations,
        'cascade_depth': cascade_depth,
        'cascade_breadth': cascade_breadth,
        'affected_layers': sorted(affected_layers),
    }

# Print PKI results for principles
print(f"\n{'Node':<12} {'PKI':>6} {'Direct':>7} {'Reach':>6} {'BC':>8} {'Cites':>6} {'CascDep':>8}")
print("-" * 65)
for node_id, r in sorted(pki_results.items(), key=lambda x: x[1]['pki'], reverse=True):
    node = node_map[node_id]
    if node['type'] in ('principle_l3', 'principle_l2', 'principle_l1'):
        print(f"  {node_id:<10} {r['pki']:>6.1f} {r['direct_deps']:>7} {r['total_reach']:>6} "
              f"{r['betweenness']:>8.4f} {r['citations']:>6} {r['cascade_depth']:>8}")

# ─── Principle Matrix (PCS × PAS × PKI) ──────────────────────────────────────
print("\n\n=== ATLAS PRINCIPLE MATRIX ===")

# Load PAS from Sprint 054
pas_map = {
    'MP-001': 22.7, 'MP-002': 52.4, 'MP-003': 50.4, 'MP-004': 36.9,
    'MP-005': 58.9, 'MP-006': 38.6, 'MP-008': 66.4, 'MP-009': None
}
pcs_map = {
    'MP-001': 86.2, 'MP-002': 82.9, 'MP-003': 85.0, 'MP-004': 83.8,
    'MP-005': 73.8, 'MP-006': 61.7, 'MP-008': 82.9, 'MP-009': 67.5
}

principle_ids = ['MP-008', 'MP-001', 'MP-003', 'MP-004', 'MP-002', 'MP-005', 'MP-006', 'MP-009']

matrix_rows = []
for pid in principle_ids:
    pcs = pcs_map.get(pid)
    pas = pas_map.get(pid)
    pki = pki_results[pid]['pki'] if pid in pki_results else None
    node = node_map[pid]
    level = {'principle_l3': 3, 'principle_l2': 2, 'principle_l1': 1}.get(node['type'], 0)

    # Composite Atlas Score (CAS): geometric mean of PCS, PAS, PKI
    if pcs and pas and pki:
        cas = (pcs * pas * pki) ** (1/3)
    else:
        cas = None

    matrix_rows.append({
        'id': pid, 'name': node['label'].replace('\n', ' '), 'level': level,
        'pcs': pcs, 'pas': pas, 'pki': pki, 'cas': cas,
        'reach': pki_results[pid]['total_reach'],
        'cascade_depth': pki_results[pid]['cascade_depth'],
    })

df_matrix = pd.DataFrame(matrix_rows)
df_matrix.to_csv(f'{RESULTS_DIR}/principle_matrix.csv', index=False)

print(f"\n{'ID':<8} {'Name':<30} {'Lvl':>4} {'PCS':>6} {'PAS':>6} {'PKI':>6} {'CAS':>6} {'Reach':>6}")
print("-" * 80)
for _, row in df_matrix.iterrows():
    pas_str = f"{row['pas']:>6.1f}" if row['pas'] is not None else "   N/A"
    cas_str = f"{row['cas']:>6.1f}" if row['cas'] is not None else "   N/A"
    pki_str = f"{row['pki']:>6.1f}" if row['pki'] is not None else "   N/A"
    print(f"  {row['id']:<8} {row['name']:<30} L{row['level']:>1} {row['pcs']:>6.1f} "
          f"{pas_str} {pki_str} {cas_str} {row['reach']:>6}")

# ─── Cascading Failure Analysis ───────────────────────────────────────────────
print("\n\n=== CASCADING FAILURE ANALYSIS ===")
print("If principle X is removed, what else disappears?\n")

for pid in ['MP-008', 'MP-001', 'MP-003', 'MP-004', 'MP-002', 'MP-005']:
    r = pki_results[pid]
    node = node_map[pid]
    # Get descendants by type
    desc_ids = nx.descendants(G, pid)
    desc_by_type = {}
    for d in desc_ids:
        t = node_map[d]['type']
        desc_by_type.setdefault(t, []).append(d)

    print(f"  {pid} ({node['label'].replace(chr(10), ' ')}):")
    print(f"    Total nodes affected: {r['total_reach']}")
    print(f"    Cascade depth: {r['cascade_depth']} layers")
    print(f"    Affected layers: {r['affected_layers']}")
    for t, ids in sorted(desc_by_type.items()):
        print(f"    {t}: {', '.join(ids)}")
    print()

# ─── Save full graph data ─────────────────────────────────────────────────────
graph_data = {
    'nodes': [{**n, 'pki': pki_results[n['id']]['pki'],
               'pki_details': pki_results[n['id']]} for n in nodes],
    'edges': [{'src': e[0], 'dst': e[1], 'type': e[2], 'weight': e[3]} for e in edges],
    'principle_matrix': matrix_rows,
}
with open(f'{RESULTS_DIR}/knowledge_graph.json', 'w') as f:
    json.dump(graph_data, f, indent=2, default=str)
print(f"Saved: {RESULTS_DIR}/knowledge_graph.json")

print("\n=== KNOWLEDGE GRAPH CONSTRUCTION COMPLETE ===")
