import fs from 'node:fs/promises'
import type { MikkLock, DependencyGraph, GraphNode, GraphEdge } from '@getmikk/core'

const START_MARKER = '<!-- MIKK-START -->'
const END_MARKER = '<!-- MIKK-END -->'

export async function patchFileContent(filePath: string, newContent: string): Promise<void> {
    const block = `${START_MARKER}\n\n${newContent.trim()}\n\n${END_MARKER}`
    try {
        const existing = await fs.readFile(filePath, 'utf-8')
        const startIdx = existing.indexOf(START_MARKER)
        const endIdx = existing.indexOf(END_MARKER)
        
        if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
            // Replace existing block perfectly
            const before = existing.slice(0, startIdx)
            const after = existing.slice(endIdx + END_MARKER.length)
            
            const result = `${before.trimEnd()}\n\n${block}\n\n${after.trimStart()}`.trim() + '\n'
            await fs.writeFile(filePath, result, 'utf-8')
        } else {
            // Append securely to the bottom
            const result = existing.trim() === '' 
                ? `${block}\n`
                : `${existing.trimEnd()}\n\n${block}\n`
            await fs.writeFile(filePath, result, 'utf-8')
        }
    } catch {
        // File doesn't exist, create it freshly
        await fs.writeFile(filePath, `${block}\n`, 'utf-8')
    }
}

// ── Shared graph builder (single source of truth for dead-code, stats, ci, suggest) ──
export function buildGraphFromLock(lock: MikkLock): DependencyGraph {
    const nodes = new Map<string, GraphNode>()
    const edges: GraphEdge[] = []
    const outEdges = new Map<string, GraphEdge[]>()
    const inEdges = new Map<string, GraphEdge[]>()
    const edgeKeys = new Set<string>()

    // ── Node registration ──────────────────────────────────────────────────
    for (const fn of Object.values(lock.functions)) {
        nodes.set(fn.id, {
            id: fn.id, type: 'function', name: fn.name, file: fn.file,
            moduleId: fn.moduleId,
            metadata: { startLine: fn.startLine, endLine: fn.endLine, isExported: fn.isExported, isAsync: fn.isAsync, hash: fn.hash, purpose: fn.purpose, params: fn.params, returnType: fn.returnType },
        })
    }
    // Note: lock.files stores path as the KEY, not in the value (.path is undefined).
    // Always use Object.entries() and the key as the canonical path.
    for (const [filePath, file] of Object.entries(lock.files ?? {})) {
        nodes.set(filePath, { id: filePath, type: 'file', name: filePath.split('/').pop() || filePath, file: filePath, moduleId: file.moduleId, metadata: {} })
    }
    for (const cls of Object.values(lock.classes ?? {})) {
        nodes.set(cls.id, { id: cls.id, type: 'class', name: cls.name, file: cls.file, moduleId: cls.moduleId, metadata: { isExported: cls.isExported } })
    }

    // ── Deduplicating edge helper ──────────────────────────────────────────
    const addEdge = (from: string, to: string, type: GraphEdge['type'], confidence: number) => {
        if (!nodes.has(from) || !nodes.has(to)) return
        const key = `${from}->${to}:${type}`
        if (edgeKeys.has(key)) return
        edgeKeys.add(key)
        const edge: GraphEdge = { from, to, type, confidence }
        edges.push(edge)
        const out = outEdges.get(from) ?? []; out.push(edge); outEdges.set(from, out)
        const inE = inEdges.get(to) ?? []; inE.push(edge); inEdges.set(to, inE)
    }

    // ── Call edges (fn.calls + fn.calledBy for bidirectional coverage) ─────
    for (const fn of Object.values(lock.functions)) {
        for (const calleeId of fn.calls ?? []) addEdge(fn.id, calleeId, 'calls', 1.0)
        for (const callerId of fn.calledBy ?? []) addEdge(callerId, fn.id, 'calls', 0.9)
    }

    // ── Import edges (file → file) ─────────────────────────────────────────
    // lock.files uses path as KEY, not .path field (which is undefined)
    for (const [filePath, fileInfo] of Object.entries(lock.files ?? {})) {
        for (const imp of fileInfo.imports ?? []) {
            if (imp.resolvedPath && nodes.has(imp.resolvedPath)) {
                addEdge(filePath, imp.resolvedPath, 'imports', 1.0)
            }
        }
    }

    // ── Contains edges (file → function, file → class) ─────────────────────
    // These are critical for DeadCodeDetector.isMethodOfUsedClass() to work:
    // it checks inEdges on `class:${file}:${name}` for callers.
    for (const fn of Object.values(lock.functions)) {
        if (fn.file && nodes.has(fn.file)) addEdge(fn.file, fn.id, 'contains', 1.0)
    }
    for (const cls of Object.values(lock.classes ?? {})) {
        if (cls.file && nodes.has(cls.file)) addEdge(cls.file, cls.id, 'contains', 1.0)
    }

    return { nodes, edges, outEdges, inEdges }
}

/**
 * Compute cyclomatic-like complexity from available lock fields.
 * fn.complexity doesn't exist in MikkLockFunction — derive from call count,
 * param count, error handling branches, and function length.
 */
export function computeComplexity(fn: MikkLock['functions'][string]): number {
    const lineCount = Math.max(0, (fn.endLine ?? 0) - (fn.startLine ?? 0))
    const callComplexity = Math.min(10, (fn.calls?.length ?? 0))
    const paramComplexity = Math.min(5, (fn.params?.length ?? 0))
    const errorComplexity = Math.min(5, (fn.errorHandling?.length ?? 0))
    const lineComplexity = Math.floor(lineCount / 15)
    return 1 + callComplexity + paramComplexity + errorComplexity + lineComplexity
}

export async function stripMikkBlock(filePath: string): Promise<boolean> {
    try {
        const existing = await fs.readFile(filePath, 'utf-8')
        const startIdx = existing.indexOf(START_MARKER)
        const endIdx = existing.indexOf(END_MARKER)
        
        if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
            const before = existing.slice(0, startIdx)
            const after = existing.slice(endIdx + END_MARKER.length)
            const result = `${before.trimEnd()}\n\n${after.trimStart()}`.trim() + '\n'
            
            if (result.trim() === '') {
                await fs.unlink(filePath)
            } else {
                await fs.writeFile(filePath, result, 'utf-8')
            }
            return true
        }
        return false
    } catch {
        return false
    }
}
