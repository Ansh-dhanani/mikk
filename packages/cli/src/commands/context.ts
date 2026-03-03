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
function parseIntOption(value: string, name: string, fallback: number): number {
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
        .description('AI context commands')

    // ── mikk context query "..." ─────────────────────────────────────────
    context
        .command('query <question>')
        .description('Ask an architecture question — returns graph-traced context')
        .option('--provider <name>', 'Output provider: claude | generic | compact', 'claude')
        .option('--hops <n>', 'Graph traversal depth (default 4)', '4')
        .option('--tokens <n>', 'Token budget for functions (default 6000)', '6000')
        .option('--no-callgraph', 'Omit call/calledBy edges from output')
        .option('--out <file>', 'Write context to a file instead of stdout')
        .option('--meta', 'Print meta diagnostics (seed count, tokens used, keywords)')
        .action(async (question: string, options) => {
            const projectRoot = process.cwd()

            try {
                const { contract, lock } = await loadContractAndLock(projectRoot)

                const query: ContextQuery = {
                    task: question,
                    maxHops: parseIntOption(options.hops, 'hops', 4),
                    tokenBudget: parseIntOption(options.tokens, 'tokens', 6000),
                    includeCallGraph: options.callgraph !== false,
                }

                const builder = new ContextBuilder(contract, lock)
                const ctx = builder.build(query)

                if (options.meta) {
                    printMeta(ctx.meta, question)
                }

                const provider = getProvider(options.provider)
                const output = provider.formatContext(ctx)

                if (options.out) {
                    await fs.writeFile(options.out, output, 'utf-8')
                    console.log(chalk.green(`✓ Context written to ${options.out}`))
                } else {
                    console.log(output)
                }

            } catch (err: any) {
                console.error(chalk.red(err.message))
                process.exit(1)
            }
        })

    // ── mikk context impact <file> ───────────────────────────────────────
    context
        .command('impact <file>')
        .description('What breaks if this file changes?')
        .option('--provider <name>', 'Output provider: claude | generic | compact', 'claude')
        .option('--tokens <n>', 'Token budget (default 8000)', '8000')
        .action(async (file: string, options) => {
            const projectRoot = process.cwd()

            try {
                // Load contract first — fail early if not initialized
                const { contract, lock } = await loadContractAndLock(projectRoot)

                const spinner = ora('Building dependency graph for impact analysis...').start()
                const files = await discoverFiles(projectRoot)
                const parsedFiles = await parseFiles(
                    files, projectRoot, (fp) => readFileContent(fp)
                )
                const graph = new GraphBuilder().build(parsedFiles)
                spinner.succeed('Graph built')

                const analyzer = new ImpactAnalyzer(graph)

                // Find nodes in the specified file — prefer exact match, fall back to substring
                const normalizedFile = file.replace(/\\/g, '/')
                let fileNodes = [...graph.nodes.values()].filter(n => n.file === normalizedFile)
                if (fileNodes.length === 0) {
                    // Fallback: substring match on basename to avoid false positives
                    const basename = normalizedFile.split('/').pop() || normalizedFile
                    fileNodes = [...graph.nodes.values()].filter(n => {
                        const nodeName = n.file.split('/').pop() || n.file
                        return nodeName === basename
                    })
                }
                if (fileNodes.length === 0) {
                    console.log(chalk.yellow(`No nodes found matching "${file}"`))
                    console.log(chalk.dim('  Tip: use the relative path from project root, e.g. src/lib/auth.ts'))
                    return
                }

                const result = analyzer.analyze(fileNodes.map(n => n.id))

                // Print impact summary
                console.log(chalk.bold(`\n💥 Impact Analysis: ${file}\n`))
                console.log(`  ${chalk.dim('Changed nodes:')}  ${result.changed.length}`)
                console.log(`  ${chalk.dim('Impacted nodes:')} ${result.impacted.length}`)
                console.log(`  ${chalk.dim('Depth:')}          ${result.depth}`)
                console.log(`  ${chalk.dim('Confidence:')}     ${result.confidence}`)

                if (result.impacted.length > 0) {
                    console.log(`\n  ${chalk.bold('Impacted functions:')}`)
                    for (const id of result.impacted.slice(0, 25)) {
                        const node = graph.nodes.get(id)
                        console.log(`    ${chalk.yellow('→')} ${node?.label ?? id} ${chalk.dim(`(${node?.file ?? ''})`)}`)
                    }
                    if (result.impacted.length > 25) {
                        console.log(chalk.dim(`    ... and ${result.impacted.length - 25} more`))
                    }
                }

                // Also build AI context focused on the impacted set
                const query: ContextQuery = {
                    task: `Understanding the impact of changes in ${file}`,
                    focusFiles: [file],
                    tokenBudget: parseIntOption(options.tokens, 'tokens', 8000),
                    maxHops: 3,
                }
                const builder = new ContextBuilder(contract, lock)
                const ctx = builder.build(query)
                const provider = getProvider(options.provider)

                console.log('\n' + chalk.bold('=== AI Context for impacted area ==='))
                console.log(provider.formatContext(ctx))

            } catch (err: any) {
                console.error(chalk.red(err.message))
                process.exit(1)
            }
        })

    // ── mikk context for "task" ──────────────────────────────────────────
    context
        .command('for <task>')
        .description('Get AI context payload for a specific development task')
        .option('--provider <name>', 'Output provider: claude | generic | compact', 'claude')
        .option('--hops <n>', 'Graph traversal depth (default 4)', '4')
        .option('--tokens <n>', 'Token budget for functions (default 6000)', '6000')
        .option('--file <path>', 'Anchor traversal from a specific file')
        .option('--module <id>', 'Anchor traversal from a specific module')
        .option('--no-callgraph', 'Omit call/calledBy edges')
        .option('--out <file>', 'Write context to a file instead of stdout')
        .option('--meta', 'Print meta diagnostics')
        .action(async (task: string, options) => {
            const projectRoot = process.cwd()

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
                    projectRoot,
                }

                const builder = new ContextBuilder(contract, lock)
                const ctx = builder.build(query)

                if (options.meta) {
                    printMeta(ctx.meta, task)
                }

                const provider = getProvider(options.provider)
                const output = provider.formatContext(ctx)

                if (options.out) {
                    await fs.writeFile(options.out, output, 'utf-8')
                    console.log(chalk.green(`✓ Context written to ${options.out}`))
                    console.log(chalk.dim(`  ${ctx.meta.selectedFunctions} functions, ~${ctx.meta.estimatedTokens} tokens`))
                } else {
                    console.log(output)
                }

            } catch (err: any) {
                console.error(chalk.red(err.message))
                process.exit(1)
            }
        })

    // ── mikk context list ────────────────────────────────────────────────
    context
        .command('list')
        .description('List all modules and their function counts')
        .action(async () => {
            const projectRoot = process.cwd()
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

            } catch (err: any) {
                console.error(chalk.red(err.message))
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
    },
    task: string
) {
    console.error(chalk.bold('\n── Context Meta ──────────────────────────'))
    console.error(`  Task:           ${task} `)
    console.error(`  Keywords:       ${meta.keywords.join(', ') || '(none extracted)'} `)
    console.error(`  Seeds found:    ${meta.seedCount} functions matched task`)
    console.error(`  Scope:          ${meta.selectedFunctions} / ${meta.totalFunctionsConsidered} functions included`)
    console.error(`  Est. tokens:    ~${meta.estimatedTokens}`)
    console.error('──────────────────────────────────────────\n')
}