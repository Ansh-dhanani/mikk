import * as vscode from 'vscode';
import { getWebviewContent } from './htmlBuilder';

export class DashboardPanel {
    public static currentPanel: DashboardPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];

    private constructor(panel: vscode.WebviewPanel, data: any) {
        this._panel = panel;
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        this._update(data);
    }

    public static createOrShow(extensionUri: vscode.Uri, data: any) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        if (DashboardPanel.currentPanel) {
            DashboardPanel.currentPanel._panel.reveal(column);
            DashboardPanel.currentPanel._update(data);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'mikkDashboard',
            'Mikk Dashboard',
            column || vscode.ViewColumn.One,
            { enableScripts: true }
        );

        DashboardPanel.currentPanel = new DashboardPanel(panel, data);
    }

    private _update(data: any) {
        let deadCodeCount = 0;
        let exportedCount = 0;
        let asyncCount = 0;

        if (data.lock && data.lock.functions) {
            const fns = Object.values(data.lock.functions) as any[];
            exportedCount = fns.filter(f => f.isExported).length;
            asyncCount = fns.filter(f => f.isAsync).length;
            deadCodeCount = fns.filter(f => f.calledBy.length === 0 && !f.isExported).length;
        }

        const fnCount = data.lock ? Object.keys(data.lock.functions).length : 0;
        const fileCount = data.lock ? Object.keys(data.lock.files).length : 0;
        const modCount = data.contract ? data.contract.declared.modules.length : 0;
        
        const deadCodeClass = deadCodeCount > 0 ? 'warning' : 'success';

        const bodyHtml = `
            <div class="dashboard-grid">
                <div class="card">
                    <h3>Total Modules</h3>
                    <div class="value">${modCount}</div>
                </div>
                <div class="card">
                    <h3>Files Analyzed</h3>
                    <div class="value">${fileCount}</div>
                </div>
                <div class="card">
                    <h3>Functions</h3>
                    <div class="value">${fnCount}</div>
                    <div style="font-size: 0.9em; opacity: 0.8;">${exportedCount} exported &middot; ${asyncCount} async</div>
                </div>
                <div class="card ${deadCodeClass}">
                    <h3>Potential Dead Code</h3>
                    <div class="value">${deadCodeCount}</div>
                    <div style="font-size: 0.9em; opacity: 0.8;">Unused functions</div>
                </div>
            </div>
            
            <h2 style="margin-top: 40px; border-bottom: 1px solid var(--vscode-widget-border); padding-bottom: 10px;">Architecture Graph</h2>
            <div class="mermaid">
                graph TD;
                ${this.generateSimpleMermaid(data)}
            </div>
        `;

        this._panel.webview.html = getWebviewContent('Mikk Architecture Dashboard', bodyHtml);
    }

    private generateSimpleMermaid(data: any): string {
        if (!data.contract || !data.contract.declared || !data.contract.declared.modules) {
            return 'A[No Data] --> B[Run Analyze]';
        }
        const modules = data.contract.declared.modules;
        return modules.map((m: any) => `${m.id}["${m.name}"]`).join('\n');
    }

    public dispose() {
        DashboardPanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) x.dispose();
        }
    }
}
