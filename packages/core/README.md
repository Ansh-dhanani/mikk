# @getmikk/core

> AST parsing, dependency graph, Merkle hashing, contract management, boundary enforcement.

[![npm](https://img.shields.io/npm/v/@getmikk/core)](https://www.npmjs.com/package/@getmikk/core)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](../../LICENSE)

Foundation package for the Mikk ecosystem. All other packages depend on core — nothing in core depends on them.

> Part of [Mikk](../../README.md) — live architectural context for your AI agent.

---

## What is in core

### Parsers

Three language parsers, each following the same interface: `parse(filePath, content)` → `ParsedFile`.

**TypeScript / TSX**
Uses the TypeScript Compiler API. Extracts: functions (name, params with types, return type, start/end line, async flag, decorators, generics), classes (methods, properties, inheritance), imports (named, default, namespace, type-only) with full resolution (tsconfig `paths` alias resolution, recursive `extends` chain, index file inference, extension inference). Every extracted function has its exact byte-accurate body location.

**JavaScript / JSX**
Uses the TypeScript Compiler API with `ScriptKind` inference (detects JS/JSX/CJS/MJS). Handles: JSX expression containers, default exports, CommonJS `module.exports`, re-exports via barrel files.

**Go**
Regex + stateful scanning. No Go toolchain dependency. Extracts: functions, methods (with receiver types), structs, interfaces, package imports. `go.mod` used for project boundary detection.

### GraphBuilder

Two-pass O(n) dependency graph construction:
1. **Pass 1** — create all nodes (functions, files)
2. **Pass 2** — wire all edges (import edges, call edges, containment edges)

Result: `DependencyGraph` with forward `outEdges` and reverse `inEdges` maps for O(1) lookups in both directions.

### ImpactAnalyzer

BFS backward walk from a set of changed nodes. Returns:
- `changed` — directly modified nodes
- `impacted` — all transitively affected upstream callers
- `classified` — impacted nodes sorted into `critical | high | medium | low` by proximity
- `depth` — max blast radius depth
- `confidence` — `high | medium | low` based on analysis mode

### ClusterDetector

Groups files into logical modules via greedy agglomeration. Produces clusters with a `confidence` score (0–1). Used by `mikk init` to auto-generate `mikk.json` from an unknown codebase.

### BoundaryChecker

Runs all declared constraint rules against the lock file. For each violation, returns: the source function, target function, which rule was violated, and severity. Used live by `mikk_before_edit` and `mikk ci`.

**Constraint types:**
- `no-import` — module A must not import from module B
- `must-use` — module A must use dependency B
- `no-call` — specific functions must not call specific targets
- `layer` — layered architecture enforcement (can only import from lower-numbered layers)
- `naming` — function or file naming pattern via regex
- `max-files` — maximum file count per module

### Merkle Hashing

SHA-256 at every level:
```
function hash → file hash → module hash → root hash
```

One root hash comparison = instant full drift detection. Persisted in SQLite with WAL mode for zero-contention concurrent reads.

### LockCompiler

Compiles a `DependencyGraph` + `MikkContract` + parsed files into a `MikkLock`. The lock file is the single source of truth for all MCP tools and CLI commands.

Lock format v1.7.0:
- Integer-based function index (`fnIndex`) — call graph edges stored as integer references, not repeated strings
- Compact JSON output — no pretty-printing
- Backward-compatible hydration for older formats

### ContractReader / ContractWriter / LockReader

Read and write `mikk.json` and `mikk.lock.json`. `LockReader.write()` uses atomic temp-file + rename to prevent corruption.

### AdrManager

CRUD for Architectural Decision Records in `mikk.json`. Add, update, remove, list, and get individual decisions. ADRs surface in all AI context queries via the MCP server.

### DeadCodeDetector

Identifies functions with zero callers after exempting: exported functions, entry points, detected route handlers, test functions, and constructors. Returns per-module breakdown.

### Route Detection

Detects HTTP route definitions in Express, Koa, and Hono patterns. Extracts: HTTP method, path string, handler function reference, middleware chain, file, and line number.

---

## Key Types

```typescript
interface ParsedFile {
  path: string
  hash: string
  language: string
  functions: ParsedFunction[]
  imports: ParsedImport[]
  exports: ParsedExport[]
  classes: ParsedClass[]
  routes: ParsedRoute[]
}

interface DependencyGraph {
  nodes: Map<string, GraphNode>
  edges: GraphEdge[]
  outEdges: Map<string, GraphEdge[]>
  inEdges: Map<string, GraphEdge[]>
}

interface MikkLock {
  version: string
  lockDate: string
  project: { name: string; language: string }
  fnIndex: string[]          // all function IDs — edges reference by integer index
  functions: Record<string, LockFunction>
  files: Record<string, LockFile>
  routes: LockRoute[]
  syncState: { status: string; lastUpdated: number }
}
```

---

## Test Coverage

196 tests across: TypeScript parser, JavaScript parser, Go parser, dependency graph, impact analysis, hash store, contract validation, dead code detection, fuzzy matching, filesystem utilities.

```bash
bun test
```
