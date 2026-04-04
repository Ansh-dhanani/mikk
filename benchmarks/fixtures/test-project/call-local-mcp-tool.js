const { spawn } = require('child_process');

const toolName = process.argv[2];
const rawArgs = process.argv[3] || '{}';
const projectRoot = process.argv[4] || 'C:/Users/Ansh/Desktop/web/Mesh';
const fs = require('fs');

if (!toolName) {
  console.error('Usage: node call-local-mcp-tool.js <toolName> [jsonArgs] [projectRoot]');
  process.exit(1);
}

let args;
const argsPayload = rawArgs.startsWith('@')
  ? fs.readFileSync(rawArgs.slice(1), 'utf8')
  : rawArgs;
try {
  args = JSON.parse(argsPayload);
} catch (e) {
  try {
    const unescaped = argsPayload
      .replace(/^"|"$/g, '')
      .replace(/^'|'$/g, '')
      .replace(/\\"/g, '"');
    args = JSON.parse(unescaped);
  } catch (e2) {
    console.error('Invalid JSON args:', e2.message);
    process.exit(1);
  }
}

const proc = spawn('node', [
  'packages/cli/dist/index.js',
  'mcp',
  'start',
  '--project',
  projectRoot,
], {
  cwd: 'C:/Users/Ansh/Desktop/web/Mesh',
  stdio: ['pipe', 'pipe', 'pipe'],
});

let buffer = '';
let initialized = false;

proc.stderr.on('data', (d) => {
  const msg = d.toString();
  if (msg.trim()) {
    console.error(msg.trim());
  }
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

    if (msg.id === 1 && msg.result && !initialized) {
      initialized = true;
      proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
      proc.stdin.write(JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: toolName, arguments: args },
      }) + '\n');
      continue;
    }

    if (msg.id === 2) {
      console.log(JSON.stringify(msg, null, 2));
      proc.kill();
      process.exit(0);
    }
  }
});

proc.on('close', (code) => {
  if (code !== 0) {
    process.exit(code || 1);
  }
});

proc.stdin.write(JSON.stringify({
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'local-mcp-tool-caller', version: '1.0.0' },
  },
}) + '\n');
