# @getmikk/intent-engine

> Parse developer intent, detect constraint conflicts, and find functions by meaning.

[![npm](https://img.shields.io/npm/v/@getmikk/intent-engine)](https://www.npmjs.com/package/@getmikk/intent-engine)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](../../LICENSE)

Two capabilities in one package: a pre-flight pipeline that catches architectural conflicts before code is written, and a semantic search engine that finds functions by natural-language description using local vector embeddings.

> Part of [Mikk](../../README.md) — live architectural context for your AI agent.

---

## Pre-flight Pipeline

Takes a plain-English prompt describing a refactor or new feature, and returns a structured verdict before any code is written.

### Usage

```bash
mikk intent "Move user validation into a shared utils module"
mikk intent "Extract auth logic into middleware" --json
```

Or programmatically:

```typescript
import { PreflightPipeline } from '@getmikk/intent-engine'

const pipeline = new PreflightPipeline(contract, lock)
const result = await pipeline.run("Add rate limiting to all API routes")

console.log(result.approved)     // true | false
console.log(result.conflicts)    // constraint violations found
console.log(result.suggestions)  // implementation suggestions with affected files
```

### What it returns

```typescript
{
  intents: [
    {
      action: 'add' | 'move' | 'extract' | 'refactor' | 'remove' | ...,
      target: { type: 'function' | 'module' | 'file', name: string, moduleId?: string },
      confidence: number  // 0-1
    }
  ],
  conflicts: {
    hasConflicts: boolean,
    conflicts: [
      {
        type: string,
        severity: 'error' | 'warning',
        message: string,
        suggestedFix: string
      }
    ]
  },
  suggestions: [
    {
      intent: Intent,
      implementation: string,
      affectedFiles: string[],
      newFiles: string[],
      estimatedImpact: number
    }
  ],
  approved: boolean
}
```

### Constraint checks

The pipeline checks against all 6 declared constraint types: `no-import`, `must-use`, `no-call`, `layer`, `naming`, `max-files`. If the proposed change would violate any of them, it surfaces as a conflict with a suggested fix.

---

## Semantic Search

Find functions by natural-language description using local vector embeddings. No external API — runs entirely on-device.

### Setup

```bash
npm install @xenova/transformers
```

The model (`Xenova/all-MiniLM-L6-v2`, ~22MB) downloads once to `~/.cache/huggingface`.

### Usage

Exposed via the MCP tool `mikk_semantic_search`, or directly:

```typescript
import { SemanticSearcher } from '@getmikk/intent-engine'

const searcher = new SemanticSearcher(projectRoot)

// Build (or load from cache) embeddings for the lock
await searcher.index(lock)

// Find the 10 most semantically similar functions
const results = await searcher.search('validate a JWT token', lock, 10)
// Returns: [{ name, file, moduleId, purpose, lines, score }]
```

### How it works

1. For each function in the lock, concatenates: function name + purpose string (if present) + param names + return type
2. Generates embeddings in batches of 64 using the pipeline
3. Caches to `.mikk/embeddings.json` — fingerprinted by function count + first 20 sorted IDs
4. Cache is valid until the lock changes; recomputes only what changed
5. At search time, embeds the query and ranks all functions by cosine similarity

All vectors are unit-normalized at generation time so similarity is a simple dot product.

### Check availability

```typescript
const available = await SemanticSearcher.isAvailable()
// true if @xenova/transformers is installed and importable
```

The MCP server calls `isAvailable()` before registering the tool — if the package is missing, the tool is not exposed and the response explains how to install it.
