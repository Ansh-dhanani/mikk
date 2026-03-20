---
name: Exploring
description: Navigate unfamiliar code using Mikk's architecture graph
---

# Exploring Code with Mikk

Use this workflow when you need to understand how code is structured, find relevant functions, or trace dependencies.

## Quick Start

1. **Begin every session** by calling `mikk_get_session_context` — it returns the project overview, constraint status, hot modules, and recent changes in one shot.

2. **Ask architecture questions** with `mikk_query_context`:
   ```
   mikk_query_context({ question: "how does authentication work?" })
   ```
   This traces the dependency graph and returns relevant functions with call chains and bodies.

3. **Explore modules** with `mikk_list_modules` → `mikk_get_module_detail`:
   ```
   mikk_list_modules()
   mikk_get_module_detail({ moduleId: "packages-core" })
   ```

## Finding Functions

- **By name**: `mikk_search_functions({ query: "validate" })` — substring match
- **By meaning**: `mikk_semantic_search({ query: "check JWT token validity" })` — vector similarity
- **By usage**: `mikk_find_usages({ name: "parseFiles" })` — who calls this?

## Understanding a Function

```
mikk_get_function_detail({ name: "parseFiles" })
```
Returns: params, return type, call graph, source body, error handling, edge cases, line range.

## Reading Code Efficiently

- **Whole file**: `mikk_get_file({ file: "src/auth/verify.ts" })`
- **Specific functions only** (saves tokens): `mikk_read_file({ file: "src/auth/verify.ts", functions: ["verifyToken", "refreshSession"] })`

## Key Principles

- Always start with `mikk_get_session_context` — don't skip it
- Use `mikk_query_context` before reading raw files — it gives you the architectural context
- Prefer `mikk_read_file` with function names over `mikk_get_file` to save tokens
- Check `mikk_get_routes` if you're working on HTTP endpoints
