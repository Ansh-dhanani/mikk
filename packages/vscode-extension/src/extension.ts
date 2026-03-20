import * as vscode from 'vscode'
import * as path from 'node:path'
import * as fs from 'node:fs'

// ─── Types ────────────────────────────────────────────────────────────────────

interface MikkContract {
    project: { name: string; language: string; description: string }
    declared: {
        modules: ContractModule[]
        constraints: any[]
        decisions: any[]
    }
}

interface ContractModule {
    id: string
    name: string
    description: string
    paths: string[]
    entryFunctions?: string[]
}

interface MikkLock {
    functions: Record<string, LockFunction>
    files: Record<string, LockFile>
    syncState?: { status: string; rootHash: string; lastSync: string }
}

interface LockFunction {
    id: string; name: string; file: string; moduleId: string
    startLine: number; endLine: number
    isExported: boolean; isAsync: boolean
    params: { name: string; type: string }[]
    returnType: string; purpose: string
    calls: string[]; calledBy: string[]
    hash: string
}

interface LockFile {
    path: string; moduleId: string; hash: string
    imports: string[]; lastModified: string
}

// ─── Extension Entry ──────────────────────────────────────────────────────────

/**
 * VS Code Extension entry point for Mikk.
 *
 * Provides:
 *   - Expandable module tree with functions, files, and call counts
 *   - Functions explorer with search and inline metadata
 *   - Health dashboard showing constraint violations and sync status
 *   - Smart status bar with live sync state (green/yellow/red)
 *   - Command palette integration for all Mikk operations
 *   - Go-to-function on click
 */
export function activate(context: vscode.ExtensionContext) {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
    if (!workspaceFolder) return

    const projectRoot = workspaceFolder.uri.fsPath

    // ── Data Layer ──────────────────────────────────────────────────────────
    const dataProvider = new MikkDataProvider(projectRoot)

    // ── Tree Providers ──────────────────────────────────────────────────────
    const modulesProvider = new ModulesTreeProvider(dataProvider)
    const functionsProvider = new FunctionsTreeProvider(dataProvider)
    const healthProvider = new HealthTreeProvider(dataProvider)

    vscode.window.registerTreeDataProvider('mikkModules', modulesProvider)
    vscode.window.registerTreeDataProvider('mikkFunctions', functionsProvider)
    vscode.window.registerTreeDataProvider('mikkHealth', healthProvider)

    // ── Status Bar ──────────────────────────────────────────────────────────
    const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100)
    statusBar.command = 'mikk.analyze'
    context.subscriptions.push(statusBar)
    updateStatusBar(statusBar, dataProvider)

    // ── File Watcher for auto-refresh ───────────────────────────────────────
    const lockWatcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(workspaceFolder, 'mikk.lock.json')
    )
    const contractWatcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(workspaceFolder, 'mikk.json')
    )

    const refreshAll = () => {
        dataProvider.reload()
        modulesProvider.refresh()
        functionsProvider.refresh()
        healthProvider.refresh()
        updateStatusBar(statusBar, dataProvider)
    }

    lockWatcher.onDidChange(refreshAll)
    lockWatcher.onDidCreate(refreshAll)
    contractWatcher.onDidChange(refreshAll)
    context.subscriptions.push(lockWatcher, contractWatcher)

    // ── Commands ─────────────────────────────────────────────────────────────
    context.subscriptions.push(
        vscode.commands.registerCommand('mikk.init', () => runInTerminal('mikk init')),
        vscode.commands.registerCommand('mikk.analyze', () => runInTerminal('mikk analyze')),

        vscode.commands.registerCommand('mikk.showDiagram', async () => {
            const diagramPath = path.join(projectRoot, '.mikk', 'diagrams', 'main.mmd')
            try {
                const doc = await vscode.workspace.openTextDocument(diagramPath)
                await vscode.window.showTextDocument(doc)
                vscode.window.showInformationMessage(
                    'Install the "Mermaid Preview" extension to visualize this diagram'
                )
            } catch {
                vscode.window.showWarningMessage(
                    'No diagrams found. Run "Mikk: Analyze" first.'
                )
            }
        }),

        vscode.commands.registerCommand('mikk.showImpact', async () => {
            const activeFile = vscode.window.activeTextEditor?.document.fileName
            if (!activeFile) {
                vscode.window.showWarningMessage('Open a file first to analyze its impact')
                return
            }
            const relativePath = vscode.workspace.asRelativePath(activeFile)
            runInTerminal(`mikk context impact "${relativePath}"`)
        }),

        vscode.commands.registerCommand('mikk.getContext', async () => {
            const task = await vscode.window.showInputBox({
                prompt: 'What task do you need context for?',
                placeHolder: 'e.g., "Add password reset to auth module"'
            })
            if (task) {
                runInTerminal(`mikk context for "${task}"`)
            }
        }),

        vscode.commands.registerCommand('mikk.refreshAll', refreshAll),

        vscode.commands.registerCommand('mikk.deadCode', () => {
            runInTerminal('mikk dead-code')
        }),

        vscode.commands.registerCommand('mikk.stats', () => {
            runInTerminal('mikk stats')
        }),

        vscode.commands.registerCommand('mikk.watch', () => {
            runInTerminal('mikk watch')
        }),

        // Go to function definition on tree item click
        vscode.commands.registerCommand('mikk.goToFunction', async (file: string, line: number) => {
            try {
                const absPath = path.isAbsolute(file) ? file : path.join(projectRoot, file)
                const doc = await vscode.workspace.openTextDocument(absPath)
                const editor = await vscode.window.showTextDocument(doc)
                const position = new vscode.Position(Math.max(0, line - 1), 0)
                editor.selection = new vscode.Selection(position, position)
                editor.revealRange(
                    new vscode.Range(position, position),
                    vscode.TextEditorRevealType.InCenter
                )
            } catch (err: any) {
                vscode.window.showErrorMessage(`Cannot open: ${err.message}`)
            }
        }),

        // Go to file on tree item click
        vscode.commands.registerCommand('mikk.goToFile', async (file: string) => {
            try {
                const absPath = path.isAbsolute(file) ? file : path.join(projectRoot, file)
                const doc = await vscode.workspace.openTextDocument(absPath)
                await vscode.window.showTextDocument(doc)
            } catch (err: any) {
                vscode.window.showErrorMessage(`Cannot open: ${err.message}`)
            }
        })
    )

    // Initial load
    refreshAll()
    statusBar.show()
}

export function deactivate() {}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function runInTerminal(command: string) {
    const terminal = vscode.window.createTerminal({ name: 'Mikk' })
    terminal.show()
    terminal.sendText(command)
}

function updateStatusBar(statusBar: vscode.StatusBarItem, data: MikkDataProvider) {
    const lock = data.getLock()
    const contract = data.getContract()

    if (!lock || !contract) {
        statusBar.text = '$(warning) Mikk: No Data'
        statusBar.tooltip = 'Run "Mikk: Initialize" then "Mikk: Analyze"'
        statusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground')
        return
    }

    const fnCount = Object.keys(lock.functions).length
    const fileCount = Object.keys(lock.files).length
    const modCount = contract.declared.modules.length
    const syncStatus = lock.syncState?.status ?? 'unknown'

    if (syncStatus === 'clean') {
        statusBar.text = `$(check) Mikk: ${fnCount} fns · ${fileCount} files · ${modCount} modules`
        statusBar.tooltip = `In sync. Last analysis: ${lock.syncState?.lastSync ?? 'unknown'}`
        statusBar.backgroundColor = undefined
    } else if (syncStatus === 'drifted') {
        statusBar.text = `$(sync~spin) Mikk: Drifted — run analyze`
        statusBar.tooltip = 'Lock file is stale. Click to re-analyze.'
        statusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground')
    } else {
        statusBar.text = `$(info) Mikk: ${fnCount} fns · ${modCount} modules`
        statusBar.tooltip = `Sync status: ${syncStatus}. Click to analyze.`
        statusBar.backgroundColor = undefined
    }
}

// ─── Data Provider (cached contract + lock reads) ─────────────────────────────

class MikkDataProvider {
    private contract: MikkContract | null = null
    private lock: MikkLock | null = null

    constructor(private projectRoot: string) {
        this.reload()
    }

    reload() {
        this.contract = this.readJson<MikkContract>('mikk.json')
        this.lock = this.readJson<MikkLock>('mikk.lock.json')
    }

    getContract(): MikkContract | null { return this.contract }
    getLock(): MikkLock | null { return this.lock }

    getModules(): ContractModule[] {
        return this.contract?.declared.modules ?? []
    }

    getFunctionsForModule(moduleId: string): LockFunction[] {
        if (!this.lock) return []
        return Object.values(this.lock.functions).filter(f => f.moduleId === moduleId)
    }

    getFilesForModule(moduleId: string): LockFile[] {
        if (!this.lock) return []
        return Object.values(this.lock.files).filter(f => f.moduleId === moduleId)
    }

    getAllFunctions(): LockFunction[] {
        if (!this.lock) return []
        return Object.values(this.lock.functions)
    }

    private readJson<T>(filename: string): T | null {
        try {
            const filePath = path.join(this.projectRoot, filename)
            const content = fs.readFileSync(filePath, 'utf-8')
            return JSON.parse(content) as T
        } catch {
            return null
        }
    }
}

// ─── Modules Tree Provider ────────────────────────────────────────────────────

class ModulesTreeProvider implements vscode.TreeDataProvider<ModuleTreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<ModuleTreeItem | undefined>()
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event

    constructor(private data: MikkDataProvider) {}

    refresh() { this._onDidChangeTreeData.fire(undefined) }

    getTreeItem(element: ModuleTreeItem): vscode.TreeItem { return element }

    async getChildren(element?: ModuleTreeItem): Promise<ModuleTreeItem[]> {
        if (!this.data.getContract()) {
            const item = new ModuleTreeItem(
                'Run "Mikk: Initialize" to get started',
                vscode.TreeItemCollapsibleState.None
            )
            item.iconPath = new vscode.ThemeIcon('info')
            return [item]
        }

        // Top level: modules
        if (!element) {
            return this.data.getModules().map(mod => {
                const fns = this.data.getFunctionsForModule(mod.id)
                const files = this.data.getFilesForModule(mod.id)
                const exported = fns.filter(f => f.isExported).length

                const item = new ModuleTreeItem(
                    mod.name,
                    vscode.TreeItemCollapsibleState.Collapsed
                )
                item.description = `${fns.length} fns · ${files.length} files · ${exported} exported`
                item.tooltip = `Module: ${mod.id}\n${mod.description}\nPaths: ${mod.paths.join(', ')}`
                item.iconPath = new vscode.ThemeIcon('package')
                item.contextValue = 'module'
                item.moduleId = mod.id
                return item
            })
        }

        // Second level: functions and files under a module
        if (element.moduleId && !element.isCategory) {
            const categories: ModuleTreeItem[] = []

            // Functions category
            const fnsItem = new ModuleTreeItem(
                'Functions',
                vscode.TreeItemCollapsibleState.Collapsed
            )
            fnsItem.iconPath = new vscode.ThemeIcon('symbol-function')
            fnsItem.moduleId = element.moduleId
            fnsItem.isCategory = true
            fnsItem.categoryType = 'functions'
            const fns = this.data.getFunctionsForModule(element.moduleId)
            fnsItem.description = `${fns.length}`
            categories.push(fnsItem)

            // Files category
            const filesItem = new ModuleTreeItem(
                'Files',
                vscode.TreeItemCollapsibleState.Collapsed
            )
            filesItem.iconPath = new vscode.ThemeIcon('files')
            filesItem.moduleId = element.moduleId
            filesItem.isCategory = true
            filesItem.categoryType = 'files'
            const files = this.data.getFilesForModule(element.moduleId)
            filesItem.description = `${files.length}`
            categories.push(filesItem)

            return categories
        }

        // Third level: actual functions or files
        if (element.isCategory && element.moduleId) {
            if (element.categoryType === 'functions') {
                return this.data.getFunctionsForModule(element.moduleId)
                    .sort((a, b) => {
                        // Exported first, then by caller count
                        if (a.isExported !== b.isExported) return a.isExported ? -1 : 1
                        return b.calledBy.length - a.calledBy.length
                    })
                    .map(fn => {
                        const item = new ModuleTreeItem(
                            fn.name,
                            vscode.TreeItemCollapsibleState.None
                        )
                        const callerCount = fn.calledBy.length
                        const calleeCount = fn.calls.length
                        item.description = [
                            fn.isExported ? '⬆ exported' : '',
                            fn.isAsync ? 'async' : '',
                            callerCount > 0 ? `←${callerCount}` : '',
                            calleeCount > 0 ? `→${calleeCount}` : '',
                        ].filter(Boolean).join(' · ')

                        item.tooltip = [
                            `${fn.name}(${fn.params.map(p => `${p.name}: ${p.type}`).join(', ')})`,
                            fn.returnType ? `Returns: ${fn.returnType}` : '',
                            fn.purpose ? `Purpose: ${fn.purpose}` : '',
                            `File: ${fn.file}:${fn.startLine}`,
                            callerCount > 0 ? `Called by: ${callerCount} function(s)` : 'No callers (potential dead code)',
                        ].filter(Boolean).join('\n')

                        item.iconPath = new vscode.ThemeIcon(
                            fn.isExported ? 'symbol-method' : 'symbol-function',
                            fn.calledBy.length === 0 && !fn.isExported
                                ? new vscode.ThemeColor('errorForeground')
                                : undefined
                        )

                        item.command = {
                            command: 'mikk.goToFunction',
                            title: 'Go to Function',
                            arguments: [fn.file, fn.startLine]
                        }

                        return item
                    })
            }

            if (element.categoryType === 'files') {
                return this.data.getFilesForModule(element.moduleId).map(file => {
                    const basename = path.basename(file.path)
                    const item = new ModuleTreeItem(
                        basename,
                        vscode.TreeItemCollapsibleState.None
                    )
                    item.description = file.path
                    item.tooltip = `${file.path}\nImports: ${file.imports.length}`
                    item.iconPath = vscode.ThemeIcon.File

                    item.command = {
                        command: 'mikk.goToFile',
                        title: 'Open File',
                        arguments: [file.path]
                    }

                    return item
                })
            }
        }

        return []
    }
}

class ModuleTreeItem extends vscode.TreeItem {
    moduleId?: string
    isCategory?: boolean
    categoryType?: 'functions' | 'files'
}

// ─── Functions Tree Provider ──────────────────────────────────────────────────

class FunctionsTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<vscode.TreeItem | undefined>()
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event

    constructor(private data: MikkDataProvider) {}

    refresh() { this._onDidChangeTreeData.fire(undefined) }

    getTreeItem(element: vscode.TreeItem): vscode.TreeItem { return element }

    async getChildren(): Promise<vscode.TreeItem[]> {
        const fns = this.data.getAllFunctions()
        if (fns.length === 0) {
            return [new vscode.TreeItem('No functions analyzed yet')]
        }

        // Group by: exported with most callers first
        const sorted = fns
            .sort((a, b) => b.calledBy.length - a.calledBy.length)
            .slice(0, 100) // Cap at 100 for performance

        const items: vscode.TreeItem[] = []

        // Summary header
        const header = new vscode.TreeItem(
            `${fns.length} functions total (showing top ${Math.min(fns.length, 100)} by usage)`
        )
        header.iconPath = new vscode.ThemeIcon('graph')
        items.push(header)

        // Hot functions (most callers)
        for (const fn of sorted) {
            const item = new vscode.TreeItem(fn.name)
            item.description = `${fn.file} · ←${fn.calledBy.length} callers`
            item.tooltip = [
                `${fn.name}`,
                `Module: ${fn.moduleId}`,
                `File: ${fn.file}:${fn.startLine}-${fn.endLine}`,
                fn.purpose || '',
                `Callers: ${fn.calledBy.length} · Calls: ${fn.calls.length}`,
            ].filter(Boolean).join('\n')

            item.iconPath = new vscode.ThemeIcon(
                fn.isExported ? 'symbol-method' : 'symbol-function'
            )

            item.command = {
                command: 'mikk.goToFunction',
                title: 'Go to Function',
                arguments: [fn.file, fn.startLine]
            }

            items.push(item)
        }

        return items
    }
}

// ─── Health Tree Provider ─────────────────────────────────────────────────────

class HealthTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<vscode.TreeItem | undefined>()
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event

    constructor(private data: MikkDataProvider) {}

    refresh() { this._onDidChangeTreeData.fire(undefined) }

    getTreeItem(element: vscode.TreeItem): vscode.TreeItem { return element }

    async getChildren(): Promise<vscode.TreeItem[]> {
        const contract = this.data.getContract()
        const lock = this.data.getLock()
        if (!contract || !lock) {
            return [new vscode.TreeItem('Run "Mikk: Analyze" to see health data')]
        }

        const items: vscode.TreeItem[] = []

        // ── Sync Status ──
        const syncStatus = lock.syncState?.status ?? 'unknown'
        const syncItem = new vscode.TreeItem(`Sync: ${syncStatus}`)
        syncItem.iconPath = new vscode.ThemeIcon(
            syncStatus === 'clean' ? 'pass' : syncStatus === 'drifted' ? 'warning' : 'question',
            syncStatus === 'clean'
                ? new vscode.ThemeColor('testing.iconPassed')
                : syncStatus === 'drifted'
                    ? new vscode.ThemeColor('testing.iconFailed')
                    : undefined
        )
        syncItem.tooltip = `Last sync: ${lock.syncState?.lastSync ?? 'never'}\nRoot hash: ${lock.syncState?.rootHash ?? 'none'}`
        items.push(syncItem)

        // ── Stats ──
        const fns = Object.values(lock.functions)
        const files = Object.values(lock.files)
        const exported = fns.filter(f => f.isExported).length
        const async_ = fns.filter(f => f.isAsync).length

        const statsItem = new vscode.TreeItem(
            `${fns.length} functions · ${files.length} files · ${contract.declared.modules.length} modules`
        )
        statsItem.iconPath = new vscode.ThemeIcon('graph')
        statsItem.tooltip = `Exported: ${exported}\nAsync: ${async_}\nTotal params: ${fns.reduce((s, f) => s + f.params.length, 0)}`
        items.push(statsItem)

        // ── Dead Code ──
        const potentialDead = fns.filter(f =>
            f.calledBy.length === 0 &&
            !f.isExported &&
            !f.name.includes('constructor') &&
            !f.name.startsWith('test') &&
            !f.name.startsWith('spec')
        )
        const deadItem = new vscode.TreeItem(
            `Potential dead code: ${potentialDead.length} functions`
        )
        deadItem.iconPath = new vscode.ThemeIcon(
            potentialDead.length > 0 ? 'trash' : 'pass',
            potentialDead.length > 0
                ? new vscode.ThemeColor('testing.iconFailed')
                : new vscode.ThemeColor('testing.iconPassed')
        )
        deadItem.tooltip = potentialDead.length > 0
            ? `Functions with 0 callers and not exported:\n${potentialDead.slice(0, 10).map(f => `  ${f.name} (${f.file})`).join('\n')}`
            : 'No obvious dead code detected'
        items.push(deadItem)

        // ── Constraints ──
        const constraints = contract.declared.constraints
        const constraintItem = new vscode.TreeItem(
            `Constraints: ${constraints.length} rules`
        )
        constraintItem.iconPath = new vscode.ThemeIcon('shield')
        constraintItem.tooltip = constraints.length > 0
            ? constraints.map((c: any) => `${c.type}: ${c.description || c.rule || JSON.stringify(c)}`).join('\n')
            : 'No constraints defined. Add them in mikk.json'
        items.push(constraintItem)

        // ── Decisions ──
        const decisions = contract.declared.decisions
        const adrItem = new vscode.TreeItem(
            `ADRs: ${decisions.length} decisions`
        )
        adrItem.iconPath = new vscode.ThemeIcon('book')
        adrItem.tooltip = decisions.length > 0
            ? decisions.map((d: any) => `${d.id}: ${d.title}`).join('\n')
            : 'No architectural decisions recorded'
        items.push(adrItem)

        // ── Module Health ──
        const moduleHealthHeader = new vscode.TreeItem('Module Health')
        moduleHealthHeader.iconPath = new vscode.ThemeIcon('pulse')
        items.push(moduleHealthHeader)

        for (const mod of contract.declared.modules) {
            const modFns = fns.filter(f => f.moduleId === mod.id)
            const modFiles = files.filter(f => f.moduleId === mod.id)
            const modExported = modFns.filter(f => f.isExported).length
            const modDead = modFns.filter(f => f.calledBy.length === 0 && !f.isExported).length

            const modItem = new vscode.TreeItem(
                `  ${mod.name}: ${modFns.length} fns, ${modFiles.length} files`
            )

            // Color code by health
            if (modDead > modFns.length * 0.3) {
                modItem.iconPath = new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('testing.iconFailed'))
                modItem.tooltip = `⚠ ${modDead} potential dead functions (${Math.round(modDead / modFns.length * 100)}%)`
            } else if (modDead > 0) {
                modItem.iconPath = new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('testing.iconQueued'))
                modItem.tooltip = `${modDead} potential dead functions`
            } else {
                modItem.iconPath = new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('testing.iconPassed'))
                modItem.tooltip = `Healthy: ${modExported} exported, all functions referenced`
            }

            modItem.description = `${modExported} exported · ${modDead} unused`
            items.push(modItem)
        }

        return items
    }
}
