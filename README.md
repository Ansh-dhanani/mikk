<p align="center">
  <img src="./assets/logo.png" alt="Mikk Logo" width="120" />
</p>

<h1 align="center">Mikk</h1>

<p align="center">
  <strong>Your AI doesn't understand your codebase. Mikk fixes that.</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/org/getmikk"><img src="https://img.shields.io/npm/v/@getmikk/core?label=%40getmikk%2Fcore&color=cb3837" alt="npm" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache%202.0-blue.svg" alt="License" /></a>
  <img src="https://img.shields.io/badge/runtime-Bun-f472b6" alt="Bun" />
  <img src="https://img.shields.io/badge/100%25-local-22c55e" alt="100% Local" />
</p>

<br />

<p align="center">
  <em>The codebase nervous system — parses your architecture, maps every dependency,<br/>and delivers the exact context your AI needs. Zero cloud. Zero config. Zero hallucination.</em>
</p>
 
<br />
 
<!-- 🖼️ SCREENSHOT: Place a terminal recording or hero screenshot here showing `mikk init` running on a project -->
<!-- Recommended: Use https://asciinema.org or https://github.com/faressoft/terminalizer for a GIF -->
<!-- <p align="center"><img src="./assets/hero-demo.gif" alt="Mikk Demo" width="720" /></p> -->

---

## The Problem

You copy 4,000 lines of source code into Claude. It generates a component that imports from `utils/auth` — a path that doesn't exist. Your `BoundaryChecker` lives in `src/core/contract/`, not where the LLM guessed. You spend 20 minutes fixing import paths, broken calls, and layer violations in AI-generated code.

**LLMs write great code — for codebases they've never seen.** They don't know your module boundaries. They can't trace your dependency graph. They have no idea that touching `login.ts` breaks 14 downstream functions across 3 packages. They get a flat paste of files and hallucinate the rest.

**Mikk gives your AI the architecture it's missing.**

One command. Your entire codebase — parsed, graphed, hashed, and served as structured, token-budgeted context. Locally. In milliseconds.

---

<table>
<tr>
<td align="center"><h2>90 files</h2><sub>of scattered source code<br/>your AI has to index</sub></td>
<td align="center"><h2>→</h2></td>
<td align="center"><h2>1 file</h2><sub><code>mikk.lock.json</code><br/>~12,900 lines · full structure</sub></td>
<td align="center"><h2>+</h2></td>
<td align="center"><h2>493 lines</h2><sub><code>claude.md</code> / <code>AGENTS.md</code><br/>architectural context</sub></td>
</tr>
</table>

> Mikk's algorithm parses your entire codebase and generates **`mikk.lock.json`** — a single structured file (~12,900 lines) containing every function signature, every dependency edge, every call graph, every module assignment, and every Merkle hash. Instead of your AI crawling through **90+ scattered source files**, it reads **one file** with the full architecture. On top of that, Mikk generates **`claude.md`** and **`AGENTS.md`** — distilled to **493 lines** of tiered context that fits in any AI's context window.

---

## Why Mikk is Fast

> Most dev tools scan your project and call it a day. Mikk was engineered from the ground up for **speed at scale**.

| Technique | What it does | Why it matters |
|-----------|-------------|----------------|
| **Merkle-tree hashing** | SHA-256 at function → file → module → root | One hash comparison = full drift detection. No diffing. |
| **Incremental analysis** | Only re-parses changed files on `watch` | 100-file change in a 10k-file project? Only those 100 get touched. |
| **BFS graph tracing** | Walks the dependency graph from seed nodes | Context is traced, not brute-forced. O(reachable) not O(codebase). |
| **Token budgeting** | Greedy knapsack packing by relevance score | AI gets max signal per token. No wasted context window. |
| **SQLite WAL mode** | Hash store uses Write-Ahead Logging | Concurrent reads during writes. No lock contention on watch. |
| **Atomic lock file writes** | Temp file → rename on every update | Zero chance of corrupted `mikk.lock.json`, even on crash. |
| **PID-based singleton** | Watcher daemon enforces single instance | No duplicate watchers eating CPU. |
| **Debounced batching** | File changes are batched within a window | Save 20 files at once? One re-analysis, not twenty. |
| **Turborepo caching** | Build artifacts cached across packages | Rebuild only what changed in the monorepo. |
| **Two-pass graph construction** | Nodes first, then edges in a single sweep | O(n) graph build, forward + reverse adjacency maps for O(1) lookups. |

---

## What Mikk Actually Does

```
npm install -g @getmikk/cli && cd my-project && mikk init
```

In ~3 seconds, Mikk:

1. **Parses** every TypeScript file via the TS Compiler API — real AST, not regex
2. **Builds** a full dependency graph (two-pass: nodes then edges, O(1) adjacency lookups)
3. **Clusters** files into logical modules via greedy agglomeration
4. **Hashes** everything with Merkle-tree SHA-256 (function → file → module → root)
5. **Detects** HTTP routes (Express, Koa, Hono) with method, path, handler, and middleware chain
6. **Generates** `mikk.json` (your architecture contract) + `mikk.lock.json` (full codebase snapshot)
7. **Generates** Mermaid architecture diagrams in `.mikk/diagrams/`
8. **Outputs** `claude.md` and `AGENTS.md` — ready-to-use AI context files

No cloud. No API keys. No telemetry. Everything stays on your machine.

---

## Features

<table>
<tr>
<td width="50%">

### AI Context Builder
Graph-traced, **token-budgeted** context payloads. BFS walks your call graph from seed functions, scores by relevance, and packs the optimal context within your token limit. No more dumping your whole repo into a prompt.

</td>
<td width="50%">

### Impact Analysis
See what breaks **before** you change it. BFS backward walk traces the full blast radius of any file — every upstream caller, every downstream dependency — in milliseconds.

</td>
</tr>
<tr>
<td width="50%">

### Intent Pre-flight
Describe what you want to build in plain English. Mikk parses it into structured intents, checks against **6 constraint types**, detects conflicts, and suggests an implementation plan — before a single line is written.

</td>
<td width="50%">

### Strict Contracts
Define module boundaries in `mikk.json`. CI fails if an import violates your architecture. Supports `no-import`, `must-use`, `no-call`, `layer`, `naming`, and `max-files` constraints.

</td>
</tr>
<tr>
<td width="50%">

### MCP Server
Expose your architecture to **Claude, Cursor, VS Code Copilot** — any MCP-compatible AI assistant. 12 tools, 3 resources, one command: `mikk mcp`.

</td>
<td width="50%">

### Merkle-Tree Drift Detection
SHA-256 hashes at every level: function → file → module → root. One hash comparison = full codebase drift check. Persisted in SQLite with WAL mode for zero-contention reads.

</td>
</tr>
<tr>
<td width="50%">

### Live Watcher
Incremental, debounced file watching with atomic lock file writes and PID-based singleton enforcement. Your architecture map stays in sync as you code — zero manual re-analysis.

</td>
<td width="50%">

### Full AST Parsing
TypeScript Compiler API extracts functions, classes, generics, imports (with tsconfig alias resolution), decorators, and type parameters. Not regex — real compiler-grade parsing. Every function gets its **exact file path, start line, and end line** stored in the lock file.

</td>
</tr>
<tr>
<td width="50%">

### Precise Code Location
Every context result, impact report, and function detail includes the **exact file + line range + actual source body**. Your AI isn't told *"the auth module handles login"* — it's told *"`validateToken()` is at `src/auth/login.ts:42–78` and here is the full code block.*"

</td>
<td width="50%">

### Architecture Decision Records
Document architectural decisions (ADRs) directly in `mikk.json`. Every AI context query surfaces relevant decisions alongside the code — so your AI knows *why* a constraint exists, not just *that* it does.

</td>
</tr>
</table>

---

## Real-World Use Cases

### "I need to add rate limiting to all API routes"
```bash
mikk context for "Add rate limiting to API endpoints"
```
Mikk finds every route handler, traces their middleware chains, identifies the right insertion points, and packages it all into a context payload your LLM can act on immediately.

### "What breaks if I refactor the auth module?"
```bash
mikk context impact src/auth/login.ts
```
Get the full blast radius — every function that calls into auth, every module that depends on it, and a Mermaid diagram showing the impact zone.

### "Is this change architecturally safe?"
```bash
mikk intent "Move user validation into a shared utils module"
```
Mikk checks your intent against all contract constraints, warns about layer violations, and tells you exactly which files will be affected — before you write any code.

### "My AI keeps hallucinating import paths"
```bash
mikk mcp
```
Connect Mikk as an MCP server. Now Claude/Cursor/Copilot can call `mikk_before_edit` before every change — getting the real exported API, real constraints, and real blast radius. When it calls `mikk_get_function_detail`, it gets the **exact file path, start line, end line, and full source body** — no guessing.

### "I need to point my AI to the exact code block to change"
```bash
mikk context for "fix the token refresh logic"
```
Mikk doesn't just return a module name. It returns the **exact function**, its **file path**, its **start and end line numbers**, and the **actual source code block** — ready to be passed directly to your AI as precise, actionable context.

### "New developer just joined — how do they understand the codebase?"
```bash
mikk init
```
Auto-generates `claude.md` and `AGENTS.md` with a tiered architecture summary — modules, entry points, key functions, constraints. New devs (and their AI assistants) get full context instantly.

---

## Quick Start

### Install

```bash
npm install -g @getmikk/cli
```

### Initialize

```bash
cd my-project
mikk init
```

### Explore

```bash
# Re-analyze after structural changes
mikk analyze

# See what changed since last analysis
mikk diff

# Ask your architecture a question
mikk context query "How does authentication work?"

# See the blast radius of a change
mikk context impact src/auth/login.ts

# Get AI context for a coding task
mikk context for "Add caching to the database layer"

# Pre-flight check a refactoring idea
mikk intent "Extract shared validation into a utils module"

# Generate architecture diagrams
mikk visualize all

# Visualize a specific module
mikk visualize module auth

# Visualize impact of current changes
mikk visualize impact

# Validate contracts in CI
mikk contract validate --boundaries-only --strict

# Start MCP server for AI assistants
mikk mcp

# Live watch mode
mikk watch
```

---

## Connect to Your AI Tools

### Claude Desktop
`claude_desktop_config.json`:
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

### Cursor
`.cursor/mcp.json`:
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

### VS Code Copilot
`.vscode/settings.json`:
```json
{
  "mcp.servers": {
    "mikk": {
      "command": "npx",
      "args": ["-y", "@getmikk/mcp-server", "/path/to/your/project"]
    }
  }
}
```

<details>
<summary><strong>All 12 MCP Tools</strong></summary>

| Tool | What it does |
|------|-------------|
| `mikk_get_project_overview` | Modules, function counts, tech stack, constraints |
| `mikk_query_context` | Ask an architecture question — returns graph-traced context |
| `mikk_impact_analysis` | Blast radius of changing a specific file |
| `mikk_before_edit` | Pre-edit check — exported functions at risk, constraints, blast radius |
| `mikk_find_usages` | Every function that calls a specific function |
| `mikk_list_modules` | All declared modules with file/function counts |
| `mikk_get_module_detail` | Functions, files, exported API, internal call graph for a module |
| `mikk_get_function_detail` | Params, return type, call graph, **exact file + start/end line + full source body** for a function |
| `mikk_search_functions` | Substring search across all function names |
| `mikk_get_constraints` | All architectural constraints and design decisions |
| `mikk_get_file` | Read raw source of any project file |
| `mikk_get_routes` | Detected HTTP routes (Express / Koa / Hono) |

**Resources:** `mikk://contract` · `mikk://lock` · `mikk://context`

</details>

---

## Contract Management

```bash
# Generate initial contract from auto-detected clusters
mikk contract generate

# Validate against the contract (CI mode)
mikk contract validate --boundaries-only --strict

# Show all cross-module dependencies
mikk contract show-boundaries

# Update the lock file after changes
mikk contract update
```

### Constraint Types

| Constraint | Description |
|-----------|-------------|
| `no-import` | Module must not import from specified modules |
| `must-use` | Module must use specified dependencies |
| `no-call` | Functions must not call specified targets |
| `layer` | Enforces layered architecture (can only import from lower layers) |
| `naming` | Enforces naming patterns via regex |
| `max-files` | Limits files per module |

---

## How It Works

```
 Parse ──→ Graph ──→ Cluster ──→ Hash ──→ Contract ──→ Context ──→ Serve
  │          │          │          │          │            │          │
  TS AST    Dep Graph  Module    Merkle    mikk.json    Token-     MCP
  Parser    Builder    Detection SHA-256   Validator    Budgeted   Server
```

<details>
<summary><strong>Deep Dive: The Full Pipeline</strong></summary>

### 1. Parse — Understand Your Code

Mikk uses the **TypeScript Compiler API** to parse every `.ts`/`.tsx` file into structured data:

- Functions — name, params with types, return type, **exact start + end line**, internal calls, async/generator flags, decorators, type parameters
- Classes — methods, properties, inheritance chains, decorators, **with per-method line ranges**
- Interfaces, type aliases, enums, const declarations
- Imports — named, default, namespace, type-only, with full resolution (tsconfig aliases, index files, extension inference)

### 2. Graph — Map Every Dependency

Two-pass `GraphBuilder` construction:

- **Nodes** — One per file, function, class, and generic declaration
- **Edges** — Import edges, function call edges, class containment, implements relationships

Result: a complete `DependencyGraph` with forward + reverse adjacency maps for O(1) traversal.

### 3. Hash — Detect Drift Instantly

Merkle-tree SHA-256 at every level:

```
function hash → file hash → module hash → root hash
```

One root hash comparison tells you if *anything* changed. Persisted in SQLite (WAL mode) for fast incremental checks.

### 4. Contract — Define Your Architecture

```json
{
  "modules": {
    "auth": {
      "intent": "Handle user authentication and session management",
      "include": ["src/auth/**"],
      "publicApi": ["login", "logout", "validateToken"],
      "constraints": {
        "no-import": ["payments"],
        "layer": 1
      }
    }
  }
}
```

6 constraint types: `no-import` · `must-use` · `no-call` · `layer` · `naming` · `max-files`

Supports **Architecture Decision Records** (ADRs) in your contract:

```json
{
  "decisions": [
    {
      "id": "ADR-001",
      "title": "Use JWT for stateless authentication",
      "date": "2024-01-15",
      "status": "accepted"
    }
  ]
}
```

### 5. AI Context — Surgical Precision

1. **Seed** — Match task keywords against the lock file
2. **Walk** — BFS trace the call graph outward from seeds
3. **Score** — Proximity + keyword + entry-point bonuses
4. **Budget** — Greedily fill token budget with highest-scoring functions
5. **Format** — XML tags (Claude) or plain text (generic)

### 6. Intent Pre-flight — Think Before You Code

1. **Interpret** — Parse prompt into structured intents (action + target + confidence)
2. **Detect** — Check against all 6 constraint types + boundary rules
3. **Suggest** — Affected files, new files, and impact estimate

### 7. MCP Server — Let AI See Your Architecture

12 tools + 3 resources exposed via the Model Context Protocol. Zero config. Works with Claude Desktop, Cursor, VS Code, and any MCP-compatible client.

Includes **automatic HTTP route detection** for Express, Koa, and Hono — method, path, handler function, middleware chain, file, and line number are all extracted and exposed via `mikk_get_routes`.

</details>

---

## Packages

Mikk is a Turborepo monorepo with **8 packages**:

| Package | Description |
|---------|-------------|
| [`@getmikk/core`](packages/core/) | Foundation — AST parsing, dependency graph, Merkle hashing, contract management, boundary checker, cluster detection |
| [`@getmikk/cli`](packages/cli/) | CLI — 15+ commands for init, analyze, diff, watch, contracts, context, intent, diagrams |
| [`@getmikk/ai-context`](packages/ai-context/) | AI context builder — BFS graph tracing, token budgeting, `claude.md`/`AGENTS.md` generation |
| [`@getmikk/intent-engine`](packages/intent-engine/) | Intent pre-flight — NL prompt parsing, conflict detection (6 rule types), implementation suggestions |
| [`@getmikk/diagram-generator`](packages/diagram-generator/) | Diagram engine — Mermaid.js architecture diagrams |
| [`@getmikk/mcp-server`](packages/mcp-server/) | MCP server — 12 tools, 3 resources for AI assistants |
| [`@getmikk/watcher`](packages/watcher/) | File watcher daemon — debounced, incremental, atomic updates |
| [`@getmikk/vscode-extension`](apps/vscode-extension/) | VS Code extension — module tree view, architecture diagrams panel, AI context generation, impact analysis, and status bar sync indicator |

**Apps:**

| App | Description |
|-----|-------------|
| [`apps/web`](apps/web/) | Web Dashboard & Contract Generator — browser-based UI for exploring your architecture |
| [`apps/registry`](apps/registry/) | Package registry — central index for published Mikk contracts |

### Package Dependency Graph

```
@getmikk/core              ← Foundation (no internal deps)
    ↑
@getmikk/intent-engine     ← depends on core
    ↑
@getmikk/ai-context        ← depends on core + intent-engine
@getmikk/diagram-generator ← depends on core
@getmikk/watcher           ← depends on core
@getmikk/mcp-server        ← depends on core + ai-context + intent-engine
    ↑
@getmikk/cli               ← depends on core + ai-context + diagram-generator + intent-engine + mcp-server
@getmikk/vscode-extension  ← depends on core + diagram-generator + ai-context
```

---

## Project Structure

After running `mikk init`, your project gets:

```
my-project/
├── mikk.json              ← Architecture contract (you own this)
├── mikk.lock.json         ← Full codebase snapshot (auto-generated)
├── claude.md              ← AI context for Claude
├── AGENTS.md              ← AI context for Codex/agents
└── .mikk/
    ├── diagrams/          ← Auto-generated Mermaid diagrams
    ├── hashes.db          ← SQLite Merkle hash store (WAL mode)
    └── watcher.pid        ← Daemon PID (singleton enforced)
```

---

## Development

```bash
git clone https://github.com/Ansh-dhanani/mikk.git
cd mikk
bun install
bun run build
bun run test    # 97 tests across 10 packages
```

### Tech Stack

| Tool | Purpose |
|------|---------|
| **Bun** | Runtime & package manager |
| **Turborepo** | Monorepo build orchestration |
| **TypeScript** | Language (strict mode) |
| **TypeScript Compiler API** | AST parsing |
| **Zod** | Schema validation |
| **better-sqlite3** | Hash persistence (WAL mode) |
| **Chokidar** | File watching |
| **Commander** | CLI framework |
| **@modelcontextprotocol/sdk** | MCP server protocol |
| **esbuild** | Bundling |

---

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

```bash
# Branch from main → make changes → test → PR
bun run test && bun run lint
```

---

## Documentation

| Resource | Description |
|----------|-------------|
| [User Guide](USER_GUIDE.md) | Complete walkthrough of all features |
| [@getmikk/core](packages/core/README.md) | AST parsing, graph building, hashing, contracts |
| [@getmikk/cli](packages/cli/README.md) | All CLI commands reference |
| [@getmikk/ai-context](packages/ai-context/README.md) | AI context builder internals |
| [@getmikk/intent-engine](packages/intent-engine/README.md) | Intent pre-flight system |
| [@getmikk/diagram-generator](packages/diagram-generator/README.md) | Mermaid diagram generation |
| [@getmikk/mcp-server](packages/mcp-server/README.md) | MCP server setup & tools |
| [@getmikk/watcher](packages/watcher/README.md) | File watcher daemon |
| [VS Code Extension](apps/vscode-extension/README.md) | Extension features & usage |

---

<p align="center">
  <strong>Apache-2.0</strong> — see <a href="LICENSE">LICENSE</a>
</p>

<p align="center">
  <br />
  <strong>Stop feeding your AI blind. Give it Mikk.</strong>
  <br />
  <br />
  <code>npm install -g @getmikk/cli && mikk init</code>
</p>



