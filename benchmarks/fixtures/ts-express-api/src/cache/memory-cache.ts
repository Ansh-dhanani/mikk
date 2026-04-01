/**
 * Simple in-memory cache for ephemeral data (rate limits, sessions, etc.)
 * Not suitable for production multi-instance deployments.
 */

const store = new Map<string, { value: any; expiresAt: number | null }>()

/**
 * Store a value in the cache with an optional TTL (milliseconds).
 */
export function set(key: string, value: any, ttlMs?: number): void {
  store.set(key, {
    value,
    expiresAt: ttlMs != null ? Date.now() + ttlMs : null,
  })
}

/**
 * Retrieve a value from the cache. Returns undefined if key is missing or expired.
 */
export function get<T = any>(key: string): T | undefined {
  const entry = store.get(key)
  if (!entry) return undefined
  if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
    store.delete(key)
    return undefined
  }
  return entry.value as T
}

/**
 * Remove a key from the cache.
 */
export function invalidate(key: string): boolean {
  return store.delete(key)
}
