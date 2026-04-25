# @getmikk/mcp-server

> 41 MCP tools · 3 resources · ~5ms responses — all grounded in your real codebase graph.

[![npm](https://img.shields.io/npm/v/@getmikk/mcp-server)](https://www.npmjs.org/package/@getmikk/mcp-server)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](../../LICENSE)

MCP (Model Context Protocol) server for [Mikk](../../README.md) — connects your project's architectural graph to AI assistants like Claude Desktop, Cursor, and any MCP-compatible client.

Every tool reads from `mikk.lock.json` — no re-parsing on each call. The cache is busted immediately when the lock file changes.

> Part of [Mikk](../../README.md) — live architectural context for your AI agent.

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

## All 41 Tools

### Session & Orientation
| Tool | Description |
|---|---|
| `mikk_get_session_context` | **Call this first.** Project overview + constraint status + hot modules + recently modified files. |
| `mikk_explain_codebase` | Comprehensive one-shot overview — entry points, API surface, data layer, module map. |
| `mikk_get_changes` | Files added, modified, deleted since last `mikk analyze`. SHA-256 hash comparison. |
| `mikk_token_stats` | Token savings for this session vs. naive file reading. |
| `mikk_reset_session` | Clear session memory so next `mikk_query_context` returns fresh full context. |

### Planning & Safety
| Tool | Description |
|---|---|
| `mikk_change_plan` | **One-shot pre-flight.** Scope + impact + constraint check + risk — single call. |
| `mikk_scope_check` | Minimum set of files to touch for a task. Inverse of impact analysis. |
| `mikk_before_edit` | **Call BEFORE editing.** Blast radius, exported API at risk, constraint violations, circular deps. |
| `mikk_impact_analysis` | Full blast radius classified by severity (critical / high / medium / low). |
| `mikk_explain_risk` | Human-readable breakdown of why a function has a high risk score. |

### Navigation & Search
| Tool | Description |
|---|---|
| `mikk_query_context` | Architecture question → graph-traced answer with relevant functions, files, call chains. |
| `mikk_list_modules` | All declared modules with file counts, function counts, entry points, descriptions. |
| `mikk_get_module_detail` | Functions, files, exported API, internal call graph for a module. |
| `mikk_get_function_detail` | Params, return type, source body, call graph, error handling, line range. |
| `mikk_search_functions` | Hybrid BM25 + substring search. |
| `mikk_search_rich` | Multi-filter search: module, file, async, return type, body content. |
| `mikk_semantic_search` | Natural-language search using local vector embeddings. Requires `@xenova/transformers`. |
| `mikk_bulk_query` | Batch multiple function detail queries in one call. |
| `mikk_find_function` | O(1) exact-name lookup. |
| `mikk_find_by_signature` | Find function by full signature string. ⚠️ See known issues. |
| `mikk_find_by_location` | Find function at a specific file:line. ⚠️ Requires exact line match. |
| `mikk_find_similar` | Find functions with similar names (handles renames). |
| `mikk_find_usages` | Every caller of a specific function. |
| `mikk_classify_file` | Classify a file's semantic role (route, model, test, etc.) instantly. |

### Code Reading
| Tool | Description |
|---|---|
| `mikk_get_file` | Raw source of any tracked project file. |
| `mikk_read_file` | Source scoped to specific named functions — saves 60–90% tokens vs. whole-file read. |
| `mikk_list_files` | All tracked files with metadata (language, imports, exports, line count). |
| `mikk_get_routes` | All detected HTTP routes with method, path, handler, middleware chain. ⚠️ Next.js routes not parsed. |
| `mikk_get_class_detail` | Class details: methods, properties, inheritance, decorators. |
| `mikk_get_generic_detail` | Type/interface/enum details: type parameters, extends clauses. |
| `mikk_get_call_graph` | Mermaid call graph for a function or module (callers, callees, or both). |

### Analysis
| Tool | Description |
|---|---|
| `mikk_dead_code` | Dead functions with multi-pass exemptions (exports, entry points, tests, constructors). |
| `mikk_get_complexity` | Functions above a cyclomatic complexity threshold. |
| `mikk_get_constraints` | All architectural constraints and ADRs from `mikk.json`. |

### Security
| Tool | Description |
|---|---|
| `mikk_secrets_scan` | Scan for hardcoded secrets, injection, weak crypto, path traversal. ⚠️ High false-positive rate on template literals — use `--severity high`. |
| `mikk_secrets_replace` | Auto-extract secrets to `process.env` references (dry-run by default). |
| `mikk_taint_analysis` | Data-flow: traces user-controlled inputs (`req.body`, `process.argv`) to dangerous sinks (`eval`, `executeQuery`). |

### Refactoring
| Tool | Description |
|---|---|
| `mikk_rename` | Coordinated multi-file rename plan — all call sites and import locations. |
| `mikk_git_diff_impact` | Map git diff hunks to affected symbols with module attribution. |
| `mikk_file_diff` | Drift between lock state and current filesystem for a file. |

### Graph Index
| Tool | Description |
|---|---|
| `mikk_index_project` | Trigger full architectural re-indexing. Updates `mikk.lock.json`. |

---

## Resources (3)

| URI | Content |
|---|---|
| `mikk://contract` | Full `mikk.json` as JSON |
| `mikk://lock` | Full `mikk.lock.json` as JSON |
| `mikk://context` | Current `claude.md` content |

---

## Staleness Detection

Every response includes a `warning` field when the lock is out of sync with the filesystem:

```json
{ "warning": "Lock file is drifted. Run `mikk analyze` for accurate results." }
```

Keep the lock current with `mikk analyze` after code changes, or `mikk watch` for continuous sync.

---

## Known Issues

| Tool | Issue |
|---|---|
| `mikk_find_by_signature` | Non-functional — signature normalization not implemented |
| `mikk_find_by_location` | Requires exact line number; no range matching |
| `mikk_get_routes` | Next.js file-system routes not detected; only Express-style routes |
| `mikk_secrets_scan` | ~1,000 false positives on template literals in typical TS repos |
| `mikk_get_function_detail` | Returns all prefix matches, not just exact name match |

---

## Recommended Workflow

```
Session start:   mikk_get_session_context()
Understanding:   mikk_query_context({ question: "How does auth work?", tokenBudget: 6000 })
Find functions:  mikk_search_functions({ query: "auth login" })
Get details:     mikk_get_function_detail({ name: "login" })
Before any edit: mikk_before_edit({ files: ["src/auth/login.ts"] })
Impact check:    mikk_impact_analysis({ file: "src/auth/login.ts" })
Security:        mikk_secrets_scan({ severity: "high" })
```

> `mikk.lock.json` can be 500KB+. Never paste it directly into context. Keep it fresh with `mikk analyze` or `mikk watch`, then let your AI call focused tools. A full session typically uses fewer than 5,000 tokens total.

---

## License

[Apache-2.0](../../LICENSE)
