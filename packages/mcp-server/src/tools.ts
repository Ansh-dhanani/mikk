/**
 * tools.ts — Barrel entry point for all MCP tools.
 *
 * Each tool category lives in its own file under ./tools/.
 * This file imports and calls each register function.
 *
 * Tool inventory (37 tools):
 *
 * SESSION (4)      — get_session_context, get_project_overview, token_stats, get_changes
 * CONTEXT (1)      — query_context
 * NAVIGATION (8)   — list_modules, get_module_detail, get_function_detail,
 *                    get_class_detail, get_generic_detail, get_routes, list_files, get_call_graph
 * SEARCH (8)       — search_functions, find_function, find_by_signature, find_by_location,
 *                    find_similar, semantic_search, search_rich, bulk_query
 * FILES (3)        — get_file, read_file, file_diff
 * SAFETY (4)       — before_edit, impact_analysis, get_constraints, find_usages
 * ANALYSIS (2)     — dead_code, get_complexity
 * SECURITY (2)     — secrets_scan, secrets_replace
 * REFACTOR (2)     — rename, git_diff_impact
 * PLANNING (3)     — scope_check, explain_risk, change_plan
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerSessionTools }    from './tools/session.js'
import { registerContextTools }    from './tools/context.js'
import { registerNavigationTools } from './tools/navigation.js'
import { registerSearchTools }     from './tools/search.js'
import { registerFileTools }       from './tools/files.js'
import { registerSafetyTools }     from './tools/safety.js'
import { registerAnalysisTools }   from './tools/analysis.js'
import { registerSecurityTools }   from './tools/security.js'
import { registerRefactorTools }   from './tools/refactor.js'
import { registerPlanningTools }   from './tools/planning.js'

export function registerTools(server: McpServer, projectRoot: string): void {
    registerSessionTools(server, projectRoot)
    registerContextTools(server, projectRoot)
    registerNavigationTools(server, projectRoot)
    registerSearchTools(server, projectRoot)
    registerFileTools(server, projectRoot)
    registerSafetyTools(server, projectRoot)
    registerAnalysisTools(server, projectRoot)
    registerSecurityTools(server, projectRoot)
    registerRefactorTools(server, projectRoot)
    registerPlanningTools(server, projectRoot)
}
