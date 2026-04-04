import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = process.cwd()
const toolsPath = resolve(root, 'packages/mcp-server/src/tools.ts')
const readmePath = resolve(root, 'README.md')

const [toolsSource, readmeSource] = await Promise.all([
  readFile(toolsPath, 'utf8'),
  readFile(readmePath, 'utf8'),
])

const toolNameMatches = [
  ...toolsSource.matchAll(/(?:server|\(\s*server\s+as\s+any\s*\))\.tool\(\s*\n\s*'([^']+)'/g),
]
const toolNames = [...new Set(toolNameMatches.map((m) => m[1]))].sort()

if (toolNames.length === 0) {
  console.error('No MCP tools found in packages/mcp-server/src/tools.ts')
  process.exit(1)
}

const headerMatch = readmeSource.match(/## MCP Server\s*—\s*(\d+) Tools/)
if (!headerMatch) {
  console.error('README is missing MCP tool count header.')
  process.exit(1)
}

const declaredCount = Number(headerMatch[1])
if (!Number.isFinite(declaredCount)) {
  console.error('README MCP tool count is not numeric.')
  process.exit(1)
}

const readmeToolMatches = [...readmeSource.matchAll(/`(mikk_[a-z0-9_]+)`/g)]
const readmeToolNames = [...new Set(readmeToolMatches.map((m) => m[1]))].sort()

const missingInReadme = toolNames.filter((name) => !readmeToolNames.includes(name))
const extraInReadme = readmeToolNames.filter((name) => !toolNames.includes(name))

let hasError = false

if (declaredCount !== toolNames.length) {
  hasError = true
  console.error(
    `MCP count mismatch: README declares ${declaredCount}, source has ${toolNames.length}.`,
  )
}

if (missingInReadme.length > 0) {
  hasError = true
  console.error('README is missing MCP tools:', missingInReadme.join(', '))
}

if (extraInReadme.length > 0) {
  hasError = true
  console.error('README contains unknown MCP tool names:', extraInReadme.join(', '))
}

if (hasError) {
  process.exit(1)
}

console.log(`MCP consistency check passed: ${toolNames.length} tools documented and matched.`)
