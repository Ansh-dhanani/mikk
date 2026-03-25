import * as nodePath from 'node:path'
import type { DependencyGraph, GraphNode, GraphEdge } from './types.js'
import type { MikkLock } from '../contract/schema.js'
import type { ParsedFile, ParsedFunction, ParsedClass, ParsedVariable, ParsedGeneric } from '../parser/types.js'

export const EDGE_WEIGHTS = {
    imports: 1.0,
    extends: 0.9,
    implements: 0.8,
    calls: { exact: 1.0, fuzzy: 0.6, method: 0.8, dynamic: 0.4 },
    accesses: 0.5,
    contains: 1.0,
};

/**
 * GraphBuilder — three-pass dependency graph construction.
 *
 * ID contract (must match oxc-parser.ts exactly):
 *   function:  fn:<absolute-posix-path>:<FunctionName>
 *   class:     class:<absolute-posix-path>:<ClassName>
 *   type/enum: type:<absolute-posix-path>:<Name> | enum:<absolute-posix-path>:<Name>
 *   variable:  var:<absolute-posix-path>:<Name>
 *   file:      <absolute-posix-path>  (no prefix)
 *
 * No case normalisation — paths and names keep their original case.
 * Lookups use exact string matching after posix-normalising separators.
 */
export class GraphBuilder {
    build(files: ParsedFile[]): DependencyGraph {
        const graph = this.createEmptyGraph()
        const edgeKeys = new Set<string>()

        // Pass 1: Register all nodes
        for (const file of files) {
            this.addFileNode(graph, file)
            for (const fn of file.functions) this.addFunctionNode(graph, fn)
            for (const cls of file.classes ?? []) this.addClassNode(graph, cls)
            for (const gen of file.generics ?? []) this.addGenericNode(graph, gen)
            for (const v of file.variables ?? []) this.addVariableNode(graph, v)
        }

        // Pass 2: Structural edges (imports, containment, inheritance)
        for (const file of files) {
            this.addImportEdges(graph, file, edgeKeys)
            this.addContainmentEdges(graph, file, edgeKeys)
            this.addInheritanceEdges(graph, file, edgeKeys)
        }

        // Pass 3: Behavioural edges (calls, accesses)
        for (const file of files) {
            this.addCallEdges(graph, file, edgeKeys)
        }

        this.buildAdjacencyMaps(graph)
        return graph
    }

    /**
     * Rebuild a lightweight DependencyGraph from a serialised lock file.
     * Used for preflight checks without re-parsing the codebase.
     */
    buildFromLock(lock: MikkLock): DependencyGraph {
        const graph = this.createEmptyGraph()
        const edgeKeys = new Set<string>()

        // File nodes
        for (const file of Object.values(lock.files)) {
            const p = this.normPath(file.path)
            graph.nodes.set(p, {
                id: p, type: 'file', name: nodePath.basename(p),
                file: p, moduleId: file.moduleId,
                metadata: { hash: file.hash },
            })
        }

        // Function nodes
        for (const fn of Object.values(lock.functions)) {
            graph.nodes.set(fn.id, {
                id: fn.id, type: 'function', name: fn.name,
                file: this.normPath(fn.file), moduleId: fn.moduleId,
                metadata: { ...fn },
            })
        }

        // Class nodes
        for (const cls of Object.values(lock.classes ?? {})) {
            graph.nodes.set(cls.id, {
                id: cls.id, type: 'class', name: cls.name,
                file: this.normPath(cls.file), moduleId: cls.moduleId,
                metadata: { ...cls },
            })
        }

        // Edges from lock data
        for (const file of Object.values(lock.files)) {
            const fp = this.normPath(file.path)
            // Import edges
            for (const imp of file.imports ?? []) {
                if (!imp.resolvedPath) continue
                const rp = this.normPath(imp.resolvedPath)
                if (graph.nodes.has(rp)) {
                    this.pushEdge(graph, edgeKeys, { from: fp, to: rp, type: 'imports', confidence: 1.0, weight: EDGE_WEIGHTS.imports })
                }
            }
            // Containment: file → functions in this file
            for (const fn of Object.values(lock.functions)) {
                if (this.normPath(fn.file) === fp) {
                    this.pushEdge(graph, edgeKeys, { from: fp, to: fn.id, type: 'contains', confidence: 1.0, weight: EDGE_WEIGHTS.contains })
                }
            }
        }

        // Call edges
        for (const fn of Object.values(lock.functions)) {
            for (const calleeId of fn.calls) {
                if (graph.nodes.has(calleeId)) {
                    this.pushEdge(graph, edgeKeys, { from: fn.id, to: calleeId, type: 'calls', confidence: 0.8, weight: EDGE_WEIGHTS.calls.exact })
                }
            }
        }

        this.buildAdjacencyMaps(graph)
        return graph
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    private normPath(p: string): string {
        return p.replace(/\\/g, '/').toLowerCase()
    }

    private createEmptyGraph(): DependencyGraph {
        return { nodes: new Map(), edges: [], outEdges: new Map(), inEdges: new Map() }
    }

    // -------------------------------------------------------------------------
    // Pass 1: Node Registration
    // -------------------------------------------------------------------------

    private addFileNode(graph: DependencyGraph, file: ParsedFile): void {
        const p = this.normPath(file.path)
        graph.nodes.set(p, {
            id: p, type: 'file', name: nodePath.basename(p),
            file: p, metadata: { hash: file.hash },
        })
    }

    private addFunctionNode(graph: DependencyGraph, fn: ParsedFunction): void {
        graph.nodes.set(fn.id, {
            id: fn.id, type: 'function', name: fn.name,
            file: this.normPath(fn.file), moduleId: fn.moduleId,
            metadata: {
                startLine: fn.startLine, endLine: fn.endLine,
                isExported: fn.isExported, isAsync: fn.isAsync,
                hash: fn.hash, purpose: fn.purpose,
                params: fn.params, returnType: fn.returnType !== 'void' ? fn.returnType : undefined,
                edgeCasesHandled: fn.edgeCasesHandled,
                errorHandling: fn.errorHandling,
                detailedLines: fn.detailedLines,
            },
        })
    }

    private addClassNode(graph: DependencyGraph, cls: ParsedClass): void {
        const p = this.normPath(cls.file)
        graph.nodes.set(cls.id, {
            id: cls.id, type: 'class', name: cls.name, file: p, moduleId: cls.moduleId,
            metadata: {
                startLine: cls.startLine, endLine: cls.endLine,
                isExported: cls.isExported, purpose: cls.purpose,
                inheritsFrom: cls.extends ? [cls.extends] : [],
                implements: cls.implements,
            },
        })
        for (const method of cls.methods) this.addFunctionNode(graph, method)
        for (const prop of cls.properties ?? []) this.addVariableNode(graph, prop)
    }

    private addGenericNode(graph: DependencyGraph, gen: ParsedGeneric): void {
        graph.nodes.set(gen.id, {
            id: gen.id, type: 'generic', name: gen.name,
            file: this.normPath(gen.file),
            metadata: {
                startLine: gen.startLine, endLine: gen.endLine,
                isExported: gen.isExported, purpose: gen.purpose,
                // Store the kind (interface/type/enum) in genericKind, NOT hash
                genericKind: gen.type,
            },
        })
    }

    private addVariableNode(graph: DependencyGraph, v: ParsedVariable): void {
        graph.nodes.set(v.id, {
            id: v.id, type: 'variable', name: v.name,
            file: this.normPath(v.file),
            metadata: { startLine: v.line, isExported: v.isExported, purpose: v.purpose },
        })
    }

    // -------------------------------------------------------------------------
    // Pass 2: Structural Edges
    // -------------------------------------------------------------------------

    private addImportEdges(graph: DependencyGraph, file: ParsedFile, edgeKeys: Set<string>): void {
        const src = this.normPath(file.path)
        for (const imp of file.imports) {
            if (!imp.resolvedPath) continue
            const tgt = this.normPath(imp.resolvedPath)
            if (!graph.nodes.has(tgt)) continue
            this.pushEdge(graph, edgeKeys, { from: src, to: tgt, type: 'imports', confidence: 1.0, weight: EDGE_WEIGHTS.imports })
        }
    }

    private addContainmentEdges(graph: DependencyGraph, file: ParsedFile, edgeKeys: Set<string>): void {
        const src = this.normPath(file.path)
        for (const fn of file.functions) {
            this.pushEdge(graph, edgeKeys, { from: src, to: fn.id, type: 'contains', confidence: 1.0, weight: EDGE_WEIGHTS.contains })
        }
        for (const cls of file.classes ?? []) {
            this.pushEdge(graph, edgeKeys, { from: src, to: cls.id, type: 'contains', confidence: 1.0, weight: EDGE_WEIGHTS.contains })
            for (const method of cls.methods) {
                this.pushEdge(graph, edgeKeys, { from: cls.id, to: method.id, type: 'contains', confidence: 1.0, weight: EDGE_WEIGHTS.contains })
            }
            for (const prop of cls.properties ?? []) {
                this.pushEdge(graph, edgeKeys, { from: cls.id, to: prop.id, type: 'contains', confidence: 1.0, weight: EDGE_WEIGHTS.contains })
            }
        }
        for (const gen of file.generics ?? []) {
            this.pushEdge(graph, edgeKeys, { from: src, to: gen.id, type: 'contains', confidence: 1.0, weight: EDGE_WEIGHTS.contains })
        }
        for (const v of file.variables ?? []) {
            this.pushEdge(graph, edgeKeys, { from: src, to: v.id, type: 'contains', confidence: 1.0, weight: EDGE_WEIGHTS.contains })
        }
    }

    private addInheritanceEdges(graph: DependencyGraph, file: ParsedFile, edgeKeys: Set<string>): void {
        // Build class name → id map from graph (already populated in Pass 1)
        const classNameToId = new Map<string, string>()
        for (const [, node] of graph.nodes) {
            if (node.type === 'class') classNameToId.set(node.name, node.id)
        }

        for (const cls of file.classes ?? []) {
            if (cls.extends && classNameToId.has(cls.extends)) {
                this.pushEdge(graph, edgeKeys, {
                    from: cls.id, to: classNameToId.get(cls.extends)!,
                    type: 'extends', confidence: 1.0, weight: EDGE_WEIGHTS.extends,
                })
            }
            for (const iface of cls.implements ?? []) {
                if (classNameToId.has(iface)) {
                    this.pushEdge(graph, edgeKeys, {
                        from: cls.id, to: classNameToId.get(iface)!,
                        type: 'implements', confidence: 1.0, weight: EDGE_WEIGHTS.implements,
                    })
                }
            }
        }
    }

    // -------------------------------------------------------------------------
    // Pass 3: Behavioural Edges (calls, accesses)
    //
    // Call resolution order (priority-first):
    //   1. Named import: `import { foo } from './x'` → fn:<resolvedPath>:foo
    //   2. Default import alias: `import jwt from './x'; jwt.verify()` → fn:<resolvedPath>:verify
    //   3. Local function exact: same file, same name
    //   4. Local class method: SomeClass.method in same file
    //
    // Confidence levels:
    //   1.0  — local exact match (AST confirmed)
    //   0.8  — named import match
    //   0.6  — default-import method match
    //   0.5  — dotted name stripped to simple name (receiver uncertain)
    // -------------------------------------------------------------------------

    private addCallEdges(graph: DependencyGraph, file: ParsedFile, edgeKeys: Set<string>): void {
        const filePath = this.normPath(file.path)

        // Build import lookup tables for this file
        // key: the local name used in code (e.g. "verifyToken")
        // value: the canonical graph node ID (e.g. "fn:/abs/path/jwt.ts:verifyToken")
        const namedImportIds = new Map<string, string>()
        // key: local alias (e.g. "jwt"), value: resolved absolute file path
        const defaultImportPaths = new Map<string, string>()

        for (const imp of file.imports) {
            if (!imp.resolvedPath) continue
            const resolvedPath = this.normPath(imp.resolvedPath)

            for (const name of imp.names) {
                const localName = name.toLowerCase()
                if (imp.isDefault) {
                    // `import jwt from './jwt'` → defaultImportPaths['jwt'] = '/abs/.../jwt.ts'
                    defaultImportPaths.set(localName, resolvedPath)
                } else {
                    // `import { verifyToken } from './jwt'` → namedImportIds['verifyToken'] = 'fn:.../jwt.ts:verifytoken'
                    const candidateId = `fn:${resolvedPath}:${localName}`
                    if (graph.nodes.has(candidateId)) {
                        namedImportIds.set(localName, candidateId)
                    }
                }
            }
        }

        // Class name → class node ID for local method resolution
        const localClassIds = new Map<string, string>()
        for (const cls of file.classes ?? []) {
            localClassIds.set(cls.name, cls.id)
        }

        // Collect all (sourceId, callName) pairs from every function and method
        const behaviors: Array<{ sourceId: string; calls: Array<{ name: string; type: string }> }> = [
            // Module-level calls
            { sourceId: filePath, calls: file.calls ?? [] },
            // Function-level calls
            ...file.functions.map(fn => ({ sourceId: fn.id, calls: fn.calls })),
            // Class method calls
            ...(file.classes ?? []).flatMap(cls =>
                cls.methods.map(m => ({ sourceId: m.id, calls: m.calls }))
            ),
        ]

        for (const { sourceId, calls } of behaviors) {
            for (const call of calls) {
                const callName = call.name
                if (!callName || callName === 'super') continue

                const normalizedCallName = callName.toLowerCase()
                const hasDot = normalizedCallName.includes('.')
                const simpleName = hasDot ? normalizedCallName.split('.').pop()! : normalizedCallName
                const receiver = hasDot ? normalizedCallName.split('.')[0] : null
                const isPropertyAccess = call.type === 'property'

                // ── 1. Named import exact match ──────────────────────────
                // Try full name first (e.g. "jwt.verify" mapped via named import of "verify")
                const namedId = namedImportIds.get(normalizedCallName) ?? (receiver === null ? namedImportIds.get(simpleName) : undefined)
                if (namedId) {
                    this.pushEdge(graph, edgeKeys, {
                        from: sourceId, to: namedId,
                        type: isPropertyAccess ? 'accesses' : 'calls',
                        confidence: 0.8, weight: EDGE_WEIGHTS.calls.exact,
                    })
                    continue
                }

                // ── 2. Default import: receiver is the alias ─────────────
                if (receiver && defaultImportPaths.has(receiver)) {
                    const resolvedFile = defaultImportPaths.get(receiver)!
                    const methodId = `fn:${resolvedFile}:${simpleName}`
                    if (graph.nodes.has(methodId)) {
                        this.pushEdge(graph, edgeKeys, {
                            from: sourceId, to: methodId,
                            type: isPropertyAccess ? 'accesses' : 'calls',
                            confidence: 0.6, weight: EDGE_WEIGHTS.calls.method,
                        })
                        continue
                    }
                }

                // ── 3. Local function exact match ────────────────────────
                const localId = `fn:${filePath}:${simpleName}`
                if (graph.nodes.has(localId) && localId !== sourceId) {
                    this.pushEdge(graph, edgeKeys, {
                        from: sourceId, to: localId,
                        type: isPropertyAccess ? 'accesses' : 'calls',
                        confidence: simpleName === callName ? 1.0 : 0.5,
                        weight: simpleName === callName ? EDGE_WEIGHTS.calls.exact : EDGE_WEIGHTS.calls.fuzzy,
                    })
                    continue
                }

                // ── 4. Local class method: SomeClass.method ──────────────
                if (receiver && localClassIds.has(receiver)) {
                    // Method IDs are stored as fn:<file>:<ClassName>.<methodName>
                    const classMethodId = `fn:${filePath}:${receiver}.${simpleName}`
                    if (graph.nodes.has(classMethodId) && classMethodId !== sourceId) {
                        this.pushEdge(graph, edgeKeys, {
                            from: sourceId, to: classMethodId,
                            type: isPropertyAccess ? 'accesses' : 'calls',
                            confidence: 0.8, weight: EDGE_WEIGHTS.calls.method,
                        })
                        continue
                    }
                }

                // Unresolved call — intentionally not added to graph.
                // Callers can detect incomplete coverage by comparing
                // fn.calls.length vs outgoing 'calls' edge count on fn.id.
            }
        }
    }

    // -------------------------------------------------------------------------
    // Edge helpers
    // -------------------------------------------------------------------------

    private pushEdge(graph: DependencyGraph, edgeKeys: Set<string>, edge: GraphEdge): void {
        const key = `${edge.from}->${edge.to}:${edge.type}`
        if (edgeKeys.has(key)) return
        edgeKeys.add(key)
        graph.edges.push(edge)
    }

    private buildAdjacencyMaps(graph: DependencyGraph): void {
        for (const edge of graph.edges) {
            if (!graph.outEdges.has(edge.from)) graph.outEdges.set(edge.from, [])
            graph.outEdges.get(edge.from)!.push(edge)
            if (!graph.inEdges.has(edge.to)) graph.inEdges.set(edge.to, [])
            graph.inEdges.get(edge.to)!.push(edge)
        }
    }
}
