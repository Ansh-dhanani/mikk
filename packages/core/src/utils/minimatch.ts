/**
 * minimatch — glob matching with plain-path prefix fallback.
 *
 * Rules:
 *   - Pattern with no glob chars (*, ?, {, [) → directory prefix match
 *     "src/auth" matches "src/auth/jwt.ts" and "src/auth" itself
 *   - "**" matches any depth (zero or more directory segments)
 *   - "*"  matches within a single directory segment
 */
export function minimatch(filePath: string, pattern: string): boolean {
  const normalizedPath = filePath.replace(/\\/g, '/')
  const normalizedPattern = pattern.replace(/\\/g, '/')

  // Plain path (no glob chars) → prefix match
  if (!/[*?{[]/.test(normalizedPattern)) {
    const bare = normalizedPattern.replace(/\/$/, '')
    return normalizedPath === bare || normalizedPath.startsWith(bare + '/')
  }

  // Handle patterns that start with ** - these should match anywhere in the path
  // e.g., **/venv/** should match if there's a /venv/ segment anywhere
  if (normalizedPattern.startsWith('**/')) {
    const rest = normalizedPattern.slice(3) // Remove **/
    // Check if the rest of the pattern appears as a path segment
    // For **/venv/**, check if /venv/ is in the path
    // For **/node_modules/**, check if /node_modules/ is in the path
    const segments = normalizedPath.split('/')
    const patternSegments = rest.split('/').filter(Boolean)
    
    // Check if pattern segments appear consecutively in path
    for (let i = 0; i <= segments.length - patternSegments.length; i++) {
      let match = true
      for (let j = 0; j < patternSegments.length; j++) {
        const pseg = patternSegments[j].replace(/\*/g, '[^/]*')
        if (!new RegExp('^' + pseg + '$', 'i').test(segments[i + j])) {
          match = false
          break
        }
      }
      if (match) return true
    }
    return false
  }

  // Convert glob to regex (for patterns not starting with **)
  let regexStr = normalizedPattern
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/\./g, '\\.')
  
  // Replace **/ at end with (?:[^/]+/)* - matches zero or more dir segments ending with /
  // But we need to handle path/** specifically - matching path/file, path/dir/file, etc.
  
  // Handle trailing /** specifically - should match path itself and anything under it
  if (normalizedPattern.endsWith('/**')) {
    const base = normalizedPattern.slice(0, -3) // Remove /**
    // Match either exact base or base + anything
    return normalizedPath === base || normalizedPath.startsWith(base + '/')
  }
  
  // Replace **/ with (?:[^/]+/)* - matches zero or more directory segments
  regexStr = regexStr.replace(/\*\*\//g, '(?:[^/]+/)*')
  // Replace trailing ** with (?:[^/]+/)*[^/]+ - matches zero or more at end  
  regexStr = regexStr.replace(/\*\*$/g, '(?:[^/]+/)*[^/]+')
  // Standalone **
  regexStr = regexStr.replace(/\*\*/g, '(?:[^/]+/)*[^/]+')
  // Single * matches any characters except slash
  regexStr = regexStr.replace(/\*/g, '[^/]*')

  return new RegExp(`^${regexStr}$`, 'i').test(normalizedPath)
}