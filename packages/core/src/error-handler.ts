/**
 * Standardized Error Handling System
 * 
 * Provides consistent error creation, handling, and reporting across the Mikk codebase.
 * Uses centralized error codes and messages from constants.ts.
 */

import type { ERROR_CODES } from './constants.js'
import { ERROR_MESSAGES } from './constants.js'
type ErrorCodes = keyof typeof ERROR_CODES

// ─── Error Types ─────────────────────────────────────────────────────────────

export class MikkError extends Error {
    public readonly code: ErrorCodes
    public readonly category: ErrorCategory
    public readonly context: Record<string, unknown>
    public readonly timestamp: Date
    public readonly stack?: string

    constructor(
        code: ErrorCodes,
        message?: string,
        context: Record<string, unknown> = {},
        cause?: Error
    ) {
        // Get the default message from constants if not provided
        const defaultMessage = getDefaultErrorMessage(code, context)
        const finalMessage = message || defaultMessage

        super(finalMessage, { cause })
        this.name = 'MikkError'
        this.code = code
        this.category = categorizeError(code)
        this.context = context
        this.timestamp = new Date()
        
        // Capture stack trace
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, MikkError)
        }
    }

    /**
     * Create a human-readable error summary
     */
    toSummary(): string {
        return `[${this.code}] ${this.message}`
    }

    /**
     * Get detailed error information for logging
     */
    toDetailed(): string {
        const contextStr = Object.keys(this.context).length > 0
            ? `\nContext: ${JSON.stringify(this.context, null, 2)}`
            : ''
        const stackStr = this.stack ? `\nStack: ${this.stack}` : ''
        
        return `${this.toSummary()}${contextStr}${stackStr}`
    }

    /**
     * Convert to JSON for API responses
     */
    toJSON(): {
        code: ErrorCodes
        message: string
        category: ErrorCategory
        context: Record<string, unknown>
        timestamp: string
    } {
        return {
            code: this.code,
            message: this.message,
            category: this.category,
            context: this.context,
            timestamp: this.timestamp.toISOString(),
        }
    }
}

export enum ErrorCategory {
    FILE_SYSTEM = 'FILE_SYSTEM',
    MODULE_LOADING = 'MODULE_LOADING',
    GRAPH = 'GRAPH',
    TOKEN_BUDGET = 'TOKEN_BUDGET',
    VALIDATION = 'VALIDATION',
    NETWORK = 'NETWORK',
    PERFORMANCE = 'PERFORMANCE',
    UNKNOWN = 'UNKNOWN',
}

// ─── Error Creation Helpers ───────────────────────────────────────────────────

export class ErrorBuilder {
    private code?: ErrorCodes
    private message?: string
    private context: Record<string, unknown> = {}
    private cause?: Error

    static create(): ErrorBuilder {
        return new ErrorBuilder()
    }

    withCode(code: ErrorCodes): ErrorBuilder {
        this.code = code
        return this
    }

    withMessage(message: string): ErrorBuilder {
        this.message = message
        return this
    }

    withContext(key: string, value: unknown): ErrorBuilder {
        this.context[key] = value
        return this
    }

    withContextObject(context: Record<string, unknown>): ErrorBuilder {
        this.context = { ...this.context, ...context }
        return this
    }

    withCause(cause: Error): ErrorBuilder {
        this.cause = cause
        return this
    }

    build(): MikkError {
        if (!this.code) {
            throw new Error('Error code is required')
        }
        return new MikkError(this.code, this.message, this.context, this.cause)
    }
}

// ─── Error Handler Utility ───────────────────────────────────────────────────

export class ErrorHandler {
    private static instance: ErrorHandler
    private errorListeners: ((error: MikkError) => void)[] = []

    static getInstance(): ErrorHandler {
        if (!ErrorHandler.instance) {
            ErrorHandler.instance = new ErrorHandler()
        }
        return ErrorHandler.instance
    }

    /**
     * Add error listener for centralized error handling
     */
    addListener(listener: (error: MikkError) => void): void {
        this.errorListeners.push(listener)
    }

    /**
     * Remove error listener
     */
    removeListener(listener: (error: MikkError) => void): void {
        const index = this.errorListeners.indexOf(listener)
        if (index > -1) {
            this.errorListeners.splice(index, 1)
        }
    }

    /**
     * Handle an error - notifies all listeners
     */
    handleError(error: MikkError): void {
        for (const listener of this.errorListeners) {
            try {
                listener(error)
            } catch (listenerError) {
                console.error('Error in error listener:', listenerError)
            }
        }
    }

    /**
     * Wrap a function with error handling
     */
    wrap<T extends (...args: any[]) => any>(
        fn: T,
        errorCode: ErrorCodes,
        context: Record<string, unknown> = {}
    ): T {
        return ((...args: any[]) => {
            try {
                const result = fn(...args)
                
                // Handle async functions
                if (result && typeof result.catch === 'function') {
                    return result.catch((error: Error) => {
                        const mikkError = ErrorBuilder.create()
                            .withCode(errorCode)
                            .withCause(error)
                            .withContextObject(context)
                            .build()
                        
                        this.handleError(mikkError)
                        throw mikkError
                    })
                }
                
                return result
            } catch (error) {
                const mikkError = ErrorBuilder.create()
                    .withCode(errorCode)
                    .withCause(error as Error)
                    .withContextObject(context)
                    .build()
                
                this.handleError(mikkError)
                throw mikkError
            }
        }) as T
    }
}

// ─── Specialized Error Types ─────────────────────────────────────────────────

export class FileSystemError extends MikkError {
    constructor(code: ErrorCodes, filePath: string, cause?: Error) {
        super(code, undefined, { filePath }, cause)
        this.name = 'FileSystemError'
    }
}

export class ModuleLoadError extends MikkError {
    constructor(code: ErrorCodes, moduleName: string, cause?: Error) {
        super(code, undefined, { moduleName }, cause)
        this.name = 'ModuleLoadError'
    }
}

export class GraphError extends MikkError {
    constructor(code: ErrorCodes, nodeId?: string, cause?: Error) {
        super(code, undefined, { nodeId }, cause)
        this.name = 'GraphError'
    }
}

export class TokenBudgetError extends MikkError {
    constructor(code: ErrorCodes, used: number, budget: number) {
        super(code, undefined, { used, budget })
        this.name = 'TokenBudgetError'
    }
}

export class ValidationError extends MikkError {
    constructor(code: ErrorCodes, field: string, value: unknown, message?: string) {
        super(code, message, { field, value })
        this.name = 'ValidationError'
    }
}

// ─── Error Creation Functions ─────────────────────────────────────────────────

/**
 * Create a file not found error
 */
export function createFileNotFoundError(filePath: string): FileSystemError {
    return new FileSystemError('FILE_NOT_FOUND', filePath)
}

/**
 * Create a file too large error
 */
export function createFileTooLargeError(filePath: string, size: number, limit: number): FileSystemError {
    return new FileSystemError('FILE_TOO_LARGE', filePath)
}

/**
 * Create a permission denied error
 */
export function createPermissionDeniedError(path: string): FileSystemError {
    return new FileSystemError('PERMISSION_DENIED', path)
}

/**
 * Create a module not found error
 */
export function createModuleNotFoundError(moduleName: string): ModuleLoadError {
    return new ModuleLoadError('MODULE_NOT_FOUND', moduleName)
}

/**
 * Create a module load failed error
 */
export function createModuleLoadFailedError(moduleName: string, cause?: Error): ModuleLoadError {
    return new ModuleLoadError('MODULE_LOAD_FAILED', moduleName, cause)
}

/**
 * Create a graph build failed error
 */
export function createGraphBuildFailedError(reason: string): GraphError {
    return new GraphError('GRAPH_BUILD_FAILED', undefined, new Error(reason))
}

/**
 * Create a node not found error
 */
export function createNodeNotFoundError(nodeId: string): GraphError {
    return new GraphError('NODE_NOT_FOUND', nodeId)
}

/**
 * Create a token budget exceeded error
 */
export function createTokenBudgetExceededError(used: number, budget: number): TokenBudgetError {
    return new TokenBudgetError('TOKEN_BUDGET_EXCEEDED', used, budget)
}

/**
 * Create a validation error
 */
export function createValidationError(field: string, value: unknown, reason?: string): ValidationError {
    return new ValidationError('INVALID_INPUT', field, value, reason)
}

// ─── Error Utilities ─────────────────────────────────────────────────────────

/**
 * Check if an error is a MikkError
 */
export function isMikkError(error: unknown): error is MikkError {
    return error instanceof MikkError
}

/**
 * Extract the original cause from an error chain
 */
export function getRootCause(error: Error): Error {
    let current = error
    while (current.cause && current.cause instanceof Error) {
        current = current.cause
    }
    return current
}

/**
 * Convert any error to a MikkError
 */
export function toMikkError(error: unknown, defaultCode: ErrorCodes = 'UNKNOWN_ERROR' as ErrorCodes): MikkError {
    if (isMikkError(error)) {
        return error
    }
    
    if (error instanceof Error) {
        return new MikkError(defaultCode, error.message, {}, error)
    }
    
    if (typeof error === 'string') {
        return new MikkError(defaultCode, error)
    }
    
    return new MikkError(defaultCode, 'Unknown error occurred')
}

/**
 * Categorize an error code
 */
function categorizeError(code: ErrorCodes): ErrorCategory {
    if (code.includes('FILE') || code.includes('DIRECTORY')) {
        return ErrorCategory.FILE_SYSTEM
    }
    if (code.includes('MODULE')) {
        return ErrorCategory.MODULE_LOADING
    }
    if (code.includes('GRAPH') || code.includes('NODE')) {
        return ErrorCategory.GRAPH
    }
    if (code.includes('TOKEN')) {
        return ErrorCategory.TOKEN_BUDGET
    }
    if (code.includes('INVALID') || code.includes('VALIDATION')) {
        return ErrorCategory.VALIDATION
    }
    if (code.includes('TIMEOUT')) {
        return ErrorCategory.PERFORMANCE
    }
    
    return ErrorCategory.UNKNOWN
}

/**
 * Get default error message from constants
 */
function getDefaultErrorMessage(code: ErrorCodes, context: Record<string, unknown>): string {
    const template = ERROR_MESSAGES[code] || 'Unknown error occurred'
    
    let message = template as string
    
    // Replace template variables
    for (const [key, value] of Object.entries(context)) {
        message = message.replace(new RegExp(`{${key}}`, 'g'), String(value))
    }
    
    return message
}

// ─── Default Error Listener ─────────────────────────────────────────────────

/**
 * Default error listener that logs to console
 */
export function createDefaultErrorListener(): (error: MikkError) => void {
    return (error: MikkError) => {
        const timestamp = error.timestamp.toISOString()
        const category = error.category
        
        // Use appropriate console method based on category
        const logMethod = category === ErrorCategory.FILE_SYSTEM || category === ErrorCategory.MODULE_LOADING
            ? console.error
            : console.warn
        
        logMethod(`[${timestamp}] [${category}] ${error.toSummary()}`)
        
        if (process.env.NODE_ENV === 'development') {
            console.debug(error.toDetailed())
        }
    }
}

// Initialize default error listener
ErrorHandler.getInstance().addListener(createDefaultErrorListener())
