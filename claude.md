<repository_context>
  <name>mikk</name>
  <stats>
    <files>274</files>
    <functions>1450</functions>
    <modules>8</modules>
    <language>typescript</language>
  </stats>
  <critical_constraints>
    <constraint>module:fixtures-ts-express-api-auth cannot import module:mesh-apps-web</constraint>
  </critical_constraints>
</repository_context>

<modules>
<tech_stack>
  <technology>Vercel Analytics</technology>
  <technology>Turborepo</technology>
</tech_stack>
<commands>
  <command>
    <run>bun run dev</run>
    <executes>turbo run dev</executes>
  </command>
  <command>
    <run>bun run build</run>
    <executes>turbo run build</executes>
  </command>
  <command>
    <run>bun run test</run>
    <executes>turbo run test</executes>
  </command>
  <command>
    <run>bun run lint</run>
    <executes>turbo run lint</executes>
  </command>
</commands>
  <module id="desktop-web-mesh">
    <name>Config</name>
    <location>c:/users/ansh/desktop/web/mesh/**</location>
    <purpose>1 files, 0 functions</purpose>
    <entry_points>
      <function signature="async main() [c:/users/ansh/desktop/web/mesh/benchmarks/fixtures/test-project/evaluate-all-mcp-tools-via-config.js:216]" purpose="Main" />
      <function signature="async loadContractAndLock(projectRoot) [c:/users/ansh/desktop/web/mesh/packages/mcp-server/src/tools.ts:3008]" purpose="Load contract and lock (projectRoot)" />
      <function signature="async main() [c:/users/ansh/desktop/web/mesh/benchmarks/fixtures/test-project/evaluate-all-mcp-tools.js:106]" purpose="Main" />
      <function signature="getFunctionBody(fn, projectRoot) [c:/users/ansh/desktop/web/mesh/packages/mcp-server/src/tools.ts:58]" purpose="Get function body (fn, projectRoot)" />
      <function signature="IntentInterpreter.findMatchingFunctions(prompt) [c:/users/ansh/desktop/web/mesh/packages/intent-engine/src/interpreter.ts:145]" purpose="Intent interpreter.find matching functions (prompt)" />
    </entry_points>
    <key_internal_functions>
      <function name="get" callers="178" purpose="Get (key)" />
      <function name="set" callers="169" purpose="Set (key, value, ttlMs)" />
      <function name="SemanticSearcher.isAvailable" callers="10" purpose="Semantic searcher.is available" />
      <function name="calculateLatencyStats" callers="4" purpose="Calculate latency stats (values)" />
      <function name="startStdioServer" callers="4" purpose="Start stdio server" />
    </key_internal_functions>
    <depends_on>Storage & Authentication, CLI & Utils, Providers, Config & API, Authentication</depends_on>
  </module>
  <module id="mesh-packages-core">
    <name>Storage & Authentication</name>
    <location>c:/users/ansh/desktop/web/mesh/packages/core/src/**</location>
    <purpose>3 files, 0 functions</purpose>
    <entry_points>
      <function signature="async TypescriptExtractor.extract(filePath, content) [c:/users/ansh/desktop/web/mesh/packages/core/src/parser/oxc-parser.ts:355]" purpose="Typescript extractor.extract (filePath, content)" />
      <function signature="async TreeSitterParser.parseWithConfig(filePath, content, ext, config) [c:/users/ansh/desktop/web/mesh/packages/core/src/parser/tree-sitter/parser.ts:342]" purpose="Tree sitter parser.parse with config" />
      <function signature="LockCompiler.compileModules(contract, parsedFiles) [c:/users/ansh/desktop/web/mesh/packages/core/src/contract/lock-compiler.ts:394]" purpose="Lock compiler.compile modules (contract, parsedFiles)" />
      <function signature="ErrorHandler.wrap(fn, errorCode, context) [c:/users/ansh/desktop/web/mesh/packages/core/src/error-handler.ts:186]" purpose="Error handler.wrap (fn, errorCode, context)" />
      <function signature="async FunctionBodyExtractor.extractBody(fn, options) [c:/users/ansh/desktop/web/mesh/packages/core/src/parser/function-body-extractor.ts:28]" purpose="Function body extractor.extract body (fn, options)" />
    </entry_points>
    <key_internal_functions>
      <function name="log" callers="103" purpose="Log (level, message, data)" />
      <function name="isVendorPath" callers="7" purpose="Check if vendor path (filePath)" />
      <function name="writeFileAtomic" callers="7" purpose="Write file atomic (targetPath, content, options)" />
      <function name="LockReader.read" callers="6" purpose="Lock reader.read (lockPath)" />
      <function name="hashFile" callers="6" purpose="Hash file (filePath)" />
    </key_internal_functions>
    <depends_on>Config</depends_on>
  </module>
  <module id="fixtures-ts-express-api-auth">
    <name>Authentication</name>
    <location>c:/users/ansh/desktop/web/mesh/benchmarks/fixtures/ts-express-api/src/auth/**</location>
    <purpose>4 files, 0 functions</purpose>
    <entry_points>
      <function signature="refreshToken(token) [c:/users/ansh/desktop/web/mesh/benchmarks/fixtures/ts-express-api/src/auth/jwt.ts:32]" purpose="Refresh token (token)" />
      <function signature="validatePasswordStrength(password) [c:/users/ansh/desktop/web/mesh/benchmarks/fixtures/ts-express-api/src/auth/password.ts:16]" purpose="Check password strength (password)" />
      <function signature="decodeToken(token) [c:/users/ansh/desktop/web/mesh/benchmarks/fixtures/ts-express-api/src/auth/jwt.ts:24]" purpose="Decode token (token)" />
      <function signature="hasPermission(userRole, requiredRole) [c:/users/ansh/desktop/web/mesh/benchmarks/fixtures/ts-express-api/src/auth/roles.ts:7]" purpose="Check if permission (userRole, requiredRole)" />
      <function signature="revokeSession(token) [c:/users/ansh/desktop/web/mesh/benchmarks/fixtures/ts-express-api/src/auth/session.ts:16]" purpose="Revoke session (token)" />
    </entry_points>
    <key_internal_functions>
      <function name="createSession" callers="4" purpose="Create session (userId, token)" />
      <function name="signToken" callers="2" purpose="Sign token (payload)" />
      <function name="verifyToken" callers="2" purpose="Verify token (token)" />
      <function name="comparePassword" callers="2" purpose="Compare password (plain, hash)" />
      <function name="hashPassword" callers="1" purpose="Hash password (plain)" />
    </key_internal_functions>
    <depends_on>Config</depends_on>
    <module_constraints>
      <constraint>module:fixtures-ts-express-api-auth cannot import module:mesh-apps-web</constraint>
    </module_constraints>
  </module>
  <module id="packages-vscode-extension-webview">
    <name>Dashboard</name>
    <location>c:/users/ansh/desktop/web/mesh/packages/vscode-extension/src/webview/**</location>
    <purpose>3 files, 0 functions</purpose>
    <entry_points>
      <function signature="DiagramPanel.createOrShow(diagramPath) [c:/users/ansh/desktop/web/mesh/packages/vscode-extension/src/webview/diagrampanel.ts:16]" purpose="Diagram panel.create or show (diagramPath)" />
      <function signature="DashboardPanel.constructor(panel, data) [c:/users/ansh/desktop/web/mesh/packages/vscode-extension/src/webview/dashboardpanel.ts:15]" purpose="Dashboard panel.constructor (panel, data)" />
      <function signature="DashboardPanel._notInitializedHtml() [c:/users/ansh/desktop/web/mesh/packages/vscode-extension/src/webview/dashboardpanel.ts:232]" purpose="Dashboard panel. not initialized html" />
      <function signature="DashboardPanel.dispose() [c:/users/ansh/desktop/web/mesh/packages/vscode-extension/src/webview/dashboardpanel.ts:252]" purpose="Dashboard panel.dispose" />
      <function signature="DiagramPanel.constructor(panel, diagramText) [c:/users/ansh/desktop/web/mesh/packages/vscode-extension/src/webview/diagrampanel.ts:10]" purpose="Diagram panel.constructor (panel, diagramText)" />
    </entry_points>
    <key_internal_functions>
      <function name="DashboardPanel.update" callers="3" purpose="Dashboard panel.update (data)" />
      <function name="DashboardPanel.createOrShow" callers="2" purpose="Dashboard panel.create or show (extensionUri, data)" />
      <function name="DashboardPanel._update" callers="2" purpose="Dashboard panel. update (data)" />
      <function name="DiagramPanel._update" callers="2" purpose="Diagram panel. update (diagramText)" />
      <function name="getWebviewContent" callers="1" purpose="Get webview content" />
    </key_internal_functions>
  </module>
  <module id="mesh-packages-ai-context">
    <name>Providers</name>
    <location>c:/users/ansh/desktop/web/mesh/packages/ai-context/src/**</location>
    <purpose>7 files, 0 functions</purpose>
    <entry_points>
      <function signature="ContextBuilder.build(query) [c:/users/ansh/desktop/web/mesh/packages/ai-context/src/context-builder.ts:555]" purpose="Context builder.build (query)" />
      <function signature="ContextBuilder.readFunctionBody(fn, projectRoot) [c:/users/ansh/desktop/web/mesh/packages/ai-context/src/context-builder.ts:839]" purpose="Context builder.read function body (fn, projectRoot)" />
      <function signature="ClaudeMdGenerator.generate() [c:/users/ansh/desktop/web/mesh/packages/ai-context/src/claude-md-generator.ts:42]" purpose="Claude md generator.generate" />
      <function signature="ClaudeMdGenerator.generateContextFilesSection() [c:/users/ansh/desktop/web/mesh/packages/ai-context/src/claude-md-generator.ts:317]" purpose="Claude md generator.generate context files section" />
      <function signature="ClaudeMdGenerator.generateImportGraphSection() [c:/users/ansh/desktop/web/mesh/packages/ai-context/src/claude-md-generator.ts:637]" purpose="Claude md generator.generate import graph section" />
    </entry_points>
    <key_internal_functions>
      <function name="getProvider" callers="4" purpose="Get provider (name)" />
      <function name="tokenizeFunction" callers="2" purpose="Tokenize function (fn)" />
      <function name="readContextFile" callers="2" purpose="Read context file (filePath, projectRoot)" />
      <function name="estimateTokens" callers="2" purpose="Estimate tokens (text)" />
      <function name="getModuleAndDescendants" callers="2" purpose="Get module and descendants (moduleId, modules)" />
    </key_internal_functions>
    <depends_on>Config, Storage & Authentication</depends_on>
  </module>
  <module id="mesh-apps-web">
    <name>Config & API</name>
    <location>c:/users/ansh/desktop/web/mesh/apps/web/**</location>
    <purpose>5 files, 0 functions</purpose>
    <entry_points>
      <function signature="CommandMenu({...}) [c:/users/ansh/desktop/web/mesh/apps/web/components/command-menu.tsx:156]" purpose="Command menu ({...})" />
      <function signature="FeedbackBlock() [c:/users/ansh/desktop/web/mesh/apps/web/components/feedback-block.tsx:11]" purpose="Feedback block" />
      <function signature="GraphView({...}) [c:/users/ansh/desktop/web/mesh/apps/web/components/graph-view.tsx:20]" purpose="Graph view ({...})" />
      <function signature="CopyButton({...}) [c:/users/ansh/desktop/web/mesh/apps/web/components/copy-button.tsx:34]" purpose="Copy button ({...})" />
      <function signature="ActiveIndicator({...}) [c:/users/ansh/desktop/web/mesh/apps/web/components/toc.tsx:150]" purpose="Active indicator ({...})" />
    </entry_points>
    <key_internal_functions>
      <function name="cn" callers="128" purpose="Cn (inputs)" />
      <function name="trackEvent" callers="5" purpose="Track event (properties)" />
      <function name="useFormField" callers="4" purpose="Hook for form field" />
      <function name="useContributionGraph" callers="4" purpose="Hook for contribution graph" />
      <function name="collectDocsRoutes" callers="3" purpose="Collect docs routes (dir)" />
    </key_internal_functions>
    <depends_on>Config, Storage & Authentication</depends_on>
    <module_constraints>
      <constraint>module:fixtures-ts-express-api-auth cannot import module:mesh-apps-web</constraint>
    </module_constraints>
  </module>
  <module id="mesh-packages-cli">
    <name>CLI & Utils</name>
    <location>c:/users/ansh/desktop/web/mesh/packages/cli/**, c:/users/ansh/desktop/web/mesh/packages/cli/src/**</location>
    <purpose>4 files, 0 functions</purpose>
    <entry_points>
      <function signature="panel(title, rows, width?) [c:/users/ansh/desktop/web/mesh/packages/cli/src/ui.ts:73]" purpose="Panel (title, rows, width)" />
      <function signature="registerAdrCommand(program) [c:/users/ansh/desktop/web/mesh/packages/cli/src/commands/adr.ts:6]" purpose="Register adr command (program)" />
      <function signature="buildGraphFromLock(lock) [c:/users/ansh/desktop/web/mesh/packages/cli/src/commands/dead-code.ts:92]" purpose="Build graph from lock (lock)" />
      <function signature="async getFunctionBody(fn, projectRoot, _maxLines) [c:/users/ansh/desktop/web/mesh/packages/cli/src/commands/search.ts:25]" purpose="Get function body (fn, projectRoot, _maxLines)" />
      <function signature="levenshtein(a, b) [c:/users/ansh/desktop/web/mesh/packages/cli/src/commands/search.ts:81]" purpose="Levenshtein (a, b)" />
    </entry_points>
    <key_internal_functions>
      <function name="gap" callers="11" purpose="Gap" />
      <function name="kv" callers="6" purpose="Kv (label, value, labelWidth)" />
      <function name="tw" callers="5" purpose="Tw" />
      <function name="patchFileContent" callers="4" purpose="Patch file content (filePath, newContent)" />
      <function name="resolveCoreModule" callers="4" purpose="Resolve core module (projectRoot)" />
    </key_internal_functions>
    <depends_on>Storage & Authentication, Config, Providers</depends_on>
  </module>
  <module id="mesh-packages-vscode-extension">
    <name>Providers</name>
    <location>c:/users/ansh/desktop/web/mesh/packages/vscode-extension/**, c:/users/ansh/desktop/web/mesh/packages/vscode-extension/src/**</location>
    <purpose>2 files, 0 functions</purpose>
    <entry_points>
      <function signature="activate(context) [c:/users/ansh/desktop/web/mesh/packages/vscode-extension/src/extension.ts:177]" purpose="Activate (context)" />
      <function signature="MikkCodeLensProvider.provideCodeLenses(document, _token) [c:/users/ansh/desktop/web/mesh/packages/vscode-extension/src/providers/mikkcodelensprovider.ts:14]" purpose="Mikk code lens provider.provide code lenses (document, _token)" />
      <function signature="deactivate() [c:/users/ansh/desktop/web/mesh/packages/vscode-extension/src/extension.ts:293]" purpose="Deactivate" />
      <function signature="MikkDataProvider.setRoot(root) [c:/users/ansh/desktop/web/mesh/packages/vscode-extension/src/extension.ts:39]" purpose="Mikk data provider.set root (root)" />
      <function signature="MikkDataProvider.getRoot() [c:/users/ansh/desktop/web/mesh/packages/vscode-extension/src/extension.ts:45]" purpose="Mikk data provider.get root" />
    </entry_points>
    <key_internal_functions>
      <function name="updateStatusBar" callers="4" purpose="Update status bar (bar, data)" />
      <function name="refresh" callers="3" purpose="Refresh" />
      <function name="MikkDecoratorProvider.updateDecorations" callers="3" purpose="Mikk decorator provider.update decorations (editor, dataProvider)" />
      <function name="findRoot" callers="2" purpose="Find root (startPath)" />
      <function name="updateContext" callers="2" purpose="Update context (editor)" />
    </key_internal_functions>
    <depends_on>Dashboard</depends_on>
  </module>
</modules>

## Data Models & Schemas

These files define the project's data structures, schemas, and configuration.
They are auto-discovered and included verbatim from the source.

### `benchmarks/fixtures/go-service/models/task.go` (model)

```go
﻿package models

import "time"

type TaskStatus string

const (
	TaskPending    TaskStatus = "pending"
	TaskInProgress TaskStatus = "in_progress"
	TaskDone       TaskStatus = "done"
)

type Task struct {
	ID          string     `json:"id"`
	Title       string     `json:"title"`
	Description string     `json:"description"`
	Status      TaskStatus `json:"status"`
	OwnerID     string     `json:"owner_id"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
}

type CreateTaskRequest struct {
	Title       string `json:"title"`
	Description string `json:"description"`
}
```

### `benchmarks/fixtures/go-service/models/user.go` (model)

```go
﻿package models

import "time"

type Role string

const (
	RoleAdmin Role = "admin"
	RoleUser  Role = "user"
)

type User struct {
	ID           string    `json:"id"`
	Email        string    `json:"email"`
	PasswordHash string    `json:"-"`
	Role         Role      `json:"role"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

type CreateUserRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type LoginResponse struct {
	User  UserPublic `json:"user"`
	Token string     `json:"token"`
}

type UserPublic struct {
	ID        string    `json:"id"`
	Email     string    `json:"email"`
	Role      Role      `json:"role"`
	CreatedAt time.Time `json:"created_at"`
}
```

### `benchmarks/fixtures/polyglot-services/src/models.py` (model)

```python
#!/usr/bin/env python3
"""Main entry point for the application."""


def connect_database():
    """Connect to the database."""
    pass


def is_connected():
    """Check if database is connected."""
    pass


def disconnect_database():
    """Disconnect from the database."""
    pass


def authenticate_user(email: str, password: str) -> bool:
    """Authenticate a user with email and password."""
    pass


def hash_password(password: str) -> str:
    """Hash a password."""
    pass


def verify_password(password: str, hash: str) -> bool:
    """Verify a password against a hash."""
    pass


class User:
    def __init__(self, email: str, name: str):
        self.email = email
        self.name = name

    def get_profile(self):
        """Get user profile."""
        pass


def create_invoice(amount: float) -> dict:
    """Create an invoice."""
    pass


def process_payment(invoice_id: str, amount: float) -> bool:
    """Process payment for an invoice."""
    pass


def error_handler(error: Exception):
    """Handle errors."""
    pass


if __name__ == "__main__":
    connect_database()
```

### `packages/ai-context/src/types.ts` (types)

```typescript
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
        reasons?: string[]
        suggestions?: string[]
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
    /** Relevance mode: balanced (default) or strict (high-precision filtering) */
    relevanceMode?: 'balanced' | 'strict'
    /** Additional required terms (comma-separated in CLI) that must be respected */
    requiredKeywords?: string[]
    /** In strict mode, require all extracted/required keywords to match */
    requireAllKeywords?: boolean
    /** Minimum number of matched keywords required in strict mode (default 1) */
    minKeywordMatches?: number
    /** Hard gate in strict mode: final output keeps only strict keyword matches */
    exactOnly?: boolean
    /** In strict mode, return empty context if no exact matches are found */
    failFast?: boolean
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

export type DecisionStatus = 'APPROVED' | 'WARNING' | 'BLOCKED';

export interface DecisionResult {
    status: DecisionStatus
    reasons: string[]
    riskScore: number
    impactNodes: number
}

export interface Explanation {
    summary: string
    details: string[]
    riskBreakdown: {
        symbol: string
        reason: string
        score: number
    }[]
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
    decision: DecisionResult
    explanation: Explanation
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
export type NodeType =
  | "file"
  | "class"
  | "function"
  | "variable"
  | "generic";

export type EdgeType =
  | "imports"
  | "calls"
  | "extends"
  | "implements"
  | "accesses"
  | "contains"; // Keeping for containment edges

export interface GraphNode {
  id: string;              // unique (normalized file::name)
  type: NodeType;
  name: string;
  file: string;
  moduleId?: string;       // Original cluster feature

  metadata?: {
    isExported?: boolean;
    inheritsFrom?: string[];
    implements?: string[];
    className?: string; // for methods
    startLine?: number;
    endLine?: number;
    isAsync?: boolean;
    hash?: string;
    purpose?: string;
    genericKind?: string;
    params?: { name: string; type: string; optional?: boolean }[];
    returnType?: string;
    edgeCasesHandled?: string[];
    errorHandling?: { line: number; type: 'try-catch' | 'throw'; detail: string }[];
    detailedLines?: { startLine: number; endLine: number; blockType: string }[];
  };
}

export interface GraphEdge {
  from: string;
  to: string;
  type: EdgeType;
  confidence: number; // 0–1
  weight?: number;    // Weight from EDGE_WEIGHT constants
}

export interface DependencyGraph {
  nodes: Map<string, GraphNode>;
  edges: GraphEdge[];
  outEdges: Map<string, GraphEdge[]>;   // node → [edges going out]
  inEdges: Map<string, GraphEdge[]>;    // node → [edges coming in]
}

/**
 * Canonical ID helpers.
 * Function IDs:  fn:<absolute-posix-path>:<FunctionName>
 * Class IDs:     class:<absolute-posix-path>:<ClassName>
 * Type/enum IDs: type:<absolute-posix-path>:<Name> | enum:<absolute-posix-path>:<Name>
 * File IDs:      <absolute-posix-path>  (no prefix)
 *
 * NOTE: The old normalizeId() that used `file::name` (double-colon, lowercase)
 * was removed — it did not match any current ID format and would produce IDs
 * that never matched any graph node.
 */
export function makeFnId(file: string, name: string): string {
  return `fn:${file.replace(/\\/g, '/')}:${name}`;
}

export type RiskLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface ImpactResult {
  changed: string[];
  impacted: string[];
  allImpacted: ClassifiedImpact[]; // New field for Decision Engine
  depth: number;
  entryPoints: string[];
  criticalModules: string[];
  paths: string[][];
  confidence: number;
  riskScore: number;
  classified: {
    critical: ClassifiedImpact[];
    high: ClassifiedImpact[];
    medium: ClassifiedImpact[];
    low: ClassifiedImpact[];
  };
}

export interface ClassifiedImpact {
  nodeId: string;
  label: string;
  file: string;
  risk: RiskLevel;
  riskScore: number; // numeric score for precise policy checks
  depth: number;
}

export interface ModuleCluster {
  id: string;
  files: string[];
  confidence: number;
  suggestedName: string;
  functions: string[];
}
```

### `packages/core/src/parser/types.ts` (types)

```typescript
/**
 * Parser types — data shapes that flow through the entire Mikk system.
 */

import type { ParsedFileLanguage } from '../utils/language-registry.js';

/** A single parameter in a function signature */
export interface ParsedParam {
  name: string;
  type: string;
  optional: boolean;
  defaultValue?: string;
}

/** A single call expression found in code (Mikk 2.0) */
export interface CallExpression {
  name: string;
  line: number;
  type: 'function' | 'method' | 'property';
  arguments?: string[];
}

/** A detailed function declaration */
export interface ParsedFunction {
  id: string;              // unique normalized ID (file::name)
  name: string;
  file: string;
  moduleId?: string;
  startLine: number;
  endLine: number;
  params: ParsedParam[];
  returnType: string;
  isExported: boolean;
  isAsync: boolean;
  isGenerator?: boolean;
  typeParameters?: string[];
  calls: CallExpression[]; // Behavioral tracking (Upgraded from string[])
  hash: string;
  purpose: string;
  edgeCasesHandled: string[];
  errorHandling: { line: number; type: 'try-catch' | 'throw'; detail: string }[];
  detailedLines: { startLine: number; endLine: number; blockType: string }[];
  decorators?: string[];
}

/** A single import specifier with alias support */
export interface ImportSpecifier {
  imported: string;
  local: string;
}

/** A re-export statement (export { X } from './source') */
export interface ReExport {
  name: string;
  source: string;
  sourceResolved?: string;
}

/** A single import statement */
export interface ParsedImport {
  source: string;
  resolvedPath: string;
  names: string[];
  specifiers?: ImportSpecifier[];
  isDefault: boolean;
  isDynamic: boolean;
}

/** A single exported symbol */
export interface ParsedExport {
  name: string;
  type: 'function' | 'class' | 'const' | 'type' | 'default' | 'interface' | 'variable';
  file: string;
}

/** A single variable or property */
export interface ParsedVariable {
  id: string;
  name: string;
  type: string;
  file: string;
  line: number;
  isExported: boolean;
  isStatic?: boolean;
  purpose?: string;
  decorators?: string[];
}

/** A parsed class */
export interface ParsedClass {
  id: string;
  name: string;
  file: string;
  moduleId?: string;
  startLine: number;
  endLine: number;
  methods: ParsedFunction[];
  properties: ParsedVariable[];
  extends?: string;
  implements?: string[];
  isExported: boolean;
  decorators?: string[];
  typeParameters?: string[];
  hash: string;
  purpose?: string;
  edgeCasesHandled?: string[];
  errorHandling?: { line: number; type: 'try-catch' | 'throw'; detail: string }[];
}

/** A generic declaration (interface, type aliase, etc.) */
export interface ParsedGeneric {
  id: string;
  name: string;
  type: string; // "interface" | "type"
  file: string;
  startLine: number;
  endLine: number;
  isExported: boolean;
  typeParameters?: string[];
  hash: string;
  purpose?: string;
}

/** A detected HTTP route registration */
export interface ParsedRoute {
  method: string;
  path: string;
  handler: string;
  middlewares: string[];
  file: string;
  line: number;
}

/** Everything extracted from a single file */
export interface ParsedFile {
  path: string;            // normalized absolute path
  language: ParsedFileLanguage;
  functions: ParsedFunction[];
  classes: ParsedClass[];
  variables: ParsedVariable[];
  generics: ParsedGeneric[];
  imports: ParsedImport[];
  exports: ParsedExport[];
  reexports?: ReExport[];
  routes: ParsedRoute[];
  calls: CallExpression[]; // module-level calls
  hash: string;
  parsedAt: number;
}
```

### `benchmarks/fixtures/ts-express-api/src/routes/auth.ts` (routes)

```typescript
﻿import { Router } from 'express'
import { loginUser, registerUser } from '../users/service'
import { isValidEmail } from '../utils/validate'

export const authRouter = Router()

authRouter.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body
    if (!isValidEmail(email)) {
      res.status(400).json({ error: 'Invalid email format' })
      return
    }
    const result = await loginUser(email, password)
    res.json(result)
  } catch (err: any) {
    res.status(401).json({ error: err.message })
  }
})

authRouter.post('/register', async (req, res) => {
  try {
    const { email, password } = req.body
    if (!isValidEmail(email)) {
      res.status(400).json({ error: 'Invalid email format' })
      return
    }
    const user = await registerUser(email, password)
    res.status(201).json(user)
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
})
```

### `benchmarks/fixtures/ts-express-api/src/routes/payments.ts` (routes)

```typescript
﻿import { Router } from 'express'
import { requireAuth } from '../middleware/auth'
import { createInvoice, chargeInvoice, markInvoicePaid, refundInvoice } from '../payments/billing'

export const paymentsRouter = Router()

paymentsRouter.post('/invoices', requireAuth, async (req, res) => {
  try {
    const { amount, currency } = req.body
    const userId = (req as any).user.userId
    const invoice = await createInvoice(userId, amount, currency)
    res.status(201).json(invoice)
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
})

paymentsRouter.post('/invoices/:id/charge', requireAuth, async (req, res) => {
  try {
    const clientSecret = await chargeInvoice(req.params.id)
    res.json({ clientSecret })
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
})

paymentsRouter.post('/invoices/:id/paid', requireAuth, async (req, res) => {
  try {
    const { paymentIntentId } = req.body
    await markInvoicePaid(req.params.id, paymentIntentId)
    res.json({ message: 'Invoice marked as paid' })
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
})

paymentsRouter.post('/invoices/:id/refund', requireAuth, requireAdmin, async (req, res) => {
  try {
    await refundInvoice(req.params.id)
    res.json({ message: 'Refund initiated' })
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
})
```

### `benchmarks/fixtures/ts-express-api/src/routes/users.ts` (routes)

```typescript
﻿import { Router } from 'express'
import { requireAuth, requireAdmin } from '../middleware/auth'
import { getUserProfile, removeUser, promoteToAdmin } from '../users/service'

export const usersRouter = Router()

usersRouter.get('/me', requireAuth, async (req, res) => {
  try {
    const userId = (req as any).user.userId
    const profile = await getUserProfile(userId)
    res.json(profile)
  } catch (err: any) {
    res.status(404).json({ error: err.message })
  }
})

usersRouter.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    await removeUser(req.params.id)
    res.status(204).send()
  } catch (err: any) {
    res.status(404).json({ error: err.message })
  }
})

usersRouter.post('/:id/promote', requireAuth, requireAdmin, async (req, res) => {
  try {
    await promoteToAdmin(req.params.id)
    res.json({ message: 'User promoted to admin' })
  } catch (err: any) {
    res.status(404).json({ error: err.message })
  }
})
```

## HTTP Routes

- **POST** `/login` → `async (req, res) => { try { const { email, password } = req.body if (!isValidEma...` *(C:/Users/Ansh/Desktop/web/Mesh/benchmarks/fixtures/ts-express-api/src/routes/auth.ts:7)*
- **POST** `/register` → `async (req, res) => { try { const { email, password } = req.body if (!isValidEma...` *(C:/Users/Ansh/Desktop/web/Mesh/benchmarks/fixtures/ts-express-api/src/routes/auth.ts:21)*
- **POST** `/invoices` → `async (req, res) => { try { const { amount, currency } = req.body const userId =...` → [requireAuth] *(C:/Users/Ansh/Desktop/web/Mesh/benchmarks/fixtures/ts-express-api/src/routes/payments.ts:7)*
- **POST** `/invoices/:id/charge` → `async (req, res) => { try { const clientSecret = await chargeInvoice(req.params....` → [requireAuth] *(C:/Users/Ansh/Desktop/web/Mesh/benchmarks/fixtures/ts-express-api/src/routes/payments.ts:18)*
- **POST** `/invoices/:id/paid` → `async (req, res) => { try { const { paymentIntentId } = req.body await markInvoi...` → [requireAuth] *(C:/Users/Ansh/Desktop/web/Mesh/benchmarks/fixtures/ts-express-api/src/routes/payments.ts:27)*
- **POST** `/invoices/:id/refund` → `async (req, res) => { try { await refundInvoice(req.params.id) res.json({ messag...` → [requireAuth, requireAdmin] *(C:/Users/Ansh/Desktop/web/Mesh/benchmarks/fixtures/ts-express-api/src/routes/payments.ts:37)*
- **GET** `/me` → `async (req, res) => { try { const userId = (req as any).user.userId const profil...` → [requireAuth] *(C:/Users/Ansh/Desktop/web/Mesh/benchmarks/fixtures/ts-express-api/src/routes/users.ts:7)*
- **DELETE** `/:id` → `async (req, res) => { try { await removeUser(req.params.id) res.status(204).send...` → [requireAuth, requireAdmin] *(C:/Users/Ansh/Desktop/web/Mesh/benchmarks/fixtures/ts-express-api/src/routes/users.ts:17)*
- **POST** `/:id/promote` → `async (req, res) => { try { await promoteToAdmin(req.params.id) res.json({ messa...` → [requireAuth, requireAdmin] *(C:/Users/Ansh/Desktop/web/Mesh/benchmarks/fixtures/ts-express-api/src/routes/users.ts:26)*

## Cross-Cutting Constraints
- module:fixtures-ts-express-api-auth cannot import module:mesh-apps-web

