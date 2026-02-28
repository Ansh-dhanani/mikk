type LogLevel = 'debug' | 'info' | 'warn' | 'error'

let currentLogLevel: LogLevel = 'info'
const levelOrder: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 }

export function setLogLevel(level: LogLevel | 'silent') {
    if (level === 'silent') {
        currentLogLevel = 'error'
        process.env.MIKK_LOG_LEVEL = 'silent'
    } else {
        currentLogLevel = level
    }
}

function shouldLog(level: LogLevel): boolean {
    if (process.env.MIKK_LOG_LEVEL === 'silent') return false
    return levelOrder[level] >= levelOrder[currentLogLevel]
}

function log(level: LogLevel, message: string, data?: object) {
    if (!shouldLog(level)) return
    const entry = {
        level,
        timestamp: new Date().toISOString(),
        message,
        ...data
    }
    console.error(JSON.stringify(entry))
}

export const logger = {
    debug: (message: string, data?: object) => log('debug', message, data),
    info: (message: string, data?: object) => log('info', message, data),
    warn: (message: string, data?: object) => log('warn', message, data),
    error: (message: string, data?: object) => log('error', message, data),
}
