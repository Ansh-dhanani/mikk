import { describe, it, expect } from 'bun:test'
import {
    parserKindForExtension,
    languageForExtension,
    getParserExtensions,
    getDiscoveryExtensions,
    isTreeSitterExtension,
} from '../src/utils/language-registry'

describe('language-registry', () => {
    it('maps parser kinds correctly', () => {
        expect(parserKindForExtension('.ts')).toBe('oxc')
        expect(parserKindForExtension('.go')).toBe('go')
        expect(parserKindForExtension('.py')).toBe('tree-sitter')
        expect(parserKindForExtension('.unknown')).toBe('unknown')
    })

    it('maps parser kinds case-insensitively', () => {
        expect(parserKindForExtension('.TS')).toBe('oxc')
        expect(parserKindForExtension('.Go')).toBe('go')
        expect(parserKindForExtension('.RB')).toBe('tree-sitter')
    })

    it('maps languages correctly across major ecosystems', () => {
        expect(languageForExtension('.ts')).toBe('typescript')
        expect(languageForExtension('.js')).toBe('typescript')
        expect(languageForExtension('.py')).toBe('python')
        expect(languageForExtension('.go')).toBe('go')
        expect(languageForExtension('.rs')).toBe('rust')
        expect(languageForExtension('.java')).toBe('java')
        expect(languageForExtension('.kt')).toBe('kotlin')
        expect(languageForExtension('.kts')).toBe('kotlin')
        expect(languageForExtension('.swift')).toBe('swift')
        expect(languageForExtension('.rb')).toBe('ruby')
        expect(languageForExtension('.php')).toBe('php')
        expect(languageForExtension('.cs')).toBe('csharp')
        expect(languageForExtension('.c')).toBe('c')
        expect(languageForExtension('.cpp')).toBe('cpp')
    })

    it('returns parser extension sets', () => {
        expect(getParserExtensions('oxc')).toContain('.tsx')
        expect(getParserExtensions('go')).toEqual(['.go'])
        expect(getParserExtensions('tree-sitter')).toContain('.swift')
    })

    it('returns discovery extension sets for mixed JVM repos', () => {
        const javaDiscovery = getDiscoveryExtensions('java')
        expect(javaDiscovery).toContain('.java')

        const kotlinDiscovery = getDiscoveryExtensions('kotlin')
        expect(kotlinDiscovery).toContain('.kt')
        expect(kotlinDiscovery).toContain('.kts')

        // Extension-to-language remains separate.
        expect(languageForExtension('.kt')).toBe('kotlin')
        expect(languageForExtension('.kts')).toBe('kotlin')
    })

    it('identifies tree-sitter extensions', () => {
        expect(isTreeSitterExtension('.py')).toBe(true)
        expect(isTreeSitterExtension('.swift')).toBe(true)
        expect(isTreeSitterExtension('.ts')).toBe(false)
        expect(isTreeSitterExtension('.go')).toBe(false)
    })
})
