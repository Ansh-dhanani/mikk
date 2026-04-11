import * as path from 'node:path'
import * as fs from 'node:fs/promises'
import type { Command } from 'commander'
import chalk from 'chalk'
import ora from 'ora'
import {
    ContractReader, LockReader, ImpactAnalyzer,
    GraphBuilder, parseFiles, readFileContent, discoverFiles,
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
        .description('Query codebase using natural language for AI context generation')

    // ── mikk context query "..." ─────────────────────────────────────────
    context
        .command('query <question> [path]')
        .description('Ask an architecture question — returns graph-traced context')
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

                const spinner = ora('Building dependency graph for impact analysis...').start()
                const files = await discoverFiles(projectRoot)
                const parsedFiles = await parseFiles(
                    files, projectRoot, (fp) => readFileContent(fp)
                )
                const graph = new GraphBuilder().build(parsedFiles)
                spinner.succeed('Graph built')

                const analyzer = new ImpactAnalyzer(graph)

                // Find the target (file, function, or module)
                const normalizedTarget = target.replace(/\\/g, '/')
                let targetNodes = [...graph.nodes.values()].filter(n => 
                    n.file === normalizedTarget || 
                    n.id === normalizedTarget ||
                    n.name === target ||
                    (n.file.includes(normalizedTarget) || n.file.split('/').pop() === target)
                )

                if (targetNodes.length === 0) {
                    // Try matching by function name
                    targetNodes = [...graph.nodes.values()].filter(n => 
                        n.name?.toLowerCase().includes(target.toLowerCase())
                    )
                }

                if (targetNodes.length === 0) {
                    console.log(chalk.yellow(`\nNo nodes found matching "${target}"`))
                    console.log(chalk.dim('  Tip: use relative path, function name, or module id'))
                    return
                }

                // Get the primary target node
                const primaryNode = targetNodes[0]
                const changedNodeId = primaryNode.id
                const result = analyzer.analyze([changedNodeId])

                // Output format based on flags
                if (options.json) {
                    console.log(JSON.stringify({
                        target: target,
                        targetType: primaryNode.type,
                        targetFile: primaryNode.file,
                        changed: result.changed,
                        impacted: result.impacted,
                        depth: result.depth,
                        confidence: result.confidence,
                        riskScore: result.riskScore,
                        modules: [...new Set(result.impacted.map(id => graph.nodes.get(id)?.moduleId).filter(Boolean))],
                        entryPoints: result.entryPoints,
                        critical: result.classified?.critical?.length || 0,
                        high: result.classified?.high?.length || 0,
                        medium: result.classified?.medium?.length || 0,
                        low: result.classified?.low?.length || 0
                    }, null, 2))
                    return
                }

                // Display impact summary
                const maxShow = Math.min(result.impacted.length, parseInt(options.maxImpact) || 50)
                
                console.log(chalk.bold(`\n💥 Impact Analysis: ${target}`))
                console.log(chalk.dim(`   Type: ${primaryNode.type} | File: ${primaryNode.file}\n`))
                
                // Key metrics
                console.log(`  ${chalk.cyan('Metrics:')}`)
                console.log(`    ${chalk.dim('Changed:')}     ${result.changed.length} node(s)`)
                console.log(`    ${chalk.dim('Impacted:')}   ${result.impacted.length} node(s)`)
                console.log(`    ${chalk.dim('Depth:')}     ${result.depth} level(s)`)
                console.log(`    ${chalk.dim('Confidence:')} ${(result.confidence * 100).toFixed(0)}%`)
                if (result.riskScore !== undefined) {
                    console.log(`    ${chalk.dim('Risk:')}      ${result.riskScore.toFixed(2)}`)
                }

                // Show modules if requested
                if (options.modules) {
                    const affectedModules = [...new Set(
                        result.impacted
                            .map(id => graph.nodes.get(id)?.moduleId)
                            .filter(Boolean)
                    )]
                    console.log(`\n  ${chalk.cyan('Affected Modules:')}`)
                    for (const mod of affectedModules.slice(0, 20)) {
                        const count = result.impacted.filter(id => graph.nodes.get(id)?.moduleId === mod).length
                        console.log(`    ${chalk.yellow('▸')} ${mod} (${count} impacts)`)
                    }
                    if (affectedModules.length > 20) {
                        console.log(chalk.dim(`    ... and ${affectedModules.length - 20} more`))
                    }
                }

                // Show files only
                if (options.files) {
                    const affectedFiles = [...new Set(
                        result.impacted
                            .map(id => graph.nodes.get(id)?.file)
                            .filter(Boolean)
                    )]
                    console.log(`\n  ${chalk.cyan('Affected Files:')}`)
                    for (const file of affectedFiles.slice(0, maxShow)) {
                        const displayFile = file.length > 60 ? '...' + file.slice(-57) : file
                        console.log(`    ${chalk.yellow('▸')} ${displayFile}`)
                    }
                    if (affectedFiles.length > maxShow) {
                        console.log(chalk.dim(`    ... and ${affectedFiles.length - maxShow} more`))
                    }
                }
                // Show functions only
                else if (options.functions) {
                    console.log(`\n  ${chalk.cyan('Affected Functions:')}`)
                    for (const id of result.impacted.slice(0, maxShow)) {
                        const node = graph.nodes.get(id)
                        if (node?.type === 'function') {
                            console.log(`    ${chalk.yellow('→')} ${node.name} ${chalk.dim(`(${node.file.split('/').pop()})`)}`)
                        }
                    }
                    if (result.impacted.length > maxShow) {
                        console.log(chalk.dim(`    ... and ${result.impacted.length - maxShow} more`))
                    }
                }
                // Default: show all impacted items with details
                else {
                    console.log(`\n  ${chalk.cyan('Impacted Items:')}`)
                    for (const id of result.impacted.slice(0, maxShow)) {
                        const node = graph.nodes.get(id)
                        const typeTag = node?.type === 'function' ? 'fn' : 
                                       node?.type === 'class' ? 'class' : 'file'
                        const depthInfo = options.depth ? ` [d${result.allImpacted?.find(i => i.nodeId === id)?.depth || 0}]` : ''
                        const riskInfo = options.risk && result.allImpacted ? 
                            ` ${chalk.yellow(result.allImpacted.find(i => i.nodeId === id)?.risk || '')}` : ''
                        console.log(`    ${chalk.yellow('→')} ${node?.name || id} ${chalk.dim(`<${typeTag}>`)}${depthInfo}${riskInfo}`)
                    }
                    if (result.impacted.length > maxShow) {
                        console.log(chalk.dim(`    ... and ${result.impacted.length - maxShow} more`))
                    }
                }

                // Show risk breakdown if requested
                if (options.risk && result.classified) {
                    console.log(`\n  ${chalk.cyan('Risk Breakdown:')}`)
                    if (result.classified.critical?.length) {
                        console.log(`    ${chalk.red('●')} CRITICAL: ${result.classified.critical.length}`)
                    }
                    if (result.classified.high?.length) {
                        console.log(`    ${chalk.yellow('●')} HIGH: ${result.classified.high.length}`)
                    }
                    if (result.classified.medium?.length) {
                        console.log(`    ${chalk.blue('●')} MEDIUM: ${result.classified.medium.length}`)
                    }
                    if (result.classified.low?.length) {
                        console.log(`    ${chalk.green('●')} LOW: ${result.classified.low.length}`)
                    }
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
        .action(async (projectPath: string, options: any) => {
            const projectRoot = projectPath || process.cwd()
            try {
                const { contract, lock } = await loadContractAndLock(projectRoot)

                console.log(chalk.bold('\n📦 Modules in this project:\n'))
                for (const mod of contract.declared.modules) {
                    const fnCount = Object.values(lock.functions).filter(f => f.moduleId === mod.id).length
                    const fileCount = Object.values(lock.files).filter(f => f.moduleId === mod.id).length
                    console.log(
                        `  ${chalk.cyan(mod.id.padEnd(20))} ` +
                        `${chalk.bold(mod.name.padEnd(25))} ` +
                        `${chalk.dim(`${fnCount} fns, ${fileCount} files`)} `
                    )
                    if (mod.description) {
                        console.log(`    ${chalk.dim(mod.description)} `)
                    }
                }

                const totalFns = Object.keys(lock.functions).length
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
