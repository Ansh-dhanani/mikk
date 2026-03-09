import * as path from 'node:path'
import * as fs from 'node:fs'
import * as os from 'node:os'
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

    // ── mikk mcp (default: start server) ─────────────────────────────────
    mcp
        .command('start', { isDefault: true })
        .description('Start the MCP (Model Context Protocol) server for AI assistants')
        .option('-p, --project <path>', 'Project root directory', process.cwd())
        .action(async (opts: { project: string }) => {
            process.env.MIKK_PROJECT_ROOT = opts.project
            const mod = await import('@getmikk/mcp-server' as string) as { startStdioServer: () => Promise<void> }
            await mod.startStdioServer()
        })

    // ── mikk mcp install ──────────────────────────────────────────────────
    mcp
        .command('install')
        .description('Auto-install the Mikk MCP server into Claude Desktop, Cursor, or VS Code')
        .option('-p, --project <path>', 'Project root directory (defaults to cwd)', process.cwd())
        .option('--tool <name>', 'Target tool: claude | cursor | vscode (defaults to all detected)')
        .option('--dry-run', 'Print what would be written without making changes')
        .action((opts: { project: string; tool?: string; dryRun?: boolean }) => {
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
    patch: (existing: string, projectRoot: string) => string
}

function installMcpConfig(projectRoot: string, toolFilter: string | undefined, dryRun: boolean) {
    const absProject = path.resolve(projectRoot)
    const targets = buildTargets()

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
            updated = target.patch(existingRaw, absProject)
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
        console.log('Verify with: mikk mcp start --project ' + absProject)
    }
}

function buildTargets(): ToolTarget[] {
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
    const vscodeMcpConfig = path.join(process.cwd(), '.vscode', 'mcp.json')

    return [
        {
            name: 'claude',
            configPath: claudeConfig,
            patch: (existing: string, projectRoot: string) => patchClaudeConfig(existing, projectRoot, claudeConfig),
        },
        {
            name: 'cursor',
            configPath: cursorConfig,
            patch: (existing: string, projectRoot: string) => patchCursorConfig(existing, projectRoot, cursorConfig),
        },
        {
            name: 'vscode',
            configPath: vscodeMcpConfig,
            patch: (existing: string, projectRoot: string) => patchVSCodeConfig(existing, projectRoot, vscodeMcpConfig),
        },
    ]
}

function buildMcpEntry(projectRoot: string) {
    return {
        command: 'npx',
        args: ['-y', '@getmikk/cli', 'mcp', 'start', '--project', projectRoot],
    }
}

function parseJsonSafe(raw: string, configPath: string): Record<string, any> {
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

function patchClaudeConfig(existing: string, projectRoot: string, configPath: string): string {
    const config = parseJsonSafe(existing, configPath)
    config.mcpServers ??= {}
    config.mcpServers['mikk'] = buildMcpEntry(projectRoot)
    return JSON.stringify(config, null, 2)
}

function patchCursorConfig(existing: string, projectRoot: string, configPath: string): string {
    const config = parseJsonSafe(existing, configPath)
    config.mcpServers ??= {}
    config.mcpServers['mikk'] = buildMcpEntry(projectRoot)
    return JSON.stringify(config, null, 2)
}

function patchVSCodeConfig(existing: string, projectRoot: string, configPath: string): string {
    const config = parseJsonSafe(existing, configPath)
    config.servers ??= {}
    config.servers['mikk'] = {
        type: 'stdio',
        ...buildMcpEntry(projectRoot),
    }
    return JSON.stringify(config, null, 2)
}
