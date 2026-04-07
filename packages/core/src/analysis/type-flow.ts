/**
 * Type Flow Analysis — tracks type propagation through function calls
 * and provides type-aware code understanding beyond syntactic parsing.
 */

import type { MikkLock, MikkLockFunction } from '../contract/schema.js'
import type { DependencyGraph, GraphEdge } from '../graph/types.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TypeFlowInfo {
  /** Function ID */
  functionId: string
  /** Inferred parameter types */
  paramTypes: TypeParam[]
  /** Inferred return type */
  returnType: string
  /** Types that flow into this function from callers */
  incomingTypes: TypeEdge[]
  /** Types that flow out to callees */
  outgoingTypes: TypeEdge[]
  /** Type confidence score (0-1) */
  confidence: number
}

export interface TypeParam {
  name: string
  type: string
  source: 'annotation' | 'inference' | 'usage'
  confidence: number
}

export interface TypeEdge {
  from: string
  to: string
  type: string
  confidence: number
}

export interface TypeFlowResult {
  flows: Map<string, TypeFlowInfo>
  summary: {
    totalFunctions: number
    typedFunctions: number
    inferredFunctions: number
    averageConfidence: number
  }
}

// ---------------------------------------------------------------------------
// Type Flow Analyzer
// ---------------------------------------------------------------------------

export class TypeFlowAnalyzer {
  private lock: MikkLock
  private graph: DependencyGraph

  constructor(lock: MikkLock, graph: DependencyGraph) {
    this.lock = lock
    this.graph = graph
  }

  /**
   * Analyze type flow across the entire codebase.
   */
  analyze(): TypeFlowResult {
    const flows = new Map<string, TypeFlowInfo>()
    const allFunctions = Object.values(this.lock.functions)

    // Phase 1: Extract explicit type annotations
    for (const fn of allFunctions) {
      flows.set(fn.id, this.extractExplicitTypes(fn))
    }

    // Phase 2: Propagate types through call graph
    this.propagateTypes(flows)

    // Phase 3: Compute summary statistics
    const summary = this.computeSummary(flows)

    return { flows, summary }
  }

  /**
   * Get type flow for a specific function.
   */
  getFunctionFlow(functionId: string): TypeFlowInfo | null {
    const result = this.analyze()
    return result.flows.get(functionId) ?? null
  }

  /**
   * Find all functions that return a specific type.
   */
  findFunctionsByReturnType(typeName: string): MikkLockFunction[] {
    const result = this.analyze()
    const matches: MikkLockFunction[] = []

    for (const [fnId, flow] of result.flows) {
      if (flow.returnType.toLowerCase().includes(typeName.toLowerCase())) {
        const fn = this.lock.functions[fnId]
        if (fn) matches.push(fn)
      }
    }

    return matches
  }

  /**
   * Find all functions that accept a specific parameter type.
   */
  findFunctionsByParamType(typeName: string): MikkLockFunction[] {
    const result = this.analyze()
    const matches: MikkLockFunction[] = []

    for (const [fnId, flow] of result.flows) {
      for (const param of flow.paramTypes) {
        if (param.type.toLowerCase().includes(typeName.toLowerCase())) {
          const fn = this.lock.functions[fnId]
          if (fn) matches.push(fn)
          break
        }
      }
    }

    return matches
  }

  /**
   * Extract explicit type annotations from function metadata.
   */
  private extractExplicitTypes(fn: MikkLockFunction): TypeFlowInfo {
    const paramTypes: TypeParam[] = []

    if (fn.params) {
      for (const param of fn.params) {
        paramTypes.push({
          name: param.name,
          type: param.type || 'unknown',
          source: param.type ? 'annotation' : 'inference',
          confidence: param.type ? 1.0 : 0.3,
        })
      }
    }

    return {
      functionId: fn.id,
      paramTypes,
      returnType: fn.returnType || 'unknown',
      incomingTypes: [],
      outgoingTypes: [],
      confidence: this.computeConfidence(paramTypes, fn.returnType),
    }
  }

  /**
   * Propagate types through the call graph.
   */
  private propagateTypes(flows: Map<string, TypeFlowInfo>): void {
    // Build type propagation edges
    for (const [fnId, flow] of flows) {
      const fn = this.lock.functions[fnId]
      if (!fn) continue

      // Find outgoing calls
      for (const calleeId of fn.calls || []) {
        const calleeFlow = flows.get(calleeId)
        if (!calleeFlow) continue

        // Create type edges for parameters
        for (let i = 0; i < calleeFlow.paramTypes.length; i++) {
          const param = calleeFlow.paramTypes[i]
          if (param.type !== 'unknown') {
            flow.outgoingTypes.push({
              from: fnId,
              to: calleeId,
              type: param.type,
              confidence: param.confidence * 0.8,
            })
          }
        }

        // Create type edges for return type
        if (calleeFlow.returnType !== 'unknown') {
          flow.incomingTypes.push({
            from: calleeId,
            to: fnId,
            type: calleeFlow.returnType,
            confidence: calleeFlow.confidence * 0.8,
          })
        }
      }
    }
  }

  /**
   * Compute confidence score for type information.
   */
  private computeConfidence(paramTypes: TypeParam[], returnType?: string): number {
    let totalConfidence = 0
    let count = 0

    for (const param of paramTypes) {
      totalConfidence += param.confidence
      count++
    }

    if (returnType && returnType !== 'unknown') {
      totalConfidence += 0.9
      count++
    }

    return count > 0 ? totalConfidence / count : 0.1
  }

  /**
   * Compute summary statistics.
   */
  private computeSummary(flows: Map<string, TypeFlowInfo>): TypeFlowResult['summary'] {
    const totalFunctions = flows.size
    let typedFunctions = 0
    let inferredFunctions = 0
    let totalConfidence = 0

    for (const flow of flows.values()) {
      if (flow.returnType !== 'unknown') {
        typedFunctions++
      }

      const hasInferred = flow.paramTypes.some(p => p.source === 'inference' || p.source === 'usage')
      if (hasInferred) {
        inferredFunctions++
      }

      totalConfidence += flow.confidence
    }

    return {
      totalFunctions,
      typedFunctions,
      inferredFunctions,
      averageConfidence: totalFunctions > 0 ? totalConfidence / totalFunctions : 0,
    }
  }
}
