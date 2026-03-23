<repository_context>
  <name>mikk</name>
  <stats>
    <files>172</files>
    <functions>706</functions>
    <modules>11</modules>
    <language>typescript</language>
  </stats>
</repository_context>

<modules>
<tech_stack>
  <technology>Tailwind CSS</technology>
  <technology>Vercel Analytics</technology>
  <technology>Turborepo</technology>
</tech_stack>
<commands>
  <command>
    <run>npm run dev</run>
    <executes>turbo run dev</executes>
  </command>
  <command>
    <run>npm run build</run>
    <executes>turbo run build</executes>
  </command>
  <command>
    <run>npm run test</run>
    <executes>turbo run test</executes>
  </command>
  <command>
    <run>npm run lint</run>
    <executes>turbo run lint</executes>
  </command>
</commands>
  <module id="apps-web-components">
    <name>Components & Navigation</name>
    <location>apps/web/**</location>
    <purpose>Middleware; Root layout; Robots</purpose>
    <entry_points>
      <function signature="async POST(req) [apps/web/app/api/feedback/route.ts:133]" purpose="--- Main handler -----------------------------------------------------------" />
      <function signature="ContributionGraphCalendar({ title = &quot;Contribution Graph&quot;, hideMonthLabels = false, className, children, ...props }) [apps/web/components/kibo-ui/contribution-graph/index.tsx:369]" purpose="Contribution graph calendar ({ title = &quot;Contribution Graph&quot;, hideMonthLabels = false, className, children, ...props })" />
      <function signature="sitemap() [apps/web/app/sitemap.ts:45]" purpose="Sitemap" />
      <function signature="CopyButton({ value, getValue, event, className, variant, size, label, children, ...props }) [apps/web/components/copy-button.tsx:33]" purpose="Copy button" />
      <function signature="Header() [apps/web/components/header.tsx:44]" purpose="Header" />
    </entry_points>
    <key_internal_functions>
      <function name="useFormField" callers="4" purpose="Hook for form field" />
      <function name="useContributionGraph" callers="4" purpose="Hook for contribution graph" />
      <function name="useActiveAnchors" callers="2" purpose="Use active anchors" />
      <function name="mdxFileToRoute" callers="1" purpose="Mdx file to route" />
      <function name="collectDocsRoutes" callers="1" purpose="Collect docs routes" />
    </key_internal_functions>
  </module>
  <module id="packages-core">
    <name>Utils & Search</name>
    <location>packages/core/src/**</location>
    <purpose>Infer the project language from the file extensions present; Heuristic purpose inference; Infer a short purpose string from function metadata when ...</purpose>
    <entry_points>
      <function signature="async TreeSitterParser.parse(filePath, content) [packages/core/src/parser/tree-sitter/parser.ts:157]" purpose="Parse" />
      <function signature="GoExtractor.buildParsedFunction(raw) [packages/core/src/parser/go/go-extractor.ts:244]" purpose="Build ParsedFunction from scanned raw data" />
      <function signature="GoExtractor.scanFunctions() [packages/core/src/parser/go/go-extractor.ts:166]" purpose="--- Internal scanning ---------------------------------------------------" />
      <function signature="JavaScriptExtractor.extractCommonJsExports() [packages/core/src/parser/javascript/js-extractor.ts:123]" purpose="--- CommonJS: module.exports / exports.x exports -------------------------" />
      <function signature="JavaScriptExtractor.extractCommonJsFunctions() [packages/core/src/parser/javascript/js-extractor.ts:191]" purpose="--- CommonJS: module.exports / exports.x function bodies -----------------" />
    </entry_points>
    <key_internal_functions>
      <function name="fileExists" callers="4" purpose="Check if a file exists." />
      <function name="normalizeTypeAnnotation" callers="4" purpose="Derive a human-readable purpose sentence from a camelCasePascalCase identifier." />
      <function name="inferPurpose" callers="3" purpose="Infer a short purpose string from function metadata when JSDoc is missing" />
      <function name="isExported" callers="3" purpose="--- Utility helpers ----------------------------------------------------------" />
      <function name="isModuleExports" callers="3" purpose="--- Helpers -----------------------------------------------------------------" />
    </key_internal_functions>
  </module>
  <module id="benchmarks">
    <name>Benchmarks</name>
    <location>benchmarks/**</location>
    <purpose>1 files, 0 functions</purpose>
    <entry_points>
      <function signature="AsciinemaBenchmark.constructor() [benchmarks/asciinema-benchmark.ts:78]" purpose="Asciinema benchmark.constructor" />
      <function signature="async AsciinemaBenchmark.recordScenario(scenario, mode) [benchmarks/asciinema-benchmark.ts:85]" purpose="Record scenario" />
      <function signature="AsciinemaBenchmark.generateScript(scenario, mode) [benchmarks/asciinema-benchmark.ts:138]" purpose="Generate script" />
      <function signature="AsciinemaBenchmark.analyzeRecording(castFile) [benchmarks/asciinema-benchmark.ts:160]" purpose="Analyze recording" />
      <function signature="async AsciinemaBenchmark.runAll() [benchmarks/asciinema-benchmark.ts:197]" purpose="Run all" />
    </entry_points>
  </module>
  <module id="apps-registry">
    <name>Search (Registry)</name>
    <location>apps/registry/src/**</location>
    <purpose>Placeholder</purpose>
    <entry_points>
      <function signature="placeholder() [apps/registry/src/index.ts:34]" purpose="Placeholder" />
    </entry_points>
  </module>
  <module id="packages-ai-context">
    <name>Providers (Ai Context)</name>
    <location>packages/ai-context/src/**</location>
    <purpose>Rough token estimation: ~4 chars per token; Read context file; Rough token estimator: 1 token ≈ 4 chars for codeidentifiers</purpose>
    <entry_points>
      <function signature="ContextBuilder.build(query) [packages/ai-context/src/context-builder.ts:221]" purpose="Build AI context for a given query." />
      <function signature="ClaudeMdGenerator.generate() [packages/ai-context/src/claude-md-generator.ts:45]" purpose="Generate the full claude.md content" />
      <function signature="ContextBuilder.readFunctionBody(fn, projectRoot) [packages/ai-context/src/context-builder.ts:371]" purpose="Read the actual source code of a function from disk." />
      <function signature="ContextBuilder.generatePrompt(query, modules) [packages/ai-context/src/context-builder.ts:415]" purpose="Generate the natural-language prompt section" />
      <function signature="ClaudeProvider.formatContext(context) [packages/ai-context/src/providers.ts:13]" purpose="Format context" />
    </entry_points>
    <key_internal_functions>
      <function name="readContextFile" callers="2" purpose="Read context file" />
      <function name="extractKeywords" callers="2" purpose="Extract keywords" />
      <function name="keywordScore" callers="2" purpose="Keyword score for a function: exact match > partial match" />
      <function name="estimateTokens" callers="1" purpose="Rough token estimation: ~4 chars per token" />
      <function name="estimateTokens" callers="1" purpose="Rough token estimator: 1 token ≈ 4 chars for codeidentifiers" />
    </key_internal_functions>
  </module>
  <module id="packages-intent-engine">
    <name>Search (Intent Engine)</name>
    <location>packages/intent-engine/src/**</location>
    <purpose>--- Helpers ---------------------------------------------...; Cosine similarity</purpose>
    <entry_points>
      <function signature="async SemanticSearcher.index(lock) [packages/intent-engine/src/semantic-searcher.ts:62]" purpose="Build (or load from cache) embeddings for every function in the lock." />
      <function signature="async SemanticSearcher.search(query, lock, topK?) [packages/intent-engine/src/semantic-searcher.ts:120]" purpose="Find the `topK` functions most semantically similar to `query`." />
      <function signature="ConflictDetector.constructor(contract, lock?) [packages/intent-engine/src/conflict-detector.ts:22]" purpose="Conflict detector.constructor (contract, lock)" />
      <function signature="ConflictDetector.detect(intents) [packages/intent-engine/src/conflict-detector.ts:28]" purpose="Check all intents for conflicts" />
      <function signature="ConflictDetector.classifyConstraint(text) [packages/intent-engine/src/conflict-detector.ts:111]" purpose="--- Constraint Classification & Checking ---------------------" />
    </entry_points>
    <key_internal_functions>
      <function name="lockFingerprint" callers="1" purpose="--- Helpers -----------------------------------------------------------------" />
      <function name="cosineSimilarity" callers="1" purpose="Cosine similarity" />
    </key_internal_functions>
  </module>
  <module id="packages-vscode-extension">
    <name>Providers (Vscode Extension)</name>
    <location>packages/vscode-extension/src/**</location>
    <purpose>─── Extension Entry ─────────────────────────────────────...; Deactivate; ─── Helpers ─────────────────────────────────────────────...</purpose>
    <entry_points>
      <function signature="activate(context) [packages/vscode-extension/src/extension.ts:58]" purpose="─── Extension Entry ──────────────────────────────────────────────────────────" />
      <function signature="deactivate() [packages/vscode-extension/src/extension.ts:191]" purpose="Deactivate" />
      <function signature="MikkDataProvider.constructor(projectRoot) [packages/vscode-extension/src/extension.ts:238]" purpose="Mikk data provider.constructor (projectRoot)" />
      <function signature="MikkDataProvider.reload() [packages/vscode-extension/src/extension.ts:242]" purpose="Reload" />
      <function signature="MikkDataProvider.getContract() [packages/vscode-extension/src/extension.ts:247]" purpose="Get contract" />
    </entry_points>
    <key_internal_functions>
      <function name="runInTerminal" callers="1" purpose="─── Helpers ──────────────────────────────────────────────────────────────────" />
      <function name="updateStatusBar" callers="1" purpose="Update status bar" />
    </key_internal_functions>
  </module>
  <module id="packages-mcp-server">
    <name>Storage & Search</name>
    <location>packages/mcp-server/src/**, packages/mcp-server/bin/**</location>
    <purpose>Register all MCP resources — structured data an AI assist...; Safe read; Create a Mikk MCP server instance with all tools and reso...</purpose>
    <entry_points>
      <function signature="registerTools(server, projectRoot) [packages/mcp-server/src/tools.ts:78]" purpose="Register all MCP tools — actions an AI assistant can invoke." />
      <function signature="registerResources(server, projectRoot) [packages/mcp-server/src/resources.ts:8]" purpose="Register all MCP resources — structured data an AI assistant can read." />
      <function signature="createMikkMcpServer(projectRoot) [packages/mcp-server/src/server.ts:12]" purpose="Create a Mikk MCP server instance with all tools and resources registered." />
      <function signature="async startStdioServer() [packages/mcp-server/src/stdio.ts:8]" purpose="Start the MCP server with stdio transport." />
      <function signature="invalidateCache(projectRoot) [packages/mcp-server/src/tools.ts:34]" purpose="Invalidate cache" />
    </entry_points>
    <key_internal_functions>
      <function name="_tally" callers="2" purpose="Tally" />
      <function name="_fileTok" callers="2" purpose="File tok" />
      <function name="buildGraphFromLock" callers="2" purpose="Build a DependencyGraph from the lock file in O(n) time." />
      <function name="safeRead" callers="1" purpose="Safe read" />
      <function name="_tok" callers="1" purpose="Tok" />
    </key_internal_functions>
  </module>
  <module id="packages-watcher">
    <name>Storage</name>
    <location>packages/watcher/src/**</location>
    <purpose>5 files, 0 functions</purpose>
    <entry_points>
      <function signature="WatcherDaemon.constructor(config) [packages/watcher/src/daemon.ts:42]" purpose="Watcher daemon.constructor (config)" />
      <function signature="async WatcherDaemon.start() [packages/watcher/src/daemon.ts:46]" purpose="Start" />
      <function signature="async WatcherDaemon.stop() [packages/watcher/src/daemon.ts:99]" purpose="Stop" />
      <function signature="WatcherDaemon.on(handler) [packages/watcher/src/daemon.ts:106]" purpose="On" />
      <function signature="WatcherDaemon.enqueueChange(event) [packages/watcher/src/daemon.ts:112]" purpose="─── Debounce & Batch Processing ──────────────────────────────" />
    </entry_points>
  </module>
  <module id="packages-cli">
    <name>CLI (Cli)</name>
    <location>packages/cli/src/**, packages/cli/bin/**</location>
    <purpose>Banner; ─── Strip ANSI for length measurement ───────────────────...; Pad</purpose>
    <entry_points>
      <function signature="panel(title, rows, width?) [packages/cli/src/ui.ts:73]" purpose="Panel" />
      <function signature="registerContextCommands(program) [packages/cli/src/commands/context.ts:24]" purpose="Register context commands" />
      <function signature="cols(left, right, totalWidth?) [packages/cli/src/ui.ts:100]" purpose="Two columns side by side." />
      <function signature="rule(width?) [packages/cli/src/ui.ts:87]" purpose="Thin separator inside a panel (use as a row)." />
      <function signature="registerCiCommand(program) [packages/cli/src/commands/ci.ts:10]" purpose="Register ci command" />
    </entry_points>
    <key_internal_functions>
      <function name="tw" callers="3" purpose="─── Terminal width (capped at 78) ───────────────────────────────────────────" />
      <function name="buildMcpEntry" callers="3" purpose="Build mcp entry" />
      <function name="parseJsonSafe" callers="3" purpose="Parse json safe" />
      <function name="visLen" callers="2" purpose="─── Strip ANSI for length measurement ───────────────────────────────────────" />
      <function name="pad" callers="2" purpose="Pad" />
    </key_internal_functions>
  </module>
  <module id="packages-diagram-generator">
    <name>CLI (Diagram Generator)</name>
    <location>packages/diagram-generator/src/**, packages/diagram-generator/src/generators/**</location>
    <purpose>10 files, 0 functions</purpose>
    <entry_points>
      <function signature="DiagramOrchestrator.constructor(contract, lock, projectRoot) [packages/diagram-generator/src/orchestrator.ts:18]" purpose="Diagram orchestrator.constructor (contract, lock, projectRoot)" />
      <function signature="async DiagramOrchestrator.generateAll() [packages/diagram-generator/src/orchestrator.ts:25]" purpose="Generate all diagrams" />
      <function signature="async DiagramOrchestrator.generateImpact(changedIds, impactedIds) [packages/diagram-generator/src/orchestrator.ts:63]" purpose="Generate impact diagram for specific changes" />
      <function signature="async DiagramOrchestrator.writeDiagram(relativePath, content) [packages/diagram-generator/src/orchestrator.ts:72]" purpose="Write diagram" />
      <function signature="CapsuleDiagramGenerator.constructor(contract, lock) [packages/diagram-generator/src/generators/capsule-diagram.ts:9]" purpose="Capsule diagram generator.constructor (contract, lock)" />
    </entry_points>
  </module>
</modules>

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
    moduleId?: string
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
    moduleId?: string
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
    language: 'python' | 'go' | 'typescript' | 'javascript' | 'java' | 'c' | 'cpp' | 'csharp' | 'rust' | 'php' | 'ruby' | 'unknown'
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

## File Import Graph

Which files import which — useful for understanding data flow.

### Components & Navigation
- `apps/web/components/code-block-command.tsx` → `apps/web/components/copy-button.tsx`
- `apps/web/components/code-tabs.tsx` → `apps/web/components/base/ui/tabs.tsx`
- `apps/web/components/command-menu.tsx` → `apps/web/components/ui/button.tsx`, `apps/web/components/ui/kbd.tsx`, `apps/web/components/ui/separator.tsx`
- `apps/web/components/consent-manager.tsx` → `apps/web/components/consent-manager-client.tsx`
- `apps/web/components/copy-button.tsx` → `apps/web/components/ui/button.tsx`
- `apps/web/providers/providers.tsx` → `apps/web/providers/fuma-provider.tsx`
- `apps/web/components/ui/collapsible.tsx` → `apps/web/components/animated-icons/chevrons-down-up-icon.tsx`


