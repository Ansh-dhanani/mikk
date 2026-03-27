# Mikk Efficient Workflow

Use this playbook to decide which `mikk_*` tool to call, in what order, and why.

## 1) Start of every session

1. Call `mikk_get_session_context({})`
2. Scan the returned:
   - `warning` (lock drift status)
   - `hotModules` / `recentlyModified`
   - `constraints` + `decisions`
3. If drift is reported, plan to run `mikk analyze` (or call `mikk_get_changes` first to confirm).

## 2) Before you read raw code

- Prefer `mikk_query_context({ question, ... })` when you’re asking “how/why/where does X work?”
- Prefer `mikk_find_usages({ name })` when you’re asking “who calls X?” (rename/refactor safety).
- Prefer `mikk_search_functions({ query })` when you don’t know the exact function name.

Only use raw reads as a last-mile step after you’ve narrowed the target.

## 3) Before editing any file (hard requirement)

Call `mikk_before_edit({ files: [...] })` before making changes.

Use the response to decide:
- Is `constraintStatus` `pass` for every file you’ll touch?
- Are any exported functions at risk, and what are their external callers?
- What are the top impacted nodes (from the blast radius report)?

If you must violate constraints, redesign the approach; do not edit while “fail” violations remain.

## 4) After you edit

1. Call `mikk_get_changes({})` to see what drifted since the lock snapshot.
2. Call `mikk analyze` to regenerate `mikk.lock.json` + derived artifacts.
3. Optionally re-check critical files with `mikk_impact_analysis({ file })`.

## Tool selection cheats

- “What breaks if I change this file?” -> `mikk_impact_analysis({ file })` then `mikk_before_edit({ files })`
- “Show me the architecture flow for this feature.” -> `mikk_query_context({ question })`
- “Find the function that validates JWT.” -> `mikk_search_functions({ query })` or `mikk_semantic_search({ query })`
- “I know the function name, read just that code.” -> `mikk_read_file({ file, functions })`
- “I need params/return types/signature + call graph.” -> `mikk_get_function_detail({ name })`
- “I’m renaming/refactoring; update all call sites.” -> `mikk_find_usages({ name })` and then run the edit plan

