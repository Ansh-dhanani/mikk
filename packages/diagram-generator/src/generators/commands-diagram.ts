import type { MikkContract, MikkLock } from '@getmikk/core'

/**
 * Generates a Mermaid mindmap of all mikk CLI commands grouped by category.
 * Does not depend on contract or lock data — it is a static reference diagram.
 */
export class CommandsDiagramGenerator {
    // contract/lock kept for interface consistency with other generators
    constructor(
        private _contract?: MikkContract,
        private _lock?: MikkLock,
    ) {}

    generate(): string {
        return `mindmap
  root((mikk))
    Setup
      mikk init
        Scan project
        Build dependency graph
        Generate all artifacts
      mikk analyze
        Re-analyze after changes
        Update lock file
      mikk watch
        Live file watcher daemon
        Incremental updates
        100ms debounce
      mikk diff
        Files changed since last analysis
      mikk remove
        Uninstall mikk
        Delete all artifacts
    Health
      mikk stats
        Per-module metrics
        Function counts
        Dead code %
      mikk doctor
        7-point diagnostic check
        Config validation
        Lock freshness
      mikk dead-code
        Unused functions
        Filter by module
    Architecture
      mikk ci
        Exit non-zero on violations
        CI pipeline gate
      mikk ci --strict
        Also enforce dead code threshold
      mikk ci --format json
        Machine-readable output
      mikk contract validate
        Constraint violations
        Drift detection
      mikk contract show-boundaries
        Cross-module dependencies
    Context
      mikk context query
        Architecture question
        Graph-traced response
      mikk context impact
        Blast radius of a file change
        Classified by severity
      mikk context for
        Token-budgeted task context
    Refactoring
      mikk intent
        Pre-flight a refactor
        Detect conflicts before coding
      mikk rename
        Coordinated multi-file rename
        Find all call sites
    MCP Server
      mikk mcp
        Start MCP server
        22 tools available
      mikk mcp install
        Install into Claude Desktop
        Install into Cursor
    Visualization
      mikk visualize all
        Regenerate all diagrams
        7 diagram types
      mikk visualize module
        Per-module call graph
        Public API capsule
      mikk visualize commands
        This diagram
    Decisions
      mikk adr list
        All architectural decisions
      mikk adr add
        New ADR
      mikk adr get
        Details for a specific ADR
`
    }
}
