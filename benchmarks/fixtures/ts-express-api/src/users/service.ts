import { findUserByEmail, findUserById, createUser, updateUser, deleteUser, type User } from './repository'
import { comparePassword } from '../auth/password'
import { signToken } from '../auth/jwt'
import { createSession } from '../auth/session'

export interface LoginResult {
  user: Omit<User, 'passwordHash'>
  token: string
}

export async function loginUser(email: string, password: string): Promise<LoginResult> {
  const user = await findUserByEmail(email)
  if (!user) throw new Error('Invalid credentials')
  
  const valid = await comparePassword(password, user.passwordHash)
  if (!valid) throw new Error('Invalid credentials')
  
  const token = signToken({ userId: user.id, email: user.email, role: user.role })
  createSession(user.id, token)
  
  const { passwordHash, ...safeUser } = user
  return { user: safeUser, token }
}

export async function registerUser(email: string, password: string): Promise<Omit<User, 'passwordHash'>> {
  const user = await createUser(email, password)
  const { passwordHash, ...safeUser } = user
  return safeUser
}

export async function getUserProfile(userId: string): Promise<Omit<User, 'passwordHash'>> {
  const user = await findUserById(userId)
  if (!user) throw new Error('User not found')
  const { passwordHash, ...safeUser } = user
  return safeUser
}

export async function promoteToAdmin(userId: string): Promise<void> {
  await updateUser(userId, { role: 'admin' })
}

export async function removeUser(userId: string): Promise<void> {
  const deleted = await deleteUser(userId)
  if (!deleted) throw new Error('User not found')
}
