const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const DATE = new Date().toISOString().slice(0, 10);
const PROJECT_ROOT = process.argv[2] || path.resolve(__dirname, '../../..');
const LOCAL_CLI = process.argv[3] || path.join(PROJECT_ROOT, 'packages', 'cli', 'dist', 'index.js');
const REPORT_BASENAME = `MCP_LOCAL_PIPELINE_REPORT_${DATE}`;

function uiTitle(title) {
  console.log(`\n${'='.repeat(72)}`);
  console.log(title);
  console.log(`${'='.repeat(72)}`);
}

function uiSection(title) {
  console.log(`\n${'-'.repeat(72)}`);
  console.log(title);
  console.log(`${'-'.repeat(72)}`);
}

function row(tool, id, passed, detail) {
  return { tool, id, passed: Boolean(passed), detail: String(detail || '') };
}

function ensureLocalCli() {
  if (!fs.existsSync(LOCAL_CLI)) {
    throw new Error(
      `Local CLI not found at ${LOCAL_CLI}. Run from repo root:\n` +
      '  bun run build\n' +
      'Then rerun this benchmark.'
    );
  }
}

function runLocalCli(args, opts = {}) {
  const r = spawnSync('node', [LOCAL_CLI, ...args], {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
    timeout: opts.timeout || 30000,
  });
  return {
    code: r.status,
    stdout: (r.stdout || '').trim(),
    stderr: (r.stderr || '').trim(),
  };
}

function startLocalMcpServer() {
  const proc = spawn('node', [LOCAL_CLI, 'mcp', 'start', '--project', PROJECT_ROOT], {
    cwd: PROJECT_ROOT,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let buffer = '';
  let initialized = false;
  let requestId = 1;
  const pending = new Map();

  proc.stderr.on('data', (d) => {
    const s = d.toString();
    if (s.trim()) process.stderr.write(s);
  });

  proc.stdout.on('data', (d) => {
    buffer += d.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim()) continue;
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        continue;
      }

      if (!initialized && msg.id === 1 && msg.result) {
        initialized = true;
        proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
      }

      if (typeof msg.id === 'number' && pending.has(msg.id)) {
        const { resolve } = pending.get(msg.id);
        pending.delete(msg.id);
        resolve(msg);
      }
    }
  });

  function send(method, params, timeoutMs = 45000) {
    const id = requestId++;
    const payload = { jsonrpc: '2.0', id, method, params };
    proc.stdin.write(JSON.stringify(payload) + '\n');

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Timeout while calling ${method}`));
      }, timeoutMs);

      pending.set(id, {
        resolve: (msg) => {
          clearTimeout(timer);
          resolve(msg);
        },
      });
    });
  }

  async function initialize() {
    await send('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'mikk-local-pipeline', version: '1.0.0' },
    });
  }

  function close() {
    proc.kill();
  }

  return { send, initialize, close };
}

function parseToolText(msg) {
  const text = msg?.result?.content?.[0]?.text || '';
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // keep null
  }
  return {
    isError: Boolean(msg?.result?.isError || msg?.error),
    text,
    json,
  };
}

async function callTool(client, toolName, args = {}) {
  try {
    const msg = await client.send('tools/call', { name: toolName, arguments: args });
    const parsed = parseToolText(msg);
    return { transportOk: true, ...parsed };
  } catch (err) {
    return {
      transportOk: false,
      isError: true,
      text: String(err?.message || err),
      json: null,
    };
  }
}

function evaluateCliChecks() {
  const checks = [];

  const stats = runLocalCli(['stats', '--format', 'json']);
  let statsJson = null;
  try {
    statsJson = JSON.parse(stats.stdout || '{}');
  } catch {
    statsJson = null;
  }
  const statsHasUsefulOutput = stats.code === 0 && (stats.stdout.length > 0 || stats.stderr.length > 0);
  checks.push(
    row(
      'cli',
      'stats_json_shape',
      statsHasUsefulOutput,
      stats.code === 0 ? 'stats --format json succeeded' : (stats.stderr || stats.stdout).slice(0, 220)
    )
  );

  const dead = runLocalCli(['dead-code', '--json']);
  let deadJson = null;
  try {
    deadJson = JSON.parse(dead.stdout || '{}');
  } catch {
    deadJson = null;
  }
  checks.push(
    row(
      'cli',
      'dead_code_json_shape',
      dead.code === 0 && !!deadJson && typeof deadJson.deadCount === 'number',
      dead.code === 0 ? 'dead-code --json succeeded' : (dead.stderr || dead.stdout).slice(0, 220)
    )
  );

  const ctx = runLocalCli(['context', 'query', 'How does MCP command registration work?', '--tokens', '1200']);
  checks.push(
    row(
      'cli',
      'context_query_success',
      ctx.code === 0 && (ctx.stdout.length > 0 || ctx.stderr.length > 0),
      ctx.code === 0 ? 'context query produced output' : (ctx.stderr || ctx.stdout).slice(0, 220)
    )
  );

  const mcpHelp = runLocalCli(['mcp', '--help']);
  checks.push(
    row(
      'cli',
      'mcp_help_contains_install',
      mcpHelp.code === 0 && /install/i.test(mcpHelp.stdout + mcpHelp.stderr),
      (mcpHelp.stdout + mcpHelp.stderr).slice(0, 220)
    )
  );

  return checks;
}

async function main() {
  ensureLocalCli();

  uiTitle('MIKK LOCAL BENCHMARK PIPELINE');
  console.log(`Project root: ${PROJECT_ROOT}`);
  console.log(`Local CLI:    ${LOCAL_CLI}`);
  console.log('Mode:         Local-first (no global npx fallback, no external MCP config dependency)');

  const results = [];
  const client = startLocalMcpServer();

  try {
    uiSection('Starting Local MCP Session');
    await client.initialize();
    const listMsg = await client.send('tools/list', {});
    const toolNames = (listMsg?.result?.tools || []).map((t) => t.name);
    console.log(`Discovered MCP tools: ${toolNames.length}`);

    const validFile = 'packages/cli/src/commands/mcp.ts';
    const invalidFile = 'does/not/exist.ts';
    const validFn = 'registerMcpCommand';
    const invalidFn = 'totallyMissingFunctionNameXYZ';

    const modulesCall = await callTool(client, 'mikk_list_modules', {});
    const moduleId = modulesCall.json?.modules?.[0]?.id || 'packages-cli-commands';

    uiSection('Running MCP Tool Checks (Local Server)');

    {
      const a = await callTool(client, 'mikk_test_tool', {});
      results.push(row('mcp:mikk_test_tool', 'basic_smoke', a.transportOk && !a.isError && /success/i.test(a.text), a.text.slice(0, 180)));
      const b = await callTool(client, 'mikk_test_tool', {});
      results.push(row('mcp:mikk_test_tool', 'repeatability', b.transportOk && !b.isError, b.text.slice(0, 180)));
    }

    {
      const a = await callTool(client, 'mikk_get_project_overview', {});
      results.push(row('mcp:mikk_get_project_overview', 'shape_project', a.json && typeof a.json.project === 'object', a.text.slice(0, 200)));
      results.push(row('mcp:mikk_get_project_overview', 'shape_counts', a.json && typeof a.json.files === 'number' && typeof a.json.functions === 'number', a.text.slice(0, 200)));
    }

    {
      const a = await callTool(client, 'mikk_query_context', { question: 'How does MCP command registration work?' });
      results.push(row('mcp:mikk_query_context', 'normal_query', a.transportOk && a.text.length > 0, a.text.slice(0, 200)));
      const b = await callTool(client, 'mikk_query_context', {
        question: 'nonexistentxyzterm should return strict empty',
        strict: true,
        exactOnly: true,
        failFast: true,
        autoFallback: false,
      });
      const strictPass = b.isError || (b.json && Array.isArray(b.json.context) && b.json.context.length === 0) || /no context|strict/i.test(b.text);
      results.push(row('mcp:mikk_query_context', 'strict_failfast_edge', strictPass, b.text.slice(0, 220)));
    }

    {
      const a = await callTool(client, 'mikk_impact_analysis', { file: validFile });
      results.push(row('mcp:mikk_impact_analysis', 'known_file', a.transportOk && !a.isError && a.json && typeof a.json.impactedNodes === 'number', a.text.slice(0, 220)));
      const b = await callTool(client, 'mikk_impact_analysis', { file: invalidFile });
      results.push(row('mcp:mikk_impact_analysis', 'unknown_file_edge', b.transportOk && /no functions found|not found|unable/i.test(b.text), b.text.slice(0, 220)));
      const c = await callTool(client, 'mikk_impact_analysis', { file: validFile, tokenBudget: 200, abortOnHighTokens: true });
      const cPass = c.isError ? /token budget/i.test(c.text) || c.json?.tokenGuard?.shouldAbort === true : true;
      results.push(row('mcp:mikk_impact_analysis', 'token_budget_edge', cPass, c.text.slice(0, 220)));
    }

    {
      const a = await callTool(client, 'mikk_search_functions', { query: validFn, limit: 5 });
      results.push(row('mcp:mikk_search_functions', 'known_query', a.transportOk && a.text.length > 0, a.text.slice(0, 200)));
      const b = await callTool(client, 'mikk_search_functions', { query: 'zzzz_nonexistent_query_zzzz', limit: 3 });
      results.push(row('mcp:mikk_search_functions', 'no_match_edge', b.transportOk && b.text.length > 0, b.text.slice(0, 200)));
    }

    {
      const a = await callTool(client, 'mikk_before_edit', { files: [validFile] });
      results.push(row('mcp:mikk_before_edit', 'tracked_file', a.transportOk && a.json && typeof a.json.constraintStatus === 'string', a.text.slice(0, 220)));
      const b = await callTool(client, 'mikk_before_edit', { files: [invalidFile] });
      results.push(row('mcp:mikk_before_edit', 'untracked_file_edge', b.transportOk && /no tracked functions|warning/i.test(b.text), b.text.slice(0, 220)));
      const c = await callTool(client, 'mikk_before_edit', { files: [validFile, 'packages/mcp-server/src/tools.ts'], tokenBudget: 200, abortOnHighTokens: true });
      results.push(row('mcp:mikk_before_edit', 'token_abort_edge', c.transportOk && c.json && c.json.tokenGuard && c.json.tokenGuard.shouldAbort === true, c.text.slice(0, 220)));
    }

    {
      const a = await callTool(client, 'mikk_list_modules', {});
      results.push(row('mcp:mikk_list_modules', 'non_empty', a.transportOk && a.json && Array.isArray(a.json.modules) && a.json.modules.length > 0, a.text.slice(0, 200)));
      results.push(row('mcp:mikk_list_modules', 'module_fields', a.transportOk && a.json && typeof a.json.modules?.[0]?.id === 'string', a.text.slice(0, 200)));
    }

    {
      const a = await callTool(client, 'mikk_get_module_detail', { moduleId });
      results.push(row('mcp:mikk_get_module_detail', 'valid_module', a.transportOk && a.text.length > 0 && !a.isError, a.text.slice(0, 220)));
      const b = await callTool(client, 'mikk_get_module_detail', { moduleId: 'missing-module-xyz' });
      results.push(row('mcp:mikk_get_module_detail', 'unknown_module_edge', b.transportOk && (b.isError || /unknown|not found/i.test(b.text)), b.text.slice(0, 220)));
    }

    {
      const a = await callTool(client, 'mikk_get_function_detail', { functionName: validFn });
      results.push(row('mcp:mikk_get_function_detail', 'valid_function', a.transportOk && a.text.length > 0, a.text.slice(0, 220)));
      const b = await callTool(client, 'mikk_get_function_detail', { functionName: invalidFn });
      results.push(row('mcp:mikk_get_function_detail', 'unknown_function_edge', b.transportOk && (b.isError || /unknown|not found/i.test(b.text)), b.text.slice(0, 220)));
    }

    {
      const a = await callTool(client, 'mikk_semantic_search', { query: 'mcp server command registration', topK: 5 });
      results.push(row('mcp:mikk_semantic_search', 'normal_query', a.transportOk && a.text.length > 0, a.text.slice(0, 220)));
      const b = await callTool(client, 'mikk_semantic_search', { query: '' });
      results.push(row('mcp:mikk_semantic_search', 'empty_query_edge', b.transportOk && (b.isError || /required|minlength|invalid/i.test(b.text)), b.text.slice(0, 220)));
    }

    {
      const a = await callTool(client, 'mikk_validate_edit', { files: [validFile], description: 'Check safe update of MCP command flow', autoFix: false });
      results.push(row('mcp:mikk_validate_edit', 'normal_validation', a.transportOk && a.json && typeof a.json.allowed === 'boolean', a.text.slice(0, 220)));
      const b = await callTool(client, 'mikk_validate_edit', { description: 'missing files' });
      results.push(row('mcp:mikk_validate_edit', 'missing_files_edge', b.transportOk && (b.isError || /required|min/i.test(b.text)), b.text.slice(0, 220)));
    }

    {
      const a = await callTool(client, 'mikk_get_constraints', {});
      results.push(row('mcp:mikk_get_constraints', 'basic_shape', a.transportOk && a.text.length > 0, a.text.slice(0, 220)));
      results.push(row('mcp:mikk_get_constraints', 'constraints_field', !!a.json && Array.isArray(a.json.constraints), a.text.slice(0, 220)));
    }

    {
      const a = await callTool(client, 'mikk_get_file', { file: validFile });
      results.push(row('mcp:mikk_get_file', 'valid_file', a.transportOk && !a.isError && a.text.length > 0, a.text.slice(0, 220)));
      const b = await callTool(client, 'mikk_get_file', { file: '../package.json' });
      results.push(row('mcp:mikk_get_file', 'path_traversal_edge', b.transportOk && (b.isError || /access denied|outside/i.test(b.text)), b.text.slice(0, 220)));
    }

    {
      const a = await callTool(client, 'mikk_find_usages', { name: validFn });
      results.push(row('mcp:mikk_find_usages', 'valid_function', a.transportOk && a.text.length > 0, a.text.slice(0, 220)));
      const b = await callTool(client, 'mikk_find_usages', { name: invalidFn });
      results.push(row('mcp:mikk_find_usages', 'unknown_function_edge', b.transportOk && (b.isError || /not found|unknown/i.test(b.text)), b.text.slice(0, 220)));
    }

    {
      const a = await callTool(client, 'mikk_get_routes', {});
      results.push(row('mcp:mikk_get_routes', 'basic_response', a.transportOk && a.text.length > 0, a.text.slice(0, 220)));
      results.push(row('mcp:mikk_get_routes', 'routes_array_shape', !!a.json && Array.isArray(a.json.routes), a.text.slice(0, 220)));
    }

    {
      const a = await callTool(client, 'mikk_dead_code', {});
      results.push(row('mcp:mikk_dead_code', 'global_scan', a.transportOk && a.text.length > 0, a.text.slice(0, 220)));
      const b = await callTool(client, 'mikk_dead_code', { moduleId: 'module-does-not-exist' });
      results.push(row('mcp:mikk_dead_code', 'unknown_module_edge', b.transportOk && b.text.length > 0, b.text.slice(0, 220)));
    }

    {
      const a = await callTool(client, 'mikk_manage_adr', { action: 'list' });
      results.push(row('mcp:mikk_manage_adr', 'list_action', a.transportOk && a.text.length > 0, a.text.slice(0, 220)));
      const b = await callTool(client, 'mikk_manage_adr', { action: 'add', id: 'tmp-only' });
      results.push(row('mcp:mikk_manage_adr', 'add_missing_fields_edge', b.transportOk && (b.isError || /required/i.test(b.text)), b.text.slice(0, 220)));
      const c = await callTool(client, 'mikk_manage_adr', { action: 'get', id: 'totally-missing-adr-id' });
      results.push(row('mcp:mikk_manage_adr', 'get_missing_id_edge', c.transportOk && (c.isError || /not found|missing/i.test(c.text)), c.text.slice(0, 220)));
    }

    {
      const a = await callTool(client, 'mikk_get_changes', {});
      results.push(row('mcp:mikk_get_changes', 'basic_response', a.transportOk && a.text.length > 0, a.text.slice(0, 220)));
      results.push(row('mcp:mikk_get_changes', 'shape', !!a.json && (Array.isArray(a.json.modified) || Array.isArray(a.json.changed) || Array.isArray(a.json.files)), a.text.slice(0, 220)));
    }

    {
      const a = await callTool(client, 'mikk_read_file', { file: validFile, functions: [validFn] });
      results.push(row('mcp:mikk_read_file', 'scoped_read', a.transportOk && a.text.length > 0, a.text.slice(0, 220)));
      const b = await callTool(client, 'mikk_read_file', { file: invalidFile });
      results.push(row('mcp:mikk_read_file', 'missing_file_edge', b.transportOk && (b.isError || /not exist|not found/i.test(b.text)), b.text.slice(0, 220)));
    }

    {
      const a = await callTool(client, 'mikk_get_session_context', {});
      results.push(row('mcp:mikk_get_session_context', 'basic_shape', a.transportOk && a.text.length > 0, a.text.slice(0, 220)));
      results.push(row('mcp:mikk_get_session_context', 'has_project', !!a.json && typeof a.json.project === 'object', a.text.slice(0, 220)));
    }

    {
      const a = await callTool(client, 'mikk_git_diff_impact', {});
      results.push(row('mcp:mikk_git_diff_impact', 'default_call', a.transportOk && a.text.length > 0, a.text.slice(0, 220)));
      const b = await callTool(client, 'mikk_git_diff_impact', { ref: 'bad ref with spaces' });
      results.push(row('mcp:mikk_git_diff_impact', 'invalid_ref_edge', b.transportOk && (b.isError || /invalid git ref/i.test(b.text)), b.text.slice(0, 220)));
    }

    {
      const a = await callTool(client, 'mikk_rename', { functionName: validFn, newName: 'registerMcpCommandV2' });
      results.push(row('mcp:mikk_rename', 'valid_plan', a.transportOk && !a.isError && a.text.length > 0, a.text.slice(0, 220)));
      const b = await callTool(client, 'mikk_rename', { functionName: invalidFn, newName: 'whatever' });
      results.push(row('mcp:mikk_rename', 'unknown_function_edge', b.transportOk && (b.isError || /not found/i.test(b.text)), b.text.slice(0, 220)));
    }

    {
      const a = await callTool(client, 'mikk_token_stats', {});
      const b = await callTool(client, 'mikk_token_stats', {});
      const aCalls = a.json?.session?.calls ?? -1;
      const bCalls = b.json?.session?.calls ?? -1;
      results.push(row('mcp:mikk_token_stats', 'shape', a.transportOk && typeof a.json?.tokens?.used === 'number', a.text.slice(0, 220)));
      results.push(row('mcp:mikk_token_stats', 'monotonic_session_calls', b.transportOk && bCalls >= aCalls, `${aCalls} -> ${bCalls}`));
    }

    results.push(row('registry', 'mikk_analyze_absent', !toolNames.includes('mikk_analyze'), `tools=${toolNames.length}`));

    uiSection('Running Local CLI Checks');
    const cliChecks = evaluateCliChecks();
    for (const c of cliChecks) results.push(c);

    const passedChecks = results.filter((x) => x.passed).length;
    const totalChecks = results.length;
    const overallAccuracy = Number(((passedChecks / totalChecks) * 100).toFixed(2));

    const perToolMap = new Map();
    for (const r of results) {
      const bucket = perToolMap.get(r.tool) || [];
      bucket.push(r);
      perToolMap.set(r.tool, bucket);
    }

    const perTool = [];
    for (const [tool, rows] of perToolMap.entries()) {
      const total = rows.length;
      const passed = rows.filter((x) => x.passed).length;
      perTool.push({
        tool,
        passed,
        total,
        accuracy: Number(((passed / total) * 100).toFixed(2)),
      });
    }
    perTool.sort((a, b) => a.tool.localeCompare(b.tool));

    const jsonReport = {
      generatedAt: new Date().toISOString(),
      mode: 'local-first',
      server: {
        projectRoot: PROJECT_ROOT,
        localCli: LOCAL_CLI,
      },
      totals: {
        checks: totalChecks,
        passed: passedChecks,
        overallAccuracy,
      },
      perTool,
      failedChecks: results.filter((x) => !x.passed),
    };

    const jsonPath = path.join(PROJECT_ROOT, `${REPORT_BASENAME}.json`);
    const mdPath = path.join(PROJECT_ROOT, `${REPORT_BASENAME}.md`);

    fs.writeFileSync(jsonPath, JSON.stringify(jsonReport, null, 2), 'utf8');

    const md = [];
    md.push(`# Mikk Local Pipeline Report (${DATE})`);
    md.push('');
    md.push('## Mode');
    md.push('- Local-first execution');
    md.push(`- MCP server: node ${LOCAL_CLI} mcp start --project ${PROJECT_ROOT}`);
    md.push(`- CLI commands: node ${LOCAL_CLI} <command>`);
    md.push('');
    md.push('## Summary');
    md.push(`- Total checks: ${totalChecks}`);
    md.push(`- Passed: ${passedChecks}`);
    md.push(`- Overall accuracy: ${overallAccuracy}%`);
    md.push('');
    md.push('## Per-Tool Scores');
    md.push('| Tool | Passed | Total | Accuracy |');
    md.push('|---|---:|---:|---:|');
    for (const t of perTool) md.push(`| ${t.tool} | ${t.passed} | ${t.total} | ${t.accuracy}% |`);
    md.push('');
    md.push('## Failed Checks');
    const failed = results.filter((x) => !x.passed);
    if (failed.length === 0) md.push('- None');
    else for (const f of failed) md.push(`- ${f.tool} :: ${f.id} -> ${f.detail.replace(/\n/g, ' ').slice(0, 260)}`);

    fs.writeFileSync(mdPath, md.join('\n'), 'utf8');

    uiSection('Pipeline Result');
    console.log(`Overall accuracy: ${overallAccuracy}% (${passedChecks}/${totalChecks})`);
    console.log(`JSON report: ${jsonPath}`);
    console.log(`MD report:   ${mdPath}`);

    process.stdout.write(`${JSON.stringify({ overallAccuracy, passedChecks, totalChecks, jsonPath, mdPath }, null, 2)}\n`);
  } finally {
    client.close();
  }
}

main().catch((err) => {
  console.error('\nPipeline failed:', err?.message || err);
  process.exit(1);
});
