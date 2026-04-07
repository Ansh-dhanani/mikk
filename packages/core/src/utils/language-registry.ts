export type ParserKind = 'oxc' | 'go' | 'tree-sitter' | 'unknown'

export type RegistryLanguage =
    | 'typescript'
    | 'javascript'
    | 'python'
    | 'go'
    | 'rust'
    | 'java'
    | 'kotlin'
    | 'swift'
    | 'ruby'
    | 'php'
    | 'csharp'
    | 'c'
    | 'cpp'
    | 'polyglot'
    | 'unknown'

const OXC_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'] as const
const GO_EXTENSIONS = ['.go'] as const
const TREE_SITTER_EXTENSIONS = [
    '.py', '.java', '.kt', '.kts', '.swift',
    '.c', '.h', '.cpp', '.cc', '.cxx', '.hpp', '.hxx', '.hh',
    '.cs', '.rs', '.php', '.rb',
] as const

const PARSER_EXTENSIONS: Record<Exclude<ParserKind, 'unknown'>, readonly string[]> = {
    oxc: OXC_EXTENSIONS,
    go: GO_EXTENSIONS,
    'tree-sitter': TREE_SITTER_EXTENSIONS,
}

const LANGUAGE_EXTENSIONS: Record<RegistryLanguage, readonly string[]> = {
    typescript: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'],
    javascript: ['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx'],
    python: ['.py'],
    go: ['.go'],
    rust: ['.rs'],
    kotlin: ['.kt', '.kts'],
    java: ['.java', '.kt', '.kts'],
    swift: ['.swift'],
    ruby: ['.rb'],
    php: ['.php'],
    csharp: ['.cs'],
    c: ['.c', '.h'],
    cpp: ['.cpp', '.cc', '.cxx', '.hpp', '.hxx', '.hh', '.h'],
    polyglot: [
        '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
        '.py',
        '.go',
        '.rs',
        '.java', '.kt', '.kts',
        '.swift',
        '.rb',
        '.php',
        '.cs',
        '.c', '.h', '.cpp', '.cc', '.cxx', '.hpp', '.hxx', '.hh',
    ],
    unknown: ['.ts', '.tsx', '.js', '.jsx'],
}

const EXT_TO_PARSER = new Map<string, ParserKind>()
for (const ext of OXC_EXTENSIONS) EXT_TO_PARSER.set(ext, 'oxc')
for (const ext of GO_EXTENSIONS) EXT_TO_PARSER.set(ext, 'go')
for (const ext of TREE_SITTER_EXTENSIONS) EXT_TO_PARSER.set(ext, 'tree-sitter')

const EXT_TO_LANGUAGE = new Map<string, RegistryLanguage>()
for (const [language, extensions] of Object.entries(LANGUAGE_EXTENSIONS)) {
    for (const ext of extensions) {
        if (!EXT_TO_LANGUAGE.has(ext)) {
            EXT_TO_LANGUAGE.set(ext, language as RegistryLanguage)
        }
    }
}

export function parserKindForExtension(ext: string): ParserKind {
    return EXT_TO_PARSER.get(ext.toLowerCase()) ?? 'unknown'
}

export function languageForExtension(ext: string): RegistryLanguage {
    return EXT_TO_LANGUAGE.get(ext.toLowerCase()) ?? 'unknown'
}

export function getParserExtensions(kind: Exclude<ParserKind, 'unknown'>): readonly string[] {
    return PARSER_EXTENSIONS[kind]
}

export function getDiscoveryExtensions(language: RegistryLanguage): readonly string[] {
    return LANGUAGE_EXTENSIONS[language]
}

export function isTreeSitterExtension(ext: string): boolean {
    return parserKindForExtension(ext) === 'tree-sitter'
}
