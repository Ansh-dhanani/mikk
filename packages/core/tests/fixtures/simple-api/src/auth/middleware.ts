import { verifyToken } from './verify'

export function authMiddleware(req: any, res: any, next: any) {
    const token = req.headers.authorization
    if (!verifyToken(token)) {
        return res.status(401).json({ error: 'Unauthorized' })
    }
    next()
}
