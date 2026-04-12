<p align="center">
  <img src="./assets/logo.png" alt="Mikk" width="100" />
</p>

<h1 align="center">Mikk</h1>

<p align="center">
  <strong>Deterministic AI Context Engine</strong><br/>
  Gives AI agents a live structural map of your codebase — before they break something.
</p>

<p align="center">
  <a href="https://www.npmjs.com/org/getmikk"><img src="https://img.shields.io/npm/v/@getmikk/core?label=%40getmikk%2Fcore&color=cb3837" alt="npm" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache%202.0-blue.svg" alt="License" /></a>
  <img src="https://img.shields.io/badge/runtime-Bun-f472b6" alt="Bun" />
  <img src="https://img.shields.io/badge/100%25-local-22c55e" alt="Local" />
</p>

---

## What is Mikk?

AI coding agents write fast — but they're architecturally blind. They don't know your module boundaries, can't trace dependencies, and have no idea that touching `auth/login.ts` breaks 14 downstream functions across 3 packages.

Mikk fixes this by building a **deterministic, AST-based map** of your architecture — modules, functions, call graphs, constraints — and serving it to any AI agent over MCP.

**No RAG. No guessing. No cloud. Everything runs locally.**

---

## How It Works

```
Parse → Graph → Hash → Contract → Serve
```

| Step | Description |
|---|---|
| **Parse** | OxcParser (Rust-backed) for TS/JS. Tree-sitter for other languages. Go has a native extractor. |
| **Graph** | Two-pass `GraphBuilder` — registers all nodes first, then resolves edges. O(n) construction, O(1) lookups via adjacency maps. |
| **Hash** | SHA-256 from function → file → module → root. One root hash = instant drift detection. |
| **Contract** | `mikk.json` defines modules, constraints, and ADRs. Six constraint types enforced. |
| **Serve** | MCP server with 30s TTL cache, busted immediately when `mikk.lock.json` changes. |

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

Or use the auto-installer: `mikk mcp install`

---

## What Gets Generated

`mikk init` produces:

- `mikk.json` — your architecture contract (modules, constraints, ADRs)
- `mikk.lock.json` — full codebase snapshot (functions, files, call edges, hashes)
- `claude.md` / `AGENTS.md` — token-budgeted AI context files, auto-regenerated on `mikk analyze`
- `.mikk/diagrams/` — Mermaid diagrams (architecture, health, dependency matrix, module capsules, impact)

---

## MCP Server — 40 Tools

Connect to Claude Desktop, Cursor, VS Code Copilot, or any MCP-compatible client.

### Session Tools
| Tool | Description |
|---|---|
| `mikk_get_session_context` | **Call this first.** Project overview, constraint status, hot modules, recent changes. |
| `mikk_get_changes` | Files added, modified, or deleted since last analysis. SHA-256 hash comparison. |
| `mikk_get_project_overview` | Modules, function counts, file counts, tech stack. |
| `mikk_token_stats` | Token savings for this session vs. naive file reading. |

### Planning Tools
| Tool | Description |
|---|---|
| `mikk_change_plan` | **One-shot pre-flight.** Scope + impact + constraints + risk in a single call. Start every complex task here. |
| `mikk_scope_check` | Minimal set of files to touch for a task. The inverse of impact analysis. |
| `mikk_explain_risk` | Human-readable breakdown of why a function has a high risk score, with hot paths and recommendations. |

### Navigation Tools
| Tool | Description |
|---|---|
| `mikk_query_context` | Architecture question → graph-traced answer with call chains. |
| `mikk_list_modules` | All declared modules with paths and function counts. |
| `mikk_get_module_detail` | Functions, files, exported API, and call graph for a module. |
| `mikk_get_function_detail` | Params, return type, source body, call graph, error handling, line range. |
| `mikk_search_functions` | Hybrid BM25 + substring search. |
| `mikk_search_rich` | Search with multiple filters: module, file, async, return type, body content. |
| `mikk_semantic_search` | Natural-language search using local vector embeddings. Requires `@xenova/transformers`. |
| `mikk_find_function` | O(1) exact-name lookup. |
| `mikk_find_by_signature` | Find function by full signature string. |
| `mikk_find_by_location` | Find function at a specific file:line. |
| `mikk_find_similar` | Find functions with similar names (handles renames). |
| `mikk_find_usages` | Every caller of a specific function. |
| `mikk_get_file` | Raw source of any tracked project file. |
| `mikk_read_file` | Source scoped to specific named functions — saves tokens vs. whole-file read. |
| `mikk_get_routes` | All detected HTTP routes with method, path, handler, middleware chain. |
| `mikk_list_files` | All tracked files with metadata (language, imports, exports, line count). |
| `mikk_get_class_detail` | Class details: methods, properties, inheritance, decorators. |
| `mikk_get_generic_detail` | Type/interface details: type parameters, extends clauses. |
| `mikk_get_call_graph` | Mermaid call graph for a function or module. |
| `mikk_bulk_query` | Batch multiple function detail queries in one call. |

### Safety Tools
| Tool | Description |
|---|---|
| `mikk_before_edit` | **Call before editing.** Blast radius, exported functions at risk, constraint violations, circular deps. |
| `mikk_validate_edit` | Pre-edit validation with intent analysis, 6 safety gates, and auto-correction suggestions. |
| `mikk_impact_analysis` | Full blast radius classified by severity (critical / high / medium / low). |
| `mikk_dead_code` | Dead functions with multi-pass exemptions (exports, entry points, route handlers, tests). |
| `mikk_get_dead_code` | Dead code with filters: module, complexity, exported status. |
| `mikk_get_complexity` | Functions above a cyclomatic complexity threshold. |
| `mikk_security_scan` | Scan for hardcoded secrets, injection, weak crypto, path traversal, command injection. |

### Refactoring Tools
| Tool | Description |
|---|---|
| `mikk_rename` | Coordinated multi-file rename plan — all call sites and import locations. |
| `mikk_git_diff_impact` | Map git diff hunks to affected symbols. |
| `mikk_file_diff` | Drift between lock state and current filesystem for a file. |

### Project Tools
| Tool | Description |
|---|---|
| `mikk_get_constraints` | All architectural constraints and ADRs from `mikk.json`. |
| `mikk_manage_adr` | CRUD for Architectural Decision Records. ADRs surface in every `mikk_query_context` response. |
| `mikk_test_tool` | Smoke test — verifies MCP connection is alive. |

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
      "auth must not import from payments"
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

**Constraint types:** `no-import` · `must-use` · `no-call` · `layer` · `naming` · `max-files`

---

## CLI Reference

```bash
mikk init                      # Full scan — graph, lock, diagrams, claude.md
mikk init --strict-parsing    # Fail if parser diagnostics are detected
mikk analyze                   # Re-analyze after code changes
mikk analyze --strict-parsing  # CI-friendly parse completeness enforcement
mikk doctor                    # Diagnostics: config, lock freshness, parser runtime
mikk update                    # Interactive self-update
mikk watch                     # Live watcher daemon (incremental, 100ms debounce)
mikk diff                      # Files changed since last analysis
mikk ci                        # CI gate — exits non-zero on violations
mikk ci --strict              # Also enforce dead code threshold
mikk ci --format json         # Machine-readable output
mikk intent "<prompt>"        # Pre-flight a refactor idea
mikk dead-code                # Show unused functions
mikk context query "<q>"     # Architecture question
mikk context impact <file>   # Blast radius of changing a file
mikk context for "<task>"     # Token-budgeted context for a coding task
mikk stats                    # Per-module metrics
mikk suggest                  # Next-step recommendations
mikk contract validate        # Check for violations and drift
mikk mcp install              # Auto-write MCP config
mikk adr list                 # List all architectural decisions
mikk mcp                      # Start MCP server
mikk remove                   # Uninstall and delete artifacts
```

---

## CI Integration

```yaml
- name: Architecture gate
  run: |
    mikk doctor
    mikk analyze --strict-parsing
    mikk ci --strict --format json
```

`mikk ci` exits non-zero on constraint violations. `--strict` also enforces a dead code threshold (default 20%).

---

## Language Support

| Language | Parser | Notes |
|---|---|---|
| TypeScript / JavaScript | OxcParser (Rust) | Full function, class, import, call graph extraction |
| Go | Native GoExtractor | Functions, structs, methods, call graph |
| Python | Tree-sitter | Functions, classes, imports |
| Java | Tree-sitter | Functions, classes, imports |
| Rust | Tree-sitter | Functions, structs, imports |
| C / C++ | Tree-sitter | Functions, imports |
| C# | Tree-sitter | Functions, classes, imports |
| PHP | Tree-sitter | Functions, classes |
| Swift | Tree-sitter | Functions, classes |
| Shell / Bash | Tree-sitter | Functions |

> **10 languages tested in production** against fixture suites covering 71 functions, 18 classes, 134 call edges across 29 files.
>
> **30+ additional languages** in the registry (Kotlin, Scala, Dart, Ruby, Zig, Elixir, and more) use tree-sitter grammars and work once test fixtures are added.

---

## Packages

| Package | Description |
|---|---|
| `@getmikk/core` | AST parsing, dependency graph, BM25 search, Merkle hashing, boundary checker, risk/confidence engines |
| `@getmikk/cli` | CLI commands |
| `@getmikk/mcp-server` | 40 MCP tools, project cache with mtime-based invalidation |
| `@getmikk/ai-context` | BFS context builder, token budgeting, `claude.md` generation |
| `@getmikk/intent-engine` | Pre-edit validation, 6 safety gates, decision engine, auto-correction, semantic search |
| `@getmikk/watcher` | Incremental file watcher daemon with atomic lock writes |
| `@getmikk/diagram-generator` | 7 Mermaid diagram types with cohesion/coupling metrics |
| `@getmikk/vscode-extension` | Status bar, dead code view, impact analysis inline |

---

## License

Apache 2.0
