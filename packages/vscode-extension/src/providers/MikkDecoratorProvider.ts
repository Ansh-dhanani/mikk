import * as vscode from 'vscode';

export class MikkDecoratorProvider {
    private static deadCodeDecoration = vscode.window.createTextEditorDecorationType({
        opacity: '0.45',
        textDecoration: 'none',
        color: '#6b7280'
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    public static updateDecorations(editor: vscode.TextEditor, dataProvider: any) {
        if (!editor || !dataProvider) return;

        const lock = dataProvider.getLock?.();
        if (!lock?.functions) {
            editor.setDecorations(this.deadCodeDecoration, []);
            return;
        }

        const currentFile = vscode.workspace.asRelativePath(editor.document.fileName);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const fns = Object.values(lock.functions) as any[];
        const fileFns = fns.filter(f => f?.file === currentFile);

        const ranges: vscode.Range[] = [];
        for (const fn of fileFns) {
            const callers = fn.calledBy?.length ?? 0;
            if (callers === 0 && !fn.isExported &&
                !fn.name?.includes('constructor') &&
                !fn.name?.startsWith('test') &&
                !fn.name?.startsWith('spec')) {
                const start = new vscode.Position(Math.max(0, (fn.startLine ?? 1) - 1), 0);
                const end = new vscode.Position(Math.max(0, (fn.endLine ?? fn.startLine ?? 1) - 1), 999);
                ranges.push(new vscode.Range(start, end));
            }
        }

        editor.setDecorations(this.deadCodeDecoration, ranges);
    }
}
