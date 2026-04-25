import type { DependencyGraph, ModuleCluster } from './types.js'

// ─── Domain keyword maps for semantic naming ─────────────────────────────────
// Covers any language / framework. First match wins for a given word bag.
const DOMAIN_KEYWORDS: [string, string[]][] = [
    // ── Auth / Identity ──────────────────────────────────────────────────────
    ['Authentication', ['auth', 'login', 'logout', 'signin', 'signup', 'session', 'jwt', 'token',
        'credential', 'password', 'oauth', 'sso', 'saml', 'oidc', 'refresh', 'identity']],
    ['Encryption', ['encrypt', 'decrypt', 'cipher', 'aes', 'argon', 'bcrypt', 'derive',
        'salt', 'envelope', 'hmac', 'pbkdf2', 'crypto']],
    // ── Data ────────────────────────────────────────────────────────────────
    ['Database', ['prisma', 'query', 'queries', 'db', 'database', 'repository', 'repo',
        'knex', 'sequelize', 'drizzle', 'typeorm', 'mongoose', 'migration', 'seed', 'schema',
        'model', 'entity', 'record', 'orm', 'sqlalchemy', 'alembic', 'diesel', 'gorm']],
    ['Caching', ['cache', 'redis', 'memcached', 'ttl', 'invalidate', 'lru', 'stale',
        'memoize', 'memo', 'cached']],
    ['Storage', ['storage', 's3', 'bucket', 'blob', 'upload', 'download', 'stream',
        'file', 'archive', 'minio', 'gcs', 'azure-blob', 'filesystem', 'persist']],
    // ── Network / API ────────────────────────────────────────────────────────
    ['API', ['api', 'endpoint', 'middleware', 'handler', 'route', 'controller',
        'request', 'response', 'rest', 'openapi', 'swagger', 'fastapi', 'express',
        'actix', 'axum', 'gin', 'echo', 'koa', 'hapi', 'fastify', 'nestjs']],
    ['GraphQL', ['resolver', 'mutation', 'subscription', 'typedef', 'graphql', 'gql', 'apollo']],
    ['gRPC', ['grpc', 'rpc', 'protobuf', 'service', 'stub', 'proto', 'tonic']],
    ['WebSocket', ['websocket', 'ws', 'socket', 'socketio', 'realtime', 'broadcast', 'emit']],
    // ── UI / Frontend ────────────────────────────────────────────────────────
    ['Navigation', ['sidebar', 'header', 'footer', 'nav', 'breadcrumb', 'menu',
        'topbar', 'toolbar', 'appbar', 'navbar']],
    ['Layout', ['layout', 'shell', 'frame', 'wrapper', 'page', 'container',
        'grid', 'template', 'scaffold', 'slot']],
    ['Forms', ['form', 'input', 'select', 'checkbox', 'radio', 'textarea',
        'field', 'datepicker', 'timepicker', 'formik', 'rhf', 'useform']],
    ['Hooks', ['hook', 'useauth', 'usestate', 'useeffect', 'usememo', 'usequery',
        'usemutation', 'useform', 'composable', 'usecallback', 'usereducer',
        'usecontext', 'signal', 'computed', 'effect']],
    ['Providers', ['provider', 'context', 'theme', 'store', 'reducer', 'zustand',
        'pinia', 'redux', 'recoil', 'jotai', 'mobx', 'valtio']],
    ['Components', ['component', 'button', 'modal', 'dialog', 'card', 'toast',
        'toggle', 'badge', 'tab', 'alert', 'avatar', 'widget', 'dropdown',
        'popover', 'tooltip', 'accordion', 'table', 'chip', 'icon']],
    ['Dashboard', ['dashboard', 'chart', 'metric', 'stat', 'analytics', 'overview',
        'report', 'kpi', 'recharts', 'chartjs', 'echarts', 'apex', 'tremor']],
    ['Media', ['image', 'video', 'audio', 'upload', 'gallery', 'zoom', 'embed',
        'asset', 'thumbnail', 'crop', 'resize', 'ffmpeg']],
    ['Notifications', ['notification', 'toast', 'alert', 'snackbar', 'banner', 'push',
        'fcm', 'apns', 'sonner', 'notistack']],
    // ── Business Domains ─────────────────────────────────────────────────────
    ['Project Management', ['project', 'member', 'team', 'workspace', 'organization',
        'invite', 'role', 'permission', 'acl', 'rbac', 'tenant', 'plan']],
    ['Portfolio', ['portfolio', 'resume', 'experience', 'certification', 'award',
        'testimonial', 'social', 'profile', 'bio', 'skill', 'career']],
    ['Blog', ['blog', 'post', 'article', 'mdx', 'markdown', 'rss', 'feed', 'author',
        'category', 'tag', 'comment', 'slug', 'content', 'contentlayer', 'sanity', 'strapi']],
    ['Search', ['search', 'filter', 'sort', 'autocomplete', 'fuzzy', 'index',
        'algolia', 'typesense', 'meilisearch', 'elasticsearch', 'lunr', 'bm25']],
    ['Payments', ['payment', 'stripe', 'billing', 'invoice', 'subscription',
        'checkout', 'cart', 'price', 'order', 'refund', 'lemon', 'paddle', 'razorpay',
        'paypal', 'webhook']],
    ['Validation', ['validate', 'validator', 'schema', 'assert', 'sanitize', 'zod',
        'yup', 'joi', 'ajv', 'class-validator', 'valibot', 'pydantic', 'cerberus']],
    // ── CLI / Tooling ────────────────────────────────────────────────────────
    ['CLI', ['command', 'arg', 'flag', 'prompt', 'subcommand', 'repl', 'cli',
        'yargs', 'commander', 'inquirer', 'clipanion', 'oclif', 'cobra', 'clap',
        'argparse', 'typer', 'click', 'bin']],
    ['Config', ['config', 'env', 'settings', 'constants', 'options', 'feature',
        'flag', 'dotenv', 'envify', 'cosmiconfig', 'rc', 'ini', 'toml', 'yaml']],
    ['Utils', ['util', 'utils', 'helper', 'helpers', 'format', 'convert',
        'transform', 'lib', 'common', 'shared', 'misc', 'kit']],
    ['Testing', ['test', 'spec', 'mock', 'fixture', 'stub', 'fake', 'factory',
        'seed', 'jest', 'vitest', 'pytest', 'rspec', 'cucumber', 'cypress',
        'playwright', 'testing', '__test']],
    // ── AI / ML ──────────────────────────────────────────────────────────────
    ['AI & ML', ['model', 'train', 'predict', 'inference', 'pipeline', 'tokenizer',
        'embedding', 'llm', 'openai', 'anthropic', 'vector', 'rag', 'langchain',
        'llamaindex', 'transformers', 'torch', 'tensorflow', 'keras', 'sklearn',
        'huggingface', 'cohere', 'mistral', 'gemini', 'groq', 'vertex', 'bedrock']],
    // ── Messaging / Queue ─────────────────────────────────────────────────────
    ['Messaging', ['queue', 'worker', 'consumer', 'producer', 'broker', 'pubsub',
        'event', 'subscriber', 'publisher', 'bullmq', 'kafka', 'rabbitmq',
        'nats', 'sqs', 'sns', 'celery', 'sidekiq', 'resque', 'temporal']],
    // ── Observability ─────────────────────────────────────────────────────────
    ['Logging', ['logger', 'log', 'trace', 'metric', 'telemetry', 'sentry',
        'monitor', 'span', 'otel', 'opentelemetry', 'datadog', 'newrelic',
        'grafana', 'prometheus', 'pino', 'winston', 'bunyan', 'loguru']],
    ['Scheduling', ['cron', 'job', 'scheduler', 'background', 'recurring',
        'interval', 'agenda', 'node-cron', 'apscheduler', 'sidekiq', 'beat']],
    // ── Email ─────────────────────────────────────────────────────────────────
    ['Email', ['email', 'mail', 'smtp', 'sendgrid', 'mailer', 'newsletter',
        'resend', 'mailgun', 'postmark', 'ses', 'nodemailer', 'mjml', 'react-email']],
    // ── i18n / a11y ───────────────────────────────────────────────────────────
    ['Internationalization', ['i18n', 'locale', 'translation', 'intl', 'language',
        'l10n', 'next-intl', 'i18next', 'react-intl', 'lingui', 'fluent']],
    ['Accessibility', ['a11y', 'aria', 'screenreader', 'focus', 'keyboard',
        'wcag', 'axe', 'radix']],
    // ── Platform / Infra ──────────────────────────────────────────────────────
    ['Secrets', ['secret', 'vault', 'credential', 'keychain', 'kms', 'hsm',
        'doppler', 'sops', '1password']],
    ['Parser', ['parser', 'lexer', 'tokenize', 'ast', 'grammar', 'parse',
        'tree-sitter', 'babel', 'swc', 'esbuild', 'acorn', 'espree', 'oxc']],
    ['Graph', ['graph', 'node', 'edge', 'cluster', 'impact', 'dependency',
        'adjacency', 'dag', 'topology', 'traversal', 'bfs', 'dfs']],
    ['Hash', ['hash', 'checksum', 'digest', 'sha', 'md5', 'xxhash', 'crc',
        'fingerprint', 'etag', 'content-hash']],
    ['Contract', ['contract', 'schema', 'lock', 'manifest', 'spec', 'protocol',
        'interface', 'definition', 'typegen', 'codegen']],
    ['Analysis', ['analysis', 'analyze', 'lint', 'audit', 'scan', 'detect',
        'inspect', 'diagnose', 'metric', 'quality', 'complexity', 'coverage']],
    ['Security', ['security', 'csp', 'xss', 'csrf', 'injection', 'sanitize',
        'rate-limit', 'captcha', 'owasp', 'helmet', 'cors', 'permission']],
    ['Concurrency', ['async', 'await', 'promise', 'concurrent', 'parallel',
        'thread', 'mutex', 'channel', 'actor', 'coroutine', 'goroutine',
        'tokio', 'rayon', 'asyncio']],
]

// Trivial path segments to skip when computing relative base dirs
const TRIVIAL_PATH_SEGMENTS = new Set([
    // OS / user dirs
    'users', 'home', 'desktop', 'documents', 'downloads', 'projects', 'workspace',
    'code', 'dev', 'work', 'repos', 'github', 'gitlab', 'bitbucket',
    // Build dirs
    'src', 'lib', 'dist', 'build', 'out', 'output', 'generated',
    // Node / package dirs
    'node_modules', 'target', '.next', '.nuxt', 'vendor', 'venv', '.venv',
    'site-packages', '__pycache__', '.tox',
])

/**
 * ClusterDetector — production-grade module clustering.
 *
 * Pipeline:
 *   1. Compute coupling matrix from graph edges
 *   2. Greedy agglomeration seeded from highest-connectivity files
 *   3. Merge sibling clusters (same project-relative directory) to prevent fragmentation
 *   4. Semantic naming via DOMAIN_KEYWORDS scored against function/file words
 *   5. Fallback to directory-based clusters when graph has too few edges
 *
 * Key guarantees:
 *   - Deterministic output (same graph → same clusters every run)
 *   - Project-root-relative base dir computation (fixes absolute-path collapse bug)
 *   - Unique cluster IDs (numeric suffix on collision)
 *   - Unique human names (directory suffix on collision)
 *   - Works for any language / framework / project structure
 */
export class ClusterDetector {
    private _projectRoot: string | null = null

    constructor(
        private graph: DependencyGraph,
        private minClusterSize: number = 1,
        private minCouplingScore: number = 0.05,
        // Optional: existing lock for extra purpose metadata
        private existingLock?: { functions?: Record<string, { purpose?: string }> } | null
    ) { }

    /** Returns semantic module clusters sorted by confidence (highest first). */
    detect(): ModuleCluster[] {
        const fileNodes = [...this.graph.nodes.values()].filter(n => n.type === 'file')
        if (fileNodes.length === 0) return []

        const files = fileNodes.map(n => n.id)

        // Pre-compute project root once (used by getBaseDir)
        this._projectRoot = this.computeProjectRoot(files.map(f => this.getNodeFile(f)))

        const couplingMatrix = this.computeCouplingMatrix(files)
        const assigned = new Set<string>()
        const clusters: ModuleCluster[] = []

        // Sort by total edge count descending (most connected = best seeds)
        const sortedFiles = [...files].sort((a, b) =>
            this.getTotalEdges(b) - this.getTotalEdges(a)
        )

        for (const seedFile of sortedFiles) {
            if (assigned.has(seedFile)) continue

            const cluster: string[] = [seedFile]
            const tentative = new Set<string>([seedFile])
            let ptr = 0

            while (ptr < cluster.length) {
                const clusterFile = cluster[ptr++]
                const partners = couplingMatrix.get(clusterFile) ?? new Map<string, number>()
                for (const [candidate, score] of partners) {
                    if (assigned.has(candidate) || tentative.has(candidate)) continue
                    if (score < this.minCouplingScore) continue
                    
                    const clusterAffinity = this.computeClusterAffinity(candidate, cluster, couplingMatrix)
                    const outsideAffinity = this.computeBestOutsideAffinity(candidate, cluster, couplingMatrix, assigned)
                    
                    if (clusterAffinity > outsideAffinity) {
                        cluster.push(candidate)
                        tentative.add(candidate)
                    }
                }
            }

            if (cluster.length >= this.minClusterSize) {
                for (const f of cluster) assigned.add(f)
                const filePaths = cluster.map(id => this.getNodeFile(id))
                const functionIds = this.getFunctionIdsForFiles(cluster)
                clusters.push({
                    id: this.inferClusterId(filePaths),
                    files: filePaths,
                    confidence: this.computeClusterConfidence(cluster),
                    suggestedName: this.inferSemanticName(filePaths, functionIds),
                    functions: functionIds,
                })
            }
        }

        // Orphans → single-file clusters
        for (const file of files) {
            if (!assigned.has(file)) {
                const filePath = this.getNodeFile(file)
                const functionIds = this.getFunctionIdsForFiles([file])
                clusters.push({
                    id: this.inferClusterId([filePath]),
                    files: [filePath],
                    confidence: 0.3,
                    suggestedName: this.inferSemanticName([filePath], functionIds),
                    functions: functionIds,
                })
            }
        }

        // Merge siblings (files sharing the same project-relative parent directory)
        const merged = this.mergeSiblingClusters(clusters)

        // Deduplicate IDs
        const seenIds = new Map<string, number>()
        for (const cluster of merged) {
            const base = cluster.id
            const count = (seenIds.get(base) ?? 0)
            seenIds.set(base, count + 1)
            if (count > 0) cluster.id = `${base}-${count + 1}`
        }

        // Disambiguate names
        const nameGroups = new Map<string, ModuleCluster[]>()
        for (const cluster of merged) {
            const g = nameGroups.get(cluster.suggestedName) ?? []
            g.push(cluster)
            nameGroups.set(cluster.suggestedName, g)
        }
        for (const [, dupes] of nameGroups) {
            if (dupes.length <= 1) continue
            for (const cluster of dupes) {
                const segs = cluster.id.split('-')
                    .filter(s => s && s !== 'packages' && s !== 'apps' && s !== 'src')
                const suffix = segs.map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ')
                if (suffix && suffix.toLowerCase() !== cluster.suggestedName.toLowerCase()) {
                    cluster.suggestedName = `${cluster.suggestedName} (${suffix})`
                } else {
                    cluster.suggestedName = `${cluster.suggestedName} (${cluster.id})`
                }
            }
        }

        const sorted = merged.sort((a, b) => b.confidence - a.confidence)

        // If coupling produced only 1 mega-cluster (degenerate), fall back to directory split
        if (sorted.length <= 1 && files.length > 3) {
            return this.buildDirectoryClusters(files)
        }

        return sorted
    }

    // ─── Coupling Matrix ──────────────────────────────────────────────────────

    private computeCouplingMatrix(files: string[]): Map<string, Map<string, number>> {
        const matrix = new Map<string, Map<string, number>>()
        const fileEdgeCounts = new Map<string, number>()
        const fileSet = new Set(files)

        for (const fileId of files) {
            fileEdgeCounts.set(fileId,
                (this.graph.outEdges.get(fileId)?.length ?? 0) +
                (this.graph.inEdges.get(fileId)?.length ?? 0))
        }

        for (const edge of this.graph.edges) {
            if (edge.type !== 'imports' && edge.type !== 'calls') continue
            const sf = this.getFileForNode(edge.from)
            const tf = this.getFileForNode(edge.to)
            if (!sf || !tf || sf === tf) continue
            if (!fileSet.has(sf) || !fileSet.has(tf)) continue
            this.incrementPair(matrix, sf, tf)
            this.incrementPair(matrix, tf, sf)
        }

        // Normalise to coupling scores [0..1]
        for (const [file, partners] of matrix) {
            const totalEdges = fileEdgeCounts.get(file) ?? 1
            for (const [partner, edgeCount] of partners) {
                const partnerEdges = fileEdgeCounts.get(partner) ?? 1
                partners.set(partner, (edgeCount * 2) / (totalEdges + partnerEdges))
            }
        }

        return matrix
    }

    private incrementPair(matrix: Map<string, Map<string, number>>, a: string, b: string): void {
        if (!matrix.has(a)) matrix.set(a, new Map())
        const m = matrix.get(a)!
        m.set(b, (m.get(b) ?? 0) + 1)
    }

    // ─── Affinity ────────────────────────────────────────────────────────────

    private computeClusterAffinity(
        candidate: string, cluster: string[],
        matrix: Map<string, Map<string, number>>
    ): number {
        const partners = matrix.get(candidate) ?? new Map<string, number>()
        let total = 0, count = 0
        for (const cf of cluster) { total += partners.get(cf) ?? 0; count++ }
        return count > 0 ? total / count : 0
    }

    private computeBestOutsideAffinity(
        candidate: string, cluster: string[],
        matrix: Map<string, Map<string, number>>,
        assigned: Set<string>
    ): number {
        const partners = matrix.get(candidate) ?? new Map<string, number>()
        const clusterSet = new Set(cluster)
        let best = 0
        for (const [partner, score] of partners) {
            if (!clusterSet.has(partner) && !assigned.has(partner) && score > best) best = score
        }
        return best
    }

    // ─── Confidence ──────────────────────────────────────────────────────────

    computeClusterConfidence(files: string[]): number {
        const fileSet = new Set(files)
        let internal = 0, external = 0

        for (const file of files) {
            for (const edge of this.graph.outEdges.get(file) ?? []) {
                if (edge.type === 'imports') {
                    if (fileSet.has(edge.to)) {
                        internal++
                    } else {
                        external++
                    }
                }
                if (edge.type === 'contains') {
                    for (const callEdge of this.graph.outEdges.get(edge.to) ?? []) {
                        if (callEdge.type === 'calls') {
                            const tgt = this.graph.nodes.get(callEdge.to)
                            if (tgt) {
                                if (fileSet.has(tgt.file)) {
                                    internal++
                                } else {
                                    external++
                                }
                            }
                        }
                    }
                }
            }
        }

        const total = internal + external
        if (total === 0) return 0.5
        const ratio = internal / total
        
        // Single-file clusters that only call themselves shouldn't project 100% architectural confidence
        if (files.length === 1 && ratio === 1.0) return 0.4
        
        return ratio
    }

    // ─── Node Helpers ─────────────────────────────────────────────────────────

    private getTotalEdges(nodeId: string): number {
        return (this.graph.outEdges.get(nodeId)?.length ?? 0) +
            (this.graph.inEdges.get(nodeId)?.length ?? 0)
    }

    private getFileForNode(nodeId: string): string | null {
        const node = this.graph.nodes.get(nodeId)
        if (!node) return null
        return node.type === 'file' ? nodeId : (node.file || null)
    }

    private getNodeFile(fileNodeId: string): string {
        return this.graph.nodes.get(fileNodeId)?.file ?? fileNodeId
    }

    private getFunctionIdsForFiles(fileNodeIds: string[]): string[] {
        return fileNodeIds.flatMap(f =>
            (this.graph.outEdges.get(f) ?? [])
                .filter(e => e.type === 'contains')
                .map(e => e.to)
        )
    }

    // ─── Path Utilities ───────────────────────────────────────────────────────

    /**
     * Compute the longest common path prefix of all files in the graph.
     * Returns forward-slash, lowercase string.
     */
    private computeProjectRoot(filePaths: string[]): string {
        if (filePaths.length === 0) return ''
        const segs = filePaths
            .map(f => f.replace(/\\/g, '/').toLowerCase().split('/').filter(Boolean))
        const first = segs[0]
        let commonLen = 0
        for (let i = 0; i < first.length - 1; i++) {
            if (segs.every(s => s[i] === first[i])) commonLen = i + 1
            else break
        }
        return first.slice(0, commonLen).join('/')
    }

    /**
     * Return a base directory key for sibling-cluster merging.
     * Uses the FIRST 3 project-relative meaningful segments so that
     * monorepo packages (apps/web, packages/core, scripts) all get distinct
     * keys regardless of how deep the files sit.
     *
     * Previously used LAST 2 segments which collapsed unrelated directories
     * (e.g. scripts/ and apps/web/components/ both ending in component/ui)
     * into the same bucket, creating 264-file mega clusters.
     */
    private getBaseDir(files: string[]): string {
        if (files.length === 0) return 'unknown'

        // Normalise all paths
        const normalized = files.map(f => f.replace(/\\/g, '/').toLowerCase())

        // Compute common prefix of files in this cluster
        const segs = normalized.map(f => f.split('/').filter(Boolean))
        const first = segs[0]
        let commonLen = 0
        for (let i = 0; i < first.length - 1; i++) {
            if (segs.every(s => s[i] === first[i])) commonLen = i + 1
            else break
        }
        const common = first.slice(0, commonLen)

        // Strip project root prefix so we get a project-relative path
        const root = (this._projectRoot ?? '').split('/').filter(Boolean)
        const rootLen = root.every((seg, i) => seg === common[i]) ? root.length : 0
        const relative = common.slice(rootLen)

        // Skip trivial segments and drive letters
        const isDriveLetter = (s: string) => /^[a-z]:?$/.test(s)
        const meaningful = relative.filter(s =>
            s.length > 0 && !isDriveLetter(s) && !TRIVIAL_PATH_SEGMENTS.has(s)
        )

        // Use the FIRST 3 meaningful segments (= most stable package distinguisher)
        // This ensures apps/web !== scripts even if they share deep sub-dirs
        return meaningful.slice(0, 3).join('/') || 'root'
    }

    /**
     * Build a hyphenated module ID from the last 3 meaningful directory segments.
     * Works on both absolute and relative paths.
     */
    private getDirSegments(filePath: string): string {
        const projectRoot = this._projectRoot ?? ''
        const norm = filePath.replace(/\\/g, '/').toLowerCase()

        // Make relative to project root if possible
        const relative = projectRoot && norm.startsWith(projectRoot)
            ? norm.slice(projectRoot.length).replace(/^\//, '')
            : norm

        const parts = relative.split('/').filter(Boolean)
        const dirs = parts.slice(0, -1) // drop filename

        const filtered = dirs.filter(p =>
            p && !TRIVIAL_PATH_SEGMENTS.has(p) && !/^[a-z]:?$/.test(p)
        )

        if (filtered.length === 0) {
            const filename = parts[parts.length - 1] ?? ''
            return filename.replace(/\.[^.]+$/, '').replace(/[^a-z0-9]+/g, '-') || 'unknown'
        }

        // At most 3 segments, prefer the last ones
        const meaningful = filtered.slice(-3)
        return meaningful.map(s => s.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()).join('-') || 'unknown'
    }

    // ─── Cluster ID ───────────────────────────────────────────────────────────

    private inferClusterId(filePaths: string[]): string {
        if (filePaths.length === 0) return 'unknown'
        if (filePaths.length === 1) return this.getDirSegments(filePaths[0])

        // Longest common directory prefix
        const segs = filePaths.map(f => f.replace(/\\/g, '/').split('/'))
        const first = segs[0]
        let commonLen = 0
        for (let i = 0; i < first.length - 1; i++) {
            if (segs.every(s => s[i] === first[i])) commonLen = i + 1
            else break
        }
        return this.getDirSegments(first.slice(0, commonLen).join('/') || filePaths[0])
    }

    // ─── Merging ──────────────────────────────────────────────────────────────

    private mergeSiblingClusters(clusters: ModuleCluster[]): ModuleCluster[] {
        const byBase = new Map<string, ModuleCluster[]>()
        for (const cluster of clusters) {
            const base = this.getBaseDir(cluster.files)
            const existing = byBase.get(base) ?? []
            existing.push(cluster)
            byBase.set(base, existing)
        }

        const result: ModuleCluster[] = []

        for (const [base, siblings] of byBase.entries()) {
            if (siblings.length <= 1) {
                const merged = siblings[0]
                if (merged) result.push(merged)
                continue
            }

            const allFiles = [...new Set(siblings.flatMap(c => c.files))]
            const allFns = [...new Set(siblings.flatMap(c => c.functions))]
            const avgConf = siblings.reduce((s, c) => s + c.confidence, 0) / siblings.length

            result.push({
                id: this.getDirSegments(allFiles[0]),
                files: allFiles,
                confidence: avgConf,
                suggestedName: this.inferSemanticName(allFiles, allFns),
                functions: allFns,
            })
        }
        return result
    }

    /**
     * Split an oversized cluster by its next meaningful subdirectory level.
     * e.g. a cluster with files from apps/web/components AND apps/web/app AND
     * apps/web/lib should become 3 separate modules.
     */
    private splitOversizedCluster(cluster: ModuleCluster, baseKey: string, threshold: number): ModuleCluster[] {
        const root = (this._projectRoot ?? '').split('/').filter(Boolean)
        const baseDepth = baseKey.split('/').filter(Boolean).length
        // Target split depth = project-root depth + base depth + 1 more level
        const targetDepth = root.length + baseDepth + 1

        const subBuckets = new Map<string, string[]>()
        for (const file of cluster.files) {
            const segs = file.replace(/\\/g, '/').toLowerCase().split('/').filter(Boolean)
            // Pick the segment at targetDepth as the split key, fallback to baseKey
            const key = segs.length > targetDepth ? segs.slice(0, targetDepth + 1).join('/') : baseKey
            const b = subBuckets.get(key) ?? []
            b.push(file)
            subBuckets.set(key, b)
        }

        const result: ModuleCluster[] = []

        if (subBuckets.size <= 1) {
            // Flat directory with too many files. Fallback: Arbitrary chunking.
            for (let i = 0; i < cluster.files.length; i += threshold) {
                const chunkFiles = cluster.files.slice(i, i + threshold)
                const fnIds = cluster.functions.filter(fn => {
                    const node = this.graph.nodes.get(fn)
                    return node?.file && chunkFiles.some(f => f.toLowerCase() === node.file.replace(/\\/g, '/').toLowerCase())
                })
                result.push({
                    id: `${cluster.id}-part${Math.floor(i / threshold) + 1}`,
                    files: chunkFiles,
                    confidence: this.computeClusterConfidence(chunkFiles),
                    suggestedName: `${cluster.suggestedName} Part ${Math.floor(i / threshold) + 1}`,
                    functions: fnIds,
                    parentId: cluster.id,
                })
            }
            return result
        }

        for (const [, subFiles] of subBuckets) {
            const fnIds = cluster.functions.filter(fn => {
                const node = this.graph.nodes.get(fn)
                return node?.file && subFiles.some(f => f.toLowerCase() === node.file.replace(/\\/g, '/').toLowerCase())
            })
            result.push({
                id: this.inferClusterId(subFiles),
                files: subFiles,
                confidence: this.computeClusterConfidence(subFiles),
                suggestedName: this.inferSemanticName(subFiles, fnIds),
                functions: fnIds,
                parentId: cluster.id,
            })
        }
        return result
    }

    private buildDirectoryClusters(fileNodes: string[]): ModuleCluster[] {
        const buckets = new Map<string, string[]>()
        for (const file of fileNodes) {
            const filePath = this.getNodeFile(file)
            // Group by FIRST 3 non-trivial path segments relative to project root
            const norm = filePath.replace(/\\/g, '/').toLowerCase()
            const root = (this._projectRoot ?? '').split('/').filter(Boolean)
            const allSegs = norm.split('/').filter(Boolean)
            const rootLen = root.every((seg, i) => seg === allSegs[i]) ? root.length : 0
            const rel = allSegs.slice(rootLen)
            const isDriveLetter = (s: string) => /^[a-z]:?$/.test(s)
            const meaningful = rel.filter(s => s && !isDriveLetter(s) && !TRIVIAL_PATH_SEGMENTS.has(s))
            // Use first 3 meaningful segments (drop filename)
            const dirSegs = meaningful.filter(s => !s.includes('.')).slice(0, 3)
            const key = dirSegs.join('-') || this.getDirSegments(filePath)
            const b = buckets.get(key) ?? []
            b.push(file)
            buckets.set(key, b)
        }

        const clusters: ModuleCluster[] = []
        for (const [id, bucket] of buckets) {
            const filePaths = bucket.map(f => this.getNodeFile(f))
            const fns = this.getFunctionIdsForFiles(bucket)
            clusters.push({
                id,
                files: filePaths,
                confidence: this.computeClusterConfidence(bucket),
                suggestedName: this.inferSemanticName(filePaths, fns),
                functions: fns,
            })
        }
        return clusters.sort((a, b) => b.confidence - a.confidence)
    }

    // ─── Semantic Naming ──────────────────────────────────────────────────────

    /**
     * Score each domain against the word bag built from function names,
     * file basenames, directory names, and purpose strings.
     */
    private inferSemanticName(filePaths: string[], functionIds: string[]): string {
        // Function names + purpose strings from graph metadata
        const fnWords: string[] = []
        for (const id of functionIds) {
            const node = this.graph.nodes.get(id)
            if (node?.name) fnWords.push(node.name)
            if (node?.metadata?.purpose) fnWords.push(node.metadata.purpose)
        }

        // Purpose strings from existing lock (extra signal)
        if (this.existingLock?.functions) {
            for (const id of functionIds) {
                const fn = this.existingLock.functions[id]
                if (fn?.purpose) fnWords.push(fn.purpose)
            }
        }

        // File basenames + directory segments
        const fileNames = filePaths.map(f => {
            const base = f.replace(/\\/g, '/').split('/').pop() ?? ''
            return base.replace(/\.[^.]+$/, '')
        })
        const dirNames = filePaths.flatMap(f => {
            const parts = f.replace(/\\/g, '/').split('/')
            return parts.slice(0, -1)
                .filter(d => d && !TRIVIAL_PATH_SEGMENTS.has(d.toLowerCase()) &&
                    !/^[a-z]:?$/.test(d))
        })

        const wordBag = this.buildWordBag([...fnWords, ...fileNames, ...dirNames])

        const scores: [string, number][] = []
        for (const [domain, keywords] of DOMAIN_KEYWORDS) {
            let score = 0
            for (const kw of keywords) {
                for (const word of wordBag) {
                    if (word === kw || word.includes(kw) || kw.includes(word)) score++
                }
            }
            if (score > 0) scores.push([domain, score])
        }
        scores.sort((a, b) => b[1] - a[1])

        if (scores.length >= 2 && scores[0][1] > 1 && scores[1][1] > 1 &&
            scores[1][1] >= scores[0][1] * 0.5) {
            return `${scores[0][0]} & ${scores[1][0]}`
        }
        if (scores.length >= 1 && scores[0][1] > 0) return scores[0][0]

        return this.inferClusterNameFromDir(filePaths)
    }

    private inferClusterNameFromDir(filePaths: string[]): string {
        const dir = this.inferClusterId(filePaths)
        return dir.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    }

    private buildWordBag(identifiers: string[]): string[] {
        const words: string[] = []
        for (const id of identifiers) {
            const split = id
                .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
                .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
                .split(/[\s_\-./\\]+/)
                .map(w => w.toLowerCase())
                .filter(w => w.length > 1)
            words.push(...split)
        }
        return words
    }
}
