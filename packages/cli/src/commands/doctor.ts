import * as path from 'node:path'
import * as fs from 'node:fs/promises'
import type { Command } from 'commander'
import chalk from 'chalk'
import { panel, sq, gap, kv } from '../ui.js'

interface CheckResult {
    name: string
    pass: boolean
    message: string
    fix?: string
}

export function registerDoctorCommand(program: Command) {
    program
        .command('doctor')
        .description('Check project health: config files, lock freshness, dependencies')
        .action(async () => {
            const projectRoot = process.cwd()
            const checks: CheckResult[] = []

            // 1. mikk.json
            const contractPath = path.join(projectRoot, 'mikk.json')
            try {
                await fs.access(contractPath)
                const content = JSON.parse((await fs.readFile(contractPath, 'utf-8')).replace(/^\uFEFF/, ''))
                const moduleCount = content?.declared?.modules?.length ?? 0
                checks.push({ name: 'mikk.json', pass: true, message: `Found (${moduleCount} modules)` })
            } catch {
                checks.push({ name: 'mikk.json', pass: false, message: 'Not found', fix: 'Run `mikk init`' })
            }

            // 2. mikk.lock.json
            const lockPath = path.join(projectRoot, 'mikk.lock.json')
            try {
                await fs.access(lockPath)
                const lockContent = JSON.parse((await fs.readFile(lockPath, 'utf-8')).replace(/^\uFEFF/, ''))
                const fnCount = Object.keys(lockContent?.functions ?? {}).length
                const fileCount = Object.keys(lockContent?.files ?? {}).length
                checks.push({ name: 'mikk.lock.json', pass: true, message: `Found (${fnCount} fns, ${fileCount} files)` })
                // 3. lock freshness
                const status = lockContent?.syncState?.status
                checks.push(status === 'clean'
                    ? { name: 'Lock status', pass: true, message: 'Clean' }
                    : { name: 'Lock status', pass: false, message: `Status: ${status ?? 'unknown'}`, fix: 'Run `mikk analyze`' })
            } catch {
                checks.push({ name: 'mikk.lock.json', pass: false, message: 'Not found', fix: 'Run `mikk analyze`' })
            }

            // 4. tsconfig
            for (const name of ['tsconfig.json', 'tsconfig.base.json', 'jsconfig.json']) {
                try {
                    await fs.access(path.join(projectRoot, name))
                    checks.push({ name: 'TypeScript config', pass: true, message: `Found ${name}` })
                    break
                } catch { /* try next */ }
            }

            // 5. node_modules
            try {
                await fs.access(path.join(projectRoot, 'node_modules'))
                checks.push({ name: 'node_modules', pass: true, message: 'Present' })
            } catch {
                checks.push({ name: 'node_modules', pass: false, message: 'Not found', fix: 'Run `npm install` / `bun install`' })
            }

            // 6. .mikkignore
            try {
                await fs.access(path.join(projectRoot, '.mikkignore'))
                checks.push({ name: '.mikkignore', pass: true, message: 'Found' })
            } catch {
                checks.push({ name: '.mikkignore', pass: false, message: 'Not found (using defaults)', fix: 'Run `mikk init`' })
            }

            // 7. .mikk directory
            try {
                await fs.access(path.join(projectRoot, '.mikk'))
                checks.push({ name: '.mikk directory', pass: true, message: 'Present' })
            } catch {
                checks.push({ name: '.mikk directory', pass: false, message: 'Not found', fix: 'Run `mikk analyze`' })
            }

            // ── Retro output ──────────────────────────────────────────────────
            const passed = checks.filter(c => c.pass).length
            const failed = checks.filter(c => !c.pass).length
            const W = 58

            const rows: string[] = []
            for (const check of checks) {
                const icon = check.pass ? sq.pass : sq.fail
                const label = check.pass ? chalk.white(check.name) : chalk.red(check.name)
                rows.push(kv(icon + '  ' + label, chalk.dim(check.message), 32))
                if (!check.pass && check.fix) {
                    rows.push('     ' + chalk.yellow('fix  ') + chalk.dim(check.fix))
                }
            }

            rows.push('')
            if (failed === 0) {
                rows.push(sq.pass + '  ' + chalk.green.bold(`All ${passed} checks passed`))
            } else {
                rows.push(sq.fail + '  ' + chalk.red.bold(`${failed} issue(s) found`) + chalk.dim(`  ${passed} passed`))
            }

            panel('mikk doctor — Project Health Check', rows, W)
            gap()

            process.exit(failed > 0 ? 1 : 0)
        })
}