#!/usr/bin/env python3
"""
Clean benchmark visuals for the semantic ground-truth report.

Usage:
    python benchmarks/generate_charts.py
    python benchmarks/generate_charts.py -i benchmarks/ground-truth-report.json -o benchmarks/charts

Requires:
    pip install matplotlib
"""

import argparse
import json
import sys
from datetime import datetime
from pathlib import Path

try:
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
except ImportError:
    print("Error: matplotlib is required. Run: pip install matplotlib")
    sys.exit(1)

PALETTE = {
    "bg": "#ffffff",
    "text": "#111827",
    "muted": "#6b7280",
    "border": "#e5e7eb",
    "primary": "#2563eb",
    "success": "#16a34a",
    "warning": "#d97706",
    "danger": "#dc2626",
}

DPI = 180


def color_for_accuracy(accuracy):
    if accuracy >= 85:
        return PALETTE["success"]
    if accuracy >= 60:
        return PALETTE["primary"]
    if accuracy >= 40:
        return PALETTE["warning"]
    return PALETTE["danger"]


def load_data(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def normalize_results(data):
    rows = []
    for r in data.get("results", []):
        rows.append(
            {
                "test": r.get("test", "unknown"),
                "metric": r.get("metric", "unknown"),
                "accuracy": float(r.get("accuracy", 0)),
                "score": float(r.get("score", 0)),
                "maxScore": float(r.get("maxScore", 0)),
                "details": r.get("details", ""),
            }
        )
    return rows


def style_axes(ax):
    ax.set_facecolor(PALETTE["bg"])
    for spine in ax.spines.values():
        spine.set_color(PALETTE["border"])
    ax.tick_params(colors=PALETTE["text"])
    ax.grid(axis="x", color=PALETTE["border"], linewidth=0.8)
    ax.set_axisbelow(True)


def create_summary_card(data, output_dir):
    overall = float(data.get("overallAccuracy", 0))
    factual = data.get("factualInterpretation", {})
    scope = factual.get("scope", {})

    fig, ax = plt.subplots(figsize=(12, 7), facecolor=PALETTE["bg"])
    ax.axis("off")

    ax.text(0.02, 0.94, "Mikk Semantic Benchmark Summary", fontsize=22, fontweight="bold", color=PALETTE["text"], transform=ax.transAxes)
    ax.text(0.02, 0.89, f"Overall measured accuracy: {overall:.0f}%", fontsize=16, fontweight="bold", color=color_for_accuracy(overall), transform=ax.transAxes)

    ts = data.get("timestamp", "")
    if ts:
        dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
        ax.text(0.98, 0.94, dt.strftime("%Y-%m-%d %H:%M UTC"), fontsize=10, ha="right", color=PALETTE["muted"], transform=ax.transAxes)

    statement = factual.get("truthStatement", "")
    if statement:
        ax.text(0.02, 0.80, "Truth statement", fontsize=11, fontweight="bold", color=PALETTE["text"], transform=ax.transAxes)
        ax.text(0.02, 0.75, statement, fontsize=11, color=PALETTE["text"], transform=ax.transAxes, wrap=True)

    items = [
        ("Fixtures tested", scope.get("fixturesTested", 0)),
        ("Tests executed", scope.get("testsExecuted", 0)),
        ("Queries executed", scope.get("queriesExecuted", 0)),
        ("Routes validated", scope.get("routesValidated", 0)),
        ("Caller links validated", scope.get("criticalCallerLinksValidated", 0)),
    ]

    y = 0.58
    for label, value in items:
        ax.text(0.04, y, label, fontsize=11, color=PALETTE["muted"], transform=ax.transAxes)
        ax.text(0.42, y, str(value), fontsize=11, fontweight="bold", color=PALETTE["text"], transform=ax.transAxes)
        y -= 0.07

    limitations = factual.get("knownLimitations", [])
    ax.text(0.56, 0.58, "Known limitations", fontsize=11, fontweight="bold", color=PALETTE["text"], transform=ax.transAxes)
    y = 0.53
    for item in limitations[:5]:
        ax.text(0.56, y, f"- {item}", fontsize=10, color=PALETTE["text"], transform=ax.transAxes)
        y -= 0.06

    out = output_dir / "summary_card.png"
    plt.tight_layout(pad=1.2)
    plt.savefig(out, dpi=DPI, facecolor=PALETTE["bg"], bbox_inches="tight")
    plt.close(fig)
    print(f"[OK] Created: {out.name}")


def create_accuracy_by_test(results, output_dir):
    tests = [r["test"].replace("-", " ").title() for r in results]
    accuracies = [r["accuracy"] for r in results]
    y_pos = list(range(len(tests)))

    fig, ax = plt.subplots(figsize=(11, 6), facecolor=PALETTE["bg"])
    style_axes(ax)

    colors = [color_for_accuracy(v) for v in accuracies]
    ax.barh(y_pos, accuracies, color=colors, height=0.55)
    ax.set_yticks(y_pos, labels=tests)
    ax.invert_yaxis()
    ax.set_xlim(0, 100)
    ax.set_xlabel("Accuracy (%)", color=PALETTE["text"])
    ax.set_title("Accuracy by Test", fontsize=15, fontweight="bold", color=PALETTE["text"])

    for i, v in enumerate(accuracies):
        ax.text(min(v + 1.5, 98), i, f"{v:.0f}%", va="center", fontsize=10, color=PALETTE["text"])

    out = output_dir / "accuracy_by_test.png"
    plt.tight_layout(pad=1.2)
    plt.savefig(out, dpi=DPI, facecolor=PALETTE["bg"], bbox_inches="tight")
    plt.close(fig)
    print(f"[OK] Created: {out.name}")


def create_score_breakdown(results, output_dir):
    labels = [r["test"].replace("-", " ").title() for r in results]
    raw = [f"{int(r['score'])}/{int(r['maxScore'])}" if r["maxScore"] > 0 else "n/a" for r in results]
    normalized = [100.0 * r["score"] / r["maxScore"] if r["maxScore"] > 0 else 0 for r in results]

    fig, ax = plt.subplots(figsize=(11, 6), facecolor=PALETTE["bg"])
    style_axes(ax)

    x = list(range(len(labels)))
    bars = ax.bar(x, normalized, color=PALETTE["primary"], width=0.58)
    ax.set_ylim(0, 105)
    ax.set_xticks(x, labels, rotation=18, ha="right")
    ax.set_ylabel("Normalized score (%)", color=PALETTE["text"])
    ax.set_title("Raw Score Breakdown", fontsize=15, fontweight="bold", color=PALETTE["text"])

    for bar, txt in zip(bars, raw):
        ax.text(bar.get_x() + bar.get_width() / 2, bar.get_height() + 2, txt, ha="center", fontsize=10, color=PALETTE["text"])

    out = output_dir / "raw_score_breakdown.png"
    plt.tight_layout(pad=1.2)
    plt.savefig(out, dpi=DPI, facecolor=PALETTE["bg"], bbox_inches="tight")
    plt.close(fig)
    print(f"[OK] Created: {out.name}")


def create_truth_coverage_table(data, output_dir):
    truth = data.get("truth", {})
    routes = truth.get("routes", [])
    callers = truth.get("jwtCallers", {})

    rows = []
    rows.append(["Fixture", data.get("fixture", "")])
    rows.append(["Route truth count", str(len(routes))])
    rows.append(["verifyToken callers", ", ".join(callers.get("verifyToken", [])) or "-"])
    rows.append(["signToken callers", ", ".join(callers.get("signToken", [])) or "-"])

    fig, ax = plt.subplots(figsize=(12, 4.8), facecolor=PALETTE["bg"])
    ax.axis("off")
    ax.set_title("Ground Truth Coverage", fontsize=15, fontweight="bold", color=PALETTE["text"], pad=14)

    table = ax.table(
        cellText=rows,
        colLabels=["Field", "Value"],
        colWidths=[0.30, 0.66],
        loc="center",
        cellLoc="left",
        colLoc="left",
    )
    table.auto_set_font_size(False)
    table.set_fontsize(10)
    table.scale(1, 1.8)

    for (r, c), cell in table.get_celld().items():
        cell.set_edgecolor(PALETTE["border"])
        if r == 0:
            cell.set_text_props(weight="bold", color=PALETTE["text"])
            cell.set_facecolor("#f8fafc")
        else:
            cell.set_text_props(color=PALETTE["text"])
            cell.set_facecolor("#ffffff")

    out = output_dir / "truth_coverage.png"
    plt.tight_layout(pad=1.2)
    plt.savefig(out, dpi=DPI, facecolor=PALETTE["bg"], bbox_inches="tight")
    plt.close(fig)
    print(f"[OK] Created: {out.name}")


def main():
    parser = argparse.ArgumentParser(description="Generate clean benchmark charts")
    parser.add_argument("--input", "-i", default="benchmarks/ground-truth-report.json", help="Input JSON path")
    parser.add_argument("--output", "-o", default="benchmarks/charts", help="Output directory")
    args = parser.parse_args()

    root = Path(__file__).parent.parent.resolve()
    input_path = root / args.input
    output_dir = root / args.output

    if not input_path.exists():
        print(f"Error: file not found: {input_path}")
        sys.exit(1)

    output_dir.mkdir(parents=True, exist_ok=True)
    data = load_data(input_path)
    results = normalize_results(data)

    if not results:
        print("Error: no results found in report JSON")
        sys.exit(1)

    print(f"Input:  {input_path}")
    print(f"Output: {output_dir}")
    print("Generating charts...")

    create_summary_card(data, output_dir)
    create_accuracy_by_test(results, output_dir)
    create_score_breakdown(results, output_dir)
    create_truth_coverage_table(data, output_dir)

    print("Done. Generated files:")
    for p in sorted(output_dir.glob("*.png")):
        print(f"  - {p.name}")


if __name__ == "__main__":
    main()
