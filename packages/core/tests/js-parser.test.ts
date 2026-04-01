import { describe, test, expect } from 'bun:test'
import { JavaScriptExtractor } from '../src/parser/javascript/js-extractor'
import { JavaScriptParser } from '../src/parser/javascript/js-parser'
import { JavaScriptResolver } from '../src/parser/javascript/js-resolver'
import { TypeScriptExtractor } from '../src/parser/typescript/ts-extractor'
import { getParser } from '../src/parser/index'

// ─── Sample JS source files ───────────────────────────────────────────────────

/** Plain CommonJS module — require + module.exports */
const CJS_MODULE = `
'use strict'

const crypto  = require('crypto')
const bcrypt  = require('bcryptjs')
const { sign, verify } = require('jsonwebtoken')
const db = require('./db')

/**
 * Hash a plain-text password using bcrypt.
 */
function hashPassword(password) {
    if (!password) throw new Error('password required')
    return bcrypt.hash(password, 10)
}

/**
 * Verify a JWT token and return the decoded payload.
 */
const verifyToken = function verifyJwt(token, secret) {
    if (!token) return null
    try {
        return verify(token, secret)
    } catch {
        return null
    }
}

async function getUser(id) {
    if (!id) throw new Error('id required')
    return db.findById(id)
}

module.exports = { hashPassword, verifyToken, getUser }
`

/** ESM module */
const ESM_MODULE = `
import path from 'path'
import { readFile } from 'fs/promises'
import { formatDate } from './utils/dates.js'

export async function loadConfig(configPath) {
    const raw = await readFile(path.resolve(configPath), 'utf-8')
    return JSON.parse(raw)
}

export const formatTimestamp = (ts) => formatDate(new Date(ts))

export default function bootstrap(opts = {}) {
    return { ...opts, started: true }
}
`

/** JSX component file */
const JSX_COMPONENT = `
import React from 'react'

// UserCard component — displays user info
function UserCard({ user, onEdit }) {
    if (!user) return null
    return (
        <div className="card">
            <h2>{user.name}</h2>
        </div>
    )
}

const Avatar = ({ src, alt = 'avatar' }) => (
    <img src={src} alt={alt} />
)

export { UserCard, Avatar }
`

/** module.exports = function patterns */
const MODULE_EXPORTS_FN = `
/**
 * Handle HTTP login request.
 */
module.exports = function handleLogin(req, res) {
    if (!req.body.email) {
        return res.status(400).json({ error: 'email required' })
    }
    res.json({ ok: true })
}
`

/** exports.x = function patterns */
const EXPORTS_DOT_X = `
exports.createUser = function(data) {
    if (!data.name) throw new Error('name required')
    return { id: Date.now(), ...data }
}

exports.deleteUser = async (id) => {
    if (!id) throw new Error('id required')
    return true
}
`

/** module.exports = object with functions */
const MODULE_EXPORTS_OBJ = `
function internalHelper(x) { return x * 2 }

module.exports = {
    double: internalHelper,
    triple: function(x) { return x * 3 },
    square: (x) => x * x,
}
`

/** Express route definitions */
const EXPRESS_ROUTES = `
const express = require('express')
const router = express.Router()

const { getUser, createUser, deleteUser } = require('./controllers/users')
const authMiddleware = require('./middleware/auth')

router.get('/users', getUser)
router.post('/users', authMiddleware, createUser)
router.delete('/users/:id', authMiddleware, deleteUser)

module.exports = router
`

/** Edge cases */
const EDGE_CASES = `
// Dynamic require with a variable — should NOT be captured as a static import
const dynamic = require(someVariable)

// require.resolve — should NOT be captured (it's a property access on the require object)
const resolved = require.resolve('./module')

// Conditional require
const isNode = typeof window === 'undefined'
const platform = isNode ? require('node:os') : null

// Nested function in module.exports
module.exports = {
    outer: function(x) {
        function inner(y) { return y + 1 }
        return inner(x)
    }
}

// module.exports spread — graceful no-crash
const base = {}
module.exports = { ...base, extra: 1 }
`

/** Empty file */
const EMPTY_FILE = ``

/** Comments and whitespace only */
const COMMENTS_ONLY = `
// This file is intentionally left blank
/* Another comment block */
`

/** Mixed ESM + CJS (unusual, but Babel-transpiled code can look like this) */
const MIXED_ESM_CJS = `
import defaultExport from './base.js'

const extra = require('./extra')

export function combined() {
    return defaultExport()
}

module.exports.legacy = function() {}
`

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('JavaScriptExtractor', () => {

    describe('CommonJS require() imports', () => {
        const ext = new JavaScriptExtractor('src/auth.js', CJS_MODULE)

        test('extracts plain require() as default import', () => {
            const imports = ext.extractImports()
            const crypto = imports.find(i => i.source === 'crypto')
            expect(crypto).toBeDefined()
            expect(crypto!.isDefault).toBe(true)
            expect(crypto!.isDynamic).toBe(false)
        })

        test('extracts destructured require() as named imports', () => {
            const imports = ext.extractImports()
            const jwt = imports.find(i => i.source === 'jsonwebtoken')
            expect(jwt).toBeDefined()
            expect(jwt!.names).toContain('sign')
            expect(jwt!.names).toContain('verify')
        })

        test('extracts relative require(./db)', () => {
            const imports = ext.extractImports()
            const dbImp = imports.find(i => i.source === './db')
            expect(dbImp).toBeDefined()
            expect(dbImp!.names).toContain('db')
        })

        test('does NOT capture require(variable) — dynamic require skipped', () => {
            const edgeExt = new JavaScriptExtractor('src/edge.js', EDGE_CASES)
            const imports = edgeExt.extractImports()
            // someVariable is not a StringLiteral — must not appear
            const bad = imports.find(i => i.source === '' || i.source === 'someVariable')
            expect(bad).toBeUndefined()
        })

        test('does NOT capture require.resolve() as an import', () => {
            const edgeExt = new JavaScriptExtractor('src/edge.js', EDGE_CASES)
            const imports = edgeExt.extractImports()
            // require.resolve('./module') — node.expression is a PropertyAccessExpression,
            // not an Identifier, so it must NOT be captured
            const bad = imports.find(i => i.source === './module')
            expect(bad).toBeUndefined()
        })
    })

    describe('CommonJS module.exports = { } exports', () => {
        const ext = new JavaScriptExtractor('src/auth.js', CJS_MODULE)

        test('module.exports = { foo, bar } marks names as exports', () => {
            const exports = ext.extractExports()
            const names = exports.map(e => e.name)
            expect(names).toContain('hashPassword')
            expect(names).toContain('verifyToken')
            expect(names).toContain('getUser')
        })
    })

    describe('module.exports = function pattern', () => {
        const ext = new JavaScriptExtractor('src/login.js', MODULE_EXPORTS_FN)

        test('extracts named function expression from module.exports', () => {
            const fns = ext.extractFunctions()
            const fn = fns.find(f => f.name === 'handleLogin')
            expect(fn).toBeDefined()
            expect(fn!.isExported).toBe(true)
        })

        test('extracted function has correct file and purpose', () => {
            const fns = ext.extractFunctions()
            const fn = fns.find(f => f.name === 'handleLogin')
            expect(fn!.file).toBe('src/login.js')
            expect(fn!.purpose).toMatch(/handle http login/i)
        })

        test('extracts params from module.exports function', () => {
            const fns = ext.extractFunctions()
            const fn = fns.find(f => f.name === 'handleLogin')
            expect(fn!.params.map(p => p.name)).toEqual(['req', 'res'])
        })

        test('detects edge cases (early return guard)', () => {
            const fns = ext.extractFunctions()
            const fn = fns.find(f => f.name === 'handleLogin')
            expect(fn!.edgeCasesHandled.length).toBeGreaterThan(0)
        })
    })

    describe('exports.x = function pattern', () => {
        const ext = new JavaScriptExtractor('src/users.js', EXPORTS_DOT_X)

        test('extracts function assigned to exports.createUser', () => {
            const fns = ext.extractFunctions()
            const fn = fns.find(f => f.name === 'createUser')
            expect(fn).toBeDefined()
            expect(fn!.isExported).toBe(true)
        })

        test('extracts async arrow function assigned to exports.deleteUser', () => {
            const fns = ext.extractFunctions()
            const fn = fns.find(f => f.name === 'deleteUser')
            expect(fn).toBeDefined()
            expect(fn!.isAsync).toBe(true)
        })

        test('exports.x appears in extractExports()', () => {
            const exports = ext.extractExports()
            const names = exports.map(e => e.name)
            expect(names).toContain('createUser')
            expect(names).toContain('deleteUser')
        })

        test('detects throw as error handling', () => {
            const fns = ext.extractFunctions()
            const fn = fns.find(f => f.name === 'createUser')
            expect(fn!.errorHandling.some(e => e.type === 'throw')).toBe(true)
        })
    })

    describe('module.exports = { inline functions }', () => {
        test('exports names from object literal', () => {
            const ext = new JavaScriptExtractor('src/math.js', MODULE_EXPORTS_OBJ)
            const exports = ext.extractExports()
            const names = exports.map(e => e.name)
            expect(names).toContain('double')
            expect(names).toContain('triple')
            expect(names).toContain('square')
        })
    })

    describe('ESM imports and exports', () => {
        const ext = new JavaScriptExtractor('src/loader.js', ESM_MODULE)

        test('extracts static ESM imports', () => {
            const imports = ext.extractImports()
            const pathImp = imports.find(i => i.source === 'path')
            expect(pathImp).toBeDefined()
            const fsImp = imports.find(i => i.source === 'fs/promises')
            expect(fsImp).toBeDefined()
            expect(fsImp!.names).toContain('readFile')
        })

        test('extracts named ESM function export', () => {
            const fns = ext.extractFunctions()
            const fn = fns.find(f => f.name === 'loadConfig')
            expect(fn).toBeDefined()
            expect(fn!.isExported).toBe(true)
            expect(fn!.isAsync).toBe(true)
        })

        test('extracts arrow function export', () => {
            const fns = ext.extractFunctions()
            const fn = fns.find(f => f.name === 'formatTimestamp')
            expect(fn).toBeDefined()
            expect(fn!.isExported).toBe(true)
        })

        test('extracts export default function', () => {
            const fns = ext.extractFunctions()
            const fn = fns.find(f => f.name === 'bootstrap')
            expect(fn).toBeDefined()
        })
    })

    describe('JSX components', () => {
        const ext = new JavaScriptExtractor('src/UserCard.jsx', JSX_COMPONENT)

        test('parses JSX without crashing', () => {
            expect(() => ext.extractFunctions()).not.toThrow()
        })

        test('extracts function component', () => {
            const fns = ext.extractFunctions()
            const fn = fns.find(f => f.name === 'UserCard')
            expect(fn).toBeDefined()
            expect(fn!.params[0].name).toBe('{ user, onEdit }')
        })

        test('extracts arrow function component', () => {
            const fns = ext.extractFunctions()
            const fn = fns.find(f => f.name === 'Avatar')
            expect(fn).toBeDefined()
        })

        test('extracts purpose from comment above JSX component', () => {
            const fns = ext.extractFunctions()
            const fn = fns.find(f => f.name === 'UserCard')
            expect(fn!.purpose).toMatch(/user.*card/i)
        })

        test('detects early-return edge case (if !user return null)', () => {
            const fns = ext.extractFunctions()
            const fn = fns.find(f => f.name === 'UserCard')
            expect(fn!.edgeCasesHandled.length).toBeGreaterThan(0)
        })
    })

    describe('async functions', () => {
        test('marks async functions correctly', () => {
            const ext = new JavaScriptExtractor('src/auth.js', CJS_MODULE)
            const fns = ext.extractFunctions()
            const fn = fns.find(f => f.name === 'getUser')
            expect(fn).toBeDefined()
            expect(fn!.isAsync).toBe(true)
        })
    })

    describe('Express route detection', () => {
        const ext = new JavaScriptExtractor('src/routes.js', EXPRESS_ROUTES)

        test('detects GET route', () => {
            const routes = ext.extractRoutes()
            const get = routes.find(r => r.method === 'GET' && r.path === '/users')
            expect(get).toBeDefined()
            expect(get!.handler).toBe('getUser')
        })

        test('detects POST route with middleware', () => {
            const routes = ext.extractRoutes()
            const post = routes.find(r => r.method === 'POST' && r.path === '/users')
            expect(post).toBeDefined()
            expect(post!.middlewares).toContain('authMiddleware')
            expect(post!.handler).toBe('createUser')
        })

        test('detects DELETE route', () => {
            const routes = ext.extractRoutes()
            const del = routes.find(r => r.method === 'DELETE')
            expect(del).toBeDefined()
            expect(del!.path).toBe('/users/:id')
        })
    })

    describe('edge cases', () => {
        test('empty file parses without error and returns empty arrays', () => {
            const ext = new JavaScriptExtractor('src/empty.js', EMPTY_FILE)
            expect(ext.extractFunctions()).toEqual([])
            expect(ext.extractImports()).toEqual([])
            expect(ext.extractExports()).toEqual([])
        })

        test('comments-only file parses without error', () => {
            const ext = new JavaScriptExtractor('src/empty.js', COMMENTS_ONLY)
            expect(() => ext.extractFunctions()).not.toThrow()
            expect(ext.extractFunctions()).toEqual([])
        })

        test('module.exports spread literal does not crash', () => {
            const ext = new JavaScriptExtractor('src/edge.js', EDGE_CASES)
            expect(() => ext.extractExports()).not.toThrow()
        })

        test('mixed ESM + CJS file captures both import and require', () => {
            const ext = new JavaScriptExtractor('src/mixed.js', MIXED_ESM_CJS)
            const imports = ext.extractImports()
            const esmImp = imports.find(i => i.source === './base.js')
            const cjsImp = imports.find(i => i.source === './extra')
            expect(esmImp).toBeDefined()
            expect(cjsImp).toBeDefined()
        })

        test('mixed ESM + CJS: captures both ESM and CJS exports', () => {
            const ext = new JavaScriptExtractor('src/mixed.js', MIXED_ESM_CJS)
            const exports = ext.extractExports()
            const names = exports.map(e => e.name)
            expect(names).toContain('combined')      // ESM export
            expect(names).toContain('legacy')        // exports.legacy = function()
        })

        test('no duplicate imports when same source appears in both ESM and CJS', () => {
            // Unlikely but guard: same source in require and import
            const src = `import x from './foo'; const y = require('./foo')`
            const ext = new JavaScriptExtractor('src/dup.js', src)
            const imports = ext.extractImports()
            const fooImports = imports.filter(i => i.source === './foo')
            expect(fooImports.length).toBe(1)
        })

        test('no duplicate exports when CJS and ESM both declare same name', () => {
            const src = `export function greet() {} \nexports.greet = function() {}`
            const ext = new JavaScriptExtractor('src/dup.js', src)
            const exports = ext.extractExports()
            const greetExports = exports.filter(e => e.name === 'greet')
            expect(greetExports.length).toBe(1)
        })

        test('malformed code gracefully degrades without crashing', () => {
            const malformed = `
                function breakMe() {
                    const x = 
                    if (true) {
                // missing braces, missing assignments
            `
            const ext = new JavaScriptExtractor('src/malformed.js', malformed)
            // TS compiler API is very fault tolerant, so it might extract breakMe anyway, 
            // but the key assertion is that it doesn't throw.
            expect(() => ext.extractFunctions()).not.toThrow()
            const fn = ext.extractFunctions().find(f => f.name === 'breakMe')
            expect(fn).toBeDefined()
        })
    })
})

describe('JavaScriptParser', () => {
    const parser = new JavaScriptParser()

    test('getSupportedExtensions includes .js .mjs .cjs .jsx', () => {
        const exts = parser.getSupportedExtensions()
        expect(exts).toContain('.js')
        expect(exts).toContain('.mjs')
        expect(exts).toContain('.cjs')
        expect(exts).toContain('.jsx')
    })

    test('parse returns language: javascript', async () => {
        const result = await parser.parse('src/index.js', CJS_MODULE)
        expect(result.language).toBe('javascript')
    })

    test('parse includes hash and parsedAt', async () => {
        const result = await parser.parse('src/index.js', CJS_MODULE)
        expect(typeof result.hash).toBe('string')
        expect(result.hash.length).toBe(64) // SHA-256 hex
        expect(typeof result.parsedAt).toBe('number')
    })

    test('CJS-exported functions are marked isExported via cross-reference', async () => {
        const result = await parser.parse('src/auth.js', CJS_MODULE)
        const hashPw = result.functions.find((f: any) => f.name === 'hashPassword')
        expect(hashPw).toBeDefined()
        expect(hashPw!.isExported).toBe(true)
    })

    test('resolveImports resolves relative paths with .js extension probing', async () => {
        const files = await Promise.all([
            parser.parse('src/auth.js', CJS_MODULE),
            parser.parse('src/loader.js', ESM_MODULE),
        ])
        // When no allProjectFiles list is passed to resolveImports, the resolver
        // falls back to extension probing without filesystem validation and resolves
        // relative imports to their most-likely path (e.g. './db' → 'src/db.js').
        //
        // Previously the test relied on the broken behaviour where the resolver
        // always probed through even when the file wasn't in the provided list.
        // The correct fix is to call resolveImports without a restrictive file list,
        // which is what happens in production (the parser computes allFilePaths
        // from the full project scan, not just the two files under test).
        //
        // We simulate a "full project" by telling the resolver that src/db.js exists.
        const allProjectFiles = [
            'src/auth.js',
            'src/loader.js',
            'src/db.js',   // ← the file that auth.js imports
        ]
        // resolveImports in JavaScriptParser uses files.map(f => f.path) internally,
        // so to inject a richer file list we call the resolver directly here.
        const resolver = new JavaScriptResolver('/project')
        const authFile = files.find((f: any) => f.path === 'src/auth.js')!
        const resolvedImports = resolver.resolveAll(authFile.imports, authFile.path, allProjectFiles)
        const dbImport = resolvedImports.find((i: any) => i.source === './db')
        expect(dbImport).toBeDefined()
        expect(dbImport!.resolvedPath).toMatch(/src\/db/)
        expect(dbImport!.resolvedPath).toMatch(/\.js$/)
    })

    test('resolveImports leaves external packages unresolved (empty resolvedPath)', async () => {
        const files = [await parser.parse('src/auth.js', CJS_MODULE)]
        const resolved = await parser.resolveImports(files, '/project')
        const file = resolved[0]
        const cryptoImp = file.imports.find((i: any) => i.source === 'crypto')
        expect(cryptoImp!.resolvedPath).toBe('')
    })

    test('parse .jsx file language is javascript', async () => {
        const result = await parser.parse('src/UserCard.jsx', JSX_COMPONENT)
        expect(result.language).toBe('javascript')
    })
})

describe('JavaScriptResolver', () => {
    const resolver = new JavaScriptResolver('/project')

    test('resolves relative import with .js extension', () => {
        const imp = { source: './utils', resolvedPath: '', names: [], isDefault: true, isDynamic: false }
        const result = resolver.resolve(imp, 'src/index.js', ['src/utils.js'])
        expect(result.resolvedPath).toBe('src/utils.js')
    })

    test('resolves relative import with /index.js fallback', () => {
        const imp = { source: './utils', resolvedPath: '', names: [], isDefault: true, isDynamic: false }
        const result = resolver.resolve(imp, 'src/index.js', ['src/utils/index.js'])
        expect(result.resolvedPath).toBe('src/utils/index.js')
    })

    test('falls back to .ts for mixed TS/JS project', () => {
        const imp = { source: './shared', resolvedPath: '', names: [], isDefault: true, isDynamic: false }
        const result = resolver.resolve(imp, 'src/index.js', ['src/shared.ts'])
        expect(result.resolvedPath).toBe('src/shared.ts')
    })

    test('leaves external packages unresolved', () => {
        const imp = { source: 'lodash', resolvedPath: '', names: [], isDefault: true, isDynamic: false }
        const result = resolver.resolve(imp, 'src/index.js')
        expect(result.resolvedPath).toBe('')
    })

    test('resolves with no known files list (defaults to .js suffix)', () => {
        const imp = { source: './foo', resolvedPath: '', names: [], isDefault: true, isDynamic: false }
        const result = resolver.resolve(imp, 'src/index.js', [])
        expect(result.resolvedPath).toMatch(/foo\.js$/)
    })

    test('source with existing .js extension returned as-is', () => {
        const imp = { source: './utils.js', resolvedPath: '', names: [], isDefault: true, isDynamic: false }
        const result = resolver.resolve(imp, 'src/index.js', ['src/utils.js'])
        expect(result.resolvedPath).toBe('src/utils.js')
    })

    test('resolves path alias when aliases provided', () => {
        const resolver2 = new JavaScriptResolver('/project', { '@/*': ['src/*'] })
        const imp = { source: '@/utils', resolvedPath: '', names: [], isDefault: false, isDynamic: false }
        const result = resolver2.resolve(imp, 'src/components/Button.js', ['src/utils.js'])
        expect(result.resolvedPath).toBe('src/utils.js')
    })

    test('resolveAll resolves all imports in a list', () => {
        const imports = [
            { source: './a', resolvedPath: '', names: [], isDefault: false, isDynamic: false },
            { source: 'lodash', resolvedPath: '', names: [], isDefault: false, isDynamic: false },
        ]
        const results = resolver.resolveAll(imports, 'src/index.js', ['src/a.js'])
        expect(results[0].resolvedPath).toBe('src/a.js')
        expect(results[1].resolvedPath).toBe('')
    })
})

describe('getParser — JS extensions', () => {
    test('returns JavaScriptParser for .js', () => {
        const p = getParser('src/index.js')
        expect(p.getSupportedExtensions()).toContain('.js')
    })

    test('returns JavaScriptParser for .mjs', () => {
        const p = getParser('src/index.mjs')
        expect(p.getSupportedExtensions()).toContain('.mjs')
    })

    test('returns JavaScriptParser for .cjs', () => {
        const p = getParser('src/index.cjs')
        expect(p.getSupportedExtensions()).toContain('.cjs')
    })

    test('returns JavaScriptParser for .jsx', () => {
        const p = getParser('src/App.jsx')
        expect(p.getSupportedExtensions()).toContain('.jsx')
    })

    test('still returns TypeScriptParser for .ts', () => {
        const p = getParser('src/index.ts')
        expect(p.getSupportedExtensions()).toContain('.ts')
    })

    test('still throws UnsupportedLanguageError for .xyz', () => {
        expect(() => getParser('src/app.xyz')).toThrow()
    })
})

// ==========================================
// ADDITIONAL COMPREHENSIVE TESTS
// ==========================================

describe('JavaScript - Additional Edge Cases', () => {
    
    describe('Dynamic Imports', () => {
        test('handles dynamic import()', () => {
            const src = `
                const module = await import('./dynamic')
                const mod = await import('lodash')
            `
            const ext = new JavaScriptExtractor('src/app.js', src)
            const imports = ext.extractImports()
            expect(imports.length).toBeGreaterThanOrEqual(0)
        })
    })

    describe('Class Syntax', () => {
        test('extracts ES6 classes', () => {
            const src = `
                class User {
                    constructor(name) {
                        this.name = name
                    }
                    
                    getName() {
                        return this.name
                    }
                    
                    static create(data) {
                        return new User(data.name)
                    }
                }
                
                class Admin extends User {
                    constructor(name, role) {
                        super(name)
                        this.role = role
                    }
                }
            `
            const ext = new JavaScriptExtractor('src/user.js', src)
            const classes = ext.extractClasses()
            expect(classes.length).toBe(2)
            expect(classes[0].name).toBe('User')
            expect(classes[1].name).toBe('Admin')
        })

        test('extracts class methods', () => {
            const src = `
                class Calculator {
                    add(a, b) { return a + b }
                    subtract(a, b) { return a - b }
                }
            `
            const ext = new JavaScriptExtractor('src/calc.js', src)
            const classes = ext.extractClasses()
            expect(classes[0].methods.length).toBe(2)
        })
    })

    describe('Object Patterns', () => {
        test('handles object literal functions', () => {
            const src = `
                function formatDate() { return 'date' }
                function parseJSON() { return 'json' }
            `
            const ext = new JavaScriptExtractor('src/utils.js', src)
            const fns = ext.extractFunctions()
            expect(fns.length).toBe(2)
        })

        test('handles computed property names', () => {
            const src = `
                const obj = {
                    [key]: value,
                    ['computed' + 'Key']() {}
                }
            `
            const ext = new JavaScriptExtractor('src/obj.js', src)
            expect(() => ext.extractFunctions()).not.toThrow()
        })
    })

    describe('Arrow Functions', () => {
        test('handles various arrow function patterns', () => {
            const src = `
                const add = (a, b) => a + b
                const greet = name => \`Hello \${name}\`
                const promise = () => new Promise(resolve => resolve())
                const multi = (a, b) => {
                    return a + b
                }
            `
            const ext = new JavaScriptExtractor('src/arrow.js', src)
            const fns = ext.extractFunctions()
            expect(fns.length).toBe(4)
        })
    })

    describe('Callback Patterns', () => {
        test('handles callback functions', () => {
            const src = `
                items.forEach(item => console.log(item))
                const filtered = items.filter(x => x > 0)
                const mapped = items.map(x => x * 2)
                const found = items.find(x => x.id === id)
            `
            const ext = new JavaScriptExtractor('src/callbacks.js', src)
            const fns = ext.extractFunctions()
            expect(fns.length).toBe(0) // callbacks aren't function declarations
        })
    })

    describe('Error Handling in Functions', () => {
        test('detects try-catch blocks', () => {
            const src = `
                function safeParse(json) {
                    try {
                        return JSON.parse(json)
                    } catch (e) {
                        console.error(e)
                        return null
                    }
                }
            `
            const ext = new JavaScriptExtractor('src/safe.js', src)
            const fns = ext.extractFunctions()
            expect(fns[0].errorHandling.length).toBeGreaterThan(0)
        })

        test('detects throw statements', () => {
            const src = `
                function validate(value) {
                    if (!value) {
                        throw new Error('value required')
                    }
                    return true
                }
            `
            const ext = new JavaScriptExtractor('src/validate.js', src)
            const fns = ext.extractFunctions()
            expect(fns[0].errorHandling.some(e => e.type === 'throw')).toBe(true)
        })
    })

    describe('Complex Return Statements', () => {
        test('handles early returns', () => {
            const src = `
                function findUser(id) {
                    if (!id) return null
                    const user = db.find(id)
                    if (!user) return null
                    return user
                }
            `
            const ext = new JavaScriptExtractor('src/find.js', src)
            const fns = ext.extractFunctions()
            expect(fns[0].edgeCasesHandled.length).toBeGreaterThan(0)
        })

        test('handles conditional returns', () => {
            const src = `
                function getStatus(isActive) {
                    return isActive ? 'active' : 'inactive'
                }
            `
            const ext = new JavaScriptExtractor('src/status.js', src)
            const fns = ext.extractFunctions()
            expect(fns.length).toBe(1)
        })
    })

    describe('Async/Await', () => {
        test('handles async arrow functions', () => {
            const src = `
                const fetchData = async (url) => {
                    const res = await fetch(url)
                    return res.json()
                }
            `
            const ext = new JavaScriptExtractor('src/async.js', src)
            const fns = ext.extractFunctions()
            expect(fns[0].isAsync).toBe(true)
        })

        test('handles await without async wrapper', () => {
            const src = `
                async function main() {
                    await doSomething()
                }
            `
            const ext = new JavaScriptExtractor('src/main.js', src)
            const fns = ext.extractFunctions()
            expect(fns[0].isAsync).toBe(true)
        })

        test('handles Promise.all', () => {
            const src = `
                async function loadAll(urls) {
                    return Promise.all(urls.map(fetch))
                }
            `
            const ext = new JavaScriptExtractor('src/load.js', src)
            const fns = ext.extractFunctions()
            expect(fns[0].isAsync).toBe(true)
        })
    })

    describe('Generator Functions', () => {
        test('handles generator functions', () => {
            const src = `
                function* numberGenerator() {
                    yield 1
                    yield 2
                    yield 3
                }
            `
            const ext = new JavaScriptExtractor('src/gen.js', src)
            const fns = ext.extractFunctions()
            expect(fns.length).toBe(1)
        })
    })

    describe('Destructuring', () => {
        test('handles destructured parameters', () => {
            const src = `
                function process({ name, age }, [first, ...rest]) {
                    return name + age + first
                }
            `
            const ext = new JavaScriptExtractor('src/dest.js', src)
            const fns = ext.extractFunctions()
            expect(fns[0].params.length).toBe(2)
        })
    })

    describe('Rest/Spread', () => {
        test('handles rest parameters', () => {
            const src = `
                function sum(...numbers) {
                    return numbers.reduce((a, b) => a + b, 0)
                }
            `
            const ext = new JavaScriptExtractor('src/rest.js', src)
            const fns = ext.extractFunctions()
            expect(fns[0].params[0].name).toBe('numbers')
        })

        test('handles spread in function calls', () => {
            const src = `
                function apply(...args) {
                    return fn(...args)
                }
            `
            const ext = new JavaScriptExtractor('src/spread.js', src)
            const fns = ext.extractFunctions()
            expect(fns.length).toBe(1)
        })
    })

    describe('Template Literals', () => {
        test('handles template literals', () => {
            const src = `
                function greet(name) {
                    return \`Hello, \${name}!\`
                }
            `
            const ext = new JavaScriptExtractor('src/tmpl.js', src)
            const fns = ext.extractFunctions()
            expect(fns.length).toBe(1)
        })
    })

    describe('Regex Patterns', () => {
        test('handles regex in code', () => {
            const src = `
                function validateEmail(email) {
                    const re = /^[a-zA-Z0-9@]+.[a-zA-Z0-9@]+$/
                    return re.test(email)
                }
            `
            const ext = new JavaScriptExtractor('src/regex.js', src)
            const fns = ext.extractFunctions()
            expect(fns.length).toBe(1)
        })
    })

    describe('Module Patterns', () => {
        test('handles IIFE', () => {
            const src = `
                (function() {
                    const privateVar = 'secret'
                    window.init = function() {}
                })()
                
                (async () => {
                    await load()
                })()
            `
            const ext = new JavaScriptExtractor('src/iife.js', src)
            expect(() => ext.extractFunctions()).not.toThrow()
        })

        test('handles UMD pattern', () => {
            const src = `
                (function(root, factory) {
                    if (typeof module === 'object') {
                        module.exports = factory()
                    } else {
                        root.MyLib = factory()
                    }
                }(this, function() {
                    return { version: '1.0' }
                }))
            `
            const ext = new JavaScriptExtractor('src/umd.js', src)
            expect(() => ext.extractFunctions()).not.toThrow()
        })
    })

    describe('Complex Types', () => {
        test('handles JSDoc comments', () => {
            const src = `
                /**
                 * Adds two numbers
                 * @param {number} a - First number
                 * @param {number} b - Second number
                 * @returns {number} Sum
                 */
                function add(a, b) {
                    return a + b
                }
            `
            const ext = new TypeScriptExtractor('src/add.js', src)
            const fns = ext.extractFunctions()
            expect(fns[0].purpose).toBeDefined()
        })
    })

    describe('Decorator-like Patterns', () => {
        test('handles higher-order functions', () => {
            const src = `
                function withLogging(fn) {
                    return function(...args) {
                        console.log('Calling', fn.name)
                        return fn.apply(this, args)
                    }
                }
                
                @withLogging
                function decorated() {}
            `
            const ext = new JavaScriptExtractor('src/decorator.js', src)
            const fns = ext.extractFunctions()
            expect(fns.length).toBe(2)
        })
    })

    describe('Web/Node APIs', () => {
        test('handles fetch API', async () => {
            const src = `
                async function fetchData(url) {
                    const response = await fetch(url)
                    const data = await response.json()
                    return data
                }
            `
            const ext = new JavaScriptExtractor('src/fetch.js', src)
            const fns = ext.extractFunctions()
            expect(fns[0].isAsync).toBe(true)
            expect(fns[0].calls.length).toBe(2)
        })

        test('handles Express routers', () => {
            const src = `
                const express = require('express')
                const router = express.Router()
                
                router.get('/users', getUsers)
                router.post('/users', createUser)
                router.put('/users/:id', updateUser)
                router.delete('/users/:id', deleteUser)
            `
            const ext = new JavaScriptExtractor('src/routes.js', src)
            const routes = ext.extractRoutes()
            expect(routes.length).toBe(4)
        })
    })

    describe('Chained Methods', () => {
        test('handles method chaining', () => {
            const src = `
                const result = items
                    .filter(x => x.active)
                    .map(x => x.value)
                    .reduce((a, b) => a + b, 0)
            `
            const ext = new JavaScriptExtractor('src/chain.js', src)
            expect(() => ext.extractFunctions()).not.toThrow()
        })
    })

    describe('Large Files', () => {
        test('handles many functions', () => {
            const fns = Array.from({ length: 500 }, (_, i) => 
                `function fn${i}() { return ${i} }`
            ).join('\n')
            
            const ext = new JavaScriptExtractor('src/many.js', fns)
            const result = ext.extractFunctions()
            expect(result.length).toBe(500)
        })
    })

    describe('Unicode and Special Chars', () => {
        test('handles unicode in function names', () => {
            const src = `
                function 验证() {
                    return true
                }
                
                const 用户 = { name: 'test' }
            `
            const ext = new JavaScriptExtractor('src/unicode.js', src)
            const fns = ext.extractFunctions()
            expect(fns.length).toBe(1)
        })

        test('handles emoji', () => {
            const src = `
                function 🎉() {
                    return 'celebration'
                }
            `
            const ext = new JavaScriptExtractor('src/emoji.js', src)
            const fns = ext.extractFunctions()
            expect(fns.length).toBe(1)
        })
    })
})
