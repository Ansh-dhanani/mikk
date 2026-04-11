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

## Why Mikk is Fast

Mikk uses **[Oxc](https://oxc.rs/)** — a Rust-native JavaScript and TypeScript parser — as its core analysis engine.

| Property | Detail |
|---|---|
| **Speed** | Oxc parses TypeScript and JavaScript much faster than the TypeScript Compiler API. |
| **Analysis** | Oxc produces a full Abstract Syntax Tree. Mikk walks this tree to extract functions, imports, exports, call expressions, classes, and types. |
| **Determinism** | The same code always produces the same output. No probability involved. |
| **Call graph** | Call edges are resolved from actual `CallExpression` AST nodes. |
| **Multi-language** | Tree-sitter handles Python, Java, C#, Go, Rust, C, C++, PHP, Ruby, and more. |

---

## Quick Start

```bash
npm install -g @getmikk/cli
cd my-project
mikk init
mikk mcp
```

Configure your AI tool:

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
| Dependencies | Approximated | Exact call graph |
| Dead code | Unknown | Precise detection |
| Token usage | High — dumps raw files | Low — distilled API boundaries |
| Setup | Index + embed | One command |

---

## How It Works

```
Parse → Graph → Cluster → Hash → Contract → Serve
```

| Step | Description |
|---|---|
| **Parse** | OxcParser (Rust-backed) for TS/JS. Tree-sitter for other languages. |
| **Graph** | Two-pass `GraphBuilder` — O(n) construction, O(1) lookups. |
| **Cluster** | Groups files into logical modules via greedy agglomeration. |
| **Hash** | SHA-256 from function → file → module → root. One hash = full drift detection. |
| **Contract** | `mikk.json` validated against the lock. Six constraint types enforced. |
| **Serve** | MCP server with 30s cache. Fast tool calls after first load. |

---

## What Gets Generated

Running `mikk init` produces:

- `mikk.json` — your architecture contract
- `mikk.lock.json` — full function/file/dependency snapshot
- `claude.md` / `AGENTS.md` — token-budgeted AI context files
- `.mikk/diagrams/` — Mermaid diagrams (architecture, dependency matrix, impact, module, capsule)

---

## MCP Server — 23 Tools

Connect to Claude Desktop, Cursor, VS Code Copilot, or any MCP-compatible client.

### Session Tools
| Tool | Description |
|---|---|
| `mikk_get_session_context` | Call once per session. Returns project overview, constraints, hot modules. |
| `mikk_get_changes` | Files added, modified, or deleted since last analysis. |
| `mikk_get_project_overview` | Modules, function counts, file counts, tech stack. |

### Navigation Tools
| Tool | Description |
|---|---|
| `mikk_query_context` | Architecture question → graph-traced answer with call chains. |
| `mikk_list_modules` | All declared modules with paths and function counts. |
| `mikk_get_module_detail` | Functions, files, exported API, and call graph for a module. |
| `mikk_get_function_detail` | Params, return type, call graph, source body, and line range. |
| `mikk_search_functions` | Hybrid search combining multiple algorithms. |
| `mikk_semantic_search` | Natural-language function search using embeddings. |
| `mikk_find_usages` | Every function that calls a specific function. |
| `mikk_get_file` | Raw source of any project file. |
| `mikk_read_file` | Source scoped to specific functions. |
| `mikk_get_routes` | All detected HTTP routes with method, path, handler. |

### Safety Tools
| Tool | Description |
|---|---|
| `mikk_before_edit` | Call before editing. Returns blast radius and constraint violations. |
| `mikk_validate_edit` | Pre-edit validation with intent analysis and recommendations. |
| `mikk_impact_analysis` | Full blast radius classified by severity. |
| `mikk_dead_code` | Unused functions detection. |
| `mikk_security_scan` | Security vulnerability scanning. |

### Refactoring Tools
| Tool | Description |
|---|---|
| `mikk_rename` | Coordinated multi-file rename. |
| `mikk_git_diff_impact` | Maps git diff hunks to affected symbols. |

### Project Tools
| Tool | Description |
|---|---|
| `mikk_get_constraints` | All architectural constraints from `mikk.json`. |
| `mikk_manage_adr` | CRUD for Architectural Decision Records. |
| `mikk_token_stats` | Track token savings. |

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

Constraint types: `no-import` · `must-use` · `no-call` · `layer` · `naming` · `max-files`

---

## Practical Use Cases

- **Refactor safety**: run `mikk intent "..."` before large renames/splits.
- **PR/CI safety**: run `mikk ci --strict` to prevent architectural regressions.
- **Fresh context for AI agents**: run `mikk analyze` after code changes.
- **Fast onboarding**: run `mikk context query "How does X work?"`.

---

## CLI Reference

```bash
mikk init                      # Full scan — graph, lock, diagrams, claude.md
mikk init --strict-parsing    # Fail if parser diagnostics are detected
mikk analyze                   # Re-analyze after code changes
mikk analyze --strict-parsing  # CI-friendly parse completeness enforcement
mikk doctor                    # Diagnostics including parser runtime preflight
mikk update                    # Interactive self-update
mikk watch                     # Live watcher daemon (incremental, 100ms debounce)
mikk diff                      # Files changed since last analysis
mikk ci                        # CI gate — exits non-zero on violations
mikk ci --strict              # Also enforce dead code threshold
mikk ci --format json         # Machine-readable output
mikk intent "<prompt>"        # Pre-flight a refactor
mikk dead-code                # Show unused functions
mikk context query "<q>"     # Architecture question
mikk context impact <file>   # Blast radius of changing a file
mikk context for "<task>"     # Token-budgeted context for a coding task
mikk stats                    # Per-module metrics
mikk suggest                  # Practical next-step recommendations
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
  run: mikk ci --format json
```

`mikk ci` exits non-zero on constraint violations.

Recommended CI gate order:

```bash
mikk doctor
mikk analyze --strict-parsing
mikk ci --strict
```

---

## Language Support

| Language | Parser | Status |
|---|---|---|
| TypeScript / JavaScript | OxcParser (Rust) | ✅ Production |
| Python | Tree-sitter | ✅ Production |
| Go | Native (GoExtractor) | ✅ Production |
| Java | Tree-sitter | ✅ Production |
| Rust | Tree-sitter | ✅ Production |
| C / C++ | Tree-sitter | ✅ Production |
| C# | Tree-sitter | ✅ Production |
| PHP | Tree-sitter | ✅ Production |
| Swift | Tree-sitter | ✅ Production |
| Shell / Bash | Tree-sitter | ✅ Production |

> **10 languages verified in production** — tested with 71 functions, 18 classes, 134 call edges across 29 files.
> 
> **34 languages in registry** — Kotlin, Scala, Dart, Ruby, Zig, Elixir, Haskell, Clojure, F#, OCaml, Perl, R, SQL, Terraform, and more. These use tree-sitter grammars and can be enabled by adding test fixtures.
> 
> **24 languages parsed** in polyglot test: TypeScript, Python, Go, Java, Rust, C, C++, C#, PHP, Swift, Shell, Kotlin, Scala, Dart, Ruby, Haskell, Elixir, Clojure, F#, OCaml, Perl, R, Julia, Lua, SQL, Terraform

---

## Context & Search Flags — The Most Flexible System

Mikk provides **60+ flags** across context and search commands, giving you precise control over AI context generation and code search.

### `mikk context` Flags

| Flag | Description | Example |
|------|-------------|---------|
| `--provider claude\|generic\|compact` | Output format for AI | `--provider claude` |
| `--hops <n>` | Graph traversal depth (default 4) | `--hops 6` |
| `--tokens <n>` | Token budget for functions (default 6000) | `--tokens 10000` |
| `--strict` | High-precision mode: only tightly relevant context | `--strict` |
| `--must <terms>` | Required keywords (comma-separated) | `--must resolver,import` |
| `--all-keywords` | Require ALL extracted keywords to match | `--all-keywords` |
| `--min-keywords <n>` | Minimum keyword matches (default 1) | `--min-keywords 3` |
| `--exact-only` | Hard gate: only strict keyword matches | `--exact-only` |
| `--fail-fast` | Return empty if strict finds no match | `--fail-fast` |
| `--no-auto-fallback` | Disable fallback to balanced mode | `--no-auto-fallback` |
| `--no-callgraph` | Omit call/calledBy edges | `--no-callgraph` |
| `--file <path>` | Anchor traversal from specific file | `--file src/auth.ts` |
| `--module <id>` | Anchor traversal from specific module | `--module auth` |
| `--out <file>` | Write context to file | `--out context.md` |
| `--meta` | Print diagnostics (seed count, tokens, keywords) | `--meta` |

### `mikk search` Flags

| Flag | Description | Example |
|------|-------------|---------|
| `-l, --limit <n>` | Max results (default 10) | `--limit 50` |
| `--top <n>` | Show top N with bodies | `--top 5` |
| `--rich` | Rich output with signatures | `--rich` |
| `--minimal` | Minimal output (names only) | `--minimal` |
| `--json` | Output as JSON | `--json` |
| `-b, --body` | Include function bodies | `--body` |
| `--in <names>` | Search IN function bodies | `--in getUser,updateUser` |
| `--in-any` | Match in ANY of --in functions | `--in-any` |
| `--in-all` | Match in ALL of --in functions | `--in-all` (default) |
| `--max-lines <n>` | Max lines per body (default 50) | `--max-lines 100` |
| `--module <id>` | Filter by module (repeatable) | `--module auth --module users` |
| `--file <pattern>` | Filter by file pattern (repeatable) | `--file "*.controller.ts"` |
| `--exported` | Only exported functions | `--exported` |
| `--internal` | Only internal functions | `--internal` |
| `--async` | Only async functions | `--async` |
| `--returns <type>` | Return type contains | `--returns Promise` |
| `--param <name>` | Has parameter (repeatable) | `--param userId --param token` |
| `--calls <fn>` | Calls function (repeatable) | `--calls validateToken` |
| `--called-by <fn>` | Called by function (repeatable) | `--called-by authMiddleware` |
| `-m, --mode exact\|direct\|semantic\|hybrid` | Search mode (default hybrid) | `--mode semantic` |
| `--sort score\|name\|calls\|length` | Sort by field | `--sort calls` |
| `--list-modules` | List modules with counts | `--list-modules` |
| `--list-files` | List files with counts | `--list-files` |

### `mikk ci` Flags

| Flag | Description | Example |
|------|-------------|---------|
| `--strict` | Fail on dead code above threshold | `--strict` |
| `--dead-code-threshold <n>` | Max dead code % (default 20) | `--dead-code-threshold 10` |
| `--format text\|json` | Output format | `--format json` |

### `mikk contract` Flags

| Flag | Description | Example |
|------|-------------|---------|
| `--boundaries-only` | Skip drift check, only boundaries | `--boundaries-only` |
| `--drift-only` | Skip boundaries, only drift | `--drift-only` |
| `--strict` | Exit 1 on warnings | `--strict` |

### `mikk init` Flags

| Flag | Description | Example |
|------|-------------|---------|
| `--force` | Overwrite existing mikk.json | `--force` |
| `--strict-parsing` | Fail if any files can't be parsed | `--strict-parsing` |
| `--no-context` | Skip context file discovery | `--no-context` |

> **Total: 60+ flags** — no other code intelligence tool comes close to this level of control.

---

## Why Mikk Wins — Direct Competitor Comparison

### Tier 1: True Core Competitors (Building the Same Thing)

| Feature | Mikk | GitNexus | CodeGraphContext |
|---------|------|----------|-------------------|
| **Full call graph** | ✅ | ✅ | ✅ |
| **MCP integration** | ✅ | ✅ | ✅ |
| **Multi-language (10+)** | ✅ | ⚠️ | ⚠️ |
| **Deterministic hashing** | ✅ | ❌ | ❌ |
| **Architecture contracts** | ✅ | ❌ | ❌ |
| **CI gate enforcement** | ✅ | ❌ | ❌ |
| **100% local/offline** | ✅ | ✅ | ❌ |
| **Open source** | ✅ (Apache 2.0) | ⚠️ (PolyForm) | ✅ |
| **Token-budgeted AI context** | ✅ | ❌ | ❌ |

### Tier 2: Same Problem, Different Approach

| Feature | Mikk | Greptile | DeepWiki | Repomix |
|---------|------|----------|----------|----------|
| **Graph-native code understanding** | ✅ | ❌ | ❌ | ❌ |
| **Call graph precision** | ✅ | ❌ | ❌ | ❌ |
| **Deterministic (not RAG)** | ✅ | ❌ | ❌ | ❌ |
| **AI-ready context generation** | ✅ | ⚠️ | ⚠️ | ⚠️ |
| **CLI-first developer UX** | ✅ | ❌ | ❌ | ⚠️ |
| **MCP server** | ✅ | ❌ | ❌ | ❌ |

### Tier 3: Legacy / Partial Overlap

| Feature | Mikk | JArchitect | Axon | Aider |
|---------|------|------------|------|-------|
| **AI-native** | ✅ | ❌ | ❌ | ⚠️ |
| **MCP-driven** | ✅ | ❌ | ❌ | ❌ |
| **Architecture constraints** | ✅ | ⚠️ | ❌ | ❌ |
| **Lightweight (WASM)** | ✅ | ❌ | ⚠️ | ✅ |

> **Legend**: ✅ = Full support | ⚠️ = Limited/Partial | ❌ = Not available

---

## What Makes Mikk Unique (That Competitors Don't Have)

### 1. Deterministic (Not Probabilistic)
- **Mikk**: SHA-256 hashes at every level (function → file → module → root)
- **Competitors**: Use RAG/summarization/embeddings — AI can guess wrong
- **Result**: Same code always produces identical output. Zero ambiguity.

### 2. Architecture Contracts + CI Enforcement
- **Mikk**: Define `auth must not import from payments` → enforced in CI
- **Competitors**: GitNexus has graph, no contracts. None have CI gates.
- **Result**: `mikk ci` exits non-zero before violations reach production

### 3. Token-Budgeted AI Context
- **Mikk**: BFS graph traversal with configurable token limits
- **Competitors**: Repomix compresses, Greptile searches — no structured traversal
- **Result**: AI gets exactly what it needs, no overflow, no guesswork

### 4. 100% Local with MCP
- **Mikk**: WASM-based, runs offline, MCP server for Claude/Cursor
- **Competitors**: GitNexus has cloud, CodeGraphContext needs graph DB backend
- **Result**: Works in air-gapped environments, no data leaves your machine

### 5. Full Pipeline: Parse → Graph → Cluster → Hash → Contract → Serve
- **Mikk**: Complete end-to-end system
- **Competitors**: Only do parts (indexing, or search, or visualization)

---

## The Real Positioning

> **Mikk is building: "Code Intelligence Infrastructure for AI Agents"**

Unlike competitors using RAG/summarization, Mikk provides:
- Deterministic, graph-based understanding of your codebase
- Architectural contracts with CI safety gates
- MCP-native AI context generation
- 100% local/offline operation

---

## Real-World Advantages

| Scenario | With Mikk | Without Mikk |
|----------|-----------|--------------|
| AI asks "what calls this function?" | Instant call graph | Manual grep + guess |
| Refactor a core module | Know all affected functions | Hope tests catch everything |
| AI edits auth code | See 14 functions across 3 modules that will break | Blind edit, broken build |
| New developer joins | `mikk context for "explain auth flow"` = complete explanation | Read 47 files manually |
| CI runs | `mikk ci` catches constraint violations | Runtime errors in production |
| Find dead code | `mikk dead-code` = precise list | Static analysis guesswork |

---

## Packages

| Package | Description |
|---|---|
| `@getmikk/core` | AST parsing, dependency graph, BM25, hashing, contract management |
| `@getmikk/cli` | CLI commands |
| `@getmikk/mcp-server` | MCP tools, caching, staleness detection |
| `@getmikk/ai-context` | BFS context builder, token budgeting, claude.md generation |
| `@getmikk/intent-engine` | Intent parsing, conflict detection, semantic search |
| `@getmikk/watcher` | Incremental file watcher |
| `mikk` (VS Code) | Extension — Dashboard, dead code view, status bar |

---

## License

Apache 2.0
