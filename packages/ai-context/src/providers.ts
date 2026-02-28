import type { AIContext, ContextProvider } from './types.js'

/**
 * ClaudeProvider — formats context for Anthropic Claude models.
 * Uses XML tags for structured context delivery.
 */
export class ClaudeProvider implements ContextProvider {
    name = 'claude'
    maxTokens = 200000

    formatContext(context: AIContext): string {
        const lines: string[] = []

        lines.push('<architecture>')
        lines.push(`<project name="${context.project.name}" language="${context.project.language}">`)
        lines.push(`  <description>${context.project.description}</description>`)
        lines.push(`  <stats modules="${context.project.moduleCount}" functions="${context.project.functionCount}" />`)
        lines.push('</project>')

        for (const mod of context.modules) {
            lines.push(`<module id="${mod.id}" name="${mod.name}">`)
            lines.push(`  <description>${mod.description}</description>`)
            if (mod.intent) lines.push(`  <intent>${mod.intent}</intent>`)

            for (const fn of mod.functions) {
                const calls = fn.calls.length > 0 ? ` calls="${fn.calls.join(',')}"` : ''
                const calledBy = fn.calledBy.length > 0 ? ` calledBy="${fn.calledBy.join(',')}"` : ''
                lines.push(`  <function name="${fn.name}" file="${fn.file}" lines="${fn.startLine}-${fn.endLine}"${calls}${calledBy} />`)
            }
            lines.push('</module>')
        }

        if (context.constraints.length > 0) {
            lines.push('<constraints>')
            for (const c of context.constraints) {
                lines.push(`  <constraint>${c}</constraint>`)
            }
            lines.push('</constraints>')
        }

        if (context.decisions.length > 0) {
            lines.push('<decisions>')
            for (const d of context.decisions) {
                lines.push(`  <decision title="${d.title}">${d.reason}</decision>`)
            }
            lines.push('</decisions>')
        }

        lines.push('</architecture>')
        return lines.join('\n')
    }
}

/**
 * GenericProvider — formats context as plain text for any model.
 */
export class GenericProvider implements ContextProvider {
    name = 'generic'
    maxTokens = 128000

    formatContext(context: AIContext): string {
        return context.prompt
    }
}

/**
 * Get the appropriate provider by name.
 */
export function getProvider(name: string): ContextProvider {
    switch (name.toLowerCase()) {
        case 'claude':
        case 'anthropic':
            return new ClaudeProvider()
        default:
            return new GenericProvider()
    }
}
