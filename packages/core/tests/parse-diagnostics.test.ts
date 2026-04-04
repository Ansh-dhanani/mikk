import { describe, it, expect } from 'bun:test'
import { parseFilesWithDiagnostics } from '../src/parser/index'

describe('parseFilesWithDiagnostics preflight', () => {
    it('returns parser-unavailable diagnostic and no files in strict preflight mode', async () => {
        const result = await parseFilesWithDiagnostics(
            ['src/example.py'],
            '/project',
            async () => 'def run():\n  return 1\n',
            {
                strictParserPreflight: true,
                treeSitterRuntimeAvailable: false,
            },
        )

        expect(result.files).toHaveLength(0)
        expect(result.summary.requestedFiles).toBe(1)
        expect(result.summary.parsedFiles).toBe(0)
        expect(result.summary.diagnostics).toBeGreaterThan(0)
        expect(result.diagnostics.some(d => d.reason === 'parser-unavailable')).toBe(true)
    })

    it('falls back and continues in non-strict mode when parser runtime is unavailable', async () => {
        const result = await parseFilesWithDiagnostics(
            ['src/example.py'],
            '/project',
            async () => 'def run():\n  return 1\n',
            {
                strictParserPreflight: false,
                treeSitterRuntimeAvailable: false,
            },
        )

        expect(result.files).toHaveLength(1)
        expect(result.summary.diagnostics).toBeGreaterThan(0)
        expect(result.diagnostics.some(d => d.reason === 'parser-unavailable')).toBe(true)
    })

    it('skips tree-sitter preflight when only oxc/go files are requested', async () => {
        const result = await parseFilesWithDiagnostics(
            ['src/index.ts'],
            '/project',
            async () => 'export function ok(): number { return 1 }',
            {
                strictParserPreflight: true,
                treeSitterRuntimeAvailable: false,
            },
        )

        expect(result.summary.requestedFiles).toBe(1)
        expect(result.summary.parsedFiles).toBe(1)
        expect(result.diagnostics.some(d => d.reason === 'parser-unavailable')).toBe(false)
    })

    it('returns language-correct fallback files for multiple tree-sitter languages in non-strict mode', async () => {
        const files = [
            'src/main.py',
            'src/App.java',
            'src/service.kt',
            'src/tool.swift',
            'src/lib.rs',
            'src/Program.cs',
            'src/main.php',
            'src/app.rb',
            'src/native.c',
            'src/native.cpp',
        ]

        const result = await parseFilesWithDiagnostics(
            files,
            '/project',
            async () => '',
            {
                strictParserPreflight: false,
                treeSitterRuntimeAvailable: false,
            },
        )

        expect(result.files).toHaveLength(files.length)
        expect(result.diagnostics.some(d => d.reason === 'parser-unavailable')).toBe(true)

        const languageBySuffix = (suffix: string): string | undefined => {
            const hit = result.files.find(f => f.path.replace(/\\/g, '/').endsWith(suffix))
            return hit?.language
        }

        expect(languageBySuffix('/src/main.py')).toBe('python')
        expect(languageBySuffix('/src/App.java')).toBe('java')
        expect(languageBySuffix('/src/service.kt')).toBe('kotlin')
        expect(languageBySuffix('/src/tool.swift')).toBe('swift')
        expect(languageBySuffix('/src/lib.rs')).toBe('rust')
        expect(languageBySuffix('/src/Program.cs')).toBe('csharp')
        expect(languageBySuffix('/src/main.php')).toBe('php')
        expect(languageBySuffix('/src/app.rb')).toBe('ruby')
        expect(languageBySuffix('/src/native.c')).toBe('c')
        expect(languageBySuffix('/src/native.cpp')).toBe('cpp')
    })

    it('aborts full batch in strict preflight when any tree-sitter file is present', async () => {
        const result = await parseFilesWithDiagnostics(
            ['src/index.ts', 'src/main.py'],
            '/project',
            async () => 'export const ok = 1',
            {
                strictParserPreflight: true,
                treeSitterRuntimeAvailable: false,
            },
        )

        expect(result.files).toHaveLength(0)
        expect(result.summary.requestedFiles).toBe(2)
        expect(result.summary.parsedFiles).toBe(0)
        expect(result.diagnostics.some(d => d.reason === 'parser-unavailable')).toBe(true)
    })
})
