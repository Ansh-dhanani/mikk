export function getWebviewContent(
    title: string,
    bodyHtml: string,
    styles: string = '',
    scripts: string = ''
): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <script type="module">
      import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs';
      mermaid.initialize({ startOnLoad: true, theme: 'dark' });
      
      // Inform vscode when mermaid is rendered
      window.addEventListener('load', () => {
         const vscode = acquireVsCodeApi();
         setTimeout(() => {
           const svg = document.querySelector('svg');
           if (svg) {
             svg.style.maxWidth = '100%';
             svg.style.height = 'auto';
           }
         }, 500);
      });
    </script>
    <style>
        body {
            font-family: var(--vscode-font-family);
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            padding: 20px;
            display: flex;
            flex-direction: column;
            align-items: center;
        }
        h1 {
            color: var(--vscode-editor-foreground);
            font-size: 1.5em;
            margin-bottom: 20px;
        }
        .container {
            width: 100%;
            max-width: 1200px;
            background: var(--vscode-editorWidget-background);
            border: 1px solid var(--vscode-widget-border);
            border-radius: 6px;
            padding: 20px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        }
        .mermaid {
            background: transparent;
            display: flex;
            justify-content: center;
            width: 100%;
            overflow: auto;
        }
        /* Custom Dashboard Styles */
        .dashboard-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 20px;
            margin-top: 20px;
        }
        .card {
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-widget-border);
            border-radius: 6px;
            padding: 15px;
            text-align: center;
        }
        .card h3 { margin-top: 0; font-size: 1.2em; color: var(--vscode-descriptionForeground); }
        .card .value { font-size: 2.5em; font-weight: bold; margin: 10px 0; color: var(--vscode-textLink-foreground); }
        .card.warning .value { color: var(--vscode-errorForeground); }
        .card.success .value { color: var(--vscode-testing-iconPassed); }
        ${styles}
    </style>
</head>
<body>
    <h1>${title}</h1>
    <div class="container">
        ${bodyHtml}
    </div>
    ${scripts}
</body>
</html>`;
}
