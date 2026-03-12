import ts from 'typescript'
import { TypeScriptExtractor } from '../typescript/ts-extractor.js'
import { hashContent } from '../../hash/file-hasher.js'
import type { ParsedFunction, ParsedImport, ParsedExport } from '../types.js'

/**
 * JavaScriptExtractor — extends TypeScriptExtractor to add CommonJS support on top of
 * the TypeScript Compiler API's native JS/JSX parsing.
 *
 * Extra patterns handled:
 *   - require() imports: const x = require('./m') / const { a } = require('./m')
 *   - module.exports = { foo, bar }  / module.exports = function() {}
 *   - exports.foo = function() {}
 *
 * All ESM patterns (import/export, arrow functions, classes) are inherited from the
 * TypeScriptExtractor which already handles ScriptKind.JS and ScriptKind.JSX.
 */
export class JavaScriptExtractor extends TypeScriptExtractor {

    // ── Public overrides ───────────────────────────────────────────────────────

    /** ESM functions + module.exports-assigned functions */
    override extractFunctions(): ParsedFunction[] {
        const fns = super.extractFunctions()
        const seen = new Set(fns.map(f => f.name))
        for (const fn of this.extractCommonJsFunctions()) {
            if (!seen.has(fn.name)) { fns.push(fn); seen.add(fn.name) }
        }
        return fns
    }

    /** ESM imports + CommonJS require() calls */
    override extractImports(): ParsedImport[] {
        const esm = super.extractImports()
        const seen = new Set(esm.map(i => i.source))
        for (const imp of this.extractRequireImports()) {
            if (!seen.has(imp.source)) { esm.push(imp); seen.add(imp.source) }
        }
        return esm
    }

    /** ESM exports + CommonJS module.exports / exports.x */
    override extractExports(): ParsedExport[] {
        const esm = super.extractExports()
        const seen = new Set(esm.map(e => e.name))
        for (const exp of this.extractCommonJsExports()) {
            if (!seen.has(exp.name)) { esm.push(exp); seen.add(exp.name) }
        }
        return esm
    }

    // ── CommonJS: require() ────────────────────────────────────────────────────

    private extractRequireImports(): ParsedImport[] {
        const imports: ParsedImport[] = []
        const walk = (node: ts.Node) => {
            if (
                ts.isCallExpression(node) &&
                ts.isIdentifier(node.expression) &&
                node.expression.text === 'require' &&
                node.arguments.length === 1 &&
                ts.isStringLiteral(node.arguments[0])
            ) {
                // Ignore require.resolve(), require.cache etc. — those are property accesses
                // on the result, not on `require` itself:  require.resolve() has a
                // PropertyAccessExpression as node.expression, not an Identifier.
                const source = (node.arguments[0] as ts.StringLiteral).text
                const names = this.getRequireBindingNames(node)
                // isDefault = true when binding is a plain identifier (const x = require(...))
                // or when there's no binding at all (require(...) used for side effects).
                // Only destructured object bindings (const { a } = require(...)) are named imports.
                const parent = node.parent
                const isDestructured = parent &&
                    ts.isVariableDeclaration(parent) &&
                    ts.isObjectBindingPattern(parent.name)
                imports.push({
                    source,
                    resolvedPath: '',
                    names,
                    isDefault: !isDestructured,
                    isDynamic: false,
                })
            }
            ts.forEachChild(node, walk)
        }
        ts.forEachChild(this.sourceFile, walk)
        return imports
    }

    /** Names extracted from the variable declaration that receives the require() call. */
    private getRequireBindingNames(call: ts.CallExpression): string[] {
        const parent = call.parent
        if (!parent || !ts.isVariableDeclaration(parent)) return []
        // const { a, b } = require('...') → ['a', 'b']
        if (ts.isObjectBindingPattern(parent.name)) {
            return parent.name.elements
                .filter(e => ts.isIdentifier(e.name))
                .map(e => (e.name as ts.Identifier).text)
        }
        // const x = require('...') → ['x']
        if (ts.isIdentifier(parent.name)) return [parent.name.text]
        return []
    }

    // ── CommonJS: module.exports / exports.x exports ─────────────────────────

    private extractCommonJsExports(): ParsedExport[] {
        const result: ParsedExport[] = []
        const fp = this.filePath

        const walk = (node: ts.Node) => {
            if (
                ts.isExpressionStatement(node) &&
                ts.isBinaryExpression(node.expression) &&
                node.expression.operatorToken.kind === ts.SyntaxKind.EqualsToken
            ) {
                const lhs = node.expression.left
                const rhs = node.expression.right

                // ── module.exports = ... ────────────────────────────────────
                if (isModuleExports(lhs)) {
                    if (ts.isObjectLiteralExpression(rhs)) {
                        // module.exports = { foo, bar }
                        for (const prop of rhs.properties) {
                            if (ts.isShorthandPropertyAssignment(prop)) {
                                result.push({ name: prop.name.text, type: 'const', file: fp })
                            } else if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
                                const isFunc = ts.isFunctionExpression(prop.initializer) || ts.isArrowFunction(prop.initializer)
                                result.push({ name: prop.name.text, type: isFunc ? 'function' : 'const', file: fp })
                            }
                        }
                    } else if (ts.isFunctionExpression(rhs) || ts.isArrowFunction(rhs)) {
                        // module.exports = function name() {} → use function name or 'default'
                        const name = ts.isFunctionExpression(rhs) && rhs.name ? rhs.name.text : 'default'
                        result.push({ name, type: 'default', file: fp })
                    } else if (ts.isClassExpression(rhs) && rhs.name) {
                        result.push({ name: rhs.name.text, type: 'class', file: fp })
                    } else if (ts.isIdentifier(rhs)) {
                        result.push({ name: rhs.text, type: 'default', file: fp })
                    } else {
                        result.push({ name: 'default', type: 'default', file: fp })
                    }
                }

                // ── exports.foo = ... ───────────────────────────────────────
                if (isExportsDotProp(lhs)) {
                    const prop = lhs as ts.PropertyAccessExpression
                    const isFunc = ts.isFunctionExpression(rhs) || ts.isArrowFunction(rhs)
                    result.push({ name: prop.name.text, type: isFunc ? 'function' : 'const', file: fp })
                }

                // ── module.exports.foo = ... ────────────────────────────────
                if (isModuleExportsDotProp(lhs)) {
                    const prop = lhs as ts.PropertyAccessExpression
                    const isFunc = ts.isFunctionExpression(rhs) || ts.isArrowFunction(rhs)
                    result.push({ name: prop.name.text, type: isFunc ? 'function' : 'const', file: fp })
                }
            }
            ts.forEachChild(node, walk)
        }

        ts.forEachChild(this.sourceFile, walk)
        return result
    }

    // ── CommonJS: module.exports / exports.x function bodies ──────────────────

    /**
     * Detect functions directly assigned via module.exports or exports.x:
     *   module.exports = function handleLogin(req, res) { ... }
     *   module.exports = function() { ... }            ← name = 'default'
     *   exports.createUser = function(data) { ... }
     *   exports.createUser = (data) => { ... }
     */
    private extractCommonJsFunctions(): ParsedFunction[] {
        const result: ParsedFunction[] = []

        const walk = (node: ts.Node) => {
            if (
                ts.isExpressionStatement(node) &&
                ts.isBinaryExpression(node.expression) &&
                node.expression.operatorToken.kind === ts.SyntaxKind.EqualsToken
            ) {
                const lhs = node.expression.left
                const rhs = node.expression.right

                if (!ts.isFunctionExpression(rhs) && !ts.isArrowFunction(rhs)) {
                    ts.forEachChild(node, walk)
                    return
                }

                let fnName: string | null = null
                if (isModuleExports(lhs)) {
                    // module.exports = function name() {} / function() {}
                    fnName = ts.isFunctionExpression(rhs) && rhs.name ? rhs.name.text : 'default'
                } else if (isExportsDotProp(lhs)) {
                    // exports.foo = function() {}
                    fnName = (lhs as ts.PropertyAccessExpression).name.text
                } else if (isModuleExportsDotProp(lhs)) {
                    // module.exports.foo = function() {}
                    fnName = (lhs as ts.PropertyAccessExpression).name.text
                }

                if (fnName !== null) {
                    const startLine = this.getLineNumber(node.getStart())
                    const endLine = this.getLineNumber(node.getEnd())
                    const isAsync = !!(rhs.modifiers?.some((m: ts.Modifier) => m.kind === ts.SyntaxKind.AsyncKeyword))
                    result.push({
                        id: `fn:${this.filePath}:${fnName}`,
                        name: fnName,
                        file: this.filePath,
                        startLine,
                        endLine,
                        params: this.extractParams(rhs.parameters),
                        returnType: rhs.type ? rhs.type.getText(this.sourceFile) : 'void',
                        isExported: true,
                        isAsync,
                        calls: this.extractCalls(rhs),
                        hash: hashContent(rhs.getText(this.sourceFile)),
                        purpose: this.extractPurpose(node),
                        edgeCasesHandled: this.extractEdgeCases(rhs),
                        errorHandling: this.extractErrorHandling(rhs),
                        detailedLines: this.extractDetailedLines(rhs),
                    })
                }
            }
            ts.forEachChild(node, walk)
        }

        ts.forEachChild(this.sourceFile, walk)
        return result
    }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** node is `module.exports` */
function isModuleExports(node: ts.Node): boolean {
    return (
        ts.isPropertyAccessExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'module' &&
        node.name.text === 'exports'
    )
}

/** node is `exports.something` */
function isExportsDotProp(node: ts.Node): boolean {
    return (
        ts.isPropertyAccessExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'exports'
    )
}

/** node is `module.exports.something` */
function isModuleExportsDotProp(node: ts.Node): boolean {
    return (
        ts.isPropertyAccessExpression(node) &&
        isModuleExports(node.expression)
    )
}
