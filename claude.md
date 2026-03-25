<repository_context>
  <name>mikk</name>
  <stats>
    <files>182</files>
    <functions>572</functions>
    <modules>28</modules>
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
  <module id="desktop-web-mesh">
    <name>Testing</name>
    <location>c:/users/ansh/desktop/web/mesh/**</location>
    <purpose>2 files, 0 functions</purpose>
    <entry_points>
      <function signature="async test() [c:/users/ansh/desktop/web/mesh/test-oxc.ts:5]" purpose="Test" />
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
  <module id="apps-web-components">
    <name>Components</name>
    <location>c:/users/ansh/desktop/web/mesh/apps/web/components/**</location>
    <purpose>19 files, 0 functions</purpose>
    <entry_points>
      <function signature="getMDXComponents(components?) [c:/users/ansh/desktop/web/mesh/apps/web/components/mdx.tsx:14]" purpose="Get mdx components (components)" />
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
  <module id="web-mesh-benchmarks">
    <name>Dashboard & Storage</name>
    <location>c:/users/ansh/desktop/web/mesh/benchmarks/**</location>
    <purpose>1 files, 0 functions</purpose>
    <entry_points>
      <function signature="AsciinemaBenchmark.constructor() [c:/users/ansh/desktop/web/mesh/benchmarks/asciinema-benchmark.ts:78]" purpose="Asciinema benchmark.constructor" />
      <function signature="async AsciinemaBenchmark.recordScenario(scenario, mode) [c:/users/ansh/desktop/web/mesh/benchmarks/asciinema-benchmark.ts:85]" purpose="Asciinema benchmark.record scenario (scenario, mode)" />
      <function signature="AsciinemaBenchmark.generateScript(scenario, mode) [c:/users/ansh/desktop/web/mesh/benchmarks/asciinema-benchmark.ts:138]" purpose="Asciinema benchmark.generate script (scenario, mode)" />
      <function signature="AsciinemaBenchmark.analyzeRecording(castFile) [c:/users/ansh/desktop/web/mesh/benchmarks/asciinema-benchmark.ts:160]" purpose="Asciinema benchmark.analyze recording (castFile)" />
      <function signature="async AsciinemaBenchmark.runAll() [c:/users/ansh/desktop/web/mesh/benchmarks/asciinema-benchmark.ts:197]" purpose="Asciinema benchmark.run all" />
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
    <purpose>5 files, 0 functions</purpose>
    <entry_points>
      <function signature="readContextFile(filePath, projectRoot?) [c:/users/ansh/desktop/web/mesh/packages/ai-context/src/context-builder.ts:27]" purpose="Read context file (filePath, projectRoot)" />
      <function signature="estimateTokens(text) [c:/users/ansh/desktop/web/mesh/packages/ai-context/src/context-builder.ts:39]" purpose="Estimate tokens (text)" />
      <function signature="bfsNeighbors(seeds, functions, maxDepth) [c:/users/ansh/desktop/web/mesh/packages/ai-context/src/context-builder.ts:51]" purpose="Bfs neighbors (seeds, functions, maxDepth)" />
      <function signature="depthToScore(depth) [c:/users/ansh/desktop/web/mesh/packages/ai-context/src/context-builder.ts:88]" purpose="Depth to score (depth)" />
      <function signature="extractKeywords(task) [c:/users/ansh/desktop/web/mesh/packages/ai-context/src/context-builder.ts:110]" purpose="Extract keywords (task)" />
    </entry_points>
  </module>
  <module id="mesh-packages-cli">
    <name>Notifications & CLI</name>
    <location>c:/users/ansh/desktop/web/mesh/packages/cli/src/**</location>
    <purpose>2 files, 0 functions</purpose>
    <entry_points>
      <function signature="banner(tagline?) [c:/users/ansh/desktop/web/mesh/packages/cli/src/ui.ts:13]" purpose="Banner (tagline)" />
      <function signature="visLen(s) [c:/users/ansh/desktop/web/mesh/packages/cli/src/ui.ts:23]" purpose="Vis len (s)" />
      <function signature="pad(s, width) [c:/users/ansh/desktop/web/mesh/packages/cli/src/ui.ts:27]" purpose="Pad (s, width)" />
      <function signature="tw() [c:/users/ansh/desktop/web/mesh/packages/cli/src/ui.ts:33]" purpose="Tw" />
      <function signature="infoBar(value, max, width) [c:/users/ansh/desktop/web/mesh/packages/cli/src/ui.ts:52]" purpose="Info bar (value, max, width)" />
    </entry_points>
  </module>
  <module id="mesh-packages-intent-engine">
    <name>AI & ML & Search</name>
    <location>c:/users/ansh/desktop/web/mesh/packages/intent-engine/src/**</location>
    <purpose>9 files, 0 functions</purpose>
    <entry_points>
      <function signature="ConflictDetector.constructor(contract, lock?) [c:/users/ansh/desktop/web/mesh/packages/intent-engine/src/conflict-detector.ts:22]" purpose="Conflict detector.constructor (contract, lock)" />
      <function signature="ConflictDetector.detect(intents) [c:/users/ansh/desktop/web/mesh/packages/intent-engine/src/conflict-detector.ts:28]" purpose="Conflict detector.detect (intents)" />
      <function signature="ConflictDetector.classifyConstraint(text) [c:/users/ansh/desktop/web/mesh/packages/intent-engine/src/conflict-detector.ts:111]" purpose="Conflict detector.classify constraint (text)" />
      <function signature="ConflictDetector.checkConstraint(intent, constraint) [c:/users/ansh/desktop/web/mesh/packages/intent-engine/src/conflict-detector.ts:124]" purpose="Conflict detector.check constraint (intent, constraint)" />
      <function signature="ConflictDetector.checkNoImport(constraint, intent) [c:/users/ansh/desktop/web/mesh/packages/intent-engine/src/conflict-detector.ts:137]" purpose="Conflict detector.check no import (constraint, intent)" />
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
      <function signature="createMikkMcpServer(projectRoot) [c:/users/ansh/desktop/web/mesh/packages/mcp-server/src/server.ts:12]" purpose="Create mikk mcp server (projectRoot)" />
      <function signature="async startStdioServer() [c:/users/ansh/desktop/web/mesh/packages/mcp-server/src/stdio.ts:8]" purpose="Start stdio server" />
      <function signature="registerResources(server, projectRoot) [c:/users/ansh/desktop/web/mesh/packages/mcp-server/src/resources.ts:8]" purpose="Register resources (server, projectRoot)" />
      <function signature="async safeRead(filePath) [c:/users/ansh/desktop/web/mesh/packages/mcp-server/src/resources.ts:59]" purpose="Safe read (filePath)" />
      <function signature="invalidateCache(projectRoot) [c:/users/ansh/desktop/web/mesh/packages/mcp-server/src/tools.ts:34]" purpose="Invalidate cache (projectRoot)" />
    </entry_points>
  </module>
  <module id="mesh-packages-vscode-extension">
    <name>Providers & Storage</name>
    <location>c:/users/ansh/desktop/web/mesh/packages/vscode-extension/src/**</location>
    <purpose>1 files, 0 functions</purpose>
    <entry_points>
      <function signature="activate(context) [c:/users/ansh/desktop/web/mesh/packages/vscode-extension/src/extension.ts:58]" purpose="Activate (context)" />
      <function signature="refreshAll() [c:/users/ansh/desktop/web/mesh/packages/vscode-extension/src/extension.ts:90]" purpose="Refresh all" />
      <function signature="deactivate() [c:/users/ansh/desktop/web/mesh/packages/vscode-extension/src/extension.ts:191]" purpose="Deactivate" />
      <function signature="runInTerminal(command) [c:/users/ansh/desktop/web/mesh/packages/vscode-extension/src/extension.ts:195]" purpose="Run in terminal (command)" />
      <function signature="updateStatusBar(statusBar, data) [c:/users/ansh/desktop/web/mesh/packages/vscode-extension/src/extension.ts:201]" purpose="Update status bar (statusBar, data)" />
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
  <module id="packages-cli-commands">
    <name>CLI & Storage</name>
    <location>c:/users/ansh/desktop/web/mesh/packages/cli/src/commands/**</location>
    <purpose>14 files, 0 functions</purpose>
    <entry_points>
      <function signature="registerAdrCommand(program) [c:/users/ansh/desktop/web/mesh/packages/cli/src/commands/adr.ts:6]" purpose="Register adr command (program)" />
      <function signature="getManager() [c:/users/ansh/desktop/web/mesh/packages/cli/src/commands/adr.ts:11]" purpose="Get manager" />
      <function signature="findWorkspaceRoot(start) [c:/users/ansh/desktop/web/mesh/packages/cli/src/commands/analyze.ts:10]" purpose="Find workspace root (start)" />
      <function signature="async resolveCoreModule(projectRoot) [c:/users/ansh/desktop/web/mesh/packages/cli/src/commands/analyze.ts:23]" purpose="Resolve core module (projectRoot)" />
      <function signature="registerAnalyzeCommand(program) [c:/users/ansh/desktop/web/mesh/packages/cli/src/commands/analyze.ts:62]" purpose="Register analyze command (program)" />
    </entry_points>
  </module>
  <module id="packages-core-contract">
    <name>Storage & Validation</name>
    <location>c:/users/ansh/desktop/web/mesh/packages/core/src/contract/**</location>
    <purpose>8 files, 0 functions</purpose>
    <entry_points>
      <function signature="async ContractWriter.writeNew(contract, outputPath) [c:/users/ansh/desktop/web/mesh/packages/core/src/contract/contract-writer.ts:21]" purpose="Contract writer.write new (contract, outputPath)" />
      <function signature="async ContractWriter.update(existing, updates, outputPath) [c:/users/ansh/desktop/web/mesh/packages/core/src/contract/contract-writer.ts:28]" purpose="Contract writer.update (existing, updates, outputPath)" />
      <function signature="ContractWriter.mergeContracts(existing, updates) [c:/users/ansh/desktop/web/mesh/packages/core/src/contract/contract-writer.ts:63]" purpose="Contract writer.merge contracts (existing, updates)" />
      <function signature="ContractWriter.diffContracts(existing, updates) [c:/users/ansh/desktop/web/mesh/packages/core/src/contract/contract-writer.ts:82]" purpose="Contract writer.diff contracts (existing, updates)" />
      <function signature="async ContractWriter.writeAuditLog(before, after, contractPath) [c:/users/ansh/desktop/web/mesh/packages/core/src/contract/contract-writer.ts:90]" purpose="Contract writer.write audit log (before, after, contractPath)" />
    </entry_points>
  </module>
  <module id="packages-core-graph">
    <name>Storage</name>
    <location>c:/users/ansh/desktop/web/mesh/packages/core/src/graph/**</location>
    <purpose>9 files, 0 functions</purpose>
    <entry_points>
      <function signature="ClusterDetector.constructor(graph, minClusterSize, minCouplingScore) [c:/users/ansh/desktop/web/mesh/packages/core/src/graph/cluster-detector.ts:83]" purpose="Cluster detector.constructor (graph, minClusterSize, minCouplingScore)" />
      <function signature="ClusterDetector.detect() [c:/users/ansh/desktop/web/mesh/packages/core/src/graph/cluster-detector.ts:90]" purpose="Cluster detector.detect" />
      <function signature="ClusterDetector.computeCouplingMatrix(files) [c:/users/ansh/desktop/web/mesh/packages/core/src/graph/cluster-detector.ts:222]" purpose="Cluster detector.compute coupling matrix (files)" />
      <function signature="ClusterDetector.incrementPair(matrix, a, b) [c:/users/ansh/desktop/web/mesh/packages/core/src/graph/cluster-detector.ts:264]" purpose="Cluster detector.increment pair (matrix, a, b)" />
      <function signature="ClusterDetector.computeClusterAffinity(candidate, cluster, couplingMatrix) [c:/users/ansh/desktop/web/mesh/packages/core/src/graph/cluster-detector.ts:273]" purpose="Cluster detector.compute cluster affinity (candidate, cluster, couplingMatrix)" />
    </entry_points>
  </module>
  <module id="packages-core-hash">
    <name>Database & Providers</name>
    <location>c:/users/ansh/desktop/web/mesh/packages/core/src/hash/**</location>
    <purpose>4 files, 0 functions</purpose>
    <entry_points>
      <function signature="computeModuleHash(fileHashes) [c:/users/ansh/desktop/web/mesh/packages/core/src/hash/tree-hasher.ts:7]" purpose="Compute module hash (fileHashes)" />
      <function signature="computeRootHash(moduleHashes) [c:/users/ansh/desktop/web/mesh/packages/core/src/hash/tree-hasher.ts:15]" purpose="Compute root hash (moduleHashes)" />
      <function signature="HashStore.constructor(projectRoot) [c:/users/ansh/desktop/web/mesh/packages/core/src/hash/hash-store.ts:25]" purpose="Hash store.constructor (projectRoot)" />
      <function signature="HashStore.openDatabase(dbPath) [c:/users/ansh/desktop/web/mesh/packages/core/src/hash/hash-store.ts:38]" purpose="Hash store.open database (dbPath)" />
      <function signature="HashStore.get(filePath) [c:/users/ansh/desktop/web/mesh/packages/core/src/hash/hash-store.ts:60]" purpose="Hash store.get (filePath)" />
    </entry_points>
  </module>
  <module id="packages-core-parser">
    <name>Storage & Logging</name>
    <location>c:/users/ansh/desktop/web/mesh/packages/core/src/parser/**</location>
    <purpose>8 files, 0 functions</purpose>
    <entry_points>
      <function signature="OxcResolver.constructor(projectRoot) [c:/users/ansh/desktop/web/mesh/packages/core/src/parser/oxc-resolver.ts:24]" purpose="Oxc resolver.constructor (projectRoot)" />
      <function signature="OxcResolver.resolve(source, fromFile) [c:/users/ansh/desktop/web/mesh/packages/core/src/parser/oxc-resolver.ts:49]" purpose="Oxc resolver.resolve (source, fromFile)" />
      <function signature="OxcResolver.resolveBatch(files) [c:/users/ansh/desktop/web/mesh/packages/core/src/parser/oxc-resolver.ts:74]" purpose="Oxc resolver.resolve batch (files)" />
      <function signature="getParser(filePath) [c:/users/ansh/desktop/web/mesh/packages/core/src/parser/index.ts:34]" purpose="Get parser (filePath)" />
      <function signature="async parseFiles(filePaths, projectRoot, readFile) [c:/users/ansh/desktop/web/mesh/packages/core/src/parser/index.ts:72]" purpose="Parse files (filePaths, projectRoot, readFile)" />
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
      <function signature="ModuleDiagramGenerator.constructor(contract, lock) [c:/users/ansh/desktop/web/mesh/packages/diagram-generator/src/generators/module-diagram.ts:17]" purpose="Module diagram generator.constructor (contract, lock)" />
      <function signature="ModuleDiagramGenerator.generate(moduleId) [c:/users/ansh/desktop/web/mesh/packages/diagram-generator/src/generators/module-diagram.ts:22]" purpose="Module diagram generator.generate (moduleId)" />
      <function signature="ModuleDiagramGenerator.sanitizeId(id) [c:/users/ansh/desktop/web/mesh/packages/diagram-generator/src/generators/module-diagram.ts:154]" purpose="Module diagram generator.sanitize id (id)" />
      <function signature="FlowDiagramGenerator.constructor(lock) [c:/users/ansh/desktop/web/mesh/packages/diagram-generator/src/generators/flow-diagram.ts:9]" purpose="Flow diagram generator.constructor (lock)" />
      <function signature="FlowDiagramGenerator.generate(startFunctionId, maxDepth) [c:/users/ansh/desktop/web/mesh/packages/diagram-generator/src/generators/flow-diagram.ts:14]" purpose="Flow diagram generator.generate (startFunctionId, maxDepth)" />
    </entry_points>
  </module>
  <module id="packages-core-search">
    <name>Search & Authentication</name>
    <location>c:/users/ansh/desktop/web/mesh/packages/core/src/search/**</location>
    <purpose>2 files, 0 functions</purpose>
    <entry_points>
      <function signature="reciprocalRankFusion(rankedLists) [c:/users/ansh/desktop/web/mesh/packages/core/src/search/bm25.ts:120]" purpose="Reciprocal rank fusion (rankedLists)" />
      <function signature="tokenize(text) [c:/users/ansh/desktop/web/mesh/packages/core/src/search/bm25.ts:148]" purpose="Tokenize (text)" />
      <function signature="buildFunctionTokens(fn) [c:/users/ansh/desktop/web/mesh/packages/core/src/search/bm25.ts:173]" purpose="Build function tokens (fn)" />
      <function signature="BM25Index.clear() [c:/users/ansh/desktop/web/mesh/packages/core/src/search/bm25.ts:49]" purpose="Bm25 index.clear" />
      <function signature="BM25Index.addDocument(id, tokens) [c:/users/ansh/desktop/web/mesh/packages/core/src/search/bm25.ts:57]" purpose="Bm25 index.add document (id, tokens)" />
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
</modules>

## Data Models & Schemas

These files define the project's data structures, schemas, and configuration.
They are auto-discovered and included verbatim from the source.

### `packages/ai-context/src/types.ts` (types)

```typescript
import type { MikkContract, MikkLock, MikkLockFunction } from '@getmikk/core'

/** The structured context object passed to AI models */
export interface AIContext {
    project: {
        name: string
        language: string
        description: string
        moduleCount: number
        functionCount: number
    }
    modules: ContextModule[]
    constraints: string[]
    decisions: { title: string; reason: string }[]
    /** Discovered schema/config/model files included verbatim */
    contextFiles?: { path: string; content: string; type: string }[]
    /** Detected HTTP route registrations */
    routes?: { method: string; path: string; handler: string; middlewares: string[]; file: string; line: number }[]
    prompt: string
    /** Diagnostic info — helpful for debugging context quality */
    meta: {
        seedCount: number
        totalFunctionsConsidered: number
        selectedFunctions: number
        estimatedTokens: number
        keywords: string[]
    }
}

export interface ContextModule {
    id: string
    name: string
    description: string
    intent?: string
    functions: ContextFunction[]
    files: string[]
}

export interface ContextFunction {
    name: string
    file: string
    startLine: number
    endLine: number
    calls: string[]
    calledBy: string[]
    params?: { name: string; type: string; optional?: boolean }[]
    returnType?: string
    isAsync?: boolean
    isExported?: boolean
    purpose?: string
    errorHandling?: string[]
    edgeCases?: string[]
    /** The actual source code body (only included for top-scored functions) */
    body?: string
}

/** Query options for context generation */
export interface ContextQuery {
    /** The user's task description — the primary relevance signal */
    task: string
    /** Specific files to anchor the graph traversal from */
    focusFiles?: string[]
    /** Specific modules to include */
    focusModules?: string[]
    /** Max functions to include in output (hard cap) */
    maxFunctions?: number
    /** Max BFS hops from seed nodes (default 4) */
    maxHops?: number
    /** Approximate token budget for function listings (default 6000) */
    tokenBudget?: number
    /** Include call graph arrows (default true) */
    includeCallGraph?: boolean
    /** Include function bodies for top-scored functions (default true) */
    includeBodies?: boolean
    /** Absolute filesystem path to the project root (needed for body reading) */
    projectRoot?: string
}

/** Context provider interface for different AI platforms */
export interface ContextProvider {
    name: string
    formatContext(context: AIContext): string
    maxTokens: number
}
```

### `packages/intent-engine/src/types.ts` (types)

```typescript
import { z } from 'zod'

/** A single candidate intent parsed from user prompt */
export const IntentSchema = z.object({
    action: z.enum(['create', 'modify', 'delete', 'refactor', 'move']),
    target: z.object({
        type: z.enum(['function', 'file', 'module', 'class']),
        name: z.string(),
        moduleId: z.string().optional(),
        filePath: z.string().optional(),
    }),
    reason: z.string(),
    confidence: z.number().min(0).max(1),
})

export type Intent = z.infer<typeof IntentSchema>

/** Result of conflict detection */
export interface ConflictResult {
    hasConflicts: boolean
    conflicts: Conflict[]
}

export interface Conflict {
    type: 'constraint-violation' | 'ownership-conflict' | 'boundary-crossing' | 'missing-dependency' | 'low-confidence'
    severity: 'error' | 'warning'
    message: string
    relatedIntent: Intent
    suggestedFix?: string
}

/** A suggestion for how to implement an intent */
export interface Suggestion {
    intent: Intent
    affectedFiles: string[]
    newFiles: string[]
    estimatedImpact: number
    implementation: string
}

export type DecisionStatus = 'APPROVED' | 'WARNING' | 'BLOCKED';

export interface DecisionResult {
    status: DecisionStatus
    reasons: string[]
    riskScore: number
    impactNodes: number
}

export interface Explanation {
    summary: string
    details: string[]
    riskBreakdown: {
        symbol: string
        reason: string
        score: number
    }[]
}

/** Configuration for the AI provider */
export interface AIProviderConfig {
    provider: 'anthropic' | 'openai' | 'local'
    apiKey?: string
    model?: string
}

/** Preflight result — the final output of the intent pipeline */
export interface PreflightResult {
    intents: Intent[]
    conflicts: ConflictResult
    suggestions: Suggestion[]
    decision: DecisionResult
    explanation: Explanation
    approved: boolean
}
```

### `packages/watcher/src/types.ts` (types)

```typescript
/** File change event emitted when a source file is added, changed, or deleted */
export interface FileChangeEvent {
    type: 'added' | 'changed' | 'deleted'
    path: string
    oldHash: string | null
    newHash: string | null
    timestamp: number
    affectedModuleIds: string[]
}

/** Configuration for the watcher */
export interface WatcherConfig {
    projectRoot: string
    include: string[]    // ["src/**/*.ts"]
    exclude: string[]    // ["node_modules", ".mikk", "dist"]
    debounceMs: number   // 100
}

/** Typed watcher events */
export type WatcherEvent =
    | { type: 'file:changed'; data: FileChangeEvent }
    | { type: 'module:updated'; data: { moduleId: string; newHash: string } }
    | { type: 'graph:updated'; data: { changedNodes: string[]; impactedNodes: string[] } }
    | { type: 'sync:clean'; data: { rootHash: string } }
    | { type: 'sync:drifted'; data: { reason: string; affectedModules: string[] } }
```

### `packages/core/src/graph/types.ts` (types)

```typescript
export type NodeType =
  | "file"
  | "class"
  | "function"
  | "variable"
  | "generic";

export type EdgeType =
  | "imports"
  | "calls"
  | "extends"
  | "implements"
  | "accesses"
  | "contains"; // Keeping for containment edges

export interface GraphNode {
  id: string;              // unique (normalized file::name)
  type: NodeType;
  name: string;
  file: string;
  moduleId?: string;       // Original cluster feature

  metadata?: {
    isExported?: boolean;
    inheritsFrom?: string[];
    implements?: string[];
    className?: string; // for methods
    startLine?: number;
    endLine?: number;
    isAsync?: boolean;
    hash?: string;
    purpose?: string;
    genericKind?: string;
    params?: { name: string; type: string; optional?: boolean }[];
    returnType?: string;
    edgeCasesHandled?: string[];
    errorHandling?: { line: number; type: 'try-catch' | 'throw'; detail: string }[];
    detailedLines?: { startLine: number; endLine: number; blockType: string }[];
  };
}

export interface GraphEdge {
  from: string;
  to: string;
  type: EdgeType;
  confidence: number; // 0–1
  weight?: number;    // Weight from EDGE_WEIGHT constants
}

export interface DependencyGraph {
  nodes: Map<string, GraphNode>;
  edges: GraphEdge[];
  outEdges: Map<string, GraphEdge[]>;   // node → [edges going out]
  inEdges: Map<string, GraphEdge[]>;    // node → [edges coming in]
}

/**
 * Canonical ID helpers.
 * Function IDs:  fn:<absolute-posix-path>:<FunctionName>
 * Class IDs:     class:<absolute-posix-path>:<ClassName>
 * Type/enum IDs: type:<absolute-posix-path>:<Name> | enum:<absolute-posix-path>:<Name>
 * File IDs:      <absolute-posix-path>  (no prefix)
 *
 * NOTE: The old normalizeId() that used `file::name` (double-colon, lowercase)
 * was removed — it did not match any current ID format and would produce IDs
 * that never matched any graph node.
 */
export function makeFnId(file: string, name: string): string {
  return `fn:${file.replace(/\\/g, '/')}:${name}`;
}

export type RiskLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface ImpactResult {
  changed: string[];
  impacted: string[];
  allImpacted: ClassifiedImpact[]; // New field for Decision Engine
  depth: number;
  entryPoints: string[];
  criticalModules: string[];
  paths: string[][];
  confidence: number;
  riskScore: number;
  classified: {
    critical: ClassifiedImpact[];
    high: ClassifiedImpact[];
    medium: ClassifiedImpact[];
    low: ClassifiedImpact[];
  };
}

export interface ClassifiedImpact {
  nodeId: string;
  label: string;
  file: string;
  risk: RiskLevel;
  riskScore: number; // numeric score for precise policy checks
  depth: number;
}

export interface ModuleCluster {
  id: string;
  files: string[];
  confidence: number;
  suggestedName: string;
  functions: string[];
}
```

### `packages/core/src/parser/types.ts` (types)

```typescript
/**
 * Parser types — data shapes that flow through the entire Mikk system.
 */

/** A single parameter in a function signature */
export interface ParsedParam {
  name: string;
  type: string;
  optional: boolean;
  defaultValue?: string;
}

/** A single call expression found in code (Mikk 2.0) */
export interface CallExpression {
  name: string;
  line: number;
  type: 'function' | 'method' | 'property';
  arguments?: string[];
}

/** A detailed function declaration */
export interface ParsedFunction {
  id: string;              // unique normalized ID (file::name)
  name: string;
  file: string;
  moduleId?: string;
  startLine: number;
  endLine: number;
  params: ParsedParam[];
  returnType: string;
  isExported: boolean;
  isAsync: boolean;
  isGenerator?: boolean;
  typeParameters?: string[];
  calls: CallExpression[]; // Behavioral tracking (Upgraded from string[])
  hash: string;
  purpose: string;
  edgeCasesHandled: string[];
  errorHandling: { line: number; type: 'try-catch' | 'throw'; detail: string }[];
  detailedLines: { startLine: number; endLine: number; blockType: string }[];
}

/** A single import statement */
export interface ParsedImport {
  source: string;
  resolvedPath: string;
  names: string[];
  isDefault: boolean;
  isDynamic: boolean;
}

/** A single exported symbol */
export interface ParsedExport {
  name: string;
  type: 'function' | 'class' | 'const' | 'type' | 'default' | 'interface' | 'variable';
  file: string;
}

/** A single variable or property */
export interface ParsedVariable {
  id: string;
  name: string;
  type: string;
  file: string;
  line: number;
  isExported: boolean;
  isStatic?: boolean;
  purpose?: string;
}

/** A parsed class */
export interface ParsedClass {
  id: string;
  name: string;
  file: string;
  moduleId?: string;
  startLine: number;
  endLine: number;
  methods: ParsedFunction[];
  properties: ParsedVariable[];
  extends?: string;
  implements?: string[];
  isExported: boolean;
  decorators?: string[];
  typeParameters?: string[];
  hash: string;
  purpose?: string;
  edgeCasesHandled?: string[];
  errorHandling?: { line: number; type: 'try-catch' | 'throw'; detail: string }[];
}

/** A generic declaration (interface, type aliase, etc.) */
export interface ParsedGeneric {
  id: string;
  name: string;
  type: string; // "interface" | "type"
  file: string;
  startLine: number;
  endLine: number;
  isExported: boolean;
  typeParameters?: string[];
  hash: string;
  purpose?: string;
}

/** A detected HTTP route registration */
export interface ParsedRoute {
  method: string;
  path: string;
  handler: string;
  middlewares: string[];
  file: string;
  line: number;
}

/** Everything extracted from a single file */
export interface ParsedFile {
  path: string;            // normalized absolute path
  language: 'python' | 'go' | 'typescript' | 'javascript' | 'java' | 'c' | 'cpp' | 'csharp' | 'rust' | 'php' | 'ruby' | 'unknown';
  functions: ParsedFunction[];
  classes: ParsedClass[];
  variables: ParsedVariable[];
  generics: ParsedGeneric[];
  imports: ParsedImport[];
  exports: ParsedExport[];
  routes: ParsedRoute[];
  calls: CallExpression[]; // module-level calls
  hash: string;
  parsedAt: number;
}
```




## Always Do

- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.

## When Debugging


## When Refactoring


## Never Do

- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.

## Tools Quick Reference

| Tool | When to use | Command |
|------|-------------|---------|

## Impact Risk Levels

| Depth | Meaning | Action |
|-------|---------|--------|
| d=1 | WILL BREAK — direct callers/importers | MUST update these |
| d=2 | LIKELY AFFECTED — indirect deps | Should test |
| d=3 | MAY NEED TESTING — transitive | Test if critical path |

## Resources

| Resource | Use for |
|----------|---------|

## Self-Check Before Finishing

Before completing any code modification task, verify:
2. No HIGH/CRITICAL risk warnings were ignored
4. All d=1 (WILL BREAK) dependents were updated

## Keeping the Index Fresh


```bash
```

If the index previously included embeddings, preserve them by adding `--embeddings`:

```bash
```


> Claude Code users: A PostToolUse hook handles this automatically after `git commit` and `git merge`.

## CLI

| Task | Read this skill file |
|------|---------------------|

