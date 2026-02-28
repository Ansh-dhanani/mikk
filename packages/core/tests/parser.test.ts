import { describe, it, expect } from 'bun:test'
import { TypeScriptParser } from '../src/parser/typescript/ts-parser'
import { TypeScriptExtractor } from '../src/parser/typescript/ts-extractor'
import { TypeScriptResolver } from '../src/parser/typescript/ts-resolver'
import { getParser } from '../src/parser/index'
import { UnsupportedLanguageError } from '../src/utils/errors'

describe('TypeScriptExtractor', () => {
    it('extracts function declarations', () => {
        const extractor = new TypeScriptExtractor('src/auth.ts', `
      export function verifyToken(token: string): boolean {
        return true
      }
    `)
        const fns = extractor.extractFunctions()
        expect(fns).toHaveLength(1)
        expect(fns[0].name).toBe('verifyToken')
        expect(fns[0].isExported).toBe(true)
        expect(fns[0].params[0].name).toBe('token')
        expect(fns[0].params[0].type).toBe('string')
        expect(fns[0].returnType).toBe('boolean')
    })

    it('extracts arrow functions assigned to const', () => {
        const extractor = new TypeScriptExtractor('src/utils.ts', `
      export const greet = (name: string): string => {
        return 'Hello ' + name
      }
    `)
        const fns = extractor.extractFunctions()
        expect(fns).toHaveLength(1)
        expect(fns[0].name).toBe('greet')
        expect(fns[0].isExported).toBe(true)
    })

    it('extracts async functions', () => {
        const extractor = new TypeScriptExtractor('src/db.ts', `
      export async function findUser(id: string): Promise<User> {
        return await db.find(id)
      }
    `)
        const fns = extractor.extractFunctions()
        expect(fns[0].isAsync).toBe(true)
    })

    it('extracts call expressions from function bodies', () => {
        const extractor = new TypeScriptExtractor('src/auth.ts', `
      import { jwtDecode } from './jwt'
      function verifyToken(token: string) {
        const decoded = jwtDecode(token)
        console.log(decoded)
        return decoded.exp > Date.now()
      }
    `)
        const fns = extractor.extractFunctions()
        expect(fns[0].calls).toContain('jwtDecode')
    })

    it('extracts imports', () => {
        const extractor = new TypeScriptExtractor('src/auth.ts', `
      import { jwtDecode, jwtSign } from '../utils/jwt'
      import express from 'express'
    `)
        const imports = extractor.extractImports()
        expect(imports).toHaveLength(2)
        expect(imports[0].source).toBe('../utils/jwt')
        expect(imports[0].names).toContain('jwtDecode')
        expect(imports[0].names).toContain('jwtSign')
        expect(imports[1].source).toBe('express')
        expect(imports[1].isDefault).toBe(true)
    })

    it('extracts named exports', () => {
        const extractor = new TypeScriptExtractor('src/auth.ts', `
      export function verifyToken() {}
      export const SECRET = 'abc'
      export class AuthService {}
    `)
        const exports = extractor.extractExports()
        expect(exports.length).toBeGreaterThanOrEqual(3)
        expect(exports.find(e => e.name === 'verifyToken')?.type).toBe('function')
        expect(exports.find(e => e.name === 'SECRET')?.type).toBe('const')
        expect(exports.find(e => e.name === 'AuthService')?.type).toBe('class')
    })

    it('extracts classes with methods', () => {
        const extractor = new TypeScriptExtractor('src/service.ts', `
      export class AuthService {
        verify(token: string): boolean {
          return true
        }
        async refresh(): Promise<string> {
          return 'new-token'
        }
      }
    `)
        const classes = extractor.extractClasses()
        expect(classes).toHaveLength(1)
        expect(classes[0].name).toBe('AuthService')
        expect(classes[0].methods).toHaveLength(2)
        expect(classes[0].methods[0].name).toBe('AuthService.verify')
        expect(classes[0].methods[1].isAsync).toBe(true)
        expect(classes[0].isExported).toBe(true)
    })

    it('skips type-only imports', () => {
        const extractor = new TypeScriptExtractor('src/auth.ts', `
      import type { User } from './types'
      import { verifyToken } from './verify'
    `)
        const imports = extractor.extractImports()
        expect(imports).toHaveLength(1)
        expect(imports[0].source).toBe('./verify')
    })

    it('handles optional parameters', () => {
        const extractor = new TypeScriptExtractor('src/utils.ts', `
      function greet(name: string, greeting?: string) {}
    `)
        const fns = extractor.extractFunctions()
        expect(fns[0].params[1].optional).toBe(true)
    })

    it('handles default parameter values', () => {
        const extractor = new TypeScriptExtractor('src/utils.ts', `
      function config(port: number = 3000) {}
    `)
        const fns = extractor.extractFunctions()
        expect(fns[0].params[0].optional).toBe(true)
        expect(fns[0].params[0].defaultValue).toBe('3000')
    })
})

describe('TypeScriptParser', () => {
    const parser = new TypeScriptParser()

    it('returns correct language', () => {
        const result = parser.parse('src/test.ts', 'const x = 1')
        expect(result.language).toBe('typescript')
    })

    it('parses a complete file', () => {
        const result = parser.parse('src/auth.ts', `
      import { jwtDecode } from '../utils/jwt'
      export function verifyToken(token: string): boolean {
        return jwtDecode(token).exp > Date.now()
      }
    `)
        expect(result.functions).toHaveLength(1)
        expect(result.imports).toHaveLength(1)
        expect(result.exports).toHaveLength(1)
        expect(result.hash).toBeDefined()
        expect(result.path).toBe('src/auth.ts')
    })

    it('supports .tsx extension', () => {
        expect(parser.getSupportedExtensions()).toContain('.tsx')
    })
})

describe('TypeScriptResolver', () => {
    it('resolves relative imports', () => {
        const resolver = new TypeScriptResolver('/project')
        const result = resolver.resolve(
            { source: '../utils/jwt', names: ['jwtDecode'], resolvedPath: '', isDefault: false, isDynamic: false },
            'src/auth/verify.ts',
            ['src/utils/jwt.ts']
        )
        expect(result.resolvedPath).toBe('src/utils/jwt.ts')
    })

    it('resolves path aliases', () => {
        const resolver = new TypeScriptResolver('/project', {
            '@/*': ['src/*'],
        })
        const result = resolver.resolve(
            { source: '@/utils/jwt', names: ['jwtDecode'], resolvedPath: '', isDefault: false, isDynamic: false },
            'src/auth/verify.ts',
            ['src/utils/jwt.ts']
        )
        expect(result.resolvedPath).toBe('src/utils/jwt.ts')
    })

    it('skips external packages', () => {
        const resolver = new TypeScriptResolver('/project')
        const result = resolver.resolve(
            { source: 'express', names: ['default'], resolvedPath: '', isDefault: true, isDynamic: false },
            'src/index.ts'
        )
        expect(result.resolvedPath).toBe('')
    })

    it('handles index files', () => {
        const resolver = new TypeScriptResolver('/project')
        const result = resolver.resolve(
            { source: '../utils', names: ['helper'], resolvedPath: '', isDefault: false, isDynamic: false },
            'src/auth/verify.ts',
            ['src/utils/index.ts']
        )
        expect(result.resolvedPath).toBe('src/utils/index.ts')
    })
})

describe('getParser', () => {
    it('returns TypeScriptParser for .ts files', () => {
        const parser = getParser('src/auth.ts')
        expect(parser).toBeInstanceOf(TypeScriptParser)
    })

    it('returns TypeScriptParser for .tsx files', () => {
        const parser = getParser('src/App.tsx')
        expect(parser).toBeInstanceOf(TypeScriptParser)
    })

    it('throws for unsupported extensions', () => {
        expect(() => getParser('src/auth.rb')).toThrow(UnsupportedLanguageError)
    })
})
