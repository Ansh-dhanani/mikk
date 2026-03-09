import { hashContent } from '../../hash/file-hasher.js'
import type {
    ParsedFunction, ParsedClass, ParsedImport, ParsedExport,
    ParsedParam, ParsedGeneric, ParsedRoute,
} from '../types.js'

// ─── Go builtins / keywords to skip when extracting calls ───────────────────
const GO_BUILTINS = new Set([
    'if', 'else', 'for', 'switch', 'select', 'case', 'default', 'break',
    'continue', 'goto', 'fallthrough', 'return', 'go', 'defer', 'range',
    'func', 'type', 'var', 'const', 'package', 'import', 'struct', 'interface',
    'map', 'chan', 'make', 'new', 'len', 'cap', 'append', 'copy', 'delete',
    'close', 'panic', 'recover', 'print', 'println', 'nil', 'true', 'false',
    'iota', 'string', 'int', 'int8', 'int16', 'int32', 'int64', 'uint',
    'uint8', 'uint16', 'uint32', 'uint64', 'uintptr', 'float32', 'float64',
    'complex64', 'complex128', 'bool', 'byte', 'rune', 'error', 'any',
])

// ─── Route detection patterns (Gin, Echo, Chi, Mux, net/http, Fiber) ────────
type RoutePattern = { re: RegExp; methodGroup: number; pathGroup: number; handlerGroup: number; fixedMethod?: string }

const ROUTE_PATTERNS: RoutePattern[] = [
    // Gin / Echo / Chi: r.GET("/path", handler)
    {
        re: /\b(?:router|r|e|app|v\d*|api|g|group|server)\.(GET|POST|PUT|DELETE|PATCH|OPTIONS|HEAD|Any|Use)\s*\(\s*"([^"]+)"\s*,\s*([\w.]+)/,
        methodGroup: 1, pathGroup: 2, handlerGroup: 3,
    },
    // Gorilla Mux: r.HandleFunc("/path", handler).Methods("GET")
    {
        re: /\b(?:r|router|mux)\.HandleFunc\s*\(\s*"([^"]+)"\s*,\s*([\w.]+).*?\.Methods\s*\(\s*"(GET|POST|PUT|DELETE|PATCH|OPTIONS|HEAD)"/,
        methodGroup: 3, pathGroup: 1, handlerGroup: 2,
    },
    // Gorilla Mux (no Methods): r.HandleFunc("/path", handler)
    {
        re: /\b(?:r|router|mux)\.HandleFunc\s*\(\s*"([^"]+)"\s*,\s*([\w.]+)/,
        methodGroup: -1, pathGroup: 1, handlerGroup: 2, fixedMethod: 'ANY',
    },
    // net/http: http.HandleFunc("/path", handler)
    {
        re: /http\.HandleFunc\s*\(\s*"([^"]+)"\s*,\s*([\w.]+)/,
        methodGroup: -1, pathGroup: 1, handlerGroup: 2, fixedMethod: 'ANY',
    },
    // Fiber / lowercase Chi: app.Get("/path", handler)
    {
        re: /\b(?:app|server)\.(Get|Post|Put|Delete|Patch|Options|Head|Use)\s*\(\s*"([^"]+)"\s*,\s*([\w.]+)/,
        methodGroup: 1, pathGroup: 2, handlerGroup: 3,
    },
]

/**
 * GoExtractor — pure regex + stateful line scanner for .go files.
 * Extracts functions, structs (as classes), imports, exports, and HTTP routes
 * without any external Go AST dependency.
 */
export class GoExtractor {
    private readonly lines: string[]

    constructor(
        private readonly filePath: string,
        private readonly content: string,
    ) {
        this.lines = content.split('\n')
    }

    // ── Public API ──────────────────────────────────────────────────────────

    /** Extract all top-level functions (no receiver) */
    extractFunctions(): ParsedFunction[] {
        return this.scanFunctions().filter(f => !f.receiverType)
            .map(f => this.buildParsedFunction(f))
    }

    /** Extract structs and interfaces as classes, with their receiver methods */
    extractClasses(): ParsedClass[] {
        const allMethods = this.scanFunctions().filter(f => !!f.receiverType)

        // Group methods by receiver type
        const byReceiver = new Map<string, ReturnType<typeof this.scanFunctions>[number][]>()
        for (const m of allMethods) {
            const arr = byReceiver.get(m.receiverType!) ?? []
            arr.push(m)
            byReceiver.set(m.receiverType!, arr)
        }

        const classes: ParsedClass[] = []

        // Structs / interfaces declared in this file
        for (const typeDecl of this.scanTypeDeclarations()) {
            const methods = byReceiver.get(typeDecl.name) ?? []
            classes.push({
                id: `cls:${this.filePath}:${typeDecl.name}`,
                name: typeDecl.name,
                file: this.filePath,
                startLine: typeDecl.startLine,
                endLine: typeDecl.endLine,
                isExported: isExported(typeDecl.name),
                purpose: typeDecl.purpose,
                methods: methods.map(m => this.buildParsedFunction(m)),
            })
            byReceiver.delete(typeDecl.name)
        }

        // Methods with no matching struct declaration (e.g. declared in another file)
        for (const [receiverType, methods] of byReceiver) {
            classes.push({
                id: `cls:${this.filePath}:${receiverType}`,
                name: receiverType,
                file: this.filePath,
                startLine: methods[0]?.startLine ?? 0,
                endLine: methods[methods.length - 1]?.endLine ?? 0,
                isExported: isExported(receiverType),
                methods: methods.map(m => this.buildParsedFunction(m)),
            })
        }

        return classes
    }

    extractImports(): ParsedImport[] {
        return this.parseImports()
    }

    extractExports(): ParsedExport[] {
        const fns = this.scanFunctions()
        const types = this.scanTypeDeclarations()
        const exports: ParsedExport[] = []

        for (const fn of fns) {
            if (isExported(fn.name)) {
                exports.push({ name: fn.name, type: 'function', file: this.filePath })
            }
        }
        for (const t of types) {
            if (isExported(t.name)) {
                exports.push({ name: t.name, type: t.kind === 'interface' ? 'interface' : 'class', file: this.filePath })
            }
        }

        return exports
    }

    extractRoutes(): ParsedRoute[] {
        const routes: ParsedRoute[] = []
        for (let i = 0; i < this.lines.length; i++) {
            const line = this.lines[i]
            for (const pat of ROUTE_PATTERNS) {
                const m = pat.re.exec(line)
                if (!m) continue
                const method = pat.fixedMethod ?? (pat.methodGroup > 0 ? m[pat.methodGroup].toUpperCase() : 'ANY')
                routes.push({
                    method,
                    path: m[pat.pathGroup],
                    handler: m[pat.handlerGroup],
                    middlewares: [],
                    file: this.filePath,
                    line: i + 1,
                })
            }
        }
        return routes
    }

    // ── Internal scanning ───────────────────────────────────────────────────

    /** Scanned raw function data (before building ParsedFunction) */
    private scanFunctions(): Array<{
        name: string
        receiverType?: string
        receiverVar?: string
        paramStr: string
        returnStr: string
        startLine: number
        bodyStart: number
        endLine: number
        purpose: string
    }> {
        const results: Array<{
            name: string
            receiverType?: string
            receiverVar?: string
            paramStr: string
            returnStr: string
            startLine: number
            bodyStart: number
            endLine: number
            purpose: string
        }> = []

        let i = 0
        while (i < this.lines.length) {
            const trimmed = this.lines[i].trimStart()

            // Only lines starting with `func`
            if (!trimmed.startsWith('func ') && !trimmed.startsWith('func\t')) {
                i++
                continue
            }

            const funcLineStart = i

            // Collect signature lines until we find the opening `{`
            const sigLines: string[] = []
            let j = i
            let foundOpen = false
            while (j < this.lines.length) {
                sigLines.push(this.lines[j])
                if (this.lines[j].includes('{')) {
                    foundOpen = true
                    break
                }
                j++
            }

            if (!foundOpen) { i++; continue }

            const sigRaw = sigLines.join(' ').replace(/\s+/g, ' ').trim()

            // Parse signature
            const parsed = parseGoFuncSignature(sigRaw)
            if (!parsed) { i++; continue }

            // Find body bounds
            const { bodyEnd } = findBodyBounds(this.lines, j)

            // Extract purpose from leading comment
            const purpose = extractLeadingComment(this.lines, funcLineStart)

            results.push({
                ...parsed,
                startLine: funcLineStart + 1,
                bodyStart: j + 1,
                endLine: bodyEnd + 1,
                purpose,
            })

            // Skip to after this function
            i = bodyEnd + 1
        }

        return results
    }

    /** Build ParsedFunction from scanned raw data */
    private buildParsedFunction(raw: ReturnType<typeof this.scanFunctions>[number]): ParsedFunction {
        const name = raw.receiverType ? `${raw.receiverType}.${raw.name}` : raw.name
        const id = `fn:${this.filePath}:${name}`

        const bodyLines = this.lines.slice(raw.bodyStart - 1, raw.endLine)
        const hash = hashContent(bodyLines.join('\n'))
        const calls = extractCallsFromBody(bodyLines)
        const edgeCases = extractEdgeCases(bodyLines)
        const errorHandling = extractErrorHandling(bodyLines, raw.bodyStart)

        return {
            id,
            name,
            file: this.filePath,
            startLine: raw.startLine,
            endLine: raw.endLine,
            params: parseGoParams(raw.paramStr),
            returnType: cleanReturnType(raw.returnStr),
            isExported: isExported(raw.name),
            isAsync: false, // Go has goroutines but no async keyword
            calls,
            hash,
            purpose: raw.purpose,
            edgeCasesHandled: edgeCases,
            errorHandling,
            detailedLines: [],
        }
    }

    /** Scan for type struct / type interface declarations */
    private scanTypeDeclarations(): Array<{
        name: string
        kind: 'struct' | 'interface'
        startLine: number
        endLine: number
        purpose: string
    }> {
        const results: Array<{
            name: string
            kind: 'struct' | 'interface'
            startLine: number
            endLine: number
            purpose: string
        }> = []

        for (let i = 0; i < this.lines.length; i++) {
            const trimmed = this.lines[i].trim()
            const m = /^type\s+(\w+)\s+(struct|interface)\s*\{?/.exec(trimmed)
            if (!m) continue

            const name = m[1]
            const kind = m[2] as 'struct' | 'interface'
            const purpose = extractLeadingComment(this.lines, i)

            // Find end of type block
            const { bodyEnd } = findBodyBounds(this.lines, i)
            results.push({
                name,
                kind,
                startLine: i + 1,
                endLine: bodyEnd + 1,
                purpose,
            })
            // Don't skip — nested types possible, but rare enough to leave sequential
        }

        return results
    }

    /** Parse all import declarations */
    private parseImports(): ParsedImport[] {
        const imports: ParsedImport[] = []
        let i = 0
        while (i < this.lines.length) {
            const trimmed = this.lines[i].trim()

            // Block import: import (...)
            if (trimmed === 'import (' || /^import\s+\($/.test(trimmed)) {
                i++
                while (i < this.lines.length) {
                    const iline = this.lines[i].trim()
                    if (iline === ')') break
                    const imp = parseImportLine(iline)
                    if (imp) imports.push(imp)
                    i++
                }
                i++
                continue
            }

            // Single import: import "pkg" or import alias "pkg"
            if (/^import\s+/.test(trimmed)) {
                const imp = parseImportLine(trimmed.replace(/^import\s+/, ''))
                if (imp) imports.push(imp)
            }

            i++
        }
        return imports
    }
}

// ─── Signature parsing ────────────────────────────────────────────────────────

interface GoFuncSignature {
    name: string
    receiverType?: string
    receiverVar?: string
    paramStr: string
    returnStr: string
}

/**
 * Find balanced (...) starting from `fromIdx` in `s`.
 * Returns the content between parens and the index of the closing paren.
 * Handles nested parens correctly, so `fn func(int) bool` extracts properly.
 */
function extractBalancedParens(s: string, fromIdx: number): { content: string; end: number } | null {
    const start = s.indexOf('(', fromIdx)
    if (start === -1) return null
    let depth = 0
    for (let i = start; i < s.length; i++) {
        if (s[i] === '(') depth++
        else if (s[i] === ')') {
            depth--
            if (depth === 0) return { content: s.slice(start + 1, i), end: i }
        }
    }
    return null
}

function parseGoFuncSignature(sig: string): GoFuncSignature | null {
    // Strip leading 'func ' prefix
    let rest = sig.replace(/^func\s+/, '')
    let receiverVar: string | undefined
    let receiverType: string | undefined

    // Method receiver: func (varName *ReceiverType) Name(...)
    if (rest.startsWith('(')) {
        const recv = extractBalancedParens(rest, 0)
        if (!recv) return null
        const recvMatch = /^(\w+)\s+\*?(\w+)/.exec(recv.content.trim())
        if (recvMatch) {
            receiverVar = recvMatch[1]
            // Strip generic brackets: Stack[T] → Stack
            receiverType = recvMatch[2].replace(/\[.*$/, '')
        }
        rest = rest.slice(recv.end + 1).trimStart()
    }

    // Function name, optionally with type params: Name[T any]
    const nameMatch = /^(\w+)\s*(?:\[[^\]]*\])?\s*/.exec(rest)
    if (!nameMatch) return null
    const name = nameMatch[1]
    rest = rest.slice(nameMatch[0].length)

    // Parameter list — uses balanced-paren extraction so func-typed params work
    const paramsResult = extractBalancedParens(rest, 0)
    if (!paramsResult) return null
    const paramStr = paramsResult.content.trim()

    // Return type: everything after params, before trailing `{`
    const returnStr = rest.slice(paramsResult.end + 1).replace(/\s*\{.*$/, '').trim()

    return { name, receiverType, receiverVar, paramStr, returnStr }
}

// ─── Parameter parsing ────────────────────────────────────────────────────────

function parseGoParams(paramStr: string): ParsedParam[] {
    if (!paramStr.trim()) return []

    const params: Array<{ name: string; type: string }> = []
    const parts = splitTopLevel(paramStr, ',').map(p => p.trim()).filter(Boolean)

    for (const part of parts) {
        // Variadic: name ...Type
        const variadicRe = /^(\w+)\s+\.\.\.(.+)$/.exec(part)
        if (variadicRe) {
            params.push({ name: variadicRe[1], type: '...' + variadicRe[2].trim() })
            continue
        }

        // Named with type: name Type (space-separated, e.g. "ctx context.Context")
        const namedRe = /^(\w+)\s+(\S.*)$/.exec(part)
        if (namedRe) {
            params.push({ name: namedRe[1], type: namedRe[2].trim() })
            continue
        }

        // Single token — could be a grouped name (e.g. "first" in "first, last string")
        // or an unnamed type (e.g. "int" in "(int, string)").
        // Heuristic: Go builtin types, pointer/slice/qualified types → unnamed; else grouped name.
        if (looksLikeGoType(part)) {
            params.push({ name: '_', type: part })
        } else {
            params.push({ name: part, type: '' }) // grouped name — back-filled below
        }
    }

    // Back-fill grouped params: "first, last string" → first.type = last.type = "string"
    // Scan right-to-left: if a param has no type but the next one does, inherit it
    for (let i = params.length - 2; i >= 0; i--) {
        if (params[i].type === '' && params[i + 1].type !== '') {
            params[i].type = params[i + 1].type
        }
    }

    return params.map(p => ({
        name: p.name || '_',
        type: p.type || 'any',
        optional: false,
    }))
}

/**
 * Returns true when a bare single-token parameter is a type annotation rather
 * than a parameter name in a grouped declaration like `(first, last string)`.
 */
function looksLikeGoType(token: string): boolean {
    if (!token) return false
    const ch = token[0]
    // Pointer (*int), slice ([]byte), or channel (chan)
    if (ch === '*' || ch === '[' || ch === '<') return true
    // Go builtin types and keywords
    if (GO_BUILTINS.has(token)) return true
    // Exported named type (e.g. Context, ResponseWriter)
    if (ch >= 'A' && ch <= 'Z') return true
    // Qualified type (e.g. context.Context, http.Request)
    if (token.includes('.')) return true
    return false
}

function cleanReturnType(ret: string): string {
    // Strip trailing `{`
    ret = ret.replace(/\s*\{.*$/, '').trim()
    // Clean up multiple return: (Type1, Type2) → keep as-is for readability
    return ret
}

// ─── Import line parsing ──────────────────────────────────────────────────────

function parseImportLine(line: string): ParsedImport | null {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('//')) return null

    // Blank import: _ "pkg"
    if (/^_\s+"/.test(trimmed)) return null

    // Aliased: alias "pkg"
    const aliasRe = /^(\w+)\s+"([^"]+)"/.exec(trimmed)
    if (aliasRe) {
        const [, alias, pkg] = aliasRe
        return { source: pkg, resolvedPath: '', names: [alias], isDefault: false, isDynamic: false }
    }

    // Plain: "pkg"
    const plainRe = /^"([^"]+)"/.exec(trimmed)
    if (plainRe) {
        const pkg = plainRe[1]
        // Package name is the last segment of the import path
        const name = pkg.split('/').pop() ?? pkg
        return { source: pkg, resolvedPath: '', names: [name], isDefault: false, isDynamic: false }
    }

    return null
}

// ─── Body analysis ────────────────────────────────────────────────────────────

/**
 * Statefully track brace depth through content, handling:
 *  - string literals ("...", `...`), rune literals ('.')
 *  - line comments (//)
 *  - block comments (/* ... *​/)
 */
function findBodyBounds(lines: string[], startLine: number): { bodyStart: number; bodyEnd: number } {
    let braceDepth = 0
    let bodyStart = -1
    let inString = false
    let stringChar = ''
    let inBlockComment = false

    for (let i = startLine; i < lines.length; i++) {
        const line = lines[i]
        let inLineComment = false

        for (let j = 0; j < line.length; j++) {
            const ch = line[j]
            const next = line[j + 1]

            if (inLineComment) break

            if (inBlockComment) {
                if (ch === '*' && next === '/') { inBlockComment = false; j++ }
                continue
            }

            if (inString) {
                if (ch === '\\') { j++; continue } // escape sequence
                if (ch === stringChar) inString = false
                continue
            }

            if (ch === '/' && next === '/') { inLineComment = true; break }
            if (ch === '/' && next === '*') { inBlockComment = true; j++; continue }
            if (ch === '"' || ch === '`' || ch === '\'') {
                inString = true
                stringChar = ch
                continue
            }

            if (ch === '{') {
                if (bodyStart === -1) bodyStart = i
                braceDepth++
            } else if (ch === '}') {
                braceDepth--
                if (braceDepth === 0 && bodyStart !== -1) {
                    return { bodyStart, bodyEnd: i }
                }
            }
        }
    }

    return { bodyStart: bodyStart === -1 ? startLine : bodyStart, bodyEnd: lines.length - 1 }
}

function stripStringsAndComments(code: string): string {
    let out = ''
    let i = 0
    let inString = false
    let stringChar = ''
    let inBlockComment = false

    while (i < code.length) {
        const ch = code[i]
        const next = code[i + 1]

        if (inBlockComment) {
            if (ch === '*' && next === '/') { inBlockComment = false; i += 2 }
            else i++
            continue
        }

        if (inString) {
            if (ch === '\\') { i += 2; continue }
            if (ch === stringChar) { inString = false }
            i++
            continue
        }

        if (ch === '/' && next === '/') {
            // Skip to end of line
            while (i < code.length && code[i] !== '\n') i++
            continue
        }
        if (ch === '/' && next === '*') { inBlockComment = true; i += 2; continue }
        if (ch === '"' || ch === '`' || ch === '\'') {
            inString = true
            stringChar = ch
            i++
            continue
        }

        out += ch
        i++
    }
    return out
}

function extractCallsFromBody(bodyLines: string[]): string[] {
    const stripped = stripStringsAndComments(bodyLines.join('\n'))
    const calls = new Set<string>()

    // Direct calls: identifier(
    const callRe = /\b([A-Za-z_]\w*)\s*\(/g
    let m: RegExpExecArray | null
    while ((m = callRe.exec(stripped)) !== null) {
        const name = m[1]
        if (!GO_BUILTINS.has(name)) calls.add(name)
    }

    // Method calls: receiver.Method(
    const methodRe = /\b([A-Za-z_]\w+\.[A-Za-z_]\w*)\s*\(/g
    while ((m = methodRe.exec(stripped)) !== null) {
        calls.add(m[1])
    }

    return [...calls]
}

function extractEdgeCases(bodyLines: string[]): string[] {
    const edgeCases: string[] = []
    for (let i = 0; i < bodyLines.length; i++) {
        const trimmed = bodyLines[i].trim()
        // if condition followed by return/panic/error
        const m = /^if\s+(.+?)\s*\{?\s*$/.exec(trimmed)
        if (m && bodyLines[i + 1]?.trim().match(/^(return|panic|log\.|fmt\.)/)) {
            edgeCases.push(m[1].trim())
        }
    }
    return edgeCases
}

function extractErrorHandling(bodyLines: string[], baseLineNumber: number): { line: number; type: 'try-catch' | 'throw'; detail: string }[] {
    const errors: { line: number; type: 'try-catch' | 'throw'; detail: string }[] = []
    for (let i = 0; i < bodyLines.length; i++) {
        const trimmed = bodyLines[i].trim()
        // if err != nil { return ..., err }
        if (/^if\s+\w*err\w*\s*!=\s*nil/.test(trimmed)) {
            errors.push({ line: baseLineNumber + i, type: 'try-catch', detail: trimmed })
        }
        // panic(...)
        if (/^panic\(/.test(trimmed)) {
            errors.push({ line: baseLineNumber + i, type: 'throw', detail: trimmed })
        }
    }
    return errors
}

// ─── Comment extraction ───────────────────────────────────────────────────────

function extractLeadingComment(lines: string[], funcLine: number): string {
    // Scan backwards from funcLine for consecutive comment lines
    const commentLines: string[] = []
    let i = funcLine - 1
    while (i >= 0) {
        const trimmed = lines[i].trim()
        if (trimmed.startsWith('//')) {
            commentLines.unshift(trimmed.replace(/^\/\/\s?/, ''))
        } else if (trimmed === '') {
            break
        } else {
            break
        }
        i--
    }
    // First meaningful non-divider line
    for (const line of commentLines) {
        if (/^[-=*─]{3,}$/.test(line)) continue
        return line.trim()
    }
    return ''
}

// ─── Utility helpers ──────────────────────────────────────────────────────────

function isExported(name: string): boolean {
    return name.length > 0 && name[0] === name[0].toUpperCase() && name[0] !== name[0].toLowerCase()
}

/** Split string by delimiter, ignoring delimiters inside parens/brackets */
function splitTopLevel(str: string, delimiter: string): string[] {
    const parts: string[] = []
    let depth = 0
    let current = ''
    for (const ch of str) {
        if (ch === '(' || ch === '[' || ch === '{') depth++
        else if (ch === ')' || ch === ']' || ch === '}') depth--
        else if (ch === delimiter && depth === 0) {
            parts.push(current)
            current = ''
            continue
        }
        current += ch
    }
    if (current.trim()) parts.push(current)
    return parts
}
