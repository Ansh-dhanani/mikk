import * as path from 'node:path'
import * as fs from 'node:fs/promises'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { loadContractAndLock, isTrackedByLock, _fileTok, _track, _ALC, _CPT, MAX_SOURCE_FILE_BYTES } from './shared.js'

export function registerFileTools(server: McpServer, projectRoot: string) {

    // ── mikk_get_file ────────────────────────────────────────────────────────
    // Read raw source of any tracked file. Path-traversal hardened.
    ;(server as any).tool(
        'mikk_get_file',
        'Read raw source of a tracked file. TIP: Prefer mikk_read_file with function names to save tokens — it returns only the functions you need with rich metadata headers. WHEN TO USE: For config files, small files, or when you need the entire file.',
        { file: z.string().describe('File path relative to project root (e.g., "src/auth/verify.ts")') },
        async ({ file }: any) => {
            const absPath = path.isAbsolute(file) ? file : path.join(projectRoot, file)
            const resolved = path.resolve(absPath)
            const rootResolved = path.resolve(projectRoot)
            if (!resolved.startsWith(rootResolved + path.sep) && resolved !== rootResolved)
                return { content: [{ type: 'text' as const, text: `Access denied: "${file}" is outside the project root.` }], isError: true }
            try {
                const stat = await fs.stat(resolved)
                if (stat.size > MAX_SOURCE_FILE_BYTES)
                    return { content: [{ type: 'text' as const, text: `Refusing to read "${file}": file exceeds ${MAX_SOURCE_FILE_BYTES} bytes.` }], isError: true }
                const rel = path.relative(rootResolved, resolved).replace(/\\/g, '/')
                const { lock } = await loadContractAndLock(projectRoot)
                const allowlisted = new Set(['mikk.json', 'mikk.lock.json', 'package.json', 'tsconfig.json'])
                if (!isTrackedByLock(lock, projectRoot, resolved) && !allowlisted.has(rel))
                    return { content: [{ type: 'text' as const, text: `Access denied: "${file}" is not tracked in mikk.lock.json. Run \`mikk analyze\` or check path.` }], isError: true }
                const content = await fs.readFile(resolved, 'utf-8')
                const lineCount = content.split('\n').length
                return { content: [{ type: 'text' as const, text: `// ${rel} (${lineCount} lines)\n${content}` }] }
            } catch (err: any) {
                return { content: [{ type: 'text' as const, text: `Cannot read "${file}": ${err.message}` }], isError: true }
            }
        },
    )

    // ── mikk_read_file ───────────────────────────────────────────────────────
    // Read file scoped to specific functions — saves significant tokens vs full read.
    server.tool(
        'mikk_read_file',
        'Read a file scoped to specific function names. Returns bodies with rich metadata headers (params, calls, calledBy, purpose, module). WHEN TO USE: When you know which functions you need — saves 60–90% tokens vs mikk_get_file. AFTER THIS: Use mikk_before_edit before making changes. TIP: Always prefer this over mikk_get_file when you have function names.',
        {
            file: z.string().describe('File path relative to project root'),
            functions: z.array(z.string()).max(30).optional().describe('Function names to extract. Omit to return whole file.'),
        },
        async (args: any): Promise<any> => {
            const { lock, staleness } = await loadContractAndLock(projectRoot)
            const fileInput = String(args?.file ?? '')
            const fnNames: string[] | undefined = Array.isArray(args?.functions) ? args.functions : undefined
            const absPath = path.isAbsolute(fileInput) ? fileInput : path.join(projectRoot, fileInput)
            const resolved = path.resolve(absPath)
            const rootResolved = path.resolve(projectRoot)
            if (!resolved.startsWith(rootResolved + path.sep) && resolved !== rootResolved)
                return { content: [{ type: 'text' as const, text: `Access denied: "${fileInput}" is outside the project root.` }], isError: true }
            let content: string
            try {
                const stat = await fs.stat(resolved)
                if (stat.size > MAX_SOURCE_FILE_BYTES)
                    return { content: [{ type: 'text' as const, text: `Refusing to read "${fileInput}": file exceeds ${MAX_SOURCE_FILE_BYTES} bytes.` }], isError: true }
                const rel = path.relative(rootResolved, resolved).replace(/\\/g, '/')
                const allowlisted = new Set(['mikk.json', 'mikk.lock.json', 'package.json', 'tsconfig.json'])
                if (!isTrackedByLock(lock, projectRoot, resolved) && !allowlisted.has(rel))
                    return { content: [{ type: 'text' as const, text: `Access denied: "${fileInput}" is not tracked in mikk.lock.json.` }], isError: true }
                content = await fs.readFile(resolved, 'utf-8')
            } catch (err: any) {
                return { content: [{ type: 'text' as const, text: `Cannot read "${fileInput}": ${err.message}` }], isError: true }
            }
            const lines = content.split('\n')
            if (!fnNames || fnNames.length === 0)
                return { content: [{ type: 'text' as const, text: `// ${fileInput} (${lines.length} lines)\n${content}` }] }
            const normalizedFile = fileInput.replace(/\\/g, '/')
            const allFunctions = Object.values((lock as any).functions) as any[]
            const sections: string[] = []
            for (const fnName of fnNames) {
                const fn = allFunctions.find(f =>
                    (f.name === fnName || f.name.endsWith(`.${fnName}`)) &&
                    (f.file === normalizedFile || f.file.endsWith('/' + normalizedFile))
                )
                if (!fn) { sections.push(`// WARNING: Function "${fnName}" not found in ${fileInput}`); continue }
                const header = [
                    `// ── ${fn.name} ────────────────────────────`,
                    `// File:    ${fn.file}:${fn.startLine}-${fn.endLine}`,
                    `// Module:  ${fn.moduleId}`,
                    fn.purpose          ? `// Purpose: ${fn.purpose}` : null,
                    fn.params?.length   ? `// Params:  ${fn.params.map((p: any) => `${p.name}: ${p.type}${p.optional ? '?' : ''}`).join(', ')}` : null,
                    fn.returnType       ? `// Returns: ${fn.returnType}` : null,
                    fn.isAsync          ? `// Async:   true` : null,
                    fn.isExported       ? `// Exported: true` : null,
                    fn.calledBy?.length ? `// CalledBy: ${fn.calledBy.map((id: string) => (lock as any).functions[id]?.name).filter(Boolean).join(', ')}` : null,
                    fn.calls?.length    ? `// Calls:   ${fn.calls.map((id: string) => (lock as any).functions[id]?.name).filter(Boolean).join(', ')}` : null,
                ].filter(Boolean).join('\n')
                sections.push(`${header}\n${lines.slice(fn.startLine - 1, fn.endLine).join('\n')}`)
            }
            const output = sections.join('\n\n')
            const normalizedFile2 = normalizedFile
            const _rawRF = _fileTok(lock as any, normalizedFile2)
            const _tokRF = _track(projectRoot, _rawRF, output)
            return { content: [{ type: 'text' as const, text: output + (staleness ? `\n\n${staleness}` : '') + `\n// tokens: ${JSON.stringify(_tokRF)}` }] }
        },
    )

    // ── mikk_file_diff ───────────────────────────────────────────────────────
    // Compare a file's current state against the lock's recorded hash.
    ;(server as any).tool(
        'mikk_file_diff',
        'Check if a tracked file has drifted from what mikk.lock.json knows about it — reports hash mismatch, line count change, and optionally compares two files. WHEN TO USE: To verify whether a file has been edited since the last `mikk analyze`.',
        {
            file: z.string().describe('File path to check (relative to project root)'),
            compareWith: z.string().optional().describe('Optional second file path to compare against'),
        },
        async (args: any): Promise<any> => {
            const { file, compareWith } = args as any
            const { lock, staleness } = await loadContractAndLock(projectRoot)
            const absPath = path.isAbsolute(file) ? file : path.join(projectRoot, file)
            const resolved = path.resolve(absPath)
            const rootResolved = path.resolve(projectRoot)
            if (!resolved.startsWith(rootResolved + path.sep) && resolved !== rootResolved)
                return { content: [{ type: 'text', text: 'Access denied: outside project root' }], isError: true }
            try {
                const { quickHashFile } = await import('./shared.js')
                const content = await fs.readFile(resolved, 'utf-8')
                const currentLines = content.split('\n').length
                const relPath = path.relative(rootResolved, resolved).replace(/\\/g, '/')
                const lockFile = lock.files[relPath]
                const currentHash = await quickHashFile(resolved)
                const storedHash = lockFile?.hash?.slice(0, 16) ?? ''
                const modified = storedHash !== '' && currentHash !== storedHash
                const response: any = {
                    file: relPath,
                    currentLines,
                    lockLines: (lockFile as any)?.lineCount ?? null,
                    currentHash,
                    storedHash: storedHash || null,
                    modified,
                    lockStatus: lockFile ? 'tracked' : 'not tracked (run `mikk analyze`)',
                    warning: staleness,
                    hint: modified ? 'File has changed since last `mikk analyze`. Run it to update the lock.' : 'File matches lock state.',
                }
                if (compareWith) {
                    const comparePath = path.isAbsolute(compareWith) ? compareWith : path.join(projectRoot, compareWith)
                    const compareResolved = path.resolve(comparePath)
                    if (compareResolved.startsWith(rootResolved + path.sep)) {
                        try {
                            const compareContent = await fs.readFile(compareResolved, 'utf-8')
                            response.compareWith = {
                                file: path.relative(rootResolved, compareResolved).replace(/\\/g, '/'),
                                lines: compareContent.split('\n').length,
                                hash: await quickHashFile(compareResolved),
                                identical: content === compareContent,
                            }
                        } catch { /* ignore */ }
                    }
                }
                return { content: [{ type: 'text' as const, text: JSON.stringify(response, null, 2) }] }
            } catch (err: any) {
                return { content: [{ type: 'text' as const, text: `Error: ${err.message}` }], isError: true }
            }
        },
    )
}
