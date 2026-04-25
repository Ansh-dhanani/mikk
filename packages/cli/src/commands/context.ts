import * as path from 'node:path'
import * as fs from 'node:fs/promises'
import type { Command } from 'commander'
import chalk from 'chalk'
import ora from 'ora'
import {
    ContractReader, LockReader,
} from '@getmikk/core'
import { ContextBuilder } from '@getmikk/ai-context'
import { getProvider } from '@getmikk/ai-context'
import type { ContextQuery } from '@getmikk/ai-context'

/** Parse a numeric CLI option with validation */
function parseIntOption(value: string, name: string, _fallback: number): number {
    const n = parseInt(value, 10)
    if (isNaN(n) || n < 0) {
        console.error(chalk.red(`Invalid value for --${name}: "${value}" (expected a positive integer)`))
        process.exit(1)
    }
    return n
}

export function registerContextCommands(program: Command) {
    const context = program
        .command('context')
        .description('Graph traversal → AI context (modules, calls, routes)')

    // ── mikk context query "..." ─────────────────────────────────────────
    context
        .command('query <question> [path]')
        .description('Ask an architecture question — returns graph-traced context')
        .option('--provider <name>', 'Output provider: claude | generic | compact', 'claude')
        .option('--hops <n>', 'Graph traversal depth (default 4)', '4')
        .option('--limit <n>', 'Max functions to include', '100')
        .option('--tokens <n>', 'Token budget for functions (default 6000)', '6000')
        .option('--strict', 'High-precision mode: include only tightly relevant context')
        .option('--must <terms>', 'Comma-separated required terms, e.g. resolver,import,ts')
        .option('--all-keywords', 'In strict mode, require every extracted keyword to match')
        .option('--min-keywords <n>', 'In strict mode, minimum keyword matches per function (default 1)', '1')
        .option('--exact-only', 'Hard gate: only keep strict keyword matches in output')
        .option('--fail-fast', 'Return empty context when strict filters find no exact match')
        .option('--no-auto-fallback', 'Disable automatic fallback to balanced mode when strict mode returns no matches')
        .option('--no-callgraph', 'Omit call/calledBy edges from output')
        .option('--out <file>', 'Write context to a file instead of stdout')
        .option('--meta', 'Print meta diagnostics (seed count, tokens used, keywords)')
        .action(async (question: string, projectPath: string, options: any) => {
            const projectRoot = projectPath || process.cwd()

            try {
                const { contract, lock } = await loadContractAndLock(projectRoot)

                const query: ContextQuery = {
                    task: question,
                    maxHops: parseIntOption(options.hops, 'hops', 4),
                    maxFunctions: parseIntOption(options.limit, 'limit', 100),
                    tokenBudget: parseIntOption(options.tokens, 'tokens', 6000),
                    includeCallGraph: options.callgraph !== false,
                    relevanceMode: options.strict ? 'strict' : 'balanced',
                    requiredKeywords: parseCsvOption(options.must),
                    requireAllKeywords: options.allKeywords === true,
                    minKeywordMatches: parseIntOption(options.minKeywords, 'min-keywords', 1),
                    exactOnly: options.exactOnly === true,
                    failFast: options.failFast === true,
                }

                const builder = new ContextBuilder(contract, lock)
                const { ctx, fallbackUsed } = buildContextWithOptionalFallback(builder, query, options.autoFallback !== false)

                if (options.meta) {
                    printMeta(ctx.meta, question)
                }

                const provider = getProvider(options.provider)
                const output = provider.formatContext(ctx)
                const finalOutput = fallbackUsed
                    ? `${chalk.yellow('Note: strict mode had no exact matches; showing balanced fallback context.')}\n\n${output}`
                    : output

                if (options.out) {
                    await fs.writeFile(options.out, finalOutput, 'utf-8')
                    console.log(chalk.green(`Context written to ${options.out}`))
                } else {
                    console.log(finalOutput)
                }

            } catch (err: unknown) {
                const message = err instanceof Error ? err.message : String(err)
                console.error(chalk.red(message))
                process.exit(1)
            }
        })

    // ── mikk context impact <file> ───────────────────────────────────────
    context
        .command('impact <target> [path]')
        .description('What breaks if this file/function/module changes?')
        .option('--provider <name>', 'Output provider: claude | generic | compact', 'claude')
        .option('--tokens <n>', 'Token budget (default 8000)', '8000')
        .option('--meta', 'Print meta diagnostics')
        .option('-f, --files', 'Show only affected files')
        .option('--functions', 'Show only affected functions')
        .option('--modules', 'Show affected modules')
        .option('--depth', 'Show dependency depth per node')
        .option('--risk', 'Show risk assessment')
        .option('-j, --json', 'Output as JSON')
        .option('--max-impact <n>', 'Maximum impacts to show', '50')
        .action(async (target: string, projectPath: string, options: any) => {
            const projectRoot = projectPath || process.cwd()

            try {
                const { contract, lock } = await loadContractAndLock(projectRoot)

                const spinner = ora('Analyzing impact...').start()

                const searchLower = target.toLowerCase()
                let targetId: string | null = null
                let targetEntity: any = null
                let targetType: 'function' | 'class' | 'generic' = 'function'

                // Search functions
                const fnEntries = Object.entries(lock.functions || {})
                for (const [fnId, fn] of fnEntries) {
                    if (fn.name && fn.name.toLowerCase() === searchLower) {
                        targetId = fnId
                        targetEntity = fn
                        targetType = 'function'
                        break
                    }
                }
                if (!targetId) {
                    for (const [fnId, fn] of fnEntries) {
                        if (fn.name && fn.name.toLowerCase().includes(searchLower)) {
                            targetId = fnId
                            targetEntity = fn
                            targetType = 'function'
                            break
                        }
                    }
                }

                // Search classes if not found
                if (!targetId && lock.classes) {
                    const classEntries = Object.entries(lock.classes)
                    for (const [clsId, cls] of classEntries) {
                        if (cls.name && cls.name.toLowerCase() === searchLower) {
                            targetId = clsId
                            targetEntity = cls
                            targetType = 'class'
                            break
                        }
                    }
                    if (!targetId) {
                        for (const [clsId, cls] of classEntries) {
                            if (cls.name && cls.name.toLowerCase().includes(searchLower)) {
                                targetId = clsId
                                targetEntity = cls
                                targetType = 'class'
                                break
                            }
                        }
                    }
                }

                // Search generics if not found
                if (!targetId && lock.generics) {
                    const genEntries = Object.entries(lock.generics)
                    for (const [genId, gen] of genEntries) {
                        if (gen.name && gen.name.toLowerCase() === searchLower) {
                            targetId = genId
                            targetEntity = gen
                            targetType = 'generic'
                            break
                        }
                    }
                    if (!targetId) {
                        for (const [genId, gen] of genEntries) {
                            if (gen.name && gen.name.toLowerCase().includes(searchLower)) {
                                targetId = genId
                                targetEntity = gen
                                targetType = 'generic'
                                break
                            }
                        }
                    }
                }

                // If still not found, try to match as file path (like MCP tool)
                if (!targetId || !targetEntity) {
                    const normalizedTarget = target.replace(/\\/g, '/')
                    const fnEntries = Object.entries(lock.functions || {})
                    
                    // Find all functions in matching file
                    const fileFunctions: Array<{id: string, fn: any, type: string}> = []
                    
                    for (const [fnId, fn] of fnEntries) {
                        if (fn.file && fn.file.includes(normalizedTarget)) {
                            fileFunctions.push({ id: fnId, fn, type: 'function' })
                        }
                    }
                    
                    if (fileFunctions.length > 0) {
                        targetId = fileFunctions[0].id
                        targetEntity = { 
                            name: `File: ${target}`,
                            file: fileFunctions[0].fn.file,
                            functions: fileFunctions.map(f => f.id)
                        }
                        targetType = 'function'
                    }
                }

                if (!targetId || !targetEntity) {
                    spinner.fail('Target not found')
                    console.log(chalk.yellow(`\nNo function/class/generic found matching "${target}"`))
                    return
                }

                // BFS upstream: who CALLS this function? (calledBy = who depends on it)
                // Traversing fn.calls would show what this function depends on — wrong direction.
                const maxUpstreamDepth = 10
                const impacted = new Map<string, number>() // id -> depth
                const visited = new Set<string>()

                const startIds = targetEntity.functions
                    ? targetEntity.functions
                    : [targetId]

                const toVisit: { id: string; depth: number }[] = startIds.map((id: string) => ({ id, depth: 0 }))
                let head = 0

                while (head < toVisit.length) {
                    const { id, depth } = toVisit[head++]!
                    if (visited.has(id) || depth > maxUpstreamDepth) continue
                    visited.add(id)

                    const fn = lock.functions?.[id]
                    // calledBy = who calls this function = upstream dependents
                    if (fn?.calledBy) {
                        for (const callerId of fn.calledBy) {
                            if (!visited.has(callerId)) {
                                impacted.set(callerId, depth + 1)
                                toVisit.push({ id: callerId, depth: depth + 1 })
                            }
                        }
                    }
                }

                // Format impacted results
                const impactedFns = [...impacted.entries()].map(([id, depth]) => {
                    const fn = lock.functions?.[id]
                    if (!fn) return null
                    const parts = id.split(':')
                    return { ...fn, depth, type: 'function' }
                }).filter(Boolean)

                // Also find impacted classes (functions that call methods on classes)
                // For now, show class callers if target is a class
                const impactedClasses: any[] = []
                if (targetType === 'class' && lock.functions) {
                    for (const [fnId, fn] of Object.entries(lock.functions)) {
                        if (fn.calls?.some((c: string) => c.startsWith('class:'))) {
                            impactedClasses.push({ ...fn, type: 'function' })
                        }
                    }
                }

                spinner.succeed(`Found ${impactedFns.length} impacted functions`)

                // Display results
                console.log(chalk.bold(`\n💥 Impact Analysis: ${target}`))
                console.log(chalk.dim(`   Type: ${targetType}, File: ${targetEntity.file?.split('/').pop()}\n`))

                const directCalls = targetEntity.calls?.length || 0
                const totalImpact = impactedFns.length
                console.log(`  ${chalk.cyan('Metrics:')}`)
                console.log(`    ${chalk.dim('Direct calls:')}     ${directCalls}`)
                console.log(`    ${chalk.dim('Total impacted:')}  ${totalImpact}`)

                if (options.files) {
                    const uniqueFiles = [...new Set(impactedFns.map(f => f.file))]
                    console.log(`\n  ${chalk.cyan('Affected Files:')}`)
                    const maxShow = Math.min(uniqueFiles.length, parseInt(options.maxImpact) || 50)
                    for (const file of uniqueFiles.slice(0, maxShow)) {
                        console.log(`    ${chalk.yellow('▸')} ${file.split('/').pop()}`)
                    }
                    if (uniqueFiles.length > maxShow) {
                        console.log(chalk.dim(`    ... and ${uniqueFiles.length - maxShow} more`))
                    }
                } else {
                    console.log(`\n  ${chalk.cyan('Impacted Functions:')}`)
                    const maxShow = Math.min(impactedFns.length, parseInt(options.maxImpact) || 50)
                    for (const fn of impactedFns.slice(0, maxShow)) {
                        const depthIndicator = fn.depth <= 2 ? chalk.green('●') : fn.depth <= 5 ? chalk.yellow('○') : chalk.red('○')
                        console.log(`    ${chalk.yellow('→')} ${fn.name} ${chalk.dim(`(${fn.file?.split('/').pop()})`)} ${depthIndicator} depth ${fn.depth}`)
                    }
                    if (impactedFns.length > maxShow) {
                        console.log(chalk.dim(`    ... and ${impactedFns.length - maxShow} more`))
                    }
                }

                if (options.json) {
                    console.log(JSON.stringify({
                        target,
                        targetType,
                        targetFile: targetEntity.file,
                        directCalls,
                        impacted: impactedFns.map(f => ({ name: f.name, file: f.file, depth: f.depth }))
                    }, null, 2))
                }

            } catch (err: unknown) {
                const message = err instanceof Error ? err.message : String(err)
                console.error(chalk.red(message))
                process.exit(1)
            }
        })

    // ── mikk context for "task" ──────────────────────────────────────────
    context
        .command('for <task> [path]')
        .description('Get AI context payload for a specific development task')
        .option('--provider <name>', 'Output provider: claude | generic | compact', 'claude')
        .option('--hops <n>', 'Graph traversal depth (default 4)', '4')
        .option('--tokens <n>', 'Token budget for functions (default 6000)', '6000')
        .option('--strict', 'High-precision mode: include only tightly relevant context')
        .option('--must <terms>', 'Comma-separated required terms, e.g. resolver,import,ts')
        .option('--all-keywords', 'In strict mode, require every extracted keyword to match')
        .option('--min-keywords <n>', 'In strict mode, minimum keyword matches per function (default 1)', '1')
        .option('--exact-only', 'Hard gate: only keep strict keyword matches in output')
        .option('--fail-fast', 'Return empty context when strict filters find no exact match')
        .option('--no-auto-fallback', 'Disable automatic fallback to balanced mode when strict mode returns no matches')
        .option('--file <path>', 'Anchor traversal from a specific file')
        .option('--module <id>', 'Anchor traversal from a specific module')
        .option('--no-callgraph', 'Omit call/calledBy edges')
        .option('--out <file>', 'Write context to a file instead of stdout')
        .option('--meta', 'Print meta diagnostics')
        .action(async (task: string, projectPath: string, options: any) => {
            const projectRoot = projectPath || process.cwd()

            try {
                const { contract, lock } = await loadContractAndLock(projectRoot)

                const query: ContextQuery = {
                    task,
                    focusFiles: options.file ? [options.file] : undefined,
                    focusModules: options.module ? [options.module] : undefined,
                    maxHops: parseIntOption(options.hops, 'hops', 4),
                    tokenBudget: parseIntOption(options.tokens, 'tokens', 6000),
                    includeCallGraph: options.callgraph !== false,
                    includeBodies: true,
                    relevanceMode: options.strict ? 'strict' : 'balanced',
                    requiredKeywords: parseCsvOption(options.must),
                    requireAllKeywords: options.allKeywords === true,
                    minKeywordMatches: parseIntOption(options.minKeywords, 'min-keywords', 1),
                    exactOnly: options.exactOnly === true,
                    failFast: options.failFast === true,
                    projectRoot,
                }

                const builder = new ContextBuilder(contract, lock)
                const { ctx, fallbackUsed } = buildContextWithOptionalFallback(builder, query, options.autoFallback !== false)

                if (options.meta) {
                    printMeta(ctx.meta, task)
                }

                const provider = getProvider(options.provider)
                const output = provider.formatContext(ctx)
                const finalOutput = fallbackUsed
                    ? `${chalk.yellow('Note: strict mode had no exact matches; showing balanced fallback context.')}\n\n${output}`
                    : output

                if (options.out) {
                    await fs.writeFile(options.out, finalOutput, 'utf-8')
                    console.log(chalk.green(`Context written to ${options.out}`))
                    console.log(chalk.dim(`  ${ctx.meta.selectedFunctions} functions, ~${ctx.meta.estimatedTokens} tokens`))
                } else {
                    console.log(finalOutput)
                }

            } catch (err: unknown) {
                const message = err instanceof Error ? err.message : String(err)
                console.error(chalk.red(message))
                process.exit(1)
            }
        })

    // ── mikk context list ────────────────────────────────────────────────
    context
        .command('list [path]')
        .description('List all modules and their function counts')
        .action(async (projectPath: string, _options: any) => {
            const projectRoot = projectPath || process.cwd()
            try {
                const { contract, lock } = await loadContractAndLock(projectRoot)

                // Build file→module index from lock.modules (authoritative).
                // Do NOT use fn.moduleId or lock.files[k].moduleId — both are unreliable.
                const modFileSets = new Map<string, Set<string>>()
                for (const [modId, mod] of Object.entries(lock.modules ?? {})) {
                    modFileSets.set(modId, new Set((mod as any).files ?? []))
                }

                const fns = Object.values(lock.functions)
                console.log(chalk.bold('\n📦 Modules in this project:\n'))
                for (const mod of contract.declared.modules) {
                    const modFileSet = modFileSets.get(mod.id) ?? new Set<string>()
                    const fnCount = fns.filter(f => f.file && modFileSet.has(f.file)).length
                    const fileCount = modFileSet.size
                    console.log(
                        `  ${chalk.cyan(mod.id.padEnd(20))} ` +
                        `${chalk.bold(mod.name.padEnd(25))} ` +
                        `${chalk.dim(`${fnCount} fns, ${fileCount} files`)} `
                    )
                    if (mod.description) {
                        console.log(`    ${chalk.dim(mod.description)} `)
                    }
                }

                const totalFns = fns.length
                const totalFiles = Object.keys(lock.files).length
                console.log(chalk.dim(`\n  Total: ${totalFns} functions across ${totalFiles} files`))

            } catch (err: unknown) {
                const message = err instanceof Error ? err.message : String(err)
                console.error(chalk.red(message))
                process.exit(1)
            }
        })
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function loadContractAndLock(projectRoot: string) {
    const contractReader = new ContractReader()
    const lockReader = new LockReader()
    const contract = await contractReader.read(path.join(projectRoot, 'mikk.json'))
    const lock = await lockReader.read(path.join(projectRoot, 'mikk.lock.json'))
    return { contract, lock }
}

function printMeta(
    meta: {
        seedCount: number
        totalFunctionsConsidered: number
        selectedFunctions: number
        estimatedTokens: number
        keywords: string[]
        reasons?: string[]
        suggestions?: string[]
    },
    task: string
) {
    console.error(chalk.bold('\n-- Context Meta --------------------------'))
    console.error(`  Task:           ${task} `)
    console.error(`  Keywords:       ${meta.keywords.join(', ') || '(none extracted)'} `)
    console.error(`  Seeds found:    ${meta.seedCount} functions matched task`)
    console.error(`  Scope:          ${meta.selectedFunctions} / ${meta.totalFunctionsConsidered} functions included`)
    console.error(`  Est. tokens:    ~${meta.estimatedTokens}`)
    if (meta.reasons && meta.reasons.length > 0) {
        console.error(`  Why:            ${meta.reasons.join(' | ')}`)
    }
    if (meta.suggestions && meta.suggestions.length > 0) {
        console.error(`  Suggestions:    ${meta.suggestions.join(' | ')}`)
    }
    console.error('------------------------------------------\n')
}

function parseCsvOption(value?: string | string[]): string[] | undefined {
    if (!value) return undefined
    const raw = Array.isArray(value) ? value.join(',') : value
    const items = raw
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)
    return items.length > 0 ? items : undefined
}

function buildContextWithOptionalFallback(
    builder: ContextBuilder,
    query: ContextQuery,
    autoFallback: boolean
): { ctx: ReturnType<ContextBuilder['build']>, fallbackUsed: boolean } {
    const initial = builder.build(query)
    if (!autoFallback || query.relevanceMode !== 'strict' || initial.modules.length > 0) {
        return { ctx: initial, fallbackUsed: false }
    }

    const relaxed: ContextQuery = {
        ...query,
        relevanceMode: 'balanced',
        requiredKeywords: undefined,
        requireAllKeywords: false,
        minKeywordMatches: 1,
        exactOnly: false,
        failFast: false,
    }
    const fallback = builder.build(relaxed)
    if (fallback.modules.length === 0) {
        return { ctx: initial, fallbackUsed: false }
    }

    fallback.meta.reasons = [
        ...(fallback.meta.reasons ?? []),
        'strict query had no exact matches; returned balanced fallback context',
    ]
    return { ctx: fallback, fallbackUsed: true }
}
