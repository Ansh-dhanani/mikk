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
