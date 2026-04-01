import type { Request, Response, NextFunction } from 'express'
import { verifyToken } from '../auth/jwt'
import { validateSession } from '../auth/session'

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing authorization header' })
    return
  }
  
  const token = authHeader.slice(7)
  try {
    const payload = validateSession(token)
    ;(req as any).user = payload
    next()
  } catch (err) {
    res.status(401).json({ error: 'Invalid or expired token' })
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const user = (req as any).user
  if (!user || user.role !== 'admin') {
    res.status(403).json({ error: 'Admin access required' })
    return
  }
  next()
}
