# Mikk Benchmark Suite

End-to-end benchmark comparing **Mikk** (graph-based code intelligence) against:
- **Manual file reading** — naive grep/cat approach (no graph, no symbols)
- **GitNexus baseline** — embedding-based file retrieval (no call graph, file-level only)

---

## Quick start

```bash
# 1. Build packages (required before benchmarking)
bun run build

# 2. Run the pipeline — measures all 8 tasks, writes results/TIMESTAMP_raw.json
bun benchmarks/pipeline.ts

# 3. Generate charts from the raw JSON
python benchmarks/generate_charts.py --input benchmarks/results/TIMESTAMP_raw.json
```

Charts land in `benchmarks/results/run_TIMESTAMP/`.

---

## What gets measured

| Task | Category | What Mikk does |
|---|---|---|
| `context-graph-builder` | Context Query | BFS-limited context within 4000-token budget |
| `function-search` | Function Search | BM25 + reciprocal rank fusion, symbol-level |
| `impact-analysis` | Impact Analysis | Reverse BFS from changed file, depth + severity |
| `dead-code` | Dead Code | Graph reachability + confidence scoring |
| `session-context` | Session Start | Structured project onboarding (modules, counts) |
| `constraints` | Constraints | ADRs + policies from mikk.json |
| `token-budget-4k` | Token Efficiency | 4000-token context window fidelity |
| `token-budget-1500` | Token Efficiency | 1500-token strict budget — accuracy under compression |

---

## Scoring

Each task has a **weighted checklist** of ground-truth criteria.

```
score = Σ(weight of passing checks) / Σ(total weights) × 100
```

Example for `impact-analysis`:
- Returns numeric impacted count → 30pts
- Reports BFS depth → 25pts
- Classifies by severity → 25pts
- Reports confidence score → 20pts

GitNexus and Manual baselines are scored against the **same checklist** — criteria that
require capabilities they don't have are marked `✗ [NOT SUPPORTED]` and score 0.

---

## Token efficiency

The "token budget" tests demonstrate Mikk's key differentiator:

| Tool | 1500-token budget respected? |
|---|---|
| Mikk | ✓ — enforced by ContextBuilder |
| GitNexus | ✗ — returns full files regardless (~8–15k tokens) |
| Manual | ✗ — returns full files regardless |

---

## Outputs

```
benchmarks/results/
  TIMESTAMP_raw.json          ← machine-readable, feeds generate_charts.py
  run_TIMESTAMP/
    tokens.png                ← token usage bar comparison
    latency.png               ← wall-clock time comparison
    accuracy.png              ← accuracy grouped bars
    overview.png              ← 4-panel summary card
    radar.png                 ← spider chart all tasks
    detail_strip.png          ← per-task horizontal bar strip
    roi.png                   ← big-number ROI callout
```

---

## Architecture

```
pipeline.ts
  │  loadMikk()          — imports core/dist, reads lock + contract
  │  buildGraph()        — constructs in-memory graph from lock
  │  manualFileScan()    — naive keyword file search (baseline)
  │  gitNexusSimulate()  — models GitNexus capability matrix
  │  makeTasks()         — 8 TaskDef objects with run() + score()
  └─ run()               — executes all tasks, writes _raw.json

generate_charts.py
  │  load_from_json()    — reads _raw.json (both old + new format)
  │  chart_*()           — 7 matplotlib chart functions
  └─ main()              — CLI entry, writes run_TIMESTAMP/ folder
```
