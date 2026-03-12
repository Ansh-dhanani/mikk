import { describe, test, expect } from 'bun:test'
import { JavaScriptExtractor } from '../src/parser/javascript/js-extractor'
import { JavaScriptParser } from '../src/parser/javascript/js-parser'
import { JavaScriptResolver } from '../src/parser/javascript/js-resolver'
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

    test('parse returns language: javascript', () => {
        const result = parser.parse('src/index.js', CJS_MODULE)
        expect(result.language).toBe('javascript')
    })

    test('parse includes hash and parsedAt', () => {
        const result = parser.parse('src/index.js', CJS_MODULE)
        expect(typeof result.hash).toBe('string')
        expect(result.hash.length).toBe(64) // SHA-256 hex
        expect(typeof result.parsedAt).toBe('number')
    })

    test('CJS-exported functions are marked isExported via cross-reference', () => {
        const result = parser.parse('src/auth.js', CJS_MODULE)
        const hashPw = result.functions.find(f => f.name === 'hashPassword')
        expect(hashPw).toBeDefined()
        expect(hashPw!.isExported).toBe(true)
    })

    test('resolveImports resolves relative paths with .js extension probing', () => {
        const files = [
            parser.parse('src/auth.js', CJS_MODULE),
            parser.parse('src/loader.js', ESM_MODULE),
        ]
        const resolved = parser.resolveImports(files, '/project')
        const authFile = resolved.find(f => f.path === 'src/auth.js')!
        const dbImport = authFile.imports.find(i => i.source === './db')
        expect(dbImport!.resolvedPath).toMatch(/src\/db/)
        expect(dbImport!.resolvedPath).toMatch(/\.js$/)
    })

    test('resolveImports leaves external packages unresolved (empty resolvedPath)', () => {
        const files = [parser.parse('src/auth.js', CJS_MODULE)]
        const resolved = parser.resolveImports(files, '/project')
        const file = resolved[0]
        const cryptoImp = file.imports.find(i => i.source === 'crypto')
        expect(cryptoImp!.resolvedPath).toBe('')
    })

    test('parse .jsx file language is javascript', () => {
        const result = parser.parse('src/UserCard.jsx', JSX_COMPONENT)
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

    test('still throws UnsupportedLanguageError for .py', () => {
        expect(() => getParser('src/app.py')).toThrow()
    })
})
