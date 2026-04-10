export class MikkError extends Error {
    constructor(message: string, public code: string) {
        super(message)
        this.name = 'MikkError'
        Error.captureStackTrace?.(this, this.constructor)
    }

    toJSON() {
        return {
            name: this.name,
            message: this.message,
            code: this.code,
            stack: this.stack,
        }
    }
}

export class ParseError extends MikkError {
    constructor(file: string, cause: string | Error) {
        const message = cause instanceof Error 
            ? `Failed to parse ${file}: ${cause.message}` 
            : `Failed to parse ${file}: ${cause}`
        super(message, 'PARSE_ERROR')
    }
}

export class ContractNotFoundError extends MikkError {
    constructor(path: string) {
        super(`No mikk.json found at ${path}. Run 'mikk init' first.`, 'CONTRACT_NOT_FOUND')
    }
}

export class LockNotFoundError extends MikkError {
    constructor(path?: string) {
        const msg = path 
            ? `No mikk.lock.json found at ${path}. Run 'mikk analyze' first.` 
            : `No mikk.lock.json found. Run 'mikk analyze' first.`
        super(msg, 'LOCK_NOT_FOUND')
    }
}

export class UnsupportedLanguageError extends MikkError {
    constructor(ext: string) {
        super(`Unsupported file extension: ${ext}`, 'UNSUPPORTED_LANGUAGE')
    }
}

export class OverwritePermissionError extends MikkError {
    constructor() {
        super(`Overwrite mode is 'never'. Change to 'ask' or 'explicit' to allow updates.`, 'OVERWRITE_DENIED')
    }
}

export class SyncStateError extends MikkError {
    constructor(status: string) {
        super(`Mikk is in ${status} state. Run 'mikk analyze' to sync.`, 'SYNC_STATE_ERROR')
    }
}

export class EmbeddingError extends MikkError {
    constructor(message: string, cause?: Error) {
        const fullMessage = cause 
            ? `${message}: ${cause.message}` 
            : message
        super(fullMessage, 'EMBEDDING_ERROR')
    }
}

export class SearchError extends MikkError {
    constructor(message: string, cause?: Error) {
        const fullMessage = cause 
            ? `${message}: ${cause.message}` 
            : message
        super(fullMessage, 'SEARCH_ERROR')
    }
}

export class ValidationError extends MikkError {
    constructor(message: string) {
        super(message, 'VALIDATION_ERROR')
    }
}

export class ConfigurationError extends MikkError {
    constructor(message: string) {
        super(message, 'CONFIGURATION_ERROR')
    }
}

export class TimeoutError extends MikkError {
    constructor(operation: string, timeoutMs: number) {
        super(`Operation '${operation}' timed out after ${timeoutMs}ms`, 'TIMEOUT')
    }
}

export class CacheError extends MikkError {
    constructor(message: string, cause?: Error) {
        const fullMessage = cause 
            ? `Cache error: ${message}: ${cause.message}` 
            : `Cache error: ${message}`
        super(fullMessage, 'CACHE_ERROR')
    }
}

export function isMikkError(error: unknown): error is MikkError {
    return error instanceof MikkError
}

export function getErrorCode(error: unknown): string {
    if (error instanceof MikkError) {
        return error.code
    }
    if (error instanceof Error) {
        return error.name.toUpperCase().replace(/\s+/g, '_')
    }
    return 'UNKNOWN'
}

export function formatError(error: unknown): string {
    if (isMikkError(error)) {
        return `[${error.code}] ${error.message}`
    }
    if (error instanceof Error) {
        return `${error.name}: ${error.message}`
    }
    return String(error)
}
