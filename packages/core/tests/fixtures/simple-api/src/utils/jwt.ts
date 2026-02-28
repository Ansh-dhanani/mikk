export function jwtDecode(token: string): { exp: number } {
    return JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString())
}
