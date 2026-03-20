# @getmikk/watcher

> Live file watcher daemon — incremental, debounced, atomic.

[![npm](https://img.shields.io/npm/v/@getmikk/watcher)](https://www.npmjs.com/package/@getmikk/watcher)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](../../LICENSE)

Background daemon that keeps `mikk.lock.json` in sync as you edit code. Detects file changes via chokidar, re-parses only what changed, updates the lock atomically, and emits typed events for downstream consumers.

> Part of [Mikk](../../README.md) — live architectural context for your AI agent.

---

## Usage

Started via the CLI:

```bash
mikk watch
```

Or programmatically:

```typescript
import { WatcherDaemon } from '@getmikk/watcher'

const daemon = new WatcherDaemon({
  projectRoot: '/path/to/project',
  include: ['**/*.ts', '**/*.tsx'],
  exclude: ['**/node_modules/**', '**/dist/**'],
  debounceMs: 100,
})

daemon.on((event) => {
  if (event.type === 'graph:updated') {
    console.log(`Graph updated: ${event.data.changedNodes.length} changed`)
  }
})

await daemon.start()
```

---

## How It Works

### FileWatcher

Wraps chokidar. Watches `.ts` and `.tsx` files (configurable). On change:
1. Computes a SHA-256 hash of the new file content
2. Compares against the stored hash — skips true no-ops (content unchanged)
3. Emits a typed `FileChangeEvent` with old hash, new hash, and change type

Hash store is seeded at startup from the lock file so first-change dedup works correctly from the beginning.

### WatcherDaemon

Orchestrates everything:

- **Debounce** — collects file change events for 100ms, then flushes as a batch
- **Deduplication** — if the same file changes twice in a batch, only the latest event is kept
- **Batch threshold** — batches under 15 files → incremental analysis; 15+ files → full re-analysis
- **Atomic writes** — lock file written as temp file then renamed; zero corruption risk on crash
- **PID file** — `.mikk/watcher.pid` prevents duplicate daemon instances
- **Sync state** — `.mikk/sync-state.json` tracks `clean | syncing | drifted | conflict`

### IncrementalAnalyzer

Re-parses only changed files, updates graph nodes, and recompiles the lock. O(changed files), not O(whole repo).

**Race condition handling:** after parsing a file, re-hashes it. If the hash changed during the parse (file was modified while being read), re-parses up to 3 times. Accepts final state after retries are exhausted.

**Full re-analysis path:** triggered when batch size exceeds 15 files (e.g. `git checkout`, bulk rename). Re-parses all changed files in parallel, rebuilds the full graph, recompiles the lock.

---

## Events

```typescript
type WatcherEvent =
  | { type: 'file:changed'; data: FileChangeEvent }
  | { type: 'graph:updated'; data: { changedNodes: string[]; impactedNodes: string[] } }
  | { type: 'sync:drifted'; data: { reason: string; affectedModules: string[] } }

type FileChangeEvent = {
  type: 'changed' | 'added' | 'deleted'
  path: string         // relative to project root
  oldHash: string | null
  newHash: string | null
  timestamp: number
  affectedModuleIds: string[]
}
```

---

## Sync State

Written atomically to `.mikk/sync-state.json` on every transition:

| Status | Meaning |
|--------|---------|
| `clean` | Lock file matches filesystem |
| `syncing` | Batch in progress |
| `drifted` | Analysis failed — lock is stale |
| `conflict` | Manual intervention needed |

The MCP server reads sync state to surface staleness warnings on every tool call.
