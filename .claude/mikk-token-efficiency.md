# Mikk Token Efficiency

Goal: reduce raw source reads while still getting everything needed to make safe changes.

## Preferred reading order

1. `mikk_get_session_context` (one call, onboarding context)
2. `mikk_query_context` (graph-traced context; include bodies only when needed)
3. `mikk_read_file({ file, functions })` (read only specific functions)
4. Fall back to `mikk_get_function_detail({ name })` when you need signature/purpose/call graph + body
5. Use `mikk_get_file({ file })` only when you truly need the entire file

## Query tuning rules

- Start with defaults (`maxHops` ~ 3-4, `tokenBudget` ~ 6000) unless the output is too small or too large.
- If your question is precise and you need high precision:
  - use strict mode in `mikk_query_context` with `requiredTerms` + `exactOnly`
  - keep `autoFallback` enabled unless you explicitly want an empty result
- If you only need “where” and “who,” consider omitting heavier callgraph/body output.

## Limit inputs to avoid waste

- Use `mikk_read_file` with `functions: [...]` (not “whole file”).
- Keep function lists small (extract only what you will reference in the patch).
- For MCP semantic search, keep `topK` small (e.g., 5-10), then deep-dive with `mikk_get_function_detail`.

## Editing confirmations

- Always run `mikk_before_edit` before writing code.
- Treat constraint failures as redesign-needed, not “continue anyway.”

