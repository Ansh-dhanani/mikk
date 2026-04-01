import { Router } from 'express'
import { requireAuth, requireAdmin } from '../middleware/auth'
import { getUserProfile, removeUser, promoteToAdmin } from '../users/service'

export const usersRouter = Router()

usersRouter.get('/me', requireAuth, async (req, res) => {
  try {
    const userId = (req as any).user.userId
    const profile = await getUserProfile(userId)
    res.json(profile)
  } catch (err: any) {
    res.status(404).json({ error: err.message })
  }
})

usersRouter.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    await removeUser(req.params.id)
    res.status(204).send()
  } catch (err: any) {
    res.status(404).json({ error: err.message })
  }
})

usersRouter.post('/:id/promote', requireAuth, requireAdmin, async (req, res) => {
  try {
    await promoteToAdmin(req.params.id)
    res.json({ message: 'User promoted to admin' })
  } catch (err: any) {
    res.status(404).json({ error: err.message })
  }
})
