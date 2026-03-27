import * as vscode from 'vscode';

export class MikkCodeLensProvider implements vscode.CodeLensProvider {
    private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;

    constructor(private dataProvider: any) {}

    public refresh() {
        this._onDidChangeCodeLenses.fire();
    }

    public provideCodeLenses(document: vscode.TextDocument, token: vscode.CancellationToken): vscode.CodeLens[] | Thenable<vscode.CodeLens[]> {
        const lock = this.dataProvider.getLock();
        if (!lock || !lock.functions) return [];

        const currentFile = vscode.workspace.asRelativePath(document.fileName);
        const fns = Object.values(lock.functions) as any[];
        const fileFns = fns.filter(f => f.file === currentFile);

        const lenses: vscode.CodeLens[] = [];

        for (const fn of fileFns) {
            const line = Math.max(0, fn.startLine - 1);
            const range = new vscode.Range(line, 0, line, 0);

            // Caller lens
            const callers = fn.calledBy.length;
            const callerTitle = callers === 1 ? '1 caller' : `${callers} callers`;
            lenses.push(new vscode.CodeLens(range, {
                title: `Mikk: ${callerTitle}`,
                command: 'mikk.showImpact',
                arguments: [] 
            }));

            // Optional: Callee lens?
            const calls = fn.calls.length;
            if (calls > 0) {
                 lenses.push(new vscode.CodeLens(range, {
                    title: `→ calls ${calls}`,
                    command: '' 
                }));
            }
        }

        return lenses;
    }
}
