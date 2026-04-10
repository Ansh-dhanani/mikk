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
    | 'zig'
    | 'elixir'
    | 'haskell'
    | 'scala'
    | 'dart'
    | 'lua'
    | 'julia'
    | 'clojure'
    | 'fsharp'
    | 'ocaml'
    | 'perl'
    | 'r'
    | 'sql'
    | 'terraform'
    | 'shell'
    | 'vue'
    | 'svelte'
    | 'jsx'
    | 'tsx'
    | 'polyglot'
    | 'unknown'

const OXC_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.vue', '.svelte'] as const
const GO_EXTENSIONS = ['.go'] as const
const TREE_SITTER_EXTENSIONS = [
    '.py', '.java', '.kt', '.kts', '.swift',
    '.c', '.h', '.cpp', '.cc', '.cxx', '.hpp', '.hxx', '.hh',
    '.cs', '.rs', '.php', '.rb',
    '.zig', '.ex', '.exs', '.hs', '.scala', '.sc',
    '.dart', '.lua', '.jl', '.clj', '.cljs', '.fs', '.fsx',
    '.ml', '.mli', '.pl', '.pm', '.r', '.R', '.sql',
    '.tf', '.sh', '.bash', '.zsh',
] as const

const PARSER_EXTENSIONS: Record<Exclude<ParserKind, 'unknown'>, readonly string[]> = {
    oxc: OXC_EXTENSIONS,
    go: GO_EXTENSIONS,
    'tree-sitter': TREE_SITTER_EXTENSIONS,
}

const LANGUAGE_EXTENSIONS: Record<RegistryLanguage, readonly string[]> = {
    typescript: ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'],
    javascript: ['.js', '.jsx', '.mjs', '.cjs'],
    vue: ['.vue'],
    svelte: ['.svelte'],
    jsx: ['.jsx'],
    tsx: ['.tsx'],
    python: ['.py', '.pyw'],
    go: ['.go'],
    rust: ['.rs'],
    kotlin: ['.kt', '.kts'],
    java: ['.java'],
    swift: ['.swift'],
    ruby: ['.rb'],
    php: ['.php'],
    csharp: ['.cs'],
    c: ['.c', '.h'],
    cpp: ['.cpp', '.cc', '.cxx', '.hpp', '.hxx', '.hh', '.h'],
    zig: ['.zig'],
    elixir: ['.ex', '.exs'],
    haskell: ['.hs'],
    scala: ['.scala', '.sc'],
    dart: ['.dart'],
    lua: ['.lua'],
    julia: ['.jl'],
    clojure: ['.clj', '.cljs', '.cljc'],
    fsharp: ['.fs', '.fsx', '.fsi'],
    ocaml: ['.ml', '.mli'],
    perl: ['.pl', '.pm'],
    r: ['.r', '.R'],
    sql: ['.sql'],
    terraform: ['.tf'],
    shell: ['.sh', '.bash', '.zsh'],
    polyglot: [
        '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
        '.py', '.vue', '.svelte',
        '.go',
        '.rs',
        '.java', '.kt', '.kts',
        '.swift',
        '.rb',
        '.php',
        '.cs',
        '.c', '.h', '.cpp', '.cc', '.cxx', '.hpp', '.hxx', '.hh',
        '.zig', '.ex', '.exs', '.hs', '.scala', '.sc',
        '.dart', '.lua', '.jl', '.clj', '.cljs', '.cljc',
        '.fs', '.fsx', '.fsi', '.ml', '.mli', '.pl', '.pm',
        '.r', '.R', '.sql', '.tf', '.sh', '.bash', '.zsh',
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

const VALID_PARSED_FILE_LANGUAGES = new Set([
    // Mainstream Languages (22)
    'javascript', 'typescript', 'python', 'java', 'csharp', 'cpp', 'c',
    'php', 'ruby', 'swift', 'go', 'kotlin', 'rust', 'dart', 'scala',
    'haskell', 'elixir', 'clojure', 'fsharp', 'ocaml', 'perl', 'r',
    // Systems Languages
    'zig',
    // Scripting Languages
    'lua', 'julia',
    // Special Purpose
    'sql', 'terraform', 'shell',
    // Web Frameworks
    'vue', 'svelte',
    // Fallback
    'unknown'
])

export function toParsedFileLanguage(lang: RegistryLanguage): ParsedFileLanguage {
    return VALID_PARSED_FILE_LANGUAGES.has(lang)
        ? lang as ParsedFileLanguage
        : 'unknown'
}

export type ParsedFileLanguage = 
    | 'javascript' | 'typescript' | 'python' | 'java' | 'csharp' | 'cpp' | 'c'
    | 'php' | 'ruby' | 'swift' | 'go' | 'kotlin' | 'rust' | 'dart' | 'scala'
    | 'haskell' | 'elixir' | 'clojure' | 'fsharp' | 'ocaml' | 'perl' | 'r'
    | 'zig' | 'lua' | 'julia'
    | 'sql' | 'terraform' | 'shell'
    | 'vue' | 'svelte'
    | 'unknown'

export function getParserExtensions(kind: Exclude<ParserKind, 'unknown'>): readonly string[] {
    return PARSER_EXTENSIONS[kind]
}

export function getDiscoveryExtensions(language: RegistryLanguage): readonly string[] {
    return LANGUAGE_EXTENSIONS[language]
}

export function isTreeSitterExtension(ext: string): boolean {
    return parserKindForExtension(ext) === 'tree-sitter'
}
