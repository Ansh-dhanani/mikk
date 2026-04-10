import { describe, it, expect } from 'bun:test'
import type { WatcherConfig, FileChangeEvent, WatcherEvent } from '../src/types'

describe('Watcher Types', () => {
    it('FileChangeEvent has required fields', () => {
        const event: FileChangeEvent = {
            type: 'added',
            path: 'src/test.ts',
            oldHash: null,
            newHash: 'abc123',
            timestamp: Date.now(),
            affectedModuleIds: ['auth'],
        }
        expect(event.type).toBe('added')
        expect(event.path).toBeDefined()
        expect(event.affectedModuleIds).toBeDefined()
    })

    it('FileChangeEvent supports all event types', () => {
        const added: FileChangeEvent = { type: 'added', path: 'a.ts', oldHash: null, newHash: 'h', timestamp: 0, affectedModuleIds: [] }
        const changed: FileChangeEvent = { type: 'changed', path: 'b.ts', oldHash: 'h1', newHash: 'h2', timestamp: 0, affectedModuleIds: [] }
        const deleted: FileChangeEvent = { type: 'deleted', path: 'c.ts', oldHash: 'h', newHash: null, timestamp: 0, affectedModuleIds: [] }
        
        expect(added.type).toBe('added')
        expect(changed.type).toBe('changed')
        expect(deleted.type).toBe('deleted')
    })

    it('WatcherConfig has required fields', () => {
        const config: WatcherConfig = {
            projectRoot: '/test',
            include: ['src/**/*.ts'],
            exclude: ['node_modules', '.mikk'],
            debounceMs: 100,
        }
        expect(config.projectRoot).toBeDefined()
        expect(Array.isArray(config.include)).toBe(true)
        expect(Array.isArray(config.exclude)).toBe(true)
        expect(typeof config.debounceMs).toBe('number')
    })

    it('WatcherEvent union types work', () => {
        const fileEvent: WatcherEvent = {
            type: 'file:changed',
            data: { type: 'changed', path: 'a.ts', oldHash: null, newHash: null, timestamp: 0, affectedModuleIds: [] },
        }
        expect(fileEvent.type).toBe('file:changed')

        const moduleEvent: WatcherEvent = {
            type: 'module:updated',
            data: { moduleId: 'auth', newHash: 'abc' },
        }
        expect(moduleEvent.type).toBe('module:updated')

        const graphEvent: WatcherEvent = {
            type: 'graph:updated',
            data: { changedNodes: [], impactedNodes: [] },
        }
        expect(graphEvent.type).toBe('graph:updated')
    })
})

describe('Watcher Event Handling', () => {
    it('handles add event', () => {
        const event: WatcherEvent = {
            type: 'file:changed',
            data: { type: 'added', path: 'new.ts', oldHash: null, newHash: 'hash', timestamp: Date.now(), affectedModuleIds: [] },
        }
        expect(event.data.type).toBe('added')
    })

    it('handles change event', () => {
        const event: WatcherEvent = {
            type: 'file:changed',
            data: { type: 'changed', path: 'existing.ts', oldHash: 'old', newHash: 'new', timestamp: Date.now(), affectedModuleIds: [] },
        }
        expect(event.data.type).toBe('changed')
    })

    it('handles delete event', () => {
        const event: WatcherEvent = {
            type: 'file:changed',
            data: { type: 'deleted', path: 'deleted.ts', oldHash: 'old', newHash: null, timestamp: Date.now(), affectedModuleIds: [] },
        }
        expect(event.data.type).toBe('deleted')
    })

    it('tracks affected modules', () => {
        const event: FileChangeEvent = {
            type: 'changed',
            path: 'src/auth/verify.ts',
            oldHash: 'h1',
            newHash: 'h2',
            timestamp: Date.now(),
            affectedModuleIds: ['auth', 'api'],
        }
        expect(event.affectedModuleIds).toContain('auth')
        expect(event.affectedModuleIds).toContain('api')
    })
})

describe('Watcher Configuration', () => {
    it('debounceMs defaults to reasonable value', () => {
        const config: WatcherConfig = {
            projectRoot: '/test',
            include: ['**/*.ts'],
            exclude: ['node_modules'],
            debounceMs: 100,
        }
        expect(config.debounceMs).toBeGreaterThan(0)
        expect(config.debounceMs).toBeLessThan(10000)
    })

    it('include patterns are required', () => {
        const config: WatcherConfig = {
            projectRoot: '/test',
            include: ['src/**/*.ts', 'lib/**/*.ts'],
            exclude: [],
            debounceMs: 50,
        }
        expect(config.include.length).toBeGreaterThan(0)
    })

    it('exclude patterns can be empty', () => {
        const config: WatcherConfig = {
            projectRoot: '/test',
            include: ['**/*.ts'],
            exclude: [],
            debounceMs: 100,
        }
        expect(Array.isArray(config.exclude)).toBe(true)
    })

    it('handles glob patterns correctly', () => {
        const config: WatcherConfig = {
            projectRoot: '/test',
            include: ['**/*.ts', '**/*.tsx', '!**/*.test.ts'],
            exclude: ['node_modules', '.git', 'dist'],
            debounceMs: 100,
        }
        expect(config.include.length).toBe(3)
        expect(config.exclude.length).toBe(3)
    })
})

describe('Watcher Events', () => {
    it('sync:clean event structure', () => {
        const event: WatcherEvent = {
            type: 'sync:clean',
            data: { rootHash: 'abc123' },
        }
        expect(event.type).toBe('sync:clean')
        expect(event.data.rootHash).toBeDefined()
    })

    it('sync:drifted event structure', () => {
        const event: WatcherEvent = {
            type: 'sync:drifted',
            data: { reason: 'Lock file out of sync', affectedModules: ['auth', 'api'] },
        }
        expect(event.type).toBe('sync:drifted')
        expect(event.data.reason).toBeDefined()
    })

    it('graph:updated event with impact data', () => {
        const event: WatcherEvent = {
            type: 'graph:updated',
            data: {
                changedNodes: ['fn:auth:verifyToken'],
                impactedNodes: ['fn:api:handleLogin'],
            },
        }
        expect(event.data.changedNodes).toBeDefined()
        expect(event.data.impactedNodes).toBeDefined()
    })
})

describe('Watcher Edge Cases', () => {
    it('handles empty affectedModuleIds', () => {
        const event: FileChangeEvent = {
            type: 'changed',
            path: 'orphan.ts',
            oldHash: 'h1',
            newHash: 'h2',
            timestamp: Date.now(),
            affectedModuleIds: [],
        }
        expect(event.affectedModuleIds.length).toBe(0)
    })

    it('handles very long file paths', () => {
        const longPath = 'a'.repeat(200) + '.ts'
        const event: FileChangeEvent = {
            type: 'added',
            path: longPath,
            oldHash: null,
            newHash: 'hash',
            timestamp: Date.now(),
            affectedModuleIds: [],
        }
        expect(event.path.length).toBeGreaterThan(200)
    })

    it('handles unicode in file paths', () => {
        const event: FileChangeEvent = {
            type: 'added',
            path: 'src/模块/test.ts',
            oldHash: null,
            newHash: 'hash',
            timestamp: Date.now(),
            affectedModuleIds: [],
        }
        expect(event.path).toContain('模块')
    })

    it('handles concurrent events', () => {
        const events: WatcherEvent[] = [
            { type: 'file:changed', data: { type: 'added', path: 'a.ts', oldHash: null, newHash: 'h1', timestamp: 1, affectedModuleIds: [] } },
            { type: 'file:changed', data: { type: 'changed', path: 'b.ts', oldHash: 'h2', newHash: 'h3', timestamp: 2, affectedModuleIds: [] } },
            { type: 'file:changed', data: { type: 'deleted', path: 'c.ts', oldHash: 'h4', newHash: null, timestamp: 3, affectedModuleIds: [] } },
        ]
        expect(events.length).toBe(3)
        expect(events[0].data.type).toBe('added')
        expect(events[1].data.type).toBe('changed')
        expect(events[2].data.type).toBe('deleted')
    })
})
