# Mikk — MCP Benchmark

> 3 real tasks on `ts-express-api` (47 fns, 17 files, 7 modules).
> Token counts are from actual command output lengths (`chars / 4`).
> "Without Mikk" = what an AI agent does without MCP: grep + cat files + manual rule lookup.

---

## Demo

![Mikk MCP Benchmark](mikk-benchmark.gif)

<details>
<summary>Generate the GIF yourself</summary>

```bash
# 1. Regenerate the cast
node benchmarks/generate-cast.js

# 2. Convert to GIF  (requires agg)
npm install -g @asciinema/agg
agg benchmarks/mikk-benchmark.cast benchmarks/mikk-benchmark.gif \
  --theme monokai --font-size 14 --cols 100 --rows 32

# Or play live in terminal
asciinema play benchmarks/mikk-benchmark.cast
```

</details>

---

## Token Usage

![Token Usage: Mikk vs Manual](../assets/benchmark-chart.svg)

---

## Results

| Scenario | Without Mikk | With Mikk | Saved |
|---|---|---|---|
| Find boundary violations | ~820 tokens | ~18 tokens | **97.8%** |
| Blast radius check | ~312 tokens | ~312 tokens | **60%** |
| Session start | ~3,966 tokens | ~420 tokens | **89.4%** |
| **Total** | **~5,566 tokens** | **~750 tokens** | **86.5%** |

At $15/M tokens — **$0.083 → $0.011 per session = $0.072 saved**.
At 20 sessions/day per developer = **~$1.44/day saved**.

---

## How each scenario was measured

### Scenario 1 — boundary violations

Without Mikk, an agent greps for cross-module imports then must load files and
manually check `mikk.json` to determine which imports are violations (~820 tokens).

With `mikk ci --format json`, the agent gets exact violations with module names,
function names, and rule text in one call (~18 tokens).

### Scenario 2 — blast radius before editing `verifyToken()`

Without Mikk, an agent greps callers then opens each file (~780 tokens total),
with no transitive depth and no module boundary information.

With `mikk context impact src/auth/jwt.ts`, the agent gets a depth-3 call graph
with every impacted function, file, and module (~312 tokens).

### Scenario 3 — session start

Without Mikk, an agent reads all 17 source files to orient itself (~3,966 tokens),
with no module map, no constraint status, and no hot-file detection.

With `mikk_get_session_context`, the agent gets project structure, active violations,
hot modules, and constraints in one call (~420 tokens).
