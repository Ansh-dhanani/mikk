# @getmikk/intent-engine

> Parse developer intent, enforce safety gates, run the Decision Engine, auto-correct issues, and find functions by meaning.

[![npm](https://img.shields.io/npm/v/@getmikk/intent-engine)](https://www.npmjs.com/package/@getmikk/intent-engine)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](../../LICENSE)

The Intent Engine is the safety layer that validates every edit before it lands. It combines:

1. **PreflightPipeline** — pre-flight check for plain-English plans
2. **PreEditValidation** — full pre-edit safety validation (used by `mikk_before_edit`)
3. **IntentUnderstanding** — analyzes commit/branch context for intentional breaking changes
4. **EnforcedSafetyGates** — six gates that block or warn on risky edits
5. **DecisionEngine** — aggregates all signals into `APPROVED` / `WARNING` / `BLOCKED`
6. **AutoCorrectionEngine** — detects and auto-fixes broken references, imports, boundary violations
7. **SemanticSearcher** — local vector search for functions by natural-language description

> Part of [Mikk](../../README.md) — live architectural context for your AI agent.

---

## Pre-Edit Validation (`mikk_before_edit`)

The main entry point for the MCP `mikk_before_edit` tool. Runs the full pipeline against a set of files the AI intends to edit.

```typescript
import { PreEditValidation } from '@getmikk/intent-engine'

const validator = new PreEditValidation(contract, lock, graph, projectRoot, {
  maxRiskScore: 70,
  maxImpactNodes: 10,
  protectedModules: ['auth', 'billing'],
  requireTestsForChangedFiles: true,
  requireDocumentationForApiChanges: false,
})

const result = await validator.validate({
  files: ['src/auth/login.ts', 'src/auth/session.ts'],
  description: 'Refactor JWT validation to use new token format',
  author: 'dev@example.com',
  intent: {
    commitMessage: 'REFACTOR: update JWT validation',
    branchName: 'refactor/jwt-v2',
  },
})

console.log(result.allowed)          // true | false
console.log(result.intent)           // { isIntentionalBreakingChange, confidence, reasoning }
console.log(result.gates)            // per-gate pass/fail with reason and bypassable flag
console.log(result.corrections)      // auto-fixed issues and suggestions
console.log(result.recommendations)  // contextual next steps
```

### Response shape

```typescript
{
  allowed: boolean,
  confidence: number,          // 0–1 intent confidence

  intent: {
    isIntentionalBreakingChange: boolean,
    confidence: number,
    reasoning: string[],
    riskAcceptance: 'none' | 'low' | 'medium' | 'high'
  },

  impact: {
    totalFiles: number,
    totalFunctions: number,
    riskScore: number,          // 0–100
    criticalPaths: string[],    // high-calledBy functions
    blastRadius: string[]       // functions in calledBy chain
  },

  gates: Array<{
    name: string,               // RISK_SCORE | IMPACT_SCALE | PROTECTED_MODULE | ...
    passed: boolean,
    severity: 'BLOCKING' | 'WARNING',
    message: string,
    bypassable: boolean
  }>,

  corrections: {
    available: boolean,
    issuesFound: number,
    autoFixable: number,
    applied: string[],
    suggested: string[]
  },

  recommendations: string[],
  nextSteps: string[],
  tokenSavings: number
}
```

---

## Safety Gates

Six gates enforced by `EnforcedSafetyGates`. Use standalone or via `PreEditValidation`:

```typescript
import { EnforcedSafetyGates } from '@getmikk/intent-engine'

const gates = new EnforcedSafetyGates(contract, lock, graph, {
  maxRiskScore: 70,
  maxImpactNodes: 10,
  protectedModules: ['auth'],
  enforceOnSave: true,
  enforceOnCommit: true,
  enforceInCI: true,
  requireTestsForChangedFiles: true,
  requireDocumentationForApiChanges: false,
})

const results = await gates.validateEdits(['src/auth/login.ts'])
const { allowed, blockingGates } = gates.canProceed(results)
```

| Gate | Blocks when | Bypassable |
|------|------------|-----------|
| `RISK_SCORE` | Risk ≥ 90, or > `maxRiskScore` | Yes (except ≥ 90) |
| `IMPACT_SCALE` | Impact > `maxImpactNodes × 2` | Yes |
| `PROTECTED_MODULE` | Protected module touched | **Never** |
| `BREAKING_CHANGE` | Exported API changed without `BREAKING:` marker | Yes |
| `TEST_COVERAGE` | High-risk changes with no test file edits | Yes |
| `DOCUMENTATION` | Significant API changes with no doc updates | Yes |

---

## Decision Engine

Evaluates an `ImpactResult` against your policies:

```typescript
import { DecisionEngine } from '@getmikk/intent-engine'

const engine = new DecisionEngine(contract)
const decision = engine.evaluate(impactResult)

// { status: 'APPROVED' | 'WARNING' | 'BLOCKED', reasons: string[], riskScore: number, impactNodes: number }
```

---

## Auto-Correction

Detects and fixes common issues in source files:

```typescript
import { AutoCorrectionEngine } from '@getmikk/intent-engine'

const corrector = new AutoCorrectionEngine(contract, lock, graph, projectRoot)
const result = await corrector.analyzeAndFix(['src/auth/login.ts'])

console.log(result.issues)         // all detected issues
console.log(result.appliedFixes)   // auto-applied fixes
console.log(result.failedFixes)    // fixes that failed to apply
```

Issues detected: `broken_reference` · `missing_import` · `boundary_violation`

---

## Pre-flight Pipeline

For plain-English intent validation before writing any code:

```typescript
import { PreflightPipeline } from '@getmikk/intent-engine'

const pipeline = new PreflightPipeline(contract, lock)
const result = await pipeline.run("Add rate limiting to all API routes")

console.log(result.approved)    // true | false
console.log(result.conflicts)   // constraint violations
console.log(result.decision)    // DecisionResult from DecisionEngine
console.log(result.explanation) // human-readable summary
```

---

## Semantic Search

Find functions by natural-language description using local vector embeddings. Runs entirely on-device — no external API.

### Setup

```bash
npm install @xenova/transformers
```

The model (`Xenova/all-MiniLM-L6-v2`, ~22MB) downloads once to `~/.cache/huggingface`.

### Usage

```typescript
import { SemanticSearcher } from '@getmikk/intent-engine'

const searcher = new SemanticSearcher(projectRoot)
await searcher.index(lock)

const results = await searcher.search('validate a JWT token', lock, 10)
// Returns: [{ name, file, moduleId, purpose, lines, score }]
```

Embeddings are cached to `.mikk/embeddings.json` and only recomputed when the lock changes.

```typescript
const available = await SemanticSearcher.isAvailable()
// true if @xenova/transformers is installed
```
