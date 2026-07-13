"""Sprint 094B — Charts and Foundational Report generation"""
import json
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import numpy as np
import pandas as pd
from datetime import datetime

OUTPUT_DIR = '/home/ubuntu/rc_validation'
plt.style.use('dark_background')
COLORS = {'TREND': '#00d4aa', 'RANGE': '#ff6b6b', 'VOLATILE': '#ffd93d',
          'covered': '#00d4aa', 'gap': '#ff6b6b', 'neutral': '#4a9eff'}

with open(f'{OUTPUT_DIR}/sprint094b_knowledge_base.json') as f:
    data = json.load(f)

# ─── Chart 1: Regime Distribution ────────────────────────────────────────────
fig, axes = plt.subplots(1, 3, figsize=(18, 6))
fig.patch.set_facecolor('#0d1117')
fig.suptitle('ATLAS FOUNDATIONAL KNOWLEDGE — 2-YEAR REAL MNQ ANALYSIS\n140,933 Bars | Jul 2024 – Jul 2026 | Massive/Polygon.io',
             color='white', fontsize=14, fontweight='bold', y=1.02)

# Regime pie
ax = axes[0]
ax.set_facecolor('#161b22')
rd = data['regime_distribution']
sizes = [rd['TREND_pct'], rd['RANGE_pct'], rd['VOLATILE_pct']]
labels = [f"TREND\n{rd['TREND_pct']}%", f"RANGE\n{rd['RANGE_pct']}%", f"VOLATILE\n{rd['VOLATILE_pct']}%"]
colors = [COLORS['TREND'], COLORS['RANGE'], COLORS['VOLATILE']]
wedges, texts = ax.pie(sizes, labels=labels, colors=colors, startangle=90,
                        textprops={'color': 'white', 'fontsize': 11})
ax.set_title('Market Regime Distribution\n(140,933 bars)', color='white', fontsize=12, pad=10)

# Session distribution
ax = axes[1]
ax.set_facecolor('#161b22')
sd = data['session_distribution']
sessions = list(sd.keys())
counts = [sd[s] for s in sessions]
sess_colors = ['#00d4aa', '#4a9eff', '#ffd93d', '#ff6b6b'][:len(sessions)]
bars = ax.bar(sessions, counts, color=sess_colors, alpha=0.85, edgecolor='none')
for bar, count in zip(bars, counts):
    ax.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 500,
            f'{count:,}', ha='center', va='bottom', color='white', fontsize=9)
ax.set_title('Session Distribution\n(bars per session)', color='white', fontsize=12)
ax.set_ylabel('Bars', color='#8b949e')
ax.tick_params(colors='#8b949e')
ax.spines['bottom'].set_color('#30363d')
ax.spines['left'].set_color('#30363d')
ax.spines['top'].set_visible(False)
ax.spines['right'].set_visible(False)

# Portfolio health gauge
ax = axes[2]
ax.set_facecolor('#161b22')
health = data['portfolio_health']
projected = data['projected_portfolio_health_if_rc002_certified']
categories = ['Current\nHealth', 'If RC-002\nCertified', 'Target\n(100)']
values = [health, projected, 100]
bar_colors = ['#4a9eff', '#00d4aa', '#30363d']
bars = ax.bar(categories, values, color=bar_colors, alpha=0.85, edgecolor='none', width=0.5)
for bar, val in zip(bars, values):
    ax.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 0.5,
            f'{val:.1f}', ha='center', va='bottom', color='white', fontsize=12, fontweight='bold')
ax.set_ylim(0, 115)
ax.set_title('Portfolio Health Score', color='white', fontsize=12)
ax.set_ylabel('Score /100', color='#8b949e')
ax.tick_params(colors='#8b949e')
ax.spines['bottom'].set_color('#30363d')
ax.spines['left'].set_color('#30363d')
ax.spines['top'].set_visible(False)
ax.spines['right'].set_visible(False)

plt.tight_layout()
plt.savefig(f'{OUTPUT_DIR}/s094b_chart1_overview.png', dpi=150, bbox_inches='tight',
            facecolor='#0d1117')
plt.close()
print("  Chart 1 saved: s094b_chart1_overview.png")

# ─── Chart 2: Research Candidates ────────────────────────────────────────────
fig, axes = plt.subplots(1, 2, figsize=(16, 7))
fig.patch.set_facecolor('#0d1117')
fig.suptitle('DARWIN RESEARCH CANDIDATES — RANKED BY PORTFOLIO VALUE',
             color='white', fontsize=13, fontweight='bold')

candidates = data['research_candidates']
names = [c['id'] + '\n' + c['name'].split('—')[0].strip() for c in candidates]
win_rates = [c['win_rate'] * 100 for c in candidates]
pfs = [c['profit_factor'] for c in candidates]
pcs = [c['pcs_estimate'] for c in candidates]
occurrences = [c['occurrences'] for c in candidates]
priorities = [c['research_priority'] for c in candidates]

# Win rate and PF
ax = axes[0]
ax.set_facecolor('#161b22')
x = np.arange(len(names))
w = 0.35
b1 = ax.bar(x - w/2, win_rates, w, label='Win Rate %', color='#00d4aa', alpha=0.85)
b2 = ax.bar(x + w/2, [pf * 10 for pf in pfs], w, label='PF × 10', color='#4a9eff', alpha=0.85)
ax.set_xticks(x)
ax.set_xticklabels(names, color='white', fontsize=8)
ax.set_ylabel('Value', color='#8b949e')
ax.set_title('Win Rate & Profit Factor', color='white', fontsize=11)
ax.legend(facecolor='#161b22', edgecolor='#30363d', labelcolor='white', fontsize=9)
ax.tick_params(colors='#8b949e')
for spine in ['top', 'right']:
    ax.spines[spine].set_visible(False)
for spine in ['bottom', 'left']:
    ax.spines[spine].set_color('#30363d')

# PCS and occurrence count
ax = axes[1]
ax.set_facecolor('#161b22')
scatter = ax.scatter(occurrences, pcs, c=priorities, cmap='RdYlGn_r',
                     s=200, zorder=5, edgecolors='white', linewidth=0.5)
for i, c in enumerate(candidates):
    ax.annotate(c['id'], (occurrences[i], pcs[i]),
                textcoords='offset points', xytext=(8, 4),
                color='white', fontsize=9)
cbar = plt.colorbar(scatter, ax=ax)
cbar.set_label('Research Priority (1=highest)', color='#8b949e', fontsize=9)
cbar.ax.yaxis.set_tick_params(color='#8b949e')
plt.setp(cbar.ax.yaxis.get_ticklabels(), color='#8b949e')
ax.set_xlabel('Historical Occurrences', color='#8b949e')
ax.set_ylabel('PCS Estimate', color='#8b949e')
ax.set_title('Portfolio Contribution Score vs Evidence', color='white', fontsize=11)
ax.tick_params(colors='#8b949e')
for spine in ['top', 'right']:
    ax.spines[spine].set_visible(False)
for spine in ['bottom', 'left']:
    ax.spines[spine].set_color('#30363d')

plt.tight_layout()
plt.savefig(f'{OUTPUT_DIR}/s094b_chart2_candidates.png', dpi=150, bbox_inches='tight',
            facecolor='#0d1117')
plt.close()
print("  Chart 2 saved: s094b_chart2_candidates.png")

# ─── Chart 3: Behaviour Coverage Map ─────────────────────────────────────────
fig, ax = plt.subplots(figsize=(14, 8))
fig.patch.set_facecolor('#0d1117')
ax.set_facecolor('#161b22')

taxonomy = data['behaviour_taxonomy']
y_pos = np.arange(len(taxonomy))
bar_colors = [COLORS['covered'] if t['covered'] else COLORS['gap'] for t in taxonomy]
bar_widths = [0.85 if t['covered'] else 0.55 for t in taxonomy]
bars = ax.barh(y_pos, [1] * len(taxonomy), color=bar_colors, alpha=0.8, height=0.7)
for i, t in enumerate(taxonomy):
    status = '✓ COVERED' if t['covered'] else '⚠ GAP'
    ax.text(0.02, i, f"{t['behaviour']}", va='center', color='white', fontsize=10, fontweight='bold')
    ax.text(0.55, i, t['model'], va='center', color='#8b949e', fontsize=9)
    color = COLORS['covered'] if t['covered'] else COLORS['gap']
    ax.text(0.97, i, status, va='center', ha='right', color=color, fontsize=9, fontweight='bold')

ax.set_yticks([])
ax.set_xticks([])
ax.set_xlim(0, 1)
ax.set_title(f'ATLAS BEHAVIOUR COVERAGE MAP — {data["behaviour_coverage_pct"]}% Covered ({sum(1 for t in taxonomy if t["covered"])}/{len(taxonomy)} behaviours)',
             color='white', fontsize=12, fontweight='bold', pad=15)
covered_patch = mpatches.Patch(color=COLORS['covered'], label='Covered by production model')
gap_patch = mpatches.Patch(color=COLORS['gap'], label='Gap — no active model')
ax.legend(handles=[covered_patch, gap_patch], loc='lower right',
          facecolor='#161b22', edgecolor='#30363d', labelcolor='white')
for spine in ax.spines.values():
    spine.set_color('#30363d')

plt.tight_layout()
plt.savefig(f'{OUTPUT_DIR}/s094b_chart3_coverage.png', dpi=150, bbox_inches='tight',
            facecolor='#0d1117')
plt.close()
print("  Chart 3 saved: s094b_chart3_coverage.png")

# ─── Chart 4: Research Roadmap ────────────────────────────────────────────────
fig, ax = plt.subplots(figsize=(14, 6))
fig.patch.set_facecolor('#0d1117')
ax.set_facecolor('#161b22')

roadmap = data['research_roadmap']
y_pos = np.arange(len(roadmap))
priority_colors = ['#00d4aa', '#4a9eff', '#ffd93d', '#ff9f43', '#ff6b6b', '#a29bfe']
bars = ax.barh(y_pos, [7 - r['priority'] for r in roadmap],
               color=priority_colors[:len(roadmap)], alpha=0.85, height=0.6)
for i, r in enumerate(roadmap):
    ax.text(0.1, i, f"P{r['priority']} — {r['candidate']}: {r['name']}", va='center',
            color='white', fontsize=10, fontweight='bold')
    ax.text(0.1, i - 0.25, r['rationale'], va='center', color='#8b949e', fontsize=8)

ax.set_yticks([])
ax.set_xticks([])
ax.set_title('DARWIN RESEARCH ROADMAP — Ranked by Expected Portfolio Value',
             color='white', fontsize=12, fontweight='bold', pad=15)
for spine in ax.spines.values():
    spine.set_color('#30363d')

plt.tight_layout()
plt.savefig(f'{OUTPUT_DIR}/s094b_chart4_roadmap.png', dpi=150, bbox_inches='tight',
            facecolor='#0d1117')
plt.close()
print("  Chart 4 saved: s094b_chart4_roadmap.png")

print("\nAll charts generated successfully.")
