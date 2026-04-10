#!/usr/bin/env node
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { spawn } from 'node:child_process'

const PROJECT_ROOT = process.cwd()
const OUTPUT_FILE = path.join(PROJECT_ROOT, '.mikk', 'cli-sessions.json')

const session = {
  timestamp: new Date().toISOString(),
  projectRoot: PROJECT_ROOT,
  runs: []
}

function extractMetrics(output) {
  const metrics = {}
  
  // XML format: <seeds_found>50</seeds_found>
  const xmlSeedsMatch = output.match(/<seeds[_-]?found>(\d+)</i)
  const xmlFuncsMatch = output.match(/<functions[_-]?selected>(\d+)</i)
  const xmlTotalMatch = output.match(/of\s*(\d+)\s*functions/i)
  const xmlTokensMatch = output.match(/<estimated[_-]?tokens>([\d.]+)</i)
  
  // Plain text format
  const seedsMatch = output.match(/seeds?_?found[:\s]+(\d+)/i)
  const funcsMatch = output.match(/functions?_?selected[:\s]+(\d+)\s*(?:\/\s*(\d+))?/i)
  const tokensMatch = output.match(/estimated?_?tokens[:\s]+([\d.]+)/i)
  const impactedMatch = output.match(/impacted[:\s]+(\d+)/i)
  const depthMatch = output.match(/depth[:\s]+(\d+)/i)
  const passedMatch = output.match(/(\d+)\s*(?:of\s*\d+)?\s*passed/i)
  const failedMatch = output.match(/(\d+)\s*failed/i)
  const checksMatch = output.match(/checks?[:\s]+(\d+)/i)
  const deadMatch = output.match(/dead.*?(\d+(?:\.\d+)?%)/i)
  const changesMatch = output.match(/(\d+)\s*change/i)
  
  if (xmlSeedsMatch) metrics.seedsFound = parseInt(xmlSeedsMatch[1])
  else if (seedsMatch) metrics.seedsFound = parseInt(seedsMatch[1])
  
  if (xmlFuncsMatch) {
    metrics.functionsSelected = parseInt(xmlFuncsMatch[1])
    if (xmlTotalMatch) metrics.totalFunctions = parseInt(xmlTotalMatch[1])
  } else if (funcsMatch) {
    metrics.functionsSelected = parseInt(funcsMatch[1])
    if (funcsMatch[2]) metrics.totalFunctions = parseInt(funcsMatch[2])
  }
  
  if (xmlTokensMatch) metrics.estimatedTokens = parseFloat(xmlTokensMatch[1])
  else if (tokensMatch) metrics.estimatedTokens = parseFloat(tokensMatch[1])
  
  if (impactedMatch) metrics.impactedNodes = parseInt(impactedMatch[1])
  if (depthMatch) metrics.depth = parseInt(depthMatch[1])
  if (passedMatch) metrics.passed = parseInt(passedMatch[1])
  if (failedMatch) metrics.failed = parseInt(failedMatch[1])
  if (checksMatch) metrics.checks = parseInt(checksMatch[1])
  if (deadMatch) metrics.deadCodePercent = deadMatch[1]
  if (changesMatch) metrics.changes = parseInt(changesMatch[1])
  
  return metrics
}

async function runCommand(cmd, args, description, input) {
  const startTime = Date.now()
  // Quote args properly for shell
  const quotedArgs = args.map(a => {
    const s = String(a)
    if (s.includes(' ') || s.includes('"') || s.includes('&') || s.includes('|') || s.includes('<')) {
      return `"${s.replace(/"/g, '\\"')}"`
    }
    return s
  })
  const fullCommand = [cmd, ...quotedArgs].join(' ')
  
  const result = {
    timestamp: new Date().toISOString(),
    command: fullCommand,
    description,
    input,
    exitCode: null,
    stdout: '',
    stderr: '',
    duration: 0,
    metrics: {}
  }

  return new Promise((resolve) => {
    const proc = spawn(fullCommand, {
      cwd: PROJECT_ROOT,
      shell: true,
      windowsHide: true
    })
    let stdout = ''
    let stderr = ''

    proc.stdout.on('data', (d) => { stdout += d.toString() })
    proc.stderr.on('data', (d) => { stderr += d.toString() })

    proc.on('close', (code) => {
      result.exitCode = code
      result.stdout = stdout
      result.stderr = stderr
      result.duration = Date.now() - startTime
      result.metrics = extractMetrics(stdout + stderr)
      resolve(result)
    })

    proc.on('error', (err) => {
      result.exitCode = -1
      result.stderr = err.message
      result.duration = Date.now() - startTime
      resolve(result)
    })
  })
}

async function main() {
  const cli = process.platform === 'win32' ? 'node' : 'node'
  const mikkBin = path.resolve(PROJECT_ROOT, 'packages', 'cli', 'bin', 'mikk.js')
  const cliArgs = [mikkBin]

  const testCases = [
    // ── Edge cases for context query ──────────────────────────────────────────
    { name: 'query_empty', args: [...cliArgs, 'context', 'query', ''], desc: 'Empty query string' },
    { name: 'query_unicode', args: [...cliArgs, 'context', 'query', '你好世界'], desc: 'Unicode input' },
    { name: 'query_special_chars', args: [...cliArgs, 'context', 'query', 'test[and]more'], desc: 'Special shell chars' },
    { name: 'query_long', args: [...cliArgs, 'context', 'query', 'a'.repeat(1000)], desc: 'Very long query' },
    { name: 'query_spaces', args: [...cliArgs, 'context', 'query', '   '], desc: 'Only spaces' },
    { name: 'query_numbers', args: [...cliArgs, 'context', 'query', '123456789'], desc: 'Only numbers' },
    { name: 'query_slashes', args: [...cliArgs, 'context', 'query', '../.../../../etc/passwd'], desc: 'Path traversal attempt' },
    { name: 'query_multi_word', args: [...cliArgs, 'context', 'query', 'how does import resolution work'], desc: 'Multi-word query' },
    
    // ── Token budget edge cases ────────────────────────────────────────────────
    { name: 'query_tokens_0', args: [...cliArgs, 'context', 'query', 'parser', '--tokens', '0'], desc: 'Zero tokens' },
    { name: 'query_tokens_huge', args: [...cliArgs, 'context', 'query', 'parser', '--tokens', '999999'], desc: 'Huge token budget' },
    { name: 'query_tokens_negative', args: [...cliArgs, 'context', 'query', 'parser', '--tokens', '-100'], desc: 'Negative tokens' },
    
    // ── Hops edge cases ────────────────────────────────────────────────────────
    { name: 'query_hops_0', args: [...cliArgs, 'context', 'query', 'parser', '--hops', '0'], desc: 'Zero hops' },
    { name: 'query_hops_100', args: [...cliArgs, 'context', 'query', 'parser', '--hops', '100'], desc: 'Very high hops' },
    { name: 'query_hops_negative', args: [...cliArgs, 'context', 'query', 'parser', '--hops', '-5'], desc: 'Negative hops' },
    
    // ── Strict mode combinations ───────────────────────────────────────────────
    { name: 'query_strict_no_match', args: [...cliArgs, 'context', 'query', 'xyzzy_plugh_nonexistent_function_12345'], desc: 'Strict with no match' },
    { name: 'query_strict_exact', args: [...cliArgs, 'context', 'query', 'extract parse TypeScript', '--strict'], desc: 'Strict with matches' },
    { name: 'query_strict_all_keywords', args: [...cliArgs, 'context', 'query', 'parser resolver', '--strict', '--all-keywords'], desc: 'Strict with all keywords' },
    { name: 'query_fail_fast', args: [...cliArgs, 'context', 'query', 'nonexistent_xyz', '--strict', '--fail-fast'], desc: 'Strict fail-fast' },
    
    // ── Must/keywords edge cases ───────────────────────────────────────────────
    { name: 'query_must_empty', args: [...cliArgs, 'context', 'query', 'parser', '--must', ''], desc: 'Empty must terms' },
    { name: 'query_must_many', args: [...cliArgs, 'context', 'query', 'parser', '--must', 'a,b,c,d,e,f,g,h'], desc: 'Many must terms' },
    { name: 'query_must_special', args: [...cliArgs, 'context', 'query', 'parser', '--must', 'test,mock'], desc: 'Must with special chars' },
    { name: 'query_min_keywords_high', args: [...cliArgs, 'context', 'query', 'parser', '--min-keywords', '999'], desc: 'Min keywords > available' },
    
    // ── Provider edge cases ────────────────────────────────────────────────────
    { name: 'query_provider_invalid', args: [...cliArgs, 'context', 'query', 'parser', '--provider', 'invalid'], desc: 'Invalid provider' },
    { name: 'query_provider_claude', args: [...cliArgs, 'context', 'query', 'parser', '--provider', 'claude'], desc: 'Explicit claude provider' },
    { name: 'query_provider_generic', args: [...cliArgs, 'context', 'query', 'parser', '--provider', 'generic'], desc: 'Generic provider' },
    { name: 'query_provider_compact', args: [...cliArgs, 'context', 'query', 'parser', '--provider', 'compact'], desc: 'Compact provider' },
    
    // ── Context impact edge cases ───────────────────────────────────────────────
    { name: 'impact_nonexistent', args: [...cliArgs, 'context', 'impact', 'nonexistent/file.ts'], desc: 'Non-existent file' },
    { name: 'impact_directory', args: [...cliArgs, 'context', 'impact', 'packages/'], desc: 'Directory path' },
    { name: 'impact_root', args: [...cliArgs, 'context', 'impact', 'index.ts'], desc: 'Root file' },
    { name: 'impact_deep_path', args: [...cliArgs, 'context', 'impact', 'packages/core/src/parser/go/go-extractor.ts'], desc: 'Deep nested path' },
    
    // ── Context for edge cases ─────────────────────────────────────────────────
    { name: 'for_empty', args: [...cliArgs, 'context', 'for', ''], desc: 'Empty task' },
    { name: 'for_very_long', args: [...cliArgs, 'context', 'for', 'a'.repeat(500)], desc: 'Very long task' },
    { name: 'for_file_nonexistent', args: [...cliArgs, 'context', 'for', 'add-feature', '--file', 'fake.ts'], desc: 'Non-existent anchor file' },
    { name: 'for_module_nonexistent', args: [...cliArgs, 'context', 'for', 'add-feature', '--module', 'fake-module'], desc: 'Non-existent anchor module' },
    
    // ── Flag combinations ──────────────────────────────────────────────────────
    { name: 'query_all_flags', args: [...cliArgs, 'context', 'query', 'parser', '--strict', '--tokens', '1000', '--hops', '2', '--meta'], desc: 'All flags combined' },
    { name: 'query_no_callgraph', args: [...cliArgs, 'context', 'query', 'parser', '--no-callgraph', '--meta'], desc: 'Without call graph' },
    { name: 'query_no_auto_fallback', args: [...cliArgs, 'context', 'query', 'xyz', '--strict', '--no-auto-fallback'], desc: 'No auto fallback' },
    { name: 'query_exact_only', args: [...cliArgs, 'context', 'query', 'extract', '--exact-only'], desc: 'Exact only mode' },
    
    // ── Stats edge cases ───────────────────────────────────────────────────────
    { name: 'stats_format_json', args: [...cliArgs, 'stats', '--format', 'json'], desc: 'JSON format' },
    { name: 'stats_format_invalid', args: [...cliArgs, 'stats', '--format', 'invalid'], desc: 'Invalid format' },
    
    // ── Contract edge cases ─────────────────────────────────────────────────────
    { name: 'contract_validate_strict', args: [...cliArgs, 'contract', 'validate', '--strict'], desc: 'Strict validation' },
    { name: 'contract_validate_boundaries', args: [...cliArgs, 'contract', 'validate', '--boundaries-only'], desc: 'Boundaries only' },
    { name: 'contract_validate_drift', args: [...cliArgs, 'contract', 'validate', '--drift-only'], desc: 'Drift only' },
    { name: 'contract_validate_all_flags', args: [...cliArgs, 'contract', 'validate', '--strict', '--boundaries-only', '--drift-only'], desc: 'All validation flags' },
    
    // ── Intent edge cases ───────────────────────────────────────────────────────
    { name: 'intent_short', args: [...cliArgs, 'intent', 'x'], desc: 'Single char intent' },
    { name: 'intent_create', args: [...cliArgs, 'intent', 'create-new-file'], desc: 'Create action' },
    { name: 'intent_delete', args: [...cliArgs, 'intent', 'delete-all-tests'], desc: 'Delete action' },
    { name: 'intent_move', args: [...cliArgs, 'intent', 'move-function'], desc: 'Move action' },
    { name: 'intent_refactor', args: [...cliArgs, 'intent', 'refactor-auth'], desc: 'Refactor action' },
    { name: 'intent_json', args: [...cliArgs, 'intent', 'add-feature', '--json'], desc: 'JSON output' },
    
    // ── CI edge cases ──────────────────────────────────────────────────────────
    { name: 'ci_strict', args: [...cliArgs, 'ci', '--strict'], desc: 'CI strict mode' },
    
    // ── Dead code edge cases ───────────────────────────────────────────────────
    { name: 'deadcode_json', args: [...cliArgs, 'dead-code', '--json'], desc: 'Dead code JSON' },
    
    // ── Visualize edge cases ───────────────────────────────────────────────────
    { name: 'visualize_nonexistent_module', args: [...cliArgs, 'visualize', 'module', 'nonexistent'], desc: 'Non-existent module' },
    
    // ── Semantic search edge cases ──────────────────────────────────────────────
    { name: 'search_basic', args: [...cliArgs, 'search', 'parser'], desc: 'Basic semantic search' },
    { name: 'search_limit', args: [...cliArgs, 'search', 'function', '--limit', '5'], desc: 'Search with custom limit' },
    { name: 'search_unicode', args: [...cliArgs, 'search', '函数'], desc: 'Unicode query' },
    { name: 'search_no_results', args: [...cliArgs, 'search', 'xyzzy_plugh_nonexistent_function_12345'], desc: 'Search with no results' },
    { name: 'search_multi_word', args: [...cliArgs, 'search', 'context building'], desc: 'Multi-word search' },
    
    // ── Doctor edge cases ───────────────────────────────────────────────────────
    { name: 'doctor', args: [...cliArgs, 'doctor'], desc: 'Doctor check' }
  ]

  // Tests that are EXPECTED to fail (validation rejects bad input)
  const expectedFails = new Set([
    'query_empty',       // missing required argument
    'query_tokens_negative', // invalid value
    'query_hops_negative',   // invalid value
    'query_must_empty',      // argument missing
    'for_empty',            // missing required argument
    'contract_validate_all_flags', // conflicting flags
    'visualize_nonexistent_module', // module not found
    'contract_validate_strict', // project has file drift
    'query_provider_invalid', // invalid provider name
  ])

  console.log('🧪 Mikk CLI Edge Case Benchmark\n')

  for (const tc of testCases) {
    console.log(`  [${testCases.indexOf(tc) + 1}/${testCases.length}] ${tc.name}...`)
    const result = await runCommand(cli, tc.args, tc.desc)
    result.name = tc.name
    result.testDescription = tc.desc
    result.expectedFailure = expectedFails.has(tc.name)
    result.behavior = result.expectedFailure
      ? (result.exitCode !== 0 ? 'correct_reject' : 'incorrect_accept')
      : (result.exitCode === 0 ? 'correct_pass' : 'incorrect_fail')
    session.runs.push(result)
  }

  await fs.mkdir(path.dirname(OUTPUT_FILE), { recursive: true })
  await fs.writeFile(OUTPUT_FILE, JSON.stringify(session, null, 2), 'utf-8')

  const correctPass = session.runs.filter(r => r.behavior === 'correct_pass').length
  const correctReject = session.runs.filter(r => r.behavior === 'correct_reject').length
  const incorrectFail = session.runs.filter(r => r.behavior === 'incorrect_fail').length
  const incorrectAccept = session.runs.filter(r => r.behavior === 'incorrect_accept').length
  
  console.log(`\n────────────────────────────────────────────────────────`)
  console.log(`📊 BEHAVIOR SUMMARY`)
  console.log(`────────────────────────────────────────────────────────`)
  console.log(`  ✅ Correct passes:     ${correctPass}`)
  console.log(`  ✅ Correct rejects:    ${correctReject}`)
  console.log(`  ❌ Unexpected fails:  ${incorrectFail}`)
  console.log(`  ❌ Should have failed: ${incorrectAccept}`)
  console.log(`────────────────────────────────────────────────────────`)
  console.log(`  Total correct: ${correctPass + correctReject}/${testCases.length}`)
  console.log(`  Correct rate:  ${((correctPass + correctReject) / testCases.length * 100).toFixed(1)}%`)
  console.log(`────────────────────────────────────────────────────────`)
  console.log(`\n📁 Results: ${OUTPUT_FILE}`)
  
  if (incorrectFail > 0) {
    console.log(`\n⚠️  Unexpected failures:`)
    session.runs.filter(r => r.behavior === 'incorrect_fail').forEach(r => {
      console.log(`  - ${r.name}: ${r.stderr.split('\n')[0]}`)
    })
  }
}

main().catch(console.error)
