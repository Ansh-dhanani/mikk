/**
 * Analysis modules - Type Flow and Taint Analysis for semantic code understanding
 */

export { TypeFlowAnalyzer } from './type-flow.js'
export type { TypeFlowInfo, TypeParam, TypeEdge, TypeFlowResult } from './type-flow.js'

export { TaintAnalyzer } from './taint-analysis.js'
export type { TaintSource, TaintSink, TaintFlow, DataFlowResult } from './taint-analysis.js'
