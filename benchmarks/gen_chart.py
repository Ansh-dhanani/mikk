import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import numpy as np

# ── Data ──────────────────────────────────────────────────────────────────────
scenarios = [
    'Boundary\nViolations',
    'Blast Radius\nCheck',
    'Session\nStart',
]

without = [820,  780,  3966]
with_   = [18,   312,   420]
savings = ['97.8%', '60%', '89.4%']

x = np.arange(len(scenarios))
bar_w = 0.35

# ── Figure ────────────────────────────────────────────────────────────────────
fig, ax = plt.subplots(figsize=(10, 6))
fig.patch.set_facecolor('white')
ax.set_facecolor('white')

# ── Bars ──────────────────────────────────────────────────────────────────────
COLOR_WITHOUT = '#e74c3c'
COLOR_WITH    = '#2ecc71'

bars_w = ax.bar(x - bar_w/2, without, bar_w, color=COLOR_WITHOUT,
                label='Without Mikk', zorder=3)
bars_m = ax.bar(x + bar_w/2, with_,   bar_w, color=COLOR_WITH,
                label='With Mikk',    zorder=3)

# ── Value labels on bars ──────────────────────────────────────────────────────
for bar in bars_w:
    h = bar.get_height()
    ax.text(bar.get_x() + bar.get_width()/2, h + 30,
            f'~{h:,.0f}', ha='center', va='bottom',
            fontsize=10, color='#333333', fontweight='500')

for bar in bars_m:
    h = bar.get_height()
    ax.text(bar.get_x() + bar.get_width()/2, h + 30,
            f'~{h:,.0f}', ha='center', va='bottom',
            fontsize=10, color='#333333', fontweight='500')

# ── Savings badges above each group ──────────────────────────────────────────
for i, (wo, wi, sv) in enumerate(zip(without, with_, savings)):
    top = max(wo, wi) + 160
    ax.text(i, top, f'saved {sv}', ha='center', va='bottom',
            fontsize=11, fontweight='700', color='#155724',
            bbox=dict(boxstyle='round,pad=0.3', facecolor='#d4edda',
                      edgecolor='#b8dacc', linewidth=1))

# ── Grid & spines ─────────────────────────────────────────────────────────────
ax.yaxis.grid(True, linestyle='--', linewidth=0.6, color='#e0e0e0', zorder=0)
ax.set_axisbelow(True)
for spine in ['top', 'right', 'left']:
    ax.spines[spine].set_visible(False)
ax.spines['bottom'].set_color('#cccccc')
ax.tick_params(axis='both', colors='#555555')

# ── Labels ────────────────────────────────────────────────────────────────────
ax.set_xticks(x)
ax.set_xticklabels(scenarios, fontsize=12, color='#333333')
ax.set_ylabel('Tokens used', fontsize=11, color='#555555', labelpad=10)
ax.set_ylim(0, max(without) * 1.35)

# format y-axis with commas
ax.yaxis.set_major_formatter(
    matplotlib.ticker.FuncFormatter(lambda v, _: f'{int(v):,}'))

# ── Title ─────────────────────────────────────────────────────────────────────
ax.set_title('Token Usage: With Mikk vs Without',
             fontsize=15, fontweight='700', color='#111111', pad=20)

# ── Legend ────────────────────────────────────────────────────────────────────
legend = ax.legend(handles=[
    mpatches.Patch(color=COLOR_WITHOUT, label='Without Mikk'),
    mpatches.Patch(color=COLOR_WITH,    label='With Mikk (MCP)'),
], fontsize=11, frameon=False, loc='upper right')

# ── Footnote ──────────────────────────────────────────────────────────────────
fig.text(0.5, 0.01,
         'Measured on ts-express-api  ·  47 functions / 17 files / 7 modules  ·  $15/M tokens',
         ha='center', fontsize=9, color='#999999')

plt.tight_layout(rect=[0, 0.04, 1, 1])
plt.savefig(r'C:\Users\Ansh\Desktop\web\Mesh\assets\benchmark.png',
            dpi=180, bbox_inches='tight', facecolor='white')
print('saved: assets/benchmark.png')
