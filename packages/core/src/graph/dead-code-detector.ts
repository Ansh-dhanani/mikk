import type { DependencyGraph } from './types.js'
import type { MikkLock, MikkLockClass, MikkLockFile } from '../contract/schema.js'
import { SemanticRoleClassifier } from './semantic-role-classifier.js'

// ─── Types ──────────────────────────────────────────────────────────

export type DeadCodeConfidence = 'high' | 'medium' | 'low'

export interface DeadCodeEntry {
    id: string
    name: string
    file: string
    moduleId?: string
    type: 'function' | 'class'
    reason: string
    confidence: DeadCodeConfidence
}

export interface DeadCodeResult {
    deadFunctions: DeadCodeEntry[]
    totalFunctions: number
    deadCount: number
    deadPercentage: number
    byModule: Record<string, { dead: number; total: number; items: DeadCodeEntry[] }>
}

// ─── Exemption patterns ────────────────────────────────────────────

const ENTRY_POINT_PATTERNS = [
    /^(main|bootstrap|start|init|setup|configure|register|mount)$/i,
    /^(app|server|index|mod|program)$/i,
    /Handler$/i,
    /Middleware$/i,
    /Controller$/i,
    /^use[A-Z]/,
    /^handle[A-Z]/,
    /^on[A-Z]/,
    /Provider$/i,
    /^Page$/i,
    /^Layout$/i,
    /^get[A-Z]/,
    /^default$/i,
    /^(getStaticProps|getServerSideProps|generateStaticParams)$/,
    // Plugin / extension / IDE framework entry points
    /Plugin$/i,
    /Extension$/i,
    /SettingTab$/i,
    /Tab$/i,
    /^activate$/i,
    /^deactivate$/i,
]

const TEST_PATTERNS = [
    /^(it|describe|test|beforeAll|afterAll|beforeEach|afterEach)$/,
    /\.test\./,
    /\.spec\./,
    /__test__/,
    /_test_/,
    /_spec_/,
]

const SCRIPT_PATTERNS = [
    /\/scripts\//,
    /\/benchmarks\//,
    /\/fixtures\//,
    /\.bench\./,
    /\.benchmark\./,
]

const FRAMEWORK_ENTRY_PATTERNS = [
    /\/app\//,
    /\/pages\//,
    /\/components\//,
    /\.next\//,
    /\.mjs$/,
    /\.cjs$/,
]

const DYNAMIC_USAGE_PATTERNS = [
    /^addEventListener$/i,
    /^removeEventListener$/i,
    /^on[A-Z]/,
    /(invoke|dispatch|emit|call|apply)/i,
    /^ngOnInit$/i,
    /^componentDidMount$/i,
    /^componentWillUnmount$/i,
]

const FRAMEWORK_PATTERNS = [
    /^componentDidCatch$/i,
    /^getDerivedStateFromError$/i,
    /^getDerivedStateFromProps$/i,
    /^render$/i,
    /^shouldComponentUpdate$/i,
    /^componentWillReceiveProps$/i,
    /^componentWillUpdate$/i,
    /^UNSAFE_/,
    /^__\w+__$/,
    /^\$\w+/,
]

const CONSTRUCTOR_PATTERNS = [
    /^constructor$/i,
    /^__construct$/i,
    /^__init__$/i,
    /^init$/i,
    /^initialize$/i,
]

const CLASS_METHOD_PATTERNS = [
    /\.constructor$/,
    /^\w+\.\w+$/,
]

// ─── Detector ──────────────────────────────────────────────────────

export class DeadCodeDetector {
    private routeHandlers: Set<string>
    private filesWithUnresolvedImports: Set<string>
    private fnIndex: Map<number, string>
    private allClasses: Map<string, MikkLockClass[]>
    private fileToModuleId: Map<string, string>
    private _classifier = new SemanticRoleClassifier()

    constructor(
        private graph: DependencyGraph,
        private lock: MikkLock,
    ) {
        this.routeHandlers = new Set(
            (lock.routes ?? []).map(r => r.handler).filter(Boolean),
        )
        const rawFnIndex = (lock as any).fnIndex || []
        this.fnIndex = new Map(rawFnIndex.map((id: string, idx: number) => [idx, id]))
        this.filesWithUnresolvedImports = this.buildUnresolvedImportFileSet()
        this.allClasses = this.buildClassIndex()
        this.fileToModuleId = this.buildFileToModuleIndex()
    }

    private normalizeFileKey(filePath: string): string {
        return (filePath || '').replace(/\\/g, '/').toLowerCase()
    }

    private buildFileToModuleIndex(): Map<string, string> {
        const map = new Map<string, string>()
        for (const [moduleId, moduleInfo] of Object.entries(this.lock.modules ?? {})) {
            for (const filePath of moduleInfo.files ?? []) {
                map.set(this.normalizeFileKey(filePath), moduleId)
            }
        }
        return map
    }

    private resolveModuleId(filePath: string, fallback?: string): string {
        const fromFiles = this.fileToModuleId.get(this.normalizeFileKey(filePath))
        if (fromFiles) return fromFiles
        return fallback && fallback.length > 0 ? fallback : 'unknown'
    }

    private resolveFnData(id: string): { name: string; file: string; isExported?: boolean; moduleId?: string } {
        const fn = this.lock.functions[id]
        if (fn?.name && fn?.file) return fn

        const fullId = this.resolveId(id)
        const resolvedFn = this.lock.functions[fullId]
        if (resolvedFn?.name && resolvedFn?.file) return resolvedFn

        if (fullId.startsWith('fn:')) {
            const parts = fullId.slice(3).split(':')
            const file = parts.slice(0, -1).join(':')
            const name = parts[parts.length - 1]
            return { name, file }
        }

        return { name: '', file: '' }
    }

    private resolveId(id: string): string {
        if (this.lock.functions[id]) return id
        const num = parseInt(id)
        if (!isNaN(num)) {
            return this.fnIndex.get(num) || id
        }
        return id
    }

    detect(): DeadCodeResult {
        const dead: DeadCodeEntry[] = []
        let totalFunctions = 0
        const byModule: DeadCodeResult['byModule'] = {}

        const functionIds = Object.keys(this.lock.functions)
        totalFunctions = functionIds.length

        for (const id of functionIds) {
            const fn = this.lock.functions[id]
            if (!fn) continue

            const fnData = this.resolveFnData(id)
            const moduleId = this.resolveModuleId(fn.file, fn.moduleId)

            if (!byModule[moduleId]) {
                byModule[moduleId] = { dead: 0, total: 0, items: [] }
            }
            byModule[moduleId].total++

            const name = fnData.name
            const file = fnData.file
            const isExported = fn.isExported ?? false

            if (this.isExempt(fn, id, name, file, isExported)) {
                continue
            }

            const confidence = this.computeConfidence(fn, name, file)
            const entry: DeadCodeEntry = {
                id,
                name,
                file,
                moduleId,
                type: 'function',
                reason: this.computeReason(fn),
                confidence,
            }
            dead.push(entry)
            byModule[moduleId].dead++
            byModule[moduleId].items.push(entry)
        }

        if (this.lock.classes) {
            for (const [id, cls] of Object.entries(this.lock.classes as Record<string, MikkLockClass>)) {
                const moduleId = this.resolveModuleId(cls.file, cls.moduleId)
                if (!byModule[moduleId]) {
                    byModule[moduleId] = { dead: 0, total: 0, items: [] }
                }

                // ── Class exemptions (mirror function exemptions) ──────────
                // 1. Exported classes are always live
                if (cls.isExported) continue

                // 2. Any graph edge pointing to this class (import, contains, calls)
                const inEdges = this.graph.inEdges.get(id) || []
                if (inEdges.length > 0) continue

                // 3. Class name matches a known entry-point pattern
                //    (Provider, Plugin, Extension, Controller, Handler, Tab...)
                if (ENTRY_POINT_PATTERNS.some(p => p.test(cls.name))) continue

                // 4. File is a framework entry point (.mjs, /pages/, /components/, etc.)
                if (FRAMEWORK_ENTRY_PATTERNS.some(p => p.test(cls.file))) continue

                // 5. File is a test or script file
                if (TEST_PATTERNS.some(p => p.test(cls.file))) continue
                if (SCRIPT_PATTERNS.some(p => p.test(cls.file))) continue

                // 6. Semantic-role classifier marks the file as dead-code-exempt
                if (this._classifier.isFileDeadCodeExempt(cls.file)) continue

                // 7. Methods of this class are called anywhere in the graph
                //    (class is instantiated dynamically — e.g. plugin runtimes)
                const methodPrefix = cls.name + '.'
                const hasMethodCallers = Object.values(this.lock.functions).some(
                    fn => fn.name?.startsWith(methodPrefix) && (fn.calledBy?.length ?? 0) > 0
                )
                if (hasMethodCallers) continue

                const entry: DeadCodeEntry = {
                    id,
                    name: cls.name,
                    file: cls.file,
                    moduleId,
                    type: 'class',
                    reason: 'Class has no importers and is not exported',
                    confidence: this.filesWithUnresolvedImports.has(cls.file) ? 'medium' : 'high',
                }
                dead.push(entry)
                byModule[moduleId].dead++
                byModule[moduleId].items.push(entry)
            }
        }

        return {
            deadFunctions: dead,
            totalFunctions,
            deadCount: dead.length,
            deadPercentage: totalFunctions > 0
                ? Math.round((dead.length / totalFunctions) * 1000) / 10
                : 0,
            byModule,
        }
    }

    private isExempt(
        fn: MikkLock['functions'][string],
        id: string,
        name: string,
        file: string,
        isExported: boolean,
    ): boolean {
        if (this._classifier.isFileDeadCodeExempt(file)) return true
        if (isExported) return true
        if (this.hasGraphCallers(id, name, file)) return true
        if (this.hasCalledByInLock(fn)) return true
        if (ENTRY_POINT_PATTERNS.some(p => p.test(name))) return true
        if (this.routeHandlers.has(name)) return true
        if (TEST_PATTERNS.some(p => p.test(name) || p.test(file))) return true
        if (SCRIPT_PATTERNS.some(p => p.test(file))) return true
        if (CONSTRUCTOR_PATTERNS.some(p => p.test(name))) return true
        if (FRAMEWORK_PATTERNS.some(p => p.test(name))) return true
        if (this.isReactComponent(name)) return true
        if (this.isCalledByExportedInSameFile(fn, id)) return true
        if (this.isMethodOfUsedClass(fn, name, file)) return true
        if (this.isFrameworkEntryPoint(file, name)) return true
        if (this.isFrameworkEntry(file)) return true

        return false
    }

    private hasGraphCallers(id: string, name: string, file: string): boolean {
        const candidates = [
            id,
            name,
            `fn:${file}:${name}`,
            file + ':' + name,
        ]

        for (const candidate of candidates) {
            const inEdges = this.graph.inEdges.get(candidate)
            if (inEdges?.some(e => e.type === 'calls')) return true
        }

        const fn = this.lock.functions[id]
        if (fn?.calledBy?.length) return true

        return false
    }

    private isReactComponent(name: string): boolean {
        if (!name || name.length < 2) return false
        if (!/^[A-Z]/.test(name)) return false
        if (name.includes('.') || name.includes('/') || name.includes('\\')) return false
        if (name.includes(':') || name.includes('#')) return false
        if (/^[A-Z][a-z]/.test(name)) return true
        if (/^[A-Z][A-Z]/.test(name)) return true
        return false
    }

    private isCalledByExportedInSameFile(fn: MikkLock['functions'][string] | undefined, id: string): boolean {
        if (!fn) return false
        const file = fn.file
        if (!file) return false

        return this.isReachableFromExported(fn, id, file)
    }

    private hasCalledByInLock(fn: MikkLock['functions'][string]): boolean {
        if (!fn.calledBy || fn.calledBy.length === 0) return false

        for (const callerId of fn.calledBy) {
            const caller = this.lock.functions[callerId]
            if (!caller) continue
            if (caller.isExported) return true
            if (this.hasGraphCallers(callerId, caller.name, caller.file)) return true
        }

        return false
    }

    private isReachableFromExported(
        startFn: MikkLock['functions'][string],
        startId: string,
        file: string,
        requireExported: boolean = true
    ): boolean {
        const visited = new Set<string>()
        const queue: string[] = [startId]
        const maxDepth = 50
        let head = 0

        let depth = 0
        while (head < queue.length && depth < maxDepth) {
            const levelSize = queue.length - head
            for (let i = 0; i < levelSize; i++) {
                const currentId = queue[head++]!
                if (visited.has(currentId)) continue
                visited.add(currentId)

                const current = this.lock.functions[currentId]
                if (!current) continue

                for (const callerId of current.calledBy || []) {
                    if (visited.has(callerId)) continue
                    const caller = this.lock.functions[callerId]
                    if (!caller) continue
                    if (caller.file !== file) {
                        queue.push(callerId)
                        continue
                    }
                    if (caller.isExported) return true
                    if (!requireExported) return true
                    queue.push(callerId)
                }

                const callerEdges = this.graph.inEdges.get(currentId) || []
                for (const edge of callerEdges) {
                    if (edge.type !== 'calls') continue
                    if (visited.has(edge.from)) continue
                    const caller = this.lock.functions[edge.from]
                    if (!caller) continue
                    if (caller.file !== file) {
                        queue.push(edge.from)
                        continue
                    }
                    if (caller.isExported) return true
                    if (!requireExported) return true
                    queue.push(edge.from)
                }
            }
            depth++
        }
        return false
    }

    private isMethodOfUsedClass(fn: MikkLock['functions'][string], name: string, file: string): boolean {
        const fileClasses = this.allClasses.get(file)
        if (!fileClasses || fileClasses.length === 0) return false

        // Check all classes in this file (not just the last one)
        for (const classInfo of fileClasses) {
            const inEdges = this.graph.inEdges.get(`class:${file}:${classInfo.name}`) || []
            if (inEdges.length > 0) return true
        }

        for (const [clsId, cls] of Object.entries(this.lock.classes || {}) as [string, MikkLockClass][]) {
            if (cls.file !== file) continue
            const clsInEdges = this.graph.inEdges.get(clsId) || []
            if (clsInEdges.length > 0) return true
        }

        return false
    }

    private buildClassIndex(): Map<string, MikkLockClass[]> {
        const index = new Map<string, MikkLockClass[]>()
        if (!this.lock.classes) return index

        for (const [_id, cls] of Object.entries(this.lock.classes as Record<string, MikkLockClass>)) {
            const existing = index.get(cls.file) ?? []
            existing.push(cls)
            index.set(cls.file, existing)
        }
        return index
    }

    private isFrameworkEntryPoint(file: string, name: string): boolean {
        const frameworkExports = [
            /^Page$/,
            /^Layout$/,
            /^default$/,
            /^(getServerSideProps|getStaticProps|generateMetadata|generateViewport)$/,
        ]

        return frameworkExports.some(p => p.test(name))
    }

    private isFrameworkEntry(file: string): boolean {
        return FRAMEWORK_ENTRY_PATTERNS.some(p => p.test(file))
    }

    private computeConfidence(fn: MikkLock['functions'][string], name: string, file: string): DeadCodeConfidence {
        if (DYNAMIC_USAGE_PATTERNS.some(p => p.test(name))) return 'low'
        if (fn.calledBy?.length) return 'medium'
        if (this.filesWithUnresolvedImports.has(file)) return 'medium'
        return 'high'
    }

    private computeReason(fn: MikkLock['functions'][string]): string {
        if (fn.calledBy?.length) {
            return `${fn.calledBy.length} reference(s) in lock but no active call edges in graph`
        }
        return 'No callers found in graph'
    }

    private buildUnresolvedImportFileSet(): Set<string> {
        const result = new Set<string>()
        if (!this.lock.files) return result

        for (const [filePath, fileInfo] of Object.entries(this.lock.files as Record<string, MikkLockFile>)) {
            const imports = fileInfo.imports ?? []
            for (const imp of imports) {
                if (!imp.resolvedPath || imp.resolvedPath === '') {
                    result.add(filePath)
                    break
                }
            }
        }
        return result
    }
}
