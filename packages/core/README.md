# @getmikk/core

> AST parsing, dependency graph construction, Merkle-tree hashing, contract management, and foundational utilities for the Mikk ecosystem.

[![npm](https://img.shields.io/npm/v/@getmikk/core)](https://www.npmjs.com/package/@getmikk/core)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](../../LICENSE)

`@getmikk/core` is the foundation package that every other Mikk package depends on. It provides the complete pipeline for understanding a TypeScript codebase: parsing source files into structured ASTs, building a full dependency graph, computing Merkle-tree hashes for drift detection, and managing the `mikk.json` contract and `mikk.lock.json` lock file.

---

## Installation

```bash
npm install @getmikk/core
# or
bun add @getmikk/core
```

---

## Architecture Overview

```
Source Files (.ts/.tsx)
        │
        ▼
   ┌─────────┐
   │  Parser  │  ← TypeScriptParser + TypeScriptExtractor
   └────┬────┘
        │  ParsedFile[]
        ▼
  ┌──────────────┐
  │ GraphBuilder  │  ← Two-pass: nodes → edges
  └──────┬───────┘
         │  DependencyGraph
         ▼
  ┌────────────────┐
  │ LockCompiler   │  ← Merkle-tree hashes
  └───────┬────────┘
          │  MikkLock
          ▼
  ┌─────────────────┐
  │ ContractWriter   │  ← Permission model (never/ask/explicit)
  └─────────────────┘
```

---

## Modules

### 1. Parser — Source Code Analysis

The parser module turns raw TypeScript/TSX files into structured `ParsedFile` objects using the TypeScript Compiler API.

```typescript
import { TypeScriptParser, getParser, parseFiles } from '@getmikk/core'

// Parse a single file
const parser = new TypeScriptParser()
const parsed = parser.parse('/src/utils/math.ts', fileContent)

console.log(parsed.functions)  // ParsedFunction[] — name, params, returnType, startLine, endLine, calls[]
console.log(parsed.classes)    // ParsedClass[] — name, methods[], properties[], decorators[]
console.log(parsed.imports)    // ParsedImport[] — source, specifiers, isTypeOnly
console.log(parsed.exports)    // ParsedExport[] — name, isDefault, isTypeOnly
console.log(parsed.generics)   // ParsedGeneric[] — interfaces, types, const declarations

// Factory — auto-selects parser by file extension
const parser = getParser('component.tsx') // returns TypeScriptParser

// Batch parse with import resolution
const files = await parseFiles(filePaths, projectRoot, readFileFn)
// Returns ParsedFile[] with all import paths resolved to absolute paths
```

#### TypeScriptExtractor

The extractor walks the TypeScript AST and pulls out detailed metadata:

- **Functions**: name, parameters (with types & defaults), return type, line range, internal calls, `async`/generator flags, decorators, type parameters
- **Classes**: name, methods (with full function metadata), properties, decorators, `extends`/`implements`, type parameters
- **Generics**: interfaces, type aliases, const declarations, enums
- **Imports**: named, default, namespace, type-only imports
- **Exports**: named, default, re-exports

#### TypeScriptResolver

Resolves import paths against the actual project filesystem:

```typescript
import { TypeScriptResolver } from '@getmikk/core'

const resolver = new TypeScriptResolver()
// Resolves: relative paths, path aliases (tsconfig paths), index files, extension inference (.ts/.tsx/.js)
const resolved = resolver.resolve(importDecl, fromFilePath, allProjectFiles)
```

---

### 2. Graph — Dependency Graph Construction

The graph module builds a complete dependency graph from parsed files.

```typescript
import { GraphBuilder, ImpactAnalyzer, ClusterDetector } from '@getmikk/core'

// Build the graph
const builder = new GraphBuilder()
const graph = builder.build(parsedFiles)

console.log(graph.nodes)     // Map<string, GraphNode> — file, function, class, generic nodes
console.log(graph.edges)     // GraphEdge[] — import, call, containment, implements edges
console.log(graph.adjacency) // Map<string, string[]> — forward adjacency
console.log(graph.reverse)   // Map<string, string[]> — reverse adjacency
```

#### GraphBuilder

Two-pass construction:
1. **Pass 1 — Nodes**: Creates nodes for every file, function, class, and generic declaration
2. **Pass 2 — Edges**: Creates edges for imports, function calls, class containment, and cross-file references

Node types: `file`, `function`, `class`, `generic`  
Edge types: `import`, `call`, `containment`, `implements`

#### ImpactAnalyzer

BFS backward walk to find everything affected by a change:

```typescript
const analyzer = new ImpactAnalyzer(graph)
const impact = analyzer.analyze(['src/utils/math.ts::calculateTotal'])

console.log(impact.changed)    // string[] — directly changed node IDs
console.log(impact.impacted)   // string[] — transitively affected nodes
console.log(impact.depth)      // number — max propagation depth
console.log(impact.confidence) // number — 0-1 confidence score
```

#### ClusterDetector

Greedy agglomeration algorithm for automatic module discovery:

```typescript
const detector = new ClusterDetector(graph, /* minClusterSize */ 3, /* minCouplingScore */ 0.1)
const clusters = detector.detect()

// Returns ModuleCluster[] with:
// - id, label (auto-generated from common paths)
// - nodeIds[] — functions/classes in this cluster
// - cohesion — internal coupling score (0-1)
// - coupling — Map<clusterId, score> — external coupling
```

The algorithm starts with one cluster per file, then iteratively merges the pair with the highest coupling score until no pair exceeds the threshold.

---

### 3. Contract — mikk.json & mikk.lock.json

The contract module manages the two core Mikk files using Zod validation.

#### Schemas

All schemas are exported as Zod objects for runtime validation:

```typescript
import {
  MikkContractSchema,   // mikk.json validation
  MikkLockSchema,       // mikk.lock.json validation
  MikkModuleSchema,     // Module definition
  MikkDecisionSchema,   // Architecture decision record
} from '@getmikk/core'

// Validate a contract
const result = MikkContractSchema.safeParse(rawJson)
if (!result.success) console.error(result.error.issues)
```

#### mikk.json (Contract)

Defines the project's architectural rules:

```typescript
type MikkContract = {
  name: string
  version: string
  modules: Record<string, MikkModule>  // Module definitions with intent, public API, constraints
  decisions: MikkDecision[]            // Architecture Decision Records (ADRs)
  overwrite: {
    permission: 'never' | 'ask' | 'explicit'
    lastOverwrittenBy?: string
    lastOverwrittenAt?: string
  }
}
```

#### mikk.lock.json (Lock File)

Auto-generated snapshot of the entire codebase:

```typescript
type MikkLock = {
  generatorVersion: string
  generatedAt: string
  rootHash: string                    // Merkle root of entire project
  modules: Record<string, MikkLockModule>
}

type MikkLockModule = {
  hash: string                        // Merkle hash of all files in module
  files: Record<string, MikkLockFile>
}

type MikkLockFile = {
  hash: string
  functions: Record<string, MikkLockFunction>
  classes: Record<string, MikkLockClass>
  generics: Record<string, MikkLockGeneric>
}
```

#### ContractReader / LockReader

```typescript
import { ContractReader, LockReader } from '@getmikk/core'

const contractReader = new ContractReader()
const contract = await contractReader.read('./mikk.json')

const lockReader = new LockReader()
const lock = await lockReader.read('./mikk.lock.json')
await lockReader.write(updatedLock, './mikk.lock.json')
```

#### ContractWriter — Permission Model

```typescript
import { ContractWriter } from '@getmikk/core'

const writer = new ContractWriter()

// First-time write
await writer.writeNew(contract, './mikk.json')

// Update with permission model
const result = await writer.update(existingContract, updates, './mikk.json')
// result.updated — boolean
// result.requiresConfirmation — true if permission is 'ask'
// result.proposedChanges — diff object when confirmation needed
```

Permission levels:
- **`never`** — Contract is read-only, updates are rejected
- **`ask`** — Returns `requiresConfirmation: true` with proposed changes
- **`explicit`** — Auto-applies updates with audit trail

#### LockCompiler

Compiles the full lock file from graph + contract + parsed files:

```typescript
import { LockCompiler } from '@getmikk/core'

const compiler = new LockCompiler()
const lock = compiler.compile(graph, contract, parsedFiles)
// Computes Merkle-tree hashes at every level:
// function → file → module → root
```

#### ContractGenerator

Auto-generates a `mikk.json` skeleton from detected clusters:

```typescript
import { ContractGenerator } from '@getmikk/core'

const generator = new ContractGenerator()
const contract = generator.generateFromClusters(clusters, parsedFiles, 'my-project')
```

#### BoundaryChecker

CI-ready enforcement layer:

```typescript
import { BoundaryChecker } from '@getmikk/core'

const checker = new BoundaryChecker(contract, lock)
const result = checker.check()

if (!result.pass) {
  for (const v of result.violations) {
    console.error(`${v.severity}: ${v.message}`)
    // severity: 'error' | 'warning'
    // type: 'boundary-crossing' | 'constraint-violation'
  }
  process.exit(1)
}
```

---

### 4. Hash — Merkle-Tree Integrity

```typescript
import { hashContent, hashFile, hashFunctionBody, computeModuleHash, computeRootHash } from '@getmikk/core'

// Hash raw content (SHA-256)
const h1 = hashContent('function foo() {}')

// Hash a file from disk
const h2 = await hashFile('/src/index.ts')

// Hash a specific line range (function body)
const h3 = hashFunctionBody(fileContent, 10, 25)

// Merkle tree
const moduleHash = computeModuleHash(['fileHash1', 'fileHash2'])
const rootHash = computeRootHash(['moduleHash1', 'moduleHash2'])
```

#### HashStore — SQLite Persistence

```typescript
import { HashStore } from '@getmikk/core'

const store = new HashStore('/project/.mikk/hashes.db')

store.set('src/index.ts', 'abc123...', 4096)
const entry = store.get('src/index.ts')
// { path, hash, size, updatedAt }

const changed = store.getChangedSince(Date.now() - 60_000)
store.delete('src/old-file.ts')

// Batch operations use SQLite transactions for performance
const allPaths = store.getAllPaths()
```

Uses SQLite in WAL mode for concurrent read access and fast writes.

---

### 5. Utilities

#### Error Hierarchy

```typescript
import {
  MikkError,                  // Base error class
  ParseError,                 // File parsing failures
  ContractNotFoundError,      // mikk.json not found
  LockNotFoundError,          // mikk.lock.json not found
  UnsupportedLanguageError,   // Unsupported file extension
  OverwritePermissionError,   // Contract overwrite denied
  SyncStateError,             // Lock file out of sync
} from '@getmikk/core'
```

#### Logging

```typescript
import { logger, setLogLevel } from '@getmikk/core'

setLogLevel('debug') // 'debug' | 'info' | 'warn' | 'error' | 'silent'

logger.info('Analysis complete', { files: 42, duration: '1.2s' })
// Outputs structured JSON to stderr
```

#### File Utilities

```typescript
import { discoverFiles, readFileContent, writeFileContent, fileExists, setupMikkDirectory } from '@getmikk/core'

// Discover TypeScript files
const files = await discoverFiles('/project', ['src/**/*.ts'], ['node_modules'])

// Read/write
const content = await readFileContent('/src/index.ts')
await writeFileContent('/output/result.json', jsonString) // auto-creates directories

// Initialize .mikk/ directory structure
await setupMikkDirectory('/project')
```

#### Fuzzy Matching

```typescript
import { scoreFunctions, findFuzzyMatches, levenshtein } from '@getmikk/core'

// Score lock file functions against a natural-language prompt
const matches = scoreFunctions('calculate the total price', lock, 10)
// Returns FuzzyMatch[] sorted by relevance score

// "Did you mean?" suggestions
const suggestions = findFuzzyMatches('calcualteTotal', lock, 5)
// Returns closest function names by Levenshtein distance

// Raw edit distance
const dist = levenshtein('kitten', 'sitting') // 3
```

---

## Types

All types are exported and can be imported directly:

```typescript
import type {
  // Parser
  ParsedFile, ParsedFunction, ParsedClass, ParsedImport, ParsedExport, ParsedParam, ParsedGeneric,
  // Graph
  DependencyGraph, GraphNode, GraphEdge, ImpactResult, NodeType, EdgeType, ModuleCluster,
  // Contract
  MikkContract, MikkLock, MikkModule, MikkDecision, MikkLockFunction, MikkLockModule, MikkLockFile,
  // Boundary
  BoundaryViolation, BoundaryCheckResult, ViolationSeverity,
  // Writer
  UpdateResult,
} from '@getmikk/core'
```

---

## License

[Apache-2.0](../../LICENSE)
