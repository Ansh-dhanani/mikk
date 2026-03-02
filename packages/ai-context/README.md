# @getmikk/ai-context

> Intelligent context distillation for AI coding agents — builds token-budgeted, relevance-scored context payloads from the dependency graph, plus generates `claude.md` / `AGENTS.md` files.

[![npm](https://img.shields.io/npm/v/@getmikk/ai-context)](https://www.npmjs.com/package/@getmikk/ai-context)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](../../LICENSE)

`@getmikk/ai-context` solves the "context window" problem for AI coding assistants. Instead of dumping your entire codebase into a prompt, it uses the dependency graph to trace only the relevant functions, files, and constraints for a given task — then packs them into a token-budgeted payload.

It also generates tiered `claude.md` and `AGENTS.md` files that give AI agents a structured understanding of your project architecture.

---

## Installation

```bash
npm install @getmikk/ai-context
# or
bun add @getmikk/ai-context
```

**Peer dependencies:** `@getmikk/core`, `@getmikk/intent-engine`

---

## Quick Start

### Context Queries

```typescript
import { ContextBuilder, getProvider } from '@getmikk/ai-context'
import { ContractReader, LockReader } from '@getmikk/core'

const contract = await new ContractReader().read('./mikk.json')
const lock = await new LockReader().read('./mikk.lock.json')

const builder = new ContextBuilder(contract, lock)
const context = builder.build({
  task: 'Add rate limiting to the authentication endpoints',
  tokenBudget: 8000,
  maxHops: 3,
  includeCallGraph: true,
})

// Format for a specific AI provider
const provider = getProvider('claude')
const formatted = provider.formatContext(context)
// Send `formatted` as part of your AI prompt
```

### Claude.md / AGENTS.md Generation

```typescript
import { ClaudeMdGenerator } from '@getmikk/ai-context'

const generator = new ClaudeMdGenerator(contract, lock, /* tokenBudget */ 4000)
const markdown = generator.generate()

// Write to project root
await writeFile('./claude.md', markdown)
await writeFile('./AGENTS.md', markdown)
```

---

## How Context Building Works

The `ContextBuilder` uses a 6-step algorithm:

```
1. Resolve Seeds
   └─ Parse task → extract keywords → match against lock file functions/modules

2. BFS Proximity Walk
   └─ Walk the call graph outward from seed functions (up to maxHops)

3. Score Functions
   └─ Each function gets a relevance score:
      • Proximity score (closer to seed = higher)
      • Keyword match score (task keywords in function name)
      • Entry-point bonus (exported functions score higher)

4. Sort by Score
   └─ Descending relevance

5. Fill Token Budget
   └─ Greedily add functions until budget is exhausted
      (each function's token cost ≈ line count × 4)

6. Group by Module
   └─ Organize selected functions into module-level context
```

---

## API Reference

### ContextBuilder

The main entry point for building task-specific context.

```typescript
import { ContextBuilder } from '@getmikk/ai-context'

const builder = new ContextBuilder(contract, lock)
const context = builder.build(query)
```

**`ContextQuery`:**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `task` | `string` | — | Natural-language description of the task |
| `focusFiles` | `string[]` | `[]` | Specific files to prioritize |
| `focusModules` | `string[]` | `[]` | Specific modules to prioritize |
| `maxFunctions` | `number` | `50` | Maximum functions to include |
| `maxHops` | `number` | `3` | BFS depth limit from seed functions |
| `tokenBudget` | `number` | `8000` | Maximum estimated tokens |
| `includeCallGraph` | `boolean` | `true` | Include `calls[]` and `calledBy[]` per function |

**`AIContext` (returned):**

```typescript
type AIContext = {
  project: string              // Project name from contract
  modules: ContextModule[]     // Relevant modules with their functions
  constraints: string[]        // Active architectural constraints
  decisions: string[]          // Relevant ADRs
  prompt: string               // Original task
  meta: {
    seedCount: number          // How many seed functions were found
    totalFunctionsConsidered: number
    selectedFunctions: number  // Functions that fit in the budget
    estimatedTokens: number    // Approximate token count
    keywords: string[]         // Extracted keywords from the task
  }
}
```

**`ContextModule`:**

```typescript
type ContextModule = {
  id: string
  name: string
  description?: string
  intent?: string              // Module's purpose from mikk.json
  functions: ContextFunction[]
  files: string[]
}
```

**`ContextFunction`:**

```typescript
type ContextFunction = {
  name: string
  file: string
  startLine: number
  endLine: number
  calls: string[]              // Functions this one calls
  calledBy: string[]           // Functions that call this one
  purpose?: string             // Inferred purpose
  errorHandling?: string       // Error patterns detected
  edgeCases?: string           // Edge cases noted
}
```

---

### ClaudeMdGenerator

Generates tiered markdown documentation files for AI agents.

```typescript
import { ClaudeMdGenerator } from '@getmikk/ai-context'

const generator = new ClaudeMdGenerator(contract, lock, tokenBudget)
const markdown = generator.generate()
```

**Tiered output structure:**

| Tier | Content | Budget |
|------|---------|--------|
| **Tier 1** | Project summary — name, module count, total functions, architecture overview | ~500 tokens |
| **Tier 2** | Module details — each module's intent, public API, file list, key functions | ~300 tokens/module |
| **Tier 3** | Constraints & decisions — all architectural rules and ADRs | Remaining budget |

**All data is sourced from the AST-derived lock file** — no hallucinated descriptions. Module intents come from `mikk.json`, function lists and call graphs come from `mikk.lock.json`.

**Example output:**

```markdown
# Project: my-app

## Architecture Overview
- **Modules:** 5
- **Total Functions:** 87
- **Total Files:** 23

## Modules

### auth
**Intent:** Handle user authentication and session management
**Public API:** `login`, `logout`, `validateToken`, `refreshSession`
**Files:** auth/login.ts, auth/session.ts, auth/middleware.ts
**Key Functions:**
- `validateToken` (auth/middleware.ts:15-42) → calls: `decodeJWT`, `checkExpiry`
- `login` (auth/login.ts:8-35) → calls: `validateCredentials`, `createSession`

### payments
...

## Constraints
- auth: no-import from payments
- payments: must-use stripe-sdk

## Decisions
- ADR-001: Use JWT for stateless auth (2024-01-15)
```

---

### Providers

Providers format the `AIContext` object into a string optimized for a specific AI model.

```typescript
import { getProvider, ClaudeProvider, GenericProvider } from '@getmikk/ai-context'

// Factory
const provider = getProvider('claude')   // or 'generic'

// Format context for the provider
const formatted = provider.formatContext(context)
```

#### ClaudeProvider

Formats with structured XML tags optimized for Anthropic Claude:

```xml
<architecture>
  <module name="auth" intent="Handle authentication">
    <function name="validateToken" file="auth/middleware.ts" lines="15-42">
      <calls>decodeJWT, checkExpiry</calls>
      <calledBy>authMiddleware</calledBy>
    </function>
  </module>
</architecture>
<constraints>
  auth: no-import from payments
</constraints>
```

#### GenericProvider

Clean plain-text format for any AI model:

```
## Module: auth
Intent: Handle authentication

### validateToken (auth/middleware.ts:15-42)
Calls: decodeJWT, checkExpiry
Called by: authMiddleware
```

---

## Usage Examples

### "What breaks if I change this file?"

```typescript
const context = builder.build({
  task: `Impact analysis for changes to src/auth/login.ts`,
  focusFiles: ['src/auth/login.ts'],
  maxHops: 5,
  tokenBudget: 4000,
})
// Returns all functions transitively affected by login.ts
```

### "Get context for adding a feature"

```typescript
const context = builder.build({
  task: 'Add two-factor authentication to the login flow',
  focusModules: ['auth'],
  tokenBudget: 12000,
  includeCallGraph: true,
})
// Returns auth module functions + related cross-module calls
```

### "Focused context for a specific module"

```typescript
const context = builder.build({
  task: 'Refactor the payment processing pipeline',
  focusModules: ['payments'],
  maxFunctions: 30,
  tokenBudget: 6000,
})
```

---

## Types

```typescript
import type {
  AIContext,
  ContextModule,
  ContextFunction,
  ContextQuery,
  ContextProvider,
} from '@getmikk/ai-context'
```

---

## License

[Apache-2.0](../../LICENSE)
