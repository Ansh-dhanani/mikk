# @getmikk/cli

> The `mikk` command — one binary to initialize, analyze, watch, validate, query, and serve your codebase architecture.

[![npm](https://img.shields.io/npm/v/@getmikk/cli)](https://www.npmjs.com/package/@getmikk/cli)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](../../LICENSE)

`@getmikk/cli` is the primary interface to the Mikk ecosystem. It wires together all packages — AST parsing, graph building, Merkle hashing, diagram generation, AI context, intent pre-flight, MCP server — into a single cohesive developer workflow. 15+ commands, one install.

> Part of [Mikk](../../README.md) — the codebase nervous system for AI-assisted development.

---

## Installation

```bash
npm install -g @getmikk/cli
# or
bunx @getmikk/cli
```

---

## Quick Start

```bash
# Initialize Mikk in your project
cd my-project
mikk init

# This will:
# 1. Scan for TypeScript files
# 2. Parse them into ASTs
# 3. Build the dependency graph
# 4. Auto-detect module clusters
# 5. Generate mikk.json (contract)
# 6. Generate mikk.lock.json (lock file)
# 7. Generate Mermaid diagrams in .mikk/diagrams/
# 8. Generate claude.md and AGENTS.md
```

---

## Commands

### `mikk init`

Initialize Mikk in the current directory. Performs a full codebase scan, builds the dependency graph, detects module clusters, and generates all artifacts.

```bash
mikk init
```

**Generated files:**
- `mikk.json` — Architecture contract (modules, constraints, decisions)
- `mikk.lock.json` — Full codebase snapshot with Merkle hashes
- `.mikk/diagrams/main.mmd` — Architecture overview diagram
- `.mikk/diagrams/health.mmd` — Module health dashboard
- `.mikk/diagrams/matrix.mmd` — Dependency matrix
- `.mikk/diagrams/module-*.mmd` — Per-module detail diagrams
- `.mikk/diagrams/capsule-*.mmd` — Per-module API capsule diagrams
- `.mikk/diagrams/flow-entrypoints.mmd` — Entry point flow diagram
- `claude.md` / `AGENTS.md` — AI agent context files

---

### `mikk analyze`

Re-analyze the codebase and update all generated files. Run this after making code changes to bring the lock file, diagrams, and AI context files up to date.

```bash
mikk analyze
```

---

### `mikk diff`

Show what changed since the last analysis. Compares current file hashes against the lock file.

```bash
mikk diff
```

**Output:**
```
Added:   src/auth/two-factor.ts
Modified: src/auth/login.ts
Deleted:  src/auth/legacy-auth.ts

3 files changed (1 added, 1 modified, 1 deleted)
```

---

### `mikk watch`

Start the live file watcher daemon. Keeps the lock file in sync as you edit code.

```bash
mikk watch
```

Uses `@getmikk/watcher` under the hood with debouncing, incremental analysis, and atomic writes. Press `Ctrl+C` to stop.

---

### `mikk contract` — Contract Management

#### `mikk contract validate`

Validate the current codebase against the contract. Checks for both file drift (hash mismatches) and boundary violations (cross-module constraint violations).

```bash
# Full validation (drift + boundaries)
mikk contract validate

# Boundaries only (ideal for CI)
mikk contract validate --boundaries-only

# Drift only
mikk contract validate --drift-only

# Strict mode — warnings become errors
mikk contract validate --strict
```

**Exit codes:**
- `0` — All checks pass
- `1` — Violations found

**CI integration example:**

```yaml
# GitHub Actions
- name: Check architecture boundaries
  run: mikk contract validate --boundaries-only --strict
```

#### `mikk contract generate`

Regenerate the `mikk.json` skeleton from the current codebase. Useful after major refactoring.

```bash
mikk contract generate
```

#### `mikk contract update`

Update the lock file to match the current codebase state.

```bash
mikk contract update
```

#### `mikk contract show-boundaries`

Display all current cross-module function calls — shows which modules depend on which.

```bash
mikk contract show-boundaries
```

**Output:**
```
auth → payments:
  login.ts::processPayment → payments/stripe.ts::createCharge
  login.ts::checkSubscription → payments/billing.ts::getSubscription

payments → users:
  billing.ts::getUserPlan → users/profile.ts::getPlan

Total: 3 cross-module calls
```

---

### `mikk context` — AI Context Queries

#### `mikk context query <question>`

Ask an architecture question. The CLI traces the dependency graph and returns relevant context.

```bash
mikk context query "How does authentication work?"

# Options
mikk context query "..." --provider claude    # Format for Claude (XML tags)
mikk context query "..." --provider generic   # Plain text format
mikk context query "..." --hops 5            # BFS depth limit
mikk context query "..." --tokens 12000      # Token budget
mikk context query "..." --no-callgraph      # Exclude call graph
mikk context query "..." --out context.md    # Write to file
mikk context query "..." --meta              # Show metadata (seeds, keywords, etc.)
```

#### `mikk context impact <file>`

Analyze what breaks if a specific file changes.

```bash
mikk context impact src/auth/login.ts

# Options
mikk context impact src/auth/login.ts --provider claude
mikk context impact src/auth/login.ts --tokens 8000
```

#### `mikk context for <task>`

Get AI context for a specific task.

```bash
mikk context for "Add rate limiting to API endpoints"
```

---

### `mikk intent <prompt>` — Pre-flight Check

Run the full intent engine pipeline: interpret the prompt, detect conflicts, and suggest an implementation plan.

```bash
mikk intent "Add a caching layer to the auth module"

# Options
mikk intent "..." --no-confirm   # Skip confirmation prompts
mikk intent "..." --json         # Output as JSON
```

**Output:**
```
🔍 Interpreting prompt...

Intents:
  1. [CREATE] CacheLayer in module auth (confidence: 0.85)

⚠️  Conflicts:
  [warning] Creating new files in auth module — check naming constraint: ^handle|^use|^get

📋 Suggestions:
  Intent 1: Create CacheLayer
    Affected files: src/auth/login.ts, src/auth/session.ts
    New files: src/auth/cache-layer.ts
    Impact: medium

✅ No blocking conflicts. Proceed? (y/n)
```

---

### `mikk visualize` — Diagram Generation

#### `mikk visualize all`

Regenerate all Mermaid diagrams.

```bash
mikk visualize all
```

#### `mikk visualize module <id>`

Regenerate the diagram for a specific module.

```bash
mikk visualize module auth
```

#### `mikk visualize impact`

Generate an impact diagram based on current file changes (files that differ from the lock file).

```bash
mikk visualize impact
```

---

### `mikk mcp` — MCP Server for AI Assistants

Connect your project architecture to Claude Desktop, Cursor, VS Code, or any MCP-compatible AI tool. The MCP server exposes 15 tools and 3 resources for your assistant, all powered by the Mikk lock file.

#### `mikk mcp` (default: start server)

Start the MCP (Model Context Protocol) stdio server.

```bash
# Start server
mikk mcp

# Start with custom project root
mikk mcp start --project /path/to/project
```

#### `mikk mcp install`

Auto-detect and install Mikk as an MCP server into Claude Desktop, Cursor, or VS Code configurations. Handles platform-specific config paths automatically.

```bash
# Install into all detected tools
mikk mcp install

# Install into specific tool
mikk mcp install --tool claude
mikk mcp install --tool cursor
mikk mcp install --tool vscode

# Preview what would be installed without making changes
mikk mcp install --dry-run

# Install with custom project path
mikk mcp install --project /path/to/project
```

**Platform-specific config paths:**
- **Claude Desktop**: `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows/Linux)
- **Cursor**: `~/Library/Application Support/Cursor/User/globalStorage/cursor.mcp/settings.json` (macOS) or `%APPDATA%\Cursor\User\globalStorage\cursor.mcp\settings.json`
- **VS Code**: `.vscode/mcp.json` in your project root

**Error handling:**
- If a config file is malformed JSON, the installer will report the error and skip that tool (unless `--dry-run` is used to inspect without side effects)
- If no supported tools are detected, the installer prints the known targets and suggested next steps

---

## Global Options

| Flag | Description |
|------|-------------|
| `--version`, `-V` | Print version |
| `--help`, `-h` | Show help |

---

## Project Structure After Init

```
my-project/
├── mikk.json              ← Architecture contract
├── mikk.lock.json         ← Codebase snapshot (auto-generated)
├── claude.md              ← AI context file
├── AGENTS.md              ← AI context file (same content)
├── .mikk/
│   ├── diagrams/
│   │   ├── main.mmd       ← Architecture overview
│   │   ├── health.mmd     ← Module health dashboard
│   │   ├── matrix.mmd     ← Dependency matrix
│   │   ├── flow-entrypoints.mmd
│   │   ├── module-auth.mmd
│   │   ├── module-payments.mmd
│   │   ├── capsule-auth.mmd
│   │   └── capsule-payments.mmd
│   ├── hashes.db          ← SQLite hash store
│   └── watcher.pid        ← Watcher PID (when running)
└── src/
    └── ...
```

---

## Dependencies

| Package | Purpose |
|---------|---------|
| `@getmikk/core` | Parsing, graph, hashing, contracts |
| `@getmikk/ai-context` | Context building, claude.md generation |
| `@getmikk/diagram-generator` | Mermaid diagram generation |
| `@getmikk/intent-engine` | Pre-flight intent analysis |
| `commander` | CLI framework |
| `chalk` | Terminal colors |
| `ora` | Spinners |

---

## License

[Apache-2.0](../../LICENSE)
