# @getmikk/intent-engine

> Safety gates, decision engine, auto-correction, and local semantic search for pre-edit validation.

[![npm](https://img.shields.io/npm/v/@getmikk/intent-engine)](https://www.npmjs.com/package/@getmikk/intent-engine)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](../../LICENSE)

The Intent Engine is the safety layer that validates every edit before it lands. It runs as part of `mikk_validate_edit` and `mikk_before_edit` in the MCP server, and as `mikk intent` in the CLI.

> Part of [Mikk](../../README.md) — live architectural context for your AI agent.

---

## Components

### PreEditValidation

The main entry point for the MCP `mikk_validate_edit` tool. Runs the full pipeline against a set of files the agent intends to edit.

```typescript
import { PreEditValidation } from '@getmikk/intent-engine'

const validator = new PreEditValidation(contract, lock, graph, projectRoot)

const result = await validator.validate({
  files: ['src/auth/login.ts'],
  description: 'Refactor JWT validation to use new token format',
  intent: {
    commitMessage: 'REFACTOR: update JWT validation',
    branchName: 'refactor/jwt-v2',
  },
})

result.allowed        // true | false
result.gates          // per-gate pass/fail with reason and bypassable flag
result.intent         // { isIntentionalBreakingChange, confidence, reasoning }
result.impact         // { riskScore, totalFunctions, blastRadius, criticalPaths }
result.corrections    // auto-applied and suggested fixes
result.recommendations
result.nextSteps
```

---

### EnforcedSafetyGates

Six gates that run before any edit is applied:

| Gate | Blocks when | Bypassable |
|------|------------|-----------|
| `RISK_SCORE` | Risk ≥ 90, or > `maxRiskScore` policy | Yes (except ≥ 90) |
| `IMPACT_SCALE` | Impact > `maxImpactNodes × 2` | Yes |
| `PROTECTED_MODULE` | A protected module is touched | **Never** |
| `BREAKING_CHANGE` | Exported API changed without `BREAKING:` commit marker | Yes |
| `TEST_COVERAGE` | High-risk changes with no test file edits | Yes |
| `DOCUMENTATION` | Significant API changes with no doc file updates | Yes |

Configure all thresholds in `mikk.json` under `policies`.

---

### IntentUnderstanding

Analyzes commit messages, branch names, and change patterns to determine whether a breaking change is intentional.

Intent signals recognized:
- Commit markers: `BREAKING:`, `REFACTOR:`, `MIGRATION:`
- Branch patterns: `refactor/`, `breaking/`, `v2/`
- ADR entries in `mikk.json` that mention the changed module and contain "migration" or "deprecat"

---

### DecisionEngine

Aggregates all signals and returns a three-state verdict:

| Status | Meaning |
|--------|---------|
| `APPROVED` | Risk within policy, no violations |
| `WARNING` | Risk or impact exceeds a threshold — review recommended |
| `BLOCKED` | Risk ≥ 90, protected module touched, or strict boundaries violated |

```typescript
import { DecisionEngine } from '@getmikk/intent-engine'

const engine = new DecisionEngine(contract)
const decision = engine.evaluate(impactResult)
// { status, reasons, riskScore, impactNodes }
```

---

### AutoCorrectionEngine

Detects and auto-fixes common issues in source files without requiring AI involvement:

| Issue type | Detection | Fix |
|-----------|-----------|-----|
| **Broken references** | Call targets absent from lock | Nearest Levenshtein match (threshold 3); replaces whole-word occurrences |
| **Missing imports** | Resolved import path absent from lock | Finds moved file by basename; replaces import path |
| **Boundary violations** | Cross-module calls that violate constraints | Prepends `// TODO [mikk]: Boundary violation` comment with adapter suggestion |

All file writes are path-traversal guarded — only files inside `projectRoot` are touched.

```typescript
import { AutoCorrectionEngine } from '@getmikk/intent-engine'

const corrector = new AutoCorrectionEngine(contract, lock, graph, projectRoot)
const result = await corrector.analyzeAndFix(['src/auth/login.ts'])

result.appliedFixes   // fixes written to disk
result.failedFixes    // fixes that could not be safely applied
result.filesModified  // list of modified file paths
```

---

### PreflightPipeline

For validating a plain-English plan before writing any code:

```typescript
import { PreflightPipeline } from '@getmikk/intent-engine'

const pipeline = new PreflightPipeline(contract, lock)
const result = await pipeline.run("Add rate limiting to all API routes")

result.approved      // true | false
result.conflicts     // constraint violations detected
result.decision      // DecisionResult
result.explanation   // human-readable summary with risk breakdown
```

---

### SemanticSearcher

Find functions by natural-language description using local vector embeddings.

```bash
npm install @xenova/transformers
```

The model (`Xenova/all-MiniLM-L6-v2`, ~22MB) downloads once to `~/.cache/huggingface` and runs fully locally.

```typescript
import { SemanticSearcher } from '@getmikk/intent-engine'

const available = await SemanticSearcher.isAvailable()

const searcher = new SemanticSearcher(projectRoot)
await searcher.index(lock)
const results = await searcher.search('validate a JWT token', lock, 10)
// [{ name, file, moduleId, purpose, lines, score }]
```

Embeddings are cached to `.mikk/embeddings.json` and recomputed only when the lock changes.

---

## License

[Apache-2.0](../../LICENSE)
