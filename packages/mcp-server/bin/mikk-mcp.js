#!/usr/bin/env node

/**
 * Standalone MCP server binary.
 * Usage: mikk-mcp --project /path/to/project
 */

import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)

// Parse --project flag
let projectRoot = process.cwd()
const idx = process.argv.indexOf('--project')
if (idx !== -1 && process.argv[idx + 1]) {
    projectRoot = process.argv[idx + 1]
}

process.env.MIKK_PROJECT_ROOT = projectRoot

// Load the CJS bundle (auto-starts stdio server via src/index.ts)
require('../dist/index.cjs')
