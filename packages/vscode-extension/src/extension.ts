import * as vscode from 'vscode'
import * as path from 'node:path'
import * as fs from 'node:fs'

import { DashboardPanel } from './webview/DashboardPanel'
import { MikkCodeLensProvider } from './providers/MikkCodeLensProvider'
import { MikkDecoratorProvider } from './providers/MikkDecoratorProvider'

// ─── Types ────────────────────────────────────────────────────────────────────

interface MikkContract {
    project?: { name?: string; language?: string; description?: string }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    declared: { modules: ContractModule[]; constraints: any[]; decisions: any[] }
}
interface ContractModule { id: string; name: string; description?: string; paths: string[]; entryFunctions?: string[] }
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
    returnType?: string; purpose?: string
    calls: string[]; calledBy: string[]; hash: string
}
interface LockFile { path: string; moduleId?: string; hash?: string; imports?: (string | { source: string; resolvedPath?: string; names?: string[] })[]; lastModified?: string }

// ─── Data Provider ────────────────────────────────────────────────────────────

class MikkDataProvider {
    private contract: MikkContract | null = null
    private lock: MikkLock | null = null
    private projectRoot: string = ''

    setRoot(root: string) {
        if (!root || root === this.projectRoot) return
        this.projectRoot = root
        this.reload()
    }

    getRoot() { return this.projectRoot }

    reload() {
        if (!this.projectRoot) return
        this.contract = this.readJson<MikkContract>('mikk.json')
        this.lock = this.readJson<MikkLock>('mikk.lock.json')
    }

    getContract() { return this.contract }
    getLock() { return this.lock }

    getDeadFunctions(limit = 20): LockFunction[] {
        if (!this.lock?.functions) return []
        return Object.values(this.lock.functions)
            .filter(f => (f.calledBy?.length ?? 0) === 0 && !f.isExported && !f.name?.startsWith('test') && !f.name?.includes('constructor'))
            .slice(0, limit)
    }

    getHotFunctions(limit = 10): LockFunction[] {
        if (!this.lock?.functions) return []
        return Object.values(this.lock.functions)
            .sort((a, b) => (b.calledBy?.length ?? 0) - (a.calledBy?.length ?? 0))
            .slice(0, limit)
    }

    private readJson<T>(filename: string): T | null {
        if (!this.projectRoot) return null
        try {
            const filePath = path.join(this.projectRoot, filename)
            if (!fs.existsSync(filePath)) return null
            return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T
        } catch {
            return null
        }
    }
}

// ─── Sidebar Tree Provider ────────────────────────────────────────────────────

type NodeKind = 'open-dashboard' | 'dead-code' | 'hotspots' | 'fn-item' | 'prompt'

class MikkNode extends vscode.TreeItem {
    kind!: NodeKind
    fn?: LockFunction
}

class MikkExplorerProvider implements vscode.TreeDataProvider<MikkNode> {
    private _change = new vscode.EventEmitter<MikkNode | undefined>()
    readonly onDidChangeTreeData = this._change.event

    constructor(private data: MikkDataProvider) {}

    refresh() { this._change.fire(undefined) }
    getTreeItem(el: MikkNode) { return el }

    getChildren(parent?: MikkNode): MikkNode[] {
        const contract = this.data.getContract()
        const lock = this.data.getLock()

        if (!contract || !lock) {
            const n = new MikkNode('Run Mikk: Initialize to get started', vscode.TreeItemCollapsibleState.None) as MikkNode
            n.kind = 'prompt'
            n.iconPath = new vscode.ThemeIcon('info')
            n.command = { command: 'mikk.init', title: 'Initialize' }
            return [n]
        }

        if (!parent) {
            const fnCount = Object.keys(lock.functions ?? {}).length
            const modCount = contract.declared?.modules?.length ?? 0
            const deadCount = this.data.getDeadFunctions().length
            const syncStatus = lock.syncState?.status ?? 'unknown'

            const dashboard = new MikkNode('Open Dashboard', vscode.TreeItemCollapsibleState.None) as MikkNode
            dashboard.kind = 'open-dashboard'
            dashboard.iconPath = new vscode.ThemeIcon('graph')
            dashboard.description = `${fnCount} fns · ${modCount} modules · ${syncStatus}`
            dashboard.command = { command: 'mikk.showDashboard', title: 'Open Dashboard' }

            const dead = new MikkNode('Dead Code', vscode.TreeItemCollapsibleState.Collapsed) as MikkNode
            dead.kind = 'dead-code'
            dead.iconPath = new vscode.ThemeIcon(deadCount > 0 ? 'warning' : 'pass',
                deadCount > 0 ? new vscode.ThemeColor('notificationsWarningIcon.foreground') : new vscode.ThemeColor('testing.iconPassed'))
            dead.description = `${deadCount} unused`

            const hot = new MikkNode('Hotspots', vscode.TreeItemCollapsibleState.Collapsed) as MikkNode
            hot.kind = 'hotspots'
            hot.iconPath = new vscode.ThemeIcon('flame')
            hot.description = 'most-called functions'

            return [dashboard, dead, hot]
        }

        if (parent.kind === 'dead-code') {
            const dead = this.data.getDeadFunctions()
            if (dead.length === 0) {
                const n = new MikkNode('No dead code found', vscode.TreeItemCollapsibleState.None) as MikkNode
                n.kind = 'prompt'
                n.iconPath = new vscode.ThemeIcon('pass')
                return [n]
            }
            return dead.map(f => this.makeFnNode(f, 'trash'))
        }

        if (parent.kind === 'hotspots') {
            const hot = this.data.getHotFunctions()
            if (hot.length === 0) {
                const n = new MikkNode('No data', vscode.TreeItemCollapsibleState.None) as MikkNode
                n.kind = 'prompt'
                return [n]
            }
            return hot.map(f => this.makeFnNode(f, 'symbol-function'))
        }

        return []
    }

    private makeFnNode(f: LockFunction, icon: string): MikkNode {
        const n = new MikkNode(f.name ?? '(unknown)', vscode.TreeItemCollapsibleState.None) as MikkNode
        n.kind = 'fn-item'
        n.fn = f
        const callers = f.calledBy?.length ?? 0
        n.description = `${path.basename(f.file ?? '')} · ←${callers}`
        n.tooltip = `${f.name}\nFile: ${f.file}:${f.startLine}\nCallers: ${callers}`
        n.iconPath = new vscode.ThemeIcon(icon)
        n.command = { command: 'mikk.goToFunction', title: 'Go', arguments: [f.file, f.startLine] }
        return n
    }
}

// ─── Activation ───────────────────────────────────────────────────────────────

export function activate(context: vscode.ExtensionContext) {
    const data = new MikkDataProvider()
    const explorer = new MikkExplorerProvider(data)

    vscode.window.registerTreeDataProvider('mikkExplorer', explorer)

    const bar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100)
    bar.command = 'mikk.showDashboard'
    bar.tooltip = 'Open Mikk Dashboard'
    context.subscriptions.push(bar)

    // ── Root Detection ──
    const findRoot = (startPath: string): string | undefined => {
        let cur = startPath
        while (cur) {
            if (fs.existsSync(path.join(cur, 'mikk.json'))) return cur
            const next = path.dirname(cur)
            if (next === cur) break
            cur = next
        }
        return undefined
    }

    let lockWatcher: vscode.FileSystemWatcher | undefined
    let contractWatcher: vscode.FileSystemWatcher | undefined

    const refresh = () => {
        data.reload()
        explorer.refresh()
        updateStatusBar(bar, data)
        const editor = vscode.window.activeTextEditor
        if (editor) {
            try { MikkDecoratorProvider.updateDecorations(editor, data) } catch { /* non-critical */ }
        }
        // Auto-refresh open dashboard
        if (DashboardPanel.currentPanel) {
            DashboardPanel.currentPanel.update({ contract: data.getContract(), lock: data.getLock() })
        }
    }

    const updateContext = (editor: vscode.TextEditor | undefined) => {
        if (!editor || editor.document.uri.scheme !== 'file') return
        const newRoot = findRoot(path.dirname(editor.document.fileName))
        if (!newRoot || newRoot === data.getRoot()) return

        data.setRoot(newRoot)
        explorer.refresh()
        updateStatusBar(bar, data)

        lockWatcher?.dispose()
        contractWatcher?.dispose()
        lockWatcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(newRoot, 'mikk.lock.json'))
        contractWatcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(newRoot, 'mikk.json'))
        lockWatcher.onDidChange(refresh)
        lockWatcher.onDidCreate(refresh)
        contractWatcher.onDidChange(refresh)
        context.subscriptions.push(lockWatcher, contractWatcher)
    }

    vscode.window.onDidChangeActiveTextEditor(editor => {
        updateContext(editor)
        if (editor) {
            try { MikkDecoratorProvider.updateDecorations(editor, data) } catch { /* non-critical */ }
        }
    }, null, context.subscriptions)

    vscode.workspace.onDidSaveTextDocument(() => refresh(), null, context.subscriptions)

    context.subscriptions.push(
        vscode.languages.registerCodeLensProvider(
            { pattern: '**/*.{ts,js,tsx,jsx}' },
            new MikkCodeLensProvider(data)
        )
    )

    // ── Commands ──
    context.subscriptions.push(
        vscode.commands.registerCommand('mikk.init', () => runInTerminal('mikk init')),
        vscode.commands.registerCommand('mikk.analyze', () => runInTerminal('mikk analyze')),
        vscode.commands.registerCommand('mikk.refreshAll', refresh),

        vscode.commands.registerCommand('mikk.showDashboard', () => {
            DashboardPanel.createOrShow(context.extensionUri, {
                contract: data.getContract(),
                lock: data.getLock()
            })
        }),

        vscode.commands.registerCommand('mikk.getContext', async () => {
            const task = await vscode.window.showInputBox({
                prompt: 'What do you need AI context for?',
                placeHolder: 'e.g., Add auth to the API module'
            })
            if (task) runInTerminal(`mikk context for "${task}"`)
        }),

        vscode.commands.registerCommand('mikk.goToFunction', async (file: string, line: number) => {
            if (!file) return
            const root = data.getRoot()
            const absPath = path.isAbsolute(file) ? file : root ? path.join(root, file) : file
            try {
                const doc = await vscode.workspace.openTextDocument(absPath)
                const editor = await vscode.window.showTextDocument(doc)
                const pos = new vscode.Position(Math.max(0, (line ?? 1) - 1), 0)
                editor.selection = new vscode.Selection(pos, pos)
                editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter)
            } catch (e: unknown) {
                vscode.window.showErrorMessage(`Cannot open file: ${e instanceof Error ? e.message : String(e)}`)
            }
        })
    )

    updateContext(vscode.window.activeTextEditor)
    bar.show()
}

export function deactivate() {}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function runInTerminal(cmd: string) {
    const t = vscode.window.activeTerminal ?? vscode.window.createTerminal('Mikk')
    t.show()
    t.sendText(cmd)
}

function updateStatusBar(bar: vscode.StatusBarItem, data: MikkDataProvider) {
    const lock = data.getLock()
    const contract = data.getContract()
    if (!lock || !contract) {
        bar.text = '$(warning) Mikk'
        bar.tooltip = 'Run mikk init to get started'
        bar.backgroundColor = undefined
        return
    }
    const fnCount = Object.keys(lock.functions ?? {}).length
    const modCount = contract.declared?.modules?.length ?? 0
    const status = lock.syncState?.status ?? 'unknown'
    bar.text = status === 'clean'
        ? `$(check) Mikk  ${fnCount} fns · ${modCount} modules`
        : `$(sync~spin) Mikk  drifted`
    bar.backgroundColor = status === 'clean' ? undefined : new vscode.ThemeColor('statusBarItem.warningBackground')
}
