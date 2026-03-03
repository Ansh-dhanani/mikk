import * as path from 'node:path'
import type { MikkContract, MikkLock } from '@getmikk/core'

/**
 * MainDiagramGenerator — generates the top-level Mermaid diagram
 * showing all modules and their interconnections.
 * For single-module projects, shows a file-level view instead.
 * Outputs: .mikk/diagrams/main.mmd
 */
export class MainDiagramGenerator {
    constructor(
        private contract: MikkContract,
        private lock: MikkLock
    ) { }

    generate(): string {
        const modules = this.contract.declared.modules

        // Single module or no modules — show a file-level view instead of one useless node
        if (modules.length <= 1) {
            return this.generateFileLevelView()
        }

        return this.generateModuleLevelView()
    }

    /** Standard multi-module view — modules as nodes, inter-module calls as edges */
    private generateModuleLevelView(): string {
        const lines: string[] = []
        lines.push('%%{init: {"theme": "base", "themeVariables": {"primaryColor": "#1e293b", "primaryTextColor": "#e2e8f0", "lineColor": "#64748b", "secondaryColor": "#334155", "tertiaryColor": "#475569", "background": "#0f172a", "mainBkg": "#1e293b", "nodeBorder": "#475569"}}}%%')
        lines.push('graph TD')
        lines.push('')

        // Add module nodes
        for (const module of this.contract.declared.modules) {
            const lockModule = this.lock.modules[module.id]
            const fileCount = lockModule?.files.length || 0
            const fnCount = Object.values(this.lock.functions).filter(f => f.moduleId === module.id).length
            lines.push(`    ${this.sanitizeId(module.id)}["📦 ${module.name}<br/>${fileCount} files, ${fnCount} functions"]`)
        }

        lines.push('')

        // Add inter-module edges based on cross-module function calls AND file imports
        const moduleEdges = new Map<string, Set<string>>()

        // Function-level cross-module calls
        for (const fn of Object.values(this.lock.functions)) {
            for (const callTarget of fn.calls) {
                const targetFn = this.lock.functions[callTarget]
                if (targetFn && fn.moduleId !== targetFn.moduleId) {
                    const edgeKey = `${fn.moduleId}→${targetFn.moduleId}`
                    if (!moduleEdges.has(edgeKey)) {
                        moduleEdges.set(edgeKey, new Set())
                    }
                    moduleEdges.get(edgeKey)!.add(`${fn.name}→${targetFn.name}`)
                }
            }
        }

        // File-level cross-module imports
        for (const file of Object.values(this.lock.files)) {
            if (!file.imports) continue
            for (const importedPath of file.imports) {
                const importedFile = this.lock.files[importedPath]
                if (importedFile && file.moduleId !== importedFile.moduleId) {
                    const edgeKey = `${file.moduleId}→${importedFile.moduleId}`
                    if (!moduleEdges.has(edgeKey)) {
                        moduleEdges.set(edgeKey, new Set())
                    }
                    const fromName = file.path.split('/').pop() || file.path
                    const toName = importedFile.path.split('/').pop() || importedFile.path
                    moduleEdges.get(edgeKey)!.add(`${fromName}→${toName}`)
                }
            }
        }

        for (const [edge, calls] of moduleEdges) {
            const [from, to] = edge.split('→')
            lines.push(`    ${this.sanitizeId(from)} -->|${calls.size} calls| ${this.sanitizeId(to)}`)
        }

        // Style
        lines.push('')
        lines.push('    classDef module fill:#3b82f6,stroke:#60a5fa,color:#f8fafc,stroke-width:2px')
        for (const module of this.contract.declared.modules) {
            lines.push(`    class ${this.sanitizeId(module.id)} module`)
        }

        return lines.join('\n')
    }

    /**
     * File-level view — for single-module or no-module projects.
     * Shows the top files grouped by directory, with import edges between them.
     * Caps at 25 files to keep the diagram readable.
     */
    private generateFileLevelView(): string {
        const MAX_FILES = 25
        const allFiles = Object.values(this.lock.files)

        // Sort by number of connections (imports + importedBy) — most connected first
        const ranked = allFiles
            .map(f => ({
                ...f,
                connections: (f.imports?.length || 0) + (Object.values(this.lock.files).filter(other => other.imports?.includes(f.path)).length),
            }))
            .sort((a, b) => b.connections - a.connections)

        const filesToShow = ranked.slice(0, MAX_FILES)
        const shownPaths = new Set(filesToShow.map(f => f.path))
        const collapsedCount = allFiles.length - filesToShow.length

        const lines: string[] = []
        lines.push('%%{init: {"theme": "base", "themeVariables": {"primaryColor": "#1e293b", "primaryTextColor": "#e2e8f0", "lineColor": "#64748b", "secondaryColor": "#334155", "tertiaryColor": "#475569", "background": "#0f172a", "mainBkg": "#1e293b", "nodeBorder": "#475569"}}}%%')
        lines.push('graph TD')
        lines.push('')

        // Group files by top-level directory
        const byDir = new Map<string, typeof filesToShow>()
        for (const file of filesToShow) {
            const parts = file.path.split('/')
            const dir = parts.length > 1 ? parts.slice(0, -1).join('/') : '.'
            if (!byDir.has(dir)) byDir.set(dir, [])
            byDir.get(dir)!.push(file)
        }

        for (const [dir, files] of byDir) {
            const dirLabel = dir === '.' ? 'root' : dir
            lines.push(`    subgraph dir_${this.sanitizeId(dir)}["📂 ${dirLabel}"]`)
            for (const file of files) {
                const fileName = path.basename(file.path)
                const fnCount = Object.values(this.lock.functions).filter(f => f.file === file.path).length
                lines.push(`        ${this.sanitizeId(file.path)}["📄 ${fileName}${fnCount > 0 ? `<br/>${fnCount} fn` : ''}"]`)
            }
            lines.push('    end')
        }

        if (collapsedCount > 0) {
            lines.push(`    collapsed["📁 +${collapsedCount} more files"]`)
        }

        lines.push('')

        // Add import edges between shown files
        for (const file of filesToShow) {
            if (!file.imports) continue
            for (const imp of file.imports) {
                if (shownPaths.has(imp)) {
                    lines.push(`    ${this.sanitizeId(file.path)} --> ${this.sanitizeId(imp)}`)
                }
            }
        }

        // Style
        lines.push('')
        lines.push('    classDef default fill:#334155,stroke:#64748b,color:#e2e8f0,stroke-width:1px')

        return lines.join('\n')
    }

    private sanitizeId(id: string): string {
        return id.replace(/[^a-zA-Z0-9_]/g, '_')
    }
}
