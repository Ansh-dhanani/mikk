import { describe, test, expect, beforeEach } from 'bun:test'
import { ContextCache } from '../src/context-cache'
import type { ContextQuery } from '../src/types'

const mockContext = (id: string) => ({
    project: { name: 'test', language: 'typescript', description: 'test', moduleCount: 1, functionCount: 1 },
    modules: [{ id, name: 'test', description: 'test', functions: [], files: [] }],
    constraints: [],
    decisions: [],
    prompt: 'test',
    meta: { seedCount: 1, totalFunctionsConsidered: 1, selectedFunctions: 1, estimatedTokens: 100, keywords: ['test'] },
})

const mockQuery = (id: string): ContextQuery => ({
    task: `task ${id}`,
})

describe('ContextCache', () => {
    let cache: ContextCache

    beforeEach(() => {
        cache = new ContextCache({ maxSize: 100, ttlMs: 1000 * 60 })
    })

    describe('basic operations', () => {
        test('stores and retrieves context', () => {
            const query = mockQuery('1')
            const context = mockContext('1')
            
            cache.set(query, context as any)
            const retrieved = cache.get(query)
            
            expect(retrieved).not.toBeNull()
            expect(retrieved?.modules[0].id).toBe('1')
        })

        test('returns null for non-existent query', () => {
            const retrieved = cache.get(mockQuery('nonexistent'))
            expect(retrieved).toBeNull()
        })

        test('checks existence with has()', () => {
            const query = mockQuery('1')
            const context = mockContext('1')
            
            expect(cache.has(query)).toBe(false)
            cache.set(query, context as any)
            expect(cache.has(query)).toBe(true)
        })

        test('updates access count on get', () => {
            const query = mockQuery('1')
            const context = mockContext('1')
            
            cache.set(query, context as any)
            cache.get(query)
            cache.get(query)
            cache.get(query)
            
            const stats = cache.getStats()
            expect(stats.hits).toBe(3)
        })
    })

    describe('LRU eviction', () => {
        test('evicts least recently used when max size exceeded', () => {
            const smallCache = new ContextCache({ maxSize: 3, ttlMs: 1000 * 60 })
            
            for (let i = 0; i < 5; i++) {
                smallCache.set(mockQuery(String(i)), mockContext(String(i)) as any)
            }
            
            expect(smallCache.getStats().size).toBe(3)
            expect(smallCache.get(mockQuery('0'))).toBeNull()
            expect(smallCache.get(mockQuery('4'))).not.toBeNull()
        })

        test('evicts least recently used when adding new entry', () => {
            const smallCache = new ContextCache({ maxSize: 3, ttlMs: 1000 * 60 })
            
            for (let i = 0; i < 3; i++) {
                smallCache.set(mockQuery(String(i)), mockContext(String(i)) as any)
            }
            
            smallCache.set(mockQuery('3'), mockContext('3') as any)
            
            expect(smallCache.getStats().size).toBe(3)
            
            const remaining = [0, 1, 2, 3].filter(i => smallCache.get(mockQuery(String(i))) !== null)
            expect(remaining.length).toBe(3)
            expect(remaining).toContain(3)
        })
    })

    describe('TTL expiration', () => {
        test('expires entries after TTL', async () => {
            const ttlCache = new ContextCache({ maxSize: 100, ttlMs: 50 })
            
            ttlCache.set(mockQuery('1'), mockContext('1') as any)
            expect(ttlCache.has(mockQuery('1'))).toBe(true)
            
            await new Promise(resolve => setTimeout(resolve, 60))
            
            expect(ttlCache.has(mockQuery('1'))).toBe(false)
        })

        test('tracks evictions due to TTL', async () => {
            const ttlCache = new ContextCache({ maxSize: 100, ttlMs: 100 })
            
            ttlCache.set(mockQuery('1'), mockContext('1') as any)
            await new Promise(resolve => setTimeout(resolve, 150))
            
            const result = ttlCache.get(mockQuery('1'))
            
            expect(result).toBeNull()
            const stats = ttlCache.getStats()
            expect(stats.evictions).toBe(1)
        })
    })

    describe('invalidation', () => {
        test('invalidates all entries without pattern', () => {
            for (let i = 0; i < 5; i++) {
                cache.set(mockQuery(String(i)), mockContext(String(i)) as any)
            }
            
            const count = cache.invalidate()
            expect(count).toBe(5)
            expect(cache.getStats().size).toBe(0)
        })

        test('invalidates entries matching pattern', () => {
            cache.set({ task: 'login flow' } as any, mockContext('1') as any)
            cache.set({ task: 'auth check' } as any, mockContext('2') as any)
            cache.set({ task: 'parser logic' } as any, mockContext('3') as any)
            
            const count = cache.invalidate(/login|auth/)
            expect(count).toBe(2)
            expect(cache.getStats().size).toBe(1)
        })

        test('invalidates by regex pattern on task text', () => {
            cache.set({ task: 'fix bug in auth' } as any, mockContext('1') as any)
            cache.set({ task: 'fix bug in parser' } as any, mockContext('2') as any)
            
            const count = cache.invalidate(/fix/)
            expect(count).toBe(2)
        })
    })

    describe('stats tracking', () => {
        test('tracks hits and misses correctly', () => {
            cache.set(mockQuery('1'), mockContext('1') as any)
            
            cache.get(mockQuery('1'))
            cache.get(mockQuery('1'))
            cache.get(mockQuery('nonexistent'))
            
            const stats = cache.getStats()
            expect(stats.hits).toBe(2)
            expect(stats.misses).toBe(1)
            expect(stats.hitRate).toBeCloseTo(0.666, 1)
        })

        test('calculates hit rate as 0 when no requests', () => {
            const stats = cache.getStats()
            expect(stats.hitRate).toBe(0)
        })
    })

    describe('clear', () => {
        test('clears all entries and resets stats', () => {
            for (let i = 0; i < 5; i++) {
                cache.set(mockQuery(String(i)), mockContext(String(i)) as any)
            }
            cache.get(mockQuery('1'))
            
            cache.clear()
            
            const stats = cache.getStats()
            expect(stats.size).toBe(0)
            expect(stats.hits).toBe(0)
            expect(stats.misses).toBe(0)
        })
    })

    describe('warmup', () => {
        test('warms cache with multiple queries', () => {
            const queries = [mockQuery('1'), mockQuery('2'), mockQuery('3')]
            const builder = (q: ContextQuery) => mockContext(q.task.split(' ')[1]) as any
            
            cache.warmup(queries, builder)
            
            expect(cache.getStats().size).toBe(3)
        })

        test('skips already cached entries during warmup', () => {
            cache.set(mockQuery('1'), mockContext('1') as any)
            
            const queries = [mockQuery('1'), mockQuery('2')]
            const builder = (q: ContextQuery) => mockContext(q.task.split(' ')[1]) as any
            
            let buildCount = 0
            const countingBuilder = (q: ContextQuery) => {
                buildCount++
                return builder(q)
            }
            
            cache.warmup(queries, countingBuilder)
            
            expect(buildCount).toBe(1)
        })
    })

    describe('edge cases', () => {
        test('handles empty query', () => {
            const emptyQuery = {} as ContextQuery
            cache.set(emptyQuery, mockContext('1') as any)
            expect(cache.has(emptyQuery)).toBe(true)
        })

        test('handles query with special characters', () => {
            const specialQuery = { task: 'test <>&"\'/\\' } as ContextQuery
            cache.set(specialQuery, mockContext('1') as any)
            expect(cache.has(specialQuery)).toBe(true)
        })

        test('handles very long query', () => {
            const longTask = 'a'.repeat(10000)
            const longQuery = { task: longTask } as ContextQuery
            cache.set(longQuery, mockContext('1') as any)
            expect(cache.has(longQuery)).toBe(true)
        })

        test('handles query with unicode', () => {
            const unicodeQuery = { task: '测试函数 🔥🚀' } as ContextQuery
            cache.set(unicodeQuery, mockContext('1') as any)
            expect(cache.has(unicodeQuery)).toBe(true)
        })

        test('handles duplicate queries with different properties', () => {
            const query1 = { task: 'test', maxFunctions: 10 } as ContextQuery
            const query2 = { task: 'test', maxFunctions: 20 } as ContextQuery
            
            cache.set(query1, mockContext('1') as any)
            cache.set(query2, mockContext('2') as any)
            
            expect(cache.getStats().size).toBe(2)
        })

        test('handles cache with maxSize of 1', () => {
            const singleCache = new ContextCache({ maxSize: 1, ttlMs: 1000 * 60 })
            
            singleCache.set(mockQuery('1'), mockContext('1') as any)
            singleCache.set(mockQuery('2'), mockContext('2') as any)
            
            expect(singleCache.getStats().size).toBe(1)
            expect(singleCache.get(mockQuery('1'))).toBeNull()
            expect(singleCache.get(mockQuery('2'))).not.toBeNull()
        })

        test('handles concurrent access', async () => {
            const promises = Array.from({ length: 100 }, (_, i) =>
                Promise.resolve().then(() => {
                    cache.set(mockQuery(String(i)), mockContext(String(i)) as any)
                    return cache.get(mockQuery(String(i)))
                })
            )
            
            const results = await Promise.all(promises)
            expect(results.every(r => r !== null)).toBe(true)
        })
    })
})
