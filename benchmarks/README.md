# Mikk Benchmark Pipeline

Measures the real value of Mikk by having AI agents answer developer questions
with and without access to Mikk's pre-computed architectural graph.

Every number in the output is real — no simulation, no hardcoded values.

---

## Structure

```
benchmarks/
├── run.py                      ← Entry point
├── generate_sample_charts.py   ← Pre-generate charts for the README
├── requirements.txt
├── .env.example
│
├── core/
│   ├── __init__.py
│   ├── pipeline.py     ← Orchestration
│   ├── agents.py       ← ManualAgent + MikkAgent (multi-provider)
│   ├── mcp_client.py   ← Real MCP JSON-RPC client (stdio)
│   ├── tasks.py        ← 6 task definitions + accuracy scoring
│   └── report.py       ← JSON, Markdown, PNG charts
│
├── results/            ← Output files (git-ignored)
└── recordings/         ← Optional asciinema recordings
```

---

## Quick start — no API key needed (Claude Code)

You already have the **Claude Code** VS Code extension installed.
It authenticates via OAuth — no separate API key required.

```powershell
# 1. Verify the claude CLI is available (installed by the extension)
claude --version

# 2. Install Python deps
pip install -r benchmarks/requirements.txt

# 3. Make sure Mikk is initialised
cd C:\Users\Ansh\Desktop\web\Mesh
npx @getmikk/cli init

# 4. Run a single task to test (fast, no manual agent)
python benchmarks/run.py --provider claude-code --tasks module-overview --skip-manual

# 5. Full benchmark — all 6 tasks, both agents
python benchmarks/run.py --provider claude-code
```

---

## Quick start — with Anthropic API key

```powershell
set ANTHROPIC_API_KEY=sk-ant-...
python benchmarks/run.py --provider anthropic-api
```

---

## All options

```
python benchmarks/run.py --help

  --provider            claude-code   Use Claude Code VS Code extension (no API key)
                        anthropic-api Use Anthropic SDK (needs ANTHROPIC_API_KEY)
                        Default: claude-code

  --project-root PATH   Project root with mikk.json (default: .)
  --output-dir PATH     Where to write results (default: benchmarks/results)
  --tasks TASK [...]    Subset of tasks (default: all)
  --model MODEL         Model ID — only used with anthropic-api provider
  --skip-manual         Run Mikk agent only — faster
  --no-charts           Skip PNG generation
```

---

## Providers

| Provider | Auth | Token counts | Notes |
|----------|------|-------------|-------|
| `claude-code` | OAuth via VS Code extension | Estimated (4 chars ≈ 1 token) | No API key needed |
| `anthropic-api` | `ANTHROPIC_API_KEY` env var | Exact from `response.usage` | Billed to your key |

---

## Tasks

| ID | Question | Ground-truth tool |
|----|----------|-------------------|
| `find-callers`    | Which functions call `hashContent`?         | `mikk_find_usages`         |
| `blast-radius`    | Blast radius if `file-hasher.ts` changes?   | `mikk_impact_analysis`     |
| `module-overview` | List all modules with function counts       | `mikk_list_modules`        |
| `dead-code`       | Unused functions in `packages-core`?        | `mikk_dead_code`           |
| `before-edit`     | Safety check before editing `tools.ts`      | `mikk_before_edit`         |
| `session-context` | Full architectural overview                 | `mikk_get_session_context` |

---

## Outputs

```
benchmarks/results/
├── 20260321_143022_raw.json        ← Source of truth (all raw data)
├── 20260321_143022_report.md       ← Human-readable report
├── 20260321_143022_tokens.png      ← Token comparison chart
├── 20260321_143022_time.png        ← Wall-time comparison chart
├── 20260321_143022_accuracy.png    ← Accuracy comparison chart
└── 20260321_143022_summary.png     ← All three side-by-side
```

The `results/` directory is git-ignored.
Commit only the charts you want to show in the main README.

---

## How it works

1. **Preflight** — checks `mikk.json`, `mikk.lock.json`, Node.js on PATH
2. **Ground truth** — calls real Mikk MCP tools directly and parses output to extract expected keywords per task
3. **Mikk agent** — Claude + real Mikk MCP tools via JSON-RPC; answers questions using the pre-computed graph
4. **Manual agent** — Claude + raw `read_file` / `list_directory` / `search_code`; no graph knowledge
5. **Scoring** — fraction of ground-truth keywords found in the final answer
6. **Output** — JSON source of truth + Markdown report + PNG charts

---

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `BENCHMARK_PROVIDER` | `claude-code` | Default provider |
| `BENCHMARK_MODEL` | `claude-opus-4-5` | Model (anthropic-api only) |
| `BENCHMARK_MAX_TOKENS` | `4096` | Max output tokens |
| `BENCHMARK_MAX_ITER` | `12` | Max agent loop iterations |
| `ANTHROPIC_API_KEY` | — | Required for anthropic-api provider only |
