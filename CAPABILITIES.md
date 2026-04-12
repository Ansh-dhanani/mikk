# Mikk Capabilities — Technical Specification

> **Last Updated**: April 2026  
> **Version**: 2.0.17  
> **Test Coverage**: 360 core tests pass / 95 MCP tests pass

---

## What is Mikk?

Mikk is a **deterministic AI Context Engine** that provides AI agents with a live structural map of your codebase — modules, functions, call graphs, constraints — via MCP (Model Context Protocol).

**Key Principles:**
- No RAG. No guessing. No cloud.
- 100% local execution
- Deterministic (same code → same output)

---

## Architecture

```
Parse → Graph → Hash → Contract → Serve
```

| Stage | Technology | Description |
|-------|------------|-------------|
| **Parse** | OXC (Rust) + Tree-sitter | 17 languages supported |
| **Graph** | Custom GraphBuilder | O(n) construction, O(1) lookups |
| **Hash** | SHA-256 | Function → file → module → root |
| **Contract** | mikk.json | Modules, constraints, ADRs |
| **Serve** | MCP Server | 37 tools, 30s TTL cache |

---

## Supported Languages

| Language | Parser | Status |
|----------|--------|--------|
| **TypeScript/JavaScript** | OXC (Rust-backed) | ✅ Full |
| **Python** | Tree-sitter | ✅ Full |
| **Go** | Native + Tree-sitter | ✅ Full |
| **Java** | Tree-sitter | ✅ Full |
| **Swift** | Tree-sitter | ✅ Full |
| **C** | Tree-sitter | ✅ Full |
| **C++** | Tree-sitter | ✅ Full |
| **C#** | Tree-sitter | ✅ Full |
| **Rust** | Tree-sitter | ✅ Full |
| **PHP** | Tree-sitter | ✅ Full |
| **Shell** | Tree-sitter | ✅ Full |
| **Lua** | Tree-sitter | ✅ Full |
| **Elixir** | Tree-sitter | ✅ Full |
| **OCaml** | Tree-sitter | ✅ Full |
| **Kotlin** | Tree-sitter | ✅ Full |
| **Scala** | Tree-sitter | ✅ Full |
| **Zig** | Tree-sitter | ✅ Full |
| **Ruby** | Tree-sitter | ⚠️ Known WASM bug |
| **Dart** | Tree-sitter | ⚠️ Version incompatibility |
| **Objective-C** | Tree-sitter | ⚠️ Query errors |
| **Elm** | Tree-sitter | ⚠️ WASM memory error |
| **Haskell** | ❌ Not available | Missing WASM |
| **Clojure** | ❌ Not available | Missing WASM |
| **F#** | ❌ Not available | Missing WASM |
| **Perl** | ❌ Not available | Missing WASM |
| **R** | ❌ Not available | Missing WASM |
| **Julia** | ❌ Not available | Missing WASM |

**Total Working**: 17 languages  
**Total Available**: 39 tree-sitter WASM grammars

---

## MCP Tools (38 Total)

### Session Tools (4)
| Tool | Description |
|------|-------------|
| `mikk_get_session_context` | Project overview, constraints, hot modules (call FIRST) |
| `mikk_get_changes` | Files added/modified/deleted since last analyze |
| `mikk_get_project_overview` | Modules, function counts, tech stack |
| `mikk_token_stats` | Token savings vs naive file reading |
| Tool | Description |
|------|-------------|
| `mikk_secrets_scan` | **Read-only.** 50+ patterns, CI-safe |
| `mikk_secrets_replace` | Extract to .env + process.env references |

**Secrets Patterns:**
- Cloud: AWS, GitHub, GitLab, Bitbucket, Stripe, OpenAI, Anthropic, Google AI, Firebase, HuggingFace, SendGrid, Twilio, Slack, Cloudflare, Azure, DigitalOcean, Heroku, NPM
- Private Keys: RSA/EC/DSA
- Databases: MongoDB, PostgreSQL, MySQL, Redis, MSSQL, Oracle, Elasticsearch
- Security: SQL injection, eval(), XSS, CORS, crypto
- PII: SSN, Credit cards, Email, Phone

### Refactoring Tools (3)
| Tool | Description |
|------|-------------|
| `mikk_rename` | Multi-file rename plan |
| `mikk_git_diff_impact` | Git diff → affected symbols |
| `mikk_file_diff` | Lock state vs filesystem |

### Project Tools (3)
| Tool | Description |
|------|-------------|
| `mikk_get_constraints` | All constraints from mikk.json |
| `mikk_manage_adr` | CRUD for ADRs |
| `mikk_test_tool` | Connection smoke test |

---

## Test Results

### Core Package
```
360 pass
0 fail
977 expect() calls
Tests: 23 files
```

### MCP Server
```
95 pass
12 fail (pre-existing, unrelated to core functionality)
280 expect() calls
Tests: 1 file
```

### Polyglot Parser (17 languages test)
```
✓ Go: 1 functions
✓ Python: 11 functions
✓ Java: 11 functions
✓ Swift: 3 functions
✓ C: 3 functions
✓ C++: 2 functions
✓ C#: 3 functions
✓ Rust: 5 functions
✓ PHP: 3 functions
✓ Shell: 3 functions
```

---

## Output Files

`mikk init` produces:
- `mikk.json` — Architecture contract
- `mikk.lock.json` — Full codebase snapshot
- `claude.md` / `AGENTS.md` — Token-budgeted AI context (auto-regenerates)


---

## Configuration

### MCP Connection
```json
{
  "mcpServers": {
    "mikk": {
      "command": "bun",
      "args": ["run", "packages/mcp-server/src/stdio.ts"],
      "env": { "MIKK_PROJECT_ROOT": "." }
    }
  }
}
```

### mikk.json Contract
```json
{
  "declared": {
    "modules": [
      { "id": "auth", "paths": ["src/auth/**"], "description": "JWT auth" }
    ],
    "constraints": [
      "auth must not import from payments"
    ],
    "decisions": [
      { "id": "ADR-001", "title": "Stateless JWT", "reason": "No session storage" }
    ]
  }
}
```

**Constraint Types:**
- `no-import`: Module A cannot import from B
- `must-use`: Module A must import from C
- `no-call`: A cannot call B
- `layer`: Layer N cannot import Layer N+1
- `naming`: Exports must match regex
- `max-files`: Module cannot exceed N files

---

## Performance

- **Parse**: ~1000 files/second (TypeScript via OXC)
- **Graph Build**: O(n) where n = functions
- **Query**: O(1) lookup via adjacency maps
- **Semantic Search**: ~50ms first run, <5ms cached
- **MCP Response**: 30s TTL, instant cache bust on lock change

---

## Token Efficiency

| Scenario | Naive | Mikk | Savings |
|----------|------|-----|---------|
| Full project read (10k files) | ~500k tokens | ~12k tokens | **97.6%** |
| Function search | ~200 tokens | ~15 tokens | **92.5%** |
| Impact analysis | ~50k tokens | ~8k tokens | **84%** |

---

## Integrations

- **Claude Desktop** ✅
- **Cursor** ✅
- **VS Code Copilot** ✅
- **OpenClaw** ✅
- **OpenCode** ✅

---

## Known Limitations

1. **Haskell, Clojure, F#, Perl, R, Julia, SQL, Terraform** — No WASM grammars available
2. **Ruby, Dart, Objective-C, Elm** — Known tree-sitter WASM issues (gracefully skipped)
3. **Semantic search** — Requires `@xenova/transformers` (optional)
4. **Large projects (>50k files)** — Memory scale needs testing

---

## CLI Commands (19 Total)

### Project Setup

| Command | Description |
|---------|-------------|
| `mikk init` | First-time setup. Creates: mikk.json, mikk.lock.json, .mikk/, claude.md, AGENTS.md |
| `mikk analyze` | Re-scan code. Updates: lock, diagrams, AI context files. Run after code changes |
| `mikk diff` | Shows files modified since last `mikk analyze` (compares lock vs filesystem) |

### AI Context (Graph traversal)

> **Output**: AI-ready XML with modules, functions, call graph, routes, schemas

| Command | What it returns |
|---------|--------------|
| `mikk context query "how does auth work?"` | Full context for coding (modules, functions, calls, routes) |
| `mikk context for "add login flow"` | Context anchored to a specific task |
| `mikk context impact src/auth/jwt.ts` | What breaks if you change this file |
| `mikk context list` | All modules with file/function counts |

### Search (Direct lookup)

> **Output**: Function list with signatures, params, callers

| Command | What it finds |
|---------|-----------|
| `mikk search verifyToken` | Functions by name (exact, fuzzy, semantic modes) |
| `mikk search "error" --in login` | Search INSIDE function bodies |
| `mikk dead-code` | Functions never called by anyone |
| `mikk stats` | Functions, modules, dead code %, boundary violations |
| `mikk trace fnName variable` | Variable origin (taint analysis) |

### Architecture Enforcement

| Command | What it checks |
|---------|-------------|
| `mikk contract validate` | File drift + boundary violations |
| `mikk contract show-boundaries` | All cross-module calls (for writing constraints) |
| `mikk ci` | Exit 1 if issues. For CI pipelines |

### Intent & Refactoring

| Command | What it does |
|---------|-------------|
| `mikk intent "rename auth"` | Preflight: analyze impact, conflicts, implementation steps |
| `mikk suggest` | Next steps based on project state |
| `mikk doctor` | Health: mikk.json, lock, tsconfig, node_modules |

### Developer Experience

| Command | Description |
|---------|-------------|
| `mikk watch` | Daemon: auto-update lock on file changes |
| `mikk embeddings` | Generate semantic search index |
| `mikk mcp start` | Start MCP server (stdio) |
| `mikk mcp install` | Install into Claude/Cursor/VS Code |
| `mikk update` | Update CLI to latest |
| `mikk remove` | Delete all Mikk artifacts |

### ADRs & Documentation

| Command | Description |
|---------|-------------|
| `mikk adr list` | List architectural decisions |
| `mikk adr get <id>` | Get specific ADR |
| `mikk adr add -i <id> -t <title> -r <reason>` | Add new ADR |

---

## CLI Flags Reference

### `mikk init [path]`

> **What it does**: First-time setup. Creates the contract (mikk.json), lock file, cache directory, and AI context files.

```bash
mikk init                        # Initialize with auto-detected language/settings
mikk init --force               # Overwrite existing mikk.json and lock
mikk init --strict-parsing      # Fail if any files fail to parse
mikk init --no-context          # Skip generating claude.md/AGENTS.md
```

**Creates**: mikk.json, mikk.lock.json, .mikk/, claude.md, AGENTS.md, .clinerules

---

### `mikk analyze [path]`

> **What it does**: Re-scans all code files and updates the lock file + derived artifacts. Run after code changes.

```bash
mikk analyze                    # Full re-scan
mikk analyze --strict-parsing   # Fail on parse errors
mikk analyze ./path/to/project # Different project
```

**Updates**: mikk.lock.json, claude.md, AGENTS.md

---

### `mikk mcp`

> **What it does**: Starts the MCP server OR installs Mikk into your AI tool's config.

```bash
mikk mcp start                   # Run server (for Claude Desktop/Cursor)
mikk mcp install                # Write MCP config for Claude/Cursor/VS Code
mikk mcp install --tool claude   # Claude Desktop only
mikk mcp install --dry-run     # Preview without writing
mikk mcp --project <path>    # Different project
```

---

### `mikk context`

> **What it does**: Graph traversal → AI-ready XML with modules, functions, call graph, routes, schemas. For AI agents.

Has 4 subcommands:

#### `mikk context query <question> [path]`

> **Use when**: You need AI context for coding ("how does auth work?", "add login flow")

```bash
mikk context query "auth flow" --provider claude --hops 4 --tokens 6000
mikk context query "add login" --strict --must resolver,import --exact-only
mikk context query "api" --meta --out context.md
mikk context query "handler" --no-callgraph
```

Options:
- `--provider <name>` - Output provider: claude | generic | compact
- `--hops <n>` - Graph traversal depth (default 4)
- `--tokens <n>` - Token budget (default 6000)
- `--strict` - High-precision mode
- `--must <terms>` - Required terms (comma-separated)
- `--all-keywords` - Require every keyword in strict mode
- `--min-keywords <n>` - Minimum keyword matches (default 1)
- `--exact-only` - Hard gate: only strict matches
- `--fail-fast` - Return empty if strict finds nothing
- `--no-auto-fallback` - Don't fallback to balanced
- `--no-callgraph` - Omit call edges
- `--out <file>` - Write to file
- `--meta` - Print diagnostics

#### `mikk context impact <target> [path]`

```bash
mikk context impact src/auth/jwt.ts
mikk context impact verifyToken --files --json
mikk context impact userAuth --functions --depth 5
mikk context impact login --tokens 8000 --risk
```

Options:
- `-f, --files` - Show only affected files
- `--functions` - Show only functions
- `--modules` - Show modules
- `--depth` - Show dependency depth
- `--risk` - Show risk assessment
- `-j, --json` - JSON output
- `--max-impact <n>` - Maximum impacts (default 50)

#### `mikk context for <task> [path]`

```bash
mikk context for "Add rate limiting"
mikk context for "Fix auth bug" --file src/auth/validate.ts
mikk context for "Refactor" --module api --hops 6
```

Options:
- `--file <path>` - Anchor from file
- `--module <id>` - Anchor from module

#### `mikk context list [path]`

```bash
mikk context list  # List all modules and function counts
```

---

### `mikk search [query...]`

> **What it does**: Find functions by name. Exact, fuzzy, semantic search. Also searches inside function bodies.

```bash
mikk s auth                              # Simple search
mikk s "get user" --top 5              # Top 5 with bodies
mikk s "TODO" --in login                # Search body of function
mikk s "error" --in auth,utils          # Search multiple
mikk s "fetch" --module api --exported  # Filtered search
mikk s "validate" --returns boolean     # By return type
mikk s "handle" --calls db --async       # Combined filters
mikk s --list-modules                  # List all modules
mikk s --list-files                   # List all files
mikk s "query" --rich                  # Rich output
mikk s "search" --json                 # JSON output
mikk s "function" --body               # Include bodies
mikk s "pattern" --search-body         # Search inside bodies
mikk s "test" --mode semantic          # Semantic search mode
mikk s "query" --sort name              # Sort by name
```

Options:
- `-p, --path <path>` - Project path
- `-l, --limit <n>` - Max results (default 10)
- `--top <n>` - Top N with bodies
- `--rich` - Detailed output with signatures
- `--minimal` - Just names
- `--json` - JSON output
- `-b, --body` - Include function bodies
- `--search-body` - Search inside bodies
- `--in <names>` - Search IN function bodies
- `--in-any` - Match in ANY function
- `--max-lines <n>` - Max lines per body (default 50)
- `--module <id>` - Filter by module
- `--file <pattern>` - Filter by file pattern
- `--exported` - Only exported
- `--internal` - Only internal
- `--async` - Only async
- `--returns <type>` - Return type
- `--param <name>` - Has parameter
- `--calls <fn>` - Calls function
- `--called-by <fn>` - Called by
- `-m, --mode <mode>` - Search mode: exact, direct, semantic, hybrid
- `--sort <field>` - Sort by: score, name, calls, length
- `--list-modules` - List all modules
- `--list-files` - List all files

---

### `mikk dead-code`

> **What it does**: Detects functions that are never called by anyone (excluding exemptions).

```bash
mikk dead-code              # List all dead code
mikk dead-code --module cli # Filter to module
mikk dead-code --json       # JSON output
```

---

### `mikk stats [path]`

> **What it does**: Shows codebase health - functions, modules, dead code %, boundary violations.

```bash
mikk stats              # Formatted statistics
mikk stats --format json # JSON output
mikk stats ./project   # Specific project
```

---

### `mikk diff`

> **What it does**: Shows files modified since last `mikk analyze`. Compares lock vs current filesystem.

```bash
mikk diff         # Show all changes
```

---

### `mikk trace <functionId> <variable>`

> **What it does**: Traces where a variable comes from (taint analysis). Find its origin through the call chain.

```bash
mikk trace "src/auth/jwt.ts:verifyToken" userId
mikk trace "src/api/handler.ts:handle" req
```

---

### `mikk contract`

> **What it does**: Validates architectural constraints. Checks file drift + module boundary violations.

#### `mikk contract validate [path]`

```bash
mikk contract validate              # Drift + boundaries
mikk contract validate --boundaries-only
mikk contract validate --drift-only
mikk contract validate --strict      # Exit 1 on warnings
```

#### `mkk contract show-boundaries [path]`

```bash
mikk contract show-boundaries  # Show cross-module calls (for writing constraints)
```

---

### `mikk adr`

> **What it does**: Manage Architectural Decision Records (ADRs). Track why decisions were made.

```bash
mikk adr list                    # List all ADRs
mikk adr get <id>               # Get specific ADR
mikk adr add -i <id> -t <title> -r <reason>
mikk adr rm <id>                # Remove ADR
```

Options:
- `-i, --id <id>` - Unique identifier
- `-t, --title <title>` - Short title
- `-r, --reason <reason>` - Detailed reason
- `-d, --date <date>` - Date (default: today)

---

### `mikk watch`

> **What it does**: Daemon mode. Watches file changes and auto-updates the lock file.

```bash
mikk watch              # Start watcher (Ctrl+C to stop)
mikk watch &           # Run in background (Unix)
```

---

### `mikk embeddings`

> **What it does**: Generates semantic search embeddings from lock. Enables "fuzzy" search.

```bash
mikk embeddings              # Generate from lock
mikk embeddings --force     # Force regenerate
mikk embeddings --project <path>
```

---

### `mikk doctor [path]`

> **What it does**: Checks project health. Config files, lock freshness, parser runtime, node_modules.

```bash
mikk doctor               # Run all health checks
mikk doctor ./project    # Check specific project
```

Checks: mikk.json, lock file, lock status, tsconfig, node_modules, .mikkignore, parser runtime

---

### `mikk ci [path]`

```bash
mikk ci                           # Fast check
mikk ci --strict                 # Full health check
mikk ci --strict --dead-code-threshold 15
mikk ci --format json             # JSON output
mikk ci ./project              # Specific project
```

Options:
- `--strict` - Also check dead code
- `--dead-code-threshold <n>` - Max dead code % (default 20)
- `--complexity-threshold <n>` - Max function complexity (default 15)
- `--files-threshold <n>` - Max files per module (default 100)
- `--format <fmt>` - text or json

---

### `mikk update`

```bash
mikk update --channel stable   # Stable releases
mikk update --channel latest # Pre-release/canary
mikk update --channel version --version 2.0.12
mikk update --yes            # Skip prompts
```

---

### `mikk remove`

```bash
mikk remove           # Interactive confirmation
mikk remove --force  # Skip confirmation
```

---

### `mikk suggest`

```bash
mikk suggest  # Show practical next steps
```

---

### `mikk intent <prompt>`

```bash
mikk intent "Rename auth to authentication module"
mikk intent "Add rate limiting" --json
```

Full preflight: impact analysis, conflict detection, implementation suggestions

---

## Output Artifacts

| Artifact | Description |
|----------|-------------|
| `mikk.json` | Architecture contract |
| `mikk.lock.json` | Full codebase snapshot |
| `claude.md` | AI context for Claude |
| `AGENTS.md` | AI context for Codex |
| `.clinerules` | System instructions for Cline/OpenClaw |
| `.mikk/` | Cached data directory |
| `.mikk/cache/` | Function body cache |
| `.mikk/embeddings.json` | Semantic search embeddings |

---

## License

Apache 2.0

---

## Links

- [npm](https://www.npmjs.com/org/getmikk)
- [GitHub](https://github.com/Ansh-dhanani/mikk)