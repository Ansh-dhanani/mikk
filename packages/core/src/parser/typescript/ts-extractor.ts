import ts from 'typescript'
import type { 
    ParsedFunction, 
    ParsedClass, 
    ParsedImport, 
    ParsedExport, 
    ParsedParam, 
    ParsedGeneric, 
    ParsedRoute,
    ParsedVariable,
    CallExpression
} from '../types.js'
import { hashContent } from '../../hash/file-hasher.js'

export class TypeScriptExtractor {
    protected readonly sourceFile: ts.SourceFile
    private nameCounter = new Map<string, number>()

    constructor(
        protected readonly filePath: string,
        protected readonly content: string
    ) {
        this.sourceFile = ts.createSourceFile(
            filePath,
            content,
            ts.ScriptTarget.Latest,
            true,
            this.inferScriptKind(filePath)
        )
    }

    private inferScriptKind(filePath: string): ts.ScriptKind {
        if (filePath.endsWith('.tsx')) return ts.ScriptKind.TSX
        if (filePath.endsWith('.jsx')) return ts.ScriptKind.JSX
        if (filePath.endsWith('.js') || filePath.endsWith('.mjs') || filePath.endsWith('.cjs')) return ts.ScriptKind.JS
        return ts.ScriptKind.TS
    }

    private allocateId(prefix: string, name: string): string {
        const count = (this.nameCounter.get(name) ?? 0) + 1
        this.nameCounter.set(name, count)
        const suffix = count === 1 ? '' : `#${count}`
        const normalizedPath = this.filePath.replace(/\\/g, '/')
        return `${prefix}:${normalizedPath}:${name}${suffix}`.toLowerCase()
    }

    resetCounters(): void {
        this.nameCounter.clear()
    }

    extractFunctions(): ParsedFunction[] {
        const functions: ParsedFunction[] = []
        this.walkNode(this.sourceFile, (node) => {
            if (ts.isFunctionDeclaration(node) && node.name) {
                functions.push(this.parseFunctionDeclaration(node))
            }
            if (ts.isVariableStatement(node)) {
                for (const decl of node.declarationList.declarations) {
                    if (decl.initializer && ts.isIdentifier(decl.name)) {
                        if (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer)) {
                            functions.push(this.parseVariableFunction(node, decl, decl.initializer))
                        }
                    }
                }
            }
        })
        return functions
    }

    extractClasses(): ParsedClass[] {
        const classes: ParsedClass[] = []
        this.walkNode(this.sourceFile, (node) => {
            if (ts.isClassDeclaration(node) && node.name) {
                classes.push(this.parseClass(node))
            }
        })
        return classes
    }

    extractVariables(): ParsedVariable[] {
        const variables: ParsedVariable[] = []
        this.walkNode(this.sourceFile, (node) => {
            if (ts.isVariableStatement(node)) {
                for (const decl of node.declarationList.declarations) {
                    if (ts.isIdentifier(decl.name) && !this.isFunctionLike(decl.initializer)) {
                        variables.push(this.parseVariable(node, decl))
                    }
                }
            }
        })
        return variables
    }

    private isFunctionLike(node?: ts.Node): boolean {
        return !!node && (ts.isArrowFunction(node) || ts.isFunctionExpression(node))
    }

    extractGenerics(): ParsedGeneric[] {
        const generics: ParsedGeneric[] = []
        this.walkNode(this.sourceFile, (node) => {
            if (ts.isInterfaceDeclaration(node)) {
                generics.push({
                    id: this.allocateId('intf', node.name.text),
                    name: node.name.text,
                    type: 'interface',
                    file: this.filePath,
                    startLine: this.getLineNumber(node.getStart(this.sourceFile)),
                    endLine: this.getLineNumber(node.getEnd()),
                    isExported: this.hasExportModifier(node),
                    typeParameters: this.extractTypeParameters(node.typeParameters),
                    hash: hashContent(node.getText(this.sourceFile)),
                    purpose: this.extractPurpose(node),
                })
            } else if (ts.isTypeAliasDeclaration(node)) {
                generics.push({
                    id: this.allocateId('type', node.name.text),
                    name: node.name.text,
                    type: 'type',
                    file: this.filePath,
                    startLine: this.getLineNumber(node.getStart(this.sourceFile)),
                    endLine: this.getLineNumber(node.getEnd()),
                    isExported: this.hasExportModifier(node),
                    typeParameters: this.extractTypeParameters(node.typeParameters),
                    hash: hashContent(node.getText(this.sourceFile)),
                    purpose: this.extractPurpose(node),
                })
            }
        })
        return generics
    }

    extractImports(): ParsedImport[] {
        const imports: ParsedImport[] = []
        this.walkNode(this.sourceFile, (node) => {
            if (ts.isImportDeclaration(node)) {
                if (node.importClause?.isTypeOnly) return;
                const parsed = this.parseImport(node)
                if (parsed) {
                    // Filter out type-only named imports
                    parsed.names = parsed.names.filter(n => !n.startsWith('type '))
                    imports.push(parsed)
                }
            }
        })
        return imports
    }

    extractExports(): ParsedExport[] {
        const exports: ParsedExport[] = []
        this.walkNode(this.sourceFile, (node) => {
            if (ts.isFunctionDeclaration(node) && node.name && this.hasExportModifier(node)) {
                exports.push({ name: node.name.text, type: 'function', file: this.filePath })
            }
            if (ts.isClassDeclaration(node) && node.name && this.hasExportModifier(node)) {
                exports.push({ name: node.name.text, type: 'class', file: this.filePath })
            }
            if (ts.isVariableStatement(node) && this.hasExportModifier(node)) {
                node.declarationList.declarations.forEach(decl => {
                    if (ts.isIdentifier(decl.name)) {
                        exports.push({ name: decl.name.text, type: 'const', file: this.filePath })
                    }
                })
            }
            if (ts.isExportAssignment(node)) {
                exports.push({ name: 'default', type: 'default', file: this.filePath })
            }
        })
        return exports
    }

    extractRoutes(): ParsedRoute[] {
        const routes: ParsedRoute[] = []
        this.walkNode(this.sourceFile, (node) => {
            if (ts.isCallExpression(node)) {
                const text = node.expression.getText(this.sourceFile)
                if (text.match(/^(router|app|express)\.(get|post|put|delete|patch)$/)) {
                    const method = text.split('.')[1].toUpperCase() as any
                    const pathArg = node.arguments[0]
                    if (pathArg && ts.isStringLiteral(pathArg)) {
                        const path = pathArg.text
                        const handler = node.arguments[node.arguments.length - 1]
                        const middlewares = node.arguments.slice(1, -1).map(a => a.getText(this.sourceFile))
                        routes.push({
                            method,
                            path,
                            handler: handler.getText(this.sourceFile),
                            middlewares,
                            file: this.filePath,
                            line: this.getLineNumber(node.getStart(this.sourceFile))
                        })
                    }
                }
            }
        })
        return routes
    }

    extractModuleCalls(): CallExpression[] {
        // Calls occurring at the top level of the file
        const calls: CallExpression[] = []
        this.sourceFile.statements.forEach(stmt => {
            if (!ts.isFunctionDeclaration(stmt) && !ts.isClassDeclaration(stmt)) {
                calls.push(...this.extractCallsFromNode(stmt))
            }
        })
        return calls
    }

    // --- Private Parsers ---

    private parseFunctionDeclaration(node: ts.FunctionDeclaration): ParsedFunction {
        const name = node.name!.text
        const bodyText = node.getText(this.sourceFile)
        return {
            id: this.allocateId('fn', name),
            name,
            file: this.filePath,
            startLine: this.getLineNumber(node.getStart(this.sourceFile)),
            endLine: this.getLineNumber(node.getEnd()),
            params: this.extractParams(node.parameters),
            returnType: node.type ? node.type.getText(this.sourceFile) : 'void',
            isExported: this.hasExportModifier(node),
            isAsync: !!node.modifiers?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword),
            calls: this.extractCallsFromNode(node),
            hash: hashContent(bodyText),
            purpose: this.extractPurpose(node),
            edgeCasesHandled: this.extractEdgeCases(node),
            errorHandling: this.extractErrorHandling(node),
            detailedLines: [],
        }
    }

    private parseVariableFunction(stmt: ts.VariableStatement, decl: ts.VariableDeclaration, fn: ts.ArrowFunction | ts.FunctionExpression): ParsedFunction {
        const name = (decl.name as ts.Identifier).text
        const bodyText = stmt.getText(this.sourceFile)
        return {
            id: this.allocateId('fn', name),
            name,
            file: this.filePath,
            startLine: this.getLineNumber(stmt.getStart(this.sourceFile)),
            endLine: this.getLineNumber(stmt.getEnd()),
            params: this.extractParams(fn.parameters),
            returnType: fn.type ? fn.type.getText(this.sourceFile) : 'unknown',
            isExported: this.hasExportModifier(stmt),
            isAsync: !!fn.modifiers?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword),
            calls: this.extractCallsFromNode(fn),
            hash: hashContent(bodyText),
            purpose: this.extractPurpose(stmt),
            edgeCasesHandled: this.extractEdgeCases(fn),
            errorHandling: this.extractErrorHandling(fn),
            detailedLines: [],
        }
    }

    private parseClass(node: ts.ClassDeclaration): ParsedClass {
        const name = node.name!.text
        const methods: ParsedFunction[] = []
        const properties: ParsedVariable[] = []

        for (const member of node.members) {
            if (ts.isMethodDeclaration(member) && member.name) {
                methods.push(this.parseMethod(name, member))
            } else if (ts.isPropertyDeclaration(member) && member.name) {
                properties.push(this.parseProperty(name, member))
            }
        }

        return {
            id: this.allocateId('class', name),
            name,
            file: this.filePath,
            startLine: this.getLineNumber(node.getStart(this.sourceFile)),
            endLine: this.getLineNumber(node.getEnd()),
            methods,
            properties,
            extends: node.heritageClauses?.find(c => c.token === ts.SyntaxKind.ExtendsKeyword)?.types[0]?.getText(this.sourceFile),
            implements: node.heritageClauses?.find(c => c.token === ts.SyntaxKind.ImplementsKeyword)?.types.map(t => t.getText(this.sourceFile)),
            isExported: this.hasExportModifier(node),
            hash: hashContent(node.getText(this.sourceFile)),
            purpose: this.extractPurpose(node),
            edgeCasesHandled: this.extractEdgeCases(node),
            errorHandling: this.extractErrorHandling(node),
        }
    }

    private parseMethod(className: string, node: ts.MethodDeclaration): ParsedFunction {
        const methodName = node.name.getText(this.sourceFile)
        const fullName = `${className}.${methodName}`
        return {
            id: this.allocateId('fn', fullName),
            name: fullName,
            file: this.filePath,
            startLine: this.getLineNumber(node.getStart(this.sourceFile)),
            endLine: this.getLineNumber(node.getEnd()),
            params: this.extractParams(node.parameters),
            returnType: node.type ? node.type.getText(this.sourceFile) : 'void',
            isExported: false,
            isAsync: !!node.modifiers?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword),
            calls: this.extractCallsFromNode(node),
            hash: hashContent(node.getText(this.sourceFile)),
            purpose: this.extractPurpose(node),
            edgeCasesHandled: this.extractEdgeCases(node),
            errorHandling: this.extractErrorHandling(node),
            detailedLines: [],
        }
    }

    private parseProperty(className: string, node: ts.PropertyDeclaration): ParsedVariable {
        const propName = node.name.getText(this.sourceFile)
        return {
            id: this.allocateId('var', `${className}.${propName}`),
            name: propName,
            type: node.type ? node.type.getText(this.sourceFile) : 'any',
            file: this.filePath,
            line: this.getLineNumber(node.getStart(this.sourceFile)),
            isExported: false,
            isStatic: !!node.modifiers?.some(m => m.kind === ts.SyntaxKind.StaticKeyword),
        }
    }

    private parseVariable(stmt: ts.VariableStatement, decl: ts.VariableDeclaration): ParsedVariable {
        const name = (decl.name as ts.Identifier).text
        return {
            id: this.allocateId('var', name),
            name,
            type: decl.type ? decl.type.getText(this.sourceFile) : 'any',
            file: this.filePath,
            line: this.getLineNumber(stmt.getStart(this.sourceFile)),
            isExported: this.hasExportModifier(stmt),
        }
    }

    private parseImport(node: ts.ImportDeclaration): ParsedImport {
        const source = (node.moduleSpecifier as ts.StringLiteral).text
        const names: string[] = []
        let isDefault = false
        if (node.importClause) {
            if (node.importClause.name) {
                names.push(node.importClause.name.text)
                isDefault = true
            }
            if (node.importClause.namedBindings && ts.isNamedImports(node.importClause.namedBindings)) {
                node.importClause.namedBindings.elements.forEach(el => names.push(el.name.text))
            }
        }
        return { source, resolvedPath: '', names, isDefault, isDynamic: false }
    }

    // --- Helpers ---

    protected extractCallsFromNode(node: ts.Node): CallExpression[] {
        const calls: CallExpression[] = []
        const walk = (n: ts.Node) => {
            if (ts.isCallExpression(n)) {
                calls.push({
                    name: n.expression.getText(this.sourceFile),
                    line: this.getLineNumber(n.getStart(this.sourceFile)),
                    type: ts.isPropertyAccessExpression(n.expression) ? 'method' : 'function'
                })
            } else if (ts.isNewExpression(n)) {
                calls.push({
                    name: n.expression.getText(this.sourceFile),
                    line: this.getLineNumber(n.getStart(this.sourceFile)),
                    type: 'function'
                })
            } else if (ts.isPropertyAccessExpression(n) && !ts.isCallExpression(n.parent)) {
                 // Property access that isn't a call
                 calls.push({
                    name: n.getText(this.sourceFile),
                    line: this.getLineNumber(n.getStart(this.sourceFile)),
                    type: 'property'
                 })
            }
            ts.forEachChild(n, walk)
        }
        walk(node)
        return calls
    }

    protected extractParams(params: ts.NodeArray<ts.ParameterDeclaration>): ParsedParam[] {
        return params.map(p => ({
            name: p.name.getText(this.sourceFile),
            type: p.type ? p.type.getText(this.sourceFile) : 'any',
            optional: !!p.questionToken || !!p.initializer,
            defaultValue: p.initializer ? p.initializer.getText(this.sourceFile) : undefined,
        }))
    }

    protected extractTypeParameters(typeParams?: ts.NodeArray<ts.TypeParameterDeclaration>): string[] {
        return typeParams?.map(t => t.name.text) || []
    }

    protected hasExportModifier(node: ts.Node): boolean {
        return !!ts.getModifiers(node as any)?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)
    }

    protected getLineNumber(pos: number): number {
        return this.sourceFile.getLineAndCharacterOfPosition(pos).line + 1
    }

    protected extractPurpose(node: ts.Node): string {
        const fullText = this.sourceFile.getFullText()
        const ranges = ts.getLeadingCommentRanges(fullText, node.pos)
        if (ranges && ranges.length > 0) {
            const lastComment = fullText.slice(ranges[ranges.length - 1].pos, ranges[ranges.length - 1].end)
            return lastComment.replace(/\/\*+|\*+\/|\/\/+/g, '').trim()
        }
        return ''
    }

    protected extractEdgeCases(node: ts.Node): string[] {
        const edgeCases: string[] = []
        const walk = (n: ts.Node) => {
            if (ts.isIfStatement(n) || ts.isConditionalExpression(n)) {
                edgeCases.push(n.getText(this.sourceFile).split('{')[0].trim())
            }
            ts.forEachChild(n, walk)
        }
        walk(node)
        return edgeCases
    }

    protected extractErrorHandling(node: ts.Node): { line: number, type: 'try-catch' | 'throw', detail: string }[] {
        const result: { line: number, type: 'try-catch' | 'throw', detail: string }[] = []
        const walk = (n: ts.Node) => {
            if (ts.isTryStatement(n)) {
                result.push({ line: this.getLineNumber(n.getStart(this.sourceFile)), type: 'try-catch', detail: 'try block' })
            } else if (ts.isThrowStatement(n)) {
                result.push({ line: this.getLineNumber(n.getStart(this.sourceFile)), type: 'throw', detail: n.expression?.getText(this.sourceFile) || 'unknown' })
            }
            ts.forEachChild(n, walk)
        }
        walk(node)
        return result
    }

    protected extractDetailedLines(node: ts.Node): { startLine: number; endLine: number; blockType: string }[] {
        return [] // Implementation for behavioral tracking
    }

    private walkNode(node: ts.Node, callback: (node: ts.Node) => void): void {
        ts.forEachChild(node, (child) => {
            callback(child)
            this.walkNode(child, callback)
        })
    }
}
