import * as path from 'node:path'
import type { DependencyGraph, GraphNode, GraphEdge } from './types.js'
import type { ParsedFile, ParsedFunction, ParsedClass } from '../parser/types.js'

/**
 * GraphBuilder — takes parsed files and builds the dependency graph.
 *
 * Three-pass approach:
 *   Pass 1: Register all nodes (files, functions, classes, generics)
 *   Pass 2: Add all edges (imports, calls, containment)
 *   Pass 3: Build adjacency maps for O(1) traversal
 *
 * Key correctness guarantees:
 *   - No duplicate edges (tracked via edgeKey Set)
 *   - Method nodes are resolved correctly via ClassName.method lookup
 *   - Default imports are handled separately from named imports
 *   - moduleId is propagated from ParsedFunction/ParsedClass to graph nodes
 *   - Unresolved calls are tracked and emitted as low-confidence edges where possible
 */
export class GraphBuilder {
    /** Main entry point — takes all parsed files and returns the complete graph */
    build(files: ParsedFile[]): DependencyGraph {
        const graph: DependencyGraph = {
            nodes: new Map(),
            edges: [],
            outEdges: new Map(),
            inEdges: new Map(),
        }

        // Used to deduplicate edges: "source->target:type"
        const edgeKeys = new Set<string>()

        // Pass 1: add all nodes
        for (const file of files) {
            this.addFileNode(graph, file)
            for (const fn of file.functions) {
                this.addFunctionNode(graph, fn)
            }
            for (const cls of file.classes ?? []) {
                this.addClassNode(graph, cls, file.path)
            }
            for (const gen of file.generics ?? []) {
                this.addGenericNode(graph, gen)
            }
        }

        // Pass 2: add all edges
        for (const file of files) {
            this.addImportEdges(graph, file, edgeKeys)
            this.addCallEdges(graph, file, edgeKeys)
            this.addContainmentEdges(graph, file, edgeKeys)
        }

        // Pass 3: build adjacency maps for fast lookup
        this.buildAdjacencyMaps(graph)

        return graph
    }

    // -------------------------------------------------------------------------
    // Node registration
    // -------------------------------------------------------------------------

    private addFileNode(graph: DependencyGraph, file: ParsedFile): void {
        graph.nodes.set(file.path, {
            id: file.path,
            type: 'file',
            label: path.basename(file.path),
            file: file.path,
            // moduleId on file nodes is not set here — it comes from the lock compiler
            // which maps files to declared modules after graph construction.
            metadata: { hash: file.hash },
        })
    }

    private addFunctionNode(graph: DependencyGraph, fn: ParsedFunction): void {
        // Use fn.moduleId if the parser/compiler populated it; otherwise leave undefined.
        // The lock compiler sets moduleId on MikkLockFunction; the graph node mirrors it
        // when graph is rebuilt from lock. For fresh parse output moduleId may be absent.
        const node: GraphNode = {
            id: fn.id,
            type: 'function',
            label: fn.name,
            file: fn.file,
            metadata: {
                startLine: fn.startLine,
                endLine: fn.endLine,
                isExported: fn.isExported,
                isAsync: fn.isAsync,
                hash: fn.hash,
                purpose: fn.purpose,
                params: fn.params?.map(p => ({
                    name: p.name,
                    type: p.type,
                    ...(p.optional ? { optional: true } : {}),
                })),
                returnType: fn.returnType !== 'void' ? fn.returnType : undefined,
                edgeCasesHandled: fn.edgeCasesHandled,
                errorHandling: fn.errorHandling,
                detailedLines: fn.detailedLines,
            },
        }
        // Propagate moduleId if available on the parsed function
        if (fn.moduleId) {
            node.moduleId = fn.moduleId
        }
        graph.nodes.set(fn.id, node)
    }

    private addClassNode(graph: DependencyGraph, cls: ParsedClass, filePath: string): void {
        const node: GraphNode = {
            id: cls.id,
            type: 'class',
            label: cls.name,
            file: filePath,
            metadata: {
                startLine: cls.startLine,
                endLine: cls.endLine,
                isExported: cls.isExported,
                purpose: cls.purpose,
                edgeCasesHandled: cls.edgeCasesHandled,
                errorHandling: cls.errorHandling,
            },
        }
        if (cls.moduleId) {
            node.moduleId = cls.moduleId
        }
        graph.nodes.set(cls.id, node)
        // Add nodes for each method
        for (const method of cls.methods) {
            this.addFunctionNode(graph, method)
        }
    }

    private addGenericNode(graph: DependencyGraph, gen: any): void {
        graph.nodes.set(gen.id, {
            id: gen.id,
            type: 'generic',
            label: gen.name,
            file: gen.file,
            metadata: {
                startLine: gen.startLine,
                endLine: gen.endLine,
                isExported: gen.isExported,
                purpose: gen.purpose,
                hash: gen.type,
            },
        })
    }

    // -------------------------------------------------------------------------
    // Edge construction
    // -------------------------------------------------------------------------

    /**
     * Import edges: fileA → fileB via 'imports'.
     * Only created when resolvedPath is non-empty AND the target file node exists.
     * When resolvedPath is empty the import was unresolved — no edge is created,
     * avoiding false positive graph connections to non-existent paths.
     */
    private addImportEdges(
        graph: DependencyGraph,
        file: ParsedFile,
        edgeKeys: Set<string>,
    ): void {
        for (const imp of file.imports) {
            if (!imp.resolvedPath || !graph.nodes.has(imp.resolvedPath)) continue
            this.pushEdge(graph, edgeKeys, {
                source: file.path,
                target: imp.resolvedPath,
                type: 'imports',
                confidence: 1.0,
            })
        }
    }

    /**
     * Call edges: fnA → fnB via 'calls'.
     *
     * Resolution strategy (in priority order):
     *   1. Named imports: `import { foo } from './x'` → maps foo → fn:./x:foo
     *   2. Default import aliased calls: `import jwt from 'x'; jwt.verify()` →
     *      the receiver (jwt) is matched against default import bindings.
     *      The method name (verify) is looked up in the resolved module.
     *   3. Local function in the same file (exact name match)
     *   4. Local class method (ClassName.method format)
     *
     * Confidence levels:
     *   1.0 — exact name, same file
     *   0.8 — resolved through named import
     *   0.6 — resolved through default import + method name lookup
     *   0.5 — dotted-access name stripped to simple name (uncertain receiver)
     */
    private addCallEdges(
        graph: DependencyGraph,
        file: ParsedFile,
        edgeKeys: Set<string>,
    ): void {
        // Build named-import map: importedName → canonicalFunctionId
        const importedNames = new Map<string, string>()
        // Build default-import map: localAlias → resolvedFilePath
        const defaultImports = new Map<string, string>()

        for (const imp of file.imports) {
            if (!imp.resolvedPath) continue
            for (const name of imp.names) {
                if (imp.isDefault) {
                    // `import jwt from 'x'` → defaultImports.set('jwt', 'src/x.ts')
                    defaultImports.set(name, imp.resolvedPath)
                } else {
                    // `import { foo } from 'x'` → importedNames.set('foo', 'fn:src/x.ts:foo')
                    importedNames.set(name, `fn:${imp.resolvedPath}:${name}`)
                }
            }
        }

        // Build class name → class id map for this file (for method resolution)
        const localClassIds = new Map<string, string>()
        for (const cls of file.classes ?? []) {
            localClassIds.set(cls.name, cls.id)
        }

        const allFunctions = [
            ...file.functions,
            ...(file.classes ?? []).flatMap(c => c.methods),
        ]

        for (const fn of allFunctions) {
            for (const call of fn.calls) {
                const hasDot = call.includes('.')
                const simpleName = hasDot ? call.split('.').pop()! : call
                const receiver = hasDot ? call.split('.')[0] : null

                // --- 1. Named import exact match ---
                const namedId = importedNames.get(call) ?? importedNames.get(simpleName)
                if (namedId && graph.nodes.has(namedId)) {
                    this.pushEdge(graph, edgeKeys, {
                        source: fn.id,
                        target: namedId,
                        type: 'calls',
                        confidence: 0.8,
                    })
                    continue
                }

                // --- 2. Default import: receiver is the alias, method is simpleName ---
                if (receiver && defaultImports.has(receiver)) {
                    const resolvedFile = defaultImports.get(receiver)!
                    // Try to find "fn:resolvedFile:simpleName" in graph
                    const methodId = `fn:${resolvedFile}:${simpleName}`
                    if (graph.nodes.has(methodId)) {
                        this.pushEdge(graph, edgeKeys, {
                            source: fn.id,
                            target: methodId,
                            type: 'calls',
                            confidence: 0.6,
                        })
                        continue
                    }
                }

                // --- 3. Local function exact match ---
                const localExactId = `fn:${file.path}:${simpleName}`
                if (graph.nodes.has(localExactId) && localExactId !== fn.id) {
                    this.pushEdge(graph, edgeKeys, {
                        source: fn.id,
                        target: localExactId,
                        type: 'calls',
                        confidence: simpleName === call ? 1.0 : 0.5,
                    })
                    continue
                }

                // --- 4. Local class method: ClassName.method format ---
                if (receiver && localClassIds.has(receiver)) {
                    const clsId = localClassIds.get(receiver)!
                    // Method IDs are stored as "fn:file:ClassName.methodName"
                    const classMethodId = `fn:${file.path}:${receiver}.${simpleName}`
                    if (graph.nodes.has(classMethodId) && classMethodId !== fn.id) {
                        this.pushEdge(graph, edgeKeys, {
                            source: fn.id,
                            target: classMethodId,
                            type: 'calls',
                            confidence: 0.8,
                        })
                        continue
                    }
                }

                // Unresolved call — not added to graph.
                // Callers can detect incomplete coverage by comparing
                // fn.calls.length to the number of outgoing 'calls' edges from fn.id.
            }
        }
    }

    /** Containment edges: file → function, file → class, class → method */
    private addContainmentEdges(
        graph: DependencyGraph,
        file: ParsedFile,
        edgeKeys: Set<string>,
    ): void {
        for (const fn of file.functions) {
            this.pushEdge(graph, edgeKeys, {
                source: file.path,
                target: fn.id,
                type: 'contains',
            })
        }
        for (const cls of file.classes ?? []) {
            this.pushEdge(graph, edgeKeys, {
                source: file.path,
                target: cls.id,
                type: 'contains',
            })
            for (const method of cls.methods) {
                this.pushEdge(graph, edgeKeys, {
                    source: cls.id,
                    target: method.id,
                    type: 'contains',
                })
            }
        }
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    /**
     * Push an edge only if it hasn't been added before.
     * Edge key format: "source->target:type"
     */
    private pushEdge(
        graph: DependencyGraph,
        edgeKeys: Set<string>,
        edge: GraphEdge,
    ): void {
        const key = `${edge.source}->${edge.target}:${edge.type}`
        if (edgeKeys.has(key)) return
        edgeKeys.add(key)
        graph.edges.push(edge)
    }

    /** Build adjacency maps from edge list for O(1) lookups */
    private buildAdjacencyMaps(graph: DependencyGraph): void {
        for (const edge of graph.edges) {
            if (!graph.outEdges.has(edge.source)) graph.outEdges.set(edge.source, [])
            graph.outEdges.get(edge.source)!.push(edge)

            if (!graph.inEdges.has(edge.target)) graph.inEdges.set(edge.target, [])
            graph.inEdges.get(edge.target)!.push(edge)
        }
    }
}
