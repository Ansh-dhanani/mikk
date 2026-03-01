import type { MikkContract, MikkLock, MikkLockFunction } from '@ansh_dhanani/core'

/** Default token budget for claude.md — prevents bloating the context window */
const DEFAULT_TOKEN_BUDGET = 6000

/** Rough token estimation: ~4 chars per token */
function estimateTokens(text: string): number {
    return Math.ceil(text.length / 4)
}

/**
 * ClaudeMdGenerator — generates an always-accurate `claude.md` and `AGENTS.md`
 * from the lock file and contract. Every function name, file path, and module
 * relationship is sourced from the AST-derived lock file — never hand-authored.
 *
 * Tiered system per spec:
 *  Tier 1: Summary (~500 tokens) — always included
 *  Tier 2: Module details (~300 tokens/module) — included if budget allows
 *  Tier 3: Recent changes (~50 tokens/change) — last section added
 */
export class ClaudeMdGenerator {
    constructor(
        private contract: MikkContract,
        private lock: MikkLock,
        private tokenBudget: number = DEFAULT_TOKEN_BUDGET
    ) { }

    /** Generate the full claude.md content */
    generate(): string {
        const sections: string[] = []
        let usedTokens = 0

        // ── Tier 1: Summary (always included) ──────────────────────
        const summary = this.generateSummary()
        sections.push(summary)
        usedTokens += estimateTokens(summary)

        // ── Tier 2: Module details (if budget allows) ──────────────
        const modules = this.getModulesSortedByDependencyOrder()
        for (const module of modules) {
            const moduleSection = this.generateModuleSection(module.id)
            const tokens = estimateTokens(moduleSection)
            if (usedTokens + tokens > this.tokenBudget) {
                sections.push('\n> Full details available in `mikk.lock.json`\n')
                break
            }
            sections.push(moduleSection)
            usedTokens += tokens
        }

        // ── Tier 3: Constraints & decisions ────────────────────────
        const constraintsSection = this.generateConstraintsSection()
        const constraintTokens = estimateTokens(constraintsSection)
        if (usedTokens + constraintTokens <= this.tokenBudget) {
            sections.push(constraintsSection)
            usedTokens += constraintTokens
        }

        const decisionsSection = this.generateDecisionsSection()
        const decisionTokens = estimateTokens(decisionsSection)
        if (usedTokens + decisionTokens <= this.tokenBudget) {
            sections.push(decisionsSection)
            usedTokens += decisionTokens
        }

        return sections.join('\n')
    }

    // ── Tier 1: Summary ───────────────────────────────────────────

    private generateSummary(): string {
        const lines: string[] = []
        const moduleCount = this.contract.declared.modules.length
        const functionCount = Object.keys(this.lock.functions).length
        const fileCount = Object.keys(this.lock.files).length

        lines.push(`# ${this.contract.project.name} — Architecture Overview`)
        lines.push('')

        if (this.contract.project.description) {
            lines.push('## What this project does')
            lines.push(this.contract.project.description)
            lines.push('')
        }

        lines.push('## Modules')
        for (const module of this.contract.declared.modules) {
            const fnCount = Object.values(this.lock.functions)
                .filter(f => f.moduleId === module.id).length
            const desc = module.intent || module.description || ''
            const descStr = desc ? ` — ${desc}` : ''
            lines.push(`- **${module.name}** (\`${module.id}\`): ${fnCount} functions${descStr}`)
        }
        lines.push('')

        lines.push(`## Stats`)
        lines.push(`- ${fileCount} files, ${functionCount} functions, ${moduleCount} modules`)
        lines.push(`- Language: ${this.contract.project.language}`)
        lines.push('')

        // Critical constraints summary
        if (this.contract.declared.constraints.length > 0) {
            lines.push('## Critical Constraints')
            for (const c of this.contract.declared.constraints) {
                lines.push(`- ${c}`)
            }
            lines.push('')
        }

        return lines.join('\n')
    }

    // ── Tier 2: Module Details ────────────────────────────────────

    private generateModuleSection(moduleId: string): string {
        const module = this.contract.declared.modules.find(m => m.id === moduleId)
        if (!module) return ''

        const lines: string[] = []
        const moduleFunctions = Object.values(this.lock.functions)
            .filter(f => f.moduleId === moduleId)

        lines.push(`## ${module.name} module`)

        // Location
        if (module.paths.length > 0) {
            lines.push(`**Location:** ${module.paths.join(', ')}`)
        }

        // Intent
        if (module.intent) {
            lines.push(`**Purpose:** ${module.intent}`)
        } else if (module.description) {
            lines.push(`**Purpose:** ${module.description}`)
        }

        lines.push('')

        // Entry points: functions with no calledBy (likely public API surface)
        const entryPoints = moduleFunctions
            .filter(fn => fn.calledBy.length === 0)
            .sort((a, b) => b.calls.length - a.calls.length)
            .slice(0, 5)

        if (entryPoints.length > 0) {
            lines.push('**Entry points:**')
            for (const fn of entryPoints) {
                const sig = this.formatSignature(fn)
                const purpose = fn.purpose ? ` — ${fn.purpose}` : ''
                lines.push(`  - \`${sig}\`${purpose}`)
            }
            lines.push('')
        }

        // Key functions: top 5 by calledBy count (most depended upon)
        const keyFunctions = [...moduleFunctions]
            .sort((a, b) => b.calledBy.length - a.calledBy.length)
            .filter(fn => fn.calledBy.length > 0)
            .slice(0, 5)

        if (keyFunctions.length > 0) {
            lines.push('**Key internal functions:**')
            for (const fn of keyFunctions) {
                const callerCount = fn.calledBy.length
                const purpose = fn.purpose ? ` — ${fn.purpose}` : ''
                lines.push(`  - \`${fn.name}\` (called by ${callerCount})${purpose}`)
            }
            lines.push('')
        }

        // Dependencies: other modules this module imports from
        const depModuleIds = new Set<string>()
        for (const fn of moduleFunctions) {
            for (const callId of fn.calls) {
                const target = this.lock.functions[callId]
                if (target && target.moduleId !== moduleId) {
                    depModuleIds.add(target.moduleId)
                }
            }
        }

        if (depModuleIds.size > 0) {
            const depNames = [...depModuleIds].map(id => {
                const mod = this.contract.declared.modules.find(m => m.id === id)
                return mod?.name || id
            })
            lines.push(`**Depends on:** ${depNames.join(', ')}`)
            lines.push('')
        }

        // Module-specific constraints
        const moduleConstraints = this.contract.declared.constraints.filter(c =>
            c.toLowerCase().includes(moduleId.toLowerCase()) ||
            c.toLowerCase().includes(module.name.toLowerCase())
        )
        if (moduleConstraints.length > 0) {
            lines.push('**Constraints:**')
            for (const c of moduleConstraints) {
                lines.push(`  - ${c}`)
            }
            lines.push('')
        }

        return lines.join('\n')
    }

    // ── Tier 3: Constraints & Decisions ───────────────────────────

    private generateConstraintsSection(): string {
        if (this.contract.declared.constraints.length === 0) return ''
        const lines: string[] = []
        lines.push('## Cross-Cutting Constraints')
        for (const c of this.contract.declared.constraints) {
            lines.push(`- ${c}`)
        }
        lines.push('')
        return lines.join('\n')
    }

    private generateDecisionsSection(): string {
        if (this.contract.declared.decisions.length === 0) return ''
        const lines: string[] = []
        lines.push('## Architectural Decisions')
        for (const d of this.contract.declared.decisions) {
            lines.push(`- **${d.title}:** ${d.reason}`)
        }
        lines.push('')
        return lines.join('\n')
    }

    // ── Helpers ───────────────────────────────────────────────────

    /** Format a function into a readable signature */
    private formatSignature(fn: MikkLockFunction): string {
        return `${fn.name}() [${fn.file}:${fn.startLine}]`
    }

    /** Sort modules by inter-module dependency order (depended-on modules first) */
    private getModulesSortedByDependencyOrder(): typeof this.contract.declared.modules {
        const modules = [...this.contract.declared.modules]
        const dependencyCount = new Map<string, number>()

        for (const mod of modules) {
            dependencyCount.set(mod.id, 0)
        }

        // Count how many other modules depend on each module
        for (const fn of Object.values(this.lock.functions)) {
            for (const callId of fn.calls) {
                const target = this.lock.functions[callId]
                if (target && target.moduleId !== fn.moduleId) {
                    dependencyCount.set(
                        target.moduleId,
                        (dependencyCount.get(target.moduleId) || 0) + 1
                    )
                }
            }
        }

        // Sort: most depended-on first
        return modules.sort((a, b) =>
            (dependencyCount.get(b.id) || 0) - (dependencyCount.get(a.id) || 0)
        )
    }
}
