# @getmikk/cli

> The `mikk` command — initialize, analyze, watch, query, and guard your codebase architecture.

[![npm](https://img.shields.io/npm/v/@getmikk/cli)](https://www.npmjs.com/package/@getmikk/cli)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](../../LICENSE)

`@getmikk/cli` wires together the entire Mikk ecosystem — parsing, graph building, Merkle hashing, AI context, intent pre-flight, MCP server — into a single developer workflow.

> Part of [Mikk](../../README.md) — live architectural context for your AI agent.

---

## Installation

```bash
npm install -g @getmikk/cli
# or
bun add -g @getmikk/cli
```

---

## Quick Start

```bash
cd my-project
mikk init
```

Scans all source files, builds the dependency graph, detects modules, and writes:

- `mikk.json` — architecture contract
- `mikk.lock.json` — full codebase snapshot
- `claude.md` + `AGENTS.md` — AI context files

---

## Commands

### `mikk init`

Full codebase scan and artifact generation.

```bash
mikk init
mikk init --force            # re-initialize even if mikk.json exists
mikk init --strict-parsing   # fail if parser diagnostics are detected
```

### `mikk analyze`

Re-analyze and update all artifacts. Incremental by default — only re-parses files whose content hash changed.

```bash
mikk analyze
mikk analyze --strict-parsing
```

After `mikk analyze`, the MCP server's cache is busted on the next tool call — it compares lock file mtime against `cachedAt`.

### `mikk watch`

Live file watcher daemon. Keeps the lock file in sync as you edit.

```bash
mikk watch
```

Uses debounced incremental analysis with atomic lock writes. Single-instance enforced via PID file.

### `mikk diff`

Show what changed since the last analysis (hash comparison against lock file).

```bash
mikk diff
```

### `mikk doctor`

Health check: config files, lock freshness, parser runtime availability.

```bash
mikk doctor
```

### `mikk ci`

CI gate — exits non-zero on constraint violations.

```bash
mikk ci
mikk ci --strict                        # also enforce dead code threshold
mikk ci --dead-code-threshold 15        # custom threshold (default: 20%)
mikk ci --format json                   # structured output
```

### `mikk contract`

```bash
mikk contract validate                  # drift + boundary check
mikk contract validate --boundaries-only
mikk contract validate --drift-only
mikk contract validate --strict         # warnings become errors
mikk contract show-boundaries           # show all cross-module calls
```

### `mikk context`

```bash
mikk context query "How does auth work?"
mikk context query "..." --provider claude --hops 5 --tokens 10000
mikk context impact src/auth/login.ts
mikk context for "Add rate limiting to API endpoints"
mikk context list
```

**Flags for `context query` / `context for`:**

| Flag | Default | Description |
|------|---------|-------------|
| `--provider` | `generic` | `claude` (XML tags) · `generic` · `compact` |
| `--hops` | `4` | BFS depth from seed functions |
| `--tokens` | `6000` | Token budget for function bodies |
| `--strict` | off | High-precision: exact keyword matches only |
| `--must <terms>` | — | Required terms (comma-separated) |
| `--file <path>` | — | Anchor traversal from specific file |
| `--module <id>` | — | Anchor traversal from specific module |
| `--no-callgraph` | — | Omit call/calledBy edges |
| `--out <file>` | — | Write to file instead of stdout |
| `--meta` | — | Print diagnostics (seeds, keywords, tokens) |

### `mikk intent`

Pre-flight a plain-English plan before writing code.

```bash
mikk intent "Add a caching layer to the auth module"
mikk intent "..." --json
```

### `mikk dead-code`

```bash
mikk dead-code
mikk dead-code --module auth
mikk dead-code --json
```

### `mikk stats`

Per-module metrics: function counts, exported APIs, dead code %, constraint status, cohesion, and coupling scores.

```bash
mikk stats
```

### `mikk suggest`

Practical next-step recommendations based on current project state.

```bash
mikk suggest
```

### `mikk mcp`

```bash
mikk mcp                               # start MCP server (stdio)
mikk mcp install                       # auto-detect and install into AI tools
mikk mcp install --tool claude         # Claude Desktop only
mikk mcp install --tool cursor
mikk mcp install --tool vscode
mikk mcp install --dry-run             # preview without writing
```

### `mikk adr`

```bash
mikk adr list
mikk adr get <id>
mikk adr add --id use-jwt --title "Stateless JWT" --reason "No session storage"
mikk adr rm <id>
```

### `mikk visualize`

```bash
mikk visualize all             # regenerate all 7 diagram types
mikk visualize module auth     # specific module
```

### `mikk search`

Natural-language function search using local vector embeddings.

```bash
mikk search "authentication middleware"
mikk search "database connection pooling" --limit 20
```

Requires `@xenova/transformers` (`npm install @xenova/transformers`). The model (~22MB) downloads once and runs fully locally — no API key.

### `mikk remove`

Uninstall Mikk and delete all generated artifacts.

```bash
mikk remove
mikk remove --force
```

### `mikk update`

```bash
mikk update
mikk update --channel stable
mikk update --version 2.1.0
mikk update --yes               # skip confirmation
```

---

## Project Layout After `mikk init`

```
my-project/
├── mikk.json
├── mikk.lock.json
├── claude.md
├── AGENTS.md
└── .mikk/
    ├── diagrams/
    │   ├── main.mmd
    │   ├── health.mmd
    │   ├── matrix.mmd
    │   ├── flow-entrypoints.mmd
    │   ├── module-<id>.mmd
    │   └── capsule-<id>.mmd
    ├── hashes.db
    └── watcher.pid
```

---

## License

[Apache-2.0](../../LICENSE)
