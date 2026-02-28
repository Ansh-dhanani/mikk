import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import fg from 'fast-glob'

/**
 * Discover all source files in a project directory.
 * Respects common ignore patterns (node_modules, dist, .mikk, etc.)
 */
export async function discoverFiles(
    projectRoot: string,
    patterns: string[] = ['**/*.ts', '**/*.tsx'],
    ignore: string[] = ['**/node_modules/**', '**/dist/**', '**/.mikk/**', '**/coverage/**', '**/*.d.ts', '**/*.test.ts', '**/*.spec.ts']
): Promise<string[]> {
    const files = await fg(patterns, {
        cwd: projectRoot,
        ignore,
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
