import * as path from 'node:path'
import * as fs from 'node:fs/promises'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { BoundaryChecker } from '@getmikk/core'
import {
    loadContractAndLock, _ALC, _CPT, _track, _tally,
    getDirtySampleFiles, quickHashFile,
} from './shared.js'

export function registerSessionTools(server: McpServer, projectRoot: string) {

    server.tool(
        'mikk_get_session_context',
        'CALL THIS FIRST. One-shot session onboarding: project overview + constraint status + hot modules + recently modified files + active decisions. AFTER THIS: Use mikk_query_context with your task, or mikk_get_changes for drift details.',
        {},
        async (): Promise<any> => {
            const { contract, lock, staleness } = await loadContractAndLock(projectRoot)
            const modules = contract.declared.modules.map(mod => {
                const fns = Object.values(lock.functions).filter(f => f.moduleId === mod.id)
                return { id: mod.id, name: mod.name, functions: fns.length, exported: fns.filter(f => f.isExported).length }
            })
            const fileEntries = Object.entries(lock.files)
            const sampleSize = Math.min(fileEntries.length, 20)
            const sampleFiles = fileEntries.slice(0, sampleSize).map(([p]) => p.replace(/\\/g, '/'))
            const dirtyFiles = await getDirtySampleFiles(projectRoot, sampleFiles)
            const modifiedFiles: string[] = []
            let changedCount = 0
            if (dirtyFiles !== null) {
                for (const f of dirtyFiles) modifiedFiles.push(f)
                changedCount = dirtyFiles.length
            } else {
                for (let i = 0; i < sampleSize; i++) {
                    const [filePath, fileInfo] = fileEntries[i]
                    const absPath = path.isAbsolute(filePath) ? filePath : path.join(projectRoot, filePath)
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
            ;(response as any).tokens = _track(projectRoot, _rawSC, response)
            return { content: [{ type: 'text' as const, text: JSON.stringify(response, null, 2) }] }
        },
    )

    server.tool(
        'mikk_get_project_overview',
        'Get high-level project stats: modules, function counts, file counts, constraints. Prefer mikk_get_session_context at session start.',
        {},
        async () => {
            const { contract, lock, staleness } = await loadContractAndLock(projectRoot)
            const modules = contract.declared.modules.map(mod => {
                const fns = Object.values(lock.functions).filter(f => f.moduleId === mod.id)
                const files = Object.values(lock.files).filter(f => f.moduleId === mod.id)
                return { id: mod.id, name: mod.name, description: mod.description, functions: fns.length, files: files.length, exported: fns.filter(f => f.isExported).length }
            })
            const overview = {
                project: contract.project,
                functions: Object.keys(lock.functions).length,
                files: Object.keys(lock.files).length,
                totalFunctions: Object.keys(lock.functions).length,
                totalFiles: Object.keys(lock.files).length,
                totalModules: modules.length,
                modules,
                constraints: contract.declared.constraints,
                decisions: contract.declared.decisions,
                warning: staleness,
                hint: 'Next: Use mikk_query_context with your task description, or mikk_list_modules to explore the architecture.',
            }
            const _rawOverview = Math.min(15, Object.keys(lock.files).length) * Math.round((80 * _ALC) / _CPT)
            ;(overview as any).tokens = _track(projectRoot, _rawOverview, overview)
            return { content: [{ type: 'text' as const, text: JSON.stringify(overview, null, 2) }] }
        },
    )

    server.tool(
        'mikk_token_stats',
        'Show token savings for this session — how many tokens Mikk saved vs raw file reads. Useful at session end to review cumulative efficiency.',
        {},
        async () => {
            const t = _tally(projectRoot)
            const { lock } = await loadContractAndLock(projectRoot)
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
        {},
        async () => {
            const { lock, staleness } = await loadContractAndLock(projectRoot)
            const added: string[] = []; const modified: string[] = []; const deleted: string[] = []
            let scanTruncated = false
            for (const [filePath, fileInfo] of Object.entries(lock.files)) {
                const absPath = path.isAbsolute(filePath) ? filePath : path.join(projectRoot, filePath)
                try {
                    const currentHash = await quickHashFile(absPath)
                    const storedHash = fileInfo.hash?.slice(0, 16) ?? ''
                    if (currentHash !== storedHash && storedHash !== '') modified.push(filePath)
                } catch { deleted.push(filePath) }
            }
            try {
                for (const dir of ['src', 'lib', 'app', 'pages', 'components']) {
                    const dirPath = path.join(projectRoot, dir)
                    try {
                        await fs.access(dirPath)
                        const { walkDir, isSourceFile } = await import('./shared.js')
                        const files = await walkDir(dirPath, projectRoot)
                        if (files.length >= 10_000) scanTruncated = true
                        for (const f of files) { if (!lock.files[f] && isSourceFile(f)) added.push(f) }
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
            ;(response as any).tokens = _track(projectRoot, _rawGC, response)
            return { content: [{ type: 'text' as const, text: JSON.stringify(response, null, 2) }] }
        },
    )
}
