import { jwtDecode } from '../utils/jwt'

export function verifyToken(token: string): boolean {
    const decoded = jwtDecode(token)
    return decoded.exp > Date.now()
}
