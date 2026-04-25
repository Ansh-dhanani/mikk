/**
 * Heuristic detector for dynamic dispatch and potential call graph incompleteness.
 * T39 fix: detect optional-chaining bracket calls obj[key]?.(args) and other patterns.
 */
export function checkForIncompleteness(body: string): string[] {
    const warnings: string[] = []
    if (body.includes('eval(')) warnings.push('Symbol uses "eval()" — call graph is incomplete.')
    // T39 fix: match bracket call dispatch including optional chaining: obj[key](), obj[key]?.()
    if (body.includes('[') && (/\[[^\]]+\]\s*\(/.test(body) || /\[[^\]]+\]\s*\?\.\s*\(/.test(body))) {
        warnings.push('Symbol uses bracket call dispatch (obj[key]()) — call graph is incomplete.')
    }
    if (body.includes('require(') && !/require\s*\(\s*['"]/.test(body) && /require\s*\([^)]+\)/.test(body)) warnings.push('Symbol uses dynamic require() — dependencies are incomplete.')
    if (body.includes('Reflect.') || body.includes('.apply(') || body.includes('.call(')) warnings.push('Symbol uses dynamic reflection (Reflect/apply/call) — call graph may be incomplete.')
    if (body.includes('new Function(')) warnings.push('Symbol uses "new Function()" — call graph is incomplete.')
    return warnings
}
