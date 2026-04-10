import { describe, test, expect, beforeEach } from 'bun:test'
import { QuerySuggestionEngine } from '../src/query-suggestions'

describe('QuerySuggestionEngine', () => {
    let engine: QuerySuggestionEngine

    beforeEach(() => {
        engine = new QuerySuggestionEngine()
    })

    describe('suggest', () => {
        test('suggests based on common patterns - create', () => {
            const suggestions = engine.suggest({
                taskDescription: 'create a new user function',
            })
            
            expect(suggestions.length).toBeGreaterThan(0)
            expect(suggestions.some(s => s.tags.includes('create'))).toBe(true)
        })

        test('suggests based on common patterns - fix', () => {
            const suggestions = engine.suggest({
                taskDescription: 'fix the login bug',
            })
            
            expect(suggestions.length).toBeGreaterThan(0)
            expect(suggestions.some(s => s.tags.includes('fix') || s.tags.includes('debug'))).toBe(true)
        })

        test('suggests based on common patterns - refactor', () => {
            const suggestions = engine.suggest({
                taskDescription: 'refactor the auth module',
            })
            
            expect(suggestions.length).toBeGreaterThan(0)
            expect(suggestions.some(s => s.tags.includes('refactor'))).toBe(true)
        })

        test('suggests based on common patterns - test', () => {
            const suggestions = engine.suggest({
                taskDescription: 'write tests for parser',
            })
            
            expect(suggestions.length).toBeGreaterThan(0)
            expect(suggestions.some(s => s.tags.includes('test'))).toBe(true)
        })

        test('suggests auth module for auth keywords', () => {
            const suggestions = engine.suggest({
                taskDescription: 'implement JWT token verification',
            })
            
            expect(suggestions.some(s => s.focusModules?.includes('auth'))).toBe(true)
        })

        test('suggests db module for database keywords', () => {
            const suggestions = engine.suggest({
                taskDescription: 'optimize the SQL query',
            })
            
            expect(suggestions.some(s => s.focusModules?.includes('db'))).toBe(true)
        })

        test('suggests based on current file context', () => {
            const suggestions = engine.suggest({
                taskDescription: 'add validation',
                currentFile: 'src/auth/validator.ts',
            })
            
            expect(suggestions.some(s => s.focusFiles?.some(f => f.includes('validator')))).toBe(true)
        })

        test('suggests based on current module context', () => {
            const suggestions = engine.suggest({
                taskDescription: 'add error handling',
                currentModule: 'utils',
            })
            
            expect(suggestions.some(s => s.focusModules?.includes('utils'))).toBe(true)
        })

        test('limits suggestions to 10', () => {
            const suggestions = engine.suggest({
                taskDescription: 'fix add create delete update remove the thing',
            })
            
            expect(suggestions.length).toBeLessThanOrEqual(10)
        })

        test('sorts suggestions by confidence descending', () => {
            const suggestions = engine.suggest({
                taskDescription: 'fix login bug',
            })
            
            for (let i = 1; i < suggestions.length; i++) {
                expect(suggestions[i - 1].confidence).toBeGreaterThanOrEqual(suggestions[i].confidence)
            }
        })

        test('handles empty task description', () => {
            const suggestions = engine.suggest({
                taskDescription: '',
            })
            
            expect(Array.isArray(suggestions)).toBe(true)
        })

        test('handles very long task description', () => {
            const longTask = 'fix the ' + 'bug '.repeat(100)
            const suggestions = engine.suggest({
                taskDescription: longTask,
            })
            
            expect(Array.isArray(suggestions)).toBe(true)
        })
    })

    describe('extractKeywords', () => {
        test('extracts module keywords', () => {
            const keywords = engine.extractKeywords('implement login and token validation')
            
            expect(keywords).toContain('auth')
        })

        test('extracts db keywords', () => {
            const keywords = engine.extractKeywords('write database query')
            
            expect(keywords).toContain('db')
        })

        test('extracts general keywords from task', () => {
            const keywords = engine.extractKeywords('implement user registration flow')
            
            expect(keywords.some(k => ['user', 'registration', 'implement'].includes(k))).toBe(true)
        })

        test('deduplicates keywords', () => {
            const keywords = engine.extractKeywords('auth auth authentication authenticate')
            
            const authCount = keywords.filter(k => k === 'auth').length
            expect(authCount).toBe(1)
        })

        test('filters short words', () => {
            const keywords = engine.extractKeywords('a b c d test')
            
            expect(keywords.some(k => k.length < 4)).toBe(false)
        })

        test('limits to 5 general keywords', () => {
            const keywords = engine.extractKeywords('one two three four five six seven eight nine ten')
            
            const generalKeywords = keywords.filter(k => 
                !['auth', 'api', 'db', 'ui', 'utils', 'core'].includes(k)
            )
            expect(generalKeywords.length).toBeLessThanOrEqual(5)
        })
    })

    describe('suggestQueryRefinement', () => {
        test('suggests simpler query when no results', () => {
            const refined = engine.suggestQueryRefinement('long complex query', 0)
            
            expect(refined).toBeTruthy()
        })

        test('suggests more specific when too many results', () => {
            const refined = engine.suggestQueryRefinement('test', 100)
            
            expect(refined).toContain('more specific')
        })

        test('returns original when results are reasonable', () => {
            const refined = engine.suggestQueryRefinement('login', 20)
            
            expect(refined).toBe('login')
        })
    })

    describe('edge cases', () => {
        test('handles unicode in task', () => {
            const suggestions = engine.suggest({
                taskDescription: '修复登录问题 测试函数 🔥',
            })
            
            expect(Array.isArray(suggestions)).toBe(true)
        })

        test('handles special characters', () => {
            const suggestions = engine.suggest({
                taskDescription: 'test <>&"\'/\\ regex',
            })
            
            expect(Array.isArray(suggestions)).toBe(true)
        })

        test('handles mixed case patterns', () => {
            const suggestions = engine.suggest({
                taskDescription: 'FIX the ADD bug CREATE',
            })
            
            expect(suggestions.length).toBeGreaterThan(0)
        })

        test('handles task with only stop words', () => {
            const suggestions = engine.suggest({
                taskDescription: 'the and or for in on',
            })
            
            expect(Array.isArray(suggestions)).toBe(true)
        })

        test('handles all module keywords in one task', () => {
            const suggestions = engine.suggest({
                taskDescription: 'login query render format config init',
            })
            
            const moduleSuggestions = suggestions.filter(s => s.focusModules)
            expect(moduleSuggestions.length).toBeGreaterThan(0)
        })
    })
})
