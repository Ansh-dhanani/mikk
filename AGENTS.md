<repository_context>
  <name>mikk</name>
  <stats>
    <files>211</files>
    <functions>840</functions>
    <modules>30</modules>
    <language>typescript</language>
  </stats>
</repository_context>

<modules>
<tech_stack>
  <technology>Tailwind CSS</technology>
  <technology>Vercel Analytics</technology>
  <technology>Turborepo</technology>
</tech_stack>
<commands>
  <command>
    <run>bun run dev</run>
    <executes>turbo run dev</executes>
  </command>
  <command>
    <run>bun run build</run>
    <executes>turbo run build</executes>
  </command>
  <command>
    <run>bun run test</run>
    <executes>turbo run test</executes>
  </command>
  <command>
    <run>bun run lint</run>
    <executes>turbo run lint</executes>
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
  <module id="web-mesh-benchmarks">
    <name>Testing & Search</name>
    <location>c:/users/ansh/desktop/web/mesh/benchmarks/**</location>
    <purpose>17 files, 0 functions</purpose>
    <entry_points>
      <function signature="extractFunctionsFromPrompt(prompt) [c:/users/ansh/desktop/web/mesh/benchmarks/complex-evaluation.ts:20]" purpose="Extract functions from prompt (prompt)" />
      <function signature="async loadMikk(root) [c:/users/ansh/desktop/web/mesh/benchmarks/complex-evaluation.ts:38]" purpose="Load mikk (root)" />
      <function signature="async evaluateComplexQueries() [c:/users/ansh/desktop/web/mesh/benchmarks/complex-evaluation.ts:90]" purpose="Evaluate complex queries" />
      <function signature="async loadMikk(root) [c:/users/ansh/desktop/web/mesh/benchmarks/debug-context.ts:4]" purpose="Load mikk (root)" />
      <function signature="async inspectPrompt() [c:/users/ansh/desktop/web/mesh/benchmarks/debug-context.ts:13]" purpose="Inspect prompt" />
    </entry_points>
  </module>
  <module id="mesh-apps-web">
    <name>API & Config</name>
    <location>c:/users/ansh/desktop/web/mesh/apps/web/**</location>
    <purpose>2 files, 0 functions</purpose>
    <entry_points>
      <function signature="async middleware(request) [c:/users/ansh/desktop/web/mesh/apps/web/middleware.ts:6]" purpose="Middleware (request)" />
      <function signature="async middleware(request) [c:/users/ansh/desktop/web/mesh/apps/web/middleware.ts:6]" purpose="Middleware (request)" />
    </entry_points>
  </module>
  <module id="mesh-apps-registry">
    <name>Search</name>
    <location>c:/users/ansh/desktop/web/mesh/apps/registry/src/**</location>
    <purpose>1 files, 0 functions</purpose>
    <entry_points>
      <function signature="placeholder() [c:/users/ansh/desktop/web/mesh/apps/registry/src/index.ts:34]" purpose="Placeholder" />
    </entry_points>
  </module>
  <module id="apps-web-app">
    <name>API</name>
    <location>c:/users/ansh/desktop/web/mesh/apps/web/app/**</location>
    <purpose>3 files, 0 functions</purpose>
    <entry_points>
      <function signature="robots() [c:/users/ansh/desktop/web/mesh/apps/web/app/robots.ts:4]" purpose="Robots" />
      <function signature="robots() [c:/users/ansh/desktop/web/mesh/apps/web/app/robots.ts:4]" purpose="Robots" />
      <function signature="mdxFileToRoute(filePath) [c:/users/ansh/desktop/web/mesh/apps/web/app/sitemap.ts:13]" purpose="Mdx file to route (filePath)" />
      <function signature="collectDocsRoutes(dir) [c:/users/ansh/desktop/web/mesh/apps/web/app/sitemap.ts:27]" purpose="Collect docs routes (dir)" />
      <function signature="sitemap() [c:/users/ansh/desktop/web/mesh/apps/web/app/sitemap.ts:45]" purpose="Sitemap" />
    </entry_points>
  </module>
  <module id="apps-web-components">
    <name>Components</name>
    <location>c:/users/ansh/desktop/web/mesh/apps/web/components/**</location>
    <purpose>19 files, 0 functions</purpose>
    <entry_points>
      <function signature="getMDXComponents(components?) [c:/users/ansh/desktop/web/mesh/apps/web/components/mdx.tsx:14]" purpose="Get mdx components (components)" />
    </entry_points>
  </module>
  <module id="apps-web-lib">
    <name>Utils</name>
    <location>c:/users/ansh/desktop/web/mesh/apps/web/lib/**</location>
    <purpose>7 files, 0 functions</purpose>
    <entry_points>
      <function signature="buildGraph() [c:/users/ansh/desktop/web/mesh/apps/web/lib/build-graph.ts:8]" purpose="Build graph" />
      <function signature="trackEvent(event, properties?) [c:/users/ansh/desktop/web/mesh/apps/web/lib/events.ts:11]" purpose="Track event (properties)" />
      <function signature="baseOptions() [c:/users/ansh/desktop/web/mesh/apps/web/lib/layout.shared.tsx:2]" purpose="Base options" />
      <function signature="mergeRefs(refs) [c:/users/ansh/desktop/web/mesh/apps/web/lib/merge-refs.ts:3]" purpose="Merge refs (refs)" />
      <function signature="cn(inputs) [c:/users/ansh/desktop/web/mesh/apps/web/lib/utils.ts:4]" purpose="Cn (inputs)" />
    </entry_points>
  </module>
  <module id="mesh-packages-ai-context">
    <name>Authentication & Providers</name>
    <location>c:/users/ansh/desktop/web/mesh/packages/ai-context/src/**</location>
    <purpose>7 files, 0 functions</purpose>
    <entry_points>
      <function signature="ClaudeMdGenerator.constructor(contract, lock, tokenBudget, meta?, projectRoot?) [c:/users/ansh/desktop/web/mesh/packages/ai-context/src/claude-md-generator.ts:30]" purpose="Claude md generator.constructor" />
      <function signature="ClaudeMdGenerator.generate() [c:/users/ansh/desktop/web/mesh/packages/ai-context/src/claude-md-generator.ts:41]" purpose="Claude md generator.generate" />
      <function signature="ClaudeMdGenerator.generateSummary() [c:/users/ansh/desktop/web/mesh/packages/ai-context/src/claude-md-generator.ts:136]" purpose="Claude md generator.generate summary" />
      <function signature="ClaudeMdGenerator.generateModuleSection(moduleId) [c:/users/ansh/desktop/web/mesh/packages/ai-context/src/claude-md-generator.ts:183]" purpose="Claude md generator.generate module section (moduleId)" />
      <function signature="ClaudeMdGenerator.generateConstraintsSection() [c:/users/ansh/desktop/web/mesh/packages/ai-context/src/claude-md-generator.ts:280]" purpose="Claude md generator.generate constraints section" />
    </entry_points>
  </module>
  <module id="mesh-packages-core">
    <name>Config & API</name>
    <location>c:/users/ansh/desktop/web/mesh/packages/core/src/**</location>
    <purpose>3 files, 0 functions</purpose>
    <entry_points>
      <function signature="formatBytes(bytes) [c:/users/ansh/desktop/web/mesh/packages/core/src/constants.ts:251]" purpose="Format bytes (bytes)" />
      <function signature="formatDuration(ms) [c:/users/ansh/desktop/web/mesh/packages/core/src/constants.ts:267]" purpose="Format duration (ms)" />
      <function signature="inRange(value, min, max) [c:/users/ansh/desktop/web/mesh/packages/core/src/constants.ts:276]" purpose="In range (value, min, max)" />
      <function signature="clamp(value, min, max) [c:/users/ansh/desktop/web/mesh/packages/core/src/constants.ts:283]" purpose="Clamp (value, min, max)" />
      <function signature="createFileNotFoundError(filePath) [c:/users/ansh/desktop/web/mesh/packages/core/src/error-handler.ts:265]" purpose="Create file not found error (filePath)" />
    </entry_points>
  </module>
  <module id="mesh-packages-cli">
    <name>CLI & Utils</name>
    <location>c:/users/ansh/desktop/web/mesh/packages/cli/src/**</location>
    <purpose>3 files, 0 functions</purpose>
    <entry_points>
      <function signature="banner(tagline?) [c:/users/ansh/desktop/web/mesh/packages/cli/src/ui.ts:13]" purpose="Banner (tagline)" />
      <function signature="visLen(s) [c:/users/ansh/desktop/web/mesh/packages/cli/src/ui.ts:23]" purpose="Vis len (s)" />
      <function signature="pad(s, width) [c:/users/ansh/desktop/web/mesh/packages/cli/src/ui.ts:27]" purpose="Pad (s, width)" />
      <function signature="tw() [c:/users/ansh/desktop/web/mesh/packages/cli/src/ui.ts:33]" purpose="Tw" />
      <function signature="infoBar(value, max, width) [c:/users/ansh/desktop/web/mesh/packages/cli/src/ui.ts:52]" purpose="Info bar (value, max, width)" />
    </entry_points>
  </module>
  <module id="mesh-packages-diagram-generator">
    <name>Search</name>
    <location>c:/users/ansh/desktop/web/mesh/packages/diagram-generator/src/**</location>
    <purpose>2 files, 0 functions</purpose>
    <entry_points>
      <function signature="DiagramOrchestrator.constructor(contract, lock, projectRoot) [c:/users/ansh/desktop/web/mesh/packages/diagram-generator/src/orchestrator.ts:18]" purpose="Diagram orchestrator.constructor (contract, lock, projectRoot)" />
      <function signature="async DiagramOrchestrator.generateAll() [c:/users/ansh/desktop/web/mesh/packages/diagram-generator/src/orchestrator.ts:25]" purpose="Diagram orchestrator.generate all" />
      <function signature="async DiagramOrchestrator.generateImpact(changedIds, impactedIds) [c:/users/ansh/desktop/web/mesh/packages/diagram-generator/src/orchestrator.ts:63]" purpose="Diagram orchestrator.generate impact (changedIds, impactedIds)" />
      <function signature="async DiagramOrchestrator.writeDiagram(relativePath, content) [c:/users/ansh/desktop/web/mesh/packages/diagram-generator/src/orchestrator.ts:72]" purpose="Diagram orchestrator.write diagram (relativePath, content)" />
    </entry_points>
  </module>
  <module id="mesh-packages-intent-engine">
    <name>Storage & AI & ML</name>
    <location>c:/users/ansh/desktop/web/mesh/packages/intent-engine/src/**</location>
    <purpose>13 files, 0 functions</purpose>
    <entry_points>
      <function signature="AutoCorrectionEngine.constructor(contract, lock, _graph, projectRoot) [c:/users/ansh/desktop/web/mesh/packages/intent-engine/src/auto-correction.ts:33]" purpose="Auto correction engine.constructor" />
      <function signature="async AutoCorrectionEngine.analyzeAndFix(files) [c:/users/ansh/desktop/web/mesh/packages/intent-engine/src/auto-correction.ts:41]" purpose="Auto correction engine.analyze and fix (files)" />
      <function signature="async AutoCorrectionEngine.analyzeFile(file) [c:/users/ansh/desktop/web/mesh/packages/intent-engine/src/auto-correction.ts:74]" purpose="Auto correction engine.analyze file (file)" />
      <function signature="async AutoCorrectionEngine.applyFix(issue) [c:/users/ansh/desktop/web/mesh/packages/intent-engine/src/auto-correction.ts:144]" purpose="Auto correction engine.apply fix (issue)" />
      <function signature="AutoCorrectionEngine.fixBrokenReference(content, issue) [c:/users/ansh/desktop/web/mesh/packages/intent-engine/src/auto-correction.ts:184]" purpose="Auto correction engine.fix broken reference (content, issue)" />
    </entry_points>
  </module>
  <module id="mesh-packages-mcp-server">
    <name>Storage</name>
    <location>c:/users/ansh/desktop/web/mesh/packages/mcp-server/src/**</location>
    <purpose>5 files, 0 functions</purpose>
    <entry_points>
      <function signature="registerResources(server, projectRoot) [c:/users/ansh/desktop/web/mesh/packages/mcp-server/src/resources.ts:8]" purpose="Register resources (server, projectRoot)" />
      <function signature="async safeRead(filePath) [c:/users/ansh/desktop/web/mesh/packages/mcp-server/src/resources.ts:59]" purpose="Safe read (filePath)" />
      <function signature="async startStdioServer() [c:/users/ansh/desktop/web/mesh/packages/mcp-server/src/stdio.ts:8]" purpose="Start stdio server" />
      <function signature="createMikkMcpServer(projectRoot) [c:/users/ansh/desktop/web/mesh/packages/mcp-server/src/server.ts:12]" purpose="Create mikk mcp server (projectRoot)" />
      <function signature="invalidateCache(projectRoot) [c:/users/ansh/desktop/web/mesh/packages/mcp-server/src/tools.ts:34]" purpose="Invalidate cache (projectRoot)" />
    </entry_points>
  </module>
  <module id="mesh-packages-watcher">
    <name>Storage & Messaging</name>
    <location>c:/users/ansh/desktop/web/mesh/packages/watcher/src/**</location>
    <purpose>5 files, 0 functions</purpose>
    <entry_points>
      <function signature="WatcherDaemon.constructor(config) [c:/users/ansh/desktop/web/mesh/packages/watcher/src/daemon.ts:42]" purpose="Watcher daemon.constructor (config)" />
      <function signature="async WatcherDaemon.start() [c:/users/ansh/desktop/web/mesh/packages/watcher/src/daemon.ts:46]" purpose="Watcher daemon.start" />
      <function signature="async WatcherDaemon.stop() [c:/users/ansh/desktop/web/mesh/packages/watcher/src/daemon.ts:99]" purpose="Watcher daemon.stop" />
      <function signature="WatcherDaemon.on(handler) [c:/users/ansh/desktop/web/mesh/packages/watcher/src/daemon.ts:106]" purpose="Watcher daemon.on (handler)" />
      <function signature="WatcherDaemon.enqueueChange(event) [c:/users/ansh/desktop/web/mesh/packages/watcher/src/daemon.ts:112]" purpose="Watcher daemon.enqueue change" />
    </entry_points>
  </module>
  <module id="packages-core-contract">
    <name>Storage & Validation</name>
    <location>c:/users/ansh/desktop/web/mesh/packages/core/src/contract/**</location>
    <purpose>8 files, 0 functions</purpose>
    <entry_points>
      <function signature="AdrManager.constructor(contractPath) [c:/users/ansh/desktop/web/mesh/packages/core/src/contract/adr-manager.ts:13]" purpose="Adr manager.constructor (contractPath)" />
      <function signature="async AdrManager.list() [c:/users/ansh/desktop/web/mesh/packages/core/src/contract/adr-manager.ts:17]" purpose="Adr manager.list" />
      <function signature="async AdrManager.get(id) [c:/users/ansh/desktop/web/mesh/packages/core/src/contract/adr-manager.ts:22]" purpose="Adr manager.get (id)" />
      <function signature="async AdrManager.add(decision) [c:/users/ansh/desktop/web/mesh/packages/core/src/contract/adr-manager.ts:29]" purpose="Adr manager.add (decision)" />
      <function signature="async AdrManager.update(id, fields) [c:/users/ansh/desktop/web/mesh/packages/core/src/contract/adr-manager.ts:42]" purpose="Adr manager.update (id, fields)" />
    </entry_points>
  </module>
  <module id="packages-core-graph">
    <name>Storage</name>
    <location>c:/users/ansh/desktop/web/mesh/packages/core/src/graph/**</location>
    <purpose>10 files, 0 functions</purpose>
    <entry_points>
      <function signature="ClusterDetector.constructor(graph, minClusterSize, minCouplingScore) [c:/users/ansh/desktop/web/mesh/packages/core/src/graph/cluster-detector.ts:83]" purpose="Cluster detector.constructor (graph, minClusterSize, minCouplingScore)" />
      <function signature="ClusterDetector.detect() [c:/users/ansh/desktop/web/mesh/packages/core/src/graph/cluster-detector.ts:90]" purpose="Cluster detector.detect" />
      <function signature="ClusterDetector.computeCouplingMatrix(files) [c:/users/ansh/desktop/web/mesh/packages/core/src/graph/cluster-detector.ts:227]" purpose="Cluster detector.compute coupling matrix (files)" />
      <function signature="ClusterDetector.incrementPair(matrix, a, b) [c:/users/ansh/desktop/web/mesh/packages/core/src/graph/cluster-detector.ts:269]" purpose="Cluster detector.increment pair (matrix, a, b)" />
      <function signature="ClusterDetector.computeClusterAffinity(candidate, cluster, couplingMatrix) [c:/users/ansh/desktop/web/mesh/packages/core/src/graph/cluster-detector.ts:278]" purpose="Cluster detector.compute cluster affinity (candidate, cluster, couplingMatrix)" />
    </entry_points>
  </module>
  <module id="packages-core-hash">
    <name>Database & Providers</name>
    <location>c:/users/ansh/desktop/web/mesh/packages/core/src/hash/**</location>
    <purpose>4 files, 0 functions</purpose>
    <entry_points>
      <function signature="hashContent(content) [c:/users/ansh/desktop/web/mesh/packages/core/src/hash/file-hasher.ts:7]" purpose="Hash content (content)" />
      <function signature="async hashFile(filePath) [c:/users/ansh/desktop/web/mesh/packages/core/src/hash/file-hasher.ts:14]" purpose="Hash file (filePath)" />
      <function signature="hashFunctionBody(fileContent, startLine, endLine) [c:/users/ansh/desktop/web/mesh/packages/core/src/hash/file-hasher.ts:22]" purpose="Hash function body (fileContent, startLine, endLine)" />
      <function signature="HashStore.constructor(projectRoot) [c:/users/ansh/desktop/web/mesh/packages/core/src/hash/hash-store.ts:25]" purpose="Hash store.constructor (projectRoot)" />
      <function signature="HashStore.openDatabase(dbPath) [c:/users/ansh/desktop/web/mesh/packages/core/src/hash/hash-store.ts:38]" purpose="Hash store.open database (dbPath)" />
    </entry_points>
  </module>
  <module id="packages-core-parser">
    <name>Storage & Logging</name>
    <location>c:/users/ansh/desktop/web/mesh/packages/core/src/parser/**</location>
    <purpose>8 files, 0 functions</purpose>
    <entry_points>
      <function signature="stripPrefix(s) [c:/users/ansh/desktop/web/mesh/packages/core/src/parser/boundary-checker.ts:26]" purpose="Strip prefix (s)" />
      <function signature="parseList(raw) [c:/users/ansh/desktop/web/mesh/packages/core/src/parser/boundary-checker.ts:30]" purpose="Parse list (raw)" />
      <function signature="parseConstraint(constraint) [c:/users/ansh/desktop/web/mesh/packages/core/src/parser/boundary-checker.ts:34]" purpose="Parse constraint (constraint)" />
      <function signature="BoundaryChecker.constructor(contract, lock) [c:/users/ansh/desktop/web/mesh/packages/core/src/parser/boundary-checker.ts:57]" purpose="Boundary checker.constructor (contract, lock)" />
      <function signature="BoundaryChecker.check() [c:/users/ansh/desktop/web/mesh/packages/core/src/parser/boundary-checker.ts:62]" purpose="Boundary checker.check" />
    </entry_points>
  </module>
  <module id="packages-core-search">
    <name>Search & Authentication</name>
    <location>c:/users/ansh/desktop/web/mesh/packages/core/src/search/**</location>
    <purpose>2 files, 0 functions</purpose>
    <entry_points>
      <function signature="reciprocalRankFusion(rankedLists) [c:/users/ansh/desktop/web/mesh/packages/core/src/search/bm25.ts:141]" purpose="Reciprocal rank fusion (rankedLists)" />
      <function signature="tokenize(text) [c:/users/ansh/desktop/web/mesh/packages/core/src/search/bm25.ts:169]" purpose="Tokenize (text)" />
      <function signature="buildFunctionTokens(fn) [c:/users/ansh/desktop/web/mesh/packages/core/src/search/bm25.ts:194]" purpose="Build function tokens (fn)" />
      <function signature="BM25Index.clear() [c:/users/ansh/desktop/web/mesh/packages/core/src/search/bm25.ts:49]" purpose="Bm25 index.clear" />
      <function signature="BM25Index.addDocument(id, tokens) [c:/users/ansh/desktop/web/mesh/packages/core/src/search/bm25.ts:57]" purpose="Bm25 index.add document (id, tokens)" />
    </entry_points>
  </module>
  <module id="packages-cli-commands">
    <name>CLI & Storage</name>
    <location>c:/users/ansh/desktop/web/mesh/packages/cli/src/commands/**</location>
    <purpose>14 files, 0 functions</purpose>
    <entry_points>
      <function signature="registerAdrCommand(program) [c:/users/ansh/desktop/web/mesh/packages/cli/src/commands/adr.ts:6]" purpose="Register adr command (program)" />
      <function signature="getManager() [c:/users/ansh/desktop/web/mesh/packages/cli/src/commands/adr.ts:11]" purpose="Get manager" />
      <function signature="findWorkspaceRoot(start) [c:/users/ansh/desktop/web/mesh/packages/cli/src/commands/analyze.ts:11]" purpose="Find workspace root (start)" />
      <function signature="async resolveCoreModule(projectRoot) [c:/users/ansh/desktop/web/mesh/packages/cli/src/commands/analyze.ts:24]" purpose="Resolve core module (projectRoot)" />
      <function signature="registerAnalyzeCommand(program) [c:/users/ansh/desktop/web/mesh/packages/cli/src/commands/analyze.ts:63]" purpose="Register analyze command (program)" />
    </entry_points>
  </module>
  <module id="packages-core-utils">
    <name>Utils & Storage</name>
    <location>c:/users/ansh/desktop/web/mesh/packages/core/src/utils/**</location>
    <purpose>6 files, 0 functions</purpose>
    <entry_points>
      <function signature="MikkError.constructor(message, code) [c:/users/ansh/desktop/web/mesh/packages/core/src/utils/errors.ts:2]" purpose="Mikk error.constructor (message, code)" />
      <function signature="ParseError.constructor(file, cause) [c:/users/ansh/desktop/web/mesh/packages/core/src/utils/errors.ts:9]" purpose="Parse error.constructor (file, cause)" />
      <function signature="ContractNotFoundError.constructor(path) [c:/users/ansh/desktop/web/mesh/packages/core/src/utils/errors.ts:15]" purpose="Contract not found error.constructor (path)" />
      <function signature="LockNotFoundError.constructor() [c:/users/ansh/desktop/web/mesh/packages/core/src/utils/errors.ts:21]" purpose="Lock not found error.constructor" />
      <function signature="UnsupportedLanguageError.constructor(ext) [c:/users/ansh/desktop/web/mesh/packages/core/src/utils/errors.ts:27]" purpose="Unsupported language error.constructor (ext)" />
    </entry_points>
  </module>
  <module id="packages-diagram-generator-generators">
    <name>Storage & CLI</name>
    <location>c:/users/ansh/desktop/web/mesh/packages/diagram-generator/src/generators/**</location>
    <purpose>8 files, 0 functions</purpose>
    <entry_points>
      <function signature="CapsuleDiagramGenerator.constructor(contract, lock) [c:/users/ansh/desktop/web/mesh/packages/diagram-generator/src/generators/capsule-diagram.ts:9]" purpose="Capsule diagram generator.constructor (contract, lock)" />
      <function signature="CapsuleDiagramGenerator.generate(moduleId) [c:/users/ansh/desktop/web/mesh/packages/diagram-generator/src/generators/capsule-diagram.ts:14]" purpose="Capsule diagram generator.generate (moduleId)" />
      <function signature="CapsuleDiagramGenerator.sanitizeId(id) [c:/users/ansh/desktop/web/mesh/packages/diagram-generator/src/generators/capsule-diagram.ts:91]" purpose="Capsule diagram generator.sanitize id (id)" />
      <function signature="CommandsDiagramGenerator.constructor(_contract?, _lock?) [c:/users/ansh/desktop/web/mesh/packages/diagram-generator/src/generators/commands-diagram.ts:9]" purpose="Commands diagram generator.constructor (_contract, _lock)" />
      <function signature="CommandsDiagramGenerator.generate() [c:/users/ansh/desktop/web/mesh/packages/diagram-generator/src/generators/commands-diagram.ts:14]" purpose="Commands diagram generator.generate" />
    </entry_points>
  </module>
  <module id="packages-vscode-extension-providers">
    <name>Providers</name>
    <location>c:/users/ansh/desktop/web/mesh/packages/vscode-extension/src/providers/**</location>
    <purpose>2 files, 0 functions</purpose>
    <entry_points>
      <function signature="MikkDecoratorProvider.updateDecorations(editor, dataProvider) [c:/users/ansh/desktop/web/mesh/packages/vscode-extension/src/providers/mikkdecoratorprovider.ts:10]" purpose="Mikk decorator provider.update decorations (editor, dataProvider)" />
      <function signature="MikkCodeLensProvider.constructor(dataProvider) [c:/users/ansh/desktop/web/mesh/packages/vscode-extension/src/providers/mikkcodelensprovider.ts:7]" purpose="Mikk code lens provider.constructor (dataProvider)" />
      <function signature="MikkCodeLensProvider.refresh() [c:/users/ansh/desktop/web/mesh/packages/vscode-extension/src/providers/mikkcodelensprovider.ts:9]" purpose="Mikk code lens provider.refresh" />
      <function signature="MikkCodeLensProvider.provideCodeLenses(document, token) [c:/users/ansh/desktop/web/mesh/packages/vscode-extension/src/providers/mikkcodelensprovider.ts:13]" purpose="Mikk code lens provider.provide code lenses (document, token)" />
    </entry_points>
  </module>
  <module id="app-api-feedback">
    <name>Blog & Database</name>
    <location>c:/users/ansh/desktop/web/mesh/apps/web/app/api/feedback/**</location>
    <purpose>1 files, 0 functions</purpose>
    <entry_points>
      <function signature="async getOctokit() [c:/users/ansh/desktop/web/mesh/apps/web/app/api/feedback/route.ts:36]" purpose="Get octokit" />
      <function signature="async getRepoInfo(octokit) [c:/users/ansh/desktop/web/mesh/apps/web/app/api/feedback/route.ts:70]" purpose="Get repo info (octokit)" />
      <function signature="async findDiscussion(octokit, title) [c:/users/ansh/desktop/web/mesh/apps/web/app/api/feedback/route.ts:106]" purpose="Find discussion (octokit, title)" />
      <function signature="async POST(req) [c:/users/ansh/desktop/web/mesh/apps/web/app/api/feedback/route.ts:133]" purpose="Post (req)" />
    </entry_points>
  </module>
  <module id="core-parser-go">
    <name>Blog & API</name>
    <location>c:/users/ansh/desktop/web/mesh/packages/core/src/parser/go/**</location>
    <purpose>3 files, 0 functions</purpose>
    <entry_points>
      <function signature="extractBalancedParens(s, fromIdx) [c:/users/ansh/desktop/web/mesh/packages/core/src/parser/go/go-extractor.ts:369]" purpose="Extract balanced parens (s, fromIdx)" />
      <function signature="parseGoFuncSignature(sig) [c:/users/ansh/desktop/web/mesh/packages/core/src/parser/go/go-extractor.ts:383]" purpose="Parse go func signature (sig)" />
      <function signature="parseGoParams(paramStr) [c:/users/ansh/desktop/web/mesh/packages/core/src/parser/go/go-extractor.ts:421]" purpose="Parse go params (paramStr)" />
      <function signature="looksLikeGoType(token) [c:/users/ansh/desktop/web/mesh/packages/core/src/parser/go/go-extractor.ts:471]" purpose="Looks like go type (token)" />
      <function signature="cleanReturnType(ret) [c:/users/ansh/desktop/web/mesh/packages/core/src/parser/go/go-extractor.ts:485]" purpose="Clean return type (ret)" />
    </entry_points>
  </module>
  <module id="core-parser-javascript">
    <name>Config & CLI</name>
    <location>c:/users/ansh/desktop/web/mesh/packages/core/src/parser/javascript/**</location>
    <purpose>3 files, 0 functions</purpose>
    <entry_points>
      <function signature="walk(node) [c:/users/ansh/desktop/web/mesh/packages/core/src/parser/javascript/js-extractor.ts:63]" purpose="Walk (node)" />
      <function signature="walk(node) [c:/users/ansh/desktop/web/mesh/packages/core/src/parser/javascript/js-extractor.ts:127]" purpose="Walk (node)" />
      <function signature="walk(node) [c:/users/ansh/desktop/web/mesh/packages/core/src/parser/javascript/js-extractor.ts:194]" purpose="Walk (node)" />
      <function signature="isModuleExports(node) [c:/users/ansh/desktop/web/mesh/packages/core/src/parser/javascript/js-extractor.ts:254]" purpose="Check if module exports (node)" />
      <function signature="isExportsDotProp(node) [c:/users/ansh/desktop/web/mesh/packages/core/src/parser/javascript/js-extractor.ts:264]" purpose="Check if exports dot prop (node)" />
    </entry_points>
  </module>
  <module id="core-parser-tree-sitter">
    <name>Database</name>
    <location>c:/users/ansh/desktop/web/mesh/packages/core/src/parser/tree-sitter/**</location>
    <purpose>2 files, 0 functions</purpose>
    <entry_points>
      <function signature="getRequire() [c:/users/ansh/desktop/web/mesh/packages/core/src/parser/tree-sitter/parser.ts:11]" purpose="Get require" />
      <function signature="isExportedByLanguage(ext, name, nodeText) [c:/users/ansh/desktop/web/mesh/packages/core/src/parser/tree-sitter/parser.ts:34]" purpose="Check if exported by language (ext, name, nodeText)" />
      <function signature="extractParamsFromNode(defNode) [c:/users/ansh/desktop/web/mesh/packages/core/src/parser/tree-sitter/parser.ts:59]" purpose="Extract params from node (defNode)" />
      <function signature="walk(node) [c:/users/ansh/desktop/web/mesh/packages/core/src/parser/tree-sitter/parser.ts:64]" purpose="Walk (node)" />
      <function signature="findFirstChild(node, predicate) [c:/users/ansh/desktop/web/mesh/packages/core/src/parser/tree-sitter/parser.ts:95]" purpose="Find first child (node, predicate)" />
    </entry_points>
  </module>
  <module id="core-parser-typescript">
    <name>Storage & GraphQL</name>
    <location>c:/users/ansh/desktop/web/mesh/packages/core/src/parser/typescript/**</location>
    <purpose>3 files, 0 functions</purpose>
    <entry_points>
      <function signature="async TypeScriptParser.parse(filePath, content) [c:/users/ansh/desktop/web/mesh/packages/core/src/parser/typescript/ts-parser.ts:8]" purpose="Type script parser.parse (filePath, content)" />
      <function signature="async TypeScriptParser.resolveImports(files, projectRoot) [c:/users/ansh/desktop/web/mesh/packages/core/src/parser/typescript/ts-parser.ts:27]" purpose="Type script parser.resolve imports (files, projectRoot)" />
      <function signature="TypeScriptParser.getSupportedExtensions() [c:/users/ansh/desktop/web/mesh/packages/core/src/parser/typescript/ts-parser.ts:32]" purpose="Type script parser.get supported extensions" />
      <function signature="walk(n) [c:/users/ansh/desktop/web/mesh/packages/core/src/parser/typescript/ts-extractor.ts:353]" purpose="Walk (n)" />
      <function signature="walk(n) [c:/users/ansh/desktop/web/mesh/packages/core/src/parser/typescript/ts-extractor.ts:413]" purpose="Walk (n)" />
    </entry_points>
  </module>
  <module id="cli-commands-contract">
    <name>CLI & Storage</name>
    <location>c:/users/ansh/desktop/web/mesh/packages/cli/src/commands/contract/**</location>
    <purpose>1 files, 0 functions</purpose>
    <entry_points>
      <function signature="registerContractCommands(program) [c:/users/ansh/desktop/web/mesh/packages/cli/src/commands/contract/index.ts:9]" purpose="Register contract commands (program)" />
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

<!-- MIKK-START -->

<repository_context>
  <name>mikk</name>
  <stats>
    <files>236</files>
    <functions>813</functions>
    <modules>30</modules>
    <language>typescript</language>
  </stats>
</repository_context>

<modules>
<tech_stack>
  <technology>Vercel Analytics</technology>
  <technology>Turborepo</technology>
</tech_stack>
<commands>
  <command>
    <run>bun run dev</run>
    <executes>turbo run dev</executes>
  </command>
  <command>
    <run>bun run build</run>
    <executes>turbo run build</executes>
  </command>
  <command>
    <run>bun run test</run>
    <executes>turbo run test</executes>
  </command>
  <command>
    <run>bun run lint</run>
    <executes>turbo run lint</executes>
  </command>
</commands>
  <module id="packages-vscode-extension-webview">
    <name>Dashboard</name>
    <location>c:/users/ansh/desktop/web/mesh/packages/vscode-extension/src/webview/**</location>
    <purpose>3 files, 0 functions</purpose>
    <entry_points>
      <function signature="DiagramPanel._update(diagramText) [c:/users/ansh/desktop/web/mesh/packages/vscode-extension/src/webview/diagrampanel.ts:45]" purpose="Diagram panel. update (diagramText)" />
      <function signature="DashboardPanel.constructor(panel, data) [c:/users/ansh/desktop/web/mesh/packages/vscode-extension/src/webview/dashboardpanel.ts:8]" purpose="Dashboard panel.constructor (panel, data)" />
      <function signature="DashboardPanel.createOrShow(extensionUri, data) [c:/users/ansh/desktop/web/mesh/packages/vscode-extension/src/webview/dashboardpanel.ts:14]" purpose="Dashboard panel.create or show (extensionUri, data)" />
      <function signature="DashboardPanel.update(data) [c:/users/ansh/desktop/web/mesh/packages/vscode-extension/src/webview/dashboardpanel.ts:33]" purpose="Dashboard panel.update (data)" />
      <function signature="DashboardPanel._update(data) [c:/users/ansh/desktop/web/mesh/packages/vscode-extension/src/webview/dashboardpanel.ts:37]" purpose="Dashboard panel. update (data)" />
    </entry_points>
    <key_internal_functions>
      <function name="getWebviewContent" callers="1" purpose="Get webview content" />
    </key_internal_functions>
  </module>
  <module id="web-mesh-benchmarks">
    <name>Testing & Search</name>
    <location>c:/users/ansh/desktop/web/mesh/benchmarks/**</location>
    <purpose>17 files, 0 functions</purpose>
    <entry_points>
      <function signature="getFixturePath(name) [c:/users/ansh/desktop/web/mesh/benchmarks/ground-truth-benchmark.ts:16]" purpose="Get fixture path (name)" />
    </entry_points>
    <key_internal_functions>
      <function name="runCommand" callers="5" purpose="Run command (cmd, cwd)" />
      <function name="loadLock" callers="5" purpose="Load lock (projectPath)" />
      <function name="benchmarkDeadCodeDetection" callers="1" purpose="Benchmark dead code detection (projectPath, projectName)" />
      <function name="benchmarkFunctionSearch" callers="1" purpose="Benchmark function search (projectPath, projectName)" />
      <function name="benchmarkImpactAnalysis" callers="1" purpose="Benchmark impact analysis (projectPath, projectName)" />
    </key_internal_functions>
  </module>
  <module id="mesh-apps-web">
    <name>API & Config</name>
    <location>c:/users/ansh/desktop/web/mesh/apps/web/**</location>
    <purpose>2 files, 0 functions</purpose>
    <entry_points>
      <function signature="async middleware(request) [c:/users/ansh/desktop/web/mesh/apps/web/middleware.ts:6]" purpose="Middleware (request)" />
      <function signature="async middleware(request) [c:/users/ansh/desktop/web/mesh/apps/web/middleware.ts:6]" purpose="Middleware (request)" />
    </entry_points>
  </module>
  <module id="mesh-apps-registry">
    <name>Search</name>
    <location>c:/users/ansh/desktop/web/mesh/apps/registry/src/**</location>
    <purpose>1 files, 0 functions</purpose>
    <entry_points>
      <function signature="placeholder() [c:/users/ansh/desktop/web/mesh/apps/registry/src/index.ts:34]" purpose="Placeholder" />
    </entry_points>
  </module>
  <module id="mesh-packages-cli">
    <name>CLI & Utils</name>
    <location>c:/users/ansh/desktop/web/mesh/packages/cli/src/**</location>
    <purpose>3 files, 0 functions</purpose>
    <entry_points>
      <function signature="panel(title, rows, width?) [c:/users/ansh/desktop/web/mesh/packages/cli/src/ui.ts:73]" purpose="Panel (title, rows, width)" />
      <function signature="cols(left, right, totalWidth?) [c:/users/ansh/desktop/web/mesh/packages/cli/src/ui.ts:100]" purpose="Cols (left, right, totalWidth)" />
      <function signature="rule(width?) [c:/users/ansh/desktop/web/mesh/packages/cli/src/ui.ts:87]" purpose="Rule (width)" />
      <function signature="banner(tagline?) [c:/users/ansh/desktop/web/mesh/packages/cli/src/ui.ts:13]" purpose="Banner (tagline)" />
      <function signature="infoBar(value, max, width) [c:/users/ansh/desktop/web/mesh/packages/cli/src/ui.ts:52]" purpose="Info bar (value, max, width)" />
    </entry_points>
    <key_internal_functions>
      <function name="pad" callers="3" purpose="Pad (s, width)" />
      <function name="tw" callers="3" purpose="Tw" />
      <function name="visLen" callers="2" purpose="Vis len (s)" />
    </key_internal_functions>
  </module>
  <module id="mesh-packages-ai-context">
    <name>Authentication & Providers</name>
    <location>c:/users/ansh/desktop/web/mesh/packages/ai-context/src/**</location>
    <purpose>7 files, 0 functions</purpose>
    <entry_points>
      <function signature="ContextBuilder.build(query) [c:/users/ansh/desktop/web/mesh/packages/ai-context/src/context-builder.ts:374]" purpose="Context builder.build (query)" />
      <function signature="ContextBuilder.readFunctionBody(fn, projectRoot) [c:/users/ansh/desktop/web/mesh/packages/ai-context/src/context-builder.ts:643]" purpose="Context builder.read function body (fn, projectRoot)" />
      <function signature="ContextBuilder.generatePrompt(query, modules) [c:/users/ansh/desktop/web/mesh/packages/ai-context/src/context-builder.ts:687]" purpose="Context builder.generate prompt (query, modules)" />
      <function signature="ClaudeProvider.formatContext(context) [c:/users/ansh/desktop/web/mesh/packages/ai-context/src/providers.ts:13]" purpose="Claude provider.format context (context)" />
      <function signature="estimateFileTokens(content, filePath) [c:/users/ansh/desktop/web/mesh/packages/ai-context/src/token-counter.ts:119]" purpose="Estimate file tokens (content, filePath)" />
    </entry_points>
    <key_internal_functions>
      <function name="readContextFile" callers="2" purpose="Read context file (filePath, projectRoot)" />
      <function name="keywordScore" callers="2" purpose="Keyword score (fn, keywords)" />
      <function name="esc" callers="2" purpose="Esc (s)" />
      <function name="countTokensFast" callers="2" purpose="Count tokens fast (text)" />
      <function name="estimateTokens" callers="1" purpose="Estimate tokens (text)" />
    </key_internal_functions>
  </module>
  <module id="mesh-packages-core">
    <name>Config & API</name>
    <location>c:/users/ansh/desktop/web/mesh/packages/core/src/**</location>
    <purpose>3 files, 0 functions</purpose>
    <entry_points>
      <function signature="MikkError.constructor(code, message?, context, cause?) [c:/users/ansh/desktop/web/mesh/packages/core/src/error-handler.ts:21]" purpose="Mikk error.constructor" />
      <function signature="toMikkError(error, defaultCode) [c:/users/ansh/desktop/web/mesh/packages/core/src/error-handler.ts:348]" purpose="To mikk error (error, defaultCode)" />
      <function signature="formatBytes(bytes) [c:/users/ansh/desktop/web/mesh/packages/core/src/constants.ts:251]" purpose="Format bytes (bytes)" />
      <function signature="formatDuration(ms) [c:/users/ansh/desktop/web/mesh/packages/core/src/constants.ts:267]" purpose="Format duration (ms)" />
      <function signature="inRange(value, min, max) [c:/users/ansh/desktop/web/mesh/packages/core/src/constants.ts:276]" purpose="In range (value, min, max)" />
    </entry_points>
    <key_internal_functions>
      <function name="isMikkError" callers="1" purpose="Check if mikk error (error)" />
      <function name="categorizeError" callers="1" purpose="Categorize error (code)" />
      <function name="getDefaultErrorMessage" callers="1" purpose="Get default error message (code, context)" />
    </key_internal_functions>
  </module>
  <module id="apps-web-app">
    <name>API</name>
    <location>c:/users/ansh/desktop/web/mesh/apps/web/app/**</location>
    <purpose>3 files, 0 functions</purpose>
    <entry_points>
      <function signature="sitemap() [c:/users/ansh/desktop/web/mesh/apps/web/app/sitemap.ts:45]" purpose="Sitemap" />
      <function signature="sitemap() [c:/users/ansh/desktop/web/mesh/apps/web/app/sitemap.ts:45]" purpose="Sitemap" />
      <function signature="robots() [c:/users/ansh/desktop/web/mesh/apps/web/app/robots.ts:4]" purpose="Robots" />
      <function signature="robots() [c:/users/ansh/desktop/web/mesh/apps/web/app/robots.ts:4]" purpose="Robots" />
    </entry_points>
    <key_internal_functions>
      <function name="collectDocsRoutes" callers="3" purpose="Collect docs routes (dir)" />
      <function name="mdxFileToRoute" callers="2" purpose="Mdx file to route (filePath)" />
    </key_internal_functions>
  </module>
  <module id="apps-web-components">
    <name>Components</name>
    <location>c:/users/ansh/desktop/web/mesh/apps/web/components/**</location>
    <purpose>19 files, 0 functions</purpose>
    <entry_points>
      <function signature="getMDXComponents(components?) [c:/users/ansh/desktop/web/mesh/apps/web/components/mdx.tsx:14]" purpose="Get mdx components (components)" />
    </entry_points>
  </module>
  <module id="apps-web-lib">
    <name>Utils</name>
    <location>c:/users/ansh/desktop/web/mesh/apps/web/lib/**</location>
    <purpose>7 files, 0 functions</purpose>
    <entry_points>
      <function signature="buildGraph() [c:/users/ansh/desktop/web/mesh/apps/web/lib/build-graph.ts:8]" purpose="Build graph" />
      <function signature="trackEvent(event, properties?) [c:/users/ansh/desktop/web/mesh/apps/web/lib/events.ts:11]" purpose="Track event (properties)" />
      <function signature="baseOptions() [c:/users/ansh/desktop/web/mesh/apps/web/lib/layout.shared.tsx:2]" purpose="Base options" />
      <function signature="mergeRefs(refs) [c:/users/ansh/desktop/web/mesh/apps/web/lib/merge-refs.ts:3]" purpose="Merge refs (refs)" />
      <function signature="cn(inputs) [c:/users/ansh/desktop/web/mesh/apps/web/lib/utils.ts:4]" purpose="Cn (inputs)" />
    </entry_points>
  </module>
  <module id="mesh-packages-diagram-generator">
    <name>Search</name>
    <location>c:/users/ansh/desktop/web/mesh/packages/diagram-generator/src/**</location>
    <purpose>2 files, 0 functions</purpose>
    <entry_points>
      <function signature="DiagramOrchestrator.constructor(contract, lock, projectRoot) [c:/users/ansh/desktop/web/mesh/packages/diagram-generator/src/orchestrator.ts:18]" purpose="Diagram orchestrator.constructor (contract, lock, projectRoot)" />
      <function signature="async DiagramOrchestrator.generateAll() [c:/users/ansh/desktop/web/mesh/packages/diagram-generator/src/orchestrator.ts:25]" purpose="Diagram orchestrator.generate all" />
      <function signature="async DiagramOrchestrator.generateImpact(changedIds, impactedIds) [c:/users/ansh/desktop/web/mesh/packages/diagram-generator/src/orchestrator.ts:63]" purpose="Diagram orchestrator.generate impact (changedIds, impactedIds)" />
      <function signature="async DiagramOrchestrator.writeDiagram(relativePath, content) [c:/users/ansh/desktop/web/mesh/packages/diagram-generator/src/orchestrator.ts:72]" purpose="Diagram orchestrator.write diagram (relativePath, content)" />
    </entry_points>
  </module>
  <module id="mesh-packages-mcp-server">
    <name>Storage</name>
    <location>c:/users/ansh/desktop/web/mesh/packages/mcp-server/src/**</location>
    <purpose>5 files, 0 functions</purpose>
    <entry_points>
      <function signature="registerTools(server, projectRoot) [c:/users/ansh/desktop/web/mesh/packages/mcp-server/src/tools.ts:118]" purpose="Register tools (server, projectRoot)" />
      <function signature="registerResources(server, projectRoot) [c:/users/ansh/desktop/web/mesh/packages/mcp-server/src/resources.ts:8]" purpose="Register resources (server, projectRoot)" />
      <function signature="createMikkMcpServer(projectRoot) [c:/users/ansh/desktop/web/mesh/packages/mcp-server/src/server.ts:12]" purpose="Create mikk mcp server (projectRoot)" />
      <function signature="async startStdioServer() [c:/users/ansh/desktop/web/mesh/packages/mcp-server/src/stdio.ts:8]" purpose="Start stdio server" />
    </entry_points>
    <key_internal_functions>
      <function name="_tok" callers="4" purpose="Tok (o)" />
      <function name="_tally" callers="3" purpose="Tally (r)" />
      <function name="_fileTok" callers="3" purpose="File tok (lock, fp)" />
      <function name="buildGraphFromLock" callers="3" purpose="Build graph from lock (lock)" />
      <function name="safeRead" callers="2" purpose="Safe read (filePath)" />
    </key_internal_functions>
  </module>
  <module id="mesh-packages-intent-engine">
    <name>Storage & AI & ML</name>
    <location>c:/users/ansh/desktop/web/mesh/packages/intent-engine/src/**</location>
    <purpose>13 files, 0 functions</purpose>
    <entry_points>
      <function signature="DecisionEngine.evaluate(impact) [c:/users/ansh/desktop/web/mesh/packages/intent-engine/src/decision-engine.ts:17]" purpose="Decision engine.evaluate (impact)" />
      <function signature="IntentUnderstanding.analyzeChangePattern(impact, filesChanged) [c:/users/ansh/desktop/web/mesh/packages/intent-engine/src/intent-understanding.ts:154]" purpose="Intent understanding.analyze change pattern (impact, filesChanged)" />
      <function signature="async SemanticSearcher.index(lock) [c:/users/ansh/desktop/web/mesh/packages/intent-engine/src/semantic-searcher.ts:62]" purpose="Semantic searcher.index (lock)" />
      <function signature="async SemanticSearcher.search(query, lock, topK) [c:/users/ansh/desktop/web/mesh/packages/intent-engine/src/semantic-searcher.ts:120]" purpose="Semantic searcher.search (query, lock, topK)" />
      <function signature="AutoCorrectionEngine.constructor(contract, lock, _graph, projectRoot) [c:/users/ansh/desktop/web/mesh/packages/intent-engine/src/auto-correction.ts:33]" purpose="Auto correction engine.constructor" />
    </entry_points>
    <key_internal_functions>
      <function name="promote" callers="2" purpose="Promote (next)" />
      <function name="norm" callers="1" purpose="Norm (f)" />
      <function name="lockFingerprint" callers="1" purpose="Lock fingerprint (lock)" />
      <function name="cosineSimilarity" callers="1" purpose="Cosine similarity (a, b)" />
    </key_internal_functions>
  </module>
  <module id="mesh-packages-watcher">
    <name>Storage & Messaging</name>
    <location>c:/users/ansh/desktop/web/mesh/packages/watcher/src/**</location>
    <purpose>5 files, 0 functions</purpose>
    <entry_points>
      <function signature="WatcherDaemon.constructor(config) [c:/users/ansh/desktop/web/mesh/packages/watcher/src/daemon.ts:42]" purpose="Watcher daemon.constructor (config)" />
      <function signature="async WatcherDaemon.start() [c:/users/ansh/desktop/web/mesh/packages/watcher/src/daemon.ts:46]" purpose="Watcher daemon.start" />
      <function signature="async WatcherDaemon.stop() [c:/users/ansh/desktop/web/mesh/packages/watcher/src/daemon.ts:99]" purpose="Watcher daemon.stop" />
      <function signature="WatcherDaemon.on(handler) [c:/users/ansh/desktop/web/mesh/packages/watcher/src/daemon.ts:106]" purpose="Watcher daemon.on (handler)" />
      <function signature="WatcherDaemon.enqueueChange(event) [c:/users/ansh/desktop/web/mesh/packages/watcher/src/daemon.ts:112]" purpose="Watcher daemon.enqueue change" />
    </entry_points>
  </module>
  <module id="packages-core-contract">
    <name>Storage & Validation</name>
    <location>c:/users/ansh/desktop/web/mesh/packages/core/src/contract/**</location>
    <purpose>8 files, 0 functions</purpose>
    <entry_points>
      <function signature="ContractGenerator.generateFromClusters(clusters, parsedFiles, projectName, packageJsonDescription?) [c:/users/ansh/desktop/web/mesh/packages/core/src/contract/contract-generator.ts:36]" purpose="Contract generator.generate from clusters" />
      <function signature="LockCompiler.compileFunctions(graph, contract) [c:/users/ansh/desktop/web/mesh/packages/core/src/contract/lock-compiler.ts:189]" purpose="Lock compiler.compile functions (graph, contract)" />
      <function signature="LockCompiler.compileClasses(graph, contract) [c:/users/ansh/desktop/web/mesh/packages/core/src/contract/lock-compiler.ts:234]" purpose="Lock compiler.compile classes (graph, contract)" />
      <function signature="LockCompiler.compileGenerics(graph, contract) [c:/users/ansh/desktop/web/mesh/packages/core/src/contract/lock-compiler.ts:260]" purpose="Lock compiler.compile generics (graph, contract)" />
      <function signature="LockCompiler.fileMatchesModule(filePath, patterns) [c:/users/ansh/desktop/web/mesh/packages/core/src/contract/lock-compiler.ts:402]" purpose="Lock compiler.file matches module (filePath, patterns)" />
    </entry_points>
    <key_internal_functions>
      <function name="inferPurpose" callers="3" purpose="Infer purpose" />
      <function name="parseEntityKey" callers="2" purpose="Parse entity key (key, prefix)" />
      <function name="inferLanguageFromFiles" callers="1" purpose="Infer language from files (parsedFiles)" />
      <function name="splitIdentifier" callers="1" purpose="Split identifier (name)" />
      <function name="getModuleMatchPath" callers="1" purpose="Get module match path (filePath, projectRootPath)" />
    </key_internal_functions>
  </module>
  <module id="packages-cli-commands">
    <name>CLI & Storage</name>
    <location>c:/users/ansh/desktop/web/mesh/packages/cli/src/commands/**</location>
    <purpose>14 files, 0 functions</purpose>
    <entry_points>
      <function signature="registerContextCommands(program) [c:/users/ansh/desktop/web/mesh/packages/cli/src/commands/context.ts:24]" purpose="Register context commands (program)" />
      <function signature="registerUpdateCommand(program) [c:/users/ansh/desktop/web/mesh/packages/cli/src/commands/update.ts:40]" purpose="Register update command (program)" />
      <function signature="registerAdrCommand(program) [c:/users/ansh/desktop/web/mesh/packages/cli/src/commands/adr.ts:6]" purpose="Register adr command (program)" />
      <function signature="registerAnalyzeCommand(program) [c:/users/ansh/desktop/web/mesh/packages/cli/src/commands/analyze.ts:63]" purpose="Register analyze command (program)" />
      <function signature="registerCiCommand(program) [c:/users/ansh/desktop/web/mesh/packages/cli/src/commands/ci.ts:10]" purpose="Register ci command (program)" />
    </entry_points>
    <key_internal_functions>
      <function name="parseJsonSafe" callers="3" purpose="Parse json safe (raw, configPath)" />
      <function name="getManager" callers="2" purpose="Get manager" />
      <function name="resolveCoreModule" callers="2" purpose="Resolve core module (projectRoot)" />
      <function name="buildGraphFromLock" callers="2" purpose="Build graph from lock (lock)" />
      <function name="parseIntOption" callers="2" purpose="Parse int option (value, name, fallback)" />
    </key_internal_functions>
  </module>
  <module id="packages-core-graph">
    <name>Storage</name>
    <location>c:/users/ansh/desktop/web/mesh/packages/core/src/graph/**</location>
    <purpose>10 files, 0 functions</purpose>
    <entry_points>
      <function signature="ClusterDetector.constructor(graph, minClusterSize, minCouplingScore) [c:/users/ansh/desktop/web/mesh/packages/core/src/graph/cluster-detector.ts:83]" purpose="Cluster detector.constructor (graph, minClusterSize, minCouplingScore)" />
      <function signature="ClusterDetector.detect() [c:/users/ansh/desktop/web/mesh/packages/core/src/graph/cluster-detector.ts:90]" purpose="Cluster detector.detect" />
      <function signature="ClusterDetector.computeCouplingMatrix(files) [c:/users/ansh/desktop/web/mesh/packages/core/src/graph/cluster-detector.ts:227]" purpose="Cluster detector.compute coupling matrix (files)" />
      <function signature="ClusterDetector.incrementPair(matrix, a, b) [c:/users/ansh/desktop/web/mesh/packages/core/src/graph/cluster-detector.ts:269]" purpose="Cluster detector.increment pair (matrix, a, b)" />
      <function signature="ClusterDetector.computeClusterAffinity(candidate, cluster, couplingMatrix) [c:/users/ansh/desktop/web/mesh/packages/core/src/graph/cluster-detector.ts:278]" purpose="Cluster detector.compute cluster affinity (candidate, cluster, couplingMatrix)" />
    </entry_points>
  </module>
  <module id="packages-core-hash">
    <name>Database & Providers</name>
    <location>c:/users/ansh/desktop/web/mesh/packages/core/src/hash/**</location>
    <purpose>4 files, 0 functions</purpose>
    <entry_points>
      <function signature="async hashFile(filePath) [c:/users/ansh/desktop/web/mesh/packages/core/src/hash/file-hasher.ts:14]" purpose="Hash file (filePath)" />
      <function signature="hashFunctionBody(fileContent, startLine, endLine) [c:/users/ansh/desktop/web/mesh/packages/core/src/hash/file-hasher.ts:22]" purpose="Hash function body (fileContent, startLine, endLine)" />
      <function signature="HashStore.constructor(projectRoot) [c:/users/ansh/desktop/web/mesh/packages/core/src/hash/hash-store.ts:25]" purpose="Hash store.constructor (projectRoot)" />
      <function signature="HashStore.openDatabase(dbPath) [c:/users/ansh/desktop/web/mesh/packages/core/src/hash/hash-store.ts:38]" purpose="Hash store.open database (dbPath)" />
      <function signature="HashStore.get(filePath) [c:/users/ansh/desktop/web/mesh/packages/core/src/hash/hash-store.ts:60]" purpose="Hash store.get (filePath)" />
    </entry_points>
    <key_internal_functions>
      <function name="hashContent" callers="2" purpose="Hash content (content)" />
    </key_internal_functions>
  </module>
  <module id="packages-core-search">
    <name>Search & Authentication</name>
    <location>c:/users/ansh/desktop/web/mesh/packages/core/src/search/**</location>
    <purpose>2 files, 0 functions</purpose>
    <entry_points>
      <function signature="buildFunctionTokens(fn) [c:/users/ansh/desktop/web/mesh/packages/core/src/search/bm25.ts:194]" purpose="Build function tokens (fn)" />
      <function signature="BM25Index.search(query, limit) [c:/users/ansh/desktop/web/mesh/packages/core/src/search/bm25.ts:73]" purpose="Bm25 index.search (query, limit)" />
      <function signature="reciprocalRankFusion(rankedLists) [c:/users/ansh/desktop/web/mesh/packages/core/src/search/bm25.ts:141]" purpose="Reciprocal rank fusion (rankedLists)" />
      <function signature="BM25Index.clear() [c:/users/ansh/desktop/web/mesh/packages/core/src/search/bm25.ts:49]" purpose="Bm25 index.clear" />
      <function signature="BM25Index.addDocument(id, tokens) [c:/users/ansh/desktop/web/mesh/packages/core/src/search/bm25.ts:57]" purpose="Bm25 index.add document (id, tokens)" />
    </entry_points>
    <key_internal_functions>
      <function name="tokenize" callers="3" purpose="Tokenize (text)" />
    </key_internal_functions>
  </module>
  <module id="packages-core-parser">
    <name>Storage & Logging</name>
    <location>c:/users/ansh/desktop/web/mesh/packages/core/src/parser/**</location>
    <purpose>8 files, 0 functions</purpose>
    <entry_points>
      <function signature="async OxcParser.parse(filePath, content) [c:/users/ansh/desktop/web/mesh/packages/core/src/parser/oxc-parser.ts:280]" purpose="Oxc parser.parse (filePath, content)" />
      <function signature="parseConstraint(constraint) [c:/users/ansh/desktop/web/mesh/packages/core/src/parser/boundary-checker.ts:34]" purpose="Parse constraint (constraint)" />
      <function signature="getParser(filePath) [c:/users/ansh/desktop/web/mesh/packages/core/src/parser/index.ts:104]" purpose="Get parser (filePath)" />
      <function signature="async parseFiles(filePaths, projectRoot, readFile) [c:/users/ansh/desktop/web/mesh/packages/core/src/parser/index.ts:426]" purpose="Parse files (filePaths, projectRoot, readFile)" />
      <function signature="parseJsonWithComments(raw) [c:/users/ansh/desktop/web/mesh/packages/core/src/parser/parser-constants.ts:75]" purpose="Parse json with comments (raw)" />
    </entry_points>
    <key_internal_functions>
      <function name="getSpan" callers="5" purpose="Get span (node)" />
      <function name="resolvePropertyName" callers="4" purpose="Resolve property name (node)" />
      <function name="resolveObjectName" callers="3" purpose="Resolve object name (node)" />
      <function name="extractCalls" callers="3" purpose="Extract calls (node, lineIndex)" />
      <function name="extractParams" callers="3" purpose="Extract params (params)" />
    </key_internal_functions>
  </module>
  <module id="packages-core-utils">
    <name>Utils & Storage</name>
    <location>c:/users/ansh/desktop/web/mesh/packages/core/src/utils/**</location>
    <purpose>6 files, 0 functions</purpose>
    <entry_points>
      <function signature="async runArtifactWriteTransaction(projectRoot, name, writes, options) [c:/users/ansh/desktop/web/mesh/packages/core/src/utils/artifact-transaction.ts:53]" purpose="Run artifact write transaction" />
      <function signature="async discoverContextFiles(projectRoot) [c:/users/ansh/desktop/web/mesh/packages/core/src/utils/fs.ts:187]" purpose="Discover context files (projectRoot)" />
      <function signature="async detectProjectLanguage(projectRoot) [c:/users/ansh/desktop/web/mesh/packages/core/src/utils/fs.ts:282]" purpose="Detect project language (projectRoot)" />
      <function signature="scoreFunctions(prompt, lock, maxResults) [c:/users/ansh/desktop/web/mesh/packages/core/src/utils/fuzzy-match.ts:28]" purpose="Score functions (prompt, lock, maxResults)" />
      <function signature="async recoverArtifactWriteTransactions(projectRoot) [c:/users/ansh/desktop/web/mesh/packages/core/src/utils/artifact-transaction.ts:110]" purpose="Recover artifact write transactions (projectRoot)" />
    </entry_points>
    <key_internal_functions>
      <function name="fileExists" callers="4" purpose="File exists (filePath)" />
      <function name="getTransactionDirectory" callers="2" purpose="Get transaction directory (projectRoot)" />
      <function name="readMikkIgnore" callers="2" purpose="Read mikk ignore (projectRoot)" />
      <function name="writeJournal" callers="1" purpose="Write journal (journalPath, journal)" />
      <function name="makeStagedPath" callers="1" purpose="Make staged path (targetPath, id)" />
    </key_internal_functions>
  </module>
  <module id="packages-diagram-generator-generators">
    <name>Storage & CLI</name>
    <location>c:/users/ansh/desktop/web/mesh/packages/diagram-generator/src/generators/**</location>
    <purpose>8 files, 0 functions</purpose>
    <entry_points>
      <function signature="CapsuleDiagramGenerator.constructor(contract, lock) [c:/users/ansh/desktop/web/mesh/packages/diagram-generator/src/generators/capsule-diagram.ts:9]" purpose="Capsule diagram generator.constructor (contract, lock)" />
      <function signature="CapsuleDiagramGenerator.generate(moduleId) [c:/users/ansh/desktop/web/mesh/packages/diagram-generator/src/generators/capsule-diagram.ts:14]" purpose="Capsule diagram generator.generate (moduleId)" />
      <function signature="CapsuleDiagramGenerator.sanitizeId(id) [c:/users/ansh/desktop/web/mesh/packages/diagram-generator/src/generators/capsule-diagram.ts:91]" purpose="Capsule diagram generator.sanitize id (id)" />
      <function signature="CommandsDiagramGenerator.constructor(_contract?, _lock?) [c:/users/ansh/desktop/web/mesh/packages/diagram-generator/src/generators/commands-diagram.ts:9]" purpose="Commands diagram generator.constructor (_contract, _lock)" />
      <function signature="CommandsDiagramGenerator.generate() [c:/users/ansh/desktop/web/mesh/packages/diagram-generator/src/generators/commands-diagram.ts:14]" purpose="Commands diagram generator.generate" />
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
  <module id="cli-commands-contract">
    <name>CLI & Storage</name>
    <location>c:/users/ansh/desktop/web/mesh/packages/cli/src/commands/contract/**</location>
    <purpose>1 files, 0 functions</purpose>
    <entry_points>
      <function signature="registerContractCommands(program) [c:/users/ansh/desktop/web/mesh/packages/cli/src/commands/contract/index.ts:9]" purpose="Register contract commands (program)" />
    </entry_points>
  </module>
  <module id="core-parser-go">
    <name>Blog & API</name>
    <location>c:/users/ansh/desktop/web/mesh/packages/core/src/parser/go/**</location>
    <purpose>3 files, 0 functions</purpose>
    <entry_points>
      <function signature="GoExtractor.buildParsedFunction(raw) [c:/users/ansh/desktop/web/mesh/packages/core/src/parser/go/go-extractor.ts:252]" purpose="Go extractor.build parsed function (raw)" />
      <function signature="GoExtractor.scanFunctions() [c:/users/ansh/desktop/web/mesh/packages/core/src/parser/go/go-extractor.ts:172]" purpose="Go extractor.scan functions" />
      <function signature="GoExtractor.scanTypeDeclarations() [c:/users/ansh/desktop/web/mesh/packages/core/src/parser/go/go-extractor.ts:282]" purpose="Go extractor.scan type declarations" />
      <function signature="GoExtractor.extractClasses() [c:/users/ansh/desktop/web/mesh/packages/core/src/parser/go/go-extractor.ts:75]" purpose="Go extractor.extract classes" />
      <function signature="GoExtractor.extractExports() [c:/users/ansh/desktop/web/mesh/packages/core/src/parser/go/go-extractor.ts:129]" purpose="Go extractor.extract exports" />
    </entry_points>
    <key_internal_functions>
      <function name="isExported" callers="4" purpose="Check if exported (name)" />
      <function name="findBodyBounds" callers="2" purpose="Find body bounds (lines, startLine)" />
      <function name="extractLeadingComment" callers="2" purpose="Extract leading comment (lines, funcLine)" />
      <function name="extractBalancedParens" callers="1" purpose="Extract balanced parens (s, fromIdx)" />
      <function name="parseGoFuncSignature" callers="1" purpose="Parse go func signature (sig)" />
    </key_internal_functions>
  </module>
  <module id="core-parser-javascript">
    <name>Config & CLI</name>
    <location>c:/users/ansh/desktop/web/mesh/packages/core/src/parser/javascript/**</location>
    <purpose>3 files, 0 functions</purpose>
    <entry_points>
      <function signature="walk(node) [c:/users/ansh/desktop/web/mesh/packages/core/src/parser/javascript/js-extractor.ts:127]" purpose="Walk (node)" />
      <function signature="walk(node) [c:/users/ansh/desktop/web/mesh/packages/core/src/parser/javascript/js-extractor.ts:194]" purpose="Walk (node)" />
      <function signature="JavaScriptExtractor.extractCommonJsExports() [c:/users/ansh/desktop/web/mesh/packages/core/src/parser/javascript/js-extractor.ts:123]" purpose="Java script extractor.extract common js exports" />
      <function signature="JavaScriptExtractor.extractCommonJsFunctions() [c:/users/ansh/desktop/web/mesh/packages/core/src/parser/javascript/js-extractor.ts:191]" purpose="Java script extractor.extract common js functions" />
      <function signature="async JavaScriptParser.resolveImports(files, projectRoot) [c:/users/ansh/desktop/web/mesh/packages/core/src/parser/javascript/js-parser.ts:58]" purpose="Java script parser.resolve imports (files, projectRoot)" />
    </entry_points>
    <key_internal_functions>
      <function name="isModuleExports" callers="5" purpose="Check if module exports (node)" />
      <function name="isExportsDotProp" callers="4" purpose="Check if exports dot prop (node)" />
      <function name="isModuleExportsDotProp" callers="4" purpose="Check if module exports dot prop (node)" />
      <function name="loadAliases" callers="1" purpose="Load aliases (projectRoot)" />
    </key_internal_functions>
  </module>
  <module id="core-parser-tree-sitter">
    <name>Database & API</name>
    <location>c:/users/ansh/desktop/web/mesh/packages/core/src/parser/tree-sitter/**</location>
    <purpose>3 files, 0 functions</purpose>
    <entry_points>
      <function signature="async TreeSitterParser.parseWithConfig(filePath, content, ext, config) [c:/users/ansh/desktop/web/mesh/packages/core/src/parser/tree-sitter/parser.ts:229]" purpose="Tree sitter parser.parse with config" />
      <function signature="extractGenericsFromNode(defNode, filePath) [c:/users/ansh/desktop/web/mesh/packages/core/src/parser/tree-sitter/parser.ts:122]" purpose="Extract generics from node (defNode, filePath)" />
      <function signature="async TreeSitterParser.resolveImports(files, projectRoot) [c:/users/ansh/desktop/web/mesh/packages/core/src/parser/tree-sitter/parser.ts:479]" purpose="Tree sitter parser.resolve imports (files, projectRoot)" />
      <function signature="TreeSitterParser.buildEmptyFile(filePath, content, ext) [c:/users/ansh/desktop/web/mesh/packages/core/src/parser/tree-sitter/parser.ts:498]" purpose="Tree sitter parser.build empty file (filePath, content, ext)" />
      <function signature="getRequire() [c:/users/ansh/desktop/web/mesh/packages/core/src/parser/tree-sitter/parser.ts:9]" purpose="Get require" />
    </entry_points>
    <key_internal_functions>
      <function name="findFirstChild" callers="5" purpose="Find first child (node, predicate)" />
      <function name="findAllChildren" callers="3" purpose="Find all children (node, predicate)" />
      <function name="extensionToLanguage" callers="3" purpose="Extension to language (ext)" />
      <function name="isExportedByLanguage" callers="2" purpose="Check if exported by language (ext, name, nodeText)" />
      <function name="walk" callers="2" purpose="Walk (node)" />
    </key_internal_functions>
  </module>
  <module id="core-parser-typescript">
    <name>Storage & GraphQL</name>
    <location>c:/users/ansh/desktop/web/mesh/packages/core/src/parser/typescript/**</location>
    <purpose>3 files, 0 functions</purpose>
    <entry_points>
      <function signature="TypeScriptExtractor.extractCallsFromNode(node) [c:/users/ansh/desktop/web/mesh/packages/core/src/parser/typescript/ts-extractor.ts:351]" purpose="Type script extractor.extract calls from node (node)" />
      <function signature="TypeScriptExtractor.extractEdgeCases(node) [c:/users/ansh/desktop/web/mesh/packages/core/src/parser/typescript/ts-extractor.ts:411]" purpose="Type script extractor.extract edge cases (node)" />
      <function signature="TypeScriptExtractor.extractErrorHandling(node) [c:/users/ansh/desktop/web/mesh/packages/core/src/parser/typescript/ts-extractor.ts:423]" purpose="Type script extractor.extract error handling (node)" />
      <function signature="walk(n) [c:/users/ansh/desktop/web/mesh/packages/core/src/parser/typescript/ts-extractor.ts:413]" purpose="Walk (n)" />
      <function signature="walk(n) [c:/users/ansh/desktop/web/mesh/packages/core/src/parser/typescript/ts-extractor.ts:425]" purpose="Walk (n)" />
    </entry_points>
    <key_internal_functions>
      <function name="walk" callers="4" purpose="Walk (n)" />
    </key_internal_functions>
  </module>
  <module id="app-api-feedback">
    <name>Blog & Database</name>
    <location>c:/users/ansh/desktop/web/mesh/apps/web/app/api/feedback/**</location>
    <purpose>1 files, 0 functions</purpose>
    <entry_points>
      <function signature="async POST(req) [c:/users/ansh/desktop/web/mesh/apps/web/app/api/feedback/route.ts:133]" purpose="Post (req)" />
    </entry_points>
    <key_internal_functions>
      <function name="getOctokit" callers="1" purpose="Get octokit" />
      <function name="getRepoInfo" callers="1" purpose="Get repo info (octokit)" />
      <function name="findDiscussion" callers="1" purpose="Find discussion (octokit, title)" />
    </key_internal_functions>
  </module>
  <module id="mesh-packages-vscode-extension">
    <name>Providers & Dashboard</name>
    <location>c:/users/ansh/desktop/web/mesh/packages/vscode-extension/src/**</location>
    <purpose>1 files, 0 functions</purpose>
    <entry_points>
      <function signature="activate(context) [c:/users/ansh/desktop/web/mesh/packages/vscode-extension/src/extension.ts:176]" purpose="Activate (context)" />
      <function signature="deactivate() [c:/users/ansh/desktop/web/mesh/packages/vscode-extension/src/extension.ts:292]" purpose="Deactivate" />
      <function signature="MikkDataProvider.setRoot(root) [c:/users/ansh/desktop/web/mesh/packages/vscode-extension/src/extension.ts:38]" purpose="Mikk data provider.set root (root)" />
      <function signature="MikkDataProvider.getRoot() [c:/users/ansh/desktop/web/mesh/packages/vscode-extension/src/extension.ts:44]" purpose="Mikk data provider.get root" />
      <function signature="MikkDataProvider.reload() [c:/users/ansh/desktop/web/mesh/packages/vscode-extension/src/extension.ts:46]" purpose="Mikk data provider.reload" />
    </entry_points>
    <key_internal_functions>
      <function name="updateStatusBar" callers="4" purpose="Update status bar (bar, data)" />
      <function name="refresh" callers="3" purpose="Refresh" />
      <function name="findRoot" callers="2" purpose="Find root (startPath)" />
      <function name="updateContext" callers="2" purpose="Update context (editor)" />
      <function name="runInTerminal" callers="2" purpose="Run in terminal (cmd)" />
    </key_internal_functions>
  </module>
</modules>

<!-- MIKK-END -->
