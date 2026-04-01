export async function withRetry(fn, { retries = 3, delayMs = 500, backoff = 2 } = {}) {
  let lastError
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, delayMs * Math.pow(backoff, attempt)))
      }
    }
  }
  throw lastError
}

export async function withTimeout(promise, ms) {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms)
  })
  try {
    return await Promise.race([promise, timeout])
  } finally {
    clearTimeout(timer)
  }
}

export async function mapConcurrent(items, fn, concurrency = 5) {
  const results = []
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency)
    results.push(...await Promise.all(batch.map(fn)))
  }
  return results
}
