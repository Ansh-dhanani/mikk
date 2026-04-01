let connected = false

export async function connectDatabase(): Promise<void> {
  if (connected) return
  console.log('Connecting to database...')
  await new Promise(resolve => setTimeout(resolve, 100))
  connected = true
  console.log('Database connected')
}

export function isConnected(): boolean {
  return connected
}

export async function disconnectDatabase(): Promise<void> {
  connected = false
}
