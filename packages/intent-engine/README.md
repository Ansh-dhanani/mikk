# @getmikk/intent-engine

> Architectural pre-flight — check if your idea is safe before writing a single line.

[![npm](https://img.shields.io/npm/v/@getmikk/intent-engine)](https://www.npmjs.com/package/@getmikk/intent-engine)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](../../LICENSE)

`@getmikk/intent-engine` is the pre-flight check layer. You describe what you want to build in plain English — *"add a caching layer to the auth module"* — and before any code is written, the engine interprets your intent into structured objects, checks it against every architectural constraint in `mikk.json`, detects conflicts and layer violations, and generates a concrete implementation plan with which files to touch and what to create.

For AI coding agents, this is the guardrail that prevents architecturally unsafe code generation. For human developers, it's the equivalent of running your idea past a senior architect who knows every constraint in the codebase.

> Part of [Mikk](../../README.md) — the codebase nervous system for AI-assisted development.

---

## Installation

```bash
npm install @getmikk/intent-engine
# or
bun add @getmikk/intent-engine
```

**Peer dependency:** `@getmikk/core`

---

## Quick Start

```typescript
import { PreflightPipeline } from '@getmikk/intent-engine'
import { ContractReader, LockReader } from '@getmikk/core'

const contract = await new ContractReader().read('./mikk.json')
const lock = await new LockReader().read('./mikk.lock.json')

const pipeline = new PreflightPipeline(contract, lock)
const result = await pipeline.run('Add a Redis caching layer to the auth module')

console.log(result.intents)       // Parsed intent objects
console.log(result.conflicts)     // Constraint violations found
console.log(result.suggestions)   // File-level implementation plan
console.log(result.approved)      // true if no blocking conflicts
```

---

## Pipeline Architecture

```
Natural Language Prompt
        │
        ▼
┌──────────────────┐
│ IntentInterpreter │  → Intent[]
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ ConflictDetector  │  → ConflictResult
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│    Suggester      │  → Suggestion[]
└────────┬─────────┘
         │
         ▼
   PreflightResult
```

---

## API Reference

### PreflightPipeline

The main entry point — orchestrates the full interpret → detect → suggest flow.

```typescript
import { PreflightPipeline } from '@getmikk/intent-engine'

const pipeline = new PreflightPipeline(contract, lock)
const result = await pipeline.run('refactor the payment module to use Stripe')
```

**`PreflightResult`:**

| Field | Type | Description |
|-------|------|-------------|
| `intents` | `Intent[]` | Structured interpretation of the prompt |
| `conflicts` | `ConflictResult` | Any constraint violations detected |
| `suggestions` | `Suggestion[]` | Concrete implementation suggestions |
| `approved` | `boolean` | `true` if no error-level conflicts |

---

### IntentInterpreter

Parses natural-language prompts into structured intent objects using heuristic keyword matching and fuzzy matching against the lock file's function/module inventory.

```typescript
import { IntentInterpreter } from '@getmikk/intent-engine'

const interpreter = new IntentInterpreter(contract, lock)
const intents = await interpreter.interpret('add input validation to the signup form')
```

**How it works:**

1. **Action verb detection** — Scans for keywords like `create`, `add`, `modify`, `update`, `delete`, `remove`, `refactor`, `move`, `rename`
2. **Target resolution** — Matches mentioned names against lock file functions, classes, modules, and files using fuzzy matching
3. **Confidence scoring** — Higher confidence for exact matches, lower for fuzzy

**`Intent`:**

```typescript
type Intent = {
  action: 'create' | 'modify' | 'delete' | 'refactor' | 'move'
  target: {
    type: 'function' | 'class' | 'module' | 'file'
    name: string
    moduleId?: string    // Which module contains the target
    filePath?: string    // Resolved file path
  }
  reason: string         // Why this intent was derived
  confidence: number     // 0-1 confidence score
}
```

---

### ConflictDetector

Rule-based constraint checker that validates intents against the architectural rules in `mikk.json`.

```typescript
import { ConflictDetector } from '@getmikk/intent-engine'

const detector = new ConflictDetector(contract, lock)
const result = detector.detect(intents)

if (result.hasConflicts) {
  for (const conflict of result.conflicts) {
    console.warn(`[${conflict.severity}] ${conflict.message}`)
    if (conflict.suggestedFix) {
      console.log(`  Fix: ${conflict.suggestedFix}`)
    }
  }
}
```

**Constraint types checked:**

| Constraint | Description | Example |
|-----------|-------------|---------|
| `no-import` | Module A must not import from Module B | `"no-import": ["payments"]` in the auth module |
| `must-use` | Module must use specified dependencies | `"must-use": ["@getmikk/core"]` |
| `no-call` | Functions in module must not call specified targets | `"no-call": ["database.rawQuery"]` |
| `layer` | Enforces layered architecture ordering | `"layer": 2` — can only import from lower layers |
| `naming` | Enforces naming patterns for functions/files | `"naming": { "functions": "^handle|^use|^get" }` |
| `max-files` | Limits the number of files in a module | `"max-files": 20` |

**Additional checks:**
- **Boundary crossing** — Detects when an intent would create a new cross-module dependency
- **Missing dependencies** — Flags when a target module doesn't exist
- **Ownership warnings** — Warns when modifying code owned by a different team/module

**`Conflict`:**

```typescript
type Conflict = {
  type: 'constraint-violation' | 'ownership-conflict' | 'boundary-crossing' | 'missing-dependency'
  severity: 'error' | 'warning'
  message: string
  relatedIntent: Intent
  suggestedFix?: string
}
```

---

### Suggester

Generates concrete implementation suggestions based on intents and the current codebase state.

```typescript
import { Suggester } from '@getmikk/intent-engine'

const suggester = new Suggester(contract, lock)
const suggestions = suggester.suggest(intents)

for (const s of suggestions) {
  console.log(`Action: ${s.intent.action} ${s.intent.target.name}`)
  console.log(`Affected files: ${s.affectedFiles.join(', ')}`)
  console.log(`New files: ${s.newFiles.join(', ')}`)
  console.log(`Impact: ${s.estimatedImpact}`)
}
```

**`Suggestion`:**

| Field | Type | Description |
|-------|------|-------------|
| `intent` | `Intent` | The original intent this suggestion addresses |
| `affectedFiles` | `string[]` | Existing files that would need changes |
| `newFiles` | `string[]` | Files that would need to be created |
| `estimatedImpact` | `'low' \| 'medium' \| 'high'` | Blast radius estimate |
| `implementation` | `string` | Natural-language implementation guidance |

---

## Usage with AI Agents

The intent engine is designed to be called by AI coding agents as a pre-flight check:

```typescript
// In your AI agent's planning phase:
const pipeline = new PreflightPipeline(contract, lock)
const preflight = await pipeline.run(userPrompt)

if (!preflight.approved) {
  // Show conflicts to user, ask for confirmation
  const errors = preflight.conflicts.conflicts.filter(c => c.severity === 'error')
  throw new Error(`Blocked: ${errors.map(e => e.message).join('; ')}`)
}

// Use suggestions to guide implementation
for (const suggestion of preflight.suggestions) {
  // suggestion.affectedFiles — files to read/modify
  // suggestion.newFiles — files to create
  // suggestion.implementation — guidance text
}
```

---

## Types

```typescript
import type {
  Intent,
  Conflict,
  ConflictResult,
  Suggestion,
  PreflightResult,
  AIProviderConfig,
} from '@getmikk/intent-engine'
```

---

## License

[Apache-2.0](../../LICENSE)
