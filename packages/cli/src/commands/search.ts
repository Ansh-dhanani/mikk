import path from 'node:path'
import fs from 'node:fs'
import { Command } from 'commander'
import ora from 'ora'
import chalk from 'chalk'
import { LockReader, DirectSearchEngine, type MikkLockFunction } from '@getmikk/core'
import { SemanticSearcher } from '@getmikk/intent-engine'

const DEFAULT_MAX_BODY_LINES = 50

interface BodyMatch {
    lineNum: number
    line: string
    context: string[]
}

interface SearchResult {
    name: string
    file: string
    fn: MikkLockFunction
    score: number
    matches?: BodyMatch[]
}

async function getFunctionBody(fn: { file: string; startLine: number; endLine: number }, projectRoot: string, _maxLines: number): Promise<{ body: string; lines: string[]; originalLines: number }> {
    try {
        const fnFile = fn.file.replace(/\\/g, '/')
        const fullPath = path.isAbsolute(fnFile) ? fnFile : path.join(projectRoot, fnFile)
        const content = await fs.promises.readFile(fullPath, 'utf-8')
        const lines = content.split('\n')
        const start = Math.max(0, fn.startLine - 1)
        const end = Math.min(lines.length, fn.endLine)
        const bodyLines = lines.slice(start, end)
        return {
            body: bodyLines.join('\n'),
            lines: bodyLines,
            originalLines: bodyLines.length
        }
    } catch {
        return { body: '', lines: [], originalLines: 0 }
    }
}

function searchInBody(body: string, pattern: string, startLine: number): BodyMatch[] {
    const matches: BodyMatch[] = []
    const lines = body.split('\n')
    const searchPattern = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
    
    for (let i = 0; i < lines.length; i++) {
        if (searchPattern.test(lines[i])) {
            const contextStart = Math.max(0, i - 1)
            const contextEnd = Math.min(lines.length, i + 2)
            matches.push({
                lineNum: startLine + i,
                line: lines[i].trim(),
                context: lines.slice(contextStart, contextEnd).map(l => l.trim())
            })
        }
        searchPattern.lastIndex = 0
    }
    return matches
}

function fuzzyMatch(text: string, pattern: string): number {
    text = text.toLowerCase()
    pattern = pattern.toLowerCase()
    if (text.includes(pattern)) return 1.0
    if (text.split(/[-_]/).some(p => p.includes(pattern))) return 0.8
    
    let score = 0
    let pi = 0
    for (const c of text) {
        if (pi < pattern.length && c === pattern[pi]) {
            score++
            pi++
        }
    }
    return pi > 0 ? score / pattern.length * 0.6 : 0
}

function levenshtein(a: string, b: string): number {
    const m = a.length, n = b.length
    if (m === 0) return n
    if (n === 0) return m
    const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0))
    for (let i = 0; i <= m; i++) dp[i][0] = i
    for (let j = 0; j <= n; j++) dp[0][j] = j
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
        }
    }
    return dp[m][n]
}

function fuzzyScore(query: string, target: string): number {
    query = query.toLowerCase()
    target = target.toLowerCase()
    
    // Exact substring match (highest score)
    if (target.includes(query)) {
        return 0.9 + (query.length / target.length) * 0.1
    }
    
    // Word boundary matches
    const words = target.split(/[-_]/)
    for (const word of words) {
        if (word.startsWith(query)) return 0.85
        if (word.includes(query)) return 0.75
    }
    
    // CamelCase matching
    const camelWords = target.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().split(/\s+/)
    for (const word of camelWords) {
        if (word.startsWith(query)) return 0.8
    }
    
    // Levenshtein distance for typo tolerance
    const maxLen = Math.max(query.length, target.length)
    if (maxLen === 0) return 0
    const dist = levenshtein(query, target)
    const similarity = 1 - dist / maxLen
    
    // Only consider if similarity is reasonable
    if (similarity >= 0.4) {
        return similarity * 0.6
    }
    
    // Character overlap (handles "urse" -> "user")
    const queryChars = new Set(query)
    const targetChars = new Set(target)
    let overlap = 0
    for (const c of queryChars) {
        if (targetChars.has(c)) overlap++
    }
    const jaccard = overlap / (queryChars.size + targetChars.size - overlap)
    // All query chars must be in target (handles typos like "urse" -> "user")
    if (jaccard > 0.3 && [...query].every(c => targetChars.has(c))) {
        return 0.5 + jaccard * 0.3
    }
    
    return 0
}

function fuzzySearch(query: string, functions: MikkLockFunction[]): Array<{ fn: MikkLockFunction; score: number }> {
    const results: Array<{ fn: MikkLockFunction; score: number }> = []
    
    for (const fn of functions) {
        let maxScore = 0
        
        // Check function name
        maxScore = Math.max(maxScore, fuzzyScore(query, fn.name))
        
        // Check purpose/docComment
        if (fn.purpose) {
            maxScore = Math.max(maxScore, fuzzyScore(query, fn.purpose) * 0.7)
        }
        
        // Check keywords
        if (fn.keywords) {
            for (const kw of fn.keywords) {
                maxScore = Math.max(maxScore, fuzzyScore(query, kw) * 0.6)
            }
        }
        
        // Check params
        if (fn.params) {
            for (const p of fn.params) {
                maxScore = Math.max(maxScore, fuzzyScore(query, p.name) * 0.5)
                maxScore = Math.max(maxScore, fuzzyScore(query, p.type) * 0.4)
            }
        }
        
        // Check return type
        if (fn.returnType) {
            maxScore = Math.max(maxScore, fuzzyScore(query, fn.returnType) * 0.4)
        }
        
        if (maxScore > 0.3) {
            results.push({ fn, score: maxScore })
        }
    }
    
    return results.sort((a, b) => b.score - a.score)
}

function generateSuggestions(query: string, functions: any[]): string[] {
    const suggestions: { fn: any; score: number }[] = []
    for (const fn of functions.slice(0, 50)) {
        const score = Math.max(
            fuzzyMatch(fn.name, query),
            1 - levenshtein(fn.name.toLowerCase(), query.toLowerCase()) / Math.max(fn.name.length, query.length) * 0.5
        )
        if (score > 0.3) suggestions.push({ fn, score })
    }
    return suggestions
        .sort((a, b) => b.score - a.score)
        .slice(0, 5)
        .map(s => s.fn.name)
}

function formatFilePath(file: string, projectRoot: string): string {
    const normalized = file.replace(/\\/g, '/').replace(/\/$/, '')
    if (normalized.includes(projectRoot.replace(/\\/g, '/'))) {
        return './' + normalized.replace(projectRoot.replace(/\\/g, '/').replace(/\/$/, ''), '').replace(/^\//, '')
    }
    return normalized.split('/').slice(-2).join('/')
}

export function registerSearchCommand(program: Command) {
  program
    .command('search [query...]', { isDefault: false })
    .alias('s')
    .description('Powerful search with filters, body search, and suggestions')
    .option('-p, --path <path>', 'Project path')
    
    // Output options
    .option('-l, --limit <n>', 'Max results', '10')
    .option('--top <n>', 'Show top N with bodies (implies --rich)')
    .option('--rich', 'Rich output with signatures')
    .option('--minimal', 'Minimal output (names only)')
    .option('--json', 'Output as JSON')
    
    // Body search
    .option('-b, --body', 'Include function bodies in output')
    .option('--search-body', 'Also search inside function bodies (slow for large codebases)')
    .option('--in <names>', 'Search IN function bodies (comma-separated)')
    .option('--in-any', 'Match in ANY of the --in functions')
    .option('--in-all', 'Match in ALL of the --in functions (default)')
    .option('--max-lines <n>', 'Max lines per body', '50')
    
    // Filters
    .option('--module <id>', 'Filter by module (repeatable)', (v, arr) => [...arr, v], [])
    .option('--file <pattern>', 'Filter by file pattern (repeatable)', (v, arr) => [...arr, v], [])
    .option('--exported', 'Only exported functions')
    .option('--internal', 'Only internal functions')
    .option('--async', 'Only async functions')
    .option('--returns <type>', 'Return type contains')
    .option('--param <name>', 'Has parameter (repeatable)', (v, arr) => [...arr, v], [])
    .option('--calls <fn>', 'Calls function (repeatable)', (v, arr) => [...arr, v], [])
    .option('--called-by <fn>', 'Called by function (repeatable)', (v, arr) => [...arr, v], [])
    
    // Search modes
    .option('-m, --mode <mode>', 'Search mode: exact, direct, semantic, hybrid', 'hybrid')
    .option('--sort <field>', 'Sort by: score, name, calls, length', 'score')
    
    // Info
    .option('--list-modules', 'List modules with counts')
    .option('--list-files', 'List files with counts')
    
    .addHelpText('after', `
${chalk.bold('Examples:')}
  ${chalk.cyan('mikk s auth')}                    Simple search (shortcut)
  ${chalk.cyan('mikk s "get user" --top 5')}       Top 5 with bodies
  ${chalk.cyan('mikk s "TODO" --in login')}       Search body of login function
  ${chalk.cyan('mikk s "error" --in auth,utils')} Search in multiple functions
  ${chalk.cyan('mikk s "fetch" --module api --exported')}  Filtered search
  ${chalk.cyan('mikk s "validate" --returns boolean')}     By return type
  ${chalk.cyan('mikk s "handle" --calls db --async')}     Combined filters
  ${chalk.cyan('mikk s --list-modules')}           List all modules

${chalk.bold('Filters (AND logic):')}
  --module <id>   Module ID
  --file <pat>    File pattern (substring match)
  --exported      Only exported functions
  --internal      Only internal functions  
  --async         Only async functions
  --returns <t>   Return type contains
  --param <name>  Has parameter
  --calls <fn>    Calls function
  --called-by <fn> Called by function

${chalk.bold('Body Search:')}
  --in <fns>      Function names (comma-separated)
  --in-any        Match in ANY function (default: ALL)

${chalk.bold('Output Modes:')}
  --rich          Detailed output with signatures
  --minimal       Just function names
  --json          JSON output
  --top <n>       Top N with full bodies

${chalk.bold('Modes:')}
  exact    - O(1) exact name match
  direct   - BM25 keyword search
  semantic - Embedding similarity (requires provider)
  hybrid   - Combines all (default)

${chalk.bold('Semantic Search Providers:')}
  Semantic search requires an embedding provider. If none is available,
  you'll be prompted to choose:
  - Google Gemini API (set GEMINI_API_KEY env var, or enter when prompted)
  - Local Xenova/Transformers (run: npm install @xenova/transformers)
  - Vocabulary-based fallback (fast but less accurate)
`)

    .action(async (queryParts, options) => {
      const query = queryParts?.join(' ') || ''
      const projectRoot = options.path || process.cwd()
      const limit = parseInt(options.limit) || 10
      const topN = options.top ? parseInt(options.top) : 0
      const includeBody = options.body === true || topN > 0
      const rich = options.rich === true || topN > 0
      const minimal = options.minimal === true
      const asJson = options.json === true
      const maxLines = options.maxLines ? parseInt(options.maxLines) : DEFAULT_MAX_BODY_LINES
      const mode = options.mode?.toLowerCase() || 'hybrid'
      const sortField = options.sort || 'score'
      
      const moduleFilters = Array.isArray(options.module) ? options.module : options.module ? [options.module] : []
      const fileFilters = Array.isArray(options.file) ? options.file : options.file ? [options.file] : []
      const paramFilters = Array.isArray(options.param) ? options.param : options.param ? [options.param] : []
      const callsFilters = Array.isArray(options.calls) ? options.calls : options.calls ? [options.calls] : []
      const calledByFilters = Array.isArray(options.calledBy) ? options.calledBy : options.calledBy ? [options.calledBy] : []
      
      const inFunctions = options.in ? options.in.split(',').map((s: string) => s.trim()) : []

      try {
        const lockPath = path.join(projectRoot, 'mikk.lock.json')
        if (!fs.existsSync(lockPath)) {
            console.error(chalk.red(`\nCould not find mikk.lock.json at ${lockPath}`))
            console.log(chalk.dim('Please run "mikk analyze" first to index your codebase.'))
            process.exit(1)
        }

        const lock = await new LockReader().read(lockPath)
        const lockFunctions = lock.functions
        const lockClasses = lock.classes || {}
        const lockGenerics = lock.generics || {}
        
        // Combine all searchable items: functions, classes, generics
        const allFunctions = Object.values(lockFunctions)
        const allClasses = Object.values(lockClasses)
        const allGenerics = Object.values(lockGenerics)
        
        // For unified search, map everything to a common format
        const allItems = [
            ...allFunctions.map(f => ({ ...f, itemType: 'function' })),
            ...allClasses.map(c => ({ ...c, itemType: 'class', name: c.name, purpose: c.purpose || '' })),
            ...allGenerics.map(g => ({ ...g, itemType: 'generic', name: g.name, purpose: g.purpose || '' }))
        ]

        // List modules
        if (options.listModules) {
            const modules = Object.values(lock.modules || {})
            const moduleStats = modules.map(mod => {
                const fns = allFunctions.filter(f => f.moduleId === mod.id)
                const types = allGenerics.filter(g => g.moduleId === mod.id)
                const classes = allClasses.filter(c => c.moduleId === mod.id)
                return { id: mod.id, files: mod.files?.length || 0, functions: fns.length, types: types.length, classes: classes.length }
            }).sort((a, b) => b.functions - a.functions)

            if (asJson) {
                console.log(JSON.stringify(moduleStats, null, 2))
            } else {
                console.log(chalk.green(`\n📦 Modules (${modules.length}):\n`))
                console.log(`${'Module'.padEnd(45)} ${'Fns'.padStart(5)} ${'Types'.padStart(6)} ${'Classes'.padStart(8)} ${'Files'.padStart(6)}`)
                console.log(chalk.dim('─'.repeat(75)))
                for (const m of moduleStats) {
                    const name = m.id.length > 43 ? m.id.slice(0, 40) + '...' : m.id
                    console.log(`${name.padEnd(45)} ${String(m.functions).padStart(5)} ${String(m.types).padStart(6)} ${String(m.classes).padStart(8)} ${String(m.files).padStart(6)}`)
                }
            }
            return
        }

        // List files
        if (options.listFiles) {
            const fileStats: Record<string, { fns: number; types: number; classes: number }> = {}
            for (const fn of allFunctions) {
                if (!fileStats[fn.file]) fileStats[fn.file] = { fns: 0, types: 0, classes: 0 }
                fileStats[fn.file].fns++
            }
            for (const t of Object.values(lock.generics || {})) {
                if (!fileStats[t.file]) fileStats[t.file] = { fns: 0, types: 0, classes: 0 }
                fileStats[t.file].types++
            }
            for (const c of Object.values(lock.classes || {})) {
                if (!fileStats[c.file]) fileStats[c.file] = { fns: 0, types: 0, classes: 0 }
                fileStats[c.file].classes++
            }
            const files = Object.entries(fileStats)
                .map(([f, s]) => ({ file: f, ...s }))
                .sort((a, b) => b.fns - a.fns)

            if (asJson) {
                console.log(JSON.stringify(files, null, 2))
            } else {
                console.log(chalk.green(`\n📄 Files (${files.length}):\n`))
                console.log(`${'File'.padEnd(55)} ${'Fns'.padStart(5)} ${'Types'.padStart(6)} ${'Classes'.padStart(8)}`)
                console.log(chalk.dim('─'.repeat(75)))
                for (const f of files) {
                    const name = formatFilePath(f.file, projectRoot)
                    const display = name.length > 53 ? '...' + name.slice(-50) : name
                    console.log(`${display.padEnd(55)} ${String(f.fns).padStart(5)} ${String(f.types).padStart(6)} ${String(f.classes).padStart(8)}`)
                }
            }
            return
        }

        // Build filtered list - search across all items (functions, classes, generics)
        let filtered = allItems

        for (const modId of moduleFilters) {
            filtered = filtered.filter(f => f.moduleId.includes(modId) || modId.includes(f.moduleId))
        }

        for (const pattern of fileFilters) {
            filtered = filtered.filter(f => f.file.replace(/\\/g, '/').includes(pattern))
        }

        if (options.exported) {
            filtered = filtered.filter(f => f.isExported)
        }

        if (options.internal) {
            filtered = filtered.filter(f => !f.isExported)
        }

        if (options.async) {
            filtered = filtered.filter(f => f.isAsync)
        }

        if (options.returns) {
            filtered = filtered.filter(f => f.returnType?.toLowerCase().includes(options.returns.toLowerCase()))
        }

        // Search inside function bodies (new feature)
        const searchInBodies = options.searchBody === true
        if (searchInBodies && query) {
            const bodySearchResults: typeof filtered = []
            const spinner = ora('Searching function bodies...').start()
            
            // Process in batches to show progress
            const batchSize = 50
            for (let i = 0; i < filtered.length; i += batchSize) {
                const batch = filtered.slice(i, i + batchSize)
                await Promise.all(batch.map(async (fn) => {
                    try {
                        const { body } = await getFunctionBody(fn, projectRoot, 0)
                        if (body && body.toLowerCase().includes(query.toLowerCase())) {
                            bodySearchResults.push(fn)
                        }
                    } catch {
                        // Skip files that can't be read
                    }
                }))
            }
            spinner.stop()
            
            // Use body search results instead
            if (bodySearchResults.length > 0) {
                filtered = bodySearchResults
            } else {
                console.log(chalk.yellow(`\nNo functions found containing "${query}" in body`))
                return
            }
        }

        for (const param of paramFilters) {
            filtered = filtered.filter(f => f.params?.some((p: any) => p.name.includes(param)))
        }

        for (const callsFn of callsFilters) {
            filtered = filtered.filter(f => f.calls?.some((c: any) => 
                c.includes(callsFn) || c.toLowerCase().includes(callsFn.toLowerCase())
            ))
        }

        for (const calledByFn of calledByFilters) {
            filtered = filtered.filter(f => f.calledBy?.some((c: string) => 
                c.includes(calledByFn) || c.toLowerCase().includes(calledByFn.toLowerCase())
            ))
        }

        // Body search mode
        if (inFunctions.length > 0) {
            if (!query) {
                console.log(chalk.yellow('\nError: Query required when using --in'))
                return
            }

            const results: Array<{ fn: any; matches: BodyMatch[] }> = []
            
            for (const inFnName of inFunctions) {
                const engine = new DirectSearchEngine(lock)
                const fn = engine.getExactMatch(inFnName)
                if (!fn) {
                    console.log(chalk.yellow(`\nFunction not found: "${inFnName}"`))
                    continue
                }

                const { body } = await getFunctionBody(fn, projectRoot, 0)
                const matches = searchInBody(body, query, fn.startLine)
                
                if (matches.length > 0) {
                    results.push({ fn, matches })
                }
            }

            if (results.length === 0) {
                console.log(chalk.yellow(`\nNo matches found for "${query}" in specified functions`))
                const suggestions = generateSuggestions(query, allFunctions)
                if (suggestions.length > 0) {
                    console.log(chalk.dim('\nDid you mean:'))
                    suggestions.forEach(s => console.log(chalk.cyan(`  ${s}`)))
                }
                return
            }

            // Sort by match count or alphabetically
            results.sort((a, b) => b.matches.length - a.matches.length)
            const displayResults = topN > 0 ? results.slice(0, topN) : results

            if (asJson) {
                console.log(JSON.stringify(results, null, 2))
            } else {
                console.log(chalk.green(`\nFound ${results.length} functions with matches:\n`))
                for (const { fn, matches } of displayResults) {
                    console.log(chalk.bold(`${fn.name}`) + chalk.dim(` (${matches.length} matches)`))
                    console.log(chalk.dim(`   ${formatFilePath(fn.file, projectRoot)}`))
                    if (rich) {
                        const sig = fn.params?.map((p: any) => `${p.name}: ${p.type}`).join(', ') || ''
                        console.log(chalk.dim(`   ${fn.name}(${sig}): ${fn.returnType || 'void'}`))
                    }
                    for (const m of matches.slice(0, 5)) {
                        console.log(`  ${chalk.yellow(String(m.lineNum).padStart(4))} │ ${m.line}`)
                    }
                    if (matches.length > 5) {
                        console.log(chalk.dim(`  ... and ${matches.length - 5} more matches`))
                    }
                    console.log('')
                }
            }
            return
        }

        // Regular search
        if (!query && filtered.length === 0) {
            console.log(chalk.yellow('\nNo functions match the filters'))
            return
        }

        let results: SearchResult[] = []

        if (query) {
            const engine = new DirectSearchEngine({ ...lock, functions: Object.fromEntries(filtered.map(f => [f.id, f])) })

            if (mode === 'exact') {
                const fn = engine.getExactMatch(query)
                if (fn) results = [{ name: fn.name, file: fn.file, fn, score: 1.0 }]
            } else {
                // Direct search - require exact name match
                const nameResults = engine.search({ name: query })
                
                // Only use name results - no fallback
                // If no matches, fuzzy search will handle it
                for (const fn of nameResults.slice(0, limit * 2)) {
                    results.push({ name: fn.name, file: fn.file, fn, score: 1.0 })
                }

                // Semantic search only in semantic or hybrid mode
                if (mode === 'semantic' || mode === 'hybrid') {
                    const semanticAvailable = await SemanticSearcher.isAvailable()
                    const hasGeminiKey = !!process.env.GEMINI_API_KEY

                    if (semanticAvailable || hasGeminiKey) {
                        const spinner = ora('Semantic search with embeddings...').start()
                        try {
                            const searcher = new SemanticSearcher(projectRoot)
                            const filteredLock = { ...lock, functions: Object.fromEntries(filtered.map(f => [f.id, f])) }
                            await searcher.index(filteredLock)
                            const semanticResults = await searcher.search(query, filteredLock, limit * 2)
                            
                            for (const res of semanticResults) {
                                if (!results.find(r => r.name === res.name)) {
                                    const fn = filtered.find(f => f.id === res.id || f.name === res.name)
                                    if (fn) results.push({ name: fn.name, file: fn.file, fn, score: res.score })
                                }
                            }
                            spinner.stop()
                        } catch (err) {
                            spinner.stop()
                            console.log(chalk.yellow(`\n⚠️  Semantic search failed: ${err instanceof Error ? err.message : String(err)}`))
                        }
                    } else if (mode === 'semantic') {
                        // Only prompt if user specifically requested semantic mode
                        console.log(chalk.yellow('\n⚠️  Semantic search requires an embedding provider.'))
                        console.log(chalk.dim('\nAvailable options:'))
                        console.log(chalk.dim('  1. Local Xenova/Transformers (run: npm install @xenova/transformers)'))
                        console.log(chalk.dim('  2. Google Gemini API (set GEMINI_API_KEY env var)'))
                        console.log(chalk.dim('\nFor now, using fuzzy search as fallback...\n'))
                    }
                }

                // Fuzzy search - always runs to enhance results, especially for typos
                // Skip if we already have good results from exact match
                if (results.length === 0 || mode === 'hybrid') {
                    const spinner = ora('Fuzzy search (typo tolerance)...').start()
                    const fuzzyResults = fuzzySearch(query, filtered)
                    for (const res of fuzzyResults.slice(0, limit * 2)) {
                        const existing = results.find(r => r.name === res.fn.name)
                        if (!existing) {
                            results.push({ name: res.fn.name, file: res.fn.file, fn: res.fn, score: res.score })
                        } else if (res.score > existing.score) {
                            existing.score = res.score
                        }
                    }
                    spinner.stop()
                }
            }
        } else {
            // No query - just return filtered results
            results = filtered.slice(0, limit).map(f => ({ name: f.name, file: f.file, fn: f, score: 1.0 }))
        }

        // Sort results
        if (sortField === 'name') {
            results.sort((a, b) => a.name.localeCompare(b.name))
        } else if (sortField === 'calls') {
            results.sort((a, b) => (b.fn.calls?.length || 0) - (a.fn.calls?.length || 0))
        } else if (sortField === 'length') {
            results.sort((a, b) => (b.fn.endLine - b.fn.startLine) - (a.fn.endLine - a.fn.startLine))
        } else {
            results.sort((a, b) => b.score - a.score)
        }

        const displayResults = topN > 0 ? results.slice(0, topN) : results.slice(0, limit)

        if (displayResults.length === 0) {
            console.log(chalk.yellow(`\nNo results found${query ? ` for "${query}"` : ''}`))
            if (query) {
                const suggestions = generateSuggestions(query, allFunctions)
                if (suggestions.length > 0) {
                    console.log(chalk.dim('\nDid you mean:'))
                    suggestions.forEach(s => console.log(chalk.cyan(`  ${s}`)))
                }
                console.log(chalk.dim('\nTry:'))
                console.log(chalk.dim(`  --mode direct  for keyword search`))
                console.log(chalk.dim(`  --mode semantic for fuzzy matching`))
                console.log(chalk.dim(`  --exported to filter exported only`))
                console.log(chalk.dim(`  --module <id> to search in specific module`))
            }
            return
        }

        if (asJson) {
            console.log(JSON.stringify(displayResults, null, 2))
            return
        }

        const resultLabel = query ? `results for "${query}"` : 'functions matching filters'
        console.log(chalk.green(`\n${chalk.bold(displayResults.length)} ${resultLabel}\n`))

        for (let i = 0; i < displayResults.length; i++) {
            const { name, file, fn, score } = displayResults[i]

            if (minimal) {
                console.log(`${i + 1}. ${name}`)
                continue
            }

            const scoreStr = query ? ` ${chalk.dim(`[${(score * 100).toFixed(0)}%]`)}` : ''
            console.log(`${chalk.blue(i + 1 + '.'.padStart(3))} ${chalk.bold(name)}${scoreStr}`)
            console.log(chalk.dim(`   ${formatFilePath(file, projectRoot)}`))

            if (rich || topN > 0) {
                const params = fn.params?.map((p: any) => `${p.name}: ${p.type}`).join(', ') || ''
                console.log(chalk.dim(`   ${fn.name}(${params})${fn.returnType ? ': ' + fn.returnType : ''}`))
                if (fn.purpose) console.log(`   ${chalk.italic(fn.purpose)}`)
                if (fn.calls?.length) console.log(chalk.dim(`   calls: ${fn.calls.slice(0, 3).join(', ')}${fn.calls.length > 3 ? '...' : ''}`))
                if (fn.calledBy?.length) console.log(chalk.dim(`   called by: ${fn.calledBy.slice(0, 3).join(', ')}${fn.calledBy.length > 3 ? '...' : ''}`))
            }

            if (includeBody || topN > 0) {
                const bodyResult = await getFunctionBody(fn, projectRoot, maxLines)
                if (bodyResult.body) {
                    const lines = bodyResult.lines
                    console.log(chalk.dim('─'.repeat(50)))
                    for (let j = 0; j < Math.min(lines.length, topN > 0 ? maxLines : 8); j++) {
                        console.log(`   ${lines[j]}`)
                    }
                    if (lines.length > (topN > 0 ? maxLines : 8)) {
                        console.log(chalk.yellow(`   ... ${lines.length - (topN > 0 ? maxLines : 8)} more lines`))
                    }
                }
            }
            console.log('')
        }
        
        // Show suggestions if few results
        if (displayResults.length < 3 && query) {
            console.log(chalk.dim('Suggestions:'))
            console.log(chalk.dim(`  Use --top to see more results with bodies`))
            console.log(chalk.dim(`  Use --exported to filter exported functions`))
            console.log(chalk.dim(`  Use --mode semantic for fuzzy matching`))
        }

      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        console.error(chalk.red(`Search failed: ${message}`))
        if (process.env.MIKK_DEBUG && err instanceof Error) console.error(err.stack)
        process.exit(1)
      }
    })
}
