import * as path from 'node:path'
import type { DependencyGraph, ModuleCluster, GraphNode } from './types.js'

// ─── Domain keyword maps for semantic naming ────────────────────────
// Each entry maps a human-readable domain label to keywords found in
// function names and file basenames.  The first match wins.
const DOMAIN_KEYWORDS: [string, string[]][] = [
    // Core backends
    ['Authentication', ['auth', 'login', 'logout', 'signin', 'signup', 'session', 'jwt', 'token', 'credential', 'password', 'oauth', 'sso']],
    ['Encryption', ['encrypt', 'decrypt', 'cipher', 'aes', 'argon', 'derive', 'salt', 'envelope', 'hmac']],
    ['Database', ['prisma', 'query', 'queries', 'db', 'database', 'repository', 'knex', 'sequelize', 'drizzle', 'typeorm', 'migration', 'seed']],
    ['API', ['api', 'endpoint', 'middleware', 'handler', 'route', 'controller', 'request', 'response', 'rest', 'openapi']],
    ['Validation', ['validate', 'validator', 'schema', 'assert', 'sanitize', 'zod', 'yup', 'joi']],
    ['Config', ['config', 'env', 'settings', 'constants', 'options', 'feature', 'flag']],
    ['Utils', ['util', 'utils', 'helper', 'helpers', 'format', 'convert', 'transform', 'lib', 'common', 'shared']],
    ['Secrets', ['secret', 'vault', 'credential', 'key', 'keychain', 'encrypt', 'kms']],
    ['Testing', ['test', 'spec', 'mock', 'fixture', 'stub', 'fake', 'factory', 'seed']],

    // Frontend / UI
    ['Navigation', ['sidebar', 'header', 'footer', 'nav', 'breadcrumb', 'menu', 'topbar', 'toolbar', 'appbar']],
    ['Layout', ['layout', 'shell', 'frame', 'wrapper', 'page', 'container', 'grid', 'template']],
    ['Forms', ['form', 'input', 'select', 'checkbox', 'radio', 'textarea', 'field', 'datepicker']],
    ['Hooks', ['hook', 'useauth', 'usestate', 'useeffect', 'usememo', 'usequery', 'usemutation', 'useform', 'composable']],
    ['Providers', ['provider', 'context', 'theme', 'store', 'reducer', 'zustand', 'pinia']],
    ['Components', ['component', 'button', 'modal', 'dialog', 'card', 'toast', 'toggle', 'badge', 'tab', 'alert', 'avatar', 'widget']],
    ['Dashboard', ['dashboard', 'chart', 'metric', 'stat', 'analytics', 'widget', 'overview', 'report']],
    ['Media', ['image', 'video', 'audio', 'upload', 'gallery', 'zoom', 'embed', 'asset']],
    ['Notifications', ['notification', 'toast', 'alert', 'snackbar', 'banner', 'push']],

    // Business domains
    ['Project Management', ['project', 'member', 'team', 'workspace', 'organization', 'invite', 'role', 'permission']],
    ['Portfolio', ['portfolio', 'resume', 'experience', 'certification', 'award', 'testimonial', 'social', 'profile', 'bio']],
    ['Blog', ['blog', 'post', 'article', 'mdx', 'markdown', 'rss', 'feed', 'author', 'category', 'tag', 'comment']],
    ['Sponsors', ['sponsor', 'donation', 'patron', 'tier', 'backer']],
    ['Search', ['search', 'filter', 'sort', 'query', 'autocomplete', 'fuzzy', 'index', 'algolia']],
    ['Payments', ['payment', 'stripe', 'billing', 'invoice', 'subscription', 'checkout', 'cart', 'price', 'order']],

    // CLI / Tooling
    ['CLI', ['command', 'arg', 'flag', 'prompt', 'subcommand', 'repl', 'cli', 'yargs', 'commander', 'inquirer']],

    // AI / ML
    ['AI & ML', ['model', 'train', 'predict', 'inference', 'pipeline', 'tokenizer', 'embedding', 'llm', 'openai', 'anthropic', 'vector']],

    // Messaging / Queue
    ['Messaging', ['queue', 'worker', 'consumer', 'producer', 'broker', 'pubsub', 'event', 'subscriber', 'publisher', 'bullmq', 'kafka', 'rabbitmq']],

    // Caching
    ['Caching', ['cache', 'redis', 'memcached', 'ttl', 'invalidate', 'lru']],

    // Logging / Monitoring
    ['Logging', ['logger', 'log', 'trace', 'metric', 'telemetry', 'sentry', 'monitor', 'span']],

    // Scheduling
    ['Scheduling', ['cron', 'job', 'scheduler', 'background', 'recurring', 'interval']],

    // Storage / Files
    ['Storage', ['storage', 's3', 'bucket', 'blob', 'upload', 'download', 'stream', 'file', 'archive']],

    // Email
    ['Email', ['email', 'mail', 'smtp', 'sendgrid', 'mailer', 'template', 'newsletter']],

    // GraphQL / gRPC
    ['GraphQL', ['resolver', 'mutation', 'subscription', 'typedef', 'graphql', 'gql', 'apollo']],
    ['gRPC', ['grpc', 'rpc', 'protobuf', 'service', 'stub', 'proto']],

    // i18n / a11y
    ['Internationalization', ['i18n', 'locale', 'translation', 'intl', 'language', 'l10n']],
    ['Accessibility', ['a11y', 'aria', 'screenreader', 'focus', 'keyboard']],
]

/**
 * ClusterDetector — analyzes the dependency graph and groups files
 * into natural module clusters using greedy agglomeration with coupling scores.
 *
 * Algorithm (Section 4 of Mikk Technical Reference):
 * 1. Build a coupling matrix: coupling(A,B) = (edges between A,B) / (total edges of A + total edges of B)
 * 2. Sort files by total edge count (most connected first)
 * 3. Greedy agglomeration: seed clusters from most connected files,
 *    expand by pulling in strongly-coupled neighbors
 * 4. Orphan files go to single-file clusters with low confidence
 */
export class ClusterDetector {
    constructor(
        private graph: DependencyGraph,
        private minClusterSize: number = 2,
        private minCouplingScore: number = 0.15
    ) { }

    /** Returns groups of files that naturally belong together, sorted by confidence */
    detect(): ModuleCluster[] {
        const fileNodes = [...this.graph.nodes.values()].filter(n => n.type === 'file')
        if (fileNodes.length === 0) return []

        const files = fileNodes.map(n => n.id)
        const couplingMatrix = this.computeCouplingMatrix(files)
        const assigned = new Set<string>()
        const clusters: ModuleCluster[] = []

        // Sort files by total edge count (most connected first)
        const sortedFiles = [...files].sort((a, b) =>
            this.getTotalEdges(b) - this.getTotalEdges(a)
        )

        for (const seedFile of sortedFiles) {
            if (assigned.has(seedFile)) continue

            // Start a new cluster with this file as seed
            const cluster: string[] = [seedFile]
            const tentative = new Set<string>([seedFile])

            // Expand: find files strongly coupled to any file in this cluster
            let expanded = true
            while (expanded) {
                expanded = false

                for (const clusterFile of [...cluster]) {
                    const partners = couplingMatrix.get(clusterFile) || new Map()

                    for (const [candidate, score] of partners) {
                        if (assigned.has(candidate) || tentative.has(candidate)) continue
                        if (score < this.minCouplingScore) continue

                        // Is this candidate more coupled to this cluster than to others?
                        const clusterAffinity = this.computeClusterAffinity(
                            candidate, cluster, couplingMatrix
                        )
                        const bestOutsideAffinity = this.computeBestOutsideAffinity(
                            candidate, cluster, couplingMatrix, assigned
                        )

                        if (clusterAffinity > bestOutsideAffinity) {
                            cluster.push(candidate)
                            tentative.add(candidate)
                            expanded = true
                        }
                    }
                }
            }

            if (cluster.length >= this.minClusterSize) {
                // Mark all files in this cluster as assigned
                for (const f of cluster) assigned.add(f)
                const filePathsForCluster = cluster.map(id => this.getNodeFile(id))
                const functionIds = this.getFunctionIdsForFiles(cluster)
                clusters.push({
                    id: this.inferClusterId(filePathsForCluster),
                    files: filePathsForCluster,
                    confidence: this.computeClusterConfidence(cluster),
                    suggestedName: this.inferSemanticName(filePathsForCluster, functionIds),
                    functions: functionIds,
                })
            }
        }

        // Orphan files get their own single-file clusters
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

        // ── Post-process: merge clusters with the same base directory ──
        // Without this, a directory like `lib/` often fragments into
        // "Lib", "Lib (2)", "Lib (3)" which is useless for AI.
        const merged = this.mergeSiblingClusters(clusters)

        // Deduplicate cluster IDs — append numeric suffix if collision
        const seenIds = new Map<string, number>()
        for (const cluster of merged) {
            const baseId = cluster.id
            const count = seenIds.get(baseId) || 0
            seenIds.set(baseId, count + 1)
            if (count > 0) {
                cluster.id = `${baseId}-${count + 1}`
            }
        }

        // ── Disambiguate duplicate module names ──
        // When semantic naming produces the same label for different clusters
        // (e.g. "Search" × 3), append the distinctive directory segment.
        const nameCount = new Map<string, ModuleCluster[]>()
        for (const cluster of merged) {
            const existing = nameCount.get(cluster.suggestedName) || []
            existing.push(cluster)
            nameCount.set(cluster.suggestedName, existing)
        }
        for (const [name, dupes] of nameCount) {
            if (dupes.length <= 1) continue
            for (const cluster of dupes) {
                // Try to find a distinctive directory segment from the cluster ID
                // e.g. "packages-diagram-generator" → "Diagram Generator"
                const segments = cluster.id.split('-')
                    .filter(s => s !== 'packages' && s !== 'apps' && s !== 'src')
                const suffix = segments
                    .map(s => s.charAt(0).toUpperCase() + s.slice(1))
                    .join(' ')
                if (suffix && suffix !== name) {
                    cluster.suggestedName = `${name} (${suffix})`
                }
            }
        }

        return merged.sort((a, b) => b.confidence - a.confidence)
    }

    // ─── Coupling Matrix ──────────────────────────────────────────

    /**
     * Build coupling matrix: for every pair of files, compute
     * coupling(A,B) = (edges between A,B * 2) / (totalEdges(A) + totalEdges(B))
     */
    private computeCouplingMatrix(files: string[]): Map<string, Map<string, number>> {
        const matrix = new Map<string, Map<string, number>>()
        const fileEdgeCounts = new Map<string, number>()
        const pairCounts = new Map<string, number>()

        // Count total edges per file
        for (const fileId of files) {
            const outCount = (this.graph.outEdges.get(fileId) || []).length
            const inCount = (this.graph.inEdges.get(fileId) || []).length
            fileEdgeCounts.set(fileId, outCount + inCount)
        }

        const fileSet = new Set(files)

        // Count edges between each pair of files (file-level imports + function-level calls)
        for (const edge of this.graph.edges) {
            if (edge.type !== 'imports' && edge.type !== 'calls') continue

            const sourceFile = this.getFileForNode(edge.source)
            const targetFile = this.getFileForNode(edge.target)

            if (!sourceFile || !targetFile || sourceFile === targetFile) continue
            if (!fileSet.has(sourceFile) || !fileSet.has(targetFile)) continue

            // Increment pair count for both directions
            this.incrementPair(matrix, sourceFile, targetFile)
            this.incrementPair(matrix, targetFile, sourceFile)
        }

        // Normalize to coupling scores
        for (const [file, partners] of matrix) {
            const totalEdges = fileEdgeCounts.get(file) || 1
            for (const [partner, edgeCount] of partners) {
                const partnerEdges = fileEdgeCounts.get(partner) || 1
                const score = (edgeCount * 2) / (totalEdges + partnerEdges)
                partners.set(partner, score)
            }
        }

        return matrix
    }

    private incrementPair(matrix: Map<string, Map<string, number>>, a: string, b: string): void {
        if (!matrix.has(a)) matrix.set(a, new Map())
        const partners = matrix.get(a)!
        partners.set(b, (partners.get(b) || 0) + 1)
    }

    // ─── Affinity Computation ─────────────────────────────────────

    /** Average coupling score of a candidate to all files in the cluster */
    private computeClusterAffinity(
        candidate: string,
        cluster: string[],
        couplingMatrix: Map<string, Map<string, number>>
    ): number {
        const partners = couplingMatrix.get(candidate) || new Map()
        let totalScore = 0
        let count = 0
        for (const clusterFile of cluster) {
            const score = partners.get(clusterFile) || 0
            totalScore += score
            count++
        }
        return count > 0 ? totalScore / count : 0
    }

    /** Best coupling score of a candidate to any file NOT in the cluster and not yet assigned */
    private computeBestOutsideAffinity(
        candidate: string,
        cluster: string[],
        couplingMatrix: Map<string, Map<string, number>>,
        assigned: Set<string>
    ): number {
        const partners = couplingMatrix.get(candidate) || new Map()
        const clusterSet = new Set(cluster)
        let best = 0
        for (const [partner, score] of partners) {
            if (clusterSet.has(partner) || assigned.has(partner)) continue
            if (score > best) best = score
        }
        return best
    }

    // ─── Confidence ───────────────────────────────────────────────

    /**
     * Confidence = (internal edges) / (internal edges + external edges)
     * Score of 1.0 = perfectly self-contained
     * Score of 0.0 = all edges go outside
     */
    computeClusterConfidence(files: string[]): number {
        const fileSet = new Set(files)
        let internalEdges = 0
        let externalEdges = 0

        for (const file of files) {
            const outEdges = this.graph.outEdges.get(file) || []
            for (const edge of outEdges) {
                if (edge.type === 'imports') {
                    if (fileSet.has(edge.target)) {
                        internalEdges++
                    } else {
                        externalEdges++
                    }
                }
            }
        }

        // Also count function-level call edges
        for (const file of files) {
            const containEdges = this.graph.outEdges.get(file) || []
            for (const containEdge of containEdges) {
                if (containEdge.type === 'contains') {
                    const fnOutEdges = this.graph.outEdges.get(containEdge.target) || []
                    for (const callEdge of fnOutEdges) {
                        if (callEdge.type === 'calls') {
                            const targetNode = this.graph.nodes.get(callEdge.target)
                            if (targetNode && fileSet.has(targetNode.file)) {
                                internalEdges++
                            } else if (targetNode) {
                                externalEdges++
                            }
                        }
                    }
                }
            }
        }

        const total = internalEdges + externalEdges
        if (total === 0) return 0.5
        return internalEdges / total
    }

    // ─── Helpers ──────────────────────────────────────────────────

    /** Total edges (in + out) for a node */
    private getTotalEdges(nodeId: string): number {
        return (this.graph.outEdges.get(nodeId) || []).length +
            (this.graph.inEdges.get(nodeId) || []).length
    }

    /** Get the file path a node belongs to (for function/class nodes, return their file) */
    private getFileForNode(nodeId: string): string | null {
        const node = this.graph.nodes.get(nodeId)
        if (!node) return null
        if (node.type === 'file') return nodeId
        // For function/class/generic nodes, find their parent file
        return node.file || null
    }

    /** Get the file path from a file node ID (the node's .file property) */
    private getNodeFile(fileNodeId: string): string {
        const node = this.graph.nodes.get(fileNodeId)
        return node?.file || fileNodeId
    }

    /** Get all function IDs contained in a set of file node IDs */
    private getFunctionIdsForFiles(fileNodeIds: string[]): string[] {
        return fileNodeIds.flatMap(f => {
            const containEdges = this.graph.outEdges.get(f) || []
            return containEdges
                .filter(e => e.type === 'contains')
                .map(e => e.target)
        })
    }

    /** Infer a module ID from file paths (common directory prefix) */
    private inferClusterId(filePaths: string[]): string {
        if (filePaths.length === 0) return 'unknown'
        if (filePaths.length === 1) {
            return this.getDirSegments(filePaths[0])
        }
        // Find the longest common directory prefix
        const segments = filePaths.map(f => f.split('/'))
        const firstSegments = segments[0]
        let commonLen = 0
        for (let i = 0; i < firstSegments.length - 1; i++) {
            if (segments.every(s => s[i] === firstSegments[i])) {
                commonLen = i + 1
            } else {
                break
            }
        }
        const commonPath = firstSegments.slice(0, commonLen).join('/')
        return this.getDirSegments(commonPath || filePaths[0])
    }

    /**
     * Build a hyphenated module ID from the meaningful directory segments.
     * Skips "src" since it's a trivial container. Returns at most 3 segments.
     * e.g. "src/components/ui/button.tsx" → "components-ui"
     *      "src/lib/hooks/use-auth.ts"    → "lib-hooks"
     *      "features/auth/api/route.ts"   → "features-auth-api"
     */
    private getDirSegments(filePath: string): string {
        const parts = filePath.split('/')
        // Remove filename (last part with an extension)
        const dirs = parts.filter((p, i) => i < parts.length - 1 || !p.includes('.'))
        // Drop 'src' prefix — it carries no semantic meaning
        const meaningful = dirs.filter(d => d !== 'src' && d !== '')
        if (meaningful.length === 0) {
            // Fallback: use the filename without extension
            const last = parts[parts.length - 1]
            return last.replace(/\.[^.]+$/, '') || 'unknown'
        }
        // Take up to 3 segments for a unique but concise ID
        return meaningful.slice(0, 3).join('-')
    }

    // ─── Cluster Merging ──────────────────────────────────────────

    /**
     * Merge clusters that share the same base directory (first 1-2 segments).
     * This prevents fragmentation like "Lib", "Lib (2)", "Lib (3)" from
     * clumsy coupling-based splitting of files in the same directory.
     */
    private mergeSiblingClusters(clusters: ModuleCluster[]): ModuleCluster[] {
        const byBaseDir = new Map<string, ModuleCluster[]>()

        for (const cluster of clusters) {
            const base = this.getBaseDir(cluster.files)
            const existing = byBaseDir.get(base) || []
            existing.push(cluster)
            byBaseDir.set(base, existing)
        }

        const result: ModuleCluster[] = []
        for (const [baseDir, siblings] of byBaseDir) {
            if (siblings.length <= 1) {
                result.push(...siblings)
                continue
            }

            // Merge all siblings into one cluster
            const allFiles = siblings.flatMap(c => c.files)
            const allFunctions = siblings.flatMap(c => c.functions)
            const avgConfidence = siblings.reduce((sum, c) => sum + c.confidence, 0) / siblings.length
            const uniqueFiles = [...new Set(allFiles)]
            const uniqueFunctions = [...new Set(allFunctions)]

            result.push({
                id: this.getDirSegments(uniqueFiles[0]),
                files: uniqueFiles,
                confidence: avgConfidence,
                suggestedName: this.inferSemanticName(uniqueFiles, uniqueFunctions),
                functions: uniqueFunctions,
            })
        }

        return result
    }

    /** Get the base directory (first meaningful segment) for a set of files */
    private getBaseDir(files: string[]): string {
        if (files.length === 0) return 'unknown'
        // Find common prefix of all file paths
        const segments = files.map(f => f.split('/'))
        const first = segments[0]
        let commonLen = 0
        for (let i = 0; i < first.length - 1; i++) {
            if (segments.every(s => s[i] === first[i])) {
                commonLen = i + 1
            } else {
                break
            }
        }
        const common = first.slice(0, commonLen)
            .filter(d => d !== 'src' && d !== '')
        // Use the first 2 meaningful path segments as the "base"
        return common.slice(0, 2).join('/') || first.filter(d => d !== 'src' && d !== '')[0] || 'root'
    }

    // ─── Semantic Naming ──────────────────────────────────────────

    /**
     * Produce a human-meaningful module name by analyzing function names
     * and file basenames. Falls back to title-cased directory name.
     *
     * Algorithm:
     *   1. Collect all words from function labels and file basenames
     *   2. Score each domain from DOMAIN_KEYWORDS against the word bag
     *   3. Pick top 1–2 domains above threshold; combine them
     *   4. If no domain matches, fall back to directory-based name
     */
    private inferSemanticName(filePaths: string[], functionIds: string[]): string {
        // Collect words from function names
        const fnLabels = functionIds
            .map(id => this.graph.nodes.get(id)?.label ?? '')
            .filter(Boolean)

        // Collect file basenames without extension
        const fileNames = filePaths.map(f => {
            const basename = f.split('/').pop() || ''
            return basename.replace(/\.[^.]+$/, '')
        })

        // Also include directory segments (e.g. "blog" from "features/blog/hooks")
        const dirNames = filePaths.flatMap(f => {
            const parts = f.split('/')
            return parts.slice(0, -1).filter(d => d !== 'src' && d !== '')
        })

        // Build a lowercased word bag from all sources
        const wordBag = this.buildWordBag([...fnLabels, ...fileNames, ...dirNames])

        // Score each domain
        const scores: [string, number][] = []
        for (const [domain, keywords] of DOMAIN_KEYWORDS) {
            let score = 0
            for (const kw of keywords) {
                for (const word of wordBag) {
                    // Exact match or word contains keyword (e.g. "hooks" contains "hook")
                    // Do NOT check kw.includes(word) — too loose ("use" would match "usequery")
                    if (word === kw || word.includes(kw)) {
                        score++
                    }
                }
            }
            if (score > 0) scores.push([domain, score])
        }

        scores.sort((a, b) => b[1] - a[1])

        if (scores.length >= 2 && scores[0][1] > 1 && scores[1][1] > 1 &&
            scores[1][1] >= scores[0][1] * 0.5) {
            // Two strong domains — combine them
            return `${scores[0][0]} & ${scores[1][0]}`
        }
        if (scores.length >= 1 && scores[0][1] > 0) {
            return scores[0][0]
        }

        // Fallback: directory-based name
        return this.inferClusterNameFromDir(filePaths)
    }

    /** Fallback: infer a human-readable cluster name from directory paths */
    private inferClusterNameFromDir(filePaths: string[]): string {
        const dir = this.inferClusterId(filePaths)
        return dir
            .replace(/[-_]/g, ' ')
            .replace(/\b\w/g, c => c.toUpperCase())
    }

    /** Split identifiers and file names into lowercase words */
    private buildWordBag(identifiers: string[]): string[] {
        const words: string[] = []
        for (const id of identifiers) {
            // Split camelCase/PascalCase
            const split = id
                .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
                .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
                .split(/[\s_\-\.]+/)
                .map(w => w.toLowerCase())
                .filter(w => w.length > 1)
            words.push(...split)
        }
        return words
    }
}
