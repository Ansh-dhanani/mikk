import { hashContent } from '../src/hash/file-hasher'
import type { ParsedFile, ParsedFunction, ParsedImport } from '../src/parser/types'
import { GraphBuilder } from '../src/graph/graph-builder'
import type { DependencyGraph } from '../src/graph/types'

/** Build a minimal ParsedFile for testing without actually parsing */
export function mockParsedFile(
    filePath: string,
    functions: ParsedFunction[] = [],
    imports: ParsedImport[] = []
): ParsedFile {
    return {
        path: filePath,
        language: 'typescript',
        functions,
        classes: [],
        imports,
        exports: [],
        hash: hashContent(filePath),
        parsedAt: Date.now(),
    }
}

/** Build a minimal ParsedFunction */
export function mockFunction(
    name: string,
    calls: string[] = [],
    file: string = 'src/test.ts',
    isExported: boolean = false
): ParsedFunction {
    return {
        id: `fn:${file}:${name}`,
        name,
        file,
        startLine: 1,
        endLine: 10,
        params: [],
        returnType: 'void',
        isExported,
        isAsync: false,
        calls,
        hash: hashContent(name),
    }
}

/** Build a minimal ParsedImport */
export function mockImport(
    source: string,
    names: string[],
    resolvedPath: string = ''
): ParsedImport {
    return {
        source,
        resolvedPath,
        names,
        isDefault: false,
        isDynamic: false,
    }
}

/** Build a graph from simple tuple pairs for testing */
export function buildTestGraph(
    callPairs: [string, string][]
): DependencyGraph {
    const fileNames = [...new Set(callPairs.flat().filter(x => x !== 'nothing'))]
    const parsedFiles = fileNames.map(name => {
        const targets = callPairs
            .filter(([from]) => from === name)
            .flatMap(([, to]) => to === 'nothing' ? [] : [to])

        // Build proper imports so GraphBuilder can resolve the call edges
        const imports = targets.map(to =>
            mockImport(`./${to}`, [to], `src/${to}.ts`)
        )

        return mockParsedFile(
            `src/${name}.ts`,
            [mockFunction(name, targets, `src/${name}.ts`)],
            imports
        )
    })
    return new GraphBuilder().build(parsedFiles)
}
