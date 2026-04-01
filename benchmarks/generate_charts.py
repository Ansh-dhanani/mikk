#!/usr/bin/env python3
"""
Mikk Ground Truth Benchmark Visualization
==========================================
Generates charts from ground-truth benchmark JSON results.

Usage:
    python benchmarks/generate_charts.py [path/to/ground-truth-report.json]

Requires: matplotlib, numpy
    pip install matplotlib numpy
"""

import json
import sys
import os
import re
import argparse
from pathlib import Path
from datetime import datetime

try:
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    import matplotlib.patches as mpatches
    import numpy as np
except ImportError:
    print("Error: matplotlib not installed. Run: pip install matplotlib numpy")
    sys.exit(1)

# Set style - dark theme for modern look
plt.style.use("dark_background")

PALETTE = {
    "excellent": "#22c55e",  # green
    "good": "#3b82f6",  # blue
    "warning": "#f59e0b",  # orange
    "poor": "#ef4444",  # red
    "bg": "#1a1a2e",
    "surface": "#16213e",
    "text": "#e5e5e5",
    "mikk": "#0ea5e9",  # cyan
    "mikk_light": "#38bdf8",
}

DPI = 150


def get_color(accuracy):
    if accuracy >= 80:
        return PALETTE["excellent"]
    elif accuracy >= 60:
        return PALETTE["good"]
    elif accuracy >= 40:
        return PALETTE["warning"]
    return PALETTE["poor"]


def load_data(json_path):
    with open(json_path, "r") as f:
        return json.load(f)


def create_overall_gauge(data, output_dir):
    """Create overall accuracy gauge chart"""
    accuracy = data.get("overallAccuracy", 0)

    fig, ax = plt.subplots(figsize=(10, 8), facecolor=PALETTE["bg"])
    ax.set_facecolor(PALETTE["bg"])
    ax.set_xlim(-1.2, 1.2)
    ax.set_ylim(-0.3, 1.2)
    ax.axis("off")

    # Background arc
    angles = np.linspace(0, np.pi, 100)
    for i in range(len(angles) - 1):
        a1, a2 = angles[i], angles[i + 1]
        acc = (i / len(angles)) * 100
        color = get_color(acc)
        ax.fill_between(
            [np.cos(a2), np.cos(a1)],
            [0, 0],
            [np.sin(a2), np.sin(a1)],
            color=color,
            alpha=0.3,
            zorder=1,
        )

    # Needle
    needle_angle = np.pi - (accuracy / 100) * np.pi
    needle_length = 0.7
    ax.plot(
        [0, needle_length * np.cos(needle_angle)],
        [0, needle_length * np.sin(needle_angle)],
        color="white",
        linewidth=5,
        zorder=10,
        solid_capstyle="round",
    )
    ax.plot(0, 0, "o", color=PALETTE["mikk"], markersize=20, zorder=11)

    # Value display
    color = get_color(accuracy)
    ax.text(
        0,
        0.15,
        f"{accuracy}%",
        fontsize=56,
        ha="center",
        color=color,
        fontweight="bold",
    )
    ax.text(
        0,
        -0.1,
        "OVERALL ACCURACY",
        fontsize=14,
        ha="center",
        color=PALETTE["text"],
    )

    # Grade
    if accuracy >= 80:
        grade, grade_color = "EXCELLENT", PALETTE["excellent"]
    elif accuracy >= 60:
        grade, grade_color = "GOOD", PALETTE["good"]
    elif accuracy >= 40:
        grade, grade_color = "FAIR", PALETTE["warning"]
    else:
        grade, grade_color = "NEEDS WORK", PALETTE["poor"]

    ax.text(
        0,
        0.85,
        grade,
        fontsize=24,
        ha="center",
        color=grade_color,
        fontweight="bold",
    )

    ax.set_title(
        "MIKK BENCHMARK RESULTS",
        fontsize=18,
        pad=30,
        color="white",
        fontweight="bold",
    )

    output_path = output_dir / "overall_accuracy.png"
    plt.tight_layout()
    plt.savefig(output_path, dpi=DPI, facecolor=PALETTE["bg"], bbox_inches="tight")
    plt.close()
    print(f"[OK] Created: {output_path.name}")
    return output_path


def create_feature_chart(data, output_dir):
    """Create accuracy by feature horizontal bar chart"""
    results = data.get("results", [])

    # Group by test type
    test_types = {}
    for r in results:
        test = r.get("test", "unknown")
        if test not in test_types:
            test_types[test] = []
        test_types[test].append(r.get("accuracy", 0))

    # Calculate average per feature
    features = []
    accuracies = []
    for test, accs in test_types.items():
        features.append(test.replace("-", " ").title())
        accuracies.append(sum(accs) / len(accs))

    # Sort by accuracy
    sorted_data = sorted(zip(features, accuracies), key=lambda x: x[1], reverse=True)
    features, accuracies = zip(*sorted_data)

    fig, ax = plt.subplots(figsize=(12, 6), facecolor=PALETTE["bg"])
    ax.set_facecolor(PALETTE["bg"])

    y = np.arange(len(features))
    h = 0.65

    for i, (f, a) in enumerate(zip(features, accuracies)):
        color = get_color(a)

        # Background bar
        ax.barh(i, 100, h, color="white", alpha=0.1, zorder=1)
        # Actual bar
        ax.barh(i, a, h, color=color, alpha=0.85, zorder=2)

        # Value label
        ax.text(
            a + 2,
            i,
            f"{a:.0f}%",
            va="center",
            fontsize=12,
            color=color,
            fontweight="bold",
        )

        # Feature name
        ax.text(-2, i, f, va="center", ha="right", fontsize=11, color=PALETTE["text"])

    ax.set_xlim(0, 115)
    ax.set_yticks([])
    ax.set_xlabel("Accuracy (%)", fontsize=12, color=PALETTE["text"])
    ax.set_title(
        "ACCURACY BY FEATURE", fontsize=16, pad=15, color="white", fontweight="bold"
    )

    # Target line
    ax.axvline(
        x=80,
        color=PALETTE["excellent"],
        linestyle="--",
        alpha=0.7,
        linewidth=1.5,
        label="Target (80%)",
    )
    ax.legend(loc="lower right", facecolor=PALETTE["bg"], labelcolor=PALETTE["text"])

    for spine in ax.spines.values():
        spine.set_color("white")
        spine.set_alpha(0.3)

    output_path = output_dir / "feature_accuracy.png"
    plt.tight_layout()
    plt.savefig(output_path, dpi=DPI, facecolor=PALETTE["bg"], bbox_inches="tight")
    plt.close()
    print(f"[OK] Created: {output_path.name}")
    return output_path


def create_project_chart(data, output_dir):
    """Create accuracy by project bar chart"""
    results = data.get("results", [])

    # Group by project
    projects = {}
    for r in results:
        proj = r.get("project", "unknown")
        if proj not in projects:
            projects[proj] = []
        projects[proj].append(r.get("accuracy", 0))

    # Calculate average per project
    proj_names = []
    proj_accs = []
    for proj, accs in projects.items():
        proj_names.append(proj)
        proj_accs.append(sum(accs) / len(accs))

    # Sort by accuracy
    sorted_data = sorted(zip(proj_names, proj_accs), key=lambda x: x[1], reverse=True)
    proj_names, proj_accs = zip(*sorted_data)

    fig, ax = plt.subplots(figsize=(10, 5), facecolor=PALETTE["bg"])
    ax.set_facecolor(PALETTE["bg"])

    x = np.arange(len(proj_names))
    colors = [get_color(a) for a in proj_accs]
    bars = ax.bar(x, proj_accs, color=colors, width=0.6, alpha=0.85, zorder=2)

    # Background
    ax.bar(x, 100, width=0.6, color="white", alpha=0.1, zorder=1)

    for bar, acc in zip(bars, proj_accs):
        ax.text(
            bar.get_x() + bar.get_width() / 2,
            acc + 3,
            f"{acc:.0f}%",
            ha="center",
            fontsize=12,
            color=get_color(acc),
            fontweight="bold",
        )

    ax.set_ylim(0, 120)
    ax.set_xticks(x)
    ax.set_xticklabels(
        proj_names, rotation=15, ha="right", fontsize=11, color=PALETTE["text"]
    )
    ax.set_ylabel("Accuracy (%)", fontsize=12, color=PALETTE["text"])
    ax.set_title(
        "ACCURACY BY PROJECT", fontsize=16, pad=15, color="white", fontweight="bold"
    )

    ax.axhline(
        y=80, color=PALETTE["excellent"], linestyle="--", alpha=0.7, linewidth=1.5
    )

    for spine in ax.spines.values():
        spine.set_color("white")
        spine.set_alpha(0.3)

    output_path = output_dir / "project_comparison.png"
    plt.tight_layout()
    plt.savefig(output_path, dpi=DPI, facecolor=PALETTE["bg"], bbox_inches="tight")
    plt.close()
    print(f"[OK] Created: {output_path.name}")
    return output_path


def create_performance_chart(data, output_dir):
    """Create latency chart"""
    results = data.get("results", [])

    # Extract context-generation results for latency
    latencies = {}
    for r in results:
        if r.get("test") == "context-generation":
            proj = r.get("project", "unknown")
            details = r.get("details", "")
            match = re.search(r"Latency: (\d+)ms", details)
            if match:
                latencies[proj] = int(match.group(1))

    if not latencies:
        return None

    projects = list(latencies.keys())
    times = list(latencies.values())

    fig, ax = plt.subplots(figsize=(10, 4), facecolor=PALETTE["bg"])
    ax.set_facecolor(PALETTE["bg"])

    x = np.arange(len(projects))
    colors = [PALETTE["good"] if t < 600 else PALETTE["warning"] for t in times]
    bars = ax.bar(x, times, color=colors, width=0.6, alpha=0.85, zorder=2)

    for bar, t in zip(bars, times):
        ax.text(
            bar.get_x() + bar.get_width() / 2,
            t + 15,
            f"{t}ms",
            ha="center",
            fontsize=11,
            color=PALETTE["text"],
        )

    ax.set_ylim(0, max(times) * 1.25)
    ax.set_xticks(x)
    ax.set_xticklabels(
        projects, rotation=15, ha="right", fontsize=10, color=PALETTE["text"]
    )
    ax.set_ylabel("Latency (ms)", fontsize=11, color=PALETTE["text"])
    ax.set_title(
        "CONTEXT GENERATION LATENCY",
        fontsize=14,
        pad=15,
        color="white",
        fontweight="bold",
    )

    for spine in ax.spines.values():
        spine.set_color("white")
        spine.set_alpha(0.3)

    output_path = output_dir / "performance.png"
    plt.tight_layout()
    plt.savefig(output_path, dpi=DPI, facecolor=PALETTE["bg"], bbox_inches="tight")
    plt.close()
    print(f"[OK] Created: {output_path.name}")
    return output_path


def create_summary_card(data, output_dir):
    """Create summary card with key metrics"""
    summary = data.get("summary", {})
    overall = data.get("overallAccuracy", 0)

    fig, ax = plt.subplots(figsize=(12, 8), facecolor=PALETTE["bg"])
    ax.set_facecolor(PALETTE["bg"])
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)
    ax.axis("off")

    # Title
    ax.text(
        0.5,
        0.95,
        "MIKK BENCHMARK SUMMARY",
        fontsize=22,
        ha="center",
        color="white",
        fontweight="bold",
        transform=ax.transAxes,
    )

    # Date
    timestamp = data.get("timestamp", "")
    if timestamp:
        date = datetime.fromisoformat(timestamp.replace("Z", "+00:00")).strftime(
            "%Y-%m-%d %H:%M"
        )
        ax.text(
            0.5,
            0.90,
            date,
            fontsize=11,
            ha="center",
            color=PALETTE["text"],
            alpha=0.7,
            transform=ax.transAxes,
        )

    # Key metrics boxes
    metrics = [
        ("OVERALL\nACCURACY", f"{overall}%", get_color(overall)),
        ("TESTS\nRUN", str(summary.get("totalTests", 0)), PALETTE["mikk"]),
        ("PROJECTS\nTESTED", str(summary.get("projects", 0)), PALETTE["mikk"]),
        ("DURATION", f"{summary.get('duration', 0) / 1000:.1f}s", PALETTE["text"]),
    ]

    box_width = 0.2
    box_height = 0.18
    start_x = 0.1
    spacing = 0.24

    for i, (label, value, color) in enumerate(metrics):
        x = start_x + (i % 4) * spacing
        y = 0.65

        # Box
        rect = mpatches.FancyBboxPatch(
            (x, y - box_height / 2),
            box_width,
            box_height,
            boxstyle="round,pad=0.02",
            facecolor=color,
            alpha=0.15,
            edgecolor=color,
            linewidth=2,
            transform=ax.transAxes,
        )
        ax.add_patch(rect)

        # Value
        ax.text(
            x + box_width / 2,
            y + 0.02,
            value,
            fontsize=20,
            ha="center",
            color=color,
            fontweight="bold",
            transform=ax.transAxes,
        )
        # Label
        ax.text(
            x + box_width / 2,
            y - 0.07,
            label,
            fontsize=9,
            ha="center",
            color=PALETTE["text"],
            transform=ax.transAxes,
        )

    # Feature breakdown
    results = data.get("results", [])
    test_types = {}
    for r in results:
        test = r.get("test", "unknown")
        if test not in test_types:
            test_types[test] = []
        test_types[test].append(r.get("accuracy", 0))

    features = [t.replace("-", " ").title() for t in test_types.keys()]
    accs = [sum(a) / len(a) for a in test_types.values()]

    # Sort by accuracy
    sorted_data = sorted(zip(features, accs), key=lambda x: x[1], reverse=True)
    features, accs = zip(*sorted_data)

    ax.text(
        0.5,
        0.48,
        "FEATURE BREAKDOWN",
        fontsize=14,
        ha="center",
        color="white",
        fontweight="bold",
        transform=ax.transAxes,
    )

    y_start = 0.40
    for i, (f, a) in enumerate(zip(features, accs)):
        color = get_color(a)
        x_pos = 0.15 + (i % 2) * 0.42
        y = y_start - (i // 2) * 0.08

        ax.text(x_pos, y, f, fontsize=10, color=PALETTE["text"], transform=ax.transAxes)

        bar_width = a / 100 * 0.35
        rect = mpatches.FancyBboxPatch(
            (x_pos + 0.18, y - 0.015),
            bar_width,
            0.025,
            boxstyle="round,pad=0.003",
            facecolor=color,
            alpha=0.8,
            transform=ax.transAxes,
        )
        ax.add_patch(rect)

        ax.text(
            x_pos + 0.55,
            y,
            f"{a:.0f}%",
            fontsize=10,
            ha="right",
            color=color,
            fontweight="bold",
            transform=ax.transAxes,
        )

    output_path = output_dir / "summary_card.png"
    plt.savefig(output_path, dpi=DPI, facecolor=PALETTE["bg"], bbox_inches="tight")
    plt.close()
    print(f"[OK] Created: {output_path.name}")
    return output_path


def create_radar_chart(data, output_dir):
    """Create radar chart for features"""
    results = data.get("results", [])

    test_types = {}
    for r in results:
        test = r.get("test", "unknown")
        if test not in test_types:
            test_types[test] = []
        test_types[test].append(r.get("accuracy", 0))

    features = [t.replace("-", " ").title() for t in test_types.keys()]
    accuracies = [sum(a) / len(a) for a in test_types.values()]

    # Radar
    n = len(features)
    angles = np.linspace(0, 2 * np.pi, n, endpoint=False).tolist()
    accuracies_plot = accuracies + [accuracies[0]]
    angles_plot = angles + [angles[0]]

    fig, ax = plt.subplots(
        figsize=(10, 10), subplot_kw=dict(polar=True), facecolor=PALETTE["bg"]
    )
    ax.set_facecolor(PALETTE["bg"])

    # Background circles
    for r in [25, 50, 75, 100]:
        ax.plot(
            angles_plot,
            [r] * len(angles_plot),
            "-",
            color="white",
            alpha=0.1,
            linewidth=0.5,
        )

    # Data
    ax.plot(
        angles_plot,
        accuracies_plot,
        "o-",
        linewidth=3,
        color=PALETTE["mikk"],
        markersize=8,
    )
    ax.fill(angles_plot, accuracies_plot, color=PALETTE["mikk"], alpha=0.25)

    # Labels
    ax.set_xticks(angles)
    ax.set_xticklabels(features, size=10, color=PALETTE["text"])
    ax.set_ylim(0, 100)
    ax.set_yticks([25, 50, 75, 100])
    ax.set_yticklabels(["25%", "50%", "75%", "100%"], size=8, color=PALETTE["text"])
    ax.tick_params(colors=PALETTE["text"])
    ax.grid(color="white", alpha=0.1)

    ax.set_title("FEATURE RADAR", fontsize=18, pad=30, color="white", fontweight="bold")

    output_path = output_dir / "radar_chart.png"
    plt.tight_layout()
    plt.savefig(output_path, dpi=DPI, facecolor=PALETTE["bg"], bbox_inches="tight")
    plt.close()
    print(f"[OK] Created: {output_path.name}")
    return output_path


def create_detailed_table(data, output_dir):
    """Create detailed results table"""
    results = data.get("results", [])

    fig, ax = plt.subplots(figsize=(14, 10), facecolor=PALETTE["bg"])
    ax.set_facecolor(PALETTE["bg"])
    ax.axis("off")

    ax.text(
        0.5,
        0.98,
        "DETAILED BENCHMARK RESULTS",
        fontsize=18,
        ha="center",
        color="white",
        fontweight="bold",
        transform=ax.transAxes,
    )

    # Headers
    headers = ["Project", "Feature", "Value", "Expected", "Accuracy"]
    col_widths = [0.2, 0.25, 0.12, 0.12, 0.12]
    x_positions = [0.02, 0.24, 0.50, 0.64, 0.78]

    y = 0.92
    for x, h, w in zip(x_positions, headers, col_widths):
        ax.text(
            x,
            y,
            h,
            fontsize=11,
            fontweight="bold",
            color=PALETTE["mikk"],
            transform=ax.transAxes,
        )

    # Data rows
    y -= 0.04
    for r in results:
        proj = r.get("project", "")
        test = r.get("test", "").replace("-", " ").title()
        value = r.get("value", 0)
        expected = r.get("expected", 0)
        acc = r.get("accuracy", 0)

        color = get_color(acc)

        ax.text(
            x_positions[0],
            y,
            proj[:20],
            fontsize=9,
            color=PALETTE["text"],
            transform=ax.transAxes,
        )
        ax.text(
            x_positions[1],
            y,
            test[:25],
            fontsize=9,
            color=PALETTE["text"],
            transform=ax.transAxes,
        )
        ax.text(
            x_positions[2],
            y,
            str(int(value)),
            fontsize=9,
            color=PALETTE["text"],
            transform=ax.transAxes,
        )
        ax.text(
            x_positions[3],
            y,
            str(int(expected)),
            fontsize=9,
            color=PALETTE["text"],
            transform=ax.transAxes,
        )
        ax.text(
            x_positions[4],
            y,
            f"{acc:.0f}%",
            fontsize=9,
            fontweight="bold",
            color=color,
            transform=ax.transAxes,
        )

        y -= 0.035

        if y < 0.1:
            break

    output_path = output_dir / "detailed_results.png"
    plt.savefig(output_path, dpi=DPI, facecolor=PALETTE["bg"], bbox_inches="tight")
    plt.close()
    print(f"[OK] Created: {output_path.name}")
    return output_path


def main():
    parser = argparse.ArgumentParser(description="Generate Mikk benchmark charts")
    parser.add_argument(
        "--input",
        "-i",
        metavar="JSON",
        default="benchmarks/ground-truth-report.json",
        help="Input JSON file path",
    )
    parser.add_argument(
        "--output",
        "-o",
        metavar="DIR",
        default="benchmarks/charts",
        help="Output directory",
    )
    args = parser.parse_args()

    # Find input file
    project_root = Path(__file__).parent.parent.resolve()
    input_path = project_root / args.input

    if not input_path.exists():
        print(f"Error: File not found: {input_path}")
        sys.exit(1)

    print(f"Loading data from: {input_path}")
    data = load_data(input_path)

    # Output directory
    output_dir = project_root / args.output
    output_dir.mkdir(parents=True, exist_ok=True)
    print(f"Output directory: {output_dir}\n")

    print("Generating charts...")
    print("-" * 40)

    create_overall_gauge(data, output_dir)
    create_feature_chart(data, output_dir)
    create_project_chart(data, output_dir)
    create_performance_chart(data, output_dir)
    create_summary_card(data, output_dir)
    create_radar_chart(data, output_dir)
    create_detailed_table(data, output_dir)

    print("-" * 40)
    print(f"\n[OK] All charts generated in: {output_dir}")
    print("\nChart files:")
    for f in sorted(output_dir.glob("*.png")):
        size_kb = f.stat().st_size / 1024
        print(f"  - {f.name} ({size_kb:.1f} KB)")


if __name__ == "__main__":
    main()
