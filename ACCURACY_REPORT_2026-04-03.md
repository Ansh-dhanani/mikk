# Mikk Accuracy Report (Commands, Flags, MCP Tools, Languages)

Date: 2026-04-03
Scope: `packages/cli`, `packages/mcp-server`, `packages/core` in this repository state

## Method

Accuracy/confidence is scored using available evidence in this repo:
- Contract/API implementation completeness in source
- Error-path handling and guard rails
- Test coverage depth in `packages/cli/tests` and `packages/mcp-server/tests/mcp.test.ts`
- Fallback behavior and determinism (lock-backed vs re-parse)

Scale:
- **High (90-98%)**: implemented + strong guard rails + tested behavior paths
- **Medium (75-89%)**: implemented, partial tests and/or environment sensitivity
- **Low (50-74%)**: implemented but weak/no behavior tests or significant external dependency risk

Note: this is an engineering accuracy confidence report, not a formal benchmark against an external gold dataset.

---

## 1) CLI Commands and Flags Accuracy

### Top-level command matrix

| Command | Flags | Accuracy | Why | Fixes |
|---|---|---:|---|---|
| `mikk init` | `--force`, `--strict-parsing` | **93%** | Strong flow and guard rails; strict parsing now wired; robust generation pipeline. Main risk is parser dependency variability (tree-sitter availability). | 1) Add integration tests for `--strict-parsing` fail/success paths. 2) Add fixture for parser-unavailable mode and expected diagnostics. |
| `mikk analyze` | `--strict-parsing` | **92%** | Robust reanalysis and compatibility fallback for mixed source/dist export resolution. Deterministic lock write path. | 1) Add test that simulates old core dist without `parseFilesWithDiagnostics`. 2) Add property test for diagnostic summary counters. |
| `mikk diff` | none | **86%** | Functional and simple hash comparison. Lower confidence due minimal dedicated tests and reliance on default discovery behavior. | 1) Add fixture tests for add/modify/delete combinations. 2) Add language-aware discovery invocation parity with analyze/init. |
| `mikk watch` | none | **78%** | Operationally straightforward, but hardcoded include set (`ts/tsx`) reduces cross-language confidence. Limited direct tests. | 1) Make include/exclude language-aware from `getDiscoveryPatterns`. 2) Add smoke test with non-TS project fixture. |
| `mikk ci` | `--strict`, `--dead-code-threshold`, `--format` | **90%** | Good boundary/dead-code checks and machine-readable JSON path. Needs stronger threshold edge-case tests. | 1) Add tests for threshold boundaries (exact equality, non-numeric, negative). 2) Add snapshot tests for text/json output stability. |
| `mikk stats` | `--format` | **91%** | Good lock-backed deterministic stats and health reporting. Risk mostly around schema evolution and lock field optionality. | 1) Add regression tests for missing optional fields (`routes`, `classes`, `generics`). 2) Add JSON schema assertions for output. |
| `mikk doctor` | none | **88%** | Useful health checks and clear fixes. Confidence limited by mostly file-presence checks rather than semantic checks. | 1) Add lock schema version/compatibility check. 2) Add check for stale lock by comparing source mtimes/hash deltas. |
| `mikk intent <prompt>` | `--json` | **84%** | Depends on intent-engine runtime quality and model/rule behavior; implementation is complete but external quality-sensitive. | 1) Add golden fixtures for typical refactor intents. 2) Add deterministic mock mode for CI confidence. |
| `mikk context` | see subcommands below | **89%** | Rich feature set and robust fallback behavior; multiple options parsed safely. Needs broader integration tests across options combinations. | 1) Add combinatorial option tests (`strict`, `must`, `all-keywords`, `no-auto-fallback`). 2) Validate output token budgets against hard caps. |
| `mikk contract` | see subcommands below | **90%** | Strong boundary and drift validation with clear statuses. Risk: constraint parsing assumptions can be project-specific. | 1) Add tests for malformed/custom constraints. 2) Add strict mode warning/error matrix tests. |
| `mikk adr` | see subcommands below | **92%** | CRUD flows are clean and now backed by safer atomic write path in core ADR manager. | 1) Add concurrency test for simultaneous ADR updates. 2) Add validation tests for duplicate IDs and date normalization. |
| `mikk visualize` | none top-level | **85%** | Good generation flows but depends on diagram package availability and module ID correctness. | 1) Add fallback messaging tests when diagram package absent. 2) Add verification for output files existence and content headers. |
| `mikk mcp` | `-p/--project` (top-level), install flags below | **87%** | Useful install/start ergonomics and cross-tool config patching. Risk from global path/environment assumptions and config format drift. | 1) Add unit tests for each patch function with malformed JSON. 2) Extend `--tool` docs/validation to include `windsurf` consistently. |
| `mikk dead-code` | `-m/--module`, `--json` | **89%** | Deterministic lock-based graph walk. Risk in heuristics/false positives across language semantics. | 1) Add known-dead/known-live fixtures by language. 2) Add suppression mechanism and tests. |
| `mikk remove` | `-f/--force` | **91%** | Strong UX and safety prompt; handles partial failures. | 1) Add dry-run mode for safer CI usage. 2) Add tests for patch stripping behavior in pre-populated docs/files. |

### `mikk context` subcommands

| Subcommand | Flags | Accuracy | Why | Fixes |
|---|---|---:|---|---|
| `context query <question>` | `--provider`, `--hops`, `--tokens`, `--strict`, `--must`, `--all-keywords`, `--min-keywords`, `--exact-only`, `--fail-fast`, `--no-auto-fallback`, `--no-callgraph`, `--out`, `--meta` | **91%** | Strong validation/fallback and provider formatting; tested in MCP analog and partially in CLI. | 1) Add CLI integration tests for all strict-mode flag interactions. |
| `context impact <file>` | `--provider`, `--tokens` | **84%** | Works, but this path reparses source instead of lock-only path and has more runtime variance. | 1) Switch to lock-backed impact path for determinism. 2) Add tests for basename fallback behavior. |
| `context for <task>` | same family as `query` plus `--file`, `--module` | **90%** | Solid context shaping and anchor behavior; option parsing validated. | 1) Add tests for conflicting/combined focus options and expected prioritization. |
| `context list` | none | **94%** | Simple lock-backed listing; low complexity and low risk. | 1) Add one snapshot test for output stability. |

### `mikk contract` subcommands

| Subcommand | Flags | Accuracy | Why | Fixes |
|---|---|---:|---|---|
| `contract validate` | `--boundaries-only`, `--drift-only`, `--strict` | **91%** | Good mutually exclusive guard, clear reporting, deterministic lock comparisons. | 1) Add tests for mutually exclusive flags + strict warning exit behavior. |
| `contract show-boundaries` | none | **93%** | Straightforward derivation from lock/constraint checker. | 1) Add regression test for projects with zero cross-module edges. |

### `mikk adr` subcommands

| Subcommand | Flags | Accuracy | Why | Fixes |
|---|---|---:|---|---|
| `adr list` | none | **95%** | Low complexity and deterministic. | 1) Add empty and large list snapshot tests. |
| `adr get <id>` | none | **94%** | Good not-found handling and formatting. | 1) Add tests for long reason wrapping. |
| `adr add` | `-i/--id`, `-t/--title`, `-r/--reason`, `-d/--date` | **92%** | Required options and now safer persistence. | 1) Validate date format stricter. 2) Add duplicate-ID behavior tests. |
| `adr rm <id>` | none | **94%** | Good outcome handling. | 1) Add idempotent delete test. |

### `mikk visualize` subcommands

| Subcommand | Flags | Accuracy | Why | Fixes |
|---|---|---:|---|---|
| `visualize all` | none | **87%** | Good orchestration when dependencies exist. | 1) Add explicit dependency preflight command. |
| `visualize module <id>` | none | **86%** | Good module validation and file writing, but more edge cases around module IDs and file IO. | 1) Add tests for invalid IDs and write permission failures. |

### `mikk mcp` subcommands

| Subcommand | Flags | Accuracy | Why | Fixes |
|---|---|---:|---|---|
| `mcp start` | inherits `-p/--project` | **86%** | Good project-root wiring and fallback paths; dependent on runtime bundling paths and module exports. | 1) Add startup test matrix for src/dist/global path resolution. |
| `mcp install` | `--tool`, `--dry-run` + inherited `-p/--project` | **88%** | Good config patchers and JSON safety. Minor inconsistency: docs mention fewer tools than implementation supports (`windsurf`). | 1) Align docs/help text with actual tool set. 2) Add tests for each target config schema merge. |

---

## 2) MCP Tools Accuracy (All 23 Tools)

Evidence baseline:
- All 23 tools are registered in `packages/mcp-server/src/tools.ts`.
- `packages/mcp-server/tests/mcp.test.ts` validates registration list and deeply tests many core tools.
- Some tools are only lightly exercised (name-list presence only), reducing confidence.

| MCP Tool | Accuracy | Why | Fixes |
|---|---:|---|---|
| `mikk_get_project_overview` | **95%** | Strong tests and lock-backed deterministic output. | Add schema contract test for backward compatibility. |
| `mikk_query_context` | **92%** | Rich behavior and strict/fallback tested. Risk in retrieval relevance quality variance. | Add relevance golden tests across multiple fixture repositories. |
| `mikk_impact_analysis` | **94%** | Good tests for file match, impact semantics, and performance expectation. | Add tests for monorepo path normalization edge cases. |
| `mikk_search_functions` | **95%** | Hybrid ranking tested for exact/substring/limit/no-match. | Add typo-tolerance tests and multilingual identifiers. |
| `mikk_before_edit` | **93%** | Strong tested blast-radius + constraints reporting. | Add tests for large file sets and constraint density stress. |
| `mikk_list_modules` | **95%** | Simple deterministic lock projection and tested. | Add sort-order stability assertion. |
| `mikk_get_module_detail` | **94%** | Strong tests including error path and call-name resolution. | Add tests with larger modules and deep internal graph. |
| `mikk_get_function_detail` | **94%** | Detailed behavior tested including body/range/metadata. | Add overload/duplicate-name disambiguation tests. |
| `mikk_get_file` | **95%** | Security-sensitive path traversal protections tested. | Add binary-file and large-file cap tests. |
| `mikk_find_usages` | **93%** | Good tests for known/unknown and metadata fields. | Add recursive/cycle caller graph tests. |
| `mikk_get_constraints` | **94%** | Core output fields tested; deterministic. | Add ADR schema evolution tests. |
| `mikk_get_routes` | **90%** | Basic route extraction tested, but language/framework variability remains. | Add fixtures for Express/Koa/Hono/Fastify and nested routers. |
| `mikk_get_changes` | **89%** | Tested for modified-file detection; hash logic straightforward. | Add add/delete and rename cases; Windows path tests. |
| `mikk_read_file` | **91%** | Scoped reading behavior and error/warning paths tested. | Add overlapping function range and ordering tests. |
| `mikk_get_session_context` | **90%** | Tested for comprehensive structure; depends on staleness and change-detection heuristics. | Add stress test with larger lock + many modules. |
| `mikk_test_tool` | **78%** | Trivial static tool; mostly a smoke utility. | Keep as diagnostic tool or remove from prod toolset. |
| `mikk_semantic_search` | **74%** | Functional but heavy external dependency (`@xenova/transformers`) and only light test coverage. | Add deterministic embedding mock tests and model-availability fallback integration tests. |
| `mikk_validate_edit` | **72%** | Valuable capability, but currently low behavior-test evidence in MCP test suite. | Add comprehensive gate/correction test matrix and deterministic fixtures. |
| `mikk_dead_code` | **79%** | Implemented; low direct MCP behavior test coverage and heuristic sensitivity. | Add language-diverse dead/live fixtures and false-positive tracking. |
| `mikk_manage_adr` | **82%** | CRUD functionality present; low direct MCP behavioral tests. | Add full action matrix tests (`list/get/add/update/remove`) including bad inputs. |
| `mikk_git_diff_impact` | **76%** | Useful capability but git/diff variability and light tests reduce confidence. | Add controlled fixture repo diff tests (rename, add, delete, staged). |
| `mikk_rename` | **75%** | Planning tool is useful but currently string/metadata-based, not semantic rewrite engine. | Add symbol-resolution integration and collision/conflict checks. |
| `mikk_token_stats` | **80%** | Deterministic counters, but weak validation and interpretation assumptions. | Add invariant tests for used/raw/saved monotonic behavior and reset semantics. |

Overall MCP tooling confidence (weighted): **88%**

---

## 3) Language Support Accuracy

### Detection and discovery vs parser support

Current architecture has 3 layers:
1. Language detection (`detectProjectLanguage`)
2. File discovery patterns (`getDiscoveryPatterns`)
3. Parser extraction (`parseFilesWithDiagnostics` via OXC/Go/tree-sitter)

### Per-language confidence

| Language | Detection | Discovery | Parsing | Accuracy | Why | Fixes |
|---|---|---|---|---:|---|---|
| TypeScript | yes | `.ts/.tsx` (+ js/jsx in TS mode) | OXC | **96%** | Primary path, strong extractor maturity and tests. | Add more decorator and advanced type-system fixtures. |
| JavaScript | yes | `.js/.jsx/.mjs/.cjs` | OXC | **95%** | Mature parser path and broad practical coverage. | Add optional chaining/proposal syntax regression fixtures. |
| Go | yes | `.go` | dedicated Go parser | **90%** | Good dedicated parser; confidence lower than TS/JS due smaller test breadth. | Add generics/interfaces/method receiver edge-case tests. |
| Python | yes | `.py` | tree-sitter (or fallback empty if unavailable) | **83%** | Works with tree-sitter available; fallback mode degrades extraction sharply. | Bundle/verify tree-sitter assets and add parser availability self-check. |
| Java | yes | `.java` | tree-sitter | **84%** | Good structural support; framework-specific idioms may vary. | Add Spring/Lombok-heavy fixtures and route extraction assertions. |
| Kotlin | yes (under Java detector) | `.kt/.kts` | tree-sitter | **82%** | Support exists and `.kts` discovery recently improved; lower empirical test depth. | Add coroutine/sealed/data class fixtures and extension function tests. |
| Swift | not first-class detector, but parser maps `.swift` | no default Swift detector path | tree-sitter | **74%** | Parse support exists, but project detection/discovery pathways are weaker. | Add Swift package detection (`Package.swift`) and dedicated discovery patterns. |
| C | yes (fallback detector) | `.c/.h` | tree-sitter | **80%** | Supported, but function extraction quality varies by macro-heavy codebases. | Add macro/preprocessor-heavy fixtures and configurable preprocessing. |
| C++ | yes (detector for `.cpp`/CMake) | `.cpp/.cc/.cxx/.hpp/.hxx/.hh/.h` | tree-sitter | **82%** | Recent extension coverage improvements; still moderate test depth. | Add templates/namespaces/overload fixtures and compile_commands-aware path resolution. |
| C# | yes | `.cs` | tree-sitter | **80%** | Supported but lower dedicated test volume and framework variance. | Add ASP.NET controller/attribute route fixtures. |
| Rust | yes (detector) | `.rs` | tree-sitter | **79%** | Parser mapping exists; lower end-to-end fixture coverage. | Add traits/impl/generics/macros fixtures and module path resolution tests. |
| PHP | yes | `.php` | tree-sitter | **78%** | Base support present, less evidence depth. | Add Laravel/Symfony fixture sets. |
| Ruby | yes | `.rb` | tree-sitter | **77%** | Base support present, but dynamic metaprogramming reduces static accuracy. | Add Rails conventions + DSL-heavy fixture coverage. |

### Cross-language risks and fixes

1. Tree-sitter runtime availability risk
- Reason: when `web-tree-sitter` or WASM grammars are unavailable, parser falls back to empty structures.
- Fix: package grammars in release builds; add `mikk doctor` check for parser runtime; optionally fail-hard under `--strict-parsing` by default for non-TS/JS languages.

2. Discovery vs parser mismatches
- Reason: parser may support extension that language detector/discovery path does not prioritize (example class: Swift projects).
- Fix: harmonize a single source-of-truth extension map used by detector, discovery, parser routing, docs.

3. Heuristic extraction variability
- Reason: tree-sitter queries and regex-based extraction (in some language paths) can miss idioms.
- Fix: add language fixture corpora + periodic conformance score (`precision/recall`) per language.

Overall language support confidence (current state): **83%**

---

## 4) Priority Fix Plan (highest ROI)

1. Add comprehensive test matrix for low-confidence MCP tools
- Target: `mikk_validate_edit`, `mikk_semantic_search`, `mikk_git_diff_impact`, `mikk_rename`, `mikk_dead_code`, `mikk_manage_adr`, `mikk_token_stats`.
- Expected gain: MCP confidence from ~88% to ~93%.

2. Improve cross-language hardening
- Add parser-runtime preflight and fail policy in strict mode.
- Add fixtures for Rust/C#/Swift/Kotlin/PHP/Ruby/C/C++ edge cases.
- Expected gain: language confidence from ~83% to ~89%.

3. Unify discovery and parsing maps
- Generate all extension support from one canonical registry.
- Expected gain: fewer drift bugs and higher deterministic behavior in init/analyze/watch/diff.

4. Strengthen CLI integration tests for flags
- Explicitly test all CLI flags, especially strict/fallback combinations.
- Expected gain: command confidence from high-80s/low-90s into mid-90s.

---

## 5) Summary Scores

- CLI command+flag surface confidence: **89%**
- MCP tool surface confidence: **88%**
- Language support confidence: **83%**
- Overall current accuracy confidence: **87%**

This is a strong baseline with excellent TS/JS and core MCP primitives, but still short of “100% on each language.” The path to near-100% is primarily: broader language fixture testing, tree-sitter runtime hardening, and deeper behavior tests for currently lightly tested MCP tools.
