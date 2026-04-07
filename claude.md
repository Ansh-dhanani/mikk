<repository_context>
  <name>mikk</name>
  <stats>
    <files>245</files>
    <functions>858</functions>
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
    <key_internal_functions>
      <function name="normalizeRoute" callers="3" purpose="Normalize route (method, routePath)" />
      <function name="send" callers="3" purpose="Send (method, params, timeoutMs)" />
      <function name="normalizePath" callers="2" purpose="Normalize path (filePath)" />
      <function name="close" callers="2" purpose="Close" />
      <function name="scoreToPct" callers="1" purpose="Score to pct (score, maxScore)" />
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
      <function signature="ContextBuilder.build(query) [c:/users/ansh/desktop/web/mesh/packages/ai-context/src/context-builder.ts:458]" purpose="Context builder.build (query)" />
      <function signature="ContextBuilder.readFunctionBody(fn, projectRoot) [c:/users/ansh/desktop/web/mesh/packages/ai-context/src/context-builder.ts:743]" purpose="Context builder.read function body (fn, projectRoot)" />
      <function signature="ContextBuilder.generatePrompt(query, modules) [c:/users/ansh/desktop/web/mesh/packages/ai-context/src/context-builder.ts:787]" purpose="Context builder.generate prompt (query, modules)" />
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
      <function signature="registerTools(server, projectRoot) [c:/users/ansh/desktop/web/mesh/packages/mcp-server/src/tools.ts:210]" purpose="Register tools (server, projectRoot)" />
      <function signature="registerResources(server, projectRoot) [c:/users/ansh/desktop/web/mesh/packages/mcp-server/src/resources.ts:8]" purpose="Register resources (server, projectRoot)" />
      <function signature="createMikkMcpServer(projectRoot) [c:/users/ansh/desktop/web/mesh/packages/mcp-server/src/server.ts:12]" purpose="Create mikk mcp server (projectRoot)" />
      <function signature="async startStdioServer() [c:/users/ansh/desktop/web/mesh/packages/mcp-server/src/stdio.ts:8]" purpose="Start stdio server" />
    </entry_points>
    <key_internal_functions>
      <function name="_tok" callers="4" purpose="Tok (o)" />
      <function name="_tally" callers="3" purpose="Tally (r)" />
      <function name="_fileTok" callers="3" purpose="File tok (lock, fp)" />
      <function name="getDirtySampleFiles" callers="3" purpose="Get dirty sample files (projectRoot, sampleFiles)" />
      <function name="buildGraphFromLock" callers="3" purpose="Build graph from lock (lock)" />
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
      <function signature="ContractGenerator.generateFromClusters(clusters, parsedFiles, projectName, packageJsonDescription?) [c:/users/ansh/desktop/web/mesh/packages/core/src/contract/contract-generator.ts:58]" purpose="Contract generator.generate from clusters" />
      <function signature="LockCompiler.compileFunctions(graph, contract) [c:/users/ansh/desktop/web/mesh/packages/core/src/contract/lock-compiler.ts:189]" purpose="Lock compiler.compile functions (graph, contract)" />
      <function signature="LockCompiler.compileClasses(graph, contract) [c:/users/ansh/desktop/web/mesh/packages/core/src/contract/lock-compiler.ts:234]" purpose="Lock compiler.compile classes (graph, contract)" />
      <function signature="LockCompiler.compileGenerics(graph, contract) [c:/users/ansh/desktop/web/mesh/packages/core/src/contract/lock-compiler.ts:260]" purpose="Lock compiler.compile generics (graph, contract)" />
      <function signature="LockCompiler.fileMatchesModule(filePath, patterns) [c:/users/ansh/desktop/web/mesh/packages/core/src/contract/lock-compiler.ts:402]" purpose="Lock compiler.file matches module (filePath, patterns)" />
    </entry_points>
    <key_internal_functions>
      <function name="inferPurpose" callers="3" purpose="Infer purpose" />
      <function name="parseEntityKey" callers="2" purpose="Parse entity key (key, prefix)" />
      <function name="isVendorPath" callers="1" purpose="Check if vendor path (filePath)" />
      <function name="inferLanguageFromFiles" callers="1" purpose="Infer language from files (parsedFiles)" />
      <function name="splitIdentifier" callers="1" purpose="Split identifier (name)" />
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
      <function signature="async parseFiles(filePaths, projectRoot, readFile) [c:/users/ansh/desktop/web/mesh/packages/core/src/parser/index.ts:440]" purpose="Parse files (filePaths, projectRoot, readFile)" />
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


