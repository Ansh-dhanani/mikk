/**
 * Graph types — nodes, edges, and the dependency graph itself.
 */

export type NodeType = 'function' | 'file' | 'module' | 'class' | 'generic'
export type EdgeType = 'calls' | 'imports' | 'exports' | 'contains'

/** A single node in the dependency graph */
export interface GraphNode {
    id: string              // "fn:src/auth/verify.ts:verifyToken"
    type: NodeType
    label: string           // "verifyToken"
    file: string            // "src/auth/verify.ts"
    moduleId?: string       // "auth" — which declared module this belongs to
    metadata: {
        startLine?: number
        endLine?: number
        isExported?: boolean
        isAsync?: boolean
        hash?: string
        purpose?: string
        params?: { name: string; type: string; optional?: boolean }[]
        returnType?: string
        edgeCasesHandled?: string[]
        errorHandling?: { line: number; type: 'try-catch' | 'throw'; detail: string }[]
        detailedLines?: { startLine: number; endLine: number; blockType: string }[]
    }
}

/** A single edge in the dependency graph */
export interface GraphEdge {
    source: string          // "fn:src/auth/verify.ts:verifyToken"
    target: string          // "fn:src/utils/jwt.ts:jwtDecode"
    type: EdgeType
    weight?: number         // How often this call happens (for coupling metrics)
    confidence?: number     // 0.0–1.0: 1.0 = direct AST call, 0.8 = via interface, 0.5 = fuzzy/inferred
}

/** The full dependency graph */
export interface DependencyGraph {
    nodes: Map<string, GraphNode>
    edges: GraphEdge[]
    outEdges: Map<string, GraphEdge[]>   // node → [edges going out]
    inEdges: Map<string, GraphEdge[]>    // node → [edges coming in]
}

/** Risk level for an impacted node */
export type RiskLevel = 'critical' | 'high' | 'medium' | 'low'

/** A single node in the classified impact result */
export interface ClassifiedImpact {
    nodeId: string
    label: string
    file: string
    moduleId?: string
    risk: RiskLevel
    depth: number           // hops from change
}

/** Result of impact analysis */
export interface ImpactResult {
    changed: string[]        // The directly changed nodes
    impacted: string[]       // Everything that depends on changed nodes
    depth: number            // How many hops from change to furthest impact
    confidence: 'high' | 'medium' | 'low'
    /** Risk-classified breakdown of impacted nodes */
    classified: {
        critical: ClassifiedImpact[]
        high: ClassifiedImpact[]
        medium: ClassifiedImpact[]
        low: ClassifiedImpact[]
    }
}

/** A cluster of files that naturally belong together */
export interface ModuleCluster {
    id: string
    files: string[]
    confidence: number      // 0.0 to 1.0
    suggestedName: string   // inferred from folder names
    functions: string[]     // function IDs in this cluster
}
