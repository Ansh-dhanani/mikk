import { Router } from 'express'
import { loginUser, registerUser } from '../users/service'
import { isValidEmail } from '../utils/validate'

export const authRouter = Router()

authRouter.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body
    if (!isValidEmail(email)) {
      res.status(400).json({ error: 'Invalid email format' })
      return
    }
    const result = await loginUser(email, password)
    res.json(result)
  } catch (err: any) {
    res.status(401).json({ error: err.message })
  }
})

authRouter.post('/register', async (req, res) => {
  try {
    const { email, password } = req.body
    if (!isValidEmail(email)) {
      res.status(400).json({ error: 'Invalid email format' })
      return
    }
    const user = await registerUser(email, password)
    res.status(201).json(user)
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
})
