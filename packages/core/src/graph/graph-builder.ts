import * as nodePath from 'node:path'
import type { DependencyGraph, GraphEdge } from './types.js'
import type { MikkLock } from '../contract/schema.js'
import type { ParsedFile, ParsedFunction, ParsedClass, ParsedGeneric, ParsedVariable } from '../parser/types.js'
import { GlobalSymbolTable } from './symbol-table.js'
import { normalizePathQuiet } from '../utils/path.js'

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
 * Now integrated with GlobalSymbolTable for high-precision resolution.
 */
export class GraphBuilder {
    build(files: ParsedFile[]): DependencyGraph {
        const graph = this.createEmptyGraph()
        const edgeKeys = new Set<string>()
        const symbolTable = new GlobalSymbolTable()

        // Pass 1: Register all nodes & symbols
        for (const file of files) {
            this.addFileNode(graph, file)
            symbolTable.register(file)

            for (const fn of file.functions) this.addFunctionNode(graph, fn)
            for (const cls of file.classes ?? []) this.addClassNode(graph, cls)
            for (const gen of file.generics ?? []) this.addGenericNode(graph, gen)
            for (const v of file.variables ?? []) this.addVariableNode(graph, v)
        }

        // Build classNameToId ONCE after pass 1 — used by all addInheritanceEdges calls.
        // Previously rebuilt per file: O(files × nodes). Now O(nodes) total.
        const classNameToId = new Map<string, string>()
        for (const [, node] of graph.nodes) {
            if (node.type === 'class') classNameToId.set(node.name, node.id)
        }

        // Pass 2: Structural edges (imports, containment, inheritance)
        for (const file of files) {
            this.addImportEdges(graph, file, edgeKeys)
            this.addContainmentEdges(graph, file, edgeKeys)
            this.addInheritanceEdges(graph, file, edgeKeys, classNameToId)
        }

        // Pass 3: Behavioural edges (Using Global Symbol Table)
        for (const file of files) {
            this.addCallEdges(graph, file, symbolTable, edgeKeys)
        }

        this.buildAdjacencyMaps(graph)
        return graph
    }

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

        // Function nodes + build file→function index for O(n) containment
        const fileFnIndex = new Map<string, string[]>()
        for (const fn of Object.values(lock.functions)) {
            const normFile = this.normPath(fn.file)
            graph.nodes.set(fn.id, {
                id: fn.id, type: 'function', name: fn.name,
                file: normFile, moduleId: fn.moduleId,
                metadata: { ...fn },
            })
            const fns = fileFnIndex.get(normFile) || []
            fns.push(fn.id)
            fileFnIndex.set(normFile, fns)
        }

        // Class nodes + file→class index
        const fileClsIndex = new Map<string, string[]>()
        for (const cls of Object.values(lock.classes ?? {})) {
            const normFile = this.normPath(cls.file)
            graph.nodes.set(cls.id, {
                id: cls.id, type: 'class', name: cls.name,
                file: normFile, moduleId: cls.moduleId,
                metadata: { ...cls },
            })
            const clss = fileClsIndex.get(normFile) || []
            clss.push(cls.id)
            fileClsIndex.set(normFile, clss)
        }

        // Generic nodes (types, interfaces, enums)
        for (const gen of Object.values(lock.generics ?? {})) {
            const normFile = this.normPath(gen.file)
            graph.nodes.set(gen.id, {
                id: gen.id, type: 'generic', name: gen.name,
                file: normFile, moduleId: gen.moduleId,
                metadata: { ...gen },
            })
        }

        // Build all file-level edges using pre-computed indices (O(n) total)
        for (const file of Object.values(lock.files)) {
            const fp = this.normPath(file.path)

            // Import edges — use resolvedPath when available, source as fallback
            for (const imp of file.imports ?? []) {
                const rp = imp.resolvedPath ? this.normPath(imp.resolvedPath) : null
                if (rp && graph.nodes.has(rp)) {
                    this.pushEdge(graph, edgeKeys, { from: fp, to: rp, type: 'imports', confidence: 1.0, weight: EDGE_WEIGHTS.imports })
                }
            }

            // Containment edges — O(1) per file via index lookup
            for (const fnId of fileFnIndex.get(fp) || []) {
                this.pushEdge(graph, edgeKeys, { from: fp, to: fnId, type: 'contains', confidence: 1.0, weight: EDGE_WEIGHTS.contains })
            }
            for (const clsId of fileClsIndex.get(fp) || []) {
                this.pushEdge(graph, edgeKeys, { from: fp, to: clsId, type: 'contains', confidence: 1.0, weight: EDGE_WEIGHTS.contains })
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

        // Inheritance edges (extends/implements)
        for (const node of graph.nodes.values()) {
            if (node.type === 'class') {
                const meta = node.metadata as any
                // T58 fix: buildFromLock spreads MikkLockClass which uses 'extends' (string),
                // while build() from ParsedFile uses 'inheritsFrom' (string[]). Support both.
                const baseNames: string[] = meta.inheritsFrom ?? (meta.extends ? [meta.extends] : [])
                for (const baseName of baseNames) {
                    const targetId = this.resolveSymbolInGraph(graph, baseName, node.file)
                    if (targetId) {
                        this.pushEdge(graph, edgeKeys, { from: node.id, to: targetId, type: 'extends', confidence: 1.0, weight: EDGE_WEIGHTS.extends })
                    }
                }
                // T58 fix: 'implements' field name is the same in both lock and ParsedFile
                const ifaceNames: string[] = Array.isArray(meta.implements) ? meta.implements : []
                for (const ifaceName of ifaceNames) {
                    const targetId = this.resolveSymbolInGraph(graph, ifaceName, node.file)
                    if (targetId) {
                        this.pushEdge(graph, edgeKeys, { from: node.id, to: targetId, type: 'implements', confidence: 1.0, weight: EDGE_WEIGHTS.implements })
                    }
                }
            }
        }

        this.buildAdjacencyMaps(graph)
        return graph
    }

    private normPath(p: string): string {
        return normalizePathQuiet(p)
    }

    private createEmptyGraph(): DependencyGraph {
        return { nodes: new Map(), edges: [], outEdges: new Map(), inEdges: new Map() }
    }

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
                isAbstract: fn.isAbstract,
                hash: fn.hash, purpose: fn.purpose,
                params: fn.params, returnType: fn.returnType !== 'void' ? fn.returnType : undefined,
                edgeCasesHandled: fn.edgeCasesHandled,
                errorHandling: fn.errorHandling,
                detailedLines: fn.detailedLines
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
                isAbstract: cls.isAbstract
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
    }

    private addInheritanceEdges(graph: DependencyGraph, file: ParsedFile, edgeKeys: Set<string>, classNameToId: Map<string, string>): void {
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

    private addCallEdges(graph: DependencyGraph, file: ParsedFile, symbolTable: GlobalSymbolTable, edgeKeys: Set<string>): void {
        const filePath = this.normPath(file.path)

        const behaviors: Array<{ sourceId: string; calls: Array<{ name: string; type: string }> }> = [
            { sourceId: filePath, calls: file.calls ?? [] },
            ...file.functions.map(fn => ({ sourceId: fn.id, calls: fn.calls })),
            ...(file.classes ?? []).flatMap(cls =>
                cls.methods.map(m => ({ sourceId: m.id, calls: m.calls }))
            ),
        ]

        for (const { sourceId, calls } of behaviors) {
            for (const call of calls) {
                if (!call.name || call.name === 'super') continue

                const targetId = symbolTable.resolve(call.name, filePath, file.imports)
                if (targetId && targetId !== sourceId) {
                    this.pushEdge(graph, edgeKeys, {
                        from: sourceId, to: targetId,
                        type: call.type === 'property' ? 'accesses' : 'calls',
                        confidence: 0.9,
                        weight: call.type === 'property' ? EDGE_WEIGHTS.accesses : EDGE_WEIGHTS.calls.exact,
                    })
                }
            }
        }
    }

    private pushEdge(graph: DependencyGraph, edgeKeys: Set<string>, edge: GraphEdge): void {
        const key = `${edge.from}->${edge.to}:${edge.type}`
        if (edgeKeys.has(key)) return
        edgeKeys.add(key)
        graph.edges.push(edge)
    }

    private resolveSymbolInGraph(graph: DependencyGraph, name: string, fromFile: string): string | null {
        // Simple name-based resolution for global/exported symbols in graph
        // In a real scenario, this would use the symbol table, but from lock we 
        // can heuristic-match exported classes/interfaces by name.
        for (const [id, node] of graph.nodes) {
            if (node.name === name && (node.type === 'class' || node.type === 'generic')) {
                return id
            }
        }
        return null
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
