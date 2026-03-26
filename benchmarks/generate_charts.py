"""
Mikk Benchmark Chart Generator
================================
Generates a full suite of professional benchmark images comparing Mikk vs
manual file-reading agent performance.

Usage:
    # Sample data (demo/README):
    python benchmarks/generate_charts.py --sample

    # From a real benchmark run:
    python benchmarks/generate_charts.py --input benchmarks/results/20260325_raw.json

    # Custom output dir:
    python benchmarks/generate_charts.py --sample --output assets/

Output:
    - Results are written to a timestamped folder, e.g.
        benchmarks/results/run_2026-03-26_18-42-11/
    - A 'latest' folder is also created for convenience:
        benchmarks/results/latest/

Charts produced:
    tokens.png        -- Context tokens loaded per task (bar comparison)
    latency.png       -- Wall-clock time per task
    accuracy.png      -- Accuracy per task (grouped bar + delta)
    overview.png      -- Headline 4-panel summary card
    radar.png         -- Multi-axis spider chart
    detail_strip.png  -- Per-task horizontal bar strip (all 3 metrics)
    roi.png           -- Big-number ROI callout card
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any

# ---- Set UTF-8 output on Windows so arrow/tick glyphs don't crash --------
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

# ---- Dependency guard -------------------------------------------------------
try:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    import matplotlib.patches as mpatches
    from matplotlib.gridspec import GridSpec
    from matplotlib.ticker import FuncFormatter
    import numpy as np
except ImportError:
    print("ERROR: matplotlib and numpy are required.\n  pip install matplotlib numpy")
    sys.exit(1)

# =============================================================================
# Design tokens
# =============================================================================
PALETTE = {
    "bg":           "#f5f5f5",   # light gray background
    "surface":      "#ffffff",   # chart card background
    "border":       "#dddddd",
    
    "text_primary": "#111111",   # dark text
    "text_muted":   "#555555",
    "text_dim":     "#888888",

    "mikk":         "#59a89c",   # teal (matches your image)
    "mikk_light":   "#76b7b2",

    "manual":       "#e45756",   # soft red
    "manual_light": "#f28e8c",

    "gold":         "#f2cf5b",
    "blue":         "#4c78a8",
    "purple":       "#b279a2",

    "grid":         "#e0e0e0",
}

DPI = 150
FIGSIZE = {
    "tokens":       (14, 7),
    "latency":      (14, 7),
    "accuracy":     (14, 7),
    "overview":     (18, 10),
    "radar":        (12, 10),
    "detail_strip": (16, 7),
    "roi":          (10, 5),
}

# =============================================================================
# Data model
# =============================================================================
@dataclass
class TaskResult:
    label: str
    task_id: str
    mikk_tokens: int
    manual_tokens: int
    gitnexus_tokens: int
    mikk_latency: float
    manual_latency: float
    gitnexus_latency: float
    mikk_accuracy: float
    manual_accuracy: float
    gitnexus_accuracy: float

    @property
    def token_reduction(self) -> float:
        return (1 - self.mikk_tokens / max(self.manual_tokens, 1)) * 100

    @property
    def latency_reduction(self) -> float:
        return (1 - self.mikk_latency / max(self.manual_latency, 0.001)) * 100

    @property
    def accuracy_gain(self) -> float:
        return self.mikk_accuracy - self.manual_accuracy


@dataclass
class BenchmarkData:
    project_name: str = "ts-express-api"
    function_count: int = 47
    file_count: int = 17
    module_count: int = 7
    run_date: str = ""
    tasks: list[TaskResult] = field(default_factory=list)

    @property
    def avg_token_reduction(self) -> float:
        return float(np.mean([t.token_reduction for t in self.tasks]))

    @property
    def avg_accuracy_gain(self) -> float:
        return float(np.mean([t.accuracy_gain for t in self.tasks]))

    @property
    def avg_latency_reduction(self) -> float:
        return float(np.mean([t.latency_reduction for t in self.tasks]))

    @property
    def avg_tokens(self) -> float:
        return float(np.mean([t.mikk_tokens for t in self.tasks]))

    @property
    def avg_latency(self) -> float:
        return float(np.mean([t.mikk_latency for t in self.tasks]))



# =============================================================================
# Load from real benchmark JSON
# =============================================================================
def load_from_json(path: str) -> BenchmarkData:
    with open(path) as f:
        raw: dict[str, Any] = json.load(f)

    meta = raw.get("meta", raw.get("meta", {}))
    fn_count  = meta.get("functions", meta.get("function_count", 0))
    file_count = meta.get("files",    meta.get("file_count",     0))
    mod_count  = meta.get("modules",  meta.get("module_count",   0))
    tasks = []
    for t in raw.get("tasks", []):
        tid = t.get("task_id", "unknown")
        mk  = t.get("mikk", {})
        gn  = t.get("gitnexus", t.get("manual", {}))
        mn  = t.get("manual", {})
        # Use the label from JSON if available (pipeline.ts sets it), else fall back
        lbl = t.get("label", tid).replace("\\n", "\n")
        tasks.append(TaskResult(
            label=lbl,
            task_id=tid,
            mikk_tokens=int(mk.get("tokens", 0)),
            manual_tokens=int(mn.get("tokens", 0)),
            gitnexus_tokens=int(gn.get("tokens", 0)),
            mikk_latency=float(mk.get("latency_s", 0)),
            manual_latency=float(mn.get("latency_s", 0)),
            gitnexus_latency=float(gn.get("latency_s", 0)),
            mikk_accuracy=float(mk.get("accuracy_pct", 0)),
            manual_accuracy=float(mn.get("accuracy_pct", 0)),
            gitnexus_accuracy=float(gn.get("accuracy_pct", 0)),
        ))

    return BenchmarkData(
        project_name=meta.get("project", "project"),
        function_count=fn_count,
        file_count=file_count,
        module_count=mod_count,
        run_date=meta.get("date", ""),
        tasks=tasks,
    )


# =============================================================================
# Shared style helpers
# =============================================================================
def apply_light_style(fig: plt.Figure, axes: list) -> None:
    fig.patch.set_facecolor(PALETTE["bg"])
    for ax in axes:
        ax.set_facecolor(PALETTE["surface"])
        ax.tick_params(colors=PALETTE["text_muted"], labelsize=9)

        ax.spines["bottom"].set_color(PALETTE["border"])
        ax.spines["left"].set_color(PALETTE["border"])
        ax.spines["top"].set_visible(False)
        ax.spines["right"].set_visible(False)

        ax.yaxis.grid(True, color=PALETTE["grid"], linewidth=1, linestyle="--")
        ax.set_axisbelow(True)

        for lbl in ax.get_xticklabels() + ax.get_yticklabels():
            lbl.set_color(PALETTE["text_primary"])

def subtitle(data: BenchmarkData) -> str:
    return (f"Real measurement on {data.project_name}  |  "
            f"{data.function_count} functions  |  "
            f"{data.file_count} files  |  "
            f"{data.module_count} modules")


def draw_connector(ax, x1, y1, x2, y2, color):
    ax.annotate(
        "", xy=(x2, y2), xytext=(x1, y1),
        arrowprops=dict(arrowstyle="-", color=color, lw=1.5),
    )


def save(fig, out_dir, name):
    path = out_dir / name
    fig.savefig(path, dpi=DPI, bbox_inches="tight",
                facecolor=fig.get_facecolor())
    plt.close(fig)
    print(f"  OK  {path}")
    return path


# =============================================================================
# Chart 1 -- Tokens
# =============================================================================
def chart_tokens(data: BenchmarkData, out_dir: Path) -> Path:
    fig, ax = plt.subplots(figsize=FIGSIZE["tokens"])
    apply_light_style(fig, [ax])

    tasks = data.tasks
    x = np.arange(len(tasks))
    w = 0.25  # Three bars now, so make them narrower

    bm = ax.bar(x - w, [t.manual_tokens for t in tasks], width=w,
                color=PALETTE["manual"], alpha=0.92, zorder=3,
                label="Without Mikk (manual file reading)")
    bg = ax.bar(x, [t.gitnexus_tokens for t in tasks], width=w,
               color=PALETTE["blue"], alpha=0.92, zorder=3,
               label="GitNexus (knowledge graph)")
    bk = ax.bar(x + w, [t.mikk_tokens   for t in tasks], width=w,
                color=PALETTE["mikk"],   alpha=0.92, zorder=3,
                label="With Mikk (MCP tool structured response)")

    y_max = max(max(t.manual_tokens for t in tasks), max(t.mikk_tokens for t in tasks), max(t.gitnexus_tokens for t in tasks))
    for i, t in enumerate(tasks):
        # Value labels
        ax.text(x[i] - w, t.manual_tokens + y_max*0.01,
                f"{t.manual_tokens:,}", ha="center", va="bottom",
                fontsize=7, fontweight="bold", color=PALETTE["text_primary"])
        ax.text(x[i], t.gitnexus_tokens + y_max*0.01,
                f"{t.gitnexus_tokens:,}", ha="center", va="bottom",
                fontsize=7, fontweight="bold", color=PALETTE["text_primary"])
        ax.text(x[i] + w, t.mikk_tokens + y_max*0.01,
                f"{t.mikk_tokens:,}", ha="center", va="bottom",
                fontsize=7, fontweight="bold", color=PALETTE["text_primary"])
        
        # Reduction labels (compare Mikk vs best of others)
        best_other = min(t.manual_tokens, t.gitnexus_tokens)
        if t.mikk_tokens < best_other:
            reduction_pct = (1 - t.mikk_tokens / best_other) * 100
            ax.text(x[i] + w, t.mikk_tokens + y_max*0.02,
                    f"-{reduction_pct:.0f}%",
                    va="center", ha="center", fontsize=8.5, fontweight="bold",
                    color=PALETTE["mikk_light"])

    ax.set_xticks(x)
    ax.set_xticklabels([t.label for t in tasks], fontsize=9,
                       color=PALETTE["text_muted"])
    ax.set_ylabel("Context Tokens Loaded", color=PALETTE["text_muted"], fontsize=10)
    ax.tick_params(axis="x", length=0)
    ax.legend(fontsize=9, framealpha=0.9, facecolor=PALETTE["surface"],
              edgecolor=PALETTE["border"], labelcolor=PALETTE["text_muted"],
              loc="upper right")
    ax.set_title(
        "Token Usage: Mikk vs GitNexus vs Manual\n" + subtitle(data),
        pad=12, fontsize=12, fontweight="bold", color=PALETTE["text_primary"],
    )

    fig.tight_layout()
    return save(fig, out_dir, "tokens.png")


# =============================================================================
# Chart 2 -- Latency
# =============================================================================
def chart_latency(data: BenchmarkData, out_dir: Path) -> Path:
    fig, ax = plt.subplots(figsize=FIGSIZE["latency"])
    apply_light_style(fig, [ax])

    tasks = data.tasks
    x = np.arange(len(tasks))
    w = 0.25  # Three bars now

    ax.bar(x - w, [t.manual_latency for t in tasks], width=w,
           color=PALETTE["manual"], alpha=0.92, zorder=3,
           label="Without Mikk (manual file reading)")
    ax.bar(x, [t.gitnexus_latency for t in tasks], width=w,
           color=PALETTE["blue"], alpha=0.92, zorder=3,
           label="GitNexus (knowledge graph)")
    ax.bar(x + w, [t.mikk_latency   for t in tasks], width=w,
           color=PALETTE["mikk"],   alpha=0.92, zorder=3,
           label="With Mikk (MCP tool structured response)")

    y_max = max(max(t.manual_latency for t in tasks), max(t.mikk_latency for t in tasks), max(t.gitnexus_latency for t in tasks))
    for i, t in enumerate(tasks):
        ax.text(x[i] - w, t.manual_latency + y_max*0.01,
                f"{t.manual_latency:.1f}s", ha="center", va="bottom",
                fontsize=7, fontweight="bold", color=PALETTE["text_primary"])
        ax.text(x[i], t.gitnexus_latency + y_max*0.01,
                f"{t.gitnexus_latency:.1f}s", ha="center", va="bottom",
                fontsize=7, fontweight="bold", color=PALETTE["text_primary"])
        ax.text(x[i] + w, t.mikk_latency + y_max*0.01,
                f"{t.mikk_latency:.1f}s", ha="center", va="bottom",
                fontsize=7, fontweight="bold", color=PALETTE["text_primary"])
        draw_connector(ax,
                       x[i] - w/2 + w/2, t.manual_latency,
                       x[i] + w/2 + w/2, t.mikk_latency,
                       PALETTE["mikk_light"])
        mid_y = (t.manual_latency + t.mikk_latency) / 2
        ax.text(x[i] + w/2 + 0.05, mid_y,
                f"-{t.latency_reduction:.0f}%",
                va="center", ha="left", fontsize=9.5, fontweight="bold",
                color=PALETTE["mikk_light"])

    ax.set_xticks(x)
    ax.set_xticklabels([t.label for t in tasks], fontsize=9,
                       color=PALETTE["text_muted"])
    ax.set_ylabel("Wall-clock Time (seconds)", color=PALETTE["text_muted"], fontsize=10)
    ax.tick_params(axis="x", length=0)
    ax.legend(fontsize=9, framealpha=0.9, facecolor=PALETTE["surface"],
              edgecolor=PALETTE["border"], labelcolor=PALETTE["text_muted"],
              loc="upper right")
    ax.set_title(
        "Response Latency: Mikk vs GitNexus vs Manual\n" + subtitle(data),
        pad=12, fontsize=12, fontweight="bold", color=PALETTE["text_primary"],
    )

    fig.tight_layout()
    return save(fig, out_dir, "latency.png")


# =============================================================================
# Chart 3 -- Accuracy
# =============================================================================
def chart_accuracy(data: BenchmarkData, out_dir: Path) -> Path:
    fig, ax = plt.subplots(figsize=FIGSIZE["accuracy"])
    apply_light_style(fig, [ax])

    tasks = data.tasks
    x = np.arange(len(tasks))
    w = 0.25  # Three bars now

    ax.bar(x - w, [t.manual_accuracy for t in tasks], width=w,
           color=PALETTE["manual"], alpha=0.92, zorder=3, 
           label="Without Mikk (manual file reading)")
    ax.bar(x, [t.gitnexus_accuracy for t in tasks], width=w,
           color=PALETTE["blue"], alpha=0.92, zorder=3,
           label="GitNexus (knowledge graph)")
    ax.bar(x + w, [t.mikk_accuracy   for t in tasks], width=w,
           color=PALETTE["mikk"],   alpha=0.92, zorder=3, 
           label="With Mikk (MCP tool structured response)")

    for i, t in enumerate(tasks):
        ax.text(x[i] - w, t.manual_accuracy + 1.5,
                f"{t.manual_accuracy:.0f}%", ha="center", va="bottom",
                fontsize=7, fontweight="bold", color=PALETTE["text_primary"])
        ax.text(x[i], t.gitnexus_accuracy + 1.5,
                f"{t.gitnexus_accuracy:.0f}%", ha="center", va="bottom",
                fontsize=7, fontweight="bold", color=PALETTE["text_primary"])
        ax.text(x[i] + w, t.mikk_accuracy + 1.5,
                f"{t.mikk_accuracy:.0f}%", ha="center", va="bottom",
                fontsize=7, fontweight="bold", color=PALETTE["text_primary"])
        
        # Show improvement over best alternative
        best_other = max(t.manual_accuracy, t.gitnexus_accuracy)
        if t.mikk_accuracy > best_other:
            gain_pp = t.mikk_accuracy - best_other
            ax.text(x[i] + w, max(t.mikk_accuracy, best_other) + 5,
                    f"+{gain_pp:.0f}pp",
                    ha="center", va="bottom", fontsize=8.5, fontweight="bold",
                    color=PALETTE["gold"])

    ax.set_ylim(0, 120)
    ax.yaxis.set_major_formatter(FuncFormatter(lambda v, _: f"{v:.0f}%"))
    ax.set_xticks(x)
    ax.set_xticklabels([t.label for t in tasks], fontsize=9,
                       color=PALETTE["text_muted"])
    ax.set_ylabel("Answer Accuracy (% ground-truth keywords found)",
                  color=PALETTE["text_muted"], fontsize=10)
    ax.tick_params(axis="x", length=0)
    ax.legend(fontsize=9, framealpha=0.9, facecolor=PALETTE["surface"],
              edgecolor=PALETTE["border"], labelcolor=PALETTE["text_muted"],
              loc="upper right")
    ax.set_title(
        "Task Accuracy: Mikk vs GitNexus vs Manual\n" + subtitle(data),
        pad=12, fontsize=12, fontweight="bold", color=PALETTE["text_primary"],
    )

    fig.tight_layout()
    return save(fig, out_dir, "accuracy.png")


# =============================================================================
# Chart 4 -- Radar
# =============================================================================
def chart_radar(data: BenchmarkData, out_dir: Path) -> Path:
    categories = [t.label.replace("\n", " ") for t in data.tasks]
    n = len(categories)
    angles = np.linspace(0, 2 * np.pi, n, endpoint=False).tolist()
    angles += angles[:1]

    mikk_vals   = [t.mikk_accuracy   / 100 for t in data.tasks] + \
                  [data.tasks[0].mikk_accuracy   / 100]
    manual_vals = [t.manual_accuracy / 100 for t in data.tasks] + \
                  [data.tasks[0].manual_accuracy / 100]
    gitnexus_vals = [t.gitnexus_accuracy / 100 for t in data.tasks] + \
                    [data.tasks[0].gitnexus_accuracy / 100]

    fig, ax = plt.subplots(figsize=FIGSIZE["radar"],
                           subplot_kw=dict(polar=True))
    fig.patch.set_facecolor(PALETTE["bg"])
    ax.set_facecolor(PALETTE["surface"])

    ax.plot(angles, mikk_vals,   color=PALETTE["mikk"],   lw=2.5, zorder=3)
    ax.fill(angles, mikk_vals,   color=PALETTE["mikk"],   alpha=0.25, zorder=2)
    ax.plot(angles, manual_vals, color=PALETTE["manual"], lw=2.5, zorder=3,
            linestyle="--")
    ax.fill(angles, manual_vals, color=PALETTE["manual"], alpha=0.12, zorder=2)
    ax.plot(angles, gitnexus_vals, color=PALETTE["blue"], lw=2.5, zorder=3,
            linestyle=":")
    ax.fill(angles, gitnexus_vals, color=PALETTE["blue"], alpha=0.12, zorder=2)

    ax.set_xticks(angles[:-1])
    ax.set_xticklabels(categories, size=9, color=PALETTE["text_muted"])
    ax.yaxis.set_tick_params(labelsize=7, colors=PALETTE["text_dim"])
    ax.spines["polar"].set_color(PALETTE["border"])
    ax.grid(color=PALETTE["grid"], linewidth=0.6)
    ax.set_ylim(0, 1)
    ax.yaxis.set_major_formatter(FuncFormatter(lambda v, _: f"{v*100:.0f}%"))

    ax.legend(
        handles=[
            mpatches.Patch(color=PALETTE["mikk"],   label="Mikk"),
            mpatches.Patch(color=PALETTE["manual"], label="Manual (no Mikk)"),
            mpatches.Patch(color=PALETTE["blue"], label="GitNexus (knowledge graph)"),
        ],
        loc="lower right", fontsize=9, framealpha=0.9,
        facecolor=PALETTE["surface"], edgecolor=PALETTE["border"],
        labelcolor=PALETTE["text_muted"],
        bbox_to_anchor=(1.3, -0.08),
    )

    fig.suptitle(
        "Accuracy by Task: Mikk vs GitNexus vs Manual\n" + subtitle(data),
        x=0.5, y=1.01, fontsize=12, fontweight="bold",
        color=PALETTE["text_primary"],
    )
    fig.tight_layout()
    return save(fig, out_dir, "radar.png")


# =============================================================================
# Chart 5 -- Overview (4-panel)
# =============================================================================
def chart_overview(data: BenchmarkData, out_dir: Path) -> Path:
    fig = plt.figure(figsize=FIGSIZE["overview"])
    fig.patch.set_facecolor(PALETTE["bg"])

    gs = GridSpec(2, 3, figure=fig,
                  hspace=0.50, wspace=0.38,
                  left=0.06, right=0.97,
                  top=0.88, bottom=0.08)

    tasks = data.tasks
    n = len(tasks)
    x = np.arange(n)
    w = 0.35

    # ---- Panel A: tokens (top-left, wide) ------------------------------------
    ax_tok = fig.add_subplot(gs[0, :2])
    apply_light_style(fig, [ax_tok])
    y_max = max(t.manual_tokens for t in tasks)
    ax_tok.bar(x - w/2, [t.manual_tokens for t in tasks], width=w,
               color=PALETTE["manual"], alpha=0.9, zorder=3)
    ax_tok.bar(x + w/2, [t.mikk_tokens   for t in tasks], width=w,
               color=PALETTE["mikk"],   alpha=0.9, zorder=3)
    for i, t in enumerate(tasks):
        ax_tok.text(x[i] - w/2, t.manual_tokens + y_max*0.01,
                    f"{t.manual_tokens:,}", ha="center", va="bottom",
                    fontsize=7, color=PALETTE["text_primary"])
        ax_tok.text(x[i] + w/2, t.mikk_tokens + y_max*0.01,
                    f"{t.mikk_tokens:,}", ha="center", va="bottom",
                    fontsize=7, color=PALETTE["text_primary"])
        ax_tok.text(x[i], max(t.manual_tokens, t.mikk_tokens) * 1.09,
                    f"-{t.token_reduction:.0f}%",
                    ha="center", fontsize=8.5, fontweight="bold",
                    color=PALETTE["mikk_light"])
    ax_tok.set_xticks(x)
    ax_tok.set_xticklabels([t.label for t in tasks], fontsize=8)
    ax_tok.set_ylabel("Tokens", fontsize=9, color=PALETTE["text_muted"])
    ax_tok.tick_params(axis="x", length=0)
    ax_tok.set_title("Context Tokens Loaded", fontsize=10,
                     color=PALETTE["text_primary"], pad=6)

    # ---- Panel B: accuracy (top-right) ----------------------------------------
    ax_acc = fig.add_subplot(gs[0, 2])
    apply_light_style(fig, [ax_acc])
    y = np.arange(n)
    h = 0.35
    ax_acc.barh(y + h/2, [t.mikk_accuracy   for t in tasks], height=h,
                color=PALETTE["mikk"],   alpha=0.9, zorder=3)
    ax_acc.barh(y - h/2, [t.manual_accuracy for t in tasks], height=h,
                color=PALETTE["manual"], alpha=0.9, zorder=3)
    for i, t in enumerate(tasks):
        ax_acc.text(t.mikk_accuracy + 1,   y[i] + h/2, f"{t.mikk_accuracy:.0f}%",
                    va="center", fontsize=7, color=PALETTE["text_primary"])
        ax_acc.text(t.manual_accuracy + 1, y[i] - h/2, f"{t.manual_accuracy:.0f}%",
                    va="center", fontsize=7, color=PALETTE["text_muted"])
    ax_acc.set_yticks(y)
    ax_acc.set_yticklabels([t.label for t in tasks], fontsize=7.5)
    ax_acc.set_xlim(0, 115)
    ax_acc.xaxis.set_major_formatter(FuncFormatter(lambda v, _: f"{v:.0f}%"))
    ax_acc.set_title("Answer Accuracy", fontsize=10,
                     color=PALETTE["text_primary"], pad=6)

    # ---- Panel C: latency (bottom-left, wide) ---------------------------------
    ax_lat = fig.add_subplot(gs[1, :2])
    apply_light_style(fig, [ax_lat])
    lat_max = max(t.manual_latency for t in tasks)
    ax_lat.bar(x - w/2, [t.manual_latency for t in tasks], width=w,
               color=PALETTE["manual"], alpha=0.9, zorder=3)
    ax_lat.bar(x + w/2, [t.mikk_latency   for t in tasks], width=w,
               color=PALETTE["mikk"],   alpha=0.9, zorder=3)
    for i, t in enumerate(tasks):
        ax_lat.text(x[i] - w/2, t.manual_latency + lat_max*0.01,
                    f"{t.manual_latency:.1f}s", ha="center", va="bottom",
                    fontsize=7, color=PALETTE["text_primary"])
        ax_lat.text(x[i] + w/2, t.mikk_latency + lat_max*0.01,
                    f"{t.mikk_latency:.1f}s", ha="center", va="bottom",
                    fontsize=7, color=PALETTE["text_primary"])
        ax_lat.text(x[i], max(t.manual_latency, t.mikk_latency) * 1.12,
                    f"-{t.latency_reduction:.0f}%",
                    ha="center", fontsize=8.5, fontweight="bold",
                    color=PALETTE["mikk_light"])
    ax_lat.set_xticks(x)
    ax_lat.set_xticklabels([t.label for t in tasks], fontsize=8)
    ax_lat.set_ylabel("Seconds", fontsize=9, color=PALETTE["text_muted"])
    ax_lat.tick_params(axis="x", length=0)
    ax_lat.set_title("Response Latency", fontsize=10,
                     color=PALETTE["text_primary"], pad=6)

    # ---- Panel D: summary stats card (bottom-right) ---------------------------
    ax_sum = fig.add_subplot(gs[1, 2])
    ax_sum.set_facecolor(PALETTE["surface"])
    ax_sum.set_xticks([]); ax_sum.set_yticks([])
    for sp in ax_sum.spines.values():
        sp.set_color(PALETTE["border"])

    stats = [
        ("Avg Token Reduction",   f"-{data.avg_token_reduction:.0f}%",    PALETTE["mikk_light"]),
        ("Avg Latency Reduction", f"-{data.avg_latency_reduction:.0f}%",  PALETTE["mikk_light"]),
        ("Avg Accuracy Gain",     f"+{data.avg_accuracy_gain:.0f}pp",     PALETTE["gold"]),
        ("Tasks Tested",          str(len(data.tasks)),                   PALETTE["blue"]),
        ("Functions Tracked",     str(data.function_count),               PALETTE["blue"]),
        ("Files Analysed",        str(data.file_count),                   PALETTE["blue"]),
    ]
    for j, (lbl, val, color) in enumerate(stats):
        yp = 0.88 - j * 0.155
        ax_sum.text(0.08, yp, lbl, transform=ax_sum.transAxes,
                    fontsize=8.5, color=PALETTE["text_muted"], va="center")
        ax_sum.text(0.92, yp, val, transform=ax_sum.transAxes,
                    fontsize=11, fontweight="bold", color=color,
                    va="center", ha="right")
    ax_sum.set_title("Summary", fontsize=10,
                     color=PALETTE["text_primary"], pad=6)

    # ---- Shared legend --------------------------------------------------------
    fig.legend(
        handles=[
            mpatches.Patch(color=PALETTE["manual"],
                           label="Without Mikk (manual file reading)"),
            mpatches.Patch(color=PALETTE["mikk"],
                           label="With Mikk (MCP graph-based context)"),
        ],
        loc="upper center", ncol=2, fontsize=9, framealpha=0.9,
        facecolor=PALETTE["surface"], edgecolor=PALETTE["border"],
        labelcolor=PALETTE["text_muted"],
        bbox_to_anchor=(0.5, 0.965),
    )
    fig.suptitle(
        f"Mikk Benchmark  --  {subtitle(data)}",
        y=0.998, fontsize=13, fontweight="bold",
        color=PALETTE["text_primary"],
    )

    return save(fig, out_dir, "overview.png")


# =============================================================================
# Chart 6 -- Detail strip  (horizontal bars, 3 metrics)
# =============================================================================
def chart_detail_strip(data: BenchmarkData, out_dir: Path) -> Path:
    tasks = data.tasks
    n = len(tasks)
    fig, axes = plt.subplots(1, 3, figsize=FIGSIZE["detail_strip"])
    apply_light_style(fig, list(axes))
    fig.patch.set_facecolor(PALETTE["bg"])

    y = np.arange(n)
    h = 0.38
    labels = [t.label for t in tasks]

    metrics = [
        ("Tokens Loaded",
         [t.manual_tokens for t in tasks],
         [t.mikk_tokens   for t in tasks],
         lambda t: f"-{t.token_reduction:.0f}%",
         lambda v: f"{v:,.0f}"),
        ("Latency (s)",
         [t.manual_latency for t in tasks],
         [t.mikk_latency   for t in tasks],
         lambda t: f"-{t.latency_reduction:.0f}%",
         lambda v: f"{v:.1f}s"),
        ("Accuracy (%)",
         [t.manual_accuracy for t in tasks],
         [t.mikk_accuracy   for t in tasks],
         lambda t: f"+{t.accuracy_gain:.0f}pp",
         lambda v: f"{v:.0f}%"),
    ]

    for ax, (title, manual_vals, mikk_vals, delta_fn, val_fmt) in \
            zip(axes, metrics):
        ax.barh(y + h/2, manual_vals, height=h, color=PALETTE["manual"],
                alpha=0.9, zorder=3, label="Without Mikk")
        ax.barh(y - h/2, mikk_vals,   height=h, color=PALETTE["mikk"],
                alpha=0.9, zorder=3, label="With Mikk")

        x_max = max(max(manual_vals), max(mikk_vals))
        for i, t in enumerate(tasks):
            ax.text(manual_vals[i] + x_max*0.01, y[i] + h/2,
                    val_fmt(manual_vals[i]),
                    va="center", fontsize=7.5, color=PALETTE["text_primary"])
            ax.text(mikk_vals[i] + x_max*0.01, y[i] - h/2,
                    val_fmt(mikk_vals[i]),
                    va="center", fontsize=7.5, color=PALETTE["text_primary"])
            ax.text(x_max*1.01, y[i], delta_fn(t),
                    va="center", ha="left", fontsize=8, fontweight="bold",
                    color=PALETTE["mikk_light"])

        ax.set_xlim(0, x_max * 1.18)
        ax.set_yticks(y)
        ax.set_yticklabels(labels if ax is axes[0] else [], fontsize=8.5)
        ax.set_title(title, fontsize=10, color=PALETTE["text_primary"], pad=6)
        ax.legend(fontsize=8, framealpha=0.9, facecolor=PALETTE["surface"],
                  edgecolor=PALETTE["border"], labelcolor=PALETTE["text_muted"],
                  loc="lower right")

    fig.suptitle(
        f"Per-task Breakdown  --  {subtitle(data)}",
        y=1.01, fontsize=11, fontweight="bold",
        color=PALETTE["text_primary"],
    )
    fig.tight_layout()
    return save(fig, out_dir, "detail_strip.png")


# =============================================================================
# Chart 7 -- ROI big-number card
# =============================================================================
def chart_roi(data: BenchmarkData, out_dir: Path) -> Path:
    fig, ax = plt.subplots(figsize=FIGSIZE["roi"])
    fig.patch.set_facecolor(PALETTE["bg"])
    ax.set_facecolor(PALETTE["bg"])
    ax.set_xticks([]); ax.set_yticks([])
    for sp in ax.spines.values():
        sp.set_visible(False)

    cards = [
        (f"{data.avg_accuracy_gain:.0f}pp",     "Average accuracy\nimprovement", PALETTE["gold"]),
        (f"{data.avg_tokens/1000:.1f}k",         "Mikk avg\ncontext tokens", PALETTE["mikk"]),
        (f"{data.avg_latency:.1f}s",            "Mikk avg\nlatency", PALETTE["mikk_light"]),
        (str(len(data.tasks)),                   "Tasks\nbenchmarked", PALETTE["blue"]),
    ]

    xs = np.linspace(0.1, 0.9, len(cards))
    for xp, (big, small, color) in zip(xs, cards):
        rect = mpatches.FancyBboxPatch(
            (xp - 0.11, 0.15), 0.20, 0.70,
            boxstyle="round,pad=0.02",
            facecolor=PALETTE["surface"],
            edgecolor=color, linewidth=1.8,
            transform=ax.transAxes, zorder=2,
        )
        ax.add_patch(rect)
        ax.text(xp, 0.62, big, transform=ax.transAxes,
                ha="center", va="center", fontsize=30, fontweight="bold",
                color=color, zorder=3)
        ax.text(xp, 0.33, small, transform=ax.transAxes,
                ha="center", va="center", fontsize=9,
                color=PALETTE["text_muted"], zorder=3)

    ax.set_xlim(0, 1); ax.set_ylim(0, 1)
    fig.suptitle(
        f"Mikk -- Benchmark Summary\n{subtitle(data)}",
        y=0.97, fontsize=12, fontweight="bold",
        color=PALETTE["text_primary"],
    )
    return save(fig, out_dir, "roi.png")


# =============================================================================
# Chart 8 -- Metrics Glossary
# =============================================================================
def chart_glossary(data: BenchmarkData, out_dir: Path) -> Path:
    fig, ax = plt.subplots(figsize=(10, 8))
    fig.patch.set_facecolor(PALETTE["bg"])
    ax.set_facecolor(PALETTE["bg"])
    ax.set_xticks([]); ax.set_yticks([])
    for sp in ax.spines.values():
        sp.set_visible(False)

    # Title
    ax.text(0.5, 0.95, "Benchmark Metrics Glossary", 
            transform=ax.transAxes, ha="center", va="top",
            fontsize=16, fontweight="bold", color=PALETTE["text_primary"])

    # Metrics explanations
    glossary_items = [
        ("Tokens", "Amount of context information (1 token ≈ 4 characters)\nMore tokens = richer context for AI agents"),
        ("Latency", "Time taken to complete the task\nMeasured in seconds, lower is better"),
        ("Accuracy", "Percentage of correct/relevant results\nHigher accuracy = better performance"),
        ("pp", "Percentage points - absolute difference in percentages\n53pp = 53% improvement (not relative)"),
        ("Context Query", "Finding architectural information about a concept\nTests graph traversal and context building"),
        ("Impact Analysis", "Determining what breaks when code changes\nTests dependency graph analysis"),
        ("Dead Code Detection", "Finding unused functions and code\nTests graph analysis capabilities"),
        ("Constraint Validation", "Checking architectural rule compliance\nTests contract enforcement"),
        ("Session Context", "Providing project overview for AI sessions\nTests holistic understanding"),
        ("Function Search", "Locating specific functions in codebase\nTests search and indexing"),
        ("Mikk", "Architectural intelligence with full dependency graph\nComprehensive context analysis"),
        ("Manual", "Basic file search without architectural context\nLimited to grep/find operations"),
        ("GitNexus", "Symbol lookup without architectural relationships\nLimited to metadata search")
    ]

    y_pos = 0.85
    for term, explanation in glossary_items:
        # Term
        ax.text(0.1, y_pos, term, transform=ax.transAxes, 
                ha="left", va="top", fontsize=11, fontweight="bold",
                color=PALETTE["mikk"])
        # Explanation
        ax.text(0.15, y_pos - 0.025, explanation, transform=ax.transAxes,
                ha="left", va="top", fontsize=9,
                color=PALETTE["text_muted"])
        y_pos -= 0.065

    # Footer note
    ax.text(0.5, 0.02, "Benchmark measures real architectural intelligence capabilities\nHigher accuracy and richer context enable better AI assistance",
            transform=ax.transAxes, ha="center", va="bottom",
            fontsize=8, style="italic", color=PALETTE["text_muted"])

    return save(fig, out_dir, "glossary.png")


# =============================================================================
# Entry point
# =============================================================================
def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate Mikk benchmark charts.",
    )
    grp = parser.add_mutually_exclusive_group()
    grp.add_argument("--sample", action="store_true",
                     help="Use built-in sample data")
    grp.add_argument("--input", metavar="JSON",
                     help="Path to *_raw.json from a real run")
    parser.add_argument("--output", metavar="DIR",
                        default="benchmarks/results",
                        help="Output directory (default: benchmarks/results)")
    args = parser.parse_args()

    if args.input:
        bdata = load_from_json(args.input)
        print(f"Loaded {len(bdata.tasks)} tasks from {args.input}")
    else:
        bdata = sample_data()
        print(f"Using built-in sample data ({len(bdata.tasks)} tasks)")

    import shutil
    # Always resolve output relative to project root (parent of 'benchmarks')
    project_root = Path(__file__).parent.parent.resolve()
    default_output = project_root / "benchmarks" / "results"
    output_base = Path(args.output)
    if not output_base.is_absolute():
        # If user did not specify --output, or used a relative path, always use Mesh/benchmarks/results
        if args.output == parser.get_default('output'):
            output_base = default_output
        else:
            output_base = project_root / output_base
    timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    out_dir = output_base / f"run_{timestamp}"
    out_dir.mkdir(parents=True, exist_ok=True)
    print(f"\nGenerating charts => {out_dir.resolve()}\n")

    chart_tokens(bdata,       out_dir)
    chart_latency(bdata,      out_dir)
    chart_accuracy(bdata,     out_dir)
    chart_radar(bdata,        out_dir)
    chart_overview(bdata,     out_dir)
    chart_detail_strip(bdata, out_dir)
    chart_roi(bdata,          out_dir)
    chart_glossary(bdata,     out_dir)


    print(f"\nDone -- 8 charts in {out_dir.resolve()}")


if __name__ == "__main__":
    main()
