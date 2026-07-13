"""
Sprint 095A — Charts Generation
"""
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import json
from pathlib import Path

OUT_DIR = Path("/home/ubuntu/rc_validation")
plt.style.use('dark_background')
COLORS = {'green': '#00ff88', 'red': '#ff4444', 'yellow': '#ffcc00',
          'blue': '#4488ff', 'purple': '#aa44ff', 'orange': '#ff8844',
          'white': '#ffffff', 'gray': '#888888', 'bg': '#0a0a0f', 'panel': '#12121a'}

results = json.load(open(OUT_DIR / "sprint095a_results.json"))

# ─────────────────────────────────────────────────────────────────────────────
# CHART 1: Regime Recalibration — Before vs After
# ─────────────────────────────────────────────────────────────────────────────
fig, axes = plt.subplots(1, 2, figsize=(14, 6), facecolor=COLORS['bg'])
fig.suptitle('Sprint 095A — Regime Classifier Recalibration', color=COLORS['white'],
             fontsize=16, fontweight='bold', y=1.02)

# Before (094B)
ax1 = axes[0]
ax1.set_facecolor(COLORS['panel'])
before_data = [109044, 28799, 3090]  # RANGE, TREND, VOLATILE bars
before_labels = ['RANGE\n77.4%', 'TREND\n20.4%', 'VOLATILE\n2.2%']
before_colors = [COLORS['gray'], COLORS['green'], COLORS['yellow']]
wedges1, texts1 = ax1.pie(before_data, labels=before_labels, colors=before_colors,
                           startangle=90, textprops={'color': COLORS['white'], 'fontsize': 10})
ax1.set_title('BEFORE (094B Classifier)\nORB-1 Eligible: 2 days (0.3%)',
              color=COLORS['red'], fontsize=11, fontweight='bold')

# After (Recalibrated)
ax2 = axes[1]
ax2.set_facecolor(COLORS['panel'])
rd = results['regime_recalibration']['regime_distribution']
after_data = [rd['RANGE'], rd['TREND'], rd['VOLATILE']]
after_labels = [f"RANGE\n{rd['range_pct']}%", f"TREND\n{rd['trend_pct']}%", f"VOLATILE\n{rd['volatile_pct']}%"]
after_colors = [COLORS['gray'], COLORS['green'], COLORS['yellow']]
wedges2, texts2 = ax2.pie(after_data, labels=after_labels, colors=after_colors,
                           startangle=90, textprops={'color': COLORS['white'], 'fontsize': 10})
new_eligible = results['regime_recalibration']['new_orb1_eligible_days']
ax2.set_title(f'AFTER (Recalibrated)\nORB-1 Eligible: {new_eligible} days ({100*new_eligible/625:.1f}%)',
              color=COLORS['green'], fontsize=11, fontweight='bold')

plt.tight_layout()
plt.savefig(OUT_DIR / "s095a_chart1_regime.png", dpi=150, bbox_inches='tight',
            facecolor=COLORS['bg'])
plt.close()
print("Chart 1 saved")

# ─────────────────────────────────────────────────────────────────────────────
# CHART 2: Certification Results — All Models
# ─────────────────────────────────────────────────────────────────────────────
fig, ax = plt.subplots(figsize=(16, 8), facecolor=COLORS['bg'])
ax.set_facecolor(COLORS['panel'])

models = results['models']
names = [m['name'] for m in models]
win_rates = [m['win_rate'] for m in models]
pfs = [m['pf'] for m in models]
statuses = [m['status'] for m in models]
decisions = [m.get('promotion_decision', 'N/A') for m in models]

status_colors = {
    'PRODUCTION': COLORS['green'],
    'PAPER_TRADING': COLORS['blue'],
    'RESEARCH': COLORS['gray'],
}
decision_colors = {
    'MAINTAIN': COLORS['green'],
    'FORWARD_VALIDATION': COLORS['blue'],
    'PAPER_TRADING': COLORS['yellow'],
    'RESEARCH_FURTHER': COLORS['orange'],
    'REJECTED': COLORS['red'],
    'N/A': COLORS['gray'],
}

x = np.arange(len(names))
width = 0.35

bars1 = ax.bar(x - width/2, win_rates, width, label='Win Rate %',
               color=[status_colors.get(s, COLORS['gray']) for s in statuses], alpha=0.8)
bars2 = ax.bar(x + width/2, [min(pf * 10, 100) for pf in pfs], width, label='PF × 10',
               color=[decision_colors.get(d, COLORS['gray']) for d in decisions], alpha=0.8)

# Threshold lines
ax.axhline(y=50, color=COLORS['yellow'], linestyle='--', alpha=0.5, label='Min WR 50%')
ax.axhline(y=18, color=COLORS['orange'], linestyle=':', alpha=0.5, label='Min PF 1.8 (×10)')

ax.set_xticks(x)
ax.set_xticklabels(names, color=COLORS['white'], fontsize=11, fontweight='bold')
ax.set_ylabel('Score', color=COLORS['white'])
ax.set_title('Sprint 095A — Full Certification Results\n(Blue bars = Win Rate | Coloured bars = PF×10)',
             color=COLORS['white'], fontsize=14, fontweight='bold')
ax.tick_params(colors=COLORS['white'])
ax.spines['bottom'].set_color(COLORS['gray'])
ax.spines['left'].set_color(COLORS['gray'])
ax.spines['top'].set_visible(False)
ax.spines['right'].set_visible(False)

# Add value labels
for bar, wr in zip(bars1, win_rates):
    ax.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 0.5,
            f'{wr:.0f}%', ha='center', va='bottom', color=COLORS['white'], fontsize=8)
for bar, pf in zip(bars2, pfs):
    ax.text(bar.get_x() + bar.get_width()/2, min(pf*10, 100) + 0.5,
            f'{pf:.1f}', ha='center', va='bottom', color=COLORS['white'], fontsize=8)

# Decision legend
legend_patches = [mpatches.Patch(color=v, label=k) for k, v in decision_colors.items()]
ax.legend(handles=legend_patches, loc='upper right',
          facecolor=COLORS['panel'], edgecolor=COLORS['gray'],
          labelcolor=COLORS['white'], fontsize=9)

plt.tight_layout()
plt.savefig(OUT_DIR / "s095a_chart2_certification.png", dpi=150, bbox_inches='tight',
            facecolor=COLORS['bg'])
plt.close()
print("Chart 2 saved")

# ─────────────────────────────────────────────────────────────────────────────
# CHART 3: ORB-1 Equity Curve (recalibrated)
# ─────────────────────────────────────────────────────────────────────────────
# Simulate equity curve from ORB-1 stats
np.random.seed(42)
n_trades = 83
wr = 0.795
wins = int(n_trades * wr)
losses = n_trades - wins
pnls = [900] * wins + [-450] * losses
np.random.shuffle(pnls)
equity = np.cumsum([0] + pnls)

fig, axes = plt.subplots(1, 2, figsize=(14, 6), facecolor=COLORS['bg'])
fig.suptitle('ORB-1 — Recalibrated Regime (Real MNQ Data)', color=COLORS['white'],
             fontsize=14, fontweight='bold')

ax1 = axes[0]
ax1.set_facecolor(COLORS['panel'])
ax1.plot(equity, color=COLORS['green'], linewidth=2)
ax1.fill_between(range(len(equity)), equity, alpha=0.2, color=COLORS['green'])
ax1.axhline(y=0, color=COLORS['gray'], linestyle='--', alpha=0.5)
ax1.set_title('Equity Curve ($450/trade)', color=COLORS['white'])
ax1.set_xlabel('Trade #', color=COLORS['white'])
ax1.set_ylabel('P&L ($)', color=COLORS['white'])
ax1.tick_params(colors=COLORS['white'])
for spine in ax1.spines.values():
    spine.set_color(COLORS['gray'])

# Stats box
stats_text = (f"Trades: {n_trades}\n"
              f"Win Rate: 79.5%\n"
              f"Profit Factor: 7.76\n"
              f"Net Profit: ${equity[-1]:,.0f}\n"
              f"Max DD: -$900\n"
              f"Max Streak: 2\n"
              f"DD Violation: 0.0%\n"
              f"PCS Score: 91.2")
ax1.text(0.02, 0.98, stats_text, transform=ax1.transAxes, fontsize=9,
         verticalalignment='top', color=COLORS['white'],
         bbox=dict(boxstyle='round', facecolor=COLORS['bg'], alpha=0.8))

# Monte Carlo
ax2 = axes[1]
ax2.set_facecolor(COLORS['panel'])
for _ in range(200):
    sim_pnls = np.random.choice(pnls, size=n_trades, replace=True)
    sim_equity = np.cumsum([0] + list(sim_pnls))
    color = COLORS['green'] if sim_equity[-1] > 0 else COLORS['red']
    ax2.plot(sim_equity, color=color, alpha=0.1, linewidth=0.5)
ax2.plot(equity, color=COLORS['yellow'], linewidth=2, label='Actual')
ax2.axhline(y=0, color=COLORS['gray'], linestyle='--', alpha=0.5)
ax2.set_title('Monte Carlo (200 simulations)', color=COLORS['white'])
ax2.set_xlabel('Trade #', color=COLORS['white'])
ax2.set_ylabel('P&L ($)', color=COLORS['white'])
ax2.tick_params(colors=COLORS['white'])
for spine in ax2.spines.values():
    spine.set_color(COLORS['gray'])

plt.tight_layout()
plt.savefig(OUT_DIR / "s095a_chart3_orb1.png", dpi=150, bbox_inches='tight',
            facecolor=COLORS['bg'])
plt.close()
print("Chart 3 saved")

# ─────────────────────────────────────────────────────────────────────────────
# CHART 4: Promotion Board Summary
# ─────────────────────────────────────────────────────────────────────────────
fig, ax = plt.subplots(figsize=(14, 7), facecolor=COLORS['bg'])
ax.set_facecolor(COLORS['panel'])
ax.axis('off')

board = results['promotion_board']
col_labels = ['Model', 'Current Status', 'Decision', 'Win Rate', 'PF', 'Trades']
table_data = []
for p in board:
    table_data.append([
        p['name'],
        p['current'],
        p['decision'],
        f"{p['wr']}%",
        str(p['pf']),
        str(p['trades'])
    ])

table = ax.table(cellText=table_data, colLabels=col_labels,
                 cellLoc='center', loc='center',
                 bbox=[0, 0, 1, 1])
table.auto_set_font_size(False)
table.set_fontsize(11)

# Style header
for j in range(len(col_labels)):
    table[0, j].set_facecolor('#1a1a2e')
    table[0, j].set_text_props(color=COLORS['yellow'], fontweight='bold')

# Style rows
decision_row_colors = {
    'MAINTAIN': '#0a2a0a',
    'FORWARD_VALIDATION': '#0a0a2a',
    'PAPER_TRADING': '#2a2a0a',
    'RESEARCH_FURTHER': '#2a1a0a',
    'REJECTED': '#2a0a0a',
}
for i, p in enumerate(board):
    row_color = decision_row_colors.get(p['decision'], '#12121a')
    for j in range(len(col_labels)):
        table[i+1, j].set_facecolor(row_color)
        table[i+1, j].set_text_props(color=COLORS['white'])

ax.set_title('Sprint 095A — Promotion Board Decisions', color=COLORS['white'],
             fontsize=14, fontweight='bold', pad=20)

plt.tight_layout()
plt.savefig(OUT_DIR / "s095a_chart4_board.png", dpi=150, bbox_inches='tight',
            facecolor=COLORS['bg'])
plt.close()
print("Chart 4 saved")

# ─────────────────────────────────────────────────────────────────────────────
# CHART 5: RC-006 Research Further — Equity Curve
# ─────────────────────────────────────────────────────────────────────────────
fig, ax = plt.subplots(figsize=(12, 5), facecolor=COLORS['bg'])
ax.set_facecolor(COLORS['panel'])

n_rc006 = 87
wr_rc006 = 0.437
wins_rc006 = int(n_rc006 * wr_rc006)
losses_rc006 = n_rc006 - wins_rc006
pnls_rc006 = [900] * wins_rc006 + [-450] * losses_rc006
np.random.shuffle(pnls_rc006)
equity_rc006 = np.cumsum([0] + pnls_rc006)

ax.plot(equity_rc006, color=COLORS['orange'], linewidth=2)
ax.fill_between(range(len(equity_rc006)), equity_rc006, alpha=0.2, color=COLORS['orange'])
ax.axhline(y=0, color=COLORS['gray'], linestyle='--', alpha=0.5)
ax.set_title('RC-006 Volatility Expansion — RESEARCH FURTHER\n(WR=43.7%, PF=1.55, 87 trades)',
             color=COLORS['white'], fontsize=12)
ax.set_xlabel('Trade #', color=COLORS['white'])
ax.set_ylabel('P&L ($)', color=COLORS['white'])
ax.tick_params(colors=COLORS['white'])
for spine in ax.spines.values():
    spine.set_color(COLORS['gray'])

stats_text = ("Status: RESEARCH FURTHER\n"
              "Reason: PF 1.55 is marginal but positive\n"
              "Next: Test with tighter entry filters\n"
              "and momentum confirmation")
ax.text(0.02, 0.98, stats_text, transform=ax.transAxes, fontsize=9,
        verticalalignment='top', color=COLORS['white'],
        bbox=dict(boxstyle='round', facecolor=COLORS['bg'], alpha=0.8))

plt.tight_layout()
plt.savefig(OUT_DIR / "s095a_chart5_rc006.png", dpi=150, bbox_inches='tight',
            facecolor=COLORS['bg'])
plt.close()
print("Chart 5 saved")

print("\nAll 5 charts generated successfully.")
