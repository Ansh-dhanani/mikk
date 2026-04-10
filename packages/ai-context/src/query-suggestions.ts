import type { ContextQuery } from './types.js'

export interface QuerySuggestion {
    query: string
    reason: string
    confidence: number
    focusModules?: string[]
    focusFiles?: string[]
    tags: string[]
}

export interface SuggestionContext {
    taskDescription: string
    recentQueries?: string[]
    currentModule?: string
    currentFile?: string
}

export class QuerySuggestionEngine {
    private commonPatterns: Map<RegExp, QuerySuggestion[]> = new Map([
        [
            /add|create|new|implement/i,
            [
                { query: '{action} {entity}', reason: 'Use action-entity pattern', confidence: 0.9, tags: ['create', 'pattern'] },
            ]
        ],
        [
            /fix|bug|error|issue/i,
            [
                { query: '{function} not working', reason: 'Search for specific function', confidence: 0.85, tags: ['fix', 'debug'] },
                { query: '{error}', reason: 'Match error message', confidence: 0.8, tags: ['fix', 'error'] },
            ]
        ],
        [
            /refactor|rename|change/i,
            [
                { query: '{function}', reason: 'Find function to rename', confidence: 0.9, tags: ['refactor'] },
                { query: '{module}', reason: 'Find related functions in module', confidence: 0.75, tags: ['refactor', 'module'] },
            ]
        ],
        [
            /test|testing/i,
            [
                { query: '{function}', reason: 'Find function to test', confidence: 0.8, tags: ['test'] },
                { query: 'module:{module}', reason: 'Test all functions in module', confidence: 0.7, tags: ['test', 'module'] },
            ]
        ],
        [
            /api|endpoint|route/i,
            [
                { query: '{verb} /{path}', reason: 'Match REST endpoint', confidence: 0.95, tags: ['api'] },
                { query: 'middleware', reason: 'Find middleware functions', confidence: 0.8, tags: ['api', 'middleware'] },
            ]
        ],
        [
            /auth|login|jwt|token/i,
            [
                { query: 'auth', reason: 'Focus on auth module', confidence: 0.9, tags: ['auth', 'security'] },
                { query: 'verifyToken', reason: 'Find token verification', confidence: 0.85, tags: ['auth', 'jwt'] },
            ]
        ],
        [
            /db|database|query|sql/i,
            [
                { query: 'db', reason: 'Focus on database module', confidence: 0.9, tags: ['database'] },
                { query: 'query', reason: 'Find query functions', confidence: 0.8, tags: ['database'] },
            ]
        ],
    ])

    private moduleKeywords: Map<string, string[]> = new Map([
        ['auth', ['login', 'logout', 'register', 'verify', 'token', 'jwt', 'password', 'session']],
        ['api', ['endpoint', 'route', 'handler', 'controller', 'middleware']],
        ['db', ['query', 'insert', 'update', 'delete', 'transaction', 'connection']],
        ['ui', ['render', 'component', 'display', 'view', 'page']],
        ['utils', ['format', 'parse', 'validate', 'transform', 'convert']],
        ['core', ['main', 'init', 'start', 'setup', 'config']],
    ])

    suggest(context: SuggestionContext): QuerySuggestion[] {
        const suggestions: QuerySuggestion[] = []
        const lowerTask = context.taskDescription.toLowerCase()

        for (const [pattern, patternSuggestions] of this.commonPatterns) {
            if (pattern.test(context.taskDescription)) {
                for (const suggestion of patternSuggestions) {
                    const populated = this.populateSuggestion(suggestion, context)
                    suggestions.push(populated)
                }
            }
        }

        for (const [moduleName, keywords] of this.moduleKeywords) {
            const matches = keywords.filter(kw => lowerTask.includes(kw))
            if (matches.length > 0) {
                suggestions.push({
                    query: moduleName,
                    reason: `Found keywords: ${matches.join(', ')}`,
                    confidence: 0.85,
                    focusModules: [moduleName],
                    tags: ['module-suggestion'],
                })
            }
        }

        if (context.currentFile) {
            const fileName = context.currentFile.split('/').pop()?.replace(/\.[^.]+$/, '')
            if (fileName) {
                suggestions.push({
                    query: fileName,
                    reason: 'Based on current file',
                    confidence: 0.7,
                    focusFiles: [context.currentFile],
                    tags: ['context-aware'],
                })
            }
        }

        if (context.currentModule) {
            suggestions.push({
                query: context.taskDescription,
                reason: `Extend search to ${context.currentModule} module`,
                confidence: 0.65,
                focusModules: [context.currentModule],
                tags: ['context-aware', 'module'],
            })
        }

        suggestions.sort((a, b) => b.confidence - a.confidence)

        return suggestions.slice(0, 10)
    }

    private populateSuggestion(suggestion: QuerySuggestion, context: SuggestionContext): QuerySuggestion {
        let query = suggestion.query

        const words = context.taskDescription.split(/\s+/)
        const actionWords = words.filter(w => /^(add|create|fix|update|delete|rename|refactor)$/i.test(w))
        const entityWords = words.filter(w => w.length > 3 && !/^(the|to|for|with|and|or)$/i.test(w))

        query = query.replace('{action}', actionWords[0] || 'add')
        query = query.replace('{entity}', entityWords[0] || 'feature')
        query = query.replace('{function}', context.currentFile?.split('/').pop()?.replace(/\.[^.]+$/, '') || 'function')
        query = query.replace('{error}', 'error handling')
        query = query.replace('{module}', context.currentModule || 'module')
        query = query.replace('{verb}', 'GET')
        query = query.replace('{path}', '/api/resource')

        return {
            ...suggestion,
            query,
        }
    }

    learn(query: string, wasHelpful: boolean, context: SuggestionContext): void {
        // Future: Learn from user feedback to improve suggestions
        // This could store patterns in localStorage or a config file
    }

    extractKeywords(task: string): string[] {
        const keywords: string[] = []
        const lower = task.toLowerCase()

        for (const [module, moduleKeywords] of this.moduleKeywords) {
            if (moduleKeywords.some(kw => lower.includes(kw))) {
                keywords.push(module)
            }
        }

        const words = task.match(/[a-z]+/gi) || []
        keywords.push(...words.filter(w => w.length >= 4).slice(0, 5))

        return [...new Set(keywords)]
    }

    suggestQueryRefinement(query: string, resultsCount: number): string {
        if (resultsCount === 0) {
            const words = query.split(/\s+/)
            if (words.length > 1) {
                return words[0]
            }
            return query
        }

        if (resultsCount > 50) {
            return `more specific: ${query}`
        }

        return query
    }
}

export const querySuggestionEngine = new QuerySuggestionEngine()
