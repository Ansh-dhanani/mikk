export function safeJsonParse(str, fallback = null) {
  try {
    return JSON.parse(str)
  } catch {
    return fallback
  }
}

export function safeJsonStringify(value, indent = 0) {
  try {
    return JSON.stringify(value, null, indent)
  } catch {
    return null
  }
}

export function mergeDeep(target, ...sources) {
  for (const source of sources) {
    for (const key of Object.keys(source)) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        if (!target[key]) target[key] = {}
        mergeDeep(target[key], source[key])
      } else {
        target[key] = source[key]
      }
    }
  }
  return target
}
