import * as path from 'node:path'
import * as fs from 'node:fs/promises'
import type { Command } from 'commander'
import chalk from 'chalk'

interface CheckResult {
    name: string
    pass: boolean
    message: string
    fix?: string
}

/**
 * mikk doctor — diagnostic command that checks project health.
 * Verifies all prerequisites and configuration files exist and are valid.
 */
export function registerDoctorCommand(program: Command) {
    program
        .command('doctor')
        .description('Check project health: config files, lock freshness, dependencies')
        .action(async () => {
            const projectRoot = process.cwd()
            const checks: CheckResult[] = []

            console.log()
            console.log(chalk.bold('  mikk doctor — Project Health Check'))
            console.log()

            // Check 1: mikk.json exists
            const contractPath = path.join(projectRoot, 'mikk.json')
            try {
                await fs.access(contractPath)
                const content = JSON.parse(await fs.readFile(contractPath, 'utf-8'))
                const moduleCount = content?.declared?.modules?.length ?? 0
                checks.push({ name: 'mikk.json', pass: true, message: `Found (${moduleCount} modules)` })
            } catch {
                checks.push({
                    name: 'mikk.json',
                    pass: false,
                    message: 'Not found',
                    fix: 'Run `mikk init` to create mikk.json',
                })
            }

            // Check 2: mikk.lock.json exists
            const lockPath = path.join(projectRoot, 'mikk.lock.json')
            try {
                await fs.access(lockPath)
                const lockContent = JSON.parse(await fs.readFile(lockPath, 'utf-8'))
                const fnCount = Object.keys(lockContent?.functions ?? {}).length
                const fileCount = Object.keys(lockContent?.files ?? {}).length
                checks.push({ name: 'mikk.lock.json', pass: true, message: `Found (${fnCount} functions, ${fileCount} files)` })

                // Check 3: Lock freshness (syncState)
                const status = lockContent?.syncState?.status
                if (status === 'clean') {
                    checks.push({ name: 'Lock status', pass: true, message: 'Clean' })
                } else {
                    checks.push({
                        name: 'Lock status',
                        pass: false,
                        message: `Status: ${status ?? 'unknown'}`,
                        fix: 'Run `mikk analyze` to refresh',
                    })
                }
            } catch {
                checks.push({
                    name: 'mikk.lock.json',
                    pass: false,
                    message: 'Not found',
                    fix: 'Run `mikk analyze` to generate lock file',
                })
            }

            // Check 4: tsconfig.json exists (for TypeScript projects)
            const tsconfigCandidates = ['tsconfig.json', 'tsconfig.base.json', 'jsconfig.json']
            let foundTsConfig = false
            for (const name of tsconfigCandidates) {
                try {
                    await fs.access(path.join(projectRoot, name))
                    foundTsConfig = true
                    checks.push({ name: 'TypeScript config', pass: true, message: `Found ${name}` })
                    break
                } catch { /* try next */ }
            }
            if (!foundTsConfig) {
                // Check if there are any .ts files
                try {
                    const srcPath = path.join(projectRoot, 'src')
                    const entries = await fs.readdir(srcPath, { recursive: true })
                    const hasTs = (entries as string[]).some(e => e.endsWith('.ts') || e.endsWith('.tsx'))
                    if (hasTs) {
                        checks.push({
                            name: 'TypeScript config',
                            pass: false,
                            message: 'No tsconfig.json found but .ts files exist',
                            fix: 'Create tsconfig.json for proper path alias resolution',
                        })
                    }
                } catch { /* no src dir */ }
            }

            // Check 5: node_modules exists
            try {
                await fs.access(path.join(projectRoot, 'node_modules'))
                checks.push({ name: 'node_modules', pass: true, message: 'Present' })
            } catch {
                checks.push({
                    name: 'node_modules',
                    pass: false,
                    message: 'Not found',
                    fix: 'Run `npm install` / `bun install` / `pnpm install`',
                })
            }

            // Check 6: .mikkignore exists
            try {
                await fs.access(path.join(projectRoot, '.mikkignore'))
                checks.push({ name: '.mikkignore', pass: true, message: 'Found' })
            } catch {
                checks.push({
                    name: '.mikkignore',
                    pass: false,
                    message: 'Not found (using defaults)',
                    fix: 'Run `mikk init` to generate .mikkignore',
                })
            }

            // Check 7: .mikk directory exists
            try {
                await fs.access(path.join(projectRoot, '.mikk'))
                checks.push({ name: '.mikk directory', pass: true, message: 'Present' })
            } catch {
                checks.push({
                    name: '.mikk directory',
                    pass: false,
                    message: 'Not found',
                    fix: 'Run `mikk analyze` to create it',
                })
            }

            // Print results
            const passed = checks.filter(c => c.pass).length
            const failed = checks.filter(c => !c.pass).length

            for (const check of checks) {
                if (check.pass) {
                    console.log(chalk.green(`  ✓ ${check.name}`) + chalk.dim(` — ${check.message}`))
                } else {
                    console.log(chalk.red(`  ✗ ${check.name}`) + chalk.dim(` — ${check.message}`))
                    if (check.fix) {
                        console.log(chalk.yellow(`    Fix: ${check.fix}`))
                    }
                }
            }

            console.log()
            if (failed === 0) {
                console.log(chalk.green.bold(`  All ${passed} checks passed ✓`))
            } else {
                console.log(chalk.red.bold(`  ${failed} issue(s) found`) + chalk.dim(` (${passed} passed)`))
            }
            console.log()

            process.exit(failed > 0 ? 1 : 0)
        })
}
