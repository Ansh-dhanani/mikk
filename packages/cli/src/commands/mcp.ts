import * as path from 'node:path'
import * as fs from 'node:fs'
import * as os from 'node:os'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import type { Command } from 'commander'

/**
 * Register the `mikk mcp` command — starts the MCP server.
 * Subcommands:
 *   mikk mcp           — start the stdio server
 *   mikk mcp install   — write MCP config entries for Claude Desktop / Cursor / VS Code
 */
export function registerMcpCommand(program: Command) {
    const mcp = program
        .command('mcp')
        .description('Start the MCP server, or install it into your AI tool config')
        .option('-p, --project <path>', 'Project root directory', process.cwd())
        .addHelpText('after',
          `\nExamples:\n` +
          `  mikk mcp start                    Start MCP server (stdio mode)\n` +
          `  mikk mcp install                  Install into Claude Desktop, Cursor, VS Code\n` +
          `  mikk mcp install --tool claude    Install only into Claude Desktop\n` +
          `  mikk mcp install --dry-run        Preview what would be written\n`)

    // ── mikk mcp (default: start server) ─────────────────────────────────
    mcp
        .command('start', { isDefault: true })
        .description('Start the MCP (Model Context Protocol) server for AI assistants')
        .action(async (_args: unknown, cmd: Command) => {
            // Collect options from current command and parent
            const opts = { ...cmd.parent?.opts(), ...cmd.opts() } as { project: string }
            const projectRoot = path.resolve(opts.project || process.cwd())
            process.env.MIKK_PROJECT_ROOT = projectRoot
            
            try {
                const cliDir = path.dirname(__filename)
                const attempted: string[] = []
                const candidates: string[] = [
                    // Local monorepo workspace layout
                    path.resolve(projectRoot, 'packages/mcp-server/dist/index.cjs'),
                    // Local install from npm/pnpm/bun
                    path.resolve(projectRoot, 'node_modules/@getmikk/mcp-server/dist/index.cjs'),
                    // Relative sibling package when installed side-by-side
                    path.resolve(cliDir, '../../mcp-server/dist/index.cjs'),
                    // Common global npm locations (Windows)
                    path.join(process.env.APPDATA || '', 'npm', 'node_modules', '@getmikk', 'mcp-server', 'dist', 'index.cjs'),
                    path.join(process.env.LOCALAPPDATA || '', 'npm', 'node_modules', '@getmikk', 'mcp-server', 'dist', 'index.cjs'),
                ]

                let serverPath: string | undefined
                for (const candidate of candidates) {
                    attempted.push(candidate)
                    if (candidate && fs.existsSync(candidate)) {
                        serverPath = candidate
                        break
                    }
                }

                if (!serverPath) {
                    try {
                        const req = createRequire(path.join(projectRoot, 'package.json'))
                        serverPath = req.resolve('@getmikk/mcp-server/dist/index.cjs')
                    } catch {
                        // Continue to final error below.
                    }
                }

                if (!serverPath) {
                    throw new Error(
                        'Unable to resolve @getmikk/mcp-server. Tried:\n' + attempted.map(p => `- ${p}`).join('\n') +
                        '\n\nFix options:\n' +
                        '1) From your repo root, run: bun install && bun run build\n' +
                        '2) Or install globally: npm i -g @getmikk/mcp-server'
                    )
                }

                const mod = await import(pathToFileURL(serverPath).href)
                
                if (!mod.startStdioServer) {
                    throw new Error(`MCP server bundle at ${serverPath} is missing startStdioServer export.`)
                }
                
                await mod.startStdioServer()
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err)
                console.error('\n  ✖ Failed to start Mikk MCP server:', message)
                if (err instanceof Error && err.stack) console.error(err.stack)
                process.exit(1)
            }
        })

    // ── mikk mcp install ──────────────────────────────────────────────────
    mcp
        .command('install')
        .description('Auto-install the Mikk MCP server into Claude Desktop, Cursor, or VS Code')
        .option('--tool <name>', 'Target tool: claude | cursor | vscode (defaults to all detected)')
        .option('--dry-run', 'Print what would be written without making changes')
        .action((_args: unknown, cmd: Command) => {
            const opts = { ...cmd.parent?.opts(), ...cmd.opts() } as { project: string; tool?: string; dryRun?: boolean }
            installMcpConfig(opts.project, opts.tool, opts.dryRun ?? false)
        })
}

// ─────────────────────────────────────────────────────────────────────────────
// Install logic
// ─────────────────────────────────────────────────────────────────────────────

interface ToolTarget {
    name: string
    configPath: string
    /** Patch function: read existing config, merge the mikk entry, return new content */
    patch: (existing: string, projectRoot: string, entry: McpEntry) => string
}

interface McpEntry {
    command: string
    args: string[]
}

function installMcpConfig(projectRoot: string, toolFilter: string | undefined, dryRun: boolean) {
    const absProject = path.resolve(projectRoot)
    const mcpEntry = buildMcpEntry(absProject)
    const targets = buildTargets(absProject)

    const selected = toolFilter
        ? targets.filter(t => t.name.toLowerCase() === toolFilter.toLowerCase())
        : targets.filter(t => fs.existsSync(path.dirname(t.configPath)))

    if (selected.length === 0) {
        const known = targets.map(t => t.name).join(', ')
        console.error(`No supported AI tools detected. Known targets: ${known}`)
        console.error(`Use --tool <name> to force a specific target, or create the config directory first.`)
        process.exit(1)
    }

    for (const target of selected) {
        console.log(`\nConfiguring ${target.name}…`)
        console.log(`  Config: ${target.configPath}`)

        const existingRaw = fs.existsSync(target.configPath)
            ? fs.readFileSync(target.configPath, 'utf-8')
            : '{}'

        let updated: string
        try {
            updated = target.patch(existingRaw, absProject, mcpEntry)
        } catch (err) {
            console.error(`  ✖ ${(err as Error).message}`)
            if (!dryRun) process.exit(1)
            console.log(`  [dry-run] Skipping ${target.name} due to parse error above.`)
            continue
        }

        if (dryRun) {
            console.log(`  [dry-run] Would write:\n${updated}`)
            continue
        }

        fs.mkdirSync(path.dirname(target.configPath), { recursive: true })
        fs.writeFileSync(target.configPath, updated, 'utf-8')
        console.log(`  ✅ Done`)
    }

    if (!dryRun) {
        console.log('\nMikk MCP server installed. Restart your AI tool to pick up the changes.')
        console.log('Configured server command:', `${mcpEntry.command} ${mcpEntry.args.join(' ')}`)
        console.log('Verify with: mikk mcp start --project ' + absProject)
    }
}

function buildTargets(projectRoot: string): ToolTarget[] {
    const home = os.homedir()
    const isWin = process.platform === 'win32'
    const isMac = process.platform === 'darwin'

    // Claude Desktop config location
    let claudeConfig: string
    if (isWin) {
        claudeConfig = path.join(process.env.APPDATA ?? path.join(home, 'AppData', 'Roaming'), 'Claude', 'claude_desktop_config.json')
    } else if (isMac) {
        claudeConfig = path.join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json')
    } else {
        claudeConfig = path.join(home, '.config', 'claude', 'claude_desktop_config.json')
    }

    // Cursor global MCP config
    let cursorConfig: string
    if (isWin) {
        cursorConfig = path.join(process.env.APPDATA ?? path.join(home, 'AppData', 'Roaming'), 'Cursor', 'User', 'globalStorage', 'cursor.mcp', 'settings.json')
    } else if (isMac) {
        cursorConfig = path.join(home, 'Library', 'Application Support', 'Cursor', 'User', 'globalStorage', 'cursor.mcp', 'settings.json')
    } else {
        cursorConfig = path.join(home, '.config', 'Cursor', 'User', 'globalStorage', 'cursor.mcp', 'settings.json')
    }

    // VS Code global MCP config (.vscode/mcp.json in the workspace)
    const vscodeMcpConfig = path.join(projectRoot, '.vscode', 'mcp.json')

    // Windsurf/Cascade global MCP config (Codeium)
    let windsurfConfig: string
    if (isWin) {
        windsurfConfig = path.join(process.env.LOCALAPPDATA || '', 'Windsurf', 'User', 'globalStorage', 'windsurf.mcp', 'settings.json')
    } else if (isMac) {
        windsurfConfig = path.join(home, 'Library', 'Application Support', 'Windsurf', 'User', 'globalStorage', 'windsurf.mcp', 'settings.json')
    } else {
        windsurfConfig = path.join(home, '.config', 'Windsurf', 'User', 'globalStorage', 'windsurf.mcp', 'settings.json')
    }

    return [
        {
            name: 'claude',
            configPath: claudeConfig,
            patch: (existing: string, projectRoot: string, entry: McpEntry) => patchClaudeConfig(existing, projectRoot, claudeConfig, entry),
        },
        {
            name: 'cursor',
            configPath: cursorConfig,
            patch: (existing: string, projectRoot: string, entry: McpEntry) => patchCursorConfig(existing, projectRoot, cursorConfig, entry),
        },
        {
            name: 'windsurf',
            configPath: windsurfConfig,
            patch: (existing: string, projectRoot: string, entry: McpEntry) => patchCursorConfig(existing, projectRoot, windsurfConfig, entry), // Same format as Cursor
        },
        {
            name: 'vscode',
            configPath: vscodeMcpConfig,
            patch: (existing: string, projectRoot: string, entry: McpEntry) => patchVSCodeConfig(existing, projectRoot, vscodeMcpConfig, entry),
        },
    ]
}

function buildMcpEntry(projectRoot: string): McpEntry {
    // Local-first for monorepos/workspaces: this avoids global npm drift and keeps MCP behavior in sync.
    const localCliDist = path.resolve(projectRoot, 'packages/cli/dist/index.js')
    if (fs.existsSync(localCliDist)) {
        return {
            command: 'node',
            args: [localCliDist, 'mcp', 'start', '--project', projectRoot],
        }
    }

    // Fallback for non-workspace installs: always use latest published CLI instead of stale global binaries.
    return {
        command: 'npx',
        args: ['-y', '@getmikk/cli@latest', 'mcp', 'start', '--project', projectRoot],
    }
}

function parseJsonSafe(raw: string, configPath: string): Record<string, unknown> {
    try {
        return JSON.parse(raw)
    } catch (err) {
        throw new Error(
            `Existing config at ${configPath} is not valid JSON.\n` +
            `Please fix or delete it manually, then re-run this command.\n` +
            `Parse error: ${(err as Error).message}`
        )
    }
}

function patchClaudeConfig(existing: string, _projectRoot: string, configPath: string, entry: McpEntry): string {
    const config = parseJsonSafe(existing, configPath) as any
    config.mcpServers ??= {}
    config.mcpServers['mikk'] = entry
    return JSON.stringify(config, null, 2)
}

function patchCursorConfig(existing: string, _projectRoot: string, configPath: string, entry: McpEntry): string {
    const config = parseJsonSafe(existing, configPath) as any
    config.mcpServers ??= {}
    config.mcpServers['mikk'] = entry
    return JSON.stringify(config, null, 2)
}

function patchVSCodeConfig(existing: string, _projectRoot: string, configPath: string, entry: McpEntry): string {
    const config = parseJsonSafe(existing, configPath) as any
    config.servers ??= {}
    config.servers['mikk'] = {
        type: 'stdio',
        ...entry,
    }
    return JSON.stringify(config, null, 2)
}
