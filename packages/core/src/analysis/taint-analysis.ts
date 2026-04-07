/**
 * Data Flow & Taint Analysis — tracks data propagation through code
 * for security vulnerability detection.
 */

import type { MikkLock, MikkLockFunction } from '../contract/schema.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TaintSource {
  name: string
  description: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  patterns: RegExp[]
}

export interface TaintSink {
  name: string
  description: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  patterns: RegExp[]
  sanitizers: string[]
}

export interface TaintFlow {
  source: string
  sink: string
  path: string[]
  vulnerability: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  confidence: number
}

export interface DataFlowResult {
  flows: TaintFlow[]
  summary: {
    totalFlows: number
    critical: number
    high: number
    medium: number
    low: number
  }
}

// ---------------------------------------------------------------------------
// Default Taint Sources and Sinks
// ---------------------------------------------------------------------------

const DEFAULT_TAINT_SOURCES: TaintSource[] = [
  {
    name: 'user-input',
    description: 'User-controlled input',
    severity: 'high',
    patterns: [
      /req\.(body|query|params|headers)/i,
      /request\.(body|query|params|headers)/i,
      /input\(/i,
      /process\.env/i,
      /process\.argv/i,
      /\bstdin\b/i,
      /readline\(/i,
      /readFile\(/i,
      /fetch\(/i,
      /axios\(/i,
      /http\.request\(/i,
    ],
  },
  {
    name: 'filesystem',
    description: 'File system input',
    severity: 'medium',
    patterns: [
      /readFile\(/i,
      /readFileSync\(/i,
      /readdir\(/i,
      /createReadStream\(/i,
      /fs\.readFile\(/i,
    ],
  },
  {
    name: 'database',
    description: 'Database query results',
    severity: 'medium',
    patterns: [
      /query\(/i,
      /\.find\(/i,
      /\.select\(/i,
      /execute\(/i,
      /\.fetch\(/i,
    ],
  },
  {
    name: 'network',
    description: 'Network/API responses',
    severity: 'medium',
    patterns: [
      /fetch\(/i,
      /axios\(/i,
      /http\.get\(/i,
      /https\.get\(/i,
      /request\(/i,
      /\.json\(\)/i,
    ],
  },
]

const DEFAULT_TAINT_SINKS: TaintSink[] = [
  {
    name: 'sql-query',
    description: 'SQL query execution',
    severity: 'critical',
    patterns: [
      /execute\s*\(/i,
      /query\s*\(/i,
      /\.exec\(/i,
      /cursor\.execute\(/i,
      /db\.query\(/i,
    ],
    sanitizers: ['escape', 'sanitize', 'param', 'bind', 'prepare'],
  },
  {
    name: 'command-injection',
    description: 'OS command execution',
    severity: 'critical',
    patterns: [
      /exec\s*\(/i,
      /spawn\s*\(/i,
      /execSync\s*\(/i,
      /system\s*\(/i,
      /popen\s*\(/i,
      /child_process\./i,
    ],
    sanitizers: ['execFile', 'spawnSync', 'execFileSync'],
  },
  {
    name: 'code-execution',
    description: 'Dynamic code execution',
    severity: 'critical',
    patterns: [
      /\beval\s*\(/i,
      /\bFunction\s*\(/i,
      /setTimeout\s*\(\s*\w+\s*,/i,
      /setInterval\s*\(\s*\w+\s*,/i,
    ],
    sanitizers: [],
  },
  {
    name: 'path-traversal',
    description: 'File system operations',
    severity: 'high',
    patterns: [
      /readFile\(/i,
      /writeFile\(/i,
      /open\(/i,
      /createReadStream\(/i,
      /stat\(/i,
      /lstat\(/i,
      /access\(/i,
      /exists\(/i,
    ],
    sanitizers: ['normalize', 'resolve', 'basename', 'dirname', 'join'],
  },
  {
    name: 'xss',
    description: 'HTML/JS injection',
    severity: 'high',
    patterns: [
      /\.innerHTML\s*=/i,
      /\.outerHTML\s*=/i,
      /dangerouslySetInnerHTML/i,
      /document\.write\(/i,
      /\.html\s*\(/i,
    ],
    sanitizers: ['escape', 'sanitize', 'text', 'encode', 'DOMPurify'],
  },
  {
    name: 'prototype-pollution',
    description: 'Object prototype manipulation',
    severity: 'high',
    patterns: [
      /\[\s*['"]__proto__['"]\s*\]/i,
      /\[\s*['"]constructor['"]\s*\]/i,
      /Object\.assign\s*\(\s*\w+\s*,\s*\w+\s*\)/i,
    ],
    sanitizers: [],
  },
]

// ---------------------------------------------------------------------------
// Taint Analyzer
// ---------------------------------------------------------------------------

export class TaintAnalyzer {
  private lock: MikkLock
  private sources: TaintSource[]
  private sinks: TaintSink[]

  constructor(
    lock: MikkLock,
    sources?: TaintSource[],
    sinks?: TaintSink[]
  ) {
    this.lock = lock
    this.sources = sources || DEFAULT_TAINT_SOURCES
    this.sinks = sinks || DEFAULT_TAINT_SINKS
  }

  /**
   * Analyze the codebase for taint flows.
   */
  analyze(): DataFlowResult {
    const flows: TaintFlow[] = []
    const allFunctions = Object.values(this.lock.functions)

    // Find functions that contain taint sources
    const sourceFunctions = this.findTaintSources(allFunctions)

    // Find functions that contain taint sinks
    const sinkFunctions = this.findTaintSinks(allFunctions)

    // Trace taint flows through call graph
    for (const sourceFn of sourceFunctions) {
      for (const sinkFn of sinkFunctions) {
        if (sourceFn.id === sinkFn.fn.id) continue

        const flow = this.traceTaintFlow(sourceFn, sinkFn.fn, sinkFn.sink, allFunctions)
        if (flow) {
          flows.push(flow)
        }
      }
    }

    return {
      flows,
      summary: {
        totalFlows: flows.length,
        critical: flows.filter(f => f.severity === 'critical').length,
        high: flows.filter(f => f.severity === 'high').length,
        medium: flows.filter(f => f.severity === 'medium').length,
        low: flows.filter(f => f.severity === 'low').length,
      },
    }
  }

  /**
   * Find functions that contain taint sources.
   */
  private findTaintSources(functions: MikkLockFunction[]): MikkLockFunction[] {
    const sources: MikkLockFunction[] = []

    for (const fn of functions) {
      const fnText = `${fn.name} ${fn.purpose || ''}`.toLowerCase()

      for (const source of this.sources) {
        for (const pattern of source.patterns) {
          if (pattern.test(fnText)) {
            sources.push(fn)
            break
          }
        }
      }
    }

    return sources
  }

  /**
   * Find functions that contain taint sinks.
   */
  private findTaintSinks(functions: MikkLockFunction[]): Array<{ fn: MikkLockFunction; sink: TaintSink }> {
    const sinks: Array<{ fn: MikkLockFunction; sink: TaintSink }> = []

    for (const fn of functions) {
      const fnText = `${fn.name} ${fn.purpose || ''}`.toLowerCase()

      for (const sink of this.sinks) {
        for (const pattern of sink.patterns) {
          if (pattern.test(fnText)) {
            sinks.push({ fn, sink })
            break
          }
        }
      }
    }

    return sinks
  }

  /**
   * Trace taint flow from source to sink through call graph.
   */
  private traceTaintFlow(
    source: MikkLockFunction,
    sinkFn: MikkLockFunction,
    sink: TaintSink,
    allFunctions: MikkLockFunction[]
  ): TaintFlow | null {
    // Direct call: source calls sink directly
    if (source.calls?.includes(sinkFn.id)) {
      return {
        source: source.name,
        sink: sinkFn.name,
        path: [source.name, sinkFn.name],
        vulnerability: `${source.name} -> ${sinkFn.name}`,
        severity: sink.severity,
        confidence: 0.9,
      }
    }

    // Check if there's a path through the call graph
    const path = this.findPath(source.id, sinkFn.id, allFunctions)
    if (path) {
      return {
        source: source.name,
        sink: sinkFn.name,
        path: path.map(id => this.lock.functions[id]?.name || id),
        vulnerability: `${source.name} -> ${path.length - 1} intermediate(s) -> ${sinkFn.name}`,
        severity: sink.severity,
        confidence: 0.7,
      }
    }

    return null
  }

  /**
   * Find path from source to sink through call graph.
   */
  private findPath(
    sourceId: string,
    sinkId: string,
    allFunctions: MikkLockFunction[]
  ): string[] | null {
    const visited = new Set<string>()
    const path: string[] = []

    function dfs(currentId: string): boolean {
      if (currentId === sinkId) {
        path.push(currentId)
        return true
      }

      if (visited.has(currentId)) return false
      visited.add(currentId)
      path.push(currentId)

      const fn = allFunctions.find(f => f.id === currentId)
      if (fn?.calls) {
        for (const calleeId of fn.calls) {
          if (dfs(calleeId)) return true
        }
      }

      path.pop()
      return false
    }

    if (dfs(sourceId)) {
      return path
    }

    return null
  }

  /**
   * Check if a function has sanitizers that mitigate taint.
   */
  private hasSanitizer(fn: MikkLockFunction, sink: TaintSink): boolean {
    const fnText = `${fn.name} ${fn.purpose || ''}`.toLowerCase()

    for (const sanitizer of sink.sanitizers) {
      if (fnText.includes(sanitizer.toLowerCase())) {
        return true
      }
    }

    return false
  }

  /**
   * Get security findings from taint analysis.
   */
  getFindings(): Array<{
    severity: string
    title: string
    file: string
    line: number
    description: string
  }> {
    const result = this.analyze()
    const findings: Array<{
      severity: string
      title: string
      file: string
      line: number
      description: string
    }> = []

    for (const flow of result.flows) {
      const sourceFn = Object.values(this.lock.functions).find(
        f => f.name === flow.source
      )

      if (sourceFn) {
        findings.push({
          severity: flow.severity,
          title: `Potential ${flow.sink} vulnerability`,
          file: sourceFn.file,
          line: sourceFn.startLine,
          description: `Tainted data from ${flow.source} flows to ${flow.sink} via: ${flow.path.join(' -> ')}`,
        })
      }
    }

    return findings
  }
}
