# @getmikk/mcp-server

> Give your AI assistant real architectural intelligence — not guesses.

[![npm](https://img.shields.io/npm/v/@getmikk/mcp-server)](https://www.npmjs.com/package/@getmikk/mcp-server)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](../../LICENSE)

MCP (Model Context Protocol) server for [Mikk](../../README.md) — connects your project's full architectural graph directly to AI assistants like Claude Desktop, Cursor, and any MCP-compatible client.

Once connected, your AI assistant can answer questions like *"what breaks if I change this file?"*, *"who calls `parseToken`?"*, and *"what are the architectural constraints for this project?"* — all grounded in the actual call graph, real export surfaces, and real constraint definitions. Not hallucinated. Not guessed.

Every tool reads from `mikk.lock.json` — no re-parsing, millisecond response times.

> Part of [Mikk](../../README.md) — the codebase nervous system for AI-assisted development.

---

## Requirements

- [Mikk](https://github.com/Ansh-dhanani/mikk) installed and initialized in your project (`mikk.json` + `mikk.lock.json` present)
- Node.js 18+ or Bun 1.x

---

## Installation

```bash
npm install -g @getmikk/mcp-server
# or
bunx @getmikk/mcp-server /path/to/your/project
```

---

## Connecting to an MCP client

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "mikk": {
      "command": "npx",
      "args": ["-y", "@getmikk/mcp-server", "/absolute/path/to/your/project"]
    }
  }
}
```

### Cursor / VS Code (via settings.json)

```json
{
  "mcp.servers": {
    "mikk": {
      "command": "npx",
      "args": ["-y", "@getmikk/mcp-server", "/absolute/path/to/your/project"]
    }
  }
}
```

### Direct invocation

```bash
mikk-mcp /path/to/project
```

---

## Tools (12)

All tools read from the lock file (`mikk.lock.json`) — fast, no re-parsing.

| Tool | Purpose |
|---|---|
| `mikk_get_project_overview` | Modules, function counts, tech stack, constraints |
| `mikk_query_context` | Ask an architecture question — returns graph-traced context with call chains |
| `mikk_impact_analysis` | Blast radius of changing a specific file |
| `mikk_before_edit` | **Call before editing any file** — exported functions at risk, constraints that apply, full blast radius |
| `mikk_find_usages` | Every function that calls a specific function — essential before renaming |
| `mikk_list_modules` | All declared modules with file/function counts |
| `mikk_get_module_detail` | Functions, files, exported API, and internal call graph for a module |
| `mikk_get_function_detail` | Params, return type, call graph, source body, error handling for a function |
| `mikk_search_functions` | Substring search across all function names |
| `mikk_get_constraints` | All architectural constraints and design decisions |
| `mikk_get_file` | Read raw source of any project file (with path traversal guard) |
| `mikk_get_routes` | Detected HTTP routes (Express / Koa / Hono style) |

### Staleness warning

If `mikk.lock.json` is in a `drifted` or `conflict` state (i.e., out of sync with the source), every impact-sensitive tool will include a `"warning"` field in its response:

```json
{
  "warning": "⚠️ Lock file is drifted. Run `mikk analyze` for accurate results."
}
```

Run `mikk analyze` in your project to refresh the lock.

---

## Resources (3)

| URI | Content |
|---|---|
| `mikk://contract` | The full `mikk.json` contract as JSON |
| `mikk://lock` | The full `mikk.lock.json` as JSON |
| `mikk://context` | The `claude.md` AI context document (if present) |

---

## Tool reference

### `mikk_before_edit`

The most important tool. Call it **before** editing any file.

```
files: string[]   # relative paths, e.g. ["src/auth/verify.ts"]
```

Returns for each file:
- Functions defined in the file
- Exported functions at risk (with their callers)
- Blast radius (how many nodes depend on this file)
- All project-level architectural constraints

---

### `mikk_query_context`

Ask an architecture question and get back a formatted context block ready to feed into your prompt.

```
question:     string            # e.g. "How does token refresh work?"
maxHops:      number (default 4)
tokenBudget:  number (default 6000)
focusFile:    string (optional) # anchor traversal from a specific file
focusModule:  string (optional) # anchor traversal from a specific module
provider:     'generic' | 'claude' | 'compact'  (default 'generic')
```

Returns `isError: true` with a helpful message if no context was found (e.g. file doesn't exist in the lock).

---

### `mikk_find_usages`

Find everything that calls a function — complete with file, module, and line number.

```
name: string   # function name (e.g. "parseToken")
```

---

### `mikk_impact_analysis`

```
file: string   # relative path to the file being changed
```

Returns `changedNodes`, `impactedNodes`, depth, confidence, `classified` risk breakdown, and the top 30 impacted functions.

---

## Recommended AI assistant workflow

1. **Before editing** → call `mikk_before_edit` with the files you plan to touch
2. **Understanding a flow** → call `mikk_query_context` with your question
3. **Renaming a function** → call `mikk_find_usages` first
4. **Exploring the project** → `mikk_get_project_overview` → `mikk_get_module_detail`

---

## License

Apache-2.0
