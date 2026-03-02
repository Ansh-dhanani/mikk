<p align="center">
  <img src="./assets/logo.png" alt="Mikk Logo" width="180" />
</p>

<h1 align="center">Mikk</h1>

<p align="center">
  <strong>The Codebase Nervous System. Instant AI Context. 100% Local. 100% Fast.</strong><br>
  <strong>Understand your architecture. See the impact of your changes. Feed your LLMs the perfect context.</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/org/getmikk"><img src="https://img.shields.io/npm/v/@getmikk/core?label=%40getmikk%2Fcore" alt="npm" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License: MIT" /></a>
</p>

---

Mikk is the ultimate tool for codebase comprehension and safe refactoring. It acts as your project's **nervous system** — mapping out dependencies, enforcing architectural contracts, generating Mermaid diagrams, and giving your AI tools the exact context they need.

```
Instant Context · Mermaid Architecture Diagrams · Impact Analysis · Intent Pre-flight · VS Code Extension
```

---

## Features

- **Architectural Visualization** — Auto-generate 7 types of Mermaid.js diagrams: architecture overview, module detail, health dashboard, impact analysis, call flow, API capsule, and dependency matrix.
- **AI Context Builder** — Graph-traced, token-budgeted context payloads. Give your LLMs only what's relevant — not your entire codebase.
- **Impact Analysis** — See what breaks *before* you change it. BFS backward walk traces the full blast radius of any change.
- **Intent Pre-flight** — Parse natural-language prompts into structured intents, detect constraint conflicts, and get implementation suggestions — all before writing code.
- **Strict Contracts** — Enforce module boundaries via `mikk.json`. CI fails if an import violates your defined architecture. Supports `no-import`, `must-use`, `no-call`, `layer`, `naming`, and `max-files` constraints.
- **Live Watcher** — Incremental, debounced file watching with atomic lock file updates. Your `mikk.lock.json` stays in sync as you code.
- **Merkle-Tree Hashing** — SHA-256 hashes at function → file → module → root level. Detect drift instantly without diffing.
- **Lightning Fast** — Built on Bun and Turborepo. Everything is cached, incremental, and highly optimized.

---

## Quick Start

### Install from npm

```bash
npm install -g @getmikk/cli
```

### Initialize in your project

```bash
cd my-project
mikk init
```

This will:
1. Scan for TypeScript files
2. Parse them into ASTs (functions, classes, imports, exports, generics)
3. Build the full dependency graph
4. Auto-detect module clusters via greedy agglomeration
5. Generate `mikk.json` (architecture contract)
6. Generate `mikk.lock.json` (full codebase snapshot with Merkle hashes)
7. Generate Mermaid diagrams in `.mikk/diagrams/`
8. Generate `claude.md` and `AGENTS.md` for AI agents

### Common Commands

```bash
# Re-analyze codebase
mikk analyze

# See what changed
mikk diff

# Check for boundary violations (CI-ready)
mikk contract validate --boundaries-only --strict

# Ask an architecture question
mikk context query "How does authentication work?"

# Get impact analysis for a file
mikk context impact src/auth/login.ts

# Get AI context for a task
mikk context for "Add rate limiting to API endpoints"

# Intent pre-flight check
mikk intent "Add a caching layer to the auth module"

# Generate all diagrams
mikk visualize all

# Start live watcher
mikk watch
```

---

## Packages

Mikk is a Turborepo monorepo with 7 packages:

| Package | npm | Description |
|---------|-----|-------------|
| [`@getmikk/core`](packages/core/) | [![npm](https://img.shields.io/npm/v/@getmikk/core)](https://www.npmjs.com/package/@getmikk/core) | AST parsing (TypeScript Compiler API), dependency graph builder, Merkle-tree hashing, contract management (Zod schemas), boundary checker, cluster detection, and foundational utilities |
| [`@getmikk/intent-engine`](packages/intent-engine/) | [![npm](https://img.shields.io/npm/v/@getmikk/intent-engine)](https://www.npmjs.com/package/@getmikk/intent-engine) | AI pre-flight system — interprets natural-language prompts into structured intents, detects constraint conflicts (6 rule types), generates implementation suggestions |
| [`@getmikk/diagram-generator`](packages/diagram-generator/) | [![npm](https://img.shields.io/npm/v/@getmikk/diagram-generator)](https://www.npmjs.com/package/@getmikk/diagram-generator) | Mermaid.js chart generation — 7 diagram types: architecture, module detail, health, impact, call flow, capsule, and dependency matrix |
| [`@getmikk/watcher`](packages/watcher/) | [![npm](https://img.shields.io/npm/v/@getmikk/watcher)](https://www.npmjs.com/package/@getmikk/watcher) | Chokidar-powered file watcher daemon — debouncing, incremental analysis, race-condition protection, atomic lock file updates, PID-based single instance |
| [`@getmikk/ai-context`](packages/ai-context/) | [![npm](https://img.shields.io/npm/v/@getmikk/ai-context)](https://www.npmjs.com/package/@getmikk/ai-context) | Token-budgeted AI context builder — BFS graph tracing, relevance scoring, `claude.md`/`AGENTS.md` generation with tiered output |
| [`@getmikk/cli`](packages/cli/) | [![npm](https://img.shields.io/npm/v/@getmikk/cli)](https://www.npmjs.com/package/@getmikk/cli) | Command-line interface — 15+ commands for init, analyze, diff, watch, contract management, context queries, intent pre-flight, and diagram generation |
| [`@getmikk/vscode-extension`](apps/vscode-extension/) | *Marketplace* | VS Code extension — module tree view, architecture diagrams, AI context, impact analysis, status bar sync indicator |

### Dependency Graph

```
@getmikk/core              ← Foundation (no internal deps)
    ↑
@getmikk/intent-engine     ← depends on core
    ↑
@getmikk/ai-context        ← depends on core + intent-engine
@getmikk/diagram-generator ← depends on core
@getmikk/watcher           ← depends on core
    ↑
@getmikk/cli               ← depends on core + ai-context + diagram-generator + intent-engine
@getmikk/vscode-extension  ← depends on core + diagram-generator + ai-context
```

---

## How It Works

### 1. Parse — Understand Your Code

Mikk uses the **TypeScript Compiler API** to parse every `.ts`/`.tsx` file into structured data:

- Functions (name, params with types, return type, line range, internal calls, async/generator flags, decorators, type parameters)
- Classes (methods, properties, inheritance, decorators)
- Interfaces, type aliases, enums, const declarations
- Imports (named, default, namespace, type-only) and exports
- Full import resolution (relative paths, tsconfig aliases, index files, extension inference)

### 2. Graph — Map Dependencies

The `GraphBuilder` performs a two-pass construction:

1. **Nodes** — One node per file, function, class, and generic declaration
2. **Edges** — Import edges, function call edges, class containment, implements relationships

The result is a complete `DependencyGraph` with forward/reverse adjacency maps for fast traversal.

### 3. Hash — Detect Drift

Merkle-tree SHA-256 hashes are computed at every level:

```
function hash → file hash → module hash → root hash
```

Any change at the function level propagates up the tree. Comparing root hashes instantly tells you if anything drifted.

The `HashStore` persists hashes in a SQLite database (WAL mode) for fast incremental checks.

### 4. Contract — Define Boundaries

`mikk.json` defines your architecture:

```json
{
  "name": "my-project",
  "version": "1.0.0",
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
  },
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

The `BoundaryChecker` validates the actual codebase against these constraints. Use `mikk contract validate --strict` in CI to catch violations.

### 5. Visualize — See Your Architecture

Seven Mermaid diagram types are generated automatically:

| Diagram | Description | File |
|---------|-------------|------|
| **Main** | Overview of all modules with counts and inter-module edges | `main.mmd` |
| **Module** | Per-module detail with file subgraphs and call edges | `module-{id}.mmd` |
| **Health** | Cohesion %, coupling, function count, color-coded status | `health.mmd` |
| **Impact** | Changed nodes (red) and transitively impacted nodes (orange) | `impact.mmd` |
| **Flow** | Sequence diagram tracing call chains from a function | `flow-*.mmd` |
| **Capsule** | Public API surface with internal/external split | `capsule-{id}.mmd` |
| **Matrix** | N×N cross-module dependency count table | `matrix.mmd` |

### 6. AI Context — Feed Your LLMs

Instead of copying your whole codebase:

1. **Resolve seeds** — Match task keywords against the lock file
2. **BFS proximity walk** — Trace the call graph outward from seeds
3. **Score** — Proximity + keyword + entry-point bonuses
4. **Budget** — Greedily fill a token budget with highest-scoring functions
5. **Format** — XML tags (Claude) or plain text (generic)

Also generates `claude.md` and `AGENTS.md` with a tiered architecture summary.

### 7. Intent Pre-flight — Safe Changes

Before writing code, run `mikk intent "your prompt"`:

1. **Interpret** — Parse the prompt into structured intents (action + target + confidence)
2. **Detect** — Check against all 6 constraint types + boundary rules
3. **Suggest** — Generate affected files list, new files list, and impact estimate

---

## Contract Management

```bash
# Generate initial contract from auto-detected clusters
mikk contract generate

# Validate against the contract (CI mode)
mikk contract validate --boundaries-only --strict

# Show all cross-module dependencies
mikk contract show-boundaries

# Update the lock file
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

## Project Structure After `mikk init`

```
my-project/
├── mikk.json              ← Architecture contract (you edit this)
├── mikk.lock.json         ← Codebase snapshot (auto-generated)
├── claude.md              ← AI context file
├── AGENTS.md              ← AI context file
├── .mikk/
│   ├── diagrams/
│   │   ├── main.mmd
│   │   ├── health.mmd
│   │   ├── matrix.mmd
│   │   ├── flow-entrypoints.mmd
│   │   ├── module-*.mmd
│   │   └── capsule-*.mmd
│   ├── hashes.db          ← SQLite hash store
│   └── watcher.pid        ← Watcher PID (when running)
└── src/
    └── ...
```

---

## Development

```bash
# Clone
git clone https://github.com/Ansh-dhanani/mikk.git
cd mikk

# Install
bun install

# Build all packages
bun run build

# Run all tests (97 tests across 10 packages)
bun run test

# Build specific package
npx turbo build --filter=@getmikk/core

# Run specific tests
npx turbo test --filter=@getmikk/core
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
| **fast-glob** | File discovery |
| **Commander** | CLI framework |
| **chalk** + **ora** | Terminal UI |
| **esbuild** | CLI bundling |

---

## Documentation

- [User Guide](USER_GUIDE.md) — Complete reference for all features
- [Package: @getmikk/core](packages/core/README.md) — AST parsing, graph, hashing, contracts
- [Package: @getmikk/intent-engine](packages/intent-engine/README.md) — Intent pre-flight system
- [Package: @getmikk/diagram-generator](packages/diagram-generator/README.md) — Mermaid diagram generation
- [Package: @getmikk/watcher](packages/watcher/README.md) — File watcher daemon
- [Package: @getmikk/ai-context](packages/ai-context/README.md) — AI context builder
- [Package: @getmikk/cli](packages/cli/README.md) — CLI commands reference
- [VS Code Extension](apps/vscode-extension/README.md) — Extension features and usage

---

## License

MIT — see [LICENSE](LICENSE)

---

<p align="center">
  <strong>Mikk</strong> — The Codebase Nervous System. Understand faster.
</p>



