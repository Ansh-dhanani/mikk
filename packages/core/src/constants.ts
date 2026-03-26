/**
 * Centralized constants for the Mikk codebase
 * 
 * This file contains all magic numbers, thresholds, and configuration values
 * that were previously scattered throughout the codebase.
 */

// ─── Memory Management ───────────────────────────────────────────────────────

export const MEMORY_LIMITS = {
    WARNING: 100 * 1024 * 1024,    // 100MB
    CRITICAL: 200 * 1024 * 1024,   // 200MB
    EMERGENCY: 400 * 1024 * 1024,  // 400MB
} as const

export const MEMORY_CONFIG = {
    MAX_AGE: 30 * 60 * 1000,        // 30 minutes
    MAX_NODES: 10000,               // Maximum nodes to keep in memory
    GC_INTERVAL: 60 * 1000,         // GC check interval (1 minute)
    LARGE_GRAPH_THRESHOLD: 5000,    // Nodes count to trigger memory monitoring
    MEMORY_CHECK_INTERVAL: 1000,    // Check memory every N nodes processed
    MEMORY_INCREASE_THRESHOLD: 100 * 1024 * 1024, // 100MB increase triggers GC
} as const

// ─── Token Budgeting ───────────────────────────────────────────────────────

export const TOKEN_BUDGETS = {
    DEFAULT_CLAUDE_MD: 12000,
    DEFAULT_CONTEXT_QUERY: 6000,
    MIN_TOKEN_BUDGET: 1000,
    MAX_TOKEN_BUDGET: 50000,
} as const

export const TOKEN_ESTIMATION = {
    CHARS_PER_TOKEN: 3.8,          // Average for GPT-4 tokenizer
    MIN_CHARS_PER_TOKEN: 2.0,      // For dense code
    MAX_CHARS_PER_TOKEN: 6.0,      // For sparse text
    OVERFLOW_ALLOWANCE: 0.1,       // 10% buffer
} as const

// ─── Graph Traversal ─────────────────────────────────────────────────────────

export const GRAPH_LIMITS = {
    DEFAULT_MAX_HOPS: 4,
    MAX_HOPS_HARD_LIMIT: 10,
    MIN_HOPS: 1,
    BREADTH_FIRST_QUEUE_SIZE: 1000,
} as const

export const RISK_SCORING = {
    CRITICAL_THRESHOLD: 80,
    HIGH_THRESHOLD: 60,
    MEDIUM_THRESHOLD: 40,
    MODULE_BOUNDARY_BOOST: 80,     // Risk boost for crossing module boundaries
} as const

export const CONFIDENCE_SCORING = {
    DEFAULT_CONFIDENCE: 1.0,
    MIN_CONFIDENCE: 0.0,
    MAX_CONFIDENCE: 1.0,
    DECIMAL_PLACES: 3,
} as const

// ─── File Processing ───────────────────────────────────────────────────────

export const FILE_LIMITS = {
    MAX_FILE_SIZE: 5 * 1024 * 1024,  // 5MB
    MAX_FILE_SIZE_FOR_PROCESSING: 10 * 1024 * 1024, // 10MB
    MAX_FILES_PER_DIRECTORY: 1000,
} as const

export const FILE_PATTERNS = {
    IGNORED_DIRECTORIES: [
        'node_modules',
        '.git',
        '.vscode',
        '.idea',
        'dist',
        'build',
        'coverage',
        '.next',
        '.nuxt',
        '.cache',
        'tmp',
        'temp',
    ],
    SOURCE_EXTENSIONS: [
        'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs',
        'py', 'go', 'rs', 'java', 'kt', 'cs', 'swift',
        'php', 'rb', 'dart', 'ex', 'exs',
    ],
    CONFIG_EXTENSIONS: [
        'json', 'yaml', 'yml', 'toml', 'xml',
        'md', 'txt', 'env', 'config',
    ],
} as const

// ─── Benchmark Configuration ─────────────────────────────────────────────────

export const BENCHMARK_CONFIG = {
    DEFAULT_TIMEOUT: 10000,         // 10 seconds
    COMMAND_TIMEOUT: 15000,         // 15 seconds for external commands
    MAX_TEST_CASES: 100,
    SCORING_PRECISION: 2,           // Decimal places for scores
} as const

export const BENCHMARK_THRESHOLDS = {
    MIN_ACCURACY: 0,                // 0%
    MAX_ACCURACY: 100,              // 100%
    TOKEN_EFFICIENCY_MIN: 0.1,     // 10% efficiency
    TOKEN_EFFICIENCY_MAX: 10.0,    // 1000% efficiency
} as const

// ─── Dead Code Detection ─────────────────────────────────────────────────────

export const DEAD_CODE_PATTERNS = {
    ENTRY_POINT_PATTERNS: [
        /^(main|bootstrap|start|init|setup|configure|register|mount)$/i,
        /^(app|server|index|mod|program)$/i,
        /Handler$/i,
        /Middleware$/i,
        /Controller$/i,
        /^use[A-Z]/,       // React hooks
        /^handle[A-Z]/,    // Event handlers
        /^on[A-Z]/,        // Event listeners
    ],
    TEST_PATTERNS: [
        /^(it|describe|test|beforeAll|afterAll|beforeEach|afterEach)$/,
        /\.test\./,
        /\.spec\./,
        /__test__/,
    ],
    DYNAMIC_USAGE_PATTERNS: [
        /^addEventListener$/i,
        /^removeEventListener$/i,
        /^on[A-Z]/,
        /(invoke|dispatch|emit|call|apply)/i,
        /^ngOnInit$/i,
        /^componentDidMount$/i,
        /^componentWillUnmount$/i,
    ],
} as const

export const DEAD_CODE_CONFIDENCE = {
    HIGH_CONFIDENCE_RULES: 3,       // Number of rules to pass for high confidence
    MEDIUM_CONFIDENCE_RULES: 2,     // Number of rules to pass for medium confidence
} as const

// ─── Error Handling ─────────────────────────────────────────────────────────

export const ERROR_CODES = {
    // File system errors
    FILE_NOT_FOUND: 'FILE_NOT_FOUND',
    FILE_TOO_LARGE: 'FILE_TOO_LARGE',
    PERMISSION_DENIED: 'PERMISSION_DENIED',
    DIRECTORY_NOT_FOUND: 'DIRECTORY_NOT_FOUND',
    
    // Module loading errors
    MODULE_NOT_FOUND: 'MODULE_NOT_FOUND',
    MODULE_LOAD_FAILED: 'MODULE_LOAD_FAILED',
    
    // Graph errors
    GRAPH_BUILD_FAILED: 'GRAPH_BUILD_FAILED',
    NODE_NOT_FOUND: 'NODE_NOT_FOUND',
    CIRCULAR_DEPENDENCY: 'CIRCULAR_DEPENDENCY',
    
    // Token/budget errors
    TOKEN_BUDGET_EXCEEDED: 'TOKEN_BUDGET_EXCEEDED',
    INVALID_TOKEN_COUNT: 'INVALID_TOKEN_COUNT',
    
    // General errors
    INVALID_INPUT: 'INVALID_INPUT',
    OPERATION_TIMEOUT: 'OPERATION_TIMEOUT',
    UNKNOWN_ERROR: 'UNKNOWN_ERROR',
} as const

export const ERROR_MESSAGES = {
    [ERROR_CODES.FILE_NOT_FOUND]: 'Required file not found: {file}. Run \'mikk init\' first.',
    [ERROR_CODES.FILE_TOO_LARGE]: 'File too large for processing: {file} ({size} bytes, limit: {limit} bytes)',
    [ERROR_CODES.PERMISSION_DENIED]: 'Permission denied accessing: {path}',
    [ERROR_CODES.DIRECTORY_NOT_FOUND]: 'Directory not found: {path}',
    
    [ERROR_CODES.MODULE_NOT_FOUND]: 'Required module not found: {module}',
    [ERROR_CODES.MODULE_LOAD_FAILED]: 'Failed to load module: {module}. Ensure \'bun run build\' has been executed.',
    
    [ERROR_CODES.GRAPH_BUILD_FAILED]: 'Failed to build dependency graph: {reason}',
    [ERROR_CODES.NODE_NOT_FOUND]: 'Node not found in graph: {nodeId}',
    [ERROR_CODES.CIRCULAR_DEPENDENCY]: 'Circular dependency detected: {path}',
    
    [ERROR_CODES.TOKEN_BUDGET_EXCEEDED]: 'Token budget exceeded: {used} > {budget}',
    [ERROR_CODES.INVALID_TOKEN_COUNT]: 'Invalid token count: {count}',
    
    [ERROR_CODES.INVALID_INPUT]: 'Invalid input: {reason}',
    [ERROR_CODES.OPERATION_TIMEOUT]: 'Operation timed out after {timeout}ms',
    [ERROR_CODES.UNKNOWN_ERROR]: 'Unexpected error: {message}',
} as const

// ─── Performance Tuning ─────────────────────────────────────────────────────

export const PERFORMANCE_CONFIG = {
    CACHE_SIZE_LIMIT: 10000,        // Maximum cache entries
    CACHE_TTL: 30 * 60 * 1000,      // 30 minutes
    BATCH_SIZE: 100,               // Operations per batch
    CONCURRENT_LIMIT: 10,          // Maximum concurrent operations
} as const

// ─── Logging & Debugging ────────────────────────────────────────────────────

export const LOG_LEVELS = {
    ERROR: 0,
    WARN: 1,
    INFO: 2,
    DEBUG: 3,
    TRACE: 4,
} as const

export const DEBUG_CONFIG = {
    ENABLE_MEMORY_LOGGING: false,
    ENABLE_PERFORMANCE_LOGGING: false,
    ENABLE_GRAPH_LOGGING: false,
    LOG_SAMPLE_RATE: 0.1,          // Log 10% of operations
} as const

// ─── Validation Rules ───────────────────────────────────────────────────────

export const VALIDATION_RULES = {
    MIN_PROJECT_NAME_LENGTH: 1,
    MAX_PROJECT_NAME_LENGTH: 100,
    MIN_MODULE_NAME_LENGTH: 1,
    MAX_MODULE_NAME_LENGTH: 50,
    MIN_FUNCTION_NAME_LENGTH: 1,
    MAX_FUNCTION_NAME_LENGTH: 100,
    MAX_DESCRIPTION_LENGTH: 1000,
} as const

// ─── API Configuration ───────────────────────────────────────────────────────

export const API_CONFIG = {
    DEFAULT_PAGE_SIZE: 20,
    MAX_PAGE_SIZE: 100,
    MIN_PAGE_SIZE: 1,
    RATE_LIMIT_WINDOW: 60 * 1000,  // 1 minute
    RATE_LIMIT_MAX_REQUESTS: 1000,
} as const

// ─── Utility Functions ─────────────────────────────────────────────────────

/**
 * Format bytes to human readable string
 */
export function formatBytes(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB']
    let size = bytes
    let unitIndex = 0
    
    while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024
        unitIndex++
    }
    
    return `${size.toFixed(1)}${units[unitIndex]}`
}

/**
 * Format milliseconds to human readable string
 */
export function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
    return `${(ms / 60000).toFixed(1)}m`
}

/**
 * Check if a value is within a range
 */
export function inRange(value: number, min: number, max: number): boolean {
    return value >= min && value <= max
}

/**
 * Clamp a value to a range
 */
export function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value))
}
