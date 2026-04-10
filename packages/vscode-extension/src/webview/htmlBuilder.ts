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
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600&family=Inter:wght@400;500;700&display=swap" rel="stylesheet">
    <script type="module">
      import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs';
      mermaid.initialize({ 
        startOnLoad: true, 
        theme: 'dark',
        securityLevel: 'loose',
        flowchart: { curve: 'basis', htmlLabels: true }
      });
      
      window.addEventListener('load', () => {
         const vscode = acquireVsCodeApi();
         // Basic responsive handling
      });
    </script>
    <style>
        :root {
            --mikk-primary: #8b5cf6;
            --mikk-primary-glow: rgba(139, 92, 246, 0.4);
            --mikk-bg: #09090b;
            --mikk-card-bg: rgba(24, 24, 27, 0.8);
            --mikk-border: rgba(63, 63, 70, 0.5);
            --mikk-text: #f4f4f5;
            --mikk-text-dim: #a1a1aa;
        }

        body {
            font-family: 'Inter', system-ui, sans-serif;
            background-color: var(--mikk-bg);
            color: var(--mikk-text);
            margin: 0;
            padding: 2rem;
            line-height: 1.5;
            overflow-x: hidden;
        }

        h1, h2, h3 { font-family: 'Outfit', sans-serif; font-weight: 600; margin: 0; }

        .hero {
            text-align: left;
            margin-bottom: 3rem;
            animation: fadeIn 0.8s ease-out;
        }

        .hero h1 {
            font-size: 2.5rem;
            background: linear-gradient(135deg, #fff 0%, #a1a1aa 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            margin-bottom: 0.5rem;
        }

        .hero p { color: var(--mikk-text-dim); font-size: 1.1rem; }

        .stats-container {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
            gap: 1.5rem;
            margin-bottom: 3rem;
        }

        .metric-card {
            background: var(--mikk-card-bg);
            backdrop-filter: blur(12px);
            border: 1px solid var(--mikk-border);
            border-radius: 12px;
            padding: 1.5rem;
            display: flex;
            align-items: center;
            gap: 1.25rem;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .metric-card:hover {
            transform: translateY(-4px);
            border-color: var(--mikk-primary);
            box-shadow: 0 10px 30px -10px var(--mikk-primary-glow);
        }

        .metric-icon {
            font-size: 2rem;
            background: rgba(39, 39, 42, 0.5);
            width: 56px;
            height: 56px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 10px;
        }

        .metric-info { display: flex; flex-direction: column; }
        .metric-label { color: var(--mikk-text-dim); font-size: 0.875rem; font-weight: 500; text-transform: uppercase; letter-spacing: 0.05em; }
        .metric-value { font-size: 1.75rem; font-weight: 700; font-family: 'Outfit', sans-serif; }

        .metric-card.critical .metric-value { color: #ef4444; }
        .metric-card.healthy .metric-value { color: #22c55e; }

        .main-content {
            display: grid;
            gap: 2rem;
        }

        .visual-panel {
            background: var(--mikk-card-bg);
            border: 1px solid var(--mikk-border);
            border-radius: 16px;
            overflow: hidden;
            box-shadow: 0 4px 20px rgba(0,0,0,0.2);
        }

        .panel-header {
            padding: 1.25rem 1.5rem;
            border-bottom: 1px solid var(--mikk-border);
            background: rgba(39, 39, 42, 0.3);
        }

        .panel-header h2 { font-size: 1.25rem; color: #fff; }

        .mermaid-wrap {
            padding: 2rem;
            background: radial-gradient(circle at center, #18181b 0%, #09090b 100%);
            display: flex;
            justify-content: center;
            min-height: 400px;
            overflow: auto;
        }

        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }

        ${styles}
    </style>
</head>
<body>
    <div class="container">
        ${bodyHtml}
    </div>
    ${scripts}
</body>
</html>`;
}
