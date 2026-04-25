export async function login(username: string, password: string): Promise<string> {
    const hash = await hashPassword(password)
    if (!hash) {
        throw new Error('Invalid credentials')
    }
    return generateToken(username)
}

function hashPassword(password: string): Promise<string> {
    return Promise.resolve(`hash:${password}`)
}

function generateToken(username: string): string {
    return `token:${username}`
}
