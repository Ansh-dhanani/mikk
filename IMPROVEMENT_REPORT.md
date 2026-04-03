# Mikk Improvement Report (April 2026)

## Scope
This report covers:
- What was implemented now in this pass.
- What remains to reach higher accuracy, stronger ACID guarantees, and broader language support.
- A research-backed shortlist of best-in-class open-source components to adopt next.

## Implemented in this pass

### 1. Parser coverage gaps fixed
- Added C++ extension support in parser routing and tree-sitter parser coverage:
  - `.cxx`, `.hxx`, `.hh`
- Added Kotlin script discovery support:
  - `.kts`
- Updated discovery patterns so these files are discovered and parsed consistently.

Impact:
- Reduces silent under-indexing of mixed C/C++ and Kotlin projects.
- Improves call graph and impact-analysis completeness for those repositories.

### 2. Parse diagnostics now surfaced in CLI
- `mikk analyze` and `mikk init` now support:
  - `--strict-parsing`
- `mikk analyze` now reports parse diagnostics with reason counts when fallback parsing occurs.
- `--strict-parsing` fails fast on parser/read/import-resolution diagnostics.

Impact:
- No more silent partial analysis in high-assurance workflows.
- CI can enforce parse completeness and fail early.

### 3. ACID-oriented consistency improvement for ADR writes
- ADR updates (`mikk_manage_adr` path through `AdrManager`) now use atomic writes.
- Added schema-safe read + atomic write path for `mikk.json` ADR updates.

Impact:
- Reduces corruption risk under concurrent edits and interrupted writes.

### 4. Tests added/updated
- Added parser regression tests for `.cxx`, `.hxx`, `.hh` support.
- Added discovery-pattern tests for `.kts` and `.hh` support.
- Verified targeted core + CLI tests pass after changes.

## Reality check: "100% support" and "1000% accuracy"
Absolute 100% across every language and dynamic runtime behavior is not realistically achievable with static analysis alone.

What is achievable:
- Very high precision for statically resolvable edges.
- High recall with layered analyzers and language-specific enrichers.
- Strict confidence scoring + explicit unknown/uncertain edges.

Recommended principle:
- Never pretend certainty where uncertainty exists.
- Return confidence and evidence for every edge and decision.

## Research-backed upgrade plan (open-source stack)

### A. Parsing and semantic fidelity
1. Keep OXC for JS/TS (already strong).
2. Move tree-sitter execution from WASM-first to native bindings where possible for server/CLI mode:
   - Better stability/perf for large repos and long-running daemons.
3. Add semantic enrichers for key ecosystems:
   - Java/Kotlin: JDT/LSP-backed symbol resolution layer.
   - Rust: rust-analyzer query integration for trait/impl and macro-expanded context.
   - C/C++: clangd/libclang index ingestion for accurate symbol and include resolution.
   - Python: optional pyright-based symbol/type index.

Candidate tools:
- Tree-sitter (incremental AST engine)
- Language servers (jdtls, rust-analyzer, clangd, pyright)

### B. Query and rule engine for precision checks
Add a rule/query layer for semantic invariants and vulnerability-grade patterns.

Candidate tools:
- Semgrep (broad multi-language rule engine)
- CodeQL (deep semantic query model for security/quality)
- ast-grep (fast structural codemods + linting rules)

Suggested use in Mikk:
- Use Mikk graph as architecture source of truth.
- Run Semgrep/ast-grep/CodeQL as optional enrichers.
- Merge findings into lock metadata as typed evidence, not plain text.

### C. ACID and storage hardening
Current atomic-file approach is good for lock/contract durability. To reach stronger ACID semantics across concurrent processes:
1. Introduce a single writer transaction coordinator for lock + contract + derived artifacts.
2. Add write-ahead journal for multi-file commit groups:
   - `BEGIN` -> stage files -> `COMMIT` marker -> finalize atomically.
3. Add lock generation numbers and optimistic concurrency checks.
4. Add crash-recovery replay step at startup.

### D. Accuracy architecture upgrades
1. Add edge confidence categories:
   - `exact` (AST+symbol resolved)
   - `probable` (name/heuristic)
   - `unknown`
2. Expose confidence in all impact/context APIs.
3. Add unresolved edge ledger with explicit reason codes.
4. Add differential validation tests per language fixture:
   - precision/recall against labeled call graph truth sets.

### E. Performance upgrades
1. Persistent AST cache keyed by `(path, hash, parserVersion)`.
2. Parallel parse pool with bounded worker concurrency.
3. Incremental dependency invalidation by affected SCC (strongly connected component).
4. Streaming lock compilation to reduce peak memory.

## Prioritized next implementation backlog

### P0 (high impact, low-medium effort)
- Add `strict-parsing` to CI docs and CI templates.
- Add parser diagnostics summary to `mikk doctor`.
- Add unresolved-edge metrics in `mikk stats`.

### P1 (high impact, medium effort)
- Native tree-sitter runtime mode for CLI/MCP.
- Confidence score plumbing through all impact/query responses.
- Parser coverage fixtures for Kotlin scripts and C++ variant headers.

### P2 (high impact, higher effort)
- LSP semantic enrichment adapters (Java/Rust/C++/Python).
- Transaction journal for multi-artifact atomic commits.
- Rule-engine bridge (Semgrep/ast-grep) with normalized finding schema.

### P3 (strategic)
- Optional CodeQL integration for security-focused deep queries.
- Language-specific macro/preprocessor expansion support (Rust/C/C++).

## Documentation updated in this pass
- Root docs:
  - `README.md`
  - `USER_GUIDE.md`
- Package docs:
  - `packages/core/README.md`
  - `packages/cli/README.md`
- Web docs (MDX):
  - `apps/web/content/docs/index.mdx`
  - `apps/web/content/docs/core/concepts.mdx`
  - `apps/web/content/docs/core/installation.mdx`
  - `apps/web/content/docs/reference/cli.mdx`

## Verification status
- Targeted core tests passed.
- CLI command tests passed.
- Type/lint errors were checked on edited source files and none were reported.

## Final note
This pass delivers concrete improvements to parser completeness, strict-mode safety, and write consistency. The remaining work for near-maximum accuracy is mostly semantic enrichment per language and stronger transactional coordination across all generated artifacts.
