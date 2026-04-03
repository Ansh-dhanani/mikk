const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const CONFIG_PATH = 'C:/Users/Ansh/AppData/Roaming/Code/User/mcp.json';
const SERVER_NAME = 'mikk';
const PROJECT_ROOT = 'C:/Users/Ansh/Desktop/web/Mesh';
const DATE = '2026-04-03';

function startConfiguredServer(configPath, serverName, projectRoot) {
  const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const server = cfg?.servers?.[serverName];
  if (!server) throw new Error(`Server ${serverName} not found in ${configPath}`);

  const command = process.platform === 'win32' && server.command === 'npx' ? 'npx.cmd' : server.command;
  const proc = spawn(command, server.args || [], {
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
    cwd: projectRoot,
    env: {
      ...process.env,
      MIKK_PROJECT_ROOT: projectRoot,
    },
  });

  let buffer = '';
  let requestId = 1;
  const pending = new Map();

  proc.stdout.on('data', (d) => {
    buffer += d.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim()) continue;
      let msg;
      try { msg = JSON.parse(line); } catch { continue; }

      if (typeof msg.id === 'number' && pending.has(msg.id)) {
        const { resolve } = pending.get(msg.id);
        pending.delete(msg.id);
        resolve(msg);
      }
    }
  });

  proc.stderr.on('data', () => {});

  function send(method, params = {}, timeoutMs = 90000) {
    const id = requestId++;
    const payload = { jsonrpc: '2.0', id, method, params };
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      proc.stdin.write(JSON.stringify(payload) + '\n');
      setTimeout(() => {
        if (pending.has(id)) {
          pending.delete(id);
          reject(new Error(`Timeout ${method}`));
        }
      }, timeoutMs);
    });
  }

  async function initialize() {
    await send('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'mikk-full-evaluator', version: '1.0.0' },
    });
    proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
  }

  function close() {
    proc.kill();
  }

  return { send, initialize, close };
}

function extractText(msg) {
  return msg?.result?.content?.[0]?.text || '';
}

function parseMaybeJson(text) {
  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
}

async function callTool(client, name, args) {
  try {
    const msg = await client.send('tools/call', { name, arguments: args });
    const text = extractText(msg);
    const json = parseMaybeJson(text);
    const isError = Boolean(msg?.result?.isError || msg?.error);
    return { okTransport: true, isError, text, json, msg };
  } catch (e) {
    return { okTransport: false, isError: true, text: String(e.message || e), json: null, msg: null };
  }
}

function mkResult(tool, id, passed, detail) {
  return { tool, id, passed: Boolean(passed), detail: String(detail || '') };
}

async function main() {
  const client = startConfiguredServer(CONFIG_PATH, SERVER_NAME, PROJECT_ROOT);
  const allResults = [];

  try {
    await client.initialize();

    const toolsListMsg = await client.send('tools/list', {});
    const tools = toolsListMsg?.result?.tools || [];
    const toolNames = tools.map(t => t.name);

    const moduleList = await callTool(client, 'mikk_list_modules', {});
    const moduleJson = moduleList.json || {};
    const validModuleId = Array.isArray(moduleJson.modules) && moduleJson.modules.length > 0
      ? moduleJson.modules[0].id
      : 'packages-cli-commands';

    const validFile = 'packages/cli/src/commands/mcp.ts';
    const invalidFile = 'does/not/exist.ts';
    const validFunction = 'registerMcpCommand';
    const invalidFunction = 'totallyMissingFunctionNameXYZ';

    // 1. mikk_test_tool
    {
      const a = await callTool(client, 'mikk_test_tool', {});
      allResults.push(mkResult('mikk_test_tool', 'basic_smoke', a.okTransport && !a.isError && /success/i.test(a.text), a.text.slice(0, 180)));
      const b = await callTool(client, 'mikk_test_tool', {});
      allResults.push(mkResult('mikk_test_tool', 'repeatability', b.okTransport && !b.isError && b.text.length > 0, b.text.slice(0, 180)));
    }

    // 2. mikk_get_project_overview
    {
      const a = await callTool(client, 'mikk_get_project_overview', {});
      allResults.push(mkResult('mikk_get_project_overview', 'shape_project', a.json && typeof a.json.project === 'object', a.text.slice(0, 200)));
      allResults.push(mkResult('mikk_get_project_overview', 'shape_counts', a.json && typeof a.json.files === 'number' && typeof a.json.functions === 'number', a.text.slice(0, 200)));
    }

    // 3. mikk_query_context
    {
      const a = await callTool(client, 'mikk_query_context', { question: 'How does MCP command registration work?' });
      allResults.push(mkResult('mikk_query_context', 'normal_query', a.okTransport && a.text.length > 0, a.text.slice(0, 200)));
      const b = await callTool(client, 'mikk_query_context', {
        question: 'nonexistentxyzterm should return strict empty',
        strict: true,
        exactOnly: true,
        failFast: true,
        autoFallback: false,
      });
      const strictPass = b.isError || (b.json && Array.isArray(b.json.context) && b.json.context.length === 0) || /no context|no matching|strict/i.test(b.text);
      allResults.push(mkResult('mikk_query_context', 'strict_failfast_edge', strictPass, b.text.slice(0, 220)));
    }

    // 4. mikk_impact_analysis
    {
      const a = await callTool(client, 'mikk_impact_analysis', { file: validFile });
      allResults.push(mkResult('mikk_impact_analysis', 'known_file', a.okTransport && !a.isError && a.json && typeof a.json.impactedNodes === 'number', a.text.slice(0, 200)));
      const b = await callTool(client, 'mikk_impact_analysis', { file: invalidFile });
      allResults.push(mkResult('mikk_impact_analysis', 'unknown_file_edge', b.okTransport && /no functions found|not found|unable/i.test(b.text), b.text.slice(0, 220)));
      const c = await callTool(client, 'mikk_impact_analysis', { file: validFile, tokenBudget: 200, abortOnHighTokens: true });
      const cPass = c.isError ? /token budget/i.test(c.text) || (c.json?.tokenGuard?.shouldAbort === true) : true;
      allResults.push(mkResult('mikk_impact_analysis', 'token_budget_edge', cPass, c.text.slice(0, 220)));
    }

    // 5. mikk_search_functions
    {
      const a = await callTool(client, 'mikk_search_functions', { query: validFunction, limit: 5 });
      allResults.push(mkResult('mikk_search_functions', 'known_query', a.okTransport && a.text.length > 0, a.text.slice(0, 200)));
      const b = await callTool(client, 'mikk_search_functions', { query: 'zzzz_nonexistent_query_zzzz', limit: 3 });
      allResults.push(mkResult('mikk_search_functions', 'no_match_edge', b.okTransport && b.text.length > 0, b.text.slice(0, 200)));
    }

    // 6. mikk_before_edit
    {
      const a = await callTool(client, 'mikk_before_edit', { files: [validFile] });
      allResults.push(mkResult('mikk_before_edit', 'tracked_file', a.okTransport && a.json && typeof a.json.constraintStatus === 'string', a.text.slice(0, 220)));
      const b = await callTool(client, 'mikk_before_edit', { files: [invalidFile] });
      allResults.push(mkResult('mikk_before_edit', 'untracked_file_edge', b.okTransport && /no tracked functions|warning/i.test(b.text), b.text.slice(0, 220)));
      const c = await callTool(client, 'mikk_before_edit', { files: [validFile, 'packages/mcp-server/src/tools.ts'], tokenBudget: 200, abortOnHighTokens: true });
      allResults.push(mkResult('mikk_before_edit', 'token_abort_edge', c.okTransport && c.json && c.json.tokenGuard && c.json.tokenGuard.shouldAbort === true, c.text.slice(0, 220)));
    }

    // 7. mikk_list_modules
    {
      const a = await callTool(client, 'mikk_list_modules', {});
      allResults.push(mkResult('mikk_list_modules', 'non_empty', a.okTransport && a.json && Array.isArray(a.json.modules) && a.json.modules.length > 0, a.text.slice(0, 200)));
      allResults.push(mkResult('mikk_list_modules', 'module_fields', a.okTransport && a.json && a.json.modules && typeof a.json.modules[0]?.id === 'string', a.text.slice(0, 200)));
    }

    // 8. mikk_get_module_detail
    {
      const a = await callTool(client, 'mikk_get_module_detail', { moduleId: validModuleId });
      allResults.push(mkResult('mikk_get_module_detail', 'valid_module', a.okTransport && a.json && (a.json.id === validModuleId || a.text.length > 0), a.text.slice(0, 220)));
      const b = await callTool(client, 'mikk_get_module_detail', { moduleId: 'missing-module-xyz' });
      allResults.push(mkResult('mikk_get_module_detail', 'unknown_module_edge', b.okTransport && (b.isError || /unknown|not found/i.test(b.text)), b.text.slice(0, 220)));
    }

    // 9. mikk_get_function_detail
    {
      const a = await callTool(client, 'mikk_get_function_detail', { functionName: validFunction });
      allResults.push(mkResult('mikk_get_function_detail', 'valid_function', a.okTransport && a.text.length > 0, a.text.slice(0, 220)));
      const b = await callTool(client, 'mikk_get_function_detail', { functionName: invalidFunction });
      allResults.push(mkResult('mikk_get_function_detail', 'unknown_function_edge', b.okTransport && (b.isError || /unknown|not found/i.test(b.text)), b.text.slice(0, 220)));
    }

    // 10. mikk_semantic_search
    {
      const a = await callTool(client, 'mikk_semantic_search', { query: 'mcp server command registration', topK: 5 });
      allResults.push(mkResult('mikk_semantic_search', 'normal_query', a.okTransport && a.text.length > 0, a.text.slice(0, 220)));
      const b = await callTool(client, 'mikk_semantic_search', { query: '' });
      allResults.push(mkResult('mikk_semantic_search', 'empty_query_edge', b.okTransport && (b.isError || /required|minlength|invalid/i.test(b.text)), b.text.slice(0, 220)));
    }

    // 11. mikk_validate_edit
    {
      const a = await callTool(client, 'mikk_validate_edit', { files: [validFile], description: 'Check safe update of MCP command flow', autoFix: false });
      allResults.push(mkResult('mikk_validate_edit', 'normal_validation', a.okTransport && a.json && typeof a.json.allowed === 'boolean', a.text.slice(0, 220)));
      const b = await callTool(client, 'mikk_validate_edit', { description: 'missing files' });
      allResults.push(mkResult('mikk_validate_edit', 'missing_files_edge', b.okTransport && (b.isError || /required|min/i.test(b.text)), b.text.slice(0, 220)));
    }

    // 12. mikk_get_constraints
    {
      const a = await callTool(client, 'mikk_get_constraints', {});
      allResults.push(mkResult('mikk_get_constraints', 'basic_shape', a.okTransport && a.text.length > 0, a.text.slice(0, 220)));
      const aj = a.json;
      allResults.push(mkResult('mikk_get_constraints', 'constraints_field', !!aj && Array.isArray(aj.constraints), a.text.slice(0, 220)));
    }

    // 13. mikk_get_file
    {
      const a = await callTool(client, 'mikk_get_file', { file: validFile });
      allResults.push(mkResult('mikk_get_file', 'valid_file', a.okTransport && !a.isError && a.text.length > 0, a.text.slice(0, 220)));
      const b = await callTool(client, 'mikk_get_file', { file: '../package.json' });
      allResults.push(mkResult('mikk_get_file', 'path_traversal_edge', b.okTransport && (b.isError || /access denied|outside/i.test(b.text)), b.text.slice(0, 220)));
    }

    // 14. mikk_find_usages
    {
      const a = await callTool(client, 'mikk_find_usages', { name: validFunction });
      allResults.push(mkResult('mikk_find_usages', 'valid_function', a.okTransport && a.text.length > 0, a.text.slice(0, 220)));
      const b = await callTool(client, 'mikk_find_usages', { name: invalidFunction });
      allResults.push(mkResult('mikk_find_usages', 'unknown_function_edge', b.okTransport && (b.isError || /not found|unknown/i.test(b.text)), b.text.slice(0, 220)));
    }

    // 15. mikk_get_routes
    {
      const a = await callTool(client, 'mikk_get_routes', {});
      allResults.push(mkResult('mikk_get_routes', 'basic_response', a.okTransport && a.text.length > 0, a.text.slice(0, 220)));
      const aj = a.json;
      allResults.push(mkResult('mikk_get_routes', 'routes_array_shape', !!aj && Array.isArray(aj.routes), a.text.slice(0, 220)));
    }

    // 16. mikk_dead_code
    {
      const a = await callTool(client, 'mikk_dead_code', {});
      allResults.push(mkResult('mikk_dead_code', 'global_scan', a.okTransport && a.text.length > 0, a.text.slice(0, 220)));
      const b = await callTool(client, 'mikk_dead_code', { moduleId: 'module-does-not-exist' });
      allResults.push(mkResult('mikk_dead_code', 'unknown_module_edge', b.okTransport && b.text.length > 0, b.text.slice(0, 220)));
    }

    // 17. mikk_manage_adr
    {
      const a = await callTool(client, 'mikk_manage_adr', { action: 'list' });
      allResults.push(mkResult('mikk_manage_adr', 'list_action', a.okTransport && a.text.length > 0, a.text.slice(0, 220)));
      const b = await callTool(client, 'mikk_manage_adr', { action: 'add', id: 'tmp-only' });
      allResults.push(mkResult('mikk_manage_adr', 'add_missing_fields_edge', b.okTransport && (b.isError || /required/i.test(b.text)), b.text.slice(0, 220)));
      const c = await callTool(client, 'mikk_manage_adr', { action: 'get', id: 'totally-missing-adr-id' });
      allResults.push(mkResult('mikk_manage_adr', 'get_missing_id_edge', c.okTransport && (c.isError || /not found|missing/i.test(c.text)), c.text.slice(0, 220)));
    }

    // 18. mikk_get_changes
    {
      const a = await callTool(client, 'mikk_get_changes', {});
      allResults.push(mkResult('mikk_get_changes', 'basic_response', a.okTransport && a.text.length > 0, a.text.slice(0, 220)));
      const aj = a.json;
      allResults.push(mkResult('mikk_get_changes', 'shape', !!aj && (Array.isArray(aj.modified) || Array.isArray(aj.changed) || Array.isArray(aj.files)), a.text.slice(0, 220)));
    }

    // 19. mikk_read_file
    {
      const a = await callTool(client, 'mikk_read_file', { file: validFile, functions: [validFunction] });
      allResults.push(mkResult('mikk_read_file', 'scoped_read', a.okTransport && a.text.length > 0, a.text.slice(0, 220)));
      const b = await callTool(client, 'mikk_read_file', { file: invalidFile });
      allResults.push(mkResult('mikk_read_file', 'missing_file_edge', b.okTransport && (b.isError || /not exist|not found/i.test(b.text)), b.text.slice(0, 220)));
    }

    // 20. mikk_get_session_context
    {
      const a = await callTool(client, 'mikk_get_session_context', {});
      allResults.push(mkResult('mikk_get_session_context', 'basic_shape', a.okTransport && a.text.length > 0, a.text.slice(0, 220)));
      const aj = a.json;
      allResults.push(mkResult('mikk_get_session_context', 'has_project', !!aj && typeof aj.project === 'object', a.text.slice(0, 220)));
    }

    // 21. mikk_git_diff_impact
    {
      const a = await callTool(client, 'mikk_git_diff_impact', {});
      allResults.push(mkResult('mikk_git_diff_impact', 'default_call', a.okTransport && a.text.length > 0, a.text.slice(0, 220)));
      const b = await callTool(client, 'mikk_git_diff_impact', { ref: 'bad ref with spaces' });
      allResults.push(mkResult('mikk_git_diff_impact', 'invalid_ref_edge', b.okTransport && (b.isError || /invalid git ref/i.test(b.text)), b.text.slice(0, 220)));
    }

    // 22. mikk_rename
    {
      const a = await callTool(client, 'mikk_rename', { functionName: validFunction, newName: 'registerMcpCommandV2' });
      allResults.push(mkResult('mikk_rename', 'valid_plan', a.okTransport && !a.isError && a.text.length > 0, a.text.slice(0, 220)));
      const b = await callTool(client, 'mikk_rename', { functionName: invalidFunction, newName: 'whatever' });
      allResults.push(mkResult('mikk_rename', 'unknown_function_edge', b.okTransport && (b.isError || /not found/i.test(b.text)), b.text.slice(0, 220)));
    }

    // 23. mikk_token_stats
    {
      const a = await callTool(client, 'mikk_token_stats', {});
      const b = await callTool(client, 'mikk_token_stats', {});
      const aj = a.json || {};
      const bj = b.json || {};
      const aCalls = aj?.session?.calls ?? -1;
      const bCalls = bj?.session?.calls ?? -1;
      allResults.push(mkResult('mikk_token_stats', 'shape', a.okTransport && typeof aj?.tokens?.used === 'number', a.text.slice(0, 220)));
      allResults.push(mkResult('mikk_token_stats', 'monotonic_session_calls', b.okTransport && bCalls >= aCalls, `${aCalls} -> ${bCalls}`));
    }

    // coverage for missing tool expectation
    allResults.push(mkResult('registry', 'mikk_analyze_absent', !toolNames.includes('mikk_analyze'), `tools=${toolNames.length}`));

    const byTool = new Map();
    for (const r of allResults) {
      const arr = byTool.get(r.tool) || [];
      arr.push(r);
      byTool.set(r.tool, arr);
    }

    const perTool = [];
    for (const [tool, rows] of byTool.entries()) {
      const total = rows.length;
      const passed = rows.filter(r => r.passed).length;
      const accuracy = Number(((passed / total) * 100).toFixed(2));
      perTool.push({ tool, passed, total, accuracy, rows });
    }
    perTool.sort((a, b) => a.tool.localeCompare(b.tool));

    const totalChecks = allResults.length;
    const passedChecks = allResults.filter(r => r.passed).length;
    const overallAccuracy = Number(((passedChecks / totalChecks) * 100).toFixed(2));

    const reportJson = {
      generatedAt: new Date().toISOString(),
      date: DATE,
      server: { configPath: CONFIG_PATH, serverName: SERVER_NAME, projectRoot: PROJECT_ROOT },
      totals: { toolsDiscovered: toolNames.length, checks: totalChecks, passed: passedChecks, overallAccuracy },
      perTool: perTool.map(t => ({ tool: t.tool, passed: t.passed, total: t.total, accuracy: t.accuracy })),
      failedChecks: allResults.filter(r => !r.passed),
    };

    const jsonPath = path.join(PROJECT_ROOT, `MCP_TOOL_ACCURACY_REPORT_${DATE}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(reportJson, null, 2), 'utf8');

    const mdLines = [];
    mdLines.push(`# MCP Tool Accuracy Report (${DATE})`);
    mdLines.push('');
    mdLines.push('## Scope');
    mdLines.push(`- Server config: ${CONFIG_PATH}`);
    mdLines.push(`- Server entry: ${SERVER_NAME}`);
    mdLines.push(`- Project root: ${PROJECT_ROOT}`);
    mdLines.push(`- Tools discovered: ${toolNames.length}`);
    mdLines.push(`- Total checks: ${totalChecks}`);
    mdLines.push(`- Passed: ${passedChecks}`);
    mdLines.push(`- Overall accuracy (behavioral pass-rate): ${overallAccuracy}%`);
    mdLines.push('');
    mdLines.push('## Method');
    mdLines.push('- Each tool was exercised with normal and edge-case inputs.');
    mdLines.push('- Accuracy per tool is pass-rate across its checks.');
    mdLines.push('- This is behavioral accuracy (contract adherence), not semantic truth-label benchmarking.');
    mdLines.push('');
    mdLines.push('## Per-Tool Scores');
    mdLines.push('| Tool | Passed | Total | Accuracy |');
    mdLines.push('|---|---:|---:|---:|');
    for (const t of perTool) {
      mdLines.push(`| ${t.tool} | ${t.passed} | ${t.total} | ${t.accuracy}% |`);
    }
    mdLines.push('');
    mdLines.push('## Failed Checks');
    const failed = allResults.filter(r => !r.passed);
    if (failed.length === 0) {
      mdLines.push('- None');
    } else {
      for (const f of failed) {
        mdLines.push(`- ${f.tool} :: ${f.id} -> ${f.detail.replace(/\n/g, ' ').slice(0, 260)}`);
      }
    }
    mdLines.push('');
    mdLines.push('## Notes');
    mdLines.push('- mikk_analyze is not exposed in the current MCP registry (CLI-only workflow).');
    mdLines.push('- For agent workflows, nearest equivalents are mikk_get_changes + mikk_get_session_context + mikk_before_edit + mikk_impact_analysis.');

    const mdPath = path.join(PROJECT_ROOT, `MCP_TOOL_ACCURACY_REPORT_${DATE}.md`);
    fs.writeFileSync(mdPath, mdLines.join('\n'), 'utf8');

    console.log(JSON.stringify({ overallAccuracy, passedChecks, totalChecks, mdPath, jsonPath }, null, 2));
  } finally {
    client.close();
  }
}

main().catch((e) => {
  console.error('fatal:', e);
  process.exit(1);
});
