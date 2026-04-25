import * as path from 'node:path'
import * as fs from 'node:fs/promises'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import {
    ImpactAnalyzer, BoundaryChecker, AdrManager,
} from '@getmikk/core'
import {
    loadContractAndLock, buildGraphFromLock, detectCircularDeps,
    _clampBudget, _compactImpacted, _filesTok, _fileTok, _track, _ALC, _CPT,
} from './shared.js'

// ─── Helper: parse imports from file content (T46 fix) ───────────────
function _parseImports(content: string): string[] {
    const imports: string[] = []
    // Simple line-by-line approach
    const lines = content.split('\n')
    for (const line of lines) {
        // Match: from 'path' or from "path"
        const fromMatch = line.match(/from\s+['"]([^'"]+)['"]/)
        if (fromMatch) {
            const p = fromMatch[1]
            if (p.startsWith('.') || p.startsWith('/')) imports.push(p)
        }
    }
    return imports
}

// ─── Helper: debug logging ───────────────────────────────
function _log(label: string, ...args: any[]) {
    console.error(`[${label}]`, ...args)
}

export function registerSafetyTools(server: McpServer, projectRoot: string) {

    // ── mikk_before_edit ─────────────────────────────────────────────────────
    // MANDATORY pre-edit check: blast radius + exported functions at risk +
    // all 6 constraint types + circular dependency detection.
    server.tool(
        'mikk_before_edit',
        'CALL BEFORE EDITING ANY FILE. Returns: blast radius (impacted functions classified by severity), exported API surface at risk, constraint violations (6 rule types: no-import, must-use, no-call, layer, naming, max-files), and circular dependency warnings. If constraintStatus is "fail", redesign before proceeding. TIP: Pass multiple files for a combined blast radius.',
        {
            files: z.array(z.string()).min(1).max(20).describe('File paths (relative to project root) you are about to edit'),
            tokenBudget: z.number().optional().describe('Token budget for response (default: 1200)'),
            abortOnHighTokens: z.boolean().optional().default(false).describe('Fail fast when payload exceeds budget'),
        },
        async (args: any): Promise<any> => {
            const { files: filesToEdit, tokenBudget, abortOnHighTokens } = args as any
            const { contract, lock, staleness } = await loadContractAndLock(projectRoot)
            const graph = buildGraphFromLock(lock)
            const analyzer = new ImpactAnalyzer(graph)
            const checker = new BoundaryChecker(contract, lock)
            const boundaryResult = checker.check()

            // T46 FIX: parse current file imports for fresh constraint checking
            const freshImportsMap: Record<string, string[]> = {}
            for (const relFile of filesToEdit) {
                const fullPath = path.join(projectRoot, relFile)
                try {
                    const content = await fs.readFile(fullPath, 'utf8')
                    freshImportsMap[relFile] = _parseImports(content)
                    _log('T46', 'parsed imports', relFile, freshImportsMap[relFile])
                } catch { /* ignore - file might not exist */ }
            }

            const budget = _clampBudget(tokenBudget)
            const fileReports: Record<string, any> = {}

            for (const file of filesToEdit) {
                const normalizedFile = file.replace(/\\/g, '/').replace(/^\.\//, '')
                const fileFns = Object.values(lock.functions).filter(fn =>
                    fn.file === normalizedFile || fn.file.endsWith('/' + normalizedFile)
                )
                if (fileFns.length === 0) {
                    fileReports[file] = { warning: `No tracked functions found in "${file}". Run \`mikk analyze\` or verify path with mikk_list_files.` }
                    continue
                }
                const result = analyzer.analyze(fileFns.map(fn => fn.id))
                const fullImpacted = result.impacted.map(id => {
                    const node = graph.nodes.get(id)
                    return { function: node?.name ?? id, file: node?.file ?? '', module: node?.moduleId ?? '', severity: result.classified.critical.find(c => c.nodeId === id) ? 'critical' : result.classified.high.find(c => c.nodeId === id) ? 'high' : result.classified.medium.find(c => c.nodeId === id) ? 'medium' : 'low' }
                })
                const exportedAtRisk = fileFns.filter(fn => fn.isExported).map(fn => ({
                    name: fn.name, signature: fn.fullSignature || fn.name,
                    calledBy: fn.calledBy.map(id => lock.functions[id]?.name).filter(Boolean),
                }))
                const fileViolations = boundaryResult.violations
                    .filter(v => v.from.file === normalizedFile || v.from.file.endsWith('/' + normalizedFile))
                    .map(v => ({
                        severity: v.severity, rule: v.rule,
                        from: `${v.from.moduleName}::${v.from.functionName}`,
                        to: `${v.to.moduleName}::${v.to.functionName}`,
                        message: `"${v.from.functionName}" in ${v.from.moduleName} → "${v.to.functionName}" in ${v.to.moduleName} violates: "${v.rule}"`,
                    }))

                // T46 FIX: check fresh imports from current file content against constraints
                const freshImports = freshImportsMap[file] || []
                _log('T46', 'freshImports', file, freshImports)
                // Find the lock file entry with flexible path matching
                let lockFileEntry: any = undefined
                const fileLower = normalizedFile.toLowerCase()
                for (const [lockPath, lockFile] of Object.entries(lock.files)) {
                    if (lockPath.toLowerCase() === fileLower || lockPath.endsWith('/' + fileLower) || lockPath.endsWith(fileLower)) {
                        lockFileEntry = lockFile
                        break
                    }
                }
                const srcModuleId = lockFileEntry?.moduleId
                _log('T46', 'srcModuleId', normalizedFile, srcModuleId, 'lock.files keys sample', Object.keys(lock.files).slice(0, 3))
                const rules: any[] = (checker as any).rules || []
                _log('T46', 'rules', rules.map((r: any) => ({ fromModuleId: r.fromModuleId, toModuleIds: r.toModuleIds, raw: r.raw })))
                const freshViolations: any[] = []
                if (freshImports.length > 0 && srcModuleId) {
                    for (const impPath of freshImports) {
                        // resolve relative import path
                        const srcDir = path.dirname(normalizedFile)
                        const resolved = path.join(srcDir, impPath).replace(/\\/g, '/').replace(/\.(ts|js|tsx|jsx)$/, '')
                        _log('T46', 'looking for target', resolved, 'in lock.files')
                        // find target file in lock - remove break to check all matches
                        let foundTarget = false
                        for (const [lockPath, lockFile] of Object.entries(lock.files)) {
                            const lp = lockPath.replace(/\\/g, '/')
                            if (lp.endsWith(resolved) || lp.endsWith(resolved + '.ts') || lp.endsWith(resolved + '/service')) {
                                _log('T46', 'checking file', lockPath, 'moduleId', lockFile?.moduleId)
                                const targetModuleId = lockFile?.moduleId
                                if (targetModuleId && targetModuleId !== 'unknown' && targetModuleId !== srcModuleId) {
                                    _log('T46', 'MATCH', 'srcModuleId=', srcModuleId, 'targetModuleId=', targetModuleId)
                                    // check constraints
                                    for (const rule of rules) {
                                        const fromMatch = rule.fromModuleId === srcModuleId || rule.fromModuleId === '*'
                                        // Normalize module IDs: strip " module" suffix for comparison
                                        const normalizedTarget = targetModuleId.replace(/\s+module$/, '').trim()
                                        const toMatch = rule.toModuleIds.some((tid: string) => {
                                            const normalizedTid = tid.replace(/\s+module$/, '').trim()
                                            return normalizedTid === normalizedTarget || normalizedTid === '*'
                                        }) || rule.toModuleIds.includes('*')
                                        if (fromMatch && toMatch) {
                                            freshViolations.push({
                                                severity: 'error',
                                                rule: rule.raw || 'constraint',
                                                from: srcModuleId,
                                                to: targetModuleId,
                                                message: `${srcModuleId} imports ${targetModuleId} - violates constraint`,
                                            })
                                            foundTarget = true
                                        }
                                    }
                                }
                            }
                        }
                        if (!foundTarget) {
                            _log('T46', 'no target found for', resolved, 'in lock.files')
                        }
                    }
                }

                // merge violations
                const allViolations = [...fileViolations, ...freshViolations]
                const uniqueViolations = allViolations.filter((v, i, arr) =>
                    arr.findIndex(x => x.from === v.from && x.to === v.to && x.rule === v.rule) === i
                )
                const circularWarnings = detectCircularDeps(fileFns, lock)
                const perFileBase = { file, impactedNodes: result.impacted.length, depth: result.depth, confidence: result.confidence }
                const compact = _compactImpacted(fullImpacted, perFileBase, Math.max(150, Math.floor(budget / Math.max(1, filesToEdit.length))), 4)
                fileReports[file] = {
                    functionsInFile: fileFns.map(fn => fn.name),
                    exportedAtRisk, impactedNodes: result.impacted.length,
                    classified: { critical: result.classified.critical.length, high: result.classified.high.length, medium: result.classified.medium.length, low: result.classified.low.length },
                    depth: result.depth, confidence: result.confidence,
                    impacted: compact.items, truncated: compact.minimized,
                    constraintStatus: uniqueViolations.length === 0 ? 'pass' : 'fail',
                    violations: uniqueViolations, circularDependencies: circularWarnings,
                }
            }

            const totalImpact = Object.values(fileReports).filter(r => typeof r.impactedNodes === 'number').reduce((s, r) => s + r.impactedNodes, 0)
            const totalViolations = Object.values(fileReports).reduce((s, r) => s + (r.violations?.length ?? 0), 0)
            // T46 fix: expose a top-level violations array so callers don't have to
            // dig into per-file reports — tests check afterEdit?.violations?.length > 0
            const allTopViolations = Object.values(fileReports).flatMap((r: any) => r.violations ?? [])
            const response: any = {
                summary: `Editing ${filesToEdit.length} file(s). Blast radius: ${totalImpact} dependent node(s). Constraint violations: ${totalViolations}.`,
                constraintStatus: totalViolations === 0 ? 'pass' : 'fail',
                violations: allTopViolations,
                files: fileReports, warning: staleness,
                hint: totalViolations > 0
                    ? 'WARNING: Constraint violations detected. Review violations before proceeding. Use mikk_get_constraints for full rule context.'
                    : 'All constraints satisfied. Review impacted nodes before editing. Proceed when ready.',
            }
            const { _tok } = await import('./shared.js')
            const estimated = _tok(response)
            if (estimated > budget && abortOnHighTokens)
                return { content: [{ type: 'text' as const, text: JSON.stringify({ summary: response.summary, constraintStatus: response.constraintStatus, warning: `Token budget exceeded (${budget}). Aborting early.`, tokenGuard: { budget, estimatedTokens: estimated, shouldAbort: true } }, null, 2) }], isError: true }
            response.tokenGuard = { budget, estimatedTokens: estimated, minimized: estimated > budget, shouldAbort: false }
            const _rawBE = _filesTok(lock as any, filesToEdit) * 4
            response.tokens = _track(projectRoot, _rawBE, response)
            return { content: [{ type: 'text' as const, text: JSON.stringify(response, null, 2) }] }
        },
    )

    // ── mikk_impact_analysis ─────────────────────────────────────────────────
    server.tool(
        'mikk_impact_analysis',
        'Analyze the blast radius of changing a file. Returns impacted functions classified by severity (critical/high/medium/low) with the full dependency chain. WHEN TO USE: Before refactoring, renaming, or modifying shared code. AFTER THIS: Use mikk_get_function_detail on critical/high items.',
        {
            file: z.string().describe('File path (relative to project root) to analyze'),
            tokenBudget: z.number().optional().describe('Token budget for response (default: 1200)'),
            abortOnHighTokens: z.boolean().optional().default(false),
        },
        async (args: any): Promise<any> => {
            const { file, tokenBudget, abortOnHighTokens } = args as any
            const { lock, staleness } = await loadContractAndLock(projectRoot)
            const graph = buildGraphFromLock(lock)
            const analyzer = new ImpactAnalyzer(graph)
            const normalizedFile = String(file).replace(/\\/g, '/')
            let fileNodes = [...graph.nodes.values()].filter(n => n.file === normalizedFile)
            if (fileNodes.length === 0) {
                const basename = normalizedFile.split('/').pop() || normalizedFile
                fileNodes = [...graph.nodes.values()].filter(n => (n.file.split('/').pop() || n.file) === basename)
            }
            if (fileNodes.length === 0)
                return { content: [{ type: 'text' as const, text: `No functions found in "${file}". Use mikk_search_functions to find the correct path.` }], isError: true }
            const result = analyzer.analyze(fileNodes.map(n => n.id))
            const fullImpacted = result.impacted.map(id => {
                const node = graph.nodes.get(id)
                return { function: node?.name ?? id, file: node?.file ?? '', module: node?.moduleId ?? '' }
            })
            const budget = _clampBudget(tokenBudget)
            const baseResponse = {
                file, changedNodes: result.changed.length, impactedNodes: result.impacted.length,
                depth: result.depth, confidence: result.confidence,
                classified: {
                    critical: result.classified.critical.length, high: result.classified.high.length,
                    medium: result.classified.medium.length, low: result.classified.low.length,
                    criticalItems: result.classified.critical.slice(0, 10),
                    highItems: result.classified.high.slice(0, 10),
                },
                warning: staleness,
                hint: 'Next: Use mikk_get_function_detail on critical/high items. Then mikk_before_edit to validate planned changes.',
            }
            const compact = _compactImpacted(fullImpacted, baseResponse, budget)
            if (abortOnHighTokens && compact.minimized)
                return { content: [{ type: 'text' as const, text: JSON.stringify({ ...baseResponse, warning: `Token budget exceeded (${budget}).`, tokenGuard: { budget, estimatedTokens: compact.estimatedTokens, shouldAbort: true } }, null, 2) }], isError: true }
            // T57 fix: derive unique affected file paths from BOTH function-level nodes
            // AND direct file-level importers from the lock. Barrel files have zero
            // function nodes so the function-node approach finds nothing; the lock's
            // import graph is the authoritative source for file-level impact.
            const affectedFilesFromNodes = [...new Set(fullImpacted.map((n: any) => n.file).filter(Boolean))]

            // Find all files that directly import the changed file using the lock
            const directImporters = new Set<string>()
            for (const [filePath, fileData] of Object.entries(lock.files)) {
                if ((fileData.imports ?? []).some((imp: any) => {
                    const rp = imp.resolvedPath ?? ''
                    return rp === normalizedFile || rp.endsWith('/' + normalizedFile) ||
                        rp.replace(/\\/g, '/') === normalizedFile
                })) {
                    directImporters.add(filePath.replace(/\\/g, '/'))
                }
            }

            const affectedFiles = [...new Set([...affectedFilesFromNodes, ...directImporters])]
            const response = { ...baseResponse, affectedFiles, impacted: compact.items, truncated: compact.minimized, tokenGuard: { budget, estimatedTokens: compact.estimatedTokens, minimized: compact.minimized, shouldAbort: false } }
            const _rawIA = _fileTok(lock as any, normalizedFile) + result.impacted.length * Math.round((40 * _ALC) / _CPT)
            ;(response as any).tokens = _track(projectRoot, _rawIA, response)
            return { content: [{ type: 'text' as const, text: JSON.stringify(response, null, 2) }] }
        },
    )

    // ── mikk_get_constraints ─────────────────────────────────────────────────
    server.tool(
        'mikk_get_constraints',
        'Get all architectural constraints and ADRs with full context. WHEN TO USE: Before cross-module changes, or when mikk_before_edit reports violations. Explains WHY a constraint exists. 6 constraint types: no-import, must-use, no-call, layer, naming, max-files.',
        {},
        async () => {
            const { contract, staleness } = await loadContractAndLock(projectRoot)
            return { content: [{ type: 'text' as const, text: JSON.stringify({ constraints: contract.declared.constraints, decisions: contract.declared.decisions, overwrite: contract.overwrite, warning: staleness, hint: 'Use mikk_manage_adr to add/update architectural decisions.' }, null, 2) }] }
        },
    )

    // ── mikk_find_usages ─────────────────────────────────────────────────────
    ;(server as any).tool(
        'mikk_find_usages',
        'Find every function that calls a specific function. Essential before renaming or changing signatures — shows the full blast radius of a signature change. WHEN TO USE: Before renaming, refactoring, or changing a function interface. AFTER THIS: Review each caller before proceeding.',
        { name: z.string().describe('Function name to find callers of') },
        async ({ name }: any) => {
            const { lock, staleness } = await loadContractAndLock(projectRoot)
            const fn = Object.values(lock.functions).find(f => f.name === name || f.name.endsWith(`.${name}`) || (f.id ?? '').includes(name))
            if (!fn) return { content: [{ type: 'text' as const, text: `Function "${name}" not found. Use mikk_search_functions to verify the name.` }], isError: true }
            const usages = fn.calledBy.map(id => lock.functions[id]).filter(Boolean).map(caller => ({
                name: caller.name, file: caller.file, module: caller.moduleId,
                line: caller.startLine, exported: caller.isExported,
                signature: caller.fullSignature || caller.name,
            }))
            // Group by module for clarity
            const byModule = usages.reduce((acc: Record<string, any[]>, u) => { (acc[u.module] = acc[u.module] || []).push(u); return acc }, {})
            return { content: [{ type: 'text' as const, text: JSON.stringify({
                function: fn.name, file: fn.file, module: fn.moduleId, isExported: fn.isExported,
                usageCount: usages.length, byModule, allUsages: usages,
                warning: staleness,
                hint: usages.length > 0 ? `${usages.length} caller(s) to update if you change "${fn.name}". Review each one with mikk_read_file.` : 'No callers found — safe to rename or change signature.',
}, null, 2) }] }
        },
    )
}

// import here to avoid circular dependency
import { invalidateCache } from './shared.js'
