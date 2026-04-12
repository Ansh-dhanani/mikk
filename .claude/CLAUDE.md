# Mikk — AI Coding Assistant Instructions

> Mikk provides structural intelligence for your codebase. Use these tools as your first step before reading raw files.

## Quick Start

1. **Begin every session** with `mikk_get_session_context` — it returns project overview, constraint status, hot modules, and recent changes in one call.
2. **Ask architecture questions** with `mikk_query_context` before reading raw files.
3. **Always call** `mikk_before_edit` before modifying any file.
4. **After edits**, run `mikk_get_changes` to verify what drifted, then `mikk analyze` to update.

## Tool Cheat Sheet

| Goal | Tool | Notes |
|------|------|-------|
| Start a session | `mikk_get_session_context` | Call ONCE at conversation start |
| Understand code flow | `mikk_query_context` | Graph-traced context with bodies |
| Find by name | `mikk_search_functions` | Fast keyword substring match |
| Find by meaning | `mikk_semantic_search` | Vector similarity (needs @xenova/transformers) |
| Deep-dive a function | `mikk_get_function_detail` | Params, calls, calledBy, body, errors |
| Read specific functions | `mikk_read_file` | Preferred over `mikk_get_file` |
| Check blast radius | `mikk_before_edit` | **MANDATORY** before edits |
| Analyze impact | `mikk_impact_analysis` | Classified: critical/high/medium/low |
| Find callers | `mikk_find_usages` | Essential before rename/refactor |
| Check constraints | `mikk_get_constraints` | 6 rule types |
| Manage decisions | `mikk_manage_adr` | Document WHY for future agents |
| Find dead code | `mikk_dead_code` | Clean up before refactoring |
| Browse modules | `mikk_list_modules` | Then `mikk_get_module_detail` |
| Check HTTP routes | `mikk_get_routes` | Express/Koa/Hono detection |
| Detect drift | `mikk_get_changes` | SHA-256 hash comparison |

## Architecture

Mikk is a Turborepo monorepo:

- `packages/core` — Parser (TS Compiler API + Go regex), graph builder, hash, contracts
- `packages/mcp-server` — MCP tools and resources
- `packages/cli` — CLI commands (init, analyze, ci, watch)
- `packages/ai-context` — Context builder with token budgeting
- `packages/intent-engine` — Semantic search + conflict detection
- `packages/watcher` — Live file watch daemon
- `packages/vscode-extension` — VS Code integration

## Constraints

- Always check `mikk_before_edit` before modifying files
- Document architectural changes as ADRs via `mikk_manage_adr`
- Use `mikk_read_file` with function names instead of `mikk_get_file` to save tokens
- Run `mikk analyze` after significant changes to keep the lock file current

## Extra Mikk Guides

For faster decision-making, prefer reading:

- `mikk-workflow.md` — the recommended tool call order
- `mikk-token-efficiency.md` — how to reduce token waste
- `mikk-safety-editing.md` — guardrails for safe edits

## Skills

See `.claude/skills/` for detailed workflows:
- `exploring.md` — Navigate unfamiliar code
- `debugging.md` — Trace bugs through call chains
- `impact-analysis.md` — Analyze blast radius before changes
- `refactoring.md` — Plan safe refactors
