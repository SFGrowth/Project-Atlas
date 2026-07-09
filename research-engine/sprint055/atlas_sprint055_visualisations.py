"""
Atlas Sprint 055 — Knowledge Graph Visualisations
Produces:
  1. Atlas Knowledge Graph v1.0 (full layered graph)
  2. Principle Matrix Heatmap (PCS × PAS × PKI)
  3. Dependency Heatmap (node × node)
  4. PKI Ranking Chart
  5. Knowledge Collapse Analysis (cascade failure chart)
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
from matplotlib.lines import Line2D
import json, os

CHARTS_DIR  = '/home/ubuntu/Project-Atlas/research/sprint-055-charts'
RESULTS_DIR = '/home/ubuntu/Project-Atlas/research-engine/sprint055'
os.makedirs(CHARTS_DIR, exist_ok=True)

# ─── Load graph data ──────────────────────────────────────────────────────────
with open(f'{RESULTS_DIR}/knowledge_graph.json') as f:
    gd = json.load(f)

nodes_data = {n['id']: n for n in gd['nodes']}
edges_data  = gd['edges']
matrix_data = gd['principle_matrix']

# Rebuild networkx graph
G = nx.DiGraph()
for n in gd['nodes']:
    G.add_node(n['id'], **n)
for e in edges_data:
    G.add_edge(e['src'], e['dst'], edge_type=e['type'], weight=e['weight'])

print(f"Graph: {G.number_of_nodes()} nodes, {G.number_of_edges()} edges")

# ─── Node visual properties ───────────────────────────────────────────────────
type_colors = {
    'principle_l3': '#e67e22',   # orange — Level 3 Market Principle
    'principle_l2': '#f39c12',   # amber — Level 2 Strategy Family
    'principle_l1': '#f1c40f',   # yellow — Level 1 Model-Specific
    'component':    '#3498db',   # blue — Execution Component
    'model':        '#2ecc71',   # green — Execution Model
    'ari_rule':     '#9b59b6',   # purple — ARI Rule
    'portfolio':    '#1abc9c',   # teal — Portfolio Rule
    'system':       '#e74c3c',   # red — Production System
    'observatory':  '#95a5a6',   # grey — Observatory
}

layer_labels = {
    1: 'L1: Foundational\nMarket Principles',
    2: 'L2: Derived\nPrinciples',
    3: 'L3: Execution\nComponents',
    4: 'L4: Execution\nModels',
    5: 'L5: ARI\n(Risk Intelligence)',
    6: 'L6: Portfolio\nLayer',
    7: 'L7: ATS v2.0\n(Production)',
    8: 'L8: Observatory\n& Dashboard',
}

# ─── VISUALISATION 1: Full Atlas Knowledge Graph ──────────────────────────────
print("Generating Atlas Knowledge Graph v1.0...")

fig, ax = plt.subplots(figsize=(22, 16))
fig.patch.set_facecolor('#0d1117')
ax.set_facecolor('#0d1117')
ax.axis('off')

# Manual layout: layer on Y-axis, spread on X-axis
layer_nodes = {}
for nid, ndata in nodes_data.items():
    l = ndata['layer']
    layer_nodes.setdefault(l, []).append(nid)

# Assign x positions within each layer
pos = {}
layer_y = {1: 7.5, 2: 6.2, 3: 4.8, 4: 3.4, 5: 2.2, 6: 1.2, 7: 0.3, 8: -0.7}
layer_x_ranges = {
    1: [1.5, 4.5, 7.5, 10.5],
    2: [0.5, 3.5, 6.5, 9.5],
    3: [0.0, 2.0, 4.0, 6.0, 8.0, 10.0, 12.0],
    4: [3.0, 6.0, 9.0],
    5: [1.5, 4.0, 6.5, 9.0],
    6: [4.0, 8.0],
    7: [6.0],
    8: [2.0, 5.0, 8.0, 11.0],
}

# Fixed positions for clarity
fixed_pos = {
    # L1 Foundational
    'MP-008': (6.0, 7.8),
    'MP-001': (2.5, 7.8),
    'MP-003': (9.5, 7.8),
    'MP-004': (4.5, 7.8),
    # L2 Derived
    'MP-002': (2.5, 6.3),
    'MP-005': (5.5, 6.3),
    'MP-006': (8.5, 6.3),
    'MP-009': (11.0, 6.3),
    # L3 Components
    'EC-EMA':   (0.5, 4.9),
    'EC-ATR':   (2.0, 4.9),
    'EC-ADX':   (3.5, 4.9),
    'EC-VOLC':  (5.0, 4.9),
    'EC-SESS':  (6.5, 4.9),
    'EC-STRUC': (8.0, 4.9),
    'EC-BCS':   (9.5, 4.9),
    # L4 Models
    'MODEL-A1': (2.5, 3.5),
    'MODEL-A2': (6.0, 3.5),
    'MODEL-A3': (9.5, 3.5),
    # L5 ARI
    'ARI-A':  (2.0, 2.2),
    'ARI-C':  (4.5, 2.2),
    'ARI-D':  (7.0, 2.2),
    'ARI-PQ': (9.5, 2.2),
    # L6 Portfolio
    'PORT-DLM': (3.5, 1.1),
    'PORT-MC':  (8.5, 1.1),
    # L7 ATS
    'ATS-V2': (6.0, 0.1),
    # L8 Observatory
    'OBS-CORE': (2.0, -0.9),
    'OBS-DASH': (5.0, -0.9),
    'OBS-KCS':  (8.0, -0.9),
    'OBS-RQ':   (11.0, -0.9),
}

# Draw layer background bands
layer_band_colors = {
    1: '#1a1a2e', 2: '#16213e', 3: '#0f3460', 4: '#0f3460',
    5: '#1a1a2e', 6: '#16213e', 7: '#1a1a2e', 8: '#0d1117'
}
layer_y_bounds = {
    1: (7.3, 8.3), 2: (5.8, 6.8), 3: (4.4, 5.4), 4: (3.0, 4.0),
    5: (1.7, 2.7), 6: (0.6, 1.6), 7: (-0.4, 0.6), 8: (-1.4, -0.4)
}
for layer, (y_lo, y_hi) in layer_y_bounds.items():
    rect = plt.Rectangle((-0.5, y_lo), 13.0, y_hi - y_lo,
                         facecolor=layer_band_colors[layer], alpha=0.4, zorder=0)
    ax.add_patch(rect)
    ax.text(-0.3, (y_lo + y_hi) / 2, layer_labels[layer],
            va='center', ha='left', fontsize=7, color='#7f8c8d', style='italic', zorder=1)

# Draw edges
edge_type_styles = {
    'mandates':       {'color': '#e74c3c', 'lw': 2.0, 'alpha': 0.7},
    'operationalises':{'color': '#e67e22', 'lw': 1.5, 'alpha': 0.6},
    'enables':        {'color': '#3498db', 'lw': 1.2, 'alpha': 0.5},
    'constrains':     {'color': '#9b59b6', 'lw': 1.2, 'alpha': 0.5},
    'explains':       {'color': '#f1c40f', 'lw': 1.2, 'alpha': 0.5},
    'feeds':          {'color': '#2ecc71', 'lw': 1.0, 'alpha': 0.4},
    'generates':      {'color': '#1abc9c', 'lw': 1.2, 'alpha': 0.5},
    'informs':        {'color': '#95a5a6', 'lw': 0.8, 'alpha': 0.3},
}
for e in edges_data:
    src, dst = e['src'], e['dst']
    etype = e['type']
    if src not in fixed_pos or dst not in fixed_pos: continue
    x1, y1 = fixed_pos[src]
    x2, y2 = fixed_pos[dst]
    style = edge_type_styles.get(etype, {'color': '#95a5a6', 'lw': 0.8, 'alpha': 0.3})
    ax.annotate('', xy=(x2, y2), xytext=(x1, y1),
                arrowprops=dict(arrowstyle='->', color=style['color'],
                                lw=style['lw'], alpha=style['alpha'],
                                connectionstyle='arc3,rad=0.05'))

# Draw nodes
for nid, (x, y) in fixed_pos.items():
    ndata = nodes_data[nid]
    ntype = ndata['type']
    color = type_colors.get(ntype, '#95a5a6')
    pki = ndata.get('pki', 0) or 0

    # Node size proportional to PKI (for principles) or fixed for others
    if ntype.startswith('principle'):
        radius = 0.28 + (pki / 100) * 0.18
    else:
        radius = 0.22

    circle = plt.Circle((x, y), radius, color=color, alpha=0.85, zorder=5)
    ax.add_patch(circle)

    # Label
    label = ndata['label']
    fontsize = 7.5 if ntype.startswith('principle') else 6.5
    ax.text(x, y, label, ha='center', va='center', fontsize=fontsize,
            fontweight='bold', color='white', zorder=6)

    # PKI badge for principles
    if ntype.startswith('principle') and pki > 0:
        ax.text(x + radius * 0.7, y + radius * 0.7,
                f'PKI\n{pki:.0f}', ha='center', va='center', fontsize=5.5,
                color='white', fontweight='bold', zorder=7,
                bbox=dict(boxstyle='round,pad=0.1', facecolor='#2c3e50', alpha=0.8))

ax.set_xlim(-0.5, 13.0)
ax.set_ylim(-1.6, 8.6)
ax.set_title('Atlas Knowledge Graph v1.0\n(Sprint 055 — 29 nodes, 67 edges across 8 layers)',
             fontsize=14, fontweight='bold', color='white', pad=15)

# Legend
legend_elements = [
    mpatches.Patch(color=type_colors['principle_l3'], label='L3 Market Principle'),
    mpatches.Patch(color=type_colors['principle_l2'], label='L2 Strategy Family'),
    mpatches.Patch(color=type_colors['principle_l1'], label='L1 Model-Specific'),
    mpatches.Patch(color=type_colors['component'],    label='Execution Component'),
    mpatches.Patch(color=type_colors['model'],        label='Execution Model'),
    mpatches.Patch(color=type_colors['ari_rule'],     label='ARI Rule'),
    mpatches.Patch(color=type_colors['portfolio'],    label='Portfolio Rule'),
    mpatches.Patch(color=type_colors['system'],       label='Production System'),
    mpatches.Patch(color=type_colors['observatory'],  label='Observatory'),
]
edge_legend = [
    Line2D([0], [0], color='#e74c3c', lw=2, label='mandates'),
    Line2D([0], [0], color='#e67e22', lw=1.5, label='operationalises'),
    Line2D([0], [0], color='#3498db', lw=1.2, label='enables'),
    Line2D([0], [0], color='#9b59b6', lw=1.2, label='constrains'),
    Line2D([0], [0], color='#f1c40f', lw=1.2, label='explains'),
    Line2D([0], [0], color='#2ecc71', lw=1.0, label='feeds'),
    Line2D([0], [0], color='#1abc9c', lw=1.2, label='generates'),
]
leg1 = ax.legend(handles=legend_elements, loc='lower left', fontsize=7,
                 facecolor='#16213e', edgecolor='#7f8c8d', title='Node Types',
                 title_fontsize=7, ncol=1)
ax.add_artist(leg1)
ax.legend(handles=edge_legend, loc='lower right', fontsize=7,
          facecolor='#16213e', edgecolor='#7f8c8d', title='Edge Types', title_fontsize=7)

plt.tight_layout()
plt.savefig(f'{CHARTS_DIR}/sprint055_knowledge_graph.png', dpi=150, bbox_inches='tight',
            facecolor='#0d1117')
plt.close()
print(f"  Saved: sprint055_knowledge_graph.png")


# ─── VISUALISATION 2: Principle Matrix Heatmap ───────────────────────────────
print("Generating Principle Matrix Heatmap...")

df_matrix = pd.DataFrame(matrix_data)
df_matrix = df_matrix[df_matrix['id'] != 'MP-009'].copy()  # exclude L1 (no PAS)
df_matrix = df_matrix.sort_values('pki', ascending=False).reset_index(drop=True)

fig, axes = plt.subplots(1, 2, figsize=(18, 7))
plt.style.use('dark_background')
fig.suptitle('Atlas Principle Matrix: PCS × PAS × PKI\n(Sprint 055)', fontsize=13,
             fontweight='bold', color='white')

# Left: 3-metric bar chart
ax = axes[0]
x = np.arange(len(df_matrix))
width = 0.25
names = [row['id'] for _, row in df_matrix.iterrows()]

bars_pcs = ax.bar(x - width, df_matrix['pcs'], width, label='PCS (Truth)', color='#3498db', alpha=0.85)
bars_pas = ax.bar(x,         df_matrix['pas'], width, label='PAS (Production Value)', color='#2ecc71', alpha=0.85)
bars_pki = ax.bar(x + width, df_matrix['pki'], width, label='PKI (Knowledge Influence)', color='#e67e22', alpha=0.85)

ax.set_xticks(x)
ax.set_xticklabels(names, fontsize=9, color='white')
ax.set_ylabel('Score (0-100)', fontsize=10, color='white')
ax.set_title('Three-Metric Principle Scorecard', fontsize=11, fontweight='bold', color='white')
ax.set_ylim(0, 105)
ax.legend(fontsize=8)
ax.tick_params(colors='white')
ax.axhline(y=50, color='#95a5a6', linewidth=0.8, linestyle=':', alpha=0.5)
ax.axhline(y=70, color='#95a5a6', linewidth=0.8, linestyle=':', alpha=0.5)

# Add value labels
for bar in bars_pcs:
    ax.text(bar.get_x() + bar.get_width()/2., bar.get_height() + 0.5,
            f'{bar.get_height():.0f}', ha='center', va='bottom', fontsize=6, color='white')
for bar in bars_pas:
    ax.text(bar.get_x() + bar.get_width()/2., bar.get_height() + 0.5,
            f'{bar.get_height():.0f}', ha='center', va='bottom', fontsize=6, color='white')
for bar in bars_pki:
    ax.text(bar.get_x() + bar.get_width()/2., bar.get_height() + 0.5,
            f'{bar.get_height():.0f}', ha='center', va='bottom', fontsize=6, color='white')

# Right: CAS (Composite Atlas Score) ranking
ax2 = axes[1]
df_cas = df_matrix.dropna(subset=['cas']).sort_values('cas', ascending=True)
cas_colors = ['#e74c3c' if c < 50 else '#f1c40f' if c < 65 else '#2ecc71'
              for c in df_cas['cas']]
bars2 = ax2.barh([row['id'] for _, row in df_cas.iterrows()],
                 df_cas['cas'], color=cas_colors, alpha=0.85, edgecolor='white', linewidth=1)
for bar, cas in zip(bars2, df_cas['cas']):
    ax2.text(cas + 0.5, bar.get_y() + bar.get_height()/2.,
             f'{cas:.1f}', va='center', ha='left', fontsize=9, fontweight='bold', color='white')
ax2.axvline(x=50, color='#f1c40f', linewidth=1.2, linestyle='--', alpha=0.6, label='50 threshold')
ax2.axvline(x=65, color='#2ecc71', linewidth=1.2, linestyle='--', alpha=0.6, label='65 threshold')
ax2.set_xlabel('Composite Atlas Score (CAS = ∛(PCS × PAS × PKI))', fontsize=9, color='white')
ax2.set_title('Composite Atlas Score (CAS)\nGeometric Mean of PCS × PAS × PKI', fontsize=11,
              fontweight='bold', color='white')
ax2.set_xlim(0, 100)
ax2.legend(fontsize=8)
ax2.tick_params(colors='white', labelsize=9)

plt.tight_layout()
plt.savefig(f'{CHARTS_DIR}/sprint055_principle_matrix.png', dpi=150, bbox_inches='tight',
            facecolor='#1a1a2e')
plt.close()
print(f"  Saved: sprint055_principle_matrix.png")


# ─── VISUALISATION 3: Dependency Heatmap ─────────────────────────────────────
print("Generating Dependency Heatmap...")

# Build reachability matrix for all principles + components + models
key_nodes = ['MP-008', 'MP-001', 'MP-003', 'MP-004', 'MP-002', 'MP-005', 'MP-006',
             'EC-EMA', 'EC-ATR', 'EC-ADX', 'EC-VOLC', 'EC-SESS', 'EC-STRUC', 'EC-BCS',
             'MODEL-A1', 'MODEL-A2', 'MODEL-A3',
             'ARI-A', 'ARI-C', 'ARI-D', 'ARI-PQ',
             'PORT-MC', 'PORT-DLM', 'ATS-V2']

n_nodes = len(key_nodes)
dep_matrix = np.zeros((n_nodes, n_nodes))

for i, src in enumerate(key_nodes):
    try:
        descendants = nx.descendants(G, src)
    except:
        descendants = set()
    for j, dst in enumerate(key_nodes):
        if dst in descendants:
            dep_matrix[i, j] = 1

# Also mark direct edges with weight 2
for e in edges_data:
    if e['src'] in key_nodes and e['dst'] in key_nodes:
        i = key_nodes.index(e['src'])
        j = key_nodes.index(e['dst'])
        dep_matrix[i, j] = 2  # direct edge = stronger

fig, ax = plt.subplots(figsize=(18, 14))
plt.style.use('dark_background')

cmap = LinearSegmentedColormap.from_list('atlas_dep', ['#0d1117', '#1a3a5c', '#e67e22'])
im = ax.imshow(dep_matrix, cmap=cmap, aspect='auto', vmin=0, vmax=2)

# Labels
short_labels = {
    'MP-008': 'MP-008\nEdge', 'MP-001': 'MP-001\nRegime', 'MP-003': 'MP-003\nSession',
    'MP-004': 'MP-004\nVolComp', 'MP-002': 'MP-002\nADX', 'MP-005': 'MP-005\nStreaks',
    'MP-006': 'MP-006\nAnchor',
    'EC-EMA': 'EC-EMA', 'EC-ATR': 'EC-ATR', 'EC-ADX': 'EC-ADX', 'EC-VOLC': 'EC-VOLC',
    'EC-SESS': 'EC-SESS', 'EC-STRUC': 'EC-STRUC', 'EC-BCS': 'EC-BCS',
    'MODEL-A1': 'A1', 'MODEL-A2': 'A2', 'MODEL-A3': 'A3',
    'ARI-A': 'ARI-A', 'ARI-C': 'ARI-C', 'ARI-D': 'ARI-D', 'ARI-PQ': 'ARI-PQ',
    'PORT-MC': 'PORT-MC', 'PORT-DLM': 'PORT-DLM', 'ATS-V2': 'ATS-V2',
}
labels = [short_labels.get(n, n) for n in key_nodes]

ax.set_xticks(range(n_nodes))
ax.set_yticks(range(n_nodes))
ax.set_xticklabels(labels, fontsize=7, color='white', rotation=45, ha='right')
ax.set_yticklabels(labels, fontsize=7, color='white')
ax.set_title('Atlas Knowledge Dependency Heatmap\n(Row depends on Column — Orange=direct, Blue=transitive)',
             fontsize=12, fontweight='bold', color='white')

# Dividers between layers
layer_boundaries = [7, 14, 17, 21, 23]  # after MP-006, EC-BCS, MODEL-A3, ARI-PQ, PORT-DLM
for b in layer_boundaries:
    ax.axhline(y=b - 0.5, color='#7f8c8d', linewidth=1.5, alpha=0.7)
    ax.axvline(x=b - 0.5, color='#7f8c8d', linewidth=1.5, alpha=0.7)

# Layer labels on left
layer_group_labels = [
    (3.0, 'L1+L2\nPrinciples'),
    (10.5, 'L3\nComponents'),
    (15.5, 'L4\nModels'),
    (19.0, 'L5\nARI'),
    (22.0, 'L6\nPortfolio'),
    (23.5, 'L7\nATS'),
]
for y, label in layer_group_labels:
    ax.text(-1.8, y, label, va='center', ha='right', fontsize=7, color='#7f8c8d', style='italic')

plt.colorbar(im, ax=ax, label='0=no dependency, 1=transitive, 2=direct', shrink=0.6)
plt.tight_layout()
plt.savefig(f'{CHARTS_DIR}/sprint055_dependency_heatmap.png', dpi=150, bbox_inches='tight',
            facecolor='#0d1117')
plt.close()
print(f"  Saved: sprint055_dependency_heatmap.png")


# ─── VISUALISATION 4: Knowledge Collapse Analysis ────────────────────────────
print("Generating Knowledge Collapse Analysis...")

# For each principle, show what fraction of the total system is affected
total_nodes = G.number_of_nodes()
collapse_data = []
for pid in ['MP-008', 'MP-001', 'MP-003', 'MP-004', 'MP-002', 'MP-005', 'MP-006']:
    try:
        desc = nx.descendants(G, pid)
    except:
        desc = set()
    n_affected = len(desc)
    pct = n_affected / total_nodes * 100
    # Count by type
    type_counts = {}
    for d in desc:
        t = nodes_data[d]['type']
        type_counts[t] = type_counts.get(t, 0) + 1
    collapse_data.append({
        'id': pid, 'n_affected': n_affected, 'pct': pct, 'type_counts': type_counts
    })

collapse_data.sort(key=lambda x: x['n_affected'], reverse=True)

fig, axes = plt.subplots(1, 2, figsize=(18, 8))
plt.style.use('dark_background')
fig.suptitle('Atlas Knowledge Collapse Analysis\n(If this principle disappears, what else disappears?)',
             fontsize=13, fontweight='bold', color='white')

# Left: stacked bar chart of affected nodes by type
ax = axes[0]
type_order = ['principle_l3', 'principle_l2', 'principle_l1', 'component', 'model',
              'ari_rule', 'portfolio', 'system', 'observatory']
type_short = {
    'principle_l3': 'L3 Principles', 'principle_l2': 'L2 Principles',
    'principle_l1': 'L1 Findings', 'component': 'Components', 'model': 'Models',
    'ari_rule': 'ARI Rules', 'portfolio': 'Portfolio Rules', 'system': 'System',
    'observatory': 'Observatory'
}
type_bar_colors = {
    'principle_l3': '#e67e22', 'principle_l2': '#f39c12', 'principle_l1': '#f1c40f',
    'component': '#3498db', 'model': '#2ecc71', 'ari_rule': '#9b59b6',
    'portfolio': '#1abc9c', 'system': '#e74c3c', 'observatory': '#95a5a6'
}

ids = [d['id'] for d in collapse_data]
bottoms = np.zeros(len(ids))
for t in type_order:
    vals = [d['type_counts'].get(t, 0) for d in collapse_data]
    if sum(vals) == 0: continue
    ax.bar(ids, vals, bottom=bottoms, color=type_bar_colors[t], alpha=0.85,
           label=type_short[t], edgecolor='#0d1117', linewidth=0.5)
    bottoms += np.array(vals)

for i, d in enumerate(collapse_data):
    ax.text(i, d['n_affected'] + 0.3, f"{d['n_affected']}\n({d['pct']:.0f}%)",
            ha='center', va='bottom', fontsize=8, fontweight='bold', color='white')

ax.set_ylabel('Number of Nodes Affected', fontsize=10, color='white')
ax.set_title('Nodes Affected by Principle Removal', fontsize=11, fontweight='bold', color='white')
ax.legend(fontsize=7, loc='upper right')
ax.tick_params(colors='white')

# Right: PKI vs PAS scatter with CAS contours
ax2 = axes[1]
df_m = pd.DataFrame(matrix_data).dropna(subset=['pki', 'pas', 'cas'])
scatter = ax2.scatter(df_m['pki'], df_m['pas'], c=df_m['cas'],
                      cmap='RdYlGn', s=300, alpha=0.85, edgecolors='white', linewidth=1.5,
                      vmin=40, vmax=80, zorder=5)
for _, row in df_m.iterrows():
    ax2.annotate(row['id'], (row['pki'], row['pas']),
                 textcoords='offset points', xytext=(8, 4),
                 fontsize=9, color='white', fontweight='bold')

# CAS iso-lines
x_range = np.linspace(20, 90, 200)
for cas_target in [50, 60, 70]:
    # CAS = (PCS * PAS * PKI)^(1/3) → PAS = CAS^3 / (PCS * PKI)
    # Approximate PCS as mean of principles
    mean_pcs = df_m['pcs'].mean()
    y_iso = (cas_target ** 3) / (mean_pcs * x_range)
    mask = (y_iso > 0) & (y_iso < 100)
    ax2.plot(x_range[mask], y_iso[mask], '--', color='#95a5a6', alpha=0.4, linewidth=1)
    if mask.any():
        idx = np.where(mask)[0][-1]
        ax2.text(x_range[idx], y_iso[idx], f'CAS={cas_target}',
                 fontsize=7, color='#95a5a6', alpha=0.6)

plt.colorbar(scatter, ax=ax2, label='Composite Atlas Score (CAS)')
ax2.set_xlabel('Principle Knowledge Influence (PKI)', fontsize=10, color='white')
ax2.set_ylabel('Principle Attribution Score (PAS)', fontsize=10, color='white')
ax2.set_title('PKI vs PAS\n(Colour = Composite Atlas Score)', fontsize=11, fontweight='bold', color='white')
ax2.tick_params(colors='white')

plt.tight_layout()
plt.savefig(f'{CHARTS_DIR}/sprint055_knowledge_collapse.png', dpi=150, bbox_inches='tight',
            facecolor='#1a1a2e')
plt.close()
print(f"  Saved: sprint055_knowledge_collapse.png")

print("\n=== ALL VISUALISATIONS COMPLETE ===")
