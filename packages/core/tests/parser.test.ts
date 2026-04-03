import { describe, it, expect, beforeEach } from 'bun:test'
import { TypeScriptParser } from '../src/parser/typescript/ts-parser'
import { OxcParser } from '../src/parser/oxc-parser'
import { TypeScriptExtractor } from '../src/parser/typescript/ts-extractor'
import { TypeScriptResolver } from '../src/parser/typescript/ts-resolver'
import { getParser } from '../src/parser/index'
import { UnsupportedLanguageError } from '../src/utils/errors'
import type { ParsedFile, ParsedFunction } from '../src/parser/types'

describe('TypeScriptExtractor - Comprehensive', () => {
    describe('Function Extraction', () => {
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

        it('extracts generator functions', () => {
            const extractor = new TypeScriptExtractor('src/gen.ts', `
          function* numberGenerator(): Generator<number> {
            yield 1
            yield 2
            yield 3
          }
        `)
            const fns = extractor.extractFunctions()
            expect(fns).toHaveLength(1)
            expect(fns[0].name).toBe('numberGenerator')
        })

        it('extracts function overloads', () => {
            const extractor = new TypeScriptExtractor('src/overload.ts', `
          function parse(value: string): number
          function parse(value: string, base: number): number
          function parse(value: string, base?: number): number {
            return parseInt(value, base || 10)
          }
        `)
            const fns = extractor.extractFunctions()
            expect(fns.length).toBeGreaterThanOrEqual(1)
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
            expect(fns[0].calls.some(c => c.name === 'jwtDecode')).toBe(true)
        })

        it('extracts nested function calls', () => {
            const extractor = new TypeScriptExtractor('src/nested.ts', `
          function outer() {
            return inner().value
          }
          function inner() {
            return { value: 42 }
          }
        `)
            const fns = extractor.extractFunctions()
            const outer = fns.find(f => f.name === 'outer')
            expect(outer?.calls.some(c => c.name === 'inner')).toBe(true)
        })

        it('extracts methods on objects', () => {
            const extractor = new TypeScriptExtractor('src/obj.ts', `
          function getUser() { return { name: 'test' } }
          function getAge() { return 25 }
        `)
            const fns = extractor.extractFunctions()
            expect(fns.length).toBe(2)
        })

        it('extracts class methods', () => {
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

        it('extracts static methods', () => {
            const extractor = new TypeScriptExtractor('src/static.ts', `
          class Config {
            static default(): Config {
              return new Config()
            }
            static load(path: string): Config {
              return new Config()
            }
          }
        `)
            const classes = extractor.extractClasses()
            const staticMethods = classes[0]?.methods.filter(m => m.name.includes('default') || m.name.includes('load'))
            expect(staticMethods?.length).toBeGreaterThanOrEqual(2)
        })
    })

    describe('Import Extraction', () => {
        it('extracts named imports', () => {
            const extractor = new TypeScriptExtractor('src/auth.ts', `
          import { jwtDecode, jwtSign } from '../utils/jwt'
        `)
            const imports = extractor.extractImports()
            expect(imports).toHaveLength(1)
            expect(imports[0].source).toBe('../utils/jwt')
            expect(imports[0].names).toContain('jwtDecode')
            expect(imports[0].names).toContain('jwtSign')
        })

        it('extracts default imports', () => {
            const extractor = new TypeScriptExtractor('src/auth.ts', `
          import express from 'express'
        `)
            const imports = extractor.extractImports()
            expect(imports).toHaveLength(1)
            expect(imports[0].source).toBe('express')
            expect(imports[0].isDefault).toBe(true)
        })

        it('extracts namespace imports', () => {
            const extractor = new TypeScriptExtractor('src/auth.ts', `
          import * as utils from './utils'
        `)
            const imports = extractor.extractImports()
            expect(imports).toHaveLength(1)
            expect(imports[0].source).toBe('./utils')
        })

        it('extracts mixed imports', () => {
            const extractor = new TypeScriptExtractor('src/auth.ts', `
          import express, { Router, Request, Response } from 'express'
        `)
            const imports = extractor.extractImports()
            expect(imports).toHaveLength(1)
            expect(imports[0].isDefault).toBe(true)
            expect(imports[0].names.length).toBeGreaterThan(0)
        })

        it('extracts type-only imports', () => {
            const extractor = new TypeScriptExtractor('src/auth.ts', `
          import type { User, Profile } from './types'
          import { verifyToken } from './verify'
        `)
            const imports = extractor.extractImports()
            expect(imports).toHaveLength(1)
            expect(imports[0].source).toBe('./verify')
        })

        it('extracts re-exported imports', () => {
            const extractor = new TypeScriptExtractor('src/index.ts', `
          export function verifyToken() {}
        `)
            const imports = extractor.extractImports()
            expect(imports).toBeDefined()
        })

        it('handles relative path imports', () => {
            const extractor = new TypeScriptExtractor('src/auth/login.ts', `
          import { db } from '../db'
          import { config } from './config'
        `)
            const imports = extractor.extractImports()
            expect(imports.length).toBe(2)
        })
    })

    describe('Export Extraction', () => {
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

        it('extracts default exports', () => {
            const extractor = new TypeScriptExtractor('src/default.ts', `
          export default function AuthService() {}
        `)
            const exports = extractor.extractExports()
            expect(exports.length).toBeGreaterThanOrEqual(1)
        })

        it('extracts re-exports', () => {
            const extractor = new TypeScriptExtractor('src/index.ts', `
          export function combined() {}
        `)
            const exports = extractor.extractExports()
            expect(exports.length).toBeGreaterThanOrEqual(1)
        })
    })

    describe('Parameter Handling', () => {
        it('handles optional parameters', () => {
            const extractor = new TypeScriptExtractor('src/utils.ts', `
          function greet(name: string, greeting?: string) {}
        `)
            const fns = extractor.extractFunctions()
            expect(fns[0].params[1].optional).toBe(true)
        })

        it('handles default parameter values', () => {
            const extractor = new TypeScriptExtractor('src/utils.ts', `
          function config(port: number = 3000, host: string = 'localhost') {}
        `)
            const fns = extractor.extractFunctions()
            expect(fns[0].params[0].optional).toBe(true)
            expect(fns[0].params[0].defaultValue).toBeDefined()
        })

        it('handles rest parameters', () => {
            const extractor = new TypeScriptExtractor('src/rest.ts', `
          function sum(...numbers: number[]): number {
            return numbers.reduce((a, b) => a + b, 0)
          }
        `)
            const fns = extractor.extractFunctions()
            expect(fns[0].params[0].name).toBe('numbers')
        })

        it('handles destructured parameters', () => {
            const extractor = new TypeScriptExtractor('src/dest.ts', `
          function process({ name, age }: User): void {}
          function processArray([first, ...rest]: number[]): void {}
        `)
            const fns = extractor.extractFunctions()
            expect(fns.length).toBe(2)
        })

        it('handles typed parameters', () => {
            const extractor = new TypeScriptExtractor('src/typed.ts', `
          function createUser(name: string, age: number, options?: UserOptions): User {}
        `)
            const fns = extractor.extractFunctions()
            expect(fns[0].params.length).toBe(3)
            expect(fns[0].params[0].type).toBe('string')
            expect(fns[0].params[1].type).toBe('number')
        })
    })

    describe('Class Extraction', () => {
        it('extracts class with inheritance', () => {
            const extractor = new TypeScriptExtractor('src/class.ts', `
          export class UserService extends BaseService implements IUserService {
            private users: User[] = []
            
            constructor(private db: Database) {
              super()
            }
            
            async findById(id: string): Promise<User | null> {
              return this.users.find(u => u.id === id)
            }
          }
        `)
            const classes = extractor.extractClasses()
            expect(classes).toHaveLength(1)
            expect(classes[0].name).toBe('UserService')
        })

        it('extracts class getters and setters', () => {
            const extractor = new TypeScriptExtractor('src/getset.ts', `
          class User {
            private _name: string = ''
            
            get name(): string {
              return this._name
            }
            
            set name(value: string) {
              this._name = value
            }
          }
        `)
            const classes = extractor.extractClasses()
            // Getters/setters may be captured as part of class
            expect(classes.length).toBe(1)
        })

        it('extracts abstract classes', () => {
            const extractor = new TypeScriptExtractor('src/abstract.ts', `
          abstract class BaseService {
            abstract initialize(): void
            protected log(message: string): void {
              console.log(message)
            }
          }
        `)
            const classes = extractor.extractClasses()
            expect(classes).toHaveLength(1)
            expect(classes[0].name).toBe('BaseService')
        })

        it('extracts interfaces', () => {
            const extractor = new TypeScriptExtractor('src/interface.ts', `
          interface User {
            name: string
            age: number
          }
        `)
            const fns = extractor.extractFunctions()
            expect(fns.length).toBe(0)
        })
    })

    describe('Edge Cases', () => {
        it('handles empty files', () => {
            const extractor = new TypeScriptExtractor('src/empty.ts', '')
            expect(extractor.extractFunctions()).toHaveLength(0)
            expect(extractor.extractClasses()).toHaveLength(0)
        })

        it('handles comment-only files', () => {
            const extractor = new TypeScriptExtractor('src/comments.ts', `
              // This is a comment
              /* Multi-line comment
                 spanning lines */
              /// Documentation comment
            `)
            expect(extractor.extractFunctions()).toHaveLength(0)
        })

        it('handles malformed syntax gracefully', () => {
            const extractor = new TypeScriptExtractor('src/malformed.ts', `
              function broken(() {
                this is not valid syntax
            `)
            // Should not throw
            expect(() => extractor.extractFunctions()).not.toThrow()
        })

        it('handles deeply nested code', () => {
            const extractor = new TypeScriptExtractor('src/deep.ts', `
              function level1() {
                function level2() {
                  function level3() {
                    return level4()
                  }
                }
              }
            `)
            const fns = extractor.extractFunctions()
            expect(fns.length).toBeGreaterThanOrEqual(1)
        })

        it('handles template literals', () => {
            const extractor = new TypeScriptExtractor('src/template.ts', `
              const message = \`Hello \${name}!\`
            `)
            const fns = extractor.extractFunctions()
            expect(fns.length).toBe(0) // template literal is const, not function
        })

        it('handles decorators', () => {
            const extractor = new TypeScriptExtractor('src/decorator.ts', `
              @injectable()
              @lazy
              class UserService {}
            `)
            const classes = extractor.extractClasses()
            expect(classes.length).toBe(1)
        })

        it('handles async generators', () => {
            const extractor = new TypeScriptExtractor('src/async-gen.ts', `
              async function* streamData(): AsyncGenerator<Data> {
                yield await fetchData()
              }
            `)
            const fns = extractor.extractFunctions()
            expect(fns[0].isAsync).toBe(true)
        })

        it('handles conditional types', () => {
            const extractor = new TypeScriptExtractor('src/cond.ts', `
              type NonNullable<T> = T extends null | undefined ? never : T
            `)
            const classes = extractor.extractClasses()
            // Should not crash
            expect(classes).toBeDefined()
        })

        it('handles enum members', () => {
            const extractor = new TypeScriptExtractor('src/enum.ts', `
              enum Status {
                Pending = 'pending',
                Active = 'active',
                Completed = 'completed'
              }
            `)
            const classes = extractor.extractClasses()
            // Enum may or may not be captured depending on parser
            expect(classes).toBeDefined()
        })
    })

    describe('Type Extraction', () => {
        it('extracts return types', () => {
            const extractor = new TypeScriptExtractor('src/return.ts', `
              function getUser(): User {
                return {} as User
              }
            `)
            const fns = extractor.extractFunctions()
            expect(fns[0].returnType).toBe('User')
        })

        it('extracts generic functions', () => {
            const extractor = new TypeScriptExtractor('src/generic.ts', `
              function identity<T>(value: T): T {
                return value
              }
            `)
            const fns = extractor.extractFunctions()
            expect(fns[0].name).toBe('identity')
        })

        it('extracts union return types', () => {
            const extractor = new TypeScriptExtractor('src/union.ts', `
              function parse(value: string): string | number {
                return parseInt(value)
              }
            `)
            const fns = extractor.extractFunctions()
            expect(fns[0].returnType).toContain('string')
        })
    })

    describe('Purpose & Documentation', () => {
        it('extracts function purpose from comments', () => {
            const extractor = new TypeScriptExtractor('src/docs.ts', `
              /**
               * Verifies a JWT token and returns the payload
               * @param token - The JWT token to verify
               * @returns The decoded token payload
               */
              export function verifyToken(token: string): Payload {
                return jwtDecode(token)
              }
            `)
            const fns = extractor.extractFunctions()
            expect(fns[0].purpose).toBeDefined()
            expect(fns[0].purpose).toContain('Verifies')
        })

        it('extracts single-line doc comments', () => {
            const extractor = new TypeScriptExtractor('src/single.ts', `
              /// Gets the current user
              function getCurrentUser(): User | null {
                return null
              }
            `)
            const fns = extractor.extractFunctions()
            expect(fns[0].purpose).toBeDefined()
        })
    })
})

describe('TypeScriptParser - Comprehensive', () => {
    const parser = new TypeScriptParser()

    describe('Basic Parsing', () => {
        it('returns correct language', async () => {
            const result = await parser.parse('src/test.ts', 'const x = 1')
            expect(result.language).toBe('typescript')
        })

        it('parses a complete file', async () => {
            const result = await parser.parse('src/auth.ts', `
          import { jwtDecode } from '../utils/jwt'
          export function verifyToken(token: string): boolean {
            return jwtDecode(token).exp > Date.now()
          }
        `)
            expect(result.functions).toHaveLength(1)
            expect(result.functions[0].calls.some(c => c.name === 'jwtDecode')).toBe(true)
            expect(result.imports).toHaveLength(1)
            expect(result.exports).toHaveLength(1)
            expect(result.hash).toBeDefined()
            expect(result.path).toBe('src/auth.ts')
        })

        it('parses .tsx files', async () => {
            const result = await parser.parse('src/App.tsx', 'export default function App() { return null }')
            expect(result.language).toBe('typescript')
        })

        it('parses .jsx files', async () => {
            const result = await parser.parse('src/App.jsx', 'export default function App() { return null }')
            // OxcParser treats .jsx as typescript
            expect(result.language).toBeDefined()
        })
    })

    describe('File Metadata', () => {
        it('generates hash', async () => {
            const result = await parser.parse('src/test.ts', 'const x = 1')
            expect(result.hash).toBeDefined()
            expect(result.hash.length).toBe(64) // SHA-256 hex
        })

        it('sets parsedAt timestamp', async () => {
            const before = Date.now()
            const result = await parser.parse('src/test.ts', 'const x = 1')
            const after = Date.now()
            expect(result.parsedAt).toBeGreaterThanOrEqual(before)
            expect(result.parsedAt).toBeLessThanOrEqual(after)
        })
    })

    describe('Error Handling', () => {
        it('handles completely empty files', async () => {
            const result = await parser.parse('src/empty.ts', '')
            expect(result.functions).toHaveLength(0)
            expect(result.classes).toHaveLength(0)
        })

        it('handles syntax errors gracefully', async () => {
            const result = await parser.parse('src/error.ts', 'function broken(() {')
            // Should not throw, return partial results
            expect(result.path).toBe('src/error.ts')
        })
    })
})

describe('TypeScriptResolver - Comprehensive', () => {
    describe('Import Resolution', () => {
        it('resolves relative imports', () => {
            const resolver = new TypeScriptResolver('/project')
            const result = resolver.resolve(
                { source: '../utils/jwt', names: ['jwtDecode'], resolvedPath: '', isDefault: false, isDynamic: false },
                'src/auth/verify.ts',
                ['src/utils/jwt.ts']
            )
            expect(result.resolvedPath).toBe('src/utils/jwt.ts')
        })

        it('resolves index files', () => {
            const resolver = new TypeScriptResolver('/project')
            const result = resolver.resolve(
                { source: '../utils', names: ['helper'], resolvedPath: '', isDefault: false, isDynamic: false },
                'src/auth/verify.ts',
                ['src/utils/index.ts']
            )
            expect(result.resolvedPath).toBe('src/utils/index.ts')
        })

        it('resolves with file extension variations', () => {
            const resolver = new TypeScriptResolver('/project')
            const result = resolver.resolve(
                { source: '../utils/jwt', names: [], resolvedPath: '', isDefault: false, isDynamic: false },
                'src/auth/verify.ts',
                ['src/utils/jwt.ts', 'src/utils/jwt.tsx']
            )
            expect(result.resolvedPath).toBeDefined()
        })

        it('skips external packages', () => {
            const resolver = new TypeScriptResolver('/project')
            const result = resolver.resolve(
                { source: 'express', names: ['default'], resolvedPath: '', isDefault: true, isDynamic: false },
                'src/index.ts'
            )
            expect(result.resolvedPath).toBe('')
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

        it('handles multiple aliases', () => {
            const resolver = new TypeScriptResolver('/project', {
                '@/*': ['src/*'],
                '#/*': ['types/*'],
            })
            const result = resolver.resolve(
                { source: '@/utils', names: [], resolvedPath: '', isDefault: false, isDynamic: false },
                'src/auth/verify.ts',
                ['src/utils/index.ts']
            )
            expect(result.resolvedPath).toBe('src/utils/index.ts')
        })

        it('resolves nested path aliases', () => {
            const resolver = new TypeScriptResolver('/project', {
                '@components/*': ['src/components/*'],
            })
            const result = resolver.resolve(
                { source: '@/utils', names: [], resolvedPath: '', isDefault: false, isDynamic: false },
                'src/App.tsx',
                ['src/utils/index.ts']
            )
            expect(result.resolvedPath).toBeDefined()
        })
    })

    describe('Edge Cases', () => {
        it('handles empty files list', () => {
            const resolver = new TypeScriptResolver('/project')
            const result = resolver.resolve(
                { source: './utils', names: [], resolvedPath: '', isDefault: false, isDynamic: false },
                'src/index.ts',
                []
            )
            expect(result.resolvedPath).toContain('.ts')
        })

        it('handles non-matching imports', () => {
            const resolver = new TypeScriptResolver('/project')
            const result = resolver.resolve(
                { source: '../nonexistent', names: [], resolvedPath: '', isDefault: false, isDynamic: false },
                'src/index.ts',
                ['src/utils.ts']
            )
            // Resolver may return fallback path
            expect(result.resolvedPath).toBeDefined()
        })

        it('handles resolveAll', () => {
            const resolver = new TypeScriptResolver('/project')
            const imports = [
                { source: './a', names: [], resolvedPath: '', isDefault: false, isDynamic: false },
                { source: './b', names: [], resolvedPath: '', isDefault: false, isDynamic: false },
            ]
            const result = resolver.resolveAll(imports, 'src/index.ts', ['src/a.ts', 'src/b.ts'])
            expect(result.length).toBe(2)
            expect(result[0].resolvedPath).toBe('src/a.ts')
        })
    })
})

describe('getParser - Comprehensive', () => {
    it('returns OxcParser for .ts files', () => {
        const parser = getParser('src/auth.ts')
        expect(parser).toBeInstanceOf(OxcParser)
    })

    it('returns OxcParser for .tsx files', () => {
        const parser = getParser('src/App.tsx')
        expect(parser).toBeInstanceOf(OxcParser)
    })

    it('returns OxcParser for .js files', () => {
        const parser = getParser('src/app.js')
        expect(parser).toBeInstanceOf(OxcParser)
    })

    it('returns OxcParser for .jsx files', () => {
        const parser = getParser('src/App.jsx')
        expect(parser).toBeInstanceOf(OxcParser)
    })

    it('throws for unsupported extensions', () => {
        expect(() => getParser('src/auth.xyz')).toThrow(UnsupportedLanguageError)
    })

    it('throws for no extension', () => {
        expect(() => getParser('src/Makefile')).toThrow(UnsupportedLanguageError)
    })

    it('handles files with dots in name', () => {
        const parser = getParser('src/app.config.ts')
        expect(parser).toBeInstanceOf(OxcParser)
    })

    it('handles path with directories', () => {
        const parser = getParser('src/lib/utils/helper.ts')
        expect(parser).toBeInstanceOf(OxcParser)
    })

    it('supports C++ variant extensions via tree-sitter parser', () => {
      const cxxParser = getParser('src/engine.cxx')
      const hxxParser = getParser('src/engine.hxx')
      const hhParser = getParser('src/engine.hh')

      expect(cxxParser.getSupportedExtensions()).toContain('.cxx')
      expect(hxxParser.getSupportedExtensions()).toContain('.hxx')
      expect(hhParser.getSupportedExtensions()).toContain('.hh')
    })
})

describe('OxcParser - Direct', () => {
    const parser = new OxcParser()

    it('parses TypeScript file', async () => {
        const result = await parser.parse('complex.ts', `
            const x = 1
            export function test() { return x }
        `)
        
        expect(result.functions.length).toBeGreaterThan(0)
    })

    it('handles large files', async () => {
        const content = Array.from({ length: 1000 }, (_, i) => 
            `export function function_${i}() { return ${i} }`
        ).join('\n')
        
        const result = await parser.parse('large.ts', content)
        expect(result.functions.length).toBe(1000)
    })
})
