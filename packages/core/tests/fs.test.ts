import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'
import { detectProjectLanguage, getDiscoveryPatterns, parseMikkIgnore, type ProjectLanguage } from '../src/utils/fs'

// ── detectProjectLanguage ───────────────────────────────────────────

describe('detectProjectLanguage', () => {
    let tmpDir: string

    beforeAll(async () => {
        tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mikk-fs-test-'))
    })

    afterAll(async () => {
        await fs.rm(tmpDir, { recursive: true, force: true })
    })

    async function withFile(name: string, fn: () => Promise<void>) {
        const filePath = path.join(tmpDir, name)
        await fs.writeFile(filePath, '', 'utf-8')
        try {
            await fn()
        } finally {
            await fs.unlink(filePath).catch(() => {})
        }
    }

    it('detects TypeScript from tsconfig.json', async () => {
        await withFile('tsconfig.json', async () => {
            expect(await detectProjectLanguage(tmpDir)).toBe('typescript')
        })
    })

    it('detects Rust from Cargo.toml', async () => {
        await withFile('Cargo.toml', async () => {
            expect(await detectProjectLanguage(tmpDir)).toBe('rust')
        })
    })

    it('detects Go from go.mod', async () => {
        await withFile('go.mod', async () => {
            expect(await detectProjectLanguage(tmpDir)).toBe('go')
        })
    })

    it('detects Python from pyproject.toml', async () => {
        await withFile('pyproject.toml', async () => {
            expect(await detectProjectLanguage(tmpDir)).toBe('python')
        })
    })

    it('detects Python from requirements.txt', async () => {
        await withFile('requirements.txt', async () => {
            expect(await detectProjectLanguage(tmpDir)).toBe('python')
        })
    })

    it('detects Ruby from Gemfile', async () => {
        await withFile('Gemfile', async () => {
            expect(await detectProjectLanguage(tmpDir)).toBe('ruby')
        })
    })

    it('detects Java from pom.xml', async () => {
        await withFile('pom.xml', async () => {
            expect(await detectProjectLanguage(tmpDir)).toBe('java')
        })
    })

    it('detects PHP from composer.json', async () => {
        await withFile('composer.json', async () => {
            expect(await detectProjectLanguage(tmpDir)).toBe('php')
        })
    })

    it('detects C# from .csproj file', async () => {
        await withFile('MyApp.csproj', async () => {
            expect(await detectProjectLanguage(tmpDir)).toBe('csharp')
        })
    })

    it('detects C# from .sln file', async () => {
        await withFile('MyApp.sln', async () => {
            expect(await detectProjectLanguage(tmpDir)).toBe('csharp')
        })
    })

    it('detects JavaScript from package.json (no tsconfig)', async () => {
        await withFile('package.json', async () => {
            expect(await detectProjectLanguage(tmpDir)).toBe('javascript')
        })
    })

    it('returns unknown for empty directory', async () => {
        expect(await detectProjectLanguage(tmpDir)).toBe('unknown')
    })

    it('prioritises TypeScript over JavaScript', async () => {
        const tsconfig = path.join(tmpDir, 'tsconfig.json')
        const pkg = path.join(tmpDir, 'package.json')
        await fs.writeFile(tsconfig, '', 'utf-8')
        await fs.writeFile(pkg, '', 'utf-8')
        try {
            expect(await detectProjectLanguage(tmpDir)).toBe('typescript')
        } finally {
            await fs.unlink(tsconfig).catch(() => {})
            await fs.unlink(pkg).catch(() => {})
        }
    })
})

// ── getDiscoveryPatterns ────────────────────────────────────────────

describe('getDiscoveryPatterns', () => {
    const languages: ProjectLanguage[] = [
        'typescript', 'javascript', 'python', 'go', 'rust',
        'java', 'ruby', 'php', 'csharp', 'unknown',
    ]

    for (const lang of languages) {
        it(`returns patterns and ignore for ${lang}`, () => {
            const result = getDiscoveryPatterns(lang)
            expect(result.patterns.length).toBeGreaterThan(0)
            expect(result.ignore.length).toBeGreaterThan(0)
            // All patterns should be glob strings
            for (const p of result.patterns) {
                expect(typeof p).toBe('string')
                expect(p).toContain('*')
            }
        })
    }

    it('typescript includes JS files too', () => {
        const { patterns } = getDiscoveryPatterns('typescript')
        expect(patterns).toContain('**/*.ts')
        expect(patterns).toContain('**/*.js')
    })

    it('python patterns include .py', () => {
        const { patterns } = getDiscoveryPatterns('python')
        expect(patterns).toContain('**/*.py')
    })

    it('all languages ignore .mikk and .git', () => {
        for (const lang of languages) {
            const { ignore } = getDiscoveryPatterns(lang)
            expect(ignore).toContain('**/.mikk/**')
            expect(ignore).toContain('**/.git/**')
        }
    })
})

// ── parseMikkIgnore ─────────────────────────────────────────────────

describe('parseMikkIgnore', () => {
    it('parses non-empty lines', () => {
        const result = parseMikkIgnore('src/test/**\n\n# comment\nsrc/generated/**')
        expect(result).toEqual(['src/test/**', 'src/generated/**'])
    })

    it('returns empty array for empty content', () => {
        expect(parseMikkIgnore('')).toEqual([])
    })

    it('strips comments and blank lines', () => {
        const result = parseMikkIgnore('# ignore test files\n\n  \nfoo/**')
        expect(result).toEqual(['foo/**'])
    })

    it('converts trailing-slash directories without path to **/ glob', () => {
        const result = parseMikkIgnore('dist/\nnode_modules/')
        expect(result).toEqual(['**/dist/**', '**/node_modules/**'])
    })

    it('converts trailing-slash directories with path to ** glob', () => {
        const result = parseMikkIgnore('packages/*/tests/\napps/*/test/')
        expect(result).toEqual(['packages/*/tests/**', 'apps/*/test/**'])
    })

    it('handles bare file patterns without slash', () => {
        const result = parseMikkIgnore('*.d.ts\n*.log')
        expect(result).toEqual(['**/*.d.ts', '**/*.log'])
    })
})
