# Mikk — Complete Technical Implementation Reference
> Every algorithm. Every exact data structure. Every edge case with precise handling.
> This document fills every gap in the spec and developer bible.

---

## How to Use This Document

Every section in this document corresponds to a real implementation question that the developer bible left open with `...` or a vague description. Each section gives you the exact algorithm, the exact data structure, and the exact behavior for every edge case. Read the section for the component you are about to build before you start coding it.

---

# SECTION 1 — DATA STRUCTURES (EXACT)

Everything flows through these structures. Get them right before writing any logic.

## 1.1 The Hash Store

**Problem it solves:** The watcher needs to know the previous hash of every file to detect changes. This store survives process restarts.

**Format:** SQLite database at `.mikk/cache/hashes.db`. Not JSON — SQLite handles concurrent reads safely and is faster than JSON for 10,000+ entries.

```sql
CREATE TABLE IF NOT EXISTS file_hashes (
  path        TEXT PRIMARY KEY,
  hash        TEXT NOT NULL,
  size_bytes  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL  -- Unix timestamp ms
);

CREATE INDEX IF NOT EXISTS idx_updated_at ON file_hashes(updated_at);
```

**Why SQLite not JSON:**
- JSON requires loading the entire file to update one entry
- SQLite updates one row in microseconds
- SQLite handles concurrent access from watcher daemon and CLI simultaneously
- SQLite survives partial writes (journaling)

**Interface:**
```typescript
export class HashStore {
  private db: Database  // better-sqlite3

  constructor(projectRoot: string) {
    const dbPath = path.join(projectRoot, '.mikk', 'cache', 'hashes.db')
    this.db = new Database(dbPath)
    this.db.exec(CREATE_SCHEMA_SQL)
  }

  get(filePath: string): string | null {
    const row = this.db
      .prepare('SELECT hash FROM file_hashes WHERE path = ?')
      .get(filePath) as { hash: string } | undefined
    return row?.hash ?? null
  }

  set(filePath: string, hash: string, sizeBytes: number): void {
    this.db
      .prepare(`INSERT OR REPLACE INTO file_hashes
                (path, hash, size_bytes, updated_at) VALUES (?, ?, ?, ?)`)
      .run(filePath, hash, sizeBytes, Date.now())
  }

  delete(filePath: string): void {
    this.db.prepare('DELETE FROM file_hashes WHERE path = ?').run(filePath)
  }

  // Get all paths where stored hash differs from current file hash
  // Used on startup to detect changes while daemon was not running
  async getChangedSince(timestamp: number): Promise<string[]> {
    const rows = this.db
      .prepare('SELECT path FROM file_hashes WHERE updated_at > ?')
      .all(timestamp) as { path: string }[]
    return rows.map(r => r.path)
  }

  getAllPaths(): string[] {
    const rows = this.db
      .prepare('SELECT path FROM file_hashes')
      .all() as { path: string }[]
    return rows.map(r => r.path)
  }
}
```

**Edge case — database locked:** When two processes (watcher + CLI) write simultaneously, SQLite locks the database. Use `better-sqlite3` which handles this automatically via WAL mode:
```typescript
this.db = new Database(dbPath)
this.db.pragma('journal_mode = WAL')   // Write-Ahead Logging
this.db.pragma('busy_timeout = 5000')  // Wait up to 5s if locked
```

**Edge case — corrupted database:** If the database file is corrupted (partial write during crash), SQLite will throw on open. Catch it, delete the file, recreate it. The cost is a full re-hash on next run — acceptable because hashes are computed from file content which still exists.
```typescript
try {
  this.db = new Database(dbPath)
} catch (err) {
  logger.warn('Hash store corrupted, recreating', { error: err.message })
  fs.unlinkSync(dbPath)
  this.db = new Database(dbPath)
}
```

---

## 1.2 The Lock Fragment Format

**What a fragment is:** One JSON file per module, stored at `.mikk/fragments/{moduleHash}.lock`. Contains everything about that module's functions and their relationships.

```typescript
// Exact structure of one fragment file
export interface LockFragment {
  moduleId: string              // "auth"
  moduleName: string            // "Authentication"
  hash: string                  // Merkle hash of all files in this module
  generatedAt: string           // ISO timestamp
  files: {
    [filePath: string]: {
      hash: string              // SHA-256 of file content
      lastModified: string      // ISO timestamp
      parseStatus: 'ok' | 'error' | 'generated' | 'skipped'
      parseError?: string       // Error message if parseStatus === 'error'
    }
  }
  functions: {
    [functionId: string]: {
      id: string                // "fn:src/auth/verify.ts:verifyToken"
      name: string              // "verifyToken"
      file: string              // "src/auth/verify.ts"
      startLine: number         // 14
      endLine: number           // 28
      hash: string              // SHA-256 of function body only
      signature: string         // "verifyToken(token: string): boolean"
      isExported: boolean
      isAsync: boolean
      isGenerator: boolean
      decorators: string[]      // ["Injectable", "Get('/path')"]
      calls: CallRef[]
      calledBy: string[]        // function IDs that call this
      externalCalls: ExternalCallRef[]  // calls to npm packages
      typeSignature: {
        params: { name: string; type: string; optional: boolean }[]
        returnType: string
        typeParameters: string[]  // ["T", "U"]
      }
    }
  }
  externalDependencies: {
    [packageName: string]: string[]  // package → list of used exports
  }
  confidence: number            // 0.0-1.0 module boundary confidence
  unresolved: {                 // things we couldn't figure out
    imports: string[]           // import sources we couldn't resolve
    calls: string[]             // call targets we couldn't identify
    dynamicPatterns: DynamicCallGroup[]
  }
}

export interface CallRef {
  target: string               // "fn:src/utils/jwt.ts:jwtDecode"
  isDynamic: boolean           // true if dispatch through object/map
  isOptional: boolean          // true if using optional chaining: fn?.()
  confidence: 'high' | 'medium' | 'low'
  resolvedBy: 'semantic' | 'syntactic' | 'inferred'
}

export interface ExternalCallRef {
  package: string              // "jsonwebtoken"
  method: string               // "verify"
  via: string                  // "jwt" (the import alias used)
}

export interface DynamicCallGroup {
  pattern: string              // "handlers[eventType]()"
  potentialTargets: string[]   // function IDs that could be called
  location: { file: string; line: number }
}
```

**The manifest file** at `.mikk/fragments/manifest.json`:
```typescript
export interface FragmentManifest {
  version: string              // "1.0"
  generatedAt: string
  modules: {
    [moduleId: string]: {
      fragmentPath: string     // ".mikk/fragments/a3f9b2c1.lock"
      hash: string             // Merkle hash (same as filename)
      fileCount: number
      functionCount: number
    }
  }
  unassigned: {                // Files matching no module pattern
    files: string[]
    functionCount: number
  }
  rootHash: string             // Merkle root of all module hashes
  stats: {
    totalFiles: number
    totalFunctions: number
    parseErrors: number
    resolvedCalls: number
    unresolvedCalls: number
  }
}
```

---

## 1.3 The Sync State File

Written atomically using write-to-temp + rename pattern. Located at `.mikk/sync-state.json`.

```typescript
export interface SyncState {
  status: 'clean' | 'syncing' | 'drifted' | 'conflict'
  lastSyncAt: string           // ISO timestamp of last successful clean sync
  lastUpdatedAt: string        // ISO timestamp of last write to this file
  watcherPid?: number          // PID of running watcher daemon
  watcherStartedAt?: string    // When daemon started
  lockHash: string             // SHA-256 of mesh.lock.json content
  contractHash: string         // SHA-256 of mikk.json content
  rootHash: string             // Merkle root from manifest
  syncingFile?: string         // Which file is currently being processed
  driftedFiles: string[]       // Files that changed while status was drifted
  conflicts: {
    file: string
    reason: string
    since: string
  }[]
  lastError?: string           // Last error message if status is 'conflict'
}
```

**Atomic write implementation:**
```typescript
async function writeSyncState(
  projectRoot: string,
  state: SyncState
): Promise<void> {
  const finalPath = path.join(projectRoot, '.mikk', 'sync-state.json')
  const tmpPath = finalPath + '.tmp.' + process.pid

  try {
    await fs.writeFile(tmpPath, JSON.stringify(state, null, 2), 'utf-8')
    await fs.rename(tmpPath, finalPath)
    // rename() is atomic on POSIX systems
    // On Windows, rename() fails if target exists — use a different strategy:
    // writeFile directly (Windows fs is not POSIX but Node handles it)
  } catch (err) {
    // Clean up tmp file on failure
    await fs.unlink(tmpPath).catch(() => {})
    throw err
  }
}
```

**Stale sync detection:**
```typescript
function isSyncStateStale(state: SyncState): boolean {
  if (state.status !== 'syncing') return false
  const lastUpdate = new Date(state.lastUpdatedAt).getTime()
  const ageMs = Date.now() - lastUpdate
  return ageMs > 10_000  // 10 seconds → watcher probably crashed
}

// If stale, treat as drifted and warn user
if (isSyncStateStale(state)) {
  logger.warn('Sync state is stale — watcher may have crashed')
  return { ...state, status: 'drifted' }
}
```

---

# SECTION 2 — THE IMPORT RESOLUTION ALGORITHM (COMPLETE)

This is the hardest part of the parser. Get this wrong and the entire graph is wrong.

## 2.1 Resolution Order

For any import `import { X } from 'SOURCE'` in file `IMPORTER`:

```
1. Is SOURCE a relative path? (starts with ./ or ../)
   YES → resolve as relative file path
   NO  → continue

2. Is SOURCE a path alias? (matches tsconfig paths, e.g. @/ or ~/)
   YES → expand alias to absolute path, then resolve as relative
   NO  → continue

3. Is SOURCE a workspace package? (matches monorepo package names)
   YES → resolve to that package's source entry point
   NO  → continue

4. SOURCE is an external npm package
   → Record as ExternalDependency, do NOT try to resolve further
```

## 2.2 Relative Path Resolution (Step 1)

```typescript
function resolveRelative(
  source: string,       // "../utils/jwt"
  fromFile: string,     // "src/auth/verify.ts"
  projectRoot: string
): string | null {

  const fromDir = path.dirname(fromFile)
  const base = path.resolve(fromDir, source)

  // Try each candidate in order
  const candidates = [
    base,                    // exact match: ../utils/jwt (no extension)
    base + '.ts',            // ../utils/jwt.ts
    base + '.tsx',           // ../utils/jwt.tsx
    base + '/index.ts',      // ../utils/jwt/index.ts
    base + '/index.tsx',     // ../utils/jwt/index.tsx
  ]

  for (const candidate of candidates) {
    const relativePath = path.relative(projectRoot, candidate)
    if (fileExistsInProject(relativePath)) {
      return relativePath   // Return project-relative path
    }
  }

  return null  // Could not resolve — log as unresolved
}
```

**Edge case — .js extension in imports (ESM projects):**
```typescript
// Some ESM TypeScript projects write:
import { foo } from './utils/jwt.js'
// But the actual file is jwt.ts not jwt.js
// Solution: if .js not found, try .ts
if (source.endsWith('.js')) {
  const tsVariant = source.slice(0, -3) + '.ts'
  return resolveRelative(tsVariant, fromFile, projectRoot)
}
```

## 2.3 Path Alias Resolution (Step 2)

```typescript
function resolveAlias(
  source: string,      // "@/utils/jwt"
  aliases: PathAlias[] // from tsconfig paths
): string | null {

  for (const alias of aliases) {
    // alias.prefix = "@/*", alias.targets = ["src/*"]
    const prefix = alias.prefix.replace('*', '')  // "@/"
    if (!source.startsWith(prefix)) continue

    const suffix = source.slice(prefix.length)  // "utils/jwt"
    for (const target of alias.targets) {
      const expanded = target.replace('*', suffix)  // "src/utils/jwt"
      return expanded  // Return un-prefixed path for relative resolution
    }
  }

  return null
}

// How to read tsconfig paths:
function extractAliases(tsconfig: TSConfig): PathAlias[] {
  if (!tsconfig.compilerOptions?.paths) return []

  return Object.entries(tsconfig.compilerOptions.paths).map(([pattern, targets]) => ({
    prefix: pattern,           // "@/*"
    targets: targets as string[]  // ["src/*"]
  }))
}
```

**Edge case — multiple tsconfig.json files (project references):**
```typescript
// Some projects have:
// tsconfig.json (root)
// packages/api/tsconfig.json (extends root)
// packages/web/tsconfig.json (extends root)

// Resolution: find the nearest tsconfig.json above the importing file
// Walk up from importer's directory to project root
function findNearestTsConfig(
  fromFile: string,
  projectRoot: string
): string | null {
  let dir = path.dirname(fromFile)
  while (dir !== projectRoot && dir !== path.dirname(dir)) {
    const candidate = path.join(dir, 'tsconfig.json')
    if (fs.existsSync(candidate)) return candidate
    dir = path.dirname(dir)
  }
  return path.join(projectRoot, 'tsconfig.json')
}
```

## 2.4 Barrel File Resolution (Index.ts See-Through)

**The problem:** When a file imports `from '@/auth'` or `from './auth'`, it might resolve to `src/auth/index.ts` which re-exports from `verify.ts`, `middleware.ts`, `refresh.ts`. The real dependencies are those three files, not `index.ts`.

**The algorithm:**

```typescript
async function resolveBarrelFile(
  resolvedPath: string,     // "src/auth/index.ts"
  importedNames: string[],  // ["verifyToken", "authMiddleware"]
  allParsedFiles: Map<string, ParsedFile>,
  visited: Set<string> = new Set()  // cycle detection
): Promise<ResolvedImport[]> {

  if (visited.has(resolvedPath)) return []  // Cycle detected
  visited.add(resolvedPath)

  const parsedFile = allParsedFiles.get(resolvedPath)
  if (!parsedFile) return [{ path: resolvedPath, names: importedNames }]

  // Is this a barrel file? (re-exports without own logic)
  const ownFunctions = parsedFile.functions.filter(f => f.isExported)
  const reExports = parsedFile.exports.filter(e => e.isReExport)

  if (ownFunctions.length > 0) {
    // Not a pure barrel — has its own exports, treat as real file
    return [{ path: resolvedPath, names: importedNames }]
  }

  // Pure barrel — follow re-exports
  const results: ResolvedImport[] = []

  for (const name of importedNames) {
    // Find which re-export provides this name
    const reExport = reExports.find(e =>
      e.exportedNames.includes(name) || e.isExportStar
    )

    if (!reExport) {
      // Name not found in re-exports — record unresolved
      results.push({ path: resolvedPath, names: [name], status: 'unresolved' })
      continue
    }

    // Recursively resolve through the re-export
    const deepResolved = await resolveBarrelFile(
      reExport.sourceFile,
      [name],
      allParsedFiles,
      visited
    )
    results.push(...deepResolved)
  }

  return results
}

// How to detect re-exports from AST:
// export { verifyToken } from './verify'  → isReExport: true, sourceFile: './verify'
// export * from './verify'               → isReExport: true, isExportStar: true
// export { verifyToken }                 → isReExport: false (local export)
```

**Edge case — barrel with mixed content:**
```typescript
// src/auth/index.ts
export { verifyToken } from './verify'    // re-export
export const AUTH_TIMEOUT = 3600          // own export

// This is a mixed barrel. Rule: if any own exports exist,
// treat the barrel as a real file. Don't see through it.
// The own exports mean the barrel has semantic meaning beyond just re-exporting.
```

## 2.5 Re-Export Chain Resolution

**The problem:** 
```
A imports from B
B re-exports from C  
C re-exports from D
D has the actual function
```

The algorithm above handles this recursively. The key protection is the `visited` Set — if A → B → C → A forms a loop, the second visit to A is caught immediately.

**Maximum depth:** Cap recursion at 10 levels. Real re-export chains are never deeper than 3–4 levels. At depth 10, record as `status: 'too-deep'` and treat the file at depth 10 as the target.

## 2.6 Monorepo Cross-Package Resolution (Step 3)

```typescript
function buildWorkspacePackageMap(
  projectRoot: string
): Map<string, string> {
  const packageMap = new Map<string, string>()

  // Read workspace config
  const workspacePatterns = readWorkspacePatterns(projectRoot)
  // e.g. ["packages/*", "apps/*"] from pnpm-workspace.yaml

  const packageDirs = expandGlobPatterns(workspacePatterns, projectRoot)
  // → ["packages/auth", "packages/payments", "apps/web"]

  for (const dir of packageDirs) {
    const pkgJsonPath = path.join(projectRoot, dir, 'package.json')
    if (!fs.existsSync(pkgJsonPath)) continue

    const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'))
    const packageName = pkgJson.name  // "@myorg/auth"

    // Determine the source entry point
    const sourceEntry = resolvePackageSourceEntry(pkgJson, dir)
    // Checks: exports["./source"], source field, then falls back to main

    packageMap.set(packageName, sourceEntry)
    // "@myorg/auth" → "packages/auth/src/index.ts"
  }

  return packageMap
}

function resolvePackageSourceEntry(
  pkgJson: Record<string, any>,
  packageDir: string
): string {
  // Priority order for source resolution:

  // 1. exports["./source"] field (conventional for workspaces)
  if (pkgJson.exports?.['./source']) {
    return path.join(packageDir, pkgJson.exports['./source'])
  }

  // 2. "source" field (common convention)
  if (pkgJson.source) {
    return path.join(packageDir, pkgJson.source)
  }

  // 3. "main" field pointing to src/ (not dist/)
  if (pkgJson.main && pkgJson.main.startsWith('src/')) {
    return path.join(packageDir, pkgJson.main)
  }

  // 4. Default convention: src/index.ts
  const defaultEntry = path.join(packageDir, 'src', 'index.ts')
  if (fs.existsSync(defaultEntry)) return defaultEntry

  // 5. Give up — mark as external even though it's a workspace package
  return null
}
```

---

# SECTION 3 — CALL TARGET RESOLUTION (COMPLETE)

**The problem:** `verifyToken` calls `jwtDecode`. We need to resolve `jwtDecode` to `fn:src/utils/jwt.ts:jwtDecode`. This requires knowing that `jwtDecode` was imported from `../utils/jwt`.

## 3.1 Two-Phase Resolution

**Phase 1 — Syntactic (Tree-sitter, always runs):**

```typescript
function resolveCallSyntactic(
  callName: string,          // "jwtDecode"
  callerFile: ParsedFile,    // The file containing the call
  allFiles: Map<string, ParsedFile>
): CallRef | null {

  // 1. Is it a direct call to an imported name?
  const importedAs = callerFile.imports.find(imp =>
    imp.names.includes(callName) ||
    (imp.isDefault && imp.defaultAlias === callName)
  )

  if (importedAs) {
    const targetFile = allFiles.get(importedAs.resolvedPath)
    if (!targetFile) return { target: callName, confidence: 'low', resolvedBy: 'syntactic' }

    // Find the function in target file
    const targetFn = targetFile.functions.find(f =>
      f.name === callName && f.isExported
    )

    if (targetFn) {
      return {
        target: targetFn.id,
        isDynamic: false,
        isOptional: false,
        confidence: 'high',
        resolvedBy: 'syntactic'
      }
    }

    // Function not directly in that file — might be re-exported
    // Defer to barrel resolution
    return {
      target: `unresolved:${importedAs.resolvedPath}:${callName}`,
      confidence: 'medium',
      resolvedBy: 'syntactic'
    }
  }

  // 2. Is it a method call on a known object? (jwt.verify)
  // Handled by namespace import detection — see 3.2

  // 3. Is it defined in the same file?
  const localFn = callerFile.functions.find(f => f.name === callName)
  if (localFn) {
    return {
      target: localFn.id,
      isDynamic: false,
      isOptional: false,
      confidence: 'high',
      resolvedBy: 'syntactic'
    }
  }

  return null  // Could not resolve syntactically
}
```

**Phase 2 — Semantic (TypeScript Compiler API, runs after Phase 1):**

```typescript
function resolveCallSemantic(
  callNode: ts.CallExpression,
  checker: ts.TypeChecker,
  sourceFile: ts.SourceFile
): string | null {

  // Get the type of the callee expression
  const callee = callNode.expression
  const symbol = checker.getSymbolAtLocation(callee)

  if (!symbol) return null

  // Follow through aliases (e.g. re-exports)
  const aliasedSymbol = checker.getAliasedSymbol(symbol)
  const targetSymbol = aliasedSymbol || symbol

  // Find where this symbol is declared
  const declarations = targetSymbol.getDeclarations()
  if (!declarations || declarations.length === 0) return null

  // Use the first declaration (for overloads, skip to implementation)
  const decl = declarations.find(d =>
    ts.isFunctionDeclaration(d) ||
    ts.isArrowFunction(d) ||
    ts.isMethodDeclaration(d)
  ) || declarations[0]

  const declFile = decl.getSourceFile()
  const projectRelativePath = path.relative(projectRoot, declFile.fileName)

  // Get the function name from the declaration
  let fnName: string | null = null
  if (ts.isFunctionDeclaration(decl) && decl.name) {
    fnName = decl.name.text
  } else if (ts.isVariableDeclaration(decl) && ts.isIdentifier(decl.name)) {
    fnName = decl.name.text
  } else if (ts.isMethodDeclaration(decl) && ts.isIdentifier(decl.name)) {
    fnName = decl.name.text
  }

  if (!fnName) return null

  return `fn:${projectRelativePath}:${fnName}`
}
```

## 3.2 Namespace Call Resolution

```typescript
// Handling: jwt.verify(token, secret)
// where: import * as jwt from 'jsonwebtoken'
// or:    import jwt from 'jsonwebtoken'

function resolveNamespaceCall(
  node: ts.PropertyAccessExpression,  // jwt.verify
  callerFile: ParsedFile
): ExternalCallRef | CallRef | null {

  const objectName = node.expression.getText()  // "jwt"
  const methodName = node.name.getText()          // "verify"

  // Find the import that created 'jwt'
  const imp = callerFile.imports.find(imp =>
    imp.namespaceAlias === objectName ||
    imp.defaultAlias === objectName
  )

  if (!imp) return null

  // Is it an external package?
  if (imp.isExternal) {
    return {
      type: 'external',
      package: imp.source,    // "jsonwebtoken"
      method: methodName,     // "verify"
      via: objectName         // "jwt"
    }
  }

  // It's a project file — resolve the method within that file
  // Same as regular call resolution but on the specific file
  ...
}
```

## 3.3 Dynamic Call Pattern Detection

```typescript
// Detecting: handlers[eventType]()
// Detecting: strategies[name].execute()
// These cannot be statically resolved to a single target

function detectDynamicCallPatterns(
  node: ts.CallExpression,
  sourceFile: ts.SourceFile
): DynamicCallGroup | null {

  const callee = node.expression

  // Pattern 1: obj[key]()
  if (ts.isElementAccessExpression(callee)) {
    const object = callee.expression
    const index = callee.argumentExpression

    // Is the object an identifier we can look up?
    if (ts.isIdentifier(object)) {
      // Find where 'handlers' is defined in this file
      const potentialTargets = findObjectValues(object.text, sourceFile)
      // potentialTargets: ["verifyToken", "chargeCustomer", ...]

      return {
        pattern: `${object.text}[${index.getText()}]()`,
        potentialTargets,
        location: {
          file: sourceFile.fileName,
          line: sourceFile.getLineAndCharacterOfPosition(node.pos).line + 1
        }
      }
    }
  }

  // Pattern 2: (condition ? fnA : fnB)()
  if (ts.isParenthesizedExpression(callee)) {
    const inner = callee.expression
    if (ts.isConditionalExpression(inner)) {
      return {
        pattern: `(condition ? ${inner.whenTrue.getText()} : ${inner.whenFalse.getText()})()`,
        potentialTargets: [
          resolveToFunctionId(inner.whenTrue),
          resolveToFunctionId(inner.whenFalse)
        ].filter(Boolean),
        location: { ... }
      }
    }
  }

  return null  // Not a dynamic call pattern
}

// Find all values in an object/map literal assigned to an identifier
function findObjectValues(
  identifier: string,
  sourceFile: ts.SourceFile
): string[] {
  const values: string[] = []

  // Walk AST looking for: const handlers = { ... }
  ts.forEachChild(sourceFile, function visit(node) {
    if (ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.name.text === identifier &&
        node.initializer &&
        ts.isObjectLiteralExpression(node.initializer)) {
      
      for (const prop of node.initializer.properties) {
        if (ts.isPropertyAssignment(prop) &&
            ts.isIdentifier(prop.initializer)) {
          values.push(prop.initializer.text)
        }
      }
    }
    ts.forEachChild(node, visit)
  })

  return values
}
```

---

# SECTION 4 — THE CLUSTER DETECTOR (EXACT ALGORITHM)

## 4.1 The Coupling Score Formula

**Definition:** For any two files A and B, their coupling score is:

```
coupling(A, B) = (edges between A and B) / (total edges of A + total edges of B)
```

Higher score = more tightly coupled. A score of 1.0 means A and B only call each other and nothing else.

**Implementation:**

```typescript
function computeCouplingMatrix(
  graph: DependencyGraph
): Map<string, Map<string, number>> {

  const matrix = new Map<string, Map<string, number>>()
  const fileEdgeCounts = new Map<string, number>()

  // Count total edges per file
  for (const [nodeId, node] of graph.nodes) {
    if (node.type !== 'file') continue
    const outCount = (graph.outEdges.get(nodeId) || []).length
    const inCount = (graph.inEdges.get(nodeId) || []).length
    fileEdgeCounts.set(nodeId, outCount + inCount)
  }

  // Count edges between each pair of files
  for (const edge of graph.edges) {
    if (edge.type !== 'imports' && edge.type !== 'calls') continue

    const sourceFile = getFileForNode(edge.source, graph)
    const targetFile = getFileForNode(edge.target, graph)

    if (!sourceFile || !targetFile || sourceFile === targetFile) continue

    // Increment count for this pair (normalize to avoid duplicates)
    const key1 = [sourceFile, targetFile].sort().join('::')
    incrementPairCount(matrix, sourceFile, targetFile)
    incrementPairCount(matrix, targetFile, sourceFile)
  }

  // Normalize to coupling scores
  for (const [file, partners] of matrix) {
    const totalEdges = fileEdgeCounts.get(file) || 1
    for (const [partner, edgeCount] of partners) {
      const partnerEdges = fileEdgeCounts.get(partner) || 1
      const score = (edgeCount * 2) / (totalEdges + partnerEdges)
      partners.set(partner, score)
    }
  }

  return matrix
}
```

## 4.2 Cluster Formation Algorithm

**Algorithm: Greedy agglomeration**

```typescript
export function detectClusters(
  graph: DependencyGraph,
  minClusterSize: number = 2,
  minCouplingScore: number = 0.2
): ModuleCluster[] {

  const couplingMatrix = computeCouplingMatrix(graph)
  const files = getFileNodes(graph)
  const assigned = new Set<string>()
  const clusters: ModuleCluster[] = []

  // Sort files by total edge count (descending)
  // Start clustering from most connected files
  const sortedFiles = files.sort((a, b) =>
    getTotalEdges(b, graph) - getTotalEdges(a, graph)
  )

  for (const seedFile of sortedFiles) {
    if (assigned.has(seedFile)) continue

    // Start a new cluster with this file as seed
    const cluster: string[] = [seedFile]
    assigned.add(seedFile)

    // Find all files strongly coupled to any file in this cluster
    let expanded = true
    while (expanded) {
      expanded = false

      for (const clusterFile of [...cluster]) {
        const partners = couplingMatrix.get(clusterFile) || new Map()

        for (const [candidate, score] of partners) {
          if (assigned.has(candidate)) continue
          if (score < minCouplingScore) continue

          // Is this candidate more coupled to this cluster than to others?
          const clusterAffinity = computeClusterAffinity(
            candidate, cluster, couplingMatrix
          )
          const bestOutsideAffinity = computeBestOutsideAffinity(
            candidate, cluster, couplingMatrix, assigned
          )

          if (clusterAffinity > bestOutsideAffinity) {
            cluster.push(candidate)
            assigned.add(candidate)
            expanded = true
          }
        }
      }
    }

    if (cluster.length >= minClusterSize) {
      clusters.push({
        files: cluster,
        confidence: computeClusterConfidence(cluster, graph),
        suggestedName: inferClusterName(cluster),
        suggestedPath: inferClusterPath(cluster)
      })
    }
  }

  // Orphan files (no cluster) go to their own single-file clusters
  for (const file of files) {
    if (!assigned.has(file)) {
      clusters.push({
        files: [file],
        confidence: 0.3,  // Low confidence for single-file clusters
        suggestedName: path.basename(path.dirname(file)),
        suggestedPath: path.dirname(file) + '/**'
      })
    }
  }

  return clusters.sort((a, b) => b.confidence - a.confidence)
}
```

## 4.3 Cluster Confidence Score

```typescript
function computeClusterConfidence(
  clusterFiles: string[],
  graph: DependencyGraph
): number {

  let internalEdges = 0
  let externalEdges = 0

  const clusterSet = new Set(clusterFiles)

  for (const file of clusterFiles) {
    const outEdges = graph.outEdges.get(file) || []
    for (const edge of outEdges) {
      const targetFile = getFileForNode(edge.target, graph)
      if (!targetFile) continue

      if (clusterSet.has(targetFile)) {
        internalEdges++
      } else {
        externalEdges++
      }
    }
  }

  // Perfect cluster: all edges internal → 1.0
  // Completely open cluster: all edges external → 0.0
  if (internalEdges + externalEdges === 0) return 0.5  // No edges → unknown

  return internalEdges / (internalEdges + externalEdges)
}
```

## 4.4 Module Name Inference

```typescript
function inferClusterName(files: string[]): string {
  // Strategy 1: Common directory name
  const dirs = files.map(f => path.dirname(f).split('/').pop() || '')
  const dirCounts = countFrequency(dirs)
  const mostCommonDir = getMostCommon(dirCounts)
  if (mostCommonDir && mostCommonDir !== 'src') return mostCommonDir

  // Strategy 2: Common prefix in filenames
  const filenames = files.map(f => path.basename(f, '.ts'))
  const prefix = longestCommonPrefix(filenames)
  if (prefix.length > 3) return prefix

  // Strategy 3: Most common noun in exported function names
  const exportedFunctions = getAllExportedFunctions(files)
  const words = exportedFunctions.flatMap(f => extractWords(f.name))
  const wordCounts = countFrequency(words)
  const topWord = getMostCommon(wordCounts)
  if (topWord) return topWord

  // Fallback: parent directory name
  return path.basename(path.dirname(files[0]))
}
```

---

# SECTION 5 — THE CONSTRAINT CHECKER (COMPLETE RULE-BASED APPROACH)

**Critical design decision:** The constraint checker does NOT call the AI for every constraint check. That would be slow (500ms+ per check) and expensive. Instead it uses rule-based pattern matching with a fallback to AI only for complex/ambiguous constraints.

## 5.1 Constraint Classification

When `mikk init` runs or when constraints are added, classify each constraint:

```typescript
export type ConstraintType =
  | 'no-import'      // "No direct DB access outside db/"
  | 'must-use'       // "All auth must go through auth.middleware"
  | 'no-call'        // "Never call setTimeout in the payment flow"
  | 'layer'          // "Controllers cannot import from repositories directly"
  | 'naming'         // "All exported functions must be camelCase"
  | 'complex'        // Everything else → AI fallback

function classifyConstraint(text: string): ConstraintType {
  const lower = text.toLowerCase()

  if (lower.includes('no direct') || lower.includes('cannot import') ||
      lower.includes('must not import')) return 'no-import'

  if (lower.includes('must go through') || lower.includes('must use') ||
      lower.includes('required')) return 'must-use'

  if (lower.includes('never call') || lower.includes('do not call')) return 'no-call'

  if (lower.includes('cannot import from') || lower.includes('layer')) return 'layer'

  if (lower.includes('must be') && (lower.includes('case') || lower.includes('named')))
    return 'naming'

  return 'complex'
}
```

## 5.2 Rule-Based Constraint Checking

```typescript
export class ConstraintChecker {

  check(
    intent: CandidateIntent,
    constraints: string[],
    lock: MikkLock,
    graph: DependencyGraph
  ): Conflict[] {
    const conflicts: Conflict[] = []

    for (const constraint of constraints) {
      const type = classifyConstraint(constraint)
      const conflict = this.checkByType(type, constraint, intent, lock, graph)
      if (conflict) conflicts.push(conflict)
    }

    return conflicts
  }

  private checkByType(
    type: ConstraintType,
    constraint: string,
    intent: CandidateIntent,
    lock: MikkLock,
    graph: DependencyGraph
  ): Conflict | null {

    switch (type) {
      case 'no-import':
        return this.checkNoImport(constraint, intent, lock, graph)
      case 'must-use':
        return this.checkMustUse(constraint, intent, lock, graph)
      case 'no-call':
        return this.checkNoCall(constraint, intent, lock, graph)
      case 'layer':
        return this.checkLayer(constraint, intent, lock, graph)
      case 'complex':
        // Defer to AI — but only if intent involves modules mentioned in constraint
        return this.checkComplex(constraint, intent, lock)
    }
  }

  // "No direct DB access outside db/"
  private checkNoImport(
    constraint: string,
    intent: CandidateIntent,
    lock: MikkLock,
    graph: DependencyGraph
  ): Conflict | null {

    // Parse: "No direct [X] access outside [Y]"
    // X = "DB" → resolve to module path: "db/"
    // Y = "db/" → files that are allowed to access it

    const match = constraint.match(
      /no direct (\w+) (?:access|import) outside (.+)/i
    )
    if (!match) return null

    const [, accessType, allowedPath] = match
    const restrictedModule = resolveModuleReference(accessType, lock)
    const allowedPattern = allowedPath.trim()

    // For each file the intent would touch
    for (const file of intent.affectedFiles) {
      // Is this file OUTSIDE the allowed zone?
      if (minimatch(file, allowedPattern)) continue  // File is in allowed zone, OK

      // Does this file import from the restricted module?
      const fileNode = lock.files[file]
      if (!fileNode) continue

      const imports = getFileImports(file, graph)
      const violation = imports.find(imp =>
        minimatch(imp.resolvedPath, `**/${restrictedModule}/**`)
      )

      if (violation) {
        return {
          constraint,
          explanation: `${file} imports directly from ${violation.resolvedPath}, which violates the "${constraint}" rule. Only files in ${allowedPattern} should access this.`,
          severity: 'error',
          suggestion: `Use the ${allowedPattern} module's public API instead of importing directly.`
        }
      }
    }

    return null
  }

  // "All auth must go through auth.middleware"
  private checkMustUse(
    constraint: string,
    intent: CandidateIntent,
    lock: MikkLock,
    graph: DependencyGraph
  ): Conflict | null {

    // Parse: "All [X] must go through [Y]"
    // X = "auth" → auth-related operations
    // Y = "auth.middleware" → specific function

    const match = constraint.match(/all (\w+) must (?:go through|use) (.+)/i)
    if (!match) return null

    const [, domain, requiredFn] = match

    // Only check if the intent touches the relevant domain
    if (!intent.affectedModules.some(m => m.includes(domain))) return null

    // Look for routes or handlers that bypass the required function
    for (const file of intent.affectedFiles) {
      const fileFunctions = getFileFunctions(file, lock)
      for (const fn of fileFunctions) {
        // Does this function in a route/handler call the required function?
        if (!isRouteOrHandler(fn, lock)) continue

        const callsRequired = fn.calls.some(call => call.target.includes(requiredFn))
        if (!callsRequired) {
          return {
            constraint,
            explanation: `${fn.name} in ${file} appears to be a route handler but doesn't call ${requiredFn}. This may bypass ${domain} authentication.`,
            severity: 'warning',
            suggestion: `Ensure ${requiredFn} is called before processing this request.`
          }
        }
      }
    }

    return null
  }

  // Complex constraints → AI with small focused prompt
  private async checkComplex(
    constraint: string,
    intent: CandidateIntent,
    lock: MikkLock
  ): Promise<Conflict | null> {

    // Only call AI if the constraint mentions something in the intent
    const constraintWords = extractKeywords(constraint)
    const intentWords = extractKeywords(intent.description)
    const overlap = constraintWords.filter(w => intentWords.includes(w))

    if (overlap.length === 0) return null  // Unrelated, skip AI call

    const response = await provider.complete({
      system: `You check if a developer's intent violates an architectural constraint. 
               Return JSON: { violated: boolean, explanation: string, suggestion: string }
               Be conservative — only flag clear violations.`,
      user: `Constraint: "${constraint}"
             Intent: "${intent.description}"
             Affected files: ${intent.affectedFiles.join(', ')}
             Does this intent violate the constraint?`,
      maxTokens: 200
    })

    const result = JSON.parse(response)
    if (!result.violated) return null

    return {
      constraint,
      explanation: result.explanation,
      severity: 'warning',  // AI-detected violations are warnings, not errors
      suggestion: result.suggestion
    }
  }
}
```

---

# SECTION 6 — THE FUZZY MATCHING ALGORITHM

**Used for:** Ranking lock file functions against a developer's prompt. When the developer types "fix the token expiry bug", we need to score every function in the lock and return the top candidates.

## 6.1 The Scoring Function

```typescript
function scoreFunctionRelevance(
  fn: LockFunction,
  prompt: string,
  promptKeywords: string[]
): number {

  let score = 0

  const fnNameLower = fn.name.toLowerCase()
  const fileLower = fn.file.toLowerCase()
  const promptLower = prompt.toLowerCase()

  // Exact name match in prompt → very high score
  if (promptLower.includes(fnNameLower)) score += 0.9

  // Each keyword that appears in function name → high score
  for (const keyword of promptKeywords) {
    if (fnNameLower.includes(keyword)) score += 0.3
    if (fileLower.includes(keyword)) score += 0.15
  }

  // Partial word match (camelCase decomposition)
  const fnWords = splitCamelCase(fn.name).map(w => w.toLowerCase())
  for (const keyword of promptKeywords) {
    if (fnWords.some(w => w.startsWith(keyword) || keyword.startsWith(w))) {
      score += 0.2
    }
  }

  // Is exported → slightly more relevant (public API)
  if (fn.isExported) score += 0.05

  // Module match → higher relevance
  // "fix auth bug" → functions in auth module score higher
  for (const keyword of promptKeywords) {
    if (fn.moduleId?.toLowerCase().includes(keyword)) score += 0.25
  }

  // Normalize to 0.0–1.0
  return Math.min(score, 1.0)
}

// Split "verifyToken" → ["verify", "Token"] → ["verify", "token"]
function splitCamelCase(name: string): string[] {
  return name
    .replace(/([A-Z])/g, ' $1')
    .split(/[\s_-]+/)
    .filter(Boolean)
}

// Extract meaningful keywords from prompt
function extractKeywords(prompt: string): string[] {
  const stopWords = new Set([
    'the', 'a', 'an', 'in', 'on', 'at', 'to', 'for', 'of', 'and', 'or',
    'is', 'it', 'fix', 'add', 'update', 'change', 'modify', 'make', 'create',
    'bug', 'issue', 'error', 'problem', 'feature', 'function', 'file', 'code'
  ])

  return prompt
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w))
}
```

## 6.2 Fuzzy Match for "Did you mean?"

When the developer mentions a function that doesn't exist in the lock:

```typescript
function findFuzzyMatches(
  searchTerm: string,
  lock: MikkLock,
  maxResults: number = 5
): string[] {

  const searchLower = searchTerm.toLowerCase()
  const scored: { name: string; score: number }[] = []

  for (const fn of Object.values(lock.functions)) {
    const nameLower = fn.name.toLowerCase()

    // Levenshtein distance normalized by length
    const distance = levenshtein(searchLower, nameLower)
    const maxLen = Math.max(searchLower.length, nameLower.length)
    const similarity = 1 - (distance / maxLen)

    // Also check if one contains the other
    const containsScore = nameLower.includes(searchLower) ||
                          searchLower.includes(nameLower) ? 0.3 : 0

    const totalScore = similarity + containsScore

    if (totalScore > 0.5) {
      scored.push({ name: fn.name, score: totalScore })
    }
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults)
    .map(s => s.name)
}
```

---

# SECTION 7 — THE MCP SERVER HANDLERS (COMPLETE)

Every handler fully implemented. No `...`.

```typescript
// packages/mcp-server/src/handlers.ts

export async function handleGetFunction(
  lock: MikkLock,
  args: { name: string; file?: string }
): Promise<MCPToolResult> {

  const { name, file } = args

  // Find all functions with this name
  const matches = Object.values(lock.functions).filter(fn => {
    const nameMatch = fn.name === name ||
                      fn.name.toLowerCase() === name.toLowerCase()
    const fileMatch = !file || fn.file.includes(file)
    return nameMatch && fileMatch
  })

  if (matches.length === 0) {
    // Try fuzzy matching for "did you mean?"
    const suggestions = findFuzzyMatches(name, lock)
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          found: false,
          searched: name,
          suggestions,
          hint: suggestions.length > 0
            ? `Did you mean: ${suggestions.join(', ')}?`
            : 'No similar functions found. Run mikk analyze to refresh.'
        })
      }]
    }
  }

  if (matches.length === 1) {
    const fn = matches[0]
    const fragment = await loadFragment(lock, fn.moduleId)

    // Read actual function body from file
    const body = await readFunctionBody(fn.file, fn.startLine, fn.endLine)

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          found: true,
          function: {
            id: fn.id,
            name: fn.name,
            file: fn.file,
            lines: `${fn.startLine}-${fn.endLine}`,
            signature: fn.signature,
            module: fn.moduleId,
            isExported: fn.isExported,
            isAsync: fn.isAsync,
            calls: fn.calls.map(c => ({
              target: c.target,
              isDynamic: c.isDynamic,
              confidence: c.confidence
            })),
            calledBy: fn.calledBy,
            body: body  // First 20 lines or full if < 20 lines
          },
          syncStatus: await getSyncStatus(projectRoot)
        })
      }]
    }
  }

  // Multiple matches — return all for AI to disambiguate
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        found: true,
        multipleMatches: true,
        matches: matches.map(fn => ({
          id: fn.id,
          name: fn.name,
          file: fn.file,
          module: fn.moduleId,
          signature: fn.signature
        })),
        hint: 'Multiple functions found with this name. Specify the file to narrow down.'
      })
    }]
  }
}

export async function handleGetModule(
  lock: MikkLock,
  contract: MikkContract,
  args: { moduleId: string }
): Promise<MCPToolResult> {

  const { moduleId } = args

  // Case-insensitive module lookup
  const moduleIdLower = moduleId.toLowerCase()
  const actualModuleId = Object.keys(lock.modules).find(
    id => id.toLowerCase() === moduleIdLower
  )

  if (!actualModuleId) {
    const available = Object.keys(lock.modules).join(', ')
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          found: false,
          searched: moduleId,
          availableModules: available
        })
      }]
    }
  }

  const module = lock.modules[actualModuleId]
  const contractModule = contract.declared.modules.find(m => m.id === actualModuleId)
  const fragment = await loadFragment(lock, actualModuleId)

  // Get all functions sorted by calledBy count (most important first)
  const functions = Object.values(fragment.functions)
    .sort((a, b) => b.calledBy.length - a.calledBy.length)

  // Find what this module depends on and what depends on it
  const dependsOn = findModuleDependencies(actualModuleId, lock, 'out')
  const dependedOnBy = findModuleDependencies(actualModuleId, lock, 'in')

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        found: true,
        module: {
          id: actualModuleId,
          name: contractModule?.name || actualModuleId,
          intent: contractModule?.intent || 'Not declared',
          paths: contractModule?.paths || [module.files[0]],
          files: module.files,
          fileCount: module.files.length,
          confidence: fragment.confidence,
          functions: functions.map(fn => ({
            name: fn.name,
            file: fn.file,
            line: fn.startLine,
            signature: fn.signature,
            isExported: fn.isExported,
            callCount: fn.calledBy.length  // How many things call this
          })),
          constraints: contract.declared.constraints.filter(c =>
            c.toLowerCase().includes(actualModuleId.toLowerCase())
          ),
          dependsOn,
          dependedOnBy,
          externalDependencies: fragment.externalDependencies
        }
      })
    }]
  }
}

export async function handleImpactAnalysis(
  lock: MikkLock,
  graph: DependencyGraph,
  args: { functionId?: string; file?: string }
): Promise<MCPToolResult> {

  let startNodes: string[] = []

  if (args.functionId) {
    // Exact function ID provided
    if (lock.functions[args.functionId]) {
      startNodes = [args.functionId]
    }
  } else if (args.file) {
    // All functions in a file
    startNodes = Object.values(lock.functions)
      .filter(fn => fn.file === args.file || fn.file.endsWith(args.file))
      .map(fn => fn.id)
  }

  if (startNodes.length === 0) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ found: false, error: 'No matching functions found' })
      }]
    }
  }

  const analyzer = new ImpactAnalyzer(graph)
  const result = analyzer.analyze(startNodes)

  // Group impacted by module for readability
  const byModule: Record<string, string[]> = {}
  for (const nodeId of result.impacted) {
    const fn = lock.functions[nodeId]
    if (!fn) continue
    if (!byModule[fn.moduleId]) byModule[fn.moduleId] = []
    byModule[fn.moduleId].push(`${fn.name} (${fn.file}:${fn.startLine})`)
  }

  // Generate human-readable summary
  const summary = generateImpactSummary(result, lock, byModule)

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        found: true,
        changed: startNodes.map(id => {
          const fn = lock.functions[id]
          return fn ? { name: fn.name, file: fn.file } : { id }
        }),
        impactedCount: result.impacted.length,
        depth: result.depth,
        confidence: result.confidence,
        byModule,
        summary,
        mermaidDiagram: generateImpactDiagram(result, lock)
      })
    }]
  }
}

function generateImpactSummary(
  result: ImpactResult,
  lock: MikkLock,
  byModule: Record<string, string[]>
): string {
  if (result.impacted.length === 0) {
    return 'No other code depends on this function. Safe to modify in isolation.'
  }

  const moduleNames = Object.keys(byModule).join(', ')
  const mostImpacted = Object.entries(byModule)
    .sort(([, a], [, b]) => b.length - a.length)[0]

  return `Changing this affects ${result.impacted.length} functions across ${Object.keys(byModule).length} module(s) (${moduleNames}). ` +
         `Most impact in ${mostImpacted[0]} module (${mostImpacted[1].length} functions). ` +
         `Propagation depth: ${result.depth} hops. ` +
         `Confidence: ${result.confidence}.`
}
```

---

# SECTION 8 — WATCHER CRASH RECOVERY

## 8.1 PID File Pattern

```typescript
// When daemon starts:
const pidFile = path.join(projectRoot, '.mikk', 'watcher.pid')
fs.writeFileSync(pidFile, process.pid.toString())

// On clean exit:
process.on('exit', () => fs.unlinkSync(pidFile))
process.on('SIGTERM', () => { fs.unlinkSync(pidFile); process.exit(0) })
process.on('SIGINT', () => { fs.unlinkSync(pidFile); process.exit(0) })

// When mikk watch is called:
function isDaemonRunning(projectRoot: string): boolean {
  const pidFile = path.join(projectRoot, '.mikk', 'watcher.pid')
  if (!fs.existsSync(pidFile)) return false

  const pid = parseInt(fs.readFileSync(pidFile, 'utf-8'))

  try {
    // Signal 0 = check if process exists without killing it
    process.kill(pid, 0)
    return true  // Process exists
  } catch {
    // ESRCH = no such process → PID file is stale
    fs.unlinkSync(pidFile)
    return false
  }
}
```

## 8.2 Startup Catch-Up Analysis

When the watcher starts (or restarts after a crash), files may have changed while it was not running. The startup routine catches up:

```typescript
async function startupCatchUp(
  projectRoot: string,
  hashStore: HashStore,
  lock: MikkLock
): Promise<CatchUpResult> {

  const daemonStoppedAt = readLastDaemonStopTime(projectRoot)
  const changedFiles: string[] = []

  // Check every file in the lock against current disk state
  for (const [filePath, fileRecord] of Object.entries(lock.files)) {
    if (!fs.existsSync(filePath)) {
      // File was deleted while daemon was down
      changedFiles.push(filePath)
      continue
    }

    const currentHash = await hashFile(filePath)
    const storedHash = hashStore.get(filePath)

    if (currentHash !== storedHash) {
      changedFiles.push(filePath)
    }
  }

  // Also check for new files not in the lock
  const allCurrentFiles = await discoverFiles(projectRoot)
  const lockFiles = new Set(Object.keys(lock.files))
  const newFiles = allCurrentFiles.filter(f => !lockFiles.has(f))
  changedFiles.push(...newFiles)

  logger.info('Startup catch-up', {
    changed: changedFiles.length,
    new: newFiles.length
  })

  if (changedFiles.length > 15) {
    // Many changes → full re-analysis faster than incremental
    return { needsFullAnalysis: true, changedFiles }
  }

  return { needsFullAnalysis: false, changedFiles }
}
```

---

# SECTION 9 — LOCK FILE CORRUPTION HANDLING

## 9.1 Validation on Load

Every time `mesh.lock.json` is loaded, validate it:

```typescript
async function loadLock(projectRoot: string): Promise<MikkLock> {
  const lockPath = path.join(projectRoot, 'mikk.lock.json')

  if (!fs.existsSync(lockPath)) {
    throw new LockNotFoundError()
  }

  let raw: string
  try {
    raw = await fs.readFile(lockPath, 'utf-8')
  } catch (err) {
    throw new LockCorruptedError('Cannot read lock file: ' + err.message)
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    // JSON parse failed → file is corrupted
    await handleCorruptedLock(projectRoot, lockPath, raw)
    throw new LockCorruptedError('Lock file contains invalid JSON. Run mikk analyze to regenerate.')
  }

  // Validate against Zod schema
  const result = MikkLockSchema.safeParse(parsed)
  if (!result.success) {
    await handleCorruptedLock(projectRoot, lockPath, raw)
    throw new LockCorruptedError(
      'Lock file schema is invalid. Run mikk analyze to regenerate. Errors: ' +
      result.error.issues.map(i => i.message).join(', ')
    )
  }

  // Verify the root hash matches the fragments
  const computedHash = await computeRootHashFromFragments(projectRoot)
  if (computedHash !== result.data.graph.rootHash) {
    logger.warn('Lock file root hash mismatch — fragments may be out of sync')
    // Don't throw — just warn. Let the watcher repair on next sync.
  }

  return result.data
}

async function handleCorruptedLock(
  projectRoot: string,
  lockPath: string,
  corruptContent: string
): Promise<void> {
  // Save corrupted file for debugging before any writes
  const backupPath = lockPath + '.corrupted.' + Date.now()
  await fs.writeFile(backupPath, corruptContent)
  logger.error('Lock file corrupted, backed up', { backupPath })
}
```

---

# SECTION 10 — AI API DOWN: GRACEFUL DEGRADATION

The intent engine calls the AI API. What happens when the API is unavailable?

## 10.1 Degradation Levels

```typescript
export class IntentInterpreter {

  async interpret(
    rawPrompt: string,
    lock: MikkLock,
    contract: MikkContract
  ): Promise<InterpretResult> {

    // Try full AI interpretation first
    try {
      const candidates = await this.interpretWithAI(rawPrompt, lock, contract)
      return { source: 'ai', candidates }
    } catch (err) {
      if (isAPIUnavailable(err)) {
        logger.warn('AI API unavailable, falling back to keyword matching')
        return this.interpretWithKeywords(rawPrompt, lock, contract)
      }
      throw err  // Other errors (auth, rate limit) — rethrow
    }
  }

  // Fallback: pure keyword-based interpretation without AI
  private interpretWithKeywords(
    rawPrompt: string,
    lock: MikkLock,
    contract: MikkContract
  ): InterpretResult {

    const keywords = extractKeywords(rawPrompt)
    const intentType = inferIntentType(rawPrompt)

    // Score every function in the lock
    const scored = Object.values(lock.functions)
      .map(fn => ({
        fn,
        score: scoreFunctionRelevance(fn, rawPrompt, keywords)
      }))
      .filter(s => s.score > 0.2)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)

    // Generate candidates from top matches
    const candidates: CandidateIntent[] = scored
      .slice(0, 3)
      .map((s, i) => ({
        description: `${intentType} ${s.fn.name} in ${s.fn.file}`,
        type: intentType,
        confidence: s.score,
        affectedFunctions: [s.fn.id],
        affectedFiles: [s.fn.file],
        affectedModules: [s.fn.moduleId],
        keywords
      }))

    if (candidates.length === 0) {
      // No good matches → ask developer to be more specific
      candidates.push({
        description: rawPrompt,
        type: intentType,
        confidence: 0.3,
        affectedFunctions: [],
        affectedFiles: [],
        affectedModules: [],
        keywords
      })
    }

    return {
      source: 'keyword-fallback',
      candidates,
      warning: '⚠️  AI API unavailable. Using keyword matching. Results may be less accurate.'
    }
  }
}

function isAPIUnavailable(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  return (
    err.message.includes('ECONNREFUSED') ||
    err.message.includes('ETIMEDOUT') ||
    err.message.includes('fetch failed') ||
    (err as any).status === 503 ||
    (err as any).status === 529  // Anthropic overloaded
  )
}
```

---

# SECTION 11 — THE TOKEN BUDGET ALGORITHM (EXACT)

```typescript
import Anthropic from '@anthropic-ai/sdk'

const tokenizer = new Anthropic()  // Used only for token counting

export async function generateClaudeMd(
  lock: MikkLock,
  contract: MikkContract,
  options: { maxTokens: number } = { maxTokens: 6000 }
): Promise<string> {

  const sections: { content: string; tier: 1 | 2 | 3; tokens: number }[] = []

  // Always build Tier 1 first
  const tier1 = buildTier1Summary(lock, contract)
  const tier1Tokens = await countTokens(tier1)
  sections.push({ content: tier1, tier: 1, tokens: tier1Tokens })

  let remaining = options.maxTokens - tier1Tokens

  // Add module details (Tier 2) ordered by importance
  const modulesByImportance = rankModulesByImportance(lock, contract)

  for (const module of modulesByImportance) {
    if (remaining < 150) break  // Not enough budget for even a small module section

    const moduleSection = buildModuleSection(module, lock, contract)
    const sectionTokens = await countTokens(moduleSection)

    if (sectionTokens > remaining) {
      // Try abbreviated version
      const abbrev = buildAbbreviatedModuleSection(module, lock, contract)
      const abbrevTokens = await countTokens(abbrev)
      if (abbrevTokens <= remaining) {
        sections.push({ content: abbrev, tier: 2, tokens: abbrevTokens })
        remaining -= abbrevTokens
      }
      continue
    }

    sections.push({ content: moduleSection, tier: 2, tokens: sectionTokens })
    remaining -= sectionTokens
  }

  // Add recent changes (Tier 3) if budget remains
  if (remaining > 100) {
    const changesSection = buildRecentChangesSection(lock)
    const changesTokens = await countTokens(changesSection)
    if (changesTokens <= remaining) {
      sections.push({ content: changesSection, tier: 3, tokens: changesTokens })
    }
  }

  const totalTokens = sections.reduce((sum, s) => sum + s.tokens, 0)
  const header = `<!-- Generated by Mikk ${new Date().toISOString()} | ${totalTokens} tokens -->\n\n`
  const content = sections.map(s => s.content).join('\n\n')

  return header + content
}

async function countTokens(text: string): Promise<number> {
  // Use Anthropic's tokenizer for accurate counting
  const response = await tokenizer.messages.countTokens({
    model: 'claude-sonnet-4-20250514',
    messages: [{ role: 'user', content: text }]
  })
  return response.input_tokens
}

function rankModulesByImportance(
  lock: MikkLock,
  contract: MikkContract
): MikkLock['modules'][string][] {

  return Object.values(lock.modules).sort((a, b) => {
    // Modules called by many other modules are more important
    const aImportance = countIncomingModuleDeps(a.id, lock)
    const bImportance = countIncomingModuleDeps(b.id, lock)
    return bImportance - aImportance
  })
}
```

---

# SECTION 12 — RACE CONDITION: FILE CHANGES DURING PARSE

```typescript
export class IncrementalAnalyzer {

  private static MAX_RETRIES = 3

  async analyze(event: FileChangeEvent): Promise<AnalysisResult> {
    return this.analyzeWithRetry(event, 0)
  }

  private async analyzeWithRetry(
    event: FileChangeEvent,
    attempt: number
  ): Promise<AnalysisResult> {

    const { path: filePath } = event

    // Read file and compute hash BEFORE parsing
    const contentBeforeParse = await fs.readFile(filePath, 'utf-8')
    const hashBeforeParse = hashContent(contentBeforeParse)

    // Parse the file
    const parsedFile = await parseFile(filePath, contentBeforeParse)

    // After parsing, re-read and re-hash to detect concurrent writes
    const contentAfterParse = await fs.readFile(filePath, 'utf-8')
    const hashAfterParse = hashContent(contentAfterParse)

    if (hashBeforeParse !== hashAfterParse) {
      // File changed while we were parsing!
      if (attempt >= IncrementalAnalyzer.MAX_RETRIES) {
        logger.warn('File changed 3 times during parsing, using latest version', { filePath })
        // Parse the latest version one more time and proceed
        const finalContent = contentAfterParse
        const finalParsed = await parseFile(filePath, finalContent)
        return this.buildResult(finalParsed, filePath, hashAfterParse)
      }

      logger.debug('File changed during parse, retrying', { filePath, attempt })
      // Wait a short time to let writes settle
      await sleep(50 * (attempt + 1))

      // Create a new event with the updated hash
      const newEvent: FileChangeEvent = {
        ...event,
        oldHash: hashBeforeParse,
        newHash: hashAfterParse
      }
      return this.analyzeWithRetry(newEvent, attempt + 1)
    }

    // Hash stable — parse result is valid
    return this.buildResult(parsedFile, filePath, hashBeforeParse)
  }
}
```

---

# SECTION 13 — FULL VS INCREMENTAL DECISION LOGIC

```typescript
export function shouldRunFullAnalysis(
  changedFiles: string[],
  projectRoot: string
): { full: boolean; reason: string } {

  // Rule 1: Too many files changed
  if (changedFiles.length > 15) {
    return {
      full: true,
      reason: `${changedFiles.length} files changed (threshold: 15). Full analysis is faster.`
    }
  }

  // Rule 2: tsconfig.json changed
  if (changedFiles.some(f => f.endsWith('tsconfig.json') || f.endsWith('tsconfig.base.json'))) {
    return {
      full: true,
      reason: 'tsconfig.json changed — path aliases may have changed, full resolution required.'
    }
  }

  // Rule 3: package.json changed
  if (changedFiles.some(f => f.endsWith('package.json'))) {
    return {
      full: true,
      reason: 'package.json changed — external dependencies may have changed.'
    }
  }

  // Rule 4: mikk.json changed
  if (changedFiles.some(f => f.endsWith('mikk.json'))) {
    return {
      full: true,
      reason: 'mikk.json changed — module definitions need full recompilation.'
    }
  }

  // Rule 5: A barrel file changed
  // Barrel file changes propagate through the entire import resolution chain
  const lockFiles = readLockFilesSync(projectRoot)
  const barrelFiles = changedFiles.filter(f =>
    f.endsWith('/index.ts') || f.endsWith('/index.tsx')
  )
  if (barrelFiles.length > 0) {
    // Count how many files import from these barrels
    const dependentCount = barrelFiles.reduce((sum, barrel) =>
      sum + countFilesImportingFrom(barrel, lockFiles), 0
    )
    if (dependentCount > 20) {
      return {
        full: true,
        reason: `Barrel file(s) changed affecting ${dependentCount} files. Full analysis safer.`
      }
    }
  }

  // Rule 6: Changes span multiple modules
  const affectedModules = getModulesForFiles(changedFiles, lockFiles)
  if (affectedModules.size > 3) {
    return {
      full: true,
      reason: `Changes span ${affectedModules.size} modules. Full analysis for consistency.`
    }
  }

  return { full: false, reason: 'Incremental analysis sufficient.' }
}
```

---

# SECTION 14 — TEST FILE SEPARATION

```typescript
// The graph data structure stores TWO graphs, not one

export interface ProjectGraphs {
  production: DependencyGraph   // Only production code
  test: DependencyGraph         // Only test code (imports production)
  combined: DependencyGraph     // Both together (for coverage analysis)
}

// When building graphs, classify each file first
function classifyFile(filePath: string): 'production' | 'test' | 'generated' | 'skip' {
  // Test file patterns
  if (
    filePath.includes('__tests__') ||
    filePath.includes('.test.') ||
    filePath.includes('.spec.') ||
    filePath.includes('/tests/') ||
    filePath.includes('/test/')
  ) return 'test'

  // Generated file detection (check content header)
  if (isGeneratedFile(filePath)) return 'generated'

  // Node modules should never be here but defensive check
  if (filePath.includes('node_modules')) return 'skip'

  return 'production'
}

// Build both graphs in one pass
function buildProjectGraphs(parsedFiles: ParsedFile[]): ProjectGraphs {
  const productionFiles = parsedFiles.filter(f => classifyFile(f.path) === 'production')
  const testFiles = parsedFiles.filter(f => classifyFile(f.path) === 'test')

  const productionGraph = new GraphBuilder().build(productionFiles)
  const testGraph = new GraphBuilder().build([...productionFiles, ...testFiles])
  const combinedGraph = testGraph  // Combined = all files

  return { production: productionGraph, test: testGraph, combined: combinedGraph }
}

// Impact analysis uses production graph by default
// mikk impact --include-tests uses combined graph
```

---

# SECTION 15 — GOD FILE AND UTILITY DETECTION

```typescript
// These are computed during lock compilation and stored in the lock

function computeNodeFlags(
  nodeId: string,
  graph: DependencyGraph,
  lock: MikkLock
): NodeFlags {

  const node = graph.nodes.get(nodeId)
  if (!node) return {}

  const inEdges = graph.inEdges.get(nodeId) || []
  const outEdges = graph.outEdges.get(nodeId) || []

  // God file: single file with too many functions
  const fileFunctions = Object.values(lock.functions)
    .filter(fn => fn.file === node.file)
  const isGodFile = fileFunctions.length > 30

  // Utility: function called by many other modules
  const callerModules = new Set(
    inEdges
      .map(e => lock.functions[e.source]?.moduleId)
      .filter(Boolean)
  )
  const isUtility = callerModules.size > 5 && inEdges.length > 50

  // Hub: file imported by many files (barrel or core utility)
  const importers = inEdges.filter(e => e.type === 'imports').length
  const isHub = importers > 20

  return {
    isGodFile,
    isUtility,
    isHub,
    callerModuleCount: callerModules.size,
    functionCount: fileFunctions.length
  }
}

// During impact analysis, skip utility propagation to avoid noise
function shouldPropagateImpact(
  nodeId: string,
  flags: Map<string, NodeFlags>
): boolean {
  const nodeFlags = flags.get(nodeId)
  if (!nodeFlags) return true

  // Don't propagate through utilities — they affect everything and that's noise
  if (nodeFlags.isUtility) {
    logger.debug('Stopping impact propagation at utility node', { nodeId })
    return false
  }

  return true
}
```

---

# SECTION 16 — GENERATED FILE DETECTION

```typescript
const GENERATION_MARKERS = [
  '// This file was auto-generated',
  '// Code generated by',
  '// @generated',
  '// DO NOT EDIT',
  '// AUTO-GENERATED FILE',
  '/* eslint-disable */',  // Usually present in generated files
  '// Generated by',
  '* This file is auto-generated',
  'THIS FILE IS AUTOGENERATED',
]

const GENERATED_PATH_PATTERNS = [
  '**/*.generated.ts',
  '**/*.generated.tsx',
  '**/generated/**',
  '**/__generated__/**',
  '**/prisma/client/**',
  '**/.next/**',
  '**/dist/**',
  '**/build/**',
]

function isGeneratedFile(filePath: string): boolean {
  // Fast path: check path patterns first (no disk read)
  for (const pattern of GENERATED_PATH_PATTERNS) {
    if (minimatch(filePath, pattern)) return true
  }

  // Slow path: check file content (only if path didn't match)
  try {
    const fd = fs.openSync(filePath, 'r')
    const buffer = Buffer.alloc(512)  // Read only first 512 bytes
    fs.readSync(fd, buffer, 0, 512, 0)
    fs.closeSync(fd)

    const header = buffer.toString('utf-8')
    return GENERATION_MARKERS.some(marker =>
      header.includes(marker)
    )
  } catch {
    return false
  }
}
```

---

# SECTION 17 — COMPLETE PERFORMANCE OPTIMIZATION CHECKLIST

Before shipping any version, verify each of these:

**Parallelism:**
```typescript
// DO:
const parsedFiles = await Promise.all(
  chunks(filePaths, 20).map(chunk =>
    Promise.all(chunk.map(f => parseFile(f)))
  )
)

// DO NOT:
for (const file of filePaths) {
  parsedFiles.push(await parseFile(file))  // Sequential = 10x slower
}
```

**Hash-first in watcher:**
```typescript
// DO: Hash before any other work
const newHash = await hashFile(event.path)
const storedHash = hashStore.get(event.path)
if (newHash === storedHash) return  // Skip everything

// DO NOT: Parse first, then hash
const parsed = await parseFile(event.path)  // Wasted 150ms if hash unchanged
```

**Fragment lazy loading:**
```typescript
// DO: Load only needed fragment
const fragment = await loadFragment(lock, moduleId)

// DO NOT: Load full lock into memory
const fullLock = await loadEntireLock()  // Could be 50MB
```

**LRU cache for fragments:**
```typescript
import { LRUCache } from 'lru-cache'

const fragmentCache = new LRUCache<string, LockFragment>({
  max: 20,                    // Max 20 fragments in memory
  maxSize: 50 * 1024 * 1024, // Max 50MB total
  sizeCalculation: (fragment) => JSON.stringify(fragment).length,
  ttl: 5 * 60 * 1000         // Expire after 5 minutes
})
```

**BFS with depth limit:**
```typescript
function bfsWithDepthLimit(
  startNodes: string[],
  graph: DependencyGraph,
  maxDepth: number = 10
): Set<string> {

  const visited = new Set<string>()
  const queue: { id: string; depth: number }[] = startNodes.map(id => ({ id, depth: 0 }))

  while (queue.length > 0) {
    const { id, depth } = queue.shift()!
    if (visited.has(id)) continue
    if (depth > maxDepth) continue  // Stop at depth limit

    visited.add(id)

    const inEdges = graph.inEdges.get(id) || []
    for (const edge of inEdges) {
      if (!visited.has(edge.source)) {
        queue.push({ id: edge.source, depth: depth + 1 })
      }
    }
  }

  return visited
}
```

---

*Technical Implementation Reference v1.0 | Mikk | March 2026*
