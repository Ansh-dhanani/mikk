import { hashPassword } from '../auth/password'

export interface User {
  id: string
  email: string
  passwordHash: string
  role: 'admin' | 'user'
  createdAt: Date
  updatedAt: Date
}

const users = new Map<string, User>()

export async function createUser(email: string, password: string, role: 'admin' | 'user' = 'user'): Promise<User> {
  const existing = await findUserByEmail(email)
  if (existing) throw new Error('Email already registered')
  
  const user: User = {
    id: crypto.randomUUID(),
    email: email.toLowerCase().trim(),
    passwordHash: await hashPassword(password),
    role,
    createdAt: new Date(),
    updatedAt: new Date(),
  }
  users.set(user.id, user)
  return user
}

export async function findUserById(id: string): Promise<User | null> {
  return users.get(id) ?? null
}

export async function findUserByEmail(email: string): Promise<User | null> {
  const normalized = email.toLowerCase().trim()
  return [...users.values()].find(u => u.email === normalized) ?? null
}

export async function updateUser(id: string, updates: Partial<Pick<User, 'email' | 'role'>>): Promise<User> {
  const user = await findUserById(id)
  if (!user) throw new Error('User not found')
  
  const updated = { ...user, ...updates, updatedAt: new Date() }
  users.set(id, updated)
  return updated
}

export async function deleteUser(id: string): Promise<boolean> {
  return users.delete(id)
}

export async function listUsers(limit = 50, offset = 0): Promise<User[]> {
  return [...users.values()].slice(offset, offset + limit)
}

export async function countUsers(): Promise<number> {
  return users.size
}
