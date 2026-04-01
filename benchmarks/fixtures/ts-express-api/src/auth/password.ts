import bcrypt from 'bcrypt'

const SALT_ROUNDS = 12

export async function hashPassword(plain: string): Promise<string> {
  if (!plain || plain.length < 8) {
    throw new Error('Password must be at least 8 characters')
  }
  return bcrypt.hash(plain, SALT_ROUNDS)
}

export async function comparePassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash)
}

export function validatePasswordStrength(password: string): { valid: boolean; reason?: string } {
  if (password.length < 8) return { valid: false, reason: 'Too short' }
  if (!/[A-Z]/.test(password)) return { valid: false, reason: 'Needs uppercase' }
  if (!/[0-9]/.test(password)) return { valid: false, reason: 'Needs number' }
  return { valid: true }
}
