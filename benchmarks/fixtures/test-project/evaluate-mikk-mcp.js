const { spawn } = require('child_process');

const projectRoot = 'C:/Users/Ansh/Desktop/web/Mesh';

function startServer() {
  const proc = spawn('node', ['packages/cli/dist/index.js', 'mcp', 'start', '--project', projectRoot], {
    cwd: projectRoot,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  proc.stderr.on('data', (d) => {
    const s = d.toString();
    if (s.trim()) process.stderr.write(s);
  });

  let id = 1;
  const pending = new Map();
  let buffer = '';

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

  function send(method, params = {}) {
    const requestId = id++;
    const payload = { jsonrpc: '2.0', id: requestId, method, params };
    return new Promise((resolve, reject) => {
      pending.set(requestId, { resolve, reject });
      proc.stdin.write(JSON.stringify(payload) + '\n');
      setTimeout(() => {
        if (pending.has(requestId)) {
          pending.delete(requestId);
          reject(new Error(`Timeout for ${method}`));
        }
      }, 15000);
    });
  }

  function close() {
    proc.kill();
  }

  return { send, close };
}

function extractText(resultMsg) {
  const txt = resultMsg?.result?.content?.[0]?.text;
  if (!txt) return null;
  return txt;
}

function safeJson(text) {
  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
}

async function main() {
  const server = startServer();
  const findings = [];

  try {
    await server.send('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'mikk-evaluator', version: '1.0.0' },
    });
    server.send('notifications/initialized', {}).catch(() => {});

    const list = await server.send('tools/list', {});
    const toolCount = list?.result?.tools?.length || 0;
    findings.push({ check: 'tool_list_count', ok: toolCount >= 20, detail: `count=${toolCount}` });

    const smoke = await server.send('tools/call', { name: 'mikk_test_tool', arguments: {} });
    const smokeText = extractText(smoke) || '';
    findings.push({ check: 'test_tool', ok: smokeText.toLowerCase().includes('success'), detail: smokeText.slice(0, 120) });

    const session = await server.send('tools/call', { name: 'mikk_get_session_context', arguments: {} });
    const sessionJson = safeJson(extractText(session));
    findings.push({
      check: 'session_context_shape',
      ok: !!sessionJson && typeof sessionJson.project === 'object' && typeof sessionJson.constraints === 'object',
      detail: sessionJson ? 'has project+constraints' : 'non-json',
    });

    const strictQuery = await server.send('tools/call', {
      name: 'mikk_query_context',
      arguments: {
        question: 'nonexistentxyzterm should return strict empty',
        strict: true,
        exactOnly: true,
        failFast: true,
        autoFallback: false,
      },
    });
    const strictText = extractText(strictQuery) || '';
    const strictJson = safeJson(strictText);
    findings.push({
      check: 'strict_failfast_behavior',
      ok: !!strictJson && (strictJson.isError === true || (strictJson.context?.length ?? 0) === 0),
      detail: strictJson ? 'returns guarded strict response' : strictText.slice(0, 120),
    });

    const beforeUnknown = await server.send('tools/call', {
      name: 'mikk_before_edit',
      arguments: { files: ['totally/missing/file.ts'] },
    });
    const beforeUnknownJson = safeJson(extractText(beforeUnknown));
    findings.push({
      check: 'before_edit_unknown_file',
      ok: !!(beforeUnknownJson && beforeUnknownJson.files && beforeUnknownJson.files['totally/missing/file.ts']),
      detail: beforeUnknownJson ? (beforeUnknownJson.files['totally/missing/file.ts']?.warning || 'handled') : 'non-json',
    });

    const beforeBudgetAbort = await server.send('tools/call', {
      name: 'mikk_before_edit',
      arguments: {
        files: ['packages/cli/src/commands/mcp.ts', 'packages/mcp-server/src/tools.ts'],
        tokenBudget: 200,
        abortOnHighTokens: true,
      },
    });
    const beforeBudgetText = extractText(beforeBudgetAbort) || '';
    const beforeBudgetJson = safeJson(beforeBudgetText);
    findings.push({
      check: 'token_budget_abort',
      ok: !!beforeBudgetJson && beforeBudgetJson.tokenGuard && beforeBudgetJson.tokenGuard.shouldAbort === true,
      detail: beforeBudgetJson ? JSON.stringify(beforeBudgetJson.tokenGuard) : beforeBudgetText.slice(0, 120),
    });

    const impactUnknown = await server.send('tools/call', {
      name: 'mikk_impact_analysis',
      arguments: { file: 'does/not/exist.ts' },
    });
    const impactUnknownText = extractText(impactUnknown) || '';
    findings.push({
      check: 'impact_unknown_file_error',
      ok: impactUnknownText.toLowerCase().includes('not found') ||
        impactUnknownText.toLowerCase().includes('unable') ||
        impactUnknownText.toLowerCase().includes('no functions found'),
      detail: impactUnknownText.slice(0, 140),
    });

    const pathTraversal = await server.send('tools/call', {
      name: 'mikk_get_file',
      arguments: { file: '../package.json' },
    });
    const pathTraversalText = extractText(pathTraversal) || '';
    findings.push({
      check: 'path_traversal_blocked',
      ok: pathTraversalText.toLowerCase().includes('not allowed') ||
        pathTraversalText.toLowerCase().includes('outside project root') ||
        pathTraversalText.toLowerCase().includes('outside the project root') ||
        pathTraversalText.toLowerCase().includes('access denied') ||
        pathTraversalText.toLowerCase().includes('blocked'),
      detail: pathTraversalText.slice(0, 140),
    });

    const summary = {
      projectRoot,
      checks: findings,
      passed: findings.filter(f => f.ok).length,
      total: findings.length,
      usefulnessVerdict: null,
    };

    const ratio = summary.passed / summary.total;
    if (ratio >= 0.85) {
      summary.usefulnessVerdict = 'High utility for AI agents: strong context retrieval, safety gates, and token controls validated.';
    } else if (ratio >= 0.6) {
      summary.usefulnessVerdict = 'Moderate utility: core workflows work, but some edge-case reliability gaps remain.';
    } else {
      summary.usefulnessVerdict = 'Low utility in current state: multiple edge-case failures reduce trust for AI workflows.';
    }

    console.log(JSON.stringify(summary, null, 2));
  } catch (err) {
    console.error('Evaluation failed:', err.message);
    process.exitCode = 1;
  } finally {
    server.close();
  }
}

main();
