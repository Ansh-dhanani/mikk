import * as vscode from 'vscode';
import * as fs from 'node:fs';
import { getWebviewContent } from './htmlBuilder';

export class DiagramPanel {
    public static currentPanel: DiagramPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];

    private constructor(panel: vscode.WebviewPanel, diagramText: string) {
        this._panel = panel;
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        this._update(diagramText);
    }

    public static createOrShow(diagramPath: string) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        let txt = '';
        try {
            txt = fs.readFileSync(diagramPath, 'utf-8');
        } catch {
            vscode.window.showErrorMessage('Could not load diagram from ' + diagramPath);
            return;
        }

        if (DiagramPanel.currentPanel) {
            DiagramPanel.currentPanel._panel.reveal(column);
            DiagramPanel.currentPanel._update(txt);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'mikkDiagram',
            'Architecture Diagram',
            column || vscode.ViewColumn.One,
            { enableScripts: true, enableFindWidget: true, retainContextWhenHidden: true }
        );

        DiagramPanel.currentPanel = new DiagramPanel(panel, txt);
    }

    private _update(diagramText: string) {
        // Escape backticks if needed, but since we are inserting into string template we just replace
        const escapedText = diagramText.replace(/</g, "&lt;").replace(/>/g, "&gt;");
        
        const bodyHtml = `
            <div class="mermaid">
                ${escapedText}
            </div>
        `;

        this._panel.webview.html = getWebviewContent('Mikk Architecture Viewer', bodyHtml, `
            .mermaid { width: 100%; height: 100vh; overflow: auto; }
        `);
    }

    public dispose() {
        DiagramPanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) x.dispose();
        }
    }
}
