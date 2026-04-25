import type { MikkLock } from '@getmikk/core'

// ─── mikk_list_types ───────────────────────────────────────────────────────
export async function registerLockTools() {
  // Note: These tools would be registered in the MCP server
  // They're implemented using @getmikk/core hooks
}

// @getmikk/core tool implementations (for reference)

/** mikk_list_types
 * Get all type definitions (interfaces, types, enums)
 */
export function impl_list_types(lock: MikkLock) {
  const generics = lock.generics ?? {}
  const types = Object.entries(generics).map(([id, val]) => {
    const parts = id.split(':')
    const [typePrefix, file] = parts.slice(-2)
    return {
      id,
      name: parts.pop()?.split(':').pop() ?? id,
      type: typePrefix === 'enum' ? 'enum' : 'type',
      file: (val as any).file,
    }
  })
  return { types, count: types.length }
}

/** mikk_get_data_layer
 * Get all data models (schemas, entities, ORM) 
 */
export function impl_get_data_layer(lock: MikkLock) {
  const dataFiles = lock.contextFiles?.filter(cf => 
    cf.type === 'schema' || cf.type === 'model'
  ) ?? []
  
  const modelPatterns = ['model', 'entity', 'repository', 'schema', 'dto']
  const functionModels = Object.values(lock.functions ?? {}).filter(fn => {
    const file = (fn.file ?? '').toLowerCase()
    return modelPatterns.some(p => file.includes(`/${p}/`) || file.includes(`/${p}.`))
  })
  
  return {
    schemas: dataFiles.filter(cf => cf.type === 'schema'),
    models: dataFiles.filter(cf => cf.type === 'model'),
    codeModels: functionModels.map(fn => ({
      id: fn.id,
      name: fn.name,
      file: fn.file,
    })),
    total: dataFiles.length + functionModels.length
  }
}

/** mikk_get_module_deps
 * Get explicit module dependencies
 */
export function impl_get_module_deps(lock: MikkLock, moduleId: string) {
  const mod = lock.modules?.[moduleId]
  if (!mod) return { error: `Module "${moduleId}" not found` }
  
  const deps = new Set<string>()
  
  // Find cross-module calls
  for (const [id, fn] of Object.entries(lock.functions)) {
    if (fn.moduleId === moduleId) {
      const calls = (fn as any).calls ?? []
      for (const callId of calls) {
        const targetFn = lock.functions[callId]
        if (targetFn?.moduleId && targetFn.moduleId !== moduleId) {
          deps.add(targetFn.moduleId)
        }
      }
    }
  }
  
  return {
    moduleId,
    dependencies: Array.from(deps),
    count: deps.size
  }
}

/** mikk_get_function_quality
 * Get function quality metrics
 */
export function impl_get_function_quality(lock: MikkLock, functionId: string) {
  const fn = lock.functions[functionId] ?? lock.functions[`fn:${functionId}`]
  if (!fn) return { error: `Function "${functionId}" not found` }
  
  const meta = fn as any
  return {
    id: functionId,
    name: fn.name,
    hasErrorHandling: !!meta.errorHandling?.length,
    errorHandlingCount: meta.errorHandling?.length ?? 0,
    edgeCasesCount: meta.edgeCasesHandled?.length ?? 0,
    isExported: fn.isExported ?? false,
    isAsync: fn.isAsync ?? false,
    paramCount: fn.params?.length ?? 0,
    hasReturnType: !!fn.returnType,
    callsCount: meta.calls?.length ?? 0,
  }
}

/** mikk_get_sync_state
 * Get lock sync status
 */
export function impl_get_sync_state(lock: MikkLock) {
  return {
    version: lock.version,
    generatedAt: lock.generatedAt,
    generatorVersion: lock.generatorVersion,
    syncState: lock.syncState ?? null,
  }
}