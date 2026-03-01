import * as path from 'node:path'
import type { DependencyGraph, GraphNode, GraphEdge } from './types.js'
import type { ParsedFile, ParsedFunction, ParsedClass } from '../parser/types.js'

/**
 * GraphBuilder — takes parsed files and builds the dependency graph.
 * Two-pass approach: first add all nodes, then add all edges.
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

        // First pass: add all nodes
        for (const file of files) {
            this.addFileNode(graph, file)
            for (const fn of file.functions) {
                this.addFunctionNode(graph, fn)
            }
            for (const cls of file.classes || []) {
                this.addClassNode(graph, cls, file.path)
            }
            for (const gen of file.generics || []) {
                this.addGenericNode(graph, gen)
            }
        }

        // Second pass: add all edges
        for (const file of files) {
            this.addImportEdges(graph, file)
            this.addCallEdges(graph, file)
            this.addContainmentEdges(graph, file)
        }

        // Third pass: build adjacency maps for fast lookup
        this.buildAdjacencyMaps(graph)

        return graph
    }

    private addFileNode(graph: DependencyGraph, file: ParsedFile): void {
        graph.nodes.set(file.path, {
            id: file.path,
            type: 'file',
            label: path.basename(file.path),
            file: file.path,
            metadata: { hash: file.hash },
        })
    }

    private addFunctionNode(graph: DependencyGraph, fn: ParsedFunction): void {
        graph.nodes.set(fn.id, {
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
                edgeCasesHandled: fn.edgeCasesHandled,
                errorHandling: fn.errorHandling,
                detailedLines: fn.detailedLines,
            },
        })
    }

    private addClassNode(graph: DependencyGraph, cls: ParsedClass, filePath: string): void {
        // Add a node for the class itself
        graph.nodes.set(cls.id, {
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
        })
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
                hash: gen.type, // reusing hash or just storing the type string
            },
        })
    }

    /** Creates edges for import statements: fileA imports fileB → edge(A, B, 'imports') */
    private addImportEdges(graph: DependencyGraph, file: ParsedFile): void {
        for (const imp of file.imports) {
            if (imp.resolvedPath && graph.nodes.has(imp.resolvedPath)) {
                graph.edges.push({
                    source: file.path,
                    target: imp.resolvedPath,
                    type: 'imports',
                })
            }
        }
    }

    /** Creates edges for function calls: fnA calls fnB → edge(A, B, 'calls') */
    private addCallEdges(graph: DependencyGraph, file: ParsedFile): void {
        // Build a map of import names to function IDs for resolving calls
        const importedNames = new Map<string, string>()
        for (const imp of file.imports) {
            if (imp.resolvedPath) {
                for (const name of imp.names) {
                    importedNames.set(name, `fn:${imp.resolvedPath}:${name}`)
                }
            }
        }

        const allFunctions = [...file.functions, ...file.classes.flatMap(c => c.methods)]

        for (const fn of allFunctions) {
            for (const call of fn.calls) {
                // Try to resolve: first check imported names, then local functions
                const simpleName = call.includes('.') ? call.split('.').pop()! : call

                // Check if it's an imported function
                const importedId = importedNames.get(simpleName) || importedNames.get(call)
                if (importedId && graph.nodes.has(importedId)) {
                    graph.edges.push({
                        source: fn.id,
                        target: importedId,
                        type: 'calls',
                    })
                    continue
                }

                // Check if it's a local function in the same file
                const localId = `fn:${file.path}:${simpleName}`
                if (graph.nodes.has(localId) && localId !== fn.id) {
                    graph.edges.push({
                        source: fn.id,
                        target: localId,
                        type: 'calls',
                    })
                }
            }
        }
    }

    /** Creates containment edges: file contains function → edge(file, fn, 'contains') */
    private addContainmentEdges(graph: DependencyGraph, file: ParsedFile): void {
        for (const fn of file.functions) {
            graph.edges.push({
                source: file.path,
                target: fn.id,
                type: 'contains',
            })
        }
        for (const cls of file.classes) {
            graph.edges.push({
                source: file.path,
                target: cls.id,
                type: 'contains',
            })
            for (const method of cls.methods) {
                graph.edges.push({
                    source: cls.id,
                    target: method.id,
                    type: 'contains',
                })
            }
        }
    }

    /** Build adjacency maps from edge list for O(1) lookups */
    private buildAdjacencyMaps(graph: DependencyGraph): void {
        for (const edge of graph.edges) {
            // outEdges
            if (!graph.outEdges.has(edge.source)) {
                graph.outEdges.set(edge.source, [])
            }
            graph.outEdges.get(edge.source)!.push(edge)

            // inEdges
            if (!graph.inEdges.has(edge.target)) {
                graph.inEdges.set(edge.target, [])
            }
            graph.inEdges.get(edge.target)!.push(edge)
        }
    }
}
