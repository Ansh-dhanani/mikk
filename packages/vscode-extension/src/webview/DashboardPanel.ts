import * as vscode from 'vscode';

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
        const column = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;

        if (DashboardPanel.currentPanel) {
            DashboardPanel.currentPanel._panel.reveal(column);
            DashboardPanel.currentPanel._update(data);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'mikkDashboard',
            'Mikk Dashboard',
            column,
            { enableScripts: true, retainContextWhenHidden: true }
        );

        DashboardPanel.currentPanel = new DashboardPanel(panel, data);
    }

    public update(data: any) {
        this._update(data);
    }

    private _update(data: any) {
        const { contract, lock } = data ?? {};

        if (!contract || !lock) {
            this._panel.webview.html = this._notInitializedHtml();
            return;
        }

        const fns = Object.values(lock.functions) as any[];
        const files = Object.values(lock.files) as any[];
        const fnCount = fns.length;
        const fileCount = files.length;
        const modCount = contract.declared.modules.length;
        const exportedCount = fns.filter(f => f.isExported).length;
        const deadCount = fns.filter(f => f.calledBy.length === 0 && !f.isExported).length;
        const syncStatus = lock.syncState?.status ?? 'unknown';
        const lastSync = lock.syncState?.lastSync ? new Date(lock.syncState.lastSync).toLocaleString() : 'never';

        // Top 5 hotspots
        const hotspots = fns
            .sort((a, b) => b.calledBy.length - a.calledBy.length)
            .slice(0, 5)
            .map(f => `<div class="hot-item"><span class="hot-name">${f.name}</span><span class="hot-count">← ${f.calledBy.length}</span></div>`)
            .join('');

        // Mermaid module graph
        const mermaid = contract.declared.modules
            .slice(0, 12) // cap to avoid huge diagrams
            .map((m: any) => `  ${m.id.replace(/[^a-z0-9]/gi, '_')}["${m.name}"]`)
            .join('\n');

        this._panel.webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<script type="module">
  import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs';
  mermaid.initialize({ startOnLoad: true, theme: 'dark', securityLevel: 'loose' });
</script>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Inter', system-ui, sans-serif;
    background: #0d0d10;
    color: #e4e4e7;
    min-height: 100vh;
    padding: 2rem 2.5rem;
  }
  header { margin-bottom: 2.5rem; }
  header h1 {
    font-size: 1.6rem;
    font-weight: 700;
    background: linear-gradient(90deg, #a78bfa, #60a5fa);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    margin-bottom: 0.25rem;
  }
  header p { color: #71717a; font-size: 0.875rem; }

  .sync-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.25rem 0.75rem;
    border-radius: 999px;
    font-size: 0.75rem;
    font-weight: 600;
    margin-top: 0.75rem;
  }
  .sync-badge.clean { background: rgba(34,197,94,0.15); color: #22c55e; border: 1px solid rgba(34,197,94,0.3); }
  .sync-badge.drifted { background: rgba(234,179,8,0.15); color: #eab308; border: 1px solid rgba(234,179,8,0.3); }
  .sync-badge.unknown { background: rgba(113,113,122,0.15); color: #71717a; border: 1px solid rgba(113,113,122,0.3); }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
    gap: 1rem;
    margin-bottom: 2.5rem;
  }
  .card {
    background: #18181b;
    border: 1px solid #27272a;
    border-radius: 12px;
    padding: 1.25rem 1.5rem;
    transition: border-color 0.2s, transform 0.2s;
  }
  .card:hover { border-color: #7c3aed; transform: translateY(-2px); }
  .card .label { font-size: 0.75rem; color: #71717a; text-transform: uppercase; letter-spacing: 0.06em; font-weight: 500; margin-bottom: 0.5rem; }
  .card .value { font-size: 2rem; font-weight: 700; color: #f4f4f5; }
  .card.warn .value { color: #f87171; }
  .card.good .value { color: #4ade80; }

  .panels { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; }
  @media(max-width: 700px) { .panels { grid-template-columns: 1fr; } }

  .panel {
    background: #18181b;
    border: 1px solid #27272a;
    border-radius: 12px;
    overflow: hidden;
  }
  .panel-head {
    padding: 0.875rem 1.25rem;
    border-bottom: 1px solid #27272a;
    font-size: 0.875rem;
    font-weight: 600;
    color: #a1a1aa;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .panel-body { padding: 1.25rem; }

  .hot-item { display: flex; justify-content: space-between; align-items: center; padding: 0.45rem 0; border-bottom: 1px solid #27272a; }
  .hot-item:last-child { border-bottom: none; }
  .hot-name { font-size: 0.875rem; color: #e4e4e7; }
  .hot-count { font-size: 0.75rem; color: #a78bfa; font-weight: 600; }

  .mermaid-wrap {
    min-height: 260px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
    background: radial-gradient(ellipse at center, #1a1a2e 0%, #0d0d10 100%);
  }
  .mermaid { max-width: 100%; }

  .footer { margin-top: 2rem; font-size: 0.75rem; color: #3f3f46; text-align: center; }
</style>
</head>
<body>
  <header>
    <h1>${contract.project?.name ?? 'Mikk'} &mdash; Architecture Dashboard</h1>
    <p>${contract.project?.description ?? 'Deterministic AI Context Engine'}</p>
    <div class="sync-badge ${syncStatus}">${syncStatus === 'clean' ? '&#10003; In sync' : syncStatus === 'drifted' ? '&#9888; Drifted' : '? Unknown'} &middot; last analyzed ${lastSync}</div>
  </header>

  <div class="grid">
    <div class="card">
      <div class="label">Modules</div>
      <div class="value">${modCount}</div>
    </div>
    <div class="card">
      <div class="label">Files</div>
      <div class="value">${fileCount}</div>
    </div>
    <div class="card">
      <div class="label">Functions</div>
      <div class="value">${fnCount}</div>
    </div>
    <div class="card">
      <div class="label">Public API</div>
      <div class="value">${exportedCount}</div>
    </div>
    <div class="card ${deadCount > 0 ? 'warn' : 'good'}">
      <div class="label">Dead Code</div>
      <div class="value">${deadCount}</div>
    </div>
  </div>

  <div class="panels">
    <div class="panel">
      <div class="panel-head">Top Hotspots</div>
      <div class="panel-body">${hotspots || '<p style="color:#52525b;font-size:0.875rem;">No data yet</p>'}</div>
    </div>
    <div class="panel">
      <div class="panel-head">Module Graph</div>
      <div class="mermaid-wrap">
        <div class="mermaid">
graph LR;
${mermaid}
        </div>
      </div>
    </div>
  </div>

  <div class="footer">Mikk v1.2.0 &mdash; auto-updates on file save</div>
</body>
</html>`;
    }

    private _notInitializedHtml() {
        return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
  body { font-family: system-ui; background: #0d0d10; color: #71717a; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; text-align: center; }
  h2 { color: #e4e4e7; margin-bottom: 0.75rem; }
  code { background: #27272a; padding: 0.25em 0.5em; border-radius: 4px; color: #a78bfa; }
</style>
</head>
<body>
  <div>
    <h2>Project not initialized</h2>
    <p>Run <code>mikk init</code> in your terminal, then open a file in your project.</p>
  </div>
</body>
</html>`;
    }

    public dispose() {
        DashboardPanel.currentPanel = undefined;
        this._panel.dispose();
        this._disposables.forEach(d => d.dispose());
        this._disposables = [];
    }
}
