<repository_context>
  <name>mikk</name>
  <stats>
    <files>198</files>
    <functions>731</functions>
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
    <run>npm run dev</run>
    <executes>turbo run dev</executes>
  </command>
  <command>
    <run>npm run build</run>
    <executes>turbo run build</executes>
  </command>
  <command>
    <run>npm run test</run>
    <executes>turbo run test</executes>
  </command>
  <command>
    <run>npm run lint</run>
    <executes>turbo run lint</executes>
  </command>
</commands>
  <module id="packages-vscode-extension-webview">
    <name>Dashboard</name>
    <location>c:/users/ansh/desktop/web/mesh/packages/vscode-extension/src/webview/**</location>
    <purpose>3 files, 0 functions</purpose>
    <entry_points>
      <function signature="DiagramPanel.constructor(panel, diagramText) [c:/users/ansh/desktop/web/mesh/packages/vscode-extension/src/webview/diagrampanel.ts:10]" purpose="Diagram panel.constructor (panel, diagramText)" />
      <function signature="DiagramPanel.createOrShow(diagramPath) [c:/users/ansh/desktop/web/mesh/packages/vscode-extension/src/webview/diagrampanel.ts:16]" purpose="Diagram panel.create or show (diagramPath)" />
      <function signature="DiagramPanel._update(diagramText) [c:/users/ansh/desktop/web/mesh/packages/vscode-extension/src/webview/diagrampanel.ts:45]" purpose="Diagram panel. update (diagramText)" />
      <function signature="DiagramPanel.dispose() [c:/users/ansh/desktop/web/mesh/packages/vscode-extension/src/webview/diagrampanel.ts:60]" purpose="Diagram panel.dispose" />
      <function signature="DashboardPanel.constructor(panel, data) [c:/users/ansh/desktop/web/mesh/packages/vscode-extension/src/webview/dashboardpanel.ts:8]" purpose="Dashboard panel.constructor (panel, data)" />
    </entry_points>
  </module>
  <module id="web-mesh-benchmarks">
    <name>Storage & Dashboard</name>
    <location>c:/users/ansh/desktop/web/mesh/benchmarks/**</location>
    <purpose>4 files, 0 functions</purpose>
    <entry_points>
      <function signature="AsciinemaBenchmark.constructor() [c:/users/ansh/desktop/web/mesh/benchmarks/asciinema-benchmark.ts:78]" purpose="Asciinema benchmark.constructor" />
      <function signature="async AsciinemaBenchmark.recordScenario(scenario, mode) [c:/users/ansh/desktop/web/mesh/benchmarks/asciinema-benchmark.ts:85]" purpose="Asciinema benchmark.record scenario (scenario, mode)" />
      <function signature="AsciinemaBenchmark.generateScript(scenario, mode) [c:/users/ansh/desktop/web/mesh/benchmarks/asciinema-benchmark.ts:138]" purpose="Asciinema benchmark.generate script (scenario, mode)" />
      <function signature="AsciinemaBenchmark.analyzeRecording(castFile) [c:/users/ansh/desktop/web/mesh/benchmarks/asciinema-benchmark.ts:160]" purpose="Asciinema benchmark.analyze recording (castFile)" />
      <function signature="async AsciinemaBenchmark.runAll() [c:/users/ansh/desktop/web/mesh/benchmarks/asciinema-benchmark.ts:197]" purpose="Asciinema benchmark.run all" />
    </entry_points>
  </module>
  <module id="mesh-apps-web">
    <name>API & Config</name>
    <location>c:/users/ansh/desktop/web/mesh/apps/web/**</location>
    <purpose>2 files, 0 functions</purpose>
    <entry_points>
      <function signature="middleware(request) [c:/users/ansh/desktop/web/mesh/apps/web/middleware.ts:6]" purpose="Middleware (request)" />
      <function signature="middleware(request) [c:/users/ansh/desktop/web/mesh/apps/web/middleware.ts:6]" purpose="Middleware (request)" />
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
      <function signature="trackEvent(_event) [c:/users/ansh/desktop/web/mesh/apps/web/lib/events.ts:8]" purpose="Track event (_event)" />
      <function signature="baseOptions() [c:/users/ansh/desktop/web/mesh/apps/web/lib/layout.shared.tsx:2]" purpose="Base options" />
      <function signature="mergeRefs(refs) [c:/users/ansh/desktop/web/mesh/apps/web/lib/merge-refs.ts:3]" purpose="Merge refs (refs)" />
      <function signature="cn(inputs) [c:/users/ansh/desktop/web/mesh/apps/web/lib/utils.ts:4]" purpose="Cn (inputs)" />
    </entry_points>
  </module>
  <module id="mesh-packages-ai-context">
    <name>Providers & Authentication</name>
    <location>c:/users/ansh/desktop/web/mesh/packages/ai-context/src/**</location>
    <purpose>7 files, 0 functions</purpose>
    <entry_points>
      <function signature="OpenClawRulesGenerator.constructor(projectName) [c:/users/ansh/desktop/web/mesh/packages/ai-context/src/openclaw-generator.ts:4]" purpose="Open claw rules generator.constructor (projectName)" />
      <function signature="OpenClawRulesGenerator.generate() [c:/users/ansh/desktop/web/mesh/packages/ai-context/src/openclaw-generator.ts:8]" purpose="Open claw rules generator.generate" />
      <function signature="ClaudeMdGenerator.constructor(contract, lock, tokenBudget, meta?, projectRoot?) [c:/users/ansh/desktop/web/mesh/packages/ai-context/src/claude-md-generator.ts:30]" purpose="Claude md generator.constructor" />
      <function signature="ClaudeMdGenerator.generate() [c:/users/ansh/desktop/web/mesh/packages/ai-context/src/claude-md-generator.ts:41]" purpose="Claude md generator.generate" />
      <function signature="ClaudeMdGenerator.generateSummary() [c:/users/ansh/desktop/web/mesh/packages/ai-context/src/claude-md-generator.ts:136]" purpose="Claude md generator.generate summary" />
    </entry_points>
  </module>
  <module id="mesh-packages-cli">
    <name>CLI & Utils</name>
    <location>c:/users/ansh/desktop/web/mesh/packages/cli/src/**</location>
    <purpose>3 files, 0 functions</purpose>
    <entry_points>
      <function signature="async patchFileContent(filePath, newContent) [c:/users/ansh/desktop/web/mesh/packages/cli/src/utils.ts:6]" purpose="Patch file content (filePath, newContent)" />
      <function signature="async stripMikkBlock(filePath) [c:/users/ansh/desktop/web/mesh/packages/cli/src/utils.ts:33]" purpose="Strip mikk block (filePath)" />
      <function signature="banner(tagline?) [c:/users/ansh/desktop/web/mesh/packages/cli/src/ui.ts:13]" purpose="Banner (tagline)" />
      <function signature="visLen(s) [c:/users/ansh/desktop/web/mesh/packages/cli/src/ui.ts:23]" purpose="Vis len (s)" />
      <function signature="pad(s, width) [c:/users/ansh/desktop/web/mesh/packages/cli/src/ui.ts:27]" purpose="Pad (s, width)" />
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
      <function signature="FileWatcher.constructor(config) [c:/users/ansh/desktop/web/mesh/packages/watcher/src/file-watcher.ts:15]" purpose="File watcher.constructor (config)" />
      <function signature="FileWatcher.start() [c:/users/ansh/desktop/web/mesh/packages/watcher/src/file-watcher.ts:18]" purpose="File watcher.start" />
      <function signature="async FileWatcher.stop() [c:/users/ansh/desktop/web/mesh/packages/watcher/src/file-watcher.ts:54]" purpose="File watcher.stop" />
      <function signature="FileWatcher.on(handler) [c:/users/ansh/desktop/web/mesh/packages/watcher/src/file-watcher.ts:60]" purpose="File watcher.on (handler)" />
      <function signature="FileWatcher.setHash(filePath, hash) [c:/users/ansh/desktop/web/mesh/packages/watcher/src/file-watcher.ts:65]" purpose="File watcher.set hash (filePath, hash)" />
    </entry_points>
  </module>
  <module id="packages-cli-commands">
    <name>CLI & Storage</name>
    <location>c:/users/ansh/desktop/web/mesh/packages/cli/src/commands/**</location>
    <purpose>14 files, 0 functions</purpose>
    <entry_points>
      <function signature="registerCiCommand(program) [c:/users/ansh/desktop/web/mesh/packages/cli/src/commands/ci.ts:10]" purpose="Register ci command (program)" />
      <function signature="buildGraphFromLock(lock) [c:/users/ansh/desktop/web/mesh/packages/cli/src/commands/ci.ts:100]" purpose="Build graph from lock (lock)" />
      <function signature="findWorkspaceRoot(start) [c:/users/ansh/desktop/web/mesh/packages/cli/src/commands/analyze.ts:11]" purpose="Find workspace root (start)" />
      <function signature="async resolveCoreModule(projectRoot) [c:/users/ansh/desktop/web/mesh/packages/cli/src/commands/analyze.ts:24]" purpose="Resolve core module (projectRoot)" />
      <function signature="registerAnalyzeCommand(program) [c:/users/ansh/desktop/web/mesh/packages/cli/src/commands/analyze.ts:63]" purpose="Register analyze command (program)" />
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
  <module id="packages-core-search">
    <name>Search & Authentication</name>
    <location>c:/users/ansh/desktop/web/mesh/packages/core/src/search/**</location>
    <purpose>2 files, 0 functions</purpose>
    <entry_points>
      <function signature="reciprocalRankFusion(rankedLists) [c:/users/ansh/desktop/web/mesh/packages/core/src/search/bm25.ts:127]" purpose="Reciprocal rank fusion (rankedLists)" />
      <function signature="tokenize(text) [c:/users/ansh/desktop/web/mesh/packages/core/src/search/bm25.ts:155]" purpose="Tokenize (text)" />
      <function signature="buildFunctionTokens(fn) [c:/users/ansh/desktop/web/mesh/packages/core/src/search/bm25.ts:180]" purpose="Build function tokens (fn)" />
      <function signature="BM25Index.clear() [c:/users/ansh/desktop/web/mesh/packages/core/src/search/bm25.ts:49]" purpose="Bm25 index.clear" />
      <function signature="BM25Index.addDocument(id, tokens) [c:/users/ansh/desktop/web/mesh/packages/core/src/search/bm25.ts:57]" purpose="Bm25 index.add document (id, tokens)" />
    </entry_points>
  </module>
  <module id="packages-diagram-generator-generators">
    <name>Storage & CLI</name>
    <location>c:/users/ansh/desktop/web/mesh/packages/diagram-generator/src/generators/**</location>
    <purpose>8 files, 0 functions</purpose>
    <entry_points>
      <function signature="CommandsDiagramGenerator.constructor(_contract?, _lock?) [c:/users/ansh/desktop/web/mesh/packages/diagram-generator/src/generators/commands-diagram.ts:9]" purpose="Commands diagram generator.constructor (_contract, _lock)" />
      <function signature="CommandsDiagramGenerator.generate() [c:/users/ansh/desktop/web/mesh/packages/diagram-generator/src/generators/commands-diagram.ts:14]" purpose="Commands diagram generator.generate" />
      <function signature="FlowDiagramGenerator.constructor(lock) [c:/users/ansh/desktop/web/mesh/packages/diagram-generator/src/generators/flow-diagram.ts:9]" purpose="Flow diagram generator.constructor (lock)" />
      <function signature="FlowDiagramGenerator.generate(startFunctionId, maxDepth) [c:/users/ansh/desktop/web/mesh/packages/diagram-generator/src/generators/flow-diagram.ts:14]" purpose="Flow diagram generator.generate (startFunctionId, maxDepth)" />
      <function signature="FlowDiagramGenerator.generateEntryPoints() [c:/users/ansh/desktop/web/mesh/packages/diagram-generator/src/generators/flow-diagram.ts:31]" purpose="Flow diagram generator.generate entry points" />
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
      <function signature="async GoParser.parse(filePath, content) [c:/users/ansh/desktop/web/mesh/packages/core/src/parser/go/go-parser.ts:13]" purpose="Go parser.parse (filePath, content)" />
      <function signature="GoParser.resolveImports(files, projectRoot) [c:/users/ansh/desktop/web/mesh/packages/core/src/parser/go/go-parser.ts:32]" purpose="Go parser.resolve imports (files, projectRoot)" />
      <function signature="GoParser.getSupportedExtensions() [c:/users/ansh/desktop/web/mesh/packages/core/src/parser/go/go-parser.ts:40]" purpose="Go parser.get supported extensions" />
      <function signature="extractBalancedParens(s, fromIdx) [c:/users/ansh/desktop/web/mesh/packages/core/src/parser/go/go-extractor.ts:369]" purpose="Extract balanced parens (s, fromIdx)" />
      <function signature="parseGoFuncSignature(sig) [c:/users/ansh/desktop/web/mesh/packages/core/src/parser/go/go-extractor.ts:383]" purpose="Parse go func signature (sig)" />
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
      <function signature="getRequire() [c:/users/ansh/desktop/web/mesh/packages/core/src/parser/tree-sitter/parser.ts:9]" purpose="Get require" />
      <function signature="isExportedByLanguage(ext, name, nodeText) [c:/users/ansh/desktop/web/mesh/packages/core/src/parser/tree-sitter/parser.ts:28]" purpose="Check if exported by language (ext, name, nodeText)" />
      <function signature="extractParamsFromNode(defNode) [c:/users/ansh/desktop/web/mesh/packages/core/src/parser/tree-sitter/parser.ts:53]" purpose="Extract params from node (defNode)" />
      <function signature="walk(node) [c:/users/ansh/desktop/web/mesh/packages/core/src/parser/tree-sitter/parser.ts:58]" purpose="Walk (node)" />
      <function signature="findFirstChild(node, predicate) [c:/users/ansh/desktop/web/mesh/packages/core/src/parser/tree-sitter/parser.ts:89]" purpose="Find first child (node, predicate)" />
    </entry_points>
  </module>
  <module id="core-parser-typescript">
    <name>Storage & GraphQL</name>
    <location>c:/users/ansh/desktop/web/mesh/packages/core/src/parser/typescript/**</location>
    <purpose>3 files, 0 functions</purpose>
    <entry_points>
      <function signature="walk(n) [c:/users/ansh/desktop/web/mesh/packages/core/src/parser/typescript/ts-extractor.ts:353]" purpose="Walk (n)" />
      <function signature="walk(n) [c:/users/ansh/desktop/web/mesh/packages/core/src/parser/typescript/ts-extractor.ts:413]" purpose="Walk (n)" />
      <function signature="walk(n) [c:/users/ansh/desktop/web/mesh/packages/core/src/parser/typescript/ts-extractor.ts:425]" purpose="Walk (n)" />
      <function signature="TypeScriptExtractor.constructor(filePath, content) [c:/users/ansh/desktop/web/mesh/packages/core/src/parser/typescript/ts-extractor.ts:19]" purpose="Type script extractor.constructor (filePath, content)" />
      <function signature="TypeScriptExtractor.inferScriptKind(filePath) [c:/users/ansh/desktop/web/mesh/packages/core/src/parser/typescript/ts-extractor.ts:32]" purpose="Type script extractor.infer script kind (filePath)" />
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


