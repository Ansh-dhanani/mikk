<p align="center">
  <img src="./assets/logo.png" alt="Mikk" width="100" />
</p>

<h1 align="center">Mikk</h1>

<p align="center">
  <strong>Deterministic AI Context Engine</strong><br/>
  Keeps your AI in sync with your codebase — before it breaks something.
</p>

<p align="center">
  <a href="https://www.npmjs.com/org/getmikk"><img src="https://img.shields.io/npm/v/@getmikk/core?label=%40getmikk%2Fcore&color=cb3837" alt="npm" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache%202.0-blue.svg" alt="License" /></a>
  <img src="https://img.shields.io/badge/runtime-Bun-f472b6" alt="Bun" />
  <img src="https://img.shields.io/badge/100%25-local-22c55e" alt="Local" />
</p>

---

## What is Mikk?

AI coding agents are fast but architecturally blind. They don't know your module boundaries, can't trace dependencies, and have no idea that touching `auth/login.ts` breaks 14 downstream functions across 3 packages.

Mikk fixes this by building a **deterministic, AST-based map** of your architecture — modules, functions, call graphs, constraints — and serving it to any AI agent with millisecond precision.

**No RAG. No guessing. No cloud. Everything runs locally.**

---

## Why Mikk is Fast and Accurate

Mikk uses **[Oxc](https://oxc.rs/)** — a Rust-native JavaScript and TypeScript parser — as its core analysis engine.

| Property | Detail |
|---|---|
| **Speed** | Oxc parses TypeScript and JavaScript 50x faster than the TypeScript Compiler API. It processes an entire large codebase in milliseconds. |
| **Accuracy** | Oxc produces a full, standards-compliant Abstract Syntax Tree. Mikk walks this tree node-by-node to extract every function, import, export, call expression, class, enum, interface, and type — nothing is approximated. |
| **Determinism** | Because the extraction is driven by the syntax tree rather than keyword search or vector embeddings, the same code always produces the same output. There is no probability involved. |
| **Call graph** | Call edges are resolved from actual `CallExpression` AST nodes. If function A calls function B, that edge exists. If it doesn't, it doesn't. |
| **Non-TS languages** | Python, Java, C#, Go, Rust, C, C++, PHP, and Ruby are parsed using Tree-sitter, providing the same AST-driven extraction for those ecosystems. |

This is why Mikk achieves 85% average accuracy across benchmark tasks where RAG-based tools average 36% — not because of better prompting, but because the underlying data is exact.

---

## Quick Start

```bash
npm install -g @getmikk/cli
cd my-project
mikk init
mikk mcp
```

Then configure your AI tool:

```json
{
  "mcpServers": {
    "mikk": {
      "command": "npx",
      "args": ["-y", "@getmikk/mcp-server", "/path/to/your/project"]
    }
  }
}
```

---

## Why Not RAG?

| | RAG / Semantic Search | Mikk |
|---|---|---|
| Accuracy | Probabilistic — guesses based on keywords | Deterministic — traced from AST |
| Dependencies | Approximated | Exact call graph |
| Dead code | Unknown | Mathematically precise |
| Token usage | High — dumps raw files | Low — distilled API boundaries |
| Setup | Index + embed | One command |

### Benchmark Results

| Task | Mikk Accuracy | Competitor Accuracy | Mikk Tokens | Manual Tokens |
|---|---|---|---|---|
| Context Query | 80% | 60% | 6,410 | 4,741 |
| Function Search | 100% | 10% | 346 | 15,055 |
| Impact Analysis | 75% | 20% | 55 | 1,390 |
| Dead Code Detection | 100% | 0% | 290 | 5 |
| Session Context | 100% | 45% | 743 | 8,059 |
| Constraint Check | 100% | 80% | 417 | 5 |
| **Average** | **85%** | **36%** | **2,285** | **5,558** |

---

## How It Works

```
Parse → Graph → Cluster → Hash → Contract → Serve
```

| Step | Description |
|---|---|
| **Parse** | OxcParser (Rust-backed) extracts functions, imports, exports, and call graphs for TS/JS. Tree-sitter handles Python, Java, C#, Go, Rust, C, C++, PHP, Ruby. |
| **Graph** | Two-pass `GraphBuilder` — O(n) construction, O(1) adjacency lookups. Forward and reverse edges. |
| **Cluster** | Groups files into logical modules via greedy agglomeration with confidence scoring. |
| **Hash** | Merkle-tree SHA-256 from function → file → module → root. One root hash = full drift detection. |
| **Contract** | `mikk.json` validated against the lock. Six constraint types enforced by `BoundaryChecker`. |
| **Serve** | MCP server with 30s in-memory cache. ~5ms per tool call after first load. |

---

## What Gets Generated

Running `mikk init` produces:

- `mikk.json` — your architecture contract
- `mikk.lock.json` — full function/file/dependency snapshot (60% smaller than raw source)
- `claude.md` / `AGENTS.md` — token-budgeted AI context files (12,000 token limit, tiered)
- `.mikk/diagrams/` — 7 Mermaid diagrams (architecture, health, dependency matrix, flow, impact, module, capsule)

---

## MCP Server — 22 Tools

Connect to Claude Desktop, Cursor, VS Code Copilot, or any MCP-compatible client.

### Session Tools

| Tool | Description |
|---|---|
| `mikk_get_session_context` | Call once per session. Returns project overview, constraints, hot modules, and recent changes. |
| `mikk_get_changes` | Files added, modified, or deleted since last analysis. |
| `mikk_get_project_overview` | Modules, function counts, file counts, tech stack, constraints. |

### Navigation Tools

| Tool | Description |
|---|---|
| `mikk_query_context` | Architecture question → graph-traced answer with call chains and function bodies. |
| `mikk_list_modules` | All declared modules with paths, function counts, and entry points. |
| `mikk_get_module_detail` | Functions, files, exported API, and call graph for a module. |
| `mikk_get_function_detail` | Params, return type, call graph, source body, and line range for a function. |
| `mikk_search_functions` | Hybrid BM25 + substring search via Reciprocal Rank Fusion. |
| `mikk_semantic_search` | Natural-language function search using local vector embeddings (22MB, on-device). |
| `mikk_find_usages` | Every function that calls a specific function — essential before renaming. |
| `mikk_get_file` | Raw source of any project file. |
| `mikk_read_file` | Source scoped to specific functions — saves tokens vs reading whole files. |
| `mikk_get_routes` | All detected HTTP routes with method, path, handler, and middleware chain. |

### Safety Tools

| Tool | Description |
|---|---|
| `mikk_before_edit` | Call before editing any file. Returns blast radius, constraint violations, and circular dependency warnings. |
| `mikk_impact_analysis` | Full blast radius classified as critical / high / medium / low. |
| `mikk_dead_code` | Unused functions, exempt from exports, tests, constructors, and route handlers. |

### Refactoring Tools

| Tool | Description |
|---|---|
| `mikk_rename` | Coordinated multi-file rename with definition, call sites, and import sites. |
| `mikk_git_diff_impact` | Maps git diff hunks to affected symbols. |

### Project Tools

| Tool | Description |
|---|---|
| `mikk_get_constraints` | All architectural constraints and ADRs from `mikk.json`. |
| `mikk_manage_adr` | CRUD for Architectural Decision Records. |
| `mikk_token_stats` | Track token savings across sessions. |

---

## Architecture Contracts

Define module boundaries and rules in `mikk.json`:

```json
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

Constraint types: `no-import` · `must-use` · `no-call` · `layer` · `naming` · `max-files`

---

## CLI Reference

```bash
mikk init                      # Full scan — graph, lock, diagrams, claude.md
mikk analyze                   # Re-analyze after code changes
mikk watch                     # Live watcher daemon (incremental, debounced at 100ms)
mikk diff                      # Files changed since last analysis
mikk ci                        # CI gate — exits non-zero on constraint violations
mikk ci --strict               # Also enforce dead code threshold
mikk ci --format json          # Machine-readable output
mikk intent "<prompt>"         # Pre-flight a refactor before writing code
mikk dead-code                 # Show unused functions
mikk context query "<q>"       # Architecture question
mikk context impact <file>     # Blast radius of changing a file
mikk context for "<task>"      # Token-budgeted context for a coding task
mikk stats                     # Per-module metrics
mikk doctor                    # 7-point diagnostic check
mikk visualize all             # Regenerate all Mermaid diagrams
mikk contract validate         # Check for violations and drift
mikk adr list                  # List all architectural decisions
mikk mcp                       # Start MCP server
mikk remove                    # Uninstall and delete all generated artifacts
```

---

## Live Watch Mode

```bash
mikk watch
```

- Detects file changes via chokidar with a 100ms debounce
- Under 15 changed files: incremental re-analysis (only changed files and dependents)
- 15+ files (e.g. after `git checkout`): full re-analysis
- Atomic lock writes — temp file renamed on completion, no corruption on crash
- Single-instance enforced via PID file

---

## CI Integration

```yaml
- name: Architecture gate
  run: mikk ci --format json
```

`mikk ci` exits non-zero on constraint violations. Use `--strict` to also enforce dead code thresholds.

---

## Language Support

| Language | Parser | Coverage |
|---|---|---|
| TypeScript / JavaScript | OxcParser (Rust) | 100% |
| Go | Native | 100% |
| Python | Tree-sitter | 95% |
| Java | Tree-sitter | 90% |
| C# | Tree-sitter | 90% |
| Rust | Tree-sitter | 85% |
| C / C++ | Tree-sitter | 85% |
| PHP | Tree-sitter | 85% |
| Ruby | Tree-sitter | 85% |

---

## Packages

| Package | Description |
|---|---|
| `@getmikk/core` | AST parsing, dependency graph, BM25, Merkle hashing, contract management |
| `@getmikk/cli` | 17+ CLI commands |
| `@getmikk/mcp-server` | 22 MCP tools, 30s TTL cache, staleness detection |
| `@getmikk/ai-context` | BFS context builder, token budgeting, claude.md generation |
| `@getmikk/intent-engine` | Intent parsing, conflict detection, semantic search |
| `@getmikk/diagram-generator` | 7 Mermaid diagram types with real cohesion/coupling metrics |
| `@getmikk/watcher` | Incremental file watcher with atomic writes |
| `mikk` (VS Code) | Extension — Dashboard, dead code view, status bar, CodeLens |

---

## License

Apache 2.0
