/**
 * Ambient stub for the optional peer dependency @xenova/transformers.
 * The real types are only available when the package is installed.
 * We use dynamic import + `any` everywhere so this stub is sufficient.
 */
declare module '@xenova/transformers' {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    export function pipeline(task: string, model?: string, options?: any): Promise<any>
}
