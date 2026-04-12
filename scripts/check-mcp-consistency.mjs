import { readFile, readdir } from 'node:fs/promises'
import { resolve, join } from 'node:path'

const root = process.cwd()
const toolsDir = resolve(root, 'packages/mcp-server/src/tools')
const readmePath = resolve(root, 'README.md')

const dirFiles = await readdir(toolsDir)
const tsFiles = dirFiles.filter(f => f.endsWith('.ts'))

const readPromises = tsFiles.map(f => readFile(join(toolsDir, f), 'utf8'))
const fileContents = await Promise.all(readPromises)
const toolsSource = fileContents.join('\n')

const readmeSource = await readFile(readmePath, 'utf8')

const regex = /(?:server|\(\s*server\s+as\s+any\s*\))\.tool\(\s*\n\s*'([^']+)'/g
const matches = [...toolsSource.matchAll(regex)]
const toolNames = [...new Set(matches.map(m => m[1]))].sort()

if (toolNames.length === 0) {
    console.error('No MCP tools found')
    process.exit(1)
}

const headerMatch = readmeSource.match(/## MCP Server\s*—\s*(\d+) Tools/)
const declaredCount = headerMatch ? Number(headerMatch[1]) : 0

const readmeMatches = [...readmeSource.matchAll(/`(mikk_[a-z0-9_]+)`/g)]
const readmeToolNames = [...new Set(readmeMatches.map(m => m[1]))].sort()

const missing = toolNames.filter(n => !readmeToolNames.includes(n))
const extra = readmeToolNames.filter(n => !toolNames.includes(n))

let hasError = false

if (declaredCount !== toolNames.length) {
    hasError = true
    console.error('Count mismatch: README ' + declaredCount + ' vs source ' + toolNames.length)
}

if (missing.length > 0) {
    hasError = true
    console.error('Missing in README: ' + missing.join(', '))
}

if (extra.length > 0) {
    hasError = true
    console.error('Extra in README: ' + extra.join(', '))
}

if (hasError) {
    process.exit(1)
}

console.log('MCP check passed: ' + toolNames.length + ' tools')