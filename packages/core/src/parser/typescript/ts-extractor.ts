import ts from 'typescript'
import type { ParsedFunction, ParsedClass, ParsedImport, ParsedExport, ParsedParam, ParsedGeneric, ParsedRoute } from '../types.js'
import { hashContent } from '../../hash/file-hasher.js'

/**
 * TypeScript AST extractor — walks the TypeScript AST using the TS Compiler API
 * and extracts functions, classes, imports, exports and call relationships.
 */
export class TypeScriptExtractor {
    protected readonly sourceFile: ts.SourceFile

    constructor(
        protected readonly filePath: string,
        protected readonly content: string
    ) {
        this.sourceFile = ts.createSourceFile(
            filePath,
            content,
            ts.ScriptTarget.Latest,
            true, // setParentNodes
            this.inferScriptKind(filePath)
        )
    }

    /** Infer TypeScript ScriptKind from file extension (supports JS/JSX/TS/TSX) */
    private inferScriptKind(filePath: string): ts.ScriptKind {
        if (filePath.endsWith('.tsx')) return ts.ScriptKind.TSX
        if (filePath.endsWith('.jsx')) return ts.ScriptKind.JSX
        if (filePath.endsWith('.js') || filePath.endsWith('.mjs') || filePath.endsWith('.cjs')) return ts.ScriptKind.JS
        return ts.ScriptKind.TS
    }

    /** Extract all top-level and variable-assigned functions */
    extractFunctions(): ParsedFunction[] {
        const functions: ParsedFunction[] = []
        this.walkNode(this.sourceFile, (node) => {
            // function declarations: function foo() {}
            if (ts.isFunctionDeclaration(node) && node.name) {
                functions.push(this.parseFunctionDeclaration(node))
            }
            // variable declarations with arrow functions or function expressions:
            // const foo = () => {} or const foo = function() {}
            if (ts.isVariableStatement(node)) {
                for (const decl of node.declarationList.declarations) {
                    if (decl.initializer && ts.isIdentifier(decl.name)) {
                        if (
                            ts.isArrowFunction(decl.initializer) ||
                            ts.isFunctionExpression(decl.initializer)
                        ) {
                            functions.push(this.parseVariableFunction(node, decl, decl.initializer))
                        }
                    }
                }
            }
        })
        return functions
    }

    /** Extract all class declarations */
    extractClasses(): ParsedClass[] {
        const classes: ParsedClass[] = []
        this.walkNode(this.sourceFile, (node) => {
            if (ts.isClassDeclaration(node) && node.name) {
                classes.push(this.parseClass(node))
            }
        })
        return classes
    }

    /** Extract generic declarations (interfaces, types, constants with metadata) */
    extractGenerics(): ParsedGeneric[] {
        const generics: ParsedGeneric[] = []
        this.walkNode(this.sourceFile, (node) => {
            if (ts.isInterfaceDeclaration(node)) {
                const tp = this.extractTypeParameters(node.typeParameters)
                generics.push({
                    id: `intf:${this.filePath}:${node.name.text}`,
                    name: node.name.text,
                    type: 'interface',
                    file: this.filePath,
                    startLine: this.getLineNumber(node.getStart()),
                    endLine: this.getLineNumber(node.getEnd()),
                    isExported: this.hasExportModifier(node),
                    ...(tp.length > 0 ? { typeParameters: tp } : {}),
                    purpose: this.extractPurpose(node),
                })
            } else if (ts.isTypeAliasDeclaration(node)) {
                const tp = this.extractTypeParameters(node.typeParameters)
                generics.push({
                    id: `type:${this.filePath}:${node.name.text}`,
                    name: node.name.text,
                    type: 'type',
                    file: this.filePath,
                    startLine: this.getLineNumber(node.getStart()),
                    endLine: this.getLineNumber(node.getEnd()),
                    isExported: this.hasExportModifier(node),
                    ...(tp.length > 0 ? { typeParameters: tp } : {}),
                    purpose: this.extractPurpose(node),
                })
            } else if (ts.isVariableStatement(node) && !this.isVariableFunction(node)) {
                // top-level constants (not functions)
                for (const decl of node.declarationList.declarations) {
                    if (ts.isIdentifier(decl.name)) {
                        generics.push({
                            id: `const:${this.filePath}:${decl.name.text}`,
                            name: decl.name.text,
                            type: 'const',
                            file: this.filePath,
                            startLine: this.getLineNumber(node.getStart()),
                            endLine: this.getLineNumber(node.getEnd()),
                            isExported: this.hasExportModifier(node),
                            purpose: this.extractPurpose(node),
                        })
                    }
                }
            }
        })
        return generics
    }

    protected isVariableFunction(node: ts.VariableStatement): boolean {
        for (const decl of node.declarationList.declarations) {
            if (decl.initializer && (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer))) {
                return true
            }
        }
        return false
    }

    /** Extract all import statements (static and dynamic) */
    extractImports(): ParsedImport[] {
        const imports: ParsedImport[] = []
        this.walkNode(this.sourceFile, (node) => {
            if (ts.isImportDeclaration(node)) {
                const parsed = this.parseImport(node)
                if (parsed) imports.push(parsed)
            }
        })

        // Also detect dynamic import() calls: await import('./path')
        const walkDynamic = (n: ts.Node) => {
            if (ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword) {
                const arg = n.arguments[0]
                if (arg && ts.isStringLiteral(arg)) {
                    imports.push({
                        source: arg.text,
                        resolvedPath: '', // Filled in by resolver
                        names: [],
                        isDefault: false,
                        isDynamic: true,
                    })
                }
            }
            ts.forEachChild(n, walkDynamic)
        }
        ts.forEachChild(this.sourceFile, walkDynamic)

        return imports
    }

    /** Extract all exported symbols */
    extractExports(): ParsedExport[] {
        const exports: ParsedExport[] = []
        this.walkNode(this.sourceFile, (node) => {
            // export function foo() {}
            if (ts.isFunctionDeclaration(node) && node.name && this.hasExportModifier(node)) {
                exports.push({
                    name: node.name.text,
                    type: 'function',
                    file: this.filePath,
                })
            }
            // export class Foo {}
            if (ts.isClassDeclaration(node) && node.name && this.hasExportModifier(node)) {
                exports.push({
                    name: node.name.text,
                    type: 'class',
                    file: this.filePath,
                })
            }
            // export const foo = ...
            if (ts.isVariableStatement(node) && this.hasExportModifier(node)) {
                for (const decl of node.declarationList.declarations) {
                    if (ts.isIdentifier(decl.name)) {
                        const type = decl.initializer &&
                            (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer))
                            ? 'function' : 'const'
                        exports.push({
                            name: decl.name.text,
                            type: type as ParsedExport['type'],
                            file: this.filePath,
                        })
                    }
                }
            }
            // export interface Foo {}
            if (ts.isInterfaceDeclaration(node) && this.hasExportModifier(node)) {
                exports.push({
                    name: node.name.text,
                    type: 'interface',
                    file: this.filePath,
                })
            }
            // export type Foo = ...
            if (ts.isTypeAliasDeclaration(node) && this.hasExportModifier(node)) {
                exports.push({
                    name: node.name.text,
                    type: 'type',
                    file: this.filePath,
                })
            }
            // export default ...
            if (ts.isExportAssignment(node)) {
                const name = node.expression && ts.isIdentifier(node.expression) ? node.expression.text : 'default'
                exports.push({
                    name,
                    type: 'default',
                    file: this.filePath,
                })
            }
            // export { foo, bar } from './module'
            if (ts.isExportDeclaration(node) && node.exportClause && ts.isNamedExports(node.exportClause)) {
                for (const element of node.exportClause.elements) {
                    exports.push({
                        name: element.name.text,
                        type: 'const',
                        file: this.filePath,
                    })
                }
            }
        })
        return exports
    }

    /**
     * Extract HTTP route registrations.
     * Detects Express/Koa/Hono patterns like:
     *   router.get("/path", handler)
     *   app.post("/path", middleware, handler)
     *   app.use("/prefix", subrouter)
     *   router.use(middleware)
     */
    extractRoutes(): ParsedRoute[] {
        const routes: ParsedRoute[] = []
        const HTTP_METHODS = new Set(['get', 'post', 'put', 'delete', 'patch', 'head', 'options', 'all', 'use'])
        // Only detect routes on receiver objects that look like routers/apps
        const ROUTER_NAMES = new Set(['app', 'router', 'server', 'route', 'api', 'express'])

        const walk = (node: ts.Node) => {
            if (
                ts.isCallExpression(node) &&
                ts.isPropertyAccessExpression(node.expression)
            ) {
                const methodName = node.expression.name.text.toLowerCase()
                if (HTTP_METHODS.has(methodName)) {
                    // Check if the receiver is a known router/app-like identifier
                    const receiver = node.expression.expression
                    let receiverName = ''
                    if (ts.isIdentifier(receiver)) {
                        receiverName = receiver.text.toLowerCase()
                    } else if (ts.isPropertyAccessExpression(receiver) && ts.isIdentifier(receiver.expression)) {
                        receiverName = receiver.expression.text.toLowerCase()
                    }

                    // Skip if receiver doesn't look like a router (e.g. prisma.file.delete)
                    if (!ROUTER_NAMES.has(receiverName)) {
                        ts.forEachChild(node, walk)
                        return
                    }

                    const args = node.arguments
                    let routePath = ''
                    const middlewares: string[] = []
                    let handler = 'anonymous'

                    for (let i = 0; i < args.length; i++) {
                        const arg = args[i]
                        // First string literal is the route path
                        if (ts.isStringLiteral(arg) && !routePath) {
                            routePath = arg.text
                        } else if (ts.isIdentifier(arg)) {
                            // Last identifier is the handler; earlier ones are middleware
                            if (i === args.length - 1) {
                                handler = arg.text
                            } else {
                                middlewares.push(arg.text)
                            }
                        } else if (ts.isCallExpression(arg)) {
                            // e.g. upload.single("file") — middleware call
                            middlewares.push(arg.expression.getText(this.sourceFile))
                        } else if (ts.isArrowFunction(arg) || ts.isFunctionExpression(arg)) {
                            handler = 'anonymous'
                        }
                    }

                    routes.push({
                        method: methodName.toUpperCase(),
                        path: routePath || '*',
                        handler,
                        middlewares,
                        file: this.filePath,
                        line: this.getLineNumber(node.getStart()),
                    })
                }
            }
            ts.forEachChild(node, walk)
        }
        ts.forEachChild(this.sourceFile, walk)
        return routes
    }

    // ─── Protected Helpers ─────────────────────────────────────

    protected parseFunctionDeclaration(node: ts.FunctionDeclaration): ParsedFunction {
        const name = node.name!.text
        const startLine = this.getLineNumber(node.getStart())
        const endLine = this.getLineNumber(node.getEnd())
        const params = this.extractParams(node.parameters)
        const returnType = normalizeTypeAnnotation(node.type ? node.type.getText(this.sourceFile) : 'void')
        const isAsync = !!node.modifiers?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword)
        const isGenerator = !!node.asteriskToken
        const typeParameters = this.extractTypeParameters(node.typeParameters)
        const calls = this.extractCalls(node)
        const bodyText = node.getText(this.sourceFile)

        return {
            id: `fn:${this.filePath}:${name}`,
            name,
            file: this.filePath,
            startLine,
            endLine,
            params,
            returnType,
            isExported: this.hasExportModifier(node),
            isAsync,
            ...(isGenerator ? { isGenerator } : {}),
            ...(typeParameters.length > 0 ? { typeParameters } : {}),
            calls,
            hash: hashContent(bodyText),
            purpose: this.extractPurpose(node),
            edgeCasesHandled: this.extractEdgeCases(node),
            errorHandling: this.extractErrorHandling(node),
            detailedLines: this.extractDetailedLines(node),
        }
    }

    protected parseVariableFunction(
        stmt: ts.VariableStatement,
        decl: ts.VariableDeclaration,
        fn: ts.ArrowFunction | ts.FunctionExpression
    ): ParsedFunction {
        const name = (decl.name as ts.Identifier).text
        const startLine = this.getLineNumber(stmt.getStart())
        const endLine = this.getLineNumber(stmt.getEnd())
        const params = this.extractParams(fn.parameters)
        const returnType = normalizeTypeAnnotation(fn.type ? fn.type.getText(this.sourceFile) : 'void')
        const isAsync = !!fn.modifiers?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword)
        const isGenerator = ts.isFunctionExpression(fn) && !!fn.asteriskToken
        const typeParameters = this.extractTypeParameters(fn.typeParameters)
        const calls = this.extractCalls(fn)
        const bodyText = stmt.getText(this.sourceFile)

        return {
            id: `fn:${this.filePath}:${name}`,
            name,
            file: this.filePath,
            startLine,
            endLine,
            params,
            returnType,
            isExported: this.hasExportModifier(stmt),
            isAsync,
            ...(isGenerator ? { isGenerator } : {}),
            ...(typeParameters.length > 0 ? { typeParameters } : {}),
            calls,
            hash: hashContent(bodyText),
            purpose: this.extractPurpose(stmt),
            edgeCasesHandled: this.extractEdgeCases(fn),
            errorHandling: this.extractErrorHandling(fn),
            detailedLines: this.extractDetailedLines(fn),
        }
    }

    protected parseClass(node: ts.ClassDeclaration): ParsedClass {
        const name = node.name!.text
        const startLine = this.getLineNumber(node.getStart())
        const endLine = this.getLineNumber(node.getEnd())
        const methods: ParsedFunction[] = []
        const decorators = this.extractDecorators(node)
        const typeParameters = this.extractTypeParameters(node.typeParameters)

        for (const member of node.members) {
            if (ts.isConstructorDeclaration(member)) {
                // Track class constructors as methods
                const mStartLine = this.getLineNumber(member.getStart())
                const mEndLine = this.getLineNumber(member.getEnd())
                const params = this.extractParams(member.parameters)
                const calls = this.extractCalls(member)
                const bodyText = member.getText(this.sourceFile)

                methods.push({
                    id: `fn:${this.filePath}:${name}.constructor`,
                    name: `${name}.constructor`,
                    file: this.filePath,
                    startLine: mStartLine,
                    endLine: mEndLine,
                    params,
                    returnType: name,
                    isExported: this.hasExportModifier(node),
                    isAsync: false,
                    calls,
                    hash: hashContent(bodyText),
                    purpose: this.extractPurpose(member),
                    edgeCasesHandled: this.extractEdgeCases(member),
                    errorHandling: this.extractErrorHandling(member),
                    detailedLines: this.extractDetailedLines(member),
                })
            } else if (ts.isMethodDeclaration(member) && member.name) {
                const methodName = member.name.getText(this.sourceFile)
                const mStartLine = this.getLineNumber(member.getStart())
                const mEndLine = this.getLineNumber(member.getEnd())
                const params = this.extractParams(member.parameters)
                const returnType = normalizeTypeAnnotation(member.type ? member.type.getText(this.sourceFile) : 'void')
                const isAsync = !!member.modifiers?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword)
                const isGenerator = !!member.asteriskToken
                const methodTypeParams = this.extractTypeParameters(member.typeParameters)
                const calls = this.extractCalls(member)
                const bodyText = member.getText(this.sourceFile)

                methods.push({
                    id: `fn:${this.filePath}:${name}.${methodName}`,
                    name: `${name}.${methodName}`,
                    file: this.filePath,
                    startLine: mStartLine,
                    endLine: mEndLine,
                    params,
                    returnType,
                    isExported: this.hasExportModifier(node),
                    isAsync,
                    ...(isGenerator ? { isGenerator } : {}),
                    ...(methodTypeParams.length > 0 ? { typeParameters: methodTypeParams } : {}),
                    calls,
                    hash: hashContent(bodyText),
                    purpose: this.extractPurpose(member),
                    edgeCasesHandled: this.extractEdgeCases(member),
                    errorHandling: this.extractErrorHandling(member),
                    detailedLines: this.extractDetailedLines(member),
                })
            }
        }

        return {
            id: `class:${this.filePath}:${name}`,
            name,
            file: this.filePath,
            startLine,
            endLine,
            methods,
            isExported: this.hasExportModifier(node),
            ...(decorators.length > 0 ? { decorators } : {}),
            ...(typeParameters.length > 0 ? { typeParameters } : {}),
            purpose: this.extractPurpose(node),
            edgeCasesHandled: this.extractEdgeCases(node),
            errorHandling: this.extractErrorHandling(node),
        }
    }

    protected parseImport(node: ts.ImportDeclaration): ParsedImport | null {
        const source = (node.moduleSpecifier as ts.StringLiteral).text
        const names: string[] = []
        let isDefault = false

        if (node.importClause) {
            // import Foo from './module' (default import)
            if (node.importClause.name) {
                names.push(node.importClause.name.text)
                isDefault = true
            }
            // import { foo, bar } from './module'
            if (node.importClause.namedBindings) {
                if (ts.isNamedImports(node.importClause.namedBindings)) {
                    for (const element of node.importClause.namedBindings.elements) {
                        names.push(element.name.text)
                    }
                }
                // import * as foo from './module'
                if (ts.isNamespaceImport(node.importClause.namedBindings)) {
                    names.push(node.importClause.namedBindings.name.text)
                }
            }
        }

        // Skip type-only imports
        if (node.importClause?.isTypeOnly) return null

        return {
            source,
            resolvedPath: '', // Filled in by resolver
            names,
            isDefault,
            isDynamic: false,
        }
    }

    /** Extract function/method call expressions from a node (including new Foo()) */
    protected extractCalls(node: ts.Node): string[] {
        const calls: string[] = []
        const walkCalls = (n: ts.Node) => {
            if (ts.isCallExpression(n)) {
                const callee = n.expression
                if (ts.isIdentifier(callee)) {
                    calls.push(callee.text)
                } else if (ts.isPropertyAccessExpression(callee)) {
                    // e.g., obj.method() — we capture the full dotted name
                    calls.push(callee.getText(this.sourceFile))
                }
            }
            // Track constructor calls: new Foo(...) → "Foo"
            if (ts.isNewExpression(n)) {
                const callee = n.expression
                if (ts.isIdentifier(callee)) {
                    calls.push(callee.text)
                } else if (ts.isPropertyAccessExpression(callee)) {
                    calls.push(callee.getText(this.sourceFile))
                }
            }
            ts.forEachChild(n, walkCalls)
        }
        ts.forEachChild(node, walkCalls)
        return [...new Set(calls)] // deduplicate
    }

    /** Extract the purpose from JSDoc comments or preceding single-line comments.
     *  Falls back to deriving a human-readable sentence from the function name. */
    protected extractPurpose(node: ts.Node): string {
        const fullText = this.sourceFile.getFullText()
        const commentRanges = ts.getLeadingCommentRanges(fullText, node.getFullStart())
        if (commentRanges && commentRanges.length > 0) {
            const meaningfulLines: string[] = []
            for (const range of commentRanges) {
                const comment = fullText.slice(range.pos, range.end)
                let clean = ''
                if (comment.startsWith('/**') || comment.startsWith('/*')) {
                    clean = comment.replace(/[\/\*]/g, '').trim()
                } else if (comment.startsWith('//')) {
                    clean = comment.replace(/\/\//g, '').trim()
                }

                // Skip divider lines (lines with 3+ repeated special characters)
                if (/^[─\-_=\*]{3,}$/.test(clean)) continue

                if (clean) meaningfulLines.push(clean)
            }

            // Return the first meaningful line — in JSDoc, the first line is the summary.
            const fromComment = meaningfulLines.length > 0 ? meaningfulLines[0].split('\n')[0].trim() : ''
            if (fromComment) return fromComment
        }

        // Fallback: derive a human-readable sentence from the function/identifier name
        const name = this.getNodeName(node)
        return name ? derivePurposeFromName(name) : ''
    }

    /** Get the identifier name from common declaration node types */
    protected getNodeName(node: ts.Node): string {
        if (ts.isFunctionDeclaration(node) && node.name) return node.name.text
        if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
            const parent = node.parent
            if (parent && ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
                return parent.name.text
            }
        }
        if (ts.isMethodDeclaration(node) && ts.isIdentifier(node.name)) return node.name.text
        if (ts.isConstructorDeclaration(node)) return 'constructor'
        if ((ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node) || ts.isClassDeclaration(node)) && node.name) {
            return (node as any).name.text
        }
        return ''
    }

    /** Extract edge cases handled (if statements returning early) */
    protected extractEdgeCases(node: ts.Node): string[] {
        const edgeCases: string[] = []
        const walkEdgeCases = (n: ts.Node) => {
            if (ts.isIfStatement(n)) {
                // simple heuristic for early returns inside if blocks
                if (
                    ts.isReturnStatement(n.thenStatement) ||
                    (ts.isBlock(n.thenStatement) && n.thenStatement.statements.some(ts.isReturnStatement)) ||
                    ts.isThrowStatement(n.thenStatement) ||
                    (ts.isBlock(n.thenStatement) && n.thenStatement.statements.some(ts.isThrowStatement))
                ) {
                    edgeCases.push(n.expression.getText(this.sourceFile))
                }
            }
            ts.forEachChild(n, walkEdgeCases)
        }
        ts.forEachChild(node, walkEdgeCases)
        return edgeCases
    }

    /** Extract try-catch blocks or explicit throw statements */
    protected extractErrorHandling(node: ts.Node): { line: number, type: 'try-catch' | 'throw', detail: string }[] {
        const errors: { line: number, type: 'try-catch' | 'throw', detail: string }[] = []
        const walkErrors = (n: ts.Node) => {
            if (ts.isTryStatement(n)) {
                errors.push({
                    line: this.getLineNumber(n.getStart()),
                    type: 'try-catch',
                    detail: 'try-catch block'
                })
            }
            if (ts.isThrowStatement(n)) {
                errors.push({
                    line: this.getLineNumber(n.getStart()),
                    type: 'throw',
                    detail: n.expression ? n.expression.getText(this.sourceFile) : 'throw error'
                })
            }
            ts.forEachChild(n, walkErrors)
        }
        ts.forEachChild(node, walkErrors)
        return errors
    }

    /** Extract detailed line block breakdowns */
    protected extractDetailedLines(node: ts.Node): { startLine: number, endLine: number, blockType: string }[] {
        const blocks: { startLine: number, endLine: number, blockType: string }[] = []
        const walkBlocks = (n: ts.Node) => {
            if (ts.isIfStatement(n) || ts.isSwitchStatement(n)) {
                blocks.push({
                    startLine: this.getLineNumber(n.getStart()),
                    endLine: this.getLineNumber(n.getEnd()),
                    blockType: 'ControlFlow'
                })
            } else if (ts.isForStatement(n) || ts.isWhileStatement(n) || ts.isForOfStatement(n) || ts.isForInStatement(n)) {
                blocks.push({
                    startLine: this.getLineNumber(n.getStart()),
                    endLine: this.getLineNumber(n.getEnd()),
                    blockType: 'Loop'
                })
            } else if (ts.isVariableStatement(n) || ts.isExpressionStatement(n)) {
                // Ignore single lines for brevity unless part of larger logical units
            }
            ts.forEachChild(n, walkBlocks)
        }
        ts.forEachChild(node, walkBlocks)
        return blocks
    }

    /** Extract type parameter names from a generic declaration */
    protected extractTypeParameters(typeParams: ts.NodeArray<ts.TypeParameterDeclaration> | undefined): string[] {
        if (!typeParams || typeParams.length === 0) return []
        return typeParams.map(tp => tp.name.text)
    }

    /** Extract decorator names from a class declaration */
    protected extractDecorators(node: ts.ClassDeclaration): string[] {
        const decorators: string[] = []
        const modifiers = ts.canHaveDecorators(node) ? ts.getDecorators(node) : undefined
        if (modifiers) {
            for (const decorator of modifiers) {
                if (ts.isCallExpression(decorator.expression)) {
                    // @Injectable() — decorator with arguments
                    decorators.push(decorator.expression.expression.getText(this.sourceFile))
                } else if (ts.isIdentifier(decorator.expression)) {
                    // @Sealed — decorator without arguments
                    decorators.push(decorator.expression.text)
                }
            }
        }
        return decorators
    }

    /** Extract parameters from a function's parameter list */
    protected extractParams(params: ts.NodeArray<ts.ParameterDeclaration>): ParsedParam[] {
        return params.map((p) => ({
            name: p.name.getText(this.sourceFile),
            type: normalizeTypeAnnotation(p.type ? p.type.getText(this.sourceFile) : 'any'),
            optional: !!p.questionToken || !!p.initializer,
            defaultValue: p.initializer ? p.initializer.getText(this.sourceFile) : undefined,
        }))
    }

    /** Check if a node has the 'export' modifier */
    protected hasExportModifier(node: ts.Node): boolean {
        const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined
        return !!modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)
    }

    /** Get 1-indexed line number from a character position */
    protected getLineNumber(pos: number): number {
        return this.sourceFile.getLineAndCharacterOfPosition(pos).line + 1
    }

    /** Walk the top-level children of a node (non-recursive — callbacks decide depth) */
    protected walkNode(node: ts.Node, callback: (node: ts.Node) => void): void {
        ts.forEachChild(node, (child) => {
            callback(child)
        })
    }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Derive a human-readable purpose sentence from a camelCase/PascalCase identifier.
 * Examples:
 *   validateJwtToken   → "Validate jwt token"
 *   buildGraphFromLock → "Build graph from lock"
 *   UserRepository     → "User repository"
 *   parseFiles         → "Parse files"
 */
function normalizeTypeAnnotation(type: string): string {
    return type.replace(/\s*\n\s*/g, ' ').replace(/\s{2,}/g, ' ').trim()
}

function derivePurposeFromName(name: string): string {
    if (!name || name === 'constructor') return ''
    // Split on camelCase/PascalCase boundaries and underscores
    const words = name
        .replace(/_+/g, ' ')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean)
    if (words.length === 0) return ''
    words[0] = words[0].charAt(0).toUpperCase() + words[0].slice(1)
    return words.join(' ')
}
