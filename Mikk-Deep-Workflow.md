# Mikk — Deep Workflow, Problem Analysis & Edge Case Handling
> How it actually works behind the scenes. Every gap filled. Every edge case solved.

---

## What This Document Is

The spec and developer bible describe *what* to build. This document explains *why it works*, *where it breaks*, and *exactly how every edge case is handled*. Read this before building anything complex. Every section maps to a real failure mode that will happen in production.

---

# PART 1 — THE REAL PROBLEM IN DEPTH

Before the solution makes complete sense, the problem needs to be understood more precisely than "AI doesn't have context."

## What Actually Happens When AI Writes Wrong Code

Take a real scenario. A developer opens Cursor on a large Express + TypeScript API and types:

> "Add rate limiting to the user registration endpoint"

The AI produces:

```typescript
import rateLimit from 'express-rate-limit'

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 })
app.use('/api/register', limiter)
```

This is syntactically correct. It will work. But the actual project already has a centralized middleware factory in `src/middleware/factory.ts` that handles rate limiting, logging, error wrapping, and request tracing together. Every other endpoint uses `createEndpoint()` from that factory. The AI just bypassed the entire middleware architecture because it didn't know it existed.

The developer now has two problems: the code works but violates the architecture, and they either have to rewrite it or live with the inconsistency. Over time, hundreds of these small violations accumulate and the codebase becomes incoherent.

**This is not an AI intelligence problem. It's an information problem.** The AI was not told about `createEndpoint()`. It had no way to know. Mikk fixes this by making that information impossible to miss.

---

## The Three Distinct Failures Mikk Solves

### Failure 1 — Structural Blindness

The AI doesn't know the shape of the codebase. It doesn't know which modules exist, what they're responsible for, or how they relate. It sees files one at a time or in small batches. A 200-file TypeScript project has roughly 800–2000 functions. No context window holds all of that.

**Mikk's answer:** `mikk.lock.json` is a pre-computed structural index. Every function, every relationship, every module boundary — compressed into a queryable format. The AI doesn't need to read 200 files. It reads the lock file and knows everything structurally. Then it reads only the specific files it needs.

### Failure 2 — Staleness

Even when developers write good `claude.md` files, they drift within days. A refactor renames a function. A new module gets added. Nobody updates the markdown. The AI reasons over a description of a codebase that no longer exists.

**Mikk's answer:** The watcher daemon runs continuously. Every file save triggers a hash comparison in under 50ms. If the hash changed, the file gets re-parsed and the lock fragment updates within 400ms. The `claude.md` that Mikk generates is regenerated from the lock on every analysis. It is constitutionally incapable of drifting because it is derived, not authored.

### Failure 3 — Intent Ambiguity

The developer types "fix the auth bug." This could mean:
- The token verification logic in `verify.ts`
- The session refresh in `refresh.ts`
- The middleware chain in `middleware.ts`
- A database query in `user-repository.ts`
- The JWT configuration in `config/auth.ts`

Without knowing which one, the AI guesses. It often guesses wrong or addresses multiple things when the developer meant one specific thing. The resulting code touches the wrong files, introduces unnecessary changes, and sometimes breaks things that were working.

**Mikk's answer:** The intent engine reads the prompt, reads the lock file, and generates 2–3 specific interpretations tied to actual functions and modules. The developer picks one in a single click. The AI receives not just a prompt but a confirmed, specific, graph-grounded task with exact file addresses.

---

# PART 2 — THE COMPLETE WORKFLOW IN DEPTH

## Workflow A — First Time Setup (`mikk init`)

This is the most complex workflow. It has to work correctly on any TypeScript project regardless of structure.

### Step 1 — Project Discovery

```
mikk init is called
        ↓
Find project root (walk up from cwd looking for package.json)
        ↓
Read tsconfig.json to find:
  - rootDir (where source lives)
  - paths (alias mappings like @/ → src/)
  - include/exclude patterns
        ↓
Discover all source files using fast-glob
  Pattern: ["src/**/*.ts", "src/**/*.tsx"]
  Exclude: ["**/*.test.ts", "**/*.spec.ts", "**/node_modules/**",
            "**/dist/**", "**/*.d.ts", "**/*.generated.ts"]
        ↓
Result: flat list of absolute file paths
```

**Edge case — no tsconfig.json:** Fall back to scanning from cwd. Use default patterns. Warn the developer that alias resolution will be limited.

**Edge case — monorepo:** Detect if there are multiple `package.json` files. Ask: "This looks like a monorepo. Initialize Mikk at the root or for a specific package?" Run package-scoped analysis if they pick a package.

**Edge case — very large project (1000+ files):** Show a progress bar. Process files in batches of 50. Do not attempt to hold all parsed files in memory simultaneously.

**Edge case — binary files or non-TS files in src/:** Skip silently. Log at debug level. Never throw.

---

### Step 2 — Parallel Parsing

```
For each discovered file (in parallel batches of 20):
        ↓
Read file content from disk
        ↓
Compute SHA-256 hash of content → store in hash store
        ↓
Select parser based on file extension
        ↓
Run Tree-sitter parser → get raw AST
        ↓
Run TypeScriptExtractor on AST:
  - Extract all function declarations
  - Extract all arrow functions assigned to const
  - Extract all class declarations + their methods
  - Extract all import statements (with raw source paths)
  - Extract all export statements
        ↓
Run TypeScriptSemanticEnricher (if tsconfig found):
  - Resolve each import's source to absolute project path
  - Resolve each function call to its declaration file
        ↓
Return ParsedFile for each file
```

**Edge case — parse error in a file:** Catch the error, log it with file path and line number, continue with other files. Never crash the whole analysis because one file has a syntax error. Add the file to a `parseErrors` list in the lock file so the developer knows.

**Edge case — circular imports:** Circular imports are valid TypeScript. The resolver must handle them without infinite loops. Track visited files in a Set during resolution. If already visited, return the partial resolution.

**Edge case — dynamic imports:** `import('./auth')` — these are real dependencies. Extract them as `isDynamic: true` imports with confidence `medium`. They exist in the graph but with a flag indicating they may not always be loaded.

**Edge case — re-exports:** `export { verifyToken } from './verify'` — this creates a transitive dependency. File A imports from B, B re-exports from C, so A actually depends on C. The resolver must follow re-export chains.

**Edge case — barrel files (index.ts that re-exports everything):** These are extremely common. `src/auth/index.ts` that re-exports everything from `verify.ts`, `middleware.ts`, `refresh.ts`. The resolver must see through barrels — an import of `auth/` is actually an import of all three underlying files.

**Edge case — type-only imports:** `import type { UserDTO } from './types'` — these are structural dependencies but not runtime dependencies. Track them separately as `isTypeOnly: true`. They should appear in the graph but with reduced weight.

---

### Step 3 — Graph Construction

```
All ParsedFiles collected
        ↓
First pass: Add all nodes
  For each file: add FileNode
  For each function in file: add FunctionNode
  For each class in file: add ClassNode
  For each class method: add FunctionNode with classId
        ↓
Second pass: Add all edges
  For each file's imports: add ImportEdge(file → resolvedPath)
  For each function's calls: add CallEdge(fn → resolved target fn)
  For each file's functions: add ContainsEdge(file → fn)
        ↓
Third pass: Build adjacency maps
  outEdges: Map<nodeId, Edge[]> — fast lookup of what a node depends on
  inEdges:  Map<nodeId, Edge[]> — fast lookup of what depends on a node
        ↓
Fourth pass: Compute module clusters
  Run ClusterDetector on completed graph
  Score each file's coupling ratio (internal vs external edges)
  Group files into suggested modules
  Assign confidence scores to each cluster
```

**Edge case — unresolved imports (npm packages):** `import express from 'express'` resolves to `node_modules` not a project file. These are external dependencies. Add them as `ExternalNode` type with the package name. Do not try to parse node_modules. Track which external packages each module depends on — this goes in the lock file.

**Edge case — missing files:** Import resolves to a path that doesn't exist on disk. This happens with generated files, missing dependencies, or typos. Add the edge with `status: 'missing'`. Do not throw. Include in a `missingFiles` list in the lock.

**Edge case — function overloads (TypeScript):** TypeScript allows multiple function signatures. `function process(x: string): void` and `function process(x: number): void` are the same function. Deduplicate by name + file. Keep the implementation signature.

**Edge case — anonymous functions:** Arrow functions not assigned to a variable. `array.map(x => x * 2)`. These have no stable name. Skip them for call graph purposes. They are not navigable targets.

**Edge case — computed property names:** `const obj = { [dynamicKey]: function() {} }`. The method name is not statically knowable. Skip with a debug log. These are rare and not worth the complexity.

---

### Step 4 — Contract Generation

```
Cluster suggestions computed
        ↓
Check if mesh.json already exists
  YES → Load it, respect existing declared section
  NO  → Generate new mesh.json skeleton
        ↓
For new mesh.json:
  Use cluster suggestions to pre-fill modules
  Infer module names from:
    1. Directory names (src/auth/ → "auth")
    2. Most common export names in cluster
    3. Package names in imports
  Infer intent from:
    1. README.md mentions of this directory
    2. Most common JSDoc @description in files
    3. Common pattern in function names
        ↓
Run AI interviewer (if --ai flag):
  Present cluster suggestions with confidence scores
  Ask confirmation questions one at a time
  Fill in intent, constraints, decisions from answers
        ↓
Write mesh.json with overwrite mode: "never" by default
```

**Edge case — existing project with no structure:** Flat src/ with 50 files and no subdirectories. Cluster detector will use call frequency analysis alone. Results may have low confidence. Mark all clusters as `confidence < 0.5`. Tell developer these are suggestions only.

**Edge case — mesh.json exists but is outdated:** New modules detected that aren't in the declared section. Flag them in the output: "3 new module clusters detected that aren't in your mesh.json. Run `mikk contract update` to review them."

**Edge case — overwrite mode is "ask" and changes detected:** Generate a detailed diff of proposed changes. Present them one by one. Never batch-apply without individual confirmation.

---

### Step 5 — Lock File Compilation

```
ParsedFiles + DependencyGraph + MeshContract all in memory
        ↓
For each declared module in mesh.json:
  Find all files matching the module's paths patterns
  Compute Merkle hash of all file hashes in module
  Write module fragment to .mikk/fragments/{hash}.lock
        ↓
For each function in graph:
  Look up which module its file belongs to
  Record: id, name, file, startLine, endLine, hash, calls, calledBy, moduleId
        ↓
For each file:
  Record: path, hash, moduleId, lastModified
        ↓
Compute three hashes for sync triangle:
  lockHash = hash of all fragment hashes concatenated
  contractHash = hash of mesh.json content
  rootHash = Merkle root of all module hashes
        ↓
Write manifest.json (module id → fragment hash)
Write mesh.lock.json (full assembled lock)
Write sync-state.json (status: clean, all hashes, timestamp)
```

**Edge case — file belongs to multiple module path patterns:** The file `src/shared/auth-utils.ts` could match both `src/auth/**` and `src/shared/**`. Resolution order: first matching module wins. Log a warning. Suggest the developer tighten their path patterns.

**Edge case — file matches no module:** An orphan file not covered by any module pattern. Add it to an `unassigned` virtual module. Flag it in the output. Do not silently ignore it.

**Edge case — lock file too large:** On a 500k-line codebase the lock could be 10–50MB if stored monolithically. This is why fragments exist. The root `mesh.lock.json` is a manifest + summary only. Fragments are read lazily. The AI context engine never reads the full lock — only the fragments relevant to the current task.

---

## Workflow B — Continuous Sync (`mikk watch`)

This is the runtime workflow. It runs in the background while the developer codes.

### The Sync Loop

```
Developer saves a file (Ctrl+S)
        ↓ (chokidar fires in <50ms)
FileWatcher receives 'change' event for path
        ↓
Read new file content from disk
        ↓
Compute SHA-256 hash of new content
        ↓
Compare against stored hash in hash store
        ↓
IDENTICAL HASH → return immediately (save with no changes, formatter ran)
DIFFERENT HASH → continue
        ↓
Set sync-state.json: { status: "syncing", driftedFile: path }
        ↓
Re-parse changed file with Tree-sitter (~50-150ms)
        ↓
Enrich with TypeScript Compiler API (~100-200ms)
        ↓
Find all graph nodes that belong to this file
        ↓
Remove old nodes from graph
Add new nodes from re-parsed file
Re-connect edges to existing graph
        ↓
Run incremental impact analysis:
  Find all nodes whose calledBy list references changed nodes
  Recursively find their dependents too
  Max depth: 10 (prevents runaway on highly connected graphs)
        ↓
Update only affected fragments in .mikk/fragments/
        ↓
Recompute hashes for affected modules only
        ↓
Update mesh.lock.json summary section
        ↓
Set sync-state.json: { status: "clean", lastSyncAt: now }
        ↓
Total time: 200-600ms for most files
```

**Why the sync must complete before AI queries:** If the AI reads the lock while it says `status: "syncing"`, it will get partially stale data. The AI context engine checks `sync-state.json` first. If status is `syncing`, it waits up to 2 seconds then proceeds with a `🟡 syncing` confidence indicator. If status is `drifted`, it shows a warning and suggests running `mikk analyze`.

**Edge case — multiple files saved simultaneously (git checkout, npm install, prettier --write):** Chokidar will fire multiple events in rapid succession. The daemon debounces: wait 100ms after the last event before processing. If 50 files changed (git checkout), run full analysis not incremental — it's faster than 50 sequential incremental runs.

**Threshold for full vs incremental:** If more than 15 files changed in a single debounce window, run full analysis. Otherwise run incremental per file.

**Edge case — file deleted:** Remove all nodes for that file from the graph. Run impact analysis on what depended on those nodes. Update affected modules. If a deleted file was listed in `declared.modules.paths` in mesh.json, flag a `contract:stale` event.

**Edge case — new file added:** Parse it, add its nodes to the graph, attempt to assign it to a module based on path patterns. If it matches a module, update that module's fragment. If it matches no module, add to `unassigned` and emit a `module:unassigned` event.

**Edge case — file renamed:** Delete + add. Git renames show as delete + add at the filesystem level. The graph handles this correctly because it uses file paths as node addresses. Old nodes removed, new nodes added.

**Edge case — tsconfig.json changes:** Path aliases may have changed. This requires a full re-analysis not incremental. Detect tsconfig changes by watching that file too. On change, trigger full `mikk analyze`.

**Edge case — package.json changes:** New dependencies added. The `ExternalNode` registry needs updating. Trigger a partial re-analysis of files that import the affected package.

---

## Workflow C — Intent Engine Preflight (`mikk intent "..."`)

This is the most complex runtime workflow. It runs every time a developer asks the AI to do something.

### The Complete Preflight Pipeline

```
Developer types: "fix the token expiry bug in auth"
        ↓
STEP 1: Read sync state
  Check sync-state.json
  If drifted → warn + offer to sync first
  If syncing → wait up to 2s
  If clean → proceed
        ↓
STEP 2: Prompt tokenization
  Extract noun phrases: ["token expiry", "auth"]
  Extract verb: ["fix"]
  Extract intent type: bug-fix (fix/debug/repair → bug-fix)
  Intent types: bug-fix | feature | refactor | query | test | docs | other
        ↓
STEP 3: Lock file lookup
  For each noun phrase, search lock.functions for matches:
    "token expiry" → partial match on function names:
      - fn:src/auth/verify.ts:validateExpiry (score: 0.94)
      - fn:src/auth/refresh.ts:checkTokenAge  (score: 0.71)
      - fn:src/utils/jwt.ts:jwtDecode         (score: 0.45)
    "auth" → module match:
      - module: auth (all functions in src/auth/**)
        ↓
STEP 4: Generate candidate intents (via AI with lock context)
  Prompt to AI includes:
    - Developer's raw prompt
    - Top 10 matching functions from lock (names + files + one-line descriptions)
    - Relevant module summaries
    - Declared constraints
  AI returns 2-3 candidates as JSON:
    [
      {
        description: "Fix validateExpiry() returning wrong result for tokens near expiry boundary",
        confidence: 0.89,
        affectedFunctions: ["fn:src/auth/verify.ts:validateExpiry"],
        affectedFiles: ["src/auth/verify.ts", "src/utils/jwt.ts"],
        type: "bug-fix"
      },
      {
        description: "Fix token expiry check in the refresh flow",
        confidence: 0.61,
        affectedFunctions: ["fn:src/auth/refresh.ts:checkTokenAge"],
        affectedFiles: ["src/auth/refresh.ts"],
        type: "bug-fix"
      }
    ]
        ↓
STEP 5: Present to developer
  Show candidates as clickable options
  Developer picks option 1
        ↓
STEP 6: Constraint check
  For confirmed intent, check against declared constraints:
    Constraint: "All DB access must go through repository layer"
    Intent touches: src/auth/verify.ts
    Does verify.ts import anything from db/ directly? → check graph
    Graph says: verify.ts → db/users.ts (direct import, not through repository)
    → FLAG: "verify.ts imports db/users.ts directly, violating the DB access constraint"
    → Show conflict with severity: warning (not blocking, but worth knowing)
        ↓
STEP 7: File suggestion
  Walk graph from confirmed affected functions:
    CERTAIN (direct involvement):
      src/auth/verify.ts      ← contains validateExpiry
      src/utils/jwt.ts        ← jwtDecode called by validateExpiry
    SUGGESTED (one hop away):
      src/auth/middleware.ts  ← calls verifyToken which calls validateExpiry
      src/types/auth.ts       ← DecodedToken type used in validateExpiry
    WORTH KNOWING (two hops, recently changed):
      src/config/jwt.ts       ← modified 22 minutes ago, contains JWT_EXPIRY constant
        ↓
STEP 8: Developer confirms file list
  Checks src/config/jwt.ts as "worth knowing" → moves to suggested
        ↓
STEP 9: Build context payload
  Layer 1 (structure):  module summaries + function signatures from lock
  Layer 2 (code):       exact file contents for confirmed files
  Layer 3 (intent):     confirmed description + type + affected functions
  Layer 4 (changes):    recent modifications with timestamps
        ↓
STEP 10: Output
  If running inside VS Code extension → inject into AI context automatically
  If running CLI → write context to .mikk/context/latest.md
  Also generate claude.md update for this session
```

**Edge case — prompt too vague ("fix the bug"):** Not enough signal to generate meaningful candidates. Ask one clarifying question: "Which part of the codebase? Type a module name or describe the symptom." Do not try to generate candidates from insufficient input.

**Edge case — prompt mentions a function that doesn't exist:** "Fix the validateUser function" — lock lookup returns no match. Two options: 1) Function was just created and watcher hasn't synced yet (check sync state age — if > 10s old, suggest running `mikk analyze`). 2) Developer misremembered the name. Show fuzzy matches: "Did you mean: `verifyToken`, `validateExpiry`, `validateSession`?"

**Edge case — constraint check is ambiguous:** The constraint says "no direct DB access" but the intent is to add a new repository function inside the db/ module. That's not a violation — it's the correct place. The constraint checker must understand the module context of the changed files. If the changed file IS the repository layer, no constraint is violated.

**Edge case — AI generates duplicate candidates:** Deduplicate by `affectedFunctions` overlap. If two candidates affect the same primary function, merge them or keep only the higher-confidence one.

**Edge case — prompt is a question, not a task:** "How does auth work?" — intent type is `query`. Skip the file suggestion pipeline. Go directly to the architecture query engine which reads the lock and generates a structural explanation.

---

## Workflow D — claude.md Generation

This is how Mikk generates an always-accurate `claude.md`.

```
mikk analyze completes (or watcher updates)
        ↓
Read mesh.json (declared section: modules, constraints, decisions)
Read mesh.lock.json (functions, relationships, recent changes)
        ↓
For each module (sorted by inter-module dependency order):
  Write module section:
    ## [Module Name]
    **Purpose:** [module.intent from mesh.json]
    **Location:** [module.paths]
    **Entry points:** [top-level exported functions with signatures]
    **Key functions:** [top 5 functions by calledBy count]
    **Depends on:** [other modules this module imports from]
    **Constraints:** [constraints that mention this module]
        ↓
Write architectural decisions section
Write cross-cutting constraints section
Write recent changes section (last 7 days from lock)
        ↓
Compute token count of generated claude.md
If > 8000 tokens:
  Trim to essential sections only (no recent changes, abbreviated function lists)
  Add note: "Full details available in mesh.lock.json"
        ↓
Write to project root: claude.md
Also write: AGENTS.md (identical content, different tools read different filenames)
```

**The critical difference from handwritten claude.md:** Every function name, file path, line number, and module relationship in the generated `claude.md` is sourced from the lock file which is sourced from the AST which is sourced from the actual code. There is no human in the loop for content. Humans only control the `intent` and `constraints` sections in `mesh.json` — everything else is computed.

---

# PART 3 — EDGE CASES BY CATEGORY

## Parser Edge Cases

### TypeScript-specific

**Generic functions:**
```typescript
function transform<T>(input: T, fn: (x: T) => T): T
```
Extract with generics preserved in the signature. `params` includes `T` as a type parameter. Store as `typeParameters: ["T"]` in `ParsedFunction`.

**Decorators:**
```typescript
@Injectable()
class AuthService { ... }
```
Decorators are metadata. Extract the decorator names as `decorators: ["Injectable"]` on the class. They affect how the class is used (dependency injection) and should appear in the lock.

**Namespace imports:**
```typescript
import * as jwt from 'jsonwebtoken'
jwt.verify(token, secret)
```
`jwt.verify` is a call to an external function. The call extractor sees a MemberExpression with object `jwt`. It knows `jwt` is a namespace import from `jsonwebtoken`. Store the call as `external:jsonwebtoken.verify`.

**Optional chaining calls:**
```typescript
user?.getProfile()
```
This is a conditional call to `getProfile`. Extract it with `isOptional: true`. It belongs in the call list but with lower confidence — it may not always execute.

**Nullish coalescing with function calls:**
```typescript
const result = getCache() ?? fetchFromDB()
```
Both `getCache` and `fetchFromDB` are calls. Extract both.

**Template literal types and conditional types:** These are type-level constructs. Skip them for the call graph. They appear in `ParsedFunction.returnType` as strings.

**Async generators:**
```typescript
async function* streamData(): AsyncGenerator<Chunk> { ... }
```
Extract as a function with `isAsync: true` and `isGenerator: true`. The return type is `AsyncGenerator<Chunk>`.

---

## Graph Edge Cases

### Circular dependencies

Real TypeScript projects have circular imports regularly. They work at runtime because of how Node.js module loading works (partially evaluated modules). The graph must handle them:

```
auth/verify.ts imports from auth/types.ts
auth/types.ts imports from auth/verify.ts (for a type)
```

Detection: During graph construction, track a `building` Set. If we encounter a node already in `building`, it's a circular dep. Add a `CircularEdge` type. Do not recurse further. The circular dep is recorded but doesn't cause a stack overflow.

Impact analysis on circular deps: A change in either file impacts both. The BFS handles this correctly because it visits each node once (via the `visited` Set).

### God files

A single file with 200 functions. Common in legacy codebases. The graph handles this fine — it's just a node with many edges. But it will show up as low confidence for any cluster it's in because its coupling score is spread thin. Flag god files explicitly: any file with > 30 functions gets a `isGodFile: true` flag in the lock.

### Highly connected utilities

`src/utils/logger.ts` is imported by 150 files. If the logger changes, impact analysis says 150 files are impacted. This is technically correct but not actionable — you wouldn't want to list 150 files as "files to include in context." Solution: mark nodes with `inEdges.length > 50` as `isUtility: true`. Utility nodes are excluded from impact analysis propagation. They're acknowledged in the file suggestion output ("logger.ts is a utility — changes there affect everything") but not listed individually.

---

## Sync Edge Cases

### Race condition: file changes while parsing

Chokidar fires at T=0. We start reading the file at T=10ms. Another save happens at T=30ms. Our read at T=10ms gets the content that existed at T=0, but by the time we finish parsing (T=150ms), the file has changed again.

Solution: After parsing, re-hash the file. Compare against the hash we used to start. If different, another save happened mid-parse. Re-run the parse. Maximum 3 retries before giving up and marking the file as `status: conflict`.

### Large file parse time

A 2000-line TypeScript file takes ~300ms to parse. During that 300ms, the sync state is `syncing`. If the developer asks the AI something during those 300ms, the response will show `🟡 Syncing (1 file)`. After parse completes, state returns to `clean`.

### git operations

`git checkout main` might change 200 files simultaneously. The debounce window (100ms) catches all of them as one batch. Trigger detection: if batch size > 15, run full `mikk analyze` instead of incremental. Show: "Large change detected (200 files). Running full analysis..."

`git stash` / `git stash pop`: same as checkout. Handled identically.

`git merge` with conflicts: files with conflict markers (`<<<<<<`, `======`, `>>>>>>`) will fail to parse. Catch parse errors, mark those files as `status: conflict` in the lock. Do not crash. When conflicts are resolved, the watcher detects the file change and re-parses cleanly.

---

## Intent Engine Edge Cases

### Prompt in a language other than English

The AI model handles multilingual input natively. No special handling needed. The lock file content (function names, file paths) is always in English/code. The developer's prompt can be in any language.

### Extremely long prompt

Developer pastes a 500-word description. Truncate to 1000 characters for the intent interpretation step. The key information is almost always in the first sentence. Include the full prompt in the final context payload to the AI — just use the truncated version for candidate generation.

### Prompt that references a specific line number

"There's a bug on line 47 of verify.ts." Look up the function that contains line 47 in the lock. `validateExpiry` spans lines 44–61. The intent is about `validateExpiry`. Add this as a direct mapping: line number → containing function → all the graph knowledge about that function.

### Two prompts submitted quickly

Developer submits one prompt, then immediately submits another before the first preflight completes. Queue them. Complete the first preflight. Then start the second. Do not run two preflight pipelines in parallel.

### Intent conflicts with itself

"Refactor auth and add a new feature to payments." This is two separate intents. Detect by: multiple verb-module pairs where modules are different. Respond: "This looks like two separate tasks. Which one first?" Present them as separate options.

---

# PART 4 — THE SYNC STATE MACHINE

The sync state is the most critical runtime concern. It must be correct at all times because everything else depends on it.

```
States:
  clean    → Everything in sync. AI queries can proceed.
  syncing  → File change in progress. Wait or proceed with warning.
  drifted  → Significant drift detected. Analysis recommended.
  conflict → Parse errors or unresolvable state. User action required.

Transitions:
  clean   → syncing   : File change detected by watcher
  syncing → clean     : Incremental analysis completed successfully
  syncing → drifted   : Analysis failed or took > 5 seconds
  syncing → conflict  : Parse error or hash verification failed
  drifted → syncing   : User runs mikk analyze
  conflict → syncing  : User resolves issues and saves files
  conflict → clean    : Full analysis completes without errors

State file: .mikk/sync-state.json
Written atomically (write to temp, rename to final — prevents partial reads)
Read before every AI context query
```

**Atomic writes:** The sync state file must be written atomically. A partial write (power loss, crash mid-write) would leave corrupt JSON. The pattern: write to `.mikk/sync-state.json.tmp`, then `fs.rename()`. Rename is atomic on all operating systems.

**Stale state detection:** If `sync-state.json` has `status: syncing` but `lastUpdated` is more than 10 seconds ago, the watcher probably crashed. Treat as `drifted`. This prevents the AI from waiting forever on a dead process.

---

# PART 5 — THE CLAUDE.MD GENERATION IN DETAIL

## Token Budget Management

A `claude.md` that's 50,000 tokens is useless — it eats the entire context window. Mikk generates a tiered system:

**Tier 1 — Summary (always included, ~500 tokens):**
```markdown
# [Project Name] — Architecture Overview

## What this project does
[project.description from mesh.json]

## Modules
- auth: Handles JWT-based authentication [6 functions]
- payments: Stripe integration and billing [8 functions]
- db: Repository layer for all database access [12 functions]

## Critical constraints
- All DB access must go through db/ repository layer
- No direct Stripe SDK usage outside payments/
- Auth middleware required on all /api/* routes
```

**Tier 2 — Module details (included if budget allows, ~300 tokens per module):**
```markdown
## auth module
**Location:** src/auth/**
**Entry points:**
  - verifyToken(token: string): boolean — validates JWT, checks expiry
  - authMiddleware(req, res, next): void — Express middleware, uses verifyToken
**Key internal functions:**
  - validateExpiry(decoded: DecodedToken): boolean
  - jwtDecode(token: string): DecodedToken
**Depends on:** db (for user lookup), utils (for JWT operations)
```

**Tier 3 — Recent changes (included if budget allows, ~50 tokens per change):**
```markdown
## Recent changes (last 7 days)
- src/auth/verify.ts modified 2 hours ago (validateExpiry function changed)
- src/payments/charge.ts modified yesterday (new handleRefund function added)
```

**Token counting:** Use `@anthropic-ai/tokenizer` to count tokens before writing. Start with Tier 1. Add modules until budget (default: 6000 tokens) is reached. If all modules fit, add recent changes. Never exceed budget.

## What Never Goes in claude.md

- Full function implementations (that's what file context is for)
- Test files (waste of tokens)
- Generated files (they describe themselves)
- `node_modules` anything
- File paths longer than 50 characters (truncate to last 3 segments)

---

# PART 6 — THE MCP SERVER

The MCP server exposes Mikk's lock file as queryable tools that any MCP-compatible AI (Claude, Cursor, etc.) can call directly during a coding session.

## Why This Matters

Without MCP, the workflow is: developer runs `mikk intent`, copies the output, pastes it into the AI. With MCP, the AI calls Mikk directly. The AI can say "let me check the architecture before I answer" and calls `mikk_get_module("auth")` itself.

## Three MCP Tools

### `mikk_get_function`

```
Input:  { name: string, file?: string }
Output: {
  found: boolean,
  function?: {
    id, name, file, startLine, endLine,
    signature, calls, calledBy, moduleId,
    bodyPreview (first 5 lines)
  },
  suggestions?: string[] (if not found, fuzzy matches)
}
```

Usage: AI wants to know exactly where `verifyToken` is and what it calls before modifying it.

### `mikk_get_module`

```
Input:  { moduleId: string }
Output: {
  found: boolean,
  module?: {
    id, name, intent, paths,
    functions: FunctionSummary[],
    constraints: string[],
    dependsOn: string[],
    dependedOnBy: string[]
  }
}
```

Usage: AI wants to understand the full auth module before making changes anywhere in it.

### `mikk_impact_analysis`

```
Input:  { functionId: string }
Output: {
  function: FunctionSummary,
  impacted: {
    certain: FunctionSummary[],    (direct callers)
    likely:  FunctionSummary[],    (2 hops away)
    possible: FunctionSummary[]    (3+ hops)
  },
  summary: string  (human-readable impact description)
}
```

Usage: Before modifying `jwtDecode`, the AI wants to know everything that will be affected.

## MCP Server Implementation

```typescript
// packages/mcp-server/src/server.ts
import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"

const server = new Server(
  { name: "mikk", version: "1.0.0" },
  { capabilities: { tools: {} } }
)

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "mikk_get_function",
      description: "Get exact location and relationships of a function in the codebase",
      inputSchema: { type: "object", properties: {
        name: { type: "string", description: "Function name" },
        file: { type: "string", description: "Optional: file path to narrow search" }
      }, required: ["name"] }
    },
    // ... other tools
  ]
}))

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const lock = await loadLock(process.cwd())

  switch (request.params.name) {
    case "mikk_get_function":
      return handleGetFunction(lock, request.params.arguments)
    case "mikk_get_module":
      return handleGetModule(lock, request.params.arguments)
    case "mikk_impact_analysis":
      return handleImpactAnalysis(lock, request.params.arguments)
  }
})

const transport = new StdioServerTransport()
await server.connect(transport)
```

**Edge case — lock file not found:** MCP tool returns `{ found: false, error: "No mesh.lock.json found. Run mikk init first." }`. Never throw — MCP tools must return structured responses, not exceptions.

**Edge case — lock file is stale:** Check `sync-state.json`. If drifted, include a warning in the response: `{ ..., warning: "Lock file may be outdated. Run mikk analyze for latest results." }`. Still return what's in the lock — stale information is better than no information.

**Edge case — function exists in multiple files:** `index.ts` files re-export functions with the same name. Return all matches with their files. The AI can disambiguate by file path.

---

# PART 7 — KNOWN HARD PROBLEMS AND HONEST SOLUTIONS

## Hard Problem 1: TypeScript Compiler API is Slow

The TypeScript Compiler API creates a full language service and type-checks the entire project. On a 300-file project this takes 3–8 seconds on first run.

**Solution:** Run Tree-sitter first (fast, syntax only). Return a partial result immediately. Run TypeScript Compiler API enrichment in the background. When it completes, update the lock with fully resolved call targets. The user sees progress: "Quick scan complete. Semantic enrichment running..."

For the watcher, only re-run TypeScript Compiler API on files that changed and their direct dependents. Not the whole project.

**Fallback:** If TypeScript Compiler API enrichment hasn't completed yet, calls are recorded with `resolved: false`. They appear in the graph but with a `tentative` flag. Impact analysis still works — it's just slightly less precise until enrichment completes.

## Hard Problem 2: Monorepo Cross-Package References

In a monorepo, Package A imports from Package B:
```typescript
import { verifyToken } from '@myorg/auth'
```

This resolves to a different package, not a relative file path. The resolver must handle this.

**Solution:** Read the monorepo workspace config (`pnpm-workspace.yaml`, `package.json` workspaces field). Build a package name → local path map. `@myorg/auth` → `packages/auth/src/index.ts`. Then resolve imports through this map before falling back to node_modules.

**Edge case:** The cross-package import resolves to a compiled `dist/` file, not source. This happens when the package is built but not set up for local development. Look for `exports` field in the package's `package.json`. If it points to `dist/`, warn the developer that source-level analysis isn't possible for that package and suggest adding a `source` export condition.

## Hard Problem 3: Dynamic Code Patterns

Some code patterns cannot be statically analyzed:

```typescript
const handlers = { auth: verifyToken, payments: chargeCustomer }
const result = handlers[eventType]()  // Dynamic dispatch
```

The call to `verifyToken` or `chargeCustomer` is not visible to static analysis. The code is branching based on runtime data.

**Solution:** Record the pattern as a `DynamicCallGroup`. List all values of `handlers` as potential targets. In the lock: `calls: [{ target: "fn:auth/verify.ts:verifyToken", isDynamic: true }, ...]`. Impact analysis includes dynamic call targets but marks them as `confidence: low`.

**What not to do:** Don't try to be clever and trace the runtime value. Static analysis has hard limits. Acknowledge them honestly with confidence scores rather than producing confident but wrong results.

## Hard Problem 4: Generated Files

Many TypeScript projects generate code — GraphQL type generation, Prisma client, OpenAPI codegen. These files should not be parsed as first-class source files.

**Detection:** Generated files almost always contain a header comment:
```
// This file was auto-generated. Do not edit.
// Generated by: @graphql-codegen
```

**Solution:** Check the first 10 lines of every file for generation markers. If found, mark as `isGenerated: true` in the lock. Include them in external dependency tracking (your code depends on the generated types) but do not parse their internals as navigable functions.

**Default exclude patterns:**
- `**/*.generated.ts`
- `**/generated/**`
- `**/__generated__/**`
- `**/prisma/client/**`
- Files containing `// DO NOT EDIT`, `// Code generated by`, `// @generated`

## Hard Problem 5: Test Files

Test files import source files and call their functions. If included naively, the call graph becomes polluted — every function appears to be "called by" its test, which is true but not architecturally meaningful.

**Solution:** Parse test files but track them separately. Test imports and calls are stored in a `testGraph` parallel structure. They do not pollute the main dependency graph. Impact analysis has a `--include-tests` flag (default: off) that adds test coverage to the results.

This means `mikk impact src/auth/verify.ts` shows you which production code depends on `verifyToken`. `mikk impact --include-tests src/auth/verify.ts` additionally shows which tests cover it.

---

# PART 8 — PERFORMANCE TARGETS

These are the numbers the system must hit to be acceptable in daily use. If a step is slower than its target, it must be investigated before shipping.

| Operation | Target | Max Acceptable |
|---|---|---|
| `mikk init` on 100-file project | < 8s | 15s |
| `mikk init` on 500-file project | < 30s | 60s |
| File change → lock updated | < 600ms | 2s |
| Hash comparison (change detection) | < 50ms | 100ms |
| Intent generation (API call) | < 3s | 8s |
| File suggestion (graph traversal) | < 200ms | 500ms |
| `claude.md` regeneration | < 500ms | 2s |
| MCP tool response | < 300ms | 1s |
| Lock fragment read | < 50ms | 150ms |

## How to Hit These Numbers

**Parallelism:** Parse files in parallel batches. Batch size = `Math.min(20, os.cpus().length * 4)`. Never parse sequentially.

**Lazy loading:** Never load the full `mesh.lock.json` into memory. Load only the fragments needed for the current operation. The root lock file is an index only.

**Hash-first:** Always check hashes before reading content. If hash matches, skip everything else.

**BFS depth limit:** Impact analysis BFS stops at depth 10. Beyond that, changes are so indirect they're not actionable context.

**Fragment caching:** Keep recently-used lock fragments in an LRU cache (max 20 fragments, max 50MB). File system reads are the bottleneck — cache eliminates repeat reads.

**Debouncing:** The watcher debounces at 100ms. Multiple saves within 100ms are treated as one event. This prevents thrashing when a formatter saves a file immediately after the developer.

---

*Deep Workflow v1.0 | Mikk | March 2026*
