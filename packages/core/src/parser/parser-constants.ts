/**
 * Shared parser utilities/constants.
 * Keeps common thresholds and comment-stripping helpers in one place so
 * JavaScript and TypeScript parsers behave consistently.
 */

/** Files count threshold that signals a reasonably complete project scan. */
export const MIN_FILES_FOR_COMPLETE_SCAN = 10

/**
 * Remove JSON5-style comments while preserving string literals.
 * Handles single/double/backtick strings plus escaped characters.
 */
export function stripJsonComments(raw: string): string {
    let result = ''
    let i = 0
    let stringChar: string | null = null
    let escaped = false

    while (i < raw.length) {
        const char = raw[i]
        const next = i + 1 < raw.length ? raw[i + 1] : ''

        if (stringChar) {
            result += char
            if (escaped) {
                escaped = false
            } else if (char === '\\') {
                escaped = true
            } else if (char === stringChar) {
                stringChar = null
            }
            i += 1
            continue
        }

        if (char === '"' || char === "'" || char === '`') {
            stringChar = char
            result += char
            i += 1
            continue
        }

        if (char === '/' && next === '*') {
            i += 2
            while (i < raw.length) {
                if (raw[i] === '*' && raw[i + 1] === '/') {
                    i += 2
                    break
                }
                i += 1
            }
            continue
        }

        if (char === '/' && next === '/') {
            i += 2
            while (i < raw.length && raw[i] !== '\n' && raw[i] !== '\r') {
                i += 1
            }
            continue
        }

        result += char
        i += 1
    }

    return result
}

/**
 * Parse JSON config files while tolerating JSON5 comments.
 * Falls back to the raw content if comment stripping breaks URLs.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseJsonWithComments<T = any>(raw: string): T {
    const stripped = stripJsonComments(raw)
    try {
        return JSON.parse(stripped)
    } catch {
        return JSON.parse(raw)
    }
}
