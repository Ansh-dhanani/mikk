import * as vscode from 'vscode';

export class MikkDecoratorProvider {
    // Style for dead code (faded and slightly reddish)
    private static deadCodeDecoration = vscode.window.createTextEditorDecorationType({
        opacity: '0.5',
        textDecoration: 'line-through dashed #ff555555'
    });

    public static updateDecorations(editor: vscode.TextEditor, dataProvider: any) {
        if (!editor || !dataProvider) return;

        const lock = dataProvider.getLock();
        if (!lock || !lock.functions) {
            editor.setDecorations(this.deadCodeDecoration, []);
            return;
        }

        const currentFile = vscode.workspace.asRelativePath(editor.document.fileName);
        
        // Find all functions in the current file
        const fns = Object.values(lock.functions) as any[];
        const fileFns = fns.filter(f => f.file === currentFile);

        const deadCodeRanges: vscode.Range[] = [];

        for (const fn of fileFns) {
            // "Dead code" definition: 0 callers and not exported
            if (fn.calledBy.length === 0 && !fn.isExported && 
                !fn.name.includes('constructor') && !fn.name.startsWith('test') && !fn.name.startsWith('spec')) {
                
                // Construct a range for highlighting (line-based)
                // Start line is 1-indexed from mikk lock, vscode is 0-indexed
                const startPos = new vscode.Position(Math.max(0, fn.startLine - 1), 0);
                const endPos = new vscode.Position(Math.max(0, fn.endLine - 1), 999);
                deadCodeRanges.push(new vscode.Range(startPos, endPos));
            }
        }

        editor.setDecorations(this.deadCodeDecoration, deadCodeRanges);
    }
}
