# @getmikk/ai-context

> Token-budgeted AI context builder and `claude.md` / `AGENTS.md` generator.

[![npm](https://img.shields.io/npm/v/@getmikk/ai-context)](https://www.npmjs.com/package/@getmikk/ai-context)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](../../LICENSE)

Two things: a graph-traced context builder that packs the most relevant functions into a token budget for any given task, and a generator that produces always-accurate `claude.md` and `AGENTS.md` files from the lock file.

> Part of [Mikk](../../README.md) — live architectural context for your AI agent.

---

## Context Builder

Given a task description, BFS-traces the dependency graph from matched seed functions and returns the most relevant context within a configurable token budget.

```typescript
import { ContextBuilder, getProvider } from '@getmikk/ai-context'

const builder = new ContextBuilder(contract, lock, projectRoot)

const ctx = builder.build({
  task: 'Add rate limiting to all API routes',
  maxHops: 4,
  tokenBudget: 6000,
  focusModules: ['api'],
  includeCallGraph: true,
  includeBodies: true,
})

const formatter = getProvider('claude')    // XML tags for Claude
// const formatter = getProvider('generic')   // plain text
// const formatter = getProvider('compact')   // minimal tokens

const output = formatter.formatContext(ctx)
```

### How it works

1. **Seed** — task keywords matched against function names, module descriptions, and file paths using BM25 + fuzzy matching
2. **Walk** — BFS from seed nodes, following call graph edges outward up to `maxHops` (default 4, max 12)
3. **Score** — each function scored by: graph proximity, keyword match, entry-point bonus, module relevance
4. **Budget** — greedy knapsack: highest-scoring functions packed until token budget is consumed
5. **Format** — serialized with function bodies, params, return types, call graph edges, and file locations

### Strict mode

Pass `relevanceMode: 'strict'` to restrict results to exact keyword matches only. Set `autoFallback: true` (default) to retry balanced mode when strict returns nothing.

---

## `claude.md` / `AGENTS.md` Generator

Generates tiered AI context files from the lock file. Every piece of content is derived from parsed source — never hand-authored, never stale.

```typescript
import { ClaudeMdGenerator } from '@getmikk/ai-context'

const generator = new ClaudeMdGenerator(
  contract,
  lock,
  12000,        // token budget
  packageJson,  // from package.json scripts/dependencies
  projectRoot
)

const content = generator.generate()
// Write to claude.md and AGENTS.md
```

### Tiered output

Content is added in priority order until the token budget is consumed:

| Tier | Content | Always included? |
|------|---------|-----------------|
| 1 | Project summary — name, description, module list, stats, constraints | Yes |
| — | Tech stack — detected frameworks, runtime, build tool | If detectable |
| — | Build/test commands — from `package.json` scripts | If present |
| 2 | Per-module detail — exported API, key functions, internal call summary | Until budget |
| — | Context files — discovered schemas, configs, data models | If budget allows |
| — | Import graph — cross-file relationships per module | If budget allows |
| — | HTTP routes — detected routes with method, path, handler | If budget allows |
| 3 | Constraints — all declared rules | If budget allows |
| — | ADR decisions — architectural decisions with reasons | If budget allows |

Modules with zero functions are skipped. Token estimation uses ~4 chars/token.

---

## Semantic Search

Local vector embeddings for natural-language function search. Runs entirely on-device.

**Default provider:** `Xenova/all-MiniLM-L6-v2` via `@xenova/transformers` (~22MB, downloads once to `~/.cache/huggingface`).

```typescript
import { SemanticSearcher } from '@getmikk/intent-engine'

const available = await SemanticSearcher.isAvailable()
// true only if @xenova/transformers is installed

const searcher = new SemanticSearcher(projectRoot)
await searcher.index(lock)

const results = await searcher.search('validate a JWT token', lock, 10)
```

No API key or internet connection required after the initial model download. Embeddings are cached to `.mikk/embeddings.json` and only recomputed when the lock changes.

---

## Direct Search

O(1) lookups against a prebuilt name/signature/location index:

```typescript
import { DirectSearchEngine } from '@getmikk/core'

const engine = new DirectSearchEngine(lock)

engine.getExactMatch('parseToken')           // exact name
engine.findBySignature('login(email: string): User')  // full signature
engine.findByLocation('src/auth/login.ts', 42)         // file + line
engine.findSimilar({ name: 'verifyToken' }, 5)         // fuzzy, top 5
```

---

## License

[Apache-2.0](../../LICENSE)
