/**
 * Parser types — data shapes that flow through the entire Mikk system.
 * Parser produces them, graph consumes them, contract stores them.
 */

/** A single parameter in a function signature */
export interface ParsedParam {
    name: string
    type: string
    optional: boolean
    defaultValue?: string
}

export interface ParsedFunction {
    id: string              // "fn:auth/verify.ts:verifyToken"
    name: string            // "verifyToken"
    file: string            // "src/auth/verify.ts"
    startLine: number       // 14
    endLine: number         // 28
    params: ParsedParam[]   // [{name: "token", type: "string"}]
    returnType: string      // "boolean"
    isExported: boolean     // true
    isAsync: boolean        // false
    calls: string[]         // ["jwtDecode", "findUser"]
    hash: string            // SHA-256 of the function body
    purpose: string         // Extracted from JSDoc or comments
    edgeCasesHandled: string[] // Found conditions like 'if (!x) return'
    errorHandling: { line: number, type: 'try-catch' | 'throw', detail: string }[]
    detailedLines: { startLine: number, endLine: number, blockType: string }[]
}

/** A single import statement */
export interface ParsedImport {
    source: string          // "../../utils/jwt"
    resolvedPath: string    // "src/utils/jwt.ts" (absolute within project)
    names: string[]         // ["jwtDecode", "jwtSign"]
    isDefault: boolean      // false
    isDynamic: boolean      // false
}

/** A single exported symbol */
export interface ParsedExport {
    name: string            // "verifyToken"
    type: 'function' | 'class' | 'const' | 'type' | 'default' | 'interface'
    file: string
}

/** A parsed class */
export interface ParsedClass {
    id: string
    name: string
    file: string
    startLine: number
    endLine: number
    methods: ParsedFunction[]
    isExported: boolean
}

/** Everything extracted from a single file */
export interface ParsedFile {
    path: string            // "src/auth/verify.ts"
    language: 'typescript' | 'python'
    functions: ParsedFunction[]
    classes: ParsedClass[]
    imports: ParsedImport[]
    exports: ParsedExport[]
    hash: string            // SHA-256 of the entire file content
    parsedAt: number        // Date.now()
}
