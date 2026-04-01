const requestCounts = new Map<string, { count: number; resetAt: number }>()

export function checkRateLimit(ip: string, limit = 100, windowMs = 60000): boolean {
  const now = Date.now()
  const entry = requestCounts.get(ip)
  
  if (!entry || now > entry.resetAt) {
    requestCounts.set(ip, { count: 1, resetAt: now + windowMs })
    return true
  }
  
  if (entry.count >= limit) return false
  entry.count++
  return true
}

// Dead code — never called from anywhere
export function resetRateLimitForIp(ip: string): void {
  requestCounts.delete(ip)
}

export function getRateLimitStats(): { totalTracked: number } {
  return { totalTracked: requestCounts.size }
}
