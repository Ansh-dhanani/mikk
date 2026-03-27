<repository_context>
  <name>mikk</name>
  <description>Deterministic AI context engine for your codebase. See your architecture, detect dead code, and get precise AI context.</description>
  <stats>
    <files>6</files>
    <functions>35</functions>
    <modules>3</modules>
    <language>typescript</language>
  </stats>
</repository_context>

<modules>
<tech_stack>
  <technology>esbuild</technology>
</tech_stack>
<commands>
  <command>
    <run>npm run build</run>
    <executes>node esbuild.mjs</executes>
  </command>
</commands>
  <module id="packages-vscode-extension-webview">
    <name>Dashboard</name>
    <location>c:/users/ansh/desktop/web/mesh/packages/vscode-extension/src/webview/**</location>
    <purpose>3 files, 0 functions</purpose>
    <entry_points>
      <function signature="DashboardPanel.constructor(panel, data) [c:/users/ansh/desktop/web/mesh/packages/vscode-extension/src/webview/dashboardpanel.ts:8]" purpose="Dashboard panel.constructor (panel, data)" />
      <function signature="DashboardPanel.createOrShow(extensionUri, data) [c:/users/ansh/desktop/web/mesh/packages/vscode-extension/src/webview/dashboardpanel.ts:14]" purpose="Dashboard panel.create or show (extensionUri, data)" />
      <function signature="DashboardPanel.update(data) [c:/users/ansh/desktop/web/mesh/packages/vscode-extension/src/webview/dashboardpanel.ts:33]" purpose="Dashboard panel.update (data)" />
      <function signature="DashboardPanel._update(data) [c:/users/ansh/desktop/web/mesh/packages/vscode-extension/src/webview/dashboardpanel.ts:37]" purpose="Dashboard panel. update (data)" />
      <function signature="DashboardPanel._notInitializedHtml() [c:/users/ansh/desktop/web/mesh/packages/vscode-extension/src/webview/dashboardpanel.ts:221]" purpose="Dashboard panel. not initialized html" />
    </entry_points>
  </module>
  <module id="packages-vscode-extension-providers">
    <name>Providers</name>
    <location>c:/users/ansh/desktop/web/mesh/packages/vscode-extension/src/providers/**</location>
    <purpose>2 files, 0 functions</purpose>
    <entry_points>
      <function signature="MikkCodeLensProvider.constructor(dataProvider) [c:/users/ansh/desktop/web/mesh/packages/vscode-extension/src/providers/mikkcodelensprovider.ts:7]" purpose="Mikk code lens provider.constructor (dataProvider)" />
      <function signature="MikkCodeLensProvider.refresh() [c:/users/ansh/desktop/web/mesh/packages/vscode-extension/src/providers/mikkcodelensprovider.ts:9]" purpose="Mikk code lens provider.refresh" />
      <function signature="MikkCodeLensProvider.provideCodeLenses(document, token) [c:/users/ansh/desktop/web/mesh/packages/vscode-extension/src/providers/mikkcodelensprovider.ts:13]" purpose="Mikk code lens provider.provide code lenses (document, token)" />
      <function signature="MikkDecoratorProvider.updateDecorations(editor, dataProvider) [c:/users/ansh/desktop/web/mesh/packages/vscode-extension/src/providers/mikkdecoratorprovider.ts:10]" purpose="Mikk decorator provider.update decorations (editor, dataProvider)" />
    </entry_points>
  </module>
  <module id="mesh-packages-vscode-extension">
    <name>Providers & Dashboard</name>
    <location>c:/users/ansh/desktop/web/mesh/packages/vscode-extension/src/**</location>
    <purpose>1 files, 0 functions</purpose>
    <entry_points>
      <function signature="activate(context) [c:/users/ansh/desktop/web/mesh/packages/vscode-extension/src/extension.ts:176]" purpose="Activate (context)" />
      <function signature="findRoot(startPath) [c:/users/ansh/desktop/web/mesh/packages/vscode-extension/src/extension.ts:188]" purpose="Find root (startPath)" />
      <function signature="refresh() [c:/users/ansh/desktop/web/mesh/packages/vscode-extension/src/extension.ts:202]" purpose="Refresh" />
      <function signature="updateContext(editor) [c:/users/ansh/desktop/web/mesh/packages/vscode-extension/src/extension.ts:216]" purpose="Update context (editor)" />
      <function signature="deactivate() [c:/users/ansh/desktop/web/mesh/packages/vscode-extension/src/extension.ts:292]" purpose="Deactivate" />
    </entry_points>
  </module>
</modules>

## File Import Graph

Which files import which — useful for understanding data flow.

### Providers & Dashboard
- `C:/Users/Ansh/Desktop/web/Mesh/packages/vscode-extension/src/extension.ts` → `[object Object]`, `[object Object]`, `[object Object]`, `[object Object]`, `[object Object]`, `[object Object]`

### Providers
- `C:/Users/Ansh/Desktop/web/Mesh/packages/vscode-extension/src/providers/MikkCodeLensProvider.ts` → `[object Object]`
- `C:/Users/Ansh/Desktop/web/Mesh/packages/vscode-extension/src/providers/MikkDecoratorProvider.ts` → `[object Object]`

### Dashboard
- `C:/Users/Ansh/Desktop/web/Mesh/packages/vscode-extension/src/webview/DashboardPanel.ts` → `[object Object]`
- `C:/Users/Ansh/Desktop/web/Mesh/packages/vscode-extension/src/webview/DiagramPanel.ts` → `[object Object]`, `[object Object]`, `[object Object]`


