import * as path from 'node:path'
import { createHash } from 'node:crypto'
import type { MikkContract, MikkLock } from './schema.js'
import type { DependencyGraph } from '../graph/types.js'
import type { ParsedFile } from '../parser/types.js'
import { hashContent } from '../hash/file-hasher.js'
import { computeModuleHash, computeRootHash } from '../hash/tree-hasher.js'
import { minimatch } from '../utils/minimatch.js'

const VERSION = '@getmikk/cli@1.2.1'

/**
 * LockCompiler — takes a DependencyGraph and a MikkContract
 * and compiles the complete mikk.lock.json.
 */
export class LockCompiler {
    /** Main entry — compile full lock from graph + contract + parsed files */
    compile(
        graph: DependencyGraph,
        contract: MikkContract,
        parsedFiles: ParsedFile[]
    ): MikkLock {
        const functions = this.compileFunctions(graph, contract)
        const classes = this.compileClasses(graph, contract)
        const generics = this.compileGenerics(graph, contract)
        const modules = this.compileModules(contract, parsedFiles)
        const files = this.compileFiles(parsedFiles, contract)

        const moduleHashes: Record<string, string> = {}
        for (const [id, mod] of Object.entries(modules)) {
            moduleHashes[id] = mod.hash
        }

        const lockData: MikkLock = {
            version: '1.0.0',
            generatedAt: new Date().toISOString(),
            generatorVersion: VERSION,
            projectRoot: contract.project.name,
            syncState: {
                status: 'clean',
                lastSyncAt: new Date().toISOString(),
                lockHash: '',
                contractHash: hashContent(JSON.stringify(contract)),
            },
            modules,
            functions,
            classes: Object.keys(classes).length > 0 ? classes : undefined,
            generics: Object.keys(generics).length > 0 ? generics : undefined,
            files,
            graph: {
                nodes: graph.nodes.size,
                edges: graph.edges.length,
                rootHash: computeRootHash(moduleHashes),
            },
        }

        // Compute overall lock hash from the compiled data
        lockData.syncState.lockHash = hashContent(JSON.stringify({
            functions: lockData.functions,
            classes: lockData.classes,
            generics: lockData.generics,
            modules: lockData.modules,
            files: lockData.files,
        }))

        return lockData
    }

    /** Compile function entries, assigning each to its module */
    private compileFunctions(
        graph: DependencyGraph,
        contract: MikkContract
    ): Record<string, MikkLock['functions'][string]> {
        const result: Record<string, MikkLock['functions'][string]> = {}

        for (const [id, node] of graph.nodes) {
            if (node.type !== 'function') continue

            const moduleId = this.findModule(node.file, contract.declared.modules)
            const inEdges = graph.inEdges.get(id) || []
            const outEdges = graph.outEdges.get(id) || []

            result[id] = {
                id,
                name: node.label,
                file: node.file,
                startLine: node.metadata.startLine ?? 0,
                endLine: node.metadata.endLine ?? 0,
                hash: node.metadata.hash ?? '',
                calls: outEdges.filter(e => e.type === 'calls').map(e => e.target),
                calledBy: inEdges.filter(e => e.type === 'calls').map(e => e.source),
                moduleId: moduleId || 'unknown',
                purpose: node.metadata.purpose,
                edgeCasesHandled: node.metadata.edgeCasesHandled,
                errorHandling: node.metadata.errorHandling,
                detailedLines: node.metadata.detailedLines,
            }
        }

        return result
    }

    private compileClasses(
        graph: DependencyGraph,
        contract: MikkContract
    ): Record<string, any> {
        const result: Record<string, any> = {}
        for (const [id, node] of graph.nodes) {
            if (node.type !== 'class') continue
            const moduleId = this.findModule(node.file, contract.declared.modules)
            result[id] = {
                id,
                name: node.label,
                file: node.file,
                startLine: node.metadata.startLine ?? 0,
                endLine: node.metadata.endLine ?? 0,
                moduleId: moduleId || 'unknown',
                isExported: node.metadata.isExported ?? false,
                purpose: node.metadata.purpose,
                edgeCasesHandled: node.metadata.edgeCasesHandled,
                errorHandling: node.metadata.errorHandling,
            }
        }
        return result
    }

    private compileGenerics(
        graph: DependencyGraph,
        contract: MikkContract
    ): Record<string, any> {
        const result: Record<string, any> = {}
        for (const [id, node] of graph.nodes) {
            if (node.type !== 'generic') continue
            const moduleId = this.findModule(node.file, contract.declared.modules)
            result[id] = {
                id,
                name: node.label,
                type: node.metadata.hash ?? 'generic', // we stored type name in hash
                file: node.file,
                startLine: node.metadata.startLine ?? 0,
                endLine: node.metadata.endLine ?? 0,
                moduleId: moduleId || 'unknown',
                isExported: node.metadata.isExported ?? false,
                purpose: node.metadata.purpose,
            }
        }
        return result
    }

    /** Compile module entries from contract definitions */
    private compileModules(
        contract: MikkContract,
        parsedFiles: ParsedFile[]
    ): Record<string, MikkLock['modules'][string]> {
        const result: Record<string, MikkLock['modules'][string]> = {}

        for (const module of contract.declared.modules) {
            const moduleFiles = parsedFiles
                .filter(f => this.fileMatchesModule(f.path, module.paths))
                .map(f => f.path)

            const fileHashes = moduleFiles.map(f => {
                const parsed = parsedFiles.find(pf => pf.path === f)
                return parsed?.hash ?? ''
            })

            result[module.id] = {
                id: module.id,
                files: moduleFiles,
                hash: computeModuleHash(fileHashes),
                fragmentPath: `.mikk/fragments/${module.id}.lock`,
            }
        }

        return result
    }

    /** Compile file entries */
    private compileFiles(
        parsedFiles: ParsedFile[],
        contract: MikkContract
    ): Record<string, MikkLock['files'][string]> {
        const result: Record<string, MikkLock['files'][string]> = {}

        for (const file of parsedFiles) {
            const moduleId = this.findModule(file.path, contract.declared.modules)
            result[file.path] = {
                path: file.path,
                hash: file.hash,
                moduleId: moduleId || 'unknown',
                lastModified: new Date().toISOString(),
            }
        }

        return result
    }

    /** Find which module a file belongs to based on path patterns */
    private findModule(
        filePath: string,
        modules: MikkContract['declared']['modules']
    ): string | null {
        for (const module of modules) {
            if (this.fileMatchesModule(filePath, module.paths)) {
                return module.id
            }
        }
        return null
    }

    /** Check if a file path matches any of the module's path patterns */
    private fileMatchesModule(filePath: string, patterns: string[]): boolean {
        const normalized = filePath.replace(/\\/g, '/')
        for (const pattern of patterns) {
            if (minimatch(normalized, pattern)) {
                return true
            }
        }
        return false
    }
}
