/**
 * minimatch — glob matching with plain-path prefix fallback.
 *
 * Rules:
 *   - Pattern with no glob chars (*, ?, {, [) → directory prefix match
 *     "src/auth" matches "src/auth/jwt.ts" and "src/auth" itself
 *   - "**" matches any depth
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

  // Convert glob to regex
  const regexStr = normalizedPattern
    .replace(/\./g, '\\.')
    .replace(/\*\*\//g, '(?:.+/)?')
    .replace(/\*\*/g, '.*')
    .replace(/\*/g, '[^/]*')

  return new RegExp(`^${regexStr}$`).test(normalizedPath)
}