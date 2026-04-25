/**
 * shared.ts — Infrastructure shared across all tool files.
 * Exports: cache utilities, token tracking, project cache, helpers.
 */
import * as path from 'node:path'
import * as fs from 'node:fs/promises'
import * as fsSync from 'node:fs'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
    ContractReader, LockReader,
    ImpactAnalyzer,
    BoundaryChecker,
    type MikkContract, type MikkLock,
    type DependencyGraph,
    GraphBuilder,
} from '@getmikk/core'
import { SemanticSearcher, EmbeddingManager } from '@getmikk/intent-engine'
import PQueue from 'p-queue'

// ─── Observability ───────────────────────────────────────────────────────────
export const Logger = {
    event(name: string, data: Record<string, any>) {
        console.error(JSON.stringify({
            timestamp: new Date().toISOString(),
            level: 'INFO',
            event: name,
            ...data
        }))
    },
    error(name: string, err: any, data: Record<string, any> = {}) {
        console.error(JSON.stringify({
            timestamp: new Date().toISOString(),
            level: 'ERROR',
            event: name,
            message: err instanceof Error ? err.message : String(err),
            stack: err instanceof Error ? err.stack : undefined,
            ...data
        }))
    }
}

// ─── Constants ───────────────────────────────────────────────────────────────
export const MAX_CACHE_SIZE = 500
export const MAX_SOURCE_FILE_BYTES = 20 * 1024 * 1024
export const MAX_WALK_DIR_DEPTH = 10
export const MAX_WALK_FILES = 10_000
export const MAX_QUERY_HOPS = 12
export const MAX_QUERY_TOKEN_BUDGET = 20_000
export const MAX_SEARCHER_ROOTS = 5
export const CACHE_TTL_MS = 30_000
export const MAX_PROJECT_CACHE = 10
export const _CPT = 4
export const _ALC = 42
export const MIN_TOKEN_BUDGET = 200
export const MAX_TOKEN_BUDGET = 10_000

export const TIMEOUTS = {
    SEMANTIC_SEARCH: 5000,
    INDEX_PROJECT: 60000,
    TAINT_ANALYSIS: 20000,
    DEFAULT: 10000
}

/**
 * Execute a task with a timeout.
 */
export async function withTimeout<T>(promise: Promise<T>, ms: number, taskName: string): Promise<T> {
    let timeoutId: any
    const timeoutPromise = new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(`Timeout: ${taskName} exceeded ${ms}ms`)), ms)
    })
    try {
        const result = await Promise.race([promise, timeoutPromise])
        clearTimeout(timeoutId)
        return result
    } catch (err) {
        clearTimeout(timeoutId)
        throw err
    }
}

/**
 * Improved token estimator.
 */
export function _tok(o: unknown): number {
    const s = JSON.stringify(o)
    if (!s) return 1
    let nonAscii = 0
    const sample = s.length > 512 ? s.slice(0, 512) : s
    for (let i = 0; i < sample.length; i++) {
        if (sample.charCodeAt(i) > 127) nonAscii++
    }
    if (nonAscii === 0) return Math.max(1, Math.round(s.length / _CPT))
    const ratio = nonAscii / sample.length
    const charsPerToken = _CPT * (1 - ratio) + 1.5 * ratio
    return Math.max(1, Math.round(s.length / charsPerToken))
}

// ─── File Content Cache ───────────────────────────────────────────────────────
export const fileContentCache = new Map<string, string>()

export function cacheFileContent(fullPath: string, content: string): void {
    if (fileContentCache.size >= MAX_CACHE_SIZE) {
        const firstKey = fileContentCache.keys().next().value
        if (firstKey) fileContentCache.delete(firstKey)
    }
    fileContentCache.set(fullPath, content)
}

export function getFunctionBody(fn: { file: string; startLine: number; endLine: number }, projectRoot: string): string {
    const fullPath = path.isAbsolute(fn.file) ? fn.file : path.join(projectRoot, fn.file)
    let content = fileContentCache.get(fullPath)
    if (!content) {
        try {
            const rawContent = fsSync.readFileSync(fullPath, 'utf-8')
            if (rawContent) { cacheFileContent(fullPath, rawContent); content = rawContent }
        } catch { return '' }
    }
    if (!content) return ''
    const lines = content.split('\n')
    return lines.slice(Math.max(0, fn.startLine - 1), Math.min(lines.length, fn.endLine)).join('\n')
}

export function sanitizeMermaidId(id: string): string {
    return id.replace(/[:/\\.#*@<>\[\]{}()]/g, '_').replace(/^[0-9]/, '_$&')
}

/**
 * Heuristic detector for dynamic dispatch and potential call graph incompleteness.
 */
export function checkForIncompleteness(body: string): string[] {
    const warnings: string[] = []
    if (body.includes('eval(')) warnings.push('Symbol uses "eval()" — call graph is incomplete.')
    // T39 fix: also match optional chaining bracket calls: obj[key]?()
    if (body.includes('[') && (/\[[^\]]+\]\s*\(/.test(body) || /\[[^\]]+\]\s*\?\.\s*\(/.test(body))) warnings.push('Symbol uses bracket call dispatch (obj[key]()) — call graph is incomplete.')
    if (body.includes('require(') && !/require\s*\(\s*['"]/.test(body) && /require\s*\([^)]+\)/.test(body)) warnings.push('Symbol uses dynamic require() — dependencies are incomplete.')
    if (body.includes('Reflect.') || body.includes('.apply(') || body.includes('.call(')) warnings.push('Symbol uses dynamic reflection (Reflect/apply/call) — call graph may be incomplete.')
    if (body.includes('new Function(')) warnings.push('Symbol uses "new Function()" — call graph is incomplete.')
    return warnings
}

/**
 * Shannon Entropy calculation for secret detection.
 */
export function calculateEntropy(str: string): number {
    const len = str.length
    if (len === 0) return 0
    const freqs: Record<string, number> = {}
    for (let i = 0; i < len; i++) {
        const char = str[i]
        freqs[char] = (freqs[char] || 0) + 1
    }
    let entropy = 0
    for (const char in freqs) {
        const p = freqs[char] / len
        entropy -= p * Math.log2(p)
    }
    return entropy
}

export function isSourceFile(filePath: string): boolean {
    return ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.go', '.py'].includes(path.extname(filePath))
}

export function isPathWithinProject(filePath: string, projectRoot: string): boolean {
    const normalizedFile = path.normalize(filePath).replace(/\\/g, '/')
    const normalizedRoot = path.normalize(projectRoot).replace(/\\/g, '/')
    return normalizedFile.startsWith(normalizedRoot + '/') || normalizedFile === normalizedRoot
}

// ─── Token Tracking ──────────────────────────────────────────────────────────
export interface TokenTally { calls: number; used: number; raw: number; saved: number; start: number }
export interface TokenLockLike { functions: Record<string, { file: string; endLine: number }> }
export const _tallies = new Map<string, TokenTally>()
export function _tally(r: string): TokenTally {
    let t = _tallies.get(r)
    if (!t) { t = { calls: 0, used: 0, raw: 0, saved: 0, start: Date.now() }; _tallies.set(r, t) }
    return t
}
export function _fileTok(lock: TokenLockLike, fp: string): number {
    const fs2 = Object.values(lock.functions).filter(f => f.file === fp)
    const ln = fs2.length > 0 ? Math.max(...fs2.map(f => f.endLine)) : 80
    return Math.round((ln * _ALC) / _CPT)
}
export function _filesTok(lock: TokenLockLike, fps: string[]): number { return fps.reduce((s, f) => s + _fileTok(lock, f), 0) }
export function _clampBudget(budget?: number): number {
    const b = typeof budget === 'number' && Number.isFinite(budget) ? Math.round(budget) : 1200
    return Math.min(MAX_TOKEN_BUDGET, Math.max(MIN_TOKEN_BUDGET, b))
}

export function _compactImpacted<T>(items: T[], base: unknown, budget: number, floor = 5): { items: T[]; minimized: boolean; estimatedTokens: number } {
    if (items.length === 0) return { items, minimized: false, estimatedTokens: _tok(base) }
    let keep = items.length
    let candidate = items.slice(0, keep)
    let probe = { ...(base as any), impacted: candidate }
    let est = _tok(probe)
    if (est <= budget) return { items: candidate, minimized: false, estimatedTokens: est }
    while (est > budget && keep > floor) {
        keep = Math.max(floor, Math.floor(keep * 0.7))
        candidate = items.slice(0, keep)
        probe = { ...(base as any), impacted: candidate }
        est = _tok(probe)
        if (keep === floor) break
    }
    return { items: candidate, minimized: true, estimatedTokens: est }
}
export function _track(root: string, raw: number, resp: unknown): Record<string, number> {
    const used = _tok(resp); const saved = Math.max(0, raw - used); const t = _tally(root)
    t.calls++; t.used += used; t.raw += raw; t.saved += saved
    return { used, raw, saved, sessionSaved: t.saved, sessionCalls: t.calls }
}

// ─── Project Cache ────────────────────────────────────────────────────────────
export interface CachedProject {
    contract: MikkContract; lock: MikkLock; graph: DependencyGraph; staleness: string | null; cachedAt: number
}
export const projectCache = new Map<string, CachedProject>()
const projectCacheOrder: string[] = []

export function evictProjectCache(): void {
    if (projectCache.size >= MAX_PROJECT_CACHE) {
        const oldest = projectCacheOrder.shift()
        if (oldest) projectCache.delete(oldest)
    }
}
export function touchProjectCache(projectRoot: string): void {
    const idx = projectCacheOrder.indexOf(projectRoot)
    if (idx > -1) projectCacheOrder.splice(idx, 1)
    projectCacheOrder.push(projectRoot)
}
export function invalidateCache(projectRoot: string): void { projectCache.delete(projectRoot) }

// ─── Circuit Breaker for Semantic Search (T30) ───────────────────────────────
// Trips after CIRCUIT_FAILURE_THRESHOLD failures within CIRCUIT_WINDOW_MS.
// While open, immediately returns false from isCircuitClosed().
// Auto-resets after CIRCUIT_RESET_MS (half-open probe).
const CIRCUIT_FAILURE_THRESHOLD = 3
const CIRCUIT_WINDOW_MS = 30_000
const CIRCUIT_RESET_MS = 60_000

interface CircuitState { failures: number[]; openedAt: number | null }
const circuitBreakers = new Map<string, CircuitState>()

function getCircuit(key: string): CircuitState {
    if (!circuitBreakers.has(key)) circuitBreakers.set(key, { failures: [], openedAt: null })
    return circuitBreakers.get(key)!
}

export function isCircuitClosed(key: string): boolean {
    const c = getCircuit(key)
    if (c.openedAt !== null) {
        if (Date.now() - c.openedAt > CIRCUIT_RESET_MS) {
            // Half-open: allow one probe
            c.openedAt = null; c.failures = []
            return true
        }
        return false // Circuit open — reject immediately
    }
    return true
}

export function recordCircuitSuccess(key: string): void {
    const c = getCircuit(key)
    c.failures = []; c.openedAt = null
}

export function recordCircuitFailure(key: string): void {
    const c = getCircuit(key)
    const now = Date.now()
    c.failures = c.failures.filter(t => now - t < CIRCUIT_WINDOW_MS)
    c.failures.push(now)
    if (c.failures.length >= CIRCUIT_FAILURE_THRESHOLD) {
        c.openedAt = now
        Logger.error('circuit_breaker_opened', new Error(`Circuit opened for ${key}`), { key, failures: c.failures.length })
    }
}

// Concurrency control & backpressure for MCP tools
const PQueueClass = (PQueue as any).default || PQueue
export const requestQueue = new PQueueClass({ concurrency: 10 })

export const PRIORITIES = {
    SEARCH: 10,
    STANDARD: 5,
    INDEXING: 0
}

export function getSemanticSearcher(projectRoot: string): SemanticSearcher {
    const manager = EmbeddingManager.getInstance()
    return (manager as any).searchers.get(projectRoot) || new SemanticSearcher(projectRoot)
}

export async function indexSemanticSearcherIfStale(
    projectRoot: string,
    lock: MikkLock,
    _searcher?: SemanticSearcher
): Promise<void> {
    const start = Date.now()
    try {
        await requestQueue.add(async () => {
            await EmbeddingManager.getInstance().getSearcher(projectRoot, lock)
        }, { priority: PRIORITIES.INDEXING })
        Logger.event('embedding_indexed', { projectRoot, latency_ms: Date.now() - start })
    } catch (err) {
        Logger.error('embedding_index_failed', err, { projectRoot, latency_ms: Date.now() - start })
        throw err
    }
}

// ─── isTrackedByLock ─────────────────────────────────────────────────────────
export function isTrackedByLock(lock: MikkLock, projectRoot: string, resolvedPath: string): boolean {
    const rootResolved = path.resolve(projectRoot)
    const normalizedResolved = path.resolve(resolvedPath).replace(/\\/g, '/').toLowerCase()
    const rel = path.relative(rootResolved, resolvedPath).replace(/\\/g, '/')
    const normalizedRel = rel.toLowerCase()

    const normalizedKeys = new Set<string>()
    for (const key of Object.keys(lock.files)) {
        normalizedKeys.add(key.replace(/\\/g, '/').toLowerCase())
    }
    for (const info of Object.values(lock.files)) {
        if (info.path) normalizedKeys.add(info.path.replace(/\\/g, '/').toLowerCase())
    }

    return normalizedKeys.has(normalizedRel) || normalizedKeys.has(normalizedResolved)
}

// ─── buildGraphFromLock ───────────────────────────────────────────────────────
export function buildGraphFromLock(lock: MikkLock): DependencyGraph {
    const builder = new GraphBuilder()
    return builder.buildFromLock(lock)
}

// ─── detectCircularDeps ───────────────────────────────────────────────────────
export function detectCircularDeps(fns: any[], lock: MikkLock): string[] {
    const warnings: string[] = []
    for (const fn of fns) {
        const visited = new Set<string>()
        const stack = new Set<string>()
        const cyclePath: string[] = []
        const dfs = (id: string): boolean => {
            if (stack.has(id)) {
                const cycleStart = cyclePath.indexOf(id)
                const cycle = cyclePath.slice(cycleStart).map(cid => lock.functions[cid]?.name ?? cid)
                cycle.push(lock.functions[id]?.name ?? id)
                warnings.push(`WARNING: Circular: ${cycle.join(' -> ')}`)
                return true
            }
            if (visited.has(id)) return false
            visited.add(id); stack.add(id); cyclePath.push(id)
            const callee = lock.functions[id]
            if (callee) { for (const callId of callee.calls) { if (dfs(callId)) return true } }
            stack.delete(id); cyclePath.pop()
            return false
        }
        dfs(fn.id)
    }
    return [...new Set(warnings)]
}

// ─── walkDir ──────────────────────────────────────────────────────────────────
export async function walkDir(dir: string, projectRoot: string, depth = 0, acc: string[] = []): Promise<string[]> {
    if (depth > MAX_WALK_DIR_DEPTH || acc.length >= MAX_WALK_FILES) return acc
    try {
        const entries = await fs.readdir(dir, { withFileTypes: true })
        for (const entry of entries) {
            if (acc.length >= MAX_WALK_FILES) break
            const fullPath = path.join(dir, entry.name)
            if (entry.isSymbolicLink()) continue
            if (entry.isDirectory()) {
                if (['node_modules', '.git', 'dist', '.mikk'].includes(entry.name)) continue
                await walkDir(fullPath, projectRoot, depth + 1, acc)
            } else {
                acc.push(path.relative(projectRoot, fullPath).replace(/\\/g, '/'))
            }
        }
    } catch { /* permission error */ }
    return acc
}

// ─── quickHashFile ────────────────────────────────────────────────────────────
export async function quickHashFile(filePath: string): Promise<string> {
    let handle: Awaited<ReturnType<typeof fs.open>> | null = null
    try {
        handle = await fs.open(filePath, 'r')
        const buf = Buffer.alloc(8192)
        const { bytesRead } = await handle.read(buf, 0, 8192, 0)
        return createHash('sha256').update(buf.subarray(0, bytesRead)).digest('hex').slice(0, 16)
    } catch { return 'unreadable' }
    finally { if (handle) { try { await handle.close() } catch { /* best-effort */ } } }
}

// ─── Git helpers ──────────────────────────────────────────────────────────────
export async function isGitWorktree(projectRoot: string): Promise<boolean> {
    try {
        const stdout = await new Promise<string>((resolve, reject) => {
            execFile('git', ['rev-parse', '--is-inside-work-tree'], { cwd: projectRoot, encoding: 'utf-8' }, (err, out) => {
                if (err) return reject(err); resolve(out)
            })
        })
        return stdout.trim() === 'true'
    } catch { return false }
}

export async function getGitTopLevel(projectRoot: string): Promise<string | null> {
    try {
        const stdout = await new Promise<string>((resolve, reject) => {
            execFile('git', ['rev-parse', '--show-toplevel'], { cwd: projectRoot, encoding: 'utf-8' }, (err, out) => {
                if (err) return reject(err); resolve(out)
            })
        })
        return path.resolve(stdout.trim())
    } catch { return null }
}

export async function getDirtySampleFiles(projectRoot: string, sampleFiles: string[]): Promise<string[] | null> {
    if (sampleFiles.length === 0) return []
    if (!(await isGitWorktree(projectRoot))) return null
    const topLevel = await getGitTopLevel(projectRoot)
    if (!topLevel || path.resolve(projectRoot) !== topLevel) return []
    try {
        const stdout = await new Promise<string>((resolve, reject) => {
            execFile('git', ['status', '--porcelain', '--', ...sampleFiles], { cwd: projectRoot, encoding: 'utf-8', maxBuffer: 1024 * 1024 }, (err, out) => {
                if (err) return reject(err); resolve(out)
            })
        })
        return stdout.split('\n').map(l => l.trim()).filter(Boolean)
            .map(line => { const m = line.match(/^[ MARCUD?!]{1,2}\s+(.+)$/); return (m?.[1] || '').replace(/\\/g, '/') })
            .filter(Boolean)
    } catch { return null }
}

// ─── parseDiffHunks ───────────────────────────────────────────────────────────
export function parseDiffHunks(diff: string): { file: string; changedLines: number[]; isNew: boolean; isDeleted: boolean }[] {
    const files = new Map<string, { changedLines: number[]; isNew: boolean; isDeleted: boolean }>()
    let currentFile = ''; let nextIsNew = false
    for (const line of diff.split('\n')) {
        if (line.startsWith('--- ') && line.includes('/dev/null')) { nextIsNew = true }
        else if (line.startsWith('+++ ')) {
            currentFile = line.slice(6)
            if (currentFile !== '/dev/null' && !files.has(currentFile)) files.set(currentFile, { changedLines: [], isNew: nextIsNew, isDeleted: false })
            if (currentFile === '/dev/null') { const prev = [...files.keys()].pop(); if (prev) files.get(prev)!.isDeleted = true }
            nextIsNew = false
        } else if (line.startsWith('@@ ') && currentFile && files.has(currentFile)) {
            const m = line.match(/@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/)
            if (m) {
                const start = parseInt(m[1], 10); const count = parseInt(m[2] ?? '1', 10)
                const entry = files.get(currentFile)!
                for (let i = 0; i < count; i++) entry.changedLines.push(start + i)
            }
        }
    }
    return [...files.entries()].map(([file, data]) => ({ file, ...data }))
}

// ─── buildStalenessMetadata (T36/T45) ────────────────────────────────────────
// Lightweight O(n-files) mtime check. Compares current disk mtimes against
// the timestamp stored in the lock file. Reports # files modified since last index.
export async function buildStalenessMetadata(
    projectRoot: string,
    lock: MikkLock
): Promise<{ lastIndexed: string | null; modifiedFilesSinceIndex: number; fresh: boolean; hint?: string }> {
    const indexedAt: number = (lock as any).indexedAt ?? (lock as any).syncState?.indexedAt ?? 0
    if (!indexedAt) {
        return { lastIndexed: null, modifiedFilesSinceIndex: 0, fresh: true }
    }

    let modifiedCount = 0
    const trackedFiles = Object.keys(lock.files ?? {})
    // Sample up to 200 files for speed — enough to detect drift without O(n) on huge repos
    const sampleSize = Math.min(trackedFiles.length, 200)
    const sample = sampleSize < trackedFiles.length
        ? trackedFiles.sort(() => 0.5 - Math.random()).slice(0, sampleSize)
        : trackedFiles

    await Promise.all(sample.map(async (relFile) => {
        try {
            const absPath = path.isAbsolute(relFile) ? relFile : path.join(projectRoot, relFile)
            const stat = await fs.stat(absPath)
            if (stat.mtimeMs > indexedAt) modifiedCount++
        } catch { /* file deleted */ modifiedCount++ }
    }))

    // Scale sample count to full file list
    const estimatedModified = sampleSize < trackedFiles.length
        ? Math.round((modifiedCount / sampleSize) * trackedFiles.length)
        : modifiedCount

    const fresh = estimatedModified === 0
    const lastIndexed = new Date(indexedAt).toISOString()

    return {
        lastIndexed,
        modifiedFilesSinceIndex: estimatedModified,
        fresh,
        ...(fresh ? {} : { hint: `${estimatedModified} file(s) modified since last index. Run mikk_index_project to pick up changes.` })
    }
}

// ─── loadContractAndLock ──────────────────────────────────────────────────────
export async function loadContractAndLock(projectRoot: string) {
    const lockFilePath = path.join(projectRoot, 'mikk.lock.json')
    const cached = projectCache.get(projectRoot)
    if (cached) {
        try {
            const stat = await fs.stat(lockFilePath)
            if (stat.mtimeMs > cached.cachedAt) { invalidateCache(projectRoot) }
            else if ((Date.now() - cached.cachedAt) < CACHE_TTL_MS) {
                touchProjectCache(projectRoot)
                return { contract: cached.contract, lock: cached.lock, staleness: cached.staleness }
            }
        } catch { invalidateCache(projectRoot) }
    }
    const contractReader = new ContractReader()
    const lockReader = new LockReader()
    const contract = await contractReader.read(path.join(projectRoot, 'mikk.json'))
    const lock = await lockReader.read(lockFilePath)
    const syncStatus = lock.syncState?.status ?? 'clean'
    let staleness: string | null = null
    if (syncStatus === 'drifted') staleness = 'WARNING: Lock file has drifted from source. Run `mikk analyze` to update.'
    else if (syncStatus === 'syncing') staleness = 'NOTE: Project is currently being indexed. Results may be partial.'
    const graph = buildGraphFromLock(lock)
    evictProjectCache()
    const entry: CachedProject = { contract, lock, graph, staleness, cachedAt: Date.now() }
    projectCache.set(projectRoot, entry)
    touchProjectCache(projectRoot)
    return { contract, lock, graph, staleness }
}
