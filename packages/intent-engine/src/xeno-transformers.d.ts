/**
 * Ambient stub for the direct dependency @xenova/transformers.
 * Provides basic types for the library and documents that SemanticSearcher.isAvailable() 
 * is used to test runtime loadability (e.g. WASM support) for graceful error handling.
 */
declare module '@xenova/transformers' {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    export function pipeline(task: string, model?: string, options?: any): Promise<any>
}
