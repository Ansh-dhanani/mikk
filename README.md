<p align="center">
  <img src="./assets/logo.png" alt="Mikk Logo" width="120" />
</p>

<h1 align="center">Mikk</h1>

<p align="center">
  <strong>Keeps your AI in sync with your architecture — before it breaks something.</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/org/getmikk"><img src="https://img.shields.io/npm/v/@getmikk/core?label=%40getmikk%2Fcore&color=cb3837" alt="npm" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache%202.0-blue.svg" alt="License" /></a>
  <img src="https://img.shields.io/badge/runtime-Bun-f472b6" alt="Bun" />
  <img src="https://img.shields.io/badge/100%25-local-22c55e" alt="100% Local" />
</p>

<br />

Mikk is an MCP server and CLI that gives AI agents a live, structural understanding of your codebase. Not file contents — the architecture: dependency graph, module boundaries, call chains, constraint rules, and drift detection. Always current. No cloud.

<br />

<p style="border:2px solid "  
align="center">
  <img src="./assets/showcase.gif" alt="Mikk in action" width="760" />
</p>


## Performance Benchmark

Mikk delivers dramatic token on every agentic coding task.

<p align="center">
  <img src="./assets/chart-tokens.png" alt="Token Usage: Mikk vs Agentic" width="760" />
</p>



***

## The Problem

AI coding agents are fast but architecturally blind. They don't know your module boundaries. They can't trace your dependency graph. They have no idea that touching `auth/login.ts` breaks 14 downstream functions across 3 packages. They get a flat paste of files and hallucinate the rest.

Mikk fixes this by giving agents a live map of how your code is actually structured — and surfacing violations before edits land.

***

## What Mikk Actually Does

```Shell
npm install -g @getmikk/cli
cd my-project
mikk init
```

In one command, Mikk:

1. **Parses** 13 languages natively (TypeScript, JavaScript, Python, Java, C, C++, C#, Go, Rust, PHP, Ruby, etc.) via Tree-sitter and TS Compiler API
2. **Builds** a full dependency graph — two-pass O(n) construction, O(1) adjacency lookups
3. **Clusters** files into logical modules via greedy agglomeration
4. **Hashes** everything with Merkle-tree SHA-256 (function → file → module → root)
5. **Detects** HTTP routes (Express, Koa, Hono) — method, path, handler, middleware chain
6. **Generates** `mikk.json` (your architecture contract) and `mikk.lock.json` (full snapshot)
7. **Generates** 7 Mermaid diagrams in `.mikk/diagrams/` — architecture, health, dependency matrix, flow, impact, module, capsule
8. **Generates** `claude.md` and `AGENTS.md` — tiered, token-budgeted AI context files

No cloud. No API keys. No telemetry. Everything stays on your machine.

***

## Architecture in Numbers

<table>
<tr>
<td align="center"><strong>90 files</strong><br/><sub>scattered source code</sub></td>
<td align="center">→</td>
<td align="center"><strong>1 file</strong><br/><sub><code>mikk.lock.json</code> · 60% smaller</sub></td>
<td align="center">+</td>
<td align="center"><strong>~500 lines</strong><br/><sub><code>claude.md</code> / <code>AGENTS.md</code></sub></td>
</tr>
</table>

| Metric                         | Value                                                                      |
| ------------------------------ | -------------------------------------------------------------------------- |
| Lock file size reduction       | \~60% vs raw source                                                        |
| MCP tool cache TTL             | 30 seconds (200ms → \~5ms per call after first)                            |
| Watch debounce window          | 100ms                                                                      |
| Incremental analysis threshold | Files < 15 → incremental; ≥ 15 → full re-analysis                          |
| Semantic search model          | 22MB local download, runs on-device                                        |
| Context token budget           | 12,000 tokens (configurable)                                               |
| Languages supported            | 13 languages (TS, JS, Python, Java, C, C++, C#, Go, Rust, PHP, Ruby, etc.) |

***

## MCP Server — 21 Tools

Connect to Claude Desktop, Cursor, VS Code Copilot, or any MCP-compatible client:

```Shell
mikk mcp
```

Every tool reads from `mikk.lock.json` — no re-parsing, millisecond responses. The lock is cached in memory with a 30-second TTL. Each tool surfaces a staleness warning if files have drifted since last analysis.

### Session Tools

| Tool                        | What it does                                                                                                                  |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `mikk_get_session_context`  | **Call once per session.** Returns project overview, constraint status, hot modules, and recently modified files in one shot. |
| `mikk_get_changes`          | Files added, modified, and deleted since last `mikk analyze`. Call this at session start to know what's different.            |
| `mikk_get_project_overview` | Modules, function counts, file counts, tech stack, constraints.                                                               |

### Navigation Tools

| Tool                       | What it does                                                                                                                                                                                                                                                               |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mikk_query_context`       | Ask an architecture question — returns graph-traced context with call chains, function bodies, and module details. Supports `claude`, `generic`, and `compact` output formats.                                                                                             |
| `mikk_list_modules`        | All declared modules with paths, function counts, and entry points.                                                                                                                                                                                                        |
| `mikk_get_module_detail`   | Functions, files, exported API, and internal call graph for a specific module.                                                                                                                                                                                             |
| `mikk_get_function_detail` | Params, return type, call graph, source body, error handling, and line range for a function.                                                                                                                                                                               |
| `mikk_search_functions`    | Hybrid BM25 + Substring search across all function names via Reciprocal Rank Fusion.                                                                                                                                                                                       |
| `mikk_semantic_search`     | **Natural-language search** using local vector embeddings (Xenova/all-MiniLM-L6-v2, 22MB). Query *"validate a JWT token"* returns `verifyToken`, `validateJwt` ranked by cosine similarity. Embeddings cached in `.mikk/embeddings.json`. Requires `@xenova/transformers`. |
| `mikk_find_usages`         | Every function that calls a specific function — essential before renaming or changing a signature.                                                                                                                                                                         |
| `mikk_get_file`            | Raw source of any project file.                                                                                                                                                                                                                                            |
| `mikk_read_file`           | Source scoped to specific functions — returns body + metadata header (params, callers, calls). Saves tokens vs reading whole files.                                                                                                                                        |
| `mikk_get_routes`          | All detected HTTP routes with method, path, handler function, and middleware chain.                                                                                                                                                                                        |

### Refactoring & Core Tools

| Tool                   | What it does                                                                                                            |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `mikk_rename`          | Coordinated multi-file rename. Finds definition, all call sites, and import sites, outputting a step-by-step edit plan. |
| `mikk_git_diff_impact` | Maps git diff hunks to affected symbols and processes. Shows exactly which functions were modified/added/deleted.       |

### Safety Tools

| Tool                   | What it does                                                                                                                                                                                               |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mikk_before_edit`     | **Call before editing any file.** Returns blast radius, exported functions at risk, live boundary constraint violations (not just metadata — actual pass/fail per rule), and circular dependency warnings. |
| `mikk_impact_analysis` | Full blast radius of changing a file — impacted functions classified as critical / high / medium / low.                                                                                                    |
| `mikk_dead_code`       | Functions with zero callers after exempting exports, entry points, route handlers, tests, and constructors. Filter by module.                                                                              |

### Project Management Tools

| Tool                   | What it does                                                                                                                   |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `mikk_get_constraints` | All architectural constraints and ADRs declared in `mikk.json`.                                                                |
| `mikk_manage_adr`      | CRUD for Architectural Decision Records — list, get, add, update, remove. ADRs surface in every `mikk_query_context` response. |

**Resources:** `mikk://contract` · `mikk://lock` · `mikk://context`

***

## CLI Commands

```Shell
mikk init                     # Initialize — full scan, graph, lock, diagrams, claude.md
mikk analyze                  # Re-analyze after code changes
mikk watch                    # Live watcher daemon (incremental, debounced)
mikk diff                     # Files changed since last analysis
mikk ci                       # CI gate — exits non-zero on constraint violations
mikk ci --strict              # Also enforce dead code threshold
mikk ci --format json         # Machine-readable output
mikk intent "<prompt>"        # Pre-flight a refactor — detect conflicts before writing code
mikk rename                   # Coordinated multi-file rename
mikk git-diff-impact          # Map git diff hunks to affected functions
mikk dead-code                # Show unused functions across the codebase
mikk context query "<q>"      # Ask an architecture question
mikk context impact <file>    # Blast radius of changing a file
mikk context for "<task>"     # Get token-budgeted context for a coding task
mikk stats                    # Per-module metrics
mikk doctor                   # 7-point diagnostic check
mikk visualize all            # Regenerate all Mermaid diagrams
mikk visualize module <id>    # Regenerate diagram for one module
mikk contract validate        # Check for constraint violations and drift
mikk contract show-boundaries # All cross-module dependencies
mikk adr list                 # List all architectural decisions
mikk adr add                  # Add a new architectural decision
mikk adr get <id>             # Get details for a specific decision
mikk remove                   # Uninstall Mikk and delete all generated artifacts
mikk mcp                      # Start MCP server
```

***

## Connecting to AI Tools

### Claude Desktop

`claude_desktop_config.json`:

```JSON
{
  "mcpServers": {
    "mikk": {
      "command": "npx",
      "args": ["-y", "@getmikk/mcp-server", "/absolute/path/to/your/project"]
    }
  }
}
```

### Cursor

`.cursor/mcp.json`:

```JSON
{
  "mcpServers": {
    "mikk": {
      "command": "npx",
      "args": ["-y", "@getmikk/mcp-server", "/absolute/path/to/your/project"]
    }
  }
}
```

### VS Code Copilot

`.vscode/settings.json`:

```JSON
{
  "mcp.servers": {
    "mikk": {
      "command": "npx",
      "args": ["-y", "@getmikk/mcp-server", "/absolute/path/to/your/project"]
    }
  }
}
```

***

## Architecture Contracts

Define your module boundaries in `mikk.json`:

```JSON
{
  "declared": {
    "modules": [
      {
        "id": "auth",
        "name": "Authentication",
        "paths": ["src/auth/**"],
        "description": "JWT auth and session management"
      }
    ],
    "constraints": [
      "auth must not import from payments",
      "payments must not call into ui layer"
    ],
    "decisions": [
      {
        "id": "ADR-001",
        "title": "Stateless JWT authentication",
        "reason": "Avoids session storage in distributed deployments",
        "date": "2024-01-15"
      }
    ]
  }
}
```

Six constraint types: `no-import` · `must-use` · `no-call` · `layer` · `naming` · `max-files`

ADRs are surfaced automatically in every `mikk_query_context` response — agents understand *why* a constraint exists, not just *that* it does.

### CI Integration

```YAML
# GitHub Actions
- name: Architecture gate
  run: mikk ci --format json
```

`mikk ci` exits non-zero on violations. `--strict` adds dead code threshold enforcement. `--format json` outputs structured results for log ingestion.

***

## Live Watch Mode

```Shell
mikk watch
```

`mikk watch` runs a background daemon that:

* Detects file changes via chokidar with a 100ms debounce
* For changes under 15 files: incremental re-analysis (only changed files + their dependents)
* For changes 15+ files (e.g. git checkout): full re-analysis
* Handles race conditions — re-hashes after parsing to detect content changes mid-parse (3 retries)
* Enforces single-instance via PID file
* Writes lock updates atomically (temp file → rename) — no corrupted lock on crash
* Maintains sync state in `.mikk/sync-state.json`

***

## Semantic Search

```Shell
# Install once
npm install @xenova/transformers

# The MCP tool becomes available automatically
# Query via Claude: "find functions that handle JWT validation"
```

`mikk_semantic_search` uses `Xenova/all-MiniLM-L6-v2` — a 22MB model that downloads once to `~/.cache/huggingface` and runs entirely on-device. Embeddings are pre-computed from function name + purpose + params and cached at `.mikk/embeddings.json`. Cache is invalidated by lock fingerprint — only recomputes when the function index changes.

***

## Intent Pre-flight

```Shell
mikk intent "Move user validation into a shared utils module"
```

Before writing any code, Mikk:

1. Parses the prompt into structured intents (action + target + confidence)
2. Checks each intent against all declared constraints (6 rule types)
3. Detects conflicts with boundary rules
4. Returns affected files, new files required, and estimated impact
5. Outputs `approved: true/false` — tells you whether it's safe to proceed

```Shell
mikk intent "Extract auth logic into middleware" --json
```

***

## Generated Diagrams

`mikk init` and `mikk analyze` both generate 7 Mermaid diagrams in `.mikk/diagrams/`:

| Diagram                | What it shows                                                                                     |
| ---------------------- | ------------------------------------------------------------------------------------------------- |
| `main.mmd`             | Full architecture — all modules and inter-module dependencies                                     |
| `health.mmd`           | Module health dashboard — cohesion %, coupling score, function count, health indicator (🟢/🟡/🔴) |
| `matrix.mmd`           | Dependency matrix — which modules depend on which                                                 |
| `flow-entrypoints.mmd` | Entry point call flow                                                                             |
| `impact-*.mmd`         | Blast radius for a specific change                                                                |
| `modules/[id].mmd`     | Per-module detail — internal call graph                                                           |
| `capsules/[id].mmd`    | Per-module public API surface                                                                     |

The health diagram computes real metrics from the call graph — cohesion is the ratio of internal to total calls; coupling is the count of external function calls + cross-module file imports.

***

## AI Context Files

`mikk init` and `mikk analyze` both auto-generate `claude.md` and `AGENTS.md` — identical content, different filenames for different agents. These are not templates — every function name, file path, module relationship, and constraint is derived from the AST-parsed lock file.

Generated content is tiered to stay within a 12,000 token budget:

1. **Tier 1** — Project summary, module list, function + file counts, critical constraints (\~500 tokens, always included)
2. **Tier 2** — Per-module detail: exported API, key functions, internal call summary (\~300 tokens per module, included while budget allows)
3. **Context files** — Discovered schemas, configs, data models
4. **Import graph** — Cross-file import relationships per module
5. **HTTP routes** — Detected routes with handlers
6. **Tier 3** — Constraints and ADR decisions

***

## How It Works

```
Parse → Graph → Cluster → Hash → Contract → Context → Serve
```

| Step         | What happens                                                                                                                                                                            |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Parse**    | TypeScript Compiler API extracts functions, classes, imports (with tsconfig alias resolution), decorators, generics. JS/JSX via ScriptKind inference. Go via regex + stateful scanning. |
| **Graph**    | Two-pass `GraphBuilder` — nodes first, edges second, O(n) construction. Forward + reverse adjacency maps for O(1) traversal.                                                            |
| **Cluster**  | `ClusterDetector` groups files into modules via greedy agglomeration. Confidence score per cluster.                                                                                     |
| **Hash**     | Merkle-tree SHA-256: function → file → module → root. One root hash comparison = full drift detection. Persisted in SQLite WAL mode.                                                    |
| **Contract** | `mikk.json` validated against lock. 6 constraint types enforced by `BoundaryChecker`.                                                                                                   |
| **Context**  | BFS from seed functions. Scored by proximity + keyword match + entry-point bonus. Greedily packed to token budget.                                                                      |
| **Serve**    | MCP server with 30s in-memory cache. Lock loaded once per 30s window, \~5ms per tool call after first.                                                                                  |

***

## Packages

Mikk is a Turborepo monorepo with 8 packages:

| Package                                                     | Description                                                                                                                                                            |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`@getmikk/core`](packages/core/)                           | AST parsing (TypeScript API + Tree-sitter for 13 langs), BM25 search index, dependency graph, Merkle hashing, contract management, boundary checker, cluster detection |
| [`@getmikk/cli`](packages/cli/)                             | 17+ CLI commands — init, analyze, watch, diff, ci, intent, context, stats, doctor, visualize, rename, git-diff-impact                                                  |
| [`@getmikk/mcp-server`](packages/mcp-server/)               | 21 MCP tools + 3 resources. 30s TTL cache. Staleness detection on every call.                                                                                          |
| [`@getmikk/ai-context`](packages/ai-context/)               | BFS context builder, token budgeting, `claude.md`/`AGENTS.md` generation                                                                                               |
| [`@getmikk/intent-engine`](packages/intent-engine/)         | Intent parsing, conflict detection (6 rule types), semantic search (Xenova embeddings)                                                                                 |
| [`@getmikk/diagram-generator`](packages/diagram-generator/) | 7 Mermaid diagram types with real cohesion/coupling metrics                                                                                                            |
| [`@getmikk/watcher`](packages/watcher/)                     | Chokidar daemon — incremental analysis, atomic writes, PID singleton, race condition handling                                                                          |
| [`@getmikk/vscode-extension`](packages/vscode-extension/)   | VS Code extension — module tree view, status bar sync indicator, impact analysis, context generation                                                                   |

***


### Benchmark Results

| Scenario                  | Manual Approach | With Mikk | Time Saved |
| ------------------------- | --------------- | --------- | ---------- |
| **Explore Graph Builder** | 297ms           | 1ms       | **99.7%**  |
| **Find All Usages**       | 260ms           | 0ms       | **100%**   |
| **Impact Analysis**       | 202ms           | 0ms       | **100%**   |
| **Find Dead Code**        | 116ms           | 0ms       | **100%**   |

**Average Results:**

* **99.9% time saved** (219ms → 0ms average)
* **15% accuracy improvement** (80% → 95%)
* **4x fewer commands** needed to complete tasks

***

## License

Apache 2.0
