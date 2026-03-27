# Mikk Safety & Editing Guardrails

Use these rules to avoid “looks correct” edits that break contracts, constraints, or blast radius.

## Mandatory steps

1. Call `mikk_before_edit({ files: [...] })` before editing anything.
2. If constraints fail, stop and redesign (do not proceed with edits that violate policy).
3. After editing, call `mikk_get_changes({})` and then `mikk analyze` to refresh the lock state.

## Common failure modes to watch for

1. Silent drift (lock file not updated)
   - Symptom: the assistant makes changes but derived artifacts still reference old paths/SHA.
   - Fix: `mikk_get_changes` -> `mikk analyze`.

2. Call graph mistakes during refactors
   - Symptom: function rename updates some imports but misses indirect callers (re-exports, wrappers).
   - Fix: `mikk_find_usages({ name })` first; then re-check with `mikk_impact_analysis`.

3. Reading too much code “just in case”
   - Symptom: massive token/context bloat and lower response quality.
   - Fix: narrow with `mikk_query_context` + `mikk_read_file(functions: [...])`.

## When to use ADRs

Use `mikk_manage_adr` when you intentionally change an architectural decision, interface contract, or constraint strategy.

