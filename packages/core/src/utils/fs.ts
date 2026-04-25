/* eslint-disable @typescript-eslint/no-explicit-any */
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import fg from 'fast-glob'
import { getDiscoveryExtensions } from './language-registry.js'
import { loadMikkRc, clearMikkRcCache } from './rc-loader.js'

// --- Well-known patterns for schema/config/route files ---------------------
// These are structural files an AI agent needs but aren't source code.
// Mikk auto-discovers them so the AI doesn't have to explore the filesystem.
// Patterns are language-agnostic -- unused patterns simply return zero matches.
const CONTEXT_FILE_PATTERNS = [
    // JS/TS Frameworks - ALL common configs
    '**/next.config.*',
    '**/vite.config.*',
    '**/astro.config.*',
    '**/nuxt.config.*',
    '**/svelte.config.*',
    '**/tailwind.config.*',
    '**/jest.config.*',
    '**/vitest.config.*',
    '**/webpack.config.*',
    '**/tsconfig*.json',
    '**/package.json',
    '**/.eslintrc*',
    '**/.prettierrc*',
    '**/.pylintrc',
    '**/.pylintrc.*',
    '**/nest-cli.json',
    '**/angular.json',
    // Python
    '**/requirements*.txt',
    '**/Pipfile*',
    '**/pyproject.toml',
    '**/setup.py',
    '**/setup.cfg',
    '**/pytest.ini',
    '**/tox.ini',
    '**/manage.py',
    // Ruby
    '**/Gemfile',
    '**/Rakefile',
    '**/config.ru',
    // Java/Gradle
    '**/build.gradle*',
    '**/settings.gradle*',
    '**/pom.xml',
    // Go
    '**/go.mod',
    '**/go.sum',
    // Rust
    '**/Cargo.toml',
    // .NET
    '**/*.csproj',
    '**/*.sln',
    '**/appsettings.json',
    // Swift/iOS
    '**/Package.swift',
    '**/Podfile',
    // PHP
    '**/composer.json',
    '**/.env*',
    // Data models / schemas -- JS/TS
    '**/prisma/schema.prisma',
    '**/drizzle/**/*.ts',
    '**/schema/**/*.{ts,js,graphql,gql,sql}',
    '**/models/**/*.{ts,js}',
    '**/*.schema.{ts,js}',
    '**/*.model.{ts,js}',
    // Data models / schemas -- Python
    '**/models.py',
    '**/schemas.py',
    '**/serializers.py',
    '**/models/**/*.py',
    // Data models / schemas -- Ruby
    '**/app/models/**/*.rb',
    '**/db/schema.rb',
    // Data models / schemas -- Go / Rust / Java / PHP
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
    // Database migrations (latest only) -- multi-language
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
    '**/Dockerfile*',
    '.env.example',
    '.env.local.example',
    // Schema definitions -- general
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

/** Category of a discovered context file - extensible string type */
export type ContextFileType = string

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

/** Maximum size (in bytes) for a single context file -- skip huge files */
const MAX_CONTEXT_FILE_SIZE = 50_000 // ~50KB

// --- .mikkignore support ----------------------------------------------------

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
        return [] // no .mikkignore -- that's fine
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
        // If pattern has no slash (ignoring trailing slash), match anywhere -> prepend **/
        const stripped = isDir ? line.slice(0, -1) : line
        const hasSlash = stripped.includes('/')

        if (!hasSlash) {
            if (isDir) {
                // e.g. "dist/" -> "**/{dist}/**" -- ignore the directory and everything within it
                patterns.push(`**/${stripped}/**`)
            } else {
                // e.g. "*.svg" -> "**/*.svg"
                patterns.push(`**/${line}`)
            }
        } else {
            if (isDir) {
                // e.g. "packages/*/tests/" -> "packages/*/tests/**"
                patterns.push(`${stripped}/**`)
            } else {
                // e.g. "components/ui/**" -- relative to root, already valid
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
 * Protobuf, Docker, OpenAPI, and more -- anything with a well-known file pattern.
 */

export interface DiscoverContextFilesOptions {
    /** Maximum number of context files to return (default 20) */
    maxFiles?: number
    /** Callback for progress updates */
    onProgress?: (current: number, total: number, file: string) => void
    /** Skip reading file content - just get file list with stats */
    metadataOnly?: boolean
}

export async function discoverContextFiles(
    projectRoot: string,
    options: DiscoverContextFilesOptions = {}
): Promise<ContextFile[]> {
    const { maxFiles = 20, onProgress, metadataOnly = false } = options

    // Load .mikkrc or mikk.json config
    const config = await loadMikkRc(projectRoot)
    const customPatterns = config.contextPatterns ? Object.values(config.contextPatterns).flat() : []
    
    const mikkIgnore = await readMikkIgnore(projectRoot)
    const customIgnore = config.ignorePatterns || []
    
    // Merge default + custom patterns
    const allPatterns = [...CONTEXT_FILE_PATTERNS, ...customPatterns]
    
    const files = await fg(allPatterns, {
        cwd: projectRoot,
        ignore: [...CONTEXT_FILE_IGNORE, ...mikkIgnore, ...customIgnore],
        absolute: false,
        onlyFiles: true,
    })

    const normalised = files.map(f => f.replace(/\\/g, '/'))
    const unique = [...new Set(normalised)]

    const results: ContextFile[] = []
    const batchSize = 10

    for (let i = 0; i < unique.length; i += batchSize) {
        const batch = unique.slice(i, i + batchSize)

        const batchResults = await Promise.all(
            batch.map(async (relPath) => {
                const absPath = path.join(projectRoot, relPath)
                try {
                    const stat = await fs.stat(absPath)
                    if (stat.size > MAX_CONTEXT_FILE_SIZE) return null
                    if (stat.size === 0) return null

                    const type = inferContextFileType(relPath)

                    if (onProgress) {
                        onProgress(results.length + 1, Math.min(unique.length, maxFiles), relPath)
                    }

                    if (metadataOnly) {
                        return { path: relPath, content: '', type, size: stat.size }
                    }

                    const content = await fs.readFile(absPath, 'utf-8')
                    return { path: relPath, content, type, size: stat.size }
                } catch {
                    return null
                }
            })
        )

        for (const result of batchResults) {
            if (result && results.length < maxFiles) {
                results.push(result)
            }
        }

        if (results.length >= maxFiles) break
    }

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

    const hasSchema = results.some(f => f.type === 'schema')
    if (hasSchema) {
        return results.filter(f => f.type !== 'migration')
    }

    return results
}

/** Infer the context file's category from its path - PATTERN BASED for ALL frameworks */
function inferContextFileType(filePath: string): ContextFileType {
    const lower = filePath.toLowerCase()
    const basename = lower.split('/').pop() || ''
    
    // === 1. FRAMEWORK-SPECIFIC FIRST (well-known high-frequency patterns) ===
    if (basename.includes('package.json')) return 'package-config'
    if (basename.includes('tsconfig')) return 'tsconfig'
    if (basename.includes('vite.config')) return 'vite-config'
    if (basename.includes('next.config')) return 'next-config'
    if (basename.includes('nuxt.config')) return 'nuxt-config'
    if (basename.includes('astro.config')) return 'astro-config'
    if (basename.includes('svelte.config')) return 'svelte-config'
    if (basename.includes('tailwind.config')) return 'tailwind-config'
    if (basename.includes('jest.config')) return 'jest-config'
    if (basename.includes('vitest.config')) return 'vitest-config'
    if (basename.includes('webpack')) return 'webpack-config'
    if (basename.includes('eslint')) return 'lint-config'
    if (basename.includes('prettier')) return 'format-config'
    if (basename.includes('nest-cli')) return 'nest-config'
    if (basename.includes('nest')) return 'nest-config'
    
    // === 2. DIRECTORY-BASED PATTERNS (universal) ===
    const dirPatterns: [string[], string][] = [
        [['config', 'Configuration'], 'app-config'],
        [['resources'], 'app-config'],
        [['migrations', 'migrate', 'db'], 'migration'],
        [['models', 'model', 'entities', 'entity', 'dto', 'schemas'], 'model'],
        [['types', 'interfaces', 'typings'], 'types'],
        [['routes', 'route', 'router'], 'routes'],
        [['controllers', 'controller', 'handlers', 'handler'], 'controller'],
        [['services', 'service'], 'service'],
        [['middleware'], 'middleware'],
        [['views', 'templates', 'pages'], 'view'],
        [['components', 'views', 'ui'], 'component'],
        [['tests', 'spec', '__tests__'], 'test'],
        [['mocks', 'fixtures'], 'test-fixture'],
        [['scripts', 'scripts'], 'build-script'],
        [['docs', 'documentation'], 'docs'],
    ]
    
    for (const [dirs, type] of dirPatterns) {
        for (const dir of dirs) {
            if (lower.includes(`/${dir}/`) || lower.includes(`/${dir}.`) || lower.endsWith(`/${dir}`)) {
                return type
            }
        }
    }
    
    // === 3. EXTENSION-BASED (universal for ANY language) ===
    const extMap: Record<string, string> = {
        // Build/Package tools
        '.gradle': 'build-tool', '.gradle.kts': 'build-tool',
        '.maven': 'build-tool', '.xml': 'build-tool',  // pom.xml
        '.toml': 'config',  // Cargo.toml, pyproject.toml
        '.yml': 'config', '.yaml': 'config',
        '.ini': 'config', '.cfg': 'config',
        // Web/API
        '.graphql': 'schema', '.gql': 'schema',
        '.protobuf': 'api-spec', '.proto': 'api-spec',
        '.avsc': 'schema', '.thrift': 'schema',
        // Database
        '.sql': 'schema', '.prisma': 'schema',
        // IaC
        '.tf': 'terraform', '.hcl': 'terraform',
        '.tfvars': 'terraform',
    }
    const ext = '.' + basename.split('.').pop()
    if (extMap[ext]) return extMap[ext]
    if (basename.endsWith('.yaml') && (lower.includes('deployment') || lower.includes('service') || lower.includes('ingress') || lower.includes('configmap'))) return 'kubernetes'
    
    // === 4. FILENAME PREFIX PATTERNS ===
    const prefix = basename.split('.')[0]
    const prefixMap: Record<string, string> = {
        'application': 'app-config',
        'settings': 'app-config',
        'build': 'build-tool',
        'setup': 'build-tool',
    }
    if (prefixMap[prefix]) return prefixMap[prefix]
    if (basename.startsWith('.env')) return 'env-config'
    
    // === 5. IaC ===
    if (lower.includes('/k8s/') || lower.includes('/kubernetes/') || lower.includes('/helm/')) return 'kubernetes'
    if (lower.includes('/terraform/')) return 'terraform'
    if (basename.includes('dockerfile') || lower.includes('docker-compose')) return 'docker'
    
    // === 6. FALLBACK ===
    return 'config'
}

/** Recognised project language */
export type ProjectLanguage = 'typescript' | 'javascript' | 'python' | 'go' | 'rust' | 'java' | 'swift' | 'ruby' | 'php' | 'csharp' | 'c' | 'cpp' | 'unknown' | 'polyglot'

/** Auto-detect the project's primary language from manifest files */
export async function detectProjectLanguage(projectRoot: string): Promise<ProjectLanguage> {
    const exists = async (name: string) => {
        try { await fs.access(path.join(projectRoot, name)); return true } catch { return false }
    }
    const hasGlob = async (pattern: string) => {
        const matches = await fg(pattern, { cwd: projectRoot, onlyFiles: true, deep: 1 })
        return matches.length > 0
    }
    
    const hasTsConfig = await exists('tsconfig.json') || await hasGlob('tsconfig.*.json')
    const hasPackageJson = await exists('package.json')
    const hasRust = await exists('Cargo.toml')
    const hasGo = await exists('go.mod')
    const hasPython = await exists('pyproject.toml') || await exists('setup.py') || await exists('requirements.txt')
    const hasRuby = await exists('Gemfile')
    const hasJava = await exists('pom.xml') || await exists('build.gradle') || await exists('build.gradle.kts')
    const hasSwift = await exists('Package.swift')
    const hasPhp = await exists('composer.json')
    const hasCSharp = await hasGlob('*.csproj') || await hasGlob('*.sln')
    const hasCpp = await hasGlob('CMakeLists.txt') || await hasGlob('**/*.cmake')
    const hasC = await hasGlob('*.c') || await hasGlob('*.h')
    
    // Count non-JS family manifests (TypeScript and JavaScript share package.json, so count them together)
    let languageFamilyCount = 0
    if (hasTsConfig || hasPackageJson) languageFamilyCount++ // JS family (TS or JS)
    if (hasRust) languageFamilyCount++
    if (hasGo) languageFamilyCount++
    if (hasPython) languageFamilyCount++
    if (hasRuby) languageFamilyCount++
    if (hasJava) languageFamilyCount++
    if (hasSwift) languageFamilyCount++
    if (hasPhp) languageFamilyCount++
    if (hasCSharp) languageFamilyCount++
    if (hasCpp) languageFamilyCount++
    if (hasC) languageFamilyCount++
    
    // If multiple language families detected, it's polyglot
    if (languageFamilyCount > 1) {
        return 'polyglot'
    }
    
    // Check in priority order but check for polyglot first (multiple detected)
    if (languageFamilyCount > 1) return 'polyglot' // Already handled above, but safe
    if (hasTsConfig) return 'typescript'
    if (hasRust) return 'rust'
    if (hasGo) return 'go'
    if (hasPython) return 'python'
    if (hasPackageJson) return 'javascript'
    if (hasRuby) return 'ruby'
    if (hasJava) return 'java'
    if (hasSwift) return 'swift'
    if (hasPhp) return 'php'
    if (hasCSharp) return 'csharp'
    if (hasCpp) return 'cpp'
    if (hasC) return 'c'
    if (hasPackageJson) return 'javascript'
    return 'unknown'
}

/** Get source file glob patterns for a given language */
export function getDiscoveryPatterns(language: ProjectLanguage): { patterns: string[], ignore: string[] } {
    const commonIgnore = [
        '**/.mikk/**', '**/.git/**', '**/coverage/**', '**/build/**',
    ]

    const toPatterns = (lang: ProjectLanguage): string[] => {
        if (lang === 'polyglot') {
            // For polyglot, use LANGUAGE_EXTENSIONS.polyglot directly
            return getDiscoveryExtensions('polyglot' as any).map(ext => `**/*${ext}`)
        }
        return getDiscoveryExtensions(lang as any).map(ext => `**/*${ext}`)
    }

    switch (language) {
        case 'typescript':
            return {
                patterns: [...toPatterns(language), '**/*.js', '**/*.jsx', '**/*.py'],
                ignore: [...commonIgnore, '**/node_modules/**', '**/dist/**', '**/.next/**', '**/.nuxt/**', '**/.svelte-kit/**', '**/*.d.ts', '**/*.test.{ts,js,tsx,jsx}', '**/*.spec.{ts,js,tsx,jsx}', '**/venv/**', '**/.venv/**', '**/__pycache__/**', '**/lib/site-packages/**'],
            }
        case 'javascript':
            return {
                patterns: [...toPatterns(language), '**/*.ts', '**/*.tsx', '**/*.py'],
                ignore: [...commonIgnore, '**/node_modules/**', '**/dist/**', '**/.next/**', '**/*.d.ts', '**/*.test.{ts,js,tsx,jsx}', '**/*.spec.{ts,js,tsx,jsx}', '**/venv/**', '**/.venv/**', '**/__pycache__/**', '**/lib/site-packages/**'],
            }
        case 'python':
            return {
                patterns: toPatterns(language),
                ignore: [...commonIgnore, '**/__pycache__/**', '**/venv/**', '**/.venv/**', '**/.tox/**', '**/test_*.py', '**/*_test.py', '**/lib/site-packages/**'],
            }
        case 'go':
            return {
                patterns: toPatterns(language),
                ignore: [...commonIgnore, '**/vendor/**', '**/*_test.go'],
            }
        case 'rust':
            return {
                patterns: toPatterns(language),
                ignore: [...commonIgnore, '**/target/**'],
            }
        case 'java':
            return {
                patterns: [...toPatterns(language), '**/*.kt', '**/*.kts'],
                ignore: [...commonIgnore, '**/target/**', '**/.gradle/**', '**/Test*.java', '**/*Test.java'],
            }
        case 'swift':
            return {
                patterns: toPatterns(language),
                ignore: [...commonIgnore, '**/.build/**', '**/Tests/**'],
            }
        case 'ruby':
            return {
                patterns: toPatterns(language),
                ignore: [...commonIgnore, '**/vendor/**', '**/*.gemspec'],
            }
        case 'php':
            return {
                patterns: toPatterns(language),
                ignore: [...commonIgnore, '**/vendor/**', '**/tests/**', '**/Test*.php'],
            }
        case 'csharp':
            return {
                patterns: toPatterns(language),
                ignore: [...commonIgnore, '**/bin/**', '**/obj/**', '**/*Test.cs'],
            }
        case 'c':
            return {
                patterns: toPatterns(language),
                ignore: [...commonIgnore, '**/*.h'],
            }
        case 'cpp':
            return {
                patterns: toPatterns(language),
                ignore: [...commonIgnore, '**/build/**', '**/*.hpp'],
            }
        case 'polyglot':
            return {
                patterns: toPatterns(language),
                ignore: [
                    ...commonIgnore,
                    '**/node_modules/**', '**/dist/**', '**/.next/**', '**/.nuxt/**', '**/.svelte-kit/**',
                    '**/__pycache__/**', '**/venv/**', '**/.venv/**', '**/.tox/**', '**/lib/site-packages/**',
                    '**/vendor/**', '**/target/**', '**/.gradle/**', '**/.build/**', '**/bin/**', '**/obj/**',
                    '**/*.d.ts', '**/*.test.{ts,js,tsx,jsx}', '**/*.spec.{ts,js,tsx,jsx}',
                    '**/test_*.py', '**/*_test.py', '**/Test*.java', '**/*Test.java', '**/*Test.cs',
                ],
            }
        case 'unknown':
            return {
                patterns: ['**/*.{ts,tsx,js,jsx}'],
                ignore: [...commonIgnore, '**/node_modules/**'],
            }
        default:
            return { patterns: [], ignore: commonIgnore }
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
 * Only creates directories that are actually used.
 */
export async function setupMikkDirectory(projectRoot: string): Promise<void> {
    const dirs = [
        '.mikk',
        '.mikk/cache',
        '.mikk/transactions',
    ]
    for (const dir of dirs) {
        await fs.mkdir(path.join(projectRoot, dir), { recursive: true })
    }
}

// --- .mikkignore auto-generation --------------------------------------------

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
        '# Test files (inline tests are kept -- only test binaries excluded)',
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
    swift: [
        '# Swift artifacts',
        '.build/',
        '.swiftpm/',
        'Packages/',
        'Tests/',
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
    c: [
        '# Build artifacts',
        'build/',
        'obj/',
        '*.o',
        '*.a',
        '',
    ],
    cpp: [
        '# Build artifacts',
        'build/',
        'cmake-build-*/',
        '*.o',
        '*.a',
        '*.so',
        '*.dll',
        '',
    ],
    unknown: [
        '# Test files (add your patterns here)',
        'tests/',
        'test/',
        '__tests__/',
        '',
    ],
    polyglot: [
        '# Multi-language project',
        '**/node_modules/**',
        '**/venv/**',
        '**/.venv/**',
        '**/__pycache__/**',
        '**/site-packages/**',
        '**/vendor/**',
        '**/target/**',
        '**/build/**',
        '**/dist/**',
        '**/.next/**',
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
        '# .mikkignore -- files/directories Mikk should skip during analysis',
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
            lines.push('# Monorepo -- test/fixture directories across all packages')
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
        // No package.json or not JSON -- skip monorepo detection
    }

    // Turbo / pnpm workspace detection
    try {
        const turboRaw = await fs.readFile(path.join(projectRoot, 'turbo.json'), 'utf-8')
        // turbo.json exists -- likely a monorepo already handled above
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
            lines.push('# Monorepo (pnpm) -- test/fixture directories across all packages')
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

/**
 * Automatically add .mikk/ to the project's .gitignore file if it exists.
 * Returns true if the file was modified, false otherwise.
 */
export async function updateGitIgnore(projectRoot: string): Promise<boolean> {
    const gitIgnorePath = path.join(projectRoot, '.gitignore')
    
    // If no .gitignore, we don't create one (don't assume the project uses Git)
    if (!await fileExists(gitIgnorePath)) return false

    try {
        const content = await fs.readFile(gitIgnorePath, 'utf-8')
        const lines = content.split('\n')

        // Check if already ignored
        const alreadyIgnored = lines.some(line => {
            const trimmed = line.trim()
            return trimmed === '.mikk' || trimmed === '.mikk/' || trimmed === '**/.mikk/**'
        })

        if (alreadyIgnored) return false

        // Append to .gitignore
        const newContent = content.endsWith('\n') 
            ? `${content}\n# Mikk internal\n.mikk/\n`
            : `${content}\n\n# Mikk internal\n.mikk/\n`
        
        await fs.writeFile(gitIgnorePath, newContent, 'utf-8')
        return true
    } catch {
        return false
    }
}

/**
 * Remove Mikk entries from .gitignore.
 */
export async function cleanupGitIgnore(projectRoot: string): Promise<boolean> {
    const gitIgnorePath = path.join(projectRoot, '.gitignore')
    if (!await fileExists(gitIgnorePath)) return false

    try {
        const content = await fs.readFile(gitIgnorePath, 'utf-8')
        const lines = content.split('\n')
        
        let modified = false
        const filtered = lines.filter(line => {
            const trimmed = line.trim()
            const isMikkEntry = trimmed === '.mikk' || trimmed === '.mikk/' || trimmed === '**/.mikk/**' || trimmed === '# Mikk internal'
            if (isMikkEntry) modified = true
            return !isMikkEntry
        })

        if (!modified) return false

        // Joins lines and trim trailing newlines to avoid growing whitespace
        const newContent = filtered.join('\n').trim() + '\n'
        await fs.writeFile(gitIgnorePath, newContent, 'utf-8')
        return true
    } catch {
        return false
    }
}
