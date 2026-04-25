import type { Command } from 'commander'
import * as nodePath from 'node:path'
import {
    LockReader,
    DeadCodeDetector,
    GraphBuilder,
    type MikkLock,
} from '@getmikk/core'

function normalizePathKey(p: string): string {
    return (p || '').replace(/\\/g, '/').toLowerCase()
}

export function registerDeadCodeCommand(program: Command) {
    program
        .command('dead-code')
        .description('Find functions never called by anyone')
        .option('-p, --path <path>', 'Project path (defaults to current directory)')
        .option('-m, --module <moduleId>', 'Filter to a specific module')
        .option('--include-exported', 'Include exported functions in output')
        .option('--min-lines <n>', 'Minimum function length to include', '3')
        .option('--json', 'Output raw JSON instead of formatted table')
        .addHelpText('after',
          `\nExamples:\n` +
          `  mikk dead-code                            List all dead code candidates\n` +
          `  mikk dead-code --path ./my-project        Analyze a specific project\n` +
          `  mikk dead-code --module cli               Filter to specific module\n` +
          `  mikk dead-code --json                     Machine-readable output\n` +
          `\nDead code detection analyzes the call graph to find functions\n` +
          `that are never referenced by other code.\n`)
        .action(async (opts: { path?: string; module?: string; includeExported?: boolean; minLines?: string; json?: boolean }) => {
            const projectRoot = opts.path || process.cwd()

            // Read lock file
            const lockReader = new LockReader()
            let lock: MikkLock
            try {
                lock = await lockReader.read(nodePath.join(projectRoot, 'mikk.lock.json'))
            } catch {
                console.error('❌ No mikk.lock.json found. Run `mikk analyze` first.')
                process.exit(1)
            }

            // Build graph from lock (same canonical builder as MCP)
            const graph = new GraphBuilder().buildFromLock(lock)

            // Detect dead code
            const detector = new DeadCodeDetector(graph, lock)
            const result = detector.detect()
            const minLines = Math.max(0, Number.parseInt(opts.minLines ?? '3', 10) || 0)

            // Filter by module if specified.
            // Use lock.modules[id].files as the authoritative file-to-module map
            // (lock.functions[id].moduleId is unreliable for path-based assignments).
            let deadItems = result.deadFunctions
            if (opts.module) {
                const lockMod = (lock.modules as any)[opts.module]
                const modFileSet = new Set<string>(((lockMod?.files ?? []) as string[]).map(normalizePathKey))
                deadItems = result.deadFunctions.filter(
                    (f: { file: string }) => modFileSet.has(normalizePathKey(f.file))
                )
            }
            if (!opts.includeExported) {
                deadItems = deadItems.filter((f: any) => {
                    const fn = lock.functions[f.id]
                    return !(fn?.isExported)
                })
            }
            if (minLines > 0) {
                deadItems = deadItems.filter((f: any) => {
                    const fn = lock.functions[f.id]
                    if (!fn) return true
                    return (fn.endLine - fn.startLine + 1) >= minLines
                })
            }

            const filteredPercent = result.totalFunctions > 0
                ? Math.round((deadItems.length / result.totalFunctions) * 1000) / 10
                : 0

            if (opts.json) {
                console.log(JSON.stringify({
                    ...result,
                    deadFunctions: deadItems,
                    deadCount: deadItems.length,
                    deadPercentage: filteredPercent,
                }, null, 2))
                return
            }

            // Formatted output
            console.log()
            console.log(`🔍 Dead Code Report`)
            console.log(`${'─'.repeat(60)}`)
            console.log(`   Total functions: ${result.totalFunctions}`)
            console.log(`   Dead functions:  ${deadItems.length}`)
            console.log(`   Dead percentage: ${filteredPercent}%`)
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
