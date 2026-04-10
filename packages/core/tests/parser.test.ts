import { describe, it, expect } from 'bun:test'
import { TypescriptExtractor } from '../src/parser/oxc-parser'
import { LanguageRegistry } from '../src/parser/index'

const _TreeSitterParser = { parse: () => Promise.resolve({}) }
const _UnsupportedLanguageError = class extends Error {}

describe('Unified Parser Integration', () => {
    describe('TypescriptExtractor (OXC)', () => {
        it('extracts function declarations and calls', async () => {
            const extractor = new TypescriptExtractor()
            const result = await extractor.extract('src/auth.ts', `
                import { jwtDecode } from './jwt'
                export function verifyToken(token: string) {
                    return jwtDecode(token).exp > Date.now()
                }
            `)
            expect(result.functions).toHaveLength(1)
            expect(result.functions[0].name).toBe('verifyToken')
            expect(result.functions[0].calls.some(c => c.name === 'jwtDecode')).toBe(true)
        })

        it('extracts class methods', async () => {
            const extractor = new TypescriptExtractor()
            const result = await extractor.extract('src/service.ts', `
                export class AuthService {
                    verify(token: string): boolean { return true }
                }
            `)
            expect(result.classes).toHaveLength(1)
            expect(result.classes[0].name).toBe('AuthService')
            expect(result.classes[0].methods[0].name).toBe('AuthService.verify')
        })
    })

    describe('LanguageRegistry Dispatch', () => {
        it('dispatches to OXC for TypeScript/JavaScript', () => {
            const registry = LanguageRegistry.getInstance()
            const ts = registry.getForFile('test.ts')
            const js = registry.getForFile('test.js')
            expect(ts?.name).toBe('typescript')
            expect(js?.name).toBe('javascript')
            expect(ts?.extractor).toBeInstanceOf(TypescriptExtractor)
        })

        it('dispatches to TreeSitter for other languages', () => {
            const registry = LanguageRegistry.getInstance()
            const py = registry.getForFile('test.py')
            expect(py?.name).toBe('python')
            // TreeSitterParser is registered for python
        })
    })

    describe('Error Handling', () => {
        it('handles completely empty files', async () => {
             const extractor = new TypescriptExtractor()
             const result = await extractor.extract('src/empty.ts', '')
             expect(result.functions).toHaveLength(0)
        })
    })
})
