/**
 * @getmikk/ide-context
 *
 * The importable, customisable API that IDE chat agents (Copilot, Cursor,
 * Windsurf, Continue, Cline…) call to understand a project's structure.
 */

import * as fs from 'node:fs/promises'
import * as path from 'node:path'

// ─── Types (duplicated from @getmikk/core to avoid dependency) ───────────────

export type SemanticRole =
  | 'unknown'
  | 'route'
  | 'api-handler'
  | 'middleware'
  | 'service'
  | 'model'
  | 'controller'
  | 'view'
  | 'component'
  | 'hook'
  | 'utility'
  | 'config'
  | 'entry-point'
  | 'test'
  | 'migration'
  | 'seed'
  | 'script'
  | 'type'
  | 'constant'
  | 'interface'
  | 'class'

export interface RoleClassification {
  role: SemanticRole
  confidence: number
  framework?: string
  file: string
  reason?: string
}

// ─── Simple lock file reader with hydration (avoid core dep) ────────────────

interface LockFileData {
  version: string
  generatedAt: string
  generatorVersion: string
  projectRoot: string
  syncState?: any
  graph?: { nodes: number; edges: number; rootHash: string }
  fnIndex?: string[]
  functions?: Record<string, any>
  modules?: Record<string, any>
  files?: Record<string, any>
  classes?: Record<string, any>
  routes?: any[]
  contextFiles?: any[]
}

function parseEntityKey(fullId: string, prefix: string): { name: string; file: string } {
  if (!fullId.startsWith(prefix)) return { name: fullId, file: '' }
  const rest = fullId.slice(prefix.length)
  const lastColon = rest.lastIndexOf(':')
  if (lastColon === -1) return { name: rest, file: '' }
  return {
    name: rest.slice(lastColon + 1),
    file: rest.slice(0, lastColon),
  }
}

function normalizeFilePath(filePath: string): string {
  return filePath.replace(/\\/g, '/').replace(/^\/+/, '').toLowerCase()
}

async function readAndHydrateLock(projectRoot: string): Promise<LockFileData> {
  const lockPath = path.join(projectRoot, 'mikk.lock.json')
  const raw = JSON.parse(await fs.readFile(lockPath, 'utf-8'))

  // Check if already hydrated (has id/name/file in functions)
  const firstFn = Object.values(raw.functions || {})[0] as any
  if (firstFn && typeof firstFn === 'object' && 'id' in firstFn && 'name' in firstFn && 'file' in firstFn) {
    return raw // Already hydrated
  }

  // Hydrate compact format
  const fnIndex: string[] = raw.fnIndex || []
  const hasFnIndex = fnIndex.length > 0

  // Build file->moduleId map
  const fileModuleMap: Record<string, string> = {}
  for (const [key, f] of Object.entries(raw.files || {}) as [string, any][]) {
    const moduleId = f.moduleId || 'unknown'
    const normalizedKey = normalizeFilePath(key)
    fileModuleMap[key] = moduleId
    fileModuleMap[normalizedKey] = moduleId
  }

  // Hydrate functions
  const hydratedFunctions: Record<string, any> = {}
  for (const [key, c] of Object.entries(raw.functions || {}) as [string, any][]) {
    const fullId = hasFnIndex ? (fnIndex[parseInt(key)] || key) : key
    const { name: parsedName, file } = parseEntityKey(fullId, 'fn:')
    const name = c.name || parsedName
    const lines = c.lines || [0, 0]
    const normalizedFile = normalizeFilePath(file)

    hydratedFunctions[fullId] = {
      id: fullId,
      name,
      file,
      startLine: lines[0],
      endLine: lines[1],
      moduleId: fileModuleMap[normalizedFile] || fileModuleMap[file] || c.moduleId || 'unknown',
      ...(c.params ? { params: c.params } : {}),
      ...(c.returnType ? { returnType: c.returnType } : {}),
      ...(c.isAsync ? { isAsync: true } : {}),
      ...(c.isExported ? { isExported: true } : {}),
      ...(c.purpose ? { purpose: c.purpose } : {}),
      calls: c.calls || [],
      calledBy: c.calledBy || [],
    }
  }

  // Return hydrated data
  return {
    ...raw,
    functions: hydratedFunctions,
  }
}

// ─── Core Types for External Use ────────────────────────────────────────────

export interface IdeRoute {
  method: string
  path: string
  handler: string
  file: string
  line: number
}

// ─── Role Classification ──────────────────────────────────────────────────────

interface RolePattern { pattern: RegExp; role: SemanticRole; framework?: string }

const ROLE_PATTERNS: RolePattern[] = [
  { pattern: /^.*\/routes?[\\/]/, role: 'route' },
  { pattern: /^.*\/api[\\/]/, role: 'api-handler' },
  { pattern: /app\/api/, role: 'api-handler', framework: 'nextjs' },
  { pattern: /route\.[tj]s$/, role: 'route', framework: 'nextjs' },
  { pattern: /routes\+server\.[tj]s$/, role: 'route', framework: 'sveltekit' },
  { pattern: /middleware/, role: 'middleware' },
  { pattern: /middlewares?[\\/]/, role: 'middleware' },
  { pattern: /service[s]?[\\/]/, role: 'service' },
  { pattern: /model[s]?[\\/]/, role: 'model' },
  { pattern: /store[s]?[\\/]/, role: 'model' },
  { pattern: /[\\/]db[\\/]/, role: 'model' },
  { pattern: /controller[s]?[\\/]/, role: 'controller' },
  { pattern: /[\\/]pages[\\/]/, role: 'view' },
  { pattern: /component[s]?[\\/]/, role: 'component' },
  { pattern: /[\\/]components?[\\/]/, role: 'component' },
  { pattern: /hook[s]?[\\/]?$/, role: 'hook' },
  { pattern: /[\\/]hooks?[\\/]/, role: 'hook' },
  { pattern: /config/, role: 'config' },
  { pattern: /\.config\.[jt]s$/, role: 'config' },
  { pattern: /\.config\.[jt]sx?$/, role: 'config' },
  { pattern: /[\/](index|app|main|bootstrap|server|entry)\.[tj]sx?$/, role: 'entry-point' },
  { pattern: /test[s]?[\\/]/, role: 'test' },
  { pattern: /\.test\.[tj]s$/, role: 'test' },
  { pattern: /\.spec\.[tj]s$/, role: 'test' },
  { pattern: /[\\/]__tests__[\\/]/, role: 'test' },
  { pattern: /migration/, role: 'migration' },
  { pattern: /seed[s]?[\\/]/, role: 'seed' },
  { pattern: /type[s]?[\\/]/, role: 'type' },
  { pattern: /[\\/]types?[\\/]/, role: 'type' },
  { pattern: /constant[s]?[\\/]/, role: 'constant' },
]

class SemanticRoleClassifier {
  classifyFile(filePath: string): RoleClassification {
    const path = filePath.replace(/\\/g, '/').toLowerCase()

    for (const p of ROLE_PATTERNS) {
      if (p.pattern.test(path)) {
        return { role: p.role, confidence: 0.9, framework: p.framework, file: filePath }
      }
    }

    const ext = path.split('.').pop()
    if (ext === 'ts' || ext === 'tsx' || ext === 'js' || ext === 'jsx') {
      return { role: 'unknown', confidence: 0.5, file: filePath }
    }
    return { role: 'unknown', confidence: 0.3, file: filePath }
  }
}

// ─── Core data types ──────────────────────────────────────────────────────────

export interface IdeFunction {
    id: string
    name: string
    file: string
    moduleId: string
    startLine: number
    endLine: number
    returnType?: string
    isExported: boolean
    isAsync: boolean
    params: Array<{ name: string; type: string; optional?: boolean }>
    purpose?: string
    calls: string[]
    calledBy: string[]
    role: SemanticRole
    roleConfidence: number
    roleFramework?: string
}

export interface IdeClass {
    id: string
    name: string
    file: string
    moduleId: string
    startLine: number
    endLine: number
    isExported: boolean
    purpose?: string
    role: SemanticRole
}

export interface IdeModule {
    id: string
    name: string
    description: string
    files: string[]
    fileCount: number
    parentId?: string
    children: string[]
    functions: IdeFunction[]
    functionCount: number
    classes: IdeClass[]
    classCount: number
    exportedSymbols: string[]
    role?: SemanticRole
}

// ─── Semantic Role Classifier (standalone, no core dep) ─────────────────────

export interface IdeProjectSummary {
    name: string
    language: string
    frameworks: string[]
    totalFiles: number
    totalFunctions: number
    totalClasses: number
    totalModules: number
    totalRoutes: number
    entryPoints: Array<{ name: string; file: string }>
    topModules: Array<{ id: string; name: string; functionCount: number }>
}

// ─── Suggestion result ────────────────────────────────────────────────────────

export interface ModuleSuggestion {
    moduleId: string
    moduleName: string
    confidence: number          // 0–1
    reason: string
    parentId?: string
}

// ─── MikkContext class ────────────────────────────────────────────────────────

export class MikkContext {
    private lock: any
    private contract: any | null
    private classifier = new SemanticRoleClassifier()
    private _functionMap: Map<string, IdeFunction> | null = null
    private _classMap: Map<string, IdeClass> | null = null
    private _moduleMap: Map<string, IdeModule> | null = null

    private constructor(lock: any, contract: any | null) {
        this.lock = lock
        this.contract = contract
    }

    // ── Factory ───────────────────────────────────────────────────────────────

    /**
     * Load the mikk.lock.json (and optionally mikk.json) from a project root.
     * Throws if no lock file exists — run `mikk analyze` first.
     */
    static async load(projectRoot: string): Promise<MikkContext> {
        const lock = await readAndHydrateLock(projectRoot)

        let contract: any | null = null
        try {
            const contractPath = path.join(projectRoot, 'mikk.json')
            const contractRaw = await fs.readFile(contractPath, 'utf-8')
            contract = JSON.parse(contractRaw)
        } catch {
            // mikk.json is optional
        }

        return new MikkContext(lock, contract)
    }

    // ── Project summary ───────────────────────────────────────────────────────

    /**
     * Get a high-level summary of the project — ideal as the first thing
     * an IDE agent calls to orient itself.
     */
    getProjectSummary(): IdeProjectSummary {
        const fns = Object.values(this.lock.functions ?? {}) as any[]
        const classes = Object.values(this.lock.classes ?? {}) as any[]
        const files = Object.keys(this.lock.files ?? {})
        const modules = Object.keys(this.lock.modules ?? {})
        const routes = this.lock.routes ?? []

        // Detect frameworks from file paths + context files
        const contextFiles = (this.lock.contextFiles ?? []).map((f: any) => f.path)
        const frameworks = this.detectFrameworks([...files, ...contextFiles])

        // Entry points
        const ENTRY_NAMES = /^(main|bootstrap|start|serve|listen|run|init|createApp|createServer)$/i
        const entryPoints = fns
            .filter(fn => ENTRY_NAMES.test(fn.name) ||
                fn.file?.match(/\/(index|main|app|server|bootstrap)\.[jt]sx?$/))
            .slice(0, 8)
            .map(fn => ({ name: fn.name, file: fn.file }))

        // Top modules by function count
        const moduleCount: Record<string, number> = {}
        for (const fn of fns) {
            if (fn.moduleId) moduleCount[fn.moduleId] = (moduleCount[fn.moduleId] ?? 0) + 1
        }

        const topModules = Object.entries(moduleCount)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 8)
            .map(([id, count]) => ({
                id,
                name: this.lock.modules?.[id]?.id ?? id,
                functionCount: count,
            }))

        return {
            name: this.contract?.project?.name ?? this.lock.projectRoot ?? 'unknown',
            language: this.contract?.project?.language ?? 'unknown',
            frameworks,
            totalFiles: files.length,
            totalFunctions: fns.length,
            totalClasses: classes.length,
            totalModules: modules.length,
            totalRoutes: routes.length,
            entryPoints,
            topModules,
        }
    }

    // ── Module map ────────────────────────────────────────────────────────────

    /**
     * Get all modules as a rich IdeModule[].
     * This is what IDE agents use to understand the high-level architecture.
     */
    getModules(): IdeModule[] {
        return [...this.buildModuleMap().values()]
    }

    /**
     * Get a single module by id.
     */
    getModule(moduleId: string): IdeModule | null {
        return this.buildModuleMap().get(moduleId) ?? null
    }

    /**
     * Get all functions in a module.
     */
    getModuleFunctions(moduleId: string): IdeFunction[] {
        return this.getModule(moduleId)?.functions ?? []
    }

    // ── File classification ───────────────────────────────────────────────────

/**
 * Get the semantic role of a file.
 * Zero-cost — uses filename heuristics only.
 */
getFileRole(filePath: string): RoleClassification & { isDeadCodeExempt: boolean } {
  const rel = filePath.replace(/\\/g, '/').replace(new RegExp(`^${this.lock.projectRoot}/?`), '')
  const result = this.classifier.classifyFile(rel)
  const exempt: SemanticRole[] = ['route', 'api-handler', 'middleware', 'entry-point', 'test', 'migration', 'seed', 'script']
  return { ...result, isDeadCodeExempt: exempt.includes(result.role) }
}

    // ── Symbol lookup ─────────────────────────────────────────────────────────

    /**
     * Find functions by name (fuzzy prefix match).
     * Useful for agents that know a function name but not its location.
     */
    findFunctions(query: string): IdeFunction[] {
        const lower = query.toLowerCase()
        return [...this.buildFunctionMap().values()]
            .filter(fn => fn.name.toLowerCase().includes(lower))
            .slice(0, 20)
    }

    /**
     * Get a function by id.
     */
    getFunction(id: string): IdeFunction | null {
        return this.buildFunctionMap().get(id) ?? null
    }

    /**
     * Get all functions in a file.
     */
    getFunctionsInFile(filePath: string): IdeFunction[] {
        const rel = filePath.replace(/\\/g, '/')
        return [...this.buildFunctionMap().values()]
            .filter(fn => fn.file.endsWith(rel) || rel.endsWith(fn.file))
    }

    // ── Route surface ─────────────────────────────────────────────────────────

    /**
     * Get all detected routes (HTTP endpoints).
     */
    getRoutes(): IdeRoute[] {
        return (this.lock.routes ?? []).map((r: any) => ({
            method: r.method,
            path: r.path,
            handler: r.handler,
            file: r.file,
            line: r.line,
        }))
    }

    /**
     * Get routes grouped by file.
     */
    getRoutesByFile(): Map<string, IdeRoute[]> {
        const map = new Map<string, IdeRoute[]>()
        for (const route of this.getRoutes()) {
            const existing = map.get(route.file) ?? []
            existing.push(route)
            map.set(route.file, existing)
        }
        return map
    }

    // ── Module suggestion (the key AI-agent feature) ──────────────────────────

    /**
     * Given a list of symbol names (functions, classes, variables) that an
     * IDE agent just created or edited, suggest which module each belongs to.
     *
     * This is the primary integration point for IDEs that want Mikk to
     * automatically organise new code into the right module.
     *
     * @param symbols - Array of { name, file } for new/modified symbols
     * @param options - Customise scoring weights
     */
    suggestModules(
        symbols: Array<{ name: string; file: string }>,
        options: {
            maxSuggestions?: number
            minConfidence?: number
            includeParentModules?: boolean
        } = {}
    ): Map<string, ModuleSuggestion[]> {
        const { maxSuggestions = 3, minConfidence = 0.2, includeParentModules = true } = options
        const result = new Map<string, ModuleSuggestion[]>()
        const moduleMap = this.buildModuleMap()

        for (const symbol of symbols) {
            const suggestions = this.scoreModulesForSymbol(symbol, moduleMap)
                .filter(s => s.confidence >= minConfidence)
                .slice(0, maxSuggestions)

            result.set(`${symbol.file}::${symbol.name}`, suggestions)
        }

        return result
    }

    /**
     * Suggest the best module for a single new file.
     * Useful when an agent creates a new file and wants to know where to register it.
     */
    suggestModuleForFile(filePath: string): ModuleSuggestion | null {
        const moduleMap = this.buildModuleMap()
        const rel = filePath.replace(/\\/g, '/').replace(/^\/+/, '')

        // Score by: same directory prefix, similar file names, role similarity
        const scores: Array<{ module: IdeModule; score: number; reason: string }> = []

        for (const mod of moduleMap.values()) {
            let score = 0
            let reason = ''

            // Directory prefix match
            for (const modFile of mod.files) {
                const prefix = this.commonPrefix(rel, modFile.replace(/\\/g, '/'))
                if (prefix.length > 3) {
                    const bonus = prefix.length / Math.max(rel.length, modFile.length)
                    score += bonus * 0.8
                    reason = `Same directory as ${modFile}`
                }
            }

            // Role match
            const fileRole = this.classifier.classifyFile(rel)
            if (mod.role && mod.role === fileRole.role) {
                score += 0.3
                reason += `, same role (${fileRole.role})`
            }

            if (score > 0) {
                scores.push({ module: mod, score, reason: reason.replace(/^, /, '') })
            }
        }

        scores.sort((a, b) => b.score - a.score)
        const best = scores[0]
        if (!best || best.score < 0.15) return null

        return {
            moduleId: best.module.id,
            moduleName: best.module.name,
            confidence: Math.min(1, best.score),
            reason: best.reason,
            parentId: best.module.parentId,
        }
    }

    // ── Full context dump (for agent system prompts) ──────────────────────────

    /**
     * Generate a compact, token-efficient context string that an IDE agent
     * can paste into its system prompt to understand the project.
     *
     * Format is human-readable but machine-parseable YAML-ish text.
     */
    getMikkContext(options: {
        maxFunctionsPerModule?: number
        includeRoutes?: boolean
        includeTypes?: boolean
    } = {}): string {
        const { maxFunctionsPerModule = 5, includeRoutes = true } = options
        const summary = this.getProjectSummary()
        const modules = this.getModules()
        const routes = includeRoutes ? this.getRoutes() : []

        const lines: string[] = [
            `# Mikk Project Context`,
            `project: ${summary.name}`,
            `language: ${summary.language}`,
            `frameworks: ${summary.frameworks.join(', ') || 'none detected'}`,
            `stats: ${summary.totalFiles} files, ${summary.totalFunctions} functions, ${summary.totalModules} modules, ${summary.totalRoutes} routes`,
            ``,
            `## Entry points`,
            ...summary.entryPoints.map(e => `  - ${e.name} (${e.file})`),
            ``,
            `## Modules`,
        ]

        for (const mod of modules.sort((a, b) => b.functions.length - a.functions.length)) {
            lines.push(`  ### ${mod.name} [${mod.id}]`)
            lines.push(`     files: ${mod.files.slice(0, 3).join(', ')}${mod.files.length > 3 ? ` +${mod.files.length - 3} more` : ''}`)
            lines.push(`     role: ${mod.role ?? 'mixed'}`)
            const exported = mod.exportedSymbols.slice(0, maxFunctionsPerModule)
            if (exported.length > 0) {
                lines.push(`     exports: ${exported.join(', ')}`)
            }
        }

        if (routes.length > 0) {
            lines.push(``)
            lines.push(`## API routes (${routes.length} total)`)
            for (const r of routes.slice(0, 30)) {
                lines.push(`  ${r.method.padEnd(7)} ${r.path}  → ${r.handler} (${r.file}:${r.line})`)
            }
            if (routes.length > 30) {
                lines.push(`  ... and ${routes.length - 30} more`)
            }
        }

        return lines.join('\n')
    }

    // ── Private builders ──────────────────────────────────────────────────────

    private buildFunctionMap(): Map<string, IdeFunction> {
        if (this._functionMap) return this._functionMap

        const map = new Map<string, IdeFunction>()
        const lockFns = this.lock.functions ?? {}

        for (const [id, fn] of Object.entries(lockFns)) {
            const raw = fn as any
            const fileRole = this.classifier.classifyFile(raw.file ?? '')

            map.set(id, {
                id,
                name: raw.name,
                file: raw.file,
                moduleId: raw.moduleId ?? 'unknown',
                startLine: raw.startLine ?? 0,
                endLine: raw.endLine ?? 0,
                returnType: raw.returnType,
                isExported: raw.isExported ?? false,
                isAsync: raw.isAsync ?? false,
                params: raw.params ?? [],
                purpose: raw.purpose,
                calls: raw.calls ?? [],
                calledBy: raw.calledBy ?? [],
                role: fileRole.role,
                roleConfidence: fileRole.confidence,
                roleFramework: fileRole.framework,
            })
        }

        this._functionMap = map
        return map
    }

    private buildClassMap(): Map<string, IdeClass> {
        if (this._classMap) return this._classMap

        const map = new Map<string, IdeClass>()
        const lockClasses = this.lock.classes ?? {}

        for (const [id, cls] of Object.entries(lockClasses)) {
            const raw = cls as any
            const fileRole = this.classifier.classifyFile(raw.file ?? '')

            map.set(id, {
                id,
                name: raw.name,
                file: raw.file,
                moduleId: raw.moduleId ?? 'unknown',
                startLine: raw.startLine ?? 0,
                endLine: raw.endLine ?? 0,
                isExported: raw.isExported ?? false,
                purpose: raw.purpose,
                role: fileRole.role,
            })
        }

        this._classMap = map
        return map
    }

    private buildModuleMap(): Map<string, IdeModule> {
        if (this._moduleMap) return this._moduleMap

        const map = new Map<string, IdeModule>()
        const fnMap = this.buildFunctionMap()
        const clsMap = this.buildClassMap()
        const lockModules = this.lock.modules ?? {}

        // First pass: create all modules
        for (const [id, mod] of Object.entries(lockModules)) {
            const raw = mod as any

            const fns = [...fnMap.values()].filter(fn => fn.moduleId === id)
            const classes = [...clsMap.values()].filter(cls => cls.moduleId === id)

            // Determine dominant role
            const roleCounts: Record<string, number> = {}
            for (const fn of fns) {
                if (fn.role !== 'unknown') {
                    roleCounts[fn.role] = (roleCounts[fn.role] ?? 0) + 1
                }
            }
            const dominantRole = Object.entries(roleCounts).sort(([, a], [, b]) => b - a)[0]?.[0] as SemanticRole | undefined

            const exported = [
                ...fns.filter(f => f.isExported).map(f => f.name),
                ...classes.filter(c => c.isExported).map(c => c.name),
            ]

            // Find declared module info from contract
            const declaredModule = this.contract?.declared?.modules?.find((m: any) => m.id === id)

            map.set(id, {
                id,
                name: declaredModule?.name ?? raw.id ?? id,
                description: declaredModule?.description ?? '',
                files: raw.files ?? [],
                fileCount: (raw.files ?? []).length,
                parentId: raw.parentId ?? declaredModule?.parentId,
                children: [],
                functions: fns,
                functionCount: fns.length,
                classes,
                classCount: classes.length,
                exportedSymbols: exported,
                role: dominantRole,
            })
        }

        // Second pass: wire parent-child relationships
        for (const mod of map.values()) {
            if (mod.parentId && map.has(mod.parentId)) {
                const parent = map.get(mod.parentId)!
                if (!parent.children.includes(mod.id)) {
                    parent.children.push(mod.id)
                }
            }
        }

        this._moduleMap = map
        return map
    }

    private scoreModulesForSymbol(
        symbol: { name: string; file: string },
        moduleMap: Map<string, IdeModule>
    ): ModuleSuggestion[] {
        const rel = symbol.file.replace(/\\/g, '/').replace(/^\/+/, '')
        const nameWords = this.splitIdentifier(symbol.name).map(w => w.toLowerCase())
        const fileRole = this.classifier.classifyFile(rel)

        const scores: Array<ModuleSuggestion & { raw: number }> = []

        for (const mod of moduleMap.values()) {
            let score = 0
            const reasons: string[] = []

            // 1. File is already in this module
            if (mod.files.some(f => f.replace(/\\/g, '/').endsWith(rel) || rel.endsWith(f.replace(/\\/g, '/')))) {
                score += 1.0
                reasons.push('file already in module')
            }

            // 2. Directory prefix overlap
            for (const modFile of mod.files) {
                const prefix = this.commonPrefix(rel, modFile.replace(/\\/g, '/'))
                if (prefix.includes('/')) {
                    score += 0.4
                    reasons.push(`same directory as ${modFile}`)
                    break
                }
            }

            // 3. Semantic name overlap
            const modName = mod.name.toLowerCase()
            const modWords = this.splitIdentifier(modName)
            const overlap = nameWords.filter(w => modWords.some(mw => mw.includes(w) || w.includes(mw)))
            if (overlap.length > 0) {
                score += overlap.length * 0.3
                reasons.push(`name matches: ${overlap.join(', ')}`)
            }

            // 4. Role match
            if (mod.role && mod.role === fileRole.role && fileRole.role !== 'unknown') {
                score += 0.25
                reasons.push(`same semantic role (${fileRole.role})`)
            }

            if (score > 0) {
                scores.push({
                    moduleId: mod.id,
                    moduleName: mod.name,
                    confidence: Math.min(1, score),
                    reason: reasons.slice(0, 2).join('; '),
                    parentId: mod.parentId,
                    raw: score,
                })
            }
        }

        return scores.sort((a, b) => b.raw - a.raw)
    }

    private detectFrameworks(files: string[]): string[] {
        const found = new Set<string>()
        const rules: [RegExp, string][] = [
            [/next\.config/, 'Next.js'], [/nuxt\.config/, 'Nuxt'],
            [/svelte\.config/, 'SvelteKit'], [/astro\.config/, 'Astro'],
            [/remix\.config/, 'Remix'], [/vite\.config/, 'Vite'],
            [/angular\.json/, 'Angular'], [/nest-cli\.json/, 'NestJS'],
            [/django|flask|fastapi/, 'Python Web'], [/spring/, 'Spring'],
            [/rails/, 'Rails'], [/laravel/, 'Laravel'],
            [/gin\.go|echo\.go|fiber/, 'Go HTTP'],
            [/actix|axum/, 'Rust Web'],
        ]
        for (const f of files) {
            const n = f.toLowerCase()
            for (const [pat, name] of rules) {
                if (pat.test(n)) found.add(name)
            }
        }
        return [...found]
    }

    private commonPrefix(a: string, b: string): string {
        let i = 0
        while (i < a.length && i < b.length && a[i] === b[i]) i++
        return a.slice(0, i)
    }

    private splitIdentifier(name: string): string[] {
        return name
            .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
            .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
            .split(/[\s_\-.]+/)
            .map(w => w.toLowerCase())
            .filter(w => w.length > 1)
    }
}

// ─── Convenience factory ──────────────────────────────────────────────────────

/**
 * The primary entry point. Load mikk context for a project root.
 *
 * Usage:
 *   import { createMikkContext } from '@getmikk/ide-context'
 *   const ctx = await createMikkContext('/path/to/project')
 *   console.log(ctx.getProjectSummary())
 *   console.log(ctx.getRoutes())
 *   console.log(ctx.suggestModules([{ name: 'createUser', file: 'src/auth/user.ts' }]))
 */
export async function createMikkContext(projectRoot: string): Promise<MikkContext> {
    return MikkContext.load(projectRoot)
}

// ─── Named re-exports for tree-shaking ───────────────────────────────────────

export {
    SemanticRoleClassifier,
}
