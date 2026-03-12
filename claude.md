# mikk — Architecture Overview

## Modules
- **Utils & Storage** (`packages-core`): 212 functions — Infer the project language from the file extensions present; ─── Heuristic purpose inference ─────────────────────────...; Infer a short purpose string from function metadata when ...
- **Search (Registry)** (`apps-registry`): 1 functions — primarily placeholder operations across 1 files
- **Search (Web)** (`apps-web`): 1 functions — @getmikkweb — Web Dashboard & Contract Generator
- **Providers (Ai Context)** (`packages-ai-context`): 44 functions — Rough token estimation: ~4 chars per token; Rough token estimator: 1 token ≈ 4 chars for codeidentifiers; Graph traversal helpers
- **Search (Diagram Generator)** (`packages-diagram-generator`): 33 functions — 9 files, 0 functions
- **Search (Mcp Server)** (`packages-mcp-server`): 13 functions — Register all MCP resources — structured data an AI assist...; Create a Mikk MCP server instance with all tools and reso...; Start the MCP server with stdio transport
- **Search (Intent Engine)** (`packages-intent-engine`): 35 functions — ─── Helpers ─────────────────────────────────────────────...
- **Providers (Vscode Extension)** (`packages-vscode-extension`): 4 functions — VS Code Extension entry point for Mikk
- **Storage** (`packages-watcher`): 24 functions — 5 files, 0 functions
- **CLI** (`packages-cli`): 27 functions — Parse a numeric CLI option with validation; ── Helpers ──────────────────────────────────────────────...; Build DependencyGraph from lock — same logic as mcp-serve...

## Stats
- 87 files, 394 functions, 10 modules
- Language: typescript

## Tech Stack
Turborepo

## Commands
- `npm run dev` — `turbo run dev`
- `npm run build` — `turbo run build`
- `npm run test` — `turbo run test`
- `npm run lint` — `turbo run lint`

## Utils & Storage module
**Location:** packages/core/src/**
**Purpose:** Infer the project language from the file extensions present; ─── Heuristic purpose inference ─────────────────────────...; Infer a short purpose string from function metadata when ...

**Entry points:**
  - `GoExtractor.buildParsedFunction(raw) [packages/core/src/parser/go/go-extractor.ts:244]` — Build ParsedFunction from scanned raw data
  - `GoExtractor.scanFunctions() [packages/core/src/parser/go/go-extractor.ts:166]` — ── Internal scanning ───────────────────────────────────────────────────
  - `JavaScriptExtractor.extractCommonJsExports() [packages/core/src/parser/javascript/js-extractor.ts:107]` — ── CommonJS: module.exports / exports.x exports ─────────────────────────
  - `JavaScriptExtractor.extractCommonJsFunctions() [packages/core/src/parser/javascript/js-extractor.ts:175]` — ── CommonJS: module.exports / exports.x function bodies ──────────────────
  - `async discoverContextFiles(projectRoot) [packages/core/src/utils/fs.ts:186]` — Discover structural schema config files that help an AI agent understand

**Key internal functions:**
  - `normalizeTypeAnnotation` (called by 4) — ─── Helpers ─────────────────────────────────────────────────────────────────
  - `inferPurpose` (called by 3) — Infer a short purpose string from function metadata when JSDoc is missing
  - `isExported` (called by 3) — ─── Utility helpers ──────────────────────────────────────────────────────────
  - `isModuleExports` (called by 3) — ─── Helpers ─────────────────────────────────────────────────────────────────
  - `hashContent` (called by 2) — Compute SHA-256 hash of a string.

## Search (Registry) module
**Location:** apps/registry/src/**
**Purpose:** primarily placeholder operations across 1 files

**Entry points:**
  - `placeholder() [apps/registry/src/index.ts:34]` — Placeholder

## Search (Web) module
**Location:** apps/web/src/**
**Purpose:** @getmikkweb — Web Dashboard & Contract Generator

**Entry points:**
  - `placeholder() [apps/web/src/index.ts:22]` — @getmikkweb — Web Dashboard & Contract Generator

## Providers (Ai Context) module
**Location:** packages/ai-context/src/**
**Purpose:** Rough token estimation: ~4 chars per token; Rough token estimator: 1 token ≈ 4 chars for codeidentifiers; Graph traversal helpers

**Entry points:**
  - `ContextBuilder.build(query) [packages/ai-context/src/context-builder.ts:221]` — Build AI context for a given query.
  - `ClaudeMdGenerator.generate() [packages/ai-context/src/claude-md-generator.ts:45]` — Generate the full claude.md content
  - `ContextBuilder.readFunctionBody(fn, projectRoot) [packages/ai-context/src/context-builder.ts:371]` — Read the actual source code of a function from disk.
  - `ContextBuilder.generatePrompt(query, modules) [packages/ai-context/src/context-builder.ts:415]` — Generate the natural-language prompt section
  - `ClaudeProvider.formatContext(context) [packages/ai-context/src/providers.ts:13]` — Format context

**Key internal functions:**
  - `readContextFile` (called by 2) — Read context file
  - `extractKeywords` (called by 2) — Extract keywords
  - `keywordScore` (called by 2) — Keyword score for a function: exact match > partial match
  - `estimateTokens` (called by 1) — Rough token estimation: ~4 chars per token
  - `estimateTokens` (called by 1) — Rough token estimator: 1 token ≈ 4 chars for codeidentifiers

## Search (Diagram Generator) module
**Location:** packages/diagram-generator/src/**, packages/diagram-generator/src/generators/**
**Purpose:** 9 files, 0 functions

**Entry points:**
  - `DiagramOrchestrator.constructor(contract, lock, projectRoot) [packages/diagram-generator/src/orchestrator.ts:17]` — Diagram orchestrator.constructor (contract, lock, projectRoot)
  - `async DiagramOrchestrator.generateAll() [packages/diagram-generator/src/orchestrator.ts:24]` — Generate all diagrams
  - `async DiagramOrchestrator.generateImpact(changedIds, impactedIds) [packages/diagram-generator/src/orchestrator.ts:62]` — Generate impact diagram for specific changes
  - `async DiagramOrchestrator.writeDiagram(relativePath, content) [packages/diagram-generator/src/orchestrator.ts:71]` — Write diagram
  - `CapsuleDiagramGenerator.constructor(contract, lock) [packages/diagram-generator/src/generators/capsule-diagram.ts:9]` — Capsule diagram generator.constructor (contract, lock)

## Search (Mcp Server) module
**Location:** packages/mcp-server/src/**
**Purpose:** Register all MCP resources — structured data an AI assist...; Create a Mikk MCP server instance with all tools and reso...; Start the MCP server with stdio transport

**Entry points:**
  - `registerTools(server, projectRoot) [packages/mcp-server/src/tools.ts:63]` — Register all MCP tools — actions an AI assistant can invoke.
  - `registerResources(server, projectRoot) [packages/mcp-server/src/resources.ts:8]` — Register all MCP resources — structured data an AI assistant can read.
  - `createMikkMcpServer(projectRoot) [packages/mcp-server/src/server.ts:12]` — Create a Mikk MCP server instance with all tools and resources registered.
  - `async startStdioServer() [packages/mcp-server/src/stdio.ts:8]` — Start the MCP server with stdio transport.
  - `invalidateCache(projectRoot) [packages/mcp-server/src/tools.ts:32]` — Invalidate cache

**Key internal functions:**
  - `buildGraphFromLock` (called by 2) — Build a DependencyGraph from the lock file in O(n) time.
  - `safeRead` (called by 1) — Safe read
  - `getSemanticSearcher` (called by 1) — Get semantic searcher
  - `loadContractAndLock` (called by 1) — ─── Helpers ─────────────────────────────────────────────────────────────────
  - `detectCircularDeps` (called by 1) — Detect circular dependencies for a set of functions via DFS

## Search (Intent Engine) module
**Location:** packages/intent-engine/src/**
**Purpose:** ─── Helpers ─────────────────────────────────────────────...

**Entry points:**
  - `async SemanticSearcher.index(lock) [packages/intent-engine/src/semantic-searcher.ts:62]` — Build (or load from cache) embeddings for every function in the lock.
  - `async SemanticSearcher.search(query, lock, topK?) [packages/intent-engine/src/semantic-searcher.ts:120]` — Find the `topK` functions most semantically similar to `query`.
  - `ConflictDetector.constructor(contract, lock?) [packages/intent-engine/src/conflict-detector.ts:22]` — Conflict detector.constructor (contract, lock)
  - `ConflictDetector.detect(intents) [packages/intent-engine/src/conflict-detector.ts:28]` — Check all intents for conflicts
  - `ConflictDetector.classifyConstraint(text) [packages/intent-engine/src/conflict-detector.ts:111]` — ── Constraint Classification & Checking ─────────────────────

**Key internal functions:**
  - `lockFingerprint` (called by 1) — ─── Helpers ─────────────────────────────────────────────────────────────────
  - `cosineSimilarity` (called by 1) — Cosine similarity

## Providers (Vscode Extension) module
**Location:** packages/vscode-extension/src/**
**Purpose:** VS Code Extension entry point for Mikk

**Entry points:**
  - `activate(context) [packages/vscode-extension/src/extension.ts:9]` — VS Code Extension entry point for Mikk.
  - `deactivate() [packages/vscode-extension/src/extension.ts:81]` — Deactivate
  - `ModulesTreeProvider.getTreeItem(element) [packages/vscode-extension/src/extension.ts:87]` — Get tree item
  - `async ModulesTreeProvider.getChildren() [packages/vscode-extension/src/extension.ts:91]` — Get children

## Storage module
**Location:** packages/watcher/src/**
**Purpose:** 5 files, 0 functions

**Entry points:**
  - `WatcherDaemon.constructor(config) [packages/watcher/src/daemon.ts:42]` — Watcher daemon.constructor (config)
  - `async WatcherDaemon.start() [packages/watcher/src/daemon.ts:46]` — Start
  - `async WatcherDaemon.stop() [packages/watcher/src/daemon.ts:89]` — Stop
  - `WatcherDaemon.on(handler) [packages/watcher/src/daemon.ts:96]` — On
  - `WatcherDaemon.enqueueChange(event) [packages/watcher/src/daemon.ts:102]` — ─── Debounce & Batch Processing ──────────────────────────────

## CLI module
**Location:** packages/cli/src/**
**Purpose:** Parse a numeric CLI option with validation; ── Helpers ──────────────────────────────────────────────...; Build DependencyGraph from lock — same logic as mcp-serve...

**Entry points:**
  - `registerContextCommands(program) [packages/cli/src/commands/context.ts:24]` — Register context commands
  - `registerCiCommand(program) [packages/cli/src/commands/ci.ts:14]` — mikk ci — CI pipeline integration command.
  - `registerDeadCodeCommand(program) [packages/cli/src/commands/dead-code.ts:9]` — Register dead code command
  - `registerMcpCommand(program) [packages/cli/src/commands/mcp.ts:12]` — Register the `mikk mcp` command — starts the MCP server.
  - `registerStatsCommand(program) [packages/cli/src/commands/stats.ts:14]` — mikk stats — codebase health dashboard.

**Key internal functions:**
  - `buildMcpEntry` (called by 3) — Build mcp entry
  - `parseJsonSafe` (called by 3) — Parse json safe
  - `buildGraphFromLock` (called by 1) — Build graph from lock (same logic as MCP server)
  - `parseIntOption` (called by 1) — Parse a numeric CLI option with validation
  - `loadContractAndLock` (called by 1) — ── Helpers ──────────────────────────────────────────────────────────────────

## Data Models & Schemas

These files define the project's data structures, schemas, and configuration.
They are auto-discovered and included verbatim from the source.

### `packages/ai-context/src/types.ts` (types)

```typescript
import type { MikkContract, MikkLock, MikkLockFunction } from '@getmikk/core'

/** The structured context object passed to AI models */
export interface AIContext {
    project: {
        name: string
        language: string
        description: string
        moduleCount: number
        functionCount: number
    }
    modules: ContextModule[]
    constraints: string[]
    decisions: { title: string; reason: string }[]
    /** Discovered schema/config/model files included verbatim */
    contextFiles?: { path: string; content: string; type: string }[]
    /** Detected HTTP route registrations */
    routes?: { method: string; path: string; handler: string; middlewares: string[]; file: string; line: number }[]
    prompt: string
    /** Diagnostic info — helpful for debugging context quality */
    meta: {
        seedCount: number
        totalFunctionsConsidered: number
        selectedFunctions: number
        estimatedTokens: number
        keywords: string[]
    }
}

export interface ContextModule {
    id: string
    name: string
    description: string
    intent?: string
    functions: ContextFunction[]
    files: string[]
}

export interface ContextFunction {
    name: string
    file: string
    startLine: number
    endLine: number
    calls: string[]
    calledBy: string[]
    params?: { name: string; type: string; optional?: boolean }[]
    returnType?: string
    isAsync?: boolean
    isExported?: boolean
    purpose?: string
    errorHandling?: string[]
    edgeCases?: string[]
    /** The actual source code body (only included for top-scored functions) */
    body?: string
}

/** Query options for context generation */
export interface ContextQuery {
    /** The user's task description — the primary relevance signal */
    task: string
    /** Specific files to anchor the graph traversal from */
    focusFiles?: string[]
    /** Specific modules to include */
    focusModules?: string[]
    /** Max functions to include in output (hard cap) */
    maxFunctions?: number
    /** Max BFS hops from seed nodes (default 4) */
    maxHops?: number
    /** Approximate token budget for function listings (default 6000) */
    tokenBudget?: number
    /** Include call graph arrows (default true) */
    includeCallGraph?: boolean
    /** Include function bodies for top-scored functions (default true) */
    includeBodies?: boolean
    /** Absolute filesystem path to the project root (needed for body reading) */
    projectRoot?: string
}

/** Context provider interface for different AI platforms */
export interface ContextProvider {
    name: string
    formatContext(context: AIContext): string
    maxTokens: number
}
```

### `packages/intent-engine/src/types.ts` (types)

```typescript
import { z } from 'zod'

/** A single candidate intent parsed from user prompt */
export const IntentSchema = z.object({
    action: z.enum(['create', 'modify', 'delete', 'refactor', 'move']),
    target: z.object({
        type: z.enum(['function', 'file', 'module', 'class']),
        name: z.string(),
        moduleId: z.string().optional(),
        filePath: z.string().optional(),
    }),
    reason: z.string(),
    confidence: z.number().min(0).max(1),
})

export type Intent = z.infer<typeof IntentSchema>

/** Result of conflict detection */
export interface ConflictResult {
    hasConflicts: boolean
    conflicts: Conflict[]
}

export interface Conflict {
    type: 'constraint-violation' | 'ownership-conflict' | 'boundary-crossing' | 'missing-dependency' | 'low-confidence'
    severity: 'error' | 'warning'
    message: string
    relatedIntent: Intent
    suggestedFix?: string
}

/** A suggestion for how to implement an intent */
export interface Suggestion {
    intent: Intent
    affectedFiles: string[]
    newFiles: string[]
    estimatedImpact: number
    implementation: string
}

/** Configuration for the AI provider */
export interface AIProviderConfig {
    provider: 'anthropic' | 'openai' | 'local'
    apiKey?: string
    model?: string
}

/** Preflight result — the final output of the intent pipeline */
export interface PreflightResult {
    intents: Intent[]
    conflicts: ConflictResult
    suggestions: Suggestion[]
    approved: boolean
}
```

### `packages/watcher/src/types.ts` (types)

```typescript
/** File change event emitted when a source file is added, changed, or deleted */
export interface FileChangeEvent {
    type: 'added' | 'changed' | 'deleted'
    path: string
    oldHash: string | null
    newHash: string | null
    timestamp: number
    affectedModuleIds: string[]
}

/** Configuration for the watcher */
export interface WatcherConfig {
    projectRoot: string
    include: string[]    // ["src/**/*.ts"]
    exclude: string[]    // ["node_modules", ".mikk", "dist"]
    debounceMs: number   // 100
}

/** Typed watcher events */
export type WatcherEvent =
    | { type: 'file:changed'; data: FileChangeEvent }
    | { type: 'module:updated'; data: { moduleId: string; newHash: string } }
    | { type: 'graph:updated'; data: { changedNodes: string[]; impactedNodes: string[] } }
    | { type: 'sync:clean'; data: { rootHash: string } }
    | { type: 'sync:drifted'; data: { reason: string; affectedModules: string[] } }
```

### `packages/core/src/graph/types.ts` (types)

```typescript
/**
 * Graph types — nodes, edges, and the dependency graph itself.
 */

export type NodeType = 'function' | 'file' | 'module' | 'class' | 'generic'
export type EdgeType = 'calls' | 'imports' | 'exports' | 'contains'

/** A single node in the dependency graph */
export interface GraphNode {
    id: string              // "fn:src/auth/verify.ts:verifyToken"
    type: NodeType
    label: string           // "verifyToken"
    file: string            // "src/auth/verify.ts"
    moduleId?: string       // "auth" — which declared module this belongs to
    metadata: {
        startLine?: number
        endLine?: number
        isExported?: boolean
        isAsync?: boolean
        hash?: string
        purpose?: string
        params?: { name: string; type: string; optional?: boolean }[]
        returnType?: string
        edgeCasesHandled?: string[]
        errorHandling?: { line: number; type: 'try-catch' | 'throw'; detail: string }[]
        detailedLines?: { startLine: number; endLine: number; blockType: string }[]
    }
}

/** A single edge in the dependency graph */
export interface GraphEdge {
    source: string          // "fn:src/auth/verify.ts:verifyToken"
    target: string          // "fn:src/utils/jwt.ts:jwtDecode"
    type: EdgeType
    weight?: number         // How often this call happens (for coupling metrics)
    confidence?: number     // 0.0–1.0: 1.0 = direct AST call, 0.8 = via interface, 0.5 = fuzzy/inferred
}

/** The full dependency graph */
export interface DependencyGraph {
    nodes: Map<string, GraphNode>
    edges: GraphEdge[]
    outEdges: Map<string, GraphEdge[]>   // node → [edges going out]
    inEdges: Map<string, GraphEdge[]>    // node → [edges coming in]
}

/** Risk level for an impacted node */
export type RiskLevel = 'critical' | 'high' | 'medium' | 'low'

/** A single node in the classified impact result */
export interface ClassifiedImpact {
    nodeId: string
    label: string
    file: string
    moduleId?: string
    risk: RiskLevel
    depth: number           // hops from change
}

/** Result of impact analysis */
export interface ImpactResult {
    changed: string[]        // The directly changed nodes
    impacted: string[]       // Everything that depends on changed nodes
    depth: number            // How many hops from change to furthest impact
    confidence: 'high' | 'medium' | 'low'
    /** Risk-classified breakdown of impacted nodes */
    classified: {
        critical: ClassifiedImpact[]
        high: ClassifiedImpact[]
        medium: ClassifiedImpact[]
        low: ClassifiedImpact[]
    }
}

/** A cluster of files that naturally belong together */
export interface ModuleCluster {
    id: string
    files: string[]
    confidence: number      // 0.0 to 1.0
    suggestedName: string   // inferred from folder names
    functions: string[]     // function IDs in this cluster
}
```

### `packages/core/src/parser/types.ts` (types)

```typescript
/**
 * Parser types — data shapes that flow through the entire Mikk system.
 * Parser produces them, graph consumes them, contract stores them.
 */

/** A single parameter in a function signature */
export interface ParsedParam {
    name: string
    type: string
    optional: boolean
    defaultValue?: string
}

export interface ParsedFunction {
    id: string              // "fn:auth/verify.ts:verifyToken"
    name: string            // "verifyToken"
    file: string            // "src/auth/verify.ts"
    startLine: number       // 14
    endLine: number         // 28
    params: ParsedParam[]   // [{name: "token", type: "string"}]
    returnType: string      // "boolean"
    isExported: boolean     // true
    isAsync: boolean        // false
    isGenerator?: boolean   // true for function* / async function*
    typeParameters?: string[] // ["T", "U"] for generic functions
    calls: string[]         // ["jwtDecode", "findUser"]
    hash: string            // SHA-256 of the function body
    purpose: string         // Extracted from JSDoc or comments
    edgeCasesHandled: string[] // Found conditions like 'if (!x) return'
    errorHandling: { line: number, type: 'try-catch' | 'throw', detail: string }[]
    detailedLines: { startLine: number, endLine: number, blockType: string }[]
}

/** A single import statement */
export interface ParsedImport {
    source: string          // "../../utils/jwt"
    resolvedPath: string    // "src/utils/jwt.ts" (absolute within project)
    names: string[]         // ["jwtDecode", "jwtSign"]
    isDefault: boolean      // false
    isDynamic: boolean      // false
}

/** A single exported symbol */
export interface ParsedExport {
    name: string            // "verifyToken"
    type: 'function' | 'class' | 'const' | 'type' | 'default' | 'interface'
    file: string
}

/** A parsed class */
export interface ParsedClass {
    id: string
    name: string
    file: string
    startLine: number
    endLine: number
    methods: ParsedFunction[]
    isExported: boolean
    decorators?: string[]   // ["Injectable", "Controller"]
    typeParameters?: string[] // ["T"] for generic classes
    purpose?: string
    edgeCasesHandled?: string[]
    errorHandling?: { line: number, type: 'try-catch' | 'throw', detail: string }[]
}

/** A detected HTTP route registration (Express/Koa/Hono style) */
export interface ParsedRoute {
    method: string            // "GET", "POST", "PUT", "DELETE", "USE", etc.
    path: string              // "/upload", "/:shortId", "/api"
    handler: string           // "createZap" or "anonymous"
    middlewares: string[]     // ["uploadLimiter", "upload.single"]
    file: string              // "src/Routes/zap.routes.ts"
    line: number              // 15
}

/** A generic declaration like interface, type, or constant with metadata */
export interface ParsedGeneric {
    id: string
    name: string
    type: string // "interface" | "type" | "const"
    file: string
    startLine: number
    endLine: number
    isExported: boolean
    typeParameters?: string[] // ["T", "K"] for generic interfaces/types
    purpose?: string
}

/** Everything extracted from a single file */
export interface ParsedFile {
    path: string            // "src/auth/verify.ts"
    language: 'typescript' | 'javascript' | 'python' | 'go'
    functions: ParsedFunction[]
    classes: ParsedClass[]
    generics: ParsedGeneric[]
    imports: ParsedImport[]
    exports: ParsedExport[]
    routes: ParsedRoute[]    // Detected HTTP route registrations
    hash: string            // SHA-256 of the entire file content
    parsedAt: number        // Date.now()
}
```


