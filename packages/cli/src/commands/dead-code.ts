import type { Command } from 'commander'
import * as nodePath from 'node:path'
import {
    LockReader,
    DeadCodeDetector,
    type MikkLock, type DependencyGraph, type GraphNode, type GraphEdge,
} from '@getmikk/core'

export function registerDeadCodeCommand(program: Command) {
    program
        .command('dead-code')
        .description('Detect dead code — functions with zero callers after multi-pass exemptions')
        .option('-m, --module <moduleId>', 'Filter to a specific module')
        .option('--json', 'Output raw JSON instead of formatted table')
        .addHelpText('after',
          `\nExamples:\n` +
          `  mikk dead-code              List all dead code candidates\n` +
          `  mikk dead-code --module cli   Filter to specific module\n` +
          `  mikk dead-code --json         Machine-readable output\n` +
          `\nDead code detection analyzes the call graph to find functions\n` +
          `that are never referenced by other code.\n`)
        .action(async (opts: { module?: string; json?: boolean }) => {
            const projectRoot = process.cwd()

            // Read lock file
            const lockReader = new LockReader()
            let lock: MikkLock
            try {
                lock = await lockReader.read(nodePath.join(projectRoot, 'mikk.lock.json'))
            } catch {
                console.error('❌ No mikk.lock.json found. Run `mikk analyze` first.')
                process.exit(1)
            }

            // Build graph from lock
            const graph = buildGraphFromLock(lock)

            // Detect dead code
            const detector = new DeadCodeDetector(graph, lock)
            const result = detector.detect()

            // Filter by module if specified
            const deadItems = opts.module
                ? result.deadFunctions.filter((f: { moduleId?: string }) => f.moduleId === opts.module)
                : result.deadFunctions

            if (opts.json) {
                console.log(JSON.stringify(opts.module ? { ...result, deadFunctions: deadItems } : result, null, 2))
                return
            }

            // Formatted output
            console.log()
            console.log(`🔍 Dead Code Report`)
            console.log(`${'─'.repeat(60)}`)
            console.log(`   Total functions: ${result.totalFunctions}`)
            console.log(`   Dead functions:  ${deadItems.length}`)
            console.log(`   Dead percentage: ${result.deadPercentage}%`)
            console.log()

            if (deadItems.length === 0) {
                console.log('   ✅ No dead code detected!')
                console.log()
                return
            }

            // Group by module
            const byModule = new Map<string, typeof deadItems>()
            for (const item of deadItems) {
                const mod = item.moduleId ?? 'unknown'
                if (!byModule.has(mod)) byModule.set(mod, [])
                byModule.get(mod)!.push(item)
            }

            for (const [moduleId, items] of byModule) {
                const moduleTotal = result.byModule[moduleId]?.total ?? 0
                console.log(`   📦 ${moduleId} (${items.length} dead / ${moduleTotal} total)`)
                for (const item of items.slice(0, 15)) {
                    console.log(`      ⚠  ${item.name}`)
                    console.log(`         ${item.file}`)
                    console.log(`         ${item.reason}`)
                }
                if (items.length > 15) {
                    console.log(`      ... and ${items.length - 15} more`)
                }
                console.log()
            }
        })
}

/** Build DependencyGraph from lock — same logic as mcp-server/tools.ts */
function buildGraphFromLock(lock: MikkLock): DependencyGraph {
    const nodes = new Map<string, GraphNode>()
    const edges: GraphEdge[] = []
    const outEdges = new Map<string, GraphEdge[]>()
    const inEdges = new Map<string, GraphEdge[]>()

    for (const fn of Object.values(lock.functions)) {
        nodes.set(fn.id, {
            id: fn.id,
            type: 'function',
            name: fn.name,
            file: fn.file,
            moduleId: fn.moduleId,
            metadata: {
                startLine: fn.startLine,
                endLine: fn.endLine,
                isExported: fn.isExported,
                isAsync: fn.isAsync,
                hash: fn.hash,
                purpose: fn.purpose,
                params: fn.params,
                returnType: fn.returnType,
            },
        })
    }

    for (const file of Object.values(lock.files)) {
        nodes.set(file.path, {
            id: file.path,
            type: 'file',
            name: file.path.split('/').pop() || file.path,
            file: file.path,
            moduleId: file.moduleId,
            metadata: {},
        })
    }

    for (const cls of Object.values(lock.classes ?? {})) {
        nodes.set(cls.id, {
            id: cls.id,
            type: 'class',
            name: cls.name,
            file: cls.file,
            moduleId: cls.moduleId,
            metadata: {
                isExported: cls.isExported,
            },
        })
    }

    for (const fn of Object.values(lock.functions)) {
        for (const calleeId of fn.calls ?? []) {
            if (!nodes.has(calleeId)) continue
            const edge: GraphEdge = { from: fn.id, to: calleeId, type: 'calls', confidence: 1.0 }
            edges.push(edge)

            const out = outEdges.get(fn.id) ?? []
            out.push(edge)
            outEdges.set(fn.id, out)

            const inE = inEdges.get(calleeId) ?? []
            inE.push(edge)
            inEdges.set(calleeId, inE)
        }
    }

    for (const fn of Object.values(lock.functions)) {
        for (const callerId of fn.calledBy ?? []) {
            if (!nodes.has(fn.id) || !nodes.has(callerId)) continue
            const edge: GraphEdge = { from: callerId, to: fn.id, type: 'calls', confidence: 0.9 }
            edges.push(edge)

            const out = outEdges.get(callerId) ?? []
            out.push(edge)
            outEdges.set(callerId, out)

            const inE = inEdges.get(fn.id) ?? []
            inE.push(edge)
            inEdges.set(fn.id, inE)
        }
    }

    return { nodes, edges, outEdges, inEdges }
}
