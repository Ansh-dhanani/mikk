import type { AIContext, ContextProvider } from './types.js'

/**
 * ClaudeProvider — formats context for Anthropic Claude models.
 *
 * Uses structured XML tags so Claude can parse boundaries clearly.
 * Includes meta block so the model knows how much context was trimmed.
 */
export class ClaudeProvider implements ContextProvider {
    name = 'claude'
    maxTokens = 200000

    formatContext(context: AIContext): string {
        const lines: string[] = []

        lines.push('<mikk_context>')

        // ── Project ────────────────────────────────────────────────────────
        lines.push(`<project name="${esc(context.project.name)}" language="${esc(context.project.language)}">`)
        lines.push(`  <description>${esc(context.project.description)}</description>`)
        lines.push(`  <stats modules="${context.project.moduleCount}" functions="${context.project.functionCount}"/>`)
        lines.push('</project>')
        lines.push('')

        // ── Context quality meta ───────────────────────────────────────────
        lines.push('<context_meta>')
        lines.push(`  <task>${esc(context.meta?.keywords?.join(', ') ?? '')}</task>`)
        lines.push(`  <seeds_found>${context.meta?.seedCount ?? 0}</seeds_found>`)
        lines.push(`  <functions_selected>${context.meta?.selectedFunctions ?? 0} of ${context.meta?.totalFunctionsConsidered ?? 0}</functions_selected>`)
        lines.push(`  <estimated_tokens>${context.meta?.estimatedTokens ?? 0}</estimated_tokens>`)
        lines.push('</context_meta>')
        lines.push('')

        // ── Modules ────────────────────────────────────────────────────────
        for (const mod of context.modules) {
            lines.push(`<module id="${esc(mod.id)}" name="${esc(mod.name)}">`)
            lines.push(`  <description>${esc(mod.description)}</description>`)
            if (mod.intent) lines.push(`  <intent>${esc(mod.intent)}</intent>`)
            lines.push(`  <files count="${mod.files.length}">`)
            for (const f of mod.files) {
                lines.push(`    <file>${esc(f)}</file>`)
            }
            lines.push('  </files>')

            if (mod.functions.length > 0) {
                lines.push('  <functions>')
                for (const fn of mod.functions) {
                    const calls = fn.calls.length > 0
                        ? ` calls="${esc(fn.calls.join(','))}"`
                        : ''
                    const calledBy = fn.calledBy.length > 0
                        ? ` calledBy="${esc(fn.calledBy.join(','))}"`
                        : ''
                    // Rich signature attributes
                    const asyncAttr = fn.isAsync ? ' async="true"' : ''
                    const exportedAttr = fn.isExported ? ' exported="true"' : ''
                    const retAttr = fn.returnType ? ` returns="${esc(fn.returnType)}"` : ''
                    const paramStr = fn.params && fn.params.length > 0
                        ? ` params="${esc(fn.params.map(p => `${p.name}${p.optional ? '?' : ''}: ${p.type}`).join(', '))}"`
                        : ''
                    lines.push(`    <fn name="${esc(fn.name)}" file="${esc(fn.file)}" lines="${fn.startLine}-${fn.endLine}"${asyncAttr}${exportedAttr}${paramStr}${retAttr}${calls}${calledBy}>`)
                    if (fn.purpose) lines.push(`      <purpose>${esc(fn.purpose)}</purpose>`)
                    if (fn.edgeCases && fn.edgeCases.length > 0) {
                        lines.push(`      <edge_cases>${esc(fn.edgeCases.join('; '))}</edge_cases>`)
                    }
                    if (fn.errorHandling && fn.errorHandling.length > 0) {
                        lines.push(`      <error_handling>${esc(fn.errorHandling.join('; '))}</error_handling>`)
                    }
                    if (fn.body) {
                        lines.push(`      <body>`)
                        lines.push(esc(fn.body))
                        lines.push(`      </body>`)
                    }
                    lines.push('    </fn>')
                }
                lines.push('  </functions>')
            }
            lines.push('</module>')
            lines.push('')
        }

        // ── Context files (schemas, data models, config) ───────────────────
        if (context.contextFiles && context.contextFiles.length > 0) {
            lines.push('<context_files>')
            for (const cf of context.contextFiles) {
                lines.push(`  <file path="${esc(cf.path)}" type="${esc(cf.type)}">`)
                // Trim to ~2000 chars per file to stay within token budget
                const maxChars = 2000
                if (cf.content.length > maxChars) {
                    lines.push(esc(cf.content.slice(0, maxChars)))
                    lines.push(`... (truncated)`)
                } else {
                    lines.push(esc(cf.content.trimEnd()))
                }
                lines.push('  </file>')
            }
            lines.push('</context_files>')
            lines.push('')
        }

        // ── Routes (HTTP endpoints) ────────────────────────────────────────
        if (context.routes && context.routes.length > 0) {
            lines.push('<routes>')
            for (const r of context.routes) {
                const mw = r.middlewares.length > 0 ? ` middlewares="${esc(r.middlewares.join(','))}"` : ''
                lines.push(`  <route method="${esc(r.method)}" path="${esc(r.path)}" handler="${esc(r.handler)}" file="${esc(r.file)}" line="${r.line}"${mw}/>`)
            }
            lines.push('</routes>')
            lines.push('')
        }

        // ── Constraints ────────────────────────────────────────────────────
        if (context.constraints.length > 0) {
            lines.push('<constraints>')
            for (const c of context.constraints) {
                lines.push(`  <constraint>${esc(c)}</constraint>`)
            }
            lines.push('</constraints>')
            lines.push('')
        }

        // ── Decisions ─────────────────────────────────────────────────────
        if (context.decisions.length > 0) {
            lines.push('<architectural_decisions>')
            for (const d of context.decisions) {
                lines.push(`  <decision title="${esc(d.title)}">${esc(d.reason)}</decision>`)
            }
            lines.push('</architectural_decisions>')
        }

        lines.push('</mikk_context>')
        return lines.join('\n')
    }
}

/**
 * GenericProvider — clean plain-text format for any model.
 * Identical to the natural-language prompt generated by ContextBuilder.
 */
export class GenericProvider implements ContextProvider {
    name = 'generic'
    maxTokens = 128000

    formatContext(context: AIContext): string {
        return context.prompt
    }
}

/**
 * CompactProvider — ultra-minimal format for small context windows.
 * One line per function, no XML, no prose.
 */
export class CompactProvider implements ContextProvider {
    name = 'compact'
    maxTokens = 16000

    formatContext(context: AIContext): string {
        const lines: string[] = [
            `# ${context.project.name} (${context.project.language})`,
            `Task keywords: ${context.meta?.keywords?.join(', ') ?? ''}`,
            '',
        ]
        for (const mod of context.modules) {
            lines.push(`## ${mod.name}`)
            for (const fn of mod.functions) {
                const asyncStr = fn.isAsync ? 'async ' : ''
                const params = fn.params?.map(p => `${p.name}: ${p.type}`).join(', ') || ''
                const retStr = fn.returnType ? `: ${fn.returnType}` : ''
                const calls = fn.calls.length > 0 ? ` → ${fn.calls.join(',')}` : ''
                lines.push(`  ${asyncStr}${fn.name}(${params})${retStr} [${fn.file}:${fn.startLine}]${calls}`)
                if (fn.body) {
                    lines.push('  ```')
                    lines.push(fn.body)
                    lines.push('  ```')
                }
            }
            lines.push('')
        }
        if (context.contextFiles && context.contextFiles.length > 0) {
            lines.push('## Schemas & Data Models')
            for (const cf of context.contextFiles) {
                lines.push(`### ${cf.path} (${cf.type})`)
                lines.push(cf.content.length > 1500 ? cf.content.slice(0, 1500) + '\n...(truncated)' : cf.content.trimEnd())
                lines.push('')
            }
        }
        if (context.routes && context.routes.length > 0) {
            lines.push('## Routes')
            for (const r of context.routes) {
                const mw = r.middlewares.length > 0 ? ` [${r.middlewares.join(', ')}]` : ''
                lines.push(`  ${r.method} ${r.path} → ${r.handler}${mw} (${r.file}:${r.line})`)
            }
            lines.push('')
        }
        if (context.constraints.length > 0) {
            lines.push('CONSTRAINTS: ' + context.constraints.join(' | '))
        }
        return lines.join('\n')
    }
}

export function getProvider(name: string): ContextProvider {
    switch (name.toLowerCase()) {
        case 'claude':
        case 'anthropic':
            return new ClaudeProvider()
        case 'compact':
            return new CompactProvider()
        default:
            return new GenericProvider()
    }
}

/** Minimal XML attribute escaping */
function esc(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
}