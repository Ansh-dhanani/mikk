import { describe, it, expect } from 'bun:test'
import { parseFilesWithDiagnostics } from '../src/parser/index'

describe('parseFilesWithDiagnostics regressions', () => {
    it('returns language-correct fallback files for unsupported extensions', async () => {
        const files = ['src/main.xyz']
        const result = await parseFilesWithDiagnostics(
            files,
            '/project',
            async () => '',
        )

        expect(result.files).toHaveLength(files.length)
        expect(result.diagnostics.some(d => d.reason === 'unsupported-extension')).toBe(true)
    })

    it('correctly parses mixed oxc and tree-sitter files', async () => {
        const result = await parseFilesWithDiagnostics(
            ['src/index.ts', 'src/main.py'],
            '/project',
            async (fp) => fp.endsWith('.ts') ? 'export const x = 1' : 'def run(): pass',
        )

        expect(result.summary.parsedFiles).toBe(2)
        expect(result.files.some(f => f.language === 'python')).toBe(true)
        expect(result.files.some(f => f.language === 'typescript')).toBe(true)
    })
})
