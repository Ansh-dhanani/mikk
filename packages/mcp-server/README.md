# @getmikk/mcp-server

> MCP server for Mikk architectural analysis.

[![npm](https://img.shields.io/npm/v/@getmikk/mcp-server)](https://www.npmjs.org/package/@getmikk/mcp-server)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](../../LICENSE)

MCP (Model Context Protocol) server for [Mikk](../../README.md) - connects your project's architectural graph to AI assistants like Claude Desktop, Cursor, and any MCP-compatible client.

Every tool reads from `mikk.lock.json` - no re-parsing on each call.

> Part of [Mikk](../../README.md) - live architectural context for your AI agent.

---

## Requirements

- Mikk initialized in your project (`mikk.json` + `mikk.lock.json` present)
- Node.js 18+ or Bun 1.x

---

## Usage

```bash
# Auto-install into your AI tool
mikk mcp install

# Or start manually
npx @getmikk/mcp-server /path/to/your/project
```

**Claude Desktop** — add to `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "mikk": {
      "command": "npx",
      "args": ["-y", "@getmikk/mcp-server", "/absolute/path/to/project"]
    }
  }
}
```

---

## Tools

### Core Analysis
| Tool | Description |
|---|---|
| `mikk_query_context` | Ask an architecture question - returns graph-traced context with relevant functions, files, and call chains. |
| `mikk_get_project_overview` | Get a high-level overview: modules, function counts, file counts, constraints. |
| `mikk_list_modules` | List all declared modules with file counts, function counts, entry points, and descriptions. |
| `mikk_get_session_context` | One-shot context for session start: project overview + constraint status + hot modules + recently modified files. |

### Navigation & Search
| Tool | Description |
|---|---|
| `mikk_search_functions` | Search for functions by name or ID using a hybrid BM25+substring search. |
| `mikk_find_function` | Direct O(1) lookup of a function by exact name. |
| `mikk_get_function_detail` | 360-degree view of a function: params, return type, source body, call graph, error handling. |
| `mikk_read_file` | Read file scoped to specific functions. Returns bodies with metadata headers. |

### Safety & Impact Analysis
| Tool | Description |
|---|---|
| `mikk_before_edit` | Call BEFORE editing any file. Returns blast radius, exported functions at risk, constraint violations. |
| `mikk_impact_analysis` | Analyze the blast radius of changing a file. Returns impacted functions classified by severity. |

### Project Management
| Tool | Description |
|---|---|
| `mikk_get_constraints` | Get all architectural constraints and ADRs from `mikk.json`. |
| `mikk_get_routes` | Get all detected HTTP routes with methods, paths, handlers, and middleware chains. |
| `mikk_get_changes` | Detect files added, modified, and deleted since last mikk analyze. |
| `mikk_token_stats` | Show token savings for this session. |
| `mikk_security_scan` | Scan codebase for security vulnerabilities: hardcoded secrets, SQL injection, XSS, weak crypto. |
| `mikk_test_tool` | Simple test tool that returns a static message. |

---

## Resources (3)

| URI | Content |
|---|---|
| `mikk://contract` | Full `mikk.json` as JSON |
| `mikk://lock` | Full `mikk.lock.json` as JSON |
| `mikk://context` | Current `claude.md` content |

---

## Staleness

Every response includes a `warning` field when the lock is out of sync with the filesystem:

```json
{ "warning": "Lock file is drifted. Run `mikk analyze` for accurate results." }
```

Keep the lock current with `mikk analyze` after code changes, or `mikk watch` for continuous sync.

---

## License

[Apache-2.0](../../LICENSE)
