import * as path from 'node:path'
import * as fs from 'node:fs/promises'
import * as fsSync from 'node:fs'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { BoundaryChecker } from '@getmikk/core'
import {
    loadContractAndLock, _ALC, _CPT, _track, _tally,
    getDirtySampleFiles, quickHashFile, requestQueue, PRIORITIES
} from './shared.js'

export function registerSessionTools(server: McpServer, projectRoot: string) {

    server.tool(
        'mikk_get_session_context',
        'CALL THIS FIRST. One-shot session onboarding: project overview + constraint status + hot modules + recently modified files + active decisions. AFTER THIS: Use mikk_query_context with your task, or mikk_get_changes for drift details.',
        { projectRoot: z.string().optional().describe('Override project root (default: server start directory)') },
        async (args: any): Promise<any> => {
            return requestQueue.add(async () => {
                const effectiveRoot = (args as any)?.projectRoot || projectRoot
                const { contract, lock, staleness } = await loadContractAndLock(effectiveRoot)
                const modules = contract.declared.modules.map(mod => {
                    const fns = Object.values(lock.functions).filter(f => f.moduleId === mod.id)
                    return { id: mod.id, name: mod.name, functions: fns.length, exported: fns.filter(f => f.isExported).length }
                })
                const fileEntries = Object.entries(lock.files)
                const sampleSize = Math.min(fileEntries.length, 20)
                const sampleFiles = fileEntries.slice(0, sampleSize).map(([p]) => p.replace(/\\/g, '/'))
                const dirtyFiles = await getDirtySampleFiles(effectiveRoot, sampleFiles)
                const modifiedFiles: string[] = []
                let changedCount = 0
                if (dirtyFiles !== null) {
                    for (const f of dirtyFiles) modifiedFiles.push(f)
                    changedCount = dirtyFiles.length
                } else {
                    for (let i = 0; i < sampleSize; i++) {
                        const [filePath, fileInfo] = fileEntries[i]
                        const absPath = path.isAbsolute(filePath) ? filePath : path.join(effectiveRoot, filePath)
                        try {
                            const stat = await fs.stat(absPath)
                            const lockDate = new Date(fileInfo.lastModified || 0)
                            if (stat.mtime > lockDate) { modifiedFiles.push(filePath); changedCount++ }
                        } catch { changedCount++ }
                    }
                }
                const moduleChanges = new Map<string, number>()
                for (const f of modifiedFiles) {
                    const info = lock.files[f]
                    if (info?.moduleId) moduleChanges.set(info.moduleId, (moduleChanges.get(info.moduleId) ?? 0) + 1)
                }
                const hotModules = [...moduleChanges.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id, changes]) => ({ id, changes }))
                const checker = new BoundaryChecker(contract, lock)
                const boundaryResult = checker.check()
                const response = {
                    project: contract.project,
                    summary: {
                        totalFunctions: Object.keys(lock.functions).length,
                        totalFiles: Object.keys(lock.files).length,
                        totalModules: modules.length,
                        constraintViolations: boundaryResult.violations.length,
                        constraintsPass: boundaryResult.pass,
                        estimatedChanges: changedCount,
                    },
                    modules, hotModules,
                    recentlyModified: modifiedFiles.slice(0, 10),
                    constraints: contract.declared.constraints,
                    decisions: contract.declared.decisions.slice(0, 5),
                    warning: staleness,
                    hint: changedCount > 0
                        ? `${changedCount} file(s) may have changed. Run \`mikk analyze\` to update.`
                        : 'Codebase in sync. Use mikk_query_context with your task to start.',
                }
                const _rawSC = Math.min(20, Object.keys(lock.files).length) * Math.round((100 * _ALC) / _CPT)
                    ; (response as any).tokens = _track(effectiveRoot, _rawSC, response)
                return { content: [{ type: 'text' as const, text: JSON.stringify(response, null, 2) }] }
            }, { priority: PRIORITIES.STANDARD })
        },
    )

    server.tool(
        'mikk_token_stats',
        'Show token savings for this session — how many tokens Mikk saved vs raw file reads. Useful at session end to review cumulative efficiency.',
        { projectRoot: z.string().optional() },
        async (args: any) => {
            const effectiveRoot = (args as any)?.projectRoot || projectRoot
            const t = _tally(effectiveRoot)
            const { lock } = await loadContractAndLock(effectiveRoot)
            const totalFileLine = Object.values(lock.functions).reduce((s, f) => s + (f.endLine - f.startLine + 1), 0)
            const fullCodebaseTok = Math.round((totalFileLine * _ALC) / _CPT)
            const elapsedMin = Math.round((Date.now() - t.start) / 60000)
            const response = {
                session: { calls: t.calls, elapsedMinutes: elapsedMin },
                tokens: {
                    used: t.used,
                    rawWouldHaveCost: t.raw,
                    saved: t.saved,
                    savingsPercent: t.raw > 0 ? Math.round((t.saved / t.raw) * 100) : 0,
                },
                context: {
                    fullCodebaseTokens: fullCodebaseTok,
                    percentOfCodebaseRead: t.raw > 0 ? Math.round((t.used / fullCodebaseTok) * 100) : 0,
                },
                interpretation: t.saved > 0
                    ? `Mikk saved ~${t.saved.toLocaleString()} tokens (${Math.round((t.saved / t.raw) * 100)}% reduction). ~${Math.round(t.saved / 1000)}k tokens.`
                    : 'No tools called yet this session.',
            }
            return { content: [{ type: 'text' as const, text: JSON.stringify(response, null, 2) }] }
        },
    )

    server.tool(
        'mikk_get_changes',
        'Detect files added, modified, and deleted since last mikk analyze. WHEN TO USE: At session start or after edits. AFTER THIS: Run mikk analyze to update the lock.',
        { projectRoot: z.string().optional() },
        async (args: any) => {
            const effectiveRoot = (args as any)?.projectRoot || projectRoot
            const { lock, staleness } = await loadContractAndLock(effectiveRoot)
            const added: string[] = []; const modified: string[] = []; const deleted: string[] = []
            let scanTruncated = false
            for (const [filePath, fileInfo] of Object.entries(lock.files)) {
                const relPath = path.isAbsolute(filePath) ? path.relative(effectiveRoot, filePath).replace(/\\/g, '/') : filePath.replace(/\\/g, '/')
                const absPath = path.join(effectiveRoot, relPath)
                try {
                    const currentHash = await quickHashFile(absPath)
                    const storedHash = fileInfo.hash?.slice(0, 16) ?? ''
                    if (currentHash !== storedHash && storedHash !== '') modified.push(relPath)
                } catch { deleted.push(relPath) }
            }
            try {
                for (const dir of ['src', 'lib', 'app', 'pages', 'components', '.']) { // Include root (.) for flat projects
                    const dirPath = dir === '.' ? effectiveRoot : path.join(effectiveRoot, dir)
                    try {
                        const stat = await fs.stat(dirPath)
                        if (!stat.isDirectory()) continue

                        const { walkDir, isSourceFile } = await import('./shared.js')
                        const files = await walkDir(dirPath, effectiveRoot)
                        if (files.length >= 10_000) scanTruncated = true
                        for (const f of files) {
                            const relF = f.replace(/\\/g, '/')
                            // Check both absolute and relative in lock keys
                            const inLock = lock.files[relF] || lock.files[path.resolve(effectiveRoot, relF).replace(/\\/g, '/')]
                            if (!inLock && isSourceFile(relF)) added.push(relF)
                        }
                    } catch { /* dir doesn't exist */ }
                }
            } catch { /* scan failed */ }
            const response = {
                added: added.slice(0, 50), modified: modified.slice(0, 50), deleted: deleted.slice(0, 50),
                summary: `${modified.length} modified, ${added.length} new, ${deleted.length} deleted since last analysis`,
                totalChanges: added.length + modified.length + deleted.length,
                warning: staleness,
                hint: modified.length + added.length > 0 ? 'Run `mikk analyze` to update the lock.' : 'Codebase is in sync with the lock file.',
            }
            if (scanTruncated) response.hint += '\nNote: change scan was truncated for performance.'
            const _rawGC = Math.min(50, Object.keys(lock.files).length) * Math.round((60 * _ALC) / _CPT)
                ; (response as any).tokens = _track(effectiveRoot, _rawGC, response)
            return { content: [{ type: 'text' as const, text: JSON.stringify(response, null, 2) }] }
        },
    )
    server.tool(
        'mikk_index_project',
        'Trigger a full architectural indexing of the project. Updates mikk.lock.json and rebuilds the dependency graph.',
        {
            projectRoot: z.string().optional().describe('Project root to index. Defaults to server start directory.'),
            strict: z.boolean().optional().default(false).describe('Fail on parse errors'),
        },
        async (args: any): Promise<any> => {
            return requestQueue.add(async () => {
                const root = args.projectRoot || projectRoot
                // T50 fix: Early tombstone pass — immediately remove deleted files from lock
                // so concurrent searches don't see ghost functions during reindex.
                try {
                    const existingLockPath = path.join(root, 'mikk.lock.json')
                    if (fsSync.existsSync(existingLockPath)) {
                        const rawLock = JSON.parse(await fs.readFile(existingLockPath, 'utf-8'))
                        let tombstoned = false
                        const normP = (p: string) => p.replace(/\\/g, '/').toLowerCase()
                        for (const filePath of Object.keys(rawLock.files || {})) {
                            const abs = path.isAbsolute(filePath) ? filePath : path.join(root, filePath)
                            if (!fsSync.existsSync(abs)) {
                                const normAbs = normP(abs)
                                delete rawLock.files[filePath]
                                for (const [id, fn] of Object.entries(rawLock.functions || {})) {
                                    if (normP((fn as any).file).includes(normP(path.relative(root, abs)))) {
                                        delete rawLock.functions[id]
                                    }
                                }
                                tombstoned = true
                            }
                        }
                        if (tombstoned) {
                            await fs.writeFile(existingLockPath, JSON.stringify(rawLock), 'utf-8')
                            const { invalidateCache } = await import('./shared.js')
                            invalidateCache(root)
                        }
                    }
                } catch { /* best-effort early tombstone */ }

                // Re-implement a simplified version of the analyze command logic
                const {
                    discoverFiles, parseFiles, readFileContent,
                    GraphBuilder, LockCompiler, LockReader, ContractReader,
                    detectProjectLanguage, getDiscoveryPatterns,
                    discoverContextFiles,
                } = await import('@getmikk/core')

                const contractPath = path.join(root, 'mikk.json')
                let contract: any
                if (!fsSync.existsSync(contractPath)) {
                    contract = {
                        version: "1.0.0",
                        project: { name: path.basename(root), description: "Auto-indexed project", language: "typescript" },
                        declared: { modules: [], constraints: [], decisions: [] }
                    }
                    await fs.writeFile(contractPath, JSON.stringify(contract, null, 2))
                } else {
                    const contractReader = new ContractReader()
                    contract = await contractReader.read(contractPath)
                }

                const lang = contract.project.language || await detectProjectLanguage(root)
                const { patterns, ignore } = getDiscoveryPatterns(lang)
                const files = await discoverFiles(root, patterns, ignore)

                if (files.length === 0) return { content: [{ type: 'text' as const, text: 'No files found to index.' }], isError: true }

                const parsedFiles = await parseFiles(files, root, (fp) => readFileContent(fp))
                const graph = new GraphBuilder().build(parsedFiles)
                const contextFiles = await discoverContextFiles(root)
                const lock = await new LockCompiler().compile(graph, contract, parsedFiles, contextFiles, root)

                const lockReader = new LockReader()
                const lockPath = path.join(root, 'mikk.lock.json')
                const preparedLock = await lockReader.prepareForWrite(lock, lockPath)

                // Explicit Tombstoning: Remove records for files no longer on disk
                console.error(`[DEBUG] index_project: parsed ${parsedFiles.length} files. Combined lock functions: ${Object.keys(lock.functions).length}`);

                // T35 fix: Ensure lock paths are normalized (lowercased) to match ID generation
                const normalizePath = (p: string) => p.replace(/\\/g, '/').toLowerCase()
                const diskFiles = new Set(files.map(f => normalizePath(path.isAbsolute(f) ? f : path.join(root, f))))
                for (const filePath of Object.keys(preparedLock.files)) {
                    const normPath = normalizePath(path.isAbsolute(filePath) ? filePath : path.join(root, filePath))
                    if (!diskFiles.has(normPath)) {
                        delete preparedLock.files[filePath]
                        for (const [id, fn] of Object.entries(preparedLock.functions)) {
                            if ((fn as any).file.replace(/\\/g, '/').toLowerCase() === normPath) {
                                delete preparedLock.functions[id]
                            }
                        }
                    }
                }

                await fs.writeFile(lockPath, lockReader.serialize(preparedLock), 'utf-8')

                // Invalidate cache
                const { invalidateCache } = await import('./shared.js')
                invalidateCache(root)

                return {
                    content: [{
                        type: 'text' as const, text: JSON.stringify({
                            success: true,
                            filesIndexed: files.length,
                            functionsFound: Object.keys(preparedLock.functions).length,
                            project: contract.project.name
                        }, null, 2)
                    }]
                }
            }, { priority: PRIORITIES.INDEXING })
        }
    )
}
