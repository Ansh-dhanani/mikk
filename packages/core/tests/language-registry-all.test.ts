import { describe, test, expect } from 'bun:test'
import { 
    languageForExtension, 
    parserKindForExtension, 
    isTreeSitterExtension,
    toParsedFileLanguage,
    type RegistryLanguage,
    type ParsedFileLanguage
} from '../src/utils/language-registry.js'

describe('Language Registry - All 22 Languages', () => {
    describe('Core Languages (Top 10)', () => {
        test('JavaScript/TypeScript uses oxc parser (polyglot)', () => {
            expect(parserKindForExtension('.js')).toBe('oxc')
            expect(parserKindForExtension('.jsx')).toBe('oxc')
            expect(parserKindForExtension('.ts')).toBe('oxc')
            expect(parserKindForExtension('.tsx')).toBe('oxc')
            expect(parserKindForExtension('.mjs')).toBe('oxc')
            expect(parserKindForExtension('.cjs')).toBe('oxc')
        })

        test('TypeScript/JavaScript files detected', () => {
            const detected = languageForExtension('.js')
            expect(['typescript', 'javascript']).toContain(detected)
            expect(languageForExtension('.ts')).toBe('typescript')
        })

        test('Python support', () => {
            expect(languageForExtension('.py')).toBe('python')
            expect(languageForExtension('.pyw')).toBe('python')
            expect(parserKindForExtension('.py')).toBe('tree-sitter')
            expect(isTreeSitterExtension('.py')).toBe(true)
        })

        test('Java support', () => {
            expect(languageForExtension('.java')).toBe('java')
            expect(parserKindForExtension('.java')).toBe('tree-sitter')
            expect(isTreeSitterExtension('.java')).toBe(true)
        })

        test('C# support', () => {
            expect(languageForExtension('.cs')).toBe('csharp')
            expect(parserKindForExtension('.cs')).toBe('tree-sitter')
            expect(isTreeSitterExtension('.cs')).toBe(true)
        })

        test('C/C++ support', () => {
            expect(languageForExtension('.c')).toBe('c')
            expect(languageForExtension('.cpp')).toBe('cpp')
            expect(languageForExtension('.cc')).toBe('cpp')
            expect(languageForExtension('.h')).toBe('c')
            expect(languageForExtension('.hpp')).toBe('cpp')
        })

        test('PHP support', () => {
            expect(languageForExtension('.php')).toBe('php')
            expect(parserKindForExtension('.php')).toBe('tree-sitter')
        })

        test('Ruby support', () => {
            expect(languageForExtension('.rb')).toBe('ruby')
            expect(parserKindForExtension('.rb')).toBe('tree-sitter')
        })

        test('Swift support', () => {
            expect(languageForExtension('.swift')).toBe('swift')
            expect(parserKindForExtension('.swift')).toBe('tree-sitter')
        })

        test('Go support', () => {
            expect(languageForExtension('.go')).toBe('go')
            expect(parserKindForExtension('.go')).toBe('go')
        })
    })

    describe('JVM Languages', () => {
        test('Kotlin support', () => {
            expect(languageForExtension('.kt')).toBe('kotlin')
            expect(languageForExtension('.kts')).toBe('kotlin')
            expect(parserKindForExtension('.kt')).toBe('tree-sitter')
        })

        test('Scala support', () => {
            expect(languageForExtension('.scala')).toBe('scala')
            expect(languageForExtension('.sc')).toBe('scala')
            expect(parserKindForExtension('.scala')).toBe('tree-sitter')
        })
    })

    describe('Systems Languages', () => {
        test('Rust support', () => {
            expect(languageForExtension('.rs')).toBe('rust')
            expect(parserKindForExtension('.rs')).toBe('tree-sitter')
        })

        test('Zig support', () => {
            expect(languageForExtension('.zig')).toBe('zig')
            expect(parserKindForExtension('.zig')).toBe('tree-sitter')
        })
    })

    describe('Apple/Mobile Languages', () => {
        test('Dart support', () => {
            expect(languageForExtension('.dart')).toBe('dart')
            expect(parserKindForExtension('.dart')).toBe('tree-sitter')
        })
    })

    describe('Functional Languages', () => {
        test('Haskell support', () => {
            expect(languageForExtension('.hs')).toBe('haskell')
            expect(parserKindForExtension('.hs')).toBe('tree-sitter')
        })

        test('Elixir support', () => {
            expect(languageForExtension('.ex')).toBe('elixir')
            expect(languageForExtension('.exs')).toBe('elixir')
            expect(parserKindForExtension('.ex')).toBe('tree-sitter')
        })

        test('Clojure support', () => {
            expect(languageForExtension('.clj')).toBe('clojure')
            expect(languageForExtension('.cljs')).toBe('clojure')
            expect(languageForExtension('.cljc')).toBe('clojure')
            expect(parserKindForExtension('.clj')).toBe('tree-sitter')
        })

        test('OCaml support', () => {
            expect(languageForExtension('.ml')).toBe('ocaml')
            expect(languageForExtension('.mli')).toBe('ocaml')
            expect(parserKindForExtension('.ml')).toBe('tree-sitter')
        })

        test('F# support', () => {
            expect(languageForExtension('.fs')).toBe('fsharp')
            expect(languageForExtension('.fsx')).toBe('fsharp')
            expect(languageForExtension('.fsi')).toBe('fsharp')
            expect(parserKindForExtension('.fs')).toBe('tree-sitter')
        })
    })

    describe('Scripting Languages', () => {
        test('Lua support', () => {
            expect(languageForExtension('.lua')).toBe('lua')
            expect(parserKindForExtension('.lua')).toBe('tree-sitter')
        })

        test('Perl support', () => {
            expect(languageForExtension('.pl')).toBe('perl')
            expect(languageForExtension('.pm')).toBe('perl')
            expect(parserKindForExtension('.pl')).toBe('tree-sitter')
        })

        test('R support', () => {
            expect(languageForExtension('.r')).toBe('r')
            expect(languageForExtension('.R')).toBe('r')
            expect(parserKindForExtension('.r')).toBe('tree-sitter')
        })

        test('Julia support', () => {
            expect(languageForExtension('.jl')).toBe('julia')
            expect(parserKindForExtension('.jl')).toBe('tree-sitter')
        })
    })

    describe('Config/Special Purpose', () => {
        test('SQL support', () => {
            expect(languageForExtension('.sql')).toBe('sql')
            expect(parserKindForExtension('.sql')).toBe('tree-sitter')
        })

        test('Terraform support', () => {
            expect(languageForExtension('.tf')).toBe('terraform')
            expect(parserKindForExtension('.tf')).toBe('tree-sitter')
        })

        test('Shell/Bash support', () => {
            expect(languageForExtension('.sh')).toBe('shell')
            expect(languageForExtension('.bash')).toBe('shell')
            expect(languageForExtension('.zsh')).toBe('shell')
            expect(parserKindForExtension('.sh')).toBe('tree-sitter')
        })
    })

    describe('Web Frameworks', () => {
        test('Vue support', () => {
            expect(languageForExtension('.vue')).toBe('vue')
            expect(parserKindForExtension('.vue')).toBe('oxc')
        })

        test('Svelte support', () => {
            expect(languageForExtension('.svelte')).toBe('svelte')
            expect(parserKindForExtension('.svelte')).toBe('oxc')
        })
    })

    describe('ParsedFileLanguage conversion', () => {
        test('converts known languages correctly', () => {
            expect(toParsedFileLanguage('python')).toBe('python')
            expect(toParsedFileLanguage('java')).toBe('java')
            expect(toParsedFileLanguage('go')).toBe('go')
            expect(toParsedFileLanguage('rust')).toBe('rust')
            expect(toParsedFileLanguage('dart')).toBe('dart')
            expect(toParsedFileLanguage('kotlin')).toBe('kotlin')
            expect(toParsedFileLanguage('scala')).toBe('scala')
            expect(toParsedFileLanguage('swift')).toBe('swift')
        })

        test('converts functional languages', () => {
            expect(toParsedFileLanguage('haskell')).toBe('haskell')
            expect(toParsedFileLanguage('elixir')).toBe('elixir')
            expect(toParsedFileLanguage('clojure')).toBe('clojure')
            expect(toParsedFileLanguage('fsharp')).toBe('fsharp')
            expect(toParsedFileLanguage('ocaml')).toBe('ocaml')
        })

        test('converts scripting languages', () => {
            expect(toParsedFileLanguage('lua')).toBe('lua')
            expect(toParsedFileLanguage('perl')).toBe('perl')
            expect(toParsedFileLanguage('r')).toBe('r')
            expect(toParsedFileLanguage('julia')).toBe('julia')
        })

        test('converts special purpose languages', () => {
            expect(toParsedFileLanguage('sql')).toBe('sql')
            expect(toParsedFileLanguage('terraform')).toBe('terraform')
            expect(toParsedFileLanguage('shell')).toBe('shell')
        })

        test('falls back to unknown for unsupported languages', () => {
            expect(toParsedFileLanguage('cobol' as RegistryLanguage)).toBe('unknown')
            expect(toParsedFileLanguage('fortran' as RegistryLanguage)).toBe('unknown')
        })
    })

    describe('Extension coverage', () => {
        test('all 22+ languages have valid extensions', () => {
            const languages: Array<{name: RegistryLanguage, extensions: string[]}> = [
                { name: 'typescript', extensions: ['.ts', '.mts', '.cts', '.mjs', '.cjs', '.jsx'] },
                { name: 'python', extensions: ['.py', '.pyw'] },
                { name: 'java', extensions: ['.java'] },
                { name: 'csharp', extensions: ['.cs'] },
                { name: 'c', extensions: ['.c', '.h'] },
                { name: 'cpp', extensions: ['.cpp', '.cc', '.cxx', '.hpp', '.hxx', '.hh'] },
                { name: 'php', extensions: ['.php'] },
                { name: 'ruby', extensions: ['.rb'] },
                { name: 'swift', extensions: ['.swift'] },
                { name: 'go', extensions: ['.go'] },
                { name: 'kotlin', extensions: ['.kt', '.kts'] },
                { name: 'rust', extensions: ['.rs'] },
                { name: 'dart', extensions: ['.dart'] },
                { name: 'scala', extensions: ['.scala', '.sc'] },
                { name: 'haskell', extensions: ['.hs'] },
                { name: 'elixir', extensions: ['.ex', '.exs'] },
                { name: 'clojure', extensions: ['.clj', '.cljs', '.cljc'] },
                { name: 'fsharp', extensions: ['.fs', '.fsx', '.fsi'] },
                { name: 'ocaml', extensions: ['.ml', '.mli'] },
                { name: 'zig', extensions: ['.zig'] },
                { name: 'lua', extensions: ['.lua'] },
                { name: 'perl', extensions: ['.pl', '.pm'] },
                { name: 'r', extensions: ['.r', '.R'] },
                { name: 'julia', extensions: ['.jl'] },
                { name: 'sql', extensions: ['.sql'] },
                { name: 'terraform', extensions: ['.tf'] },
                { name: 'shell', extensions: ['.sh', '.bash', '.zsh'] },
            ]

            for (const lang of languages) {
                for (const ext of lang.extensions) {
                    const detected = languageForExtension(ext)
                    expect(detected).toBe(lang.name)
                }
            }
        })
    })
})
