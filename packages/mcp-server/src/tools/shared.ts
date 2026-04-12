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
import { SemanticSearcher } from '@getmikk/intent-engine'

// ─── Constants ───────────────────────────────────────────────────────────────
export const MAX_CACHE_SIZE = 500
export const MAX_SOURCE_FILE_BYTES = 2 * 1024 * 1024
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
    const fullPath = path.join(projectRoot, fn.file)
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
    return id.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^[0-9]/, '_$&')
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
export function _tok(o: unknown): number { return Math.max(1, Math.round(JSON.stringify(o).length / _CPT)) }
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

// ─── Semantic Searcher Singletons ─────────────────────────────────────────────
export const semanticSearchers = new Map<string, SemanticSearcher>()
export function getSemanticSearcher(projectRoot: string): SemanticSearcher {
    let s = semanticSearchers.get(projectRoot)
    if (!s) {
        if (semanticSearchers.size >= MAX_SEARCHER_ROOTS) {
            const k = semanticSearchers.keys().next().value
            if (k !== undefined) semanticSearchers.delete(k)
        }
        s = new SemanticSearcher(projectRoot); semanticSearchers.set(projectRoot, s)
    }
    return s
}

// ─── isTrackedByLock ─────────────────────────────────────────────────────────
export function isTrackedByLock(lock: MikkLock, projectRoot: string, resolvedPath: string): boolean {
    const rootResolved = path.resolve(projectRoot)
    const normalizedResolved = path.resolve(resolvedPath).replace(/\\/g, '/').toLowerCase()
    const rel = path.relative(rootResolved, resolvedPath).replace(/\\/g, '/')
    const normalizedRel = rel.toLowerCase()
    if (normalizedRel in lock.files) return true
    for (const key of Object.keys(lock.files)) {
        const normalizedKey = key.replace(/\\/g, '/').toLowerCase()
        if (normalizedKey === normalizedRel || normalizedKey === normalizedResolved) return true
    }
    for (const info of Object.values(lock.files)) {
        const filePath = (info.path || '').replace(/\\/g, '/').toLowerCase()
        if (filePath === normalizedResolved || filePath === normalizedRel) return true
    }
    return false
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
async function isGitWorktree(projectRoot: string): Promise<boolean> {
    try {
        const stdout = await new Promise<string>((resolve, reject) => {
            execFile('git', ['rev-parse', '--is-inside-work-tree'], { cwd: projectRoot, encoding: 'utf-8' }, (err, out) => {
                if (err) return reject(err); resolve(out)
            })
        })
        return stdout.trim() === 'true'
    } catch { return false }
}

async function getGitTopLevel(projectRoot: string): Promise<string | null> {
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
    const syncStatus = lock.syncState?.status ?? 'unknown'
    let staleness: string | null = null
    if (syncStatus === 'stale') staleness = 'WARNING: Lock file is stale. Run `mikk analyze` to update.'
    else if (syncStatus === 'unknown') staleness = 'NOTE: Sync status unknown. Run `mikk analyze` for accurate results.'
    const graph = buildGraphFromLock(lock)
    evictProjectCache()
    const entry: CachedProject = { contract, lock, graph, staleness, cachedAt: Date.now() }
    projectCache.set(projectRoot, entry)
    touchProjectCache(projectRoot)
    return { contract, lock, graph, staleness }
}
