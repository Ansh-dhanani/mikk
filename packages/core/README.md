# @getmikk/core

> AST parsing, dependency graph, Merkle hashing, contract management, boundary enforcement, risk analysis.

[![npm](https://img.shields.io/npm/v/@getmikk/core)](https://www.npmjs.com/package/@getmikk/core)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](../../LICENSE)

Foundation package for the Mikk ecosystem. All other packages import from core — nothing in core imports from them.

> Part of [Mikk](../../README.md) — live architectural context for your AI agent.

---

## Parsers

Three parser families follow the same interface: `parse(filePath, content)` → `ParsedFile`.

**TypeScript / TSX / JavaScript / JSX**
Uses OxcParser (Rust-backed). Extracts: functions with full signatures (params, return type, async flag, decorators, generics), classes (methods, properties, inheritance chain), imports (named, default, namespace, type-only) with full resolution (tsconfig `paths` alias resolution, recursive `extends`, index file inference, extension inference). Every function has its exact byte-accurate body location.

**Go**
Regex + stateful scanning. No Go toolchain required. Extracts: functions, methods (with receiver types), structs, interfaces, package imports. Uses `go.mod` for project boundary detection.

**Polyglot (Tree-sitter)**
Python, Java, Kotlin (`.kt`, `.kts`), Swift, C/C++, C#, Rust, PHP, Ruby, Shell, and more via tree-sitter grammars.

---

## Graph

### GraphBuilder

Two-pass O(n) dependency graph construction:
1. **Pass 1** — register all nodes (functions, classes, files, generics)
2. **Pass 2** — resolve all edges (import, call, containment, extends, implements)

Result: `DependencyGraph` with both `outEdges` and `inEdges` adjacency maps — O(1) traversal in either direction.

```typescript
interface DependencyGraph {
  nodes: Map<string, GraphNode>
  edges: GraphEdge[]
  outEdges: Map<string, GraphEdge[]>  // node → edges going out
  inEdges: Map<string, GraphEdge[]>   // node → edges coming in
}
```

Function IDs are stable and unambiguous:
```
fn:<absolute-posix-path>:<FunctionName>
class:<absolute-posix-path>:<ClassName>
type:<absolute-posix-path>:<TypeName>
```

### ImpactAnalyzer

BFS backward walk from a set of changed nodes. Returns:
- `changed` — directly modified nodes
- `impacted` — all transitively affected upstream callers
- `classified` — sorted into `critical | high | medium | low` by proximity and risk score
- `confidence` — `high | medium | low` based on edge coverage

### RiskEngine

Computes a quantitative risk score (0–100) per node based on structural position in the graph:

```
score = (connectedNodes × 1.5) + (depth × 2)
      + 30 if auth/security domain
      + 20 if database/state domain
      + 15 if exported
```

Clamped to [0, 100].

### RiskExplainer

Takes a function ID and produces a human-readable audit trail of its risk score — scored factors with point contributions, hot paths to critical downstream nodes, and concrete recommendations. Used by `mikk_explain_risk`.

### ConfidenceEngine

Computes path-level confidence for impact analysis. Each edge carries a confidence score (1.0 for direct AST-confirmed calls, lower for inferred). Path confidence is the product of all edge confidences along a traversal path.

### ScopeAnalyzer

Given a task description, finds the minimal set of files to modify. The inverse of `ImpactAnalyzer` — instead of "what breaks if I change X", it answers "what do I need to touch to do Y". Uses BFS forward from keyword-matched anchor functions with decay weighting. Used by `mikk_scope_check` and `mikk_change_plan`.

### ClusterDetector

Groups files into logical modules via greedy agglomeration using import coupling, directory structure, and naming patterns. Produces clusters with confidence scores. Used by `mikk init` to auto-generate `mikk.json`.

### DeadCodeDetector

Identifies functions with zero callers after multi-pass exemptions: exported functions, entry-point patterns, detected route handlers, test functions, constructors, React components, and functions transitively reachable from any exported function in the same file. Returns per-module breakdown with confidence levels (high / medium / low).

---

## Contract & Lock

### BoundaryChecker

Runs all declared constraint rules from `mikk.json` against the lock file. For each violation: source function, target function, which rule was violated, severity. Used by `mikk_before_edit` and `mikk ci`.

**Six constraint types:**
- `no-import` — module A must not import from B
- `must-use` — module A must use dependency B
- `no-call` — specific functions must not call specific targets
- `layer` — layered architecture (can only import from lower layers)
- `naming` — function or file naming regex
- `max-files` — maximum file count per module

### Merkle Hashing

SHA-256 at every level:
```
function hash → file hash → module hash → root hash
```

One root hash comparison = instant full drift detection with zero file reads for unchanged subtrees. Hash store persisted in SQLite with WAL mode.

### LockCompiler

Compiles `DependencyGraph` + `MikkContract` + parsed files into a `MikkLock`. Lock format uses an integer function index — call edges are stored as integer references for compact output (~60% smaller than raw source).

### ContractReader / LockReader / AdrManager

Read and write `mikk.json` and `mikk.lock.json`. All writes use atomic temp-file + rename. `AdrManager` additionally holds a file lock during writes to prevent concurrent agent corruption.

---

## Search

### BM25Index

Full-text BM25 ranking over function tokens (name, params, purpose, file path). Used by `mikk_search_functions`.

### DirectSearchEngine

O(1) lookups against a prebuilt index:
- `getExactMatch(name)` — direct name lookup
- `findBySignature(sig)` — signature string match
- `findByLocation(file, line)` — function containing a specific line
- `findSimilar(query)` — Levenshtein-distance fuzzy match

---

## Key Types

```typescript
interface ParsedFile {
  path: string
  hash: string
  language: string
  functions: ParsedFunction[]
  classes: ParsedClass[]
  imports: ParsedImport[]
  exports: ParsedExport[]
  routes: ParsedRoute[]
}

interface MikkLock {
  version: string
  lockDate: string
  fnIndex: string[]                       // all function IDs
  functions: Record<string, LockFunction> // keyed by ID
  files: Record<string, LockFile>
  classes: Record<string, LockClass>
  routes: LockRoute[]
  syncState: { status: string; lastUpdated: number }
}
```

---

## Tests

```bash
bun test
```

196 tests across: TypeScript parser, JavaScript parser, Go extractor, dependency graph, impact analysis, hash store, boundary checker, dead code detection, BM25 search, fuzzy matching, filesystem utilities.
