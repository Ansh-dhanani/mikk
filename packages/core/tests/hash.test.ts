import { describe, it, expect } from 'bun:test'
import { hashContent, hashFunctionBody } from '../src/hash/file-hasher'
import { computeModuleHash, computeRootHash } from '../src/hash/tree-hasher'

describe('hashContent', () => {
    it('produces consistent hashes', () => {
        expect(hashContent('hello')).toBe(hashContent('hello'))
    })

    it('produces different hashes for different content', () => {
        expect(hashContent('hello')).not.toBe(hashContent('world'))
    })

    it('returns 64 character hex string (SHA-256)', () => {
        const hash = hashContent('test')
        expect(hash.length).toBe(64)
        expect(hash).toMatch(/^[a-f0-9]{64}$/)
    })
})

describe('hashFunctionBody', () => {
    it('hashes specific line range', () => {
        const content = 'line1\nline2\nline3\nline4\nline5'
        const hash = hashFunctionBody(content, 2, 4)
        expect(hash).toBe(hashContent('line2\nline3\nline4'))
    })
})

describe('computeModuleHash', () => {
    it('produces consistent hash regardless of input order', () => {
        const hash1 = computeModuleHash(['abc', 'def', 'ghi'])
        const hash2 = computeModuleHash(['ghi', 'abc', 'def'])
        expect(hash1).toBe(hash2)
    })

    it('changes when any file hash changes', () => {
        const hash1 = computeModuleHash(['abc', 'def'])
        const hash2 = computeModuleHash(['abc', 'xyz'])
        expect(hash1).not.toBe(hash2)
    })
})

describe('computeRootHash', () => {
    it('produces consistent hash', () => {
        const hash1 = computeRootHash({ auth: 'abc', payments: 'def' })
        const hash2 = computeRootHash({ payments: 'def', auth: 'abc' })
        expect(hash1).toBe(hash2)
    })
})
