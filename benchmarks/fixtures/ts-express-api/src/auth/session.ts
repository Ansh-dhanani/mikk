import { verifyToken, signToken, type JwtPayload } from './jwt'

const activeSessions = new Map<string, { userId: string; createdAt: number }>()

export function createSession(userId: string, token: string): void {
  activeSessions.set(token, { userId, createdAt: Date.now() })
}

export function validateSession(token: string): JwtPayload {
  if (!activeSessions.has(token)) {
    throw new Error('Session not found or expired')
  }
  return verifyToken(token)
}

export function revokeSession(token: string): boolean {
  return activeSessions.delete(token)
}

export function getUserActiveSessions(userId: string): string[] {
  return [...activeSessions.entries()]
    .filter(([, v]) => v.userId === userId)
    .map(([token]) => token)
}

export function purgeExpiredSessions(maxAgeMs = 7 * 24 * 60 * 60 * 1000): number {
  const cutoff = Date.now() - maxAgeMs
  let purged = 0
  for (const [token, session] of activeSessions) {
    if (session.createdAt < cutoff) {
      activeSessions.delete(token)
      purged++
    }
  }
  return purged
}
