import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import fg from 'fast-glob'

// ─── Well-known patterns for schema/config/route files ─────────────
// These are structural files an AI agent needs but aren't source code.
// Mikk auto-discovers them so the AI doesn't have to explore the filesystem.
// Patterns are language-agnostic — unused patterns simply return zero matches.
const CONTEXT_FILE_PATTERNS = [
    // Data models / schemas — JS/TS
    '**/prisma/schema.prisma',
    '**/drizzle/**/*.ts',
    '**/schema/**/*.{ts,js,graphql,gql,sql}',
    '**/models/**/*.{ts,js}',
    '**/*.schema.{ts,js}',
    '**/*.model.{ts,js}',
    // Data models / schemas — Python
    '**/models.py',
    '**/schemas.py',
    '**/serializers.py',
    '**/models/**/*.py',
    // Data models / schemas — Ruby
    '**/app/models/**/*.rb',
    '**/db/schema.rb',
    // Data models / schemas — Go / Rust / Java / PHP
    '**/models/*.go',
    '**/*_model.go',
    '**/schema.rs',
    '**/models.rs',
    '**/entity/**/*.java',
    '**/model/**/*.java',
    '**/dto/**/*.java',
    '**/Entities/**/*.php',
    '**/Models/**/*.php',
    // GraphQL / Proto
    '**/*.graphql',
    '**/*.gql',
    '**/*.proto',
    // API definitions
    '**/openapi.{yaml,yml,json}',
    '**/swagger.{yaml,yml,json}',
    // Route definitions
    '**/routes/**/*.{ts,js}',
    '**/router.{ts,js}',
    // Database migrations (latest only) — multi-language
    '**/migrations/**/migration.sql',
    '**/db/migrate/**/*.rb',
    '**/alembic/**/*.py',
    '**/migrations/**/*.sql',
    // Type definitions
    '**/types/**/*.{ts,js}',
    '**/types.{ts,js}',
    '**/interfaces/**/*.{ts,js}',
    // Config files
    '**/docker-compose.{yml,yaml}',
    '**/Dockerfile',
    '.env.example',
    '.env.local.example',
    // Schema definitions — general
    '**/schema.{yaml,yml,json}',
    '**/*.avsc',
    '**/*.thrift',
]

const CONTEXT_FILE_IGNORE = [
    // JavaScript / TypeScript
    '**/node_modules/**',
    '**/dist/**',
    '**/.next/**',
    '**/.nuxt/**',
    '**/.svelte-kit/**',
    '**/.astro/**',
    '**/*.d.ts',
    '**/*.test.{ts,js,tsx,jsx}',
    '**/*.spec.{ts,js,tsx,jsx}',
    // General
    '**/build/**',
    '**/coverage/**',
    '**/.mikk/**',
    '**/.git/**',
    // Python
    '**/__pycache__/**',
    '**/*.pyc',
    '**/venv/**',
    '**/.venv/**',
    '**/.tox/**',
    // Go
    '**/vendor/**',
    // Rust / Java
    '**/target/**',
    // C# / .NET
    '**/bin/**',
    '**/obj/**',
    // Ruby / PHP
    '**/vendor/**',
    // Elixir
    '**/deps/**',
    '**/_build/**',
    // Gradle
    '**/.gradle/**',
]

/** Category of a discovered context file */
export type ContextFileType = 'schema' | 'model' | 'types' | 'routes' | 'config' | 'api-spec' | 'migration' | 'docker'

/** A discovered context file with its content and inferred category */
export interface ContextFile {
    /** Relative path from project root */
    path: string
    /** Raw content of the file */
    content: string
    /** Inferred category */
    type: ContextFileType
    /** File size in bytes */
    size: number
}

/** Maximum size (in bytes) for a single context file — skip huge files */
const MAX_CONTEXT_FILE_SIZE = 50_000 // ~50KB

// ─── .mikkignore support ───────────────────────────────────────────

/**
 * Read a .mikkignore file from the project root and parse it into
 * fast-glob compatible ignore patterns.
 *
 * Syntax: gitignore-style.
 *   - Lines starting with # are comments
 *   - Blank lines are ignored
 *   - Patterns without / match anywhere in the path (e.g. "dist" ignores "dist/index.js" and "src/dist/util.js")
 *   - Patterns with / are relative to root
 *   - Negation (!) lines are skipped (not yet supported)
 */

export async function readMikkIgnore(projectRoot: string): Promise<string[]> {
    const ignorePath = path.join(projectRoot, '.mikkignore')
    try {
        const content = await fs.readFile(ignorePath, 'utf-8')
        return parseMikkIgnore(content)
    } catch {
        return [] // no .mikkignore — that's fine
    }
}

/** Parse .mikkignore content into fast-glob ignore patterns (exported for testing) */
export function parseMikkIgnore(content: string): string[] {
    const patterns: string[] = []
    for (const raw of content.split('\n')) {
        const line = raw.trim()
        if (!line || line.startsWith('#')) continue
        if (line.startsWith('!')) continue // negations not yet supported

        const isDir = line.endsWith('/')
        // If pattern has no slash (ignoring trailing slash), match anywhere → prepend **/
        const stripped = isDir ? line.slice(0, -1) : line
        const hasSlash = stripped.includes('/')

        if (!hasSlash) {
            if (isDir) {
                // e.g. "dist/" → "**/{dist}/**" — ignore the directory and everything within it
                patterns.push(`**/${stripped}/**`)
            } else {
                // e.g. "*.svg" → "**/*.svg"
                patterns.push(`**/${line}`)
            }
        } else {
            if (isDir) {
                // e.g. "packages/*/tests/" → "packages/*/tests/**"
                patterns.push(`${stripped}/**`)
            } else {
                // e.g. "components/ui/**" — relative to root, already valid
                patterns.push(line)
            }
        }
    }
    return patterns
}

/**
 * Discover structural / schema / config files that help an AI agent understand
 * the project's data models, API definitions, route structure, and config.
 *
 * This is technology-agnostic: it works for Prisma, Drizzle, GraphQL, SQL,
 * Protobuf, Docker, OpenAPI, and more — anything with a well-known file pattern.
 */
export async function discoverContextFiles(projectRoot: string): Promise<ContextFile[]> {
    const mikkIgnore = await readMikkIgnore(projectRoot)
    const files = await fg(CONTEXT_FILE_PATTERNS, {
        cwd: projectRoot,
        ignore: [...CONTEXT_FILE_IGNORE, ...mikkIgnore],
        absolute: false,
        onlyFiles: true,
    })

    const normalised = files.map(f => f.replace(/\\/g, '/'))

    // Deduplicate — some patterns overlap (e.g. models/*.ts also matched by source discovery)
    const unique = [...new Set(normalised)]

    const results: ContextFile[] = []

    for (const relPath of unique) {
        const absPath = path.join(projectRoot, relPath)
        try {
            const stat = await fs.stat(absPath)
            if (stat.size > MAX_CONTEXT_FILE_SIZE) continue // skip huge files
            if (stat.size === 0) continue

            const content = await fs.readFile(absPath, 'utf-8')
            const type = inferContextFileType(relPath)

            results.push({ path: relPath, content, type, size: stat.size })
        } catch {
            // File unreadable — skip
        }
    }

    // Sort: schemas/models first, then types, routes, config
    const priority: Record<ContextFileType, number> = {
        schema: 0,
        model: 1,
        types: 2,
        'api-spec': 3,
        routes: 4,
        migration: 5,
        docker: 6,
        config: 7,
    }
    results.sort((a, b) => priority[a.type] - priority[b.type])

    // If we have a schema file (e.g. prisma/schema.prisma), the migrations
    // are redundant — they represent historical deltas, not the current state.
    // Including them wastes AI tokens and can be actively misleading.
    const hasSchema = results.some(f => f.type === 'schema')
    if (hasSchema) {
        return results.filter(f => f.type !== 'migration')
    }

    return results
}

/** Infer the context file's category from its path */
function inferContextFileType(filePath: string): ContextFileType {
    const lower = filePath.toLowerCase()
    // Schema files — multi-language
    if (lower.includes('prisma/schema') || lower.endsWith('.prisma')) return 'schema'
    if (lower.includes('drizzle/') || lower.includes('.schema.')) return 'schema'
    if (lower.endsWith('.graphql') || lower.endsWith('.gql')) return 'schema'
    if (lower.endsWith('.avsc') || lower.endsWith('.thrift')) return 'schema'
    if (lower.endsWith('db/schema.rb')) return 'schema'
    if (lower.endsWith('schema.rs')) return 'schema'
    if (lower.endsWith('.proto')) return 'api-spec'
    if (lower.includes('openapi') || lower.includes('swagger')) return 'api-spec'
    // Migrations — multi-language
    if (lower.endsWith('.sql') && lower.includes('migration')) return 'migration'
    if (lower.includes('db/migrate/')) return 'migration'
    if (lower.includes('alembic/')) return 'migration'
    if (lower.endsWith('.sql')) return 'schema'
    // Models — any language
    if (lower.includes('/models/') || lower.includes('/model/')) return 'model'
    if (lower.endsWith('.model.ts') || lower.endsWith('.model.js') || lower.endsWith('.model.go')) return 'model'
    if (lower.endsWith('models.py') || lower.endsWith('serializers.py') || lower.endsWith('schemas.py')) return 'model'
    if (lower.includes('/entity/') || lower.includes('/dto/') || lower.includes('/entities/')) return 'model'
    if (lower.endsWith('_model.go') || lower.endsWith('models.rs')) return 'model'
    // Types / Interfaces
    if (lower.includes('/types/') || lower.startsWith('types/') || lower.endsWith('/types.ts') || lower.endsWith('/types.js')) return 'types'
    if (lower.includes('/interfaces/') || lower.startsWith('interfaces/')) return 'types'
    // Routes
    if (lower.includes('/routes/') || lower.includes('router.')) return 'routes'
    // Docker
    if (lower.includes('docker') || lower.includes('dockerfile')) return 'docker'
    // Config
    if (lower.includes('.env')) return 'config'
    return 'config'
}

/** Recognised project language */
export type ProjectLanguage = 'typescript' | 'javascript' | 'python' | 'go' | 'rust' | 'java' | 'ruby' | 'php' | 'csharp' | 'unknown'

/** Auto-detect the project's primary language from manifest files */
export async function detectProjectLanguage(projectRoot: string): Promise<ProjectLanguage> {
    const exists = async (name: string) => {
        try { await fs.access(path.join(projectRoot, name)); return true } catch { return false }
    }
    const hasGlob = async (pattern: string) => {
        const matches = await fg(pattern, { cwd: projectRoot, onlyFiles: true, deep: 1 })
        return matches.length > 0
    }
    // Check in priority order — most specific first
    if (await exists('tsconfig.json') || await hasGlob('tsconfig.*.json')) return 'typescript'
    if (await exists('Cargo.toml')) return 'rust'
    if (await exists('go.mod')) return 'go'
    if (await exists('pyproject.toml') || await exists('setup.py') || await exists('requirements.txt')) return 'python'
    if (await exists('Gemfile')) return 'ruby'
    if (await exists('pom.xml') || await exists('build.gradle') || await exists('build.gradle.kts')) return 'java'
    if (await exists('composer.json')) return 'php'
    if (await hasGlob('*.csproj') || await hasGlob('*.sln')) return 'csharp'
    if (await exists('package.json')) return 'javascript'
    return 'unknown'
}

/** Get source file glob patterns for a given language */
export function getDiscoveryPatterns(language: ProjectLanguage): { patterns: string[], ignore: string[] } {
    const commonIgnore = [
        '**/.mikk/**', '**/.git/**', '**/coverage/**', '**/build/**',
    ]
    switch (language) {
        case 'typescript':
            return {
                patterns: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
                ignore: [...commonIgnore, '**/node_modules/**', '**/dist/**', '**/.next/**', '**/.nuxt/**', '**/.svelte-kit/**', '**/*.d.ts', '**/*.test.{ts,js,tsx,jsx}', '**/*.spec.{ts,js,tsx,jsx}'],
            }
        case 'javascript':
            return {
                patterns: ['**/*.js', '**/*.jsx', '**/*.mjs', '**/*.cjs', '**/*.ts', '**/*.tsx'],
                ignore: [...commonIgnore, '**/node_modules/**', '**/dist/**', '**/.next/**', '**/*.d.ts', '**/*.test.{ts,js,tsx,jsx}', '**/*.spec.{ts,js,tsx,jsx}'],
            }
        case 'python':
            return {
                patterns: ['**/*.py'],
                ignore: [...commonIgnore, '**/__pycache__/**', '**/venv/**', '**/.venv/**', '**/.tox/**', '**/test_*.py', '**/*_test.py'],
            }
        case 'go':
            return {
                patterns: ['**/*.go'],
                ignore: [...commonIgnore, '**/vendor/**', '**/*_test.go'],
            }
        case 'rust':
            return {
                patterns: ['**/*.rs'],
                ignore: [...commonIgnore, '**/target/**'],
            }
        case 'java':
            return {
                patterns: ['**/*.java', '**/*.kt'],
                ignore: [...commonIgnore, '**/target/**', '**/.gradle/**', '**/Test*.java', '**/*Test.java'],
            }
        case 'ruby':
            return {
                patterns: ['**/*.rb'],
                ignore: [...commonIgnore, '**/vendor/**', '**/*_spec.rb', '**/spec/**'],
            }
        case 'php':
            return {
                patterns: ['**/*.php'],
                ignore: [...commonIgnore, '**/vendor/**', '**/*Test.php'],
            }
        case 'csharp':
            return {
                patterns: ['**/*.cs'],
                ignore: [...commonIgnore, '**/bin/**', '**/obj/**'],
            }
        default:
            // Fallback: discover JS/TS (most common)
            return {
                patterns: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
                ignore: [...commonIgnore, '**/node_modules/**', '**/dist/**', '**/*.d.ts'],
            }
    }
}

/**
 * Discover all source files in a project directory.
 * Respects common ignore patterns and supports multiple languages.
 */
export async function discoverFiles(
    projectRoot: string,
    patterns: string[] = ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    ignore: string[] = ['**/node_modules/**', '**/dist/**', '**/.mikk/**', '**/coverage/**', '**/*.d.ts', '**/*.test.{ts,js,tsx,jsx}', '**/*.spec.{ts,js,tsx,jsx}']
): Promise<string[]> {
    const mikkIgnore = await readMikkIgnore(projectRoot)
    const files = await fg(patterns, {
        cwd: projectRoot,
        ignore: [...ignore, ...mikkIgnore],
        absolute: false,
        onlyFiles: true,
    })
    return files.map(f => f.replace(/\\/g, '/'))
}

/**
 * Reads a file and returns its content as a UTF-8 string.
 */
export async function readFileContent(filePath: string): Promise<string> {
    return fs.readFile(filePath, 'utf-8')
}

/**
 * Writes content to a file, creating parent directories if needed.
 */
export async function writeFileContent(filePath: string, content: string): Promise<void> {
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, content, 'utf-8')
}

/**
 * Check if a file exists.
 */
export async function fileExists(filePath: string): Promise<boolean> {
    try {
        await fs.access(filePath)
        return true
    } catch {
        return false
    }
}

/**
 * Set up the .mikk directory structure in a project root.
 */
export async function setupMikkDirectory(projectRoot: string): Promise<void> {
    const dirs = [
        '.mikk',
        '.mikk/fragments',
        '.mikk/diagrams',
        '.mikk/diagrams/modules',
        '.mikk/diagrams/capsules',
        '.mikk/diagrams/flows',
        '.mikk/diagrams/impact',
        '.mikk/diagrams/exposure',
        '.mikk/intent',
        '.mikk/cache',
    ]
    for (const dir of dirs) {
        await fs.mkdir(path.join(projectRoot, dir), { recursive: true })
    }

    // Create .gitkeep in impact dir
    const impactKeep = path.join(projectRoot, '.mikk/diagrams/impact/.gitkeep')
    if (!await fileExists(impactKeep)) {
        await fs.writeFile(impactKeep, '', 'utf-8')
    }
}

// ─── .mikkignore auto-generation ────────────────────────────────────

/** Default ignore patterns shared across all languages */
const COMMON_IGNORE_PATTERNS = [
    '# Build outputs',
    'dist/',
    'build/',
    'out/',
    'coverage/',
    '',
    '# Mikk internal',
    '.mikk/',
    '',
    '# IDE / OS',
    '.idea/',
    '.vscode/',
    '*.log',
    '',
]

/** Language-specific ignore templates */
const LANGUAGE_IGNORE_TEMPLATES: Record<ProjectLanguage, string[]> = {
    typescript: [
        '# Test files',
        '**/*.test.ts',
        '**/*.test.tsx',
        '**/*.spec.ts',
        '**/*.spec.tsx',
        '__tests__/',
        '**/tests/fixtures/',
        '**/test-utils/',
        '',
        '# Generated / declaration files',
        '*.d.ts',
        '',
        '# Node.js',
        'node_modules/',
        '.next/',
        '.nuxt/',
        '.svelte-kit/',
        '.astro/',
        '',
    ],
    javascript: [
        '# Test files',
        '**/*.test.js',
        '**/*.test.jsx',
        '**/*.spec.js',
        '**/*.spec.jsx',
        '__tests__/',
        '**/tests/fixtures/',
        '**/test-utils/',
        '',
        '# Generated / declaration files',
        '*.d.ts',
        '',
        '# Node.js',
        'node_modules/',
        '.next/',
        '',
    ],
    python: [
        '# Test files',
        'test_*.py',
        '*_test.py',
        'conftest.py',
        'tests/',
        '**/tests/fixtures/',
        '',
        '# Python artifacts',
        '__pycache__/',
        '*.pyc',
        'venv/',
        '.venv/',
        '.tox/',
        '*.egg-info/',
        '',
    ],
    go: [
        '# Test files',
        '*_test.go',
        'testdata/',
        '',
        '# Go artifacts',
        'vendor/',
        '',
    ],
    rust: [
        '# Test files (inline tests are kept — only test binaries excluded)',
        'target/',
        'tests/fixtures/',
        '',
    ],
    java: [
        '# Test files',
        '**/src/test/**',
        'Test*.java',
        '*Test.java',
        '*Tests.java',
        '',
        '# Build artifacts',
        'target/',
        '.gradle/',
        'gradle/',
        '',
    ],
    ruby: [
        '# Test files',
        '*_spec.rb',
        'spec/',
        'test/',
        '',
        '# Ruby artifacts',
        'vendor/',
        '',
    ],
    php: [
        '# Test files',
        '*Test.php',
        'tests/',
        '',
        '# PHP artifacts',
        'vendor/',
        '',
    ],
    csharp: [
        '# Test files',
        '*.Tests/',
        '*.Test/',
        '**/Tests/**',
        '',
        '# Build artifacts',
        'bin/',
        'obj/',
        '',
    ],
    unknown: [
        '# Test files (add your patterns here)',
        'tests/',
        'test/',
        '__tests__/',
        '',
    ],
}

/**
 * Generate a .mikkignore file with smart defaults for the detected language.
 * Only creates the file if it doesn't already exist.
 * Returns true if a file was created, false if one already exists.
 */
export async function generateMikkIgnore(projectRoot: string, language: ProjectLanguage): Promise<boolean> {
    const ignorePath = path.join(projectRoot, '.mikkignore')

    // Don't overwrite an existing .mikkignore
    if (await fileExists(ignorePath)) return false

    const lines: string[] = [
        '# .mikkignore — files/directories Mikk should skip during analysis',
        '# Syntax: gitignore-style patterns. Lines starting with # are comments.',
        '# Paths without / match anywhere. Paths with / are relative to project root.',
        '',
        ...COMMON_IGNORE_PATTERNS,
        ...LANGUAGE_IGNORE_TEMPLATES[language],
    ]

    // Monorepo detection: if there are workspace definitions, add common
    // monorepo patterns (e.g. packages/*/tests/, apps/*/tests/)
    try {
        const pkgRaw = await fs.readFile(path.join(projectRoot, 'package.json'), 'utf-8')
        const pkg = JSON.parse(pkgRaw)
        const workspaces: string[] | undefined = Array.isArray(pkg.workspaces)
            ? pkg.workspaces
            : pkg.workspaces?.packages

        if (workspaces && workspaces.length > 0) {
            lines.push('# Monorepo — test/fixture directories across all packages')
            for (const ws of workspaces) {
                // ws is like "packages/*" or "apps/*"
                const base = ws.replace(/\/?\*$/, '')
                lines.push(`${base}/*/tests/`)
                lines.push(`${base}/*/__tests__/`)
                lines.push(`${base}/*/test/`)
            }
            lines.push('')
        }
    } catch {
        // No package.json or not JSON — skip monorepo detection
    }

    // Turbo / pnpm workspace detection
    try {
        const turboRaw = await fs.readFile(path.join(projectRoot, 'turbo.json'), 'utf-8')
        // turbo.json exists — likely a monorepo already handled above
        void turboRaw
    } catch {
        // not a turbo project
    }

    // pnpm-workspace.yaml detection
    try {
        const pnpmWs = await fs.readFile(path.join(projectRoot, 'pnpm-workspace.yaml'), 'utf-8')
        // Extract package paths from "packages:" section
        const packageLines = pnpmWs.split('\n')
            .filter(l => l.trim().startsWith('-'))
            .map(l => l.replace(/^\s*-\s*['"]?/, '').replace(/['"]?\s*$/, '').trim())

        if (packageLines.length > 0 && !lines.some(l => l.includes('Monorepo'))) {
            lines.push('# Monorepo (pnpm) — test/fixture directories across all packages')
            for (const ws of packageLines) {
                const base = ws.replace(/\/?\*$/, '')
                lines.push(`${base}/*/tests/`)
                lines.push(`${base}/*/__tests__/`)
                lines.push(`${base}/*/test/`)
            }
            lines.push('')
        }
    } catch {
        // no pnpm-workspace.yaml
    }

    await fs.writeFile(ignorePath, lines.join('\n'), 'utf-8')
    return true
}
