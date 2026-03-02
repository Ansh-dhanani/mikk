# @getmikk/watcher

> Chokidar-powered file watcher daemon with incremental analysis, debouncing, race-condition protection, and atomic lock file updates.

[![npm](https://img.shields.io/npm/v/@getmikk/watcher)](https://www.npmjs.com/package/@getmikk/watcher)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](../../LICENSE)

`@getmikk/watcher` keeps the `mikk.lock.json` file in sync with your codebase in real time. When files change, the watcher debounces events, incrementally re-parses only the affected files, updates the dependency graph, recomputes Merkle hashes, and writes the lock file atomically — all without requiring a full re-analysis.

---

## Installation

```bash
npm install @getmikk/watcher
# or
bun add @getmikk/watcher
```

**Peer dependency:** `@getmikk/core`

---

## Quick Start

```typescript
import { WatcherDaemon } from '@getmikk/watcher'

const daemon = new WatcherDaemon({
  projectRoot: process.cwd(),
  include: ['src/**/*.ts', 'src/**/*.tsx'],
  exclude: ['node_modules', 'dist', '.mikk'],
  debounceMs: 100,
})

daemon.on((event) => {
  switch (event.type) {
    case 'file:changed':
      console.log(`Changed: ${event.path}`)
      break
    case 'graph:updated':
      console.log('Dependency graph rebuilt')
      break
    case 'sync:clean':
      console.log('Lock file is in sync')
      break
    case 'sync:drifted':
      console.log('Lock file has drifted')
      break
  }
})

await daemon.start()
// Lock file is now kept in sync automatically

// Later...
await daemon.stop()
```

---

## Architecture

```
Filesystem Events (Chokidar)
        │
        ▼
  ┌─────────────┐
  │ FileWatcher  │  ← Hash computation, deduplication
  └──────┬──────┘
         │  FileChangeEvent[]
         ▼
  ┌──────────────────┐
  │ WatcherDaemon    │  ← Debouncing (100ms), batching
  └──────┬───────────┘
         │  Batch of events
         ▼
  ┌─────────────────────┐
  │ IncrementalAnalyzer  │  ← Re-parse, graph patch, hash update
  └──────────┬──────────┘
             │
             ▼
    Atomic lock file write
```

---

## API Reference

### WatcherDaemon

The main entry point — a long-running process that keeps the lock file in sync.

```typescript
import { WatcherDaemon } from '@getmikk/watcher'

const daemon = new WatcherDaemon(config)
```

**`WatcherConfig`:**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `projectRoot` | `string` | — | Absolute path to the project |
| `include` | `string[]` | `['**/*.ts']` | Glob patterns for watched files |
| `exclude` | `string[]` | `['node_modules']` | Glob patterns to ignore |
| `debounceMs` | `number` | `100` | Debounce window in milliseconds |

**Methods:**

| Method | Description |
|--------|-------------|
| `start()` | Start watching. Creates PID file at `.mikk/watcher.pid` for single-instance enforcement |
| `stop()` | Stop watching. Cleans up PID file |
| `on(handler)` | Register event handler |

**Features:**

- **Debouncing** — Batches rapid file changes (e.g., save-all) into a single analysis pass
- **PID file** — Prevents multiple watcher instances via `.mikk/watcher.pid`
- **Atomic writes** — Lock file is written atomically to prevent corruption
- **Sync state** — Emits `sync:clean` or `sync:drifted` after each cycle

---

### FileWatcher

Lower-level wrapper around Chokidar with hash-based change detection:

```typescript
import { FileWatcher } from '@getmikk/watcher'

const watcher = new FileWatcher(config)

watcher.on((event) => {
  console.log(event.type)       // 'added' | 'changed' | 'deleted'
  console.log(event.path)       // Absolute file path
  console.log(event.oldHash)    // Previous content hash (undefined for 'added')
  console.log(event.newHash)    // New content hash (undefined for 'deleted')
  console.log(event.timestamp)  // Event timestamp
  console.log(event.affectedModuleIds) // Modules containing this file
})

await watcher.start()

// Seed with known hashes to detect only actual content changes
watcher.setHash('/src/index.ts', 'abc123...')

await watcher.stop()
```

**Hash-based deduplication:** Even if the OS reports a file change, the watcher computes a SHA-256 hash and only emits an event if the content actually changed. This prevents redundant re-analysis from editor auto-saves or format-on-save.

---

### IncrementalAnalyzer

Incrementally updates the dependency graph and lock file for a batch of changed files:

```typescript
import { IncrementalAnalyzer } from '@getmikk/watcher'

const analyzer = new IncrementalAnalyzer(graph, lock, contract, projectRoot)

const result = await analyzer.analyzeBatch(events)

console.log(result.graph)        // Updated DependencyGraph
console.log(result.lock)         // Updated MikkLock
console.log(result.impactResult) // ImpactResult from @getmikk/core
console.log(result.mode)         // 'incremental' | 'full'
```

**How it works:**

1. **Small batches (≤15 files)** → Incremental mode:
   - Re-parse only changed files
   - Patch the existing graph (remove old nodes/edges, add new ones)
   - Recompute affected hashes only
   - Run impact analysis on changed nodes

2. **Large batches (>15 files)** → Full re-analysis:
   - Re-parse all files from scratch
   - Rebuild entire graph
   - Recompute all hashes

**Race-condition protection:** After parsing a file, the analyzer re-hashes it. If the hash changed during parsing (the file was modified again), it retries up to 3 times before falling back to the latest parsed version.

---

### Events

All events emitted through the `on()` handler:

```typescript
type WatcherEvent =
  | { type: 'file:changed'; event: FileChangeEvent }
  | { type: 'module:updated'; moduleId: string }
  | { type: 'graph:updated'; stats: { nodes: number; edges: number } }
  | { type: 'sync:clean' }
  | { type: 'sync:drifted'; driftedModules: string[] }
```

**`FileChangeEvent`:**

```typescript
type FileChangeEvent = {
  type: 'added' | 'changed' | 'deleted'
  path: string
  oldHash?: string
  newHash?: string
  timestamp: number
  affectedModuleIds: string[]
}
```

---

## Usage with the CLI

The `mikk watch` command starts the watcher daemon:

```bash
mikk watch
# Watching src/**/*.ts, src/**/*.tsx...
# [sync:clean] Lock file is up to date
# [file:changed] src/auth/login.ts
# [graph:updated] 142 nodes, 87 edges
# [sync:clean] Lock file updated
```

Press `Ctrl+C` to stop.

---

## Single-Instance Enforcement

The daemon writes a PID file to `.mikk/watcher.pid` on start and removes it on stop. If another watcher is already running, `start()` will throw an error. This prevents multiple watchers from fighting over the lock file.

```typescript
try {
  await daemon.start()
} catch (err) {
  if (err.message.includes('already running')) {
    console.log('Another watcher is already running')
  }
}
```

---

## Types

```typescript
import type {
  FileChangeEvent,
  WatcherConfig,
  WatcherEvent,
} from '@getmikk/watcher'
```

---

## License

[Apache-2.0](../../LICENSE)
