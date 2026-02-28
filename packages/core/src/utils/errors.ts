export class MikkError extends Error {
    constructor(message: string, public code: string) {
        super(message)
        this.name = 'MikkError'
    }
}

export class ParseError extends MikkError {
    constructor(file: string, cause: string) {
        super(`Failed to parse ${file}: ${cause}`, 'PARSE_ERROR')
    }
}

export class ContractNotFoundError extends MikkError {
    constructor(path: string) {
        super(`No mikk.json found at ${path}. Run 'mikk init' first.`, 'CONTRACT_NOT_FOUND')
    }
}

export class LockNotFoundError extends MikkError {
    constructor() {
        super(`No mikk.lock.json found. Run 'mikk analyze' first.`, 'LOCK_NOT_FOUND')
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
