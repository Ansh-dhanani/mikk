import chalk from 'chalk'

// ─── MIKK Banner ─────────────────────────────────────────────────────────────
const BANNER = [
    '███╗   ███╗██╗██╗  ██╗██╗  ██╗',
    '████╗ ████║██║██║ ██╔╝██║ ██╔╝',
    '██╔████╔██║██║█████╔╝ █████╔╝ ',
    '██║╚██╔╝██║██║██╔═██╗ ██╔═██╗ ',
    '██║ ╚═╝ ██║██║██║  ██╗██║  ██╗',
    '╚═╝     ╚═╝╚═╝╚═╝  ╚═╝╚═╝  ╚═╝',
]

export function banner(tagline?: string): void {
    process.stdout.write('\n')
    for (const line of BANNER) {
        process.stdout.write('  ' + chalk.white.bold(line) + '\n')
    }
    const sub = tagline ?? 'Live architectural context for your AI agent.'
    process.stdout.write('\n  ' + chalk.dim(sub) + '\n\n')
}

// ─── Strip ANSI for length measurement ───────────────────────────────────────
export function visLen(s: string): number {
    return s.replace(/\x1B\[[0-9;]*m/g, '').length
}

function pad(s: string, width: number): string {
    const need = width - visLen(s)
    return need > 0 ? s + ' '.repeat(need) : s
}

// ─── Terminal width (capped at 78) ───────────────────────────────────────────
export function tw(): number {
    return Math.min((process.stdout.columns || 80) - 2, 78)
}

// ─── Status blocks ───────────────────────────────────────────────────────────
export const sq = {
    pass: chalk.green('█'),
    warn: chalk.yellow('█'),
    fail: chalk.red('█'),
    info: chalk.cyan('█'),
    dim:  chalk.dim('░'),
}

// ─── Bars ─────────────────────────────────────────────────────────────────────

/**
 * Neutral info bar — ALWAYS cyan. Use for relative size comparisons.
 * Never implies good/bad — just "how much".
 */
export function infoBar(value: number, max: number, width = 14): string {
    if (max === 0) return chalk.dim('░'.repeat(width))
    const filled = Math.min(width, Math.round((value / max) * width))
    return chalk.cyan('█'.repeat(filled)) + chalk.dim('░'.repeat(width - filled))
}

/**
 * Health bar — green/yellow/red based on whether HIGH value is BAD.
 * Use for dead code %, violation counts, etc.
 */
export function healthBar(value: number, max: number, width = 14): string {
    if (max === 0 || value === 0) return chalk.green('█'.repeat(1)) + chalk.dim('░'.repeat(width - 1))
    const ratio = value / max
    const filled = Math.min(width, Math.round(ratio * width))
    const colour = ratio > 0.3 ? chalk.red : ratio > 0.15 ? chalk.yellow : chalk.green
    return colour('█'.repeat(filled)) + chalk.dim('░'.repeat(width - filled))
}

// ─── Panel ───────────────────────────────────────────────────────────────────
const B = { tl:'┌', tr:'┐', bl:'└', br:'┘', h:'─', v:'│', lm:'├', rm:'┤' }

export function panel(title: string, rows: string[], width?: number): void {
    const W = width ?? tw()
    const inner = W - 2
    const titlePart = ' ' + chalk.bold(title) + ' '
    const fill = B.h.repeat(Math.max(0, W - visLen(titlePart) - 3))
    process.stdout.write('\n')
    process.stdout.write('  ' + chalk.dim(B.tl + B.h) + titlePart + chalk.dim(fill + B.tr) + '\n')
    for (const row of rows) {
        process.stdout.write('  ' + chalk.dim(B.v) + pad(' ' + row, inner) + chalk.dim(B.v) + '\n')
    }
    process.stdout.write('  ' + chalk.dim(B.bl + B.h.repeat(W - 2) + B.br) + '\n')
}

/** Thin separator inside a panel (use as a row). */
export function rule(width?: number): string {
    const W = (width ?? tw()) - 2
    return chalk.dim(B.lm + B.h.repeat(W) + B.rm)
}

// ─── Layout helpers ───────────────────────────────────────────────────────────

/** Right-align a value within a fixed column, with a label on the left. */
export function kv(label: string, value: string, labelWidth = 14): string {
    return chalk.dim(label.padEnd(labelWidth)) + value
}

/** Two columns side by side. */
export function cols(left: string, right: string, totalWidth?: number): string {
    const W = (totalWidth ?? tw()) - 2
    const half = Math.floor(W / 2)
    return pad(' ' + left, half) + right
}

/** Blank row inside a panel. */
export function blank(): string { return '' }

export function gap(): void { process.stdout.write('\n') }

export function line(icon: string, label: string, detail?: string): void {
    const det = detail ? '  ' + chalk.dim(detail) : ''
    process.stdout.write('  ' + icon + '  ' + label + det + '\n')
}