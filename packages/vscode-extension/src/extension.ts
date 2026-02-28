import * as vscode from 'vscode'
import * as path from 'node:path'

/**
 * VS Code Extension entry point for Mikk.
 * Provides: architecture visualization, impact analysis,
 * AI context generation, and live sync status.
 */
export function activate(context: vscode.ExtensionContext) {
    console.log('Mikk extension activated')

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('mikk.init', async () => {
            const terminal = vscode.window.createTerminal('Mikk')
            terminal.show()
            terminal.sendText('mikk init')
        }),

        vscode.commands.registerCommand('mikk.analyze', async () => {
            const terminal = vscode.window.createTerminal('Mikk')
            terminal.show()
            terminal.sendText('mikk analyze')
        }),

        vscode.commands.registerCommand('mikk.showDiagram', async () => {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
            if (!workspaceFolder) {
                vscode.window.showErrorMessage('No workspace open')
                return
            }

            const diagramPath = path.join(workspaceFolder.uri.fsPath, '.mikk', 'diagrams', 'main.mmd')
            try {
                const doc = await vscode.workspace.openTextDocument(diagramPath)
                await vscode.window.showTextDocument(doc)
                vscode.window.showInformationMessage('Tip: Install the "Mermaid Preview" extension to visualize this diagram')
            } catch {
                vscode.window.showWarningMessage('No diagrams found. Run "Mikk: Analyze" first.')
            }
        }),

        vscode.commands.registerCommand('mikk.showImpact', async () => {
            const terminal = vscode.window.createTerminal('Mikk')
            terminal.show()
            const activeFile = vscode.window.activeTextEditor?.document.fileName
            if (activeFile) {
                const relativePath = vscode.workspace.asRelativePath(activeFile)
                terminal.sendText(`mikk context impact "${relativePath}"`)
            } else {
                vscode.window.showWarningMessage('Open a file first to analyze its impact')
            }
        }),

        vscode.commands.registerCommand('mikk.getContext', async () => {
            const task = await vscode.window.showInputBox({
                prompt: 'What task do you need context for?',
                placeHolder: 'e.g., "Add password reset to auth module"'
            })
            if (task) {
                const terminal = vscode.window.createTerminal('Mikk')
                terminal.show()
                terminal.sendText(`mikk context for "${task}"`)
            }
        })
    )

    // Status bar item showing sync state
    const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100)
    statusBar.text = '$(sync) Mikk'
    statusBar.tooltip = 'Mikk sync status'
    statusBar.command = 'mikk.analyze'
    statusBar.show()
    context.subscriptions.push(statusBar)

    // Register tree data providers
    const modulesProvider = new ModulesTreeProvider()
    vscode.window.registerTreeDataProvider('mikkModules', modulesProvider)
}

export function deactivate() {
    console.log('Mikk extension deactivated')
}

/** Tree provider for the Modules view */
class ModulesTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element
    }

    async getChildren(): Promise<vscode.TreeItem[]> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
        if (!workspaceFolder) return []

        try {
            const contractPath = path.join(workspaceFolder.uri.fsPath, 'mikk.json')
            const doc = await vscode.workspace.openTextDocument(contractPath)
            const contract = JSON.parse(doc.getText())

            return (contract.declared?.modules || []).map((m: any) => {
                const item = new vscode.TreeItem(m.name, vscode.TreeItemCollapsibleState.None)
                item.description = m.description
                item.tooltip = `Module: ${m.id}\nPaths: ${m.paths?.join(', ')}`
                item.iconPath = new vscode.ThemeIcon('package')
                return item
            })
        } catch {
            return [new vscode.TreeItem('Run "Mikk: Initialize" to get started')]
        }
    }
}
