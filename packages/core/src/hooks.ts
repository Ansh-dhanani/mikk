/**
 * @getmikk/core — Composable API Hooks
 * 
 * Basic building blocks for code intelligence.
 * Compose these to build custom tools.
 * 
 * @example
 * ```typescript
 * import { searchFunctions, getModule, classifyFile, getDataLayer } from '@getmikk/core'
 * 
 * // Load lock first (from file, MCP, or elsewhere)
 * const lock = JSON.parse(fs.readFileSync('mikk.lock.json'))
 * 
 * // Basic: Find and inspect
 * const users = searchFunctions(lock, 'user')
 * const role = classifyFile('src/app/page.tsx')
 * const models = getDataLayer(lock)
 * 
 * // Compose: Build custom tool
 * function findAuthHandlers(lock) {
 *   return searchFunctions(lock, 'handler').filter(fn => 
 *     getModule(lock, fn.moduleId ?? '')?.name.includes('auth')
 *   )
 * }
 * ```
 */

import type { MikkLock, MikkLockFunction, MikkLockClass, MikkLockModule, MikkLockRoute, MikkLockContextFile } from './contract/schema.js'
import { SemanticRoleClassifier } from './graph/semantic-role-classifier.js'
import type { FileRoleClassification } from './graph/semantic-role-classifier.js'

// ─── Lock Metadata ───────────────────────────────────────────────────

/** Get lock metadata */
export function getLockMeta(lock: MikkLock) {
  return {
    version: lock.version,
    generatedAt: lock.generatedAt,
    functionCount: Object.keys(lock.functions ?? {}).length,
    classCount: Object.keys(lock.classes ?? {}).length,
    moduleCount: Object.keys(lock.modules ?? {}).length,
    fileCount: Object.keys(lock.files ?? {}).length,
    routeCount: lock.routes?.length ?? 0,
  }
}

// ─── Search & Find ───────────────────────────────────────────────────

/** Search functions by name pattern */
export function searchFunctions(lock: MikkLock, query: string, options?: { limit?: number }): MikkLockFunction[] {
  const q = query.toLowerCase()
  const limit = options?.limit ?? 50
  const results: MikkLockFunction[] = []
  
  const fns = lock.functions ?? {}
  for (const [id, fn] of Object.entries(fns)) {
    const name = (fn.name ?? '').toLowerCase()
    if (name.includes(q) || id.toLowerCase().includes(q)) {
      results.push(fn)
      if (results.length >= limit) break
    }
  }
  return results
}

/** Find function by exact name or ID */
export function getFunction(lock: MikkLock, nameOrId: string): MikkLockFunction | undefined {
  const fns = lock.functions ?? {}
  if (fns[nameOrId]) return fns[nameOrId]
  for (const fn of Object.values(fns)) {
    if (fn.name === nameOrId) return fn
  }
  return undefined
}

/** Find class by name */
export function getClass(lock: MikkLock, name: string): MikkLockClass | undefined {
  return (lock.classes ?? {})[name]
}

/** Get all classes */
export function getAllClasses(lock: MikkLock): MikkLockClass[] {
  return Object.values(lock.classes ?? {})
}

/** Get all modules */
export function getAllModules(lock: MikkLock): MikkLockModule[] {
  return Object.values(lock.modules ?? {})
}

/** Get module by ID */
export function getModule(lock: MikkLock, moduleId: string): MikkLockModule | undefined {
  return (lock.modules ?? {})[moduleId]
}

// ─── Semantic Role ─────────────────────────────────────────────────

/** Classify file role (route, model, handler, etc.) */
export function classifyFile(filePath: string): FileRoleClassification {
  const classifier = new SemanticRoleClassifier()
  const normalized = filePath.replace(/\\/g, '/')
  return classifier.classifyFile(normalized)
}

/** Check if file is dead-code exempt (routes, pages, components) */
export function isDeadCodeExempt(filePath: string): boolean {
  const classifier = new SemanticRoleClassifier()
  const normalized = filePath.replace(/\\/g, '/')
  return classifier.isFileDeadCodeExempt(normalized)
}

// ─── Routes ────────────────────────────────────────────────────────

/** Get all HTTP routes */
export function getRoutes(lock: MikkLock): MikkLockRoute[] {
  return lock.routes ?? []
}

/** Find route by path pattern */
export function findRoute(lock: MikkLock, pathPattern: string): MikkLockRoute[] {
  const q = pathPattern.toLowerCase()
  return (lock.routes ?? []).filter(r => 
    (r.path?.toLowerCase() ?? '').includes(q) || 
    (r.handler?.toLowerCase() ?? '').includes(q)
  )
}

// ─── Data Layer ─────────────────────────────────────────────────

/** Get all data models (schemas, entities, ORM) */
export function getDataLayer(lock: MikkLock): MikkLockContextFile[] {
  return lock.contextFiles?.filter(cf => 
    cf.type === 'schema' || cf.type === 'model'
  ) ?? []
}

/** Get context files by type */
export function getContextFiles(lock: MikkLock, type?: string): MikkLockContextFile[] {
  if (!type) return lock.contextFiles ?? []
  return (lock.contextFiles ?? []).filter(cf => cf.type === type)
}

// ─── Files ────────────────────────────────────────────────────────

/** Get all tracked files */
export function getAllFiles(lock: MikkLock): string[] {
  return Object.keys(lock.files ?? {})
}

/** Get file metadata */
export function getFile(lock: MikkLock, filePath: string) {
  return (lock.files ?? {})[filePath]
}

// ─── Graph Helpers ───────────────────────────────────────────────

/** Get function file path */
export function getFunctionFile(fn: MikkLockFunction): string {
  return fn.file ?? ''
}

/** Get function module */
export function getFunctionModule(lock: MikkLock, fn: MikkLockFunction): MikkLockModule | undefined {
  return fn.moduleId ? (lock.modules ?? {})[fn.moduleId] : undefined
}

/** Get files in module */
export function getModuleFiles(lock: MikkLock, moduleId: string): string[] {
  const mod = (lock.modules ?? {})[moduleId]
  return mod?.files ?? []
}

/** Get functions in module */
export function getModuleFunctions(lock: MikkLock, moduleId: string): MikkLockFunction[] {
  const fns = lock.functions ?? {}
  return Object.values(fns).filter(fn => fn.moduleId === moduleId)
}

// ─── Utilities for Composability ─────────────────────────────────

/** Map functions by module */
export function groupByModule(lock: MikkLock): Record<string, MikkLockFunction[]> {
  const fns = lock.functions ?? {}
  const grouped: Record<string, MikkLockFunction[]> = {}
  for (const fn of Object.values(fns)) {
    const modId = fn.moduleId ?? 'unknown'
    if (!grouped[modId]) grouped[modId] = []
    grouped[modId].push(fn)
  }
  return grouped
}

/** Map functions by file */
export function groupByFile(lock: MikkLock): Record<string, MikkLockFunction[]> {
  const fns = lock.functions ?? {}
  const grouped: Record<string, MikkLockFunction[]> = {}
  for (const fn of Object.values(fns)) {
    const file = fn.file ?? 'unknown'
    if (!grouped[file]) grouped[file] = []
    grouped[file].push(fn)
  }
  return grouped
}

/** Get caller IDs for a function */
export function getCallers(lock: MikkLock, fnId: string): string[] {
  const fn = lock.functions?.[fnId]
  return (fn as any)?.calledBy ?? []
}

/** Get callee IDs for a function */
export function getCallees(lock: MikkLock, fnId: string): string[] {
  const fn = lock.functions?.[fnId]
  return (fn as any)?.calls ?? []
}

// ─── Simple Filtering ───────────────────────────────────────────

/** Filter functions by export status */
export function getExportedFunctions(lock: MikkLock): MikkLockFunction[] {
  return Object.values(lock.functions ?? {}).filter(fn => fn.isExported)
}

/** Filter functions by async */
export function getAsyncFunctions(lock: MikkLock): MikkLockFunction[] {
  return Object.values(lock.functions ?? {}).filter(fn => fn.isAsync)
}

/** Filter by return type */
export function getFunctionsReturning(lock: MikkLock, returnType: string): MikkLockFunction[] {
  const rt = returnType.toLowerCase()
  return Object.values(lock.functions ?? {}).filter(fn => 
    (fn.returnType ?? '').toLowerCase().includes(rt)
  )
}
