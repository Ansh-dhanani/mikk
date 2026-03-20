# @getmikk/ai-context

> Token-budgeted AI context builder and claude.md / AGENTS.md generator.

[![npm](https://img.shields.io/npm/v/@getmikk/ai-context)](https://www.npmjs.com/package/@getmikk/ai-context)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](../../LICENSE)

Two things: a graph-traced context builder that packs the most relevant functions into a token budget for any given task, and a documentation generator that produces always-accurate `claude.md` and `AGENTS.md` files from the lock file.

> Part of [Mikk](../../README.md) — live architectural context for your AI agent.

---

## Context Builder

Given a task description, BFS-traces the dependency graph from matched seed functions and returns the most relevant context within a configurable token budget.

### Usage

```typescript
import { ContextBuilder, getProvider } from '@getmikk/ai-context'

const builder = new ContextBuilder(contract, lock)

const ctx = builder.build({
  task: 'Add rate limiting to all API routes',
  maxHops: 4,
  tokenBudget: 6000,
  focusModules: ['api-gateway'],
  includeCallGraph: true,
  includeBodies: true,
  projectRoot: '/path/to/project',
})

// Format for your AI client
const formatter = getProvider('claude')   // XML tags
// const formatter = getProvider('generic')  // plain text
// const formatter = getProvider('compact')  // minimal tokens

const output = formatter.formatContext(ctx)
```

### How context is built

1. **Seed** — match task keywords against function names, module descriptions, and file paths
2. **Walk** — BFS from seed nodes, following call graph edges outward up to `maxHops` depth
3. **Score** — each function scored by: proximity to seed (depth penalty), keyword match bonus, entry-point bonus
4. **Budget** — greedy knapsack: highest-scoring functions added until token budget is consumed
5. **Format** — serialized with function bodies, params, return types, call graph, and file locations

The result is surgical — agents get exactly the functions relevant to their task, not the entire codebase.

---

## claude.md / AGENTS.md Generator

Generates `claude.md` and `AGENTS.md` automatically during `mikk init` and `mikk analyze`. Every piece of content is derived from the AST-parsed lock file — never hand-authored, never stale.

### Usage

```typescript
import { ClaudeMdGenerator } from '@getmikk/ai-context'

const generator = new ClaudeMdGenerator(
  contract,
  lock,
  12000,   // token budget
  {        // from package.json
    description: 'Multi-channel AI gateway',
    scripts: { build: 'bun run build', test: 'vitest' },
    dependencies: { ... },
  },
  projectRoot
)

const content = generator.generate()
// Write to claude.md and AGENTS.md
```

### Tiered output

Content is generated in priority order until the token budget (default 12,000) is consumed:

| Tier | Content | Always included? |
|------|---------|-----------------|
| 1 | Project summary — name, description, module list with function counts, stats, critical constraints | Yes |
| — | Tech stack — detected frameworks, runtime, build tool | If detectable |
| — | Build/test/run commands — from package.json scripts | If present |
| 2 | Per-module detail — exported API, key functions, internal call summary (~300 tokens/module) | Until budget |
| — | Context files — discovered schemas, configs, data models | If budget allows |
| — | Import graph — cross-file import relationships per module | If budget allows |
| — | HTTP routes — detected routes with method, path, handler | If budget allows |
| 3 | Constraints — all declared constraint rules | If budget allows |
| — | ADR decisions — architectural decisions with reasons | If budget allows |

Modules with zero functions are skipped entirely.

### Token estimation

Uses a ~4 chars/token approximation. The generator stops adding sections the moment adding the next section would exceed the budget, so the output always fits within the specified window.
