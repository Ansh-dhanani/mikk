# @getmikk/watcher

> Live file watcher daemon — incremental, debounced, atomic.

[![npm](https://img.shields.io/npm/v/@getmikk/watcher)](https://www.npmjs.com/package/@getmikk/watcher)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](../../LICENSE)

Background daemon that keeps `mikk.lock.json` in sync as you edit code. Detects file changes via chokidar, re-parses only what changed, updates the lock atomically, and emits typed events.

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
    console.log(`${event.data.changedNodes.length} nodes changed`)
  }
})

await daemon.start()
// ...
await daemon.stop()
```

---

## How It Works

### FileWatcher

Wraps chokidar. On any file change:
1. SHA-256 hashes the new content
2. Compares against stored hash — skips true no-ops (content unchanged despite mtime change)
3. Emits a typed `FileChangeEvent` with old hash, new hash, and change type

Hash store is seeded at startup from the lock file so first-change dedup works immediately.

### WatcherDaemon

- **Debounce** — collects changes for `debounceMs` (default 100ms), then flushes as a batch
- **Dedup** — if the same file changes twice in a batch, only the latest event is processed
- **Threshold** — batches under 15 files → incremental re-analysis; 15+ files → full re-analysis
- **Atomic writes** — lock written as temp file then renamed; zero corruption risk on crash
- **PID guard** — `.mikk/watcher.pid` prevents duplicate daemon instances
- **Sync state** — `.mikk/sync-state.json` tracks `clean | syncing | drifted | conflict`

### IncrementalAnalyzer

Re-parses only changed files and updates the lock. O(changed files), not O(whole repo).

Race condition handling: after parsing, re-hashes the file. If the hash changed during parsing (file was modified mid-read), retries up to 3 times before accepting the final state.

---

## Events

```typescript
type WatcherEvent =
  | { type: 'file:changed';  data: FileChangeEvent }
  | { type: 'graph:updated'; data: { changedNodes: string[]; impactedNodes: string[] } }
  | { type: 'sync:drifted';  data: { reason: string; affectedModules: string[] } }

type FileChangeEvent = {
  type: 'changed' | 'added' | 'deleted'
  path: string           // relative to project root
  oldHash: string | null
  newHash: string | null
  timestamp: number
  affectedModuleIds: string[]
}
```

---

## Sync State

| Status | Meaning |
|--------|---------|
| `clean` | Lock matches filesystem |
| `syncing` | Batch in progress |
| `drifted` | Analysis failed — lock is stale |
| `conflict` | Manual intervention needed |

The MCP server reads sync state to surface staleness warnings on every tool call.

---

## License

[Apache-2.0](../../LICENSE)
