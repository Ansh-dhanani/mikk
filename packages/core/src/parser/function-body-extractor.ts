import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import type { RichFunction } from '../graph/rich-function-index.js'

export interface FunctionBody {
    id: string
    name: string
    file: string
    startLine: number
    endLine: number
    body: string
    fullSource: string
    isComplete: boolean
    trimmedLines: number
}

export interface BodyExtractOptions {
    maxLines?: number
    includeComments?: boolean
    includeImports?: boolean
    contextLines?: number
}

export class FunctionBodyExtractor {
    private cache: Map<string, string> = new Map()
    private bodyCache: Map<string, FunctionBody> = new Map()

    async extractBody(fn: RichFunction, options: BodyExtractOptions = {}): Promise<FunctionBody | null> {
        const cacheKey = `${fn.id}:${fn.startLine}:${fn.endLine}`
        
        if (this.bodyCache.has(cacheKey)) {
            return this.bodyCache.get(cacheKey)!
        }

        const { maxLines = 500, contextLines = 0 } = options
        
        const source = await this.readSource(fn.file)
        if (!source) {
            return null
        }

        const lines = source.split('\n')
        
        const startLine = Math.max(0, fn.startLine - 1 - contextLines)
        const endLine = Math.min(lines.length, fn.endLine + contextLines)
        
        const bodyLines = lines.slice(startLine, endLine)
        const body = bodyLines.join('\n')
        
        const isComplete = fn.endLine <= lines.length && bodyLines.length >= fn.endLine - fn.startLine
        
        const result: FunctionBody = {
            id: fn.id,
            name: fn.name,
            file: fn.file,
            startLine: fn.startLine,
            endLine: fn.endLine,
            body,
            fullSource: source,
            isComplete,
            trimmedLines: lines.length - endLine,
        }
        
        this.bodyCache.set(cacheKey, result)
        return result
    }

    async extractBodies(fns: RichFunction[], options: BodyExtractOptions = {}): Promise<Map<string, FunctionBody>> {
        const results = new Map<string, FunctionBody>()
        
        for (const fn of fns) {
            const body = await this.extractBody(fn, options)
            if (body) {
                results.set(fn.id, body)
            }
        }
        
        return results
    }

    async extractBodiesByIds(ids: string[], getFn: (id: string) => RichFunction | undefined, options: BodyExtractOptions = {}): Promise<Map<string, FunctionBody>> {
        const results = new Map<string, FunctionBody>()
        
        const fns = ids.map(id => getFn(id)).filter(Boolean) as RichFunction[]
        const bodies = await this.extractBodies(fns, options)
        
        for (const [id, body] of bodies) {
            results.set(id, body)
        }
        
        return results
    }

    private async readSource(filePath: string): Promise<string | null> {
        if (this.cache.has(filePath)) {
            return this.cache.get(filePath)!
        }

        if (!existsSync(filePath)) {
            return null
        }

        try {
            const content = await readFile(filePath, 'utf-8')
            this.cache.set(filePath, content)
            return content
        } catch {
            return null
        }
    }

    clearCache(): void {
        this.cache.clear()
        this.bodyCache.clear()
    }

    getCachedCount(): number {
        return this.cache.size
    }

    getBodyCacheCount(): number {
        return this.bodyCache.size
    }
}

export interface ExtractResult {
    success: boolean
    body?: string
    signature?: string
    params?: string
    returnType?: string
    docComment?: string
    error?: string
}

export async function extractFunction(
    filePath: string,
    functionName: string,
    options: BodyExtractOptions = {}
): Promise<ExtractResult> {
    if (!existsSync(filePath)) {
        return { success: false, error: 'File not found' }
    }

    try {
        const content = await readFile(filePath, 'utf-8')
        const lines = content.split('\n')
        
        let startLine = -1
        let endLine = -1
        let braceCount = 0
        let inFunction = false
        let foundOpening = false
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i]
            
            if (!inFunction && (line.includes(`function ${functionName}`) || line.includes(`const ${functionName}`) || line.includes(`${functionName}(`) || line.includes(`async ${functionName}`))) {
                if (line.includes(`function ${functionName}`) || line.includes(`async function ${functionName}`) || line.match(new RegExp(`(const|let|var)\\s+${functionName}\\s*=`)) || line.match(new RegExp(`${functionName}\\s*\\(`))) {
                    inFunction = true
                    startLine = i
                }
            }
            
            if (inFunction) {
                for (const char of line) {
                    if (char === '{') {
                        braceCount++
                        foundOpening = true
                    } else if (char === '}') {
                        braceCount--
                    }
                }
                
                if (foundOpening && braceCount === 0) {
                    endLine = i + 1
                    break
                }
            }
        }
        
        if (startLine === -1 || endLine === -1) {
            return { success: false, error: 'Function not found' }
        }
        
        const bodyLines = lines.slice(startLine, endLine)
        const body = bodyLines.join('\n')
        
        const maxLines = options.maxLines || 500
        const trimmedBody = bodyLines.length > maxLines 
            ? bodyLines.slice(0, maxLines).join('\n') + '\n// ... (truncated)'
            : body
        
        return {
            success: true,
            body: trimmedBody,
            signature: extractSignature(bodyLines[0] || ''),
            docComment: extractDocComment(lines, startLine),
        }
    } catch (err: any) {
        return { success: false, error: err.message }
    }
}

function extractSignature(line: string): string {
    const match = line.match(/(?:async\s+)?(?:function\s+)?(?:\w+\s+)?(\w+)\s*\([^)]*\)\s*(?::\s*\w+)?/)
    return match ? match[0] : line.trim()
}

function extractDocComment(lines: string[], startLine: number): string | undefined {
    if (startLine === 0) return undefined
    
    const prevLine = lines[startLine - 1]
    if (prevLine && (prevLine.includes('/**') || prevLine.includes('///') || prevLine.startsWith('//'))) {
        const commentLines: string[] = []
        let i = startLine - 1
        
        while (i >= 0) {
            const line = lines[i]
            if (line.includes('/**') || line.includes("'''")) {
                commentLines.unshift(line)
                break
            } else if (line.trim().startsWith('*') || line.trim().startsWith('//')) {
                commentLines.unshift(line)
            } else {
                break
            }
            i--
        }
        
        return commentLines.join('\n') || undefined
    }
    
    return undefined
}

export function trimBody(body: string, maxLines: number): string {
    const lines = body.split('\n')
    if (lines.length <= maxLines) return body
    
    return lines.slice(0, maxLines).join('\n') + '\n// ...'
}

export function getBodyPreview(body: string, maxChars: number = 200): string {
    const firstLine = body.split('\n')[0]
    if (firstLine.length <= maxChars) return firstLine
    return firstLine.slice(0, maxChars) + '...'
}
