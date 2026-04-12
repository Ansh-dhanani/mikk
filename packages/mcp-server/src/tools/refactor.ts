import * as path from 'node:path'
import * as fs from 'node:fs/promises'
import { execFile } from 'node:child_process'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { loadContractAndLock, parseDiffHunks } from './shared.js'

export function registerRefactorTools(server: McpServer, projectRoot: string) {

    // ── mikk_rename ──────────────────────────────────────────────────────────
    // Previously commented out — now enabled. Produces a complete multi-file edit plan.
    server.tool(
        'mikk_rename',
        'Plan a safe, coordinated multi-file rename. Finds ALL call sites, import locations, and export references for a function and returns a step-by-step edit plan with exact file:line locations to update. WHEN TO USE: Before renaming any function — prevents missed call sites. AFTER THIS: Execute the edit plan in the order given, then run `mikk analyze`.',
        {
            functionName: z.string().describe('Current function name to rename'),
            newName: z.string().describe('Desired new name'),
        },
        async ({ functionName, newName }: any) => {
            const { lock, staleness } = await loadContractAndLock(projectRoot)
            const targetFn = Object.values(lock.functions).find(fn => fn.name === functionName || fn.id.endsWith(`:${functionName}`))
            if (!targetFn)
                return { content: [{ type: 'text' as const, text: `Function "${functionName}" not found. Use mikk_search_functions to find the correct name.` }], isError: true }

            const callers = targetFn.calledBy
                .map(callerId => lock.functions[callerId]).filter(Boolean)
                .map(fn => ({ callerName: fn.name, file: fn.file, line: fn.startLine, module: fn.moduleId, exported: fn.isExported }))

            const filesImporting = Object.entries(lock.files)
                .filter(([, info]) => info.imports?.some((imp: any) => imp.named?.includes(functionName) || imp.default === functionName))
                .map(([filePath, info]) => ({ file: filePath, importType: info.imports?.find((imp: any) => imp.named?.includes(functionName)) ? 'named' : 'default' }))

            // Build a sequenced edit plan
            const editPlan: Array<{ step: number; file: string; action: string; detail: string }> = []
            let step = 1
            editPlan.push({ step: step++, file: targetFn.file, action: 'rename_declaration', detail: `Line ${targetFn.startLine}: rename function "${functionName}" → "${newName}"` })
            for (const imp of filesImporting) {
                editPlan.push({ step: step++, file: imp.file, action: 'update_import', detail: `Update ${imp.importType} import: "${functionName}" → "${newName}"` })
            }
            for (const caller of callers) {
                editPlan.push({ step: step++, file: caller.file, action: 'update_call_site', detail: `Line ~${caller.line}: update call "${functionName}(..." → "${newName}(..."` })
            }

            return { content: [{ type: 'text' as const, text: JSON.stringify({
                function: { name: functionName, newName, file: targetFn.file, module: targetFn.moduleId, isExported: targetFn.isExported, line: targetFn.startLine },
                summary: { callSites: callers.length, importSites: filesImporting.length, totalEdits: editPlan.length },
                editPlan,
                callers,
                filesImporting,
                warning: staleness,
                hint: `Execute all ${editPlan.length} edits in the order above, then run \`mikk analyze\` to rebuild the lock.`,
            }, null, 2) }] }
        },
    )

    // ── mikk_git_diff_impact ─────────────────────────────────────────────────
    ;(server as any).tool(
        'mikk_git_diff_impact',
        'Map git diff hunks to affected symbols — shows which functions were modified, added, or deleted with module attribution. WHEN TO USE: After commits or merges to understand the symbol-level change set. AFTER THIS: Use mikk_impact_analysis on the affected files.',
        {
            ref: z.string().optional().default('HEAD~1').describe('Git ref to diff against (default: HEAD~1)'),
            staged: z.boolean().optional().default(false).describe('Diff staged changes only'),
        },
        async (args: any): Promise<any> => {
            const { ref, staged } = args as any
            const { lock, staleness } = await loadContractAndLock(projectRoot)
            try {
                const validatedRef = /^[A-Za-z0-9_./\-~^]+$/.test(ref) ? ref : null
                if (!staged && !validatedRef) return { content: [{ type: 'text' as const, text: 'Invalid git ref format.' }], isError: true }
                const gitArgs = ['diff']
                if (staged) gitArgs.push('--cached'); else gitArgs.push(validatedRef!)
                gitArgs.push('--unified=0', '--no-color')
                const rawDiff = await new Promise<string>((resolve, reject) => {
                    execFile('git', gitArgs, { cwd: projectRoot, encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }, (err, stdout) => { if (err) return reject(err); resolve(stdout) })
                })
                if (!rawDiff.trim()) return { content: [{ type: 'text' as const, text: 'No changes found in git diff.' }] }
                const fileHunks = parseDiffHunks(rawDiff)
                const affectedSymbols = fileHunks.map(hunk => {
                    const fileFns = Object.values(lock.functions).filter(fn => fn.file === hunk.file || fn.file.endsWith(hunk.file))
                    const affected = fileFns.filter(fn => hunk.changedLines.some(l => l >= fn.startLine && l <= fn.endLine))
                    return { file: hunk.file, type: hunk.isNew ? 'added' : hunk.isDeleted ? 'deleted' : 'modified', changedLines: hunk.changedLines.length, functions: affected.map(fn => ({ name: fn.name, module: fn.moduleId, isExported: fn.isExported })) }
                }).filter(f => f.functions.length > 0 || f.type !== 'modified')
                const totalFns = affectedSymbols.reduce((s, f) => s + f.functions.length, 0)
                return { content: [{ type: 'text' as const, text: JSON.stringify({
                    ref: staged ? 'staged' : ref,
                    summary: `${affectedSymbols.length} file(s), ${totalFns} function(s) affected`,
                    affectedSymbols, warning: staleness,
                    hint: 'Use mikk_impact_analysis on any modified file to see downstream blast radius.',
                }, null, 2) }] }
            } catch (err: any) {
                return { content: [{ type: 'text' as const, text: `Git diff failed: ${err.message}` }], isError: true }
            }
        },
    )
}
