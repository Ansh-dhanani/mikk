/**
 * Improved Token Counter
 * 
 * Provides more accurate token counting than the simple length/4 approximation.
 * Uses a GPT-4 compatible tokenizer approximation for better budget management.
 */

// Character-based token approximation (more accurate than simple division)
const CHARS_PER_TOKEN = 3.8 // Average for GPT-4 tokenizer
const MIN_CHARS_PER_TOKEN = 2.0   // For dense code
const MAX_CHARS_PER_TOKEN = 6.0   // For sparse text

// Special token patterns that affect tokenization
const TOKEN_PATTERNS = {
    // Common programming patterns that typically tokenize as single tokens
    SINGLE_TOKEN_PATTERNS: [
        /\b(if|else|for|while|function|return|const|let|var|class|import|export)\b/g,
        /\b(true|false|null|undefined)\b/g,
        /\b(async|await|try|catch|throw|new|this)\b/g,
        // Operators and punctuation
        /[+\-*\/=<>!&|]+/g,
        /[{}()\[\];,\.]/g,
        // Common function names
        /\b(console\.log|console\.error|console\.warn)\b/g,
        /\b(Math\.(floor|ceil|round|max|min))\b/g,
    ],
    
    // Patterns that typically increase token count
    HIGH_TOKEN_PATTERNS: [
        // String literals (each character ~0.25 tokens)
        /'[^']*'/g,
        /"[^"]*"/g,
        /`[^`]*`/g,
        // Numbers (digits ~0.5 tokens each)
        /\b\d+\.?\d*\b/g,
        // Long identifiers (split into multiple tokens)
        /\b[a-z][a-zA-Z0-9]{8,}\b/g,
    ]
}

/**
 * Count tokens with improved accuracy using position-based pattern matching
 */
export function countTokens(text: string): number {
    if (!text || text.length === 0) return 0
    
    let tokenCount = 0
    const processedPositions = new Set<number>() // Track positions to avoid double-counting
    
    // Count single-token patterns with position tracking
    for (const pattern of TOKEN_PATTERNS.SINGLE_TOKEN_PATTERNS) {
        for (const match of text.matchAll(pattern)) {
            const start = match.index!
            const end = start + match[0].length
            
            // Check if this range overlaps with already processed ranges
            let overlaps = false
            for (let i = start; i < end; i++) {
                if (processedPositions.has(i)) {
                    overlaps = true
                    break
                }
            }
            
            if (!overlaps) {
                tokenCount += 1
                // Mark positions as processed
                for (let i = start; i < end; i++) {
                    processedPositions.add(i)
                }
            }
        }
    }
    
    // Count high-token patterns (strings, numbers, long identifiers)
    for (const pattern of TOKEN_PATTERNS.HIGH_TOKEN_PATTERNS) {
        for (const match of text.matchAll(pattern)) {
            const start = match.index!
            const end = start + match[0].length
            
            // Check for overlaps
            let overlaps = false
            for (let i = start; i < end; i++) {
                if (processedPositions.has(i)) {
                    overlaps = true
                    break
                }
            }
            
            if (!overlaps) {
                let tokensToAdd = 0
                if (match[0].startsWith('\'') || match[0].startsWith('"') || match[0].startsWith('`')) {
                    // String literal: roughly 1 token per 4 characters
                    tokensToAdd = Math.ceil(match[0].length / 4)
                } else if (/^\d/.test(match[0])) {
                    // Number: roughly 1 token per 2 digits
                    tokensToAdd = Math.ceil(match[0].length / 2)
                } else {
                    // Long identifier: roughly 1 token per 6 characters
                    tokensToAdd = Math.ceil(match[0].length / 6)
                }
                
                tokenCount += tokensToAdd
                // Mark positions as processed
                for (let i = start; i < end; i++) {
                    processedPositions.add(i)
                }
            }
        }
    }
    
    // Count remaining characters (general text)
    const remainingText = Array.from(text.split(''))
        .map((char, index) => processedPositions.has(index) ? '' : char)
        .join('')
    
    if (remainingText.length > 0) {
        // Use variable rate based on character density
        const avgWordLength = remainingText.split(/\s+/).reduce((sum, word) => sum + word.length, 0) / Math.max(remainingText.split(/\s+/).length, 1)
        
        let charsPerToken = CHARS_PER_TOKEN
        if (avgWordLength < 4) {
            charsPerToken = MIN_CHARS_PER_TOKEN // Dense code
        } else if (avgWordLength > 8) {
            charsPerToken = MAX_CHARS_PER_TOKEN // Sparse text
        }
        
        tokenCount += Math.ceil(remainingText.length / charsPerToken)
    }
    
    // Apply bounds checking for sanity
    const minEstimate = Math.ceil(text.length / MAX_CHARS_PER_TOKEN)
    const maxEstimate = Math.ceil(text.length / MIN_CHARS_PER_TOKEN)
    
    return Math.max(minEstimate, Math.min(maxEstimate, tokenCount))
}

/**
 * Fast token count for quick estimates (still more accurate than length/4)
 */
export function countTokensFast(text: string): number {
    if (!text || text.length === 0) return 0
    
    // Quick heuristic based on character patterns
    const codeDensity = (text.match(/[a-zA-Z0-9]/g) || []).length / text.length
    const stringRatio = (text.match(/['"`]/g) || []).length / text.length
    
    // Adjust chars per token based on content type
    let charsPerToken = CHARS_PER_TOKEN
    if (codeDensity > 0.7) {
        charsPerToken = 3.2 // Dense code
    } else if (stringRatio > 0.2) {
        charsPerToken = 4.5 // String-heavy
    } else if (codeDensity < 0.3) {
        charsPerToken = 5.0 // Sparse text/comments
    }
    
    return Math.ceil(text.length / charsPerToken)
}

/**
 * Estimate tokens for a file with content type awareness
 */
export function estimateFileTokens(content: string, filePath: string): number {
    const extension = filePath.split('.').pop()?.toLowerCase()
    
    // Adjust counting based on file type
    switch (extension) {
        case 'json':
            // JSON is token-heavy due to strings and structure
            return countTokens(content) * 1.1
        case 'md':
            // Markdown has more natural language
            return countTokens(content) * 0.9
        case 'ts':
        case 'tsx':
        case 'js':
        case 'jsx':
            // Code files benefit from pattern recognition
            return countTokens(content)
        default:
            // Use standard counting for unknown types
            return countTokens(content)
    }
}

/**
 * Token budget manager with overflow protection
 */
export class TokenBudget {
    constructor(private maxTokens: number, private overflowAllowance: number = 0.1) {}
    
    /**
     * Check if content fits within budget
     */
    fits(content: string): boolean {
        const tokens = countTokens(content)
        return tokens <= this.maxTokens * (1 + this.overflowAllowance)
    }
    
    /**
     * Get remaining token count
     */
    remaining(usedTokens: number): number {
        return Math.max(0, this.maxTokens - usedTokens)
    }
    
    /**
     * Truncate content to fit within budget
     */
    truncate(content: string, usedTokens: number = 0): string {
        const available = this.remaining(usedTokens)
        if (available <= 0) return ''
        
        const estimatedTokens = countTokens(content)
        if (estimatedTokens <= available) return content
        
        // Rough truncation based on character ratio
        const ratio = available / estimatedTokens
        const truncateAt = Math.floor(content.length * ratio * 0.9) // 10% buffer
        
        return content.substring(0, truncateAt) + '\n... [truncated due to token budget]'
    }
}
