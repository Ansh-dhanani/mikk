import jwt from 'jsonwebtoken'

const SECRET = process.env.JWT_SECRET || 'dev-secret'
const EXPIRY = '7d'

export interface JwtPayload {
  userId: string
  email: string
  role: 'admin' | 'user'
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, SECRET, { expiresIn: EXPIRY })
}

export function verifyToken(token: string): JwtPayload {
  try {
    return jwt.verify(token, SECRET) as JwtPayload
  } catch (err) {
    throw new Error('Invalid or expired token')
  }
}

export function decodeToken(token: string): JwtPayload | null {
  try {
    return jwt.decode(token) as JwtPayload
  } catch {
    return null
  }
}

export function refreshToken(token: string): string {
  const payload = verifyToken(token)
  const { iat, exp, ...cleanPayload } = payload as any
  return signToken(cleanPayload)
}