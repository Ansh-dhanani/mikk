import { describe, it, expect, mock } from 'bun:test'

type VoidFunction = () => void

mock.module('vscode', () => ({
    workspace: {
        asRelativePath: (path: string) => path,
    },
    Range: class {
        constructor(
            public startLine: number,
            public startCharacter: number,
            public endLine: number,
            public endCharacter: number
        ) {}
    },
    CodeLens: class {
        constructor(
            public range: unknown,
            public command?: { title: string; command: string; arguments?: unknown[] }
        ) {}
    },
    EventEmitter: class {
        private listeners: VoidFunction[] = []
        event = (listener: VoidFunction) => {
            this.listeners.push(listener)
            return { dispose: () => {} }
        }
        fire() {
            this.listeners.forEach((l: VoidFunction) => l())
        }
    },
    commands: {
        registerCommand: () => ({ dispose: () => {} }),
    },
    window: {
        createWebviewPanel: () => ({ webview: { html: '' }, dispose: () => {} }),
        showInformationMessage: () => {},
    },
    TreeItem: class {},
    TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
}))

import { getWebviewContent } from '../src/webview/htmlBuilder'

describe('htmlBuilder', () => {
    it('generates valid HTML structure', () => {
        const html = getWebviewContent('Test', '<h1>Hello</h1>')
        expect(html).toContain('<!DOCTYPE html>')
        expect(html).toContain('<html lang="en">')
        expect(html).toContain('</html>')
    })

    it('includes title in head', () => {
        const html = getWebviewContent('My Dashboard', '<div>Content</div>')
        expect(html).toContain('<title>')
    })

    it('includes body content', () => {
        const bodyContent = '<h1>Test Content</h1><p>Paragraph</p>'
        const html = getWebviewContent('Test', bodyContent)
        expect(html).toContain(bodyContent)
    })

    it('includes custom styles', () => {
        const styles = '.custom { color: red; }'
        const html = getWebviewContent('Test', '<div>Content</div>', styles)
        expect(html).toContain(styles)
    })

    it('includes custom scripts', () => {
        const scripts = 'console.log("test");'
        const html = getWebviewContent('Test', '<div>Content</div>', '', scripts)
        expect(html).toContain(scripts)
    })

    it('includes default CSS variables', () => {
        const html = getWebviewContent('Test', '<div>Content</div>')
        expect(html).toContain('--mikk-primary')
        expect(html).toContain('--mikk-bg')
    })

    it('includes mermaid configuration', () => {
        const html = getWebviewContent('Test', '<div>Content</div>')
        expect(html).toContain('mermaid')
        expect(html).toContain('startOnLoad: true')
    })

    it('includes Inter and Outfit fonts', () => {
        const html = getWebviewContent('Test', '<div>Content</div>')
        expect(html).toContain('Inter')
        expect(html).toContain('Outfit')
    })

    it('handles empty body gracefully', () => {
        const html = getWebviewContent('Test', '')
        expect(html).toContain('<body>')
        expect(html).toContain('</body>')
    })

    it('handles special characters in content', () => {
        const content = '<div>&lt;script&gt;alert("xss")&lt;/script&gt;</div>'
        const html = getWebviewContent('Test', content)
        expect(html).toContain(content)
    })

    it('includes viewport meta tag', () => {
        const html = getWebviewContent('Test', '<div>Content</div>')
        expect(html).toContain('viewport')
    })

    it('includes charset meta tag', () => {
        const html = getWebviewContent('Test', '<div>Content</div>')
        expect(html).toContain('charset="UTF-8"')
    })

    it('dark theme is enabled by default', () => {
        const html = getWebviewContent('Test', '<div>Content</div>')
        expect(html).toContain('theme: \'dark\'')
    })
})

describe('htmlBuilder edge cases', () => {
    it('handles very long body content', () => {
        const longContent = '<div>' + 'x'.repeat(10000) + '</div>'
        const html = getWebviewContent('Test', longContent)
        expect(html).toContain(longContent)
    })

    it('handles unicode characters', () => {
        const unicodeContent = '<div>日本語 中文 한국어 🔥</div>'
        const html = getWebviewContent('Test', unicodeContent)
        expect(html).toContain(unicodeContent)
    })

    it('handles empty styles and scripts', () => {
        const html = getWebviewContent('Test', '<div>Content</div>', '', '')
        expect(html).toContain('<style>')
        expect(html).toContain('<script')
    })

    it('includes vscode API acquisition', () => {
        const html = getWebviewContent('Test', '<div>Content</div>')
        expect(html).toContain('acquireVsCodeApi')
    })
})
