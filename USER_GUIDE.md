# Mikk User Guide

Welcome to Mikk! Mikk is an intelligent, codebase nervous system designed to help you instantly understand architecture across **10+ programming languages** (TypeScript, Python, Java, Go, Rust, C++, etc.), pull context for your AI assistants, and safely manage changes with impact analysis.

This guide will walk you through the core CLI commands and demonstrate how to use Mikk effectively in your day-to-day workflow.

---

## 🚀 Getting Started

To get started with Mikk in your existing project, run:

```bash
mikk init
```

This will initialize Mikk in your project, generate a skeleton `mikk.json` contract file, and create an initial lockfile (`mikk.lock.json`) to track the current state of your codebase.

**What gets created:**
- `mikk.json` - Architecture contract (edit to refine your modules)
- `mikk.lock.json` - Auto-generated lock file (commit this)
- `.mikk/` - Internal data
- `claude.md` - AI context for Claude
- `AGENTS.md` - AI context for Codex/Copilot
- `.clinerules` - Auto-imported instructions for Cline/OpenClaw

---

## 📋 Command Reference

### Core Analysis

#### `mikk init`
Initialize Mikk in the current project.

```bash
mikk init                  # Initialize with auto-detected settings
mikk init --force          # Re-initialize (overwrites existing files)
mikk init --strict-parsing # Fail if any files could not be parsed cleanly
```

Creates: `mikk.json`, `mikk.lock.json`, `.mikk/`, `claude.md`, `AGENTS.md`, `.clinerules`

#### `mikk analyze`
Re-analyze codebase and update lock + derived artifacts.

```bash
mikk analyze                   # Analyze and update all artifacts
mikk analyze --strict-parsing  # Use stricter parsing (faster but may miss code)
```

This updates: `mikk.lock.json`, `claude.md`, `AGENTS.md`, `.clinerules`

#### `mikk watch`
Watch for file changes and sync lock file automatically (daemon).

```bash
mikk watch                # Start the watcher daemon
mikk watch --debounce 500 # Custom debounce delay in ms (default: 100)
mikk watch --obsidian     # Also regenerate Obsidian vault on every graph update
mikk watch &              # Run in background (Unix/macOS)
```

The watcher monitors file changes with 100ms debounce and auto-updates the lock file.

**`--obsidian`:** On every `graph:updated` event the watcher runs `node scripts/mikk-to-obsidian.mjs --all-fns` and regenerates a complete Obsidian-compatible Markdown vault in `mikk-vault/`. Any error from the sync is shown in the terminal with the first stderr line.

#### `mikk diff`
Show what changed since last analysis.

```bash
mikk diff                    # Show all changes since last analyze
mikk diff | head -20         # Preview first 20 changes
```

**Important:** This compares the lock file against your **current filesystem**, not git history. Run `mikk analyze` to update the lock file with your changes.

---

### Health & Diagnostics

#### `mikk doctor`
Check project health: config files, lock freshness, parser runtime.

```bash
mikk doctor               # Run all health checks
```

Checks: `mikk.json`, lock file, lock status, tsconfig, node_modules, `.mikkignore`, `.mikk` directory, and parser runtime availability.

#### `mikk stats`
Show codebase health statistics.

```bash
mikk stats              # Show formatted statistics
mikk stats --format json   # Machine-readable output
```

Shows: functions, modules, dead code percentage, constraint violations.

#### `mikk suggest`
Show practical next steps based on current project state.

```bash
mikk suggest              # See what to do next
```

Analyzes your project state and suggests relevant next steps, such as refreshing stale locks, fixing boundary violations, or reviewing dead code candidates.

---

### Contract & Validation

#### `mikk contract validate`
Validate contract: check file drift AND boundary violations.

```bash
mikk contract validate              # Check drift and boundaries
mikk contract validate --boundaries-only   # Only check module boundaries
mikk contract validate --drift-only        # Only check for new/modified/deleted files
mikk contract validate --strict             # Exit 1 on warnings too
```

**Important:** Drift check compares lock file against **current filesystem**, not git history.

- `(new file)` = in lock but not on disk
- `(modified)` = hash changed since last analyze  
- `(deleted)` = on disk but not in lock

#### `mikk contract show-boundaries`
Show all current cross-module calls (useful for writing constraints).

```bash
mikk contract show-boundaries
```

Shows cross-module dependency map with call counts. Copy output into `mikk.json` constraints to enforce boundaries.

---

### CI Integration

#### `mikk ci`
Check architectural constraints for CI pipelines (exits non-zero on violations).

```bash
mikk ci --strict                         # Basic CI check (boundaries only)
mikk ci --strict --dead-code-threshold 15   # Also check dead code (15% threshold)
mikk ci --strict --format json           # JSON output for CI parsing
```

**Recommended CI pipeline:**
```bash
mikk doctor
mikk analyze --strict-parsing
mikk ci --strict
```

---

### AI Context Generation

The `mikk context` command suite is specifically built for AI assistants.

#### `mikk context query`
Ask an architecture question.

```bash
mikk context query "How does authentication work here?"
mikk context query "Find the database connection pool" --strict  # High-precision mode
mikk context query "auth middleware" --tokens 8000             # Custom token budget
mikk context query "payment processing" --out context.md       # Write to file
```

**Options:**
- `--provider <claude|generic|compact>` - Output format (default: claude)
- `--hops <n>` - Graph traversal depth (default: 4)
- `--tokens <n>` - Token budget for functions (default: 6000)
- `--strict` - High-precision mode: include only tightly relevant context
- `--must <terms>` - Comma-separated required terms
- `--no-callgraph` - Omit call/calledBy edges from output
- `--out <file>` - Write context to a file instead of stdout
- `--meta` - Print meta diagnostics (seed count, tokens used, keywords)

#### `mikk context impact`
What breaks if this file changes?

```bash
mikk context impact packages/cli/src/commands/init.ts
mikk context impact src/auth/jwt.ts --tokens 10000
```

**Options:**
- `--provider <claude|generic|compact>` - Output format (default: claude)
- `--tokens <n>` - Token budget (default: 8000)

#### `mikk context for`
Get AI context payload for a specific development task.

```bash
mikk context for "Add a new backend route for user profile"
mikk context for "Refactor the auth module" --file src/auth/index.ts
mikk context for "Add rate limiting" --module api
```

**Options:**
- `--provider <claude|generic|compact>` - Output format (default: claude)
- `--hops <n>` - Graph traversal depth (default: 4)
- `--tokens <n>` - Token budget for functions (default: 6000)
- `--strict` - High-precision mode
- `--file <path>` - Anchor traversal from a specific file
- `--module <id>` - Anchor traversal from a specific module
- `--no-callgraph` - Omit call/calledBy edges
- `--out <file>` - Write context to a file instead of stdout
- `--meta` - Print meta diagnostics

#### `mikk context list`
List all modules and their function counts.

```bash
mikk context list
```

---

### Preflight & Intent

#### `mikk intent`
Full preflight check — interpret intent, suggest changes, detect conflicts.

```bash
mikk intent "Rename auth to authentication module"
mikk intent "Add rate limiting to payments" --json
```

Analyzes your intent, detects conflicts with existing architecture, and suggests implementation steps.

---

### Dead Code Detection

#### `mikk dead-code`
Detect dead code — functions with zero callers after multi-pass exemptions.

```bash
mikk dead-code              # List all dead code candidates
mikk dead-code --module cli # Filter to specific module
mikk dead-code --json       # Machine-readable output
```

---

### Search & Trace

#### `mikk search <query>`
Search codebase semantically using local vector embeddings.

```bash
mikk search "authentication middleware"
mikk search "database connection pooling" --limit 20
```

**Requires:** `@xenova/transformers` installed in your project root (`npm install @xenova/transformers`). The model (~22MB) downloads once and runs entirely locally — no API key or internet connection needed after that. If the package is not installed, the command falls back to keyword search.

#### `mikk trace <functionId> <variable>`
Trace the origin of a variable through the codebase (taint analysis).

```bash
mikk trace "src/auth/jwt.ts:verifyToken" userId
mikk trace "src/api/handler.ts:handle" req
```

Use function IDs from `mikk stats` or `mikk search` results.

---

### MCP Server

#### `mikk mcp`
Start the MCP server, or install it into your AI tool config.

```bash
mikk mcp start                    # Start MCP server (stdio mode)
mikk mcp install                  # Install into Claude Desktop, Cursor, VS Code
mikk mcp install --tool claude    # Install only into Claude Desktop
mikk mcp install --dry-run        # Preview what would be written
```

**Recommended session start sequence for AI agents:**
1. `mikk_get_session_context` — call once per session for project overview
2. `mikk_get_changes` — see what drifted since last analyze
3. `mikk_change_plan "<task>"` — one-shot pre-flight before any complex change
4. `mikk_before_edit` — mandatory gate before touching any file

---

### ADR Management

#### `mikk adr list`
List all architectural decisions.

```bash
mikk adr list
```

#### `mikk adr get <id>`
Get details for a specific architectural decision.

```bash
mikk adr get wasm-parsing
```

#### `mikk adr add`
Add a new architectural decision.

```bash
mikk adr add --id use-tree-sitter --title "Use tree-sitter for parsing" --reason "Better performance and accuracy"
```

**Options:**
- `-i, --id <id>` - Unique identifier (e.g., "wasm-parsing")
- `-t, --title <title>` - Short, descriptive title
- `-r, --reason <reason>` - Detailed reason for the decision
- `-d, --date <date>` - Date (defaults to today)

#### `mikk adr rm <id>`
Remove an architectural decision.

```bash
mikk adr rm wasm-parsing
```

---

### Cleanup

#### `mikk remove`
Remove Mikk from the project and delete all generated artifacts.

```bash
mikk remove              # Interactive confirmation
mikk remove --force      # Skip confirmation and immediately delete
```

---

### Self-Update

#### `mikk update`
Update Mikk CLI.

```bash
mikk update                  # Interactive mode
mikk update --channel stable # Stable channel
mikk update --channel latest # Latest (pre-release)
mikk update --version 2.1.0 # Specific version
mikk update --yes            # Skip confirmation
```

---

## 🛡️ Module Constraints

Constraints enforce architectural rules about which modules can import from or call each other. Add them to `mikk.json`:

```json
{
  "declared": {
    "constraints": [
      "auth must not import from payments",
      "ui can only import from utils",
      "core is isolated"
    ]
  }
}
```

### Constraint Types

| Syntax | Description |
|--------|-------------|
| `module must not import from otherModule` | Deny import from another module |
| `module must not call into otherModule` | Deny function calls to another module |
| `module can only import from a, b` | Allow imports ONLY from listed modules |
| `module is isolated` | Module cannot have any cross-module imports |
| `module:moduleId` | Use `module:` prefix for explicit module IDs |

### Examples

```json
{
  "declared": {
    "constraints": [
      "auth must not import from payments",
      "ui can only import from utils, types",
      "core is isolated",
      "module:api cannot import module:db"
    ]
  }
}
```

### How Constraints Work

1. **Function call tracking**: Analyzes call graph between functions in different modules
2. **File import tracking**: Checks cross-module imports in source files
3. **VS Code integration**: Shows violations inline via `mikk_validate_edit` tool
4. **CI enforcement**: Fails builds when constraints are violated

---

## 🧠 AI Intent Preflight

Use the intent engine to suggest code changes and run impact analysis before executing them:

```bash
mikk intent "Extract the user validation logic into a shared module"
```

This interprets your prompt, suggests changes, detects conflicts, and validates architectural safety.

---

## 📝 Tips for Best Results

1. **Keep Mikk Watched**: Run `mikk watch` in a separate terminal while developing so your lock and AI contexts are always real-time.
2. **Commit `mikk.json` and `mikk.lock.json`**: Treat them like `package.json` and `package-lock.json`. These files serve as the source of truth for your codebase's architectural boundaries.
3. **Use with VS Code**: Check out the `@mikk/vscode-extension` to get visual charts and context tools directly in your editor's sidebar!

---

## 🧭 Standard Workflows

### Developer Workflow

```bash
mikk analyze
mikk context query "How does this module connect?"
mikk ci --strict
```

### AI-Assisted Workflow

```bash
mikk analyze
mikk context for "Describe the planned refactor"
mikk intent "Validate safety and impact for this change"
```

### CI Pipeline

```bash
mikk doctor
mikk analyze --strict-parsing
mikk ci --strict
```

If `mikk doctor` reports missing parser runtime on non-TS/JS projects, install parser runtime dependencies and rerun doctor before continuing.

---

## 🔄 Updating Mikk CLI

Mikk supports interactive and scripted self-update modes:

```bash
mikk update
```

Scripted modes:

```bash
mikk update --channel stable
mikk update --channel latest
mikk update --channel version --version 2.1.0
```

Use `--yes` to skip confirmation prompts in automation.
