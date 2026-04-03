import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

function pct(numerator, denominator) {
  if (!denominator) return 0
  return Number(((numerator / denominator) * 100).toFixed(2))
}

function safeArray(value) {
  return Array.isArray(value) ? value : []
}

const root = process.cwd()
const lockPath = resolve(root, 'mikk.lock.json')

let lock
try {
  lock = JSON.parse(await readFile(lockPath, 'utf8'))
} catch (err) {
  console.error('Failed to read mikk.lock.json. Run mikk analyze first.')
  process.exit(1)
}

const functions = lock.functions || {}
const files = lock.files || {}
const modules = lock.modules || {}

const totalFunctions = Object.keys(functions).length
const totalFiles = Object.keys(files).length
const totalModules = Object.keys(modules).length

let unresolvedEdgeCount = 0
let totalCallEdges = 0
for (const fn of Object.values(functions)) {
  const calls = safeArray(fn.calls)
  totalCallEdges += calls.length
  for (const callee of calls) {
    if (!functions[callee]) {
      unresolvedEdgeCount += 1
    }
  }
}

const diagnostics = lock.syncState?.parseDiagnostics
const fallbackFiles = diagnostics?.fallbackFiles ?? 0
const requestedFiles = diagnostics?.requestedFiles ?? totalFiles
const parseFallbackRate = pct(fallbackFiles, requestedFiles)

const unresolvedEdgeRate = pct(unresolvedEdgeCount, totalCallEdges)

const output = {
  generatedAt: new Date().toISOString(),
  syncStatus: lock.syncState?.status ?? 'unknown',
  stats: {
    modules: totalModules,
    files: totalFiles,
    functions: totalFunctions,
    callEdges: totalCallEdges,
  },
  metrics: {
    parseFallbackRate,
    unresolvedEdgeCount,
    unresolvedEdgeRate,
    flakyTestCount: null,
    flakyTestCountNote: 'Not derivable from lock file. Feed CI test history to compute this metric.',
    mcpToolCountClaim: 23,
  },
}

console.log(JSON.stringify(output, null, 2))
